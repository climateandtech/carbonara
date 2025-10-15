import * as vscode from 'vscode';
import { UI_TEXT } from './constants/ui-text';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';
import { AssessmentTreeProvider } from './assessment-tree-provider';
import { DataTreeProvider } from './data-tree-provider';
import { ToolsTreeProvider } from './tools-tree-provider';
import { createSemgrepService, type SemgrepMatch, type SemgrepResult } from '@carbonara/core';

// File size threshold for interactive linting (1MB)
// Files larger than this will only be linted on save
const MAX_FILE_SIZE_FOR_INTERACTIVE_LINT = 1024 * 1024; // 1MB in bytes

let carbonaraStatusBar: vscode.StatusBarItem;
let assessmentTreeProvider: AssessmentTreeProvider;
let dataTreeProvider: DataTreeProvider;
let toolsTreeProvider: ToolsTreeProvider;

let currentProjectPath: string | null = null;

// Diagnostics collection for Semgrep results
let semgrepDiagnostics: vscode.DiagnosticCollection;

// Debounce timer for automatic Semgrep analysis
let semgrepAnalysisTimer: NodeJS.Timeout | undefined;

// Track files with diagnostics and their line numbers for incremental analysis
const filesWithDiagnostics = new Map<string, Set<number>>();

export function activate(context: vscode.ExtensionContext) {
    console.log('Carbonara extension is now active!');

    // Create diagnostics collection for Semgrep
    semgrepDiagnostics = vscode.languages.createDiagnosticCollection('semgrep');
    context.subscriptions.push(semgrepDiagnostics);

    // Create status bar item
    carbonaraStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    carbonaraStatusBar.text = UI_TEXT.STATUS_BAR.TEXT;
    carbonaraStatusBar.tooltip = UI_TEXT.STATUS_BAR.TOOLTIP;
    // Make it uniquely selectable in tests and accessible UIs
    carbonaraStatusBar.accessibilityInformation = { label: UI_TEXT.STATUS_BAR.ARIA_LABEL };
    carbonaraStatusBar.command = 'carbonara.showMenu';
    carbonaraStatusBar.show();

    // Create and register tree views
    assessmentTreeProvider = new AssessmentTreeProvider();
    dataTreeProvider = new DataTreeProvider();
    console.log('🔧 Creating ToolsTreeProvider...');
    toolsTreeProvider = new ToolsTreeProvider();
    console.log('🔧 Registering tree data providers...');
    vscode.window.registerTreeDataProvider('carbonara.assessmentTree', assessmentTreeProvider);
    vscode.window.registerTreeDataProvider('carbonara.dataTree', dataTreeProvider);
    vscode.window.registerTreeDataProvider('carbonara.toolsTree', toolsTreeProvider);
    console.log('✅ All tree providers registered');

    // Register commands
    const commands = [
        vscode.commands.registerCommand('carbonara.showMenu', showCarbonaraMenu),
        vscode.commands.registerCommand('carbonara.initProject', initProject),
        vscode.commands.registerCommand('carbonara.runAssessment', runAssessment),
        vscode.commands.registerCommand('carbonara.analyzeWebsite', analyzeWebsite),
        vscode.commands.registerCommand('carbonara.viewData', viewData),
        vscode.commands.registerCommand('carbonara.showStatus', showStatus),
        vscode.commands.registerCommand('carbonara.openConfig', openConfig),
        vscode.commands.registerCommand('carbonara.editSection', (sectionId) => assessmentTreeProvider.editSection(sectionId)),
        vscode.commands.registerCommand('carbonara.completeAssessment', () => assessmentTreeProvider.completeAssessment()),
        vscode.commands.registerCommand('carbonara.refreshAssessment', () => assessmentTreeProvider.refresh()),
        vscode.commands.registerCommand('carbonara.refreshData', () => dataTreeProvider.refresh()),
        vscode.commands.registerCommand('carbonara.exportDataJson', () => dataTreeProvider.exportData('json')),
        vscode.commands.registerCommand('carbonara.exportDataCsv', () => dataTreeProvider.exportData('csv')),
        vscode.commands.registerCommand('carbonara.clearAllData', () => dataTreeProvider.clearData()),
        vscode.commands.registerCommand('carbonara.openProject', openCarbonaraProject),
        vscode.commands.registerCommand('carbonara.installCli', installCli),
        vscode.commands.registerCommand('carbonara.viewTools', viewTools),
        vscode.commands.registerCommand('carbonara.refreshTools', () => toolsTreeProvider.refresh()),
        vscode.commands.registerCommand('carbonara.installTool', (toolId) => toolsTreeProvider.installTool(toolId)),
        vscode.commands.registerCommand('carbonara.analyzeTool', (toolId) => toolsTreeProvider.analyzeTool(toolId)),
        vscode.commands.registerCommand('carbonara.runSemgrep', runSemgrepOnFile),
        vscode.commands.registerCommand('carbonara.clearSemgrepResults', clearSemgrepResults)

    ];

    context.subscriptions.push(carbonaraStatusBar, ...commands);

    // Watch for project config changes and refresh views/status accordingly
    const watcher = vscode.workspace.createFileSystemWatcher('**/carbonara.config.json');
    watcher.onDidCreate(() => {
        assessmentTreeProvider.refresh();
        dataTreeProvider.refresh();
        checkProjectStatus();
    });
    watcher.onDidChange(() => {
        assessmentTreeProvider.refresh();
        dataTreeProvider.refresh();
        checkProjectStatus();
    });
    watcher.onDidDelete(() => {
        assessmentTreeProvider.refresh();
        dataTreeProvider.refresh();
        checkProjectStatus();
    });
    context.subscriptions.push(watcher);

    // Set up automatic Semgrep analysis on file focus change
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                runSemgrepOnFileChange(editor);
            }
        })
    );

    // Set up incremental Semgrep analysis on document changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document && event.contentChanges.length > 0) {
                handleDocumentChange(event);
            }
        })
    );

    // Set up Semgrep analysis on file save for large files
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(document => {
            const editor = vscode.window.visibleTextEditors.find(
                e => e.document === document
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

    // Check if project is already initialized
    checkProjectStatus();
}

export function deactivate() {
    if (carbonaraStatusBar) {
        carbonaraStatusBar.dispose();
    }
}

async function showCarbonaraMenu() {
    const items = [
        {
            label: UI_TEXT.MENU.ITEMS.OPEN_PROJECT.LABEL,
            description: UI_TEXT.MENU.ITEMS.OPEN_PROJECT.DESCRIPTION,
            command: 'carbonara.openProject'
        },
        {
            label: UI_TEXT.MENU.ITEMS.INITIALIZE_PROJECT.LABEL,
            description: UI_TEXT.MENU.ITEMS.INITIALIZE_PROJECT.DESCRIPTION,
            command: 'carbonara.initProject'
        },
        {
            label: UI_TEXT.MENU.ITEMS.RUN_ASSESSMENT.LABEL,
            description: UI_TEXT.MENU.ITEMS.RUN_ASSESSMENT.DESCRIPTION,
            command: 'carbonara.runAssessment'
        },
        {
            label: UI_TEXT.MENU.ITEMS.ANALYZE_WEBSITE.LABEL,
            description: UI_TEXT.MENU.ITEMS.ANALYZE_WEBSITE.DESCRIPTION,
            command: 'carbonara.analyzeWebsite'
        },
        {
            label: UI_TEXT.MENU.ITEMS.VIEW_DATA.LABEL,
            description: UI_TEXT.MENU.ITEMS.VIEW_DATA.DESCRIPTION,
            command: 'carbonara.viewData'
        },
        {
            label: UI_TEXT.MENU.ITEMS.MANAGE_TOOLS.LABEL,
            description: UI_TEXT.MENU.ITEMS.MANAGE_TOOLS.DESCRIPTION,
            command: 'carbonara.viewTools'
        },

        {
            label: UI_TEXT.MENU.ITEMS.OPEN_CONFIG.LABEL,
            description: UI_TEXT.MENU.ITEMS.OPEN_CONFIG.DESCRIPTION,
            command: 'carbonara.openConfig'
        },
        {
            label: UI_TEXT.MENU.ITEMS.SHOW_STATUS.LABEL,
            description: UI_TEXT.MENU.ITEMS.SHOW_STATUS.DESCRIPTION,
            command: 'carbonara.showStatus'
        }
    ];

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: UI_TEXT.MENU.PLACEHOLDER
    });

    if (selected) {
        vscode.commands.executeCommand(selected.command);
    }
}

async function initProject() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Please open a workspace folder first');
        return;
    }

    const projectName = await vscode.window.showInputBox({
        prompt: UI_TEXT.PROJECT_INIT.NAME_PROMPT,
        value: path.basename(workspaceFolder.uri.fsPath)
    });

    if (!projectName) {
        return;
    }

    const projectType = await vscode.window.showQuickPick(
        [
            { label: 'Web Application', value: 'web' },
            { label: 'Mobile Application', value: 'mobile' },
            { label: 'Desktop Application', value: 'desktop' },
            { label: 'API/Backend Service', value: 'api' },
            { label: 'Other', value: 'other' }
        ],
        { placeHolder: 'Select project type' }
    );

    if (!projectType) {
        return;
    }

    const projectPath = getCurrentProjectPath();

    // Create project structure
    await ensureLocalCarbonaraProject(projectPath, projectName, projectType.value);

    // Ensure UI reflects the new project
    assessmentTreeProvider.refresh();
    dataTreeProvider.refresh();
    checkProjectStatus();

    vscode.window.showInformationMessage('Carbonara project initialized successfully!');
}

async function runAssessment() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Please open a workspace folder first');
        return;
    }

    // Check if project is initialized
    const projectPath = getCurrentProjectPath();
    const configPath = path.join(projectPath, 'carbonara.config.json');
    if (!fs.existsSync(configPath)) {
        const answer = await vscode.window.showInformationMessage(
            'Project not initialized. Initialize now?',
            'Yes', 'No'
        );
        if (answer === 'Yes') {
            await initProject();
        }
        return;
    }

    // Show the assessment tree and focus on first incomplete section
    vscode.commands.executeCommand('carbonara.assessmentTree.focus');
    
    // Find first incomplete section and edit it
    const status = assessmentTreeProvider.getCompletionStatus();
    if (status.completed < status.total) {
        // Start with the first section
        const incompleteSectionIds = ['project-info', 'infrastructure', 'development', 'features', 'sustainability'];
        for (const sectionId of incompleteSectionIds) {
            // This will open the editing flow for the first incomplete section
            assessmentTreeProvider.editSection(sectionId);
            break;
        }
    } else {
        vscode.window.showInformationMessage('All assessment sections completed! Use sidebar to review or complete assessment.');
    }
}



async function analyzeWebsite() {
    // Dummy implementation for database branch - doesn't require greenframe CLI
    const url = await vscode.window.showInputBox({
        prompt: UI_TEXT.WEBSITE_ANALYSIS.URL_PROMPT,
        placeHolder: UI_TEXT.WEBSITE_ANALYSIS.URL_PLACEHOLDER
    });

    if (!url) {
        return;
    }

    // Validate URL
    try {
        new URL(url);
    } catch {
        vscode.window.showErrorMessage('Please enter a valid URL');
        return;
    }

    // Show dummy analysis results instead of calling CLI
    const dummyResults = {
        url: url,
        co2Score: Math.floor(Math.random() * 100),
        loadTime: (Math.random() * 3 + 1).toFixed(2),
        timestamp: new Date().toISOString()
    };

    vscode.window.showInformationMessage(
        `🌍 Website Analysis (Demo)\n` +
        `URL: ${dummyResults.url}\n` +
        `CO2 Score: ${dummyResults.co2Score}/100\n` +
        `Load Time: ${dummyResults.loadTime}s\n` +
        `Analyzed at: ${new Date().toLocaleString()}`,
        { modal: false }
    );

    console.log('🎭 Dummy website analysis completed:', dummyResults);
}

async function viewData() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Please open a workspace folder first');
        return;
    }

    vscode.commands.executeCommand('carbonara.dataTree.focus');
}

async function viewTools() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Please open a workspace folder first');
        return;
    }

    vscode.commands.executeCommand('carbonara.toolsTree.focus');
}



async function showStatus() {
    const projectPath = getCurrentProjectPath();
    const configPath = path.join(projectPath, 'carbonara.config.json');
    if (!fs.existsSync(configPath)) {
        vscode.window.showInformationMessage('No Carbonara project detected. Initialize one from the status bar or sidebar.');
        return;
    }

    vscode.window.showInformationMessage('Carbonara project detected and ready.');
}

async function openConfig() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Please open a workspace folder first');
        return;
    }

    const projectPath = getCurrentProjectPath();
    const configPath = path.join(projectPath, 'carbonara.config.json');
    
    if (fs.existsSync(configPath)) {
        const doc = await vscode.workspace.openTextDocument(configPath);
        vscode.window.showTextDocument(doc);
    } else {
        const answer = await vscode.window.showInformationMessage(
            'Configuration file not found. Initialize project first?',
            'Initialize', 'Cancel'
        );
        if (answer === 'Initialize') {
            await initProject();
        }
    }
}

async function openCarbonaraProject() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Please open a workspace folder first');
        return;
    }

    // First check if current workspace already has a Carbonara project
    const projectPath = getCurrentProjectPath();
    const configPath = path.join(projectPath, 'carbonara.config.json');
    if (fs.existsSync(configPath)) {
        try {
            const configContent = fs.readFileSync(configPath, 'utf-8');
            const config = JSON.parse(configContent);
            vscode.window.showInformationMessage(`✅ Current workspace is already a Carbonara project: ${config.name}`);
            checkProjectStatus();
            return;
        } catch (error) {
            vscode.window.showWarningMessage('Found carbonara.config.json but it appears to be invalid');
        }
    }

    // Show options for setting up Carbonara in current workspace
    const action = await vscode.window.showQuickPick([
        { 
            label: UI_TEXT.PROJECT_OPEN.OPTIONS.INITIALIZE.LABEL, 
            value: 'init',
            description: UI_TEXT.PROJECT_OPEN.OPTIONS.INITIALIZE.DESCRIPTION
        },
        { 
            label: UI_TEXT.PROJECT_OPEN.OPTIONS.SEARCH.LABEL, 
            value: 'search',
            description: UI_TEXT.PROJECT_OPEN.OPTIONS.SEARCH.DESCRIPTION
        },
        { 
            label: UI_TEXT.PROJECT_OPEN.OPTIONS.BROWSE.LABEL, 
            value: 'browse',
            description: UI_TEXT.PROJECT_OPEN.OPTIONS.BROWSE.DESCRIPTION
        }
    ], {
        placeHolder: UI_TEXT.PROJECT_OPEN.PLACEHOLDER
    });

    if (!action) {
        return;
    }

    switch (action.value) {
        case 'init':
            await initProject();
            break;
        case 'search':
            await searchWorkspaceForProjects();
            break;
        case 'browse':
            await browseForConfig();
            break;
    }
}

async function browseForConfig() {
    const fileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: 'Open Carbonara Config',
        filters: {
            'Carbonara Config': ['json'],
            'All Files': ['*']
        },
        title: 'Select carbonara.config.json file'
    });

    if (fileUri && fileUri[0]) {
        const configPath = fileUri[0].fsPath;
        
        // Verify it's a carbonara config
        try {
            const configContent = fs.readFileSync(configPath, 'utf-8');
            const config = JSON.parse(configContent);
            
            if (config.name && config.projectId && config.database) {
                const projectDir = path.dirname(configPath);
                
                // Open the project folder as workspace
                const folderUri = vscode.Uri.file(projectDir);
                vscode.commands.executeCommand('vscode.openFolder', folderUri);
                
                vscode.window.showInformationMessage(`Opening Carbonara project: ${config.name}`);
            } else {
                vscode.window.showErrorMessage('Selected file is not a valid carbonara.config.json');
            }
        } catch (error) {
            vscode.window.showErrorMessage('Failed to read config file: ' + error);
        }
    }
}

async function searchWorkspaceForProjects() {
    if (!vscode.workspace.workspaceFolders) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    // Search for all carbonara.config.json files
    const configs = await vscode.workspace.findFiles('**/carbonara.config.json', '**/node_modules/**');
    
    if (configs.length === 0) {
        vscode.window.showInformationMessage('No Carbonara projects found in current workspace');
        return;
    }

    // Parse configs and show selection
    const projectOptions: Array<{label: string, description: string, path: string, config: any}> = [];
    
    for (const configUri of configs) {
        try {
            const configContent = fs.readFileSync(configUri.fsPath, 'utf-8');
            const config = JSON.parse(configContent);
            
            const relativePath = vscode.workspace.asRelativePath(configUri);
            const projectDir = path.dirname(relativePath);
            
            projectOptions.push({
                label: `🌱 ${config.name || 'Unnamed Project'}`,
                description: `${projectDir} - ${config.projectType || 'Unknown type'}`,
                path: path.dirname(configUri.fsPath),
                config: config
            });
        } catch (error) {
            console.error(`Failed to parse config at ${configUri.fsPath}:`, error);
        }
    }

    if (projectOptions.length === 0) {
        vscode.window.showInformationMessage('No valid Carbonara projects found');
        return;
    }

    const selected = await vscode.window.showQuickPick(projectOptions, {
        placeHolder: 'Select a Carbonara project to use in this workspace'
    });

    if (selected) {
        // Set the working directory for the extension to the selected project
        setCurrentCarbonaraProject(selected.path);
        vscode.window.showInformationMessage(`✅ Using Carbonara project: ${selected.config.name} (${path.dirname(vscode.workspace.asRelativePath(selected.path))})`);
        
        // Refresh the tree views with the new project
        checkProjectStatus();
        assessmentTreeProvider.refresh();
        dataTreeProvider.refresh();
    }
}

async function openProjectFolder() {
    const folderUri = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Open Carbonara Project',
        title: 'Select folder containing a Carbonara project'
    });

    if (folderUri && folderUri[0]) {
        const projectPath = folderUri[0].fsPath;
        const configPath = path.join(projectPath, 'carbonara.config.json');
        
        if (fs.existsSync(configPath)) {
            try {
                const configContent = fs.readFileSync(configPath, 'utf-8');
                const config = JSON.parse(configContent);
                
                vscode.commands.executeCommand('vscode.openFolder', folderUri[0]);
                vscode.window.showInformationMessage(`Opening Carbonara project: ${config.name || 'Unnamed Project'}`);
            } catch (error) {
                vscode.window.showErrorMessage('Invalid carbonara.config.json in selected folder');
            }
        } else {
            const answer = await vscode.window.showInformationMessage(
                'No carbonara.config.json found in selected folder. Initialize a new Carbonara project here?',
                'Initialize', 'Cancel'
            );
            if (answer === 'Initialize') {
                vscode.commands.executeCommand('vscode.openFolder', folderUri[0]);
                // Wait a bit for folder to open, then initialize
                setTimeout(() => {
                    vscode.commands.executeCommand('carbonara.initProject');
                }, 1000);
            }
        }
    }
}

function setCurrentCarbonaraProject(projectPath: string) {
    currentProjectPath = projectPath;
}

function getCurrentProjectPath(): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return process.cwd();
    }

    return workspaceFolder.uri.fsPath;
}

async function ensureLocalCarbonaraProject(projectPath: string, projectName: string, projectType: string): Promise<void> {
    try {
        const configPath = path.join(projectPath, 'carbonara.config.json');
        if (!fs.existsSync(configPath)) {
            const minimalConfig = {
                name: projectName,
                description: `${projectName} - Carbonara project`,
                type: projectType,
                version: 1,
                createdAt: new Date().toISOString()
            };
            fs.writeFileSync(configPath, JSON.stringify(minimalConfig, null, 2), 'utf-8');
        }
        // Ensure data directory exists
        const dataDir = path.join(projectPath, '.carbonara');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to initialize local Carbonara project: ${(error as Error).message}`);
    }
}

async function installCli(): Promise<void> {
    // Offer to install the global CLI (optional - for advanced users)
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Installing Carbonara CLI globally...'
    }, async () => {
        return new Promise<void>((resolve) => {
            const child = spawn('npm', ['i', '-g', '@carbonara/cli'], { stdio: 'ignore' });
            child.on('close', () => {
                vscode.window.showInformationMessage('Carbonara CLI installation finished.');
                resolve();
            });
            child.on('error', () => {
                vscode.window.showErrorMessage('Failed to start npm. Please install @carbonara/cli manually.');
                resolve();
            });
        });
    });
}

function checkProjectStatus() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        carbonaraStatusBar.text = "$(pulse) Carbonara";
        carbonaraStatusBar.tooltip = "Open a workspace to use Carbonara";
        return;
    }

    const projectPath = getCurrentProjectPath();
    const configPath = path.join(projectPath, 'carbonara.config.json');

    if (fs.existsSync(configPath)) {
        carbonaraStatusBar.text = "$(check) Carbonara";
        carbonaraStatusBar.tooltip = "Carbonara project initialized";
        // Make sure views show project data state
        assessmentTreeProvider.refresh();
        dataTreeProvider.refresh();
    } else {
        carbonaraStatusBar.text = "$(pulse) Carbonara";
        carbonaraStatusBar.tooltip = "Click to initialize Carbonara project";
        assessmentTreeProvider.refresh();
        dataTreeProvider.refresh();
    }
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

    fs.writeFileSync(tempFile, editor.document.getText(), 'utf-8');
    return tempFile;
}

async function runSemgrepOnFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No file is currently open');
        return;
    }

    const filePath = editor.document.uri.fsPath;

    // Write editor content to temp file instead of auto-saving
    const tempFile = writeEditorToTempFile(editor);

    const output = vscode.window.createOutputChannel('Carbonara Semgrep');
    output.appendLine(`Running Semgrep on ${path.basename(filePath)}...`);

    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Running Semgrep analysis...',
        cancellable: false
    }, async () => {
        try {
            // Create Semgrep service instance
            const semgrep = createSemgrepService({
                useBundledPython: false,
                timeout: 60000
            });

            // Check setup before running
            output.appendLine('Checking Semgrep setup...');
            const setup = await semgrep.checkSetup();

            if (!setup.isValid) {
                output.appendLine('Semgrep setup issues detected:');
                setup.errors.forEach((error) => {
                    output.appendLine(`  • ${error}`);
                });
                output.show();
                vscode.window.showErrorMessage(
                    'Semgrep is not properly configured. Check Output for details.',
                    'View Output'
                ).then(selection => {
                    if (selection === 'View Output') {
                        output.show();
                    }
                });
                return;
            }

            output.appendLine('Running analysis...');

            // Run analysis on the temp file
            const result = await semgrep.analyzeFile(tempFile);

            if (!result.success) {
                output.appendLine('Analysis failed:');
                result.errors.forEach((error) => {
                    output.appendLine(`  • ${error}`);
                });
                output.show();
                vscode.window.showErrorMessage('Semgrep analysis failed. Check Output for details.');
                return;
            }

            // Convert Semgrep results to VSCode diagnostics
            const diagnostics: vscode.Diagnostic[] = result.matches.map(match => {
                const range = new vscode.Range(
                    match.start_line - 1,
                    Math.max(0, match.start_column - 1),
                    match.end_line - 1,
                    Math.max(0, match.end_column - 1)
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
                diagnostic.source = 'semgrep';
                diagnostic.code = match.rule_id;

                return diagnostic;
            });

            // Apply diagnostics to the document
            const uri = vscode.Uri.file(filePath);
            semgrepDiagnostics.set(uri, diagnostics);

            // Track which lines have diagnostics for incremental re-analysis
            const lineSet = new Set<number>();
            diagnostics.forEach(diagnostic => {
                for (let line = diagnostic.range.start.line; line <= diagnostic.range.end.line; line++) {
                    lineSet.add(line);
                }
            });
            filesWithDiagnostics.set(filePath, lineSet);

            // Display summary
            output.appendLine(`\nAnalysis complete!`);
            output.appendLine(`Files scanned: ${result.stats.files_scanned}`);
            output.appendLine(`Total findings: ${result.stats.total_matches}`);
            output.appendLine(`  Errors: ${result.stats.error_count}`);
            output.appendLine(`  Warnings: ${result.stats.warning_count}`);
            output.appendLine(`  Info: ${result.stats.info_count}`);

            if (result.matches.length > 0) {
                output.appendLine(`\nFindings:`);
                result.matches.forEach((match, index) => {
                    output.appendLine(`\n${index + 1}. [${match.severity}] ${match.rule_id}`);
                    output.appendLine(`   ${filePath}:${match.start_line}:${match.start_column}`);
                    output.appendLine(`   ${match.message}`);
                });

                vscode.window.showWarningMessage(
                    `Semgrep found ${result.stats.total_matches} issue(s). Underlines added to code.`,
                    'View Output'
                ).then(selection => {
                    if (selection === 'View Output') {
                        output.show();
                    }
                });
            } else {
                output.appendLine('\n✓ No issues found!');
                // Clear any previous diagnostics
                semgrepDiagnostics.set(uri, []);
                vscode.window.showInformationMessage('Semgrep: No issues found!');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            output.appendLine(`\nError: ${errorMessage}`);
            output.show();
            vscode.window.showErrorMessage(`Semgrep analysis failed: ${errorMessage}`);
        } finally {
            // Clean up temp file
            try {
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                }
            } catch (cleanupError) {
                console.error('Failed to cleanup temp file:', cleanupError);
            }
        }
    });
}

function clearSemgrepResults() {
    semgrepDiagnostics.clear();
    vscode.window.showInformationMessage('Semgrep results cleared');
}

function handleDocumentChange(event: vscode.TextDocumentChangeEvent) {
    const filePath = event.document.uri.fsPath;

    // Only process supported file types
    const supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rb', '.php', '.c', '.cpp', '.cs', '.swift', '.kt'];
    const fileExtension = path.extname(filePath);

    if (!supportedExtensions.includes(fileExtension)) {
        return;
    }

    // Find the editor for this document
    const editor = vscode.window.visibleTextEditors.find(
        e => e.document.uri.fsPath === filePath
    );

    if (editor) {
        console.log(`Code changed in ${path.basename(filePath)}, triggering Semgrep re-analysis`);
        runSemgrepOnFileChange(editor);
    }
}

async function runSemgrepOnFileChange(editor: vscode.TextEditor) {
    // Clear any pending analysis
    if (semgrepAnalysisTimer) {
        clearTimeout(semgrepAnalysisTimer);
    }

    // Only analyze files with supported extensions
    const supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rb', '.php', '.c', '.cpp', '.cs', '.swift', '.kt'];
    const filePath = editor.document.uri.fsPath;
    const fileExtension = path.extname(filePath);

    if (!supportedExtensions.includes(fileExtension)) {
        return;
    }

    // Check file size - skip interactive linting for large files
    try {
        const stats = fs.statSync(filePath);
        if (stats.size > MAX_FILE_SIZE_FOR_INTERACTIVE_LINT) {
            console.log(`File ${path.basename(filePath)} is too large (${stats.size} bytes), skipping interactive linting`);
            return;
        }
    } catch (error) {
        console.error('Failed to check file size:', error);
        return;
    }

    // Debounce the analysis by 500ms to avoid running too frequently
    semgrepAnalysisTimer = setTimeout(async () => {
        let tempFile: string | null = null;
        try {
            // Write editor content to temp file instead of auto-saving
            tempFile = writeEditorToTempFile(editor);

            console.log(`Running automatic Semgrep analysis on ${path.basename(filePath)}`);

            // Create Semgrep service instance
            const semgrep = createSemgrepService({
                useBundledPython: false,
                timeout: 60000
            });

            // Check setup before running (silent check)
            const setup = await semgrep.checkSetup();
            if (!setup.isValid) {
                console.log('Semgrep setup is not valid, skipping automatic analysis');
                return;
            }

            // Run analysis on the temp file
            const result = await semgrep.analyzeFile(tempFile!);

            if (!result.success) {
                console.log('Semgrep analysis failed:', result.errors);
                return;
            }

            // Convert Semgrep results to VSCode diagnostics
            const diagnostics: vscode.Diagnostic[] = result.matches.map(match => {
                const range = new vscode.Range(
                    match.start_line - 1,
                    Math.max(0, match.start_column - 1),
                    match.end_line - 1,
                    Math.max(0, match.end_column - 1)
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
                diagnostic.source = 'semgrep';
                diagnostic.code = match.rule_id;

                return diagnostic;
            });

            // Apply diagnostics to the document
            const uri = vscode.Uri.file(filePath);
            semgrepDiagnostics.set(uri, diagnostics);

            // Track which lines have diagnostics for incremental re-analysis
            const lineSet = new Set<number>();
            diagnostics.forEach(diagnostic => {
                for (let line = diagnostic.range.start.line; line <= diagnostic.range.end.line; line++) {
                    lineSet.add(line);
                }
            });
            filesWithDiagnostics.set(filePath, lineSet);

            console.log(`Automatic Semgrep analysis complete: ${result.stats.total_matches} issue(s) found`);
        } catch (error) {
            // Silently fail for automatic analysis
            console.log('Automatic Semgrep analysis error:', error);
        } finally {
            // Clean up temp file
            if (tempFile) {
                try {
                    if (fs.existsSync(tempFile)) {
                        fs.unlinkSync(tempFile);
                    }
                } catch (cleanupError) {
                    console.error('Failed to cleanup temp file:', cleanupError);
                }
            }
        }
    }, 500);
}

/**
 * Runs Semgrep analysis when a file is saved.
 * Only analyzes large files that are skipped by interactive linting.
 */
async function runSemgrepOnFileSave(editor: vscode.TextEditor) {
    // Only analyze files with supported extensions
    const supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rb', '.php', '.c', '.cpp', '.cs', '.swift', '.kt'];
    const filePath = editor.document.uri.fsPath;
    const fileExtension = path.extname(filePath);

    if (!supportedExtensions.includes(fileExtension)) {
        return;
    }

    // Check file size - only analyze large files on save
    try {
        const stats = fs.statSync(filePath);
        if (stats.size <= MAX_FILE_SIZE_FOR_INTERACTIVE_LINT) {
            // Small files are handled by interactive linting
            return;
        }

        console.log(`File ${path.basename(filePath)} is large (${stats.size} bytes), running Semgrep on save`);
    } catch (error) {
        console.error('Failed to check file size:', error);
        return;
    }

    // Run analysis (file is already saved, so we can analyze it directly)
    try {
        const semgrep = createSemgrepService({
            useBundledPython: false,
            timeout: 60000
        });

        // Check setup before running (silent check)
        const setup = await semgrep.checkSetup();
        if (!setup.isValid) {
            console.log('Semgrep setup is not valid, skipping save analysis');
            return;
        }

        // Run analysis on the saved file
        const result = await semgrep.analyzeFile(filePath);

        if (!result.success) {
            console.log('Semgrep analysis failed:', result.errors);
            return;
        }

        // Convert Semgrep results to VSCode diagnostics
        const diagnostics: vscode.Diagnostic[] = result.matches.map(match => {
            const range = new vscode.Range(
                match.start_line - 1,
                Math.max(0, match.start_column - 1),
                match.end_line - 1,
                Math.max(0, match.end_column - 1)
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
            diagnostic.source = 'semgrep';
            diagnostic.code = match.rule_id;

            return diagnostic;
        });

        // Apply diagnostics to the document
        const uri = vscode.Uri.file(filePath);
        semgrepDiagnostics.set(uri, diagnostics);

        // Track which lines have diagnostics
        const lineSet = new Set<number>();
        diagnostics.forEach(diagnostic => {
            for (let line = diagnostic.range.start.line; line <= diagnostic.range.end.line; line++) {
                lineSet.add(line);
            }
        });
        filesWithDiagnostics.set(filePath, lineSet);

        console.log(`Semgrep analysis on save complete: ${result.stats.total_matches} issue(s) found`);
    } catch (error) {
        console.log('Semgrep analysis on save error:', error);
    }
} 