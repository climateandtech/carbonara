import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ToolsTreeProvider, ToolItem } from '../tools-tree-provider';

suite('ToolsTreeProvider Unit Tests', () => {
    let provider: ToolsTreeProvider;
    let originalWorkspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;
    let testWorkspaceFolder: vscode.WorkspaceFolder;

    setup(() => {
        // Mock workspace folders
        originalWorkspaceFolders = vscode.workspace.workspaceFolders;
        
        // Create mock test workspace folder
        testWorkspaceFolder = {
            uri: vscode.Uri.file('/test/workspace'),
            name: 'test-workspace',
            index: 0
        };
        
        Object.defineProperty(vscode.workspace, 'workspaceFolders', {
            value: [testWorkspaceFolder],
            configurable: true
        });
        
        // Set CLI path for tests - point to the actual CLI in the monorepo
        const cliPath = path.join(__dirname, '..', '..', '..', '..', 'packages', 'cli', 'dist', 'index.js');
        process.env.CARBONARA_CLI_PATH = cliPath;
        
        // Set registry path for tests - point to the tools registry
        const registryPath = path.join(__dirname, '..', '..', '..', '..', 'packages', 'cli', 'src', 'registry', 'tools.json');
        process.env.CARBONARA_REGISTRY_PATH = registryPath;
        
        provider = new ToolsTreeProvider();
    });

    teardown(() => {
        // Restore original workspace folders
        Object.defineProperty(vscode.workspace, 'workspaceFolders', {
            value: originalWorkspaceFolders,
            configurable: true
        });
    });

    suite('Workspace Tools Registry Loading', () => {
        test('should load fallback tools when no CLI available', async () => {
            // Wait for tools to load by calling the async loadTools method directly
            await (provider as any).loadTools();
            
            // Now trigger tree view update
            const children = await provider.getChildren();
            
            // Should have loaded some tools (either from registry or fallback)
            assert.ok(children.length > 0, 'Should have loaded tools');
            
            // Should have both built-in and external tools
            const builtinTools = children.filter(child => child.tool.type === 'built-in');
            const externalTools = children.filter(child => child.tool.type === 'external');
            
            assert.ok(builtinTools.length > 0, 'Should have at least one built-in tool');
            assert.ok(externalTools.length > 0, 'Should have at least one external tool');
        });

        test('should have expected tool structure', async () => {
            // Wait for tools to load
            await (provider as any).loadTools();
            
            // Test the structure and properties of loaded tools
            const children = await provider.getChildren();
            
            // Should have loaded tools
            assert.ok(children.length >= 3, 'Should have at least 3 tools (1 built-in + 2 external)');
            
            // Check that tools have required properties
            children.forEach(child => {
                assert.ok(child.tool.id, 'Tool should have an id');
                assert.ok(child.tool.name, 'Tool should have a name');
                assert.ok(child.tool.description, 'Tool should have a description');
                assert.ok(child.tool.type === 'built-in' || child.tool.type === 'external', 'Tool should have valid type');
                assert.ok(child.tool.command, 'Tool should have a command');
            });
        });
    });

    suite('Tool Item Creation', () => {
        test('should create built-in tool items with correct properties', () => {
            const mockTool = {
                id: 'test-tool',
                name: 'Test Tool',
                description: 'A test tool',
                type: 'built-in' as const,
                command: 'built-in'
            };

            const analyzeCommand = {
                command: 'carbonara.analyzeTool',
                title: 'Analyze with tool',
                arguments: ['test-tool']
            };

            const toolItem = new ToolItem(mockTool, vscode.TreeItemCollapsibleState.None, analyzeCommand);

            assert.strictEqual(toolItem.label, 'Test Tool');
            assert.strictEqual(toolItem.tooltip, 'A test tool');
            assert.strictEqual(toolItem.description, 'Built-in');
            assert.strictEqual(toolItem.contextValue, 'builtin-tool');
            assert.strictEqual(toolItem.command?.command, 'carbonara.analyzeTool');
        });

        test('should create external uninstalled tool items with correct properties', () => {
            const mockTool = {
                id: 'external-tool',
                name: 'External Tool',
                description: 'An external tool',
                type: 'external' as const,
                command: 'npm',
                isInstalled: false
            };

            const installCommand = {
                command: 'carbonara.installTool',
                title: 'Install tool',
                arguments: ['external-tool']
            };

            const toolItem = new ToolItem(mockTool, vscode.TreeItemCollapsibleState.None, installCommand);

            assert.strictEqual(toolItem.label, 'External Tool');
            assert.strictEqual(toolItem.tooltip, 'An external tool');
            assert.strictEqual(toolItem.description, 'Not installed');
            assert.strictEqual(toolItem.contextValue, 'uninstalled-tool');
            assert.strictEqual(toolItem.command?.command, 'carbonara.installTool');
        });
    });

    suite('Tree Data Provider Interface', () => {
        test('should return TreeItem for getTreeItem', () => {
            const mockTool = {
                id: 'test-tool',
                name: 'Test Tool',
                description: 'A test tool',
                type: 'built-in' as const,
                command: 'built-in'
            };

            const toolItem = new ToolItem(mockTool, vscode.TreeItemCollapsibleState.None);
            const result = provider.getTreeItem(toolItem);

            assert.strictEqual(result, toolItem);
        });

        test('should return empty array for child elements', async () => {
            const mockTool = {
                id: 'test-tool',
                name: 'Test Tool',
                description: 'A test tool',
                type: 'built-in' as const,
                command: 'built-in'
            };

            const toolItem = new ToolItem(mockTool, vscode.TreeItemCollapsibleState.None);
            const children = await provider.getChildren(toolItem);

            assert.strictEqual(children.length, 0);
        });
    });

    suite('Tool Detection Logic', () => {
        test('should correctly identify built-in tools as installed', () => {
            const builtinTool = {
                id: 'builtin-tool',
                name: 'Built-in Tool',
                description: 'A built-in tool',
                type: 'built-in' as const,
                command: 'built-in'
            };

            const toolItem = new ToolItem(builtinTool, vscode.TreeItemCollapsibleState.None);
            
            assert.strictEqual(toolItem.description, 'Built-in');
            assert.strictEqual(toolItem.contextValue, 'builtin-tool');
        });

        test('should detect external tool as installed when command succeeds', async () => {
            // Mock runCommand to succeed
            const originalRunCommand = (provider as any).runCommand;
            (provider as any).runCommand = async () => Promise.resolve('success');

            try {
                const mockTool = {
                    detection: {
                        method: 'command',
                        target: 'npm --version'
                    }
                };

                const isInstalled = await (provider as any).detectToolInstallation(mockTool);
                assert.strictEqual(isInstalled, true, 'Should detect tool as installed when command succeeds');
            } finally {
                // Restore original method
                (provider as any).runCommand = originalRunCommand;
            }
        });

        test('should detect external tool as not installed when command fails', async () => {
            // Mock runCommand to fail
            const originalRunCommand = (provider as any).runCommand;
            (provider as any).runCommand = async () => Promise.reject(new Error('Command not found'));

            try {
                const mockTool = {
                    detection: {
                        method: 'command',
                        target: 'nonexistent-command --version'
                    }
                };

                const isInstalled = await (provider as any).detectToolInstallation(mockTool);
                assert.strictEqual(isInstalled, false, 'Should detect tool as not installed when command fails');
            } finally {
                // Restore original method
                (provider as any).runCommand = originalRunCommand;
            }
        });

        test('should default to not installed for tools without command detection', async () => {
            const mockToolNoDetection = {};
            const mockToolWrongMethod = {
                detection: {
                    method: 'file',
                    target: '/some/file'
                }
            };

            const isInstalled1 = await (provider as any).detectToolInstallation(mockToolNoDetection);
            const isInstalled2 = await (provider as any).detectToolInstallation(mockToolWrongMethod);

            assert.strictEqual(isInstalled1, false, 'Should default to not installed when no detection method');
            assert.strictEqual(isInstalled2, false, 'Should default to not installed when detection method is not "command"');
        });

        test('should create correct tool items based on installation status', () => {
            const installedTool = {
                id: 'installed-tool',
                name: 'Installed Tool',
                description: 'An installed external tool',
                type: 'external' as const,
                command: 'npm',
                isInstalled: true
            };

            const uninstalledTool = {
                id: 'uninstalled-tool',
                name: 'Uninstalled Tool',
                description: 'An uninstalled external tool',
                type: 'external' as const,
                command: 'npm',
                isInstalled: false
            };

            const installedItem = new ToolItem(installedTool, vscode.TreeItemCollapsibleState.None);
            const uninstalledItem = new ToolItem(uninstalledTool, vscode.TreeItemCollapsibleState.None);

            // Installed external tool should show as "Installed"
            assert.strictEqual(installedItem.description, 'Installed');
            assert.strictEqual(installedItem.contextValue, 'installed-tool');

            // Uninstalled external tool should show as "Not installed"
            assert.strictEqual(uninstalledItem.description, 'Not installed');
            assert.strictEqual(uninstalledItem.contextValue, 'uninstalled-tool');
        });
    });
});
