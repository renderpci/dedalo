import { buildCountSql, resolveCountTables, type CountSqo, type ResolveTable } from './search_count_sql.ts';
import type { SearchQueryer } from './search_related.ts';
import type { ConformedFilter } from './filter_validate.ts';

/**
 * Run the base no-filter COUNT for an SQO and return the total — the record-count
 * behind list pagination. Port of dd_core_api::count → search::count() for the
 * no-filter / section_tipo case (parse_sql_full_count).
 *
 * For multi-table UNION queries the COUNT(*) wrapper already aggregates across
 * branches in a single row, so we read the single `full_count` value directly
 * (unlike PHP's loop which sums one row per UNION branch — here the COUNT(*) is
 * the OUTER wrapper, so there is exactly one result row).
 *
 * No module-global state: a fresh param list per call (buildCountSql); the queryer
 * is request-scoped by the caller; the table resolver is injected.
 *
 * @returns the integer total (DISTINCT section_id over the resolved table(s)).
 */
export async function countRecords(
  sqo: CountSqo,
  deps: { queryer: SearchQueryer; resolveTable: ResolveTable; filter?: ConformedFilter },
): Promise<number> {
  const tableMap = await resolveCountTables(sqo.section_tipo, deps.resolveTable);
  const { sql, params } = deps.filter
    ? buildCountSql(sqo, tableMap, deps.filter)
    : buildCountSql(sqo, tableMap);
  const rows = await deps.queryer.query<{ full_count: number | string }>(sql, params);
  const raw = rows[0]?.full_count;
  if (raw === undefined || raw === null) return 0;
  return typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
}
