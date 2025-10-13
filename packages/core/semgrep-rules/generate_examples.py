#!/usr/bin/env python3
"""
Generate example code files for semgrep rules from creedengo asciidoc files.
"""
import os
import re
from pathlib import Path

# Configuration
SEMGREP_RULES_DIR = Path("/Users/pes/code/carbonara/packages/core/semgrep-rules")
EXAMPLE_CODE_DIR = SEMGREP_RULES_DIR / "example-code"
CREEDENGO_RULES_DIR = Path("/Users/pes/code/creedengo-rules-specifications/src/main/rules")

# Files that already have examples
EXISTING_EXAMPLES = {
    "gci1-spring-repository-in-loop.java",
    "gci108.py",
    "gci3-java-fetch-size-before-collection.java",
    "gci3-php-fetch-size-before-collection.php",
    "gci4-python-local-vars-over-global-vars.py",
    "gci5-java-preparedstatement-over-statement.java",
}

# Language to file extension mapping
LANG_EXTENSIONS = {
    "java": ".java",
    "python": ".py",
    "php": ".php",
    "swift": ".swift",
    "xml": ".xml",
    "csharp": ".cs",
    "javascript": ".js",
    "html": ".html",
}

def parse_rule_filename(yaml_file):
    """
    Parse a rule filename to extract GCI number and language.
    Returns (gci_number, language, base_name) or None if parsing fails.

    Examples:
    - gci1-java-spring-repository-in-loop.yaml -> (1, 'java', 'gci1-java-spring-repository-in-loop')
    - gci108-python-prefer-appendleft.yaml -> (108, 'python', 'gci108-python-prefer-appendleft')
    """
    base_name = yaml_file.replace('.yaml', '')

    # Match pattern like gci###-language-...
    match = re.match(r'gci(\d+)-([a-z]+)', base_name)
    if match:
        gci_num = int(match.group(1))
        lang = match.group(2)
        return (gci_num, lang, base_name)
    return None

def extract_code_blocks(asciidoc_content):
    """
    Extract all code blocks from an asciidoc file.
    Returns a list of tuples: [(section_name, code_content), ...]
    """
    sections = []
    lines = asciidoc_content.split('\n')

    current_section = None
    in_code_block = False
    current_code = []

    i = 0
    while i < len(lines):
        line = lines[i]

        # Check for section headers (both == and === levels)
        if line.startswith('== Non compliant Code Example') or line.startswith('=== Non compliant Code Example'):
            current_section = 'Non-compliant'
        elif line.startswith('== Compliant Solution') or line.startswith('=== Compliant Solution'):
            current_section = 'Compliant'

        # Check for code block start
        elif line.startswith('[source,'):
            # Next line should be ----
            if i + 1 < len(lines) and lines[i + 1].strip() == '----':
                in_code_block = True
                current_code = []
                # If we don't have a section yet, assume non-compliant
                if current_section is None:
                    current_section = 'Non-compliant'
                i += 1  # Skip the ---- line

        # Check for code block end
        elif line.strip() == '----' and in_code_block:
            in_code_block = False
            if current_code:
                sections.append((current_section, '\n'.join(current_code)))
                current_code = []

        # Collect code lines
        elif in_code_block:
            current_code.append(line)

        i += 1

    return sections

def create_example_file(rule_file, gci_num, lang, base_name):
    """
    Create an example file for a given rule.
    Returns (success, message)
    """
    # Check if example already exists
    extension = LANG_EXTENSIONS.get(lang)
    if not extension:
        return (False, f"Unknown language: {lang}")

    example_filename = base_name + extension
    if example_filename in EXISTING_EXAMPLES:
        return (False, "Already exists")

    # Find the asciidoc file
    gci_dir = CREEDENGO_RULES_DIR / f"GCI{gci_num}" / lang
    asciidoc_file = gci_dir / f"GCI{gci_num}.asciidoc"

    if not asciidoc_file.exists():
        return (False, f"Asciidoc not found: {asciidoc_file}")

    # Read and parse asciidoc
    try:
        with open(asciidoc_file, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        return (False, f"Error reading asciidoc: {e}")

    # Extract code blocks
    code_sections = extract_code_blocks(content)

    if not code_sections:
        return (False, "No code examples found in asciidoc")

    # Create the example file content
    example_content = []

    # Group by section
    non_compliant = [code for section, code in code_sections if section == 'Non-compliant']
    compliant = [code for section, code in code_sections if section == 'Compliant']

    # Add non-compliant examples
    if non_compliant:
        if lang == 'java':
            example_content.append("// Non-compliant examples")
        elif lang in ['python', 'php']:
            example_content.append("# Non-compliant examples")
        elif lang == 'swift':
            example_content.append("// Non-compliant examples")
        elif lang == 'javascript':
            example_content.append("// Non-compliant examples")
        elif lang == 'csharp':
            example_content.append("// Non-compliant examples")
        elif lang in ['xml', 'html']:
            example_content.append("<!-- Non-compliant examples -->")

        for i, code in enumerate(non_compliant):
            if i > 0:
                example_content.append("")
            example_content.append(code.strip())

    # Add separator and compliant examples
    if compliant:
        example_content.append("")
        example_content.append("")

        if lang == 'java':
            example_content.append("// Compliant solutions")
        elif lang in ['python', 'php']:
            example_content.append("# Compliant solutions")
        elif lang == 'swift':
            example_content.append("// Compliant solutions")
        elif lang == 'javascript':
            example_content.append("// Compliant solutions")
        elif lang == 'csharp':
            example_content.append("// Compliant solutions")
        elif lang in ['xml', 'html']:
            example_content.append("<!-- Compliant solutions -->")

        for i, code in enumerate(compliant):
            if i > 0:
                example_content.append("")
            example_content.append(code.strip())

    # Write the example file
    example_path = EXAMPLE_CODE_DIR / example_filename
    try:
        with open(example_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(example_content))
            if example_content:  # Add trailing newline
                f.write('\n')
        return (True, f"Created: {example_filename}")
    except Exception as e:
        return (False, f"Error writing file: {e}")

def main():
    """Main function to process all rule files."""
    # Ensure example-code directory exists
    EXAMPLE_CODE_DIR.mkdir(exist_ok=True)

    # Get all yaml files
    yaml_files = sorted([f.name for f in SEMGREP_RULES_DIR.glob("*.yaml")])

    print(f"Found {len(yaml_files)} rule files")
    print(f"Skipping {len(EXISTING_EXAMPLES)} existing examples")
    print()

    # Track results
    created = []
    skipped = []

    for yaml_file in yaml_files:
        parsed = parse_rule_filename(yaml_file)
        if not parsed:
            skipped.append((yaml_file, "Could not parse filename"))
            continue

        gci_num, lang, base_name = parsed
        success, message = create_example_file(yaml_file, gci_num, lang, base_name)

        if success:
            created.append((yaml_file, message))
            print(f"✓ {yaml_file}: {message}")
        else:
            skipped.append((yaml_file, message))
            if message != "Already exists":
                print(f"✗ {yaml_file}: {message}")

    # Print summary
    print()
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Total rule files: {len(yaml_files)}")
    print(f"Example files created: {len(created)}")
    print(f"Files skipped: {len(skipped)}")
    print()

    if created:
        print("Created files:")
        for yaml_file, message in created:
            print(f"  - {message}")
        print()

    if skipped:
        print("Skipped files:")
        skip_reasons = {}
        for yaml_file, reason in skipped:
            if reason not in skip_reasons:
                skip_reasons[reason] = []
            skip_reasons[reason].append(yaml_file)

        for reason, files in skip_reasons.items():
            print(f"  {reason}: {len(files)} files")
            if reason != "Already exists" and len(files) <= 10:
                for f in files:
                    print(f"    - {f}")

if __name__ == "__main__":
    main()
