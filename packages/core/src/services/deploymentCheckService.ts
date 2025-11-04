import * as path from 'path';
import { DataService, Deployment } from '../data-service.js';
import { DeploymentService, DeploymentDetectionResult, createDeploymentService } from './deploymentService.js';
import { CarbonIntensityService, CarbonRecommendation, createCarbonIntensityService } from './carbonIntensityService.js';
import { BaseAnalyzer } from './baseAnalyzer.js';

export interface DeploymentCheckResult {
  target: string;
  timestamp: string;
  deployments: Array<{
    id: number;
    name: string;
    provider: string;
    environment: string;
    region: string | null;
    country: string | null;
    carbon_intensity: number | null;
    carbon_intensity_source: string | null;
    config_file_path: string | null;
    detection_method: string;
  }>;
  stats: {
    deployment_count: number;
    provider_count: number;
    high_carbon_count: number;
    environment_count: number;
  };
  recommendations: Array<{
    deploymentId: number;
    currentIntensity: number;
    suggestedProvider: string | undefined;
    suggestedRegion: string | undefined;
    potentialSavings: number | undefined;
    reasoning: string;
  }>;
}

export interface DeploymentCheckOptions {
  dbPath?: string;
}

/**
 * Service for running deployment checks and analyzing carbon intensity
 * of deployment configurations.
 */
export class DeploymentCheckService extends BaseAnalyzer<string, DeploymentCheckResult> {
  private dataService: DataService;
  private deploymentService: DeploymentService;
  private carbonService: CarbonIntensityService;

  constructor(dataService: DataService) {
    super();
    this.dataService = dataService;
    this.deploymentService = createDeploymentService(dataService);
    this.carbonService = createCarbonIntensityService(dataService);
  }

  /**
   * Run a deployment check on a directory
   * @param dirPath Directory path to scan for deployment configurations
   * @returns Deployment check results with statistics and recommendations
   */
  async analyze(dirPath: string): Promise<DeploymentCheckResult> {
    const resolvedPath = path.resolve(dirPath);
    
    // Scan directory for deployments
    const detections = await this.deploymentService.scanDirectory(resolvedPath);
    
    // If no deployments found, return empty result
    if (detections.length === 0) {
      return {
        target: resolvedPath,
        timestamp: new Date().toISOString(),
        deployments: [],
        stats: {
          deployment_count: 0,
          provider_count: 0,
          high_carbon_count: 0,
          environment_count: 0
        },
        recommendations: []
      };
    }
    
    // Save deployments first (they need IDs for carbon intensity updates)
    const deploymentIds = await this.deploymentService.saveDeployments(detections);
    
    // Update carbon intensities
    await this.carbonService.updateDeploymentCarbonIntensities();
    
    // Get all deployments with updated carbon intensities
    const allDeployments = await this.dataService.getAllDeployments();
    const detectedDeployments = allDeployments.filter(d => 
      deploymentIds.includes(d.id)
    );
    
    // Get recommendations
    const recommendations = await this.carbonService.getRecommendations();
    
    // Format results
    const providers = [...new Set(detectedDeployments.map(d => d.provider))];
    const highCarbonThreshold = 400; // gCO2/kWh - threshold for high carbon
    const highCarbonDeployments = detectedDeployments.filter(d => 
      d.carbon_intensity && d.carbon_intensity > highCarbonThreshold
    );
    
    return {
      target: resolvedPath,
      timestamp: new Date().toISOString(),
      deployments: detectedDeployments.map(d => ({
        id: d.id,
        name: d.name,
        provider: d.provider,
        environment: d.environment,
        region: d.region,
        country: d.country,
        carbon_intensity: d.carbon_intensity,
        carbon_intensity_source: d.carbon_intensity_source,
        config_file_path: d.config_file_path,
        detection_method: d.detection_method
      })),
      stats: {
        deployment_count: detectedDeployments.length,
        provider_count: providers.length,
        high_carbon_count: highCarbonDeployments.length,
        environment_count: [...new Set(detectedDeployments.map(d => d.environment))].length
      },
      recommendations: recommendations.map(r => ({
        deploymentId: r.deploymentId,
        currentIntensity: r.currentIntensity,
        suggestedProvider: r.suggestedProvider,
        suggestedRegion: r.suggestedRegion,
        potentialSavings: r.potentialSavings,
        reasoning: r.notes
      }))
    };
  }
}

/**
 * Factory function to create a DeploymentCheckService
 */
export const createDeploymentCheckService = (dataService: DataService) => 
  new DeploymentCheckService(dataService);

