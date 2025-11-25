import { describe, test, expect } from 'vitest';
import { getToolRegistry } from '../src/registry/index.js';

describe('Plugin Package Extraction', () => {
  test('should extract plugin packages from manifest template', () => {
    const registry = getToolRegistry();
    
    // Get IF webpage scan tool which has plugins
    const tool = registry.getTool('if-webpage-scan');
    expect(tool).toBeDefined();
    expect(tool?.manifestTemplate).toBeDefined();
    
    // Method is now public, can call directly
    const plugins = registry.extractPluginPackages(tool!.manifestTemplate);
    
    // Should extract @tngtech/if-webpage-plugins from the manifest
    expect(plugins).toContain('@tngtech/if-webpage-plugins');
    expect(plugins.length).toBeGreaterThan(0);
  });

  test('should extract multiple plugin packages from nested manifest', () => {
    const manifest = {
      initialize: {
        plugins: {
          plugin1: {
            method: 'Method1',
            path: '@tngtech/if-webpage-plugins',
            config: {}
          },
          plugin2: {
            method: 'Method2',
            path: '@tngtech/if-webpage-plugins',
            config: {}
          },
          plugin3: {
            method: 'Method3',
            path: '@other/plugin-package',
            config: {}
          }
        }
      },
      tree: {
        children: {
          child: {
            pipeline: {
              observe: ['plugin1'],
              compute: ['plugin2', 'plugin3']
            }
          }
        }
      }
    };
    
    const registry = getToolRegistry();
    const plugins = registry.extractPluginPackages(manifest);
    
    // Should extract both unique packages
    expect(plugins).toContain('@tngtech/if-webpage-plugins');
    expect(plugins).toContain('@other/plugin-package');
    expect(plugins.length).toBe(2);
  });

  test('should handle manifest without plugins', () => {
    const manifest = {
      name: 'test-manifest',
      description: 'No plugins here'
    };
    
    const registry = getToolRegistry();
    const plugins = registry.extractPluginPackages(manifest);
    
    expect(plugins).toEqual([]);
  });

  test('should handle deeply nested plugin paths', () => {
    const manifest = {
      initialize: {
        outputs: ['yaml'],
        plugins: {
          nested: {
            deep: {
              plugin: {
                method: 'DeepPlugin',
                path: '@deep/nested-plugin',
                config: {
                  nested: {
                    config: {
                      path: '@another/plugin' // This should also be extracted
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
    
    const registry = getToolRegistry();
    const plugins = registry.extractPluginPackages(manifest);
    
    // Should extract both packages
    expect(plugins).toContain('@deep/nested-plugin');
    expect(plugins).toContain('@another/plugin');
    expect(plugins.length).toBe(2);
  });

  test('should ignore non-scoped paths', () => {
    const manifest = {
      initialize: {
        plugins: {
          plugin1: {
            method: 'Method1',
            path: 'builtin', // Not a scoped package
            config: {}
          },
          plugin2: {
            method: 'Method2',
            path: '@tngtech/if-webpage-plugins', // Scoped package
            config: {}
          },
          plugin3: {
            method: 'Method3',
            path: './local-plugin', // Relative path
            config: {}
          }
        }
      }
    };
    
    const registry = getToolRegistry();
    const plugins = registry.extractPluginPackages(manifest);
    
    // Should only extract scoped packages
    expect(plugins).toContain('@tngtech/if-webpage-plugins');
    expect(plugins).not.toContain('builtin');
    expect(plugins).not.toContain('./local-plugin');
    expect(plugins.length).toBe(1);
  });

  test('should extract plugins from all IF tools with manifestTemplate', () => {
    const registry = getToolRegistry();
    const ifTools = registry.getAllTools().filter(t => t.id.startsWith('if-') && t.manifestTemplate);
    
    expect(ifTools.length).toBeGreaterThan(0);
    
    const registryInstance = (registry as any);
    const extractPluginPackages = registryInstance.extractPluginPackages.bind(registryInstance);
    
    for (const tool of ifTools) {
      const plugins = extractPluginPackages(tool.manifestTemplate!);
      
      // All IF tools should have at least @tngtech/if-webpage-plugins
      expect(plugins.length).toBeGreaterThan(0);
      expect(plugins.some(p => p.includes('@tngtech') || p.includes('@grnsft'))).toBe(true);
    }
  });
});

