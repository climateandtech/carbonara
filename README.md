# Carbonara - CO2 Assessment & Sustainability Platform

A comprehensive monorepo containing CLI tools, VS Code extension, and multi-editor plugin architecture for CO2 assessment and web sustainability analysis.

## 🌱 Overview

Carbonara is a comprehensive platform for **CO2 assessment** and **web sustainability analysis**. It provides tools to measure, track, and optimize the environmental impact of digital projects through interactive assessments and automated analysis.

### Key Features

- **🔍 CO2 Assessment**: Comprehensive questionnaires to evaluate project sustainability
- **🌐 Web Analysis**: Greenframe integration for website carbon footprint analysis  
- **📊 Data Lake**: SQLite-based storage for all assessment data with JSON flexibility
- **🛠️ CLI Tool**: Command-line interface for all operations
- **📝 VS Code Extension**: Native IDE integration with visual interface
- **🔌 Multi-Editor Support**: Plugin architecture for various editors

## 🧱 Architecture Overview

```
+-------------------+       +------------------------+        +--------------------+
| VS Code Extension | <---> |                        | <----> | JetBrains Plugin   |
| (Native UI + API) |       |                        |        | (Kotlin Plugin)    |
+-------------------+       |                        |        +--------------------+
                            |                        |
+-------------------+       |     Carbonara CLI      |        +--------------------+
| Vim/Neovim Plugin | <---> |    (Core Engine)       | <----> | Emacs Plugin       |
| (Lua/Python/CLI)  |       |                        |        | (Elisp Client)     |
+-------------------+       |  - CO2 Assessment      |        +--------------------+
                            |  - Greenframe Analysis |
+-------------------+       |  - Data Lake (SQLite) | <----> +--------------------+
| Terminal/CLI      | <---->|  - Project Management  |        | Svelte Web UI      |
+-------------------+       +------------------------+        | (Browser App)      |
                                     |                        +--------------------+
                                     v
                          +---------------------------+
                          | External Tools Integration |
                          | - Greenframe CLI          |
                          | - Future Sustainability   |
                          |   Analysis Tools          |
                          +---------------------------+
```

## 📁 Project Structure

```
carbonara/
├── packages/                    # Core packages and services
│   ├── cli/                    # 🔧 Carbonara CLI tool (main interface)
│   │   ├── src/
│   │   │   ├── index.js        # CLI entry point
│   │   │   ├── commands/       # Assessment, Greenframe, Data management
│   │   │   ├── database/       # SQLite data lake implementation
│   │   │   └── utils/          # Configuration and utilities
│   │   ├── schemas/            # JSON schemas for assessments
│   │   └── test/               # Comprehensive test suite
│   ├── core-backend/           # Backend logic (Python/TypeScript)
│   ├── rpc-protocol/           # JSON-RPC protocol definitions
│   └── rpc-client/             # Client libraries for different languages
├── apps/                       # Applications
│   └── web-ui/                 # Svelte web application
├── plugins/                    # Editor integrations
│   ├── vscode/                 # 📝 VS Code extension (ready-to-install)
│   │   ├── src/extension.ts    # Extension logic
│   │   ├── dist/               # Compiled extension
│   │   └── *.vsix              # Installable package
│   ├── jetbrains/              # JetBrains plugin (future)
│   ├── vim/                    # Vim/Neovim plugin (future)
│   └── emacs/                  # Emacs plugin (future)
├── docs/                       # Documentation
└── tools/                      # Development tools and scripts
```

## 🚀 Quick Start

### Option 1: CLI Tool (Recommended)

1. **Install the CLI globally:**
   ```bash
   npm install -g @carbonara/cli
   ```

2. **Initialize a project:**
   ```bash
   carbonara init
   ```

3. **Run CO2 assessment:**
   ```bash
   carbonara assess
   ```

4. **Analyze a website:**
   ```bash
   carbonara greenframe https://example.com --save
   ```

### Option 2: VS Code Extension

1. **Install the extension:**
   ```bash
   cd plugins/vscode
   code --install-extension carbonara-vscode-1.0.0.vsix
   ```

2. **Use in VS Code:**
   - Look for the Carbonara icon in the status bar
   - Click to access the main menu
   - Start with "Initialize Project"

### Option 3: Development Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build all packages:**
   ```bash
   npm run build
   ```

3. **Install CLI locally for development:**
   ```bash
   cd packages/cli
   npm link
   # Now you can use 'carbonara' command globally
   ```

4. **Run tests:**
   ```bash
   npm test
   ```

## 🔧 CLI Commands Reference

### Core Commands

| Command | Description | Example |
|---------|-------------|---------|
| `init` | Initialize new Carbonara project | `carbonara init --path ./my-project` |
| `assess` | Run CO2 assessment questionnaire | `carbonara assess` |
| `greenframe <url>` | Analyze website carbon footprint | `carbonara greenframe https://example.com --save` |
| `data` | Manage stored assessment data | `carbonara data --list` |

### Command Details

#### `carbonara init [options]`
**Initialize a new Carbonara project**
- `--path <path>` - Project directory (default: current directory)
- Creates: `carbonara.config.json`, `carbonara.db`, `schemas/`
- Interactive prompts for project name, description, and type

#### `carbonara assess [options]`  
**Run comprehensive CO2 assessment**
- Interactive questionnaire covering:
  - Project scope (users, traffic, lifespan)
  - Infrastructure (hosting, location, storage)
  - Development practices (team size, CI/CD, testing)
  - Features (real-time, media, AI/ML, blockchain, IoT)
  - Sustainability goals
- Generates CO2 impact score and recommendations
- Stores results in SQLite database

#### `carbonara greenframe <url> [options]`
**Analyze website carbon footprint using Greenframe**
- `--save` - Save results to database
- `--output <format>` - Output format (json|table)
- Provides carbon footprint, energy consumption, and optimization suggestions

#### `carbonara data [options]`
**Manage assessment data lake**
- `--list` - List all stored data
- `--export <format>` - Export data (json|csv)
- `--clear` - Clear all stored data

### Global Options
- `--help` - Show command help
- `--version` - Show version information

## 📝 VS Code Extension

### Features
- **Status Bar Integration**: Real-time project status indicator
- **Command Palette Integration**: Access all Carbonara commands
- **Interactive Menus**: Visual interface for all operations
- **Project Management**: Initialize and configure projects
- **Data Visualization**: View assessment results and project status

### Installation
```bash
# Method 1: Command line
code --install-extension ./plugins/vscode/carbonara-vscode-1.0.0.vsix

# Method 2: VS Code Extensions panel
# Extensions → "..." menu → "Install from VSIX" → Select the .vsix file
```

### Usage
1. **Open workspace** in VS Code
2. **Click Carbonara icon** in status bar (bottom-right)
3. **Select action** from the quick-pick menu:
   - 🚀 Initialize Project
   - ✅ Run CO2 Assessment  
   - 🌐 Analyze Website
   - 🗄️ View Data
   - ⚙️ Open Configuration
   - ℹ️ Show Status

### Status Indicators
- **$(pulse) Carbonara**: Project not initialized
- **$(check) Carbonara**: Project ready

## 🗄️ Database Model

### Overview
- **Type**: SQLite database (`carbonara.db`)
- **Design**: Schemaless with JSON storage for flexibility
- **Location**: Created in each project directory

### Table Structure

#### `projects` - Project Management
```sql
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  project_type TEXT,                    -- 'web', 'mobile', 'desktop', 'api', 'other'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  metadata JSON,                        -- Project description, initialization data
  co2_variables JSON                   -- CO2 assessment questionnaire results
);
```

#### `assessment_data` - Data Lake Storage
```sql
CREATE TABLE assessment_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  tool_name TEXT NOT NULL,             -- 'co2-assessment', 'greenframe', etc.
  data_type TEXT NOT NULL,             -- 'questionnaire', 'web-analysis', etc.
  data JSON NOT NULL,                  -- All assessment results (schemaless)
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  source TEXT,                         -- 'cli', 'vscode-extension', 'web-ui'
  FOREIGN KEY (project_id) REFERENCES projects (id)
);
```

#### `tool_runs` - Execution History
```sql
CREATE TABLE tool_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  tool_name TEXT NOT NULL,             -- Tool that was executed
  command TEXT NOT NULL,               -- Full command that was run
  status TEXT NOT NULL,                -- 'success', 'failed', 'running'
  output JSON,                         -- Command output/results
  error_message TEXT,                  -- Error details if failed
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (project_id) REFERENCES projects (id)
);
```

### Data Examples

**CO2 Assessment Data:**
```json
{
  "projectInfo": {
    "expectedUsers": 1000,
    "expectedTraffic": "medium",
    "targetAudience": "global",
    "projectLifespan": 24
  },
  "infrastructure": {
    "hostingType": "cloud",
    "serverLocation": "global-cdn",
    "dataStorage": "moderate"
  },
  "features": {
    "realTimeFeatures": true,
    "aiMlFeatures": false
  },
  "impactScore": 65,
  "completedAt": "2024-01-01T12:00:00.000Z"
}
```

**Greenframe Analysis Data:**
```json
{
  "url": "https://example.com",
  "results": {
    "carbonFootprint": "0.45g CO2",
    "energyConsumption": "1.2 Wh",
    "performanceScore": 85,
    "suggestions": ["optimize images", "reduce JS bundle"]
  },
  "analyzedAt": "2024-01-01T12:00:00.000Z"
}
```

## 🔧 Development

### CLI Development
```bash
cd packages/cli
npm install
npm link           # Link for global 'carbonara' command
npm test           # Run test suite
npm run build      # Build TypeScript

# For direct development testing:
node src/index.js init    # Direct node execution
```

### VS Code Extension Development
```bash
cd plugins/vscode
npm install
npm run build      # Compile TypeScript
npm run package    # Create .vsix package
```

### Backend Development
- **TypeScript**: Use `packages/core-backend/typescript/` for TypeScript services
- **Python**: Use `packages/core-backend/python/` for Python services

### Testing
```bash
npm test           # Run all tests
npm run test:cli   # CLI tests only
```

## 📚 Documentation

- [JSON-RPC Protocol](./docs/protocol.md)
- [Backend API](./docs/backend-api.md)
- [Plugin Development](./docs/plugin-development.md)
- [Deployment Guide](./docs/deployment.md)

## 🤝 Contributing

Please read our [Contributing Guide](./CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## 📄 License

<<<<<<< HEAD
This project is licensed under the RPL License - see the [LICENSE](./LICENSE) file for details.
=======
This project is licensed under the RPL License with dual licensing - see the [LICENSE](./LICENSE) file for details. 
>>>>>>> 0fe5892 (Add proof of concept with CLI and VSCODE extension)
