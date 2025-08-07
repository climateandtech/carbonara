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

## Development

```bash
npm install
npm run build
npm test
npm link  # For global development usage
```