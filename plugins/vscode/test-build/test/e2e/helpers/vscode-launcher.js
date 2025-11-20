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
exports.VSCodeLauncher = void 0;
const playwright_1 = require("playwright");
const test_1 = require("@playwright/test");
const ui_text_1 = require("../../../constants/ui-text");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class VSCodeLauncher {
    /**
     * Detect available VS Code installation on the system
     * Supports: VS Code, VS Code Insiders, VSCodium, Cursor
     */
    static detectVSCodePath() {
        const platform = process.platform;
        if (platform === "darwin") {
            // macOS - check common VS Code variants
            const variants = [
                {
                    name: "Visual Studio Code",
                    executablePath: "/Applications/Visual Studio Code.app/Contents/MacOS/Electron",
                    appPath: "/Applications/Visual Studio Code.app/Contents/Resources/app",
                },
                {
                    name: "VSCodium",
                    executablePath: "/Applications/VSCodium.app/Contents/MacOS/Electron",
                    appPath: "/Applications/VSCodium.app/Contents/Resources/app",
                },
                {
                    name: "Visual Studio Code - Insiders",
                    executablePath: "/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron",
                    appPath: "/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app",
                },
                {
                    name: "Cursor",
                    executablePath: "/Applications/Cursor.app/Contents/MacOS/Electron",
                    appPath: "/Applications/Cursor.app/Contents/Resources/app",
                },
            ];
            for (const variant of variants) {
                if (fs.existsSync(variant.executablePath) &&
                    fs.existsSync(variant.appPath)) {
                    return {
                        executablePath: variant.executablePath,
                        appPath: variant.appPath,
                    };
                }
            }
        }
        else if (platform === "linux") {
            // Linux - check common locations
            const variants = [
                {
                    executablePath: "/usr/share/code/code",
                    appPath: "/usr/share/code/resources/app",
                },
                {
                    executablePath: "/usr/bin/code",
                    appPath: "/usr/share/code/resources/app",
                },
                {
                    executablePath: "/usr/share/codium/codium",
                    appPath: "/usr/share/codium/resources/app",
                },
            ];
            for (const variant of variants) {
                if (fs.existsSync(variant.executablePath) &&
                    fs.existsSync(variant.appPath)) {
                    return variant;
                }
            }
        }
        else if (platform === "win32") {
            // Windows - check common locations
            const variants = [
                {
                    executablePath: "C:\\Program Files\\Microsoft VS Code\\Code.exe",
                    appPath: "C:\\Program Files\\Microsoft VS Code\\resources\\app",
                },
                {
                    executablePath: process.env.LOCALAPPDATA +
                        "\\Programs\\Microsoft VS Code\\Code.exe",
                    appPath: process.env.LOCALAPPDATA +
                        "\\Programs\\Microsoft VS Code\\resources\\app",
                },
            ];
            for (const variant of variants) {
                if (fs.existsSync(variant.executablePath) &&
                    fs.existsSync(variant.appPath)) {
                    return variant;
                }
            }
        }
        throw new Error(`No VS Code installation found. Please install VS Code, VSCodium, or another compatible variant.\n` +
            `Platform: ${platform}\n` +
            `You can also set VSCODE_PATH environment variable to point to your installation.`);
    }
    static async launch(workspaceFixture = "test-workspace") {
        // Wait if another instance is currently launching
        while (this.isLaunching) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        this.isLaunching = true;
        try {
            // Clean up any existing instances first
            if (this.activeInstances.length > 0) {
                await this.closeAllActive();
            }
            const extensionDevelopmentPath = path.resolve(__dirname, "../../../../");
            // Ensure the extension is built
            const distPath = path.join(extensionDevelopmentPath, "dist");
            if (!fs.existsSync(distPath)) {
                throw new Error('Extension not built. Run "npm run build" first.');
            }
            // Get workspace path based on fixture
            const workspacePath = path.join(__dirname, "../fixtures", workspaceFixture);
            if (!fs.existsSync(workspacePath)) {
                throw new Error(`Workspace fixture not found: ${workspaceFixture} at ${workspacePath}`);
            }
            // Detect VS Code installation
            const vscode = this.detectVSCodePath();
            // Launch VSCode with better isolation to prevent multiple windows
            // Set NODE_OPTIONS to disable inspector to prevent Playwright from adding --inspect
            process.env.NODE_OPTIONS = '--no-warnings';
            const app = await playwright_1._electron.launch({
                executablePath: vscode.executablePath,
                timeout: 30000,
                args: [
                    vscode.appPath,
                    "--extensionDevelopmentPath=" + extensionDevelopmentPath,
                    "--disable-workspace-trust",
                    "--no-sandbox",
                    "--user-data-dir=" +
                        path.join(__dirname, "../temp-vscode-data", `test-${Date.now()}`),
                    "--disable-extensions-except=" + extensionDevelopmentPath,
                    "--new-window",
                    "--wait",
                    "--folder-uri=" + "file://" + workspacePath,
                ],
                env: {
                    ...process.env,
                    // Provide CLI path so extension can spawn it reliably
                    CARBONARA_CLI_PATH: path.join(extensionDevelopmentPath, "..", "..", "packages", "cli", "dist", "index.js"),
                    // Mock external tool commands to ensure predictable E2E test results
                    // Override PATH to prevent actual tool detection, ensuring external tools show as "Not installed"
                    PATH: "/usr/bin:/bin:/usr/sbin:/sbin", // Basic system paths without npm global installs
                    // Disable npm global bin directory to prevent finding globally installed tools
                    NPM_CONFIG_PREFIX: "/tmp/nonexistent-npm-prefix",
                    // Set a flag that ToolsTreeProvider can check to force mock behavior
                    CARBONARA_E2E_TEST: "true",
                },
            });
            // Get the first window
            const window = await app.firstWindow();
            // Simple wait for VSCode to be ready (no extra steps here)
            await window.waitForTimeout(5000);
            const instance = { app, window };
            this.activeInstances.push(instance);
            return instance;
        }
        finally {
            this.isLaunching = false;
        }
    }
    static async close(instance) {
        try {
            // Remove from active instances
            const index = this.activeInstances.indexOf(instance);
            if (index > -1) {
                this.activeInstances.splice(index, 1);
            }
            // First, try to close gracefully
            if (instance.app) {
                await instance.app.close();
            }
        }
        catch (error) {
            try {
                // Force close the app if graceful close failed
                if (instance.app) {
                    // Use process.exit() as a fallback for force closing
                    await this.killVSCodeProcesses();
                }
            }
            catch (killError) {
                // As a last resort, try to kill any remaining VSCode processes
                await this.killVSCodeProcesses();
            }
        }
        // Clear the instance reference
        instance = null;
    }
    static async closeAllActive() {
        const closePromises = this.activeInstances.map((instance) => this.close(instance));
        await Promise.allSettled(closePromises);
        this.activeInstances = [];
    }
    static async killVSCodeProcesses() {
        try {
            // Only kill VSCode processes that are likely from our tests
            // Be more selective to avoid killing user's VSCode instances
            const platform = process.platform;
            if (platform === "darwin") {
                // macOS - only kill processes with extension development path
                const { stdout } = await execAsync('ps aux | grep -E "(Visual Studio Code|Electron)" | grep -v grep || true');
                if (stdout) {
                    // Only kill if it's likely our test instance
                    await execAsync('pkill -f "extensionDevelopmentPath" || true');
                }
            }
            else if (platform === "linux") {
                // Linux - be more selective
                await execAsync('pkill -f "extensionDevelopmentPath" || true');
            }
            else if (platform === "win32") {
                // Windows - be more selective
                await execAsync('taskkill /f /im "Code.exe" /fi "WINDOWTITLE eq Extension Development Host*" 2>nul || true');
            }
        }
        catch (error) {
            // Process cleanup failed
        }
    }
    static async cleanupAll() {
        await this.closeAllActive();
        await this.killVSCodeProcesses();
        await this.cleanupTempData();
    }
    static async cleanupTempData() {
        try {
            const tempDataDir = path.join(__dirname, "../temp-vscode-data");
            if (fs.existsSync(tempDataDir)) {
                // Remove all temporary VSCode data directories
                await execAsync(`rm -rf "${tempDataDir}"`);
            }
        }
        catch (error) {
            // Failed to cleanup temp data
        }
    }
    static async waitForExtension(window, timeout = 20000) {
        // Wait for the extension to load by checking for the status bar item
        try {
            // Wait for the specific clickable status bar button (not the container div)
            await window.waitForSelector('a[role="button"][aria-label="carbonara-statusbar"]', {
                state: "visible",
                timeout,
            });
        }
        catch (error) {
            // Try alternative approaches
            const alternatives = [
                () => window.waitForSelector('.statusbar-item[aria-label="carbonara-statusbar"]', { timeout: 5000, state: "visible" }),
                () => window.waitForSelector('[title*="Carbonara"]', {
                    timeout: 5000,
                    state: "visible",
                }),
                () => window.waitForSelector('.statusbar-item:has-text("Carbonara")', {
                    timeout: 5000,
                    state: "visible",
                }),
            ];
            let success = false;
            for (const alt of alternatives) {
                try {
                    await alt();
                    success = true;
                    break;
                }
                catch (e) {
                    continue;
                }
            }
            if (!success) {
                throw new Error("Carbonara extension status bar item not found");
            }
        }
    }
    // Helper function to select an item from Carbonara quick pick menu using UI_TEXT keys
    static async selectFromCarbonaraMenu(window, menuItemKey) {
        // First open the menu
        await this.clickStatusBarCarbonara(window);
        // Wait for quick pick to appear
        await window.waitForTimeout(1000);
        // Get the search text for the menu item
        const searchText = ui_text_1.UI_TEXT.MENU.ITEMS[menuItemKey].SEARCH_TEXT;
        // Click the menu item (look for text that contains the item name, ignoring icons)
        const menuItem = window.locator(`${ui_text_1.SELECTORS.QUICK_PICK.LIST_ROW}:has-text("${searchText}")`);
        await (0, test_1.expect)(menuItem).toBeVisible({ timeout: 10000 });
        await menuItem.click();
        // Wait for menu to close
        await window.waitForTimeout(500);
    }
    static async clickStatusBarCarbonara(window) {
        // Try multiple possible selectors for the status bar item
        // Prefer role/accessible name matches, then ARIA label, then text fallbacks
        const tryClicks = [
            async () => {
                const el = await window.waitForSelector('[aria-label="carbonara-statusbar"]', { timeout: 8000 });
                await el?.click();
            },
            async () => {
                const btn = window.getByRole("button", { name: /carbonara/i }).last();
                await btn.waitFor({ state: "visible", timeout: 10000 });
                await btn.click();
            },
            async () => {
                const el = await window.waitForSelector('footer .statusbar-item-label[aria-label*="Carbonara"]', { timeout: 8000 });
                await el?.click();
            },
            async () => {
                const el = await window.waitForSelector('[aria-label*="Carbonara"]', {
                    timeout: 5000,
                });
                await el?.click();
            },
            async () => {
                const el = await window.waitForSelector('.statusbar-item:has-text("Carbonara")', { timeout: 4000 });
                await el?.click();
            },
        ];
        for (const action of tryClicks) {
            try {
                await action();
                return;
            }
            catch { }
        }
        throw new Error("Could not find Carbonara status bar item");
    }
    static async openSidebar(window) {
        // Click on the Carbonara activity bar icon
        const selectors = [
            '[aria-label="Carbonara"]',
            '.activity-bar-action-item[aria-label="Carbonara"]',
            '*[title="Carbonara"]',
        ];
        for (const selector of selectors) {
            try {
                const element = await window.waitForSelector(selector, {
                    timeout: 5000,
                });
                if (element) {
                    await element.click();
                    return;
                }
            }
            catch (error) {
                // Continue to next selector
            }
        }
        throw new Error("Could not find Carbonara sidebar icon");
    }
    static async dismissDialogs(window) {
        // Handle the "extensions disabled" dialog if it appears
        try {
            const reloadButton = window.locator('button:has-text("Reload and Enable Extensions")');
            if (await reloadButton.isVisible({ timeout: 2000 })) {
                await reloadButton.click();
                await window.waitForTimeout(3000);
            }
        }
        catch (error) {
            // Continue if no dialog
        }
        // Dismiss git dialog
        try {
            const neverButton = window.locator('button:has-text("Never")');
            if (await neverButton.isVisible({ timeout: 1000 })) {
                await neverButton.click();
            }
        }
        catch (error) {
            // Continue if no dialog
        }
    }
}
exports.VSCodeLauncher = VSCodeLauncher;
VSCodeLauncher.activeInstances = [];
VSCodeLauncher.isLaunching = false;
//# sourceMappingURL=vscode-launcher.js.map