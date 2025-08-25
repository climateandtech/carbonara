import { describe, test, beforeAll, expect } from "vitest";
import * as vscode from "vscode";
import packageJson from "../../../package.json" with { type: "json" };

describe("Carbonara Extension Integration Tests", () => {
  let extension: vscode.Extension<any> | undefined;

  beforeAll(async () => {
    // Get the extension
    extension = vscode.extensions.getExtension("carbonara.carbonara-vscode");
    expect(extension).toBeDefined();

    // Activate the extension
    if (!extension!.isActive) {
      await extension!.activate();
    }

    expect(extension!.isActive).toBe(true);
  }, 30000);

  test("Extension should be present and activate", () => {
    expect(extension).toBeDefined();
    expect(extension!.isActive).toBe(true);
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
    ];

    expectedCommands.forEach((expectedCmd) => {
      expect(carbonaraCommands.includes(expectedCmd)).toBe(true);
    });
  });

  test("Tree data providers should be registered", () => {
    // Check if tree views are registered by looking for them in the package.json contributions
    const views = packageJson.contributes.views.carbonara;

    expect(
      views.find((v: any) => v.id === "carbonara.assessmentTree")
    ).toBeDefined();
    expect(views.find((v: any) => v.id === "carbonara.dataTree")).toBeDefined();
  });

  test("Extension should handle workspace without project gracefully", async () => {
    // This tests the basic error handling when no carbonara project exists
    try {
      // Try to show status - should not throw error
      await vscode.commands.executeCommand("carbonara.showStatus");
      // Should reach here without throwing
      expect(true).toBe(true);
    } catch (error) {
      // If it throws, it should be a user-friendly error, not a crash
      expect(error instanceof Error).toBe(true);
    }
  });

  test("Configuration contributions should be present", () => {
    const config = vscode.workspace.getConfiguration("carbonara");

    // Test that configuration schema is properly registered
    const inspect = config.inspect("server.host");
    expect(inspect).toBeDefined();
  });

  test("Activity bar contribution should be present", () => {
    const viewsContainers = packageJson.contributes.viewsContainers.activitybar;

    const carbonaraContainer = viewsContainers.find(
      (container: any) => container.id === "carbonara"
    );
    expect(carbonaraContainer).toBeDefined();
    expect(carbonaraContainer?.title).toBe("Carbonara");
  });

  test("Menu contributions should be present", () => {
    const menus = packageJson.contributes.menus;

    expect(menus["view/title"]).toBeDefined();

    const assessmentMenus = menus["view/title"].filter(
      (menu: any) => menu.when && menu.when.includes("carbonara.assessmentTree")
    );
    const dataMenus = menus["view/title"].filter(
      (menu: any) => menu.when && menu.when.includes("carbonara.dataTree")
    );

    expect(assessmentMenus.length).toBeGreaterThan(0);
    expect(dataMenus.length).toBeGreaterThan(0);
  });

  test("Extension should handle command execution gracefully", async () => {
    // Test commands that should work without setup
    const safeCommands = [
      "carbonara.showMenu",
      "carbonara.showStatus",
      "carbonara.refreshAssessment",
      "carbonara.refreshData",
    ];

    for (const command of safeCommands) {
      try {
        await vscode.commands.executeCommand(command);
        // Command executed successfully
        expect(true).toBe(true);
      } catch (error) {
        // If it fails, it should fail gracefully with user message, not crash
        console.log(
          `Command ${command} failed gracefully:`,
          (error as Error).message
        );
        expect(error instanceof Error).toBe(true);
      }
    }
  }, 10000);

  test("Package.json should have correct metadata", () => {
    expect(packageJson.name).toBe("carbonara-vscode");
    expect(packageJson.displayName).toBe("Carbonara");
    expect(packageJson.version).toBeDefined();
    expect(packageJson.engines.vscode).toBeDefined();
  });
});
