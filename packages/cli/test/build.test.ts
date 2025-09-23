
import { execSync } from 'child_process';
import { describe, test, expect } from 'vitest';

describe('Build process', () => {
  test('should run npm run build successfully', () => {
    try {
      execSync('npm run build', { stdio: 'pipe' });
      expect(true).toBe(true);
    } catch (error) {
      console.error('Build failed:', error);
      expect(false).toBe(true);
    }
  });
});
