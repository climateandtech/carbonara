import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaService } from '../src/schema-service.js';

describe('SchemaService - Array Extraction', () => {
  let schemaService: SchemaService;

  beforeEach(() => {
    schemaService = new SchemaService();
  });

  describe('extractValue with array wildcards', () => {
    it('should extract first value from array with wildcard path', () => {
      const entry = {
        data: {
          deployments: [
            { provider: 'AWS', region: 'us-east-1' },
            { provider: 'GCP', region: 'europe-west1' },
          ],
        },
      };

      const value = schemaService.extractValue(entry, 'data.deployments[*].provider');
      expect(value).toBe('AWS'); // Should return first value
    });

    it('should extract nested values from array', () => {
      const entry = {
        data: {
          deployments: [
            { provider: 'AWS', carbon_intensity: 350 },
            { provider: 'GCP', carbon_intensity: 200 },
          ],
        },
      };

      const value = schemaService.extractValue(entry, 'data.deployments[*].carbon_intensity');
      expect(value).toBe(350); // Should return first value
    });

    it('should return null if array is empty', () => {
      const entry = {
        data: {
          deployments: [],
        },
      };

      const value = schemaService.extractValue(entry, 'data.deployments[*].provider');
      expect(value).toBeNull();
    });

    it('should return null if array key does not exist', () => {
      const entry = {
        data: {},
      };

      const value = schemaService.extractValue(entry, 'data.deployments[*].provider');
      expect(value).toBeNull();
    });

    it('should return null if property does not exist in array items', () => {
      const entry = {
        data: {
          deployments: [
            { provider: 'AWS' },
            { provider: 'GCP' },
          ],
        },
      };

      const value = schemaService.extractValue(entry, 'data.deployments[*].nonexistent');
      expect(value).toBeNull();
    });

    it('should handle array wildcard without next part', () => {
      const entry = {
        data: {
          deployments: [
            { provider: 'AWS' },
            { provider: 'GCP' },
          ],
        },
      };

      const value = schemaService.extractValue(entry, 'data.deployments[*]');
      expect(Array.isArray(value)).toBe(true);
      expect(value.length).toBe(2);
    });
  });
});



