# STORY-001-03-001-installed-packages-tree-view

**Feature**: FEAT-001-03-view-installed-packages (To be created)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Priority**: High  
**Estimate**: 8 Story Points  
**Created**: 2026-01-12  
**Last Updated**: 2026-01-12

## User Story

**As a** developer managing NuGet packages in my workspace  
**I want** a VS Code tree view showing all installed packages organized by project  
**So that** I can quickly see what packages are installed, their versions, and update status without opening project files

## Description

This story implements the `InstalledPackagesProvider` as a VS Code `TreeDataProvider` that displays a hierarchical view of all installed NuGet packages across workspace projects in the VS Code sidebar. The tree view provides real-time visibility into the current package installation state, organized by project, with version indicators and update badges.

The provider integrates with the domain layer to fetch installed package data using `dotnet list package` CLI parsing, implements caching with 2-minute TTL for performance, and exposes a `refresh()` method that other commands (install, update, uninstall) can call to trigger UI updates after mutations. The tree view serves as the primary UI for package management operations, offering context menus for update and uninstall actions on individual packages.

This component complements the Package Browser webview by providing persistent workspace-wide visibility of installed packages, while the webview focuses on search and discovery. The tree view must handle workspace changes, multi-project scenarios, empty states, and loading states gracefully while maintaining performance in large workspaces.

## Acceptance Criteria

### Scenario: Display installed packages grouped by project
**Given** a workspace with 3 projects each having packages installed  
**When** the user expands the "Installed Packages" tree view  
**Then** projects are displayed as top-level tree nodes  
**And** expanding a project shows all installed packages as child nodes  
**And** each package node displays: name, current version, and update badge if newer version available  

### Scenario: Refresh tree view after package installation
**Given** the Installed Packages tree view is visible  
**When** the user installs a new package via the Package Browser webview  
**Then** the install command calls `installedPackagesProvider.refresh()`  
**And** the tree view automatically updates to show the newly installed package  
**And** no manual refresh action is required by the user

### Scenario: Show empty state when no packages installed
**Given** a workspace with projects but no NuGet packages installed  
**When** the user expands the "Installed Packages" tree view  
**Then** a helpful message is displayed: "No packages installed. Use Browse Packages to add packages."  
**And** the message includes a clickable action to open Package Browser

### Scenario: Cache installed package data for performance
**Given** the tree view has been expanded and package data loaded  
**When** the user collapses and re-expands a project node within 2 minutes  
**Then** package data is retrieved from cache (no CLI call)  
**And** the expansion is instantaneous (<100ms)  
**And** after 2 minutes, the next expansion fetches fresh data via CLI

### Additional Criteria
- [ ] Tree view registered in `package.json` with viewId: `opm.installedPackages`
- [ ] Provider implements `vscode.TreeDataProvider<TreeNode>` interface
- [ ] `refresh()` method fires `onDidChangeTreeData` event to trigger VS Code re-render
- [ ] Package nodes show version indicators: ✓ (up-to-date), ⬆ (update available), ⚠️ (deprecated)
- [ ] Context menu actions registered: "Update Package", "Uninstall Package" (to be implemented in later stories)
- [ ] Handles workspace changes (project added/removed) gracefully
- [ ] Loading spinner shown during CLI execution for initial data fetch
- [ ] Error handling: if `dotnet list package` fails, show error node with actionable message

## Technical Implementation

### Key Components
- **File**: `src/views/installedPackagesProvider.ts` - Main TreeDataProvider implementation
- **File**: `src/domain/parsers/installedPackagesParser.ts` - Parse `dotnet list package` output (may already exist from domain layer)
- **File**: `src/views/nodes/packageTreeNode.ts` - Tree node model classes (ProjectNode, PackageNode)
- **Package.json**: View container and tree view contribution registration

### Technical Approach
- Implement `TreeDataProvider<PackageTreeNode>` with `getChildren()` and `getTreeItem()` methods
- Use `EventEmitter<PackageTreeNode | undefined>` for `onDidChangeTreeData` event
- Integrate with `DomainProviderService` to call `getInstalledPackages(workspacePath)` 
- Cache results with key pattern `installed:{projectPath}` with 2-minute TTL
- Fire `refresh()` via event emitter to trigger VS Code UI re-render
- Use `TreeItem.contextValue` to enable context menu item visibility (e.g., "packageNode" for package nodes)

### API/Integration Points
- `vscode.window.registerTreeDataProvider()` - Register provider on activation
- `vscode.TreeDataProvider<T>` interface - Core contract
- `vscode.EventEmitter<T>` - For change notifications
- `DomainProviderService.getInstalledPackages()` - Fetch package data via domain layer
- `InstallPackageCommand` calls `refresh()` after successful installs

## Testing Strategy

### Unit Tests
- [ ] Test `getChildren()` returns project nodes at root level
- [ ] Test `getChildren(projectNode)` returns package nodes for that project
- [ ] Test `refresh()` fires `onDidChangeTreeData` event
- [ ] Test cache hit scenario (second call within TTL returns cached data)
- [ ] Test cache miss scenario (call after TTL expiry fetches fresh data)
- [ ] Test empty state handling (workspace with no packages)

### Integration Tests
- [ ] Test `dotnet list package` CLI integration with test fixtures
- [ ] Test parser correctly converts CLI table output to `InstalledPackage[]` models
- [ ] Test tree view shows correct package versions after install operation

### Manual Testing
- [ ] Open workspace with multiple projects, verify projects appear as tree nodes
- [ ] Expand project, verify packages displayed with versions
- [ ] Install new package via webview, verify tree view auto-refreshes
- [ ] Collapse and re-expand within 2 minutes, verify instant load (cache)
- [ ] Wait >2 minutes, re-expand, verify CLI re-fetch (cache expired)
- [ ] Test with workspace with no packages, verify empty state message

## Dependencies

### Blocked By
- Depends on domain layer having `getInstalledPackages()` method (likely already exists from FEAT-001-02)
- Depends on `dotnet list package` parser (may already exist from STORY-001-02-001b)

### Blocks
- STORY-001-03-002: Add context menu actions (Update, Uninstall) - needs tree node contextValue definitions
- STORY-001-03-003: Show update badges on packages - needs version comparison logic

### External Dependencies
- VS Code TreeDataProvider API
- DomainProviderService
- Cache implementation (from FEAT-001-01-012 or similar)

## Notes

**Integration with InstallPackageCommand**: The install command at [installPackageCommand.ts:167](installPackageCommand.ts#L167) has a TODO to call `installedPackagesProvider.refresh()` after successful installs. This story implements the provider that enables that integration.

**Tree View vs Webview**: This tree view provides persistent, workspace-wide visibility and is always accessible in the sidebar. The Package Browser webview is for search/discovery and is opened on-demand. Both complement each other in the user workflow.

**Performance Considerations**: For large workspaces (100+ projects), consider lazy-loading project nodes and only fetching package data when a project is expanded rather than eagerly loading all installed packages upfront.

**Context Menu Design**: Context menu items will be added in follow-up stories. This story focuses on read-only tree display and refresh mechanism.

**Cache Strategy**: 2-minute TTL balances freshness (users see recent changes) with performance (avoid excessive CLI calls). Cache is invalidated explicitly via `refresh()` after mutations (install/update/uninstall).

---
**Story ID**: STORY-001-03-001-installed-packages-tree-view  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
