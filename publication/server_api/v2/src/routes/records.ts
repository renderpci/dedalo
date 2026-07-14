/**
 * The record routes — the main query surface of the API.
 *
 *   GET /:db/tables/:table/records      — list, filtered/sorted/paginated
 *   GET /:db/tables/:table/records/:id  — one record, by section_id
 *
 * THE MULTILINGUAL CONTRACT. A record is identified by its `section_id`, NOT by
 * a surrogate row id: the published tables are keyed by (section_id, lang) and
 * a translation is a whole extra ROW, not a nested field. So a single record is
 * a SET of rows, and `data` is ALWAYS an array — one element per language
 * variant (ordered by lang), unless `?lang=lg-xxx` narrows it to one. A client
 * that reads `data[0]` and stops is reading an arbitrary language.
 *
 * The same follows through the list route: without `?lang=`, every variant of
 * every record is its own row and counts against `limit`.
 *
 * Not every published table is multilingual (thesaurus/`ts_*` tables are not).
 * The service detects that at runtime, which is why `meta.languages` is emitted
 * conditionally (`hasLang`) rather than as an empty array: its ABSENCE is the
 * signal that the concept does not apply to this table. `?lang=` on such a
 * table is a 400, not a silently ignored parameter.
 *
 * Validation is a chokepoint, not a formality: the id, the query string, the
 * filter DSL and the sort list are all parsed into typed structures here, and
 * every identifier that reaches SQL is re-validated against
 * `^[A-Za-z_][A-Za-z0-9_]*$` in the query builder. Nothing from the URL is
 * interpolated raw.
 */

import { assertKnownDb } from '../db/pool';
import { listRecords, getRecord } from '../services/records.service';
import { listRecordsQuerySchema, getRecordQuerySchema, recordIdSchema } from '../validators';
import { parseFilterParams, parseSort } from '../utils/query-params';
import { buildLinkHeader } from '../utils/links';
import { json } from '../utils/response';
import { ValidationError } from '../errors';

/**
 * Path-segment `:id` → section_id. Exported because the fragment routes address
 * the same records by the same id and must reject a bad one identically (a raw
 * `.parse()` would surface Zod's own message instead of this one).
 */
export function parseRecordId(raw: string): number {
  const parsed = recordIdSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(`Invalid record id: "${raw}". Expected a positive integer`);
  }
  return parsed.data;
}

/**
 * `?fields=a,b,c` → a column allowlist. An empty or all-blank list collapses to
 * `undefined`, i.e. "no projection" (SELECT *) — never to an empty projection,
 * which would be an unbuildable query.
 */
export function parseFields(fields?: string): string[] | undefined {
  if (!fields) return undefined;
  const list = fields.split(',').map(f => f.trim()).filter(Boolean);
  return list.length > 0 ? list : undefined;
}

export async function handleListRecords(_req: Request, params: Record<string, string>, url: URL): Promise<Response> {
  const db = assertKnownDb(params.db);
  const query = listRecordsQuerySchema.parse(Object.fromEntries(url.searchParams));
  const conditions = parseFilterParams(url.searchParams);
  const order = query.sort ? parseSort(query.sort) : [];

  const { rows, total } = await listRecords(db, params.table, {
    fields: parseFields(query.fields),
    conditions,
    order,
    limit: query.limit,
    offset: query.offset,
    lang: query.lang,
    withTotal: query.count,
    resolve_relations: query.resolve_relations,
    resolve_inverse_relations: query.resolve_inverse_relations,
  });

  // RFC 8288 pagination, built from the request URL so filters and sort survive
  // into the next/prev links. It is a header, not a body field, and it is absent
  // on the last page rather than being emitted as a dead link.
  const headers: Record<string, string> = {};
  const link = buildLinkHeader(url, query.limit, query.offset, rows.length, total);
  if (link) headers['Link'] = link;

  return json({
    data: rows,
    pagination: {
      limit: query.limit,
      offset: query.offset,
      // `total` costs a second COUNT query, so it is opt-in (?count=true) and
      // the key is omitted — not null — when the client did not ask for it.
      ...(total !== undefined ? { total } : {}),
    },
  }, 200, headers);
}

export async function handleGetRecord(_req: Request, params: Record<string, string>, url: URL): Promise<Response> {
  const db = assertKnownDb(params.db);
  const id = parseRecordId(params.id);
  // A tighter schema than the list's: no limit/offset/sort/count — a record's
  // variant set is small and bounded, and paginating it would be meaningless.
  const query = getRecordQuerySchema.parse(Object.fromEntries(url.searchParams));

  const { rows, languages, hasLang } = await getRecord(db, params.table, id, {
    fields: parseFields(query.fields),
    lang: query.lang,
    resolve_relations: query.resolve_relations,
    resolve_inverse_relations: query.resolve_inverse_relations,
  });

  // The response body carries a single language only when the client narrowed
  // it, so that is the only case where Content-Language can honestly be set.
  const headers: Record<string, string> = {};
  if (query.lang) headers['Content-Language'] = query.lang;

  return json({
    data: rows,
    meta: {
      section_id: id,
      // Omitted entirely on a table with no `lang` column: an empty `languages`
      // array would read as "this record has no translations", which is a
      // different claim from "this table is not multilingual".
      ...(hasLang ? { languages } : {}),
    },
  }, 200, headers);
}
