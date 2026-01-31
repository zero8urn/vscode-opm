/**
 * Cache Invalidation Notifier Service
 *
 * Bridges cache invalidation events from backend to webview panels via IPC.
 * Debounces notifications to prevent flooding during rapid file changes
 * (e.g., during `dotnet restore` or bulk project modifications).
 *
 * @module services/cache/cacheInvalidationNotifier
 */

import type * as vscode from 'vscode';
import type { ILogger } from '../loggerService';

export interface CacheInvalidationNotifier {
  /**
   * Register a webview panel to receive invalidation notifications.
   * Auto-unregisters when panel disposes.
   *
   * @param panel - VS Code webview panel instance
   */
  registerPanel(panel: vscode.WebviewPanel): void;

  /**
   * Unregister a panel (called when panel disposes).
   *
   * @param panel - VS Code webview panel instance
   */
  unregisterPanel(panel: vscode.WebviewPanel): void;

  /**
   * Notify all registered panels that projects have changed.
   * Debounced to prevent flooding during rapid file changes.
   * Triggers webview to refetch project list.
   */
  notifyProjectsChanged(): void;

  /**
   * Dispose all resources and clear registered panels.
   */
  dispose(): void;
}

export function createCacheInvalidationNotifier(logger: ILogger): CacheInvalidationNotifier {
  const panels = new Set<vscode.WebviewPanel>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const DEBOUNCE_MS = 300;

  return {
    registerPanel(panel: vscode.WebviewPanel): void {
      panels.add(panel);

      // Auto-unregister when panel disposes
      panel.onDidDispose(() => {
        panels.delete(panel);
        logger.debug('Panel unregistered from cache invalidation notifier');
      });

      logger.debug('Panel registered for cache invalidation notifications', {
        totalPanels: panels.size,
      });
    },

    unregisterPanel(panel: vscode.WebviewPanel): void {
      panels.delete(panel);
      logger.debug('Panel manually unregistered from cache invalidation notifier', {
        totalPanels: panels.size,
      });
    },

    notifyProjectsChanged(): void {
      // Debounce: reset timer on each call
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(() => {
        logger.debug(`Notifying ${panels.size} panel(s) of project changes`);

        for (const panel of panels) {
          panel.webview
            .postMessage({
              type: 'notification',
              name: 'projectsChanged',
              args: {},
            })
            .then(
              () => {
                // Success - no logging needed
              },
              err => logger.warn('Failed to send projectsChanged notification', err),
            );
        }

        debounceTimer = null;
      }, DEBOUNCE_MS);
    },

    dispose(): void {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      panels.clear();
      logger.debug('Cache invalidation notifier disposed');
    },
  };
}
