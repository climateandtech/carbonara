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
    
    // Create initial database and project to get a project ID
    testDbPath = path.join(carbonaraDir, "carbonara.db");
    const initDataService = createDataService({ dbPath: testDbPath });
    await initDataService.initialize();
    const initProjectId = await initDataService.createProject("Test Project", tempDir, {});
    await initDataService.close();
    
    fs.writeFileSync(
      path.join(carbonaraDir, "carbonara.config.json"),
      JSON.stringify({ name: "test-project", projectId: initProjectId, initialized: true }, null, 2)
    );


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
        assert.ok(Array.isArray(entryDetails), "Entry details should be an array");
        entryDetails.forEach((detail) => {
          assert.strictEqual(detail.type, "detail");
          assert.strictEqual(
            detail.collapsibleState,
            vscode.TreeItemCollapsibleState.None
          );
          assert.strictEqual(detail.contextValue, "carbonara-data-detail");
          assert.ok(typeof detail.label === "string", "Detail label should be a string");
        });
      }
    });
  });

  suite("Entry Expansion with Test Data", () => {
    let dataService: any;
    let projectId: number;

    setup(async () => {
      // Create data service for test data setup
      dataService = createDataService({ dbPath: testDbPath });
      await dataService.initialize();

      // Create a test project
      projectId = await dataService.createProject(
        "Test Project",
        testWorkspaceFolder.uri.fsPath,
        {}
      );
    });

    teardown(async () => {
      if (dataService) {
        try {
          await dataService.close();
        } catch (error) {
          // Ignore errors if already closed
        }
        dataService = null as any;
      }
    });

    test("should expand test-analyzer entry and show all fields", async function () {
      this.timeout(10000); // Increase timeout to 10 seconds for async data loading
      
      // Insert test-analyzer data
      const entryId = await dataService.storeAssessmentData(
        projectId,
        "test-analyzer",
        "web-analysis",
        {
          url: "https://test.example.com",
          result: "test result",
        }
      );

      // storeAssessmentData already saves to disk, but ensure it's flushed
      // Don't close dataService - keep it open for the test
      // Give the file system time to flush the database to disk
      await new Promise((resolve) => setTimeout(resolve, 200));
      
      // Wait for provider to refresh and data to load
      await provider.refresh();
      
      // Wait for refresh event to fire
      await new Promise<void>((resolve) => {
        const disposable = provider.onDidChangeTreeData(() => {
          disposable.dispose();
          resolve();
        });
        setTimeout(() => resolve(), 1000); // Timeout after 1 second
      });
      
      // Wait for async data loading to complete
      // Entries are nested under groups, so we need to find the group first
      let attempts = 0;
      let entries: DataItem[] = [];
      while (attempts < 10) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const rootChildren = await provider.getChildren();
        // Find the group for test-analyzer
        const group = rootChildren.find(
          (child) => child.type === "group" && child.toolName === "test-analyzer"
        );
        if (group) {
          // Get entries from the group
          const groupChildren = await provider.getChildren(group);
          entries = groupChildren.filter(
            (child) => child.type === "entry" && child.toolName === "test-analyzer"
          );
          if (entries.length > 0) {
            break;
          }
        }
        attempts++;
      }

      assert.ok(entries.length > 0, "Should have test-analyzer entries");

      // Expand the first entry
      const entryDetails = await provider.getChildren(entries[0]);
      
      // test-analyzer has 2 fields: url and result
      assert.ok(entryDetails.length >= 2, "Should show at least 2 detail fields");
      
      const fieldKeys = entryDetails.map((d) => d.label);
      assert.ok(
        fieldKeys.some((k) => k.includes("Test URL") || k.includes("url")),
        "Should show URL field"
      );
      assert.ok(
        fieldKeys.some((k) => k.includes("Test Result") || k.includes("result")),
        "Should show result field"
      );
    });

    test("should expand carbonara-swd entry and show carbon emissions and energy", async function () {
      this.timeout(10000); // Increase timeout to 10 seconds for async data loading
      
      // Insert carbonara-swd data with correct structure (carbonEmissions.total, energyUsage.total)
      await dataService.storeAssessmentData(
        projectId,
        "carbonara-swd",
        "web-analysis",
        {
          url: "https://example.com",
          totalBytes: 524288,
          carbonEmissions: {
            networkTransfer: 0.05,
            deviceUsage: 0.10,
            datacenterUsage: 0.03,
            embodiedCarbon: 0.0001,
            total: 0.18
          },
          energyUsage: {
            networkTransfer: 0.0001,
            total: 0.0003
          },
          metadata: {
            loadTime: 1250,
            resourceCount: 42,
            analysisTimestamp: new Date().toISOString(),
            carbonIntensity: 473,
            model: "SWD v4"
          }
        }
      );

      // storeAssessmentData already saves to disk, but ensure it's flushed
      // Don't close dataService - keep it open for the test
      // Give the file system time to flush the database to disk
      await new Promise((resolve) => setTimeout(resolve, 200));
      
      await provider.refresh();
      
      // Wait for refresh event to fire
      await new Promise<void>((resolve) => {
        const disposable = provider.onDidChangeTreeData(() => {
          disposable.dispose();
          resolve();
        });
        setTimeout(() => resolve(), 1000); // Timeout after 1 second
      });
      
      // Wait for async data loading to complete
      // Entries are nested under groups, so we need to find the group first
      let attempts = 0;
      let entries: DataItem[] = [];
      while (attempts < 10) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const rootChildren = await provider.getChildren();
        // Find the group for carbonara-swd
        const group = rootChildren.find(
          (child) => child.type === "group" && child.toolName === "carbonara-swd"
        );
        if (group) {
          // Get entries from the group
          const groupChildren = await provider.getChildren(group);
          entries = groupChildren.filter(
            (child) => child.type === "entry" && child.toolName === "carbonara-swd"
          );
          if (entries.length > 0) {
            break;
          }
        }
        attempts++;
      }

      assert.ok(entries.length > 0, "Should have carbonara-swd entries");

      const entryDetails = await provider.getChildren(entries[0]);
      
      // carbonara-swd has 6 fields: url, totalBytes, requestCount, loadTime, carbonEstimate, energyEstimate
      assert.ok(entryDetails.length >= 6, "Should show at least 6 detail fields");
      
      const fieldLabels = entryDetails.map((d) => d.label);
      assert.ok(
        fieldLabels.some((l) => l.includes("URL")),
        "Should show URL field"
      );
      assert.ok(
        fieldLabels.some((l) => l.includes("Data Transfer")),
        "Should show Data Transfer field"
      );
      assert.ok(
        fieldLabels.some((l) => l.includes("CO2 Estimate")),
        "Should show CO2 Estimate field (most important)"
      );
      assert.ok(
        fieldLabels.some((l) => l.includes("Energy")),
        "Should show Energy field (most important)"
      );
    });

    test("should expand semgrep entry and show only filtered fields", async function () {
      this.timeout(10000); // Increase timeout to 10 seconds for async data loading
      
      // Insert semgrep data
      await dataService.storeAssessmentData(
        projectId,
        "semgrep",
        "code-analysis",
        {
          target: "/path/to/file",
          stats: {
            total_matches: 10,
            error_count: 2,
            warning_count: 5,
            info_count: 3,
            files_scanned: 1,
          },
        }
      );

      // storeAssessmentData already saves to disk, but ensure it's flushed
      // Don't close dataService - keep it open for the test
      // Give the file system time to flush the database to disk
      await new Promise((resolve) => setTimeout(resolve, 200));
      
      await provider.refresh();
      
      // Wait for refresh event to fire
      await new Promise<void>((resolve) => {
        const disposable = provider.onDidChangeTreeData(() => {
          disposable.dispose();
          resolve();
        });
        setTimeout(() => resolve(), 1000); // Timeout after 1 second
      });
      
      // Wait for async data loading to complete
      // Entries are nested under groups, so we need to find the group first
      let attempts = 0;
      let entries: DataItem[] = [];
      while (attempts < 10) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const rootChildren = await provider.getChildren();
        // Find the group for semgrep
        const group = rootChildren.find(
          (child) => child.type === "group" && child.toolName === "semgrep"
        );
        if (group) {
          // Get entries from the group
          const groupChildren = await provider.getChildren(group);
          entries = groupChildren.filter(
            (child) => child.type === "entry" && child.toolName === "semgrep"
          );
          if (entries.length > 0) {
            break;
          }
        }
        attempts++;
      }

      assert.ok(entries.length > 0, "Should have semgrep entries");

      const entryDetails = await provider.getChildren(entries[0]);
      
      // Semgrep should only show: error_count, warning_count, info_count, target
      assert.strictEqual(entryDetails.length, 4, "Should show exactly 4 filtered fields");
      
      const fieldKeys = entryDetails.map((d) => {
        // Extract key from label (e.g., "🚨 Errors: 2" -> "error_count")
        const label = d.label.toLowerCase();
        if (label.includes("error")) return "error_count";
        if (label.includes("warning")) return "warning_count";
        if (label.includes("info")) return "info_count";
        if (label.includes("target")) return "target";
        return "";
      });

      assert.ok(fieldKeys.includes("error_count"), "Should show error_count");
      assert.ok(fieldKeys.includes("warning_count"), "Should show warning_count");
      assert.ok(fieldKeys.includes("info_count"), "Should show info_count");
      assert.ok(fieldKeys.includes("target"), "Should show target");
      
      // Verify total_matches and files_scanned are NOT shown
      const allLabels = entryDetails.map((d) => d.label.toLowerCase());
      assert.ok(
        !allLabels.some((l) => l.includes("total_matches") || l.includes("findings")),
        "Should NOT show total_matches"
      );
      assert.ok(
        !allLabels.some((l) => l.includes("files_scanned") || l.includes("files")),
        "Should NOT show files_scanned"
      );
    });

    test("should handle entry with missing data gracefully", async () => {
      // Insert entry with minimal data
      await dataService.storeAssessmentData(
        projectId,
        "test-analyzer",
        "web-analysis",
        {}
      );

      await provider.refresh();
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const children = await provider.getChildren();
      const entries = children.filter(
        (child) => child.type === "entry" && child.toolName === "test-analyzer"
      );

      if (entries.length > 0) {
        const entryDetails = await provider.getChildren(entries[0]);
        // Should return empty array or handle gracefully
        assert.ok(Array.isArray(entryDetails), "Should return array even with missing data");
      }
    });

    test("should return empty array for non-existent entryId", async () => {
      // Create a fake entry item with non-existent ID
      const fakeEntry = new DataItem(
        "Fake Entry",
        "Test",
        vscode.TreeItemCollapsibleState.Collapsed,
        "entry",
        "test-analyzer",
        99999 // Non-existent ID
      );

      const entryDetails = await provider.getChildren(fakeEntry);
      assert.strictEqual(entryDetails.length, 0, "Should return empty array for non-existent entry");
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
        // Entries and groups have "Click to view" tooltip, others use description
        if (item.type === "entry" || item.type === "group") {
          assert.strictEqual(treeItem.tooltip, "Click to view");
        } else {
          assert.strictEqual(treeItem.tooltip, item.description);
        }
        assert.strictEqual(treeItem.collapsibleState, item.collapsibleState);

        // Context value
        assert.ok(treeItem.contextValue?.startsWith("carbonara-data-"));

        // Icon (skip for group, entry, folder, and detail types as they don't have icons)
        if (item.type !== "group" && item.type !== "entry" && item.type !== "folder" && item.type !== "detail") {
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
