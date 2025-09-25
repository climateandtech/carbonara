# CLI Test Documentation

## Test Structure

The CLI tests are organized into separate files for better maintainability and CI/CD optimization:

- **`cli.test.ts`** - Core CLI functionality tests (fast, always run)
  - CLI help and version commands
  - Basic command validation
  - Data management operations
  - Project initialization

- **`megalinter.test.ts`** - MegaLinter-specific tests (can be slow)
  - MegaLinter execution
  - Report processing
  - Database storage of results
  - Cleanup operations

## Running Tests

### Local Development

```bash
# Run all tests (including MegaLinter)
npm test

# Run only non-MegaLinter tests (faster)
npm run test:no-megalinter

# Run only MegaLinter tests
npm run test:megalinter

# Watch mode for development
npm run test:watch
```

### CI Environment

```bash
# Run tests in CI mode (excludes MegaLinter by default)
npm run test:ci

# The CI environment will:
# - Skip actual MegaLinter execution
# - Use mock data for MegaLinter tests
# - Have shorter timeouts
# - Focus on database writing logic
```

## Environment Variables

- **`CI`** - Set to `'true'` to enable CI mode
- **`GITHUB_ACTIONS`** - Automatically set by GitHub Actions

## CI/CD Strategy

The tests are configured to run differently based on the environment:

### In CI (GitHub Actions, etc.)

1. **Unit Tests** - Always run, fast (<10s)
2. **MegaLinter Mock Tests** - Use mock data to test database operations (<5s)
3. **Integration Tests** - Only on main branch or manual trigger (full MegaLinter run)

### Locally

- All tests run with full functionality
- Longer timeouts allowed (up to 5 minutes for MegaLinter)
- Actual MegaLinter execution when installed

## Test Timeouts

- **CI Mode**: 10 seconds per test
- **Local Mode**: 15 seconds for regular tests, 5 minutes for MegaLinter tests
- **Mock Mode**: 5 seconds per test

## Adding New Tests

When adding new long-running tests:

1. Consider if they should be in a separate file
2. Add CI detection: `const isCI = process.env.CI === 'true'`
3. Provide mock/fast alternatives for CI
4. Document any special requirements

## Troubleshooting

### Tests timeout in CI

- Check if MegaLinter tests are being excluded properly
- Verify `CI` environment variable is set
- Look for tests that might be running actual tools instead of mocks

### MegaLinter tests fail locally

- Ensure MegaLinter is installed: `npm install -g mega-linter-runner`
- Check if Docker is running (required for MegaLinter)
- Verify sufficient disk space for MegaLinter operations

### Mock data issues

- Mock reports are created in the temp directory
- Check the mock report structure matches your CLI expectations
- Ensure cleanup happens properly after tests
