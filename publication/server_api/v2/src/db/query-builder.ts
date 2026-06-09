import { getPool } from './pool';
import { config } from '../config';
import type { TableRow } from './types';

const TABLE_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const COLUMN_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FORBIDDEN_SQL = /\b(DELETE|UPDATE|INSERT|TRUNCATE|DROP|ALTER|CREATE|UNION|INTO\s+OUTFILE|LOAD_FILE|LOAD\s+DATA)\b/i;

export function validateTableName(table: string): void {
  if (!TABLE_NAME_REGEX.test(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }
}

export function validateColumnName(column: string): void {
  if (!COLUMN_NAME_REGEX.test(column)) {
    throw new Error(`Invalid column name: ${column}`);
  }
}

export function validateWhereClause(where: string): void {
  if (FORBIDDEN_SQL.test(where)) {
    throw new Error('Forbidden SQL keywords in WHERE clause');
  }
}

export function validateOrderClause(order: string): void {
  if (FORBIDDEN_SQL.test(order)) {
    throw new Error('Forbidden SQL keywords in ORDER clause');
  }
}

export interface QueryOptions {
  table: string;
  fields?: string[];
  where?: string;
  whereParams?: any[];
  order?: string;
  limit?: number;
  offset?: number;
}

export async function executeQuery<T extends TableRow = TableRow>(
  options: QueryOptions
): Promise<{ rows: T[]; total: number }> {
  const { table, fields, where, whereParams = [], order, limit, offset } = options;

  validateTableName(table);

  const selectFields = fields && fields.length > 0
    ? fields.map(f => {
        validateColumnName(f);
        return `\`${f}\``;
      }).join(', ')
    : '*';

  let sql = `SELECT ${selectFields} FROM \`${table}\``;
  let countSql = `SELECT COUNT(*) as total FROM \`${table}\``;

  const params: any[] = [];

  if (where) {
    validateWhereClause(where);
    sql += ` WHERE ${where}`;
    countSql += ` WHERE ${where}`;
    params.push(...whereParams);
  }

  if (order) {
    validateOrderClause(order);
    sql += ` ORDER BY ${order}`;
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

  const total = (countRows as any[])[0]?.total || 0;

  return { rows: rows as T[], total };
}

export async function executeRawQuery<T extends TableRow = TableRow>(
  sql: string,
  params: any[] = []
): Promise<T[]> {
  if (FORBIDDEN_SQL.test(sql)) {
    throw new Error('Forbidden SQL keywords detected');
  }

  const pool = getPool();
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}
