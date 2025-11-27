#!/usr/bin/env node

// Script to create test data for the with-analysis-data fixture
const path = require("path");
const fs = require("fs");

const carbonaraDir = path.join(__dirname, ".carbonara");
const dbPath = path.join(carbonaraDir, "carbonara.db");

// Remove existing database and directory
if (fs.existsSync(carbonaraDir)) {
  fs.rmSync(carbonaraDir, { recursive: true, force: true });
}

// Create .carbonara directory
fs.mkdirSync(carbonaraDir, { recursive: true });

(async () => {
  const initSqlJs = require("sql.js");
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

  db.run(`
    CREATE TABLE IF NOT EXISTS tool_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      tool_name TEXT NOT NULL,
      command TEXT NOT NULL,
      status TEXT NOT NULL,
      output JSON,
      error_message TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (project_id) REFERENCES projects (id)
    )
  `);

  // Insert project
  db.run(`
    INSERT INTO projects (id, name, path, metadata, co2_variables)
    VALUES (1, 'Test Project with Analysis Data', '${__dirname}', '{}', '{}')
  `);

  // Insert greenframe analysis data (updated to match old API format)
  db.run(
    `
    INSERT INTO assessment_data (project_id, tool_name, data_type, data, source, timestamp)
    VALUES (1, 'greenframe', 'web-analysis', ?, 'test', '2025-01-15T10:30:00.000Z')
  `,
    [
      JSON.stringify({
        url: "https://example.com",
        results: {
          carbon: {
            total: "0.245",
            breakdown: {
              "Data Transfer": "0.098",
              "Server Processing": "0.074",
              "Device Usage": "0.049",
              "Network Infrastructure": "0.024",
            },
          },
          performance: {
            loadTime: 1250,
            pageSize: 512,
            requests: 25,
          },
          score: 75,
          grade: "B",
        },
        analyzedAt: "2025-01-15T10:30:00.000Z",
      }),
    ]
  );

  // Insert assessment questionnaire data
  db.run(
    `
    INSERT INTO assessment_data (project_id, tool_name, data_type, data, source, timestamp)
    VALUES (1, 'assessment-questionnaire', 'questionnaire', ?, 'test', '2025-01-15T09:15:00.000Z')
  `,
    [
      JSON.stringify({
        impactScore: 75,
        projectScope: {
          estimatedUsers: 10000,
          expectedTraffic: "high",
          projectLifespan: "3-5 years",
        },
        infrastructure: {
          hostingProvider: "AWS",
          serverLocation: "us-east-1",
        },
        sustainabilityGoals: {
          carbonNeutralityTarget: true,
        },
      }),
    ]
  );

  // Insert GreenFrame analysis data
  db.run(
    `
    INSERT INTO assessment_data (project_id, tool_name, data_type, data, source, timestamp)
    VALUES (1, 'greenframe', 'web-analysis', ?, 'test', '2025-01-15T11:45:00.000Z')
  `,
    [
      JSON.stringify({
        url: "https://test-site.com",
        results: {
          carbon: {
            total: 1.85,
          },
          score: 68,
          performance: {
            loadTime: 2100,
            pageSize: 890,
          },
        },
      }),
    ]
  );

  console.log("✅ Test database created with sample analysis data");

  // Save database to file
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
  db.close();
})();
