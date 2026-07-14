/**
 * Schema introspection: `GET /:db/tables` and `GET /:db/tables/:table`.
 *
 * This is how a client discovers a published database it has never seen —
 * including whether a table is multilingual (it is, iff a `lang` column appears
 * in its schema; that is the same check the record routes make internally).
 *
 * The two routes report `row_count` from DIFFERENT sources, deliberately:
 *
 *   - the LIST reads INFORMATION_SCHEMA.TABLE_ROWS, which for InnoDB is an
 *     ESTIMATE — counting every row of every table would mean a full scan per
 *     table on every listing, for a number nobody paginates on;
 *   - the SINGLE table runs an exact `SELECT COUNT(*)`, which is one scan of
 *     one table that the caller explicitly asked about.
 *
 * The wire contract states this asymmetry outright (records_and_languages.md,
 * "Two count sources"), so do not "fix" the estimate — it is the documented
 * cost tradeoff, not an oversight. Both results come from a ~30s TTL cache in
 * schema.service, which is what keeps the exact count affordable to repeat.
 *
 * `assertKnownDb` gates both on the DB_NAMES allowlist before any query runs;
 * the table name is validated as a plain SQL identifier (and an unknown table
 * surfaces as a 404) inside the service.
 */

import { assertKnownDb } from '../db/pool';
import { listTables, getTable } from '../services/schema.service';
import { json } from '../utils/response';

export async function handleListTables(_req: Request, params: Record<string, string>): Promise<Response> {
  const db = assertKnownDb(params.db);
  const tables = await listTables(db);

  return json({
    data: tables.map(table => ({
      name: table.name,
      // The listing reduces each table's columns to a count; the full column
      // array is the single-table route's payload, not this one's.
      row_count: table.row_count,
      column_count: table.columns.length,
    })),
  });
}

export async function handleGetTable(_req: Request, params: Record<string, string>): Promise<Response> {
  const db = assertKnownDb(params.db);
  const table = await getTable(db, params.table);

  return json({ data: table });
}
