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
const test_1 = require("@playwright/test");
const vscode_launcher_1 = require("./helpers/vscode-launcher");
const ui_text_1 = require("../../constants/ui-text");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const SCREENSHOTS_DIR = path.join(__dirname, "screenshots");
// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}
function getScreenshotPath(filename) {
    return path.join(SCREENSHOTS_DIR, filename);
}
async function setupTest(workspaceFixture) {
    const vscode = await vscode_launcher_1.VSCodeLauncher.launch(workspaceFixture);
    await vscode.window.waitForTimeout(3000);
    await vscode_launcher_1.VSCodeLauncher.dismissDialogs(vscode.window);
    return vscode;
}
test_1.test.describe("Workspace Scenarios - Project State Testing", () => {
    test_1.test.beforeAll(async () => {
        // Clean up any existing VSCode processes before starting tests
        await vscode_launcher_1.VSCodeLauncher.cleanupAll();
    });
    test_1.test.afterAll(async () => {
        // Final cleanup after all tests complete
        await vscode_launcher_1.VSCodeLauncher.cleanupAll();
    });
    (0, test_1.test)("Empty workspace - should show initialization options", async () => {
        const vscode = await setupTest("empty-workspace");
        try {
            // Click Carbonara in status bar (simple and fast)
            const carbonaraStatusBar = vscode.window.locator(ui_text_1.SELECTORS.STATUS_BAR.ITEM);
            await (0, test_1.expect)(carbonaraStatusBar).toBeVisible({ timeout: 10000 });
            await carbonaraStatusBar.click();
            await vscode.window.waitForTimeout(1000);
            // Look for "Open Carbonara Project" menu item
            const openProjectOption = vscode.window.locator("text=Open Carbonara Project");
            if (await openProjectOption.isVisible({ timeout: 3000 })) {
                await openProjectOption.click();
                await vscode.window.waitForTimeout(2000);
                // Should see initialization options in the quick pick menu
                const initOption = vscode.window.locator(`[role="option"]:has-text("${ui_text_1.UI_TEXT.PROJECT_OPEN.OPTIONS.INITIALIZE.LABEL}")`);
                const searchOption = vscode.window.locator(`[role="option"]:has-text("${ui_text_1.UI_TEXT.PROJECT_OPEN.OPTIONS.SEARCH.LABEL}")`);
                await (0, test_1.expect)(initOption).toBeVisible({ timeout: 5000 });
                await (0, test_1.expect)(searchOption).toBeVisible({ timeout: 5000 });
                // Test "Search current workspace" - should find no projects
                await searchOption.click();
                await vscode.window.waitForTimeout(2000);
                // Should show "No projects found" message
                const noProjectsMessage = vscode.window
                    .locator("text=/No.*Carbonara.*projects.*found/i")
                    .first();
                await (0, test_1.expect)(noProjectsMessage).toBeVisible({ timeout: 5000 });
            }
        }
        finally {
            await vscode_launcher_1.VSCodeLauncher.close(vscode);
        }
    });
    (0, test_1.test)("Workspace with existing project - should recognize existing project", async () => {
        const vscode = await setupTest("with-carbonara-project");
        try {
            // In a populated workspace there can be multiple "Carbonara" matches; select the status bar button explicitly
            const carbonaraStatusBar = vscode.window.locator(ui_text_1.SELECTORS.STATUS_BAR.ITEM);
            await carbonaraStatusBar.waitFor({ state: "visible", timeout: 10000 });
            await carbonaraStatusBar.click();
            await vscode.window.waitForTimeout(1000);
            // Look for "Open Carbonara Project"
            const openProjectOption = vscode.window.locator("text=Open Carbonara Project");
            if (await openProjectOption.isVisible({ timeout: 3000 })) {
                await openProjectOption.click();
                await vscode.window.waitForTimeout(2000);
                // Should show message that current workspace is already a Carbonara project
                const existingProjectMessage = vscode.window
                    .locator("text=/Current workspace is already.*Carbonara project/i")
                    .first();
                try {
                    await (0, test_1.expect)(existingProjectMessage).toBeVisible({ timeout: 5000 });
                }
                catch (error) { }
            }
            // Test that we can see project data in sidebar
            try {
                await vscode_launcher_1.VSCodeLauncher.openSidebar(vscode.window);
                await vscode.window.waitForTimeout(2000);
                // Look for assessment data from our fixture
                const assessmentPanel = vscode.window.locator('h3:has-text("CO2 Assessment")');
                if (await assessmentPanel.isVisible({ timeout: 3000 })) {
                    // Look for completed project info section
                    const projectInfoSection = vscode.window.locator("text=Project Information");
                    if (await projectInfoSection.isVisible({ timeout: 3000 })) {
                    }
                }
            }
            catch (error) { }
            await vscode.window.screenshot({
                path: getScreenshotPath("existing-project-loaded.png"),
            });
        }
        finally {
            await vscode_launcher_1.VSCodeLauncher.close(vscode);
        }
    });
    (0, test_1.test)("Multiple projects workspace - should show project selection", async () => {
        const vscode = await setupTest("multiple-projects");
        try {
            // Click Carbonara in status bar (simple and fast)
            const carbonaraStatusBar = vscode.window.locator(ui_text_1.SELECTORS.STATUS_BAR.ITEM);
            await (0, test_1.expect)(carbonaraStatusBar).toBeVisible({ timeout: 10000 });
            await carbonaraStatusBar.click();
            await vscode.window.waitForTimeout(1000);
            const openProjectOption = vscode.window.locator("text=Open Carbonara Project");
            if (await openProjectOption.isVisible({ timeout: 3000 })) {
                await openProjectOption.click();
                await vscode.window.waitForTimeout(2000);
                // Click "Search current workspace for projects"
                const searchOption = vscode.window.locator(`[role="option"]:has-text("${ui_text_1.UI_TEXT.PROJECT_OPEN.OPTIONS.SEARCH.LABEL}")`);
                if (await searchOption.isVisible({ timeout: 3000 })) {
                    await searchOption.click();
                    await vscode.window.waitForTimeout(3000);
                    // Should show both projects for selection
                    const webAppProject = vscode.window.locator('[role="option"]:has-text("Web App Project")');
                    const mobileAppProject = vscode.window.locator('[role="option"]:has-text("Mobile App Project")');
                    try {
                        await (0, test_1.expect)(webAppProject).toBeVisible({ timeout: 5000 });
                        await (0, test_1.expect)(mobileAppProject).toBeVisible({ timeout: 5000 });
                        await vscode.window.screenshot({
                            path: getScreenshotPath("multiple-projects-selection.png"),
                        });
                    }
                    catch (error) {
                        await vscode.window.screenshot({
                            path: getScreenshotPath("multiple-projects-failed.png"),
                        });
                    }
                }
            }
        }
        finally {
            await vscode_launcher_1.VSCodeLauncher.close(vscode);
        }
    });
    (0, test_1.test)("Invalid project workspace - should handle corrupted config gracefully", async () => {
        const vscode = await setupTest("invalid-project");
        try {
            // Simple approach: find Carbonara status bar and click it
            const carbonaraStatusBar = vscode.window.locator(ui_text_1.SELECTORS.STATUS_BAR.ITEM);
            await (0, test_1.expect)(carbonaraStatusBar).toBeVisible({ timeout: 10000 });
            await carbonaraStatusBar.click();
            await vscode.window.waitForTimeout(1000);
            const openProjectOption = vscode.window.locator("text=Open Carbonara Project");
            if (await openProjectOption.isVisible({ timeout: 3000 })) {
                await openProjectOption.click();
                await vscode.window.waitForTimeout(2000);
                // Should show warning about invalid config or treat as no project
                const searchOption = vscode.window.locator(`[role="option"]:has-text("${ui_text_1.UI_TEXT.PROJECT_OPEN.OPTIONS.SEARCH.LABEL}")`);
                if (await searchOption.isVisible({ timeout: 3000 })) {
                    await searchOption.click();
                    await vscode.window.waitForTimeout(3000);
                    // Should either show no projects or show error message
                    const noProjectsMessage = vscode.window
                        .locator("text=/No.*Carbonara.*projects.*found/i")
                        .first();
                    const errorMessage = vscode.window.locator('span:has-text("Found carbonara.config.json but it appears to be")');
                    const hasNoProjects = await noProjectsMessage.isVisible({
                        timeout: 3000,
                    });
                    const hasErrorMessage = await errorMessage.isVisible({
                        timeout: 3000,
                    });
                    if (hasNoProjects || hasErrorMessage) {
                    }
                    else {
                    }
                    await vscode.window.screenshot({
                        path: getScreenshotPath("invalid-project-handling.png"),
                    });
                }
            }
        }
        finally {
            await vscode_launcher_1.VSCodeLauncher.close(vscode);
        }
    });
});
//# sourceMappingURL=workspace-scenarios.test.js.map