# Custom Rules Support for Carbonara

This document shows how to add custom rules for different analysis tools in the Carbonara unified highlighting system.

## Overview

Carbonara supports custom rules for various analysis tools. Each tool can define its own rules that map to Carbonara's standardized categories for environmental impact and performance.

## Supported Tools

- **Semgrep**: Custom YAML rules
- **ESLint**: Custom JavaScript rules
- **MegaLinter**: Custom configurations

## Example: Semgrep Custom Rules

### 1. Create Custom Rule File

Create `custom-rules.yaml` in your project:

```yaml
rules:
  - id: carbonara-performance-critical
    pattern-either:
      - pattern: |
          while (true) { ... }
      - pattern: |
          for (;;) { ... }
    message: Infinite loop detected - high energy consumption
    languages:
      - javascript
      - typescript
    severity: ERROR
    metadata:
      category: performance
      environmental-impact: high
      carbonara-category: performance-critical

  - id: carbonara-resource-waste
    pattern-either:
      - pattern: |
          var $VAR = ...;
          // $VAR is never used
      - pattern: |
          import $MODULE from '...';
          // $MODULE is never used
    message: Unused variable/import - resource waste
    languages:
      - javascript
      - typescript
    severity: WARNING
    metadata:
      category: efficiency
      environmental-impact: medium
      carbonara-category: resource-optimization

  - id: carbonara-network-inefficiency
    pattern-either:
      - pattern: |
          fetch($URL).then(() => {
            fetch($URL).then(() => {
              // Multiple requests to same URL
            });
          });
      - pattern: |
          axios.get($URL);
          axios.get($URL);
    message: Duplicate network requests - bandwidth waste
    languages:
      - javascript
      - typescript
    severity: WARNING
    metadata:
      category: network
      environmental-impact: medium
      carbonara-category: network-efficiency
```

### 2. Use Custom Rules

```bash
# Run Semgrep with custom rules
semgrep --config custom-rules.yaml ./src

# Or integrate with Carbonara CLI
carbonara analyze semgrep ./src --config custom-rules.yaml --save
```

## Example: ESLint Custom Rules

### 1. Create Custom ESLint Rule

Create `custom-eslint-rules.js`:

```javascript
module.exports = {
  rules: {
    'carbonara-no-console': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Disallow console statements in production',
          category: 'Best Practices',
          recommended: true
        },
        messages: {
          noConsole: 'Console statement detected - remove for production'
        },
        schema: []
      },
      create(context) {
        return {
          CallExpression(node) {
            if (node.callee.type === 'MemberExpression' &&
                node.callee.object.name === 'console') {
              context.report({
                node,
                messageId: 'noConsole'
              });
            }
          }
        };
      }
    }
  }
};
```

### 2. Configure ESLint

Create `.eslintrc.js`:

```javascript
module.exports = {
  extends: ['eslint:recommended'],
  plugins: ['./custom-eslint-rules'],
  rules: {
    'carbonara-no-console': 'warn'
  }
};
```

## Example: MegaLinter Custom Configuration

### 1. Create Custom MegaLinter Config

Create `.mega-linter-carbonara.yml`:

```yaml
# Custom MegaLinter configuration for Carbonara
APPLY_FIXES: none
DISABLE_ERRORS: true

# Enable only relevant linters
ENABLE_LINTERS:
  - JAVASCRIPT_ESLINT
  - TYPESCRIPT_ESLINT
  - PYTHON_PYLINT

# Custom ESLint configuration
JAVASCRIPT_ESLINT_ARGUMENTS:
  - "--config"
  - ".eslintrc-carbonara.js"

# Custom rules for performance and efficiency
JAVASCRIPT_ESLINT_RULES_PATH: "./custom-rules"
```

## Integration with Carbonara Category Mapping

### 1. Update Category Mappers

Extend the tool-specific mappers to recognize custom rule categories:

```typescript
// In category-mapping.ts
export class SemgrepCategoryMapper implements ToolCategoryMapper {
  mapToCategory(ruleId: string, originalCategory: string, message: string, metadata?: any): string {
    // Check for custom Carbonara categories in metadata
    if (metadata?.['carbonara-category']) {
      return metadata['carbonara-category'];
    }
    
    // Check for environmental impact indicators
    if (metadata?.['environmental-impact'] === 'high') {
      return 'performance-critical';
    }
    
    // Fall back to default mapping
    return this.defaultMapper.mapToCategory(ruleId, originalCategory, message, metadata);
  }
}
```

### 2. Custom Rule Validation

Add validation to ensure custom rules follow Carbonara standards:

```typescript
interface CarbonaraRuleMetadata {
  'carbonara-category'?: string;
  'environmental-impact'?: 'high' | 'medium' | 'low' | 'none';
  'performance-impact'?: 'high' | 'medium' | 'low' | 'none';
  'priority'?: 'critical' | 'high' | 'medium' | 'low';
}

function validateCarbonaraRule(rule: any): boolean {
  const metadata = rule.metadata as CarbonaraRuleMetadata;
  
  // Ensure rule has Carbonara-specific metadata
  if (!metadata['carbonara-category']) {
    console.warn(`Rule ${rule.id} missing carbonara-category`);
    return false;
  }
  
  // Validate category exists
  const validCategories = [
    'performance-critical',
    'resource-optimization',
    'network-efficiency',
    'data-efficiency',
    'security-vulnerability',
    'code-quality',
    'accessibility',
    'sustainability-patterns'
  ];
  
  if (!validCategories.includes(metadata['carbonara-category'])) {
    console.warn(`Rule ${rule.id} has invalid carbonara-category: ${metadata['carbonara-category']}`);
    return false;
  }
  
  return true;
}
```

## Best Practices

### 1. Rule Naming
- Use descriptive IDs: `carbonara-performance-critical`
- Include tool prefix: `carbonara-` for custom rules
- Be specific about the issue: `infinite-loop`, `unused-imports`

### 2. Metadata Standards
- Always include `carbonara-category`
- Specify `environmental-impact` level
- Add `performance-impact` when relevant
- Use consistent severity levels

### 3. Message Quality
- Explain the environmental impact
- Provide clear guidance for fixes
- Include examples when helpful
- Reference Carbonara principles

### 4. Testing
- Test rules on sample code
- Verify category mapping works
- Ensure rules don't produce false positives
- Document expected behavior

## Example Project Structure

```
my-project/
├── .carbonara/
│   ├── custom-rules/
│   │   ├── semgrep-rules.yaml
│   │   ├── eslint-rules.js
│   │   └── megalinter-config.yml
│   └── rule-validation.js
├── src/
└── carbonara.config.json
```

## Integration Commands

```bash
# Validate custom rules
carbonara validate-rules .carbonara/custom-rules/

# Run analysis with custom rules
carbonara analyze semgrep ./src --custom-rules .carbonara/custom-rules/semgrep-rules.yaml

# Test rule effectiveness
carbonara test-rules .carbonara/custom-rules/ --sample-files ./test-samples/
```

This system allows teams to create custom rules that align with Carbonara's environmental impact focus while maintaining compatibility with existing tool ecosystems.
