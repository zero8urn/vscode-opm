# STORY-001-02-003-version-selector

**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Done  
**Priority**: High  
**Estimate**: 2 Story Points  
**Created**: 2025-11-16  
**Last Updated**: 2026-01-11

## User Story

**As a** developer using the NuGet Package Management extension  
**I want** implement version selector dropdown  
**So that** I can efficiently manage NuGet packages in my VS Code workspace

## Description

This story implements the version selector dropdown component that allows users to choose which version of a NuGet package to install. The component displays actual version numbers (e.g., "13.0.3", "12.0.3") with informational badges (e.g., "Latest stable", "Prerelease") to help users identify the latest or prerelease versions at a glance, following the industry-standard pattern used in Visual Studio 2022 and NuGet.org.

The version selector is a critical piece of the installation workflow, appearing at the top of the package details view and providing immediate visual feedback about the selected version. When users change the version selection, the component updates the install state indicators (showing upgrade/downgrade arrows for already-installed packages) and communicates the selection to the extension host for validation and installation orchestration. This component bridges the gap between package discovery (from the Browse & Search feature) and installation execution.

The implementation follows the Lit web component pattern established in the extension, receiving version metadata as a property from its parent component (packageDetailsPanel) which has already fetched the package details. The component presents versions in descending order with visual badges to indicate latest stable and prerelease versions. The design ensures users understand exactly which version they're about to install while maintaining the visual consistency of VS Code's webview UI patterns and industry conventions. When users change the version selection, the component emits a custom event and sends an IPC message to notify the extension host of the selection change.

## Acceptance Criteria

### Scenario: Display Available Versions
**Given** the user has opened the package details panel for "Newtonsoft.Json"  
**When** the version selector is rendered  
**Then** the dropdown displays "13.0.3 ▼" with a "Latest stable" badge next to the version  
**And** the dropdown options show version numbers in descending order (13.0.3, 12.0.3, 11.0.2, etc.)  
**And** the latest stable version (13.0.3) has a "Latest stable" badge displayed inline  
**And** prerelease versions are excluded when "Include Prerelease" filter is unchecked

### Scenario: Select Specific Version
**Given** the version selector is showing "13.0.3 ▼" with "Latest stable" badge  
**When** the user clicks the dropdown and selects "12.0.3"  
**Then** the dropdown displays "12.0.3 ▼" without any badge (older version)  
**And** an IPC message is sent to the extension host with the selected version "12.0.3"  
**And** the install/update button state updates based on the new selection

### Scenario: Show Upgrade Indicator for Installed Package
**Given** the package is installed in a project with version "12.0.3"  
**When** the user selects "13.0.3" (latest stable) from the dropdown  
**Then** the installed project row shows "↑" upgrade indicator  
**And** the installed version column displays "v12.0.3"  
**And** the selected version displays "13.0.3 ▼" with "Latest stable" badge

### Scenario: Show Downgrade Indicator for Newer Installed Version
**Given** the package is installed in a project with version "14.0.0"  
**When** the user selects "13.0.3" from the dropdown  
**Then** the installed project row shows "↓" downgrade indicator  
**And** the version selector remains at "13.0.3 ▼"

### Scenario: Include Prerelease Versions When Filter Enabled
**Given** the "Include Prerelease" filter is unchecked  
**When** the user opens the version selector dropdown  
**Then** only stable versions are shown (e.g., 13.0.3, 12.0.3, 11.0.2)  
**And** prerelease versions (e.g., 14.0.0-beta1) are not displayed

**Given** the "Include Prerelease" filter is checked  
**When** the user opens the version selector dropdown  
**Then** both stable and prerelease versions are shown in descending order  
**And** the latest prerelease version (e.g., 14.0.0-beta1) appears first with a "Latest prerelease" badge  
**And** the latest stable version (e.g., 13.0.3) appears below it with a "Latest stable" badge  
**And** prerelease versions have a "Prerelease" badge displayed inline

### Additional Criteria
- [ ] Component is implemented as a Lit web component in `src/webviews/apps/components/version-selector.ts`
- [ ] Dropdown options show actual version numbers (e.g., "13.0.3", "12.0.3") sorted in descending order using semantic versioning comparison
- [ ] Latest stable version displays an inline "Latest stable" badge (not a separate selectable option)
- [ ] Latest prerelease version displays an inline "Latest prerelease" badge when "Include Prerelease" is enabled
- [ ] All prerelease versions display a "Prerelease" badge for easy identification
- [ ] Version selection persists when navigating between package details panels within the same session
- [ ] Component respects VS Code theme colors using `--vscode-*` CSS variables for badges and dropdown styling
- [ ] Dropdown width auto-adjusts to fit longest version string plus badge without truncation
- [ ] Component emits a `version-changed` custom event with the actual version number when selection changes
- [ ] Component accepts `versions` property from parent component containing pre-fetched version metadata
- [ ] Loading and error states are controlled by parent component via properties
- [ ] Keyboard navigation works (arrow keys to navigate, Enter to select, Escape to close)

## Technical Implementation

### Implementation Plan
No separate implementation document required - straightforward Lit component with IPC integration

### Key Components
- **File/Module**: `src/webviews/apps/components/version-selector.ts` - Lit web component for version dropdown
- **File/Module**: `src/webviews/apps/package-browser/package-browser-app.ts` - Parent component consuming version selector
- **File/Module**: `src/domain/models/packageDetails.ts` - PackageDetails type with version metadata
- **File/Module**: `src/webviews/ipc/messages.ts` - IPC message types for version selection

### Technical Approach
The version selector is implemented as a Lit web component using the `@customElement` decorator with a co-located tag constant (e.g., `export const VERSION_SELECTOR_TAG = 'version-selector' as const`). The component receives package version metadata as a `versions` property from its parent component (packageDetailsPanel), which has already fetched package details including version information. This eliminates redundant API calls since the parent already has this data.

Version options are sorted using semantic versioning comparison (descending order), displaying actual version numbers (e.g., "13.0.3"). The component identifies the latest stable and latest prerelease versions from the metadata and renders inline badges next to these versions in the dropdown options. Version badges are displayed inline within the dropdown options (e.g., "13.0.3 (Latest stable)").

The component maintains internal state for the selected version and emits a `version-changed` custom event with the actual version number when the user makes a selection. This event bubbles up to allow the parent component to react to version changes and send IPC messages to the extension host to update the installation state.

The parent component (packageDetailsPanel) controls loading and error states through properties, ensuring the version selector remains a pure presentation component focused on rendering and user interaction.

### API/Integration Points
- **Property Input**: `versions: VersionMetadata[]` - Receives version data from parent component (packageDetailsPanel)
- **IPC Message**: `{ type: 'request', name: 'versionChanged', args: { packageId, version } }` - Notifies host of selection change
- **Custom Event**: `new CustomEvent('version-changed', { detail: { version } })` - Notifies parent component of selection
- **Parent Component**: packageDetailsPanel passes version data from its own package details fetch (which uses the package details cache with TTL: 10 minutes)

## Testing Strategy

### Unit Tests
- [ ] Test case 1: Component renders with default latest stable version (e.g., "13.0.3") selected when initialized with version metadata
- [ ] Test case 2: Dropdown options are sorted in descending order using semantic versioning comparison
- [ ] Test case 3: "Latest stable" badge is rendered inline next to the latest stable version option
- [ ] Test case 4: "Latest prerelease" and "Prerelease" badges are rendered when `includePrerelease: true` prop is set
- [ ] Test case 5: `version-changed` event is emitted with actual version number (e.g., "12.0.3") when user selects from dropdown
- [ ] Test case 6: Component correctly receives and processes `versions` property from parent
- [ ] Test case 7: Component displays loading/error states when parent sets `loading`/`error` properties
- [ ] Test case 8: Prerelease versions are excluded when `includePrerelease: false` prop is set
- [ ] Test case 9: Selected version persists when component re-renders with same package ID
- [ ] Test case 10: Dropdown resets to latest stable version when package ID changes
- [ ] Test case 11: Badges use correct VS Code theme colors and respect theme changes
- [ ] Test case 12: Keyboard navigation (arrow keys, Enter, Escape) works correctly

### Integration Tests
- [ ] Integration scenario 1: Parent component (packageDetailsPanel) fetches package details and passes versions to version-selector component
- [ ] Integration scenario 2: Parent component receives `version-changed` event and sends IPC message to extension host
- [ ] Integration scenario 3: Install button state updates when version selection changes (e.g., shows "Update" vs "Downgrade")

### Manual Testing
- [ ] Manual test 1: Open package details for "Newtonsoft.Json", verify dropdown shows "13.0.3 ▼" with "Latest stable" badge and all versions are listed in descending order
- [ ] Manual test 2: Open dropdown, verify "Latest stable" badge appears inline next to version 13.0.3 in the options list
- [ ] Manual test 3: Select "12.0.3" from dropdown, verify dropdown updates to "12.0.3 ▼" without any badge (older version)
- [ ] Manual test 4: Toggle "Include Prerelease" filter on, verify dropdown shows prerelease versions with "Prerelease" badges and "Latest prerelease" badge on the newest prerelease
- [ ] Manual test 5: Test with a package already installed in a project, verify upgrade/downgrade indicators (↑/↓) appear correctly when selecting different versions
- [ ] Manual test 6: Switch between light/dark/high-contrast themes, verify dropdown styling and badge colors use correct VS Code theme tokens
- [ ] Manual test 7: Test keyboard navigation: Tab to focus dropdown, arrow keys to navigate options, Enter to select, Escape to close
- [ ] Manual test 8: Test with slow network, verify loading spinner appears while fetching versions
- [ ] Manual test 9: Test with network error, verify error state displays "Version unavailable" message

## Dependencies

### Blocked By
- [STORY-001-01-008](../stories/STORY-001-01-008-package-details-api.md) - Package Details API must be implemented to provide version metadata
- [STORY-001-01-012](../stories/STORY-001-01-012-details-cache.md) - Package Details Cache must be implemented for efficient version fetching
- [STORY-001-01-013](../stories/STORY-001-01-013-webview-ipc.md) - Webview IPC Protocol must be defined for version selection messages

### Blocks
- [STORY-001-02-002](../stories/STORY-001-02-002-project-selection-ui.md) - Project Selection UI needs version selection to show upgrade/downgrade indicators
- [STORY-001-02-004](../stories/STORY-001-02-004-dotnet-add-package.md) - dotnet add package execution requires selected version from this component
- [STORY-001-02-006](../stories/STORY-001-02-006-install-command.md) - Install Command Handler depends on version selection state

### External Dependencies
- **Lit Library**: Web component framework for component implementation
- **NuGet Registration API**: Provides version metadata (all versions, release dates, deprecation status)
- **VS Code Webview API**: Provides theme CSS variables (`--vscode-*`) for styling
- **semantic-versioning library**: For version comparison and sorting (e.g., `semver` npm package or custom implementation)

## INVEST Check

- [x] **I**ndependent - Can be developed independently once Package Details API and IPC protocol are complete
- [x] **N**egotiable - Details can be adjusted (e.g., dropdown styling, version label format, sort order)
- [x] **V**aluable - Delivers critical value by enabling users to select specific package versions for installation
- [x] **E**stimable - Can be estimated at 2 story points (straightforward Lit component with moderate complexity)
- [x] **S**mall - Can be completed in one iteration (1-2 days for component + tests)
- [x] **T**estable - Has clear acceptance criteria with unit, integration, and manual test scenarios

## Notes

### Design Decisions
- **Native `<select>` vs Custom Dropdown**: May need custom dropdown implementation to render badges inline with version numbers, as native `<select>` has limited styling options. However, ensure accessibility (ARIA labels, keyboard navigation) matches native behavior. Alternative: use native `<select>` with version numbers only, and show badge in the collapsed state display.
- **Badge Pattern vs Selectable Options**: Following Visual Studio 2022 and NuGet.org pattern where actual version numbers are selectable, with badges as informational indicators ("Latest stable", "Prerelease"). This avoids ambiguity about what version will be installed and aligns with industry standards.
- **Version Label Format**: Display exact version numbers (e.g., "13.0.3") as selectable options, with badges rendered inline using subtle styling (smaller font, muted color, or background pill). Avoid "v" prefix to prevent redundancy with installed version columns.
- **Sort Order**: Descending order (newest first) aligns with user expectations from NuGet.org and Visual Studio package manager. When "Include Prerelease" is enabled, prerelease versions appear first if newer than stable.
- **Prerelease Handling**: Prerelease versions are only shown when the "Include Prerelease" filter is enabled, preventing accidental installation of unstable versions. All prerelease versions display a "Prerelease" badge for easy identification.

### Edge Cases
- **Deprecated Versions**: Should deprecated versions be shown in the dropdown? Decision: Yes, but with a visual indicator (e.g., strikethrough or warning icon) to discourage selection.
- **Very Long Version Lists**: Some packages (e.g., AutoMapper) have 100+ versions. Should we paginate or limit the dropdown? Decision: Show all versions but implement virtual scrolling if performance issues arise.
- **Network Timeout**: If version metadata fails to load, should we fall back to showing just "Latest"? Decision: Show error state with retry button; don't guess versions.
- **Unlisted Versions**: NuGet API may return unlisted versions (hidden from search but still installable). Decision: Include unlisted versions in dropdown but mark them with "(unlisted)" suffix.

### Future Enhancements
- Add version release date tooltip on hover (e.g., "13.0.3 - Released Jan 5, 2024")
- Add download count badge next to each version option
- Implement "Search versions" input for packages with many versions
- Show deprecation warnings inline when selecting deprecated versions

## Changelog

| Date | Change | Author |
|---|---|---|
| 2025-11-16 | Story created | AI Assistant |
| 2026-01-10 | Filled out product details with acceptance criteria, technical implementation, testing strategy, and dependencies | GitHub Copilot |
| 2026-01-10 | Updated to use industry-standard badge pattern (badges next to versions) instead of "Latest Stable"/"Latest Prerelease" as selectable options | GitHub Copilot |

---
**Story ID**: STORY-001-02-003-version-selector  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
