# Solution Discovery Implementation Plan

**Story**: [STORY-001-02-001a-solution-discovery](../stories/STORY-001-02-001a-solution-discovery.md)  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Created**: 2026-01-03  
**Status**: Ready for Implementation

## High-Level Summary

This implementation plan delivers Tier 1 of the project discovery strategy: **root-level single solution discovery** with a centralized `SolutionContextService` that manages active solution context and coordinates with downstream project parsing.

The implementation follows a **service-oriented architecture** with clear separation between file system discovery, CLI integration, context management, and UI presentation. The solution context service acts as the orchestrator, coordinating between configuration settings, file watchers, CLI parsing, and status bar UI updates.

**Core Capabilities:**
- File system scanning for `.sln` and `.slnx` files at workspace root with configurable depth
- Automatic selection and persistence of single root solutions
- Fallback to workspace-wide project discovery for zero or multi-solution scenarios
- Event-driven architecture for solution context changes with proper disposal patterns
- Status bar integration showing active solution name and project count
- CLI integration via `dotnet sln list` for solution project enumeration

**Architecture Layers:**
1. **Configuration**: Workspace settings schema and validation
2. **Services**: `SolutionContextService` for context management, `SolutionDiscoveryService` for file scanning
3. **CLI Integration**: `DotnetSolutionParser` for `dotnet sln list` command execution
4. **UI**: Status bar item with click handler for future solution selection
5. **Testing**: Unit tests with mocks, integration tests with real CLI, E2E tests in Extension Host

## Implementation Checklist

1. Define configuration schema and types — see [Task 1](#task-1)
2. Implement solution file discovery service — see [Task 2](#task-2)
3. Implement dotnet CLI solution parser — see [Task 3](#task-3)
4. Implement solution context service — see [Task 4](#task-4)
5. Create solution status bar item — see [Task 5](#task-5)
6. Wire services into extension activation — see [Task 6](#task-6)
7. Write unit tests — see [Task 7](#task-7)
8. Write integration tests — see [Task 8](#task-8)
9. Write E2E tests — see [Task 9](#task-9)
10. Update documentation — see [Task 10](#task-10)

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
  /** Active solution file path (absolute) or null for workspace-wide discovery */
  activeSolution: string | null;
  /** File system scan depth for .sln/.slnx files */
  solutionScanDepth: SolutionScanDepth;
  /** Maximum folder depth for .csproj scanning (used in Tier 2 fallback) */
  projectScanDepth: number;
  /** Project count threshold for performance warnings */
  largeWorkspaceThreshold: number;
}

export const DEFAULT_SOLUTION_SETTINGS: SolutionDiscoverySettings = {
  activeSolution: null,
  solutionScanDepth: 'root-only',
  projectScanDepth: 3,
  largeWorkspaceThreshold: 50,
};
```

**package.json Configuration:**
Add to `contributes.configuration`:
```json
{
  "opm.activeSolution": {
    "type": ["string", "null"],
    "default": null,
    "description": "Absolute path to active solution file; null triggers workspace-wide discovery"
  },
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

Create central service to manage active solution context, events, and persistence.

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
   * Event fired when solution context changes.
   */
  onDidChangeContext: vscode.Event<SolutionContext>;
  
  /**
   * Initialize service (discover and activate solution).
   * Called during extension activation.
   */
  initialize(): Promise<void>;
  
  /**
   * Set active solution and persist to settings.
   * @param solutionPath Absolute path or null for workspace-wide
   */
  setActiveSolution(solutionPath: string | null): Promise<void>;
  
  /**
   * Get projects scoped to current context.
   * Delegates to CLI parser for solution mode, or Tier 2 for workspace mode.
   */
  getScopedProjects(): Promise<SolutionProject[]>;
  
  /**
   * Refresh solution context (re-scan and re-parse).
   */
  refresh(): Promise<void>;
}
```

**Initialization Logic:**
1. Read `opm.activeSolution` setting
2. If setting is non-null path:
   - Validate file exists
   - Parse solution using `DotnetSolutionParser`
   - Set context mode to `'solution'`
3. If setting is null:
   - Call `SolutionDiscoveryService.discoverSolutions()`
   - If exactly 1 solution found at workspace root:
     - Auto-select and persist to settings
     - Parse solution
     - Set context mode to `'solution'`
   - If 0 or 2+ solutions found:
     - Set context mode to `'workspace'`
     - Defer to Tier 2 workspace-wide discovery (STORY-001-02-001c)

**File Watchers:**
- Watch solution file changes: `vscode.workspace.createFileSystemWatcher('**/*.{sln,slnx}')`
- On solution file change: Call `refresh()` if path matches active solution
- On solution file delete: If active solution deleted, reset to `null` and reinitialize
- On solution file create: If mode is `'workspace'`, check for single solution auto-selection

**Event Emission:**
- Emit `onDidChangeContext` whenever context changes
- Use `vscode.EventEmitter<SolutionContext>`
- Debounce rapid changes (300ms) to avoid thrash

**Persistence:**
- Use `vscode.workspace.getConfiguration('opm')` to read/write settings
- Always persist absolute paths (not workspace-relative)
- Update setting atomically in `setActiveSolution()`

**Testing:**
- Unit test: Auto-select single root solution on initialize
- Unit test: Fall back to workspace mode with 0 solutions
- Unit test: Fall back to workspace mode with 2+ solutions
- Unit test: File watcher triggers refresh on solution change
- Unit test: Event emission on context change
- Unit test: Setting persistence round-trip
- E2E test: Real workspace with single solution auto-selection
- E2E test: Manual solution selection via `setActiveSolution()`

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

<a id="task-6"></a>
### Task 6: Wire Services into Extension Activation

Integrate all services into `extension.ts` activation lifecycle.

**Files to Modify:**
- `src/extension.ts`

**Implementation Details:**
```typescript
export async function activate(context: vscode.ExtensionContext) {
  const logger = createLogger(context);
  logger.info('Activating OPM extension...');

  // Initialize Solution Context Service
  const solutionDiscovery = new SolutionDiscoveryServiceImpl(logger);
  const dotnetParser = new DotnetSolutionParserImpl(logger);
  const solutionContext = new SolutionContextServiceImpl(
    solutionDiscovery,
    dotnetParser,
    logger
  );
  
  await solutionContext.initialize();
  context.subscriptions.push(solutionContext);

  // Initialize Status Bar
  const statusBar = createSolutionStatusBar(solutionContext);
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Register placeholder command for future story
  const selectSolutionCmd = vscode.commands.registerCommand(
    'opm.selectSolution',
    () => {
      vscode.window.showInformationMessage(
        'Solution selection UI coming in STORY-001-02-001c'
      );
    }
  );
  context.subscriptions.push(selectSolutionCmd);

  logger.info('OPM extension activated successfully');
}
```

**Disposal Order:**
1. Status bar item
2. Solution context service (triggers file watcher cleanup)
3. Logger output channel

**Testing:**
- E2E test: Extension activates without errors
- E2E test: `opm.selectSolution` command registered
- E2E test: Solution context initialized with single root solution
- E2E test: Status bar shows correct solution name

<a id="task-7"></a>
### Task 7: Write Unit Tests

Create comprehensive unit test suite with mocks and test fixtures.

**Files to Create:**
- `src/services/configuration/__tests__/solutionSettings.test.ts`
- `src/services/discovery/__tests__/solutionDiscoveryService.test.ts`
- `src/services/cli/__tests__/dotnetSolutionParser.test.ts`
- `src/services/context/__tests__/solutionContextService.test.ts`
- `src/views/__tests__/solutionStatusBar.test.ts`

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
  - Setting persistence round-trip
  - Event emission on context change
  - File watcher triggers refresh
- **Status Bar**:
  - Update text/icon/tooltip on context change
  - Correct state for each context mode
  - Command registration

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

<a id="task-8"></a>
### Task 8: Write Integration Tests

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

<a id="task-9"></a>
### Task 9: Write E2E Tests

Create end-to-end tests in VS Code Extension Host.

**Files to Create:**
- `test/e2e/solutionDiscovery.e2e.ts`

**Test Scenarios:**
1. **Extension Activation**: Verify extension activates successfully
2. **Command Registration**: Verify `opm.selectSolution` command exists
3. **Auto-Selection**: Single root solution auto-selected and persisted
4. **Status Bar**: Status bar shows correct solution name and project count
5. **Setting Persistence**: `opm.activeSolution` saved to workspace settings
6. **Context Events**: Context change event fires when solution changes

**Test Setup:**
- Use `@vscode/test-electron` for Extension Host
- Create temporary workspace with test fixtures
- Load extension in test Extension Host
- Wait for activation to complete

**Test Pattern (Mocha TDD):**
```typescript
suite('Solution Discovery E2E', () => {
  test('activates extension successfully', async function() {
    this.timeout(5000);
    const ext = vscode.extensions.getExtension('publisher.opm');
    assert.ok(ext, 'Extension not found');
    await ext.activate();
    assert.ok(ext.isActive, 'Extension not active');
  });

  test('auto-selects single root solution', async function() {
    this.timeout(10000);
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const config = vscode.workspace.getConfiguration('opm');
    const activeSolution = config.get<string>('activeSolution');
    
    assert.ok(activeSolution, 'No active solution set');
    assert.ok(activeSolution.endsWith('.sln'), 'Invalid solution path');
  });

  test('status bar shows solution name', async function() {
    this.timeout(5000);
    // Status bar text verification requires custom API
    // For now, verify command exists and executes
    const commands = await vscode.commands.getCommands();
    assert.ok(
      commands.includes('opm.selectSolution'),
      'Select solution command not registered'
    );
  });
});
```

**Test Runner:**
- Use Mocha in Extension Host via `@vscode/test-electron`
- Run via `npm run test:e2e` or F5 "E2E Tests" launch config
- Add delays for async operations (300-500ms after activation)

**Limitations:**
- Cannot test webview DOM (no access from Extension Host)
- Cannot verify status bar text directly (use command verification)
- Test the Extension Host integration, not UI details

<a id="task-10"></a>
### Task 10: Update Documentation

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
| `opm.activeSolution` | `string \| null` | `null` | Absolute path to active solution file |
| `opm.discovery.solutionScanDepth` | `enum` | `"root-only"` | Scan depth for solution files |
| `opm.discovery.projectScanDepth` | `number` | `3` | Max depth for .csproj scanning |
| `opm.discovery.largeWorkspaceThreshold` | `number` | `50` | Project count warning threshold |

**Auto-Selection Behavior:**
- Single root solution: Auto-selected and persisted
- Multiple root solutions: Falls back to workspace-wide discovery
- No solutions: Uses workspace-wide .csproj scanning
```

**Implementation Notes:**
Document key decisions in `solution-project-scoping.md`:
- Why `dotnet sln list` instead of manual parsing
- File watcher debouncing rationale (300ms)
- Performance characteristics (measured timings)
- Future enhancement: Multi-solution selection UI

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Extension Activation                     │
│                        (extension.ts)                        │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ├──► SolutionContextService
                 │    │
                 │    ├──► SolutionDiscoveryService
                 │    │    └──► vscode.workspace.findFiles()
                 │    │
                 │    ├──► DotnetSolutionParser
                 │    │    └──► dotnet sln list (CLI)
                 │    │
                 │    ├──► vscode.workspace.getConfiguration()
                 │    │    └──► opm.activeSolution setting
                 │    │
                 │    └──► FileSystemWatcher
                 │         └──► *.{sln,slnx} changes
                 │
                 └──► SolutionStatusBar
                      ├──► onDidChangeContext event
                      └──► vscode.StatusBarItem
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
| `dotnet sln list` slow on large solutions | High | Cache results, use file watcher for invalidation |
| File watcher thrashing on rapid changes | Medium | Debounce file change events (300ms) |
| Auto-selection unexpected in multi-solution repos | Medium | Clear status bar UI, easy manual override |
| .NET SDK not installed | High | Validate SDK on activation, show error with install link |
| Concurrent solution file modifications | Low | File watcher handles via debouncing |

## Success Criteria

- [ ] Single root solution auto-selected and persisted to workspace settings
- [ ] Status bar shows "$(file-code) MySolution" for active solution
- [ ] Status bar shows "$(files) All Projects (N)" for workspace mode
- [ ] `dotnet sln list` successfully parses both .sln and .slnx formats
- [ ] File watcher refreshes context when solution file changes
- [ ] Unit test coverage >80% for all services
- [ ] Integration tests pass against real .NET CLI
- [ ] E2E tests verify activation and auto-selection in Extension Host
- [ ] Documentation complete with architecture diagrams and settings reference

## Open Questions

1. **Multi-solution UI**: Should we implement a Quick Pick for multi-solution workspaces in this story, or defer to future enhancement?
   - **Decision**: Defer to future story. Fall back to workspace-wide discovery for now.

2. **Performance**: What's the maximum acceptable project count before showing performance warnings?
   - **Decision**: Use configurable threshold (default 50 projects). Measure real-world impact.

3. **Caching TTL**: Should CLI parse results have a time-based TTL in addition to file watcher invalidation?
   - **Decision**: No TTL. Cache indefinitely until file change detected. Simplifies implementation.

4. **Error Recovery**: If `dotnet sln list` fails, should we retry or fall back to workspace mode immediately?
   - **Decision**: Log error, show notification, fall back to workspace mode. No auto-retry.

## Next Steps

After completing this story:
1. Implement STORY-001-02-001b (CLI-Based Project Parsing) to extract project metadata
2. Implement STORY-001-02-001c (Workspace-Wide Discovery) for multi-solution fallback
3. Add multi-solution selection UI as future enhancement (not in current epic scope)

---
**Plan Created**: 2026-01-03  
**Story**: STORY-001-02-001a-solution-discovery  
**Estimated Effort**: 3 Story Points (12-16 hours)
