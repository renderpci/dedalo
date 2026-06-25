import { getTermIdFromLocator, type SearchLocator } from './locator.ts';
import type { RelatedSqo } from './search_query_object.ts';

/**
 * Read-side port of PHP `search_related::parse_sql_query()`
 * (core/search/class.search_related.php). Builds the parameterised SQL that
 * finds every matrix record whose `relation` JSONB column back-links to one of
 * the SQO's filter_by_locators, using the precomputed flat-string GIN-indexed
 * functions (data_relations_flat_*).
 *
 * SCOPE: only the non-breakdown, non-group_by path the children search uses
 * (breakdown/group_by are the inverse-reference panel paths, deferred). The
 * dispatch over the four flat functions is reproduced faithfully so the slice can
 * be widened later. UNION ALL across multiple tables is reproduced (the children
 * search passes a single table, but the shape is preserved).
 *
 * PARAM MODEL (faithful to PHP get_placeholder, trait.utils.php): a 0-indexed
 * positional list with strict-equality dedup. Each placeholder is the SQL `$n`
 * (n = index+1). postgres.js consumes the same positional array. NEVER key params
 * by value (PHP's hazard) — we push and dedup by strict ===.
 *
 * The result is a {sql, params} pair. The caller runs it via @dedalo/db's query.
 */
export interface SqlAndParams {
  sql: string;
  params: unknown[];
}

const EOL = '\n';

/**
 * Append a value to the positional param list (dedup by strict ===, matching
 * PHP array_search strict) and return its `$n` placeholder.
 */
function getPlaceholder(params: unknown[], value: unknown): string {
  const idx = params.findIndex((p) => p === value);
  if (idx !== -1) return `$${idx + 1}`;
  params.push(value);
  return `$${params.length}`;
}

/**
 * Build the per-locator WHERE fragment, dispatching to the narrowest flat-index
 * function exactly like the PHP switch (class.search_related.php lines 254-365).
 * Returns the SQL fragment; pushes bind values onto `params`.
 *
 * Dispatch order (first match wins):
 *   1. no section_id + has type  → data_relations_flat_ty_st     (relation_index)
 *   2. has from_component_tipo    → data_relations_flat_fct_st_si (component-scoped) ← children
 *   3. has type + section_id      → data_relations_flat_ty_st_si  (typed record)
 *   4. default                    → data_relations_flat_st_si     (any link)
 *
 * Each `@> <param>::text::jsonb` containment matches the functional GIN index.
 * The `::text::jsonb` double-cast (NOT a plain `::jsonb`) is REQUIRED: with
 * postgres.js prepared statements, a bare `$n::jsonb` makes the driver infer the
 * param type as jsonb and JSON-encode the string AGAIN, so the server sees a jsonb
 * STRING scalar ("[…]") instead of the intended jsonb ARRAY — the containment then
 * matches nothing. Binding as `::text` first forces the value to travel as text;
 * postgres then parses the JSON-array literal correctly. (Verified against the
 * live DB: the bare-`::jsonb` form returns 0 rows, `::text::jsonb` returns 26.)
 */
function buildLocatorClause(locator: SearchLocator, params: unknown[]): string {
  const hasSectionId = locator.section_id !== undefined && locator.section_id !== null;

  // 1. relation index case: no section_id, has type → "<type>_<section_tipo>"
  if (!hasSectionId && locator.type !== undefined) {
    const key = `${locator.type}_${locator.section_tipo}`;
    const ph = getPlaceholder(params, `[${JSON.stringify(key)}]`);
    return `${EOL}data_relations_flat_ty_st(relation) @> ${ph}::text::jsonb`;
  }

  // 2. component-scoped link: "<from_component_tipo>_<section_tipo>_<section_id>"
  //    This is the children path (filter locator carries the relation_parent tipo).
  if (locator.from_component_tipo !== undefined) {
    const base = getTermIdFromLocator(locator);
    const key = `${locator.from_component_tipo}_${base}`;
    const ph = getPlaceholder(params, `[${JSON.stringify(key)}]`);
    return `${EOL}data_relations_flat_fct_st_si(relation) @> ${ph}::text::jsonb`;
  }

  // 3. typed link to a specific record: "<type>_<section_tipo>_<section_id>"
  if (locator.type !== undefined) {
    const base = getTermIdFromLocator(locator);
    const key = `${locator.type}_${base}`;
    const ph = getPlaceholder(params, `[${JSON.stringify(key)}]`);
    return `${EOL}data_relations_flat_ty_st_si(relation) @> ${ph}::text::jsonb`;
  }

  // 4. plain section link: "<section_tipo>_<section_id>"
  const base = getTermIdFromLocator(locator);
  const ph = getPlaceholder(params, `[${JSON.stringify(base)}]`);
  return `${EOL}data_relations_flat_st_si(relation) @> ${ph}::text::jsonb`;
}

/**
 * Sanitise a LIMIT exactly like PHP search::sanitize_sql_limit(): a non-positive
 * limit means "no limit" → the LIMIT clause is omitted entirely (LIMIT ALL). A
 * positive int is emitted verbatim (coerced).
 */
function limitClause(limit: number | undefined): string | null {
  if (limit === undefined) return null;
  const n = Math.trunc(limit);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(n);
}

/**
 * The allowed matrix tables with relations. PHP restricts FROM to
 * common::get_matrix_tables_with_relations(); here the children search always
 * supplies the section's own matrix table (resolved upstream from the ontology),
 * which is validated against the [a-z_][a-z0-9_]* identifier rule so no arbitrary
 * identifier can reach the FROM clause.
 */
const SAFE_TABLE = /^[a-z_][a-z0-9_]*$/;

/**
 * Build the full related-mode SQL + params for the SQO. Reproduces the PHP UNION
 * ALL shape (one branch per table) even for the single-table children case.
 *
 * @throws if a table identifier is unsafe (fail-closed; never an injection seam).
 */
export function buildSearchRelatedSql(sqo: RelatedSqo): SqlAndParams {
  const params: unknown[] = [];

  // PHP intersects client tables with the allowed matrix-tables set and silently
  // drops anything outside it (array_intersect); no throw. We mirror that by
  // filtering to safe identifiers and returning the no-valid-table guard if none
  // survive — so an unsafe identifier can never reach the FROM clause.
  const tables = sqo.tables.filter((t) => SAFE_TABLE.test(t));
  if (tables.length === 0) {
    // Mirrors PHP's 'SELECT NULL WHERE false;' guard for no valid table.
    return { sql: 'SELECT NULL WHERE false;', params };
  }

  const fullCount = sqo.full_count === true;

  // filter_by_locators_op (allowlist AND/OR, default OR).
  const rawOp = (sqo.filter_by_locators_op ?? 'OR').toUpperCase().trim();
  const op = rawOp === 'AND' ? 'AND' : 'OR';

  // section_tipo filter (skip 'all' sentinel). Reproduces PHP's IN(...) clause.
  const sectionPlaceholders: string[] = [];
  for (const st of sqo.section_tipo) {
    if (st === 'all') continue;
    sectionPlaceholders.push(getPlaceholder(params, st));
  }
  const sectionFilter =
    sectionPlaceholders.length > 0
      ? `section_tipo IN(${sectionPlaceholders.join(',')})`
      : null;

  // Per-table SELECT … FROM … WHERE, UNION ALL'd.
  const branches: string[] = [];
  for (const table of tables) {
    let q = 'SELECT ';
    q += fullCount ? 'COUNT(*) as full_count' : 'section_tipo, section_id, relation';
    q += `${EOL}FROM "${table}"`;

    const locatorClauses = sqo.filter_by_locators.map((loc) =>
      buildLocatorClause(loc, params),
    );

    const whereClauses: string[] = [];
    if (locatorClauses.length > 0) {
      whereClauses.push(`(${locatorClauses.join(` ${op} `)})`);
    }
    if (sectionFilter !== null) {
      whereClauses.push(`(${sectionFilter})`);
    }
    if (whereClauses.length > 0) {
      q += `${EOL}WHERE ${whereClauses.join(' AND ')}`;
    }

    branches.push(q);
  }

  let sql = branches.join(`${EOL}UNION ALL `);

  // ORDER / LIMIT / OFFSET only when not counting.
  if (!fullCount) {
    // Custom order (the array_position column_sql) or order_default. UNION result
    // columns aren't alias-qualified, so any alias prefix is stripped (PHP does the
    // same via preg_replace). Our order_column_sql is already alias-free.
    let orderClause: string;
    if (sqo.order_column_sql !== undefined && sqo.order_column_sql !== '') {
      const dir = sqo.order_direction === 'DESC' ? 'DESC' : 'ASC';
      orderClause = `${sqo.order_column_sql} ${dir}`;
    } else {
      // order_default (search::build_sql_query_order_default for related): the
      // deterministic tie-breaker, which IS the children ordering when the
      // array_position list is empty.
      orderClause = 'section_tipo, section_id ASC';
    }
    sql += `${EOL}ORDER BY ${orderClause}`;

    const lim = limitClause(sqo.limit);
    if (lim !== null) {
      sql += `${EOL}LIMIT ${lim}`;
    }

    const offset = Math.trunc(sqo.offset ?? 0);
    if (Number.isFinite(offset) && offset > 0) {
      sql += `${EOL}OFFSET ${offset}`;
    }
  }

  sql += ';';

  return { sql, params };
}
