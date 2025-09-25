// database-highlighter.ts
// This module reads data from the existing SQLite database and creates code highlights using VS Code API

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import initSqlJs, { Database } from "sql.js";

// Interface for highlight data that might be stored in assessment_data
interface CodeHighlight {
  file_path: string;
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  category?: string;
  source?: string;
}

// Interface matching the database structure from the CLI
interface AssessmentData {
  id: number;
  project_id: number;
  tool_name: string;
  data_type: string;
  data: any; // This will be parsed JSON
  timestamp: string;
  source?: string;
}

interface ProjectConfig {
  name: string;
  description: string;
  projectType: string;
  projectId: number;
  database: {
    path: string;
  };
}

export class DatabaseHighlighter {
  private db: Database | null = null;
  private SQL: any;
  private diagnosticCollection: vscode.DiagnosticCollection;
  private decorationTypes: Map<string, vscode.TextEditorDecorationType>;
  private activeDecorations: Map<string, vscode.DecorationOptions[]> =
    new Map();
  private dbPath: string = "";
  private projectId: number | null = null;

  constructor(context: vscode.ExtensionContext) {
    // Create diagnostic collection for problems panel
    this.diagnosticCollection =
      vscode.languages.createDiagnosticCollection("carbonara");
    context.subscriptions.push(this.diagnosticCollection);

    // Initialize decoration types for different severities
    this.decorationTypes = this.createDecorationTypes();

    // Register providers
    this.registerProviders(context);

    // Watch for active editor changes
    vscode.window.onDidChangeActiveTextEditor(
      (editor) => {
        if (editor) {
          this.updateHighlights(editor.document);
        }
      },
      null,
      context.subscriptions
    );

    // Watch for document changes
    vscode.workspace.onDidChangeTextDocument(
      (event) => {
        this.updateHighlights(event.document);
      },
      null,
      context.subscriptions
    );
  }

  private async loadProjectConfig(): Promise<ProjectConfig | null> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return null;
    }

    let currentPath = workspaceFolder.uri.fsPath;

    // Search up the directory tree for carbonara.config.json
    while (currentPath !== path.dirname(currentPath)) {
      const configPath = path.join(currentPath, "carbonara.config.json");

      if (fs.existsSync(configPath)) {
        try {
          const configContent = fs.readFileSync(configPath, "utf-8");
          const config = JSON.parse(configContent);
          return config as ProjectConfig;
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to parse config file: ${configPath}`
          );
          return null;
        }
      }

      currentPath = path.dirname(currentPath);
    }

    return null;
  }

  private findDatabasePath(): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return "";
    }

    // Look for database in the workspace root first
    const dbPath = path.join(workspaceFolder.uri.fsPath, "carbonara.db");
    if (fs.existsSync(dbPath)) {
      return dbPath;
    }

    // Check parent directories
    let currentPath = workspaceFolder.uri.fsPath;
    while (currentPath !== path.dirname(currentPath)) {
      const possibleDbPath = path.join(currentPath, "carbonara.db");
      if (fs.existsSync(possibleDbPath)) {
        return possibleDbPath;
      }
      currentPath = path.dirname(currentPath);
    }

    return "";
  }

  private createDecorationTypes(): Map<
    string,
    vscode.TextEditorDecorationType
  > {
    const types = new Map<string, vscode.TextEditorDecorationType>();

    // Error decoration (red underline + background)
    types.set(
      "error",
      vscode.window.createTextEditorDecorationType({
        backgroundColor: "rgba(255, 0, 0, 0.1)",
        borderColor: "rgba(255, 0, 0, 0.8)",
        borderStyle: "solid",
        borderWidth: "0 0 2px 0",
        overviewRulerColor: "rgba(255, 0, 0, 0.8)",
        overviewRulerLane: vscode.OverviewRulerLane.Right,
      })
    );

    // Warning decoration (yellow underline)
    types.set(
      "warning",
      vscode.window.createTextEditorDecorationType({
        backgroundColor: "rgba(255, 200, 0, 0.1)",
        borderColor: "rgba(255, 200, 0, 0.8)",
        borderStyle: "solid",
        borderWidth: "0 0 2px 0",
        overviewRulerColor: "rgba(255, 200, 0, 0.8)",
        overviewRulerLane: vscode.OverviewRulerLane.Center,
      })
    );

    // Info decoration (blue underline)
    types.set(
      "info",
      vscode.window.createTextEditorDecorationType({
        backgroundColor: "rgba(0, 150, 255, 0.1)",
        borderColor: "rgba(0, 150, 255, 0.8)",
        borderStyle: "solid",
        borderWidth: "0 0 1px 0",
        overviewRulerColor: "rgba(0, 150, 255, 0.8)",
        overviewRulerLane: vscode.OverviewRulerLane.Center,
      })
    );

    // Hint decoration (green underline) - for sustainability suggestions
    types.set(
      "hint",
      vscode.window.createTextEditorDecorationType({
        backgroundColor: "rgba(0, 255, 0, 0.05)",
        borderColor: "rgba(0, 255, 0, 0.5)",
        borderStyle: "dotted",
        borderWidth: "0 0 1px 0",
        overviewRulerColor: "rgba(0, 255, 0, 0.5)",
        overviewRulerLane: vscode.OverviewRulerLane.Left,
      })
    );

    return types;
  }

  private registerProviders(context: vscode.ExtensionContext) {
    // Register hover provider for all languages
    const hoverProvider = vscode.languages.registerHoverProvider(
      { scheme: "file" },
      {
        provideHover: (document, position) =>
          this.provideHover(document, position),
      }
    );
    context.subscriptions.push(hoverProvider);

    // Register code action provider
    const codeActionProvider = vscode.languages.registerCodeActionsProvider(
      { scheme: "file" },
      {
        provideCodeActions: (document, range, context) =>
          this.provideCodeActions(document, range, context),
      }
    );
    context.subscriptions.push(codeActionProvider);
  }

  public async initialize(): Promise<void> {
    // First load the project config to get projectId
    const config = await this.loadProjectConfig();
    if (!config) {
      console.log("No carbonara.config.json found");
      return;
    }

    this.projectId = config.projectId;

    // Use database path from config if available, otherwise search for it
    if (config.database?.path && fs.existsSync(config.database.path)) {
      this.dbPath = config.database.path;
    } else {
      this.dbPath = this.findDatabasePath();
    }

    if (!this.dbPath || !fs.existsSync(this.dbPath)) {
      console.log(`Database not found at ${this.dbPath}`);
      return;
    }

    try {
      if (!this.SQL) {
        // Configure the WASM file location
        const wasmPath = path.join(__dirname, 'sql-wasm.wasm');
        
        // Initialize sql.js with the correct WASM file path
        this.SQL = await initSqlJs({
          locateFile: (file: string) => {
            if (file === 'sql-wasm.wasm') {
              return wasmPath;
            }
            return file;
          }
        });
      }
      const dbFile = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(dbFile);
      console.log(`Connected to database at ${this.dbPath}`);
    } catch (err) {
      console.error(`Failed to open database: ${(err as Error).message}`);
      // Don't throw, just continue without database
    }
  }

  public async loadAssessmentData(): Promise<AssessmentData[]> {
    if (!this.db || !this.projectId) {
      return [];
    }

    try {
      // Query assessment_data table for this project
      const query = `
                SELECT * FROM assessment_data 
                WHERE project_id = ? 
                ORDER BY timestamp DESC
            `;

      const stmt = this.db.prepare(query);
      stmt.bind([this.projectId]);

      const rows: any[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();

      const assessmentData: AssessmentData[] = rows.map((row) => ({
        ...row,
        data: typeof row.data === "string" ? JSON.parse(row.data) : row.data,
      }));

      return assessmentData;
    } catch (err) {
      console.error(
        `Failed to load assessment data: ${(err as Error).message}`
      );
      return [];
    }
  }

  private extractHighlightsFromAssessmentData(
    assessmentData: AssessmentData[]
  ): CodeHighlight[] {
    const highlights: CodeHighlight[] = [];

    for (const assessment of assessmentData) {
      // Check if this assessment contains code highlight data
      // This depends on how your assessment tools store the data

      if (
        assessment.tool_name === "code_analysis" ||
        assessment.data_type === "code_highlights"
      ) {
        // Extract highlights from the data object
        if (
          assessment.data.highlights &&
          Array.isArray(assessment.data.highlights)
        ) {
          for (const highlight of assessment.data.highlights) {
            highlights.push({
              file_path: highlight.file_path || highlight.file,
              start_line: highlight.start_line || highlight.line || 1,
              start_column: highlight.start_column || highlight.column || 1,
              end_line:
                highlight.end_line ||
                highlight.start_line ||
                highlight.line ||
                1,
              end_column:
                highlight.end_column ||
                highlight.start_column ||
                highlight.column ||
                1,
              severity: this.mapSeverity(
                highlight.severity || highlight.level || "info"
              ),
              message:
                highlight.message ||
                highlight.description ||
                "Carbonara analysis",
              category: highlight.category || assessment.tool_name,
              source: assessment.source,
            });
          }
        }
      }

      // Handle CO2 assessment results that might have file-specific issues
      if (
        assessment.tool_name === "assessment" &&
        assessment.data.fileAnalysis
      ) {
        for (const fileAnalysis of assessment.data.fileAnalysis) {
          if (fileAnalysis.issues) {
            for (const issue of fileAnalysis.issues) {
              highlights.push({
                file_path: fileAnalysis.file,
                start_line: issue.line || 1,
                start_column: issue.column || 1,
                end_line: issue.endLine || issue.line || 1,
                end_column: issue.endColumn || issue.column || 1,
                severity: this.mapSeverity(issue.severity || "info"),
                message: `CO2 Impact: ${issue.message || "Consider optimizing this code for lower emissions"}`,
                category: "co2-assessment",
                source: "carbonara-assessment",
              });
            }
          }
        }
      }
    }

    return highlights;
  }

  private mapSeverity(severity: string): "error" | "warning" | "info" | "hint" {
    const severityMap: Record<string, "error" | "warning" | "info" | "hint"> = {
      error: "error",
      warning: "warning",
      info: "info",
      hint: "hint",
      suggestion: "hint",
      high: "error",
      medium: "warning",
      low: "info",
      trivial: "hint",
    };

    return severityMap[severity.toLowerCase()] || "info";
  }

  private async updateHighlights(document: vscode.TextDocument): Promise<void> {
    const assessmentData = await this.loadAssessmentData();
    const highlights = this.extractHighlightsFromAssessmentData(assessmentData);

    const documentPath = document.uri.fsPath;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    // Filter highlights for current document
    const documentHighlights = highlights.filter((h) => {
      if (!h.file_path) {
        return false;
      }
      const highlightPath = path.isAbsolute(h.file_path)
        ? h.file_path
        : path.join(workspaceFolder?.uri.fsPath || "", h.file_path);
      return highlightPath === documentPath;
    });

    // Clear existing decorations
    this.clearDecorations();

    // Group highlights by severity
    const highlightsBySeverity = new Map<string, vscode.DecorationOptions[]>();
    const diagnostics: vscode.Diagnostic[] = [];

    for (const highlight of documentHighlights) {
      // Create range (VSCode uses 0-based indexing)
      const range = new vscode.Range(
        new vscode.Position(
          Math.max(0, highlight.start_line - 1),
          Math.max(0, highlight.start_column - 1)
        ),
        new vscode.Position(
          Math.max(0, highlight.end_line - 1),
          Math.max(0, highlight.end_column - 1)
        )
      );

      // Create decoration
      const decoration: vscode.DecorationOptions = {
        range,
        hoverMessage: new vscode.MarkdownString(
          `**${highlight.severity.toUpperCase()}**: ${highlight.message}`
        ),
      };

      if (!highlightsBySeverity.has(highlight.severity)) {
        highlightsBySeverity.set(highlight.severity, []);
      }
      highlightsBySeverity.get(highlight.severity)!.push(decoration);

      // Create diagnostic for problems panel
      const diagnostic = new vscode.Diagnostic(
        range,
        highlight.message,
        this.severityToVSCode(highlight.severity)
      );
      diagnostic.source = "carbonara";
      if (highlight.category) {
        diagnostic.code = highlight.category;
      }
      diagnostics.push(diagnostic);
    }

    // Apply decorations
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document === document) {
      for (const [severity, decorations] of highlightsBySeverity) {
        const decorationType = this.decorationTypes.get(severity);
        if (decorationType) {
          activeEditor.setDecorations(decorationType, decorations);
          this.activeDecorations.set(severity, decorations);
        }
      }
    }

    // Update diagnostics
    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  private clearDecorations(): void {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      for (const decorationType of this.decorationTypes.values()) {
        activeEditor.setDecorations(decorationType, []);
      }
    }
    this.activeDecorations.clear();
  }

  private severityToVSCode(severity: string): vscode.DiagnosticSeverity {
    switch (severity) {
      case "error":
        return vscode.DiagnosticSeverity.Error;
      case "warning":
        return vscode.DiagnosticSeverity.Warning;
      case "info":
        return vscode.DiagnosticSeverity.Information;
      case "hint":
        return vscode.DiagnosticSeverity.Hint;
      default:
        return vscode.DiagnosticSeverity.Information;
    }
  }

  private async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | undefined> {
    const assessmentData = await this.loadAssessmentData();
    const highlights = this.extractHighlightsFromAssessmentData(assessmentData);
    const documentPath = document.uri.fsPath;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    for (const highlight of highlights) {
      const highlightPath = path.isAbsolute(highlight.file_path)
        ? highlight.file_path
        : path.join(workspaceFolder?.uri.fsPath || "", highlight.file_path);

      if (highlightPath === documentPath) {
        const range = new vscode.Range(
          new vscode.Position(
            Math.max(0, highlight.start_line - 1),
            Math.max(0, highlight.start_column - 1)
          ),
          new vscode.Position(
            Math.max(0, highlight.end_line - 1),
            Math.max(0, highlight.end_column - 1)
          )
        );

        if (range.contains(position)) {
          const contents = new vscode.MarkdownString();
          contents.appendMarkdown(
            `**🌱 Carbonara ${highlight.severity.toUpperCase()}**

`
          );
          contents.appendMarkdown(`${highlight.message}

`);

          if (highlight.category) {
            contents.appendMarkdown(`*Category*: ${highlight.category}

`);
          }

          if (highlight.source) {
            contents.appendMarkdown(`*Source*: ${highlight.source}
`);
          }

          return new vscode.Hover(contents, range);
        }
      }
    }

    return undefined;
  }

  private async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext
  ): Promise<vscode.CodeAction[]> {
    const actions: vscode.CodeAction[] = [];

    // Get diagnostics in range
    const diagnostics = context.diagnostics.filter(
      (d) => d.source === "carbonara"
    );

    for (const diagnostic of diagnostics) {
      // View details action
      const viewAction = new vscode.CodeAction(
        `View Carbonara Analysis Details`,
        vscode.CodeActionKind.QuickFix
      );
      viewAction.diagnostics = [diagnostic];
      viewAction.command = {
        title: "View Details",
        command: "carbonara.viewHighlightDetails",
        arguments: [diagnostic],
      };
      actions.push(viewAction);

      // Refresh data action
      const refreshAction = new vscode.CodeAction(
        `Refresh Carbonara Data`,
        vscode.CodeActionKind.QuickFix
      );
      refreshAction.diagnostics = [diagnostic];
      refreshAction.command = {
        title: "Refresh",
        command: "carbonara.refreshHighlights",
      };
      actions.push(refreshAction);
    }

    return actions;
  }

  public async refresh(): Promise<void> {
    // Re-initialize to pick up any database changes
    await this.initialize();

    // Update highlights for active editor
    if (vscode.window.activeTextEditor) {
      await this.updateHighlights(vscode.window.activeTextEditor.document);
    }

    // Update all open text documents
    for (const document of vscode.workspace.textDocuments) {
      if (document.uri.scheme === "file") {
        await this.updateHighlights(document);
      }
    }
  }

  public dispose(): void {
    this.clearDecorations();
    this.diagnosticCollection.dispose();

    for (const decorationType of this.decorationTypes.values()) {
      decorationType.dispose();
    }

    if (this.db) {
      this.db.close();
    }
  }
}

// Command registration helper
export function registerHighlightCommands(
  context: vscode.ExtensionContext,
  highlighter: DatabaseHighlighter
) {
  // Refresh highlights command
  const refreshCommand = vscode.commands.registerCommand(
    "carbonara.refreshHighlights",
    async () => {
      await highlighter.refresh();
      vscode.window.showInformationMessage("Carbonara highlights refreshed");
    }
  );

  // View highlight details command
  const viewDetailsCommand = vscode.commands.registerCommand(
    "carbonara.viewHighlightDetails",
    (diagnostic: vscode.Diagnostic) => {
      const panel = vscode.window.createWebviewPanel(
        "carbonaraDetails",
        "Carbonara Analysis Details",
        vscode.ViewColumn.Beside,
        {}
      );

      panel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: var(--vscode-font-family); padding: 20px; }
                    h1 { color: var(--vscode-editor-foreground); }
                    .severity { font-weight: bold; }
                    .message { margin: 20px 0; }
                    .code { background: var(--vscode-editor-background); padding: 10px; border-radius: 4px; }
                </style>
            </head>
            <body>
                <h1>🌱 Carbonara Analysis</h1>
                <div class="severity">Severity: ${diagnostic.severity === 0 ? "Error" : diagnostic.severity === 1 ? "Warning" : "Info"}</div>
                <div class="message">${diagnostic.message}</div>
                ${diagnostic.code ? `<div>Category: ${diagnostic.code}</div>` : ""}
                <div>Source: ${diagnostic.source}</div>
            </body>
            </html>
        `;
    }
  );

  // Clear highlights command (for debugging)
  const clearCommand = vscode.commands.registerCommand(
    "carbonara.clearHighlights",
    () => {
      highlighter["clearDecorations"]();
      highlighter["diagnosticCollection"].clear();
      vscode.window.showInformationMessage("Carbonara highlights cleared");
    }
  );

  context.subscriptions.push(refreshCommand, viewDetailsCommand, clearCommand);
}
