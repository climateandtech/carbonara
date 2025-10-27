import * as vscode from "vscode";

export class DashboardTreeProvider implements vscode.TreeDataProvider<DashboardItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    DashboardItem | undefined | null | void
  > = new vscode.EventEmitter<DashboardItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    DashboardItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: DashboardItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: DashboardItem): DashboardItem[] {
    if (element) {
      return [];
    }

    const openDashboard = new DashboardItem(
      "📊 Open Dashboard",
      "View data in interactive dashboard",
      vscode.TreeItemCollapsibleState.None
    );
    openDashboard.command = {
      command: "carbonara.showDashboard",
      title: "Open Dashboard",
    };
    openDashboard.iconPath = new vscode.ThemeIcon("graph");

    return [openDashboard];
  }
}

export class DashboardItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.tooltip = description;
    this.description = description;
  }
}
