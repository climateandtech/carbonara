import fs from 'fs';
import path from 'path';
import execa from 'execa';
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
    instructions: string;
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
  }>;
  manifestTemplate?: any; // For Impact Framework tools
  display?: any; // For display configuration
  prerequisites?: Array<{
    type: string; // e.g., 'docker', 'node', 'python', 'command'
    name: string;
    checkCommand: string;
    expectedOutput?: string;
    errorMessage: string;
    setupInstructions?: string;
  }>;
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
          // For commands, we check if they exist and can be executed
          try {
            const result = await execa.command(tool.detection.target, { 
              stdio: 'pipe', 
              timeout: 5000,
              reject: false // Don't throw, check exit code
            });
            // Command succeeded (exit code 0) - tool is installed
            if (result.exitCode === 0) {
              return true;
            }
            // For help/version commands, non-zero exit might still mean installed
            // But exit code 127 definitely means command not found
            return result.exitCode !== 127;
          } catch (error: any) {
            // If execa throws, it's likely a command not found error
            return false;
          }
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