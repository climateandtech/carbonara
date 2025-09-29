# Semgrep Custom Rules

This directory contains custom Semgrep rules for the VSCode plugin project.

## Structure

- `no-console-log.yaml` - Custom rules for detecting console logging and hardcoded API keys
- `example-code.js` - Example file that demonstrates rule violations

## Running the Custom Rules

### Test on the example file
```bash
semgrep --config=./semgrep-rules/no-console-log.yaml ./semgrep-rules/example-code.js
```

### Run on the entire project
```bash
semgrep --config=./semgrep-rules/ ./src
```

### Run specific rule by ID
```bash
semgrep --config=./semgrep-rules/no-console-log.yaml --include="*.js" --include="*.ts" ./
```

## Expected Output

When running on `example-code.js`, you should see:
- Multiple warnings for `console.log`, `console.debug`, and `console.info` statements
- Errors for hardcoded API keys (lines with "sk-" prefixed strings and apiKey assignments)

## Custom Rules Included

### 1. no-console-log-in-production
- **Severity**: WARNING
- **Purpose**: Detects console.log, console.debug, and console.info statements
- **Languages**: JavaScript, TypeScript

### 2. hardcoded-api-key  
- **Severity**: ERROR
- **Purpose**: Detects potential hardcoded API keys
- **Languages**: JavaScript, TypeScript

## Adding More Rules

To add more custom rules:
1. Create a new `.yaml` file in this directory
2. Follow the Semgrep rule syntax: https://semgrep.dev/docs/writing-rules/
3. Test your rules using the commands above

## Integrating with CI/CD

Add this to your CI pipeline:
```yaml
- name: Run Semgrep Custom Rules
  run: |
    pip install semgrep
    semgrep --config=./semgrep-rules/ --error ./src
```
