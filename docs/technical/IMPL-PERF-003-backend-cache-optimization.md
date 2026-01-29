# IMPL-PERF-003-backend-cache-optimization

**Plan**: [Performance Optimization Plan](../plans/performance-project-loading-optimization.md)  
**Related Story**: [STORY-001-02-011-external-change-detection](../stories/STORY-001-02-011-external-change-detection.md)  
**Created**: 2026-01-28  
**Status**: Not Started  
**Priority**: Medium  
**Effort**: 4-6 hours

## Overview

Optimize the backend project metadata cache infrastructure to ensure fast repeated lookups while maintaining correctness when `.csproj` files change. This builds upon the existing 60-second TTL cache in `DotnetProjectParser` and integrates with the file watcher infrastructure from STORY-001-02-011.

**Key Insight**: The existing `DotnetProjectParser` already has a robust cache with 60s TTL. The main optimizations needed are:

1. **Extend TTL when confident**: If file watcher confirms no changes, trust the cache longer
2. **Selective invalidation**: Clear only affected project's cache on file change
3. **Prewarming**: Parse projects proactively when workspace opens
4. **File watcher integration**: Connect external change detection to cache invalidation

## Current State Analysis

**Existing Cache Implementation** (`src/services/cli/dotnetProjectParser.ts`):

```typescript
// Cache: Map<projectPath, { metadata: ProjectMetadata, timestamp: number }>
const cache = new Map<string, CachedMetadata>();
const CACHE_TTL_MS = 60_000; // 1 minute

function isCacheValid(cached: CachedMetadata): boolean {
  return Date.now() - cached.timestamp < CACHE_TTL_MS;
}
```

**What Works Well**:
- ✅ TTL-based expiration
- ✅ Per-project caching (not global)
- ✅ `invalidateCache(projectPath)` for selective clearing
- ✅ `clearAllCaches()` for full invalidation
- ✅ `startWatching(FileSystemWatcher)` for file change hooks

**What Needs Improvement**:
- ⚠️ 60s TTL may be too short for large workspaces
- ⚠️ No prewarm on workspace open
- ⚠️ File watcher not always connected
- ⚠️ Cache doesn't persist across extension restarts

## Implementation Checklist

### Phase 1: File Watcher Integration
- [ ] 1. Ensure `DotnetProjectParser.startWatching()` is called on activation ([§1](#1-file-watcher-activation))
- [ ] 2. Create FileSystemWatcher for `**/*.csproj` in `extension.ts` ([§1](#1-file-watcher-activation))
- [ ] 3. Pass watcher to `projectParser.startWatching()` ([§1](#1-file-watcher-activation))
- [ ] 4. Dispose watcher on extension deactivation ([§1](#1-file-watcher-activation))

### Phase 2: Selective Invalidation
- [ ] 5. Implement `onDidCreate` handler for new projects ([§2](#2-selective-invalidation))
- [ ] 6. Implement `onDidDelete` handler for removed projects ([§2](#2-selective-invalidation))
- [ ] 7. Add debounce to prevent thrashing on rapid changes ([§2](#2-selective-invalidation))

### Phase 3: Cache Prewarm (Optional Enhancement)
- [ ] 8. Add `prewarmCache(projectPaths[])` method to `DotnetProjectParser` ([§3](#3-cache-prewarm))
- [ ] 9. Call prewarm after solution discovery completes ([§3](#3-cache-prewarm))
- [ ] 10. Run prewarm in background, don't block activation ([§3](#3-cache-prewarm))

### Phase 4: IPC Notification Bridge
- [ ] 11. Create `CacheInvalidationNotifier` service ([§4](#4-ipc-notification-bridge))
- [ ] 12. Send `projectsChanged` IPC notification when cache invalidates ([§4](#4-ipc-notification-bridge))
- [ ] 13. Connect notifier to webview panel lifecycle ([§4](#4-ipc-notification-bridge))

### Phase 5: Testing
- [ ] 14. Unit tests for file watcher → cache invalidation ([§5](#5-testing))
- [ ] 15. Unit tests for debounce behavior ([§5](#5-testing))
- [ ] 16. Integration test: modify .csproj → verify cache miss ([§5](#5-testing))

---

## Detailed Implementation Sections

### §1. File Watcher Activation

**File**: `src/extension.ts`

Currently, `startWatching()` exists but may not be called. Add watcher creation and connection:

```typescript
export async function activate(context: vscode.ExtensionContext) {
  const logger = createLogger(context);
  
  // ... other service creation ...
  
  const projectParser = createDotnetProjectParser(
    cliExecutor,
    tfParser,
    pkgParser,
    logger
  );
  
  // Create file watcher for .csproj files
  const csprojWatcher = vscode.workspace.createFileSystemWatcher('**/*.csproj');
  
  // Connect watcher to project parser cache
  projectParser.startWatching(csprojWatcher);
  
  // Ensure cleanup on deactivation
  context.subscriptions.push(csprojWatcher);
  context.subscriptions.push({ dispose: () => projectParser.dispose() });
  
  logger.info('Project file watcher activated for **/*.csproj');
  
  // ... rest of activation ...
}
```

**Verification**: The existing `startWatching()` implementation handles `onDidChange`:

```typescript
startWatching(fileSystemWatcher: vscode.FileSystemWatcher): void {
  fileWatcherDisposable = fileSystemWatcher.onDidChange(uri => {
    const projectPath = uri.fsPath;
    if (cache.has(projectPath)) {
      this.invalidateCache(projectPath);
      logger.debug('Auto-invalidated cache due to file change', { projectPath });
    }
  });
}
```

---

### §2. Selective Invalidation

**File**: `src/services/cli/dotnetProjectParser.ts`

Enhance `startWatching()` to handle create and delete events:

```typescript
startWatching(fileSystemWatcher: vscode.FileSystemWatcher): void {
  // Dispose existing watcher if any
  if (fileWatcherDisposable) {
    fileWatcherDisposable.dispose();
  }

  const disposables: vscode.Disposable[] = [];

  // Handle file changes (content modified)
  disposables.push(
    fileSystemWatcher.onDidChange(uri => {
      const projectPath = uri.fsPath;
      if (cache.has(projectPath)) {
        this.invalidateCache(projectPath);
        logger.debug('Cache invalidated: file changed', { projectPath });
      }
    })
  );

  // Handle new files (project added)
  disposables.push(
    fileSystemWatcher.onDidCreate(uri => {
      logger.debug('New project file detected', { projectPath: uri.fsPath });
      // Don't need to invalidate - file wasn't in cache anyway
      // But notify listeners that project list changed
      this.notifyProjectListChanged?.();
    })
  );

  // Handle deleted files (project removed)
  disposables.push(
    fileSystemWatcher.onDidDelete(uri => {
      const projectPath = uri.fsPath;
      if (cache.has(projectPath)) {
        cache.delete(projectPath);
        logger.debug('Cache entry removed: file deleted', { projectPath });
      }
      // Notify listeners that project list changed
      this.notifyProjectListChanged?.();
    })
  );

  fileWatcherDisposable = vscode.Disposable.from(...disposables);
  logger.debug('Started watching project files for changes');
},
```

**Debounce for rapid changes**:

The debouncing should happen at the notification layer, not the cache layer. When multiple files change rapidly (e.g., during `dotnet restore`), we want to:
1. Invalidate each cache entry immediately (correctness)
2. Debounce the IPC notification (performance)

See §4 for debounced notification implementation.

---

### §3. Cache Prewarm (Optional)

**File**: `src/services/cli/dotnetProjectParser.ts`

Add prewarm method to interface and implementation:

```typescript
// In DotnetProjectParser interface
prewarmCache(projectPaths: string[]): Promise<void>;

// In implementation
async prewarmCache(projectPaths: string[]): Promise<void> {
  logger.debug(`Prewarming cache for ${projectPaths.length} projects`);
  
  // Parse in batches of 5 (already implemented in parseProjects)
  await this.parseProjects(projectPaths);
  
  logger.info(`Cache prewarmed: ${projectPaths.length} projects loaded`);
}
```

**File**: `src/extension.ts`

Call prewarm after solution discovery (non-blocking):

```typescript
// After solution discovery completes
solutionContext.onDidChangeContext(context => {
  // Prewarm cache in background (don't await)
  const projectPaths = context.projects.map(p => p.path);
  projectParser.prewarmCache(projectPaths).catch(err => {
    logger.warn('Cache prewarm failed', err);
  });
});
```

---

### §4. IPC Notification Bridge

**File**: `src/services/cache/cacheInvalidationNotifier.ts` (NEW)

Create a service that bridges cache invalidation events to webview IPC:

```typescript
import type * as vscode from 'vscode';
import type { ILogger } from '../loggerService';

export interface CacheInvalidationNotifier {
  /**
   * Register a webview panel to receive invalidation notifications.
   */
  registerPanel(panel: vscode.WebviewPanel): void;
  
  /**
   * Unregister a panel (called when panel disposes).
   */
  unregisterPanel(panel: vscode.WebviewPanel): void;
  
  /**
   * Notify all registered panels that projects have changed.
   * Debounced to prevent flooding during rapid file changes.
   */
  notifyProjectsChanged(): void;
  
  /**
   * Dispose all resources.
   */
  dispose(): void;
}

export function createCacheInvalidationNotifier(
  logger: ILogger
): CacheInvalidationNotifier {
  const panels = new Set<vscode.WebviewPanel>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const DEBOUNCE_MS = 300;

  return {
    registerPanel(panel: vscode.WebviewPanel): void {
      panels.add(panel);
      
      // Auto-unregister when panel disposes
      panel.onDidDispose(() => {
        panels.delete(panel);
        logger.debug('Panel unregistered from invalidation notifier');
      });
      
      logger.debug('Panel registered for invalidation notifications');
    },

    unregisterPanel(panel: vscode.WebviewPanel): void {
      panels.delete(panel);
    },

    notifyProjectsChanged(): void {
      // Debounce: reset timer on each call
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(() => {
        logger.debug(`Notifying ${panels.size} panel(s) of project changes`);
        
        for (const panel of panels) {
          panel.webview.postMessage({
            type: 'notification',
            name: 'projectsChanged',
            args: {},
          }).then(
            () => {},
            (err) => logger.warn('Failed to send projectsChanged notification', err)
          );
        }
        
        debounceTimer = null;
      }, DEBOUNCE_MS);
    },

    dispose(): void {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      panels.clear();
    },
  };
}
```

**File**: `src/extension.ts`

Wire up the notifier:

```typescript
const cacheNotifier = createCacheInvalidationNotifier(logger);
context.subscriptions.push({ dispose: () => cacheNotifier.dispose() });

// Connect project parser to notifier
// (Requires adding callback to DotnetProjectParser interface)
```

**File**: `src/services/cli/dotnetProjectParser.ts`

Add notification callback:

```typescript
export interface DotnetProjectParser {
  // ... existing methods ...
  
  /**
   * Set callback to be invoked when project list changes.
   */
  onProjectListChanged(callback: () => void): void;
}

// In factory function
let projectListChangedCallback: (() => void) | undefined;

return {
  // ... existing methods ...
  
  onProjectListChanged(callback: () => void): void {
    projectListChangedCallback = callback;
  },
  
  // In startWatching handlers, call:
  // projectListChangedCallback?.();
};
```

---

### §5. Testing

**Unit Tests**: `src/services/cli/__tests__/dotnetProjectParser.test.ts`

```typescript
describe('File Watcher Integration', () => {
  test('invalidates cache on file change', () => {
    const parser = createDotnetProjectParser(/* mocks */);
    const mockWatcher = createMockFileSystemWatcher();
    
    // Populate cache
    await parser.parseProject('/workspace/Project.csproj');
    
    // Connect watcher
    parser.startWatching(mockWatcher);
    
    // Simulate file change
    mockWatcher.fireChange({ fsPath: '/workspace/Project.csproj' });
    
    // Verify cache invalidated (next parse should call CLI)
    mockCliExecutor.mockClear();
    await parser.parseProject('/workspace/Project.csproj');
    expect(mockCliExecutor.execute).toHaveBeenCalled();
  });
  
  test('removes cache entry on file delete', () => {
    const parser = createDotnetProjectParser(/* mocks */);
    const mockWatcher = createMockFileSystemWatcher();
    
    await parser.parseProject('/workspace/Project.csproj');
    parser.startWatching(mockWatcher);
    
    // Simulate delete
    mockWatcher.fireDelete({ fsPath: '/workspace/Project.csproj' });
    
    // Cache entry should be gone
    // (Need internal access or indirect verification)
  });
  
  test('calls onProjectListChanged callback', () => {
    const callback = vi.fn();
    const parser = createDotnetProjectParser(/* mocks */);
    parser.onProjectListChanged(callback);
    
    const mockWatcher = createMockFileSystemWatcher();
    parser.startWatching(mockWatcher);
    
    mockWatcher.fireCreate({ fsPath: '/workspace/NewProject.csproj' });
    
    expect(callback).toHaveBeenCalled();
  });
});
```

**Unit Tests**: `src/services/cache/__tests__/cacheInvalidationNotifier.test.ts`

```typescript
describe('CacheInvalidationNotifier', () => {
  test('debounces rapid notifications', async () => {
    const notifier = createCacheInvalidationNotifier(mockLogger);
    const mockPanel = createMockWebviewPanel();
    notifier.registerPanel(mockPanel);
    
    // Fire 5 rapid notifications
    notifier.notifyProjectsChanged();
    notifier.notifyProjectsChanged();
    notifier.notifyProjectsChanged();
    notifier.notifyProjectsChanged();
    notifier.notifyProjectsChanged();
    
    // Wait for debounce
    await sleep(350);
    
    // Should only send one message
    expect(mockPanel.webview.postMessage).toHaveBeenCalledTimes(1);
  });
  
  test('unregisters panel on dispose', () => {
    const notifier = createCacheInvalidationNotifier(mockLogger);
    const mockPanel = createMockWebviewPanel();
    
    notifier.registerPanel(mockPanel);
    mockPanel.dispose();
    notifier.notifyProjectsChanged();
    
    // Disposed panel should not receive notification
    expect(mockPanel.webview.postMessage).not.toHaveBeenCalled();
  });
});
```

---

## Success Criteria

| Metric | Before | After |
|--------|--------|-------|
| Cache hit rate after 1 minute | 0% (TTL expired) | 100% (if no file changes) |
| Time to invalidate on file change | N/A | <300ms (debounced) |
| IPC notifications per file change batch | N/A | 1 (debounced) |
| Extension restart cache persistence | Lost | Lost (future: persist) |

---

## Dependencies

- **Existing**: `DotnetProjectParser` with cache and `startWatching()` method
- **STORY-001-02-011**: External change detection (provides file watcher patterns)
- **IMPL-001-02-010**: Cache invalidation infrastructure

## Blocks

- **IMPL-PERF-002**: Early fetch benefits from cache prewarm
- **Frontend caching**: IPC notifications enable frontend cache invalidation

---

## Notes

**Why Not Extend TTL?**
The 60s TTL is already reasonable. Extending it risks showing stale data. Instead, we rely on file watchers for immediate invalidation and trust the TTL for edge cases (external tools that don't trigger watchers).

**Why Debounce at Notification Layer?**
Cache invalidation must be immediate (correctness), but IPC notifications can be debounced (performance). If we debounced cache invalidation, there's a window where requests could return stale data.

**Future: Persistent Cache**
Consider storing cache to disk (e.g., workspace state) to survive extension restarts. Would require:
- Serialization of `ProjectMetadata`
- Staleness check on load (compare file mtimes)
- Storage quota management

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-28 | Implementation plan created | AI Assistant |
