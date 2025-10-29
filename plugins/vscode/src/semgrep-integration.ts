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

// Database service instance for persisting Semgrep results
let dataService: DataService | null = null;

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
  filePath: string
): Promise<SemgrepResult | null> {
  try {
    const { stdout, stderr } = await execAsync(
      `carbonara semgrep "${filePath}" --output json`,
      {
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
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
  // Initialize database service for saving Semgrep results
  try {
    // Use workspace folder if available, otherwise use extension's global storage
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    let dbPath: string;

    if (workspaceFolder) {
      // Store in workspace root
      dbPath = path.join(workspaceFolder.uri.fsPath, "carbonara.db");
    } else {
      // No workspace open, use extension's global storage
      dbPath = path.join(context.globalStorageUri.fsPath, "carbonara.db");
      // Ensure directory exists
      if (!fs.existsSync(context.globalStorageUri.fsPath)) {
        fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true });
      }
    }

    dataService = new DataService({ dbPath });
    await dataService.initialize();
    console.log(`Database service initialized for Semgrep results at: ${dbPath}`);
  } catch (error) {
    console.error("Failed to initialize database service:", error);
    vscode.window.showWarningMessage(
      "Failed to initialize Semgrep database. Results will not be persisted."
    );
  }

  // Create diagnostics collection for Semgrep
  semgrepDiagnostics = vscode.languages.createDiagnosticCollection("semgrep");
  context.subscriptions.push(semgrepDiagnostics);

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

    const diagnostic = new vscode.Diagnostic(range, match.message, severity);
    diagnostic.source = "semgrep";
    diagnostic.code = match.rule_id;

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
  } = {}
): Promise<SemgrepResult | null> {
  const { showUI = false, outputChannel = null, useTempFile = true } = options;
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
          "Semgrep analysis failed. Check Output for details."
        );
      } else {
        console.log("Semgrep analysis failed:", result.errors);
      }
      return null;
    }

    // Apply diagnostics to the document
    applySemgrepDiagnostics(filePath, result.matches);

    // Save results to database (automatically enabled in VSCode extension)
    if (dataService && result.matches.length > 0) {
      try {
        // Convert file path to be relative to workspace if possible
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        let relativeFilePath = filePath;
        if (workspaceFolder) {
          relativeFilePath = vscode.workspace.asRelativePath(filePath, false);
        }

        await dataService.storeSemgrepResults(result.matches, relativeFilePath);
        console.log(
          `Saved ${result.matches.length} Semgrep findings to database for ${relativeFilePath}`
        );
      } catch (error) {
        console.error("Failed to save Semgrep results to database:", error);
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
            `Semgrep found ${result.stats.total_matches} issue(s). Underlines added to code.`,
            "View Output"
          )
          .then((selection) => {
            if (selection === "View Output" && outputChannel) {
              outputChannel.show();
            }
          });
      } else {
        vscode.window.showInformationMessage("Semgrep: No issues found!");
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
      vscode.window.showErrorMessage(
        `Semgrep analysis failed: ${errorMessage}`
      );
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
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No file is currently open");
    return;
  }

  const output = vscode.window.createOutputChannel("Carbonara Semgrep");

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Running Semgrep analysis...",
      cancellable: false,
    },
    async () => {
      await runSemgrepAnalysis(editor, {
        showUI: true,
        outputChannel: output,
        useTempFile: true,
      });
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

  // Delete old Semgrep results for this file from the database
  // since the code has changed and results are now stale
  if (dataService) {
    try {
      await dataService.deleteSemgrepResultsByFile(filePath);
      console.log(
        `Deleted stale Semgrep results for ${path.basename(filePath)}`
      );
    } catch (error) {
      console.error("Failed to delete stale Semgrep results:", error);
    }
  }

  // Find the editor for this document
  const editor = vscode.window.visibleTextEditors.find(
    (e) => e.document.uri.fsPath === filePath
  );

  if (editor) {
    console.log(
      `Code changed in ${path.basename(filePath)}, triggering Semgrep re-analysis`
    );
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

  // Only analyze files with supported extensions
  const filePath = editor.document.uri.fsPath;
  const fileExtension = path.extname(filePath);

  if (!SUPPORTED_SEMGREP_EXTENSIONS.includes(fileExtension)) {
    return;
  }

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
    console.log(
      `Running automatic Semgrep analysis on ${path.basename(filePath)}`
    );
    await runSemgrepAnalysis(editor, {
      showUI: false,
      useTempFile: true,
    });
  }, 500);
}

/**
 * Runs Semgrep analysis when a file is saved.
 * Only analyzes large files that are skipped by interactive linting.
 */
async function runSemgrepOnFileSave(editor: vscode.TextEditor) {
  // Only analyze files with supported extensions
  const filePath = editor.document.uri.fsPath;
  const fileExtension = path.extname(filePath);

  if (!SUPPORTED_SEMGREP_EXTENSIONS.includes(fileExtension)) {
    return;
  }

  // Check file size - only analyze large files on save
  try {
    const stats = fs.statSync(filePath);
    if (stats.size <= MAX_FILE_SIZE_FOR_INTERACTIVE_LINT) {
      // Small files are handled by interactive linting
      return;
    }

    console.log(
      `File ${path.basename(filePath)} is large (${stats.size} bytes), running Semgrep on save`
    );
  } catch (error) {
    console.error("Failed to check file size:", error);
    return;
  }

  // Run analysis (file is already saved, so we can analyze it directly)
  console.log(`Running Semgrep on save for ${path.basename(filePath)}`);
  await runSemgrepAnalysis(editor, {
    showUI: false,
    useTempFile: false,
  });
}
