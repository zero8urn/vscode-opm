# packageBrowser UI Breakdown

This document describes how the `packageBrowser` UI can be decomposed into small Lit components, controllers, and state managers, following the patterns in the redesign (state managers, mediator, LruCache, ReactiveControllers).

| Component | Responsibility | Public Props / Inputs | Events Emitted | Backing State / Controller | Notes / Estimated LOC |
|---|---:|---|---|---|---|
| `package-browser-app` (root) | Compose subcomponents, wire mediator, hold `stateVersion` reactive trigger | none (hosts children) | none (forwards events) | Uses `SearchState`, `DetailsState`, `ProjectsState`, `SourcesState`; wires `WebviewMessageMediator` | Orchestrator only; minimal logic. Estimated 60-120 LOC after extraction.
| `search-header` | Header area: search input, prerelease toggle, source selector, refresh button | `query: string`, `includePrerelease: boolean`, `selectedSourceId: string`, `sources: PackageSourceOption[]` | `search-input`, `toggle-prerelease`, `source-changed`, `refresh` | Uses `SearchController` (ReactiveController) for debounce and input cancellation | Isolated UI + accessibility; ~60 LOC.
| `search-input` | Controlled text input with clear button and ARIA labels | `value: string`, `disabled?: boolean`, `placeholder?: string` | `input-change` (detail: { value }) | Local ephemeral state only (no controller) | Small, reusable; ~30 LOC.
| `prerelease-toggle` | Visual toggle component | `checked: boolean`, `disabled?: boolean` | `change` (detail: { checked }) | none | Tiny; ~20 LOC.
| `source-selector` | Dropdown or segmented control for package sources | `sources: PackageSourceOption[]`, `selectedSourceId: string` | `source-changed` (detail: { sourceId }) | none | Reusable; ~40 LOC.
| `results-container` | Layout container + virtualization hook (optional) | `loading: boolean` | `load-more` | none | Shell component for performance tuning; ~20 LOC.
| `package-list` | List renderer (uses `repeat()` Lit directive) | `packages: PackageSearchResult[]`, `totalHits: number`, `hasMore: boolean`, `loading: boolean` | `package-selected`, `load-more`, `try-all-feeds` | None; can integrate virtualization controller if needed | Use `repeat()` + keyed items; ~80-120 LOC (with templates).
| `package-card` | Single package row/card (metadata, versions summary, badges) | `package: PackageSearchResult`, `selected: boolean` | `select`, `open-details` | none | Small per-item component; ~40-80 LOC.
| `load-more-button` | Simple control to request next page | `disabled: boolean` | `load-more` | none | Tiny; ~15 LOC.
| `package-details-panel` | Right-side panel showing package details, versions, readme, install/uninstall flows | `packageData: PackageDetailsData | null`, `open: boolean`, `cachedProjects: ProjectInfo[]` | `close`, `version-selected`, `install-package`, `uninstall-package` | Uses `DetailsController` for aborting, readme sanitization/fetch, and caching via `PackageDetailsService` | Largest subcomponent: ~200-300 LOC (split internally by subcomponents below).
| `details-header` | Title, authors, icon, back/close | `title`, `authors`, `iconUrl` | `close`, `open-source` | none | ~30 LOC.
| `version-list` | Version selector + stability/prerelease indicators | `versions: VersionSummary[]`, `selectedVersion` | `version-selected` | none | ~60 LOC.
| `dependencies-view` | Show dependency groups per TFMs | `dependencies: DependencyGroup[]` | `dependency-clicked` | none | ~60 LOC.
| `readme-view` | Render sanitized README HTML | `readmeHtml: string` | `open-link` | readme sanitized by `PackageDetailsService` | Use sanitized innerHTML safely; ~50 LOC.
| `project-selector` | Multi-select list of projects for install/uninstall | `projects: ProjectInfo[]`, `selectedPaths: string[]` | `selection-changed` | Uses `SelectionState` (existing) | ~80 LOC.
| `install-action` / `uninstall-action` | Buttons + progress + per-project status | `disabled`, `projectPaths` | `request-install`, `request-uninstall` | Uses `OperationProgressController` to show progress | ~40 LOC each.
| `error-banner` | Standardized error UI for search or details errors | `error: { message, code }` | none | none | Reusable; ~30 LOC.
| `toast-notifications` (host-driven) | Small toasts shown by host via postMessage | none in webview (host posts) | none | none | Keep host-driven; webview should not reimplement global toasts.
| `styles/*.css` module | Shared CSS variables and common layout rules | N/A | N/A | N/A | Move large CSS block out of `packageBrowser.ts` into `styles/packageBrowser.css` or `styles.ts` export. Improves LOC and readability.

## Controllers & Mediation

- `SearchController` (ReactiveController)
  - Responsibilities: debounce input, cancel inflight search, emit typed search requests via mediator or state updates.
  - Tests: unit test debounce and cancellation behavior.

- `DetailsController`
  - Responsibilities: manage abort controllers for details requests, coordinate readme fetch, call `PackageDetailsService` (which uses LruCache).

- `WebviewMessageMediator`
  - Responsibilities: centralize `window.onmessage` handling and validate message shapes, route to handlers (searchResponse, packageDetailsResponse, projectsResponse, packageSourcesResponse, notifications).
  - Benefit: `package-browser-app` becomes a clean composition root that wires components and the mediator only.

## State Managers (already implemented)

- `SearchState`: query, results, pagination, loading, error, selectedSourceId
- `DetailsState`: selected package id, package details, panel open/close, loading
- `ProjectsState`: cached projects, loading, fetched flag
- `SourcesState`: package sources, cache warming flags
- `SelectionState`: project selection for install/uninstall

## Composition Patterns & Best Practices

- Keep components small and focused; prefer composition over large switch-based render logic.
- Expose minimal props; prefer events for interactions.
- Move side-effects (timers, network, abort handling) into ReactiveControllers.
- Use `repeat()` with stable keys for lists; consider virtualization for very large lists.
- Keep sanitized HTML handling centralized in services; web components consume sanitized strings only.
- Externalize CSS to reduce component LOC and enable reuse.

## Estimated LOC Targets after full extraction

- `package-browser-app` (root): 200–300 LOC (composition + wiring)
- header/search subcomponents: 120–200 LOC total
- `package-list` + `package-card`: 120–200 LOC total
- `package-details-panel` (with subcomponents): 200–300 LOC total (split into smaller files)
- controllers & mediator: 200 LOC total
- total across files (post-refactor): ~900–1,200 LOC distributed across focused files (no file > 300 LOC)

---

## Next Steps

1. Externalize CSS into `src/webviews/apps/packageBrowser/styles.ts` or a CSS file and import it in components.
2. Scaffold `search-header` and `package-card` subcomponents and a `SearchController` ReactiveController as a demo.
3. Move `handleHostMessage` into `WebviewMessageMediator` and replace inline postMessage calls with mediator methods.

If you want, I can scaffold `search-header` and `SearchController` next (small patch + tests).