import { buildSearchRelatedSql } from './search_related_sql.ts';
import type { RelatedSqo } from './search_query_object.ts';
import type { SearchLocator } from './locator.ts';

/** Anything with a parameterised `query(text, params)` — a Db, DbSession or stub. */
export interface SearchQueryer {
  query<T = unknown>(text: string, params?: unknown[]): Promise<T[]>;
}

/** One related-search result row (non-breakdown, non-count projection). */
export interface RelatedRow {
  section_tipo: string;
  section_id: number;
  /** The raw relation JSONB blob of the matching record (parsed by the driver). */
  relation?: unknown;
}

/**
 * The array_position ORDER BY fragment (PHP build_children_sqo, the column_sql
 * branch). `orderedIds` is the precomputed, int-sanitised child id list; section
 * rows not in it sort last (array_position → NULL → last under ASC). Returns
 * undefined when the list is empty, so the caller falls back to order_default
 * (section_id ASC) exactly like PHP (set_order is skipped when ordered_ids empty).
 */
export function arrayPositionOrderSql(orderedIds: number[]): string | undefined {
  if (orderedIds.length === 0) return undefined;
  // int-sanitise every id (defence in depth — these are server-derived section_ids).
  const safe = orderedIds.map((n) => Math.trunc(n)).filter((n) => Number.isFinite(n));
  if (safe.length === 0) return undefined;
  return `array_position(ARRAY[${safe.join(',')}]::bigint[], section_id::bigint)`;
}

/**
 * Read-side port of the related-mode search engine (search_related). Builds the
 * SQL via buildSearchRelatedSql and runs it through the injected queryer. No
 * module-global state: a fresh param list per call; the queryer is request-scoped
 * by the caller.
 */
export class SearchRelated {
  constructor(private readonly queryer: SearchQueryer) {}

  /** Run a related-mode SQO and return its rows ({section_tipo, section_id, relation}). */
  async search(sqo: RelatedSqo): Promise<RelatedRow[]> {
    const { sql, params } = buildSearchRelatedSql(sqo);
    const rows = await this.queryer.query<RawRow>(sql, params);
    return rows.map((r) => ({
      section_tipo: String(r.section_tipo),
      section_id: typeof r.section_id === 'number' ? r.section_id : Number.parseInt(String(r.section_id), 10),
      relation: r.relation,
    }));
  }

  /** Run the same SQO with full_count → the total row count. */
  async count(sqo: RelatedSqo): Promise<number> {
    const countSqo: RelatedSqo = { ...sqo, full_count: true };
    const { sql, params } = buildSearchRelatedSql(countSqo);
    const rows = await this.queryer.query<{ full_count: number | string }>(sql, params);
    const raw = rows[0]?.full_count;
    if (raw === undefined) return 0;
    return typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  }
}

interface RawRow {
  section_tipo: string;
  section_id: number | string;
  relation?: unknown;
}

/**
 * High-level helper: build the related-mode SQO for the children of a parent and
 * run it, returning the ordered child locators (section_tipo + section_id).
 *
 * Faithful to component_relation_children::build_children_sqo + get_children:
 *   - one filter locator on the PARENT, carrying from_component_tipo = the
 *     relation_parent tipo and type = the parent-link relation type → the
 *     data_relations_flat_fct_st_si path.
 *   - section_tipo ['all'] (open wide; the table constrains the scope).
 *   - set_tables([parentMatrixTable]).
 *   - optional explicit array_position ordering (orderedChildIds); else
 *     section_id ASC (order_default).
 */
export async function searchChildren(
  queryer: SearchQueryer,
  opts: {
    parentSectionTipo: string;
    parentSectionId: number;
    parentRelationTipo: string;
    parentLinkType: string;
    table: string;
    orderedChildIds?: number[];
    limit?: number;
    offset?: number;
  },
): Promise<RelatedRow[]> {
  const filterLocator: SearchLocator = {
    section_tipo: opts.parentSectionTipo,
    section_id: opts.parentSectionId,
    from_component_tipo: opts.parentRelationTipo,
    type: opts.parentLinkType,
  };

  const orderSql = opts.orderedChildIds ? arrayPositionOrderSql(opts.orderedChildIds) : undefined;

  const sqo: RelatedSqo = {
    mode: 'related',
    tables: [opts.table],
    filter_by_locators: [filterLocator],
    section_tipo: ['all'],
    full_count: false,
    limit: opts.limit ?? 0,
    offset: opts.offset ?? 0,
    ...(orderSql !== undefined ? { order_column_sql: orderSql, order_direction: 'ASC' as const } : {}),
  };

  const search = new SearchRelated(queryer);
  return search.search(sqo);
}
