# IMPL-001-01-004-prerelease-filter

**Story**: [STORY-001-01-004-prerelease-filter](../stories/STORY-001-01-004-prerelease-filter.md)  
**Status**: Not Started  
**Created**: 2025-12-28

## Summary

This implementation adds a prerelease filter toggle to the NuGet Package Browser webview, enabling users to include or exclude prerelease packages from search results. The NuGetApiClient already supports the `prerelease` parameter through the `SearchOptions` interface, so this work focuses exclusively on exposing that capability in the UI through a new Lit component and updating the IPC protocol.

The implementation follows the existing webview architecture pattern: a reactive Lit checkbox component manages local state, the root `PackageBrowserApp` component includes the toggle in its template and passes the prerelease preference to search requests, and the extension host's `packageBrowserWebview.ts` message handler forwards the parameter unchanged to `NuGetApiClient.searchPackages()`. This approach requires minimal changes—no modifications to domain logic or API client code—and maintains strict separation between presentation (webview) and domain (extension host) layers.

Key integration points include the `SearchRequestMessage` IPC type (adding optional `includePrerelease` field, which already exists), the `PackageBrowserApp.performSearch()` method (reading checkbox state instead of hardcoded `false`), and comprehensive test coverage spanning unit tests for the new component, type guard updates, and E2E validation of the end-to-end search flow with prerelease filtering.

## Implementation Todos

### Phase 1: Types & IPC Protocol
- [ ] **TODO-1**: Verify `SearchRequestMessage.payload.includePrerelease` field exists in [src/webviews/apps/package-browser/types.ts](../../../src/webviews/apps/package-browser/types.ts) and matches the existing optional boolean signature <ref>existingSearchRequestType</ref>
- [ ] **TODO-2**: No changes needed to `SearchOptions` interface in [src/domain/models/searchOptions.ts](../../../src/domain/models/searchOptions.ts) - `prerelease?: boolean` field already exists <ref>existingSearchOptions</ref>

### Phase 2: Webview Components
- [ ] **TODO-3**: Create `PrereleaseToggle` Lit component in new file [src/webviews/apps/packageBrowser/components/prerelease-toggle.ts](../../../src/webviews/apps/packageBrowser/components/prerelease-toggle.ts) with:
  - Export constant `PRERELEASE_TOGGLE_TAG = 'prerelease-toggle' as const`
  - `@property({ type: Boolean }) checked: boolean = false` for toggle state
  - `@property({ type: Boolean }) disabled: boolean = false` for loading state
  - Checkbox input styled with VS Code CSS variables
  - `change` event dispatch when checkbox toggles using `new CustomEvent('change', { detail: { checked: this.checked }, bubbles: true, composed: true })`
  - Accessibility: proper label association, `aria-label`, keyboard navigation <ref>litComponentPattern</ref> <ref>vsCodeTheming</ref>
- [ ] **TODO-4**: Update [src/webviews/apps/package-browser/packageBrowserApp.ts](../../../src/webviews/apps/package-browser/packageBrowserApp.ts):
  - Add `@state() private includePrerelease = false;` property to component state <ref>packageBrowserAppState</ref>
  - Add handler method `private handlePrereleaseToggle = (e: CustomEvent): void => { this.includePrerelease = e.detail.checked; this.performSearch(); }`
  - Update `performSearch()` method to read `this.includePrerelease` instead of hardcoded `false` in request payload <ref>performSearchMethod</ref>
  - Update `render()` method to add `<prerelease-toggle>` in `.search-container` div before helper text, with `@change=${this.handlePrereleaseToggle}` and `.disabled=${this.isLoading}` <ref>renderMethod</ref>
  - Import `PRERELEASE_TOGGLE_TAG` and register side effect: `import './components/prerelease-toggle.ts';` to ensure component is defined

### Phase 3: Extension Host (Minimal Changes)
- [ ] **TODO-5**: Verify [src/webviews/packageBrowserWebview.ts](../../../src/webviews/packageBrowserWebview.ts) `handleSearchRequest()` function already forwards `includePrerelease` from webview message to `nugetClient.searchPackages()` call - no code changes needed, only validation <ref>handleSearchRequestForwarding</ref>

### Phase 4: Testing
- [ ] **TODO-6**: Create unit test file [src/webviews/apps/packageBrowser/components/__tests__/prerelease-toggle.test.ts](../../../src/webviews/apps/packageBrowser/components/__tests__/prerelease-toggle.test.ts) with Bun test runner:
  - Test component instantiation and tag export
  - Test default `checked` state is `false`
  - Test `checked` property updates trigger re-render
  - Test `disabled` property applies disabled attribute to input
  - Test change event emits with correct `detail.checked` value
  - Test accessibility attributes (aria-label, label association) <ref>unitTestPattern</ref>
- [ ] **TODO-7**: Update [src/webviews/apps/package-browser/__tests__/types.test.ts](../../../src/webviews/apps/package-browser/__tests__/types.test.ts):
  - Add test case in `isSearchRequestMessage` describe block: "should return true for search request with includePrerelease true"
  - Add test case: "should return true for search request with includePrerelease false"
  - Add test case: "should return true for search request without includePrerelease field" <ref>typeGuardTests</ref>
- [ ] **TODO-8**: Update [test/e2e/packageBrowser.e2e.ts](../../../test/e2e/packageBrowser.e2e.ts) to add test validating prerelease parameter flows through IPC:
  - Add test: "Command executes with prerelease toggle and completes without errors"
  - Test validates command execution succeeds (cannot test webview DOM from Extension Host)
  - Focus on integration smoke test, not UI interaction <ref>e2eTestPattern</ref>

## Context Sections

<context id="existingSearchRequestType">
**Current SearchRequestMessage interface** in `src/webviews/apps/package-browser/types.ts`:

```typescript
export interface SearchRequestMessage {
  type: 'searchRequest';
  payload: {
    query: string;
    includePrerelease?: boolean;
    skip?: number;
    take?: number;
    requestId?: string;
  };
}
```

The `includePrerelease` field already exists as an optional boolean. No changes needed to the type definition—this implementation only changes how the webview *populates* this field based on UI state.
</context>

<context id="existingSearchOptions">
**Current SearchOptions interface** in `src/domain/models/searchOptions.ts`:

```typescript
export interface SearchOptions {
  /** Search query string (omit for browsing all packages) */
  query?: string;

  /** Include prerelease versions in results */
  prerelease?: boolean;

  /** Number of results to skip (for pagination) */
  skip?: number;

  /** Maximum number of results to return (default 20, max 1000) */
  take?: number;

  /** SemVer level support (default "2.0.0") */
  semVerLevel?: string;
}
```

The domain model already supports `prerelease?: boolean`. The NuGetApiClient accepts this parameter and forwards it to the NuGet v3 API. No domain layer changes required.
</context>

<context id="litComponentPattern">
**Lit Component Pattern** - Example from existing `PackageCard` component:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/** Custom element tag name for package card component */
export const PACKAGE_CARD_TAG = 'package-card' as const;

@customElement(PACKAGE_CARD_TAG)
export class PackageCard extends LitElement {
  @property({ type: Object })
  package!: PackageSearchResult;

  @property({ type: Boolean })
  selected = false;

  static override styles = css`
    :host {
      display: block;
      cursor: pointer;
    }
    // ... more styles using --vscode-* CSS variables
  `;

  override render() {
    return html`
      <div class="card" @click=${this.handleClick}>
        <!-- template content -->
      </div>
    `;
  }

  private handleClick() {
    this.dispatchEvent(new CustomEvent('select', { 
      detail: { packageId: this.package.id },
      bubbles: true,
      composed: true 
    }));
  }
}
```

**Key patterns for PrereleaseToggle**:
- Export tag constant with `as const` before decorator
- Use `@property({ type: Boolean })` for reactive boolean properties
- Use `@customElement(TAG_CONSTANT)` decorator
- Dispatch custom events with `bubbles: true, composed: true` to cross shadow DOM
- Use VS Code CSS variables (see next context)
</context>

<context id="vsCodeTheming">
**VS Code Theming Pattern** - Use built-in CSS variables for automatic theme support:

```css
/* VS Code automatically injects these variables into webviews */
.checkbox-label {
  color: var(--vscode-foreground);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
}

.checkbox-input {
  accent-color: var(--vscode-checkbox-background);
  border: 1px solid var(--vscode-checkbox-border);
}

.checkbox-input:focus {
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: 2px;
}

.checkbox-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

**Available VS Code CSS variables for checkboxes**:
- `--vscode-foreground` - Main text color
- `--vscode-checkbox-background` - Checkbox background
- `--vscode-checkbox-border` - Checkbox border
- `--vscode-checkbox-foreground` - Check mark color
- `--vscode-focusBorder` - Focus outline color
- `--vscode-descriptionForeground` - Helper text color

**Important**: Do NOT create a custom theme service. VS Code's variables update automatically when users change themes.
</context>

<context id="packageBrowserAppState">
**Current PackageBrowserApp state management** in `src/webviews/apps/package-browser/packageBrowserApp.ts`:

```typescript
@customElement(PACKAGE_BROWSER_APP_TAG)
export class PackageBrowserApp extends LitElement {
  @state()
  private searchQuery = '';

  @state()
  private isLoading = false;

  @state()
  private results: PackageSearchResult[] = [];

  private vscode = acquireVsCodeApi();
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  
  // ... component methods
}
```

**Pattern to follow**:
- Use `@state()` decorator for private reactive properties
- State changes trigger automatic re-renders
- Add new state: `@state() private includePrerelease = false;`
</context>

<context id="performSearchMethod">
**Current performSearch() implementation** in `src/webviews/apps/package-browser/packageBrowserApp.ts`:

```typescript
private performSearch(): void {
  if (!this.searchQuery.trim()) {
    this.results = [];
    this.isLoading = false;
    return;
  }

  this.isLoading = true;

  const request: SearchRequestMessage = {
    type: 'searchRequest',
    payload: {
      query: this.searchQuery,
      includePrerelease: false,  // ← CHANGE THIS LINE
      skip: 0,
      take: 25,
      requestId: Date.now().toString(),
    },
  };

  this.vscode.postMessage(request);
}
```

**Required change**:
Replace `includePrerelease: false` with `includePrerelease: this.includePrerelease` to read from component state.
</context>

<context id="renderMethod">
**Current render() method structure** in `src/webviews/apps/package-browser/packageBrowserApp.ts`:

```typescript
override render() {
  return html`
    <div class="search-container">
      <input
        type="text"
        class="search-input"
        placeholder="Search NuGet packages..."
        .value=${this.searchQuery}
        @input=${this.handleSearchInput}
        aria-label="Search packages"
      />
      <div class="helper-text">Search by package name, keyword, or author.</div>
    </div>

    <div class="results-container">${this.renderResults()}</div>
  `;
}
```

**Required change**:
Add `<prerelease-toggle>` element in `.search-container` before the `.helper-text` div:

```typescript
<div class="search-container">
  <input ... />
  <prerelease-toggle
    .checked=${this.includePrerelease}
    .disabled=${this.isLoading}
    @change=${this.handlePrereleaseToggle}
  ></prerelease-toggle>
  <div class="helper-text">Search by package name, keyword, or author.</div>
</div>
```

**Note**: Use `.checked=${...}` property binding (dot prefix) for boolean properties, not attribute binding.
</context>

<context id="handleSearchRequestForwarding">
**Current handleSearchRequest() implementation** in `src/webviews/packageBrowserWebview.ts`:

```typescript
async function handleSearchRequest(
  message: SearchRequestMessage,
  panel: vscode.WebviewPanel,
  logger: ILogger,
  nugetClient: INuGetApiClient,
): Promise<void> {
  const { query, includePrerelease, skip, take, requestId } = message.payload;

  logger.info('Search request received', {
    query,
    includePrerelease,
    skip,
    take,
    requestId,
  });

  // ... abort controller setup ...

  try {
    const result = await nugetClient.searchPackages(
      {
        query,
        prerelease: includePrerelease ?? false,  // ← Already correct
        skip: skip ?? 0,
        take: take ?? 20,
      },
      controller.signal,
    );
    
    // ... result handling ...
  }
}
```

**Verification**:
The handler already destructures `includePrerelease` from the message payload and forwards it to `nugetClient.searchPackages()` as the `prerelease` field. The default value `?? false` handles undefined cases. **No code changes needed** - just verify this forwarding works correctly in tests.
</context>

<context id="unitTestPattern">
**Unit Test Pattern** - Example from `src/webviews/apps/package-browser/__tests__/types.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import {
  isSearchRequestMessage,
  type SearchRequestMessage,
} from '../types';

describe('Package Browser Types', () => {
  describe('isSearchRequestMessage', () => {
    it('should return true for valid search request', () => {
      const msg: SearchRequestMessage = {
        type: 'searchRequest',
        payload: {
          query: 'newtonsoft',
          includePrerelease: false,
          skip: 0,
          take: 25,
        },
      };
      expect(isSearchRequestMessage(msg)).toBe(true);
    });

    it('should return true for minimal search request', () => {
      const msg = {
        type: 'searchRequest',
        payload: { query: 'test' },
      };
      expect(isSearchRequestMessage(msg)).toBe(true);
    });
  });
});
```

**Pattern for component tests** (based on `src/webviews/apps/packageBrowser/components/__tests__/components.test.ts`):

```typescript
import { describe, test, expect } from 'bun:test';

describe('PrereleaseToggle Component Module', () => {
  test('should export PrereleaseToggle class', async () => {
    const module = await import('../prerelease-toggle');
    expect(module.PrereleaseToggle).toBeDefined();
    expect(typeof module.PrereleaseToggle).toBe('function');
  });

  test('should export tag constant', async () => {
    const module = await import('../prerelease-toggle');
    expect(module.PRERELEASE_TOGGLE_TAG).toBe('prerelease-toggle');
  });

  test('should have default checked state as false', async () => {
    const module = await import('../prerelease-toggle');
    const instance = new module.PrereleaseToggle();
    expect(instance.checked).toBe(false);
  });
});
```

**Note**: Unit tests run with Bun's test runner. Use `bun:test` imports and co-locate tests in `__tests__/` directories next to source files.
</context>

<context id="typeGuardTests">
**Type Guard Test Pattern** - Add to `src/webviews/apps/package-browser/__tests__/types.test.ts`:

```typescript
describe('isSearchRequestMessage', () => {
  // ... existing tests ...

  it('should return true for search request with includePrerelease true', () => {
    const msg: SearchRequestMessage = {
      type: 'searchRequest',
      payload: {
        query: 'serilog',
        includePrerelease: true,
      },
    };
    expect(isSearchRequestMessage(msg)).toBe(true);
  });

  it('should return true for search request with includePrerelease false', () => {
    const msg: SearchRequestMessage = {
      type: 'searchRequest',
      payload: {
        query: 'serilog',
        includePrerelease: false,
      },
    };
    expect(isSearchRequestMessage(msg)).toBe(true);
  });

  it('should return true for search request without includePrerelease field', () => {
    const msg = {
      type: 'searchRequest',
      payload: {
        query: 'serilog',
        // includePrerelease omitted - should still be valid
      },
    };
    expect(isSearchRequestMessage(msg)).toBe(true);
  });
});
```
</context>

<context id="e2eTestPattern">
**E2E Test Pattern** - Example from `test/e2e/packageBrowser.e2e.ts`:

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';
import { sleep, waitFor } from './testHelpers';

suite('Package Browser E2E Tests', () => {
  test('Command executes successfully and creates webview', async function () {
    this.timeout(10000);

    const extId = 'zero8urn.octothorpe-package-manager';

    // Wait for extension to be available
    await waitFor(
      async () => {
        const ext = vscode.extensions.getExtension(extId);
        return !!ext;
      },
      { timeoutMs: 5000 },
    );

    // Execute command - validates full workflow
    await vscode.commands.executeCommand('opm.openPackageBrowser');

    // Wait for initialization
    await sleep(500);

    // Verify command is registered
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('opm.openPackageBrowser'));
  });
});
```

**Pattern for prerelease filter E2E test**:
- Use `suite()` and `test()` (Mocha TDD style, not `describe()`/`it()`)
- Set explicit timeout: `this.timeout(10000)`
- Test command execution completes without errors
- **Cannot test webview DOM** from Extension Host - only test that command succeeds
- Add smoke test that validates the integration works end-to-end
- Use `sleep()` after command execution to allow webview initialization

**Important**: E2E tests run in VS Code Extension Host with `@vscode/test-electron`. They have full VS Code API access but **cannot interact with webview DOM**. Use unit tests with JSDOM for webview component testing.
</context>

## References

### Source Files
- [src/domain/models/searchOptions.ts](../../src/domain/models/searchOptions.ts) - Domain SearchOptions interface
- [src/webviews/apps/package-browser/types.ts](../../src/webviews/apps/package-browser/types.ts) - IPC message types
- [src/webviews/apps/package-browser/packageBrowserApp.ts](../../src/webviews/apps/package-browser/packageBrowserApp.ts) - Root webview component
- [src/webviews/packageBrowserWebview.ts](../../src/webviews/packageBrowserWebview.ts) - Extension host webview controller
- [src/commands/packageBrowserCommand.ts](../../src/commands/packageBrowserCommand.ts) - Command registration

### Test Files
- [src/webviews/apps/package-browser/__tests__/types.test.ts](../../src/webviews/apps/package-browser/__tests__/types.test.ts) - IPC type guard tests
- [src/webviews/apps/packageBrowser/components/__tests__/components.test.ts](../../src/webviews/apps/packageBrowser/components/__tests__/components.test.ts) - Component unit tests
- [test/e2e/packageBrowser.e2e.ts](../../test/e2e/packageBrowser.e2e.ts) - E2E integration tests

### Documentation
- [.github/copilot-instructions.md](../../.github/copilot-instructions.md) - Repository conventions and patterns
- [docs/technical/e2e-testing-guide.md](./e2e-testing-guide.md) - E2E testing patterns and guidelines

### Related Stories
- [STORY-001-01-001-nuget-search-api](../stories/STORY-001-01-001-nuget-search-api.md) - NuGet API search implementation
- [STORY-001-01-002-search-webview-ui](../stories/STORY-001-01-002-search-webview-ui.md) - Package browser webview foundation

---
**Implementation Plan ID**: IMPL-001-01-004-prerelease-filter  
**Story**: [STORY-001-01-004-prerelease-filter](../stories/STORY-001-01-004-prerelease-filter.md)
