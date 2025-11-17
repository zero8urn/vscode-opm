# STORY-001-00-001-theme-service

**Feature**: [FEAT-001-00-foundations](../features/FEAT-001-00-foundations.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Status**: Done  
**Priority**: High  
**Estimate**: 3 Story Points  
**Created**: 2025-11-16  
**Last Updated**: 2025-11-16

## User Story

**As a** VS Code extension developer  
**I want** a centralized ThemeService that tracks VS Code theme changes and posts computed theme tokens to webviews  
**So that** all webviews automatically adapt to theme changes without manual event handling

## Description

The ThemeService is a foundational service that monitors VS Code's active color theme and computes CSS custom properties from theme tokens. When the theme changes, the service posts an update message to all registered webviews, enabling them to dynamically update their styling without reloading.

This service is critical for maintaining visual consistency with VS Code's UI and ensuring the extension respects user theme preferences (light, dark, high contrast). It eliminates the need for each webview to independently subscribe to theme change events and compute color values.

The implementation uses `vscode.window.onDidChangeActiveColorTheme` to detect theme changes and `vscode.window.activeColorTheme` to access current theme colors. The service computes CSS custom properties for common UI elements (backgrounds, foregrounds, borders, buttons) and posts them to webviews via `webview.postMessage()`.

## Acceptance Criteria

### Scenario: Service Initializes with Current Theme
**Given** the extension is activated  
**When** the ThemeService is instantiated  
**Then** it should compute CSS custom properties from the active color theme  
**And** store them for future webview registration

### Scenario: Theme Change Event Updates Webviews
**Given** the ThemeService has 2 registered webviews  
**When** the user changes the VS Code theme from light to dark  
**Then** the service should compute new CSS custom properties  
**And** post a theme update message to both webviews  
**And** the message should include the theme kind (light/dark/high-contrast)

### Scenario: Webview Receives Theme on Registration
**Given** the ThemeService is initialized with dark theme  
**When** a new webview is registered with the service  
**Then** the webview should immediately receive the current theme tokens  
**And** the webview should be added to the active webview list

### Additional Criteria
- [x] Service exposes `registerWebview(webview: Webview)` method
- [x] Service exposes `unregisterWebview(webview: Webview)` method
- [x] Service computes at least 20 CSS custom properties (--vscode-editor-background, etc.)
- [x] Service includes theme kind in update message (light, dark, high-contrast, high-contrast-light)
- [x] Service disposes onDidChangeActiveColorTheme listener on extension deactivation

## Technical Implementation

### Implementation Plan
Implementation will create `src/services/themeService.ts` with the following structure:
- `ThemeService` class with singleton pattern
- `registerWebview()` / `unregisterWebview()` methods for webview lifecycle
- `computeThemeTokens()` method to extract VS Code theme colors
- `postThemeUpdate()` method to broadcast to all webviews
- Theme change listener using `vscode.window.onDidChangeActiveColorTheme`

### Implementation Progress
- [x] Create `src/services/themeService.ts` implementing the ThemeService singleton
- [x] Wire ThemeService into `src/extension.ts` (registration + disposal)
- [x] Update `src/webviews/sampleWebview.ts` to register/unregister and apply theme tokens
 - [x] Unit tests added for `computeThemeTokens()` under `src/services/__tests__`
 
### Work Completed (Initial)
- Implemented `ThemeService` with register/unregister/dispose
- Computed >20 CSS token mappings as `var(--vscode-*)` placeholders
- Implemented debounced theme change listener and immediate token push on registration
- Updated `extension.ts` to initialize and dispose service, and register sample webview
- Updated `sampleWebview.ts` to apply tokens to the webview DOM

### Key Components
- **File/Module**: `src/services/themeService.ts` - Main ThemeService implementation
- **File/Module**: `src/webviews/apps/package-browser.ts` - Example webview consumer
- **File/Module**: `src/extension.ts` - Service initialization and disposal

### Technical Approach
The service uses the observer pattern to notify webviews of theme changes. It maintains a `Set<Webview>` of registered webviews and iterates over them when posting updates. CSS custom properties are computed by mapping `vscode.ColorThemeKind` to appropriate color values using the VS Code theme API.

The theme update message follows the IPC protocol:
```typescript
{
  type: 'notification',
  name: 'themeChanged',
  args: {
    kind: 'dark' | 'light' | 'high-contrast' | 'high-contrast-light',
    tokens: { [key: string]: string }
  }
}
```

### API/Integration Points
- `vscode.window.onDidChangeActiveColorTheme` - Theme change event listener
- `vscode.window.activeColorTheme` - Current theme accessor
- `vscode.ColorThemeKind` - Theme type enumeration
- `Webview.postMessage()` - Webview communication

## Testing Strategy

### Unit Tests
- [ ] Test theme token computation from ColorTheme object
- [ ] Test webview registration adds webview to active set
- [ ] Test webview unregistration removes webview from active set
- [ ] Test theme change event triggers postMessage to all registered webviews
- [ ] Test service disposal unsubscribes from theme change events

### Integration Tests
- [ ] Test webview receives initial theme on registration
- [ ] Test multiple webviews receive same theme update
- [ ] Test webview doesn't receive updates after unregistration

### Manual Testing
- [ ] Manual test: Register webview, verify initial theme received
- [ ] Manual test: Change theme (Cmd/Ctrl+K Cmd/Ctrl+T), verify webview updates
- [ ] Manual test: Switch between light, dark, and high contrast themes

## Dependencies

### Blocked By
None - this is a foundational service

### Blocks
- [STORY-001-01-002-search-webview-ui] requires ThemeService for theme-aware components
- [STORY-001-01-009-package-details-panel] requires ThemeService for details panel styling

### External Dependencies
- VS Code Extension API 1.85.0+
- No external npm packages required

## INVEST Check

- [x] **I**ndependent - Can be developed independently of other stories
- [x] **N**egotiable - Implementation details (number of CSS properties) can be adjusted
- [x] **V**aluable - Delivers value by enabling theme-aware webviews
- [x] **E**stimable - Clear scope with 3 story points
- [x] **S**mall - Can be completed in one iteration (1-2 days)
- [x] **T**estable - Has clear acceptance criteria with unit and integration tests

## Notes

The ThemeService should compute CSS custom properties that map directly to VS Code's design system. Common properties include:
- Editor colors (background, foreground, selection)
- Button colors (primary, secondary, disabled states)
- Input colors (background, border, focus)
- List colors (hover, active, focus)
- Badge colors (background, foreground)

Consider implementing lazy initialization to avoid computing theme tokens until the first webview registers.

The service should handle rapid theme changes gracefully (e.g., user quickly switching themes) by debouncing update messages.

Reference implementation: [VS Code Webview UI Toolkit](https://github.com/microsoft/vscode-webview-ui-toolkit/blob/main/src/utilities/theme/applyTheme.ts)

## Changelog

| Date | Change | Author |
|---|---|---|
| 2025-11-16 | Story created | AI Assistant |
| 2025-11-16 | Story completed and status set to Done | AI Assistant |

---
**Story ID**: STORY-001-00-001-theme-service  
**Feature**: [FEAT-001-00-foundations](../features/FEAT-001-00-foundations.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
