import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import ora from 'ora';
import { createDataLake } from '../database/index.js';
import { loadProjectConfig } from '../utils/config.js';

interface ImportOptions {
  file?: string;
  database?: string;
  format?: 'json' | 'csv';
  merge?: boolean;
  overwrite?: boolean;
}

export async function importCommand(options: ImportOptions) {
  try {
    const config = await loadProjectConfig();
    if (!config) {
      console.log(chalk.yellow('⚠️  No project found. Run "carbonara init" first.'));
      return;
    }

    const dataLake = createDataLake();
    await dataLake.initialize();

    if (options.file) {
      await importFromFile(dataLake, config.projectId, options);
    } else if (options.database) {
      await importFromDatabase(dataLake, config.projectId, options);
    } else {
      showImportHelp();
    }

    await dataLake.close();

  } catch (error: any) {
    console.error(chalk.red('❌ Import operation failed:'), error.message);
    process.exit(1);
  }
}

async function importFromFile(dataLake: any, projectId: number, options: ImportOptions) {
  const filePath = path.resolve(options.file!);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const spinner = ora('Reading import file...').start();
  
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const fileExt = path.extname(filePath).toLowerCase();
    
    let importData: any[];
    
    // Determine format from file extension or option
    const format = options.format || (fileExt === '.csv' ? 'csv' : 'json');
    
    if (format === 'json') {
      importData = JSON.parse(fileContent);
    } else if (format === 'csv') {
      // Simple CSV parsing - you might want to use a proper CSV library
      const lines = fileContent.split('\\n');
      const headers = lines[0].split(',');
      importData = lines.slice(1).map(line => {
        const values = line.split(',');
        const record: any = {};
        headers.forEach((header, index) => {
          record[header.trim()] = values[index]?.trim();
        });
        return record;
      }).filter(record => Object.keys(record).length > 0);
    } else {
      throw new Error(`Unsupported format: ${format}`);
    }

    if (!Array.isArray(importData)) {
      throw new Error('Import data must be an array of records');
    }

    spinner.text = `Importing ${importData.length} records...`;
    
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const record of importData) {
      try {
        await importRecord(dataLake, projectId, record, options);
        imported++;
      } catch (error: any) {
        if (error.message.includes('UNIQUE constraint') && !options.overwrite) {
          skipped++;
        } else {
          console.error(chalk.red(`Error importing record:`, error.message));
          errors++;
        }
      }
    }

    spinner.succeed('Import completed!');
    
    console.log(chalk.green(`\\n✅ Import Summary:`));
    console.log(`  Imported: ${chalk.white(imported)} records`);
    if (skipped > 0) {
      console.log(`  Skipped: ${chalk.yellow(skipped)} duplicates`);
    }
    if (errors > 0) {
      console.log(`  Errors: ${chalk.red(errors)} failed`);
    }

  } catch (error: any) {
    spinner.fail('Import failed');
    throw error;
  }
}

async function importFromDatabase(dataLake: any, projectId: number, options: ImportOptions) {
  const dbPath = path.resolve(options.database!);
  
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found: ${dbPath}`);
  }

  const spinner = ora('Reading source database...').start();
  
  try {
    // Create a separate data lake instance for the source database
    const sourceDataLake = createDataLake(dbPath);
    await sourceDataLake.initialize();

    // Get all assessment data from source database
    const sourceData = await sourceDataLake.getAllAssessmentData();
    
    spinner.text = `Importing ${sourceData.length} records from database...`;
    
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const record of sourceData) {
      try {
        // Convert database record to import format
        const importData = {
          tool_name: record.tool_name,
          data_type: record.data_type,
          data: typeof record.data === 'string' ? JSON.parse(record.data) : record.data,
          source: record.source,
          timestamp: record.timestamp
        };

        await importRecord(dataLake, projectId, importData, options);
        imported++;
      } catch (error: any) {
        if (error.message.includes('UNIQUE constraint') && !options.overwrite) {
          skipped++;
        } else {
          console.error(chalk.red(`Error importing record:`, error.message));
          errors++;
        }
      }
    }

    await sourceDataLake.close();
    spinner.succeed('Database import completed!');
    
    console.log(chalk.green(`\\n✅ Import Summary:`));
    console.log(`  Imported: ${chalk.white(imported)} records`);
    if (skipped > 0) {
      console.log(`  Skipped: ${chalk.yellow(skipped)} duplicates`);
    }
    if (errors > 0) {
      console.log(`  Errors: ${chalk.red(errors)} failed`);
    }

  } catch (error: any) {
    spinner.fail('Database import failed');
    throw error;
  }
}

async function importRecord(dataLake: any, projectId: number, record: any, options: ImportOptions) {
  // Handle different record formats
  let toolName: string;
  let dataType: string;
  let data: any;
  let source: string | undefined;

  if (record.tool_name && record.data_type) {
    // Standard Carbonara export format
    toolName = record.tool_name;
    dataType = record.data_type;
    data = record.data;
    source = record.source;
  } else if (record.data && typeof record.data === 'object') {
    // Legacy format with nested data
    const parsedData = typeof record.data === 'string' ? JSON.parse(record.data) : record.data;
    toolName = record.tool_name || 'imported';
    dataType = record.data_type || 'analysis';
    data = parsedData;
    source = record.source;
  } else {
    // Generic record format
    toolName = record.tool || record.analyzer || 'imported';
    dataType = record.type || 'analysis';
    data = record;
    source = record.url || record.source;
  }

  // Store the record
  await dataLake.storeAssessmentData(projectId, toolName, dataType, data, source);
}

function showImportHelp() {
  console.log(chalk.blue('📥 Data Import'));
  console.log('');
  console.log('Import analysis data from files or databases into the current project.');
  console.log('');
  console.log('Usage:');
  console.log('  carbonara import --file <path>       Import from JSON/CSV file');
  console.log('  carbonara import --database <path>   Import from another Carbonara database');
  console.log('');
  console.log('Options:');
  console.log('  --format <json|csv>     Force file format (auto-detected by default)');
  console.log('  --merge                 Merge with existing data (default)');
  console.log('  --overwrite             Overwrite duplicate records');
  console.log('');
  console.log('Examples:');
  console.log('  carbonara import --file ./analysis-results.json');
  console.log('  carbonara import --database ../other-project/carbonara.db');
  console.log('  carbonara import --file ./data.csv --format csv --overwrite');
  console.log('');
  console.log('Supported formats:');
  console.log('  • JSON: Carbonara export format or generic analysis records');
  console.log('  • CSV: Simple comma-separated values with headers');
  console.log('  • Database: Direct import from other Carbonara project databases');
}