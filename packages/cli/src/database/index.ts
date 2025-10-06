import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';

interface ProjectRow {
  id?: number;
  name: string;
  path: string;
  metadata?: string;
  co2_variables?: string;
  created_at?: string;
}

interface DataRow {
  id?: number;
  type: string;
  data: string;
  timestamp?: string;
}

export interface DatabaseConfig {
  dbPath?: string;
  schemaPath?: string;
}

export class DataLake {
  private db: sqlite3.Database;
  private dbPath: string;

  constructor(config: DatabaseConfig = {}) {
    this.dbPath = config.dbPath || path.join(process.cwd(), 'carbonara.db');
    this.db = new sqlite3.Database(this.dbPath);
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Projects table - stores project metadata and CO2 assessment variables
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

        // Assessment data table - stores all assessment results
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

        // Tool runs table - tracks tool execution history
        this.db.run(`
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
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  async createProject(name: string, projectPath: string, metadata: any = {}): Promise<number> {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO projects (name, path, metadata)
        VALUES (?, ?, ?)
      `);
      
      stmt.run([name, projectPath, JSON.stringify(metadata)], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
      
      stmt.finalize();
    });
  }

  async updateProjectCO2Variables(projectId: number, variables: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        UPDATE projects 
        SET co2_variables = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      
      stmt.run([JSON.stringify(variables), projectId], (err) => {
        if (err) reject(err);
        else resolve();
      });
      
      stmt.finalize();
    });
  }

  async storeAssessmentData(projectId: number, toolName: string, dataType: string, data: any, source?: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO assessment_data (project_id, tool_name, data_type, data, source)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      stmt.run([projectId, toolName, dataType, JSON.stringify(data), source], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
      
      stmt.finalize();
    });
  }

  async getProject(projectPath: string): Promise<any | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM projects WHERE path = ?',
        [projectPath],
        (err, row: ProjectRow) => {
          if (err) reject(err);
          else {
            if (row) {
              (row as any).metadata = row.metadata ? JSON.parse(row.metadata) : {};
              (row as any).co2_variables = row.co2_variables ? JSON.parse(row.co2_variables) : {};
            }
            resolve(row || null);
          }
        }
      );
    });
  }

  async getAllProjects(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM projects ORDER BY created_at DESC', (err, rows: ProjectRow[]) => {
        if (err) reject(err);
        else {
          const projects = rows.map(row => ({
            ...row,
            metadata: row.metadata ? JSON.parse(row.metadata) : {},
            co2_variables: row.co2_variables ? JSON.parse(row.co2_variables) : {}
          }));
          resolve(projects);
        }
      });
    });
  }

  async getAssessmentData(projectId?: number, toolName?: string): Promise<any[]> {
    let query = 'SELECT * FROM assessment_data';
    const params: any[] = [];

    if (projectId || toolName) {
      query += ' WHERE';
      const conditions = [];
      
      if (projectId) {
        conditions.push('project_id = ?');
        params.push(projectId);
      }
      
      if (toolName) {
        conditions.push('tool_name = ?');
        params.push(toolName);
      }
      
      query += ' ' + conditions.join(' AND ');
    }

    query += ' ORDER BY timestamp DESC';

    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows: DataRow[]) => {
        if (err) reject(err);
        else {
          const data = rows.map(row => ({
            ...row,
            data: JSON.parse(row.data)
          }));
          resolve(data);
        }
      });
    });
  }

  async getAllAssessmentData(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM assessment_data ORDER BY timestamp DESC',
        (err, rows: any[]) => {
          if (err) reject(err);
          else {
            const assessmentData = rows.map(row => ({
              ...row,
              data: row.data ? JSON.parse(row.data) : {}
            }));
            resolve(assessmentData);
          }
        }
      );
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

export const createDataLake = (dbPath?: string | DatabaseConfig) => {
  if (typeof dbPath === 'string') {
    return new DataLake({ dbPath });
  }
  return new DataLake(dbPath);
}; 