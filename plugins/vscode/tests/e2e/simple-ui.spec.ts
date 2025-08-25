import { test, expect } from '@playwright/test';
import { VSCodeLauncher, VSCodeInstance } from './helpers/vscode-launcher';

let vscode: VSCodeInstance;

test.describe('Carbonara VSCode Extension UI Tests', () => {
  test.beforeEach(async () => {
    vscode = await VSCodeLauncher.launch();
  });

  test.afterEach(async () => {
    if (vscode) {
      await VSCodeLauncher.close(vscode);
    }
  });

  test('should launch VSCode and load Carbonara extension', async () => {
    // Wait for VSCode to fully load
    await vscode.window.waitForTimeout(3000);
    
    // Handle the "extensions disabled" dialog if it appears
    try {
      const reloadButton = vscode.window.locator('button:has-text("Reload and Enable Extensions")');
      if (await reloadButton.isVisible({ timeout: 2000 })) {
        console.log('📦 Enabling extensions...');
        await reloadButton.click();
        await vscode.window.waitForTimeout(3000); // Wait for reload
      }
    } catch (error) {
      console.log('No extension dialog found, continuing...');
    }

    // Dismiss any git repository dialogs
    try {
      const neverButton = vscode.window.locator('button:has-text("Never")');
      if (await neverButton.isVisible({ timeout: 1000 })) {
        await neverButton.click();
      }
    } catch (error) {
      // Ignore if not found
    }
    
    // Take a screenshot to see current state
    await vscode.window.screenshot({ path: 'vscode-after-setup.png' });
    
    console.log('Looking for Carbonara extension...');
    console.log('Page title:', await vscode.window.title());
    
    // Check that we're in Extension Development Host mode (correct for our test)
    expect(await vscode.window.title()).toContain('Extension Development Host');
    
    // Look for Carbonara in the status bar
    const carbonaraElements = await vscode.window.locator('*:has-text("Carbonara")').count();
    console.log(`Found ${carbonaraElements} elements containing "Carbonara"`);
    expect(carbonaraElements).toBeGreaterThan(0);
    
    // Try to find the status bar item specifically
    const statusBarItems = await vscode.window.locator('.statusbar-item').count();
    console.log(`Found ${statusBarItems} status bar items`);
    
    // Look for the specific Carbonara status bar item
    const carbonaraStatusBar = vscode.window.locator('.statusbar-item:has-text("Carbonara")');
    await expect(carbonaraStatusBar).toBeVisible({ timeout: 5000 });
    
    console.log('✅ Successfully found Carbonara extension in VSCode!');
  });
}); 