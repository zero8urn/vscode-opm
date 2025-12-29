# lit-virtualizer Pagination - Correct Implementation

**Date**: 2025-12-29  
**Status**: Verified Working in virtualizerTest app

## Key Discovery

The `@lit-labs/virtualizer` library uses a **non-standard event structure**:
- Range data (`first`, `last`) is **directly on the event object**, not in `event.detail`
- Access via `event.first` and `event.last`, NOT `event.detail.first`

## Events Overview

### `rangeChanged`
- **When it fires**: Only on initial render and when the virtualizer recalculates layout
- **Does NOT fire**: During normal scrolling
- **Use case**: Initial state setup, layout changes
- **Not suitable for**: Scroll-based infinite pagination

### `visibilityChanged`
- **When it fires**: When the visible range of items changes during scrolling
- **Fires continuously**: As user scrolls through the list
- **Use case**: ✅ **Infinite scroll pagination** (this is what we need!)

## Correct Implementation

### 1. Template Setup

```typescript
<lit-virtualizer
  scroller
  class="virtualizer-scroller"
  .items=${this.packages}
  .renderItem=${(pkg: Package) => this.renderItem(pkg)}
  @visibilityChanged=${this.handleVisibilityChanged}
></lit-virtualizer>
```

**Critical points:**
- `scroller` attribute makes virtualizer its own scroll container
- Use `@visibilityChanged` (capital C), not `@rangeChanged`
- Handler receives events during scrolling

### 2. Event Handler

```typescript
private handleVisibilityChanged(e: CustomEvent): void {
  // ⚠️ IMPORTANT: Range is directly on event, not in e.detail!
  const first = (e as any).first as number;
  const last = (e as any).last as number;
  
  if (first === undefined || last === undefined) {
    console.warn('visibilityChanged event missing range data');
    return;
  }

  // Calculate threshold (e.g., trigger 5 items before end)
  const threshold = this.items.length - 5;
  
  // Check if we should load more
  if (!this.loading && last >= threshold && this.hasMore) {
    this.loadMore();
  }
}
```

### 3. CSS Requirements

```css
.list-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.virtualizer-scroller {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
```

**Why this matters:**
- `flex: 1` makes virtualizer fill available space
- `min-height: 0` allows flex shrinking
- `overflow-y: auto` enables scrolling

## Common Mistakes (What NOT to Do)

### ❌ Wrong: Using `e.detail`
```typescript
// This will be undefined!
const { first, last } = e.detail;
```

### ❌ Wrong: Using `rangeChanged` for scroll pagination
```typescript
// This only fires on initial render, not during scrolling
@rangeChanged=${this.handleScroll}
```

### ❌ Wrong: Using Intersection Observer
```typescript
// Doesn't work with virtualizer's internal scroll management
const observer = new IntersectionObserver(...);
observer.observe(sentinelElement);
```

## Complete Working Example

```typescript
@customElement('package-list')
export class PackageList extends LitElement {
  @property({ type: Array })
  packages: Package[] = [];
  
  @property({ type: Boolean })
  hasMore = false;
  
  @property({ type: Boolean })
  loading = false;

  static override styles = css`
    .list-container {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    
    .virtualizer-scroller {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }
  `;

  private handleVisibilityChanged(e: CustomEvent): void {
    const first = (e as any).first as number;
    const last = (e as any).last as number;
    
    const threshold = this.packages.length - 5;
    
    if (!this.loading && last >= threshold && this.hasMore) {
      this.dispatchEvent(new CustomEvent('load-more', {
        bubbles: true,
        composed: true,
      }));
    }
  }

  override render() {
    return html`
      <div class="list-container">
        <lit-virtualizer
          scroller
          class="virtualizer-scroller"
          .items=${this.packages}
          .renderItem=${(pkg: Package) => this.renderPackageCard(pkg)}
          @visibilityChanged=${this.handleVisibilityChanged}
        ></lit-virtualizer>
      </div>
    `;
  }
}
```

## Migration Checklist

When fixing the packageList component:

- [ ] Remove Intersection Observer setup/cleanup methods
- [ ] Remove sentinel element from template
- [ ] Remove `connectedCallback`/`disconnectedCallback` if only used for observer
- [ ] Remove `observeSentinel()` and related lifecycle code
- [ ] Change `@rangeChanged` to `@visibilityChanged`
- [ ] Update event handler to read `e.first`/`e.last` directly (not `e.detail`)
- [ ] Remove unnecessary `updated()` lifecycle hook
- [ ] Update CSS to use flexbox layout
- [ ] Test with 100+ items to verify pagination triggers

## Verification

Test pagination is working when:
1. Initial render shows first N items (e.g., 20)
2. Scrolling down triggers `visibilityChanged` events (check console)
3. When scrolling near end (within threshold), `load-more` event fires
4. New items appear and can continue scrolling
5. No errors in console about undefined ranges

## References

- Working example: `src/webviews/apps/virtualizerTest/virtualizerTestApp.ts`
- Broken example (to fix): `src/webviews/apps/packageBrowser/components/packageList.ts`
- Original issue analysis: `docs/technical/pagination-issue-analysis.md`
