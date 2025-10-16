import * as vscode from 'vscode';
import { UI_TEXT } from './constants/ui-text';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { AssessmentTreeProvider } from './assessment-tree-provider';
import { DataTreeProvider } from './data-tree-provider';
import { ToolsTreeProvider } from './tools-tree-provider';
import { UnifiedHighlighter, registerUnifiedCommands } from './unified-highlighter';


let carbonaraStatusBar: vscode.StatusBarItem;
let assessmentTreeProvider: AssessmentTreeProvider;
let dataTreeProvider: DataTreeProvider;
let toolsTreeProvider: ToolsTreeProvider;
let unifiedHighlighter: UnifiedHighlighter;

let currentProjectPath: string | null = null;

async function initializeTreeProviders(context: vscode.ExtensionContext) {
    // Wait for workspace folder to be available
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds max wait
    
    while (attempts < maxAttempts) {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            console.log(`✅ Workspace folder detected: ${vscode.workspace.workspaceFolders[0].name}`);
            break;
        }
        
        console.log(`⏳ Waiting for workspace folder... (attempt ${attempts + 1}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
    
    if (attempts >= maxAttempts) {
        console.log('⚠️ Workspace folder not detected after 5 seconds, proceeding anyway');
    }

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
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('🚀 Carbonara extension is now active!');
    console.log('🚀 Extension activation started...');

    // Create status bar item
    carbonaraStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    carbonaraStatusBar.text = UI_TEXT.STATUS_BAR.TEXT;
    carbonaraStatusBar.tooltip = UI_TEXT.STATUS_BAR.TOOLTIP;
    // Make it uniquely selectable in tests and accessible UIs
    carbonaraStatusBar.accessibilityInformation = { label: UI_TEXT.STATUS_BAR.ARIA_LABEL };
    carbonaraStatusBar.command = 'carbonara.showMenu';
    carbonaraStatusBar.show();

    // Initialize tree providers after workspace is ready
    await initializeTreeProviders(context);
    
    // Create UnifiedHighlighter after tree providers are initialized
    console.log('🔧 Creating UnifiedHighlighter...');
    try {
      unifiedHighlighter = new UnifiedHighlighter(context);
      console.log('✅ UnifiedHighlighter created successfully');
    } catch (error) {
      console.error('❌ Failed to create UnifiedHighlighter:', error);
      console.error('❌ Error details:', error);
    }

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
        vscode.commands.registerCommand('carbonara.analyzeTool', (toolId) => toolsTreeProvider.analyzeTool(toolId))

    ];

    // Register unified highlighting commands
    console.log('🔧 Registering unified highlighting commands...');
    if (unifiedHighlighter) {
      registerUnifiedCommands(context, unifiedHighlighter);
      console.log('✅ Unified highlighting commands registered');
    } else {
      console.error('❌ Cannot register commands - unifiedHighlighter is null');
    }

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

    // Check if project is already initialized
    checkProjectStatus();
    
    // Initialize unified highlighter
    unifiedHighlighter.initialize().then(() => {
        console.log('✅ Unified highlighter initialized');
    }).catch((error) => {
        console.log('⚠️ Unified highlighter initialization failed:', error);
    });
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

    // Always ensure a basic project structure exists locally first (never fail)
    await ensureLocalCarbonaraProject(projectPath, projectName, projectType.value);

    // Try to run CLI initialization to enrich setup if available, but do NOT fail if it isn't
    const cliAvailable = await checkCarbonaraInstalled();
    if (cliAvailable) {
        try {
            await runCarbonaraCommand([
                'init',
                '--path', projectPath
            ], 'Initializing Carbonara project...');
        } catch {
            // Soft fail: we already created a local config
        }
    } else {
        promptInstallCli('Project initialized locally. Install Carbonara CLI to unlock all features.');
    }

    // Ensure UI reflects the new project
    assessmentTreeProvider.refresh();
    dataTreeProvider.refresh();

    // Refresh project status regardless of CLI outcome
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

function promptInstallCli(message?: string) {
    const text = message || 'Carbonara CLI is not installed. Install it to enable advanced features.';
    vscode.window.showInformationMessage(text, 'Install CLI', 'Later').then(selection => {
        if (selection === 'Install CLI') {
            vscode.commands.executeCommand('carbonara.installCli');
        }
    });
}

async function installCli(): Promise<void> {
    // Offer to install using npm -g
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

// Robust CLI resolution helpers

type ResolvedCli = { mode: 'global' } | { mode: 'path', path: string };

function resolveCarbonaraCli(): ResolvedCli | null {
    // 1) Explicit env override (used by tests/CI)
    const envCli = process.env.CARBONARA_CLI_PATH;
    if (envCli && fs.existsSync(envCli)) {
        return { mode: 'path', path: envCli };
    }

    // 2) If a global binary exists, prefer that to avoid bundling/ESM issues
    const globalCandidates = [
        path.join((process.env.HOME || ''), '.npm', 'bin', 'carbonara'),
        '/usr/local/bin/carbonara',
        '/opt/homebrew/bin/carbonara',
        '/usr/bin/carbonara'
    ];
    for (const p of globalCandidates) {
        if (fs.existsSync(p)) return { mode: 'path', path: p };
    }

    // 3) As a last resort, try just calling the binary by name and let PATH resolve it at runtime
    return { mode: 'global' };
}

async function checkCarbonaraInstalled(): Promise<boolean> {
    const resolved = resolveCarbonaraCli();
    return new Promise<boolean>((resolve) => {
        try {
            let child;
            if (!resolved) {
                resolve(false);
                return;
            }
            if (resolved.mode === 'path') {
                // Try invoking with --version; if path points to a JS file, execute via node
                if (resolved.path.endsWith('.js')) {
                    child = spawn('node', [resolved.path, '--version'], { stdio: 'ignore' });
                } else {
                    child = spawn(resolved.path, ['--version'], { stdio: 'ignore' });
                }
            } else {
                child = spawn('carbonara', ['--version'], { stdio: 'ignore' });
            }
            child.on('close', (code) => resolve(code === 0));
            child.on('error', () => resolve(false));
        } catch {
            resolve(false);
        }
    });
}

async function runCarbonaraCommand(args: string[], message: string): Promise<void> {
    const resolved = resolveCarbonaraCli();

    if (!resolved) {
        promptInstallCli();
        return; // Never throw – keep UX resilient
    }

    const output = vscode.window.createOutputChannel('Carbonara');
    output.appendLine(`[Carbonara] ${message}`);
    output.appendLine(`[Carbonara] CLI args: ${args.join(' ')}`);

    return new Promise((resolve) => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: message + ' (see Output: Carbonara)',
            cancellable: true
        }, (progress, token) => {
            return new Promise<void>((progressResolve) => {
                const cwd = getCurrentProjectPath();

                let child: import('child_process').ChildProcess;
                if (resolved.mode === 'path') {
                    if (resolved.path.endsWith('.js')) {
                        child = spawn('node', [resolved.path, ...args], { cwd, stdio: 'pipe' });
                    } else {
                        child = spawn(resolved.path, [...args], { cwd, stdio: 'pipe' });
                    }
                } else {
                    child = spawn('carbonara', [...args], { cwd, stdio: 'pipe' });
                }

                let outputBuf = '';
                let errorBuf = '';
                let finished = false;

                // 45s safety timeout
                const timeoutMs = 45000;
                const timeout = setTimeout(() => {
                    if (finished) return;
                    output.appendLine('[Carbonara] Command timed out. Terminating process...');
                    try { child.kill(); } catch {}
                    promptInstallCli('Carbonara CLI timed out.');
                    finished = true;
                    progressResolve();
                    resolve();
                }, timeoutMs);

                token.onCancellationRequested(() => {
                    output.appendLine('[Carbonara] Operation cancelled by user. Killing process...');
                    try { child.kill(); } catch {}
                });

                child.stdout?.on('data', (data) => {
                    const text = data.toString();
                    outputBuf += text;
                    output.append(text);
                });
                child.stderr?.on('data', (data) => {
                    const text = data.toString();
                    errorBuf += text;
                    output.append(text);
                });

                child.on('close', (code) => {
                    if (finished) return;
                    finished = true;
                    clearTimeout(timeout);
                    if (code === 0) {
                        if (outputBuf.trim()) {
                            vscode.window.showInformationMessage('Carbonara: command completed');
                        }
                        progressResolve();
                        resolve();
                    } else {
                        const errorMessage = errorBuf || `Command failed with exit code ${code}`;
                        output.appendLine(`[Carbonara] ERROR: ${errorMessage}`);
                        // Do not crash the flow – show actionable message with Install button
                        promptInstallCli(`Carbonara CLI Error: ${errorMessage}`);
                        progressResolve();
                        resolve();
                    }
                });

                child.on('error', (err) => {
                    if (finished) return;
                    finished = true;
                    clearTimeout(timeout);
                    output.appendLine(`[Carbonara] Failed to start CLI: ${String(err)}`);
                    promptInstallCli('Carbonara CLI not found.');
                    progressResolve();
                    resolve();
                });
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