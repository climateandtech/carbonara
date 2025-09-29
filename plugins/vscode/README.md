# Carbonara VS Code Extension

A VS Code extension for CO2 assessment and web sustainability analysis, integrated with the Carbonara CLI tool.

## Features

- **Project Initialization**: Set up Carbonara projects directly from VS Code
- **CO2 Assessment**: Run comprehensive sustainability questionnaires
- **Website Analysis**: Analyze website carbon footprints using Greenframe
- **Data Management**: View, export, and manage assessment data
- **Status Monitoring**: Real-time project status in the status bar
- **Configuration Management**: Easy access to project settings

## Installation

### Method 1: Install from VSIX (Recommended)

1. Download the `carbonara-vscode-0.1.0.vsix` file
2. Open VS Code
3. Open the Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`)
4. Type "Extensions: Install from VSIX"
5. Select the downloaded VSIX file

### Method 2: Command Line Installation

```bash
code --install-extension carbonara-vscode-0.1.0.vsix
```

## Prerequisites

The extension requires the Carbonara CLI tool to be available. It will automatically detect:

1. **Monorepo Structure**: CLI at `packages/cli/src/index.js`
2. **Global Installation**: CLI installed globally via npm
3. **Local Installation**: CLI in the current workspace

## Usage

### Getting Started

1. **Open a workspace** in VS Code
2. **Click the Carbonara icon** in the status bar (bottom right)
3. **Select "Initialize Project"** to set up Carbonara in your workspace

### Available Commands

Access commands via:

- **Status Bar**: Click the Carbonara icon
- **Command Palette**: Search for "Carbonara"
- **Quick Pick Menu**: Use `Carbonara: Show Menu`

#### Core Commands

- **Initialize Project** (`carbonara.initProject`)
  - Set up Carbonara configuration and database
  - Choose project type (Web, Mobile, Desktop, API, Other)

- **Run CO2 Assessment** (`carbonara.runAssessment`)
  - Complete interactive sustainability questionnaire
  - Get CO2 impact scoring based on project characteristics

- **Analyze Website** (`carbonara.analyzeWebsite`)
  - Run Greenframe analysis on any URL
  - Option to save results to data lake

- **View Data** (`carbonara.viewData`)
  - List all stored assessment data
  - Export data as JSON or CSV

- **Show Status** (`carbonara.showStatus`)
  - Display project information and status
  - Check CLI availability and database status

- **Open Configuration** (`carbonara.openConfig`)
  - Quick access to `carbonara.config.json`

### Status Bar Integration

The status bar shows project status:

- **$(pulse) Carbonara**: Project not initialized
- **$(check) Carbonara**: Project initialized and ready

### Project Structure

After initialization, your project will contain:

```
your-project/
├── carbonara.config.json    # Project configuration
├── carbonara.db            # SQLite database
└── schemas/                # JSON schema files
```

## Configuration

The extension can be configured via VS Code settings:

```json
{
  "carbonara.server.host": "localhost",
  "carbonara.server.port": 3000,
  "carbonara.autoConnect": true,
  "carbonara.transport": "websocket"
}
```

## Development

### Building from Source

```bash
git clone <repository>
cd plugins/vscode
npm install
npm run build
npm run package
```

### Project Structure

```
src/
└── extension.ts          # Main extension logic
dist/
├── extension.js          # Compiled JavaScript
└── extension.js.map      # Source map
```

## Troubleshooting

### CLI Not Found

If you see "Carbonara CLI not found":

1. Ensure the CLI is installed: `npm install -g @carbonara/cli`
2. Or ensure you're in a monorepo with the CLI at `packages/cli/`
3. Check that Node.js is properly installed

### Project Not Initialized

If commands show "No project found":

1. Run **Initialize Project** first
2. Ensure you're in a workspace folder
3. Check that `carbonara.config.json` exists

### Database Errors

If you see database-related errors:

1. Check that `carbonara.db` exists in your project
2. Try re-initializing the project
3. Ensure proper file permissions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

ISC License - see LICENSE file for details.

## Links

- [Carbonara CLI Documentation](../../packages/cli/README.md)
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Greenframe Documentation](https://greenframe.io)
