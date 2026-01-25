# STORY-001-03-004-downgrade-package

**Feature**: [FEAT-001-03-manage-packages](../features/FEAT-001-03-manage-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Priority**: Medium  
**Estimate**: 1 Story Points  
**Created**: 2026-01-19  
**Last Updated**: 2026-01-19

## User Story

**As a** developer using the NuGet Package Management extension  
**I want** to downgrade an installed package to an older version  
**So that** I can roll back to a previous version if a newer version introduces bugs or breaking changes

## Description

This story implements package downgrade functionality, allowing users to install an older version of a package than what's currently installed. This is essentially the same as update (reuses `dotnet add package --version`), but with different UI indicators and messaging to make the operation's intent clear.

When viewing a package with an older version selected than what's installed, the UI shows a "Downgrade" button and downgrade indicator (↓) next to installed versions. This provides clear visual feedback that the operation will move to an older version, which may have compatibility or feature implications.

## Acceptance Criteria

### Scenario: Downgrade Package to Older Version

**Given** I am viewing "Newtonsoft.Json" package details  
**And** the package is installed in "MyApp.Web" at version 13.0.3  
**And** I select version 13.0.1 from the version dropdown (older than installed)  
**When** I select "MyApp.Web" project checkbox  
**Then** the installed version shows "v13.0.3 ↓" (downgrade indicator)  
**And** the action button shows "Downgrade"  
**And** clicking "Downgrade" executes `dotnet add MyApp.Web.csproj package Newtonsoft.Json --version 13.0.1`  
**And** progress notification shows "Downgrading Newtonsoft.Json..."  
**And** on success, toast shows "Package downgraded in MyApp.Web"  
**And** project list refreshes showing "MyApp.Web" now has version 13.0.1 installed

### Scenario: Downgrade Indicator Appears for Older Versions

**Given** package is installed at version 13.0.3  
**When** I select version 13.0.1 from dropdown (older)  
**Then** downgrade indicator ↓ appears next to "v13.0.3"  
**And** action button shows "Downgrade"  
**When** I select version 13.0.3 from dropdown (same)  
**Then** no indicator appears  
**And** action button shows "Uninstall"  
**When** I select version 13.0.4 from dropdown (newer)  
**Then** upgrade indicator ↑ appears next to "v13.0.3"  
**And** action button shows "Update"

### Scenario: Downgrade Warning Message

**Given** I click "Downgrade" button  
**Then** operation executes without additional confirmation  
**And** success toast includes informational message about potential compatibility impacts

### Additional Criteria

- [ ] Downgrade button uses secondary styling (like Uninstall) to indicate potentially risky operation
- [ ] Downgrade indicator ↓ appears next to installed version when selected version is older
- [ ] Version comparison correctly identifies downgrade scenarios (13.0.1 < 13.0.3)
- [ ] Progress notification shows "Downgrading..." message
- [ ] Success toast says "Package downgraded" (not "updated" or "installed")
- [ ] CLI command is identical to update: `dotnet add package --version <OLD_VERSION>`
- [ ] Cache invalidation triggers on successful downgrade (same as update)
- [ ] Button label adapts: "Downgrade", "Downgrade 1 project", "Downgrade X projects"

## Technical Implementation

### Implementation Plan

Extend the button state computation logic from STORY-001-03-003 to handle downgrade case. Reuse the same version comparison utility, but show different button label and styling when comparison returns 1 (installed > selected).

### Key Components

- **File/Module**: `src/webviews/apps/packageBrowser/components/project-selector.ts` - Add downgrade case to button state logic
- **File/Module**: `src/utils/versionComparison.ts` - Already implemented in update story

### Technical Approach

Extend the button state computation from update story:

```typescript
private computeActionButton(): ActionButtonState {
  // ... existing logic for install/uninstall cases ...

  // Check if all selected projects need downgrade
  const projectsNeedingDowngrade = installedProjects.filter(p =>
    compareVersions(p.installedVersion!, selectedVersion) === 1
  );

  if (projectsNeedingDowngrade.length === installedProjects.length) {
    return {
      label: selectedProjects.length === 1
        ? 'Downgrade'
        : `Downgrade ${selectedProjects.length} projects`,
      action: 'downgrade',
      variant: 'secondary' // Same styling as uninstall (caution)
    };
  }

  // ... existing logic for update cases ...
}
```

**IPC Execution**: Downgrade button sends the same `installPackageRequest` message as install and update. The only difference is the UI messaging. The underlying CLI command is identical.

**Toast Messages**: Customize toast messages to use "downgraded" terminology:

- Success: "Package downgraded in MyApp.Web"
- Error: "Failed to downgrade package in MyApp.Web"
- Multi-project: "Package downgraded in 3 projects"

### API/Integration Points

- Same as update story - reuses `dotnet add package --version` command
- Same IPC messages, same cache invalidation, same error handling

## Testing Strategy

### Unit Tests

- [ ] Test case 1: Button state is "Downgrade" when installed version > selected version
- [ ] Test case 2: Downgrade indicator ↓ appears when installed version > selected version
- [ ] Test case 3: Button styling is 'secondary' for downgrade (matches uninstall)
- [ ] Test case 4: Progress message says "Downgrading..." for downgrade operations
- [ ] Test case 5: Toast message says "downgraded" not "updated" or "installed"

### Integration Tests

- [ ] Integration scenario 1: Downgrade package from v13.0.3 to v13.0.1, verify .csproj has old version

### Manual Testing

- [ ] Manual test 1: View installed package, select older version, verify "Downgrade" button and ↓ indicator
- [ ] Manual test 2: Click Downgrade, verify progress says "Downgrading..." and toast says "downgraded"
- [ ] Manual test 3: After downgrade, verify project list shows older version without indicator
- [ ] Manual test 4: Verify downgrade button has secondary styling (not primary like Update)

## Dependencies

### Blocked By

- [STORY-001-03-003-update-package](./STORY-001-03-003-update-package.md) - Requires version comparison and button state logic

### Blocks

- None - Completes the version management trio (Install, Update, Downgrade)

### External Dependencies

- None - reuses update infrastructure

## INVEST Check

- [x] **I**ndependent - Can be developed independently after update story
- [x] **N**egotiable - Details can be adjusted (button styling, confirmation prompts)
- [x] **V**aluable - Delivers value to users (enables version rollback)
- [x] **E**stimable - Can be estimated (1 story point - trivial extension of update)
- [x] **S**mall - Can be completed in one iteration (just adds downgrade button state)
- [x] **T**estable - Has clear acceptance criteria (reuses update test patterns)

## Notes

**Why Separate Story from Update?**
While downgrade is technically identical to update (same CLI command), it deserves a separate story because:

1. Different UI treatment (secondary button styling to indicate caution)
2. Different terminology in all user-facing messages
3. Different user intent (rollback vs. upgrade)
4. Potential future enhancement: add confirmation dialog for downgrades

**No Confirmation Dialog (Yet)**
This story implements downgrade without a confirmation prompt. A future enhancement could add an optional warning dialog:

```
Are you sure you want to downgrade Newtonsoft.Json from 13.0.3 to 13.0.1?
Downgrading may introduce compatibility issues or missing features.
[Cancel] [Downgrade]
```

This could be configurable via extension settings: `opm.confirmDowngrade: boolean`.

**Semantic Clarity**
Using distinct terminology (Update vs. Downgrade) helps users understand the operation's direction and potential impact. "Update" implies improvement; "Downgrade" implies caution.

## Changelog

| Date       | Change        | Author       |
| ---------- | ------------- | ------------ |
| 2026-01-19 | Story created | AI Assistant |

---

**Story ID**: STORY-001-03-004-downgrade-package  
**Feature**: [FEAT-001-03-manage-packages](../features/FEAT-001-03-manage-packages.md)
