"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolsTreeProvider = exports.ToolItem = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const ui_text_1 = require("./constants/ui-text");
class ToolItem extends vscode.TreeItem {
    constructor(tool, collapsibleState, command) {
        // Use displayName from tools.json if available, otherwise use name
        let displayName = tool.displayName || tool.name;
        super(displayName, collapsibleState);
        this.tool = tool;
        this.collapsibleState = collapsibleState;
        this.command = command;
        this.tooltip = tool.description;
        this.description =
            tool.type === "built-in"
                ? "Built-in"
                : tool.isInstalled
                    ? "Installed"
                    : "Not installed";
        // Set context value for different actions
        if (tool.type === "built-in") {
            this.contextValue = "builtin-tool";
        }
        else if (tool.isInstalled) {
            this.contextValue = "installed-tool";
        }
        else {
            this.contextValue = "uninstalled-tool";
        }
    }
}
exports.ToolItem = ToolItem;
class ToolsTreeProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.tools = [];
        this.workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        // Load tools asynchronously and handle errors
        this.loadTools().catch((error) => {
            console.error("🔧 Failed to load tools in constructor:", error);
            // Fire change event even if loading failed so UI shows the "no tools" message
            this._onDidChangeTreeData.fire();
        });
    }
    refresh() {
        this.loadTools(); // loadTools() already calls _onDidChangeTreeData.fire()
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        // Always show tools, even without workspace folder
        if (element) {
            // No children for individual tools
            return Promise.resolve([]);
        }
        else {
            // Return all tools grouped by status
            const items = this.createToolItems();
            return Promise.resolve(items);
        }
    }
    createToolItems() {
        const items = [];
        // If no tools are loaded, show a helpful message
        if (this.tools.length === 0) {
            const noToolsItem = new ToolItem({
                id: "no-tools",
                name: ui_text_1.UI_TEXT.TOOLS_TREE.NO_TOOLS,
                description: ui_text_1.UI_TEXT.TOOLS_TREE.NO_TOOLS_DESCRIPTION,
                type: "built-in",
                command: "",
                isInstalled: false,
            }, vscode.TreeItemCollapsibleState.None);
            noToolsItem.iconPath = new vscode.ThemeIcon("info");
            noToolsItem.contextValue = "no-tools";
            items.push(noToolsItem);
            return items;
        }
        // Group tools by status
        const installedTools = this.tools.filter((tool) => tool.type === "built-in" || tool.isInstalled);
        const uninstalledTools = this.tools.filter((tool) => tool.type === "external" && !tool.isInstalled);
        // Add installed tools
        installedTools.forEach((tool) => {
            const analyzeCommand = {
                command: "carbonara.analyzeTool",
                title: "Analyze with tool",
                arguments: [tool.id],
            };
            const item = new ToolItem(tool, vscode.TreeItemCollapsibleState.None, analyzeCommand);
            items.push(item);
        });
        // Add uninstalled tools
        uninstalledTools.forEach((tool) => {
            const installCommand = {
                command: "carbonara.installTool",
                title: "Install tool",
                arguments: [tool.id],
            };
            const item = new ToolItem(tool, vscode.TreeItemCollapsibleState.None, installCommand);
            items.push(item);
        });
        return items;
    }
    async loadTools() {
        try {
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
        }
        catch (error) {
            console.error("🔧 Failed to load tools:", error);
            this.tools = [];
            this._onDidChangeTreeData.fire();
        }
    }
    async loadBundledRegistry() {
        try {
            // Look for registry bundled with the extension
            // __dirname in the compiled extension points to dist/, and registry is at dist/registry/
            const bundledRegistryPath = path.join(__dirname, "registry", "tools.json");
            if (!fs.existsSync(bundledRegistryPath)) {
                return false;
            }
            const registryContent = fs.readFileSync(bundledRegistryPath, "utf8");
            const registry = JSON.parse(registryContent);
            // Transform and load tools
            this.tools = await Promise.all(registry.tools.map(async (tool) => {
                const isBuiltIn = tool.installation?.type === "built-in";
                const isInstalled = isBuiltIn
                    ? true
                    : await this.detectToolInstallation(tool);
                return {
                    id: tool.id,
                    name: tool.name,
                    displayName: tool.displayName,
                    description: tool.description,
                    type: isBuiltIn ? "built-in" : "external",
                    command: tool.command?.executable || tool.command,
                    vscodeCommand: tool.vscodeCommand,
                    installation: tool.installation ? {
                        type: tool.installation.type,
                        package: tool.installation.package,
                        global: tool.installation.global,
                        instructions: tool.installation.instructions,
                    } : undefined,
                    detection: tool.detection,
                    isInstalled,
                };
            }));
            return true;
        }
        catch (error) {
            console.error("❌ Failed to load bundled registry:", error);
            return false;
        }
    }
    async loadToolsFromRegistry(cliPath) {
        try {
            // Best practice: Use environment variable for registry path
            const registryPath = process.env.CARBONARA_REGISTRY_PATH ||
                path.join(path.dirname(cliPath), "registry", "tools.json");
            if (fs.existsSync(registryPath)) {
                const registryContent = fs.readFileSync(registryPath, "utf8");
                const registry = JSON.parse(registryContent);
                // Transform registry format to match our interface
                this.tools = registry.tools.map((tool) => ({
                    id: tool.id,
                    name: tool.name,
                    displayName: tool.displayName,
                    description: tool.description,
                    type: tool.installation?.type === "built-in" ? "built-in" : "external",
                    command: tool.command?.executable || tool.command,
                    vscodeCommand: tool.vscodeCommand,
                    installation: tool.installation ? {
                        type: tool.installation.type,
                        package: tool.installation.package,
                        global: tool.installation.global,
                        instructions: tool.installation.instructions,
                    } : undefined,
                    detection: tool.detection,
                    isInstalled: tool.installation?.type === "built-in" ? true : false,
                    prerequisites: tool.prerequisites,
                }));
                // Check installation status for external tools
                await this.checkToolInstallationStatus();
            }
            else {
                this.tools = [];
            }
        }
        catch (error) {
            console.error("❌ Failed to load tools registry:", error);
            this.tools = [];
        }
    }
    async checkToolInstallationStatus() {
        for (const tool of this.tools) {
            if (tool.type === "built-in") {
                tool.isInstalled = true;
            }
            else if (tool.detection) {
                tool.isInstalled = await this.checkExternalToolInstallation(tool);
            }
        }
    }
    async checkExternalToolInstallation(tool) {
        if (!tool.detection)
            return false;
        try {
            if (tool.detection.method === "command") {
                // Run the full detection target command, not just the first word
                const command = tool.detection.target;
                await this.runCommand("sh", ["-c", command]);
                return true;
            }
            // Add other detection methods as needed
            return false;
        }
        catch {
            return false;
        }
    }
    async installTool(toolId) {
        const tool = this.tools.find((t) => t.id === toolId);
        if (!tool || tool.type === "built-in") {
            vscode.window.showErrorMessage(`Tool ${toolId} not found or is built-in`);
            return;
        }
        if (!tool.installation) {
            vscode.window.showErrorMessage(`No installation instructions found for ${tool.name}`);
            return;
        }
        // Store installation config to avoid TypeScript issues
        const installation = tool.installation;
        if (!installation) {
            vscode.window.showErrorMessage(`No installation configuration found for ${tool.name}`);
            return;
        }
        try {
            // Show progress notification
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Installing ${tool.name}...`,
                cancellable: false,
            }, async (progress) => {
                progress.report({ increment: 0, message: "Starting installation..." });
                if (installation.type === "npm") {
                    // Split package string by spaces to handle multiple packages
                    const packages = installation.package.split(" ").filter(p => p.trim().length > 0);
                    const npmArgs = ["install"];
                    if (installation.global !== false) {
                        npmArgs.push("-g");
                    }
                    npmArgs.push(...packages);
                    progress.report({ increment: 30, message: `Installing packages: ${packages.join(", ")}` });
                    // Run npm install with better error handling
                    try {
                        await this.runCommand("npm", npmArgs);
                        progress.report({ increment: 100, message: "Installation complete!" });
                        vscode.window.showInformationMessage(`${tool.name} installed successfully!`);
                    }
                    catch (npmError) {
                        // Extract more detailed error information
                        const errorDetails = npmError.message || String(npmError);
                        throw new Error(`npm install failed: ${errorDetails}`);
                    }
                }
                else {
                    vscode.window.showInformationMessage(`Please install ${tool.name} manually: ${installation.instructions || "See documentation"}`);
                    return;
                }
                // Refresh to update installation status
                progress.report({ increment: 90, message: "Refreshing tool status..." });
                this.refresh();
            });
        }
        catch (error) {
            // Show detailed error with option to view instructions
            const errorMessage = error.message || String(error);
            console.error(`Installation error for ${tool.name}:`, error);
            const viewInstructions = "View Instructions";
            const result = await vscode.window.showErrorMessage(`Failed to install ${tool.name}: ${errorMessage}`, viewInstructions);
            if (result === viewInstructions) {
                vscode.commands.executeCommand("carbonara.viewToolInstructions", toolId);
            }
        }
    }
    getToolInstallationInstructionsMarkdown(toolId) {
        // Try to find the tool by ID
        let tool = this.tools.find((t) => t.id === toolId);
        // If not found, try loading tools synchronously (if possible) or return helpful error
        if (!tool) {
            console.log(`Tool not found: ${toolId}. Available tools: ${this.tools.map(t => t.id).join(', ')}`);
            return `# Installation Instructions\n\nTool "${toolId}" not found in registry.\n\nAvailable tools: ${this.tools.map(t => t.id).join(', ')}`;
        }
        if (!tool.installation) {
            return `# Installation Instructions\n\nNo installation instructions available for ${tool.name}.`;
        }
        let markdown = `# ${tool.name}\n\n`;
        if (tool.description) {
            markdown += `${tool.description}\n\n`;
        }
        markdown += `## Installation\n\n`;
        if (tool.installation.type === "npm") {
            const packages = tool.installation.package.split(" ").filter(p => p.trim().length > 0);
            markdown += `**Installation Type:** npm\n\n`;
            markdown += `**Packages:**\n`;
            packages.forEach(pkg => {
                markdown += `- \`${pkg}\`\n`;
            });
            markdown += `\n**Command:**\n\`\`\`bash\nnpm install -g ${packages.join(" ")}\n\`\`\`\n\n`;
        }
        else if (tool.installation.type === "pip") {
            markdown += `**Installation Type:** pip\n\n`;
            markdown += `**Command:**\n\`\`\`bash\npip install ${tool.installation.global ? "--user " : ""}${tool.installation.package}\n\`\`\`\n\n`;
        }
        else {
            markdown += `**Installation Type:** ${tool.installation.type}\n\n`;
        }
        if (tool.installation.instructions) {
            markdown += `## Manual Installation Instructions\n\n`;
            markdown += `${tool.installation.instructions}\n\n`;
        }
        if (tool.detection) {
            markdown += `## Detection\n\n`;
            markdown += `**Method:** ${tool.detection.method}\n\n`;
            if (tool.detection.target) {
                markdown += `**Detection Command:**\n\`\`\`bash\n${tool.detection.target}\n\`\`\`\n\n`;
            }
        }
        if (tool.prerequisites && tool.prerequisites.length > 0) {
            markdown += `## Prerequisites\n\n`;
            tool.prerequisites.forEach((prereq) => {
                markdown += `### ${prereq.name}\n\n`;
                markdown += `**Type:** ${prereq.type}\n\n`;
                if (prereq.setupInstructions) {
                    markdown += `**Setup:** ${prereq.setupInstructions}\n\n`;
                }
                markdown += `**Check Command:**\n\`\`\`bash\n${prereq.checkCommand}\n\`\`\`\n\n`;
            });
        }
        return markdown;
    }
    async analyzeTool(toolId) {
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
                if (option.flag.includes("--save") ||
                    option.flag.includes("--output")) {
                    continue;
                }
                let value = undefined;
                switch (option.type) {
                    case "boolean":
                        const booleanResult = await vscode.window.showQuickPick([
                            { label: "Yes", value: true },
                            { label: "No", value: false },
                        ], {
                            placeHolder: option.description,
                            ignoreFocusOut: true,
                        });
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
                    }
                    else if (option.type !== "boolean") {
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
                vscode.window.showErrorMessage(ui_text_1.UI_TEXT.NOTIFICATIONS.CLI_NOT_FOUND);
                return;
            }
            vscode.window.showInformationMessage(ui_text_1.UI_TEXT.NOTIFICATIONS.ANALYSIS_RUNNING(tool.name));
            const result = await this.runCarbonaraCommand(cliPath, cliArgs);
            vscode.window.showInformationMessage(ui_text_1.UI_TEXT.NOTIFICATIONS.ANALYSIS_COMPLETED(tool.name));
            // Refresh data tree to show new results
            vscode.commands.executeCommand("carbonara.refreshData");
        }
        catch (error) {
            const errorMessage = error.message || String(error);
            const errorOutput = error.stderr || error.stdout || '';
            const fullError = errorMessage + (errorOutput ? '\n' + errorOutput : '');
            // Check if error is related to missing prerequisites
            if (fullError.includes('Prerequisites not met') ||
                fullError.includes('Docker is required') ||
                fullError.includes('Cannot connect to the Docker daemon') ||
                fullError.includes('docker daemon')) {
                // Show error message with button to view instructions
                const action = await vscode.window.showErrorMessage(`${ui_text_1.UI_TEXT.NOTIFICATIONS.ANALYSIS_FAILED} Prerequisites not met for ${tool.name}`, 'View Installation Instructions');
                if (action === 'View Installation Instructions') {
                    // Use existing command to open installation instructions
                    await vscode.commands.executeCommand('carbonara.viewToolInstructions', tool.id);
                }
            }
            else {
                vscode.window.showErrorMessage(`${ui_text_1.UI_TEXT.NOTIFICATIONS.ANALYSIS_FAILED} ${errorMessage}`);
            }
        }
    }
    async loadWorkspaceTools() {
        if (!this.workspaceFolder) {
            return false;
        }
        const workspaceToolsPath = path.join(this.workspaceFolder.uri.fsPath, "tools.json");
        if (!fs.existsSync(workspaceToolsPath)) {
            return false;
        }
        try {
            const toolsData = JSON.parse(fs.readFileSync(workspaceToolsPath, "utf8"));
            this.tools = await Promise.all(toolsData.tools.map(async (tool) => {
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
            }));
            return true;
        }
        catch (error) {
            console.error("❌ Failed to parse workspace tools.json:", error);
            return false;
        }
    }
    async detectToolInstallation(tool) {
        // Handle undefined or null tools
        if (!tool) {
            return false;
        }
        // During E2E tests, force external tools to be "not installed" for predictable results
        if (process.env.CARBONARA_E2E_TEST === "true" &&
            tool.detection?.method === "command") {
            return false;
        }
        if (!tool.detection) {
            return false;
        }
        if (tool.detection.method !== "command") {
            return false;
        }
        if (!tool.detection.target) {
            throw new Error(`Tool ${tool.id} has no detection target command specified`);
        }
        try {
            // Run the detection command to see if tool is installed
            const command = tool.detection.target;
            await this.runCommand("sh", ["-c", command]);
            return true; // Command succeeded, tool is installed
        }
        catch (error) {
            console.error(`❌ Tool ${tool.id} is not installed (command failed): ${error}`);
            return false; // Command failed, tool is not installed
        }
    }
    async findCarbonaraCLI() {
        // Check environment variable first
        const envPath = process.env.CARBONARA_CLI_PATH;
        if (envPath && fs.existsSync(envPath)) {
            return envPath;
        }
        // Check if we're in the monorepo
        const workspaceRoot = this.workspaceFolder?.uri.fsPath;
        if (workspaceRoot) {
            const monorepoCliPath = path.join(workspaceRoot, "..", "..", "packages", "cli", "dist", "index.js");
            if (fs.existsSync(monorepoCliPath)) {
                return monorepoCliPath;
            }
        }
        // Try global installation
        try {
            await this.runCommand("carbonara", ["--version"]);
            return "carbonara";
        }
        catch {
            return null;
        }
    }
    async runCarbonaraCommand(cliPath, args) {
        if (cliPath.endsWith(".js")) {
            return this.runCommand("node", [cliPath, ...args]);
        }
        else {
            return this.runCommand(cliPath, args);
        }
    }
    runCommand(command, args, cwd) {
        return new Promise((resolve, reject) => {
            // Use workspace folder as cwd if available, otherwise use provided cwd or undefined
            const workingDir = cwd || this.workspaceFolder?.uri.fsPath;
            const process = (0, child_process_1.spawn)(command, args, {
                cwd: this.workspaceFolder?.uri.fsPath,
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
                }
                else {
                    reject(new Error(stderr || `Process exited with code ${code}`));
                }
            });
            process.on("error", (error) => {
                reject(error);
            });
        });
    }
}
exports.ToolsTreeProvider = ToolsTreeProvider;
//# sourceMappingURL=tools-tree-provider.js.map