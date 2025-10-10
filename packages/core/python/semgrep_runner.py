#!/usr/bin/env python3
"""
Semgrep Runner for Carbonara
Provides a Python interface to run Semgrep with custom rules and return structured results.
"""

import json
import os
import sys
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from enum import Enum


class Severity(Enum):
    """Semgrep severity levels"""
    ERROR = "ERROR"
    WARNING = "WARNING"
    INFO = "INFO"


@dataclass
class SemgrepMatch:
    """Represents a single Semgrep match/finding"""
    rule_id: str
    path: str
    start_line: int
    end_line: int
    start_column: int
    end_column: int
    message: str
    severity: str
    code_snippet: str
    fix: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class SemgrepResult:
    """Container for all Semgrep results"""
    matches: List[SemgrepMatch]
    errors: List[str]
    stats: Dict[str, int]
    success: bool


class SemgrepRunner:
    """Main class for running Semgrep analysis"""
    
    def __init__(self, rules_dir: Optional[str] = None):
        """
        Initialize the Semgrep runner.
        
        Args:
            rules_dir: Path to directory containing Semgrep rules.
                      Defaults to ../semgrep-rules relative to this script.
        """
        if rules_dir is None:
            # Default to semgrep-rules directory in core package
            script_dir = Path(__file__).parent
            self.rules_dir = script_dir.parent / "semgrep-rules"
        else:
            self.rules_dir = Path(rules_dir)
            
        if not self.rules_dir.exists():
            raise ValueError(f"Rules directory does not exist: {self.rules_dir}")
    
    def check_semgrep_installed(self) -> bool:
        """Check if Semgrep is installed and available"""
        try:
            result = subprocess.run(
                ["semgrep", "--version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            return result.returncode == 0
        except (subprocess.SubprocessError, FileNotFoundError):
            return False
    
    def install_semgrep(self) -> bool:
        """Attempt to install Semgrep using pip"""
        try:
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", "semgrep"],
                capture_output=True,
                text=True,
                timeout=60
            )
            return result.returncode == 0
        except subprocess.SubprocessError:
            return False
    
    def run_on_file(self, file_path: str, rule_file: Optional[str] = None) -> SemgrepResult:
        """
        Run Semgrep on a single file.
        
        Args:
            file_path: Path to the file to analyze
            rule_file: Optional specific rule file to use (defaults to all rules in rules_dir)
        
        Returns:
            SemgrepResult containing all matches and metadata
        """
        return self.run(targets=[file_path], rule_file=rule_file)
    
    def run_on_directory(self, dir_path: str, rule_file: Optional[str] = None) -> SemgrepResult:
        """
        Run Semgrep on a directory.
        
        Args:
            dir_path: Path to the directory to analyze
            rule_file: Optional specific rule file to use (defaults to all rules in rules_dir)
        
        Returns:
            SemgrepResult containing all matches and metadata
        """
        return self.run(targets=[dir_path], rule_file=rule_file)
    
    def run(self, targets: List[str], rule_file: Optional[str] = None) -> SemgrepResult:
        """
        Run Semgrep analysis on specified targets.
        
        Args:
            targets: List of file or directory paths to analyze
            rule_file: Optional specific rule file to use
        
        Returns:
            SemgrepResult containing all matches and metadata
        """
        if not self.check_semgrep_installed():
            return SemgrepResult(
                matches=[],
                errors=["Semgrep is not installed. Please install it using 'pip install semgrep'"],
                stats={},
                success=False
            )
        
        # Determine which rules to use
        if rule_file:
            config_path = self.rules_dir / rule_file
            if not config_path.exists():
                return SemgrepResult(
                    matches=[],
                    errors=[f"Rule file not found: {config_path}"],
                    stats={},
                    success=False
                )
        else:
            # Use all rules in the rules directory
            config_path = self.rules_dir
        
        # Build Semgrep command
        cmd = [
            "semgrep",
            "--config", str(config_path),
            "--json",
            "--no-git-ignore",  # Don't skip files in .gitignore
            "--metrics=off",    # Disable metrics collection
        ]
        
        # Add target paths
        for target in targets:
            target_path = Path(target)
            if not target_path.exists():
                return SemgrepResult(
                    matches=[],
                    errors=[f"Target path not found: {target}"],
                    stats={},
                    success=False
                )
            cmd.append(str(target_path))
        
        # Run Semgrep
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=60
            )
            
            # Parse JSON output
            if result.stdout:
                data = json.loads(result.stdout)
                return self._parse_semgrep_output(data)
            else:
                # Check if there was an error
                error_msg = result.stderr if result.stderr else "Unknown error running Semgrep"
                return SemgrepResult(
                    matches=[],
                    errors=[error_msg],
                    stats={},
                    success=False
                )
                
        except subprocess.TimeoutExpired:
            return SemgrepResult(
                matches=[],
                errors=["Semgrep execution timed out after 60 seconds"],
                stats={},
                success=False
            )
        except json.JSONDecodeError as e:
            return SemgrepResult(
                matches=[],
                errors=[f"Failed to parse Semgrep output: {e}"],
                stats={},
                success=False
            )
        except Exception as e:
            return SemgrepResult(
                matches=[],
                errors=[f"Unexpected error running Semgrep: {e}"],
                stats={},
                success=False
            )
    
    def _parse_semgrep_output(self, data: Dict[str, Any]) -> SemgrepResult:
        """Parse Semgrep JSON output into structured result"""
        matches = []
        errors = []
        
        # Extract results
        for result in data.get("results", []):
            match = SemgrepMatch(
                rule_id=result.get("check_id", ""),
                path=result.get("path", ""),
                start_line=result.get("start", {}).get("line", 0),
                end_line=result.get("end", {}).get("line", 0),
                start_column=result.get("start", {}).get("col", 0),
                end_column=result.get("end", {}).get("col", 0),
                message=result.get("extra", {}).get("message", ""),
                severity=result.get("extra", {}).get("severity", "WARNING"),
                code_snippet=result.get("extra", {}).get("lines", ""),
                fix=result.get("extra", {}).get("fix", None),
                metadata=result.get("extra", {}).get("metadata", {})
            )
            matches.append(match)
        
        # Extract errors if any
        for error in data.get("errors", []):
            errors.append(f"{error.get('type', 'Error')}: {error.get('message', 'Unknown error')}")
        
        # Calculate statistics
        stats = {
            "total_matches": len(matches),
            "error_count": sum(1 for m in matches if m.severity == "ERROR"),
            "warning_count": sum(1 for m in matches if m.severity == "WARNING"),
            "info_count": sum(1 for m in matches if m.severity == "INFO"),
            "files_scanned": len(set(m.path for m in matches)) if matches else 0
        }
        
        return SemgrepResult(
            matches=matches,
            errors=errors,
            stats=stats,
            success=len(errors) == 0
        )
    
    def format_results_as_json(self, result: SemgrepResult) -> str:
        """Convert results to JSON string for consumption by other tools"""
        output = {
            "success": result.success,
            "matches": [asdict(match) for match in result.matches],
            "errors": result.errors,
            "stats": result.stats
        }
        return json.dumps(output, indent=2)


def main():
    """Command-line interface for the Semgrep runner"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Run Semgrep analysis with custom rules")
    parser.add_argument("targets", nargs="+", help="Files or directories to analyze")
    parser.add_argument("--rules-dir", help="Directory containing Semgrep rules")
    parser.add_argument("--rule-file", help="Specific rule file to use")
    parser.add_argument("--json", action="store_true", help="Output results as JSON")
    parser.add_argument("--install", action="store_true", help="Install Semgrep if not present")
    
    args = parser.parse_args()
    
    # Initialize runner
    try:
        runner = SemgrepRunner(rules_dir=args.rules_dir)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Check/install Semgrep if requested
    if args.install:
        if not runner.check_semgrep_installed():
            print("Installing Semgrep...", file=sys.stderr)
            if runner.install_semgrep():
                print("Semgrep installed successfully", file=sys.stderr)
            else:
                print("Failed to install Semgrep", file=sys.stderr)
                sys.exit(1)
    
    # Run analysis
    result = runner.run(targets=args.targets, rule_file=args.rule_file)
    
    # Output results
    if args.json:
        print(runner.format_results_as_json(result))
    else:
        # Human-readable output
        if result.success:
            print(f"✓ Analysis completed successfully")
        else:
            print(f"✗ Analysis completed with errors")
            for error in result.errors:
                print(f"  Error: {error}", file=sys.stderr)
        
        print(f"\nStatistics:")
        for key, value in result.stats.items():
            print(f"  {key}: {value}")
        
        if result.matches:
            print(f"\nFindings:")
            for match in result.matches:
                print(f"\n  [{match.severity}] {match.rule_id}")
                print(f"  File: {match.path}:{match.start_line}-{match.end_line}")
                print(f"  Message: {match.message}")
                if match.code_snippet:
                    print(f"  Code: {match.code_snippet[:100]}...")
    
    # Exit with appropriate code
    sys.exit(0 if result.success and len(result.matches) == 0 else 1)


if __name__ == "__main__":
    main()
