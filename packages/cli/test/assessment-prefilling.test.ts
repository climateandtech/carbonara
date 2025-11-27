import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load the actual assessment schema and build Zod schema from it
const schemaPath = path.join(__dirname, '../schemas/assessment-questionnaire.json');
const assessmentSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

// Import the schema builder function
import { z } from 'zod';

function buildZodSchemaFromJson(jsonSchema: any): z.ZodObject<any> {
  const shape: any = {};

  for (const [sectionId, sectionDef] of Object.entries(jsonSchema.properties || {})) {
    const section: any = sectionDef;
    const sectionShape: any = {};

    for (const [fieldId, fieldDef] of Object.entries(section.properties || {})) {
      const field: any = fieldDef;
      let zodType: any;

      if (field.type === "boolean") {
        zodType = z.boolean();
      } else if (field.type === "integer" || field.type === "number") {
        zodType = z.number();
        if (field.minimum !== undefined) zodType = zodType.min(field.minimum);
        if (field.maximum !== undefined) zodType = zodType.max(field.maximum);
      } else if (field.type === "string") {
        if (field.options && field.options.length > 0) {
          const enumValues = field.options.map((opt: any) => opt.value);
          zodType = z.enum(enumValues as [string, ...string[]]);
        } else {
          zodType = z.string();
        }
      } else {
        zodType = z.any();
      }

      const isRequired = section.required?.includes(fieldId);
      if (!isRequired) {
        zodType = zodType.optional();
      }

      sectionShape[fieldId] = zodType;
    }

    shape[sectionId] = z.object(sectionShape);
  }

  return z.object(shape);
}

const CO2AssessmentSchema = buildZodSchemaFromJson(assessmentSchema);

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
      projectOverview: {
        expectedUsers: 'fewer-than-50',
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
      featuresAndWorkload: {
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
      projectOverview: {
        expectedUsers: 'fewer-than-50',
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
      featuresAndWorkload: {
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
      projectOverview: { expectedUsers: 'fewer-than-50', expectedTraffic: 'medium', targetAudience: 'national', projectLifespan: 24 },
      infrastructure: { hostingType: 'cloud', cloudProvider: 'AWS', serverLocation: 'same-continent', dataStorage: 'moderate', backupStrategy: 'daily' },
      development: { teamSize: 5, developmentDuration: 12, cicdPipeline: true, testingStrategy: 'comprehensive', codeQuality: 'good' },
      featuresAndWorkload: { realTimeFeatures: false, mediaProcessing: true, aiMlFeatures: false, blockchainIntegration: false, iotIntegration: false },
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
      projectOverview: { expectedUsers: 'fewer-than-50', expectedTraffic: 'medium', targetAudience: 'national', projectLifespan: 24 },
      infrastructure: { hostingType: 'cloud', cloudProvider: 'AWS', serverLocation: 'same-continent', dataStorage: 'moderate', backupStrategy: 'daily' },
      development: { teamSize: 5, developmentDuration: 12, cicdPipeline: true, testingStrategy: 'comprehensive', codeQuality: 'good' },
      featuresAndWorkload: { realTimeFeatures: false, mediaProcessing: true, aiMlFeatures: false, blockchainIntegration: false, iotIntegration: false },
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
