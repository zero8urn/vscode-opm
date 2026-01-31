# STORY-001-02-013-optimize-package-list-parsing

**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: To Do  
**Priority**: High  
**Estimate**: 2 Story Points  
**Created**: 2026-01-30  

## User Story

**As a** developer browsing packages in the Package Browser  
**I want** package installation checks to complete instantly  
**So that** I can quickly see which packages are installed without waiting several seconds for each package I click

## Problem Statement

**Current Experience:**
- Opening package details takes **5+ seconds** every time
- Each package click triggers a full scan of all projects
- No caching between package selections
- Poor perceived performance destroys browsing flow

**User Impact:**
```
User clicks Package A → ⏳ 5.2 seconds → Projects appear
User clicks Package B → ⏳ 5.2 seconds → Projects appear
User clicks Package C → ⏳ 5.2 seconds → Projects appear
```

Users expect instant results when browsing packages, similar to browsing npm packages in VS Code's built-in package manager.

## Solution

Parse installed packages **once** when the Package Browser opens, then cache the results for instant lookup when users click different packages.

**Expected Experience:**
- Package Browser opens → Initial load (one-time cost)
- Click any package → **Instant** installed status display
- **90%+ reduction** in perceived delay

## Acceptance Criteria

### Performance
- [ ] Package details panel shows installed status **instantly** after first load (≤50ms)
- [ ] Initial package browser open completes within 5 seconds for typical workspace
- [ ] Switching between packages feels instant (no visible delay)
- [ ] Cache automatically refreshes when project files change

### User Experience
- [ ] Skeleton loading UI appears immediately while data loads
- [ ] Progress indicator shows during initial package list fetch
- [ ] "Refresh Projects" button available to manually update package list
- [ ] Smooth, responsive browsing experience (no stuttering or freezing)

### Reliability
- [ ] Gracefully handles missing .NET SDK with clear error message
- [ ] Works correctly with projects that have no packages installed
- [ ] Shows helpful guidance for legacy `packages.config` projects
- [ ] Cache stays synchronized when projects are modified externally

## Success Metrics

**Performance Targets:**
- Package click latency: **5000ms → 50ms** (99% reduction)
- Backend CLI calls per session: **N → 1** (where N = packages clicked)
- Cache hit rate: **>95%** for typical browsing sessions
- User-perceived performance: **Instant** after initial load

**User Experience Goals:**
- Zero visible delay when switching between packages
- Smooth, responsive browsing experience
- Clear loading indicators during initial fetch
- Automatic cache updates feel seamless

## Dependencies

- **Requires**: [STORY-001-02-011-external-change-detection](STORY-001-02-011-external-change-detection.md) for automatic cache invalidation when project files change
- **Requires**: [STORY-001-02-010-cache-invalidation](STORY-001-02-010-cache-invalidation.md) for cache invalidation after install/uninstall operations
- **Related**: [performance-project-loading-optimization.md](../plans/performance-project-loading-optimization.md) for broader performance strategy

## Implementation Notes

**Key Technical Decisions:**
- Use `dotnet list package --no-restore` flag to skip implicit NuGet restore checks
- Fetch all project package data once at Package Browser startup
- Cache results in frontend and backend for instant lookups
- Leverage existing file watcher infrastructure for automatic cache invalidation
- Add manual refresh button for user-initiated cache clear

**Technical Documentation**: Implementation details to be documented separately in `docs/technical/`

---

**Story ID**: STORY-001-02-013  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
