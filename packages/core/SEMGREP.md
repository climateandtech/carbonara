# Semgrep Integration for Carbonara

This module provides Semgrep static analysis capabilities for the Carbonara project, used by both the CLI and VSCode extension.

**Note**: The SemgrepService now calls the `semgrep` CLI directly instead of using the Python runner. The Python runner (`semgrep_runner.py`) is kept for backward compatibility but is deprecated.

## Directory Structure

```
packages/core/
├── python/                 # Python Semgrep runner (DEPRECATED - kept for backward compatibility)
│   ├── semgrep_runner.py  # Main Python script (deprecated)
│   ├── requirements.txt   # Python dependencies
│   └── setup.py           # Setup/bundling script (bundled Python never used in practice)
├── python-dist/           # Bundled Python environment (generated, never used)
├── semgrep/         # Custom Semgrep rules
│   ├── no-console-log.yaml
│   └── example-code.js
└── src/services/
    └── semgrepService.ts  # TypeScript interface (now uses semgrep CLI directly)
```

## Setup Instructions

### 1. Install Semgrep CLI

The SemgrepService now requires the `semgrep` CLI to be installed on your system:

```bash
# Install Semgrep via pip (requires Python 3.7+)
pip install semgrep

# Or using python3 -m pip
python3 -m pip install semgrep

# Verify installation
semgrep --version
```

**Note**: The VSCode extension supports auto-installation. If Semgrep is not found when running analysis, you'll be prompted to install it automatically.

### 2. Python Runner (Deprecated)

The Python runner (`semgrep_runner.py`) is deprecated but kept for backward compatibility. It is no longer used by the SemgrepService, which now calls the `semgrep` CLI directly.

If you need to use the Python runner directly (for testing or migration purposes):

```bash
# Install Python dependencies
pip install -r python/requirements.txt

# Run directly
python python/semgrep_runner.py path/to/file.js --json
```

**Note**: The bundled Python environment (`python-dist/`) was never actually used in practice. The `useBundledPython` flag was always set to `false` in the codebase.

### 3. Using in TypeScript/JavaScript

```typescript
import { createSemgrepService } from "@carbonara/core";

// Create service instance (useBundledPython is ignored, kept for backward compatibility)
const semgrep = createSemgrepService({
  timeout: 60000, // Optional: timeout in milliseconds
});

// Check setup (verifies semgrep CLI is available)
const setup = await semgrep.checkSetup();
if (!setup.isValid) {
  console.error("Setup issues:", setup.errors);
  // Install semgrep: pip install semgrep
}

// Analyze a file
const result = await semgrep.analyzeFile("/path/to/file.js");
console.log(semgrep.formatResults(result));

// Analyze a directory
const dirResult = await semgrep.analyzeDirectory("/path/to/src");
```

## Command Line Usage

### Using Carbonara CLI

```bash
# Run on a single file
carbonara semgrep path/to/file.js

# Run on a directory
carbonara semgrep path/to/src/

# Output as JSON
carbonara semgrep path/to/file.js --output json

# Filter by severity
carbonara semgrep path/to/file.js --severity ERROR
```

### Direct Semgrep CLI Usage

You can also use Semgrep directly:

```bash
# Run on a single file
semgrep --config packages/core/semgrep path/to/file.js --json

# Run on a directory
semgrep --config packages/core/semgrep path/to/src/ --json
```

### Python Runner (Deprecated)

The Python runner is deprecated but still available for backward compatibility:

```bash
# Run on a single file
python python/semgrep_runner.py path/to/file.js

# Output as JSON
python python/semgrep_runner.py path/to/file.js --json
```

## Custom Rules

The `semgrep/` directory contains custom rules:

### 1. `no-console-log-in-production`

- **Purpose**: Detects console.log, console.debug, and console.info statements
- **Severity**: WARNING
- **Languages**: JavaScript, TypeScript

### 2. `hardcoded-api-key`

- **Purpose**: Detects potential hardcoded API keys
- **Severity**: ERROR
- **Languages**: JavaScript, TypeScript

### Adding New Rules

1. Create a new `.yaml` file in `semgrep/`
2. Follow Semgrep rule syntax: https://semgrep.dev/docs/writing-rules/
3. Test your rule:
   ```bash
   semgrep --config packages/core/semgrep/your-new-rule.yaml test-file.js --json
   ```

## Integration with VSCode Extension

The VSCode extension can use this service by:

1. Importing from the core package:

   ```typescript
   import { createSemgrepService } from "@carbonara/core";
   ```

2. Creating commands that trigger analysis:
   ```typescript
   const runSemgrep = vscode.commands.registerCommand(
     "carbonara.runSemgrep",
     async () => {
       const semgrep = createSemgrepService();
       const editor = vscode.window.activeTextEditor;
       if (editor) {
         const result = await semgrep.analyzeFile(editor.document.fileName);
         // Display results in VSCode UI
       }
     }
   );
   ```

**Auto-Installation**: The VSCode extension supports auto-installation of Semgrep. If Semgrep is not found when running analysis, you'll be prompted to install it automatically.

## Integration with CLI

The CLI can use this service similarly:

```typescript
import { createSemgrepService } from "@carbonara/core";

export async function analyzeCommand(filepath: string) {
  const semgrep = createSemgrepService();
  const result = await semgrep.analyzeFile(filepath);
  console.log(semgrep.formatResults(result));
}
```

## Distribution

The SemgrepService now requires users to have Semgrep installed on their system. The VSCode extension supports auto-installation, prompting users to install Semgrep when needed.

**Note**: Bundled Python was never actually used in practice. The `useBundledPython` flag was always set to `false` in the codebase, and the `python-dist/` directory was never created or distributed.

## Testing

```bash
# Run the test script
cd packages/core
npx ts-node test/test-semgrep.ts

# Or if using compiled JavaScript
npm run build
node dist/test/test-semgrep.js
```

## Troubleshooting

### Python Not Found

- Ensure Python 3.7+ is installed
- Check `pythonPath` in service configuration

### Semgrep Not Installed

```bash
# Install Semgrep
pip install semgrep

# Or using python3
python3 -m pip install semgrep

# Verify installation
semgrep --version
```

**VSCode Extension**: If using the VSCode extension, you'll be prompted to install Semgrep automatically when running analysis.

### Rules Not Found

- Verify `semgrep/` directory exists
- Check `rulesDir` in service configuration

### Timeout Issues

- Increase timeout in service configuration:
  ```typescript
  const semgrep = createSemgrepService({
    timeout: 120000, // 2 minutes
  });
  ```

## License

See main Carbonara project license.
