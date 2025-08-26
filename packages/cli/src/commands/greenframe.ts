import execa from 'execa';
import chalk from 'chalk';
import ora from 'ora';
import { createDataLake } from '../database/index.js';
import { loadProjectConfig } from '../utils/config.js';

interface GreenframeOptions {
  save: boolean;
  output: 'json' | 'table';
}

export async function greenframeCommand(url: string, options: GreenframeOptions) {
  const spinner = ora('Running Greenframe analysis...').start();
  
  try {
    // Validate URL
    try {
      new URL(url);
    } catch {
      throw new Error('Invalid URL provided');
    }

    // Check if Greenframe is installed
    try {
      await execa('npx', ['--version']);
    } catch {
      throw new Error('npx is required to run Greenframe. Please install Node.js');
    }

    spinner.text = 'Running Greenframe web analysis...';
    
    // Run Greenframe analysis
    const greenframeResult = await execa('npx', [
      'greenframe',
      'analyze',
      url,
      '--format=json'
    ], {
      stdio: 'pipe'
    });

    spinner.succeed('Greenframe analysis completed!');

    // Parse results
    const results = JSON.parse(greenframeResult.stdout);
    
    // Display results
    displayResults(results, options.output);

    // Save to database if requested
    if (options.save) {
      await saveToDatabase(url, results);
    }

  } catch (error: any) {
    spinner.fail('Greenframe analysis failed');
    
    if (error.message.includes('greenframe')) {
      console.log(chalk.yellow('\n💡 Greenframe CLI not found. Install it with:'));
      console.log(chalk.white('npm install -g greenframe-cli'));
      console.log(chalk.gray('or use:'));
      console.log(chalk.white('npx greenframe-cli analyze ' + url));
    } else {
      console.error(chalk.red('Error:'), error.message);
    }
    
    process.exit(1);
  }
}

function displayResults(results: any, format: 'json' | 'table') {
  if (format === 'json') {
    // Raw JSON output for programmatic consumption (no formatting or headers)
    console.log(JSON.stringify(results));
    return;
  }

  // Table format with headers
  console.log(chalk.blue('\n📊 Greenframe Analysis Results'));
  console.log('═'.repeat(50));

  // Table format
  if (results.url) {
    console.log(chalk.green('🌐 URL:'), results.url);
  }
  
  if (results.carbon) {
    console.log(chalk.green('🌱 Carbon Footprint:'), `${results.carbon.total}g CO2`);
    
    if (results.carbon.breakdown) {
      console.log(chalk.blue('\n📋 Breakdown:'));
      Object.entries(results.carbon.breakdown).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}g CO2`);
      });
    }
  }

  if (results.performance) {
    console.log(chalk.blue('\n⚡ Performance:'));
    console.log(`  Load Time: ${results.performance.loadTime}ms`);
    console.log(`  Page Size: ${results.performance.pageSize}KB`);
    console.log(`  Requests: ${results.performance.requests}`);
  }

  if (results.recommendations && results.recommendations.length > 0) {
    console.log(chalk.blue('\n💡 Recommendations:'));
    results.recommendations.forEach((rec: string, index: number) => {
      console.log(`  ${index + 1}. ${rec}`);
    });
  }

  if (results.score) {
    console.log(chalk.blue('\n📊 Sustainability Score:'));
    let scoreColor = chalk.green;
    if (results.score < 50) scoreColor = chalk.red;
    else if (results.score < 75) scoreColor = chalk.yellow;
    
    console.log(`  ${scoreColor(results.score)}/100`);
  }
}

async function saveToDatabase(url: string, results: any) {
  try {
    const config = await loadProjectConfig();
    if (!config) {
      console.log(chalk.yellow('⚠️  No project found. Results not saved to database.'));
      return;
    }

    const dataLake = createDataLake();
    await dataLake.initialize();

    await dataLake.storeAssessmentData(
      config.projectId,
      'greenframe',
      'web-analysis',
      {
        url,
        results,
        analyzedAt: new Date().toISOString()
      },
      'cli'
    );

    await dataLake.close();
    console.log(chalk.green('✅ Results saved to database'));
    
  } catch (error: any) {
    console.error(chalk.red('❌ Failed to save to database:'), error.message);
  }
}

// Alternative implementation using a mock Greenframe analysis
// This would be used if the actual Greenframe CLI is not available
export async function mockGreenframeAnalysis(url: string): Promise<any> {
  // Simulate analysis time
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Generate mock results based on URL characteristics
  const domain = new URL(url).hostname;
  const isHttps = url.startsWith('https');
  
  // Simple heuristics for mock analysis
  const baseCarbon = 5.0; // Base carbon footprint
  let carbonMultiplier = 1.0;
  
  // Adjust based on domain (simplified)
  if (domain.includes('cdn') || domain.includes('static')) {
    carbonMultiplier *= 0.7; // CDN typically more efficient
  }
  
  if (!isHttps) {
    carbonMultiplier *= 1.2; // HTTP slightly less efficient
  }
  
  const totalCarbonNum = baseCarbon * carbonMultiplier;
  const totalCarbon = totalCarbonNum.toFixed(2);
  
  return {
    url,
    carbon: {
      total: totalCarbon,
      breakdown: {
        'Data Transfer': (totalCarbonNum * 0.4).toFixed(2),
        'Server Processing': (totalCarbonNum * 0.3).toFixed(2),
        'Device Usage': (totalCarbonNum * 0.2).toFixed(2),
        'Network Infrastructure': (totalCarbonNum * 0.1).toFixed(2)
      }
    },
    performance: {
      loadTime: Math.floor(Math.random() * 3000) + 500,
      pageSize: Math.floor(Math.random() * 2000) + 500,
      requests: Math.floor(Math.random() * 50) + 10
    },
    recommendations: [
      'Enable gzip compression',
      'Optimize images',
      'Use a Content Delivery Network (CDN)',
      'Minimize HTTP requests',
      'Enable browser caching'
    ].slice(0, Math.floor(Math.random() * 3) + 2),
    score: Math.floor(Math.random() * 40) + 60,
    timestamp: new Date().toISOString(),
    source: 'mock-analysis'
  };
} 