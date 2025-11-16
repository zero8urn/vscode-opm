# STORY-001-00-002-logger-service

**Feature**: [FEAT-001-00-foundations](../features/FEAT-001-00-foundations.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Priority**: High  
**Estimate**: 2 Story Points  
**Created**: 2025-11-16  
**Last Updated**: 2025-11-16

## User Story

**As a** VS Code extension developer  
**I want** a centralized LoggerService with INFO/WARN/ERROR/DEBUG levels  
**So that** I can troubleshoot issues and provide detailed operation logs to users

## Description

The LoggerService provides a unified logging interface wrapping VS Code's OutputChannel, with support for log levels, structured messages, and optional file persistence. It enables consistent logging across all extension components and provides users with detailed diagnostic information when operations fail.

The service exposes methods for each log level (info, warn, error, debug) and automatically formats messages with timestamps and context. Debug-level logging can be enabled via extension settings, allowing users to opt into verbose logging for troubleshooting without modifying code.

## Acceptance Criteria

### Scenario: Logger Writes to Output Channel
**Given** the LoggerService is initialized  
**When** I call `logger.info('Package installed successfully')`  
**Then** the message should be written to the OutputChannel  
**And** the message should include a timestamp

### Scenario: Debug Logging Respects Settings
**Given** the debug logging setting is disabled  
**When** I call `logger.debug('Detailed trace information')`  
**Then** the message should NOT appear in the OutputChannel  
**And** when I enable debug logging in settings  
**Then** subsequent debug calls should appear

### Additional Criteria
- [ ] Service creates dedicated OutputChannel named "NuGet Package Management"
- [ ] Methods: `info()`, `warn()`, `error()`, `debug()`, `show()`
- [ ] Setting: `nugetPackageManager.logging.debug` (boolean, default false)
- [ ] Messages include ISO 8601 timestamp
- [ ] `show()` method reveals OutputChannel to user

## Technical Implementation

### Key Components
- **File/Module**: `src/services/loggerService.ts` - LoggerService implementation
- **File/Module**: `package.json` - Extension settings contribution

### Technical Approach
```typescript
export class LoggerService {
  private outputChannel: vscode.OutputChannel;
  
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, error?: Error): void;
  debug(message: string, ...args: any[]): void;
  show(): void;
}
```

### API/Integration Points
- `vscode.window.createOutputChannel('NuGet Package Management')`
- `vscode.workspace.getConfiguration('nugetPackageManager.logging')`

## Testing Strategy

### Unit Tests
- [ ] Test info/warn/error always log regardless of debug setting
- [ ] Test debug only logs when setting is enabled
- [ ] Test message formatting includes timestamp
- [ ] Test show() reveals OutputChannel

## Dependencies

### Blocked By
None

### Blocks
- [STORY-001-02-006-install-command] requires LoggerService for install logging

## INVEST Check

- [x] **I**ndependent - Can be developed independently
- [x] **N**egotiable - Log format can be adjusted
- [x] **V**aluable - Essential for troubleshooting
- [x] **E**stimable - 2 story points
- [x] **S**mall - Can be completed in 1 day
- [x] **T**estable - Clear acceptance criteria

## Notes

Consider using `context.logUri` for file-based persistent logging in addition to OutputChannel.

The service should support structured logging with key-value pairs for machine-readable logs.

## Changelog

| Date | Change | Author |
|---|---|---|
| 2025-11-16 | Story created | AI Assistant |

---
**Story ID**: STORY-001-00-002-logger-service  
**Feature**: [FEAT-001-00-foundations](../features/FEAT-001-00-foundations.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
