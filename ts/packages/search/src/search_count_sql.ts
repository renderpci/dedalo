/**
 * Read-side port of the BASE forward-search COUNT path
 * (core/search/class.search.php::parse_sql_full_count + trait.from/where/count),
 * for the NO-FILTER / section_tipo case only.
 *
 * Reproduces, byte-faithfully against the live PHP engine, the record-count
 * behind list pagination: COUNT(DISTINCT section_id) over the section's resolved
 * matrix table(s), filtered by section_tipo. This is the count the dd_core_api
 * `count` action serves when sqo has section_tipo and NO filter/filter_by_locators.
 *
 * SHAPE (verified live, debug.strQuery, dedalo7_mib):
 *
 *   single section_tipo (one table):
 *     SELECT COUNT(*) as full_count FROM (
 *     SELECT DISTINCT <alias>.section_id
 *     FROM <table> AS <alias>
 *     WHERE (<alias>.section_tipo = $1::text)
 *     ) x
 *
 *   multiple section_tipos, all in the SAME table (no UNION):
 *     SELECT COUNT(*) as full_count FROM (
 *     SELECT DISTINCT mix.section_id
 *     FROM <table> AS mix
 *     WHERE (mix.section_tipo IN ($1,$2))
 *     ) x
 *
 *   multiple section_tipos spanning DIFFERENT tables (UNION ALL per table):
 *     SELECT COUNT(*) as full_count FROM (
 *     SELECT DISTINCT mix.section_id
 *     FROM <table_a> AS mix
 *     WHERE (mix.section_tipo IN ($1,$2))
 *     UNION ALL
 *     SELECT DISTINCT mix.section_id
 *     FROM <table_b> AS mix
 *     WHERE (mix.section_tipo IN ($1,$2))
 *     ) x
 *
 * NOTE on parity scope: the table ALIAS (the trim_tipo / 'mix' segment) appears
 * ONLY inside the dropped `debug.strQuery`, so it does NOT affect the contract
 * surface (the differ drops `debug` recursively). The alias is still reproduced
 * faithfully here so the generated SQL is identical to PHP's for the SQL-string
 * tests, and so the WHERE column-qualification matches.
 *
 * PARAM MODEL (faithful to PHP get_placeholder, trait.utils.php): a 0-indexed
 * positional list with strict-equality dedup. The multi-table UNION reuses the
 * SAME section_tipo params across every branch (PHP build_main_where runs once,
 * then build_union_query str_replaces only the FROM table — the WHERE/params are
 * shared verbatim). NEVER key params by value.
 *
 * SCOPE / DECLINED: only the no-filter case. A filtered count (sqo.filter or
 * sqo.filter_by_locators present) needs the full conform_filter + Mango WHERE
 * machinery (the component search builders) and is NOT handled here — the handler
 * declines it via canHandleRequest so the server proxies it to PHP. Multi-section
 * with the DEDALO_SECTION_USERS_TIPO `section_id > 0` extra-where and the
 * activity/time-machine non-DISTINCT branch are likewise out of scope (no-filter
 * regular sections only).
 */

import type { SqlAndParams } from './search_related_sql.ts';
import { buildFilterWhere } from './filter_where.ts';
import type { ConformedFilter } from './filter_validate.ts';

const EOL = '\n';

/**
 * Allowlisted matrix-table identifier. Tables come from the ontology resolver
 * (resolveMatrixTable), never from client input, but this is fail-closed defence
 * in depth so no arbitrary identifier can ever reach the FROM clause.
 */
const SAFE_TABLE = /^[a-z_][a-z0-9_]*$/;

/**
 * Port of search::trim_tipo(tipo, 2): keep the first 2 letters of the tipo prefix
 * plus the full numeric suffix → the single-section table alias (e.g. rsc205 →
 * rs205, oh1 → oh1, test65 → te65). Returns null on malformed input.
 *
 * This value is alias-only (debug surface) and never a security gate; the table
 * itself is allowlisted separately (SAFE_TABLE).
 */
export function trimTipo(tipo: string, max = 2): string | null {
  if (!tipo) return null;
  if (tipo === 'all') return tipo;
  const m = /^([a-z]+)([0-9]+)$/.exec(tipo);
  if (!m) return null;
  return m[1]!.slice(0, max) + m[2]!;
}

/** Append to the positional param list (strict === dedup) and return its `$n`. */
function getPlaceholder(params: unknown[], value: unknown): string {
  const idx = params.findIndex((p) => p === value);
  if (idx !== -1) return `$${idx + 1}`;
  params.push(value);
  return `$${params.length}`;
}

/** The minimal SQO shape the base no-filter count needs (subset of the PHP SQO). */
export interface CountSqo {
  /** Sections to count. First is main_section_tipo; >1 → alias 'mix'. */
  section_tipo: string[];
  /** full_count is always true for the count path (asserted by the caller). */
  full_count?: boolean;
}

/** Resolve a section_tipo to its matrix table name (port of get_matrix_table_from_tipo). */
export type ResolveTable = (sectionTipo: string) => string | Promise<string>;

/**
 * Build the base no-filter COUNT SQL + positional params for the SQO.
 *
 * Faithful to parse_sql_full_count: builds the inner `SELECT DISTINCT
 * <alias>.section_id FROM <table> AS <alias> WHERE (<section_tipo predicate>)`,
 * UNION ALL-expands it across distinct tables (when section_tipos span more than
 * one table), then wraps it in `SELECT COUNT(*) as full_count FROM (…) x`.
 *
 * `tableForSection` maps each section_tipo to its table; the caller resolves these
 * upstream from the ontology (resolveMatrixTable) so per-section tables can differ.
 *
 * @throws if any resolved table is unsafe (fail-closed; never an injection seam).
 */
export function buildCountSql(
  sqo: CountSqo,
  tableForSection: Map<string, string>,
  filter?: ConformedFilter,
): SqlAndParams {
  const params: unknown[] = [];

  const sectionTipos = sqo.section_tipo;
  if (sectionTipos.length === 0) {
    // No section → PHP returns total 0 before ever building SQL; mirror with a
    // guard that counts nothing.
    return { sql: 'SELECT 0 as full_count WHERE false;', params };
  }

  const multi = sectionTipos.length > 1;
  // Alias: 'mix' for multi-section, else trim_tipo(main). Alias is debug-only but
  // reproduced for SQL identity. Fall back to a safe literal if trim fails.
  const mainAlias = multi ? 'mix' : (trimTipo(sectionTipos[0]!) ?? 'mix');

  // section_tipo predicate (shared across all UNION branches). Single → `= $1::text`,
  // multi → `IN ($1,$2,…)`. Params are assigned ONCE and reused per branch.
  // IMPORTANT (param ordering parity): build_main_where runs BEFORE build_sql_filter
  // in PHP parse_sql_full_count, so the section_tipo params take $1..$N and the
  // filter params follow. We therefore build the predicate (section params) first,
  // THEN the filter WHERE (filter params), into the SAME positional list.
  let predicate: string;
  if (multi) {
    const phs = sectionTipos.map((st) => getPlaceholder(params, st));
    predicate = `${mainAlias}.section_tipo IN (${phs.join(',')})`;
  } else {
    const ph = getPlaceholder(params, sectionTipos[0]);
    predicate = `${mainAlias}.section_tipo = ${ph}::text`;
  }

  // Filter WHERE (port of build_sql_filter → filter_parser). Built ONCE (PHP runs
  // build_main_where then build_sql_filter once; build_union_query str_replaces only
  // the FROM table, so the WHERE + params are shared verbatim across UNION branches).
  // Each leaf clause is qualified by the SAME mainAlias the predicate uses.
  let filterWhere = '';
  if (filter !== undefined && filter.items.length > 0) {
    const aliased = aliasFilter(filter, mainAlias);
    filterWhere = buildFilterWhere(aliased, params);
  }

  // Distinct tables in section_tipo encounter order (PHP build_union_query dedups
  // ar_matrix_tables in iteration order; the first reliable table is the FROM
  // table of the leading branch).
  const tables: string[] = [];
  for (const st of sectionTipos) {
    const table = tableForSection.get(st);
    if (table === undefined) continue; // unresolved → skipped (PHP debug_log + continue)
    if (!SAFE_TABLE.test(table)) {
      throw new Error(`unsafe matrix table identifier: ${table}`);
    }
    if (!tables.includes(table)) tables.push(table);
  }
  if (tables.length === 0) {
    return { sql: 'SELECT 0 as full_count WHERE false;', params };
  }

  // The WHERE merges main_where AND filter_where (PHP all_where_sentences imploded
  // with PHP_EOL.' AND ': `WHERE (predicate)\n AND <filterWhere>`).
  const whereBody = filterWhere === '' ? `(${predicate})` : `(${predicate})${EOL} AND ${filterWhere}`;

  // One inner branch per distinct table (same alias + same WHERE/params).
  const branches = tables.map((table) => {
    let q = `SELECT DISTINCT ${mainAlias}.section_id`;
    q += `${EOL}FROM ${table} AS ${mainAlias}`;
    q += `${EOL}WHERE ${whereBody}`;
    return q;
  });

  const inner = branches.join(`${EOL}UNION ALL${EOL}`);
  const sql = `SELECT COUNT(*) as full_count FROM (${EOL}${inner}${EOL}) x`;

  return { sql, params };
}

/**
 * Stamp the resolved `table_alias` onto every leaf clause of a conformed filter
 * tree (port of conform_filter setting $search_object->table_alias). For the
 * single-level paths this slice serves, the alias is the main count alias
 * (trim_tipo(main) or 'mix'); multi-level join aliases are not ported (the count
 * handler declines multi-level paths). Returns a new tree (no mutation of input).
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
 * Resolve each section_tipo to its matrix table via the async resolver, returning
 * the table map buildCountSql consumes. Kept separate so buildCountSql stays a
 * pure synchronous SQL-string builder (testable with a static map).
 */
export async function resolveCountTables(
  sectionTipos: string[],
  resolveTable: ResolveTable,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const st of sectionTipos) {
    if (map.has(st)) continue;
    map.set(st, await resolveTable(st));
  }
  return map;
}
