# Database-Driven Code Highlighting for Carbonara VSCode Extension

## Overview

This feature reads analysis data from the SQLite database (`carbonara.db`) and displays code highlights directly in the VSCode editor using the Programmatic Language Features API.

## Architecture

The system consists of several key components:

### 1. Database Reader (`database-highlighter.ts`)
- Connects to the existing `carbonara.db` SQLite database in read-only mode
- Reads assessment data from the `assessment_data` table
- Extracts code highlight information from the stored JSON data
- Does NOT create or modify the database - assumes it already exists

### 2. Visual Highlighting
The extension provides multiple ways to display code issues:

- **Inline Decorations**: Color-coded underlines and backgrounds
  - 🔴 Red: Errors (high CO2 impact issues)
  - 🟡 Yellow: Warnings (medium impact)
  - 🔵 Blue: Information (low impact)
  - 🟢 Green: Hints/Suggestions (optimization opportunities)

- **Problems Panel**: All issues appear in VSCode's Problems panel
- **Hover Information**: Detailed messages when hovering over highlighted code
- **Code Actions**: Quick fixes and actions for addressing issues

### 3. Database Structure

The extension reads from the existing database structure used by the Carbonara CLI:

```sql
-- The assessment_data table stores analysis results
CREATE TABLE assessment_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    tool_name TEXT NOT NULL,      -- e.g., 'code_analysis', 'assessment'
    data_type TEXT NOT NULL,      -- e.g., 'code_highlights', 'co2_analysis'
    data JSON NOT NULL,           -- JSON data containing highlights
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT,
    FOREIGN KEY (project_id) REFERENCES projects (id)
);
```

## Data Format

The extension expects highlight data in the `data` JSON field with one of these formats:

### Format 1: Direct Code Highlights
```json
{
  "highlights": [
    {
      "file_path": "src/file.ts",
      "start_line": 10,
      "start_column": 1,
      "end_line": 15,
      "end_column": 50,
      "severity": "warning",
      "message": "High energy consumption pattern detected",
      "category": "efficiency"
    }
  ]
}
```

### Format 2: CO2 Assessment with File Analysis
```json
{
  "fileAnalysis": [
    {
      "file": "src/file.ts",
      "issues": [
        {
          "line": 20,
          "column": 5,
          "severity": "error",
          "message": "Memory leak detected"
        }
      ]
    }
  ]
}
```

## Usage

### Prerequisites
1. A Carbonara project initialized with `carbonara init`
2. A `carbonara.db` database file in the project
3. Assessment data stored in the database

### Commands

The extension adds the following commands:

- **Refresh Code Highlights** (`carbonara.refreshHighlights`): Reload highlights from database
- **Clear Code Highlights** (`carbonara.clearHighlights`): Temporarily clear all highlights
- **View Highlight Details** (`carbonara.viewHighlightDetails`): Show detailed information about a specific highlight

### How It Works

1. **Initialization**: When the extension activates, it:
   - Finds and reads `carbonara.config.json` to get the project ID
   - Locates the `carbonara.db` file
   - Connects to the database in read-only mode

2. **Data Loading**: The extension:
   - Queries the `assessment_data` table for the current project
   - Parses the JSON data to extract code highlights
   - Maps highlights to the appropriate files

3. **Display**: For each open file:
   - Applies visual decorations at specified line/column ranges
   - Adds entries to the Problems panel
   - Enables hover tooltips with detailed information

## Testing

To test the highlighting feature with sample data:

1. Ensure you have a Carbonara project initialized:
   ```bash
   cd your-project
   carbonara init
   ```

2. Run the sample data insertion script:
   ```bash
   cd plugins/vscode
   npx ts-node scripts/sample-data-insertion.ts
   ```

3. Open the project in VSCode

4. Run the "Refresh Code Highlights" command from the Command Palette

## Integration with Analysis Tools

Analysis tools can store highlight data by:

1. Using the Carbonara CLI's DataLake API:
   ```typescript
   await dataLake.storeAssessmentData(
     projectId,
     'your_tool_name',
     'code_highlights',
     highlightData,
     'tool-source'
   );
   ```

2. Or directly inserting into the database:
   ```sql
   INSERT INTO assessment_data (project_id, tool_name, data_type, data, source)
   VALUES (?, 'analyzer', 'highlights', '{"highlights": [...]}', 'source');
   ```

## Customization

The highlighting behavior can be customized by modifying:

- **Decoration Styles**: Edit `createDecorationTypes()` in `database-highlighter.ts`
- **Severity Mapping**: Modify `mapSeverity()` to change how severities are interpreted
- **Data Extraction**: Update `extractHighlightsFromAssessmentData()` to handle new data formats

## Troubleshooting

### No highlights appearing
- Check that `carbonara.db` exists and contains assessment data
- Verify the project ID in `carbonara.config.json` matches the database
- Run "Refresh Code Highlights" command
- Check the Output panel for error messages

### Database not found
- The extension looks for the database in:
  1. Path specified in `carbonara.config.json`
  2. Project root directory
  3. Parent directories

### Performance issues
- Large numbers of highlights may impact performance
- Consider implementing pagination or filtering for large datasets
- The extension uses read-only access to minimize database locks

## Future Enhancements

Potential improvements include:

- Real-time monitoring of database changes
- Filtering highlights by severity or category
- Batch operations for fixing multiple issues
- Integration with Git to track highlight changes over time
- Export highlights to various formats
- Custom quick-fix implementations for common issues
