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
  ThresholdService,
} from "@carbonara/core";
import { UI_TEXT } from "./constants/ui-text";
import { getSemgrepDataService } from "./semgrep-integration";

/**
 * Decoration provider for Semgrep findings
 * Adds colored badges on the right side of findings based on severity
 */
export class SemgrepFindingDecorationProvider
  implements vscode.FileDecorationProvider
{
  private readonly _onDidChangeFileDecorations = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[] | undefined
  >();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    // Only decorate carbonara-finding URIs
    if (uri.scheme !== "carbonara-finding") {
      return undefined;
    }

    // Extract severity from query parameters
    const params = new URLSearchParams(uri.query);
    const severity = params.get("severity");

    if (!severity) {
      return undefined;
    }

    // Return decoration based on severity
    switch (severity) {
      case "ERROR":
        return {
          badge: "○",
          color: new vscode.ThemeColor("problemsErrorIcon.foreground"),
          tooltip: "Error severity",
        };
      case "WARNING":
        return {
          badge: "○",
          color: new vscode.ThemeColor("problemsWarningIcon.foreground"),
          tooltip: "Warning severity",
        };
      case "INFO":
        return {
          badge: "○",
          color: new vscode.ThemeColor("problemsInfoIcon.foreground"),
          tooltip: "Info severity",
        };
      default:
        return undefined;
    }
  }

  refresh(): void {
    this._onDidChangeFileDecorations.fire(undefined);
  }
}

/**
 * Decoration provider for view icons (open-preview icon) on entries and groups
 * Note: Icons are now shown via inline menu contributions (group: "inline")
 * This class is kept for potential future use but currently returns undefined
 */
export class ViewIconDecorationProvider
  implements vscode.FileDecorationProvider
{
  private readonly _onDidChangeFileDecorations = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[] | undefined
  >();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    // Icons are now shown via inline menu contributions, not decorations
    return undefined;
  }

  refresh(): void {
    this._onDidChangeFileDecorations.fire(undefined);
  }
}

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
  public badgeProvider?: import("./badge-decoration-provider").BadgeDecorationProvider;
  private thresholdService: ThresholdService;
  private initializationInProgress: boolean = false;
  private configWatcher: vscode.FileSystemWatcher | null = null;

  constructor() {
    this.thresholdService = new ThresholdService();
    this.workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    // Set up file watcher for config file creation
    this.setupConfigWatcher();
    
    // Initialize synchronously - don't wait
    this.initializeCoreServices();
  }

  private setupConfigWatcher(): void {
    // Watch for config file creation/change to trigger initialization
    this.configWatcher = vscode.workspace.createFileSystemWatcher(
      "**/.carbonara/carbonara.config.json"
    );
    
    // When config is created, trigger initialization
    this.configWatcher.onDidCreate(() => {
      console.log("🔄 Config file created, triggering core services initialization...");
      if (!this.coreServices && !this.initializationInProgress) {
        this.initializeCoreServices().catch((err) => {
          console.error("Failed to initialize core services after config creation:", err);
        });
      }
    });
    
    // When config changes, refresh if services are already initialized
    this.configWatcher.onDidChange(() => {
      if (this.coreServices) {
        console.log("🔄 Config file changed, refreshing data...");
        this.refresh();
      } else if (!this.initializationInProgress) {
        // Config changed but services not initialized - try to initialize
        this.initializeCoreServices().catch((err) => {
          console.error("Failed to initialize core services after config change:", err);
        });
      }
    });
  }

  dispose(): void {
    if (this.configWatcher) {
      this.configWatcher.dispose();
    }
  }

  private async initializeCoreServices(): Promise<void> {
    // Prevent concurrent initialization
    if (this.initializationInProgress) {
      console.log("⏸️ Initialization already in progress, skipping...");
      return;
    }
    
    // If services are already initialized, don't re-initialize
    if (this.coreServices) {
      console.log("✅ Core services already initialized, skipping...");
      return;
    }
    
    this.initializationInProgress = true;
    
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
        ".carbonara",
        "carbonara.config.json"
      );

      // Check if Carbonara project is initialized
      if (!require("fs").existsSync(configPath)) {
        console.log(
          "No Carbonara project detected. Core services will not be initialized."
        );
        this.coreServices = null;
        this._onDidChangeTreeData.fire();
        return;
      }

      // CRITICAL: Database path resolution from carbonara.config.json
      //
      // Required config format (.carbonara/carbonara.config.json):
      // {
      //   "name": "project-name",
      //   "projectId": 1,
      //   "database": {
      //     "path": ".carbonara/carbonara.db"  // Relative to workspace root, or absolute
      //   },
      //   "tools": {}
      // }
      //
      // The database.path can be:
      // - Relative: Resolved relative to workspace root (e.g., ".carbonara/carbonara.db")
      // - Absolute: Used as-is (e.g., "/path/to/database.db")
      // - Omitted: Defaults to ".carbonara/carbonara.db" in workspace root
      //
      // This format matches the test fixtures to ensure consistent behavior.
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
            // Fallback to default path if config.database.path is not specified
            dbPath = path.join(
              this.workspaceFolder.uri.fsPath,
              ".carbonara",
              "carbonara.db"
            );
          }
        } else {
          dbPath = path.join(
            this.workspaceFolder.uri.fsPath,
            ".carbonara",
            "carbonara.db"
          );
        }
      } catch (error) {
        console.error("❌ Error reading config:", error);
        dbPath = path.join(
          this.workspaceFolder.uri.fsPath,
          ".carbonara",
          "carbonara.db"
        );
      }

      // Initialize database service with timeout warning (but don't abort)
      console.log("🔧 Initializing database service...");
      const dataService = createDataService({ dbPath });

      const dbInitPromise = dataService.initialize();
      const dbInitTimeout = setTimeout(() => {
        console.warn(
          "⚠️ Database initialization taking longer than expected (10s)..."
        );
      }, 10000);

      await dbInitPromise;
      clearTimeout(dbInitTimeout);
      console.log("✅ Database service initialized");

      // Initialize schema service with timeout warning (but don't abort)
      console.log("🔧 Loading tool schemas...");
      const schemaService = createSchemaService();

      const schemaLoadPromise = schemaService.loadToolSchemas();
      const schemaTimeout = setTimeout(() => {
        console.warn("⚠️ Schema loading taking longer than expected (5s)...");
      }, 5000);

      await schemaLoadPromise;
      clearTimeout(schemaTimeout);
      console.log("✅ Tool schemas loaded");

      const vscodeProvider = createVSCodeDataProvider(
        dataService,
        schemaService
      );

      this.coreServices = {
        dataService,
        schemaService,
        vscodeProvider,
      };

      // Set up callback to auto-refresh VSCode tree when database changes on disk
      // This enables disk-first flow: CLI writes → file watcher → auto-refresh
      dataService.setOnDatabaseReloadCallback(() => {
        console.log("🔄 Database changed on disk, auto-refreshing VSCode tree...");
        this.refresh();
      });

      console.log("✅ Core services initialized successfully");

      // Test the services immediately
      try {
        const projectPath = this.workspaceFolder.uri.fsPath;
        console.log("🧪 Testing data load...");
        const testData =
          await this.coreServices.vscodeProvider.loadDataForProject(
            projectPath
          );
        console.log(
          `✅ Test data load successful: ${testData.length} entries found`
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
      // Always reset initialization flag and trigger refresh to update UI
      this.initializationInProgress = false;
      this._onDidChangeTreeData.fire();
    }
  }

  getCoreServices() {
    return this.coreServices;
  }

  async refresh(): Promise<void> {
    // Load new data in background without clearing cache
    // This prevents showing "Loading..." message during refresh
    if (this.coreServices && this.workspaceFolder) {
      try {
        // Reload database from disk to pick up any external changes (e.g., from CLI)
        await this.coreServices.dataService.reloadDatabase();
        
        // Load fresh data from database
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
      // If services aren't ready, check if we should initialize them (fallback)
      // The file watcher should catch this, but this is a safety net
      if (this.workspaceFolder) {
        const configPath = path.join(
          this.workspaceFolder.uri.fsPath,
          ".carbonara",
          "carbonara.config.json"
        );
        
        // If config exists but coreServices is null, trigger initialization
        if (require("fs").existsSync(configPath) && !this.coreServices && !this.initializationInProgress) {
          console.log("🔄 Config detected in refresh() but services not initialized, triggering initialization...");
          // Trigger initialization (it will fire _onDidChangeTreeData when done)
          this.initializeCoreServices().catch((err) => {
            console.error("Failed to initialize core services in refresh():", err);
          });
          return;
        }
      }
      
      // If services aren't ready and we can't initialize, fall back to old behavior
      this.cachedItems = null;
      this._onDidChangeTreeData.fire();
    }
  }

  getTreeItem(element: DataItem): vscode.TreeItem {
    // Set badge color if entry/detail has badgeColor and resourceUri, and feature flag is enabled
    const showBadges = vscode.workspace.getConfiguration("carbonara").get<boolean>("showBadges", true);
    if (showBadges && element.badgeColor && element.resourceUri && this.badgeProvider) {
      this.badgeProvider.setBadge(element.resourceUri, element.badgeColor);
    }
    return element;
  }

  getChildren(element?: DataItem): DataItem[] | Promise<DataItem[]> {
    if (!this.workspaceFolder) {
      // No workspace open - return empty
      return [];
    }

    // Check if Carbonara is initialized
    const configPath = path.join(
      this.workspaceFolder.uri.fsPath,
      ".carbonara",
      "carbonara.config.json"
    );

    if (!require("fs").existsSync(configPath)) {
      // Workspace exists but Carbonara is not initialized
      // Show a single item with description styling
      return [
        new DataItem(
          "",
          "Initialise Carbonara to access analysis results",
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
          ".carbonara",
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
                ".carbonara",
                "carbonara.db"
              );
            }
          } else {
            dbPath = path.join(
              this.workspaceFolder.uri.fsPath,
              ".carbonara",
              "carbonara.db"
            );
          }
          dbExists = require("fs").existsSync(dbPath);
        } catch (error) {
          dbPath = `Error reading config: ${error}`;
        }
      }
      return [
        new DataItem(
          "Loading data...",
          "Initializing services",
          vscode.TreeItemCollapsibleState.None,
          "info"
        ),
        new DataItem(
          `Workspace: ${this.workspaceFolder?.uri.fsPath || "None"}`,
          "",
          vscode.TreeItemCollapsibleState.None,
          "info"
        ),
        new DataItem(
          `Database: ${dbPath}`,
          "",
          vscode.TreeItemCollapsibleState.None,
          "info"
        ),
        new DataItem(
          `DB exists: ${dbExists}`,
          "",
          vscode.TreeItemCollapsibleState.None,
          "info"
        ),
        new DataItem(
          "Waiting for initialization...",
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

      // Handle entry expansion - load detail fields from database
      if (element.type === "entry" && element.entryId && this.coreServices) {
        return this.loadEntryDetails(element.entryId, element.toolName);
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
      const parts = relativePath
        .replace(/\\/g, "/")
        .split("/")
        .filter((part) => part.length > 0);
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
          const totalFindings = childNode.results.length;

          const absolutePath = path.isAbsolute(childNode.path)
            ? childNode.path
            : path.join(projectPath, childNode.path);

          const fileItem = new DataItem(
            childNode.name,
            `${totalFindings} ${totalFindings === 1 ? "finding" : "findings"}`,
            vscode.TreeItemCollapsibleState.Collapsed,
            "file",
            "semgrep",
            undefined,
            absolutePath
          );

          // Add individual findings as children
          fileItem.children = childNode.results.map((result, index) => {
            // Create a unique resource URI for this finding to enable decorations
            const findingUri = vscode.Uri.parse(
              `carbonara-finding://${absolutePath}?line=${result.start_line}&severity=${result.severity}&index=${index}`
            );

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

            // Set resource URI to enable decorations
            findingItem.resourceUri = findingUri;

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
            "semgrep",
            undefined,
            childNode.path // Pass the full path for stable ID generation
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
      const dbPath = path.join(projectPath, ".carbonara", "carbonara.db");

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
              "code-scan" // Use unique toolName to avoid ID collision
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

      // Load assessment data - check coreServices is available
      if (!this.coreServices) {
        console.warn(
          "⚠️ Core services not initialized yet, returning loading state"
        );
        return [
          new DataItem(
            UI_TEXT.DATA_TREE.LOADING,
            UI_TEXT.DATA_TREE.LOADING_DESCRIPTION,
            vscode.TreeItemCollapsibleState.None,
            "info"
          ),
        ];
      }

      const assessmentData =
        await this.coreServices.vscodeProvider.loadDataForProject(projectPath);

      if (assessmentData.length > 0) {
        // Create grouped items for assessment data
        const groups =
          await this.coreServices.vscodeProvider.createGroupedItems(
            projectPath
          );

        groups.forEach((group, groupIndex) => {
          // Create entry items for this group
          const entryItems = group.entries.map((entry) => {
            return new DataItem(
              entry.label,
              entry.description,
              vscode.TreeItemCollapsibleState.Collapsed,
              "entry",
              entry.toolName,
              entry.id,
              undefined,
              undefined,
              undefined,
              entry.badgeColor
            );
          });

          // Add group header with entries as children
          const groupItem = new DataItem(
            group.displayName,
            group.toolName,
            vscode.TreeItemCollapsibleState.Expanded,
            "group",
            group.toolName
          );
          groupItem.children = entryItems;
          items.push(groupItem);
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

  /**
   * Load detail fields for an entry when it's expanded
   */
  private async loadEntryDetails(
    entryId: number,
    toolName?: string
  ): Promise<DataItem[]> {
    if (!this.coreServices || !this.workspaceFolder) {
      return [];
    }

    try {
      const projectPath = this.workspaceFolder.uri.fsPath;

      // Load all assessment data and find the entry by ID
      const allEntries =
        await this.coreServices.dataService.getAssessmentData();
      const entry = allEntries.find((e) => e.id === entryId);

      if (!entry) {
        console.warn(`Entry with ID ${entryId} not found`);
        return [];
      }

      // Special handling for deployment-scan: show best and worst deployments
      if (toolName === "deployment-scan") {
        return this.loadDeploymentScanDetails(entry);
      }

      // Get detail fields using the schema
      const details =
        await this.coreServices.vscodeProvider.createDataDetails(entry);

      // Filter fields for semgrep - only show severity counts and target
      let filteredDetails = details;
      if (toolName === "semgrep") {
        filteredDetails = details.filter(
          (detail) =>
            detail.key === "error_count" ||
            detail.key === "warning_count" ||
            detail.key === "info_count" ||
            detail.key === "target"
        );
      }

      // Convert DataDetail[] to DataItem[] children
      // Format label to make values stand out - put value in description
      // Note: VSCode doesn't support custom colors for description, but it's visually distinct
      return filteredDetails.map(
        (detail) => {
          // Parse label format: "Field Label: value" or "Label: value"
          const colonIndex = detail.label.indexOf(':');
          let fieldLabel = detail.label;
          let value = '';
          
          if (colonIndex > 0) {
            fieldLabel = detail.label.substring(0, colonIndex).trim();
            value = detail.label.substring(colonIndex + 1).trim();
          }
          
          // Create tooltip with full value for carbon and energy types
          let tooltip = detail.label; // Default tooltip is the full label
          if (detail.type === 'carbon' || detail.type === 'energy') {
            // Show full unrounded value in tooltip
            const originalValue = detail.value;
            if (typeof originalValue === 'number') {
              const unit = detail.type === 'carbon' ? 'g' : ' kWh';
              const fullValue = `${originalValue}${unit}`;
              // Only show tooltip if the value was actually rounded (different from displayed)
              if (fullValue !== value) {
                tooltip = `${fieldLabel}: ${fullValue}`;
              }
            }
          }
          
          const detailItem = new DataItem(
            fieldLabel,
            value, // Value in description - appears in muted color (theme-dependent)
            vscode.TreeItemCollapsibleState.None,
            "detail",
            toolName
          );
          detailItem.tooltip = tooltip;
          return detailItem;
        }
      );
    } catch (error) {
      console.error("Error loading entry details:", error);
      return [];
    }
  }

  /**
   * Load best and worst deployments for deployment-scan entries
   */
  private loadDeploymentScanDetails(entry: any): DataItem[] {
    const deployments = entry.data?.deployments || [];
    
    if (deployments.length === 0) {
      return [
        new DataItem(
          "No deployments found",
          "",
          vscode.TreeItemCollapsibleState.None,
          "info",
          "deployment-scan"
        )
      ];
    }

    // Find best (lowest carbon_intensity) and worst (highest carbon_intensity) deployments
    let bestDeployment: any = null;
    let worstDeployment: any = null;
    let bestIntensity: number | null = null;
    let worstIntensity: number | null = null;

    deployments.forEach((deployment: any) => {
      const intensity = deployment.carbon_intensity;
      if (intensity !== null && intensity !== undefined && !isNaN(intensity)) {
        const numIntensity = Number(intensity);
        if (bestIntensity === null || numIntensity < bestIntensity) {
          bestIntensity = numIntensity;
          bestDeployment = deployment;
        }
        if (worstIntensity === null || numIntensity > worstIntensity) {
          worstIntensity = numIntensity;
          worstDeployment = deployment;
        }
      }
    });

    const items: DataItem[] = [];

    // Add best deployment
    if (bestDeployment) {
      const bestBadgeColor = this.calculateDeploymentBadgeColor(bestIntensity!);
      const bestLabel = this.formatDeploymentLabel(bestDeployment, bestIntensity!);
      const bestItem = new DataItem(
        `Best deployment: ${bestLabel}`,
        "",
        vscode.TreeItemCollapsibleState.None,
        "detail",
        "deployment-scan",
        undefined,
        undefined,
        undefined,
        undefined,
        bestBadgeColor
      );
      // Set resourceUri for badge display
      bestItem.resourceUri = vscode.Uri.parse(`carbonara-badge://deployment/best/${entry.id}`);
      items.push(bestItem);
    }

    // Add worst deployment (only if different from best)
    if (worstDeployment && worstDeployment !== bestDeployment) {
      const worstBadgeColor = this.calculateDeploymentBadgeColor(worstIntensity!);
      const worstLabel = this.formatDeploymentLabel(worstDeployment, worstIntensity!);
      const worstItem = new DataItem(
        `Worst deployment: ${worstLabel}`,
        "",
        vscode.TreeItemCollapsibleState.None,
        "detail",
        "deployment-scan",
        undefined,
        undefined,
        undefined,
        undefined,
        worstBadgeColor
      );
      // Set resourceUri for badge display
      worstItem.resourceUri = vscode.Uri.parse(`carbonara-badge://deployment/worst/${entry.id}`);
      items.push(worstItem);
    }

    return items;
  }

  /**
   * Format deployment label: "provider - region - co2"
   */
  private formatDeploymentLabel(deployment: any, carbonIntensity: number): string {
    const parts: string[] = [];
    
    if (deployment.provider) {
      parts.push(deployment.provider);
    }
    if (deployment.region) {
      parts.push(deployment.region);
    }
    if (carbonIntensity !== null && carbonIntensity !== undefined) {
      parts.push(`${carbonIntensity} gCO2/kWh`);
    }
    
    return parts.join(" - ");
  }

  /**
   * Calculate badge color for a deployment based on carbon intensity
   */
  private calculateDeploymentBadgeColor(carbonIntensity: number): import("@carbonara/core").BadgeColor {
    return this.thresholdService.getBadgeColor('carbonIntensity', carbonIntensity);
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
      const dbPath = path.join(projectPath, ".carbonara", "carbonara.db");
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
      const carbonaraDir = path.join(
        this.workspaceFolder.uri.fsPath,
        ".carbonara"
      );

      // Ensure .carbonara directory exists
      if (!require("fs").existsSync(carbonaraDir)) {
        require("fs").mkdirSync(carbonaraDir, { recursive: true });
      }

      const filePath = path.join(carbonaraDir, filename);

      require("fs").writeFileSync(filePath, exportData);

      vscode.window.showInformationMessage(
        `Data exported to .carbonara/${filename}`
      );
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
  public badgeColor?: import("@carbonara/core").BadgeColor;

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
      | "finding"
      | "action",
    public readonly toolName?: string,
    public readonly entryId?: number,
    public readonly filePath?: string,
    public readonly resultData?: any,
    command?: vscode.Command,
    badgeColor?: import("@carbonara/core").BadgeColor
  ) {
    super(label, collapsibleState);
    this.tooltip = description;
    this.description = description;
    this.badgeColor = badgeColor;

    // Set command if provided
    if (command) {
      this.command = command;
    }

    // Set stable ID to preserve tree state across refreshes
    // This allows VSCode to remember which items are expanded/collapsed
    if (type === "group" && toolName) {
      this.id = `carbonara-group-${toolName}`;
    } else if (type === "folder" && filePath) {
      // Use full path for folders to ensure uniqueness
      this.id = `carbonara-folder-${filePath}`;
    } else if (type === "file" && filePath) {
      this.id = `carbonara-file-${filePath}`;
    } else if (type === "finding" && filePath && resultData) {
      this.id = `carbonara-finding-${filePath}-${resultData.start_line}-${resultData.rule_id}`;
    } else if (entryId) {
      this.id = `carbonara-entry-${entryId}`;
    }

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

    // Set tooltips for entries and groups to show "Click to view" on hover
    if (type === "entry" || type === "group") {
      this.tooltip = "Click to view";
    }

    // Set icons
    switch (type) {
      case "group":
        // No left-side icon - open-preview icon will appear on right via inline menu contribution
        break;
      case "folder":
        // No icon for folders
        break;
      case "file":
        this.iconPath = new vscode.ThemeIcon("symbol-namespace");
        break;
      case "finding":
        // No icon for findings
        break;
      case "entry":
        // No left-side icon - open-preview icon will appear on right via inline menu contribution
        // Set resourceUri for badge decoration if badgeColor is provided (green status pill)
        if (this.entryId) {
          // Use carbonara-badge scheme for badge decoration (green status pill)
          this.resourceUri = vscode.Uri.parse(`carbonara-badge://entry/${this.entryId}`);
        }
        break;
      case "detail":
        // No icon for detail items
        break;
      case "error":
        this.iconPath = new vscode.ThemeIcon("error");
        break;
      case "info":
        this.iconPath = new vscode.ThemeIcon("info");
        break;
      case "action":
        this.iconPath = new vscode.ThemeIcon("add");
        break;
    }

    // Add command to open virtual document when clicked (for entries and groups)
    if (this.type === "entry" && this.entryId) {
      this.command = {
        command: "carbonara.openEntryDocument",
        title: "View Entry",
        arguments: [this.entryId],
      };
    } else if (this.type === "group" && this.toolName) {
      this.command = {
        command: "carbonara.openGroupDocument",
        title: "View Summary",
        arguments: [this.toolName],
      };
    }

    // Add command to open file when clicked (for Semgrep results)
    if (this.toolName === "semgrep" && this.filePath) {
      if (this.type === "file") {
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
