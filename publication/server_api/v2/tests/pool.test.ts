import { describe, test, expect } from 'bun:test';
import { normalizeValues, assertKnownDb, getPool, closePools, dbExecute } from '../src/db/pool';
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

/**
 * The pool LIFECYCLE — deliberately DB-less.
 *
 * WHY THESE EXIST (2026-08-03). `pool.ts` used to be covered only as a side effect of
 * the live-DB tests in schema.test.ts, so its coverage read 90% on a developer machine
 * with MariaDB running and 33% on a CI runner without one — and the per-file
 * coverageThreshold turned that into a red gate whose cause was the RUNNER, not the code.
 * A gate that depends on whether a database happens to be listening is not a gate.
 *
 * None of this opens a connection: `new SQL(...)` is lazy (it builds options and defers
 * the socket until the first query), so pool creation, memoization and teardown are all
 * exercisable with no server anywhere. `dbExecute` is the one function left to the
 * live-DB tests, since it is the one that must actually talk to a server.
 */
describe('pool lifecycle (no database required)', () => {
  test('getPool builds a pool for a configured database and MEMOIZES it', () => {
    // One pool per database, reused: a fresh pool per call would leak connections and
    // silently defeat DB_POOL_MAX.
    const first = getPool(dbNames[0]);
    const second = getPool(dbNames[0]);

    expect(first).toBeDefined();
    expect(second).toBe(first);
  });

  test('getPool refuses a database outside the allowlist BEFORE building anything', () => {
    // The allowlist check is the security boundary and must run first — a pool must
    // never be constructed against a database the operator did not publish.
    expect(() => getPool('mysql')).toThrow(NotFoundError);
    expect(() => getPool('information_schema')).toThrow(NotFoundError);
  });

  test('closePools drops every pool and is safe to call twice', async () => {
    const before = getPool(dbNames[0]);

    await closePools();
    // Idempotent: the second call has nothing to close and must not throw. The daemon
    // calls it on SIGTERM, where a throw would break the graceful drain.
    await closePools();

    // The map was cleared, so the next request builds a NEW pool rather than handing
    // out the closed one.
    expect(getPool(dbNames[0])).not.toBe(before);

    await closePools();
  });

  test('dbExecute routes through the allowlist and normalizes whatever comes back', async () => {
    // Refused before any socket: the allowlist guards this door too, not just getPool.
    await expect(dbExecute('mysql', 'SELECT 1')).rejects.toThrow(NotFoundError);

    // For a CONFIGURED database the outcome depends on whether a server is listening,
    // and this suite must assert the same thing either way — that is the whole point of
    // the block above. So assert the contract that holds in BOTH branches: the call
    // settles (no hang), and on success every value is already JSON-shaped, never a Date.
    // Locally this rejects with "Access denied", on a bare CI runner with ECONNREFUSED,
    // and on a fully provisioned box it resolves — all three are a pass, none is a skip.
    const outcome = await dbExecute(dbNames[0], 'SELECT 1 AS x').then(
      rows => ({ ok: true as const, rows }),
      error => ({ ok: false as const, error }),
    );

    if (outcome.ok) {
      expect(Array.isArray(outcome.rows)).toBe(true);
      for (const row of outcome.rows) {
        for (const key in row) expect(row[key]).not.toBeInstanceOf(Date);
      }
    } else {
      // A driver/transport failure must surface as an Error, not a swallowed undefined —
      // the routes turn it into a 500, and a non-Error would print as "[object Object]".
      expect(outcome.error).toBeInstanceOf(Error);
    }
  });
});

/**
 * The tests above only mean something if they run against the REAL module.
 *
 * `mock.module` is process-wide and bun runs every test file in one process, so a mock of
 * this module installed by ANY other file replaces it here too. That happened: on the
 * Linux CI runner tests/integration.test.ts's mock made this file die at load, and once
 * the mock was completed, the memoization test below asserted against the stub instead —
 * silently, and only on Linux (2026-08-14). Integration tests use the __setTestDbExecute
 * seam in db/pool.ts instead, which is scoped and restored in an afterAll.
 */
test('no test file installs a process-wide mock of db/pool', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const dir = new URL('.', import.meta.url).pathname;

  const offenders = readdirSync(dir)
    .filter(file => file.endsWith('.test.ts'))
    .filter(file => /mock\.module\(\s*['"][^'"]*db\/pool['"]/.test(readFileSync(join(dir, file), 'utf8')));

  expect(offenders).toEqual([]);
});
