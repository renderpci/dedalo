import { dbExecute } from '../db/pool';
import { validateTableName } from '../db/query-builder';
import { TTLCache } from '../db/schema-cache';
import { NotFoundError } from '../errors';
import type { TableInfo, ColumnInfo } from '../db/types';
import type { RowDataPacket } from 'mysql2/promise';

const allTablesCache = new TTLCache<TableInfo[]>(30);
const tableCache = new TTLCache<TableInfo>(30);

export async function listTables(db: string): Promise<TableInfo[]> {
  const cached = allTablesCache.get(db);
  if (cached) return cached;

  const tables = await dbExecute<RowDataPacket[]>(
    db,
    `SELECT TABLE_NAME, TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`,
  );

  const allColumns = await dbExecute<RowDataPacket[]>(
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

export async function getTable(db: string, table: string): Promise<TableInfo> {
  validateTableName(table);

  const cacheKey = `${db}:${table}`;
  const cached = tableCache.get(cacheKey);
  if (cached) return cached;

  const columns = await dbExecute<RowDataPacket[]>(
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

  const countRows = await dbExecute<RowDataPacket[]>(
    db,
    `SELECT COUNT(*) as total FROM \`${table}\``,
  );
  const total = (countRows as Array<{ total: number }>)[0]?.total ?? 0;

  const result: TableInfo = { name: table, columns: columnInfos, row_count: total };

  tableCache.set(cacheKey, result);
  return result;
}

export async function assertTableExists(db: string, table: string): Promise<TableInfo> {
  validateTableName(table);
  return getTable(db, table);
}

export async function tableHasColumn(db: string, table: string, column: string): Promise<boolean> {
  const info = await getTable(db, table);
  return info.columns.some(col => col.name === column);
}

export function invalidateSchemaCache(): void {
  allTablesCache.invalidate();
  tableCache.invalidate();
}
