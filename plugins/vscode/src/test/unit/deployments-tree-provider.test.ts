import * as assert from "assert";
import * as vscode from "vscode";
import { DeploymentsTreeProvider } from "../../deployments-tree-provider";

suite("DeploymentsTreeProvider Unit Tests", () => {
  let provider: DeploymentsTreeProvider;
  let originalWorkspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;

  setup(() => {
    // Mock workspace folders to avoid database initialization
    originalWorkspaceFolders = vscode.workspace.workspaceFolders;
    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: undefined,
      configurable: true,
    });

    provider = new DeploymentsTreeProvider();
  });

  teardown(() => {
    // Restore original workspace folders
    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: originalWorkspaceFolders,
      configurable: true,
    });
  });

  suite("TreeItem Conversion", () => {
    test("should return the same TreeItem when calling getTreeItem", () => {
      // Create a mock tree item
      const treeItem = new vscode.TreeItem("Test", vscode.TreeItemCollapsibleState.None);

      const result = provider.getTreeItem(treeItem as any);

      assert.strictEqual(result, treeItem);
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

    test("should handle getChildren without element (root level)", async () => {
      // Should not throw when called without element (root level)
      const rootChildren = await provider.getChildren();
      assert.ok(Array.isArray(rootChildren));
    });

    test("should return array from getChildren", async () => {
      const children = await provider.getChildren();
      assert.ok(Array.isArray(children));
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
  });

  suite("Edge Cases", () => {
    test("should handle undefined workspace folder", async () => {
      const children = await provider.getChildren();

      assert.ok(Array.isArray(children));
      assert.ok(children.length > 0);
      // Should show message about no Carbonara project
      assert.strictEqual(children[0].label, "No Carbonara project found");
    });

    test("should handle empty workspace folders array", async () => {
      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [],
        configurable: true,
      });

      const children = await provider.getChildren();

      assert.ok(Array.isArray(children));
      assert.ok(children.length > 0);
    });
  });

  suite("Refresh Behavior", () => {
    test("refresh should fire tree data change event", () => {
      let eventFired = false;
      const disposable = provider.onDidChangeTreeData(() => {
        eventFired = true;
      });

      provider.refresh();

      assert.strictEqual(eventFired, true);
      disposable.dispose();
    });

    test("refresh should not throw", () => {
      let threwError = false;
      try {
        provider.refresh();
      } catch (error) {
        threwError = true;
      }

      assert.strictEqual(threwError, false);
    });
  });

  suite("Carbon Badge Logic", () => {
    test("getCarbonBadge should return correct badge colors for intensity levels", () => {
      // Access private method through any casting
      const getCarbonBadge = (provider as any).getCarbonBadge.bind(provider);

      // Test low carbon (< 100)
      assert.strictEqual(getCarbonBadge(1), "green");
      assert.strictEqual(getCarbonBadge(50), "green");
      assert.strictEqual(getCarbonBadge(99), "green");

      // Test medium carbon (100-299)
      assert.strictEqual(getCarbonBadge(100), "yellow");
      assert.strictEqual(getCarbonBadge(200), "yellow");
      assert.strictEqual(getCarbonBadge(299), "yellow");

      // Test high carbon (300-499)
      assert.strictEqual(getCarbonBadge(300), "orange");
      assert.strictEqual(getCarbonBadge(400), "orange");
      assert.strictEqual(getCarbonBadge(499), "orange");

      // Test very high carbon (>= 500)
      assert.strictEqual(getCarbonBadge(500), "red");
      assert.strictEqual(getCarbonBadge(600), "red");
      assert.strictEqual(getCarbonBadge(1000), "red");
    });

    test("getCarbonBadge should handle null, undefined, and zero", () => {
      const getCarbonBadge = (provider as any).getCarbonBadge.bind(provider);

      assert.strictEqual(getCarbonBadge(null), "none");
      assert.strictEqual(getCarbonBadge(undefined), "none");
      assert.strictEqual(getCarbonBadge(0), "none");
    });
  });

  suite("Tree Structure", () => {
    test("should return info message when no workspace", async () => {
      const children = await provider.getChildren();

      assert.ok(children.length > 0);
      assert.strictEqual(children[0].label, "No Carbonara project found");
      assert.strictEqual(children[0].collapsibleState, vscode.TreeItemCollapsibleState.None);
    });

    test("getTreeItem should preserve TreeItem properties", () => {
      const mockItem = new vscode.TreeItem("Test Item");
      mockItem.description = "Test Description";
      mockItem.contextValue = "test-context";

      const result = provider.getTreeItem(mockItem as any);

      assert.strictEqual(result.label, "Test Item");
      assert.strictEqual(result.description, "Test Description");
      assert.strictEqual(result.contextValue, "test-context");
    });
  });

  suite("Method Existence", () => {
    test("should have scanForDeployments method", () => {
      assert.ok(typeof provider.scanForDeployments === "function");
    });

    test("should have openDeploymentConfig method", () => {
      assert.ok(typeof provider.openDeploymentConfig === "function");
    });

    test("should have showDeploymentDetails method", () => {
      assert.ok(typeof provider.showDeploymentDetails === "function");
    });

    test("should have refresh method", () => {
      assert.ok(typeof provider.refresh === "function");
    });
  });

  suite("Public API", () => {
    test("should expose onDidChangeTreeData event", () => {
      assert.ok(provider.onDidChangeTreeData);
      assert.ok(typeof provider.onDidChangeTreeData === "function");
    });

    test("should allow subscribing to onDidChangeTreeData", () => {
      let called = false;
      const disposable = provider.onDidChangeTreeData(() => {
        called = true;
      });

      provider.refresh();

      assert.strictEqual(called, true);
      disposable.dispose();
    });
  });

  suite("Error Handling", () => {
    test("getChildren should not throw on error", async () => {
      let threwError = false;
      try {
        await provider.getChildren();
      } catch (error) {
        threwError = true;
      }

      assert.strictEqual(threwError, false);
    });

    test("getTreeItem should not throw on valid input", () => {
      const mockItem = new vscode.TreeItem("Test");
      let threwError = false;

      try {
        provider.getTreeItem(mockItem as any);
      } catch (error) {
        threwError = true;
      }

      assert.strictEqual(threwError, false);
    });
  });

  suite("Deployment Hierarchy", () => {
    test("should handle provider level grouping", async () => {
      // When services are not initialized, should return info message
      const children = await provider.getChildren();
      assert.ok(Array.isArray(children));

      // All children should be TreeItems
      children.forEach(child => {
        assert.ok(child instanceof vscode.TreeItem);
      });
    });

    test("should handle nested children requests", async () => {
      const rootChildren = await provider.getChildren();

      // Try to get children of first item
      if (rootChildren.length > 0) {
        const nestedChildren = await provider.getChildren(rootChildren[0] as any);
        assert.ok(Array.isArray(nestedChildren));
      }
    });
  });

  suite("Initialization", () => {
    test("should initialize without errors", () => {
      let threwError = false;
      try {
        new DeploymentsTreeProvider();
      } catch (error) {
        threwError = true;
      }

      assert.strictEqual(threwError, false);
    });

    test("should not require workspace on construction", () => {
      // Workspace is undefined from setup
      const newProvider = new DeploymentsTreeProvider();
      assert.ok(newProvider);
    });
  });

  suite("Type Safety", () => {
    test("should return consistent types", async () => {
      const children = await provider.getChildren();

      // Should be an array
      assert.ok(Array.isArray(children));

      // Each child should have required TreeItem properties
      children.forEach(child => {
        assert.ok("label" in child);
        assert.ok("collapsibleState" in child);
      });
    });
  });
});
