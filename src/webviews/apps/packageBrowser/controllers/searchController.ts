/**
 * SearchController — Reactive Controller for Search Debouncing & Cancellation
 *
 * Manages search side effects: debouncing user input and aborting inflight requests.
 * Follows Lit's ReactiveController pattern to hook into component lifecycle.
 *
 * @see https://lit.dev/docs/composition/controllers/
 */

import type { ReactiveController, ReactiveControllerHost } from 'lit';

/**
 * Controller that debounces search input and manages abort signals.
 *
 * **Usage:**
 * ```typescript
 * private searchController = new SearchController(
 *   this,
 *   (query) => this.performSearch(query),
 *   300 // debounce delay in ms
 * );
 *
 * handleInputChange(query: string) {
 *   this.searchController.search(query);
 * }
 * ```
 */
export class SearchController implements ReactiveController {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;

  /**
   * @param host - Lit component that owns this controller
   * @param onSearch - Callback invoked after debounce delay
   * @param debounceMs - Debounce delay in milliseconds (default: 300)
   */
  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly onSearch: (query: string, signal: AbortSignal) => void,
    private readonly debounceMs: number = 300,
  ) {
    host.addController(this);
  }

  /**
   * Initiate a search with debouncing and cancellation.
   * Cancels any pending search and schedules a new one.
   *
   * @param query - Search query string
   */
  search(query: string): void {
    this.cancelPending();

    this.debounceTimer = setTimeout(() => {
      this.abortController = new AbortController();
      this.onSearch(query, this.abortController.signal);
      this.host.requestUpdate(); // Trigger re-render if needed
    }, this.debounceMs);
  }

  /**
   * Cancel any pending debounced search and abort inflight request.
   */
  cancelPending(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Check if a search is currently pending (debouncing).
   */
  isPending(): boolean {
    return this.debounceTimer !== null;
  }

  /**
   * Check if a search request is currently inflight.
   */
  isInflight(): boolean {
    return this.abortController !== null && !this.abortController.signal.aborted;
  }

  // Lifecycle hooks

  /**
   * Called when the host component is connected to the DOM.
   * No action needed for this controller.
   */
  hostConnected?(): void {
    // No initialization needed
  }

  /**
   * Called when the host component is disconnected from the DOM.
   * Cancels pending searches and aborts inflight requests.
   */
  hostDisconnected?(): void {
    this.cancelPending();
  }
}
