# PRD: Octothorpe Package Manager — VS Code Extension for .NET NuGet Dependency Management

## Problem Statement

.NET developers managing NuGet package dependencies must switch between Visual Studio, the terminal (`dotnet` CLI), and browser-based nuget.org to search, install, update, and inspect packages. There is no polished, feature-rich NuGet package manager that lives directly inside VS Code with support for multi-source feeds (nuget.org, Azure Artifacts, GitHub Packages, Artifactory, MyGet), progressive streaming of search results, framework-aware dependency trees, and batch operations across multiple `.csproj` files in a single workspace.

## Solution

Build **Octothorpe Package Manager** — a VS Code extension that provides a native-feeling NuGet package browser as a webview panel. The extension supports multi-source search with progressive streaming, interactive multi-project install/update/uninstall, rich dependency tree visualization by target framework, auto-discovery of NuGet sources from `nuget.config`, and a reactive architecture where the UI is a pure visual representation of observable domain stores.

The extension uses:
- **VS Code Extension API** as the host runtime
- **Lit 3 web components** for the webview UI with shadow DOM encapsulation
- **`@preact/signals`** for reactive domain stores
- **Vite + esbuild** toolchain — Vite for webview dev, esbuild for extension bundling
- **Bun** as package manager and runtime
- **Reactive Micro-kernel plugin registry** for extensibility

## User Stories

1. As a .NET developer, I want to open the Octothorpe Package Manager from the VS Code activity bar, so that I can start searching for packages without leaving my editor
2. As a developer working in a multi-project workspace, I want the extension to auto-discover all `.csproj` files up to a configurable scan depth and extract their target frameworks (TFMs) from XML for display purposes, so that I don't have to manually configure which projects are available
3. As a developer, I want to search across nuget.org and one or more private feeds discovered from `dotnet nuget list source` simultaneously via progressive streaming, so that I can find packages regardless of where they're hosted
4. As a developer, I want to see search results appear progressively as the NuGet v3 API returns partial results via streaming, so that perceived search latency is dramatically reduced
5. As a developer, I want to enable/disable individual NuGet sources from the source selector, so that each discovered source participates in search by default and unchecking one excludes it from the current query only
6. As a developer, I want to see verified publisher badges next to packages from trusted publishers in the NuGet ecosystem, so that I can quickly identify reliable packages
7. As a developer, I want to toggle a prerelease filter switch to include or exclude prerelease versions from search results, so that my results match my stability requirements
8. As a developer, I want to click an "Install" button on any package result card in the search results list, so that I can initiate installation without opening the details panel
9. As a developer working with multiple `.csproj` files, I want to select one or more target projects before installing a package (including "Select All" checkbox with indeterminate state), so that I can precisely control which projects receive the new dependency
10. As a developer, I want to install a NuGet `<PackageReference>` into up to 3 selected projects concurrently with fail-fast execution — the first failure cancels remaining queued operations and the user sees which projects completed and which failed (with retry available for individual projects) — so that batch installs complete faster than sequential operations
11. As a developer, I want to uninstall packages from one or more targeted projects with the same multi-select UX as installation, so that cleanup is consistent with install workflows
12. As a developer, I want to update installed packages to newer versions across targeted projects with the same fail-fast concurrent batch model as install/uninstall, so that dependency upgrades are efficient
13. As a developer, I want each result card in search results to show contextual action buttons (Install, Update when already present, Uninstall) based on whether the package exists in the selected project(s), so that available actions are immediately obvious
14. As a developer, I want to see the full list of available versions for a package via a version selector dropdown in the details panel, so that I can choose exactly which version to install or update to
15. As a developer selecting a specific version from all available via a version selector dropdown in the details panel, I want framework-targeted dependency resolution information displayed grouped by TFM (e.g., `net8.0`, `netstandard2.0`) with only direct dependencies and no transitive expansion, so that I understand how the chosen version resolves against my target frameworks
16. As a developer, I want to click on any package in search results to open an optional details panel that slides in from the right, so that I can inspect metadata without leaving the search context
17. As a developer, I want the details panel to display the full package description, version history list, download counts, authors, tags, and icon URL, so that I have rich information for evaluating packages
18. As a developer evaluating a package's dependencies, I want to see a dependency tree grouped by target framework in collapsible accordion sections with no transitive expansion, so that I understand direct dependencies per TFM without overwhelming detail
19. As a developer wanting to read a package's documentation, I want the details panel to fetch and render the package README content as sanitized HTML, so that I can evaluate usage without leaving VS Code
20. As a developer who has modified `.csproj` files externally (e.g., in another editor), I want the extension's file watchers on `.csproj` files to automatically refresh the installed-package status shown in the UI, so that state is always current
21. As a developer with stale package cache, I want to click a "Refresh Project Cache" toolbar button to manually re-parse all projects and refresh installed-package status without reloading the webview, so that I can force-refresh when needed
22. As a developer working in a mono-repo or large solution, I want the extension to discover NuGet sources via `dotnet nuget list source` (parsed into `{ id, name, isPersistent }[]`) and store them as a read-only snapshot refreshable on demand, so that private feeds are available without manual configuration
23. As a developer managing multiple environments, I want to switch between "All" sources or a specific single source in the source selector — searching with "All" triggers a unified network search across all enabled feeds; selecting a specific source filters existing results client-side without another network request and switching back to "All" triggers a fresh search — so that both broad and targeted exploration are fast
24. As a developer who switches between light and dark VS Code themes, I want the webview UI to auto-update its colors using VS Code CSS variables (e.g., `--vscode-editor-background`, `--vscode-button-background`), so that the extension looks native in any theme
25. As a developer, I want the search results list on the left and details panel on the right to form a responsive layout where the details panel slides in when selecting a package card and can be closed independently, so that I have full control over screen real estate
26. As a developer running install/update/uninstall operations, I want per-project progress reporting showing which projects completed successfully and which failed (with retry available for individual failures), plus overall batch completion summary, so that I can monitor and understand the outcome of multi-project batch processing
27. As a developer whose workspace contains no `.csproj` files, I want the extension to gracefully handle an empty project list with a friendly message rather than crashing or showing errors, so that the UX is welcoming for all workspaces

## Implementation Decisions

### Architecture: Reactive Micro-kernel Plugin Registry

The core architecture replaces the traditional Abstract Factory + ServiceContainer wiring model with a minimal `IKernel` registry. New features register themselves as plugins implementing `IPlugin { id, activate(kernel) }`. The kernel discovers and activates plugins at startup. This eliminates the "wiring tax" — adding a new NuGet source or command requires only one plugin file.

This is a greenfield implementation — no legacy code exists. The "migration phases" define build sequences (see Build Phases below).

### Reactive Domain Stores (Single Source of Truth)

The domain layer consists of observable reactive stores using a signals-based reactivity engine (`@preact/signals`). Stores may cross-subscribe to other stores' signals (e.g., PackageStore listens to ConfigurationStore.prereleaseEnabled) so one signal flip produces one outcome without webview state manager wiring complexity.

- **ConfigurationStore** — NuGet sources discovered via `dotnet nuget list source` stored as a read-only snapshot refreshable via `async refreshSources()`. Prerelease toggle, scan depth setting. Single set of active sources (no separate "selected" vs "enabled"); every discovered source participates in search by default. One intent per action: `enableSource(id)`, `disableSource(id)`, `setPrerelease(enabled)`, `setScanDepth(depth)`. No batch updates needed for MVP — sequential calls suffice.
- **PackageStore** — accumulates results in a `Map<string, PackageResult[]>` keyed by search query key (`{query}::{sources}::{prerelease}`). De-duplicates by package ID. Exposes both `stream(query)` for progressive rendering and `getResults()` for accumulated data. Cross-subscribes to ConfigurationStore for automatic re-search on filter change.
- **ProjectStore** — thin CLI-first model: scans `.csproj` paths, extracts TFMs from XML (only enough to identify `net8.0`, etc.), calls `dotnet list <project> package`. Installed packages source of truth is CLI output, not manual XML parsing. Restore strategy: defer to user's build — no implicit restore after install/update.

The Webview is a pure visual representation of these stores. State flows one way: Store → UI. No manual IPC message handlers are needed for data synchronization between extension host and webview.

### Module Boundaries (Deep Modules)

The following deep modules encapsulate significant functionality behind stable, testable interfaces:

**1. Kernel & Plugin Registry**
- Manages lifecycle of all plugins (activate/dispose)
- Provides resolution services to plugins (store access, command registration, event publishing)
- Stable interface: plugin self-registration; internal discovery mechanism may evolve
- Greenfield — no legacy ServiceContainer code to migrate

**2. NuGet API Facade**
- Decomposes NuGet v3 API interaction into four focused collaborators: `ServiceIndexResolver`, `SearchExecutor`, `MetadataFetcher`, `ReadmeFetcher`
- Pluggable provider strategies for service index negotiation per source type (NuGetOrg, AzureArtifacts)
- MVP sources: nuget.org + Artifactory only
- Search produces one unified sorted result set across all enabled sources (not grouped); each `PackageResult` carries a `source: string` label for subtle UI badges. Sort order combines download count, verified publisher status, and query match quality.
- Stable interface: search returns `AsyncIterable<PackageResult>`, fetch metadata/readme return `Result<T>`

**3. Reactive Domain Stores**
- Observable stores (`ConfigurationStore`, `PackageStore`, `ProjectStore`) with signals-based reactivity
- Cross-subscription boundary: stores may cross-subscribe to other stores' signals (e.g., PackageStore listens to ConfigurationStore.prereleaseEnabled) for intuitive one-signal-flip-one-outcome behavior without webview state manager wiring complexity
- Accept Intents, update internal state, notify all observers. One intent per action — no batch updates needed.
- Stable interface: intent methods and observable value streams; internal signal implementation is private

**4. Webview State Managers**
- Encapsulated per-component state classes (`SearchState`, `DetailsState`, `ProjectsState`, `SourcesState`, `SelectionState`) that mirror and subscribe to corresponding Domain Store slices
- Live in webview context for UI-specific concerns only
- Stable interface: reactive property bindings; subscription model

**5. CLI Operation Engine**
- Executes `dotnet add package`, `dotnet remove package`, `dotnet update package` commands via child processes (spawn stubbed with canned stdout/stderr streams in tests)
- Template Method pattern via `PackageOperationCommand` abstract base class with hooks: validate, deduplicate, execute(project), cacheInvalidate(result), summarize()
- Concurrent batch execution: max 3 concurrent operations. Fail-fast model — first failure cancels remaining queued operations; user sees which projects completed and which failed with retry available for individual projects.
- Returns `Result<T, E>` with error unions (`Network`, `RateLimit`, `ApiError`, `ParseError`)

**6. Middleware HTTP Pipeline**
- Composable chain decorating a base `FetchHttpClient`: `RetryMiddleware → RateLimitMiddleware → BaseClient`
- Outer retry wraps inner rate-limit — a 429 hits the outer retry, which waits for the rate limiter's backoff window then retries. One coherent flow: transient error or rate limit → wait → retry.
- Chain of Responsibility / Decorator pattern

**7. EventBus (Observer)**
- Typed pub/sub with strict compile-time schema payloads per event type (e.g., `package:installed` carries `{ packageName, version, projectId }`). ~6-8 events total for MVP — small surface area means type safety over dynamic dispatch.
- Bridges Domain Store with command execution paths and webview state updates

**8. Webview Message Mediator**
- Routes VS Code `postMessage` IPC messages to per-command handler classes (`InstallHandler`, `UpdateHandler`, etc.) via mediator pattern
- One handler per command type. Self-contained, testable, easy to add new commands.
- Decouples webview from extension host concerns; at the bottom: VS Code's typed message channel is the transport mechanism

### Build Phases (Functional Milestones)

Build phases define the development order, not a coexistence strategy:

- **Phase 0**: Project scaffolding + Bun tooling + dev container (`.devcontainer/devcontainer.json` with .NET SDK, Node.js 20 LTS, Bun). Deliverable: `bun install && bun run build` works inside the dev container.
- **Phase 1**: Kernel + ConfigurationStore + source discovery → open extension, see sources listed from `dotnet nuget list source`, toggle prerelease filter.
- **Phase 2**: PackageStore + streaming search + details panel → search nuget.org/Artifactory with progressive results, read metadata and READMEs, switch between "All" and specific source (client-side filtering).
- **Phase 3**: ProjectStore + CLI engine (install/update/uninstall) + fail-fast concurrent batch operations → full end-to-end package management.

### Technical Decisions

- **Reactivity engine**: `@preact/signals`
- **Streaming search**: Search API calls return `AsyncIterable` streams; partial results hydrate the UI incrementally via progressive rendering. CLI operations remain `Promise<Result<T, E>>` as they are short-lived single-shot processes.
- **Error handling**: `Result<T, E>` discriminated union (`{ success: true; value } | { success: false; error }`) for all command execution — no exception-based control flow. Custom error types: `NuGetError`, `AppError` with typed codes.
- **Caching**: Bounded LRU cache with TTL on metadata to prevent memory leaks in long-running sessions while keeping data fresh.
- **Content Security Policy**: Strict (`default-src 'none'`) with nonce-based inline scripts; all external HTML sanitized via `sanitizeHtml()` before injection into the webview DOM.
- **Build toolchain**: Vite for webview development (HMR, fast refresh), esbuild for production extension bundling to CJS single entry point. Bun as package manager and test runner.


## Testing Decisions

### What Makes a Good Test

Only test external behavior — the public interface contracts of each deep module. Do not test internal implementation details (which signals are set, which middleware is in the chain). Tests should verify: given a set of inputs or events, does the module produce the correct outputs and side effects?

Tests must be deterministic and fast. No network calls — mock HTTP responses for NuGet API interactions. No `dotnet` CLI subprocesses — stub `child_process.spawn` with canned stdout/stderr streams.

### Modules to Test (Prioritized)

1. **Reactive Domain Stores** — test that Intents produce correct state transitions, observers fire with correct values, and invalid intents are rejected. These are pure logic tests against stable interfaces and are the highest ROI.
2. **CLI Operation Engine** — test `PackageOperationCommand` subclasses: validation hooks, deduplication logic, error handling for each `Result<T, E>` variant, concurrent batch execution limits (max 3).
3. **NuGet API Facade** — test that `SearchExecutor` produces correct `AsyncIterable` output from mocked v3 API responses; that provider strategies resolve the correct service index endpoint per source type.
4. **Middleware HTTP Pipeline** — test retry and rate-limit middleware independently: verify retry count, backoff behavior, rate limit header parsing.

### Prior Art

Bun's native test runner (`bun:test`) will be used for all unit tests. Integration tests that require a real `dotnet` CLI or NuGet API should be placed in an `integration/` directory and gated with environment variable configuration (e.g., `INTEGRATION_TESTS=1`). The test patterns should follow the existing convention: one test file per module, named `<module>.test.ts`, colocated alongside source files where practical.

## Out of Scope

- Transitive dependency expansion in the dependency tree (only direct dependencies shown)
- Package icon rendering from CDN within the webview (icon URLs displayed as links/placeholder)
- NuGet.config editing UI (auto-discovery only; no manual create/edit)
- Solution file (.sln) parsing — `.csproj` auto-discovery via filesystem scan only
- Package authoring / creating new NuGet packages
- Multi-language package search results beyond .NET ecosystem metadata
- Real-time collaboration or shared workspace state across multiple VS Code windows
- Authentication token management for private feeds (assumes credentials are in `nuget.config` or system keyring)
- Extension telemetry/analytics dashboard

## Further Notes

#### Legacy Plugin
A `LegacyPlugin` type exists for wrapping existing services to conform to the `IPlugin` interface during any future hybrid migration phase. Not needed now — this is greenfield.

### Glossary

| Term | Meaning |
|------|---------|
| NuGet source / feed | A repository hosting packages (nuget.org, Azure Artifacts, Artifactory, GitHub Packages, MyGet) |
| Domain Store | Reactive observable stores in the domain layer (`ConfigurationStore`, `PackageStore`, `ProjectStore`) — single source of truth |
| Intent | A user action sent to a Domain Store that triggers state mutation and observer notification |
| Progressive hydration | Incremental UI rendering as streaming API results arrive, rather than waiting for complete responses |
| TFM (Target Framework) | .NET target framework identifier (e.g., `net8.0`, `netstandard2.0`) |
| Deep module | A module encapsulating significant internal functionality behind a stable, testable interface that rarely changes externally |
| Search query key | The canonical string used to deduplicate and cache search results — derived from `{query}::{sources}::{prerelease}` |
