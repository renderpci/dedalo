/**
 * Read-side port of the BASE forward-search RECORDS path
 * (core/search/class.search.php::parse_sql_default + trait.from/select/where/order),
 * for the NO-FILTER / section_tipo plain-list case — the records query behind a
 * section LIST view.
 *
 * This is the INNER SELECT of the count (search_count_sql.ts), turned into the
 * actual paginated records query: the same FROM/WHERE/UNION machinery, plus the
 * verified DEFAULT ORDER BY + LIMIT/OFFSET. sections::set_up forces
 * `sqo->select = []`, so the projection is ONLY section_id + section_tipo (the
 * locators the list render consumes).
 *
 * SHAPE (verified live against PHP + psql, dedalo7_mib):
 *
 *   single section_tipo (one table, no custom order/filter → $use_window=false):
 *     SELECT DISTINCT ON (<alias>.section_id) <alias>.section_id,
 *     <alias>.section_tipo
 *     FROM <table> AS <alias>
 *     WHERE (<alias>.section_tipo = $1::text)
 *     ORDER BY <alias>.section_id ASC
 *     LIMIT n OFFSET m
 *
 *   multiple section_tipos spanning DIFFERENT tables (UNION ALL per table):
 *     SELECT DISTINCT ON (mix.section_id) mix.section_id,
 *     mix.section_tipo
 *     FROM <table_a> AS mix
 *     WHERE (mix.section_tipo IN ($1,$2))
 *     UNION ALL
 *     SELECT DISTINCT ON (mix.section_id) mix.section_id,
 *     mix.section_tipo
 *     FROM <table_b> AS mix
 *     WHERE (mix.section_tipo IN ($1,$2))
 *     ORDER BY section_id ASC
 *     LIMIT n OFFSET m
 *
 * ── THE DEFAULT ORDER BY (the parity-critical part) ──
 * For an ordinary section with NO custom sqo->order, build_sql_query_order_default
 * (trait.order.php:324) emits `<main_alias>.section_id ASC`. The activity-log
 * section (DEDALO_ACTIVITY_SECTION_TIPO = 'dd542') flips to DESC; that section is
 * NOT served here (its data column models are not ported), so the records path
 * only ever emits ASC. VERIFIED: live PHP `read` for numisdata179 limit-3 returns
 * section_ids [1,2,3]; limit-3 offset-2 returns [3,4,5] (paginated_key 2,3,4);
 * both match the psql `DISTINCT ON (section_id) … ORDER BY section_id ASC`
 * byte-for-byte.
 *
 * For the multi-table UNION case PHP strips the alias from the OUTER order
 * (str_replace 'mix.' → '') because UNION result columns are not alias-qualified
 * (parse_sql_default:1252). The single-table case keeps the alias on the inline
 * ORDER BY.
 *
 * ── LIMIT / OFFSET (build_limit_offset_sql, trait.utils.php:259) ──
 * limit: sanitize_sql_limit → non-positive / 'all' → no LIMIT (LIMIT ALL omitted);
 * positive int → `LIMIT n`. offset: `(int)offset`; only appended when > 0.
 *
 * SCOPE / DECLINED (the handler proxies these to PHP):
 *   - any sqo.filter / filter_by_locators (custom WHERE; the filtered list reuses
 *     buildFilterWhere when tractable — see the optional `filter` arg — but the
 *     read handler currently declines filtered lists),
 *   - any custom sqo.order (would flip $use_window=true → the wrapper subquery +
 *     companion SELECT aliases; not ported),
 *   - the activity / time-machine non-DISTINCT branches,
 *   - the DEDALO_SECTION_USERS_TIPO `section_id > 0` extra-where.
 *
 * PARAM MODEL: identical to search_count_sql — a 0-indexed positional list with
 * strict-equality dedup; section_tipo params first, then filter params. The
 * multi-table UNION reuses the SAME section_tipo params across every branch.
 */

import type { SqlAndParams } from './search_related_sql.ts';
import { buildFilterWhere } from './filter_where.ts';
import type { ConformedFilter } from './filter_validate.ts';
import { trimTipo } from './search_count_sql.ts';

const EOL = '\n';

/** Allowlisted matrix-table identifier (fail-closed; never client-sourced). */
const SAFE_TABLE = /^[a-z_][a-z0-9_]*$/;

/** The activity-log section: the only section whose default order is DESC. */
const ACTIVITY_SECTION_TIPO = 'dd542';

/** The SQO shape the base no-filter records query needs (subset of the PHP SQO). */
export interface RecordsSqo {
  /** Sections to search. First is main_section_tipo; >1 → alias 'mix'. */
  section_tipo: string[];
  /** LIMIT n (sanitize_sql_limit: non-positive / 'all' → no limit). */
  limit?: number | string;
  /** OFFSET m (only emitted when > 0). */
  offset?: number;
}

/**
 * Sanitise a LIMIT exactly like search::sanitize_sql_limit(): 'all'/'ALL' → null
 * (LIMIT ALL, omitted); a positive int → that int; anything else → null.
 */
function sanitizeLimit(value: number | string | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim().toLowerCase() === 'all') return null;
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Append to the positional param list (strict === dedup) and return its `$n`. */
function getPlaceholder(params: unknown[], value: unknown): string {
  const idx = params.findIndex((p) => p === value);
  if (idx !== -1) return `$${idx + 1}`;
  params.push(value);
  return `$${params.length}`;
}

/**
 * Stamp the resolved alias onto every leaf clause of a conformed filter (port of
 * conform_filter setting table_alias). Returns a new tree (no input mutation).
 */
function aliasFilter(filter: ConformedFilter, alias: string): ConformedFilter {
  return {
    op: filter.op,
    items: filter.items.map((item) =>
      'op' in item
        ? aliasFilter(item, alias)
        : { ...item, clause: { ...item.clause, table_alias: alias } },
    ),
  };
}

/**
 * Build the base no-filter RECORDS SELECT SQL + positional params for the SQO.
 *
 * Faithful to parse_sql_default for the plain (no custom order, no join) list
 * case: builds the inner `SELECT DISTINCT ON (<alias>.section_id) <alias>.section_id,
 * <alias>.section_tipo FROM <table> AS <alias> WHERE (<predicate>)`, UNION
 * ALL-expands across distinct tables, then appends the default ORDER BY
 * (section_id ASC) + LIMIT/OFFSET.
 *
 * `tableForSection` maps each section_tipo to its table (resolved upstream from
 * the ontology). `filter` (optional) reuses buildFilterWhere for a filtered list.
 *
 * @throws if any resolved table is unsafe (fail-closed; never an injection seam).
 */
export function buildRecordsSql(
  sqo: RecordsSqo,
  tableForSection: Map<string, string>,
  filter?: ConformedFilter,
): SqlAndParams {
  const params: unknown[] = [];

  const sectionTipos = sqo.section_tipo;
  if (sectionTipos.length === 0) {
    return { sql: 'SELECT NULL WHERE false;', params };
  }

  const multi = sectionTipos.length > 1;
  const mainAlias = multi ? 'mix' : (trimTipo(sectionTipos[0]!) ?? 'mix');

  // section_tipo predicate (shared across UNION branches), params assigned first.
  let predicate: string;
  if (multi) {
    const phs = sectionTipos.map((st) => getPlaceholder(params, st));
    predicate = `${mainAlias}.section_tipo IN (${phs.join(',')})`;
  } else {
    const ph = getPlaceholder(params, sectionTipos[0]);
    predicate = `${mainAlias}.section_tipo = ${ph}::text`;
  }

  // Filter WHERE (built once; shared verbatim across UNION branches).
  let filterWhere = '';
  if (filter !== undefined && filter.items.length > 0) {
    const aliased = aliasFilter(filter, mainAlias);
    filterWhere = buildFilterWhere(aliased, params);
  }

  // Distinct tables in section_tipo encounter order.
  const tables: string[] = [];
  for (const st of sectionTipos) {
    const table = tableForSection.get(st);
    if (table === undefined) continue;
    if (!SAFE_TABLE.test(table)) {
      throw new Error(`unsafe matrix table identifier: ${table}`);
    }
    if (!tables.includes(table)) tables.push(table);
  }
  if (tables.length === 0) {
    return { sql: 'SELECT NULL WHERE false;', params };
  }

  const whereBody = filterWhere === '' ? `(${predicate})` : `(${predicate})${EOL} AND ${filterWhere}`;

  // One inner branch per distinct table (same alias + same WHERE/params). Projection
  // is the forced sections select: DISTINCT ON (section_id) section_id, section_tipo.
  const branches = tables.map((table) => {
    let q = `SELECT DISTINCT ON (${mainAlias}.section_id) ${mainAlias}.section_id,${EOL}`;
    q += `${mainAlias}.section_tipo`;
    q += `${EOL}FROM ${table} AS ${mainAlias}`;
    q += `${EOL}WHERE ${whereBody}`;
    return q;
  });

  let sql = branches.join(`${EOL}UNION ALL${EOL}`);

  // Default ORDER BY (build_sql_query_order_default). Activity section → DESC, all
  // ported sections → ASC. Multi-table UNION strips the alias (PHP str_replace).
  const direction = sectionTipos[0] === ACTIVITY_SECTION_TIPO ? 'DESC' : 'ASC';
  const orderCol = tables.length > 1 ? 'section_id' : `${mainAlias}.section_id`;
  sql += `${EOL}ORDER BY ${orderCol} ${direction}`;

  // LIMIT / OFFSET tail (build_limit_offset_sql).
  const lim = sanitizeLimit(sqo.limit);
  if (lim !== null) {
    sql += `${EOL}LIMIT ${lim}`;
  }
  const offset = Math.trunc(sqo.offset ?? 0);
  if (Number.isFinite(offset) && offset > 0) {
    sql += ` OFFSET ${offset}`;
  }

  return { sql, params };
}
