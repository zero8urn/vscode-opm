# STORY-001-02-005-cli-output-parser

**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Done  
**Priority**: High  
**Estimate**: 3 Story Points  
**Created**: 2025-11-16  
**Last Updated**: 2026-01-11

## User Story

**As a** developer using the NuGet Package Management extension  
**I want** the extension to parse CLI output from package operations  
**So that** I receive clear, actionable error messages when package installations fail

## Description

**Note**: This story is **already implemented** as part of STORY-001-02-004 (dotnet-add-package). The CLI output parsing functionality is embedded within the `PackageCliService.parsePackageError()` private method and does not require a separate parser service.

The `PackageCliService` (located at `src/services/cli/packageCliService.ts`) includes a comprehensive error parsing implementation that analyzes stderr and stdout from `dotnet add package` and `dotnet remove package` commands. The parser recognizes NuGet-specific error codes (NU1102, NU1403, NU1202, NU1108) and common error patterns to map raw CLI output into structured domain errors with user-friendly messages.

The implementation covers all critical error scenarios including package version not found (NU1102), license acceptance required (NU1403), framework incompatibility (NU1202), circular dependencies (NU1108), and network failures. Each error is mapped to a `PackageOperationErrorCode` enum value with contextual messages that guide users toward resolution. The original NuGet error code is preserved in the error details for advanced troubleshooting, while the primary message provides actionable guidance suitable for VS Code toast notifications.

## Acceptance Criteria

### Scenario: Parse NU1102 Package Version Not Found
**Given** the `dotnet add package` command fails with stderr containing "NU1102: Unable to find package"  
**When** the `parsePackageError()` method is called with this output  
**Then** the error is mapped to `PackageOperationErrorCode.PackageVersionNotFound` with message "Package or version not found in the configured sources"

### Scenario: Parse NU1403 License Acceptance Required
**Given** the CLI output contains "NU1403" or text matching "license acceptance"  
**When** the error parser processes this output  
**Then** the error code is `LicenseAcceptanceRequired` with message "This package requires you to accept a license agreement"

### Scenario: Parse NU1202 Framework Incompatibility
**Given** stderr contains "NU1202" or "not compatible with" text  
**When** the parser analyzes the error  
**Then** the result is `FrameworkIncompatible` with message "Package is not compatible with the project target framework"

### Scenario: Parse Network Errors
**Given** CLI output contains "unable to load the service index" or "timeout" patterns  
**When** the error is parsed  
**Then** the code is `NetworkError` with message "Network error while downloading package. Check your internet connection."

### Scenario: Preserve Original NuGet Error Code
**Given** any NuGet error with a NU#### code  
**When** the error is parsed  
**Then** the `nugetErrorCode` field preserves the original code (e.g., "NU1102") for advanced debugging

### Additional Criteria
- [x] Parser recognizes NU1102 (package version not found) errors
- [x] Parser recognizes NU1403 (license acceptance) errors
- [x] Parser recognizes NU1202 (framework incompatibility) errors
- [x] Parser recognizes NU1108 (circular dependency) errors
- [x] Parser detects network errors via pattern matching
- [x] Parser extracts NuGet error codes (NU#### pattern) from combined stdout/stderr
- [x] Parser returns structured `PackageOperationError` with code, message, details, and nugetErrorCode
- [x] Parser provides user-friendly error messages suitable for VS Code notifications
- [x] Generic CLI errors fallback to `CliError` code with stderr as message

## Technical Implementation

### Implementation Plan
No separate implementation required - functionality is already complete within `PackageCliService`.

### Key Components
- **File/Module**: `src/services/cli/packageCliService.ts` - Contains `parsePackageError()` private method (lines 267-354)
- **Type Definitions**: `src/services/cli/types/packageOperation.ts` - Defines error codes and result types

### Technical Approach
The CLI output parsing is implemented as a private method (`parsePackageError()`) within the `PackageCliServiceImpl` class. This design decision keeps parsing logic co-located with the CLI execution logic, ensuring tight coupling between command execution and error interpretation. The parser uses regex pattern matching and string searching to identify error patterns from both stderr and stdout streams.

The implementation follows a waterfall pattern: checking for specific NuGet error codes first (NU1102, NU1403, etc.), then falling back to pattern matching (e.g., "unable to find package"), and finally defaulting to a generic `CliError` if no known pattern matches. This ensures every CLI failure produces a structured, actionable error.

### API/Integration Points
- **Input**: `stderr: string` and `stdout: string` from `DotnetCliExecutor.execute()` result
- **Output**: `PackageOperationError` object with `code`, `message`, `details`, and optional `nugetErrorCode`
- **Consumed by**: `addPackage()` and `removePackage()` methods when CLI exit code !== 0
- **Used in command handlers**: Error results propagate to installation command handlers for user notification

## Testing Strategy

### Unit Tests
Testing is primarily covered through integration tests due to the nature of CLI output parsing requiring real dotnet CLI interaction.

### Integration Tests
- [x] **Test case 1**: Install non-existent package version triggers `PackageVersionNotFound` error (`test/integration/packageCliService.integration.test.ts`)
- [x] **Test case 2**: Install to non-existent project triggers `ProjectNotFound` error
- [x] **Test case 3**: Successful package installation returns success result with stdout/stderr
- [x] **Test case 4**: Network failures and timeouts produce appropriate error codes

**Location**: `test/integration/packageCliService.integration.test.ts` (lines 1-131)

### Manual Testing
- [x] Manual test 1: Attempt to install `Newtonsoft.Json` version `999.999.999` and verify error message says "Package or version not found"
- [x] Manual test 2: Install package requiring license acceptance and verify error message mentions license agreement
- [x] Manual test 3: Install framework-incompatible package and verify error mentions target framework compatibility

## Dependencies

### Blocked By
- STORY-001-02-004-dotnet-add-package (completed - this story is implemented within it)

### Blocks
- STORY-001-02-006-install-command - Depends on structured error responses from package operations
- STORY-001-02-009-install-toast - Requires parsed error messages for user notifications

### External Dependencies
- dotnet CLI (version 6.0+) - Source of error output and NuGet error codes
- NuGet protocol error codes (NU####) - Standard error codes defined by Microsoft

## INVEST Check

- [x] **I**ndependent - Implemented as part of PackageCliService (no standalone implementation)
- [x] **N**egotiable - Error parsing patterns can be extended as new error types are discovered
- [x] **V**aluable - Delivers clear, actionable error messages to users instead of raw CLI output
- [x] **E**stimable - Complexity was accurately estimated and completed within STORY-001-02-004
- [x] **S**mall - Focused scope of parsing known error patterns from CLI output
- [x] **T**estable - Tested via integration tests with real dotnet CLI execution

## Notes

### Design Decisions

**Why co-located with PackageCliService instead of separate parser?**
1. **Tight Coupling**: Error parsing is inherently coupled to the specific commands being executed (`dotnet add package`, `dotnet remove package`)
2. **Single Responsibility**: The service is responsible for both executing commands and interpreting their results
3. **Simplicity**: Avoids over-engineering with a separate parser abstraction when the parsing logic is straightforward
4. **Maintainability**: Changes to CLI commands and their error patterns are handled in one place

**Error Pattern Matching Strategy**:
- Prioritize NuGet error codes (NU####) when present for precise error identification
- Fall back to text pattern matching for scenarios where error codes are absent
- Combine stderr + stdout for analysis since some CLI versions emit errors to different streams
- Preserve original NuGet error codes in `nugetErrorCode` field for debugging and logging

### Edge Cases Handled
- Multiple error codes in output: First matched code takes precedence
- Empty stderr with non-zero exit code: Falls back to generic `CliError`
- Localized error messages: Pattern matching uses case-insensitive regex and multiple patterns per error type
- Mixed stdout/stderr content: Concatenates both streams before pattern matching

### Future Enhancements
- Add support for additional NuGet error codes as they are encountered in practice
- Consider parsing structured JSON output if dotnet CLI adds JSON error formatting
- Extract package version conflict details from error messages for better user guidance
- Parse warning messages (NU#### warnings) in addition to errors for proactive notifications

## Changelog

| Date | Change | Author |
|---|---|---|
| 2025-11-16 | Story created | AI Assistant |
| 2026-01-11 | Marked as Done - implemented within STORY-001-02-004 | AI Assistant |
| 2026-01-11 | Updated with complete implementation details and clarification | AI Assistant |

---
**Story ID**: STORY-001-02-005-cli-output-parser  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)

## Related Implementation

The CLI output parsing functionality is implemented in:
- **Primary Implementation**: [packageCliService.ts](../../src/services/cli/packageCliService.ts#L267-L354) - `parsePackageError()` method
- **Type Definitions**: [packageOperation.ts](../../src/services/cli/types/packageOperation.ts) - Error codes and result types
- **Integration Tests**: [packageCliService.integration.test.ts](../../test/integration/packageCliService.integration.test.ts) - Real CLI error parsing tests
