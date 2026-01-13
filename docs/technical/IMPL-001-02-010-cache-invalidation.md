# IMPL-001-02-010-cache-invalidation

**Story**: [STORY-001-02-010-cache-invalidation](../stories/STORY-001-02-010-cache-invalidation.md)  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Created**: 2026-01-11  
**Status**: Not Started

## Overview

This implementation plan details the cache invalidation and UI refresh mechanism that ensures the package browser webview and installed packages tree view display accurate installation state after package operations. The system coordinates between three components: the project parser's in-memory cache, the install command's orchestration layer, and the webview's reactive state management.

**Core Flow**: When `dotnet add package` succeeds → invalidate project metadata cache (all entries) → send IPC notification `projectsChanged` to webview → webview re-requests project list → project parser re-executes CLI commands for fresh metadata → fresh metadata returned → UI transforms checkboxes to ✓ icons → tree view refreshes.

**Key Design Decisions**:
- **Complete invalidation**: Clear all project metadata cache entries on successful install (start simple, optimize later if needed)
- **Single invalidation point**: Trigger once after all multi-project installs complete, not per-project
- **Event-driven refresh**: Use IPC notifications rather than polling for webview updates
- **Idempotent operations**: Cache invalidation is safe to call multiple times
- **File watcher integration**: Leverage existing file watcher to handle external .csproj changes

**Note**: The current `DotnetProjectParser` uses simple `projectPath` cache keys, not prefixed patterns. We'll use the existing `clearAllCaches()` method for initial implementation.

## Implementation Checklist

### Phase 1: Cache Infrastructure
- [ ] 1. Verify existing `clearAllCaches()` method in `DotnetProjectParser` interface ([§1](#1-cache-invalidation-method))
- [ ] 2. Add unit tests for cache invalidation behavior ([§2](#2-cache-invalidation-tests))

### Phase 2: Install Command Integration
- [ ] 3. Add `DotnetProjectParser` injection to `InstallPackageCommand` constructor ([§3](#3-constructor-injection))
- [ ] 4. Update `InstallPackageCommand` to call cache invalidation after successful install ([§4](#4-install-command-hooks))
- [ ] 5. Add conditional logic to skip invalidation on total failure ([§5](#5-conditional-invalidation))
- [ ] 6. Add `ProjectsChangedNotification` type to webview types.ts ([§6](#6-type-definitions))
- [ ] 7. Implement IPC notification `projectsChanged` after cache invalidation ([§7](#7-ipc-notification))
- [ ] 8. Add logging for cache invalidation triggers ([§8](#8-logging-strategy))
- [ ] 9. Add unit tests for install command cache coordination ([§9](#9-install-command-tests))

### Phase 3: Webview Message Handling
- [ ] 10. Add `projectsChanged` notification handler in `packageBrowserWebview.ts` ([§10](#10-webview-notification-handler))
- [ ] 11. Trigger `getProjects` re-request from webview client on notification ([§11](#11-client-side-refresh))
- [ ] 12. Update `<project-selector>` to handle project list updates ([§12](#12-project-selector-updates))
- [ ] 13. Transform checkbox rows to ✓ icon rows for newly installed packages ([§13](#13-ui-transformation))
- [ ] 14. Update "✓ Installed (X)" badge count based on fresh data ([§14](#14-badge-count-update))
- [ ] 15. Add unit tests for webview message handling ([§15](#15-webview-message-tests))

### Phase 4: Tree View Refresh [DEFERRED]
- [ ] 16. ~~Add `refresh()` call to installed packages tree view after invalidation~~ **BLOCKED: Tree view not implemented yet (STORY-001-03-001)**
- [ ] 17. Add TODO comment in `installPackageCommand.ts` for future tree view refresh hook ([§16](#16-tree-view-refresh-placeholder))

**Note**: Tree view integration will be completed in STORY-001-03-001-installed-packages-tree-view.

### Phase 5: Error Handling & Edge Cases
- [ ] 18. Handle concurrent install operations and cache invalidation ([§17](#17-concurrency-handling))
- [ ] 19. Implement error handling for failed IPC notifications ([§18](#18-ipc-error-handling))
- [ ] 20. Add logging for cache invalidation failures and race conditions ([§19](#19-error-logging))
- [ ] 21. Test partial installation failures (skip cache invalidation for failed projects) ([§20](#20-partial-failure-handling))

### Phase 6: Integration & E2E Testing
- [ ] 22. Add integration tests for end-to-end cache invalidation flow ([§21](#21-integration-tests))
- [ ] 23. Add integration tests for file watcher invalidation ([§22](#22-file-watcher-tests))
- [ ] 24. Add E2E tests for UI transformation after install ([§23](#23-e2e-ui-tests))
- [ ] 25. Add E2E tests for concurrent install operations ([§24](#24-e2e-concurrency-tests))

### Phase 7: Documentation & Cleanup
- [ ] 26. Update technical documentation with cache invalidation patterns ([§25](#25-documentation))
- [ ] 27. Add JSDoc comments to all new public APIs ([§26](#26-jsdoc-comments))
- [ ] 28. Review and optimize cache invalidation performance ([§27](#27-performance-optimization))

---

## Detailed Implementation Sections

### §1. Verify Existing Cache Invalidation Method

**File**: `src/services/cli/dotnetProjectParser.ts`

**Reality Check**: `DotnetProjectParser` is an **interface** (not a class), and the implementation is created by a factory function `createDotnetProjectParser()`. The interface already has a `clearAllCaches()` method that we'll use.

**Current Interface** (lines 26-67):
```typescript
export interface DotnetProjectParser {
  parseProject(projectPath: string): Promise<ProjectParseResult>;
  parseProjects(projectPaths: string[]): Promise<Map<string, ProjectParseResult>>;
  invalidateCache(projectPath: string): void;  // ← Clears single project
  clearAllCaches(): void;  // ← Clears ALL cached metadata ✅
  startWatching(fileSystemWatcher: vscode.FileSystemWatcher): void;
  dispose(): void;
}
```

**Implementation Verification** (lines 220-230):
```typescript
return {
  // ...
  clearAllCaches(): void {
    cache.clear();
    logger.debug('Cleared all project metadata caches');
  },
  // ...
};
```

**Decision**: Use the existing `clearAllCaches()` method. The current cache uses simple `projectPath` keys (not prefixed patterns like `installed:*`), so selective invalidation would require refactoring the cache key structure. Start with full invalidation for simplicity.

**Future Optimization**: If performance profiling shows cache invalidation is a bottleneck, we can:
1. Add cache key prefixes (`installed:`, `frameworks:`, etc.)
2. Implement selective pattern matching with `minimatch`
3. Track this as a separate story

**No code changes needed for this section** - method already exists!

### §2. Cache Invalidation Tests

**File**: `src/services/cli/__tests__/dotnetProjectParser.test.ts`

```typescript
describe('clearAllCaches', () => {
  test('removes all cached project metadata', async () => {
    const mockLogger = createMockLogger();
    const mockExecutor = createMockCliExecutor();
    const mockTfParser = createMockTargetFrameworkParser();
    const mockPkgParser = createMockPackageReferenceParser();
    
    const parser = createDotnetProjectParser(
      mockExecutor,
      mockTfParser,
      mockPkgParser,
      mockLogger
    );
    
    // Pre-populate cache by parsing projects
    await parser.parseProject('/workspace/Project1.csproj');
    await parser.parseProject('/workspace/Project2.csproj');
    
    // Verify cache is populated (subsequent calls should be instant)
    const start = Date.now();
    await parser.parseProject('/workspace/Project1.csproj');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10); // Cache hit is near-instant
    
    // Clear all caches
    parser.clearAllCaches();
    
    // Verify cache is empty (next call should execute CLI again)
    mockExecutor.execute.mockClear();
    await parser.parseProject('/workspace/Project1.csproj');
    expect(mockExecutor.execute).toHaveBeenCalled(); // Cache miss triggers CLI
  });
  
  test('logs cache clear operation', () => {
    const mockLogger = createMockLogger();
    const parser = createDotnetProjectParser(
      createMockCliExecutor(),
      createMockTargetFrameworkParser(),
      createMockPackageReferenceParser(),
      mockLogger
    );
    
    parser.clearAllCaches();
    
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Cleared all project metadata caches'
    );
  });
});
```

### §3. Constructor Injection

**File**: `src/commands/installPackageCommand.ts` (lines 67-69)

**Current Constructor**:
```typescript
export class InstallPackageCommand {
  static readonly id = 'opm.installPackage';

  constructor(
    private readonly packageCliService: PackageCliService,
    private readonly logger: ILogger
  ) {}
}
```

**Updated Constructor** (add `projectParser` parameter):
```typescript
export class InstallPackageCommand {
  static readonly id = 'opm.installPackage';

  constructor(
    private readonly packageCliService: PackageCliService,
    private readonly logger: ILogger,
    private readonly projectParser: DotnetProjectParser,  // ← NEW
  ) {}
}
```

**File**: `src/extension.ts`

Update command instantiation to inject `projectParser`:

```typescript
// Create services
const logger = createLogger(context);
const cliExecutor = createDotnetCliExecutor(logger);
const tfParser = createTargetFrameworkParser(logger);
const pkgParser = createPackageReferenceParser(logger);
const projectParser = createDotnetProjectParser(
  cliExecutor,
  tfParser,
  pkgParser,
  logger
);  // ← Already exists
const packageCliService = createPackageCliService(cliExecutor, logger);

// Create command with injected dependencies
const installCommand = new InstallPackageCommand(
  packageCliService,
  logger,
  projectParser  // ← ADD THIS
);
```

**File**: `src/commands/installPackageCommand.ts` (around line 151)

**Current TODO** (line 151):
```typescript
// TODO: Invalidate cache on success (STORY-001-02-010)
// TODO: Refresh tree view (when InstalledPackagesProvider is available)

return {
  success: successCount > 0,
  results,
};
```

**Updated Implementation**:
```typescript
// Invalidate cache on success
if (successCount > 0) {
  this.logger.info(
    `Cache invalidation triggered: ${successCount}/${results.length} installations succeeded`
  );
  this.projectParser.clearAllCaches();
} else {
  this.logger.warn(
    'Skipping cache invalidation: all installations failed'
  );
}

// TODO: Refresh tree view (when InstalledPackagesProvider is available - STORY-001-03-001)

return {
  success: successCount > 0,
  results,
};
```

**Note**: We're NOT sending IPC notifications here because `InstallPackageCommand` is called FROM the webview via IPC. The webview already knows the install completed (it receives the response). We'll handle webview refresh in the webview's install response handler instead.

### §5. Conditional Invalidation

**File**: `src/commands/installPackageCommand.ts`

Skip cache invalidation when all installations fail to preserve current state:

```typescript
// Only invalidate cache if at least one installation succeeded
const successCount = results.filter(r => r.success).length;

if (successCount > 0) {
  this.logger.info(
    `Cache invalidation triggered: ${successCount}/${results.length} installations succeeded`
  );
  await this.invalidateCacheAndRefresh(packageId, version);
} else {
  this.logger.warn(
    'Skipping cache invalidation: all installations failed'
  );
}
```

### §6. Type Definitions

**File**: `src/webviews/apps/packageBrowser/types.ts`

Add the `ProjectsChangedNotification` interface to the IPC message types (after the existing notification types around line 330):

```typescript
/**
 * Host → Webview: Projects list changed notification
 * 
 * Sent after successful package installation to signal the webview
 * should refresh its project list to show updated installation state.
 */
export interface ProjectsChangedNotification {
  type: 'notification';
  name: 'projectsChanged';
  args: {
    /** Package ID that was installed */
    packageId: string;
    /** Package version that was installed */
    version: string;
  };
}

/**
 * Type guard for ProjectsChangedNotification
 */
export function isProjectsChangedNotification(
  msg: unknown
): msg is ProjectsChangedNotification {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type: unknown }).type === 'notification' &&
    (msg as { name: unknown }).name === 'projectsChanged'
  );
}
```

### §7. IPC Notification

**File**: `src/webviews/packageBrowserWebview.ts`

**Strategy Change**: Instead of sending notifications from `InstallPackageCommand`, we'll send the notification from the webview's install response handler. This is simpler because:
1. The install command is called FROM the webview via IPC
2. The webview already receives the install response
3. The webview can trigger its own refresh without needing the host to notify it

**Implementation** (in `handleWebviewMessage` function, after handling `installPackageRequest`):

```typescript
// Handle install package request
if (isInstallPackageRequestMessage(message)) {
  // ... existing install logic ...
  
  // Send response
  const response: InstallPackageResponseMessage = {
    type: 'notification',
    name: 'installPackageResponse',
    args: { /* ... */ },
  };
  await panel.webview.postMessage(response);
  
  // If any installs succeeded, send projectsChanged notification
  const successCount = installResult.results.filter(r => r.success).length;
  if (successCount > 0) {
    const projectsChangedNotification: ProjectsChangedNotification = {
      type: 'notification',
      name: 'projectsChanged',
      args: {
        packageId: message.payload.packageId,
        version: message.payload.version,
      },
    };
    await panel.webview.postMessage(projectsChangedNotification);
    logger.debug('Sent projectsChanged notification to webview');
  }
  
  return;
}
```

**Alternative**: If you prefer to send from the command layer, update `InstallPackageCommand` constructor to accept optional `webviewPanel` parameter and call `postMessage` after cache invalidation.

### §8. Logging Strategy

**Logging Points**:
1. **Cache invalidation trigger**: Log when install command calls `clearAllCaches()`
2. **Cache invalidation execution**: Logged by `clearAllCaches()` method itself
3. **IPC notification sent**: Log when `projectsChanged` notification sent to webview
4. **Webview notification received**: Log in webview client when notification arrives
5. **Fresh data fetched**: Log when webview re-requests project list via `getProjects`
6. **UI transformation**: Log count of checkbox → ✓ icon transformations

**Log Levels**:
- `debug`: IPC message payloads, cache clearing confirmation, project list refresh details
- `info`: High-level cache invalidation triggers ("X/Y installs succeeded"), successful refreshes
- `warn`: Skipped invalidation (all failures)
- `error`: IPC notification failures (shouldn't happen in current design)

### §9. Install Command Tests

**File**: `src/commands/__tests__/installPackageCommand.test.ts`

```typescript
describe('cache invalidation', () => {
  test('clears cache after successful single-project install', async () => {
    const mockProjectParser = {
      clearAllCaches: jest.fn(),
      parseProject: jest.fn(),
      parseProjects: jest.fn(),
      invalidateCache: jest.fn(),
      startWatching: jest.fn(),
      dispose: jest.fn(),
    };
    
    const cmd = new InstallPackageCommand(
      mockPackageCliService,
      mockLogger,
      mockProjectParser
    );
    
    mockPackageCliService.addPackage.mockResolvedValue({
      success: true,
    });
    
    const params: InstallPackageParams = {
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      projectPaths: ['/path/to/project.csproj'],
    };
    
    await cmd.execute(params);
    
    expect(mockProjectParser.clearAllCaches).toHaveBeenCalledTimes(1);
  });
  
  test('clears cache once after multi-project install with mixed results', async () => {
    const mockProjectParser = { clearAllCaches: jest.fn(), /* ... */ };
    const cmd = new InstallPackageCommand(
      mockPackageCliService,
      mockLogger,
      mockProjectParser
    );
    
    // Mock 3 installs: 2 success, 1 failure
    mockPackageCliService.addPackage
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: { code: 'NetworkError', message: 'Timeout' } })
      .mockResolvedValueOnce({ success: true });
    
    const params: InstallPackageParams = {
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      projectPaths: [
        '/path/to/project1.csproj',
        '/path/to/project2.csproj',
        '/path/to/project3.csproj',
      ],
    };
    
    await cmd.execute(params);
    
    // Cache cleared once (not per-project)
    expect(mockProjectParser.clearAllCaches).toHaveBeenCalledTimes(1);
  });
  
  test('does not clear cache when all installations fail', async () => {
    const mockProjectParser = { clearAllCaches: jest.fn(), /* ... */ };
    const cmd = new InstallPackageCommand(
      mockPackageCliService,
      mockLogger,
      mockProjectParser
    );
    
    mockPackageCliService.addPackage.mockResolvedValue({
      success: false,
      error: { code: 'NotFound', message: 'Package not found' },
    });
    
    const params: InstallPackageParams = {
      packageId: 'NonExistent.Package',
      version: '1.0.0',
      projectPaths: ['/path/to/project.csproj'],
    };
    
    await cmd.execute(params);
    
    expect(mockProjectParser.clearAllCaches).not.toHaveBeenCalled();
  });
});
```

### §10. Webview Notification Handler

**File**: `src/webviews/packageBrowserWebview.ts`

**Pattern**: Add notification sending in the existing `handleWebviewMessage` function after successful install response. The webview client will handle the notification to trigger refresh.

**Current Pattern** (around line 500 in packageBrowserWebview.ts):
```typescript
if (isInstallPackageRequestMessage(message)) {
  // Execute install command
  const installResult = await installCommand.execute({
    packageId: message.payload.packageId,
    version: message.payload.version,
    projectPaths: message.payload.projectPaths,
  });
  
  // Send response
  const response: InstallPackageResponseMessage = {
    type: 'notification',
    name: 'installPackageResponse',
    args: {
      packageId: message.payload.packageId,
      version: message.payload.version,
      success: installResult.success,
      results: installResult.results,
      requestId: message.payload.requestId,
    },
  };
  await panel.webview.postMessage(response);
  return;
}
```

**Updated Implementation**:
```typescript
if (isInstallPackageRequestMessage(message)) {
  // Execute install command (cache invalidation happens inside command.execute())
  const installResult = await installCommand.execute({
    packageId: message.payload.packageId,
    version: message.payload.version,
    projectPaths: message.payload.projectPaths,
  });
  
  // Send response
  const response: InstallPackageResponseMessage = {
    type: 'notification',
    name: 'installPackageResponse',
    args: {
      packageId: message.payload.packageId,
      version: message.payload.version,
      success: installResult.success,
      results: installResult.results,
      requestId: message.payload.requestId,
    },
  };
  await panel.webview.postMessage(response);
  
  // If any installs succeeded, notify webview client to refresh project list
  const successCount = installResult.results.filter(r => r.success).length;
  if (successCount > 0) {
    const projectsChangedNotification: ProjectsChangedNotification = {
      type: 'notification',
      name: 'projectsChanged',
      args: {
        packageId: message.payload.packageId,
        version: message.payload.version,
      },
    };
    await panel.webview.postMessage(projectsChangedNotification);
    logger.debug('Sent projectsChanged notification to webview client');
  }
  
  return;
}
```

**Import Update** (add to top of file):
```typescript
import type {
  // ... existing imports ...
  ProjectsChangedNotification,  // ← ADD THIS
} from './apps/packageBrowser/types';
```

### §11. Client-Side Refresh

**File**: `src/webviews/apps/packageBrowser/main.ts` (or wherever webview client listens to messages)

Handle the `projectsChanged` notification in the webview client code to trigger a project list refresh:

```typescript
// Listen for messages from the host
window.addEventListener('message', (event) => {
  const message = event.data;
  
  // ... existing message handlers ...
  
  // Handle projectsChanged notification
  if (isProjectsChangedNotification(message)) {
    console.log(
      `Received projectsChanged notification for ${message.args.packageId}@${message.args.version}`
    );
    
    // Trigger project list refresh with debounce
    debouncedRefreshProjects();
  }
});

// Debounced refresh function (300ms delay)
let refreshTimer: number | undefined;
function debouncedRefreshProjects() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }
  
  refreshTimer = window.setTimeout(() => {
    // Trigger getProjects request
    vscode.postMessage({
      type: 'getProjects',
      payload: { requestId: generateId() },
    });
  }, 300);
}
```

**Note**: The exact implementation depends on your webview client architecture. If using Lit components, this might be in a state management service or the root app component.

### §12. Project Selector Updates

**File**: `src/webviews/apps/package-browser/components/project-selector.ts`

Update the `<project-selector>` component to handle project list updates:

```typescript
@customElement(PROJECT_SELECTOR_TAG)
export class ProjectSelector extends LitElement {
  @property({ type: Array })
  projects: ProjectInfo[] = [];
  
  @property({ type: String })
  packageId: string = '';
  
  updated(changedProperties: PropertyValues) {
    if (changedProperties.has('projects')) {
      this.handleProjectListUpdate();
    }
  }
  
  private handleProjectListUpdate(): void {
    // Compare new project list to current selection state
    const previouslySelected = new Set(this.selectedProjectPaths);
    const nowInstalled = new Set(
      this.projects
        .filter(p => p.installedVersion)
        .map(p => p.path)
    );
    
    // Find projects that transitioned from selected → installed
    const newlyInstalled = Array.from(nowInstalled).filter(path =>
      previouslySelected.has(path)
    );
    
    if (newlyInstalled.length > 0) {
      console.log(
        `UI transformation: ${newlyInstalled.length} checkboxes → ✓ icons`
      );
      
      // Clear selection for newly installed projects
      this.selectedProjectPaths = this.selectedProjectPaths.filter(
        path => !nowInstalled.has(path)
      );
      
      // Update badge count
      this.updateBadgeCount();
    }
  }
}
```

### §13. UI Transformation

**Transformation Logic**:
1. **Detect change**: Compare previous `projects` prop to new `projects` prop
2. **Identify transitions**: Find projects where `installedVersion` changed from `undefined` to a version string
3. **Remove from selection**: Clear these projects from `selectedProjectPaths` state
4. **Re-render**: Lit's reactive rendering automatically transforms checkbox rows to ✓ icon rows

**Visual Feedback**: Consider adding a brief CSS transition (fade/highlight) when rows transform to draw user attention.

### §14. Badge Count Update

**File**: `src/webviews/apps/package-browser/components/project-selector.ts`

```typescript
private updateBadgeCount(): void {
  const installedCount = this.projects.filter(p => p.installedVersion).length;
  
  this.installedBadgeCount = installedCount;
  
  // Update header text
  if (installedCount > 0) {
    this.headerBadge = `✓ Installed (${installedCount})`;
    this.expanded = true; // Auto-expand when installed
  } else {
    this.headerBadge = '';
  }
}
```

### §14. Badge Count Update

**File**: `src/webviews/apps/package-browser/components/project-selector.ts`

```typescript
private updateBadgeCount(): void {
  const installedCount = this.projects.filter(p => p.installedVersion).length;
  
  this.installedBadgeCount = installedCount;
  
  // Update header text
  if (installedCount > 0) {
    this.headerBadge = `✓ Installed (${installedCount})`;
    this.expanded = true; // Auto-expand when installed
  } else {
    this.headerBadge = '';
  }
}
```

### §15. Webview Message Tests

**File**: `src/webviews/__tests__/packageBrowserWebview.test.ts`

Add tests for `projectsChanged` notification handling:

```typescript
test('sends projectsChanged notification after successful install', async () => {
  const panel = createMockWebviewPanel();
  
  // Simulate install request
  const installMessage: InstallPackageRequestMessage = {
    type: 'installPackageRequest',
    payload: {
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      projectPaths: ['/test/project.csproj'],
      requestId: 'test-req-123',
    },
  };
  
  await handleWebviewMessage(installMessage, panel, mockLogger, /* ... */);
  
  // Verify two messages sent: response + notification
  expect(panel.webview.postMessage).toHaveBeenCalledTimes(2);
  
  // Verify projectsChanged notification
  const notifications = panel.webview.postMessage.mock.calls;
  const projectsChangedMsg = notifications.find(
    ([msg]) => msg.name === 'projectsChanged'
  );
  expect(projectsChangedMsg).toBeDefined();
  expect(projectsChangedMsg[0].args).toMatchObject({
    packageId: 'Newtonsoft.Json',
    version: '13.0.3',
  });
});
```

### §16. Tree View Refresh Placeholder

**File**: `src/webviews/apps/package-browser/state/__tests__/project-state.test.ts`

```typescript
describe('ProjectStateManager', () => {
  test('handles projectsChanged notification and refreshes project list', async () => {
    const manager = new ProjectStateManager(mockIpcClient, mockLogger);
    mockIpcClient.request.mockResolvedValue([
      { name: 'MyApp', path: '/project.csproj', installedVersion: '13.0.3' }
    ]);
    
    // Trigger notification
    mockIpcClient.emit('notification', 'projectsChanged', {
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      timestamp: Date.now()
    });
    
    // Wait for debounce
    await delay(350);
    
    expect(mockIpcClient.request).toHaveBeenCalledWith('getProjects', {
      workspacePath: expect.any(String)
    });
  });
  
  test('debounces multiple rapid projectsChanged notifications', async () => {
    const manager = new ProjectStateManager(mockIpcClient, mockLogger);
    
    // Send 3 notifications within 200ms
    mockIpcClient.emit('notification', 'projectsChanged', { timestamp: 0 });
    await delay(50);
    mockIpcClient.emit('notification', 'projectsChanged', { timestamp: 50 });
    await delay(50);
    mockIpcClient.emit('notification', 'projectsChanged', { timestamp: 100 });
    
    // Wait for debounce
    await delay(350);
    
    // Should only trigger 1 refresh
    expect(mockIpcClient.request).toHaveBeenCalledTimes(1);
  });
});
```

### §15. Tree View Refresh

**File**: `src/commands/installPackageCommand.ts`

```typescript
private async invalidateCacheAndRefresh(
  packageId: string,
  version: string
): Promise<void> {
  // ... cache invalidation ...
  
  // Refresh installed packages tree view
  if (this.installedPackagesTreeView) {
    this.installedPackagesTreeView.refresh();
    this.logger.debug('Triggered tree view refresh after cache invalidation');
  } else {
    this.logger.warn('Tree view not available for refresh');
  }
}
```

**Tree View Implementation**:
```typescript
export class InstalledPackagesTreeView implements vscode.TreeDataProvider<PackageNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<PackageNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  refresh(node?: PackageNode): void {
    this._onDidChangeTreeData.fire(node);
  }
}
```

### §16. Webview Closed Handling

**Scenario**: User installs package via tree view context menu (webview not open).

**Implementation**: Cache invalidation still executes, but IPC notification has no target webview. When user later opens package browser:
1. `getProjects` IPC request executes
2. Cache is already invalidated, so fresh data is fetched
3. UI renders with correct installation state

**Test**: Integration test that installs package with webview closed, then opens webview and verifies correct state.

### §17. Tree View Tests

**File**: `src/views/__tests__/installedPackagesTreeView.test.ts`

```typescript
describe('InstalledPackagesTreeView', () => {
  test('refresh() triggers onDidChangeTreeData event', () => {
    const treeView = new InstalledPackagesTreeView(mockDomainService, mockLogger);
    const listener = jest.fn();
    
    treeView.onDidChangeTreeData(listener);
    treeView.refresh();
    
    expect(listener).toHaveBeenCalledWith(undefined);
  });
  
  test('refresh(node) triggers selective refresh for specific node', () => {
    const treeView = new InstalledPackagesTreeView(mockDomainService, mockLogger);
    const listener = jest.fn();
    const node = new PackageNode('Newtonsoft.Json', '13.0.3');
    
    treeView.onDidChangeTreeData(listener);
    treeView.refresh(node);
    
    expect(listener).toHaveBeenCalledWith(node);
  });
});
```

### §18. Concurrency Handling

**Scenario**: User starts installing Package A, then immediately starts installing Package B before A completes.

**Behavior**:
1. Package A install completes → clears cache → sends `projectsChanged` notification
2. Package B install completes → clears cache again → sends another `projectsChanged` notification
3. Webview client receives both notifications within 300ms → debouncer fires once → single refresh

**Safety**: Cache invalidation is idempotent (calling `clearAllCaches()` multiple times has same effect as calling once). The client-side debouncer prevents excessive IPC calls.

### §18. IPC Error Handling

**File**: `src/commands/installPackageCommand.ts`

```typescript
private async sendWebviewNotification(
  name: string,
  args: Record<string, unknown>
): Promise<void> {
  const panels = this.webviewManager.getActivePanels('packageBrowser');
  
  if (panels.length === 0) {
    this.logger.debug(
      `No active webview panels to receive '${name}' notification`
    );
    return;
  }
  
  const errors: Error[] = [];
  
  for (const panel of panels) {
    try {
      await panel.webview.postMessage(message);
      this.logger.debug(`Sent IPC notification '${name}' to webview`);
    } catch (error) {
      errors.push(error as Error);
      this.logger.error(
        `Failed to send IPC notification '${name}' to webview`,
        error
      );
    }
  }
  
  // Don't throw if some notifications succeed - partial success is acceptable
  if (errors.length > 0 && errors.length === panels.length) {
    throw new Error(
      `Failed to send IPC notification to all ${panels.length} webview panels`
    );
  }
}
```

### §19. Error Logging

**Error Scenarios to Log**:
1. Cache clear throws exception (shouldn't happen with Map.clear(), but log anyway)
2. IPC notification fails (webview disposed mid-send)
3. Webview client refresh fails (could happen if `getProjects` request errors)

**Log Format**:
```typescript
this.logger.error(
  'Cache invalidation failed',
  error instanceof Error ? error : new Error(String(error))
);
```

### §20. Partial Failure Handling

**File**: `src/commands/installPackageCommand.ts`

```typescript
const results = await this.domainService.installPackage(
  packageId,
  version,
  projectPaths
);

// Count successes and failures
const successes = results.filter(r => r.success);
const failures = results.filter(r => !r.success);

if (successes.length > 0) {
  this.logger.info(
    `Cache invalidation triggered: ${successes.length} succeeded, ${failures.length} failed`
  );
  
  await this.invalidateCacheAndRefresh(packageId, version);
  
  // Show partial success toast
  if (failures.length > 0) {
    vscode.window.showWarningMessage(
      `Package installed to ${successes.length} of ${results.length} projects. View logs for details.`,
      'View Logs'
    ).then(action => {
      if (action === 'View Logs') {
        this.logger.show();
      }
    });
  }
} else {
  this.logger.warn(
    `Skipping cache invalidation: all ${failures.length} installations failed`
  );
}
```

### §22. Integration Tests

**File**: `test/integration/cacheInvalidation.integration.test.ts`

```typescript
describe('Cache Invalidation Integration', () => {
  test('installing package invalidates cache and returns fresh data', async () => {
    // Setup: Parse project initially
    const parser = new DotnetProjectParser(logger, executor);
    const initialMetadata = await parser.parseProject('/test/project.csproj');
    
    expect(initialMetadata.packageReferences).toHaveLength(0);
    
    // Install package via dotnet CLI
    await executor.execute(
      'dotnet add /test/project.csproj package Newtonsoft.Json --version 13.0.3'
    );
    
    // Invalidate cache
    parser.invalidateCache('installed:*');
    
    // Re-parse project
    const freshMetadata = await parser.parseProject('/test/project.csproj');
    
    expect(freshMetadata.packageReferences).toContainEqual({
      packageId: 'Newtonsoft.Json',
      version: '13.0.3'
    });
  });
  
  test('file watcher invalidates cache on external .csproj changes', async () => {
    const parser = new DotnetProjectParser(logger, executor);
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.csproj');
    
    // Setup file watcher integration
    watcher.onDidChange(() => parser.invalidateCache('installed:*'));
    
    // Parse project
    await parser.parseProject('/test/project.csproj');
    
    // Modify .csproj externally
    await fs.promises.writeFile(
      '/test/project.csproj',
      modifiedCsprojContent
    );
    
    // Wait for file watcher event
    await delay(100);
    
    // Verify cache was invalidated
    const freshMetadata = await parser.parseProject('/test/project.csproj');
    expect(freshMetadata.packageReferences).toHaveLength(1);
  });
});
```

### §23. File Watcher Tests

Verify that existing file watcher integration (implemented in STORY-001-02-001b) correctly invalidates cache:

```typescript
test('file watcher integration invalidates cache on .csproj save', async () => {
  const parser = new DotnetProjectParser(logger, executor);
  
  // Trigger file watcher event
  const changeEvent = new vscode.FileSystemWatcher('**/*.csproj');
  changeEvent.onDidChange(uri => {
    parser.invalidateCache(`project:${uri.fsPath}`);
  });
  
  // Simulate .csproj change
  changeEvent.fire({ fsPath: '/test/project.csproj' });
  
  // Verify cache cleared
  expect(parser.cache.has('project:/test/project.csproj')).toBe(false);
});
```

### §24. E2E UI Tests

**File**: `test/e2e/cacheInvalidation.e2e.ts`

```typescript
suite('Cache Invalidation E2E', () => {
  test('UI transforms checkboxes to checkmarks after successful install', async function() {
    this.timeout(10000);
    
    // Open package browser webview
    await vscode.commands.executeCommand('opm.openPackageBrowser');
    await delay(1000);
    
    // Search for package
    await sendWebviewMessage('searchPackages', { query: 'Newtonsoft.Json' });
    await delay(500);
    
    // View package details
    await sendWebviewMessage('getPackageDetails', { id: 'Newtonsoft.Json' });
    await delay(500);
    
    // Expand project selector (should show checkboxes)
    const initialState = await getWebviewState();
    assert.strictEqual(initialState.projects[0].installedVersion, undefined);
    
    // Install package to project
    await sendWebviewMessage('installPackage', {
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      projectPaths: ['/test/project.csproj']
    });
    
    // Wait for install + cache invalidation + refresh
    await delay(3000);
    
    // Verify UI updated
    const updatedState = await getWebviewState();
    assert.strictEqual(updatedState.projects[0].installedVersion, '13.0.3');
    assert.strictEqual(updatedState.installedBadgeCount, 1);
  });
  
  test('tree view refreshes after package install', async function() {
    this.timeout(10000);
    
    // Get tree view initial state
    const initialTreeItems = await getTreeViewItems('installedPackages');
    const initialCount = initialTreeItems.length;
    
    // Install package via command
    await vscode.commands.executeCommand('opm.installPackage', {
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      projectPath: '/test/project.csproj'
    });
    
    // Wait for install + cache invalidation + tree refresh
    await delay(2000);
    
    // Verify tree view updated
    const updatedTreeItems = await getTreeViewItems('installedPackages');
    assert.strictEqual(updatedTreeItems.length, initialCount + 1);
    assert.ok(
      updatedTreeItems.some(item => item.label === 'Newtonsoft.Json')
    );
  });
});
```

### §25. E2E Concurrency Tests

```typescript
test('handles concurrent installs without race conditions', async function() {
  this.timeout(15000);
  
  // Start two concurrent install operations
  const install1 = vscode.commands.executeCommand('opm.installPackage', {
    packageId: 'Newtonsoft.Json',
    version: '13.0.3',
    projectPath: '/test/project1.csproj'
  });
  
  const install2 = vscode.commands.executeCommand('opm.installPackage', {
    packageId: 'Serilog',
    version: '3.1.1',
    projectPath: '/test/project2.csproj'
  });
  
  await Promise.all([install1, install2]);
  
  // Wait for all cache invalidations and refreshes
  await delay(3000);
  
  // Verify both packages appear in tree view
  const treeItems = await getTreeViewItems('installedPackages');
  assert.ok(treeItems.some(item => item.label === 'Newtonsoft.Json'));
  assert.ok(treeItems.some(item => item.label === 'Serilog'));
  
  // Verify webview shows both as installed
  const webviewState = await getWebviewState();
  const project1 = webviewState.projects.find(p => p.path.includes('project1.csproj'));
  const project2 = webviewState.projects.find(p => p.path.includes('project2.csproj'));
  
  assert.strictEqual(project1?.installedVersion, '13.0.3');
  assert.strictEqual(project2?.installedVersion, '3.1.1');
});
```

### §26. Documentation

**Files to Update**:
1. `docs/discovery/request-response.md` - Add cache invalidation step to install flow diagram
2. `docs/technical/domain-layer.md` - Document `invalidateCache` API and patterns
3. `README.md` - Add troubleshooting section for stale UI state

**Example Addition to request-response.md**:
```markdown
## Cache Invalidation Flow

After successful package installation:
1. Install command calls `projectParser.invalidateCache('installed:*')`
2. In-memory cache entries matching pattern are removed
3. Install command sends IPC notification `projectsChanged` to active webviews
4. Webview debounces notification (300ms) and re-requests `getProjects`
5. Project parser re-executes `dotnet list package` (cache miss)
6. Fresh metadata returned with newly installed packages
7. Webview transforms checkbox rows to ✓ icon rows
8. Tree view refresh triggered via `onDidChangeTreeData` event
```

### §27. JSDoc Comments

Add comprehensive JSDoc to all public APIs:

```typescript
/**
 * Invalidates cached project metadata matching the specified glob pattern.
 * 
 * @param pattern - Glob pattern to match cache keys. Supports wildcards:
 *                  - `*` matches any characters within a segment
 *                  - `**` matches any characters across segments
 *                  - `?` matches a single character
 * 
 * @remarks
 * Cache invalidation is idempotent - calling multiple times with the same
 * pattern has no additional effect after the first call. This method is
 * safe to call concurrently.
 * 
 * Common patterns:
 * - `installed:*` - Invalidate all installed package caches
 * - `project:*` - Invalidate all project metadata caches
 * - `project:/specific/path.csproj` - Invalidate single project cache
 * 
 * @example
 * ```ts
 * // Invalidate all installed package caches after install
 * parser.invalidateCache('installed:*');
 * 
 * // Invalidate specific project cache after .csproj edit
 * parser.invalidateCache(`project:${projectPath}`);
 * ```
 * 
 * @see {@link DotnetProjectParser.parseProject} for cache key format
 */
public invalidateCache(pattern: string): void
```

### §27. Performance Optimization

**Metrics to Track**:
1. Cache invalidation time (should be <1ms - just Map.clear())
2. Project list refresh time (depends on CLI execution, typically 500-2000ms)
3. UI transformation time (should be <16ms for 60fps)

**Optimizations**:
1. **Debounced client refresh**: Already implemented (300ms debounce)
2. **Single invalidation point**: Already implemented (once after all installs)
3. **Idempotent operations**: Already supported by Map.clear()

**Initial Implementation**: Current design is already optimized. No further optimization needed unless performance issues are reported.

**Note**: The original plan proposed glob pattern matching and selective invalidation, but we're starting with simple `clearAllCaches()` for simplicity. Selective invalidation can be added in a future story if profiling shows it's needed.

---

## Implementation Dependencies

### Blocked By
- None (uses existing `DotnetProjectParser` interface and methods)

### Blocks
- **STORY-001-03-001** (Installed Packages Tree View) - Will consume cache invalidation hooks to refresh tree nodes

### Files to Modify

#### Core Implementation
1. **`src/commands/installPackageCommand.ts`**
   - Add `projectParser: DotnetProjectParser` to constructor
   - Call `projectParser.clearAllCaches()` after successful installs
   - Add TODO comment for tree view refresh hook

2. **`src/extension.ts`**
   - Inject `projectParser` when creating `InstallPackageCommand`

3. **`src/webviews/apps/packageBrowser/types.ts`**
   - Add `ProjectsChangedNotification` interface
   - Add `isProjectsChangedNotification()` type guard

4. **`src/webviews/packageBrowserWebview.ts`**
   - Import `ProjectsChangedNotification` type
   - Send `projectsChanged` notification after successful install response

#### Webview Client (location TBD based on architecture)
5. **Webview client message handler**
   - Add listener for `projectsChanged` notification
   - Implement debounced `getProjects` re-request (300ms)

6. **`<project-selector>` component**
   - Update `updated()` lifecycle to detect project list changes
   - Transform checkbox rows to ✓ icon rows when `installedVersion` appears
   - Update badge count

#### Tests
7. **`src/services/cli/__tests__/dotnetProjectParser.test.ts`**
   - Add tests for `clearAllCaches()` behavior

8. **`src/commands/__tests__/installPackageCommand.test.ts`**
   - Add tests for cache invalidation integration

9. **`src/webviews/__tests__/packageBrowserWebview.test.ts`**
   - Add tests for `projectsChanged` notification sending

10. **E2E tests** (`test/e2e/cacheInvalidation.e2e.ts`)
    - Test UI transformation after install
    - Test concurrent install handling

### External Dependencies
- None (no new npm packages required after removing `minimatch`)

### Configuration Changes
- None

---

**Implementation Status**: Ready to start
**Estimated Effort**: 1 sprint (as per story estimate)
  
  const start = performance.now();
  parser.invalidateCache('installed:*');
  const duration = performance.now() - start;
  
  expect(duration).toBeLessThan(1);
});
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Cache invalidation throws exception | Low | Medium | Wrap in try/catch, log error, continue operation |
| IPC notification fails (webview disposed) | Medium | Low | Check webview state before sending, handle gracefully |
| Concurrent installs cause race conditions | Medium | High | Use debouncing, make invalidation idempotent |
| File watcher triggers excessive invalidations | Low | Medium | Debounce file watcher events, throttle refresh rate |
| Pattern matching performance degrades | Low | Low | Use efficient minimatch library, benchmark with 1000+ keys |

## Success Metrics

- [ ] Cache invalidation completes in <1ms for workspaces with <100 projects
- [ ] UI transformation visible within 500ms of install completion
- [ ] Zero race conditions in concurrent install scenarios (verified by E2E tests)
- [ ] 100% of install operations trigger correct cache invalidation
- [ ] Zero false negatives (stale data displayed after install)

---

**Implementation Plan ID**: IMPL-001-02-010-cache-invalidation  
**Story**: [STORY-001-02-010-cache-invalidation](../stories/STORY-001-02-010-cache-invalidation.md)  
**Created**: 2026-01-11
