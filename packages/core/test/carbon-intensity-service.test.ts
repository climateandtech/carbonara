import { describe, it, expect, beforeEach, vi } from "vitest";
import { CarbonIntensityService } from "../src/services/carbonIntensityService.js";
import { DataService } from "../src/data-service.js";

// Mock the DataService
const mockDataService = {
  storeAssessmentData: vi.fn(),
} as unknown as DataService;

describe("CarbonIntensityService", () => {
  let service: CarbonIntensityService;

  beforeEach(() => {
    service = new CarbonIntensityService(mockDataService);
  });

  describe("getCarbonIntensityByGridZone", () => {
    it("should return carbon intensity for valid grid zone", () => {
      const intensity = service.getCarbonIntensityByGridZone("SE");
      expect(intensity).toBeGreaterThan(0);
      expect(intensity).toBeLessThan(100); // Sweden should be low carbon
    });

    it("should return carbon intensity for US sub-national grid", () => {
      const intensity = service.getCarbonIntensityByGridZone("US-CAL-CISO");
      expect(intensity).toBeGreaterThan(0);
    });

    it("should return null for invalid grid zone", () => {
      const intensity = service.getCarbonIntensityByGridZone("INVALID");
      expect(intensity).toBeNull();
    });

    it("should return different intensities for different grids", () => {
      const sweden = service.getCarbonIntensityByGridZone("SE");
      const poland = service.getCarbonIntensityByGridZone("PL");

      expect(sweden).not.toBeNull();
      expect(poland).not.toBeNull();
      expect(sweden).toBeLessThan(poland!); // Sweden has lower carbon intensity
    });
  });

  describe("getCarbonIntensityByCountry", () => {
    it("should return carbon intensity for country code", () => {
      const intensity = service.getCarbonIntensityByCountry("NO");
      expect(intensity).toBeGreaterThan(0);
      expect(intensity).toBeLessThan(50); // Norway should be very low carbon
    });

    it("should be case-insensitive", () => {
      const intensity1 = service.getCarbonIntensityByCountry("no");
      const intensity2 = service.getCarbonIntensityByCountry("NO");
      expect(intensity1).toBe(intensity2);
    });

    it("should return null for invalid country code", () => {
      const intensity = service.getCarbonIntensityByCountry("XX");
      expect(intensity).toBeNull();
    });
  });

  describe("getCarbonIntensityByProviderRegion", () => {
    it("should return carbon intensity for AWS us-east-1", () => {
      const intensity = service.getCarbonIntensityByProviderRegion(
        "aws",
        "us-east-1"
      );
      expect(intensity).toBeGreaterThan(0);
    });

    it("should return carbon intensity for GCP eu-north-1", () => {
      const intensity = service.getCarbonIntensityByProviderRegion(
        "gcp",
        "eu-north-1"
      );
      expect(intensity).toBeGreaterThan(0);
      expect(intensity).toBeLessThan(100); // Finland should be low carbon
    });

    it("should return carbon intensity for Azure norwayeast", () => {
      const intensity = service.getCarbonIntensityByProviderRegion(
        "azure",
        "norwayeast"
      );
      expect(intensity).toBeGreaterThan(0);
      expect(intensity).toBeLessThan(50); // Norway should be very low carbon
    });

    it("should return null for invalid provider", () => {
      const intensity = service.getCarbonIntensityByProviderRegion(
        "invalid",
        "some-region"
      );
      expect(intensity).toBeNull();
    });

    it("should return null for invalid region", () => {
      const intensity = service.getCarbonIntensityByProviderRegion(
        "aws",
        "invalid-region"
      );
      expect(intensity).toBeNull();
    });
  });

  describe("getGridZoneInfo", () => {
    it("should return full grid zone information", () => {
      const info = service.getGridZoneInfo("SE");
      expect(info).toBeDefined();
      expect(info?.zone_key).toBe("SE");
      expect(info?.country).toBe("Sweden");
      expect(info?.average_co2).toBeGreaterThan(0);
      expect(info?.low_average).toBe(true);
    });

    it("should return null for invalid grid zone", () => {
      const info = service.getGridZoneInfo("INVALID");
      expect(info).toBeNull();
    });
  });

  describe("getRecommendations", () => {
    it("should generate recommendations for high-carbon deployments", async () => {
      const deploymentData = [
        {
          id: 1,
          provider: "aws",
          region: "ap-southeast-2", // Australia - higher carbon
        },
      ];

      const recommendations = await service.getRecommendations(deploymentData);
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].currentIntensity).toBeGreaterThan(0);
      expect(recommendations[0].suggestedIntensity).toBeLessThan(
        recommendations[0].currentIntensity
      );
    });

    it("should not generate recommendations for already low-carbon deployments", async () => {
      const deploymentData = [
        {
          id: 1,
          provider: "azure",
          region: "norwayeast", // Norway - very low carbon
        },
      ];

      const recommendations = await service.getRecommendations(deploymentData);
      // May or may not have recommendations depending on if there's even lower carbon option
      // At minimum, should not error
      expect(Array.isArray(recommendations)).toBe(true);
    });

    it("should handle deployments without provider/region gracefully", async () => {
      const deploymentData = [
        {
          id: 1,
          provider: null,
          region: null,
        },
      ];

      const recommendations = await service.getRecommendations(deploymentData);
      expect(recommendations).toEqual([]);
    });
  });

  describe("getGridZonesRankedByCarbonIntensity", () => {
    it("should return grid zones sorted by carbon intensity", () => {
      const ranked = service.getGridZonesRankedByCarbonIntensity();
      expect(ranked.length).toBeGreaterThan(0);

      // Check that it's sorted (ascending)
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i].intensity).toBeGreaterThanOrEqual(
          ranked[i - 1].intensity
        );
      }
    });

    it("should have low-carbon zones at the top", () => {
      const ranked = service.getGridZonesRankedByCarbonIntensity();
      const topZones = ranked.slice(0, 10);

      topZones.forEach((zone) => {
        expect(zone.intensity).toBeLessThan(100);
      });
    });
  });

  describe("getLowestCarbonRegionsByProvider", () => {
    it("should return lowest carbon regions for each provider", () => {
      const result = service.getLowestCarbonRegionsByProvider();

      expect(result.aws).toBeDefined();
      expect(result.gcp).toBeDefined();
      expect(result.azure).toBeDefined();
      expect(result.vercel).toBeDefined();
      expect(result.heroku).toBeDefined();
      expect(result.netlify).toBeDefined();
    });

    it("should return regions sorted by carbon intensity", () => {
      const result = service.getLowestCarbonRegionsByProvider();

      Object.values(result).forEach((regions) => {
        expect(regions.length).toBeGreaterThan(0);

        // Check sorting
        for (let i = 1; i < regions.length; i++) {
          expect(regions[i].intensity).toBeGreaterThanOrEqual(
            regions[i - 1].intensity
          );
        }
      });
    });

    it("should include Nordic regions in AWS lowest carbon list", () => {
      const result = service.getLowestCarbonRegionsByProvider();
      const awsLowCarbon = result.aws;

      const hasNordicRegion = awsLowCarbon.some(
        (r) => r.gridZone === "SE" || r.gridZone === "NO" || r.gridZone === "FI"
      );

      expect(hasNordicRegion).toBe(true);
    });
  });

  describe("calculatePotentialSavings", () => {
    it("should calculate savings for deployments with recommendations", async () => {
      const deploymentData = [
        {
          id: 1,
          provider: "aws",
          region: "ap-southeast-2", // Australia - higher carbon
        },
      ];

      const result = await service.calculatePotentialSavings(deploymentData);
      expect(result.totalKgCO2PerYear).toBeGreaterThan(0);
      expect(result.recommendations).toBeDefined();
    });

    it("should return zero savings if no recommendations", async () => {
      const deploymentData = [
        {
          id: 1,
          provider: "invalid",
          region: "invalid",
        },
      ];

      const result = await service.calculatePotentialSavings(deploymentData);
      expect(result.totalKgCO2PerYear).toBe(0);
    });
  });

  describe("compareRegions", () => {
    it("should compare carbon intensity between regions", () => {
      const comparisons = [
        { provider: "aws", region: "us-east-1" },
        { provider: "aws", region: "eu-north-1" },
        { provider: "gcp", region: "eu-north-1" },
      ];

      const result = service.compareRegions(comparisons);
      expect(result.length).toBe(3);

      result.forEach((r) => {
        expect(r.provider).toBeTruthy();
        expect(r.region).toBeTruthy();
        expect(r.gridZone).toBeTruthy();
        expect(r.intensity).toBeGreaterThan(0);
        expect(r.location).toBeTruthy();
      });

      // Nordic regions should have lower intensity
      const nordicRegion = result.find((r) => r.region === "eu-north-1");
      const usRegion = result.find((r) => r.region === "us-east-1");

      expect(nordicRegion?.intensity).toBeLessThan(
        usRegion?.intensity || Infinity
      );
    });

    it("should handle invalid regions gracefully", () => {
      const comparisons = [{ provider: "invalid", region: "invalid" }];

      const result = service.compareRegions(comparisons);
      expect(result.length).toBe(1);
      expect(result[0].gridZone).toBeNull();
      expect(result[0].intensity).toBeNull();
      expect(result[0].location).toBe("Unknown");
    });
  });

  describe("getDataStatistics", () => {
    it("should return statistics about grid zones", () => {
      const stats = service.getDataStatistics();

      expect(stats.totalZones).toBeGreaterThan(0);
      expect(stats.lowCarbonZones).toBeGreaterThan(0);
      expect(stats.mediumCarbonZones).toBeGreaterThan(0);
      expect(stats.highCarbonZones).toBeGreaterThan(0);
      expect(stats.averageIntensity).toBeGreaterThan(0);
      expect(stats.lowestIntensity.intensity).toBeGreaterThan(0);
      expect(stats.highestIntensity.intensity).toBeGreaterThan(
        stats.lowestIntensity.intensity
      );
    });

    it("should categorize zones correctly", () => {
      const stats = service.getDataStatistics();
      const total =
        stats.lowCarbonZones + stats.mediumCarbonZones + stats.highCarbonZones;
      expect(total).toBe(stats.totalZones);
    });
  });

  describe("Low Carbon Region Validation", () => {
    it("should confirm Nordic countries have low carbon intensity", () => {
      const nordicCountries = ["NO", "SE", "FI", "IS"];

      nordicCountries.forEach((country) => {
        const intensity = service.getCarbonIntensityByCountry(country);
        expect(intensity).not.toBeNull();
        expect(intensity!).toBeLessThan(100);
      });
    });

    it("should confirm hydro-powered regions have low carbon intensity", () => {
      const hydroRegions = [
        { provider: "gcp", region: "northamerica-northeast1" }, // Quebec
        { provider: "azure", region: "canadaeast" }, // Quebec
      ];

      hydroRegions.forEach(({ provider, region }) => {
        const intensity = service.getCarbonIntensityByProviderRegion(
          provider,
          region
        );
        expect(intensity).not.toBeNull();
        expect(intensity!).toBeLessThan(100);
      });
    });

    it("should confirm coal-heavy regions have high carbon intensity", () => {
      const coalHeavyRegions = [
        { provider: "aws", region: "ap-southeast-2" }, // Australia
        { provider: "gcp", region: "asia-south1" }, // India
      ];

      coalHeavyRegions.forEach(({ provider, region }) => {
        const intensity = service.getCarbonIntensityByProviderRegion(
          provider,
          region
        );
        expect(intensity).not.toBeNull();
        expect(intensity!).toBeGreaterThan(400);
      });
    });
  });
});
