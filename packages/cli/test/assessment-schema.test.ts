import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Assessment Questionnaire JSON Schema', () => {
  const schemaPath = path.join(__dirname, '../schemas/assessment-questionnaire.json');
  let schema: any;

  it('should exist and be valid JSON', () => {
    expect(fs.existsSync(schemaPath)).toBe(true);
    const content = fs.readFileSync(schemaPath, 'utf-8');
    schema = JSON.parse(content);
    expect(schema).toBeDefined();
  });

  it('should have correct root structure', () => {
    expect(schema.type).toBe('object');
    expect(schema.title).toBe('Assessment Questionnaire Schema');
    expect(schema.properties).toBeDefined();
    expect(schema.required).toBeDefined();
  });

  it('should have all required sections', () => {
    const requiredSections = [
      'projectOverview',
      'infrastructure',
      'development',
      'featuresAndWorkload',
      'sustainabilityGoals',
      'hardwareConfig',
      'monitoringConfig'
    ];

    expect(schema.required).toEqual(requiredSections);

    // Check all sections exist in properties
    requiredSections.forEach(section => {
      expect(schema.properties[section]).toBeDefined();
      expect(schema.properties[section].type).toBe('object');
    });
  });

  it('should have title and description for each section', () => {
    const sections = Object.keys(schema.properties);

    sections.forEach(sectionId => {
      const section = schema.properties[sectionId];
      expect(section.title).toBeDefined();
      expect(section.title.length).toBeGreaterThan(0);
      expect(section.description).toBeDefined();
      expect(section.description.length).toBeGreaterThan(0);
    });
  });

  describe('projectOverview section', () => {
    let section: any;

    it('should have correct structure', () => {
      section = schema.properties.projectOverview;
      expect(section.title).toBe('Project Overview');
      expect(section.required).toEqual(['expectedUsers', 'expectedTraffic', 'targetAudience', 'projectLifespan']);
    });

    it('should have options for select fields', () => {
      expect(section.properties.expectedUsers.options).toBeDefined();
      expect(section.properties.expectedUsers.options.length).toBe(5);
      expect(section.properties.expectedTraffic.options).toBeDefined();
      expect(section.properties.targetAudience.options).toBeDefined();
    });

    it('should have proper option structure with labels and values', () => {
      const userOptions = section.properties.expectedUsers.options;
      userOptions.forEach((opt: any) => {
        expect(opt.label).toBeDefined();
        expect(opt.value).toBeDefined();
        expect(typeof opt.label).toBe('string');
        expect(typeof opt.value).toBe('string');
      });

      // Check specific option has detail field
      const firstOption = userOptions[0];
      expect(firstOption.detail).toBeDefined();
    });

    it('should have correct field types', () => {
      expect(section.properties.expectedUsers.type).toBe('string');
      expect(section.properties.projectLifespan.type).toBe('integer');
    });
  });

  describe('infrastructure section', () => {
    let section: any;

    it('should have correct structure', () => {
      section = schema.properties.infrastructure;
      expect(section.title).toBe('Infrastructure');
      expect(section.required).toContain('hostingType');
      expect(section.required).toContain('serverLocation');
    });

    it('should have cloudProvider as optional', () => {
      expect(section.required).not.toContain('cloudProvider');
      expect(section.properties.cloudProvider).toBeDefined();
    });
  });

  describe('development section', () => {
    let section: any;

    it('should have correct numeric fields', () => {
      section = schema.properties.development;
      expect(section.properties.teamSize.type).toBe('integer');
      expect(section.properties.developmentDuration.type).toBe('integer');
      expect(section.properties.teamSize.minimum).toBe(1);
    });

    it('should have boolean field', () => {
      expect(section.properties.cicdPipeline.type).toBe('boolean');
    });
  });

  describe('featuresAndWorkload section', () => {
    let section: any;

    it('should have correct name (not "features")', () => {
      expect(schema.properties.featuresAndWorkload).toBeDefined();
      expect(schema.properties.features).toBeUndefined();
      section = schema.properties.featuresAndWorkload;
      expect(section.title).toBe('Features and Workload');
    });

    it('should have all boolean fields', () => {
      const fields = ['realTimeFeatures', 'mediaProcessing', 'aiMlFeatures', 'blockchainIntegration', 'iotIntegration'];
      fields.forEach(field => {
        expect(section.properties[field].type).toBe('boolean');
      });
    });
  });

  describe('hardwareConfig section', () => {
    let section: any;

    it('should have correct number fields with ranges', () => {
      section = schema.properties.hardwareConfig;

      expect(section.properties.cpuTdp.type).toBe('number');
      expect(section.properties.cpuTdp.minimum).toBe(1);
      expect(section.properties.cpuTdp.maximum).toBe(500);

      expect(section.properties.totalVcpus.minimum).toBe(1);
      expect(section.properties.totalVcpus.maximum).toBe(128);

      expect(section.properties.allocatedVcpus.minimum).toBe(1);
      expect(section.properties.allocatedVcpus.maximum).toBe(64);

      expect(section.properties.gridCarbonIntensity.minimum).toBe(1);
      expect(section.properties.gridCarbonIntensity.maximum).toBe(2000);
    });

    it('should have default values', () => {
      expect(section.properties.cpuTdp.default).toBe(100);
      expect(section.properties.totalVcpus.default).toBe(8);
      expect(section.properties.allocatedVcpus.default).toBe(2);
      expect(section.properties.gridCarbonIntensity.default).toBe(750);
    });
  });

  describe('monitoringConfig section', () => {
    let section: any;

    it('should have correct structure', () => {
      section = schema.properties.monitoringConfig;
      expect(section.title).toBe('Monitoring Configuration');
    });

    it('should have e2eTestCommand as optional', () => {
      expect(section.required).not.toContain('e2eTestCommand');
      expect(section.properties.e2eTestCommand.type).toBe('string');
    });

    it('should have firstVisitPercentage with correct range', () => {
      expect(section.properties.firstVisitPercentage.type).toBe('number');
      expect(section.properties.firstVisitPercentage.minimum).toBe(0);
      expect(section.properties.firstVisitPercentage.maximum).toBe(1);
      expect(section.properties.firstVisitPercentage.default).toBe(0.9);
    });
  });

  describe('Zod schema generation from JSON', () => {
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

    it('should successfully generate Zod schema from JSON', () => {
      const zodSchema = buildZodSchemaFromJson(schema);
      expect(zodSchema).toBeDefined();
      expect(zodSchema instanceof z.ZodObject).toBe(true);
    });

    it('should validate correct data with generated schema', () => {
      const zodSchema = buildZodSchemaFromJson(schema);

      const validData = {
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
          enableE2eMonitoring: false,
          scrollToBottom: false,
          firstVisitPercentage: 0.9
        }
      };

      const result = zodSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid enum values', () => {
      const zodSchema = buildZodSchemaFromJson(schema);

      const invalidData = {
        projectOverview: {
          expectedUsers: 'invalid-value', // Invalid enum
          expectedTraffic: 'medium',
          targetAudience: 'national',
          projectLifespan: 24
        },
        infrastructure: {
          hostingType: 'cloud',
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
          scrollToBottom: false,
          firstVisitPercentage: 0.9
        }
      };

      const result = zodSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should enforce number ranges from schema', () => {
      const zodSchema = buildZodSchemaFromJson(schema);

      const invalidData = {
        projectOverview: {
          expectedUsers: 'fewer-than-50',
          expectedTraffic: 'medium',
          targetAudience: 'national',
          projectLifespan: 24
        },
        infrastructure: {
          hostingType: 'cloud',
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
          cpuTdp: 600, // Exceeds maximum of 500
          totalVcpus: 8,
          allocatedVcpus: 2,
          gridCarbonIntensity: 750
        },
        monitoringConfig: {
          enableCpuMonitoring: true,
          enableE2eMonitoring: false,
          scrollToBottom: false,
          firstVisitPercentage: 0.9
        }
      };

      const result = zodSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});
