# Solution Discovery Implementation

**Status**: ✅ Implemented  
**Story**: [STORY-001-02-001a-solution-discovery](../../docs/stories/STORY-001-02-001a-solution-discovery.md)  
**Implementation Plan**: [IMPL-001-02-001a-solution-discovery](../../docs/technical/IMPL-001-02-001a-solution-discovery.md)  
**Date Completed**: 2026-01-03

## Overview

This implementation delivers Tier 1 of the project discovery strategy: **root-level single solution discovery** with centralized solution context management.

### Key Features

- ✅ Automatic discovery of `.sln` and `.slnx` files at workspace root
- ✅ Auto-selection of single solution files with workspace settings persistence
- ✅ Fallback to workspace-wide project discovery for zero or multi-solution scenarios
- ✅ Event-driven architecture for solution context changes
- ✅ Status bar integration showing active solution name and project count
- ✅ CLI integration via `dotnet sln list` for solution project enumeration

## Architecture

### Services

| Service | Location | Purpose |
|---------|----------|---------|
| **SolutionDiscoveryService** | `src/services/discovery/solutionDiscoveryService.ts` | Scans workspace for solution files |
| **DotnetSolutionParser** | `src/services/cli/dotnetSolutionParser.ts` | Parses solutions using `dotnet sln list` |
| **SolutionContextService** | `src/services/context/solutionContextService.ts` | Manages active solution context and events |
| **SolutionStatusBar** | `src/views/solutionStatusBar.ts` | Displays solution context in status bar |

### Configuration

Settings are defined in `package.json` under `contributes.configuration`:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `opm.activeSolution` | `string \| null` | `null` | Absolute path to active solution file |
| `opm.discovery.solutionScanDepth` | `enum` | `"root-only"` | File scan depth: `"root-only"` or `"recursive"` |
| `opm.discovery.projectScanDepth` | `number` | `3` | Max folder depth for .csproj scanning |
| `opm.discovery.largeWorkspaceThreshold` | `number` | `50` | Project count threshold for warnings |

## User Experience

### Single Solution at Root

```
1. Extension activates
2. Discovers MySolution.sln at workspace root
3. Auto-selects MySolution.sln as active context
4. Parses solution file to extract project paths
5. Status bar shows: "$(file-code) MySolution"
6. All operations scoped to solution's projects
```

### Multiple Solutions at Root

```
1. Extension activates
2. Discovers: WebApp.sln, Services.sln, Tools.sln
3. Falls back to workspace-wide project discovery
4. Status bar shows: "$(files) All Projects (N)"
5. User can manually select solution via opm.selectSolution command
```

### No Solution File

```
1. Extension activates
2. No solution files found at workspace root
3. Falls back to workspace-wide .csproj discovery
4. Status bar shows: "$(files) All Projects (N)"
```

## Commands

| Command ID | Title | Description |
|------------|-------|-------------|
| `opm.selectSolution` | OPM: Select Solution | Manually select active solution (UI not yet implemented) |
| `opm.openDocumentation` | OPM: Open Documentation | Opens extension documentation |

## Testing

### Unit Tests

Located in `src/services/**/__tests__/`:
- `solutionSettings.test.ts` - Configuration schema validation
- `solutionDiscoveryService.test.ts` - File scanning logic
- `dotnetSolutionParser.test.ts` - CLI output parsing
- `solutionContextService.test.ts` - Context management

Run with: `bun test src/services/`

### Integration Tests

Located in `test/integration/`:
- `dotnetSolutionParser.integration.test.ts` - Real dotnet CLI execution

Run with: `bun test test/integration/`

**Note**: Integration tests require dotnet CLI installed and available on PATH. Tests are automatically skipped if dotnet is not available.

### E2E Tests

Located in `test/e2e/`:
- `solutionDiscovery.e2e.ts` - Extension Host integration

Run with: `npm run test:e2e`

## Implementation Notes

### Design Decisions

1. **Single Solution Auto-Selection**: When exactly one solution file is found at workspace root, it is automatically selected and persisted to workspace settings. This aligns with Visual Studio and Rider behavior.

2. **Multi-Solution Fallback**: When multiple solutions are found, the extension falls back to workspace-wide discovery instead of prompting the user. This prevents activation blocking and provides immediate functionality.

3. **File Watchers**: Solution file changes trigger automatic context refresh with debouncing (300ms) to avoid thrash during rapid file operations.

4. **Workspace Folder Resolution**: Solution files must be within a workspace folder to be discovered. Files outside workspace folders are logged and skipped.

### Known Limitations

1. **Manual Solution Selection UI**: The `opm.selectSolution` command is registered but shows a placeholder message. The full selection UI (Quick Pick with solution list) will be implemented in a future story.

2. **CLI Dependency**: Solution parsing requires `dotnet sln list` command. If dotnet CLI is not available, solution context initialization will fail gracefully.

3. **Workspace-Wide Discovery Placeholder**: When falling back to workspace-wide mode, the `projects` array is currently empty. Full workspace-wide project discovery is implemented in STORY-001-02-001c.

## Future Enhancements

### Multi-Solution Selection UI

When multiple solutions are detected, provide a Quick Pick dialog:

```typescript
const solution = await vscode.window.showQuickPick(solutions.map(s => ({
  label: s.name,
  description: `${s.projects.length} projects`,
  detail: s.path,
  solution: s
})), {
  placeHolder: 'Select active solution'
});
```

### Solution File Creation Detection

Add file watcher handler to automatically discover newly created solution files:

```typescript
solutionWatcher.onDidCreate(async (uri) => {
  if (context.mode === 'workspace') {
    // Re-check for single solution auto-selection
    await refresh();
  }
});
```

### Performance Optimization

For large workspaces with many solutions:
- Cache solution parse results with LRU eviction
- Implement incremental refresh (only re-parse changed solutions)
- Add user-configurable solution discovery patterns

## Related Documentation

- [Solution and Project Scoping Strategy](../../docs/discovery/solution-project-scoping.md)
- [Story: STORY-001-02-001a-solution-discovery](../../docs/stories/STORY-001-02-001a-solution-discovery.md)
- [Implementation Plan: IMPL-001-02-001a-solution-discovery](../../docs/technical/IMPL-001-02-001a-solution-discovery.md)
- [Feature: FEAT-001-02-install-packages](../../docs/features/FEAT-001-02-install-packages.md)
