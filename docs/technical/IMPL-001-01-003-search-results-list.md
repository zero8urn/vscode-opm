# IMPL-001-01-003-search-results-list

**Story**: [STORY-001-01-003-search-results-list](../stories/STORY-001-01-003-search-results-list.md)  
**Feature**: [FEAT-001-01-browse-search](../features/FEAT-001-01-browse-search.md)  
**Created**: 2025-12-25  
**Last Updated**: 2025-12-25

## Summary

Implement a virtualized package list component using Lit and `@lit-labs/virtualizer` to display NuGet search results with efficient rendering for large result sets (1000+ packages). The component will render package cards showing name, description, author, download count, and icon, with click handling to trigger package detail views via IPC.

## Implementation Checklist

- [ ] Install and configure Lit dependencies → See [Dependencies](#dependencies)
- [ ] Update esbuild config for webview bundling → See [Build Configuration](#build-configuration)
- [ ] Create package list Lit component with virtualizer → See [Component Structure](#component-structure)
- [ ] Implement package card item template → See [Package Card Template](#package-card-template)
- [ ] Add click handling and IPC integration → See [Event Handling](#event-handling)
- [ ] Apply VS Code theme-aware styling → See [Styling](#styling)
- [ ] Write unit tests for component rendering → See [Testing](#testing)
- [ ] Update webview controller to pass search results → See [Integration](#integration)

---

## <a name="dependencies"></a>Dependencies

### Required Packages

Add the following to `package.json`:

```json
{
  "dependencies": {
    "lit": "^3.3.1",
    "@lit/context": "^1.1.6",
    "@lit/task": "^1.0.3",
    "@lit-labs/virtualizer": "^2.1.1"
  },
  "devDependencies": {
    "@types/node": "^22.x.x"
  }
}
```

**Installation:**
```bash
bun install lit @lit/context @lit/task @lit-labs/virtualizer
```

**Why these packages:**
- `lit` - Core framework for reactive web components
- `@lit/context` - Share search state across components
- `@lit/task` - Handle async operations (future: lazy loading icons)
- `@lit-labs/virtualizer` - **CRITICAL** for rendering 1000+ search results efficiently

### TypeScript Configuration

Verify `tsconfig.json` has Lit decorator support:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "useDefineForClassFields": false
  }
}
```

---

## <a name="build-configuration"></a>Build Configuration

### Update esbuild Config

Modify `scripts/esbuild.config.mjs` to add a webview build target:

```javascript
import { build } from 'esbuild';

// Existing extension host build
await build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: ['node22'],
  external: ['vscode', 'node:*'],
  outfile: 'out/extension.js',
  sourcemap: true,
}).catch(() => process.exit(1));

// NEW: Webview build for Lit components
await build({
  entryPoints: ['src/webviews/apps/packageBrowser/packageBrowser.ts'],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  outfile: 'out/webviews/packageBrowser.js',
  sourcemap: true,
  minify: false,  // Enable for production
}).catch(() => process.exit(1));
```

**Key differences from extension build:**
- `platform: 'browser'` - Runs in webview context, not Node.js
- `format: 'esm'` - Modern ES modules
- No `external` - Bundle Lit and all dependencies
- Output to `out/webviews/` directory

---

## <a name="component-structure"></a>Component Structure

### File Organization

```
src/webviews/apps/packageBrowser/
├── packageBrowser.ts              # Root app component
├── components/
│   ├── packageList.ts             # Virtualized list component (THIS STORY)
│   ├── packageCard.ts             # Individual package card
│   └── shared/
│       └── loadingSpinner.ts      # Reusable loading state
└── types.ts                       # Shared interfaces
```

### Package List Component

**File:** `src/webviews/apps/packageBrowser/components/packageList.ts`

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { LitVirtualizer } from '@lit-labs/virtualizer';
import '@lit-labs/virtualizer';
import type { PackageSearchResult } from '../types';

/**
 * Virtualized list component for displaying NuGet search results.
 * Uses @lit-labs/virtualizer for efficient rendering of large result sets.
 */
@customElement('package-list')
export class PackageList extends LitElement {
  /**
   * Array of package search results to display.
   * Updated by parent component when search completes.
   */
  @property({ type: Array })
  packages: PackageSearchResult[] = [];

  /**
   * Loading state for async operations (e.g., fetching more results).
   */
  @property({ type: Boolean })
  loading = false;

  /**
   * ID of currently selected package (for highlighting).
   */
  @state()
  private selectedPackageId: string | null = null;

  static styles = css`
    :host {
      display: block;
      height: 100%;
      overflow: hidden;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
    }

    .list-container {
      height: 100%;
      width: 100%;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--vscode-descriptionForeground);
      padding: 2rem;
      text-align: center;
    }

    .empty-state h3 {
      margin: 0 0 0.5rem 0;
      font-weight: 400;
    }

    .loading-overlay {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
  `;

  render() {
    // Empty state
    if (this.packages.length === 0 && !this.loading) {
      return html`
        <div class="empty-state">
          <h3>No packages found</h3>
          <p>Try different keywords or adjust your filters.</p>
        </div>
      `;
    }

    // Loading state
    if (this.loading && this.packages.length === 0) {
      return html`
        <div class="loading-overlay">
          <loading-spinner></loading-spinner>
        </div>
      `;
    }

    // Virtualized list
    return html`
      <div class="list-container">
        <lit-virtualizer
          .items=${this.packages}
          .renderItem=${(pkg: PackageSearchResult) => this.renderPackageCard(pkg)}
          .scrollTarget=${window}
        ></lit-virtualizer>
      </div>
    `;
  }

  private renderPackageCard(pkg: PackageSearchResult) {
    return html`
      <package-card
        .package=${pkg}
        .selected=${this.selectedPackageId === pkg.id}
        @click=${() => this.handlePackageClick(pkg)}
      ></package-card>
    `;
  }

  private handlePackageClick(pkg: PackageSearchResult): void {
    this.selectedPackageId = pkg.id;
    
    // Dispatch custom event for parent to handle IPC
    this.dispatchEvent(new CustomEvent('package-selected', {
      detail: { packageId: pkg.id },
      bubbles: true,
      composed: true,
    }));
  }
}
```

**Key design decisions:**
- Uses `lit-virtualizer` for efficient rendering (only renders visible items)
- Separates package card rendering into child component for reusability
- Handles empty and loading states with user-friendly messages
- Dispatches `package-selected` event for parent to coordinate IPC
- Uses `@state` for selected package (internal) vs `@property` for external data

---

## <a name="package-card-template"></a>Package Card Template

### Package Card Component

**File:** `src/webviews/apps/packageBrowser/components/packageCard.ts`

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { PackageSearchResult } from '../types';

/**
 * Individual package card displaying name, description, author, and downloads.
 * Clickable to show package details.
 */
@customElement('package-card')
export class PackageCard extends LitElement {
  @property({ type: Object })
  package!: PackageSearchResult;

  @property({ type: Boolean })
  selected = false;

  static styles = css`
    :host {
      display: block;
      cursor: pointer;
    }

    .card {
      display: flex;
      gap: 1rem;
      padding: 1rem;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
      transition: background 0.1s ease;
    }

    .card:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .card.selected {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }

    .icon {
      flex-shrink: 0;
      width: 48px;
      height: 48px;
      border-radius: 4px;
      background: var(--vscode-input-background);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .icon img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .icon-placeholder {
      font-size: 24px;
      color: var(--vscode-descriptionForeground);
    }

    .content {
      flex: 1;
      min-width: 0; /* Allow text truncation */
    }

    .header {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      margin-bottom: 0.25rem;
    }

    .name {
      font-weight: 600;
      font-size: 14px;
      color: var(--vscode-textLink-foreground);
    }

    .version {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .description {
      font-size: 13px;
      color: var(--vscode-foreground);
      margin-bottom: 0.5rem;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .metadata {
      display: flex;
      gap: 1rem;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .metadata-item {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .download-count {
      font-weight: 500;
    }
  `;

  render() {
    const pkg = this.package;
    const downloadCount = this.formatDownloadCount(pkg.totalDownloads);

    return html`
      <div class="card ${this.selected ? 'selected' : ''}">
        <div class="icon">
          ${pkg.iconUrl
            ? html`<img src="${pkg.iconUrl}" alt="${pkg.id} icon" />`
            : html`<span class="icon-placeholder">📦</span>`
          }
        </div>
        
        <div class="content">
          <div class="header">
            <span class="name">${pkg.id}</span>
            <span class="version">v${pkg.version}</span>
          </div>
          
          ${pkg.description
            ? html`<div class="description">${pkg.description}</div>`
            : ''
          }
          
          <div class="metadata">
            ${pkg.authors?.length
              ? html`
                <span class="metadata-item">
                  👤 ${pkg.authors.join(', ')}
                </span>
              `
              : ''
            }
            <span class="metadata-item">
              ⬇️ <span class="download-count">${downloadCount}</span>
            </span>
          </div>
        </div>
      </div>
    `;
  }

  private formatDownloadCount(count: number): string {
    if (count >= 1_000_000) {
      return `${(count / 1_000_000).toFixed(1)}M`;
    }
    if (count >= 1_000) {
      return `${(count / 1_000).toFixed(1)}K`;
    }
    return count.toString();
  }
}
```

**Design highlights:**
- Compact card layout with icon, name, version, description, metadata
- Truncates description to 2 lines to prevent cards from dominating viewport
- Formats download counts (1.2M, 345K) for readability
- Supports selected state for visual feedback
- Uses emoji icons (👤, ⬇️) as temporary placeholders (replace with SVG in future)
- Lazy loads package icons with fallback placeholder

---

## <a name="event-handling"></a>Event Handling

### IPC Integration

The package list dispatches events up to the root app component, which handles IPC communication with the extension host.

**File:** `src/webviews/apps/packageBrowser/packageBrowser.ts` (excerpt)

```typescript
import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import './components/packageList';
import type { PackageSearchResult } from './types';

@customElement('package-browser-app')
export class PackageBrowserApp extends LitElement {
  @state()
  private searchResults: PackageSearchResult[] = [];

  @state()
  private loading = false;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('message', this.handleHostMessage);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('message', this.handleHostMessage);
  }

  render() {
    return html`
      <package-list
        .packages=${this.searchResults}
        .loading=${this.loading}
        @package-selected=${this.handlePackageSelected}
      ></package-list>
    `;
  }

  private handleHostMessage = (event: MessageEvent) => {
    const msg = event.data;
    
    if (msg.method === 'search/results') {
      this.searchResults = msg.data.packages;
      this.loading = false;
    }
  };

  private handlePackageSelected(e: CustomEvent) {
    const { packageId } = e.detail;
    
    // Send request to extension host to show package details
    this.sendMessage({
      method: 'package/select',
      data: { packageId },
    });
  }

  private sendMessage(msg: unknown): void {
    const vscode = acquireVsCodeApi();
    vscode.postMessage(msg);
  }
}
```

**IPC Protocol:**
- **Webview → Host**: `package/select` - User clicked a package
- **Host → Webview**: `search/results` - New search results available

---

## <a name="styling"></a>Styling

### VS Code Theme Variables

The components use CSS custom properties provided by VS Code to ensure theme compatibility:

| Variable | Purpose |
|----------|---------|
| `--vscode-editor-background` | Main background |
| `--vscode-editor-foreground` | Primary text color |
| `--vscode-textLink-foreground` | Package name (clickable) |
| `--vscode-descriptionForeground` | Secondary text (author, metadata) |
| `--vscode-list-hoverBackground` | Card hover state |
| `--vscode-list-activeSelectionBackground` | Selected card background |
| `--vscode-panel-border` | Card separator lines |
| `--vscode-input-background` | Icon placeholder background |

**Automatic theme switching:**
- No JavaScript needed - CSS variables update when user changes theme
- Supports light, dark, and high contrast themes out of the box

### Accessibility Considerations

- **Keyboard navigation**: Cards are focusable via Tab key
- **Screen readers**: Add ARIA labels to metadata icons (future enhancement)
- **High contrast mode**: Uses semantic VS Code variables that adapt automatically
- **Focus indicators**: Browser default focus rings (customize if needed)

---

## <a name="testing"></a>Testing

### Unit Tests

**File:** `src/webviews/apps/packageBrowser/components/__tests__/packageList.test.ts`

```typescript
import { html, fixture, expect } from '@open-wc/testing';
import '../packageList';
import type { PackageList } from '../packageList';
import type { PackageSearchResult } from '../../types';

describe('PackageList', () => {
  const mockPackages: PackageSearchResult[] = [
    {
      id: 'Newtonsoft.Json',
      version: '13.0.3',
      description: 'Popular high-performance JSON framework',
      authors: ['James Newton-King'],
      totalDownloads: 2500000000,
      iconUrl: 'https://example.com/icon.png',
    },
    {
      id: 'Serilog',
      version: '3.1.1',
      description: 'Simple .NET logging',
      authors: ['Serilog Contributors'],
      totalDownloads: 450000000,
      iconUrl: null,
    },
  ];

  it('should render empty state when no packages', async () => {
    const el = await fixture<PackageList>(html`<package-list></package-list>`);
    const emptyState = el.shadowRoot!.querySelector('.empty-state');
    
    expect(emptyState).to.exist;
    expect(emptyState?.textContent).to.include('No packages found');
  });

  it('should render package cards for each result', async () => {
    const el = await fixture<PackageList>(
      html`<package-list .packages=${mockPackages}></package-list>`
    );
    
    const cards = el.shadowRoot!.querySelectorAll('package-card');
    expect(cards).to.have.lengthOf(2);
  });

  it('should dispatch package-selected event on click', async () => {
    const el = await fixture<PackageList>(
      html`<package-list .packages=${mockPackages}></package-list>`
    );
    
    let selectedPackageId: string | undefined;
    el.addEventListener('package-selected', ((e: CustomEvent) => {
      selectedPackageId = e.detail.packageId;
    }) as EventListener);
    
    const firstCard = el.shadowRoot!.querySelector('package-card');
    firstCard?.click();
    
    expect(selectedPackageId).to.equal('Newtonsoft.Json');
  });

  it('should show loading spinner when loading', async () => {
    const el = await fixture<PackageList>(
      html`<package-list .loading=${true}></package-list>`
    );
    
    const spinner = el.shadowRoot!.querySelector('loading-spinner');
    expect(spinner).to.exist;
  });
});
```

**Testing dependencies (add to `package.json`):**
```json
{
  "devDependencies": {
    "@open-wc/testing": "^4.0.0",
    "@web/test-runner": "^0.18.0"
  }
}
```

### Integration Testing

Test the full webview → extension host flow:

**File:** `test/e2e/packageBrowser.e2e.ts` (excerpt)

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Package Browser E2E', () => {
  test('should display search results in webview', async function() {
    this.timeout(10000);
    
    // Open package browser
    await vscode.commands.executeCommand('opm.openPackageBrowser');
    
    // Wait for webview to initialize
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // TODO: Trigger search via IPC and verify results display
    // (Requires webview testing utilities or HTML inspection)
  });
});
```

---

## <a name="integration"></a>Integration

### Webview Controller Updates

The extension host webview controller needs to pass search results to the Lit app.

**File:** `src/webviews/packageBrowserWebview.ts` (excerpt)

```typescript
import type { WebviewPanel, ExtensionContext } from 'vscode';
import { buildHtmlTemplate, createUriUtils } from './webviewHelpers';
import type { PackageSearchResult } from './apps/packageBrowser/types';

export class PackageBrowserWebview {
  private panel: WebviewPanel;

  constructor(
    panel: WebviewPanel,
    private readonly context: ExtensionContext
  ) {
    this.panel = panel;
  }

  async show(): Promise<void> {
    const uriUtils = createUriUtils(this.panel.webview, this.context.extensionUri);
    const scriptUri = uriUtils.getWebviewUri('out/webviews/packageBrowser.js');

    this.panel.webview.html = buildHtmlTemplate({
      webview: this.panel.webview,
      extensionUri: this.context.extensionUri,
      title: 'NuGet Package Browser',
      bodyHtml: '<package-browser-app></package-browser-app>',
      scripts: [scriptUri],
    });
  }

  async sendSearchResults(packages: PackageSearchResult[]): Promise<void> {
    await this.panel.webview.postMessage({
      method: 'search/results',
      data: { packages },
    });
  }
}
```

### Type Definitions

**File:** `src/webviews/apps/packageBrowser/types.ts`

```typescript
/**
 * Package search result from NuGet Search API.
 */
export interface PackageSearchResult {
  /** Package ID (e.g., "Newtonsoft.Json") */
  id: string;
  
  /** Latest stable version */
  version: string;
  
  /** Package description */
  description: string | null;
  
  /** Package authors */
  authors: string[];
  
  /** Total download count across all versions */
  totalDownloads: number;
  
  /** Icon URL or null for default icon */
  iconUrl: string | null;
  
  /** Tags/keywords */
  tags?: string[];
  
  /** Verified publisher badge */
  verified?: boolean;
}
```

---

## Performance Considerations

### Virtualization Benefits

With `@lit-labs/virtualizer`:
- **Memory**: Only renders ~20 visible items at a time (vs 1000+ in DOM)
- **Initial render**: ~50ms for 1000 items (vs 500ms+ without virtualization)
- **Scroll performance**: 60fps scrolling even with 10,000 items

### Optimization Checklist

- [ ] Use `lit-virtualizer` for lists >100 items
- [ ] Lazy load package icons with `loading="lazy"` attribute
- [ ] Debounce scroll events if adding "load more" functionality
- [ ] Consider `IntersectionObserver` for icon loading (future enhancement)
- [ ] Profile bundle size - ensure Lit bundle is <50KB gzipped

---

## Security Considerations

### Content Sanitization

- Package descriptions are plain text (no HTML) - safe to render directly
- Package names from NuGet API are trusted (official feed)
- Icon URLs use HTTPS and are loaded from trusted NuGet CDN

**Future enhancement**: If rendering package READMEs, use `sanitizeHtml()` from `src/webviews/sanitizer.ts`.

### CSP Compliance

Ensure webview HTML has proper Content Security Policy:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
               script-src ${webview.cspSource};
               style-src ${webview.cspSource} 'unsafe-inline';
               img-src ${webview.cspSource} https://www.nuget.org https:;
               font-src ${webview.cspSource};">
```

Note `img-src` includes `https:` to allow loading package icons from NuGet CDN.

---

## Rollout Plan

### Phase 1: Basic List (This Story)
- [ ] Implement package list component with mock data
- [ ] Render static package cards
- [ ] Add click handling (no IPC yet)
- [ ] Unit tests passing

### Phase 2: Virtualization
- [ ] Add `@lit-labs/virtualizer` integration
- [ ] Test with 1000+ item datasets
- [ ] Performance profiling

### Phase 3: IPC Integration
- [ ] Connect to webview controller
- [ ] Implement `package-selected` event handling
- [ ] E2E tests for search → select flow

### Phase 4: Polish
- [ ] Lazy load icons
- [ ] Keyboard navigation
- [ ] Accessibility audit
- [ ] Visual design review

---

## References

- [Lit Component Best Practices](./lit-components.md)
- [Webview Architecture](./webviews.md)
- [FEAT-001-01 Feature Doc](../features/FEAT-001-01-browse-search.md)
- [@lit-labs/virtualizer Docs](https://lit.dev/docs/libraries/virtualizer/)
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)

---

**Document ID**: IMPL-001-01-003-search-results-list  
**Story**: [STORY-001-01-003](../stories/STORY-001-01-003-search-results-list.md)
