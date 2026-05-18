# Octothorpe Package Manager — VS Code Extension for .NET NuGet Dependency Management (Hybrid v2 Architecture)

A cross-platform VS Code extension that provides intuitive NuGet package browsing, searching, installation, and dependency management directly within the editor. Built with modern TypeScript idioms, Gang of Four design patterns, a Lit-based webview UI, and an evolved **Reactive Micro-kernel** architecture for scalable extensibility.

## Core Features

### Search & Browse Packages
- **Multi-source search**: Query across public and private NuGet feeds simultaneously — nuget.org, Azure Artifacts, GitHub Packages, Artifactory, MyGet, and custom sources.
- **Progressive search results (Streaming)**: As NuGet returns partial results, the `PackageStore` is updated incrementally via an `AsyncIterable`. The UI renders "live" as packets arrive, dramatically improving perceived performance through progressive hydration rather than waiting for a single monolithic response.
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
- **Reactive UI (Domain Store)**: The Webview is a pure visual representation of the reactive Domain Store. State flows one way: `Store → UI`. Eliminates "state drift" between the Webview and Extension Host — no manual IPC message handlers are required for data synchronization. Subscribes to store streams via a lightweight signals-based reactivity engine (e.g., `@preact/signals` or RxJS).
- **Lit-based component architecture**: Webview built from reusable Lit web components (`<package-card>`, `<dependency-tree>`, `<search-input>`, `<project-selector>`, etc.) with custom element tags exported as `as const` constants for dependency tracking.
- **State managers (Adopted)**: Encapsulated, testable state classes (`SearchState`, `DetailsState`, `ProjectsState`, `SourcesState`, `SelectionState`) remain in the webview context for UI-specific concerns; they mirror and subscribe to the corresponding reactive Domain Store slices.
- **Responsive layout**: Search results list on the left with an optional details panel that slides in when selecting a package card.

## Technical Constraints
- **Framework**: VS Code Extension API (targeting ^1.105.0).
- **Frontend**: Vite + **Lit 3** web components for the Package Browser webview; Lit's reactive properties, shadow DOM encapsulation, and CSS scoped styles.
- **Backend**: TypeScript with esbuild bundling to a single `out/extension.js` entry point (CJS format for VS Code).
- **Architecture Patterns**:
    - **Reactive Micro-kernel (Plugin Registry)**: A minimal `IKernel` registry manages `Commands`, `Services`, and `DataProviders`. New features are implemented as "Plugins" that self-register via a standardized interface (`IPlugin { id, activate(kernel) }`). The core extension code never changes when new features are added — replacing the rigid Abstract Factory + ServiceContainer wiring model.
    - **Template Method**: `PackageOperationCommand` abstract base class defines the shared algorithm (validate → deduplicate → batch-concurrent execute → cache-invalidate → summarize); subclasses override only operation-specific hooks.
    - **Facade + Strategy**: `NuGetApiFacade` decomposes a monolithic API client into four focused collaborators (`ServiceIndexResolver`, `SearchExecutor`, `MetadataFetcher`, `ReadmeFetcher`) plus pluggable provider strategies for service index negotiation.
    - **Chain of Responsibility (Decorator)**: Composable HTTP middleware pipeline with `RetryMiddleware` and `RateLimitMiddleware` decorating a base `FetchHttpClient`.
    - **Observer / Event Bus**: Typed pub/sub for cross-component events (`projects:changed`, `cache:invalidated`, `package:installed`). The EventBus bridges the Domain Store with legacy command execution.
    - **Mediator + Command**: `WebviewMessageMediator` routes IPC messages to per-message handler classes implementing `IMessageHandler<TMessage>`.
- **Reactive Domain Store (Single Source of Truth)**: The Domain Layer is a set of observable reactive stores (`PackageStore`, `ProjectStore`, `ConfigurationStore`). A user action sends an **Intent** to the Store; the Store updates its internal state and all observers (Webview, Status Bar) automatically react via streams. Command execution returns `Result<T, E>` for success/failure semantics while data flows through reactive stores — combining the predictability of Result types with the synchronization guarantees of a unified domain truth.
- **Stream-Oriented I/O (Progressive Hydration)**: API search calls return `AsyncIterable` streams so partial results hydrate the UI incrementally. CLI operations (`dotnet add package`) remain `Promise<Result<T, E>>` as they are short-lived processes with single-shot output — streaming is applied selectively where it improves UX.
- **Result Types Everywhere**: Unified `Result<T, E>` discriminated union (`{ success: true; value } | { success: false; error }`) for all command execution operations — no exception-based control flow. Custom error unions: `NuGetError`, `AppError` with codes like `'Network'`, `'RateLimit'`, `'ApiError'`, `'ParseError'`.
- **Plugin Extensibility (Low Feature Cost)**: Adding a new NuGet source or command requires only one plugin file — self-registration eliminates the "wiring tax" of updating `IServiceFactory`, `ServiceContainer`, `package.json`, and service type maps. The migration path uses a hybrid bridge phase where both `ServiceContainer` and Kernel coexist before deprecating manual wiring.
- **CSP + Sanitization**: Strict Content Security Policy (`default-src 'none'`) with nonce-based inline scripts; all external HTML (READMEs, descriptions) sanitized via `sanitizeHtml()` before injection.
- **Package Manager & Runtime (Bun)**: Development workflow uses **Bun** as the package manager and JavaScript/TypeScript runtime. All project scripts in `package.json` use `bun` (e.g., `bun install`, `bun run build`, `bun test`). Bun's native test runner replaces Jest/Mocha for unit tests; its built-in bundler capabilities complement esbuild. Bun must be available on the PATH.
- **DevContainer / Docker Requirements**: The `.devcontainer` workflow requires:
    - **Docker** (v24+) or **Podman** with the `compose` plugin, providing containerized build and test isolation.
    - **.NET SDK** (latest stable) installed inside the dev container for CLI operations (`dotnet add package`, `dotnet restore`).
    - **Bun** installed inside the dev container (`bun install` must succeed from within). The dev container image should include both Node.js 20 LTS and Bun as runtimes.
    - **VS Code Remote-Containers extension** (or GitHub Codespaces) for mounting the workspace into the container with full VS Code API integration.
    - A `.devcontainer/devcontainer.json` that provisions the container with: `vscode-extensions ms-dotnettools.csharp`, `vscode-extensions vscode.typescript-language-features`, and any other extension host dependencies required by OPM. The container must expose the same environment variables, volume mounts (for NuGet cache and dotnet SDK), and lifecycle scripts (`postCreateCommand`, `postStartCommand`) as the current devcontainer configuration.
    - **Docker Compose** for orchestrating multi-service environments (e.g., local Artifactory or Azure Artifacts emulator for integration testing).
- **Bounded LRU Cache with TTL**: Size-limited caches prevent memory leaks in long-running sessions; time-based expiration keeps metadata fresh.
- **Externals NOT bundled**: `vscode`, `node:*` loaded at runtime from the extension host; only Lit components ship to the webview context.

## Migration & Implementation Roadmap

### Phase 1: The Foundation (Kernel & Stores)
* Implement the `IKernel` and base plugin registry.
* Create the first reactive store (`ConfigurationStore`) using a lightweight signals-based reactivity engine.
* Migrate core configuration access from `IServiceFactory` to `ConfigurationStore`.

### Phase 2: Hybrid Bridge + Streaming Search
* Introduce the Kernel alongside the existing `ServiceContainer`.
* Wrap current services as "Legacy Plugins" so they can be used by new reactive components during migration.
* Rewrite the search path in `NuGetApiFacade` to return `AsyncIterable` streams for progressive hydration.
* Connect the Webview's state managers to subscribe to Domain Store slices, eliminating manual IPC data sync for search results.

### Phase 3: Full Reactive Transition
* Migrate remaining domain stores (`PackageStore`, `ProjectStore`).
* Rebuild the Package Browser Webview using a pure-reactive model (data flows one way: Store → UI).
* Deprecate and remove `ServiceContainer` manual wiring; all services are discovered via Kernel plugins.

## Prerequisites
- **.NET SDK** installed on the host machine (required for `dotnet` CLI operations).
- **VS Code 1.105+**.
- A workspace containing `.csproj` files or an open solution file (`.sln`).
- **Lightweight reactivity engine**: `@preact/signals` (recommended) or RxJS for Domain Store observables — minimal bundle footprint (~2 KB gzipped).
