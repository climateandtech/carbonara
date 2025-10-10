import initSqlJs, { Database } from 'sql.js';
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
  private db: Database | null = null;
  private dbPath: string;
  private SQL: any = null;

  constructor(config: DatabaseConfig = {}) {
    this.dbPath = config.dbPath || path.join(process.cwd(), 'carbonara.db');
  }

  getDbPath(): string {
    return this.dbPath;
  }

  private saveDatabase(): void {
    if (this.db) {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    }
  }

  async initialize(): Promise<void> {
    // Initialize sql.js
    this.SQL = await initSqlJs();

    // Try to load existing database file
    let existingData: Buffer | undefined;
    if (fs.existsSync(this.dbPath)) {
      existingData = fs.readFileSync(this.dbPath);
    }

    // Create or load database
    if (existingData) {
      this.db = new this.SQL.Database(existingData);
    } else {
      this.db = new this.SQL.Database();
    }

    // Create tables
    this.db!.run(`
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

    this.db!.run(`
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

    this.db!.run(`
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

    // Save initial database
    this.saveDatabase();
  }

  async createProject(name: string, projectPath: string, metadata: any = {}): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(
      `INSERT INTO projects (name, path, metadata) VALUES (?, ?, ?)`,
      [name, projectPath, JSON.stringify(metadata)]
    );

    const result = this.db.exec('SELECT last_insert_rowid() as id');
    const id = result[0].values[0][0] as number;

    this.saveDatabase();
    return id;
  }

  async updateProjectCO2Variables(projectId: number, variables: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(
      `UPDATE projects SET co2_variables = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [JSON.stringify(variables), projectId]
    );

    this.saveDatabase();
  }

  async getProject(projectPath: string): Promise<Project | null> {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.exec('SELECT * FROM projects WHERE path = ?', [projectPath]);

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const columns = result[0].columns;
    const values = result[0].values[0];
    const row: any = {};

    columns.forEach((col: string, idx: number) => {
      row[col] = values[idx];
    });

    row.metadata = row.metadata ? JSON.parse(row.metadata) : {};
    row.co2_variables = row.co2_variables ? JSON.parse(row.co2_variables) : {};

    return row;
  }

  async getAllProjects(): Promise<Project[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.exec('SELECT * FROM projects ORDER BY created_at DESC');

    if (result.length === 0) {
      return [];
    }

    const columns = result[0].columns;
    const rows = result[0].values;

    return rows.map((values: any) => {
      const row: any = {};
      columns.forEach((col: string, idx: number) => {
        row[col] = values[idx];
      });
      row.metadata = row.metadata ? JSON.parse(row.metadata) : {};
      row.co2_variables = row.co2_variables ? JSON.parse(row.co2_variables) : {};
      return row;
    });
  }

  async storeAssessmentData(
    projectId: number,
    toolName: string,
    dataType: string,
    data: any,
    source?: string
  ): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(
      `INSERT INTO assessment_data (project_id, tool_name, data_type, data, source) VALUES (?, ?, ?, ?, ?)`,
      [projectId, toolName, dataType, JSON.stringify(data), source || null]
    );

    const result = this.db.exec('SELECT last_insert_rowid() as id');
    const id = result[0].values[0][0] as number;

    this.saveDatabase();
    return id;
  }

  async getAssessmentData(projectId?: number, toolName?: string): Promise<AssessmentDataEntry[]> {
    if (!this.db) throw new Error('Database not initialized');

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

    const result = this.db.exec(query, params);

    if (result.length === 0) {
      return [];
    }

    const columns = result[0].columns;
    const rows = result[0].values;

    return rows.map((values: any) => {
      const row: any = {};
      columns.forEach((col: string, idx: number) => {
        row[col] = values[idx];
      });
      row.data = JSON.parse(row.data);
      return row;
    });
  }

  async getAllAssessmentData(): Promise<AssessmentDataEntry[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.exec('SELECT * FROM assessment_data ORDER BY timestamp DESC');

    if (result.length === 0) {
      return [];
    }

    const columns = result[0].columns;
    const rows = result[0].values;

    return rows.map((values: any) => {
      const row: any = {};
      columns.forEach((col: string, idx: number) => {
        row[col] = values[idx];
      });
      row.data = row.data ? JSON.parse(row.data) : {};
      return row;
    });
  }

  async close(): Promise<void> {
    if (this.db) {
      this.saveDatabase();
      this.db.close();
      this.db = null;
    }
  }
}

export const createDataLake = (dbPath?: string | DatabaseConfig) => {
  if (typeof dbPath === 'string') {
    return new DataService({ dbPath });
  }
  return new DataService(dbPath);
};

// Alias for backwards compatibility
export const DataLake = DataService;
