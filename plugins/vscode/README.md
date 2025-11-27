# Carbonara (beta version)

Carbonara is an open-source plugin to help developers understand and reduce the carbon impact of their code. It gives quick insights about (\(CO_{2}\)) emissions and energy usage, to empower climate-conscious decision making.

## Features

- **Assessment Questionnaire**: Gathers the specifics of your project from a sustainability point of view 
- **Website Scan**: Analysis the carbon footprint of an URL
- **Code Scan**: Identifies and highlights energy-consuming code patterns
- **Deployment Insights**: Helps moving to less carbon-intensive hosting
- **Carbon Reporting**: allows you to view, export, and compare your results over time


### Command Line Installation

```bash
code --install-extension carbonara-vscode-0.1.0.vsix
```

## Usage

### Getting Started

1. **Open a workspace** in VSCode
2. **Click the Carbonara icon** in the activity bar
3. **Click the "Initialize Project" button** to set up Carbonara in your workspace. Once initialised, carbonara features will be enable and ready to use.  

After initialization, your project will contain:

```
your-project/
├── .carbonara/
│   ├── carbonara.config.json    # Project configuration
│   ├── carbonara.db            # SQLite database
│   └── ...                     # Other Carbonara files
└── schemas/                    # JSON schema files (optional)
```
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
  - Quick access to `.carbonara/carbonara.config.json`



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
3. Check that `.carbonara/carbonara.config.json` exists

### Database Errors

If you see database-related errors:

1. Check that `.carbonara/carbonara.db` exists in your project
2. Try re-initializing the project
3. Ensure proper file permissions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Report Bugs

1. open a ticket in github.com/climateandtech/carbonara

## License

AGPL License - see LICENSE file for details.

## Links

- [Carbonara CLI Documentation](../../packages/cli/README.md)
- [VS Code Extension API](https://code.visualstudio.com/api)