import * as vscode from "vscode";
import * as path from "path";
import {
  setupCarbonaraCore,
  createDataService,
  createSchemaService,
  createVSCodeDataProvider,
} from "@carbonara/core";

export class DashboardProvider {
  private static currentPanel: vscode.WebviewPanel | undefined;
  private workspaceFolder: vscode.WorkspaceFolder | undefined;
  private coreServices: Awaited<ReturnType<typeof setupCarbonaraCore>> | null =
    null;

  constructor(private context: vscode.ExtensionContext) {
    this.workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    this.initializeCoreServices();
  }

  private async initializeCoreServices(): Promise<void> {
    try {
      if (!this.workspaceFolder) {
        console.error("No workspace folder available for dashboard");
        return;
      }

      const configPath = path.join(
        this.workspaceFolder.uri.fsPath,
        "carbonara.config.json"
      );

      let dbPath: string;
      try {
        if (require("fs").existsSync(configPath)) {
          const config = JSON.parse(
            require("fs").readFileSync(configPath, "utf8")
          );
          if (config.database?.path) {
            dbPath = path.isAbsolute(config.database.path)
              ? config.database.path
              : path.join(this.workspaceFolder.uri.fsPath, config.database.path);
          } else {
            dbPath = path.join(this.workspaceFolder.uri.fsPath, "carbonara.db");
          }
        } else {
          dbPath = path.join(this.workspaceFolder.uri.fsPath, "carbonara.db");
        }
      } catch (error) {
        console.error("Error reading config:", error);
        dbPath = path.join(this.workspaceFolder.uri.fsPath, "carbonara.db");
      }

      const dataService = createDataService({ dbPath });
      await dataService.initialize();

      const schemaService = createSchemaService();
      await schemaService.loadToolSchemas();

      const vscodeProvider = createVSCodeDataProvider(
        dataService,
        schemaService
      );

      this.coreServices = {
        dataService,
        schemaService,
        vscodeProvider,
      };

      console.log("Dashboard core services initialized successfully");
    } catch (error) {
      console.error("Failed to initialize dashboard core services:", error);
      this.coreServices = null;
    }
  }

  public async showDashboard(): Promise<void> {
    if (!this.workspaceFolder) {
      vscode.window.showErrorMessage("Please open a workspace folder first");
      return;
    }

    // If we already have a panel, show it
    if (DashboardProvider.currentPanel) {
      DashboardProvider.currentPanel.reveal(vscode.ViewColumn.One);
      return;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      "carbonaraDashboard",
      "Carbonara Dashboard",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.context.extensionUri],
      }
    );

    DashboardProvider.currentPanel = panel;

    // Set initial content
    panel.webview.html = this.getLoadingHtml();

    // Load data and update content
    await this.updateDashboardContent(panel);

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "refresh":
            await this.updateDashboardContent(panel);
            break;
          case "export":
            await this.exportData(message.format);
            break;
        }
      },
      undefined,
      this.context.subscriptions
    );

    // Reset when the panel is closed
    panel.onDidDispose(
      () => {
        DashboardProvider.currentPanel = undefined;
      },
      null,
      this.context.subscriptions
    );
  }

  private async updateDashboardContent(
    panel: vscode.WebviewPanel
  ): Promise<void> {
    try {
      if (!this.coreServices || !this.workspaceFolder) {
        panel.webview.html = this.getErrorHtml(
          "Services not initialized. Please check the workspace folder."
        );
        return;
      }

      const projectPath = this.workspaceFolder.uri.fsPath;
      const dbPath = path.join(projectPath, "carbonara.db");

      if (!require("fs").existsSync(dbPath)) {
        panel.webview.html = this.getErrorHtml(
          "No database found. Run an analysis to generate data."
        );
        return;
      }

      // Load data
      const groups =
        await this.coreServices.vscodeProvider.createGroupedItems(projectPath);
      const stats = await this.coreServices.vscodeProvider.getProjectStats(
        projectPath
      );

      // Generate HTML with data
      panel.webview.html = this.getDashboardHtml(groups, stats);
    } catch (error) {
      console.error("Error updating dashboard:", error);
      panel.webview.html = this.getErrorHtml(
        `Error loading data: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  private async exportData(format: "json" | "csv"): Promise<void> {
    if (!this.coreServices || !this.workspaceFolder) {
      vscode.window.showErrorMessage("No workspace or services available");
      return;
    }

    try {
      const projectPath = this.workspaceFolder.uri.fsPath;
      const exportData = await this.coreServices.vscodeProvider.exportData(
        projectPath,
        format
      );

      const timestamp = new Date().toISOString().split("T")[0];
      const filename = `carbonara-export-${timestamp}.${format}`;
      const filePath = path.join(this.workspaceFolder.uri.fsPath, filename);

      require("fs").writeFileSync(filePath, exportData);

      vscode.window.showInformationMessage(`Data exported to ${filename}`);
    } catch (error) {
      console.error("Export failed:", error);
      vscode.window.showErrorMessage("Failed to export data");
    }
  }

  private getLoadingHtml(): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Carbonara Dashboard</title>
      <style>
        body {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
          font-family: var(--vscode-font-family);
          color: var(--vscode-foreground);
          background: var(--vscode-editor-background);
        }
        .loading {
          text-align: center;
        }
        .spinner {
          border: 4px solid var(--vscode-progressBar-background);
          border-top: 4px solid var(--vscode-progressBar-foreground);
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
          margin: 0 auto 16px;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    </body>
    </html>`;
  }

  private getErrorHtml(message: string): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Carbonara Dashboard - Error</title>
      <style>
        body {
          font-family: var(--vscode-font-family);
          color: var(--vscode-foreground);
          background: var(--vscode-editor-background);
          padding: 20px;
          margin: 0;
        }
        .error-container {
          max-width: 600px;
          margin: 40px auto;
          padding: 20px;
          background: var(--vscode-inputValidation-errorBackground);
          border: 1px solid var(--vscode-inputValidation-errorBorder);
          border-radius: 4px;
        }
        h2 {
          margin-top: 0;
          color: var(--vscode-errorForeground);
        }
      </style>
    </head>
    <body>
      <div class="error-container">
        <h2>⚠️ Error</h2>
        <p>${message}</p>
      </div>
    </body>
    </html>`;
  }

  private getDashboardHtml(groups: any[], stats: any): string {
    const groupsHtml = groups
      .map(
        (group) => `
      <div class="data-group">
        <h3 class="group-title">${this.escapeHtml(group.displayName)}</h3>
        <div class="group-count">${group.entries.length} entries</div>
        <div class="entries">
          ${group.entries
            .map(
              (entry: any) => `
            <div class="entry-card">
              <div class="entry-label">${this.escapeHtml(entry.label)}</div>
              <div class="entry-description">${this.escapeHtml(entry.description)}</div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `
      )
      .join("");

    const toolStatsHtml = Object.entries(stats.toolCounts)
      .map(
        ([toolName, count]) => `
      <div class="stat-item">
        <div class="stat-label">${this.escapeHtml(toolName)}</div>
        <div class="stat-value">${count}</div>
      </div>
    `
      )
      .join("");

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Carbonara Dashboard</title>
      <style>
        * {
          box-sizing: border-box;
        }

        body {
          font-family: var(--vscode-font-family);
          color: var(--vscode-foreground);
          background: var(--vscode-editor-background);
          padding: 0;
          margin: 0;
          line-height: 1.6;
        }

        .dashboard {
          max-width: 1400px;
          margin: 0 auto;
          padding: 20px;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--vscode-panel-border);
        }

        h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 600;
        }

        .actions {
          display: flex;
          gap: 10px;
        }

        button {
          padding: 8px 16px;
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-family: var(--vscode-font-family);
        }

        button:hover {
          background: var(--vscode-button-hoverBackground);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }

        .stat-card {
          background: var(--vscode-sideBar-background);
          border: 1px solid var(--vscode-panel-border);
          border-radius: 8px;
          padding: 20px;
        }

        .stat-card h3 {
          margin: 0 0 15px 0;
          font-size: 14px;
          font-weight: 500;
          opacity: 0.8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .stat-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid var(--vscode-panel-border);
        }

        .stat-item:last-child {
          border-bottom: none;
        }

        .stat-label {
          font-size: 14px;
        }

        .stat-value {
          font-size: 18px;
          font-weight: 600;
          color: var(--vscode-textLink-foreground);
        }

        .total-entries {
          font-size: 48px;
          font-weight: 700;
          color: var(--vscode-textLink-foreground);
        }

        .data-groups {
          display: grid;
          gap: 20px;
        }

        .data-group {
          background: var(--vscode-sideBar-background);
          border: 1px solid var(--vscode-panel-border);
          border-radius: 8px;
          padding: 20px;
        }

        .group-title {
          margin: 0 0 5px 0;
          font-size: 20px;
          font-weight: 600;
        }

        .group-count {
          color: var(--vscode-descriptionForeground);
          font-size: 14px;
          margin-bottom: 15px;
        }

        .entries {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 15px;
          margin-top: 15px;
        }

        .entry-card {
          background: var(--vscode-editor-background);
          border: 1px solid var(--vscode-panel-border);
          border-radius: 6px;
          padding: 15px;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .entry-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        }

        .entry-label {
          font-weight: 600;
          margin-bottom: 5px;
          font-size: 15px;
        }

        .entry-description {
          color: var(--vscode-descriptionForeground);
          font-size: 13px;
        }

        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: var(--vscode-descriptionForeground);
        }

        .empty-state h2 {
          font-size: 24px;
          margin-bottom: 10px;
        }
      </style>
    </head>
    <body>
      <div class="dashboard">
        <div class="header">
          <h1>🌱 Carbonara Dashboard</h1>
          <div class="actions">
            <button onclick="refresh()">↻ Refresh</button>
            <button onclick="exportData('json')">Export JSON</button>
            <button onclick="exportData('csv')">Export CSV</button>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <h3>Total Entries</h3>
            <div class="total-entries">${stats.totalEntries}</div>
          </div>

          <div class="stat-card">
            <h3>Data by Tool</h3>
            ${toolStatsHtml || '<div class="stat-item"><div class="stat-label">No data</div></div>'}
          </div>
        </div>

        ${
          groups.length > 0
            ? `<div class="data-groups">${groupsHtml}</div>`
            : `<div class="empty-state">
                <h2>No Data Available</h2>
                <p>Run an analysis to see data here</p>
              </div>`
        }
      </div>

      <script>
        const vscode = acquireVsCodeApi();

        function refresh() {
          vscode.postMessage({ command: 'refresh' });
        }

        function exportData(format) {
          vscode.postMessage({ command: 'export', format: format });
        }
      </script>
    </body>
    </html>`;
  }

  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}
