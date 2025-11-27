// Core services for Carbonara
import { DataService } from './data-service.js';
import { SchemaService } from './schema-service.js';
import { VSCodeDataProvider } from './vscode-data-provider.js';

export {
  DataService,
  DataLake,
  createDataLake,
  type DatabaseConfig,
  type AssessmentDataEntry,
  type Project
} from './data-service.js';
export { SchemaService, type ToolDisplayField, type ToolDisplaySchema, type AnalysisToolSchema } from './schema-service.js';
export { VSCodeDataProvider, type DataGroup, type DataEntry, type DataDetail } from './vscode-data-provider.js';
export { ThresholdService, type BadgeColor, type ThresholdConfig, type MetricThresholds } from './threshold-service.js';

// Semgrep service exports
export {
  SemgrepService,
  createSemgrepService,
  setupBundledEnvironment,
  type SemgrepServiceConfig,
  type SemgrepResult,
  type SemgrepMatch,
  SemgrepSeverity
} from './services/semgrepService.js';

// Deployment service exports
export {
  DeploymentService,
  createDeploymentService,
  type DeploymentDetectionResult,
  type ConfigParser
} from './services/deploymentService.js';

// Factory functions for easy setup
export const createDataService = (config?: { dbPath?: string }) => new DataService(config);
export const createSchemaService = () => new SchemaService();
export const createVSCodeDataProvider = (dataService: DataService, schemaService: SchemaService) => 
  new VSCodeDataProvider(dataService, schemaService);

// Convenience function to set up all services
export const setupCarbonaraCore = async (config?: { dbPath?: string }) => {
  const dataService = createDataService(config);
  const schemaService = createSchemaService();
  const vscodeProvider = createVSCodeDataProvider(dataService, schemaService);
  
  await dataService.initialize();
  await schemaService.loadToolSchemas();
  
  return {
    dataService,
    schemaService,
    vscodeProvider
  };
};
