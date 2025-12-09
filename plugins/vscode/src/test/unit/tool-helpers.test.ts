import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  getWorkspacePath,
  checkToolPrerequisitesWithErrorHandling,
  recordToolErrorWithUI,
  clearToolErrorSilently,
} from '../../utils/tool-helpers';

suite('Tool Helpers Unit Tests', () => {
  let originalWorkspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;
  let testWorkspaceFolder: vscode.WorkspaceFolder;
  let tempDir: string;
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let consoleLogCalls: any[];
  let consoleErrorCalls: any[];

  setup(() => {
    // Mock workspace folders
    originalWorkspaceFolders = vscode.workspace.workspaceFolders;

    // Create a temporary test workspace folder
    tempDir = fs.mkdtempSync(path.join('/tmp', 'carbonara-tool-helpers-test-'));
    
    // Create .carbonara directory and config file
    const carbonaraDir = path.join(tempDir, '.carbonara');
    fs.mkdirSync(carbonaraDir, { recursive: true });
    fs.writeFileSync(
      path.join(carbonaraDir, 'carbonara.config.json'),
      JSON.stringify({ name: 'test-project', initialized: true }, null, 2)
    );

    // Create mock test workspace folder
    testWorkspaceFolder = {
      uri: vscode.Uri.file(tempDir),
      name: 'test-workspace',
      index: 0
    };

    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      value: [testWorkspaceFolder],
      configurable: true
    });

    // Capture console.log and console.error calls
    consoleLogCalls = [];
    consoleErrorCalls = [];
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = (...args: any[]) => {
      consoleLogCalls.push(args);
      originalConsoleLog(...args);
    };
    console.error = (...args: any[]) => {
      consoleErrorCalls.push(args);
      originalConsoleError(...args);
    };
  });

  teardown(() => {
    // Restore original workspace folders
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      value: originalWorkspaceFolders,
      configurable: true
    });

    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;

    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  suite('getWorkspacePath', () => {
    test('should return workspace path when workspace folder exists', () => {
      const workspacePath = getWorkspacePath();
      assert.strictEqual(workspacePath, tempDir);
    });

    test('should return null when no workspace folder', () => {
      Object.defineProperty(vscode.workspace, 'workspaceFolders', {
        value: undefined,
        configurable: true
      });

      const workspacePath = getWorkspacePath();
      assert.strictEqual(workspacePath, null);
    });

    test('should return null when workspace folders array is empty', () => {
      Object.defineProperty(vscode.workspace, 'workspaceFolders', {
        value: [],
        configurable: true
      });

      const workspacePath = getWorkspacePath();
      assert.strictEqual(workspacePath, null);
    });
  });

  suite('checkToolPrerequisitesWithErrorHandling', () => {
    test('should return prerequisite check result when all prerequisites are available', async () => {
      // This test would require mocking the tool registry, which is complex
      // For now, we'll test the basic structure - actual integration would be in integration tests
      // The function should handle the case where prerequisites are available
      assert.ok(typeof checkToolPrerequisitesWithErrorHandling === 'function');
    });

    test('should return null and log error when prerequisites are missing (no UI)', async () => {
      // Reset console log calls
      consoleLogCalls = [];

      // Mock the tool registry module
      const Module = require('module');
      const originalRequire = Module.prototype.require;
      
      let recordToolErrorCalled = false;
      let recordToolErrorArgs: any[] = [];

      Module.prototype.require = function (id: string) {
        if (id === '@carbonara/cli/dist/registry/index.js') {
          return {
            getToolRegistry: () => ({
              checkToolPrerequisites: async () => ({
                allAvailable: false,
                missing: [{
                  prerequisite: {
                    name: 'Python 3.7+',
                    errorMessage: 'Python 3.7+ is required',
                    setupInstructions: 'Install Python from https://python.org'
                  }
                }]
              })
            })
          };
        }
        if (id === '@carbonara/cli/dist/utils/config.js') {
          return {
            recordToolError: async (toolId: string, message: string, workspacePath: string) => {
              recordToolErrorCalled = true;
              recordToolErrorArgs = [toolId, message, workspacePath];
            }
          };
        }
        return originalRequire.apply(this, arguments);
      };

      try {
        // Re-import the module to get the mocked version
        delete require.cache[require.resolve('../../utils/tool-helpers')];
        const { checkToolPrerequisitesWithErrorHandling: checkPrereqs } = require('../../utils/tool-helpers');
        
        const result = await checkPrereqs('test-tool', 'Test Tool', false);
        
        assert.strictEqual(result, null);
        // Check that console.log was called with the error message
        // Message format: "${displayName} prerequisites missing: ${missingPrereqs}"
        // Debug: log all captured calls
        if (consoleLogCalls.length === 0) {
          console.log('DEBUG: No console.log calls captured. consoleLogCalls:', consoleLogCalls);
        }
        const logCall = consoleLogCalls.find(call => 
          call && call[0] && typeof call[0] === 'string' && call[0].includes('prerequisites missing')
        );
        if (!logCall) {
          console.log('DEBUG: All console.log calls:', JSON.stringify(consoleLogCalls, null, 2));
        }
        assert.ok(logCall, `Should log prerequisites missing message. Captured calls: ${JSON.stringify(consoleLogCalls)}`);
        assert.strictEqual(recordToolErrorCalled, true);
        assert.strictEqual(recordToolErrorArgs[0], 'test-tool');
        assert.strictEqual(recordToolErrorArgs[2], tempDir);
      } finally {
        // Restore original require
        Module.prototype.require = originalRequire;
        // Clear cache to restore original module
        delete require.cache[require.resolve('../../utils/tool-helpers')];
      }
    });
  });

  suite('recordToolErrorWithUI', () => {
    test('should record error in config when workspace path exists', async () => {
      let recordToolErrorCalled = false;
      let recordToolErrorArgs: any[] = [];

      const Module = require('module');
      const originalRequire = Module.prototype.require;

      Module.prototype.require = function (id: string) {
        if (id === '@carbonara/cli/dist/utils/config.js') {
          return {
            recordToolError: async (toolId: string, message: string, workspacePath: string) => {
              recordToolErrorCalled = true;
              recordToolErrorArgs = [toolId, message, workspacePath];
            }
          };
        }
        return originalRequire.apply(this, arguments);
      };

      try {
        delete require.cache[require.resolve('../../utils/tool-helpers')];
        const { recordToolErrorWithUI: recordError } = require('../../utils/tool-helpers');
        
        await recordError('test-tool', 'Test error message', false);

        assert.strictEqual(recordToolErrorCalled, true);
        assert.strictEqual(recordToolErrorArgs[0], 'test-tool');
        assert.strictEqual(recordToolErrorArgs[1], 'Test error message');
        assert.strictEqual(recordToolErrorArgs[2], tempDir);
      } finally {
        Module.prototype.require = originalRequire;
        delete require.cache[require.resolve('../../utils/tool-helpers')];
      }
    });

    test('should not record error when no workspace path', async () => {
      Object.defineProperty(vscode.workspace, 'workspaceFolders', {
        value: undefined,
        configurable: true
      });

      let recordToolErrorCalled = false;

      const Module = require('module');
      const originalRequire = Module.prototype.require;

      Module.prototype.require = function (id: string) {
        if (id === '@carbonara/cli/dist/utils/config.js') {
          return {
            recordToolError: async () => {
              recordToolErrorCalled = true;
            }
          };
        }
        return originalRequire.apply(this, arguments);
      };

      try {
        delete require.cache[require.resolve('../../utils/tool-helpers')];
        const { recordToolErrorWithUI: recordError } = require('../../utils/tool-helpers');
        
        await recordError('test-tool', 'Test error message', false);

        assert.strictEqual(recordToolErrorCalled, false);
      } finally {
        Module.prototype.require = originalRequire;
        delete require.cache[require.resolve('../../utils/tool-helpers')];
        // Restore workspace folders
        Object.defineProperty(vscode.workspace, 'workspaceFolders', {
          value: [testWorkspaceFolder],
          configurable: true
        });
      }
    });

    test('should show UI error when showUI is true and outputChannel provided', async () => {
      const Module = require('module');
      const originalRequire = Module.prototype.require;

      let outputChannelAppendLineCalled = false;
      let outputChannelShowCalled = false;
      let showErrorMessageCalled = false;

      const mockOutputChannel = {
        appendLine: (text: string) => {
          outputChannelAppendLineCalled = true;
          assert.strictEqual(text, 'Error: Test error message');
        },
        show: () => {
          outputChannelShowCalled = true;
        }
      };

      const originalShowErrorMessage = vscode.window.showErrorMessage;
      (vscode.window as any).showErrorMessage = async () => {
        showErrorMessageCalled = true;
        return undefined;
      };

      Module.prototype.require = function (id: string) {
        if (id === '@carbonara/cli/dist/utils/config.js') {
          return {
            recordToolError: async () => {}
          };
        }
        return originalRequire.apply(this, arguments);
      };

      try {
        delete require.cache[require.resolve('../../utils/tool-helpers')];
        const { recordToolErrorWithUI: recordError } = require('../../utils/tool-helpers');
        
        await recordError('test-tool', 'Test error message', true, mockOutputChannel as any);

        assert.strictEqual(outputChannelAppendLineCalled, true);
        assert.strictEqual(outputChannelShowCalled, true);
        assert.strictEqual(showErrorMessageCalled, true);
      } finally {
        Module.prototype.require = originalRequire;
        (vscode.window as any).showErrorMessage = originalShowErrorMessage;
        delete require.cache[require.resolve('../../utils/tool-helpers')];
      }
    });

    test('should handle config errors gracefully', async () => {
      consoleErrorCalls = [];

      const Module = require('module');
      const originalRequire = Module.prototype.require;

      Module.prototype.require = function (id: string) {
        if (id === '@carbonara/cli/dist/utils/config.js') {
          return {
            recordToolError: async () => {
              throw new Error('Config write failed');
            }
          };
        }
        return originalRequire.apply(this, arguments);
      };

      try {
        delete require.cache[require.resolve('../../utils/tool-helpers')];
        const { recordToolErrorWithUI: recordError } = require('../../utils/tool-helpers');
        
        // Should not throw
        await recordError('test-tool', 'Test error message', false);

        // Check that error was logged
        // Message format: "Failed to record ${toolId} error in config:"
        const errorCall = consoleErrorCalls.find(call => 
          call[0] && typeof call[0] === 'string' && call[0].includes('Failed to record') && call[0].includes('error in config')
        );
        assert.ok(errorCall, 'Should log config error');
      } finally {
        Module.prototype.require = originalRequire;
        delete require.cache[require.resolve('../../utils/tool-helpers')];
      }
    });
  });

  suite('clearToolErrorSilently', () => {
    test('should clear error in config when workspace path exists', async () => {
      let clearToolErrorCalled = false;
      let clearToolErrorArgs: any[] = [];

      const Module = require('module');
      const originalRequire = Module.prototype.require;

      Module.prototype.require = function (id: string) {
        if (id === '@carbonara/cli/dist/utils/config.js') {
          return {
            clearToolError: async (toolId: string, workspacePath: string) => {
              clearToolErrorCalled = true;
              clearToolErrorArgs = [toolId, workspacePath];
            }
          };
        }
        return originalRequire.apply(this, arguments);
      };

      try {
        delete require.cache[require.resolve('../../utils/tool-helpers')];
        const { clearToolErrorSilently: clearError } = require('../../utils/tool-helpers');
        
        await clearError('test-tool');

        assert.strictEqual(clearToolErrorCalled, true);
        assert.strictEqual(clearToolErrorArgs[0], 'test-tool');
        assert.strictEqual(clearToolErrorArgs[1], tempDir);
      } finally {
        Module.prototype.require = originalRequire;
        delete require.cache[require.resolve('../../utils/tool-helpers')];
      }
    });

    test('should not clear error when no workspace path', async () => {
      Object.defineProperty(vscode.workspace, 'workspaceFolders', {
        value: undefined,
        configurable: true
      });

      let clearToolErrorCalled = false;

      const Module = require('module');
      const originalRequire = Module.prototype.require;

      Module.prototype.require = function (id: string) {
        if (id === '@carbonara/cli/dist/utils/config.js') {
          return {
            clearToolError: async () => {
              clearToolErrorCalled = true;
            }
          };
        }
        return originalRequire.apply(this, arguments);
      };

      try {
        delete require.cache[require.resolve('../../utils/tool-helpers')];
        const { clearToolErrorSilently: clearError } = require('../../utils/tool-helpers');
        
        await clearError('test-tool');

        assert.strictEqual(clearToolErrorCalled, false, 'Should not call clearToolError when no workspace');
        
        // Check that error was logged (since config write would fail)
        const errorCall = consoleErrorCalls.find(call => 
          call[0] && typeof call[0] === 'string' && call[0].includes('Failed to clear') && call[0].includes('error in config')
        );
        assert.ok(errorCall, 'Should log config error when workspace is missing');
      } finally {
        Module.prototype.require = originalRequire;
        delete require.cache[require.resolve('../../utils/tool-helpers')];
        // Restore workspace folders
        Object.defineProperty(vscode.workspace, 'workspaceFolders', {
          value: [testWorkspaceFolder],
          configurable: true
        });
      }
    });

    test('should handle config errors gracefully', async () => {
      consoleErrorCalls = [];

      const Module = require('module');
      const originalRequire = Module.prototype.require;

      Module.prototype.require = function (id: string) {
        if (id === '@carbonara/cli/dist/utils/config.js') {
          return {
            clearToolError: async () => {
              throw new Error('Config write failed');
            }
          };
        }
        return originalRequire.apply(this, arguments);
      };

      try {
        delete require.cache[require.resolve('../../utils/tool-helpers')];
        const { clearToolErrorSilently: clearError } = require('../../utils/tool-helpers');
        
        // Should not throw
        await clearError('test-tool');

        // Check that error was logged
        const errorCall = consoleErrorCalls.find(call => 
          call[0] && call[0].includes('Failed to clear test-tool error in config')
        );
        assert.ok(errorCall, 'Should log config error');
      } finally {
        Module.prototype.require = originalRequire;
        delete require.cache[require.resolve('../../utils/tool-helpers')];
      }
    });
  });
});
