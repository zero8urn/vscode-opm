# UI Composability & Testability Implementation Plan

**Status:** Ready for Implementation
**Related:** `packageBrowser-ui-breakdown.md`, Phase 6 Polish
**Goal:** Break down monolithic components into focused, composable, testable units

---

## Executive Summary

The Package Browser UI has grown to **983 LOC** in `packageDetailsPanel.ts`, **763 LOC** in the root app, **545 LOC** in `project-selector.ts`, and **512 LOC** in `version-selector.ts`. This violates the 300 LOC guideline and makes testing difficult.

This plan decomposes these into:
1. **Small, focused components** (<150 LOC each)
2. **Reactive Controllers** for side effects (debouncing, abort handling, caching)
3. **Consolidated message handling** via the existing Mediator pattern
4. **Externalized CSS** to reduce component LOC
5. **Component tests** setup for future Cypress component testing

**Target Architecture:**
- No component >200 LOC
- Side effects isolated in ReactiveControllers
- State management via existing state classes
- Message handling via existing WebviewMessageMediator
- CSS externalized to `styles/` directory

---

## Current State Analysis

### Component Size Breakdown

| File | LOC | Status | Issues |
|------|-----|--------|--------|
| `packageDetailsPanel.ts` | 983 | 🔴 VIOLATES | Handles details, versions, deps, readme, install/uninstall, project fetching |
| `packageBrowser.ts` | 763 | 🔴 VIOLATES | Search, pagination, source selection, message routing, debouncing |
| `project-selector.ts` | 545 | 🔴 VIOLATES | Project list, selection, install status, batch operations |
| `version-selector.ts` | 512 | 🔴 VIOLATES | Version list, compatibility, framework filters, stability badges |
| `project-list-item.ts` | 309 | ⚠️ LARGE | Individual project item with complex install status |
| `packageList.ts` | 287 | ✅ OK | Reasonable size but inline message handling |
| `dependencyTree.ts` | 198 | ✅ OK | Good |
| `readmeViewer.ts` | 189 | ✅ OK | Good |
| `versionList.ts` | 172 | ✅ OK | Good |
| `packageCard.ts` | 160 | ✅ OK | Good |
| `sourceSelector.ts` | 158 | ✅ OK | Good |
| `accordionSection.ts` | 159 | ✅ OK | Good |
| `packageBadges.ts` | 104 | ✅ OK | Good |
| `prerelease-toggle.ts` | 98 | ✅ OK | Good |

### Architecture Strengths (Keep These)

✅ **State Management:** SearchState, DetailsState, ProjectsState, SourcesState, SelectionState
✅ **Type Safety:** Comprehensive TypeScript types with discriminated unions
✅ **Message Types:** Well-defined IPC with type guards
✅ **Mediator Pattern:** `WebviewMessageMediator` already exists
✅ **Security:** Sanitization, CSP enforcement
✅ **VS Code Theming:** Using CSS variables correctly

### Problems to Fix

❌ **No ReactiveControllers:** Side effects (timers, abort, caching) mixed into components
❌ **Inline Message Handling:** `packageBrowser.ts` has 200+ LOC of `handleHostMessage`
❌ **Inline CSS:** 200+ LOC of styles in each large component
❌ **Tight Coupling:** Components know about IPC details
❌ **Limited Reusability:** Hard to extract and test components independently
❌ **No Component Tests:** Only E2E tests exist

---

## Implementation Phases

### Phase 1: Foundation — Controllers & CSS Extraction

**Goal:** Establish patterns before breaking down components

#### 1.1 Create Lit ReactiveController Infrastructure

**What:** Reactive controllers manage side effects outside component lifecycle

**Create:** `src/webviews/apps/packageBrowser/controllers/`

**Files to create:**

```typescript
// controllers/searchController.ts
export class SearchController implements ReactiveController {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;
  
  constructor(
    private host: ReactiveControllerHost,
    private onSearch: (query: string) => void,
    private debounceMs = 300
  ) {
    host.addController(this);
  }
  
  search(query: string): void {
    this.cancelPending();
    this.debounceTimer = setTimeout(() => {
      this.abortController = new AbortController();
      this.onSearch(query);
    }, this.debounceMs);
  }
  
  cancelPending(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.abortController?.abort();
  }
  
  hostDisconnected(): void {
    this.cancelPending();
  }
}

// controllers/detailsController.ts
export class DetailsController implements ReactiveController {
  private abortController: AbortController | null = null;
  
  constructor(
    private host: ReactiveControllerHost,
    private onFetch: (signal: AbortSignal) => void
  ) {
    host.addController(this);
  }
  
  fetch(): void {
    this.cancel();
    this.abortController = new AbortController();
    this.onFetch(this.abortController.signal);
  }
  
  cancel(): void {
    this.abortController?.abort();
    this.abortController = null;
  }
  
  hostDisconnected(): void {
    this.cancel();
  }
}

// controllers/index.ts
export { SearchController } from './searchController';
export { DetailsController } from './detailsController';
```

**Tests:** `controllers/__tests__/searchController.test.ts`

#### 1.2 Externalize CSS

**Create:** `src/webviews/apps/packageBrowser/styles/`

```typescript
// styles/common.ts
export const commonStyles = css`
  :host {
    --opm-spacing-xs: 4px;
    --opm-spacing-sm: 8px;
    --opm-spacing-md: 12px;
    --opm-spacing-lg: 16px;
    --opm-border-radius: 3px;
  }
`;

// styles/packageBrowser.ts
export const appStyles = css`
  /* Move CSS from packageBrowser.ts here */
`;

// styles/packageDetailsPanel.ts
export const detailsPanelStyles = css`
  /* Move CSS from packageDetailsPanel.ts here */
`;

// styles/index.ts
export * from './common';
export * from './packageBrowser';
export * from './packageDetailsPanel';
```

**Usage:**
```typescript
import { appStyles, commonStyles } from './styles';

static override styles = [commonStyles, appStyles];
```

**Reduction:** ~200 LOC per component moved to styles

---

### Phase 2: Decompose packageBrowser.ts (Root App)

**Current:** 763 LOC
**Target:** 200-300 LOC

#### 2.1 Extract Search Header Component

**Create:** `components/searchHeader.ts` (~120 LOC)

```typescript
@customElement('search-header')
export class SearchHeader extends LitElement {
  @property({ type: String }) query = '';
  @property({ type: Boolean }) includePrerelease = false;
  @property({ type: String }) selectedSourceId = '';
  @property({ type: Array }) sources: PackageSourceOption[] = [];
  @property({ type: Boolean }) loading = false;
  
  private searchController = new SearchController(
    this,
    (query) => this.emitSearch(query)
  );
  
  private emitSearch(query: string): void {
    this.dispatchEvent(new CustomEvent('search-input', {
      detail: { query, includePrerelease: this.includePrerelease },
      bubbles: true,
      composed: true,
    }));
  }
  
  render() {
    return html`
      <div class="search-header">
        <search-input
          .value=${this.query}
          @input-change=${this.handleInputChange}
        ></search-input>
        <prerelease-toggle
          .checked=${this.includePrerelease}
          @change=${this.handlePrereleaseChange}
        ></prerelease-toggle>
        <source-selector
          .sources=${this.sources}
          .selectedSourceId=${this.selectedSourceId}
          @source-changed=${this.handleSourceChange}
        ></source-selector>
        <button
          class="refresh-button"
          @click=${this.handleRefresh}
          ?disabled=${this.loading}
        >
          ${refreshIcon}
        </button>
      </div>
    `;
  }
}
```

#### 2.2 Extract Search Input Component

**Create:** `components/searchInput.ts` (~60 LOC)

```typescript
@customElement('search-input')
export class SearchInput extends LitElement {
  @property({ type: String }) value = '';
  @property({ type: Boolean }) disabled = false;
  @property({ type: String }) placeholder = 'Search packages...';
  
  private handleInput(e: InputEvent): void {
    const value = (e.target as HTMLInputElement).value;
    this.dispatchEvent(new CustomEvent('input-change', {
      detail: { value },
      bubbles: true,
      composed: true,
    }));
  }
  
  private handleClear(): void {
    this.dispatchEvent(new CustomEvent('input-change', {
      detail: { value: '' },
      bubbles: true,
      composed: true,
    }));
  }
  
  render() {
    return html`
      <div class="input-wrapper">
        <input
          type="text"
          class="search-input"
          .value=${this.value}
          ?disabled=${this.disabled}
          placeholder=${this.placeholder}
          @input=${this.handleInput}
          aria-label="Search packages"
        />
        ${this.value ? html`
          <button
            class="clear-button"
            @click=${this.handleClear}
            aria-label="Clear search"
          >×</button>
        ` : ''}
      </div>
    `;
  }
}
```

#### 2.3 Consolidate Message Handling

**Move to:** Webview-side message handlers (parallel to host-side mediator)

**Create:** `src/webviews/apps/packageBrowser/handlers/`

```typescript
// handlers/searchResponseHandler.ts
export class SearchResponseHandler {
  constructor(
    private searchState: SearchState,
    private updateState: () => void
  ) {}
  
  handle(message: SearchResponseMessage): void {
    if (message.append) {
      this.searchState.appendResults(
        message.results,
        message.totalHits,
        message.hasMore
      );
    } else {
      this.searchState.setResults(
        message.results,
        message.totalHits,
        message.hasMore
      );
    }
    this.searchState.setLoading(false);
    this.updateState();
  }
}

// handlers/index.ts - Registry pattern
export class MessageHandlerRegistry {
  private handlers = new Map<string, (message: any) => void>();
  
  register(type: string, handler: (message: any) => void): void {
    this.handlers.set(type, handler);
  }
  
  handle(message: unknown): void {
    if (!isValidMessage(message)) return;
    const handler = this.handlers.get(message.type);
    handler?.(message);
  }
}
```

**Updated packageBrowser.ts:**

```typescript
@customElement('package-browser-app')
export class PackageBrowserApp extends LitElement {
  private messageRegistry = new MessageHandlerRegistry();
  
  connectedCallback() {
    super.connectedCallback();
    this.setupMessageHandlers();
    this.setupHostListener();
  }
  
  private setupMessageHandlers(): void {
    this.messageRegistry.register('searchResponse',
      new SearchResponseHandler(this.searchState, () => this.updateState(() => {}))
    );
    // ... more handlers
  }
  
  private setupHostListener(): void {
    window.addEventListener('message', (e) => {
      this.messageRegistry.handle(e.data);
    });
  }
}
```

**Reduction:** ~200 LOC of message handling → separate handler classes

---

### Phase 3: Decompose packageDetailsPanel.ts

**Current:** 983 LOC
**Target:** 200-250 LOC orchestration + smaller subcomponents

#### 3.1 Extract Details Header

**Create:** `components/detailsHeader.ts` (~80 LOC)

```typescript
@customElement('details-header')
export class DetailsHeader extends LitElement {
  @property({ type: String }) title = '';
  @property({ type: String }) authors = '';
  @property({ type: String }) iconUrl = '';
  @property({ type: String }) projectUrl = '';
  
  render() {
    return html`
      <div class="header">
        <button class="back-button" @click=${this.handleClose}>
          ← Back
        </button>
        <div class="title-section">
          ${this.iconUrl ? html`
            <img class="icon" src=${this.iconUrl} alt="" />
          ` : ''}
          <div>
            <h2 class="title">${this.title}</h2>
            <p class="authors">${this.authors}</p>
          </div>
        </div>
        ${this.projectUrl ? html`
          <a
            class="project-link"
            href=${this.projectUrl}
            @click=${this.handleOpenLink}
          >View on NuGet</a>
        ` : ''}
      </div>
    `;
  }
  
  private handleClose(): void {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }
  
  private handleOpenLink(e: Event): void {
    e.preventDefault();
    this.dispatchEvent(new CustomEvent('open-link', {
      detail: { url: this.projectUrl },
      bubbles: true,
      composed: true,
    }));
  }
}
```

#### 3.2 Extract Install/Uninstall Actions

**Create:** `components/packageActions.ts` (~120 LOC)

```typescript
@customElement('package-actions')
export class PackageActions extends LitElement {
  @property({ type: String }) packageId = '';
  @property({ type: String }) version = '';
  @property({ type: Array }) selectedProjects: string[] = [];
  @property({ type: Boolean }) installing = false;
  @property({ type: Boolean }) uninstalling = false;
  
  render() {
    const hasSelection = this.selectedProjects.length > 0;
    
    return html`
      <div class="actions">
        <button
          class="install-button"
          @click=${this.handleInstall}
          ?disabled=${!hasSelection || this.installing}
        >
          ${this.installing ? 'Installing...' : `Install ${this.version}`}
        </button>
        <button
          class="uninstall-button"
          @click=${this.handleUninstall}
          ?disabled=${!hasSelection || this.uninstalling}
        >
          ${this.uninstalling ? 'Uninstalling...' : 'Uninstall'}
        </button>
      </div>
    `;
  }
  
  private handleInstall(): void {
    this.dispatchEvent(new CustomEvent('install-request', {
      detail: {
        packageId: this.packageId,
        version: this.version,
        projectPaths: this.selectedProjects,
      },
      bubbles: true,
      composed: true,
    }));
  }
  
  private handleUninstall(): void {
    this.dispatchEvent(new CustomEvent('uninstall-request', {
      detail: {
        packageId: this.packageId,
        projectPaths: this.selectedProjects,
      },
      bubbles: true,
      composed: true,
    }));
  }
}
```

#### 3.3 Refactor packageDetailsPanel.ts

**After extraction:**

```typescript
@customElement('package-details-panel')
export class PackageDetailsPanel extends LitElement {
  @property({ type: Object }) packageData: PackageDetailsData | null = null;
  @property({ type: Boolean, reflect: true }) open = false;
  @property({ type: Array }) cachedProjects: ProjectInfo[] = [];
  
  @state() private selectedVersion: string | null = null;
  @state() private selectedProjects: string[] = [];
  
  private detailsController = new DetailsController(
    this,
    (signal) => this.fetchInstalledStatus(signal)
  );
  
  render() {
    if (!this.packageData || !this.open) return html``;
    
    return html`
      <div class="panel">
        <details-header
          .title=${this.packageData.id}
          .authors=${this.packageData.authors}
          .iconUrl=${this.packageData.iconUrl}
          .projectUrl=${this.packageData.projectUrl}
          @close=${this.handleClose}
        ></details-header>
        
        <version-selector
          .versions=${this.packageData.versions}
          .selectedVersion=${this.selectedVersion}
          @version-selected=${this.handleVersionSelected}
        ></version-selector>
        
        <accordion-section
          title="Dependencies"
          .expanded=${this.dependenciesExpanded}
        >
          <dependency-tree
            .dependencies=${this.packageData.dependencyGroups}
          ></dependency-tree>
        </accordion-section>
        
        <accordion-section title="README" .expanded=${true}>
          <readme-viewer
            .readmeHtml=${this.packageData.readme}
          ></readme-viewer>
        </accordion-section>
        
        <project-selector
          .projects=${this.cachedProjects}
          .packageId=${this.packageData.id}
          @selection-changed=${this.handleSelectionChanged}
        ></project-selector>
        
        <package-actions
          .packageId=${this.packageData.id}
          .version=${this.selectedVersion || this.packageData.versions[0]?.version}
          .selectedProjects=${this.selectedProjects}
          @install-request=${this.handleInstallRequest}
          @uninstall-request=${this.handleUninstallRequest}
        ></package-actions>
      </div>
    `;
  }
}
```

**Reduction:** 983 LOC → ~250 LOC orchestration

---

### Phase 4: Decompose Large Remaining Components

#### 4.1 Break Down project-selector.ts (545 LOC → <200 LOC)

**Extract:** `components/projectListItem.ts` is already separate (309 LOC)

**Further Extract:**
- Batch selection controls → `components/projectBatchControls.ts` (~60 LOC)
- Install status fetching → `controllers/installStatusController.ts`

#### 4.2 Break Down version-selector.ts (512 LOC → <200 LOC)

**Extract:**
- Framework filter UI → `components/frameworkFilter.ts` (~80 LOC)
- Stability badges → Already in `packageBadges.ts` ✅
- Version sorting logic → `utils/versionSort.ts`

---

### Phase 5: Component Testing Infrastructure

#### 5.1 Setup Lit Testing with Bun

**Create:** `test/component/` directory

**Install:** `@lit-labs/testing` (or use Bun's JSDOM)

**Example test:**

```typescript
// components/__tests__/searchInput.test.ts
import { describe, test, expect } from 'bun:test';
import { fixture, html } from '@lit-labs/testing';
import '../searchInput';

describe('SearchInput', () => {
  test('renders with initial value', async () => {
    const el = await fixture(html`
      <search-input value="test"></search-input>
    `);
    
    const input = el.shadowRoot?.querySelector('input');
    expect(input?.value).toBe('test');
  });
  
  test('emits input-change event', async () => {
    const el = await fixture(html`<search-input></search-input>`);
    let emittedValue = '';
    
    el.addEventListener('input-change', (e: any) => {
      emittedValue = e.detail.value;
    });
    
    const input = el.shadowRoot?.querySelector('input')!;
    input.value = 'new value';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    expect(emittedValue).toBe('new value');
  });
});
```

#### 5.2 Prepare for Cypress Component Testing (Future)

**Create:** `cypress.config.ts` (not activated yet)

```typescript
import { defineConfig } from 'cypress';

export default defineConfig({
  component: {
    devServer: {
      framework: 'none',
      bundler: 'vite',
    },
    specPattern: 'src/webviews/**/*.cy.ts',
  },
});
```

**Example component test structure:**

```typescript
// components/__tests__/searchInput.cy.ts
import '../searchInput';

describe('SearchInput Component', () => {
  it('mounts', () => {
    cy.mount('<search-input></search-input>');
    cy.get('search-input').shadow().find('input').should('exist');
  });
  
  it('emits events on input', () => {
    const onInputChange = cy.spy().as('inputChange');
    cy.mount('<search-input></search-input>').then((el) => {
      el.addEventListener('input-change', onInputChange);
    });
    
    cy.get('search-input')
      .shadow()
      .find('input')
      .type('test query');
    
    cy.get('@inputChange').should('have.been.called');
  });
});
```

---

## Migration Strategy

### Step-by-Step Rollout

1. **Phase 1 (Week 1):** Controllers + CSS extraction
   - Create controller infrastructure
   - Extract CSS to `styles/`
   - Update 2-3 components to use controllers
   - **No breaking changes**

2. **Phase 2 (Week 2):** Root app decomposition
   - Extract search-header, search-input
   - Create message handler registry
   - Refactor packageBrowser.ts
   - **Tests pass, UI unchanged**

3. **Phase 3 (Week 3):** Details panel decomposition
   - Extract details-header, package-actions
   - Refactor packageDetailsPanel.ts
   - **Tests pass, UI unchanged**

4. **Phase 4 (Week 4):** Remaining large components
   - Break down project-selector, version-selector
   - **Tests pass, UI unchanged**

5. **Phase 5 (Week 5):** Testing infrastructure
   - Setup component tests
   - Write tests for new components
   - **Cypress setup prepared but not required**

### Backward Compatibility

- ✅ All existing E2E tests continue to pass
- ✅ No changes to IPC message types
- ✅ No changes to host-side code
- ✅ UI behavior identical (refactor only)

### Validation Checkpoints

After each phase:
1. Run `bun test` — all unit tests pass
2. Run `bun run test:e2e` — all E2E tests pass
3. Manual testing in Extension Development Host
4. Check bundle size hasn't increased significantly

---

## Success Metrics

### Code Quality

- ✅ No component >200 LOC
- ✅ All side effects in ReactiveControllers
- ✅ CSS externalized (50+ LOC reduction per component)
- ✅ Message handling consolidated

### Testability

- ✅ Component tests for all new components
- ✅ Controller tests isolated from components
- ✅ Cypress component test infrastructure ready

### Maintainability

- ✅ Clear separation of concerns (presentation, controllers, state, handlers)
- ✅ Reusable components across future webviews
- ✅ Easy to add new features without modifying large files

---

## Open Questions

1. **Virtualization:** Should we add virtual scrolling for large package lists?
   - **Decision:** Defer to Phase 6 performance tuning

2. **Component Library:** Should we create a shared component library for future webviews?
   - **Decision:** Start with package browser, generalize later

3. **State Management:** Should we use a more formal state library (e.g., Zustand, Jotai)?
   - **Decision:** Current state classes are fine, avoid adding dependencies

---

## Next Steps

1. ✅ Review and approve this plan
2. Create Phase 1 implementation branch
3. Scaffold controller infrastructure
4. Begin CSS extraction
5. Implement searchController with tests

---

**Ready to begin implementation?** I can start with Phase 1 (Controllers + CSS extraction) immediately.
