import { getPool } from './pool';
import { ValidationError } from '../errors';
import { parseFilters, parseOrder } from '../utils/filter-dsl';
import { parseJsonStrings } from '../utils/parse-json';
import type { TableRow } from './types';

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validateTableName(table: string): void {
  if (!IDENTIFIER_RE.test(table)) {
    throw new ValidationError(`Invalid table name: ${table}`);
  }
}

export function validateColumnName(column: string): void {
  if (!IDENTIFIER_RE.test(column)) {
    throw new ValidationError(`Invalid column name: ${column}`);
  }
}

export interface QueryOptions {
  table: string;
  fields?: string[];
  filter?: string;
  order?: string;
  limit?: number;
  offset?: number;
}

export async function executeQuery<T extends TableRow = TableRow>(
  options: QueryOptions,
): Promise<{ rows: T[]; total: number }> {
  const { table, fields, filter, order, limit, offset } = options;

  validateTableName(table);

  const selectFields = fields && fields.length > 0
    ? fields.map(f => { validateColumnName(f); return `\`${f}\``; }).join(', ')
    : '*';

  const { sql: whereSql, params: whereParams } = filter
    ? parseFilters(filter)
    : { sql: '', params: [] };

  const orderSql = order ? parseOrder(order) : '';

  let sql = `SELECT ${selectFields} FROM \`${table}\``;
  let countSql = `SELECT COUNT(*) as total FROM \`${table}\``;
  const params: (string | number | null)[] = [];

  if (whereSql) {
    sql += ` WHERE ${whereSql}`;
    countSql += ` WHERE ${whereSql}`;
    params.push(...whereParams);
  }

  if (orderSql) {
    sql += ` ORDER BY ${orderSql}`;
  }

  if (limit !== undefined) {
    sql += ` LIMIT ?`;
    params.push(limit);
  }

  if (offset !== undefined) {
    sql += ` OFFSET ?`;
    params.push(offset);
  }

  const pool = getPool();
  const [rows] = await pool.execute(sql, params);
  const [countRows] = await pool.execute(countSql, whereParams);

  const total = (countRows as Array<{ total: number }>)[0]?.total ?? 0;

  return { rows: parseJsonStrings(rows as T[]), total };
}
