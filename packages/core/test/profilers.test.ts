import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseProfilerAdapter } from '../src/services/profilers/base-adapter.js';
import { PythonProfilerAdapter } from '../src/services/profilers/python-adapter.js';
import { NodeProfilerAdapter } from '../src/services/profilers/node-adapter.js';
import { RubyProfilerAdapter } from '../src/services/profilers/ruby-adapter.js';
import { GoProfilerAdapter } from '../src/services/profilers/go-adapter.js';
import type { CpuProfileResult } from '../src/services/cpu-profiler-service.js';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn(),
  spawn: vi.fn()
}));

// Mock fs
vi.mock('fs', () => ({
  default: {
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      unlink: vi.fn(),
      mkdir: vi.fn(),
      readdir: vi.fn(),
      rm: vi.fn(),
      access: vi.fn()
    }
  }
}));

// Mock os
vi.mock('os', () => ({
  tmpdir: () => '/tmp'
}));

describe('BaseProfilerAdapter', () => {
  class TestAdapter extends BaseProfilerAdapter {
    async checkAvailability(): Promise<boolean> {
      return true;
    }
    async profile(): Promise<CpuProfileResult> {
      return this.createProfileResult([], 100);
    }
    getInstallInstructions(): string {
      return 'Test instructions';
    }
  }

  it('should create profile result with correct structure', () => {
    const adapter = new TestAdapter('test', 'test-app');
    const result = adapter['createProfileResult'](
      [
        {
          file: '/test/file.py',
          line: 10,
          samples: 50,
          percent: 50
        }
      ],
      100,
      { type: 'test', value: 'npm test' }
    );

    expect(result.app).toBe('test-app');
    expect(result.lang).toBe('test');
    expect(result.samples_total).toBe(100);
    expect(result.lines).toHaveLength(1);
    expect(result.scenario).toEqual({ type: 'test', value: 'npm test' });
    expect(result.timestamp).toBeDefined();
  });

  it('should normalize relative file paths', () => {
    const adapter = new TestAdapter('test');
    const absolute = adapter['normalizeFilePath']('/absolute/path/file.py');
    expect(absolute).toBe('/absolute/path/file.py');

    const relative = adapter['normalizeFilePath']('relative/path/file.py', '/base');
    expect(relative).toBe('/base/relative/path/file.py');
  });
});

describe('PythonProfilerAdapter', () => {
  let adapter: PythonProfilerAdapter;

  beforeEach(() => {
    adapter = new PythonProfilerAdapter('test-app');
    vi.clearAllMocks();
  });

  it('should check availability for py-spy', async () => {
    (exec as any).mockImplementation((cmd: string, opts: any, callback: any) => {
      if (cmd.includes('which py-spy')) {
        callback(null, { stdout: '/usr/bin/py-spy' });
      } else {
        callback(null, { stdout: '' });
      }
    });

    const available = await adapter.checkAvailability();
    expect(available).toBe(true);
    expect(adapter['usePySpy']).toBe(true);
  });

  it('should check availability for scalene as fallback', async () => {
    (exec as any).mockImplementation((cmd: string, opts: any, callback: any) => {
      if (cmd.includes('which py-spy')) {
        callback({ code: 1 }, { stdout: '' });
      } else if (cmd.includes('which scalene')) {
        callback(null, { stdout: '/usr/bin/scalene' });
      } else {
        callback(null, { stdout: '' });
      }
    });

    const available = await adapter.checkAvailability();
    expect(available).toBe(true);
    expect(adapter['usePySpy']).toBe(false);
  });

  it('should return false when no profiler is available', async () => {
    (exec as any).mockImplementation((cmd: string, opts: any, callback: any) => {
      callback({ code: 1 }, { stdout: '' });
    });

    const available = await adapter.checkAvailability();
    expect(available).toBe(false);
  });

  it('should parse speedscope profile format', () => {
    const mockData = {
      shared: {
        frames: [
          { file: '/test/file.py', line: 10, name: 'test_function' },
          { file: '/test/file.py', line: 20, name: 'another_function' }
        ]
      },
      profiles: [{
        samples: [
          [0], // Frame 0
          [0, 1], // Frame 0 and 1
          [1] // Frame 1
        ]
      }]
    };

    const lines = adapter['parseSpeedscopeProfile'](mockData);
    expect(lines).toHaveLength(2);
    expect(lines[0].file).toBe('/test/file.py');
    expect(lines[0].line).toBe(10);
    expect(lines[0].samples).toBe(2); // Appears in 2 samples
    expect(lines[0].percent).toBeGreaterThan(0);
  });

  it('should parse Scalene output format', () => {
    const mockOutput = `
/tests/test.py:123: 45.2%
/tests/test.py:456: 30.5%
    `;

    const lines = adapter['parseScaleneOutput'](mockOutput);
    expect(lines).toHaveLength(2);
    expect(lines[0].file).toContain('test.py');
    expect(lines[0].line).toBe(123);
    expect(lines[0].percent).toBe(45.2);
  });

  it('should provide correct install instructions', () => {
    adapter['usePySpy'] = true;
    expect(adapter.getInstallInstructions()).toContain('py-spy');

    adapter['usePySpy'] = false;
    expect(adapter.getInstallInstructions()).toContain('Scalene');
  });
});

describe('NodeProfilerAdapter', () => {
  let adapter: NodeProfilerAdapter;

  beforeEach(() => {
    adapter = new NodeProfilerAdapter('test-app');
    vi.clearAllMocks();
  });

  it('should check availability (always true if node exists)', async () => {
    (exec as any).mockImplementation((cmd: string, opts: any, callback: any) => {
      if (cmd.includes('which node')) {
        callback(null, { stdout: '/usr/bin/node' });
      } else {
        callback(null, { stdout: '' });
      }
    });

    const available = await adapter.checkAvailability();
    expect(available).toBe(true);
  });

  it('should parse CPU profile format', () => {
    const mockData = {
      nodes: [
        {
          callFrame: {
            url: 'file:///test/file.js',
            lineNumber: 9,
            functionName: 'testFunction'
          }
        },
        {
          callFrame: {
            url: 'file:///test/file.js',
            lineNumber: 19,
            functionName: 'anotherFunction'
          }
        }
      ],
      samples: [0, 0, 1],
      timeDeltas: [100, 100, 100]
    };

    const lines = adapter['parseCpuProfile'](mockData);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0].file).toContain('file.js');
    expect(lines[0].line).toBe(10); // lineNumber + 1
  });

  it('should filter out non-file URLs', () => {
    const mockData = {
      nodes: [
        {
          callFrame: {
            url: 'http://example.com/script.js',
            lineNumber: 10,
            functionName: 'test'
          }
        },
        {
          callFrame: {
            url: 'file:///test/file.js',
            lineNumber: 20,
            functionName: 'test'
          }
        }
      ],
      samples: [0, 1],
      timeDeltas: [100, 100]
    };

    const lines = adapter['parseCpuProfile'](mockData);
    // Should only include file:// URLs
    expect(lines.every(l => l.file.startsWith('/'))).toBe(true);
  });
});

describe('RubyProfilerAdapter', () => {
  let adapter: RubyProfilerAdapter;

  beforeEach(() => {
    adapter = new RubyProfilerAdapter('test-app');
    vi.clearAllMocks();
  });

  it('should check availability for rbspy', async () => {
    (exec as any).mockImplementation((cmd: string, opts: any, callback: any) => {
      if (cmd.includes('which rbspy')) {
        callback(null, { stdout: '/usr/bin/rbspy' });
      } else {
        callback(null, { stdout: '' });
      }
    });

    const available = await adapter.checkAvailability();
    expect(available).toBe(true);
    expect(adapter['useRbspy']).toBe(true);
  });

  it('should check availability for stackprof as fallback', async () => {
    (exec as any).mockImplementation((cmd: string, opts: any, callback: any) => {
      if (cmd.includes('which rbspy')) {
        callback({ code: 1 }, { stdout: '' });
      } else if (cmd.includes('which stackprof')) {
        callback(null, { stdout: '/usr/bin/stackprof' });
      } else {
        callback(null, { stdout: '' });
      }
    });

    const available = await adapter.checkAvailability();
    expect(available).toBe(true);
    expect(adapter['useRbspy']).toBe(false);
  });

  it('should parse stackprof output format', () => {
    const mockOutput = `
/tests/test.rb:123: 45.2%
/tests/test.rb:456: 30.5%
    `;

    const lines = adapter['parseStackprofOutput'](mockOutput);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0].file).toContain('test.rb');
    expect(lines[0].percent).toBeGreaterThan(0);
  });
});

describe('GoProfilerAdapter', () => {
  let adapter: GoProfilerAdapter;

  beforeEach(() => {
    adapter = new GoProfilerAdapter('test-app');
    vi.clearAllMocks();
  });

  it('should check availability (true if go exists)', async () => {
    (exec as any).mockImplementation((cmd: string, opts: any, callback: any) => {
      if (cmd.includes('which go')) {
        callback(null, { stdout: '/usr/bin/go' });
      } else {
        callback(null, { stdout: '' });
      }
    });

    const available = await adapter.checkAvailability();
    expect(available).toBe(true);
  });

  it('should parse pprof text output format', () => {
    const mockOutput = `
Showing nodes accounting for 12.34s, 82.3% of 15.00s total
      flat  flat%   sum%        cum   cum%
     4.50s 30.0% 30.0%      4.50s 30.0%  /srv/app/internal/auth/auth.go:112
     3.20s 21.3% 51.3%      3.20s 21.3%  /srv/app/db/queries.go:58
    `;

    const lines = adapter['parsePprofTextOutput'](mockOutput);
    expect(lines).toHaveLength(2);
    expect(lines[0].file).toContain('auth.go');
    expect(lines[0].line).toBe(112);
    expect(lines[0].percent).toBe(30.0);
    expect(lines[0].cpu_ms).toBe(4500);
  });

  it('should handle milliseconds in pprof output', () => {
    const mockOutput = `
     450ms 30.0% 30.0%      450ms 30.0%  /srv/app/test.go:10
    `;

    const lines = adapter['parsePprofTextOutput'](mockOutput);
    expect(lines[0].cpu_ms).toBe(450);
  });
});

describe('Profiler Adapter Error Handling', () => {
  it('should handle missing profiler tools gracefully', async () => {
    const adapter = new PythonProfilerAdapter();
    
    (exec as any).mockImplementation((cmd: string, opts: any, callback: any) => {
      callback({ code: 1 }, { stdout: '' });
    });

    const available = await adapter.checkAvailability();
    expect(available).toBe(false);
  });

  it('should throw error when profiling without available tool', async () => {
    const adapter = new PythonProfilerAdapter();
    
    (exec as any).mockImplementation((cmd: string, opts: any, callback: any) => {
      callback({ code: 1 }, { stdout: '' });
    });

    await expect(adapter.profile('python test.py', 30)).rejects.toThrow();
  });
});

