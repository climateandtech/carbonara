import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';

export interface DatabaseConfig {
  dbPath?: string;
}

export interface AssessmentDataEntry {
  id: number;
  project_id: number;
  tool_name: string;
  data_type: string;
  data: any;
  timestamp: string;
  source?: string;
}

export interface Project {
  id: number;
  name: string;
  path: string;
  created_at: string;
  updated_at: string;
  metadata: any;
  co2_variables: any;
}

export class DataService {
  private db: any; // sql.js Database
  private dbPath: string;
  private SQL: any; // sql.js instance

  constructor(config: DatabaseConfig = {}) {
    this.dbPath = config.dbPath || path.join(process.cwd(), 'carbonara.db');
  }

  getDbPath(): string {
    return this.dbPath;
  }

  private saveToDisk(): void {
    if (this.db) {
      const data = this.db.export();
      fs.writeFileSync(this.dbPath, data);
    }
  }

  async initialize(): Promise<void> {
    try {
      // Initialize sql.js
      this.SQL = await initSqlJs();
      
      // Load existing database or create new one
      let data: Uint8Array | undefined;
      if (fs.existsSync(this.dbPath)) {
        data = new Uint8Array(fs.readFileSync(this.dbPath));
      }
      
      this.db = new this.SQL.Database(data);
      
      // Create tables
      this.db.run(`
        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          path TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          metadata TEXT,
          co2_variables TEXT
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS assessment_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER,
          tool_name TEXT NOT NULL,
          data_type TEXT NOT NULL,
          data TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          source TEXT,
          FOREIGN KEY (project_id) REFERENCES projects (id)
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS tool_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER,
          tool_name TEXT NOT NULL,
          command TEXT NOT NULL,
          status TEXT NOT NULL,
          output TEXT,
          error_message TEXT,
          started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME,
          FOREIGN KEY (project_id) REFERENCES projects (id)
        )
      `);
      
      // Save the database to disk
      this.saveToDisk();
    } catch (error) {
      throw new Error(`Failed to initialize database: ${error}`);
    }
  }

  async createProject(name: string, projectPath: string, metadata: any = {}): Promise<number> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO projects (name, path, metadata)
        VALUES (?, ?, ?)
      `);
      
      stmt.bind([name, projectPath, JSON.stringify(metadata)]);
      stmt.step();
      const result = stmt.getAsObject();
      stmt.free();
      
      this.saveToDisk();
      return this.db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    } catch (error) {
      throw new Error(`Failed to create project: ${error}`);
    }
  }

  async getProject(projectPath: string): Promise<Project | null> {
    try {
      const stmt = this.db.prepare('SELECT * FROM projects WHERE path = ?');
      stmt.bind([projectPath]);
      
      if (stmt.step()) {
        const result = stmt.getAsObject();
        stmt.free();
        
        result.metadata = result.metadata ? JSON.parse(result.metadata) : {};
        result.co2_variables = result.co2_variables ? JSON.parse(result.co2_variables) : {};
        return result;
      }
      stmt.free();
      return null;
    } catch (error) {
      throw new Error(`Failed to get project: ${error}`);
    }
  }

  async getAllProjects(): Promise<Project[]> {
    try {
      const stmt = this.db.prepare('SELECT * FROM projects ORDER BY created_at DESC');
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      
      return results.map((row: any) => ({
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata) : {},
        co2_variables: row.co2_variables ? JSON.parse(row.co2_variables) : {}
      }));
    } catch (error) {
      throw new Error(`Failed to get all projects: ${error}`);
    }
  }

  async storeAssessmentData(
    projectId: number,
    toolName: string,
    dataType: string,
    data: any,
    source?: string
  ): Promise<number> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO assessment_data (project_id, tool_name, data_type, data, source)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      stmt.bind([projectId, toolName, dataType, JSON.stringify(data), source]);
      stmt.step();
      stmt.free();
      
      this.saveToDisk();
      return this.db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    } catch (error) {
      throw new Error(`Failed to store assessment data: ${error}`);
    }
  }

  async getAssessmentData(projectId?: number, toolName?: string): Promise<AssessmentDataEntry[]> {
    try {
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

      const stmt = this.db.prepare(query);
      stmt.bind(params);
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      
      return results.map((row: any) => ({
        ...row,
        data: JSON.parse(row.data)
      }));
    } catch (error) {
      throw new Error(`Failed to get assessment data: ${error}`);
    }
  }

  async close(): Promise<void> {
    try {
      if (this.db) {
        this.saveToDisk();
        this.db.close();
      }
    } catch (error) {
      throw new Error(`Failed to close database: ${error}`);
    }
  }
}
