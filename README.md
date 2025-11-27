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
- **greenframe**: Website carbon footprint analysis

#### External Tools
- **greenframe**: Website carbon footprint (`@marmelab/greenframe-cli`)
- **if-webpage-scan**: Impact Framework webpage analysis with CO2 estimation
- **if-green-hosting**: Check if website is hosted on green energy
- **if-cpu-metrics**: Monitor local CPU utilization and energy consumption during analysis
- **if-e2e-cpu-metrics**: Monitor CPU utilization while running E2E tests (Cypress, Playwright, etc.)

#### Tool Management
```bash
carbonara tools --list                    # List all tools and status
carbonara tools --install greenframe      # Install external tool
carbonara tools --refresh                 # Refresh installation status
```

#### Smart Tool Detection & Execution

Carbonara includes advanced tool management features for reliable tool detection and execution:

**🔍 Intelligent Detection**
- Uses explicit detection commands to accurately verify tool installation
- Supports multiple detection commands for complex tools with dependencies
- Automatically checks prerequisites (e.g., Docker, browsers) before execution

**⚠️ Error Tracking**
- Yellow status indicator when tools are detected but fail during execution
- Detailed error messages with timestamps in tooltips
- Installation instructions shown when tools are missing or misconfigured

**⚙️ Custom Execution Commands**
- Override default execution commands for manually installed tools
- Configure custom paths or commands via VS Code extension settings
- Maintains error tracking even with custom execution setups
- Useful for tools installed in non-standard locations or with custom configurations

**VS Code Integration**
- Visual status indicators (green/yellow/red) for tool installation and execution state
- Inline action buttons for running tools and viewing installation instructions
- Settings gear icon to configure custom execution commands
- Error tooltips with troubleshooting information

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
- **Smart Tool Management**: Visual status indicators, error tracking, and custom execution commands

### Analysis Tools View
The extension provides a comprehensive Analysis Tools tree view with:
- **Status Indicators**: 
  - 🟢 Green: Tool installed and ready
  - 🟡 Yellow: Tool detected but has errors or missing prerequisites
  - 🔴 Red: Tool not installed
- **Inline Actions**: 
  - ▶️ Run/Install button
  - ℹ️ Installation instructions
  - ⚙️ Custom execution command settings
- **Error Tooltips**: Detailed error messages with timestamps and troubleshooting steps

### Usage
1. Click **Carbonara** in status bar
2. Select from quick-pick menu:
   - 🚀 Initialize Project
   - ✅ Run CO2 Assessment  
   - 🌐 Analyze Website
   - 🗄️ View Data
   - ⚙️ Open Configuration
3. Use the **Analysis Tools** sidebar to:
   - View tool installation status
   - Run analysis tools with a single click
   - Configure custom execution commands for manually installed tools
   - View detailed installation instructions and error information

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

**Running CLI commands during development** (without global installation):
```bash
# Run analysis tools directly from monorepo
npm --workspace=@carbonara/cli start -- analyze if-webpage-scan https://climateandtech.com --save
npm --workspace=@carbonara/cli start -- analyze carbonara-swd https://climateandtech.com --save

# Or use node directly
node packages/cli/dist/index.js analyze if-webpage-scan https://climateandtech.com --save
```

### VS Code Extension Development
```bash
cd plugins/vscode
npm install && npm run build
npm run test:ui              # Playwright E2E tests
npm run package             # Create .vsix
```

**Note**: The extension build process (`copy-deps` script) copies dependencies from the CLI and Core packages into the extension's `dist` folder. If you encounter errors like `Cannot find module '@carbonara/cli/dist/utils/prerequisites.js'`, ensure:
1. The CLI package is built: `cd packages/cli && npm run build`
2. The extension is rebuilt: `cd plugins/vscode && npm run build`
3. Reload the VSCode window after rebuilding

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

This project is licensed under the **GNU Affero General Public License version 3.0 or later (AGPL-3.0-or-later)**.

- **Public License**: The project is available under AGPL-3.0-or-later for public use
- **Full License Text**: See [LICENSE](LICENSE) file for complete terms
- **Contributor Agreement**: Contributors must agree to our [Contributor License Agreement](CONTRIBUTING.md#contributor-license-agreement) which grants the Carbonara team additional licensing rights

### Dual Licensing

While the public project remains under AGPL-3.0-or-later, the Carbonara team reserves the right to offer alternative licensing terms (including BSD) for commercial use. This dual licensing model is enabled through our Contributor License Agreement.

### Contributing

By contributing to this project, you agree to the terms outlined in [CONTRIBUTING.md](CONTRIBUTING.md), including granting the Carbonara team perpetual rights to relicense your contributions under additional terms.