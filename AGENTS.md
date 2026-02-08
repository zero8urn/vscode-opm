# AGENTS.md — OPM (vscode-opm)

**Agent Instructions for Elegant TypeScript Architecture**

This repository is a VS Code extension for .NET package management, guided by Gang of Four patterns, SOLID principles, and modern TypeScript idioms. 

**Core Philosophy:**
- **Single Responsibility**: No file exceeds 300 LOC; one reason to change per class
- **Open/Closed**: Extend via interfaces (new sources, commands, handlers) without modifying existing code
- **Dependency Inversion**: Services depend on abstractions; VS Code API accessed through facades
- **Composition over Inheritance**: Except where Template Method genuinely eliminates duplication
- **Result Types Everywhere**: Unified `Result<T, E>` — no exception-based control flow

---

## 🔧 Build, Lint, Test Commands

### Build & Package

```bash
bun install                          # Install dependencies
bun run build                        # Bundle with esbuild → out/extension.js
bun run typecheck                    # Type-check without emitting
bun run lint                         # Run ESLint
bun run lint:fix                     # Auto-fix linting issues
bun run package                      # Full pipeline: typecheck + lint + build + VSIX
```

### Testing (Three-Tier Strategy)

```bash
# Unit tests (Bun, co-located in src/**/__tests__/)
bun test                             # Run all tests
bun test src/                        # Unit tests only
bun test src/commands/               # Specific directory
bun test src/commands/__tests__/install-package-command.test.ts  # Single test file

# Integration tests (Bun, real APIs in test/integration/)
bun test test/integration/           # All integration tests
bun test test/integration/nuget-api-client.integration.test.ts   # Single integration test

# E2E tests (Mocha, VS Code Extension Host in test/e2e/)
bun run test:e2e                     # All E2E tests (auto-builds first)
node test/runTest.js                 # E2E runner directly
```

**Quick Single Test Examples:**

```bash
# Unit test for specific command
bun test src/commands/__tests__/install-package-command.test.ts

# Integration test for API client
bun test test/integration/nuget-api-client.integration.test.ts
```

---

## 📁 Project Structure

```
src/
├── extension.ts              # Entry point: activation, command registration
├── core/                     # Core layer: abstractions, result types, event bus
│   ├── result.ts            # Unified Result<T, E> type (replaces DomainResult/NuGetResult)
│   ├── eventBus.ts          # Typed pub/sub for cross-component events
│   ├── vscodeRuntime.ts     # VS Code API adapter (single gateway)
│   ├── types.ts             # Disposable, CancellationToken
│   └── __tests__/           # Core layer unit tests
├── commands/                 # Command implementations (opm.* namespace)
│   └── __tests__/           # Co-located unit tests
├── domain/                   # Domain layer: abstractions, models, contracts
│   ├── nugetApiClient.ts    # NuGet API client interface
│   ├── models/              # Domain models (Package, Version, etc.)
│   └── parsers/             # Response parsers
├── env/                      # Environment-specific implementations
│   └── node/                # Node.js: NuGet client, config parser
├── services/                 # Long-lived services (logger, config, CLI)
│   ├── loggerService.ts     # Logging abstraction (NEVER use console.log in host)
│   ├── cli/                 # dotnet CLI integration
│   └── discovery/           # Solution/project discovery
├── utils/                    # Pure utilities (version comparison, etc.)
└── webviews/                 # Webview infrastructure
    ├── webviewHelpers.ts    # CSP, URI utils, buildHtmlTemplate()
    ├── sanitizer.ts         # HTML sanitization (ALWAYS sanitize external content)
    └── apps/                # Lit-based webview apps
        └── packageBrowser/  # Main package browser UI
            ├── components/  # Lit web components
            ├── state/       # State management
            └── types.ts     # IPC message types

test/
├── e2e/                     # Extension Host E2E tests (Mocha)
├── integration/             # Real API integration tests (Bun)
└── fixtures/                # Test fixtures
```

---

## 🎨 Code Style Guidelines

### Naming Conventions

- **PascalCase**: Classes, interfaces, types, enums
  - **No `I` prefix on interfaces** (use descriptive names: `Logger` interface, `ConsoleLogger` implementation)
- **camelCase**: Functions, variables, properties, parameters
- **kebab-case**: File names (`install-package-command.ts`, `nuget-facade.ts`)
- **Commands**: `opm.*` prefix (`opm.openPackageBrowser`, `opm.installPackage`)
- **Constants**: `UPPER_SNAKE_CASE` or `as const` assertions
  - Env vars, config keys: `API_BASE_URL`, `MAX_RETRY_COUNT`
  - Lit tag constants: `PACKAGE_CARD_TAG = 'package-card' as const`
- **Avoid Abbreviations**: `configuration` not `config`, `message` not `msg` (except in very local scope)

### Imports & Exports

```typescript
// Type-only imports for VS Code API (avoid bundling issues)
import type * as vscode from 'vscode';
import type { ILogger } from '../services/loggerService';

// Node built-ins use node: prefix
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

// Lit components
import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

// Export co-located tag constants for Lit components
export const PACKAGE_CARD_TAG = 'package-card' as const;

@customElement(PACKAGE_CARD_TAG)
export class PackageCard extends LitElement {
  /* ... */
}
```

### Formatting (Prettier + EditorConfig)

- **Line width**: 120 characters (enforced by Prettier)
- **Indentation**: 2 spaces (not tabs)
- **Quotes**: Single quotes (`'string'` not `"string"`)
- **Trailing commas**: ES5 style (objects, arrays, parameters)
- **Line endings**: LF (Unix), enforced by `.editorconfig`
- **Semicolons**: Always (avoid ASI ambiguity)
- **No Prettier Ignore**: Format all code; extract complex regex/strings to variables if needed

---

## 🧪 Testing Patterns

### Unit Tests (Bun, `src/**/__tests__/*.test.ts`)

- **Runner**: Bun test (`describe`, `test`, `expect` from `bun:test`)
- **Location**: Co-located with source code
- **Purpose**: Fast, isolated, mock external dependencies
- **Example**:

```typescript
import { describe, test, expect, mock } from 'bun:test';

describe('InstallPackageCommand', () => {
  test('rejects empty packageId', async () => {
    const result = await command.execute({ packageId: '' });
    expect(result.success).toBe(false);
  });
});
```

### Integration Tests (Bun, `test/integration/*.integration.test.ts`)

- **Runner**: Bun test
- **Purpose**: Test real APIs, network calls (NuGet.org)
- **Example**:

```typescript
import { describe, test, expect } from 'bun:test';

describe('NuGetApiClient Integration', () => {
  test('searches for popular package', async () => {
    const result = await client.searchPackages({ query: 'Newtonsoft.Json' });
    expect(result.success).toBe(true);
  });
});
```

### E2E Tests (Mocha, `test/e2e/*.e2e.ts`)

- **Runner**: Mocha in Extension Host via `@vscode/test-electron`
- **Style**: Use `suite()` and `test()` (NOT `describe()`/`it()`)
- **Purpose**: Test VS Code integration (commands, webviews, tree views)
- **Key Rules**:
  - ✅ Test command registration, execution, lifecycle
  - ✅ Mock external APIs (don't hit real NuGet.org)
  - ✅ Always await async operations + add 300-500ms delays after webview init
  - ✅ Set explicit timeouts: `this.timeout(5000)` or `this.timeout(10000)`
  - ❌ DON'T test webview DOM/UI (no access from Extension Host)
  - ❌ DON'T test business logic (use unit tests instead)

**Example**:

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Package Browser E2E', () => {
  test('Command executes successfully', async function () {
    this.timeout(10000);
    await vscode.commands.executeCommand('opm.openPackageBrowser');
    await sleep(500); // Allow webview to initialize
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('opm.openPackageBrowser'));
  });
});
```

---

## 🏗️ Architecture Patterns

### Unified Result Type (Implemented)

The redesign consolidates all result types into one generic discriminated union:

```typescript
// src/core/result.ts
export type Result<T, E = AppError> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: E };

export type AppError =
  | { readonly code: 'Network'; readonly message: string; readonly cause?: unknown }
  | { readonly code: 'ApiError'; readonly message: string; readonly statusCode?: number }
  | { readonly code: 'Validation'; readonly message: string; readonly field?: string }
  | { readonly code: 'NotFound'; readonly message: string; readonly resource?: string }
  | { readonly code: 'RateLimit'; readonly message: string; readonly retryAfter?: number }
  // ... see src/core/result.ts for complete list

// Helpers
export const ok = <T>(value: T): Result<T, never> => ({ success: true, value });
export const fail = <E>(error: E): Result<never, E> => ({ success: false, error });

// Combinators
export const mapResult = <T, U, E>(result: Result<T, E>, fn: (v: T) => U): Result<U, E> =>
  result.success ? ok(fn(result.value)) : result;

export const flatMapResult = <T, U, E>(result: Result<T, E>, fn: (v: T) => Result<U, E>): Result<U, E> =>
  result.success ? fn(result.value) : result;
```

**Usage:**

```typescript
// Import from core layer
import { ok, fail, type Result, type AppError } from '../core/result';

// Function returning Result
async function searchPackages(query: string): Promise<Result<Package[]>> {
  if (!query) {
    return fail({ code: 'Validation', message: 'Query cannot be empty', field: 'query' });
  }
  
  try {
    const packages = await api.search(query);
    return ok(packages);
  } catch (e) {
    return fail({ code: 'Network', message: 'Failed to search', cause: e });
  }
}

// Consuming Result
const result = await searchPackages('Newtonsoft');
if (result.success) {
  console.log(`Found ${result.value.length} packages`); // TypeScript knows 'value' exists
} else {
  logger.error('Search failed', result.error); // TypeScript knows 'error' exists
}

// Railway-oriented programming
const transformedResult = mapResult(
  result,
  packages => packages.filter(p => p.verified)
);
```

**Note:** Legacy code may still use `NuGetResult<T>` with `.result` property. New code should use unified `Result<T, E>` with `.value` property.

### Dependency Injection: Abstract Factory + Service Container (Implemented)

**Pattern**: Abstract Factory provides environment-specific service families; Service Container manages lifecycle.

```typescript
// src/infrastructure/serviceFactory.ts - Abstract Factory interface
export interface IServiceFactory {
  createLogger(context: vscode.ExtensionContext, runtime: IVsCodeRuntime): ILogger;
  createNuGetClient(logger: ILogger, runtime: IVsCodeRuntime): INuGetApiClient;
  createProjectParserWithWatcher(logger: ILogger): ProjectParserWithWatcher;
  registerCommands(context, commands, logger): void;
  // ... all service creation methods
}

// src/env/node/nodeServiceFactory.ts - Production implementation
export class NodeServiceFactory implements IServiceFactory {
  createLogger(context, runtime) {
    return createLogger(context, runtime); // Real VS Code logger
  }
  
  createProjectParserWithWatcher(logger) {
    const parser = this.createProjectParser(logger);
    const vscodeApi = require('vscode'); // ONLY place vscode is required
    const watcher = vscodeApi.workspace.createFileSystemWatcher('**/*.csproj');
    return { parser, disposables: [watcher] };
  }
  // ... all real implementations
}

// src/infrastructure/testServiceFactory.ts - Test implementation
export class TestServiceFactory implements IServiceFactory {
  createLogger() { return new MockLogger(); } // No VS Code dependency
  createProjectParserWithWatcher() {
    return { parser: new StubProjectParser(), disposables: [] };
  }
  registerCommands() {} // No-op for tests
  // ... all test doubles
}

// src/infrastructure/serviceContainer.ts - DI Container (pure orchestration)
export class ServiceContainer {
  constructor(private factory: IServiceFactory, private context) {}
  
  async initialize() {
    const runtime = this.factory.createRuntime();
    const logger = this.factory.createLogger(this.context, runtime);
    // ... orchestrate service creation, NO vscode dependencies
  }
  
  getService<K extends ServiceId>(id: K): ServiceTypeMap[K] {
    return this.services.get(id) as ServiceTypeMap[K]; // Type-safe retrieval
  }
}

// src/extension.ts - Clean 32 LOC activation
export async function activate(context: vscode.ExtensionContext) {
  const container = new ServiceContainer(new NodeServiceFactory(), context);
  await container.initialize();
  container.registerCommands();
  context.subscriptions.push(container);
}
```

**Key Benefits:**
- ✅ **Zero VS Code in container** - Pure orchestration, fully unit testable
- ✅ **Swap implementations** - Production vs Test via factory pattern
- ✅ **Type-safe retrieval** - `getService<'logger'>()` infers `ILogger`
- ✅ **Single responsibility** - Container orchestrates, factory constructs
- ✅ **Automatic disposal** - LIFO cleanup of all services

### VS Code Runtime Adapter (Implemented)

All VS Code API access goes through a single adapter for testability. This is the **ONLY** file that imports VS Code at runtime in production code.

```typescript
// src/core/vscodeRuntime.ts
export interface IVsCodeRuntime {
  // Namespaces (read-only access to VS Code API namespaces)
  readonly workspace: typeof vscode.workspace;
  readonly window: typeof vscode.window;
  readonly commands: typeof vscode.commands;
  readonly extensions: typeof vscode.extensions;
  readonly env: typeof vscode.env;

  // Type constructors
  readonly Uri: typeof vscode.Uri;
  readonly Range: typeof vscode.Range;
  readonly Position: typeof vscode.Position;
  readonly EventEmitter: typeof vscode.EventEmitter;

  // Common operations
  getConfiguration(section?: string): vscode.WorkspaceConfiguration;
  createOutputChannel(name: string, languageId?: string): vscode.OutputChannel;
  showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>;
  showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined>;
  showWarningMessage(message: string, ...items: string[]): Thenable<string | undefined>;
  withProgress<T>(
    options: vscode.ProgressOptions,
    task: (progress: vscode.Progress<{ message?: string; increment?: number }>, token: vscode.CancellationToken) => Thenable<T>,
  ): Thenable<T>;
}

// Production: ONLY file that requires('vscode') at runtime
export class VsCodeRuntime implements IVsCodeRuntime { /* ... */ }

// Tests: no VS Code dependencies, full test utilities
export class MockVsCodeRuntime implements Partial<IVsCodeRuntime> {
  // Message tracking (by type: info, error, warning)
  readonly messages: Array<{ type: 'info' | 'error' | 'warning'; message: string; items?: string[] }> = [];

  // Configuration mock (in-memory store)
  setConfig(section: string, key: string, value: unknown): void;
  clearConfig(): void;

  // Output channel mock
  createOutputChannel(name: string): vscode.OutputChannel;
  getOutputChannel(name: string): MockOutputChannel | undefined;

  // Progress tracking
  readonly progressCalls: Array<{ title?: string; location?: unknown }> = [];
  clearProgress(): void;

  // Test utilities
  getMessages(type: 'info' | 'error' | 'warning'): string[];
  hasMessage(message: string): boolean;
  clearMessages(): void;
}

// Mock OutputChannel with test utilities
export class MockOutputChannel {
  readonly lines: string[] = [];
  appendLine(value: string): void;
  getText(): string;
  contains(text: string): boolean;
  clear(): void;
  // ... full OutputChannel API
}
```

**Usage:**

```typescript
// Production (services receive IVsCodeRuntime via constructor)
class MyService {
  constructor(private readonly runtime: IVsCodeRuntime) {}

  async doSomething() {
    const config = this.runtime.getConfiguration('opm');
    await this.runtime.showInformationMessage('Done!');
  }
}

// Tests (NO VS Code Extension Host required)
const runtime = new MockVsCodeRuntime();
runtime.setConfig('opm', 'debug', true);

const service = new MyService(runtime);
await service.doSomething();

// Assert on tracked messages
expect(runtime.hasMessage('Done!')).toBe(true);
expect(runtime.getMessages('info')).toContain('Done!');

// Assert on output channel content
const channel = runtime.getOutputChannel('OPM');
expect(channel?.contains('Installation complete')).toBe(true);

// Assert on progress calls
expect(runtime.progressCalls).toHaveLength(1);
expect(runtime.progressCalls[0]?.title).toBe('Installing packages');
```

**Key Benefits:**
- ✅ **Fixes 22+ failing unit tests** - No VS Code Extension Host required
- ✅ **Single point of control** - Only one file imports vscode at runtime
- ✅ **Full test coverage** - Mock tracks all interactions
- ✅ **Type-safe** - Full TypeScript inference

### Event Bus (Implemented)

Typed publish/subscribe for decoupled component communication:

```typescript
// src/core/eventBus.ts
export interface EventMap {
  'projects:changed': { projectPaths: string[] };
  'cache:invalidated': { keys: string[] };
  'config:changed': { section: string };
  'package:installed': { packageId: string; version: string; projectPath: string };
  'package:uninstalled': { packageId: string; projectPath: string };
  'source:discovered': { source: { name: string; url: string } };
}

export interface IEventBus {
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void;
  on<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): Disposable;
  once<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): Disposable;
}
```

**Usage:**

```typescript
import { EventBus } from '../core/eventBus';

const bus = new EventBus();

// Subscribe
const subscription = bus.on('projects:changed', (data) => {
  console.log('Projects changed:', data.projectPaths);
  invalidateCache(data.projectPaths);
});

// Emit
bus.emit('projects:changed', { projectPaths: ['a.csproj', 'b.csproj'] });

// Cleanup
subscription.dispose();

// One-time subscription
bus.once('package:installed', (data) => {
  showNotification(`${data.packageId} installed successfully`);
});
```

**Key Features:**
- Type-safe events (TypeScript narrows event data)
- Error isolation (bad handlers don't crash emitters)
- Automatic cleanup via Disposable pattern
- Zero external dependencies

### State Management Classes (Phase 6 - Implemented)

Webview state is extracted into focused manager classes for better testability and separation of concerns:

```typescript
// src/webviews/apps/packageBrowser/state/

// SearchState - Search query, results, pagination, loading
export class SearchState {
  setQuery(query: string): void;
  getQuery(): string;
  setResults(results: PackageSearchResult[], totalHits: number, hasMore: boolean): void;
  appendResults(results: PackageSearchResult[], totalHits: number, hasMore: boolean): void;
  setLoading(loading: boolean): void;
  setIncludePrerelease(include: boolean): void;
  setError(error: SearchError | null): void;
  clear(): void;
  reset(): void;
}

// DetailsState - Package details panel
export class DetailsState {
  openPanel(packageId: string, sourceId: string | null, sourceName: string | null): void;
  closePanel(): void;
  setPackageDetails(details: PackageDetailsData | null): void;
  setLoading(loading: boolean): void;
}

// ProjectsState - Cached projects list
export class ProjectsState {
  setProjects(projects: ProjectInfo[]): void;
  getProjects(): ProjectInfo[];
  setLoading(loading: boolean): void;
  isFetched(): boolean;
  updateProject(projectPath: string, updater: (project: ProjectInfo) => ProjectInfo): void;
}

// SourcesState - Package sources and cache warming
export class SourcesState {
  setSources(sources: PackageSourceOption[]): void;
  getSources(): PackageSourceOption[];
  setCacheWarmed(warmed: boolean): void;
  setCacheWarming(warming: boolean): void;
}

// SelectionState - Project selection for installation (already existed)
export class SelectionState {
  toggleProject(projectPath: string): void;
  getSelectedPaths(): string[];
  getSelectAllState(): SelectAllState;
  // ... more methods
}
```

**Integration with Lit:**

```typescript
@customElement('package-browser-app')
export class PackageBrowserApp extends LitElement {
  // State managers (encapsulated, testable)
  private readonly searchState = new SearchState();
  private readonly detailsState = new DetailsState();
  private readonly projectsState = new ProjectsState();
  
  // Reactive trigger for Lit re-renders
  @state()
  private stateVersion = 0;
  
  private updateState(updater: () => void): void {
    updater();
    this.stateVersion++; // Force Lit re-render
  }
  
  handleSearch(query: string): void {
    this.updateState(() => {
      this.searchState.setQuery(query);
      this.searchState.setLoading(true);
    });
    // ... perform search
  }
  
  render() {
    const results = this.searchState.getResults();
    const loading = this.searchState.isLoading();
    // ... use state for rendering
  }
}
```

**Benefits:**
- **Testability**: State logic tested independently of Lit components
- **Separation of Concerns**: UI vs state mutations clearly separated
- **Type Safety**: Strong contracts for state operations
- **Reusability**: State managers can be shared across components

### LRU Cache with TTL (Phase 6 - Implemented)

Bounded cache preventing memory leaks with time-based expiration:

```typescript
// src/infrastructure/lruCache.ts
export class LruCache<K, V> {
  constructor(private readonly maxSize: number, private readonly ttlMs: number) {}
  
  get(key: K): V | undefined;  // Returns undefined if expired or evicted
  set(key: K, value: V): void;  // Evicts LRU if at capacity
  has(key: K): boolean;
  delete(key: K): boolean;
  clear(): void;
  prune(): void;  // Manually remove expired entries
}
```

**Usage:**

```typescript
// Recommended configurations
const searchCache = new LruCache<string, SearchResult[]>(100, 5 * 60 * 1000);  // 100 items, 5 min
const metadataCache = new LruCache<string, PackageMetadata>(200, 10 * 60 * 1000); // 200 items, 10 min
const readmeCache = new LruCache<string, string>(50, 15 * 60 * 1000);  // 50 items, 15 min

// Decorator pattern for caching API calls
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

**Design Decisions:**
- TTL prevents stale data (package metadata changes)
- LRU prevents unbounded growth (memory safety)
- Together they provide both freshness and bounded size

### Service Design: Cohesion & Size Limits

**Rules:**
- **300 LOC Maximum**: If a class exceeds 300 lines, decompose using Facade + Strategy patterns
- **Single Responsibility**: One reason to change; one axis of variation
- **Private Methods**: Share logic within a class; extract to separate class only when reused externally
- **No God Objects**: Current `NuGetApiClient` (1376 LOC) and webview host (1034 LOC) violate this — see ELEGANT-REDESIGN.md for decomposition strategy

**Refactor Targets (see `docs/technical/ELEGANT-REDESIGN.md`):**
- `NuGetApiClient` → `NuGetFacade` delegating to 4 focused services (150-200 LOC each)
- `packageBrowserWebview.ts` → `WebviewMessageMediator` + per-message handlers (~50 LOC each)
- `InstallPackageCommand` + `UninstallPackageCommand` → `PackageOperationCommand` base class (Template Method)

---

## 🌐 Webview Patterns

### Security: ALWAYS Sanitize & Use CSP

```typescript
import { buildHtmlTemplate, sanitizeHtml, createNonce } from '../webviewHelpers';

// ✅ CORRECT: Use buildHtmlTemplate with scripts array
const html = buildHtmlTemplate({
  webview,
  extensionUri,
  title: 'Package Browser',
  bodyHtml: '<package-browser-app></package-browser-app>', // Sanitized automatically
  scripts: [webview.asWebviewUri(scriptPath)], // Added after sanitization
});

// ❌ WRONG: Inline scripts are stripped by sanitizer
const html = buildHtmlTemplate({
  bodyHtml: '<div><script src="..."></script></div>', // Script stripped!
});

// Always sanitize external content (README, descriptions)
const safeHtml = sanitizeHtml(packageReadme);
```

### Webview IPC: Typed Messages

```typescript
// Define message types with discriminated unions
export type WebviewMessage =
  | { type: 'searchPackages'; query: string }
  | { type: 'installPackage'; packageId: string; version: string };

// Validate incoming messages
import { isWebviewMessage } from '../webviewHelpers';

webview.onDidReceiveMessage(async (msg: unknown) => {
  if (!isWebviewMessage(msg)) {
    logger.warn('Invalid webview message', msg);
    return;
  }

  switch (msg.type) {
    case 'searchPackages':
      // Handle search
      break;
  }
});
```

### Lit Components: Tag Constants

```typescript
// Export co-located tag constant
export const PACKAGE_CARD_TAG = 'package-card' as const;

@customElement(PACKAGE_CARD_TAG)
export class PackageCard extends LitElement {
  @property() packageId!: string;
  @state() private expanded = false;

  // Use string literals in templates (Lit doesn't support tag interpolation)
  render() {
    return html`<div class="card">${this.packageId}</div>`;
  }
}

// Import to show dependencies
import { PACKAGE_LIST_TAG } from './package-list';
```

### Webview Theming

- Use VS Code CSS variables directly: `--vscode-editor-background`, `--vscode-button-background`
- Variables auto-update when users change themes (NO custom theme service needed)
- See [VS Code Theme Color Reference](https://code.visualstudio.com/api/references/theme-color)

---

## 🔒 Security & Logging

### Logging

```typescript
// Extension Host: ALWAYS use LoggerService (NEVER console.*)
logger.info('Package installed', { packageId, version });
logger.error('Installation failed', error);
logger.debug('API response', response); // Only shown when debug mode enabled

// Webviews: Use console.* (browser context, visible in Webview DevTools)
console.log('Webview initialized'); // ✅ OK in webview code
console.error('IPC failed', error); // ✅ OK in webview code

// For production logging from webviews, send IPC to host
postMessage({ type: 'logError', message: 'Something broke' });
```

### Security Checklist

- ✅ Sanitize all external HTML (package READMEs, descriptions) via `sanitizeHtml()`
- ✅ Use `buildCspMeta()` for strict Content Security Policy
- ✅ Pass scripts via `scripts: [uri]` array (NEVER inline in bodyHtml)
- ✅ Validate all webview messages with type guards
- ✅ Never hardcode secrets; use secure storage
- ✅ Use parameterized queries (avoid injection)

---

## 🚀 Common Workflows

### Adding a New Command

**Pre-Refactor (Current):**
1. Create command class in `src/commands/my-command.ts` with `static id = 'opm.myCommand'`
2. Register in `src/extension.ts` activation function
3. Add command contribution to `package.json`
4. Write unit tests in `src/commands/__tests__/my-command.test.ts`
5. Add E2E test in `test/e2e/my-command.e2e.ts`

**Post-Refactor (Planned):**
1. If package operation (install/update/uninstall), extend `PackageOperationCommand` base class (~40 LOC)
2. Otherwise, implement `ICommand` interface directly
3. Auto-discovered by `ServiceContainer` (no manual registration in `extension.ts`)

### Creating a Webview

1. Use `buildHtmlTemplate()` from `webviewHelpers.ts` (preserves CSP + sanitization)
2. Sanitize external content (READMEs, descriptions) via `sanitizeHtml()`
3. Define typed IPC messages in `types.ts` (discriminated union)
4. Create per-message handlers implementing `IMessageHandler<TMessage, TResponse>`
5. Register handlers with `WebviewMessageMediator`
6. Test command execution in E2E (NOT webview DOM—use unit tests with JSDOM if needed)

---

## 📚 Key References

**Architecture & Refactoring**:
- `docs/technical/ELEGANT-REDESIGN.md` — Comprehensive GoF pattern-based refactor strategy (eliminates god files, 70% command duplication, adds extensibility)
- `docs/technical/code-layout.md` — Current repository structure

**Testing**:
- `docs/technical/e2e-quick-reference.md` — Extension Host E2E patterns
- `test/e2e/packageBrowser.e2e.ts` — E2E examples

**Implementation Examples**:
- `src/extension.ts` — Activation & command registration
- `src/webviews/webviewHelpers.ts` — CSP, sanitization, HTML templates (✅ keep these patterns)
- `src/utils/batchProcessor.ts` — Clean bounded-concurrency abstraction (✅ preserve)
- `scripts/esbuild.config.mjs` — esbuild configuration

---

## ⚡ TypeScript & Tooling

- **TypeScript**: 5.x, strict mode, ES2022 target, `noUncheckedIndexedAccess: true`
- **Build**: esbuild (extension + webviews), separate bundles for extension host and webview contexts
- **Externals**: `vscode`, `node:*` (NOT bundled), `@vscode/*` packages
- **Module System**: ESM for source, CJS for extension output (VS Code requirement)
- **Decorators**: Experimental decorators enabled (Lit components only)

**Type System Best Practices**:
- **Zero `any`**: Use `unknown` + type guards; leverage TypeScript's control flow analysis
- **Discriminated Unions**: Required for state machines, errors, and IPC messages
- **Utility Types**: Prefer `Readonly<T>`, `Partial<T>`, `Record<K, V>` over manual repetition
- **Const Assertions**: Use `as const` for literal types (tag constants, config objects)
- **Branded Types**: For IDs and opaque values (`type PackageId = string & { __brand: 'PackageId' }`)
- **Generic Constraints**: Narrow with `extends` to enforce contracts at compile time

---

## 🎯 GoF Patterns in Use (Post-Refactor)

When implementing new features, prefer these proven patterns from the redesign:

| Pattern | Use Case | Example |
|---------|----------|---------|
| **Template Method** | Shared workflows with variation points | `PackageOperationCommand` base class for install/uninstall/update |
| **Facade + Strategy** | Decompose complex services | `NuGetFacade` → 4 focused collaborators + pluggable source adapters |
| **Mediator + Command** | Message routing | `WebviewMessageMediator` + per-message `IMessageHandler` classes |
| **Chain of Responsibility** | Composable pipelines | HTTP middleware: auth → retry → cache → timeout → log |
| **Abstract Factory** | Environment-specific services | `NodeServiceFactory` vs `TestServiceFactory` |
| **Observer** | Decoupled events | `EventBus` for cache invalidation, config changes, project updates |
| **Builder** | Fluent construction | `WebviewBuilder`, `HttpPipelineBuilder` |

## ✨ Quick Tips

- **Start Here**: Dev Container → `bun run build` → F5 for Extension Development Host
- **Debug Webviews**: Command Palette → "Developer: Open Webview Developer Tools"
- **Run Single Test**: `bun test path/to/file.test.ts`
- **Pre-commit Checklist**: `bun run lint:fix && bun run typecheck && bun test`
- **File Size Alert**: If a class approaches 300 LOC, apply Facade/Strategy decomposition
- **New Command**: Extend `PackageOperationCommand` if it fits the workflow; otherwise implement fresh
- **New Source Type**: Implement `ISourceAdapter` interface; register with adapter registry

---

**This file is the single source of truth for agent instructions. For architectural decisions, consult `docs/technical/ELEGANT-REDESIGN.md`.**
