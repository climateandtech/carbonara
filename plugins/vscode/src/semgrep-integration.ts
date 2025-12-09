/**
 * Semgrep Integration for VSCode Extension
 * 
 * NOTE: This integration is kept separate from the unified tool execution system
 * (tools-tree-provider.ts) due to fundamental differences in execution model:
 * 
 * 1. **Execution Model**: Semgrep performs file-based static analysis on local files,
 *    while other tools (GreenFrame, Impact Framework, etc.) perform URL-based dynamic
 *    analysis on web applications. These are fundamentally different use cases.
 * 
 * 2. **VSCode Integration**: Semgrep has deep VSCode integration that other tools don't need:
 *    - Real-time diagnostics (inline error/warning underlines in editor)
 *    - Automatic analysis on file focus, document changes, and file saves
 *    - Workspace-wide scanning
 *    - File-specific result management
 * 
 * 3. **Consolidation Assessment**:
 *    - **Effort**: Very High - would require refactoring CLI to support file-based analysis,
 *      creating a unified execution layer, and rewriting automatic analysis triggers
 *    - **Risk**: Very High - many special features (diagnostics, auto-analysis) could break
 *    - **Test Coverage**: Medium - existing e2e tests would need significant rewrites
 *    - **Benefit**: Low - semgrep's use case is fundamentally different from other tools
 * 
 * 4. **Error Handling**: This integration now uses the same error recording system
 *    (recordToolError/clearToolError) as other tools for consistent UI status display,
 *    while maintaining its specialized execution model.
 * 
 * TODO: Consider consolidation if/when:
 *    - Other file-based static analysis tools are added (would benefit from shared infrastructure)
 *    - The execution model can be unified without breaking semgrep's special features
 *    - The effort/risk ratio becomes more favorable
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { promisify } from "util";
import { exec } from "child_process";
import {
  createSemgrepService,
  DataService,
  type SemgrepMatch,
  type SemgrepResult,
} from "@carbonara/core";
import { getToolRegistry } from "@carbonara/cli/dist/registry/index.js";
import {
  checkToolPrerequisitesWithErrorHandling,
  recordToolErrorWithUI,
  clearToolErrorSilently,
  getWorkspacePath,
} from "./utils/tool-helpers.js";

const execAsync = promisify(exec);

// Database service instance for the Carbonara database (stores results from all tools including Semgrep)
let dataService: DataService | null = null;

// Callback to refresh the Data & Results tree when database updates
let onDatabaseUpdateCallback: (() => void) | null = null;

// Event emitter for semgrep results (after saving to database)
export interface SemgrepResultsEvent {
  filePath: string;
  matches: SemgrepMatch[];
  stats: {
    total_matches: number;
    error_count: number;
    warning_count: number;
    info_count: number;
    files_scanned: number;
  };
}

const semgrepResultsEventEmitter = new vscode.EventEmitter<SemgrepResultsEvent>();
export const onSemgrepResults = semgrepResultsEventEmitter.event;

/**
 * Get the shared Carbonara DataService instance
 * Used by Semgrep and other tools to store results
 */
export function getSemgrepDataService(): DataService | null {
  return dataService || null;
}

/**
 * Initialize or reinitialize the Carbonara database service
 * Call this when a Carbonara project is created or when config is detected
 */
export async function ensureDatabaseInitialized(
  workspacePath: string
): Promise<void> {
  try {
    // If database service already exists and points to the same path, skip
    const dbPath = path.join(workspacePath, ".carbonara", "carbonara.db");
    if (dataService && dataService.getDbPath() === dbPath) {
      console.log("Carbonara database already initialized at correct path");
      return;
    }

    // Close existing database if any
    if (dataService) {
      await dataService.close();
    }

    // Create DataService instance
    dataService = new DataService({ dbPath });

    // Only initialize if project is initialized (has config file)
    if (!dataService.isProjectInitialized()) {
      console.log(
        "Carbonara project not initialized yet. Skipping database initialization."
      );
      dataService = null;
      return;
    }

    // Initialize Carbonara database
    await dataService.initialize();
    console.log(`Carbonara database initialized at: ${dbPath}`);

    // Trigger refresh callback if set
    if (onDatabaseUpdateCallback) {
      onDatabaseUpdateCallback();
    }
  } catch (error) {
    console.error("Failed to initialize Carbonara database:", error);
    dataService = null;
    throw error;
  }
}

/**
 * Set a callback to be invoked when the Carbonara database is updated
 */
export function setOnDatabaseUpdateCallback(callback: () => void): void {
  onDatabaseUpdateCallback = callback;
}

// File size threshold for interactive linting (1MB)
// Files larger than this will only be linted on save
const MAX_FILE_SIZE_FOR_INTERACTIVE_LINT = 1024 * 1024; // 1MB in bytes

// Supported file extensions for Semgrep analysis
const SUPPORTED_SEMGREP_EXTENSIONS = [
  // JavaScript/TypeScript
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  // Python
  ".py",
  // JVM Languages
  ".java",
  ".kt",
  ".scala",
  // Go
  ".go",
  // Rust
  ".rs",
  // C/C++/C#
  ".c",
  ".cpp",
  ".cs",
  // Swift
  ".swift",
  // Ruby
  ".rb",
  // PHP/Hack
  ".php",
  ".hack",
  ".hh",
  // Elixir
  ".ex",
  ".exs",
  // Dart
  ".dart",
  // Shell
  ".sh",
  ".bash",
  // Web3/Smart Contracts
  ".sol",
  ".move",
  ".cairo",
  ".circom",
  // Functional Languages
  ".ml",
  ".mli",
  ".clj",
  ".cljs",
  ".cljc",
  ".edn",
  ".scm",
  ".ss",
  ".lisp",
  ".lsp",
  ".cl",
  // Scripting
  ".lua",
  ".jl",
  ".r",
  ".R",
  // Salesforce APEX
  ".cls",
  ".trigger",
  // Infrastructure as Code
  ".tf",
  ".tfvars",
  // Markup/Config
  ".html",
  ".htm",
  ".xml",
  ".yaml",
  ".yml",
  ".json",
  ".jsonnet",
  ".libsonnet",
  ".dockerfile",
];

// Diagnostics collection for Semgrep results
let semgrepDiagnostics: vscode.DiagnosticCollection;

// Debounce timer for automatic Semgrep analysis
let semgrepAnalysisTimer: NodeJS.Timeout | undefined;

// Track files with diagnostics and their line numbers for incremental analysis
const filesWithDiagnostics = new Map<string, Set<number>>();

// Cache for CLI availability check
let cliAvailable: boolean | null = null;

// Track the last focused valid code file
let lastValidEditor: vscode.TextEditor | undefined;

/**
 * Check if Python 3.7+ is installed
 */
async function checkPythonInstalled(): Promise<{ installed: boolean; version?: string; error?: string }> {
  try {
    // Try python3 first (Unix-like systems)
    const { stdout } = await execAsync("python3 --version", { timeout: 5000 });
    const versionMatch = stdout.match(/Python (\d+)\.(\d+)/);
    if (versionMatch) {
      const major = parseInt(versionMatch[1], 10);
      const minor = parseInt(versionMatch[2], 10);
      if (major > 3 || (major === 3 && minor >= 7)) {
        return { installed: true, version: stdout.trim() };
      }
      return { installed: false, error: `Python ${major}.${minor} found, but Python 3.7+ is required` };
    }
  } catch (error) {
    // Try python (Windows or some systems)
    try {
      const { stdout } = await execAsync("python --version", { timeout: 5000 });
      const versionMatch = stdout.match(/Python (\d+)\.(\d+)/);
      if (versionMatch) {
        const major = parseInt(versionMatch[1], 10);
        const minor = parseInt(versionMatch[2], 10);
        if (major > 3 || (major === 3 && minor >= 7)) {
          return { installed: true, version: stdout.trim() };
        }
        return { installed: false, error: `Python ${major}.${minor} found, but Python 3.7+ is required` };
      }
    } catch {
      // Python not found
    }
  }
  return { installed: false, error: "Python 3.7+ is not installed" };
}

/**
 * Check if semgrep is installed (using the same detection method as tools registry)
 */
async function checkSemgrepInstalled(): Promise<boolean> {
  try {
    await execAsync("python3 -m semgrep --version", { timeout: 5000 });
    return true;
  } catch {
    // Try with python (Windows)
    try {
      await execAsync("python -m semgrep --version", { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Show error message with installation instructions (consistent with other tools)
 */
function showSemgrepInstallationError(): void {
  const instructions = "Requires Python 3.7+. Install with: pip install semgrep";
  vscode.window.showErrorMessage(
    `Code Scan (semgrep) is not installed. ${instructions}`,
    "View Installation Instructions"
  ).then((selection) => {
    if (selection === "View Installation Instructions") {
      vscode.window.showInformationMessage(instructions);
    }
  });
}

/**
 * Check if the carbonara CLI is available
 */
async function checkCarbonaraCLI(): Promise<boolean> {
  // Return cached result if available
  if (cliAvailable !== null) {
    return cliAvailable;
  }

  try {
    const { stdout } = await execAsync("carbonara --version", {
      timeout: 5000,
    });
    cliAvailable = stdout.trim().length > 0;
    console.log(`Carbonara CLI detected: ${stdout.trim()}`);
    return cliAvailable;
  } catch (error) {
    console.log("Carbonara CLI not found, will use core library");
    cliAvailable = false;
    return false;
  }
}

/**
 * Run semgrep using the carbonara CLI
 */
async function runSemgrepViaCLI(
  filePath: string,
  options: {
    timeout?: number;
    maxBuffer?: number;
  } = {}
): Promise<SemgrepResult | null> {
  const timeout = options.timeout || 60000;
  const maxBuffer = options.maxBuffer || 10 * 1024 * 1024; // 10MB default

  try {
    const { stdout, stderr } = await execAsync(
      `carbonara semgrep "${filePath}" --output json`,
      {
        timeout,
        maxBuffer,
      }
    );

    if (stderr && stderr.trim().length > 0) {
      console.log("Semgrep CLI:", stderr);
    }

    // Parse JSON output
    const result = JSON.parse(stdout);
    return result as SemgrepResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to run semgrep via CLI:", errorMessage);
    return null;
  }
}

/**
 * Initialize the Semgrep integration
 */
export async function initializeSemgrep(
  context: vscode.ExtensionContext
): Promise<vscode.DiagnosticCollection> {
  // Initialize Carbonara database service if a project exists
  // The database stores results from Semgrep and other tools
  // Only initialize if a Carbonara project exists (has .carbonara/carbonara.config.json)
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (workspaceFolder) {
      // Try to initialize Carbonara database if project exists
      // This won't create the database if config doesn't exist
      await ensureDatabaseInitialized(workspaceFolder.uri.fsPath);
    } else {
      console.log(
        "No workspace folder open. Carbonara database will be initialized when a project is created."
      );
    }
  } catch (error) {
    console.error("Failed to initialize Carbonara database:", error);
    // Don't show warning to user - this is expected when no project is initialized
  }

  // Create diagnostics collection for Semgrep
  semgrepDiagnostics = vscode.languages.createDiagnosticCollection("semgrep");
  context.subscriptions.push(semgrepDiagnostics);

  // Subscribe to semgrep results events and update diagnostics
  context.subscriptions.push(
    onSemgrepResults((event) => {
      applySemgrepDiagnostics(event.filePath, event.matches);
    })
  );

  // Set up automatic Semgrep analysis on file focus change
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        // Always load diagnostics from database first (works even if semgrep not installed)
        loadDiagnosticsForFile(editor.document.uri.fsPath);
        // Then run analysis if semgrep is installed
        runSemgrepOnFileChange(editor);
      }
    })
  );

  // Set up incremental Semgrep analysis on document changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document && event.contentChanges.length > 0) {
        handleDocumentChange(event);
      }
    })
  );

  // Set up Semgrep analysis on file save for large files
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      const editor = vscode.window.visibleTextEditors.find(
        (e) => e.document === document
      );
      if (editor) {
        runSemgrepOnFileSave(editor);
      }
    })
  );

  // Load existing semgrep results from database and apply diagnostics
  // This allows diagnostics to appear even if semgrep isn't installed (using fixture data)
  // Load asynchronously after a short delay to ensure database is fully initialized
  if (dataService) {
    // Use a small delay to ensure database is ready
    setTimeout(async () => {
      if (dataService) {
        await loadDiagnosticsFromDatabase(dataService);
      }
    }, 2000);
  }

  // Load diagnostics for the currently active file when extension activates
  if (vscode.window.activeTextEditor) {
    // Always load diagnostics from database first (works even if semgrep not installed)
    loadDiagnosticsForFile(vscode.window.activeTextEditor.document.uri.fsPath);
    // Then run analysis if semgrep is installed
    runSemgrepOnFileChange(vscode.window.activeTextEditor);
  }

  // Clean up database connection when extension deactivates
  context.subscriptions.push({
    dispose: async () => {
      if (dataService) {
        await dataService.close();
        console.log("Database service closed");
      }
    },
  });

  return semgrepDiagnostics;
}

/**
 * Writes the content of an editor to a temporary file for analysis.
 * Returns the path to the temp file, which should be deleted after use.
 */
function writeEditorToTempFile(editor: vscode.TextEditor): string {
  const originalPath = editor.document.uri.fsPath;
  const ext = path.extname(originalPath);
  const basename = path.basename(originalPath, ext);
  const tempFile = path.join(
    os.tmpdir(),
    `semgrep-${Date.now()}-${basename}${ext}`
  );

  fs.writeFileSync(tempFile, editor.document.getText(), "utf-8");
  return tempFile;
}

/**
 * Converts Semgrep matches to VSCode diagnostics and applies them to a file.
 * Also tracks which lines have diagnostics for incremental re-analysis.
 */
function applySemgrepDiagnostics(
  filePath: string,
  matches: SemgrepMatch[]
): void {
  console.log(`[Semgrep] applySemgrepDiagnostics called for ${filePath} with ${matches.length} matches`);
  
  if (matches.length === 0) {
    console.log(`[Semgrep]   No matches to apply, clearing diagnostics for ${filePath}`);
    const uri = vscode.Uri.file(filePath);
    semgrepDiagnostics.set(uri, []);
    return;
  }
  
  // Convert Semgrep results to VSCode diagnostics
  const diagnostics: vscode.Diagnostic[] = matches.map((match) => {
    const range = new vscode.Range(
      match.start_line - 1,
      Math.max(0, match.start_column - 1),
      match.end_line - 1,
      Math.max(0, match.end_column - 1)
    );

    // Map Semgrep severity to VSCode diagnostic severity
    // ERROR (Critical) -> Error (red, shows in Problems, red markers/dots)
    // WARNING (Major) -> Warning (orange/yellow, shows in Problems)
    // INFO (Minor) -> Information (blue, shows in Problems)
    let severity: vscode.DiagnosticSeverity;
    if (match.severity === "ERROR") {
      severity = vscode.DiagnosticSeverity.Error;
    } else if (match.severity === "WARNING") {
      severity = vscode.DiagnosticSeverity.Warning;
    } else {
      severity = vscode.DiagnosticSeverity.Information;
    }

    // Extract just the rule name from the full rule_id path
    // e.g., "File.path.on.my.development.machine.rule-number-and-code" -> "rule-number-and-code"
    const ruleNameMatch = match.rule_id.match(/([^.]+)$/);
    const ruleName = ruleNameMatch ? ruleNameMatch[1] : match.rule_id;

    const diagnostic = new vscode.Diagnostic(range, match.message, severity);
    diagnostic.source = "Carbonara Code Scan";
    diagnostic.code = ruleName;

    return diagnostic;
  });

  // Apply diagnostics to the document
  const uri = vscode.Uri.file(filePath);
  console.log(`[Semgrep]   Setting ${diagnostics.length} diagnostics for URI: ${uri.fsPath}`);
  semgrepDiagnostics.set(uri, diagnostics);
  
  // Verify diagnostics were set
  const verifyDiagnostics = semgrepDiagnostics.get(uri);
  console.log(`[Semgrep]   Verification: ${verifyDiagnostics?.length || 0} diagnostics in collection after set`);

  // Track which lines have diagnostics for incremental re-analysis
  const lineSet = new Set<number>();
  diagnostics.forEach((diagnostic) => {
    for (
      let line = diagnostic.range.start.line;
      line <= diagnostic.range.end.line;
      line++
    ) {
      lineSet.add(line);
    }
  });
  filesWithDiagnostics.set(filePath, lineSet);
  console.log(`[Semgrep] ✅ Applied ${diagnostics.length} diagnostics to ${filePath}`);
}

/**
 * Core Semgrep analysis function that handles the actual analysis logic.
 * This is called by all three use-case functions with different options.
 */
async function runSemgrepAnalysis(
  editor: vscode.TextEditor,
  options: {
    showUI?: boolean;
    outputChannel?: vscode.OutputChannel;
    useTempFile?: boolean;
    saveToDatabase?: boolean;
  } = {}
): Promise<SemgrepResult | null> {
  const {
    showUI = false,
    outputChannel = null,
    useTempFile = true,
    saveToDatabase = false,
  } = options;
  const filePath = editor.document.uri.fsPath;
  let tempFile: string | null = null;

  try {
    // Determine the file to analyze
    const fileToAnalyze = useTempFile
      ? (tempFile = writeEditorToTempFile(editor))
      : filePath;

    if (outputChannel) {
      outputChannel.appendLine(
        `Running Semgrep on ${path.basename(filePath)}...`
      );
    }

    // Check if carbonara CLI is available
    const useCLI = await checkCarbonaraCLI();
    let result: SemgrepResult | null = null;
    let usedCLI = false;

    if (useCLI) {
      // Try using the CLI first
      if (outputChannel) {
        outputChannel.appendLine("Using carbonara CLI for analysis...");
      }
      result = await runSemgrepViaCLI(fileToAnalyze);
      if (result) {
        usedCLI = true;
      }
    }

    // Fall back to core library if CLI is not available or failed to execute
    if (!result) {
      if (useCLI && outputChannel) {
        outputChannel.appendLine("CLI failed, falling back to core library...");
      } else if (outputChannel) {
        outputChannel.appendLine("Using core library for analysis...");
      }

      // Check if semgrep is installed and handle auto-install if needed
      // NOTE: This check happens BEFORE running analysis, so if analysis is already running,
      // this check might be stale. We should check installation status more carefully.
      const registry = getToolRegistry();
      const tool = registry.getTool("semgrep");
      
      // Refresh tool installation status before checking
      await registry.refreshInstalledTools();
      const isInstalled = await registry.isToolInstalled("semgrep");
      
      console.log(`[Semgrep] Installation check: isInstalled=${isInstalled}, tool.autoInstall=${tool && (tool as any).autoInstall}`);

      // If not installed and tool has autoInstall flag, prompt user
      // Only show prompt for manual triggers (showUI=true), not automatic analysis
      if (!isInstalled && tool && (tool as any).autoInstall && options.showUI) {
        console.log(`[Semgrep] Semgrep not installed, showing auto-install prompt for manual trigger`);
        const installChoice = await vscode.window.showWarningMessage(
          "Semgrep is not installed. Would you like to install it now?",
          "Install Now",
          "Install Manually",
          "Cancel"
        );

        if (installChoice === "Install Now") {
          if (outputChannel) {
            outputChannel.appendLine("Installing Semgrep...");
            outputChannel.show();
          }

          try {
            const installSuccess = await vscode.window.withProgress(
              {
                location: vscode.ProgressLocation.Notification,
                title: "Installing Semgrep",
                cancellable: false,
              },
              async (progress) => {
                progress.report({ increment: 0, message: "Installing Semgrep via pip..." });
                const success = await registry.installTool("semgrep");
                progress.report({ increment: 100, message: "Installation complete" });
                return success;
              }
            );

            if (installSuccess) {
              if (outputChannel) {
                outputChannel.appendLine("✅ Semgrep installed successfully!");
              }
              if (showUI) {
                vscode.window.showInformationMessage("✅ Semgrep installed successfully!");
              }
            } else {
              if (outputChannel) {
                outputChannel.appendLine("❌ Semgrep installation failed. Please install manually.");
              }
              if (showUI) {
                vscode.window.showErrorMessage(
                  "Semgrep installation failed. Please install manually with: pip install semgrep"
                );
              }
              return null;
            }
          } catch (error: any) {
            if (outputChannel) {
              outputChannel.appendLine(`Installation error: ${error.message}`);
            }
            if (showUI) {
              vscode.window.showErrorMessage(
                `Failed to install Semgrep: ${error.message}`
              );
            }
            return null;
          }
        } else if (installChoice === "Install Manually") {
          const { showToolInstallationInstructions } = await import("./tool-installation-provider");
          await showToolInstallationInstructions("semgrep");
          return null;
        } else {
          // User cancelled
          return null;
        }
      }

      // Check prerequisites before creating service
      const prereqCheck = await checkToolPrerequisitesWithErrorHandling(
        "semgrep",
        "Semgrep",
        showUI,
        outputChannel
      );
      
      if (!prereqCheck) {
        return null;
      }

      /**
       * Note: We use useBundledPython: false and rely on system Python instead.
       * 
       * After investigation, we concluded that bundling Python with the extension was never
       * actually used in practice, and it presents several challenges:
       * - Size: A minimal Python 3.11.4 installation results in a .vsix file of ~60 MB,
       *   which increases further with additional packages like semgrep
       *   (source: https://stackoverflow.com/questions/70359755/how-to-bundle-python-code-with-vsix-vscode-extension)
       * - Platform compatibility: Different operating systems require distinct Python
       *   installations, complicating cross-platform distribution
       * - Performance: Larger extension sizes negatively impact load times and performance
       * 
       * The current approach of requiring Python 3.7+ as a prerequisite and using the system
       * Python installation aligns with standard practices for VSCode extensions and provides
       * a better user experience.
       */
      // Create Semgrep service instance
      const semgrep = createSemgrepService({
        useBundledPython: false,
        timeout: 60000,
      });

      // Check setup before running
      if (outputChannel) {
        outputChannel.appendLine("Checking Semgrep setup...");
      }
      const setup = await semgrep.checkSetup();

      if (!setup.isValid) {
        const errorMessage = setup.errors.join("; ");
        if (showUI && outputChannel) {
          outputChannel.appendLine("Semgrep setup issues detected:");
          setup.errors.forEach((error) => {
            outputChannel.appendLine(`  • ${error}`);
          });
        } else {
          console.log("Semgrep setup is not valid, skipping analysis");
        }
        
        await recordToolErrorWithUI(
          "semgrep",
          `Semgrep setup invalid: ${errorMessage}`,
          showUI,
          outputChannel
        );
        
        // If setup failed and detection passed, flag detection as failed
        const workspacePath = getWorkspacePath();
        if (workspacePath) {
          try {
            const { flagDetectionFailed } = await import("@carbonara/cli/dist/utils/config.js");
            await flagDetectionFailed("semgrep", workspacePath);
          } catch (configError) {
            console.error(`Failed to flag detection failure:`, configError);
          }
        }
        
        return null;
      }

      if (outputChannel) {
        outputChannel.appendLine("Running analysis...");
      }

      // Run analysis on the file
      result = await semgrep.analyzeFile(fileToAnalyze);
    }

    // Check if result has only parsing errors (non-fatal) vs real errors
    const hasOnlyParsingErrors = result.errors.every((e) => 
      e.includes("PartialParsing") || 
      e.includes("Syntax error") ||
      e.includes("Unknown language")
    );
    
    // If we have matches, treat parsing errors as warnings, not failures
    if (result.matches.length > 0 && hasOnlyParsingErrors) {
      // Success with parsing warnings - show warnings but proceed
      if (showUI && outputChannel) {
        outputChannel.appendLine("Analysis completed with parsing warnings:");
        result.errors.forEach((error) => {
          outputChannel.appendLine(`  ⚠️  ${error}`);
        });
        outputChannel.appendLine(`\n✓ Found ${result.stats.total_matches} issue(s) in code files.`);
      }
      // Don't record as error, just log warnings
      console.log("Semgrep analysis completed with parsing warnings:", result.errors);
    } else if (!result.success) {
      // Real failure - no matches or critical errors
      const errorMessage = result.errors.join("; ");
      if (showUI && outputChannel) {
        outputChannel.appendLine("Analysis failed:");
        result.errors.forEach((error) => {
          outputChannel.appendLine(`  • ${error}`);
        });
      } else {
        console.log("Semgrep analysis failed:", result.errors);
      }
      
      await recordToolErrorWithUI(
        "semgrep",
        `Analysis failed: ${errorMessage}`,
        showUI,
        outputChannel
      );
      
      // Check if error suggests tool is not actually installed (false positive detection)
      const suggestsNotInstalled = 
        errorMessage.includes("Semgrep is not installed") ||
        errorMessage.includes("not installed") ||
        errorMessage.includes("command not found") ||
        errorMessage.includes("Command not found") ||
        errorMessage.includes("ENOENT");
      
      // If tool was detected as installed but run failed with "not installed" error,
      // flag that detection was incorrect
      const workspacePath = getWorkspacePath();
      if (workspacePath && suggestsNotInstalled) {
        try {
          const { flagDetectionFailed } = await import("@carbonara/cli/dist/utils/config.js");
          await flagDetectionFailed("semgrep", workspacePath);
        } catch (configError) {
          console.error(`Failed to flag detection failure:`, configError);
        }
      }
      
      return null;
    }

    // Clear any previous errors since analysis succeeded
    await clearToolErrorSilently("semgrep");

    // Apply diagnostics immediately for instant feedback (before saving to database)
    applySemgrepDiagnostics(filePath, result.matches);

    // Save results to Carbonara database if saveToDatabase option is set
    if (dataService && saveToDatabase) {
      try {
        // Convert file path to be relative to workspace if possible
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        let relativeFilePath = filePath;
        if (workspaceFolder) {
          relativeFilePath = vscode.workspace.asRelativePath(filePath, false);
        }

        // Store new results in Carbonara database (even if there are no matches, to record that the file was analyzed)
        // Note: We no longer delete old results - we keep all runs and display the newest entry
        await dataService.storeSemgrepRun(
          result.matches,
          relativeFilePath,
          result.stats,
          undefined,
          "vscode"
        );

        if (result.matches.length > 0) {
          console.log(
            `Saved to Carbonara database: ${result.matches.length} Semgrep findings for ${relativeFilePath}`
          );
        } else {
          console.log(
            `Saved to Carbonara database: No Semgrep findings for ${relativeFilePath} (all clean!)`
          );
        }

        // Publish event with results (diagnostics already applied above, but event allows other listeners)
        semgrepResultsEventEmitter.fire({
          filePath: filePath,
          matches: result.matches,
          stats: result.stats,
        });

        // Trigger Data & Results tree refresh
        if (onDatabaseUpdateCallback) {
          onDatabaseUpdateCallback();
        }
      } catch (error) {
        console.error(
          "Failed to save Semgrep results to Carbonara database:",
          error
        );
      }
    }
    // Note: Diagnostics are always applied above (before saving) for immediate feedback

    // Display results
    if (outputChannel) {
      outputChannel.appendLine(
        `\nAnalysis complete! (via ${usedCLI ? "CLI" : "core library"})`
      );
      outputChannel.appendLine(`Files scanned: ${result.stats.files_scanned}`);
      outputChannel.appendLine(`Total findings: ${result.stats.total_matches}`);
      outputChannel.appendLine(`  Errors: ${result.stats.error_count}`);
      outputChannel.appendLine(`  Warnings: ${result.stats.warning_count}`);
      outputChannel.appendLine(`  Info: ${result.stats.info_count}`);

      if (result.matches.length > 0) {
        outputChannel.appendLine(`\nFindings:`);
        result.matches.forEach((match, index) => {
          outputChannel.appendLine(
            `\n${index + 1}. [${match.severity}] ${match.rule_id}`
          );
          outputChannel.appendLine(
            `   ${filePath}:${match.start_line}:${match.start_column}`
          );
          outputChannel.appendLine(`   ${match.message}`);
        });
      } else {
        outputChannel.appendLine("\n✓ No issues found!");
      }
    }

    if (showUI) {
      if (result.matches.length > 0) {
        vscode.window
          .showWarningMessage(
            `Code scan found ${result.stats.total_matches} issue(s). Underlines added to code.`,
            "View Output"
          )
          .then((selection) => {
            if (selection === "View Output" && outputChannel) {
              outputChannel.show();
            }
          });
      } else {
        vscode.window.showInformationMessage("Code scan: No issues found!");
      }
    } else {
      console.log(
        `Semgrep analysis complete (via ${usedCLI ? "CLI" : "core library"}): ${result.stats.total_matches} issue(s) found`
      );
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (showUI && outputChannel) {
      outputChannel.appendLine(`\nError: ${errorMessage}`);
      outputChannel.show();
      vscode.window.showErrorMessage(`Code scan failed: ${errorMessage}`);
    } else {
      console.log("Semgrep analysis error:", error);
    }
    return null;
  } finally {
    // Clean up temp file if created
    if (tempFile) {
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (cleanupError) {
        console.error("Failed to cleanup temp file:", cleanupError);
      }
    }
  }
}

/**
 * Run Semgrep analysis manually on the current file
 */
export async function runSemgrepOnFile() {
  let editor = vscode.window.activeTextEditor;

  // If the active editor is not a valid file (e.g., output channel), use the last valid editor
  if (editor && editor.document.uri.scheme !== "file") {
    editor = lastValidEditor;
  }

  if (!editor) {
    vscode.window.showErrorMessage("No code file is currently open");
    return;
  }

  // Check if the document is a real file
  const filePath = editor.document.uri.fsPath;
  if (!filePath || editor.document.uri.scheme !== "file") {
    vscode.window.showErrorMessage(
      "Cannot scan this type of document. Please open a code file."
    );
    return;
  }

  // Check if the file has a supported extension
  const fileExtension = path.extname(filePath);
  if (!SUPPORTED_SEMGREP_EXTENSIONS.includes(fileExtension)) {
    vscode.window.showErrorMessage(
      `Code scan does not support ${fileExtension} files. Supported extensions: ${SUPPORTED_SEMGREP_EXTENSIONS.slice(0, 10).join(", ")}...`
    );
    return;
  }

  const output = vscode.window.createOutputChannel("Code Scan");

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Running Code scan",
      cancellable: false,
    },
    async () => {
      if (!editor) {
        vscode.window.showErrorMessage("No code file is currently open");
        return;
      }
      await runSemgrepAnalysis(editor, {
        showUI: true,
        outputChannel: output,
        useTempFile: false,
        saveToDatabase: true, // Manual runs should save to database
      });
    }
  );
}

/**
 * Run Semgrep analysis on all files in the workspace
 */
export async function scanAllFiles() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace folder open");
    return;
  }

  const output = vscode.window.createOutputChannel("Code Scan");
  output.clear();

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Scanning all files in workspace...",
      cancellable: false,
    },
    async () => {
      try {
        const workspacePath = workspaceFolder.uri.fsPath;
        output.appendLine(`Analyzing workspace: ${workspacePath}`);
        output.appendLine(
          "This may take a few minutes for large projects...\n"
        );

        // Check if carbonara CLI is available
        const useCLI = await checkCarbonaraCLI();
        let result: SemgrepResult | null = null;

        if (useCLI) {
          output.appendLine("Using carbonara CLI for analysis...");
          result = await runSemgrepViaCLI(workspacePath, {
            timeout: 300000, // 5 minutes for workspace scan
            maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large workspaces
          });
        }

        // Fall back to core library if CLI is not available or failed
        if (!result) {
          if (useCLI) {
            output.appendLine("CLI failed, falling back to core library...");
          } else {
            output.appendLine("Using core library for analysis...");
          }

          // Check if semgrep is installed and handle auto-install if needed
          const registry = getToolRegistry();
          const tool = registry.getTool("semgrep");
          
          // Refresh tool installation status before checking (important for e2e tests where PATH changes)
          await registry.refreshInstalledTools();
          const isInstalled = await registry.isToolInstalled("semgrep");
          
          console.log(`[Semgrep] Workspace scan - Installation check: isInstalled=${isInstalled}, tool.autoInstall=${tool && (tool as any).autoInstall}`);

          // If not installed and tool has autoInstall flag, prompt user
          if (!isInstalled && tool && (tool as any).autoInstall) {
            const installChoice = await vscode.window.showWarningMessage(
              "Semgrep is not installed. Would you like to install it now?",
              "Install Now",
              "Install Manually",
              "Cancel"
            );

            if (installChoice === "Install Now") {
              output.appendLine("Installing Semgrep...");

              try {
                const installSuccess = await vscode.window.withProgress(
                  {
                    location: vscode.ProgressLocation.Notification,
                    title: "Installing Semgrep",
                    cancellable: false,
                  },
                  async (progress) => {
                    progress.report({ increment: 0, message: "Installing Semgrep via pip..." });
                    const success = await registry.installTool("semgrep");
                    progress.report({ increment: 100, message: "Installation complete" });
                    return success;
                  }
                );

                if (installSuccess) {
                  output.appendLine("✅ Semgrep installed successfully!");
                  vscode.window.showInformationMessage("✅ Semgrep installed successfully!");
                } else {
                  output.appendLine("❌ Semgrep installation failed. Please install manually.");
                  vscode.window.showErrorMessage(
                    "Semgrep installation failed. Please install manually with: pip install semgrep"
                  );
                  return;
                }
              } catch (error: any) {
                output.appendLine(`Installation error: ${error.message}`);
                vscode.window.showErrorMessage(
                  `Failed to install Semgrep: ${error.message}`
                );
                return;
              }
            } else if (installChoice === "Install Manually") {
              const { showToolInstallationInstructions } = await import("./tool-installation-provider");
              await showToolInstallationInstructions("semgrep");
              return;
            } else {
              // User cancelled
              return;
            }
          }

          // Check prerequisites before creating service
          const prereqCheck = await checkToolPrerequisitesWithErrorHandling(
            "semgrep",
            "Semgrep",
            true,
            output
          );
          
          if (!prereqCheck) {
            return;
          }

          /**
           * Note: We use useBundledPython: false and rely on system Python instead.
           * 
           * After investigation, we concluded that bundling Python with the extension was never
           * actually used in practice, and it presents several challenges:
           * - Size: A minimal Python 3.11.4 installation results in a .vsix file of ~60 MB,
           *   which increases further with additional packages like semgrep
           *   (source: https://stackoverflow.com/questions/70359755/how-to-bundle-python-code-with-vsix-vscode-extension)
           * - Platform compatibility: Different operating systems require distinct Python
           *   installations, complicating cross-platform distribution
           * - Performance: Larger extension sizes negatively impact load times and performance
           * 
           * The current approach of requiring Python 3.7+ as a prerequisite and using the system
           * Python installation aligns with standard practices for VSCode extensions and provides
           * a better user experience.
           */
          // Create Semgrep service instance
          const semgrep = createSemgrepService({
            useBundledPython: false,
            timeout: 300000, // 5 minutes for workspace scan
          });

          // Check setup before running
          output.appendLine("Checking Semgrep setup...");
          const setup = await semgrep.checkSetup();

          if (!setup.isValid) {
            const setupErrorMsg = setup.errors.join("; ");
            output.appendLine("Semgrep setup issues detected:");
            setup.errors.forEach((error) => {
              output.appendLine(`  • ${error}`);
            });
            
            await recordToolErrorWithUI(
              "semgrep",
              `Semgrep setup invalid: ${setupErrorMsg}`,
              true,
              output
            );
            
            // If setup failed and detection passed, flag detection as failed
            const workspacePath = getWorkspacePath();
            if (workspacePath) {
              try {
                const { flagDetectionFailed } = await import("@carbonara/cli/dist/utils/config.js");
                await flagDetectionFailed("semgrep", workspacePath);
              } catch (configError) {
                console.error(`Failed to flag detection failure:`, configError);
              }
            }
            
            return;
          }

          output.appendLine("Running workspace analysis...");
          result = await semgrep.analyzeDirectory(workspacePath);
        }

        // Check if result has only parsing errors (non-fatal) vs real errors
        const hasOnlyParsingErrors = result.errors.every((e) => 
          e.includes("PartialParsing") || 
          e.includes("Syntax error") ||
          e.includes("Unknown language")
        );
        
        // If we have matches, treat parsing errors as warnings, not failures
        if (result.matches.length > 0 && hasOnlyParsingErrors) {
          // Success with parsing warnings - show warnings but proceed
          output.appendLine("\nAnalysis completed with parsing warnings:");
          result.errors.forEach((error) => {
            output.appendLine(`  ⚠️  ${error}`);
          });
          output.appendLine(`\n✓ Found ${result.stats.total_matches} issue(s) in code files.`);
          // Don't record as error, just log warnings
          console.log("Semgrep workspace analysis completed with parsing warnings:", result.errors);
        } else if (!result.success) {
          // Real failure - no matches or critical errors
          const errorMessage = result.errors.join("; ");
          output.appendLine("\nAnalysis failed:");
          result.errors.forEach((error) => {
            output.appendLine(`  • ${error}`);
          });
          
          await recordToolErrorWithUI(
            "semgrep",
            `Workspace analysis failed: ${errorMessage}`,
            true,
            output
          );
          
          // Check if error suggests tool is not actually installed (false positive detection)
          const suggestsNotInstalled = 
            errorMessage.includes("Semgrep is not installed") ||
            errorMessage.includes("not installed") ||
            errorMessage.includes("command not found") ||
            errorMessage.includes("Command not found") ||
            errorMessage.includes("ENOENT");
          
          // If tool was detected as installed but run failed with "not installed" error,
          // flag that detection was incorrect
          const workspacePath = getWorkspacePath();
          if (workspacePath && suggestsNotInstalled) {
            try {
              const { flagDetectionFailed } = await import("@carbonara/cli/dist/utils/config.js");
              await flagDetectionFailed("semgrep", workspacePath);
            } catch (configError) {
              console.error(`Failed to flag detection failure:`, configError);
            }
          }
          
          return;
        }

        // Clear any previous errors since analysis succeeded
        await clearToolErrorSilently("semgrep");

        // Apply diagnostics for all matches
        const fileGroups = new Map<string, SemgrepMatch[]>();
        for (const match of result.matches) {
          const matches = fileGroups.get(match.path) || [];
          matches.push(match);
          fileGroups.set(match.path, matches);
        }

        // Save results to database and publish events
        if (dataService) {
          try {
            // Group matches by file and save each file's results
            for (const [filePath, matches] of fileGroups.entries()) {
              const absolutePath = path.isAbsolute(filePath)
                ? filePath
                : path.join(workspacePath, filePath);
              const relativeFilePath = vscode.workspace.asRelativePath(
                absolutePath,
                false
              );

              // Calculate stats for this file
              // Note: We no longer delete old results - we keep all runs and display the newest entry
              const fileStats = {
                total_matches: matches.length,
                error_count: matches.filter((m) => m.severity === "ERROR")
                  .length,
                warning_count: matches.filter((m) => m.severity === "WARNING")
                  .length,
                info_count: matches.filter((m) => m.severity === "INFO").length,
                files_scanned: 1,
              };

              // Store results for this file
              await dataService.storeSemgrepRun(
                matches,
                relativeFilePath,
                fileStats,
                undefined,
                "vscode"
              );

              // Publish event with results (diagnostics will be updated from this event)
              semgrepResultsEventEmitter.fire({
                filePath: absolutePath,
                matches: matches,
                stats: fileStats,
              });
            }

            // Trigger Data & Results tree refresh
            if (onDatabaseUpdateCallback) {
              onDatabaseUpdateCallback();
            }

            output.appendLine("\nResults saved to database");
          } catch (error) {
            output.appendLine(
              `\nWarning: Failed to save to database: ${error}`
            );
          }
        }

        // Display summary
        output.appendLine(`\n${"=".repeat(50)}`);
        output.appendLine("Workspace scan complete!");
        output.appendLine(`Files scanned: ${result.stats.files_scanned}`);
        output.appendLine(`Total findings: ${result.stats.total_matches}`);
        output.appendLine(`  Errors: ${result.stats.error_count}`);
        output.appendLine(`  Warnings: ${result.stats.warning_count}`);
        output.appendLine(`  Info: ${result.stats.info_count}`);

        vscode.window.showInformationMessage(
          `Workspace scan complete: ${result.stats.files_scanned} files scanned, ${result.stats.total_matches} findings`
        );
      } catch (error) {
        output.appendLine(`\nUnexpected error: ${error}`);
        output.show();
        vscode.window.showErrorMessage(
          `Semgrep workspace scan failed: ${error}`
        );
      }
    }
  );
}

/**
 * Load semgrep results from database and apply diagnostics for all files
 * This allows diagnostics to appear from fixture data or previous runs
 */
async function loadDiagnosticsFromDatabase(dataService: DataService): Promise<void> {
  console.log(`[Semgrep] loadDiagnosticsFromDatabase called`);
  
  try {
    const results = await dataService.getAllSemgrepResults();
    console.log(`[Semgrep]   Retrieved ${results.length} total results from database`);
    
    if (results.length === 0) {
      console.log(`[Semgrep]   No semgrep results found in database`);
      return;
    }
    
    // Group results by file path
    const resultsByFile = new Map<string, SemgrepMatch[]>();
    
    results.forEach((result) => {
      const filePath = result.file_path;
      if (!resultsByFile.has(filePath)) {
        resultsByFile.set(filePath, []);
      }
      
      // Convert database result to SemgrepMatch format
      const match: SemgrepMatch = {
        rule_id: result.rule_id,
        path: filePath,
        start_line: result.start_line,
        end_line: result.end_line,
        start_column: result.start_column,
        end_column: result.end_column,
        message: result.message || `Rule: ${result.rule_id}`, // Use message from database if available
        severity: result.severity,
        code_snippet: "",
      };
      
      resultsByFile.get(filePath)!.push(match);
    });
    
    console.log(`[Semgrep]   Grouped into ${resultsByFile.size} unique files`);
    
    // Apply diagnostics for each file
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    let appliedCount = 0;
    let skippedCount = 0;
    
    for (const [filePath, matches] of resultsByFile.entries()) {
      // Try to resolve absolute path
      let absolutePath = filePath;
      if (workspaceFolder && !path.isAbsolute(filePath)) {
        absolutePath = path.join(workspaceFolder.uri.fsPath, filePath);
      }
      
      console.log(`[Semgrep]   Processing file: ${filePath} -> ${absolutePath}`);
      console.log(`[Semgrep]     - Matches: ${matches.length}`);
      console.log(`[Semgrep]     - File exists: ${fs.existsSync(absolutePath)}`);
      
      // Only apply if file exists
      try {
        if (fs.existsSync(absolutePath)) {
          applySemgrepDiagnostics(absolutePath, matches);
          appliedCount++;
          console.log(`[Semgrep] ✅ Applied ${matches.length} diagnostics for ${absolutePath}`);
          
          // Verify diagnostics were set
          const uri = vscode.Uri.file(absolutePath);
          const appliedDiagnostics = semgrepDiagnostics.get(uri);
          console.log(`[Semgrep]     Verification: ${appliedDiagnostics?.length || 0} diagnostics in collection`);
        } else {
          skippedCount++;
          console.log(`[Semgrep] ⚠️ File not found: ${absolutePath} (from ${filePath})`);
        }
      } catch (error) {
        skippedCount++;
        console.log(`[Semgrep] ⚠️ Error processing file ${filePath}:`, error);
      }
    }
    
    console.log(`[Semgrep] ✅ loadDiagnosticsFromDatabase complete: ${appliedCount} files applied, ${skippedCount} skipped`);
  } catch (error) {
    console.error(`[Semgrep] ❌ Failed to load diagnostics from database:`, error);
    console.error(`[Semgrep]   Error details:`, error instanceof Error ? error.stack : String(error));
  }
}

/**
 * Load semgrep diagnostics for a specific file from database
 * This is called when a file is opened/focused to show existing diagnostics
 */
export async function loadDiagnosticsForFile(filePath: string): Promise<void> {
  console.log(`[Semgrep] loadDiagnosticsForFile called for: ${filePath}`);
  
  if (!dataService) {
    console.log(`[Semgrep] loadDiagnosticsForFile: dataService not available for ${filePath}`);
    return;
  }

  try {
    // Resolve absolute path if needed
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    let absolutePath = filePath;
    let relativePath = filePath;
    
    if (workspaceFolder) {
      absolutePath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(workspaceFolder.uri.fsPath, filePath);
      
      // Try to get relative path for database lookup
      relativePath = path.relative(workspaceFolder.uri.fsPath, absolutePath);
    }

    // Normalize paths (handle both forward and backward slashes)
    relativePath = relativePath.replace(/\\/g, "/");
    const fileName = path.basename(absolutePath);

    console.log(`[Semgrep] loadDiagnosticsForFile: Looking for diagnostics for ${fileName}`);
    console.log(`[Semgrep]   - absolutePath: ${absolutePath}`);
    console.log(`[Semgrep]   - relativePath: ${relativePath}`);
    console.log(`[Semgrep]   - fileName: ${fileName}`);
    console.log(`[Semgrep]   - workspaceFolder: ${workspaceFolder?.uri.fsPath}`);

    // Get results for this specific file - try multiple path formats
    let results = await dataService.getSemgrepResultsByFile(relativePath);
    console.log(`[Semgrep]   - Query with relativePath (${relativePath}): ${results.length} results`);
    
    if (results.length === 0) {
      // Try with just the filename
      results = await dataService.getSemgrepResultsByFile(fileName);
      console.log(`[Semgrep]   - Query with fileName (${fileName}): ${results.length} results`);
    }
    
    if (results.length === 0) {
      // Try with absolute path
      results = await dataService.getSemgrepResultsByFile(absolutePath);
      console.log(`[Semgrep]   - Query with absolutePath (${absolutePath}): ${results.length} results`);
    }
    
    if (results.length === 0) {
      // Try with normalized relative path (forward slashes)
      const normalizedRelative = relativePath.replace(/\\/g, "/");
      results = await dataService.getSemgrepResultsByFile(normalizedRelative);
      console.log(`[Semgrep]   - Query with normalizedRelative (${normalizedRelative}): ${results.length} results`);
    }

    if (results.length === 0) {
      console.log(`[Semgrep] ⚠️ No diagnostics found in database for ${filePath}`);
      console.log(`[Semgrep]   Tried paths: ${relativePath}, ${fileName}, ${absolutePath}`);
      
      // Debug: Check what's actually in the database
      try {
        const allResults = await dataService.getAllSemgrepResults();
        console.log(`[Semgrep]   Total semgrep results in database: ${allResults.length}`);
        if (allResults.length > 0) {
          const sampleResult = allResults[0];
          console.log(`[Semgrep]   Sample result file_path: "${sampleResult.file_path}"`);
          console.log(`[Semgrep]   Sample result rule_id: "${sampleResult.rule_id}"`);
        }
      } catch (dbError) {
        console.log(`[Semgrep]   Could not query all results: ${dbError}`);
      }
      return;
    }

    console.log(`[Semgrep] ✅ Found ${results.length} diagnostics in database for ${filePath}`);

    // Convert database results to SemgrepMatch format
    const matches: SemgrepMatch[] = results.map((result) => ({
      rule_id: result.rule_id,
      path: absolutePath,
      start_line: result.start_line,
      end_line: result.end_line,
      start_column: result.start_column,
      end_column: result.end_column,
      message: result.message || `Rule: ${result.rule_id}`,
      severity: result.severity,
      code_snippet: "",
    }));

    console.log(`[Semgrep]   Converted ${matches.length} matches, checking if file exists: ${absolutePath}`);
    console.log(`[Semgrep]   File exists: ${fs.existsSync(absolutePath)}`);

    // Only apply if file exists
    if (fs.existsSync(absolutePath)) {
      console.log(`[Semgrep]   Applying diagnostics to ${absolutePath}...`);
      applySemgrepDiagnostics(absolutePath, matches);
      console.log(`[Semgrep] ✅ Applied ${matches.length} diagnostics from database for ${absolutePath}`);
      
      // Verify diagnostics were actually set
      const uri = vscode.Uri.file(absolutePath);
      const appliedDiagnostics = semgrepDiagnostics.get(uri);
      console.log(`[Semgrep]   Verification: ${appliedDiagnostics?.length || 0} diagnostics in collection for this file`);
    } else {
      console.log(`[Semgrep] ⚠️ File not found: ${absolutePath}, skipping diagnostics`);
    }
  } catch (error: any) {
    // Log error for debugging
    console.error(`[Semgrep] ❌ Error loading diagnostics for ${filePath}:`, error.message);
    console.error(`[Semgrep]   Stack:`, error.stack);
  }
}

/**
 * Clear all Semgrep diagnostics
 */
export function clearSemgrepResults() {
  semgrepDiagnostics.clear();
  vscode.window.showInformationMessage("Semgrep results cleared");
}

/**
 * Handle document change events for incremental analysis
 */
async function handleDocumentChange(event: vscode.TextDocumentChangeEvent) {
  const filePath = event.document.uri.fsPath;

  // Only analyze files with supported extensions
  const fileExtension = path.extname(filePath);

  if (!SUPPORTED_SEMGREP_EXTENSIONS.includes(fileExtension)) {
    return;
  }

  // Find the editor for this document
  const editor = vscode.window.visibleTextEditors.find(
    (e) => e.document.uri.fsPath === filePath
  );

  if (editor) {
    console.log(
      `Code changed in ${path.basename(filePath)}, triggering Semgrep re-analysis`
    );
    // Re-run analysis with temp file (won't update database)
    runSemgrepOnFileChange(editor);
  }
}

/**
 * Run Semgrep analysis when file changes or focus changes
 */
async function runSemgrepOnFileChange(editor: vscode.TextEditor) {
  // Clear any pending analysis
  if (semgrepAnalysisTimer) {
    clearTimeout(semgrepAnalysisTimer);
  }

  // Skip if not a real file (e.g., output channels, virtual documents)
  if (editor.document.uri.scheme !== "file") {
    return;
  }

  // Only analyze files with supported extensions
  const filePath = editor.document.uri.fsPath;
  const fileExtension = path.extname(filePath);

  if (!SUPPORTED_SEMGREP_EXTENSIONS.includes(fileExtension)) {
    return;
  }

  // Track this as the last valid editor
  lastValidEditor = editor;

  // Check file size - skip interactive linting for large files
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_FILE_SIZE_FOR_INTERACTIVE_LINT) {
      console.log(
        `File ${path.basename(filePath)} is too large (${stats.size} bytes), skipping interactive linting`
      );
      return;
    }
  } catch (error) {
    console.error("Failed to check file size:", error);
    return;
  }

  // Debounce the analysis by 500ms to avoid running too frequently
  semgrepAnalysisTimer = setTimeout(async () => {
    // Check if semgrep is installed before running analysis
    // If not installed, skip silently (diagnostics will be loaded from database)
    try {
      const { getToolRegistry } = await import("@carbonara/cli/dist/registry/index.js");
      const registry = getToolRegistry();
      const isInstalled = await registry.isToolInstalled("semgrep");
      
      if (!isInstalled) {
        // Semgrep not installed - skip automatic analysis
        // Diagnostics will be loaded from database if available
        console.log(`Semgrep not installed, skipping automatic analysis for ${path.basename(filePath)}`);
        return;
      }
    } catch (error) {
      // If we can't check installation status, skip to avoid errors
      console.log(`Could not check semgrep installation status, skipping automatic analysis: ${error}`);
      return;
    }

    // Check if file has unsaved changes
    const hasUnsavedChanges = editor.document.isDirty;

    if (hasUnsavedChanges) {
      // File has unsaved changes - only show highlights, don't save to DB
      console.log(
        `Running Semgrep on unsaved changes for ${path.basename(filePath)} (highlights only)`
      );
      await runSemgrepAnalysis(editor, {
        showUI: false,
        useTempFile: true,
        saveToDatabase: false,
      });
    } else {
      // File was just opened or focus changed - save to database
      console.log(
        `Running Semgrep on opened file ${path.basename(filePath)} (saving to DB)`
      );
      await runSemgrepAnalysis(editor, {
        showUI: false,
        useTempFile: false,
        saveToDatabase: true,
      });
    }
  }, 500);
}

/**
 * Runs Semgrep analysis when a file is saved.
 * Always saves results to database.
 */
async function runSemgrepOnFileSave(editor: vscode.TextEditor) {
  // Only analyze files with supported extensions
  const filePath = editor.document.uri.fsPath;
  const fileExtension = path.extname(filePath);

  if (!SUPPORTED_SEMGREP_EXTENSIONS.includes(fileExtension)) {
    return;
  }

  // Always run analysis on save and update database
  console.log(
    `Running Semgrep on save for ${path.basename(filePath)} (saving to DB)`
  );
  await runSemgrepAnalysis(editor, {
    showUI: false,
    useTempFile: false,
    saveToDatabase: true, // Save to database when file is saved
  });
}
