# Package Browser Application

This directory contains the complete Package Browser webview application, including search, package details, and project selection UI components.

## Project Selection UI Components

The project selection UI implements [STORY-001-02-002-project-selection-ui](../../../../docs/stories/STORY-001-02-002-project-selection-ui.md).

## Components

### `<project-selector>` 
Main accordion component that orchestrates project selection and installation.

**Properties:**
- `projects: ProjectInfo[]` - List of discovered projects
- `selectedVersion: string` - Version to install
- `packageId: string` - Package identifier

**Events:**
- `project-selection-changed` - Emitted when project selection changes
- `install-package` - Emitted when install button is clicked

**Methods:**
- `updateProgress(progress: InstallProgress)` - Update installation progress
- `setResults(results: InstallResult[])` - Set installation results

**Usage:**
```typescript
import { PROJECT_SELECTOR_TAG } from './components/project-selector.js';

<${PROJECT_SELECTOR_TAG}
  .projects=${projects}
  .selectedVersion=${'13.0.3'}
  .packageId=${'Newtonsoft.Json'}
  @project-selection-changed=${handleSelectionChange}
  @install-package=${handleInstall}
></${PROJECT_SELECTOR_TAG}>
```

### `<project-list-item>`
Individual project row displaying metadata and selection state.

**Properties:**
- `project: ProjectInfo` - Project metadata
- `selected: boolean` - Whether project is selected
- `selectedVersion: string` - Version for upgrade/downgrade indicator

**Events:**
- `project-toggle` - Emitted when checkbox is toggled

### `<install-button>`
Install action button with dynamic label and progress state.

**Properties:**
- `selectedCount: number` - Number of selected projects
- `disabled: boolean` - Whether button is disabled
- `installing: boolean` - Whether installation is in progress

**Events:**
- `install-clicked` - Emitted when button is clicked

## State Management

### `SelectionState`
Manages project selection logic and "Select All" checkbox state.

**Methods:**
- `setProjects(projects)` - Update projects list
- `toggleProject(path)` - Toggle selection for a project
- `selectAll()` - Select all available projects
- `clearSelections()` - Clear all selections
- `getSelectAllState()` - Get current "Select All" state (unchecked/indeterminate/checked)
- `getSelectedPaths()` - Get array of selected project paths
- `getAvailableProjects()` - Get projects without installed version
- `getInstalledProjects()` - Get projects with installed version

## Utilities

### `version-compare.ts`
Semantic version comparison for upgrade/downgrade indicators.

**Functions:**
- `compareVersions(v1, v2)` - Compare two semantic versions (-1/0/1)
- `getVersionIndicator(installed, selected)` - Get version indicator ('↑'/'↓'/'')

## Type Definitions

See [types.ts](types.ts) for complete type definitions:
- `ProjectInfo` - Discovered project metadata
- `InstallProgress` - Real-time installation progress
- `InstallResult` - Single project installation result
- `SelectAllState` - "Select All" checkbox state

## Styling

All components use VS Code CSS custom properties for theme integration:
- `--vscode-foreground` - Primary text color
- `--vscode-descriptionForeground` - Secondary text color
- `--vscode-button-background` - Button background
- `--vscode-badge-background` - Badge background
- `--vscode-widget-border` - Border color
- `--vscode-charts-green` - Success/upgrade color
- `--vscode-charts-orange` - Downgrade color
- `--vscode-errorForeground` - Error color

No custom theme service is needed - VS Code automatically injects theme variables.

## Accessibility

All components include:
- ARIA labels on interactive elements
- Keyboard navigation support (Tab, Space, Enter)
- Semantic HTML (checkbox, label, button)
- Focus indicators (via VS Code CSS variables)

## Testing

Unit tests are co-located with source files in `__tests__/` directories:
- [utils/__tests__/version-compare.test.ts](utils/__tests__/version-compare.test.ts) - Version comparison tests (14 tests)
- [state/__tests__/selection-state.test.ts](state/__tests__/selection-state.test.ts) - Selection state tests (17 tests)
- [components/__tests__/](components/__tests__/) - Component tests (58 tests)

Run tests:
```bash
bun test src/webviews/apps/packageBrowser/
```

## Integration

To integrate with the package browser app:

1. Import the component:
   ```typescript
   import { PROJECT_SELECTOR_TAG } from './components/index.js';
   import './components/project-selector.js'; // Register component
   ```

2. Fetch projects via IPC:
   ```typescript
   const projects = await request<ProjectInfo[]>('getProjects', {
     workspacePath: '/path/to/workspace'
   });
   ```

3. Handle install event:
   ```typescript
   handleInstall = async (e: CustomEvent) => {
     const { packageId, version, projectPaths } = e.detail;
     const results = await request<InstallResult[]>('installPackage', {
       packageId, version, projectPaths
     });
     selector.setResults(results);
   };
   ```

4. Update progress via IPC notifications:
   ```typescript
   onNotification('installProgress', (progress: InstallProgress) => {
     selector.updateProgress(progress);
   });
   ```

## Implementation Status

✅ Base component structure and type definitions  
✅ Version comparison utility  
✅ Selection state management  
✅ Install button component  
✅ Project list item component  
✅ Project selector accordion component  
✅ VS Code theme styling  
✅ Accessibility features  
✅ Unit tests  
⏳ Integration tests for IPC flow (pending)  
⏳ Package browser app integration (pending)

See [IMPL-001-02-002-project-selection-ui.md](../../../../docs/technical/IMPL-001-02-002-project-selection-ui.md) for detailed implementation plan.

## Package Browser Application

The main application component is defined in [packageBrowser.ts](packageBrowser.ts) and includes:
- Package search with pagination
- Package details panel with README, dependencies, and version history
- Project selection UI for package installation
- Prerelease toggle and filtering
- IPC communication with extension host
