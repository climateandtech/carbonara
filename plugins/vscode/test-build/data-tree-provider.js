"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataItem = exports.DataTreeProvider = exports.SemgrepFindingDecorationProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const core_1 = require("@carbonara/core");
const ui_text_1 = require("./constants/ui-text");
const semgrep_integration_1 = require("./semgrep-integration");
/**
 * Decoration provider for Semgrep findings
 * Adds colored badges on the right side of findings based on severity
 */
class SemgrepFindingDecorationProvider {
    constructor() {
        this._onDidChangeFileDecorations = new vscode.EventEmitter();
        this.onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;
    }
    provideFileDecoration(uri) {
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
    refresh() {
        this._onDidChangeFileDecorations.fire(undefined);
    }
}
exports.SemgrepFindingDecorationProvider = SemgrepFindingDecorationProvider;
class DataTreeProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.coreServices = null;
        this.cachedItems = null;
        this.initializationPromise = null;
        this.workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        this.outputChannel = vscode.window.createOutputChannel("Carbonara Data");
        this.outputChannel.appendLine("=== DataTreeProvider initialized ===");
        // Initialize asynchronously - store the promise so refresh can wait for it
        this.initializationPromise = this.initializeCoreServices();
    }
    async initializeCoreServices() {
        this.outputChannel.appendLine("🚀 Starting core services initialization...");
        this.outputChannel.show(true);
        try {
            if (!this.workspaceFolder) {
                this.outputChannel.appendLine("❌ No workspace folder available");
                this.coreServices = null;
                this._onDidChangeTreeData.fire();
                return;
            }
            this.outputChannel.appendLine(`📁 Workspace: ${this.workspaceFolder.uri.fsPath}`);
            // Read database path from config
            let dbPath;
            const configPath = path.join(this.workspaceFolder.uri.fsPath, ".carbonara", "carbonara.config.json");
            this.outputChannel.appendLine(`📝 Looking for config at: ${configPath}`);
            try {
                if (require("fs").existsSync(configPath)) {
                    this.outputChannel.appendLine("✅ Config file found");
                    const config = JSON.parse(require("fs").readFileSync(configPath, "utf8"));
                    if (config.database?.path) {
                        // If path is relative, make it relative to workspace
                        dbPath = path.isAbsolute(config.database.path)
                            ? config.database.path
                            : path.join(this.workspaceFolder.uri.fsPath, config.database.path);
                        this.outputChannel.appendLine(`📋 Config specifies DB path: ${dbPath}`);
                    }
                    else {
                        dbPath = path.join(this.workspaceFolder.uri.fsPath, ".carbonara", "carbonara.db");
                        this.outputChannel.appendLine(`📋 Config has no DB path, using default: ${dbPath}`);
                    }
                }
                else {
                    this.outputChannel.appendLine("ℹ️ No config file, using default DB path");
                    dbPath = path.join(this.workspaceFolder.uri.fsPath, ".carbonara", "carbonara.db");
                }
            }
            catch (error) {
                this.outputChannel.appendLine(`⚠️ Error reading config: ${error}`);
                dbPath = path.join(this.workspaceFolder.uri.fsPath, ".carbonara", "carbonara.db");
            }
            this.outputChannel.appendLine(`🗄️ Database path: ${dbPath}`);
            this.outputChannel.appendLine(`🗄️ DB exists: ${require("fs").existsSync(dbPath)}`);
            // Test individual steps to isolate the hanging issue
            this.outputChannel.appendLine("🔧 Creating data service...");
            const dataService = (0, core_1.createDataService)({ dbPath });
            const dbInitTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Database initialization timed out after 10 seconds")), 10000));
            this.outputChannel.appendLine("⏳ Initializing database...");
            await Promise.race([dataService.initialize(), dbInitTimeout]);
            this.outputChannel.appendLine("✅ Database initialized");
            this.outputChannel.appendLine("🔧 Creating schema service...");
            const schemaService = (0, core_1.createSchemaService)();
            const schemaTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Schema loading timed out after 5 seconds")), 5000));
            this.outputChannel.appendLine("⏳ Loading tool schemas...");
            await Promise.race([schemaService.loadToolSchemas(), schemaTimeout]);
            this.outputChannel.appendLine("✅ Schemas loaded");
            this.outputChannel.appendLine("🔧 Creating VSCode provider...");
            const vscodeProvider = (0, core_1.createVSCodeDataProvider)(dataService, schemaService);
            this.coreServices = {
                dataService,
                schemaService,
                vscodeProvider,
            };
            this.outputChannel.appendLine("✅ Core services ready!");
            // Test the services immediately
            try {
                this.outputChannel.appendLine("🧪 Testing data load...");
                const projectPath = this.workspaceFolder.uri.fsPath;
                const testData = await this.coreServices.vscodeProvider.loadDataForProject(projectPath);
                this.outputChannel.appendLine(`✅ Test load successful: ${testData.length} entries found`);
            }
            catch (testError) {
                this.outputChannel.appendLine(`⚠️ Test data load failed: ${testError}`);
                this.outputChannel.appendLine(`⚠️ Error details: ${testError instanceof Error ? testError.stack : 'No stack'}`);
            }
        }
        catch (error) {
            this.outputChannel.appendLine(`❌ Core services initialization FAILED!`);
            this.outputChannel.appendLine(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
            this.outputChannel.appendLine(`📋 Stack trace: ${error instanceof Error ? error.stack : 'No stack trace'}`);
            this.coreServices = null;
        }
        finally {
            // Always trigger refresh to update UI (either with data or error state)
            this.outputChannel.appendLine("🔄 Firing tree data change event");
            this._onDidChangeTreeData.fire();
        }
    }
    async refresh() {
        this.outputChannel.appendLine("\n=== REFRESH CALLED ===");
        this.outputChannel.appendLine(`Services ready: ${!!this.coreServices}`);
        this.outputChannel.appendLine(`Workspace folder: ${this.workspaceFolder?.uri.fsPath}`);
        this.outputChannel.show(true); // Show the output channel
        // If initialization is still in progress, wait for it
        if (this.initializationPromise) {
            this.outputChannel.appendLine("⏳ Waiting for initialization to complete...");
            try {
                await this.initializationPromise;
                this.outputChannel.appendLine(`✅ Initialization complete. Services ready: ${!!this.coreServices}`);
            }
            catch (error) {
                this.outputChannel.appendLine(`❌ Initialization failed: ${error}`);
            }
            // Clear the promise so we don't wait again
            this.initializationPromise = null;
        }
        vscode.window.showInformationMessage("🔄 Refreshing Carbonara data...");
        // Load new data in background without clearing cache
        // This prevents showing "Loading..." message during refresh
        if (this.coreServices && this.workspaceFolder) {
            try {
                this.outputChannel.appendLine("Loading root items...");
                const newItems = await this.loadRootItemsAsync();
                this.outputChannel.appendLine(`Loaded ${newItems.length} items`);
                // Log what items were loaded
                newItems.forEach((item, index) => {
                    this.outputChannel.appendLine(`  Item ${index}: ${item.label} (${item.type || 'unknown'})`);
                });
                // Log current cache state
                if (this.cachedItems) {
                    this.outputChannel.appendLine(`Current cache has ${this.cachedItems.length} items:`);
                    this.cachedItems.forEach((item, index) => {
                        this.outputChannel.appendLine(`  Cached ${index}: ${item.label} (${item.type || 'unknown'})`);
                    });
                }
                else {
                    this.outputChannel.appendLine("Current cache is null");
                }
                // Only update cache and fire event if data actually changed
                const hasChanged = !this.cachedItems ||
                    JSON.stringify(newItems.map((i) => i.label)) !==
                        JSON.stringify(this.cachedItems.map((i) => i.label));
                this.outputChannel.appendLine(`Has changed: ${hasChanged}`);
                // Always update cache and fire event to ensure UI is in sync
                // (The comparison might miss changes in children or other properties)
                this.cachedItems = newItems;
                this._onDidChangeTreeData.fire();
                this.outputChannel.appendLine("✅ Tree updated");
                vscode.window.showInformationMessage(`✅ Loaded ${newItems.length} data items`);
            }
            catch (error) {
                this.outputChannel.appendLine(`❌ Error: ${error}`);
                vscode.window.showErrorMessage(`Failed to refresh data: ${error}`);
            }
        }
        else {
            this.outputChannel.appendLine("⚠️ Services not ready");
            // If initialization failed, try to retry it
            if (!this.initializationPromise) {
                this.outputChannel.appendLine("🔄 Retrying initialization...");
                this.initializationPromise = this.initializeCoreServices();
                try {
                    await this.initializationPromise;
                    this.initializationPromise = null;
                    // If retry succeeded, try loading data again
                    if (this.coreServices && this.workspaceFolder) {
                        this.outputChannel.appendLine("✅ Retry successful, loading data...");
                        const newItems = await this.loadRootItemsAsync();
                        this.cachedItems = newItems;
                        this._onDidChangeTreeData.fire();
                        vscode.window.showInformationMessage(`✅ Loaded ${newItems.length} data items`);
                        return;
                    }
                }
                catch (retryError) {
                    this.outputChannel.appendLine(`❌ Retry failed: ${retryError}`);
                    this.initializationPromise = null;
                }
            }
            // If we get here, services still aren't ready
            this.outputChannel.appendLine("⚠️ Services still not ready, clearing cache");
            this.cachedItems = null;
            this._onDidChangeTreeData.fire();
            vscode.window.showWarningMessage("Core services not ready yet");
        }
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!this.workspaceFolder) {
            return [
                new DataItem("No workspace folder", "", vscode.TreeItemCollapsibleState.None, "info"),
            ];
        }
        if (!this.coreServices) {
            // Show current initialization status in UI
            let dbPath = "unknown";
            let dbExists = false;
            if (this.workspaceFolder) {
                // Try to read database path from config
                const configPath = path.join(this.workspaceFolder.uri.fsPath, ".carbonara", "carbonara.config.json");
                try {
                    if (require("fs").existsSync(configPath)) {
                        const config = JSON.parse(require("fs").readFileSync(configPath, "utf8"));
                        if (config.database?.path) {
                            // If path is relative, make it relative to workspace
                            dbPath = path.isAbsolute(config.database.path)
                                ? config.database.path
                                : path.join(this.workspaceFolder.uri.fsPath, config.database.path);
                        }
                        else {
                            dbPath = path.join(this.workspaceFolder.uri.fsPath, ".carbonara", "carbonara.db");
                        }
                    }
                    else {
                        dbPath = path.join(this.workspaceFolder.uri.fsPath, ".carbonara", "carbonara.db");
                    }
                    dbExists = require("fs").existsSync(dbPath);
                }
                catch (error) {
                    dbPath = `Error reading config: ${error}`;
                }
            }
            return [
                new DataItem("🔄 Loading data...", "Initializing services", vscode.TreeItemCollapsibleState.None, "info"),
                new DataItem(`📁 Workspace: ${this.workspaceFolder?.uri.fsPath || "None"}`, "", vscode.TreeItemCollapsibleState.None, "info"),
                new DataItem(`🗄️ Database: ${dbPath}`, "", vscode.TreeItemCollapsibleState.None, "info"),
                new DataItem(`📊 DB exists: ${dbExists}`, "", vscode.TreeItemCollapsibleState.None, "info"),
                new DataItem("⏳ Waiting for initialization...", "Check VSCode Developer Console for errors", vscode.TreeItemCollapsibleState.None, "info"),
            ];
        }
        if (element) {
            // Return children if the element has them
            if (element.children) {
                return element.children;
            }
            return [];
        }
        else {
            // Load root items with real data
            return this.loadRootItemsSync();
        }
    }
    loadRootItemsSync() {
        if (!this.coreServices || !this.workspaceFolder) {
            return [
                new DataItem("No services or workspace", "", vscode.TreeItemCollapsibleState.None, "info"),
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
                new DataItem(ui_text_1.UI_TEXT.DATA_TREE.ERROR_LOADING, error.message, vscode.TreeItemCollapsibleState.None, "error"),
            ];
            this._onDidChangeTreeData.fire();
        });
        // Show loading message only on first load
        return [
            new DataItem(ui_text_1.UI_TEXT.DATA_TREE.LOADING, ui_text_1.UI_TEXT.DATA_TREE.LOADING_DESCRIPTION, vscode.TreeItemCollapsibleState.None, "info"),
        ];
    }
    /**
     * Build a folder tree structure from file paths
     */
    buildFolderTree(resultsByFile, projectPath) {
        const root = {
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
                    currentNode.children.get(part).results = results;
                }
                currentNode = currentNode.children.get(part);
            });
        });
        // Convert tree to DataItems
        const convertNodeToItems = (node, level = 0) => {
            const items = [];
            // Sort: folders first, then files
            const entries = Array.from(node.children.entries()).sort((a, b) => {
                const [, nodeA] = a;
                const [, nodeB] = b;
                if (nodeA.isFile && !nodeB.isFile)
                    return 1;
                if (!nodeA.isFile && nodeB.isFile)
                    return -1;
                return nodeA.name.localeCompare(nodeB.name);
            });
            entries.forEach(([, childNode]) => {
                if (childNode.isFile && childNode.results) {
                    // File node with results
                    const totalFindings = childNode.results.length;
                    const absolutePath = path.isAbsolute(childNode.path)
                        ? childNode.path
                        : path.join(projectPath, childNode.path);
                    const fileItem = new DataItem(childNode.name, `${totalFindings} ${totalFindings === 1 ? "finding" : "findings"}`, vscode.TreeItemCollapsibleState.Collapsed, "file", "semgrep", undefined, absolutePath);
                    // Add individual findings as children
                    fileItem.children = childNode.results.map((result, index) => {
                        // Create a unique resource URI for this finding to enable decorations
                        const findingUri = vscode.Uri.parse(`carbonara-finding://${absolutePath}?line=${result.start_line}&severity=${result.severity}&index=${index}`);
                        const findingItem = new DataItem(`Line ${result.start_line}: ${result.rule_id}`, result.message, vscode.TreeItemCollapsibleState.None, "finding", "semgrep", undefined, absolutePath, result);
                        // Set resource URI to enable decorations
                        findingItem.resourceUri = findingUri;
                        return findingItem;
                    });
                    items.push(fileItem);
                }
                else if (!childNode.isFile && childNode.children.size > 0) {
                    // Folder node
                    const folderItem = new DataItem(childNode.name, "", vscode.TreeItemCollapsibleState.Collapsed, "folder", "semgrep", undefined, childNode.path // Pass the full path for stable ID generation
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
    async loadRootItemsAsync() {
        try {
            const projectPath = this.workspaceFolder.uri.fsPath;
            // Use the same database path that was determined in initializeCoreServices()
            // This respects the config file if it specifies a custom path
            const dbPath = this.coreServices?.dataService.getDbPath() ||
                path.join(projectPath, ".carbonara", "carbonara.db");
            if (!require("fs").existsSync(dbPath)) {
                return [
                    new DataItem("❌ Database not found", `No database at ${dbPath}`, vscode.TreeItemCollapsibleState.None, "error"),
                ];
            }
            const items = [];
            // Load Semgrep results using the shared Semgrep DataService
            try {
                const semgrepDataService = (0, semgrep_integration_1.getSemgrepDataService)();
                if (!semgrepDataService) {
                    console.log("Semgrep DataService not initialized yet");
                    // Continue without Semgrep results
                }
                else {
                    const semgrepResults = await semgrepDataService.getAllSemgrepResults();
                    if (semgrepResults.length > 0) {
                        // Group by file
                        const resultsByFile = new Map();
                        semgrepResults.forEach((result) => {
                            if (!resultsByFile.has(result.file_path)) {
                                resultsByFile.set(result.file_path, []);
                            }
                            resultsByFile.get(result.file_path).push(result);
                        });
                        // Add Code Scan group
                        const codeScanGroup = new DataItem(`Code Scan (${semgrepResults.length})`, `Found in ${resultsByFile.size} files`, vscode.TreeItemCollapsibleState.Expanded, "group", "semgrep");
                        // Build folder tree structure
                        codeScanGroup.children = this.buildFolderTree(resultsByFile, projectPath);
                        items.push(codeScanGroup);
                    }
                }
            }
            catch (error) {
                console.error("Error loading Semgrep results:", error);
            }
            // Load assessment data (web analysis, tool results, etc.)
            if (this.coreServices?.vscodeProvider) {
                try {
                    this.outputChannel.appendLine(`[loadRootItemsAsync] Loading assessment data for project: ${projectPath}`);
                    console.log("[DataTreeProvider] Loading assessment data for project:", projectPath);
                    const assessmentData = await this.coreServices.vscodeProvider.loadDataForProject(projectPath);
                    this.outputChannel.appendLine(`[loadRootItemsAsync] Loaded ${assessmentData.length} assessment data entries`);
                    console.log(`[DataTreeProvider] Loaded ${assessmentData.length} assessment data entries`);
                    if (assessmentData.length > 0) {
                        // Log details about what was loaded
                        const toolCounts = {};
                        assessmentData.forEach((entry) => {
                            const toolName = entry.tool_name || 'unknown';
                            toolCounts[toolName] = (toolCounts[toolName] || 0) + 1;
                        });
                        console.log("[DataTreeProvider] Data by tool:", JSON.stringify(toolCounts, null, 2));
                        console.log("[DataTreeProvider] Sample entry:", JSON.stringify(assessmentData[0], null, 2));
                        // Create grouped items for assessment data
                        this.outputChannel.appendLine(`[loadRootItemsAsync] Creating grouped items...`);
                        const groups = await this.coreServices.vscodeProvider.createGroupedItems(projectPath);
                        this.outputChannel.appendLine(`[loadRootItemsAsync] Created ${groups.length} groups`);
                        console.log(`[DataTreeProvider] Created ${groups.length} groups`);
                        groups.forEach((group) => {
                            this.outputChannel.appendLine(`[loadRootItemsAsync] Group: ${group.toolName} (${group.displayName}) with ${group.entries.length} entries`);
                            console.log(`[DataTreeProvider] Group: ${group.toolName} (${group.displayName}) with ${group.entries.length} entries`);
                        });
                        groups.forEach((group) => {
                            // Add group header
                            const groupItem = new DataItem(group.displayName, group.toolName, vscode.TreeItemCollapsibleState.Expanded, "group", group.toolName);
                            // Add entries as children
                            groupItem.children = group.entries.map((entry) => {
                                return new DataItem(entry.label, entry.description, vscode.TreeItemCollapsibleState.Collapsed, "entry", entry.toolName, entry.id);
                            });
                            items.push(groupItem);
                        });
                    }
                    else {
                        console.log("[DataTreeProvider] No assessment data found in database");
                    }
                }
                catch (error) {
                    console.error("[DataTreeProvider] Error loading assessment data:", error);
                    if (error instanceof Error) {
                        console.error("[DataTreeProvider] Error stack:", error.stack);
                    }
                }
            }
            else {
                console.log("[DataTreeProvider] Core services not available (vscodeProvider is null)");
            }
            if (items.length === 0) {
                this.outputChannel.appendLine(`[loadRootItemsAsync] No items found, returning "No data available"`);
                return [
                    new DataItem(ui_text_1.UI_TEXT.DATA_TREE.NO_DATA, ui_text_1.UI_TEXT.DATA_TREE.NO_DATA_DESCRIPTION, vscode.TreeItemCollapsibleState.None, "info"),
                ];
            }
            this.outputChannel.appendLine(`[loadRootItemsAsync] Returning ${items.length} items`);
            return items;
        }
        catch (error) {
            console.error("❌ Error loading root items:", error);
            return [
                new DataItem("❌ Error loading data", error instanceof Error ? error.message : "Unknown error", vscode.TreeItemCollapsibleState.None, "error"),
            ];
        }
    }
    async createGroupedItems() {
        if (!this.coreServices || !this.workspaceFolder) {
            return [
                new DataItem(ui_text_1.UI_TEXT.DATA_TREE.NO_DATA, ui_text_1.UI_TEXT.DATA_TREE.NO_DATA_DESCRIPTION, vscode.TreeItemCollapsibleState.None, "info"),
            ];
        }
        try {
            const startTime = Date.now();
            const projectPath = this.workspaceFolder.uri.fsPath;
            const dbPath = path.join(projectPath, ".carbonara", "carbonara.db");
            const dbExists = require("fs").existsSync(dbPath);
            if (!dbExists) {
                return [
                    new DataItem("❌ Database not found", `No database at ${dbPath}`, vscode.TreeItemCollapsibleState.None, "error"),
                ];
            }
            // Step 1: Test data service directly
            const step1Start = Date.now();
            const assessmentData = await this.coreServices.vscodeProvider.loadDataForProject(projectPath);
            const step1Time = Date.now() - step1Start;
            if (assessmentData.length === 0) {
                return [
                    new DataItem(ui_text_1.UI_TEXT.DATA_TREE.NO_DATA, ui_text_1.UI_TEXT.DATA_TREE.NO_DATA_DESCRIPTION, vscode.TreeItemCollapsibleState.None, "info"),
                ];
            }
            // Step 2: Create grouped items
            const step2Start = Date.now();
            const groups = await this.coreServices.vscodeProvider.createGroupedItems(projectPath);
            const step2Time = Date.now() - step2Start;
            groups.forEach((group, index) => { });
            if (groups.length === 0) {
                return [
                    new DataItem(ui_text_1.UI_TEXT.DATA_TREE.NO_DATA, ui_text_1.UI_TEXT.DATA_TREE.NO_DATA_DESCRIPTION, vscode.TreeItemCollapsibleState.None, "info"),
                ];
            }
            // Step 3: Convert groups to DataItems
            const step3Start = Date.now();
            const items = [];
            groups.forEach((group, groupIndex) => {
                // Add group header
                const groupItem = new DataItem(group.displayName, group.toolName, vscode.TreeItemCollapsibleState.Expanded, "group", group.toolName);
                items.push(groupItem);
                // Add entries
                group.entries.forEach((entry, entryIndex) => {
                    const entryItem = new DataItem(entry.label, entry.description, vscode.TreeItemCollapsibleState.Collapsed, "entry", entry.toolName, entry.id);
                    items.push(entryItem);
                });
            });
            const step3Time = Date.now() - step3Start;
            const totalTime = Date.now() - startTime;
            return items;
        }
        catch (error) {
            console.error("Error creating grouped items:", error);
            return [
                new DataItem("Error loading data", "", vscode.TreeItemCollapsibleState.None, "error"),
            ];
        }
    }
    async exportData(format) {
        if (!this.coreServices || !this.workspaceFolder) {
            vscode.window.showErrorMessage("No workspace or services available");
            return;
        }
        try {
            const projectPath = this.workspaceFolder.uri.fsPath;
            const exportData = await this.coreServices.vscodeProvider.exportData(projectPath, format);
            const timestamp = new Date().toISOString().split("T")[0];
            const filename = `carbonara-export-${timestamp}.${format}`;
            const carbonaraDir = path.join(this.workspaceFolder.uri.fsPath, ".carbonara");
            // Ensure .carbonara directory exists
            if (!require("fs").existsSync(carbonaraDir)) {
                require("fs").mkdirSync(carbonaraDir, { recursive: true });
            }
            const filePath = path.join(carbonaraDir, filename);
            require("fs").writeFileSync(filePath, exportData);
            vscode.window.showInformationMessage(`Data exported to .carbonara/${filename}`);
        }
        catch (error) {
            console.error("Export failed:", error);
            vscode.window.showErrorMessage("Failed to export data");
        }
    }
    async clearData() {
        const answer = await vscode.window.showWarningMessage("This will delete all stored data for this project. This action cannot be undone.", "Delete All Data", "Cancel");
        if (answer === "Delete All Data") {
            // Implementation would go here
            vscode.window.showInformationMessage("Data clearing is not yet implemented");
        }
    }
    async getProjectStats() {
        if (!this.coreServices || !this.workspaceFolder) {
            return { totalEntries: 0, toolCounts: {} };
        }
        try {
            const projectPath = this.workspaceFolder.uri.fsPath;
            return await this.coreServices.vscodeProvider.getProjectStats(projectPath);
        }
        catch (error) {
            console.error("Error getting project stats:", error);
            return { totalEntries: 0, toolCounts: {} };
        }
    }
    async deleteSemgrepResultsForFiles(items) {
        const semgrepDataService = (0, semgrep_integration_1.getSemgrepDataService)();
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
        const fileList = filePaths.length === 1 ? filePaths[0] : `${filePaths.length} files`;
        const answer = await vscode.window.showWarningMessage(`Delete Semgrep results for ${fileList}? This action cannot be undone.`, "Delete", "Cancel");
        if (answer === "Delete") {
            try {
                for (const filePath of filePaths) {
                    await semgrepDataService.deleteSemgrepResultsByFile(filePath);
                }
                vscode.window.showInformationMessage(`Deleted Semgrep results for ${fileList}`);
                // Refresh the tree
                this.refresh();
            }
            catch (error) {
                vscode.window.showErrorMessage(`Failed to delete Semgrep results: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
}
exports.DataTreeProvider = DataTreeProvider;
class DataItem extends vscode.TreeItem {
    constructor(label, description, collapsibleState, type, toolName, entryId, filePath, resultData) {
        super(label, collapsibleState);
        this.label = label;
        this.description = description;
        this.collapsibleState = collapsibleState;
        this.type = type;
        this.toolName = toolName;
        this.entryId = entryId;
        this.filePath = filePath;
        this.resultData = resultData;
        this.tooltip = description;
        this.description = description;
        // Set stable ID to preserve tree state across refreshes
        // This allows VSCode to remember which items are expanded/collapsed
        if (type === "group" && toolName) {
            this.id = `carbonara-group-${toolName}`;
        }
        else if (type === "folder" && filePath) {
            // Use full path for folders to ensure uniqueness
            this.id = `carbonara-folder-${filePath}`;
        }
        else if (type === "file" && filePath) {
            this.id = `carbonara-file-${filePath}`;
        }
        else if (type === "finding" && filePath && resultData) {
            this.id = `carbonara-finding-${filePath}-${resultData.start_line}-${resultData.rule_id}`;
        }
        else if (entryId) {
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
        // Set icons
        switch (type) {
            case "group":
                // No icon for group
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
            }
            else if (this.type === "finding" && this.resultData) {
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
exports.DataItem = DataItem;
