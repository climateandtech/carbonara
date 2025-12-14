import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { spawn } from "child_process";
import { UI_TEXT } from "./constants/ui-text";
import { markToolInstalled, recordToolError, isToolMarkedInstalled, flagDetectionFailed } from "@carbonara/cli/dist/utils/config.js";

export interface AnalysisTool {
  id: string;
  name: string;
  description: string;
  type: "external" | "built-in";
  command: string;
  vscodeCommand?: string;
  installation?: {
    type: "npm" | "pip" | "binary" | "built-in";
    package: string;
    command?: string; // Command to install the tool (for automated installation)
    instructions?: string; // Installation instructions (for documentation)
    global?: boolean;
  };
  detection?: {
    method: "command" | "npm" | "file" | "built-in";
    target?: string;
    commands?: string[]; // Array of detection commands (new)
  };
  prerequisites?: Array<{
    type: string;
    name: string;
    checkCommand: string;
    expectedOutput?: string;
    errorMessage: string;
    installCommand?: string; // Command to install the prerequisite (for automated installation)
    setupInstructions?: string; // Installation instructions (for documentation)
  }>;
  options?: Array<{
    flag: string;
    description: string;
    type: "boolean" | "string" | "number";
    default?: any;
  }>;
  parameters?: Array<{
    name: string;
    required: boolean;
    type?: 'string' | 'number' | 'boolean';
    description?: string;
    placeholder?: string;
    default?: any;
  }>;
  parameterDefaults?: Record<string, any>;
  parameterMappings?: Record<string, { source: string; transform?: string; type?: 'string' | 'number' | 'boolean' }>;
  isInstalled?: boolean;
  prerequisitesMissing?: boolean; // True if tool is installed but prerequisites are missing
  lastError?: {
    message: string;
    timestamp: string;
  }; // Last error from execution (from config)
  hasCustomExecutionCommand?: boolean; // True if user has set a custom execution command
  autoInstall?: boolean; // If true, prompt user to install when tool is not found
}

export class ToolItem extends vscode.TreeItem {
  constructor(
    public readonly tool: AnalysisTool,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super(tool.name, collapsibleState);

    // Build tooltip with description and installation instructions
    this.tooltip = this.buildTooltip();
    
    // Build description with prerequisite status and info icon (appears on right, near arrow)
    let statusText: string;
    if (tool.type === "built-in") {
      statusText = "Built-in";
    } else if (tool.isInstalled) {
      // Only show "Error" if detection passed (tool.isInstalled is true)
      if (tool.lastError) {
        statusText = "Error";
      } else if (tool.prerequisitesMissing) {
        statusText = "Prerequisites missing";
      } else {
        statusText = "Installed";
      }
    } else {
      // Detection failed - show "Not installed" even if there's a lastError
      statusText = "Not installed";
    }
    
    // Description without info icon - inline actions will show icons on hover
    this.description = statusText;

    // Set icon based on installation status (traffic light system)
    if (tool.type === "built-in") {
      // Built-in tools: green circle
      this.iconPath = new vscode.ThemeIcon(
        "circle-filled",
        new vscode.ThemeColor("charts.green")
      );
    } else if (tool.isInstalled) {
      if (tool.lastError || tool.prerequisitesMissing) {
        // Execution error or prerequisites missing: yellow full circle
        this.iconPath = new vscode.ThemeIcon(
          "circle-filled",
          new vscode.ThemeColor("charts.yellow")
        );
      } else {
        // Installed and ready: green circle
        this.iconPath = new vscode.ThemeIcon(
          "circle-filled",
          new vscode.ThemeColor("charts.green")
        );
      }
    } else {
      // Not installed: red circle (outline)
      this.iconPath = new vscode.ThemeIcon(
        "circle-outline",
        new vscode.ThemeColor("charts.red")
      );
    }

    // Set context value for different actions
    if (tool.type === "built-in") {
      this.contextValue = "builtin-tool";
    } else if (tool.isInstalled || tool.hasCustomExecutionCommand) {
      // Tool is installed OR has custom execution command (can be run)
      // Special context for semgrep to show custom buttons even when installed as external tool
      if (tool.id === "semgrep") {
        this.contextValue = "builtin-tool-semgrep";
      } else if (tool.lastError) {
        this.contextValue = "installed-tool-error";
      } else if (tool.prerequisitesMissing) {
        this.contextValue = "installed-tool-prerequisites-missing";
      } else if (tool.hasCustomExecutionCommand) {
        // Tool with custom execution command (even if working) - allow editing the command
        this.contextValue = "installed-tool-custom-command";
      } else {
        this.contextValue = "installed-tool";
      }
    } else {
      this.contextValue = "uninstalled-tool";
    }
  }

  private buildTooltip(): string {
    const parts: string[] = [];
    
    // Add description
    if (this.tool.description) {
      parts.push(this.tool.description);
    }
    
    // Add last error if present
    if (this.tool.lastError) {
      if (parts.length > 0) {
        parts.push(""); // Empty line separator
      }
      parts.push("**⚠️ Last Error:**");
      parts.push(`\`${this.tool.lastError.message}\``);
      const errorDate = new Date(this.tool.lastError.timestamp);
      parts.push(`*Error occurred: ${errorDate.toLocaleString()}*`);
    }
    
    // Add installation instructions summary
    const instructions = this.getInstallationInstructionsSummary();
    if (instructions) {
      if (parts.length > 0) {
        parts.push(""); // Empty line separator
      }
      parts.push("**Installation Instructions:**");
      parts.push(instructions);
    }
    
    return parts.join("\n");
  }

  private getInstallationInstructionsSummary(): string {
    if (this.tool.type === "built-in") {
      return "This is a built-in tool and does not require installation.";
    }

    if (!this.tool.installation) {
      return "No installation instructions available.";
    }

    const instructions: string[] = [];

    // Add prerequisite setup if needed
    if (this.tool.prerequisites && this.tool.prerequisites.length > 0) {
      const prereqInstructions: string[] = [];
      this.tool.prerequisites.forEach((prereq: any) => {
        if (prereq.setupInstructions) {
          prereqInstructions.push(`• ${prereq.setupInstructions}`);
        }
      });
      if (prereqInstructions.length > 0) {
        instructions.push("**Prerequisites:**");
        instructions.push(...prereqInstructions);
        instructions.push(""); // Empty line
      }
    }

    // Add installation command
    if (this.tool.installation.type === "npm") {
      if (this.tool.installation.instructions) {
        // Use custom instructions if provided (may include prerequisite setup)
        instructions.push("**Install:**");
        instructions.push(`\`${this.tool.installation.instructions}\``);
      } else if (this.tool.installation.global) {
        instructions.push("**Install:**");
        instructions.push(`\`npm install -g ${this.tool.installation.package}\``);
      } else {
        instructions.push("**Install:**");
        instructions.push(`\`npm install ${this.tool.installation.package}\``);
      }
    } else if (this.tool.installation.type === "pip") {
      instructions.push("**Install:**");
      instructions.push(`\`pip install ${this.tool.installation.package}\``);
    } else if (this.tool.installation.instructions) {
      instructions.push("**Install:**");
      instructions.push(this.tool.installation.instructions);
    }

    return instructions.join("\n");
  }
}

export class ToolsTreeProvider implements vscode.TreeDataProvider<ToolItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    ToolItem | undefined | null | void
  > = new vscode.EventEmitter<ToolItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    ToolItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private tools: AnalysisTool[] = [];
  private workspaceFolder: vscode.WorkspaceFolder | undefined;

  constructor() {
    this.workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    // Load tools asynchronously and handle errors
    this.loadTools().catch((error) => {
      console.error("🔧 Failed to load tools in constructor:", error);
      // Fire change event even if loading failed so UI shows the "no tools" message
      this._onDidChangeTreeData.fire();
    });
  }

  refresh(): void {
    this.loadTools().catch((error) => {
      console.error("Failed to refresh tools:", error);
    }); // loadTools() already calls _onDidChangeTreeData.fire()
  }

  async refreshAsync(): Promise<void> {
    await this.loadTools(); // loadTools() already calls _onDidChangeTreeData.fire()
  }

  getTool(toolId: string): AnalysisTool | undefined {
    return this.tools.find((t) => t.id === toolId);
  }

  getTreeItem(element: ToolItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ToolItem): Thenable<ToolItem[]> {
    // Check if workspace is open
    if (!this.workspaceFolder) {
      // No workspace open - return empty
      return Promise.resolve([]);
    }

    // Check if Carbonara is initialized
    const configPath = path.join(
      this.workspaceFolder.uri.fsPath,
      ".carbonara",
      "carbonara.config.json"
    );

    if (!fs.existsSync(configPath)) {
      // Workspace exists but Carbonara is not initialized
      // Show a single item with description styling
      const descriptionItem = new ToolItem(
        {
          id: "not-initialized-description",
          name: "",
          description: "Initialise Carbonara to access analysis tools",
          type: "built-in" as const,
          command: "",
          isInstalled: false,
        },
        vscode.TreeItemCollapsibleState.None
      );
      descriptionItem.iconPath = undefined; // No icon
      descriptionItem.contextValue = "description-text";
      return Promise.resolve([descriptionItem]);
    }

    // Always show tools
    if (element) {
      // No children for individual tools
      return Promise.resolve([]);
    } else {
      // Return all tools grouped by status
      const items = this.createToolItems();
      return Promise.resolve(items);
    }
  }

  private createToolItems(): ToolItem[] {
    const items: ToolItem[] = [];

    // If no tools are loaded, show a helpful message
    if (this.tools.length === 0) {
      const noToolsItem = new ToolItem(
        {
          id: "no-tools",
          name: UI_TEXT.TOOLS_TREE.NO_TOOLS,
          description: UI_TEXT.TOOLS_TREE.NO_TOOLS_DESCRIPTION,
          type: "built-in" as const,
          command: "",
          isInstalled: false,
        },
        vscode.TreeItemCollapsibleState.None
      );
      noToolsItem.iconPath = new vscode.ThemeIcon("info");
      noToolsItem.contextValue = "no-tools";
      items.push(noToolsItem);
      return items;
    }

    // Group tools by status
    const installedTools = this.tools.filter(
      (tool) => tool.type === "built-in" || (tool.isInstalled && !tool.prerequisitesMissing)
    );
    const toolsWithMissingPrerequisites = this.tools.filter(
      (tool) => tool.isInstalled && tool.prerequisitesMissing
    );
    const uninstalledTools = this.tools.filter(
      (tool) => tool.type === "external" && !tool.isInstalled
    );

    // Add installed tools (without missing prerequisites)
    // Don't set command on TreeItem - use inline actions instead for better control
    installedTools.forEach((tool) => {
      const item = new ToolItem(
        tool,
        vscode.TreeItemCollapsibleState.None
      );
      items.push(item);
    });

    // Add tools with missing prerequisites
    // Don't set command on TreeItem - use inline actions instead
    toolsWithMissingPrerequisites.forEach((tool) => {
      const item = new ToolItem(
        tool,
        vscode.TreeItemCollapsibleState.None
      );
      items.push(item);
    });

    // Add uninstalled tools
    // Don't set command on TreeItem - use inline actions instead
    uninstalledTools.forEach((tool) => {
      const item = new ToolItem(
        tool,
        vscode.TreeItemCollapsibleState.None
      );
      items.push(item);
    });

    return items;
  }

  private async loadTools(): Promise<void> {
    try {
      // HIGHEST PRIORITY: Check if CARBONARA_REGISTRY_PATH is set (for testing/override)
      if (process.env.CARBONARA_REGISTRY_PATH) {
        if (await this.loadFromRegistryPath(process.env.CARBONARA_REGISTRY_PATH)) {
          this._onDidChangeTreeData.fire();
          return;
        }
      }

      // ALWAYS try workspace tools.json first
      if (await this.loadWorkspaceTools()) {
        this._onDidChangeTreeData.fire();
        return;
      }

      // Try bundled registry (for packaged extension)
      if (await this.loadBundledRegistry()) {
        this._onDidChangeTreeData.fire();
        return;
      }

      // Try CLI registry (for development in monorepo)
      const cliPath = await this.findCarbonaraCLI();
      if (cliPath) {
        await this.loadToolsFromRegistry(cliPath);
        this._onDidChangeTreeData.fire();
        return;
      }

      // Last resort: show "no tools available" message
      this.tools = [];
      this._onDidChangeTreeData.fire();
    } catch (error: any) {
      console.error("🔧 Failed to load tools:", error);
      this.tools = [];
      this._onDidChangeTreeData.fire();
    }
  }

  private async loadLastError(toolId: string): Promise<{ message: string; timestamp: string } | undefined> {
    if (!this.workspaceFolder) {
      return undefined;
    }
    try {
      const { getToolLastError } = await import("@carbonara/cli/dist/utils/config.js");
      return await getToolLastError(toolId, this.workspaceFolder.uri.fsPath) || undefined;
    } catch (configError) {
      // Silently fail - config check is optional
      return undefined;
    }
  }

  private async hasCustomExecutionCommand(toolId: string): Promise<boolean> {
    if (!this.workspaceFolder) {
      return false;
    }
    try {
      const { getCustomExecutionCommand } = await import("@carbonara/cli/dist/utils/config.js");
      const customCommand = await getCustomExecutionCommand(toolId, this.workspaceFolder.uri.fsPath);
      return !!customCommand;
    } catch (configError) {
      // Silently fail - config check is optional
      return false;
    }
  }

  private async loadBundledRegistry(): Promise<boolean> {
    try {
      // Look for registry bundled with the extension
      // __dirname in the compiled extension points to dist/, and registry is at dist/registry/
      const bundledRegistryPath = path.join(
        __dirname,
        "registry",
        "tools.json"
      );

      if (!fs.existsSync(bundledRegistryPath)) {
        return false;
      }

      const registryContent = fs.readFileSync(bundledRegistryPath, "utf8");
      const registry = JSON.parse(registryContent);

      // Transform and load tools
      this.tools = await Promise.all(
        registry.tools.map(async (tool: any) => {
          const isBuiltIn = tool.installation?.type === "built-in";
          const isInstalled = isBuiltIn
            ? true
            : await this.detectToolInstallation(tool);
          
          // Check prerequisites if tool is installed
          let prerequisitesMissing = false;
          if (isInstalled && tool.prerequisites && tool.prerequisites.length > 0) {
            prerequisitesMissing = !(await this.checkToolPrerequisites(tool));
          }
          
          // Load lastError from config
          const lastError = await this.loadLastError(tool.id);
          
          // Check for custom execution command
          const hasCustomCommand = await this.hasCustomExecutionCommand(tool.id);
          
          return {
            id: tool.id,
            name: tool.name,
            description: tool.description,
            type: isBuiltIn ? "built-in" : "external",
            command: tool.command?.executable || tool.command,
            vscodeCommand: tool.vscodeCommand,
            installation: tool.installation,
            detection: tool.detection,
            prerequisites: tool.prerequisites,
            parameters: tool.parameters,
            parameterDefaults: tool.parameterDefaults,
            parameterMappings: tool.parameterMappings,
            isInstalled,
            prerequisitesMissing,
            lastError,
            hasCustomExecutionCommand: hasCustomCommand,
          };
        })
      );

      return true;
    } catch (error) {
      console.error("❌ Failed to load bundled registry:", error);
      return false;
    }
  }

  private async loadFromRegistryPath(registryPath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(registryPath)) {
        return false;
      }

      const registryContent = fs.readFileSync(registryPath, "utf8");
      const registry = JSON.parse(registryContent);

      // Transform and load tools
      this.tools = await Promise.all(
        registry.tools.map(async (tool: any) => {
          const isBuiltIn = tool.installation?.type === "built-in";
          const isInstalled = isBuiltIn
            ? true
            : await this.detectToolInstallation(tool);
          
          // Check prerequisites if tool is installed
          let prerequisitesMissing = false;
          if (isInstalled && tool.prerequisites && tool.prerequisites.length > 0) {
            prerequisitesMissing = !(await this.checkToolPrerequisites(tool));
          }
          
          // Load lastError from config
          const lastError = await this.loadLastError(tool.id);
          
          // Check for custom execution command
          const hasCustomCommand = await this.hasCustomExecutionCommand(tool.id);
          
          return {
            id: tool.id,
            name: tool.name,
            description: tool.description,
            type: isBuiltIn ? "built-in" : "external",
            command: tool.command?.executable || tool.command,
            vscodeCommand: tool.vscodeCommand,
            installation: tool.installation,
            detection: tool.detection,
            prerequisites: tool.prerequisites,
            parameters: tool.parameters,
            parameterDefaults: tool.parameterDefaults,
            parameterMappings: tool.parameterMappings,
            isInstalled,
            prerequisitesMissing,
            lastError,
            hasCustomExecutionCommand: hasCustomCommand,
          };
        })
      );

      return true;
    } catch (error) {
      console.error("❌ Failed to load registry from path:", error);
      return false;
    }
  }

  private async loadToolsFromRegistry(cliPath: string): Promise<void> {
    try {
      // Best practice: Use environment variable for registry path
      const registryPath =
        process.env.CARBONARA_REGISTRY_PATH ||
        path.join(path.dirname(cliPath), "registry", "tools.json");

      if (fs.existsSync(registryPath)) {
        const registryContent = fs.readFileSync(registryPath, "utf8");
        const registry = JSON.parse(registryContent);

        // Transform registry format to match our interface
        this.tools = await Promise.all(registry.tools.map(async (tool: any) => {
          const isBuiltIn = tool.installation?.type === "built-in";
          const isInstalled = isBuiltIn
            ? true
            : await this.detectToolInstallation(tool);
          
          // Check prerequisites if tool is installed
          let prerequisitesMissing = false;
          if (isInstalled && tool.prerequisites && tool.prerequisites.length > 0) {
            prerequisitesMissing = !(await this.checkToolPrerequisites(tool));
          }
          
          // Load lastError from config
          const lastError = await this.loadLastError(tool.id);
          
          // Check for custom execution command
          const hasCustomCommand = await this.hasCustomExecutionCommand(tool.id);
          
          return {
          id: tool.id,
          name: tool.name,
          description: tool.description,
            type: isBuiltIn ? "built-in" : "external",
          command: tool.command?.executable || tool.command,
          vscodeCommand: tool.vscodeCommand,
          installation: tool.installation,
          detection: tool.detection,
            prerequisites: tool.prerequisites,
            parameters: tool.parameters,
            parameterDefaults: tool.parameterDefaults,
            parameterMappings: tool.parameterMappings,
            isInstalled,
            prerequisitesMissing,
            lastError,
            hasCustomExecutionCommand: hasCustomCommand,
            autoInstall: tool.autoInstall,
          };
        }));

        // Check installation status for external tools
        await this.checkToolInstallationStatus();
      } else {
        this.tools = [];
      }
    } catch (error: any) {
      console.error("❌ Failed to load tools registry:", error);
      this.tools = [];
    }
  }

  private async checkToolInstallationStatus(): Promise<void> {
    for (const tool of this.tools) {
      if (tool.type === "built-in") {
        tool.isInstalled = true;
      } else if (tool.detection) {
        tool.isInstalled = await this.checkExternalToolInstallation(tool);
      }
    }
  }

  private async checkExternalToolInstallation(
    tool: AnalysisTool
  ): Promise<boolean> {
    if (!tool.detection) return false;

    try {
      if (tool.detection.method === "command") {
        // Support both detection.target (backward compatible) and detection.commands (array)
        const commands: string[] = (tool.detection as any).commands || 
          (tool.detection.target ? [tool.detection.target] : []);
        
        if (commands.length === 0) {
          return false;
        }
        
        // Test the first command
        const command = commands[0].split(" ")[0];
        await this.runCommand(command, ["--version"]);
        return true;
      }
      // Add other detection methods as needed
      return false;
    } catch {
      return false;
    }
  }

  public async installTool(toolId: string): Promise<void> {
    const tool = this.tools.find((t) => t.id === toolId);
    if (!tool || tool.type === "built-in") {
      return;
    }

    // Check if already installed
    if (tool.isInstalled && !tool.prerequisitesMissing) {
      vscode.window.showInformationMessage(
        `${tool.name} is already installed and ready to use.`
      );
      return;
    }

    // If only prerequisites are missing, check and install them
    if (tool.isInstalled && tool.prerequisitesMissing && tool.prerequisites) {
      const missingPrereqs = [];
      for (const prereq of tool.prerequisites) {
        const isAvailable = await this.checkSinglePrerequisite(prereq);
        if (!isAvailable) {
          missingPrereqs.push(prereq);
        }
      }

      if (missingPrereqs.length > 0) {
        // Try to install prerequisites that have commands
        for (const prereq of missingPrereqs) {
          const hasPlaywrightPrereq = prereq.type === "playwright";
          const hasPuppeteerPrereq = prereq.type === "puppeteer";
          
          if (hasPlaywrightPrereq) {
            try {
              const { arePlaywrightBrowsersInstalled, ensurePlaywrightBrowsersInstalled } = await import(
                "./utils/browser-setup.js"
              );
              if (!(await arePlaywrightBrowsersInstalled())) {
                await ensurePlaywrightBrowsersInstalled();
              }
            } catch (error: any) {
              vscode.window.showWarningMessage(
                `Could not install Playwright browsers: ${error.message}`
              );
            }
          } else if (hasPuppeteerPrereq) {
            try {
              const { arePuppeteerBrowsersInstalled, ensurePuppeteerBrowsersInstalled } = await import(
                "./utils/browser-setup.js"
              );
              if (!(await arePuppeteerBrowsersInstalled())) {
                await ensurePuppeteerBrowsersInstalled();
              }
            } catch (error: any) {
              vscode.window.showWarningMessage(
                `Could not install Puppeteer browsers: ${error.message}`
              );
            }
          } else if (prereq.installCommand) {
            // Use installCommand if available
            try {
        vscode.window.showInformationMessage(
                `Installing prerequisite: ${prereq.name}...`
        );
              await this.runCommand("sh", ["-c", prereq.installCommand]);
        vscode.window.showInformationMessage(
                `✅ ${prereq.name} installed successfully`
              );
            } catch (error: any) {
              vscode.window.showWarningMessage(
                `Could not install ${prereq.name}: ${error.message}`
              );
            }
          }
        }

        // Refresh to check if prerequisites are now met
        await this.refreshAsync();
        
        // Re-check prerequisites after refresh
        const refreshedTool = this.tools.find((t) => t.id === toolId);
        if (refreshedTool && !refreshedTool.prerequisitesMissing) {
        vscode.window.showInformationMessage(
            `✅ ${tool.name} prerequisites installed successfully!`
          );
        }
        
        // Always show documentation after attempting prerequisite installation
        const { showToolInstallationInstructions } = await import("./tool-installation-provider");
        await showToolInstallationInstructions(toolId);
        return;
      }
    }

    // Check for prerequisites and install them first if needed (for uninstalled tools)
    if (tool.prerequisites && tool.prerequisites.length > 0) {
      const hasPlaywrightPrereq = tool.prerequisites.some(
        (p: any) => p.type === "playwright"
      );
      const hasPuppeteerPrereq = tool.prerequisites.some(
        (p: any) => p.type === "puppeteer"
      );
      
      if (hasPlaywrightPrereq) {
        try {
          const { arePlaywrightBrowsersInstalled, ensurePlaywrightBrowsersInstalled } = await import(
            "./utils/browser-setup.js"
          );
          if (!(await arePlaywrightBrowsersInstalled())) {
            await ensurePlaywrightBrowsersInstalled();
          }
    } catch (error: any) {
          vscode.window.showWarningMessage(
            `Could not install Playwright browsers: ${error.message}. You may need to install them manually.`
          );
        }
      } else if (hasPuppeteerPrereq) {
        try {
          const { arePuppeteerBrowsersInstalled, ensurePuppeteerBrowsersInstalled } = await import(
            "./utils/browser-setup.js"
          );
          if (!(await arePuppeteerBrowsersInstalled())) {
            await ensurePuppeteerBrowsersInstalled();
            // Refresh after installing prerequisites
            await this.refreshAsync();
          }
        } catch (error: any) {
          vscode.window.showWarningMessage(
            `Could not install Puppeteer browsers: ${error.message}. You may need to install them manually.`
          );
        }
      }
    }

    // Check if tool installation type is supported
    if (!tool.installation || (tool.installation.type !== "npm" && tool.installation.type !== "pip")) {
      // For unsupported installation types (binary, docker, etc.), show instructions
      const { showToolInstallationInstructions } = await import("./tool-installation-provider");
      await showToolInstallationInstructions(toolId);
      return;
    }

    try {
      // Show progress notification
      vscode.window.showInformationMessage(
        `Installing ${tool.name}...`
      );

      // Use shared installation function (same as CLI)
      const { installToolWithLogging } = await import("@carbonara/cli/dist/utils/tool-installer.js");
      const projectPath = this.workspaceFolder?.uri.fsPath;
      
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Installing ${tool.name}`,
          cancellable: false,
        },
        async (progress) => {
          progress.report({ increment: 0, message: `Installing ${tool.name}...` });
          const installResult = await installToolWithLogging(toolId, projectPath);
          progress.report({ increment: 100, message: "Installation complete" });
          return installResult;
        }
      );

      // Check if installation was successful by refreshing and checking status
      await this.refreshAsync();
      
      // Re-check installation status
      const updatedTool = this.tools.find((t) => t.id === toolId);
      if (result.success) {
        if (updatedTool?.isInstalled && !updatedTool?.prerequisitesMissing) {
          vscode.window.showInformationMessage(
            `✅ ${tool.name} installed successfully!`
          );
        } else if (updatedTool?.isInstalled && updatedTool?.prerequisitesMissing) {
          vscode.window.showWarningMessage(
            `Installation completed, but prerequisites are still missing. Please check the output for details.`
          );
        } else {
          // Installation succeeded but detection failed - show success anyway since we marked it
          vscode.window.showInformationMessage(
            `✅ ${tool.name} installed successfully! (Detection may take a moment)`
          );
        }
      } else {
        vscode.window.showErrorMessage(
          `Failed to install ${tool.name}${result.error ? `: ${result.error}` : ''}`
        );
        
        // Show installation instructions as fallback
        const { showToolInstallationInstructions } = await import("./tool-installation-provider");
        await showToolInstallationInstructions(toolId);
      }
    } catch (error: any) {
      console.error(`[ToolsTreeProvider] Installation failed:`, error);
      vscode.window.showErrorMessage(
        `Failed to install ${tool.name}: ${error.message}`
      );
      
      // Show installation instructions as fallback
      const { showToolInstallationInstructions } = await import("./tool-installation-provider");
      await showToolInstallationInstructions(toolId);
    }
  }

  public async showToolInstallation(toolId: string): Promise<void> {
    // Show installation instructions for any tool (including built-in)
    const { showToolInstallationInstructions } = await import("./tool-installation-provider");
    await showToolInstallationInstructions(toolId);
  }

  public async analyzeTool(toolId: string): Promise<void> {
    const tool = this.tools.find((t) => t.id === toolId);
    if (!tool) {
      return;
    }

    // Allow running if:
    // 1. Tool is detected as installed (tool.isInstalled)
    // 2. Tool is marked as installed in config (installation succeeded but detection failed)
    // 3. Tool has a custom execution command (user manually set it)
    let canRun = tool.isInstalled;
    if (!canRun && this.workspaceFolder) {
      const { isToolMarkedInstalled, getCustomExecutionCommand } = await import("@carbonara/cli/dist/utils/config.js");
      const isMarkedInstalled = await isToolMarkedInstalled(toolId, this.workspaceFolder.uri.fsPath);
      const customCommand = await getCustomExecutionCommand(toolId, this.workspaceFolder.uri.fsPath);
      canRun = isMarkedInstalled || !!customCommand;
    }
    
    if (!canRun) {
      // Check if tool has autoInstall enabled
      if (tool.autoInstall) {
        const installChoice = await vscode.window.showWarningMessage(
          `${tool.name} is not installed. Would you like to install it now?`,
          "Install Now",
          "Install Manually",
          "Cancel"
        );

        if (installChoice === "Install Now") {
          try {
            const { getToolRegistry } = await import("@carbonara/cli/dist/registry/index.js");
            const registry = getToolRegistry();
            
            const installSuccess = await vscode.window.withProgress(
              {
                location: vscode.ProgressLocation.Notification,
                title: `Installing ${tool.name}`,
                cancellable: false,
              },
              async (progress) => {
                progress.report({ increment: 0, message: `Installing ${tool.name}...` });
                const success = await registry.installTool(toolId);
                progress.report({ increment: 100, message: "Installation complete" });
                return success;
              }
            );

            if (installSuccess) {
              vscode.window.showInformationMessage(`✅ ${tool.name} installed successfully!`);
              // Refresh tools to update installation status
              await this.refreshAsync();
              // Re-check if tool is now installed
              const updatedTool = this.tools.find((t) => t.id === toolId);
              if (updatedTool?.isInstalled) {
                // Tool is now installed, proceed with analysis
                canRun = true;
              } else {
                vscode.window.showWarningMessage(
                  `${tool.name} installation completed, but it may not be detected yet. Please try again.`
                );
                return;
              }
            } else {
              vscode.window.showErrorMessage(
                `${tool.name} installation failed. Please install manually.`
              );
              const { showToolInstallationInstructions } = await import("./tool-installation-provider");
              await showToolInstallationInstructions(toolId);
              return;
            }
          } catch (error: any) {
            vscode.window.showErrorMessage(
              `Failed to install ${tool.name}: ${error.message}`
            );
            return;
          }
        } else if (installChoice === "Install Manually") {
          const { showToolInstallationInstructions } = await import("./tool-installation-provider");
          await showToolInstallationInstructions(toolId);
          return;
        } else {
          // User cancelled
          return;
        }
      } else {
        // No autoInstall, show error and instructions
        vscode.window.showErrorMessage(
          `${tool.name} is not installed. Please install it first or set a custom execution command.`
        );
        const { showToolInstallationInstructions } = await import("./tool-installation-provider");
        await showToolInstallationInstructions(toolId);
        return;
      }
    }
    
    // If detection failed but installation succeeded, show a warning
    if (!tool.isInstalled && this.workspaceFolder && await isToolMarkedInstalled(toolId, this.workspaceFolder.uri.fsPath)) {
      const proceed = await vscode.window.showWarningMessage(
        `${tool.name} installation succeeded but detection failed. Do you want to try running it anyway?`,
        "Yes, try anyway",
        "Cancel"
      );
      
      if (proceed !== "Yes, try anyway") {
        return;
      }
    }

    // Check if tool has missing prerequisites and try to install them
    if (tool.prerequisitesMissing && tool.prerequisites) {
      const hasPlaywrightPrereq = tool.prerequisites.some(
        (p: any) => p.type === "playwright"
      );
      const hasPuppeteerPrereq = tool.prerequisites.some(
        (p: any) => p.type === "puppeteer"
      );
      
      if (hasPlaywrightPrereq) {
        try {
          const { ensurePlaywrightBrowsersInstalled } = await import(
            "./utils/browser-setup.js"
          );
          await ensurePlaywrightBrowsersInstalled();
          
          // Refresh tools to update prerequisite status
          this.refresh();
        } catch (error: any) {
          // Installation failed or was cancelled, show error
          vscode.window.showErrorMessage(
            `Cannot run ${tool.name}: Playwright browsers are required but not installed. ${error.message}`
          );
          return;
        }
      } else if (hasPuppeteerPrereq) {
        try {
          const { ensurePuppeteerBrowsersInstalled } = await import(
            "./utils/browser-setup.js"
          );
          await ensurePuppeteerBrowsersInstalled();
          
          // Refresh tools to update prerequisite status
          this.refresh();
        } catch (error: any) {
          // Installation failed or was cancelled, show error
          vscode.window.showErrorMessage(
            `Cannot run ${tool.name}: Puppeteer browsers are required but not installed. ${error.message}`
          );
          return;
        }
      } else {
        // Other prerequisites - show installation instructions
        vscode.window.showWarningMessage(
          `${tool.name} requires prerequisites that are not installed. Opening installation instructions...`
        );
        const { showToolInstallationInstructions } = await import("./tool-installation-provider");
        await showToolInstallationInstructions(toolId);
        return;
      }
    }

    // Check if tool has a custom VSCode command
    if (tool.vscodeCommand) {
      vscode.commands.executeCommand(tool.vscodeCommand);
      return;
    }

    const url = await vscode.window.showInputBox({
      prompt: `Enter URL to analyze with ${tool.name}`,
      placeHolder: "https://example.com",
    });

    if (!url) {
      return;
    }

    // Declare cliPath and cliArgs outside try block so they're available in catch
    let cliPath: string | null = null;
    const cliArgs = ["analyze", tool.id, url, "--save"];

    // Collect tool options if available
    if (tool.options && tool.options.length > 0) {
      for (const option of tool.options) {
        // Skip built-in options that are handled automatically
        if (
          option.flag.includes("--save") ||
          option.flag.includes("--output")
        ) {
          continue;
        }

        let value: any = undefined;

        switch (option.type) {
          case "boolean":
            const booleanResult = await vscode.window.showQuickPick(
              [
                { label: "Yes", value: true },
                { label: "No", value: false },
              ],
              {
                placeHolder: option.description,
                ignoreFocusOut: true,
              }
            );
            value = booleanResult?.value;
            break;

          case "number":
            const numberInput = await vscode.window.showInputBox({
              prompt: option.description,
              value: option.default?.toString() || "",
              validateInput: (value) => {
                if (value && isNaN(Number(value))) {
                  return "Please enter a valid number";
                }
                return undefined;
              },
              ignoreFocusOut: true,
            });
            value = numberInput ? Number(numberInput) : undefined;
            break;

          case "string":
            const stringInput = await vscode.window.showInputBox({
              prompt: option.description,
              value: option.default?.toString() || "",
              ignoreFocusOut: true,
            });
            value = stringInput;
            break;
        }

        // Add option to CLI args if value was provided
        if (value !== undefined && value !== null) {
          if (option.type === "boolean" && value === true) {
            // For boolean true, just add the flag
            const flag = option.flag.split(",")[0].trim(); // Get first flag if multiple
            cliArgs.push(flag);
          } else if (option.type !== "boolean") {
            // For non-boolean, add flag and value
            const flag = option.flag.split(",")[0].trim();
            cliArgs.push(flag, value.toString());
          }
        }
      }
    }

    try {
      cliPath = await this.findCarbonaraCLI();
      if (!cliPath) {
        vscode.window.showErrorMessage(UI_TEXT.NOTIFICATIONS.CLI_NOT_FOUND);
        return;
      }

      vscode.window.showInformationMessage(
        UI_TEXT.NOTIFICATIONS.ANALYSIS_RUNNING(tool.name)
      );

      console.log(`[ToolsTreeProvider] Running CLI command: ${cliPath} ${cliArgs.join(' ')}`);
      const result = await this.runCarbonaraCommand(cliPath, cliArgs);
      
      // Log the result for debugging - this should show all CLI output including our debug logs
      console.log(`[ToolsTreeProvider] CLI command output:`, result);
      
      // Log successful execution
      if (this.workspaceFolder) {
        try {
          const { logToolAction } = await import("@carbonara/cli/dist/utils/tool-logger.js");
          await logToolAction({
            timestamp: new Date().toISOString(),
            toolId,
            action: 'run',
            command: `${cliPath} ${cliArgs.join(' ')}`,
            output: result.substring(0, 2000), // Limit output length
            exitCode: 0,
          }, this.workspaceFolder.uri.fsPath);
        } catch (logError) {
          // Silently fail - logging is optional
          console.error(`[ToolsTreeProvider] Failed to log execution:`, logError);
        }
      }
      
      // Also show in output channel for visibility
      const outputChannel = vscode.window.createOutputChannel('Carbonara CLI');
      outputChannel.appendLine(`=== ${tool.name} Analysis ===`);
      outputChannel.appendLine(result);
      outputChannel.show();

      vscode.window.showInformationMessage(
        UI_TEXT.NOTIFICATIONS.ANALYSIS_COMPLETED(tool.name)
      );

      // Clear any previous errors since the tool ran successfully
      if (this.workspaceFolder) {
        try {
          const { clearToolError } = await import("@carbonara/cli/dist/utils/config.js");
          await clearToolError(toolId, this.workspaceFolder.uri.fsPath);
        } catch (configError) {
          console.error(`[ToolsTreeProvider] Failed to clear tool error:`, configError);
        }
      }

      // Wait a moment for database file to be fully written to disk
      // The CLI closes the database connection, but file system writes may still be buffered
      // The file watcher should auto-refresh, but we add a manual refresh as fallback
      // after a delay to ensure the UI updates even if the file watcher misses the change
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Refresh tools tree to update status (clear error state, show green)
      await this.refreshAsync();

      // Refresh data tree to show new results
      // This will reload the database from disk and update the UI
      // Note: The file watcher should also trigger a refresh, but this ensures it happens
      await vscode.commands.executeCommand("carbonara.refreshData");
    } catch (error: any) {
      console.error(`[ToolsTreeProvider] CLI command failed:`, error);
      
      // Log error
      if (this.workspaceFolder && cliPath) {
        try {
          const { logToolAction } = await import("@carbonara/cli/dist/utils/tool-logger.js");
          await logToolAction({
            timestamp: new Date().toISOString(),
            toolId,
            action: 'error',
            command: `${cliPath} ${cliArgs.join(' ')}`,
            error: error.message,
            exitCode: 1,
          }, this.workspaceFolder.uri.fsPath);
        } catch (logError) {
          // Silently fail - logging is optional
          console.error(`[ToolsTreeProvider] Failed to log error:`, logError);
        }
      }
      
      // Check if tool has custom execution command - if so, always keep it marked as installed
      const hasCustomCommand = await this.hasCustomExecutionCommand(toolId);
      
      // Check if error suggests tool is not actually installed (false positive detection)
      const errorMessage = error.message || String(error);
      
      // Import isNotFoundError helper
      const { isNotFoundError } = await import("@carbonara/cli/dist/utils/config.js");
      const suggestsNotInstalled = isNotFoundError(error);
      
      // Check if error suggests missing plugin or configuration issue
      const suggestsPluginIssue = 
        errorMessage.includes('InputValidationError') ||
        errorMessage.includes('ValidationError') ||
        errorMessage.includes('is provided neither in config nor in input') ||
        (errorMessage.includes('plugin') && errorMessage.includes('not found'));
      
      // If tool was detected as installed but run failed with "not found" error,
      // flag that detection was incorrect (but only if no custom command is set)
      // Tools with custom commands should always stay marked as installed
      if (tool.isInstalled && suggestsNotInstalled && !hasCustomCommand && this.workspaceFolder) {
        try {
          await flagDetectionFailed(toolId, this.workspaceFolder.uri.fsPath, error);
        } catch (configError) {
          console.error(`[ToolsTreeProvider] Failed to flag detection failure:`, configError);
        }
      }
      
      // Record error in config
      if (this.workspaceFolder) {
        try {
          await recordToolError(toolId, error, this.workspaceFolder.uri.fsPath);
        } catch (configError) {
          console.error(`[ToolsTreeProvider] Failed to record tool error in config:`, configError);
        }
      }
      
      // Refresh tools to update status (show error state, detection failed flag, etc.)
      await this.refreshAsync();
      
      // Show error and offer help/support
      let displayMessage = `${UI_TEXT.NOTIFICATIONS.ANALYSIS_FAILED} ${error.message}`;
      if (tool.isInstalled && suggestsNotInstalled) {
        displayMessage += `\n⚠️ Detection was incorrect - tool is not actually installed.`;
      } else if (suggestsPluginIssue && tool.installation?.package) {
        const packages = tool.installation.package.split(' ').filter(p => p.trim());
        if (packages.length > 1) {
          displayMessage += `\n⚠️ Validation error detected. This may indicate a missing plugin.`;
          displayMessage += `\nPlease verify all required packages are installed: ${packages.join(', ')}`;
        }
      }
      
      const action = await vscode.window.showErrorMessage(
        displayMessage,
        "View Installation Instructions",
        "View Logs"
      );
      
      if (action === "View Installation Instructions") {
        const { showToolInstallationInstructions } = await import("./tool-installation-provider");
        await showToolInstallationInstructions(toolId);
      } else if (action === "View Logs") {
        // Open log file if it exists
        if (this.workspaceFolder) {
          try {
            const { getToolLogSummary } = await import("@carbonara/cli/dist/utils/tool-logger.js");
            const logSummary = await getToolLogSummary(toolId, this.workspaceFolder.uri.fsPath);
            
            // Show logs in output channel for now (could be improved to show in document)
            const outputChannel = vscode.window.createOutputChannel(`Carbonara Logs: ${tool.name}`);
            outputChannel.appendLine(logSummary);
            outputChannel.show();
          } catch (logError) {
            vscode.window.showErrorMessage(`Failed to open logs: ${logError}`);
          }
        }
      }
    }
  }

  private async loadWorkspaceTools(): Promise<boolean> {
    if (!this.workspaceFolder) {
      return false;
    }

    const workspaceToolsPath = path.join(
      this.workspaceFolder.uri.fsPath,
      "tools.json"
    );

    if (!fs.existsSync(workspaceToolsPath)) {
      return false;
    }

    try {
      const toolsData = JSON.parse(fs.readFileSync(workspaceToolsPath, "utf8"));

      this.tools = await Promise.all(
        toolsData.tools.map(async (tool: any) => {
          const isBuiltIn = tool.installation?.type === "built-in";
          const isInstalled = isBuiltIn
            ? true
            : await this.detectToolInstallation(tool);
          
          // Check prerequisites if tool is installed
          let prerequisitesMissing = false;
          if (isInstalled && tool.prerequisites && tool.prerequisites.length > 0) {
            prerequisitesMissing = !(await this.checkToolPrerequisites(tool));
          }
          
          // Load lastError from config
          const lastError = await this.loadLastError(tool.id);
          
          // Check for custom execution command
          const hasCustomCommand = await this.hasCustomExecutionCommand(tool.id);
          
          return {
            ...tool,
            type: isBuiltIn ? "built-in" : "external",
            command: tool.command?.executable || tool.command,
            vscodeCommand: tool.vscodeCommand,
            isInstalled,
            prerequisitesMissing,
            lastError,
            hasCustomExecutionCommand: hasCustomCommand,
          };
        })
      );

      return true;
    } catch (error) {
      console.error("❌ Failed to parse workspace tools.json:", error);
      return false;
    }
  }

  private async checkToolPrerequisites(tool: any): Promise<boolean> {
    if (!tool.prerequisites || tool.prerequisites.length === 0) {
      return true; // No prerequisites means all are met
    }

    try {
      const { checkPrerequisites } = await import("@carbonara/core");
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
      return result.allAvailable;
    } catch (error) {
      console.error(`Failed to check prerequisites for ${tool.id}:`, error);
      return false; // If we can't check, assume missing
    }
  }

  private async checkSinglePrerequisite(prereq: any): Promise<boolean> {
    try {
      const { checkPrerequisites } = await import("@carbonara/core");
      const prerequisites = [{
        type: prereq.type,
        name: prereq.name,
        checkCommand: prereq.checkCommand,
        expectedOutput: prereq.expectedOutput,
        errorMessage: prereq.errorMessage,
        installCommand: prereq.installCommand,
        setupInstructions: prereq.setupInstructions,
      }];

      const result = await checkPrerequisites(prerequisites);
      return result.allAvailable;
    } catch (error) {
      console.error(`Failed to check prerequisite ${prereq.name}:`, error);
      return false;
    }
  }


  private async detectToolInstallation(tool: any): Promise<boolean> {
    // Handle undefined or null tools
    if (!tool) {
      return false;
    }

    // If tool has a custom execution command, always consider it installed
    // (user manually configured it, so we trust their setup)
    const hasCustomCommand = await this.hasCustomExecutionCommand(tool.id);
    if (hasCustomCommand) {
      return true;
    }

    // Also check if tool is marked as installed in config (even if detection fails)
    if (this.workspaceFolder) {
      try {
        const { isToolMarkedInstalled } = await import("@carbonara/cli/dist/utils/config.js");
        const isMarkedInstalled = await isToolMarkedInstalled(tool.id, this.workspaceFolder.uri.fsPath);
        if (isMarkedInstalled) {
          return true;
        }
      } catch (configError) {
        // Silently fail - config check is optional
      }
    }

    // FIXME: We need to find a way to mock tools in E2E tests instead of skipping detection.
    // Currently, we skip detection for E2E tests to avoid timeouts and command execution issues,
    // but this means E2E tests can't verify tool installation status. A better approach would be
    // to mock the tool detection commands (e.g., mock `runCommand` or use a test registry with
    // pre-configured installation status) so E2E tests can verify the UI behavior with different
    // tool states (installed, not installed, prerequisites missing, etc.).
    // During E2E tests, skip actual detection to avoid timeouts and command execution issues
    // BUT allow unit tests that explicitly test detection to run (they mock runCommand)
    if (process.env.CARBONARA_E2E_TEST === "true") {
      // For E2E tests, force external tools to be "not installed" for predictable results
      // BUT allow local installations to be checked (they use npm list, not just command detection)
      if (
        tool.detection?.method === "command" &&
        tool.installation?.global !== false // Allow local installations (global: false) to be checked
      ) {
        return false;
      }
    }
    // Note: We don't skip detection for unit tests (NODE_ENV === "test") because
    // some unit tests explicitly test detection by mocking runCommand. Those tests
    // will fail if we skip detection entirely. Instead, we rely on test timeouts
    // and proper mocking to handle test scenarios.

    if (!tool.detection) {
      return false;
    }

    if (tool.detection.method !== "command") {
      return false;
    }

    // For pip tools, check venv first using tool's executable name
    if (tool.installation?.type === "pip" && tool.command?.executable && this.workspaceFolder) {
      try {
        const { getVenvBinaryPath, isBinaryInVenv, getVenvInfo } = await import("@carbonara/cli/dist/utils/venv-manager.js");
        const projectPath = this.workspaceFolder.uri.fsPath;
        const executable = tool.command.executable;
        
        // Check if binary exists in venv
        if (isBinaryInVenv(projectPath, executable)) {
          const venvBinaryPath = getVenvBinaryPath(projectPath, executable);
          const venvInfo = getVenvInfo(projectPath);
          
          // Get detection commands from tool config
          const detection = tool.detection as any;
          const commands: string[] = detection.commands || (detection.target ? [detection.target] : []);
          
          // Try each detection command with venv binary path
          for (const command of commands) {
            try {
              // Replace executable name with venv path in command
              const venvCommand = command.replace(new RegExp(`^${executable}\\b`), venvBinaryPath);
              await this.runCommand("sh", ["-c", venvCommand]);
              console.log(`[ToolsTreeProvider] Found ${executable} in venv at ${venvBinaryPath}`);
              return true; // Found in venv!
            } catch {
              // Try python -m approach if binary path didn't work
              try {
                if (venvInfo.exists) {
                  const pythonModuleCommand = command.replace(new RegExp(`^${executable}\\b`), `${venvInfo.pythonPath} -m ${executable}`);
                  await this.runCommand("sh", ["-c", pythonModuleCommand]);
                  console.log(`[ToolsTreeProvider] Found ${executable} as Python module in venv`);
                  return true; // Found as Python module in venv!
                }
              } catch {
                // Continue to next command or fall through
              }
            }
          }
        }
      } catch (venvError) {
        // Silently fail venv check and continue to regular detection
        console.log(`[ToolsTreeProvider] Venv check failed, continuing with regular detection:`, venvError);
      }
    }

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
        const output = await this.runCommand("sh", ["-c", command]);
        console.log(`[ToolsTreeProvider] Detection command "${command}" succeeded with output: ${output.substring(0, 100)}`);
        // Command succeeded - continue to next command
        // For npm list commands, also verify package is in output
        if (command.startsWith("npm list")) {
          const packageMatch = command.match(/npm list\s+([^\s|]+)/);
          const packageName = packageMatch ? packageMatch[1] : null;
          if (packageName && !output.includes(packageName) && !output.includes(packageName.split('/').pop() || '')) {
            // Package not found in output even though command succeeded
            failedCommands.push({
              command,
              error: "Package not found in npm list output"
            });
            continue;
          }
        }
      } catch (error: any) {
        // Check if it's a "command not found" error or directory doesn't exist
        const errorMessage = error.message || String(error);
        const isCommandNotFound = 
          error.exitCode === 127 ||
          errorMessage.includes("command not found") ||
          errorMessage.includes("Command not found") ||
          errorMessage.includes("ENOENT") ||
          errorMessage.includes("spawn") ||
          errorMessage.includes("uv_cwd");

        if (isCommandNotFound) {
          console.log(`[ToolsTreeProvider] Detection command "${command}" failed: command not found (${errorMessage})`);
          failedCommands.push({
            command,
            error: errorMessage || "Command not found"
          });
        } else {
          console.log(`[ToolsTreeProvider] Detection command "${command}" failed with non-command-not-found error: ${errorMessage}`);
          // For npm list commands, check if package is actually listed
          if (command.startsWith("npm list")) {
            // Extract package name from command (e.g., "npm list @tngtech/if-webpage-plugins")
            // Handle commands with || operator by checking the first package name
            const packageMatch = command.match(/npm list\s+([^\s|]+)/);
            const packageName = packageMatch ? packageMatch[1] : null;
            
            // Check if package is actually in the output (from error.stdout if available)
            const output = (error as any).stdout || (error as any).stderr || errorMessage || "";
            const hasPackage = packageName ? 
              (output.includes(packageName) || 
               output.includes(packageName.split('/').pop() || '') ||
               output.includes(packageName.replace('@', ''))) :
              false;
            
            const isEmpty = output.includes('(empty)') || 
                           output.includes('(no packages)');
            
            // If package is found in output, it's installed (even if exit code is non-zero)
            // Command with || operator: if package is found, it's installed
            if (!hasPackage && isEmpty) {
              failedCommands.push({
                command,
                error: "Package not found in npm list"
              });
            } else {
              // Package found in output - consider it installed even if exit code is non-zero
              // (this handles the || operator case where first command fails but second succeeds)
            }
          } else {
            // Other error - tool might be installed but command failed for other reasons
            // Consider this as a pass (tool exists, just had an error)
          }
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

      // Check if detection was previously flagged as failed (false positive)
      if (this.workspaceFolder) {
        try {
          const { loadProjectConfig } = await import("@carbonara/cli/dist/utils/config.js");
          const config = await loadProjectConfig(this.workspaceFolder.uri.fsPath);
          if (config?.tools?.[tool.id]?.detectionFailed) {
            // Detection was previously incorrect, don't trust it
            return false;
          }
        } catch {
          // Config check failed, continue
        }
      }

      // Check config flag as fallback
      if (this.workspaceFolder) {
        try {
          if (await isToolMarkedInstalled(tool.id, this.workspaceFolder.uri.fsPath)) {
            console.log(`✅ Tool ${tool.id} is marked as installed in config (installation succeeded)`);
            return true;
          }
        } catch (configError) {
          // Config check failed
          console.error(`Failed to check config for ${tool.id}:`, configError);
        }
      }
      return false;
    }

    // All commands passed
    console.log(`✅ Tool ${tool.id} all detection commands passed`);
    return true;
  }

  private async findCarbonaraCLI(): Promise<string | null> {
    // Check environment variable first
    const envPath = process.env.CARBONARA_CLI_PATH;
    if (envPath && fs.existsSync(envPath)) {
      return envPath;
    }

    // Check bundled CLI in extension (highest priority for installed extensions)
    // __dirname in the compiled extension points to dist/, so bundled CLI is at dist/node_modules/@carbonara/cli/dist/index.js
    const bundledCliPath = path.join(
      __dirname,
      "node_modules",
      "@carbonara",
      "cli",
      "dist",
      "index.js"
    );
    if (fs.existsSync(bundledCliPath)) {
      return bundledCliPath;
    }

    // Check if we're in the monorepo (for development)
    const workspaceRoot = this.workspaceFolder?.uri.fsPath;
    if (workspaceRoot) {
      const monorepoCliPath = path.join(
        workspaceRoot,
        "..",
        "..",
        "packages",
        "cli",
        "dist",
        "index.js"
      );
      if (fs.existsSync(monorepoCliPath)) {
        return monorepoCliPath;
      }
    }

    // Try global installation (fallback)
    try {
      await this.runCommand("carbonara", ["--version"]);
      return "carbonara";
    } catch {
      return null;
    }
  }

  private async runCarbonaraCommand(
    cliPath: string,
    args: string[]
  ): Promise<string> {
    if (cliPath.endsWith(".js")) {
      return this.runCommand("node", [cliPath, ...args]);
    } else {
      return this.runCommand(cliPath, args);
    }
  }

  private runCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      // Use a safe working directory - check if paths exist before using them
      let safeCwd: string | undefined = this.workspaceFolder?.uri.fsPath;
      
      // Check if workspace folder exists
      if (safeCwd) {
        try {
          fs.accessSync(safeCwd, fs.constants.F_OK);
        } catch {
          // Workspace folder doesn't exist, try process.cwd()
          safeCwd = undefined;
        }
      }
      
      // If no workspace folder or it doesn't exist, try process.cwd()
      if (!safeCwd) {
        try {
          const cwd = process.cwd();
          fs.accessSync(cwd, fs.constants.F_OK);
          safeCwd = cwd;
        } catch {
          // process.cwd() doesn't exist either, use a safe fallback
          safeCwd = os.homedir() || os.tmpdir();
        }
      }
      
      const childProcess = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
        cwd: safeCwd,
      });

      let stdout = "";
      let stderr = "";

      childProcess.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      childProcess.stderr?.on("data", (data) => {
        const errorText = data.toString();
        stderr += errorText;
        // Log stderr for debugging (CLI might output warnings/info to stderr)
        console.log(`[ToolsTreeProvider] CLI stderr:`, errorText);
        // Also append to stdout since CLI might use stderr for normal output
        stdout += errorText;
      });

      childProcess.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `Process exited with code ${code}`));
        }
      });

      childProcess.on("error", (error) => {
        reject(error);
      });
    });
  }

}
