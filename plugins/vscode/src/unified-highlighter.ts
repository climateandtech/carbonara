// unified-highlighter.ts
// Unified system for running analysis tools and displaying results

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { setupCarbonaraCore } from '@carbonara/core';

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
  private coreServices: Awaited<ReturnType<typeof setupCarbonaraCore>> | null = null;
  private diagnosticCollection: vscode.DiagnosticCollection;
  private decorationTypes!: Map<string, vscode.TextEditorDecorationType>;
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
    
    // Initialize core services
    this.initializeCoreServices();
  }

  private async initializeCoreServices(): Promise<void> {
    try {
      console.log('🔧 Initializing core services...');
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        console.log('❌ No workspace folder available for core services');
        return;
      }

      const dbPath = path.join(workspaceFolder.uri.fsPath, 'carbonara.db');
      console.log(`🔧 Setting up core services with dbPath: ${dbPath}`);
      this.coreServices = await setupCarbonaraCore({ dbPath });
      console.log('✅ Core services initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize core services:', error);
      console.error('❌ Error details:', error);
    }
  }

  async initialize(): Promise<void> {
    // Core services are initialized in constructor
    // Listen for document changes to trigger analysis
    vscode.workspace.onDidSaveTextDocument((document) => {
      console.log(`📁 File saved: ${document.fileName}`);
      this.runAnalysis(document);
    });

    // Listen for active editor changes
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        console.log(`📁 Active editor changed: ${editor.document.fileName}`);
        this.runAnalysis(editor.document);
      }
    });

    // Also trigger analysis on the currently active file when extension loads
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      console.log(`📁 Initial analysis for: ${activeEditor.document.fileName}`);
      this.runAnalysis(activeEditor.document);
    }
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

  // Public method for manual analysis trigger
  async runAnalysisOnActiveFile(): Promise<void> {
    console.log('🚀 runAnalysisOnActiveFile called');
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      console.log('❌ No active text editor');
      vscode.window.showErrorMessage('No file is currently open');
      return;
    }
    console.log(`📁 Active file: ${editor.document.fileName}`);

    const filePath = editor.document.uri.fsPath;

    // Save the document if it has unsaved changes
    if (editor.document.isDirty) {
      await editor.document.save();
    }

    const output = vscode.window.createOutputChannel('Carbonara Analysis');
    output.appendLine(`Running analysis on ${path.basename(filePath)}...`);

    return vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Running analysis...',
      cancellable: true
    }, async (progress, token) => {
      return new Promise<void>((resolve) => {
        // Run Semgrep directly
        const child = spawn('semgrep', ['--config', 'auto', '--json', filePath], { stdio: 'pipe' });

        let stdoutData = '';
        let stderrData = '';

        token.onCancellationRequested(() => {
          output.appendLine('Analysis cancelled by user');
          try { child.kill(); } catch {}
        });

        child.stdout?.on('data', (data) => {
          stdoutData += data.toString();
        });

        child.stderr?.on('data', (data) => {
          const text = data.toString();
          stderrData += text;
          output.append(text);
        });

        child.on('close', async (code) => {
          if (code === 0 || stdoutData) {
            try {
              const result = JSON.parse(stdoutData);

              // Convert Semgrep results to VSCode diagnostics
              const diagnostics: vscode.Diagnostic[] = result.matches.map((match: any) => {
                const range = new vscode.Range(
                  match.start_line - 1,
                  match.start_column,
                  match.end_line - 1,
                  match.end_column
                );

                // Map severity
                let severity: vscode.DiagnosticSeverity;
                if (match.severity === 'ERROR') {
                  severity = vscode.DiagnosticSeverity.Error;
                } else if (match.severity === 'WARNING') {
                  severity = vscode.DiagnosticSeverity.Warning;
                } else {
                  severity = vscode.DiagnosticSeverity.Information;
                }

                const diagnostic = new vscode.Diagnostic(range, match.message, severity);
                diagnostic.source = 'carbonara';
                diagnostic.code = match.rule_id;

                return diagnostic;
              });

              // Apply diagnostics to the document
              const uri = vscode.Uri.file(filePath);
              console.log(`🔍 Setting ${diagnostics.length} diagnostics for file: ${filePath}`);
              console.log(`🔍 Diagnostic details:`, diagnostics.map(d => ({ message: d.message, severity: d.severity, range: d.range })));
              this.diagnosticCollection.set(uri, diagnostics);

              // Display summary
              output.appendLine(`\nAnalysis complete!`);
              output.appendLine(`Files scanned: ${result.stats.files_scanned}`);
              output.appendLine(`Total findings: ${result.stats.total_matches}`);
              output.appendLine(`  Errors: ${result.stats.error_count}`);
              output.appendLine(`  Warnings: ${result.stats.warning_count}`);
              output.appendLine(`  Info: ${result.stats.info_count}`);

              if (result.matches.length > 0) {
                output.appendLine(`\nFindings:`);
                result.matches.forEach((match: any, index: number) => {
                  output.appendLine(`\n${index + 1}. [${match.severity}] ${match.rule_id}`);
                  output.appendLine(`   ${filePath}:${match.start_line}:${match.start_column}`);
                  output.appendLine(`   ${match.message}`);
                });

                vscode.window.showWarningMessage(
                  `Analysis found ${result.stats.total_matches} issue(s). Check Problems panel.`,
                  'View Output'
                ).then(selection => {
                  if (selection === 'View Output') {
                    output.show();
                  }
                });
              } else {
                output.appendLine('\n✓ No issues found!');
                // Clear any previous diagnostics
                this.diagnosticCollection.set(uri, []);
                vscode.window.showInformationMessage('Analysis: No issues found!');
              }

              // Store to database if enabled
              if (this.storeToDatabase) {
                await this.storeAnalysisResults('semgrep', filePath, result);
              }

              // Also update highlights from database to show any stored results
              await this.updateHighlightsFromDatabase();

            } catch (error) {
              output.appendLine(`Error parsing analysis results: ${error}`);
              vscode.window.showErrorMessage('Failed to parse analysis results');
            }
          } else {
            output.appendLine(`\nAnalysis failed with exit code ${code}`);
            if (stderrData) {
              output.appendLine(stderrData);
            }
            vscode.window.showErrorMessage(`Analysis failed. Check Output for details.`);
          }
          resolve();
        });

        child.on('error', (err) => {
          output.appendLine(`Failed to start analysis: ${err.message}`);
          vscode.window.showErrorMessage('Failed to run analysis. Is Semgrep installed?');
          resolve();
        });
      });
    });
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
      if (!this.coreServices?.dataService) {
        console.log('Core services not available, skipping database save');
        return;
      }

      // For now, store raw results - parsing will be handled by CLI
      const assessmentData = {
        target: filePath,
        raw_results: JSON.stringify(rawResult),
        timestamp: new Date().toISOString(),
        toolId,
        dataType: 'code-analysis'
      };

      // Get project ID from workspace
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        console.log('No workspace folder found');
        return;
      }

      // Create or get project
      let project = await this.coreServices.dataService.getProject(workspaceFolder.uri.fsPath);
      
      if (!project) {
        const projectId = await this.coreServices.dataService.createProject(
          path.basename(workspaceFolder.uri.fsPath),
          workspaceFolder.uri.fsPath,
          { type: 'web' }
        );
        project = await this.coreServices.dataService.getProject(workspaceFolder.uri.fsPath);
      }

      if (project) {
        await this.coreServices.dataService.storeAssessmentData(
          project.id,
          toolId,
          'code-analysis',
          assessmentData,
          filePath
        );
      }

      console.log(`✅ ${toolId} results saved to database`);
    } catch (error) {
      console.error(`❌ Failed to save ${toolId} results to database:`, error);
    }
  }

  // DISPLAY LAYER: Show results from database
  private async displayResults(toolId: string, filePath: string): Promise<void> {
    if (this.storeToDatabase && this.coreServices?.dataService) {
      // Display from database
      await this.updateHighlightsFromDatabase();
    } else {
      // Display directly from analysis results (temporary)
      // This would require storing the last analysis results
      console.log('Temporary display mode - results not persisted');
    }
  }

  private async updateHighlightsFromDatabase(): Promise<void> {
    console.log('🔍 updateHighlightsFromDatabase called');
    if (!this.coreServices?.dataService) {
      console.log('❌ Core services not available');
      return;
    }

    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        console.log('❌ No workspace folder');
        return;
      }

      const project = await this.coreServices.dataService.getProject(workspaceFolder.uri.fsPath);
      if (!project) {
        console.log('❌ No project found');
        return;
      }

      console.log(`📁 Project found: ${project.id}`);
      const assessmentData = await this.coreServices.dataService.getAssessmentData(project.id, 'code-analysis');
      console.log(`📊 Loaded ${assessmentData.length} assessment data entries`);
      const highlights = this.extractHighlightsFromAssessmentData(assessmentData);
      console.log(`🎨 Extracted ${highlights.length} highlights`);
      
      // Group highlights by file for Problems panel
      const highlightsByFile = new Map<string, CodeHighlight[]>();
      for (const highlight of highlights) {
        if (!highlightsByFile.has(highlight.file_path)) {
          highlightsByFile.set(highlight.file_path, []);
        }
        highlightsByFile.get(highlight.file_path)!.push(highlight);
      }

      // Update diagnostics for Problems panel
      for (const [filePath, fileHighlights] of highlightsByFile) {
        const uri = vscode.Uri.file(filePath);
        const diagnostics: vscode.Diagnostic[] = fileHighlights.map(highlight => {
          const range = new vscode.Range(
            new vscode.Position(Math.max(0, highlight.start_line - 1), Math.max(0, highlight.start_column - 1)),
            new vscode.Position(Math.max(0, highlight.end_line - 1), Math.max(0, highlight.end_column - 1))
          );

          const diagnostic = new vscode.Diagnostic(range, highlight.message, this.mapSeverityToVSCode(highlight.severity));
          diagnostic.source = 'carbonara';
          diagnostic.code = highlight.category;
          return diagnostic;
        });

        // Apply diagnostics to Problems panel
        this.diagnosticCollection.set(uri, diagnostics);
      }
      
      // Update visual decorations for open documents
      const openDocuments = vscode.workspace.textDocuments;
      for (const document of openDocuments) {
        const documentHighlights = highlightsByFile.get(document.uri.fsPath) || [];
        await this.updateDocumentDecorations(document, documentHighlights);
      }
    } catch (error) {
      console.error('Failed to update highlights from database:', error);
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

  private async updateDocumentDecorations(document: vscode.TextDocument, highlights: CodeHighlight[]): Promise<void> {
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

    // Group highlights by severity for decorations
    const highlightsBySeverity = new Map<string, vscode.DecorationOptions[]>();

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

  // Public methods for commands (runAnalysisOnActiveFile is now defined above)

  async toggleStoreToDatabase(): Promise<void> {
    this.storeToDatabase = !this.storeToDatabase;
    const status = this.storeToDatabase ? 'enabled' : 'disabled';
    vscode.window.showInformationMessage(`Database storage ${status}`);
  }

  async refreshHighlights(): Promise<void> {
    await this.updateHighlightsFromDatabase();
    vscode.window.showInformationMessage('Highlights refreshed from database');
  }

  async loadDatabaseHighlights(): Promise<void> {
    console.log('🎯 loadDatabaseHighlights command triggered!');
    try {
      await this.updateHighlightsFromDatabase();
      vscode.window.showInformationMessage('Database highlights loaded and displayed in Problems panel');
    } catch (error) {
      console.error('Failed to load database highlights:', error);
      vscode.window.showErrorMessage(`Failed to load database highlights: ${error}`);
    }
  }

  async clearAllFindings(): Promise<void> {
    this.diagnosticCollection.clear();
    this.clearDecorations();
    vscode.window.showInformationMessage('Analysis results cleared');
  }

  isStoreToDatabaseEnabled(): boolean {
    return this.storeToDatabase;
  }
}

export function registerUnifiedCommands(context: vscode.ExtensionContext, highlighter: UnifiedHighlighter): void {
  const commands = [
    vscode.commands.registerCommand('carbonara.runAnalysis', () => {
      console.log('🎯 carbonara.runAnalysis command triggered!');
      highlighter.runAnalysisOnActiveFile();
    }),
    vscode.commands.registerCommand('carbonara.runSemgrepAnalysis', () => {
      console.log('🎯 carbonara.runSemgrepAnalysis command triggered!');
      console.log('🎯 About to call runAnalysisOnActiveFile...');
      highlighter.runAnalysisOnActiveFile().then(() => {
        console.log('🎯 runAnalysisOnActiveFile completed');
      }).catch((error) => {
        console.error('🎯 runAnalysisOnActiveFile failed:', error);
      });
    }),
    vscode.commands.registerCommand('carbonara.toggleStoreToDatabase', () => {
      highlighter.toggleStoreToDatabase();
    }),
    vscode.commands.registerCommand('carbonara.refreshHighlights', () => {
      highlighter.refreshHighlights();
    }),
    vscode.commands.registerCommand('carbonara.clearHighlights', () => {
      highlighter.clearAllFindings();
    }),
    vscode.commands.registerCommand('carbonara.loadDatabaseHighlights', () => {
      highlighter.loadDatabaseHighlights();
    })
  ];

  context.subscriptions.push(...commands);
}
