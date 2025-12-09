#!/usr/bin/env python3
"""
Setup script for Carbonara Semgrep integration.
This script helps set up a bundled Python environment with Semgrep.

NOTE: Bundled Python was never actually used in practice. The useBundledPython flag
was always set to false, and the infrastructure was created but never activated.
The original plan was to "switch to bundled later" but that migration never happened.

This infrastructure is kept intact for potential future use, but the current
implementation uses system Python (or direct semgrep CLI calls) instead.
"""

import os
import sys
import subprocess
import platform
import shutil
from pathlib import Path
import zipfile
import tarfile
import urllib.request
import json


class SemgrepSetup:
    """Handles the setup and bundling of Python/Semgrep environment"""
    
    def __init__(self, base_dir: Path = None):
        if base_dir is None:
            self.base_dir = Path(__file__).parent.parent
        else:
            self.base_dir = Path(base_dir)
        
        self.python_dist_dir = self.base_dir / "python-dist"
        self.platform = platform.system().lower()
        self.arch = platform.machine().lower()
    
    def create_virtual_env(self) -> bool:
        """Create a virtual environment for bundling Python and Semgrep"""
        print(f"Creating virtual environment in {self.python_dist_dir}")
        
        # Create python-dist directory if it doesn't exist
        self.python_dist_dir.mkdir(parents=True, exist_ok=True)
        
        venv_path = self.python_dist_dir / "venv"
        
        try:
            # Create virtual environment
            subprocess.run([
                sys.executable, "-m", "venv", str(venv_path)
            ], check=True)
            
            # Determine pip path based on platform
            if self.platform == "windows":
                pip_path = venv_path / "Scripts" / "pip.exe"
                python_path = venv_path / "Scripts" / "python.exe"
            else:
                pip_path = venv_path / "bin" / "pip"
                python_path = venv_path / "bin" / "python"
            
            # Upgrade pip
            subprocess.run([
                str(python_path), "-m", "pip", "install", "--upgrade", "pip"
            ], check=True)
            
            # Install semgrep and dependencies
            requirements_path = self.base_dir / "python" / "requirements.txt"
            subprocess.run([
                str(pip_path), "install", "-r", str(requirements_path)
            ], check=True)
            
            print("✓ Virtual environment created successfully")
            return True
            
        except subprocess.CalledProcessError as e:
            print(f"✗ Failed to create virtual environment: {e}")
            return False
    
    def create_portable_bundle(self) -> bool:
        """
        Create a portable Python bundle with Semgrep that can be distributed
        with the VSCode extension or CLI.
        """
        print("Creating portable Python/Semgrep bundle...")
        
        # First ensure we have a virtual environment
        venv_path = self.python_dist_dir / "venv"
        if not venv_path.exists():
            if not self.create_virtual_env():
                return False
        
        # Create bundle directory
        bundle_dir = self.python_dist_dir / "bundle"
        bundle_dir.mkdir(parents=True, exist_ok=True)
        
        # Copy Python runner script
        runner_src = self.base_dir / "python" / "semgrep_runner.py"
        runner_dst = bundle_dir / "semgrep_runner.py"
        shutil.copy2(runner_src, runner_dst)
        
        # Create a wrapper script that uses the bundled Python
        wrapper_content = self._create_wrapper_script()
        wrapper_path = bundle_dir / ("run_semgrep.bat" if self.platform == "windows" else "run_semgrep.sh")
        wrapper_path.write_text(wrapper_content)
        
        if self.platform != "windows":
            # Make wrapper executable on Unix-like systems
            wrapper_path.chmod(0o755)
        
        # Create metadata file
        metadata = {
            "platform": self.platform,
            "arch": self.arch,
            "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
            "created_at": Path(__file__).stat().st_mtime
        }
        
        metadata_path = bundle_dir / "metadata.json"
        metadata_path.write_text(json.dumps(metadata, indent=2))
        
        print(f"✓ Portable bundle created in {bundle_dir}")
        return True
    
    def _create_wrapper_script(self) -> str:
        """Create platform-specific wrapper script"""
        if self.platform == "windows":
            return """@echo off
SET SCRIPT_DIR=%~dp0
SET VENV_PATH=%SCRIPT_DIR%..\\venv
SET PYTHON_PATH=%VENV_PATH%\\Scripts\\python.exe

IF NOT EXIST "%PYTHON_PATH%" (
    echo Error: Python environment not found at %PYTHON_PATH%
    exit /b 1
)

"%PYTHON_PATH%" "%SCRIPT_DIR%semgrep_runner.py" %*
"""
        else:
            return """#!/bin/bash
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
VENV_PATH="$SCRIPT_DIR/../venv"
PYTHON_PATH="$VENV_PATH/bin/python"

if [ ! -f "$PYTHON_PATH" ]; then
    echo "Error: Python environment not found at $PYTHON_PATH"
    exit 1
fi

"$PYTHON_PATH" "$SCRIPT_DIR/semgrep_runner.py" "$@"
"""
    
    def verify_installation(self) -> bool:
        """Verify that Semgrep is properly installed and working"""
        print("Verifying Semgrep installation...")
        
        venv_path = self.python_dist_dir / "venv"
        if self.platform == "windows":
            python_path = venv_path / "Scripts" / "python.exe"
        else:
            python_path = venv_path / "bin" / "python"
        
        if not python_path.exists():
            print(f"✗ Python not found at {python_path}")
            return False
        
        # Test importing semgrep
        try:
            result = subprocess.run([
                str(python_path), "-c", "import semgrep; print(semgrep.__version__)"
            ], capture_output=True, text=True, check=True)
            
            print(f"✓ Semgrep version: {result.stdout.strip()}")
            
            # Test running our runner script
            runner_path = self.base_dir / "python" / "semgrep_runner.py"
            test_file = self.base_dir / "semgrep" / "example-code.js"
            
            if test_file.exists():
                result = subprocess.run([
                    str(python_path), str(runner_path), 
                    str(test_file), "--json"
                ], capture_output=True, text=True)
                
                if result.returncode == 0 or result.returncode == 1:  # 1 is OK if findings exist
                    print("✓ Semgrep runner working correctly")
                    return True
                else:
                    print(f"✗ Semgrep runner failed: {result.stderr}")
                    return False
            else:
                print("⚠ Test file not found, skipping runner test")
                return True
                
        except subprocess.CalledProcessError as e:
            print(f"✗ Failed to verify installation: {e}")
            return False
    
    def clean(self) -> None:
        """Clean up the Python distribution directory"""
        if self.python_dist_dir.exists():
            print(f"Cleaning up {self.python_dist_dir}")
            shutil.rmtree(self.python_dist_dir)
            print("✓ Cleanup complete")


def main():
    """Main entry point for setup script"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Setup Semgrep for Carbonara")
    parser.add_argument("--create-venv", action="store_true", 
                       help="Create virtual environment with Semgrep")
    parser.add_argument("--bundle", action="store_true",
                       help="Create portable bundle for distribution")
    parser.add_argument("--verify", action="store_true",
                       help="Verify Semgrep installation")
    parser.add_argument("--clean", action="store_true",
                       help="Clean up Python distribution directory")
    parser.add_argument("--all", action="store_true",
                       help="Run all setup steps")
    
    args = parser.parse_args()
    
    setup = SemgrepSetup()
    
    if args.clean:
        setup.clean()
        return
    
    if args.all or args.create_venv:
        if not setup.create_virtual_env():
            sys.exit(1)
    
    if args.all or args.bundle:
        if not setup.create_portable_bundle():
            sys.exit(1)
    
    if args.all or args.verify:
        if not setup.verify_installation():
            sys.exit(1)
    
    if not any([args.create_venv, args.bundle, args.verify, args.clean, args.all]):
        parser.print_help()


if __name__ == "__main__":
    main()
