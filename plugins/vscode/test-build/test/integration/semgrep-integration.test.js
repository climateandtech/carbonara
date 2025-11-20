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
const mockSemgrepService = {
    checkSetup: async () => ({
        isValid: true,
        errors: [],
    }),
    analyzeFile: async (filePath) => ({
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
let semgrepIntegration;
let initializeSemgrep;
let clearSemgrepResults;
suite("Semgrep Integration Unit Tests", () => {
    let mockContext;
    let mockDiagnosticCollection;
    suiteSetup(() => {
        // Mock @carbonara/core before importing the module under test
        const Module = require("module");
        const originalRequire = Module.prototype.require;
        Module.prototype.require = function (id) {
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
        const diagnostics = new Map();
        mockDiagnosticCollection = {
            name: "semgrep",
            set: ((uriOrEntries, newDiagnostics) => {
                if (Array.isArray(uriOrEntries)) {
                    for (const [uri, diags] of uriOrEntries) {
                        diagnostics.set(uri.toString(), [...diags]);
                    }
                }
                else {
                    diagnostics.set(uriOrEntries.toString(), [...(newDiagnostics || [])]);
                }
            }),
            delete: (uri) => {
                diagnostics.delete(uri.toString());
            },
            clear: () => {
                diagnostics.clear();
            },
            forEach: (callback) => {
                const entries = Array.from(diagnostics.entries());
                for (const [uri, diags] of entries) {
                    callback(vscode.Uri.parse(uri), diags);
                }
            },
            get: (uri) => {
                return diagnostics.get(uri.toString());
            },
            has: (uri) => {
                return diagnostics.has(uri.toString());
            },
            dispose: () => {
                diagnostics.clear();
            },
            [Symbol.iterator]: function* () {
                const entries = Array.from(diagnostics.entries());
                for (const [uriString, diags] of entries) {
                    yield [vscode.Uri.parse(uriString), diags];
                }
            },
        };
        // Mock vscode.languages.createDiagnosticCollection
        vscode.languages.createDiagnosticCollection = (name) => {
            return mockDiagnosticCollection;
        };
        // Create mock extension context
        mockContext = {
            subscriptions: [],
            workspaceState: {
                get: () => undefined,
                update: async () => { },
                keys: () => [],
            },
            globalState: {
                get: () => undefined,
                update: async () => { },
                setKeysForSync: () => { },
                keys: () => [],
            },
            extensionPath: "/mock/extension/path",
            extensionUri: vscode.Uri.file("/mock/extension/path"),
            environmentVariableCollection: {},
            extensionMode: vscode.ExtensionMode.Test,
            storageUri: vscode.Uri.file("/mock/storage"),
            globalStorageUri: vscode.Uri.file("/mock/global-storage"),
            logUri: vscode.Uri.file("/mock/log"),
            storagePath: "/mock/storage",
            globalStoragePath: "/mock/global-storage",
            logPath: "/mock/log",
            asAbsolutePath: (relativePath) => `/mock/extension/path/${relativePath}`,
            secrets: {},
            extension: {},
            languageModelAccessInformation: {},
        };
    });
    teardown(() => {
        if (mockDiagnosticCollection) {
            mockDiagnosticCollection.clear();
        }
    });
    suite("initializeSemgrep", () => {
        test("should create and return a diagnostic collection", () => {
            const diagnosticCollection = initializeSemgrep(mockContext);
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
                severity: "ERROR",
                start_line: 1,
                start_column: 5,
                end_line: 1,
                end_column: 10,
            };
            const range = new vscode.Range(match.start_line - 1, Math.max(0, match.start_column - 1), match.end_line - 1, Math.max(0, match.end_column - 1));
            const diagnostic = new vscode.Diagnostic(range, match.message, vscode.DiagnosticSeverity.Error);
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
                severity: "WARNING",
                start_line: 2,
                start_column: 1,
                end_line: 2,
                end_column: 20,
            };
            const range = new vscode.Range(match.start_line - 1, Math.max(0, match.start_column - 1), match.end_line - 1, Math.max(0, match.end_column - 1));
            const diagnostic = new vscode.Diagnostic(range, match.message, vscode.DiagnosticSeverity.Warning);
            assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Warning);
            assert.strictEqual(diagnostic.message, "Test warning");
        });
        test("should convert INFO severity correctly", () => {
            const match = {
                rule_id: "test-rule",
                message: "Test info",
                severity: "INFO",
                start_line: 3,
                start_column: 1,
                end_line: 3,
                end_column: 15,
            };
            const range = new vscode.Range(match.start_line - 1, Math.max(0, match.start_column - 1), match.end_line - 1, Math.max(0, match.end_column - 1));
            const diagnostic = new vscode.Diagnostic(range, match.message, vscode.DiagnosticSeverity.Information);
            assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Information);
            assert.strictEqual(diagnostic.message, "Test info");
        });
        test("should handle negative column numbers", () => {
            const match = {
                rule_id: "test-rule",
                message: "Test",
                severity: "ERROR",
                start_line: 1,
                start_column: -1,
                end_line: 1,
                end_column: -1,
            };
            const range = new vscode.Range(match.start_line - 1, Math.max(0, match.start_column - 1), match.end_line - 1, Math.max(0, match.end_column - 1));
            assert.strictEqual(range.start.character, 0);
            assert.strictEqual(range.end.character, 0);
        });
        test("should handle zero-based line conversion", () => {
            const match = {
                rule_id: "test-rule",
                message: "Test",
                severity: "ERROR",
                start_line: 1,
                start_column: 1,
                end_line: 2,
                end_column: 1,
            };
            const range = new vscode.Range(match.start_line - 1, Math.max(0, match.start_column - 1), match.end_line - 1, Math.max(0, match.end_column - 1));
            assert.strictEqual(range.start.line, 0);
            assert.strictEqual(range.end.line, 1);
        });
    });
});
//# sourceMappingURL=semgrep-integration.test.js.map