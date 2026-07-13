import { assertKnownDb } from '../db/pool';
import { listTables, getTable } from '../services/schema.service';
import { json } from '../utils/response';

export async function handleListTables(_req: Request, params: Record<string, string>): Promise<Response> {
  const db = assertKnownDb(params.db);
  const tables = await listTables(db);

  return json({
    data: tables.map(table => ({
      name: table.name,
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
