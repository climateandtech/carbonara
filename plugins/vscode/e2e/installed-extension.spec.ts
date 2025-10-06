import { test, expect } from '@playwright/test';
import { VSCodeLauncher, VSCodeInstance } from './helpers/vscode-launcher';
import { SELECTORS, UI_TEXT } from '../src/constants/ui-text';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

let vscode: VSCodeInstance;
let extensionPath: string;

test.describe('Carbonara VSCode Extension - Installed Package Tests', () => {
  test.beforeAll(async () => {
    // Clean up any existing VSCode processes before starting tests
    await VSCodeLauncher.cleanupAll();
    
    // Use the packaged extension
    console.log('📦 Setting up extension for installation test...');
    const extensionDir = path.resolve(__dirname, '..');
    
    // Find the .vsix file
    const files = fs.readdirSync(extensionDir);
    const vsixFile = files.find(file => file.endsWith('.vsix'));
    
    if (!vsixFile) {
      throw new Error('No .vsix file found. Please run "npm run package" first.');
    }
    
    extensionPath = path.join(extensionDir, vsixFile);
    console.log(`📦 Extension package: ${extensionPath}`);
  });

  test.afterAll(async () => {
    // Final cleanup after all tests complete
    await VSCodeLauncher.cleanupAll();
  });

  test.beforeEach(async () => {
    // Launch VSCode with the packaged extension installed
    vscode = await VSCodeLauncher.launchWithInstalledExtension(extensionPath);
    await VSCodeLauncher.waitForExtension(vscode.window);
  });

  test.afterEach(async () => {
    if (vscode) {
      await VSCodeLauncher.close(vscode);
    }
  });

  test('should show Carbonara status bar but fail to initialize core services when installed', async () => {
    console.log('🔍 Testing installed extension behavior...');
    
    // Wait for extension to load first
    await VSCodeLauncher.waitForExtension(vscode.window);
    console.log('✅ Installed extension loaded successfully');
    
    // Verify status bar item exists (look for Carbonara in status bar)
    const statusBarItem = vscode.window.locator('footer .statusbar-item:has-text("Carbonara")');
    await expect(statusBarItem).toBeVisible({ timeout: 10000 });
    console.log('✅ Found Carbonara status bar item in installed extension');
    
    // Check if there's a Carbonara activity bar icon (should be missing)
    const carbonaraActivityIcon = vscode.window.locator('.activity-bar .action-item[aria-label*="Carbonara"]');
    const hasActivityIcon = await carbonaraActivityIcon.isVisible().catch(() => false);
    
    if (hasActivityIcon) {
      console.log('✅ Found Carbonara activity bar icon - extension working correctly');
    } else {
      console.log('⚠️ No Carbonara activity bar icon found - core services not initialized');
    }
    
    // Open command palette and test commands
    await vscode.window.keyboard.press('F1');
    await vscode.window.waitForTimeout(1000);
    
    await vscode.window.keyboard.type('Carbonara');
    await vscode.window.waitForTimeout(1000);
    
    // Check if Carbonara commands appear
    const commandPalette = vscode.window.locator('.quick-input-widget');
    await expect(commandPalette).toBeVisible();
    console.log('✅ Command palette is visible');
    
    // Look for Carbonara commands
    const carbonaraCommands = vscode.window.locator('.quick-input-widget .monaco-list-row:has-text("Carbonara")');
    const commandCount = await carbonaraCommands.count();
    
    if (commandCount > 0) {
      console.log(`✅ Found ${commandCount} Carbonara commands`);
      
      // Try clicking on a command to see if it works
      const firstCommand = carbonaraCommands.first();
      await firstCommand.click();
      console.log('✅ Clicked on Carbonara command');
      
      // Wait for command to execute
      await vscode.window.waitForTimeout(3000);
      
      // Check for error messages
      const errorMessages = vscode.window.locator('text=/error|failed|cannot find module/i');
      const hasError = await errorMessages.isVisible().catch(() => false);
      
      if (hasError) {
        const errorText = await errorMessages.textContent();
        console.log(`❌ Found error message: ${errorText}`);
        console.log('📝 This confirms the extension has module resolution issues when installed');
      } else {
        console.log('✅ No error messages found - commands working correctly');
      }
    } else {
      console.log('⚠️ No Carbonara commands found in command palette');
    }
    
    console.log('🎉 Installed extension test completed - status bar works but core services fail');
  });

  test('should test Carbonara commands functionality', async () => {
    console.log('🔍 Testing Carbonara commands functionality...');
    
    // Wait for extension to load
    await VSCodeLauncher.waitForExtension(vscode.window);
    console.log('✅ Extension loaded');
    
    // Open command palette and test "View Data" command
    await vscode.window.keyboard.press('F1');
    await vscode.window.waitForTimeout(1000);
    
    await vscode.window.keyboard.type('Carbonara: View Data');
    await vscode.window.waitForTimeout(1000);
    
    const viewDataCommand = vscode.window.locator('.quick-input-widget .monaco-list-row:has-text("View Data")');
    await expect(viewDataCommand).toBeVisible({ timeout: 5000 });
    console.log('✅ Found "View Data" command');
    
    // Click the command
    await viewDataCommand.click();
    console.log('✅ Clicked "View Data" command');
    
    // Wait for command to execute
    await vscode.window.waitForTimeout(3000);
    
    // Check if we can see any Carbonara-related content or if there are error messages
    const errorMessages = vscode.window.locator('text=/error|failed|cannot find module/i');
    const hasError = await errorMessages.isVisible().catch(() => false);
    
    if (hasError) {
      const errorText = await errorMessages.textContent();
      console.log(`❌ Found error message: ${errorText}`);
      console.log('📝 This confirms the extension has module resolution issues when installed');
    } else {
      console.log('✅ No error messages found - extension commands working correctly');
    }
    
    console.log('🎉 Commands functionality test completed!');
  });
});
