import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DataService } from '@carbonara/core';

/**
 * Handles syncing assessment settings with the database
 */
export class AssessmentSettingsHandler {
    private disposables: vscode.Disposable[] = [];
    private workspaceFolder: vscode.WorkspaceFolder | undefined;
    private saveTimeout: NodeJS.Timeout | undefined;

    constructor() {
        this.workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        // Listen for configuration changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                // Check if any assessment settings changed
                if (e.affectsConfiguration('carbonara.assessment')) {
                    this.onSettingsChanged();
                }
            })
        );
    }

    /**
     * Get the current project path by finding carbonara.config.json
     */
    private getCurrentProjectPath(): string | undefined {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return undefined;
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

        // Check if workspace root has config
        const rootConfigPath = path.join(workspaceFolder.uri.fsPath, 'carbonara.config.json');
        if (fs.existsSync(rootConfigPath)) {
            return workspaceFolder.uri.fsPath;
        }

        return undefined;
    }

    /**
     * Called when settings change - debounced to avoid multiple saves
     */
    private onSettingsChanged(): void {
        // Clear existing timeout
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        // Debounce for 1 second to avoid multiple saves
        this.saveTimeout = setTimeout(() => {
            this.saveToDatabase().catch(error => {
                console.error('Failed to save assessment settings:', error);
            });
        }, 1000);
    }

    /**
     * Get all assessment settings as a structured object
     */
    public getAssessmentData(): any {
        const config = vscode.workspace.getConfiguration('carbonara.assessment');

        return {
            projectInfo: {
                expectedUsers: config.get('projectInfo.expectedUsers'),
                expectedTraffic: config.get('projectInfo.expectedTraffic'),
                targetAudience: config.get('projectInfo.targetAudience'),
                projectLifespan: config.get('projectInfo.projectLifespan')
            },
            infrastructure: {
                hostingType: config.get('infrastructure.hostingType'),
                cloudProvider: config.get('infrastructure.cloudProvider'),
                serverLocation: config.get('infrastructure.serverLocation'),
                dataStorage: config.get('infrastructure.dataStorage'),
                backupStrategy: config.get('infrastructure.backupStrategy')
            },
            development: {
                teamSize: config.get('development.teamSize'),
                developmentDuration: config.get('development.developmentDuration'),
                cicdPipeline: config.get('development.cicdPipeline'),
                testingStrategy: config.get('development.testingStrategy'),
                codeQuality: config.get('development.codeQuality')
            },
            features: {
                realTimeFeatures: config.get('features.realTimeFeatures'),
                mediaProcessing: config.get('features.mediaProcessing'),
                aiMlFeatures: config.get('features.aiMlFeatures'),
                blockchainIntegration: config.get('features.blockchainIntegration'),
                iotIntegration: config.get('features.iotIntegration')
            },
            sustainabilityGoals: {
                carbonNeutralityTarget: config.get('sustainability.carbonNeutralityTarget'),
                greenHostingRequired: config.get('sustainability.greenHostingRequired'),
                optimizationPriority: config.get('sustainability.optimizationPriority'),
                budgetForGreenTech: config.get('sustainability.budgetForGreenTech')
            }
        };
    }

    /**
     * Check if any settings have been filled out
     */
    public hasAnySettings(): boolean {
        const data = this.getAssessmentData();

        // Check if any non-undefined values exist
        for (const section of Object.values(data)) {
            for (const value of Object.values(section as any)) {
                if (value !== undefined && value !== null) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Check if all required settings are filled out
     */
    public isComplete(): boolean {
        const data = this.getAssessmentData();

        // All fields are required except cloudProvider
        const required = [
            data.projectInfo.expectedUsers,
            data.projectInfo.expectedTraffic,
            data.projectInfo.targetAudience,
            data.projectInfo.projectLifespan,
            data.infrastructure.hostingType,
            data.infrastructure.serverLocation,
            data.infrastructure.dataStorage,
            data.infrastructure.backupStrategy,
            data.development.teamSize,
            data.development.developmentDuration,
            data.development.cicdPipeline,
            data.development.testingStrategy,
            data.development.codeQuality,
            data.features.realTimeFeatures,
            data.features.mediaProcessing,
            data.features.aiMlFeatures,
            data.features.blockchainIntegration,
            data.features.iotIntegration,
            data.sustainabilityGoals.carbonNeutralityTarget,
            data.sustainabilityGoals.greenHostingRequired,
            data.sustainabilityGoals.optimizationPriority,
            data.sustainabilityGoals.budgetForGreenTech
        ];

        return required.every(value => value !== undefined && value !== null);
    }

    /**
     * Save assessment data to database
     */
    public async saveToDatabase(): Promise<void> {
        const projectPath = this.getCurrentProjectPath();
        if (!projectPath) {
            // No Carbonara project initialized
            return;
        }

        // Only save if at least some settings are filled out
        if (!this.hasAnySettings()) {
            return;
        }

        const assessmentData = this.getAssessmentData();

        try {
            const dataService = new DataService({
                dbPath: path.join(projectPath, '.carbonara', 'carbonara.db')
            });

            await dataService.initialize();

            // Get or create project
            let project = await dataService.getProject(projectPath);
            if (!project) {
                const configPath = path.join(projectPath, 'carbonara.config.json');
                let projectName = 'Carbonara Project';
                if (fs.existsSync(configPath)) {
                    try {
                        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                        projectName = config.name || projectName;
                    } catch {}
                }
                const projectId = await dataService.createProject(projectName, projectPath, {});
                project = await dataService.getProject(projectPath);
            }

            if (project) {
                // Store assessment data
                await dataService.storeAssessmentData(
                    project.id,
                    'co2-assessment',
                    'assessment',
                    assessmentData,
                    'vscode-extension-settings'
                );

                // Update project CO2 variables
                await dataService.updateProjectCO2Variables(project.id, assessmentData);
            }

            await dataService.close();

            // Also save to file for reference
            const assessmentFile = path.join(projectPath, 'carbonara-assessment.json');
            fs.writeFileSync(assessmentFile, JSON.stringify(assessmentData, null, 2));

        } catch (error) {
            console.error('Failed to save assessment to database:', error);
            throw error;
        }
    }

    /**
     * Manually trigger a save to database (e.g., when "Complete Assessment" is clicked)
     */
    public async saveNow(): Promise<void> {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = undefined;
        }

        if (!this.isComplete()) {
            throw new Error('Assessment is incomplete. Please fill out all required fields in the settings.');
        }

        await this.saveToDatabase();
    }

    /**
     * Load settings from database and update VSCode settings
     */
    public async loadFromDatabase(): Promise<void> {
        const projectPath = this.getCurrentProjectPath();
        if (!projectPath) {
            return;
        }

        try {
            const dataService = new DataService({
                dbPath: path.join(projectPath, '.carbonara', 'carbonara.db')
            });

            await dataService.initialize();

            const project = await dataService.getProject(projectPath);
            if (!project) {
                await dataService.close();
                return;
            }

            // Get assessment data from database
            const assessments = await dataService.getAssessmentData(project.id, 'co2-assessment');
            if (assessments.length === 0) {
                await dataService.close();
                return;
            }

            // Get the most recent assessment
            const latestAssessment = assessments[assessments.length - 1];
            const data = latestAssessment.data;

            await dataService.close();

            // Update VSCode settings
            const config = vscode.workspace.getConfiguration('carbonara.assessment');

            if (data.projectInfo) {
                await config.update('projectInfo.expectedUsers', data.projectInfo.expectedUsers, vscode.ConfigurationTarget.Workspace);
                await config.update('projectInfo.expectedTraffic', data.projectInfo.expectedTraffic, vscode.ConfigurationTarget.Workspace);
                await config.update('projectInfo.targetAudience', data.projectInfo.targetAudience, vscode.ConfigurationTarget.Workspace);
                await config.update('projectInfo.projectLifespan', data.projectInfo.projectLifespan, vscode.ConfigurationTarget.Workspace);
            }

            if (data.infrastructure) {
                await config.update('infrastructure.hostingType', data.infrastructure.hostingType, vscode.ConfigurationTarget.Workspace);
                await config.update('infrastructure.cloudProvider', data.infrastructure.cloudProvider, vscode.ConfigurationTarget.Workspace);
                await config.update('infrastructure.serverLocation', data.infrastructure.serverLocation, vscode.ConfigurationTarget.Workspace);
                await config.update('infrastructure.dataStorage', data.infrastructure.dataStorage, vscode.ConfigurationTarget.Workspace);
                await config.update('infrastructure.backupStrategy', data.infrastructure.backupStrategy, vscode.ConfigurationTarget.Workspace);
            }

            if (data.development) {
                await config.update('development.teamSize', data.development.teamSize, vscode.ConfigurationTarget.Workspace);
                await config.update('development.developmentDuration', data.development.developmentDuration, vscode.ConfigurationTarget.Workspace);
                await config.update('development.cicdPipeline', data.development.cicdPipeline, vscode.ConfigurationTarget.Workspace);
                await config.update('development.testingStrategy', data.development.testingStrategy, vscode.ConfigurationTarget.Workspace);
                await config.update('development.codeQuality', data.development.codeQuality, vscode.ConfigurationTarget.Workspace);
            }

            if (data.features) {
                await config.update('features.realTimeFeatures', data.features.realTimeFeatures, vscode.ConfigurationTarget.Workspace);
                await config.update('features.mediaProcessing', data.features.mediaProcessing, vscode.ConfigurationTarget.Workspace);
                await config.update('features.aiMlFeatures', data.features.aiMlFeatures, vscode.ConfigurationTarget.Workspace);
                await config.update('features.blockchainIntegration', data.features.blockchainIntegration, vscode.ConfigurationTarget.Workspace);
                await config.update('features.iotIntegration', data.features.iotIntegration, vscode.ConfigurationTarget.Workspace);
            }

            if (data.sustainabilityGoals) {
                await config.update('sustainability.carbonNeutralityTarget', data.sustainabilityGoals.carbonNeutralityTarget, vscode.ConfigurationTarget.Workspace);
                await config.update('sustainability.greenHostingRequired', data.sustainabilityGoals.greenHostingRequired, vscode.ConfigurationTarget.Workspace);
                await config.update('sustainability.optimizationPriority', data.sustainabilityGoals.optimizationPriority, vscode.ConfigurationTarget.Workspace);
                await config.update('sustainability.budgetForGreenTech', data.sustainabilityGoals.budgetForGreenTech, vscode.ConfigurationTarget.Workspace);
            }

        } catch (error) {
            console.error('Failed to load assessment from database:', error);
        }
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
