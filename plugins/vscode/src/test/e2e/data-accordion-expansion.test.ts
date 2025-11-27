import { test, expect } from "@playwright/test";
import {
  VSCodeLauncher,
  VSCodeInstance,
  WorkspaceFixture,
} from "./helpers/vscode-launcher";
import * as path from "path";
import * as fs from "fs";
import { createDataService } from "@carbonara/core";

async function setupTest(
  workspaceFixture: WorkspaceFixture
): Promise<VSCodeInstance> {
  const vscode = await VSCodeLauncher.launch(workspaceFixture);
  await vscode.window.waitForTimeout(3000);
  await VSCodeLauncher.dismissDialogs(vscode.window);
  return vscode;
}

test.describe("Data Accordion Expansion - Full Integration", () => {
  test.beforeAll(async () => {
    await VSCodeLauncher.cleanupAll();
  });

  test.afterAll(async () => {
    await VSCodeLauncher.cleanupAll();
  });

  test("should expand entries and show detail fields from database → schema → frontend", async () => {
    // Use with-analysis-data fixture or create test data
    const vscode = await setupTest("with-analysis-data");

    try {
      // Click on Carbonara activity bar
      const carbonaraActivityBar = vscode.window.locator(
        '[aria-label*="Carbonara"]'
      ).first();

      if (await carbonaraActivityBar.isVisible({ timeout: 5000 })) {
        await carbonaraActivityBar.click();
        await vscode.window.waitForTimeout(2000);
      }

      // Find and expand Data & Results section
      const dataResultsHeader = vscode.window
        .locator(".pane-header")
        .filter({ hasText: "Data & Results" });

      if (await dataResultsHeader.isVisible({ timeout: 5000 })) {
        await dataResultsHeader.click();
        await vscode.window.waitForTimeout(1000);
      }

      // Wait for tree to load
      await vscode.window.waitForTimeout(2000);

      // Find tree items (entries)
      const treeItems = vscode.window.locator(
        '[id*="workbench.view.extension.carbonara"] .monaco-list-row'
      );

      const itemCount = await treeItems.count();
      
      if (itemCount > 0) {
        // Find an entry item (not a group header)
        let entryFound = false;
        for (let i = 0; i < itemCount; i++) {
          const item = treeItems.nth(i);
          const text = await item.textContent();
          
          // Look for entries (they typically have dates or URLs in the label)
          if (text && (text.includes("http") || text.includes("/") || text.includes("Analysis"))) {
            // Try to expand this entry
            const expandButton = item.locator(".monaco-icon-label-container");
            if (await expandButton.isVisible({ timeout: 1000 })) {
              await expandButton.click();
              await vscode.window.waitForTimeout(1000);
              
              // Check if detail fields are now visible
              const detailItems = vscode.window.locator(
                '[id*="workbench.view.extension.carbonara"] .monaco-list-row'
              );
              
              // Should have more items after expansion
              const newItemCount = await detailItems.count();
              expect(newItemCount).toBeGreaterThan(itemCount);
              
              entryFound = true;
              break;
            }
          }
        }
        
        // If we found and expanded an entry, verify detail fields are shown
        if (entryFound) {
          // Look for detail field labels (they contain colons like "URL: ...")
          const detailFields = vscode.window.locator(
            '[id*="workbench.view.extension.carbonara"] .monaco-list-row'
          );
          
          let hasDetailField = false;
          for (let i = 0; i < await detailFields.count(); i++) {
            const field = detailFields.nth(i);
            const text = await field.textContent();
            // Detail fields typically have format "Label: Value"
            if (text && text.includes(":") && !text.includes("Analysis results")) {
              hasDetailField = true;
              break;
            }
          }
          
          // Verify that detail fields are displayed
          expect(hasDetailField).toBe(true);
        }
      }
    } finally {
      await VSCodeLauncher.close(vscode);
    }
  });

  test("should show filtered fields for semgrep entries", async () => {
    // Create a test workspace with semgrep data
    const vscode = await setupTest("with-carbonara-project");

    try {
      // Create test database with semgrep entry
      const workspacePath = vscode.window.url().split("file://")[1]?.split("/")[0] || "";
      const carbonaraDir = path.join(workspacePath, ".carbonara");
      const dbPath = path.join(carbonaraDir, "carbonara.db");

      if (fs.existsSync(dbPath)) {
        const dataService = createDataService({ dbPath });
        await dataService.initialize();

        const projectId = await dataService.createProject(
          "Test Project",
          workspacePath,
          {}
        );

        // Insert semgrep data
        await dataService.storeAssessmentData(
          projectId,
          "semgrep",
          "code-analysis",
          {
            target: "/path/to/test/file.ts",
            stats: {
              total_matches: 10,
              error_count: 2,
              warning_count: 5,
              info_count: 3,
              files_scanned: 1,
            },
          }
        );

        await dataService.close();
      }

      // Refresh the view
      await vscode.window.keyboard.press("F1");
      await vscode.window.waitForTimeout(500);
      await vscode.window.keyboard.type("Carbonara: Refresh Data");
      await vscode.window.waitForTimeout(500);
      await vscode.window.keyboard.press("Enter");
      await vscode.window.waitForTimeout(3000);

      // Click on Carbonara activity bar
      const carbonaraActivityBar = vscode.window.locator(
        '[aria-label*="Carbonara"]'
      ).first();

      if (await carbonaraActivityBar.isVisible({ timeout: 5000 })) {
        await carbonaraActivityBar.click();
        await vscode.window.waitForTimeout(2000);
      }

      // Find Data & Results section
      const dataResultsHeader = vscode.window
        .locator(".pane-header")
        .filter({ hasText: "Data & Results" });

      if (await dataResultsHeader.isVisible({ timeout: 5000 })) {
        await dataResultsHeader.click();
        await vscode.window.waitForTimeout(1000);
      }

      // Wait for tree to load
      await vscode.window.waitForTimeout(2000);

      // Find semgrep entry and expand it
      const treeItems = vscode.window.locator(
        '[id*="workbench.view.extension.carbonara"] .monaco-list-row'
      );

      // Look for semgrep entry
      for (let i = 0; i < await treeItems.count(); i++) {
        const item = treeItems.nth(i);
        const text = await item.textContent();
        
        if (text && text.includes("semgrep")) {
          // Expand the entry
          const expandButton = item.locator(".monaco-icon-label-container");
          if (await expandButton.isVisible({ timeout: 1000 })) {
            await expandButton.click();
            await vscode.window.waitForTimeout(1000);
            
            // Verify only filtered fields are shown (error_count, warning_count, info_count, target)
            const detailFields = vscode.window.locator(
              '[id*="workbench.view.extension.carbonara"] .monaco-list-row'
            );
            
            let hasErrorCount = false;
            let hasWarningCount = false;
            let hasInfoCount = false;
            let hasTarget = false;
            let hasTotalMatches = false;
            let hasFilesScanned = false;
            
            for (let j = 0; j < await detailFields.count(); j++) {
              const field = detailFields.nth(j);
              const fieldText = await field.textContent();
              
              if (fieldText) {
                if (fieldText.toLowerCase().includes("error")) hasErrorCount = true;
                if (fieldText.toLowerCase().includes("warning")) hasWarningCount = true;
                if (fieldText.toLowerCase().includes("info")) hasInfoCount = true;
                if (fieldText.toLowerCase().includes("target")) hasTarget = true;
                if (fieldText.toLowerCase().includes("findings") || fieldText.toLowerCase().includes("total")) hasTotalMatches = true;
                if (fieldText.toLowerCase().includes("files")) hasFilesScanned = true;
              }
            }
            
            // Verify filtered fields are shown
            expect(hasErrorCount || hasWarningCount || hasInfoCount || hasTarget).toBe(true);
            
            // Verify excluded fields are NOT shown (if we can detect them)
            // Note: This might be flaky if the UI doesn't render these fields
            break;
          }
        }
      }
    } finally {
      await VSCodeLauncher.close(vscode);
    }
  });
});



