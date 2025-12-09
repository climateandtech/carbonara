#!/usr/bin/env node

// Script to add semgrep test data to the with-carbonara-project fixture
const path = require('path');
const fs = require('fs');

const carbonaraDir = path.join(__dirname, '.carbonara');
const dbPath = path.join(carbonaraDir, 'carbonara.db');

if (!fs.existsSync(dbPath)) {
  console.error('Database not found. Please run the fixture setup first.');
  process.exit(1);
}

(async () => {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const dbData = fs.readFileSync(dbPath);
  const db = new SQL.Database(dbData);

  // Get project ID (should be 1 for this fixture)
  const projectResult = db.exec('SELECT id FROM projects LIMIT 1');
  let projectId = 1;
  if (projectResult.length > 0 && projectResult[0].values.length > 0) {
    projectId = projectResult[0].values[0][0];
  }

  // Insert semgrep test data for test-file.js
  // This matches the issues in test-file.js (console.log, hardcoded API keys)
  const testFilePath = 'test-file.js';
  const semgrepMatches = [
    {
      rule_id: 'no-console-log',
      path: testFilePath,
      file_path: testFilePath, // Add file_path for database compatibility
      start_line: 17,
      end_line: 17,
      start_column: 5,
      end_column: 15,
      message: 'console.log should not be used in production code',
      severity: 'WARNING',
      code_snippet: '    console.log("Fetching data from:", endpoint);',
    },
    {
      rule_id: 'no-console-log',
      path: testFilePath,
      file_path: testFilePath,
      start_line: 27,
      end_line: 27,
      start_column: 7,
      end_column: 17,
      message: 'console.debug should not be used in production code',
      severity: 'WARNING',
      code_snippet: '      console.debug("Response received:", data);',
    },
    {
      rule_id: 'no-console-log',
      path: testFilePath,
      file_path: testFilePath,
      start_line: 32,
      end_line: 32,
      start_column: 7,
      end_column: 17,
      message: 'console.info should not be used in production code',
      severity: 'WARNING',
      code_snippet: '      console.info("Error occurred during fetch");',
    },
    {
      rule_id: 'no-console-log',
      path: testFilePath,
      file_path: testFilePath,
      start_line: 33,
      end_line: 33,
      start_column: 7,
      end_column: 17,
      message: 'console.error should not be used in production code',
      severity: 'WARNING',
      code_snippet: '      console.error("Error details:", error);',
    },
    {
      rule_id: 'no-console-log',
      path: testFilePath,
      file_path: testFilePath,
      start_line: 40,
      end_line: 40,
      start_column: 5,
      end_column: 15,
      message: 'console.log should not be used in production code',
      severity: 'WARNING',
      code_snippet: '    console.log(`Processing ${results.length} results`);',
    },
    {
      rule_id: 'hardcoded-api-key',
      path: testFilePath,
      file_path: testFilePath,
      start_line: 7,
      end_line: 7,
      start_column: 17,
      end_column: 35,
      message: 'Hardcoded API key detected',
      severity: 'ERROR',
      code_snippet: '    this.apiKey = "sk-1234567890abcdef";',
    },
    {
      rule_id: 'hardcoded-api-key',
      path: testFilePath,
      file_path: testFilePath,
      start_line: 10,
      end_line: 10,
      start_column: 20,
      end_column: 35,
      message: 'Hardcoded API key detected',
      severity: 'ERROR',
      code_snippet: '    const secretKey = "sk-prod-key-123";',
    },
  ];

  const assessmentData = {
    target: testFilePath,
    matches: semgrepMatches,
    stats: {
      total_matches: semgrepMatches.length,
      error_count: semgrepMatches.filter((m) => m.severity === 'ERROR').length,
      warning_count: semgrepMatches.filter((m) => m.severity === 'WARNING').length,
      info_count: semgrepMatches.filter((m) => m.severity === 'INFO').length,
      files_scanned: 1,
    },
  };

  // Insert semgrep data
  db.run(
    `INSERT INTO assessment_data (project_id, tool_name, data_type, data, source, timestamp)
     VALUES (?, 'semgrep', 'code-analysis', ?, 'fixture', datetime('now'))`,
    [projectId, JSON.stringify(assessmentData)]
  );

  console.log('✅ Semgrep test data added to fixture database');

  // Save database
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
  db.close();
})();

