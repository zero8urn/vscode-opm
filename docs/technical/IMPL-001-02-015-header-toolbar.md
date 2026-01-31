# IMPL-001-02-015-header-toolbar

**Story**: [STORY-001-02-015-header-toolbar](../stories/STORY-001-02-015-header-toolbar.md)  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Created**: 2026-01-30  
**Status**: Ready for Implementation  

---

## High-Level Summary

Keep the Package Browser header toolbar visible at all times by restructuring the webview layout so the header sits outside any scrollable or overlay containers. The details pane will be offset below the persistent header and constrained to the remaining viewport height. This preserves access to global actions (e.g., Refresh Projects) while package details are open, and prevents the header from scrolling away or being occluded.

**Key Decisions**:
- Treat the header as a persistent app-level toolbar (fixed or sticky) with a higher stacking context than list content.
- Offset the details panel to start below the header, rather than overlaying it.
- Keep changes localized to webview layout/CSS; no backend changes required.

---

## Consolidated Implementation Checklist

- [ ] 1. Restructure Package Browser layout to isolate the toolbar from scrollable/overlay regions ([§layout-structure](#layout-structure))
- [ ] 2. Add persistent header styles and define a shared header height variable for layout calculations ([§header-styles](#header-styles))
- [ ] 3. Offset the details panel below the header and update its height constraints ([§details-panel-offset](#details-panel-offset))
- [ ] 4. Validate narrow-width behavior and prevent header overlap with critical controls ([§responsive-behavior](#responsive-behavior))
- [ ] 5. Run unit + integration tests and confirm no new UI-specific tests are required ([§tests](#tests))

---

<section id="layout-structure">

### §layout-structure. Restructure Package Browser Layout

**File**: `src/webviews/apps/packageBrowser/packageBrowser.ts`

**Goal**: Ensure the header toolbar is rendered outside any scrollable or overlay containers.

**Plan**:
- Wrap the existing search/header region in a new top-level container (e.g., `.app-header`) that is **outside** the list and details panel regions.
- Create a new content wrapper (e.g., `.app-body`) that contains:
  - `.results-container`
  - `<package-details-panel>`
- Ensure the header container is the first sibling in the root render output so it remains in the visual stacking order above content.

**Notes**:
- Keep the search input, prerelease toggle, helper text, and Refresh button intact; only the structural grouping changes.

</section>

<section id="header-styles">

### §header-styles. Persistent Header Styling

**File**: `src/webviews/apps/packageBrowser/packageBrowser.ts`

**Goal**: Keep the toolbar visible while scrolling and when the details panel is open.

**Plan**:
- Add a CSS custom property for header height (e.g., `--opm-header-height`) to the `:host` or `.app-header` rule to drive layout offsets consistently.
- Apply a sticky or fixed header style:
  - `position: sticky` with `top: 0` and a background color that matches the editor surface.
  - Add `z-index` above list content but below modal dialogs.
- Ensure the header has a bottom border and uses existing theme variables for consistency.

**Notes**:
- Prefer sticky unless fixed is needed for webview container constraints. Either approach must keep the header visible in all scroll states.

</section>

<section id="details-panel-offset">

### §details-panel-offset. Offset Details Panel Below Header

**File**: `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`

**Goal**: Prevent the details pane from covering the toolbar when open.

**Plan**:
- Update the panel host positioning to start below the header:
  - Replace `top: 0` with `top: var(--opm-header-height)` (or a fallback if needed).
  - Adjust `height`/`bottom` to ensure the panel fits within the remaining viewport (e.g., `height: calc(100vh - var(--opm-header-height))`).
- Verify backdrop positioning accounts for the header (backdrop should not cover the header if it blocks interactions).
- Confirm the panel’s `z-index` remains below the header but above list content.

**Notes**:
- If the header is sticky and part of the normal flow, ensure the panel’s computed top uses the same header height variable to align.

</section>

<section id="responsive-behavior">

### §responsive-behavior. Narrow Width Layout Checks

**Files**:
- `src/webviews/apps/packageBrowser/packageBrowser.ts`
- `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`

**Goal**: Ensure the toolbar remains visible and does not overlap critical controls at narrow widths.

**Plan**:
- Validate that the header height and spacing still allow the search input and Refresh button to fit without overlapping.
- If needed, add a media query to:
  - Stack toolbar controls vertically
  - Reduce padding/gaps while retaining usability
- Ensure details panel width constraints still work for narrow widths without covering the header.

</section>

<section id="tests">

### §tests. Test Coverage Validation

**Goal**: Ensure existing unit and integration tests pass. No new UI-specific tests required.

**Plan**:
- Run unit tests (Bun runner) and confirm no regressions.
- Run integration tests (Bun runner) and confirm no regressions.
- Skip UI-specific tests unless a regression is discovered.

</section>
