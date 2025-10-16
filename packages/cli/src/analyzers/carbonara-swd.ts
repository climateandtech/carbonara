import { chromium } from 'playwright';
import chalk from 'chalk';

export interface CarbonaraSWDResult {
  url: string;
  totalBytes: number;
  resources: Array<{
    url: string;
    type: string;
    size: number;
    status: number;
  }>;
  carbonEmissions: {
    networkTransfer: number; // gCO2e
    deviceUsage: number; // gCO2e
    datacenterUsage: number; // gCO2e
    embodiedCarbon: number; // gCO2e
    total: number; // gCO2e
  };
  energyUsage: {
    networkTransfer: number; // kWh
    total: number; // kWh
  };
  metadata: {
    loadTime: number; // ms
    resourceCount: number;
    analysisTimestamp: string;
    carbonIntensity: number; // gCO2e/kWh
    model: string;
    methodology?: string;
    references?: string[];
  };
}

/**
 * Carbonara SWD Analyzer
 * 
 * This analyzer estimates CO2 emissions from web page data transfer using the
 * Sustainable Web Design (SWD) model from CO2.js and established research.
 * 
 * REFERENCES:
 * [1] Coroama, V. (2021) - "Investigating the inconsistencies among energy and 
 *     energy intensity estimates of the internet" - Swiss Federal Office of Energy SFOE
 *     Source: https://www.green-coding.io/co2-formulas/
 * 
 * [2] CO2.js - Open-source JavaScript library by The Green Web Foundation
 *     Sustainable Web Design (SWD) model implementation
 *     Source: https://www.thegreenwebfoundation.org/co2-js/
 * 
 * [3] Ember Global Electricity Review 2025 - Global grid carbon intensity data
 *     473 gCO2e/kWh global average for 2024
 *     Source: https://ember-climate.org/
 * 
 * [4] Green Web Foundation - Digital carbon measurement methodologies
 *     Source: https://www.thegreenwebfoundation.org/
 * 
 * [5] Green Coding Organization - CO2 calculation formulas and network intensity
 *     0.04106063 kWh/GB network transfer intensity (WAN+FAN+RAN model)
 *     Source: https://www.green-coding.io/co2-formulas/
 */
export class CarbonaraSWDAnalyzer {
  // Network intensity based on Energy Intensity Model from Coroama (2021) [1]
  // Includes WAN (Wide Area Network) + FAN (Fixed Access Network) + RAN (Radio Access Network)
  // Extrapolated values for 2025, with RAN ≈ 10%, FAN ≈ 90% weighting
  private static readonly NETWORK_INTENSITY = 0.04106063; // kWh/GB [1,5]
  
  // Global grid carbon intensity from Ember Global Electricity Review 2025 [3]
  private static readonly GLOBAL_GRID_INTENSITY = 473; // gCO2e/kWh (2024 average)
  
  // Sustainable Web Design (SWD) model system breakdown percentages [2]
  // Based on CO2.js implementation of the SWD model
  private static readonly SWD_CONSUMER_DEVICE = 0.52; // End user device usage (52%)
  private static readonly SWD_NETWORK = 0.14;         // Network data transfer (14%)
  private static readonly SWD_DATACENTER = 0.15;      // Data center operations (15%)
  private static readonly SWD_EMBODIED = 0.19;        // Hardware manufacturing (19%)
  
  // Embodied carbon per GB of data transfer (gCO2e/GB)
  // Based on device manufacturing emissions allocated per data transfer
  // This represents the carbon footprint of device manufacturing per byte of data processed
  private static readonly EMBODIED_CARBON_PER_GB = 0.0001; // gCO2e/GB
  
  // Returning visitor model assumptions from SWD methodology [2]
  private static readonly RETURNING_VISITOR_PERCENTAGE = 0.25;      // 25% of visitors are returning
  private static readonly RETURNING_VISITOR_DATA_PERCENTAGE = 0.02; // Load only 2% of original data

  async analyze(url: string, options: { 
    timeout?: number;
    gridIntensity?: number;
    returningVisitor?: boolean;
  } = {}): Promise<CarbonaraSWDResult> {
    const startTime = Date.now();
    
    console.log(chalk.blue(`🔍 Analyzing ${url}...`));
    
    const browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      const resources: Array<{ url: string; type: string; size: number; status: number; }> = [];
      
      // Track network requests
      page.on('response', async (response) => {
        try {
          const request = response.request();
          const headers = response.headers();
          const contentLength = headers['content-length'];
          const size = contentLength ? parseInt(contentLength) : 0;
          
          resources.push({
            url: request.url(),
            type: request.resourceType(),
            size: size,
            status: response.status()
          });
        } catch (error) {
          // Ignore errors from individual resource tracking
        }
      });
      
      // Set timeout
      page.setDefaultTimeout(options.timeout || 30000);
      
      // Navigate to the page
      await page.goto(url, { waitUntil: 'networkidle' });
      
      const loadTime = Date.now() - startTime;
      
      // Calculate total bytes
      const totalBytes = resources.reduce((sum, resource) => sum + resource.size, 0);
      
      // Apply returning visitor adjustment if specified
      const effectiveBytes = options.returningVisitor 
        ? totalBytes * CarbonaraSWDAnalyzer.RETURNING_VISITOR_DATA_PERCENTAGE
        : totalBytes;
      
      // Calculate carbon emissions using SWD model
      const carbonEmissions = this.calculateCarbonEmissions(
        effectiveBytes, 
        options.gridIntensity || CarbonaraSWDAnalyzer.GLOBAL_GRID_INTENSITY
      );
      
      // Calculate energy usage
      const energyUsage = this.calculateEnergyUsage(effectiveBytes);
      
      return {
        url,
        totalBytes,
        resources: resources.filter(r => r.status < 400), // Only successful requests
        carbonEmissions,
        energyUsage,
        metadata: {
          loadTime,
          resourceCount: resources.length,
          analysisTimestamp: new Date().toISOString(),
          carbonIntensity: options.gridIntensity || CarbonaraSWDAnalyzer.GLOBAL_GRID_INTENSITY,
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
      
    } finally {
      await browser.close();
    }
  }
  
  private calculateCarbonEmissions(bytes: number, gridIntensity: number): CarbonaraSWDResult['carbonEmissions'] {
    // Convert bytes to GB
    const gb = bytes / (1024 * 1024 * 1024);
    
    // Calculate network energy consumption (kWh)
    const networkEnergy = gb * CarbonaraSWDAnalyzer.NETWORK_INTENSITY;
    
    // Calculate total energy based on SWD model
    // Network represents 14% of total system energy
    const totalEnergy = networkEnergy / CarbonaraSWDAnalyzer.SWD_NETWORK;
    
    // Calculate emissions for operational components (network, device, datacenter)
    const networkTransfer = networkEnergy * gridIntensity;
    const deviceUsage = (totalEnergy * CarbonaraSWDAnalyzer.SWD_CONSUMER_DEVICE) * gridIntensity;
    const datacenterUsage = (totalEnergy * CarbonaraSWDAnalyzer.SWD_DATACENTER) * gridIntensity;
    
    // Calculate embodied carbon based on device manufacturing emissions per data transfer
    // This represents the carbon footprint of device manufacturing allocated per byte of data
    // Based on SWD v4 model: embodied carbon is calculated per data transfer, not as operational energy
    const embodiedCarbon = gb * CarbonaraSWDAnalyzer.EMBODIED_CARBON_PER_GB;
    
    return {
      networkTransfer,
      deviceUsage,
      datacenterUsage,
      embodiedCarbon,
      total: networkTransfer + deviceUsage + datacenterUsage + embodiedCarbon
    };
  }
  
  private calculateEnergyUsage(bytes: number): CarbonaraSWDResult['energyUsage'] {
    // Convert bytes to GB
    const gb = bytes / (1024 * 1024 * 1024);
    
    // Calculate network energy consumption (kWh)
    const networkTransfer = gb * CarbonaraSWDAnalyzer.NETWORK_INTENSITY;
    
    // Calculate total energy based on SWD model
    const total = networkTransfer / CarbonaraSWDAnalyzer.SWD_NETWORK;
    
    return {
      networkTransfer,
      total
    };
  }
  
  formatResults(result: CarbonaraSWDResult): string {
    const lines = [
      chalk.blue('🌱 Carbonara SWD Analysis'),
      chalk.gray('═'.repeat(50)),
      chalk.cyan(`URL: ${result.url}`),
      '',
      chalk.green('📊 Data Transfer:'),
      `  Total Size: ${chalk.white(this.formatBytes(result.totalBytes))}`,
      `  Resources: ${chalk.white(result.metadata.resourceCount)} files`,
      `  Load Time: ${chalk.white(result.metadata.loadTime)}ms`,
      '',
      chalk.green('⚡ Energy Usage:'),
      `  Network: ${chalk.white(result.energyUsage.networkTransfer.toFixed(6))} kWh`,
      `  Total System: ${chalk.white(result.energyUsage.total.toFixed(6))} kWh`,
      '',
      chalk.green('🌍 Carbon Emissions:'),
      `  Network Transfer: ${chalk.white(result.carbonEmissions.networkTransfer.toFixed(4))} g CO2e`,
      `  Device Usage: ${chalk.white(result.carbonEmissions.deviceUsage.toFixed(4))} g CO2e`,
      `  Data Center: ${chalk.white(result.carbonEmissions.datacenterUsage.toFixed(4))} g CO2e`,
      `  Embodied Carbon: ${chalk.white(result.carbonEmissions.embodiedCarbon.toFixed(4))} g CO2e`,
      `  ${chalk.bold('Total: ' + chalk.white(result.carbonEmissions.total.toFixed(4)) + ' g CO2e')}`,
      '',
      chalk.blue('📈 Model Details:'),
      `  Grid Intensity: ${chalk.white(result.metadata.carbonIntensity)} g CO2e/kWh`,
      `  Model: ${chalk.gray(result.metadata.model)}`,
      '',
      chalk.blue('📚 References:'),
      chalk.gray('  [1] Coroama, V. (2021) - Swiss Federal Office of Energy SFOE'),
      chalk.gray('  [2] CO2.js - The Green Web Foundation (SWD model)'),
      chalk.gray('  [3] Ember Global Electricity Review 2025'),
      chalk.gray('  [4] green-coding.io - CO2 calculation formulas'),
      `  Analysis: ${chalk.gray(result.metadata.analysisTimestamp)}`
    ];
    
    return lines.join('\n');
  }
  
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
}