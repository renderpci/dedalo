/**
 * The SQL-construction chokepoint for the API's table-driven reads, and the home
 * of the identifier allowlist every hand-built query in the codebase borrows.
 *
 * The whole injection story of this read-only API rests on one split:
 *
 * - **Values are never interpolated.** Every value travels as a bound `?`
 *   parameter (the WHERE fragment and its params come from utils/query-params,
 *   LIMIT/OFFSET are bound here), so no user-supplied string is ever handed to
 *   the server as SQL text.
 * - **Identifiers cannot be bound** — the wire protocol has no placeholder for a
 *   table or column name — so identifiers are the ONLY user input that reaches a
 *   statement as text. Each one is matched against IDENTIFIER_RE and only then
 *   back-tick quoted. The regex is an allowlist, not an escape routine: nothing
 *   outside `[A-Za-z0-9_]` survives it, so a back-tick, quote, space, comment
 *   marker or semicolon can never appear inside the quoted identifier.
 *
 * Table names come from the URL path and column names from `fields`, `sort` and
 * the filter keys, so they are all user input. That is why validation happens
 * HERE, immediately before interpolation, even though the services validate too:
 * the check must live at the point of concatenation, not merely upstream of it.
 */

import { dbExecute } from './pool';
import { ValidationError } from '../errors';
import { buildWhere, buildOrder } from '../utils/query-params';
import type { FilterCondition, OrderClause } from '../utils/query-params';
import { parseJsonStrings } from '../utils/parse-json';
import type { TableRow } from './types';
import type { DbRow } from './types';

// Deliberately narrower than MariaDB's own identifier grammar (which allows
// almost anything inside back-ticks): published tables and columns are generated
// by the diffusion process and always fit this shape, so nothing legitimate is
// lost by refusing the rest.
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Both validators are exported because the services that hand-build SQL
 * (resolve.service, search.service, schema.service) interpolate identifiers of
 * their own and must run them through the same allowlist before quoting.
 *
 * A pass proves only that the name is SAFE to interpolate — not that it EXISTS.
 * Existence is a separate schema lookup (schema.service.assertTableExists),
 * which is what turns an unknown-but-well-formed table into a clean 404.
 */
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

/**
 * Runs one SELECT against a published table, with an optional COUNT(*) twin.
 *
 * Ordering of the bound params matters: MariaDB binds `?` positionally, so the
 * WHERE params must be pushed before the LIMIT and OFFSET values, in the same
 * order the fragments were appended to the statement.
 *
 * `T` is a caller convenience only. The driver returns DbRow (values `unknown`),
 * and the rows are cast — nothing at runtime checks a row against `T`.
 *
 * Hazard: `offset` is only ever meaningful alongside `limit` — MariaDB has no
 * OFFSET-without-LIMIT form — so a caller must pass both or neither.
 */
export async function executeQuery<T extends TableRow = TableRow>(
  options: QueryOptions,
): Promise<{ rows: T[]; total?: number }> {
  const { db, table, fields, conditions = [], order = [], limit, offset, withTotal = false } = options;

  validateTableName(table);

  // No `fields` means SELECT * — the published tables are the projection, and a
  // client that wants a subset supplies it, one validated identifier at a time.
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
  // (`LIMIT 0` would still cost a round trip to fetch nothing). The statement
  // built above is simply discarded — pair this with withTotal to get just the
  // `pagination.total`.
  const rows = limit === 0
    ? []
    : await dbExecute<DbRow[]>(db, sql, params);

  let total: number | undefined;
  if (withTotal) {
    // The count must see the same WHERE — and ONLY the WHERE. It reuses
    // whereParams rather than params precisely because the LIMIT/OFFSET binds
    // appended above have no placeholder to fill in this statement.
    let countSql = `SELECT COUNT(*) as total FROM \`${table}\``;
    if (whereSql) {
      countSql += ` WHERE ${whereSql}`;
    }
    const countRows = await dbExecute<DbRow[]>(db, countSql, whereParams);
    total = (countRows as Array<{ total: number }>)[0]?.total ?? 0;
  }

  // Published columns hold JSON inside TEXT, which the driver hands back as
  // strings; every read path in the API goes through this one decode step.
  return { rows: parseJsonStrings(rows as unknown as T[]), total };
}
