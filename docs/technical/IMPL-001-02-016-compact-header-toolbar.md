# IMPL-001-02-016-compact-header-toolbar

**Story**: [STORY-001-02-016-compact-header-toolbar](../stories/STORY-001-02-016-compact-header-toolbar.md)  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Created**: 2026-01-30  
**Status**: Ready for Implementation  

---

## High-Level Summary

Compress the Package Browser header into a single row that contains the search input, Include prerelease toggle, refresh icon, and search guidance text. Update placeholder text to carry the help copy and use a theme-aware refresh icon.

**Key Decisions**:
- Use a single-row flex layout with inline alignment and minimal vertical padding.
- Render the refresh action as an icon-only button using VS Code theme colors.
- Move search help copy into the input placeholder.

---

## Implementation Checklist

- [ ] 1. Add Codicon dependency + webview CSS wiring ([§codicons](#codicons))
- [ ] 2. Compact header layout in the Package Browser header ([§layout](#layout))
- [ ] 3. Refresh icon-only button with theme-aware color ([§refresh-icon](#refresh-icon))
- [ ] 4. Update search input placeholder text ([§placeholder](#placeholder))
- [ ] 5. Validate narrow-width behavior and prevent overlap ([§responsive](#responsive))
- [ ] 6. Run unit + integration tests ([§tests](#tests))

---

<section id="layout">

### §layout. Compact Header Layout

**File**: `src/webviews/apps/packageBrowser/packageBrowser.ts`

**Goal**: Place the search input, prerelease toggle, refresh icon, and help text on a single line.

**Plan**:
- Move `<prerelease-toggle>` into the `.search-header` row.
- Render the help text as a small inline label to the right of the toggle (or as part of the input placeholder, then omit extra text).
- Reduce vertical padding and gaps to keep the toolbar compact.

</section>

<section id="refresh-icon">

### §refresh-icon. Refresh Icon-Only Button

**File**: `src/webviews/apps/packageBrowser/packageBrowser.ts`

**Goal**: Show refresh as a single icon with theme-aware coloring.

**Options**:
- **Codicon**: Use `@vscode/codicon` in webviews (`codicon-refresh`) and set color to `var(--vscode-icon-foreground)`.
- **Inline SVG**: Inline a refresh SVG and set `fill="currentColor"`, then apply `color: var(--vscode-icon-foreground)`.

</section>

<section id="placeholder">

### §placeholder. Update Search Placeholder

**File**: `src/webviews/apps/packageBrowser/packageBrowser.ts`

**Goal**: Move “Search by package name, keyword, or author.” into the search input placeholder and remove redundant helper text.

</section>

<section id="codicons">

### §codicons. Add Codicon Dependency + CSS Wiring

**Files**:
- `package.json` (dependency)
- Webview entry HTML/CSS where icons are referenced

**Goal**: Ensure Codicon styles are available in the webview so `codicon` classes render.

**Plan**:
- Install the dependency: `bun add @vscode/codicon`.
- Load Codicon CSS in the webview bundle (import in webview entry or link to bundled CSS) so the font and classes are available.

</section>

<section id="responsive">

### §responsive. Narrow Width Behavior

**Files**:
- `src/webviews/apps/packageBrowser/packageBrowser.ts`
- `src/webviews/apps/packageBrowser/components/prerelease-toggle.ts`

**Goal**: Keep controls readable at narrow widths.

**Plan**:
- If needed, adjust flex wrapping or allow the help text to truncate with ellipsis.
- Consider compact spacing for the prerelease toggle to reduce horizontal pressure.

</section>

<section id="tests">

### §tests. Test Coverage

**Goal**: Ensure unit and integration tests pass.

**Plan**:
- Run unit tests (Bun runner).
- Run integration tests (Bun runner).

</section>
