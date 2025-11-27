/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2025 Carbonara team
 */

export type BadgeColor = 'green' | 'yellow' | 'orange' | 'red' | 'none';

export interface ThresholdConfig {
  green?: { max?: number; min?: number };
  yellow?: { min?: number; max?: number };
  orange?: { min?: number; max?: number };
  red?: { min?: number; max?: number };
}

export interface MetricThresholds {
  carbonIntensity: ThresholdConfig;
  co2Emissions: ThresholdConfig;
  energy: ThresholdConfig;
  dataTransfer: ThresholdConfig;
  loadTime: ThresholdConfig;
}

/**
 * Service for managing thresholds and calculating badge colors
 * Based on scientific baselines and configurable thresholds
 */
export class ThresholdService {
  private thresholds: MetricThresholds;

  constructor(customThresholds?: Partial<MetricThresholds>) {
    // Default thresholds based on scientific research
    this.thresholds = {
      carbonIntensity: {
        green: { max: 100 }, // < 100 gCO2/kWh (low carbon regions)
        yellow: { min: 100, max: 300 }, // 100-300 gCO2/kWh (medium)
        orange: { min: 300, max: 500 }, // 300-500 gCO2/kWh (high)
        red: { min: 500 }, // >= 500 gCO2/kWh (very high)
      },
      co2Emissions: {
        green: { max: 0.1 }, // < 0.1g (excellent)
        yellow: { min: 0.1, max: 0.5 }, // 0.1-0.5g (good)
        orange: { min: 0.5, max: 1.0 }, // 0.5-1.0g (moderate)
        red: { min: 1.0 }, // >= 1.0g (high)
      },
      energy: {
        green: { max: 0.0001 }, // < 0.0001 kWh (excellent)
        yellow: { min: 0.0001, max: 0.0005 }, // 0.0001-0.0005 kWh (good)
        orange: { min: 0.0005, max: 0.001 }, // 0.0005-0.001 kWh (moderate)
        red: { min: 0.001 }, // >= 0.001 kWh (high)
      },
      dataTransfer: {
        green: { max: 100 }, // < 100 KB (excellent)
        yellow: { min: 100, max: 500 }, // 100-500 KB (good)
        orange: { min: 500, max: 2000 }, // 500-2000 KB (moderate)
        red: { min: 2000 }, // >= 2000 KB (high)
      },
      loadTime: {
        green: { max: 1000 }, // < 1000ms (excellent)
        yellow: { min: 1000, max: 3000 }, // 1000-3000ms (good)
        orange: { min: 3000, max: 5000 }, // 3000-5000ms (moderate)
        red: { min: 5000 }, // >= 5000ms (high)
      },
      ...customThresholds,
    };
  }

  /**
   * Get badge color based on absolute threshold
   */
  getBadgeColor(metricType: keyof MetricThresholds, value: number | null | undefined): BadgeColor {
    if (value === null || value === undefined || isNaN(value)) {
      return 'none';
    }

    const config = this.thresholds[metricType];
    const numValue = Number(value);

    // Check thresholds in order: red -> orange -> yellow -> green
    if (config.red) {
      if (config.red.min !== undefined && numValue >= config.red.min) {
        return 'red';
      }
      if (config.red.max !== undefined && numValue > config.red.max) {
        return 'red';
      }
    }

    if (config.orange) {
      if (
        (config.orange.min === undefined || numValue >= config.orange.min) &&
        (config.orange.max === undefined || numValue < config.orange.max)
      ) {
        return 'orange';
      }
    }

    if (config.yellow) {
      if (
        (config.yellow.min === undefined || numValue >= config.yellow.min) &&
        (config.yellow.max === undefined || numValue < config.yellow.max)
      ) {
        return 'yellow';
      }
    }

    if (config.green) {
      if (config.green.max !== undefined && numValue <= config.green.max) {
        return 'green';
      }
      if (config.green.min !== undefined && numValue >= config.green.min) {
        return 'green';
      }
    }

    // Default to green if value is below all thresholds
    return 'green';
  }

  /**
   * Get badge color with relative comparison (within project)
   * Only enhances color if already flagged by absolute threshold
   */
  getBadgeColorWithRelative(
    metricType: keyof MetricThresholds,
    value: number | null | undefined,
    projectAverage: number | null | undefined
  ): BadgeColor {
    const absoluteColor = this.getBadgeColor(metricType, value);

    // If all entries are green (below absolute thresholds), keep them all green
    // even if one is heavier than others in the project
    if (absoluteColor === 'green' || absoluteColor === 'none') {
      return absoluteColor;
    }

    // Only apply relative comparison if already flagged by absolute threshold
    if (projectAverage !== null && projectAverage !== undefined && value !== null && value !== undefined) {
      const numValue = Number(value);
      const numAverage = Number(projectAverage);

      // If value is significantly above project average, enhance the color
      if (numValue > numAverage * 1.5) {
        // Move up one level if not already red
        if (absoluteColor === 'yellow') return 'orange';
        if (absoluteColor === 'orange') return 'red';
      }
    }

    return absoluteColor;
  }

  /**
   * Calculate project average for a metric across all entries
   */
  calculateProjectAverage(
    entries: Array<{ data: any }>,
    metricType: keyof MetricThresholds,
    extractor: (entry: any) => number | null | undefined
  ): number | null {
    const values: number[] = [];

    for (const entry of entries) {
      const value = extractor(entry);
      if (value !== null && value !== undefined && !isNaN(value)) {
        values.push(Number(value));
      }
    }

    if (values.length === 0) {
      return null;
    }

    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
  }
}



