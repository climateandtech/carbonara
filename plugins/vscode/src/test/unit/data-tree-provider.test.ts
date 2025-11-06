import * as assert from "assert";
import * as vscode from "vscode";
import { DataTreeProvider, DataItem } from "../../data-tree-provider";
import { UI_TEXT } from "../../constants/ui-text";
import { type AssessmentDataEntry } from "@carbonara/core";

suite("DataTreeProvider Unit Tests", () => {
  let provider: DataTreeProvider;
  let originalWorkspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;

  setup(() => {
    // Mock workspace folders to avoid database initialization
    originalWorkspaceFolders = vscode.workspace.workspaceFolders;
    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: undefined,
      configurable: true,
    });

    provider = new DataTreeProvider();
  });

  teardown(() => {
    // Restore original workspace folders
    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: originalWorkspaceFolders,
      configurable: true,
    });
  });

  suite("DataItem Creation", () => {
    test("should create group items with correct properties", () => {
      const groupItem = new DataItem(
        "📊 Byte Counter Analysis",
        "greenframe",
        vscode.TreeItemCollapsibleState.Expanded,
        "group",
        "greenframe"
      );

      assert.strictEqual(groupItem.label, "📊 Byte Counter Analysis");
      assert.strictEqual(groupItem.description, "greenframe");
      assert.strictEqual(groupItem.type, "group");
      assert.strictEqual(groupItem.toolName, "greenframe");
      assert.strictEqual(
        groupItem.collapsibleState,
        vscode.TreeItemCollapsibleState.Expanded
      );
      assert.strictEqual(groupItem.contextValue, "carbonara-data-group");
    });

    test("should create entry items with correct properties", () => {
      const entryItem = new DataItem(
        "https://example.com - 2024-01-15",
        "Byte counter analysis",
        vscode.TreeItemCollapsibleState.Collapsed,
        "entry",
        "greenframe",
        123
      );

      assert.strictEqual(entryItem.label, "https://example.com - 2024-01-15");
      assert.strictEqual(entryItem.description, "Byte counter analysis");
      assert.strictEqual(entryItem.type, "entry");
      assert.strictEqual(entryItem.toolName, "greenframe");
      assert.strictEqual(entryItem.entryId, 123);
      assert.strictEqual(
        entryItem.collapsibleState,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      assert.strictEqual(entryItem.contextValue, "carbonara-data-entry");
    });

    test("should create detail items with correct properties", () => {
      const detailItem = new DataItem(
        "🌐 URL: https://example.com",
        "url",
        vscode.TreeItemCollapsibleState.None,
        "detail"
      );

      assert.strictEqual(detailItem.label, "🌐 URL: https://example.com");
      assert.strictEqual(detailItem.description, "url");
      assert.strictEqual(detailItem.type, "detail");
      assert.strictEqual(
        detailItem.collapsibleState,
        vscode.TreeItemCollapsibleState.None
      );
      assert.strictEqual(detailItem.contextValue, "carbonara-data-detail");
    });

    test("should create info items with correct properties", () => {
      const infoItem = new DataItem(
        UI_TEXT.DATA_TREE.NO_DATA,
        UI_TEXT.DATA_TREE.NO_DATA_DESCRIPTION,
        vscode.TreeItemCollapsibleState.None,
        "info"
      );

      assert.strictEqual(infoItem.label, UI_TEXT.DATA_TREE.NO_DATA);
      assert.strictEqual(infoItem.type, "info");
      assert.strictEqual(infoItem.contextValue, "carbonara-data-item");
    });

    test("should create error items with correct properties", () => {
      const errorItem = new DataItem(
        UI_TEXT.DATA_TREE.ERROR_LOADING,
        "Connection failed",
        vscode.TreeItemCollapsibleState.None,
        "error"
      );

      assert.strictEqual(errorItem.label, UI_TEXT.DATA_TREE.ERROR_LOADING);
      assert.strictEqual(errorItem.description, "Connection failed");
      assert.strictEqual(errorItem.type, "error");
      assert.strictEqual(errorItem.contextValue, "carbonara-data-item");
    });
  });

  suite("TreeItem Conversion", () => {
    test("should convert DataItem to TreeItem with correct icons", () => {
      const items = [
        {
          item: new DataItem(
            "Entry",
            "",
            vscode.TreeItemCollapsibleState.Collapsed,
            "entry"
          ),
          expectedIcon: "file",
        },
        {
          item: new DataItem(
            "Detail",
            "",
            vscode.TreeItemCollapsibleState.None,
            "detail"
          ),
          expectedIcon: "symbol-property",
        },
        {
          item: new DataItem(
            "Info",
            "",
            vscode.TreeItemCollapsibleState.None,
            "info"
          ),
          expectedIcon: "info",
        },
        {
          item: new DataItem(
            "Error",
            "",
            vscode.TreeItemCollapsibleState.None,
            "error"
          ),
          expectedIcon: "error",
        },
      ];

      items.forEach(({ item, expectedIcon }) => {
        const treeItem = provider.getTreeItem(item);
        assert.ok(treeItem.iconPath instanceof vscode.ThemeIcon);
        assert.strictEqual(
          (treeItem.iconPath as vscode.ThemeIcon).id,
          expectedIcon
        );
      });
    });

    test("should set tooltip and description correctly", () => {
      const item = new DataItem(
        "Test Label",
        "Test Description",
        vscode.TreeItemCollapsibleState.None,
        "info"
      );
      const treeItem = provider.getTreeItem(item);

      assert.strictEqual(treeItem.tooltip, "Test Description");
      assert.strictEqual(treeItem.description, "Test Description");
      assert.strictEqual(treeItem.label, "Test Label");
    });

    test("should preserve collapsible state", () => {
      const states = [
        vscode.TreeItemCollapsibleState.None,
        vscode.TreeItemCollapsibleState.Collapsed,
        vscode.TreeItemCollapsibleState.Expanded,
      ];

      states.forEach((state) => {
        const item = new DataItem("Test", "Desc", state, "info");
        const treeItem = provider.getTreeItem(item);
        assert.strictEqual(treeItem.collapsibleState, state);
      });
    });
  });

  suite("Interface Compliance", () => {
    test("should implement TreeDataProvider interface", () => {
      // Verify all required methods exist
      assert.ok(typeof provider.getTreeItem === "function");
      assert.ok(typeof provider.getChildren === "function");
      assert.ok(typeof provider.onDidChangeTreeData === "function");

      // Verify event emitter
      assert.ok(typeof provider.onDidChangeTreeData === "function");
      assert.ok(typeof provider.refresh === "function");
    });

    test("should handle getChildren with and without element", async () => {
      // Should not throw when called without element (root level)
      const rootChildren = await provider.getChildren();
      assert.ok(Array.isArray(rootChildren));

      // Should not throw when called with element (child level)
      if (rootChildren.length > 0) {
        const childChildren = await provider.getChildren(rootChildren[0]);
        assert.ok(Array.isArray(childChildren));
      }
    });

    test("should return DataItem instances from getChildren", async () => {
      const children = await provider.getChildren();
      children.forEach((child) => {
        assert.ok(child instanceof DataItem);
        assert.ok(typeof child.label === "string");
        assert.ok(typeof child.type === "string");
      });
    });

    test("should return TreeItem from getTreeItem", () => {
      const item = new DataItem(
        "Test",
        "Description",
        vscode.TreeItemCollapsibleState.None,
        "info"
      );
      const treeItem = provider.getTreeItem(item);

      assert.ok(treeItem instanceof vscode.TreeItem);
      assert.strictEqual(treeItem.label, "Test");
    });
  });

  suite("Event Handling", () => {
    test("should fire tree data change event on refresh", (done) => {
      const disposable = provider.onDidChangeTreeData(() => {
        disposable.dispose();
        done();
      });

      provider.refresh();
    });

    test("should support multiple event listeners", () => {
      let listener1Called = false;
      let listener2Called = false;

      const disposable1 = provider.onDidChangeTreeData(() => {
        listener1Called = true;
      });

      const disposable2 = provider.onDidChangeTreeData(() => {
        listener2Called = true;
      });

      provider.refresh();

      assert.strictEqual(listener1Called, true);
      assert.strictEqual(listener2Called, true);

      disposable1.dispose();
      disposable2.dispose();
    });
  });

  suite("Async Operations", () => {
    test("should handle async getChildren gracefully", async () => {
      const startTime = Date.now();
      const children = await provider.getChildren();
      const endTime = Date.now();

      // Should complete reasonably quickly
      assert.ok(
        endTime - startTime < 5000,
        "getChildren should complete within 5 seconds"
      );
      assert.ok(Array.isArray(children));
    });

    test("should handle concurrent getChildren calls", async () => {
      const promises = [
        provider.getChildren(),
        provider.getChildren(),
        provider.getChildren(),
      ];

      const results = await Promise.all(promises);

      // All should return arrays
      results.forEach((result) => {
        assert.ok(Array.isArray(result));
      });
    });

    test("should handle async project stats", async () => {
      const stats = await provider.getProjectStats();

      assert.ok(typeof stats === "object");
      assert.ok(typeof stats.totalEntries === "number");
      assert.ok(typeof stats.toolCounts === "object");
      assert.ok(stats.totalEntries >= 0);
    });
  });

  suite("Edge Cases", () => {
    test("should handle undefined workspace folder", async () => {
      // Mock workspace folders to be undefined
      const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: undefined,
        configurable: true,
      });

      try {
        const noWorkspaceProvider = new DataTreeProvider();
        const children = await noWorkspaceProvider.getChildren();

        assert.ok(Array.isArray(children));
        assert.ok(children.length > 0);
        // Should show some kind of message about no workspace
      } finally {
        // Restore original workspace folders
        Object.defineProperty(vscode.workspace, "workspaceFolders", {
          value: originalWorkspaceFolders,
          configurable: true,
        });
      }
    });

    test("should handle empty workspace folders array", async () => {
      const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [],
        configurable: true,
      });

      try {
        const emptyWorkspaceProvider = new DataTreeProvider();
        const children = await emptyWorkspaceProvider.getChildren();

        assert.ok(Array.isArray(children));
      } finally {
        Object.defineProperty(vscode.workspace, "workspaceFolders", {
          value: originalWorkspaceFolders,
          configurable: true,
        });
      }
    });

    test("should handle malformed data gracefully", async () => {
      // Test with invalid entry
      const invalidEntry = new DataItem(
        "Invalid",
        "Desc",
        vscode.TreeItemCollapsibleState.Collapsed,
        "entry",
        "invalid-tool",
        -1 // Invalid ID
      );

      const children = await provider.getChildren(invalidEntry);
      assert.ok(Array.isArray(children));
      // Should handle gracefully, not throw
    });
  });
});
