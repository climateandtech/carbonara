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
import { getSemgrepDataService } from "./semgrep-integration";

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
    // Load new data in background without clearing cache
    // This prevents showing "Loading..." message during refresh
    if (this.coreServices && this.workspaceFolder) {
      try {
        const newItems = await this.loadRootItemsAsync();
        // Only update cache and fire event if data actually changed
        const hasChanged =
          !this.cachedItems ||
          JSON.stringify(newItems.map((i) => i.label)) !==
            JSON.stringify(this.cachedItems.map((i) => i.label));

        if (hasChanged) {
          this.cachedItems = newItems;
          this._onDidChangeTreeData.fire();
        }
      } catch (error) {
        console.error("Error refreshing data:", error);
      }
    } else {
      // If services aren't ready, fall back to old behavior
      this.cachedItems = null;
      this._onDidChangeTreeData.fire();
    }
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
      // Return children if the element has them
      if (element.children) {
        return element.children;
      }
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

    // If we have cached data, return it immediately (no loading message)
    if (this.cachedItems) {
      return this.cachedItems;
    }

    // Only on first load (no cache): start async data loading and show loading message
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

    // Show loading message only on first load
    return [
      new DataItem(
        UI_TEXT.DATA_TREE.LOADING,
        UI_TEXT.DATA_TREE.LOADING_DESCRIPTION,
        vscode.TreeItemCollapsibleState.None,
        "info"
      ),
    ];
  }

  /**
   * Build a folder tree structure from file paths
   */
  private buildFolderTree(
    resultsByFile: Map<string, any[]>,
    projectPath: string
  ): DataItem[] {
    // Create a tree structure
    interface TreeNode {
      name: string;
      path: string;
      children: Map<string, TreeNode>;
      results?: any[];
      isFile: boolean;
    }

    const root: TreeNode = {
      name: "",
      path: "",
      children: new Map(),
      isFile: false,
    };

    // Build tree structure
    resultsByFile.forEach((results, filePath) => {
      // Ensure the path is relative to the project root
      let relativePath = filePath;

      // If the path is absolute, make it relative to the project
      if (path.isAbsolute(filePath)) {
        relativePath = path.relative(projectPath, filePath);
      }

      // Normalize path separators and split into parts
      const parts = relativePath.replace(/\\/g, '/').split("/").filter(part => part.length > 0);
      let currentNode = root;

      parts.forEach((part, index) => {
        const isLastPart = index === parts.length - 1;

        if (!currentNode.children.has(part)) {
          const nodePath = parts.slice(0, index + 1).join("/");
          currentNode.children.set(part, {
            name: part,
            path: nodePath,
            children: new Map(),
            isFile: isLastPart,
            results: isLastPart ? results : undefined,
          });
        }

        if (isLastPart) {
          currentNode.children.get(part)!.results = results;
        }

        currentNode = currentNode.children.get(part)!;
      });
    });

    // Convert tree to DataItems
    const convertNodeToItems = (
      node: TreeNode,
      level: number = 0
    ): DataItem[] => {
      const items: DataItem[] = [];

      // Sort: folders first, then files
      const entries = Array.from(node.children.entries()).sort((a, b) => {
        const [, nodeA] = a;
        const [, nodeB] = b;
        if (nodeA.isFile && !nodeB.isFile) return 1;
        if (!nodeA.isFile && nodeB.isFile) return -1;
        return nodeA.name.localeCompare(nodeB.name);
      });

      entries.forEach(([, childNode]) => {
        if (childNode.isFile && childNode.results) {
          // File node with results
          const errorCount = childNode.results.filter(
            (r) => r.severity === "ERROR"
          ).length;
          const warningCount = childNode.results.filter(
            (r) => r.severity === "WARNING"
          ).length;
          const infoCount = childNode.results.filter(
            (r) => r.severity === "INFO"
          ).length;

          let severityBadge = "";
          if (errorCount > 0) severityBadge = `🚨 ${errorCount}`;
          else if (warningCount > 0) severityBadge = `⚠️ ${warningCount}`;
          else severityBadge = `ℹ️ ${infoCount}`;

          const absolutePath = path.isAbsolute(childNode.path)
            ? childNode.path
            : path.join(projectPath, childNode.path);

          const fileItem = new DataItem(
            childNode.name,
            `${childNode.results.length} findings: ${severityBadge}`,
            vscode.TreeItemCollapsibleState.Collapsed,
            "file",
            "semgrep",
            undefined,
            absolutePath
          );

          // Add individual findings as children
          fileItem.children = childNode.results.map((result) => {
            const findingItem = new DataItem(
              `Line ${result.start_line}: ${result.rule_id}`,
              result.message,
              vscode.TreeItemCollapsibleState.None,
              "finding",
              "semgrep",
              undefined,
              absolutePath,
              result
            );
            return findingItem;
          });

          items.push(fileItem);
        } else if (!childNode.isFile && childNode.children.size > 0) {
          // Folder node
          const folderItem = new DataItem(
            childNode.name,
            "",
            vscode.TreeItemCollapsibleState.Collapsed,
            "folder",
            "semgrep"
          );

          // Recursively add children
          folderItem.children = convertNodeToItems(childNode, level + 1);

          items.push(folderItem);
        }
      });

      return items;
    };

    return convertNodeToItems(root);
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

      const items: DataItem[] = [];

      // Load Semgrep results using the shared Semgrep DataService
      try {
        const semgrepDataService = getSemgrepDataService();
        if (!semgrepDataService) {
          console.log("Semgrep DataService not initialized yet");
          // Continue without Semgrep results
        } else {
          const semgrepResults =
            await semgrepDataService.getAllSemgrepResults();

          if (semgrepResults.length > 0) {
            // Group by file
            const resultsByFile = new Map<string, typeof semgrepResults>();
            semgrepResults.forEach((result) => {
              if (!resultsByFile.has(result.file_path)) {
                resultsByFile.set(result.file_path, []);
              }
              resultsByFile.get(result.file_path)!.push(result);
            });

            // Add Code Scan group
            const codeScanGroup = new DataItem(
              `Code Scan (${semgrepResults.length})`,
              `Found in ${resultsByFile.size} files`,
              vscode.TreeItemCollapsibleState.Expanded,
              "group",
              "semgrep"
            );

            // Build folder tree structure
            codeScanGroup.children = this.buildFolderTree(
              resultsByFile,
              projectPath
            );

            items.push(codeScanGroup);
          }
        }
      } catch (error) {
        console.error("Error loading Semgrep results:", error);
      }

      // Load assessment data
      const assessmentData =
        await this.coreServices!.vscodeProvider.loadDataForProject(projectPath);

      if (assessmentData.length > 0) {
        // Create grouped items for assessment data
        const groups =
          await this.coreServices!.vscodeProvider.createGroupedItems(
            projectPath
          );

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
      }

      if (items.length === 0) {
        return [
          new DataItem(
            UI_TEXT.DATA_TREE.NO_DATA,
            UI_TEXT.DATA_TREE.NO_DATA_DESCRIPTION,
            vscode.TreeItemCollapsibleState.None,
            "info"
          ),
        ];
      }

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

  async deleteSemgrepResultsForFiles(items: DataItem[]): Promise<void> {
    const semgrepDataService = getSemgrepDataService();
    if (!semgrepDataService) {
      vscode.window.showErrorMessage("Semgrep database service not available");
      return;
    }

    // Extract file paths from selected items
    const filePaths = items
      .filter((item) => item.toolName === "semgrep" && item.label)
      .map((item) => item.label);

    if (filePaths.length === 0) {
      vscode.window.showWarningMessage("No Semgrep file results selected");
      return;
    }

    const fileList =
      filePaths.length === 1 ? filePaths[0] : `${filePaths.length} files`;

    const answer = await vscode.window.showWarningMessage(
      `Delete Semgrep results for ${fileList}? This action cannot be undone.`,
      "Delete",
      "Cancel"
    );

    if (answer === "Delete") {
      try {
        for (const filePath of filePaths) {
          await semgrepDataService.deleteSemgrepResultsByFile(filePath);
        }
        vscode.window.showInformationMessage(
          `Deleted Semgrep results for ${fileList}`
        );
        // Refresh the tree
        this.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to delete Semgrep results: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
}

export class DataItem extends vscode.TreeItem {
  public children?: DataItem[];

  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type:
      | "group"
      | "entry"
      | "detail"
      | "info"
      | "error"
      | "folder"
      | "file"
      | "finding",
    public readonly toolName?: string,
    public readonly entryId?: number,
    public readonly filePath?: string,
    public readonly resultData?: any
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
      case "folder":
        this.contextValue = "carbonara-data-folder";
        break;
      case "file":
        this.contextValue = "carbonara-semgrep-file";
        break;
      case "finding":
        this.contextValue = "carbonara-semgrep-finding";
        break;
      default:
        this.contextValue = "carbonara-data-item";
    }

    // Set icons
    switch (type) {
      case "group":
        this.iconPath = new vscode.ThemeIcon("folder");
        break;
      case "folder":
        this.iconPath = new vscode.ThemeIcon("folder");
        break;
      case "file":
        this.iconPath = new vscode.ThemeIcon("file");
        break;
      case "finding":
        // Use different icons based on severity
        if (this.resultData?.severity === "ERROR") {
          this.iconPath = new vscode.ThemeIcon(
            "warning",
            new vscode.ThemeColor("problemsWarningIcon.foreground")
          );
        } else if (this.resultData?.severity === "WARNING") {
          this.iconPath = new vscode.ThemeIcon(
            "info",
            new vscode.ThemeColor("problemsInfoIcon.foreground")
          );
        } else {
          this.iconPath = new vscode.ThemeIcon("lightbulb");
        }
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

    // Add command to open file when clicked (for Semgrep results)
    if (this.toolName === "semgrep" && this.filePath) {
      if (this.type === "file" || this.type === "entry") {
        // Open file without jumping to specific line
        this.command = {
          command: "carbonara.openSemgrepFile",
          title: "Open File",
          arguments: [this.filePath],
        };
      } else if (this.type === "finding" && this.resultData) {
        // Open file and jump to the specific line
        this.command = {
          command: "carbonara.openSemgrepFinding",
          title: "Open Finding",
          arguments: [
            this.filePath,
            this.resultData.start_line,
            this.resultData.start_column,
          ],
        };
      }
    }
  }
}
