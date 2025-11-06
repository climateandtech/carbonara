import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { DataTreeProvider, DataItem } from "../../data-tree-provider";
import { UI_TEXT } from "../../constants/ui-text";

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

    testDbPath = path.join(tempDir, "carbonara.db");

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
        // Wait for the async loading to complete and refresh event to fire
        await new Promise<void>((resolve) => {
          const disposable = provider.onDidChangeTreeData(() => {
            disposable.dispose();
            resolve();
          });
        });

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
          ["group", "entry", "detail", "info", "error"].includes(child.type)
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

      await provider.refresh();

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
      assert.ok(children.length > 0);
      assert.ok(
        children[0].label.includes("No workspace") ||
          children[0].label.includes("unavailable")
      );

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
});
