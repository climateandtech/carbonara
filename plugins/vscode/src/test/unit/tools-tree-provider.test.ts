import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ToolsTreeProvider, ToolItem } from '../../tools-tree-provider';

suite('ToolsTreeProvider Unit Tests', () => {
    let provider: ToolsTreeProvider;
    let originalWorkspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;
    let testWorkspaceFolder: vscode.WorkspaceFolder;

    setup(() => {
        // Set test environment to skip tool detection
        process.env.NODE_ENV = 'test';
        process.env.MOCHA_TEST = 'true';

        // Mock workspace folders
        originalWorkspaceFolders = vscode.workspace.workspaceFolders;

        // Create a temporary test workspace folder
        const tempDir = fs.mkdtempSync(path.join('/tmp', 'carbonara-tools-test-'));

        // Create .carbonara directory and config file to simulate initialized state
        const carbonaraDir = path.join(tempDir, '.carbonara');
        fs.mkdirSync(carbonaraDir, { recursive: true });
        fs.writeFileSync(
            path.join(carbonaraDir, 'carbonara.config.json'),
            JSON.stringify({ name: 'test-project', initialized: true }, null, 2)
        );

        // Create mock test workspace folder
        testWorkspaceFolder = {
            uri: vscode.Uri.file(tempDir),
            name: 'test-workspace',
            index: 0
        };

        Object.defineProperty(vscode.workspace, 'workspaceFolders', {
            value: [testWorkspaceFolder],
            configurable: true
        });

        // Set CLI path for tests - point to the actual CLI in the monorepo
        const cliPath = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'cli', 'dist', 'index.js');
        process.env.CARBONARA_CLI_PATH = cliPath;

        // Set registry path for tests - point to the tools registry
        const registryPath = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'cli', 'src', 'registry', 'tools.json');
        process.env.CARBONARA_REGISTRY_PATH = registryPath;

        provider = new ToolsTreeProvider();
    });

    teardown(() => {
        // Clean up temporary test workspace
        if (testWorkspaceFolder && fs.existsSync(testWorkspaceFolder.uri.fsPath)) {
            fs.rmSync(testWorkspaceFolder.uri.fsPath, { recursive: true, force: true });
        }

        // Restore original workspace folders
        Object.defineProperty(vscode.workspace, 'workspaceFolders', {
            value: originalWorkspaceFolders,
            configurable: true
        });
    });

    suite('Workspace Tools Registry Loading', () => {
        test('with external tools in registry -> should show external tools', async function() {
            this.timeout(5000); // Increase timeout for this test
            // Load tools from actual registry (which includes both built-in and external)
            await (provider as any).loadTools();
            
            const children = await provider.getChildren();
            
            // Should have loaded tools
            assert.ok(children.length > 0, 'Should have loaded tools from registry');
            
            // Should have built-in tools
            const builtinTools = children.filter(child => child.tool.type === 'built-in');
            assert.ok(builtinTools.length > 0, 'Should have at least one built-in tool');
            
            // Should have external tools (registry contains external tools)
            const externalTools = children.filter(child => child.tool.type === 'external');
            assert.ok(externalTools.length > 0, 'Should have at least one external tool when registry contains them');
            
            // Verify external tools are correctly categorized
            externalTools.forEach(tool => {
                assert.strictEqual(tool.tool.type, 'external', 'Tool should be categorized as external');
                assert.ok(tool.tool.installation, 'External tool should have installation config');
                assert.ok(['npm', 'pip', 'binary', 'docker'].includes(tool.tool.installation.type), 'External tool should have external installation type');
            });
        });

        test('without external tools in registry -> should only show built-in tools', async () => {
            // Create a mock registry with only built-in tools
            const mockRegistryWithOnlyBuiltIn = {
                tools: [
                    {
                        id: 'co2-assessment',
                        name: 'CO2 Assessment',
                        description: 'Interactive CO2 sustainability assessment questionnaire',
                        command: {
                            executable: 'built-in',
                            args: [],
                            outputFormat: 'json'
                        },
                        installation: {
                            type: 'built-in',
                            package: 'built-in',
                            instructions: 'Built-in tool'
                        },
                        detection: {
                            method: 'built-in',
                            target: 'always-available'
                        }
                    }
                ]
            };
            
            // Create temporary registry file
            const tempDir = fs.mkdtempSync(path.join('/tmp', 'carbonara-test-registry-'));
            const tempRegistryPath = path.join(tempDir, 'tools.json');
            fs.writeFileSync(tempRegistryPath, JSON.stringify(mockRegistryWithOnlyBuiltIn, null, 2));
            
            // Store original registry path
            const originalRegistryPath = process.env.CARBONARA_REGISTRY_PATH;
            
            try {
                // Point to our temporary registry
                process.env.CARBONARA_REGISTRY_PATH = tempRegistryPath;
                
                // Create new provider to load from temporary registry
                const testProvider = new ToolsTreeProvider();
                await (testProvider as any).loadTools();
                
                const children = await testProvider.getChildren();
                
                // Should have loaded tools
                assert.ok(children.length > 0, 'Should have loaded tools from registry');
                
                // Should have built-in tools
                const builtinTools = children.filter(child => child.tool.type === 'built-in');
                assert.ok(builtinTools.length > 0, 'Should have at least one built-in tool');
                
                // Should NOT have external tools
                const externalTools = children.filter(child => child.tool.type === 'external');
                assert.strictEqual(externalTools.length, 0, 'Should have no external tools when registry only contains built-in tools');
                
                // Verify all tools are built-in
                children.forEach(child => {
                    assert.strictEqual(child.tool.type, 'built-in', 'All tools should be built-in when registry only contains built-in tools');
                });
            } finally {
                // Restore original registry path
                if (originalRegistryPath) {
                    process.env.CARBONARA_REGISTRY_PATH = originalRegistryPath;
                } else {
                    delete process.env.CARBONARA_REGISTRY_PATH;
                }
                
                // Clean up temporary file
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        });

        test('should have expected tool structure', async function() {
            this.timeout(5000); // Increase timeout for this test
            // Wait for tools to load
            await (provider as any).loadTools();
            
            // Test the structure and properties of loaded tools
            const children = await provider.getChildren();
            
            // Should have loaded at least built-in tools
            assert.ok(children.length > 0, 'Should have loaded tools');
            
            // Check that tools have required properties
            children.forEach(child => {
                assert.ok(child.tool.id, 'Tool should have an id');
                assert.ok(child.tool.name, 'Tool should have a name');
                assert.ok(child.tool.description, 'Tool should have a description');
                assert.ok(child.tool.type === 'built-in' || child.tool.type === 'external', 'Tool should have valid type');
                assert.ok(child.tool.command, 'Tool should have a command');
        });

        test('should load tools with parameterDefaults and parameterMappings from tools.json', async function() {
            this.timeout(5000); // Increase timeout for this test
            
            // Wait for tools to load
            await (provider as any).loadTools();
            
            const children = await provider.getChildren();
            
            // Find IF Webpage Scan tool (should have parameterDefaults and parameterMappings)
            const ifWebpageTool = children.find(child => child.tool.id === 'if-webpage-scan');
            
            // Tool should be found if registry is loaded correctly
            assert.ok(ifWebpageTool, 'IF Webpage Scan tool should be found in registry');
            
            if (ifWebpageTool) {
                const tool = ifWebpageTool.tool as any;
                
                // Check that parameterDefaults exists and has correct values
                assert.ok(tool.parameterDefaults !== undefined, 'IF Webpage Scan tool should have parameterDefaults');
                assert.ok(typeof tool.parameterDefaults === 'object', 'parameterDefaults should be an object');
                assert.strictEqual(tool.parameterDefaults.scrollToBottom, false, 'scrollToBottom default should be false');
                assert.strictEqual(tool.parameterDefaults.firstVisitPercentage, 0.9, 'firstVisitPercentage default should be 0.9');
                
                // Check that parameterMappings exists
                assert.ok(tool.parameterMappings !== undefined, 'IF Webpage Scan tool should have parameterMappings');
                assert.ok(typeof tool.parameterMappings === 'object', 'parameterMappings should be an object');
                assert.ok(tool.parameterMappings.returnVisitPercentage !== undefined, 'Should have returnVisitPercentage mapping');
                assert.strictEqual(tool.parameterMappings.returnVisitPercentage.source, 'firstVisitPercentage', 'returnVisitPercentage should map from firstVisitPercentage');
                assert.ok(tool.parameterMappings.returnVisitPercentage.transform, 'returnVisitPercentage should have a transform');
            }
        });
    });

    suite('Tool Installation', () => {
        // Note: These tests are skipped because they require mocking dynamic imports
        // which is complex in the VSCode test environment. The installation logic
        // is tested in packages/cli/test/tool-installer.test.ts
        test.skip('should handle pip installation for semgrep', async function() {
            // Installation logic is tested in CLI package tests
            // This test would require complex mocking of dynamic imports
        });

        test.skip('should show error when installation fails', async function() {
            // Installation error handling is tested in CLI package tests
            // This test would require complex mocking of dynamic imports
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
            // Tooltip now includes installation instructions
            assert.ok((toolItem.tooltip as string).includes('A test tool'), 'Tooltip should include description');
            assert.ok((toolItem.tooltip as string).includes('Installation Instructions'), 'Tooltip should include installation instructions');
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
            // Tooltip now includes installation instructions
            assert.ok((toolItem.tooltip as string).includes('An external tool'), 'Tooltip should include description');
            assert.ok((toolItem.tooltip as string).includes('Installation Instructions'), 'Tooltip should include installation instructions');
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

    suite('CLI Detection (findCarbonaraCLI)', () => {
        let originalEnvPath: string | undefined;
        let originalWorkspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;

        setup(() => {
            originalEnvPath = process.env.CARBONARA_CLI_PATH;
            originalWorkspaceFolders = vscode.workspace.workspaceFolders;
        });

        teardown(() => {
            if (originalEnvPath) {
                process.env.CARBONARA_CLI_PATH = originalEnvPath;
            } else {
                delete process.env.CARBONARA_CLI_PATH;
            }
            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                value: originalWorkspaceFolders,
                configurable: true
            });
        });

        test('should prioritize environment variable CARBONARA_CLI_PATH', async () => {
            // Create a real file for the env path
            const tempDir = fs.mkdtempSync(path.join('/tmp', 'carbonara-cli-test-'));
            const envCliPath = path.join(tempDir, 'cli.js');
            fs.writeFileSync(envCliPath, '#!/usr/bin/env node\n// Mock CLI');
            process.env.CARBONARA_CLI_PATH = envCliPath;

            try {
                const cliPath = await (provider as any).findCarbonaraCLI();
                assert.strictEqual(cliPath, envCliPath, 'Should return environment variable path when set');
            } finally {
                delete process.env.CARBONARA_CLI_PATH;
                fs.unlinkSync(envCliPath);
                fs.rmdirSync(tempDir);
            }
        });

        test('should find bundled CLI when it exists', async () => {
            delete process.env.CARBONARA_CLI_PATH;

            // Get the actual __dirname from the compiled extension
            // In tests, __dirname points to dist/test/unit, so we need to go up to dist/
            const testDistDir = path.join(__dirname, '..');
            const actualBundledPath = path.join(testDistDir, 'node_modules', '@carbonara', 'cli', 'dist', 'index.js');

            // Create the bundled CLI path if it doesn't exist
            const bundledExists = fs.existsSync(actualBundledPath);
            if (!bundledExists) {
                fs.mkdirSync(path.dirname(actualBundledPath), { recursive: true });
                fs.writeFileSync(actualBundledPath, '#!/usr/bin/env node\n// Mock CLI');
            }

            const originalRunCommand = (provider as any).runCommand;

            // Mock workspace to not have monorepo path
            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                value: [{
                    uri: vscode.Uri.file('/tmp/not-monorepo'),
                    name: 'test',
                    index: 0
                }],
                configurable: true
            });

            // Mock runCommand to fail (simulating no global CLI)
            (provider as any).runCommand = async () => Promise.reject(new Error('Not found'));

            try {
                const cliPath = await (provider as any).findCarbonaraCLI();
                assert.ok(cliPath, 'Should find bundled CLI when it exists');
                // Should be the bundled path
                assert.ok(
                    cliPath.includes('@carbonara/cli'),
                    'Should return a CLI path containing @carbonara/cli'
                );
            } finally {
                (provider as any).runCommand = originalRunCommand;
                // Clean up only if we created it
                if (!bundledExists && fs.existsSync(actualBundledPath)) {
                    fs.unlinkSync(actualBundledPath);
                }
            }
        });

        // TODO: Skip this test when bundled CLI exists - bundled CLI takes priority over monorepo path
        // This is expected behavior in production, but makes it impossible to test monorepo path detection
        // in the test environment where the bundled CLI is always present
        test.skip('should check monorepo path when workspace is in monorepo', async () => {
            delete process.env.CARBONARA_CLI_PATH;

            // Create a mock workspace that looks like it's in the monorepo
            // The provider checks for workspaceRoot/../../packages/cli/dist/index.js
            // So if workspace is at /tmp/test/workspace, it looks for /tmp/packages/cli/dist/index.js
            const tempDir = fs.mkdtempSync(path.join('/tmp', 'carbonara-monorepo-test-'));
            const mockWorkspaceRoot = path.join(tempDir, 'some', 'nested', 'workspace');
            fs.mkdirSync(mockWorkspaceRoot, { recursive: true });
            
            // Create packages/cli/dist structure at the expected location (../../packages from workspace)
            // workspace is at tempDir/some/nested/workspace, so ../../packages is tempDir/packages
            const packagesDir = path.join(tempDir, 'packages');
            const cliDistDir = path.join(packagesDir, 'cli', 'dist');
            fs.mkdirSync(cliDistDir, { recursive: true });
            const mockMonorepoCliPath = path.join(cliDistDir, 'index.js');
            fs.writeFileSync(mockMonorepoCliPath, '#!/usr/bin/env node\n// Mock CLI');

            // Also need to temporarily remove bundled CLI if it exists
            const testDistDir = path.join(__dirname, '..');
            const bundledPath = path.join(testDistDir, 'node_modules', '@carbonara', 'cli', 'dist', 'index.js');
            const bundledExists = fs.existsSync(bundledPath);
            let tempBundledPath: string | null = null;
            if (bundledExists) {
                tempBundledPath = bundledPath + '.backup';
                try {
                    fs.renameSync(bundledPath, tempBundledPath);
                } catch (e) {
                    fs.copyFileSync(bundledPath, tempBundledPath);
                    fs.unlinkSync(bundledPath);
                }
            }

            const mockWorkspaceFolder = {
                uri: vscode.Uri.file(mockWorkspaceRoot),
                name: 'test-workspace',
                index: 0
            };

            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                value: [mockWorkspaceFolder],
                configurable: true
            });

            // Update provider's workspaceFolder property
            (provider as any).workspaceFolder = mockWorkspaceFolder;

            // Mock runCommand to fail (no global CLI)
            const originalRunCommand = (provider as any).runCommand;
            (provider as any).runCommand = async () => Promise.reject(new Error('Not found'));

            try {
                const cliPath = await (provider as any).findCarbonaraCLI();
                // The path should resolve to the monorepo CLI
                if (bundledExists) {
                    // When bundled CLI exists, it takes priority, so we can't test monorepo path
                    // Just verify that a CLI was found (which will be the bundled one)
                    assert.ok(cliPath, 'Bundled CLI found (expected when it exists)');
                    assert.ok(cliPath.includes('@carbonara/cli'), 'Should return bundled CLI path');
                } else {
                    assert.ok(cliPath, 'Should find monorepo CLI when workspace is in monorepo');
                    assert.ok(cliPath.includes('packages/cli'), 'Should return a CLI path containing packages/cli');
                }
            } finally {
                (provider as any).runCommand = originalRunCommand;
                // Restore bundled CLI if we moved it
                if (tempBundledPath && fs.existsSync(tempBundledPath)) {
                    try {
                        fs.renameSync(tempBundledPath, bundledPath);
                    } catch (e) {
                        fs.copyFileSync(tempBundledPath, bundledPath);
                        fs.unlinkSync(tempBundledPath);
                    }
                }
                // Clean up
                fs.unlinkSync(mockMonorepoCliPath);
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        });

        // TODO: Skip this test when bundled CLI exists - bundled CLI takes priority over global installation
        // This is expected behavior in production, but makes it impossible to test global CLI fallback
        // in the test environment where the bundled CLI is always present
        test.skip('should fall back to global installation when others not found', async () => {
            delete process.env.CARBONARA_CLI_PATH;

            // Mock runCommand to succeed (simulating global CLI available)
            const originalRunCommand = (provider as any).runCommand;
            (provider as any).runCommand = async () => Promise.resolve('carbonara version 0.1.0');

            // Mock workspace to not be in monorepo and ensure bundled path doesn't exist
            // The bundled path is relative to __dirname in the provider, which is dist/
            // In tests, __dirname is dist/test/unit, so we need to go up one level
            const testDistDir = path.join(__dirname, '..');
            const bundledPath = path.join(testDistDir, 'node_modules', '@carbonara', 'cli', 'dist', 'index.js');
            const bundledExists = fs.existsSync(bundledPath);
            let tempBundledPath: string | null = null;
            
            // Temporarily remove bundled CLI if it exists
            if (bundledExists) {
                tempBundledPath = bundledPath + '.backup';
                try {
                    fs.renameSync(bundledPath, tempBundledPath);
                } catch (e) {
                    // If rename fails, try copying and deleting
                    fs.copyFileSync(bundledPath, tempBundledPath);
                    fs.unlinkSync(bundledPath);
                }
            }

            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                value: [{
                    uri: vscode.Uri.file('/tmp/not-monorepo'),
                    name: 'test',
                    index: 0
                }],
                configurable: true
            });

            try {
                const cliPath = await (provider as any).findCarbonaraCLI();
                // If bundled CLI exists, it will be found first, so we skip this test
                if (bundledExists) {
                    console.log('Skipping global CLI test - bundled CLI exists and takes priority');
                    assert.ok(cliPath, 'Bundled CLI found (expected when it exists)');
                } else {
                    assert.strictEqual(cliPath, 'carbonara', 'Should return "carbonara" when global CLI is available');
                }
            } finally {
                (provider as any).runCommand = originalRunCommand;
                // Restore bundled CLI if we moved it
                if (tempBundledPath && fs.existsSync(tempBundledPath)) {
                    try {
                        fs.renameSync(tempBundledPath, bundledPath);
                    } catch (e) {
                        fs.copyFileSync(tempBundledPath, bundledPath);
                        fs.unlinkSync(tempBundledPath);
                    }
                }
            }
        });

        // TODO: Skip this test when bundled CLI exists - bundled CLI is always found when it exists
        // This is expected behavior in production, but makes it impossible to test the "no CLI found" scenario
        // in the test environment where the bundled CLI is always present
        test.skip('should return null when no CLI is found', async () => {
            delete process.env.CARBONARA_CLI_PATH;

            // Mock runCommand to fail (no global CLI)
            const originalRunCommand = (provider as any).runCommand;
            (provider as any).runCommand = async () => Promise.reject(new Error('Command not found'));

            // Mock workspace to not be in monorepo and ensure bundled path doesn't exist
            // The bundled path is relative to __dirname in the provider, which is dist/
            // In tests, __dirname is dist/test/unit, so we need to go up one level
            const testDistDir = path.join(__dirname, '..');
            const bundledPath = path.join(testDistDir, 'node_modules', '@carbonara', 'cli', 'dist', 'index.js');
            const bundledExists = fs.existsSync(bundledPath);
            let tempBundledPath: string | null = null;
            
            // Temporarily remove bundled CLI if it exists
            if (bundledExists) {
                tempBundledPath = bundledPath + '.backup';
                try {
                    fs.renameSync(bundledPath, tempBundledPath);
                } catch (e) {
                    // If rename fails, try copying and deleting
                    fs.copyFileSync(bundledPath, tempBundledPath);
                    fs.unlinkSync(bundledPath);
                }
            }

            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                value: [{
                    uri: vscode.Uri.file('/tmp/not-monorepo'),
                    name: 'test',
                    index: 0
                }],
                configurable: true
            });

            try {
                const cliPath = await (provider as any).findCarbonaraCLI();
                // If bundled CLI exists, we can't test this scenario, so skip
                if (bundledExists) {
                    console.log('Skipping "no CLI found" test - bundled CLI exists');
                    assert.ok(cliPath, 'Bundled CLI found (expected when it exists)');
                } else {
                    assert.strictEqual(cliPath, null, 'Should return null when no CLI is found');
                }
            } finally {
                (provider as any).runCommand = originalRunCommand;
                // Restore bundled CLI if we moved it
                if (tempBundledPath && fs.existsSync(tempBundledPath)) {
                    try {
                        fs.renameSync(tempBundledPath, bundledPath);
                    } catch (e) {
                        fs.copyFileSync(tempBundledPath, bundledPath);
                        fs.unlinkSync(tempBundledPath);
                    }
                }
            }
        });

        test('should check paths in correct priority order', async () => {
            // This test verifies the priority: env > bundled > monorepo > global
            const tempDir = fs.mkdtempSync(path.join('/tmp', 'carbonara-priority-test-'));
            const envPath = path.join(tempDir, 'cli.js');
            fs.writeFileSync(envPath, '#!/usr/bin/env node\n// Mock CLI');
            process.env.CARBONARA_CLI_PATH = envPath;

            const runCommandOriginal = (provider as any).runCommand;
            (provider as any).runCommand = async () => Promise.reject(new Error('Not found'));

            // Mock workspace to not be in monorepo
            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                value: [{
                    uri: vscode.Uri.file('/tmp/not-monorepo'),
                    name: 'test',
                    index: 0
                }],
                configurable: true
            });

            try {
                const cliPath = await (provider as any).findCarbonaraCLI();
                // Should return env path (highest priority)
                assert.strictEqual(cliPath, envPath, 'Should return environment variable path (highest priority)');
            } finally {
                (provider as any).runCommand = runCommandOriginal;
                delete process.env.CARBONARA_CLI_PATH;
                fs.unlinkSync(envPath);
                fs.rmdirSync(tempDir);
            }
        });
    });

    suite('Installation Instructions for Fresh Installation', () => {
        test('should include browser installation in IF Webpage Scan instructions', async function() {
            this.timeout(15000); // Increase timeout for this test (tool loading and detection can be slow)
            // Load tools from actual registry
            await (provider as any).loadTools();
            
            // Get tools via getChildren to access them (tools property is private)
            const children = await provider.getChildren();
            
            // Find IF Webpage Scan tool
            const ifWebpageScanItem = children.find(item => item.tool.id === 'if-webpage-scan');
            
            assert.ok(ifWebpageScanItem, 'IF Webpage Scan tool should exist in registry');
            
            const ifWebpageScanTool = ifWebpageScanItem.tool;
            assert.strictEqual(ifWebpageScanTool.type, 'external', 'IF Webpage Scan should be an external tool');
            assert.ok(ifWebpageScanTool.installation, 'IF Webpage Scan should have installation config');
            assert.strictEqual(ifWebpageScanTool.installation.type, 'npm', 'IF Webpage Scan should use npm installation');
            
            // Verify installation instructions include browser installation
            assert.ok(
                ifWebpageScanTool.installation.instructions,
                'IF Webpage Scan should have custom installation instructions'
            );
            
            const instructions = ifWebpageScanTool.installation.instructions;
            
            // Should include npm install commands (actual format: npm install @grnsft/if @tngtech/if-webpage-plugins)
            assert.ok(
                instructions.includes('npm install') && instructions.includes('@grnsft/if'),
                'Instructions should include Impact Framework installation'
            );
            assert.ok(
                instructions.includes('@tngtech/if-webpage-plugins'),
                'Instructions should include webpage plugins installation'
            );
            
            // Should include browser installation command (actual format: npx --package=@tngtech/if-webpage-plugins puppeteer browsers install chrome)
            assert.ok(
                instructions.includes('puppeteer browsers install'),
                'Instructions should include Puppeteer browser installation command'
            );
            
            // Verify prerequisites are defined
            assert.ok(
                ifWebpageScanTool.prerequisites && ifWebpageScanTool.prerequisites.length > 0,
                'IF Webpage Scan should have prerequisites defined'
            );
            
            const puppeteerPrereq = ifWebpageScanTool.prerequisites.find(
                (p: any) => p.type === 'puppeteer'
            );
            assert.ok(puppeteerPrereq, 'IF Webpage Scan should have Puppeteer prerequisite');
            assert.ok(
                puppeteerPrereq.setupInstructions,
                'Puppeteer prerequisite should have setup instructions'
            );
            assert.ok(
                puppeteerPrereq.setupInstructions.includes('puppeteer browsers install'),
                'Puppeteer setup instructions should mention browser installation'
            );
        });

        test('should generate complete installation document with browser setup', async function() {
            this.timeout(10000); // Increase timeout for this test (tool loading can be slow)
            // Import the installation provider
            const { ToolInstallationProvider } = await import('../../tool-installation-provider');
            const installationProvider = new ToolInstallationProvider();
            
            // Generate installation document for IF Webpage Scan
            const documentUri = vscode.Uri.parse('carbonara-tool-installation://if-webpage-scan');
            const cancellationToken = new vscode.CancellationTokenSource().token;
            const documentContent = await installationProvider.provideTextDocumentContent(documentUri, cancellationToken);
            
            assert.ok(documentContent, 'Installation document should be generated');
            
            // Verify document includes all necessary sections
            assert.ok(
                documentContent.includes('IF Webpage Scan'),
                'Document should include tool name'
            );
            assert.ok(
                documentContent.includes('Prerequisites'),
                'Document should include Prerequisites section'
            );
            assert.ok(
                documentContent.includes('Installation'),
                'Document should include Installation section'
            );
            
            // Verify installation instructions include browser installation (actual format: npm install @grnsft/if @tngtech/if-webpage-plugins)
            assert.ok(
                documentContent.includes('npm install') && documentContent.includes('@grnsft/if'),
                'Document should include Impact Framework installation'
            );
            assert.ok(
                documentContent.includes('@tngtech/if-webpage-plugins'),
                'Document should include webpage plugins installation'
            );
            assert.ok(
                documentContent.includes('puppeteer browsers install'),
                'Document should include Puppeteer browser installation command'
            );
            
            // Verify prerequisites are mentioned
            assert.ok(
                documentContent.includes('Puppeteer') || documentContent.includes('puppeteer'),
                'Document should mention Puppeteer in prerequisites'
            );
        });
    });

    suite('Error Handling in analyzeTool', () => {
        test('should handle errors gracefully when CLI command fails', async function() {
            this.timeout(10000); // Increase timeout for this test (tool loading can be slow)
            // Mock a tool
            const mockTool = {
                id: 'test-tool',
                name: 'Test Tool',
                type: 'external' as const,
                isInstalled: true,
                prerequisitesMissing: false
            };

            // Mock the tools array
            (provider as any).tools = [mockTool];

            // Mock findCarbonaraCLI to return a path
            const mockCliPath = '/path/to/carbonara';
            (provider as any).findCarbonaraCLI = async () => mockCliPath;

            // Mock runCarbonaraCommand to throw an error
            const mockError = new Error('Command failed: command not found');
            (provider as any).runCarbonaraCommand = async () => {
                throw mockError;
            };

            // Mock workspace folder
            const tempDir = fs.mkdtempSync(path.join('/tmp', 'carbonara-test-'));
            const carbonaraDir = path.join(tempDir, '.carbonara');
            fs.mkdirSync(carbonaraDir, { recursive: true });
            fs.writeFileSync(
                path.join(carbonaraDir, 'carbonara.config.json'),
                JSON.stringify({ name: 'test', projectId: 1, database: { path: '.carbonara/carbonara.db' } }, null, 2)
            );

            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                value: [{
                    uri: vscode.Uri.file(tempDir),
                    name: 'test',
                    index: 0
                }],
                configurable: true
            });

            // Mock window methods
            const showInputBoxStub = async () => 'https://example.com';
            const showErrorMessageStub = async () => undefined;

            // Replace vscode.window methods
            const originalShowInputBox = vscode.window.showInputBox;
            const originalShowErrorMessage = vscode.window.showErrorMessage;
            
            try {
                (vscode.window as any).showInputBox = showInputBoxStub;
                (vscode.window as any).showErrorMessage = showErrorMessageStub;

                // Call analyzeTool - should not throw even when command fails
                // The error should be caught and handled gracefully
                await (provider as any).analyzeTool('test-tool');

                // If we get here, the error was handled correctly
                // (cliPath and cliArgs should be accessible in catch block)
                assert.ok(true, 'Error was handled gracefully');
            } catch (error: any) {
                // Should not throw - error should be caught and handled
                assert.fail(`analyzeTool should not throw, but got: ${error.message}`);
            } finally {
                // Restore original methods
                (vscode.window as any).showInputBox = originalShowInputBox;
                (vscode.window as any).showErrorMessage = originalShowErrorMessage;
                
                // Cleanup
                if (fs.existsSync(tempDir)) {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                }
            }
        });

        test('should handle errors when cliPath is null', async () => {
            const mockTool = {
                id: 'test-tool',
                name: 'Test Tool',
                type: 'external' as const,
                isInstalled: true,
                prerequisitesMissing: false
            };

            (provider as any).tools = [mockTool];

            // Mock findCarbonaraCLI to return null
            (provider as any).findCarbonaraCLI = async () => null;

            // Mock showInputBox
            const showInputBoxStub = async () => 'https://example.com';
            const originalShowInputBox = vscode.window.showInputBox;
            
            try {
                (vscode.window as any).showInputBox = showInputBoxStub;

                // Should return early when cliPath is null
                await (provider as any).analyzeTool('test-tool');
                
                // Should not throw
                assert.ok(true, 'Should handle null cliPath gracefully');
            } finally {
                (vscode.window as any).showInputBox = originalShowInputBox;
            }
        });
    });

});
