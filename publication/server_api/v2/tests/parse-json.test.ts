import { describe, test, expect } from 'bun:test';
import { parseJsonStrings } from '../src/utils/parse-json';

describe('parseJsonStrings', () => {
  test('parses JSON array strings in row data', () => {
    const row = { section_id: 25, lang: 'lg-eng', type_data: '["3390","6584","18080","18325"]' } as Record<string, unknown>;
    const result = parseJsonStrings(row);
    expect(result.type_data).toEqual(['3390', '6584', '18080', '18325']);
    expect(result.section_id).toBe(25);
    expect(result.lang).toBe('lg-eng');
  });

  test('parses JSON object strings in row data', () => {
    const row = { id: 1, config: '{"key":"value","count":42}' } as Record<string, unknown>;
    const result = parseJsonStrings(row);
    expect(result.config).toEqual({ key: 'value', count: 42 });
  });

  test('leaves non-JSON strings unchanged', () => {
    const row = { id: 1, title: 'Hello World', code: 'OH-001' } as Record<string, unknown>;
    const result = parseJsonStrings(row);
    expect(result.title).toBe('Hello World');
    expect(result.code).toBe('OH-001');
  });

  test('leaves numbers and nulls unchanged', () => {
    const row = { id: 1, count: 42, label: null } as Record<string, unknown>;
    const result = parseJsonStrings(row);
    expect(result.id).toBe(1);
    expect(result.count).toBe(42);
    expect(result.label).toBeNull();
  });

  test('handles arrays of rows', () => {
    const rows = [
      { id: 1, data: '["a","b"]' },
      { id: 2, data: '["c","d"]' },
    ] as Record<string, unknown>[];
    const result = parseJsonStrings(rows);
    expect((result[0] as Record<string, unknown>).data).toEqual(['a', 'b']);
    expect((result[1] as Record<string, unknown>).data).toEqual(['c', 'd']);
  });

  test('handles nested JSON strings', () => {
    const row = { id: 1, nested: '{"inner":["x","y"]}' } as Record<string, unknown>;
    const result = parseJsonStrings(row);
    expect(result.nested).toEqual({ inner: ['x', 'y'] });
  });

  test('handles invalid JSON strings gracefully', () => {
    const row = { id: 1, broken: '[not valid json' } as Record<string, unknown>;
    const result = parseJsonStrings(row);
    expect(result.broken).toBe('[not valid json');
  });

  test('handles empty string', () => {
    const row = { id: 1, empty: '' } as Record<string, unknown>;
    const result = parseJsonStrings(row);
    expect(result.empty).toBe('');
  });

  test('handles booleans in JSON', () => {
    const row = { id: 1, flags: '[true,false,true]' } as Record<string, unknown>;
    const result = parseJsonStrings(row);
    expect(result.flags).toEqual([true, false, true]);
  });

  test('handles null values', () => {
    const result = parseJsonStrings(null);
    expect(result).toBeNull();
  });

  test('handles undefined values', () => {
    const result = parseJsonStrings(undefined);
    expect(result).toBeUndefined();
  });

  test('mutates the row in place and returns the same reference', () => {
    const row = { id: 1, data: '["a","b"]' } as Record<string, unknown>;
    const result = parseJsonStrings(row);
    expect(result).toBe(row); // same object, not a rebuilt copy
    expect(row.data).toEqual(['a', 'b']); // original was mutated
  });

  test('mutates objects nested inside array elements in place', () => {
    const rows = [{ id: 1, meta: '{"inner":["x","y"]}' }] as Record<string, unknown>[];
    const result = parseJsonStrings(rows);
    expect(result).toBe(rows);
    expect(result[0]).toBe(rows[0]);
    expect(rows[0].meta).toEqual({ inner: ['x', 'y'] });
  });

  test('does not re-parse JSON nested within an already-parsed value', () => {
    // value within parsed JSON that itself looks like JSON stays a string,
    // matching a single JSON.parse pass
    const row = { id: 1, data: '{"raw":"[1,2]"}' } as Record<string, unknown>;
    const result = parseJsonStrings(row);
    expect(result.data).toEqual({ raw: '[1,2]' });
  });
});