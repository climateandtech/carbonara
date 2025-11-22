import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { Prerequisite, checkPrerequisites } from "@carbonara/core";

/**
 * Virtual document provider for tool installation instructions
 */
export class ToolInstallationProvider implements vscode.TextDocumentContentProvider {
  static readonly SCHEME = "carbonara-tool-installation";

  provideTextDocumentContent(
    uri: vscode.Uri,
    token: vscode.CancellationToken
  ): string | Thenable<string> {
    // URI format: carbonara-tool-installation://toolId
    // The authority part contains the toolId
    const toolId = uri.authority || uri.path.replace(/^\//, '') || uri.toString().replace(`${ToolInstallationProvider.SCHEME}://`, '');
    
    if (!toolId) {
      return `# Error\n\nNo tool ID provided in URI: ${uri.toString()}`;
    }
    
    return this.generateInstallationDocument(toolId);
  }

  private async generateInstallationDocument(toolId: string): Promise<string> {
    try {
      // Load tool from registry file (same approach as tools-tree-provider)
      const tool = await this.loadToolFromRegistry(toolId);

      if (!tool) {
        return `# Tool Not Found\n\nTool with ID "${toolId}" was not found in the registry.`;
      }

      const lines: string[] = [];
      
      // Header
      lines.push(`# Installation Instructions: ${tool.name || tool.id}`);
      lines.push("");
      
      if (tool.description) {
        lines.push(tool.description);
        lines.push("");
      }

      // Check prerequisites
      let prerequisitesMissing: Array<{ prerequisite: Prerequisite; error: string }> = [];
      if (tool.prerequisites && tool.prerequisites.length > 0) {
        const prerequisites: Prerequisite[] = tool.prerequisites.map((p: any) => ({
          type: p.type,
          name: p.name,
          checkCommand: p.checkCommand,
          expectedOutput: p.expectedOutput,
          errorMessage: p.errorMessage,
          setupInstructions: p.setupInstructions
        }));

        const prereqCheck = await checkPrerequisites(prerequisites);
        prerequisitesMissing = prereqCheck.missing;
        
        lines.push("## Prerequisites");
        lines.push("");
        
        if (prereqCheck.allAvailable) {
          lines.push("✅ All prerequisites are met.");
        } else {
          lines.push("⚠️ **The following prerequisites are missing:**");
          lines.push("");
          prereqCheck.missing.forEach(({ prerequisite, error }) => {
            lines.push(`### ${prerequisite.name}`);
            lines.push("");
            lines.push(`**Status:** ❌ Missing`);
            lines.push("");
            lines.push(`**Error:** ${error}`);
            lines.push("");
            if (prerequisite.setupInstructions) {
              lines.push(`**Setup Instructions:**`);
              lines.push("");
              lines.push(prerequisite.setupInstructions);
              lines.push("");
            }
          });
        }
        lines.push("");
      }

      // Installation instructions
      lines.push("## Installation");
      lines.push("");

      if (tool.installation) {
        if (tool.installation.type === "npm") {
          lines.push("This tool can be installed via npm:");
          lines.push("");
          lines.push("```bash");
          if (tool.installation.global) {
            lines.push(`npm install -g ${tool.installation.package}`);
          } else {
            lines.push(`npm install ${tool.installation.package}`);
          }
          lines.push("```");
          lines.push("");
        } else if (tool.installation.type === "pip") {
          lines.push("This tool can be installed via pip:");
          lines.push("");
          lines.push("```bash");
          lines.push(`pip install ${tool.installation.package}`);
          lines.push("```");
          lines.push("");
        } else if (tool.installation.type === "built-in") {
          lines.push("This is a built-in tool and does not require installation.");
          lines.push("");
        } else {
          lines.push("**Installation instructions:**");
          lines.push("");
          if (tool.installation.instructions) {
            lines.push(tool.installation.instructions);
          } else {
            lines.push("Please refer to the tool's documentation for installation instructions.");
          }
          lines.push("");
        }
      } else {
        lines.push("No installation instructions available for this tool.");
        lines.push("");
      }

      // Detection
      if (tool.detection) {
        lines.push("## Verification");
        lines.push("");
        lines.push("After installation, verify the tool is available:");
        lines.push("");
        lines.push("```bash");
        lines.push(tool.detection.target);
        lines.push("```");
        lines.push("");
      }

      // Next steps
      lines.push("## Next Steps");
      lines.push("");
      if (prerequisitesMissing.length > 0) {
        lines.push("1. **Install missing prerequisites** (see Prerequisites section above)");
        lines.push("2. Install the tool using the instructions above");
        lines.push("3. Verify installation using the verification command");
        lines.push("4. Refresh the tools tree to see the updated status");
      } else {
        lines.push("1. Install the tool using the instructions above");
        lines.push("2. Verify installation using the verification command");
        lines.push("3. Refresh the tools tree to see the updated status");
      }
      lines.push("");

      return lines.join("\n");
    } catch (error: any) {
      return `# Error\n\nFailed to generate installation instructions: ${error.message}`;
    }
  }

  private async loadToolFromRegistry(toolId: string): Promise<any> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    // Use the same loading order as tools-tree-provider
    // 1. Check CARBONARA_REGISTRY_PATH environment variable
    if (process.env.CARBONARA_REGISTRY_PATH) {
      const tool = await this.loadToolFromPath(process.env.CARBONARA_REGISTRY_PATH, toolId);
      if (tool) return tool;
    }

    // 2. Try workspace tools.json
    if (workspaceFolder) {
      const workspaceToolsPath = path.join(workspaceFolder.uri.fsPath, "tools.json");
      if (fs.existsSync(workspaceToolsPath)) {
        const tool = await this.loadToolFromPath(workspaceToolsPath, toolId);
        if (tool) return tool;
      }
    }

    // 3. Try bundled registry (for packaged extension)
    const bundledRegistryPath = path.join(__dirname, "registry", "tools.json");
    if (fs.existsSync(bundledRegistryPath)) {
      const tool = await this.loadToolFromPath(bundledRegistryPath, toolId);
      if (tool) return tool;
    }

    // 4. Try CLI registry (for development in monorepo)
    const cliPath = await this.findCarbonaraCLI();
    if (cliPath) {
      const registryPath = process.env.CARBONARA_REGISTRY_PATH ||
        path.join(path.dirname(cliPath), "registry", "tools.json");
      
      if (fs.existsSync(registryPath)) {
        const tool = await this.loadToolFromPath(registryPath, toolId);
        if (tool) return tool;
      }
    }

    return null;
  }

  private async loadToolFromPath(registryPath: string, toolId: string): Promise<any> {
    try {
      const registryContent = fs.readFileSync(registryPath, "utf8");
      const registry = JSON.parse(registryContent);
      const tool = registry.tools.find((t: any) => t.id === toolId);
      return tool || null;
    } catch (error) {
      console.error(`Failed to load registry from ${registryPath}:`, error);
      return null;
    }
  }

  private async findCarbonaraCLI(): Promise<string | null> {
    // Check environment variable first
    const envPath = process.env.CARBONARA_CLI_PATH;
    if (envPath && fs.existsSync(envPath)) {
      return envPath;
    }

    // Check if we're in the monorepo
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const monorepoCliPath = path.join(
        workspaceFolder.uri.fsPath,
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
      const execa = (await import("execa")).default;
      await execa("carbonara", ["--version"], { timeout: 3000 });
      return "carbonara";
    } catch {
      return null;
    }
  }
}

/**
 * Open installation instructions for a tool in a virtual document
 */
export async function showToolInstallationInstructions(toolId: string): Promise<void> {
  // Create URI with toolId as authority (host) part for better compatibility
  const uri = vscode.Uri.parse(`${ToolInstallationProvider.SCHEME}://${toolId}`);
  
  try {
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.Active,
      preview: false
    });
  } catch (error: any) {
    vscode.window.showErrorMessage(
      `Failed to open installation instructions: ${error.message}`
    );
  }
}

