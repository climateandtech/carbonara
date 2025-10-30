import initSqlJs, { Database } from "sql.js";
import path from "path";
import fs from "fs";

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

export interface SemgrepResultRow {
  id: number;
  rule_id: string;
  severity: string;
  file_path: string;
  start_line: number;
  end_line: number;
  start_column: number;
  end_column: number;
  created_at: string;
}

export interface Deployment {
  id: number;
  name: string;
  environment: string; // prod, staging, dev, etc.
  provider: string; // aws, gcp, azure, heroku, vercel, etc.
  region: string | null; // Cloud provider region code
  country: string | null; // Country code (ISO 3166-1 alpha-2)
  ip_address: string | null; // Server IP if available
  detection_method: string; // config_file, user_input, ip_lookup, api
  config_file_path: string | null; // Path to the config file where detected
  config_type: string | null; // terraform, cloudformation, k8s, etc.
  carbon_intensity: number | null; // gCO2/kWh if known
  carbon_intensity_source: string | null; // static, electricitymaps, ember
  carbon_intensity_updated_at: string | null;
  status: string; // active, inactive, archived
  metadata: any; // Additional provider-specific data
  created_at: string;
  updated_at: string;
}

export class DataService {
  private db: Database | null = null;
  private dbPath: string;
  private SQL: any = null;

  constructor(config: DatabaseConfig = {}) {
    this.dbPath =
      config.dbPath || path.join(process.cwd(), ".carbonara", "carbonara.db");
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

    // Ensure the .carbonara directory exists
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

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

    // Create index for faster queries on tool_name and data_type
    this.db!.run(`
      CREATE INDEX IF NOT EXISTS idx_assessment_tool_type
      ON assessment_data(tool_name, data_type)
    `);

    // Create index on JSON target field for semgrep and other tools
    // This helps with queries like "show all runs for this target"
    this.db!.run(`
      CREATE INDEX IF NOT EXISTS idx_assessment_target
      ON assessment_data((json_extract(data, '$.target')))
    `);

    // Add generated columns for common JSON fields (migration-safe)
    // These are computed from existing JSON data, no data loss
    // Using try-catch since ALTER TABLE will fail if columns already exist
    try {
      // Add generated column for target path
      this.db!.run(`
        ALTER TABLE assessment_data 
        ADD COLUMN target_path TEXT GENERATED ALWAYS AS (
          json_extract(data, '$.target')
        ) STORED
      `);

      // Index the generated column
      this.db!.run(`
        CREATE INDEX IF NOT EXISTS idx_assessment_target_path
        ON assessment_data(target_path)
      `);
    } catch (error) {
      // Column may already exist, which is fine
      // This is migration-safe - existing databases will have it added
    }

    try {
      // Add generated column for total_matches (useful for filtering semgrep runs)
      this.db!.run(`
        ALTER TABLE assessment_data 
        ADD COLUMN total_matches INTEGER GENERATED ALWAYS AS (
          json_extract(data, '$.stats.total_matches')
        ) STORED
      `);

      // Index for filtering runs by match count
      this.db!.run(`
        CREATE INDEX IF NOT EXISTS idx_assessment_total_matches
        ON assessment_data(total_matches)
      `);
    } catch (error) {
      // Column may already exist, which is fine
      // This is migration-safe - existing databases will have it added
    }

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

    this.db!.run(`
      CREATE TABLE IF NOT EXISTS deployments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        environment TEXT NOT NULL,
        provider TEXT NOT NULL,
        region TEXT,
        country TEXT,
        ip_address TEXT,
        detection_method TEXT NOT NULL,
        config_file_path TEXT,
        config_type TEXT,
        carbon_intensity REAL,
        carbon_intensity_source TEXT,
        carbon_intensity_updated_at DATETIME,
        status TEXT DEFAULT 'active',
        metadata JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Save initial database
    this.saveDatabase();
  }

  async createProject(
    name: string,
    projectPath: string,
    metadata: any = {}
  ): Promise<number> {
    if (!this.db) throw new Error("Database not initialized");

    this.db.run(
      `INSERT INTO projects (name, path, metadata) VALUES (?, ?, ?)`,
      [name, projectPath, JSON.stringify(metadata)]
    );

    const result = this.db.exec("SELECT last_insert_rowid() as id");
    const id = result[0].values[0][0] as number;

    this.saveDatabase();
    return id;
  }

  async updateProjectCO2Variables(
    projectId: number,
    variables: any
  ): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    this.db.run(
      `UPDATE projects SET co2_variables = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [JSON.stringify(variables), projectId]
    );

    this.saveDatabase();
  }

  async getProject(projectPath: string): Promise<Project | null> {
    if (!this.db) throw new Error("Database not initialized");

    const result = this.db.exec("SELECT * FROM projects WHERE path = ?", [
      projectPath,
    ]);

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
    if (!this.db) throw new Error("Database not initialized");

    const result = this.db.exec(
      "SELECT * FROM projects ORDER BY created_at DESC"
    );

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
      row.co2_variables = row.co2_variables
        ? JSON.parse(row.co2_variables)
        : {};
      return row;
    });
  }

  async storeAssessmentData(
    projectId: number | undefined,
    toolName: string,
    dataType: string,
    data: any,
    source?: string
  ): Promise<number> {
    if (!this.db) throw new Error("Database not initialized");

    this.db.run(
      `INSERT INTO assessment_data (project_id, tool_name, data_type, data, source) VALUES (?, ?, ?, ?, ?)`,
      [
        projectId || null,
        toolName,
        dataType,
        JSON.stringify(data),
        source || null,
      ]
    );

    const result = this.db.exec("SELECT last_insert_rowid() as id");
    const id = result[0].values[0][0] as number;

    this.saveDatabase();
    return id;
  }

  async getAssessmentData(
    projectId?: number,
    toolName?: string
  ): Promise<AssessmentDataEntry[]> {
    if (!this.db) throw new Error("Database not initialized");

    let query = "SELECT * FROM assessment_data";
    const params: any[] = [];

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
    if (!this.db) throw new Error("Database not initialized");

    const result = this.db.exec(
      "SELECT * FROM assessment_data ORDER BY timestamp DESC"
    );

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

  /**
   * Store semgrep results for a single file in assessment_data table
   * Stores one entry per file (not per run)
   */
  async storeSemgrepRun(
    matches: any[],
    target: string,
    stats: any,
    projectId?: number,
    source?: string
  ): Promise<number> {
    if (!this.db) throw new Error("Database not initialized");

    // Normalize matches to ensure consistent structure
    const normalizedMatches = matches.map((match) => {
      // Extract just the rule name from the full rule_id path
      const ruleNameMatch = match.rule_id.match(/([^.]+)$/);
      const ruleName = ruleNameMatch ? ruleNameMatch[1] : match.rule_id;

      return {
        rule_id: ruleName,
        severity: match.severity,
        path: match.path,
        file_path: match.file_path || match.path,
        start_line: match.start_line,
        end_line: match.end_line,
        start_column: match.start_column,
        end_column: match.end_column,
        message: match.message || "",
        code_snippet: match.code_snippet,
        metadata: match.metadata || {},
      };
    });

    // Prepare data for assessment_data - one entry per file
    const assessmentData = {
      target,
      matches: normalizedMatches,
      stats: stats || {
        total_matches: matches.length,
        error_count: matches.filter((m) => m.severity === "ERROR").length,
        warning_count: matches.filter((m) => m.severity === "WARNING").length,
        info_count: matches.filter((m) => m.severity === "INFO").length,
        files_scanned: 1, // Single file
      },
    };

    // Store in assessment_data table
    this.db.run(
      `INSERT INTO assessment_data (project_id, tool_name, data_type, data, source) VALUES (?, ?, ?, ?, ?)`,
      [
        projectId || null,
        "semgrep",
        "code-analysis",
        JSON.stringify(assessmentData),
        source || null,
      ]
    );

    const result = this.db.exec("SELECT last_insert_rowid() as id");
  }

  // Deployment methods
  async createDeployment(
    deployment: Omit<Deployment, "id" | "created_at" | "updated_at">
  ): Promise<number> {
    if (!this.db) throw new Error("Database not initialized");

    this.db.run(
      `INSERT INTO deployments (
        name, environment, provider, region, country, ip_address,
        detection_method, config_file_path, config_type,
        carbon_intensity, carbon_intensity_source, carbon_intensity_updated_at,
        status, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        deployment.name,
        deployment.environment,
        deployment.provider,
        deployment.region,
        deployment.country,
        deployment.ip_address,
        deployment.detection_method,
        deployment.config_file_path,
        deployment.config_type,
        deployment.carbon_intensity,
        deployment.carbon_intensity_source,
        deployment.carbon_intensity_updated_at,
        deployment.status,
        JSON.stringify(deployment.metadata || {}),
      ]
    );

    const result = this.db.exec("SELECT last_insert_rowid() as id");
    const id = result[0].values[0][0] as number;

    this.saveDatabase();
    return id;
  }

  /**
   * Get semgrep results for a specific file from assessment_data
   * Queries all runs and extracts matches for the specified file
   */
  async getSemgrepResultsByFile(filePath: string): Promise<SemgrepResultRow[]> {
    if (!this.db) throw new Error("Database not initialized");

    // Query all semgrep runs from assessment_data
    const result = this.db.exec(
      `SELECT * FROM assessment_data 
       WHERE tool_name = 'semgrep' AND data_type = 'code-analysis' 
       ORDER BY timestamp DESC`
    );

    if (result.length === 0) {
      return [];
    }

    const columns = result[0].columns;
    const rows = result[0].values;

    // Flatten matches from all runs and filter by file path
    const allMatches: SemgrepResultRow[] = [];

    rows.forEach((values: any) => {
      const row: any = {};
      columns.forEach((col: string, idx: number) => {
        row[col] = values[idx];
      });

      // Parse JSON data
      const data = row.data ? JSON.parse(row.data) : {};
      const matches = data.matches || [];

      // Filter matches for the requested file
      matches.forEach((match: any) => {
        const matchFilePath = match.file_path || match.path;
        if (matchFilePath === filePath) {
          allMatches.push({
            id: row.id, // Use assessment_data id
            rule_id: match.rule_id,
            severity: match.severity,
            file_path: matchFilePath,
            start_line: match.start_line,
            end_line: match.end_line,
            start_column: match.start_column,
            end_column: match.end_column,
            created_at: row.timestamp,
          });
        }
      });
    });

    return allMatches;
  }

  /**
   * Get all semgrep results from assessment_data
   * Flattens matches from all runs
   */
  async getAllSemgrepResults(): Promise<SemgrepResultRow[]> {
    if (!this.db) throw new Error("Database not initialized");

    // Query all semgrep runs from assessment_data
    const result = this.db.exec(
      `SELECT * FROM assessment_data 
       WHERE tool_name = 'semgrep' AND data_type = 'code-analysis' 
       ORDER BY timestamp DESC`
    );

    if (result.length === 0) {
      return [];
    }

    const columns = result[0].columns;
    const rows = result[0].values;

    // Flatten matches from all runs
    const allMatches: SemgrepResultRow[] = [];

    rows.forEach((values: any) => {
      const row: any = {};
      columns.forEach((col: string, idx: number) => {
        row[col] = values[idx];
      });

      // Parse JSON data
      const data = row.data ? JSON.parse(row.data) : {};
      const matches = data.matches || [];

      // Add all matches with assessment_data metadata
      matches.forEach((match: any) => {
        allMatches.push({
          id: row.id, // Use assessment_data id
          rule_id: match.rule_id,
          severity: match.severity,
          file_path: match.file_path || match.path,
          start_line: match.start_line,
          end_line: match.end_line,
          start_column: match.start_column,
          end_column: match.end_column,
          created_at: row.timestamp,
        });
      });
    });

    return allMatches;
  }

  /**
   * Delete semgrep results for a specific file
   * Since we now store one entry per file (not per run), we can delete by target path
   */
  async deleteSemgrepResultsByFile(filePath: string): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    // Delete all entries where the target matches the file path
    this.db.run(
      `DELETE FROM assessment_data
       WHERE tool_name = 'semgrep'
       AND data_type = 'code-analysis'
       AND json_extract(data, '$.target') = ?`,
      [filePath]
    );
  }

  async updateDeployment(
    id: number,
    updates: Partial<Omit<Deployment, "id" | "created_at">>
  ): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push("name = ?");
      values.push(updates.name);
    }
    if (updates.environment !== undefined) {
      fields.push("environment = ?");
      values.push(updates.environment);
    }
    if (updates.provider !== undefined) {
      fields.push("provider = ?");
      values.push(updates.provider);
    }
    if (updates.region !== undefined) {
      fields.push("region = ?");
      values.push(updates.region);
    }
    if (updates.country !== undefined) {
      fields.push("country = ?");
      values.push(updates.country);
    }
    if (updates.ip_address !== undefined) {
      fields.push("ip_address = ?");
      values.push(updates.ip_address);
    }
    if (updates.detection_method !== undefined) {
      fields.push("detection_method = ?");
      values.push(updates.detection_method);
    }
    if (updates.config_file_path !== undefined) {
      fields.push("config_file_path = ?");
      values.push(updates.config_file_path);
    }
    if (updates.config_type !== undefined) {
      fields.push("config_type = ?");
      values.push(updates.config_type);
    }
    if (updates.carbon_intensity !== undefined) {
      fields.push("carbon_intensity = ?");
      values.push(updates.carbon_intensity);
    }
    if (updates.carbon_intensity_source !== undefined) {
      fields.push("carbon_intensity_source = ?");
      values.push(updates.carbon_intensity_source);
    }
    if (updates.carbon_intensity_updated_at !== undefined) {
      fields.push("carbon_intensity_updated_at = ?");
      values.push(updates.carbon_intensity_updated_at);
    }
    if (updates.status !== undefined) {
      fields.push("status = ?");
      values.push(updates.status);
    }
    if (updates.metadata !== undefined) {
      fields.push("metadata = ?");
      values.push(JSON.stringify(updates.metadata));
    }

    fields.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    this.db.run(
      `UPDATE deployments SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    this.saveDatabase();
  }

  async getDeployment(id: number): Promise<Deployment | null> {
    if (!this.db) throw new Error("Database not initialized");

    const result = this.db.exec("SELECT * FROM deployments WHERE id = ?", [id]);

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

    return row;
  }

  async getAllDeployments(filters?: {
    environment?: string;
    provider?: string;
    status?: string;
  }): Promise<Deployment[]> {
    if (!this.db) throw new Error("Database not initialized");

    let query = "SELECT * FROM deployments";
    const params: any[] = [];

    if (filters) {
      const conditions = [];

      if (filters.environment) {
        conditions.push("environment = ?");
        params.push(filters.environment);
      }

      if (filters.provider) {
        conditions.push("provider = ?");
        params.push(filters.provider);
      }

      if (filters.status) {
        conditions.push("status = ?");
        params.push(filters.status);
      }

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }
    }

    query += " ORDER BY environment, name";

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
      row.metadata = row.metadata ? JSON.parse(row.metadata) : {};
      return row;
    });
  }

  async deleteDeployment(id: number): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    this.db.run("DELETE FROM deployments WHERE id = ?", [id]);

    this.saveDatabase();
  }

  async reloadDatabase(): Promise<void> {
    if (!this.SQL) {
      // If SQL.js isn't initialized, initialize it first
      await this.initialize();
      return;
    }

    if (!this.db) {
      throw new Error("Database not initialized");
    }

    // Save current state first
    this.saveDatabase();

    // Reload from disk
    let existingData: Buffer | undefined;
    if (fs.existsSync(this.dbPath)) {
      existingData = fs.readFileSync(this.dbPath);
    }

    if (existingData) {
      // Close old database
      this.db.close();
      // Load new database from disk
      this.db = new this.SQL.Database(existingData);
    }
    // If file doesn't exist, keep current in-memory database
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
  if (typeof dbPath === "string") {
    return new DataService({ dbPath });
  }
  return new DataService(dbPath);
};

// Alias for backwards compatibility
export const DataLake = DataService;
