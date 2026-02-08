/**
 * Unit tests for ServiceContainer
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { ServiceContainer } from '../serviceContainer';
import { TestServiceFactory } from '../testServiceFactory';

describe('ServiceContainer', () => {
  let container: ServiceContainer;
  let mockContext: any;

  beforeEach(() => {
    mockContext = {
      subscriptions: [],
      extensionPath: '/test/path',
      extensionUri: { scheme: 'file', path: '/test/path' },
    };
    container = new ServiceContainer(new TestServiceFactory(), mockContext);
  });

  describe('initialization', () => {
    test('initializes successfully', async () => {
      await container.initialize();
      // Should not throw
    });

    test('throws if initialized twice', async () => {
      await container.initialize();
      await expect(container.initialize()).rejects.toThrow('already initialized');
    });

    test('creates runtime service', async () => {
      await container.initialize();
      const runtime = container.getService('runtime');
      expect(runtime).toBeDefined();
    });

    test('creates logger service', async () => {
      await container.initialize();
      const logger = container.getService('logger');
      expect(logger).toBeDefined();
      expect(logger.info).toBeFunction();
    });

    test('creates nuget client', async () => {
      await container.initialize();
      const client = container.getService('nugetClient');
      expect(client).toBeDefined();
    });

    test('creates project parser', async () => {
      await container.initialize();
      const parser = container.getService('projectParser');
      expect(parser).toBeDefined();
    });

    test('creates package CLI service', async () => {
      await container.initialize();
      const cliService = container.getService('packageCliService');
      expect(cliService).toBeDefined();
    });

    test('creates cache notifier', async () => {
      await container.initialize();
      const notifier = container.getService('cacheNotifier');
      expect(notifier).toBeDefined();
    });

    test('creates all command services', async () => {
      await container.initialize();
      const packageBrowserCommand = container.getService('packageBrowserCommand');
      const installCommand = container.getService('installCommand');
      const uninstallCommand = container.getService('uninstallCommand');

      expect(packageBrowserCommand).toBeDefined();
      expect(installCommand).toBeDefined();
      expect(uninstallCommand).toBeDefined();
    });
  });

  describe('getService', () => {
    test('throws if not initialized', () => {
      expect(() => container.getService('logger')).toThrow('not initialized');
    });

    test('throws for unknown service', async () => {
      await container.initialize();
      expect(() => container.getService('unknown' as any)).toThrow('not found');
    });

    test('returns same instance on multiple calls', async () => {
      await container.initialize();
      const logger1 = container.getService('logger');
      const logger2 = container.getService('logger');
      expect(logger1).toBe(logger2);
    });
  });

  describe('registerCommands', () => {
    test('registers commands without throwing', async () => {
      await container.initialize();
      // Should not throw (TestServiceFactory has no-op registerCommands)
      expect(() => container.registerCommands()).not.toThrow();
    });
  });

  describe('dispose', () => {
    test('disposes all services', async () => {
      await container.initialize();
      container.dispose();

      // After disposal, attempting to get services should fail
      expect(() => container.getService('logger')).toThrow('not initialized');
    });

    test('handles disposal errors gracefully', async () => {
      await container.initialize();
      // Disposal should not throw even if individual services fail
      expect(() => container.dispose()).not.toThrow();
    });

    test('can be called multiple times safely', async () => {
      await container.initialize();
      container.dispose();
      container.dispose(); // Should not throw
    });
  });

  describe('lifecycle', () => {
    test('follows initialize -> use -> dispose pattern', async () => {
      // Initialize
      await container.initialize();

      // Use
      const logger = container.getService('logger');
      logger.info('Test message');

      const client = container.getService('nugetClient');
      expect(client).toBeDefined();

      // Dispose
      container.dispose();

      // After disposal, should not be usable
      expect(() => container.getService('logger')).toThrow('not initialized');
    });
  });
});

// Simple smoke test that factories can be created
describe('Service Factories', () => {
  test('TestServiceFactory can be created', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { TestServiceFactory } = require('../testServiceFactory');
    const factory = new TestServiceFactory();
    expect(factory).toBeDefined();
    expect(factory.createLogger).toBeFunction();
  });

  test('NodeServiceFactory can be created', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { NodeServiceFactory } = require('../../env/node/nodeServiceFactory');
    const factory = new NodeServiceFactory();
    expect(factory).toBeDefined();
    expect(factory.createLogger).toBeFunction();
  });
});
