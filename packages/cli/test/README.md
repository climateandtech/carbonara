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

## Test Philosophy

1. **Synchronous Testing**: Uses `execSync` instead of complex async process management
2. **Error Tolerance**: Tests expect and handle common errors gracefully
3. **Isolated Tests**: Each test uses its own temporary directory
4. **Fast Execution**: All tests complete in under 2 seconds
5. **No User Input**: Avoids interactive prompts that can cause hangs

## Running Tests

```bash
# Run all tests
npm test

# Run in watch mode during development
npm run test:watch
```

## Test Results

All 7 tests currently pass:
- ✅ CLI should show help
- ✅ CLI should show version  
- ✅ assess command should show warning without project
- ✅ greenframe command should handle invalid URL
- ✅ greenframe command should work with valid URL
- ✅ data command should show help when no options provided
- ✅ data --list should handle missing database gracefully

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

When adding new tests:

1. Use `execSync` for reliability
2. Create isolated test directories
3. Handle expected errors with try/catch
4. Keep tests fast (< 1 second each)
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