# STORY-001-02-016-compact-header-toolbar

**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: To Do  
**Priority**: High  
**Estimate**: 1 Story Point  
**Created**: 2026-01-30  

## User Story

**As a** developer browsing packages in the Package Browser  
**I want** the header toolbar to be a single compact row  
**So that** I can see more results while keeping key actions visible

## Problem Statement

The current header uses multiple rows and a large toolbar height. This reduces visible search results and spreads related controls across multiple lines.

## Goal

Make the header as compact as possible by placing the search input, prerelease toggle, refresh action, and search help text on a single line while preserving clarity and accessibility.

## Acceptance Criteria

### Scenario: Single-row header layout
**Given** the Package Browser header is visible  
**When** I view the toolbar  
**Then** the search input, Include prerelease toggle, refresh icon, and search help text appear on the same line

### Scenario: Refresh button styling
**Given** the toolbar is visible  
**When** I view the refresh action  
**Then** it appears as a refresh icon only and respects VS Code theme colors

### Scenario: Placeholder text update
**Given** the search input is empty  
**When** I view the placeholder  
**Then** it reads “Search by package name, keyword, or author.”

### Scenario: Narrow width behavior
**Given** the Package Browser view is narrow  
**When** the toolbar is rendered  
**Then** the layout remains readable and controls do not overlap

## UX Notes

- The header should feel compact and stable without sacrificing discoverability.
- The refresh icon should visually align with other toolbar controls.
- The search helper text should not compete with the input field.

## Dependencies

- [STORY-001-02-015-header-toolbar](./STORY-001-02-015-header-toolbar.md) — persistent header behavior

## Changelog

| Date | Change | Author |
|---|---|---|
| 2026-01-30 | Story created | AI Assistant |

---
**Story ID**: STORY-001-02-016-compact-header-toolbar  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
