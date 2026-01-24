# STORY-001-03-006-dependency-warnings

**Feature**: [FEAT-001-03-manage-packages](../features/FEAT-001-03-manage-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Priority**: Medium  
**Estimate**: 3 Story Points  
**Created**: 2026-01-19  
**Last Updated**: 2026-01-19

## User Story

**As a** developer using the NuGet Package Management extension  
**I want** to be warned before uninstalling packages that other packages depend on  
**So that** I don't accidentally break my project by removing critical dependencies

## Description

This story implements dependency conflict detection when uninstalling packages. When a user attempts to uninstall a package that is referenced by other installed packages, the extension parses CLI error output, detects the dependency conflict, and displays a user-friendly warning with a list of dependent packages.

The implementation focuses on reactive detection (parsing `dotnet remove package` errors) rather than proactive analysis, since the .NET CLI already provides comprehensive dependency validation. This approach is simpler and reuses the CLI's existing dependency graph logic.

## Acceptance Criteria

### Scenario: Detect Dependency Conflict on Uninstall

**Given** "Newtonsoft.Json" is installed in "MyApp.Web"  
**And** "MyApp.WebApi.Client" package depends on "Newtonsoft.Json"  
**When** I attempt to uninstall "Newtonsoft.Json"  
**Then** `dotnet remove package` fails with dependency error  
**And** extension parses CLI error output  
**And** error toast shows "Cannot uninstall Newtonsoft.Json because it is required by: MyApp.WebApi.Client"  
**And** clicking "View Details" shows full dependency tree in OutputChannel

### Scenario: Warning Dialog for Dependency Conflicts (Optional)

**Given** I attempt to uninstall a package with dependents  
**When** dependency conflict is detected  
**Then** (optional) a warning dialog appears:

```
Cannot Uninstall Package

Newtonsoft.Json is required by the following packages:
• MyApp.WebApi.Client (v1.2.3)
• Serilog.Formatting.Json (v2.0.0)

To uninstall this package, you must first remove the packages that depend on it.

[View Logs] [Cancel]
```

### Scenario: Successful Uninstall When No Dependencies

**Given** "Polly" is installed but no other packages depend on it  
**When** I uninstall "Polly"  
**Then** operation succeeds without warnings  
**And** success toast shows "Package uninstalled from MyApp.Web"

### Scenario: Implicit SDK Package Warning

**Given** I attempt to uninstall "Microsoft.NET.Sdk.Web" (implicit SDK package)  
**Then** a prominent warning shows: "This package is implicitly referenced by your project SDK and may cause build failures if removed."  
**And** (optional) confirmation required before proceeding

### Additional Criteria

- [ ] CLI error output is parsed for dependency conflict patterns
- [ ] Error message extracts dependent package names from CLI output
- [ ] Dependent package list is formatted in user-friendly way (bulleted list)
- [ ] Error toast provides "View Logs" action to see full CLI output
- [ ] Dependency errors map to `DependencyConflict` error code in `DomainError`
- [ ] Warnings are shown BEFORE operation executes (if using proactive detection)
- [ ] OR errors are shown AFTER operation fails (if using reactive detection)
- [ ] Implicit SDK packages are detected and flagged separately

## Technical Implementation

### Implementation Plan

Extend `PackageCliService.removePackage()` to parse dependency conflict errors from CLI stderr and map them to structured error results. Add CLI error pattern matching to extract dependent package names.

### Key Components

- **File/Module**: `src/services/cli/packageCliService.ts` - Add dependency error parsing
- **File/Module**: `src/domain/domainProvider.ts` - Add `DependencyConflict` error code
- **File/Module**: `src/commands/uninstallPackageCommand.ts` - Display dependency errors as warnings/dialogs

### Technical Approach

**CLI Error Pattern Matching**:

When `dotnet remove package` encounters a dependency conflict, it outputs errors like:

```
error NU1605: Detected package downgrade: Newtonsoft.Json from 13.0.3 to 13.0.1. Reference the package directly from the project to select a different version.
error: Package 'Newtonsoft.Json' is required by 'MyApp.WebApi.Client' (>= 13.0.0)
```

Parser implementation:

```typescript
interface DependencyConflictInfo {
  packageId: string;
  dependents: Array<{
    packageId: string;
    versionConstraint?: string;
  }>;
}

function parseDependencyError(stderr: string): DependencyConflictInfo | null {
  // Pattern 1: "Package 'X' is required by 'Y'"
  const requiredByPattern = /Package '([^']+)' is required by '([^']+)'(?: \(([^)]+)\))?/g;

  // Pattern 2: "Cannot remove package 'X' because 'Y' depends on it"
  const dependsOnPattern = /Cannot remove package '([^']+)' because '([^']+)' depends on it/g;

  const matches = [...stderr.matchAll(requiredByPattern), ...stderr.matchAll(dependsOnPattern)];

  if (matches.length === 0) return null;

  const packageId = matches[0][1];
  const dependents = matches.map(m => ({
    packageId: m[2],
    versionConstraint: m[3],
  }));

  return { packageId, dependents };
}
```

**Error Result Mapping**:

```typescript
export async function removePackage(packageId: string, projectPath: string): Promise<DomainResult<void>> {
  const result = await executor.execute(`dotnet remove "${projectPath}" package ${packageId}`);

  if (result.exitCode !== 0) {
    // Check for dependency conflict
    const dependencyError = parseDependencyError(result.stderr);

    if (dependencyError) {
      const dependentsList = dependencyError.dependents.map(d => d.packageId).join(', ');

      return {
        success: false,
        error: {
          code: 'DependencyConflict',
          message: `Cannot uninstall ${packageId} because it is required by: ${dependentsList}`,
          details: result.stderr,
          dependents: dependencyError.dependents,
        },
      };
    }

    // Other error
    return {
      success: false,
      error: {
        code: 'CliError',
        message: `Failed to uninstall package: ${result.stderr}`,
        details: result.stderr,
      },
    };
  }

  return { success: true, result: undefined };
}
```

**Domain Error Type Update**:

```typescript
export type DomainError =
  | {
      code: 'DependencyConflict';
      message: string;
      details?: string;
      dependents?: Array<{ packageId: string; versionConstraint?: string }>;
    }
  | { code: 'RateLimit'; message: string; retryAfter?: number }
  | { code: 'Network'; message: string; details?: string };
// ... other error codes
```

**User-Facing Error Display**:

```typescript
// In uninstallPackageCommand.ts
if (!result.success && result.error.code === 'DependencyConflict') {
  const dependents = result.error.dependents || [];
  const dependentsList = dependents.map(d => `• ${d.packageId}`).join('\n');

  const choice = await vscode.window.showWarningMessage(
    `Cannot uninstall ${packageId}\n\nThis package is required by:\n${dependentsList}\n\nTo uninstall, remove dependent packages first.`,
    'View Logs',
    'OK',
  );

  if (choice === 'View Logs') {
    this.logger.show();
  }
}
```

### API/Integration Points

- **CLI Error Patterns**: Parse stderr from `dotnet remove package` for dependency keywords
- **VS Code API**: `vscode.window.showWarningMessage()` for dependency warnings
- **Domain Layer**: Add `DependencyConflict` to `DomainError` union type

## Testing Strategy

### Unit Tests

- [ ] Test case 1: `parseDependencyError()` extracts dependent package names from CLI stderr
- [ ] Test case 2: `parseDependencyError()` returns null when no dependency error present
- [ ] Test case 3: `removePackage()` returns `DependencyConflict` error when CLI reports dependency
- [ ] Test case 4: `removePackage()` includes `dependents` array in error result
- [ ] Test case 5: Uninstall command shows warning message when `DependencyConflict` error received

### Integration Tests

- [ ] Integration scenario 1: Create project with PackageA depending on PackageB, attempt to uninstall PackageB, verify dependency error detected
- [ ] Integration scenario 2: Uninstall package with no dependents, verify no warnings shown

### Manual Testing

- [ ] Manual test 1: Install package with dependencies, attempt to uninstall dependency, verify warning appears
- [ ] Manual test 2: Verify warning message lists all dependent packages
- [ ] Manual test 3: Click "View Logs", verify OutputChannel shows full CLI error with dependency details
- [ ] Manual test 4: Uninstall package with no dependents, verify no warnings appear

## Dependencies

### Blocked By

- [STORY-001-03-001-uninstall-single](./STORY-001-03-001-uninstall-single.md) - Requires uninstall command infrastructure

### Blocks

- None - Enhancement to make uninstall safer

### External Dependencies

- None - relies on CLI error messages

## INVEST Check

- [x] **I**ndependent - Can be developed independently as error handling enhancement
- [x] **N**egotiable - Details can be adjusted (error parsing patterns, warning format)
- [x] **V**aluable - Delivers value to users (prevents accidental breakage)
- [x] **E**stimable - Can be estimated (3 story points - involves CLI error parsing complexity)
- [x] **S**mall - Can be completed in one iteration (focused on error detection and display)
- [x] **T**estable - Has clear acceptance criteria (unit tests for parsing, integration tests for detection)

## Notes

**Reactive vs. Proactive Detection**
This story uses **reactive detection** (parse CLI errors after operation fails) rather than proactive dependency analysis. Rationale:

- Simpler implementation - reuses CLI's existing validation
- More reliable - CLI has complete dependency graph knowledge
- Less maintenance - no need to replicate CLI's dependency resolution logic

Future enhancement could add proactive detection by parsing project files and package metadata before attempting uninstall.

**CLI Error Message Stability**
The implementation relies on parsing CLI error messages, which could change between .NET SDK versions. To mitigate:

- Test against multiple SDK versions (.NET 6, 7, 8)
- Use flexible regex patterns that match common keywords ("required by", "depends on")
- Fall back to generic error message if parsing fails

**Implicit SDK Packages**
Packages like `Microsoft.NET.Sdk.Web` are implicitly referenced by project SDKs and appear in transitive dependency graphs but not in .csproj files. Detecting these requires parsing `dotnet list package --include-transitive` output, which is complex and out of scope for this story. Add as future enhancement.

## Changelog

| Date       | Change                                        | Author       |
| ---------- | --------------------------------------------- | ------------ |
| 2026-01-19 | Story created with CLI error parsing approach | AI Assistant |

---

**Story ID**: STORY-001-03-006-dependency-warnings  
**Feature**: [FEAT-001-03-manage-packages](../features/FEAT-001-03-manage-packages.md)
