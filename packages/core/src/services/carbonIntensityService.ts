import * as fs from 'fs';
import * as path from 'path';
import { DataService } from '../data-service.js';
import { getGridZoneForRegion, getRegionMapping, ALL_REGION_MAPPINGS } from '../data/region-to-grid-mapping.js';

export interface CarbonIntensityData {
  country: string;
  region?: string;
  carbonIntensity: number; // gCO2/kWh
  source: string;
  updatedAt: string;
}

export interface GridZone {
  zone_key: string;
  country: string;
  zone_name: string;
  fallback_zone_key: string | null;
  stable: boolean;
  free: boolean;
  average_co2: number;
  low_average: boolean;
}

export interface CarbonRecommendation {
  deploymentId: number;
  currentRegion: string;
  currentGridZone: string;
  currentIntensity: number;
  suggestedProvider?: string;
  suggestedRegion?: string;
  suggestedGridZone?: string;
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
  private gridZones: Map<string, GridZone>;

  constructor(dataService: DataService) {
    this.dataService = dataService;
    this.gridZones = new Map();
    this.loadGridZoneData();
  }

  /**
   * Load electricity grid zone data from JSON file
   */
  private loadGridZoneData() {
    try {
      const jsonPath = path.join(__dirname, '../data/electricity_zones.json');
      const fileContents = fs.readFileSync(jsonPath, 'utf8');
      const zones = JSON.parse(fileContents) as GridZone[];

      for (const zone of zones) {
        this.gridZones.set(zone.zone_key, zone);
      }

      console.log(`Loaded ${this.gridZones.size} electricity grid zones`);
    } catch (error) {
      console.error('Error loading electricity grid zone data:', error);
      // Service will still work with empty data, but won't provide accurate intensities
    }
  }

  /**
   * Get carbon intensity for a specific grid zone
   */
  getCarbonIntensityByGridZone(gridZone: string): number | null {
    const zone = this.gridZones.get(gridZone);
    return zone ? Math.round(zone.average_co2) : null;
  }

  /**
   * Get carbon intensity for a specific country (uses country-level grid zone)
   */
  getCarbonIntensityByCountry(countryCode: string): number | null {
    return this.getCarbonIntensityByGridZone(countryCode.toUpperCase());
  }

  /**
   * Get carbon intensity for a specific provider region
   */
  getCarbonIntensityByProviderRegion(provider: string, region: string): number | null {
    const gridZone = getGridZoneForRegion(provider, region);
    if (!gridZone) {
      return null;
    }

    return this.getCarbonIntensityByGridZone(gridZone);
  }

  /**
   * Get detailed grid zone information
   */
  getGridZoneInfo(gridZone: string): GridZone | null {
    return this.gridZones.get(gridZone) || null;
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
   * Get recommendations for lower-carbon deployment options based on deployment data
   */
  async getRecommendations(deploymentData: any[]): Promise<CarbonRecommendation[]> {
    const recommendations: CarbonRecommendation[] = [];

    for (const deployment of deploymentData) {
      const recommendation = this.generateRecommendation(deployment);
      if (recommendation) {
        recommendations.push(recommendation);
      }
    }

    return recommendations;
  }

  /**
   * Generate a recommendation for a specific deployment
   */
  private generateRecommendation(deployment: any): CarbonRecommendation | null {
    const provider = deployment.provider;
    const region = deployment.region;

    if (!provider || !region) {
      return null;
    }

    // Get current grid zone and intensity
    const currentGridZone = getGridZoneForRegion(provider, region);
    if (!currentGridZone) {
      return null;
    }

    const currentIntensity = this.getCarbonIntensityByGridZone(currentGridZone);
    if (!currentIntensity) {
      return null;
    }

    // Find better alternatives within the same provider
    const providerRecommendation = this.getProviderRecommendation(provider, currentIntensity);

    if (!providerRecommendation) {
      return null; // No better option found
    }

    const potentialSavings = ((currentIntensity - providerRecommendation.intensity) / currentIntensity) * 100;

    return {
      deploymentId: deployment.id || 0,
      currentRegion: region,
      currentGridZone,
      currentIntensity,
      suggestedProvider: provider,
      suggestedRegion: providerRecommendation.region,
      suggestedGridZone: providerRecommendation.gridZone,
      suggestedCountry: providerRecommendation.country,
      suggestedIntensity: providerRecommendation.intensity,
      potentialSavings: Math.round(potentialSavings),
      notes: providerRecommendation.notes
    };
  }

  /**
   * Get recommendation for a specific provider
   */
  private getProviderRecommendation(provider: string, currentIntensity: number): {
    region: string;
    gridZone: string;
    country: string;
    intensity: number;
    notes: string;
  } | null {
    const providerMappings = ALL_REGION_MAPPINGS[provider.toLowerCase() as keyof typeof ALL_REGION_MAPPINGS];
    if (!providerMappings) {
      return null;
    }

    // Get all regions for this provider with their carbon intensities
    const regionIntensities = Object.entries(providerMappings)
      .map(([regionCode, mapping]) => {
        const intensity = this.getCarbonIntensityByGridZone(mapping.gridZone);
        return {
          region: regionCode,
          gridZone: mapping.gridZone,
          country: mapping.country,
          location: mapping.location,
          intensity: intensity || Infinity,
          notes: mapping.notes || ''
        };
      })
      .filter(r => r.intensity !== Infinity && r.intensity < currentIntensity)
      .sort((a, b) => a.intensity - b.intensity);

    if (regionIntensities.length === 0) {
      return null;
    }

    // Return the lowest carbon intensity region
    const best = regionIntensities[0];
    return {
      region: best.region,
      gridZone: best.gridZone,
      country: best.country,
      intensity: best.intensity,
      notes: `${provider.toUpperCase()} ${best.location} - ${best.intensity} gCO2/kWh${best.notes ? ' - ' + best.notes : ''}`
    };
  }

  /**
   * Get all grid zones ranked by carbon intensity
   */
  getGridZonesRankedByCarbonIntensity(): Array<{ gridZone: string; zoneName: string; country: string; intensity: number }> {
    const ranked = Array.from(this.gridZones.values())
      .map(zone => ({
        gridZone: zone.zone_key,
        zoneName: zone.zone_name,
        country: zone.country,
        intensity: Math.round(zone.average_co2)
      }))
      .sort((a, b) => a.intensity - b.intensity);

    return ranked;
  }

  /**
   * Get lowest carbon regions for each provider
   */
  getLowestCarbonRegionsByProvider(): Record<string, Array<{ region: string; gridZone: string; country: string; intensity: number; location: string }>> {
    const result: Record<string, Array<any>> = {};

    for (const [providerName, mappings] of Object.entries(ALL_REGION_MAPPINGS)) {
      const regionIntensities = Object.entries(mappings)
        .map(([regionCode, mapping]) => {
          const intensity = this.getCarbonIntensityByGridZone(mapping.gridZone);
          return {
            region: regionCode,
            gridZone: mapping.gridZone,
            country: mapping.country,
            location: mapping.location,
            intensity: intensity || Infinity
          };
        })
        .filter(r => r.intensity !== Infinity)
        .sort((a, b) => a.intensity - b.intensity)
        .slice(0, 10); // Top 10 lowest carbon regions

      result[providerName] = regionIntensities;
    }

    return result;
  }

  /**
   * Calculate estimated CO2 savings if recommendations are implemented
   * Assumes average workload of 1 kWh per day per deployment
   */
  async calculatePotentialSavings(deploymentData: any[]): Promise<{
    totalKgCO2PerYear: number;
    recommendations: CarbonRecommendation[];
  }> {
    const recommendations = await this.getRecommendations(deploymentData);
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

  /**
   * Get carbon intensity comparison between multiple regions
   */
  compareRegions(comparisons: Array<{ provider: string; region: string }>): Array<{
    provider: string;
    region: string;
    gridZone: string | null;
    intensity: number | null;
    location: string;
  }> {
    return comparisons.map(({ provider, region }) => {
      const mapping = getRegionMapping(provider, region);
      if (!mapping) {
        return {
          provider,
          region,
          gridZone: null,
          intensity: null,
          location: 'Unknown'
        };
      }

      const intensity = this.getCarbonIntensityByGridZone(mapping.gridZone);

      return {
        provider,
        region,
        gridZone: mapping.gridZone,
        intensity,
        location: mapping.location
      };
    });
  }

  /**
   * Get statistics about the grid zone data
   */
  getDataStatistics(): {
    totalZones: number;
    lowCarbonZones: number; // < 100 gCO2/kWh
    mediumCarbonZones: number; // 100-500 gCO2/kWh
    highCarbonZones: number; // > 500 gCO2/kWh
    averageIntensity: number;
    lowestIntensity: { zone: string; intensity: number };
    highestIntensity: { zone: string; intensity: number };
  } {
    const zones = Array.from(this.gridZones.values());
    const intensities = zones.map(z => z.average_co2);

    const lowCarbonZones = zones.filter(z => z.average_co2 < 100).length;
    const mediumCarbonZones = zones.filter(z => z.average_co2 >= 100 && z.average_co2 <= 500).length;
    const highCarbonZones = zones.filter(z => z.average_co2 > 500).length;

    const averageIntensity = intensities.reduce((sum, i) => sum + i, 0) / intensities.length;

    const sorted = zones.sort((a, b) => a.average_co2 - b.average_co2);
    const lowest = sorted[0];
    const highest = sorted[sorted.length - 1];

    return {
      totalZones: zones.length,
      lowCarbonZones,
      mediumCarbonZones,
      highCarbonZones,
      averageIntensity: Math.round(averageIntensity),
      lowestIntensity: {
        zone: lowest.zone_key,
        intensity: Math.round(lowest.average_co2)
      },
      highestIntensity: {
        zone: highest.zone_key,
        intensity: Math.round(highest.average_co2)
      }
    };
  }
}

export const createCarbonIntensityService = (dataService: DataService) => new CarbonIntensityService(dataService);
