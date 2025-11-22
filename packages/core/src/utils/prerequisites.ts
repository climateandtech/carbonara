import execa from 'execa';

export interface Prerequisite {
  /**
   * Type of prerequisite (e.g., 'docker', 'node', 'python', 'command')
   */
  type: string;
  /**
   * Name/identifier of the prerequisite
   */
  name: string;
  /**
   * Command to check if prerequisite is available
   */
  checkCommand: string;
  /**
   * Expected output pattern (optional, for validation)
   */
  expectedOutput?: string;
  /**
   * User-friendly error message when prerequisite is missing
   */
  errorMessage: string;
  /**
   * Installation/setup instructions
   */
  setupInstructions?: string;
}

/**
 * Checks if a prerequisite is available
 */
export async function checkPrerequisite(prerequisite: Prerequisite): Promise<{
  available: boolean;
  error?: string;
}> {
  try {
    const result = await execa.command(prerequisite.checkCommand, {
      stdio: 'pipe',
      timeout: 5000,
      reject: false,
      shell: true
    });

    // Check if command exists (exit code 127 means command not found)
    if (result.exitCode === 127) {
      return {
        available: false,
        error: prerequisite.errorMessage
      };
    }

    // For Docker, also check if daemon is running
    if (prerequisite.type === 'docker') {
      // Try to run a simple docker command to check if daemon is running
      try {
        const dockerCheck = await execa('docker', ['info'], {
          stdio: 'pipe',
          timeout: 3000,
          reject: false
        });
        
        if (dockerCheck.exitCode !== 0) {
          // Docker is installed but daemon is not running
          const stderr = dockerCheck.stderr || '';
          if (stderr.includes('Cannot connect') || stderr.includes('Is the docker daemon running')) {
            return {
              available: false,
              error: `Docker is installed but the Docker daemon is not running. Please start Docker Desktop.`
            };
          }
          return {
            available: false,
            error: `Docker daemon is not running. Please start Docker Desktop.`
          };
        }
      } catch {
        return {
          available: false,
          error: `Docker daemon is not running. Please start Docker Desktop.`
        };
      }
    }

    // For Playwright, check if browsers are installed
    if (prerequisite.type === 'playwright') {
      try {
        // Try to actually import and check if Playwright can find browsers
        const { chromium } = await import('playwright');
        
        // Try to get the executable path - this will throw if browsers aren't installed
        try {
          const browserType = chromium;
          // Use the executablePath method which will throw if browser isn't installed
          const executablePath = browserType.executablePath();
          
          // Check if the executable actually exists
          const fs = await import('fs');
          if (!fs.existsSync(executablePath)) {
            throw new Error('Playwright browser executable not found');
          }
        } catch (execError: any) {
          // Browser not installed or executable doesn't exist
          if (execError.message?.includes('Executable doesn\'t exist') ||
              execError.message?.includes('browser executable not found') ||
              execError.message?.includes('Executable not found')) {
            return {
              available: false,
              error: `${prerequisite.errorMessage}\n   Run 'npx playwright install chromium' to install the required browsers.`
            };
          }
          // Re-throw if it's a different error
          throw execError;
        }
      } catch (error: any) {
        // If import fails or browsers aren't installed
        if (error.message?.includes('Executable doesn\'t exist') ||
            error.message?.includes('browser executable not found') ||
            error.message?.includes('Executable not found')) {
          return {
            available: false,
            error: `${prerequisite.errorMessage}\n   Run 'npx playwright install chromium' to install the required browsers.`
          };
        }
        // For other errors (like import failures), assume browsers might not be installed
        return {
          available: false,
          error: `${prerequisite.errorMessage}\n   Run 'npx playwright install chromium' to install the required browsers.`
        };
      }
    }

    // If expected output is specified, validate it
    if (prerequisite.expectedOutput && result.stdout) {
      if (!result.stdout.includes(prerequisite.expectedOutput)) {
        return {
          available: false,
          error: prerequisite.errorMessage
        };
      }
    }

    // Command succeeded and output matches (if specified)
    return { available: true };
  } catch (error: any) {
    return {
      available: false,
      error: prerequisite.errorMessage
    };
  }
}

/**
 * Checks all prerequisites for a tool
 */
export async function checkPrerequisites(prerequisites: Prerequisite[]): Promise<{
  allAvailable: boolean;
  missing: Array<{ prerequisite: Prerequisite; error: string }>;
}> {
  const results = await Promise.all(
    prerequisites.map(async (prereq) => {
      const result = await checkPrerequisite(prereq);
      return { prerequisite: prereq, result };
    })
  );

  const missing = results
    .filter(({ result }) => !result.available)
    .map(({ prerequisite, result }) => ({
      prerequisite,
      error: result.error || 'Prerequisite not available'
    }));

  return {
    allAvailable: missing.length === 0,
    missing
  };
}






