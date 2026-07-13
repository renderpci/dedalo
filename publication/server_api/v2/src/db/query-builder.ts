import { dbExecute } from './pool';
import { ValidationError } from '../errors';
import { buildWhere, buildOrder } from '../utils/query-params';
import type { FilterCondition, OrderClause } from '../utils/query-params';
import { parseJsonStrings } from '../utils/parse-json';
import type { TableRow } from './types';
import type { DbRow } from './types';

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
  db: string;
  table: string;
  fields?: string[];
  conditions?: FilterCondition[];
  order?: OrderClause[];
  limit?: number;
  offset?: number;
  withTotal?: boolean;
}

export async function executeQuery<T extends TableRow = TableRow>(
  options: QueryOptions,
): Promise<{ rows: T[]; total?: number }> {
  const { db, table, fields, conditions = [], order = [], limit, offset, withTotal = false } = options;

  validateTableName(table);

  const selectFields = fields && fields.length > 0
    ? fields.map(f => { validateColumnName(f); return `\`${f}\``; }).join(', ')
    : '*';

  const { sql: whereSql, params: whereParams } = buildWhere(conditions);
  const orderSql = buildOrder(order);

  let sql = `SELECT ${selectFields} FROM \`${table}\``;
  const params: (string | number | null)[] = [];

  if (whereSql) {
    sql += ` WHERE ${whereSql}`;
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

  // limit=0 is a count-only request: skip the data query entirely
  const rows = limit === 0
    ? []
    : await dbExecute<DbRow[]>(db, sql, params);

  let total: number | undefined;
  if (withTotal) {
    let countSql = `SELECT COUNT(*) as total FROM \`${table}\``;
    if (whereSql) {
      countSql += ` WHERE ${whereSql}`;
    }
    const countRows = await dbExecute<DbRow[]>(db, countSql, whereParams);
    total = (countRows as Array<{ total: number }>)[0]?.total ?? 0;
  }

  return { rows: parseJsonStrings(rows as unknown as T[]), total };
}
