import { describe, test, expect, mock } from 'bun:test';
import { EventBus } from '../eventBus';

describe('EventBus', () => {
  test('emits events to subscribers', () => {
    const bus = new EventBus();
    const handler = mock(() => {});

    bus.on('projects:changed', handler);
    bus.emit('projects:changed', { projectPaths: ['test.csproj'] });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ projectPaths: ['test.csproj'] });
  });

  test('supports multiple subscribers', () => {
    const bus = new EventBus();
    const handler1 = mock(() => {});
    const handler2 = mock(() => {});

    bus.on('projects:changed', handler1);
    bus.on('projects:changed', handler2);
    bus.emit('projects:changed', { projectPaths: ['a.csproj'] });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  test('dispose() unsubscribes handler', () => {
    const bus = new EventBus();
    const handler = mock(() => {});

    const subscription = bus.on('projects:changed', handler);
    bus.emit('projects:changed', { projectPaths: ['a'] });
    subscription.dispose();
    bus.emit('projects:changed', { projectPaths: ['b'] });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('once() auto-unsubscribes after first event', () => {
    const bus = new EventBus();
    const handler = mock(() => {});

    bus.once('projects:changed', handler);
    bus.emit('projects:changed', { projectPaths: ['a'] });
    bus.emit('projects:changed', { projectPaths: ['b'] });
    bus.emit('projects:changed', { projectPaths: ['c'] });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ projectPaths: ['a'] });
  });

  test('swallows errors from handlers', () => {
    const bus = new EventBus();
    const badHandler = mock(() => {
      throw new Error('Handler error');
    });
    const goodHandler = mock(() => {});

    bus.on('projects:changed', badHandler);
    bus.on('projects:changed', goodHandler);

    // Should not throw
    expect(() => {
      bus.emit('projects:changed', { projectPaths: ['test'] });
    }).not.toThrow();

    expect(badHandler).toHaveBeenCalledTimes(1);
    expect(goodHandler).toHaveBeenCalledTimes(1);
  });

  test('no-op if no subscribers', () => {
    const bus = new EventBus();
    expect(() => {
      bus.emit('projects:changed', { projectPaths: [] });
    }).not.toThrow();
  });

  test('supports different event types', () => {
    const bus = new EventBus();
    const cacheHandler = mock(() => {});
    const configHandler = mock(() => {});
    const installHandler = mock(() => {});

    bus.on('cache:invalidated', cacheHandler);
    bus.on('config:changed', configHandler);
    bus.on('package:installed', installHandler);

    bus.emit('cache:invalidated', { keys: ['key1', 'key2'] });
    bus.emit('config:changed', { section: 'opm' });
    bus.emit('package:installed', { packageId: 'Newtonsoft.Json', version: '13.0.1', projectPath: '/test' });

    expect(cacheHandler).toHaveBeenCalledWith({ keys: ['key1', 'key2'] });
    expect(configHandler).toHaveBeenCalledWith({ section: 'opm' });
    expect(installHandler).toHaveBeenCalledWith({
      packageId: 'Newtonsoft.Json',
      version: '13.0.1',
      projectPath: '/test',
    });
  });

  test('isolates event types', () => {
    const bus = new EventBus();
    const projectsHandler = mock(() => {});
    const cacheHandler = mock(() => {});

    bus.on('projects:changed', projectsHandler);
    bus.on('cache:invalidated', cacheHandler);

    bus.emit('projects:changed', { projectPaths: ['test'] });

    expect(projectsHandler).toHaveBeenCalledTimes(1);
    expect(cacheHandler).toHaveBeenCalledTimes(0);
  });

  test('multiple subscriptions to same event work independently', () => {
    const bus = new EventBus();
    const handler1 = mock(() => {});
    const handler2 = mock(() => {});

    const sub1 = bus.on('projects:changed', handler1);
    const sub2 = bus.on('projects:changed', handler2);

    bus.emit('projects:changed', { projectPaths: ['test'] });
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);

    sub1.dispose();
    bus.emit('projects:changed', { projectPaths: ['test'] });
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(2);

    sub2.dispose();
    bus.emit('projects:changed', { projectPaths: ['test'] });
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(2);
  });

  test('handler can emit events', () => {
    const bus = new EventBus();
    const projectsHandler = mock(() => {
      bus.emit('cache:invalidated', { keys: ['all'] });
    });
    const cacheHandler = mock(() => {});

    bus.on('projects:changed', projectsHandler);
    bus.on('cache:invalidated', cacheHandler);

    bus.emit('projects:changed', { projectPaths: ['test'] });

    expect(projectsHandler).toHaveBeenCalledTimes(1);
    expect(cacheHandler).toHaveBeenCalledTimes(1);
  });
});
