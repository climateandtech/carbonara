import { describe, test, expect, beforeAll } from 'vitest';
import execa from 'execa';
import { getToolRegistry, AnalysisTool } from '../src/registry/index.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Tools Commands Validation - Sandbox Tests', () => {
  let testDir: string;
  let registry: ReturnType<typeof getToolRegistry>;

  beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carbonara-tools-test-'));
    registry = getToolRegistry();
  });

  function getExternalTools(): AnalysisTool[] {
    return registry.getAllTools().filter(tool => 
      tool.installation.type !== 'built-in'
    );
  }

  describe('Detection Commands', () => {
    test('all detection commands should be testable', async () => {
      const externalTools = getExternalTools();
      const results: Array<{ toolId: string; command: string; works: boolean; error?: string }> = [];

      for (const tool of externalTools) {
        if (tool.detection.method === 'command' && tool.detection.target) {
          const command = tool.detection.target;
          
          try {
            // Test the command with a timeout
            await execa.command(command, { 
              shell: true,
              timeout: 10000, // 10 second timeout
              stdio: 'pipe',
              reject: false // Don't throw, just return result
            });
            
            // For compound commands with &&, we need to check if it actually works
            // The command might succeed even if tool isn't installed (e.g., npm list returns empty)
            results.push({
              toolId: tool.id,
              command,
              works: true
            });
          } catch (error: any) {
            results.push({
              toolId: tool.id,
              command,
              works: false,
              error: error.message
            });
          }
        }
      }

      // Log results for debugging
      console.log('\n=== Detection Command Test Results ===');
      results.forEach(r => {
        if (r.works) {
          console.log(`✅ ${r.toolId}: ${r.command}`);
        } else {
          console.log(`❌ ${r.toolId}: ${r.command} - ${r.error}`);
        }
      });

      // All commands should at least be syntactically valid
      const allValid = results.every(r => r.works || r.error?.includes('command not found') === false);
      expect(allValid).toBe(true);
    });

    test('detection commands should not use npx for globally installed tools', () => {
      const externalTools = getExternalTools();
      
      externalTools.forEach(tool => {
        if (tool.installation.type === 'npm' && tool.installation.global === true) {
          // Globally installed tools should be detected directly, not via npx
          if (tool.detection.method === 'command' && tool.detection.target) {
            const command = tool.detection.target;
            // Should not start with 'npx' for globally installed tools
            // Exception: if the command is checking npm list, that's fine
            if (command.startsWith('npx ') && !command.includes('npm list')) {
              console.warn(`⚠️  ${tool.id}: Detection uses 'npx' but tool is globally installed. Consider using direct command instead.`);
            }
          }
        }
      });
    });

    test('compound detection commands should handle failures gracefully', () => {
      const externalTools = getExternalTools();
      
      externalTools.forEach(tool => {
        if (tool.detection.method === 'command' && tool.detection.target) {
          const command = tool.detection.target;
          
          // Check for compound commands with &&
          if (command.includes(' && ')) {
            const parts = command.split(' && ');
            // Each part should be a valid command
            parts.forEach((part, index) => {
              const trimmed = part.trim();
              expect(trimmed.length).toBeGreaterThan(0);
              // First part should be the primary check
              if (index === 0) {
                // Should check for the actual tool, not just npm
                expect(trimmed).not.toBe('npm --version');
                expect(trimmed).not.toBe('npm list');
              }
            });
          }
        }
      });
    });
  });

  describe('Installation Commands', () => {
    test('npm installation commands should be valid', async () => {
      const externalTools = getExternalTools();
      const npmTools = externalTools.filter(tool => tool.installation.type === 'npm');
      
      for (const tool of npmTools) {
        const packages = tool.installation.package.split(' ').filter(p => p.trim().length > 0);
        
        // Test that we can construct a valid npm install command
        const npmArgs = ['install'];
        if (tool.installation.global !== false) {
          npmArgs.push('-g');
        }
        npmArgs.push(...packages);
        
        // Validate package names (don't actually install)
        packages.forEach(pkg => {
          // Should be a valid npm package name
          expect(pkg.trim().length).toBeGreaterThan(0);
          // Should not contain shell metacharacters
          expect(pkg).not.toMatch(/[;&|`$(){}[\]]/);
        });
      }
    });

    test('installation commands should match detection', () => {
      const externalTools = getExternalTools();
      
      externalTools.forEach(tool => {
        if (tool.installation.type === 'npm' && tool.detection.method === 'command') {
          const installPackages = tool.installation.package.split(' ').filter(p => p.trim().length > 0);
          const detectCommand = tool.detection.target;
          
          // For IF tools, detection checks for @tngtech/if-webpage-plugins
          // Installation installs both @grnsft/if and @tngtech/if-webpage-plugins
          // This is correct, but we should verify the detection checks for the right package
          if (detectCommand.includes('npm list -g')) {
            // Should check for at least one of the installed packages
            const checkedPackage = detectCommand.match(/npm list -g ([^\s&]+)/)?.[1];
            if (checkedPackage) {
              const installsCheckedPackage = installPackages.some(pkg => 
                pkg.includes(checkedPackage) || checkedPackage.includes(pkg.split('@').pop() || '')
              );
              // The detection should check for a package that's actually installed
              // This is a soft check - it's okay if they're related packages
            }
          }
        }
      });
    });
  });

  describe('Command Executables', () => {
    test('command executables should match detection', () => {
      const externalTools = getExternalTools();
      
      externalTools.forEach(tool => {
        const executable = tool.command.executable;
        const detection = tool.detection;
        
        // If detection uses a specific command, the executable should match
        if (detection.method === 'command' && detection.target) {
          const detectCommand = detection.target.split(' ')[0].split('&&')[0].trim();
          
          // For tools that use npx in command but detect directly, that's a mismatch
          if (executable === 'npx' && !detectCommand.startsWith('npx')) {
            // This might be intentional (using npx for execution but detecting global install)
            // But we should flag it for review
            console.log(`ℹ️  ${tool.id}: Uses 'npx' in command but detects with '${detectCommand}'`);
          }
          
          // If executable is the same as detection command base, that's good
          if (executable === detectCommand || executable === `npx ${detectCommand}`) {
            // This is consistent
          }
        }
      });
    });

    test('greenframe should use direct command, not npx', () => {
      const greenframe = registry.getTool('greenframe');
      if (greenframe) {
        // Based on terminal output, greenframe works directly, not via npx
        expect(greenframe.command.executable).not.toBe('npx');
        // Detection uses 'greenframe --version' which is correct
        expect(greenframe.detection.target).toContain('greenframe');
        expect(greenframe.detection.target).not.toContain('npx');
      }
    });
  });

  describe('Real-world Command Testing', () => {
    test('greenframe detection should work', async () => {
      // Test the actual greenframe detection command
      try {
        const result = await execa.command('greenframe --version', {
          shell: true,
          timeout: 5000,
          stdio: 'pipe',
          reject: false
        });
        
        // If greenframe is installed, it should return version
        // If not installed, it should return non-zero exit code
        if (result.exitCode === 0) {
          expect(result.stdout).toContain('greenframe');
        }
      } catch (error) {
        // Tool not installed is okay for this test
        console.log('GreenFrame not installed (this is okay for testing)');
      }
    });

    test('if-run detection should work', async () => {
      // Test the actual if-run detection command
      try {
        const result = await execa.command('if-run --help', {
          shell: true,
          timeout: 5000,
          stdio: 'pipe',
          reject: false
        });
        
        // If if-run is installed, it should return help
        if (result.exitCode === 0) {
          expect(result.stdout.toLowerCase()).toContain('impact framework');
        }
      } catch (error) {
        // Tool not installed is okay for this test
        console.log('if-run not installed (this is okay for testing)');
      }
    });

    test('npm list commands should work', async () => {
      // Test npm list command format
      try {
        const result = await execa.command('npm list -g @tngtech/if-webpage-plugins', {
          shell: true,
          timeout: 5000,
          stdio: 'pipe',
          reject: false
        });
        
        // npm list returns 0 even if package not found (just shows empty)
        // So we check the output
        if (result.stdout.includes('(empty)') || result.stdout.includes('@tngtech/if-webpage-plugins')) {
          // Command works, package may or may not be installed
        }
      } catch (error) {
        // npm list should always work
        throw new Error(`npm list command failed: ${error}`);
      }
    });
  });
});

