import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { AssessmentTreeProvider } from './assessment-tree-provider';
import { DataTreeProvider } from './data-tree-provider';

let carbonaraStatusBar: vscode.StatusBarItem;
let assessmentTreeProvider: AssessmentTreeProvider;
let dataTreeProvider: DataTreeProvider;
let currentProjectPath: string | null = null;

export function activate(context: vscode.ExtensionContext) {
    console.log('Carbonara extension is now active!');

    // Create status bar item
    carbonaraStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    carbonaraStatusBar.text = "$(pulse) Carbonara";
    carbonaraStatusBar.tooltip = "Carbonara CO2 Assessment Tools";
    carbonaraStatusBar.command = 'carbonara.showMenu';
    carbonaraStatusBar.show();

    // Create and register tree views
    assessmentTreeProvider = new AssessmentTreeProvider();
    dataTreeProvider = new DataTreeProvider();
    vscode.window.registerTreeDataProvider('carbonara.assessmentTree', assessmentTreeProvider);
    vscode.window.registerTreeDataProvider('carbonara.dataTree', dataTreeProvider);

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
        vscode.commands.registerCommand('carbonara.openProject', openCarbonaraProject)
    ];

    context.subscriptions.push(carbonaraStatusBar, ...commands);

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
            label: '$(folder-opened) Open Carbonara Project',
            description: 'Browse and open a Carbonara project',
            command: 'carbonara.openProject'
        },
        {
            label: '$(rocket) Initialize Project',
            description: 'Set up Carbonara in this workspace',
            command: 'carbonara.initProject'
        },
        {
            label: '$(checklist) Run CO2 Assessment',
            description: 'Complete sustainability questionnaire',
            command: 'carbonara.runAssessment'
        },
        {
            label: '$(globe) Analyze Website',
            description: 'Run Greenframe analysis on a URL',
            command: 'carbonara.analyzeWebsite'
        },
        {
            label: '$(database) View Data',
            description: 'Browse collected assessment data',
            command: 'carbonara.viewData'
        },
        {
            label: '$(gear) Open Configuration',
            description: 'Edit Carbonara settings',
            command: 'carbonara.openConfig'
        },
        {
            label: '$(info) Show Status',
            description: 'Display project status',
            command: 'carbonara.showStatus'
        }
    ];

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a Carbonara action'
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
        prompt: 'Enter project name',
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

    // Run carbonara init command with collected data
    const projectPath = getCurrentProjectPath();
    await runCarbonaraCommand([
        'init', 
        '--path', projectPath,
        '--name', projectName,
        '--description', `${projectName} - Carbonara CO2 assessment project`,
        '--type', projectType.value
    ], 'Initializing Carbonara project...');
    
    // Refresh project status
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
    if (!await checkCarbonaraInstalled()) {
        return;
    }

    const url = await vscode.window.showInputBox({
        prompt: 'Enter website URL to analyze',
        placeHolder: 'https://example.com'
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

    const saveResults = await vscode.window.showQuickPick(
        [
            { label: 'Yes', value: true },
            { label: 'No', value: false }
        ],
        { placeHolder: 'Save results to data lake?' }
    );

    const args = ['greenframe', url];
    if (saveResults?.value) {
        args.push('--save');
    }

    await runCarbonaraCommand(args, `Analyzing ${url}...`);
    
    vscode.window.showInformationMessage('Website analysis completed!');
}

async function viewData() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Please open a workspace folder first');
        return;
    }

    // Show the data tree and refresh it
    vscode.commands.executeCommand('carbonara.dataTree.focus');
    dataTreeProvider.refresh();

    // Show data management options
    const action = await vscode.window.showQuickPick(
        [
            { label: 'View in Sidebar', value: 'view' },
            { label: 'Export as JSON', value: 'export-json' },
            { label: 'Export as CSV', value: 'export-csv' },
            { label: 'Clear All Data', value: 'clear' }
        ],
        { placeHolder: 'Select data action' }
    );

    if (!action) {
        return;
    }

    switch (action.value) {
        case 'view':
            // Already focused on data tree
            vscode.window.showInformationMessage('View your data in the Data & Results sidebar panel');
            break;
        case 'export-json':
            await dataTreeProvider.exportData('json');
            break;
        case 'export-csv':
            await dataTreeProvider.exportData('csv');
            break;
        case 'clear':
            await dataTreeProvider.clearData();
            break;
    }
}

async function showStatus() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Please open a workspace folder first');
        return;
    }

    const projectPath = getCurrentProjectPath();
    const configPath = path.join(projectPath, 'carbonara.config.json');
    const dbPath = path.join(projectPath, 'carbonara.db');

    let status = '# Carbonara Project Status\n\n';
    
    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            status += `**Project**: ${config.name}\n`;
            status += `**Type**: ${config.projectType}\n`;
            status += `**Description**: ${config.description}\n\n`;
        } catch (error) {
            status += '**Configuration**: ❌ Invalid config file\n\n';
        }
    } else {
        status += '**Status**: ❌ Not initialized\n\n';
    }

    status += `**Database**: ${fs.existsSync(dbPath) ? '✅ Present' : '❌ Missing'}\n`;
    status += `**CLI Available**: ${await checkCarbonaraInstalled() ? '✅ Yes' : '❌ No'}\n`;

    // Show in new document
    const doc = await vscode.workspace.openTextDocument({
        content: status,
        language: 'markdown'
    });
    vscode.window.showTextDocument(doc);
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
            label: '🚀 Initialize Carbonara in current workspace', 
            value: 'init',
            description: 'Set up Carbonara in the current workspace'
        },
        { 
            label: '🔍 Search current workspace for projects', 
            value: 'search',
            description: 'Find existing Carbonara projects in subdirectories'
        },
        { 
            label: '📁 Browse for existing config (new window)', 
            value: 'browse',
            description: 'Select a carbonara.config.json file to open its project'
        }
    ], {
        placeHolder: 'How would you like to set up Carbonara?'
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
    if (currentProjectPath) {
        return currentProjectPath;
    }
    
    // Default to workspace root
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    return workspaceFolder?.uri.fsPath || process.cwd();
}

async function checkCarbonaraInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
        // Try to find CLI in the monorepo structure
        const cliPath = findCarbonaraCLI();
        if (!cliPath) {
            resolve(false);
            return;
        }

        const child = spawn('node', [cliPath, '--version'], { stdio: 'pipe' });
        child.on('error', () => resolve(false));
        child.on('close', (code) => resolve(code === 0));
    });
}

async function runCarbonaraCommand(args: string[], message: string): Promise<void> {
    return new Promise((resolve, reject) => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: message,
            cancellable: false
        }, () => {
            return new Promise<void>((progressResolve, progressReject) => {
                const cwd = getCurrentProjectPath();
                
                // Find the CLI tool
                const cliPath = findCarbonaraCLI();
                if (!cliPath) {
                    const errorMessage = 'Carbonara CLI not found. Please install the CLI first.';
                    vscode.window.showErrorMessage(errorMessage);
                    progressReject(new Error(errorMessage));
                    reject(new Error(errorMessage));
                    return;
                }
                
                const child = spawn('node', [cliPath, ...args], {
                    cwd,
                    stdio: 'pipe'
                });

                let output = '';
                let error = '';

                child.stdout?.on('data', (data) => {
                    output += data.toString();
                });

                child.stderr?.on('data', (data) => {
                    error += data.toString();
                });

                child.on('close', (code) => {
                    if (code === 0) {
                        if (output.trim()) {
                            vscode.window.showInformationMessage('Command completed successfully');
                        }
                        progressResolve();
                        resolve();
                    } else {
                        const errorMessage = error || `Command failed with exit code ${code}`;
                        vscode.window.showErrorMessage(`Carbonara CLI Error: ${errorMessage}`);
                        progressReject(new Error(errorMessage));
                        reject(new Error(errorMessage));
                    }
                });

                child.on('error', (err) => {
                    const errorMessage = 'Carbonara CLI not found. Please install the CLI first.';
                    vscode.window.showErrorMessage(errorMessage);
                    progressReject(new Error(errorMessage));
                    reject(new Error(errorMessage));
                });
            });
        });
    });
}

function findCarbonaraCLI(): string | null {
    // Try to find CLI in the monorepo structure
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return null;
    }

    // Check if we're in the monorepo structure
    const monorepoCliPath = path.join(workspaceFolder.uri.fsPath, 'packages', 'cli', 'src', 'index.js');
    if (fs.existsSync(monorepoCliPath)) {
        return monorepoCliPath;
    }

    // Check if we're in a parent of the monorepo
    const parentMonorepoPath = path.join(workspaceFolder.uri.fsPath, '..', 'packages', 'cli', 'src', 'index.js');
    if (fs.existsSync(parentMonorepoPath)) {
        return parentMonorepoPath;
    }

    // Check if CLI is globally installed
    const globalCli = path.join(process.env.HOME || '', '.npm', 'bin', 'carbonara');
    if (fs.existsSync(globalCli)) {
        return globalCli;
    }

    return null;
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
    } else {
        carbonaraStatusBar.text = "$(pulse) Carbonara";
        carbonaraStatusBar.tooltip = "Click to initialize Carbonara project";
    }
} 