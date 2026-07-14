/**
 * Schema introspection over INFORMATION_SCHEMA — the only place this API learns what
 * a published database actually contains.
 *
 * It has two jobs. The first is the `/tables` surface: what exists, with what columns.
 * The second, and the load-bearing one, is to act as the EXISTENCE GUARD for every
 * other service. `assertTableExists` / `tableHasColumn` are called BEFORE any SQL is
 * built (see records/search/fragments services), and that ordering is the point:
 *
 *   - An unknown table becomes a clean 404 from INFORMATION_SCHEMA rather than a
 *     driver error leaking out of a doomed SELECT.
 *   - By the time a table or column name is back-tick interpolated into a statement,
 *     it has both matched the identifier regex AND been proven to exist. Names cannot
 *     be bound as parameters, so this is the substitute for binding them.
 *
 * Reverse the order — build SQL first, check later — and both properties are gone.
 *
 * Everything is cached for 30 s. A published database only changes when the diffusion
 * process republishes it, so re-introspecting per request would put two extra queries
 * in front of every read for data that is effectively static; 30 s is still short
 * enough that a republish shows up on its own.
 */

import { dbExecute } from '../db/pool';
import { validateTableName } from '../db/query-builder';
import { TTLCache } from '../db/schema-cache';
import { NotFoundError } from '../errors';
import type { TableInfo, ColumnInfo } from '../db/types';
import type { DbRow } from '../db/types';

// Keyed by db (the table list) and by `db:table` (one table) — the pools are per
// database, and two databases may well publish a table of the same name.
const allTablesCache = new TTLCache<TableInfo[]>(30);
const tableCache = new TTLCache<TableInfo>(30);

/**
 * The whole schema in two queries, never one per table: the columns of EVERY table are
 * fetched in a single pass and grouped in memory, because the N+1 alternative scales
 * with the size of the publication.
 *
 * `row_count` here is INFORMATION_SCHEMA's TABLE_ROWS, which InnoDB reports as an
 * ESTIMATE. That is the deliberate trade for a listing: an exact count would mean a
 * `COUNT(*)` per table. `getTable` pays for the exact count on the one table asked about.
 */
export async function listTables(db: string): Promise<TableInfo[]> {
  const cached = allTablesCache.get(db);
  if (cached) return cached;

  const tables = await dbExecute<DbRow[]>(
    db,
    `SELECT TABLE_NAME, TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`,
  );

  const allColumns = await dbExecute<DbRow[]>(
    db,
    `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION`,
  );

  const columnsByTable = new Map<string, ColumnInfo[]>();
  for (const col of allColumns as Array<{ TABLE_NAME: string; COLUMN_NAME: string; DATA_TYPE: string }>) {
    const list = columnsByTable.get(col.TABLE_NAME) ?? [];
    list.push({ name: col.COLUMN_NAME, type: col.DATA_TYPE });
    columnsByTable.set(col.TABLE_NAME, list);
  }

  const tableInfos: TableInfo[] = (tables as Array<{ TABLE_NAME: string; TABLE_ROWS: number }>).map(row => ({
    name: row.TABLE_NAME,
    columns: columnsByTable.get(row.TABLE_NAME) ?? [],
    row_count: row.TABLE_ROWS ?? 0,
  }));

  allTablesCache.set(db, tableInfos);
  return tableInfos;
}

/**
 * One table's columns and its exact row count.
 *
 * This doubles as the existence probe for the whole API. INFORMATION_SCHEMA does not
 * error on an unknown table — it simply returns no rows — so "zero columns" IS the
 * not-found signal, and it must be raised before the `COUNT(*)` below, which
 * interpolates the table name and would otherwise hit a nonexistent table.
 */
export async function getTable(db: string, table: string): Promise<TableInfo> {
  validateTableName(table);

  const cacheKey = `${db}:${table}`;
  const cached = tableCache.get(cacheKey);
  if (cached) return cached;

  const columns = await dbExecute<DbRow[]>(
    db,
    `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
    [table],
  );

  const columnInfos: ColumnInfo[] = (columns as Array<{ COLUMN_NAME: string; DATA_TYPE: string }>).map(
    row => ({ name: row.COLUMN_NAME, type: row.DATA_TYPE }),
  );

  if (columnInfos.length === 0) {
    throw new NotFoundError(`Unknown table: ${table}`);
  }

  // Safe to interpolate: the name matched the identifier regex above, and the query
  // just proved the table exists. A table name can never be a bound parameter.
  const countRows = await dbExecute<DbRow[]>(
    db,
    `SELECT COUNT(*) as total FROM \`${table}\``,
  );
  const total = (countRows as Array<{ total: number }>)[0]?.total ?? 0;

  const result: TableInfo = { name: table, columns: columnInfos, row_count: total };

  tableCache.set(cacheKey, result);
  return result;
}

/**
 * The guard every read path calls first. It is `getTable` under a name that says what
 * it is FOR: the caller wants the 404-or-throw, not the schema. Cheap after the first
 * call in a 30 s window, which is why services can afford to assert unconditionally.
 */
export async function assertTableExists(db: string, table: string): Promise<TableInfo> {
  validateTableName(table);
  return getTable(db, table);
}

/**
 * Whether a table carries a given column — in practice `lang`, since a table's being
 * multilingual is not knowable in advance (thesaurus tables have no `lang` column while
 * content tables do). Callers branch on this to decide whether a `lang` parameter is
 * even meaningful, and to keep `lang` in the projection.
 */
export async function tableHasColumn(db: string, table: string, column: string): Promise<boolean> {
  const info = await getTable(db, table);
  return info.columns.some(col => col.name === column);
}

export function invalidateSchemaCache(): void {
  allTablesCache.invalidate();
  tableCache.invalidate();
}
