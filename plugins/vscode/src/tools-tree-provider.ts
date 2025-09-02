import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { UI_TEXT } from './constants/ui-text';

export interface AnalysisTool {
    id: string;
    name: string;
    description: string;
    type: 'external' | 'built-in';
    command: string;
    installation?: {
        type: 'npm' | 'pip' | 'binary';
        package: string;
        instructions?: string;
    };
    detection?: {
        method: 'command' | 'npm' | 'file' | 'built-in';
        target: string;
    };
    isInstalled?: boolean;
}

export class ToolItem extends vscode.TreeItem {
    constructor(
        public readonly tool: AnalysisTool,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(tool.name, collapsibleState);
        
        this.tooltip = tool.description;
        this.description = tool.type === 'built-in' ? 'Built-in' : (tool.isInstalled ? 'Installed' : 'Not installed');
        
        // Set icon based on installation status
        if (tool.type === 'built-in') {
            this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
        } else if (tool.isInstalled) {
            this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
        } else {
            this.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.orange'));
        }

        // Set context value for different actions
        if (tool.type === 'built-in') {
            this.contextValue = 'builtin-tool';
        } else if (tool.isInstalled) {
            this.contextValue = 'installed-tool';
        } else {
            this.contextValue = 'uninstalled-tool';
        }
    }
}

export class ToolsTreeProvider implements vscode.TreeDataProvider<ToolItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ToolItem | undefined | null | void> = new vscode.EventEmitter<ToolItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ToolItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private tools: AnalysisTool[] = [];
    private workspaceFolder: vscode.WorkspaceFolder | undefined;

    constructor() {
        console.log('🔧 ToolsTreeProvider constructor called');
        this.workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        // Load tools asynchronously and handle errors
        this.loadTools().catch(error => {
            console.error('🔧 Failed to load tools in constructor:', error);
            // Fire change event even if loading failed so UI shows the "no tools" message
            this._onDidChangeTreeData.fire();
        });
    }

    refresh(): void {
        this.loadTools(); // loadTools() already calls _onDidChangeTreeData.fire()
    }

    getTreeItem(element: ToolItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ToolItem): Thenable<ToolItem[]> {
        console.log(`🔍 getChildren called, tools count: ${this.tools.length}, workspaceFolder: ${this.workspaceFolder?.name}`);
        
        // Always show tools, even without workspace folder
        if (element) {
            // No children for individual tools
            return Promise.resolve([]);
        } else {
            // Return all tools grouped by status
            const items = this.createToolItems();
            console.log(`📊 Created ${items.length} tool items`);
            return Promise.resolve(items);
        }
    }

    private createToolItems(): ToolItem[] {
        const items: ToolItem[] = [];

        // If no tools are loaded, show a helpful message
        if (this.tools.length === 0) {
            const noToolsItem = new ToolItem(
                {
                    id: 'no-tools',
                    name: UI_TEXT.TOOLS_TREE.NO_TOOLS,
                    description: UI_TEXT.TOOLS_TREE.NO_TOOLS_DESCRIPTION,
                    type: 'built-in' as const,
                    command: '',
                    isInstalled: false
                },
                vscode.TreeItemCollapsibleState.None
            );
            noToolsItem.iconPath = new vscode.ThemeIcon('info');
            noToolsItem.contextValue = 'no-tools';
            items.push(noToolsItem);
            return items;
        }

        // Group tools by status
        const installedTools = this.tools.filter(tool => tool.type === 'built-in' || tool.isInstalled);
        const uninstalledTools = this.tools.filter(tool => tool.type === 'external' && !tool.isInstalled);

        // Add installed tools
        installedTools.forEach(tool => {
            const analyzeCommand = {
                command: 'carbonara.analyzeTool',
                title: 'Analyze with tool',
                arguments: [tool.id]
            };
            const item = new ToolItem(tool, vscode.TreeItemCollapsibleState.None, analyzeCommand);
            items.push(item);
        });

        // Add uninstalled tools
        uninstalledTools.forEach(tool => {
            const installCommand = {
                command: 'carbonara.installTool',
                title: 'Install tool',
                arguments: [tool.id]
            };
            const item = new ToolItem(tool, vscode.TreeItemCollapsibleState.None, installCommand);
            items.push(item);
        });

        return items;
    }

    private async loadTools(): Promise<void> {
        console.log('🔧 ToolsTreeProvider.loadTools() called');
        try {
            // ALWAYS try workspace tools.json first
            if (await this.loadWorkspaceTools()) {
                console.log('✅ Loaded tools from workspace');
                this._onDidChangeTreeData.fire();
                return;
            }

            // Only if no workspace tools.json, try CLI
            console.log('🔧 No workspace tools.json, trying CLI...');
            const cliPath = await this.findCarbonaraCLI();
            if (cliPath) {
                console.log('🔧 CLI found at:', cliPath);
                await this.loadToolsFromRegistry(cliPath);
                this._onDidChangeTreeData.fire();
                return;
            }

            // Last resort: show "no tools available" message
            console.log('🔧 No CLI found, showing no tools message');
            this.tools = [];
            this._onDidChangeTreeData.fire();
            
        } catch (error: any) {
            console.error('🔧 Failed to load tools:', error);
            this.tools = [];
            this._onDidChangeTreeData.fire();
        }
    }

    private async loadToolsFromRegistry(cliPath: string): Promise<void> {
        try {
            // Find the tools registry file
            const cliDir = path.dirname(cliPath);
            let registryPath = path.join(cliDir, 'src', 'registry', 'tools.json');
            
            // Try different paths for compiled vs source
            if (!fs.existsSync(registryPath)) {
                registryPath = path.join(cliDir, 'dist', 'registry', 'tools.json');
            }
            if (!fs.existsSync(registryPath)) {
                registryPath = path.join(cliDir, '..', 'src', 'registry', 'tools.json');
            }
            
            if (fs.existsSync(registryPath)) {
                const registryContent = fs.readFileSync(registryPath, 'utf8');
                this.tools = JSON.parse(registryContent);
                
                // Check installation status for external tools
                await this.checkToolInstallationStatus();
            } else {
                console.log('❌ CLI registry not found');
                this.tools = [];
            }
        } catch (error: any) {
            console.error('❌ Failed to load tools registry:', error);
            this.tools = [];
        }
    }



    private async checkToolInstallationStatus(): Promise<void> {
        for (const tool of this.tools) {
            if (tool.type === 'built-in') {
                tool.isInstalled = true;
            } else if (tool.detection) {
                tool.isInstalled = await this.checkExternalToolInstallation(tool);
            }
        }
    }

    private async checkExternalToolInstallation(tool: AnalysisTool): Promise<boolean> {
        if (!tool.detection) return false;

        try {
            if (tool.detection.method === 'command') {
                const command = tool.detection.target.split(' ')[0];
                await this.runCommand(command, ['--version']);
                return true;
            }
            // Add other detection methods as needed
            return false;
        } catch {
            return false;
        }
    }

    public async installTool(toolId: string): Promise<void> {
        const tool = this.tools.find(t => t.id === toolId);
        if (!tool || tool.type === 'built-in') {
            return;
        }

        if (!tool.installation) {
            vscode.window.showErrorMessage(`No installation instructions found for ${tool.name}`);
            return;
        }

        try {
            vscode.window.showInformationMessage(`Installing ${tool.name}...`);
            
            if (tool.installation.type === 'npm') {
                await this.runCommand('npm', ['install', '-g', tool.installation.package]);
                vscode.window.showInformationMessage(`${tool.name} installed successfully!`);
            } else {
                vscode.window.showInformationMessage(
                    `Please install ${tool.name} manually: ${tool.installation.instructions || 'See documentation'}`
                );
            }
            
            // Refresh to update installation status
            this.refresh();
            
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to install ${tool.name}: ${error.message}`);
        }
    }

    public async analyzeTool(toolId: string): Promise<void> {
        const tool = this.tools.find(t => t.id === toolId);
        if (!tool) {
            return;
        }

        const url = await vscode.window.showInputBox({
            prompt: `Enter URL to analyze with ${tool.name}`,
            placeHolder: 'https://example.com'
        });

        if (!url) {
            return;
        }

        try {
            const cliPath = await this.findCarbonaraCLI();
            if (!cliPath) {
                vscode.window.showErrorMessage(UI_TEXT.NOTIFICATIONS.CLI_NOT_FOUND);
                return;
            }

            vscode.window.showInformationMessage(UI_TEXT.NOTIFICATIONS.ANALYSIS_RUNNING(tool.name));
            
            const result = await this.runCarbonaraCommand(cliPath, [
                'analyze', 
                tool.id, 
                url, 
                '--save'
            ]);

            vscode.window.showInformationMessage(UI_TEXT.NOTIFICATIONS.ANALYSIS_COMPLETED(tool.name));
            
            // Refresh data tree to show new results
            vscode.commands.executeCommand('carbonara.refreshData');
            
        } catch (error: any) {
            vscode.window.showErrorMessage(`${UI_TEXT.NOTIFICATIONS.ANALYSIS_FAILED} ${error.message}`);
        }
    }

    private async loadWorkspaceTools(): Promise<boolean> {
        console.log('🔧 loadWorkspaceTools called');
        
        if (!this.workspaceFolder) {
            console.log('❌ No workspace folder available');
            return false;
        }

        const workspaceToolsPath = path.join(this.workspaceFolder.uri.fsPath, 'tools.json');
        console.log(`🔧 Checking workspace tools.json at: ${workspaceToolsPath}`);
        
        if (!fs.existsSync(workspaceToolsPath)) {
            console.log('❌ Workspace tools.json not found');
            return false;
        }

        console.log('🔧 Found workspace tools.json, loading...');
        try {
            const toolsData = JSON.parse(fs.readFileSync(workspaceToolsPath, 'utf8'));
            console.log(`🔧 Workspace tools.json contains ${toolsData.tools.length} tools:`, toolsData.tools.map((t: any) => t.name));
            
            this.tools = await Promise.all(toolsData.tools.map(async (tool: any) => {
                const isBuiltIn = tool.installation?.type === 'built-in';
                const isInstalled = isBuiltIn ? true : await this.detectToolInstallation(tool);
                console.log(`🔧 Processed tool: ${tool.name} (built-in: ${isBuiltIn}, installed: ${isInstalled})`);
                return {
                    ...tool,
                    type: isBuiltIn ? 'built-in' : 'external',
                    command: tool.command?.executable || tool.command,
                    isInstalled
                };
            }));
            
            console.log(`✅ Loaded ${this.tools.length} tools from workspace registry`);
            return true;
            
        } catch (error) {
            console.log('❌ Failed to parse workspace tools.json:', error);
            return false;
        }
    }

    private async detectToolInstallation(tool: any): Promise<boolean> {
        // During E2E tests, force external tools to be "not installed" for predictable results
        if (process.env.CARBONARA_E2E_TEST === 'true' && tool.detection?.method === 'command') {
            console.log(`🧪 E2E Test Mode: Tool ${tool.id} forced to 'not installed' for predictable testing`);
            return false;
        }

        if (!tool.detection) {
            throw new Error(`Tool ${tool.id} has no detection configuration - cannot determine installation status`);
        }
        
        if (tool.detection.method !== 'command') {
            throw new Error(`Tool ${tool.id} has unsupported detection method '${tool.detection.method}' - only 'command' is supported`);
        }

        if (!tool.detection.target) {
            throw new Error(`Tool ${tool.id} has no detection target command specified`);
        }

        try {
            // Run the detection command to see if tool is installed
            const command = tool.detection.target;
            console.log(`🔍 Detecting ${tool.id} installation: running '${command}'`);
            await this.runCommand('sh', ['-c', command]);
            console.log(`✅ Tool ${tool.id} is installed (command succeeded)`);
            return true; // Command succeeded, tool is installed
        } catch (error) {
            console.log(`❌ Tool ${tool.id} is not installed (command failed): ${error}`);
            return false; // Command failed, tool is not installed
        }
    }

    private async findCarbonaraCLI(): Promise<string | null> {
        // Check environment variable first
        const envPath = process.env.CARBONARA_CLI_PATH;
        if (envPath && fs.existsSync(envPath)) {
            return envPath;
        }

        // Check if we're in the monorepo
        const workspaceRoot = this.workspaceFolder?.uri.fsPath;
        if (workspaceRoot) {
            const monorepoCliPath = path.join(workspaceRoot, '..', '..', 'packages', 'cli', 'dist', 'index.js');
            if (fs.existsSync(monorepoCliPath)) {
                return monorepoCliPath;
            }
        }

        // Try global installation
        try {
            await this.runCommand('carbonara', ['--version']);
            return 'carbonara';
        } catch {
            return null;
        }
    }

    private async runCarbonaraCommand(cliPath: string, args: string[]): Promise<string> {
        if (cliPath.endsWith('.js')) {
            return this.runCommand('node', [cliPath, ...args]);
        } else {
            return this.runCommand(cliPath, args);
        }
    }

    private runCommand(command: string, args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            const process = spawn(command, args, {
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: true
            });

            let stdout = '';
            let stderr = '';

            process.stdout?.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr?.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout);
                } else {
                    reject(new Error(stderr || `Process exited with code ${code}`));
                }
            });

            process.on('error', (error) => {
                reject(error);
            });
        });
    }
}