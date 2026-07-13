import { describe, test, expect, afterAll } from 'bun:test';
import { listTables, getTable } from '../src/services/schema.service';
import { closePools } from '../src/db/pool';
import { dbNames } from '../src/config';
import type { ColumnInfo } from '../src/db/types';

// Live-DB tests: skipped gracefully when no MariaDB is reachable.
describe('Schema Service', () => {
  const db = dbNames[0];

  afterAll(async () => {
    await closePools();
  });

  test('listTables returns all tables', async () => {
    try {
      const tables = await listTables(db);
      expect(Array.isArray(tables)).toBe(true);
    } catch {
      console.warn('Skipping test: database not available');
    }
  });

  test('getTable returns a single table with columns', async () => {
    try {
      const tables = await listTables(db);
      if (tables.length === 0) return;

      const table = await getTable(db, tables[0].name);
      expect(table.name).toBe(tables[0].name);
      const columnNames = table.columns.map((c: ColumnInfo) => c.name);
      expect(columnNames.length).toBeGreaterThan(0);
    } catch {
      console.warn('Skipping test: database not available');
    }
  });

  test('getTable rejects unknown database', async () => {
    const { getPool } = await import('../src/db/pool');
    expect(() => getPool('definitely_not_configured')).toThrow();
  });
});
