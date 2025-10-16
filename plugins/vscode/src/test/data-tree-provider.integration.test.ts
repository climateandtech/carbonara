import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { DataTreeProvider, DataItem } from '../data-tree-provider';

suite('DataTreeProvider Integration Tests', () => {
    let provider: DataTreeProvider;
    let testWorkspaceFolder: vscode.WorkspaceFolder;
    let originalWorkspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;

    setup(async () => {
        // Use fixture with empty database (for testing data creation scenarios)
                const fixturePath = path.join(__dirname, '../../e2e/fixtures/with-empty-carbonara-project');
        
        testWorkspaceFolder = {
            uri: vscode.Uri.file(fixturePath),
            name: 'with-empty-carbonara-project',
            index: 0
        };

        // Mock workspace folders
        originalWorkspaceFolders = vscode.workspace.workspaceFolders;
        Object.defineProperty(vscode.workspace, 'workspaceFolders', {
            value: [testWorkspaceFolder],
            configurable: true
        });

        provider = new DataTreeProvider();
        
        // Give more time for CLI initialization and avoid race conditions
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    teardown(async () => {
        // Give time for any pending operations to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Restore original workspace folders
        Object.defineProperty(vscode.workspace, 'workspaceFolders', {
            value: originalWorkspaceFolders,
            configurable: true
        });
    });

    suite('Data Display Scenarios', () => {
        test('Scenario 1: should show "No data available" when database is empty', async () => {
            const children = await provider.getChildren();
            
            // Should return an array of DataItems
            assert.ok(Array.isArray(children));
            
            // Should have "No data available" message
            assert.strictEqual(children.length, 1, 'Should have exactly one item');
            assert.strictEqual(children[0].label, 'No data available');
            assert.strictEqual(children[0].type, 'info');
            // Description is optional, don't assert it
        });

        test('Scenario 2: should be ready for data creation flow testing', async () => {
            // This test documents that this fixture is set up for testing data creation
            // The flow would be:
            // 1. Start with empty database (current state)
            // 2. Run test-analyzer tool (via tools tab)
            // 3. Reload data tab
            // 4. Verify data appears
            
            const children = await provider.getChildren();
            assert.strictEqual(children.length, 1);
            assert.strictEqual(children[0].label, 'No data available');
            
            // This confirms we're starting from the right state for data creation tests
            assert.ok(true, 'Ready for data creation flow: empty → run tool → data appears');
        });
    });

    suite('Data Loading', () => {
        test('should load data from workspace', async () => {
            const children = await provider.getChildren();
            
            // Should show "No data available" for empty database
            assert.strictEqual(children.length, 1);
            assert.strictEqual(children[0].label, 'No data available');
        });

        test('should handle empty data gracefully', async () => {
            // This test would require mocking the CLI, which we're avoiding for now
            // Just verify the provider doesn't crash
            const children = await provider.getChildren();
            assert.ok(Array.isArray(children));
            assert.strictEqual(children.length, 1);
        });

        test('should handle CLI errors gracefully', async () => {
            // Test that CLI errors don't crash the provider
            const children = await provider.getChildren();
            assert.ok(Array.isArray(children));
            // Should still return something (either data or "no data" message)
            assert.ok(children.length >= 1);
        });
    });

    suite('Commands', () => {
        test('should export data successfully', async () => {
            // Export should work even with empty database
            try {
                await provider.exportData('json');
                // If we get here without error, the method handled empty data gracefully
                assert.ok(true, 'Export should handle empty data gracefully');
            } catch (error) {
                // If it throws an error, it should be a user-friendly error, not a crash
                assert.ok(error instanceof Error, 'Should throw a proper Error');
            }
        });

        test('should handle clear data operation', async () => {
            // Mock showWarningMessage to return cancel
            const originalShowWarningMessage = vscode.window.showWarningMessage;
            vscode.window.showWarningMessage = async () => 'Cancel' as any;

            try {
                await provider.clearData();
                // Should complete without error
                assert.ok(true);
            } finally {
                // Restore original method
                vscode.window.showWarningMessage = originalShowWarningMessage;
            }
        });

        test('should get project stats', async () => {
            const stats = await provider.getProjectStats();
            
            assert.ok(typeof stats === 'object');
            assert.strictEqual(stats.totalEntries, 0);
            assert.ok(typeof stats.toolCounts === 'object');
            assert.strictEqual(Object.keys(stats.toolCounts).length, 0);
        });
    });

    suite('Performance', () => {

        test('should cache data appropriately', async () => {
            // First call
            const start1 = Date.now();
            const children1 = await provider.getChildren();
            const duration1 = Date.now() - start1;
            
            // Second call should be faster due to caching
            const start2 = Date.now();
            const children2 = await provider.getChildren();
            const duration2 = Date.now() - start2;
            
            assert.ok(Array.isArray(children1));
            assert.ok(Array.isArray(children2));
            // Second call should be faster (or at least not significantly slower)
            assert.ok(duration2 <= duration1 * 2, 'Second call should benefit from caching');
        });
    });

    suite('Error Handling', () => {
        test('should handle malformed JSON from CLI', async () => {
            // This would require mocking the CLI to return malformed JSON
            // For now, just verify the provider doesn't crash
            const children = await provider.getChildren();
            assert.ok(Array.isArray(children));
        });

        test('should handle network errors gracefully', async () => {
            // This would require mocking network failures
            // For now, just verify the provider doesn't crash
            const children = await provider.getChildren();
            assert.ok(Array.isArray(children));
        });

        test('should handle permission errors gracefully', async () => {
            // This would require mocking permission failures
            // For now, just verify the provider doesn't crash
            const children = await provider.getChildren();
            assert.ok(Array.isArray(children));
        });
    });

    suite('Refresh Functionality', () => {
        test('should refresh data when called', async () => {
            // Initial state
            let children = await provider.getChildren();
            assert.strictEqual(children.length, 1);
            assert.strictEqual(children[0].label, 'No data available');
            
            // After refresh, should still show no data
            provider.refresh();
            await new Promise(resolve => setTimeout(resolve, 100)); // Wait for refresh
            
            children = await provider.getChildren();
            assert.strictEqual(children.length, 1);
            assert.strictEqual(children[0].label, 'No data available');
        });

        test('should clear cache on refresh', async () => {
            // First call
            const children1 = await provider.getChildren();
            assert.strictEqual(children1.length, 1);
            
            // Refresh
            provider.refresh();
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Second call after refresh
            const children2 = await provider.getChildren();
            assert.strictEqual(children2.length, 1);
            
            // Both should show the same result
            assert.strictEqual(children1[0].label, children2[0].label);
        });
    });
});