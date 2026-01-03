# Solution Discovery Implementation Plan

**Story**: [STORY-001-02-001a-solution-discovery](../stories/STORY-001-02-001a-solution-discovery.md)  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Created**: 2026-01-03  
**Status**: Ready for Implementation

## High-Level Summary

This implementation plan delivers asynchronous solution discovery integrated into the package browser workflow. The `SolutionContextService` discovers solution files and projects in the background when the package browser opens, making this data available to the package details card.

The implementation follows a **service-oriented architecture** with clear separation between file system discovery, CLI integration, and context management. Solution discovery runs asynchronously to avoid blocking package search functionality.

**Core Capabilities:**
- Asynchronous solution discovery triggered when package browser opens
- File system scanning for `.sln` and `.slnx` files at workspace root with configurable depth
- Automatic selection of single root solutions
- Fallback to workspace-wide project discovery for zero or multi-solution scenarios
- CLI integration via `dotnet sln list` for solution project enumeration
- Data exposure via `SolutionContextService.getContext()` for package details card consumption

**Architecture Layers:**
1. **Configuration**: Workspace settings schema and validation
2. **Services**: `SolutionContextService` for context management, `SolutionDiscoveryService` for file scanning
3. **CLI Integration**: `DotnetSolutionParser` for `dotnet sln list` command execution
4. **Package Browser Integration**: Discovery initiated from `PackageBrowserCommand`
5. **Testing**: Unit tests with mocks, integration tests with real CLI

**Removed Components:**
- Status bar UI (moved to package details card in future story)
- `opm.selectSolution` and `opm.openDocumentation` commands (not needed)
- Extension activation-time discovery (now on-demand via package browser)

## Implementation Checklist

1. Define configuration schema and types — see [Task 1](#task-1)
2. Implement solution file discovery service — see [Task 2](#task-2)
3. Implement dotnet CLI solution parser — see [Task 3](#task-3)
4. Implement solution context service — see [Task 4](#task-4)
5. Integrate discovery into package browser command — see [Task 5](#task-5)
6. Write unit tests — see [Task 6](#task-6)
7. Write integration tests — see [Task 7](#task-7)
8. Update documentation — see [Task 8](#task-8)

## Detailed Tasks

<a id="task-1"></a>
### Task 1: Define Configuration Schema and Types

Create workspace settings schema for solution discovery and active context persistence.

**Files to Create:**
- `src/services/configuration/solutionSettings.ts`

**Implementation Details:**
```typescript
export type SolutionScanDepth = 'root-only' | 'recursive';

export interface SolutionDiscoverySettings {
  /** File system scan depth for .sln/.slnx files */
  solutionScanDepth: SolutionScanDepth;
  /** Maximum folder depth for .csproj scanning (used in Tier 2 fallback) */
  projectScanDepth: number;
  /** Project count threshold for performance warnings */
  largeWorkspaceThreshold: number;
}

export const DEFAULT_SOLUTION_SETTINGS: SolutionDiscoverySettings = {
  solutionScanDepth: 'root-only',
  projectScanDepth: 3,
  largeWorkspaceThreshold: 50,
};
```

**package.json Configuration:**
Add to `contributes.configuration`:
```json
{
  "opm.discovery.solutionScanDepth": {
    "type": "string",
    "enum": ["root-only", "recursive"],
    "default": "root-only",
    "enumDescriptions": [
      "Scan workspace root folders only (fast, recommended)",
      "Scan all subdirectories (slow, may impact performance)"
    ],
    "description": "File system scan depth for solution files"
  },
  "opm.discovery.projectScanDepth": {
    "type": "number",
    "default": 3,
    "minimum": 0,
    "maximum": 10,
    "description": "Maximum folder depth for .csproj scanning when no solution selected"
  },
  "opm.discovery.largeWorkspaceThreshold": {
    "type": "number",
    "default": 50,
    "minimum": 10,
    "description": "Project count threshold for performance warnings"
  }
}
```

**Testing:**
- Unit test: Validate default values and enum constraints
- Unit test: Type guards for `SolutionScanDepth` validation

<a id="task-2"></a>
### Task 2: Implement Solution File Discovery Service

Create service to scan workspace for `.sln` and `.slnx` files with depth control.

**Files to Create:**
- `src/services/discovery/solutionDiscoveryService.ts`

**Implementation Details:**
```typescript
export interface DiscoveredSolution {
  /** Absolute path to solution file */
  path: string;
  /** Solution file name (e.g., "MySolution.sln") */
  name: string;
  /** Workspace folder containing the solution */
  workspaceFolder: vscode.WorkspaceFolder;
  /** File type: sln or slnx */
  format: 'sln' | 'slnx';
}

export interface SolutionDiscoveryService {
  /**
   * Scan workspace for solution files according to configured depth.
   * @returns Array of discovered solutions (may be empty)
   */
  discoverSolutions(): Promise<DiscoveredSolution[]>;
  
  /**
   * Check if a file path is a valid solution file.
   */
  isSolutionFile(path: string): boolean;
}
```

**Core Logic:**
1. Read `opm.discovery.solutionScanDepth` setting
2. Build glob pattern based on depth:
   - `root-only`: `*.{sln,slnx}` (workspace root only)
   - `recursive`: `**/*.{sln,slnx}` (all subdirectories)
3. Use `vscode.workspace.findFiles(pattern, excludePattern)` with exclusions:
   - `**/bin/**`, `**/obj/**`, `**/node_modules/**`, `**/packages/**`, `**/.git/**`, `**/artifacts/**`
4. Map URIs to `DiscoveredSolution` objects with workspace folder resolution
5. Return sorted by workspace folder, then by name

**Error Handling:**
- Catch and log file system errors, return empty array
- Handle missing workspace folders gracefully
- Validate file extensions (case-insensitive)

**Testing:**
- Unit test: Root-only scan returns only root solutions
- Unit test: Recursive scan finds nested solutions
- Unit test: Exclusion patterns filter bin/obj/node_modules
- Unit test: Both .sln and .slnx formats detected
- Integration test: Real file system scan in test fixtures

<a id="task-3"></a>
### Task 3: Implement dotnet CLI Solution Parser

Create CLI integration to parse solution files using `dotnet sln list`.

**Files to Create:**
- `src/services/cli/dotnetSolutionParser.ts`

**Implementation Details:**
```typescript
export interface SolutionProject {
  /** Project file path (absolute, resolved from solution-relative) */
  path: string;
  /** Project file name (e.g., "MyApp.csproj") */
  name: string;
}

export interface SolutionParseResult {
  /** Solution file path */
  solutionPath: string;
  /** Array of projects in solution */
  projects: SolutionProject[];
  /** Format detected (sln or slnx) */
  format: 'sln' | 'slnx';
}

export interface DotnetSolutionParser {
  /**
   * Parse solution file to extract project list using dotnet CLI.
   * @param solutionPath Absolute path to .sln or .slnx file
   * @returns Parsed solution with project paths
   * @throws If dotnet CLI fails or solution is invalid
   */
  parseSolution(solutionPath: string): Promise<SolutionParseResult>;
}
```

**CLI Command:**
```bash
dotnet sln <solution-path> list
```

**Output Parsing:**
```
Project(s)
----------
path/to/Project1.csproj
path/to/Project2.csproj
```

**Implementation Steps:**
1. Spawn `dotnet sln list` with 5s timeout
2. Parse stdout line-by-line:
   - Skip "Project(s)" header
   - Skip "----------" separator
   - Collect all lines ending in `.csproj`, `.fsproj`, or `.vbproj`
3. Resolve solution-relative paths to absolute using `path.resolve(solutionDir, relativePath)`
4. Validate resolved paths exist on file system
5. Extract file names using `path.basename()`
6. Return `SolutionParseResult`

**Error Handling:**
- Exit code non-zero: Throw error with stderr message
- Timeout: Throw error "dotnet sln list timed out after 5s"
- No projects found: Return empty projects array (valid case)
- Invalid project path: Log warning, skip project

**Caching:**
- Cache results keyed by solution path
- Invalidate on solution file change (file watcher)
- TTL: None (cache until file change)

**Testing:**
- Unit test: Mock CLI output parsing logic
- Unit test: Path resolution from solution-relative to absolute
- Integration test: Real `dotnet sln list` against test fixture
- Integration test: Both .sln and .slnx formats
- Integration test: Error handling for invalid solution path

<a id="task-4"></a>
### Task 4: Implement Solution Context Service

Create service to manage solution context and expose data for package details card.

**Files to Create:**
- `src/services/context/solutionContextService.ts`

**Implementation Details:**
```typescript
export interface SolutionContext {
  /** Active solution (null if workspace-wide discovery) */
  solution: DiscoveredSolution | null;
  /** Projects scoped to active solution (or all discovered projects) */
  projects: SolutionProject[];
  /** Discovery mode: 'solution' | 'workspace' | 'none' */
  mode: 'solution' | 'workspace' | 'none';
}

export interface SolutionContextService extends vscode.Disposable {
  /**
   * Get current solution context.
   */
  getContext(): SolutionContext;
  
  /**
   * Discover and initialize solution context.
   * Runs asynchronously when package browser opens.
   */
  discoverAsync(): Promise<void>;
}
```

**Initialization Logic:**
1. When `discoverAsync()` is called:
   - Call `SolutionDiscoveryService.discoverSolutions()`
   - If exactly 1 solution found at workspace root:
     - Parse solution using `DotnetSolutionParser`
     - Set context mode to `'solution'`
   - If 0 or 2+ solutions found:
     - Set context mode to `'workspace'`
     - Set projects to empty array (placeholder for Tier 2)
2. Return immediately, don't block caller

**Removed Features:**
- No `activeSolution` setting persistence
- No file watchers (discovery is on-demand)
- No events (synchronous `getContext()` only)
- No `setActiveSolution()` method
- No `refresh()` method

**Testing:**
- Unit test: Auto-select single root solution on `discoverAsync()`
- Unit test: Fall back to workspace mode with 0 solutions
- Unit test: Fall back to workspace mode with 2+ solutions
- Unit test: `getContext()` returns valid context after discovery
- Unit test: `discoverAsync()` runs without blocking

<a id="task-5"></a>
### Task 5: Create Solution Status Bar Item

Add status bar UI to display active solution context with click handler.

**Files to Create:**
- `src/views/solutionStatusBar.ts`

**Implementation Details:**
```typescript
export interface SolutionStatusBar extends vscode.Disposable {
  /**
   * Update status bar to reflect current solution context.
   */
  update(context: SolutionContext): void;
  
  /**
   * Show status bar item.
   */
  show(): void;
  
  /**
   * Hide status bar item.
   */
  hide(): void;
}
```

**Status Bar States:**

| Context Mode | Icon | Text | Tooltip | Command |
|--------------|------|------|---------|---------|
| `solution` (single) | `$(file-code)` | "MySolution" | "Active Solution: MySolution.sln (5 projects)" | `opm.selectSolution` |
| `workspace` (fallback) | `$(files)` | "All Projects (12)" | "Workspace-wide project discovery (12 projects found)" | `opm.selectSolution` |
| `none` (no projects) | `$(warning)` | "OPM: No Projects" | "No .NET projects found in workspace" | `opm.openDocumentation` |

**Implementation Steps:**
1. Create `vscode.StatusBarItem` with alignment `Left` and priority `100`
2. Register command `opm.selectSolution` (placeholder for future story)
3. Subscribe to `SolutionContextService.onDidChangeContext`
4. Update status bar text, icon, tooltip, and command on context change
5. Show status bar item during extension activation
6. Dispose on deactivation

**Testing:**
- Unit test: Status bar updates on context change event
- Unit test: Correct icon/text for each context mode
- E2E test: Status bar visible after activation with single solution
- E2E test: Clicking status bar executes `opm.selectSolution` command

<a id="task-5"></a>
### Task 5: Integrate Discovery into Package Browser Command

Modify package browser command to trigger async solution discovery.

**Files to Modify:**
- `src/commands/packageBrowserCommand.ts`

**Implementation Details:**
```typescript
export class PackageBrowserCommand {
  private solutionContext?: SolutionContextService;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: ILogger,
    private readonly nugetClient: INuGetApiClient,
  ) {}

  async execute(): Promise<void> {
    // Initialize solution context service if not already done
    if (!this.solutionContext) {
      const discoveryService = createSolutionDiscoveryService(
        vscode.workspace,
        this.logger
      );
      const solutionParser = createDotnetSolutionParser(this.logger);
      this.solutionContext = createSolutionContextService(
        vscode.workspace,
        this.logger,
        discoveryService,
        solutionParser
      );
    }

    // Start async discovery (non-blocking)
    this.solutionContext.discoverAsync().catch(error => {
      this.logger.warn('Solution discovery failed', error);
      // Don't block package browser on discovery failure
    });

    // Open package browser webview immediately
    this.openWebview();
  }

  private openWebview(): void {
    // Existing webview creation logic
    // Webview will call getSolutionContext() when package details card loads
  }

  getSolutionContext(): SolutionContext {
    return this.solutionContext?.getContext() ?? {
      solution: null,
      projects: [],
      mode: 'none'
    };
  }
}
```

**Implementation Steps:**
1. Create solution context service lazily on first package browser open
2. Start async discovery immediately (don't await)
3. Open package browser webview without blocking
4. Expose `getSolutionContext()` method for webview to call
5. Package details card will poll or request context when needed

**Testing:**
- Unit test: Discovery runs asynchronously without blocking webview
- Unit test: `getSolutionContext()` returns valid context
- Unit test: Discovery failure doesn't prevent package browser from opening
- Integration test: Package browser opens immediately even if discovery is slow

<a id="task-6"></a>
### Task 6: Write Unit Tests

Create comprehensive unit test suite with mocks and test fixtures.

**Files to Create:**
- `src/services/configuration/__tests__/solutionSettings.test.ts`
- `src/services/discovery/__tests__/solutionDiscoveryService.test.ts`
- `src/services/cli/__tests__/dotnetSolutionParser.test.ts`
- `src/services/context/__tests__/solutionContextService.test.ts`
- `src/commands/__tests__/packageBrowserCommand.test.ts`

**Test Coverage Requirements:**
- **Configuration**: Default values, enum validation, type guards
- **Discovery Service**:
  - Root-only scan returns only root solutions
  - Recursive scan finds nested solutions
  - Exclusion patterns filter bin/obj/node_modules
  - Both .sln and .slnx formats detected
  - Empty workspace returns empty array
- **CLI Parser**:
  - Parse CLI output to extract project paths
  - Resolve solution-relative to absolute paths
  - Handle empty solution (no projects)
  - Handle CLI errors (exit code, timeout)
  - Cache invalidation on file change
- **Context Service**:
  - Auto-select single root solution
  - Fall back to workspace mode with 0 solutions
  - Fall back to workspace mode with 2+ solutions
  - `getContext()` returns valid context
  - `discoverAsync()` runs without blocking
- **Package Browser Command**:
  - Discovery starts when command executes
  - Webview opens without waiting for discovery
  - `getSolutionContext()` returns valid data
  - Discovery failure doesn't block package browser

**Mocking Strategy:**
- Mock `vscode.workspace.findFiles()` for discovery tests
- Mock `child_process.spawn()` for CLI parser tests
- Mock `vscode.workspace.getConfiguration()` for settings tests
- Use `vscode.EventEmitter` for real event testing
- Create test fixture directories with .sln and .csproj files

**Test Runner:**
- Use Bun test runner: `bun test src/`
- Run via `npm run test:unit`
- Co-locate tests with source files

**Target Coverage:**
- Overall: >80%
- Critical paths (auto-selection, CLI parsing): >95%

<a id="task-7"></a>
### Task 7: Write Integration Tests

Create integration tests against real dotnet CLI and file system.

**Files to Create:**
- `test/integration/solutionDiscovery.integration.test.ts`
- `test/fixtures/solutions/SingleProject/SingleProject.sln`
- `test/fixtures/solutions/SingleProject/MyApp/MyApp.csproj`
- `test/fixtures/solutions/MultiProject/MultiProject.sln`
- `test/fixtures/solutions/MultiProject/WebApp/WebApp.csproj`
- `test/fixtures/solutions/MultiProject/Services/Services.csproj`

**Test Scenarios:**
1. **Real CLI Parsing**: Execute `dotnet sln list` against test fixture
2. **File System Discovery**: Scan test fixture directories for .sln files
3. **Both Formats**: Test against .sln and .slnx fixtures
4. **Error Handling**: Test against invalid/corrupted solution files
5. **Performance**: Measure discovery time for 100+ file workspace

**Test Fixtures:**
Create minimal valid solution/project files:
```xml
<!-- SingleProject.sln -->
Microsoft Visual Studio Solution File, Format Version 12.00
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "MyApp", "MyApp\MyApp.csproj", "{GUID}"
EndProject
```

```xml
<!-- MyApp.csproj -->
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
</Project>
```

**Prerequisites:**
- Require .NET SDK ≥6.0 installed
- Skip tests if SDK not available (check `dotnet --version`)

**Test Runner:**
- Use Bun test runner: `bun test test/integration/`
- Run via `npm run test:integration`
- Separate from unit tests (different pattern)

**Assertions:**
- Verify exact project count and paths
- Validate absolute path resolution
- Check performance (<500ms for small workspace)

<a id="task-8"></a>
### Task 8: Update Documentation

Document the solution discovery architecture and usage.

**Files to Create/Modify:**
- `docs/technical/solution-discovery-architecture.md` (new)
- `docs/discovery/solution-project-scoping.md` (update with implementation notes)
- `README.md` (update with configuration settings)

**Architecture Documentation Contents:**
1. **System Overview**: Component diagram showing service interactions
2. **Discovery Flow**: Sequence diagram for initialization
3. **Configuration Schema**: Complete settings reference
4. **CLI Integration**: `dotnet sln list` command details
5. **Caching Strategy**: Cache keys, invalidation triggers, TTL
6. **Error Handling**: Error codes, user-facing messages, recovery
7. **Testing Strategy**: Unit, integration, E2E test organization

**Configuration Documentation:**
Add to README.md under "Configuration" section:
```markdown
### Solution Discovery

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `opm.discovery.solutionScanDepth` | `enum` | `"root-only"` | Scan depth for solution files |
| `opm.discovery.projectScanDepth` | `number` | `3` | Max depth for .csproj scanning |
| `opm.discovery.largeWorkspaceThreshold` | `number` | `50` | Project count warning threshold |

**Auto-Selection Behavior:**
- Single root solution: Auto-selected when package browser opens
- Multiple root solutions: Falls back to workspace-wide discovery
- No solutions: Uses workspace-wide .csproj scanning
```

**Implementation Notes:**
Document key decisions in `solution-project-scoping.md`:
- Why `dotnet sln list` instead of manual parsing
- Async discovery pattern rationale (non-blocking UX)
- Performance characteristics (measured timings)
- Future enhancement: Multi-solution selection UI

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│           Package Browser Command                            │
│           (opm.openPackageBrowser)                           │
│  - Creates SolutionContextService lazily                     │
│  - Calls discoverAsync() (non-blocking)                      │
│  - Opens webview immediately                                 │
│  - Exposes getSolutionContext() for webview                  │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ├──► SolutionContextService
                 │    │
                 │    ├──► discoverAsync(): Async discovery
                 │    │    │
                 │    │    ├──► SolutionDiscoveryService
                 │    │    │    └──► vscode.workspace.findFiles()
                 │    │    │
                 │    │    └──► DotnetSolutionParser
                 │    │         └──► dotnet sln list (CLI)
                 │    │
                 │    └──► getContext(): Returns SolutionContext
                 │
                 └──► Package Details Card (Webview)
                      └──► Calls getSolutionContext()
                           - Displays solution/project info
                           - Shows install targets and context
```

## Dependencies

### Prerequisites
- .NET SDK 6.0+ installed and available on PATH
- LoggerService from FEAT-001-00-002 for operation logging
- VS Code Extension API 1.85.0+

### Blocking Dependencies
None (foundational story, no upstream dependencies)

### Downstream Consumers
- STORY-001-02-001b (CLI-Based Project Parsing) - consumes `SolutionContext.projects`
- STORY-001-02-001c (Workspace-Wide Discovery) - fallback target for multi-solution case
- STORY-001-02-002 (Project Selection UI) - uses `getScopedProjects()` API

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `dotnet sln list` slow on large solutions | High | Cache results, run async to avoid blocking |
| Discovery delays package browser startup | High | Run discovery asynchronously, don't await |
| Auto-selection unexpected in multi-solution repos | Low | Context available via `getSolutionContext()`, no auto-actions |
| .NET SDK not installed | Medium | Gracefully fail discovery, package browser still works |
| Discovery failure prevents package browser | Critical | Catch all errors, never throw from discoverAsync() |

## Success Criteria

- [ ] Single root solution auto-discovered when package browser opens
- [ ] Discovery runs asynchronously without blocking package browser webview
- [ ] `getSolutionContext()` returns valid SolutionContext data for webview
- [ ] Package details card can display solution and project information
- [ ] `dotnet sln list` successfully parses both .sln and .slnx formats
- [ ] Discovery failure doesn't prevent package browser from opening
- [ ] Unit test coverage >80% for all services
- [ ] Integration tests pass against real .NET CLI
- [ ] Package browser command tests verify async discovery
- [ ] Documentation complete with architecture diagrams and settings reference

## Open Questions

1. **Multi-solution UI**: Should we implement a Quick Pick for multi-solution workspaces in this story, or defer to future enhancement?
   - **Decision**: Defer to future story. Fall back to workspace-wide discovery for now.

2. **Performance**: What's the maximum acceptable project count before showing performance warnings?
   - **Decision**: Use configurable threshold (default 50 projects). Measure real-world impact.

3. **Caching Strategy**: Should CLI parse results be cached, and if so, how should cache be invalidated?
   - **Decision**: Cache indefinitely for current session. No file watchers in simplified design. Keep it simple.

4. **Error Recovery**: If `dotnet sln list` fails, should we retry or fall back to workspace mode immediately?
   - **Decision**: Log error as warning, fall back to workspace mode. No user notification (discovery is best-effort).

## Next Steps

After completing this story:
1. Implement STORY-001-02-001b (CLI-Based Project Parsing) to extract project metadata
2. Implement STORY-001-02-001c (Workspace-Wide Discovery) for multi-solution fallback
3. Add multi-solution selection UI as future enhancement (not in current epic scope)

---
**Plan Created**: 2026-01-03  
**Story**: STORY-001-02-001a-solution-discovery  
**Estimated Effort**: 3 Story Points (12-16 hours)
