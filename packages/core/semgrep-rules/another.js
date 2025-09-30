import sqlite3 from "sqlite3";
import path from "path";
export class DataService {
  db;
  dbPath;
  constructor(config = {}) {
    this.dbPath = config.dbPath || path.join(process.cwd(), "carbonara.db");
    this.db = new sqlite3.Database(this.dbPath);
  }
  getDbPath() {
    return this.dbPath;
  }
  async initialize() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Projects table
        this.db.run(`
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
        // Assessment data table
        this.db.run(`
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
        // Tool runs table
        this.db.run(
          `
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
        `,
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    });
  }
  async createProject(name, projectPath, metadata = {}) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO projects (name, path, metadata)
        VALUES (?, ?, ?)
      `);
      stmt.run([name, projectPath, JSON.stringify(metadata)], function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
      stmt.finalize();
    });
  }
  async getProject(projectPath) {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT * FROM projects WHERE path = ?",
        [projectPath],
        (err, row) => {
          if (err) reject(err);
          else {
            if (row) {
              row.metadata = row.metadata ? JSON.parse(row.metadata) : {};
              row.co2_variables = row.co2_variables
                ? JSON.parse(row.co2_variables)
                : {};
            }
            resolve(row || null);
          }
        }
      );
    });
  }
  async getAllProjects() {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT * FROM projects ORDER BY created_at DESC",
        (err, rows) => {
          if (err) reject(err);
          else {
            const projects = rows.map((row) => ({
              ...row,
              metadata: row.metadata ? JSON.parse(row.metadata) : {},
              co2_variables: row.co2_variables
                ? JSON.parse(row.co2_variables)
                : {},
            }));
            resolve(projects);
          }
        }
      );
    });
  }
  async storeAssessmentData(projectId, toolName, dataType, data, source) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO assessment_data (project_id, tool_name, data_type, data, source)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(
        [projectId, toolName, dataType, JSON.stringify(data), source],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
      stmt.finalize();
    });
  }
  async getAssessmentData(projectId, toolName) {
    let query = "SELECT * FROM assessment_data";
    const params = [];
    if (projectId || toolName) {
      query += " WHERE";
      const conditions = [];
      if (projectId) {
        conditions.push("project_id = ?");
        params.push(projectId);
      }
      if (toolName) {
        conditions.push("tool_name = ?");
        params.push(toolName);
      }
      query += " " + conditions.join(" AND ");
    }
    query += " ORDER BY timestamp DESC";
    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else {
          const data = rows.map((row) => ({
            ...row,
            data: JSON.parse(row.data),
          }));
          resolve(data);
        }
      });
    });
  }
  async close() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }
      this.db.close((err) => {
        if (err && err.code !== "SQLITE_MISUSE") {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
//# sourceMappingURL=data-service.js.map
