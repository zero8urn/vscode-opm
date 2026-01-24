# STORY-001-03-007-multi-project-update

**Feature**: [FEAT-001-03-manage-packages](../features/FEAT-001-03-manage-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Priority**: High  
**Estimate**: 2 Story Points  
**Created**: 2026-01-19  
**Last Updated**: 2026-01-19

## User Story

**As a** developer using the NuGet Package Management extension  
**I want** to update or downgrade a package across multiple projects simultaneously  
**So that** I can efficiently maintain consistent package versions across my solution

## Description

This story extends single-project update/downgrade (STORY-001-03-003, STORY-001-03-004) to support batch operations across multiple projects. Users can select 2+ projects with the package installed at different versions and execute a bulk update or downgrade to unify them to a selected version.

The implementation handles complex scenarios like:

- Mixed versions: some projects already at target version, some needing update
- Partial selection: updating only some projects, leaving others unchanged
- Mixed operations: impossible scenarios (some need update, some need downgrade) are blocked with guidance

This completes the multi-project package management trilogy: Install, Uninstall, Update/Downgrade.

## Acceptance Criteria

### Scenario: Update Package Across Multiple Projects

**Given** "Newtonsoft.Json" is installed in 3 projects at versions 13.0.1, 13.0.2, and 13.0.3  
**And** I select version 13.0.3 from the dropdown (latest)  
**When** I select all 3 projects  
**Then** project list shows:

- "Project1" with "v13.0.1 ↑" (needs update)
- "Project2" with "v13.0.2 ↑" (needs update)
- "Project3" with "v13.0.3" (already current, no indicator)
  **And** action button shows "Update 2 projects"  
  **And** clicking the button updates only Project1 and Project2  
  **And** toast shows "Package updated in 2 projects"  
  **And** project list refreshes showing all 3 projects at v13.0.3

### Scenario: Downgrade Package Across Multiple Projects

**Given** package installed in 2 projects at v13.0.3 and v13.0.4  
**And** I select version 13.0.2 from dropdown (older than both)  
**When** I select both projects  
**Then** both show downgrade indicator ↓  
**And** action button shows "Downgrade 2 projects"  
**And** clicking the button downgrades both to v13.0.2

### Scenario: Mixed Update/Downgrade Selection (Blocked)

**Given** package installed in Project1 at v13.0.1 and Project2 at v13.0.5  
**And** I select version 13.0.3 from dropdown (between the two)  
**When** I select both projects  
**Then** Project1 shows "v13.0.1 ↑" (would update)  
**And** Project2 shows "v13.0.5 ↓" (would downgrade)  
**And** action button is disabled with message: "Select projects needing the same operation (all update or all downgrade)"

### Scenario: Partial Update with Current Versions

**Given** package installed in 3 projects: 2 at v13.0.1, 1 at v13.0.3 (current)  
**And** I select version 13.0.3 from dropdown  
**When** I select all 3 projects  
**Then** button shows "Update 2 projects" (excludes the 1 already current)  
**And** clicking updates only the 2 projects needing update  
**And** the current project is skipped (no CLI call)

### Scenario: Update Progress and Partial Failure

**Given** I start updating 4 projects  
**When** 3 updates succeed but 1 fails  
**Then** warning toast shows "Package updated in 3 of 4 projects. View Logs for details."  
**And** project list shows 3 with new version, 1 with old version  
**And** cache invalidation still triggers (for successful updates)

### Additional Criteria

- [ ] Button label adapts: "Update 2 projects", "Downgrade 3 projects"
- [ ] Projects already at target version are filtered out (not included in operation)
- [ ] Mixed operations (some update, some downgrade) are blocked with helpful error message
- [ ] Updates execute sequentially with per-project progress updates
- [ ] Progress notification shows "Updating MyApp.Web (2 of 3)..."
- [ ] Partial failures report per-project results
- [ ] Cache invalidation triggers once after all operations complete
- [ ] Version indicators update dynamically as user changes version selection

## Technical Implementation

### Implementation Plan

Extend the button state computation logic to handle multi-project scenarios, filtering projects by operation type (update vs. downgrade) and excluding projects already at target version.

### Key Components

- **File/Module**: `src/webviews/apps/packageBrowser/components/project-selector.ts` - Enhanced button state logic for multi-project version operations
- **File/Module**: `src/commands/installPackageCommand.ts` - Already handles multi-project updates (reuses install infrastructure)

### Technical Approach

**Enhanced Button State Computation**:

```typescript
private computeActionButton(): ActionButtonState {
  const selectedVersion = this.selectedVersion;
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
      disabled: true,
      guidance: 'You cannot install and update in the same operation.'
    };
  }

  // All uninstalled - Install operation
  if (notInstalledProjects.length === selectedProjects.length) {
    return {
      label: selectedProjects.length === 1
        ? 'Install'
        : `Install to ${selectedProjects.length} projects`,
      action: 'install'
    };
  }

  // All installed - categorize by operation type
  const projectsNeedingUpdate = installedProjects.filter(p =>
    compareVersions(p.installedVersion!, selectedVersion) === -1
  );

  const projectsNeedingDowngrade = installedProjects.filter(p =>
    compareVersions(p.installedVersion!, selectedVersion) === 1
  );

  const projectsWithCurrentVersion = installedProjects.filter(p =>
    compareVersions(p.installedVersion!, selectedVersion) === 0
  );

  // Mixed update/downgrade - block operation
  if (projectsNeedingUpdate.length > 0 && projectsNeedingDowngrade.length > 0) {
    return {
      label: 'Mixed operations not supported',
      disabled: true,
      guidance: `${projectsNeedingUpdate.length} projects need update, ${projectsNeedingDowngrade.length} need downgrade. Select projects needing the same operation.`
    };
  }

  // All projects need update
  if (projectsNeedingUpdate.length > 0 && projectsNeedingDowngrade.length === 0) {
    return {
      label: projectsNeedingUpdate.length === 1
        ? 'Update'
        : `Update ${projectsNeedingUpdate.length} projects`,
      action: 'update',
      projectsToUpdate: projectsNeedingUpdate.map(p => p.path)
    };
  }

  // All projects need downgrade
  if (projectsNeedingDowngrade.length > 0 && projectsNeedingUpdate.length === 0) {
    return {
      label: projectsNeedingDowngrade.length === 1
        ? 'Downgrade'
        : `Downgrade ${projectsNeedingDowngrade.length} projects`,
      action: 'downgrade',
      variant: 'secondary',
      projectsToUpdate: projectsNeedingDowngrade.map(p => p.path)
    };
  }

  // All projects already at target version - Uninstall
  return {
    label: selectedProjects.length === 1
      ? 'Uninstall'
      : `Uninstall from ${selectedProjects.length} projects`,
    action: 'uninstall',
    variant: 'secondary'
  };
}
```

**IPC Request Filtering**:
When sending the install/update request, only include projects that need the operation:

```typescript
private async handleUpdateClick(): Promise<void> {
  const buttonState = this.computeActionButton();

  // Filter projects to only those needing the operation
  const projectPaths = buttonState.projectsToUpdate || this.selectedProjectPaths;

  const message: InstallPackageRequestMessage = {
    type: 'installPackageRequest',
    payload: {
      packageId: this.packageId,
      version: this.selectedVersion,
      projectPaths, // Only projects needing update
      requestId: generateId()
    }
  };

  this.postMessage(message);
}
```

**Progress Reporting**:
Reuse the existing multi-project progress reporting from `InstallPackageCommand`:

```
Updating Newtonsoft.Json (1 of 3): MyApp.Web
Updating Newtonsoft.Json (2 of 3): MyApp.Core
Updating Newtonsoft.Json (3 of 3): MyApp.Tests
```

### API/Integration Points

- Reuses `InstallPackageCommand` for update operations (same CLI command)
- Reuses multi-project orchestration from STORY-001-02-007
- No new IPC messages needed

## Testing Strategy

### Unit Tests

- [ ] Test case 1: Button shows "Update 2 projects" when 2 projects need update, 1 already current
- [ ] Test case 2: Button disabled when selection includes mix of update/downgrade operations
- [ ] Test case 3: `projectsToUpdate` array excludes projects already at target version
- [ ] Test case 4: Projects already at target version show no indicator
- [ ] Test case 5: Mixed operation guidance message explains why button is disabled

### Integration Tests

- [ ] Integration scenario 1: Update 3 projects from mixed versions to latest, verify all .csproj files have new version
- [ ] Integration scenario 2: Attempt mixed update/downgrade, verify operation blocked
- [ ] Integration scenario 3: Update 2 of 3 projects (1 already current), verify only 2 CLI calls executed

### Manual Testing

- [ ] Manual test 1: Select 3 projects with mixed versions, verify indicators and button label
- [ ] Manual test 2: Click "Update X projects", verify progress shows per-project status
- [ ] Manual test 3: After update, verify all projects show same version without indicators
- [ ] Manual test 4: Select mix of update/downgrade, verify button disabled with guidance message
- [ ] Manual test 5: Simulate partial failure, verify warning toast and mixed project states

## Dependencies

### Blocked By

- [STORY-001-03-003-update-package](./STORY-001-03-003-update-package.md) - Requires update infrastructure and version comparison
- [STORY-001-02-007-multi-project-install](./STORY-001-02-007-multi-project-install.md) - Requires multi-project orchestration pattern

### Blocks

- None - Completes multi-project package management capabilities

### External Dependencies

- None - reuses existing infrastructure

## INVEST Check

- [x] **I**ndependent - Can be developed independently after single-project update
- [x] **N**egotiable - Details can be adjusted (how to handle mixed operations)
- [x] **V**aluable - Delivers value to users (efficient version management across solutions)
- [x] **E**stimable - Can be estimated (2 story points - complex button logic, but reuses orchestration)
- [x] **S**mall - Can be completed in one iteration (focused on UI logic and filtering)
- [x] **T**estable - Has clear acceptance criteria (comprehensive unit and integration tests)

## Notes

**Why Block Mixed Operations?**
When selection includes some projects needing update and some needing downgrade, the operation is ambiguous. Rather than trying to guess user intent or show two separate buttons, we disable the operation and provide guidance. This forces users to make explicit choices about version management.

Alternative approach: Show two buttons ("Update 2 projects" and "Downgrade 1 project") when mixed operations detected. This is more complex but provides more flexibility. Defer to future enhancement.

**Filtering vs. Skipping**
Two approaches for handling projects already at target version:

1. **Filter**: Remove from `projectPaths` array before sending IPC request (current approach)
2. **Skip**: Include all selected projects, let command skip ones already current

Filtering is cleaner because:

- Reduces unnecessary CLI calls
- Makes progress reporting accurate (shows only operations executed)
- Simplifies error handling (no need for "skipped" result state)

**Version Consolidation Pattern**
This story enables the "consolidate package versions" workflow:

1. View package installed across multiple projects with different versions
2. Select the desired target version (usually latest)
3. Select all projects
4. Click "Update X projects" (excludes projects already at target)
5. All projects now have unified version

This is a common operation in large solutions where package versions drift over time.

## Changelog

| Date       | Change                                                               | Author       |
| ---------- | -------------------------------------------------------------------- | ------------ |
| 2026-01-19 | Story created with enhanced button logic for multi-project scenarios | AI Assistant |

---

**Story ID**: STORY-001-03-007-multi-project-update  
**Feature**: [FEAT-001-03-manage-packages](../features/FEAT-001-03-manage-packages.md)
