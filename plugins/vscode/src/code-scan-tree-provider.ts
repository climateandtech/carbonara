import * as vscode from "vscode";
import * as path from "path";
import { getSemgrepDataService } from "./semgrep-integration";

export class CodeScanTreeProvider implements vscode.TreeDataProvider<CodeScanItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    CodeScanItem | undefined | null | void
  > = new vscode.EventEmitter<CodeScanItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    CodeScanItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private workspaceFolder: vscode.WorkspaceFolder | undefined;

  constructor() {
    this.workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  }

  async refresh(): Promise<void> {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CodeScanItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: CodeScanItem): Promise<CodeScanItem[]> {
    if (!this.workspaceFolder) {
      return [
        new CodeScanItem(
          "No workspace folder",
          "",
          vscode.TreeItemCollapsibleState.None,
          "info"
        ),
      ];
    }

    const semgrepDataService = getSemgrepDataService();
    if (!semgrepDataService) {
      return [
        new CodeScanItem(
          "Semgrep not initialized",
          "Open a file to start scanning",
          vscode.TreeItemCollapsibleState.None,
          "info"
        ),
      ];
    }

    if (element) {
      // If it's a file, return its individual findings
      if (element.type === "file" && element.results) {
        return element.results.map((result: any, index: number) => {
          return new CodeScanItem(
            result.rule_id,
            `Line ${result.start_line}`,
            vscode.TreeItemCollapsibleState.None,
            "finding",
            element.filePath,
            undefined,
            undefined,
            result
          );
        });
      }
      // Otherwise return folder children
      return element.children || [];
    }

    // Load root items
    try {
      const semgrepResults = await semgrepDataService.getAllSemgrepResults();

      if (semgrepResults.length === 0) {
        return [
          new CodeScanItem(
            "No scan results",
            "Save a file to trigger scanning",
            vscode.TreeItemCollapsibleState.None,
            "info"
          ),
        ];
      }

      // Group by file
      const resultsByFile = new Map<string, typeof semgrepResults>();
      semgrepResults.forEach(result => {
        if (!resultsByFile.has(result.file_path)) {
          resultsByFile.set(result.file_path, []);
        }
        resultsByFile.get(result.file_path)!.push(result);
      });

      // Build folder tree
      const projectPath = this.workspaceFolder.uri.fsPath;
      return this.buildFolderTree(resultsByFile, projectPath);
    } catch (error) {
      console.error("Error loading Semgrep results:", error);
      return [
        new CodeScanItem(
          "Error loading results",
          error instanceof Error ? error.message : "Unknown error",
          vscode.TreeItemCollapsibleState.None,
          "error"
        ),
      ];
    }
  }

  private buildFolderTree(
    resultsByFile: Map<string, any[]>,
    projectPath: string
  ): CodeScanItem[] {
    // Build a tree structure from file paths
    interface TreeNode {
      name: string;
      fullPath: string;
      children: Map<string, TreeNode>;
      results?: any[];
    }

    const root: TreeNode = {
      name: '',
      fullPath: '',
      children: new Map(),
    };

    // Build the tree
    resultsByFile.forEach((results, filePath) => {
      const parts = filePath.split('/');
      let currentNode = root;

      // Navigate/create folders
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!currentNode.children.has(part)) {
          currentNode.children.set(part, {
            name: part,
            fullPath: parts.slice(0, i + 1).join('/'),
            children: new Map(),
          });
        }
        currentNode = currentNode.children.get(part)!;
      }

      // Add file
      const fileName = parts[parts.length - 1];
      currentNode.children.set(fileName, {
        name: fileName,
        fullPath: filePath,
        children: new Map(),
        results,
      });
    });

    // Convert tree to CodeScanItems
    const convertNode = (node: TreeNode): CodeScanItem | null => {
      // Skip root
      if (node.name === '') {
        const children: CodeScanItem[] = [];
        const sortedChildren = Array.from(node.children.values()).sort((a, b) => {
          const aIsFolder = !a.results;
          const bIsFolder = !b.results;
          if (aIsFolder && !bIsFolder) return -1;
          if (!aIsFolder && bIsFolder) return 1;
          return a.name.localeCompare(b.name);
        });

        sortedChildren.forEach(child => {
          const item = convertNode(child);
          if (item) children.push(item);
        });

        return new CodeScanItem(
          "root",
          "",
          vscode.TreeItemCollapsibleState.Expanded,
          "info",
          undefined,
          children
        );
      }

      if (node.results) {
        // This is a file
        const absolutePath = path.isAbsolute(node.fullPath)
          ? node.fullPath
          : path.join(projectPath, node.fullPath);

        return new CodeScanItem(
          node.name,
          `${node.results.length} findings`,
          vscode.TreeItemCollapsibleState.Collapsed,
          "file",
          absolutePath,
          undefined,
          node.results
        );
      } else {
        // This is a folder
        const children: CodeScanItem[] = [];
        const sortedChildren = Array.from(node.children.values()).sort((a, b) => {
          const aIsFolder = !a.results;
          const bIsFolder = !b.results;
          if (aIsFolder && !bIsFolder) return -1;
          if (!aIsFolder && bIsFolder) return 1;
          return a.name.localeCompare(b.name);
        });

        sortedChildren.forEach(child => {
          const item = convertNode(child);
          if (item && item.label !== 'root') children.push(item);
        });

        const totalFindings = this.countFindingsInFolder(node);
        return new CodeScanItem(
          node.name,
          `${totalFindings} findings`,
          vscode.TreeItemCollapsibleState.Collapsed,
          "folder",
          undefined,
          children
        );
      }
    };

    const rootItem = convertNode(root);
    return rootItem?.children || [];
  }

  private countFindingsInFolder(node: any): number {
    let count = 0;
    if (node.results) {
      count += node.results.length;
    }
    node.children.forEach((child: any) => {
      count += this.countFindingsInFolder(child);
    });
    return count;
  }

  async deleteSemgrepResultsForFiles(items: CodeScanItem[]): Promise<void> {
    const semgrepDataService = getSemgrepDataService();
    if (!semgrepDataService) {
      vscode.window.showErrorMessage("Semgrep database service not available");
      return;
    }

    // Extract file paths from selected items
    const filePaths = items
      .filter(item => item.type === "file" && item.label)
      .map(item => {
        // Convert back to relative path by extracting from absolute path
        if (item.filePath && this.workspaceFolder) {
          return vscode.workspace.asRelativePath(item.filePath, false);
        }
        return item.label;
      });

    if (filePaths.length === 0) {
      vscode.window.showWarningMessage("No Semgrep file results selected");
      return;
    }

    const fileList = filePaths.length === 1
      ? filePaths[0]
      : `${filePaths.length} files`;

    const answer = await vscode.window.showWarningMessage(
      `Delete Semgrep results for ${fileList}? This action cannot be undone.`,
      "Delete",
      "Cancel"
    );

    if (answer === "Delete") {
      try {
        for (const filePath of filePaths) {
          await semgrepDataService.deleteSemgrepResultsByFile(filePath);
        }
        vscode.window.showInformationMessage(
          `Deleted Semgrep results for ${fileList}`
        );
        // Refresh the tree
        this.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to delete Semgrep results: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
}

export class CodeScanItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: "folder" | "file" | "finding" | "info" | "error",
    public readonly filePath?: string,
    public readonly children?: CodeScanItem[],
    public readonly results?: any,
    public readonly finding?: any
  ) {
    super(label, collapsibleState);
    this.tooltip = description;
    this.description = description;

    // Set context value for menu contributions
    switch (type) {
      case "folder":
        this.contextValue = "carbonara-semgrep-folder";
        break;
      case "file":
        this.contextValue = "carbonara-semgrep-file";
        break;
      case "finding":
        this.contextValue = "carbonara-semgrep-finding";
        break;
      default:
        this.contextValue = "carbonara-scan-item";
    }

    // Set icons
    switch (type) {
      case "folder":
        this.iconPath = new vscode.ThemeIcon("folder");
        break;
      case "file":
        this.iconPath = new vscode.ThemeIcon("file");
        break;
      case "finding":
        // Use different icons based on severity
        if (finding) {
          if (finding.severity === 'ERROR') {
            this.iconPath = new vscode.ThemeIcon("error", new vscode.ThemeColor("errorForeground"));
          } else if (finding.severity === 'WARNING') {
            this.iconPath = new vscode.ThemeIcon("warning", new vscode.ThemeColor("editorWarning.foreground"));
          } else {
            this.iconPath = new vscode.ThemeIcon("info", new vscode.ThemeColor("editorInfo.foreground"));
          }
        }
        break;
      case "error":
        this.iconPath = new vscode.ThemeIcon("error");
        break;
      case "info":
        this.iconPath = new vscode.ThemeIcon("info");
        break;
    }

    // Add command to open file when clicked
    if (this.type === "file" && this.filePath) {
      this.command = {
        command: "carbonara.openSemgrepFile",
        title: "Open File",
        arguments: [this.filePath]
      };
    } else if (this.type === "finding" && this.filePath && this.finding) {
      // Open file at specific line when clicking on a finding
      this.command = {
        command: "carbonara.openSemgrepFinding",
        title: "Open Finding",
        arguments: [this.filePath, this.finding.start_line, this.finding.start_column]
      };
    }
  }
}
