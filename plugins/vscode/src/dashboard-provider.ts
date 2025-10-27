import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
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
        console.error("No workspace folder available for Svelte dashboard");
        return;
      }

      const configPath = path.join(
        this.workspaceFolder.uri.fsPath,
        "carbonara.config.json"
      );

      let dbPath: string;
      try {
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
          if (config.database?.path) {
            dbPath = path.isAbsolute(config.database.path)
              ? config.database.path
              : path.join(
                  this.workspaceFolder.uri.fsPath,
                  config.database.path
                );
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

      console.log("Svelte dashboard core services initialized successfully");
    } catch (error) {
      console.error(
        "Failed to initialize Svelte dashboard core services:",
        error
      );
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
      "carbonaraSvelteDashboard",
      "Carbonara Dashboard (Svelte)",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this.context.extensionPath, "dist")),
        ],
      }
    );

    DashboardProvider.currentPanel = panel;

    // Set HTML content with Svelte bundle
    panel.webview.html = this.getHtmlForWebview(panel.webview);

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "getData":
          case "refresh":
            await this.sendDataToWebview(panel);
            break;
          case "export":
            await this.exportData(message.format);
            break;
        }
      },
      undefined,
      this.context.subscriptions
    );

    // Auto-refresh when panel is focused
    panel.onDidChangeViewState(
      async (e) => {
        if (e.webviewPanel.active) {
          await this.sendDataToWebview(panel);
        }
      },
      null,
      this.context.subscriptions
    );

    // Send initial data
    await this.sendDataToWebview(panel);

    // Reset when the panel is closed
    panel.onDidDispose(
      () => {
        DashboardProvider.currentPanel = undefined;
      },
      null,
      this.context.subscriptions
    );
  }

  private async sendDataToWebview(panel: vscode.WebviewPanel): Promise<void> {
    try {
      if (!this.coreServices || !this.workspaceFolder) {
        panel.webview.postMessage({
          type: "error",
          error: "Services not initialized. Please check the workspace folder.",
        });
        return;
      }

      const projectPath = this.workspaceFolder.uri.fsPath;
      const dbPath = path.join(projectPath, "carbonara.db");

      if (!fs.existsSync(dbPath)) {
        panel.webview.postMessage({
          type: "error",
          error: "No database found. Run an analysis to generate data.",
        });
        return;
      }

      // Load data
      const groups =
        await this.coreServices.vscodeProvider.createGroupedItems(projectPath);
      const stats =
        await this.coreServices.vscodeProvider.getProjectStats(projectPath);

      // Send data to webview
      panel.webview.postMessage({
        type: "data",
        data: {
          groups,
          stats,
        },
      });
    } catch (error) {
      console.error("Error sending data to webview:", error);
      panel.webview.postMessage({
        type: "error",
        error: `Error loading data: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
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

      if (
        !exportData ||
        exportData.length === 0 ||
        exportData === "[]" ||
        exportData === ""
      ) {
        vscode.window.showWarningMessage("No data available to export");
        return;
      }

      const timestamp = new Date().toISOString().split("T")[0];
      const filename = `carbonara-export-${timestamp}.${format}`;
      const filePath = path.join(this.workspaceFolder.uri.fsPath, filename);

      fs.writeFileSync(filePath, exportData);

      vscode.window.showInformationMessage(`Data exported to ${filename}`);
    } catch (error) {
      console.error("Export failed:", error);
      vscode.window.showErrorMessage(
        `Failed to export data: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    // Get path to bundle
    const scriptPath = vscode.Uri.file(
      path.join(
        this.context.extensionPath,
        "dist",
        "webview",
        "dashboard-component.js"
      )
    );
    const scriptUri = webview.asWebviewUri(scriptPath);

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';">
      <title>Carbonara Dashboard (Svelte)</title>
      <style>
        html, body {
          margin: 0;
          padding: 0;
          height: 100%;
        }
      </style>
    </head>
    <body>
      <script src="${scriptUri}"></script>
      <script>
        // Instantiate the Svelte component
        new app({ target: document.body });
      </script>
    </body>
    </html>`;
  }
}
