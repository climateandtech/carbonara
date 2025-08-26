import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

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
        method: 'command' | 'npm' | 'file';
        check: string;
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
        this.workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        this.loadTools();
    }

    refresh(): void {
        this.loadTools();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ToolItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ToolItem): Thenable<ToolItem[]> {
        if (!this.workspaceFolder) {
            return Promise.resolve([]);
        }

        if (element) {
            // No children for individual tools
            return Promise.resolve([]);
        } else {
            // Return all tools grouped by status
            return Promise.resolve(this.createToolItems());
        }
    }

    private createToolItems(): ToolItem[] {
        const items: ToolItem[] = [];

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
        try {
            const cliPath = await this.findCarbonaraCLI();
            if (!cliPath) {
                vscode.window.showErrorMessage('Carbonara CLI not found. Please install it first.');
                return;
            }

            // Get tools list from CLI
            const result = await this.runCarbonaraCommand(cliPath, ['tools', '--list']);
            
            // Parse the CLI output to extract tool information
            // For now, we'll load from the registry file directly
            await this.loadToolsFromRegistry(cliPath);
            
        } catch (error: any) {
            console.error('Failed to load tools:', error);
            vscode.window.showErrorMessage(`Failed to load analysis tools: ${error.message}`);
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
                // Fallback: use default tools if registry not found
                this.tools = this.getDefaultTools();
                await this.checkToolInstallationStatus();
            }
        } catch (error: any) {
            console.error('Failed to load tools registry:', error);
            // Use default tools as fallback
            this.tools = this.getDefaultTools();
            await this.checkToolInstallationStatus();
        }
    }

    private getDefaultTools(): AnalysisTool[] {
        return [
            {
                id: 'greenframe',
                name: 'GreenFrame',
                description: 'Carbon footprint analyzer for web applications',
                type: 'external',
                command: 'runGreenFrame'
            },
            {
                id: 'greenframe',
                name: 'GreenFrame',
                description: 'Measure the carbon footprint of web applications',
                type: 'external',
                command: 'greenframe',
                installation: {
                    type: 'npm',
                    package: '@marmelab/greenframe-cli'
                },
                detection: {
                    method: 'command',
                    check: 'greenframe --version'
                }
            },
            {
                id: 'impact-framework',
                name: 'Impact Framework',
                description: 'Green Software Foundation\'s impact measurement framework',
                type: 'external',
                command: 'if-run',
                installation: {
                    type: 'npm',
                    package: '@grnsft/if @tngtech/if-webpage-plugins'
                },
                detection: {
                    method: 'command',
                    check: 'if-run --help'
                }
            }
        ];
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
                const command = tool.detection.check.split(' ')[0];
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
                vscode.window.showErrorMessage('Carbonara CLI not found');
                return;
            }

            vscode.window.showInformationMessage(`Running ${tool.name} analysis...`);
            
            const result = await this.runCarbonaraCommand(cliPath, [
                'analyze', 
                tool.id, 
                url, 
                '--save'
            ]);

            vscode.window.showInformationMessage(`${tool.name} analysis completed!`);
            
            // Refresh data tree to show new results
            vscode.commands.executeCommand('carbonara.refreshData');
            
        } catch (error: any) {
            vscode.window.showErrorMessage(`Analysis failed: ${error.message}`);
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