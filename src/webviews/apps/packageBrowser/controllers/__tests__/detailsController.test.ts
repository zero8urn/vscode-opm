/**
 * Unit tests for DetailsController
 */

import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { DetailsController } from '../detailsController';
import type { ReactiveControllerHost } from 'lit';

// Mock host that implements minimal ReactiveControllerHost
class MockHost implements ReactiveControllerHost {
  private controllers: any[] = [];
  updateRequested = false;

  addController(controller: any): void {
    this.controllers.push(controller);
  }

  requestUpdate(): void {
    this.updateRequested = true;
  }

  removeController(controller: any): void {
    const index = this.controllers.indexOf(controller);
    if (index > -1) {
      this.controllers.splice(index, 1);
    }
  }

  updateComplete = Promise.resolve(true);
}

describe('DetailsController', () => {
  let host: MockHost;
  let onFetch: ReturnType<typeof mock>;
  let controller: DetailsController;

  beforeEach(() => {
    host = new MockHost();
    onFetch = mock((signal: AbortSignal) => {});
  });

  afterEach(() => {
    controller?.cancel();
  });

  test('adds itself to host on construction', () => {
    controller = new DetailsController(host, onFetch);
    expect(host['controllers']).toHaveLength(1);
  });

  test('fetch invokes callback with abort signal', () => {
    controller = new DetailsController(host, onFetch);

    controller.fetch();

    expect(onFetch).toHaveBeenCalledTimes(1);
    const signal = onFetch.mock.calls[0]![0];
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  test('fetch cancels previous fetch before starting new one', () => {
    controller = new DetailsController(host, onFetch);

    controller.fetch();
    const firstSignal = onFetch.mock.calls[0]![0];

    controller.fetch();
    const secondSignal = onFetch.mock.calls[1]![0];

    expect(firstSignal.aborted).toBe(true);
    expect(secondSignal.aborted).toBe(false);
    expect(onFetch).toHaveBeenCalledTimes(2);
  });

  test('cancel aborts current fetch', () => {
    controller = new DetailsController(host, onFetch);

    controller.fetch();
    const signal = onFetch.mock.calls[0]![0];

    expect(signal.aborted).toBe(false);

    controller.cancel();

    expect(signal.aborted).toBe(true);
  });

  test('isActive returns true when fetch is active', () => {
    controller = new DetailsController(host, onFetch);

    expect(controller.isActive()).toBe(false);

    controller.fetch();
    expect(controller.isActive()).toBe(true);

    controller.cancel();
    expect(controller.isActive()).toBe(false);
  });

  test('isActive returns false after controller is cancelled', () => {
    controller = new DetailsController(host, onFetch);

    controller.fetch();
    expect(controller.isActive()).toBe(true);

    // Cancel the controller, which aborts the signal
    controller.cancel();

    // isActive checks the aborted flag
    expect(controller.isActive()).toBe(false);
  });

  test('getSignal returns current abort signal', () => {
    controller = new DetailsController(host, onFetch);

    expect(controller.getSignal()).toBeNull();

    controller.fetch();
    const signal = controller.getSignal();
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal!.aborted).toBe(false);
  });

  test('getSignal returns null after cancel', () => {
    controller = new DetailsController(host, onFetch);

    controller.fetch();
    expect(controller.getSignal()).not.toBeNull();

    controller.cancel();
    expect(controller.getSignal()).toBeNull();
  });

  test('hostDisconnected cancels active fetch', () => {
    controller = new DetailsController(host, onFetch);

    controller.fetch();
    const signal = onFetch.mock.calls[0]![0];

    expect(signal.aborted).toBe(false);

    controller.hostDisconnected!();

    expect(signal.aborted).toBe(true);
    expect(controller.isActive()).toBe(false);
  });

  test('requests host update after fetch', () => {
    controller = new DetailsController(host, onFetch);

    host.updateRequested = false;
    controller.fetch();

    expect(host.updateRequested).toBe(true);
  });

  test('multiple cancel calls are safe', () => {
    controller = new DetailsController(host, onFetch);

    controller.fetch();
    controller.cancel();
    controller.cancel(); // Should not throw

    expect(controller.isActive()).toBe(false);
  });

  test('cancel is safe when no fetch is active', () => {
    controller = new DetailsController(host, onFetch);

    controller.cancel(); // Should not throw
    expect(controller.isActive()).toBe(false);
  });
});
