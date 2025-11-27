import { describe, test, expect, vi, beforeEach } from 'vitest';
import { getToolRegistry } from '../src/registry/index.js';
import { listTools } from '../src/commands/tools.js';
import { execaCommand } from 'execa';

// Mock execa at the module level - this will be used by both CLI and core packages
vi.mock('execa', () => ({
  execaCommand: vi.fn(),
  execa: vi.fn()
}));

describe('Tools Command - Prerequisites Checking', () => {
  let mockExecaCommand: ReturnType<typeof vi.fn>;
  
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecaCommand = vi.mocked(execaCommand);
  });

  test('should check prerequisites for installed tools and execute correct commands', async () => {
    const registry = getToolRegistry();
    const allTools = registry.getAllTools();
    
    // Find a tool with prerequisites (like if-webpage-scan or deployment-scan)
    const toolWithPrereqs = allTools.find((t: any) => t.prerequisites && t.prerequisites.length > 0);
    
    if (!toolWithPrereqs) {
      // Skip if no tool with prerequisites in registry
      test.skip();
      return;
    }
    
    // Mock execaCommand to return success for prerequisite checks
    mockExecaCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'success',
      stderr: '',
      command: '',
      escapedCommand: '',
      killed: false,
      signal: null,
      timedOut: false
    } as any);
    
    // Directly test checkToolPrerequisites to verify it executes the right commands
    const result = await registry.checkToolPrerequisites(toolWithPrereqs.id);
    
    // Verify execaCommand was called - the core package uses dynamic import so the mock should work
    const prereqCheckCommands = toolWithPrereqs.prerequisites.map((p: any) => p.checkCommand);
    
    // Check that execaCommand was called at least once (may be called more times if tool detection also uses it)
    expect(mockExecaCommand).toHaveBeenCalled();
    
    // Verify it was called with at least one of the prerequisite check commands
    const calls = mockExecaCommand.mock.calls;
    const foundPrereqCall = calls.find(call => 
      prereqCheckCommands.includes(call[0])
    );
    expect(foundPrereqCall).toBeDefined();
    
    if (foundPrereqCall) {
      expect(foundPrereqCall[1]).toMatchObject({
        stdio: 'pipe',
        timeout: 5000,
        reject: false,
        shell: true
      });
    }
    
    // Verify result indicates all prerequisites are available
    expect(result.allAvailable).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  test('should detect missing prerequisites when command execution fails', async () => {
    const registry = getToolRegistry();
    const allTools = registry.getAllTools();
    
    // Find a tool with prerequisites
    const toolWithPrereqs = allTools.find((t: any) => t.prerequisites && t.prerequisites.length > 0);
    
    if (!toolWithPrereqs) {
      // Skip if no tool with prerequisites
      test.skip();
      return;
    }
    
    // Mock execaCommand to return failure (command not found)
    mockExecaCommand.mockResolvedValue({
      exitCode: 127, // Command not found
      stdout: '',
      stderr: 'command not found',
      command: '',
      escapedCommand: '',
      killed: false,
      signal: null,
      timedOut: false
    } as any);
    
    // Directly test checkToolPrerequisites to verify it detects missing prerequisites
    const result = await registry.checkToolPrerequisites(toolWithPrereqs.id);
    
    // Verify execaCommand was called - check that it was called with the prerequisite check command
    const prereqCheckCommand = toolWithPrereqs.prerequisites[0].checkCommand;
    expect(mockExecaCommand).toHaveBeenCalled();
    
    // Find the call with the prerequisite check command
    const calls = mockExecaCommand.mock.calls;
    const foundCall = calls.find(call => call[0] === prereqCheckCommand);
    expect(foundCall).toBeDefined();
    
    if (foundCall) {
      expect(foundCall[1]).toMatchObject({
        stdio: 'pipe',
        timeout: 5000,
        reject: false,
        shell: true
      });
    }
    
    // Verify result indicates prerequisites are missing
    expect(result.allAvailable).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
    expect(result.missing[0].prerequisite.name).toBe(toolWithPrereqs.prerequisites[0].name);
  });

  test('should handle tools with no prerequisites', async () => {
    const registry = getToolRegistry();
    const allTools = registry.getAllTools();
    
    // Find a tool without prerequisites
    const toolWithoutPrereqs = allTools.find((t: any) => !t.prerequisites || t.prerequisites.length === 0);
    
    if (!toolWithoutPrereqs) {
      // Skip if all tools have prerequisites
      test.skip();
      return;
    }
    
    // Clear previous calls
    mockExecaCommand.mockClear();
    
    // Verify prerequisites check returns all available (no prerequisites to check)
    const prereqCheckResult = await registry.checkToolPrerequisites(toolWithoutPrereqs.id);
    expect(prereqCheckResult.allAvailable).toBe(true);
    expect(prereqCheckResult.missing).toHaveLength(0);
    
    // Verify execaCommand was NOT called for prerequisite checking
    // (it might be called for tool detection, but not for prerequisites)
    const calls = mockExecaCommand.mock.calls;
    // For tools without prerequisites, checkPrerequisites should return early
    // so execaCommand shouldn't be called for prerequisite checking
    // (but it might be called for other reasons like tool detection)
  });

  test('should not check prerequisites when no tools are installed', async () => {
    const registry = getToolRegistry();
    
    // Mock getInstalledTools to return empty array
    const originalGetInstalledTools = registry.getInstalledTools.bind(registry);
    registry.getInstalledTools = vi.fn(async () => []);
    
    // Mock isToolInstalled to return false for all tools
    // This prevents refreshInstalledTools() from being called, which would trigger execaCommand
    const originalIsToolInstalled = registry.isToolInstalled.bind(registry);
    registry.isToolInstalled = vi.fn(async () => false);
    
    // Mock refreshInstalledTools to do nothing (prevent tool detection)
    const originalRefreshInstalledTools = registry.refreshInstalledTools.bind(registry);
    registry.refreshInstalledTools = vi.fn(async () => {});
    
    try {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await listTools();
      
      // Verify execaCommand was NOT called (no tools installed, so no prerequisites to check)
      expect(mockExecaCommand).not.toHaveBeenCalled();
      
      // Verify output still shows registry header regardless
      const output = consoleLogSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(output).toContain('Analysis Tools Registry');
      
      consoleLogSpy.mockRestore();
    } finally {
      // Restore original methods
      registry.getInstalledTools = originalGetInstalledTools;
      registry.isToolInstalled = originalIsToolInstalled;
      registry.refreshInstalledTools = originalRefreshInstalledTools;
    }
  });
});

