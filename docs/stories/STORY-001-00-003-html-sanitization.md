# STORY-001-00-003-html-sanitization

**Feature**: [FEAT-001-00-foundations](../features/FEAT-001-00-foundations.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Done  
**Priority**: High  
**Estimate**: 3 Story Points  
**Created**: 2025-11-16  
**Last Updated**: 2025-11-23

## User Story

**As a** developer using the NuGet Package Management extension  
**I want** implement html sanitization for webviews  
**So that** package README and description HTML render safely without exposing users to XSS risk

## Description

This story implements a minimal, lightweight HTML sanitization helper that webview renderers can call before injecting external HTML (for example, package README content fetched from NuGet). The implementation is intentionally conservative and swappable: it provides a small default sanitizer that removes obvious attack vectors and an API to replace it with a third-party library (e.g., DOMPurify) if needed later.

The goal is to mitigate XSS and script injection while keeping the surface area small and easy to review. Full CSP and webview resource helpers are covered in the next story; this work focuses on server/client-side content cleaning and unit tests validating common attack vectors.

## Acceptance Criteria

### Primary Acceptance Criteria
- [ ] Sanitization API available as `sanitizeHtml(html, options)` and documented
- [ ] Default sanitizer removes `<script>`, `<iframe>`, `<object>`, `<embed>` and other dangerous elements
- [ ] Event-handler attributes (e.g. `onclick`, `onerror`) are removed from rendered HTML
- [ ] `javascript:`, `vbscript:`, and `data:` URIs are neutralized in `href`/`src` attributes by default
- [ ] Images are removed by default but alt text is preserved; `allowImages` option restores images
- [ ] Sanitizer is swappable via `setSanitizer()` so a third-party library (DOMPurify) can be used later

### Example Scenarios
- Scenario: Render package README safely
	- Given a package README that may contain external HTML
	- When the extension renders the README inside a webview
	- Then the content is sanitized and no script execution or event handlers can run

- Scenario: Allow controlled images
	- Given README contains images and `allowImages=true` is passed
	- When sanitizer runs
	- Then inline images and safe `https:` image sources are preserved (subject to later CSP)

## Technical Implementation

### Implementation Plan
- Implement a minimal, conservative sanitizer in `src/webviews/sanitizer.ts` with a clear swap point for third-party libraries.

### Key Components
- **File/Module**: `src/webviews/sanitizer.ts` — default sanitizer and swap API (`sanitizeHtml`, `setSanitizer`, `getSanitizer`)
- **File/Module**: `src/webviews/__tests__/sanitizer.test.ts` — unit tests validating core behaviours
- **Integration**: Webview renderers (e.g., `src/webviews/apps/package-details.ts`) should call `sanitizeHtml(rawHtml)` before injecting into webview DOM.

### Technical Approach
- Keep default implementation small and conservative because most README HTML comes from nuget.org; provide a clear API to swap in `DOMPurify` or `isomorphic-dompurify` later if stricter sanitization is required.

### API/Integration Points
- Use `sanitizeHtml(html, { allowImages?: boolean, allowStyles?: boolean })` when producing webview content.
- Webviews must still use `webview.asWebviewUri()` and enforce CSP using nonces (see next story).

## Testing Strategy

### Unit Tests
The repository includes unit tests for the sanitizer using `bun:test`.

- [x] Test case: removes `<script>` tags
- [x] Test case: strips event-handler attributes like `onclick`
- [x] Test case: neutralizes `javascript:` URIs in `href`
- [x] Test case: removes images by default and preserves `alt` text

### Integration Tests
- Integration tests for CSP and end-to-end webview rendering are deferred to the next story (`STORY-001-00-004`) which will add nonces and resource helpers.

### Manual Testing
- Manual test: Open package details webview and confirm README content renders with no script execution; verify images are removed by default.

## Dependencies

### Blocked By
- None for the sanitizer itself; CSP/resource helpers are in the following story.

### External Dependencies
- Optional: `isomorphic-dompurify` or `dompurify` can be plugged in via `setSanitizer()` if required later.

## INVEST Check

- [x] **I**ndependent - Can be developed independently
- [x] **N**egotiable - Details can be adjusted
- [x] **V**aluable - Delivers value to users
- [x] **E**stimable - Can be estimated
- [x] **S**mall - Can be completed in one iteration
- [x] **T**estable - Has clear acceptance criteria

## Notes

- The default sanitizer is intentionally minimal. If later analysis shows need for stricter sanitization (or to preserve more HTML semantics), swap in `isomorphic-dompurify` via `setSanitizer()`.

## Changelog

| Date | Change | Author |
|---|---|---|
| 2025-11-23 | Implemented sanitizer, tests, and documented usage | AI Assistant |

---
**Story ID**: STORY-001-00-003-html-sanitization  
**Feature**: [FEAT-001-00-foundations](../features/FEAT-001-00-foundations.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
