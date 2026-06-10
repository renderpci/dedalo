import { describe, test, expect } from 'bun:test';
import { splitTerms, extractFragments, pageAtPosition, timecodesAtPosition } from '../src/utils/fragments';
import { MAX_FRAGMENT_TERMS, MAX_TERM_LENGTH, MAX_SCAN_LENGTH } from '../src/constants';
import { ValidationError } from '../src/errors';

describe('splitTerms', () => {
  test('splits on whitespace', () => {
    expect(splitTerms('guerra  civil\trefugio')).toEqual(['guerra', 'civil', 'refugio']);
  });

  test('caps the number of terms', () => {
    const terms = Array.from({ length: MAX_FRAGMENT_TERMS + 5 }, (_, i) => `t${i}`).join(' ');
    expect(splitTerms(terms).length).toBe(MAX_FRAGMENT_TERMS);
  });

  test('rejects oversized terms', () => {
    expect(() => splitTerms('a'.repeat(MAX_TERM_LENGTH + 1))).toThrow(ValidationError);
  });
});

describe('extractFragments', () => {
  const text = 'Lorem ipsum guerra dolor sit amet, consectetur guerra adipiscing elit.';

  test('finds and highlights occurrences with context', () => {
    const fragments = extractFragments(text, 'guerra', 20, 5);
    expect(fragments.length).toBe(2);
    expect(fragments[0].text).toContain('<mark>guerra</mark>');
    expect(fragments[0].position).toBe(text.indexOf('guerra'));
  });

  test('respects maxOccurrences', () => {
    const fragments = extractFragments(text, 'guerra', 20, 1);
    expect(fragments.length).toBe(1);
  });

  test('adds ellipses for truncated context', () => {
    const fragments = extractFragments(text, 'consectetur', 10, 1);
    expect(fragments[0].text.startsWith('...')).toBe(true);
    expect(fragments[0].text.endsWith('...')).toBe(true);
  });

  test('matches case-insensitively', () => {
    const fragments = extractFragments('GUERRA total', 'guerra', 20, 1);
    expect(fragments.length).toBe(1);
  });

  test('regex special characters in terms are matched literally', () => {
    const fragments = extractFragments('price (a+b) here', '(a+b)', 20, 1);
    expect(fragments.length).toBe(1);
    expect(fragments[0].text).toContain('<mark>(a+b)</mark>');
  });

  test('does not scan beyond MAX_SCAN_LENGTH', () => {
    const big = 'x'.repeat(MAX_SCAN_LENGTH) + ' needle';
    const fragments = extractFragments(big, 'needle', 20, 1);
    expect(fragments.length).toBe(0);
  });

  test('returns empty for no matches', () => {
    expect(extractFragments(text, 'zzznothing', 20, 3)).toEqual([]);
  });
});

describe('pageAtPosition', () => {
  test('returns the last page tag before the position', () => {
    const text = '[page-n-1] aaa [page-n-2] bbb ccc';
    expect(pageAtPosition(text, text.indexOf('bbb'))).toBe(2);
    expect(pageAtPosition(text, text.indexOf('aaa'))).toBe(1);
  });

  test('returns undefined when no page tag precedes', () => {
    expect(pageAtPosition('no tags here', 5)).toBeUndefined();
  });
});

describe('timecodesAtPosition', () => {
  test('returns the covering timecode range', () => {
    const text = '[tc-0-10] hello [tc-10-20] world [tc-20-30] end';
    const result = timecodesAtPosition(text, text.indexOf('world'));
    expect(result).toEqual({ tcIn: 10, tcOut: 20 });
  });

  test('supports fractional timecodes', () => {
    const text = '[tc-1.5-2.75] hi';
    expect(timecodesAtPosition(text, text.indexOf('hi'))).toEqual({ tcIn: 1.5, tcOut: 2.75 });
  });

  test('defaults to zero when no tags precede', () => {
    expect(timecodesAtPosition('plain text', 3)).toEqual({ tcIn: 0, tcOut: 0 });
  });
});
