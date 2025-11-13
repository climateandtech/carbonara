import { DataService } from '../data-service.js';

export interface CarbonIntensityData {
  country: string;
  region?: string;
  carbonIntensity: number; // gCO2/kWh
  source: string;
  updatedAt: string;
}

export interface CarbonRecommendation {
  deploymentId: number;
  currentIntensity: number;
  suggestedProvider?: string;
  suggestedRegion?: string;
  suggestedCountry?: string;
  suggestedIntensity?: number;
  potentialSavings?: number; // percentage
  notes: string;
}

/**
 * Service for managing carbon intensity data and providing recommendations
 * for lower-carbon deployment options.
 */
export class CarbonIntensityService {
  private dataService: DataService;
  private staticData: Map<string, number>;

  constructor(dataService: DataService) {
    this.dataService = dataService;
    this.staticData = new Map();
    this.loadStaticData();
  }

  /**
   * Load static carbon intensity data by country
   * Data sourced from Ember Climate (2023 averages) and IEA
   * Values in gCO2/kWh
   */
  private loadStaticData() {
    // Nordic countries (very low carbon intensity due to hydro/nuclear/wind)
    this.staticData.set('NO', 25);  // Norway - hydro
    this.staticData.set('IS', 30);  // Iceland - geothermal/hydro
    this.staticData.set('SE', 45);  // Sweden - hydro/nuclear
    this.staticData.set('FI', 85);  // Finland - nuclear/renewable mix

    // Western Europe (low to medium)
    this.staticData.set('FR', 70);  // France - nuclear
    this.staticData.set('CH', 75);  // Switzerland - hydro/nuclear
    this.staticData.set('AT', 110); // Austria
    this.staticData.set('DK', 130); // Denmark - wind
    this.staticData.set('BE', 150); // Belgium
    this.staticData.set('GB', 250); // United Kingdom
    this.staticData.set('NL', 380); // Netherlands
    this.staticData.set('DE', 420); // Germany
    this.staticData.set('IT', 350); // Italy
    this.staticData.set('ES', 200); // Spain

    // North America
    this.staticData.set('CA', 150); // Canada - hydro dominant
    this.staticData.set('US', 400); // USA - mixed, varies by region

    // Asia Pacific
    this.staticData.set('NZ', 120); // New Zealand - hydro/geothermal
    this.staticData.set('BR', 150); // Brazil - hydro
    this.staticData.set('JP', 480); // Japan
    this.staticData.set('KR', 500); // South Korea
    this.staticData.set('SG', 420); // Singapore
    this.staticData.set('AU', 650); // Australia - coal heavy
    this.staticData.set('IN', 700); // India - coal heavy
    this.staticData.set('CN', 580); // China - coal heavy

    // Middle East (typically high due to oil/gas)
    this.staticData.set('AE', 450); // UAE

    // South Africa
    this.staticData.set('ZA', 850); // South Africa - coal heavy
  }

  /**
   * Get carbon intensity for a specific country
   */
  getCarbonIntensity(country: string): number | null {
    return this.staticData.get(country.toUpperCase()) || null;
  }

  /**
   * Update carbon intensity for all deployments that don't have it set
   * NOTE: This method is deprecated as deployments are now stored in assessment_data
   */
  async updateDeploymentCarbonIntensities(): Promise<number> {
    // TODO: Refactor to work with assessment_data table
    console.warn('updateDeploymentCarbonIntensities is deprecated - deployments are now stored in assessment_data');
    return 0;
  }

  /**
   * Get recommendations for lower-carbon deployment options
   * NOTE: This method is deprecated as deployments are now stored in assessment_data
   */
  async getRecommendations(): Promise<CarbonRecommendation[]> {
    // TODO: Refactor to work with assessment_data table
    console.warn('getRecommendations is deprecated - deployments are now stored in assessment_data');
    return [];
  }

  /**
   * Generate a recommendation for a specific deployment
   * NOTE: This method is deprecated as deployments are now stored in assessment_data
   */
  private generateRecommendation(deployment: any): CarbonRecommendation | null {
    const currentIntensity = deployment.carbon_intensity!;

    // Find better alternatives based on provider
    let suggestedRegion: string | null = null;
    let suggestedCountry: string | null = null;
    let suggestedIntensity: number | null = null;
    let notes = '';

    switch (deployment.provider) {
      case 'aws':
        const awsRecommendation = this.getAWSRecommendation(currentIntensity);
        if (awsRecommendation) {
          suggestedRegion = awsRecommendation.region;
          suggestedCountry = awsRecommendation.country;
          suggestedIntensity = awsRecommendation.intensity;
          notes = awsRecommendation.notes;
        }
        break;

      case 'gcp':
        const gcpRecommendation = this.getGCPRecommendation(currentIntensity);
        if (gcpRecommendation) {
          suggestedRegion = gcpRecommendation.region;
          suggestedCountry = gcpRecommendation.country;
          suggestedIntensity = gcpRecommendation.intensity;
          notes = gcpRecommendation.notes;
        }
        break;

      case 'azure':
        const azureRecommendation = this.getAzureRecommendation(currentIntensity);
        if (azureRecommendation) {
          suggestedRegion = azureRecommendation.region;
          suggestedCountry = azureRecommendation.country;
          suggestedIntensity = azureRecommendation.intensity;
          notes = azureRecommendation.notes;
        }
        break;

      default:
        // For other providers, suggest moving to low-carbon regions
        notes = 'Consider migrating to a provider with low-carbon regions (Norway, Sweden, France)';
    }

    if (!suggestedIntensity || suggestedIntensity >= currentIntensity) {
      return null; // No better option found
    }

    const potentialSavings = ((currentIntensity - suggestedIntensity) / currentIntensity) * 100;

    return {
      deploymentId: deployment.id,
      currentIntensity,
      suggestedProvider: deployment.provider,
      suggestedRegion: suggestedRegion || undefined,
      suggestedCountry: suggestedCountry || undefined,
      suggestedIntensity,
      potentialSavings: Math.round(potentialSavings),
      notes
    };
  }

  private getAWSRecommendation(currentIntensity: number): { region: string; country: string; intensity: number; notes: string } | null {
    // AWS regions ranked by carbon intensity (low to high)
    const lowCarbonRegions = [
      { region: 'eu-north-1', country: 'SE', intensity: 45, notes: 'AWS Stockholm - powered by renewable energy' },
      { region: 'ca-central-1', country: 'CA', intensity: 150, notes: 'AWS Canada - hydro-powered' },
      { region: 'eu-west-2', country: 'GB', intensity: 250, notes: 'AWS London' },
      { region: 'eu-west-1', country: 'IE', intensity: 300, notes: 'AWS Ireland' },
      { region: 'us-west-2', country: 'US', intensity: 350, notes: 'AWS Oregon - renewable energy investments' }
    ];

    // Find the lowest carbon region that's better than current
    for (const option of lowCarbonRegions) {
      if (option.intensity < currentIntensity) {
        return option;
      }
    }

    return null;
  }

  private getGCPRecommendation(currentIntensity: number): { region: string; country: string; intensity: number; notes: string } | null {
    const lowCarbonRegions = [
      { region: 'europe-north1', country: 'FI', intensity: 85, notes: 'GCP Finland - low-carbon grid' },
      { region: 'northamerica-northeast1', country: 'CA', intensity: 150, notes: 'GCP Montreal - hydro-powered' },
      { region: 'europe-west2', country: 'GB', intensity: 250, notes: 'GCP London' },
      { region: 'europe-west1', country: 'BE', intensity: 150, notes: 'GCP Belgium' }
    ];

    for (const option of lowCarbonRegions) {
      if (option.intensity < currentIntensity) {
        return option;
      }
    }

    return null;
  }

  private getAzureRecommendation(currentIntensity: number): { region: string; country: string; intensity: number; notes: string } | null {
    const lowCarbonRegions = [
      { region: 'norwayeast', country: 'NO', intensity: 25, notes: 'Azure Norway - hydro-powered' },
      { region: 'swedencentral', country: 'SE', intensity: 45, notes: 'Azure Sweden - renewable energy' },
      { region: 'francecentral', country: 'FR', intensity: 70, notes: 'Azure France - nuclear-powered' },
      { region: 'uksouth', country: 'GB', intensity: 250, notes: 'Azure UK South' }
    ];

    for (const option of lowCarbonRegions) {
      if (option.intensity < currentIntensity) {
        return option;
      }
    }

    return null;
  }

  /**
   * Get all countries ranked by carbon intensity
   */
  getCountriesRankedByCarbonIntensity(): Array<{ country: string; intensity: number }> {
    const ranked = Array.from(this.staticData.entries())
      .map(([country, intensity]) => ({ country, intensity }))
      .sort((a, b) => a.intensity - b.intensity);

    return ranked;
  }

  /**
   * Calculate estimated CO2 savings if recommendations are implemented
   * Assumes average workload of 1 kWh per day per deployment
   */
  async calculatePotentialSavings(): Promise<{ totalKgCO2PerYear: number; recommendations: CarbonRecommendation[] }> {
    const recommendations = await this.getRecommendations();
    let totalSavings = 0;

    for (const rec of recommendations) {
      if (rec.suggestedIntensity && rec.currentIntensity) {
        // Difference in gCO2/kWh * 365 days * 1 kWh/day = gCO2/year
        const savingsPerYear = (rec.currentIntensity - rec.suggestedIntensity) * 365;
        totalSavings += savingsPerYear;
      }
    }

    return {
      totalKgCO2PerYear: totalSavings / 1000, // Convert to kg
      recommendations
    };
  }
}

export const createCarbonIntensityService = (dataService: DataService) => new CarbonIntensityService(dataService);
