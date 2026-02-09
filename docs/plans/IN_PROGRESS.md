# Phase 6 Implementation - In Progress

**Date**: February 8, 2026  
**Current Task**: Refactor packageBrowser.ts with state managers  
**Status**: Infrastructure complete, EventBus integrated, all tests passing (747/747) ✅

---

## 🎉 Today's Accomplishments

### Fixed Critical Blocker: EventBus Integration (41 TypeScript Errors → 0)

**Problem**: After integrating EventBus into `PackageOperationCommand`, 41 TypeScript compilation errors appeared across 4 test files due to missing EventBus parameter.

**Solution**: Systematically updated all command instantiations to include `mockEventBus` parameter:

1. **installPackageCommand.test.ts** (13 errors fixed)
   - Added `mockEventBus` definition
   - Updated 13 command instantiations: `undefined` → `mockEventBus as any`
   - Fixed 3 cache invalidation tests that had wrong parameter order

2. **uninstallPackageCommand.test.ts** (16 errors fixed)
   - Added `mockEventBus` definition after `mockProgressReporter`
   - Updated all command instantiations with correct parameter order
   - Fixed cache invalidation tests

3. **packageOperationCommand.test.ts** (11 errors fixed)
   - Added `mockEventBus` to `createMocks()` helper
   - Updated all TestCommand, FailingCommand, PartialFailCommand, SelectiveFailCommand instantiations
   - Fixed parameter order: `(cli, logger, progress, eventBus, parser?)`

4. **updatePackageCommand.ts** (1 error fixed)
   - Added `IEventBus` import
   - Updated `createUpdatePackageCommand` factory signature to accept `eventBus` parameter
   - Fixed constructor call to pass eventBus before projectParser

**Results**:
- ✅ TypeScript compilation: 0 errors
- ✅ All tests passing: 747/747 (100%)
- ✅ Build successful
- ✅ EventBus fully integrated into command infrastructure

### Technical Details

**Constructor Signature Change**:
```typescript
// OLD:
constructor(cli, logger, progress, parser?)

// NEW:
constructor(cli, logger, progress, eventBus, parser?)
```

**Test Pattern Used**:
```typescript
const mockEventBus = {
  emit: () => {},
  on: () => ({ dispose: () => {} }),
  once: () => ({ dispose: () => {} }),
};

// Usage in tests
new InstallPackageCommand(
  mockCliService as any,
  mockLogger as any,
  mockProgressReporter,
  mockEventBus as any,        // ← NEW (required)
  mockProjectParser as any,   // ← Optional (moved to 5th position)
);
```

---

## ✅ COMPLETED: EventBus Integration

**Status**: RESOLVED (All tests passing)

TypeScript compilation now succeeds with 0 errors. All 747 tests pass.

### Fixed Issues:
- ✅ Added `mockEventBus` to all test files
- ✅ Updated constructor calls to use correct parameter order: `(cli, logger, progress, eventBus, parser?)`
- ✅ Fixed `createUpdatePackageCommand` factory to accept and pass EventBus parameter
- ✅ Updated all command instantiations in tests

### Files Updated:
1. ✅ `src/commands/__tests__/installPackageCommand.test.ts` - All 13 errors fixed
2. ✅ `src/commands/__tests__/uninstallPackageCommand.test.ts` - All 16 errors fixed  
3. ✅ `src/commands/base/__tests__/packageOperationCommand.test.ts` - All 11 errors fixed
4. ✅ `src/commands/updatePackageCommand.ts` - EventBus parameter added to factory

### Test Results:
```bash
bun run typecheck  # ✅ 0 errors
bun test           # ✅ 747 pass, 0 fail
```

---

## Completed Work (Phase 6)

### ✅ 1. LruCache with TTL (Complete)
- **File**: `src/infrastructure/lruCache.ts` (140 LOC)
- **Tests**: `src/infrastructure/__tests__/lruCache.test.ts` (24 tests, all passing)
- **Features**: Bounded size, time-based expiration, automatic LRU eviction, manual pruning

### ✅ 2. State Management Extraction (Complete)
- **Files** (415 total LOC):
  - `src/webviews/apps/packageBrowser/state/search-state.ts` (160 LOC)
  - `src/webviews/apps/packageBrowser/state/details-state.ts` (120 LOC)
  - `src/webviews/apps/packageBrowser/state/projects-state.ts` (70 LOC)
  - `src/webviews/apps/packageBrowser/state/sources-state.ts` (65 LOC)
  - `src/webviews/apps/packageBrowser/state/selection-state.ts` (existing)
- **Tests**: `src/webviews/apps/packageBrowser/state/__tests__/search-state.test.ts` (15 tests, all passing)
- **Status**: Implemented but NOT yet integrated into packageBrowser.ts component

### ✅ 3. EventBus Infrastructure (100% Complete)
- **Core**: `src/core/eventBus.ts` (IEventBus interface, EventBus implementation)
- **ServiceContainer**: EventBus created and registered as service ✅
- **Factories**: IServiceFactory.createEventBus() implemented in Node/Test factories ✅
- **Commands**: Install/Uninstall commands publish events after successful operations ✅
- **Events**: 
  - `package:installed` → `{ packageId, version, projectPath }` ✅
  - `package:uninstalled` → `{ packageId, projectPath }` ✅
- **Tests**: All 747 tests passing ✅
- **Status**: Ready for webview integration

### ✅ 4. Documentation Updates
- `docs/plans/IMPL-REDESIGN-06-POLISH.md` - Updated with LruCache and state management
- `CHANGELOG.md` - Added Phase 6 entries
- `AGENTS.md` - Added LruCache, state management, and EventBus documentation

---

## Remaining Phase 6 Tasks

### ⏳ Task 4: Refactor packageBrowser.ts (770 LOC → <300 LOC) - NEXT
**File**: `src/webviews/apps/packageBrowser/packageBrowser.ts`

**Current Status**: State management classes created but NOT integrated

**Current Problems**:
- 20+ `@state()` properties (hard to test, scattered state mutations)
- Direct state manipulation throughout component
- No separation of concerns

**Solution - Step by Step**:
1. Replace `@state()` properties with state manager instances:
   ```typescript
   private readonly searchState = new SearchState();
   private readonly detailsState = new DetailsState();
   private readonly projectsState = new ProjectsState();
   private readonly sourcesState = new SourcesState();
   private readonly selectionState = new SelectionState();
   
   @state() private stateVersion = 0; // Single reactive trigger
   ```

2. Implement `updateState()` helper for Lit reactivity:
   ```typescript
   private updateState(updater: () => void): void {
     updater();
     this.stateVersion++; // Force Lit re-render
   }
   ```

3. Refactor event handlers to use state managers:
   ```typescript
   handleSearch(query: string): void {
     this.updateState(() => {
       this.searchState.setQuery(query);
       this.searchState.setLoading(true);
     });
     // ... perform search
   }
   ```

4. Subscribe to EventBus events for auto-refresh:
   ```typescript
   connectedCallback() {
     super.connectedCallback();
     // Get EventBus from somewhere (needs to be passed to webview)
     this.subscriptions.push(
       this.eventBus.on('package:installed', () => {
         this.refreshProjects();
       }),
       this.eventBus.on('package:uninstalled', () => {
         this.refreshProjects();
       })
     );
   }
   ```

**Estimated Effort**: 4-6 hours
**Priority**: High (main deliverable for Phase 6)

---
**Target Files**:
- `src/env/node/nodeNuGetApiClient.ts` or equivalent
- Wrap search, metadata, README fetchers with Decorator pattern

**Implementation**:
```typescript
class CachedSearchExecutor {
  constructor(
    private readonly executor: ISearchExecutor,
    private readonly cache: LruCache<string, SearchResult[]>,
  ) {}
  
  async search(query: string): Promise<SearchResult[]> {
    const cached = this.cache.get(query);
    if (cached) return cached;
    
    const results = await this.executor.search(query);
    this.cache.set(query, results);
    return results;
  }
}
```

**Recommended Configurations**:
- Search cache: 100 items, 5min TTL
- Metadata cache: 200 items, 10min TTL
- README cache: 50 items, 15min TTL

### Task 6: Performance Audit
- Measure extension activation time
- Profile memory usage with LruCache under load
- Benchmark search response times
- Verify cache hit rates

### Task 7: Final Validation
```bash
bun run typecheck  # Must pass
bun run lint       # Must pass
bun test           # All tests must pass
bun run build      # Must succeed
```

---

## Quick Commands

```bash
# Fix tests and verify
bun run typecheck
bun test

# Full quality gate
bun run lint:fix
bun run typecheck
bun test
bun run build

# Run specific test file
bun test src/commands/__tests__/installPackageCommand.test.ts
```

---

## Technical Context

### EventBus Integration Architecture

**Service Container** (`src/infrastructure/serviceContainer.ts`):
```typescript
// Creates EventBus via factory
const eventBus = this.factory.createEventBus();
this.services.set('eventBus', eventBus);

// Passes to command factories
const installCmd = this.factory.createInstallCommand(
  packageCli, logger, runtime, eventBus
);
```

**Command Base Class** (`src/commands/base/packageOperationCommand.ts`):
```typescript
constructor(
  protected readonly cliService: PackageCliService,
  protected readonly logger: ILogger,
  protected readonly progressReporter: IProgressReporter,
  protected readonly eventBus: IEventBus,  // NEW - 4th parameter
  protected readonly projectParser?: DotnetProjectParser,  // Optional - 5th parameter
) {}
```

**Event Publishing** (Install/Uninstall commands):
```typescript
// After successful operation
if (result.success) {
  this.eventBus.emit('package:installed', {
    packageId: params.packageId,
    version: params.version,
    projectPath,
  });
}
```

### State Management Pattern

**State Classes**: Encapsulate state mutations, independently testable
**Lit Integration**: `stateVersion` counter triggers re-renders
**Benefits**: Separation of concerns, better testability, type safety

---

## File Locations Reference

```
src/
├── core/
│   └── eventBus.ts                    # EventBus implementation
├── infrastructure/
│   ├── lruCache.ts                    # LRU cache with TTL ✅
│   ├── serviceContainer.ts            # DI container with EventBus
│   ├── serviceFactory.ts              # Abstract factory interface
│   └── testServiceFactory.ts          # Test factory
├── commands/
│   ├── base/
│   │   ├── packageOperationCommand.ts # Template Method base (EventBus integrated) ✅
│   │   └── __tests__/
│   │       └── packageOperationCommand.test.ts  # All tests passing ✅
│   ├── installPackageCommand.ts       # Publishes events ✅
│   ├── uninstallPackageCommand.ts     # Publishes events ✅
│   ├── updatePackageCommand.ts        # EventBus parameter added ✅
│   └── __tests__/
│       ├── installPackageCommand.test.ts    # All tests passing ✅
│       └── uninstallPackageCommand.test.ts  # All tests passing ✅
├── webviews/apps/packageBrowser/
│   ├── packageBrowser.ts              # ⏳ TODO: Refactor with state managers (770 LOC)
│   └── state/                         # State managers ✅
│       ├── search-state.ts
│       ├── details-state.ts
│       ├── projects-state.ts
│       └── sources-state.ts
└── env/node/
    └── nodeServiceFactory.ts          # Implements createEventBus() ✅
```

---

## Success Criteria

Phase 6 is complete when:
- ✅ All TypeScript compilation errors fixed (0 errors)
- ✅ All tests passing (747/747 tests)
- ⏳ packageBrowser.ts under 300 LOC
- ⏳ LruCache applied to API services
- ⏳ Performance metrics documented
- ⏳ Full quality gate passes (lint, typecheck, test, build)

**Current Status**: 2/6 complete (33%)

---

## Next Agent Action

**Start here**: Fix the 41 test compilation errors by replacing `undefined` with `mockEventBus as any` in all test files. The mock is already defined in installPackageCommand.test.ts (lines 27-31). Copy this pattern to the other test files.

**Command to verify**: `bun run typecheck` should show 0 errors after fixes.
