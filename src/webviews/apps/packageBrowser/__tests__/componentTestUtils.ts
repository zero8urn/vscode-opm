/**
 * Component Testing Utilities for Lit Components
 *
 * Provides helpers for unit testing Lit web components using Bun test.
 * Does not require a browser or JSDOM - uses Lit's SSR capabilities for testing.
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { LitElement, type TemplateResult } from 'lit';

/**
 * Test fixture for Lit components.
 * Manages component lifecycle and DOM cleanup.
 */
export class ComponentFixture<T extends LitElement> {
  private container: HTMLElement | null = null;
  public element: T | null = null;

  /**
   * Create a component instance for testing.
   *
   * @param tagName - Custom element tag name
   * @param properties - Initial properties to set
   * @returns The component instance
   */
  async create(tagName: string, properties?: Partial<T>): Promise<T> {
    this.container = document.createElement('div');
    document.body.appendChild(this.container);

    const element = document.createElement(tagName) as T;
    this.element = element;

    if (properties) {
      Object.assign(element, properties);
    }

    this.container.appendChild(element);

    // Wait for first render
    await element.updateComplete;

    return element;
  }

  /**
   * Update component properties and wait for re-render.
   */
  async update(properties: Partial<T>): Promise<void> {
    if (!this.element) {
      throw new Error('Component not created');
    }

    Object.assign(this.element, properties);
    await this.element.updateComplete;
  }

  /**
   * Trigger re-render and wait for completion.
   */
  async render(): Promise<void> {
    if (!this.element) {
      throw new Error('Component not created');
    }

    this.element.requestUpdate();
    await this.element.updateComplete;
  }

  /**
   * Query shadow DOM for an element.
   */
  query<E extends Element = Element>(selector: string): E | null {
    return this.element?.shadowRoot?.querySelector<E>(selector) ?? null;
  }

  /**
   * Query shadow DOM for all matching elements.
   */
  queryAll<E extends Element = Element>(selector: string): E[] {
    return Array.from(this.element?.shadowRoot?.querySelectorAll<E>(selector) ?? []);
  }

  /**
   * Get shadow root text content.
   */
  getText(): string {
    return this.element?.shadowRoot?.textContent?.trim() ?? '';
  }

  /**
   * Cleanup: Remove element from DOM.
   */
  cleanup(): void {
    if (this.container) {
      document.body.removeChild(this.container);
      this.container = null;
    }
    this.element = null;
  }
}

/**
 * Create a new component fixture.
 * Use in beforeEach and cleanup in afterEach.
 *
 * @example
 * ```typescript
 * let fixture: ComponentFixture<MyComponent>;
 *
 * beforeEach(() => {
 *   fixture = createFixture();
 * });
 *
 * afterEach(() => {
 *   fixture.cleanup();
 * });
 *
 * test('renders correctly', async () => {
 *   const component = await fixture.create('my-component', { value: 'test' });
 *   expect(fixture.query('.value')?.textContent).toBe('test');
 * });
 * ```
 */
export function createFixture<T extends LitElement>(): ComponentFixture<T> {
  return new ComponentFixture<T>();
}

/**
 * Dispatch a custom event on an element.
 */
export function dispatchEvent(element: Element, eventName: string, detail?: unknown): void {
  const event = new CustomEvent(eventName, {
    detail,
    bubbles: true,
    composed: true,
  });
  element.dispatchEvent(event);
}

/**
 * Wait for a custom event to be fired.
 *
 * @param element - Element to listen on
 * @param eventName - Event name
 * @param timeout - Timeout in milliseconds (default: 1000)
 * @returns Promise resolving with event detail
 */
export function waitForEvent<T = unknown>(
  element: Element,
  eventName: string,
  timeout = 1000,
): Promise<CustomEvent<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      element.removeEventListener(eventName, handler as EventListener);
      reject(new Error(`Event '${eventName}' not fired within ${timeout}ms`));
    }, timeout);

    const handler = (event: CustomEvent<T>) => {
      clearTimeout(timer);
      resolve(event);
    };

    element.addEventListener(eventName, handler as EventListener, { once: true });
  });
}

/**
 * Simulate user input on an input element.
 */
export function simulateInput(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Simulate button click.
 */
export function simulateClick(button: HTMLElement): void {
  button.click();
}

/**
 * Simulate keyboard event.
 */
export function simulateKeyboard(element: HTMLElement, key: string, options?: KeyboardEventInit): void {
  const event = new KeyboardEvent('keydown', { key, ...options, bubbles: true });
  element.dispatchEvent(event);
}
