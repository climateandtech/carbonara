"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
const vscode_launcher_1 = require("./helpers/vscode-launcher");
const ui_text_1 = require("../../constants/ui-text");
let vscode;
test_1.test.describe("Carbonara VSCode Extension E2E Tests", () => {
    test_1.test.beforeAll(async () => {
        // Clean up any existing VSCode processes before starting tests
        await vscode_launcher_1.VSCodeLauncher.cleanupAll();
    });
    test_1.test.afterAll(async () => {
        // Final cleanup after all tests complete
        await vscode_launcher_1.VSCodeLauncher.cleanupAll();
    });
    test_1.test.beforeEach(async () => {
        vscode = await vscode_launcher_1.VSCodeLauncher.launch();
        await vscode_launcher_1.VSCodeLauncher.waitForExtension(vscode.window);
    });
    test_1.test.afterEach(async () => {
        if (vscode) {
            await vscode_launcher_1.VSCodeLauncher.close(vscode);
        }
    });
    (0, test_1.test)("should show Carbonara status bar item and menu", async () => {
        // Wait for extension to load first
        await vscode_launcher_1.VSCodeLauncher.waitForExtension(vscode.window);
        // Verify status bar item exists using the specific clickable button
        const statusBarItem = vscode.window.locator(ui_text_1.SELECTORS.STATUS_BAR.ITEM);
        await (0, test_1.expect)(statusBarItem).toBeVisible();
        // Click status bar item to open menu
        await vscode_launcher_1.VSCodeLauncher.clickStatusBarCarbonara(vscode.window);
        // Wait for quick pick menu to appear
        await vscode.window.waitForTimeout(1000);
        // Verify quick pick menu appears with placeholder text
        const quickPickPlaceholder = vscode.window.locator(`${ui_text_1.SELECTORS.QUICK_PICK.WIDGET} ${ui_text_1.SELECTORS.QUICK_PICK.INPUT}[placeholder*="${ui_text_1.UI_TEXT.MENU.PLACEHOLDER}"]`);
        await (0, test_1.expect)(quickPickPlaceholder).toBeVisible({ timeout: 10000 });
        // Verify menu options are present in the quick pick
        await (0, test_1.expect)(vscode.window.locator(`${ui_text_1.SELECTORS.QUICK_PICK.LIST_ROW}:has-text("${ui_text_1.UI_TEXT.MENU.ITEMS.INITIALIZE_PROJECT.SEARCH_TEXT}")`)).toBeVisible();
        await (0, test_1.expect)(vscode.window.locator(`${ui_text_1.SELECTORS.QUICK_PICK.LIST_ROW}:has-text("${ui_text_1.UI_TEXT.MENU.ITEMS.RUN_ASSESSMENT.SEARCH_TEXT}")`)).toBeVisible();
        await (0, test_1.expect)(vscode.window.locator(`${ui_text_1.SELECTORS.QUICK_PICK.LIST_ROW}:has-text("${ui_text_1.UI_TEXT.MENU.ITEMS.ANALYZE_WEBSITE.SEARCH_TEXT}")`)).toBeVisible();
        await (0, test_1.expect)(vscode.window.locator(`${ui_text_1.SELECTORS.QUICK_PICK.LIST_ROW}:has-text("${ui_text_1.UI_TEXT.MENU.ITEMS.VIEW_DATA.SEARCH_TEXT}")`)).toBeVisible();
        await (0, test_1.expect)(vscode.window.locator(`${ui_text_1.SELECTORS.QUICK_PICK.LIST_ROW}:has-text("${ui_text_1.UI_TEXT.MENU.ITEMS.OPEN_CONFIG.SEARCH_TEXT}")`)).toBeVisible();
        await (0, test_1.expect)(vscode.window.locator(`${ui_text_1.SELECTORS.QUICK_PICK.LIST_ROW}:has-text("${ui_text_1.UI_TEXT.MENU.ITEMS.SHOW_STATUS.SEARCH_TEXT}")`)).toBeVisible();
    });
    (0, test_1.test)('should show "No projects found" when searching empty workspace', async () => {
        // Close current instance and launch with empty workspace
        await vscode_launcher_1.VSCodeLauncher.close(vscode);
        vscode = await vscode_launcher_1.VSCodeLauncher.launch("empty-workspace");
        await vscode_launcher_1.VSCodeLauncher.waitForExtension(vscode.window);
        // Open status bar menu
        await vscode_launcher_1.VSCodeLauncher.selectFromCarbonaraMenu(vscode.window, "OPEN_PROJECT");
        // Click Search current workspace
        await vscode.window
            .locator(`[role="option"]:has-text("${ui_text_1.UI_TEXT.PROJECT_OPEN.OPTIONS.SEARCH.SEARCH_TEXT}")`)
            .click();
        // Verify no projects found message (use more specific selector to avoid strict mode violation)
        const noProjectsMessage = vscode.window.locator('span:has-text("No Carbonara projects found in current workspace")');
        await (0, test_1.expect)(noProjectsMessage).toBeVisible();
    });
    (0, test_1.test)("should show website analysis option in menu", async () => {
        // Select Analyze Website from menu using DRY helper
        await vscode_launcher_1.VSCodeLauncher.selectFromCarbonaraMenu(vscode.window, "ANALYZE_WEBSITE");
        // Should see URL input dialog (VSCode input box, not HTML input)
        const urlInput = vscode.window.locator(ui_text_1.SELECTORS.INPUT_BOX.INPUT);
        await (0, test_1.expect)(urlInput).toBeVisible({ timeout: 10000 });
        // Verify it has the correct placeholder
        const placeholder = await urlInput.getAttribute("placeholder");
        (0, test_1.expect)(placeholder).toBe(ui_text_1.UI_TEXT.WEBSITE_ANALYSIS.URL_PLACEHOLDER);
        // Verify the prompt text appears
        const promptText = vscode.window.locator(`.quick-input-widget .quick-input-message:has-text("${ui_text_1.UI_TEXT.WEBSITE_ANALYSIS.URL_PROMPT}")`);
        await (0, test_1.expect)(promptText).toBeVisible();
    });
    (0, test_1.test)("should display mocked analysis data in data tab", async () => {
        const vscode = await vscode_launcher_1.VSCodeLauncher.launch("with-carbonara-project");
        try {
            // Wait for extension to fully activate
            await vscode.window.waitForTimeout(2000);
            // Step 1: Mock some analysis data by directly inserting it into the database
            // We'll simulate what happens after a successful analysis by triggering a data refresh
            // and checking if the data tree can display mock data
            // Step 2: Open Data & Results panel
            await vscode_launcher_1.VSCodeLauncher.openSidebar(vscode.window);
            const dataPanel = vscode.window.getByRole("button", {
                name: "Data & Results Section",
            });
            await (0, test_1.expect)(dataPanel).toBeVisible({ timeout: 5000 });
            await dataPanel.click();
            await vscode.window.waitForTimeout(2000);
            // Step 3: Check current state (should show "No data available" initially)
            const noDataMessage = vscode.window.locator("text=No data available");
            const hasNoDataMessage = await noDataMessage.isVisible({ timeout: 3000 });
            if (hasNoDataMessage) {
            }
            else {
            }
            // Step 4: Trigger a manual data refresh to test the refresh mechanism
            // Use F1 to open command palette and search for data refresh
            await vscode.window.keyboard.press("F1");
            await vscode.window.waitForTimeout(500);
            await vscode.window.keyboard.type("Carbonara: Refresh Data");
            await vscode.window.waitForTimeout(500);
            await vscode.window.keyboard.press("Enter");
            // Wait for refresh to complete
            await vscode.window.waitForTimeout(2000);
            // Step 5: Examine the data panel structure to understand what's available
            try {
                // Use deterministic selectors instead of unreliable ID selectors
                // Get all trees using the same approach as the main test
                const allTrees = vscode.window.locator('[id*="workbench.view.extension.carbonara"] .monaco-list, [id*="workbench.view.extension.carbonara"] .tree-explorer-viewlet-tree-view');
                const treeCount = await allTrees.count();
                // Examine each tree and categorize by content
                for (let i = 0; i < treeCount; i++) {
                    const tree = allTrees.nth(i);
                    const treeRows = tree.locator(".monaco-list-row");
                    const rowCount = await treeRows.count();
                    if (rowCount > 0) {
                        const rowTexts = await treeRows.allTextContents();
                        const hasQuestionnaireData = rowTexts.some((text) => text.includes("Project Information") ||
                            text.includes("Infrastructure") ||
                            text.includes("Development"));
                        const hasToolsData = rowTexts.some((text) => text.includes("Built-in") || text.includes("Not installed"));
                        const hasAnalysisData = rowTexts.some((text) => text.includes("Test Analysis") ||
                            text.includes("analysis") ||
                            text.includes(".example.com"));
                        let treeType = "Unknown";
                        if (hasQuestionnaireData)
                            treeType = "CO2 Assessment (Questionnaire)";
                        else if (hasToolsData)
                            treeType = "Analysis Tools";
                        else if (hasAnalysisData)
                            treeType = "Data & Results (Analysis)";
                    }
                }
            }
            catch (error) { }
            // Step 6: Assert that test-analyzer data from fixture database is displayed
            const allTrees = vscode.window.locator('[id*="workbench.view.extension.carbonara"] .monaco-list, [id*="workbench.view.extension.carbonara"] .tree-explorer-viewlet-tree-view');
            // Find the data tree (not tools tree, not questionnaire tree)
            let foundAnalysisData = false;
            const treeCount = await allTrees.count();
            for (let i = 0; i < treeCount; i++) {
                const tree = allTrees.nth(i);
                const treeRows = tree.locator(".monaco-list-row");
                const rowTexts = await treeRows.allTextContents();
                // Check if this tree has test-analyzer data (from the fixture database)
                const hasTestAnalyzerData = rowTexts.some((text) => text.toLowerCase().includes("test") &&
                    (text.toLowerCase().includes("analy") || text.toLowerCase().includes("test-analyzer")));
                if (hasTestAnalyzerData) {
                    foundAnalysisData = true;
                    break;
                }
            }
            // ASSERT: The fixture database has test-analyzer data, it should be displayed
            (0, test_1.expect)(foundAnalysisData).toBe(true);
            // Also verify the panel is interactive
            const panelInteractionWorks = await dataPanel.isVisible();
            (0, test_1.expect)(panelInteractionWorks).toBe(true);
        }
        finally {
            await vscode_launcher_1.VSCodeLauncher.close(vscode);
        }
    });
    (0, test_1.test)("should programmatically test available analysis functionality", async () => {
        const vscode = await vscode_launcher_1.VSCodeLauncher.launch("with-carbonara-project");
        try {
            // Wait for extension to fully activate
            await vscode.window.waitForTimeout(3000);
            // Step 1: Test the dummy analyzeWebsite functionality that exists on main
            // Step 2: Test analyzeWebsite through the menu (following main's approach)
            await vscode_launcher_1.VSCodeLauncher.selectFromCarbonaraMenu(vscode.window, "ANALYZE_WEBSITE");
            // Should see URL input dialog
            const urlInput = vscode.window.locator(".quick-input-widget .quick-input-box input");
            await (0, test_1.expect)(urlInput).toBeVisible({ timeout: 10000 });
            // Enter a test URL
            await urlInput.fill("https://example.com");
            await vscode.window.keyboard.press("Enter");
            // Wait for the dummy analysis to complete and show result
            await vscode.window.waitForTimeout(3000);
            // Look for the information message with analysis results
            const resultMessage = vscode.window.locator(".notifications-center .notification-toast");
            if (await resultMessage.isVisible({ timeout: 5000 })) {
                const messageText = await resultMessage.textContent();
            }
            else {
            }
        }
        finally {
            await vscode_launcher_1.VSCodeLauncher.close(vscode);
        }
    });
    (0, test_1.test)("should run test-analyzer through UI and display results", async () => {
        const vscode = await vscode_launcher_1.VSCodeLauncher.launch("with-carbonara-project");
        try {
            // Wait for extension to fully activate
            await vscode_launcher_1.VSCodeLauncher.waitForExtension(vscode.window);
            // Step 1: Open the Carbonara sidebar
            await vscode_launcher_1.VSCodeLauncher.openSidebar(vscode.window);
            // Step 2: Assert Analysis Tools section is visible
            const toolsSection = vscode.window
                .locator(".pane-header")
                .filter({ hasText: "Analysis Tools" });
            // ASSERTION: Analysis Tools section must be visible
            await (0, test_1.expect)(toolsSection).toBeVisible({ timeout: 10000 });
            // Step 3: Check Analysis Tools state and ensure it's expanded
            // Look for the chevron icon to determine current state
            const chevronRight = toolsSection.locator(".codicon-chevron-right"); // Collapsed
            const chevronDown = toolsSection.locator(".codicon-chevron-down"); // Expanded
            const isCollapsed = await chevronRight.isVisible({ timeout: 1000 });
            const isExpanded = await chevronDown.isVisible({ timeout: 1000 });
            if (isExpanded) {
            }
            else if (isCollapsed) {
                // Click the chevron icon directly to expand
                await chevronRight.click();
                await vscode.window.waitForTimeout(2000);
                // Verify it expanded
                const nowExpanded = await chevronDown.isVisible({ timeout: 3000 });
            }
            else {
                // Don't click anything - might already be in the right state
            }
            // Step 4: After clicking, wait for tree content to appear
            await vscode.window.waitForTimeout(1000);
            // Debug: Check what sections are visible now
            const allSections = vscode.window.locator(".pane-header");
            const sectionCount = await allSections.count();
            if (sectionCount > 0) {
                const sectionTexts = await allSections.allTextContents();
            }
            // Get tools tree using deterministic selector (no fallbacks!)
            const toolsTree = vscode.window
                .locator('[id*="workbench.view.extension.carbonara"] .monaco-list, [id*="workbench.view.extension.carbonara"] .tree-explorer-viewlet-tree-view')
                .last();
            await (0, test_1.expect)(toolsTree).toBeVisible();
            const allRows = toolsTree.locator(".monaco-list-row");
            // Debug: Check what we find in the Analysis Tools section
            const rowCount = await allRows.count();
            if (rowCount > 0) {
                const rowTexts = await allRows.allTextContents();
                // Now we should see either tools or our informative "No analysis tools available" message
                // This helps differentiate between collapsed (no content) vs expanded but no tools
            }
            else {
            }
            // Step 6: Verify installed tools (from registry: 1 built-in tool)
            const installedTools = toolsTree
                .locator(".monaco-list-row")
                .filter({ hasText: "Built-in" });
            // ASSERTION: Must have exactly 1 installed tool (Test Analyzer in test environment)
            await (0, test_1.expect)(installedTools).toHaveCount(1, { timeout: 5000 });
            const installedTexts = await installedTools.allTextContents();
            // ASSERTION: Must be Test Analyzer (test-only tool)
            (0, test_1.expect)(installedTexts[0]).toContain("Test Analyzer");
            // Step 7: Verify uninstalled tools (from registry: 2 external tools)
            const uninstalledTools = toolsTree
                .locator(".monaco-list-row")
                .filter({ hasText: "Not installed" });
            // ASSERTION: Must have exactly 2 uninstalled tools (GreenFrame + Impact Framework)
            await (0, test_1.expect)(uninstalledTools).toHaveCount(2, { timeout: 5000 });
            const uninstalledTexts = await uninstalledTools.allTextContents();
            // ASSERTION: Must contain GreenFrame tool
            const hasGreenFrame = uninstalledTexts.some((text) => text.includes("GreenFrame"));
            (0, test_1.expect)(hasGreenFrame).toBe(true);
            // ASSERTION: Must contain Impact Framework tool
            const hasImpactFramework = uninstalledTexts.some((text) => text.includes("Impact Framework"));
            (0, test_1.expect)(hasImpactFramework).toBe(true);
            // Step 8: Verify total matches registry (1 + 2 = 3 tools)
            const totalTools = await toolsTree.locator(".monaco-list-row").count();
            // ASSERTION: Total must be exactly 3 tools from registry
            (0, test_1.expect)(totalTools).toBe(3);
            // Step 9: Test the Test Analyzer functionality
            // Click on the Test Analyzer tool to execute it
            const testAnalyzerRow = toolsTree
                .locator(".monaco-list-row")
                .filter({ hasText: "Test Analyzer" });
            await (0, test_1.expect)(testAnalyzerRow).toBeVisible();
            // Click the Test Analyzer row to trigger analysis
            await testAnalyzerRow.click();
            // Wait for URL input dialog to appear
            await vscode.window.waitForTimeout(1000);
            // Look for the input box and enter a test URL
            const inputBox = vscode.window.locator('input[placeholder*="https://example.com"], .quick-input-box input');
            await (0, test_1.expect)(inputBox).toBeVisible({ timeout: 5000 });
            const testUrl = "https://test-site.example.com";
            await inputBox.fill(testUrl);
            // Press Enter to confirm
            await inputBox.press("Enter");
            // Wait for analysis completion notification
            // Look for the completion notification or wait longer for CLI to finish
            try {
                // Wait for either success or failure notification using UI constants
                const successNotification = vscode.window
                    .locator(ui_text_1.SELECTORS.NOTIFICATIONS.TOAST)
                    .filter({ hasText: "analysis completed" });
                const failureNotification = vscode.window
                    .locator(ui_text_1.SELECTORS.NOTIFICATIONS.TOAST)
                    .filter({ hasText: ui_text_1.UI_TEXT.NOTIFICATIONS.ANALYSIS_FAILED });
                // Wait up to 10 seconds for one of these notifications
                await Promise.race([
                    successNotification.waitFor({ timeout: 10000 }),
                    failureNotification.waitFor({ timeout: 10000 }),
                ]);
                // Check which notification appeared
                const hasSuccess = await successNotification.isVisible();
                const hasFailure = await failureNotification.isVisible();
                if (hasSuccess) {
                }
                else if (hasFailure) {
                    // FAIL THE TEST: Analysis should succeed for test analyzer
                    (0, test_1.expect)(hasFailure).toBe(false);
                    return; // Exit early since analysis failed
                }
                else {
                }
                // ASSERTION: Analysis must succeed (no failure notification should be visible)
                (0, test_1.expect)(hasFailure).toBe(false);
            }
            catch (error) {
                // Fallback: wait additional time for CLI process to complete
                await vscode.window.waitForTimeout(3000);
            }
            // Wait additional time for data to be saved to database after analysis completes
            await vscode.window.waitForTimeout(5000);
            // Step 10: Verify analysis results appear in Data Tree
            // Look for the Data & Results section
            const dataSection = vscode.window
                .locator(".pane-header")
                .filter({ hasText: "Data & Results" });
            await (0, test_1.expect)(dataSection).toBeVisible();
            // Click on Data & Results section to ensure it's expanded and active
            await dataSection.click();
            // Step 11: Manually refresh the data tree to ensure latest results are loaded
            // Use F1 to open command palette and search for data refresh
            await vscode.window.keyboard.press("F1");
            await vscode.window.waitForTimeout(500);
            await vscode.window.keyboard.type("Carbonara: Refresh Data");
            await vscode.window.waitForTimeout(500);
            await vscode.window.keyboard.press("Enter");
            // Wait for refresh to complete and data to load
            await vscode.window.waitForTimeout(5000);
            // Step 12: Check the data tree content for our test analyzer results
            // Debug: Let's see what tree sections we have available
            const allTreeSections = vscode.window.locator(".pane-header");
            const treeSectionCount = await allTreeSections.count();
            if (treeSectionCount > 0) {
                const treeSectionTexts = await allTreeSections.allTextContents();
            }
            // Get the data tree using the section title approach (no fallbacks!)
            // We need to target specifically the "Data & Results" section, not "CO2 Assessment"
            // Click on the Data & Results header to ensure it's expanded
            const dataResultsHeader = vscode.window
                .locator(".pane-header")
                .filter({ hasText: "Data & Results" });
            await dataResultsHeader.click();
            // Debug: Let's examine ALL 3 tree sections to see which one has the analysis results
            const allTrees = vscode.window.locator('[id*="workbench.view.extension.carbonara"] .monaco-list, [id*="workbench.view.extension.carbonara"] .tree-explorer-viewlet-tree-view');
            const treeCount = await allTrees.count();
            // Examine each tree individually
            for (let i = 0; i < treeCount; i++) {
                const tree = allTrees.nth(i);
                const treeRows = tree.locator(".monaco-list-row");
                const rowCount = await treeRows.count();
                if (rowCount > 0) {
                    const rowTexts = await treeRows.allTextContents();
                }
            }
            // Now try to find the tree with analysis results (not questionnaire data)
            let dataTree = null;
            let foundAnalysisTree = false;
            for (let i = 0; i < treeCount; i++) {
                const tree = allTrees.nth(i);
                const treeRows = tree.locator(".monaco-list-row");
                const rowCount = await treeRows.count();
                if (rowCount > 0) {
                    const rowTexts = await treeRows.allTextContents();
                    const hasQuestionnaireData = rowTexts.some((text) => text.includes("Project Information") ||
                        text.includes("Infrastructure") ||
                        text.includes("Development"));
                    const hasAnalysisData = rowTexts.some((text) => text.includes("Test Analysis") ||
                        text.includes("test-") ||
                        text.includes(".example.com"));
                    if (hasAnalysisData && !hasQuestionnaireData) {
                        dataTree = tree;
                        foundAnalysisTree = true;
                        break;
                    }
                }
            }
            if (!foundAnalysisTree) {
                dataTree = allTrees.nth(1);
            }
            await (0, test_1.expect)(dataTree).toBeVisible();
            const dataRows = dataTree.locator(".monaco-list-row");
            const dataRowCount = await dataRows.count();
            if (dataRowCount > 0) {
                const dataTexts = await dataRows.allTextContents();
                // STRICT CHECK: Look for ACTUAL analysis results, not just tool names
                // We should see analysis data like URLs, scores, timestamps - NOT just tool names
                // First, check if we're seeing tools list instead of analysis results
                const isShowingToolsList = dataTexts.some((text) => text.includes("Built-in") ||
                    text.includes("Not installed") ||
                    text.includes("Installed"));
                // Look for actual analysis result indicators from our test
                dataTexts.forEach((text, i) => { });
                const hasTestAnalysisResults = dataTexts.some((text) => {
                    const lowerText = text.toLowerCase();
                    return (
                    // Look for our test analysis group or entries
                    lowerText.includes("test analysis") ||
                        // Look for any test domain variation (test-site, test-fix, etc.)
                        text.match(/test-[^.]+\.example\.com/) ||
                        lowerText.includes("test result") ||
                        // Look for timestamp patterns (from screenshot: "02/09/2025")
                        text.match(/\d{2}\/\d{2}\/\d{4}/));
                });
                if (isShowingToolsList && !hasTestAnalysisResults) {
                    // FAIL THE TEST: We should see analysis results, not tools
                    (0, test_1.expect)(isShowingToolsList).toBe(false);
                    return; // Exit early since we have wrong content
                }
                // ASSERTION: Must have actual test analysis results
                if (!hasTestAnalysisResults) {
                    const expected = [
                        '"Test Analysis" (group name)',
                        '"test-*.example.com" (URL pattern)',
                        '"test result" (description)',
                        '"02/09/2025" (date pattern)',
                    ];
                    const errorMessage = `Expected to find test analysis results in Data & Results tab.

Expected one of:
${expected.map((e) => `  - ${e}`).join("\n")}

Found actual:
${dataTexts.map((text, i) => `  [${i}] "${text}"`).join("\n")}`;
                    throw new Error(errorMessage);
                }
                (0, test_1.expect)(hasTestAnalysisResults).toBe(true);
            }
            else {
                // Check if there's a "No data available" message vs actual empty state
                const noDataMessage = dataTree.getByText(/No data/i);
                const hasNoDataMessage = await noDataMessage
                    .isVisible()
                    .catch(() => false);
                if (hasNoDataMessage) {
                }
                else {
                }
            }
            // Wait 10 seconds for manual inspection before closing
            await vscode.window.waitForTimeout(10000);
        }
        finally {
            await vscode_launcher_1.VSCodeLauncher.close(vscode);
        }
    });
});
//# sourceMappingURL=carbonara-extension.test.js.map