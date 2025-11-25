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
          // Best practice: Use the tool's own command (--help or --version) to check if installed
          // For tools installed via npx, we first check if the package is installed locally,
          // then try the tool's command directly (not via npx)
          
          // For local installations, first verify ALL packages are actually installed
          // This is important for tools with plugins (e.g., IF tools need both @grnsft/if and @tngtech/if-webpage-plugins)
          if (tool.installation?.global === false && tool.installation?.package) {
            // Collect all packages to check: base packages + plugin packages from manifest
            const packages = new Set<string>();
            
            // Add base installation packages
            tool.installation.package.split(' ').filter(p => p.trim()).forEach(p => packages.add(p.trim()));
            
            // Extract plugin packages from manifestTemplate if it exists
            if (tool.manifestTemplate) {
              const pluginPackages = this.extractPluginPackages(tool.manifestTemplate);
              pluginPackages.forEach(pkg => packages.add(pkg));
            }
            
            const installedPackages: string[] = [];
            const missingPackages: string[] = [];
            
            // Check each package - ALL must be installed
            for (const pkg of Array.from(packages)) {
              const packageName = pkg.trim();
              const nodeModulesPath = path.join(process.cwd(), 'node_modules', packageName.split('/').join(path.sep));
              
              let isInstalled = false;
              
              // Check if package exists in node_modules
              if (fs.existsSync(nodeModulesPath)) {
                isInstalled = true;
              } else {
                // Fallback: check with npm list
                try {
                  const npmResult = await execa('npm', ['list', '--depth=0', packageName], { 
                    stdio: 'pipe',
                    cwd: process.cwd(),
                    reject: false,
                    timeout: 5000
                  });
                  if (npmResult.exitCode === 0 && !npmResult.stdout.includes('(empty)') && !npmResult.stdout.includes('(no packages)')) {
                    isInstalled = true;
                  }
                } catch {
                  // npm list failed, assume not installed
                }
              }
              
              if (isInstalled) {
                installedPackages.push(packageName);
              } else {
                missingPackages.push(packageName);
              }
            }
            
            // ALL packages must be installed for the tool to be detected
            if (missingPackages.length > 0) {
              console.log(`❌ Tool ${tool.id} missing required packages: ${missingPackages.join(', ')}`);
              // Check config flag as fallback
              try {
                const { isToolMarkedInstalled } = await import('../utils/config.js');
                if (await isToolMarkedInstalled(tool.id)) {
                  return true;
                }
              } catch {
                // Config check failed
              }
              return false;
            }
            
            console.log(`✅ Tool ${tool.id} all required packages installed: ${installedPackages.join(', ')}`);
            
            // Package is installed locally - now try the tool's command
            // For local installations, we need to use npx to run the command
            // Check if the tool's executable uses npx (e.g., "npx" with --package flag)
            let detectionCommand = tool.detection.target;
            
            // If the tool's command uses npx with --package, we should use the same for detection
            if (tool.command.executable === 'npx' && tool.command.args[0]?.startsWith('--package=')) {
              // Extract package name from command args
              const packageMatch = tool.command.args[0].match(/--package=([^\s]+)/);
              if (packageMatch && packageMatch[1]) {
                const packageName = packageMatch[1];
                // Extract the actual command from detection.target
                let commandPart = detectionCommand;
                if (detectionCommand.startsWith('npx ')) {
                  const match = detectionCommand.match(/npx\s+(?:--package=[^\s]+\s+)?(.+)/);
                  if (match && match[1]) {
                    commandPart = match[1];
                  }
                }
                // Use npx with the package for detection
                detectionCommand = `npx --package=${packageName} ${commandPart}`;
              }
            } else if (detectionCommand.startsWith('npx ')) {
              // If detection already uses npx, keep it as is
              // Extract command after npx --package=... or just after npx
              const match = detectionCommand.match(/npx\s+(?:--package=[^\s]+\s+)?(.+)/);
              if (match && match[1]) {
                detectionCommand = match[1];
              }
            }
            
            // Try running the tool's command
            try {
              const result = await execaCommand(detectionCommand, { 
                stdio: 'pipe', 
                timeout: 5000,
                reject: false,
                cwd: process.cwd() // Use project directory for local installations
              });
              
              // Exit code 127 means command not found
              if (result.exitCode === 127) {
                // Check if detection was previously flagged as failed (false positive)
                try {
                  const { loadProjectConfig } = await import('../utils/config.js');
                  const config = await loadProjectConfig();
                  if (config?.tools?.[tool.id]?.detectionFailed) {
                    // Detection was previously incorrect, don't trust it
                    return false;
                  }
                } catch {
                  // Config check failed, continue
                }
                
                // Check config flag as fallback
                try {
                  const { isToolMarkedInstalled } = await import('../utils/config.js');
                  if (await isToolMarkedInstalled(tool.id)) {
                    return true;
                  }
                } catch {
                  // Config check failed
                }
                return false;
              }
              
              // Command succeeded (even if exit code is non-zero, it means the tool exists)
              return true;
            } catch (error: any) {
              // Check if it's a "command not found" error
              const errorMessage = error.message || String(error);
              const isCommandNotFound = 
                error.exitCode === 127 ||
                errorMessage.includes('command not found') ||
                errorMessage.includes('Command not found') ||
                errorMessage.includes('ENOENT');
              
              if (isCommandNotFound) {
                // Check config flag as fallback
                try {
                  const { isToolMarkedInstalled } = await import('../utils/config.js');
                  if (await isToolMarkedInstalled(tool.id)) {
                    return true;
                  }
                } catch {
                  // Config check failed
                }
                return false;
              }
              
              // Other error - tool might be installed but command failed for other reasons
              return true;
            }
          }
          
          // For global installations or tools without local package check, use detection.target directly
          try {
            const result = await execaCommand(tool.detection.target, { 
              stdio: 'pipe', 
              timeout: 5000,
              reject: false
            });
            
            // Exit code 127 means command not found - check config flag as fallback
            if (result.exitCode === 127) {
              try {
                const { isToolMarkedInstalled } = await import('../utils/config.js');
                if (await isToolMarkedInstalled(tool.id)) {
                  return true;
                }
              } catch {
                // Config check failed
              }
              return false;
            }
            
            // Command exists - tool is available
            return true;
          } catch (error: any) {
            // Check if it's a "command not found" error
            const errorMessage = error.message || String(error);
            const isCommandNotFound = 
              error.exitCode === 127 ||
              errorMessage.includes('command not found') ||
              errorMessage.includes('Command not found') ||
              errorMessage.includes('ENOENT');
            
            // If command not found, check config flag as fallback
            if (isCommandNotFound) {
              try {
                const { isToolMarkedInstalled } = await import('../utils/config.js');
                if (await isToolMarkedInstalled(tool.id)) {
                  return true; // Installation succeeded, trust the config flag
                }
              } catch {
                // Config check failed, continue with normal detection
              }
            }
            
            return !isCommandNotFound;
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

  /**
   * Extracts all unique plugin package names from a manifest template.
   * Looks for 'path' fields in plugin definitions.
   * Made public for testing purposes.
   */
  extractPluginPackages(manifest: any): string[] {
    const packages = new Set<string>();
    
    const extractFromObject = (obj: any): void => {
      if (!obj || typeof obj !== 'object') {
        return;
      }
      
      // Check if this object has a 'path' field (plugin definition)
      if (obj.path && typeof obj.path === 'string' && obj.path.startsWith('@')) {
        // Extract package name (e.g., "@tngtech/if-webpage-plugins" from path)
        const packageName = obj.path.split('/').slice(0, 2).join('/');
        if (packageName.includes('@') && packageName.includes('/')) {
          packages.add(packageName);
        }
      }
      
      // Recursively check all nested objects and arrays
      for (const value of Object.values(obj)) {
        if (Array.isArray(value)) {
          value.forEach(item => extractFromObject(item));
        } else if (value && typeof value === 'object') {
          extractFromObject(value);
        }
      }
    };
    
    extractFromObject(manifest);
    return Array.from(packages);
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