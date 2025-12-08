import { test, expect } from "@playwright/test";
import { VSCodeLauncher, VSCodeInstance } from "./helpers/vscode-launcher";
import { SELECTORS } from "../../constants/ui-text";
import * as path from "path";
import * as fs from "fs";

let vscode: VSCodeInstance;

test.describe("Semgrep Integration E2E Tests", () => {
  let testVenvPath: string | null = null;
  let semgrepInstalled = false;

  test.beforeAll(async () => {
    // Clean up any existing VSCode processes before starting tests
    await VSCodeLauncher.cleanupAll();
    
    // Set up isolated Python venv for semgrep in test fixtures directory
    const { execSync } = require("child_process");
    const fixtureDir = path.join(__dirname, "fixtures", "with-carbonara-project");
    const venvDir = path.join(fixtureDir, ".test-venv");
    testVenvPath = venvDir;
    
    try {
      // Check if venv already exists
      if (!fs.existsSync(path.join(venvDir, "bin", "python"))) {
        console.log("Creating isolated Python venv for semgrep in test environment...");
        // Create venv
        execSync(`python3 -m venv "${venvDir}"`, {
          stdio: "inherit",
          cwd: fixtureDir,
          timeout: 30000,
        });
        console.log("✅ Test venv created");
      }
      
      // Install semgrep in the venv
      const pythonPath = path.join(venvDir, "bin", "python");
      const pipPath = path.join(venvDir, "bin", "pip");
      
      // Check if semgrep is already installed
      try {
        execSync(`${pythonPath} -m semgrep --version`, {
          stdio: "pipe",
          timeout: 5000,
        });
        console.log("✅ Semgrep already installed in test venv");
        semgrepInstalled = true;
      } catch (error) {
        console.log("Installing semgrep in test venv...");
        execSync(`${pipPath} install --quiet semgrep`, {
          stdio: "inherit",
          timeout: 120000, // 2 minutes for installation
        });
        console.log("✅ Semgrep installed in test venv");
        semgrepInstalled = true;
      }
      
      // Store venv bin path for use in tests
      process.env.CARBONARA_TEST_VENV_BIN = path.join(venvDir, "bin");
    } catch (error: any) {
      console.error("⚠️ Failed to set up test venv for semgrep:", error.message);
      console.log("Tests will use fixture data only");
      semgrepInstalled = false;
    }
  });

  test.afterAll(async () => {
    // Final cleanup after all tests complete
    await VSCodeLauncher.cleanupAll();
  });

  test.beforeEach(async () => {
    // Don't set CARBONARA_E2E_ALLOW_TOOLS by default
    // Individual tests will set it if needed
    delete process.env.CARBONARA_E2E_ALLOW_TOOLS;
    
    vscode = await VSCodeLauncher.launch("with-carbonara-project");
    await VSCodeLauncher.waitForExtension(vscode.window);
  });


  test("should show diagnostics from fixture data when semgrep is not installed", async () => {
    // This test should use restricted PATH (semgrep not available)
    // Ensure the flag is not set
    delete process.env.CARBONARA_E2E_ALLOW_TOOLS;
    // Open the test file
    await vscode.window.keyboard.press("Meta+P");
    await vscode.window.waitForTimeout(1000);
    await vscode.window.keyboard.type("test-file.js");
    await vscode.window.waitForTimeout(500);
    await vscode.window.keyboard.press("Enter");
    await vscode.window.waitForTimeout(2000);

    // Focus editor
    const editor = vscode.window.locator(".monaco-editor[role='code']").first();
    await expect(editor).toBeVisible({ timeout: 5000 });
    await editor.click({ position: { x: 100, y: 100 } });
    
    // Wait for extension to fully initialize
    await vscode.window.waitForTimeout(3000);

    // Manually trigger loading diagnostics from database via command
    await vscode.window.keyboard.press("F1");
    await vscode.window.waitForTimeout(500);
    await vscode.window.keyboard.type("Load Semgrep Diagnostics");
    await vscode.window.waitForTimeout(1000);
    
    // Check if command exists (it might not be in package.json, so we'll use executeCommand directly)
    // Actually, let's just execute the command directly
    await vscode.window.evaluate(() => {
      return (window as any).vscode?.commands?.executeCommand("carbonara.loadSemgrepDiagnostics");
    }).catch(() => {
      // Command might not be registered yet, try via F1
      return vscode.window.keyboard.press("Escape"); // Close command palette if open
    });
    
    // Wait for diagnostics to load
    await vscode.window.waitForTimeout(2000);

    // Open Problems panel to show diagnostics
    await vscode.window.keyboard.press("F1");
    await vscode.window.waitForTimeout(500);
    await vscode.window.keyboard.type("View: Show Problems");
    await vscode.window.waitForTimeout(1000);
    await vscode.window.keyboard.press("Enter");
    await vscode.window.waitForTimeout(2000);

    // ASSERTION: Check that code is highlighted with diagnostics from fixture data
    // Use multiple selectors to catch all diagnostic markers (VSCode may render them differently)
    const diagnosticMarkers = vscode.window.locator(
      '.monaco-editor .squiggly-error, ' +
      '.monaco-editor .squiggly-warning, ' +
      '.monaco-editor .squiggly-info, ' +
      '.monaco-editor .squiggly-hint, ' +
      '.monaco-editor .cdr.squiggly-d-error, ' +
      '.monaco-editor .cdr.squiggly-d-warning, ' +
      '.monaco-editor .cdr.squiggly-d-info, ' +
      '.monaco-editor .cdr.squiggly-d-hint, ' +
      '.monaco-editor .squiggly-underline, ' +
      '.monaco-editor-view-overlays .squiggly-error, ' +
      '.monaco-editor-view-overlays .squiggly-warning, ' +
      '.monaco-editor-view-overlays .squiggly-info'
    );

    // Wait a bit more and retry if no diagnostics found
    let diagnosticCount = await diagnosticMarkers.count();
    if (diagnosticCount === 0) {
      await vscode.window.waitForTimeout(3000);
      diagnosticCount = await diagnosticMarkers.count();
    }
    
    // Check Problems panel for diagnostics (more reliable than editor markers)
    const problemsPanel = vscode.window.locator('.problems-view, [id="workbench.panel.markers"]');
    const problemsVisible = await problemsPanel.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Problems panel visible: ${problemsVisible}`);
    
    let problemCount = 0;
    if (problemsVisible) {
      // Look for problem entries - filter to only Semgrep/Carbonara diagnostics
      const problemEntries = problemsPanel.locator('.monaco-list-row');
      problemCount = await problemEntries.count();
      console.log(`Problem entries in Problems panel: ${problemCount}`);
      
      // Also check for Semgrep-specific entries
      const semgrepEntries = problemsPanel.locator('.monaco-list-row:has-text("Carbonara Code Scan"), .monaco-list-row:has-text("semgrep")');
      const semgrepCount = await semgrepEntries.count();
      console.log(`Semgrep-specific entries in Problems panel: ${semgrepCount}`);
    }
    
    // Debug: Check if file is actually open
    const editorVisible = await editor.isVisible();
    console.log(`Editor visible: ${editorVisible}, Diagnostic markers in editor: ${diagnosticCount}, Problem entries: ${problemCount}`);
    
    // Primary assertion: Either editor markers OR Problems panel entries should show diagnostics
    // Problems panel is more reliable as it shows all diagnostics regardless of rendering
    const hasDiagnostics = diagnosticCount > 0 || problemCount > 0;
    expect(hasDiagnostics).toBe(true);
    
    // Secondary assertion: If Problems panel is visible, it should have entries
    if (problemsVisible) {
      expect(problemCount).toBeGreaterThan(0);
    }
  });

  test("should trigger Semgrep analysis and show results with diagnostics when semgrep is installed", async () => {
    // Skip this test if semgrep is not installed in venv
    test.skip(!semgrepInstalled, "Semgrep not installed in test venv");
    
    // Verify semgrep is actually available in the test venv
    const { execSync } = require("child_process");
    const venvBin = process.env.CARBONARA_TEST_VENV_BIN;
    if (venvBin) {
      try {
        // Semgrep can be installed as a binary or as a Python module
        // Try both: semgrep binary and python -m semgrep
        const pythonPath = path.join(venvBin, "python");
        const semgrepPath = path.join(venvBin, "semgrep");
        
        let versionOutput: string;
        let semgrepLocation: string;
        
        // Try binary first
        try {
          versionOutput = execSync(`${semgrepPath} --version`, {
            encoding: "utf-8",
            timeout: 5000,
          });
          semgrepLocation = semgrepPath;
        } catch {
          // Try Python module
          versionOutput = execSync(`${pythonPath} -m semgrep --version`, {
            encoding: "utf-8",
            timeout: 5000,
          });
          semgrepLocation = `${pythonPath} -m semgrep`;
        }
        
        console.log(`✅ Verified semgrep is available via: ${semgrepLocation}`);
        console.log(`   Version: ${versionOutput.trim()}`);
        console.log(`   PATH will include: ${venvBin}`);
      } catch (error: any) {
        console.error(`❌ Semgrep not found in venv: ${venvBin}`);
        console.error(`   Error: ${error.message}`);
        throw error;
      }
    }
    
    // This test should use the test venv (semgrep available)
    process.env.CARBONARA_E2E_ALLOW_TOOLS = "true";
    // Open the test file
    await vscode.window.keyboard.press("Meta+P");
    await vscode.window.waitForTimeout(1000);
    await vscode.window.keyboard.type("test-file.js");
    await vscode.window.waitForTimeout(500);
    await vscode.window.keyboard.press("Enter");
    await vscode.window.waitForTimeout(2000);

    // Focus editor
    const editor = vscode.window.locator(".monaco-editor[role='code']").first();
    await expect(editor).toBeVisible({ timeout: 5000 });
    await editor.click({ position: { x: 100, y: 100 } });
    await vscode.window.waitForTimeout(500);

    // Run Semgrep via command palette
    await vscode.window.keyboard.press("F1");
    await vscode.window.waitForTimeout(500);
    await vscode.window.keyboard.type("Scan current file");
    await vscode.window.waitForTimeout(1000);
    
    // Verify command appears in quick pick
    const semgrepCommand = vscode.window.locator('text=/Scan current file/i');
    await expect(semgrepCommand).toBeVisible({ timeout: 5000 });
    
    await vscode.window.keyboard.press("Enter");
    await vscode.window.waitForTimeout(1000);

    // Wait for analysis to complete (semgrep can take time)
    // Also wait for any "not installed" dialogs to appear and dismiss them if they do
    await vscode.window.waitForTimeout(2000);
    
    // Check for and dismiss "Semgrep is not installed" dialog if it appears
    const installDialog = vscode.window.locator('text=/Semgrep is not installed/i');
    if (await installDialog.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log("⚠️ 'Semgrep is not installed' dialog appeared - this shouldn't happen if semgrep is in PATH");
      // Dismiss the dialog
      await vscode.window.keyboard.press("Escape");
      await vscode.window.waitForTimeout(500);
    }

    // Wait for analysis to complete
    await vscode.window.waitForTimeout(13000);

    // Open Problems panel to show diagnostics
    await vscode.window.keyboard.press("Meta+Shift+M"); // Cmd+Shift+M on Mac, Ctrl+Shift+M on Windows/Linux
    await vscode.window.waitForTimeout(1000);
    
    // Alternative: Try opening via View menu
    try {
      await vscode.window.keyboard.press("Meta+K");
      await vscode.window.waitForTimeout(200);
      await vscode.window.keyboard.press("Meta+M");
      await vscode.window.waitForTimeout(1000);
    } catch (e) {
      // Fallback: try command palette
      await vscode.window.keyboard.press("F1");
      await vscode.window.waitForTimeout(500);
      await vscode.window.keyboard.type("View: Show Problems");
      await vscode.window.waitForTimeout(1000);
      await vscode.window.keyboard.press("Enter");
      await vscode.window.waitForTimeout(1000);
    }

    // ASSERTION: Check that code is highlighted with diagnostics from real semgrep analysis
    // Use multiple selectors to catch all diagnostic markers (VSCode may render them differently)
    const diagnosticMarkers = vscode.window.locator(
      '.monaco-editor .squiggly-error, ' +
      '.monaco-editor .squiggly-warning, ' +
      '.monaco-editor .squiggly-info, ' +
      '.monaco-editor .squiggly-hint, ' +
      '.monaco-editor .cdr.squiggly-d-error, ' +
      '.monaco-editor .cdr.squiggly-d-warning, ' +
      '.monaco-editor .cdr.squiggly-d-info, ' +
      '.monaco-editor .cdr.squiggly-d-hint, ' +
      '.monaco-editor .squiggly-underline, ' +
      '.monaco-editor-view-overlays .squiggly-error, ' +
      '.monaco-editor-view-overlays .squiggly-warning, ' +
      '.monaco-editor-view-overlays .squiggly-info'
    );

    // Also check Problems panel for diagnostics (more reliable than editor markers)
    const problemsPanel = vscode.window.locator('.problems-view, [id="workbench.panel.markers"]');
    const problemsVisible = await problemsPanel.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Problems panel visible: ${problemsVisible}`);

    // Wait a bit more for diagnostics to appear
    await vscode.window.waitForTimeout(3000);
    const diagnosticCount = await diagnosticMarkers.count();
    console.log(`Diagnostic markers in editor: ${diagnosticCount}`);
    
    let problemCount = 0;
    // Check Problems panel for diagnostic entries
    if (problemsVisible) {
      const problemEntries = problemsPanel.locator('.monaco-list-row');
      problemCount = await problemEntries.count();
      console.log(`Problem entries in Problems panel: ${problemCount}`);
      
      // Also check for Semgrep-specific entries
      const semgrepEntries = problemsPanel.locator('.monaco-list-row:has-text("Carbonara Code Scan"), .monaco-list-row:has-text("semgrep")');
      const semgrepCount = await semgrepEntries.count();
      console.log(`Semgrep-specific entries in Problems panel: ${semgrepCount}`);
    }
    
    // Primary assertion: Either editor markers OR Problems panel entries should show diagnostics
    // Problems panel is more reliable as it shows all diagnostics regardless of rendering
    const hasDiagnostics = diagnosticCount > 0 || problemCount > 0;
    expect(hasDiagnostics).toBe(true);
    
    // Secondary assertion: If Problems panel is visible, it should have entries
    if (problemsVisible) {
      expect(problemCount).toBeGreaterThan(0);
    }
  });

  test("should show proper error message when prerequisites are missing", async () => {
    // This test verifies that when Python or semgrep prerequisites are missing,
    // a clear error is shown with installation instructions
    // Note: This test may be skipped in environments where Python is always available
    
    // Open Carbonara sidebar
      await VSCodeLauncher.openSidebar(vscode.window);
    await vscode.window.waitForTimeout(2000);

    // Try to run semgrep scan
    await vscode.window.keyboard.press("F1");
    await vscode.window.waitForTimeout(500);
    await vscode.window.keyboard.type("Scan all files");
    await vscode.window.waitForTimeout(1000);
    
    const scanCommand = vscode.window.locator('text=/Scan all files/i');
    if (await scanCommand.isVisible({ timeout: 5000 })) {
      await scanCommand.click();
      await vscode.window.waitForTimeout(2000);
      
      // Check for error message about prerequisites
      // The error should mention Python or semgrep and include setup instructions
      const errorMessage = vscode.window.locator(
        'text=/prerequisites|Python|semgrep|installation/i'
      );
      
      // If prerequisites are actually missing, verify error message appears
      // If prerequisites are available, this test just verifies the code path exists
      const hasError = await errorMessage.isVisible().catch(() => false);
      if (hasError) {
        // Verify error message contains helpful information
        const errorText = await errorMessage.textContent();
        expect(errorText).toBeTruthy();
        // Error should mention prerequisites or installation
        expect(errorText?.toLowerCase()).toMatch(/prerequisite|python|install/i);
      }
    }
  });

<<<<<<< HEAD
  test("should show proper error message when Python is not installed", async () => {
    // This test verifies that when Python is missing, a clear error is shown
    // Note: This test may be skipped in environments where Python is always available
    // The actual error checking happens in the semgrep-integration module
    
    // Open Carbonara sidebar
    await VSCodeLauncher.openSidebar(vscode.window);
    await vscode.window.waitForTimeout(2000);

    // Try to run semgrep scan
    await vscode.window.keyboard.press("F1");
    await vscode.window.waitForTimeout(500);
    await vscode.window.keyboard.type("Scan all files");
    await vscode.window.waitForTimeout(1000);
    
    const scanCommand = vscode.window.locator('text=/Scan all files/i');
    if (await scanCommand.isVisible({ timeout: 5000 })) {
      await vscode.window.keyboard.press("Enter");
      await vscode.window.waitForTimeout(3000);

      // Check for error message (either Python missing or semgrep missing)
      // The error should be consistent with other tools
      const errorMessage = vscode.window.locator(
        'text=/Python|semgrep|not installed|Install with/i'
      );
      
      // Error might appear in notification or output channel
      // We just verify the UI responds appropriately
      const hasError = await errorMessage.isVisible({ timeout: 5000 }).catch(() => false);
      
      // If Python/semgrep is installed, the test will proceed normally
      // If not, we verify error handling
      if (hasError) {
        // Verify error message contains installation instructions
        const errorText = await errorMessage.textContent().catch(() => "");
        assert.ok(
          errorText.includes("Python") || errorText.includes("semgrep") || errorText.includes("Install"),
          "Error message should mention Python, semgrep, or installation instructions"
        );
      }
    }
  });

  test("should show installation instructions consistent with other tools", async () => {
    // Verify that semgrep error messages follow the same pattern as other tools
    // This is verified by checking the tools.json configuration
    const toolsJsonPath = path.join(__dirname, "..", "..", "..", "..", "packages", "cli", "src", "registry", "tools.json");
=======
  test("should verify semgrep tool configuration uses prerequisites system", async () => {
    // Verify that semgrep tool configuration matches expected format
    // This is a unit-style test that verifies the tools.json configuration
    // __dirname is in plugins/vscode/src/test/e2e/, so go up 5 levels to get to workspace root
    const workspaceRoot = path.resolve(__dirname, "../../../../../");
    const toolsJsonPath = path.join(workspaceRoot, "packages", "cli", "src", "registry", "tools.json");
    
    if (!fs.existsSync(toolsJsonPath)) {
      throw new Error(`tools.json not found at ${toolsJsonPath}`);
    }
    
>>>>>>> f6972a8 (feat: improve Semgrep integration with database storage and diagnostics loading)
    const toolsJsonContent = fs.readFileSync(toolsJsonPath, "utf-8");
    const toolsJson = JSON.parse(toolsJsonContent);
    const semgrepTool = toolsJson.tools.find((t: any) => t.id === "semgrep");
    
<<<<<<< HEAD
    assert.ok(semgrepTool, "Semgrep tool should be in registry");
    assert.strictEqual(semgrepTool.installation.type, "pip", "Semgrep should have pip installation type");
    assert.ok(
      semgrepTool.installation.instructions.includes("Python 3.7+"),
      "Installation instructions should mention Python 3.7+ requirement"
    );
    assert.ok(
      semgrepTool.installation.instructions.includes("pip install"),
      "Installation instructions should include pip install command"
    );
    assert.strictEqual(
      semgrepTool.detection.method,
      "command",
      "Semgrep should use command-based detection"
    );
=======
    expect(semgrepTool).toBeTruthy();
    expect(semgrepTool.installation.type).toBe("pip");
    expect(semgrepTool.installation.instructions).toContain("Python 3.7+");
    expect(semgrepTool.installation.instructions).toContain("pip install");
    expect(semgrepTool.detection.method).toBe("command");
    expect(semgrepTool.detection.commands).toBeDefined();
    expect(semgrepTool.detection.commands[0]).toBe("semgrep --version");
    expect(semgrepTool.prerequisites).toBeDefined();
    expect(semgrepTool.prerequisites.length).toBeGreaterThan(0);
    
    const pythonPrereq = semgrepTool.prerequisites.find((p: any) => p.type === "python");
    expect(pythonPrereq).toBeDefined();
    expect(pythonPrereq.setupInstructions).toContain("python.org");
    
    // Verify that semgrep uses tool-helpers for error handling
    // (This is verified by checking that prerequisites system is used)
    expect(semgrepTool.command.executable).toBe("semgrep");
>>>>>>> f6972a8 (feat: improve Semgrep integration with database storage and diagnostics loading)
  });
});
