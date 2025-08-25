import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

describe('Extension Test Suite', () => {
	test('Extension should be present', () => {
		expect(vscode.extensions.getExtension('carbonara.carbonara-vscode')).toBeDefined();
	});

	test('Extension should activate', async () => {
		const extension = vscode.extensions.getExtension('carbonara.carbonara-vscode');
		expect(extension).toBeDefined();
		
		if (extension && !extension.isActive) {
			await extension.activate();
		}
		
		expect(extension?.isActive).toBe(true);
	});

	test('Commands should be registered', async () => {
		const extension = vscode.extensions.getExtension('carbonara.carbonara-vscode');
		expect(extension).toBeDefined();
		
		if (extension && !extension.isActive) {
			await extension.activate();
		}

		const commands = await vscode.commands.getCommands();
		const carbonaraCommands = commands.filter(cmd => cmd.startsWith('carbonara.'));
		
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
			expect(carbonaraCommands).toContain(expectedCmd);
		});
	});

	test('Tree views should be registered', async () => {
		const extension = vscode.extensions.getExtension('carbonara.carbonara-vscode');
		expect(extension).toBeDefined();
		
		if (extension && !extension.isActive) {
			await extension.activate();
		}

		await expect(vscode.commands.executeCommand('carbonara.refreshAssessment')).resolves.toBeUndefined();
		await expect(vscode.commands.executeCommand('carbonara.refreshData')).resolves.toBeUndefined();
	});

	test('Status bar item should be created', async () => {
		const extension = vscode.extensions.getExtension('carbonara.carbonara-vscode');
		expect(extension).toBeDefined();
		
		if (extension && !extension.isActive) {
			await extension.activate();
		}
		await expect(vscode.commands.executeCommand('carbonara.showMenu')).resolves.toBeUndefined();
	});
});

describe('Tree Provider Tests', () => {
	const testWorkspaceRoot = path.join(__dirname, '..', '..', '..', '..', 'tests', 'unit');
	
	test('DataTreeProvider should handle missing workspace folder gracefully', async () => {
		const extension = vscode.extensions.getExtension('carbonara.carbonara-vscode');
		expect(extension).toBeDefined();
		
		if (extension && !extension.isActive) {
			await extension.activate();
		}

		await expect(vscode.commands.executeCommand('carbonara.refreshData')).resolves.toBeUndefined();
	});

	test('AssessmentTreeProvider should handle missing workspace folder gracefully', async () => {
		const extension = vscode.extensions.getExtension('carbonara.carbonara-vscode');
		expect(extension).toBeDefined();
		
		if (extension && !extension.isActive) {
			await extension.activate();
		}

		await expect(vscode.commands.executeCommand('carbonara.refreshAssessment')).resolves.toBeUndefined();
	});

	const configPath = path.join(testWorkspaceRoot, 'carbonara.config.json');
	test.skipIf(!fs.existsSync(configPath))('Tree providers should work with test workspace', async () => {
		const extension = vscode.extensions.getExtension('carbonara.carbonara-vscode');
		expect(extension).toBeDefined();
		
		if (extension && !extension.isActive) {
			await extension.activate();
		}

		await expect(vscode.commands.executeCommand('carbonara.exportDataJson')).resolves.toBeUndefined();
	}, 10000);
});

describe('CLI Integration Tests', () => {
	const testWorkspaceRoot = path.join(__dirname, '..', '..', '..', '..', 'tests', 'unit');
	
	test('Should find CLI in monorepo structure', () => {
		const cliPath = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'packages', 'cli', 'src', 'index.js');
		expect(fs.existsSync(cliPath)).toBe(true);
	});

	test('Test workspace should have carbonara config', () => {
		const configPath = path.join(testWorkspaceRoot, 'carbonara.config.json');
		expect(fs.existsSync(configPath)).toBe(true);
	});

	test('Test workspace should have database', () => {
		const dbPath = path.join(testWorkspaceRoot, 'carbonara.db');
		expect(fs.existsSync(dbPath)).toBe(true);
	});
});