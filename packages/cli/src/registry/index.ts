import fs from 'fs';
import path from 'path';
import { execa, execaCommand } from 'execa';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AnalysisTool {
  id: string;
  name: string;
  description?: string;
  command: {
    executable: string;
    args: string[];
    outputFormat: 'json' | 'yaml' | 'text';
  };
  installation: {
    type: 'npm' | 'pip' | 'binary' | 'docker' | 'built-in';
    package: string;
    global?: boolean;
    command?: string; // Command to install the tool (for automated installation)
    instructions: string; // Installation instructions (for documentation)
  };
  detection: {
    method: 'command' | 'npm' | 'file' | 'built-in';
    target: string;
    expectedOutput?: string;
  };
  options?: Array<{
    flag: string;
    description: string;
    type: 'boolean' | 'string' | 'number';
    default?: any;
  }>;
  parameters?: Array<{
    name: string; // Parameter name without curly braces (e.g., 'url', 'testCommand')
    required: boolean;
    type?: 'string' | 'number' | 'boolean';
    description?: string;
    default?: any; // Default value if not provided
    placeholder?: string; // Placeholder name in manifest (defaults to {name})
  }>;
  parameterDefaults?: Record<string, any>; // Default values for parameters
  parameterMappings?: Record<string, {
    source?: string; // Source parameter name (for derived values)
    transform?: string; // Transform expression (e.g., "1 - {source}")
    type?: 'string' | 'number' | 'boolean'; // Type for the placeholder
  }>; // Mappings for derived/computed parameters
  manifestTemplate?: any; // For Impact Framework tools
  display?: any; // For display configuration
  prerequisites?: Array<{
    type: string;
    name: string;
    checkCommand: string;
    expectedOutput?: string;
    errorMessage: string;
    installCommand?: string;
    setupInstructions?: string;
  }>;
  displayName?: string; // Display name override (e.g., "Impact Framework" for IF tools)
}

export interface ToolRegistry {
  tools: AnalysisTool[];
}

export class AnalysisToolRegistry {
  private registry: ToolRegistry;
  private installedTools: Map<string, boolean> = new Map();
  private toolsRefreshed: boolean = false;

  constructor() {
    // Try multiple paths to find the registry file
    const possiblePaths = [
      path.join(__dirname, 'tools.json'),
      path.join(__dirname, '../registry/tools.json'),
      path.join(process.cwd(), 'src/registry/tools.json'),
      path.join(process.cwd(), 'packages/cli/src/registry/tools.json')
    ];
    
    let registryPath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        registryPath = p;
        break;
      }
    }
    
    if (!registryPath) {
      throw new Error(`Could not find tools registry file. Tried: ${possiblePaths.join(', ')}`);
    }
    
    this.registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

  }

  async refreshInstalledTools(): Promise<void> {
    this.installedTools.clear();
    
    // Run all tool checks in parallel with a global timeout
    type ToolCheckResult = { tool: AnalysisTool; isInstalled: boolean };
    
    const checks = this.registry.tools.map(tool => 
      Promise.race<ToolCheckResult>([
        this.checkToolInstallation(tool).then(isInstalled => ({ tool, isInstalled })),
        new Promise<ToolCheckResult>(resolve => 
          setTimeout(() => resolve({ tool, isInstalled: false }), 3000) // Increased timeout for CI
        )
      ])
    );
    
    const results = await Promise.all(checks);
    results.forEach((result: ToolCheckResult) => {
      this.installedTools.set(result.tool.id, result.isInstalled);
    });
    
    this.toolsRefreshed = true;
  }

  private async checkToolInstallation(tool: AnalysisTool): Promise<boolean> {
    try {
      switch (tool.detection.method) {
        case 'built-in':
          return true; // Built-in tools are always available
        case 'command':
          // Support both detection.target (backward compatible) and detection.commands (array)
          const commands: string[] = (tool.detection as any).commands || 
            (tool.detection.target ? [tool.detection.target] : []);
          
          if (commands.length === 0) {
            console.log(`⚠️  Tool ${tool.id} has no detection commands configured`);
            return false;
          }
          
          const failedCommands: Array<{ command: string; error: string }> = [];
          
          // Test each command sequentially - ALL must pass
          for (const command of commands) {
            try {
              const result = await execaCommand(command, { 
                stdio: 'pipe', 
                timeout: 5000,
                reject: false,
                cwd: process.cwd()
              });
              
              // Check stderr for npm/npx errors indicating tool not installed
              const stderr = result.stderr || '';
              const stdout = result.stdout || '';
              const combinedOutput = stderr + stdout;
              
              // Check for "could not determine executable" - means tool is not installed
              if (combinedOutput.includes('could not determine executable') || 
                  combinedOutput.includes('npm error could not determine executable')) {
                failedCommands.push({
                  command,
                  error: 'Tool not installed (could not determine executable)'
                });
                continue;
              }
              
              // Exit code 127 means command not found
              if (result.exitCode === 127) {
                failedCommands.push({
                  command,
                  error: 'Command not found'
                });
                continue;
              }
              
              // For npm list commands, check if package is actually listed
              if (command.startsWith('npm list')) {
                if (result.exitCode !== 0 || 
                    result.stdout.includes('(empty)') || 
                    result.stdout.includes('(no packages)')) {
                  failedCommands.push({
                    command,
                    error: 'Package not found in npm list'
                  });
                  continue;
                }
              }
              
              // For npx commands, check if they failed with npm errors
              if (command.startsWith('npx ') && result.exitCode !== 0) {
                // If npx fails with npm error, tool is likely not installed
                if (combinedOutput.includes('npm error')) {
                  failedCommands.push({
                    command,
                    error: 'Tool not installed (npx error)'
                  });
                  continue;
                }
                // If npx command fails but no npm error, tool might be installed but command failed
                // Check if we got any output (tool exists) vs no output (tool doesn't exist)
                if (combinedOutput.trim().length === 0) {
                  // No output means tool likely doesn't exist
                  failedCommands.push({
                    command,
                    error: 'Tool not installed (no output)'
                  });
                  continue;
                }
                // Tool exists (got output) but command failed - this is OK for detection
                // (e.g., --version might not be supported but tool is installed)
                // Continue to next command
              }
              
              // Command succeeded (exit code 0) or tool exists but command had wrong args (non-zero but has output)
              // Continue to next command
            } catch (error: any) {
              // Check if it's a "command not found" error
              const errorMessage = error.message || String(error);
              const isCommandNotFound = 
                error.exitCode === 127 ||
                errorMessage.includes('command not found') ||
                errorMessage.includes('Command not found') ||
                errorMessage.includes('ENOENT');
              
              if (isCommandNotFound) {
                failedCommands.push({
                  command,
                  error: errorMessage || 'Command not found'
                });
              } else {
                // Other error - tool might be installed but command failed for other reasons
                // Consider this as a pass (tool exists, just had an error)
              }
            }
          }
          
          // If any command failed, show which ones failed
          if (failedCommands.length > 0) {
            console.log(`❌ Tool ${tool.id} detection failed:`);
            const passedCommands = commands.filter(cmd => 
              !failedCommands.some(fc => fc.command === cmd)
            );
            passedCommands.forEach(cmd => {
              console.log(`   ✓ ${cmd} (passed)`);
            });
            failedCommands.forEach(({ command, error }) => {
              console.log(`   ✗ ${command} (failed: ${error})`);
            });
            
            // Detection failed = tool is NOT installed
            // This takes precedence over config flags - if detection fails, show as not installed (red)
            // Config flags are only used to allow running, not to change display status
            return false;
          }
          
          // All commands passed
          console.log(`✅ Tool ${tool.id} all detection commands passed`);
          return true;
        case 'npm':
          // Check if npm package is globally installed
          const result = await execa('npm', ['list', '-g', tool.detection.target], { stdio: 'pipe' });
          return !result.stdout.includes('(empty)');
        case 'file':
          return fs.existsSync(tool.detection.target);
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  getAllTools(): AnalysisTool[] {
    return this.registry.tools;
  }

  async getInstalledTools(): Promise<AnalysisTool[]> {
    if (!this.toolsRefreshed) {
      await this.refreshInstalledTools();
    }
    return this.registry.tools.filter(tool => this.installedTools.get(tool.id) === true);
  }

  /**
   * Checks if all prerequisites for a tool are available.
   * Returns true if all prerequisites are met, false otherwise.
   */
  async checkToolPrerequisites(toolId: string): Promise<{
    allAvailable: boolean;
    missing: Array<{ prerequisite: any; error: string }>;
  }> {
    const tool = this.getTool(toolId);
    if (!tool || !tool.prerequisites || tool.prerequisites.length === 0) {
      return { allAvailable: true, missing: [] };
    }

    try {
      const { checkPrerequisites } = await import('@carbonara/core');
      const prerequisites = tool.prerequisites.map((p: any) => ({
        type: p.type,
        name: p.name,
        checkCommand: p.checkCommand,
        expectedOutput: p.expectedOutput,
        errorMessage: p.errorMessage,
        installCommand: p.installCommand,
        setupInstructions: p.setupInstructions,
      }));

      const result = await checkPrerequisites(prerequisites);
      return result;
    } catch (error) {
      console.error(`Failed to check prerequisites for ${toolId}:`, error);
      // If we can't check, assume all are missing
      return {
        allAvailable: false,
        missing: tool.prerequisites.map((p: any) => ({
          prerequisite: p,
          error: p.errorMessage || 'Prerequisite check failed'
        }))
      };
    }
  }

  getTool(id: string): AnalysisTool | undefined {
    return this.registry.tools.find(tool => tool.id === id);
  }

  async isToolInstalled(id: string): Promise<boolean> {
    if (!this.toolsRefreshed) {
      await this.refreshInstalledTools();
    }
    return this.installedTools.get(id) === true;
  }

  getInstallationInstructions(id: string): string | undefined {
    const tool = this.getTool(id);
    return tool?.installation.instructions;
  }

  async installTool(id: string): Promise<boolean> {
    const tool = this.getTool(id);
    if (!tool) {
      throw new Error(`Tool ${id} not found in registry`);
    }

    try {
      switch (tool.installation.type) {
        case 'npm':
          const npmArgs = ['install'];
          if (tool.installation.global) {
            npmArgs.push('-g');
          }
          npmArgs.push(...tool.installation.package.split(' '));
          
          await execa('npm', npmArgs, { stdio: 'inherit' });
          break;
        case 'pip':
          const pipArgs = ['install'];
          if (tool.installation.global) {
            pipArgs.push('--user');
          }
          pipArgs.push(tool.installation.package);
          
          await execa('pip', pipArgs, { stdio: 'inherit' });
          break;
        default:
          throw new Error(`Installation type ${tool.installation.type} not supported yet`);
      }

      // Refresh installation status
      await this.refreshInstalledTools();
      return this.isToolInstalled(id);
    } catch (error) {
      console.error(`Failed to install ${tool.name}:`, error);
      return false;
    }
  }

  addTool(tool: AnalysisTool): void {
    // Check if tool already exists
    const existingIndex = this.registry.tools.findIndex(t => t.id === tool.id);
    if (existingIndex >= 0) {
      this.registry.tools[existingIndex] = tool;
    } else {
      this.registry.tools.push(tool);
    }
    
    // Save updated registry
    this.saveRegistry();
    
    // Refresh installation status
    this.refreshInstalledTools();
  }

  removeTool(id: string): boolean {
    const initialLength = this.registry.tools.length;
    this.registry.tools = this.registry.tools.filter(tool => tool.id !== id);
    
    if (this.registry.tools.length < initialLength) {
      this.saveRegistry();
      this.installedTools.delete(id);
      return true;
    }
    
    return false;
  }

  private saveRegistry(): void {
    const registryPath = path.join(__dirname, 'tools.json');
    fs.writeFileSync(registryPath, JSON.stringify(this.registry, null, 2));
  }

}

// Singleton instance
let registryInstance: AnalysisToolRegistry | null = null;

export function getToolRegistry(): AnalysisToolRegistry {
  if (!registryInstance) {
    registryInstance = new AnalysisToolRegistry();
  }
  return registryInstance;
}