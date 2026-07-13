import { describe, test, expect } from 'bun:test';
import { config, parseList, dbNames, dbNameSet, avSchema } from '../src/config';

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
    expect(config.DB_POOL_MAX).toBeGreaterThan(0);
  });
});

describe('AV schema config', () => {
  // These name tables/columns that get INTERPOLATED into SQL (a table name cannot be
  // a bound parameter), so the identifier grammar is what keeps them safe. It is
  // enforced at boot: a bad value must fail the process, never reach a query.
  const SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

  test('defaults to the Dédalo oral-history shape so a standard publication needs no config', () => {
    expect(avSchema.table).toBe('interview');
    expect(avSchema.mediaTable).toBe('audiovisual');
    expect(avSchema.speakerTable).toBe('informant');
    expect(avSchema.transcriptionColumn).toBe('rsc36');
    expect(avSchema.videoColumn).toBe('rsc35');
    expect(avSchema.thesaurusTables).toEqual(['ts_themes', 'ts_onomastic', 'ts_chronological']);
  });

  test('every configured identifier is a plain SQL identifier', () => {
    const identifiers = [
      avSchema.table,
      avSchema.mediaTable,
      avSchema.speakerTable,
      avSchema.transcriptionColumn,
      avSchema.videoColumn,
      ...avSchema.thesaurusTables,
    ];

    for (const identifier of identifiers) {
      expect(identifier).toMatch(SQL_IDENTIFIER);
    }
  });

  test('the loaded config exposes the AV keys it validated', () => {
    expect(config.AV_TABLE).toMatch(SQL_IDENTIFIER);
    expect(config.AV_THESAURUS_TABLES.length).toBeGreaterThan(0);
  });
});
