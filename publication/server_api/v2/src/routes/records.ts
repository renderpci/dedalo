import { assertKnownDb } from '../db/pool';
import { listRecords, getRecord } from '../services/records.service';
import { listRecordsQuerySchema, getRecordQuerySchema, recordIdSchema } from '../validators';
import { parseFilterParams, parseSort } from '../utils/query-params';
import { buildLinkHeader } from '../utils/links';
import { json } from '../utils/response';
import { ValidationError } from '../errors';

export function parseRecordId(raw: string): number {
  const parsed = recordIdSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(`Invalid record id: "${raw}". Expected a positive integer`);
  }
  return parsed.data;
}

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

export async function handleGetRecord(_req: Request, params: Record<string, string>, url: URL): Promise<Response> {
  const db = assertKnownDb(params.db);
  const id = parseRecordId(params.id);
  const query = getRecordQuerySchema.parse(Object.fromEntries(url.searchParams));

  const { rows, languages, hasLang } = await getRecord(db, params.table, id, {
    fields: parseFields(query.fields),
    lang: query.lang,
    resolve_relations: query.resolve_relations,
    resolve_inverse_relations: query.resolve_inverse_relations,
  });

  const headers: Record<string, string> = {};
  if (query.lang) headers['Content-Language'] = query.lang;

  return json({
    data: rows,
    meta: {
      section_id: id,
      ...(hasLang ? { languages } : {}),
    },
  }, 200, headers);
}
