import { _electron as electron, ElectronApplication, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

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
  
  private static findVSCodePath(): { executablePath: string; resourcesPath: string } {
    // Common VS Code and VSCodium installation paths on macOS
    const commonPaths = [
      '/Applications/Visual Studio Code.app',
      '/Applications/Visual Studio Code - Insiders.app',
      '/Applications/VSCodium.app',
      '/Applications/VSCode.app',
      '/System/Applications/Visual Studio Code.app',
      '/usr/local/bin/Visual Studio Code.app'
    ];

    // Try to find VS Code or VSCodium using their commands first
    const commands = ['code', 'codium'];
    
    for (const cmd of commands) {
      try {
        const cmdPath = execSync(`which ${cmd}`, { encoding: 'utf8' }).trim();
        if (cmdPath) {
          console.log(`Found ${cmd} command at: ${cmdPath}`);
          
          // If command exists, try to determine the app path
          const result = execSync(`ls -la $(which ${cmd})`, { encoding: 'utf8' }).trim();
          console.log(`${cmd} symlink info:`, result);
          
          // Try to extract the real path from the symlink for different editors
          if (result.includes('/Applications/Visual Studio Code.app')) {
            const appPath = '/Applications/Visual Studio Code.app';
            if (fs.existsSync(appPath)) {
              return {
                executablePath: `${appPath}/Contents/MacOS/Electron`,
                resourcesPath: `${appPath}/Contents/Resources/app`
              };
            }
          } else if (result.includes('/Applications/VSCodium.app')) {
            const appPath = '/Applications/VSCodium.app';
            if (fs.existsSync(appPath)) {
              return {
                executablePath: `${appPath}/Contents/MacOS/Electron`,
                resourcesPath: `${appPath}/Contents/Resources/app`
              };
            }
          }
        }
      } catch (error) {
        console.log(`Could not find ${cmd} via "${cmd}" command`);
      }
    }

    // Check common installation paths
    for (const appPath of commonPaths) {
      if (fs.existsSync(appPath)) {
        const executablePath = `${appPath}/Contents/MacOS/Electron`;
        const resourcesPath = `${appPath}/Contents/Resources/app`;
        
        if (fs.existsSync(executablePath) && fs.existsSync(resourcesPath)) {
          console.log(`Found VS Code at: ${appPath}`);
          return { executablePath, resourcesPath };
        }
      }
    }

    // If we can't find via symlink, try using the commands directly
    for (const cmd of commands) {
      try {
        const cmdPath = execSync(`which ${cmd}`, { encoding: 'utf8' }).trim();
        if (cmdPath && fs.existsSync(cmdPath)) {
          console.log(`Using ${cmd} command directly:`, cmdPath);
          return {
            executablePath: cmdPath,
            resourcesPath: '' // Will be handled differently
          };
        }
      } catch (error) {
        // Continue to next command
      }
    }

    throw new Error(`
VS Code or VSCodium not found! Please ensure one is installed.

Try one of these solutions:
1. Install VS Code from https://code.visualstudio.com/
2. Install VSCodium: brew install --cask vscodium
3. Install the command in PATH:
   • VS Code: Open VS Code, Cmd+Shift+P, type "Shell Command: Install 'code' command in PATH"
   • VSCodium: Should install "codium" command automatically

Searched paths:
${commonPaths.map(p => `  - ${p}`).join('\n')}

Searched commands: ${commands.join(', ')}
`);
  }

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

    // Find VS Code installation
    const vscodeInfo = this.findVSCodePath();
    console.log(`🚀 Launching VS Code from: ${vscodeInfo.executablePath}`);

    // Build launch arguments
    const args = [
      '--extensionDevelopmentPath=' + extensionDevelopmentPath,
      '--disable-extensions',
      '--disable-workspace-trust',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security',
      '--user-data-dir=' + path.join(__dirname, '../temp-vscode-data'),
      workspacePath
    ];

    // Add resources path if we have one (traditional VS Code installation)
    if (vscodeInfo.resourcesPath) {
      args.unshift(vscodeInfo.resourcesPath);
    }

    // Launch VSCode
    const app = await electron.launch({
      executablePath: vscodeInfo.executablePath,
      args,
      env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: 'true',
        NODE_ENV: 'development'
      },
      timeout: 60000 // Increase timeout to 60 seconds
    });

    // Get the first window
    const window = await app.firstWindow();
    
    // Wait for VSCode to fully load
    await window.waitForLoadState('domcontentloaded', { timeout: 30000 });
    
    // Wait for the extension host to start and status bar to be ready
    console.log('⏳ Waiting for VS Code UI to initialize...');
    await window.waitForSelector('.statusbar', { timeout: 15000 });
    
    // Give extensions time to activate
    console.log('⏳ Waiting for extensions to activate...');
    await window.waitForTimeout(8000);
    
    return { app, window };
  }

  static async close(instance: VSCodeInstance): Promise<void> {
    await instance.app.close();
  }

  static async waitForExtension(window: Page, timeout = 30000): Promise<void> {
    // Wait for the extension to load by checking for the status bar item
    // Try multiple selectors in sequence with more specific targeting
    const selectors = [
      '.statusbar-item[aria-label*="Carbonara"]',
      '.statusbar-item[title*="Carbonara"]',
      '.statusbar-item:has-text("Carbonara")',
      '*[title="Carbonara CO2 Assessment Tools"]',
      '.statusbar-item .codicon-pulse',
      '.statusbar-item .codicon-check'
    ];

    for (let i = 0; i < selectors.length; i++) {
      try {
        console.log(`Trying selector ${i + 1}/${selectors.length}: ${selectors[i]}`);
        const element = await window.waitForSelector(selectors[i], { 
          timeout: i === 0 ? timeout : 5000,
          state: 'visible' 
        });
        if (element) {
          console.log(`✅ Found Carbonara extension with selector: ${selectors[i]}`);
          return;
        }
      } catch (error) {
        console.log(`❌ Selector ${selectors[i]} not found:`, error.message);
        // Continue to next selector
      }
    }

    // If no selectors work, take a screenshot for debugging
    await window.screenshot({ path: 'test-results/extension-not-found.png', fullPage: true });
    throw new Error('Carbonara extension not found with any selector');
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

  static async debugExtensionState(window: Page): Promise<void> {
    console.log('🔍 Debugging extension state...');
    
    // Check if status bar exists
    const statusBar = await window.locator('.statusbar').count();
    console.log(`Status bar elements found: ${statusBar}`);
    
    // Check for any Carbonara-related elements
    const carbonaraElements = await window.locator('*:has-text("Carbonara")').count();
    console.log(`Elements containing "Carbonara": ${carbonaraElements}`);
    
    // Check for any status bar items
    const statusBarItems = await window.locator('.statusbar-item').count();
    console.log(`Status bar items found: ${statusBarItems}`);
    
    // Get all status bar item text content
    const statusBarTexts = await window.locator('.statusbar-item').allTextContents();
    console.log('Status bar item texts:', statusBarTexts);
    
    // Take a screenshot for debugging
    await window.screenshot({ path: 'test-results/debug-extension-state.png', fullPage: true });
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
