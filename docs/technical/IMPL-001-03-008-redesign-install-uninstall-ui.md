# IMPL-001-03-008-redesign-install-uninstall-ui

**Story**: [STORY-001-03-008-redesign-install-uninstall-ui](../stories/STORY-001-03-008-redesign-install-uninstall-ui.md)  
**Status**: Not Started  
**Created**: 2026-01-31  
**Last Updated**: 2026-01-31

## Overview

This implementation plan redesigns the package installation UI from a checkbox-based selection model to a direct action model with per-project and global install/uninstall buttons. The changes eliminate user confusion when dealing with mixed installation states and provide clearer, more immediate feedback.

## Goals

- Remove checkbox-based project selection entirely
- Add per-project install/uninstall buttons with icons
- Add global "Install All" and "Uninstall All" buttons
- Display version upgrade/downgrade indicators with tooltips
- Simplify project name display to show only .csproj filename
- Remove success toast notifications (UI updates are sufficient)

## Implementation Checklist

- [ ] §1: Remove success toast notifications from extension host
- [ ] §2: Simplify project name display in project-list-item
- [ ] §3: Remove checkbox from project-list-item, add per-project action buttons
- [ ] §4: Add version indicators (up/down arrows) with tooltips
- [ ] §5: Add global Install All / Uninstall All buttons to project-selector
- [ ] §6: Remove Select All checkbox and selection state from project-selector
- [ ] §7: Update event handlers in packageDetailsPanel
- [ ] §8: Remove or simplify SelectionState class
- [ ] §9: Test all UI flows (install, uninstall, upgrade, downgrade, global actions)

## Detailed Implementation Sections

---

### §1: Remove Success Toast Notifications

**File**: `src/webviews/packageBrowserWebview.ts`

**Changes**:
1. Locate the install package response handler (around line 820-840)
2. Remove `vscode.window.showInformationMessage` for successful installs
3. Locate the uninstall package response handler (around line 865-880)
4. Remove `vscode.window.showInformationMessage` for successful uninstalls
5. Keep error toasts (`showErrorMessage`, `showWarningMessage`) for failures

**Rationale**: The UI optimistically updates to show installed/uninstalled state immediately, making success toasts redundant. Error toasts remain important for troubleshooting.

---

### §2: Simplify Project Name Display

**File**: `src/webviews/apps/packageBrowser/components/project-list-item.ts`

**Changes**:
1. Update the `project-name` rendering logic to extract only the filename:
   ```typescript
   private get projectFileName(): string {
     const parts = this.project.path.split('/');
     return parts[parts.length - 1]; // e.g., "TestProject.csproj"
   }
   ```
2. Update the template to use `${this.projectFileName}` instead of `${this.project.name}`
3. Remove background color from `.installed-badge` CSS (should have transparent background)
4. Remove checkmark (✓) from installed version display
5. Display installed version as plain text: "v13.0.3"

**Updated Template Structure**:
```typescript
<span class="project-name">${this.projectFileName}</span>
<span class="frameworks">${this.project.frameworks.join(', ')}</span>
${isInstalled ? html`<span class="installed-version">v${this.project.installedVersion}</span>` : ''}
```

---

### §3: Replace Checkbox with Per-Project Action Buttons

**File**: `src/webviews/apps/packageBrowser/components/project-list-item.ts`

**Changes**:
1. Remove checkbox from template
2. Add conditional button rendering based on `installedVersion`:
   ```typescript
   ${this.isInstalled
     ? html`<button class="action-btn uninstall-btn" @click=${this.handleUninstallClick} title="Uninstall">
              <span class="icon trash-icon">🗑️</span>
            </button>`
     : html`<button class="action-btn install-btn" @click=${this.handleInstallClick} title="Install">
              <span class="icon plus-icon">+</span>
            </button>`
   }
   ```
3. Remove `handleCheckboxChange()` method
4. Add new event handlers:
   ```typescript
   private handleInstallClick(): void {
     this.dispatchEvent(
       new CustomEvent('install-project', {
         detail: { projectPath: this.project.path },
         bubbles: true,
         composed: true,
       })
     );
   }

   private handleUninstallClick(): void {
     this.dispatchEvent(
       new CustomEvent('uninstall-project', {
         detail: { projectPath: this.project.path },
         bubbles: true,
         composed: true,
       })
     );
   }
   ```
5. Add CSS for action buttons:
   ```css
   .action-btn {
     padding: 4px 8px;
     border: 1px solid var(--vscode-button-border, transparent);
     background-color: var(--vscode-button-background);
     color: var(--vscode-button-foreground);
     cursor: pointer;
     border-radius: 2px;
     display: flex;
     align-items: center;
     gap: 4px;
   }

   .action-btn:hover {
     background-color: var(--vscode-button-hoverBackground);
   }

   .uninstall-btn {
     background-color: var(--vscode-button-secondaryBackground);
     color: var(--vscode-button-secondaryForeground);
   }
   ```

---

### §4: Add Version Indicators with Tooltips

**File**: `src/webviews/apps/packageBrowser/components/project-list-item.ts`

**Changes**:
1. Enhance install button to show upgrade/downgrade indicator:
   ```typescript
   private get actionButtonContent(): TemplateResult {
     const indicator = this.versionIndicator;
     
     if (!this.isInstalled) {
       return html`<span class="icon plus-icon">+</span> Install`;
     }

     // Upgrade
     if (indicator === '↑') {
       return html`<span class="icon upgrade-icon">↑</span> Upgrade`;
     }

     // Downgrade
     if (indicator === '↓') {
       return html`<span class="icon downgrade-icon">↓</span> Downgrade`;
     }

     // Reinstall same version
     return html`<span class="icon plus-icon">+</span> Install`;
   }

   private get actionButtonTooltip(): string {
     const indicator = this.versionIndicator;
     
     if (indicator === '↑') {
       return `Upgrade from v${this.project.installedVersion} to v${this.selectedVersion}`;
     }
     if (indicator === '↓') {
       return `Downgrade from v${this.project.installedVersion} to v${this.selectedVersion}`;
     }
     if (this.isInstalled) {
       return `Reinstall v${this.selectedVersion}`;
     }
     return `Install v${this.selectedVersion}`;
   }
   ```
2. Update install button template:
   ```typescript
   <button
     class="action-btn install-btn"
     @click=${this.handleInstallClick}
     title=${this.actionButtonTooltip}
   >
     ${this.actionButtonContent}
   </button>
   ```
3. Add CSS for indicators:
   ```css
   .upgrade-icon {
     color: var(--vscode-charts-green);
   }
   .downgrade-icon {
     color: var(--vscode-charts-orange);
   }
   ```

---

### §5: Add Global Action Buttons

**File**: `src/webviews/apps/packageBrowser/components/project-selector.ts`

**Changes**:
1. Add global action buttons to accordion header or just above project list:
   ```typescript
   private renderGlobalActions(): TemplateResult {
     const availableCount = this.projects.filter(p => !p.installedVersion).length;
     const installedCount = this.projects.filter(p => p.installedVersion).length;

     return html`
       <div class="global-actions">
         ${availableCount > 0
           ? html`
               <button
                 class="global-action-btn install-all-btn"
                 @click=${this.handleInstallAll}
                 ?disabled=${this.isInstalling}
               >
                 <span class="icon plus-icon">+</span>
                 Install All (${availableCount})
               </button>
             `
           : ''}
         ${installedCount > 0
           ? html`
               <button
                 class="global-action-btn uninstall-all-btn"
                 @click=${this.handleUninstallAll}
                 ?disabled=${this.isInstalling}
               >
                 <span class="icon trash-icon">🗑️</span>
                 Uninstall All (${installedCount})
               </button>
             `
           : ''}
       </div>
     `;
   }
   ```
2. Add event handlers:
   ```typescript
   private handleInstallAll(): void {
     const availableProjects = this.projects
       .filter(p => !p.installedVersion)
       .map(p => p.path);

     if (availableProjects.length === 0) return;

     this.dispatchEvent(
       new CustomEvent('install-all', {
         detail: { projectPaths: availableProjects },
         bubbles: true,
         composed: true,
       })
     );
   }

   private handleUninstallAll(): void {
     const installedProjects = this.projects
       .filter(p => p.installedVersion)
       .map(p => p.path);

     if (installedProjects.length === 0) return;

     this.dispatchEvent(
       new CustomEvent('uninstall-all', {
         detail: { projectPaths: installedProjects },
         bubbles: true,
         composed: true,
       })
     );
   }
   ```
3. Add CSS:
   ```css
   .global-actions {
     display: flex;
     gap: 8px;
     margin-bottom: 16px;
     padding: 8px 0;
     border-bottom: 1px solid var(--vscode-widget-border);
   }

   .global-action-btn {
     padding: 6px 12px;
     border: 1px solid var(--vscode-button-border);
     background-color: var(--vscode-button-background);
     color: var(--vscode-button-foreground);
     cursor: pointer;
     border-radius: 2px;
     display: flex;
     align-items: center;
     gap: 6px;
   }

   .uninstall-all-btn {
     background-color: var(--vscode-button-secondaryBackground);
     color: var(--vscode-button-secondaryForeground);
   }
   ```

---

### §6: Remove Selection State Logic

**File**: `src/webviews/apps/packageBrowser/components/project-selector.ts`

**Changes**:
1. Remove Select All checkbox from template
2. Remove `selectionState` property and initialization
3. Remove `handleSelectAllChange()` method
4. Remove `handleProjectToggle()` method (no longer emitted)
5. Remove imports for `SelectionState`
6. Remove checkbox-related CSS
7. Remove old install button that depended on selection state

**Before**:
```typescript
<div class="select-all">
  <input type="checkbox" ... />
  <label>Select All</label>
</div>
```

**After**: (removed entirely)

---

### §7: Update Event Handlers

**File**: `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`

**Changes**:
1. Add listeners for new events in `connectedCallback()` or within template:
   ```typescript
   @install-project=${this.handleInstallProject}
   @uninstall-project=${this.handleUninstallProject}
   @install-all=${this.handleInstallAll}
   @uninstall-all=${this.handleUninstallAll}
   ```
2. Implement new handlers:
   ```typescript
   private handleInstallProject(e: CustomEvent): void {
     const { projectPath } = e.detail;
     if (!this.packageId || !this.selectedVersion) return;

     // Reuse existing install logic with single project
     this.dispatchEvent(
       new CustomEvent('install-package', {
         detail: {
           packageId: this.packageId,
           version: this.selectedVersion,
           projectPaths: [projectPath],
         },
         bubbles: true,
         composed: true,
       })
     );
   }

   private handleUninstallProject(e: CustomEvent): void {
     const { projectPath } = e.detail;
     if (!this.packageId) return;

     this.dispatchEvent(
       new CustomEvent('uninstall-package', {
         detail: {
           packageId: this.packageId,
           projectPaths: [projectPath],
         },
         bubbles: true,
         composed: true,
       })
     );
   }

   private handleInstallAll(e: CustomEvent): void {
     const { projectPaths } = e.detail;
     if (!this.packageId || !this.selectedVersion || projectPaths.length === 0) return;

     this.dispatchEvent(
       new CustomEvent('install-package', {
         detail: {
           packageId: this.packageId,
           version: this.selectedVersion,
           projectPaths,
         },
         bubbles: true,
         composed: true,
       })
     );
   }

   private handleUninstallAll(e: CustomEvent): void {
     const { projectPaths } = e.detail;
     if (!this.packageId || projectPaths.length === 0) return;

     this.dispatchEvent(
       new CustomEvent('uninstall-package', {
         detail: {
           packageId: this.packageId,
           projectPaths,
         },
         bubbles: true,
         composed: true,
       })
     );
   }
   ```

---

### §8: Clean Up SelectionState

**File**: `src/webviews/apps/packageBrowser/state/selection-state.ts`

**Options**:
1. Delete the file entirely if no longer used
2. Or simplify to just track loading/progress state if needed elsewhere

**Decision**: Check if `SelectionState` is used anywhere else. If not, delete it. If it's only imported by `project-selector.ts`, safe to delete.

---

### §9: Testing Checklist

**Manual Testing Steps**:

1. **Single Project Install**:
   - Open package details with 1 project
   - Verify install button shows with plus icon
   - Click install, verify operation executes
   - Verify UI updates to show installed version and uninstall button
   - Verify no success toast appears

2. **Single Project Uninstall**:
   - With package installed in 1 project
   - Click uninstall button (trash icon)
   - Verify operation executes
   - Verify UI updates to remove installed version and show install button
   - Verify no success toast appears

3. **Mixed State (2 projects, 1 installed)**:
   - Open package details
   - Verify one project shows uninstall button, other shows install button
   - Verify global "Install All" and "Uninstall All" buttons both appear
   - Click install on available project, verify it installs
   - Click uninstall on installed project, verify it uninstalls

4. **Global Install All**:
   - Package installed in 0 of 3 projects
   - Click "Install All" button
   - Verify all 3 projects install
   - Verify UI updates all 3 to show uninstall buttons

5. **Global Uninstall All**:
   - Package installed in 3 of 3 projects
   - Click "Uninstall All" button
   - Verify all 3 projects uninstall
   - Verify UI updates all 3 to show install buttons

6. **Upgrade Indicator**:
   - Install version 1.0.0 in a project
   - View version 2.0.0 in package details
   - Verify install button shows up arrow (↑) and "Upgrade" label
   - Hover over button, verify tooltip says "Upgrade from v1.0.0 to v2.0.0"

7. **Downgrade Indicator**:
   - Install version 2.0.0 in a project
   - View version 1.0.0 in package details
   - Verify install button shows down arrow (↓) and "Downgrade" label
   - Hover over button, verify tooltip says "Downgrade from v2.0.0 to v1.0.0"

8. **Error Handling**:
   - Trigger an install failure (e.g., network offline, invalid package)
   - Verify error toast appears
   - Verify "View Logs" action works

9. **Project Name Display**:
   - Verify project names show only filename: "TestProject.csproj"
   - Verify no full path like "TestProject/TestProject.csproj"

10. **Installed Version Display**:
    - Verify installed version shows as plain text "v13.0.3"
    - Verify no background color
    - Verify no checkmark icon

---

## Implementation Order

Execute sections in this order:
1. §1 (Remove toasts - simple, no UI impact)
2. §2 (Simplify project names - visual only)
3. §3 (Replace checkbox with buttons - major change)
4. §4 (Add version indicators - enhancement)
5. §8 (Clean up SelectionState - code cleanup)
6. §6 (Remove Select All checkbox - cleanup)
7. §5 (Add global buttons - new feature)
8. §7 (Update event handlers - wire it all together)
9. §9 (Test all flows)

## Success Criteria

- [ ] No checkboxes visible in project list
- [ ] Each project row has exactly one action button (install or uninstall)
- [ ] Global action buttons appear only when applicable
- [ ] Version indicators (↑↓) show correctly for upgrades/downgrades
- [ ] Tooltips provide clear version information
- [ ] Project names display as filename only
- [ ] Installed version displays as plain text without highlighting
- [ ] No success toasts appear for install/uninstall
- [ ] Error toasts still appear for failures
- [ ] All operations (single, global, upgrade, downgrade) work correctly

## Rollback Plan

If issues arise, revert commits in reverse order. The changes are isolated to webview components and don't affect backend logic, making rollback safe.

## Notes

- Icons: Using Unicode symbols (🗑️, +, ↑, ↓) for simplicity. Can replace with SVG or VSCode Codicons if needed.
- The existing IPC protocol (`install-package`, `uninstall-package` events) remains unchanged, we just emit them from different UI triggers.
- Event handlers in `packageDetailsPanel.ts` already support multiple project paths, so global actions reuse existing infrastructure.
