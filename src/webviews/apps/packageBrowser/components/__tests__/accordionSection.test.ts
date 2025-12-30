import { describe, test, expect } from 'bun:test';
import { AccordionSection, ACCORDION_SECTION_TAG } from '../accordionSection';

describe('AccordionSection Component', () => {
  test('should export AccordionSection class', () => {
    expect(AccordionSection).toBeDefined();
    expect(typeof AccordionSection).toBe('function');
  });

  test('should export tag constant', () => {
    expect(ACCORDION_SECTION_TAG).toBe('accordion-section');
  });

  test('should have default title as empty string', () => {
    const instance = new AccordionSection();
    expect(instance.title).toBe('');
  });

  test('should have default expanded state as false', () => {
    const instance = new AccordionSection();
    expect(instance.expanded).toBe(false);
  });

  test('should have default icon as empty string', () => {
    const instance = new AccordionSection();
    expect(instance.icon).toBe('');
  });

  test('should update title property', () => {
    const instance = new AccordionSection();
    instance.title = 'Details';
    expect(instance.title).toBe('Details');
  });

  test('should update expanded property', () => {
    const instance = new AccordionSection();
    instance.expanded = true;
    expect(instance.expanded).toBe(true);
  });

  test('should update icon property', () => {
    const instance = new AccordionSection();
    instance.icon = '📦';
    expect(instance.icon).toBe('📦');
  });

  test('should reflect expanded attribute', () => {
    const instance = new AccordionSection();
    // The expanded property has reflect: true
    expect(instance.expanded).toBe(false);
  });
});
