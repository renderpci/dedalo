/**
 * Reading published records: the listing (`/records`) and the single record
 * (`/records/{id}`).
 *
 * The one thing to internalise about the published schema: a record is keyed by
 * `section_id`, and a multilingual table holds ONE ROW PER LANGUAGE under that same
 * section_id (the PRIMARY KEY is the composite `(section_id, lang)`; there is no
 * surrogate `id`). So "get a record" is not "get a row" — `getRecord` returns an ARRAY,
 * one entry per language variant, and narrows to a single entry only when the caller
 * names a `lang`. Tables without a `lang` column (thesauri, for instance) simply yield
 * one row and no language metadata.
 *
 * Both functions assert the table exists before building any SQL (schema.service), and
 * both apply relation resolution as a final decoration step over the rows they fetched.
 */

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

/**
 * Relation resolution runs AFTER the rows are fetched, never as a JOIN — it is a
 * post-pass that replaces id-carrying cells with the rows they point at. Keeping it
 * here means the listing and the single-record path cannot drift on the semantics.
 *
 * Forward (`resolve_relations`) before inverse (`resolve_inverse_relations`): they touch
 * disjoint columns (arbitrary id columns vs. the `dd_relations` column), so the order is
 * not observable — but it is fixed, so the two callers behave identically.
 */
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

/**
 * Every column the client named must be a REAL column, checked before any SQL is built.
 *
 * The query builder's identifier regex proves a name is safe to interpolate; it does not prove
 * the column exists. Without this, a typo in `sort`, `fields` or `filter[…]` reached MariaDB,
 * came back as an "unknown column" driver error, and was served as `500 Internal Server Error`
 * — the server blaming itself for the client's typo, and saying nothing about which name was
 * wrong. It is a client error, and the docs already promise `400`.
 *
 * The fulltext path always did this (`assertSearchableColumn`); the record path did not. Column
 * lists come from the 30-second schema cache, so in the common case this costs no extra query.
 */
async function assertColumnsExist(
  db: string,
  table: string,
  options: Pick<ListRecordsOptions, 'fields' | 'conditions' | 'order'>,
): Promise<void> {
  const named = [
    ...(options.fields ?? []),
    ...(options.conditions ?? []).map(c => c.field),
    ...(options.order ?? []).map(o => o.field),
  ];

  for (const column of named) {
    if (!(await tableHasColumn(db, table, column))) {
      throw new ValidationError(`Unknown column "${column}" in table "${table}"`);
    }
  }
}

/**
 * The listing. `limit: 0` with `withTotal` is the count-only request — `executeQuery`
 * skips the data query entirely and only the COUNT runs (the MCP `count_records` tool
 * and `?limit=0&count=true` both rely on this).
 */
export async function listRecords(
  db: string,
  table: string,
  options: ListRecordsOptions,
): Promise<{ rows: Record<string, unknown>[]; total?: number }> {
  await assertTableExists(db, table);
  await assertColumnsExist(db, table, options);

  // `lang` is just another equality filter — it is a real column, not a dimension of the
  // query language. Copy the caller's conditions rather than pushing into them: the array
  // belongs to the caller.
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
//
// `hasLang` decides three things at once, which is why it is resolved up front: whether
// a `lang` argument is even legal, whether `lang` must be forced back into the
// projection, and whether the result is ordered. Asking a table without the column to
// filter by language is a client mistake, not an empty result — hence the 400 rather
// than a query that would fail in the driver.
export async function getRecord(
  db: string,
  table: string,
  id: number,
  options: GetRecordOptions = {},
): Promise<RecordResult> {
  await assertTableExists(db, table);
  // Same guard as the listing: a typo in `fields` is a 400, not a 500 from the driver.
  await assertColumnsExist(db, table, { fields: options.fields });

  const hasLang = await tableHasColumn(db, table, COLUMNS.LANG);

  if (options.lang && !hasLang) {
    throw new ValidationError(`Table "${table}" has no "${COLUMNS.LANG}" column; the lang parameter is not supported`);
  }

  // Keep lang in the selection so language variants stay identifiable.
  // Without this, `fields=title` on a multilingual record returns N indistinguishable
  // titles and the caller has no way to tell which language each one is.
  let fields = options.fields;
  if (fields && fields.length > 0 && hasLang && !fields.includes(COLUMNS.LANG)) {
    fields = [...fields, COLUMNS.LANG];
  }

  const conditions: FilterCondition[] = [condition(COLUMNS.SECTION_ID, 'eq', [id])];
  if (options.lang) {
    conditions.push(condition(COLUMNS.LANG, 'eq', [options.lang]));
  }

  // Ordering by lang makes the variant array stable across requests — the row order the
  // storage engine happens to return is not a contract, and clients index into this.
  const order: OrderClause[] = hasLang ? [{ field: COLUMNS.LANG, direction: 'ASC' }] : [];

  const { rows } = await executeQuery({ db, table, fields, conditions, order });

  // No rows at all means the section_id does not exist (or not in that language) — the
  // 404 lives here rather than in the route, because only this layer knows the keying.
  if (rows.length === 0) {
    const langSuffix = options.lang ? ` (lang: ${options.lang})` : '';
    throw new NotFoundError(`Record not found: ${table}/${id}${langSuffix}`);
  }

  // The variants actually returned, not the variants that exist: with `lang` narrowing
  // the query this is a single entry. Routes surface it as `meta.languages`.
  const languages = hasLang
    ? [...new Set((rows as Record<string, unknown>[]).map(row => row[COLUMNS.LANG]).filter((v): v is string => typeof v === 'string'))]
    : [];

  const resolved = await applyResolvers(db, rows as Record<string, unknown>[], options);

  return { rows: resolved, languages, hasLang };
}
