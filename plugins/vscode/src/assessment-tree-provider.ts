import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface AssessmentSection {
    id: string;
    label: string;
    description: string;
    status: 'pending' | 'in-progress' | 'completed';
    data?: any;
    fields: AssessmentField[];
}

export interface AssessmentField {
    id: string;
    label: string;
    type: 'input' | 'select' | 'number' | 'boolean';
    required: boolean;
    options?: { label: string; value: string }[];
    value?: any;
    defaultValue?: any;
}

export class AssessmentTreeProvider implements vscode.TreeDataProvider<AssessmentItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<AssessmentItem | undefined | null | void> = new vscode.EventEmitter<AssessmentItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<AssessmentItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private assessmentData: AssessmentSection[] = [];
    private workspaceFolder: vscode.WorkspaceFolder | undefined;

    constructor() {
        this.workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        this.initializeAssessmentData();
    }

    private getCurrentProjectPath(): string {
        // Find project root by searching for carbonara.config.json
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return process.cwd();
        }

        let currentDir = workspaceFolder.uri.fsPath;
        
        // Search up the directory tree for carbonara.config.json
        while (currentDir !== path.dirname(currentDir)) {
            const configPath = path.join(currentDir, 'carbonara.config.json');
            if (fs.existsSync(configPath)) {
                return currentDir;
            }
            currentDir = path.dirname(currentDir);
        }
        
        // Default to workspace root
        return workspaceFolder.uri.fsPath;
    }

    refresh(): void {
        this.loadAssessmentProgress();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: AssessmentItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: AssessmentItem): Thenable<AssessmentItem[]> {
        if (!this.workspaceFolder) {
            // Show options to initialize or open a project when no workspace
            return Promise.resolve([
                new AssessmentItem(
                    'No Carbonara Project',
                    'Initialize a new project or open an existing one',
                    vscode.TreeItemCollapsibleState.None,
                    'no-project'
                ),
                new AssessmentItem(
                    'Initialize Project',
                    'Create a new Carbonara project in current workspace',
                    vscode.TreeItemCollapsibleState.None,
                    'init-action',
                    undefined,
                    undefined,
                    {
                        command: 'carbonara.initProject',
                        title: 'Initialize Project'
                    }
                ),
                new AssessmentItem(
                    'Open Project',
                    'Open an existing Carbonara project',
                    vscode.TreeItemCollapsibleState.None,
                    'open-action',
                    undefined,
                    undefined,
                    {
                        command: 'carbonara.openProject',
                        title: 'Open Project'
                    }
                )
            ]);
        }

        if (element) {
            // Return field items for a section
            const section = this.assessmentData.find(s => s.id === element.sectionId);
            if (section) {
                return Promise.resolve(section.fields.map(field => new AssessmentItem(
                    field.label,
                    field.value ? `${field.value}` : 'Not set',
                    vscode.TreeItemCollapsibleState.None,
                    'field',
                    section.id,
                    field.id
                )));
            }
        } else {
            // Return section items
            return Promise.resolve(this.assessmentData.map(section => new AssessmentItem(
                section.label,
                section.description,
                vscode.TreeItemCollapsibleState.Collapsed,
                'section',
                section.id
            )));
        }

        return Promise.resolve([]);
    }

    private initializeAssessmentData(): void {
        this.assessmentData = [
            {
                id: 'project-info',
                label: '📊 Project Information',
                description: 'Basic project details',
                status: 'pending',
                fields: [
                    { id: 'expectedUsers', label: 'Expected Users', type: 'number', required: true },
                    { id: 'expectedTraffic', label: 'Expected Traffic', type: 'select', required: true, 
                      options: [
                        { label: 'Low (< 1K visits/month)', value: 'low' },
                        { label: 'Medium (1K-10K visits/month)', value: 'medium' },
                        { label: 'High (10K-100K visits/month)', value: 'high' },
                        { label: 'Very High (> 100K visits/month)', value: 'very-high' }
                      ]
                    },
                    { id: 'targetAudience', label: 'Target Audience', type: 'select', required: true,
                      options: [
                        { label: 'Local (same city/region)', value: 'local' },
                        { label: 'National (same country)', value: 'national' },
                        { label: 'Global (worldwide)', value: 'global' }
                      ]
                    },
                    { id: 'projectLifespan', label: 'Project Lifespan (months)', type: 'number', required: true }
                ]
            },
            {
                id: 'infrastructure',
                label: '🏗️ Infrastructure',
                description: 'Hosting and infrastructure details',
                status: 'pending',
                fields: [
                    { id: 'hostingType', label: 'Hosting Type', type: 'select', required: true,
                      options: [
                        { label: 'Shared hosting', value: 'shared' },
                        { label: 'Virtual Private Server (VPS)', value: 'vps' },
                        { label: 'Dedicated server', value: 'dedicated' },
                        { label: 'Cloud (AWS/Azure/GCP)', value: 'cloud' },
                        { label: 'Hybrid setup', value: 'hybrid' }
                      ]
                    },
                    { id: 'cloudProvider', label: 'Cloud Provider', type: 'input', required: false },
                    { id: 'serverLocation', label: 'Server Location', type: 'select', required: true,
                      options: [
                        { label: 'Same continent', value: 'same-continent' },
                        { label: 'Different continent', value: 'different-continent' },
                        { label: 'Global CDN', value: 'global-cdn' }
                      ]
                    },
                    { id: 'dataStorage', label: 'Data Storage', type: 'select', required: true,
                      options: [
                        { label: 'Minimal (< 1GB)', value: 'minimal' },
                        { label: 'Moderate (1-10GB)', value: 'moderate' },
                        { label: 'Heavy (10-100GB)', value: 'heavy' },
                        { label: 'Massive (> 100GB)', value: 'massive' }
                      ]
                    },
                    { id: 'backupStrategy', label: 'Backup Strategy', type: 'select', required: true,
                      options: [
                        { label: 'No backups', value: 'none' },
                        { label: 'Weekly backups', value: 'weekly' },
                        { label: 'Daily backups', value: 'daily' },
                        { label: 'Real-time backups', value: 'real-time' }
                      ]
                    }
                ]
            },
            {
                id: 'development',
                label: '👥 Development',
                description: 'Development practices and team',
                status: 'pending',
                fields: [
                    { id: 'teamSize', label: 'Team Size', type: 'number', required: true },
                    { id: 'developmentDuration', label: 'Development Duration (months)', type: 'number', required: true },
                    { id: 'cicdPipeline', label: 'CI/CD Pipeline', type: 'boolean', required: true },
                    { id: 'testingStrategy', label: 'Testing Strategy', type: 'select', required: true,
                      options: [
                        { label: 'Minimal testing', value: 'minimal' },
                        { label: 'Moderate testing', value: 'moderate' },
                        { label: 'Comprehensive testing', value: 'comprehensive' }
                      ]
                    },
                    { id: 'codeQuality', label: 'Code Quality', type: 'select', required: true,
                      options: [
                        { label: 'Basic', value: 'basic' },
                        { label: 'Good', value: 'good' },
                        { label: 'Excellent', value: 'excellent' }
                      ]
                    }
                ]
            },
            {
                id: 'features',
                label: '⚡ Features',
                description: 'Application features and capabilities',
                status: 'pending',
                fields: [
                    { id: 'realTimeFeatures', label: 'Real-time Features', type: 'boolean', required: true },
                    { id: 'mediaProcessing', label: 'Media Processing', type: 'boolean', required: true },
                    { id: 'aiMlFeatures', label: 'AI/ML Features', type: 'boolean', required: true },
                    { id: 'blockchainIntegration', label: 'Blockchain Integration', type: 'boolean', required: true },
                    { id: 'iotIntegration', label: 'IoT Integration', type: 'boolean', required: true }
                ]
            },
            {
                id: 'sustainability',
                label: '🌍 Sustainability Goals',
                description: 'Environmental and sustainability targets',
                status: 'pending',
                fields: [
                    { id: 'carbonNeutralityTarget', label: 'Carbon Neutrality Target', type: 'boolean', required: true },
                    { id: 'greenHostingRequired', label: 'Green Hosting Required', type: 'boolean', required: true },
                    { id: 'optimizationPriority', label: 'Optimization Priority', type: 'select', required: true,
                      options: [
                        { label: 'Performance first', value: 'performance' },
                        { label: 'Sustainability first', value: 'sustainability' },
                        { label: 'Balanced approach', value: 'balanced' }
                      ]
                    },
                    { id: 'budgetForGreenTech', label: 'Budget for Green Tech', type: 'select', required: true,
                      options: [
                        { label: 'No budget', value: 'none' },
                        { label: 'Low budget', value: 'low' },
                        { label: 'Medium budget', value: 'medium' },
                        { label: 'High budget', value: 'high' }
                      ]
                    }
                ]
            },
            {
                id: 'hardware-config',
                label: '💻 Hardware Configuration',
                description: 'Hardware settings for CPU monitoring and Impact Framework tools',
                status: 'pending',
                fields: [
                    { id: 'cpuTdp', label: 'CPU TDP (watts)', type: 'number', required: true, defaultValue: 100 },
                    { id: 'totalVcpus', label: 'Total vCPUs', type: 'number', required: true, defaultValue: 8 },
                    { id: 'allocatedVcpus', label: 'Allocated vCPUs', type: 'number', required: true, defaultValue: 2 },
                    { id: 'gridCarbonIntensity', label: 'Grid Carbon Intensity (gCO2e/kWh)', type: 'number', required: true, defaultValue: 750 }
                ]
            },
            {
                id: 'monitoring-config',
                label: '📊 Monitoring Configuration',
                description: 'Monitoring preferences for Impact Framework analysis',
                status: 'pending',
                fields: [
                    { id: 'enableCpuMonitoring', label: 'Enable CPU Monitoring', type: 'boolean', required: true, defaultValue: true },
                    { id: 'enableE2eMonitoring', label: 'Enable E2E Monitoring', type: 'boolean', required: true, defaultValue: false },
                    { id: 'e2eTestCommand', label: 'E2E Test Command', type: 'input', required: false, defaultValue: 'npx cypress run' },
                    { id: 'scrollToBottom', label: 'Scroll to Bottom', type: 'boolean', required: true, defaultValue: false },
                    { id: 'firstVisitPercentage', label: 'First Visit Percentage', type: 'number', required: true, defaultValue: 0.9 }
                ]
            }
        ];

        this.loadAssessmentProgress();
    }

    private loadAssessmentProgress(): void {
        if (!this.workspaceFolder) {
            return;
        }

        const projectPath = this.getCurrentProjectPath();
        const progressFile = path.join(projectPath, '.carbonara-progress.json');
        if (fs.existsSync(progressFile)) {
            try {
                const progress = JSON.parse(fs.readFileSync(progressFile, 'utf-8'));
                this.mergeProgress(progress);
            } catch (error) {
                console.error('Failed to load assessment progress:', error);
            }
        }
    }

    private mergeProgress(progress: any): void {
        for (const section of this.assessmentData) {
            if (progress[section.id]) {
                section.data = progress[section.id];
                section.status = 'completed';
                
                // Update field values
                for (const field of section.fields) {
                    if (progress[section.id][field.id] !== undefined) {
                        field.value = progress[section.id][field.id];
                    }
                }
            }
        }
    }

    public async editSection(sectionId: string): Promise<void> {
        const section = this.assessmentData.find(s => s.id === sectionId);
        if (!section) {
            return;
        }

        section.status = 'in-progress';
        this.refresh();

        const sectionData: any = {};
        
        for (const field of section.fields) {
            let value = await this.editField(field);
            if (value !== undefined) {
                sectionData[field.id] = value;
                field.value = value;
            } else if (field.required) {
                // User cancelled, revert status
                section.status = section.data ? 'completed' : 'pending';
                this.refresh();
                return;
            }
        }

        section.data = sectionData;
        section.status = 'completed';
        
        await this.saveProgress();
        this.refresh();
        
        vscode.window.showInformationMessage(`✅ ${section.label} completed!`);
    }

    private async editField(field: AssessmentField): Promise<any> {
        switch (field.type) {
            case 'input':
                return await vscode.window.showInputBox({
                    prompt: field.label,
                    value: field.value?.toString() || '',
                    validateInput: field.required ? (value) => value.length > 0 ? undefined : 'This field is required' : undefined
                });

            case 'number':
                const numberInput = await vscode.window.showInputBox({
                    prompt: field.label,
                    value: field.value?.toString() || '',
                    validateInput: (value) => {
                        if (field.required && !value) {
                            return 'This field is required';
                        }
                        if (value && isNaN(Number(value))) {
                            return 'Please enter a valid number';
                        }
                        return undefined;
                    }
                });
                return numberInput ? Number(numberInput) : undefined;

            case 'select':
                const selected = await vscode.window.showQuickPick(
                    field.options || [],
                    { placeHolder: field.label }
                );
                return selected?.value;

            case 'boolean':
                const booleanResult = await vscode.window.showQuickPick(
                    [
                        { label: 'Yes', value: true },
                        { label: 'No', value: false }
                    ],
                    { placeHolder: field.label }
                );
                return booleanResult?.value;

            default:
                return undefined;
        }
    }

    private async saveProgress(): Promise<void> {
        if (!this.workspaceFolder) {
            return;
        }

        const progress: any = {};
        for (const section of this.assessmentData) {
            if (section.data) {
                progress[section.id] = section.data;
            }
        }

        const projectPath = this.getCurrentProjectPath();
        const progressFile = path.join(projectPath, '.carbonara-progress.json');
        fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
    }

    public async completeAssessment(): Promise<void> {
        const incompleteSections = this.assessmentData.filter(s => s.status !== 'completed');
        if (incompleteSections.length > 0) {
            const message = `Complete these sections first: ${incompleteSections.map(s => s.label).join(', ')}`;
            vscode.window.showWarningMessage(message);
            return;
        }

        // Compile all data
        const assessmentData: any = {
            projectInfo: this.assessmentData.find(s => s.id === 'project-info')?.data || {},
            infrastructure: this.assessmentData.find(s => s.id === 'infrastructure')?.data || {},
            development: this.assessmentData.find(s => s.id === 'development')?.data || {},
            features: this.assessmentData.find(s => s.id === 'features')?.data || {},
            sustainabilityGoals: this.assessmentData.find(s => s.id === 'sustainability')?.data || {}
        };

        // Save assessment data file
        const projectPath = this.getCurrentProjectPath();
        const assessmentFile = path.join(projectPath, 'carbonara-assessment.json');
        fs.writeFileSync(assessmentFile, JSON.stringify(assessmentData, null, 2));

        // Run CLI assessment with the file
        const { spawn } = require('child_process');
        const cliPath = this.findCarbonaraCLI();
        
        if (!cliPath) {
            vscode.window.showErrorMessage('Carbonara CLI not found');
            return;
        }

        return new Promise((resolve, reject) => {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Running CO2 Assessment...',
                cancellable: false
            }, () => {
                return new Promise<void>((progressResolve, progressReject) => {
                    const child = spawn('node', [cliPath, 'assess', '--file', assessmentFile], {
                        cwd: projectPath,
                        stdio: 'pipe'
                    });

                    child.on('close', (code: number | null) => {
                        if (code === 0) {
                            vscode.window.showInformationMessage('🎉 CO2 Assessment completed successfully!');
                            progressResolve();
                            resolve();
                        } else {
                            vscode.window.showErrorMessage('Assessment failed');
                            progressReject();
                            reject();
                        }
                    });

                    child.on('error', (error: Error) => {
                        vscode.window.showErrorMessage(`Assessment error: ${error.message}`);
                        progressReject();
                        reject();
                    });
                });
            });
        });
    }

    private findCarbonaraCLI(): string | null {
        if (!this.workspaceFolder) {
            return null;
        }

        const projectPath = this.getCurrentProjectPath();

        // Check monorepo structure
        const monorepoCliPath = path.join(projectPath, 'packages', 'cli', 'src', 'index.js');
        if (fs.existsSync(monorepoCliPath)) {
            return monorepoCliPath;
        }

        // Check parent of monorepo
        const parentMonorepoPath = path.join(projectPath, '..', 'packages', 'cli', 'src', 'index.js');
        if (fs.existsSync(parentMonorepoPath)) {
            return parentMonorepoPath;
        }

        return null;
    }

    public getCompletionStatus(): { completed: number; total: number } {
        const completed = this.assessmentData.filter(s => s.status === 'completed').length;
        const total = this.assessmentData.length;
        return { completed, total };
    }
}

export class AssessmentItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly sectionId?: string,
        public readonly fieldId?: string,
        command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.description = description;
        this.contextValue = contextValue;

        // Set custom command if provided
        if (command) {
            this.command = command;
        }

        if (contextValue === 'section') {
            this.iconPath = new vscode.ThemeIcon('folder');
            if (!command) {
                this.command = {
                    command: 'carbonara.editSection',
                    title: 'Edit Section',
                    arguments: [sectionId]
                };
            }
        } else if (contextValue === 'field') {
            this.iconPath = new vscode.ThemeIcon('symbol-property');
        } else if (contextValue === 'init-action') {
            this.iconPath = new vscode.ThemeIcon('add');
        } else if (contextValue === 'open-action') {
            this.iconPath = new vscode.ThemeIcon('folder-opened');
        } else if (contextValue === 'no-project') {
            this.iconPath = new vscode.ThemeIcon('info');
        }
    }
} 