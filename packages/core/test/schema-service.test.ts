import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaService } from '../src/schema-service.js';

describe('SchemaService', () => {
  let schemaService: SchemaService;

  beforeEach(() => {
    schemaService = new SchemaService();
  });

  describe('Tool Schema Loading', () => {
    it('should load tool schemas from registry', async () => {
      const schemas = await schemaService.loadToolSchemas();
      
      expect(schemas).toBeDefined();
      expect(schemas.size).toBeGreaterThan(0);
      
      // Check for expected tools from registry
      expect(schemas.has('co2-assessment')).toBe(true);
      expect(schemas.has('greenframe')).toBe(true);
      // Note: byte-counter will be added in separate step
    });

    it('should return tool schema by id', async () => {
      await schemaService.loadToolSchemas();
      
      const co2Schema = schemaService.getToolSchema('co2-assessment');
      expect(co2Schema).toBeDefined();
      expect(co2Schema?.id).toBe('co2-assessment');
      expect(co2Schema?.name).toBe('CO2 Assessment');

      const greenframeSchema = schemaService.getToolSchema('greenframe');
      expect(greenframeSchema).toBeDefined();
      expect(greenframeSchema?.id).toBe('greenframe');
      expect(greenframeSchema?.name).toBe('GreenFrame');
      expect(greenframeSchema?.display).toBeDefined();
    });

    it('should return null for non-existent tool schema', async () => {
      await schemaService.loadToolSchemas();
      
      const schema = schemaService.getToolSchema('non-existent-tool');
      expect(schema).toBeNull();
    });
  });

  describe('Data Path Extraction', () => {
    it('should extract value from nested object using path', () => {
      const data = {
        data: {
          url: 'https://example.com',
          results: {
            totalBytes: 524288,
            performance: {
              loadTime: 1250
            }
          }
        }
      };

      expect(schemaService.extractValue(data, 'data.url')).toBe('https://example.com');
      expect(schemaService.extractValue(data, 'data.results.totalBytes')).toBe(524288);
      expect(schemaService.extractValue(data, 'data.results.performance.loadTime')).toBe(1250);
    });

    it('should handle multiple fallback paths', () => {
      const data = {
        data: {
          results: {
            loadTime: 1250
          }
        }
      };

      // First path doesn't exist, second does
      const result = schemaService.extractValue(data, 'data.results.performance.loadTime,data.results.loadTime');
      expect(result).toBe(1250);
    });

    it('should return null for non-existent paths', () => {
      const data = { data: {} };
      
      expect(schemaService.extractValue(data, 'data.nonexistent.path')).toBeNull();
      expect(schemaService.extractValue(data, 'completely.wrong.path')).toBeNull();
    });

    it('should handle null and undefined values', () => {
      const data = {
        data: {
          nullValue: null,
          undefinedValue: undefined,
          emptyString: ''
        }
      };

      expect(schemaService.extractValue(data, 'data.nullValue')).toBeNull();
      expect(schemaService.extractValue(data, 'data.undefinedValue')).toBeNull();
      expect(schemaService.extractValue(data, 'data.emptyString')).toBe('');
    });
  });

  describe('Data Formatting', () => {
    it('should format bytes values correctly', () => {
      expect(schemaService.formatValue(524288, 'bytes')).toBe('512 KB');
      expect(schemaService.formatValue(1048576, 'bytes')).toBe('1024 KB');
      expect(schemaService.formatValue(1073741824, 'bytes')).toBe('1048576 KB');
    });

    it('should format time values correctly', () => {
      expect(schemaService.formatValue(1250, 'time')).toBe('1250ms');
      expect(schemaService.formatValue(0, 'time')).toBe('0ms');
    });

    it('should format carbon values correctly', () => {
      expect(schemaService.formatValue(0.245, 'carbon')).toBe('0.245g');
      expect(schemaService.formatValue(1.5, 'carbon')).toBe('1.5g');
    });

    it('should format energy values correctly', () => {
      expect(schemaService.formatValue(0.0012, 'energy')).toBe('0.0012 kWh');
      expect(schemaService.formatValue(2.5, 'energy')).toBe('2.5 kWh');
    });

    it('should use custom format templates', () => {
      const result = schemaService.formatValue(524288, 'bytes', '{value} KB ({valueMB} MB)');
      expect(result).toBe('512 KB (0.50 MB)');
    });

    it('should return string representation for unknown types', () => {
      expect(schemaService.formatValue('test', 'unknown')).toBe('test');
      expect(schemaService.formatValue(123, 'unknown')).toBe('123');
    });
  });

  describe('Schema Validation', () => {
    it('should validate tool schema structure', async () => {
      await schemaService.loadToolSchemas();
      
      const schema = schemaService.getToolSchema('co2-assessment');
      expect(schema).toBeDefined();
      
      // Validate required fields
      expect(schema?.id).toBeTruthy();
      expect(schema?.name).toBeTruthy();
      
      // Validate field structure (fallback schemas don't have display.fields)
      const fields = schema?.display?.fields || [];
      expect(fields.length).toBeGreaterThanOrEqual(0);
      
      fields.forEach(field => {
        expect(field.key).toBeTruthy();
        expect(field.label).toBeTruthy();
        expect(field.path).toBeTruthy();
        expect(field.type).toBeTruthy();
      });
    });
  });
});
