// unified-highlighter.ts
// Unified system for running analysis tools and displaying results

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import initSqlJs, { Database } from "sql.js";
import { spawn } from 'child_process';
import { mapFindingToCategory } from '../../packages/cli/src/parsers/category-mapping.js';

// Interface for highlight data
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

// Interface matching the database structure
interface AssessmentData {
  id: number;
  project_id: number;
  tool_name: string;
  data_type: string;
  data: any;
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

export class UnifiedHighlighter {
  private context: vscode.ExtensionContext;
  private db: Database | null = null;
  private SQL: any;
  private diagnosticCollection: vscode.DiagnosticCollection;
  private decorationTypes: Map<string, vscode.TextEditorDecorationType>;
  private activeDecorations: Map<string, vscode.DecorationOptions[]> = new Map();
  private dbPath: string = "";
  private projectId: number | null = null;
  private storeToDatabase: boolean = true;
  private activeAnalyses: Map<string, any> = new Map();

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    
    // Create diagnostic collection for problems panel
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection("carbonara");
    context.subscriptions.push(this.diagnosticCollection);

    // Initialize decoration types for different severities
    this.initializeDecorationTypes();
  }

  async initialize(): Promise<void> {
    await this.initializeDatabase();
    
    // Listen for document changes to trigger analysis
    vscode.workspace.onDidSaveTextDocument((document) => {
      this.runAnalysis(document);
    });

    // Listen for active editor changes
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        this.runAnalysis(editor.document);
      }
    });
  }

  private initializeDecorationTypes(): void {
    this.decorationTypes = new Map([
      ['error', vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor('errorBackground'),
        border: '2px solid',
        borderColor: new vscode.ThemeColor('errorBorder'),
        overviewRulerColor: new vscode.ThemeColor('errorForeground'),
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        light: {
          backgroundColor: 'rgba(255, 0, 0, 0.1)',
          borderColor: 'rgba(255, 0, 0, 0.3)'
        },
        dark: {
          backgroundColor: 'rgba(255, 0, 0, 0.1)',
          borderColor: 'rgba(255, 0, 0, 0.3)'
        }
      })],
      ['warning', vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor('warningBackground'),
        border: '2px solid',
        borderColor: new vscode.ThemeColor('warningBorder'),
        overviewRulerColor: new vscode.ThemeColor('warningForeground'),
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        light: {
          backgroundColor: 'rgba(255, 165, 0, 0.1)',
          borderColor: 'rgba(255, 165, 0, 0.3)'
        },
        dark: {
          backgroundColor: 'rgba(255, 165, 0, 0.1)',
          borderColor: 'rgba(255, 165, 0, 0.3)'
        }
      })],
      ['info', vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor('infoBackground'),
        border: '2px solid',
        borderColor: new vscode.ThemeColor('infoBorder'),
        overviewRulerColor: new vscode.ThemeColor('infoForeground'),
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        light: {
          backgroundColor: 'rgba(0, 0, 255, 0.1)',
          borderColor: 'rgba(0, 0, 255, 0.3)'
        },
        dark: {
          backgroundColor: 'rgba(0, 0, 255, 0.1)',
          borderColor: 'rgba(0, 0, 255, 0.3)'
        }
      })],
      ['hint', vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor('editorHint.background'),
        border: '1px solid',
        borderColor: new vscode.ThemeColor('editorHint.foreground'),
        overviewRulerColor: new vscode.ThemeColor('editorHint.foreground'),
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        light: {
          backgroundColor: 'rgba(0, 255, 0, 0.1)',
          borderColor: 'rgba(0, 255, 0, 0.3)'
        },
        dark: {
          backgroundColor: 'rgba(0, 255, 0, 0.1)',
          borderColor: 'rgba(0, 255, 0, 0.3)'
        }
      })]
    ]);

    // Add to subscriptions for cleanup
    this.decorationTypes.forEach(decorationType => {
      this.context.subscriptions.push(decorationType);
    });
  }

  private async initializeDatabase(): Promise<void> {
    try {
      this.SQL = await initSqlJs();
      
      // Find project config and database
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) return;

      const configPath = path.join(workspaceFolder.uri.fsPath, 'carbonara.config.json');
      if (!fs.existsSync(configPath)) return;

      const configContent = fs.readFileSync(configPath, 'utf-8');
      const config: ProjectConfig = JSON.parse(configContent);
      this.projectId = config.projectId;

      // Find database file
      const possibleDbPaths = [
        path.join(workspaceFolder.uri.fsPath, 'carbonara.db'),
        path.join(workspaceFolder.uri.fsPath, '.carbonara', 'carbonara.db'),
        config.database?.path
      ].filter(Boolean);

      for (const dbPath of possibleDbPaths) {
        if (fs.existsSync(dbPath)) {
          this.dbPath = dbPath;
          break;
        }
      }

      if (this.dbPath) {
        const dbBuffer = fs.readFileSync(this.dbPath);
        this.db = new this.SQL.Database(dbBuffer);
        console.log('✅ Database initialized for unified highlighter');
      }
    } catch (error) {
      console.error('Failed to initialize database:', error);
    }
  }

  // ANALYSIS LAYER: Run linters and optionally store to database
  async runAnalysis(document: vscode.TextDocument): Promise<void> {
    if (!this.isSupportedFile(document)) {
      return;
    }

    const filePath = document.uri.fsPath;
    const toolId = this.detectToolForFile(document);

    if (!toolId) {
      return;
    }

    // Cancel any existing analysis for this file
    const existingAnalysis = this.activeAnalyses.get(filePath);
    if (existingAnalysis) {
      existingAnalysis.kill();
    }

    // Run analysis
    await this.runToolAnalysis(toolId, filePath);
  }

  private isSupportedFile(document: vscode.TextDocument): boolean {
    const supportedExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rb', '.php'];
    const fileExtension = path.extname(document.fileName).toLowerCase();
    return supportedExtensions.includes(fileExtension);
  }

  private detectToolForFile(document: vscode.TextDocument): string | null {
    const fileExtension = path.extname(document.fileName).toLowerCase();
    
    if (['.js', '.ts', '.jsx', '.tsx'].includes(fileExtension)) {
      return 'semgrep'; // Default to semgrep for JS/TS files
    }
    
    return null;
  }

  private async runToolAnalysis(toolId: string, filePath: string): Promise<void> {
    const output = vscode.window.createOutputChannel(`Carbonara ${toolId}`);
    
    try {
      let child: any;
      
      if (toolId === 'semgrep') {
        child = spawn('semgrep', ['--config', 'auto', '--json', filePath], { stdio: 'pipe' });
      } else if (toolId === 'eslint') {
        child = spawn('npx', ['eslint', '--format', 'json', filePath], { stdio: 'pipe' });
      } else {
        output.appendLine(`Tool ${toolId} not supported for analysis`);
        return;
      }

      this.activeAnalyses.set(filePath, child);

      let stdoutData = '';
      let stderrData = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdoutData += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderrData += data.toString();
      });

      child.on('close', async (code: number) => {
        this.activeAnalyses.delete(filePath);
        
        if (code === 0 || stdoutData) {
          try {
            const result = JSON.parse(stdoutData);
            
            // Store to database if enabled
            if (this.storeToDatabase) {
              await this.storeAnalysisResults(toolId, filePath, result);
            }
            
            // Display results (from database if stored, or directly if not)
            await this.displayResults(toolId, filePath);
            
            output.appendLine(`✅ ${toolId} analysis complete`);
          } catch (error) {
            output.appendLine(`❌ Error parsing ${toolId} results: ${error}`);
          }
        } else {
          output.appendLine(`❌ ${toolId} analysis failed with exit code ${code}`);
          if (stderrData) {
            output.appendLine(stderrData);
          }
        }
      });

    } catch (error) {
      output.appendLine(`❌ Failed to run ${toolId}: ${error}`);
    }
  }

  private async storeAnalysisResults(toolId: string, filePath: string, rawResult: any): Promise<void> {
    try {
      // Import the CLI's database functionality
      const { createDataLake } = await import('../../packages/cli/src/database/index.js');
      const { loadProjectConfig } = await import('../../packages/cli/src/utils/config.js');
      const { parseToolResults } = await import('../../packages/cli/src/parsers/index.js');

      const config = await loadProjectConfig();
      if (!config?.projectId) {
        console.log('No project found, skipping database save');
        return;
      }

      const dataLake = createDataLake();
      await dataLake.initialize();

      // Parse results into standardized format
      const standardizedResult = parseToolResults(toolId, rawResult, filePath);

      const assessmentData = {
        target: filePath,
        raw_results: JSON.stringify(rawResult),
        timestamp: new Date().toISOString(),
        ...rawResult,
        findings: standardizedResult.findings,
        stats: standardizedResult.stats,
        metadata: standardizedResult.metadata
      };

      await dataLake.storeAssessmentData(config.projectId, toolId, 'code-analysis', assessmentData, filePath);
      await dataLake.close();

      console.log(`✅ ${toolId} results saved to database`);
    } catch (error) {
      console.error(`❌ Failed to save ${toolId} results to database:`, error);
    }
  }

  // DISPLAY LAYER: Show results from database
  private async displayResults(toolId: string, filePath: string): Promise<void> {
    if (this.storeToDatabase && this.db) {
      // Display from database
      await this.updateHighlightsFromDatabase();
    } else {
      // Display directly from analysis results (temporary)
      // This would require storing the last analysis results
      console.log('Temporary display mode - results not persisted');
    }
  }

  private async updateHighlightsFromDatabase(): Promise<void> {
    if (!this.db || !this.projectId) return;

    try {
      const assessmentData = await this.loadAssessmentData();
      const highlights = this.extractHighlightsFromAssessmentData(assessmentData);
      
      // Update highlights for all open documents
      const openDocuments = vscode.workspace.textDocuments;
      for (const document of openDocuments) {
        await this.updateDocumentHighlights(document, highlights);
      }
    } catch (error) {
      console.error('Failed to update highlights from database:', error);
    }
  }

  private async loadAssessmentData(): Promise<AssessmentData[]> {
    if (!this.db || !this.projectId) return [];

    try {
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

      return rows.map((row) => ({
        ...row,
        data: typeof row.data === "string" ? JSON.parse(row.data) : row.data,
      }));
    } catch (err) {
      console.error(`Failed to load assessment data: ${(err as Error).message}`);
      return [];
    }
  }

  private extractHighlightsFromAssessmentData(assessmentData: AssessmentData[]): CodeHighlight[] {
    const highlights: CodeHighlight[] = [];

    for (const assessment of assessmentData) {
      // Handle standardized findings format
      if (assessment.data_type === "code-analysis" && assessment.data.findings) {
        for (const finding of assessment.data.findings) {
          highlights.push({
            file_path: finding.filePath,
            start_line: finding.location.startLine,
            start_column: finding.location.startColumn,
            end_line: finding.location.endLine,
            end_column: finding.location.endColumn,
            severity: this.mapSeverity(finding.severity),
            message: finding.message,
            category: finding.category || "code-quality",
            source: assessment.source || assessment.tool_name,
          });
        }
      }

      // Handle legacy formats
      if (assessment.tool_name === "code_analysis" || assessment.data_type === "code_highlights") {
        if (assessment.data.highlights && Array.isArray(assessment.data.highlights)) {
          for (const highlight of assessment.data.highlights) {
            highlights.push({
              file_path: highlight.file_path || highlight.file,
              start_line: highlight.start_line || highlight.line || 1,
              start_column: highlight.start_column || highlight.column || 1,
              end_line: highlight.end_line || highlight.start_line || highlight.line || 1,
              end_column: highlight.end_column || highlight.start_column || highlight.column || 1,
              severity: this.mapSeverity(highlight.severity || highlight.level || "info"),
              message: highlight.message || highlight.description || "Carbonara analysis",
              category: highlight.category || assessment.tool_name,
              source: assessment.source,
            });
          }
        }
      }
    }

    return highlights;
  }

  private async updateDocumentHighlights(document: vscode.TextDocument, highlights: CodeHighlight[]): Promise<void> {
    const documentPath = document.uri.fsPath;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    const documentHighlights: CodeHighlight[] = [];
    if (workspaceFolder) {
      for (const h of highlights) {
        if (!h.file_path) continue;

        const normalizedDocPath = path.normalize(documentPath);
        const normalizedHighlightPath = path.normalize(h.file_path);

        if (normalizedDocPath.endsWith(normalizedHighlightPath)) {
          documentHighlights.push(h);
        }
      }
    }

    // Clear existing decorations
    this.clearDecorations();

    // Group highlights by severity
    const highlightsBySeverity = new Map<string, vscode.DecorationOptions[]>();
    const diagnostics: vscode.Diagnostic[] = [];

    for (const highlight of documentHighlights) {
      const range = new vscode.Range(
        new vscode.Position(Math.max(0, highlight.start_line - 1), Math.max(0, highlight.start_column - 1)),
        new vscode.Position(Math.max(0, highlight.end_line - 1), Math.max(0, highlight.end_column - 1))
      );

      // Create decoration
      const decorationOptions: vscode.DecorationOptions = {
        range: range,
        hoverMessage: this.createHoverMessage(highlight)
      };

      if (!highlightsBySeverity.has(highlight.severity)) {
        highlightsBySeverity.set(highlight.severity, []);
      }
      highlightsBySeverity.get(highlight.severity)!.push(decorationOptions);

      // Create diagnostic
      const diagnostic = new vscode.Diagnostic(range, highlight.message, this.mapSeverityToVSCode(highlight.severity));
      diagnostic.source = 'carbonara';
      diagnostic.code = highlight.category;
      diagnostics.push(diagnostic);
    }

    // Apply decorations
    const editor = vscode.window.visibleTextEditors.find(e => e.document === document);
    if (editor) {
      for (const [severity, decorations] of highlightsBySeverity) {
        const decorationType = this.decorationTypes.get(severity);
        if (decorationType) {
          editor.setDecorations(decorationType, decorations);
        }
      }
    }

    // Apply diagnostics
    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  private createHoverMessage(highlight: CodeHighlight): vscode.MarkdownString {
    const contents = new vscode.MarkdownString();
    contents.appendMarkdown(`**🌱 Carbonara ${highlight.severity.toUpperCase()}**\n\n`);
    contents.appendMarkdown(`${highlight.message}\n\n`);
    
    if (highlight.category) {
      contents.appendMarkdown(`*Category*: ${highlight.category}\n\n`);
    }
    
    if (highlight.source) {
      contents.appendMarkdown(`*Source*: ${highlight.source}\n`);
    }
    
    return contents;
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

  private mapSeverityToVSCode(severity: "error" | "warning" | "info" | "hint"): vscode.DiagnosticSeverity {
    switch (severity) {
      case 'error': return vscode.DiagnosticSeverity.Error;
      case 'warning': return vscode.DiagnosticSeverity.Warning;
      case 'info': return vscode.DiagnosticSeverity.Information;
      case 'hint': return vscode.DiagnosticSeverity.Hint;
      default: return vscode.DiagnosticSeverity.Information;
    }
  }

  private clearDecorations(): void {
    this.decorationTypes.forEach(decorationType => {
      decorationType.dispose();
    });
    this.initializeDecorationTypes();
  }

  // Public methods for commands
  async runAnalysisOnActiveFile(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      await this.runAnalysis(editor.document);
    }
  }

  async toggleStoreToDatabase(): Promise<void> {
    this.storeToDatabase = !this.storeToDatabase;
    const status = this.storeToDatabase ? 'enabled' : 'disabled';
    vscode.window.showInformationMessage(`Database storage ${status}`);
  }

  async refreshHighlights(): Promise<void> {
    await this.updateHighlightsFromDatabase();
  }

  async clearAllFindings(): Promise<void> {
    this.diagnosticCollection.clear();
    this.clearDecorations();
  }

  isStoreToDatabaseEnabled(): boolean {
    return this.storeToDatabase;
  }
}

export function registerUnifiedCommands(context: vscode.ExtensionContext, highlighter: UnifiedHighlighter): void {
  const commands = [
    vscode.commands.registerCommand('carbonara.runAnalysis', () => {
      highlighter.runAnalysisOnActiveFile();
    }),
    vscode.commands.registerCommand('carbonara.toggleStoreToDatabase', () => {
      highlighter.toggleStoreToDatabase();
    }),
    vscode.commands.registerCommand('carbonara.refreshHighlights', () => {
      highlighter.refreshHighlights();
    }),
    vscode.commands.registerCommand('carbonara.clearHighlights', () => {
      highlighter.clearAllFindings();
    })
  ];

  context.subscriptions.push(...commands);
}
