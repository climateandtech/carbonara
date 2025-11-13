import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class WelcomeTreeProvider implements vscode.TreeDataProvider<WelcomeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<WelcomeItem | undefined | null | void> = new vscode.EventEmitter<WelcomeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<WelcomeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private workspaceFolder: vscode.WorkspaceFolder | undefined;

    constructor() {
        this.workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    }

    refresh(): void {
        this.workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: WelcomeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: WelcomeItem): Thenable<WelcomeItem[]> {
        // Always return empty array to show viewsWelcome content
        // The "when" clause controls visibility of the entire view
        return Promise.resolve([]);
    }
}

export class WelcomeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.description = description;
        this.tooltip = description;
    }
}
