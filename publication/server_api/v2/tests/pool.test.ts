import { describe, test, expect } from 'bun:test';
import { normalizeValues, assertKnownDb } from '../src/db/pool';
import { NotFoundError } from '../src/errors';
import { dbNames } from '../src/config';
import type { DbRow } from '../src/db/types';

describe('assertKnownDb', () => {
  test('accepts a configured database', () => {
    expect(assertKnownDb(dbNames[0])).toBe(dbNames[0]);
  });

  test('rejects anything not in DB_NAMES', () => {
    // The allowlist IS the security boundary: the API must never open a pool against
    // a database the operator did not publish.
    expect(() => assertKnownDb('mysql')).toThrow(NotFoundError);
    expect(() => assertKnownDb('../etc/passwd')).toThrow(NotFoundError);
  });
});

describe('normalizeValues', () => {
  // DATE/DATETIME columns come back from the MariaDB adapter as JS Dates. The API's
  // contract is JSON, so they are normalized once, at the driver edge — otherwise the
  // same column serializes differently depending on which path reads it.
  test('converts Date values to ISO-8601 strings', () => {
    const rows: DbRow[] = [{ id: 1, created: new Date('2026-07-13T10:20:30.000Z') }];

    normalizeValues(rows);

    expect(rows[0].created).toBe('2026-07-13T10:20:30.000Z');
    expect(typeof rows[0].created).toBe('string');
  });

  test('leaves every other value untouched', () => {
    const rows: DbRow[] = [
      {
        section_id: 42,
        title: 'Entrevista',
        ratio: 1.5,
        missing: null,
        json_text: '[{"section_id":1}]',
      },
    ];

    normalizeValues(rows);

    expect(rows[0]).toEqual({
      section_id: 42,
      title: 'Entrevista',
      ratio: 1.5,
      missing: null,
      // JSON-in-TEXT stays a string here: parsing it is a separate, explicit step.
      json_text: '[{"section_id":1}]',
    });
  });

  test('normalizes every row, and returns the same array (mutates in place)', () => {
    const rows: DbRow[] = [
      { id: 1, day: new Date('2026-01-01T00:00:00.000Z') },
      { id: 2, day: new Date('2026-12-31T23:59:59.000Z') },
    ];

    const result = normalizeValues(rows);

    expect(result).toBe(rows);
    expect(rows[0].day).toBe('2026-01-01T00:00:00.000Z');
    expect(rows[1].day).toBe('2026-12-31T23:59:59.000Z');
  });

  test('handles an empty result set', () => {
    expect(normalizeValues([])).toEqual([]);
  });
});
