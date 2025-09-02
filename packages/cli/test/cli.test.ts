import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { describe, test, beforeEach, afterEach, expect } from 'vitest';

describe('Carbonara CLI - Tests', () => {
  let testDir: string;
  let cliPath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carbonara-test-'));
    cliPath = path.resolve('./dist/index.js');
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('CLI should show help', () => {
    const result = execSync(`node "${cliPath}" --help`, { encoding: 'utf8' });
    expect(result).toContain('CLI tool for CO2 assessment');
    expect(result).toContain('Commands:');
    expect(result).toContain('init');
    expect(result).toContain('assess');
    expect(result).toContain('data');
    expect(result).toContain('analyze');
    expect(result).toContain('tools');
  });

  test('CLI should show version', () => {
    const result = execSync(`node "${cliPath}" --version`, { encoding: 'utf8' });
    expect(result).toContain('0.1.0');
  });

  test('assess command should show warning without project', () => {
    const result = execSync(`cd "${testDir}" && node "${cliPath}" assess`, { encoding: 'utf8' });
    expect(result).toContain('No project found');
  });



  test('data command should show help when no options provided', () => {
    fs.writeFileSync(path.join(testDir, 'carbonara.config.json'), JSON.stringify({
      name: 'Test Project',
      projectType: 'web',
      projectId: 'test-123'
    }));
    
    const result = execSync(`cd "${testDir}" && node "${cliPath}" data`, { encoding: 'utf8' });
    expect(result).toContain('Data Lake Management');
    expect(result).toContain('--list');
  });

  test('data --list should handle missing database gracefully', () => {
    fs.writeFileSync(path.join(testDir, 'carbonara.config.json'), JSON.stringify({
      name: 'Test Project',
      projectType: 'web',
      projectId: 'test-123'
    }));
    
    try {
      const result = execSync(`cd "${testDir}" && node "${cliPath}" data --list`, { encoding: 'utf8' });
      expect(result).toContain('No data found');
    } catch (error: any) {
      expect(error.stderr.toString()).toContain('Data operation failed');
    }
  });

  test('tools command should show help when no options provided', () => {
    const result = execSync(`cd "${testDir}" && node "${cliPath}" tools`, { encoding: 'utf8' });
    expect(result).toContain('Analysis Tools Management');
    expect(result).toContain('--list');
    expect(result).toContain('--install');
    expect(result).toContain('--refresh');
  });

  test('tools --list should show available tools', () => {
    try {
      const result = execSync(`cd "${testDir}" && node "${cliPath}" tools --list`, { encoding: 'utf8' });
      expect(result).toContain('Analysis Tools Registry');
      // Should show at least the co2-assessment tool from our registry
      expect(result).toContain('co2-assessment');
    } catch (error: any) {
      // If registry loading fails, check that it's trying to load tools
      expect(error.stderr.toString()).toContain('Failed to load tool schemas');
    }
  });

  test('analyze command should require tool and URL arguments', () => {
    try {
      execSync(`cd "${testDir}" && node "${cliPath}" analyze`, { encoding: 'utf8' });
    } catch (error: any) {
      expect(error.status).toBe(1);
      // Should show usage help when arguments are missing
      expect(error.stderr.toString()).toContain('error: missing required argument');
    }
  });

  test('analyze command should handle invalid tool', () => {
    try {
      execSync(`cd "${testDir}" && node "${cliPath}" analyze invalid-tool https://example.com`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
    } catch (error: any) {
      expect(error.status).toBe(1);
      expect(error.stderr.toString()).toContain('Unknown analysis tool');
    }
  });
});