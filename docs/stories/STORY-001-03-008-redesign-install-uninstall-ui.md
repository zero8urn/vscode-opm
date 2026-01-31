# STORY-001-03-008-redesign-install-uninstall-ui

**Feature**: [FEAT-001-03-manage-packages](../features/FEAT-001-03-manage-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Priority**: High  
**Estimate**: 3 Story Points  
**Created**: 2026-01-31  
**Last Updated**: 2026-01-31

## User Story

**As a** developer using the NuGet Package Management extension  
**I want** a clear and intuitive install/uninstall UI without confusing checkbox states  
**So that** I can quickly understand which projects have packages installed and take action on individual or all projects at once

## Description

This story redesigns the package installation UI to eliminate confusion from checkbox-based selection. The current system uses checkboxes and a single button that changes between "Install" and "Uninstall" based on selection state, which is confusing when dealing with mixed installation states (some projects installed, some not).

The new design uses a more direct approach:
- **Per-project actions**: Each project row has its own install or uninstall button visible based on installation state
- **Global actions**: Two header buttons for "Install All" and "Uninstall All" operations
- **Visual indicators**: Up/down arrows for version upgrades/downgrades with hover tooltips
- **Simplified display**: Project names show only the `.csproj` filename, installed versions display normally without special highlighting
- **No success toasts**: The UI updates showing the new installed state are sufficient feedback; error toasts remain for failures

## Acceptance Criteria

### Scenario: View Package with Mixed Installation State

**Given** I have a solution with 2 projects: "TestProject.csproj" and "TestProject.Utility.csproj"  
**And** "Newtonsoft.Json" v13.0.3 is installed in "TestProject.csproj" only  
**When** I open the package details for "Newtonsoft.Json" v13.0.3  
**Then** I see:
- "TestProject.csproj" shows installed version "v13.0.3" (no background highlight, no checkmark)
- An uninstall button (trash icon) next to "TestProject.csproj"
- "TestProject.Utility.csproj" shows no installed version
- An install button (plus icon) next to "TestProject.Utility.csproj"
- A global "Install All" button (plus icon) at the top
- A global "Uninstall All" button (trash icon) at the top

### Scenario: Install to Single Project

**Given** the package details are open with mixed installation state  
**When** I click the install button next to "TestProject.Utility.csproj"  
**Then** the install executes for that project only  
**And** on success, "TestProject.Utility.csproj" shows "v13.0.3" and an uninstall button  
**And** no success toast appears (UI update is sufficient feedback)

### Scenario: Uninstall from Single Project

**Given** a package is installed in "TestProject.csproj"  
**When** I click the uninstall button (trash icon) next to "TestProject.csproj"  
**Then** the uninstall executes for that project only  
**And** on success, the installed version is removed and an install button appears  
**And** no success toast appears

### Scenario: Global Install All

**Given** a package is installed in 1 of 3 projects  
**When** I click the global "Install All" button  
**Then** the package installs to all projects that don't have it installed  
**And** on success, all projects show the installed version and uninstall buttons  
**And** no success toast appears

### Scenario: Global Uninstall All

**Given** a package is installed in 2 of 3 projects  
**When** I click the global "Uninstall All" button  
**Then** the package uninstalls from all projects that have it installed  
**And** on success, all projects show no installed version and install buttons  
**And** no success toast appears

### Scenario: Version Upgrade Indicator

**Given** "Newtonsoft.Json" v13.0.2 is installed in "TestProject.csproj"  
**And** I am viewing version v13.0.3 in package details  
**When** I hover over the install button next to "TestProject.csproj"  
**Then** the button shows an up arrow (↑) icon  
**And** the tooltip says "Upgrade from v13.0.2 to v13.0.3"

### Scenario: Version Downgrade Indicator

**Given** "Newtonsoft.Json" v13.0.3 is installed in "TestProject.csproj"  
**And** I am viewing version v13.0.1 in package details  
**When** I hover over the install button next to "TestProject.csproj"  
**Then** the button shows a down arrow (↓) icon  
**And** the tooltip says "Downgrade from v13.0.3 to v13.0.1"

### Scenario: Error Handling Remains Unchanged

**Given** any install or uninstall operation fails  
**Then** an error toast appears with the failure message  
**And** the "View Logs" action opens the output channel

### Additional Criteria

- [ ] No checkboxes appear in the project list (removed entirely)
- [ ] No "Select All" checkbox in the header
- [ ] Project names display only the `.csproj` filename (e.g., "TestProject.csproj", not "TestProject/TestProject.csproj")
- [ ] Installed version displays normally with "v" prefix (e.g., "v13.0.3") without background color or checkmark
- [ ] Install button uses a plus icon (+) and is labeled "Install" (or shows arrow for upgrade/downgrade)
- [ ] Uninstall button uses a trash icon and is labeled "Uninstall"
- [ ] Global "Install All" button has plus icon and only appears when at least one project is not installed
- [ ] Global "Uninstall All" button has trash icon and only appears when at least one project is installed
- [ ] Version indicators (↑ upgrade, ↓ downgrade) appear on the install button when applicable
- [ ] Hover tooltips explain upgrade/downgrade with version details
- [ ] Success toast notifications are removed (both install and uninstall)
- [ ] Error toasts remain for operation failures
- [ ] Progress notifications continue to show during operations
- [ ] UI updates optimistically after successful operations

## Technical Implementation

### Implementation Plan

See [IMPL-001-03-008-redesign-install-uninstall-ui](../technical/IMPL-001-03-008-redesign-install-uninstall-ui.md)

### Key Components

- **File/Module**: `src/webviews/apps/packageBrowser/components/project-list-item.ts` - Remove checkbox, add per-project install/uninstall buttons with icons and version indicators
- **File/Module**: `src/webviews/apps/packageBrowser/components/project-selector.ts` - Remove Select All checkbox, add global Install All/Uninstall All buttons
- **File/Module**: `src/webviews/apps/packageBrowser/state/selection-state.ts` - Remove or simplify (no longer needed for checkbox state)
- **File/Module**: `src/webviews/packageBrowserWebview.ts` - Remove success toast notifications for install/uninstall
- **File/Module**: `src/webviews/apps/packageBrowser/types.ts` - Update IPC messages for individual project operations

### Technical Approach

1. **Remove Success Toasts**: Delete `showInformationMessage` calls for successful install/uninstall operations in `packageBrowserWebview.ts`. Keep error toasts.

2. **Simplify Project Display**: 
   - Update `project-list-item.ts` to extract only the filename from the project path (e.g., "TestProject.csproj" instead of "TestProject/TestProject.csproj")
   - Remove background color and checkmark from installed badge, display version as plain text "v13.0.3"

3. **Per-Project Action Buttons**:
   - Replace checkbox in `project-list-item.ts` with conditional rendering:
     - If `installedVersion === undefined`: Show install button with plus icon
     - If `installedVersion !== undefined`: Show uninstall button with trash icon
   - Compute version indicator (upgrade/downgrade) using existing `getVersionIndicator()` utility
   - Add up arrow (↑) to install button when upgrade, down arrow (↓) when downgrade
   - Add hover tooltip showing "Upgrade from vX to vY" or "Downgrade from vX to vY"
   - Emit custom events: `install-project` and `uninstall-project` with `{ projectPath }` detail

4. **Global Action Buttons**:
   - Add header section in `project-selector.ts` with two buttons:
     - "Install All" (plus icon): Visible when `availableProjects.length > 0`
     - "Uninstall All" (trash icon): Visible when `installedProjects.length > 0`
   - Emit events: `install-all` and `uninstall-all` with list of applicable project paths

5. **Remove Selection State**:
   - Remove `SelectionState` class usage from `project-selector.ts`
   - Remove "Select All" checkbox from template
   - Remove checkbox change handlers

6. **Update Event Handlers**:
   - In `packageDetailsPanel.ts`, handle new events:
     - `install-project`: Call existing `handleInstallPackageFromSelector` with single project
     - `uninstall-project`: Call existing `handleUninstallPackageFromSelector` with single project
     - `install-all`: Get all projects with `installedVersion === undefined`, call install handler
     - `uninstall-all`: Get all projects with `installedVersion !== undefined`, call uninstall handler

7. **Icon Integration**:
   - Use VSCode Codicons or inline SVG for icons (plus, trash, up arrow, down arrow)
   - Ensure icons match VSCode's icon styling

## Dependencies

- None (refactors existing UI)

## Risks & Considerations

- **User Retraining**: Users familiar with the checkbox pattern may need to adjust to direct action buttons
- **Visual Density**: Per-project buttons add more UI elements; ensure spacing is comfortable
- **Icon Clarity**: Ensure icons are immediately recognizable (test with users if possible)
- **Migration**: No data migration needed, purely UI change

## Notes

This design follows common package manager patterns (npm, yarn, VS extensions) where actions are direct and contextual rather than selection-based. It reduces cognitive load by making the action you want to take immediately visible next to each item.

## Related Stories

- STORY-001-02-002-project-selection-ui (original checkbox-based design)
- STORY-001-03-001-uninstall-single (uninstall functionality)
- STORY-001-02-006-install-command (install functionality)
