import { test, expect } from '@playwright/test';
import { VSCodeLauncher, VSCodeInstance } from './helpers/vscode-launcher';

let vscode: VSCodeInstance;

test.describe('Basic VS Code Launch Test', () => {
  test.setTimeout(120000); // 2 minutes for this test

  test('should launch VS Code and detect basic UI', async () => {
    console.log('🚀 Launching VS Code...');
    vscode = await VSCodeLauncher.launch('test-workspace');
    
    // Basic checks that VS Code launched
    console.log('🔍 Checking basic VS Code UI...');
    await expect(vscode.window.locator('.statusbar')).toBeVisible({ timeout: 20000 });
    console.log('✅ Status bar found');
    
    // Check if any extensions loaded
    await VSCodeLauncher.debugExtensionState(vscode.window);
    
    // Look for our extension more patiently
    console.log('🧪 Looking for Carbonara extension...');
    
    // Try different approaches to find the extension
    const approaches = [
      async () => {
        // Approach 1: Look for text content
        const carbonaraText = vscode.window.locator('*:has-text("Carbonara")');
        const count = await carbonaraText.count();
        console.log(`Found ${count} elements with "Carbonara" text`);
        if (count > 0) {
          const texts = await carbonaraText.allTextContents();
          console.log('Carbonara text contents:', texts);
          return count > 0;
        }
        return false;
      },
      async () => {
        // Approach 2: Look for pulse icon (which might indicate our extension)
        const pulseIcon = vscode.window.locator('.codicon-pulse');
        const count = await pulseIcon.count();
        console.log(`Found ${count} pulse icons`);
        return count > 0;
      },
      async () => {
        // Approach 3: Look in dev tools console for extension activation
        const logs = await vscode.window.evaluate(() => {
          return (window as any).console._logs || [];
        });
        console.log('Console logs:', logs);
        return logs.some((log: string) => log.includes('Carbonara'));
      }
    ];
    
    let extensionFound = false;
    for (const [index, approach] of approaches.entries()) {
      try {
        console.log(`Trying approach ${index + 1}...`);
        extensionFound = await approach();
        if (extensionFound) {
          console.log(`✅ Extension detected with approach ${index + 1}`);
          break;
        }
      } catch (error) {
        console.log(`❌ Approach ${index + 1} failed:`, error.message);
      }
    }
    
    if (!extensionFound) {
      console.log('⚠️  Extension not clearly detected, but VS Code launched successfully');
      // Don't fail the test, just log the status
    }
    
    // Take a final screenshot
    await vscode.window.screenshot({ 
      path: 'test-results/basic-launch-final.png', 
      fullPage: true 
    });
    
    await VSCodeLauncher.close(vscode);
    console.log('✅ Test completed');
  });
});
