# Carbonara CLI

A command-line tool for CO2 assessment and web sustainability analysis.

## Installation

```bash
npm install -g @carbonara/cli
```

## Usage

### Initialize a Project

```bash
carbonara init
```

This will create a new Carbonara project with:
- `carbonara.config.json` - Project configuration
- `carbonara.db` - SQLite database for storing assessment data
- `schemas/` - JSON schema files for data validation

### Run CO2 Assessment

```bash
carbonara assess
```

Interactive questionnaire that assesses your project's CO2 impact based on:
- Project scope (users, traffic, lifespan)
- Infrastructure (hosting, location, storage)
- Development practices (team size, CI/CD, testing)
- Features (real-time, media, AI/ML, blockchain, IoT)
- Sustainability goals

### Analyze Website

```bash
carbonara greenframe <url>
```

Analyze a website's carbon footprint using Greenframe (or mock analysis):

```bash
# Basic analysis
carbonara greenframe https://example.com

# Save results to database
carbonara greenframe https://example.com --save
```

### Data Management

```bash
# List all stored data
carbonara data --list

# Export data to JSON
carbonara data --export json

# Export data to CSV
carbonara data --export csv

# Clear all data
carbonara data --clear
```

## Development

### Running Tests

```bash
npm test
```

The test suite includes:
- CLI command functionality
- Help and version display
- Error handling
- Database operations
- URL validation

### Test Coverage

```bash
npm run test:coverage
```

## Project Structure

```
src/
├── index.js              # Main CLI entry point
├── commands/
│   ├── init.js          # Project initialization
│   ├── assess.ts        # CO2 assessment questionnaire
│   ├── greenframe.ts    # Website analysis
│   └── data.ts          # Data management
├── database/
│   └── index.ts         # SQLite database operations
└── utils/
    └── config.ts        # Configuration management
```

## Configuration

The CLI uses a `carbonara.config.json` file to store project settings:

```json
{
  "name": "My Project",
  "description": "Project description",
  "projectType": "web",
  "projectId": "unique-id",
  "created": "2024-01-01T00:00:00.000Z"
}
```

## Database Schema

The SQLite database includes tables for:
- `projects` - Project metadata and CO2 variables
- `assessment_data` - All assessment results
- `tool_runs` - Tool execution history

## License

ISC 