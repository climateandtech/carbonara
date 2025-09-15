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
carbonara analyze greenframe https://example.com --save

# Install and use external tools
carbonara tools --install greenframe
carbonara analyze greenframe https://example.com --save
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
| `analyze <tool> <url>` | Run analysis with registered tool | `carbonara analyze greenframe https://example.com --save` |
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
  --scroll-to-bottom                     # Scroll page during analysis
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
- **greenframe**: Website carbon footprint analysis

#### External Tools
- **greenframe**: Website carbon footprint (`@marmelab/greenframe-cli`)
- **impact-framework**: GSF measurement framework (`@grnsft/if @tngtech/if-webpage-plugins`)

#### Tool Management
```bash
carbonara tools --list                    # List all tools and status
carbonara tools --install greenframe      # Install external tool
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