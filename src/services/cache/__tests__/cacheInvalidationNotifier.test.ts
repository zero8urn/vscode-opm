/**
 * Unit tests for CacheInvalidationNotifier
 */
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { createCacheInvalidationNotifier } from '../cacheInvalidationNotifier';
import type { CacheInvalidationNotifier } from '../cacheInvalidationNotifier';

// Helper to wait for debounce timer
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('CacheInvalidationNotifier', () => {
  let notifier: CacheInvalidationNotifier;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    };

    notifier = createCacheInvalidationNotifier(mockLogger);
  });

  const createMockPanel = () =>
    ({
      webview: {
        postMessage: mock(() => Promise.resolve(true)),
      },
      onDidDispose: mock((callback: () => void) => {
        // Store callback to trigger later
        (mockPanel as any)._disposeCallback = callback;
        return { dispose: mock(() => {}) };
      }),
    } as any);

  let mockPanel: any;

  beforeEach(() => {
    mockPanel = createMockPanel();
  });

  describe('registerPanel', () => {
    it('registers a panel to receive notifications', () => {
      notifier.registerPanel(mockPanel);
      expect(mockPanel.onDidDispose).toHaveBeenCalled();
    });

    it('auto-unregisters panel on dispose', async () => {
      notifier.registerPanel(mockPanel);

      // Trigger panel dispose
      mockPanel._disposeCallback();

      // Notify should not send to disposed panel
      notifier.notifyProjectsChanged();
      await sleep(350); // Wait for debounce

      expect(mockPanel.webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('unregisterPanel', () => {
    it('manually unregisters a panel', async () => {
      notifier.registerPanel(mockPanel);
      notifier.unregisterPanel(mockPanel);

      notifier.notifyProjectsChanged();
      await sleep(350); // Wait for debounce

      expect(mockPanel.webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('notifyProjectsChanged', () => {
    it('sends projectsChanged IPC message after debounce', async () => {
      notifier.registerPanel(mockPanel);

      notifier.notifyProjectsChanged();
      await sleep(350); // Wait for debounce (300ms + buffer)

      expect(mockPanel.webview.postMessage).toHaveBeenCalledTimes(1);
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'notification',
        name: 'projectsChanged',
        args: {},
      });
    });

    it('debounces rapid notifications to single message', async () => {
      notifier.registerPanel(mockPanel);

      // Fire 5 rapid notifications
      notifier.notifyProjectsChanged();
      notifier.notifyProjectsChanged();
      notifier.notifyProjectsChanged();
      notifier.notifyProjectsChanged();
      notifier.notifyProjectsChanged();

      await sleep(350); // Wait for debounce

      // Should only send one message
      expect(mockPanel.webview.postMessage).toHaveBeenCalledTimes(1);
    });

    it('notifies multiple registered panels', async () => {
      const mockPanel2 = createMockPanel();

      notifier.registerPanel(mockPanel);
      notifier.registerPanel(mockPanel2 as any);

      notifier.notifyProjectsChanged();
      await sleep(350); // Wait for debounce

      expect(mockPanel.webview.postMessage).toHaveBeenCalledTimes(1);
      expect(mockPanel2.webview.postMessage).toHaveBeenCalledTimes(1);
    });

    it('handles postMessage errors gracefully', async () => {
      const failingPanel = {
        webview: {
          postMessage: mock(() => Promise.reject(new Error('IPC failed'))),
        },
        onDidDispose: mock(() => ({ dispose: mock(() => {}) })),
      } as any;

      notifier.registerPanel(failingPanel);
      notifier.notifyProjectsChanged();
      await sleep(350); // Wait for debounce

      // Should log warning but not crash
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('clears debounce timer on dispose', async () => {
      notifier.registerPanel(mockPanel);

      notifier.notifyProjectsChanged();
      notifier.dispose(); // Dispose before debounce completes

      await sleep(350);

      // Should not send message (timer was cleared)
      expect(mockPanel.webview.postMessage).not.toHaveBeenCalled();
    });

    it('clears all registered panels', async () => {
      notifier.registerPanel(mockPanel);
      notifier.dispose();

      notifier.notifyProjectsChanged();
      await sleep(350);

      expect(mockPanel.webview.postMessage).not.toHaveBeenCalled();
    });
  });
});
