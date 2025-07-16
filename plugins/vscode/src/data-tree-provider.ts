import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

export interface DataEntry {
    id: number;
    tool_name: string;
    data_type: string;
    timestamp: string;
    data: any;
    source: string;
}

export class DataTreeProvider implements vscode.TreeDataProvider<DataItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DataItem | undefined | null | void> = new vscode.EventEmitter<DataItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DataItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private dataEntries: DataEntry[] = [];
    private workspaceFolder: vscode.WorkspaceFolder | undefined;

    constructor() {
        this.workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        this.loadData();
    }

    refresh(): void {
        this.loadData();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DataItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: DataItem): Thenable<DataItem[]> {
        if (!this.workspaceFolder) {
            return Promise.resolve([]);
        }

        if (element) {
            // Return details for a specific data entry
            const entry = this.dataEntries.find(e => e.id === element.entryId);
            if (entry) {
                return Promise.resolve(this.createDataDetails(entry));
            }
        } else {
            // Return grouped data entries
            return Promise.resolve(this.createGroupedItems());
        }

        return Promise.resolve([]);
    }

    private createGroupedItems(): DataItem[] {
        const groups: { [key: string]: DataEntry[] } = {};
        
        // Group by tool name
        this.dataEntries.forEach(entry => {
            if (!groups[entry.tool_name]) {
                groups[entry.tool_name] = [];
            }
            groups[entry.tool_name].push(entry);
        });

        const items: DataItem[] = [];

        // CO2 Assessments
        if (groups['co2-assessment']) {
            const assessments = groups['co2-assessment'];
            items.push(new DataItem(
                `🌍 CO2 Assessments (${assessments.length})`,
                'Sustainability assessments',
                vscode.TreeItemCollapsibleState.Expanded,
                'group',
                'co2-assessment'
            ));
            
            assessments.forEach(assessment => {
                const date = new Date(assessment.timestamp).toLocaleDateString();
                let description = `Score: ${assessment.data.impactScore || 'N/A'}/100`;
                
                items.push(new DataItem(
                    `📊 Assessment - ${date}`,
                    description,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'entry',
                    'co2-assessment',
                    assessment.id
                ));
            });
        }

        // Website Tests
        if (groups['website-test']) {
            const tests = groups['website-test'];
            items.push(new DataItem(
                `🌐 Website Tests (${tests.length})`,
                'Website analysis results',
                vscode.TreeItemCollapsibleState.Expanded,
                'group',
                'website-test'
            ));
            
            tests.forEach(test => {
                const date = new Date(test.timestamp).toLocaleDateString();
                let description = 'Website analysis';
                
                if (test.data.results && test.data.results.totalKB) {
                    description = `${test.data.results.totalKB} KB transferred`;
                }
                
                items.push(new DataItem(
                    `🔍 ${test.data.url || 'Website'} - ${date}`,
                    description,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'entry',
                    'website-test',
                    test.id
                ));
            });
        }

        // Greenframe Analysis
        if (groups['greenframe']) {
            const analyses = groups['greenframe'];
            items.push(new DataItem(
                `🌱 Greenframe Analysis (${analyses.length})`,
                'Carbon footprint analysis',
                vscode.TreeItemCollapsibleState.Expanded,
                'group',
                'greenframe'
            ));
            
            analyses.forEach(analysis => {
                const date = new Date(analysis.timestamp).toLocaleDateString();
                let description = 'Carbon analysis';
                
                if (analysis.data.results && analysis.data.results.carbon) {
                    description = `${analysis.data.results.carbon.total}g CO2`;
                }
                
                items.push(new DataItem(
                    `🔬 ${analysis.data.url || 'Analysis'} - ${date}`,
                    description,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'entry',
                    'greenframe',
                    analysis.id
                ));
            });
        }

        if (items.length === 0) {
            items.push(new DataItem(
                'No data available',
                'Run assessments to see data here',
                vscode.TreeItemCollapsibleState.None,
                'empty'
            ));
        }

        return items;
    }

    private createDataDetails(entry: DataEntry): DataItem[] {
        const items: DataItem[] = [];

        switch (entry.tool_name) {
            case 'co2-assessment':
                items.push(...this.createAssessmentDetails(entry));
                break;
            case 'website-test':
                items.push(...this.createWebsiteTestDetails(entry));
                break;
            case 'greenframe':
                items.push(...this.createGreenframeDetails(entry));
                break;
        }

        return items;
    }

    private createAssessmentDetails(entry: DataEntry): DataItem[] {
        const items: DataItem[] = [];
        const data = entry.data;

        if (data.impactScore !== undefined) {
            const scoreColor = data.impactScore >= 70 ? '🔴' : data.impactScore >= 40 ? '🟡' : '🟢';
            items.push(new DataItem(
                `${scoreColor} Impact Score: ${data.impactScore}/100`,
                'Lower is better',
                vscode.TreeItemCollapsibleState.None,
                'detail'
            ));
        }

        if (data.projectInfo) {
            items.push(new DataItem(
                `👥 Users: ${data.projectInfo.expectedUsers?.toLocaleString() || 'N/A'}`,
                'Expected users',
                vscode.TreeItemCollapsibleState.None,
                'detail'
            ));
            
            items.push(new DataItem(
                `📈 Traffic: ${data.projectInfo.expectedTraffic || 'N/A'}`,
                'Expected traffic level',
                vscode.TreeItemCollapsibleState.None,
                'detail'
            ));
        }

        if (data.infrastructure) {
            items.push(new DataItem(
                `🏗️ Hosting: ${data.infrastructure.hostingType || 'N/A'}`,
                'Hosting type',
                vscode.TreeItemCollapsibleState.None,
                'detail'
            ));
            
            items.push(new DataItem(
                `💾 Storage: ${data.infrastructure.dataStorage || 'N/A'}`,
                'Data storage requirements',
                vscode.TreeItemCollapsibleState.None,
                'detail'
            ));
        }

        if (data.sustainabilityGoals) {
            items.push(new DataItem(
                `🎯 Carbon Neutral: ${data.sustainabilityGoals.carbonNeutralityTarget ? 'Yes' : 'No'}`,
                'Carbon neutrality target',
                vscode.TreeItemCollapsibleState.None,
                'detail'
            ));
        }

        return items;
    }

    private createWebsiteTestDetails(entry: DataEntry): DataItem[] {
        const items: DataItem[] = [];
        const data = entry.data;

        if (data.url) {
            items.push(new DataItem(
                `🌐 URL: ${data.url}`,
                'Analyzed website',
                vscode.TreeItemCollapsibleState.None,
                'detail'
            ));
        }

        if (data.results) {
            const results = data.results;
            
            if (results.totalKB) {
                items.push(new DataItem(
                    `📊 Data Transfer: ${results.totalKB} KB`,
                    'Total data transferred',
                    vscode.TreeItemCollapsibleState.None,
                    'detail'
                ));
            }

            if (results.requestCount) {
                items.push(new DataItem(
                    `🔗 Requests: ${results.requestCount}`,
                    'Number of HTTP requests',
                    vscode.TreeItemCollapsibleState.None,
                    'detail'
                ));
            }

            if (results.performance && results.performance.loadTime) {
                items.push(new DataItem(
                    `⚡ Load Time: ${results.performance.loadTime}ms`,
                    'Page load time',
                    vscode.TreeItemCollapsibleState.None,
                    'detail'
                ));
            }

            if (results.carbonEstimate) {
                items.push(new DataItem(
                    `🌱 CO2 Estimate: ${results.carbonEstimate}g`,
                    'Estimated carbon footprint',
                    vscode.TreeItemCollapsibleState.None,
                    'detail'
                ));
            }
        }

        return items;
    }

    private createGreenframeDetails(entry: DataEntry): DataItem[] {
        const items: DataItem[] = [];
        const data = entry.data;

        if (data.url) {
            items.push(new DataItem(
                `🌐 URL: ${data.url}`,
                'Analyzed website',
                vscode.TreeItemCollapsibleState.None,
                'detail'
            ));
        }

        if (data.results) {
            const results = data.results;
            
            if (results.carbon && results.carbon.total) {
                items.push(new DataItem(
                    `🌱 Carbon: ${results.carbon.total}g CO2`,
                    'Total carbon footprint',
                    vscode.TreeItemCollapsibleState.None,
                    'detail'
                ));
            }

            if (results.score) {
                const scoreColor = results.score >= 75 ? '🟢' : results.score >= 50 ? '🟡' : '🔴';
                items.push(new DataItem(
                    `${scoreColor} Score: ${results.score}/100`,
                    'Sustainability score',
                    vscode.TreeItemCollapsibleState.None,
                    'detail'
                ));
            }

            if (results.performance) {
                const perf = results.performance;
                
                if (perf.loadTime) {
                    items.push(new DataItem(
                        `⚡ Load Time: ${perf.loadTime}ms`,
                        'Page load time',
                        vscode.TreeItemCollapsibleState.None,
                        'detail'
                    ));
                }

                if (perf.pageSize) {
                    items.push(new DataItem(
                        `📊 Page Size: ${perf.pageSize}KB`,
                        'Total page size',
                        vscode.TreeItemCollapsibleState.None,
                        'detail'
                    ));
                }
            }
        }

        return items;
    }

    private loadData(): void {
        if (!this.workspaceFolder) {
            this.dataEntries = [];
            return;
        }

        const configPath = path.join(this.workspaceFolder.uri.fsPath, 'carbonara.config.json');
        if (!fs.existsSync(configPath)) {
            this.dataEntries = [];
            return;
        }

        // Use CLI to get data
        const cliPath = this.findCarbonaraCLI();
        if (!cliPath) {
            this.dataEntries = [];
            return;
        }

        const child = spawn('node', [cliPath, 'data', '--export', 'json'], {
            cwd: this.workspaceFolder.uri.fsPath,
            stdio: 'pipe'
        });

        let output = '';
        child.stdout?.on('data', (data: Buffer) => {
            output += data.toString();
        });

        child.on('close', (code: number | null) => {
            if (code === 0) {
                try {
                    // Parse the CLI output to extract data
                    const lines = output.split('\n');
                    const jsonMatch = lines.find(line => line.startsWith('[') || line.startsWith('{'));
                    if (jsonMatch) {
                        const data = JSON.parse(jsonMatch);
                        this.dataEntries = Array.isArray(data) ? data : [];
                    } else {
                        this.dataEntries = [];
                    }
                } catch (error) {
                    console.error('Failed to parse CLI output:', error);
                    this.dataEntries = [];
                }
            } else {
                this.dataEntries = [];
            }
            this._onDidChangeTreeData.fire();
        });

        child.on('error', (error: Error) => {
            console.error('Failed to load data:', error);
            this.dataEntries = [];
            this._onDidChangeTreeData.fire();
        });
    }

    public async exportData(format: 'json' | 'csv'): Promise<void> {
        if (!this.workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder');
            return;
        }

        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `carbonara-export-${timestamp}.${format}`;
        const filepath = path.join(this.workspaceFolder.uri.fsPath, filename);

        try {
            if (format === 'json') {
                fs.writeFileSync(filepath, JSON.stringify(this.dataEntries, null, 2));
            } else {
                const csv = this.convertToCSV(this.dataEntries);
                fs.writeFileSync(filepath, csv);
            }

            vscode.window.showInformationMessage(`Data exported to ${filename}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Export failed: ${error}`);
        }
    }

    private convertToCSV(data: DataEntry[]): string {
        const headers = new Set(['id', 'tool_name', 'data_type', 'timestamp', 'source']);
        
        // Add data fields as columns
        data.forEach(item => {
            if (item.data && typeof item.data === 'object') {
                Object.keys(item.data).forEach(key => {
                    headers.add(`data_${key}`);
                });
            }
        });

        const headerArray = Array.from(headers);
        const csvRows = [headerArray.join(',')];

        data.forEach(item => {
            const row = headerArray.map(header => {
                if (header.startsWith('data_')) {
                    const dataKey = header.substring(5);
                    try {
                        const value = item.data[dataKey];
                        return value !== undefined ? JSON.stringify(value) : '';
                    } catch (e) {
                        return '';
                    }
                } else {
                    const value = (item as any)[header];
                    if (value === null || value === undefined) return '';
                    if (typeof value === 'object') return JSON.stringify(value);
                    return String(value).replace(/"/g, '""');
                }
            });
            csvRows.push(row.join(','));
        });

        return csvRows.join('\n');
    }

    public async clearData(): Promise<void> {
        const answer = await vscode.window.showWarningMessage(
            'Are you sure you want to clear all data? This cannot be undone.',
            'Clear Data',
            'Cancel'
        );

        if (answer === 'Clear Data') {
            if (!this.workspaceFolder) {
                return;
            }

            const cliPath = this.findCarbonaraCLI();
            if (!cliPath) {
                vscode.window.showErrorMessage('Carbonara CLI not found');
                return;
            }

            const child = spawn('node', [cliPath, 'data', '--clear'], {
                cwd: this.workspaceFolder.uri.fsPath,
                stdio: 'pipe'
            });

            child.on('close', (code: number | null) => {
                if (code === 0) {
                    vscode.window.showInformationMessage('Data cleared successfully');
                    this.refresh();
                } else {
                    vscode.window.showErrorMessage('Failed to clear data');
                }
            });

            child.on('error', (error: Error) => {
                console.error('Failed to clear data:', error);
                vscode.window.showErrorMessage('Failed to clear data');
            });
        }
    }

    private findCarbonaraCLI(): string | null {
        if (!this.workspaceFolder) {
            return null;
        }

        // Check monorepo structure
        const monorepoCliPath = path.join(this.workspaceFolder.uri.fsPath, 'packages', 'cli', 'src', 'index.js');
        if (fs.existsSync(monorepoCliPath)) {
            return monorepoCliPath;
        }

        // Check parent of monorepo
        const parentMonorepoPath = path.join(this.workspaceFolder.uri.fsPath, '..', 'packages', 'cli', 'src', 'index.js');
        if (fs.existsSync(parentMonorepoPath)) {
            return parentMonorepoPath;
        }

        return null;
    }
}

export class DataItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly toolName?: string,
        public readonly entryId?: number
    ) {
        super(label, collapsibleState);
        this.description = description;
        this.contextValue = contextValue;

        // Set appropriate icons
        switch (contextValue) {
            case 'group':
                this.iconPath = new vscode.ThemeIcon('folder');
                break;
            case 'entry':
                this.iconPath = new vscode.ThemeIcon('file');
                break;
            case 'detail':
                this.iconPath = new vscode.ThemeIcon('symbol-property');
                break;
            case 'empty':
                this.iconPath = new vscode.ThemeIcon('info');
                break;
        }
    }
} 