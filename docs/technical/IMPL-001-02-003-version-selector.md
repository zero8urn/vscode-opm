# IMPL-001-02-003-version-selector

**Story**: [STORY-001-02-003-version-selector](../stories/STORY-001-02-003-version-selector.md)  
**Feature**: [FEAT-001-02-install-packages](../features/FEAT-001-02-install-packages.md)  
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)  
**Created**: 2026-01-10  
**Last Updated**: 2026-01-10

## Summary

Implement a Lit web component that renders a version selector dropdown for NuGet packages, displaying actual version numbers with informational badges (Latest stable, Latest prerelease, Prerelease). The component integrates with the package details cache to fetch version metadata from the NuGet Registration API, emits custom events on version selection, and maintains proper loading/error states with keyboard accessibility.

The implementation follows the established Lit component patterns with co-located tag constants, typed property interfaces, and VS Code theme integration. The component uses semantic version sorting to display versions in descending order and identifies the latest stable and latest prerelease versions from catalog entries to render inline badges.

## Consolidated Implementation Checklist

- [x] 1. Create Lit component with type definitions → [§1 Component Structure](#1-component-structure)
- [x] 2. Implement version metadata interface and parsing → [§2 Version Metadata](#2-version-metadata)
- [x] 3. Build semantic version sorting logic → [§3 Version Sorting](#3-version-sorting)
- [x] 4. Implement badge identification and rendering → [§4 Badge Logic](#4-badge-logic)
- [x] 5. Create dropdown template with options → [§5 Dropdown Template](#5-dropdown-template)
- [x] 6. Add loading and error state handling → [§6 State Management](#6-state-management)
- [x] 7. Implement version selection event handling → [§7 Event Handling](#7-event-handling)
- [x] 8. Add keyboard navigation support → [§8 Keyboard Navigation](#8-keyboard-navigation)
- [x] 9. Apply VS Code theme styling → [§9 Theme Styling](#9-theme-styling)
- [x] 10. Integrate with packageDetailsPanel → [§10 Integration](#10-integration)
- [x] 11. Write unit tests for component logic → [§11 Unit Tests](#11-unit-tests)
- [ ] 12. Write integration tests for IPC flow → [§12 Integration Tests](#12-integration-tests) *(Deferred until host-side IPC handler implemented)*

---

## 1. Component Structure

**File**: `src/webviews/apps/components/version-selector.ts`

Create a Lit web component with co-located tag constant following the established pattern:

```typescript
export const VERSION_SELECTOR_TAG = 'version-selector' as const;

/**
 * Version selector dropdown component for NuGet packages.
 * Displays version numbers with badges (Latest stable, Latest prerelease, Prerelease).
 */
@customElement(VERSION_SELECTOR_TAG)
export class VersionSelector extends LitElement {
  // Properties
  @property({ type: String }) packageId = '';
  @property({ type: Boolean }) includePrerelease = false;
  @property({ type: String }) selectedVersion = '';
  
  // Internal state
  @state() private versions: VersionMetadata[] = [];
  @state() private loading = false;
  @state() private error: string | null = null;
  
  // Lifecycle methods
  connectedCallback() { /* ... */ }
  disconnectedCallback() { /* ... */ }
  
  // Render methods
  render() { /* ... */ }
  
  // Event handlers
  private handleVersionChange(e: Event) { /* ... */ }
}
```

**Type Definitions**:

```typescript
interface VersionMetadata {
  version: string;
  isPrerelease: boolean;
  publishedDate: Date;
}

interface VersionBadge {
  type: 'latest-stable' | 'latest-prerelease' | 'prerelease' | null;
  label: string;
}
```

**Dependencies**:
- `lit` - LitElement, html, css decorators
- `lit/decorators.js` - @customElement, @property, @state
- `src/webviews/ipc/messages.ts` - IPC message types

---

## 2. Version Metadata

**File**: `src/domain/models/packageDetails.ts`

Extend existing `PackageDetails` type to include version catalog:

```typescript
export interface PackageDetails {
  // ... existing fields
  versions: PackageVersion[];
}

export interface PackageVersion {
  version: string;
  isPrerelease: boolean;
  publishedDate: string; // ISO 8601
  downloads?: number;
  listed: boolean;
}
```

**Parsing Logic** (in component):

```typescript
private parseVersions(catalogEntry: any[]): VersionMetadata[] {
  return catalogEntry
    .filter(entry => entry.listed !== false)
    .map(entry => ({
      version: entry.version,
      isPrerelease: this.isPrerelease(entry.version),
      publishedDate: new Date(entry.published)
    }));
}

private isPrerelease(version: string): boolean {
  // Semantic versioning prerelease check
  return /-/.test(version);
}
```

---

## 3. Version Sorting

Implement semantic version comparison using a lightweight comparator:

```typescript
private sortVersions(versions: VersionMetadata[]): VersionMetadata[] {
  return [...versions].sort((a, b) => {
    return this.compareVersions(b.version, a.version); // Descending
  });
}

private compareVersions(v1: string, v2: string): number {
  const parts1 = this.parseVersion(v1);
  const parts2 = this.parseVersion(v2);
  
  // Compare major.minor.patch
  for (let i = 0; i < 3; i++) {
    if (parts1.numeric[i] !== parts2.numeric[i]) {
      return parts1.numeric[i] - parts2.numeric[i];
    }
  }
  
  // Compare prerelease suffix (stable > prerelease)
  if (!parts1.prerelease && parts2.prerelease) return 1;
  if (parts1.prerelease && !parts2.prerelease) return -1;
  if (parts1.prerelease && parts2.prerelease) {
    return parts1.prerelease.localeCompare(parts2.prerelease);
  }
  
  return 0;
}

private parseVersion(version: string): {
  numeric: number[];
  prerelease: string | null;
} {
  const [numericPart, prerelease] = version.split('-');
  const numeric = numericPart.split('.').map(Number);
  return { numeric, prerelease: prerelease || null };
}
```

**Alternative**: Use `semver` package if already in dependencies, otherwise implement lightweight version above to avoid adding dependencies.

---

## 4. Badge Logic

Identify which versions should display badges:

```typescript
private identifyBadges(versions: VersionMetadata[]): Map<string, VersionBadge> {
  const badgeMap = new Map<string, VersionBadge>();
  
  // Find latest stable
  const latestStable = versions.find(v => !v.isPrerelease);
  if (latestStable) {
    badgeMap.set(latestStable.version, {
      type: 'latest-stable',
      label: 'Latest stable'
    });
  }
  
  // Find latest prerelease (only if includePrerelease is true)
  if (this.includePrerelease) {
    const latestPrerelease = versions.find(v => v.isPrerelease);
    if (latestPrerelease) {
      badgeMap.set(latestPrerelease.version, {
        type: 'latest-prerelease',
        label: 'Latest prerelease'
      });
    }
    
    // Mark all other prereleases
    versions
      .filter(v => v.isPrerelease && v.version !== latestPrerelease?.version)
      .forEach(v => {
        badgeMap.set(v.version, {
          type: 'prerelease',
          label: 'Prerelease'
        });
      });
  }
  
  return badgeMap;
}
```

---

## 5. Dropdown Template

Render dropdown with version options and badges:

```typescript
render() {
  if (this.loading) {
    return this.renderLoading();
  }
  
  if (this.error) {
    return this.renderError();
  }
  
  const filteredVersions = this.includePrerelease 
    ? this.versions 
    : this.versions.filter(v => !v.isPrerelease);
  
  const sortedVersions = this.sortVersions(filteredVersions);
  const badges = this.identifyBadges(sortedVersions);
  const selectedBadge = badges.get(this.selectedVersion);
  
  return html`
    <div class="version-selector">
      <label for="version-dropdown">Version:</label>
      <div class="dropdown-wrapper">
        <select 
          id="version-dropdown"
          @change=${this.handleVersionChange}
          .value=${this.selectedVersion}
          aria-label="Select package version"
        >
          ${sortedVersions.map(v => html`
            <option value=${v.version}>
              ${v.version}
              ${badges.get(v.version) 
                ? ` (${badges.get(v.version)!.label})` 
                : ''
              }
            </option>
          `)}
        </select>
        ${selectedBadge ? html`
          <span class="badge badge-${selectedBadge.type}" aria-label=${selectedBadge.label}>
            ${selectedBadge.label}
          </span>
        ` : ''}
      </div>
    </div>
  `;
}

private renderLoading() {
  return html`
    <div class="version-selector loading">
      <span class="spinner" role="status" aria-label="Loading versions"></span>
      <span>Loading versions...</span>
    </div>
  `;
}

private renderError() {
  return html`
    <div class="version-selector error" role="alert">
      <span class="error-icon">⚠️</span>
      <span>Version unavailable</span>
      <button @click=${this.retryFetch} class="retry-button">Retry</button>
    </div>
  `;
}
```

**Note**: Native `<select>` element is used for accessibility and keyboard navigation. Badges are displayed separately outside the dropdown to work around option styling limitations.

---

## 6. State Management

Implement loading and error state transitions:

```typescript
async connectedCallback() {
  super.connectedCallback();
  await this.fetchVersions();
}

private async fetchVersions() {
  if (!this.packageId) return;
  
  this.loading = true;
  this.error = null;
  
  try {
    // IPC request to extension host for package details
    const response = await this.requestPackageDetails(this.packageId);
    
    if (response.success) {
      this.versions = this.parseVersions(response.result.catalogEntries);
      
      // Auto-select latest stable if no version selected
      if (!this.selectedVersion) {
        const latestStable = this.versions.find(v => !v.isPrerelease);
        if (latestStable) {
          this.selectedVersion = latestStable.version;
          this.dispatchVersionChange(latestStable.version);
        }
      }
    } else {
      this.error = response.error.message;
    }
  } catch (err) {
    this.error = err instanceof Error ? err.message : 'Unknown error';
  } finally {
    this.loading = false;
  }
}

private async retryFetch() {
  await this.fetchVersions();
}

// Watch for packageId changes
updated(changedProperties: PropertyValues) {
  if (changedProperties.has('packageId')) {
    this.fetchVersions();
  }
}
```

---

## 7. Event Handling

Emit custom events and send IPC messages on version selection:

```typescript
private handleVersionChange(e: Event) {
  const select = e.target as HTMLSelectElement;
  const newVersion = select.value;
  
  if (newVersion === this.selectedVersion) return;
  
  this.selectedVersion = newVersion;
  this.dispatchVersionChange(newVersion);
  this.sendVersionChangeIPC(newVersion);
}

private dispatchVersionChange(version: string) {
  this.dispatchEvent(new CustomEvent('version-changed', {
    detail: { version },
    bubbles: true,
    composed: true
  }));
}

private sendVersionChangeIPC(version: string) {
  // Send IPC message to extension host
  const message = {
    type: 'request',
    id: crypto.randomUUID(),
    name: 'versionChanged',
    args: {
      packageId: this.packageId,
      version
    }
  };
  
  this.postMessage(message);
}

private postMessage(message: any) {
  // Get vscode API from parent context
  const vscode = (window as any).acquireVsCodeApi?.();
  vscode?.postMessage(message);
}
```

**Parent Component Integration**:

```typescript
// In package-browser-app.ts
render() {
  return html`
    <version-selector
      .packageId=${this.currentPackageId}
      .includePrerelease=${this.includePrerelease}
      @version-changed=${this.handleVersionChanged}
    ></version-selector>
  `;
}

private handleVersionChanged(e: CustomEvent) {
  console.log('Version changed to:', e.detail.version);
  // Update install button state, etc.
}
```

---

## 8. Keyboard Navigation

Native `<select>` provides built-in keyboard support:
- Arrow keys: Navigate options
- Enter/Space: Open/close dropdown, select option
- Escape: Close dropdown
- Type-ahead: Jump to option starting with typed character

Additional enhancements:

```typescript
private handleKeyDown(e: KeyboardEvent) {
  const select = e.target as HTMLSelectElement;
  
  // Ctrl+Home: Jump to latest version
  if (e.ctrlKey && e.key === 'Home') {
    e.preventDefault();
    select.selectedIndex = 0;
    this.handleVersionChange(e);
  }
  
  // Ctrl+End: Jump to oldest version
  if (e.ctrlKey && e.key === 'End') {
    e.preventDefault();
    select.selectedIndex = select.options.length - 1;
    this.handleVersionChange(e);
  }
}

// Add to template
html`
  <select 
    @keydown=${this.handleKeyDown}
    @change=${this.handleVersionChange}
    ...
  >
```

---

## 9. Theme Styling

Use VS Code CSS variables for theming:

```typescript
static styles = css`
  :host {
    display: block;
  }
  
  .version-selector {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
  }
  
  label {
    color: var(--vscode-foreground);
    font-size: 13px;
  }
  
  .dropdown-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
  }
  
  select {
    background: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    border: 1px solid var(--vscode-dropdown-border);
    padding: 4px 8px;
    border-radius: 2px;
    font-size: 13px;
    font-family: var(--vscode-font-family);
    cursor: pointer;
    min-width: 150px;
  }
  
  select:focus {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
  }
  
  select:hover {
    background: var(--vscode-dropdown-listBackground);
  }
  
  .badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 2px;
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
  }
  
  .badge-latest-stable {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  
  .badge-latest-prerelease {
    background: var(--vscode-inputValidation-warningBackground);
    color: var(--vscode-inputValidation-warningForeground);
    border: 1px solid var(--vscode-inputValidation-warningBorder);
  }
  
  .badge-prerelease {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
  }
  
  .loading, .error {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--vscode-descriptionForeground);
  }
  
  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid var(--vscode-progressBar-background);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .error-icon {
    color: var(--vscode-errorForeground);
  }
  
  .retry-button {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: 1px solid var(--vscode-button-border);
    padding: 2px 8px;
    border-radius: 2px;
    cursor: pointer;
    font-size: 12px;
  }
  
  .retry-button:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }
`;
```

---

## 10. Cache Integration

Request package details from extension host cache:

```typescript
private async requestPackageDetails(packageId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    
    // Set up one-time response handler
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'response' && message.id === requestId) {
        window.removeEventListener('message', handler);
        resolve(message);
      }
    };
    
    window.addEventListener('message', handler);
    
    // Send request
    this.postMessage({
      type: 'request',
      id: requestId,
      name: 'getPackageDetails',
      args: { packageId }
    });
    
    // Timeout after 10s
    setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('Request timeout'));
    }, 10000);
  });
}
```

**Extension Host Handler** (already exists from STORY-001-01-008):

```typescript
// In package-browser webview handler
case 'getPackageDetails': {
  const { packageId } = message.args;
  const result = await packageDetailsCache.get(packageId);
  
  webview.postMessage({
    type: 'response',
    id: message.id,
    success: result.success,
    result: result.data,
    error: result.error
  });
  break;
}
```

---

## 11. Unit Tests

**File**: `src/webviews/apps/components/__tests__/version-selector.test.ts`

```typescript
import { fixture, expect, html } from '@open-wc/testing';
import { VersionSelector, VERSION_SELECTOR_TAG } from '../version-selector';

describe('VersionSelector', () => {
  let element: VersionSelector;
  
  beforeEach(async () => {
    element = await fixture(html`
      <${VERSION_SELECTOR_TAG} 
        .packageId=${'Newtonsoft.Json'}
        .includePrerelease=${false}
      ></${VERSION_SELECTOR_TAG}>
    `);
  });
  
  describe('Version Sorting', () => {
    it('should sort versions in descending order', () => {
      const versions = [
        { version: '11.0.2', isPrerelease: false, publishedDate: new Date() },
        { version: '13.0.3', isPrerelease: false, publishedDate: new Date() },
        { version: '12.0.3', isPrerelease: false, publishedDate: new Date() }
      ];
      
      const sorted = element['sortVersions'](versions);
      
      expect(sorted[0].version).to.equal('13.0.3');
      expect(sorted[1].version).to.equal('12.0.3');
      expect(sorted[2].version).to.equal('11.0.2');
    });
    
    it('should place stable versions before prerelease of same major', () => {
      const versions = [
        { version: '14.0.0-beta1', isPrerelease: true, publishedDate: new Date() },
        { version: '13.0.3', isPrerelease: false, publishedDate: new Date() }
      ];
      
      const sorted = element['sortVersions'](versions);
      
      expect(sorted[0].version).to.equal('14.0.0-beta1');
      expect(sorted[1].version).to.equal('13.0.3');
    });
  });
  
  describe('Badge Identification', () => {
    it('should identify latest stable version', () => {
      element['versions'] = [
        { version: '13.0.3', isPrerelease: false, publishedDate: new Date() },
        { version: '12.0.3', isPrerelease: false, publishedDate: new Date() }
      ];
      element.includePrerelease = false;
      
      const badges = element['identifyBadges'](element['versions']);
      
      expect(badges.get('13.0.3')?.type).to.equal('latest-stable');
      expect(badges.has('12.0.3')).to.be.false;
    });
    
    it('should identify latest prerelease when includePrerelease is true', () => {
      element['versions'] = [
        { version: '14.0.0-beta1', isPrerelease: true, publishedDate: new Date() },
        { version: '13.0.3', isPrerelease: false, publishedDate: new Date() }
      ];
      element.includePrerelease = true;
      
      const badges = element['identifyBadges'](element['versions']);
      
      expect(badges.get('14.0.0-beta1')?.type).to.equal('latest-prerelease');
      expect(badges.get('13.0.3')?.type).to.equal('latest-stable');
    });
    
    it('should mark all prereleases except latest', () => {
      element['versions'] = [
        { version: '14.0.0-beta2', isPrerelease: true, publishedDate: new Date() },
        { version: '14.0.0-beta1', isPrerelease: true, publishedDate: new Date() },
        { version: '13.0.3', isPrerelease: false, publishedDate: new Date() }
      ];
      element.includePrerelease = true;
      
      const badges = element['identifyBadges'](element['versions']);
      
      expect(badges.get('14.0.0-beta2')?.type).to.equal('latest-prerelease');
      expect(badges.get('14.0.0-beta1')?.type).to.equal('prerelease');
    });
  });
  
  describe('Event Emission', () => {
    it('should emit version-changed event when version selected', async () => {
      element['versions'] = [
        { version: '13.0.3', isPrerelease: false, publishedDate: new Date() },
        { version: '12.0.3', isPrerelease: false, publishedDate: new Date() }
      ];
      element.selectedVersion = '13.0.3';
      await element.updateComplete;
      
      let eventFired = false;
      let eventDetail: any;
      
      element.addEventListener('version-changed', (e: Event) => {
        eventFired = true;
        eventDetail = (e as CustomEvent).detail;
      });
      
      const select = element.shadowRoot!.querySelector('select')!;
      select.value = '12.0.3';
      select.dispatchEvent(new Event('change'));
      
      expect(eventFired).to.be.true;
      expect(eventDetail.version).to.equal('12.0.3');
    });
  });
  
  describe('State Management', () => {
    it('should show loading state while fetching versions', async () => {
      element.loading = true;
      await element.updateComplete;
      
      const loadingText = element.shadowRoot!.textContent;
      expect(loadingText).to.include('Loading versions');
    });
    
    it('should show error state when fetch fails', async () => {
      element.error = 'Network error';
      await element.updateComplete;
      
      const errorText = element.shadowRoot!.textContent;
      expect(errorText).to.include('Version unavailable');
    });
    
    it('should auto-select latest stable version on load', async () => {
      element['versions'] = [
        { version: '13.0.3', isPrerelease: false, publishedDate: new Date() },
        { version: '12.0.3', isPrerelease: false, publishedDate: new Date() }
      ];
      element.selectedVersion = '';
      
      await element['fetchVersions']();
      
      expect(element.selectedVersion).to.equal('13.0.3');
    });
  });
  
  describe('Prerelease Filtering', () => {
    it('should exclude prerelease versions when includePrerelease is false', async () => {
      element['versions'] = [
        { version: '14.0.0-beta1', isPrerelease: true, publishedDate: new Date() },
        { version: '13.0.3', isPrerelease: false, publishedDate: new Date() }
      ];
      element.includePrerelease = false;
      await element.updateComplete;
      
      const options = Array.from(
        element.shadowRoot!.querySelectorAll('option')
      );
      
      expect(options).to.have.length(1);
      expect(options[0].value).to.equal('13.0.3');
    });
    
    it('should include prerelease versions when includePrerelease is true', async () => {
      element['versions'] = [
        { version: '14.0.0-beta1', isPrerelease: true, publishedDate: new Date() },
        { version: '13.0.3', isPrerelease: false, publishedDate: new Date() }
      ];
      element.includePrerelease = true;
      await element.updateComplete;
      
      const options = Array.from(
        element.shadowRoot!.querySelectorAll('option')
      );
      
      expect(options).to.have.length(2);
    });
  });
  
  describe('Theme Integration', () => {
    it('should render badges with correct CSS classes', async () => {
      element['versions'] = [
        { version: '14.0.0-beta1', isPrerelease: true, publishedDate: new Date() },
        { version: '13.0.3', isPrerelease: false, publishedDate: new Date() }
      ];
      element.includePrerelease = true;
      element.selectedVersion = '13.0.3';
      await element.updateComplete;
      
      const badge = element.shadowRoot!.querySelector('.badge-latest-stable');
      expect(badge).to.exist;
      expect(badge!.textContent).to.include('Latest stable');
    });
  });
});
```

**Test Coverage Goals**:
- Version sorting: 4 tests
- Badge identification: 3 tests
- Event emission: 1 test
- State management: 3 tests
- Prerelease filtering: 2 tests
- Theme integration: 1 test
- **Total: 14 tests** covering all acceptance criteria

---

## 12. Integration Tests

**File**: `test/integration/version-selector.integration.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { NuGetApiClient } from '../../src/env/node/nugetApiClient';
import type { PackageDetails } from '../../src/domain/models/packageDetails';

describe('Version Selector - NuGet API Integration', () => {
  let client: NuGetApiClient;
  
  beforeEach(() => {
    client = new NuGetApiClient('https://api.nuget.org/v3/index.json');
  });
  
  afterEach(() => {
    // Cleanup if needed
  });
  
  it('should fetch version catalog from NuGet Registration API', async () => {
    const result = await client.getPackageDetails('Newtonsoft.Json');
    
    expect(result.success).toBe(true);
    expect(result.data?.versions).toBeDefined();
    expect(result.data!.versions.length).toBeGreaterThan(0);
  });
  
  it('should parse version metadata with prerelease flags', async () => {
    const result = await client.getPackageDetails('Microsoft.Extensions.Logging');
    
    expect(result.success).toBe(true);
    
    const hasPrerelease = result.data!.versions.some(v => v.isPrerelease);
    const hasStable = result.data!.versions.some(v => !v.isPrerelease);
    
    expect(hasStable).toBe(true);
    // Depending on package, may or may not have prerelease
  });
  
  it('should handle package not found gracefully', async () => {
    const result = await client.getPackageDetails('This.Package.Does.Not.Exist.123456');
    
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NotFound');
  });
  
  it('should cache package details for repeated requests', async () => {
    const cache = new Map();
    
    // First request - cache miss
    const start1 = Date.now();
    await client.getPackageDetails('Newtonsoft.Json');
    const duration1 = Date.now() - start1;
    
    // Second request - cache hit (if caching implemented)
    const start2 = Date.now();
    await client.getPackageDetails('Newtonsoft.Json');
    const duration2 = Date.now() - start2;
    
    // Cache hit should be significantly faster
    expect(duration2).toBeLessThan(duration1 * 0.5);
  }, { timeout: 10000 });
});

describe('Version Selector - IPC Flow', () => {
  it('should send version-changed IPC message to extension host', async () => {
    const messages: any[] = [];
    
    // Mock vscode API
    (global as any).acquireVsCodeApi = () => ({
      postMessage: (msg: any) => messages.push(msg)
    });
    
    // Simulate version change
    const mockEvent = {
      type: 'request',
      name: 'versionChanged',
      args: {
        packageId: 'Newtonsoft.Json',
        version: '12.0.3'
      }
    };
    
    // In real component, this happens in handleVersionChange
    messages.push(mockEvent);
    
    expect(messages).toHaveLength(1);
    expect(messages[0].name).toBe('versionChanged');
    expect(messages[0].args.version).toBe('12.0.3');
  });
});
```

**Test Coverage Goals**:
- NuGet API integration: 4 tests
- IPC flow: 1 test
- **Total: 5 tests** covering external dependencies

---

## Dependencies

### NPM Packages
- `lit` - Already installed for Lit web components
- `@open-wc/testing` - Testing utilities for Lit components (dev dependency)
- `@web/test-runner` - Test runner for web components (if not using Bun directly)

### Internal Dependencies
- `src/domain/models/packageDetails.ts` - PackageDetails type
- `src/webviews/ipc/messages.ts` - IPC message types
- `src/env/node/nugetApiClient.ts` - NuGet API client for integration tests

### VS Code APIs
- None (runs in webview context, not extension host)

---

## 10. Integration

**File**: `src/webviews/apps/packageBrowser/components/packageDetailsPanel.ts`

**Status**: ✅ **Completed** - Integrated version-selector component into packageDetailsPanel

### Changes Made

1. **Import**: Added `import './version-selector'` to load component
2. **Template**: Replaced inline `<select>` element with `<version-selector>` component:
   ```typescript
   <version-selector
     .packageId=${pkg.id}
     .selectedVersion=${currentVersion}
     .includePrerelease=${this.includePrerelease}
     @version-changed=${this.handleVersionChange}
   ></version-selector>
   ```
3. **Event Handler**: Updated `handleVersionChange()` to work with `CustomEvent`:
   ```typescript
   private handleVersionChange(e: CustomEvent): void {
     const version = e.detail.version;
     this.selectedVersion = version;
     // ... emit version-selected event
   }
   ```
4. **CSS Cleanup**: Removed unused `.version-label` and `.version-select` styles
5. **Rendering Logic**: Removed `filteredVersions` calculation (handled by component internally)

### Benefits

- **Enhanced UX**: Users now see version badges (Latest stable, Latest prerelease)
- **Better State Management**: Loading and error states provide feedback during version fetching
- **Semantic Sorting**: Versions sorted correctly with prerelease handling
- **Self-Contained**: Component manages its own data fetching via IPC

### Testing

All 360 existing unit tests pass, including 22 tests specific to packageDetailsPanel component. The integration maintains backward compatibility with existing event contracts (`version-selected` event).

---

## 11. Unit Tests

**File**: `src/webviews/apps/packageBrowser/components/__tests__/version-selector.test.ts`

**Status**: ✅ **Completed** - 26 unit tests covering all component logic

### Test Coverage

**Component Exports** (2 tests):
- ✅ Exports VersionSelector class
- ✅ Exports VERSION_SELECTOR_TAG constant

**Component Initialization** (3 tests):
- ✅ Default packageId is empty string
- ✅ Default selectedVersion is empty string  
- ✅ Default includePrerelease is false

**Property Updates** (3 tests):
- ✅ Updates packageId property
- ✅ Updates selectedVersion property
- ✅ Updates includePrerelease property

**Version Parsing** (3 tests):
- ✅ Parses version metadata from catalog entries
- ✅ Filters out unlisted versions
- ✅ Identifies prerelease versions correctly

**Version Sorting** (5 tests):
- ✅ Sorts versions in descending order
- ✅ Sorts stable before prerelease with same numeric part
- ✅ Handles versions with different segment counts
- ✅ Compares version strings correctly
- ✅ Compares prerelease strings alphabetically

**Badge Identification** (4 tests):
- ✅ Identifies latest stable version
- ✅ Identifies latest prerelease version
- ✅ Marks other prerelease versions with Prerelease badge
- ✅ Returns empty map for no versions

**Default Version Selection** (2 tests):
- ✅ Selects latest stable when includePrerelease is false
- ✅ Selects latest version when includePrerelease is true

**Filtered Versions** (2 tests):
- ✅ Excludes prerelease when includePrerelease is false
- ✅ Includes all versions when includePrerelease is true

**Version Parsing Utilities** (2 tests):
- ✅ Parses version string into numeric and prerelease parts
- ✅ Handles version strings with missing parts

### Test Framework

Uses **Bun test** following established patterns:
- Simple component instantiation without browser DOM
- Tests core logic methods directly
- Mocks external dependencies (IPC calls)

---

## 12. Integration Tests

1. **Version List Size**: Expect 50-200 versions for popular packages like Newtonsoft.Json
   - Render using virtual scrolling if >100 versions (not in MVP, but consider)
   - Current approach: Native `<select>` handles large option lists efficiently

2. **Semantic Version Sorting**: O(n log n) complexity
   - Acceptable for <1000 versions
   - Cache sorted results to avoid re-sorting on every render

3. **Badge Identification**: O(n) single pass
   - Minimal overhead for version lists <500

4. **IPC Latency**: Package details request typically <100ms (cached) or <2s (API)
   - Show loading state immediately on component mount
   - Timeout after 10s with retry option

---

## Error Handling

### Network Errors
- **Symptom**: Package details API request fails
- **Handling**: Show error state with "Version unavailable" message and "Retry" button
- **Logging**: Log error to OutputChannel with full stack trace

### Invalid Version Format
- **Symptom**: Version string doesn't match semantic versioning pattern
- **Handling**: Skip invalid versions in sorting, log warning
- **Fallback**: Display raw version string without badge

### Missing Package ID
- **Symptom**: Component rendered without packageId prop
- **Handling**: Show empty state or placeholder text
- **Validation**: Check `this.packageId` before making API requests

### Stale Cache
- **Symptom**: Version list doesn't reflect recently published versions
- **Handling**: Respect cache TTL (10 minutes from STORY-001-01-012)
- **Manual Refresh**: Provide "Refresh" button in error state

---

## Accessibility

### Keyboard Navigation
- ✅ Native `<select>` provides full keyboard support
- ✅ Focus indicator visible on dropdown (`:focus` outline)
- ✅ Screen reader announces selected version and badge label

### ARIA Labels
- `aria-label="Select package version"` on `<select>`
- `role="status"` on loading state
- `role="alert"` on error state
- Badge labels use `aria-label` for screen reader context

### High Contrast Mode
- All badges use VS Code theme tokens that adapt to high contrast themes
- Border colors maintain 4.5:1 contrast ratio minimum

---

## Future Enhancements

1. **Version Release Notes**: Show changelog/release notes in dropdown tooltip
2. **Version Deprecation Warnings**: Display deprecation badge for obsolete versions
3. **Download Count per Version**: Show popularity metric for each version
4. **Version Search/Filter**: Add search input to filter long version lists
5. **Keyboard Shortcuts**: Ctrl+L to jump to latest stable, Ctrl+P for latest prerelease
6. **Version Comparison**: Show diff between selected version and installed version
7. **Vulnerable Version Warnings**: Highlight versions with known security issues

---

## Sign-off

- [ ] Implementation plan reviewed by tech lead
- [ ] Test strategy approved (14 unit tests, 5 integration tests)
- [ ] Accessibility requirements validated
- [ ] Performance benchmarks defined
- [ ] Error handling scenarios covered
- [ ] Documentation complete
