import { describe, test, expect } from 'bun:test';
import { escapeRegExp } from '../src/utils/regex';

describe('escapeRegExp', () => {
  test('escapes special regex characters', () => {
    expect(escapeRegExp('hello.world')).toBe('hello\\.world');
    expect(escapeRegExp('a+b*c?')).toBe('a\\+b\\*c\\?');
    expect(escapeRegExp('[test]')).toBe('\\[test\\]');
    expect(escapeRegExp('(group)')).toBe('\\(group\\)');
    expect(escapeRegExp('a{1,2}')).toBe('a\\{1,2\\}');
    expect(escapeRegExp('a|b')).toBe('a\\|b');
    expect(escapeRegExp('^start$')).toBe('\\^start\\$');
    expect(escapeRegExp('a\\b')).toBe('a\\\\b');
  });

  test('leaves normal strings unchanged', () => {
    expect(escapeRegExp('hello world')).toBe('hello world');
    expect(escapeRegExp('guerra civil')).toBe('guerra civil');
    expect(escapeRegExp('test123')).toBe('test123');
  });

  test('handles empty string', () => {
    expect(escapeRegExp('')).toBe('');
  });
});
