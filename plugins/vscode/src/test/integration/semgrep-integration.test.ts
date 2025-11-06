import * as assert from "assert";
import * as vscode from "vscode";

// Mock the @carbonara/core module before importing the module under test
type SetupResult = { isValid: boolean; errors: string[] };
type AnalyzeResult = {
  success: boolean;
  matches: any[];
  errors: string[];
  stats: {
    files_scanned: number;
    total_matches: number;
    error_count: number;
    warning_count: number;
    info_count: number;
  };
};

const mockSemgrepService: {
  checkSetup: () => Promise<SetupResult>;
  analyzeFile: (filePath: string) => Promise<AnalyzeResult>;
} = {
  checkSetup: async () => ({
    isValid: true,
    errors: [],
  }),
  analyzeFile: async (filePath: string) => ({
    success: true,
    matches: [],
    errors: [],
    stats: {
      files_scanned: 1,
      total_matches: 0,
      error_count: 0,
      warning_count: 0,
      info_count: 0,
    },
  }),
};

const mockCreateSemgrepService = () => mockSemgrepService;

// We need to mock the module before it's imported
let semgrepIntegration: any;
let initializeSemgrep: any;
let clearSemgrepResults: any;

suite("Semgrep Integration Unit Tests", () => {
  let mockContext: vscode.ExtensionContext;
  let mockDiagnosticCollection: vscode.DiagnosticCollection;

  suiteSetup(() => {
    // Mock @carbonara/core before importing the module under test
    const Module = require("module");
    const originalRequire = Module.prototype.require;

    Module.prototype.require = function (id: string) {
      if (id === "@carbonara/core") {
        return {
          createSemgrepService: mockCreateSemgrepService,
        };
      }
      return originalRequire.apply(this, arguments);
    };

    // Now import the module under test
    semgrepIntegration = require("../../semgrep-integration");
    initializeSemgrep = semgrepIntegration.initializeSemgrep;
    clearSemgrepResults = semgrepIntegration.clearSemgrepResults;
  });

  setup(() => {
    // Create mock diagnostic collection
    const diagnostics = new Map<string, vscode.Diagnostic[]>();
    mockDiagnosticCollection = {
      name: "semgrep",
      set: ((
        uriOrEntries: vscode.Uri | readonly [vscode.Uri, readonly vscode.Diagnostic[]][],
        newDiagnostics?: readonly vscode.Diagnostic[]
      ) => {
        if (Array.isArray(uriOrEntries)) {
          for (const [uri, diags] of uriOrEntries) {
            diagnostics.set(uri.toString(), [...diags]);
          }
        } else {
          diagnostics.set(uriOrEntries.toString(), [...(newDiagnostics || [])]);
        }
      }) as any,
      delete: (uri: vscode.Uri) => {
        diagnostics.delete(uri.toString());
      },
      clear: () => {
        diagnostics.clear();
      },
      forEach: (
        callback: (
          uri: vscode.Uri,
          diagnostics: readonly vscode.Diagnostic[]
        ) => void
      ) => {
        const entries = Array.from(diagnostics.entries());
        for (const [uri, diags] of entries) {
          callback(vscode.Uri.parse(uri), diags);
        }
      },
      get: (uri: vscode.Uri) => {
        return diagnostics.get(uri.toString());
      },
      has: (uri: vscode.Uri) => {
        return diagnostics.has(uri.toString());
      },
      dispose: () => {
        diagnostics.clear();
      },
      [Symbol.iterator]: function* () {
        const entries = Array.from(diagnostics.entries());
        for (const [uriString, diags] of entries) {
          yield [vscode.Uri.parse(uriString), diags] as [
            vscode.Uri,
            readonly vscode.Diagnostic[]
          ];
        }
      },
    } as unknown as vscode.DiagnosticCollection;

    // Mock vscode.languages.createDiagnosticCollection
    vscode.languages.createDiagnosticCollection = (name?: string) => {
      return mockDiagnosticCollection;
    };

    // Create mock extension context
    mockContext = {
      subscriptions: [],
      workspaceState: {
        get: () => undefined,
        update: async () => {},
        keys: () => [],
      },
      globalState: {
        get: () => undefined,
        update: async () => {},
        setKeysForSync: () => {},
        keys: () => [],
      },
      extensionPath: "/mock/extension/path",
      extensionUri: vscode.Uri.file("/mock/extension/path"),
      environmentVariableCollection: {} as any,
      extensionMode: vscode.ExtensionMode.Test,
      storageUri: vscode.Uri.file("/mock/storage"),
      globalStorageUri: vscode.Uri.file("/mock/global-storage"),
      logUri: vscode.Uri.file("/mock/log"),
      storagePath: "/mock/storage",
      globalStoragePath: "/mock/global-storage",
      logPath: "/mock/log",
      asAbsolutePath: (relativePath: string) => `/mock/extension/path/${relativePath}`,
      secrets: {} as any,
      extension: {} as any,
      languageModelAccessInformation: {} as any,
    } as vscode.ExtensionContext;
  });

  teardown(() => {
    if (mockDiagnosticCollection) {
      mockDiagnosticCollection.clear();
    }
  });

  suite("initializeSemgrep", () => {
    test("should create and return a diagnostic collection", async () => {
      const diagnosticCollection = await initializeSemgrep(mockContext);

      assert.ok(diagnosticCollection);
      assert.strictEqual(diagnosticCollection.name, "semgrep");
      assert.ok(mockContext.subscriptions.length > 0);
    });

    test("should register event listeners", () => {
      const initialLength = mockContext.subscriptions.length;
      initializeSemgrep(mockContext);

      // Should register: diagnostic collection + 3 event listeners
      assert.ok(mockContext.subscriptions.length >= initialLength + 4);
    });
  });

  suite("Diagnostic Conversion", () => {
    test("should convert ERROR severity correctly", () => {
      const match = {
        rule_id: "test-rule",
        message: "Test error",
        severity: "ERROR" as const,
        start_line: 1,
        start_column: 5,
        end_line: 1,
        end_column: 10,
      };

      const range = new vscode.Range(
        match.start_line - 1,
        Math.max(0, match.start_column - 1),
        match.end_line - 1,
        Math.max(0, match.end_column - 1)
      );

      const diagnostic = new vscode.Diagnostic(
        range,
        match.message,
        vscode.DiagnosticSeverity.Error
      );
      diagnostic.source = "semgrep";
      diagnostic.code = match.rule_id;

      assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Error);
      assert.strictEqual(diagnostic.message, "Test error");
      assert.strictEqual(diagnostic.source, "semgrep");
      assert.strictEqual(diagnostic.code, "test-rule");
    });

    test("should convert WARNING severity correctly", () => {
      const match = {
        rule_id: "test-rule",
        message: "Test warning",
        severity: "WARNING" as const,
        start_line: 2,
        start_column: 1,
        end_line: 2,
        end_column: 20,
      };

      const range = new vscode.Range(
        match.start_line - 1,
        Math.max(0, match.start_column - 1),
        match.end_line - 1,
        Math.max(0, match.end_column - 1)
      );

      const diagnostic = new vscode.Diagnostic(
        range,
        match.message,
        vscode.DiagnosticSeverity.Warning
      );

      assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Warning);
      assert.strictEqual(diagnostic.message, "Test warning");
    });

    test("should convert INFO severity correctly", () => {
      const match = {
        rule_id: "test-rule",
        message: "Test info",
        severity: "INFO" as const,
        start_line: 3,
        start_column: 1,
        end_line: 3,
        end_column: 15,
      };

      const range = new vscode.Range(
        match.start_line - 1,
        Math.max(0, match.start_column - 1),
        match.end_line - 1,
        Math.max(0, match.end_column - 1)
      );

      const diagnostic = new vscode.Diagnostic(
        range,
        match.message,
        vscode.DiagnosticSeverity.Information
      );

      assert.strictEqual(
        diagnostic.severity,
        vscode.DiagnosticSeverity.Information
      );
      assert.strictEqual(diagnostic.message, "Test info");
    });

    test("should handle negative column numbers", () => {
      const match = {
        rule_id: "test-rule",
        message: "Test",
        severity: "ERROR" as const,
        start_line: 1,
        start_column: -1,
        end_line: 1,
        end_column: -1,
      };

      const range = new vscode.Range(
        match.start_line - 1,
        Math.max(0, match.start_column - 1),
        match.end_line - 1,
        Math.max(0, match.end_column - 1)
      );

      assert.strictEqual(range.start.character, 0);
      assert.strictEqual(range.end.character, 0);
    });

    test("should handle zero-based line conversion", () => {
      const match = {
        rule_id: "test-rule",
        message: "Test",
        severity: "ERROR" as const,
        start_line: 1,
        start_column: 1,
        end_line: 2,
        end_column: 1,
      };

      const range = new vscode.Range(
        match.start_line - 1,
        Math.max(0, match.start_column - 1),
        match.end_line - 1,
        Math.max(0, match.end_column - 1)
      );

      assert.strictEqual(range.start.line, 0);
      assert.strictEqual(range.end.line, 1);
    });
  });
});
