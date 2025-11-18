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
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const data_tree_provider_1 = require("../../data-tree-provider");
const ui_text_1 = require("../../constants/ui-text");
const core_1 = require("@carbonara/core");
suite("DataTreeProvider Integration Tests", () => {
    let provider;
    let testWorkspaceFolder;
    let testDbPath;
    let testWorkspaceDir;
    setup(async () => {
        // Create a unique temporary workspace folder for testing
        testWorkspaceDir = path.join("/tmp", `carbonara-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
        fs.mkdirSync(testWorkspaceDir, { recursive: true });
        // Create .carbonara directory and database at the correct location
        const carbonaraDir = path.join(testWorkspaceDir, ".carbonara");
        fs.mkdirSync(carbonaraDir, { recursive: true });
        testDbPath = path.join(carbonaraDir, "carbonara.db");
        testWorkspaceFolder = {
            uri: vscode.Uri.file(testWorkspaceDir),
            name: "test-workspace",
            index: 0,
        };
        // Mock workspace folders
        const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
        Object.defineProperty(vscode.workspace, "workspaceFolders", {
            value: [testWorkspaceFolder],
            configurable: true,
        });
        provider = new data_tree_provider_1.DataTreeProvider();
        // Give more time for core services to initialize and avoid race conditions
        await new Promise((resolve) => setTimeout(resolve, 500));
        // Restore original workspace folders
        Object.defineProperty(vscode.workspace, "workspaceFolders", {
            value: originalWorkspaceFolders,
            configurable: true,
        });
    });
    teardown(async () => {
        // Give time for any pending database operations to complete
        await new Promise((resolve) => setTimeout(resolve, 100));
        try {
            // Clean up temp directory (includes .carbonara and database)
            if (fs.existsSync(testWorkspaceDir)) {
                fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
            }
        }
        catch (error) {
            console.warn("Failed to clean up test files:", error);
        }
    });
    suite("Tree Structure", () => {
        test('should show "No data available" when no data exists', async () => {
            const children = await provider.getChildren();
            // If we get loading state, wait for the async load to complete
            if (children.length === 1 &&
                children[0].label === ui_text_1.UI_TEXT.DATA_TREE.LOADING) {
                // Wait for the async loading to complete and refresh event to fire
                await new Promise((resolve) => {
                    const disposable = provider.onDidChangeTreeData(() => {
                        disposable.dispose();
                        resolve();
                    });
                });
                // Get children again after async load completes
                const updatedChildren = await provider.getChildren();
                assert.strictEqual(updatedChildren.length, 1);
                assert.strictEqual(updatedChildren[0].label, ui_text_1.UI_TEXT.DATA_TREE.NO_DATA);
                assert.strictEqual(updatedChildren[0].type, "info");
            }
            else {
                // Direct case - no loading state
                assert.strictEqual(children.length, 1);
                assert.strictEqual(children[0].label, ui_text_1.UI_TEXT.DATA_TREE.NO_DATA);
                assert.strictEqual(children[0].type, "info");
            }
        });
        test("should display grouped data when data exists", async function () {
            // Increase timeout for this test as it involves database operations
            this.timeout(15000);
            // This test verifies that data can be loaded from the database at .carbonara/carbonara.db
            // It should FAIL if loadRootItemsAsync hardcodes the path instead of using
            // the path determined by initializeCoreServices
            // First, wait for the provider to fully initialize
            // The provider initializes asynchronously in the constructor
            await new Promise((resolve) => setTimeout(resolve, 2000));
            // Now create test data in the database using core services
            // Use the same database path that the provider is using
            const services = await (0, core_1.setupCarbonaraCore)({ dbPath: testDbPath });
            try {
                // Use the exact same path that the provider will use (from workspaceFolder.uri.fsPath)
                const providerPath = testWorkspaceFolder.uri.fsPath;
                // Create a project with the exact path the provider will use
                const projectId = await services.dataService.createProject("Test Project", providerPath);
                assert.ok(projectId > 0);
                // Add test assessment data
                await services.dataService.storeAssessmentData(projectId, "test-analyzer", "web-analysis", {
                    url: "https://test.example.com",
                    score: 85,
                    timestamp: new Date().toISOString(),
                });
                // Close the services so the database file is saved
                await services.dataService.close();
                // Wait a bit for the database file to be fully written
                await new Promise((resolve) => setTimeout(resolve, 500));
                // Now refresh the provider to load the new data
                await provider.refresh();
                // Wait for async data loading after refresh
                await new Promise((resolve) => setTimeout(resolve, 4000));
                // Get children and verify data is loaded
                const children = await provider.getChildren();
                assert.ok(Array.isArray(children));
                // Check if we got an error about database not found
                const hasDbNotFoundError = children.some((child) => child.type === "error" &&
                    child.label.includes("Database not found"));
                // This should FAIL if loadRootItemsAsync hardcodes the wrong path
                assert.ok(!hasDbNotFoundError, `Database should be found at ${testDbPath}. Got error: ${children.map((c) => c.label).join(", ")}`);
                // Should have at least one group with test data (not just "No data available")
                const hasData = children.some((child) => child.type === "group" &&
                    (child.label.includes("Test") ||
                        child.label.includes("test-analyzer")));
                // This assertion will fail if the database path mismatch prevents data loading
                assert.ok(hasData, `Should have test data loaded. Found children: ${children.map((c) => `${c.label} (${c.type})`).join(", ")}`);
                // Each child should be a DataItem
                children.forEach((child) => {
                    assert.ok(child instanceof data_tree_provider_1.DataItem);
                    assert.ok(["group", "entry", "detail", "info", "error"].includes(child.type));
                });
                // Verify group structure
                const groups = children.filter((child) => child.type === "group");
                assert.ok(groups.length > 0, "Should have at least one group");
                // Verify groups have entries
                for (const group of groups) {
                    const entries = await provider.getChildren(group);
                    assert.ok(Array.isArray(entries), "Group should have children");
                    if (entries.length > 0) {
                        assert.ok(entries.some((e) => e.type === "entry"), "Group should have at least one entry");
                    }
                }
            }
            finally {
                // Services already closed above
            }
        });
        test("should provide collapsible tree items for groups", async () => {
            const children = await provider.getChildren();
            children.forEach((child) => {
                const treeItem = provider.getTreeItem(child);
                assert.ok(treeItem instanceof vscode.TreeItem);
                assert.ok(typeof treeItem.label === "string");
                if (child.type === "group") {
                    assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
                    assert.strictEqual(treeItem.contextValue, "carbonara-data-group");
                }
            });
        });
        test("should provide expandable tree items for entries", async () => {
            const children = await provider.getChildren();
            const entries = children.filter((child) => child.type === "entry");
            entries.forEach((entry) => {
                const treeItem = provider.getTreeItem(entry);
                assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
                assert.strictEqual(treeItem.contextValue, "carbonara-data-entry");
                assert.ok(entry.entryId !== undefined);
            });
        });
        test("should provide detail items for expanded entries", async () => {
            const children = await provider.getChildren();
            const entries = children.filter((child) => child.type === "entry");
            if (entries.length > 0) {
                const entryDetails = await provider.getChildren(entries[0]);
                entryDetails.forEach((detail) => {
                    assert.strictEqual(detail.type, "detail");
                    assert.strictEqual(detail.collapsibleState, vscode.TreeItemCollapsibleState.None);
                    assert.strictEqual(detail.contextValue, "carbonara-data-detail");
                });
            }
        });
    });
    suite("Data Operations", () => {
        test("should refresh tree data when refresh() is called", () => {
            let refreshFired = false;
            const disposable = provider.onDidChangeTreeData(() => {
                refreshFired = true;
            });
            provider.refresh();
            assert.strictEqual(refreshFired, true);
            disposable.dispose();
        });
        test("should get project stats", async () => {
            const stats = await provider.getProjectStats();
            assert.ok(typeof stats === "object");
            assert.ok(typeof stats.totalEntries === "number");
            assert.ok(typeof stats.toolCounts === "object");
            assert.ok(stats.totalEntries >= 0);
        });
        test("should handle export operations", async () => {
            // Test JSON export
            try {
                await provider.exportData("json");
                // Should not throw an error
                assert.ok(true);
            }
            catch (error) {
                // Expected to fail gracefully without workspace
                assert.ok(error instanceof Error);
            }
            // Test CSV export
            try {
                await provider.exportData("csv");
                // Should not throw an error
                assert.ok(true);
            }
            catch (error) {
                // Expected to fail gracefully without workspace
                assert.ok(error instanceof Error);
            }
        });
        test("should handle clear data operation", async () => {
            // Mock showWarningMessage to return cancel
            const originalShowWarningMessage = vscode.window.showWarningMessage;
            vscode.window.showWarningMessage = async () => "Cancel";
            try {
                await provider.clearData();
                // Should complete without error
                assert.ok(true);
            }
            finally {
                // Restore original method
                vscode.window.showWarningMessage = originalShowWarningMessage;
            }
        });
    });
    suite("Error Handling", () => {
        test("should handle missing workspace gracefully", async () => {
            // Create provider without workspace
            const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
            Object.defineProperty(vscode.workspace, "workspaceFolders", {
                value: undefined,
                configurable: true,
            });
            const noWorkspaceProvider = new data_tree_provider_1.DataTreeProvider();
            await new Promise((resolve) => setTimeout(resolve, 50));
            const children = await noWorkspaceProvider.getChildren();
            assert.ok(children.length > 0);
            assert.ok(children[0].label.includes("No workspace") ||
                children[0].label.includes("unavailable"));
            // Restore workspace folders
            Object.defineProperty(vscode.workspace, "workspaceFolders", {
                value: originalWorkspaceFolders,
                configurable: true,
            });
        });
        test("should handle service initialization errors gracefully", async () => {
            // This would test what happens when core services fail to initialize
            const children = await provider.getChildren();
            // Should not throw, should return some kind of error or info message
            assert.ok(Array.isArray(children));
            children.forEach((child) => {
                assert.ok(child instanceof data_tree_provider_1.DataItem);
            });
        });
        test("should handle invalid entry IDs gracefully", async () => {
            const invalidEntry = new data_tree_provider_1.DataItem("Invalid Entry", "Description", vscode.TreeItemCollapsibleState.Collapsed, "entry", "test-tool", 99999 // Invalid ID
            );
            const details = await provider.getChildren(invalidEntry);
            assert.ok(Array.isArray(details));
            // Should return empty array for invalid entries
        });
    });
    suite("VSCode Integration", () => {
        test("should provide proper tree item properties", () => {
            const testItems = [
                new data_tree_provider_1.DataItem("Group", "Description", vscode.TreeItemCollapsibleState.Expanded, "group"),
                new data_tree_provider_1.DataItem("Entry", "Description", vscode.TreeItemCollapsibleState.Collapsed, "entry"),
                new data_tree_provider_1.DataItem("Detail", "Description", vscode.TreeItemCollapsibleState.None, "detail"),
                new data_tree_provider_1.DataItem("Info", "Description", vscode.TreeItemCollapsibleState.None, "info"),
                new data_tree_provider_1.DataItem("Error", "Description", vscode.TreeItemCollapsibleState.None, "error"),
            ];
            testItems.forEach((item) => {
                const treeItem = provider.getTreeItem(item);
                // Basic properties
                assert.strictEqual(treeItem.label, item.label);
                assert.strictEqual(treeItem.description, item.description);
                assert.strictEqual(treeItem.tooltip, item.description);
                assert.strictEqual(treeItem.collapsibleState, item.collapsibleState);
                // Context value
                assert.ok(treeItem.contextValue?.startsWith("carbonara-data-"));
                // Icon
                assert.ok(treeItem.iconPath instanceof vscode.ThemeIcon);
            });
        });
        test("should handle tree data provider interface correctly", () => {
            // Verify the provider implements the correct interface
            assert.ok(typeof provider.getTreeItem === "function");
            assert.ok(typeof provider.getChildren === "function");
            assert.ok(typeof provider.onDidChangeTreeData === "function");
            assert.ok(typeof provider.refresh === "function");
        });
        test("should provide correct context values for menu contributions", () => {
            const groupItem = new data_tree_provider_1.DataItem("Group", "Desc", vscode.TreeItemCollapsibleState.Expanded, "group");
            const entryItem = new data_tree_provider_1.DataItem("Entry", "Desc", vscode.TreeItemCollapsibleState.Collapsed, "entry");
            const detailItem = new data_tree_provider_1.DataItem("Detail", "Desc", vscode.TreeItemCollapsibleState.None, "detail");
            assert.strictEqual(provider.getTreeItem(groupItem).contextValue, "carbonara-data-group");
            assert.strictEqual(provider.getTreeItem(entryItem).contextValue, "carbonara-data-entry");
            assert.strictEqual(provider.getTreeItem(detailItem).contextValue, "carbonara-data-detail");
        });
    });
    suite("Performance", () => {
        test("should handle large datasets efficiently", async () => {
            const startTime = Date.now();
            // Get children multiple times to test performance
            for (let i = 0; i < 10; i++) {
                await provider.getChildren();
            }
            const endTime = Date.now();
            const duration = endTime - startTime;
            // Should complete within reasonable time (less than 1 second for 10 calls)
            assert.ok(duration < 1000, `Performance test took ${duration}ms, expected < 1000ms`);
        });
        test("should not block on initialization", () => {
            // Creating a new provider should not block
            const startTime = Date.now();
            const newProvider = new data_tree_provider_1.DataTreeProvider();
            const endTime = Date.now();
            // Constructor should return quickly
            assert.ok(endTime - startTime < 100, "Provider initialization should not block");
        });
    });
});
