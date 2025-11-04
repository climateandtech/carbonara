import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DataService } from '../src/data-service.js';
import { DeploymentCheckService, createDeploymentCheckService } from '../src/services/deploymentCheckService.js';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('DeploymentCheckService', () => {
  let dataService: DataService;
  let deploymentCheckService: DeploymentCheckService;
  let testDbPath: string;
  let testDir: string;

  beforeEach(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deployment-check-test-'));
    testDbPath = path.join(testDir, 'carbonara.db');
    dataService = new DataService({ dbPath: testDbPath });
    await dataService.initialize();
    deploymentCheckService = createDeploymentCheckService(dataService);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should return empty result when no deployments found', async () => {
    const result = await deploymentCheckService.analyze(testDir);
    expect(result.stats.deployment_count).toBe(0);
  });

  it('should return result with target field', async () => {
    const result = await deploymentCheckService.analyze(testDir);
    expect(result).toHaveProperty('target');
  });

  it('should return result with timestamp field', async () => {
    const result = await deploymentCheckService.analyze(testDir);
    expect(result).toHaveProperty('timestamp');
  });

  it('should return result with deployments array', async () => {
    const result = await deploymentCheckService.analyze(testDir);
    expect(Array.isArray(result.deployments)).toBe(true);
  });

  it('should return result with stats field', async () => {
    const result = await deploymentCheckService.analyze(testDir);
    expect(result).toHaveProperty('stats');
  });

  it('should return result with recommendations array', async () => {
    const result = await deploymentCheckService.analyze(testDir);
    expect(Array.isArray(result.recommendations)).toBe(true);
  });

  it('should return stats with deployment_count field', async () => {
    const result = await deploymentCheckService.analyze(testDir);
    expect(result.stats).toHaveProperty('deployment_count');
  });

  it('should return stats with provider_count field', async () => {
    const result = await deploymentCheckService.analyze(testDir);
    expect(result.stats).toHaveProperty('provider_count');
  });

  it('should return stats with high_carbon_count field', async () => {
    const result = await deploymentCheckService.analyze(testDir);
    expect(result.stats).toHaveProperty('high_carbon_count');
  });

  it('should return stats with environment_count field', async () => {
    const result = await deploymentCheckService.analyze(testDir);
    expect(result.stats).toHaveProperty('environment_count');
  });

  it('should return stats with numeric values', async () => {
    const result = await deploymentCheckService.analyze(testDir);
    expect(typeof result.stats.deployment_count).toBe('number');
    expect(typeof result.stats.provider_count).toBe('number');
    expect(typeof result.stats.high_carbon_count).toBe('number');
    expect(typeof result.stats.environment_count).toBe('number');
  });

  it('should resolve target path to absolute path', async () => {
    const result = await deploymentCheckService.analyze('.');
    expect(path.isAbsolute(result.target)).toBe(true);
  });

  it('should return timestamp as ISO string', async () => {
    const result = await deploymentCheckService.analyze(testDir);
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

