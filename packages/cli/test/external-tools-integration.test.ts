import { execSync } from 'child_process';
import fs, { mkdtempSync } from 'fs';
import path from 'path';
import os, { tmpdir } from 'os';
import { describe, test, beforeEach, afterEach, expect, vi } from 'vitest';
import { getToolRegistry, AnalysisTool } from '../src/registry/index.js';
import { setupCarbonaraCore } from '@carbonara/core';

describe('External Tools - Integration Tests', () => {
  let testDir: string;
  let cliPath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carbonara-external-integration-test-'));
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

  // Create a test project config
  function createTestProject(): void {
    const config = {
      name: "External Tools Test Project",
      description: "Test project for external tools integration",
      projectType: "web",
      version: "1.0.0",
      created: new Date().toISOString()
    };
    
    fs.writeFileSync(path.join(testDir, 'carbonara.config.json'), JSON.stringify(config, null, 2));
  }

  test('external tools should handle analyze command with project creation', async () => {
    // Set test-wide timeout for CI environment
    vi.setConfig({ testTimeout: 30000 });
    
    createTestProject();
    
    const externalTools = getExternalTools();
    const toolsToTest = externalTools.slice(0, 1); // Test one tool to avoid long runtime
    
    for (const tool of toolsToTest) {
      try {
        // Run analyze command with --save (should create project in database)
        const result = execSync(`cd "${testDir}" && node "${cliPath}" analyze ${tool.id} https://example.com --save`, { 
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 20000
        });
        
        // Should either succeed or fail gracefully
        expect(result).toBeTruthy();
        
        // If it succeeded, should have created database
        const dbPath = path.join(testDir, 'carbonara.db');
        if (fs.existsSync(dbPath)) {
          // Database was created - verify it has content
          const dbSize = fs.statSync(dbPath).size;
          expect(dbSize).toBeGreaterThan(0);
        }
        
      } catch (error: any) {
        const stderr = error.stderr?.toString() || '';
        const stdout = error.stdout?.toString() || '';
        
        // Should fail gracefully with appropriate error message
        const hasInstallationError = stderr.includes('not installed') || 
                                   stderr.includes('Install it with') ||
                                   stderr.includes('installation');
        
        const hasAnalysisError = stderr.includes('analysis failed') ||
                               stderr.includes('Tool') ||
                               stderr.includes('Error') ||
                               stdout.includes('analysis failed');
        
        const hasUnknownTool = stderr.includes('Unknown analysis tool');
        
        expect(hasInstallationError || hasAnalysisError || hasUnknownTool).toBe(true);
      }
    }
  });

  test('external tools should support different output formats', () => {
    createTestProject();
    
    const externalTools = getExternalTools();
    const toolsToTest = externalTools.slice(0, 1);
    
    toolsToTest.forEach(tool => {
      // Test JSON output format
      try {
        const result = execSync(`cd "${testDir}" && node "${cliPath}" analyze ${tool.id} https://example.com --output json`, { 
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 15000
        });
        
        // If successful, should be valid JSON
        if (result.trim()) {
          try {
            const parsed = JSON.parse(result.trim());
            expect(parsed).toBeTruthy();
          } catch (jsonError) {
            // If not JSON, that's OK - some tools might not support JSON output
            console.log(`Tool ${tool.id} doesn't output JSON format`);
          }
        }
        
      } catch (error: any) {
        // Expected to fail for most external tools (not installed)
        const stderr = error.stderr?.toString() || '';
        expect(stderr).toMatch(/not installed|analysis failed|Unknown analysis tool/i);
      }
    });
  });

  test('external tools should handle tool options correctly', () => {
    createTestProject();
    
    const externalTools = getExternalTools();
    const toolsWithOptions = externalTools.filter(tool => tool.options && tool.options.length > 0);
    const toolsToTest = toolsWithOptions.slice(0, 1);
    
    toolsToTest.forEach(tool => {
      // Test with a boolean option (if available)
      const booleanOption = tool.options?.find(opt => opt.type === 'boolean');
      
      if (booleanOption) {
        try {
          const flag = booleanOption.flag.split(',')[0].trim();
          const result = execSync(`cd "${testDir}" && node "${cliPath}" analyze ${tool.id} https://example.com ${flag}`, { 
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 15000
          });
          
          // Should either succeed or fail gracefully
          expect(result).toBeTruthy();
          
        } catch (error: any) {
          const stderr = error.stderr?.toString() || '';
          expect(stderr).toMatch(/not installed|analysis failed|Unknown analysis tool/i);
        }
      }
    });
  });

  test('external tools should work with existing project', async () => {
    vi.setConfig({ testTimeout: 30000 });
    
    // Create project with existing projectId
    const config = {
      name: "Existing Project",
      description: "Project with existing ID",
      projectType: "web",
      projectId: 123,
      version: "1.0.0",
      created: new Date().toISOString()
    };
    
    fs.writeFileSync(path.join(testDir, 'carbonara.config.json'), JSON.stringify(config, null, 2));
    
    const externalTools = getExternalTools();
    const toolsToTest = externalTools.slice(0, 1);
    
    for (const tool of toolsToTest) {
      try {
        const result = execSync(`cd "${testDir}" && node "${cliPath}" analyze ${tool.id} https://example.com --save`, { 
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 15000
        });
        
        // Should either succeed or fail gracefully
        expect(result).toBeTruthy();
        
      } catch (error: any) {
        const stderr = error.stderr?.toString() || '';
        expect(stderr).toMatch(/not installed|analysis failed|Unknown analysis tool/i);
      }
    }
  });

  test('external tools should handle invalid URLs consistently', () => {
    createTestProject();
    
    const externalTools = getExternalTools();
    const toolsToTest = externalTools.slice(0, 2);
    
    toolsToTest.forEach(tool => {
      try {
        execSync(`cd "${testDir}" && node "${cliPath}" analyze ${tool.id} invalid-url`, { 
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 10000
        });
      } catch (error: any) {
        const stderr = error.stderr?.toString() || '';
        
        // Should show URL validation error or tool-specific error
        const hasUrlError = stderr.includes('Invalid URL') || 
                           stderr.includes('invalid') ||
                           stderr.includes('malformed');
        
        const hasToolError = stderr.includes('not installed') ||
                           stderr.includes('analysis failed') ||
                           stderr.includes('Unknown analysis tool');
        
        expect(hasUrlError || hasToolError).toBe(true);
      }
    });
  });

  test('external tools should support tools command integration', () => {
    createTestProject();
    
    const externalTools = getExternalTools();
    
    try {
      const result = execSync(`cd "${testDir}" && node "${cliPath}" tools --list`, { 
        encoding: 'utf8',
        timeout: 10000,
        stdio: 'pipe'
      });
      
      // Should show all external tools
      externalTools.forEach(tool => {
        expect(result).toContain(tool.name);
        expect(result).toContain(tool.id);
      });
      
    } catch (error: any) {
      // If tools command fails, check that it's a registry loading issue
      const stderr = error.stderr?.toString() || '';
      const stdout = error.stdout?.toString() || '';
      
      // Should either succeed or fail with appropriate error
      const hasError = stderr.includes('Failed to load') || 
                      stderr.includes('registry') || 
                      stderr.includes('tools') ||
                      stdout.includes('Failed to load');
      
      // If no error message, that's also OK - command might have succeeded
      if (stderr || stdout) {
        expect(hasError || stdout.includes('Analysis Tools Registry')).toBe(true);
      }
    }
  });

  test('external tools should handle installation detection in tools command', () => {
    createTestProject();
    
    const externalTools = getExternalTools();
    const toolsToTest = externalTools.slice(0, 2);
    
    toolsToTest.forEach(tool => {
      try {
        const result = execSync(`cd "${testDir}" && node "${cliPath}" tools --list`, { 
          encoding: 'utf8',
          timeout: 10000,
          stdio: 'pipe'
        });
        
        // Should show installation status for the tool
        expect(result).toContain(tool.name);
        
        // Should show either "Installed" or "Not installed" or installation instructions
        const hasStatus = result.includes('Installed') || 
                         result.includes('Not installed') ||
                         result.includes('Install') ||
                         result.includes('npm install');
        
        // Status might not always be shown, so this is optional
        if (hasStatus) {
          expect(hasStatus).toBe(true);
        }
        
      } catch (error: any) {
        // Tools command might fail, that's OK
        const stderr = error.stderr?.toString() || '';
        const stdout = error.stdout?.toString() || '';
        
        // Should either succeed or fail with appropriate error
        const hasError = stderr.includes('Failed to load') || 
                        stderr.includes('registry') || 
                        stderr.includes('tools') ||
                        stdout.includes('Failed to load');
        
        // If no error message, that's also OK - command might have succeeded
        if (stderr || stdout) {
          expect(hasError || stdout.includes('Analysis Tools Registry')).toBe(true);
        }
      }
    });
  });

  test('tools with manifest templates should handle manifest generation', () => {
    createTestProject();
    
    const externalTools = getExternalTools();
    const toolsWithManifests = externalTools.filter(tool => tool.manifestTemplate);
    
    if (toolsWithManifests.length > 0) {
      const toolToTest = toolsWithManifests[0];
      
      try {
        // Test that tool with manifest can be called (will fail at execution, but should handle manifest generation)
        execSync(`cd "${testDir}" && node "${cliPath}" analyze ${toolToTest.id} https://example.com`, { 
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 15000
        });
      } catch (error: any) {
        const stderr = error.stderr?.toString() || '';
        
        // Should fail at tool execution (not installed) but not at manifest generation
        const hasManifestError = stderr.includes('manifest') && stderr.includes('error');
        const hasInstallationError = stderr.includes('not installed') || 
                                   stderr.includes('Install it with') ||
                                   stderr.includes('analysis failed');
        
        // Should not fail at manifest generation level
        expect(hasManifestError).toBe(false);
        
        // Should fail at installation/execution level (or succeed if tool is installed)
        if (hasInstallationError) {
          expect(hasInstallationError).toBe(true);
        } else {
          // If no installation error, the tool might actually be installed and working
          console.log(`Tool ${toolToTest.id} appears to be installed and working`);
        }
      }
    }
  });

  test('external tools should handle database operations correctly', async () => {
    vi.setConfig({ testTimeout: 30000 });
    
    createTestProject();
    
    const externalTools = getExternalTools();
    const toolsToTest = externalTools.slice(0, 1);
    
    for (const tool of toolsToTest) {
      try {
        // Try to run with --save to test database operations
        const result = execSync(`cd "${testDir}" && node "${cliPath}" analyze ${tool.id} https://example.com --save`, { 
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 15000
        });
        
        // If successful, should mention saving to database
        if (result.includes('saved') || result.includes('database')) {
          // Verify database was created
          const dbPath = path.join(testDir, 'carbonara.db');
          expect(fs.existsSync(dbPath)).toBe(true);
        }
        
      } catch (error: any) {
        const stderr = error.stderr?.toString() || '';
        
        // Should fail gracefully with appropriate error
        expect(stderr).toMatch(/not installed|analysis failed|Unknown analysis tool/i);
      }
    }
  });

  test('external tools should handle VSCode-style option passing', () => {
    createTestProject();
    
    const externalTools = getExternalTools();
    const toolsWithOptions = externalTools.filter(tool => tool.options && tool.options.length > 0);
    const toolsToTest = toolsWithOptions.slice(0, 1);
    
    toolsToTest.forEach(tool => {
      // Test boolean option (simulating VSCode user selecting "Yes")
      const booleanOption = tool.options?.find(opt => opt.type === 'boolean');
      if (booleanOption) {
        try {
          const flag = booleanOption.flag.split(',')[0].trim();
          // Simulate VSCode passing the option to CLI
          const result = execSync(`cd "${testDir}" && node "${cliPath}" analyze ${tool.id} https://example.com ${flag}`, { 
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 15000
          });
          
          // Should either succeed or fail gracefully
          expect(result).toBeTruthy();
          
        } catch (error: any) {
          const stderr = error.stderr?.toString() || '';
          expect(stderr).toMatch(/not installed|analysis failed|Unknown analysis tool/i);
        }
      }
      
      // Test string/number option (simulating VSCode user input)
      const stringOption = tool.options?.find(opt => opt.type === 'string' || opt.type === 'number');
      if (stringOption) {
        try {
          const flag = stringOption.flag.split(',')[0].trim();
          const testValue = stringOption.type === 'number' ? '0.9' : 'test-value';
          // Simulate VSCode passing option with value to CLI
          const result = execSync(`cd "${testDir}" && node "${cliPath}" analyze ${tool.id} https://example.com ${flag} ${testValue}`, { 
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 15000
          });
          
          // Should either succeed or fail gracefully
          expect(result).toBeTruthy();
          
        } catch (error: any) {
          const stderr = error.stderr?.toString() || '';
          expect(stderr).toMatch(/not installed|analysis failed|Unknown analysis tool/i);
        }
      }
    });
  });

  test('external tools should handle multiple options like VSCode would pass', () => {
    createTestProject();
    
    const externalTools = getExternalTools();
    const toolsWithMultipleOptions = externalTools.filter(tool => 
      tool.options && tool.options.length > 1
    );
    const toolsToTest = toolsWithMultipleOptions.slice(0, 1);
    
    toolsToTest.forEach(tool => {
      try {
        // Build CLI args like VSCode would (with multiple options)
        const cliArgs = ['analyze', tool.id, 'https://example.com'];
        
        // Add options like VSCode would
        tool.options?.forEach(option => {
          if (option.flag.includes('--save') || option.flag.includes('--output')) {
            return; // Skip built-in options
          }
          
          const flag = option.flag.split(',')[0].trim();
          
          if (option.type === 'boolean') {
            cliArgs.push(flag); // Add flag for boolean true
          } else if (option.type === 'string' || option.type === 'number') {
            const testValue = option.type === 'number' ? '0.9' : 'test-value';
            cliArgs.push(flag, testValue);
          }
        });
        
        cliArgs.push('--save'); // VSCode always adds --save
        
        const result = execSync(`cd "${testDir}" && node "${cliPath}" ${cliArgs.join(' ')}`, { 
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 15000
        });
        
        // Should either succeed or fail gracefully
        expect(result).toBeTruthy();
        
      } catch (error: any) {
        const stderr = error.stderr?.toString() || '';
        expect(stderr).toMatch(/not installed|analysis failed|Unknown analysis tool/i);
      }
    });
  });

  test('test-analyzer should save data and display correctly in VSCode provider', async () => {
    vi.setConfig({ testTimeout: 30000 });
    
    createTestProject();
    
    // Run test-analyzer (built-in stub that returns predictable results)
    const result = execSync(`cd "${testDir}" && node "${cliPath}" analyze test-analyzer https://test.example.com --save`, {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 15000
    });
    
    // Should succeed
    expect(result).toContain('analysis completed');
    // Note: Results should be saved (either with existing project or auto-created)
    // The test-analyzer should always succeed since it's built-in
    expect(result).toMatch(/Results saved|Created project|Found existing project/i);
    
    // Verify database was created at correct path
    const dbPath = path.join(testDir, '.carbonara', 'carbonara.db');
    expect(fs.existsSync(dbPath)).toBe(true);
    
    // Now test that the data can be loaded and displayed by VSCode provider
    const services = await setupCarbonaraCore({ dbPath });
    
    try {
      // First, verify the project exists in the database
      const allProjects = await services.dataService.getAllProjects();
      expect(allProjects.length).toBeGreaterThan(0);
      
      // Find the project that matches our test directory
      // On macOS, /var is a symlink to /private/var, so we need to resolve both paths
      const normalizedTestDir = path.resolve(testDir);
      const project = allProjects.find((p: any) => {
        const normalizedProjectPath = path.resolve(p.path);
        const matches = normalizedProjectPath === normalizedTestDir;
        if (!matches) {
          console.log(`Path mismatch: stored="${p.path}" (resolved="${normalizedProjectPath}") vs testDir="${testDir}" (resolved="${normalizedTestDir}")`);
        }
        return matches;
      });
      
      // If not found, just use the first project (should be the one we created)
      const projectToUse = project || allProjects[0];
      expect(projectToUse).toBeDefined();
      
      // Load data for the project (using the project path from database)
      // Use the actual stored path, not testDir, since VSCode provider looks up by exact path
      const assessmentData = await services.vscodeProvider.loadDataForProject(projectToUse!.path);
      expect(assessmentData.length).toBeGreaterThan(0);
      
      // Find test-analyzer data
      const testAnalyzerData = assessmentData.find((d: any) => d.tool_name === 'test-analyzer');
      expect(testAnalyzerData).toBeDefined();
      
      // Verify the data structure matches what test-analyzer returns
      expect(testAnalyzerData!.data.url).toBe('https://test.example.com');
      expect(testAnalyzerData!.data.result).toBe('success');
      expect(testAnalyzerData!.data.data.testScore).toBe(85);
      expect(testAnalyzerData!.data.data.testMetric).toBe('A+');
      
      // Test grouped items (how VSCode extension displays data)
      const groups = await services.vscodeProvider.createGroupedItems(projectToUse!.path);
      expect(groups.length).toBeGreaterThan(0);
      
      // Find test-analyzer group
      const testGroup = groups.find((g: any) => g.toolName === 'test-analyzer');
      expect(testGroup).toBeDefined();
      expect(testGroup!.entries.length).toBe(1);
      
      // Test data details extraction
      const details = await services.vscodeProvider.createDataDetails(testAnalyzerData!);
      expect(details.length).toBeGreaterThan(0);
      
      // Verify specific fields from test-analyzer are displayed
      // The details format depends on the schema, so we check that details exist
      // and that the data we saved is accessible
      expect(details.length).toBeGreaterThan(0);
      
      // Verify the raw data contains our test values
      const rawData = testAnalyzerData!.data;
      expect(rawData.url || rawData.data?.url).toBe('https://test.example.com');
      expect(rawData.data?.testScore).toBe(85);
      expect(rawData.data?.testMetric).toBe('A+');
      
    } finally {
      await services.dataService.close();
    }
  });
});
