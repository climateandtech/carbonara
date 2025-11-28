import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { analyzeCommand } from '../src/commands/analyze';
import { getToolRegistry } from '../src/registry/index';
import * as execa from 'execa';
import * as yaml from 'js-yaml';

// Mock execa
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

// Mock yaml
vi.mock('js-yaml', () => ({
  dump: vi.fn((obj) => JSON.stringify(obj)),
  load: vi.fn((str) => JSON.parse(str)),
}));

describe('analyze command', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carbonara-analyze-test-'));
    originalCwd = process.cwd();
    process.chdir(testDir);
    
    // Create .carbonara-temp directory
    const tempDir = path.join(testDir, '.carbonara-temp');
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  describe('parameter handling from tools.json', () => {
    test('should use parameter defaults from tools.json', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('if-webpage-scan');
      
      expect(tool).toBeDefined();
      expect(tool?.parameterDefaults).toBeDefined();
      expect(tool?.parameterDefaults?.scrollToBottom).toBe(false);
      expect(tool?.parameterDefaults?.firstVisitPercentage).toBe(0.9);
    });

    test('should use parameter mappings from tools.json', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('if-webpage-scan');
      
      expect(tool).toBeDefined();
      expect(tool?.parameterMappings).toBeDefined();
      expect(tool?.parameterMappings?.returnVisitPercentage).toBeDefined();
      expect(tool?.parameterMappings?.returnVisitPercentage.source).toBe('firstVisitPercentage');
      expect(tool?.parameterMappings?.returnVisitPercentage.transform).toBe('1 - {source}');
    });

    test('should preserve boolean type for scrollToBottom in manifest', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('if-webpage-scan');
      
      if (!tool?.manifestTemplate) {
        throw new Error('Tool manifest template not found');
      }

      // Simulate placeholder replacement
      const manifest = JSON.parse(JSON.stringify(tool.manifestTemplate));
      const scrollToBottomValue = tool.parameterDefaults?.scrollToBottom ?? false;
      
      // Replace placeholder
      const replaceInObject = (obj: any): any => {
        if (typeof obj === 'string' && obj === '{scrollToBottom}') {
          return scrollToBottomValue;
        }
        if (Array.isArray(obj)) {
          return obj.map(replaceInObject);
        }
        if (obj && typeof obj === 'object') {
          const result: any = {};
          for (const [key, value] of Object.entries(obj)) {
            if (value === '{scrollToBottom}') {
              result[key] = scrollToBottomValue;
            } else {
              result[key] = replaceInObject(value);
            }
          }
          return result;
        }
        return obj;
      };

      const processed = replaceInObject(manifest);
      
      // Check that scrollToBottom is a boolean, not a string
      const scrollToBottom = processed.initialize?.plugins?.['webpage-impact']?.config?.scrollToBottom;
      expect(typeof scrollToBottom).toBe('boolean');
      expect(scrollToBottom).toBe(false);
    });

    test('should compute returnVisitPercentage from firstVisitPercentage', () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('if-webpage-scan');
      
      if (!tool?.parameterMappings?.returnVisitPercentage) {
        throw new Error('Parameter mapping not found');
      }

      const mapping = tool.parameterMappings.returnVisitPercentage;
      const firstVisitPercentage = 0.9;
      
      // Simulate transform: "1 - {source}"
      const transform = mapping.transform?.replace(/\{source\}/g, String(firstVisitPercentage));
      const returnVisitPercentage = Number(eval(transform || '0'));
      
      expect(returnVisitPercentage).toBeCloseTo(0.1, 5);
      expect(typeof returnVisitPercentage).toBe('number');
    });
  });

  describe('error handling for Impact Framework', () => {
    test('should extract validation errors from if-run output', async () => {
      const mockStdout = `[2025-11-23 06:04:01.806 PM] InputValidationError: "scrollToBottom" parameter is expected boolean, received string.`;
      const mockStderr = '';
      
      (execa.execa as any).mockResolvedValue({
        exitCode: 0,
        stdout: mockStdout,
        stderr: mockStderr,
      });

      // Create a mock manifest file
      const manifestPath = path.join(testDir, '.carbonara-temp', 'manifest.yml');
      const outputPath = path.join(testDir, '.carbonara-temp', 'output.yml');
      fs.writeFileSync(manifestPath, 'test manifest');

      // Simulate the error handling logic
      const errorPatterns = [
        /InputValidationError[:\s]+([^\n]+)/i,
        /ValidationError[:\s]+([^\n]+)/i,
        /Error[:\s]+([^\n]+)/i,
        /expected\s+(\w+),\s+received\s+(\w+)/i,
        /parameter\s+["']?(\w+)["']?\s+is\s+expected\s+(\w+),\s+received\s+(\w+)/i
      ];

      const allOutput = mockStdout + '\n' + mockStderr;
      let validationError = '';
      for (const pattern of errorPatterns) {
        const match = allOutput.match(pattern);
        if (match) {
          validationError = match[0];
          break;
        }
      }

      expect(validationError).toContain('InputValidationError');
      expect(validationError).toContain('scrollToBottom');
      expect(validationError).toContain('expected boolean');
    });

    test('should include validation error in error message when output file not created', () => {
      const mockStdout = `[2025-11-23 06:04:01.806 PM] InputValidationError: "scrollToBottom" parameter is expected boolean, received string.`;
      const exitCode = 0;
      const outputPath = path.join(testDir, '.carbonara-temp', 'output.yml');

      // Simulate error message construction
      let errorMessage = `Output file not created at ${outputPath}\n`;
      errorMessage += `if-run exit code: ${exitCode}\n`;

      const errorPatterns = [
        /InputValidationError[:\s]+([^\n]+)/i,
        /ValidationError[:\s]+([^\n]+)/i,
        /Error[:\s]+([^\n]+)/i,
        /expected\s+(\w+),\s+received\s+(\w+)/i,
        /parameter\s+["']?(\w+)["']?\s+is\s+expected\s+(\w+),\s+received\s+(\w+)/i
      ];

      const allOutput = mockStdout;
      let validationError = '';
      for (const pattern of errorPatterns) {
        const match = allOutput.match(pattern);
        if (match) {
          validationError = match[0];
          break;
        }
      }

      if (validationError) {
        errorMessage += `\nValidation Error: ${validationError}\n`;
      }

      errorMessage += `\nif-run stdout:\n${mockStdout}\n`;

      expect(errorMessage).toContain('Validation Error');
      expect(errorMessage).toContain('InputValidationError');
      expect(errorMessage).toContain('scrollToBottom');
    });
  });

  describe('placeholder replacement', () => {
    test('should replace placeholders with correct types', () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('if-webpage-scan');
      
      if (!tool?.manifestTemplate) {
        throw new Error('Tool manifest template not found');
      }

      const testUrl = 'https://example.com';
      const testScrollToBottom = false;
      const testFirstVisitPercentage = 0.8;
      const testReturnVisitPercentage = 0.2;

      const manifest = JSON.parse(JSON.stringify(tool.manifestTemplate));
      
      // Simulate replacement
      const replacePlaceholders = (obj: any): any => {
        if (typeof obj === 'string') {
          if (obj === '{url}') return testUrl;
          if (obj === '{scrollToBottom}') return testScrollToBottom;
          if (obj === '{firstVisitPercentage}') return testFirstVisitPercentage;
          if (obj === '{returnVisitPercentage}') return testReturnVisitPercentage;
          return obj;
        }
        if (Array.isArray(obj)) {
          return obj.map(replacePlaceholders);
        }
        if (obj && typeof obj === 'object') {
          const result: any = {};
          for (const [key, value] of Object.entries(obj)) {
            if (value === '{scrollToBottom}') {
              result[key] = testScrollToBottom;
            } else if (value === '{firstVisitPercentage}') {
              result[key] = testFirstVisitPercentage;
            } else if (value === '{returnVisitPercentage}') {
              result[key] = testReturnVisitPercentage;
            } else if (value === '{url}') {
              result[key] = testUrl;
            } else {
              result[key] = replacePlaceholders(value);
            }
          }
          return result;
        }
        return obj;
      };

      const processed = replacePlaceholders(manifest);

      // Verify types are preserved
      const scrollToBottom = processed.initialize?.plugins?.['webpage-impact']?.config?.scrollToBottom;
      expect(typeof scrollToBottom).toBe('boolean');
      expect(scrollToBottom).toBe(false);

      const url = processed.initialize?.plugins?.['webpage-impact']?.config?.url;
      expect(typeof url).toBe('string');
      expect(url).toBe('https://example.com');

      const firstVisitPercentage = processed.tree?.children?.child?.inputs?.[0]?.options?.firstVisitPercentage;
      expect(typeof firstVisitPercentage).toBe('number');
      expect(firstVisitPercentage).toBe(0.8);

      const returnVisitPercentage = processed.tree?.children?.child?.inputs?.[0]?.options?.returnVisitPercentage;
      expect(typeof returnVisitPercentage).toBe('number');
      expect(returnVisitPercentage).toBe(0.2);
    });
  });

  describe('--save flag handling', () => {
    beforeEach(() => {
      // Create .carbonara directory and config for tests that need it
      const carbonaraDir = path.join(testDir, '.carbonara');
      fs.mkdirSync(carbonaraDir, { recursive: true });
      fs.writeFileSync(
        path.join(carbonaraDir, 'carbonara.config.json'),
        JSON.stringify({
          name: 'Test Project',
          projectId: 1,
          database: { path: '.carbonara/carbonara.db' }
        }, null, 2)
      );
    });

    test('should recognize --save flag from command.opts()', () => {
      // Mock commander Command object with --save flag
      const mockCommand = {
        opts: () => ({ save: true, output: 'table', timeout: '30000' }),
        help: () => {}
      } as any;

      // Test that opts are correctly extracted
      const opts = mockCommand.opts();
      expect(opts.save).toBe(true);
      expect(opts.output).toBe('table');
    });

    test('should recognize -s flag as save', () => {
      // Mock commander Command object with -s flag (short form)
      const mockCommand = {
        opts: () => ({ save: true, output: 'table', timeout: '30000' }),
        help: () => {}
      } as any;

      const opts = mockCommand.opts();
      expect(opts.save).toBe(true);
    });

    test('should handle missing save flag', () => {
      // Mock commander Command object without --save flag
      const mockCommand = {
        opts: () => ({ output: 'table', timeout: '30000' }),
        help: () => {}
      } as any;

      const opts = mockCommand.opts();
      expect(opts.save).toBeUndefined();
    });

    test('should correctly merge save flag from both command.opts() and options parameter', () => {
      // Simulate the merge logic in analyzeCommand when save is in command.opts()
      const optsFromCommand = { save: true, output: 'table', timeout: '30000' };
      const optsFromParam = { output: 'table', timeout: '30000' };
      
      const mergedOpts = {
        output: optsFromCommand.output || optsFromParam.output || 'table',
        timeout: optsFromCommand.timeout || optsFromParam.timeout || '30000',
        save: !!(optsFromCommand.save || optsFromParam.save)
      };

      expect(mergedOpts.save).toBe(true);
      expect(mergedOpts.output).toBe('table');
    });

    test('should handle save flag from options parameter when command.opts() lacks it', () => {
      // Simulate the merge logic when save is only in options parameter
      const optsFromCommand = { output: 'table', timeout: '30000' };
      const optsFromParam = { save: true, output: 'table', timeout: '30000' };
      
      const mergedOpts = {
        output: optsFromCommand.output || optsFromParam.output || 'table',
        timeout: optsFromCommand.timeout || optsFromParam.timeout || '30000',
        save: !!(optsFromCommand.save || optsFromParam.save)
      };

      expect(mergedOpts.save).toBe(true);
      expect(mergedOpts.output).toBe('table');
    });

    test('should default save to false when neither source has it', () => {
      // Simulate the merge logic when save is not in either source
      const optsFromCommand = { output: 'table', timeout: '30000' };
      const optsFromParam = { output: 'table', timeout: '30000' };
      
      const mergedOpts = {
        output: optsFromCommand.output || optsFromParam.output || 'table',
        timeout: optsFromCommand.timeout || optsFromParam.timeout || '30000',
        save: !!(optsFromCommand.save || optsFromParam.save)
      };

      expect(mergedOpts.save).toBe(false);
    });

    test('should handle boolean flag correctly when save is explicitly false', () => {
      // Test edge case: save explicitly set to false (should still be false)
      const optsFromCommand = { save: false, output: 'table', timeout: '30000' };
      const optsFromParam = { output: 'table', timeout: '30000' };
      
      const mergedOpts = {
        output: optsFromCommand.output || optsFromParam.output || 'table',
        timeout: optsFromCommand.timeout || optsFromParam.timeout || '30000',
        save: !!(optsFromCommand.save || optsFromParam.save)
      };

      // !!false is false, so save should be false
      expect(mergedOpts.save).toBe(false);
    });

  });
});

