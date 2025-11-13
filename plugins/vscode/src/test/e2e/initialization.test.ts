import { test, expect } from "@playwright/test";
import {
  VSCodeLauncher,
  VSCodeInstance,
  WorkspaceFixture,
} from "./helpers/vscode-launcher";
import * as path from "path";
import * as fs from "fs";

const SCREENSHOTS_DIR = path.join(__dirname, "screenshots");

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function getScreenshotPath(filename: string): string {
  return path.join(SCREENSHOTS_DIR, filename);
}

async function setupTest(
  workspaceFixture: WorkspaceFixture
): Promise<VSCodeInstance> {
  const vscode = await VSCodeLauncher.launch(workspaceFixture);
  await vscode.window.waitForTimeout(3000);
  await VSCodeLauncher.dismissDialogs(vscode.window);
  return vscode;
}

test.describe("Carbonara Initialization Flow", () => {
  test.beforeAll(async () => {
    await VSCodeLauncher.cleanupAll();
  });

  test.afterAll(async () => {
    await VSCodeLauncher.cleanupAll();
  });

  test("Uninitialized workspace - should show welcome section", async () => {
    const vscode = await setupTest("empty-workspace");

    try {
      // Click on the Carbonara activity bar icon to open the sidebar
      const carbonaraActivityBar = vscode.window.locator(
        '[aria-label*="Carbonara"]'
      );

      if (await carbonaraActivityBar.isVisible({ timeout: 5000 })) {
        await carbonaraActivityBar.click();
        await vscode.window.waitForTimeout(2000);
      }

      // Look for welcome content in the sidebar
      // The welcome section (with no title) should show the initialization message
      const welcomeMessage = vscode.window.locator(
        "text=/Carbonara has not yet been initialised/i"
      );

      await expect(welcomeMessage).toBeVisible({
        timeout: 10000,
      });

      // Check for the initialization button
      const initButton = vscode.window.locator(
        'a[role="button"]:has-text("Initialise Carbonara")'
      );

      await expect(initButton).toBeVisible({ timeout: 5000 });

      // Verify other sections are collapsed by default
      // (they should show description text when expanded)

      // Take screenshot of welcome view
      await vscode.window.screenshot({
        path: getScreenshotPath("welcome-section-uninitialized.png"),
      });
    } finally {
      await VSCodeLauncher.close(vscode);
    }
  });

  test("Initialize Carbonara from welcome view", async () => {
    const vscode = await setupTest("empty-workspace");

    try {
      // Click on Carbonara activity bar
      const carbonaraActivityBar = vscode.window.locator(
        '[aria-label*="Carbonara"]'
      );

      if (await carbonaraActivityBar.isVisible({ timeout: 5000 })) {
        await carbonaraActivityBar.click();
        await vscode.window.waitForTimeout(2000);
      }

      // Click the initialization button
      const initButton = vscode.window.locator(
        'a[role="button"]:has-text("Initialise Carbonara")'
      );

      await expect(initButton).toBeVisible({ timeout: 10000 });
      await initButton.click();
      await vscode.window.waitForTimeout(2000);

      // Should show project name input
      const projectNameInput = vscode.window.locator(
        'input[aria-label*="name" i], input[placeholder*="name" i]'
      ).first();

      await expect(projectNameInput).toBeVisible({ timeout: 10000 });

      // Enter project name
      await projectNameInput.fill("Test Project");
      await vscode.window.keyboard.press("Enter");
      await vscode.window.waitForTimeout(1000);

      // Should show project type selection
      const webAppOption = vscode.window.locator(
        '[role="option"]:has-text("Web Application")'
      );

      await expect(webAppOption).toBeVisible({ timeout: 10000 });
      await webAppOption.click();
      await vscode.window.waitForTimeout(3000);

      // After initialization, check for success message
      const successMessage = vscode.window.locator(
        "text=/initialized successfully/i"
      );

      await expect(successMessage).toBeVisible({ timeout: 10000 });

      // Take screenshot after initialization
      await vscode.window.screenshot({
        path: getScreenshotPath("after-initialization.png"),
      });

      // Give it some time for the context and tree to refresh
      await vscode.window.waitForTimeout(3000);

      // Verify that the welcome section has disappeared
      const welcomeSection = vscode.window.locator(
        "text=/Carbonara has not yet been initialised/i"
      );
      await expect(welcomeSection).not.toBeVisible({ timeout: 5000 });

      // Verify that real content is shown in assessment tree
      const assessmentSection = vscode.window.locator(
        "text=/Project Information/i"
      );

      // The assessment tree should now show actual sections
      await expect(assessmentSection).toBeVisible({ timeout: 10000 });
    } finally {
      await VSCodeLauncher.close(vscode);
    }
  });

  test("Data & Results view shows welcome message when uninitialized", async () => {
    const vscode = await setupTest("empty-workspace");

    try {
      // Click on Carbonara activity bar
      const carbonaraActivityBar = vscode.window.locator(
        '[aria-label*="Carbonara"]'
      );

      if (await carbonaraActivityBar.isVisible({ timeout: 5000 })) {
        await carbonaraActivityBar.click();
        await vscode.window.waitForTimeout(2000);
      }

      // Look for the Data & Results section
      const dataResultsHeader = vscode.window.locator(
        'h3:has-text("Data & Results"), [role="heading"]:has-text("Data & Results")'
      );

      if (await dataResultsHeader.isVisible({ timeout: 5000 })) {
        // Expand if collapsed
        await dataResultsHeader.click();
        await vscode.window.waitForTimeout(1000);
      }

      // Check for welcome message
      const welcomeMessage = vscode.window.locator(
        "text=/Initialise Carbonara to access analysis results/i"
      );

      await expect(welcomeMessage).toBeVisible({ timeout: 10000 });
    } finally {
      await VSCodeLauncher.close(vscode);
    }
  });

  test("Analysis Tools view shows welcome message when uninitialized", async () => {
    const vscode = await setupTest("empty-workspace");

    try {
      // Click on Carbonara activity bar
      const carbonaraActivityBar = vscode.window.locator(
        '[aria-label*="Carbonara"]'
      );

      if (await carbonaraActivityBar.isVisible({ timeout: 5000 })) {
        await carbonaraActivityBar.click();
        await vscode.window.waitForTimeout(2000);
      }

      // Look for the Analysis Tools section
      const toolsHeader = vscode.window.locator(
        'h3:has-text("Analysis Tools"), [role="heading"]:has-text("Analysis Tools")'
      );

      if (await toolsHeader.isVisible({ timeout: 5000 })) {
        // Expand if collapsed
        await toolsHeader.click();
        await vscode.window.waitForTimeout(1000);
      }

      // Check for welcome message
      const welcomeMessage = vscode.window.locator(
        "text=/Initialise Carbonara to access analysis tools/i"
      );

      await expect(welcomeMessage).toBeVisible({ timeout: 10000 });
    } finally {
      await VSCodeLauncher.close(vscode);
    }
  });

  test("All tree views refresh after initialization", async () => {
    const vscode = await setupTest("empty-workspace");

    try {
      // Open Carbonara sidebar
      const carbonaraActivityBar = vscode.window.locator(
        '[aria-label*="Carbonara"]'
      );

      if (await carbonaraActivityBar.isVisible({ timeout: 5000 })) {
        await carbonaraActivityBar.click();
        await vscode.window.waitForTimeout(2000);
      }

      // Initialize Carbonara
      const initButton = vscode.window.locator(
        'a[role="button"]:has-text("Initialise Carbonara")'
      );

      if (await initButton.isVisible({ timeout: 5000 })) {
        await initButton.click();
        await vscode.window.waitForTimeout(2000);

        // Fill in project details quickly
        const projectNameInput = vscode.window.locator("input").first();
        await projectNameInput.fill("Test Project");
        await vscode.window.keyboard.press("Enter");
        await vscode.window.waitForTimeout(1000);

        const webAppOption = vscode.window.locator(
          '[role="option"]:has-text("Web Application")'
        );
        await webAppOption.click();
        await vscode.window.waitForTimeout(3000);
      }

      // Verify all three tree views show real content (not welcome views)

      // 1. Assessment tree should show sections
      const assessmentContent = vscode.window.locator(
        "text=/Project Information|Infrastructure|Development/i"
      );
      await expect(assessmentContent.first()).toBeVisible({ timeout: 10000 });

      // 2. Data & Results should NOT show the welcome message anymore
      const dataWelcomeMessage = vscode.window.locator(
        "text=/Initialise Carbonara to access analysis results/i"
      );
      await expect(dataWelcomeMessage).not.toBeVisible({ timeout: 5000 });

      // 3. Analysis Tools should show tools list
      const toolsWelcomeMessage = vscode.window.locator(
        "text=/Initialise Carbonara to access analysis tools/i"
      );
      await expect(toolsWelcomeMessage).not.toBeVisible({ timeout: 5000 });

      // Take final screenshot
      await vscode.window.screenshot({
        path: getScreenshotPath("all-views-refreshed.png"),
      });
    } finally {
      await VSCodeLauncher.close(vscode);
    }
  });
});
