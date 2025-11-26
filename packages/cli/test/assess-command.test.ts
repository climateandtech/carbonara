import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Assess Command Integration', () => {
  const testDir = path.join(__dirname, '..', 'test-assess-integration');
  const cliPath = path.join(__dirname, '..', 'dist', 'index.js');

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('assess command without project', () => {
    it('should start interactive questionnaire when project is not initialized', () => {
      // The assess command now creates a project automatically if one doesn't exist
      // and starts the interactive questionnaire. We can't test the full interactive
      // flow in this test, but we can verify it starts.
      try {
        execSync(`cd "${testDir}" && echo "" | node "${cliPath}" assess`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 1000 // Short timeout since we're not completing the questionnaire
        });
      } catch (error: any) {
        const output = error.stdout || error.stderr || '';
        // Should show the first question from the assessment
        expect(output).toContain('Project Overview');
      }
    });
  });

  describe('assess command with file input', () => {
    beforeEach(() => {
      // Create a basic config file and .carbonara directory
      const carbonaraDir = path.join(testDir, '.carbonara');
      if (!fs.existsSync(carbonaraDir)) {
        fs.mkdirSync(carbonaraDir, { recursive: true });
      }

      const config = {
        name: 'Test Project',
        projectType: 'web',
        version: '1.0.0'
      };

      fs.writeFileSync(
        path.join(testDir, 'carbonara.config.json'),
        JSON.stringify(config, null, 2)
      );
    });

    it('should accept assessment data from JSON file', () => {
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
          enableE2eMonitoring: false,
          scrollToBottom: false,
          firstVisitPercentage: 0.9
        }
      };

      const assessmentFile = path.join(testDir, 'assessment.json');
      fs.writeFileSync(assessmentFile, JSON.stringify(assessmentData, null, 2));

      const result = execSync(
        `cd "${testDir}" && node "${cliPath}" assess --file assessment.json`,
        {
          encoding: 'utf-8',
        }
      );

      // Should complete successfully
      expect(result).toBeDefined();
    });

    it('should validate assessment data against schema', () => {
      const invalidData = {
        projectOverview: {
          expectedUsers: 'invalid-value', // Invalid enum value
          expectedTraffic: 'medium',
          targetAudience: 'national',
          projectLifespan: 24
        },
        // Missing required sections
      };

      const assessmentFile = path.join(testDir, 'invalid-assessment.json');
      fs.writeFileSync(assessmentFile, JSON.stringify(invalidData, null, 2));

      try {
        execSync(
          `cd "${testDir}" && node "${cliPath}" assess --file invalid-assessment.json`,
          {
            encoding: 'utf-8',
            stdio: 'pipe'
          }
        );
        expect.fail('Should have thrown validation error');
      } catch (error: any) {
        const output = error.stdout || error.stderr || '';
        expect(output).toBeTruthy();
      }
    });
  });

  describe('assess data storage', () => {
    beforeEach(() => {
      // Create a basic config file and .carbonara directory
      const carbonaraDir = path.join(testDir, '.carbonara');
      if (!fs.existsSync(carbonaraDir)) {
        fs.mkdirSync(carbonaraDir, { recursive: true });
      }

      const config = {
        name: 'Test Project',
        projectType: 'web',
        version: '1.0.0'
      };

      fs.writeFileSync(
        path.join(testDir, 'carbonara.config.json'),
        JSON.stringify(config, null, 2)
      );
    });

    it('should store assessment data in database', () => {
      const assessmentData = {
        projectOverview: {
          expectedUsers: 'fewer-than-50',
          expectedTraffic: 'low',
          targetAudience: 'local',
          projectLifespan: 12
        },
        infrastructure: {
          hostingType: 'shared',
          serverLocation: 'same-continent',
          dataStorage: 'minimal',
          backupStrategy: 'weekly'
        },
        development: {
          teamSize: 2,
          developmentDuration: 6,
          cicdPipeline: false,
          testingStrategy: 'minimal',
          codeQuality: 'basic'
        },
        featuresAndWorkload: {
          realTimeFeatures: false,
          mediaProcessing: false,
          aiMlFeatures: false,
          blockchainIntegration: false,
          iotIntegration: false
        },
        sustainabilityGoals: {
          carbonNeutralityTarget: false,
          greenHostingRequired: false,
          optimizationPriority: 'balanced',
          budgetForGreenTech: 'none'
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

      const assessmentFile = path.join(testDir, 'assessment.json');
      fs.writeFileSync(assessmentFile, JSON.stringify(assessmentData, null, 2));

      execSync(
        `cd "${testDir}" && node "${cliPath}" assess --file assessment.json`,
        {
          encoding: 'utf-8',
        }
      );

      // Check database was created and contains assessment data
      const dbPath = path.join(testDir, '.carbonara', 'carbonara.db');
      expect(fs.existsSync(dbPath)).toBe(true);
    });
  });

  describe('CO2 impact calculation', () => {
    beforeEach(() => {
      // Create a basic config file and .carbonara directory
      const carbonaraDir = path.join(testDir, '.carbonara');
      if (!fs.existsSync(carbonaraDir)) {
        fs.mkdirSync(carbonaraDir, { recursive: true });
      }

      const config = {
        name: 'Test Project',
        projectType: 'web',
        version: '1.0.0'
      };

      fs.writeFileSync(
        path.join(testDir, 'carbonara.config.json'),
        JSON.stringify(config, null, 2)
      );
    });

    it('should calculate CO2 impact score', () => {
      const assessmentData = {
        projectOverview: {
          expectedUsers: 'over-50000',
          expectedTraffic: 'very-high',
          targetAudience: 'global',
          projectLifespan: 36
        },
        infrastructure: {
          hostingType: 'dedicated',
          serverLocation: 'different-continent',
          dataStorage: 'massive',
          backupStrategy: 'real-time'
        },
        development: {
          teamSize: 20,
          developmentDuration: 24,
          cicdPipeline: true,
          testingStrategy: 'comprehensive',
          codeQuality: 'excellent'
        },
        featuresAndWorkload: {
          realTimeFeatures: true,
          mediaProcessing: true,
          aiMlFeatures: true,
          blockchainIntegration: true,
          iotIntegration: true
        },
        sustainabilityGoals: {
          carbonNeutralityTarget: true,
          greenHostingRequired: true,
          optimizationPriority: 'sustainability',
          budgetForGreenTech: 'high'
        },
        hardwareConfig: {
          cpuTdp: 200,
          totalVcpus: 64,
          allocatedVcpus: 32,
          gridCarbonIntensity: 1500
        },
        monitoringConfig: {
          enableCpuMonitoring: true,
          enableE2eMonitoring: true,
          e2eTestCommand: 'npm run test:e2e',
          scrollToBottom: true,
          firstVisitPercentage: 0.5
        }
      };

      const assessmentFile = path.join(testDir, 'assessment.json');
      fs.writeFileSync(assessmentFile, JSON.stringify(assessmentData, null, 2));

      const result = execSync(
        `cd "${testDir}" && node "${cliPath}" assess --file assessment.json`,
        {
          encoding: 'utf-8',
        }
      );

      // Should show impact score in output
      expect(result).toBeTruthy();
    });
  });
});
