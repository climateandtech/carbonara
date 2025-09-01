import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Import mocha test globals
import 'mocha';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Extension should be present', () => {
		assert.ok(vscode.extensions.getExtension('carbonara.carbonara-vscode'));
	});

	test('Extension should activate', async () => {
		const extension = vscode.extensions.getExtension('carbonara.carbonara-vscode');
		assert.ok(extension);
		
		if (!extension!.isActive) {
			await extension!.activate();
		}
		
		assert.strictEqual(extension!.isActive, true);
	});

	test('Commands should be registered', async () => {
		const extension = vscode.extensions.getExtension('carbonara.carbonara-vscode');
		assert.ok(extension);
		
		if (!extension!.isActive) {
			await extension!.activate();
		}

		const commands = await vscode.commands.getCommands();
		const carbonaraCommands = commands.filter(cmd => cmd.startsWith('carbonara.'));
		
		// Verify key commands are registered
		const expectedCommands = [
			'carbonara.showMenu',
			'carbonara.initProject',
			'carbonara.runAssessment',
			'carbonara.refreshAssessment',
			'carbonara.refreshData',
			'carbonara.exportDataJson',
			'carbonara.exportDataCsv'
		];

		expectedCommands.forEach(expectedCmd => {
			assert.ok(carbonaraCommands.includes(expectedCmd), `Command ${expectedCmd} should be registered`);
		});
	});

	test('Tree views should be registered', async () => {
		const extension = vscode.extensions.getExtension('carbonara.carbonara-vscode');
		assert.ok(extension);
		
		if (!extension!.isActive) {
			await extension!.activate();
		}

		// Check if tree views exist by trying to execute refresh commands
		// This indirectly verifies the tree providers are registered
		await assert.doesNotReject(async () => {
			await vscode.commands.executeCommand('carbonara.refreshAssessment');
		}, 'Assessment tree refresh command should be available');

		await assert.doesNotReject(async () => {
			await vscode.commands.executeCommand('carbonara.refreshData');
		}, 'Data tree refresh command should be available');
	});

	test('Status bar item should be created', async () => {
		const extension = vscode.extensions.getExtension('carbonara.carbonara-vscode');
		assert.ok(extension);
		
		if (!extension!.isActive) {
			await extension!.activate();
		}

		// Verify the showMenu command is registered (status bar item should trigger this)
		const commands = await vscode.commands.getCommands();
		const hasShowMenuCommand = commands.includes('carbonara.showMenu');
		assert.ok(hasShowMenuCommand, 'Status bar showMenu command should be registered');
		
		// Note: We don't execute the command as it shows an interactive QuickPick
		// that would hang in test environment waiting for user input
	});
});

suite('Tree Provider Tests', () => {
	const testWorkspaceRoot = path.join(__dirname, '..', '..', '..', '..', 'test');
	
	test('DataTreeProvider should handle missing workspace folder gracefully', async () => {
		const extension = vscode.extensions.getExtension('carbonara.carbonara-vscode');
		assert.ok(extension);
		
		if (!extension!.isActive) {
			await extension!.activate();
		}

		// Test that refresh command doesn't throw when no workspace
		await assert.doesNotReject(async () => {
			await vscode.commands.executeCommand('carbonara.refreshData');
		}, 'Data tree should handle missing workspace gracefully');
	});

	test('AssessmentTreeProvider should handle missing workspace folder gracefully', async () => {
		const extension = vscode.extensions.getExtension('carbonara.carbonara-vscode');
		assert.ok(extension);
		
		if (!extension!.isActive) {
			await extension!.activate();
		}

		// Test that refresh command doesn't throw when no workspace
		await assert.doesNotReject(async () => {
			await vscode.commands.executeCommand('carbonara.refreshAssessment');
		}, 'Assessment tree should handle missing workspace gracefully');
	});

	test('Tree providers should work with test workspace', async function() {
		this.timeout(10000); // Allow more time for workspace operations
		
		// Check if test workspace has expected files
		const configPath = path.join(testWorkspaceRoot, 'carbonara.config.json');
		if (!fs.existsSync(configPath)) {
			this.skip(); // Skip if test workspace is not set up
		}

		const extension = vscode.extensions.getExtension('carbonara.carbonara-vscode');
		assert.ok(extension);
		
		if (!extension!.isActive) {
			await extension!.activate();
		}

		// Test data export functionality
		await assert.doesNotReject(async () => {
			await vscode.commands.executeCommand('carbonara.exportDataJson');
		}, 'Data export should work in test workspace');
	});
});

suite('CLI Integration Tests', () => {
	const testWorkspaceRoot = path.join(__dirname, '..', '..', '..', 'e2e', 'fixtures', 'with-carbonara-project');
	
	test('Should find CLI in monorepo structure', function() {
		this.timeout(5000);
		
		// Check if CLI exists at expected location
		const cliPath = path.join(testWorkspaceRoot, '..', '..', '..', '..', '..', 'packages', 'cli', 'src', 'index.ts');
		assert.ok(fs.existsSync(cliPath), `CLI should exist at ${cliPath}`);
	});

	test('Test workspace should have carbonara config', function() {
		const configPath = path.join(testWorkspaceRoot, 'carbonara.config.json');
		assert.ok(fs.existsSync(configPath), `Config should exist at ${configPath}`);
	});

	test('Test workspace should have database', function() {
		const dbPath = path.join(testWorkspaceRoot, 'carbonara.db');
		assert.ok(fs.existsSync(dbPath), `Database should exist at ${dbPath}`);
	});
}); 