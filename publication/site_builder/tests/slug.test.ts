import { describe, test, expect } from 'bun:test';
import { isValidSlug } from '../src/util/slug';

describe('slug grammar', () => {
  test('accepts lowercase letters, digits and hyphens starting with a letter', () => {
    expect(isValidSlug('my-site')).toBe(true);
    expect(isValidSlug('archive2024')).toBe(true);
    expect(isValidSlug('a1')).toBe(true);
  });

  test('rejects traversal, dots, uppercase, leading digit/hyphen and length extremes', () => {
    expect(isValidSlug('..')).toBe(false);
    expect(isValidSlug('a.b')).toBe(false);
    expect(isValidSlug('a/b')).toBe(false);
    expect(isValidSlug('MySite')).toBe(false);
    expect(isValidSlug('1site')).toBe(false);
    expect(isValidSlug('-site')).toBe(false);
    expect(isValidSlug('a')).toBe(false); // too short
    expect(isValidSlug('a'.repeat(41))).toBe(false); // too long
    expect(isValidSlug('')).toBe(false);
    expect(isValidSlug('a_b')).toBe(false); // underscore not allowed
  });
});
