import { describe, test, expect, vi } from 'vitest';
import { checkPrerequisite, checkPrerequisites, type Prerequisite } from '../src/utils/prerequisites.js';
import { execaCommand } from 'execa';

// Mock execaCommand
vi.mock('execa', () => ({
  execaCommand: vi.fn()
}));

describe('Prerequisites', () => {
  describe('checkPrerequisite', () => {
    test('should return available=true when command succeeds', async () => {
      const mockExecaCommand = execaCommand as any;
      mockExecaCommand.mockResolvedValue({
        exitCode: 0,
        stdout: 'success',
        stderr: ''
      });

      const prerequisite: Prerequisite = {
        type: 'command',
        name: 'Test Tool',
        checkCommand: 'test-command --version',
        errorMessage: 'Test tool not found'
      };

      const result = await checkPrerequisite(prerequisite);

      expect(result.available).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('should return available=false when command not found (exit code 127)', async () => {
      const mockExecaCommand = execaCommand as any;
      mockExecaCommand.mockResolvedValue({
        exitCode: 127,
        stdout: '',
        stderr: 'command not found'
      });

      const prerequisite: Prerequisite = {
        type: 'command',
        name: 'Test Tool',
        checkCommand: 'nonexistent-command',
        errorMessage: 'Test tool not found'
      };

      const result = await checkPrerequisite(prerequisite);

      expect(result.available).toBe(false);
      expect(result.error).toBe('Test tool not found');
    });

    test('should return available=false when command fails (non-zero exit code)', async () => {
      const mockExecaCommand = execaCommand as any;
      mockExecaCommand.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'error'
      });

      const prerequisite: Prerequisite = {
        type: 'command',
        name: 'Test Tool',
        checkCommand: 'failing-command',
        errorMessage: 'Test tool failed'
      };

      const result = await checkPrerequisite(prerequisite);

      expect(result.available).toBe(false);
      expect(result.error).toBe('Test tool failed');
    });

    test('should validate expectedOutput when provided', async () => {
      const mockExecaCommand = execaCommand as any;
      mockExecaCommand.mockResolvedValue({
        exitCode: 0,
        stdout: 'already installed',
        stderr: ''
      });

      const prerequisite: Prerequisite = {
        type: 'puppeteer',
        name: 'Puppeteer Browsers',
        checkCommand: 'npx puppeteer browsers install --dry-run chrome',
        expectedOutput: 'already installed',
        errorMessage: 'Puppeteer browsers not installed'
      };

      const result = await checkPrerequisite(prerequisite);

      expect(result.available).toBe(true);
    });

    test('should return available=false when expectedOutput does not match', async () => {
      const mockExecaCommand = execaCommand as any;
      mockExecaCommand.mockResolvedValue({
        exitCode: 0,
        stdout: 'not installed',
        stderr: ''
      });

      const prerequisite: Prerequisite = {
        type: 'puppeteer',
        name: 'Puppeteer Browsers',
        checkCommand: 'npx puppeteer browsers install --dry-run chrome',
        expectedOutput: 'already installed',
        errorMessage: 'Puppeteer browsers not installed'
      };

      const result = await checkPrerequisite(prerequisite);

      expect(result.available).toBe(false);
      expect(result.error).toBe('Puppeteer browsers not installed');
    });

    test('should handle exceptions gracefully', async () => {
      const mockExecaCommand = execaCommand as any;
      mockExecaCommand.mockRejectedValue(new Error('Unexpected error'));

      const prerequisite: Prerequisite = {
        type: 'command',
        name: 'Test Tool',
        checkCommand: 'test-command',
        errorMessage: 'Test tool error'
      };

      const result = await checkPrerequisite(prerequisite);

      expect(result.available).toBe(false);
      expect(result.error).toBe('Test tool error');
    });
  });

  describe('checkPrerequisites', () => {
    test('should return allAvailable=true when all prerequisites are available', async () => {
      const mockExecaCommand = execaCommand as any;
      mockExecaCommand.mockResolvedValue({
        exitCode: 0,
        stdout: 'success',
        stderr: ''
      });

      const prerequisites: Prerequisite[] = [
        {
          type: 'command',
          name: 'Tool 1',
          checkCommand: 'tool1 --version',
          errorMessage: 'Tool 1 not found'
        },
        {
          type: 'command',
          name: 'Tool 2',
          checkCommand: 'tool2 --version',
          errorMessage: 'Tool 2 not found'
        }
      ];

      const result = await checkPrerequisites(prerequisites);

      expect(result.allAvailable).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    test('should return allAvailable=false when some prerequisites are missing', async () => {
      const mockExecaCommand = execaCommand as any;
      mockExecaCommand
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'success',
          stderr: ''
        })
        .mockResolvedValueOnce({
          exitCode: 127,
          stdout: '',
          stderr: 'command not found'
        });

      const prerequisites: Prerequisite[] = [
        {
          type: 'command',
          name: 'Tool 1',
          checkCommand: 'tool1 --version',
          errorMessage: 'Tool 1 not found'
        },
        {
          type: 'command',
          name: 'Tool 2',
          checkCommand: 'tool2 --version',
          errorMessage: 'Tool 2 not found'
        }
      ];

      const result = await checkPrerequisites(prerequisites);

      expect(result.allAvailable).toBe(false);
      expect(result.missing).toHaveLength(1);
      expect(result.missing[0].prerequisite.name).toBe('Tool 2');
      expect(result.missing[0].error).toBe('Tool 2 not found');
    });

    test('should return allAvailable=false when all prerequisites are missing', async () => {
      const mockExecaCommand = execaCommand as any;
      mockExecaCommand.mockResolvedValue({
        exitCode: 127,
        stdout: '',
        stderr: 'command not found'
      });

      const prerequisites: Prerequisite[] = [
        {
          type: 'command',
          name: 'Tool 1',
          checkCommand: 'tool1 --version',
          errorMessage: 'Tool 1 not found'
        },
        {
          type: 'command',
          name: 'Tool 2',
          checkCommand: 'tool2 --version',
          errorMessage: 'Tool 2 not found'
        }
      ];

      const result = await checkPrerequisites(prerequisites);

      expect(result.allAvailable).toBe(false);
      expect(result.missing).toHaveLength(2);
    });

    test('should handle empty prerequisites array', async () => {
      const prerequisites: Prerequisite[] = [];

      const result = await checkPrerequisites(prerequisites);

      expect(result.allAvailable).toBe(true);
      expect(result.missing).toHaveLength(0);
    });
  });
});













