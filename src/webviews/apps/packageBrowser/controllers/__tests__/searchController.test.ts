/**
 * Unit tests for SearchController
 */

import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { SearchController } from '../searchController';
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

describe('SearchController', () => {
  let host: MockHost;
  let onSearch: ReturnType<typeof mock>;
  let controller: SearchController;

  beforeEach(() => {
    host = new MockHost();
    onSearch = mock((query: string, signal: AbortSignal) => {});
  });

  afterEach(() => {
    controller?.cancelPending();
  });

  test('adds itself to host on construction', () => {
    controller = new SearchController(host, onSearch);
    expect(host['controllers']).toHaveLength(1);
  });

  test('debounces search calls', async () => {
    controller = new SearchController(host, onSearch, 50);

    controller.search('query1');
    controller.search('query2');
    controller.search('query3');

    expect(onSearch).not.toHaveBeenCalled();

    await new Promise(resolve => setTimeout(resolve, 60));

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch.mock.calls[0]![0]).toBe('query3');
  });

  test('provides abort signal to callback', async () => {
    controller = new SearchController(host, onSearch, 10);

    controller.search('test');
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(onSearch).toHaveBeenCalled();
    const signal = onSearch.mock.calls[0]![1];
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  test('aborts previous request when new search starts', async () => {
    controller = new SearchController(host, onSearch, 10);

    controller.search('query1');
    await new Promise(resolve => setTimeout(resolve, 15));

    const firstSignal = onSearch.mock.calls[0]![1];

    controller.search('query2');
    await new Promise(resolve => setTimeout(resolve, 15));

    expect(firstSignal.aborted).toBe(true);
    expect(onSearch).toHaveBeenCalledTimes(2);
  });

  test('cancelPending clears debounce timer', async () => {
    controller = new SearchController(host, onSearch, 50);

    controller.search('query');
    expect(controller.isPending()).toBe(true);

    controller.cancelPending();
    expect(controller.isPending()).toBe(false);

    await new Promise(resolve => setTimeout(resolve, 60));
    expect(onSearch).not.toHaveBeenCalled();
  });

  test('cancelPending aborts inflight request', async () => {
    controller = new SearchController(host, onSearch, 10);

    controller.search('query');
    await new Promise(resolve => setTimeout(resolve, 15));

    const signal = onSearch.mock.calls[0]![1];
    expect(signal.aborted).toBe(false);

    controller.cancelPending();
    expect(signal.aborted).toBe(true);
    expect(controller.isInflight()).toBe(false);
  });

  test('isPending returns true when debouncing', () => {
    controller = new SearchController(host, onSearch, 100);

    expect(controller.isPending()).toBe(false);

    controller.search('query');
    expect(controller.isPending()).toBe(true);

    controller.cancelPending();
    expect(controller.isPending()).toBe(false);
  });

  test('isInflight returns true when request active', async () => {
    controller = new SearchController(host, onSearch, 10);

    expect(controller.isInflight()).toBe(false);

    controller.search('query');
    await new Promise(resolve => setTimeout(resolve, 15));

    expect(controller.isInflight()).toBe(true);

    controller.cancelPending();
    expect(controller.isInflight()).toBe(false);
  });

  test('hostDisconnected cancels pending searches', async () => {
    controller = new SearchController(host, onSearch, 50);

    controller.search('query');
    expect(controller.isPending()).toBe(true);

    controller.hostDisconnected!();

    await new Promise(resolve => setTimeout(resolve, 60));
    expect(onSearch).not.toHaveBeenCalled();
  });

  test('hostDisconnected aborts inflight requests', async () => {
    controller = new SearchController(host, onSearch, 10);

    controller.search('query');
    await new Promise(resolve => setTimeout(resolve, 15));

    const signal = onSearch.mock.calls[0]![1];
    expect(signal.aborted).toBe(false);

    controller.hostDisconnected!();
    expect(signal.aborted).toBe(true);
  });

  test('requests host update after search callback', async () => {
    controller = new SearchController(host, onSearch, 10);

    host.updateRequested = false;
    controller.search('query');
    await new Promise(resolve => setTimeout(resolve, 15));

    expect(host.updateRequested).toBe(true);
  });

  test('uses default debounce delay of 300ms', async () => {
    controller = new SearchController(host, onSearch);

    controller.search('query');
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(onSearch).not.toHaveBeenCalled();

    await new Promise(resolve => setTimeout(resolve, 250));
    expect(onSearch).toHaveBeenCalled();
  });
});
