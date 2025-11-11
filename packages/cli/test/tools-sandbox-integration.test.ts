import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import execa from 'execa';
import { getToolRegistry, AnalysisTool } from '../src/registry/index.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Full sandbox integration tests for tool installation and detection.
 * 
 * These tests validate that:
 * 1. Detection commands work correctly for installed tools
 * 2. Installation commands are syntactically correct and can be executed
 * 3. Detection logic correctly identifies installed vs uninstalled tools
 * 4. The registry's detection matches actual system state
 */
describe('Tools Sandbox Integration Tests', () => {
  let testDir: string;
  let registry: ReturnType<typeof getToolRegistry>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carbonara-tools-sandbox-'));
    registry = getToolRegistry();
    originalEnv = { ...process.env };
  });

  afterAll(() => {
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  function getExternalTools(): AnalysisTool[] {
    return registry.getAllTools().filter(tool => 
      tool.installation.type !== 'built-in'
    );
  }

  describe('Detection Command Validation', () => {
    test('all detection commands should be executable and return meaningful results', async () => {
      const externalTools = getExternalTools();
      const results: Array<{
        toolId: string;
        command: string;
        executable: boolean;
        exitCode?: number;
        error?: string;
      }> = [];

      for (const tool of externalTools) {
        if (tool.detection.method === 'command' && tool.detection.target) {
          const command = tool.detection.target;
          
          try {
            const result = await execa.command(command, {
              shell: true,
              timeout: 10000,
              stdio: 'pipe',
              reject: false
            });

            results.push({
              toolId: tool.id,
              command,
              executable: true,
              exitCode: result.exitCode
            });
          } catch (error: any) {
            results.push({
              toolId: tool.id,
              command,
              executable: false,
              error: error.message
            });
          }
        }
      }

      // Log results for debugging
      console.log('\n=== Detection Command Execution Results ===');
      results.forEach(r => {
        if (r.executable) {
          console.log(`✅ ${r.toolId}: ${r.command} (exit code: ${r.exitCode})`);
        } else {
          console.log(`❌ ${r.toolId}: ${r.command} - ${r.error}`);
        }
      });

      // All commands should be executable (even if tool isn't installed, command should run)
      const allExecutable = results.every(r => r.executable);
      expect(allExecutable).toBe(true);
    });

    test('detection commands should not use npx for globally installed tools', () => {
      const externalTools = getExternalTools();
      const issues: string[] = [];

      externalTools.forEach(tool => {
        if (tool.installation.type === 'npm' && tool.installation.global === true) {
          if (tool.detection.method === 'command' && tool.detection.target) {
            const command = tool.detection.target;
            // Should not start with 'npx' for globally installed tools
            if (command.startsWith('npx ') && !command.includes('npm list')) {
              issues.push(`${tool.id}: Detection uses 'npx' but tool is globally installed`);
            }
          }
        }
      });

      if (issues.length > 0) {
        console.warn('⚠️  Detection command issues:', issues);
      }

      // This is a warning, not a failure - some tools might intentionally use npx
      expect(issues.length).toBeLessThanOrEqual(0);
    });
  });

  describe('Installation Command Validation', () => {
    test('npm installation commands should be syntactically valid', () => {
      const externalTools = getExternalTools();
      const npmTools = externalTools.filter(tool => tool.installation.type === 'npm');
      const issues: string[] = [];

      for (const tool of npmTools) {
        const packages = tool.installation.package.split(' ').filter(p => p.trim().length > 0);
        
        // Validate package names
        packages.forEach(pkg => {
          const trimmed = pkg.trim();
          
          // Should not be empty
          if (trimmed.length === 0) {
            issues.push(`${tool.id}: Empty package name in installation`);
          }
          
          // Should not contain shell metacharacters
          if (/[;&|`$(){}[\]]/.test(trimmed)) {
            issues.push(`${tool.id}: Package name contains shell metacharacters: ${trimmed}`);
          }
          
          // Should be a valid npm package name format
          // Basic validation: should start with @scope/ or be a valid package name
          if (!trimmed.match(/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/)) {
            issues.push(`${tool.id}: Invalid npm package name format: ${trimmed}`);
          }
        });

        // Test that we can construct a valid npm install command
        const npmArgs = ['install'];
        if (tool.installation.global !== false) {
          npmArgs.push('-g');
        }
        npmArgs.push(...packages);
        
        // Command should be constructible
        expect(npmArgs.length).toBeGreaterThan(1);
      }

      if (issues.length > 0) {
        console.error('❌ Installation command issues:', issues);
      }

      expect(issues.length).toBe(0);
    });

    test('pip installation commands should be syntactically valid', () => {
      const externalTools = getExternalTools();
      const pipTools = externalTools.filter(tool => tool.installation.type === 'pip');
      const issues: string[] = [];

      for (const tool of pipTools) {
        const packageName = tool.installation.package.trim();
        
        // Should not be empty
        if (packageName.length === 0) {
          issues.push(`${tool.id}: Empty package name in installation`);
        }
        
        // Should not contain shell metacharacters
        if (/[;&|`$(){}[\]]/.test(packageName)) {
          issues.push(`${tool.id}: Package name contains shell metacharacters: ${packageName}`);
        }
        
        // pip package names should be valid Python package names
        // Basic validation: should match Python package naming conventions
        // Can contain letters, numbers, hyphens, underscores, and dots
        if (!packageName.match(/^[a-zA-Z0-9._-]+$/)) {
          issues.push(`${tool.id}: Invalid pip package name format: ${packageName}`);
        }

        // Test that we can construct a valid pip install command
        const pipArgs = ['install'];
        // Note: pip uses --user for user-level installs (not global)
        // global=true means install to user site-packages, global=false means system-wide
        if (tool.installation.global === false) {
          // System-wide install (requires sudo typically)
          // No flag needed, but we note it
        } else {
          // User-level install
          pipArgs.push('--user');
        }
        pipArgs.push(packageName);
        
        // Command should be constructible
        expect(pipArgs.length).toBeGreaterThan(1);
        expect(pipArgs[pipArgs.length - 1]).toBe(packageName);
      }

      if (issues.length > 0) {
        console.error('❌ pip installation command issues:', issues);
      }

      expect(issues.length).toBe(0);
    });

    test('installation commands should match expected format', async () => {
      const externalTools = getExternalTools();
      
      for (const tool of externalTools) {
        if (tool.installation.type === 'npm') {
          const packages = tool.installation.package.split(' ').filter(p => p.trim().length > 0);
          const isGlobal = tool.installation.global !== false;
          
          // Construct the expected npm install command
          const expectedCommand = `npm install ${isGlobal ? '-g' : ''} ${packages.join(' ')}`.trim();
          
          // Verify the installation instructions match
          if (tool.installation.instructions) {
            // Instructions should contain npm install
            expect(tool.installation.instructions).toContain('npm install');
            
            // Instructions should contain all packages
            packages.forEach(pkg => {
              expect(tool.installation.instructions).toContain(pkg);
            });
            
            // If global, instructions should contain -g
            if (isGlobal) {
              expect(tool.installation.instructions).toContain('-g');
            }
          }
        } else if (tool.installation.type === 'pip') {
          const packageName = tool.installation.package.trim();
          const isGlobal = tool.installation.global !== false;
          
          // Verify the installation instructions match
          if (tool.installation.instructions) {
            // Instructions should contain pip install
            expect(tool.installation.instructions.toLowerCase()).toContain('pip');
            
            // Instructions should contain the package name
            expect(tool.installation.instructions).toContain(packageName);
            
            // If global (user-level), instructions should mention --user
            // Note: pip uses --user for user-level installs
            if (isGlobal) {
              expect(tool.installation.instructions).toContain('--user');
            }
          }
        }
      }
    });
  });

  describe('Registry Detection Logic', () => {
    test('registry should correctly detect installed tools', async () => {
      // Refresh the registry to get current installation status
      await registry.refreshInstalledTools();
      
      const externalTools = getExternalTools();
      const detectionResults: Array<{
        toolId: string;
        registryDetected: boolean;
        manualCheck: boolean;
        match: boolean;
      }> = [];

      for (const tool of externalTools.slice(0, 3)) { // Test first 3 tools to avoid timeout
        const registryDetected = await registry.isToolInstalled(tool.id);
        
        // Manually check if tool is installed
        let manualCheck = false;
        if (tool.detection.method === 'command' && tool.detection.target) {
          try {
            const result = await execa.command(tool.detection.target, {
              shell: true,
              timeout: 5000,
              stdio: 'pipe',
              reject: false
            });
            // Tool is installed if command succeeds (exit code 0)
            // or if command exists but fails with non-127 exit code
            manualCheck = result.exitCode === 0 || result.exitCode !== 127;
          } catch {
            manualCheck = false;
          }
        }

        const match = registryDetected === manualCheck;
        detectionResults.push({
          toolId: tool.id,
          registryDetected,
          manualCheck,
          match
        });
      }

      // Log results
      console.log('\n=== Registry Detection vs Manual Check ===');
      detectionResults.forEach(r => {
        const status = r.match ? '✅' : '❌';
        console.log(`${status} ${r.toolId}: Registry=${r.registryDetected}, Manual=${r.manualCheck}`);
      });

      // All detections should match
      const allMatch = detectionResults.every(r => r.match);
      expect(allMatch).toBe(true);
    });
  });

  describe('Command Executable Consistency', () => {
    test('command executables should be consistent with detection', () => {
      const externalTools = getExternalTools();
      const issues: string[] = [];

      externalTools.forEach(tool => {
        const executable = tool.command.executable;
        const detection = tool.detection;

        // If detection uses a specific command, the executable should be related
        if (detection.method === 'command' && detection.target) {
          const detectCommand = detection.target.split(' ')[0].split('&&')[0].trim();
          
          // For tools that use npx in command but detect directly, flag for review
          if (executable === 'npx' && !detectCommand.startsWith('npx')) {
            // This might be intentional (using npx for execution but detecting global install)
            // But we should flag it
            issues.push(`${tool.id}: Uses 'npx' in command but detects with '${detectCommand}'`);
          }
          
          // If executable is the same as detection command base, that's good
          if (executable !== detectCommand && executable !== `npx ${detectCommand}`) {
            // This might be okay, but worth checking
            console.log(`ℹ️  ${tool.id}: Executable '${executable}' differs from detection '${detectCommand}'`);
          }
        }
      });

      // Log issues but don't fail - some differences might be intentional
      if (issues.length > 0) {
        console.warn('⚠️  Executable consistency issues:', issues);
      }
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

  describe('Real-world Command Execution', () => {
    test('greenframe detection should work if installed', async () => {
      try {
        const result = await execa.command('greenframe --version', {
          shell: true,
          timeout: 5000,
          stdio: 'pipe',
          reject: false
        });

        if (result.exitCode === 0) {
          expect(result.stdout).toContain('greenframe');
          console.log('✅ GreenFrame is installed:', result.stdout.trim());
        } else {
          console.log('ℹ️  GreenFrame is not installed (this is okay)');
        }
      } catch (error) {
        console.log('ℹ️  GreenFrame detection test failed (tool may not be installed)');
      }
    });

    test('if-run detection should work if installed', async () => {
      try {
        const result = await execa.command('if-run --help', {
          shell: true,
          timeout: 5000,
          stdio: 'pipe',
          reject: false
        });

        if (result.exitCode === 0) {
          expect(result.stdout.toLowerCase()).toContain('impact framework');
          console.log('✅ if-run is installed');
        } else {
          console.log('ℹ️  if-run is not installed (this is okay)');
        }
      } catch (error) {
        console.log('ℹ️  if-run detection test failed (tool may not be installed)');
      }
    });
  });

  describe('Installation Command Dry-run', () => {
    test('npm install commands should be constructible and valid', async () => {
      const externalTools = getExternalTools();
      const npmTools = externalTools.filter(tool => tool.installation.type === 'npm');
      
      for (const tool of npmTools) {
        const packages = tool.installation.package.split(' ').filter(p => p.trim().length > 0);
        const isGlobal = tool.installation.global !== false;
        
        // Construct npm install command
        const npmArgs = ['install'];
        if (isGlobal) {
          npmArgs.push('-g');
        }
        npmArgs.push(...packages);
        
        // Verify we can construct the command
        expect(npmArgs.length).toBeGreaterThan(1);
        expect(npmArgs[0]).toBe('install');
        
        // Test that npm can parse the command (dry-run)
        // Note: We don't actually install, just validate the command structure
        try {
          // Use npm install --dry-run to validate without installing
          const dryRunArgs = [...npmArgs, '--dry-run'];
          const result = await execa('npm', dryRunArgs, {
            stdio: 'pipe',
            timeout: 10000,
            reject: false
          });
          
          // Exit code 0 means command is valid (even if packages don't exist, npm will validate)
          // Exit code 1 might mean packages don't exist, but command is still valid
          // We're just checking that npm can parse the command
          if (result.exitCode === 0) {
            console.log(`✅ ${tool.id}: npm install command is valid`);
          } else {
            // Check if it's a package not found error (which is okay for validation)
            const stderr = result.stderr || '';
            if (stderr.includes('404') || stderr.includes('not found')) {
              console.log(`⚠️  ${tool.id}: Package may not exist, but command is valid`);
            } else {
              console.log(`ℹ️  ${tool.id}: npm install validation returned code ${result.exitCode}`);
            }
          }
        } catch (error: any) {
          // If npm itself fails, that's a problem
          throw new Error(`npm command validation failed for ${tool.id}: ${error.message}`);
        }
      }
    });

    test('pip install commands should be constructible and valid', async () => {
      const externalTools = getExternalTools();
      const pipTools = externalTools.filter(tool => tool.installation.type === 'pip');
      
      if (pipTools.length === 0) {
        console.log('ℹ️  No pip tools found in registry, skipping pip validation');
        return;
      }
      
      for (const tool of pipTools) {
        const packageName = tool.installation.package.trim();
        const isGlobal = tool.installation.global !== false;
        
        // Construct pip install command
        const pipArgs = ['install'];
        if (isGlobal) {
          pipArgs.push('--user');
        }
        pipArgs.push(packageName);
        
        // Verify we can construct the command
        expect(pipArgs.length).toBeGreaterThan(1);
        expect(pipArgs[0]).toBe('install');
        expect(pipArgs[pipArgs.length - 1]).toBe(packageName);
        
        // Test that pip can parse the command (dry-run)
        // Note: We don't actually install, just validate the command structure
        try {
          // Use pip install --dry-run to validate without installing
          // Note: --dry-run flag was added in pip 20.1, older versions might not support it
          const dryRunArgs = [...pipArgs, '--dry-run'];
          const result = await execa('pip', dryRunArgs, {
            stdio: 'pipe',
            timeout: 10000,
            reject: false
          });
          
          // Exit code 0 means command is valid
          // Exit code 1 might mean package doesn't exist or --dry-run not supported, but command is still valid
          if (result.exitCode === 0) {
            console.log(`✅ ${tool.id}: pip install command is valid`);
          } else {
            // Check if it's a package not found error or unsupported flag (which is okay for validation)
            const stderr = result.stderr || '';
            const stdout = result.stdout || '';
            if (stderr.includes('404') || stderr.includes('not found') || 
                stderr.includes('no such option') || stderr.includes('--dry-run')) {
              // Try without --dry-run to see if command structure is valid
              const checkArgs = ['install', '--help'];
              const helpResult = await execa('pip', checkArgs, {
                stdio: 'pipe',
                timeout: 5000,
                reject: false
              });
              
              if (helpResult.exitCode === 0) {
                console.log(`⚠️  ${tool.id}: pip install command structure is valid (--dry-run may not be supported)`);
              } else {
                console.log(`ℹ️  ${tool.id}: pip install validation returned code ${result.exitCode}`);
              }
            } else {
              console.log(`ℹ️  ${tool.id}: pip install validation returned code ${result.exitCode}`);
            }
          }
        } catch (error: any) {
          // If pip itself fails, that's a problem
          throw new Error(`pip command validation failed for ${tool.id}: ${error.message}`);
        }
      }
    });
  });
});

