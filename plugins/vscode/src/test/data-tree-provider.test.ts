import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { DataTreeProvider, DataItem } from '../data-tree-provider';
import { UI_TEXT } from '../constants/ui-text';

suite('DataTreeProvider Unit Tests', () => {
    let provider: DataTreeProvider;
    let originalWorkspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;

    setup(async () => {
        // Setup a mock workspace folder
        const tempDir = path.join(__dirname, '../../e2e/fixtures/with-empty-carbonara-project');
        const mockWorkspaceFolder = {
            uri: vscode.Uri.file(tempDir),
            name: 'with-empty-carbonara-project',
            index: 0
        };

        // Mock vscode.workspace.workspaceFolders
        originalWorkspaceFolders = vscode.workspace.workspaceFolders;
        Object.defineProperty(vscode.workspace, 'workspaceFolders', {
            value: [mockWorkspaceFolder],
            configurable: true
        });

        provider = new DataTreeProvider();
        // Allow for async initialization in constructor
        await new Promise(resolve => setTimeout(resolve, 50));
    });

    teardown(() => {
        // Restore original workspace folders
        Object.defineProperty(vscode.workspace, 'workspaceFolders', {
            value: originalWorkspaceFolders,
            configurable: true
        });
    });

    suite('DataItem Creation', () => {
        test('should create group items with correct properties', () => {
            const groupItem = new DataItem(
                'Analysis results from test-analyzer',
                '2 analysis entries',
                vscode.TreeItemCollapsibleState.Expanded,
                'group',
                'test-analyzer'
            );

            assert.strictEqual(groupItem.label, 'Analysis results from test-analyzer');
            assert.strictEqual(groupItem.description, '2 analysis entries');
            assert.strictEqual(groupItem.type, 'group');
            assert.strictEqual(groupItem.toolName, 'test-analyzer');
            assert.strictEqual(groupItem.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
            assert.strictEqual(groupItem.contextValue, 'carbonara-data-group');
        });

        test('should create entry items with correct properties', () => {
            const entryItem = new DataItem(
                'https://example.com',
                'Analyzed on 2024-01-15',
                vscode.TreeItemCollapsibleState.Collapsed,
                'entry',
                'test-analyzer',
                123
            );

            assert.strictEqual(entryItem.label, 'https://example.com');
            assert.strictEqual(entryItem.description, 'Analyzed on 2024-01-15');
            assert.strictEqual(entryItem.type, 'entry');
            assert.strictEqual(entryItem.toolName, 'test-analyzer');
            assert.strictEqual(entryItem.entryId, 123);
            assert.strictEqual(entryItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
            assert.strictEqual(entryItem.contextValue, 'carbonara-data-entry');
        });

        test('should create detail items with correct properties', () => {
            const detailItem = new DataItem(
                'testScore',
                '85',
                vscode.TreeItemCollapsibleState.None,
                'detail'
            );

            assert.strictEqual(detailItem.label, 'testScore');
            assert.strictEqual(detailItem.description, '85');
            assert.strictEqual(detailItem.type, 'detail');
            assert.strictEqual(detailItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
            assert.strictEqual(detailItem.contextValue, 'carbonara-data-detail');
        });

        test('should create info items with correct properties', () => {
            const infoItem = new DataItem(
                'No data available',
                'Run analysis tools to generate data',
                vscode.TreeItemCollapsibleState.None,
                'info'
            );

            assert.strictEqual(infoItem.label, 'No data available');
            assert.strictEqual(infoItem.description, 'Run analysis tools to generate data');
            assert.strictEqual(infoItem.type, 'info');
            assert.strictEqual(infoItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
            assert.strictEqual(infoItem.contextValue, 'carbonara-data-item');
        });

        test('should create error items with correct properties', () => {
            const errorItem = new DataItem(
                'Error loading data',
                'Database connection failed',
                vscode.TreeItemCollapsibleState.None,
                'error'
            );

            assert.strictEqual(errorItem.label, 'Error loading data');
            assert.strictEqual(errorItem.description, 'Database connection failed');
            assert.strictEqual(errorItem.type, 'error');
            assert.strictEqual(errorItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
            assert.strictEqual(errorItem.contextValue, 'carbonara-data-item');
        });
    });

    suite('getChildren', () => {
        test('should return "No workspace folder" if no workspace is open', async () => {
            // Mock no workspace folder
            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                value: undefined,
                configurable: true
            });

            const provider = new DataTreeProvider();
            const items = await provider.getChildren();
            assert.strictEqual(items.length, 1);
            assert.strictEqual(items[0].label, 'No workspace folder');
        });

        test('should handle group entries', async () => {
            const groupItem = new DataItem(
                'Analysis results from test-analyzer',
                '2 analysis entries',
                vscode.TreeItemCollapsibleState.Expanded,
                'group',
                'test-analyzer'
            );
            groupItem.entries = [
                { id: 1, url: 'https://test-site.com', timestamp: '2023-01-01T10:00:00Z' },
                { id: 2, url: 'https://another-site.com', timestamp: '2023-01-02T11:00:00Z' }
            ];

            const entries = await provider.getChildren(groupItem);
            assert.strictEqual(entries.length, 2);
            assert.strictEqual(entries[0].label, 'https://test-site.com');
            assert.strictEqual(entries[0].type, 'entry');
            assert.strictEqual(entries[1].label, 'https://another-site.com');
            assert.strictEqual(entries[1].type, 'entry');
        });

        test('should handle entry details', async () => {
            const entryItem = new DataItem(
                'https://test-site.com',
                'Analyzed on 2023-01-01T10:00:00Z',
                vscode.TreeItemCollapsibleState.Collapsed,
                'entry',
                'test-analyzer',
                1
            );
            
            // Mock the entry to have data
            entryItem.entries = [{
                id: 1,
                tool_name: 'test-analyzer',
                url: 'https://test-site.com',
                timestamp: '2023-01-01T10:00:00Z',
                data: { score: 90, metric: 'A+' },
                summary: { status: 'completed', message: 'Analysis successful' }
            }];

            const details = await provider.getChildren(entryItem);
            assert.ok(details.length > 0);
            
            // Check that we have the expected detail items
            const detailLabels = details.map(d => d.label);
            assert.ok(detailLabels.includes('Analysis Date'));
            assert.ok(detailLabels.includes('Tool Used'));
            assert.ok(detailLabels.includes('URL'));
            assert.ok(detailLabels.includes('score'));
            assert.ok(detailLabels.includes('metric'));
            assert.ok(detailLabels.includes('Status'));
            assert.ok(detailLabels.includes('Message'));
        });

        test('should handle info/error items with no children', async () => {
            const infoItem = new DataItem(
                'No data available',
                'Run analysis tools to generate data',
                vscode.TreeItemCollapsibleState.None,
                'info'
            );

            const children = await provider.getChildren(infoItem);
            assert.strictEqual(children.length, 0);
        });
    });

    suite('loadGroupEntries', () => {
        test('should return "No entries" if group has no entries', async () => {
            const groupItem = new DataItem(
                'Analysis results from test-analyzer',
                '0 analysis entries',
                vscode.TreeItemCollapsibleState.Expanded,
                'group',
                'test-analyzer'
            );
            // Don't set entries property

            const entries = await provider.getChildren(groupItem);
            assert.strictEqual(entries.length, 1);
            assert.strictEqual(entries[0].label, 'No entries');
        });

        test('should return entries if group has entries', async () => {
            const groupItem = new DataItem(
                'Analysis results from test-analyzer',
                '2 analysis entries',
                vscode.TreeItemCollapsibleState.Expanded,
                'group',
                'test-analyzer'
            );
            groupItem.entries = [
                { id: 1, url: 'https://test-site.com', timestamp: '2023-01-01T10:00:00Z' },
                { id: 2, url: 'https://another-site.com', timestamp: '2023-01-02T11:00:00Z' }
            ];

            const entries = await provider.getChildren(groupItem);
            assert.strictEqual(entries.length, 2);
            assert.strictEqual(entries[0].label, 'https://test-site.com');
            assert.strictEqual(entries[0].type, 'entry');
            assert.strictEqual(entries[1].label, 'https://another-site.com');
            assert.strictEqual(entries[1].type, 'entry');
        });
    });

    suite('loadEntryDetails', () => {
        test('should return "No details available" if entry has no data', async () => {
            const entryItem = new DataItem(
                'https://test-site.com',
                'Analyzed on 2023-01-01T10:00:00Z',
                vscode.TreeItemCollapsibleState.Collapsed,
                'entry',
                'test-analyzer',
                1
            );
            // Don't set entries property

            const details = await provider.getChildren(entryItem);
            assert.strictEqual(details.length, 1);
            assert.strictEqual(details[0].label, 'No details available');
        });

        test('should return details if entry has data', async () => {
            const entryItem = new DataItem(
                'https://test-site.com',
                'Analyzed on 2023-01-01T10:00:00Z',
                vscode.TreeItemCollapsibleState.Collapsed,
                'entry',
                'test-analyzer',
                1
            );
            entryItem.entries = [{
                id: 1,
                tool_name: 'test-analyzer',
                url: 'https://test-site.com',
                timestamp: '2023-01-01T10:00:00Z',
                data: { score: 90, metric: 'A+' },
                summary: { status: 'completed', message: 'Analysis successful' }
            }];

            const details = await provider.getChildren(entryItem);
            assert.ok(details.length > 0);
            
            // Check that we have the expected detail items
            const detailLabels = details.map(d => d.label);
            assert.ok(detailLabels.includes('Analysis Date'));
            assert.ok(detailLabels.includes('Tool Used'));
            assert.ok(detailLabels.includes('URL'));
            assert.ok(detailLabels.includes('score'));
            assert.ok(detailLabels.includes('metric'));
            assert.ok(detailLabels.includes('Status'));
            assert.ok(detailLabels.includes('Message'));
        });
    });

    suite('refresh', () => {
        test('should clear cache and reload data', async () => {
            // Refresh should not throw
            provider.refresh();
            
            // Should be able to get children after refresh
            const items = await provider.getChildren();
            assert.ok(Array.isArray(items));
        });
    });
});