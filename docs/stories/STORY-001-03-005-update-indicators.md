# STORY-001-03-005-update-indicators

**Feature**: [FEAT-001-03-manage-packages](../features/FEAT-001-03-manage-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Priority**: Medium  
**Estimate**: 1 Story Points  
**Created**: 2026-01-19  
**Last Updated**: 2026-01-19

## User Story

**As a** developer using the NuGet Package Management extension  
**I want** to see visual indicators when package updates are available  
**So that** I can quickly identify which installed packages have newer versions available without manually checking

## Description

This story enhances the package details UI to automatically show update availability when viewing installed packages. When the version dropdown shows "Latest Stable" (or another version) that is newer than the currently installed version, the UI displays upgrade indicators (↑) and automatically selects the newer version to encourage updates.

This provides proactive discovery of updates without requiring users to manually browse through versions. The implementation leverages the existing version comparison logic from the update story.

## Acceptance Criteria

### Scenario: Show Update Indicator on Package Load

**Given** "Newtonsoft.Json" is installed in "MyApp.Web" at version 13.0.1  
**And** the latest stable version is 13.0.3  
**When** I view the package details  
**Then** the version dropdown automatically selects "Latest Stable (13.0.3)"  
**And** the project list shows "MyApp.Web" with "v13.0.1 ↑" indicator  
**And** the action button shows "Update" (when project selected)  
**And** a subtle badge or banner shows "Update available: 13.0.1 → 13.0.3"

### Scenario: No Indicator When Package Is Current

**Given** package is installed at version 13.0.3 (latest stable)  
**When** I view the package details  
**Then** version dropdown shows "Latest Stable (13.0.3)" selected  
**And** project list shows "v13.0.3" without any indicator  
**And** no update banner appears

### Scenario: Prerelease Update Indication

**Given** package is installed at stable version 13.0.3  
**And** a prerelease version 13.1.0-beta exists  
**When** I toggle "Include Prerelease" checkbox  
**Then** version dropdown switches to "Latest Prerelease (13.1.0-beta)"  
**And** project list shows "v13.0.3 ↑" indicator  
**And** update banner shows "Prerelease update available: 13.0.3 → 13.1.0-beta"

### Scenario: Multiple Projects with Different Versions

**Given** package installed in "MyApp.Web" at v13.0.1 and "MyApp.Core" at v13.0.3  
**And** latest stable is 13.0.3  
**When** I view package details  
**Then** "MyApp.Web" shows "v13.0.1 ↑" (needs update)  
**And** "MyApp.Core" shows "v13.0.3" (current, no indicator)  
**And** update banner shows "Updates available for 1 of 2 projects"

### Additional Criteria

- [ ] Version dropdown defaults to "Latest Stable" when viewing installed packages with updates
- [ ] Update banner appears at top of details pane when any project has older version
- [ ] Banner shows version transition: "13.0.1 → 13.0.3"
- [ ] Banner includes quick action button: "Update all projects" (if multiple need update)
- [ ] Indicators dynamically update when user changes version selection
- [ ] No indicator appears when installed version matches selected version
- [ ] Badge uses VS Code theme colors: warning/info color for update availability

## Technical Implementation

### Implementation Plan

Add logic to the package details view that compares installed versions across all projects to the selected/default version and displays appropriate UI indicators.

### Key Components

- **File/Module**: `src/webviews/apps/packageBrowser/components/package-details.ts` - Add update banner component
- **File/Module**: `src/webviews/apps/packageBrowser/state/packageDetails.ts` - Compute update availability state
- **File/Module**: `src/webviews/apps/packageBrowser/components/project-selector.ts` - Already has indicators from update story

### Technical Approach

**Compute Update State**:

```typescript
interface UpdateState {
  hasUpdates: boolean;
  projectsNeedingUpdate: ProjectInfo[];
  oldestVersion: string;
  newestVersion: string;
}

private computeUpdateState(): UpdateState {
  const selectedVersion = this.selectedVersion;
  const installedProjects = this.projects.filter(p => p.installedVersion);

  const projectsNeedingUpdate = installedProjects.filter(p =>
    compareVersions(p.installedVersion!, selectedVersion) === -1
  );

  if (projectsNeedingUpdate.length === 0) {
    return { hasUpdates: false, projectsNeedingUpdate: [], oldestVersion: '', newestVersion: '' };
  }

  const versions = projectsNeedingUpdate.map(p => p.installedVersion!);
  const oldestVersion = versions.sort(compareVersions)[0];

  return {
    hasUpdates: true,
    projectsNeedingUpdate,
    oldestVersion,
    newestVersion: selectedVersion
  };
}
```

**Update Banner Component**:

```typescript
private renderUpdateBanner(): TemplateResult {
  const updateState = this.computeUpdateState();

  if (!updateState.hasUpdates) {
    return html``;
  }

  const count = updateState.projectsNeedingUpdate.length;
  const total = this.projects.filter(p => p.installedVersion).length;

  return html`
    <div class="update-banner" role="alert">
      <span class="icon">↑</span>
      <span class="message">
        ${count === total
          ? html`Update available: ${updateState.oldestVersion} → ${updateState.newestVersion}`
          : html`Updates available for ${count} of ${total} projects`
        }
      </span>
      ${count > 1 ? html`
        <button @click=${this.handleUpdateAll} class="quick-action">
          Update all
        </button>
      ` : ''}
    </div>
  `;
}
```

**Auto-Select Latest Version**:
When package details load, check if any installed project has an older version than latest stable. If so, auto-select "Latest Stable" in the version dropdown to encourage updates.

### API/Integration Points

- Reuses version comparison utility from update story
- Reuses project metadata from existing project selector
- No new IPC messages needed

## Testing Strategy

### Unit Tests

- [ ] Test case 1: `computeUpdateState()` returns hasUpdates=true when installed < selected
- [ ] Test case 2: `computeUpdateState()` returns hasUpdates=false when installed == selected
- [ ] Test case 3: Update banner renders when updates available
- [ ] Test case 4: Update banner does NOT render when all projects current
- [ ] Test case 5: Banner shows "X of Y projects" when mixed versions
- [ ] Test case 6: "Update all" button appears when 2+ projects need update

### Manual Testing

- [ ] Manual test 1: Install old version, view package, verify update banner and indicators appear
- [ ] Manual test 2: Update package to latest, verify indicators disappear
- [ ] Manual test 3: Toggle prerelease, verify indicators update dynamically
- [ ] Manual test 4: Verify banner uses VS Code theme colors (info/warning)
- [ ] Manual test 5: Click "Update all" button, verify all projects selected and update executes

## Dependencies

### Blocked By

- [STORY-001-03-003-update-package](./STORY-001-03-003-update-package.md) - Requires version comparison logic and update indicators

### Blocks

- None - Enhancement to make updates more discoverable

### External Dependencies

- None

## INVEST Check

- [x] **I**ndependent - Can be developed independently after update story
- [x] **N**egotiable - Details can be adjusted (banner styling, auto-select behavior)
- [x] **V**aluable - Delivers value to users (proactive update discovery)
- [x] **E**stimable - Can be estimated (1 story point - UI enhancement)
- [x] **S**mall - Can be completed in one iteration (focused on visual indicators)
- [x] **T**estable - Has clear acceptance criteria (visual and behavioral tests)

## Notes

**Design Inspiration**
This pattern is common in package managers:

- npm shows "outdated" badge in package lists
- Visual Studio shows yellow update indicator in NuGet Package Manager
- VS Code Extensions view shows "Update" button for extensions with newer versions

**Auto-Select Latest Behavior**
Auto-selecting "Latest Stable" when updates are available reduces friction - users don't have to manually browse versions to find the latest. They can immediately click "Update" if desired.

However, this behavior should be smart:

- Auto-select latest ONLY if user hasn't explicitly selected a different version
- Preserve user's manual version selection (don't override it on refresh)
- Reset to latest when navigating to a different package

**Accessibility**
The update banner should use `role="alert"` to announce updates to screen readers. The upgrade indicator ↑ should have `aria-label="Update available"` for non-visual users.

## Changelog

| Date       | Change        | Author       |
| ---------- | ------------- | ------------ |
| 2026-01-19 | Story created | AI Assistant |

---

**Story ID**: STORY-001-03-005-update-indicators  
**Feature**: [FEAT-001-03-manage-packages](../features/FEAT-001-03-manage-packages.md)
