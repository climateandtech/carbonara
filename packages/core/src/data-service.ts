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
  message?: string; // Optional message from match data
  created_at: string;
}

export class DataService {
  private db: Database | null = null;
  private dbPath: string;
  private SQL: any = null;
  private dbExistedOnInit: boolean = false;
  private fileWatcher: fs.FSWatcher | null = null;
  private isReloading: boolean = false;
  private onDatabaseReloadCallback: (() => void) | null = null;

  constructor(config: DatabaseConfig = {}) {
    this.dbPath =
      config.dbPath || path.join(process.cwd(), ".carbonara", "carbonara.db");
  }

  getDbPath(): string {
    return this.dbPath;
  }

  /**
   * Set a callback to be invoked when the database is reloaded from disk
   * (e.g., when file watcher detects external changes from CLI)
   */
  setOnDatabaseReloadCallback(callback: (() => void) | null): void {
    this.onDatabaseReloadCallback = callback;
  }

  private saveDatabase(): void {
    if (this.db) {
      // Temporarily disable reloading to avoid reloading our own writes
      this.isReloading = true;
      try {
        // Verify data exists in memory before exporting
        const countResult = this.db.exec("SELECT COUNT(*) as count FROM assessment_data");
        const inMemoryCount = countResult.length > 0 && countResult[0].values.length > 0
          ? countResult[0].values[0][0] : 0;
        console.log(`[DataService] In-memory assessment_data count before save: ${inMemoryCount}`);
        
        const data = this.db.export();
        const buffer = Buffer.from(data);
        console.log(`[DataService] Saving database to ${this.dbPath} (${buffer.length} bytes)`);
        fs.writeFileSync(this.dbPath, buffer);
        
        // Verify file was written
        if (fs.existsSync(this.dbPath)) {
          const fileSize = fs.statSync(this.dbPath).size;
          console.log(`[DataService] ✅ Database saved successfully (file size: ${fileSize} bytes)`);
          
          // Try to verify the data is in the saved file by reading it back
          try {
            const savedData = fs.readFileSync(this.dbPath);
            const verifyDb = new this.SQL.Database(savedData);
            const verifyResult = verifyDb.exec("SELECT COUNT(*) as count FROM assessment_data");
            const savedCount = verifyResult.length > 0 && verifyResult[0].values.length > 0
              ? verifyResult[0].values[0][0] : 0;
            console.log(`[DataService] Verification: Saved file contains ${savedCount} assessment_data row(s)`);
            verifyDb.close();
          } catch (verifyError: any) {
            console.error(`[DataService] ⚠️  Could not verify saved file: ${verifyError.message}`);
          }
        } else {
          console.error(`[DataService] ❌ Database file does not exist after save!`);
        }
      } catch (error: any) {
        console.error(`[DataService] ❌ Failed to save database: ${error.message}`);
        throw error; // Re-throw so caller knows it failed
      } finally {
        // Re-enable reloading after a short delay to let file system settle
        setTimeout(() => {
          this.isReloading = false;
        }, 200);
      }
    } else {
      console.warn(`[DataService] ⚠️  Cannot save database: database not initialized`);
    }
  }

  /**
   * Check if database file exists on disk
   */
  databaseExists(): boolean {
    return fs.existsSync(this.dbPath);
  }

  /**
   * Check if the project is initialized (has config file)
   * This prevents creating databases for non-Carbonara projects
   */
  isProjectInitialized(): boolean {
    const dbDir = path.dirname(this.dbPath);
    const configPath = path.join(dbDir, "carbonara.config.json");
    return fs.existsSync(configPath);
  }

  async initialize(): Promise<void> {
    // Initialize sql.js
    this.SQL = await initSqlJs();

    // Ensure the .carbonara directory exists
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // CRITICAL: Track if database file existed before initialization
    // This prevents overwriting existing databases with empty in-memory state
    // when close() is called during instance switching (e.g., window reload)
    let existingData: Buffer | undefined;
    if (fs.existsSync(this.dbPath)) {
      existingData = fs.readFileSync(this.dbPath);
      this.dbExistedOnInit = true;
    } else {
      this.dbExistedOnInit = false;
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

    // CRITICAL FIX: Do NOT save database here on initialization
    //
    // Previous behavior: saveDatabase() was called here, which overwrote the
    // existing database file with the in-memory state. When the extension reloaded:
    // 1. Existing database file was loaded into memory (with data)
    // 2. Tables were created/verified (no data loss yet)
    // 3. saveDatabase() was called, writing in-memory state to disk
    // 4. If in-memory database was empty/incomplete, it overwrote the file
    //
    // New behavior: Database is only saved when:
    // - Explicit data modifications occur (createProject, saveAssessmentData, etc.)
    // - close() is called AND database has data (see close() method)
    //
    // This ensures existing databases are never overwritten with empty state
    // this.saveDatabase();

    // Set up file watcher to auto-reload when database changes externally
    this.setupFileWatcher();
  }

  private setupFileWatcher(): void {
    // Only watch if file exists
    if (!fs.existsSync(this.dbPath)) {
      return;
    }

    // Close existing watcher if any
    if (this.fileWatcher) {
      this.fileWatcher.close();
    }

    // Watch for changes to the database file
    // Use a small delay to avoid reloading during our own writes
    let reloadTimeout: NodeJS.Timeout | null = null;
    
    this.fileWatcher = fs.watch(this.dbPath, (eventType) => {
      // Only reload on 'change' events (not 'rename')
      if (eventType === 'change' && !this.isReloading) {
        // Debounce: wait 100ms before reloading to avoid multiple rapid reloads
        if (reloadTimeout) {
          clearTimeout(reloadTimeout);
        }
        reloadTimeout = setTimeout(async () => {
          try {
            await this.reloadDatabase();
            // Notify listeners that database was reloaded from disk
            if (this.onDatabaseReloadCallback) {
              this.onDatabaseReloadCallback();
            }
          } catch (error) {
            console.error('Error auto-reloading database:', error);
          }
        }, 100);
      }
    });
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

  async getProjectById(projectId: number): Promise<Project | null> {
    if (!this.db) throw new Error("Database not initialized");

    const result = this.db.exec("SELECT * FROM projects WHERE id = ?", [
      projectId,
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

    console.log(`[DataService] Storing assessment data:`);
    console.log(`[DataService]   Project ID: ${projectId}`);
    console.log(`[DataService]   Tool Name: ${toolName}`);
    console.log(`[DataService]   Data Type: ${dataType}`);
    console.log(`[DataService]   Source: ${source || 'none'}`);
    console.log(`[DataService]   Data keys: ${Object.keys(data).join(', ')}`);
    
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

    console.log(`[DataService] Stored with ID: ${id}`);
    this.saveDatabase();
    
    // Verify the data was actually saved by reading it back
    const verifyResult = this.db.exec("SELECT COUNT(*) as count FROM assessment_data WHERE id = ?", [id]);
    const verifyCount = verifyResult.length > 0 && verifyResult[0].values.length > 0
      ? verifyResult[0].values[0][0] : 0;
    console.log(`[DataService] Verification: Found ${verifyCount} row(s) with id=${id} after insert`);
    
    // Also verify the file on disk
    if (fs.existsSync(this.dbPath)) {
      const fileSize = fs.statSync(this.dbPath).size;
      console.log(`[DataService] Database file size: ${fileSize} bytes`);
    }
    
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

    console.log(`[DataService] Query: ${query}`);
    console.log(`[DataService] Params:`, params);

    const result = this.db.exec(query, params);

    console.log(`[DataService] Query returned ${result.length} result sets`);

    if (result.length === 0) {
      console.log(`[DataService] No data found in assessment_data table`);
      return [];
    }

    const columns = result[0].columns;
    const rows = result[0].values;

    console.log(`[DataService] Found ${rows.length} rows`);

    const entries = rows.map((values: any) => {
      const row: any = {};
      columns.forEach((col: string, idx: number) => {
        row[col] = values[idx];
      });
      row.data = JSON.parse(row.data);
      return row;
    });

    // Log summary of what was found
    if (entries.length > 0) {
      const toolCounts: { [key: string]: number } = {};
      entries.forEach((entry: any) => {
        const tool = entry.tool_name || 'unknown';
        toolCounts[tool] = (toolCounts[tool] || 0) + 1;
      });
      console.log(`[DataService] Data summary:`, JSON.stringify(toolCounts, null, 2));
    }

    return entries;
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
    return result[0].values[0][0] as number;
  }

  /**
   * Get semgrep results for a specific file from assessment_data
   * Returns only the newest entry (most recent run) for the specified file
   */
  async getSemgrepResultsByFile(filePath: string): Promise<SemgrepResultRow[]> {
    if (!this.db) throw new Error("Database not initialized");

    // Query all semgrep runs from assessment_data, ordered by timestamp DESC
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

    // Find the newest run that contains this file
    const allMatches: SemgrepResultRow[] = [];

    for (const values of rows) {
      const row: any = {};
      columns.forEach((col: string, idx: number) => {
        row[col] = values[idx];
      });

      // Parse JSON data
      const data = row.data ? JSON.parse(row.data) : {};
      const matches = data.matches || [];
      const target = data.target || "";

      // Normalize paths for comparison (handle different path formats)
      const normalizePath = (p: string) => p.replace(/\\/g, "/").toLowerCase();
      const normalizedTarget = normalizePath(target);
      const normalizedFilePath = normalizePath(filePath);
      const fileName = path.basename(filePath);
      const targetFileName = path.basename(target);

      // Check if this run is for the requested file
      // Match by: exact path, normalized path, or just filename
      const isMatch = 
        target === filePath ||
        normalizedTarget === normalizedFilePath ||
        targetFileName === fileName ||
        target.endsWith(filePath) ||
        filePath.endsWith(target);

      if (isMatch) {
        // This is the newest run for this file (since we're iterating DESC)
        // Extract all matches for this file
        matches.forEach((match: any) => {
          const matchFilePath = match.file_path || match.path || target;
          const normalizedMatchPath = normalizePath(matchFilePath);
          
          // Match if paths are the same (exact or normalized) or if filenames match
          const matchIsForFile = 
            matchFilePath === filePath ||
            normalizedMatchPath === normalizedFilePath ||
            path.basename(matchFilePath) === fileName;
            
          if (matchIsForFile) {
            allMatches.push({
              id: row.id, // Use assessment_data id
              rule_id: match.rule_id,
              severity: match.severity,
              file_path: matchFilePath,
              start_line: match.start_line,
              end_line: match.end_line,
              start_column: match.start_column,
              end_column: match.end_column,
              message: match.message, // Include message if available
              created_at: row.timestamp,
            });
          }
        });
        // Found the newest run for this file, stop searching
        break;
      }
    }

    return allMatches;
  }

  /**
   * Get all semgrep results from assessment_data
   * Returns only the newest entry per file (most recent run for each file)
   */
  async getAllSemgrepResults(): Promise<SemgrepResultRow[]> {
    if (!this.db) throw new Error("Database not initialized");

    // Query all semgrep runs from assessment_data, ordered by timestamp DESC
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

    // Track which files we've already seen (to only keep newest entry per file)
    const filesSeen = new Set<string>();
    const allMatches: SemgrepResultRow[] = [];

    // Process rows in order (newest first)
    rows.forEach((values: any) => {
      const row: any = {};
      columns.forEach((col: string, idx: number) => {
        row[col] = values[idx];
      });

      // Parse JSON data
      const data = row.data ? JSON.parse(row.data) : {};
      const matches = data.matches || [];
      const target = data.target || "";

      // Only process matches from this run if we haven't seen this file yet
      // This ensures we only show the newest results for each file
      if (target && !filesSeen.has(target)) {
        filesSeen.add(target);
        
        // Add all matches from this (newest) run for this file
        matches.forEach((match: any) => {
          const matchFilePath = match.file_path || match.path || target;
          // Only add matches that belong to this file's target
          if (matchFilePath === target) {
            allMatches.push({
              id: row.id, // Use assessment_data id
              rule_id: match.rule_id,
              severity: match.severity,
              file_path: matchFilePath,
              start_line: match.start_line,
              end_line: match.end_line,
              start_column: match.start_column,
              end_column: match.end_column,
              message: match.message, // Include message if available
              created_at: row.timestamp,
            });
          }
        });
      }
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

  async reloadDatabase(): Promise<void> {
    if (!this.SQL) {
      // If SQL.js isn't initialized, initialize it first
      await this.initialize();
      return;
    }

    if (!this.db) {
      throw new Error("Database not initialized");
    }

    // Prevent recursive reloads
    if (this.isReloading) {
      return;
    }

    this.isReloading = true;
    try {
      // CRITICAL FIX: Do NOT save current state before reloading!
      // 
      // Previous behavior: saveDatabase() was called here, which would overwrite
      // the database file with the current in-memory state. This caused a race condition:
      // 1. CLI writes data to disk
      // 2. File watcher detects change and calls reloadDatabase()
      // 3. reloadDatabase() saves empty in-memory state to disk (overwrites CLI's write!)
      // 4. reloadDatabase() then loads the empty state from disk
      //
      // New behavior: Only reload from disk, never save before reloading.
      // The disk is the source of truth. If we have unsaved changes in memory,
      // they will be lost, but that's acceptable because:
      // - The CLI always saves before closing
      // - The extension should only read, not write (except through CLI)
      // - The file watcher is meant to detect external changes (CLI writes)

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
        console.log(`[DataService] Database reloaded from disk (${existingData.length} bytes)`);
      }
      // If file doesn't exist, keep current in-memory database
    } finally {
      this.isReloading = false;
    }
  }

  async close(): Promise<void> {
    // Close file watcher
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }

    if (this.db) {
      // CRITICAL FIX: Conditional save to prevent data loss
      //
      // Problem: When ensureDatabaseInitialized() switches instances (e.g., on window reload),
      // it calls close() on the old instance. Previously, close() always saved, which could
      // overwrite an existing database file with an empty in-memory database.
      //
      // Solution: Only save if:
      // 1. Database has data (projects or assessment_data exist), OR
      // 2. Database didn't exist when initialized (new database, safe to save)
      //
      // This prevents overwriting existing database files with empty state when just
      // switching instances during extension reload.
      const hasData = this.hasData();
      console.log(`[DataService] close() called: hasData=${hasData}, dbExistedOnInit=${this.dbExistedOnInit}`);
      if (hasData || !this.dbExistedOnInit) {
        console.log(`[DataService] Saving database on close...`);
        this.saveDatabase();
      } else {
        console.log(`[DataService] ⚠️  Skipping save on close (no data and database existed on init)`);
      }
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Check if database contains any data (projects or assessment_data).
   * Used by close() to determine if it's safe to save the database.
   * 
   * CRITICAL: This prevents overwriting existing database files with empty
   * in-memory state when switching instances during extension reload.
   */
  private hasData(): boolean {
    if (!this.db) return false;
    try {
      // Check if we have any projects or assessment data
      const projects = this.db.exec("SELECT COUNT(*) as count FROM projects");
      const assessmentData = this.db.exec("SELECT COUNT(*) as count FROM assessment_data");

      const projectCount = projects.length > 0 && projects[0].values.length > 0
        ? projects[0].values[0][0] : 0;
      const dataCount = assessmentData.length > 0 && assessmentData[0].values.length > 0
        ? assessmentData[0].values[0][0] : 0;

      return (projectCount as number) > 0 || (dataCount as number) > 0;
    } catch (error) {
      // If tables don't exist yet, consider it empty
      return false;
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
