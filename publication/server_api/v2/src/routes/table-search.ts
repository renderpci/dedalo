import { assertKnownDb } from '../db/pool';
import { fulltextSearch } from '../services/search.service';
import { fulltextQuerySchema } from '../validators';
import { buildLinkHeader } from '../utils/links';
import { json } from '../utils/response';

export async function handleTableSearch(_req: Request, params: Record<string, string>, url: URL): Promise<Response> {
  const db = assertKnownDb(params.db);
  const query = fulltextQuerySchema.parse(Object.fromEntries(url.searchParams));

  const { rows, total } = await fulltextSearch(db, params.table, {
    q: query.q,
    column: query.column,
    limit: query.limit,
    offset: query.offset,
    withTotal: query.count,
    resolve_relations: query.resolve_relations,
    resolve_inverse_relations: query.resolve_inverse_relations,
  });

  const headers: Record<string, string> = {};
  const link = buildLinkHeader(url, query.limit, query.offset, rows.length, total);
  if (link) headers['Link'] = link;

  return json({
    data: rows,
    pagination: {
      limit: query.limit,
      offset: query.offset,
      ...(total !== undefined ? { total } : {}),
    },
  }, 200, headers);
}
