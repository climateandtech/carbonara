#!/usr/bin/env node

// Test script to replicate exactly what happens when the VSCode extension loads data
const path = require('path');
const fs = require('fs');
const { createDataService, createSchemaService, createVSCodeDataProvider } = require('./packages/core/dist/index.js');

async function testDataLoading() {
  console.log('🧪 Testing data loading flow (exact replication of VSCode extension)...\n');

  // Step 1: Get workspace folder path (same as extension)
  const workspacePath = process.cwd();
  console.log(`📂 [1] Workspace folder: ${workspacePath}`);

  // Step 2: Read config file (same as extension)
  const configPath = path.join(workspacePath, '.carbonara', 'carbonara.config.json');
  console.log(`📄 [2] Config path: ${configPath}`);
  
  if (!fs.existsSync(configPath)) {
    console.error('❌ Config file not found!');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log(`✅ [2] Config loaded:`, JSON.stringify(config, null, 2));

  // Step 3: Determine database path (same as extension)
  let dbPath;
  if (config.database?.path) {
    dbPath = path.isAbsolute(config.database.path)
      ? config.database.path
      : path.join(workspacePath, config.database.path);
    console.log(`🗄️ [3] Using custom database path from config: ${dbPath}`);
  } else {
    dbPath = path.join(workspacePath, '.carbonara', 'carbonara.db');
    console.log(`🗄️ [3] Using default database path: ${dbPath}`);
  }

  // Step 4: Check if database file exists
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ Database file not found at: ${dbPath}`);
    process.exit(1);
  }
  console.log(`✅ [4] Database file exists: ${dbPath}`);
  const dbStats = fs.statSync(dbPath);
  console.log(`   Size: ${dbStats.size} bytes`);

  // Step 5: Create data service (same as extension)
  console.log(`🔧 [5] Creating data service with path: ${dbPath}`);
  const dataService = createDataService({ dbPath });
  console.log(`   Data service created`);

  // Step 6: Initialize database (same as extension)
  console.log(`💾 [6] Initializing database...`);
  await dataService.initialize();
  console.log(`✅ [6] Database initialized`);

  // Step 7: Create schema service (same as extension)
  console.log(`📚 [7] Creating schema service...`);
  const schemaService = createSchemaService();
  console.log(`   Schema service created`);

  // Step 8: Load tool schemas (same as extension)
  console.log(`📖 [8] Loading tool schemas...`);
  await schemaService.loadToolSchemas();
  console.log(`✅ [8] Tool schemas loaded`);

  // Step 9: Create VSCode data provider (same as extension)
  console.log(`🔗 [9] Creating VSCode data provider...`);
  const vscodeProvider = createVSCodeDataProvider(dataService, schemaService);
  console.log(`   VSCode data provider created`);

  // Step 10: Test project lookup (same as extension)
  console.log(`🔍 [10] Testing project lookup...`);
  const project = await dataService.getProject(workspacePath);
  console.log(`   Project lookup for path "${workspacePath}":`, project ? `Found (ID: ${project.id})` : 'Not found');

  // Step 11: Load assessment data directly (same as extension)
  console.log(`📊 [11] Loading assessment data directly from dataService...`);
  console.log(`   Database path in dataService: ${dataService.getDbPath()}`);
  console.log(`   Database exists: ${fs.existsSync(dataService.getDbPath())}`);
  const directData = await dataService.getAssessmentData();
  console.log(`   Direct query result: ${directData.length} entries`);
  if (directData.length > 0) {
    console.log(`   Tool names:`, directData.map(d => d.tool_name).join(', '));
    directData.forEach((entry, idx) => {
      console.log(`   Entry ${idx + 1}: ID=${entry.id}, tool=${entry.tool_name}, type=${entry.data_type}`);
    });
  }

  // Step 12: Load data through VSCode provider (same as extension)
  console.log(`📊 [12] Loading data through VSCode provider (same as extension)...`);
  const providerData = await vscodeProvider.loadDataForProject(workspacePath);
  console.log(`   Provider query result: ${providerData.length} entries`);
  if (providerData.length > 0) {
    console.log(`   Tool names:`, providerData.map(d => d.tool_name).join(', '));
  }

  // Step 13: Create grouped items (same as extension)
  console.log(`📊 [13] Creating grouped items (same as extension)...`);
  const groups = await vscodeProvider.createGroupedItems(workspacePath);
  console.log(`   Created ${groups.length} groups`);
  groups.forEach((group, idx) => {
    console.log(`   Group ${idx + 1}: ${group.displayName} (${group.entries.length} entries)`);
  });

  // Step 14: Verify database file still has data
  console.log(`\n🔍 [14] Verifying database file directly...`);
  const { execSync } = require('child_process');
  try {
    const sqliteResult = execSync(`sqlite3 "${dbPath}" "SELECT COUNT(*) as count FROM assessment_data;"`, { encoding: 'utf8' });
    console.log(`   SQLite direct query: ${sqliteResult.trim()} entries in file`);
  } catch (error) {
    console.error(`   Error querying with sqlite3:`, error.message);
  }

  console.log(`\n✅ Test complete!`);
  
  // Cleanup
  await dataService.close();
}

testDataLoading().catch(error => {
  console.error('❌ Test failed:', error);
  console.error(error.stack);
  process.exit(1);
});

