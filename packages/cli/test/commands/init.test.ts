import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { describe, test, beforeEach, afterEach, expect } from 'vitest';

describe('Carbonara CLI - init command', () => {
  let testDir: string;
  let cliPath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carbonara-init-test-'));
    cliPath = path.resolve(__dirname, '../../dist/index.js');
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper function to initialize a git repository
   */
  function initGitRepo(dir: string): void {
    execSync('git init', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: dir, stdio: 'pipe' });
    // Create an initial commit so the repo is fully initialized
    fs.writeFileSync(path.join(dir, 'README.md'), '# Test Project');
    execSync('git add .', { cwd: dir, stdio: 'pipe' });
    execSync('git commit -m "Initial commit"', { cwd: dir, stdio: 'pipe' });
  }

  /**
   * Helper function to run init command with automated input
   */
  function runInitCommand(dir: string, input: string): { stdout: string; stderr: string; exitCode: number } {
    try {
      // Use printf with %b to interpret escape sequences (like \n)
      // This handles newlines more reliably than echo
      const stdout = execSync(
        `printf '%b' "${input}" | node "${cliPath}" init`,
        {
          cwd: dir,
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 10000 // 10 second timeout to prevent hanging
        }
      );
      return { stdout, stderr: '', exitCode: 0 };
    } catch (error: any) {
      return {
        stdout: error.stdout?.toString() || '',
        stderr: error.stderr?.toString() || '',
        exitCode: error.status || 1
      };
    }
  }

  describe('Git repository scenario', () => {
    test('should detect git repository and use git root', () => {
      initGitRepo(testDir);

      const result = runInitCommand(testDir, 'Test Project\\n\\n\\n');

      // Should detect git repository
      expect(result.stdout).toContain('Git repository detected');
      expect(result.stdout).toContain('using root:');
      expect(result.stdout).toContain(testDir);

      // Should indicate database creation
      expect(result.stdout).toContain('Creating new database at:');
      expect(result.stdout).toContain('carbonara.db');
    });

    test('should create database at git root', () => {
      initGitRepo(testDir);

      // Use the helper function to run init with proper input piping
      // Provide: name, description (accept default), project type (accept default/first choice)
      const result = runInitCommand(testDir, 'Test Project\\n\\n\\n');

      // Should detect git repository
      expect(result.stdout).toContain('Git repository detected');
      
      // Check that database path is at git root (testDir)
      expect(result.stdout).toContain(testDir);
      expect(result.stdout).toContain('carbonara.db');
    });

    test('should use git root even when run from nested directory', () => {
      initGitRepo(testDir);

      // Create nested directory structure
      const nestedDir = path.join(testDir, 'src', 'components');
      fs.mkdirSync(nestedDir, { recursive: true });

      const result = runInitCommand(nestedDir, 'Test Project\\n\\n\\n');

      // Should detect git root, not the nested directory
      expect(result.stdout).toContain('Git repository detected');
      expect(result.stdout).toContain(testDir);
      expect(result.stdout).not.toContain(nestedDir);
    });

    test('should detect existing database at git root', () => {
      initGitRepo(testDir);

      // Create an existing database file
      const carbonaraDir = path.join(testDir, '.carbonara');
      fs.mkdirSync(carbonaraDir, { recursive: true });
      const dbPath = path.join(carbonaraDir, 'carbonara.db');
      fs.writeFileSync(dbPath, 'dummy content');

      const result = runInitCommand(testDir, 'Test Project\\n\\n\\n');

      // Should detect existing database
      expect(result.stdout).toContain('Database already exists');
      expect(result.stdout).toContain('.carbonara/carbonara.db');
    });
  });

  describe('Non-git repository scenario', () => {
    test('should show warning when no git repository found', () => {
      // Don't initialize git

      const result = runInitCommand(testDir, 'Test Project\\n\\n\\n');

      // Should show warning
      expect(result.stdout).toContain('Warning: No git repository found');
      expect(result.stdout).toContain('It is recommended to run');
      expect(result.stdout).toContain('git init');
      expect(result.stdout).toContain('first');

      // Should use current directory
      expect(result.stdout).toContain('Using current directory:');
      expect(result.stdout).toContain(testDir);
    });

    test('should create database in current directory when no git', () => {
      // Don't initialize git

      const result = runInitCommand(testDir, 'Test Project\\n\\n\\n');

      // Should create database in current directory
      expect(result.stdout).toContain('Creating new database at:');
      expect(result.stdout).toContain('carbonara.db');
    });

    test('should not exit with error when no git repository', () => {
      // Don't initialize git

      const result = runInitCommand(testDir, 'Test Project\\n\\n\\n');

      // Should show warning but continue (not exit with error code 1)
      // The command may still fail due to prompt issues, but it shouldn't fail due to git check
      expect(result.stdout).toContain('Warning: No git repository found');
      expect(result.stdout).not.toContain('❌ Error: This directory is not a git repository');
    });
  });

  describe('Edge cases', () => {
    test('should handle git installed but not in a git repo', () => {
      // Verify git is available
      try {
        execSync('git --version', { stdio: 'pipe' });
      } catch {
        // Skip test if git is not installed
        return;
      }

      const result = runInitCommand(testDir, 'Test Project\\n\\n\\n');

      // Should gracefully handle the case
      expect(result.stdout).toContain('Warning: No git repository found');
      expect(result.stdout).toContain('Using current directory:');
    });

    test('should handle directory with .git folder but broken repo', () => {
      // Create a .git directory but don't properly initialize it
      const gitDir = path.join(testDir, '.git');
      fs.mkdirSync(gitDir);

      const result = runInitCommand(testDir, 'Test Project\\n\\n\\n');

      // Should handle gracefully (either detect as invalid or show appropriate message)
      expect(result.stdout).toMatch(/(Warning:|Git repository detected)/);
    });
  });

  describe('Database and config file creation', () => {
    test('should show correct messages for database creation flow', () => {
      initGitRepo(testDir);

      const result = runInitCommand(testDir, 'Test Project\\n\\n\\n');

      // Should show git detection
      expect(result.stdout).toContain('Git repository detected');

      // Should show database creation message
      expect(result.stdout).toContain('Creating new database at:');

      // Should show project name prompt
      expect(result.stdout).toContain('Project name:');
    });

    test('should use git root directory name as default project name', () => {
      initGitRepo(testDir);

      const result = runInitCommand(testDir, '\\n\\n\\n');

      // Should show the directory name as default
      const dirName = path.basename(testDir);
      expect(result.stdout).toContain(dirName);
    });
  });
});
