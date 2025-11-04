#!/usr/bin/env node

// Script to create test data for the with-cpu-profiles fixture
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'carbonara.db');

// Remove existing database
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

(async () => {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      metadata JSON,
      co2_variables JSON
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS assessment_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      tool_name TEXT NOT NULL,
      data_type TEXT NOT NULL,
      data JSON NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      source TEXT,
      FOREIGN KEY (project_id) REFERENCES projects (id)
    )
  `);

  // Insert project
  db.run(`
    INSERT INTO projects (id, name, path, metadata, co2_variables)
    VALUES (1, 'CPU Profile Test Project', '${__dirname}', '{}', '{}')
  `);

  // Insert Python CPU profile
  db.run(`
    INSERT INTO assessment_data (project_id, tool_name, data_type, data, source, timestamp)
    VALUES (1, 'cpu-profiler', 'cpu-profile', ?, 'test', '2025-01-15T10:30:00.000Z')
  `, [JSON.stringify({
    app: 'test-python-app',
    lang: 'python',
    timestamp: '2025-01-15T10:30:00.000Z',
    samples_total: 1000,
    lines: [
      {
        file: path.join(__dirname, 'test_file.py'),
        function: 'slow_function',
        line: 42,
        samples: 350,
        percent: 35.0,
        cpu_ms: 3500
      },
      {
        file: path.join(__dirname, 'test_file.py'),
        function: 'another_function',
        line: 88,
        samples: 200,
        percent: 20.0,
        cpu_ms: 2000
      },
      {
        file: path.join(__dirname, 'utils.py'),
        function: 'helper',
        line: 15,
        samples: 100,
        percent: 10.0,
        cpu_ms: 1000
      }
    ],
    scenario: {
      type: 'test',
      value: 'python -m pytest test_file.py'
    }
  })]);

  // Insert Node.js CPU profile
  db.run(`
    INSERT INTO assessment_data (project_id, tool_name, data_type, data, source, timestamp)
    VALUES (1, 'cpu-profiler', 'cpu-profile', ?, 'test', '2025-01-15T11:00:00.000Z')
  `, [JSON.stringify({
    app: 'test-node-app',
    lang: 'node',
    timestamp: '2025-01-15T11:00:00.000Z',
    samples_total: 2000,
    lines: [
      {
        file: path.join(__dirname, 'app.js'),
        function: 'processData',
        line: 123,
        samples: 600,
        percent: 30.0,
        cpu_ms: 6000
      },
      {
        file: path.join(__dirname, 'app.js'),
        function: 'parseJson',
        line: 45,
        samples: 400,
        percent: 20.0,
        cpu_ms: 4000
      },
      {
        file: path.join(__dirname, 'lib', 'utils.js'),
        function: 'formatData',
        line: 78,
        samples: 200,
        percent: 10.0,
        cpu_ms: 2000
      }
    ],
    scenario: {
      type: 'test',
      value: 'npm test'
    }
  })]);

  console.log('✅ Test database created with CPU profile data');

  // Save database to file
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
  db.close();
})();

