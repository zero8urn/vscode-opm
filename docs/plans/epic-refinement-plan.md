# Epic Refinement Plan - P0 Core Functionality

**Epic**: EPIC-001-nuget-package-management  
**Priority**: P0 - Core Functionality  
**Created**: 2025-11-16  
**Status**: Planning

## Overview

This document outlines the initial epic/feature/story breakdown for the P0 Core Functionality of the NuGet Package Management extension. The breakdown follows the layered architecture (UI → Commands → Domain → Environment) and aligns with the request-response flow documented in `request-response.md`.

## Epic/Feature/Story Breakdown

| Type | ID | Name | Description | Components |
|------|----|----|-------------|-----------|
| **EPIC** | **EPIC-001** | **NuGet Package Management** | Complete NuGet package management solution for VS Code with feature parity to Visual Studio 2022 for .NET projects | Extension-wide |
| | | | | | |
| **FEAT** | **FEAT-001-00** | **Foundations & Non-Functional Requirements** | Foundation cross-cutting support for theme, logging, telemetry, webview sanitization/CSP, resource helpers, CI and accessibility baseline | Services, Webview, CI |
| STORY | STORY-001-00-001 | Implement ThemeService | Create a `ThemeService` that posts theme updates and computed tokens to webviews; add unit tests and wire to an example webview | `src/services/themeService.ts`, `src/webviews/apps/package-browser.ts` | |
| STORY | STORY-001-00-002 | Implement LoggerService | Add `LoggerService` wrapping OutputChannel and `context.logUri` that exposes INFO/WARN/ERROR/DEBUG; include settings for debug flag | `src/system/logger.ts`, `src/commands/*` | |
| STORY | STORY-001-00-003 | Implement HTML Sanitization for Webviews | Implement a `sanitizeReadme` helper and show how to sanitize README and other remote HTML before rendering; add tests for XSS protections | `src/webviews/utils/sanitize.ts`, `src/webviews/apps/package-details.ts` | |
| STORY | STORY-001-00-004 | Webview Resource Helpers & CSP | Add `webview.asWebviewUri` helper usage, centralized webview template generation, strict CSP template, and a resource URI helper | `src/webviews/webviewHelpers.ts` | |
| STORY | STORY-001-00-005 | GitHub Actions CI Scaffold | Create a CI workflow that runs build, lint, unit tests, and E2E test harness (e.g., `build-and-test.yml`) | `.github/workflows/build-and-test.yml`, `scripts/*` | |
| STORY | STORY-001-00-006 | Operation Logging & CLI Error Mapping | Ensure CLI operations log detailed traces to `LoggerService`, expose user-facing errors with ‘View details’ to open output channel | `src/env/node/dotnetExecutor.ts`, `src/commands/*` | |
| STORY | STORY-001-00-007 | Unit & E2E Tests for Foundational Services | Add unit tests for ThemeService/Logger/Telemetry and E2E tests that validate theme switching, sanitization, CSP, and keyboard navigation in webviews | `test/**`, `scripts/test-setup.sh` | |
| **FEAT** | **FEAT-001-01** | **Browse & Search Packages** | Search NuGet packages via webview UI with filtering, sorting, and details panel | Webview, NuGet API Client, Search Parser |
| STORY | STORY-001-01-001 | Implement NuGet Search API Integration | Call NuGet v3 Search API, parse JSON results into `PackageSearchResult[]` | `src/env/node/nugetApiClient.ts`, `src/domain/parsers/searchParser.ts` | |
| STORY | STORY-001-01-002 | Create Search Webview UI Component | Build Lit-based search input with debounce, loading states, error handling | `src/webviews/apps/package-browser.ts` | |
| STORY | STORY-001-01-003 | Display Search Results List | Render package list with icon, name, description, downloads, author | `src/webviews/apps/components/package-list.ts` | |
| STORY | STORY-001-01-004 | Implement Search Filters (Prerelease) | Add checkbox UI for including/excluding prerelease versions | `src/webviews/apps/components/search-filters.ts` | |
| STORY | STORY-001-01-005 | Implement Search Filters (Framework) | Add dropdown for target framework filtering | `src/webviews/apps/components/search-filters.ts` | |
| STORY | STORY-001-01-006 | Implement Search Result Sorting | Add sort by: Relevance, Downloads, Recent Updates | `src/webviews/apps/components/search-controls.ts` | |
| STORY | STORY-001-01-007 | Implement Search Result Paging | Add pagination controls with page size selector | `src/webviews/apps/components/pagination.ts` | |
| STORY | STORY-001-01-008 | Fetch Package Details from Registration API | Call NuGet Registration API for package metadata, versions, dependencies | `src/env/node/nugetApiClient.ts`, `src/domain/parsers/packageDetailsParser.ts` | |
| STORY | STORY-001-01-009 | Display Package Details Panel | Show selected package details: all versions, dependencies, readme, license, deprecation | `src/webviews/apps/components/package-details.ts` | |
| STORY | STORY-001-01-010 | Implement Request Deduplication Cache | Prevent duplicate in-flight API requests using `PromiseCache` | `src/domain/cache/promiseCache.ts` | |
| STORY | STORY-001-01-011 | Implement Search Results Cache (5 min TTL) | Cache search results with 5-minute TTL for repeated queries | `src/domain/cache/cacheManager.ts` | |
| STORY | STORY-001-01-012 | Implement Package Details Cache (10 min TTL) | Cache package metadata with 10-minute TTL | `src/domain/cache/cacheManager.ts` | |
| STORY | STORY-001-01-013 | Implement Webview IPC Protocol | Define typed request/response messages for search and package details | `src/webviews/protocol.ts` | |
| STORY | STORY-001-01-014 | Handle API Errors in Webview | Display user-friendly error states for network failures, 404s, API errors | `src/webviews/apps/components/error-state.ts` | |
| STORY | STORY-001-01-015 | Add Package Icons and Badges | Display package icon, download count badge, verified badge, deprecated badge | `src/webviews/apps/components/package-card.ts` | |
| | | | | | |
| **FEAT** | **FEAT-001-02** | **Install Packages** | Install NuGet packages to selected projects with version selection and validation | Command, dotnet CLI Executor, Project Parser |
| STORY | STORY-001-02-001 | Implement Project Discovery | Parse workspace for .csproj files and detect PackageReference format | `src/domain/parsers/projectParser.ts`, `src/env/node/projectDiscovery.ts` | |
| STORY | STORY-001-02-002 | Create Project Selection UI | Display checkbox list of projects in webview for target selection | `src/webviews/apps/components/project-selector.ts` | |
| STORY | STORY-001-02-003 | Implement Version Selector Dropdown | Show all available versions (latest, stable, specific versions) with prerelease toggle | `src/webviews/apps/components/version-selector.ts` | |
| STORY | STORY-001-02-004 | Execute dotnet add package Command | Run `dotnet add package {id} --version {version}` via child_process | `src/env/node/dotnetExecutor.ts` | |
| STORY | STORY-001-02-005 | Parse CLI Install Output | Parse stdout/stderr to determine success/failure and extract error messages | `src/domain/parsers/cliOutputParser.ts` | |
| STORY | STORY-001-02-006 | Implement Install Command Handler | Create `installPackage` command that orchestrates project selection, version resolution, CLI execution | `src/commands/installPackageCommand.ts` | |
| STORY | STORY-001-02-007 | Handle Multi-Project Install | Execute install sequentially across selected projects with per-project result tracking | `src/domain/domainProvider.ts` | |
| STORY | STORY-001-02-008 | Show Install Progress Indicator | Display VS Code progress notification during install operations | `src/commands/installPackageCommand.ts` | |
| STORY | STORY-001-02-009 | Display Install Success/Error Toast | Show user-friendly toast notifications with actionable error messages | `src/commands/installPackageCommand.ts` | |
| STORY | STORY-001-02-010 | Invalidate Installed Package Cache | Clear cached installed packages on successful install to trigger tree refresh | `src/domain/cache/cacheManager.ts` | |
| STORY | STORY-001-02-011 | Handle License Acceptance Prompt | Detect license acceptance requirement and prompt user before install | `src/commands/installPackageCommand.ts` | |
| STORY | STORY-001-02-012 | Validate Framework Compatibility | Check package target framework compatibility before install and warn user | `src/domain/validators/frameworkValidator.ts` | |
| | | | | | |
| **FEAT** | **FEAT-001-03** | **View Installed Packages** | Display tree view of installed packages per project with version and update status | TreeDataProvider, dotnet CLI, Package Parser |
| STORY | STORY-001-03-001 | Implement dotnet list package Parser | Parse `dotnet list package` table output into `InstalledPackage[]` models | `src/domain/parsers/installedPackagesParser.ts` | |
| STORY | STORY-001-03-002 | Create Installed Packages TreeDataProvider | Implement `TreeDataProvider<PackageNode>` with project grouping and package children | `src/views/installedPackagesView.ts` | |
| STORY | STORY-001-03-003 | Design Package Tree Node Model | Define node types: ProjectNode, PackageNode with contextValue for menus | `src/views/nodes/packageNodes.ts` | |
| STORY | STORY-001-03-004 | Implement Tree View Refresh Logic | Fire `onDidChangeTreeData` event on install/uninstall/update operations | `src/views/installedPackagesView.ts` | |
| STORY | STORY-001-03-005 | Display Package Version in Tree | Show current installed version next to package name | `src/views/nodes/packageNodes.ts` | |
| STORY | STORY-001-03-006 | Implement Installed Packages Cache (2 min TTL) | Cache installed packages with 2-minute TTL, invalidated on mutations | `src/domain/cache/cacheManager.ts` | |
| STORY | STORY-001-03-007 | Add Tree View Context Menus | Register context menu items: Update, Uninstall for package nodes | `package.json` contributions, `src/commands/` | |
| STORY | STORY-001-03-008 | Implement Tree View Icons | Assign icons to project nodes and package nodes with theme support | `src/views/nodes/packageNodes.ts` | |
| STORY | STORY-001-03-009 | Handle Empty State (No Packages) | Display helpful message when no packages are installed in workspace | `src/views/installedPackagesView.ts` | |
| STORY | STORY-001-03-010 | Implement Solution-wide Package View | Show all packages across all projects with consolidation warnings | `src/views/installedPackagesView.ts` | |
| | | | | | |
| **FEAT** | **FEAT-001-04** | **Update Packages** | Update installed packages to newer versions with latest/specific version selection | Command, NuGet API, dotnet CLI, Version Resolver |
| STORY | STORY-001-04-001 | Fetch Latest Package Version from API | Call NuGet Registration API to resolve 'latest' stable version | `src/env/node/nugetApiClient.ts`, `src/domain/parsers/versionResolver.ts` | |
| STORY | STORY-001-04-002 | Implement Update to Latest Command | Execute `dotnet add package {id}` (no version = latest) | `src/commands/updatePackageCommand.ts` | |
| STORY | STORY-001-04-003 | Implement Update to Specific Version | Allow user to select target version from dropdown and update | `src/commands/updatePackageCommand.ts` | |
| STORY | STORY-001-04-004 | Parse dotnet list package --outdated Output | Extract current vs. latest version info into `OutdatedPackage[]` models | `src/domain/parsers/outdatedPackagesParser.ts` | |
| STORY | STORY-001-04-005 | Display Update Badge on Tree Nodes | Show "↑ 14.0.1" badge on outdated packages in tree view | `src/views/nodes/packageNodes.ts` | |
| STORY | STORY-001-04-006 | Create Updates Available Tree View | Separate view showing only outdated packages with one-click update | `src/views/updatesAvailableView.ts` | |
| STORY | STORY-001-04-007 | Handle Multi-Project Update | Update package across multiple projects with per-project result tracking | `src/domain/domainProvider.ts` | |
| STORY | STORY-001-04-008 | Show Update Progress and Results | Display progress notification and toast with success/error per project | `src/commands/updatePackageCommand.ts` | |
| STORY | STORY-001-04-009 | Invalidate Cache on Update | Clear installed packages cache and trigger tree refresh | `src/domain/cache/cacheManager.ts` | |
| STORY | STORY-001-04-010 | Validate Dependency Compatibility | Warn user if update will break dependency constraints | `src/domain/validators/dependencyValidator.ts` | |
| | | | | | |
| **FEAT** | **FEAT-001-05** | **Uninstall Packages** | Remove packages from projects with dependency warning and cleanup | Command, dotnet CLI, Dependency Analyzer |
| STORY | STORY-001-05-001 | Implement dotnet remove package Command | Execute `dotnet remove package {id}` via CLI executor | `src/env/node/dotnetExecutor.ts` | |
| STORY | STORY-001-05-002 | Create Uninstall Package Command Handler | Orchestrate uninstall operation with project selection and confirmation | `src/commands/uninstallPackageCommand.ts` | |
| STORY | STORY-001-05-003 | Parse Uninstall CLI Output | Validate uninstall success/failure from stdout/stderr | `src/domain/parsers/cliOutputParser.ts` | |
| STORY | STORY-001-05-004 | Check Transitive Dependencies | Detect if other packages depend on package being removed and warn user | `src/domain/parsers/dependencyParser.ts` | |
| STORY | STORY-001-05-005 | Show Uninstall Confirmation Dialog | Prompt user with dependency warning before uninstall | `src/commands/uninstallPackageCommand.ts` | |
| STORY | STORY-001-05-006 | Handle Multi-Project Uninstall | Uninstall from selected projects with per-project result tracking | `src/domain/domainProvider.ts` | |
| STORY | STORY-001-05-007 | Show Uninstall Success/Error Feedback | Display toast notifications with results | `src/commands/uninstallPackageCommand.ts` | |
| STORY | STORY-001-05-008 | Invalidate Cache and Refresh Tree | Clear cache and refresh installed packages tree view | `src/domain/cache/cacheManager.ts`, `src/views/installedPackagesView.ts` | |
| | | | | | |
| **FEAT** | **FEAT-001-06** | **Package Source Management** | Configure and switch between NuGet package sources (NuGet.org, private feeds) | Settings UI, nuget.config Parser, Source Validator |
| STORY | STORY-001-06-001 | Parse nuget.config File | Extract package sources from nuget.config XML | `src/domain/parsers/nugetConfigParser.ts` | |
| STORY | STORY-001-06-002 | List Available Package Sources | Display all configured sources with name, URL, enabled status | `src/domain/domainProvider.ts` | |
| STORY | STORY-001-06-003 | Create Source Selector Dropdown | Add dropdown in webview to switch active package source | `src/webviews/apps/components/source-selector.ts` | |
| STORY | STORY-001-06-004 | Filter Search by Selected Source | Pass source parameter to NuGet API search requests | `src/env/node/nugetApiClient.ts` | |
| STORY | STORY-001-06-005 | Add Package Source via Settings | Provide command/UI to add new package source to nuget.config | `src/commands/addPackageSourceCommand.ts` | |
| STORY | STORY-001-06-006 | Remove Package Source | Provide command to remove package source from nuget.config | `src/commands/removePackageSourceCommand.ts` | |
| STORY | STORY-001-06-007 | Enable/Disable Package Sources | Toggle package source enabled state in nuget.config | `src/commands/togglePackageSourceCommand.ts` | |
| STORY | STORY-001-06-008 | Validate Package Source URLs | Check source URL reachability and API version before adding | `src/domain/validators/sourceValidator.ts` | |
| STORY | STORY-001-06-009 | Handle Authentication for Private Feeds | Support Basic/Bearer token auth from nuget.config or prompt user | `src/env/node/authHandler.ts` | |

## Architecture Alignment

### Layered Architecture

All features follow the standard layered pattern:

```
UI Layer (Webview/TreeView)
    ↓
Command Layer (Thin orchestrators)
    ↓
Domain Layer (Provider-agnostic abstractions)
    ↓
Environment Layer (dotnet CLI executor, NuGet API client)
```

### Key Components

| Component | Purpose | Location |
|-----------|---------|----------|
| **NuGet API Client** | Calls NuGet v3 Search & Registration APIs | `src/env/node/nugetApiClient.ts` |
| **dotnet CLI Executor** | Executes dotnet commands via child_process | `src/env/node/dotnetExecutor.ts` |
| **Domain Provider** | Unified provider interface for package operations | `src/domain/domainProvider.ts` |
| **Cache Manager** | TTL-based caching with invalidation | `src/domain/cache/cacheManager.ts` |
| **Parsers** | Transform API/CLI output to typed models | `src/domain/parsers/*.ts` |
| **Webview IPC** | Typed request/response protocol | `src/webviews/protocol.ts` |
| **Package Browser App** | Lit-based search & browse UI | `src/webviews/apps/package-browser.ts` |
| **Tree Views** | Installed packages & updates views | `src/views/*.ts` |
| **Commands** | Install, Update, Uninstall orchestrators | `src/commands/*.ts` |

### Data Flow Patterns

Each feature implements appropriate caching and error handling:

- **Search Flow**: User query → API call → Parser → Cache (5 min) → Webview
- **Install Flow**: User action → Version resolution → CLI exec → Parse result → Invalidate cache → Tree refresh
- **Tree View Flow**: Node expansion → Check cache → CLI exec → Parser → Cache (2 min) → Render nodes

## Story Count Summary

| Feature | Stories |
|---------|--------|
| FEAT-001-00: Foundations & Non-Functional Requirements | 7 |
| FEAT-001-01: Browse & Search Packages | 15 |
| FEAT-001-02: Install Packages | 12 |
| FEAT-001-03: View Installed Packages | 10 |
| FEAT-001-04: Update Packages | 10 |
| FEAT-001-05: Uninstall Packages | 8 |
| FEAT-001-06: Package Source Management | 9 |
| **Total P0** | **74** |

## Next Steps

1. Create EPIC-001-nuget-package-management.md from template
2. Create 7 feature documents (FEAT-001-00 through FEAT-001-06)
3. Generate user stories for FEAT-001-01 (Browse & Search) as first feature
4. Begin implementation with NuGet API integration story
5. Set up webview scaffolding and IPC protocol

## Notes

- All CLI operations use `dotnet` commands (no direct .csproj manipulation)
- NuGet API v3 is the primary data source for search/metadata
- Parsers are critical for transforming CLI/API output to typed models
- Cache invalidation strategy is key to keeping tree views in sync
- Webview uses Lit for component-based UI with type-safe IPC
- Multi-project operations are sequential (dotnet doesn't support batch)
- Error handling follows structured error shape pattern from domain-layer.md
