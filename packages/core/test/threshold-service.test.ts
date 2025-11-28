import { describe, it, expect, beforeEach } from 'vitest';
import { ThresholdService, BadgeColor } from '../src/threshold-service.js';

describe('ThresholdService', () => {
  let service: ThresholdService;

  beforeEach(() => {
    service = new ThresholdService();
  });

  describe('getBadgeColor', () => {
    it('should return correct colors for carbon intensity', () => {
      expect(service.getBadgeColor('carbonIntensity', 50)).toBe('green');
      expect(service.getBadgeColor('carbonIntensity', 100)).toBe('yellow');
      expect(service.getBadgeColor('carbonIntensity', 200)).toBe('yellow');
      expect(service.getBadgeColor('carbonIntensity', 300)).toBe('orange');
      expect(service.getBadgeColor('carbonIntensity', 400)).toBe('orange');
      expect(service.getBadgeColor('carbonIntensity', 500)).toBe('red');
      expect(service.getBadgeColor('carbonIntensity', 600)).toBe('red');
    });

    it('should return correct colors for CO2 emissions', () => {
      expect(service.getBadgeColor('co2Emissions', 0.05)).toBe('green');
      expect(service.getBadgeColor('co2Emissions', 0.1)).toBe('yellow');
      expect(service.getBadgeColor('co2Emissions', 0.3)).toBe('yellow');
      expect(service.getBadgeColor('co2Emissions', 0.5)).toBe('orange');
      expect(service.getBadgeColor('co2Emissions', 0.7)).toBe('orange');
      expect(service.getBadgeColor('co2Emissions', 1.0)).toBe('red');
      expect(service.getBadgeColor('co2Emissions', 1.5)).toBe('red');
    });

    it('should return correct colors for data transfer', () => {
      expect(service.getBadgeColor('dataTransfer', 50)).toBe('green');
      expect(service.getBadgeColor('dataTransfer', 100)).toBe('yellow');
      expect(service.getBadgeColor('dataTransfer', 300)).toBe('yellow');
      expect(service.getBadgeColor('dataTransfer', 500)).toBe('orange');
      expect(service.getBadgeColor('dataTransfer', 1000)).toBe('orange');
      expect(service.getBadgeColor('dataTransfer', 2000)).toBe('red');
      expect(service.getBadgeColor('dataTransfer', 3000)).toBe('red');
    });

    it('should return correct colors for load time', () => {
      expect(service.getBadgeColor('loadTime', 500)).toBe('green');
      expect(service.getBadgeColor('loadTime', 1000)).toBe('yellow');
      expect(service.getBadgeColor('loadTime', 2000)).toBe('yellow');
      expect(service.getBadgeColor('loadTime', 3000)).toBe('orange');
      expect(service.getBadgeColor('loadTime', 4000)).toBe('orange');
      expect(service.getBadgeColor('loadTime', 5000)).toBe('red');
      expect(service.getBadgeColor('loadTime', 6000)).toBe('red');
    });

    it('should return none for null, undefined, or NaN values', () => {
      expect(service.getBadgeColor('carbonIntensity', null)).toBe('none');
      expect(service.getBadgeColor('carbonIntensity', undefined)).toBe('none');
      expect(service.getBadgeColor('carbonIntensity', NaN)).toBe('none');
    });
  });

  describe('getBadgeColorWithRelative', () => {
    it('should return green if all entries are green (below absolute thresholds)', () => {
      // Even if value is above project average, if absolute threshold says green, stay green
      const color = service.getBadgeColorWithRelative('co2Emissions', 0.05, 0.03);
      expect(color).toBe('green');
    });

    it('should enhance color if value is significantly above project average and already flagged', () => {
      // Value is yellow (0.3) and significantly above average (0.15), should enhance to orange
      // 0.3 > 0.15 * 1.5 (0.225), so it should enhance
      const color = service.getBadgeColorWithRelative('co2Emissions', 0.3, 0.15);
      expect(color).toBe('orange');
    });

    it('should not enhance if value is not significantly above average', () => {
      // Value is yellow (0.3) but only slightly above average (0.25)
      const color = service.getBadgeColorWithRelative('co2Emissions', 0.3, 0.25);
      // 0.3 is not > 0.25 * 1.5 (0.375), so should stay yellow
      expect(color).toBe('yellow');
    });

    it('should handle null project average', () => {
      const color = service.getBadgeColorWithRelative('co2Emissions', 0.3, null);
      expect(color).toBe('yellow'); // Should use absolute threshold only
    });
  });

  describe('calculateProjectAverage', () => {
    it('should calculate average from entries', () => {
      const entries = [
        { data: { carbonEmissions: { total: 0.1 } } },
        { data: { carbonEmissions: { total: 0.2 } } },
        { data: { carbonEmissions: { total: 0.3 } } },
      ];

      const average = service.calculateProjectAverage(
        entries,
        'co2Emissions',
        (e) => e.data.carbonEmissions?.total
      );

      expect(average).toBeCloseTo(0.2, 5);
    });

    it('should return null if no valid values', () => {
      const entries = [
        { data: {} },
        { data: { carbonEmissions: null } },
      ];

      const average = service.calculateProjectAverage(
        entries,
        'co2Emissions',
        (e) => e.data.carbonEmissions?.total
      );

      expect(average).toBeNull();
    });

    it('should filter out null and undefined values', () => {
      const entries = [
        { data: { carbonEmissions: { total: 0.1 } } },
        { data: { carbonEmissions: { total: null } } },
        { data: { carbonEmissions: { total: 0.3 } } },
      ];

      const average = service.calculateProjectAverage(
        entries,
        'co2Emissions',
        (e) => e.data.carbonEmissions?.total
      );

      expect(average).toBeCloseTo(0.2, 5); // Average of 0.1 and 0.3
    });
  });

  describe('custom thresholds', () => {
    it('should use custom thresholds when provided', () => {
      const customService = new ThresholdService({
        carbonIntensity: {
          green: { max: 50 },
          yellow: { min: 50, max: 150 },
          orange: { min: 150, max: 250 },
          red: { min: 250 },
        },
      });

      expect(customService.getBadgeColor('carbonIntensity', 30)).toBe('green');
      expect(customService.getBadgeColor('carbonIntensity', 100)).toBe('yellow');
      expect(customService.getBadgeColor('carbonIntensity', 200)).toBe('orange');
      expect(customService.getBadgeColor('carbonIntensity', 300)).toBe('red');
    });
  });
});

