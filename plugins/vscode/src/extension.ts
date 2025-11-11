/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2025 Carbonara team
 */

import * as vscode from "vscode";
import { UI_TEXT } from "./constants/ui-text";
import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";
import { AssessmentTreeProvider } from "./assessment-tree-provider";
import {
  DataTreeProvider,
  SemgrepFindingDecorationProvider,
} from "./data-tree-provider";
import { ToolsTreeProvider } from "./tools-tree-provider";
import { DeploymentsTreeProvider } from "./deployments-tree-provider";
import { WelcomeTreeProvider } from "./welcome-tree-provider";
import {
  initializeSemgrep,
  ensureDatabaseInitialized,
  runSemgrepOnFile,
  scanAllFiles,
  clearSemgrepResults,
  setOnDatabaseUpdateCallback,
} from "./semgrep-integration";

let carbonaraStatusBar: vscode.StatusBarItem;
let welcomeTreeProvider: WelcomeTreeProvider;
let assessmentTreeProvider: AssessmentTreeProvider;
let dataTreeProvider: DataTreeProvider;
let toolsTreeProvider: ToolsTreeProvider;
let deploymentsTreeProvider: DeploymentsTreeProvider;

// Virtual document provider for tool installation instructions
class ToolInstructionsProvider implements vscode.TextDocumentContentProvider {
  onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  onDidChange = this.onDidChangeEmitter.event;

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    // Extract toolId from URI path (format: /tool/{toolId}.md or /tool/{toolId})
    // Remove leading slash, extract tool ID, remove .md extension if present
    let toolId = uri.path;
    if (toolId.startsWith("/tool/")) {
      toolId = toolId.substring(6); // Remove "/tool/"
    } else if (toolId.startsWith("tool/")) {
      toolId = toolId.substring(5); // Remove "tool/"
    }
    // Remove .md extension if present
    if (toolId.endsWith(".md")) {
      toolId = toolId.substring(0, toolId.length - 3);
    }
    // Remove any remaining leading/trailing slashes
    toolId = toolId.replace(/^\/+|\/+$/g, "");
    
    console.log(`[ToolInstructionsProvider] Extracted toolId: "${toolId}" from URI path: "${uri.path}"`);
    
    if (!toolsTreeProvider) {
      return `# Installation Instructions\n\nTools provider not initialized.`;
    }
    
    // Get the markdown - the method will handle tool lookup
    // If tools aren't loaded yet, it will show a helpful message
    const markdown = toolsTreeProvider.getToolInstallationInstructionsMarkdown(toolId);
    
    // If tool wasn't found, try refreshing and waiting a bit
    if (markdown.includes("not found in registry")) {
      // Trigger a refresh (async, but we can't await it directly)
      toolsTreeProvider.refresh();
      
      // Wait a bit for tools to potentially load
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Try again
      return toolsTreeProvider.getToolInstallationInstructionsMarkdown(toolId);
    }
    
    return markdown;
  }
}

const toolInstructionsProvider = new ToolInstructionsProvider();

let currentProjectPath: string | null = null;

// Diagnostics collection for Semgrep results
let semgrepDiagnostics: vscode.DiagnosticCollection;

/**
 * Check if Carbonara CLI is installed globally
 */
async function isCarbonaraCLIInstalled(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const child = spawn("carbonara", ["--version"], {
      stdio: "pipe",
      shell: true,
    });

    let hasOutput = false;

    child.stdout?.on("data", () => {
      hasOutput = true;
    });

    child.on("close", (code) => {
      // If command exits with 0 or has output, CLI is installed
      resolve(code === 0 || hasOutput);
    });

    child.on("error", () => {
      // Command not found or other error
      resolve(false);
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      child.kill();
      resolve(false);
    }, 5000);
  });
}

/**
 * Find local CLI package in monorepo
 */
function findLocalCLIPackage(): string | null {
  // Try to find packages/cli relative to extension path
  // Extension is at plugins/vscode, so go up two levels to monorepo root
  const extensionPath = __dirname; // This will be dist/ in built extension
  // In development: plugins/vscode/src -> plugins/vscode -> monorepo root
  // In built: plugins/vscode/dist -> plugins/vscode -> monorepo root
  
  const possiblePaths: string[] = [
    path.join(extensionPath, "../../../packages/cli"), // From dist/
    path.join(extensionPath, "../../packages/cli"), // From src/
    path.join(process.cwd(), "packages/cli"), // From workspace root
  ];

  // Also check workspace folders (for when extension is installed as VSIX)
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders) {
    for (const folder of workspaceFolders) {
      const workspaceCliPath = path.join(folder.uri.fsPath, "packages/cli");
      possiblePaths.push(workspaceCliPath);
    }
  }

  for (const cliPath of possiblePaths) {
    const packageJsonPath = path.join(cliPath, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      console.log(`Found local CLI package at: ${cliPath}`);
      return cliPath;
    }
  }

  console.log("Local CLI package not found. Checked paths:", possiblePaths);
  return null;
}

/**
 * Automatically install Carbonara CLI if not found
 */
async function ensureCarbonaraCLIInstalled(): Promise<void> {
  const isInstalled = await isCarbonaraCLIInstalled();
  if (isInstalled) {
    console.log("Carbonara CLI is already installed");
    return;
  }

  console.log("Carbonara CLI not found, attempting to install...");

  // First, try to find local CLI package in monorepo
  const localCliPath = findLocalCLIPackage();
  if (localCliPath) {
    console.log("Found local CLI package, installing from monorepo...");
    await installCLIFromLocalPath(localCliPath);
    return;
  }

  console.log("Local CLI package not found in monorepo");

  // If not found locally, try npm (for when it's published)
  console.log("Local CLI not found, checking npm...");
  const packageExists = await checkPackageExistsOnNpm("@carbonara/cli");
  if (!packageExists) {
    console.log("@carbonara/cli is not published to npm and local package not found.");
    // Show a notification to the user
    vscode.window.showInformationMessage(
      "Carbonara CLI is not installed. To install it manually, run: npm install -g @carbonara/cli (or install from the monorepo: cd packages/cli && npm install -g .)",
      "OK"
    );
    return;
  }

  await installCLIFromNpm();
}

/**
 * Check if @carbonara/cli package exists on npm
 */
async function checkPackageExistsOnNpm(packageName: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const child = spawn("npm", ["view", packageName, "version"], {
      stdio: "pipe",
      shell: true,
    });

    child.on("close", (code) => {
      resolve(code === 0);
    });

    child.on("error", () => {
      resolve(false);
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      child.kill();
      resolve(false);
    }, 5000);
  });
}

/**
 * Install CLI from local monorepo path
 */
async function installCLIFromLocalPath(cliPath: string): Promise<void> {
  const installPromise = vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Installing Carbonara CLI from local package...",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0, message: "Building CLI package..." });
      
      // First, build the CLI package
      return new Promise<void>((resolve) => {
        const buildChild = spawn("npm", ["run", "build"], {
          cwd: cliPath,
          stdio: "pipe",
          shell: true,
        });

        let buildStdout = "";
        let buildStderr = "";

        buildChild.stdout?.on("data", (data) => {
          buildStdout += data.toString();
        });

        buildChild.stderr?.on("data", (data) => {
          buildStderr += data.toString();
        });

        buildChild.on("close", (buildCode) => {
          if (buildCode !== 0) {
            console.error(`CLI build failed: ${buildStderr || buildStdout}`);
            vscode.window.showWarningMessage(
              `Failed to build CLI package. Please build it manually: cd ${cliPath} && npm run build`,
              "OK"
            );
            resolve();
            return;
          }

          // Build succeeded, now install
          progress.report({ increment: 50, message: "Installing CLI globally..." });
          
          const installChild = spawn("npm", ["install", "-g", "."], {
            cwd: cliPath,
            stdio: "pipe",
            shell: true,
          });

          let installStdout = "";
          let installStderr = "";

          installChild.stdout?.on("data", (data) => {
            installStdout += data.toString();
          });

          installChild.stderr?.on("data", (data) => {
            installStderr += data.toString();
          });

          installChild.on("close", async (installCode) => {
            if (installCode === 0) {
              // Ensure the binary has execute permissions
              const binaryPath = path.join(cliPath, "dist/index.js");
              try {
                if (fs.existsSync(binaryPath)) {
                  fs.chmodSync(binaryPath, 0o755); // rwxr-xr-x
                  console.log(`Set execute permissions on ${binaryPath}`);
                }
              } catch (chmodError) {
                console.warn(`Failed to set execute permissions: ${chmodError}`);
                // Continue anyway - npm might have set it
              }

              // Reset CLI availability cache so it re-checks
              const { resetCLIAvailabilityCache } = await import("./semgrep-integration");
              resetCLIAvailabilityCache();

              progress.report({ increment: 100, message: "Installation complete!" });
              vscode.window.showInformationMessage(
                "Carbonara CLI installed successfully from local package!",
                "OK"
              );
            } else {
              const errorMessage = installStderr || installStdout || `npm install exited with code ${installCode ?? 'unknown'}`;
              console.error(`CLI installation failed: ${errorMessage}`);
              showInstallationError(installCode ?? 1, installStdout, installStderr);
            }
            resolve();
          });

          installChild.on("error", (error) => {
            console.error(`Failed to start npm install: ${error.message}`);
            vscode.window.showWarningMessage(
              `Failed to install Carbonara CLI: ${error.message}`,
              "OK"
            );
            resolve();
          });
        });

        buildChild.on("error", (error) => {
          console.error(`Failed to start npm build: ${error.message}`);
          vscode.window.showWarningMessage(
            `Failed to build CLI package: ${error.message}`,
            "OK"
          );
          resolve();
        });
      });
    }
  );

  Promise.resolve(installPromise).catch((error: any) => {
    console.error("Error during CLI installation:", error);
  });
}

/**
 * Show installation error details
 */
function showInstallationError(code: number, stdout: string, stderr: string): void {
  // Extract meaningful error message
  let errorMessage = "Unknown error";
  if (stderr) {
    const errorLines = stderr.split('\n').filter(line => 
      line.includes('error') || 
      line.includes('Error') || 
      line.includes('EACCES') ||
      line.includes('permission') ||
      line.includes('ENOENT')
    );
    if (errorLines.length > 0) {
      errorMessage = errorLines[0].trim();
    } else {
      errorMessage = stderr.split('\n').find(line => line.trim().length > 0) || stderr.substring(0, 200);
    }
  } else if (stdout) {
    errorMessage = stdout.split('\n').find(line => line.includes('error') || line.includes('Error')) || stdout.substring(0, 200);
  } else {
    errorMessage = `npm install exited with code ${code}`;
  }
  
  // Check if it's a 404 error (package not found)
  if (stderr.includes('404') || stderr.includes('Not found') || stderr.includes('is not in this registry')) {
    errorMessage = "@carbonara/cli is not published to npm. Install it locally from the monorepo.";
  }
  
  // Always create and show output channel with error details
  const outputChannel = vscode.window.createOutputChannel("Carbonara CLI Installation");
  outputChannel.appendLine("Carbonara CLI Installation Failed");
  outputChannel.appendLine("=".repeat(50));
  outputChannel.appendLine(`Exit code: ${code}`);
  outputChannel.appendLine("\nSTDOUT:");
  outputChannel.appendLine(stdout || "(empty)");
  outputChannel.appendLine("\nSTDERR:");
  outputChannel.appendLine(stderr || "(empty)");
  outputChannel.appendLine("\nTo install manually:");
  if (stderr.includes('404') || stderr.includes('Not found') || stderr.includes('is not in this registry')) {
    outputChannel.appendLine("The package is not published to npm. Install it locally:");
    outputChannel.appendLine("  cd packages/cli && npm install -g .");
    outputChannel.appendLine("Or build and install from the monorepo root:");
    outputChannel.appendLine("  npm run build && cd packages/cli && npm install -g .");
  } else {
    outputChannel.appendLine("npm install -g @carbonara/cli");
  }
  outputChannel.show();
  
  vscode.window.showWarningMessage(
    `Carbonara CLI installation failed: ${errorMessage.substring(0, 100)}${errorMessage.length > 100 ? '...' : ''}`,
    "OK"
  );
}

/**
 * Install CLI from npm
 */
async function installCLIFromNpm(): Promise<void> {
  // Show a notification that we're installing
  const installPromise = vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Installing Carbonara CLI...",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0, message: "Installing @carbonara/cli globally..." });
      
      return new Promise<void>((resolve, reject) => {
        const child = spawn("npm", ["install", "-g", "@carbonara/cli"], {
          stdio: "pipe",
        });

        let stdout = "";
        let stderr = "";

        child.stdout?.on("data", (data) => {
          stdout += data.toString();
        });

        child.stderr?.on("data", (data) => {
          stderr += data.toString();
        });

        child.on("close", async (code) => {
          if (code === 0) {
            // Reset CLI availability cache so it re-checks
            const { resetCLIAvailabilityCache } = await import("./semgrep-integration");
            resetCLIAvailabilityCache();

            progress.report({ increment: 100, message: "Installation complete!" });
            vscode.window.showInformationMessage(
              "Carbonara CLI installed successfully!",
              "OK"
            );
            resolve();
          } else {
            // Log full output for debugging
            console.error(`CLI installation failed with exit code ${code ?? 'unknown'}`);
            console.error(`stdout: ${stdout}`);
            console.error(`stderr: ${stderr}`);
            
            // Use shared error handler
            showInstallationError(code ?? 1, stdout, stderr);
            
            // Don't reject - we'll continue without CLI
            resolve();
          }
        });

        child.on("error", (error) => {
          console.error(`Failed to start npm install: ${error.message}`);
          console.error(`Error details:`, error);
          
          let errorMsg = error.message;
          if (error.message.includes('ENOENT') || error.message.includes('spawn')) {
            errorMsg = "npm command not found. Please ensure Node.js and npm are installed and in your PATH.";
          } else if (error.message.includes('EACCES') || error.message.includes('permission')) {
            errorMsg = "Permission denied. You may need to run with sudo or fix npm permissions.";
          }
          
          vscode.window.showWarningMessage(
            `Failed to install Carbonara CLI: ${errorMsg}. Please install it manually with: npm install -g @carbonara/cli`,
            "OK"
          );
          // Don't reject - we'll continue without CLI
          resolve();
        });
      });
    }
  );

  // Don't await - let it run in background so extension activation isn't blocked
  // withProgress returns a Thenable, so we need to handle it differently
  Promise.resolve(installPromise).catch((error: any) => {
    console.error("Error during CLI installation:", error);
  });
}

export async function activate(context: vscode.ExtensionContext) {
  console.log("Carbonara extension is now active!");

  // Initialize context variable for Welcome view visibility
  vscode.commands.executeCommand(
    "setContext",
    "carbonara.notInitialized",
    true
  );

  // Check and install CLI automatically (non-blocking)
  ensureCarbonaraCLIInstalled().catch((error) => {
    console.error("Error checking/installing CLI:", error);
  });

  // Initialize Semgrep integration (now async)
  await initializeSemgrep(context);

  // Create status bar item
  carbonaraStatusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  carbonaraStatusBar.text = UI_TEXT.STATUS_BAR.TEXT;
  carbonaraStatusBar.tooltip = UI_TEXT.STATUS_BAR.TOOLTIP;
  // Make it uniquely selectable in tests and accessible UIs
  carbonaraStatusBar.accessibilityInformation = {
    label: UI_TEXT.STATUS_BAR.ARIA_LABEL,
  };
  carbonaraStatusBar.command = "carbonara.showMenu";
  carbonaraStatusBar.show();

  // Create and register tree views
  welcomeTreeProvider = new WelcomeTreeProvider();
  assessmentTreeProvider = new AssessmentTreeProvider();
  dataTreeProvider = new DataTreeProvider();
  console.log("🔧 Creating ToolsTreeProvider...");
  toolsTreeProvider = new ToolsTreeProvider();
  console.log("🔧 Creating DeploymentsTreeProvider...");
  deploymentsTreeProvider = new DeploymentsTreeProvider();
  console.log("🔧 Registering tree data providers...");
  vscode.window.registerTreeDataProvider(
    "carbonara.welcomeTree",
    welcomeTreeProvider
  );
  vscode.window.registerTreeDataProvider(
    "carbonara.assessmentTree",
    assessmentTreeProvider
  );
  vscode.window.registerTreeDataProvider(
    "carbonara.dataTree",
    dataTreeProvider
  );
  vscode.window.registerTreeDataProvider(
    "carbonara.toolsTree",
    toolsTreeProvider
  );
  vscode.window.registerTreeDataProvider(
    "carbonara.deploymentsTree",
    deploymentsTreeProvider
  );
  console.log("✅ All tree providers registered");

  // Register decoration provider for Semgrep findings
  const semgrepDecorationProvider = new SemgrepFindingDecorationProvider();
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(semgrepDecorationProvider)
  );
  console.log("✅ Semgrep decoration provider registered");

  // Set up Semgrep to refresh Data & Results when database updates
  setOnDatabaseUpdateCallback(() => {
    dataTreeProvider.refresh();
  });

  // Register virtual document provider for tool instructions
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      "carbonara-tool-instructions",
      toolInstructionsProvider
    )
  );

  // Register commands
  const commands = [
    vscode.commands.registerCommand("carbonara.showMenu", showCarbonaraMenu),
    vscode.commands.registerCommand("carbonara.initProject", initProject),
    vscode.commands.registerCommand("carbonara.runAssessment", runAssessment),
    vscode.commands.registerCommand("carbonara.analyzeWebsite", analyzeWebsite),
    vscode.commands.registerCommand("carbonara.viewData", viewData),
    vscode.commands.registerCommand("carbonara.showStatus", showStatus),
    vscode.commands.registerCommand("carbonara.openConfig", openConfig),
    vscode.commands.registerCommand("carbonara.editSection", (sectionId) =>
      assessmentTreeProvider.editSection(sectionId)
    ),
    vscode.commands.registerCommand("carbonara.completeAssessment", () =>
      assessmentTreeProvider.completeAssessment()
    ),
    vscode.commands.registerCommand("carbonara.refreshAssessment", () =>
      assessmentTreeProvider.refresh()
    ),
    vscode.commands.registerCommand("carbonara.refreshData", () =>
      dataTreeProvider.refresh()
    ),
    vscode.commands.registerCommand("carbonara.exportDataJson", () =>
      dataTreeProvider.exportData("json")
    ),
    vscode.commands.registerCommand("carbonara.exportDataCsv", () =>
      dataTreeProvider.exportData("csv")
    ),
    vscode.commands.registerCommand("carbonara.clearAllData", () =>
      dataTreeProvider.clearData()
    ),
    vscode.commands.registerCommand(
      "carbonara.openProject",
      openCarbonaraProject
    ),
    vscode.commands.registerCommand("carbonara.installCli", installCli),
    vscode.commands.registerCommand("carbonara.viewTools", viewTools),
    vscode.commands.registerCommand("carbonara.refreshTools", () =>
      toolsTreeProvider.refresh()
    ),
    vscode.commands.registerCommand("carbonara.installTool", (toolIdOrItem: string | any) => {
      // Handle both direct toolId string and tree item (ToolItem)
      let toolId: string;
      if (typeof toolIdOrItem === "string") {
        toolId = toolIdOrItem;
      } else if (toolIdOrItem && typeof toolIdOrItem === "object") {
        // Try to get toolId from ToolItem
        if (toolIdOrItem.tool && toolIdOrItem.tool.id) {
          toolId = toolIdOrItem.tool.id;
        } else if (toolIdOrItem.id) {
          toolId = toolIdOrItem.id;
        } else {
          vscode.window.showErrorMessage("Unable to determine tool ID from selection");
          return;
        }
      } else {
        vscode.window.showErrorMessage("Unable to determine tool ID");
        return;
      }
      toolsTreeProvider.installTool(toolId);
    }),
    vscode.commands.registerCommand("carbonara.analyzeTool", (toolId) =>
      toolsTreeProvider.analyzeTool(toolId)
    ),
    vscode.commands.registerCommand("carbonara.viewToolInstructions", async (toolIdOrItem: string | any) => {
      // Handle both direct toolId string and tree item (ToolItem)
      let toolId: string;
      if (typeof toolIdOrItem === "string") {
        toolId = toolIdOrItem;
      } else if (toolIdOrItem && typeof toolIdOrItem === "object") {
        // Try to get toolId from ToolItem
        if (toolIdOrItem.tool && toolIdOrItem.tool.id) {
          toolId = toolIdOrItem.tool.id;
        } else if (toolIdOrItem.id) {
          toolId = toolIdOrItem.id;
        } else {
          vscode.window.showErrorMessage("Unable to determine tool ID from selection");
          return;
        }
      } else {
        vscode.window.showErrorMessage("Unable to determine tool ID");
        return;
      }
      
      const uri = vscode.Uri.parse(`carbonara-tool-instructions://tool/${toolId}.md`);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { 
        preview: false,
        viewColumn: vscode.ViewColumn.Beside
      });
    }),
    vscode.commands.registerCommand("carbonara.runSemgrep", runSemgrepOnFile),
    vscode.commands.registerCommand("carbonara.scanAllFiles", scanAllFiles),
    vscode.commands.registerCommand(
      "carbonara.clearSemgrepResults",
      clearSemgrepResults
    ),
    vscode.commands.registerCommand(
      "carbonara.openSemgrepFile",
      openSemgrepFile
    ),
    vscode.commands.registerCommand(
      "carbonara.openSemgrepFinding",
      openSemgrepFinding
    ),
    vscode.commands.registerCommand(
      "carbonara.deleteSemgrepResultsForFile",
      (item: any, items: any[]) => {
        // If multiple items selected, items will be an array
        // Otherwise, single item selection
        const selectedItems = items && items.length > 0 ? items : [item];
        dataTreeProvider.deleteSemgrepResultsForFiles(selectedItems);
      }
    ),
    vscode.commands.registerCommand("carbonara.scanDeployments", () =>
      deploymentsTreeProvider.scanForDeployments()
    ),
    vscode.commands.registerCommand("carbonara.refreshDeployments", () =>
      deploymentsTreeProvider.scanForDeployments()
    ),
    vscode.commands.registerCommand(
      "carbonara.showDeploymentDetails",
      (deployment) => deploymentsTreeProvider.showDeploymentDetails(deployment)
    ),
    vscode.commands.registerCommand(
      "carbonara.openDeploymentConfig",
      (deployment) => deploymentsTreeProvider.openDeploymentConfig(deployment)
    ),
  ];

  context.subscriptions.push(carbonaraStatusBar, ...commands);

  // Watch for project config changes and refresh views/status accordingly
  const watcher = vscode.workspace.createFileSystemWatcher(
    "**/.carbonara/carbonara.config.json"
  );
  watcher.onDidCreate(async () => {
    // Config was created - initialize Carbonara database
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      try {
        await ensureDatabaseInitialized(workspaceFolder.uri.fsPath);
      } catch (error) {
        console.error(
          "Failed to initialize Carbonara database after config creation:",
          error
        );
      }
    }
    welcomeTreeProvider.refresh();
    assessmentTreeProvider.refresh();
    dataTreeProvider.refresh();
    toolsTreeProvider.refresh();
    checkProjectStatus();
  });
  watcher.onDidChange(() => {
    welcomeTreeProvider.refresh();
    assessmentTreeProvider.refresh();
    dataTreeProvider.refresh();
    toolsTreeProvider.refresh();
    checkProjectStatus();
  });
  watcher.onDidDelete(() => {
    welcomeTreeProvider.refresh();
    assessmentTreeProvider.refresh();
    dataTreeProvider.refresh();
    toolsTreeProvider.refresh();
    checkProjectStatus();
  });
  context.subscriptions.push(watcher);

  // Check if project is already initialized
  checkProjectStatus();
}

export function deactivate() {
  if (carbonaraStatusBar) {
    carbonaraStatusBar.dispose();
  }
}

async function showCarbonaraMenu() {
  const items = [
    {
      label: UI_TEXT.MENU.ITEMS.OPEN_PROJECT.LABEL,
      description: UI_TEXT.MENU.ITEMS.OPEN_PROJECT.DESCRIPTION,
      command: "carbonara.openProject",
    },
    {
      label: UI_TEXT.MENU.ITEMS.INITIALIZE_PROJECT.LABEL,
      description: UI_TEXT.MENU.ITEMS.INITIALIZE_PROJECT.DESCRIPTION,
      command: "carbonara.initProject",
    },
    {
      label: UI_TEXT.MENU.ITEMS.RUN_ASSESSMENT.LABEL,
      description: UI_TEXT.MENU.ITEMS.RUN_ASSESSMENT.DESCRIPTION,
      command: "carbonara.runAssessment",
    },
    {
      label: UI_TEXT.MENU.ITEMS.ANALYZE_WEBSITE.LABEL,
      description: UI_TEXT.MENU.ITEMS.ANALYZE_WEBSITE.DESCRIPTION,
      command: "carbonara.analyzeWebsite",
    },
    {
      label: UI_TEXT.MENU.ITEMS.VIEW_DATA.LABEL,
      description: UI_TEXT.MENU.ITEMS.VIEW_DATA.DESCRIPTION,
      command: "carbonara.viewData",
    },
    {
      label: UI_TEXT.MENU.ITEMS.MANAGE_TOOLS.LABEL,
      description: UI_TEXT.MENU.ITEMS.MANAGE_TOOLS.DESCRIPTION,
      command: "carbonara.viewTools",
    },

    {
      label: UI_TEXT.MENU.ITEMS.OPEN_CONFIG.LABEL,
      description: UI_TEXT.MENU.ITEMS.OPEN_CONFIG.DESCRIPTION,
      command: "carbonara.openConfig",
    },
    {
      label: UI_TEXT.MENU.ITEMS.SHOW_STATUS.LABEL,
      description: UI_TEXT.MENU.ITEMS.SHOW_STATUS.DESCRIPTION,
      command: "carbonara.showStatus",
    },
  ];

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: UI_TEXT.MENU.PLACEHOLDER,
  });

  if (selected) {
    vscode.commands.executeCommand(selected.command);
  }
}

async function initProject() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("Please open a workspace folder first");
    return;
  }

  const projectName = await vscode.window.showInputBox({
    prompt: UI_TEXT.PROJECT_INIT.NAME_PROMPT,
    value: path.basename(workspaceFolder.uri.fsPath),
  });

  if (!projectName) {
    return;
  }

  const projectType = await vscode.window.showQuickPick(
    [
      { label: "Web Application", value: "web" },
      { label: "Mobile Application", value: "mobile" },
      { label: "Desktop Application", value: "desktop" },
      { label: "API/Backend Service", value: "api" },
      { label: "Other", value: "other" },
    ],
    { placeHolder: "Select project type" }
  );

  if (!projectType) {
    return;
  }

  const projectPath = getCurrentProjectPath();

  // Create project structure
  await ensureLocalCarbonaraProject(
    projectPath,
    projectName,
    projectType.value
  );

  // Initialize Carbonara database now that project is created
  try {
    await ensureDatabaseInitialized(projectPath);
  } catch (error) {
    console.error(
      "Failed to initialize Carbonara database after project creation:",
      error
    );
  }

  // Ensure UI reflects the new project
  welcomeTreeProvider.refresh();
  assessmentTreeProvider.refresh();
  dataTreeProvider.refresh();
  toolsTreeProvider.refresh();
  checkProjectStatus();

  vscode.window.showInformationMessage(
    "Carbonara project initialized successfully!"
  );
}

async function runAssessment() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("Please open a workspace folder first");
    return;
  }

  // Check if project is initialized
  const projectPath = getCurrentProjectPath();
  const configPath = path.join(
    projectPath,
    ".carbonara",
    "carbonara.config.json"
  );
  if (!fs.existsSync(configPath)) {
    const answer = await vscode.window.showInformationMessage(
      "Project not initialized. Initialize now?",
      "Yes",
      "No"
    );
    if (answer === "Yes") {
      await initProject();
    }
    return;
  }

  // Show the assessment tree and focus on first incomplete section
  vscode.commands.executeCommand("carbonara.assessmentTree.focus");

  // Find first incomplete section and edit it
  const status = assessmentTreeProvider.getCompletionStatus();
  if (status.completed < status.total) {
    // Start with the first section
    const incompleteSectionIds = [
      "project-info",
      "infrastructure",
      "development",
      "features",
      "sustainability",
    ];
    for (const sectionId of incompleteSectionIds) {
      // This will open the editing flow for the first incomplete section
      assessmentTreeProvider.editSection(sectionId);
      break;
    }
  } else {
    vscode.window.showInformationMessage(
      "All assessment sections completed! Use sidebar to review or complete assessment."
    );
  }
}

async function analyzeWebsite() {
  // Dummy implementation for database branch - doesn't require greenframe CLI
  const url = await vscode.window.showInputBox({
    prompt: UI_TEXT.WEBSITE_ANALYSIS.URL_PROMPT,
    placeHolder: UI_TEXT.WEBSITE_ANALYSIS.URL_PLACEHOLDER,
  });

  if (!url) {
    return;
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    vscode.window.showErrorMessage("Please enter a valid URL");
    return;
  }

  // Show dummy analysis results instead of calling CLI
  const dummyResults = {
    url: url,
    co2Score: Math.floor(Math.random() * 100),
    loadTime: (Math.random() * 3 + 1).toFixed(2),
    timestamp: new Date().toISOString(),
  };

  vscode.window.showInformationMessage(
    `🌍 Website Analysis (Demo)\n` +
      `URL: ${dummyResults.url}\n` +
      `CO2 Score: ${dummyResults.co2Score}/100\n` +
      `Load Time: ${dummyResults.loadTime}s\n` +
      `Analyzed at: ${new Date().toLocaleString()}`,
    { modal: false }
  );

  console.log("🎭 Dummy website analysis completed:", dummyResults);
}

async function viewData() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("Please open a workspace folder first");
    return;
  }

  vscode.commands.executeCommand("carbonara.dataTree.focus");
}

async function viewTools() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("Please open a workspace folder first");
    return;
  }

  vscode.commands.executeCommand("carbonara.toolsTree.focus");
}

async function showStatus() {
  const projectPath = getCurrentProjectPath();
  const configPath = path.join(
    projectPath,
    ".carbonara",
    "carbonara.config.json"
  );
  if (!fs.existsSync(configPath)) {
    vscode.window.showInformationMessage(
      "No Carbonara project detected. Initialize one from the status bar or sidebar."
    );
    return;
  }

  vscode.window.showInformationMessage("Carbonara project detected and ready.");
}

async function openConfig() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("Please open a workspace folder first");
    return;
  }

  const projectPath = getCurrentProjectPath();
  const configPath = path.join(
    projectPath,
    ".carbonara",
    "carbonara.config.json"
  );

  if (fs.existsSync(configPath)) {
    const doc = await vscode.workspace.openTextDocument(configPath);
    vscode.window.showTextDocument(doc);
  } else {
    const answer = await vscode.window.showInformationMessage(
      "Configuration file not found. Initialize project first?",
      "Initialize",
      "Cancel"
    );
    if (answer === "Initialize") {
      await initProject();
    }
  }
}

async function openCarbonaraProject() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  if (!workspaceFolder) {
    vscode.window.showErrorMessage("Please open a workspace folder first");
    return;
  }

  // First check if current workspace already has a Carbonara project
  const projectPath = getCurrentProjectPath();
  const configPath = path.join(
    projectPath,
    ".carbonara",
    "carbonara.config.json"
  );
  if (fs.existsSync(configPath)) {
    try {
      const configContent = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(configContent);
      vscode.window.showInformationMessage(
        `✅ Current workspace is already a Carbonara project: ${config.name}`
      );
      checkProjectStatus();
      return;
    } catch (error) {
      vscode.window.showWarningMessage(
        "Found .carbonara/carbonara.config.json but it appears to be invalid"
      );
    }
  }

  // Show options for setting up Carbonara in current workspace
  const action = await vscode.window.showQuickPick(
    [
      {
        label: UI_TEXT.PROJECT_OPEN.OPTIONS.INITIALIZE.LABEL,
        value: "init",
        description: UI_TEXT.PROJECT_OPEN.OPTIONS.INITIALIZE.DESCRIPTION,
      },
      {
        label: UI_TEXT.PROJECT_OPEN.OPTIONS.SEARCH.LABEL,
        value: "search",
        description: UI_TEXT.PROJECT_OPEN.OPTIONS.SEARCH.DESCRIPTION,
      },
      {
        label: UI_TEXT.PROJECT_OPEN.OPTIONS.BROWSE.LABEL,
        value: "browse",
        description: UI_TEXT.PROJECT_OPEN.OPTIONS.BROWSE.DESCRIPTION,
      },
    ],
    {
      placeHolder: UI_TEXT.PROJECT_OPEN.PLACEHOLDER,
    }
  );

  if (!action) {
    return;
  }

  switch (action.value) {
    case "init":
      await initProject();
      break;
    case "search":
      await searchWorkspaceForProjects();
      break;
    case "browse":
      await browseForConfig();
      break;
  }
}

async function browseForConfig() {
  const fileUri = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: "Open Carbonara Config",
    filters: {
      "Carbonara Config": ["json"],
      "All Files": ["*"],
    },
    title: "Select .carbonara/carbonara.config.json file",
  });

  if (fileUri && fileUri[0]) {
    const configPath = fileUri[0].fsPath;

    // Verify it's a carbonara config
    try {
      const configContent = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(configContent);

      if (config.name && config.projectId && config.database) {
        const projectDir = path.dirname(configPath);

        // Open the project folder as workspace
        const folderUri = vscode.Uri.file(projectDir);
        vscode.commands.executeCommand("vscode.openFolder", folderUri);

        vscode.window.showInformationMessage(
          `Opening Carbonara project: ${config.name}`
        );
      } else {
        vscode.window.showErrorMessage(
          "Selected file is not a valid .carbonara/carbonara.config.json"
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage("Failed to read config file: " + error);
    }
  }
}

async function searchWorkspaceForProjects() {
  if (!vscode.workspace.workspaceFolders) {
    vscode.window.showErrorMessage("No workspace folder open");
    return;
  }

  // Search for all carbonara.config.json files
  const configs = await vscode.workspace.findFiles(
    "**/.carbonara/carbonara.config.json",
    "**/node_modules/**"
  );

  if (configs.length === 0) {
    vscode.window.showInformationMessage(
      "No Carbonara projects found in current workspace"
    );
    return;
  }

  // Parse configs and show selection
  const projectOptions: Array<{
    label: string;
    description: string;
    path: string;
    config: any;
  }> = [];

  for (const configUri of configs) {
    try {
      const configContent = fs.readFileSync(configUri.fsPath, "utf-8");
      const config = JSON.parse(configContent);

      const relativePath = vscode.workspace.asRelativePath(configUri);
      const projectDir = path.dirname(relativePath);

      projectOptions.push({
        label: `🌱 ${config.name || "Unnamed Project"}`,
        description: `${projectDir} - ${config.projectType || "Unknown type"}`,
        path: path.dirname(configUri.fsPath),
        config: config,
      });
    } catch (error) {
      console.error(`Failed to parse config at ${configUri.fsPath}:`, error);
    }
  }

  if (projectOptions.length === 0) {
    vscode.window.showInformationMessage("No valid Carbonara projects found");
    return;
  }

  const selected = await vscode.window.showQuickPick(projectOptions, {
    placeHolder: "Select a Carbonara project to use in this workspace",
  });

  if (selected) {
    // Set the working directory for the extension to the selected project
    setCurrentCarbonaraProject(selected.path);
    vscode.window.showInformationMessage(
      `✅ Using Carbonara project: ${selected.config.name} (${path.dirname(vscode.workspace.asRelativePath(selected.path))})`
    );

    // Refresh the tree views with the new project
    checkProjectStatus();
    welcomeTreeProvider.refresh();
    assessmentTreeProvider.refresh();
    dataTreeProvider.refresh();
    toolsTreeProvider.refresh();
  }
}

async function openProjectFolder() {
  const folderUri = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Open Carbonara Project",
    title: "Select folder containing a Carbonara project",
  });

  if (folderUri && folderUri[0]) {
    const projectPath = folderUri[0].fsPath;
    const configPath = path.join(
      projectPath,
      ".carbonara",
      "carbonara.config.json"
    );

    if (fs.existsSync(configPath)) {
      try {
        const configContent = fs.readFileSync(configPath, "utf-8");
        const config = JSON.parse(configContent);

        vscode.commands.executeCommand("vscode.openFolder", folderUri[0]);
        vscode.window.showInformationMessage(
          `Opening Carbonara project: ${config.name || "Unnamed Project"}`
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          "Invalid .carbonara/carbonara.config.json in selected folder"
        );
      }
    } else {
      const answer = await vscode.window.showInformationMessage(
        "No .carbonara/carbonara.config.json found in selected folder. Initialize a new Carbonara project here?",
        "Initialize",
        "Cancel"
      );
      if (answer === "Initialize") {
        vscode.commands.executeCommand("vscode.openFolder", folderUri[0]);
        // Wait a bit for folder to open, then initialize
        setTimeout(() => {
          vscode.commands.executeCommand("carbonara.initProject");
        }, 1000);
      }
    }
  }
}

function setCurrentCarbonaraProject(projectPath: string) {
  currentProjectPath = projectPath;
}

function getCurrentProjectPath(): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return process.cwd();
  }

  return workspaceFolder.uri.fsPath;
}

async function ensureLocalCarbonaraProject(
  projectPath: string,
  projectName: string,
  projectType: string
): Promise<void> {
  try {
    // Ensure .carbonara directory exists first
    const carbonaraDir = path.join(projectPath, ".carbonara");
    if (!fs.existsSync(carbonaraDir)) {
      fs.mkdirSync(carbonaraDir, { recursive: true });
    }

    // Now create the config file
    const configPath = path.join(carbonaraDir, "carbonara.config.json");
    if (!fs.existsSync(configPath)) {
      const minimalConfig = {
        name: projectName,
        description: `${projectName} - Carbonara project`,
        type: projectType,
        version: 1,
        createdAt: new Date().toISOString(),
      };
      fs.writeFileSync(
        configPath,
        JSON.stringify(minimalConfig, null, 2),
        "utf-8"
      );
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to initialize local Carbonara project: ${(error as Error).message}`
    );
  }
}

async function installCli(): Promise<void> {
  // Offer to install the global CLI (optional - for advanced users)
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Installing Carbonara CLI globally...",
    },
    async () => {
      return new Promise<void>((resolve) => {
        const child = spawn("npm", ["i", "-g", "@carbonara/cli"], {
          stdio: "ignore",
        });
        child.on("close", () => {
          vscode.window.showInformationMessage(
            "Carbonara CLI installation finished."
          );
          resolve();
        });
        child.on("error", () => {
          vscode.window.showErrorMessage(
            "Failed to start npm. Please install @carbonara/cli manually."
          );
          resolve();
        });
      });
    }
  );
}

function checkProjectStatus() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    carbonaraStatusBar.text = "$(pulse) Carbonara";
    carbonaraStatusBar.tooltip = "Open a workspace to use Carbonara";
    vscode.commands.executeCommand(
      "setContext",
      "carbonara.notInitialized",
      false
    );
    return;
  }

  const projectPath = getCurrentProjectPath();
  const configPath = path.join(
    projectPath,
    ".carbonara",
    "carbonara.config.json"
  );

  if (fs.existsSync(configPath)) {
    carbonaraStatusBar.text = "$(check) Carbonara";
    carbonaraStatusBar.tooltip = "Carbonara project initialized";
    // Set context: Carbonara IS initialized
    vscode.commands.executeCommand(
      "setContext",
      "carbonara.notInitialized",
      false
    );
    // Make sure views show project data state
    welcomeTreeProvider.refresh();
    assessmentTreeProvider.refresh();
    dataTreeProvider.refresh();
    toolsTreeProvider.refresh();
  } else {
    carbonaraStatusBar.text = "$(pulse) Carbonara";
    carbonaraStatusBar.tooltip = "Click to initialize Carbonara project";
    // Set context: Carbonara is NOT initialized
    vscode.commands.executeCommand(
      "setContext",
      "carbonara.notInitialized",
      true
    );
    welcomeTreeProvider.refresh();
    assessmentTreeProvider.refresh();
    dataTreeProvider.refresh();
    toolsTreeProvider.refresh();
  }
}

async function openSemgrepFile(filePath: string) {
  try {
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to open file: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function openSemgrepFinding(
  filePath: string,
  line: number,
  column: number
) {
  try {
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);

    // Jump to the specific line and column
    const position = new vscode.Position(line - 1, Math.max(0, column - 1));
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenter
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to open finding: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
