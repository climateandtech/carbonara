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

const execAsync = promisify(exec);

// Database service instance for the Carbonara database (stores results from all tools including Semgrep)
let dataService: DataService | null = null;

// Callback to refresh the Data & Results tree when database updates
let onDatabaseUpdateCallback: (() => void) | null = null;

/**
 * Get the shared Carbonara DataService instance
 * Used by Semgrep and other tools to store results
 */
export function getSemgrepDataService(): DataService | null {
  return dataService;
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

  // Create diagnostics collection for Semgrep (if not already created)
  if (!semgrepDiagnostics) {
    semgrepDiagnostics = vscode.languages.createDiagnosticCollection("semgrep");
    context.subscriptions.push(semgrepDiagnostics);
  }

  // Set up automatic Semgrep analysis on file focus change
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
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

  // Run Semgrep on the currently active file when extension activates
  if (vscode.window.activeTextEditor) {
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
  // Convert Semgrep results to VSCode diagnostics
  const diagnostics: vscode.Diagnostic[] = matches.map((match) => {
    const range = new vscode.Range(
      match.start_line - 1,
      Math.max(0, match.start_column - 1),
      match.end_line - 1,
      Math.max(0, match.end_column - 1)
    );

    // Map Semgrep severity to VSCode diagnostic severity
    // ERROR (Critical) -> Warning (orange in most themes)
    // WARNING (Major) -> Information (blue/green in most themes)
    // INFO (Minor) -> Hint (subtle green in most themes)
    let severity: vscode.DiagnosticSeverity;
    if (match.severity === "ERROR") {
      severity = vscode.DiagnosticSeverity.Warning;
    } else if (match.severity === "WARNING") {
      severity = vscode.DiagnosticSeverity.Information;
    } else {
      severity = vscode.DiagnosticSeverity.Hint;
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
  semgrepDiagnostics.set(uri, diagnostics);

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
        if (showUI && outputChannel) {
          outputChannel.appendLine("Semgrep setup issues detected:");
          setup.errors.forEach((error) => {
            outputChannel.appendLine(`  • ${error}`);
          });
          outputChannel.show();
          vscode.window
            .showErrorMessage(
              "Semgrep is not properly configured. Check Output for details.",
              "View Output"
            )
            .then((selection) => {
              if (selection === "View Output") {
                outputChannel.show();
              }
            });
        } else {
          console.log("Semgrep setup is not valid, skipping analysis");
        }
        return null;
      }

      if (outputChannel) {
        outputChannel.appendLine("Running analysis...");
      }

      // Run analysis on the file
      result = await semgrep.analyzeFile(fileToAnalyze);
    }

    if (!result.success) {
      if (showUI && outputChannel) {
        outputChannel.appendLine("Analysis failed:");
        result.errors.forEach((error) => {
          outputChannel.appendLine(`  • ${error}`);
        });
        outputChannel.show();
        vscode.window.showErrorMessage(
          "Code scan failed. Check Output for details."
        );
      } else {
        console.log("Semgrep analysis failed:", result.errors);
      }
      return null;
    }

    // Apply diagnostics to the document
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

        // Delete old results for this file before inserting new ones
        await dataService.deleteSemgrepResultsByFile(relativeFilePath);

        // Store new results in Carbonara database (even if there are no matches, to record that the file was analyzed)
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

  const output = vscode.window.createOutputChannel("Carbonara Semgrep");

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Running Code scan",
      cancellable: false,
    },
    async () => {
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

  const output = vscode.window.createOutputChannel("Carbonara Semgrep");
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

          // Create Semgrep service instance
          const semgrep = createSemgrepService({
            useBundledPython: false,
            timeout: 300000, // 5 minutes for workspace scan
          });

          // Check setup before running
          output.appendLine("Checking Semgrep setup...");
          const setup = await semgrep.checkSetup();

          if (!setup.isValid) {
            output.appendLine("Semgrep setup issues detected:");
            setup.errors.forEach((error) => {
              output.appendLine(`  • ${error}`);
            });
            output.show();
            vscode.window
              .showErrorMessage(
                "Semgrep is not properly configured. Check Output for details.",
                "View Output"
              )
              .then((selection) => {
                if (selection === "View Output") {
                  output.show();
                }
              });
            return;
          }

          output.appendLine("Running workspace analysis...");
          result = await semgrep.analyzeDirectory(workspacePath);
        }

        if (!result.success) {
          output.appendLine("\nAnalysis failed:");
          result.errors.forEach((error) => {
            output.appendLine(`  • ${error}`);
          });
          output.show();
          vscode.window.showErrorMessage(
            "Semgrep workspace analysis failed. Check Output for details."
          );
          return;
        }

        // Apply diagnostics for all matches
        const fileGroups = new Map<string, SemgrepMatch[]>();
        for (const match of result.matches) {
          const matches = fileGroups.get(match.path) || [];
          matches.push(match);
          fileGroups.set(match.path, matches);
        }

        // Apply diagnostics to each file
        for (const [filePath, matches] of fileGroups.entries()) {
          const absolutePath = path.isAbsolute(filePath)
            ? filePath
            : path.join(workspacePath, filePath);
          applySemgrepDiagnostics(absolutePath, matches);
        }

        // Save results to database
        if (dataService) {
          try {
            // Group matches by file and save each file's results
            for (const [filePath, matches] of fileGroups.entries()) {
              const relativeFilePath = vscode.workspace.asRelativePath(
                path.isAbsolute(filePath)
                  ? filePath
                  : path.join(workspacePath, filePath),
                false
              );

              // Delete old results for this file
              await dataService.deleteSemgrepResultsByFile(relativeFilePath);

              // Calculate stats for this file
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
