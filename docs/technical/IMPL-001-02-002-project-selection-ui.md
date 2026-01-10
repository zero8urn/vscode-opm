# IMPL-001-02-002-project-selection-ui

**Story**: [STORY-001-02-002-project-selection-ui](../stories/STORY-001-02-002-project-selection-ui.md)  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Not Started  
**Created**: 2026-01-05  
**Last Updated**: 2026-01-05

## Summary

This implementation plan details the construction of an inline project selection accordion component for the package browser webview. The component follows Visual Studio's progressive disclosure pattern, allowing users to select target projects for package installation without leaving the package details view.

The implementation consists of three main Lit web components (`<project-selector>`, `<project-list-item>`, and `<install-button>`), a reactive state manager for selection tracking, and an IPC integration layer for project discovery and installation orchestration. The design prioritizes accessibility, real-time feedback, and graceful handling of mixed installation states (packages already installed in some projects).

Key technical decisions include using Lit's reactive properties for state management, CSS custom properties for VS Code theme integration, and a request-response IPC pattern for all host communication. The accordion section auto-expands when packages are already installed, providing immediate visibility into current installation status.

---

## Implementation Checklist

Complete tasks in order. Each task references detailed context sections below.

- [ ] **1. Create base Lit components structure** → See [§1 Component Structure](#1-component-structure)
- [ ] **2. Implement project-selector accordion component** → See [§2 Project Selector Component](#2-project-selector-component)
- [ ] **3. Implement project-list-item row component** → See [§3 Project List Item Component](#3-project-list-item-component)
- [ ] **4. Implement install-button component** → See [§4 Install Button Component](#4-install-button-component)
- [ ] **5. Add selection state management** → See [§5 Selection State Management](#5-selection-state-management)
- [ ] **6. Integrate IPC request handlers** → See [§6 IPC Integration](#6-ipc-integration)
- [ ] **7. Add progress tracking and notifications** → See [§7 Progress Tracking](#7-progress-tracking)
- [ ] **8. Implement version comparison logic** → See [§8 Version Comparison](#8-version-comparison)
- [ ] **9. Style components with VS Code theme variables** → See [§9 Styling and Theme Integration](#9-styling-and-theme-integration)
- [ ] **10. Add accessibility features (ARIA, keyboard nav)** → See [§10 Accessibility](#10-accessibility)
- [ ] **11. Write unit tests for components and state** → See [§11 Unit Tests](#11-unit-tests)
- [ ] **12. Write integration tests for IPC flow** → See [§12 Integration Tests](#12-integration-tests)
- [ ] **13. Update package-browser-app to include project-selector** → See [§13 Parent Integration](#13-parent-integration)

---

## Detailed Implementation Sections

### §1 Component Structure

**Objective**: Establish the file structure and base component exports.

**File Organization**:
```
src/webviews/apps/package-browser/
├── components/
│   ├── project-selector.ts          # Accordion container component
│   ├── project-list-item.ts         # Individual project row
│   ├── install-button.ts            # Install action button
│   └── index.ts                     # Re-export all components
├── state/
│   ├── selection-state.ts           # Selection tracking logic
│   └── types.ts                     # Type definitions
└── utils/
    └── version-compare.ts           # Semantic version comparison
```

**Tag Name Conventions**:
- Export tag constants co-located with components (e.g., `export const PROJECT_SELECTOR_TAG = 'project-selector' as const;`)
- Use `@customElement(PROJECT_SELECTOR_TAG)` decorator
- Import tag constants in parent components to document dependencies (DO NOT use in html templates)
- **CRITICAL**: In templates, always use literal strings: `html`<project-selector></project-selector>`` (NOT `${PROJECT_SELECTOR_TAG}`)
- Lit does NOT support tag name interpolation - using `<${TAG}>` will fail silently

**Type Definitions** (`state/types.ts`):
```typescript
export interface ProjectInfo {
  name: string;
  path: string;
  relativePath: string;
  frameworks: string[];
  installedVersion?: string;
}

export interface InstallProgress {
  currentProject: string;
  completed: number;
  total: number;
  status: 'installing' | 'complete' | 'error';
  error?: string;
}

export interface InstallResult {
  projectPath: string;
  success: boolean;
  error?: { code: string; message: string };
}
```

---

### §2 Project Selector Component

**File**: `src/webviews/apps/package-browser/components/project-selector.ts`

**Responsibilities**:
- Render accordion header with install status badge ("✓ Installed (2)")
- Toggle expanded/collapsed state on header click
- Display project list when expanded
- Coordinate "Select All" checkbox state (unchecked/indeterminate/checked)
- Emit `project-selection-changed` custom events to parent

**Component Interface**:
```typescript
@customElement(PROJECT_SELECTOR_TAG)
export class ProjectSelector extends LitElement {
  @property({ type: Array }) projects: ProjectInfo[] = [];
  @property({ type: String }) selectedVersion?: string;
  @property({ type: Object }) installProgress: InstallProgress | null = null;
  @property({ type: Boolean }) expanded: boolean = false;
  
  @state() private selectedProjects: Set<string> = new Set();

  // Computed properties
  private get installedCount(): number;
  private get availableProjects(): ProjectInfo[];
  private get selectAllState(): 'unchecked' | 'indeterminate' | 'checked';
  private get shouldAutoExpand(): boolean; // Auto-expand if any installed

  private handleHeaderClick(): void;
  private handleSelectAll(): void;
  private handleProjectToggle(projectPath: string): void;
  private handleInstallClick(): void;
}
```

**Template Structure** (Lit `html` template):
```typescript
render() {
  return html`
    <div class="accordion ${this.expanded ? 'expanded' : 'collapsed'}">
      <div class="accordion-header" @click=${this.handleHeaderClick}>
        <span class="accordion-icon">${this.expanded ? '▼' : '▶'}</span>
        <span class="accordion-title">Install to Projects</span>
        ${this.installedCount > 0 ? html`
          <span class="installed-badge">✓ Installed (${this.installedCount})</span>
        ` : ''}
      </div>
      ${this.expanded ? html`
        <div class="accordion-content">
          ${this.renderSelectAll()}
          ${this.renderProjectList()}
          ${this.renderInstallButton()}
          ${this.renderProgress()}
        </div>
      ` : ''}
    </div>
  `;
}
```

**Auto-Expand Logic**:
```typescript
connectedCallback() {
  super.connectedCallback();
  // Auto-expand if package is installed in at least one project
  this.expanded = this.shouldAutoExpand;
}

private get shouldAutoExpand(): boolean {
  return this.projects.some(p => p.installedVersion !== undefined);
}
```

**Event Emission**:
```typescript
private handleProjectToggle(projectPath: string) {
  if (this.selectedProjects.has(projectPath)) {
    this.selectedProjects.delete(projectPath);
  } else {
    this.selectedProjects.add(projectPath);
  }
  this.requestUpdate();
  
  this.dispatchEvent(new CustomEvent('project-selection-changed', {
    detail: { selectedProjects: Array.from(this.selectedProjects) },
    bubbles: true,
    composed: true
  }));
}
```

---

### §3 Project List Item Component

**File**: `src/webviews/apps/package-browser/components/project-list-item.ts`

**Responsibilities**:
- Render individual project row with checkbox, name, frameworks, path, and status
- Show installed version badge with "v" prefix (e.g., "v13.0.3")
- Display upgrade/downgrade indicators (↑/↓) when selected version differs from installed
- Disable checkbox for already-installed projects
- Truncate long paths with ellipsis in middle (e.g., `.../very/deep/.../MyProject.csproj`)

**Component Interface**:
```typescript
@customElement(PROJECT_LIST_ITEM_TAG)
export class ProjectListItem extends LitElement {
  @property({ type: Object }) project!: ProjectInfo;
  @property({ type: String }) selectedVersion?: string;
  @property({ type: Boolean }) checked: boolean = false;
  @property({ type: Boolean }) disabled: boolean = false;

  private get isInstalled(): boolean;
  private get versionIndicator(): '↑' | '↓' | '';
  private get truncatedPath(): string;

  private handleCheckboxChange(e: Event): void;
}
```

**Template Structure**:
```typescript
render() {
  const isInstalled = this.project.installedVersion !== undefined;
  
  return html`
    <div class="project-row ${isInstalled ? 'installed' : 'available'}">
      ${isInstalled ? html`
        <span class="installed-icon">✓</span>
      ` : html`
        <input
          type="checkbox"
          .checked=${this.checked}
          .disabled=${this.disabled}
          @change=${this.handleCheckboxChange}
        />
      `}
      <div class="project-info">
        <div class="project-name">${this.project.name}</div>
        <div class="project-meta">
          <span class="frameworks">${this.project.frameworks.join(', ')}</span>
          ${isInstalled ? html`
            <span class="installed-version">
              v${this.project.installedVersion}
              ${this.versionIndicator}
            </span>
          ` : ''}
        </div>
        <div class="project-path" title=${this.project.relativePath}>
          ${this.truncatedPath}
        </div>
      </div>
    </div>
  `;
}
```

**Path Truncation Logic**:
```typescript
private get truncatedPath(): string {
  const path = this.project.relativePath;
  const maxLength = 60;
  
  if (path.length <= maxLength) {
    return path;
  }
  
  // Truncate in middle to preserve directory structure
  const start = path.substring(0, 20);
  const end = path.substring(path.length - 35);
  return `${start}...${end}`;
}
```

**Version Indicator Logic**:
```typescript
private get versionIndicator(): '↑' | '↓' | '' {
  if (!this.project.installedVersion || !this.selectedVersion) {
    return '';
  }
  
  const comparison = compareVersions(
    this.selectedVersion,
    this.project.installedVersion
  );
  
  if (comparison > 0) return '↑'; // Upgrade available
  if (comparison < 0) return '↓'; // Downgrade
  return ''; // Same version
}
```

---

### §4 Install Button Component

**File**: `src/webviews/apps/package-browser/components/install-button.ts`

**Responsibilities**:
- Display dynamic label based on selection count ("Install", "Install to 2 projects")
- Disable when no projects selected or installation in progress
- Show "Installing..." state with spinner during installation
- Emit `install-clicked` custom event to parent

**Component Interface**:
```typescript
@customElement(INSTALL_BUTTON_TAG)
export class InstallButton extends LitElement {
  @property({ type: Number }) selectedCount: number = 0;
  @property({ type: Boolean }) installing: boolean = false;
  @property({ type: Boolean }) disabled: boolean = false;

  private get buttonLabel(): string;
  private get isDisabled(): boolean;

  private handleClick(): void;
}
```

**Template Structure**:
```typescript
render() {
  return html`
    <button
      class="install-button"
      .disabled=${this.isDisabled}
      @click=${this.handleClick}
    >
      ${this.installing ? html`
        <span class="spinner"></span>
        <span>Installing...</span>
      ` : html`
        <span>${this.buttonLabel}</span>
      `}
    </button>
  `;
}
```

**Label Logic**:
```typescript
private get buttonLabel(): string {
  if (this.selectedCount === 0) {
    return 'Install';
  }
  if (this.selectedCount === 1) {
    return 'Install to 1 project';
  }
  return `Install to ${this.selectedCount} projects`;
}

private get isDisabled(): boolean {
  return this.disabled || this.installing || this.selectedCount === 0;
}
```

---

### §5 Selection State Management

**File**: `src/webviews/apps/package-browser/state/selection-state.ts`

**Responsibilities**:
- Track selected project paths in a Set for O(1) lookup
- Compute "Select All" checkbox state (unchecked/indeterminate/checked)
- Filter available vs. installed projects
- Provide helper methods for selection operations

**Implementation**:
```typescript
export class SelectionState {
  private selectedProjects: Set<string> = new Set();
  private availableProjects: ProjectInfo[] = [];

  constructor(private projects: ProjectInfo[]) {
    this.updateAvailableProjects();
  }

  private updateAvailableProjects(): void {
    this.availableProjects = this.projects.filter(
      p => p.installedVersion === undefined
    );
  }

  isSelected(projectPath: string): boolean {
    return this.selectedProjects.has(projectPath);
  }

  toggle(projectPath: string): void {
    if (this.selectedProjects.has(projectPath)) {
      this.selectedProjects.delete(projectPath);
    } else {
      this.selectedProjects.add(projectPath);
    }
  }

  selectAll(): void {
    this.availableProjects.forEach(p => {
      this.selectedProjects.add(p.path);
    });
  }

  deselectAll(): void {
    this.selectedProjects.clear();
  }

  getSelectAllState(): 'unchecked' | 'indeterminate' | 'checked' {
    const selectedCount = this.selectedProjects.size;
    const availableCount = this.availableProjects.length;

    if (selectedCount === 0) return 'unchecked';
    if (selectedCount === availableCount) return 'checked';
    return 'indeterminate';
  }

  getSelectedPaths(): string[] {
    return Array.from(this.selectedProjects);
  }

  getSelectedCount(): number {
    return this.selectedProjects.size;
  }

  reset(projects: ProjectInfo[]): void {
    this.projects = projects;
    this.selectedProjects.clear();
    this.updateAvailableProjects();
  }
}
```

**Usage in ProjectSelector**:
```typescript
@customElement(PROJECT_SELECTOR_TAG)
export class ProjectSelector extends LitElement {
  @property({ type: Array }) projects: ProjectInfo[] = [];
  
  @state() private selectionState: SelectionState = new SelectionState([]);

  updated(changedProperties: PropertyValues) {
    if (changedProperties.has('projects')) {
      this.selectionState.reset(this.projects);
      this.requestUpdate();
    }
  }

  private handleSelectAll(): void {
    const state = this.selectionState.getSelectAllState();
    if (state === 'checked') {
      this.selectionState.deselectAll();
    } else {
      this.selectionState.selectAll();
    }
    this.emitSelectionChanged();
  }
}
```

---

### §6 IPC Integration

**Objective**: Integrate with package browser IPC layer for project discovery and installation.

**IPC Request Interface** (from request-response.md):
```typescript
// Fetch projects for current workspace
const projects = await request<ProjectInfo[]>('getProjects', {
  workspacePath: '/path/to/workspace'
});

// Install package to selected projects
const results = await request<InstallResult[]>('installPackage', {
  packageId: 'Newtonsoft.Json',
  version: '13.0.3',
  projectPaths: ['/path/to/project1.csproj', '/path/to/project2.csproj']
});
```

**IPC Notification Interface**:
```typescript
// Listen for installation progress updates
onNotification('installProgress', (progress: InstallProgress) => {
  // Update UI with current project and progress count
});

// Listen for installation completion
onNotification('installComplete', (results: InstallResult[]) => {
  // Display success/error states per project
});
```

**Integration in ProjectSelector**:
```typescript
@customElement(PROJECT_SELECTOR_TAG)
export class ProjectSelector extends LitElement {
  async connectedCallback() {
    super.connectedCallback();
    await this.fetchProjects();
    this.setupNotificationHandlers();
  }

  private async fetchProjects(): Promise<void> {
    try {
      const projects = await request<ProjectInfo[]>('getProjects', {
        workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      });
      this.projects = projects;
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      this.projects = [];
    }
  }

  private setupNotificationHandlers(): void {
    onNotification('installProgress', (progress: InstallProgress) => {
      this.installProgress = progress;
    });

    onNotification('installComplete', (results: InstallResult[]) => {
      this.handleInstallComplete(results);
    });
  }

  private async handleInstallClick(): Promise<void> {
    const selectedPaths = this.selectionState.getSelectedPaths();
    if (selectedPaths.length === 0) return;

    try {
      this.installProgress = {
        currentProject: '',
        completed: 0,
        total: selectedPaths.length,
        status: 'installing'
      };

      await request('installPackage', {
        packageId: this.packageId,
        version: this.selectedVersion,
        projectPaths: selectedPaths
      });
    } catch (error) {
      console.error('Installation failed:', error);
      this.installProgress = {
        ...this.installProgress!,
        status: 'error',
        error: error.message
      };
    }
  }

  private handleInstallComplete(results: InstallResult[]): void {
    this.installProgress = null;
    
    // Refresh project list to show updated installation status
    this.fetchProjects();
    
    // Emit completion event to parent
    this.dispatchEvent(new CustomEvent('install-complete', {
      detail: { results },
      bubbles: true,
      composed: true
    }));
  }
}
```

---

### §7 Progress Tracking

**Objective**: Display real-time progress during multi-project installations.

**Progress UI Component**:
```typescript
private renderProgress(): TemplateResult | '' {
  if (!this.installProgress) return '';

  const { currentProject, completed, total, status, error } = this.installProgress;

  return html`
    <div class="install-progress ${status}">
      ${status === 'installing' ? html`
        <span class="spinner"></span>
        <span class="progress-text">
          Installing to ${currentProject} (${completed}/${total})...
        </span>
      ` : ''}
      
      ${status === 'error' ? html`
        <span class="error-icon">⚠</span>
        <span class="error-text">${error}</span>
      ` : ''}
      
      ${status === 'complete' ? html`
        <span class="success-icon">✓</span>
        <span class="success-text">
          Installed to ${completed} project${completed === 1 ? '' : 's'}
        </span>
      ` : ''}
    </div>
  `;
}
```

**Disable Interactions During Installation**:
```typescript
private get isInstalling(): boolean {
  return this.installProgress?.status === 'installing';
}

render() {
  return html`
    <div class="accordion-content ${this.isInstalling ? 'busy' : ''}">
      <!-- Checkboxes and button are disabled when busy -->
      ${this.renderProjectList()}
      <install-button
        .selectedCount=${this.selectionState.getSelectedCount()}
        .installing=${this.isInstalling}
      ></install-button>
    </div>
  `;
}
```

---

### §8 Version Comparison

**File**: `src/webviews/apps/package-browser/utils/version-compare.ts`

**Objective**: Implement semantic version comparison for upgrade/downgrade indicators.

**Implementation**:
```typescript
/**
 * Compare two semantic versions.
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(/[.-]/).map(p => parseInt(p, 10) || 0);
  const parts2 = v2.split(/[.-]/).map(p => parseInt(p, 10) || 0);

  const maxLength = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLength; i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }

  return 0;
}

/**
 * Check if version v1 is an upgrade from v2.
 */
export function isUpgrade(v1: string, v2: string): boolean {
  return compareVersions(v1, v2) > 0;
}

/**
 * Check if version v1 is a downgrade from v2.
 */
export function isDowngrade(v1: string, v2: string): boolean {
  return compareVersions(v1, v2) < 0;
}
```

**Unit Tests**:
```typescript
describe('compareVersions', () => {
  it('should return 1 when v1 > v2', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.1.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
  });

  it('should return -1 when v1 < v2', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
  });

  it('should return 0 when versions are equal', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('should handle prerelease versions', () => {
    expect(compareVersions('1.0.0-beta.1', '1.0.0-beta.2')).toBe(-1);
  });
});
```

---

### §9 Styling and Theme Integration

**Objective**: Style components using VS Code theme CSS variables for automatic theme support.

**VS Code Theme Variables** (automatically injected into webviews):
```css
:host {
  /* Background colors */
  --vscode-editor-background
  --vscode-editor-foreground
  --vscode-input-background
  --vscode-input-foreground
  
  /* Interactive elements */
  --vscode-button-background
  --vscode-button-foreground
  --vscode-button-hoverBackground
  --vscode-checkbox-background
  --vscode-checkbox-border
  
  /* Status colors */
  --vscode-editorInfo-foreground    /* For info badges */
  --vscode-editorWarning-foreground /* For warnings */
  --vscode-editorError-foreground   /* For errors */
  
  /* Borders and dividers */
  --vscode-panel-border
  --vscode-focusBorder              /* For focus outlines */
}
```

**Component Styles Example** (`project-selector.ts`):
```typescript
static styles = css`
  .accordion {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    margin: 8px 0;
  }

  .accordion-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    cursor: pointer;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
  }

  .accordion-header:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .installed-badge {
    margin-left: auto;
    padding: 2px 8px;
    background: var(--vscode-editorInfo-foreground);
    color: var(--vscode-editor-background);
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
  }

  .accordion-content {
    padding: 12px;
    background: var(--vscode-editor-background);
  }

  .accordion-content.busy {
    opacity: 0.6;
    pointer-events: none;
  }
`;
```

**Project List Item Styles** (`project-list-item.ts`):
```typescript
static styles = css`
  .project-row {
    display: flex;
    gap: 12px;
    padding: 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .project-row:last-child {
    border-bottom: none;
  }

  .project-row.installed {
    background: var(--vscode-list-inactiveSelectionBackground);
  }

  .installed-icon {
    color: var(--vscode-editorInfo-foreground);
    font-weight: bold;
  }

  .project-info {
    flex: 1;
  }

  .project-name {
    font-weight: 500;
    color: var(--vscode-editor-foreground);
  }

  .project-meta {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    margin-top: 4px;
  }

  .installed-version {
    color: var(--vscode-editorInfo-foreground);
  }

  .project-path {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  input[type="checkbox"] {
    accent-color: var(--vscode-checkbox-background);
    border: 1px solid var(--vscode-checkbox-border);
  }

  input[type="checkbox"]:focus {
    outline: 1px solid var(--vscode-focusBorder);
  }
`;
```

---

### §10 Accessibility

**Objective**: Ensure components are keyboard-navigable and screen-reader friendly.

**ARIA Attributes**:
```typescript
// Accordion header
render() {
  return html`
    <div
      class="accordion-header"
      role="button"
      tabindex="0"
      aria-expanded=${this.expanded}
      aria-controls="project-list"
      @click=${this.handleHeaderClick}
      @keydown=${this.handleHeaderKeydown}
    >
      <!-- Header content -->
    </div>
    
    <div
      id="project-list"
      class="accordion-content"
      role="region"
      aria-labelledby="accordion-header"
    >
      <!-- Project list -->
    </div>
  `;
}
```

**Keyboard Navigation**:
```typescript
private handleHeaderKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    this.handleHeaderClick();
  }
}

private handleCheckboxKeydown(e: KeyboardEvent): void {
  if (e.key === ' ') {
    e.preventDefault();
    const target = e.target as HTMLInputElement;
    target.checked = !target.checked;
    this.handleCheckboxChange(target);
  }
}
```

**Screen Reader Announcements**:
```typescript
// Use aria-live regions for progress updates
render() {
  return html`
    <div
      class="install-progress"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      ${this.installProgress ? html`
        Installing to ${this.installProgress.currentProject}
        (${this.installProgress.completed} of ${this.installProgress.total})
      ` : ''}
    </div>
  `;
}
```

**Focus Management**:
```typescript
// Focus first checkbox when accordion expands
updated(changedProperties: PropertyValues) {
  if (changedProperties.has('expanded') && this.expanded) {
    requestAnimationFrame(() => {
      const firstCheckbox = this.shadowRoot?.querySelector<HTMLInputElement>(
        'input[type="checkbox"]:not(:disabled)'
      );
      firstCheckbox?.focus();
    });
  }
}
```

---

### §11 Unit Tests

**File**: `src/webviews/apps/package-browser/components/__tests__/project-selector.test.ts`

**Test Coverage**:
```typescript
import { fixture, expect, html } from '@open-wc/testing';
import { ProjectSelector } from '../project-selector';
import type { ProjectInfo } from '../../state/types';

describe('project-selector', () => {
  let element: ProjectSelector;
  const mockProjects: ProjectInfo[] = [
    {
      name: 'MyApp.Web',
      path: '/src/MyApp.Web/MyApp.Web.csproj',
      relativePath: 'src/MyApp.Web/MyApp.Web.csproj',
      frameworks: ['net8.0']
    },
    {
      name: 'MyApp.Core',
      path: '/src/MyApp.Core/MyApp.Core.csproj',
      relativePath: 'src/MyApp.Core/MyApp.Core.csproj',
      frameworks: ['net8.0', 'netstandard2.0']
    },
    {
      name: 'MyApp.Tests',
      path: '/tests/MyApp.Tests/MyApp.Tests.csproj',
      relativePath: 'tests/MyApp.Tests/MyApp.Tests.csproj',
      frameworks: ['net8.0'],
      installedVersion: '12.0.1'
    }
  ];

  beforeEach(async () => {
    element = await fixture<ProjectSelector>(html`
      <project-selector .projects=${mockProjects}></project-selector>
    `);
  });

  it('should render empty state when no projects', async () => {
    element.projects = [];
    await element.updateComplete;
    
    const content = element.shadowRoot?.querySelector('.accordion-content');
    expect(content?.textContent).to.include('No projects found');
  });

  it('should auto-expand when package is installed in any project', async () => {
    await element.updateComplete;
    expect(element.expanded).to.be.true;
  });

  it('should show installed badge with correct count', async () => {
    await element.updateComplete;
    
    const badge = element.shadowRoot?.querySelector('.installed-badge');
    expect(badge?.textContent).to.include('✓ Installed (1)');
  });

  it('should update selection state on checkbox toggle', async () => {
    element.expanded = true;
    await element.updateComplete;

    const checkbox = element.shadowRoot?.querySelector<HTMLInputElement>(
      'project-list-item:first-of-type input[type="checkbox"]'
    );
    
    checkbox?.click();
    await element.updateComplete;

    expect(element.selectionState.getSelectedCount()).to.equal(1);
  });

  it('should emit project-selection-changed event', async () => {
    let eventDetail: any;
    element.addEventListener('project-selection-changed', (e: Event) => {
      eventDetail = (e as CustomEvent).detail;
    });

    element.expanded = true;
    await element.updateComplete;

    const checkbox = element.shadowRoot?.querySelector<HTMLInputElement>(
      'input[type="checkbox"]'
    );
    checkbox?.click();
    await element.updateComplete;

    expect(eventDetail.selectedProjects).to.be.an('array');
    expect(eventDetail.selectedProjects.length).to.equal(1);
  });

  it('should show indeterminate state when some projects selected', async () => {
    element.expanded = true;
    await element.updateComplete;

    // Select one of two available projects
    element.selectionState.toggle('/src/MyApp.Web/MyApp.Web.csproj');
    await element.updateComplete;

    const state = element.selectionState.getSelectAllState();
    expect(state).to.equal('indeterminate');
  });

  it('should disable install button when no projects selected', async () => {
    element.expanded = true;
    await element.updateComplete;

    const button = element.shadowRoot?.querySelector<HTMLButtonElement>(
      'install-button'
    );
    
    expect(button?.disabled).to.be.true;
  });

  it('should update button label based on selection count', async () => {
    element.expanded = true;
    await element.updateComplete;

    element.selectionState.toggle('/src/MyApp.Web/MyApp.Web.csproj');
    element.selectionState.toggle('/src/MyApp.Core/MyApp.Core.csproj');
    await element.updateComplete;

    const button = element.shadowRoot?.querySelector('install-button');
    expect(button?.textContent).to.include('Install to 2 projects');
  });

  it('should show progress indicator during installation', async () => {
    element.installProgress = {
      currentProject: 'MyApp.Web',
      completed: 1,
      total: 2,
      status: 'installing'
    };
    await element.updateComplete;

    const progress = element.shadowRoot?.querySelector('.install-progress');
    expect(progress?.textContent).to.include('Installing to MyApp.Web');
    expect(progress?.textContent).to.include('(1/2)');
  });

  it('should disable all interactions during installation', async () => {
    element.installProgress = {
      currentProject: 'MyApp.Web',
      completed: 0,
      total: 2,
      status: 'installing'
    };
    await element.updateComplete;

    const content = element.shadowRoot?.querySelector('.accordion-content');
    expect(content?.classList.contains('busy')).to.be.true;
  });
});
```

---

### §12 Integration Tests

**File**: `test/integration/project-selector-ipc.integration.test.ts`

**Test Coverage**:
```typescript
import { describe, it, expect, beforeEach, mock } from 'bun:test';
import type { ProjectInfo, InstallResult } from '../../src/webviews/apps/package-browser/state/types';

describe('Project Selector IPC Integration', () => {
  let requestMock: ReturnType<typeof mock>;
  let notificationHandlers: Map<string, Function>;

  beforeEach(() => {
    notificationHandlers = new Map();
    
    requestMock = mock((name: string, args: any) => {
      if (name === 'getProjects') {
        return Promise.resolve<ProjectInfo[]>([
          {
            name: 'TestProject',
            path: '/workspace/TestProject/TestProject.csproj',
            relativePath: 'TestProject/TestProject.csproj',
            frameworks: ['net8.0']
          }
        ]);
      }
      
      if (name === 'installPackage') {
        // Simulate installation progress
        setTimeout(() => {
          const handler = notificationHandlers.get('installProgress');
          handler?.({
            currentProject: 'TestProject',
            completed: 1,
            total: 1,
            status: 'installing'
          });
        }, 100);
        
        setTimeout(() => {
          const handler = notificationHandlers.get('installComplete');
          handler?.([
            {
              projectPath: '/workspace/TestProject/TestProject.csproj',
              success: true
            }
          ]);
        }, 200);
        
        return Promise.resolve();
      }
    });
  });

  it('should fetch projects on component mount', async () => {
    // Test implementation will call request('getProjects')
    const projects = await requestMock('getProjects', {
      workspacePath: '/workspace'
    });

    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('TestProject');
  });

  it('should send installPackage request with selected projects', async () => {
    await requestMock('installPackage', {
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      projectPaths: ['/workspace/TestProject/TestProject.csproj']
    });

    expect(requestMock).toHaveBeenCalledWith('installPackage', {
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      projectPaths: expect.arrayContaining([
        '/workspace/TestProject/TestProject.csproj'
      ])
    });
  });

  it('should handle installProgress notifications', async () => {
    let progressReceived = false;
    
    notificationHandlers.set('installProgress', (progress) => {
      progressReceived = true;
      expect(progress.currentProject).toBe('TestProject');
      expect(progress.status).toBe('installing');
    });

    await requestMock('installPackage', {
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      projectPaths: ['/workspace/TestProject/TestProject.csproj']
    });

    // Wait for notification
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(progressReceived).toBe(true);
  });

  it('should handle installComplete notifications', async () => {
    let results: InstallResult[] = [];
    
    notificationHandlers.set('installComplete', (r) => {
      results = r;
    });

    await requestMock('installPackage', {
      packageId: 'Newtonsoft.Json',
      version: '13.0.3',
      projectPaths: ['/workspace/TestProject/TestProject.csproj']
    });

    // Wait for completion
    await new Promise(resolve => setTimeout(resolve, 250));
    
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
  });
});
```

---

### §13 Parent Integration

**Objective**: Integrate `<project-selector>` into the package browser app.

**File**: `src/webviews/apps/package-browser/package-browser-app.ts`

**Integration Points**:
```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { PROJECT_SELECTOR_TAG } from './components/project-selector';
import type { PackageDetails } from './types';

@customElement(PACKAGE_BROWSER_APP_TAG)
export class PackageBrowserApp extends LitElement {
  @property({ type: Object }) packageDetails?: PackageDetails;
  @state() private selectedVersion?: string;

  render() {
    if (!this.packageDetails) {
      return html`<div>Loading...</div>`;
    }

    return html`
      <div class="package-details">
        <div class="package-header">
          <h1>${this.packageDetails.id}</h1>
          <version-selector
            .versions=${this.packageDetails.versions}
            @version-changed=${this.handleVersionChanged}
          ></version-selector>
        </div>

        <div class="package-description">
          ${this.packageDetails.description}
        </div>

        <details-section .packageDetails=${this.packageDetails}>
        </details-section>

        <frameworks-dependencies-section
          .dependencies=${this.packageDetails.dependencies}
        ></frameworks-dependencies-section>

        <project-selector
          .packageId=${this.packageDetails.id}
          .selectedVersion=${this.selectedVersion}
          @install-complete=${this.handleInstallComplete}
        ></project-selector>
      </div>
    `;
  }

  private handleVersionChanged(e: CustomEvent): void {
    this.selectedVersion = e.detail.version;
  }

  private handleInstallComplete(e: CustomEvent): void {
    const { results } = e.detail;
    
    // Show success/error toast
    const successCount = results.filter(r => r.success).length;
    const errorCount = results.length - successCount;
    
    if (errorCount === 0) {
      this.showToast(`Package installed to ${successCount} project(s)`, 'success');
    } else {
      this.showToast(
        `Installation failed for ${errorCount} project(s). View logs for details.`,
        'error'
      );
    }
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    // Emit event to host for VS Code notification
    this.dispatchEvent(new CustomEvent('show-toast', {
      detail: { message, type },
      bubbles: true,
      composed: true
    }));
  }
}
```

**Component Registration**:
```typescript
// src/webviews/apps/package-browser/index.ts
import './components/project-selector';
import './components/project-list-item';
import './components/install-button';
import './package-browser-app';

// All components are now registered and ready to use
```

---

## Testing Checklist

- [ ] Unit tests pass for all components (`bun test src/webviews/`)
- [ ] Integration tests pass for IPC flow (`bun test test/integration/`)
- [ ] Manual test: Accordion expands/collapses on header click
- [ ] Manual test: "Select All" toggles all available projects
- [ ] Manual test: Install button label updates dynamically
- [ ] Manual test: Progress indicator shows during installation
- [ ] Manual test: Installed projects show version badge
- [ ] Manual test: Upgrade/downgrade indicators appear correctly
- [ ] Manual test: Keyboard navigation works (Tab, Space, Enter)
- [ ] Manual test: Screen reader announces selection changes
- [ ] Manual test: High contrast theme renders correctly

## Success Criteria

- Project selector component renders correctly in package browser webview
- Users can select multiple projects and see dynamic button label updates
- Installation progress is displayed in real-time with project names and counts
- Installed projects are visually distinct with version badges
- Upgrade/downgrade indicators appear when applicable
- All interactions are keyboard-accessible
- Component respects VS Code theme changes automatically
- Unit test coverage >80% for all components and state management
- Integration tests validate complete IPC request-response flow

---

## Related Documentation

- [STORY-001-02-002-project-selection-ui.md](../stories/STORY-001-02-002-project-selection-ui.md) - User story with acceptance criteria
- [install-to-projects-ui.md](../discovery/install-to-projects-ui.md) - UI design mockups and patterns
- [request-response.md](../discovery/request-response.md) - IPC protocol and data flow
- [FEAT-001-02-install-packages.md](../features/FEAT-001-02-install-packages.md) - Feature overview

---

**Implementation Plan ID**: IMPL-001-02-002-project-selection-ui  
**Story**: [STORY-001-02-002-project-selection-ui](../stories/STORY-001-02-002-project-selection-ui.md)
