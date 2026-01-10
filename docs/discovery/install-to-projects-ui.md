# Install to Projects UI Design

**Status**: Discovery  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Created**: 2026-01-04  
**Last Updated**: 2026-01-04

## Overview

This document describes the UI design pattern for the "Install to Projects" functionality within the package details webview. Users can select one or more target projects from their workspace and install a package with a chosen version through an inline, accordion-style interface.

The design follows **Option B: Inline Panel (Visual Studio-style)** with progressive disclosure, placing installation controls directly within the package details view to maintain context and reduce workflow interruption.

## Design Rationale

### Why Inline Panel (Accordion Style)?

1. **Context Preservation**: Users see package details, dependencies, and project selection simultaneously without modal dialogs breaking their flow
2. **VS Code Patterns**: Accordion sections match VS Code's collapsible UI paradigm (e.g., Explorer, Extensions)
3. **Progressive Disclosure**: Installation UI is hidden until needed, reducing visual clutter for browse-only scenarios
4. **Familiar Pattern**: Follows the **Tab-Based Navigation** style (separate Browse/Installed/Updates tabs) and **Accordion Expansion** pattern common in package managers
5. **Webview-Friendly**: Works well within constrained webview panel widths (300-800px typical)

### Relationship to Installed Packages View

The Install to Projects UI operates within the **Browse** workflow, while the Installed Packages view (separate feature) handles management of already-installed packages. Key considerations:

- **Tab-Based Navigation style**: Separate tabs for Browse | Installed | Updates | Consolidate workflows
- **Filtered List style**: Single list with filtering (show installed packages inline with available packages)
- **OPM approach**: Tree view shows installed packages by project; webview shows browse/search results

The flow users will experience:
1. **Browse** → Search/discover packages in webview, see install options
2. **Installed** → Tree view shows packages per project, context menu for manage actions
3. **Manage** → Same webview as Browse, but shows "already installed" state with update/uninstall options

The Install to Projects section must gracefully handle packages already installed in some projects (show which are installed, allow adding to additional projects).

## UI Layout - ASCII Mockups

### State 1: Collapsed (Default - Not Installed)

```
┌──────────────────────────────────────────────────────────────┐
│ 📦 Newtonsoft.Json                              nuget.org ⚙️  │
│                                                                │
│ Version: Latest Stable ▼  13.0.3                              │
│                                                                │
│ Popular high-performance JSON framework for .NET              │
│                                                                │
│ ▼ Details                                                      │
│   ┌────────────────────────────────────────────────────────┐ │
│   │ Newtonsoft.Json is a popular high-performance JSON    │ │
│   │ framework for .NET                                     │ │
│   │                                                        │ │
│   │ Author: James Newton-King                              │ │
│   │ License: MIT                                           │ │
│   │ Downloads: 2,847,932,154                               │ │
│   └────────────────────────────────────────────────────────┘ │
│                                                                │
│ ▶ Frameworks and Dependencies                                 │
│                                                                │
│ ▶ Install to Projects                                         │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

**Note**: Details section is expanded by default to give immediate context about the package.

### State 2: Collapsed (Already Installed in Some Projects)

```
┌──────────────────────────────────────────────────────────────┐
│ 📦 Microsoft.NET.Test.Sdk                       nuget.org ⚙️  │
│                                                                │
│ Version: Latest Stable ▼  17.12.0                             │
│                                                                │
│ The MSBuild targets and properties for building .NET test...  │
│                                                                │
│ ▶ Details                                                      │
│                                                                │
│ ▶ Frameworks and Dependencies                                 │
│                                                                │
│ ▼ Install to Projects                      ✓ Installed (1)    │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

**Note**: The "✓ Installed (1)" indicator shows the package is already installed in at least one project. This auto-expands the section (see State 4) to show current installation status.

### State 3: Expanded - Project Selection (Not Installed Anywhere)

```
┌──────────────────────────────────────────────────────────────┐
│ 📦 Newtonsoft.Json                              nuget.org ⚙️  │
│                                                                │
│ Version: Latest Stable ▼  13.0.3                              │
│                                                                │
│ Popular high-performance JSON framework for .NET              │
│                                                                │
│ ▶ Details                                                      │
│                                                                │
│ ▶ Frameworks and Dependencies                                 │
│                                                                │
│ ▼ Install to Projects                                         │
│   ┌────────────────────────────────────────────────────────┐ │
│   │ □ Select All (3 projects)                              │ │
│   │                                                        │ │
│   │ □ MyApp.Web              net8.0                        │ │
│   │   /src/MyApp.Web/MyApp.Web.csproj                      │ │
│   │                                                        │ │
│   │ □ MyApp.Core             net8.0, netstandard2.0        │ │
│   │   /src/MyApp.Core/MyApp.Core.csproj                    │ │
│   │                                                        │ │
│   │ □ MyApp.Tests            net8.0                        │ │
│   │   /tests/MyApp.Tests/MyApp.Tests.csproj                │ │
│   │                                                        │ │
│   │ [Install]                                              │ │
│   └────────────────────────────────────────────────────────┘ │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

**Text Overflow Handling**: Project paths use ellipsis truncation in the middle to preserve directory structure context (e.g., `.../very/deep/nested/.../MyProject.csproj`). Rows maintain fixed height; paths do not wrap to multiple lines to prevent visual clutter.

### State 4: Expanded - Mixed Installation State

```
┌──────────────────────────────────────────────────────────────┐
│ 📦 Microsoft.NET.Test.Sdk                       nuget.org ⚙️  │
│                                                                │
│ Version: Latest Stable ▼  17.12.0                             │
│                                                                │
│ The MSBuild targets and properties for building .NET test...  │
│                                                                │
│ ▶ Details                                                      │
│                                                                │
│ ▶ Frameworks and Dependencies                                 │
│                                                                │
│ ▼ Install to Projects                      ✓ Installed (2)    │
│   ┌────────────────────────────────────────────────────────┐ │
│   │ □ Select All (1 available)                             │ │
│   │                                                        │ │
│   │ ✓ MyApp.Tests            net8.0        v17.12.0        │ │
│   │   /tests/MyApp.Tests/MyApp.Tests.csproj                │ │
│   │                                                        │ │
│   │ ✓ MyApp.UnitTests        net8.0        v18.0.1 ↑       │ │
│   │   /tests/MyApp.UnitTests/MyApp.UnitTests.csproj        │ │
│   │                                                        │ │
│   │ □ MyApp.IntegrationTests net8.0                        │ │
│   │   /tests/MyApp.IntegrationTests.csproj                 │ │
│   │                                                        │ │
│   │ [Install to 1 project]                                 │ │
│   └────────────────────────────────────────────────────────┘ │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

**Key Points**:
- Already-installed projects show ✓ icon and installed version in a dedicated column
- Version indicator `↑` (upgrade available) or `↓` (downgrade available) appears when selected top-level version differs from installed version
- "Select All" only counts available (non-installed) projects
- Install button label updates dynamically based on selection count
- Installed version column uses `v` prefix to distinguish from target framework versions

### State 5: Project Selection with Some Selected

```
┌──────────────────────────────────────────────────────────────┐
│ 📦 Newtonsoft.Json                              nuget.org ⚙️  │
│                                                                │
│ Version: Latest Stable ▼  13.0.3                              │
│                                                                │
│ Popular high-performance JSON framework for .NET              │
│                                                                │
│ ▶ Details                                                      │
│                                                                │
│ ▶ Frameworks and Dependencies                                 │
│                                                                │
│ ▼ Install to Projects                                         │
│   ┌────────────────────────────────────────────────────────┐ │
│   │ ☑ Select All (3 projects)                              │ │
│   │                                                        │ │
│   │ ☑ MyApp.Web              net8.0                        │ │
│   │   /src/MyApp.Web/MyApp.Web.csproj                      │ │
│   │                                                        │ │
│   │ ☑ MyApp.Core             net8.0, netstandard2.0        │ │
│   │   /src/MyApp.Core/MyApp.Core.csproj                    │ │
│   │                                                        │ │
│   │ □ MyApp.Tests            net8.0                        │ │
│   │   /tests/MyApp.Tests/MyApp.Tests.csproj                │ │
│   │                                                        │ │
│   │ [Install to 2 projects]                                │ │
│   └────────────────────────────────────────────────────────┘ │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

**Key Points**:
- "Select All" checkbox shows indeterminate state (☑) when some but not all projects selected
- Install button label dynamically updates: "Install" (0 selected), "Install to X projects" (1+ selected)
- Install button disabled when no projects selected

### State 6: Installing (Progress)

```
┌──────────────────────────────────────────────────────────────┐
│ 📦 Newtonsoft.Json                              nuget.org ⚙️  │
│                                                                │
│ Version: Latest Stable ▼  13.0.3                              │
│                                                                │
│ Popular high-performance JSON framework for .NET              │
│                                                                │
│ ▶ Details                                                      │
│                                                                │
│ ▶ Frameworks and Dependencies                                 │
│                                                                │
│ ▼ Install to Projects                                         │
│   ┌────────────────────────────────────────────────────────┐ │
│   │ ⏳ MyApp.Web              net8.0        Installing...   │ │
│   │   /src/MyApp.Web/MyApp.Web.csproj                      │ │
│   │                                                        │ │
│   │ ☑ MyApp.Core             net8.0, netstandard2.0        │ │
│   │   /src/MyApp.Core/MyApp.Core.csproj                    │ │
│   │                                                        │ │
│   │ [Installing... (1 of 2)] 🔄                            │ │
│   └────────────────────────────────────────────────────────┘ │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

**Text Overflow Handling**: When concurrent installations occur (multiple projects), the "Installing..." status appears in the version/status column. If text overflows available width, it truncates with ellipsis (`Install...`). The spinner icon provides visual feedback even when text is truncated.

**Note**: VS Code's progress notification also appears in the lower-right corner showing "Installing Newtonsoft.Json (1 of 2)..." with cancel button.

## UI Components Breakdown

### Section Header (Collapsible)

**Label**: "Install to Projects"  
**Expand Icon**: `▶` (collapsed) / `▼` (expanded)  
**Status Badge**: `✓ Installed (X)` when package is already installed in X projects

**Behavior**:
- Click anywhere on header to toggle expand/collapse
- Auto-expand when package already installed (shows current state)
- Persists expanded/collapsed state per package ID in session storage

### Project List Item

**Layout**:
```
[Icon] ProjectName    TargetFramework(s)    Version/Status
       RelativePath
```

**Elements**:
- **Icon**: `□` checkbox for available projects, `✓` for installed, `⏳` during installation, `❌` on error
- **ProjectName**: Bold weight, primary text color, truncated with ellipsis if exceeds width
- **TargetFramework(s)**: Secondary text color, comma-separated if multi-targeting
- **Version/Status Column**: 
  - For installed: `vX.X.X` with optional `↑`/`↓` indicator
  - During install: "Installing..." with spinner
  - On error: Error icon with truncated message
- **RelativePath**: Secondary text color, smaller font, workspace-relative path with middle truncation (e.g., `.../deep/.../Project.csproj`)

**Text Overflow Strategy**:
- **Project names**: Truncate end with ellipsis (`MyVeryLongProjectNa...`)
- **File paths**: Middle truncation preserving filename (`.../nested/.../file.csproj`)
- **Version column**: Fixed width, truncate status text with ellipsis if needed
- **No text wrapping**: All rows maintain single-line height to prevent visual clutter

**States**:
- **Available**: Checkbox enabled, no status icon
- **Installed**: No checkbox, ✓ icon, shows installed version
- **Installing**: Checkbox disabled, ⏳ icon, shows "Installing..." message
- **Success**: ✓ icon appears, checkbox removed, shows installed version
- **Error**: ❌ icon, error message below, checkbox re-enabled for retry

### Select All Checkbox

**States**:
- **Unchecked** `□`: No projects selected
- **Checked** `☑`: All available projects selected
- **Indeterminate** `☑`: Some but not all available projects selected

**Label**: "Select All (X projects)" or "Select All (X available)" when some already installed

**Behavior**:
- Click toggles between all selected / none selected
- Does not affect already-installed projects (they're not in the available set)
- Updates dynamically as individual checkboxes change

### Install Button

**Label Variants**:
- `[Install]` - 0 projects selected (disabled state)
- `[Install]` - 1 project selected
- `[Install to X projects]` - 2+ projects selected
- `[Installing...]` - During installation (disabled, loading spinner)

**States**:
- **Disabled**: No projects selected, or installation in progress
- **Enabled**: At least one project selected and not currently installing
- **Loading**: Shows spinner icon, disables user interaction

**Behavior**:
- Click sends IPC message to extension host with selected project paths and version
- Extension host executes `dotnet add package` sequentially for each project
- UI shows per-project progress updates via IPC notifications

## Interaction Flows

### Flow 1: First-Time Install (Package Not Installed Anywhere)

1. User views package details (section collapsed by default)
2. User clicks "▶ Install to Projects" to expand
3. Extension sends IPC request to fetch workspace projects
4. UI renders project list with all checkboxes unchecked
5. User selects 1+ projects and optionally changes version
6. User clicks "Install to X projects" button
7. UI sends IPC install request with `{ packageId, version, projectPaths[] }`
8. Extension shows VS Code progress notification
9. Extension executes `dotnet add package` for each project sequentially
10. Extension sends IPC progress updates for each project
11. UI updates each project's status icon and message in real-time
12. On completion, extension shows success/error toast
13. On success, section updates to show "✓ Installed (X)" and checkboxes become ✓ icons

### Flow 2: Adding Package to Additional Projects (Already Installed Elsewhere)

1. User views package details (section auto-expands due to existing installation)
2. UI shows mix of ✓ installed projects (no checkbox) and □ available projects
3. User selects additional projects from the available set
4. User clicks "Install to X projects" button
5. Same installation flow as Flow 1, but only for newly selected projects
6. Installed projects remain unchanged with their ✓ status

### Flow 3: User Cancels Installation Mid-Progress

1. Installation in progress (button shows "Installing...", VS Code progress notification visible)
2. User clicks "Cancel" on VS Code progress notification
3. Extension sends IPC cancellation signal
4. UI resets in-progress projects back to checkbox state
5. Any successfully completed projects show ✓ installed status
6. Toast shows "Installation cancelled. X of Y projects completed."

## Technical Considerations

### Project Discovery

- **Trigger**: When section expands for the first time (lazy load)
- **IPC Message**: `{ type: 'getWorkspaceProjects' }`
- **Response**: `{ projects: [{ name, path, targetFrameworks, installedVersion? }] }`
- **Caching**: Cache project list in webview state, invalidate on workspace file changes

### Already-Installed Detection

To determine if a package is already installed:
1. Extension uses existing project parser to read `.csproj` files
2. Checks for `<PackageReference Include="PackageId" />` elements
3. Returns installed version in project list response
4. UI renders installed projects with ✓ icon and version display

**Complexity Note**: This requires parsing all projects on section expand. Consider:
- **Eager loading**: Parse projects in background after webview opens
- **Lazy loading**: Parse only when section expands (may cause 200-500ms delay)
- **Recommendation**: Start with lazy loading; optimize to eager if UX feels sluggish

### Version Selector Integration

The version selector dropdown (separate component at the top of the package details) affects which version is installed:
- Default: "Latest Stable" (pre-selected)
- Options: "Latest Stable", "Latest Prerelease", specific versions in descending order
- When user changes version, all installed project rows update their version indicators:
  - `↑` appears if selected version is newer than installed
  - `↓` appears if selected version is older than installed  
  - No indicator if versions match
- This provides visual feedback similar to upgrade/downgrade version selection patterns
- Install button remains enabled regardless of version selection (no validation blocking)

### State Management

**Webview State**:
```typescript
interface InstallSectionState {
  expanded: boolean;
  projects: ProjectInfo[];
  selectedProjectPaths: string[];
  installing: boolean;
  installProgress: Map<string, 'pending' | 'installing' | 'success' | 'error'>;
}
```

**Persistence**:
- Expanded/collapsed state: Session storage (per package ID)
- Selected projects: Ephemeral (resets when section collapses or package changes)
- Install progress: Cleared on section collapse or package change

### Edge Cases

1. **No projects found**: Show message "No .NET projects found in workspace. Open a folder containing .csproj files."
2. **All projects already installed**: Show "Installed in all workspace projects (X)" with option to change version (future: update story)
3. **Package installed with different version**: Show "Update available" with installed version and selected version
4. **Partial installation failure**: Show mixed ✓/❌ icons, toast shows "Installed to X of Y projects. View logs for details."
5. **User changes package while installing**: Cancel current installation, reset UI state, load new package
6. **Workspace changes during installation**: Complete current installation, invalidate project cache on next expand

## Future Enhancements

1. **Framework Compatibility Warnings**: Show ⚠️ icon when package's target framework doesn't match project (e.g., installing net8.0-only package to netstandard2.0 project)
2. **Dependency Conflicts**: Detect version conflicts with existing packages before installation
3. **Bulk Actions**: "Install to all projects" quick action
4. **Update Flow**: When package already installed, change button to "Update X projects to vX.X.X" (leveraging version indicators)
5. **Uninstall**: Remove package from selected projects (may be separate UI in Installed Packages view)
6. **Source Selection**: Allow changing package source (nuget.org vs. private feed) before install
7. **Responsive Column Layout**: Adjust column widths based on webview width, potentially hide/show columns on narrow viewports

## Decisions

1. **Auto-expand behavior**: ✅ **Yes** - Section auto-expands when package already installed
   - Shows user which projects have the package immediately
   - Provides context for version management (see upgrade/downgrade indicators)

2. **Select All behavior**: ✅ **No** - Select All does NOT affect already-installed projects
   - Only selects available (non-installed) projects
   - Prevents accidental re-installs; aligns with "additive" operation model

3. **Version selector scope**: ✅ **Top-level** - Version selector appears outside Install section
   - Shared with package details display (part of package metadata)
   - Changes to version selector update version indicators (↑/↓) in installed project rows
   - Follows common pattern where version is a property of the package being viewed

4. **Installation order**: ✅ **Concurrent** - Install to multiple projects simultaneously
   - Uses concurrency with reasonable limit (e.g., 3 concurrent dotnet processes)
   - Provides faster feedback for multi-project installations
   - Progress notification shows "Installing (X of Y)" with individual project status in UI

## References

- [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md) - Feature specification
- [STORY-001-02-002-project-selection-ui](../stories/STORY-001-02-002-project-selection-ui.md) - User story
- [request-response.md](./request-response.md) - Architecture and IPC protocol
- Tab-Based Navigation pattern - Separate tabs for Browse, Installed, Updates workflows
- Accordion Expansion pattern - Progressive disclosure with collapsible sections
- Version Indicator pattern - Upgrade/downgrade arrows showing version relationship

---
**Document ID**: install-to-projects-ui  
**Status**: Discovery  
**Last Updated**: 2026-01-04
