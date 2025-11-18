import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

// Recreate the schema for testing
const CO2AssessmentSchema = z.object({
  projectInfo: z.object({
    expectedUsers: z.number().min(1),
    expectedTraffic: z.enum(["low", "medium", "high", "very-high"]),
    targetAudience: z.enum(["local", "national", "global"]),
    projectLifespan: z.number().min(1),
  }),
  infrastructure: z.object({
    hostingType: z.enum(["shared", "vps", "dedicated", "cloud", "hybrid"]),
    cloudProvider: z.string().optional(),
    serverLocation: z.enum(["same-continent", "different-continent", "global-cdn"]),
    dataStorage: z.enum(["minimal", "moderate", "heavy", "massive"]),
    backupStrategy: z.enum(["none", "weekly", "daily", "real-time"]),
  }),
  development: z.object({
    teamSize: z.number().min(1),
    developmentDuration: z.number().min(1),
    cicdPipeline: z.boolean(),
    testingStrategy: z.enum(["minimal", "moderate", "comprehensive"]),
    codeQuality: z.enum(["basic", "good", "excellent"]),
  }),
  features: z.object({
    realTimeFeatures: z.boolean(),
    mediaProcessing: z.boolean(),
    aiMlFeatures: z.boolean(),
    blockchainIntegration: z.boolean(),
    iotIntegration: z.boolean(),
  }),
  sustainabilityGoals: z.object({
    carbonNeutralityTarget: z.boolean(),
    greenHostingRequired: z.boolean(),
    optimizationPriority: z.enum(["performance", "sustainability", "balanced"]),
    budgetForGreenTech: z.enum(["none", "low", "medium", "high"]),
  }),
  hardwareConfig: z.object({
    cpuTdp: z.number().min(1).max(500),
    totalVcpus: z.number().min(1).max(128),
    allocatedVcpus: z.number().min(1).max(64),
    gridCarbonIntensity: z.number().min(1).max(2000),
  }),
  monitoringConfig: z.object({
    enableCpuMonitoring: z.boolean(),
    enableE2eMonitoring: z.boolean(),
    e2eTestCommand: z.string().optional(),
    scrollToBottom: z.boolean(),
    firstVisitPercentage: z.number().min(0).max(1),
  }),
});

describe('Assessment Prefilling', () => {
  const testProjectPath = path.join(process.cwd(), 'test-project');
  const configPath = path.join(testProjectPath, 'carbonara.config.json');
  const dbPath = path.join(testProjectPath, 'carbonara.db');

  beforeEach(() => {
    // Create test project directory
    if (!fs.existsSync(testProjectPath)) {
      fs.mkdirSync(testProjectPath, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test project
    if (fs.existsSync(testProjectPath)) {
      fs.rmSync(testProjectPath, { recursive: true, force: true });
    }
  });

  it('should validate extended assessment schema with new sections', () => {
    const assessmentData = {
      projectInfo: {
        expectedUsers: 1000,
        expectedTraffic: 'medium',
        targetAudience: 'national',
        projectLifespan: 24
      },
      infrastructure: {
        hostingType: 'cloud',
        cloudProvider: 'AWS',
        serverLocation: 'same-continent',
        dataStorage: 'moderate',
        backupStrategy: 'daily'
      },
      development: {
        teamSize: 5,
        developmentDuration: 12,
        cicdPipeline: true,
        testingStrategy: 'comprehensive',
        codeQuality: 'good'
      },
      features: {
        realTimeFeatures: false,
        mediaProcessing: true,
        aiMlFeatures: false,
        blockchainIntegration: false,
        iotIntegration: false
      },
      sustainabilityGoals: {
        carbonNeutralityTarget: true,
        greenHostingRequired: true,
        optimizationPriority: 'sustainability',
        budgetForGreenTech: 'medium'
      },
      hardwareConfig: {
        cpuTdp: 150,
        totalVcpus: 16,
        allocatedVcpus: 4,
        gridCarbonIntensity: 400
      },
      monitoringConfig: {
        enableCpuMonitoring: true,
        enableE2eMonitoring: true,
        e2eTestCommand: 'npx cypress run',
        scrollToBottom: true,
        firstVisitPercentage: 0.8
      }
    };

    // Should not throw
    const validated = CO2AssessmentSchema.parse(assessmentData);
    expect(validated).toBeDefined();
    expect(validated.hardwareConfig.cpuTdp).toBe(150);
    expect(validated.monitoringConfig.enableE2eMonitoring).toBe(true);
  });

  it('should handle missing optional fields in monitoring config', () => {
    const assessmentData = {
      projectInfo: {
        expectedUsers: 1000,
        expectedTraffic: 'medium',
        targetAudience: 'national',
        projectLifespan: 24
      },
      infrastructure: {
        hostingType: 'cloud',
        cloudProvider: 'AWS',
        serverLocation: 'same-continent',
        dataStorage: 'moderate',
        backupStrategy: 'daily'
      },
      development: {
        teamSize: 5,
        developmentDuration: 12,
        cicdPipeline: true,
        testingStrategy: 'comprehensive',
        codeQuality: 'good'
      },
      features: {
        realTimeFeatures: false,
        mediaProcessing: true,
        aiMlFeatures: false,
        blockchainIntegration: false,
        iotIntegration: false
      },
      sustainabilityGoals: {
        carbonNeutralityTarget: true,
        greenHostingRequired: true,
        optimizationPriority: 'sustainability',
        budgetForGreenTech: 'medium'
      },
      hardwareConfig: {
        cpuTdp: 100,
        totalVcpus: 8,
        allocatedVcpus: 2,
        gridCarbonIntensity: 750
      },
      monitoringConfig: {
        enableCpuMonitoring: true,
        enableE2eMonitoring: false,
        // e2eTestCommand is optional and missing
        scrollToBottom: false,
        firstVisitPercentage: 0.9
      }
    };

    // Should not throw
    const validated = CO2AssessmentSchema.parse(assessmentData);
    expect(validated).toBeDefined();
    expect(validated.monitoringConfig.e2eTestCommand).toBeUndefined();
  });

  it('should validate hardware config ranges', () => {
    const baseAssessment = {
      projectInfo: { expectedUsers: 1000, expectedTraffic: 'medium', targetAudience: 'national', projectLifespan: 24 },
      infrastructure: { hostingType: 'cloud', cloudProvider: 'AWS', serverLocation: 'same-continent', dataStorage: 'moderate', backupStrategy: 'daily' },
      development: { teamSize: 5, developmentDuration: 12, cicdPipeline: true, testingStrategy: 'comprehensive', codeQuality: 'good' },
      features: { realTimeFeatures: false, mediaProcessing: true, aiMlFeatures: false, blockchainIntegration: false, iotIntegration: false },
      sustainabilityGoals: { carbonNeutralityTarget: true, greenHostingRequired: true, optimizationPriority: 'sustainability', budgetForGreenTech: 'medium' },
      monitoringConfig: { enableCpuMonitoring: true, enableE2eMonitoring: false, scrollToBottom: false, firstVisitPercentage: 0.9 }
    };

    // Test valid ranges
    expect(() => {
      CO2AssessmentSchema.parse({
        ...baseAssessment,
        hardwareConfig: { cpuTdp: 1, totalVcpus: 1, allocatedVcpus: 1, gridCarbonIntensity: 1 }
      });
    }).not.toThrow();

    expect(() => {
      CO2AssessmentSchema.parse({
        ...baseAssessment,
        hardwareConfig: { cpuTdp: 500, totalVcpus: 128, allocatedVcpus: 64, gridCarbonIntensity: 2000 }
      });
    }).not.toThrow();

    // Test invalid ranges
    expect(() => {
      CO2AssessmentSchema.parse({
        ...baseAssessment,
        hardwareConfig: { cpuTdp: 0, totalVcpus: 1, allocatedVcpus: 1, gridCarbonIntensity: 1 }
      });
    }).toThrow();

    expect(() => {
      CO2AssessmentSchema.parse({
        ...baseAssessment,
        hardwareConfig: { cpuTdp: 1, totalVcpus: 1, allocatedVcpus: 1, gridCarbonIntensity: 0 }
      });
    }).toThrow();
  });

  it('should validate monitoring config ranges', () => {
    const baseAssessment = {
      projectInfo: { expectedUsers: 1000, expectedTraffic: 'medium', targetAudience: 'national', projectLifespan: 24 },
      infrastructure: { hostingType: 'cloud', cloudProvider: 'AWS', serverLocation: 'same-continent', dataStorage: 'moderate', backupStrategy: 'daily' },
      development: { teamSize: 5, developmentDuration: 12, cicdPipeline: true, testingStrategy: 'comprehensive', codeQuality: 'good' },
      features: { realTimeFeatures: false, mediaProcessing: true, aiMlFeatures: false, blockchainIntegration: false, iotIntegration: false },
      sustainabilityGoals: { carbonNeutralityTarget: true, greenHostingRequired: true, optimizationPriority: 'sustainability', budgetForGreenTech: 'medium' },
      hardwareConfig: { cpuTdp: 100, totalVcpus: 8, allocatedVcpus: 2, gridCarbonIntensity: 750 }
    };

    // Test valid ranges
    expect(() => {
      CO2AssessmentSchema.parse({
        ...baseAssessment,
        monitoringConfig: { enableCpuMonitoring: true, enableE2eMonitoring: false, scrollToBottom: false, firstVisitPercentage: 0.0 }
      });
    }).not.toThrow();

    expect(() => {
      CO2AssessmentSchema.parse({
        ...baseAssessment,
        monitoringConfig: { enableCpuMonitoring: true, enableE2eMonitoring: false, scrollToBottom: false, firstVisitPercentage: 1.0 }
      });
    }).not.toThrow();

    // Test invalid ranges
    expect(() => {
      CO2AssessmentSchema.parse({
        ...baseAssessment,
        monitoringConfig: { enableCpuMonitoring: true, enableE2eMonitoring: false, scrollToBottom: false, firstVisitPercentage: -0.1 }
      });
    }).toThrow();

    expect(() => {
      CO2AssessmentSchema.parse({
        ...baseAssessment,
        monitoringConfig: { enableCpuMonitoring: true, enableE2eMonitoring: false, scrollToBottom: false, firstVisitPercentage: 1.1 }
      });
    }).toThrow();
  });
});
