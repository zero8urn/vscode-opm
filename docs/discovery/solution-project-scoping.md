# Solution and Project Scoping Strategy

**Status**: Draft  
**Created**: 2025-12-31  
**Last Updated**: 2026-01-04

## Problem Statement

VS Code workspaces can contain arbitrary directory structures, including:

- **Multiple unrelated solutions**: A parent folder containing several independent .NET solutions that share no common dependencies or build context
- **No solution files**: Individual projects or loose collections of .csproj files without a solution wrapper
- **Deep directory hierarchies**: Monorepos or large codebases where solution files may exist several levels deep
- **Mixed technology stacks**: Workspaces containing .NET projects alongside Node.js, Python, or other unrelated codebases

The extension must efficiently discover relevant .NET projects while respecting performance constraints and avoiding unnecessary file system traversal in large workspaces.

## Core Design Principles

| Principle | Rationale |
|-----------|-----------|
| **Performance First** | Avoid deep recursive scans by default; limit file system operations to essential directories |
| **Solution-Scoped by Default** | When solution files exist, use them to scope project discovery rather than scanning the entire workspace |
| **.NET SDK Required** | Extension requires .NET SDK (≥6.0) installed; no fallback parsing since package operations require CLI |
| **Explicit User Intent** | Require user action when solution context is ambiguous (no solution or multiple solutions) |
| **Transparent Behavior** | Surface active scope in package browser UI and warn when action is needed |

## Architectural Approach

### Two-Tier Discovery Strategy

The extension employs a streamlined discovery strategy with explicit user control:

#### Tier 1: Solution File Discovery (Root-Level Only)

| Aspect | Implementation |
|--------|----------------|
| **Scope** | Workspace root folders only (no subdirectory recursion) |
| **Pattern** | `*.{sln,slnx}` at root level of each workspace folder |
| **Performance** | O(1) depth — fast even in massive workspaces |
| **Trigger** | Automatic when package browser opens |

**Note:** Supports both legacy `.sln` (text-based) and modern `.slnx` (XML-based) solution formats introduced in .NET 9.

**Outcomes:**
- **Single solution found**: Auto-select as active context
- **Multiple solutions found**: Require user to select one via `opm.selectSolution` command
- **No solutions found**: Require user to create a solution or select one manually

#### Tier 2: Manual Solution Selection

| Aspect | Implementation |
|--------|----------------|
| **Trigger** | User-invoked command (`opm.selectSolution`) |
| **Mechanism** | File picker dialog or direct path configuration |
| **Use Case** | Solutions located deep in directory tree, multiple solutions requiring explicit selection, or non-standard workspace layouts |
| **Persistence** | Stored in workspace settings for session continuity |

**Note:** This tier provides an escape hatch for users who want explicit control over solution context, including selecting a specific solution when multiple are present at workspace root.

| Aspect | Implementation |
|--------|----------------|
| **Trigger** | User-invoked command (`opm.selectSolution`) or prompted when no solution selected |
| **Mechanism** | Quick Pick with discovered solutions or file picker for browsing |
| **Use Case** | Multiple solutions at root, solutions located deep in directory tree, or workspaces without solutions |
| **Persistence** | Stored in workspace settings for session continuity |

**Note:** This tier provides explicit control when automatic discovery cannot determine the correct solution context.

### Solution Context Service

A centralized service manages the active solution context and coordinates discovery:

| Responsibility | Description |
|----------------|-------------|
| **Context Management** | Maintains reference to active solution (if any) and its scoped projects |
| **Discovery Coordination** | Orchestrates Tier 1 → Tier 2 sequence when needed |
| **State Persistence** | Reads/writes active solution path to workspace settings |
| **Change Notification** | Emits events when solution context changes for UI updates |
| **Async Operation** | Discovery runs asynchronously without blocking package browser |

## Configuration Schema

### Settings

**Note:** These settings control file system discovery patterns. All file parsing uses .NET CLI exclusively.

| Setting Key | Type | Default | Purpose |
|-------------|------|---------|---------||
| `opm.activeSolution` | `string \| null` | `null` | Absolute path to active solution file; `null` requires user selection |
| `opm.discovery.solutionScanDepth` | `enum` | `"root-only"` | File system scan depth for .sln/.slnx files: `"root-only"` or `"recursive"` |

**Configuration Scope:** All settings are workspace-scoped and persist in `.vscode/settings.json`.

### Enumeration Values

**`opm.discovery.solutionScanDepth`:**
- `"root-only"`: Scan workspace root folders only (fast, recommended)
- `"recursive"`: Scan all subdirectories (slow, may impact performance in large repos)

## User Experience Flows

### Flow 1: Workspace with Single Solution at Root

```
1. User opens package browser via opm.openPackageBrowser
2. Discovery runs asynchronously in background
3. Discovers MySolution.sln at workspace root
4. Auto-selects MySolution.sln as active context
5. Parses solution file to extract project paths
6. Package details card shows project selection UI
7. All operations scoped to solution's projects
```

**Performance Characteristics:**
- Solution discovery: <10ms (single file read)
- Project parsing: O(n) where n = projects in solution
- Total discovery: <200ms for typical solutions
- Non-blocking: Search functionality available immediately

### Flow 2: Workspace with Multiple Solutions at Root

```
1. User opens package browser
2. Discovery finds: WebApp.sln, Services.sln, Tools.sln
3. Package details card shows: "⚠️ Multiple Solutions Found - Select One"
4. User clicks "Select Solution" button
5. Quick Pick displays:
   - WebApp.sln (5 projects)
   - Services.sln (8 projects)
   - Tools.sln (2 projects)
   - [Browse for Solution File...]
6. User selects WebApp.sln
7. Context saved to workspace settings
8. Package details card updates with project selection UI
9. Future sessions auto-load WebApp.sln
```

**Performance Characteristics:**
- Solution discovery: <50ms (multiple file reads at root)
- User action required before operations can proceed
- Selection persisted for session continuity

### Flow 3: Workspace with No Solution File

```
1. User opens package browser
2. No solution files found at workspace root
3. Package details card shows: "⚠️ No Solution Selected"
4. User clicks "Select Solution" button
5. Quick Pick displays:
   - [Browse for Solution File...]
   - [Create New Solution...]
6. User browses to nested solution or creates new one
7. Context saved to workspace settings
8. Package details card updates with project selection UI
```

**Performance Characteristics:**
- Discovery completes quickly with no results
- User must take explicit action to enable package operations
- Avoids expensive workspace-wide project scanning

### Flow 4: Manual Solution Selection

```
1. User invokes "OPM: Select Solution" command (or clicks button in package details)
2. Quick Pick shows:
   - Discovered solutions (if any) - e.g., "WebApp.sln (5 projects)"
   - [Browse for Solution File...] option
3. User selects a specific solution or browses for one
4. Context saved to workspace settings
5. Package details card updates to show selected solution
6. Future activations use this selection automatically
```

**Performance Characteristics:**
- File picker: Native OS performance
- No file system scanning required
- Explicit user control

**Note:** This is the mechanism for handling all ambiguous workspace scenarios. Users must explicitly declare their intent.

## .NET CLI Integration

### SDK as Hard Requirement

The extension **requires** the .NET SDK (version ≥6.0) to be installed and available in the system PATH. Since all package operations (`dotnet add package`, `dotnet remove package`, `dotnet restore`) depend on the CLI, there is no fallback strategy when the SDK is unavailable.

**Rationale:** Manual file parsing cannot safely modify project files or perform package operations without risking corruption or breaking MSBuild evaluation. The extension delegates all project mutations to the authoritative `dotnet` CLI.

### Discovery Strategy

The extension uses a two-phase approach: **file system scanning** to locate solution files, then **.NET CLI commands** to parse their contents:

**Phase 1: File System Discovery**

| File Type | Scan Pattern | Exclusions |
|-----------|--------------|------------|
| **Solution Files** | `*.{sln,slnx}` at workspace root(s) | None (root-level only by default) |

**Phase 2: CLI Parsing**

| Data Source | CLI Command | Purpose |
|-------------|-------------|----------|
| **Solution Projects** | `dotnet sln list <solution>` | Enumerate projects in solution (both .sln and .slnx) |
| **Target Framework** | `dotnet msbuild -getProperty:TargetFramework(s)` | Extract TFM for compatibility checks |
| **Installed Packages** | `dotnet list package --format json` | List installed packages with versions |
| **Project References** | `dotnet list reference` | Discover project dependency graph |
| **Artifact Output** | `dotnet msbuild -getProperty:UseArtifactsOutput` | Detect artifact output layout |

**Workflow:**
1. File system scan locates .sln/.slnx files at workspace root
2. User selects solution (automatic if only one found)
3. `dotnet sln list` extracts project paths from solution
4. `dotnet msbuild -getProperty` queries each project for metadata
5. Results cached with file watcher invalidation

### CLI Command Details

#### dotnet sln list

**Command:** `dotnet sln <solution-path> list`

**Output Format:**
```
Project(s)
----------
path/to/Project1.csproj
path/to/Project2.csproj
```

**Advantages:**
- Works identically for `.sln` and `.slnx` formats
- No format-specific parsing logic required
- Handles solution folders and nested structures
- Returns solution-relative paths (requires resolution to absolute)

**Performance:** ~100-200ms (process spawn + solution read)

#### dotnet msbuild -getProperty

**Command:** `dotnet msbuild <project-path> -getProperty:PropertyName -noLogo`

**Output Format:** Single line with property value

**Common Properties:**
- `TargetFramework`: Single TFM (e.g., `net8.0`)
- `TargetFrameworks`: Multi-targeting (e.g., `net6.0;net7.0;net8.0`)
- `OutputType`: `Exe`, `Library`, `WinExe`
- `UseArtifactsOutput`: `true` if artifact output layout enabled

**Advantages:**
- Full MSBuild property evaluation (conditions, imports, etc.)
- Authoritative framework information
- Detects artifact output configuration automatically

**Performance:** ~150-300ms per project (MSBuild evaluation overhead)

#### dotnet list package

**Command:** `dotnet list <project-path> package --format json`

**Output Format:** JSON structure with top-level and transitive packages

**Advantages:**
- Includes resolved versions (not just requested versions)
- Shows transitive dependencies
- Detects version conflicts and outdated packages

**Performance:** ~200-500ms per project (NuGet restore check)

**Note:** May trigger implicit restore if not recently restored

### SDK Detection and Validation

The extension performs SDK validation at activation and blocks operation if requirements are not met:

| Check | Command | Success Criteria | Failure Action |
|-------|---------|------------------|----------------|
| **SDK Installed** | `dotnet --version` | Exit code 0, version output | Show error notification with install instructions |
| **Minimum Version** | Parse version output | SDK ≥ 6.0 | Show error notification to update SDK |
| **CLI Responsive** | `dotnet --version` completes in <5s | Command completes successfully | Show timeout error; suggest PATH configuration |

**Activation Failure Handling:**

If SDK validation fails:
1. Extension activates in "degraded mode" (no commands registered)
2. Error notification: "OPM requires .NET SDK 6.0 or later. [Install SDK] [Learn More]"
3. All package management commands are disabled
4. User can click notification to view troubleshooting guide

**Validation Cache:**
- Successful validation cached for workspace session
- Re-validated on workspace reload or manual trigger
- Validation runs asynchronously to avoid blocking extension host startup

### Performance Characteristics

| Operation | Typical Duration | Timeout | Caching Strategy |
|-----------|------------------|---------|------------------|
| `dotnet --version` (validation) | <100ms | 5s | Once per session |
| `dotnet sln list` | <200ms | 5s | Per solution, invalidate on .sln change |
| `dotnet msbuild -getProperty` | <300ms per project | 5s | Per project, invalidate on .csproj change |
| `dotnet list package` | <500ms per project | 10s | Per project, invalidate on restore/install |
| Workspace-wide solution scan | <50ms | 2s | On package browser open + file system watch |
| Parallel MSBuild queries (5 projects) | ~400ms | 10s | Batch process spawns |

**Optimization Strategy:**
- Cache all CLI results with file system watcher invalidation
- Parallelize independent CLI calls (e.g., multiple `msbuild -getProperty` queries)
- Use `--no-restore` flag where possible to avoid implicit restore overhead
- Debounce rapid file changes to avoid cache thrashing

## Solution File Parsing

### Solution Format Support

| Aspect | Details |
|--------|---------|
| **Format Version** | Visual Studio `.sln` (text-based) and `.slnx` (XML-based, .NET 9+) |
| **Project Types** | C# (.csproj), F# (.fsproj), VB.NET (.vbproj) |
| **Relative Paths** | Solution-relative project paths resolved to absolute |
| **Parsing Strategy** | `dotnet sln list` CLI command exclusively (format-agnostic) |
| **Format Support** | Automatic via .NET SDK; no extension code changes needed for new formats |

### Format Comparison

| Characteristic | .sln (Legacy) | .slnx (Modern) |
|----------------|---------------|----------------|
| **Structure** | Custom text format | XML-based |
| **Default in .NET SDK** | ≤ .NET 9 | ≥ .NET 10 |
| **Human-Readable** | Moderate | High (structured XML) |
| **Editor Support** | Universal | VS Code, VS 2022 17.12+ |
| **Git Merge Friendliness** | Poor | Better (structured format) |
| **File Size** | Larger | More compact |
| **Extension Support** | ✅ Via `dotnet sln list` | ✅ Via `dotnet sln list` |

**Extension Approach:** Uses `dotnet sln list` exclusively, making the extension format-agnostic. No solution file parsing code required; all format handling delegated to .NET SDK.

### Extracted Information

**From `dotnet sln list <solution>`:**
- Project relative paths (both .sln and .slnx formats)
- Automatically resolved to absolute paths using solution directory
- Works identically regardless of solution file format

**From `dotnet msbuild <project> -getProperty:<name>`:**
- Target framework(s): `TargetFramework` or `TargetFrameworks`
- SDK type: `Sdk` attribute value (e.g., Microsoft.NET.Sdk)
- Output type: `OutputType` (Exe, Library, WinExe)
- Artifact output: `UseArtifactsOutput` (true/false)
- Any MSBuild property with full condition evaluation

**From `dotnet list <project> package --format json`:**
- Top-level package dependencies (directly referenced)
- Transitive package dependencies (indirect)
- Requested vs. resolved versions
- Package update availability
- Deprecated packages

**From `dotnet list <project> reference`:**
- Project-to-project references with absolute paths
- Reference conditions (if applicable)

## Performance Budgets

| Operation | Target Duration | Timeout | Method |
|-----------|----------------|---------|--------|
| SDK validation (`dotnet --version`) | <100ms | 5s | CLI |
| Root-level solution scan | <50ms | 2s | File system glob |
| `dotnet sln list <solution>` | <200ms | 5s | CLI |
| `dotnet msbuild -getProperty` (single) | <300ms | 5s | CLI |
| `dotnet msbuild -getProperty` (5 parallel) | <500ms | 10s | CLI batch |
| `dotnet list package --format json` | <500ms | 10s | CLI (may trigger restore) |
| `dotnet list reference` | <200ms | 5s | CLI |
| Workspace solution discovery | <100ms | 2s | File system glob |
| Full solution context load (5 projects) | <1s | 15s | Combined CLI operations |

**Failure Handling:**
- Operations exceeding timeout return partial results
- User notification suggests reducing scope or depth
- Fallback to manual selection always available

## Multi-Root Workspace Support

VS Code supports multi-root workspaces where multiple folders are opened simultaneously. The extension handles this by:

| Scenario | Behavior |
|----------|----------|
| **Each folder has own solution** | Each workspace folder treated independently; user selects active folder context |
| **Shared solution across folders** | Solution path stored as absolute; projects may span multiple workspace folders |
| **Mixed folders (some with solutions)** | Quick Pick shows solutions grouped by workspace folder |

**Note:** `opm.activeSolution` setting is workspace-scoped, not folder-scoped, so one solution context applies to entire multi-root workspace.

## Package Browser UI Integration

The package browser displays solution context information in the package details card:

| Display | Meaning | Action Available |
|---------|---------|------------------|
| Project selection checkboxes | Active solution context with enumerated projects | Install to selected projects |
| "⚠️ No Solution Selected" warning | No solution file found or selected | "Select Solution" button opens `opm.selectSolution` |
| "⚠️ Multiple Solutions Found" warning | Multiple solutions at root; user must choose | "Select Solution" button opens Quick Pick |
| "MySolution.sln (5 projects)" header | Currently active solution with project count | Clicking opens `opm.selectSolution` to change |

**User Actions:**
- Click "Select Solution" button to invoke `opm.selectSolution` command
- Choose from discovered solutions or browse for one
- Selection persists in workspace settings

## Integration with Package Operations

All package operations (search, install, update, uninstall) respect the active solution context:

| Operation | Scoping Behavior |
|-----------|------------------|
| **Project Discovery** | Limited to projects in active solution only |
| **Project Selection UI** | Displays only projects from active solution in checkbox lists |
| **Install/Update/Uninstall** | Targets only projects from active solution |
| **Installed Packages View** | Shows packages from active solution projects only |

**Context Change Handling:**
- Changing active solution invalidates cached project list
- Triggers refresh of installed packages view
- Resets project selection state in webviews

## Edge Cases and Limitations

| Scenario | Behavior |
|----------|----------|
| **.NET SDK not installed** | Extension activates in degraded mode; shows error notification; all commands disabled |
| **.NET SDK version < 6.0** | Shows error notification to update SDK; JSON output features unavailable |
| **CLI command timeout (>5s)** | Operation fails; error logged; user notified; retries with exponential backoff |
| **Solution file references non-existent projects** | `dotnet sln list` skips missing projects; extension logs warning; continues with valid projects |
| **Solution file outside workspace** | Supported via manual selection; `dotnet sln list` resolves paths correctly |
| **Symbolic links** | Follows symlinks; CLI handles path resolution; may cause issues with circular refs |
| **Network drives** | Supported but high latency; CLI timeouts more likely; consider local clone |
| **Solution with >100 projects** | Full support; CLI handles large solutions; parallel queries improve performance |
| **Projects without target framework** | `msbuild -getProperty` returns empty; project skipped with warning |
| **Legacy non-SDK projects** | CLI commands may fail; extension detects and rejects with clear error |
| **Artifact output layout enabled** | Detected via `UseArtifactsOutput` property; handled automatically |
| **Mixed .sln and .slnx in directory** | Both discovered; user selects via Quick Pick; CLI handles either format |
| **Corrupted solution file** | `dotnet sln list` fails; error logged; solution skipped; other solutions continue |
| **Project file has MSBuild errors** | `dotnet msbuild` may fail; error captured; project marked invalid; doesn't block others |
| **Workspace in Docker container** | Works if .NET SDK installed in container; check SDK availability at activation |
| **No solution files anywhere** | Package details shows warning; user must create solution or select manually; no auto-discovery |
| **Multiple solutions at root** | User must explicitly select one; no automatic fallback to workspace scanning |

## Future Enhancements

### Potential Improvements (Out of Scope for Initial Release)

- **File System Watcher**: Auto-detect when solution/project files are added/removed
- **Solution Folder Support**: Group projects by solution folders in UI (`.slnx` provides better structure)
- **Multi-Solution Mode**: Allow selecting multiple solutions for cross-cutting operations
- **Workspace Recommendations**: Suggest solution files based on project clustering analysis
- **Performance Profiling**: Built-in diagnostics for discovery performance bottlenecks
- **Cloud Workspace Support**: Special handling for VS Code remote/cloud workspaces
- **.slnx Migration Tool**: Command to convert existing `.sln` to `.slnx` format using `dotnet sln` migration features
- **Configuration Platform Support**: Respect solution configuration mappings for platform-specific package operations
- **Persistent CLI Cache**: Cache CLI results to disk with invalidation to survive workspace reloads
- **SDK Health Monitoring**: Periodic background validation of SDK responsiveness and version
- **Offline Mode**: Graceful degradation when network unavailable but SDK present (local operations only)
- **Custom SDK Path**: Allow users to specify non-standard .NET SDK location if not in PATH
- **Create Solution Wizard**: Guided workflow to create new solution and add existing projects

## Related Documentation

### Internal Documentation
- [STORY-001-02-001a: Solution Discovery](../stories/STORY-001-02-001a-solution-discovery.md) - Implementation story for solution scanning
- [STORY-001-02-001b: CLI-Based Project Parsing](../stories/STORY-001-02-001b-cli-project-parsing.md) - CLI integration details
- [Code Layout](../technical/code-layout.md) - Source code organization
- [Request-Response Flow](./request-response.md) - Architecture and data flow

### External References

**Requirements:**
- [Install .NET SDK](https://dotnet.microsoft.com/download) - Download page for all platforms
- [.NET SDK System Requirements](https://github.com/dotnet/core/blob/main/release-notes/6.0/supported-os.md) - Supported operating systems

**CLI Documentation:**
- [dotnet sln Command Reference](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-sln) - .NET CLI documentation
- [dotnet list package Command](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-list-package) - Package listing CLI
- [dotnet msbuild Command](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-msbuild) - MSBuild integration

**Format References:**
- [.NET 10 Breaking Change: slnx Default Format](https://learn.microsoft.com/en-us/dotnet/core/compatibility/sdk/10.0/dotnet-new-sln-slnx-default) - Microsoft Docs
- [Introducing slnx Support in .NET CLI](https://devblogs.microsoft.com/dotnet/introducing-slnx-support-dotnet-cli/) - .NET Blog
- [Artifacts Output Layout](https://learn.microsoft.com/en-us/dotnet/core/sdk/artifacts-output) - Centralized build output configuration

---

**Document Status**: Updated — Tier 2 workspace discovery removed; solution selection now required for ambiguous scenarios  
**Last Updated**: 2026-01-04  
**Next Steps**: Implement `opm.selectSolution` command and package details card warnings for no/multiple solution scenarios
