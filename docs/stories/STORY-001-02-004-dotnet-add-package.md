# STORY-001-02-004-dotnet-add-package

**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Priority**: High  
**Estimate**: 5 Story Points  
**Created**: 2025-11-16  
**Last Updated**: 2026-01-11

## User Story

**As a** developer using the NuGet Package Management extension  
**I want** execute dotnet add package command  
**So that** I can efficiently manage NuGet packages in my VS Code workspace

## Description

This story implements package management operations (add, remove, list) by building on top of the existing `DotnetCliExecutor` service. The new `PackageCliService` wraps the low-level CLI executor to provide package-specific methods like `addPackage()`, `removePackage()`, and `listPackages()`, handling the construction of correct command arguments, interpretation of package-specific error codes, and parsing of operation results. This service bridges the gap between generic CLI execution and domain-level package management semantics.

The implementation leverages the existing `dotnetCliExecutor` for all process spawning, timeout management, and stream capture, focusing instead on package operation specifics: argument formatting (`dotnet add package <id> --version <ver>`), error code mapping (NU1102 for version not found, NU1403 for license acceptance), and result parsing. The service must handle various scenarios including successful installations, version conflicts, network failures, license prompts, and framework compatibility warnings—all while delegating low-level execution concerns to the proven CLI executor.

This service complements the existing CLI infrastructure (`dotnetProjectParser` for metadata, `dotnetSolutionParser` for discovery) by adding package mutation operations. It follows the same patterns: factory-based construction with injected logger, structured result types with success/error discriminated unions, and operation-specific error codes that command handlers can map to user-friendly messages. The design ensures all package operations flow through a single, testable, and observable service layer.

## Acceptance Criteria

### Scenario: Successful Package Installation
**Given** a valid .NET project at `/workspace/MyApp.csproj` and dotnet CLI is available on PATH  
**When** I execute `addPackage({ projectPath, packageId: 'Newtonsoft.Json', version: '13.0.3' })`  
**Then** the command returns `{ success: true, exitCode: 0, stdout: '...', stderr: '' }` and the package reference is added to the .csproj file

### Scenario: Package Version Not Found
**Given** a valid .NET project and dotnet CLI is available  
**When** I execute `addPackage({ projectPath, packageId: 'Newtonsoft.Json', version: '99.99.99' })`  
**Then** the command returns `{ success: false, exitCode: 1, stderr: '...error NU1102: Unable to find package...' }` with parsed error details

### Scenario: License Acceptance Required
**Given** a package that requires license acceptance (e.g., specific commercial packages)  
**When** I execute `addPackage()` without the license acceptance flag  
**Then** the CLI output contains "This package requires you to accept a license agreement" and the error is properly surfaced

### Scenario: Network Failure During Package Download
**Given** dotnet CLI is available but NuGet.org is unreachable  
**When** I execute `addPackage()` and the network times out  
**Then** the command returns failure with stderr containing network error details and a timeout error code

### Scenario: Dotnet CLI Not Found
**Given** dotnet CLI is not installed or not on system PATH  
**When** I execute `addPackage()`  
**Then** the command throws a structured error with code 'DOTNET_NOT_FOUND' and actionable message for the user

### Scenario: Operation Cancellation
**Given** a long-running package download is in progress  
**When** the user cancels the operation via the CancellationToken  
**Then** the dotnet process is terminated and the command returns `{ success: false, cancelled: true }`

### Additional Criteria
- [ ] Command constructs correct CLI arguments: `dotnet add "<project-path>" package <packageId> --version <version>`
- [ ] Supports optional `--prerelease` flag when version is a prerelease identifier
- [ ] Supports optional `--source <sourceUrl>` parameter for non-default package sources
- [ ] Captures both stdout and stderr streams with proper encoding (UTF-8)
- [ ] Logs full CLI command (sanitized) and execution time to LoggerService at debug level
- [ ] Logs stdout/stderr at debug level, errors at error level
- [ ] Returns exit code 0 as success, any non-zero as failure
- [ ] Handles process spawn errors (ENOENT for missing dotnet) with structured DomainError
- [ ] Respects configurable timeout (default 60 seconds) and returns timeout error if exceeded
- [ ] Processes inherit VS Code's environment variables (PATH, HOME, etc.)
- [ ] Working directory is set to the parent directory of the target project file
- [ ] Handles paths with spaces and special characters via proper quoting

## Technical Implementation

**See detailed implementation plan**: [IMPL-001-02-004-dotnet-add-package](../technical/IMPL-001-02-004-dotnet-add-package.md)

### Key Components
- **File/Module**: `src/services/cli/packageCliService.ts` - Package-specific CLI operations (`addPackage()`, `removePackage()`, `listPackages()`)
- **File/Module**: `src/services/cli/packageCliService.test.ts` - Unit tests with mocked `DotnetCliExecutor`
- **File/Module**: `src/services/cli/dotnetCliExecutor.ts` - Existing low-level CLI executor (reused, not modified)
- **File/Module**: `src/services/cli/types/packageOperation.ts` - Type definitions for package operation requests/results
- **File/Module**: `src/services/loggerService.ts` - Existing logger service (injected dependency)

### Technical Approach

The `PackageCliService` is implemented as a factory-created service (following the existing `createDotnetProjectParser` pattern) that wraps `DotnetCliExecutor` to provide package-specific operations. The factory function `createPackageCliService(cliExecutor, logger)` accepts injected dependencies, enabling full test isolation without requiring real CLI execution.

The `addPackage()` method constructs package-specific CLI arguments (e.g., `['add', projectPath, 'package', packageId, '--version', version]`) and delegates to `cliExecutor.execute({ args })`. The existing executor handles all process spawning, timeout management, and stream capture. The package service focuses on result interpretation: parsing stdout for success confirmations, extracting NuGet error codes (NU1102, NU1403, etc.) from stderr, and mapping exit codes to package-specific error states.

Error handling builds on the existing `DotnetCliExecutor` error foundation. The CLI executor already handles ENOENT (CLI not found), timeouts, and process spawn failures. The package service adds semantic error mapping: exit code 1 with "NU1102" in stderr becomes `PACKAGE_VERSION_NOT_FOUND`, license acceptance prompts become `LICENSE_ACCEPTANCE_REQUIRED`, network timeout patterns become `NETWORK_ERROR`. This layered approach separates low-level execution concerns from package operation semantics.

Cancellation and logging are inherited from `DotnetCliExecutor`—no additional implementation needed. The package service logs operation-level context ("Installing Newtonsoft.Json 13.0.3 to MyApp.csproj") while the CLI executor logs execution details (command, exit code, duration). This separation ensures comprehensive observability without duplication.

### API/Integration Points
- **Service**: `DotnetCliExecutor.execute()` - Low-level CLI execution (existing service, reused)
- **Service**: `DotnetCliExecutor.isDotnetAvailable()` - Pre-flight validation (existing method)
- **Service**: `ILogger` - Injected for operation-level logging (existing interface)
- **Factory**: `createPackageCliService(cliExecutor, logger): PackageCliService` - Service construction pattern
- **Type**: `PackageAddRequest` - Input: `{ projectPath, packageId, version?, source?, prerelease? }`
- **Type**: `PackageOperationResult` - Output: `{ success: boolean, error?: PackageError }`
- **CLI**: `dotnet add package` - Exit codes: 0 (success), 1 (error); Error codes: NU1102 (not found), NU1403 (license)

## Testing Strategy

### Unit Tests
- [ ] Test case 1: `addPackage()` constructs correct CLI arguments array with project path, package ID, and version
- [ ] Test case 2: Mocked spawn returns exit code 0 → `addPackage()` returns `{ success: true }` with stdout
- [ ] Test case 3: Mocked spawn returns exit code 1 with stderr → returns `{ success: false, error: { code: 'CLI_ERROR' } }`
- [ ] Test case 4: Spawn emits 'error' event with code 'ENOENT' → returns `{ success: false, error: { code: 'DOTNET_NOT_FOUND' } }`
- [ ] Test case 5: Process execution exceeds timeout (5s mock) → kills process and returns timeout error
- [ ] Test case 6: CancellationToken is cancelled during execution → kills process and returns `{ cancelled: true }`
- [ ] Test case 7: Prerelease version flag adds `--prerelease` to arguments
- [ ] Test case 8: Custom package source adds `--source <url>` to arguments
- [ ] Test case 9: Logger receives debug log with sanitized CLI command before execution
- [ ] Test case 10: Logger receives error log with full stderr when exit code is non-zero
- [ ] Test case 11: Working directory is set to parent directory of project file
- [ ] Test case 12: Project paths with spaces are properly quoted in CLI arguments

### Integration Tests
- [ ] Integration scenario 1: Execute real `dotnet add package` against test fixture project in `test/fixtures/TestProject/` and verify package reference is added to .csproj
- [ ] Integration scenario 2: Attempt to install non-existent package version → verify stderr contains NU1102 error code
- [ ] Integration scenario 3: Install package with dotnet CLI not on PATH → verify DOTNET_NOT_FOUND error is returned
- [ ] Integration scenario 4: Execute with 1-second timeout on slow network → verify timeout error and process cleanup

### Manual Testing
- [ ] Manual test 1: Open workspace with .NET project, trigger install command via debug console, verify package appears in .csproj and OutputChannel shows execution logs
- [ ] Manual test 2: Uninstall dotnet CLI, trigger install → verify error notification shows "dotnet CLI not found" with actionable message
- [ ] Manual test 3: Install package while monitoring process list → verify dotnet process spawns and terminates cleanly

## Dependencies

### Blocked By
- STORY-001-00-002-logger-service (required for execution logging)
- STORY-001-02-001-project-discovery (provides project paths for installation targets)

### Blocks
- STORY-001-02-005-cli-output-parser (depends on CLI output format from this executor)
- STORY-001-02-006-install-command (orchestrates this executor for install workflow)
- STORY-001-02-007-multi-project-install (uses this executor for batch operations)

### External Dependencies
- .NET SDK 6.0+ must be installed on user's machine
- dotnet CLI must be available on system PATH
- Node.js `child_process` module (built-in, no npm dependency)
- Test fixtures require `test/fixtures/TestProject/TestProject.csproj` for integration tests

## INVEST Check

- [x] **I**ndependent - Can be developed independently (only needs LoggerService interface)
- [x] **N**egotiable - Details can be adjusted (timeout values, error codes, logging verbosity)
- [x] **V**aluable - Delivers value to users (critical infrastructure for all package operations)
- [x] **E**stimable - Can be estimated (5 story points - straightforward CLI wrapper with comprehensive error handling)
- [x] **S**mall - Can be completed in one iteration (focused on single command execution)
- [x] **T**estable - Has clear acceptance criteria (mocked unit tests + real CLI integration tests)

## Notes

### Design Decisions
- **Why `spawn()` over `exec()`?** Spawn provides better control over stdio streams, supports real-time output capture for progress indicators, and avoids shell injection vulnerabilities
- **Timeout default (60s)**: Accounts for slow network connections and large package downloads; user-configurable via settings in future iteration
- **No shell=true**: Avoids shell interpretation of arguments, preventing injection attacks and ensuring consistent cross-platform behavior

### Edge Cases to Handle
- **License acceptance prompts**: Some packages require interactive license acceptance; detect from output and surface to user via UI prompt before retrying with `--accept-license` flag
- **Restore vs. Add**: `dotnet add package` implicitly runs restore; no need for separate restore command in success path
- **Parallel installations**: Executor is stateless but dotnet CLI may lock project file; caller (multi-project install handler) must serialize operations to avoid conflicts. Note: This is a general dotnet CLI limitation affecting all tools (VS 2022, Rider, CLI) when operations run concurrently from different sources.
- **Path normalization**: Windows uses backslashes, Unix uses forward slashes; `path.normalize()` ensures consistent handling across platforms

### Security Considerations
- Never pass unsanitized user input directly to CLI (e.g., package IDs with shell metacharacters)
- Validate package source URLs to prevent command injection via `--source` parameter
- Log sanitized commands only (redact authentication tokens if present in source URLs)

### Future Enhancements
- Add retry logic for transient network errors (exponential backoff)
- Support for `--no-restore` flag to skip implicit restore (performance optimization)
- Progress events for large package downloads (parse dotnet CLI progress output)
- Support for `--interactive` flag when authentication is required

## Changelog

| Date | Change | Author |
|---|---|---|
| 2025-11-16 | Story created | AI Assistant |
| 2026-01-11 | Filled out product details, acceptance criteria, technical implementation, and testing strategy | GitHub Copilot |

---
**Story ID**: STORY-001-02-004-dotnet-add-package  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
