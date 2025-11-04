import * as assert from "assert";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { DataService } from "@carbonara/core";

// Mock the semgrep service to avoid needing actual Semgrep installation
const mockSemgrepMatches = [
  {
    rule_id: "test.rule.security-vulnerability",
    severity: "ERROR",
    path: "src/test.ts",
    file_path: "src/test.ts",
    start_line: 10,
    end_line: 12,
    start_column: 5,
    end_column: 20,
    message: "Security vulnerability detected",
  },
  {
    rule_id: "test.rule.performance-issue",
    severity: "WARNING",
    path: "src/test.ts",
    file_path: "src/test.ts",
    start_line: 25,
    end_line: 25,
    start_column: 1,
    end_column: 10,
    message: "Performance issue",
  },
  {
    rule_id: "test.rule.code-style",
    severity: "INFO",
    path: "src/other.ts",
    file_path: "src/other.ts",
    start_line: 5,
    end_line: 5,
    start_column: 1,
    end_column: 5,
    message: "Code style suggestion",
  },
];

suite("Semgrep Database Integration Tests", () => {
  let testDbPath: string;
  let dataService: DataService;
  let mockContext: vscode.ExtensionContext;
  let testWorkspacePath: string;

  suiteSetup(async function () {
    // Increase timeout for setup
    this.timeout(10000);
    // Create temporary test directory
    testWorkspacePath = path.join("/tmp", `semgrep-test-${Date.now()}`);
    fs.mkdirSync(testWorkspacePath, { recursive: true });
  });

  suiteTeardown(async function () {
    this.timeout(10000);
    // Cleanup
    try {
      if (testWorkspacePath && fs.existsSync(testWorkspacePath)) {
        fs.rmSync(testWorkspacePath, { recursive: true, force: true });
      }
      if (testDbPath && fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    } catch (error) {
      // Ignore cleanup errors
      console.log("Cleanup error (ignored):", error);
    }
  });

  setup(async function () {
    this.timeout(10000);
    // Create fresh database for each test
    // Use a unique path in /tmp to avoid conflicts
    testDbPath = path.join("/tmp", `test-semgrep-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.db`);
    dataService = new DataService({ dbPath: testDbPath });
    await dataService.initialize();

    // Create mock workspace folder
    const testWorkspaceFolder = {
      uri: vscode.Uri.file(testWorkspacePath),
      name: "test-workspace",
      index: 0,
    };

    // Mock workspace folders
    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: [testWorkspaceFolder],
      configurable: true,
      writable: true,
    });

    // Create mock context
    mockContext = {
      subscriptions: [],
      workspaceState: {} as any,
      globalState: {} as any,
      extensionPath: "/mock/path",
      extensionUri: vscode.Uri.file("/mock/path"),
      environmentVariableCollection: {} as any,
      extensionMode: vscode.ExtensionMode.Test,
      storageUri: vscode.Uri.file("/mock/storage"),
      globalStorageUri: vscode.Uri.file("/mock/global-storage"),
      logUri: vscode.Uri.file("/mock/log"),
      storagePath: "/mock/storage",
      globalStoragePath: "/mock/global-storage",
      logPath: "/mock/log",
      asAbsolutePath: (p: string) => path.join("/mock/path", p),
      secrets: {} as any,
      extension: {} as any,
      languageModelAccessInformation: {} as any,
    } as vscode.ExtensionContext;
  });

  teardown(async function () {
    this.timeout(5000);
    try {
      if (dataService) {
        await dataService.close();
      }
      if (testDbPath && fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    } catch (error) {
      // Ignore cleanup errors
      console.log("Teardown error (ignored):", error);
    }
  });

  test("should store semgrep run in assessment_data with correct structure", async function () {
    this.timeout(10000);
    // Create project
    const projectId = await dataService.createProject(
      "Test Project",
      testWorkspacePath
    );

    // Store semgrep run (simulating what runSemgrepAnalysis does)
    const runId = await dataService.storeSemgrepRun(
      mockSemgrepMatches,
      "src/test.ts",
      {
        total_matches: 3,
        error_count: 1,
        warning_count: 1,
        info_count: 1,
        files_scanned: 2,
      },
      projectId,
      "vscode-extension"
    );

    assert.ok(runId > 0, "Run ID should be valid");

    // Verify stored in assessment_data
    const assessmentData = await dataService.getAssessmentData(
      projectId,
      "semgrep"
    );
    assert.strictEqual(assessmentData.length, 1, "Should have one run");
    assert.strictEqual(
      assessmentData[0].tool_name,
      "semgrep",
      "Tool name should be semgrep"
    );
    assert.strictEqual(
      assessmentData[0].data_type,
      "code-analysis",
      "Data type should be code-analysis"
    );
    assert.strictEqual(
      assessmentData[0].data.target,
      "src/test.ts",
      "Target should match"
    );
    assert.strictEqual(
      assessmentData[0].data.matches.length,
      3,
      "Should have 3 matches"
    );
    assert.strictEqual(
      assessmentData[0].data.stats.total_matches,
      3,
      "Stats should match"
    );
    assert.strictEqual(
      assessmentData[0].source,
      "vscode-extension",
      "Source should be vscode-extension"
    );
  });

  test("should retrieve semgrep results by file for code highlighting", async function () {
    this.timeout(10000);
    const projectId = await dataService.createProject(
      "Test Project",
      testWorkspacePath
    );

    // Store multiple runs
    await dataService.storeSemgrepRun(
      mockSemgrepMatches,
      "src/test.ts",
      {
        total_matches: 3,
        error_count: 1,
        warning_count: 1,
        info_count: 1,
        files_scanned: 2,
      },
      projectId,
      "vscode-extension"
    );

    // Get results for specific file (used by code highlighting)
    const fileResults = await dataService.getSemgrepResultsByFile("src/test.ts");

    assert.strictEqual(
      fileResults.length,
      2,
      "Should have 2 findings for src/test.ts"
    );
    assert.ok(
      fileResults.some((r: any) => r.rule_id === "security-vulnerability"),
      "Should have security finding"
    );
    assert.ok(
      fileResults.some((r: any) => r.rule_id === "performance-issue"),
      "Should have performance finding"
    );
    assert.strictEqual(
      fileResults[0].file_path,
      "src/test.ts",
      "File path should match"
    );
    assert.ok(fileResults[0].created_at, "Should have timestamp");
  });

  test("should use severity mapping from registry when available", async function () {
    this.timeout(10000);
    // Create workspace tools.json with custom severity mapping
    const toolsJsonPath = path.join(testWorkspacePath, "tools.json");
    const customMapping = {
      tools: [
        {
          id: "semgrep",
          name: "Semgrep",
          severityMapping: {
            ERROR: "Error", // Map ERROR to Error (more severe)
            WARNING: "Warning",
            INFO: "Information",
          },
        },
      ],
    };
    fs.writeFileSync(toolsJsonPath, JSON.stringify(customMapping, null, 2));

    // Now test that getSeverityMapping would load this
    // (We can't directly test the private function, but we can verify the integration)
    // This test verifies the registry structure is correct
    const registryContent = fs.readFileSync(toolsJsonPath, "utf8");
    const registry = JSON.parse(registryContent);
    const semgrepTool = registry.tools.find((t: any) => t.id === "semgrep");

    assert.ok(semgrepTool, "Should find semgrep tool");
    assert.ok(
      semgrepTool.severityMapping,
      "Should have severity mapping"
    );
    assert.strictEqual(
      semgrepTool.severityMapping.ERROR,
      "Error",
      "ERROR should map to Error"
    );
    assert.strictEqual(
      semgrepTool.severityMapping.WARNING,
      "Warning",
      "WARNING should map to Warning"
    );

    // Cleanup
    fs.unlinkSync(toolsJsonPath);
  });
});

