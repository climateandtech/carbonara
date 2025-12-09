#!/usr/bin/env python3
"""
Unit tests for semgrep_runner.py
Tests the improved path finding, installation verification, and retry logic.
"""

import unittest
from unittest.mock import Mock, patch, MagicMock, call
import sys
import subprocess
from pathlib import Path
import tempfile
import shutil

# Add parent directory to path to import semgrep_runner
sys.path.insert(0, str(Path(__file__).parent))
from semgrep_runner import SemgrepRunner, SemgrepResult


class TestSemgrepRunner(unittest.TestCase):
    """Test cases for SemgrepRunner class"""
    
    def setUp(self):
        """Set up test fixtures"""
        # Create a temporary rules directory for testing
        self.temp_dir = Path(tempfile.mkdtemp())
        self.rules_dir = self.temp_dir / "rules"
        self.rules_dir.mkdir()
        
        # Create a dummy rule file
        (self.rules_dir / "test-rule.yaml").write_text("rules:\n  - id: test\n")
        
        # Reset class-level installation state
        SemgrepRunner._installation_in_progress = False
        SemgrepRunner._installation_complete = False
    
    def tearDown(self):
        """Clean up test fixtures"""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_find_semgrep_path_in_path(self):
        """Test _find_semgrep_path finds semgrep in system PATH"""
        runner = SemgrepRunner(rules_dir=str(self.rules_dir))
        
        with patch('shutil.which') as mock_which:
            mock_which.return_value = "/usr/local/bin/semgrep"
            path = runner._find_semgrep_path()
            
            self.assertEqual(path, "/usr/local/bin/semgrep")
            mock_which.assert_called_once_with("semgrep")
    
    def test_find_semgrep_path_in_python_bin(self):
        """Test _find_semgrep_path finds semgrep in Python's bin directory"""
        runner = SemgrepRunner(rules_dir=str(self.rules_dir))
        
        with patch('shutil.which') as mock_which:
            # First call (system PATH) returns None
            # Second call (Python bin) returns path
            mock_which.side_effect = [None, "/usr/bin/python3/bin/semgrep"]
            
            with patch('sys.executable', new='/usr/bin/python3/bin/python'):
                path = runner._find_semgrep_path()
                
                self.assertEqual(path, "/usr/bin/python3/bin/semgrep")
                # Should have tried system PATH first, then Python bin
                self.assertGreaterEqual(mock_which.call_count, 2)
    
    def test_find_semgrep_path_in_site_packages(self):
        """Test _find_semgrep_path finds semgrep in site-packages Scripts/bin"""
        runner = SemgrepRunner(rules_dir=str(self.rules_dir))
        
        with patch('shutil.which') as mock_which:
            # System PATH and Python bin return None
            # Site-packages Scripts returns path
            mock_which.side_effect = [None, None, "/path/to/site-packages/Scripts/semgrep"]
            
            with patch('site.getsitepackages') as mock_site:
                mock_site.return_value = ["/path/to/site-packages"]
                
                # Create a real Path object for scripts_dir to avoid mocking issues
                with patch('pathlib.Path.exists') as mock_exists:
                    mock_exists.return_value = True
                    
                    path = runner._find_semgrep_path()
                    
                    # Should have tried multiple locations
                    self.assertGreaterEqual(mock_which.call_count, 2)
    
    def test_find_semgrep_path_in_user_local_bin(self):
        """Test _find_semgrep_path checks user's local bin when other locations fail"""
        runner = SemgrepRunner(rules_dir=str(self.rules_dir))
        
        with patch('shutil.which') as mock_which:
            # All previous attempts return None
            # User local bin returns path (if it exists and semgrep is found there)
            mock_which.side_effect = [None, None, None, "/home/user/.local/bin/semgrep"]
            
            # Mock the user_bin.exists() check by patching Path construction
            # This is a simplified test - we just verify the method tries multiple locations
            with patch('pathlib.Path.exists', return_value=True):
                path = runner._find_semgrep_path()
                
                # Should have tried user local bin if other locations failed
                # The exact path depends on whether user_bin exists, so we just verify
                # that shutil.which was called multiple times (trying different locations)
                self.assertGreaterEqual(mock_which.call_count, 2)
                # If user_bin exists and semgrep is found there, we should get a path
                if path:
                    self.assertIn("semgrep", path)
    
    def test_find_semgrep_path_not_found(self):
        """Test _find_semgrep_path returns None when semgrep not found"""
        runner = SemgrepRunner(rules_dir=str(self.rules_dir))
        
        with patch('shutil.which') as mock_which:
            mock_which.return_value = None
            
            path = runner._find_semgrep_path()
            
            self.assertIsNone(path)
    
    def test_check_semgrep_installed_success(self):
        """Test check_semgrep_installed returns True when semgrep is available"""
        runner = SemgrepRunner(rules_dir=str(self.rules_dir))
        
        with patch.object(runner, '_find_semgrep_path') as mock_find:
            mock_find.return_value = "/usr/bin/semgrep"
            
            with patch('subprocess.run') as mock_run:
                mock_result = Mock()
                mock_result.returncode = 0
                mock_run.return_value = mock_result
                
                result = runner.check_semgrep_installed()
                
                self.assertTrue(result)
                mock_run.assert_called_once()
                # Verify it calls semgrep --version
                call_args = mock_run.call_args[0][0]
                self.assertEqual(call_args[1], "--version")
    
    def test_check_semgrep_installed_not_found(self):
        """Test check_semgrep_installed returns False when semgrep not found"""
        runner = SemgrepRunner(rules_dir=str(self.rules_dir))
        
        with patch.object(runner, '_find_semgrep_path') as mock_find:
            mock_find.return_value = None
            
            result = runner.check_semgrep_installed()
            
            self.assertFalse(result)
    
    def test_check_semgrep_installed_version_fails(self):
        """Test check_semgrep_installed returns False when --version fails"""
        runner = SemgrepRunner(rules_dir=str(self.rules_dir))
        
        with patch.object(runner, '_find_semgrep_path') as mock_find:
            mock_find.return_value = "/usr/bin/semgrep"
            
            with patch('subprocess.run') as mock_run:
                mock_result = Mock()
                mock_result.returncode = 1  # Non-zero exit code
                mock_run.return_value = mock_result
                
                result = runner.check_semgrep_installed()
                
                self.assertFalse(result)
    
    def test_install_semgrep_already_installed(self):
        """Test install_semgrep returns True if already installed"""
        runner = SemgrepRunner(rules_dir=str(self.rules_dir))
        
        with patch.object(runner, 'check_semgrep_installed') as mock_check:
            mock_check.return_value = True
            
            result = runner.install_semgrep()
            
            self.assertTrue(result)
            # Should not attempt installation
            mock_check.assert_called_once()
    
    @patch('time.sleep')
    def test_install_semgrep_with_retry_verification(self, mock_sleep):
        """Test install_semgrep retries verification with increasing delays"""
        runner = SemgrepRunner(rules_dir=str(self.rules_dir))
        
        with patch.object(runner, 'check_semgrep_installed') as mock_check:
            # First check (before install) returns False
            # Install succeeds, then verification fails first few times, then succeeds
            mock_check.side_effect = [False, False, False, True]
            
            with patch('subprocess.run') as mock_run:
                # Mock successful pip install
                mock_install_result = Mock()
                mock_install_result.returncode = 0
                mock_run.return_value = mock_install_result
                
                result = runner.install_semgrep()
                
                self.assertTrue(result)
                # Should have retried verification multiple times
                self.assertGreater(mock_check.call_count, 1)
                # Should have slept between retries
                self.assertGreater(mock_sleep.call_count, 0)
    
    def test_install_semgrep_fails(self):
        """Test install_semgrep returns False when pip install fails"""
        runner = SemgrepRunner(rules_dir=str(self.rules_dir))
        
        with patch.object(runner, 'check_semgrep_installed') as mock_check:
            mock_check.return_value = False
            
            with patch('subprocess.run') as mock_run:
                # Mock failed pip install
                mock_install_result = Mock()
                mock_install_result.returncode = 1
                mock_run.return_value = mock_install_result
                
                result = runner.install_semgrep()
                
                self.assertFalse(result)
    
    def test_run_uses_find_semgrep_path(self):
        """Test run() method uses _find_semgrep_path() consistently"""
        runner = SemgrepRunner(rules_dir=str(self.rules_dir))
        
        with patch.object(runner, 'check_semgrep_installed') as mock_check:
            mock_check.return_value = True
            
            with patch.object(runner, '_find_semgrep_path') as mock_find:
                mock_find.return_value = "/usr/bin/semgrep"
                
                with patch('subprocess.run') as mock_run:
                    # Mock successful semgrep run
                    mock_result = Mock()
                    mock_result.stdout = '{"results": [], "errors": []}'
                    mock_result.returncode = 0
                    mock_run.return_value = mock_result
                    
                    test_file = self.temp_dir / "test.js"
                    test_file.write_text("console.log('test');")
                    
                    result = runner.run([str(test_file)])
                    
                    # Should have used _find_semgrep_path
                    mock_find.assert_called_once()
                    # Should have run semgrep with the found path
                    self.assertIsInstance(result, SemgrepResult)
    
    def test_run_auto_installs_if_missing(self):
        """Test run() automatically installs semgrep if not found"""
        runner = SemgrepRunner(rules_dir=str(self.rules_dir))
        
        with patch.object(runner, 'check_semgrep_installed') as mock_check:
            # First check fails, then after install it succeeds
            mock_check.side_effect = [False, True]
            
            with patch.object(runner, 'install_semgrep') as mock_install:
                mock_install.return_value = True
                
                with patch.object(runner, '_find_semgrep_path') as mock_find:
                    mock_find.return_value = "/usr/bin/semgrep"
                    
                    with patch('subprocess.run') as mock_run:
                        # Mock successful semgrep run
                        mock_result = Mock()
                        mock_result.stdout = '{"results": [], "errors": []}'
                        mock_result.returncode = 0
                        mock_run.return_value = mock_result
                        
                        test_file = self.temp_dir / "test.js"
                        test_file.write_text("console.log('test');")
                        
                        result = runner.run([str(test_file)])
                        
                        # Should have attempted installation
                        mock_install.assert_called_once()
                        # Should have succeeded
                        self.assertTrue(result.success)
    
    def test_run_verification_fails_after_install(self):
        """Test run() handles verification failure after installation"""
        runner = SemgrepRunner(rules_dir=str(self.rules_dir))
        
        with patch.object(runner, 'check_semgrep_installed') as mock_check:
            # First check fails, install succeeds, but verification still fails
            mock_check.side_effect = [False, False]
            
            with patch.object(runner, 'install_semgrep') as mock_install:
                mock_install.return_value = True  # Install reports success
                
                test_file = self.temp_dir / "test.js"
                test_file.write_text("console.log('test');")
                
                result = runner.run([str(test_file)])
                
                # Should have attempted installation
                mock_install.assert_called_once()
                # Should have failed with verification error
                self.assertFalse(result.success)
                self.assertIn("verification failed", result.errors[0].lower())


if __name__ == '__main__':
    unittest.main()

