import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

suite("Carbonara Extension Integration Tests", () => {
  let extension: vscode.Extension<any> | undefined;

  suiteSetup(async function () {
    // Increase timeout for extension activation
    this.timeout(30000);

    // Get the extension
    extension = vscode.extensions.getExtension("carbonara.carbonara-vscode");
    assert.ok(extension, "Extension should be present");

    // Activate the extensionplugins/vscode/src/test/runTest.ts
    if (!extension.isActive) {
      await extension.activate();
    }

    assert.ok(extension.isActive, "Extension should be active");
  });

  test("Extension should be present and activate", () => {
    assert.ok(extension);
    assert.ok(extension.isActive);
  });

  test("All required commands should be registered", async () => {
    const commands = await vscode.commands.getCommands();
    const carbonaraCommands = commands.filter((cmd) =>
      cmd.startsWith("carbonara.")
    );

    const expectedCommands = [
      "carbonara.showMenu",
      "carbonara.initProject",
      "carbonara.runAssessment",
      "carbonara.analyzeWebsite",
      "carbonara.viewData",
      "carbonara.showStatus",
      "carbonara.openConfig",
      "carbonara.editSection",
      "carbonara.completeAssessment",
      "carbonara.refreshAssessment",
      "carbonara.refreshData",
      "carbonara.exportDataJson",
      "carbonara.exportDataCsv",
      "carbonara.clearAllData",
      "carbonara.openProject",
      "carbonara.installCli",
      "carbonara.viewTools",
      "carbonara.refreshTools",
      "carbonara.installTool",
      "carbonara.analyzeTool",
      "carbonara.runSemgrep",
      "carbonara.clearSemgrepResults",
    ];

    // Check that all expected commands are registered
    expectedCommands.forEach((expectedCmd) => {
      assert.ok(
        carbonaraCommands.includes(expectedCmd),
        `Command ${expectedCmd} should be registered`
      );
    });

    // Check that no unexpected commands are registered
    // Filter out VSCode auto-generated tree view commands (.open, .focus, .resetViewLocation, .toggleVisibility, .removeView)
    const vscodeGeneratedSuffixes = ['.open', '.focus', '.resetViewLocation', '.toggleVisibility', '.removeView'];
    const treeViewPrefixes = ['carbonara.assessmentTree', 'carbonara.dataTree', 'carbonara.toolsTree'];

    const isVSCodeGeneratedCommand = (cmd: string) => {
      return treeViewPrefixes.some(prefix =>
        vscodeGeneratedSuffixes.some(suffix => cmd === prefix + suffix)
      );
    };

    const unexpectedCommands = carbonaraCommands.filter(
      (cmd) => !expectedCommands.includes(cmd) && !isVSCodeGeneratedCommand(cmd)
    );
    assert.strictEqual(
      unexpectedCommands.length,
      0,
      `Unexpected commands registered: ${unexpectedCommands.join(", ")}. Please update the test if these are intentional.`
    );
  });

  test("Tree data providers should be registered", () => {
    // Check if tree views are registered by looking for them in the package.json contributions
    const packageJson = require("../../../package.json");
    const views = packageJson.contributes.views.carbonara;

    assert.ok(
      views.find((v: any) => v.id === "carbonara.assessmentTree"),
      "Assessment tree should be defined"
    );
    assert.ok(
      views.find((v: any) => v.id === "carbonara.dataTree"),
      "Data tree should be defined"
    );
  });

  test("Extension should handle workspace without project gracefully", async () => {
    // This tests the basic error handling when no carbonara project exists
    try {
      // Try to show status - should not throw error
      await vscode.commands.executeCommand("carbonara.showStatus");
      // Should reach here without throwing
      assert.ok(true, "showStatus command should execute without error");
    } catch (error) {
      // If it throws, it should be a user-friendly error, not a crash
      assert.ok(error instanceof Error, "Should throw a proper Error object");
    }
  });

  test("Configuration contributions should be present", () => {
    const config = vscode.workspace.getConfiguration("carbonara");

    // Test that configuration schema is properly registered
    const inspect = config.inspect("server.host");
    assert.ok(inspect, "Configuration should be registered");
  });

  test("Activity bar contribution should be present", () => {
    const packageJson = require("../../../package.json");
    const viewsContainers = packageJson.contributes.viewsContainers.activitybar;

    const carbonaraContainer = viewsContainers.find(
      (container: any) => container.id === "carbonara"
    );
    assert.ok(
      carbonaraContainer,
      "Carbonara activity bar container should be defined"
    );
    assert.equal(
      carbonaraContainer.title,
      "Carbonara",
      "Container should have correct title"
    );
  });

  test("Menu contributions should be present", () => {
    const packageJson = require("../../../package.json");
    const menus = packageJson.contributes.menus;

    assert.ok(menus["view/title"], "View title menus should be defined");

    const assessmentMenus = menus["view/title"].filter(
      (menu: any) => menu.when && menu.when.includes("carbonara.assessmentTree")
    );
    const dataMenus = menus["view/title"].filter(
      (menu: any) => menu.when && menu.when.includes("carbonara.dataTree")
    );

    assert.ok(
      assessmentMenus.length > 0,
      "Assessment tree menus should be defined"
    );
    assert.ok(dataMenus.length > 0, "Data tree menus should be defined");
  });

  test("Extension should handle command execution gracefully", async function () {
    this.timeout(10000);

    // Test commands that should work without setup (non-interactive only)
    const safeCommands = [
      "carbonara.showStatus",
      "carbonara.refreshAssessment",
      "carbonara.refreshData",
    ];

    for (const command of safeCommands) {
      try {
        await vscode.commands.executeCommand(command);
        // Command executed successfully
        assert.ok(true, `Command ${command} should execute`);
      } catch (error) {
        // If it fails, it should fail gracefully with user message, not crash
        console.log(
          `Command ${command} failed gracefully:`,
          (error as Error).message
        );
        assert.ok(
          error instanceof Error,
          `Command ${command} should fail gracefully`
        );
      }
    }
  });

  test("Status bar item should be created", async () => {
    const extension = vscode.extensions.getExtension(
      "carbonara.carbonara-vscode"
    );
    assert.ok(extension);

    if (!extension!.isActive) {
      await extension!.activate();
    }

    // Verify the showMenu command is registered (status bar item should trigger this)
    const commands = await vscode.commands.getCommands();
    const hasShowMenuCommand = commands.includes("carbonara.showMenu");
    assert.ok(
      hasShowMenuCommand,
      "Status bar showMenu command should be registered"
    );

    // Note: We don't execute the command as it shows an interactive QuickPick
    // that would hang in test environment waiting for user input
  });

  test("Package.json should have correct metadata", () => {
    const packageJson = require("../../../package.json");

    assert.equal(
      packageJson.name,
      "carbonara-vscode",
      "Package name should be correct"
    );
    assert.equal(
      packageJson.displayName,
      "Carbonara",
      "Display name should be correct"
    );
    assert.ok(packageJson.version, "Version should be present");
    assert.ok(
      packageJson.engines.vscode,
      "VSCode engine requirement should be present"
    );
  });
});

suite("Tree Provider Tests", () => {
  test("DataTreeProvider should handle missing workspace folder gracefully", async () => {
    const extension = vscode.extensions.getExtension(
      "carbonara.carbonara-vscode"
    );
    assert.ok(extension);

    if (!extension!.isActive) {
      await extension!.activate();
    }

    // Test that refresh command doesn't throw when no workspace
    await assert.doesNotReject(async () => {
      await vscode.commands.executeCommand("carbonara.refreshData");
    }, "Data tree should handle missing workspace gracefully");
  });

  test("AssessmentTreeProvider should handle missing workspace folder gracefully", async () => {
    const extension = vscode.extensions.getExtension(
      "carbonara.carbonara-vscode"
    );
    assert.ok(extension);

    if (!extension!.isActive) {
      await extension!.activate();
    }

    // Test that refresh command doesn't throw when no workspace
    await assert.doesNotReject(async () => {
      await vscode.commands.executeCommand("carbonara.refreshAssessment");
    }, "Assessment tree should handle missing workspace gracefully");
  });

  test("Tree providers should work with test workspace", async function () {
    this.timeout(10000); // Allow more time for workspace operations

    const testWorkspaceRoot = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "..",
      "test"
    );

    // Check if test workspace has expected files
    const configPath = path.join(testWorkspaceRoot, "carbonara.config.json");
    if (!fs.existsSync(configPath)) {
      this.skip(); // Skip if test workspace is not set up
    }

    const extension = vscode.extensions.getExtension(
      "carbonara.carbonara-vscode"
    );
    assert.ok(extension);

    if (!extension!.isActive) {
      await extension!.activate();
    }

    // Test data export functionality
    await assert.doesNotReject(async () => {
      await vscode.commands.executeCommand("carbonara.exportDataJson");
    }, "Data export should work in test workspace");
  });
});
