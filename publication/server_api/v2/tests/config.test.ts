import { describe, test, expect } from 'bun:test';
import { config, parseList, dbNames, dbNameSet } from '../src/config';

describe('config', () => {
  test('parseList splits, trims and drops empty entries', () => {
    expect(parseList('a, b ,c')).toEqual(['a', 'b', 'c']);
    expect(parseList('')).toEqual([]);
    expect(parseList(' , ,x')).toEqual(['x']);
  });

  test('dbNames is non-empty and mirrored in dbNameSet', () => {
    expect(dbNames.length).toBeGreaterThan(0);
    for (const name of dbNames) {
      expect(dbNameSet.has(name)).toBe(true);
    }
  });

  test('numeric settings have sane bounds', () => {
    expect(config.CACHE_MAX_AGE).toBeGreaterThanOrEqual(0);
    expect(config.REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(0);
    expect(config.DB_QUERY_TIMEOUT).toBeGreaterThan(0);
  });
});
