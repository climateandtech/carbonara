import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";
import { UI_TEXT } from "./constants/ui-text";
import { ProjectDetector, ProjectInfo } from "./detection/project-detector.js";

export interface AnalysisTool {
  id: string;
  name: string;
  description: string;
  type: "external" | "built-in";
  command: string;
  vscodeCommand?: string;
  installation?: {
    type: "npm" | "pip" | "binary";
    package: string;
    instructions?: string;
  };
  detection?: {
    method: "command" | "npm" | "file" | "built-in";
    target: string;
  };
  options?: Array<{
    flag: string;
    description: string;
    type: "boolean" | "string" | "number";
    default?: any;
  }>;
  isInstalled?: boolean;
}

export class ToolItem extends vscode.TreeItem {
  constructor(
    public readonly tool: AnalysisTool,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super(tool.name, collapsibleState);

    this.tooltip = tool.description;
    this.description =
      tool.type === "built-in"
        ? "Built-in"
        : tool.isInstalled
          ? "Installed"
          : "Not installed";

    // Set icon based on installation status
    if (tool.type === "built-in") {
      this.iconPath = new vscode.ThemeIcon(
        "check",
        new vscode.ThemeColor("charts.green")
      );
    } else if (tool.isInstalled) {
      this.iconPath = new vscode.ThemeIcon(
        "check",
        new vscode.ThemeColor("charts.green")
      );
    } else {
      this.iconPath = new vscode.ThemeIcon(
        "circle-outline",
        new vscode.ThemeColor("charts.orange")
      );
    }

    // Set context value for different actions
    if (tool.type === "built-in") {
      this.contextValue = "builtin-tool";
    } else if (tool.isInstalled) {
      this.contextValue = "installed-tool";
    } else {
      this.contextValue = "uninstalled-tool";
    }
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
private projectInfo: ProjectInfo | null = null;
private projectDetector: ProjectDetector = new ProjectDetector();

constructor() {
    console.log('🔧 ToolsTreeProvider constructor called');
    this.workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    // Load tools and detect project asynchronously
    this.loadTools().catch(error => {
        console.error('🔧 Failed to load tools in constructor:', error);
        // Fire change event even if loading failed so UI shows the "no tools" message
        this._onDidChangeTreeData.fire();
    });
    this.detectProject().catch(error => {
        console.error('🔧 Failed to detect project in constructor:', error);
    });
}

refresh(): void {
    this.loadTools(); // loadTools() already calls _onDidChangeTreeData.fire()
    this.detectProject(); // Also refresh project detection
}

  private async detectProject(): Promise<void> {
    try {
      this.projectInfo = await this.projectDetector.detectProject();
      console.log("🔍 Project detected:", this.projectInfo);
      // Refresh tools to apply filtering
      this._onDidChangeTreeData.fire();
    } catch (error) {
      console.error("❌ Failed to detect project:", error);
    }
  }

  getTreeItem(element: ToolItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ToolItem): Thenable<ToolItem[]> {
    console.log(
      `🔍 getChildren called, tools count: ${this.tools.length}, workspaceFolder: ${this.workspaceFolder?.name}`
    );

    // Always show tools, even without workspace folder
    if (element) {
      // No children for individual tools
      return Promise.resolve([]);
    } else {
      // Filter tools based on project detection
      const filteredTools = this.filterToolsByProject();
      const items = this.createToolItems(filteredTools);
      console.log(
        `📊 Created ${items.length} tool items (filtered from ${this.tools.length} total)`
      );
      return Promise.resolve(items);
    }
  }

  private createToolItems(tools: AnalysisTool[] = this.tools): ToolItem[] {
    const items: ToolItem[] = [];

    // If no tools are loaded, show a helpful message
    if (tools.length === 0) {
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
    const installedTools = tools.filter(
      (tool) => tool.type === "built-in" || tool.isInstalled
    );
    const uninstalledTools = tools.filter(
      (tool) => tool.type === "external" && !tool.isInstalled
    );

    // Add installed tools
    installedTools.forEach((tool) => {
      const analyzeCommand = {
        command: "carbonara.analyzeTool",
        title: "Analyze with tool",
        arguments: [tool.id],
      };
      const item = new ToolItem(
        tool,
        vscode.TreeItemCollapsibleState.None,
        analyzeCommand
      );

      // Add compatibility indicator
      if (this.projectInfo) {
        const isCompatible = this.isToolCompatibleWithProject(tool);
        if (isCompatible) {
          item.description = `${tool.description} ✓ Compatible`;
        } else {
          item.description = `${tool.description} ⚠ Not compatible with ${this.projectInfo.primaryLanguage}`;
        }
      }

      items.push(item);
    });

    // Add uninstalled tools
    uninstalledTools.forEach((tool) => {
      const installCommand = {
        command: "carbonara.installTool",
        title: "Install tool",
        arguments: [tool.id],
      };
      const item = new ToolItem(
        tool,
        vscode.TreeItemCollapsibleState.None,
        installCommand
      );
      items.push(item);
    });

    return items;
  }

  private isToolCompatibleWithProject(tool: AnalysisTool): boolean {
    if (!this.projectInfo) {
      return true; // No project info, assume compatible
    }

    // Built-in tools are always compatible
    if (tool.type === "built-in") {
      return true;
    }

    // Check if tool supports any of the project languages
    const supportedLanguages = this.getToolSupportedLanguages(tool);
    return supportedLanguages.some((lang) =>
      this.projectInfo!.supportedLanguages.includes(lang)
    );
  }

  private async loadTools(): Promise<void> {
    console.log("🔧 ToolsTreeProvider.loadTools() called");
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
        console.log("✅ Loaded tools from workspace");
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
        console.log("🔧 CLI found at:", cliPath);
        await this.loadToolsFromRegistry(cliPath);
        this._onDidChangeTreeData.fire();
        return;
      }

      // Last resort: show "no tools available" message
      console.log("🔧 No CLI found, showing no tools message");
      this.tools = [];
      this._onDidChangeTreeData.fire();
    } catch (error: any) {
      console.error("🔧 Failed to load tools:", error);
      this.tools = [];
      this._onDidChangeTreeData.fire();
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
          return {
            id: tool.id,
            name: tool.name,
            description: tool.description,
            type: isBuiltIn ? "built-in" : "external",
            command: tool.command?.executable || tool.command,
            vscodeCommand: tool.vscodeCommand,
            installation: tool.installation,
            detection: tool.detection,
            isInstalled,
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
          return {
            id: tool.id,
            name: tool.name,
            description: tool.description,
            type: isBuiltIn ? "built-in" : "external",
            command: tool.command?.executable || tool.command,
            vscodeCommand: tool.vscodeCommand,
            installation: tool.installation,
            detection: tool.detection,
            isInstalled,
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
      console.log(`🔧 Loading tools from registry`);

      // Best practice: Use environment variable for registry path
      const registryPath =
        process.env.CARBONARA_REGISTRY_PATH ||
        path.join(path.dirname(cliPath), "registry", "tools.json");

      if (fs.existsSync(registryPath)) {
        const registryContent = fs.readFileSync(registryPath, "utf8");
        const registry = JSON.parse(registryContent);

        // Transform registry format to match our interface
        this.tools = registry.tools.map((tool: any) => ({
          id: tool.id,
          name: tool.name,
          description: tool.description,
          type:
            tool.installation?.type === "built-in" ? "built-in" : "external",
          command: tool.command?.executable || tool.command,
          vscodeCommand: tool.vscodeCommand,
          installation: tool.installation,
          detection: tool.detection,
          isInstalled: tool.installation?.type === "built-in" ? true : false,
        }));

        // Check installation status for external tools
        await this.checkToolInstallationStatus();
        console.log(`✅ Loaded ${this.tools.length} tools from registry`);
      } else {
        console.log(`❌ Tools registry not found at: ${registryPath}`);
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
        const command = tool.detection.target.split(" ")[0];
        await this.runCommand(command, ["--version"]);
        return true;
      }
      // Add other detection methods as needed
      return false;
    } catch {
      return false;
    }
  }

  private filterToolsByProject(): AnalysisTool[] {
    if (!this.projectInfo) {
      // No project info available, show all tools
      return this.tools;
    }

    return this.tools.filter((tool) => {
      // Built-in tools are always compatible
      if (tool.type === "built-in") {
        return true;
      }

      // Check if tool supports any of the project languages
      const supportedLanguages = this.getToolSupportedLanguages(tool);
      const hasLanguageSupport = supportedLanguages.some((lang) =>
        this.projectInfo!.supportedLanguages.includes(lang)
      );

      return hasLanguageSupport;
    });
  }

  private getToolSupportedLanguages(tool: AnalysisTool): string[] {
    // Map tool IDs to supported languages
    const toolLanguageMap: Record<string, string[]> = {
      semgrep: [
        "javascript",
        "typescript",
        "python",
        "java",
        "csharp",
        "go",
        "php",
        "ruby",
      ],
      eslint: ["javascript", "typescript"],
      pylint: ["python"],
      checkstyle: ["java"],
      sonarqube: [
        "javascript",
        "typescript",
        "java",
        "csharp",
        "python",
        "php",
        "go",
      ],
      "ecocode-java": ["java"],
      "ecocode-csharp": ["csharp"],
      "ecocode-python": ["python"],
      "ecocode-php": ["php"],
      "ecocode-javascript": ["javascript", "typescript"],
    };

    return toolLanguageMap[tool.id] || [];
  }

  public async installTool(toolId: string): Promise<void> {
    const tool = this.tools.find((t) => t.id === toolId);
    if (!tool || tool.type === "built-in") {
      return;
    }

    if (!tool.installation) {
      vscode.window.showErrorMessage(
        `No installation instructions found for ${tool.name}`
      );
      return;
    }

    try {
      vscode.window.showInformationMessage(`Installing ${tool.name}...`);

      if (tool.installation.type === "npm") {
        await this.runCommand("npm", [
          "install",
          "-g",
          tool.installation.package,
        ]);
        vscode.window.showInformationMessage(
          `${tool.name} installed successfully!`
        );
      } else {
        vscode.window.showInformationMessage(
          `Please install ${tool.name} manually: ${tool.installation.instructions || "See documentation"}`
        );
      }

      // Refresh to update installation status
      this.refresh();
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to install ${tool.name}: ${error.message}`
      );
    }
  }

  public async analyzeTool(toolId: string): Promise<void> {
    const tool = this.tools.find((t) => t.id === toolId);
    if (!tool) {
      return;
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

    // Collect tool options if available
    const cliArgs = ["analyze", tool.id, url, "--save"];

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
      const cliPath = await this.findCarbonaraCLI();
      if (!cliPath) {
        vscode.window.showErrorMessage(UI_TEXT.NOTIFICATIONS.CLI_NOT_FOUND);
        return;
      }

      vscode.window.showInformationMessage(
        UI_TEXT.NOTIFICATIONS.ANALYSIS_RUNNING(tool.name)
      );

      const result = await this.runCarbonaraCommand(cliPath, cliArgs);

      vscode.window.showInformationMessage(
        UI_TEXT.NOTIFICATIONS.ANALYSIS_COMPLETED(tool.name)
      );

      // Refresh data tree to show new results
      vscode.commands.executeCommand("carbonara.refreshData");
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `${UI_TEXT.NOTIFICATIONS.ANALYSIS_FAILED} ${error.message}`
      );
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
          return {
            ...tool,
            type: isBuiltIn ? "built-in" : "external",
            command: tool.command?.executable || tool.command,
            vscodeCommand: tool.vscodeCommand,
            isInstalled,
          };
        })
      );

      return true;
    } catch (error) {
      console.error("❌ Failed to parse workspace tools.json:", error);
      return false;
    }
  }

  private async detectToolInstallation(tool: any): Promise<boolean> {
    // Handle undefined or null tools
    if (!tool) {
      return false;
    }

    // During E2E tests, force external tools to be "not installed" for predictable results
    if (
      process.env.CARBONARA_E2E_TEST === "true" &&
      tool.detection?.method === "command"
    ) {
      return false;
    }

    if (!tool.detection) {
      return false;
    }

    if (tool.detection.method !== "command") {
      return false;
    }

    if (!tool.detection.target) {
      throw new Error(
        `Tool ${tool.id} has no detection target command specified`
      );
    }

    try {
      // Run the detection command to see if tool is installed
      const command = tool.detection.target;
      await this.runCommand("sh", ["-c", command]);
      return true; // Command succeeded, tool is installed
    } catch (error) {
      console.error(
        `❌ Tool ${tool.id} is not installed (command failed): ${error}`
      );
      return false; // Command failed, tool is not installed
    }
  }

  private async findCarbonaraCLI(): Promise<string | null> {
    // Check environment variable first
    const envPath = process.env.CARBONARA_CLI_PATH;
    if (envPath && fs.existsSync(envPath)) {
      return envPath;
    }

    // Check if we're in the monorepo
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

    // Try global installation
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
      const process = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
      });

      let stdout = "";
      let stderr = "";

      process.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      process.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `Process exited with code ${code}`));
        }
      });

      process.on("error", (error) => {
        reject(error);
      });
    });
  }
}
