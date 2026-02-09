/**
 * DetailsController — Reactive Controller for Package Details Fetching
 *
 * Manages abort signals for package details requests.
 * Ensures only one details request is active at a time.
 *
 * @see https://lit.dev/docs/composition/controllers/
 */

import type { ReactiveController, ReactiveControllerHost } from 'lit';

/**
 * Controller that manages abort signals for details requests.
 *
 * **Usage:**
 * ```typescript
 * private detailsController = new DetailsController(
 *   this,
 *   (signal) => this.fetchDetails(signal)
 * );
 *
 * handlePackageSelected(packageId: string) {
 *   this.detailsController.fetch();
 * }
 * ```
 */
export class DetailsController implements ReactiveController {
  private abortController: AbortController | null = null;

  /**
   * @param host - Lit component that owns this controller
   * @param onFetch - Callback invoked when fetch is initiated
   */
  constructor(private readonly host: ReactiveControllerHost, private readonly onFetch: (signal: AbortSignal) => void) {
    host.addController(this);
  }

  /**
   * Initiate a details fetch, cancelling any previous fetch.
   */
  fetch(): void {
    this.cancel();

    this.abortController = new AbortController();
    this.onFetch(this.abortController.signal);
    this.host.requestUpdate(); // Trigger re-render if needed
  }

  /**
   * Cancel the current details fetch.
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Check if a fetch is currently active.
   */
  isActive(): boolean {
    return this.abortController !== null && !this.abortController.signal.aborted;
  }

  /**
   * Get the current abort signal, if any.
   */
  getSignal(): AbortSignal | null {
    return this.abortController?.signal ?? null;
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
   * Cancels any active fetch.
   */
  hostDisconnected?(): void {
    this.cancel();
  }
}
