# STORY-001-03-002-uninstall-multi

**Feature**: [FEAT-001-03-manage-packages](../features/FEAT-001-03-manage-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Priority**: High  
**Estimate**: 1 Story Points  
**Created**: 2026-01-19  
**Last Updated**: 2026-01-19

## User Story

**As a** developer using the NuGet Package Management extension  
**I want** to uninstall a package from multiple projects simultaneously  
**So that** I can efficiently remove packages from several projects without repeating the operation manually

## Description

This story extends single-project uninstall (STORY-001-03-001) to support batch operations across multiple projects. Users can select 2+ projects with the package installed and click "Uninstall from X projects" to remove the package from all selected projects in a single operation.

The implementation mirrors the multi-project install pattern (STORY-001-02-007): execute `dotnet remove package` sequentially for each selected project, show per-project progress updates, and report consolidated results. Partial failures are handled gracefully, showing which projects succeeded and which failed.

## Acceptance Criteria

### Scenario: Uninstall Package from Multiple Projects

**Given** I am viewing "Newtonsoft.Json" installed in 3 projects  
**When** I select all 3 projects with checkboxes  
**Then** the action button shows "Uninstall from 3 projects"  
**And** clicking the button executes `dotnet remove package` sequentially for each project  
**And** progress notification shows "Uninstalling from MyApp.Web (1 of 3)..."  
**And** on success, toast shows "Package uninstalled from 3 projects"  
**And** project list refreshes showing all 3 projects no longer have the package

### Scenario: Partial Uninstall Failure

**Given** I select 3 projects and click "Uninstall from 3 projects"  
**When** 2 uninstalls succeed but 1 fails (e.g., file locked)  
**Then** progress notification shows per-project results  
**And** warning toast shows "Package uninstalled from 2 of 3 projects. View Logs for details."  
**And** project list refreshes showing 2 projects without package, 1 still installed  
**And** cache invalidation still triggers (for successful projects)

### Scenario: Cancel Multi-Project Uninstall

**Given** I start uninstalling from 5 projects  
**When** I click "Cancel" on progress notification after 2 projects complete  
**Then** remaining operations abort  
**And** toast shows "Uninstall cancelled. 2 of 5 projects completed."  
**And** project list shows 2 projects without package, 3 still installed

### Additional Criteria

- [ ] Button label updates dynamically: "Uninstall from 2 projects", "Uninstall from 3 projects", etc.
- [ ] Uninstalls execute sequentially (not in parallel) to avoid CLI race conditions
- [ ] Progress notification shows current project being processed with cancel button
- [ ] Per-project results tracked: `{ projectPath, success, error? }`
- [ ] Cache invalidation triggers once after all operations complete (if any succeeded)
- [ ] Error toast shows count of failures with "View Logs" action
- [ ] Cancellation is cooperative: current operation completes before stopping
- [ ] Operation logs show full CLI output for each project

## Technical Implementation

### Implementation Plan

Extend `UninstallPackageCommand` to handle arrays of project paths, executing `dotnet remove package` for each project sequentially with progress reporting.

### Key Components

- **File/Module**: `src/commands/uninstallPackageCommand.ts` - Update to handle multiple project paths
- **File/Module**: `src/webviews/apps/packageBrowser/components/project-selector.ts` - Update button label for multi-project selections

### Technical Approach

Reuse the multi-project orchestration pattern from `InstallPackageCommand`:

```typescript
interface UninstallPackageParams {
  packageId: string;
  projectPaths: string[];
}

interface UninstallResult {
  success: boolean;
  results: Array<{
    projectPath: string;
    success: boolean;
    error?: DomainError;
  }>;
}

async execute(params: UninstallPackageParams): Promise<UninstallResult> {
  const results = [];

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: `Uninstalling ${params.packageId}`,
    cancellable: true
  }, async (progress, token) => {
    for (let i = 0; i < params.projectPaths.length; i++) {
      if (token.isCancellationRequested) {
        break;
      }

      const projectPath = params.projectPaths[i];
      const projectName = path.basename(projectPath, '.csproj');

      progress.report({
        message: `${projectName} (${i + 1} of ${params.projectPaths.length})`,
        increment: (100 / params.projectPaths.length)
      });

      const result = await this.packageCliService.removePackage(
        params.packageId,
        projectPath
      );

      results.push({
        projectPath,
        success: result.success,
        error: result.success ? undefined : result.error
      });
    }
  });

  const successCount = results.filter(r => r.success).length;

  if (successCount > 0) {
    this.projectParser.clearAllCaches();
  }

  return {
    success: successCount > 0,
    results
  };
}
```

### API/Integration Points

- Same as single-project uninstall, but executed in a loop with progress reporting
- Reuses `PackageCliService.removePackage()` method for each project

## Testing Strategy

### Unit Tests

- [ ] Test case 1: Command executes `removePackage()` for each project path in array
- [ ] Test case 2: Command tracks per-project results with success/failure
- [ ] Test case 3: Command returns overall success=true when at least one project succeeds
- [ ] Test case 4: Command returns overall success=false when all projects fail
- [ ] Test case 5: Command invalidates cache once after all operations (not per-project)
- [ ] Test case 6: Command skips cache invalidation when all uninstalls fail
- [ ] Test case 7: Command respects cancellation token and stops processing remaining projects
- [ ] Test case 8: Button label shows "Uninstall from 2 projects" when 2 projects selected

### Integration Tests

- [ ] Integration scenario 1: Uninstall from 3 projects, verify all 3 .csproj files have package removed
- [ ] Integration scenario 2: Uninstall from 3 projects with 1 failure, verify 2 .csproj files updated, 1 unchanged

### Manual Testing

- [ ] Manual test 1: Select 3 projects, verify button shows "Uninstall from 3 projects"
- [ ] Manual test 2: Click uninstall, verify progress notification shows "(1 of 3)", "(2 of 3)", "(3 of 3)"
- [ ] Manual test 3: After completion, verify success toast and all projects show as uninstalled
- [ ] Manual test 4: Simulate partial failure, verify warning toast shows "2 of 3 projects"
- [ ] Manual test 5: Cancel mid-operation, verify remaining projects still have package installed

## Dependencies

### Blocked By

- [STORY-001-03-001-uninstall-single](./STORY-001-03-001-uninstall-single.md) - Requires single-project uninstall infrastructure

### Blocks

- None - Completes multi-project uninstall capability

### External Dependencies

- VS Code progress notification API for cancellable operations

## INVEST Check

- [x] **I**ndependent - Can be developed independently after single-project uninstall
- [x] **N**egotiable - Details can be adjusted (sequential vs parallel execution)
- [x] **V**aluable - Delivers value to users (efficient batch operations)
- [x] **E**stimable - Can be estimated (1 story point - simple extension of single-project)
- [x] **S**mall - Can be completed in one iteration (reuses install multi-project pattern)
- [x] **T**estable - Has clear acceptance criteria (unit and integration tests defined)

## Notes

This story is intentionally small (1 point) because it directly mirrors the multi-project install implementation from STORY-001-02-007. The only differences are:

1. Calling `removePackage()` instead of `addPackage()`
2. Different button labels and toast messages
3. Inverting the installation state checks

All the complex orchestration logic (sequential execution, progress reporting, cancellation, partial failure handling) is already proven in the install workflow.

## Changelog

| Date       | Change        | Author       |
| ---------- | ------------- | ------------ |
| 2026-01-19 | Story created | AI Assistant |

---

**Story ID**: STORY-001-03-002-uninstall-multi  
**Feature**: [FEAT-001-03-manage-packages](../features/FEAT-001-03-manage-packages.md)
