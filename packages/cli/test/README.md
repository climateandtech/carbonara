# CLI Test Suite

## Overview

The test suite uses a simple, reliable approach focused on testing actual CLI functionality without complex interactive simulation.

## Test Files

### `cli.test.ts`

Basic functionality tests using `execSync` for reliability:

- **Help & Version**: Tests `--help` and `--version` flags
- **Error Handling**: Tests invalid inputs and missing projects
- **Basic Commands**: Tests core command structure
- **Database Operations**: Tests data management with graceful error handling

### `external-tools.test.ts`

Generic unit tests for all external tools (Impact Framework, GreenFrame, Semgrep, etc.):

- **Registry Configuration**: Validates tool configuration structure
- **Installation Detection**: Tests tool installation checking
- **Option Validation**: Tests tool option configurations
- **Manifest Templates**: Tests tools with manifest templates (IF tools)
- **Package Consistency**: Validates tools with same installation packages

### `external-tools-integration.test.ts`

Generic integration tests for external tools:

- **CLI Integration**: Tests analyze command execution
- **VSCode Integration**: Tests option passing from VSCode to CLI
- **Database Operations**: Tests result storage
- **Error Handling**: Tests graceful failures when tools not installed
- **Manifest Generation**: Tests tools with manifest templates

## Test Philosophy

1. **Synchronous Testing**: Uses `execSync` instead of complex async process management
2. **Error Tolerance**: Tests expect and handle common errors gracefully
3. **Isolated Tests**: Each test uses its own temporary directory
4. **Fast Execution**: All tests complete quickly (external tool tests may take longer due to CLI execution)
5. **No User Input**: Avoids interactive prompts that can cause hangs

## Running Tests

```bash
# Run all tests
npm test

# Run in watch mode during development
npm run test:watch
```

## Test Results

All tests currently pass:
- ✅ CLI should show help
- ✅ CLI should show version  
- ✅ assess command should show warning without project
- ✅ greenframe command should handle invalid URL
- ✅ greenframe command should work with valid URL
- ✅ data command should show help when no options provided
- ✅ data --list should handle missing database gracefully
- ✅ External tools configuration validation (9 tests)
- ✅ External tools integration testing (10 tests)

## Testing Strategy

### What We Test
- Command line argument parsing
- Help text generation
- Error message display
- Basic command execution
- URL validation
- Database error handling

### What We Don't Test
- Complex interactive flows (prone to timeouts)
- Full CO2 assessment questionnaire (too slow for CI)
- Real external API calls (unreliable)
- File system edge cases (platform-specific)

## Adding New Tests

### For CLI Commands

When adding new CLI tests:

1. Use `execSync` for reliability
2. Create isolated test directories
3. Handle expected errors with try/catch
4. Keep tests reasonably fast (external tool tests may take longer)
5. Clean up temporary files

Example:
```typescript
test('new command should work', () => {
  try {
    const result = execSync(`cd "${testDir}" && node "${cliPath}" newcommand`, { 
      encoding: 'utf8',
      timeout: 5000 
    });
    expect(result).toContain('expected output');
  } catch (error: any) {
    // Handle expected errors gracefully
    expect(error.stderr.toString()).toContain('expected error');
  }
});
```

### For External Tools

**No additional test files needed!** External tools are automatically tested by the generic test suites.

To add a new external tool:

1. Add tool configuration to `src/registry/tools.json`
2. Run tests - your tool is automatically included
3. Tests validate: configuration, installation detection, options, CLI integration, VSCode integration

The generic tests work for any external tool by reading the registry configuration.

### Impact Framework Tools

For Impact Framework tools specifically:

1. Add tool to `tools.json` with `manifestTemplate` field
2. Include `display` configuration for VSCode integration
3. Use placeholder replacement: `{url}`, `{optionName}`
4. Tests automatically validate manifest generation and plugin detection

Example tool configuration:
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