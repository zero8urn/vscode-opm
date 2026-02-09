/**
 * Example component tests for SearchInput component.
 *
 * Demonstrates Lit component testing patterns using Bun test.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createFixture, type ComponentFixture, simulateInput, simulateClick } from './componentTestUtils';
import type { SearchInput } from '../components/searchInput';
import '../components/searchInput'; // Register custom element

describe('SearchInput Component', () => {
  let fixture: ComponentFixture<SearchInput>;

  beforeEach(() => {
    fixture = createFixture<SearchInput>();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  test('renders with initial value', async () => {
    const component = await fixture.create('search-input', { value: 'Newtonsoft.Json' });

    const input = fixture.query<HTMLInputElement>('input');
    expect(input).not.toBeNull();
    expect(input?.value).toBe('Newtonsoft.Json');
  });

  test('renders with placeholder', async () => {
    const component = await fixture.create('search-input', { placeholder: 'Search packages...' });

    const input = fixture.query<HTMLInputElement>('input');
    expect(input?.placeholder).toBe('Search packages...');
  });

  test('emits input-change event on input', async () => {
    const component = await fixture.create('search-input');
    const input = fixture.query<HTMLInputElement>('input')!;

    let eventFired = false;
    let eventValue = '';
    component.addEventListener('input-change', (e: Event) => {
      eventFired = true;
      eventValue = (e as CustomEvent).detail.value;
    });

    simulateInput(input, 'test query');

    expect(eventFired).toBe(true);
    expect(eventValue).toBe('test query');
  });

  test('shows clear button when input has value', async () => {
    const component = await fixture.create('search-input', { value: 'test' });

    const clearButton = fixture.query<HTMLButtonElement>('.clear-button');
    expect(clearButton).not.toBeNull();
    expect(clearButton?.style.display).not.toBe('none');
  });

  test('hides clear button when input is empty', async () => {
    const component = await fixture.create('search-input', { value: '' });

    const clearButton = fixture.query<HTMLButtonElement>('.clear-button');
    // Clear button should be hidden or not rendered
    expect(clearButton?.style.display === 'none' || clearButton === null).toBe(true);
  });

  test('clears input when clear button is clicked', async () => {
    const component = await fixture.create('search-input', { value: 'test' });
    const clearButton = fixture.query<HTMLButtonElement>('.clear-button')!;

    let eventFired = false;
    component.addEventListener('input-change', () => {
      eventFired = true;
    });

    simulateClick(clearButton);
    await fixture.render();

    const input = fixture.query<HTMLInputElement>('input')!;
    expect(input.value).toBe('');
    expect(eventFired).toBe(true);
  });

  test('disables input when disabled prop is true', async () => {
    const component = await fixture.create('search-input', { disabled: true });

    const input = fixture.query<HTMLInputElement>('input')!;
    expect(input.disabled).toBe(true);
  });

  test('enables input when disabled prop is false', async () => {
    const component = await fixture.create('search-input', { disabled: false });

    const input = fixture.query<HTMLInputElement>('input')!;
    expect(input.disabled).toBe(false);
  });

  test('updates value when property changes', async () => {
    const component = await fixture.create('search-input', { value: 'initial' });
    await fixture.update({ value: 'updated' });

    const input = fixture.query<HTMLInputElement>('input')!;
    expect(input.value).toBe('updated');
  });
});
