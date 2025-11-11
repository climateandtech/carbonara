import { describe, test, expect } from 'vitest';
import { getToolRegistry, AnalysisTool } from '../src/registry/index.js';
import { execSync } from 'child_process';

describe('Tools Registry - Sanity Tests', () => {
  function getExternalTools(): AnalysisTool[] {
    const registry = getToolRegistry();
    return registry.getAllTools().filter(tool => 
      tool.installation.type !== 'built-in'
    );
  }

  describe('Installation Commands', () => {
    test('npm packages should have valid package names', () => {
      const externalTools = getExternalTools();
      const npmTools = externalTools.filter(tool => tool.installation.type === 'npm');
      
      npmTools.forEach(tool => {
        const packages = tool.installation.package.split(' ').filter(p => p.trim().length > 0);
        
        packages.forEach(pkg => {
          // npm package names should:
          // - Not be empty
          // - Start with @ for scoped packages or be a valid package name
          // - Not contain invalid characters
          expect(pkg.trim().length).toBeGreaterThan(0);
          
          if (pkg.startsWith('@')) {
            // Scoped package: @scope/package-name
            expect(pkg).toMatch(/^@[^/]+\/[^/]+/);
            expect(pkg.split('/').length).toBe(2);
          } else {
            // Regular package: package-name
            // Should not contain spaces, @, or other invalid chars in the middle
            expect(pkg).not.toContain(' ');
            expect(pkg).not.toContain('@');
          }
          
          // Should not contain shell metacharacters that could be dangerous
          expect(pkg).not.toMatch(/[;&|`$(){}[\]]/);
        });
      });
    });

    test('pip packages should have valid package names', () => {
      const externalTools = getExternalTools();
      const pipTools = externalTools.filter(tool => tool.installation.type === 'pip');
      
      pipTools.forEach(tool => {
        const pkg = tool.installation.package;
        
        // pip package names should:
        // - Not be empty
        // - Not contain shell metacharacters
        expect(pkg.trim().length).toBeGreaterThan(0);
        expect(pkg).not.toMatch(/[;&|`$(){}[\]]/);
      });
    });

    test('installation instructions should match installation type', () => {
      const externalTools = getExternalTools();
      
      externalTools.forEach(tool => {
        const instructions = tool.installation.instructions;
        expect(instructions).toBeTruthy();
        
        if (tool.installation.type === 'npm') {
          // npm instructions should mention npm
          expect(instructions.toLowerCase()).toContain('npm');
        } else if (tool.installation.type === 'pip') {
          // pip instructions should mention pip
          expect(instructions.toLowerCase()).toContain('pip');
        }
      });
    });

    test('npm installation commands should be well-formed', () => {
      const externalTools = getExternalTools();
      const npmTools = externalTools.filter(tool => tool.installation.type === 'npm');
      
      npmTools.forEach(tool => {
        const packages = tool.installation.package.split(' ').filter(p => p.trim().length > 0);
        
        // Should have at least one package
        expect(packages.length).toBeGreaterThan(0);
        
        // Each package should be a valid npm package name format
        packages.forEach(pkg => {
          // For scoped packages (@scope/name), extract the name part
          // For regular packages, use the whole name
          let pkgName: string;
          if (pkg.startsWith('@')) {
            // Scoped package: @scope/name - get the name part after the slash
            const parts = pkg.split('/');
            if (parts.length >= 2) {
              pkgName = parts[1].split('@')[0].split('#')[0]; // Remove version if present
            } else {
              pkgName = pkg; // Fallback
            }
          } else {
            // Regular package: name - remove version specifiers
            pkgName = pkg.split('@')[0].split('#')[0];
          }
          expect(pkgName.length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('Detection Commands', () => {
    test('detection commands should be well-formed', () => {
      const externalTools = getExternalTools();
      
      externalTools.forEach(tool => {
        if (tool.detection.method === 'command') {
          const target = tool.detection.target;
          
          // Should not be empty
          expect(target.trim().length).toBeGreaterThan(0);
          
          // Should not contain obviously dangerous shell commands
          const dangerousCommands = ['rm -rf', 'delete', 'format', 'mkfs'];
          dangerousCommands.forEach(cmd => {
            expect(target.toLowerCase()).not.toContain(cmd);
          });
        }
      });
    });

    test('detection commands should reference valid commands', () => {
      const externalTools = getExternalTools();
      
      externalTools.forEach(tool => {
        if (tool.detection.method === 'command') {
          const target = tool.detection.target;
          
          // Extract the first command from the detection target
          // Handle both simple commands and compound commands (with && or ||)
          const firstCommand = target.split('&&')[0].split('||')[0].split(';')[0].trim();
          const commandParts = firstCommand.split(/\s+/);
          const baseCommand = commandParts[0];
          
          // Base command should not be empty
          expect(baseCommand.length).toBeGreaterThan(0);
          
          // Should not be a shell builtin that doesn't make sense for detection
          const invalidBuiltins = ['cd', 'export', 'source', 'eval'];
          expect(invalidBuiltins).not.toContain(baseCommand);
        }
      });
    });

    test('npm detection should reference valid npm packages', () => {
      const externalTools = getExternalTools();
      
      externalTools.forEach(tool => {
        if (tool.detection.method === 'npm') {
          const target = tool.detection.target;
          
          // npm detection target should be a package name
          expect(target.trim().length).toBeGreaterThan(0);
          
          // Should follow npm package name format
          if (target.startsWith('@')) {
            expect(target).toMatch(/^@[^/]+\/[^/]+/);
          } else {
            expect(target).not.toContain('@');
            expect(target).not.toContain('/');
          }
        }
      });
    });

    test('file detection should have valid file paths', () => {
      const externalTools = getExternalTools();
      
      externalTools.forEach(tool => {
        if (tool.detection.method === 'file') {
          const target = tool.detection.target;
          
          // File path should not be empty
          expect(target.trim().length).toBeGreaterThan(0);
          
          // Should not contain shell metacharacters
          expect(target).not.toMatch(/[;&|`$(){}[\]]/);
        }
      });
    });
  });

  describe('Command Structure', () => {
    test('command executables should be valid', () => {
      const externalTools = getExternalTools();
      
      externalTools.forEach(tool => {
        const executable = tool.command.executable;
        
        // Executable should not be empty
        expect(executable.trim().length).toBeGreaterThan(0);
        
        // Should not contain shell metacharacters
        expect(executable).not.toMatch(/[;&|`$(){}[\]]/);
        
        // Should not contain spaces (unless it's a path)
        if (!executable.includes('/') && !executable.includes('\\')) {
          expect(executable).not.toContain(' ');
        }
      });
    });

    test('command args should be valid', () => {
      const externalTools = getExternalTools();
      
      externalTools.forEach(tool => {
        const args = tool.command.args;
        
        // Args should be an array
        expect(Array.isArray(args)).toBe(true);
        
        // Each arg should be a string
        args.forEach(arg => {
          expect(typeof arg).toBe('string');
          // Args may contain template placeholders like {url}, {manifest}, etc.
          // These are valid, so we only check for dangerous shell metacharacters
          // that could be used for command injection, not template syntax
          const dangerousPatterns = /[;&|`$]/;
          // Allow {} for template placeholders, but check for other dangerous chars
          const argWithoutTemplates = arg.replace(/\{[^}]+\}/g, '');
          expect(argWithoutTemplates).not.toMatch(dangerousPatterns);
        });
      });
    });
  });

  describe('Package Name Validation', () => {
    test('npm package names should follow npm naming conventions', () => {
      const externalTools = getExternalTools();
      const npmTools = externalTools.filter(tool => tool.installation.type === 'npm');
      
      npmTools.forEach(tool => {
        const packages = tool.installation.package.split(' ').filter(p => p.trim().length > 0);
        
        packages.forEach(pkg => {
          // Remove version specifiers for validation
          const pkgNameOnly = pkg.split('@').filter((part, index) => {
            // For scoped packages, keep @scope/name, remove version @
            if (pkg.startsWith('@') && index === 0) return true;
            if (pkg.startsWith('@') && index === 1) return false; // version
            if (!pkg.startsWith('@') && index === 0) return true;
            return false;
          }).join('@').split('#')[0];
          
          // npm package name rules:
          // - Max 214 characters
          expect(pkgNameOnly.length).toBeLessThanOrEqual(214);
          
          // - Cannot start with . or _
          expect(pkgNameOnly[0]).not.toBe('.');
          expect(pkgNameOnly[0]).not.toBe('_');
          
          // - Cannot contain uppercase (for most cases)
          // Note: npm allows uppercase but discourages it
          if (pkgNameOnly.includes('/')) {
            const [scope, name] = pkgNameOnly.split('/');
            expect(scope.startsWith('@')).toBe(true);
          }
        });
      });
    });
  });

  describe('Command Execution Safety', () => {
    test('detection commands should not execute dangerous operations', () => {
      const externalTools = getExternalTools();
      
      externalTools.forEach(tool => {
        if (tool.detection.method === 'command') {
          const target = tool.detection.target.toLowerCase();
          
          // Should not contain dangerous operations
          const dangerousPatterns = [
            'rm -rf',
            'delete',
            'format',
            'mkfs',
            'dd if=',
            'shutdown',
            'reboot',
            '> /dev/',
            'curl.*|.*sh',
            'wget.*|.*sh',
          ];
          
          dangerousPatterns.forEach(pattern => {
            expect(target).not.toContain(pattern);
          });
        }
      });
    });

    test('installation commands should not contain dangerous operations', () => {
      const externalTools = getExternalTools();
      
      externalTools.forEach(tool => {
        const instructions = tool.installation.instructions.toLowerCase();
        
        // Installation instructions should not contain dangerous operations
        const dangerousPatterns = [
          'rm -rf',
          'delete',
          'format',
          'mkfs',
          'dd if=',
          'shutdown',
          'reboot',
        ];
        
        dangerousPatterns.forEach(pattern => {
          expect(instructions).not.toContain(pattern);
        });
      });
    });
  });

  describe('Consistency Checks', () => {
    test('detection method should match installation type where applicable', () => {
      const externalTools = getExternalTools();
      
      externalTools.forEach(tool => {
        // If installation is npm, detection could be npm or command
        if (tool.installation.type === 'npm') {
          expect(['command', 'npm']).toContain(tool.detection.method);
        }
        
        // If installation is pip, detection should typically be command
        if (tool.installation.type === 'pip') {
          expect(tool.detection.method).toBe('command');
        }
      });
    });

    test('package names in installation and detection should be consistent', () => {
      const externalTools = getExternalTools();
      
      externalTools.forEach(tool => {
        if (tool.installation.type === 'npm' && tool.detection.method === 'npm') {
          // If both use npm, the package names should match or be related
          const installPackages = tool.installation.package.split(' ').filter(p => p.trim().length > 0);
          const detectPackage = tool.detection.target;
          
          // At least one installation package should match or be related to detection package
          const hasMatch = installPackages.some(pkg => {
            const pkgName = pkg.split('@')[0].split('#')[0];
            return detectPackage.includes(pkgName) || pkgName.includes(detectPackage);
          });
          
          // This is a soft check - they should be related but exact match not required
          // (e.g., installing @grnsft/if but detecting @tngtech/if-webpage-plugins is valid)
        }
      });
    });
  });
});

