import { describe, it, expect } from 'vitest';
import {
  getGridZoneForRegion,
  getRegionMapping,
  getAllRegionsForProvider,
  AWS_REGION_MAPPINGS,
  GCP_REGION_MAPPINGS,
  AZURE_REGION_MAPPINGS,
  VERCEL_REGION_MAPPINGS,
  HEROKU_REGION_MAPPINGS,
  NETLIFY_REGION_MAPPINGS,
} from '../src/data/region-to-grid-mapping.js';

describe('Region to Grid Mapping', () => {
  describe('getGridZoneForRegion', () => {
    it('should return correct grid zone for AWS us-east-1', () => {
      const gridZone = getGridZoneForRegion('aws', 'us-east-1');
      expect(gridZone).toBe('US-MIDA-PJM');
    });

    it('should return correct grid zone for AWS eu-north-1 (Stockholm)', () => {
      const gridZone = getGridZoneForRegion('aws', 'eu-north-1');
      expect(gridZone).toBe('SE');
    });

    it('should return correct grid zone for GCP europe-north1 (Finland)', () => {
      const gridZone = getGridZoneForRegion('gcp', 'europe-north1');
      expect(gridZone).toBe('FI');
    });

    it('should return correct grid zone for Azure norwayeast', () => {
      const gridZone = getGridZoneForRegion('azure', 'norwayeast');
      expect(gridZone).toBe('NO-NO1');
    });

    it('should return correct grid zone for Vercel arn1 (Stockholm)', () => {
      const gridZone = getGridZoneForRegion('vercel', 'arn1');
      expect(gridZone).toBe('SE');
    });

    it('should return correct grid zone for Heroku montreal', () => {
      const gridZone = getGridZoneForRegion('heroku', 'montreal');
      expect(gridZone).toBe('CA-QC');
    });

    it('should return null for unknown provider', () => {
      const gridZone = getGridZoneForRegion('unknown-provider', 'some-region');
      expect(gridZone).toBeNull();
    });

    it('should return null for unknown region', () => {
      const gridZone = getGridZoneForRegion('aws', 'unknown-region');
      expect(gridZone).toBeNull();
    });

    it('should be case-insensitive for provider names', () => {
      const gridZone1 = getGridZoneForRegion('AWS', 'us-east-1');
      const gridZone2 = getGridZoneForRegion('aws', 'us-east-1');
      expect(gridZone1).toBe(gridZone2);
    });
  });

  describe('getRegionMapping', () => {
    it('should return full mapping details for AWS us-west-2', () => {
      const mapping = getRegionMapping('aws', 'us-west-2');
      expect(mapping).toBeDefined();
      expect(mapping?.region).toBe('us-west-2');
      expect(mapping?.gridZone).toBe('US-NW-PACW');
      expect(mapping?.location).toContain('Oregon');
      expect(mapping?.country).toBe('US');
    });

    it('should return full mapping details for GCP asia-northeast1', () => {
      const mapping = getRegionMapping('gcp', 'asia-northeast1');
      expect(mapping).toBeDefined();
      expect(mapping?.gridZone).toBe('JP-TK');
      expect(mapping?.location).toContain('Tokyo');
      expect(mapping?.country).toBe('JP');
    });

    it('should return null for invalid region', () => {
      const mapping = getRegionMapping('aws', 'invalid-region');
      expect(mapping).toBeNull();
    });
  });

  describe('getAllRegionsForProvider', () => {
    it('should return all AWS regions', () => {
      const regions = getAllRegionsForProvider('aws');
      expect(regions.length).toBeGreaterThan(30);
      expect(regions).toContainEqual(
        expect.objectContaining({
          region: 'us-east-1',
          gridZone: 'US-MIDA-PJM',
        })
      );
    });

    it('should return all GCP regions', () => {
      const regions = getAllRegionsForProvider('gcp');
      expect(regions.length).toBeGreaterThan(30);
      expect(regions).toContainEqual(
        expect.objectContaining({
          region: 'us-central1',
          country: 'US',
        })
      );
    });

    it('should return all Azure regions', () => {
      const regions = getAllRegionsForProvider('azure');
      expect(regions.length).toBeGreaterThan(50);
      expect(regions).toContainEqual(
        expect.objectContaining({
          region: 'westeurope',
          country: 'NL',
        })
      );
    });

    it('should return empty array for unknown provider', () => {
      const regions = getAllRegionsForProvider('unknown');
      expect(regions).toEqual([]);
    });
  });

  describe('AWS Region Mappings', () => {
    it('should have mappings for all major AWS regions', () => {
      const expectedRegions = [
        'us-east-1',
        'us-east-2',
        'us-west-1',
        'us-west-2',
        'eu-west-1',
        'eu-central-1',
        'ap-southeast-1',
        'ap-northeast-1',
      ];

      expectedRegions.forEach(region => {
        expect(AWS_REGION_MAPPINGS[region]).toBeDefined();
        expect(AWS_REGION_MAPPINGS[region].gridZone).toBeTruthy();
      });
    });

    it('should map AWS regions to appropriate US grid zones', () => {
      expect(AWS_REGION_MAPPINGS['us-east-1'].gridZone).toBe('US-MIDA-PJM');
      expect(AWS_REGION_MAPPINGS['us-east-2'].gridZone).toBe('US-MIDW-MISO');
      expect(AWS_REGION_MAPPINGS['us-west-1'].gridZone).toBe('US-CAL-CISO');
      expect(AWS_REGION_MAPPINGS['us-west-2'].gridZone).toBe('US-NW-PACW');
    });

    it('should map AWS regions to country-level zones for non-US regions', () => {
      expect(AWS_REGION_MAPPINGS['eu-west-1'].gridZone).toBe('IE');
      expect(AWS_REGION_MAPPINGS['ap-southeast-1'].gridZone).toBe('SG');
    });
  });

  describe('GCP Region Mappings', () => {
    it('should have mappings for all major GCP regions', () => {
      const expectedRegions = [
        'us-central1',
        'us-east1',
        'us-west1',
        'europe-west1',
        'europe-west2',
        'asia-east1',
        'asia-northeast1',
      ];

      expectedRegions.forEach(region => {
        expect(GCP_REGION_MAPPINGS[region]).toBeDefined();
        expect(GCP_REGION_MAPPINGS[region].gridZone).toBeTruthy();
      });
    });

    it('should map GCP regions to sub-national grids where available', () => {
      expect(GCP_REGION_MAPPINGS['us-central1'].gridZone).toBe('US-MIDW-MISO');
      expect(GCP_REGION_MAPPINGS['us-west2'].gridZone).toBe('US-CAL-CISO');
    });
  });

  describe('Azure Region Mappings', () => {
    it('should have mappings for all major Azure regions', () => {
      const expectedRegions = [
        'eastus',
        'westus',
        'westeurope',
        'northeurope',
        'japaneast',
        'australiaeast',
      ];

      expectedRegions.forEach(region => {
        expect(AZURE_REGION_MAPPINGS[region]).toBeDefined();
        expect(AZURE_REGION_MAPPINGS[region].gridZone).toBeTruthy();
      });
    });

    it('should map Azure Norway regions to specific Norwegian grid zones', () => {
      expect(AZURE_REGION_MAPPINGS['norwayeast'].gridZone).toBe('NO-NO1');
      expect(AZURE_REGION_MAPPINGS['norwaywest'].gridZone).toBe('NO-NO5');
    });

    it('should include Azure Government regions', () => {
      expect(AZURE_REGION_MAPPINGS['usgov-virginia']).toBeDefined();
      expect(AZURE_REGION_MAPPINGS['usgov-texas']).toBeDefined();
    });

    it('should include Azure China regions', () => {
      expect(AZURE_REGION_MAPPINGS['chinaeast']).toBeDefined();
      expect(AZURE_REGION_MAPPINGS['chinanorth']).toBeDefined();
    });
  });

  describe('Vercel Region Mappings', () => {
    it('should have mappings for all Vercel compute regions', () => {
      const expectedRegions = ['iad1', 'sfo1', 'lhr1', 'fra1', 'sin1', 'hnd1'];

      expectedRegions.forEach(region => {
        expect(VERCEL_REGION_MAPPINGS[region]).toBeDefined();
        expect(VERCEL_REGION_MAPPINGS[region].gridZone).toBeTruthy();
      });
    });

    it('should map Vercel US regions to appropriate grids', () => {
      expect(VERCEL_REGION_MAPPINGS['iad1'].gridZone).toBe('US-MIDA-PJM');
      expect(VERCEL_REGION_MAPPINGS['sfo1'].gridZone).toBe('US-CAL-CISO');
    });
  });

  describe('Heroku Region Mappings', () => {
    it('should have mappings for Common Runtime regions', () => {
      expect(HEROKU_REGION_MAPPINGS['us']).toBeDefined();
      expect(HEROKU_REGION_MAPPINGS['eu']).toBeDefined();
    });

    it('should have mappings for Private Spaces regions', () => {
      const expectedRegions = [
        'virginia',
        'oregon',
        'dublin',
        'frankfurt',
        'london',
        'montreal',
        'singapore',
        'sydney',
        'tokyo',
      ];

      expectedRegions.forEach(region => {
        expect(HEROKU_REGION_MAPPINGS[region]).toBeDefined();
      });
    });
  });

  describe('Netlify Region Mappings', () => {
    it('should have mappings for Netlify function regions', () => {
      const expectedRegions = [
        'us-east-1',
        'us-east-2',
        'us-west-2',
        'eu-central-1',
      ];

      expectedRegions.forEach(region => {
        expect(NETLIFY_REGION_MAPPINGS[region]).toBeDefined();
      });
    });

    it('should map Netlify regions to appropriate AWS-based grids', () => {
      expect(NETLIFY_REGION_MAPPINGS['us-east-2'].gridZone).toBe('US-MIDW-MISO');
    });
  });

  describe('Data Quality', () => {
    it('should have valid country codes for all mappings', () => {
      const allMappings = [
        ...Object.values(AWS_REGION_MAPPINGS),
        ...Object.values(GCP_REGION_MAPPINGS),
        ...Object.values(AZURE_REGION_MAPPINGS),
        ...Object.values(VERCEL_REGION_MAPPINGS),
        ...Object.values(HEROKU_REGION_MAPPINGS),
        ...Object.values(NETLIFY_REGION_MAPPINGS),
      ];

      allMappings.forEach(mapping => {
        expect(mapping.country).toMatch(/^[A-Z]{2}$/);
      });
    });

    it('should have non-empty location for all mappings', () => {
      const allMappings = [
        ...Object.values(AWS_REGION_MAPPINGS),
        ...Object.values(GCP_REGION_MAPPINGS),
        ...Object.values(AZURE_REGION_MAPPINGS),
      ];

      allMappings.forEach(mapping => {
        expect(mapping.location).toBeTruthy();
        expect(mapping.location.length).toBeGreaterThan(0);
      });
    });

    it('should have valid grid zones for all mappings', () => {
      const allMappings = [
        ...Object.values(AWS_REGION_MAPPINGS),
        ...Object.values(GCP_REGION_MAPPINGS),
        ...Object.values(AZURE_REGION_MAPPINGS),
      ];

      allMappings.forEach(mapping => {
        expect(mapping.gridZone).toBeTruthy();
        expect(mapping.gridZone.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Low Carbon Region Identification', () => {
    it('should identify Nordic regions as having specific low-carbon grids', () => {
      const nordicRegions = [
        { provider: 'aws', region: 'eu-north-1', expectedGrid: 'SE' },
        { provider: 'gcp', region: 'europe-north1', expectedGrid: 'FI' },
        { provider: 'azure', region: 'norwayeast', expectedGrid: 'NO-NO1' },
        { provider: 'azure', region: 'swedencentral', expectedGrid: 'SE' },
      ];

      nordicRegions.forEach(({ provider, region, expectedGrid }) => {
        const gridZone = getGridZoneForRegion(provider, region);
        expect(gridZone).toBe(expectedGrid);
      });
    });

    it('should identify Canadian hydro-powered regions', () => {
      const canadianRegions = [
        { provider: 'aws', region: 'ca-central-1', expectedGrid: 'CA-ON' },
        { provider: 'gcp', region: 'northamerica-northeast1', expectedGrid: 'CA-QC' },
        { provider: 'azure', region: 'canadaeast', expectedGrid: 'CA-QC' },
      ];

      canadianRegions.forEach(({ provider, region, expectedGrid }) => {
        const gridZone = getGridZoneForRegion(provider, region);
        expect(gridZone).toBe(expectedGrid);
      });
    });
  });

  describe('Regional Grid Specificity', () => {
    it('should use sub-national US grid zones for US regions', () => {
      const usRegions = [
        { provider: 'aws', region: 'us-east-1', shouldContain: 'US-' },
        { provider: 'aws', region: 'us-west-1', shouldContain: 'US-' },
        { provider: 'gcp', region: 'us-central1', shouldContain: 'US-' },
        { provider: 'azure', region: 'eastus', shouldContain: 'US-' },
      ];

      usRegions.forEach(({ provider, region, shouldContain }) => {
        const gridZone = getGridZoneForRegion(provider, region);
        expect(gridZone).toContain(shouldContain);
      });
    });

    it('should use sub-national grids for Australian regions', () => {
      const ausRegions = [
        { provider: 'aws', region: 'ap-southeast-2', expectedGrid: 'AU-NSW' },
        { provider: 'aws', region: 'ap-southeast-4', expectedGrid: 'AU-VIC' },
        { provider: 'gcp', region: 'australia-southeast1', expectedGrid: 'AU-NSW' },
      ];

      ausRegions.forEach(({ provider, region, expectedGrid }) => {
        const gridZone = getGridZoneForRegion(provider, region);
        expect(gridZone).toBe(expectedGrid);
      });
    });

    it('should use sub-national grids for Indian regions', () => {
      const indiaRegions = [
        { provider: 'aws', region: 'ap-south-1', expectedGrid: 'IN-WE' },
        { provider: 'gcp', region: 'asia-south1', expectedGrid: 'IN-WE' },
        { provider: 'azure', region: 'centralindia', expectedGrid: 'IN-WE' },
      ];

      indiaRegions.forEach(({ provider, region, expectedGrid }) => {
        const gridZone = getGridZoneForRegion(provider, region);
        expect(gridZone).toBe(expectedGrid);
      });
    });

    it('should use sub-national grids for Japanese regions', () => {
      const japanRegions = [
        { provider: 'aws', region: 'ap-northeast-1', expectedGrid: 'JP-TK' },
        { provider: 'aws', region: 'ap-northeast-3', expectedGrid: 'JP-KN' },
        { provider: 'gcp', region: 'asia-northeast1', expectedGrid: 'JP-TK' },
      ];

      japanRegions.forEach(({ provider, region, expectedGrid }) => {
        const gridZone = getGridZoneForRegion(provider, region);
        expect(gridZone).toBe(expectedGrid);
      });
    });
  });
});
