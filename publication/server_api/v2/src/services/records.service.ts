import { executeQuery } from '../db/query-builder';
import { NotFoundError, ValidationError } from '../errors';
import { COLUMNS } from '../constants';
import { assertTableExists, tableHasColumn } from './schema.service';
import { resolveRelations, resolveInverseRelations, normalizeResolveRelations, normalizeResolveInverseRelations } from './resolve.service';
import { condition } from '../utils/query-params';
import type { FilterCondition, OrderClause } from '../utils/query-params';

export interface ResolveOptions {
  resolve_relations?: string;
  resolve_inverse_relations?: string;
}

export interface ListRecordsOptions extends ResolveOptions {
  fields?: string[];
  conditions?: FilterCondition[];
  order?: OrderClause[];
  limit: number;
  offset: number;
  lang?: string;
  withTotal?: boolean;
}

export interface GetRecordOptions extends ResolveOptions {
  fields?: string[];
  lang?: string;
}

async function applyResolvers(
  db: string,
  rows: Record<string, unknown>[],
  options: ResolveOptions,
): Promise<Record<string, unknown>[]> {
  let resolved = rows;

  const relMap = normalizeResolveRelations(options.resolve_relations);
  const invMap = normalizeResolveInverseRelations(options.resolve_inverse_relations);

  if (relMap) {
    resolved = await resolveRelations(db, resolved, relMap);
  }
  if (invMap) {
    resolved = await resolveInverseRelations(db, resolved, invMap);
  }

  return resolved;
}

export async function listRecords(
  db: string,
  table: string,
  options: ListRecordsOptions,
): Promise<{ rows: Record<string, unknown>[]; total?: number }> {
  await assertTableExists(db, table);

  const conditions = [...(options.conditions ?? [])];
  if (options.lang) {
    conditions.push(condition(COLUMNS.LANG, 'eq', [options.lang]));
  }

  const { rows, total } = await executeQuery({
    db,
    table,
    fields: options.fields,
    conditions,
    order: options.order,
    limit: options.limit,
    offset: options.offset,
    withTotal: options.withTotal,
  });

  const resolved = await applyResolvers(db, rows as Record<string, unknown>[], options);

  return { rows: resolved, total };
}

export interface RecordResult {
  rows: Record<string, unknown>[];
  languages: string[];
  hasLang: boolean;
}

// A record is identified by section_id; its language variants are separate
// rows sharing that id. Without `lang` all variants are returned.
export async function getRecord(
  db: string,
  table: string,
  id: number,
  options: GetRecordOptions = {},
): Promise<RecordResult> {
  await assertTableExists(db, table);

  const hasLang = await tableHasColumn(db, table, COLUMNS.LANG);

  if (options.lang && !hasLang) {
    throw new ValidationError(`Table "${table}" has no "${COLUMNS.LANG}" column; the lang parameter is not supported`);
  }

  // Keep lang in the selection so language variants stay identifiable
  let fields = options.fields;
  if (fields && fields.length > 0 && hasLang && !fields.includes(COLUMNS.LANG)) {
    fields = [...fields, COLUMNS.LANG];
  }

  const conditions: FilterCondition[] = [condition(COLUMNS.SECTION_ID, 'eq', [id])];
  if (options.lang) {
    conditions.push(condition(COLUMNS.LANG, 'eq', [options.lang]));
  }

  const order: OrderClause[] = hasLang ? [{ field: COLUMNS.LANG, direction: 'ASC' }] : [];

  const { rows } = await executeQuery({ db, table, fields, conditions, order });

  if (rows.length === 0) {
    const langSuffix = options.lang ? ` (lang: ${options.lang})` : '';
    throw new NotFoundError(`Record not found: ${table}/${id}${langSuffix}`);
  }

  const languages = hasLang
    ? [...new Set((rows as Record<string, unknown>[]).map(row => row[COLUMNS.LANG]).filter((v): v is string => typeof v === 'string'))]
    : [];

  const resolved = await applyResolvers(db, rows as Record<string, unknown>[], options);

  return { rows: resolved, languages, hasLang };
}
