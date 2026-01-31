# STORY-001-02-015-header-toolbar

**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: To Do  
**Priority**: High  
**Estimate**: 1 Story Point  
**Created**: 2026-01-30  

## User Story

**As a** developer browsing packages in the Package Browser  
**I want** the header toolbar to remain visible when the package details pane is open  
**So that** I can always access global actions like refresh without closing the details view

## Problem Statement

When the package details pane opens, it overlays the package list and hides the header toolbar. This makes global actions (like Refresh Projects) inaccessible during the most common workflow—reviewing package details and installation status.

## Goal

Make the header toolbar persistent and visible at all times, even when the details pane is open, by placing it outside any scrollable or overlay containers.

## Acceptance Criteria

### Scenario: Toolbar visibility with details pane open
**Given** I have opened the package details pane  
**When** the details pane is visible  
**Then** the header toolbar remains visible and accessible

### Scenario: Toolbar visibility while scrolling
**Given** the package list is scrollable  
**When** I scroll the list up or down  
**Then** the header toolbar stays fixed in place and does not scroll out of view

### Scenario: Refresh access during details review
**Given** I am viewing package details  
**When** I look for the Refresh Projects action  
**Then** it is visible in the toolbar without closing the details pane

### Scenario: Layout behavior on narrow widths
**Given** the package browser view is narrow  
**When** the details pane is open  
**Then** the toolbar remains visible and does not overlap critical controls

## UX Notes

- The toolbar should feel like a persistent app header, anchored above list and details content.
- The refresh action should remain discoverable and visually consistent with the existing header styling.
- Visual stacking should prioritize the toolbar above list content and below any modal dialogs.

## Dependencies

- [STORY-001-02-013-optimize-package-list-parsing](./STORY-001-02-013-optimize-package-list-parsing.md) — Refresh Projects action is a key toolbar control

## Changelog

| Date | Change | Author |
|---|---|---|
| 2026-01-30 | Story created | AI Assistant |

---
**Story ID**: STORY-001-02-015-header-toolbar  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
