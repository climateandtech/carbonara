import { execa, execaCommand } from 'execa';

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
   * Command to install the prerequisite (optional, for automated installation)
   */
  installCommand?: string;
  /**
   * Installation/setup instructions (optional, for manual steps or documentation)
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
    const result = await execaCommand(prerequisite.checkCommand, {
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

    // If expected output is specified, validate it
    if (prerequisite.expectedOutput && result.stdout) {
      if (!result.stdout.includes(prerequisite.expectedOutput)) {
        return {
          available: false,
          error: prerequisite.errorMessage
        };
      }
    }

    // If command failed (non-zero exit code) and no expected output check, consider it unavailable
    if (result.exitCode !== 0) {
      return {
        available: false,
        error: prerequisite.errorMessage
      };
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






