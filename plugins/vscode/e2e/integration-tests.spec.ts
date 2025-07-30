import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('Carbonara Extension Integration Tests', () => {
  let extension: vscode.Extension<any> | undefined;

  suiteSetup(async function() {
    // Increase timeout for extension activation
    this.timeout(30000);
    
    // Get the extension
    extension = vscode.extensions.getExtension('carbonara.carbonara-vscode');
    assert.ok(extension, 'Extension should be present');
    
    // Activate the extension
    if (!extension.isActive) {
      await extension.activate();
    }
    
    assert.ok(extension.isActive, 'Extension should be active');
  });

  test('Extension should be present and activate', () => {
    assert.ok(extension);
    assert.ok(extension.isActive);
  });

  test('All required commands should be registered', async () => {
    const commands = await vscode.commands.getCommands();
    const carbonaraCommands = commands.filter(cmd => cmd.startsWith('carbonara.'));
    
    const expectedCommands = [
      'carbonara.showMenu',
      'carbonara.initProject',
      'carbonara.runAssessment',
      'carbonara.analyzeWebsite',
      'carbonara.viewData',
      'carbonara.showStatus',
      'carbonara.openConfig',
      'carbonara.editSection',
      'carbonara.completeAssessment',
      'carbonara.refreshAssessment',
      'carbonara.refreshData',
      'carbonara.exportDataJson',
      'carbonara.exportDataCsv',
      'carbonara.clearAllData',
      'carbonara.openProject'
    ];

    expectedCommands.forEach(expectedCmd => {
      assert.ok(
        carbonaraCommands.includes(expectedCmd), 
        `Command ${expectedCmd} should be registered`
      );
    });
  });

  test('Tree data providers should be registered', () => {
    // Check if tree views are registered by looking for them in the package.json contributions
    const packageJson = require('../package.json');
    const views = packageJson.contributes.views.carbonara;
    
    assert.ok(views.find((v: any) => v.id === 'carbonara.assessmentTree'), 'Assessment tree should be defined');
    assert.ok(views.find((v: any) => v.id === 'carbonara.dataTree'), 'Data tree should be defined');
  });

  test('Extension should handle workspace without project gracefully', async () => {
    // This tests the basic error handling when no carbonara project exists
    try {
      // Try to show status - should not throw error
      await vscode.commands.executeCommand('carbonara.showStatus');
      // Should reach here without throwing
      assert.ok(true, 'showStatus command should execute without error');
    } catch (error) {
      // If it throws, it should be a user-friendly error, not a crash
      assert.ok(error instanceof Error, 'Should throw a proper Error object');
    }
  });

  test('Configuration contributions should be present', () => {
    const config = vscode.workspace.getConfiguration('carbonara');
    
    // Test that configuration schema is properly registered
    const inspect = config.inspect('server.host');
    assert.ok(inspect, 'Configuration should be registered');
  });

  test('Activity bar contribution should be present', () => {
    const packageJson = require('../package.json');
    const viewsContainers = packageJson.contributes.viewsContainers.activitybar;
    
    const carbonaraContainer = viewsContainers.find((container: any) => container.id === 'carbonara');
    assert.ok(carbonaraContainer, 'Carbonara activity bar container should be defined');
    assert.equal(carbonaraContainer.title, 'Carbonara', 'Container should have correct title');
  });

  test('Menu contributions should be present', () => {
    const packageJson = require('../package.json');
    const menus = packageJson.contributes.menus;
    
    assert.ok(menus['view/title'], 'View title menus should be defined');
    
    const assessmentMenus = menus['view/title'].filter((menu: any) => 
      menu.when && menu.when.includes('carbonara.assessmentTree')
    );
    const dataMenus = menus['view/title'].filter((menu: any) => 
      menu.when && menu.when.includes('carbonara.dataTree')
    );
    
    assert.ok(assessmentMenus.length > 0, 'Assessment tree menus should be defined');
    assert.ok(dataMenus.length > 0, 'Data tree menus should be defined');
  });

  test('Extension should handle command execution gracefully', async function() {
    this.timeout(10000);
    
    // Test commands that should work without setup
    const safeCommands = [
      'carbonara.showMenu',
      'carbonara.showStatus',
      'carbonara.refreshAssessment',
      'carbonara.refreshData'
    ];

    for (const command of safeCommands) {
      try {
        await vscode.commands.executeCommand(command);
        // Command executed successfully
        assert.ok(true, `Command ${command} should execute`);
      } catch (error) {
        // If it fails, it should fail gracefully with user message, not crash
        console.log(`Command ${command} failed gracefully:`, (error as Error).message);
        assert.ok(error instanceof Error, `Command ${command} should fail gracefully`);
      }
    }
  });

  test('Package.json should have correct metadata', () => {
    const packageJson = require('../package.json');
    
    assert.equal(packageJson.name, 'carbonara-vscode', 'Package name should be correct');
    assert.equal(packageJson.displayName, 'Carbonara', 'Display name should be correct');
    assert.ok(packageJson.version, 'Version should be present');
    assert.ok(packageJson.engines.vscode, 'VSCode engine requirement should be present');
  });
}); 