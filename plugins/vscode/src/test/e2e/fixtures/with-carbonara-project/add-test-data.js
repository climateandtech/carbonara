#!/usr/bin/env node

// Script to add test-analyzer data to the with-carbonara-project fixture
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'carbonara.db');

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Insert project if it doesn't exist
  db.run(`
    INSERT OR IGNORE INTO projects (id, name, path, metadata, co2_variables) 
    VALUES (1, 'Test Project with Carbonara', '${__dirname}', '{}', '{}')
  `);

  // Insert test-analyzer data
  db.run(`
    INSERT INTO assessment_data (project_id, tool_name, data_type, data, source, timestamp) 
    VALUES (1, 'test-analyzer', 'web-analysis', ?, 'test', '2025-01-15T10:30:00.000Z')
  `, [JSON.stringify({
    url: 'https://example.com',
    results: {
      score: 85,
      grade: 'B+',
      metrics: {
        performance: 80,
        accessibility: 90,
        seo: 85
      }
    },
    analyzedAt: '2025-01-15T10:30:00.000Z'
  })]);

  // Insert another test-analyzer entry
  db.run(`
    INSERT INTO assessment_data (project_id, tool_name, data_type, data, source, timestamp) 
    VALUES (1, 'test-analyzer', 'web-analysis', ?, 'test', '2025-01-15T11:45:00.000Z')
  `, [JSON.stringify({
    url: 'https://test-site.com',
    results: {
      score: 92,
      grade: 'A-',
      metrics: {
        performance: 95,
        accessibility: 88,
        seo: 92
      }
    },
    analyzedAt: '2025-01-15T11:45:00.000Z'
  })]);

  console.log('✅ Added test-analyzer data to with-carbonara-project fixture');
});

db.close();
