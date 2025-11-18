import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CarbonaraSWDAnalyzer, CarbonaraSWDResult } from '../../src/analyzers/carbonara-swd.js';

// Mock Playwright
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn()
  }
}));

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    blue: vi.fn((text: string) => text),
    green: vi.fn((text: string) => text),
    yellow: vi.fn((text: string) => text),
    white: vi.fn((text: string) => text),
    gray: vi.fn((text: string) => text),
    cyan: vi.fn((text: string) => text),
    bold: vi.fn((text: string) => text)
  }
}));

describe('CarbonaraSWDAnalyzer', () => {
  let analyzer: CarbonaraSWDAnalyzer;
  let mockBrowser: any;
  let mockPage: any;
  let mockContext: any;

  beforeEach(async () => {
    analyzer = new CarbonaraSWDAnalyzer();
    
    // Mock Playwright objects
    mockPage = {
      on: vi.fn(),
      setDefaultTimeout: vi.fn(),
      goto: vi.fn()
    };
    
    mockContext = {
      newPage: vi.fn().mockResolvedValue(mockPage)
    };
    
    mockBrowser = {
      newContext: vi.fn().mockResolvedValue(mockContext),
      close: vi.fn()
    };
    
    const { chromium } = await import('playwright');
    vi.mocked(chromium.launch).mockResolvedValue(mockBrowser);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateCarbonEmissions', () => {
    it('should calculate emissions using SWD model percentages', () => {
      // Test with 1 GB of data
      const bytes = 1024 * 1024 * 1024; // 1 GB
      const gridIntensity = 473; // gCO2e/kWh
      
      const result = analyzer['calculateCarbonEmissions'](bytes, gridIntensity);
      
      // Network energy: 1 GB * 0.04106063 kWh/GB = 0.04106063 kWh
      const expectedNetworkEnergy = 0.04106063;
      // Total energy: network energy / 0.14 = 0.293290214 kWh
      const expectedTotalEnergy = expectedNetworkEnergy / 0.14;
      
      // Network transfer: 0.04106063 * 473 = 19.421678 gCO2e
      expect(result.networkTransfer).toBeCloseTo(19.421678, 4);
      
      // Device usage: (0.293290214 * 0.52) * 473 = 72.138 gCO2e
      expect(result.deviceUsage).toBeCloseTo(72.138, 2);
      
      // Datacenter: (0.293290214 * 0.15) * 473 = 20.809 gCO2e
      expect(result.datacenterUsage).toBeCloseTo(20.809, 2);
      
      // Embodied: 1 GB * 0.0001 gCO2e/GB = 0.0001 gCO2e
      expect(result.embodiedCarbon).toBeCloseTo(0.0001, 4);
      
      // Total should be sum of all components
      const expectedTotal = result.networkTransfer + result.deviceUsage + 
                           result.datacenterUsage + result.embodiedCarbon;
      expect(result.total).toBeCloseTo(expectedTotal, 4);
    });

    it('should respect custom grid intensity', () => {
      const bytes = 1024 * 1024 * 1024; // 1 GB
      const customGridIntensity = 200; // gCO2e/kWh
      
      const result = analyzer['calculateCarbonEmissions'](bytes, customGridIntensity);
      
      // Network energy: 1 GB * 0.04106063 kWh/GB = 0.04106063 kWh
      // Network transfer: 0.04106063 * 200 = 8.212126 gCO2e
      expect(result.networkTransfer).toBeCloseTo(8.212126, 4);
      
      // All components should be proportionally lower
      expect(result.networkTransfer).toBeLessThan(20);
      expect(result.deviceUsage).toBeLessThan(80);
      expect(result.datacenterUsage).toBeLessThan(25);
      expect(result.embodiedCarbon).toBeLessThan(30);
    });

    it('should handle zero bytes', () => {
      const result = analyzer['calculateCarbonEmissions'](0, 473);
      
      expect(result.networkTransfer).toBe(0);
      expect(result.deviceUsage).toBe(0);
      expect(result.datacenterUsage).toBe(0);
      expect(result.embodiedCarbon).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should verify SWD model breakdown percentages', () => {
      const bytes = 1024 * 1024 * 1024; // 1 GB
      const gridIntensity = 473;
      
      const result = analyzer['calculateCarbonEmissions'](bytes, gridIntensity);
      
      // Calculate the energy components to verify percentages
      const networkEnergy = 0.04106063; // kWh
      const totalEnergy = networkEnergy / 0.14; // kWh
      
      // Verify device usage is 52% of total energy
      const expectedDeviceEnergy = totalEnergy * 0.52;
      const actualDeviceEnergy = result.deviceUsage / gridIntensity;
      expect(actualDeviceEnergy).toBeCloseTo(expectedDeviceEnergy, 6);
      
      // Verify datacenter is 15% of total energy
      const expectedDatacenterEnergy = totalEnergy * 0.15;
      const actualDatacenterEnergy = result.datacenterUsage / gridIntensity;
      expect(actualDatacenterEnergy).toBeCloseTo(expectedDatacenterEnergy, 6);
      
      // Verify embodied carbon is calculated per data transfer, not as energy percentage
      const gb = bytes / (1024 * 1024 * 1024); // Convert bytes to GB
      const expectedEmbodiedCarbon = gb * 0.0001; // gCO2e/GB
      expect(result.embodiedCarbon).toBeCloseTo(expectedEmbodiedCarbon, 6);
    });
  });

  describe('calculateEnergyUsage', () => {
    it('should calculate network energy from bytes', () => {
      const bytes = 1024 * 1024 * 1024; // 1 GB
      
      const result = analyzer['calculateEnergyUsage'](bytes);
      
      // Network energy: 1 GB * 0.04106063 kWh/GB = 0.04106063 kWh
      expect(result.networkTransfer).toBeCloseTo(0.04106063, 8);
    });

    it('should derive total energy (network = 14%)', () => {
      const bytes = 1024 * 1024 * 1024; // 1 GB
      
      const result = analyzer['calculateEnergyUsage'](bytes);
      
      // Total energy: network energy / 0.14
      const expectedTotal = 0.04106063 / 0.14;
      expect(result.total).toBeCloseTo(expectedTotal, 6);
    });

    it('should handle zero bytes', () => {
      const result = analyzer['calculateEnergyUsage'](0);
      
      expect(result.networkTransfer).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should verify network intensity constant', () => {
      const bytes = 1024 * 1024 * 1024; // 1 GB
      
      const result = analyzer['calculateEnergyUsage'](bytes);
      
      // Verify the network intensity constant (0.04106063 kWh/GB)
      expect(result.networkTransfer).toBe(0.04106063);
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly for different units', () => {
      expect(analyzer['formatBytes'](0)).toBe('0 B');
      expect(analyzer['formatBytes'](1024)).toBe('1 KB');
      expect(analyzer['formatBytes'](1024 * 1024)).toBe('1 MB');
      expect(analyzer['formatBytes'](1024 * 1024 * 1024)).toBe('1 GB');
      expect(analyzer['formatBytes'](1024 * 1024 * 1024 * 1024)).toBe('1 TB');
    });

    it('should handle fractional values', () => {
      expect(analyzer['formatBytes'](1536)).toBe('1.5 KB');
      expect(analyzer['formatBytes'](2.5 * 1024 * 1024)).toBe('2.5 MB');
    });

    it('should handle very large numbers', () => {
      const largeBytes = 5 * 1024 * 1024 * 1024 * 1024; // 5 TB
      expect(analyzer['formatBytes'](largeBytes)).toBe('5 TB');
    });

    it('should handle edge cases', () => {
      expect(analyzer['formatBytes'](1)).toBe('1 B');
      expect(analyzer['formatBytes'](1023)).toBe('1023 B');
      expect(analyzer['formatBytes'](1025)).toBe('1 KB');
    });
  });

  describe('formatResults', () => {
    it('should format results with proper structure', () => {
      const mockResult: CarbonaraSWDResult = {
        url: 'https://example.com',
        totalBytes: 1024 * 1024, // 1 MB
        resources: [
          {
            url: 'https://example.com/style.css',
            type: 'stylesheet',
            size: 1024,
            status: 200
          }
        ],
        carbonEmissions: {
          networkTransfer: 0.001,
          deviceUsage: 0.004,
          datacenterUsage: 0.001,
          embodiedCarbon: 0.002,
          total: 0.008
        },
        energyUsage: {
          networkTransfer: 0.000001,
          total: 0.000007
        },
        metadata: {
          loadTime: 1500,
          resourceCount: 1,
          analysisTimestamp: '2025-01-01T00:00:00.000Z',
          carbonIntensity: 473,
          model: 'SWD v4 + Coroama (2021) Network Intensity Model',
          methodology: 'Sustainable Web Design model with Energy Intensity approach for network transfer',
          references: [
            'Coroama, V. (2021) - Swiss Federal Office of Energy SFOE',
            'CO2.js - The Green Web Foundation',
            'Ember Global Electricity Review 2025',
            'green-coding.io CO2 formulas'
          ]
        }
      };

      const formatted = analyzer.formatResults(mockResult);
      
      expect(formatted).toContain('🌱 Carbonara SWD Analysis');
      expect(formatted).toContain('https://example.com');
      expect(formatted).toContain('1 MB');
      expect(formatted).toContain('1 files');
      expect(formatted).toContain('1500ms');
      expect(formatted).toContain('0.0080 g CO2e');
      expect(formatted).toContain('473 g CO2e/kWh');
      expect(formatted).toContain('SWD v4 + Coroama (2021)');
    });
  });

  describe('analyze', () => {
    it('should perform complete analysis flow', async () => {
      const mockResponse = {
        request: vi.fn().mockReturnValue({
          url: () => 'https://example.com/style.css',
          resourceType: () => 'stylesheet'
        }),
        headers: vi.fn().mockReturnValue({
          'content-length': '1024'
        }),
        status: vi.fn().mockReturnValue(200)
      };

      mockPage.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'response') {
          // Simulate a response event
          setTimeout(() => callback(mockResponse), 10);
        }
      });

      mockPage.goto.mockResolvedValue(undefined);

      const result = await analyzer.analyze('https://example.com', {
        timeout: 5000,
        gridIntensity: 400,
        returningVisitor: false
      });

      expect(result).toHaveProperty('url', 'https://example.com');
      expect(result).toHaveProperty('totalBytes');
      expect(result).toHaveProperty('resources');
      expect(result).toHaveProperty('carbonEmissions');
      expect(result).toHaveProperty('energyUsage');
      expect(result).toHaveProperty('metadata');
      
      expect(result.metadata.carbonIntensity).toBe(400);
      expect(result.metadata.model).toContain('SWD v4');
      
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('should handle returning visitor mode', async () => {
      mockPage.on.mockImplementation(() => {});
      mockPage.goto.mockResolvedValue(undefined);

      const result = await analyzer.analyze('https://example.com', {
        returningVisitor: true
      });

      // Returning visitor should load only 2% of data
      // This affects the effective bytes used in calculations
      expect(result.metadata.model).toContain('SWD v4');
    });

    it('should handle timeout configuration', async () => {
      mockPage.on.mockImplementation(() => {});
      mockPage.goto.mockResolvedValue(undefined);

      await analyzer.analyze('https://example.com', {
        timeout: 10000
      });

      expect(mockPage.setDefaultTimeout).toHaveBeenCalledWith(10000);
    });

    it('should handle custom grid intensity', async () => {
      mockPage.on.mockImplementation(() => {});
      mockPage.goto.mockResolvedValue(undefined);

      const result = await analyzer.analyze('https://example.com', {
        gridIntensity: 300
      });

      expect(result.metadata.carbonIntensity).toBe(300);
    });

    it('should use default values when options not provided', async () => {
      mockPage.on.mockImplementation(() => {});
      mockPage.goto.mockResolvedValue(undefined);

      const result = await analyzer.analyze('https://example.com');

      expect(result.metadata.carbonIntensity).toBe(473); // Default global grid intensity
      expect(mockPage.setDefaultTimeout).toHaveBeenCalledWith(30000); // Default timeout
    });

    it('should filter successful requests only', async () => {
      const mockResponseSuccess = {
        request: vi.fn().mockReturnValue({
          url: () => 'https://example.com/success.css',
          resourceType: () => 'stylesheet'
        }),
        headers: vi.fn().mockReturnValue({ 'content-length': '1024' }),
        status: vi.fn().mockReturnValue(200)
      };

      const mockResponseError = {
        request: vi.fn().mockReturnValue({
          url: () => 'https://example.com/error.css',
          resourceType: () => 'stylesheet'
        }),
        headers: vi.fn().mockReturnValue({ 'content-length': '0' }),
        status: vi.fn().mockReturnValue(404)
      };

      mockPage.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'response') {
          setTimeout(() => callback(mockResponseSuccess), 10);
          setTimeout(() => callback(mockResponseError), 20);
        }
      });

      mockPage.goto.mockResolvedValue(undefined);

      const result = await analyzer.analyze('https://example.com');

      // Only successful requests (status < 400) should be included
      expect(result.resources.every((r: any) => r.status < 400)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle browser launch errors', async () => {
      const { chromium } = await import('playwright');
      vi.mocked(chromium.launch).mockRejectedValue(new Error('Browser launch failed'));

      await expect(analyzer.analyze('https://example.com')).rejects.toThrow('Browser launch failed');
    });

    it('should handle page navigation errors', async () => {
      mockPage.goto.mockRejectedValue(new Error('Navigation failed'));

      await expect(analyzer.analyze('https://example.com')).rejects.toThrow('Navigation failed');
      
      // Should still close browser even on error
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('should handle invalid URLs gracefully', async () => {
      mockPage.goto.mockRejectedValue(new Error('Invalid URL'));

      await expect(analyzer.analyze('invalid-url')).rejects.toThrow('Invalid URL');
    });
  });

  describe('Constants and Configuration', () => {
    it('should use correct SWD model constants', () => {
      // These are private constants, but we can verify they're used correctly
      // by testing the calculations that depend on them
      const bytes = 1024 * 1024 * 1024; // 1 GB
      const result = analyzer['calculateEnergyUsage'](bytes);
      
      // Network intensity should be 0.04106063 kWh/GB
      expect(result.networkTransfer).toBe(0.04106063);
      
      // Total energy should be network / 0.14 (SWD_NETWORK)
      expect(result.total).toBeCloseTo(0.04106063 / 0.14, 6);
    });

    it('should use correct SWD breakdown percentages', () => {
      const bytes = 1024 * 1024 * 1024; // 1 GB
      const gridIntensity = 473;
      const result = analyzer['calculateCarbonEmissions'](bytes, gridIntensity);
      
      // Calculate energy components to verify percentages
      const networkEnergy = 0.04106063;
      const totalEnergy = networkEnergy / 0.14;
      
      // Device: 52% of total energy
      const deviceEnergy = result.deviceUsage / gridIntensity;
      expect(deviceEnergy).toBeCloseTo(totalEnergy * 0.52, 6);
      
      // Datacenter: 15% of total energy
      const datacenterEnergy = result.datacenterUsage / gridIntensity;
      expect(datacenterEnergy).toBeCloseTo(totalEnergy * 0.15, 6);
      
      // Embodied: calculated per data transfer, not as energy percentage
      const gb = bytes / (1024 * 1024 * 1024); // Convert bytes to GB
      const expectedEmbodiedCarbon = gb * 0.0001; // gCO2e/GB
      expect(result.embodiedCarbon).toBeCloseTo(expectedEmbodiedCarbon, 6);
    });
  });
});
