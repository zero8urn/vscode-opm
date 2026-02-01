# STORY-001-01-018 — Multi-source search and install behavior

Product details

- **Summary:** Provide first-class support for multiple NuGet package sources in the package browser. Users can select a source from a dropdown on the Browse Packages view (including an "All feeds" aggregate option). The Package Details view no longer shows a source selector, but receives the source used to locate the package so it can construct the correct metadata URLs. Installs/updates use the configured dotnet/nuget restore flow so the actual package download uses the full nuget.config feed list.

- **User persona:** Developers using the VS Code extension who work with multiple NuGet feeds (public nuget.org, private Artifactory/Azure/GitHub feeds, or custom feeds) and expect IDE-like behavior matching Visual Studio and Rider.

- **Goals:**
  - Let users search across all configured/enabled feeds or filter to a single feed.
  - Make it explicit which feed is being used for searches and for the subsequent details view.
  - Ensure install/update actions succeed when the package is available on any configured feed by relying on the standard dotnet/nuget restore behavior.

- **Non-goals:**
  - Mirroring per-feed package source mapping policies (e.g., Visual Studio's package source mapping) in the first iteration.
  - Implementing server-side package promotion or cross-feed artifact replication.

- **UI behavior (product language):**
  - Browse Packages view contains a compact dropdown labelled "Package source" in the header:
    - Options: `All feeds` (default), and one entry per configured & enabled source (display name).
    - Selecting a specific feed limits search and filter operations to that feed.
  - Package Details view removes the per-panel source selector. The details view shows a source badge (non-editable) indicating the feed that produced the shown metadata (for transparency), but not a dropdown for changing the feed.
  - When a user clicks a package in Browse results, the package details panel opens with the metadata loaded from the source that produced the selected item. If the item came from `All feeds` aggregation, the UI will record the specific source that provided the metadata and pass that source identifier to the details view.

- **Search semantics:**
  - `All feeds`: the extension sends parallel search requests to all enabled feeds, merges and deduplicates results by package id + version, and displays a combined, relevance-sorted list.
  - Specific feed: the extension queries only the chosen feed and displays results from that feed.

- **Details semantics & navigation:**
  - The details view receives the `sourceId` (the feed that supplied the chosen search result) as part of its initialization payload and uses that `sourceId` to construct registration/flat-container/readme URLs and to call metadata APIs.
  - The details view includes a small, read-only indicator (icon + display name) showing the `sourceId` used for metadata so users understand origin.

- **Install / Update semantics:**
  - Install and update operations are performed via the normal dotnet/nuget CLI restore mechanisms (e.g., `dotnet add` / `dotnet restore` or project system APIs) so package resolution and downloads honor the full nuget.config feed list. This ensures installs succeed if any configured feed contains the package, even if the Browse view is scoped to a single feed.
  - If the UI implements a pre-check for availability on a single feed (e.g., to show a quick "available in selected feed" badge), the flow should treat that as informational and, on install, still delegate to the restore path rather than attempting a single-feed-only fetch that could cause false failures.

- **Error & fallback behavior (product language):**
  - If a user filters to a specific feed and the feed returns no search results for a package, show an empty state with a short hint: "No results in selected feed — try All feeds." Provide a one-click action to switch to `All feeds`.
  - If a details view request for metadata from the selected source fails (network/auth/404), surface a friendly error and provide a "Try other feeds" action that re-runs metadata lookup across other enabled feeds (with a clear indication that this will query additional sources).
  - Authentication-required responses for a chosen feed should surface an actionable hint: "Authentication required for <feed name>. Configure credentials in nuget.config or in VS Code settings." Do not display credentials in the UI.

- **Acceptance criteria (high level):**
  - The Browse Packages view displays a `Package source` dropdown with `All feeds` + configured sources.
  - Searching under `All feeds` returns aggregated, deduplicated results from enabled feeds.
  - Selecting a package from Browse opens Package Details with metadata loaded from the feed that supplied the Browse result; the details panel shows a read-only source indicator.
  - The package details UI no longer includes a full source dropdown control.
  - Install/update actions use the standard dotnet/nuget restore path and succeed if any configured feed hosts the package.
  - If a selected feed does not contain a package, the UI shows an empty state with a clear affordance to search all feeds.

- **Analytics & telemetry (product language):**
  - Emit events for user actions: `search_scoped` (feedId or `all`), `search_aggregated`, `details_opened` (feedId), and `install_attempt` (feedId + result: success/failure). Avoid sending any credential data.

- **Security & privacy notes:**
  - Never log or transmit credentials. When a feed requires authentication, show a generic hint directing users to configure credentials.
  - Respect user-enabled/disabled state for configured feeds — do not query disabled feeds during `All feeds` aggregation.

- **Implementation notes for engineering (product-facing):**
  - The extension host will supply the merged list of configured package sources (from `getNuGetApiOptions`) to the webview at initialization; the webview renders the `Package source` dropdown from that list.
  - The NuGet API client supports per-source calls; for `All feeds` searches the client will perform concurrent queries to enabled feeds, merge and dedupe results, and return a combined result set.
  - The details view receives `sourceId` with the selected package result and uses that to resolve registration/flat-container/readme endpoints.
  - For installs/updates, delegate to the dotnet/nuget CLI/project-system restore to leverage the configured feed list and credentials handling.

---

Product owner: package management team

Notes: this story focuses on product behavior and user-facing flows. Detailed UI mocks and API contracts will be created as follow-up tasks during refinement.
