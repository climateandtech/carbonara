# Carbonara - CO2 Assessment & Sustainability Platform

A comprehensive monorepo containing CLI tools, VS Code extension, and multi-editor plugin architecture for CO2 assessment and web sustainability analysis.

## 🌱 Overview

Carbonara provides tools to measure, track, and optimize the environmental impact of digital projects through interactive assessments and automated analysis.

### Key Features

- **🔍 CO2 Assessment**: Interactive questionnaires to evaluate project sustainability
- **🌐 Web Analysis**: Pluggable analyzer architecture with built-in and external tools
- **📊 Data Lake**: SQLite-based storage with JSON flexibility and import/export
- **🛠️ CLI Tool**: Command-line interface for all operations
- **📝 VS Code Extension**: Native IDE integration with visual interface
- **🔌 Multi-Editor Support**: Plugin architecture for various editors

## 📁 Project Structure

```
carbonara/
├── packages/                    # Core packages and services
│   ├── cli/                    # 🔧 Carbonara CLI tool (main interface)
│   │   ├── src/
│   │   │   ├── index.ts        # CLI entry point
│   │   │   ├── commands/       # Assessment, Analysis, Data, Tools, Import
│   │   │   ├── analyzers/      # Built-in analysis tools
│   │   │   ├── registry/       # Tool registry and detection
│   │   │   ├── database/       # SQLite data lake implementation
│   │   │   └── utils/          # Configuration and utilities
│   │   ├── schemas/            # JSON schemas for tools and assessments
│   │   └── test/               # Comprehensive test suite
│   ├── core-backend/           # Backend logic (Python/TypeScript)
│   ├── rpc-protocol/           # JSON-RPC protocol definitions
│   └── rpc-client/             # Client libraries for different languages
├── apps/                       # Applications
│   └── web-ui/                 # Svelte web application
├── plugins/                    # Editor integrations
│   ├── vscode/                 # 📝 VS Code extension (ready-to-install)
│   │   ├── src/extension.ts    # Extension logic with E2E tests
│   │   ├── e2e/               # Playwright UI tests
│   │   └── *.vsix              # Installable package
│   ├── jetbrains/              # JetBrains plugin (future)
│   ├── vim/                    # Vim/Neovim plugin (future)
│   └── emacs/                  # Emacs plugin (future)
├── docs/                       # Documentation
└── tools/                      # Development tools and scripts
```

## 🚀 Quick Start

### CLI Tool (Recommended)

```bash
# Install globally
npm install -g @carbonara/cli

# Initialize project
carbonara init

# Run CO2 assessment
carbonara assess

# List available analysis tools
carbonara tools --list

# Analyze with built-in tool
carbonara analyze carbonara-swd https://example.com --save

# Install and use external tools
carbonara analyze impact-framework https://example.com --save
```

### VS Code Extension

```bash
# Install extension
cd plugins/vscode
code --install-extension carbonara-vscode-1.0.0.vsix

# Usage: Click Carbonara in status bar for quick-pick menu
```

### Development Setup

```bash
npm install
npm run build
cd packages/cli && npm link  # Global CLI access
npm test
```

## 🔧 CLI Commands

### Core Commands

| Command | Description | Example |
|---------|-------------|---------|
| `init` | Initialize new project | `carbonara init` |
| `assess` | Run CO2 assessment questionnaire | `carbonara assess` |
| `analyze <tool> <url>` | Run analysis with registered tool | `carbonara analyze carbonara-swd https://example.com --save` |
| `tools` | Manage analysis tools | `carbonara tools --list` |
| `data` | Manage stored assessment data | `carbonara data --list` |
| `import` | Import data from files/databases | `carbonara import --file data.json` |

### Detailed Command Reference

#### Project Management
```bash
carbonara init [--path <path>]           # Initialize project with config and database
carbonara assess [--interactive]         # Interactive CO2 assessment questionnaire
```

#### Analysis Tools
```bash
carbonara tools --list                   # List all available tools and status
carbonara tools --install <tool-id>      # Install external analysis tool
carbonara tools --refresh                # Refresh tool installation status

carbonara analyze <tool-id> <url>        # Run analysis with specified tool
  --save                                  # Save results to project database
  --output <json|table>                  # Output format (default: table)
  --scroll-to-bottom                     # Scroll page during analysis (IF tools)
  --first-visit-percentage <0-1>         # First visit percentage (IF tools)
  --test-command <command>               # E2E test command to run (if-e2e-cpu-metrics)
```

#### Data Management
```bash
carbonara data --list                    # List all stored assessment data
carbonara data --show                    # Show detailed project analysis
carbonara data --export <json|csv>       # Export data to file
carbonara data --clear                   # Clear all stored data

carbonara import --file <path>           # Import from JSON/CSV file
carbonara import --database <path>       # Import from another Carbonara database
  --format <json|csv>                    # Force file format
  --overwrite                           # Overwrite duplicate records
```

### Analysis Tools

#### Built-in Tools
- **carbonara-swd**: Sustainable Web Design analysis based on methodology from sustainablewebdesign.org
- **co2-assessment**: Interactive questionnaire for project carbon impact estimation
- **semgrep**: Static code analysis for security and sustainability patterns

#### External Tools
- **if-webpage-scan**: Impact Framework webpage analysis with CO2 estimation
- **if-green-hosting**: Check if website is hosted on green energy
- **if-cpu-metrics**: Monitor local CPU utilization and energy consumption during analysis
- **if-e2e-cpu-metrics**: Monitor CPU utilization while running E2E tests (Cypress, Playwright, etc.)

#### Tool Management
```bash
carbonara tools --list                    # List all tools and status
carbonara tools --refresh                 # Refresh installation status
```

### Data Management
```bash
carbonara data --list                     # List stored data
carbonara data --show                     # Show detailed analysis
carbonara data --export json              # Export to JSON
carbonara import --file data.json         # Import from file
carbonara import --database other.db      # Import from database
```

## 📝 VS Code Extension

### Features
- **Status Bar Integration**: Real-time project status
- **Command Palette**: Access all Carbonara commands
- **Interactive Menus**: Visual interface for operations
- **Project Management**: Initialize and configure projects

### Usage
1. Click **Carbonara** in status bar
2. Select from quick-pick menu:
   - 🚀 Initialize Project
   - ✅ Run CO2 Assessment  
   - 🌐 Analyze Website
   - 🗄️ View Data
   - ⚙️ Open Configuration

## 🗄️ Database Model

**SQLite database (`carbonara.db`) with JSON storage:**

- `projects` - Project metadata and CO2 variables
- `assessment_data` - All analysis results (schemaless JSON)
- `tool_runs` - Tool execution history

## 🔧 Development

### CLI Development
```bash
cd packages/cli
npm install && npm link
npm run build && npm test
```

### VS Code Extension Development
```bash
cd plugins/vscode
npm install && npm run build
npm run test:ui              # Playwright E2E tests
npm run package             # Create .vsix
```

### Testing
```bash
npm test                     # All tests
npm run test:cli            # CLI tests only
```

### Adding External Tools

External tools are automatically tested by generic test suites. To add a new tool:

1. **Add to registry**: Update `packages/cli/src/registry/tools.json`
2. **Configure options**: Define tool options for VSCode integration
3. **Run tests**: Your tool is automatically included in test coverage

**Impact Framework tools** use manifest templates with placeholder replacement:
```json
{
  "id": "if-webpage-scan",
  "manifestTemplate": {
    "initialize": {
      "plugins": {
        "webpage-impact": {
          "method": "WebpageImpact",
          "config": { "url": "{url}", "scrollToBottom": "{scrollToBottom}" }
        }
      }
    }
  },
  "display": {
    "fields": [
      { "key": "carbon", "path": "data.tree.children.child.outputs[0]['operational-carbon']" }
    ]
  }
}
```

**Generic tools** work with any CLI tool:
```json
{
  "id": "my-tool",
  "command": {
    "executable": "my-tool",
    "args": ["--url", "{url}", "--option", "{option}"]
  },
  "options": [
    { "flag": "--option", "type": "string", "description": "Tool option" }
  ]
}
```

### E2E Test Integration

Monitor the environmental impact of running your existing E2E test suites:

```bash
# Monitor CPU usage while running Cypress tests
carbonara analyze if-e2e-cpu-metrics https://myapp.com --test-command "npx cypress run" --save

# Monitor CPU usage while running Playwright tests  
carbonara analyze if-e2e-cpu-metrics https://myapp.com --test-command "npx playwright test" --save

# Monitor CPU usage while running custom test script
carbonara analyze if-e2e-cpu-metrics https://myapp.com --test-command "npm run test:e2e" --save
```

This measures the CPU utilization, energy consumption, and CO2 emissions of running your tests locally, helping you understand the environmental impact of your testing process.

## 📦 Versioning

This project follows [Semantic Versioning (SemVer)](https://semver.org/) principles:

- **MAJOR** version: Incompatible API changes
- **MINOR** version: New functionality (backward compatible)
- **PATCH** version: Bug fixes (backward compatible)

### Current Versions
- **Monorepo**: 0.1.0
- **CLI**: 0.1.0 
- **VS Code Extension**: 0.1.0

### Pre-1.0 Development
During pre-1.0 development (0.x.x), minor versions may include breaking changes. The API is considered unstable until 1.0.0 release.

## 📄 License

To be clarified - All rights reserved