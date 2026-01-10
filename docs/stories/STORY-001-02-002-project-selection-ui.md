# STORY-001-02-002-project-selection-ui

**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Priority**: High  
**Estimate**: 3 Story Points  
**Created**: 2025-11-16  
**Last Updated**: 2026-01-05

## User Story

**As a** developer using the NuGet Package Management extension  
**I want** an intuitive project selection interface in the package details view  
**So that** I can choose which projects to install packages into without leaving the browse workflow

## Description

This story implements the project selection UI as an accordion-style inline panel within the package details webview. Following the Visual Studio-style design pattern, the UI uses progressive disclosure to keep installation controls hidden until needed, maintaining a clean browse experience while providing quick access to installation functionality. The accordion section expands to reveal a checkbox list of all discovered projects in the workspace, with metadata showing target frameworks and installation status.

The project selection panel intelligently handles mixed installation states, showing which projects already have the package installed (with version indicators for upgrades/downgrades) and enabling users to select additional projects for installation. The "Select All" checkbox provides bulk selection for available projects while excluding already-installed ones. The install button label dynamically updates based on selection count ("Install", "Install to 2 projects") and becomes disabled when no projects are selected, providing clear visual feedback.

This UI component serves as the primary interaction point for the install workflow, bridging the browse/search experience with the actual package installation operation. It integrates with project discovery services to populate the project list, communicates with the host via IPC for install command execution, and displays real-time progress feedback during multi-project installations. The design prioritizes context preservation—users can see package details, dependencies, and project selection simultaneously without modal dialogs interrupting their workflow.

## Acceptance Criteria

### Scenario: Expand Project Selection Panel (Not Installed)
**Given** I am viewing package details for a package not installed in any workspace projects  
**When** I click the "Install to Projects" accordion header  
**Then** the panel expands to show a checkbox list of all discovered projects with "Select All" option and disabled "Install" button

### Scenario: Select Projects for Installation
**Given** the project selection panel is expanded with 3 available projects  
**When** I check 2 project checkboxes  
**Then** the "Select All" checkbox shows indeterminate state (☑) and the install button label updates to "Install to 2 projects"

### Scenario: View Mixed Installation State
**Given** a package is already installed in 2 of 5 workspace projects  
**When** I expand the "Install to Projects" section  
**Then** I see installed projects marked with ✓ icon and installed version (e.g., "v13.0.3"), available projects with empty checkboxes, and "Select All (3 available)" excluding installed ones

### Scenario: Detect Version Upgrade Opportunity
**Given** the top-level version selector shows "13.0.3" and MyApp.Tests has "v12.0.1" installed  
**When** the panel expands  
**Then** MyApp.Tests row shows "v12.0.1 ↑" indicator signaling an upgrade is available

### Scenario: Bulk Select Available Projects
**Given** the panel shows 2 installed and 3 available projects  
**When** I click "Select All (3 available)"  
**Then** only the 3 available projects are checked and the button reads "Install to 3 projects"

### Scenario: Display Installation Progress
**Given** I have selected 2 projects and clicked "Install to 2 projects"  
**When** the installation begins  
**Then** the panel shows a progress indicator with "Installing to MyApp.Web (1/2)..." and the install button becomes disabled with label "Installing..."

### Additional Criteria
- [ ] Accordion section is collapsed by default when package is not installed anywhere
- [ ] Accordion section auto-expands when package is already installed in at least one project
- [ ] Header shows "✓ Installed (X)" badge when package exists in X projects
- [ ] Project rows display: checkbox, project name, target frameworks, and relative path
- [ ] Long project paths are truncated with ellipsis in the middle to preserve directory context
- [ ] Installed projects show checkmark icon, version label with "v" prefix, and are non-selectable
- [ ] "Select All" checkbox has three states: unchecked (none), indeterminate (some), checked (all available)
- [ ] Install button is disabled when no projects are selected
- [ ] Install button label updates dynamically: "Install" (0 selected), "Install to X projects" (1+ selected)
- [ ] Version upgrade/downgrade indicators (↑/↓) appear when selected version differs from installed
- [ ] Progress state shows spinner, current project being processed, and count (e.g., "2/5")
- [ ] Failed installations show error icon on specific project row with tooltip explaining failure
- [ ] Completed installations show success checkmark on all processed projects

## Technical Implementation

### Implementation Plan
- Component Design: [install-to-projects-ui.md](../discovery/install-to-projects-ui.md) - Complete UI specification with mockups

### Key Components
- **File/Module**: `src/webviews/apps/package-browser/components/project-selector.ts` - Lit component for project selection accordion
- **File/Module**: `src/webviews/apps/package-browser/components/project-list-item.ts` - Individual project row component with checkbox, metadata, and status indicators
- **File/Module**: `src/webviews/apps/package-browser/state/selection-state.ts` - State management for selected projects and installation progress

### Technical Approach

The project selector is implemented as a Lit web component (`<project-selector>`) that consumes project discovery data from the host via IPC. The component maintains local selection state using reactive properties, ensuring the UI updates atomically when users toggle checkboxes or the "Select All" control.

Project metadata (name, path, frameworks, installed version) is passed as a `projects: ProjectInfo[]` property. The component derives computed properties for available vs. installed counts, indeterminate checkbox state, and dynamic button labels. Version comparison logic determines upgrade/downgrade indicators by comparing the top-level selected version to each project's installed version.

Progress tracking uses a separate `installProgress: InstallProgress | null` property that updates via IPC notifications during installation. The component enters a "busy" state, disabling all checkboxes and the install button, while displaying a progress indicator with the current project being processed and overall count.

The component follows the webview helpers pattern: all HTML content is sanitized, CSP-compliant script tags are loaded via the `scripts` parameter, and VS Code theme CSS variables are used for styling (no custom theme service needed).

### API/Integration Points
- **IPC Request**: `request('getProjects', { workspacePath })` → returns `ProjectInfo[]` with name, path, frameworks, installedVersion
- **IPC Request**: `request('installPackage', { packageId, version, projectPaths })` → triggers installation flow
- **IPC Notification**: `notification('installProgress', { currentProject, completed, total })` → updates progress UI
- **IPC Notification**: `notification('installComplete', { results: InstallResult[] })` → finalizes UI state
- **Event**: `project-selection-changed` custom event emitted to parent component with `selectedProjects: string[]` detail

## Testing Strategy

### Unit Tests
- [ ] Test case 1: `project-selector` renders empty state with "No projects found" message when projects array is empty
- [ ] Test case 2: Checkbox selection updates `selectedProjects` state and emits `project-selection-changed` event
- [ ] Test case 3: "Select All" checkbox toggles between unchecked → checked → unchecked states and selects only available projects
- [ ] Test case 4: Install button label updates dynamically based on selection count (0, 1, 2+ projects)
- [ ] Test case 5: Indeterminate checkbox state is set when some but not all available projects are selected
- [ ] Test case 6: Version indicators (↑/↓) are correctly rendered based on installed vs. selected version comparison
- [ ] Test case 7: Progress state disables all interactive elements and shows spinner with current project name
- [ ] Test case 8: Installed projects are rendered with ✓ icon, version label, and non-selectable checkbox state
- [ ] Test case 9: Project path truncation with ellipsis in middle preserves directory structure context
- [ ] Test case 10: Accordion expands/collapses on header click and maintains state across re-renders

### Integration Tests
- [ ] Integration scenario 1: Component fetches project list from host via `getProjects` IPC request on mount
- [ ] Integration scenario 2: Install button click sends `installPackage` IPC request with selected project paths
- [ ] Integration scenario 3: Component updates progress UI in response to `installProgress` IPC notifications
- [ ] Integration scenario 4: Component displays success/error states per project when receiving `installComplete` notification

### Manual Testing
- [ ] Manual test 1: Open package details for "Newtonsoft.Json", expand "Install to Projects", verify all workspace .csproj files are listed
- [ ] Manual test 2: Select 2 of 5 projects, verify "Select All" shows indeterminate state and button reads "Install to 2 projects"
- [ ] Manual test 3: Install package to selected projects, verify progress indicator shows current project and count updates
- [ ] Manual test 4: View package already installed in 2 projects, verify accordion auto-expands with "✓ Installed (2)" badge
- [ ] Manual test 5: Select version "13.0.3" when project has "v12.0.1" installed, verify "↑" upgrade indicator appears
- [ ] Manual test 6: Test keyboard navigation (Tab to checkboxes, Space to toggle, Enter on install button)
- [ ] Manual test 7: Test with high contrast theme, verify all interactive elements have visible focus indicators
- [ ] Manual test 8: Trigger installation error, verify error icon appears on failed project with explanatory tooltip

## Dependencies

### Blocked By
- [STORY-001-02-001c-workspace-project-discovery](./STORY-001-02-001c-workspace-project-discovery.md) - Requires project discovery service to provide ProjectInfo[]
- [STORY-001-01-013-webview-ipc](./STORY-001-01-013-webview-ipc.md) - Requires IPC protocol for getProjects and installPackage requests

### Blocks
- [STORY-001-02-006-install-command](./STORY-001-02-006-install-command.md) - Install command handler depends on project selection UI triggering installPackage requests
- [STORY-001-02-007-multi-project-install](./STORY-001-02-007-multi-project-install.md) - Multi-project orchestration consumes selected project paths from this UI
- [STORY-001-02-008-install-progress](./STORY-001-02-008-install-progress.md) - Progress indicator depends on this UI component for visual feedback

### External Dependencies
- Lit 3.x for reactive web components and template rendering
- VS Code theme CSS variables for styling (e.g., `--vscode-button-background`, `--vscode-checkbox-foreground`)
- Project discovery service providing ProjectInfo data structure with name, path, frameworks, installedVersion properties

## INVEST Check

- [x] **I**ndependent - Can be developed independently (depends on project discovery but isolated Lit component)
- [x] **N**egotiable - Details can be adjusted (UI layout, checkbox styles, progress indicator design are flexible)
- [x] **V**aluable - Delivers value to users (core interaction point for package installation workflow)
- [x] **E**stimable - Can be estimated (3 story points based on Lit component complexity + IPC integration)
- [x] **S**mall - Can be completed in one iteration (single component with clear scope and mockups)
- [x] **T**estable - Has clear acceptance criteria (unit tests for all interactive states, integration tests for IPC, manual tests for UX)

## Notes

**Design Decision: Accordion vs. Modal**  
The inline accordion pattern was chosen over modal dialogs to preserve context—users can see package details, dependencies, and installation options simultaneously without breaking their browse workflow. This follows the Visual Studio 2022 package manager pattern and aligns with VS Code's progressive disclosure conventions.

**Edge Case: No Projects Found**  
If no .csproj files are discovered in the workspace, the component should show an empty state message: "No .NET projects found in workspace. Open a folder containing .csproj files to install packages." with a "Learn More" link to documentation.

**Edge Case: All Projects Already Have Package Installed**  
When the package is installed in all discovered projects, the "Select All" checkbox should be disabled with tooltip "Package already installed in all projects". The install button should be hidden or replaced with an "Update" button if newer versions are available.

**Accessibility Considerations**  
- All checkboxes must have associated labels for screen reader announcements
- Install button must announce state changes (enabled/disabled) via `aria-live="polite"`
- Progress indicator must use `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax` attributes
- Keyboard focus order: accordion header → Select All → project checkboxes (top to bottom) → install button
- High contrast mode: ensure focus indicators have 2px visible border with 3:1 contrast ratio

**Performance Optimization**  
For workspaces with >50 projects, consider implementing virtual scrolling to avoid rendering all project rows simultaneously. The component should debounce checkbox state updates to prevent excessive re-renders during rapid "Select All" toggling.

**Future Enhancement Ideas**  
- Add filter/search input above project list for large workspaces
- Group projects by solution or directory structure
- Show framework compatibility warnings before installation
- Remember last selected projects per package for quick re-installation

## Changelog

| Date | Change | Author |
|---|---|---|
| 2026-01-05 | Story detailed with acceptance criteria, technical implementation, and testing strategy | AI Assistant |
| 2025-11-16 | Story created | AI Assistant |

---
**Story ID**: STORY-001-02-002-project-selection-ui  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
