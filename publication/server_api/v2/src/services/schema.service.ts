import { getPool } from '../db/pool';
import { validateTableName } from '../db/query-builder';
import { TTLCache } from '../db/schema-cache';
import type { SchemaResponse, TableInfo, ColumnInfo } from '../db/types';

const schemaCache = new TTLCache<SchemaResponse>(30);
const tableCache = new TTLCache<SchemaResponse>(30);

export async function getSchema(table?: string): Promise<SchemaResponse> {
  if (table) {
    return getSingleTableSchema(table);
  }
  return getAllTablesSchema();
}

async function getSingleTableSchema(table: string): Promise<SchemaResponse> {
  validateTableName(table);

  const cached = tableCache.get(table);
  if (cached) return cached;

  const pool = getPool();

  const [columns] = await pool.execute(
    `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
    [table],
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) as total FROM \`${table}\``,
  );

  const columnInfos: ColumnInfo[] = (columns as Array<{ COLUMN_NAME: string; DATA_TYPE: string }>).map(
    row => ({ name: row.COLUMN_NAME, type: row.DATA_TYPE }),
  );

  const total = (countRows as Array<{ total: number }>)[0]?.total ?? 0;

  const result: SchemaResponse = {
    tables: [{ name: table, columns: columnInfos, row_count: total }],
  };

  tableCache.set(table, result);
  return result;
}

async function getAllTablesSchema(): Promise<SchemaResponse> {
  const cached = schemaCache.get('all');
  if (cached) return cached;

  const pool = getPool();

  const [tables] = await pool.execute(
    `SELECT TABLE_NAME, TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`,
  );

  const [allColumns] = await pool.execute(
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

  const result: SchemaResponse = { tables: tableInfos };

  schemaCache.set('all', result);
  return result;
}

export function invalidateSchemaCache(): void {
  schemaCache.invalidate();
  tableCache.invalidate();
}
