import { test, expect } from 'bun:test';
import { sanitizeHtml, setSanitizer, createDefaultSanitizer } from '../sanitizer';

test('removes script tags', () => {
  const input = '<div>hi<script>alert(1)</script></div>';
  expect(sanitizeHtml(input)).toBe('<div>hi</div>');
});

test('removes onclick attributes', () => {
  const input = '<a href="#" onclick="evil()">click</a>';
  expect(sanitizeHtml(input)).toBe('<a href="#">click</a>');
});

test('neutralizes javascript: URIs', () => {
  const input = '<a href="javascript:alert(1)">x</a>';
  expect(sanitizeHtml(input)).toBe('<a href="#">x</a>');
});

test('removes img when images disabled and keeps alt', () => {
  const input = '<p>img: <img src="x.png" alt="ALT"></p>';
  expect(sanitizeHtml(input)).toBe('<p>img: <span>ALT</span></p>');
});

test('sanitizer is swappable', () => {
  setSanitizer(() => 'REPLACED');
  expect(sanitizeHtml('<b>ok</b>')).toBe('REPLACED');
  setSanitizer(createDefaultSanitizer());
});
