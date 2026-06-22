import type { SearchLocator } from './locator.ts';

/**
 * The minimal `search_query_object` (SQO) shape the related-mode children search
 * needs — a strict subset of PHP core/common/class.search_query_object.php.
 *
 * This is a SERVER-BUILT SQO (component_relation_children::build_children_sqo),
 * so it never passes through the client sanitize gate (sanitize_client_sqo) — the
 * security note in the dedalo-search skill confirms server callers construct the
 * SQO and call search directly. We therefore do NOT reproduce the client strip
 * list here; instead the SQL builder treats every value as a prepared param and
 * the only interpolated identifiers (table, column_sql array_position) are built
 * from int-sanitised / allowlisted inputs by the caller.
 */
export interface RelatedSqo {
  /** mode is always 'related' for this slice. */
  mode: 'related';
  /** Target tables to search. The children search constrains to one matrix table. */
  tables: string[];
  /** Back-link target locators (the parent-link locator for children). */
  filter_by_locators: SearchLocator[];
  /** AND/OR combiner for multiple locators (default OR). */
  filter_by_locators_op?: 'AND' | 'OR';
  /** section_tipo filter; ['all'] opens it wide (no section_tipo predicate). */
  section_tipo: string[];
  /** When true → COUNT(*) projection instead of rows. */
  full_count?: boolean;
  /** 0 = no limit (LIMIT ALL semantics: clause omitted). */
  limit?: number;
  offset?: number;
  /**
   * Optional explicit ORDER BY override. A trusted server-built SQL fragment
   * (PHP `column_sql`, e.g. the array_position(...) ordering). When absent the
   * builder falls back to order_default ('section_tipo, section_id ASC').
   */
  order_column_sql?: string;
  order_direction?: 'ASC' | 'DESC';
}
