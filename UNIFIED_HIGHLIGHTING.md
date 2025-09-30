# Unified Code Highlighting System

This document describes the unified code highlighting system that works with any linter and provides consistent VSCode integration.

## Architecture Overview

The system consists of three main components:

1. **Tool Registry** - Defines available linters and their capabilities
2. **Parsers** - Convert tool-specific outputs to standardized format
3. **Database Highlighter** - Displays findings in VSCode using Pessi's approach

## How It Works

### 1. Tool Execution
```bash
# Run any supported linter
carbonara analyze semgrep ./src --save
carbonara analyze megalinter ./src --save
```

### 2. Standardized Parsing
All tool outputs are parsed into a consistent format:
```typescript
interface StandardizedFinding {
  id: string;
  filePath: string;
  location: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  category: string;
  ruleId?: string;
  fix?: FixSuggestion;
}
```

### 3. Database Storage
Findings are stored in the existing `carbonara.db` using the same `assessment_data` table:
- **Tool**: `semgrep`, `megalinter`, `eslint`, etc.
- **Data Type**: `code-analysis`
- **Data**: Standardized findings + original results

### 4. VSCode Display
The database highlighter reads from the database and displays:
- **Color-coded underlines** (red=error, yellow=warning, blue=info, green=hint)
- **Problems panel** entries
- **Hover information** with details
- **Code actions** for fixes

## Supported Tools

### Currently Supported
- **Semgrep** - Security analysis with database persistence
- **MegaLinter** - Multi-language linting (existing)
- **ESLint** - JavaScript/TypeScript linting (parser ready)

### Adding New Tools
1. Add tool to `packages/cli/src/registry/tools.json`
2. Create parser in `packages/cli/src/parsers/index.ts`
3. Tool automatically works with highlighting system

## VSCode Commands

### Unified Highlighting System
- `carbonara.runAnalysis` - Run analysis on current file
- `carbonara.toggleStoreToDatabase` - Toggle database storage for analysis results
- `carbonara.refreshHighlights` - Reload highlights from database
- `carbonara.clearHighlights` - Clear all highlights

## Benefits

1. **Unified Experience** - Same highlighting for all tools
2. **Database-First Architecture** - All findings go through database before display
3. **Configurable Real-Time** - Real-time analysis can save to database or display temporarily
4. **Database Persistence** - Findings survive VSCode restarts
5. **Tool Agnostic** - Easy to add new linters
6. **DRY Architecture** - Reuses existing database and VSCode infrastructure
7. **Backward Compatible** - Existing functionality unchanged
8. **Custom Rules Support** - Extensible rule system for Carbonara-specific findings

## Example Usage

```bash
# Initialize project
carbonara init

# Run Semgrep analysis
carbonara analyze semgrep ./src --save

# Run MegaLinter analysis  
carbonara analyze megalinter ./src --save

# Open VSCode - highlights appear automatically
code .
```

The system automatically:
1. Parses tool outputs to standardized format
2. Stores findings in database (if auto-save enabled)
3. Displays highlights in VSCode
4. Shows findings in Problems panel
5. Provides hover information and code actions

### Analysis Options

**Store to Database (Default):**
- Analysis results are saved to database
- Findings persist across VSCode sessions
- Unified display through database

**Temporary Mode:**
- Analysis results are displayed temporarily
- Findings are cleared when VSCode restarts
- Useful for quick analysis without persistence

## Migration from Existing Branches

This system combines the best of both approaches:
- **Semgrep branch**: Real-time analysis + database persistence
- **MegaLinter branch**: Database-driven highlighting + rich decorations

Both tools now work with the same unified system while maintaining their unique capabilities.
