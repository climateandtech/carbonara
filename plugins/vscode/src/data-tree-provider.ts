import * as vscode from "vscode";
import * as path from "path";
import {
  setupCarbonaraCore,
  createDataService,
  createSchemaService,
  createVSCodeDataProvider,
  type DataGroup,
  type DataEntry as CoreDataEntry,
  type DataDetail,
} from "@carbonara/core";
import { UI_TEXT } from "./constants/ui-text";

export class DataTreeProvider implements vscode.TreeDataProvider<DataItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    DataItem | undefined | null | void
  > = new vscode.EventEmitter<DataItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    DataItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private workspaceFolder: vscode.WorkspaceFolder | undefined;
  private coreServices: Awaited<ReturnType<typeof setupCarbonaraCore>> | null =
    null;
  private cachedItems: DataItem[] | null = null;

  constructor() {
    this.workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    // Initialize synchronously - don't wait
    this.initializeCoreServices();
  }

  private async initializeCoreServices(): Promise<void> {
    try {
      if (!this.workspaceFolder) {
        console.error("❌ No workspace folder available");
        this.coreServices = null;
        this._onDidChangeTreeData.fire();
        return;
      }

      // Read database path from config
      let dbPath: string;
      const configPath = path.join(
        this.workspaceFolder.uri.fsPath,
        "carbonara.config.json"
      );

      try {
        if (require("fs").existsSync(configPath)) {
          const config = JSON.parse(
            require("fs").readFileSync(configPath, "utf8")
          );
          if (config.database?.path) {
            // If path is relative, make it relative to workspace
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
        console.error("❌ Error reading config:", error);
        dbPath = path.join(this.workspaceFolder.uri.fsPath, "carbonara.db");
      }

      // Test individual steps to isolate the hanging issue

      const dataService = createDataService({ dbPath });

      const dbInitTimeout = new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error("Database initialization timed out after 10 seconds")
            ),
          10000
        )
      );

      await Promise.race([dataService.initialize(), dbInitTimeout]);

      const schemaService = createSchemaService();

      const schemaTimeout = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Schema loading timed out after 5 seconds")),
          5000
        )
      );

      await Promise.race([schemaService.loadToolSchemas(), schemaTimeout]);

      const vscodeProvider = createVSCodeDataProvider(
        dataService,
        schemaService
      );

      this.coreServices = {
        dataService,
        schemaService,
        vscodeProvider,
      };

      // Test the services immediately
      try {
        const projectPath = this.workspaceFolder.uri.fsPath;
        const testData =
          await this.coreServices.vscodeProvider.loadDataForProject(
            projectPath
          );
      } catch (testError) {
        console.error("⚠️ Test data load failed:", testError);
      }
    } catch (error) {
      console.error("❌ Core services initialization failed:", error);
      console.error("📋 Full error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : "No stack trace",
        name: error instanceof Error ? error.name : "Unknown",
      });
      this.coreServices = null;
    } finally {
      // Always trigger refresh to update UI (either with data or error state)

      this._onDidChangeTreeData.fire();
    }
  }

  async refresh(): Promise<void> {
    // Clear cached data to force reload from database
    this.cachedItems = null;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: DataItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: DataItem): DataItem[] | Promise<DataItem[]> {
    if (!this.workspaceFolder) {
      return [
        new DataItem(
          "No workspace folder",
          "",
          vscode.TreeItemCollapsibleState.None,
          "info"
        ),
      ];
    }

    if (!this.coreServices) {
      // Show current initialization status in UI
      let dbPath = "unknown";
      let dbExists = false;

      if (this.workspaceFolder) {
        // Try to read database path from config
        const configPath = path.join(
          this.workspaceFolder.uri.fsPath,
          "carbonara.config.json"
        );
        try {
          if (require("fs").existsSync(configPath)) {
            const config = JSON.parse(
              require("fs").readFileSync(configPath, "utf8")
            );
            if (config.database?.path) {
              // If path is relative, make it relative to workspace
              dbPath = path.isAbsolute(config.database.path)
                ? config.database.path
                : path.join(
                    this.workspaceFolder.uri.fsPath,
                    config.database.path
                  );
            } else {
              dbPath = path.join(
                this.workspaceFolder.uri.fsPath,
                "carbonara.db"
              );
            }
          } else {
            dbPath = path.join(this.workspaceFolder.uri.fsPath, "carbonara.db");
          }
          dbExists = require("fs").existsSync(dbPath);
        } catch (error) {
          dbPath = `Error reading config: ${error}`;
        }
      }
      return [
        new DataItem(
          "🔄 Loading data...",
          "Initializing services",
          vscode.TreeItemCollapsibleState.None,
          "info"
        ),
        new DataItem(
          `📁 Workspace: ${this.workspaceFolder?.uri.fsPath || "None"}`,
          "",
          vscode.TreeItemCollapsibleState.None,
          "info"
        ),
        new DataItem(
          `🗄️ Database: ${dbPath}`,
          "",
          vscode.TreeItemCollapsibleState.None,
          "info"
        ),
        new DataItem(
          `📊 DB exists: ${dbExists}`,
          "",
          vscode.TreeItemCollapsibleState.None,
          "info"
        ),
        new DataItem(
          "⏳ Waiting for initialization...",
          "Check VSCode Developer Console for errors",
          vscode.TreeItemCollapsibleState.None,
          "info"
        ),
      ];
    }

    if (element) {
      // Handle child elements - for now return empty
      return [];
    } else {
      // Load root items with real data
      return this.loadRootItemsSync();
    }
  }

  private loadRootItemsSync(): DataItem[] {
    if (!this.coreServices || !this.workspaceFolder) {
      return [
        new DataItem(
          "No services or workspace",
          "",
          vscode.TreeItemCollapsibleState.None,
          "info"
        ),
      ];
    }

    // If we have cached data, return it
    if (this.cachedItems) {
      return this.cachedItems;
    }

    // Start async data loading in background and return loading message
    this.loadRootItemsAsync()
      .then((items) => {
        this.cachedItems = items;
        // When data is ready, fire refresh to update UI
        this._onDidChangeTreeData.fire();
      })
      .catch((error) => {
        console.error("❌ Async load failed:", error);
        this.cachedItems = [
          new DataItem(
            UI_TEXT.DATA_TREE.ERROR_LOADING,
            error.message,
            vscode.TreeItemCollapsibleState.None,
            "error"
          ),
        ];
        this._onDidChangeTreeData.fire();
      });

    return [
      new DataItem(
        UI_TEXT.DATA_TREE.LOADING,
        UI_TEXT.DATA_TREE.LOADING_DESCRIPTION,
        vscode.TreeItemCollapsibleState.None,
        "info"
      ),
    ];
  }

  private async loadRootItemsAsync(): Promise<DataItem[]> {
    try {
      const projectPath = this.workspaceFolder!.uri.fsPath;
      const dbPath = path.join(projectPath, "carbonara.db");

      if (!require("fs").existsSync(dbPath)) {
        return [
          new DataItem(
            "❌ Database not found",
            `No database at ${dbPath}`,
            vscode.TreeItemCollapsibleState.None,
            "error"
          ),
        ];
      }

      // Load assessment data
      const assessmentData =
        await this.coreServices!.vscodeProvider.loadDataForProject(projectPath);

      if (assessmentData.length === 0) {
        return [
          new DataItem(
            UI_TEXT.DATA_TREE.NO_DATA,
            UI_TEXT.DATA_TREE.NO_DATA_DESCRIPTION,
            vscode.TreeItemCollapsibleState.None,
            "info"
          ),
        ];
      }

      // Create grouped items
      const groups =
        await this.coreServices!.vscodeProvider.createGroupedItems(projectPath);

      const items: DataItem[] = [];
      groups.forEach((group, groupIndex) => {
        // Add group header
        items.push(
          new DataItem(
            group.displayName,
            group.toolName,
            vscode.TreeItemCollapsibleState.Expanded,
            "group",
            group.toolName
          )
        );

        // Add entries
        group.entries.forEach((entry) => {
          items.push(
            new DataItem(
              entry.label,
              entry.description,
              vscode.TreeItemCollapsibleState.Collapsed,
              "entry",
              entry.toolName,
              entry.id
            )
          );
        });
      });

      return items;
    } catch (error) {
      console.error("❌ Error loading root items:", error);
      return [
        new DataItem(
          "❌ Error loading data",
          error instanceof Error ? error.message : "Unknown error",
          vscode.TreeItemCollapsibleState.None,
          "error"
        ),
      ];
    }
  }

  private async createGroupedItems(): Promise<DataItem[]> {
    if (!this.coreServices || !this.workspaceFolder) {
      return [
        new DataItem(
          UI_TEXT.DATA_TREE.NO_DATA,
          UI_TEXT.DATA_TREE.NO_DATA_DESCRIPTION,
          vscode.TreeItemCollapsibleState.None,
          "info"
        ),
      ];
    }

    try {
      const startTime = Date.now();

      const projectPath = this.workspaceFolder.uri.fsPath;
      const dbPath = path.join(projectPath, "carbonara.db");
      const dbExists = require("fs").existsSync(dbPath);

      if (!dbExists) {
        return [
          new DataItem(
            "❌ Database not found",
            `No database at ${dbPath}`,
            vscode.TreeItemCollapsibleState.None,
            "error"
          ),
        ];
      }

      // Step 1: Test data service directly

      const step1Start = Date.now();
      const assessmentData =
        await this.coreServices.vscodeProvider.loadDataForProject(projectPath);
      const step1Time = Date.now() - step1Start;

      if (assessmentData.length === 0) {
        return [
          new DataItem(
            UI_TEXT.DATA_TREE.NO_DATA,
            UI_TEXT.DATA_TREE.NO_DATA_DESCRIPTION,
            vscode.TreeItemCollapsibleState.None,
            "info"
          ),
        ];
      }

      // Step 2: Create grouped items

      const step2Start = Date.now();
      const groups =
        await this.coreServices.vscodeProvider.createGroupedItems(projectPath);
      const step2Time = Date.now() - step2Start;

      groups.forEach((group, index) => {});

      if (groups.length === 0) {
        return [
          new DataItem(
            UI_TEXT.DATA_TREE.NO_DATA,
            UI_TEXT.DATA_TREE.NO_DATA_DESCRIPTION,
            vscode.TreeItemCollapsibleState.None,
            "info"
          ),
        ];
      }

      // Step 3: Convert groups to DataItems

      const step3Start = Date.now();

      const items: DataItem[] = [];

      groups.forEach((group, groupIndex) => {
        // Add group header
        const groupItem = new DataItem(
          group.displayName,
          group.toolName,
          vscode.TreeItemCollapsibleState.Expanded,
          "group",
          group.toolName
        );
        items.push(groupItem);

        // Add entries
        group.entries.forEach((entry, entryIndex) => {
          const entryItem = new DataItem(
            entry.label,
            entry.description,
            vscode.TreeItemCollapsibleState.Collapsed,
            "entry",
            entry.toolName,
            entry.id
          );
          items.push(entryItem);
        });
      });

      const step3Time = Date.now() - step3Start;
      const totalTime = Date.now() - startTime;

      return items;
    } catch (error) {
      console.error("Error creating grouped items:", error);
      return [
        new DataItem(
          "Error loading data",
          "",
          vscode.TreeItemCollapsibleState.None,
          "error"
        ),
      ];
    }
  }

  async exportData(format: "json" | "csv"): Promise<void> {
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

  async clearData(): Promise<void> {
    const answer = await vscode.window.showWarningMessage(
      "This will delete all stored data for this project. This action cannot be undone.",
      "Delete All Data",
      "Cancel"
    );

    if (answer === "Delete All Data") {
      // Implementation would go here
      vscode.window.showInformationMessage(
        "Data clearing is not yet implemented"
      );
    }
  }

  async getProjectStats(): Promise<{
    totalEntries: number;
    toolCounts: { [toolName: string]: number };
  }> {
    if (!this.coreServices || !this.workspaceFolder) {
      return { totalEntries: 0, toolCounts: {} };
    }

    try {
      const projectPath = this.workspaceFolder.uri.fsPath;
      return await this.coreServices.vscodeProvider.getProjectStats(
        projectPath
      );
    } catch (error) {
      console.error("Error getting project stats:", error);
      return { totalEntries: 0, toolCounts: {} };
    }
  }
}

export class DataItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: "group" | "entry" | "detail" | "info" | "error",
    public readonly toolName?: string,
    public readonly entryId?: number
  ) {
    super(label, collapsibleState);
    this.tooltip = description;
    this.description = description;

    // Set context value for menu contributions
    switch (type) {
      case "group":
        this.contextValue = "carbonara-data-group";
        break;
      case "entry":
        this.contextValue = "carbonara-data-entry";
        break;
      case "detail":
        this.contextValue = "carbonara-data-detail";
        break;
      default:
        this.contextValue = "carbonara-data-item";
    }

    // Set icons
    switch (type) {
      case "group":
        this.iconPath = new vscode.ThemeIcon("folder");
        break;
      case "entry":
        this.iconPath = new vscode.ThemeIcon("file");
        break;
      case "detail":
        this.iconPath = new vscode.ThemeIcon("symbol-property");
        break;
      case "error":
        this.iconPath = new vscode.ThemeIcon("error");
        break;
      case "info":
        this.iconPath = new vscode.ThemeIcon("info");
        break;
    }
  }
}
