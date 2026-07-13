import { assertKnownDb } from '../db/pool';
import { textFragments, avFragments } from '../services/search.service';
import { fragmentsQuerySchema, avFragmentsQuerySchema } from '../validators';
import { parseRecordId } from './records';
import { json } from '../utils/response';

export async function handleTextFragments(_req: Request, params: Record<string, string>, url: URL): Promise<Response> {
  const db = assertKnownDb(params.db);
  const id = parseRecordId(params.id);
  const query = fragmentsQuerySchema.parse(Object.fromEntries(url.searchParams));

  const fragments = await textFragments(db, params.table, id, query);

  return json({
    data: fragments,
    meta: { section_id: id, terms: query.terms },
  });
}

export async function handleAvFragments(_req: Request, params: Record<string, string>, url: URL): Promise<Response> {
  const db = assertKnownDb(params.db);
  const id = parseRecordId(params.id);
  const query = avFragmentsQuerySchema.parse(Object.fromEntries(url.searchParams));

  const fragments = await avFragments(db, params.table, id, query);

  return json({
    data: fragments,
    meta: { section_id: id, terms: query.terms },
  });
}
