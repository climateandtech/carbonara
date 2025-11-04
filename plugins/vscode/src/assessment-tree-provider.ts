import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DataService } from '@carbonara/core';
import { AssessmentSettingsHandler } from './assessment-settings-handler';

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
    settingKey?: string;
}

export class AssessmentTreeProvider implements vscode.TreeDataProvider<AssessmentItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<AssessmentItem | undefined | null | void> = new vscode.EventEmitter<AssessmentItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<AssessmentItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private assessmentData: AssessmentSection[] = [];
    private workspaceFolder: vscode.WorkspaceFolder | undefined;
    private settingsHandler: AssessmentSettingsHandler;

    constructor(settingsHandler: AssessmentSettingsHandler) {
        this.workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        this.settingsHandler = settingsHandler;
        this.initializeAssessmentData();

        // Listen for configuration changes to update the tree
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('carbonara.assessment')) {
                this.refresh();
            }
        });
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
        this.loadSettingsValues();
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
                    { id: 'expectedUsers', label: 'Expected Users', type: 'number', required: true, settingKey: 'projectInfo.expectedUsers' },
                    { id: 'expectedTraffic', label: 'Expected Traffic', type: 'select', required: true, settingKey: 'projectInfo.expectedTraffic',
                      options: [
                        { label: 'Low (< 1K visits/month)', value: 'low' },
                        { label: 'Medium (1K-10K visits/month)', value: 'medium' },
                        { label: 'High (10K-100K visits/month)', value: 'high' },
                        { label: 'Very High (> 100K visits/month)', value: 'very-high' }
                      ]
                    },
                    { id: 'targetAudience', label: 'Target Audience', type: 'select', required: true, settingKey: 'projectInfo.targetAudience',
                      options: [
                        { label: 'Local (same city/region)', value: 'local' },
                        { label: 'National (same country)', value: 'national' },
                        { label: 'Global (worldwide)', value: 'global' }
                      ]
                    },
                    { id: 'projectLifespan', label: 'Project Lifespan (months)', type: 'number', required: true, settingKey: 'projectInfo.projectLifespan' }
                ]
            },
            {
                id: 'infrastructure',
                label: '🏗️ Infrastructure',
                description: 'Hosting and infrastructure details',
                status: 'pending',
                fields: [
                    { id: 'hostingType', label: 'Hosting Type', type: 'select', required: true, settingKey: 'infrastructure.hostingType',
                      options: [
                        { label: 'Shared hosting', value: 'shared' },
                        { label: 'Virtual Private Server (VPS)', value: 'vps' },
                        { label: 'Dedicated server', value: 'dedicated' },
                        { label: 'Cloud (AWS/Azure/GCP)', value: 'cloud' },
                        { label: 'Hybrid setup', value: 'hybrid' }
                      ]
                    },
                    { id: 'cloudProvider', label: 'Cloud Provider', type: 'input', required: false, settingKey: 'infrastructure.cloudProvider' },
                    { id: 'serverLocation', label: 'Server Location', type: 'select', required: true, settingKey: 'infrastructure.serverLocation',
                      options: [
                        { label: 'Same continent', value: 'same-continent' },
                        { label: 'Different continent', value: 'different-continent' },
                        { label: 'Global CDN', value: 'global-cdn' }
                      ]
                    },
                    { id: 'dataStorage', label: 'Data Storage', type: 'select', required: true, settingKey: 'infrastructure.dataStorage',
                      options: [
                        { label: 'Minimal (< 1GB)', value: 'minimal' },
                        { label: 'Moderate (1-10GB)', value: 'moderate' },
                        { label: 'Heavy (10-100GB)', value: 'heavy' },
                        { label: 'Massive (> 100GB)', value: 'massive' }
                      ]
                    },
                    { id: 'backupStrategy', label: 'Backup Strategy', type: 'select', required: true, settingKey: 'infrastructure.backupStrategy',
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
                    { id: 'teamSize', label: 'Team Size', type: 'number', required: true, settingKey: 'development.teamSize' },
                    { id: 'developmentDuration', label: 'Development Duration (months)', type: 'number', required: true, settingKey: 'development.developmentDuration' },
                    { id: 'cicdPipeline', label: 'CI/CD Pipeline', type: 'boolean', required: true, settingKey: 'development.cicdPipeline' },
                    { id: 'testingStrategy', label: 'Testing Strategy', type: 'select', required: true, settingKey: 'development.testingStrategy',
                      options: [
                        { label: 'Minimal testing', value: 'minimal' },
                        { label: 'Moderate testing', value: 'moderate' },
                        { label: 'Comprehensive testing', value: 'comprehensive' }
                      ]
                    },
                    { id: 'codeQuality', label: 'Code Quality', type: 'select', required: true, settingKey: 'development.codeQuality',
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
                    { id: 'realTimeFeatures', label: 'Real-time Features', type: 'boolean', required: true, settingKey: 'features.realTimeFeatures' },
                    { id: 'mediaProcessing', label: 'Media Processing', type: 'boolean', required: true, settingKey: 'features.mediaProcessing' },
                    { id: 'aiMlFeatures', label: 'AI/ML Features', type: 'boolean', required: true, settingKey: 'features.aiMlFeatures' },
                    { id: 'blockchainIntegration', label: 'Blockchain Integration', type: 'boolean', required: true, settingKey: 'features.blockchainIntegration' },
                    { id: 'iotIntegration', label: 'IoT Integration', type: 'boolean', required: true, settingKey: 'features.iotIntegration' }
                ]
            },
            {
                id: 'sustainability',
                label: '🌍 Sustainability Goals',
                description: 'Environmental and sustainability targets',
                status: 'pending',
                fields: [
                    { id: 'carbonNeutralityTarget', label: 'Carbon Neutrality Target', type: 'boolean', required: true, settingKey: 'sustainability.carbonNeutralityTarget' },
                    { id: 'greenHostingRequired', label: 'Green Hosting Required', type: 'boolean', required: true, settingKey: 'sustainability.greenHostingRequired' },
                    { id: 'optimizationPriority', label: 'Optimization Priority', type: 'select', required: true, settingKey: 'sustainability.optimizationPriority',
                      options: [
                        { label: 'Performance first', value: 'performance' },
                        { label: 'Sustainability first', value: 'sustainability' },
                        { label: 'Balanced approach', value: 'balanced' }
                      ]
                    },
                    { id: 'budgetForGreenTech', label: 'Budget for Green Tech', type: 'select', required: true, settingKey: 'sustainability.budgetForGreenTech',
                      options: [
                        { label: 'No budget', value: 'none' },
                        { label: 'Low budget', value: 'low' },
                        { label: 'Medium budget', value: 'medium' },
                        { label: 'High budget', value: 'high' }
                      ]
                    }
                ]
            }
        ];

        this.loadSettingsValues();
    }

    private loadSettingsValues(): void {
        const config = vscode.workspace.getConfiguration('carbonara.assessment');

        // Load values from settings for each section
        for (const section of this.assessmentData) {
            section.data = {};
            let allFieldsFilled = true;
            let anyFieldFilled = false;

            for (const field of section.fields) {
                if (field.settingKey) {
                    const value = config.get(field.settingKey);
                    field.value = value;
                    section.data[field.id] = value;

                    if (value !== undefined && value !== null) {
                        anyFieldFilled = true;
                    } else if (field.required) {
                        allFieldsFilled = false;
                    }
                }
            }

            // Update section status based on fields
            if (allFieldsFilled && anyFieldFilled) {
                section.status = 'completed';
            } else if (anyFieldFilled) {
                section.status = 'in-progress';
            } else {
                section.status = 'pending';
            }
        }
    }

    public async editSection(sectionId: string): Promise<void> {
        // Open settings instead of prompting for input
        vscode.commands.executeCommand('workbench.action.openSettings', '@ext:carbonara.carbonara-vscode assessment');
    }

    public async completeAssessment(): Promise<void> {
        // Check if all sections are complete
        if (!this.settingsHandler.isComplete()) {
            const incompleteSections = this.assessmentData.filter(s => s.status !== 'completed');
            const message = `Please complete all required fields in Settings. Incomplete sections: ${incompleteSections.map(s => s.label).join(', ')}`;

            const action = await vscode.window.showWarningMessage(
                message,
                'Open Settings'
            );

            if (action === 'Open Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', '@ext:carbonara.carbonara-vscode assessment');
            }
            return;
        }

        // Save to database using the settings handler
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Saving CO2 Assessment...',
                cancellable: false
            }, async () => {
                await this.settingsHandler.saveNow();
            });

            vscode.window.showInformationMessage('🎉 CO2 Assessment completed and saved successfully!');
            this.refresh();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Assessment error: ${errorMessage}`);
            throw error;
        }
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