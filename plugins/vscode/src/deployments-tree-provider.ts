import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  DataService,
  DeploymentService,
  createDeploymentService
} from "@carbonara/core";

export class DeploymentsTreeProvider implements vscode.TreeDataProvider<DeploymentTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<DeploymentTreeItem | undefined | null | void> =
    new vscode.EventEmitter<DeploymentTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<DeploymentTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private dataService: DataService | null = null;
  private deploymentService: DeploymentService | null = null;
  private projectId: number | undefined = undefined;
  public badgeProvider?: import("./badge-decoration-provider").BadgeDecorationProvider;

  constructor() {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  private async initializeServices(): Promise<boolean> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return false;
    }

    const projectPath = workspaceFolder.uri.fsPath;
    const configPath = path.join(projectPath, ".carbonara", "carbonara.config.json");

    if (!fs.existsSync(configPath)) {
      return false;
    }

    // Load config to get project ID
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    this.projectId = config.projectId;

    const dbPath = path.join(projectPath, ".carbonara", "carbonara.db");

    if (!this.dataService) {
      this.dataService = new DataService({ dbPath });
      await this.dataService.initialize();
      this.deploymentService = createDeploymentService(this.dataService);
    }

    return true;
  }

  getTreeItem(element: DeploymentTreeItem): vscode.TreeItem {
    // Set badge color if deployment has badgeColor and resourceUri, and feature flag is enabled
    const showBadges = vscode.workspace.getConfiguration("carbonara").get<boolean>("showBadges", true);
    if (showBadges && element.type === "deployment" && element.badgeColor && element.resourceUri && this.badgeProvider) {
      this.badgeProvider.setBadge(element.resourceUri, element.badgeColor);
    }
    return element;
  }

  async getChildren(element?: DeploymentTreeItem): Promise<DeploymentTreeItem[]> {
    const initialized = await this.initializeServices();

    if (!initialized) {
      return [
        new DeploymentTreeItem(
          "No Carbonara project found",
          vscode.TreeItemCollapsibleState.None,
          "info"
        )
      ];
    }

    if (!element) {
      // Root level - show main actions and provider groups
      try {
        // Fetch deployments from assessment_data table
        const assessmentData = await this.dataService!.getAssessmentData(
          undefined,
          'deployment-scan'
        );

        // Extract deployments from the most recent scan
        let deployments: any[] = [];
        if (assessmentData.length > 0) {
          const latestScan = assessmentData[0]; // Most recent
          // data is already parsed by getAssessmentData
          const data = latestScan.data;
          deployments = data.deployments || [];
        }

        if (deployments.length === 0) {
          return [
            new DeploymentTreeItem(
              "No deployments detected",
              vscode.TreeItemCollapsibleState.None,
              "info",
              undefined,
              "scan-deployments"
            ),
            new DeploymentTreeItem(
              "Scan for Deployments",
              vscode.TreeItemCollapsibleState.None,
              "action",
              "carbonara.scanDeployments"
            )
          ];
        }

        // Group by provider
        const providers = [...new Set(deployments.map(d => d.provider))];
        const items: DeploymentTreeItem[] = [];

        // Add provider groups (no rescan action here - it's in the title bar)
        for (const provider of providers) {
          const providerDeployments = deployments.filter(d => d.provider === provider);
          items.push(
            new DeploymentTreeItem(
              `${provider.toUpperCase()} (${providerDeployments.length})`,
              vscode.TreeItemCollapsibleState.Expanded,
              "provider",
              undefined,
              undefined,
              providerDeployments
            )
          );
        }

        return items;
      } catch (error: any) {
        console.error('Error loading deployments:', error);
        vscode.window.showErrorMessage(`Failed to load deployments: ${error.message || error}`);
        return [
          new DeploymentTreeItem(
            "Error loading deployments",
            vscode.TreeItemCollapsibleState.None,
            "info"
          ),
          new DeploymentTreeItem(
            "Scan for Deployments",
            vscode.TreeItemCollapsibleState.None,
            "action",
            "carbonara.scanDeployments"
          )
        ];
      }
    }

    if (element.type === "provider" && element.deployments) {
      // Group by environment within provider
      const environments = [...new Set(element.deployments.map(d => d.environment))];
      return environments.map(env => {
        const envDeployments = element.deployments!.filter(d => d.environment === env);
        return new DeploymentTreeItem(
          `${env} (${envDeployments.length})`,
          vscode.TreeItemCollapsibleState.Expanded,
          "environment",
          undefined,
          undefined,
          envDeployments
        );
      });
    }

    if (element.type === "environment" && element.deployments) {
      // Show deployments in this environment
      return element.deployments.map((deployment, index) => {
        const label = deployment.name;
        const badgeColor = this.getCarbonBadge(deployment.carbon_intensity);

        const item = new DeploymentTreeItem(
          label,
          vscode.TreeItemCollapsibleState.Collapsed,
          "deployment",
          "carbonara.openDeploymentConfig",
          undefined,
          undefined,
          deployment,
          undefined
        );
        
        // Set resourceUri for badge decoration
        if (deployment.carbon_intensity !== null && deployment.carbon_intensity !== undefined) {
          item.resourceUri = vscode.Uri.parse(`carbonara-badge://deployment/${deployment.provider}/${deployment.region}/${index}`);
          item.badgeColor = badgeColor;
        }
        
        return item;
      });
    }

    if (element.type === "deployment" && element.deployment) {
      // Show details for this deployment
      const deployment = element.deployment;
      const children: DeploymentTreeItem[] = [];

      // Region info - shown as description (muted/smaller)
      if (deployment.region) {
        children.push(
          new DeploymentTreeItem(
            "Deployment region",
            vscode.TreeItemCollapsibleState.None,
            "info",
            undefined,
            undefined,
            undefined,
            undefined,
            deployment.region
          )
        );
      }

      // Carbon intensity info - shown as description (muted/smaller)
      if (deployment.carbon_intensity !== null && deployment.carbon_intensity !== undefined) {
        const intensity = deployment.carbon_intensity;
        const carbonBadge = this.getCarbonBadge(intensity);
        // Show intensity value without emoji (badge shown via decoration)
        children.push(
          new DeploymentTreeItem(
            "Current carbon intensity",
            vscode.TreeItemCollapsibleState.None,
            "info",
            undefined,
            undefined,
            undefined,
            undefined,
            `${intensity} gCO2/kWh`
          )
        );

        // Recommendation if not in lowest category
        if (intensity >= 100) {
          children.push(
            new DeploymentTreeItem(
              "Consider deploying in a region with a higher percentage of renewable energy in the grid, for a lower carbon impact.",
              vscode.TreeItemCollapsibleState.None,
              "info"
            )
          );
        }
      } else {
        children.push(
          new DeploymentTreeItem(
            "Current carbon intensity",
            vscode.TreeItemCollapsibleState.None,
            "info",
            undefined,
            undefined,
            undefined,
            undefined,
            "Unknown"
          )
        );
      }

      return children;
    }

    return [];
  }

  private getCarbonBadge(intensity: number | null): import("@carbonara/core").BadgeColor {
    if (!intensity) return "none";
    if (intensity < 100) return "green"; // Low carbon
    if (intensity < 300) return "yellow"; // Medium carbon
    if (intensity < 500) return "orange"; // High carbon
    return "red"; // Very high carbon
  }

  async scanForDeployments() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace folder open");
      return;
    }

    const initialized = await this.initializeServices();
    if (!initialized) {
      vscode.window.showErrorMessage("Carbonara project not initialized");
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Scanning for deployments...",
        cancellable: false
      },
      async (progress) => {
        try {
          // Scan directory
          progress.report({ message: "Scanning configuration files..." });
          const detections = await this.deploymentService!.scanDirectory(
            workspaceFolder.uri.fsPath
          );

          // Save deployments
          progress.report({ message: "Saving detected deployments..." });
          await this.deploymentService!.saveDeployments(
            detections,
            this.projectId,
            workspaceFolder.uri.fsPath
          );

          // Carbon intensity updates are deprecated (they relied on deployments table)
          // TODO: Implement carbon intensity lookup for deployments in assessment_data

          vscode.window.showInformationMessage(
            `Found ${detections.length} deployment(s)`
          );

          this.refresh();
        } catch (error) {
          vscode.window.showErrorMessage(
            `Error scanning deployments: ${(error as Error).message}`
          );
        }
      }
    );
  }

  async openDeploymentConfig(deployment: any) {
    if (!deployment.config_file_path) {
      vscode.window.showWarningMessage(
        `No configuration file path available for ${deployment.name}`
      );
      return;
    }

    try {
      const doc = await vscode.workspace.openTextDocument(deployment.config_file_path);
      await vscode.window.showTextDocument(doc);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to open config file: ${(error as Error).message}`
      );
    }
  }

  async showDeploymentDetails(deployment: any) {
    const panel = vscode.window.createWebviewPanel(
      'deploymentDetails',
      `Deployment: ${deployment.name}`,
      vscode.ViewColumn.One,
      {}
    );

    const carbonBadge = this.getCarbonBadge(deployment.carbon_intensity);

    panel.webview.html = this.getDeploymentDetailsHtml(deployment, carbonBadge);
  }

  private getDeploymentDetailsHtml(deployment: any, carbonBadge: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: var(--vscode-font-family);
              padding: 20px;
              color: var(--vscode-foreground);
            }
            .header {
              margin-bottom: 20px;
              padding-bottom: 10px;
              border-bottom: 1px solid var(--vscode-panel-border);
            }
            .section {
              margin-bottom: 15px;
            }
            .label {
              font-weight: bold;
              color: var(--vscode-descriptionForeground);
            }
            .value {
              margin-left: 10px;
            }
            .badge {
              font-size: 0.8em;
              margin-right: 8px;
              display: inline-block;
            }
            .badge-green { color: #4CAF50; }
            .badge-yellow { color: #FFC107; }
            .badge-orange { color: #FF9800; }
            .badge-red { color: #F44336; }
            .badge-none { color: #9E9E9E; }
            .carbon-intensity {
              font-size: 18px;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1><span class="badge badge-${carbonBadge}">●</span>${deployment.name}</h1>
          </div>

          <div class="section">
            <span class="label">Environment:</span>
            <span class="value">${deployment.environment}</span>
          </div>

          <div class="section">
            <span class="label">Provider:</span>
            <span class="value">${deployment.provider}</span>
          </div>

          ${deployment.region ? `
          <div class="section">
            <span class="label">Region:</span>
            <span class="value">${deployment.region}</span>
          </div>
          ` : ''}

          ${deployment.country ? `
          <div class="section">
            <span class="label">Country:</span>
            <span class="value">${deployment.country}</span>
          </div>
          ` : ''}

          ${deployment.carbon_intensity ? `
          <div class="section">
            <span class="label">Carbon Intensity:</span>
            <span class="value carbon-intensity">${deployment.carbon_intensity} gCO2/kWh</span>
          </div>
          ` : ''}

          <div class="section">
            <span class="label">Detection Method:</span>
            <span class="value">${deployment.detection_method}</span>
          </div>

          ${deployment.config_file_path ? `
          <div class="section">
            <span class="label">Config File:</span>
            <span class="value">${deployment.config_file_path}</span>
          </div>
          ` : ''}

          <div class="section">
            <span class="label">Status:</span>
            <span class="value">${deployment.status}</span>
          </div>
        </body>
      </html>
    `;
  }
}

class DeploymentTreeItem extends vscode.TreeItem {
  public badgeColor?: import("@carbonara/core").BadgeColor;

  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: "info" | "action" | "provider" | "environment" | "deployment",
    commandStr?: string,
    contextValue?: string,
    public readonly deployments?: any[],
    public readonly deployment?: any,
    public readonly customDescription?: string
  ) {
    super(label, collapsibleState);

    if (commandStr) {
      this.command = {
        command: commandStr,
        title: label,
        arguments: deployment ? [deployment] : []
      };
    }

    this.description = customDescription;
    this.contextValue = contextValue;

    // Set icons based on type (no icons for provider or environment)
    if (type === "action") {
      this.iconPath = new vscode.ThemeIcon("search");
    } else if (type === "deployment") {
      this.iconPath = new vscode.ThemeIcon("file-code");
    }
  }
}
