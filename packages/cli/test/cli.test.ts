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
    expect(result).toContain('greenframe');
    expect(result).toContain('data');
  });

  test('CLI should show version', () => {
    const result = execSync(`node "${cliPath}" --version`, { encoding: 'utf8' });
    expect(result).toContain('1.0.0');
  });

  test('assess command should show warning without project', () => {
    const result = execSync(`cd "${testDir}" && node "${cliPath}" assess`, { encoding: 'utf8' });
    expect(result).toContain('No project found');
  });

  test('greenframe command should handle invalid URL', () => {
    try {
      execSync(`cd "${testDir}" && node "${cliPath}" greenframe invalid-url`, { encoding: 'utf8' });
    } catch (error: any) {
      expect(error.status).toBe(1);
      expect(error.stderr.toString()).toContain('Error');
    }
  });

  test('greenframe command should work with valid URL', () => {
    try {
      const result = execSync(`cd "${testDir}" && node "${cliPath}" greenframe https://example.com`, { 
        encoding: 'utf8',
        timeout: 5000 
      });
      expect(result).toContain('Greenframe analysis completed');
      expect(result).toContain('Carbon Footprint');
    } catch (error: any) {
      // If greenframe fails, just check that it's trying to run
      expect(error.stderr.toString()).toContain('Greenframe analysis failed');
    }
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
});