import { _electron as electron, ElectronApplication, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

export interface VSCodeInstance {
  app: ElectronApplication;
  window: Page;
}

export type WorkspaceFixture = 
  | 'empty-workspace'           // No carbonara project
  | 'with-carbonara-project'    // Has valid carbonara.config.json
  | 'multiple-projects'         // Multiple carbonara projects
  | 'invalid-project'           // Corrupted carbonara.config.json
  | 'test-workspace';           // Legacy test workspace (empty)

export class VSCodeLauncher {
  static async launch(workspaceFixture: WorkspaceFixture = 'test-workspace'): Promise<VSCodeInstance> {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    
    // Ensure the extension is built
    const distPath = path.join(extensionDevelopmentPath, 'dist');
    if (!fs.existsSync(distPath)) {
      throw new Error('Extension not built. Run "npm run build" first.');
    }

    // Get workspace path based on fixture
    const workspacePath = path.join(__dirname, '../fixtures', workspaceFixture);
    if (!fs.existsSync(workspacePath)) {
      throw new Error(`Workspace fixture not found: ${workspaceFixture} at ${workspacePath}`);
    }

    console.log(`🧪 Using workspace fixture: ${workspaceFixture}`);
    console.log(`📁 Workspace path: ${workspacePath}`);

    // Launch VSCode using the system installation
    const app = await electron.launch({
      executablePath: '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
      args: [
        '/Applications/Visual Studio Code.app/Contents/Resources/app',
        '--extensionDevelopmentPath=' + extensionDevelopmentPath,
        '--disable-extensions',
        '--disable-workspace-trust',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--user-data-dir=' + path.join(__dirname, '../temp-vscode-data'),
        workspacePath
      ],
      env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: 'true'
      },
      timeout: 60000 // Increase timeout to 60 seconds
    });

    // Get the first window
    const window = await app.firstWindow();
    
    // Wait for VSCode to fully load
    await window.waitForLoadState('domcontentloaded', { timeout: 30000 });
    
    // Wait for the extension host to start
    await window.waitForTimeout(5000);
    
    return { app, window };
  }

  static async close(instance: VSCodeInstance): Promise<void> {
    await instance.app.close();
  }

  static async waitForExtension(window: Page, timeout = 20000): Promise<void> {
    // Wait for the extension to load by checking for the status bar item
    try {
      await window.waitForSelector('.statusbar-item[title*="Carbonara"]', { 
        timeout,
        state: 'visible' 
      });
    } catch (error) {
      // Try alternative selector
      await window.waitForSelector('*[title="Carbonara CO2 Assessment Tools"]', { 
        timeout: 5000,
        state: 'visible' 
      });
    }
  }

  static async clickStatusBarCarbonara(window: Page): Promise<void> {
    // Try multiple possible selectors for the status bar item
    const selectors = [
      '.statusbar-item[title*="Carbonara"]',
      '*[title="Carbonara CO2 Assessment Tools"]',
      '.statusbar-item:has-text("Carbonara")'
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