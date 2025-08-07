# Carbonara CLI

A command-line tool for CO2 assessment and web sustainability analysis with pluggable analyzer architecture.

## Installation

```bash
npm install -g @carbonara/cli
```

## Commands

### Project Management

```bash
# Initialize a new project
carbonara init

# Manage stored data
carbonara data --list
carbonara data --show
carbonara data --export json
carbonara data --clear

# Import data from files or other databases
carbonara import --file data.json
carbonara import --database /path/to/carbonara.db
```

### Analysis Tools

```bash
# List available analysis tools
carbonara tools --list

# Install external tools
carbonara tools --install greenframe

# Run analysis with any registered tool
carbonara analyze byte-counter https://example.com --save
carbonara analyze greenframe https://example.com --save
carbonara analyze impact-framework https://example.com --save
```

### CO2 Assessment

```bash
# Interactive questionnaire
carbonara assess
```

## Analysis Tools

### Built-in Tools

- **byte-counter**: Estimates CO2 emissions from data transfer using scientific models (SWD v4 + Coroama 2021)

### External Tools

- **greenframe**: Website carbon footprint analysis (`npm install -g @marmelab/greenframe-cli`)
- **impact-framework**: Green Software Foundation's measurement framework (`npm install -g @grnsft/if @tngtech/if-webpage-plugins`)

## Project Structure

When you run `carbonara init`, it creates:
- `carbonara.config.json` - Project configuration
- `carbonara.db` - SQLite database for assessment data

## Configuration

```json
{
  "name": "My Project",
  "description": "Project description", 
  "projectType": "web",
  "projectId": 1,
  "created": "2024-01-01T00:00:00.000Z"
}
```

## Database Schema

- `projects` - Project metadata and CO2 variables
- `assessment_data` - All analysis results with JSON flexibility
- `tool_runs` - Tool execution history

## Command Reference

### Project Management Commands

#### `carbonara init [options]`
Initialize a new Carbonara project in the current directory.

**Options:**
- `-p, --path <path>` - Project path (default: current directory)

**Creates:**
- `carbonara.config.json` - Project configuration file
- `carbonara.db` - SQLite database for storing assessment data

#### `carbonara assess [options]`
Run interactive CO2 assessment questionnaire.

**Options:**
- `-i, --interactive` - Interactive mode (default: true)
- `-f, --file <file>` - Load from configuration file

**Assessment covers:**
- Project scope (users, traffic, lifespan)
- Infrastructure (hosting, location, storage)
- Development practices (team size, CI/CD, testing)
- Features (real-time, media, AI/ML, blockchain, IoT)
- Sustainability goals

### Analysis Commands

#### `carbonara analyze <tool-id> <url> [options]`
Run analysis with a registered tool.

**Arguments:**
- `<tool-id>` - ID of the analysis tool (e.g., "byte-counter", "greenframe", "impact-framework")
- `<url>` - URL to analyze

**Options:**
- `-s, --save` - Save results to data lake
- `-o, --output <format>` - Output format (json|table, default: table)
- `--scroll-to-bottom` - Scroll to bottom of page during analysis (for web analyzers)

**Examples:**
```bash
carbonara analyze byte-counter https://example.com --save
carbonara analyze greenframe https://example.com --output json
carbonara analyze impact-framework https://example.com --scroll-to-bottom --save
```

#### `carbonara tools [options]`
Manage analysis tools.

**Options:**
- `-l, --list` - List all registered tools and their installation status
- `-i, --install <tool-id>` - Install a specific tool
- `-r, --refresh` - Refresh installation status of all tools

**Examples:**
```bash
carbonara tools --list                    # Show all available tools
carbonara tools --install greenframe      # Install Greenframe CLI
carbonara tools --refresh                 # Update installation status
```

### Data Management Commands

#### `carbonara data [options]`
Manage stored assessment data.

**Options:**
- `-l, --list` - List all stored data
- `-s, --show` - Show detailed project analysis
- `-e, --export <format>` - Export data (json|csv)
- `-c, --clear` - Clear all data

**Examples:**
```bash
carbonara data --list                     # List all stored assessments
carbonara data --show                     # Show detailed analysis
carbonara data --export json              # Export to JSON file
carbonara data --clear                    # Clear all stored data
```

#### `carbonara import [options]`
Import analysis data from files or databases.

**Options:**
- `-f, --file <path>` - Import from JSON/CSV file
- `-d, --database <path>` - Import from another Carbonara database
- `--format <format>` - Force file format (json|csv)
- `-m, --merge` - Merge with existing data (default: true)
- `-o, --overwrite` - Overwrite duplicate records

**Examples:**
```bash
carbonara import --file analysis-results.json
carbonara import --database ../other-project/carbonara.db
carbonara import --file data.csv --format csv --overwrite
```

### Global Options
- `-h, --help` - Display help for command
- `-V, --version` - Display version number

## Development

```bash
npm install
npm run build
npm test
npm link  # For global development usage
```

## License

To be clarified - All rights reserved