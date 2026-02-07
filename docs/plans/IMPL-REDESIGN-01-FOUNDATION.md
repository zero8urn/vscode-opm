# IMPL-REDESIGN-01: Foundation Layer

> **Phase 1 of 6** — Establish core abstractions, eliminate dead code, unify result types

**Status:** Planning  
**Priority:** P0 (Blocker for all other phases)  
**Estimated Effort:** 2 weeks  
**Risk Level:** Low  
**Dependencies:** None

---

## Overview

### Objectives

1. Create unified `Result<T, E>` type system to replace dual `DomainResult`/`NuGetResult`
2. Implement typed `EventBus` for decoupled cross-component communication
3. Create `VsCodeRuntime` adapter to centralize all VS Code API access
4. Delete dead code (`DomainProvider`, `DomainProviderService`)
5. Establish core abstractions that all subsequent phases depend on

### Success Criteria

- ✅ Single unified result type used throughout codebase
- ✅ All VS Code API access goes through adapter
- ✅ Event bus operational with typed events
- ✅ Zero functional regressions (all tests pass)
- ✅ 20 new unit tests for core layer
- ✅ Core layer documented in architecture docs

### Key Metrics

| Metric | Target | Verification |
|--------|--------|--------------|
| New LOC | ~400 (core layer) | `cloc src/core/` |
| Deleted LOC | ~40 (dead code) | Git diff |
| Test Coverage | >90% for core | `bun test --coverage` |
| Build Time | <5s | `time bun run build` |
| Test Time | <2s | `time bun test src/core/` |

---

## Implementation Steps

### Step 1: Create Unified Result Type

**File:** `src/core/result.ts`

**Implementation:**

```typescript
/**
 * Unified result type for all operations that can fail.
 * Replaces DomainResult<T> and NuGetResult<T> with a single discriminated union.
 * 
 * @example
 * ```typescript
 * async function fetchUser(id: string): Promise<Result<User>> {
 *   try {
 *     const user = await api.getUser(id);
 *     return ok(user);
 *   } catch (e) {
 *     return fail({ code: 'Network', message: e.message, cause: e });
 *   }
 * }
 * 
 * const result = await fetchUser('123');
 * if (result.success) {
 *   console.log(result.value.name); // TypeScript knows 'value' exists
 * } else {
 *   console.error(result.error.message); // TypeScript knows 'error' exists
 * }
 * ```
 */

export type Result<T, E = AppError> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: E };

/**
 * Unified error type for all application errors.
 * Discriminated union of all possible error scenarios.
 */
export type AppError =
  | { readonly code: 'Network'; readonly message: string; readonly cause?: unknown }
  | { readonly code: 'ApiError'; readonly message: string; readonly statusCode: number; readonly details?: unknown }
  | { readonly code: 'RateLimit'; readonly message: string; readonly retryAfter?: number }
  | { readonly code: 'AuthRequired'; readonly message: string; readonly hint?: string }
  | { readonly code: 'ParseError'; readonly message: string; readonly raw?: unknown }
  | { readonly code: 'Cancelled'; readonly message: string }
  | { readonly code: 'Timeout'; readonly message: string; readonly timeoutMs?: number }
  | { readonly code: 'NotFound'; readonly message: string; readonly resource?: string }
  | { readonly code: 'Validation'; readonly message: string; readonly field?: string }
  | { readonly code: 'CliError'; readonly message: string; readonly exitCode?: number; readonly stderr?: string }
  | { readonly code: 'ProjectNotFound'; readonly message: string; readonly projectPath?: string }
  | { readonly code: 'DotnetNotFound'; readonly message: string }
  | { readonly code: 'Unknown'; readonly message: string; readonly cause?: unknown };

// ============================================================================
// Constructors
// ============================================================================

/**
 * Create a successful result.
 */
export const ok = <T>(value: T): Result<T, never> => ({ success: true, value });

/**
 * Create a failed result.
 */
export const fail = <E = AppError>(error: E): Result<never, E> => ({ success: false, error });

// ============================================================================
// Combinators (Railway-Oriented Programming)
// ============================================================================

/**
 * Map the success value of a result.
 * Errors pass through unchanged.
 */
export const mapResult = <T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> =>
  result.success ? ok(fn(result.value)) : result;

/**
 * Flat-map (chain) results.
 * Errors pass through unchanged.
 */
export const flatMapResult = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> => (result.success ? fn(result.value) : result);

/**
 * Provide a default value if result is error.
 */
export const unwrapOr = <T, E>(result: Result<T, E>, defaultValue: T): T =>
  result.success ? result.value : defaultValue;

/**
 * Extract value or throw error.
 * Use sparingly — prefer pattern matching.
 */
export const unwrap = <T, E>(result: Result<T, E>): T => {
  if (result.success) return result.value;
  throw new Error(`Unwrap failed: ${JSON.stringify(result.error)}`);
};

/**
 * Combine multiple results into one.
 * Returns first error encountered, or success with array of values.
 */
export const combineResults = <T, E>(results: Result<T, E>[]): Result<T[], E> => {
  const values: T[] = [];
  for (const result of results) {
    if (!result.success) return result;
    values.push(result.value);
  }
  return ok(values);
};
```

**Tests:** `src/core/__tests__/result.test.ts`

```typescript
import { describe, test, expect } from 'bun:test';
import { ok, fail, mapResult, flatMapResult, unwrapOr, combineResults, type Result, type AppError } from '../result';

describe('Result Type', () => {
  describe('ok()', () => {
    test('creates success result', () => {
      const result = ok(42);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(42);
      }
    });
  });

  describe('fail()', () => {
    test('creates error result', () => {
      const error: AppError = { code: 'Network', message: 'Connection failed' };
      const result = fail(error);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('Network');
      }
    });
  });

  describe('mapResult()', () => {
    test('maps success value', () => {
      const result = ok(10);
      const mapped = mapResult(result, x => x * 2);
      expect(mapped.success).toBe(true);
      if (mapped.success) {
        expect(mapped.value).toBe(20);
      }
    });

    test('passes through error', () => {
      const error: AppError = { code: 'NotFound', message: 'Missing' };
      const result = fail(error);
      const mapped = mapResult(result, x => x * 2);
      expect(mapped.success).toBe(false);
      if (!mapped.success) {
        expect(mapped.error.code).toBe('NotFound');
      }
    });
  });

  describe('flatMapResult()', () => {
    test('chains successful results', () => {
      const result = ok(10);
      const chained = flatMapResult(result, x => ok(x * 2));
      expect(chained.success).toBe(true);
      if (chained.success) {
        expect(chained.value).toBe(20);
      }
    });

    test('short-circuits on error', () => {
      const error: AppError = { code: 'Validation', message: 'Invalid input' };
      const result = fail(error);
      const chained = flatMapResult(result, x => ok(x * 2));
      expect(chained.success).toBe(false);
    });

    test('propagates inner error', () => {
      const result = ok(10);
      const error: AppError = { code: 'ApiError', message: 'Server error', statusCode: 500 };
      const chained = flatMapResult(result, () => fail(error));
      expect(chained.success).toBe(false);
      if (!chained.success) {
        expect(chained.error.code).toBe('ApiError');
      }
    });
  });

  describe('unwrapOr()', () => {
    test('returns value on success', () => {
      const result = ok(42);
      expect(unwrapOr(result, 0)).toBe(42);
    });

    test('returns default on error', () => {
      const error: AppError = { code: 'Unknown', message: 'Error' };
      const result = fail(error);
      expect(unwrapOr(result, 99)).toBe(99);
    });
  });

  describe('combineResults()', () => {
    test('combines successful results', () => {
      const results = [ok(1), ok(2), ok(3)];
      const combined = combineResults(results);
      expect(combined.success).toBe(true);
      if (combined.success) {
        expect(combined.value).toEqual([1, 2, 3]);
      }
    });

    test('returns first error', () => {
      const error1: AppError = { code: 'Network', message: 'Error 1' };
      const error2: AppError = { code: 'ApiError', message: 'Error 2', statusCode: 500 };
      const results = [ok(1), fail(error1), fail(error2)];
      const combined = combineResults(results);
      expect(combined.success).toBe(false);
      if (!combined.success) {
        expect(combined.error.code).toBe('Network');
      }
    });

    test('handles empty array', () => {
      const combined = combineResults<number, AppError>([]);
      expect(combined.success).toBe(true);
      if (combined.success) {
        expect(combined.value).toEqual([]);
      }
    });
  });
});
```

**Acceptance Criteria:**
- [ ] `result.ts` created with ~80 LOC
- [ ] 15 unit tests passing
- [ ] TypeScript strict mode (no `any`)
- [ ] JSDoc examples provided

---

### Step 2: Implement EventBus

**File:** `src/core/eventBus.ts`

**Implementation:**

```typescript
/**
 * Typed event bus for decoupled component communication.
 * Uses Observer pattern with type-safe event emission/subscription.
 * 
 * @example
 * ```typescript
 * const bus = new EventBus();
 * 
 * // Subscribe to events
 * const sub = bus.on('projects:changed', (data) => {
 *   console.log('Projects changed:', data.projectPaths);
 * });
 * 
 * // Emit events
 * bus.emit('projects:changed', { projectPaths: ['a.csproj', 'b.csproj'] });
 * 
 * // Cleanup
 * sub.dispose();
 * ```
 */

import type { Disposable } from './types';

/**
 * Map of event names to their payload types.
 * Extend this interface to add new event types.
 */
export interface EventMap {
  'projects:changed': { projectPaths: string[] };
  'cache:invalidated': { keys: string[] };
  'config:changed': { section: string };
  'package:installed': { packageId: string; version: string; projectPath: string };
  'package:uninstalled': { packageId: string; projectPath: string };
  'source:discovered': { source: { name: string; url: string } };
}

export interface IEventBus {
  /**
   * Emit an event to all subscribers.
   * Swallows errors from handlers to prevent one bad observer from crashing emitters.
   */
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void;

  /**
   * Subscribe to an event.
   * Returns a Disposable to unsubscribe.
   */
  on<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): Disposable;

  /**
   * Subscribe to an event once.
   * Auto-unsubscribes after first emission.
   */
  once<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): Disposable;
}

export class EventBus implements IEventBus {
  private readonly listeners = new Map<string, Set<(data: unknown) => void>>();

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const eventKey = event as string;
    const handlers = this.listeners.get(eventKey);
    if (!handlers) return;

    // Invoke each handler in try/catch to prevent one bad observer from crashing others
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        // Log errors but don't re-throw (observers shouldn't crash emitters)
        console.error(`Event handler failed for ${eventKey}:`, error);
      }
    });
  }

  on<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): Disposable {
    const eventKey = event as string;
    if (!this.listeners.has(eventKey)) {
      this.listeners.set(eventKey, new Set());
    }
    this.listeners.get(eventKey)!.add(handler as (data: unknown) => void);

    return {
      dispose: () => {
        this.listeners.get(eventKey)?.delete(handler as (data: unknown) => void);
      },
    };
  }

  once<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): Disposable {
    const subscription = this.on(event, data => {
      subscription.dispose();
      handler(data);
    });
    return subscription;
  }
}
```

**Tests:** `src/core/__tests__/eventBus.test.ts`

```typescript
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
    bus.emit('projects:changed', { projectPaths: [] });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  test('dispose() unsubscribes handler', () => {
    const bus = new EventBus();
    const handler = mock(() => {});

    const sub = bus.on('projects:changed', handler);
    bus.emit('projects:changed', { projectPaths: [] });
    sub.dispose();
    bus.emit('projects:changed', { projectPaths: [] });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('once() auto-unsubscribes after first event', () => {
    const bus = new EventBus();
    const handler = mock(() => {});

    bus.once('projects:changed', handler);
    bus.emit('projects:changed', { projectPaths: ['a'] });
    bus.emit('projects:changed', { projectPaths: ['b'] });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ projectPaths: ['a'] });
  });

  test('swallows errors from handlers', () => {
    const bus = new EventBus();
    const goodHandler = mock(() => {});
    const badHandler = mock(() => {
      throw new Error('Handler crashed');
    });

    bus.on('projects:changed', badHandler);
    bus.on('projects:changed', goodHandler);

    // Should not throw
    expect(() => {
      bus.emit('projects:changed', { projectPaths: [] });
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
});
```

**Acceptance Criteria:**
- [ ] `eventBus.ts` created with ~70 LOC
- [ ] 10 unit tests passing
- [ ] Error isolation verified (bad handlers don't crash bus)
- [ ] TypeScript event type safety enforced

---

### Step 3: Create VS Code Runtime Adapter

**File:** `src/core/vscodeRuntime.ts`

**Implementation:**

```typescript
/**
 * Adapter for VS Code API access.
 * Single source of truth for all VS Code runtime dependencies.
 * Enables full testability without VS Code Extension Host.
 * 
 * @example Production:
 * ```typescript
 * const runtime = new VsCodeRuntime();
 * const config = runtime.getConfiguration('opm');
 * ```
 * 
 * @example Tests:
 * ```typescript
 * const runtime = new MockVsCodeRuntime();
 * runtime.showInformationMessage('Test');
 * expect(runtime.messages).toContain('Test');
 * ```
 */

import type * as vscode from 'vscode';

export interface IVsCodeRuntime {
  readonly workspace: typeof vscode.workspace;
  readonly window: typeof vscode.window;
  readonly commands: typeof vscode.commands;
  readonly Uri: typeof vscode.Uri;

  getConfiguration(section: string): vscode.WorkspaceConfiguration;
  createOutputChannel(name: string): vscode.OutputChannel;
  showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>;
  showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined>;
  withProgress<T>(
    options: vscode.ProgressOptions,
    task: (progress: vscode.Progress<{ message?: string }>) => Promise<T>,
  ): Thenable<T>;
}

/**
 * Production adapter - only file that imports vscode at runtime.
 */
export class VsCodeRuntime implements IVsCodeRuntime {
  private readonly api: typeof import('vscode');

  constructor() {
    // This is the ONLY place vscode is required at runtime
    this.api = require('vscode');
  }

  get workspace() {
    return this.api.workspace;
  }
  get window() {
    return this.api.window;
  }
  get commands() {
    return this.api.commands;
  }
  get Uri() {
    return this.api.Uri;
  }

  getConfiguration(section: string): vscode.WorkspaceConfiguration {
    return this.api.workspace.getConfiguration(section);
  }

  createOutputChannel(name: string): vscode.OutputChannel {
    return this.api.window.createOutputChannel(name);
  }

  showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined> {
    return this.api.window.showInformationMessage(message, ...items);
  }

  showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined> {
    return this.api.window.showErrorMessage(message, ...items);
  }

  withProgress<T>(
    options: vscode.ProgressOptions,
    task: (progress: vscode.Progress<{ message?: string }>) => Promise<T>,
  ): Thenable<T> {
    return this.api.window.withProgress(options, task);
  }
}

/**
 * Test adapter - no VS Code dependencies.
 */
export class MockVsCodeRuntime implements Partial<IVsCodeRuntime> {
  readonly messages: string[] = [];
  readonly errors: string[] = [];
  private readonly configs = new Map<string, Record<string, unknown>>();

  showInformationMessage(message: string): Thenable<string | undefined> {
    this.messages.push(message);
    return Promise.resolve(undefined);
  }

  showErrorMessage(message: string): Thenable<string | undefined> {
    this.errors.push(message);
    return Promise.resolve(undefined);
  }

  getConfiguration(section: string): any {
    return {
      get: (key: string, defaultValue?: unknown) => {
        const config = this.configs.get(section) || {};
        return config[key] ?? defaultValue;
      },
      update: (key: string, value: unknown) => {
        const config = this.configs.get(section) || {};
        config[key] = value;
        this.configs.set(section, config);
        return Promise.resolve();
      },
    };
  }

  setConfig(section: string, key: string, value: unknown): void {
    const config = this.configs.get(section) || {};
    config[key] = value;
    this.configs.set(section, config);
  }
}
```

**File:** `src/core/types.ts`

```typescript
/**
 * Shared core types.
 */

export interface Disposable {
  dispose(): void;
}

export interface CancellationToken {
  isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): Disposable;
}
```

**Tests:** `src/core/__tests__/vscodeRuntime.test.ts`

```typescript
import { describe, test, expect } from 'bun:test';
import { MockVsCodeRuntime } from '../vscodeRuntime';

describe('MockVsCodeRuntime', () => {
  test('captures information messages', async () => {
    const runtime = new MockVsCodeRuntime();
    await runtime.showInformationMessage('Test message');
    expect(runtime.messages).toContain('Test message');
  });

  test('captures error messages', async () => {
    const runtime = new MockVsCodeRuntime();
    await runtime.showErrorMessage('Error occurred');
    expect(runtime.errors).toContain('Error occurred');
  });

  test('stores configuration', () => {
    const runtime = new MockVsCodeRuntime();
    runtime.setConfig('opm', 'debug', true);
    const config = runtime.getConfiguration('opm');
    expect(config.get('debug')).toBe(true);
  });

  test('returns default value for missing config', () => {
    const runtime = new MockVsCodeRuntime();
    const config = runtime.getConfiguration('opm');
    expect(config.get('missing', 'default')).toBe('default');
  });
});
```

**Acceptance Criteria:**
- [ ] `vscodeRuntime.ts` created with ~100 LOC
- [ ] `types.ts` created with ~15 LOC
- [ ] 5 unit tests for mock runtime
- [ ] Production runtime only imports vscode once
- [ ] All services updated to use `IVsCodeRuntime` (done in substep below)

---

### Step 4: Delete Dead Code

**Files to Delete:**
- `src/domain/domainProvider.ts` (~12 LOC)
- `src/domain/domainProviderService.ts` (~25 LOC)

**Files to Update:**
- `src/extension.ts` — Remove `import { DomainProviderService }` and instantiation
- `src/domain/models/index.ts` — Remove `DomainResult` export (if present)

**Commands:**
```bash
git rm src/domain/domainProvider.ts
git rm src/domain/domainProviderService.ts
```

**Search for References:**
```bash
# Verify no usages
grep -r "DomainProvider" src/
grep -r "domainProvider" src/
```

**Acceptance Criteria:**
- [ ] Files deleted from git
- [ ] Zero references to deleted files
- [ ] Build succeeds
- [ ] All tests pass

---

### Step 5: Migrate to Unified Result Type

**Strategy:** Replace type aliases, preserve runtime behavior.

**Files to Update:**
1. `src/domain/models/nugetApiResult.ts` — Export `Result<T>` alias
2. `src/domain/nugetApiClient.ts` — Update all return types
3. `src/env/node/nugetApiClient.ts` — Update all return statements
4. `src/services/cli/*.ts` — Update CLI service result types
5. `src/commands/*.ts` — Update command result handling

**Migration Pattern:**

```typescript
// BEFORE:
import type { NuGetResult } from '../models/nugetApiResult';

async function search(): Promise<NuGetResult<PackageSearchResult[]>> {
  // ...
  return { success: true, result: packages };
}

// AFTER:
import type { Result } from '../../core/result';
import type { AppError } from '../../core/result';

async function search(): Promise<Result<PackageSearchResult[], AppError>> {
  // ...
  return { success: true, value: packages }; // 'result' → 'value'
}
```

**Critical Change:** `result.result` → `result.value`

**Files Requiring Updates:**
```bash
# Find all usages of .result property
grep -r "\.result" src/ | grep -v node_modules
```

**Testing Strategy:**
- Run full test suite after each file migration
- Look for type errors: `tsc --noEmit`
- Update tests to use `.value` instead of `.result`

**Acceptance Criteria:**
- [ ] All `NuGetResult<T>` replaced with `Result<T, AppError>`
- [ ] All `DomainResult<T>` removed
- [ ] All `.result` → `.value` migrations complete
- [ ] TypeScript compilation succeeds
- [ ] All existing tests pass

---

### Step 6: Unit Tests for Core Layer

**Test Coverage Targets:**
| Module | Coverage | Tests |
|--------|----------|-------|
| `result.ts` | >95% | 15 tests |
| `eventBus.ts` | >90% | 10 tests |
| `vscodeRuntime.ts` | >85% | 5 tests |
| **Total** | **>90%** | **30 tests** |

**Run Tests:**
```bash
bun test src/core/
bun test --coverage src/core/
```

**Acceptance Criteria:**
- [ ] 30 unit tests created
- [ ] All tests pass
- [ ] Coverage >90% for core layer
- [ ] Tests run in <2 seconds

---

### Step 7: Update Documentation

**Files to Update:**
1. `docs/architecture/ARCHITECTURE-OVERVIEW.md` — Add Core Layer section
2. `docs/architecture/QUICK-REFERENCE.md` — Add Result/EventBus examples
3. `.github/copilot-instructions.md` — Update with core abstractions
4. `AGENTS.md` — Document new patterns

**Documentation Checklist:**
- [ ] Core layer architecture diagram
- [ ] Result type usage examples
- [ ] EventBus pub/sub examples
- [ ] VsCodeRuntime adapter pattern
- [ ] Migration guide (old → new result types)

**Acceptance Criteria:**
- [ ] All docs updated
- [ ] Code examples compile
- [ ] Architecture diagrams current

---

### Step 8: Final Validation

**Full Test Suite:**
```bash
# Unit tests
bun test

# Integration tests
bun test test/integration/

# E2E tests
bun run test:e2e

# Type check
bun run typecheck

# Lint
bun run lint
```

**Manual Smoke Test:**
1. Open Package Browser
2. Search for "Newtonsoft.Json"
3. View package details
4. Install to a project
5. Uninstall from project
6. Verify all features work identically to before

**Acceptance Criteria:**
- [ ] 100% test pass rate
- [ ] No new ESLint warnings
- [ ] Extension activates successfully
- [ ] All commands execute
- [ ] No console errors

---

## Rollback Plan

**Risk:** Low — purely additive changes

**If Issues Arise:**
1. Revert commits: `git revert <commit-range>`
2. Core abstractions are opt-in (not breaking existing code)
3. Old result types can coexist temporarily

**Rollback Triggers:**
- Test failure rate >5%
- Build broken for >2 hours
- Critical bug discovered

---

## Next Steps

After Phase 1 completion:
- ✅ Core abstractions established
- ✅ All tests passing
- ✅ Documentation updated
- 🚀 **Proceed to Phase 2:** Command Template Method

**Dependencies for Phase 2:**
- `Result<T, E>` type (from this phase)
- All existing tests passing (validated in this phase)

---

## Related Documents

- **Master Plan:** [IMPL-REDESIGN-00-MASTER-PLAN.md](IMPL-REDESIGN-00-MASTER-PLAN.md)
- **Design:** [ELEGANT-REDESIGN.md](../technical/ELEGANT-REDESIGN.md)
- **Architecture:** [ARCHITECTURE-OVERVIEW.md](../architecture/ARCHITECTURE-OVERVIEW.md)
