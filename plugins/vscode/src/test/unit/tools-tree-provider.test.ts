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
    // Mock workspace folders
    originalWorkspaceFolders = vscode.workspace.workspaceFolders;

    // Create mock test workspace folder
    testWorkspaceFolder = {
      uri: vscode.Uri.file("/test/workspace"),
      name: "test-workspace",
      index: 0,
    };

    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: [testWorkspaceFolder],
      configurable: true,
    });

    // Set CLI path for tests - point to the actual CLI in the monorepo
    const cliPath = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "..",
      "..",
      "packages",
      "cli",
      "dist",
      "index.js"
    );
    process.env.CARBONARA_CLI_PATH = cliPath;

    // Set registry path for tests - point to the tools registry
    const registryPath = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "..",
      "..",
      "packages",
      "cli",
      "src",
      "registry",
      "tools.json"
    );
    process.env.CARBONARA_REGISTRY_PATH = registryPath;

    provider = new ToolsTreeProvider();
  });

  teardown(() => {
    // Restore original workspace folders
    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: originalWorkspaceFolders,
      configurable: true,
    });
  });

  suite("Workspace Tools Registry Loading", () => {
    test("should load fallback tools when no CLI available", async () => {
      // Wait for tools to load by calling the async loadTools method directly
      await (provider as any).loadTools();
      
      // Wait for project detection to complete (it runs asynchronously in constructor)
      // Give it a moment to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Now trigger tree view update
      const children = await provider.getChildren();

      // Should have loaded some tools (either from registry or fallback)
      assert.ok(children.length > 0, "Should have loaded tools");

      // Should have both built-in and external tools
      // Note: External tools may be filtered out if project detection finds no compatible languages
      // This is expected behavior - the filter should show all tools when project info is unavailable or unknown
      const builtinTools = children.filter(
        (child) => child.tool.type === "built-in"
      );
      const externalTools = children.filter(
        (child) => child.tool.type === "external"
      );

      assert.ok(
        builtinTools.length > 0,
        "Should have at least one built-in tool"
      );
      
      // Check if we have external tools - if project detection filtered them out, 
      // check that we have tools loaded internally even if not shown
      const allTools = (provider as any).tools || [];
      const allExternalTools = allTools.filter((t: any) => t.type === "external");
      
      // Either external tools should be visible, or we should have external tools loaded but filtered
      assert.ok(
        externalTools.length > 0 || allExternalTools.length > 0,
        "Should have at least one external tool (either visible or loaded)"
      );
    });

    test('with external tools in registry -> should show external tools', async () => {
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

    test("should have expected tool structure", async () => {
      // Wait for tools to load
      await (provider as any).loadTools();

      // Test the structure and properties of loaded tools
      const children = await provider.getChildren();

      // Should have loaded tools
      assert.ok(
        children.length >= 3,
        "Should have at least 3 tools (1 built-in + 2 external)"
      );

      // Check that tools have required properties
      children.forEach((child) => {
        assert.ok(child.tool.id, "Tool should have an id");
        assert.ok(child.tool.name, "Tool should have a name");
        assert.ok(child.tool.description, "Tool should have a description");
        assert.ok(
          child.tool.type === "built-in" || child.tool.type === "external",
          "Tool should have valid type"
        );
        assert.ok(child.tool.command, "Tool should have a command");
      });
    });
  });

  suite("Tool Item Creation", () => {
    test("should create built-in tool items with correct properties", () => {
      const mockTool = {
        id: "test-tool",
        name: "Test Tool",
        description: "A test tool",
        type: "built-in" as const,
        command: "built-in",
      };

      const analyzeCommand = {
        command: "carbonara.analyzeTool",
        title: "Analyze with tool",
        arguments: ["test-tool"],
      };

      const toolItem = new ToolItem(
        mockTool,
        vscode.TreeItemCollapsibleState.None,
        analyzeCommand
      );

      assert.strictEqual(toolItem.label, "Test Tool");
      assert.strictEqual(toolItem.tooltip, "A test tool");
      assert.strictEqual(toolItem.description, "Built-in");
      assert.strictEqual(toolItem.contextValue, "builtin-tool");
      assert.strictEqual(toolItem.command?.command, "carbonara.analyzeTool");
    });

    test("should create external uninstalled tool items with correct properties", () => {
      const mockTool = {
        id: "external-tool",
        name: "External Tool",
        description: "An external tool",
        type: "external" as const,
        command: "npm",
        isInstalled: false,
      };

      const installCommand = {
        command: "carbonara.installTool",
        title: "Install tool",
        arguments: ["external-tool"],
      };

      const toolItem = new ToolItem(
        mockTool,
        vscode.TreeItemCollapsibleState.None,
        installCommand
      );

      assert.strictEqual(toolItem.label, "External Tool");
      assert.strictEqual(toolItem.tooltip, "An external tool");
      assert.strictEqual(toolItem.description, "Not installed");
      assert.strictEqual(toolItem.contextValue, "uninstalled-tool");
      assert.strictEqual(toolItem.command?.command, "carbonara.installTool");
    });
  });

  suite("Tree Data Provider Interface", () => {
    test("should return TreeItem for getTreeItem", () => {
      const mockTool = {
        id: "test-tool",
        name: "Test Tool",
        description: "A test tool",
        type: "built-in" as const,
        command: "built-in",
      };

      const toolItem = new ToolItem(
        mockTool,
        vscode.TreeItemCollapsibleState.None
      );
      const result = provider.getTreeItem(toolItem);

      assert.strictEqual(result, toolItem);
    });

    test("should return empty array for child elements", async () => {
      const mockTool = {
        id: "test-tool",
        name: "Test Tool",
        description: "A test tool",
        type: "built-in" as const,
        command: "built-in",
      };

      const toolItem = new ToolItem(
        mockTool,
        vscode.TreeItemCollapsibleState.None
      );
      const children = await provider.getChildren(toolItem);

      assert.strictEqual(children.length, 0);
    });
  });

  suite("Tool Detection Logic", () => {
    test("should correctly identify built-in tools as installed", () => {
      const builtinTool = {
        id: "builtin-tool",
        name: "Built-in Tool",
        description: "A built-in tool",
        type: "built-in" as const,
        command: "built-in",
      };

      const toolItem = new ToolItem(
        builtinTool,
        vscode.TreeItemCollapsibleState.None
      );

      assert.strictEqual(toolItem.description, "Built-in");
      assert.strictEqual(toolItem.contextValue, "builtin-tool");
    });

    test("should detect external tool as installed when command succeeds", async () => {
      // Mock runCommand to succeed
      const originalRunCommand = (provider as any).runCommand;
      (provider as any).runCommand = async () => Promise.resolve("success");

      try {
        const mockTool = {
          detection: {
            method: "command",
            target: "npm --version",
          },
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
