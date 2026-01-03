# CLI-Based Project Parsing

**Implementation**: [IMPL-001-02-001b-cli-project-parsing](../technical/IMPL-001-02-001b-cli-project-parsing.md)  
**Story**: [STORY-001-02-001b-cli-project-parsing](../stories/STORY-001-02-001b-cli-project-parsing.md)  
**Status**: Implemented  
**Created**: 2026-01-03

## Overview

The CLI-based project parsing system extracts .NET project metadata using authoritative `dotnet` commands instead of manual XML parsing. This ensures MSBuild property evaluation, SDK defaults, and conditional imports are properly respected.

The implementation provides:
- **Target Framework Parsing**: Extract single or multi-targeting frameworks via `dotnet msbuild -getProperty`
- **Package Reference Enumeration**: List installed packages via `dotnet list package --format json`
- **Metadata Caching**: In-memory cache with 1-minute TTL and file watcher invalidation
- **Batch Parsing**: Parallel project parsing with configurable concurrency
- **Error Handling**: Typed error codes for all failure scenarios

## Architecture

### Components

```
src/services/cli/
├── types/
│   └── projectMetadata.ts       # Type definitions
├── parsers/
│   ├── targetFrameworkParser.ts # TFM extraction
│   └── packageReferenceParser.ts # Package enumeration
├── dotnetCliExecutor.ts          # Low-level CLI execution
└── dotnetProjectParser.ts        # High-level orchestration
```

### Data Flow

```
User Request
    │
    ▼
DotnetProjectParser.parseProject(path)
    │
    ├──▶ Check in-memory cache (1-min TTL)
    │
    ├──▶ TargetFrameworkParser
    │       └──▶ dotnet msbuild -getProperty:TargetFramework;TargetFrameworks
    │
    ├──▶ PackageReferenceParser
    │       └──▶ dotnet list package --format json
    │
    └──▶ Return ProjectMetadata | ProjectParseError
```

## Usage Examples

### Basic Project Parsing

```typescript
import { createDotnetCliExecutor } from './services/cli/dotnetCliExecutor';
import { createTargetFrameworkParser } from './services/cli/parsers/targetFrameworkParser';
import { createPackageReferenceParser } from './services/cli/parsers/packageReferenceParser';
import { createDotnetProjectParser } from './services/cli/dotnetProjectParser';

// Create dependencies
const logger = createLogger(context);
const cliExecutor = createDotnetCliExecutor(logger);
const tfParser = createTargetFrameworkParser(cliExecutor, logger);
const pkgParser = createPackageReferenceParser(cliExecutor, logger);

// Create project parser
const projectParser = createDotnetProjectParser(
  cliExecutor,
  tfParser,
  pkgParser,
  logger
);

// Parse a single project
const result = await projectParser.parseProject('/path/to/MyApp.csproj');

if (result.success) {
  const { metadata } = result;
  console.log(`Project: ${metadata.name}`);
  console.log(`Target Frameworks: ${metadata.targetFrameworks}`);
  console.log(`Packages: ${metadata.packageReferences.length}`);
  console.log(`Output Type: ${metadata.outputType}`);
} else {
  console.error(`Failed: ${result.error.message}`);
}
```

### Batch Project Parsing

```typescript
const projectPaths = [
  '/path/to/Project1.csproj',
  '/path/to/Project2.csproj',
  '/path/to/Project3.csproj',
];

// Parse multiple projects in parallel (batches of 5)
const results = await projectParser.parseProjects(projectPaths);

for (const [path, result] of results) {
  if (result.success) {
    console.log(`✓ ${result.metadata.name}`);
  } else {
    console.error(`✗ ${path}: ${result.error.message}`);
  }
}
```

### File Watching for Cache Invalidation

```typescript
import * as vscode from 'vscode';

// Create file watcher for .csproj files
const watcher = vscode.workspace.createFileSystemWatcher('**/*.csproj');

// Start watching (auto-invalidates cache on changes)
projectParser.startWatching(watcher);

// Clean up when done
context.subscriptions.push(watcher);
context.subscriptions.push({ dispose: () => projectParser.dispose() });
```

### Handling Multi-Targeting Projects

```typescript
import { isMultiTargeting, normalizeTargetFrameworks } from './services/cli/types/projectMetadata';

const result = await projectParser.parseProject('/path/to/Library.csproj');

if (result.success) {
  const { targetFrameworks } = result.metadata;

  if (isMultiTargeting(targetFrameworks)) {
    console.log(`Multi-targeting project: ${targetFrameworks.join(', ')}`);
  } else {
    console.log(`Single-targeting project: ${targetFrameworks}`);
  }

  // Always get array for iteration
  const allFrameworks = normalizeTargetFrameworks(targetFrameworks);
  for (const tfm of allFrameworks) {
    console.log(`  - ${tfm}`);
  }
}
```

### Error Handling

```typescript
import { ProjectParseErrorCode } from './services/cli/types/projectMetadata';

const result = await projectParser.parseProject('/path/to/project.csproj');

if (!result.success) {
  switch (result.error.code) {
    case ProjectParseErrorCode.ProjectNotFound:
      vscode.window.showErrorMessage(`Project file not found: ${result.error.details}`);
      break;

    case ProjectParseErrorCode.DotnetNotFound:
      vscode.window.showErrorMessage(
        'dotnet CLI not found. Please install .NET SDK.',
        'Download'
      ).then(action => {
        if (action === 'Download') {
          vscode.env.openExternal(vscode.Uri.parse('https://dotnet.microsoft.com/download'));
        }
      });
      break;

    case ProjectParseErrorCode.PackagesConfigNotSupported:
      vscode.window.showWarningMessage(
        'This project uses legacy packages.config format. Please migrate to PackageReference.',
        'Learn More'
      ).then(action => {
        if (action === 'Learn More') {
          vscode.env.openExternal(vscode.Uri.parse(
            'https://learn.microsoft.com/en-us/nuget/consume-packages/migrate-packages-config-to-package-reference'
          ));
        }
      });
      break;

    case ProjectParseErrorCode.NoTargetFramework:
      vscode.window.showErrorMessage('Project has no TargetFramework defined');
      break;

    default:
      vscode.window.showErrorMessage(`Parse error: ${result.error.message}`);
  }
}
```

## Type Definitions

### ProjectMetadata

```typescript
interface ProjectMetadata {
  readonly path: string;                          // Absolute path to .csproj
  readonly name: string;                          // Project name (from filename)
  readonly targetFrameworks: TargetFrameworks;    // string | string[]
  readonly packageReferences: readonly PackageReference[];
  readonly outputType?: string;                   // Exe | Library | WinExe
  readonly useArtifactsOutput?: boolean;          // Centralized artifact output
}
```

### PackageReference

```typescript
interface PackageReference {
  readonly id: string;                  // Package ID (e.g., "Newtonsoft.Json")
  readonly requestedVersion: string;    // Version in .csproj
  readonly resolvedVersion: string;     // Actual installed version
  readonly targetFramework?: string;    // For multi-targeting projects
  readonly isTransitive: boolean;       // Direct vs transitive dependency
}
```

### TargetFrameworks

```typescript
type TargetFrameworks = string | string[];

// Utility functions
function isMultiTargeting(frameworks: TargetFrameworks): frameworks is string[];
function normalizeTargetFrameworks(frameworks: TargetFrameworks): string[];
```

## Performance Characteristics

| Operation | Typical Duration | Notes |
|-----------|------------------|-------|
| Single project parse (cached) | <5ms | In-memory cache hit |
| Single project parse (uncached) | 300-800ms | Depends on project complexity |
| Batch parse (5 projects) | 800-1500ms | Parallelized execution |
| Cache invalidation | <1ms | Simple map deletion |
| File watch registration | <10ms | VS Code FileSystemWatcher |

## Testing

### Unit Tests

Located in `src/services/cli/__tests__/` and `src/services/cli/parsers/__tests__/`:
- Mock dotnet CLI responses
- Test all parsing logic paths
- Validate error handling
- Coverage: >90%

Run: `bun test src/services/cli`

### Integration Tests

Located in `test/integration/cliProjectParsing.integration.test.ts`:
- Use real dotnet CLI commands
- Test against fixture projects
- Validate caching behavior
- Require .NET SDK installed

Run: `bun test test/integration/cliProjectParsing.integration.test.ts`

## Design Decisions

### Why CLI over XML Parsing?

**Decision**: Use `dotnet msbuild -getProperty` instead of parsing .csproj XML directly.

**Rationale**:
- MSBuild evaluation handles conditions, imports, and SDK defaults
- Avoid fragile regex/XML parsing for multi-targeting
- Consistent with how `dotnet build` resolves properties
- Supports future MSBuild features without code changes

**Trade-off**: Slower (300ms vs <10ms for XML parse), but more accurate.

### Why In-Memory Cache?

**Decision**: Cache parsed results in memory with 1-minute TTL instead of file system cache.

**Rationale**:
- Simple implementation (no file I/O)
- Fast cache hits (<5ms)
- Auto-invalidation via file watcher
- No cleanup needed (TTL-based eviction)

**Trade-off**: Cache lost on extension reload, but acceptable for typical usage patterns.

### Why Batch Size of 5?

**Decision**: Parse 5 projects concurrently in `parseProjects()`.

**Rationale**:
- Balances parallelism with resource usage
- dotnet CLI is CPU-bound (MSBuild evaluation)
- Testing showed diminishing returns beyond 5 concurrent processes
- Prevents overwhelming system on large solutions

**Measurement**: 5 projects in 800ms vs 1-by-1 in 2500ms (3x speedup).

## Future Enhancements

1. **Persistent Cache**: Save parse results to workspace storage for faster startup
2. **Incremental Parsing**: Only re-parse changed properties instead of full re-evaluation
3. **Progress Reporting**: Emit progress events for long-running batch operations
4. **Telemetry**: Track parse durations and cache hit rates
5. **Cancellation**: Support AbortSignal for canceling long-running parses

## Related Documentation

- [Solution Discovery & Context Service](./solution-discovery.md)
- [Workspace-Wide Project Discovery](./workspace-project-discovery.md)
- [NuGet Package Management Epic](../epics/EPIC-001-nuget-package-management.md)
