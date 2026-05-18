# Octothorpe Package Manager — VS Code Extension for .NET NuGet Dependency Management

A cross-platform VS Code extension that provides intuitive NuGet package browsing, searching, installation, and dependency management directly within the editor. Built with modern TypeScript idioms, Gang of Four design patterns, a Lit-based webview UI, and a **Reactive Micro-kernel** plugin registry architecture for scalable extensibility.

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
- **Multi-project batch processing** (fail-fast): Execute `dotnet add/remove/update package` commands concurrently across up to 3 projects. First failure cancels remaining queued operations; user sees which projects completed successfully and which failed, with retry available for individual projects.
- **Auto-discovery of projects**: Scan the workspace for `.csproj` files up to a configurable scan depth and extract their target frameworks (TFMs) from XML for display purposes.
- **Cache invalidation on file changes**: File watchers on `.csproj` files automatically refresh installed-package status in the UI when projects are modified externally.

### Package Details Panel
- **Rich metadata view**: Display package description, version history, download counts, authors, tags, and icon URLs.
- **Dependency tree by framework**: Show direct dependencies grouped per target framework with collapsible accordion sections (no transitive dependency expansion).
- **README viewer**: Fetch and render package README content in the details panel; HTML sanitized for security before display.
- **Version selector dropdown**: Browse all available versions of a package to choose which to install or update to.

### Source Configuration & Management
- **Auto-discover sources from `dotnet nuget list source`**: Parse output into `{ id, name, isPersistent }[]` and store as a read-only snapshot refreshable via `async refreshSources()` — no manual configuration needed.
- **Provider-aware service index resolution**: Use provider-specific strategies (NuGetOrg, AzureArtifacts) to negotiate the correct v3 API endpoint per source type. MVP targets nuget.org + Artifactory only.
- **Single set of active sources** — no separate "selected" vs "enabled." Every discovered source participates in search by default; unchecking one excludes it from the current query only. Re-enabling includes it again.
- **Source switching**: Switch between "All" sources or a specific single source — searching with "All" triggers a unified network search across all enabled feeds; selecting a specific source filters existing results client-side without another network request and switching back to "All" triggers a fresh search.

### Toolbar & Actions
- **Package action buttons** on each result card: Install, Update (when installed), Uninstall — contextualized based on whether the package is already present in the selected project(s).
- **Refresh project cache button**: Manually trigger re-parsing of all projects to refresh installed-package status without reloading the webview.

## Design Requirements
- **VS Code-native look and feel**: All UI renders as a webview panel styled with VS Code CSS variables (`--vscode-editor-background`, `--vscode-button-background`, etc.) that auto-update when users change themes; zero custom theme service needed.
- **Reactive UI (Domain Store)**: The Webview is a pure visual representation of the reactive Domain Store. State flows one way: `Store → UI`. Eliminates "state drift" between the Webview and Extension Host — no manual IPC message handlers are required for data synchronization. Subscribes to store streams via a lightweight signals-based reactivity engine (e.g., `@preact/signals`).
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
    - **Facade + Strategy**: `NuGetApiFacade` decomposes a monolithic API client into four focused collaborators (`ServiceIndexResolver`, `SearchExecutor`, `MetadataFetcher`, `ReadmeFetcher`) plus pluggable provider strategies for service index negotiation. Search produces one unified sorted result set across all enabled sources (not grouped); each `PackageResult` carries a `source: string` label for subtle UI badges.
    - **Chain of Responsibility (Decorator)**: Composable HTTP middleware pipeline `RetryMiddleware → RateLimitMiddleware → BaseClient`. Outer retry wraps inner rate-limit — a 429 hits the outer retry, which waits for the rate limiter's backoff window then retries. One coherent flow: transient error or rate limit → wait → retry.
    - **Observer / Event Bus**: Strict compile-time schema payloads per event type (e.g., `package:installed` carries `{ packageName, version, projectId }`). ~6-8 events total for MVP — small surface area means type safety over dynamic dispatch. Bridges the Domain Store with command execution paths.
    - **Mediator + Command**: `WebviewMessageMediator` routes VS Code `postMessage` IPC messages via mediator pattern to per-command handler classes (`InstallHandler`, `UpdateHandler`, etc.). One handler per command type. Self-contained, testable, easy to add new commands.
- **Reactive Domain Store (Single Source of Truth)**: The Domain Layer is a set of observable reactive stores (`ConfigurationStore`, `PackageStore`, `ProjectStore`). A user action sends an **Intent** to the Store; the Store updates its internal state and all observers automatically react via streams. Stores may cross-subscribe to other stores' signals (e.g., PackageStore listens to ConfigurationStore.prereleaseEnabled) for intuitive one-signal-flip-one-outcome behavior without webview state manager wiring complexity. Command execution returns `Result<T, E>` for success/failure semantics while data flows through reactive stores — combining the predictability of Result types with the synchronization guarantees of a unified domain truth.
- **Stream-Oriented I/O (Progressive Hydration)**: API search calls return `AsyncIterable` streams so partial results hydrate the UI incrementally. CLI operations (`dotnet add package`) remain `Promise<Result<T, E>>` as they are short-lived processes with single-shot output — streaming is applied selectively where it improves UX.
- **Result Types Everywhere**: Unified `Result<T, E>` discriminated union (`{ success: true; value } | { success: false; error }`) for all command execution operations — no exception-based control flow. Custom error unions: `NuGetError`, `AppError` with codes like `'Network'`, `'RateLimit'`, `'ApiError'`, `'ParseError'`.
- **Plugin Extensibility (Low Feature Cost)**: Adding a new NuGet source or command requires only one plugin file — self-registration via `IPlugin { id, activate(kernel) }` eliminates the "wiring tax" of updating factories and service maps. Greenfield implementation — no legacy ServiceContainer code to migrate.
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

## Prerequisites
- **.NET SDK** installed on the host machine (required for `dotnet` CLI operations).
- **VS Code 1.105+**.
- A workspace containing `.csproj` files or an open solution file (`.sln`).
- **Lightweight reactivity engine**: `@preact/signals` (recommended) for Domain Store observables — minimal bundle footprint (~2 KB gzipped).
