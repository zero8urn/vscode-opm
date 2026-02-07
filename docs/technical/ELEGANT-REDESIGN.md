# Elegant Redesign: Rewriting OPM with Modern Design Patterns

> A comprehensive technical proposal for rewriting vscode-opm from the ground up, leveraging Gang of Four (GoF) patterns and modern TypeScript idioms to create an architecture that is elegant, extensible, and maintainable.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Architecture: What Works, What Doesn't](#current-architecture)
3. [Design Philosophy for the Rewrite](#design-philosophy)
4. [GoF Patterns Applied](#gof-patterns-applied)
5. [Proposed Architecture](#proposed-architecture)
6. [Layer-by-Layer Redesign](#layer-by-layer-redesign)
7. [Cross-Cutting Concerns](#cross-cutting-concerns)
8. [Migration Strategy](#migration-strategy)
9. [Appendix: Pattern Catalog](#appendix-pattern-catalog)

---

## 1. Executive Summary <a name="executive-summary"></a>

OPM today is a functional VS Code extension with solid domain contracts, result-type error handling, and reasonable separation of concerns. However, it has accumulated structural debt: two 1000+ LOC god files, duplicated command logic, dead abstractions, an unintegrated middleware pipeline, scattered VS Code runtime access, and no formal extensibility points.

This document proposes a redesign that **preserves the codebase's best ideas** (result types, typed IPC, factory DI, CSP security) while introducing **nine Gang of Four patterns** to solve specific architectural problems:

| Problem | GoF Pattern | Impact |
|---------|------------|--------|
| 70% duplication in install/uninstall commands | **Template Method** | Eliminate ~300 LOC of duplication |
| 1376 LOC monolithic API client | **Facade + Strategy** | Decompose into 4 focused collaborators |
| 1034 LOC webview message router | **Mediator + Command** | Per-message handler modules |
| Manual DI wiring in extension.ts | **Abstract Factory** | Auto-discoverable service composition |
| No plugin system for new sources | **Strategy + Observer** | Drop-in source adapters |
| Unintegrated HTTP pipeline | **Chain of Responsibility (Decorator)** | Composable middleware for all HTTP |
| Repetitive IPC type guards | **Prototype + Factory Method** | Generic type guard generator |
| No lifecycle management | **Observer** | Deterministic startup/shutdown events |
| No webview reusability | **Template Method + Builder** | Base webview class for future panels |

The result is an architecture where adding a new package source, a new command, or a new webview panel requires implementing a single interface — not modifying a half-dozen files.

---

## 2. Current Architecture: What Works, What Doesn't <a name="current-architecture"></a>

### 2.1 Strengths to Preserve

These patterns are **already excellent** and should survive the rewrite largely unchanged:

| Pattern | Where | Why It's Good |
|---------|-------|---------------|
| `NuGetResult<T>` discriminated unions | `src/domain/models/` | Eliminates exception-based control flow; TypeScript narrows types automatically |
| `INuGetApiClient` interface | `src/domain/nugetApiClient.ts` | Pure contract with no VS Code dependency; fully portable |
| Factory functions (`createXxx`) | Every service | Enables constructor DI without a container; testable in isolation |
| Typed IPC with type guards | `src/webviews/apps/packageBrowser/types.ts` | Compile-time safety across the webview process boundary |
| CSP + sanitization | `src/webviews/webviewHelpers.ts` | `default-src 'none'`, nonce-based scripts, body sanitized before injection |
| Credential stripping on redirect | `src/env/node/nugetApiClient.ts` | Production-grade security: auth headers removed on cross-origin |
| `batchProcess` utility | `src/utils/batchProcessor.ts` | Clean bounded-concurrency abstraction used by commands |
| File-watcher → cache invalidation | `src/services/cache/` | Debounced observer pattern; auto-cleanup on panel dispose |

### 2.2 Problems to Solve

| # | Problem | Evidence | Root Cause |
|---|---------|----------|------------|
| P1 | **God File: NuGetApiClient** | 1376 LOC in `src/env/node/nugetApiClient.ts` | Single class does service-index resolution, search (single + multi), metadata fetch, README fetch, URL caching, deduplication, auth, and error mapping |
| P2 | **God File: Webview Host** | 1034 LOC in `src/webviews/packageBrowserWebview.ts` | One function handles HTML generation, message routing, 8+ request types, domain→webview mapping, error formatting |
| P3 | **Command Duplication** | `installPackageCommand.ts` (328 LOC) and `uninstallPackageCommand.ts` (316 LOC) share ~70% identical code: validation, progress, batching, cache invalidation, result aggregation | No shared base workflow |
| P4 | **Dead Abstractions** | `DomainProvider`, `DomainProviderService`, `DomainResult` are unused; two coexisting result types (`DomainResult` vs `NuGetResult`) | Leftover scaffolding from template |
| P5 | **Unintegrated Infrastructure** | `pipeline.ts` (602 LOC) and `registry.ts` (563 LOC) exist but the API client uses raw `fetch` | Forward-looking code never connected |
| P6 | **Scattered `require('vscode')`** | At least 6 files import VS Code at runtime inside method bodies | No centralized runtime access pattern |
| P7 | **Unbounded Caches** | Service-index URL cache, `PackageDetailsService` cache, project parser cache — none have size limits | Memory leak in long-running sessions |
| P8 | **No Extensibility Points** | Adding a source type = modify `nugetApiClient.ts` internals; adding a command = edit `extension.ts`; adding a webview = duplicate entire pattern | Closed architecture |
| P9 | **Boilerplate Type Guards** | 16+ nearly identical `isXxxMessage()` functions in `types.ts` | No generic message validator |
| P10 | **Root Component Bloat** | `<package-browser-app>` at 771 LOC manages search, details, sources, projects, install, and uninstall | No controller decomposition |

### 2.3 Dependency Analysis

```
extension.ts (Composition Root)
  ├── LoggerService ──────── Pure (injectable OutputChannel)
  ├── ConfigurationService ── COUPLED (calls require('vscode') internally)  
  ├── NuGetApiClient ──────── Pure interface, LARGE implementation
  │   └── raw fetch ───────── BYPASSES pipeline.ts
  ├── DotnetCliExecutor ───── Pure (spawns child process)
  ├── PackageCliService ───── Pure (depends on executor interface)
  ├── DotnetProjectParser ─── Pure (depends on executor + sub-parsers)
  ├── CacheInvalidationNotifier ── Pure (observer pattern)
  ├── PackageBrowserCommand ── COUPLED (calls require('vscode') for SolutionContext)
  │   ├── SearchService ──── Pure
  │   ├── PackageDetailsService ── Pure
  │   └── packageBrowserWebview ── LARGE, mixed concerns
  ├── InstallPackageCommand ── Duplicated workflow
  └── UninstallPackageCommand ── Duplicated workflow
```

---

## 3. Design Philosophy for the Rewrite <a name="design-philosophy"></a>

### 3.1 Guiding Principles

1. **Every class has one reason to change** (SRP). No file exceeds 300 LOC.
2. **Open for extension, closed for modification** (OCP). New sources, commands, and webviews are added by implementing interfaces — not editing existing files.
3. **Depend on abstractions** (DIP). No service imports a concrete implementation. VS Code API is accessed through a single injectable facade.
4. **Composition over inheritance** — except where Template Method genuinely eliminates duplication.
5. **Result types everywhere** — unified `Result<T, E>` replaces the dual `DomainResult` / `NuGetResult` system.
6. **Explicit lifecycle** — every service has `initialize()` and `dispose()`, managed by a container.

### 3.2 Unified Result Type

Replace the current dual system with one generic:

```typescript
// src/core/result.ts
export type Result<T, E = AppError> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: E };

export type AppError =
  | { readonly code: 'Network'; readonly message: string; readonly cause?: unknown }
  | { readonly code: 'ApiError'; readonly message: string; readonly statusCode: number }
  | { readonly code: 'RateLimit'; readonly message: string; readonly retryAfter?: number }
  | { readonly code: 'AuthRequired'; readonly message: string; readonly hint?: string }
  | { readonly code: 'ParseError'; readonly message: string; readonly raw?: unknown }
  | { readonly code: 'Cancelled'; readonly message: string }
  | { readonly code: 'Timeout'; readonly message: string }
  | { readonly code: 'NotFound'; readonly message: string }
  | { readonly code: 'Validation'; readonly message: string; readonly field?: string }
  | { readonly code: 'CliError'; readonly message: string; readonly exitCode?: number }
  | { readonly code: 'Unknown'; readonly message: string; readonly cause?: unknown };

// Helpers
export const ok = <T>(value: T): Result<T, never> => ({ success: true, value });
export const fail = <E>(error: E): Result<never, E> => ({ success: false, error });

// Combinators
export const mapResult = <T, U, E>(result: Result<T, E>, fn: (v: T) => U): Result<U, E> =>
  result.success ? ok(fn(result.value)) : result;

export const flatMapResult = <T, U, E>(result: Result<T, E>, fn: (v: T) => Result<U, E>): Result<U, E> =>
  result.success ? fn(result.value) : result;
```

This merges `DomainResult`, `NuGetResult`, `PackageOperationResult`, and `ProjectParseResult` into one shape. The `AppError` union is the single source of truth for all error codes.

---

## 4. GoF Patterns Applied <a name="gof-patterns-applied"></a>

### 4.1 Pattern Map

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        CREATIONAL PATTERNS                               │
├──────────────────────────────────────────────────────────────────────────┤
│  Abstract Factory ─── ServiceContainerFactory                            │
│       Creates environment-specific service families                      │
│       (Node services vs test mocks vs web worker services)               │
│                                                                          │
│  Factory Method ──── MessageGuardFactory                                 │
│       Generic type guard generator for IPC messages                      │
│       Eliminates 16 boilerplate functions                                │
│                                                                          │
│  Builder ──────────── WebviewBuilder, HttpPipelineBuilder                │
│       Fluent construction of webview panels and HTTP pipelines            │
├──────────────────────────────────────────────────────────────────────────┤
│                        STRUCTURAL PATTERNS                               │
├──────────────────────────────────────────────────────────────────────────┤
│  Facade ──────────── NuGetFacade                                         │
│       Simplified API over 4 decomposed sub-services                      │
│       (ServiceIndexResolver, SearchExecutor, MetadataFetcher, ReadmeFetcher)│
│                                                                          │
│  Decorator ────────── HttpMiddleware (Chain of Responsibility variant)    │
│       Composable request pipeline: auth → retry → cache → timeout → log  │
│                                                                          │
│  Adapter ──────────── VsCodeRuntimeAdapter                               │
│       Single module wrapping all VS Code API access                      │
│       Enables full testability without VS Code                           │
├──────────────────────────────────────────────────────────────────────────┤
│                        BEHAVIORAL PATTERNS                               │
├──────────────────────────────────────────────────────────────────────────┤
│  Template Method ──── PackageOperationCommand                            │
│       Shared workflow for install/uninstall/update commands               │
│       Subclasses override only: buildArgs(), parseResult()               │
│                                                                          │
│  Strategy ─────────── ISourceAdapter                                     │
│       Pluggable source-specific behaviors                                │
│       (nuget.org, Azure Artifacts, GitHub Packages, custom)              │
│                                                                          │
│  Mediator ─────────── WebviewMessageMediator                             │
│       Routes IPC messages to registered handlers                         │
│       Replaces 1034-LOC switch chain                                     │
│                                                                          │
│  Observer ─────────── EventBus / LifecycleManager                        │
│       Decoupled publish/subscribe for cache invalidation,                │
│       project changes, configuration updates                             │
│                                                                          │
│  Command ──────────── IMessageHandler<TRequest, TResponse>               │
│       Each IPC message type has a dedicated handler object               │
│       Registered with the Mediator                                       │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Pattern Details

#### 4.2.1 Template Method — Package Operations

**Problem (P3):** `InstallPackageCommand` and `UninstallPackageCommand` share ~70% identical code.

**Solution:** Extract the shared workflow into an abstract base class. Subclasses provide only the operation-specific behavior.

```typescript
// src/commands/base/packageOperationCommand.ts

export abstract class PackageOperationCommand<TParams, TOperationResult> {
  constructor(
    protected readonly cliService: PackageCliService,
    protected readonly logger: ILogger,
    protected readonly projectParser: DotnetProjectParser,
    protected readonly progressReporter: IProgressReporter,
  ) {}

  /** Template method: the fixed algorithm */
  async execute(params: TParams): Promise<OperationSummary> {
    // Step 1: Validate (shared)
    const validated = this.validate(params);
    if (!validated.success) return this.failWith(validated.error);

    // Step 2: Extract project paths (shared)  
    const projects = this.extractProjects(validated.value);
    const uniqueProjects = this.deduplicateProjects(projects);

    // Step 3: Execute with progress (shared)
    return this.progressReporter.withProgress(
      { title: this.getProgressTitle(validated.value) },
      async (progress) => {
        // Step 4: Batch process (shared)
        const results = await batchProcess(uniqueProjects, 3, async (projectPath) => {
          progress.report({ message: this.getProjectMessage(projectPath, validated.value) });
          
          // Step 5: Execute single operation (ABSTRACT — subclass provides)
          return this.executeOnProject(projectPath, validated.value);
        });

        // Step 6: Invalidate caches (shared)
        await this.invalidateCaches(uniqueProjects, results);

        // Step 7: Build summary (shared)
        return this.buildSummary(results, validated.value);
      },
    );
  }

  // ── Abstract hooks (subclass must implement) ──
  protected abstract validate(params: TParams): Result<ValidatedParams>;
  protected abstract executeOnProject(projectPath: string, params: ValidatedParams): Promise<Result<TOperationResult>>;
  protected abstract getProgressTitle(params: ValidatedParams): string;
  protected abstract getProjectMessage(projectPath: string, params: ValidatedParams): string;

  // ── Shared concrete methods ──
  private deduplicateProjects(paths: string[]): string[] { /* ... */ }
  private async invalidateCaches(projects: string[], results: Result<TOperationResult>[]): Promise<void> { /* ... */ }
  private buildSummary(results: Result<TOperationResult>[], params: ValidatedParams): OperationSummary { /* ... */ }
}
```

```typescript
// src/commands/installPackageCommand.ts — Now ~60 LOC instead of 328
export class InstallPackageCommand extends PackageOperationCommand<InstallParams, AddPackageResult> {
  static readonly id = 'opm.installPackage';

  protected validate(params: InstallParams): Result<ValidatedInstallParams> {
    if (!params.packageId) return fail({ code: 'Validation', message: 'Package ID required' });
    if (!params.version) return fail({ code: 'Validation', message: 'Version required' });
    return ok({ packageId: params.packageId, version: params.version, projectPaths: params.projectPaths });
  }

  protected async executeOnProject(projectPath: string, params: ValidatedInstallParams): Promise<Result<AddPackageResult>> {
    return this.cliService.addPackage({
      projectPath,
      packageId: params.packageId,
      version: params.version,
    });
  }

  protected getProgressTitle(params: ValidatedInstallParams): string {
    return `Installing ${params.packageId} v${params.version}`;
  }

  protected getProjectMessage(projectPath: string, params: ValidatedInstallParams): string {
    return `Adding ${params.packageId} to ${path.basename(projectPath)}`;
  }
}
```

**Result:** ~600 LOC (install + uninstall combined) → ~200 LOC total. Adding an `UpdatePackageCommand` becomes a 40-LOC subclass.

---

#### 4.2.2 Facade + Strategy — Decomposing the API Client

**Problem (P1):** `NuGetApiClient` at 1376 LOC handles 6+ distinct responsibilities.

**Solution:** Decompose into focused collaborators behind a Facade. Use Strategy for source-specific behaviors.

```
┌─────────────────────────────────────────────────────┐
│                    NuGetFacade                       │
│         (implements INuGetApiClient)                 │
│  Delegates to 4 focused services                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────┐   ┌──────────────────────┐    │
│  │ ServiceIndex     │   │ SearchExecutor        │    │
│  │ Resolver         │   │                       │    │
│  │ (~150 LOC)       │   │ Single + Multi-source │    │
│  │                  │   │ Deduplication          │    │
│  │ Caches index.json│   │ (~200 LOC)            │    │
│  │ per source       │   │                       │    │
│  └─────────────────┘   └──────────────────────┘    │
│                                                     │
│  ┌─────────────────┐   ┌──────────────────────┐    │
│  │ MetadataFetcher  │   │ ReadmeFetcher         │    │
│  │ (~150 LOC)       │   │ (~100 LOC)            │    │
│  │                  │   │                       │    │
│  │ Package index    │   │ Flat container        │    │
│  │ Version details  │   │ README.md retrieval   │    │
│  └─────────────────┘   └──────────────────────┘    │
│                                                     │
│  All 4 use: HttpPipeline (middleware chain)          │
│  All 4 use: ISourceAdapter (Strategy per source)    │
└─────────────────────────────────────────────────────┘
```

```typescript
// src/api/nugetFacade.ts
export class NuGetFacade implements INuGetApiClient {
  constructor(
    private readonly indexResolver: ServiceIndexResolver,
    private readonly searchExecutor: SearchExecutor,
    private readonly metadataFetcher: MetadataFetcher,
    private readonly readmeFetcher: ReadmeFetcher,
  ) {}

  async searchPackages(options: SearchOptions, signal?: AbortSignal, sourceId?: string): Promise<Result<PackageSearchResult[]>> {
    const urls = await this.indexResolver.resolveSearchUrls(sourceId);
    if (!urls.success) return urls;
    return this.searchExecutor.search(urls.value, options, signal, sourceId);
  }

  async getPackageIndex(packageId: string, signal?: AbortSignal, sourceId?: string): Promise<Result<PackageIndex>> {
    const url = await this.indexResolver.resolveRegistrationUrl(sourceId);
    if (!url.success) return url;
    return this.metadataFetcher.getIndex(url.value, packageId, signal);
  }

  async getPackageVersion(packageId: string, version: string, signal?: AbortSignal, sourceId?: string): Promise<Result<PackageVersionDetails>> {
    const url = await this.indexResolver.resolveRegistrationUrl(sourceId);
    if (!url.success) return url;
    return this.metadataFetcher.getVersion(url.value, packageId, version, signal);
  }

  async getPackageReadme(packageId: string, version: string, signal?: AbortSignal, sourceId?: string): Promise<Result<string>> {
    const url = await this.indexResolver.resolveFlatContainerUrl(sourceId);
    if (!url.success) return url;
    return this.readmeFetcher.fetch(url.value, packageId, version, signal);
  }
}
```

The **Strategy pattern** applies to source-specific behaviors:

```typescript
// src/api/adapters/sourceAdapter.ts
export interface ISourceAdapter {
  /** Provider identifier */
  readonly provider: PackageSourceProvider;

  /** Build auth headers for this source */
  getAuthHeaders(source: PackageSource): Record<string, string>;

  /** Should auth be stripped for this redirect URL? */
  shouldStripAuth(sourceOrigin: string, redirectOrigin: string): boolean;

  /** Provider-specific search URL construction */
  buildSearchUrl(baseUrl: string, options: SearchOptions): string;

  /** Provider capabilities */
  readonly capabilities: ProviderCapabilities;

  /** Provider retry/timeout config */
  readonly config: ProviderConfig;
}

// Concrete strategies
export class NuGetOrgAdapter implements ISourceAdapter { /* nuget.org specifics */ }
export class AzureArtifactsAdapter implements ISourceAdapter { /* Azure auth, pagination */ }
export class GitHubPackagesAdapter implements ISourceAdapter { /* GitHub token handling */ }
export class GenericAdapter implements ISourceAdapter { /* Sensible defaults */ }
```

Adding a new source type (e.g., JFrog Artifactory) means implementing one class — no other file changes.

---

#### 4.2.3 Chain of Responsibility (Decorator) — HTTP Pipeline

**Problem (P5):** The existing `pipeline.ts` middleware infrastructure is already built (602 LOC) but not integrated.

**Solution:** Wire the existing pipeline into the decomposed API client. Every HTTP request flows through the middleware chain.

```
Request ──→ [Auth] ──→ [Retry] ──→ [Cache] ──→ [Timeout] ──→ [Logger] ──→ fetch()
                                                                              │
Response ←── [Auth] ←── [Retry] ←── [Cache] ←── [Timeout] ←── [Logger] ←─────┘
```

```typescript
// src/api/createApiPipeline.ts
export function createApiPipeline(logger: ILogger, source: PackageSource): HttpPipeline {
  const adapter = resolveSourceAdapter(source);

  return new HttpPipelineBuilder()
    .use(createLoggingMiddleware(logger))             // Log request/response
    .use(createAuthMiddleware(adapter))               // Inject auth headers
    .use(createRetryMiddleware(adapter.config.retry)) // Exponential backoff
    .use(createCacheMiddleware({                      // LRU cache with TTL
      maxEntries: 200,
      defaultTtl: 300_000, // 5 minutes
    }))
    .use(createTimeoutMiddleware(adapter.config.timeouts))
    .use(createCredentialStripMiddleware(adapter))    // Strip auth on cross-origin
    .build();
}
```

Each middleware is a **Decorator** around the next handler:

```typescript
export type Middleware = (request: HttpRequest, next: Handler) => Promise<HttpResponse>;

// Example: RetryMiddleware
export function createRetryMiddleware(config: RetryConfig): Middleware {
  return async (request, next) => {
    let lastError: PipelineError | undefined;
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await next({ ...request, metadata: { ...request.metadata, attempt } });
      } catch (error) {
        lastError = error as PipelineError;
        if (!config.retryOn.includes(lastError.code)) throw error;
        await delay(config.baseDelay * (config.exponential ? 2 ** attempt : 1));
      }
    }
    throw lastError;
  };
}
```

This eliminates the raw `fetch()` calls scattered throughout the current `NuGetApiClient` and gives every request automatic retry, caching, logging, and timeout — all configurable per source.

---

#### 4.2.4 Mediator + Command — Webview Message Routing

**Problem (P2):** `packageBrowserWebview.ts` at 1034 LOC is a monolithic message router with an ever-growing switch chain.

**Solution:** Use the **Mediator** pattern to decouple message dispatching from handling. Each message type gets its own **Command handler** object.

```typescript
// src/webviews/messaging/messageMediator.ts
export interface IMessageHandler<TMessage = unknown, TResponse = void> {
  readonly messageType: string;
  handle(message: TMessage, context: WebviewContext): Promise<TResponse>;
}

export class WebviewMessageMediator {
  private readonly handlers = new Map<string, IMessageHandler>();

  register(handler: IMessageHandler): void {
    this.handlers.set(handler.messageType, handler);
  }

  async dispatch(message: unknown, context: WebviewContext): Promise<void> {
    if (!isWebviewMessage(message)) {
      context.logger.warn('Invalid webview message received', message);
      return;
    }

    const handler = this.handlers.get(message.type);
    if (!handler) {
      context.logger.warn(`No handler registered for message type: ${message.type}`);
      return;
    }

    try {
      await handler.handle(message, context);
    } catch (error) {
      context.logger.error(`Handler failed for ${message.type}`, error);
    }
  }
}
```

```typescript
// src/webviews/handlers/searchRequestHandler.ts  (~50 LOC each)
export class SearchRequestHandler implements IMessageHandler<SearchRequestMessage> {
  readonly messageType = 'searchRequest';

  constructor(
    private readonly searchService: ISearchService,
    private readonly logger: ILogger,
  ) {}

  async handle(message: SearchRequestMessage, context: WebviewContext): Promise<void> {
    const result = await this.searchService.search(message.payload.query, {
      sourceId: message.payload.sourceId,
      includePrerelease: message.payload.includePrerelease,
    });

    context.panel.webview.postMessage({
      type: 'notification',
      name: 'searchResponse',
      args: result.success ? this.mapToWebview(result.value) : this.mapError(result.error),
    });
  }
}
```

```typescript
// src/webviews/handlers/index.ts — Handler registration
export function createMessageHandlers(deps: WebviewDependencies): IMessageHandler[] {
  return [
    new ReadyHandler(deps.solutionContext, deps.logger),
    new SearchRequestHandler(deps.searchService, deps.logger),
    new LoadMoreRequestHandler(deps.searchService, deps.logger),
    new PackageDetailsRequestHandler(deps.detailsService, deps.logger),
    new GetProjectsRequestHandler(deps.projectParser, deps.solutionContext, deps.logger),
    new InstallPackageRequestHandler(deps.logger),
    new UninstallPackageRequestHandler(deps.logger),
    new GetPackageSourcesRequestHandler(deps.configService, deps.logger),
    new RefreshProjectCacheRequestHandler(deps.projectParser, deps.logger),
  ];
}
```

**Result:** The 1034-LOC monolith becomes:
- `WebviewMessageMediator` (~40 LOC) — routing infrastructure
- 9 handler files (~50 LOC each) — focused, testable, independently modifiable
- `packageBrowserWebview.ts` (~80 LOC) — just HTML setup + mediator wiring

Adding a new IPC message = create one handler class + register it. No existing code changes.

---

#### 4.2.5 Abstract Factory — Service Composition

**Problem:** `extension.ts` is a hand-wired composition root that must be edited for every new service.

**Solution:** An **Abstract Factory** that creates environment-specific service families.

```typescript
// src/core/serviceFactory.ts
export interface IServiceFactory {
  createLogger(context: ExtensionContext): ILogger;
  createNuGetClient(logger: ILogger, options: NuGetApiOptions): INuGetApiClient;
  createCliExecutor(logger: ILogger): ICliExecutor;
  createPackageCliService(executor: ICliExecutor, logger: ILogger): IPackageCliService;
  createProjectParser(executor: ICliExecutor, logger: ILogger): IDotnetProjectParser;
  createConfigService(): IConfigurationService;
}

// Production factory
export class NodeServiceFactory implements IServiceFactory {
  createLogger(context: ExtensionContext): ILogger {
    return createLogger(context);
  }
  createNuGetClient(logger: ILogger, options: NuGetApiOptions): INuGetApiClient {
    return createNuGetFacade(logger, options); // Uses the new Facade
  }
  // ... each method creates real implementations
}

// Test factory
export class TestServiceFactory implements IServiceFactory {
  createLogger(): ILogger {
    return createMockLogger(); // In-memory, no OutputChannel
  }
  createNuGetClient(): INuGetApiClient {
    return createFakeNuGetClient(); // Returns canned responses
  }
  // ... each method creates test doubles
}
```

```typescript
// src/core/serviceContainer.ts
export class ServiceContainer implements Disposable {
  private readonly services = new Map<string, unknown>();
  private readonly disposables: Disposable[] = [];

  constructor(private readonly factory: IServiceFactory) {}

  async initialize(context: ExtensionContext): Promise<void> {
    const logger = this.factory.createLogger(context);
    this.register('logger', logger);

    const config = this.factory.createConfigService();
    this.register('config', config);

    const options = config.getNuGetApiOptions();
    const nugetClient = this.factory.createNuGetClient(logger, options);
    this.register('nugetClient', nugetClient);

    // ... wire remaining services
  }

  get<T>(key: string): T {
    const service = this.services.get(key);
    if (!service) throw new Error(`Service not registered: ${key}`);
    return service as T;
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }
}
```

**Result:** `extension.ts` shrinks to ~20 LOC:

```typescript
export async function activate(context: vscode.ExtensionContext) {
  const container = new ServiceContainer(new NodeServiceFactory());
  await container.initialize(context);
  
  const registry = new CommandRegistry(container);
  registry.registerAll(context);
  
  context.subscriptions.push(container);
}
```

---

#### 4.2.6 Observer — Event Bus

**Problem:** Components communicate via direct function calls or VS Code commands. No internal pub/sub for cross-cutting events.

**Solution:** A lightweight typed event bus.

```typescript
// src/core/eventBus.ts
export type EventMap = {
  'projects:changed': { projectPaths: string[] };
  'cache:invalidated': { keys: string[] };
  'config:changed': { section: string };
  'package:installed': { packageId: string; version: string; projectPath: string };
  'package:uninstalled': { packageId: string; projectPath: string };
  'source:discovered': { source: PackageSource };
};

export interface IEventBus {
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void;
  on<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): Disposable;
  once<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): Disposable;
}

export class EventBus implements IEventBus {
  private readonly listeners = new Map<string, Set<(data: unknown) => void>>();

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    this.listeners.get(event as string)?.forEach(handler => {
      try { handler(data); } catch { /* swallow — observers shouldn't crash emitters */ }
    });
  }

  on<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): Disposable {
    const key = event as string;
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(handler as (data: unknown) => void);
    return { dispose: () => this.listeners.get(key)?.delete(handler as (data: unknown) => void) };
  }

  once<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): Disposable {
    const sub = this.on(event, (data) => {
      sub.dispose();
      handler(data);
    });
    return sub;
  }
}
```

Now the `CacheInvalidationNotifier`, project parser, install/uninstall commands, and webview panels all communicate through the event bus — not through direct references.

---

#### 4.2.7 Factory Method — Generic Type Guards

**Problem (P9):** 16+ nearly identical `isXxxMessage()` functions.

**Solution:** A factory function that generates type guards from a schema.

```typescript
// src/webviews/messaging/messageGuards.ts
interface MessageSchema {
  readonly type: string;
  readonly payloadKeys?: readonly string[];
}

function createMessageGuard<T>(schema: MessageSchema): (msg: unknown) => msg is T {
  return (msg: unknown): msg is T => {
    if (typeof msg !== 'object' || msg === null) return false;
    const obj = msg as Record<string, unknown>;
    if (obj.type !== schema.type) return false;

    if (schema.payloadKeys) {
      if (typeof obj.payload !== 'object' || obj.payload === null) return false;
      const payload = obj.payload as Record<string, unknown>;
      return schema.payloadKeys.every(key => key in payload);
    }

    return true;
  };
}

// Declarations become one-liners:
export const isSearchRequest = createMessageGuard<SearchRequestMessage>({
  type: 'searchRequest',
  payloadKeys: ['query'],
});

export const isInstallRequest = createMessageGuard<InstallPackageRequestMessage>({
  type: 'installPackageRequest',
  payloadKeys: ['packageId', 'version', 'projectPaths'],
});

export const isReadyMessage = createMessageGuard<ReadyMessage>({ type: 'ready' });

// ... 16 guards reduced from ~130 LOC to ~30 LOC
```

---

#### 4.2.8 Builder — Webview Construction

**Problem:** Creating a webview requires understanding CSP, nonces, sanitization, URI helpers, and script injection. The current `buildHtmlTemplate` is good, but panel creation, message handler setup, and lifecycle wiring are manually repeated.

**Solution:** A **Builder** pattern for webview panels.

```typescript
// src/webviews/webviewBuilder.ts
export class WebviewBuilder {
  private title = '';
  private viewType = '';
  private column = vscode.ViewColumn.One;
  private bodyHtml = '';
  private scripts: vscode.Uri[] = [];
  private styles: vscode.Uri[] = [];
  private handlers: IMessageHandler[] = [];
  private retainContext = true;
  private onDispose?: () => void;

  static create(): WebviewBuilder {
    return new WebviewBuilder();
  }

  withTitle(title: string): this { this.title = title; return this; }
  withViewType(viewType: string): this { this.viewType = viewType; return this; }
  withColumn(column: vscode.ViewColumn): this { this.column = column; return this; }
  withBody(html: string): this { this.bodyHtml = html; return this; }
  withScript(uri: vscode.Uri): this { this.scripts.push(uri); return this; }
  withStyle(uri: vscode.Uri): this { this.styles.push(uri); return this; }
  withHandler(handler: IMessageHandler): this { this.handlers.push(handler); return this; }
  withHandlers(handlers: IMessageHandler[]): this { this.handlers.push(...handlers); return this; }
  retainContextWhenHidden(retain: boolean): this { this.retainContext = retain; return this; }
  onDidDispose(callback: () => void): this { this.onDispose = callback; return this; }

  build(context: vscode.ExtensionContext): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
      this.viewType, this.title, this.column,
      { enableScripts: true, retainContextWhenHidden: this.retainContext },
    );

    // Auto-wire CSP, sanitization, scripts
    panel.webview.html = buildHtmlTemplate({
      webview: panel.webview,
      extensionUri: context.extensionUri,
      title: this.title,
      bodyHtml: this.bodyHtml,
      scripts: this.scripts,
      styles: this.styles,
    });

    // Auto-wire message mediator
    const mediator = new WebviewMessageMediator();
    this.handlers.forEach(h => mediator.register(h));
    panel.webview.onDidReceiveMessage(msg => mediator.dispatch(msg, { panel, logger: /* ... */ }));

    if (this.onDispose) panel.onDidDispose(this.onDispose);
    return panel;
  }
}
```

Future webviews (e.g., an Installed Packages view) become simple:

```typescript
const panel = WebviewBuilder.create()
  .withTitle('Installed Packages')
  .withViewType('opm.installedPackages')
  .withBody('<installed-packages-app></installed-packages-app>')
  .withScript(scriptUri)
  .withHandlers(createInstalledPackagesHandlers(deps))
  .build(context);
```

---

#### 4.2.9 Adapter — VS Code Runtime

**Problem (P6):** At least 6 files use runtime `require('vscode')` in method bodies — untraceable and untestable.

**Solution:** A single **Adapter** module that wraps all VS Code API access.

```typescript
// src/core/vscodeRuntime.ts
export interface IVsCodeRuntime {
  readonly workspace: typeof vscode.workspace;
  readonly window: typeof vscode.window;
  readonly commands: typeof vscode.commands;
  readonly extensions: typeof vscode.extensions;
  readonly Uri: typeof vscode.Uri;

  getConfiguration(section: string): vscode.WorkspaceConfiguration;
  createOutputChannel(name: string): vscode.OutputChannel;
  showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>;
  showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined>;
  withProgress<T>(options: vscode.ProgressOptions, task: (progress: vscode.Progress<{ message?: string }>) => Promise<T>): Thenable<T>;
}

// Production adapter (only file that imports vscode at runtime)
export class VsCodeRuntime implements IVsCodeRuntime {
  private readonly api: typeof import('vscode') = require('vscode');

  get workspace() { return this.api.workspace; }
  get window() { return this.api.window; }
  get commands() { return this.api.commands; }
  // ...
}

// Test adapter
export class MockVsCodeRuntime implements IVsCodeRuntime {
  readonly messages: string[] = [];
  showInformationMessage(message: string) {
    this.messages.push(message);
    return Promise.resolve(undefined);
  }
  // ...
}
```

Every service that needs VS Code APIs receives `IVsCodeRuntime` through its constructor. No more scattered `require('vscode')`.

---

## 5. Proposed Architecture <a name="proposed-architecture"></a>

### 5.1 High-Level Structure

```
src/
├── core/                          # Framework-level abstractions
│   ├── result.ts                 # Unified Result<T, E> + combinators
│   ├── eventBus.ts               # Typed pub/sub (Observer)
│   ├── serviceContainer.ts       # Service registry + lifecycle
│   ├── serviceFactory.ts         # Abstract Factory interface + Node impl
│   ├── vscodeRuntime.ts          # VS Code API adapter
│   └── types.ts                  # Shared kernel types
│
├── domain/                        # Pure domain contracts (NO dependencies)
│   ├── models/                   # Data types (preserved from current)
│   ├── nugetApiClient.ts         # INuGetApiClient interface (preserved)
│   └── packageCliService.ts      # IPackageCliService interface
│
├── api/                           # NuGet API implementation
│   ├── nugetFacade.ts            # Facade (implements INuGetApiClient)
│   ├── serviceIndexResolver.ts   # Service index caching
│   ├── searchExecutor.ts         # Single + multi-source search
│   ├── metadataFetcher.ts        # Package index + version details
│   ├── readmeFetcher.ts          # README from flat container
│   └── adapters/                 # Source strategies (one per provider)
│       ├── sourceAdapter.ts      # ISourceAdapter interface
│       ├── nugetOrgAdapter.ts    # nuget.org specifics
│       ├── azureAdapter.ts       # Azure Artifacts specifics
│       ├── githubAdapter.ts      # GitHub Packages specifics
│       └── genericAdapter.ts     # Sensible defaults
│
├── infrastructure/                # Cross-cutting infrastructure
│   ├── http/                     # HTTP pipeline (preserved + integrated)
│   │   ├── pipeline.ts           # Middleware chain types
│   │   ├── middleware/           # Individual middleware modules
│   │   │   ├── auth.ts
│   │   │   ├── retry.ts
│   │   │   ├── cache.ts
│   │   │   ├── timeout.ts
│   │   │   └── logging.ts
│   │   └── lruCache.ts          # Bounded LRU cache
│   └── providers/
│       └── registry.ts           # Provider configs (preserved)
│
├── commands/                      # VS Code commands
│   ├── base/
│   │   ├── packageOperationCommand.ts  # Template Method base
│   │   └── commandRegistry.ts          # Auto-registration
│   ├── packageBrowserCommand.ts        # ~80 LOC
│   ├── installPackageCommand.ts        # ~60 LOC (subclass)
│   └── uninstallPackageCommand.ts      # ~60 LOC (subclass)
│
├── services/                      # Application services
│   ├── loggerService.ts          # Logger (preserved, cleaned up)
│   ├── configurationService.ts   # Config (refactored to use IVsCodeRuntime)
│   ├── cli/                      # CLI integration (preserved)
│   ├── cache/                    # Cache invalidation (uses EventBus)
│   ├── context/                  # Solution context (preserved)
│   └── discovery/                # Solution discovery (preserved)
│
├── webviews/                      # Webview infrastructure
│   ├── webviewBuilder.ts         # Builder pattern
│   ├── webviewHelpers.ts         # CSP, sanitization (preserved)
│   ├── sanitizer.ts              # HTML sanitizer (preserved)
│   ├── messaging/
│   │   ├── messageMediator.ts    # Mediator pattern
│   │   ├── messageGuards.ts      # Factory Method guards
│   │   └── types.ts              # IPC message types (preserved)
│   ├── handlers/                 # One handler per message type
│   │   ├── searchRequestHandler.ts
│   │   ├── detailsRequestHandler.ts
│   │   ├── installRequestHandler.ts
│   │   └── ...
│   ├── services/                 # Webview-specific services (preserved)
│   └── apps/                     # Lit components (preserved, decomposed)
│       └── packageBrowser/
│           ├── packageBrowser.ts        # Root component (~200 LOC, down from 771)
│           ├── controllers/             # Extracted controller logic
│           │   ├── searchController.ts
│           │   ├── detailsController.ts
│           │   └── installController.ts
│           ├── components/              # UI components (preserved)
│           └── state/                   # State management (preserved)
│
└── utils/                         # Pure utilities (preserved)
    ├── batchProcessor.ts
    ├── versionComparator.ts
    └── frameworkParser.ts
```

### 5.2 Dependency Flow

```
                    ┌──────────┐
                    │   core/  │  Result, EventBus, ServiceContainer
                    └────┬─────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
         ┌────────┐ ┌────────┐ ┌──────────────┐
         │domain/ │ │ utils/ │ │infrastructure/│
         │        │ │        │ │   http/       │
         │ Models │ │ Pure   │ │   providers/  │
         │ Ifaces │ │ fns    │ │   Pipeline    │
         └───┬────┘ └────────┘ └──────┬───────┘
             │                        │
         ┌───┴────────────────────────┴───┐
         ▼                                ▼
    ┌─────────┐                    ┌───────────┐
    │services/│                    │   api/     │
    │         │                    │            │
    │ CLI     │                    │ NuGetFacade│
    │ Logger  │                    │ Adapters   │
    │ Config  │                    │ Executors  │
    └────┬────┘                    └─────┬─────┘
         │                               │
         └───────────┬───────────────────┘
                     ▼
              ┌────────────┐
              │ commands/   │
              │             │
              │ Template    │
              │ Method base │
              └──────┬─────┘
                     ▼
              ┌────────────┐
              │ webviews/   │
              │             │
              │ Mediator    │
              │ Handlers    │
              │ Builder     │
              │ Lit apps    │
              └─────────────┘
```

**Arrows point downward = dependency direction.** Upper layers never import from lower layers.

---

## 6. Layer-by-Layer Redesign <a name="layer-by-layer-redesign"></a>

### 6.1 Core Layer (`src/core/`)

| Module | Pattern | LOC | Purpose |
|--------|---------|-----|---------|
| `result.ts` | — | ~50 | Unified `Result<T, E>`, `ok()`, `fail()`, `mapResult()`, `flatMapResult()` |
| `eventBus.ts` | Observer | ~60 | Typed event pub/sub with `Disposable` cleanup |
| `serviceContainer.ts` | Registry | ~80 | Service lifecycle: register, get, dispose |
| `serviceFactory.ts` | Abstract Factory | ~100 | `IServiceFactory` + `NodeServiceFactory` + `TestServiceFactory` |
| `vscodeRuntime.ts` | Adapter | ~80 | `IVsCodeRuntime` — sole gateway to VS Code APIs |
| `types.ts` | — | ~30 | `Disposable`, `CancellationToken`, shared primitives |

**Total: ~400 LOC** (framework). Stable. Rarely changes.

### 6.2 Domain Layer (`src/domain/`)

Preserved almost entirely from the current codebase. Changes:

- **Delete** `domainProvider.ts` and `domainProviderService.ts` (dead code)
- **Replace** `DomainResult<T>` references with `Result<T>` from core
- **Replace** `NuGetResult<T>` with `Result<T, AppError>` from core
- **Keep** `INuGetApiClient` interface, all domain models, all parsers

### 6.3 API Layer (`src/api/`)

| Module | Pattern | LOC | Replaces |
|--------|---------|-----|----------|
| `nugetFacade.ts` | Facade | ~80 | `env/node/nugetApiClient.ts` (1376 LOC) |
| `serviceIndexResolver.ts` | — | ~150 | Index resolution logic from NuGetApiClient |
| `searchExecutor.ts` | — | ~200 | Search + multi-source + dedup logic |
| `metadataFetcher.ts` | — | ~150 | Package index + version logic |
| `readmeFetcher.ts` | — | ~100 | README fetch logic |
| `adapters/*.ts` | Strategy | ~400 | Inline provider-specific code |

**Total: ~1080 LOC** (down from 1376 in a single file, now across 9 focused files).

### 6.4 Commands Layer (`src/commands/`)

| Module | Pattern | LOC | Replaces |
|--------|---------|-----|----------|
| `base/packageOperationCommand.ts` | Template Method | ~120 | Shared install/uninstall workflow |
| `base/commandRegistry.ts` | — | ~40 | Manual registration in extension.ts |
| `installPackageCommand.ts` | Template Method | ~60 | 328 LOC current |
| `uninstallPackageCommand.ts` | Template Method | ~60 | 316 LOC current |
| `packageBrowserCommand.ts` | — | ~80 | 115 LOC current (slightly simplified) |

**Total: ~360 LOC** (down from 760).

### 6.5 Webview Layer (`src/webviews/`)

| Module | Pattern | LOC | Replaces |
|--------|---------|-----|----------|
| `webviewBuilder.ts` | Builder | ~100 | Manual panel creation |
| `messaging/messageMediator.ts` | Mediator | ~40 | Switch chain in packageBrowserWebview |
| `messaging/messageGuards.ts` | Factory Method | ~30 | 130 LOC of boilerplate guards |
| `handlers/*.ts` (9 files) | Command | ~450 | Message handling in packageBrowserWebview |
| `packageBrowserWebview.ts` | — | ~80 | 1034 LOC current (now just wiring) |

**Total: ~700 LOC** (down from 1034 in a single file).

---

## 7. Cross-Cutting Concerns <a name="cross-cutting-concerns"></a>

### 7.1 Bounded Caches

Every cache in the redesign uses an LRU (Least Recently Used) eviction strategy with configurable bounds:

```typescript
// src/infrastructure/http/lruCache.ts
export class LruCache<K, V> {
  private readonly cache = new Map<K, { value: V; expiresAt: number }>();

  constructor(
    private readonly maxEntries: number,
    private readonly defaultTtlMs: number,
  ) {}

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) { this.cache.delete(key); return undefined; }
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    if (this.cache.size >= this.maxEntries) {
      // Evict oldest (first entry in Map iteration order)
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs) });
  }

  invalidate(key: K): boolean { return this.cache.delete(key); }
  clear(): void { this.cache.clear(); }
  get size(): number { return this.cache.size; }
}
```

Cache configuration per concern:

| Cache | Max Entries | TTL | Location |
|-------|------------|-----|----------|
| Service index URLs | 20 | 1 hour | `ServiceIndexResolver` |
| HTTP responses | 200 | 5 minutes | `CacheMiddleware` |
| Package details | 100 | 10 minutes | `PackageDetailsService` |
| Project parse results | 50 | 1 minute | `DotnetProjectParser` |
| Search results | 50 | 2 minutes | `SearchService` |

### 7.2 Error Handling Strategy

```
External boundary   →  catch + wrap as AppError  →  return Result
Service boundary    →  receive Result            →  map/forward Result
Command boundary    →  receive Result            →  show notification
Webview boundary    →  receive notification      →  render error state
```

No exceptions cross layer boundaries. Every layer returns `Result<T, AppError>`.

### 7.3 Lifecycle Management

```typescript
// In ServiceContainer
async initialize(): Promise<void> {
  // Phase 1: Core (logger, config, event bus)
  // Phase 2: Infrastructure (HTTP pipeline, adapters)
  // Phase 3: Domain services (API client, CLI services)
  // Phase 4: Application services (project parser, solution context)
  // Phase 5: Commands (registration)
}

dispose(): void {
  // Reverse order: commands → services → infrastructure → core
  this.disposables.reverse().forEach(d => d.dispose());
}
```

---

## 8. Migration Strategy <a name="migration-strategy"></a>

The rewrite should happen **incrementally**, not as a big-bang. Each phase delivers a working extension.

### Phase 1: Foundation (Low Risk)

- [ ] Create `src/core/result.ts` with unified `Result<T, E>`
- [ ] Create `src/core/eventBus.ts`
- [ ] Create `src/core/vscodeRuntime.ts` adapter
- [ ] Delete dead code: `domainProvider.ts`, `domainProviderService.ts`
- [ ] Replace `NuGetResult<T>` aliases to use `Result<T, AppError>` (type-level, not runtime)

**Risk:** Low. Additive changes + dead code removal.

### Phase 2: Command Template Method (Medium Risk)

- [ ] Create `PackageOperationCommand` base class
- [ ] Rewrite `InstallPackageCommand` as subclass
- [ ] Rewrite `UninstallPackageCommand` as subclass
- [ ] Verify all unit + E2E tests pass

**Risk:** Medium. Changes control flow but preserves external behavior.

### Phase 3: API Decomposition (Medium Risk)

- [ ] Extract `ServiceIndexResolver` from `NuGetApiClient`
- [ ] Extract `SearchExecutor` from `NuGetApiClient`
- [ ] Extract `MetadataFetcher` from `NuGetApiClient`
- [ ] Extract `ReadmeFetcher` from `NuGetApiClient`
- [ ] Create `NuGetFacade` that delegates to all four
- [ ] Wire HTTP pipeline middleware into all fetchers
- [ ] Create source adapters (Strategy)
- [ ] Verify integration tests pass

**Risk:** Medium. Core API logic changes shape but not behavior.

### Phase 4: Webview Mediator (Medium Risk)

- [ ] Create `WebviewMessageMediator`
- [ ] Extract each `handleXxxRequest` into its own `IMessageHandler`
- [ ] Create `WebviewBuilder`
- [ ] Create generic type guard factory
- [ ] Simplify `packageBrowserWebview.ts` to ~80 LOC
- [ ] Verify E2E tests pass

**Risk:** Medium. IPC contract unchanged; routing internals restructured.

### Phase 5: Service Container (Low Risk)

- [ ] Create `IServiceFactory` + `NodeServiceFactory`
- [ ] Create `ServiceContainer`
- [ ] Rewrite `extension.ts` to use container
- [ ] Create `TestServiceFactory` for E2E tests

**Risk:** Low. Structural change to activation; no behavior change.

### Phase 6: Polish

- [ ] Decompose `<package-browser-app>` into controllers
- [ ] Add `LruCache` to all cache sites
- [ ] Integrate `EventBus` for project changes → webview updates
- [ ] Update documentation

---

## 9. Appendix: Pattern Catalog <a name="appendix-pattern-catalog"></a>

### Quick Reference: GoF Patterns Used

| Pattern | Category | Where Applied | Classic GoF Intent |
|---------|----------|--------------|-------------------|
| **Abstract Factory** | Creational | `ServiceContainer` + `IServiceFactory` | Provide an interface for creating families of related objects without specifying their concrete classes |
| **Factory Method** | Creational | `createMessageGuard<T>()` | Define an interface for creating an object, but let subclasses decide which class to instantiate |
| **Builder** | Creational | `WebviewBuilder`, `HttpPipelineBuilder` | Separate the construction of a complex object from its representation |
| **Facade** | Structural | `NuGetFacade` over 4 sub-services | Provide a unified interface to a set of interfaces in a subsystem |
| **Adapter** | Structural | `VsCodeRuntime`, `IFileSystemWatcher` | Convert the interface of a class into another interface clients expect |
| **Decorator** | Structural | HTTP middleware chain | Attach additional responsibilities to an object dynamically |
| **Template Method** | Behavioral | `PackageOperationCommand` base | Define the skeleton of an algorithm, deferring some steps to subclasses |
| **Strategy** | Behavioral | `ISourceAdapter` per provider | Define a family of algorithms, encapsulate each one, and make them interchangeable |
| **Mediator** | Behavioral | `WebviewMessageMediator` | Define an object that encapsulates how a set of objects interact |
| **Observer** | Behavioral | `EventBus`, `CacheInvalidationNotifier` | Define a one-to-many dependency so that when one object changes state, all dependents are notified |
| **Command** | Behavioral | `IMessageHandler<TRequest>` | Encapsulate a request as an object, thereby letting you parameterize clients with different requests |

### Pattern Interaction Map

```
                    Abstract Factory
                         │
                   creates services
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
           Facade    Template     Builder
          (API)      Method       (Webview)
           │        (Commands)       │
    ┌──────┼──────┐      │       ┌──┼──┐
    ▼      ▼      ▼      ▼       ▼     ▼
Strategy Decorator  │  Observer Mediator Command
(Source  (HTTP     │  (Events) (IPC    (Message
Adapter) Pipeline) │          Router)  Handler)
                   │
              Adapter
           (VS Code Runtime)
```

### Extensibility Scenarios

| Scenario | What to Implement | Files to Create | Files to Modify |
|----------|-------------------|-----------------|-----------------|
| Add new package source (e.g., Artifactory) | `ArtifactoryAdapter implements ISourceAdapter` | 1 file | 0 (auto-discovered by adapter registry) |
| Add new command (e.g., Update Package) | `UpdatePackageCommand extends PackageOperationCommand` | 1 file | 0 (auto-registered by `CommandRegistry`) |
| Add new webview (e.g., Installed Packages) | Handler modules + Lit components + `WebviewBuilder.create()...build()` | 3-5 files | 0 (uses Builder pattern) |
| Add new IPC message type | `IMessageHandler` implementation + message guard | 2 declarations | 0 (registered with Mediator) |
| Add HTTP middleware (e.g., rate limiting) | `createRateLimitMiddleware()` | 1 file | 1 line (add to pipeline builder) |
| Add new event type | Entry in `EventMap` + emit/subscribe | 0 files (type change) | 0 (type system enforces) |

### LOC Comparison

| Component | Current | Redesign | Reduction |
|-----------|---------|----------|-----------|
| NuGet API client | 1,376 (1 file) | ~1,080 (9 files, max 200 each) | 21% fewer LOC, no file > 200 |
| Webview host | 1,034 (1 file) | ~700 (12 files, max 100 each) | 32% fewer LOC, no file > 100 |
| Install + Uninstall commands | 644 (2 files) | ~240 (3 files) | 63% fewer LOC |
| IPC type guards | ~130 (1 file) | ~30 (1 file) | 77% fewer LOC |
| extension.ts | ~90 | ~20 | 78% fewer LOC |
| **Total identified** | **~3,274** | **~2,070** | **37% reduction** |

---

*This redesign preserves every security pattern, result type, and domain contract that makes OPM production-grade — while eliminating structural debt through targeted application of Gang of Four patterns. The architecture becomes one where extensibility is achieved by implementing interfaces, not by editing existing code.*
