# Octothorpe Package Manager — VS Code Extension for .NET NuGet Dependency Management

A cross-platform VS Code extension that provides intuitive NuGet package browsing, searching, installation, and dependency management directly within the editor. Built with modern TypeScript idioms, Gang of Four design patterns, and a Lit-based webview UI.

## Core Features

### Search & Browse Packages
- **Multi-source search**: Query across public and private NuGet feeds simultaneously — nuget.org, Azure Artifacts, GitHub Packages, Artifactory, MyGet, and custom sources.
- **Real-time search with intelligent filtering**: Paginated results with support for `skip`/`take` parameters; parallel aggregation when searching multiple sources concurrently.
- **Verified publisher badges**: Display a verified badge on packages from trusted publishers in the NuGet ecosystem.
- **Prerelease toggle**: Filter between stable-only and include-prerelease versions via a dedicated UI component.
- **Framework-specific version selection**: Show all available versions of a package when selecting which to install; support for framework-targeted dependency resolution.

### Install & Manage Dependencies
- **Interactive project targeting**: Select one or more `.csproj` files in a multi-project solution before installing; "Select All" checkbox with indeterminate state.
- **Install packages**: Add NuGet package references (`<PackageReference>`) to any combination of projects in the current workspace.
- **Uninstall packages**: Remove existing NuGet package references from selected projects.
- **Update packages**: Upgrade installed packages to a newer version across targeted projects.
- **Multi-project batch processing**: Concurrently execute operations on up to 3 projects at a time with progress reporting and cancellation support.
- **Auto-discovery of projects**: Scan the workspace for `.csproj` files (configurable scan depth) or detect open solution files; display target frameworks (`net8.0`, `netstandard2.0`, etc.) per project.
- **Cache invalidation on file changes**: File watchers on `.csproj` files automatically refresh installed-package status in the UI when projects are modified externally.

### Package Details Panel
- **Rich metadata view**: Display package description, version history, download counts, authors, tags, and icon URLs.
- **Dependency tree by framework**: Show direct dependencies grouped per target framework with collapsible accordion sections (no transitive dependency expansion).
- **README viewer**: Fetch and render package README content in the details panel; HTML sanitized for security before display.
- **Version selector dropdown**: Browse all available versions of a package to choose which to install or update to.

### Source Configuration & Management
- **Auto-discover sources from `nuget.config`**: Parse local NuGet configuration files to automatically populate available feeds without manual setup.
- **Provider-aware service index resolution**: Use provider-specific strategies (NuGetOrg, AzureArtifacts, Artifactory, GitHub, MyGet) to resolve the correct v3 API endpoint via service index negotiation.
- **Source selector in UI**: Filter search results by a specific source or query all enabled sources at once; toggle individual sources on/off.

### Toolbar & Actions
- **Package action buttons** on each result card: Install, Update (when installed), Uninstall — contextualized based on whether the package is already present in the selected project(s).
- **Refresh project cache button**: Manually trigger re-parsing of all projects to refresh installed-package status without reloading the webview.

## Design Requirements
- **VS Code-native look and feel**: All UI renders as a webview panel styled with VS Code CSS variables (`--vscode-editor-background`, `--vscode-button-background`, etc.) that auto-update when users change themes; zero custom theme service needed.
- **Lit-based component architecture**: Webview built from reusable Lit web components (`<package-card>`, `<dependency-tree>`, `<search-input>`, `<project-selector>`, etc.) with custom element tags exported as `as const` constants for dependency tracking.
- **State managers**: Encapsulated, testable state classes (`SearchState`, `DetailsState`, `ProjectsState`, `SourcesState`, `SelectionState`) separate from UI rendering; reactive updates via a version-counter pattern in Lit's `@state()`.
- **Responsive layout**: Search results list on the left with an optional details panel that slides in when selecting a package card.

## Technical Constraints
- **Framework**: VS Code Extension API (targeting ^1.105.0).
- **Frontend**: Vite + **Lit 3** web components for the Package Browser webview; Lit's reactive properties, shadow DOM encapsulation, and CSS scoped styles.
- **Backend**: TypeScript with esbuild bundling to a single `out/extension.js` entry point (CJS format for VS Code).
- **Architecture Patterns**:
    - **Template Method**: `PackageOperationCommand` abstract base class defines the shared algorithm (validate → deduplicate → batch-concurrent execute → cache-invalidate → summarize); subclasses override only operation-specific hooks.
    - **Facade + Strategy**: `NuGetApiFacade` decomposes a monolithic API client into four focused collaborators (`ServiceIndexResolver`, `SearchExecutor`, `MetadataFetcher`, `ReadmeFetcher`) plus pluggable provider strategies for service index negotiation.
    - **Chain of Responsibility (Decorator)**: Composable HTTP middleware pipeline with `RetryMiddleware` and `RateLimitMiddleware` decorating a base `FetchHttpClient`.
    - **Abstract Factory + DI**: `IServiceFactory` produces environment-specific service families (`NodeServiceFactory` vs `TestServiceFactory`); `ServiceContainer` orchestrates lifecycle.
    - **Observer / Event Bus**: Typed pub/sub for cross-component events (`projects:changed`, `cache:invalidated`, `package:installed`).
    - **Mediator + Command**: `WebviewMessageMediator` routes IPC messages to per-message handler classes implementing `IMessageHandler<TMessage>`.
- **Result Types Everywhere**: Unified `Result<T, E>` discriminated union (`{ success: true; value } | { success: false; error }`) for all operations — no exception-based control flow. Custom error unions: `NuGetError`, `AppError` with codes like `'Network'`, `'RateLimit'`, `'ApiError'`, `'ParseError'`.
- **CSP + Sanitization**: Strict Content Security Policy (`default-src 'none'`) with nonce-based inline scripts; all external HTML (READMEs, descriptions) sanitized via `sanitizeHtml()` before injection.
- **Bounded LRU Cache with TTL**: Size-limited caches prevent memory leaks in long-running sessions; time-based expiration keeps metadata fresh.
- **Externals NOT bundled**: `vscode`, `node:*` loaded at runtime from the extension host; only Lit components ship to the webview context.

## Project Structure
```
src/
├── extension.ts                  # Activation entry point: ServiceContainer initialization, command registration
├── api/                          # NuGet API layer (post-refactor facade)
│   ├── nugetApiFacade.ts         # Facade delegating to specialized services
│   ├── httpPipeline.ts           # Composable middleware pipeline (RetryMiddleware, RateLimitMiddleware)
│   └── strategies/               # Provider-specific service index resolution (AzureArtifacts, Artifactory, GitHub, MyGet, NuGetOrg)
├── commands/                     # Command implementations (opm.* namespace)
│   ├── base/packageOperationCommand.ts  # Template Method abstract base for install/uninstall/update
│   ├── installPackageCommand.ts
│   ├── uninstallPackageCommand.ts
│   ├── updatePackageCommand.ts
│   └── packageBrowserCommand.ts    # Opens the Package Browser webview panel
├── core/                         # Core abstractions
│   ├── result.ts                 # Unified Result<T, E> type + helpers (ok, fail, mapResult)
│   ├── eventBus.ts               # Typed pub/sub event system
│   └── vscodeRuntime.ts          # VS Code API adapter (MockVsCodeRuntime for tests)
├── domain/                       # Domain layer: models, contracts, parsers
│   ├── models/                   # PackageSearchResult, PackageDependency, DependencyGroup, NuGetError, etc.
│   ├── nugetApiClient.ts         # INuGetApiClient interface (pure contract)
│   └── parsers/                  # Response parsers for API wire formats
├── env/node/                     # Node.js-specific implementations
│   ├── nodeServiceFactory.ts     # Production service factory
│   ├── nugetConfigParser.ts      # Parse nuget.config XML
│   └── executor.ts               # Spawn dotnet CLI processes
├── infrastructure/               # Cross-cutting infrastructure
│   ├── lruCache.ts               # Bounded LRU cache with TTL expiration
│   ├── serviceContainer.ts       # DI orchestration container
│   └── serviceFactory.ts         # IServiceFactory abstract factory interface
├── services/                     # Long-lived services
│   ├── cli/                      # dotnet CLI integration
│   │   ├── packageCliService.ts  # High-level CLI operations (install, uninstall, update)
│   │   ├── dotnetProjectParser.ts
│   │   └── dotnetSolutionParser.ts
│   ├── configurationService.ts   # VS Code settings access
│   ├── context/solutionContextService.ts
│   ├── discovery/solutionDiscoveryService.ts
│   ├── loggerService.ts          # Structured logging abstraction
│   └── cache/                    # Cache invalidation via event bus
├── utils/                        # Pure utilities
│   ├── async.ts                  # batchConcurrent bounded-concurrency executor
│   ├── versionComparator.ts      # NuGet version comparison (semver-aware)
│   └── frameworkComparator.ts    # Target framework moniker comparison
└── webviews/                     # Webview infrastructure + Package Browser UI
    ├── apps/packageBrowser/
    │   ├── components/           # Lit web components (<package-card>, <dependency-tree>, etc.)
    │   ├── controllers/          # SearchController, DetailsController
    │   ├── state/                # SearchState, DetailsState, ProjectsState, SourcesState, SelectionState
    │   ├── styles/               # VS Code CSS variable-based styling
    │   └── types.ts              # IPC message discriminated unions + type guards
    ├── builders/webviewBuilder.ts
    ├── handlers/                 # Per-message WebviewMessageMediator handlers (searchHandler, installPackageHandler, etc.)
    ├── mediator/webviewMessageMediator.ts
    ├── packageBrowserWebview.ts  # Webview host: HTML generation, message routing, lifecycle
    ├── sanitizer.ts              # HTML sanitization for external content
    └── webviewHelpers.ts         # CSP meta builder, URI utils, buildHtmlTemplate()
```

## Prerequisites
- **.NET SDK** installed on the host machine (required for `dotnet` CLI operations).
- **VS Code 1.105+**.
- A workspace containing `.csproj` files or an open solution file (`.sln`).
