import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SemgrepService } from '../src/services/semgrepService';
import { DataService } from '../src/data-service';
import fs from 'fs';
import path from 'path';

describe('SemgrepService Database Integration', () => {
  let semgrepService: SemgrepService;
  let dataService: DataService;
  let testDbPath: string;
  let mockRunCommand: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    testDbPath = path.join('/tmp', `test-semgrep-service-${Date.now()}.db`);
    dataService = new DataService({ dbPath: testDbPath });
    await dataService.initialize();

    // Create SemgrepService with database enabled
    semgrepService = new SemgrepService({
      pythonPath: '/usr/bin/python3',
      runnerPath: '/mock/path/semgrep-runner.py',
      rulesDir: '/mock/rules',
      saveToDatabase: true,
      dataService: dataService,
    });

    // Create mock function
    mockRunCommand = vi.fn();
    // Replace runCommand method on the instance
    (semgrepService as any).runCommand = mockRunCommand;
  });

  afterEach(async () => {
    await dataService.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should store semgrep run when analyzeFile is called with database enabled', async () => {
    // Mock the runCommand to return successful semgrep output
    // The stdout contains the JSON that will be parsed as SemgrepResult
    const mockSemgrepOutput = {
      success: true,
      stdout: JSON.stringify({
        success: true,
        matches: [
          {
            rule_id: 'test.rule.vulnerability',
            severity: 'ERROR',
            path: '/test/file.ts',
            file_path: '/test/file.ts',
            start_line: 10,
            end_line: 12,
            start_column: 5,
            end_column: 20,
            message: 'Test vulnerability',
          },
        ],
        errors: [],
        stats: {
          total_matches: 1,
          error_count: 1,
          warning_count: 0,
          info_count: 0,
          files_scanned: 1,
        },
      }),
      stderr: '',
    };

    // Set up mock to return the output
    mockRunCommand.mockResolvedValue(mockSemgrepOutput);

    const filePath = '/test/file.ts';
    const result = await semgrepService.analyzeFile(filePath);

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.matches).toHaveLength(1);

    // Verify run was stored in database
    const assessmentData = await dataService.getAssessmentData(
      undefined,
      'semgrep'
    );
    expect(assessmentData).toHaveLength(1);
    expect(assessmentData[0].tool_name).toBe('semgrep');
    expect(assessmentData[0].data_type).toBe('code-analysis');
    expect(assessmentData[0].data.target).toBe(filePath);
    expect(assessmentData[0].data.matches).toHaveLength(1);
    expect(assessmentData[0].data.matches[0].rule_id).toBe('vulnerability');
    expect(assessmentData[0].source).toBe('semgrep-service');
  });

  it('should store semgrep run when analyzeDirectory is called', async () => {
    const mockSemgrepOutput = {
      success: true,
      stdout: JSON.stringify({
        success: true,
        matches: [
          {
            rule_id: 'test.rule.issue1',
            severity: 'WARNING',
            path: '/test/dir/file1.ts',
            file_path: '/test/dir/file1.ts',
            start_line: 5,
            end_line: 5,
            start_column: 1,
            end_column: 10,
            message: 'Issue 1',
          },
          {
            rule_id: 'test.rule.issue2',
            severity: 'INFO',
            path: '/test/dir/file2.ts',
            file_path: '/test/dir/file2.ts',
            start_line: 15,
            end_line: 15,
            start_column: 1,
            end_column: 5,
            message: 'Issue 2',
          },
        ],
        errors: [],
        stats: {
          total_matches: 2,
          error_count: 0,
          warning_count: 1,
          info_count: 1,
          files_scanned: 2,
        },
      }),
      stderr: '',
    };

    // Set up mock to return the output
    mockRunCommand.mockReset();
    mockRunCommand.mockResolvedValue(mockSemgrepOutput);

    const dirPath = '/test/dir';
    const result = await semgrepService.analyzeDirectory(dirPath);

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.matches).toHaveLength(2);

    // Verify run was stored
    const assessmentData = await dataService.getAssessmentData(
      undefined,
      'semgrep'
    );
    expect(assessmentData).toHaveLength(1);
    expect(assessmentData[0].data.target).toBe(dirPath);
    expect(assessmentData[0].data.matches).toHaveLength(2);
    expect(assessmentData[0].data.stats.files_scanned).toBe(2);
  });

  it('should not store to database when saveToDatabase is false', async () => {
    // Create service with database disabled
    const serviceWithoutDb = new SemgrepService({
      pythonPath: '/usr/bin/python3',
      runnerPath: '/mock/path/semgrep-runner.py',
      rulesDir: '/mock/rules',
      saveToDatabase: false,
      dataService: null,
    });
    
    // Mock runCommand for this service too
    (serviceWithoutDb as any).runCommand = vi.fn();

    const mockSemgrepOutput = {
      success: true,
      stdout: JSON.stringify({
        success: true,
        matches: [
          {
            rule_id: 'test.rule',
            severity: 'ERROR',
            path: '/test/file.ts',
            file_path: '/test/file.ts',
            start_line: 1,
            end_line: 1,
            start_column: 1,
            end_column: 10,
            message: 'Test',
          },
        ],
        errors: [],
        stats: {
          total_matches: 1,
          error_count: 1,
          warning_count: 0,
          info_count: 0,
          files_scanned: 1,
        },
      }),
      stderr: '',
    };

    (serviceWithoutDb as any).runCommand.mockResolvedValue(mockSemgrepOutput);

    await serviceWithoutDb.analyzeFile('/test/file.ts');

    // Verify nothing was stored
    const assessmentData = await dataService.getAssessmentData(
      undefined,
      'semgrep'
    );
    expect(assessmentData).toHaveLength(0);
  });

  it('should normalize rule_id when storing matches', async () => {
    const mockSemgrepOutput = {
      success: true,
      stdout: JSON.stringify({
        success: true,
        matches: [
          {
            rule_id: 'very.long.rule.path.that.has.many.dots.final-rule-name',
            severity: 'ERROR',
            path: '/test/file.ts',
            file_path: '/test/file.ts',
            start_line: 10,
            end_line: 10,
            start_column: 5,
            end_column: 15,
            message: 'Test',
          },
        ],
        errors: [],
        stats: {
          total_matches: 1,
          error_count: 1,
          warning_count: 0,
          info_count: 0,
          files_scanned: 1,
        },
      }),
      stderr: '',
    };

    mockRunCommand.mockResolvedValue(mockSemgrepOutput);

    await semgrepService.analyzeFile('/test/file.ts');

    // Verify rule_id was normalized
    const assessmentData = await dataService.getAssessmentData(
      undefined,
      'semgrep'
    );
    expect(assessmentData[0].data.matches[0].rule_id).toBe('final-rule-name');
  });
});

