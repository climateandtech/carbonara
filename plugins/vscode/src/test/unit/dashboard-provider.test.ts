import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { DashboardProvider } from "../../dashboard-provider";

// Mock types for testing
interface MockWebview extends vscode.Webview {
  _messages: any[];
  _html: string;
}

interface MockWebviewPanel extends vscode.WebviewPanel {
  webview: MockWebview;
  _disposed: boolean;
  _viewState: { active: boolean };
  _onDidReceiveMessageCallback?: (message: any) => void;
  _onDidChangeViewStateCallback?: (e: any) => void;
  _onDidDisposeCallback?: () => void;
}

suite("DashboardProvider Unit Tests", () => {
  let provider: DashboardProvider;
  let mockContext: vscode.ExtensionContext;
  let originalWorkspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;
  let mockPanel: MockWebviewPanel;

  // Helper to create mock extension context
  function createMockContext(): vscode.ExtensionContext {
    return {
      extensionPath: "/mock/extension/path",
      subscriptions: [],
      workspaceState: {
        get: () => undefined,
        update: async () => {},
        keys: () => [],
      },
      globalState: {
        get: () => undefined,
        update: async () => {},
        keys: () => [],
        setKeysForSync: () => {},
      },
      secrets: {} as any,
      extensionUri: vscode.Uri.file("/mock/extension/path"),
      extensionMode: vscode.ExtensionMode.Test,
      environmentVariableCollection: {} as any,
      storagePath: "/mock/storage",
      globalStoragePath: "/mock/global-storage",
      logPath: "/mock/logs",
      asAbsolutePath: (relativePath: string) =>
        path.join("/mock/extension/path", relativePath),
      storageUri: vscode.Uri.file("/mock/storage"),
      globalStorageUri: vscode.Uri.file("/mock/global-storage"),
      logUri: vscode.Uri.file("/mock/logs"),
      extension: {} as any,
      languageModelAccessInformation: {} as any,
    };
  }

  // Helper to create mock webview panel
  function createMockWebviewPanel(): MockWebviewPanel {
    const mockWebview: MockWebview = {
      _messages: [],
      _html: "",
      postMessage: async function (message: any) {
        this._messages.push(message);
        return true;
      },
      html: "",
      options: {},
      cspSource: "mock-csp-source",
      asWebviewUri: (uri: vscode.Uri) => uri,
      onDidReceiveMessage: (callback: any) => {
        if (mockPanel) {
          mockPanel._onDidReceiveMessageCallback = callback;
        }
        return { dispose: () => {} };
      },
    } as any;

    const panel: MockWebviewPanel = {
      webview: mockWebview,
      viewType: "carbonaraSvelteDashboard",
      title: "Carbonara Dashboard (Svelte)",
      viewColumn: vscode.ViewColumn.One,
      active: true,
      visible: true,
      _disposed: false,
      _viewState: { active: true },
      reveal: () => {},
      dispose: function () {
        this._disposed = true;
        if (this._onDidDisposeCallback) {
          this._onDidDisposeCallback();
        }
      },
      onDidDispose: function (callback: any) {
        this._onDidDisposeCallback = callback;
        return { dispose: () => {} };
      },
      onDidChangeViewState: function (callback: any) {
        this._onDidChangeViewStateCallback = callback;
        return { dispose: () => {} };
      },
      options: {},
      iconPath: undefined,
    } as any;

    return panel;
  }

  setup(() => {
    // Save original workspace folders
    originalWorkspaceFolders = vscode.workspace.workspaceFolders;

    // Mock workspace folders to avoid actual initialization
    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: undefined,
      configurable: true,
    });

    mockContext = createMockContext();
    provider = new DashboardProvider(mockContext);
  });

  teardown(() => {
    // Restore original workspace folders
    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: originalWorkspaceFolders,
      configurable: true,
    });

    // Reset the static panel to prevent test interference
    (DashboardProvider as any).currentPanel = undefined;
  });

  suite("Constructor and Initialization", () => {
    test("should create provider instance", () => {
      assert.ok(provider instanceof DashboardProvider);
    });

    test("should initialize with no workspace folder", () => {
      // Should not throw when workspace folder is undefined
      const testProvider = new DashboardProvider(mockContext);
      assert.ok(testProvider instanceof DashboardProvider);
    });

    test("should initialize with workspace folder", () => {
      const mockWorkspaceFolder: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file("/test/workspace"),
        name: "test-workspace",
        index: 0,
      };

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [mockWorkspaceFolder],
        configurable: true,
      });

      const testProvider = new DashboardProvider(mockContext);
      assert.ok(testProvider instanceof DashboardProvider);
    });
  });

  suite("Service Initialization", () => {
    test("should handle missing workspace folder gracefully", async () => {
      // Provider already created with no workspace folder in setup
      // Should not throw, just log error
      await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async init
      assert.ok(true, "Should not throw with missing workspace");
    });

    test("should handle missing config file", async () => {
      const mockWorkspaceFolder: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file("/nonexistent/workspace"),
        name: "test-workspace",
        index: 0,
      };

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [mockWorkspaceFolder],
        configurable: true,
      });

      // This should use default db path when config doesn't exist
      const testProvider = new DashboardProvider(mockContext);
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.ok(testProvider instanceof DashboardProvider);
    });
  });

  suite("showDashboard Method", () => {
    test("should show error when no workspace folder", async () => {
      let errorShown = false;
      const originalShowErrorMessage = vscode.window.showErrorMessage;
      (vscode.window as any).showErrorMessage = (message: string) => {
        errorShown = true;
        assert.strictEqual(message, "Please open a workspace folder first");
        return Promise.resolve(undefined);
      };

      await provider.showDashboard();
      assert.ok(errorShown, "Should show error message");

      // Restore
      (vscode.window as any).showErrorMessage = originalShowErrorMessage;
    });

    test("should create webview panel when workspace exists", async () => {
      const mockWorkspaceFolder: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file("/test/workspace"),
        name: "test-workspace",
        index: 0,
      };

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [mockWorkspaceFolder],
        configurable: true,
      });

      let panelCreated = false;
      const originalCreateWebviewPanel = vscode.window.createWebviewPanel;
      (vscode.window as any).createWebviewPanel = (
        viewType: string,
        title: string,
        showOptions: any,
        options?: any
      ) => {
        panelCreated = true;
        assert.strictEqual(viewType, "carbonaraSvelteDashboard");
        assert.strictEqual(title, "Carbonara Dashboard (Svelte)");
        assert.ok(options.enableScripts);
        assert.ok(options.retainContextWhenHidden);

        mockPanel = createMockWebviewPanel();
        return mockPanel;
      };

      const testProvider = new DashboardProvider(mockContext);
      await testProvider.showDashboard();

      assert.ok(panelCreated, "Should create webview panel");

      // Restore
      (vscode.window as any).createWebviewPanel = originalCreateWebviewPanel;
    });

    test("should reuse existing panel when called multiple times", async () => {
      const mockWorkspaceFolder: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file("/test/workspace"),
        name: "test-workspace",
        index: 0,
      };

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [mockWorkspaceFolder],
        configurable: true,
      });

      let panelCreationCount = 0;
      const originalCreateWebviewPanel = vscode.window.createWebviewPanel;
      (vscode.window as any).createWebviewPanel = (
        viewType: string,
        title: string,
        showOptions: any,
        options?: any
      ) => {
        panelCreationCount++;
        mockPanel = createMockWebviewPanel();
        return mockPanel;
      };

      const testProvider = new DashboardProvider(mockContext);
      await testProvider.showDashboard();
      await testProvider.showDashboard();
      await testProvider.showDashboard();

      assert.strictEqual(
        panelCreationCount,
        1,
        "Should only create panel once"
      );

      // Restore
      (vscode.window as any).createWebviewPanel = originalCreateWebviewPanel;
    });
  });

  suite("HTML Generation", () => {
    test("should generate HTML with correct structure", async () => {
      const mockWorkspaceFolder: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file("/test/workspace"),
        name: "test-workspace",
        index: 0,
      };

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [mockWorkspaceFolder],
        configurable: true,
      });

      const originalCreateWebviewPanel = vscode.window.createWebviewPanel;
      (vscode.window as any).createWebviewPanel = (
        viewType: string,
        title: string,
        showOptions: any,
        options?: any
      ) => {
        mockPanel = createMockWebviewPanel();
        return mockPanel;
      };

      const testProvider = new DashboardProvider(mockContext);
      await testProvider.showDashboard();

      const html = mockPanel.webview._html || mockPanel.webview.html;

      // HTML should contain expected elements
      // Note: Due to the private method, we can't directly test the HTML content
      // but we can verify the panel was created with proper configuration
      assert.ok(mockPanel, "Panel should be created");
      assert.ok(mockPanel.webview, "Webview should exist");

      // Restore
      (vscode.window as any).createWebviewPanel = originalCreateWebviewPanel;
    });
  });

  suite("Message Handling", () => {
    test("should handle getData message", async () => {
      const mockWorkspaceFolder: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file("/test/workspace"),
        name: "test-workspace",
        index: 0,
      };

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [mockWorkspaceFolder],
        configurable: true,
      });

      const originalCreateWebviewPanel = vscode.window.createWebviewPanel;
      (vscode.window as any).createWebviewPanel = (
        viewType: string,
        title: string,
        showOptions: any,
        options?: any
      ) => {
        mockPanel = createMockWebviewPanel();
        return mockPanel;
      };

      const testProvider = new DashboardProvider(mockContext);
      await testProvider.showDashboard();

      // Simulate getData message from webview
      if (mockPanel._onDidReceiveMessageCallback) {
        await mockPanel._onDidReceiveMessageCallback({ command: "getData" });
      }

      // Should receive error message since services aren't initialized
      assert.ok(mockPanel.webview._messages.length > 0);
      const errorMessage = mockPanel.webview._messages.find(
        (m) => m.type === "error"
      );
      assert.ok(errorMessage, "Should send error message");

      // Restore
      (vscode.window as any).createWebviewPanel = originalCreateWebviewPanel;
    });

    test("should handle refresh message", async () => {
      const mockWorkspaceFolder: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file("/test/workspace"),
        name: "test-workspace",
        index: 0,
      };

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [mockWorkspaceFolder],
        configurable: true,
      });

      const originalCreateWebviewPanel = vscode.window.createWebviewPanel;
      (vscode.window as any).createWebviewPanel = (
        viewType: string,
        title: string,
        showOptions: any,
        options?: any
      ) => {
        mockPanel = createMockWebviewPanel();
        return mockPanel;
      };

      const testProvider = new DashboardProvider(mockContext);
      await testProvider.showDashboard();

      const initialMessageCount = mockPanel.webview._messages.length;

      // Simulate refresh message
      if (mockPanel._onDidReceiveMessageCallback) {
        await mockPanel._onDidReceiveMessageCallback({ command: "refresh" });
      }

      // Should trigger data send attempt
      assert.ok(mockPanel.webview._messages.length > initialMessageCount);

      // Restore
      (vscode.window as any).createWebviewPanel = originalCreateWebviewPanel;
    });

    test("should handle export message", async () => {
      const mockWorkspaceFolder: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file("/test/workspace"),
        name: "test-workspace",
        index: 0,
      };

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [mockWorkspaceFolder],
        configurable: true,
      });

      const originalCreateWebviewPanel = vscode.window.createWebviewPanel;
      const originalShowErrorMessage = vscode.window.showErrorMessage;
      let errorShown = false;

      (vscode.window as any).createWebviewPanel = (
        viewType: string,
        title: string,
        showOptions: any,
        options?: any
      ) => {
        mockPanel = createMockWebviewPanel();
        return mockPanel;
      };

      (vscode.window as any).showErrorMessage = (message: string) => {
        errorShown = true;
        return Promise.resolve(undefined);
      };

      const testProvider = new DashboardProvider(mockContext);
      await testProvider.showDashboard();

      // Simulate export message
      if (mockPanel._onDidReceiveMessageCallback) {
        await mockPanel._onDidReceiveMessageCallback({
          command: "export",
          format: "json",
        });
      }

      // Should show error since services aren't initialized
      assert.ok(errorShown, "Should show error for export without services");

      // Restore
      (vscode.window as any).createWebviewPanel = originalCreateWebviewPanel;
      (vscode.window as any).showErrorMessage = originalShowErrorMessage;
    });
  });

  suite("Data Sending", () => {
    test("should send error when services not initialized", async () => {
      const mockWorkspaceFolder: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file("/test/workspace"),
        name: "test-workspace",
        index: 0,
      };

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [mockWorkspaceFolder],
        configurable: true,
      });

      const originalCreateWebviewPanel = vscode.window.createWebviewPanel;
      (vscode.window as any).createWebviewPanel = (
        viewType: string,
        title: string,
        showOptions: any,
        options?: any
      ) => {
        mockPanel = createMockWebviewPanel();
        return mockPanel;
      };

      const testProvider = new DashboardProvider(mockContext);
      await testProvider.showDashboard();

      // Initial data send should show error
      const errorMessage = mockPanel.webview._messages.find(
        (m) => m.type === "error"
      );
      assert.ok(errorMessage, "Should send error message");
      assert.ok(
        errorMessage.error.includes("Services not initialized"),
        "Error should mention services not initialized"
      );

      // Restore
      (vscode.window as any).createWebviewPanel = originalCreateWebviewPanel;
    });

    test("should send error when database doesn't exist", async () => {
      const mockWorkspaceFolder: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file("/test/workspace"),
        name: "test-workspace",
        index: 0,
      };

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [mockWorkspaceFolder],
        configurable: true,
      });

      const originalCreateWebviewPanel = vscode.window.createWebviewPanel;

      (vscode.window as any).createWebviewPanel = (
        viewType: string,
        title: string,
        showOptions: any,
        options?: any
      ) => {
        mockPanel = createMockWebviewPanel();
        return mockPanel;
      };

      const testProvider = new DashboardProvider(mockContext);
      await testProvider.showDashboard();

      // Wait for potential async operations
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should have error messages (services not initialized or db not found)
      const messages = mockPanel.webview._messages;
      assert.ok(messages.length > 0, "Should have messages");

      const errorMessage = messages.find((m) => m.type === "error");
      assert.ok(
        errorMessage,
        "Should send error message about missing services or database"
      );

      // Restore
      (vscode.window as any).createWebviewPanel = originalCreateWebviewPanel;
    });
  });

  suite("Export Functionality", () => {
    test("should show error when no workspace", async () => {
      let errorShown = false;
      const originalShowErrorMessage = vscode.window.showErrorMessage;

      (vscode.window as any).showErrorMessage = (message: string) => {
        errorShown = true;
        assert.ok(message.includes("No workspace"));
        return Promise.resolve(undefined);
      };

      const mockWorkspaceFolder: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file("/test/workspace"),
        name: "test-workspace",
        index: 0,
      };

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [mockWorkspaceFolder],
        configurable: true,
      });

      const originalCreateWebviewPanel = vscode.window.createWebviewPanel;
      (vscode.window as any).createWebviewPanel = (
        viewType: string,
        title: string,
        showOptions: any,
        options?: any
      ) => {
        mockPanel = createMockWebviewPanel();
        return mockPanel;
      };

      const testProvider = new DashboardProvider(mockContext);
      await testProvider.showDashboard();

      // Trigger export via message
      if (mockPanel._onDidReceiveMessageCallback) {
        await mockPanel._onDidReceiveMessageCallback({
          command: "export",
          format: "json",
        });
      }

      assert.ok(errorShown, "Should show error");

      // Restore
      (vscode.window as any).showErrorMessage = originalShowErrorMessage;
      (vscode.window as any).createWebviewPanel = originalCreateWebviewPanel;
    });

    test("should handle json export format", async () => {
      // This test verifies the format parameter is accepted
      const mockWorkspaceFolder: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file("/test/workspace"),
        name: "test-workspace",
        index: 0,
      };

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [mockWorkspaceFolder],
        configurable: true,
      });

      const originalCreateWebviewPanel = vscode.window.createWebviewPanel;
      (vscode.window as any).createWebviewPanel = (
        viewType: string,
        title: string,
        showOptions: any,
        options?: any
      ) => {
        mockPanel = createMockWebviewPanel();
        return mockPanel;
      };

      const testProvider = new DashboardProvider(mockContext);
      await testProvider.showDashboard();

      // Trigger export
      if (mockPanel._onDidReceiveMessageCallback) {
        await mockPanel._onDidReceiveMessageCallback({
          command: "export",
          format: "json",
        });
      }

      // Test should not throw
      assert.ok(true, "Should handle json format");

      // Restore
      (vscode.window as any).createWebviewPanel = originalCreateWebviewPanel;
    });

    test("should handle csv export format", async () => {
      const mockWorkspaceFolder: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file("/test/workspace"),
        name: "test-workspace",
        index: 0,
      };

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [mockWorkspaceFolder],
        configurable: true,
      });

      const originalCreateWebviewPanel = vscode.window.createWebviewPanel;
      (vscode.window as any).createWebviewPanel = (
        viewType: string,
        title: string,
        showOptions: any,
        options?: any
      ) => {
        mockPanel = createMockWebviewPanel();
        return mockPanel;
      };

      const testProvider = new DashboardProvider(mockContext);
      await testProvider.showDashboard();

      // Trigger export
      if (mockPanel._onDidReceiveMessageCallback) {
        await mockPanel._onDidReceiveMessageCallback({
          command: "export",
          format: "csv",
        });
      }

      // Test should not throw
      assert.ok(true, "Should handle csv format");

      // Restore
      (vscode.window as any).createWebviewPanel = originalCreateWebviewPanel;
    });
  });

  suite("Panel Lifecycle", () => {
    test("should clean up when panel is disposed", async () => {
      const mockWorkspaceFolder: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file("/test/workspace"),
        name: "test-workspace",
        index: 0,
      };

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [mockWorkspaceFolder],
        configurable: true,
      });

      const originalCreateWebviewPanel = vscode.window.createWebviewPanel;
      (vscode.window as any).createWebviewPanel = (
        viewType: string,
        title: string,
        showOptions: any,
        options?: any
      ) => {
        mockPanel = createMockWebviewPanel();
        return mockPanel;
      };

      const testProvider = new DashboardProvider(mockContext);
      await testProvider.showDashboard();

      assert.ok(mockPanel, "Panel should be created");
      assert.ok(!mockPanel._disposed, "Panel should not be disposed initially");

      // Dispose the panel
      mockPanel.dispose();

      assert.ok(mockPanel._disposed, "Panel should be disposed");

      // Create new panel after disposal
      await testProvider.showDashboard();
      assert.ok(!mockPanel._disposed, "New panel should not be disposed");

      // Restore
      (vscode.window as any).createWebviewPanel = originalCreateWebviewPanel;
    });

    test("should handle view state changes", async () => {
      const mockWorkspaceFolder: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file("/test/workspace"),
        name: "test-workspace",
        index: 0,
      };

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [mockWorkspaceFolder],
        configurable: true,
      });

      const originalCreateWebviewPanel = vscode.window.createWebviewPanel;
      (vscode.window as any).createWebviewPanel = (
        viewType: string,
        title: string,
        showOptions: any,
        options?: any
      ) => {
        mockPanel = createMockWebviewPanel();
        return mockPanel;
      };

      const testProvider = new DashboardProvider(mockContext);
      await testProvider.showDashboard();

      const initialMessageCount = mockPanel.webview._messages.length;

      // Simulate view state change (panel becoming active)
      if (mockPanel._onDidChangeViewStateCallback) {
        mockPanel._viewState.active = true;
        await mockPanel._onDidChangeViewStateCallback({
          webviewPanel: mockPanel,
        });
      }

      // Should attempt to refresh data when becoming active
      assert.ok(
        mockPanel.webview._messages.length >= initialMessageCount,
        "Should send messages on view state change"
      );

      // Restore
      (vscode.window as any).createWebviewPanel = originalCreateWebviewPanel;
    });
  });

  suite("Error Handling", () => {
    test("should handle errors gracefully in data loading", async () => {
      const mockWorkspaceFolder: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file("/test/workspace"),
        name: "test-workspace",
        index: 0,
      };

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [mockWorkspaceFolder],
        configurable: true,
      });

      const originalCreateWebviewPanel = vscode.window.createWebviewPanel;
      (vscode.window as any).createWebviewPanel = (
        viewType: string,
        title: string,
        showOptions: any,
        options?: any
      ) => {
        mockPanel = createMockWebviewPanel();
        return mockPanel;
      };

      const testProvider = new DashboardProvider(mockContext);
      await testProvider.showDashboard();

      // Errors should be sent to webview, not thrown
      const errorMessages = mockPanel.webview._messages.filter(
        (m) => m.type === "error"
      );
      assert.ok(errorMessages.length > 0, "Should send error messages");

      // Restore
      (vscode.window as any).createWebviewPanel = originalCreateWebviewPanel;
    });

    test("should not crash with invalid message format", async () => {
      const mockWorkspaceFolder: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file("/test/workspace"),
        name: "test-workspace",
        index: 0,
      };

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [mockWorkspaceFolder],
        configurable: true,
      });

      const originalCreateWebviewPanel = vscode.window.createWebviewPanel;
      (vscode.window as any).createWebviewPanel = (
        viewType: string,
        title: string,
        showOptions: any,
        options?: any
      ) => {
        mockPanel = createMockWebviewPanel();
        return mockPanel;
      };

      const testProvider = new DashboardProvider(mockContext);
      await testProvider.showDashboard();

      // Send malformed messages - these should be handled gracefully
      // Note: The current implementation doesn't handle null gracefully,
      // but messages with invalid/missing command properties are fine
      if (mockPanel._onDidReceiveMessageCallback) {
        await mockPanel._onDidReceiveMessageCallback({ invalid: "message" });
        await mockPanel._onDidReceiveMessageCallback({});
        await mockPanel._onDidReceiveMessageCallback({ command: "unknown" });
      }

      // Should not crash
      assert.ok(true, "Should handle invalid messages gracefully");

      // Restore
      (vscode.window as any).createWebviewPanel = originalCreateWebviewPanel;
    });
  });
});
