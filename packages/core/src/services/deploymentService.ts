import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { DataService } from '../data-service.js';
import { getGridZoneForRegion, getRegionMapping } from '../data/region-to-grid-mapping.js';

// ES module compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DeploymentDetectionResult {
  name: string;
  environment: string;
  provider: string;
  region: string | null;
  country: string | null;
  grid_zone: string | null;
  carbon_intensity: number | null;
  ip_address: string | null;
  detection_method: string;
  config_file_path: string;
  config_type: string;
  metadata: any;
}

export interface ConfigParser {
  name: string;
  patterns: string[]; // File patterns to match
  parse(filePath: string, content: string): DeploymentDetectionResult[];
}

export class DeploymentService {
  private dataService: DataService;
  private parsers: ConfigParser[] = [];

  constructor(dataService: DataService) {
    this.dataService = dataService;
    this.registerDefaultParsers();
  }

  private registerDefaultParsers() {
    this.parsers.push(new AWSConfigParser());
    this.parsers.push(new TerraformParser());
    this.parsers.push(new GitHubActionsParser());
    this.parsers.push(new HerokuParser());
    this.parsers.push(new VercelParser());
    this.parsers.push(new NetlifyParser());
  }

  registerParser(parser: ConfigParser) {
    this.parsers.push(parser);
  }

  async scanDirectory(dirPath: string): Promise<DeploymentDetectionResult[]> {
    const results: DeploymentDetectionResult[] = [];

    for (const parser of this.parsers) {
      for (const pattern of parser.patterns) {
        const files = this.findFiles(dirPath, pattern);

        for (const file of files) {
          try {
            const content = fs.readFileSync(file, 'utf-8');
            const detections = parser.parse(file, content);
            results.push(...detections);
          } catch (error) {
            console.error(`Error parsing ${file}:`, error);
          }
        }
      }
    }

    // Enrich results with grid zone and carbon intensity data
    return results.map(deployment => this.enrichDeploymentWithCarbonData(deployment));
  }

  /**
   * Enrich a deployment with grid zone and carbon intensity information
   */
  private enrichDeploymentWithCarbonData(deployment: DeploymentDetectionResult): DeploymentDetectionResult {
    if (!deployment.provider || !deployment.region) {
      return deployment;
    }

    const mapping = getRegionMapping(deployment.provider, deployment.region);
    if (!mapping) {
      return deployment;
    }

    // Load carbon intensity from YAML file
    const carbonIntensity = this.getCarbonIntensityForGridZone(mapping.gridZone);

    return {
      ...deployment,
      grid_zone: mapping.gridZone,
      carbon_intensity: carbonIntensity,
      metadata: {
        ...deployment.metadata,
        grid_mapping: {
          grid_zone: mapping.gridZone,
          location: mapping.location,
          notes: mapping.notes
        }
      }
    };
  }

  /**
   * Get carbon intensity for a specific grid zone from JSON data
   */
  private getCarbonIntensityForGridZone(gridZone: string): number | null {
    try {
      const jsonPath = path.join(__dirname, '../data/electricity_zones.json');
      const fileContents = fs.readFileSync(jsonPath, 'utf8');
      const zones = JSON.parse(fileContents) as Array<{ zone_key: string; average_co2: number }>;

      const zone = zones.find(z => z.zone_key === gridZone);
      return zone ? zone.average_co2 : null;
    } catch (error) {
      console.error('Error loading carbon intensity data:', error);
      return null;
    }
  }

  async saveDeployments(detections: DeploymentDetectionResult[], projectId?: number, source?: string): Promise<number[]> {
    const ids: number[] = [];

    // Store all detections as a single assessment_data entry
    if (detections.length > 0) {
      const assessmentData = {
        deployments: detections,
        total_count: detections.length,
        providers: [...new Set(detections.map(d => d.provider))],
        environments: [...new Set(detections.map(d => d.environment))],
        scan_summary: {
          total_deployments: detections.length,
          by_provider: this.groupByProvider(detections),
          by_environment: this.groupByEnvironment(detections),
          config_types: [...new Set(detections.map(d => d.config_type))]
        }
      };

      const id = await this.dataService.storeAssessmentData(
        projectId,
        'deployment-scan',
        'infrastructure-analysis',
        assessmentData,
        source
      );
      ids.push(id);
    }

    return ids;
  }

  private groupByProvider(detections: DeploymentDetectionResult[]): Record<string, number> {
    return detections.reduce((acc, d) => {
      acc[d.provider] = (acc[d.provider] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private groupByEnvironment(detections: DeploymentDetectionResult[]): Record<string, number> {
    return detections.reduce((acc, d) => {
      acc[d.environment] = (acc[d.environment] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private findFiles(dirPath: string, pattern: string): string[] {
    const results: string[] = [];
    const stack = [dirPath];

    // Simple glob pattern matching (basic implementation)
    const patternRegex = this.globToRegex(pattern);

    while (stack.length > 0) {
      const currentPath = stack.pop()!;

      try {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);

          // Skip node_modules and hidden directories
          if (entry.isDirectory()) {
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
              stack.push(fullPath);
            }
          } else if (entry.isFile()) {
            const relativePath = path.relative(dirPath, fullPath);
            if (patternRegex.test(relativePath)) {
              results.push(fullPath);
            }
          }
        }
      } catch (error) {
        // Skip directories we can't read
        continue;
      }
    }

    return results;
  }

  private globToRegex(pattern: string): RegExp {
    // Convert simple glob patterns to regex
    let regexStr = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '___DOUBLESTAR___')
      .replace(/\?/g, '.')  // Convert glob ? to regex . BEFORE adding regex quantifiers
      .replace(/\*/g, '[^/]*')
      .replace(/___DOUBLESTAR___\//g, '(.*/)?' )  // Make **/ optional to match root dir
      .replace(/___DOUBLESTAR___/g, '.*');

    return new RegExp('^' + regexStr + '$');
  }
}

// AWS Config Parser
class AWSConfigParser implements ConfigParser {
  name = 'aws';
  patterns = ['**/*.tf', '**/aws-config.yaml', '**/.elasticbeanstalk/config.yml', '**/template.yaml', '**/template.yml'];

  parse(filePath: string, content: string): DeploymentDetectionResult[] {
    const results: DeploymentDetectionResult[] = [];

    // Parse Terraform files
    if (filePath.endsWith('.tf')) {
      const regionMatches = content.matchAll(/region\s*=\s*["']([^"']+)["']/g);
      for (const match of regionMatches) {
        results.push({
          name: `AWS ${match[1]}`,
          environment: this.inferEnvironment(filePath, content),
          provider: 'aws',
          region: match[1],
          country: this.awsRegionToCountry(match[1]),
          grid_zone: null, // Will be enriched by enrichDeploymentWithCarbonData
          carbon_intensity: null, // Will be enriched by enrichDeploymentWithCarbonData
          ip_address: null,
          detection_method: 'config_file',
          config_file_path: filePath,
          config_type: 'terraform',
          metadata: { raw_region: match[1] }
        });
      }
    }

    // Parse CloudFormation/SAM templates
    if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
      // Simple YAML parsing for AWS regions
      const regionMatches = content.matchAll(/Region:\s*([a-z]{2}-[a-z]+-\d)/g);
      for (const match of regionMatches) {
        results.push({
          name: `AWS ${match[1]}`,
          environment: this.inferEnvironment(filePath, content),
          provider: 'aws',
          region: match[1],
          country: this.awsRegionToCountry(match[1]),
          grid_zone: null,
          carbon_intensity: null,
          ip_address: null,
          detection_method: 'config_file',
          config_file_path: filePath,
          config_type: 'cloudformation',
          metadata: {}
        });
      }
    }

    return results;
  }

  private inferEnvironment(filePath: string, content: string): string {
    const lowerPath = filePath.toLowerCase();
    const lowerContent = content.toLowerCase();

    if (lowerPath.includes('prod') || lowerContent.includes('production')) {
      return 'production';
    }
    if (lowerPath.includes('staging') || lowerContent.includes('staging')) {
      return 'staging';
    }
    if (lowerPath.includes('dev') || lowerContent.includes('development')) {
      return 'development';
    }
    return 'unknown';
  }

  private awsRegionToCountry(region: string): string | null {
    const mapping: Record<string, string> = {
      'us-east-1': 'US',
      'us-east-2': 'US',
      'us-west-1': 'US',
      'us-west-2': 'US',
      'eu-west-1': 'IE',
      'eu-west-2': 'GB',
      'eu-west-3': 'FR',
      'eu-central-1': 'DE',
      'eu-north-1': 'SE',
      'ap-southeast-1': 'SG',
      'ap-southeast-2': 'AU',
      'ap-northeast-1': 'JP',
      'ap-northeast-2': 'KR',
      'ap-south-1': 'IN',
      'ca-central-1': 'CA',
      'sa-east-1': 'BR'
    };
    return mapping[region] || null;
  }
}

// Terraform Parser (generic, not just AWS)
class TerraformParser implements ConfigParser {
  name = 'terraform';
  patterns = ['**/*.tf'];

  parse(filePath: string, content: string): DeploymentDetectionResult[] {
    const results: DeploymentDetectionResult[] = [];

    // GCP
    const gcpRegionMatches = content.matchAll(/provider\s+"google"[\s\S]*?region\s*=\s*["']([^"']+)["']/g);
    for (const match of gcpRegionMatches) {
      results.push({
        name: `GCP ${match[1]}`,
        environment: this.inferEnvironment(filePath),
        provider: 'gcp',
        region: match[1],
        country: this.gcpRegionToCountry(match[1]),
        grid_zone: null,
        carbon_intensity: null,
        ip_address: null,
        detection_method: 'config_file',
        config_file_path: filePath,
        config_type: 'terraform',
        metadata: {}
      });
    }

    // Azure
    const azureLocationMatches = content.matchAll(/location\s*=\s*["']([^"']+)["']/g);
    if (content.includes('azurerm')) {
      for (const match of azureLocationMatches) {
        results.push({
          name: `Azure ${match[1]}`,
          environment: this.inferEnvironment(filePath),
          provider: 'azure',
          region: match[1],
          country: this.azureRegionToCountry(match[1]),
          grid_zone: null,
          carbon_intensity: null,
          ip_address: null,
          detection_method: 'config_file',
          config_file_path: filePath,
          config_type: 'terraform',
          metadata: {}
        });
      }
    }

    return results;
  }

  private inferEnvironment(filePath: string): string {
    const lowerPath = filePath.toLowerCase();
    if (lowerPath.includes('prod')) return 'production';
    if (lowerPath.includes('staging')) return 'staging';
    if (lowerPath.includes('dev')) return 'development';
    return 'unknown';
  }

  private gcpRegionToCountry(region: string): string | null {
    const mapping: Record<string, string> = {
      'us-central1': 'US',
      'us-east1': 'US',
      'us-west1': 'US',
      'europe-west1': 'BE',
      'europe-west2': 'GB',
      'europe-west3': 'DE',
      'europe-west4': 'NL',
      'europe-north1': 'FI',
      'asia-east1': 'TW',
      'asia-northeast1': 'JP',
      'asia-southeast1': 'SG'
    };
    return mapping[region] || null;
  }

  private azureRegionToCountry(region: string): string | null {
    const mapping: Record<string, string> = {
      'eastus': 'US',
      'westus': 'US',
      'northeurope': 'IE',
      'westeurope': 'NL',
      'uksouth': 'GB',
      'francecentral': 'FR',
      'germanywestcentral': 'DE',
      'norwayeast': 'NO',
      'swedencentral': 'SE',
      'japaneast': 'JP',
      'australiaeast': 'AU'
    };
    return mapping[region] || null;
  }
}

// GitHub Actions Parser
class GitHubActionsParser implements ConfigParser {
  name = 'github-actions';
  patterns = ['**/.github/workflows/*.yml', '**/.github/workflows/*.yaml'];

  parse(filePath: string, content: string): DeploymentDetectionResult[] {
    const results: DeploymentDetectionResult[] = [];

    // Look for AWS region in workflows
    const awsRegionMatches = content.matchAll(/AWS_REGION:\s*([a-z]{2}-[a-z]+-\d)/g);
    for (const match of awsRegionMatches) {
      results.push({
        name: `AWS ${match[1]} (CI/CD)`,
        environment: 'production',
        provider: 'aws',
        region: match[1],
        country: this.awsRegionToCountry(match[1]),
        grid_zone: null,
        carbon_intensity: null,
        ip_address: null,
        detection_method: 'config_file',
        config_file_path: filePath,
        config_type: 'github-actions',
        metadata: {}
      });
    }

    return results;
  }

  private awsRegionToCountry(region: string): string | null {
    // Reuse AWS mapping (could be shared utility)
    const mapping: Record<string, string> = {
      'us-east-1': 'US',
      'us-west-2': 'US',
      'eu-west-1': 'IE',
      'eu-central-1': 'DE'
    };
    return mapping[region] || null;
  }
}

// Heroku Parser
class HerokuParser implements ConfigParser {
  name = 'heroku';
  patterns = ['**/heroku.yml', '**/app.json'];

  parse(filePath: string, content: string): DeploymentDetectionResult[] {
    const results: DeploymentDetectionResult[] = [];

    // Heroku regions are typically in app.json or need to be queried via API
    // For now, detect Heroku but mark region as unknown
    if (content.includes('heroku') || filePath.endsWith('heroku.yml')) {
      results.push({
        name: 'Heroku App',
        environment: 'production',
        provider: 'heroku',
        region: null,
        country: 'US', // Default to US, most common
        grid_zone: null,
        carbon_intensity: null,
        ip_address: null,
        detection_method: 'config_file',
        config_file_path: filePath,
        config_type: 'heroku',
        metadata: { note: 'Region detection requires Heroku API' }
      });
    }

    return results;
  }
}

// Vercel Parser
class VercelParser implements ConfigParser {
  name = 'vercel';
  patterns = ['**/vercel.json', '**/.vercel/project.json'];

  parse(filePath: string, content: string): DeploymentDetectionResult[] {
    const results: DeploymentDetectionResult[] = [];

    try {
      const config = JSON.parse(content);

      // Vercel regions
      const regions = config.regions || ['iad1']; // Default to US East

      for (const region of regions) {
        results.push({
          name: `Vercel ${region}`,
          environment: 'production',
          provider: 'vercel',
          region: region,
          country: this.vercelRegionToCountry(region),
          grid_zone: null,
          carbon_intensity: null,
          ip_address: null,
          detection_method: 'config_file',
          config_file_path: filePath,
          config_type: 'vercel',
          metadata: {}
        });
      }
    } catch (error) {
      // Invalid JSON, skip
    }

    return results;
  }

  private vercelRegionToCountry(region: string): string | null {
    // Vercel region codes
    const mapping: Record<string, string> = {
      'iad1': 'US',
      'sfo1': 'US',
      'lhr1': 'GB',
      'fra1': 'DE',
      'sin1': 'SG',
      'hnd1': 'JP'
    };
    return mapping[region] || null;
  }
}

// Netlify Parser
class NetlifyParser implements ConfigParser {
  name = 'netlify';
  patterns = ['**/netlify.toml'];

  parse(filePath: string, content: string): DeploymentDetectionResult[] {
    const results: DeploymentDetectionResult[] = [];

    // Netlify deploys globally, but we can detect the service
    if (content.includes('[build]') || content.includes('netlify')) {
      results.push({
        name: 'Netlify CDN',
        environment: 'production',
        provider: 'netlify',
        region: null,
        country: null, // Global CDN
        grid_zone: null,
        carbon_intensity: null,
        ip_address: null,
        detection_method: 'config_file',
        config_file_path: filePath,
        config_type: 'netlify',
        metadata: { note: 'Netlify uses global CDN' }
      });
    }

    return results;
  }
}

export const createDeploymentService = (dataService: DataService) => new DeploymentService(dataService);
