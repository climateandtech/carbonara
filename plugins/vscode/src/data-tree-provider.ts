import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { UI_TEXT } from './constants/ui-text';

export class DataItem extends vscode.TreeItem {
    public toolName?: string;
    public entries?: any[];
    
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'group' | 'entry' | 'detail' | 'info' | 'error',
        toolName?: string,
        public readonly entryId?: number
    ) {
        super(label, collapsibleState);
        this.tooltip = description;
        this.description = description;
        this.toolName = toolName;
        
        // Set context value for menu contributions
        switch (type) {
            case 'group':
                this.contextValue = 'carbonara-data-group';
                break;
            case 'entry':
                this.contextValue = 'carbonara-data-entry';
                break;
            case 'detail':
                this.contextValue = 'carbonara-data-detail';
                break;
            default:
                this.contextValue = 'carbonara-data-item';
        }
        
        // Set icons
        switch (type) {
            case 'group':
                this.iconPath = new vscode.ThemeIcon('folder');
                break;
            case 'entry':
                this.iconPath = new vscode.ThemeIcon('file');
                break;
            case 'detail':
                this.iconPath = new vscode.ThemeIcon('symbol-property');
                break;
            case 'error':
                this.iconPath = new vscode.ThemeIcon('error');
                break;
            case 'info':
                this.iconPath = new vscode.ThemeIcon('info');
                break;
        }
    }
}

export class DataTreeProvider implements vscode.TreeDataProvider<DataItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DataItem | undefined | null | void> = new vscode.EventEmitter<DataItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DataItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    private workspaceFolder: vscode.WorkspaceFolder | undefined;
    private cachedData: any[] = [];

    constructor() {
        console.log('🏗️ DataTreeProvider constructor called');
        this.workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        console.log(`🏗️ Workspace folder: ${this.workspaceFolder?.name || 'none'}`);
        
        // Load data asynchronously and handle errors
        this.loadData().catch(error => {
            console.error('🏗️ Failed to load data in constructor:', error);
            // Fire change event even if loading failed so UI shows appropriate message
            this._onDidChangeTreeData.fire();
        });
    }

    refresh(): void {
        console.log('🔄 DataTreeProvider.refresh() called - clearing cache and refreshing');
        this.cachedData = [];
        this.loadData(); // loadData() already calls _onDidChangeTreeData.fire()
    }

    getTreeItem(element: DataItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: DataItem): Thenable<DataItem[]> {
        console.log(`🔍 getChildren called - element: ${element?.label || 'root'}`);
        
        if (!this.workspaceFolder) {
            console.log('⚠️ No workspace folder');
            return Promise.resolve([new DataItem('No workspace folder', 'Open a workspace to view data', vscode.TreeItemCollapsibleState.None, 'info')]);
        }

        if (element) {
            // Handle different element types
            if (element.type === 'group') {
                return this.loadGroupEntries(element);
            } else if (element.type === 'entry') {
                return this.loadEntryDetails(element);
            } else {
                // Info/error items have no children
                return Promise.resolve([]);
            }
        } else {
            // Root level - show all data
            return this.loadRootData();
        }
    }

    private async loadRootData(): Promise<DataItem[]> {
        try {
            console.log('📊 Loading root data...');
            
            // If we have cached data, return it
            if (this.cachedData.length > 0) {
                console.log(`📊 Returning ${this.cachedData.length} cached data entries`);
                return this.convertDataToTreeItems(this.cachedData);
            }

            // Load data from CLI
            await this.loadDataFromCLI('carbonara');
            
            if (this.cachedData.length === 0) {
                return [new DataItem(UI_TEXT.DATA_TREE.NO_DATA, UI_TEXT.DATA_TREE.NO_DATA_DESCRIPTION, vscode.TreeItemCollapsibleState.None, 'info')];
            }

            console.log(`📊 Loaded ${this.cachedData.length} data entries from CLI`);
            return this.convertDataToTreeItems(this.cachedData);
            
        } catch (error) {
            console.error('❌ Error loading root data:', error);
            return [new DataItem('Error loading data', error instanceof Error ? error.message : String(error), vscode.TreeItemCollapsibleState.None, 'error')];
        }
    }

    private async loadGroupEntries(group: DataItem): Promise<DataItem[]> {
        console.log(`📊 Loading entries for group: ${group.label}`);
        
        if (!group.entries) {
            return [new DataItem('No entries', 'No data entries found for this group', vscode.TreeItemCollapsibleState.None, 'info')];
        }

        return group.entries.map((entry: any, index: number) => {
            const entryLabel = entry.url || entry.timestamp || `Entry ${index + 1}`;
            const entryDescription = entry.timestamp ? `Analyzed on ${entry.timestamp}` : 'Analysis entry';
            
            return new DataItem(
                entryLabel,
                entryDescription,
                vscode.TreeItemCollapsibleState.Collapsed,
                'entry',
                group.toolName,
                entry.id
            );
        });
    }

    private async loadEntryDetails(entry: DataItem): Promise<DataItem[]> {
        console.log(`📊 Loading details for entry: ${entry.label}`);
        
        if (!entry.entries || entry.entries.length === 0) {
            return [new DataItem('No details available', 'No detailed data found for this entry', vscode.TreeItemCollapsibleState.None, 'info')];
        }

        const entryData = entry.entries[0];
        const details: DataItem[] = [];

        // Add basic information
        if (entryData.timestamp) {
            details.push(new DataItem('Analysis Date', entryData.timestamp, vscode.TreeItemCollapsibleState.None, 'detail'));
        }
        
        if (entryData.tool_name) {
            details.push(new DataItem('Tool Used', entryData.tool_name, vscode.TreeItemCollapsibleState.None, 'detail'));
        }
        
        if (entryData.url) {
            details.push(new DataItem('URL', entryData.url, vscode.TreeItemCollapsibleState.None, 'detail'));
        }

        // Add data results if available
        if (entryData.data) {
            Object.keys(entryData.data).forEach(key => {
                const value = entryData.data[key];
                details.push(new DataItem(
                    key,
                    typeof value === 'object' ? JSON.stringify(value) : String(value),
                    vscode.TreeItemCollapsibleState.None,
                    'detail'
                ));
            });
        }

        // Add summary if available
        if (entryData.summary) {
            if (entryData.summary.status) {
                details.push(new DataItem('Status', entryData.summary.status, vscode.TreeItemCollapsibleState.None, 'detail'));
            }
            if (entryData.summary.message) {
                details.push(new DataItem('Message', entryData.summary.message, vscode.TreeItemCollapsibleState.None, 'detail'));
            }
        }

        return details.length > 0 ? details : [new DataItem('No details available', 'No detailed data found for this entry', vscode.TreeItemCollapsibleState.None, 'info')];
    }

    private async loadData(): Promise<void> {
        console.log('📊 DataTreeProvider.loadData() called');
        try {
            // ALWAYS try workspace data first
            if (await this.loadWorkspaceData()) {
                console.log('✅ Loaded data from workspace');
                this._onDidChangeTreeData.fire();
                return;
            }

            // Only if no workspace data, try CLI
            console.log('📊 No workspace data, trying CLI...');
            const cliPath = await this.findCarbonaraCLI();
            if (cliPath) {
                console.log('📊 CLI found at:', cliPath);
                await this.loadDataFromCLI(cliPath);
                this._onDidChangeTreeData.fire();
                return;
            }

            // Last resort: show "no data available" message
            console.log('📊 No CLI found, showing no data message');
            this.cachedData = [];
            this._onDidChangeTreeData.fire();
            
        } catch (error: any) {
            console.error('❌ Failed to load data:', error);
            this.cachedData = [];
            this._onDidChangeTreeData.fire();
        }
    }

    private async loadWorkspaceData(): Promise<boolean> {
        console.log('📊 loadWorkspaceData called');
        
        if (!this.workspaceFolder) {
            console.log('❌ No workspace folder available');
            return false;
        }

        const workspaceDataPath = path.join(this.workspaceFolder.uri.fsPath, 'carbonara.db');
        console.log(`📊 Checking workspace data at: ${workspaceDataPath}`);
        
        if (!fs.existsSync(workspaceDataPath)) {
            console.log('❌ Workspace data not found');
            return false;
        }

        console.log('📊 Found workspace data, loading...');
        try {
            await this.loadDataFromCLI('carbonara');
            console.log(`✅ Loaded ${this.cachedData.length} data entries from workspace`);
            return true;
            
        } catch (error) {
            console.log('❌ Failed to load workspace data:', error);
            return false;
        }
    }

    private async loadDataFromCLI(cliPath: string): Promise<void> {
        try {
            console.log(`📊 Loading data from CLI`);
            
            const data = await this.runCarbonaraCommand(['data', '--json']);
            const parsedData = JSON.parse(data);
            this.cachedData = Array.isArray(parsedData) ? parsedData : [];
            console.log(`✅ Loaded ${this.cachedData.length} data entries from CLI`);
            
        } catch (error: any) {
            console.error('❌ Failed to load data from CLI:', error);
            this.cachedData = [];
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
            const monorepoCliPath = path.join(workspaceRoot, '..', '..', '..', 'packages', 'cli', 'dist', 'index.js');
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

    private convertDataToTreeItems(data: any[]): DataItem[] {
        if (data.length === 0) {
            return [new DataItem(UI_TEXT.DATA_TREE.NO_DATA, UI_TEXT.DATA_TREE.NO_DATA_DESCRIPTION, vscode.TreeItemCollapsibleState.None, 'info')];
        }

        // Group data by tool name
        const groupedData: { [toolName: string]: any[] } = {};
        data.forEach(entry => {
            const toolName = entry.tool_name || 'Unknown Tool';
            if (!groupedData[toolName]) {
                groupedData[toolName] = [];
            }
            groupedData[toolName].push(entry);
        });

        // Create tree items for each group
        const items: DataItem[] = [];
        Object.keys(groupedData).forEach(toolName => {
            const entries = groupedData[toolName];
            const groupLabel = `Analysis results from ${toolName}`;
            const groupDescription = `${entries.length} analysis ${entries.length === 1 ? 'entry' : 'entries'}`;
            
            const groupItem = new DataItem(
                groupLabel,
                groupDescription,
                vscode.TreeItemCollapsibleState.Expanded,
                'group',
                toolName
            );
            
            // Store entries in the group item for later access
            groupItem.entries = entries;
            items.push(groupItem);
        });

        return items;
    }

    // Public methods for commands
    public async exportData(format: 'json' | 'csv' = 'json'): Promise<void> {
        if (!this.workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder available');
            return;
        }

        try {
            vscode.window.showInformationMessage('Exporting data...');
            
            const result = await this.runCarbonaraCommand([
                'export',
                `--format=${format}`
            ]);

            // Save to file
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `carbonara-export-${timestamp}.${format}`;
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(path.join(this.workspaceFolder.uri.fsPath, filename)),
                filters: {
                    'JSON': ['json'],
                    'CSV': ['csv'],
                    'All Files': ['*']
                }
            });

            if (uri) {
                fs.writeFileSync(uri.fsPath, result);
                vscode.window.showInformationMessage(`Data exported to ${path.basename(uri.fsPath)}`);
            }
            
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to export data: ${error.message}`);
        }
    }

    public async clearData(): Promise<void> {
        if (!this.workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder available');
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            'Are you sure you want to clear all analysis data?',
            'Yes', 'No'
        );

        if (confirm === 'Yes') {
            try {
                await this.runCarbonaraCommand(['clear']);
                this.refresh();
                vscode.window.showInformationMessage('Analysis data cleared');
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to clear data: ${error.message}`);
            }
        }
    }

    public async getProjectStats(): Promise<{ totalEntries: number; toolCounts: { [toolName: string]: number } }> {
        if (!this.workspaceFolder) {
            return { totalEntries: 0, toolCounts: {} };
        }

        try {
            // Load current data to calculate stats
            await this.loadDataFromCLI('carbonara');
            
            const toolCounts: { [toolName: string]: number } = {};
            let totalEntries = 0;

            this.cachedData.forEach(entry => {
                const toolName = entry.tool_name || 'Unknown Tool';
                toolCounts[toolName] = (toolCounts[toolName] || 0) + 1;
                totalEntries++;
            });

            return { totalEntries, toolCounts };
        } catch (error) {
            console.error('Error getting project stats:', error);
            return { totalEntries: 0, toolCounts: {} };
        }
    }

    private async runCarbonaraCommand(args: string[]): Promise<string> {
        if (!this.workspaceFolder) {
            throw new Error('No workspace folder available');
        }

        return this.runCommand('carbonara', args);
    }

    private runCommand(command: string, args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            const process = spawn(command, args, {
                cwd: this.workspaceFolder?.uri.fsPath,
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