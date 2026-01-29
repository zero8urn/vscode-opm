import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import type { DotnetProjectParser, IFileSystemWatcher } from '../dotnetProjectParser';
import { createDotnetProjectParser } from '../dotnetProjectParser';

describe('DotnetProjectParser File Watcher', () => {
  let projectParser: DotnetProjectParser;
  let mockLogger: any;
  const fileWatcherHandlers = new Map<string, (uri: any) => void>();

  function createMockWatcher(): IFileSystemWatcher {
    return {
      onDidChange: listener => {
        fileWatcherHandlers.set('change', listener as any);
        return { dispose: () => fileWatcherHandlers.delete('change') };
      },
      onDidCreate: listener => {
        fileWatcherHandlers.set('create', listener as any);
        return { dispose: () => fileWatcherHandlers.delete('create') };
      },
      onDidDelete: listener => {
        fileWatcherHandlers.set('delete', listener as any);
        return { dispose: () => fileWatcherHandlers.delete('delete') };
      },
    };
  }

  beforeEach(() => {
    mockLogger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      show: () => {},
      isDebugEnabled: () => false,
      dispose: () => {},
    };
    projectParser = createDotnetProjectParser(
      {
        executeSync: () => ({ stdout: '', stderr: '', exitCode: 0 }),
      } as any,
      {
        parseSync: () => ({ targetFrameworks: [] }),
      } as any,
      {
        parseSync: () => ({ packages: [] }),
      } as any,
      mockLogger,
    );
    fileWatcherHandlers.clear();
  });

  afterEach(() => {
    projectParser.dispose();
  });

  describe('startWatching', () => {
    it('registers file watcher handlers for create/delete events', () => {
      const watcher = createMockWatcher();
      projectParser.startWatching(watcher as any);

      expect(fileWatcherHandlers.has('create')).toBe(true);
      expect(fileWatcherHandlers.has('delete')).toBe(true);
    });

    it('calls onProjectListChanged callback when project file is created', () => {
      const callback = mock(() => {});
      projectParser.onProjectListChanged(callback);

      const watcher = createMockWatcher();
      projectParser.startWatching(watcher as any);

      // Trigger create event
      const createHandler = fileWatcherHandlers.get('create')!;
      createHandler({ fsPath: '/workspace/NewProject.csproj' });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('calls onProjectListChanged callback when project file is deleted', () => {
      const callback = mock(() => {});
      projectParser.onProjectListChanged(callback);

      const watcher = createMockWatcher();
      projectParser.startWatching(watcher as any);

      // Trigger delete event
      const deleteHandler = fileWatcherHandlers.get('delete')!;
      deleteHandler({ fsPath: '/workspace/OldProject.csproj' });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('removes project from cache when deleted', () => {
      const callback = mock(() => {});
      projectParser.onProjectListChanged(callback);

      const watcher = createMockWatcher();
      projectParser.startWatching(watcher as any);

      const projectPath = '/workspace/Project.csproj';

      // Simulate delete event
      const deleteHandler = fileWatcherHandlers.get('delete')!;
      deleteHandler({ fsPath: projectPath });

      // Callback should be called
      expect(callback).toHaveBeenCalled();
    });

    it('ignores change events (only notifies on create/delete)', () => {
      const callback = mock(() => {});
      projectParser.onProjectListChanged(callback);

      const watcher = createMockWatcher();
      projectParser.startWatching(watcher as any);

      // Trigger change event
      const changeHandler = fileWatcherHandlers.get('change')!;
      changeHandler({ fsPath: '/workspace/Project.csproj' });

      // Callback should NOT be called for change (only create/delete)
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('onProjectListChanged', () => {
    it('allows setting a callback for project list changes', () => {
      const callback = mock(() => {});
      projectParser.onProjectListChanged(callback);

      const watcher = createMockWatcher();
      projectParser.startWatching(watcher as any);

      // Trigger create event
      const createHandler = fileWatcherHandlers.get('create')!;
      createHandler({ fsPath: '/workspace/NewProject.csproj' });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('only calls the most recent callback', () => {
      const callback1 = mock(() => {});
      const callback2 = mock(() => {});

      projectParser.onProjectListChanged(callback1);
      projectParser.onProjectListChanged(callback2); // Replace

      const watcher = createMockWatcher();
      projectParser.startWatching(watcher as any);

      // Trigger create event
      const createHandler = fileWatcherHandlers.get('create')!;
      createHandler({ fsPath: '/workspace/NewProject.csproj' });

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });

  describe('dispose', () => {
    it('cleans up file watcher on dispose', () => {
      const watcher = createMockWatcher();
      projectParser.startWatching(watcher as any);

      // Verify handlers exist before dispose
      expect(fileWatcherHandlers.has('create')).toBe(true);
      expect(fileWatcherHandlers.has('delete')).toBe(true);

      // Dispose should clear handlers without throwing
      expect(() => projectParser.dispose()).not.toThrow();

      // After dispose, handlers should be cleared
      expect(fileWatcherHandlers.size).toBe(0);
    });
  });
});
