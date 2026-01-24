# STORY-001-03-003-update-package

**Feature**: [FEAT-001-03-manage-packages](../features/FEAT-001-03-manage-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Priority**: High  
**Estimate**: 2 Story Points  
**Created**: 2026-01-19  
**Last Updated**: 2026-01-19

## User Story

**As a** developer using the NuGet Package Management extension  
**I want** to update an installed package to a newer version  
**So that** I can easily upgrade packages to get new features and bug fixes without manually editing .csproj files

## Description

This story implements package update functionality that allows users to upgrade installed packages to newer versions. When viewing a package's details with a different version selected than what's currently installed, the UI detects the state and shows an "Update" button (for newer versions) instead of "Install" or "Uninstall".

The implementation reuses the existing `dotnet add package --version <VERSION>` command (same as install) because adding a package reference with a different version effectively updates it. The key difference from initial install is:

1. Detecting that the package is already installed with a different version
2. Showing "Update" button instead of "Install"
3. Showing upgrade indicator (↑) next to installed versions in the project list

This story focuses on single-project updates. Multi-project updates and downgrade scenarios are handled in separate stories.

## Acceptance Criteria

### Scenario: Update Package to Newer Version

**Given** I am viewing "Newtonsoft.Json" package details  
**And** the package is installed in "MyApp.Web" at version 13.0.1  
**And** I select version 13.0.3 from the version dropdown (newer than installed)  
**When** I select "MyApp.Web" project checkbox  
**Then** the installed version shows "v13.0.1 ↑" (upgrade indicator)  
**And** the action button shows "Update"  
**And** clicking "Update" executes `dotnet add MyApp.Web.csproj package Newtonsoft.Json --version 13.0.3`  
**And** progress notification shows "Updating Newtonsoft.Json..."  
**And** on success, toast shows "Package updated in MyApp.Web"  
**And** project list refreshes showing "MyApp.Web" now has version 13.0.3 installed

### Scenario: Update Button Only Appears for Upgrade Operations

**Given** I am viewing an installed package at version 13.0.1  
**When** I select the same version (13.0.1) from dropdown  
**Then** the action button shows "Uninstall" (no change needed)  
**When** I select a newer version (13.0.3) from dropdown  
**Then** the action button shows "Update" with upgrade indicator ↑  
**When** I select an older version (13.0.0) from dropdown  
**Then** the action button shows "Downgrade" with downgrade indicator ↓

### Scenario: Mixed Version States in Multi-Project Selection

**Given** package is installed in "MyApp.Web" at v13.0.1 and "MyApp.Core" at v13.0.3  
**And** I select version 13.0.3 from dropdown  
**When** I select both projects  
**Then** "MyApp.Web" shows "v13.0.1 ↑" (will be updated)  
**And** "MyApp.Core" shows "v13.0.3" (already current, no indicator)  
**And** the action button shows "Update 1 project" (only counts projects needing update)

### Scenario: Update Failure Handling

**Given** I click "Update" and the CLI operation fails  
**Then** error toast shows "Failed to update package in MyApp.Web. View Logs for details."  
**And** project list still shows old version (state unchanged)  
**And** user can retry the operation

### Additional Criteria

- [ ] Update button uses primary styling (same as Install) to indicate non-destructive operation
- [ ] Upgrade indicator ↑ appears next to installed version when selected version is newer
- [ ] Version comparison logic handles semantic versioning correctly (13.0.10 > 13.0.2)
- [ ] Version comparison handles prerelease versions (13.1.0-beta < 13.1.0)
- [ ] CLI command logs to OutputChannel with full command and output
- [ ] Cache invalidation triggers on successful update (same as install)
- [ ] Update reuses existing install command infrastructure (calls `dotnet add package --version`)
- [ ] Button label adapts: "Update", "Update 1 project", "Update X projects"

## Technical Implementation

### Implementation Plan

Extend the project selector UI to detect version differences and compute the appropriate action button state (Install, Update, Downgrade, or Uninstall). Reuse `InstallPackageCommand` for update operations since they use the same CLI command.

### Key Components

- **File/Module**: `src/webviews/apps/packageBrowser/components/project-selector.ts` - Add version comparison logic and button state computation
- **File/Module**: `src/webviews/apps/packageBrowser/state/packageDetails.ts` - Track selected version from dropdown
- **File/Module**: `src/utils/versionComparison.ts` - Implement semantic version comparison utility

### Technical Approach

**Version Comparison Utility**:

```typescript
export function compareVersions(v1: string, v2: string): -1 | 0 | 1 {
  // -1: v1 < v2 (downgrade)
  //  0: v1 == v2 (no change)
  //  1: v1 > v2 (upgrade)

  const semver1 = parseSemVer(v1);
  const semver2 = parseSemVer(v2);

  // Compare major.minor.patch
  if (semver1.major !== semver2.major) {
    return semver1.major > semver2.major ? 1 : -1;
  }
  if (semver1.minor !== semver2.minor) {
    return semver1.minor > semver2.minor ? 1 : -1;
  }
  if (semver1.patch !== semver2.patch) {
    return semver1.patch > semver2.patch ? 1 : -1;
  }

  // Compare prerelease suffix
  if (semver1.prerelease && !semver2.prerelease) return -1;
  if (!semver1.prerelease && semver2.prerelease) return 1;
  if (semver1.prerelease !== semver2.prerelease) {
    return semver1.prerelease > semver2.prerelease ? 1 : -1;
  }

  return 0;
}
```

**Button State Computation** (in `<project-selector>`):

```typescript
private computeActionButton(): ActionButtonState {
  const selectedVersion = this.selectedVersion; // From version dropdown
  const selectedProjects = this.projects.filter(p =>
    this.selectedProjectPaths.includes(p.path)
  );

  if (selectedProjects.length === 0) {
    return { label: 'Install', disabled: true };
  }

  const installedProjects = selectedProjects.filter(p => p.installedVersion);
  const notInstalledProjects = selectedProjects.filter(p => !p.installedVersion);

  // Mixed state: some installed, some not
  if (installedProjects.length > 0 && notInstalledProjects.length > 0) {
    return {
      label: 'Select only installed or uninstalled projects',
      disabled: true
    };
  }

  // All selected projects don't have the package
  if (notInstalledProjects.length === selectedProjects.length) {
    return {
      label: selectedProjects.length === 1
        ? 'Install'
        : `Install to ${selectedProjects.length} projects`,
      action: 'install'
    };
  }

  // All selected projects have the package - check version relationship
  const projectsNeedingUpdate = installedProjects.filter(p =>
    compareVersions(p.installedVersion!, selectedVersion) === -1
  );

  const projectsNeedingDowngrade = installedProjects.filter(p =>
    compareVersions(p.installedVersion!, selectedVersion) === 1
  );

  const projectsWithCurrentVersion = installedProjects.filter(p =>
    compareVersions(p.installedVersion!, selectedVersion) === 0
  );

  // All projects already have the selected version
  if (projectsWithCurrentVersion.length === installedProjects.length) {
    return {
      label: selectedProjects.length === 1
        ? 'Uninstall'
        : `Uninstall from ${selectedProjects.length} projects`,
      action: 'uninstall'
    };
  }

  // Mixed versions: some need update, some downgrade, some current
  // For this story, we only handle uniform update case
  if (projectsNeedingUpdate.length === installedProjects.length) {
    return {
      label: selectedProjects.length === 1
        ? 'Update'
        : `Update ${selectedProjects.length} projects`,
      action: 'update'
    };
  }

  // Other cases handled in subsequent stories
  return { label: 'Mixed versions', disabled: true };
}
```

**Version Indicator Rendering**:

```typescript
private renderVersionIndicator(project: ProjectInfo): TemplateResult {
  if (!project.installedVersion) return html``;

  const comparison = compareVersions(
    project.installedVersion,
    this.selectedVersion
  );

  if (comparison === -1) {
    return html`<span class="upgrade-indicator">↑</span>`;
  } else if (comparison === 1) {
    return html`<span class="downgrade-indicator">↓</span>`;
  }

  return html``;
}
```

**IPC Execution**: Update button sends the same `installPackageRequest` IPC message as install, because `dotnet add package --version` handles both install and update operations. The CLI automatically updates the version in the .csproj file.

### API/Integration Points

- **CLI Command**: `dotnet add <PROJECT> package <PACKAGE_ID> --version <VERSION>` (same as install)
- **Semantic Versioning**: NuGet uses semantic versioning 2.0.0 specification
- **Version Comparison**: Library like `semver` npm package or custom implementation
- **IPC Messages**: Reuse `installPackageRequest` message type (no new messages needed)

## Testing Strategy

### Unit Tests

- [ ] Test case 1: `compareVersions('13.0.1', '13.0.3')` returns -1 (upgrade)
- [ ] Test case 2: `compareVersions('13.0.3', '13.0.1')` returns 1 (downgrade)
- [ ] Test case 3: `compareVersions('13.0.3', '13.0.3')` returns 0 (same)
- [ ] Test case 4: `compareVersions('13.0.10', '13.0.2')` returns 1 (handles multi-digit)
- [ ] Test case 5: `compareVersions('13.1.0-beta', '13.1.0')` returns -1 (prerelease < release)
- [ ] Test case 6: Button state is "Update" when installed version < selected version
- [ ] Test case 7: Button state is "Uninstall" when installed version == selected version
- [ ] Test case 8: Upgrade indicator ↑ appears when installed version < selected version
- [ ] Test case 9: No indicator appears when installed version == selected version

### Integration Tests

- [ ] Integration scenario 1: Update package from v13.0.1 to v13.0.3, verify .csproj file has new version
- [ ] Integration scenario 2: Update triggers cache invalidation, verify next parse returns new version

### Manual Testing

- [ ] Manual test 1: View installed package, select newer version from dropdown, verify "Update" button and ↑ indicator
- [ ] Manual test 2: Click Update, verify progress notification and success toast
- [ ] Manual test 3: After update, verify project list shows new version without indicator
- [ ] Manual test 4: Select same version as installed, verify "Uninstall" button (no update needed)
- [ ] Manual test 5: Select older version, verify button changes to "Downgrade" (handled in separate story)

## Dependencies

### Blocked By

- [STORY-001-02-006-install-command](./STORY-001-02-006-install-command.md) - Requires install command to reuse for updates
- [STORY-001-02-003-version-selector](./STORY-001-02-003-version-selector.md) - Requires version dropdown UI

### Blocks

- [STORY-001-03-007-multi-project-update](./STORY-001-03-007-multi-project-update.md) - Multi-project update extends this story

### External Dependencies

- Semantic versioning comparison library (or custom implementation)

## INVEST Check

- [x] **I**ndependent - Can be developed independently with version comparison utility
- [x] **N**egotiable - Details can be adjusted (indicator symbols, button labels)
- [x] **V**aluable - Delivers value to users (core package management operation)
- [x] **E**stimable - Can be estimated (2 story points - adds version comparison logic)
- [x] **S**mall - Can be completed in one iteration (focused on single-project update)
- [x] **T**estable - Has clear acceptance criteria (extensive version comparison tests)

## Notes

**Why Reuse Install Command?**
The `dotnet add package --version` command handles both initial installation AND updates. If the package is already referenced in the .csproj, it updates the version attribute. This means we can reuse the entire install infrastructure without creating a separate update command.

**Version Comparison Edge Cases**

- Version ranges (e.g., `[13.0.0,14.0.0)`) are NOT supported in this story - only concrete versions
- Wildcard versions (e.g., `13.*`) are NOT supported - only full semantic versions
- Build metadata (e.g., `13.0.0+build123`) is ignored in comparisons (per SemVer 2.0 spec)

**Future Enhancement: Update All**
A future story could add "Update all outdated packages" functionality that automatically selects the latest version for all installed packages and batch-updates them.

## Changelog

| Date       | Change                                      | Author       |
| ---------- | ------------------------------------------- | ------------ |
| 2026-01-19 | Story created with version comparison logic | AI Assistant |

---

**Story ID**: STORY-001-03-003-update-package  
**Feature**: [FEAT-001-03-manage-packages](../features/FEAT-001-03-manage-packages.md)
