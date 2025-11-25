import { describe, test, beforeEach, afterEach, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { mkdtempSync, rmSync } from 'fs';
import {
  markToolInstalled,
  recordToolError,
  flagDetectionFailed,
  isToolMarkedInstalled,
  getToolLastError,
  loadProjectConfig,
  saveProjectConfig
} from '../src/utils/config.js';

describe('Tool Status Config Functions', () => {
  let testDir: string;
  let configPath: string;

  beforeEach(() => {
    // Create isolated test directory
    testDir = mkdtempSync(path.join(os.tmpdir(), 'carbonara-config-test-'));
    const carbonaraDir = path.join(testDir, '.carbonara');
    fs.mkdirSync(carbonaraDir, { recursive: true });
    configPath = path.join(carbonaraDir, 'carbonara.config.json');

    // Create initial config
    const initialConfig = {
      name: 'Test Project',
      description: 'Test project',
      projectType: 'web',
      projectId: 1,
      database: {
        path: '.carbonara/carbonara.db'
      },
      tools: {}
    };
    fs.writeFileSync(configPath, JSON.stringify(initialConfig, null, 2));
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('should mark tool as installed', async () => {
    await markToolInstalled('test-tool', testDir);

    const config = await loadProjectConfig(testDir);
    expect(config?.tools?.['test-tool']).toBeDefined();
    expect(config?.tools?.['test-tool']?.installationStatus?.installed).toBe(true);
    expect(config?.tools?.['test-tool']?.installationStatus?.installedAt).toBeDefined();
  });

  test('should record tool error', async () => {
    const error = new Error('Test error message');
    await recordToolError('test-tool', error, testDir);

    const config = await loadProjectConfig(testDir);
    expect(config?.tools?.['test-tool']?.lastError?.message).toBe('Test error message');
    expect(config?.tools?.['test-tool']?.lastError?.timestamp).toBeDefined();
  });

  test('should record tool error as string', async () => {
    await recordToolError('test-tool', 'String error message', testDir);

    const config = await loadProjectConfig(testDir);
    expect(config?.tools?.['test-tool']?.lastError?.message).toBe('String error message');
  });

  test('should flag detection as failed', async () => {
    // First mark as installed
    await markToolInstalled('test-tool', testDir);
    
    // Then flag detection as failed
    await flagDetectionFailed('test-tool', testDir);

    const config = await loadProjectConfig(testDir);
    expect(config?.tools?.['test-tool']?.detectionFailed).toBe(true);
    expect(config?.tools?.['test-tool']?.detectionFailedAt).toBeDefined();
    // Installation status should be cleared
    expect(config?.tools?.['test-tool']?.installationStatus).toBeUndefined();
  });

  test('should check if tool is marked as installed', async () => {
    // Initially not marked
    expect(await isToolMarkedInstalled('test-tool', testDir)).toBe(false);

    // Mark as installed
    await markToolInstalled('test-tool', testDir);
    expect(await isToolMarkedInstalled('test-tool', testDir)).toBe(true);
  });

  test('should get last error for tool', async () => {
    // Initially no error
    expect(await getToolLastError('test-tool', testDir)).toBeNull();

    // Record error
    await recordToolError('test-tool', 'Test error', testDir);
    const error = await getToolLastError('test-tool', testDir);
    expect(error).not.toBeNull();
    expect(error?.message).toBe('Test error');
    expect(error?.timestamp).toBeDefined();
  });

  test('should handle multiple tools independently', async () => {
    await markToolInstalled('tool1', testDir);
    await markToolInstalled('tool2', testDir);
    await recordToolError('tool1', 'Error for tool1', testDir);
    await flagDetectionFailed('tool2', testDir);

    const config = await loadProjectConfig(testDir);
    
    // Tool1: installed, has error, not flagged
    expect(config?.tools?.tool1?.installationStatus?.installed).toBe(true);
    expect(config?.tools?.tool1?.lastError?.message).toBe('Error for tool1');
    expect(config?.tools?.tool1?.detectionFailed).toBeUndefined();
    
    // Tool2: flagged, installation status cleared
    expect(config?.tools?.tool2?.detectionFailed).toBe(true);
    expect(config?.tools?.tool2?.installationStatus).toBeUndefined();
  });

  test('should handle tool ID with hyphens correctly', async () => {
    await markToolInstalled('if-webpage-scan', testDir);
    expect(await isToolMarkedInstalled('if-webpage-scan', testDir)).toBe(true);
  });
});

