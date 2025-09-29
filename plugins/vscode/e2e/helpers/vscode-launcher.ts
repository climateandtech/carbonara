import { _electron as electron, ElectronApplication, Page } from 'playwright';
import { expect } from '@playwright/test';
import { UI_TEXT, SELECTORS } from '../../src/constants/ui-text';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface VSCodeInstance {
  app: ElectronApplication;
  window: Page;
}

export type WorkspaceFixture = 
  | 'empty-workspace'           // No carbonara project
  | 'with-carbonara-project'    // Has valid carbonara.config.json
  | 'with-analysis-data'        // Has pre-populated analysis data in database
  | 'multiple-projects'         // Multiple carbonara projects
  | 'invalid-project'           // Corrupted carbonara.config.json
  | 'test-workspace';           // Legacy test workspace (empty)

export class VSCodeLauncher {
  private static activeInstances: VSCodeInstance[] = [];
  private static isLaunching = false;

  static async launch(workspaceFixture: WorkspaceFixture = 'test-workspace'): Promise<VSCodeInstance> {
    // Wait if another instance is currently launching
    while (this.isLaunching) {
      console.log('⏳ Waiting for previous VSCode instance to finish launching...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.isLaunching = true;

    try {
      // Clean up any existing instances first
      if (this.activeInstances.length > 0) {
        console.log(`🧹 Cleaning up ${this.activeInstances.length} existing VSCode instances...`);
        await this.closeAllActive();
      }

      const extensionDevelopmentPath = path.resolve(__dirname, '../../');
      
      // Ensure the extension is built
      const outPath = path.join(extensionDevelopmentPath, 'out');
      if (!fs.existsSync(outPath)) {
        throw new Error('Extension not built. Run "npm run build" first.');
      }

      // Get workspace path based on fixture
      const workspacePath = path.join(__dirname, '../fixtures', workspaceFixture);
      if (!fs.existsSync(workspacePath)) {
        throw new Error(`Workspace fixture not found: ${workspaceFixture} at ${workspacePath}`);
      }

      console.log(`🧪 Using workspace fixture: ${workspaceFixture}`);
      console.log(`📁 Workspace path: ${workspacePath}`);

      // Launch VSCode with better isolation to prevent multiple windows
      // TODO make sure this works on every system
      const app = await electron.launch({
        executablePath: '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
        args: [
          '/Applications/Visual Studio Code.app/Contents/Resources/app',
          '--extensionDevelopmentPath=' + extensionDevelopmentPath,
          '--disable-workspace-trust',
          '--no-sandbox',
          '--user-data-dir=' + path.join(__dirname, '../temp-vscode-data', `test-${Date.now()}`),
          '--disable-extensions-except=' + extensionDevelopmentPath,
          '--new-window',
          '--wait',
          '--folder-uri=' + 'file://' + workspacePath
        ],
        env: {
          ...process.env,
          // Provide CLI path so extension can spawn it reliably
          CARBONARA_CLI_PATH: path.join(extensionDevelopmentPath, '..', '..', 'packages', 'cli', 'dist', 'index.js'),
          // Mock external tool commands to ensure predictable E2E test results
          // Override PATH to prevent actual tool detection, ensuring external tools show as "Not installed"
          PATH: '/usr/bin:/bin:/usr/sbin:/sbin', // Basic system paths without npm global installs
          // Disable npm global bin directory to prevent finding globally installed tools
          NPM_CONFIG_PREFIX: '/tmp/nonexistent-npm-prefix',
          // Set a flag that ToolsTreeProvider can check to force mock behavior
          CARBONARA_E2E_TEST: 'true'
        } as { [key: string]: string }
      });

      // Get the first window
      const window = await app.firstWindow();
      
      // Simple wait for VSCode to be ready (no extra steps here)
      await window.waitForTimeout(5000);
      
      const instance = { app, window };
      this.activeInstances.push(instance);
      
      console.log(`✅ VSCode instance launched. Total active instances: ${this.activeInstances.length}`);
      
      return instance;
    } finally {
      this.isLaunching = false;
    }
  }

  static async close(instance: VSCodeInstance): Promise<void> {
    try {
      console.log('🔄 Closing VSCode instance...');
      
      // Remove from active instances
      const index = this.activeInstances.indexOf(instance);
      if (index > -1) {
        this.activeInstances.splice(index, 1);
      }
      
      // First, try to close gracefully
      if (instance.app) {
        await instance.app.close();
        console.log('✅ VSCode closed gracefully');
      }
    } catch (error) {
      console.log('⚠️ Graceful close failed, attempting force close...');
      
      try {
        // Force close the app if graceful close failed
        if (instance.app) {
          // Use process.exit() as a fallback for force closing
          await this.killVSCodeProcesses();
          console.log('✅ VSCode force closed');
        }
      } catch (killError) {
        console.log('⚠️ Force close also failed, attempting process cleanup...');
        
        // As a last resort, try to kill any remaining VSCode processes
        await this.killVSCodeProcesses();
      }
    }
    
    // Clear the instance reference
    instance = null as any;
  }

  static async closeAllActive(): Promise<void> {
    console.log(`🧹 Closing all ${this.activeInstances.length} active VSCode instances...`);
    
    const closePromises = this.activeInstances.map(instance => this.close(instance));
    await Promise.allSettled(closePromises);
    
    this.activeInstances = [];
    console.log('✅ All active VSCode instances closed');
  }

  static async killVSCodeProcesses(): Promise<void> {
    try {
      // Only kill VSCode processes that are likely from our tests
      // Be more selective to avoid killing user's VSCode instances
      const platform = process.platform;
      
      if (platform === 'darwin') {
        // macOS - only kill processes with extension development path
        const { stdout } = await execAsync('ps aux | grep -E "(Visual Studio Code|Electron)" | grep -v grep || true');
        if (stdout) {
          console.log('🔍 Found VSCode processes:', stdout);
          // Only kill if it's likely our test instance
          await execAsync('pkill -f "extensionDevelopmentPath" || true');
        }
      } else if (platform === 'linux') {
        // Linux - be more selective
        await execAsync('pkill -f "extensionDevelopmentPath" || true');
      } else if (platform === 'win32') {
        // Windows - be more selective
        await execAsync('taskkill /f /im "Code.exe" /fi "WINDOWTITLE eq Extension Development Host*" 2>nul || true');
      }
      
      console.log('✅ Cleaned up test VSCode processes');
    } catch (error) {
      console.log('⚠️ Process cleanup failed:', error);
    }
  }

  static async cleanupAll(): Promise<void> {
    console.log('🧹 Running global VSCode cleanup...');
    await this.closeAllActive();
    await this.killVSCodeProcesses();
    await this.cleanupTempData();
  }

  static async cleanupTempData(): Promise<void> {
    try {
      const tempDataDir = path.join(__dirname, '../temp-vscode-data');
      if (fs.existsSync(tempDataDir)) {
        // Remove all temporary VSCode data directories
        await execAsync(`rm -rf "${tempDataDir}"`);
        console.log('✅ Cleaned up temporary VSCode data directories');
      }
    } catch (error) {
      console.log('⚠️ Failed to cleanup temp data:', error);
    }
  }

  static async waitForExtension(window: Page, timeout = 20000): Promise<void> {
    // Wait for the extension to load by checking for the status bar item
    console.log('🔍 Waiting for Carbonara extension to load...');
    
    try {
      // Wait for the specific clickable status bar button (not the container div)
      await window.waitForSelector('a[role="button"][aria-label="carbonara-statusbar"]', { 
        state: 'visible',
        timeout 
      });
      console.log('✅ Found Carbonara status bar button');
    } catch (error) {
      console.log('⚠️ Button not found, trying alternative selectors...');
      
      // Try alternative approaches
      const alternatives = [
        () => window.waitForSelector('.statusbar-item[aria-label="carbonara-statusbar"]', { timeout: 5000, state: 'visible' }),
        () => window.waitForSelector('[title*="Carbonara"]', { timeout: 5000, state: 'visible' }),
        () => window.waitForSelector('.statusbar-item:has-text("Carbonara")', { timeout: 5000, state: 'visible' })
      ];
      
      let success = false;
      for (const alt of alternatives) {
        try {
          await alt();
          success = true;
          console.log('✅ Found Carbonara status bar with alternative selector');
          break;
        } catch (e) {
          continue;
        }
      }
      
      if (!success) {
        console.log('❌ Could not find Carbonara status bar item');
        throw new Error('Carbonara extension status bar item not found');
      }
    }
  }

  // Helper function to select an item from Carbonara quick pick menu using UI_TEXT keys
  static async selectFromCarbonaraMenu(window: Page, menuItemKey: keyof typeof UI_TEXT.MENU.ITEMS): Promise<void> {
    // First open the menu
    await this.clickStatusBarCarbonara(window);
    
    // Wait for quick pick to appear
    await window.waitForTimeout(1000);
    
    // Get the search text for the menu item
    const searchText = UI_TEXT.MENU.ITEMS[menuItemKey].SEARCH_TEXT;
    
    // Click the menu item (look for text that contains the item name, ignoring icons)
    const menuItem = window.locator(`${SELECTORS.QUICK_PICK.LIST_ROW}:has-text("${searchText}")`);
    await expect(menuItem).toBeVisible({ timeout: 10000 });
    await menuItem.click();
    
    // Wait for menu to close
    await window.waitForTimeout(500);
  }

  static async clickStatusBarCarbonara(window: Page): Promise<void> {
    // Try multiple possible selectors for the status bar item
    // Prefer role/accessible name matches, then ARIA label, then text fallbacks
    const tryClicks = [
      async () => {
        const el = await window.waitForSelector('[aria-label="carbonara-statusbar"]', { timeout: 8000 });
        await el?.click();
      },
      async () => {
        const btn = window.getByRole('button', { name: /carbonara/i }).last();
        await btn.waitFor({ state: 'visible', timeout: 10000 });
        await btn.click();
      },
      async () => {
        const el = await window.waitForSelector('footer .statusbar-item-label[aria-label*="Carbonara"]', { timeout: 8000 });
        await el?.click();
      },
      async () => {
        const el = await window.waitForSelector('[aria-label*="Carbonara"]', { timeout: 5000 });
        await el?.click();
      },
      async () => {
        const el = await window.waitForSelector('.statusbar-item:has-text("Carbonara")', { timeout: 4000 });
        await el?.click();
      }
    ];

    for (const action of tryClicks) {
      try {
        await action();
        return;
      } catch {}
    }

    throw new Error('Could not find Carbonara status bar item');
  }

  static async openSidebar(window: Page): Promise<void> {
    // Click on the Carbonara activity bar icon
    const selectors = [
      '[aria-label="Carbonara"]',
      '.activity-bar-action-item[aria-label="Carbonara"]',
      '*[title="Carbonara"]'
    ];

    for (const selector of selectors) {
      try {
        const element = await window.waitForSelector(selector, { timeout: 5000 });
        if (element) {
          await element.click();
          return;
        }
      } catch (error) {
        // Continue to next selector
      }
    }
    
    throw new Error('Could not find Carbonara sidebar icon');
  }

  static async dismissDialogs(window: Page): Promise<void> {
    // Handle the "extensions disabled" dialog if it appears
    try {
      const reloadButton = window.locator('button:has-text("Reload and Enable Extensions")');
      if (await reloadButton.isVisible({ timeout: 2000 })) {
        console.log('📦 Enabling extensions...');
        await reloadButton.click();
        await window.waitForTimeout(3000);
      }
    } catch (error) {
      // Continue if no dialog
    }

    // Dismiss git dialog
    try {
      const neverButton = window.locator('button:has-text("Never")');
      if (await neverButton.isVisible({ timeout: 1000 })) {
        await neverButton.click();
      }
    } catch (error) {
      // Continue if no dialog
    }
  }
} 