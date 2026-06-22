import {
  buildRecordsSql,
  type RecordsSqo,
} from './search_records_sql.ts';
import { resolveCountTables } from './search_count_sql.ts';
import type { ResolveTable } from './search_count_sql.ts';
import type { SearchQueryer } from './search_related.ts';
import type { ConformedFilter } from './filter_validate.ts';

/** One searched record locator (the row identity the list render consumes). */
export interface RecordLocator {
  section_tipo: string;
  section_id: number;
}

/**
 * Run the base no-filter RECORDS query for an SQO and return the ordered,
 * paginated record locators — the page of {section_tipo, section_id} behind a
 * section LIST view. Port of dd_core_api::read (action 'search') →
 * sections::get_data → search::search for the no-filter / section_tipo case
 * (parse_sql_default with the forced `select=[]` projection).
 *
 * The returned order is PHP's verified default: section_id ASC (DESC only for the
 * activity-log section, which is not served here). LIMIT/OFFSET are applied in
 * SQL, so the result is exactly the page the live render emits.
 *
 * No module-global state: a fresh param list per call (buildRecordsSql); the
 * queryer is request-scoped by the caller; the table resolver is injected.
 *
 * @returns the ordered locators for the requested page (in result-row order).
 */
export async function searchRecords(
  sqo: RecordsSqo,
  deps: { queryer: SearchQueryer; resolveTable: ResolveTable; filter?: ConformedFilter },
): Promise<RecordLocator[]> {
  const tableMap = await resolveCountTables(sqo.section_tipo, deps.resolveTable);
  const { sql, params } = deps.filter
    ? buildRecordsSql(sqo, tableMap, deps.filter)
    : buildRecordsSql(sqo, tableMap);
  const rows = await deps.queryer.query<{ section_id: number | string; section_tipo: string }>(
    sql,
    params,
  );
  return rows.map((r) => ({
    section_tipo: String(r.section_tipo),
    section_id:
      typeof r.section_id === 'number' ? r.section_id : Number.parseInt(String(r.section_id), 10),
  }));
}
