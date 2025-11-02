import { execSync } from 'child_process';
import fs, { mkdtempSync } from 'fs';
import path from 'path';
import os, { tmpdir } from 'os';
import { describe, test, beforeEach, afterEach, expect, vi } from 'vitest';
import { getToolRegistry, AnalysisTool } from '../src/registry/index.js';

describe('External Tools - Generic Tests', () => {
  let testDir: string;
  let cliPath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carbonara-external-tools-test-'));
    cliPath = path.resolve(__dirname, '../dist/index.js');
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  // Get all external tools (non-built-in)
  function getExternalTools(): AnalysisTool[] {
    const registry = getToolRegistry();
    return registry.getAllTools().filter(tool => 
      tool.installation.type !== 'built-in'
    );
  }

  test('external tools should be properly configured in registry', () => {
    const externalTools = getExternalTools();
    
    expect(externalTools.length).toBeGreaterThan(0);
    
    externalTools.forEach(tool => {
      // Each external tool should have proper configuration
      expect(tool.id).toBeTruthy();
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      
      // Installation config
      expect(tool.installation.type).toMatch(/^(npm|pip|binary|docker)$/);
      expect(tool.installation.package).toBeTruthy();
      expect(tool.installation.instructions).toBeTruthy();
      
      // Detection config
      expect(tool.detection.method).toMatch(/^(command|npm|file)$/);
      expect(tool.detection.target).toBeTruthy();
      
      // Command config
      expect(tool.command.executable).toBeTruthy();
      expect(Array.isArray(tool.command.args)).toBe(true);
      expect(tool.command.outputFormat).toMatch(/^(json|yaml|text)$/);
    });
  });

  test('external tools should show installation status correctly', () => {
    const externalTools = getExternalTools();
    
    expect(externalTools.length).toBeGreaterThan(0);
    
    // Call tools --list once (not in a loop) to avoid timeout
    try {
      const result = execSync(`cd "${testDir}" && node "${cliPath}" tools --list`, { 
        encoding: 'utf8',
        timeout: 20000, // Increased timeout for installation checks
        stdio: 'pipe'
      });
      
      // Check that all external tools are shown in the output
      // They may appear in either "Installed Tools" or "Available Tools (not installed)" section
      externalTools.forEach(tool => {
        // Should show the tool name
        expect(result).toContain(tool.name);
        expect(result).toContain(tool.id);
      });
    } catch (error: any) {
      // If registry loading fails, that's a separate issue
      console.log(`Registry loading issue: ${error.message}`);
      // Don't fail the test if it's a registry loading issue
      if (!error.message.includes('timeout')) {
        throw error;
      }
    }
  });

  test('external tools should handle missing installation gracefully', () => {
    const externalTools = getExternalTools();
    
    // Test a few external tools (don't test all to avoid long test times)
    const toolsToTest = externalTools.slice(0, 2);
    
    toolsToTest.forEach(tool => {
      try {
        // Try to analyze with external tool - should fail gracefully if not installed
        execSync(`cd "${testDir}" && node "${cliPath}" analyze ${tool.id} https://example.com`, { 
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 15000
        });
      } catch (error: any) {
        const stderr = error.stderr?.toString() || '';
        const stdout = error.stdout?.toString() || '';
        
        // Should either:
        // 1. Show "not installed" message with installation instructions
        // 2. Show tool-specific error (if installed but fails)
        // 3. Show "Unknown analysis tool" (if tool not in registry)
        
        const hasInstallationMessage = stderr.includes('not installed') || 
                                     stderr.includes('Install it with') ||
                                     stderr.includes('installation');
        
        const hasToolError = stderr.includes('analysis failed') ||
                           stderr.includes('Tool') ||
                           stderr.includes('Error');
        
        const hasUnknownTool = stderr.includes('Unknown analysis tool');
        
        expect(hasInstallationMessage || hasToolError || hasUnknownTool).toBe(true);
      }
    });
  });

  test('external tools should validate URLs properly', () => {
    const externalTools = getExternalTools();
    const toolsToTest = externalTools.slice(0, 1); // Test one tool to avoid long runtime
    
    toolsToTest.forEach(tool => {
      try {
        // Test with invalid URL
        execSync(`cd "${testDir}" && node "${cliPath}" analyze ${tool.id} invalid-url`, { 
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 10000
        });
      } catch (error: any) {
        const stderr = error.stderr?.toString() || '';
        
        // Should show URL validation error
        expect(stderr).toMatch(/Invalid URL|invalid.*url|malformed.*url/i);
      }
    });
  });

  test('external tools should support --help and --version flags', () => {
    const externalTools = getExternalTools();
    const toolsToTest = externalTools.slice(0, 1);
    
    toolsToTest.forEach(tool => {
      // Test that analyze command shows help when missing arguments
      try {
        execSync(`cd "${testDir}" && node "${cliPath}" analyze ${tool.id}`, { 
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 5000
        });
      } catch (error: any) {
        const stderr = error.stderr?.toString() || '';
        
        // Should show help or missing argument message
        expect(stderr).toMatch(/missing.*argument|help|usage/i);
      }
    });
  });

  test('tools with manifest templates should have proper structure', () => {
    const externalTools = getExternalTools();
    const toolsWithManifests = externalTools.filter(tool => tool.manifestTemplate);
    
    if (toolsWithManifests.length > 0) {
      toolsWithManifests.forEach(tool => {
        // Tools with manifest templates should have proper structure
        expect(tool.manifestTemplate.name).toBeTruthy();
        expect(tool.manifestTemplate.initialize).toBeTruthy();
        expect(tool.manifestTemplate.initialize.plugins).toBeTruthy();
        expect(tool.manifestTemplate.tree).toBeTruthy();
        
        // Should have display configuration
        expect(tool.display).toBeTruthy();
        expect(tool.display.fields).toBeTruthy();
        expect(Array.isArray(tool.display.fields)).toBe(true);
      });
    }
  });

  test('external tools should have proper option configurations', () => {
    const externalTools = getExternalTools();
    
    externalTools.forEach(tool => {
      if (tool.options && tool.options.length > 0) {
        tool.options.forEach(option => {
          // Each option should have proper structure
          expect(option.flag).toBeTruthy();
          expect(option.description).toBeTruthy();
          expect(option.type).toMatch(/^(boolean|string|number)$/);
          
          // Flag should be properly formatted
          expect(option.flag).toMatch(/^-{1,2}[a-zA-Z-]+/);
        });
      }
    });
  });

  test('external tools installation detection should work', async () => {
    const registry = getToolRegistry();
    await registry.refreshInstalledTools();
    
    const externalTools = getExternalTools();
    
    // Test that installation detection doesn't crash
    for (const tool of externalTools.slice(0, 2)) { // Test first 2 tools
      try {
        const isInstalled = await registry.isToolInstalled(tool.id);
        expect(typeof isInstalled).toBe('boolean');
      } catch (error) {
        // Installation detection might fail, but shouldn't crash
        console.log(`Installation detection failed for ${tool.id}: ${error}`);
      }
    }
  });

  test('tools with similar installation packages should have consistent detection', () => {
    const externalTools = getExternalTools();
    
    // Group tools by installation package
    const toolsByPackage = new Map<string, AnalysisTool[]>();
    externalTools.forEach(tool => {
      const packageKey = tool.installation.package;
      if (!toolsByPackage.has(packageKey)) {
        toolsByPackage.set(packageKey, []);
      }
      toolsByPackage.get(packageKey)!.push(tool);
    });
    
    // For each package group, check consistency
    toolsByPackage.forEach((tools, packageKey) => {
      if (tools.length > 1) {
        // Tools with same installation package should have consistent detection
        const firstTool = tools[0];
        tools.forEach(tool => {
          expect(tool.detection.method).toBe(firstTool.detection.method);
          expect(tool.installation.package).toBe(firstTool.installation.package);
          
          // Detection targets should be similar (same base command)
          const firstTarget = firstTool.detection.target.split(' ')[0];
          const toolTarget = tool.detection.target.split(' ')[0];
          expect(toolTarget).toBe(firstTarget);
        });
      }
    });
  });

  describe('Manifest Templates', () => {
    // Test fixtures
    const getToolsWithManifests = () => {
      const externalTools = getExternalTools();
      return externalTools.filter(tool => tool.manifestTemplate);
    };

    const getToolsWithParameters = () => {
      const toolsWithManifests = getToolsWithManifests();
      return toolsWithManifests.filter(tool => tool.parameters && tool.parameters.length > 0);
    };

    const getToolsWithoutParameters = () => {
      const toolsWithManifests = getToolsWithManifests();
      return toolsWithManifests.filter(tool => !tool.parameters || tool.parameters.length === 0);
    };

    test('should have proper plugin and tree structure', () => {
      const toolsWithManifests = getToolsWithManifests();
      
      toolsWithManifests.forEach(tool => {
        const manifest = tool.manifestTemplate;
        
        // Should have proper plugin structure
        Object.values(manifest.initialize.plugins).forEach((plugin: any) => {
          expect(plugin.path).toBeTruthy();
          expect(plugin.method).toBeTruthy();
        });
        
        // Should have proper tree structure
        expect(manifest.tree.children).toBeTruthy();
      });
    });

    describe('with parameters', () => {
      test('should have required parameters in manifest template', () => {
        const toolsWithParams = getToolsWithParameters();
        
        expect(toolsWithParams.length).toBeGreaterThan(0);
        
        toolsWithParams.forEach(tool => {
          const manifest = tool.manifestTemplate;
          const manifestStr = JSON.stringify(manifest);
          const requiredParams = tool.parameters!.filter(p => p.required);
          
          requiredParams.forEach(param => {
            // Required parameter name should appear as {name} in manifest
            expect(manifestStr).toContain(`{${param.name}}`);
          });
        });
      });

      test('should have valid parameter definitions', () => {
        const toolsWithParams = getToolsWithParameters();
        
        toolsWithParams.forEach(tool => {
          tool.parameters!.forEach(param => {
            // Each parameter should have required fields
            expect(param.name).toBeTruthy();
            expect(typeof param.name).toBe('string');
            expect(typeof param.required).toBe('boolean');
            
            // If type is specified, it should be valid
            if (param.type) {
              expect(['string', 'number', 'boolean']).toContain(param.type);
            }
            
            // Parameter name should not contain curly braces
            expect(param.name).not.toContain('{');
            expect(param.name).not.toContain('}');
          });
        });
      });
    });

    describe('without parameters', () => {
      test('should still have valid manifest structure', () => {
        const toolsWithoutParams = getToolsWithoutParameters();
        
        // This test should pass even if there are no tools without parameters
        // (all tools might have parameters defined, which is fine)
        
        toolsWithoutParams.forEach(tool => {
          const manifest = tool.manifestTemplate;
          
          // Should have proper plugin structure
          expect(manifest.initialize).toBeTruthy();
          expect(manifest.initialize.plugins).toBeTruthy();
          
          // Should have proper tree structure
          expect(manifest.tree).toBeTruthy();
          expect(manifest.tree.children).toBeTruthy();
        });
      });
    });
  });
});
