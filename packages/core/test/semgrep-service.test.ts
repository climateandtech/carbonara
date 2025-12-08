import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock execaCommand
vi.mock('execa', () => ({
  execaCommand: vi.fn(),
}));

// Mock fs module - must be before any imports that use it
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  const mockAccess = vi.fn(() => Promise.resolve());
  return {
    ...actual,
    constants: {
      ...(actual as any).constants,
      R_OK: 4,
    },
    statSync: vi.fn(() => ({
      isFile: () => true,
      isDirectory: () => false,
    })),
    access: vi.fn((path, mode, callback) => {
      if (callback) {
        callback(null);
      } else {
        return Promise.resolve();
      }
    }),
    promises: {
      ...(actual as any).promises,
      access: mockAccess,
    },
  };
});

import { createSemgrepService, type SemgrepResult } from '../src/services/semgrepService';
import { execaCommand } from 'execa';
import * as fs from 'fs';

describe('SemgrepService - Parsing Error Handling', () => {
  let semgrepService: ReturnType<typeof createSemgrepService>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Ensure file access always succeeds for tests (for both rulesDir and target files)
    vi.mocked(fs.promises.access).mockImplementation(async () => {
      return Promise.resolve();
    });
    
    semgrepService = createSemgrepService({
      rulesDir: '/mock/rules', // Use a mock rules directory
    });
    
    // Ensure mocks are still set after service creation
    vi.mocked(fs.promises.access).mockImplementation(async () => {
      return Promise.resolve();
    });
  });

  describe('parseSemgrepOutput error handling', () => {
    it('should treat PartialParsing errors as non-fatal when matches exist', async () => {
      const mockStdout = JSON.stringify({
        results: [
          {
            check_id: 'test-rule',
            path: 'test.js',
            start: { line: 1, col: 1 },
            end: { line: 1, col: 10 },
            extra: {
              message: 'Test finding',
              severity: 'WARNING',
            },
          },
        ],
        errors: [
          {
            type: 'PartialParsing',
            message: 'Syntax error at line /path/to/file.html:6: `& Sustainability Platform` was unexpected',
          },
        ],
      });

      vi.mocked(execaCommand).mockResolvedValue({
        exitCode: 2, // Error exit code
        stdout: mockStdout,
        stderr: '',
        command: 'semgrep',
        failed: false,
        timedOut: false,
        isCanceled: false,
        killed: false,
        signal: null,
        signalDescription: null,
        all: undefined,
        shortMessage: '',
        escapedCommand: '',
      } as any);

      // File access is already mocked globally, no need to set it per test

      const result = await semgrepService.analyzeFile('/test/file.js');

      expect(result.success).toBe(true);
      expect(result.matches.length).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('PartialParsing');
    });

    it('should treat Syntax error as non-fatal when matches exist', async () => {
      const mockStdout = JSON.stringify({
        results: [
          {
            check_id: 'test-rule',
            path: 'test.js',
            start: { line: 1, col: 1 },
            end: { line: 1, col: 10 },
            extra: {
              message: 'Test finding',
              severity: 'ERROR',
            },
          },
        ],
        errors: [
          {
            type: 'Error',
            message: 'Syntax error at line /path/to/file.ts:240: `import(\'./threshold-service.js\').MetricThresholds =` was unexpected',
          },
        ],
      });

      vi.mocked(execaCommand).mockResolvedValue({
        exitCode: 2,
        stdout: mockStdout,
        stderr: '',
        command: 'semgrep',
        failed: false,
        timedOut: false,
        isCanceled: false,
        killed: false,
        signal: null,
        signalDescription: null,
        all: undefined,
        shortMessage: '',
        escapedCommand: '',
      } as any);

      const fs = await import('fs');
      vi.spyOn(fs.promises, 'access').mockResolvedValue(undefined);
      vi.spyOn(fs, 'statSync').mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as any);

      const result = await semgrepService.analyzeFile('/test/file.js');

      expect(result.success).toBe(true);
      expect(result.matches.length).toBe(1);
      expect(result.errors.some((e) => e.includes('Syntax error'))).toBe(true);
    });

    it('should treat Unknown language errors as non-fatal when matches exist', async () => {
      const mockStdout = JSON.stringify({
        results: [
          {
            check_id: 'test-rule',
            path: 'test.js',
            start: { line: 1, col: 1 },
            end: { line: 1, col: 10 },
            extra: {
              message: 'Test finding',
              severity: 'INFO',
            },
          },
        ],
        errors: [
          {
            type: 'Error',
            message: 'Unknown language: .xyz',
          },
        ],
      });

      vi.mocked(execaCommand).mockResolvedValue({
        exitCode: 2,
        stdout: mockStdout,
        stderr: '',
        command: 'semgrep',
        failed: false,
        timedOut: false,
        isCanceled: false,
        killed: false,
        signal: null,
        signalDescription: null,
        all: undefined,
        shortMessage: '',
        escapedCommand: '',
      } as any);

      const fs = await import('fs');
      vi.spyOn(fs.promises, 'access').mockResolvedValue(undefined);
      vi.spyOn(fs, 'statSync').mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as any);

      const result = await semgrepService.analyzeFile('/test/file.js');

      expect(result.success).toBe(true);
      expect(result.matches.length).toBe(1);
      expect(result.errors.some((e) => e.includes('Unknown language'))).toBe(true);
    });

    it('should succeed with only parsing errors and no matches (no critical errors)', async () => {
      const mockStdout = JSON.stringify({
        results: [],
        errors: [
          {
            type: 'PartialParsing',
            message: 'Syntax error at line /path/to/file.html:6',
          },
        ],
      });

      vi.mocked(execaCommand).mockResolvedValue({
        exitCode: 2,
        stdout: mockStdout,
        stderr: '',
        command: 'semgrep',
        failed: false,
        timedOut: false,
        isCanceled: false,
        killed: false,
        signal: null,
        signalDescription: null,
        all: undefined,
        shortMessage: '',
        escapedCommand: '',
      } as any);

      const fs = await import('fs');
      vi.spyOn(fs.promises, 'access').mockResolvedValue(undefined);
      vi.spyOn(fs, 'statSync').mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as any);

      const result = await semgrepService.analyzeFile('/test/file.js');

      // Should succeed because there are no critical errors (only parsing errors)
      expect(result.success).toBe(true);
      expect(result.matches.length).toBe(0);
      expect(result.errors.length).toBe(1);
    });

    it('should fail with critical errors and no matches', async () => {
      const mockStdout = JSON.stringify({
        results: [],
        errors: [
          {
            type: 'FatalError',
            message: 'Semgrep CLI is not available',
          },
        ],
      });

      vi.mocked(execaCommand).mockResolvedValue({
        exitCode: 127, // Command not found
        stdout: mockStdout,
        stderr: 'command not found',
        command: 'semgrep',
        failed: false,
        timedOut: false,
        isCanceled: false,
        killed: false,
        signal: null,
        signalDescription: null,
        all: undefined,
        shortMessage: '',
        escapedCommand: '',
      } as any);

      const fs = await import('fs');
      vi.spyOn(fs.promises, 'access').mockResolvedValue(undefined);
      vi.spyOn(fs, 'statSync').mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as any);

      const result = await semgrepService.analyzeFile('/test/file.js');

      expect(result.success).toBe(false);
      expect(result.matches.length).toBe(0);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('FatalError');
    });

    it('should succeed with critical errors when matches exist', async () => {
      const mockStdout = JSON.stringify({
        results: [
          {
            check_id: 'test-rule',
            path: 'test.js',
            start: { line: 1, col: 1 },
            end: { line: 1, col: 10 },
            extra: {
              message: 'Test finding',
              severity: 'WARNING',
            },
          },
        ],
        errors: [
          {
            type: 'FatalError',
            message: 'Some other error occurred',
          },
        ],
      });

      vi.mocked(execaCommand).mockResolvedValue({
        exitCode: 2,
        stdout: mockStdout,
        stderr: '',
        command: 'semgrep',
        failed: false,
        timedOut: false,
        isCanceled: false,
        killed: false,
        signal: null,
        signalDescription: null,
        all: undefined,
        shortMessage: '',
        escapedCommand: '',
      } as any);

      const fs = await import('fs');
      vi.spyOn(fs.promises, 'access').mockResolvedValue(undefined);
      vi.spyOn(fs, 'statSync').mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as any);

      const result = await semgrepService.analyzeFile('/test/file.js');

      // Should succeed because we have matches (matches take precedence)
      expect(result.success).toBe(true);
      expect(result.matches.length).toBe(1);
      expect(result.errors.length).toBe(1);
    });

    it('should handle exit code 0 (success) correctly', async () => {
      const mockStdout = JSON.stringify({
        results: [],
        errors: [],
      });

      vi.mocked(execaCommand).mockResolvedValue({
        exitCode: 0,
        stdout: mockStdout,
        stderr: '',
        command: 'semgrep',
        failed: false,
        timedOut: false,
        isCanceled: false,
        killed: false,
        signal: null,
        signalDescription: null,
        all: undefined,
        shortMessage: '',
        escapedCommand: '',
      } as any);

      const fs = await import('fs');
      vi.spyOn(fs.promises, 'access').mockResolvedValue(undefined);
      vi.spyOn(fs, 'statSync').mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as any);

      const result = await semgrepService.analyzeFile('/test/file.js');

      expect(result.success).toBe(true);
      expect(result.matches.length).toBe(0);
      expect(result.errors.length).toBe(0);
    });

    it('should handle exit code 1 (findings found) correctly', async () => {
      const mockStdout = JSON.stringify({
        results: [
          {
            check_id: 'test-rule',
            path: 'test.js',
            start: { line: 1, col: 1 },
            end: { line: 1, col: 10 },
            extra: {
              message: 'Test finding',
              severity: 'WARNING',
            },
          },
        ],
        errors: [],
      });

      vi.mocked(execaCommand).mockResolvedValue({
        exitCode: 1, // Findings found (still success)
        stdout: mockStdout,
        stderr: '',
        command: 'semgrep',
        failed: false,
        timedOut: false,
        isCanceled: false,
        killed: false,
        signal: null,
        signalDescription: null,
        all: undefined,
        shortMessage: '',
        escapedCommand: '',
      } as any);

      const fs = await import('fs');
      vi.spyOn(fs.promises, 'access').mockResolvedValue(undefined);
      vi.spyOn(fs, 'statSync').mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as any);

      const result = await semgrepService.analyzeFile('/test/file.js');

      expect(result.success).toBe(true);
      expect(result.matches.length).toBe(1);
      expect(result.stats.total_matches).toBe(1);
    });

    it('should handle multiple parsing errors correctly', async () => {
      const mockStdout = JSON.stringify({
        results: [
          {
            check_id: 'test-rule',
            path: 'test.js',
            start: { line: 1, col: 1 },
            end: { line: 1, col: 10 },
            extra: {
              message: 'Test finding',
              severity: 'WARNING',
            },
          },
        ],
        errors: [
          {
            type: 'PartialParsing',
            message: 'Syntax error at line /path/to/file1.html:6',
          },
          {
            type: 'Error',
            message: 'Syntax error at line /path/to/file2.md:10',
          },
          {
            type: 'Error',
            message: 'Unknown language: .xyz',
          },
        ],
      });

      vi.mocked(execaCommand).mockResolvedValue({
        exitCode: 2,
        stdout: mockStdout,
        stderr: '',
        command: 'semgrep',
        failed: false,
        timedOut: false,
        isCanceled: false,
        killed: false,
        signal: null,
        signalDescription: null,
        all: undefined,
        shortMessage: '',
        escapedCommand: '',
      } as any);

      const fs = await import('fs');
      vi.spyOn(fs.promises, 'access').mockResolvedValue(undefined);
      vi.spyOn(fs, 'statSync').mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as any);

      const result = await semgrepService.analyzeFile('/test/file.js');

      expect(result.success).toBe(true);
      expect(result.matches.length).toBe(1);
      expect(result.errors.length).toBe(3);
      // All errors should be parsing-related
      expect(result.errors.every((e) => 
        e.includes('PartialParsing') || 
        e.includes('Syntax error') ||
        e.includes('Unknown language')
      )).toBe(true);
    });
  });
});

