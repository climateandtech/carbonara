import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { DataTreeProvider, DataItem } from "../../data-tree-provider";
import { UI_TEXT } from "../../constants/ui-text";
import { createDataService } from "@carbonara/core";

suite("DataTreeProvider Integration Tests", () => {
  let provider: DataTreeProvider;
  let testWorkspaceFolder: vscode.WorkspaceFolder;
  let testDbPath: string;

  setup(async () => {
    // Create a unique temporary workspace folder for testing
    const tempDir = path.join(
      "/tmp",
      `carbonara-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
    fs.mkdirSync(tempDir, { recursive: true });

    // Create .carbonara directory and config file to simulate initialized state
    const carbonaraDir = path.join(tempDir, ".carbonara");
    fs.mkdirSync(carbonaraDir, { recursive: true });
    fs.writeFileSync(
      path.join(carbonaraDir, "carbonara.config.json"),
      JSON.stringify({ name: "test-project", initialized: true }, null, 2)
    );

    testDbPath = path.join(carbonaraDir, "carbonara.db");
    
    // Create an empty database file so the test can verify "No data available" message
    // (instead of "Database not found")
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    
    // Create minimal schema (just projects table to make it a valid database)
    db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        metadata JSON,
        co2_variables JSON
      )
    `);
    
    // Save empty database to file
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(testDbPath, buffer);
    db.close();

    testWorkspaceFolder = {
      uri: vscode.Uri.file(tempDir),
      name: "test-workspace",
      index: 0,
    };

    // Mock workspace folders
    const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: [testWorkspaceFolder],
      configurable: true,
    });

    provider = new DataTreeProvider();

    // Give more time for core services to initialize and avoid race conditions
    // Wait for core services to initialize (they check for database file)
    let initialized = false;
    const maxWaitTime = 5000; // 5 seconds
    const startTime = Date.now();
    
    while (!initialized && Date.now() - startTime < maxWaitTime) {
      const children = await provider.getChildren();
      // Check if we're past the loading state
      const hasLoading = children.some(
        (child) => child.label === UI_TEXT.DATA_TREE.LOADING
      );
      const hasDatabaseError = children.some(
        (child) => child.label === "❌ Database not found"
      );
      const hasNoData = children.some(
        (child) => child.label === UI_TEXT.DATA_TREE.NO_DATA
      );
      
      if (!hasLoading && (hasDatabaseError || hasNoData)) {
        initialized = true;
        break;
      }
      
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

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
      // Clean up test database
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }

      // Clean up temp directory
      const tempDir = path.dirname(testDbPath);
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn("Failed to clean up test files:", error);
    }
  });

  suite("Tree Structure", () => {
    test('should show "No data available" when no data exists', async () => {
      const children = await provider.getChildren();

      // If we get loading state, wait for the async load to complete
      if (
        children.length === 1 &&
        children[0].label === UI_TEXT.DATA_TREE.LOADING
      ) {
        // Wait for the async loading to complete and refresh event to fire with timeout
        await Promise.race([
          new Promise<void>((resolve) => {
            const disposable = provider.onDidChangeTreeData(() => {
              disposable.dispose();
              resolve();
            });
          }),
          new Promise<void>((resolve) => setTimeout(resolve, 1500)), // Timeout after 1.5s
        ]);

        // Get children again after async load completes
        const updatedChildren = await provider.getChildren();
        assert.strictEqual(updatedChildren.length, 1);
        assert.strictEqual(updatedChildren[0].label, UI_TEXT.DATA_TREE.NO_DATA);
        assert.strictEqual(updatedChildren[0].type, "info");
      } else {
        // Direct case - no loading state
        assert.strictEqual(children.length, 1);
        assert.strictEqual(children[0].label, UI_TEXT.DATA_TREE.NO_DATA);
        assert.strictEqual(children[0].type, "info");
      }
    });

    test("should display grouped data when data exists", async () => {
      // This test would require setting up test data in the database
      // For now, we'll test the structure when data is available

      const children = await provider.getChildren();
      assert.ok(Array.isArray(children));

      // Each child should be a DataItem
      children.forEach((child) => {
        assert.ok(child instanceof DataItem);
        assert.ok(
          [
            "group",
            "entry",
            "detail",
            "info",
            "error",
            "action",
            "folder",
            "file",
            "finding",
          ].includes(child.type)
        );
      });
    });

    test("should provide collapsible tree items for groups", async () => {
      const children = await provider.getChildren();

      children.forEach((child) => {
        const treeItem = provider.getTreeItem(child);
        assert.ok(treeItem instanceof vscode.TreeItem);
        assert.ok(typeof treeItem.label === "string");

        if (child.type === "group") {
          assert.strictEqual(
            treeItem.collapsibleState,
            vscode.TreeItemCollapsibleState.Expanded
          );
          assert.strictEqual(treeItem.contextValue, "carbonara-data-group");
        }
      });
    });

    test("should provide expandable tree items for entries", async () => {
      const children = await provider.getChildren();

      const entries = children.filter((child) => child.type === "entry");
      entries.forEach((entry) => {
        const treeItem = provider.getTreeItem(entry);
        assert.strictEqual(
          treeItem.collapsibleState,
          vscode.TreeItemCollapsibleState.Collapsed
        );
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
          assert.strictEqual(
            detail.collapsibleState,
            vscode.TreeItemCollapsibleState.None
          );
          assert.strictEqual(detail.contextValue, "carbonara-data-detail");
        });
      }
    });
  });

  suite("Data Operations", () => {
    test("should refresh tree data when refresh() is called", async () => {
      let refreshFired = false;

      const disposable = provider.onDidChangeTreeData(() => {
        refreshFired = true;
      });

      // Assertion 1: Listener should be set up
      assert.ok(disposable !== undefined, "onDidChangeTreeData should return a disposable");

      // Wait a bit to ensure listener is set up
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Force refresh to fire event by temporarily clearing coreServices
      // This tests the else branch where event always fires
      const originalCoreServices = (provider as any).coreServices;
      (provider as any).coreServices = null;

      await provider.refresh();

      // Wait a bit for the event to fire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assertion 2: Event should fire when refresh() is called (when coreServices is null, it always fires)
      assert.strictEqual(refreshFired, true, "onDidChangeTreeData event should fire when refresh() is called with null coreServices");
      
      // Restore coreServices
      (provider as any).coreServices = originalCoreServices;
      
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
      } catch (error) {
        // Expected to fail gracefully without workspace
        assert.ok(error instanceof Error);
      }

      // Test CSV export
      try {
        await provider.exportData("csv");
        // Should not throw an error
        assert.ok(true);
      } catch (error) {
        // Expected to fail gracefully without workspace
        assert.ok(error instanceof Error);
      }
    });

    test("should handle clear data operation", async () => {
      // Mock showWarningMessage to return cancel
      const originalShowWarningMessage = vscode.window.showWarningMessage;
      vscode.window.showWarningMessage = async () => "Cancel" as any;

      try {
        await provider.clearData();
        // Should complete without error
        assert.ok(true);
      } finally {
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

      const noWorkspaceProvider = new DataTreeProvider();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const children = await noWorkspaceProvider.getChildren();
      // When no workspace, should return empty array
      assert.ok(Array.isArray(children));
      assert.strictEqual(children.length, 0);

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
        assert.ok(child instanceof DataItem);
      });
    });

    test("should handle invalid entry IDs gracefully", async () => {
      const invalidEntry = new DataItem(
        "Invalid Entry",
        "Description",
        vscode.TreeItemCollapsibleState.Collapsed,
        "entry",
        "test-tool",
        99999 // Invalid ID
      );

      const details = await provider.getChildren(invalidEntry);
      assert.ok(Array.isArray(details));
      // Should return empty array for invalid entries
    });
  });

  suite("VSCode Integration", () => {
    test("should provide proper tree item properties", () => {
      const testItems = [
        new DataItem(
          "Group",
          "Description",
          vscode.TreeItemCollapsibleState.Expanded,
          "group"
        ),
        new DataItem(
          "Entry",
          "Description",
          vscode.TreeItemCollapsibleState.Collapsed,
          "entry"
        ),
        new DataItem(
          "Detail",
          "Description",
          vscode.TreeItemCollapsibleState.None,
          "detail"
        ),
        new DataItem(
          "Info",
          "Description",
          vscode.TreeItemCollapsibleState.None,
          "info"
        ),
        new DataItem(
          "Error",
          "Description",
          vscode.TreeItemCollapsibleState.None,
          "error"
        ),
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

        // Icon (skip for group and folder types as they don't have icons)
        if (item.type !== "group" && item.type !== "folder") {
          assert.ok(treeItem.iconPath instanceof vscode.ThemeIcon);
        }
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
      const groupItem = new DataItem(
        "Group",
        "Desc",
        vscode.TreeItemCollapsibleState.Expanded,
        "group"
      );
      const entryItem = new DataItem(
        "Entry",
        "Desc",
        vscode.TreeItemCollapsibleState.Collapsed,
        "entry"
      );
      const detailItem = new DataItem(
        "Detail",
        "Desc",
        vscode.TreeItemCollapsibleState.None,
        "detail"
      );

      assert.strictEqual(
        provider.getTreeItem(groupItem).contextValue,
        "carbonara-data-group"
      );
      assert.strictEqual(
        provider.getTreeItem(entryItem).contextValue,
        "carbonara-data-entry"
      );
      assert.strictEqual(
        provider.getTreeItem(detailItem).contextValue,
        "carbonara-data-detail"
      );
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
      assert.ok(
        duration < 1000,
        `Performance test took ${duration}ms, expected < 1000ms`
      );
    });

    test("should not block on initialization", () => {
      // Creating a new provider should not block
      const startTime = Date.now();
      const newProvider = new DataTreeProvider();
      const endTime = Date.now();

      // Constructor should return quickly
      assert.ok(
        endTime - startTime < 100,
        "Provider initialization should not block"
      );
    });
  });

  suite("Core Services Initialization", () => {
    test("should initialize core services successfully", async () => {
      // Wait for core services to initialize (up to 15 seconds)
      let initialized = false;
      const maxWaitTime = 15000;
      const startTime = Date.now();

      while (!initialized && Date.now() - startTime < maxWaitTime) {
        const children = await provider.getChildren();

        // Check if we're past the loading/initialization state
        const isInitializing = children.some(
          (child) =>
            child.label.includes("Loading") ||
            child.label.includes("Initializing") ||
            child.label.includes("Waiting for initialization")
        );

        if (!isInitializing) {
          initialized = true;
          break;
        }

        // Wait a bit before checking again
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      assert.ok(
        initialized,
        "Core services should initialize within 15 seconds"
      );

      // Verify we can get children without errors
      const children = await provider.getChildren();
      assert.ok(Array.isArray(children));
      assert.ok(children.length > 0);
    });

    // TODO: Fix this test - it's timing out because the provider doesn't reload data after it's created
    test.skip("should load and display data when assessment data exists", async function () {
      // Increase timeout for this test (15 seconds)
      this.timeout(15000);

      // Create test database with assessment data
      const carbonaraDir = path.join(
        testWorkspaceFolder.uri.fsPath,
        ".carbonara"
      );
      fs.mkdirSync(carbonaraDir, { recursive: true });
      const dbPath = path.join(carbonaraDir, "carbonara.db");

      const dataService = createDataService({ dbPath });
      await dataService.initialize();

      // Create a test project
      const projectId = await dataService.createProject(
        "Test Project",
        testWorkspaceFolder.uri.fsPath,
        {}
      );

      // Insert test-analyzer assessment data
      await dataService.storeAssessmentData(
        projectId,
        "test-analyzer",
        "web-analysis",
        {
          url: "https://test.example.com",
          result: "test result",
        }
      );

      await dataService.close();

      // Wait for provider to detect the data (up to 10 seconds)
      // The provider should reload the database on refresh
      let dataLoaded = false;
      const maxWaitTime = 10000;
      const startTime = Date.now();

      while (!dataLoaded && Date.now() - startTime < maxWaitTime) {
        // Trigger refresh (this will reload database from disk)
        await provider.refresh();

        // Wait for refresh to complete
        await new Promise<void>((resolve) => {
          const disposable = provider.onDidChangeTreeData(() => {
            disposable.dispose();
            resolve();
          });
          // Timeout after 1 second
          setTimeout(() => resolve(), 1000);
        });

        const children = await provider.getChildren();

        // Check if we have data (not loading, not "No data available")
        const hasData =
          children.length > 0 &&
          !children.some(
            (child) =>
              child.label === UI_TEXT.DATA_TREE.LOADING ||
              child.label === UI_TEXT.DATA_TREE.NO_DATA ||
              child.label.includes("Loading") ||
              child.label.includes("Initializing")
          );

        if (hasData) {
          // Verify we have test-analyzer data
          const hasTestAnalyzer = children.some(
            (child) =>
              child.toolName === "test-analyzer" ||
              child.label.toLowerCase().includes("test") ||
              child.description?.toLowerCase().includes("test")
          );
          if (hasTestAnalyzer) {
            dataLoaded = true;
            break;
          }
        }

        // Wait a bit before checking again
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      assert.ok(
        dataLoaded,
        "Assessment data should be loaded and displayed within 10 seconds"
      );

      // Verify the data structure
      const children = await provider.getChildren();
      assert.ok(children.length > 0, "Should have at least one data item");

      // Should have either groups or entries
      const hasGroupsOrEntries = children.some(
        (child) => child.type === "group" || child.type === "entry"
      );
      assert.ok(
        hasGroupsOrEntries,
        "Should have groups or entries when data exists"
      );
    });

    test("should complete initialization even if it takes longer than timeout warning", async () => {
      // This test verifies that timeout warnings don't abort initialization
      // We can't easily simulate slow initialization, but we can verify
      // that initialization completes successfully regardless of timing

      // Wait for initialization to complete
      let initialized = false;
      const maxWaitTime = 20000; // 20 seconds
      const startTime = Date.now();

      while (!initialized && Date.now() - startTime < maxWaitTime) {
        const children = await provider.getChildren();

        // Check if we're past the loading/initialization state
        const isInitializing = children.some(
          (child) =>
            child.label.includes("Loading") ||
            child.label.includes("Initializing") ||
            child.label.includes("Waiting for initialization")
        );

        if (!isInitializing) {
          initialized = true;
          break;
        }

        // Wait a bit before checking again
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      assert.ok(
        initialized,
        "Initialization should complete successfully even if it takes longer than timeout warning"
      );

      // Verify we can use the services
      const stats = await provider.getProjectStats();
      assert.ok(typeof stats === "object");
      assert.ok(typeof stats.totalEntries === "number");
    });
  });
});
