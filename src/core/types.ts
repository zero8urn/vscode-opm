/**
 * Shared core types.
 */

export interface Disposable {
  dispose(): void;
}

export interface CancellationToken {
  isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): Disposable;
}
