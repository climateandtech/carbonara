# Semgrep Integration for Carbonara

This module provides Semgrep static analysis capabilities for the Carbonara project, used by both the CLI and VSCode extension.

## Directory Structure

```
packages/core/
├── python/                 # Python Semgrep runner
│   ├── semgrep_runner.py  # Main Python script
│   ├── requirements.txt   # Python dependencies
│   └── setup.py           # Setup/bundling script
├── python-dist/           # Bundled Python environment (generated)
├── semgrep-rules/         # Custom Semgrep rules
│   ├── no-console-log.yaml
│   └── example-code.js
└── src/services/
    └── semgrepService.ts  # TypeScript interface
```

## Setup Instructions

### 1. Initial Setup (Development)

```bash
# Navigate to the core package
cd packages/core

# Install Python dependencies (requires Python 3.7+)
pip install -r python/requirements.txt

# Or use the setup script
python python/setup.py --all
```

### 2. Create Bundled Environment (For Distribution)

```bash
# This creates a portable Python environment with Semgrep
python python/setup.py --bundle

# Verify the installation
python python/setup.py --verify
```

### 3. Using in TypeScript/JavaScript

```typescript
import { createSemgrepService } from '@carbonara/core';

// Create service instance
const semgrep = createSemgrepService({
  useBundledPython: true  // Use bundled Python for distribution
});

// Check setup
const setup = await semgrep.checkSetup();
if (!setup.isValid) {
  console.error('Setup issues:', setup.errors);
}

// Analyze a file
const result = await semgrep.analyzeFile('/path/to/file.js');
console.log(semgrep.formatResults(result));

// Analyze a directory
const dirResult = await semgrep.analyzeDirectory('/path/to/src');
```

## Command Line Usage

### Direct Python Script Usage

```bash
# Run on a single file
python python/semgrep_runner.py path/to/file.js

# Run on a directory
python python/semgrep_runner.py path/to/src/

# Output as JSON
python python/semgrep_runner.py path/to/file.js --json

# Use specific rule file
python python/semgrep_runner.py path/to/file.js --rule-file no-console-log.yaml
```

## Custom Rules

The `semgrep-rules/` directory contains custom rules:

### 1. `no-console-log-in-production`
- **Purpose**: Detects console.log, console.debug, and console.info statements
- **Severity**: WARNING
- **Languages**: JavaScript, TypeScript

### 2. `hardcoded-api-key`
- **Purpose**: Detects potential hardcoded API keys
- **Severity**: ERROR
- **Languages**: JavaScript, TypeScript

### Adding New Rules

1. Create a new `.yaml` file in `semgrep-rules/`
2. Follow Semgrep rule syntax: https://semgrep.dev/docs/writing-rules/
3. Test your rule:
   ```bash
   python python/semgrep_runner.py test-file.js --rule-file your-new-rule.yaml
   ```

## Integration with VSCode Extension

The VSCode extension can use this service by:

1. Importing from the core package:
   ```typescript
   import { createSemgrepService } from '@carbonara/core';
   ```

2. Creating commands that trigger analysis:
   ```typescript
   const runSemgrep = vscode.commands.registerCommand('carbonara.runSemgrep', async () => {
     const semgrep = createSemgrepService({ useBundledPython: true });
     const editor = vscode.window.activeTextEditor;
     if (editor) {
       const result = await semgrep.analyzeFile(editor.document.fileName);
       // Display results in VSCode UI
     }
   });
   ```

## Integration with CLI

The CLI can use this service similarly:

```typescript
import { createSemgrepService } from '@carbonara/core';

export async function analyzeCommand(filepath: string) {
  const semgrep = createSemgrepService();
  const result = await semgrep.analyzeFile(filepath);
  console.log(semgrep.formatResults(result));
}
```

## Bundling for Distribution

For distributing the VSCode extension or CLI with bundled Semgrep:

1. **Create the bundle:**
   ```bash
   cd packages/core
   python python/setup.py --bundle
   ```

2. **Include in package:**
   The `python-dist/` directory should be included in your distribution.

3. **Use bundled Python:**
   ```typescript
   const semgrep = createSemgrepService({
     useBundledPython: true
   });
   ```

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
pip install semgrep
# or
python python/setup.py --install
```

### Rules Not Found
- Verify `semgrep-rules/` directory exists
- Check `rulesDir` in service configuration

### Timeout Issues
- Increase timeout in service configuration:
  ```typescript
  const semgrep = createSemgrepService({
    timeout: 120000  // 2 minutes
  });
  ```

## License

See main Carbonara project license.
