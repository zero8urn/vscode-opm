# IMPL-PERF-001-skeleton-loading

**Plan**: [Performance Optimization Plan](../plans/performance-project-loading-optimization.md)  
**Created**: 2026-01-28  
**Status**: Implemented  
**Priority**: High  
**Effort**: 1-2 hours

## Overview

Implement skeleton loading states for the project selector UI to provide instant visual feedback while data loads. This is a **perceived performance** optimization — the actual load time doesn't change, but users perceive the app as faster because they see immediate feedback.

**Core Principle**: Users perceive an app as fast when they see something happen immediately after their action. A loading spinner after 0ms feels faster than content after 500ms.

**Pattern**: 
1. User clicks package → Details panel opens instantly
2. Skeleton shimmer shows immediately (0ms)
3. Real content replaces skeleton when data arrives (500-2000ms)

## Implementation Checklist

### Phase 1: Skeleton CSS Component
- [x] 1. Add skeleton shimmer keyframes to `project-selector.ts` styles ([§1](#1-skeleton-css))
- [x] 2. Create `.skeleton-line` and `.skeleton-box` utility classes ([§1](#1-skeleton-css))
- [x] 3. Add `--skeleton-bg` CSS variable for theme compatibility ([§1](#1-skeleton-css))

### Phase 2: Project Selector Skeleton
- [x] 4. Add `loading` property to `project-selector.ts` ([§2](#2-project-selector-skeleton))
- [x] 5. Create skeleton template for project list items ([§2](#2-project-selector-skeleton))
- [x] 6. Show skeleton when `loading=true` and `projects.length=0` ([§2](#2-project-selector-skeleton))
- [x] 7. Smooth transition from skeleton to real content ([§2](#2-project-selector-skeleton))

### Phase 3: Badge Skeleton
- [x] 8. Add skeleton state to "✓ Installed" badge count ([§3](#3-badge-skeleton))
- [x] 9. Show "..." or shimmer while installed count is loading ([§3](#3-badge-skeleton))

### Phase 4: Testing
- [ ] 10. Visual regression test for skeleton states ([§4](#4-testing))
- [ ] 11. Accessibility: Screen readers announce "Loading projects..." ([§4](#4-testing))

---

## Detailed Implementation Sections

### §1. Skeleton CSS

**File**: `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`

Add to the static `styles` block:

```css
/* Skeleton Loading Animation */
@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.skeleton {
  background: linear-gradient(
    90deg,
    var(--vscode-editor-background) 25%,
    var(--vscode-input-background) 50%,
    var(--vscode-editor-background) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}

.skeleton-line {
  height: 1em;
  margin-bottom: 0.5em;
}

.skeleton-line.short {
  width: 60%;
}

.skeleton-line.medium {
  width: 80%;
}

.skeleton-line.long {
  width: 100%;
}

.skeleton-box {
  height: 2.5em;
  margin-bottom: 0.5em;
}

.skeleton-project-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--vscode-panel-border);
}

.skeleton-checkbox {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.skeleton-project-name {
  flex: 1;
  height: 1em;
}

.skeleton-version {
  width: 60px;
  height: 1em;
}
```

**Key Design Decisions**:
- Uses VS Code theme variables for consistency
- Shimmer animation is subtle (1.5s) to avoid distraction
- Skeleton matches actual content dimensions for smooth transition

---

### §2. Project Selector Skeleton

**File**: `src/webviews/apps/packageBrowser/components/project-selector.ts`

**Template for skeleton state**:

```typescript
private renderSkeleton() {
  // Show 3 skeleton rows as placeholder
  return html`
    <div class="project-list skeleton-container" aria-busy="true" aria-label="Loading projects">
      ${[1, 2, 3].map(() => html`
        <div class="skeleton-project-row">
          <div class="skeleton skeleton-checkbox"></div>
          <div class="skeleton skeleton-project-name skeleton-line medium"></div>
          <div class="skeleton skeleton-version skeleton-line short"></div>
        </div>
      `)}
    </div>
  `;
}
```

**Conditional rendering in `render()` method**:

```typescript
render() {
  // Show skeleton while loading and no projects yet
  if (this.loading && this.projects.length === 0) {
    return this.renderSkeleton();
  }
  
  // Show actual content
  return html`
    <div class="project-list">
      ${this.projects.map(project => this.renderProjectRow(project))}
    </div>
  `;
}
```

**Smooth transition CSS**:

```css
.project-list {
  transition: opacity 150ms ease-out;
}

.skeleton-container {
  opacity: 0.7;
}
```

---

### §3. Badge Skeleton

**File**: `src/webviews/apps/packageBrowser/components/project-selector.ts`

The "✓ Installed (X)" badge should show a loading state while installed count is being calculated:

```typescript
private renderInstalledBadge() {
  if (this.loading) {
    return html`
      <span class="installed-badge loading" aria-label="Calculating installed count">
        ✓ Installed (...)
      </span>
    `;
  }
  
  const installedCount = this.projects.filter(p => p.installedVersion).length;
  return html`
    <span class="installed-badge">
      ✓ Installed (${installedCount})
    </span>
  `;
}
```

**Badge CSS**:

```css
.installed-badge.loading {
  opacity: 0.6;
}
```

---

### §4. Testing

**Unit Tests**: `src/webviews/apps/packageBrowser/components/__tests__/project-selector.test.ts`

```typescript
describe('Skeleton Loading', () => {
  test('shows skeleton when loading with no projects', async () => {
    const el = await fixture(html`
      <project-selector
        .loading=${true}
        .projects=${[]}
      ></project-selector>
    `);
    
    const skeleton = el.shadowRoot?.querySelector('.skeleton-container');
    expect(skeleton).toBeTruthy();
    expect(skeleton?.getAttribute('aria-busy')).toBe('true');
  });
  
  test('shows real content when projects loaded', async () => {
    const el = await fixture(html`
      <project-selector
        .loading=${false}
        .projects=${[{ name: 'TestProject', path: '/path' }]}
      ></project-selector>
    `);
    
    const skeleton = el.shadowRoot?.querySelector('.skeleton-container');
    expect(skeleton).toBeNull();
    
    const projectRow = el.shadowRoot?.querySelector('.project-row');
    expect(projectRow).toBeTruthy();
  });
  
  test('skeleton has correct ARIA attributes for accessibility', async () => {
    const el = await fixture(html`
      <project-selector .loading=${true} .projects=${[]}></project-selector>
    `);
    
    const container = el.shadowRoot?.querySelector('.skeleton-container');
    expect(container?.getAttribute('aria-busy')).toBe('true');
    expect(container?.getAttribute('aria-label')).toBe('Loading projects');
  });
});
```

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Time to first visual feedback | <16ms (one frame) |
| Skeleton → Content transition | Smooth, no layout shift |
| ARIA accessibility | Screen readers announce loading state |
| Theme compatibility | Works in all VS Code themes |

---

## Dependencies

- None - This is a standalone perceived performance enhancement

## Blocks

- None - This is additive and doesn't block other work

---

## Notes

**Why Skeleton over Spinner?**
- Spinners are abstract — users don't know what's loading
- Skeletons show the structure of content — users understand what's coming
- Skeletons reduce perceived waiting time by ~30% (according to UX studies)

**Number of Skeleton Rows**
- Fixed at 3 rows to provide visual structure without over-promising
- Matches typical small-medium workspace (2-5 projects)
- Large workspaces won't feel the skeleton was "lying"

**Animation Duration**
- 1.5s shimmer cycle is slow enough to be calming, fast enough to show activity
- Matches Material Design loading patterns

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-29 | Implementation completed: skeleton CSS, loading property, badge skeleton | AI Assistant |
| 2026-01-28 | Implementation plan created | AI Assistant |
