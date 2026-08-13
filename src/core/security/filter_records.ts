/**
 * ROW-LEVEL ACCESS CONTROL BY RECORD ID — the ENFORCEMENT half of
 * component_filter_records (dd478, stored on the USER record in the misc
 * column). The editor half is components/component_filter_records/; this module
 * is what makes the stored allow-list mean something.
 *
 * The datum is per user, keyed by section:
 *   [ {id: 1, tipo: 'rsc170', value: [1, 8, 9]}, … ]
 * and reads as "in section rsc170, this user may only see records 1, 8 and 9".
 * The predicate rides search/sql_assembler.ts, so ONE clause covers the list,
 * the count, every UNION branch and the per-record existence probe (the same
 * single-statement discipline record_scope.ts documents for the projects ACL).
 *
 * DELIBERATE DIVERGENCE from PHP — WC-2026-08-12-filter-records-enforced:
 *
 * 1. NO FEATURE CONSTANT. PHP gates the whole mechanism behind
 *    DEDALO_FILTER_USER_RECORDS_BY_ID (default false; classified DROPPED /
 *    NO_CONSUMER in config/migration_map.ts). v7 enforces whenever the datum
 *    names the searched section: an allow-list an administrator saved and the
 *    engine then ignores is a security ILLUSION — the admin sees a configured
 *    restriction, the user sees every record.
 * 2. PHP'S LOOKUP IS INERT. trait.where.php:163 tests
 *    `isset($filter_user_records_by_id[$section_tipo])` against
 *    `component_filter_records::get_user_filter_records()`, which returns
 *    component_common::get_data() — the raw, INTEGER-KEYED entries array, never
 *    a section_tipo map. The key never matches, so PHP's clause is dead even
 *    with the constant on. This module implements the DOCUMENTED semantics
 *    (class.component_filter_records.php:73-79), which is what the editor UI,
 *    the stored shape and the client all describe.
 * 3. AN EMPTY LIST IS NOT A LOCKOUT. `{tipo, value: []}` is skipped (no
 *    restriction): the editor never writes it — emptying the input sends
 *    action 'remove' (component_filter_records.js change_handler) — so it can
 *    only come from hand-edited or legacy data, and reading it as "sees
 *    nothing" would blank a section for that user with no UI affordance
 *    showing why. PHP would emit `IN ( )` there: a SQL syntax error.
 *
 * NOT a substitute for the projects filter (search/sql_assembler.ts
 * buildProjectsFilter): both AND together, each narrowing the other.
 */

import { sql } from '../db/postgres.ts';
import { createDataCache } from '../ontology/cache_factory.ts';

/** dd478 — the component_filter_records datum on a USER record (misc column). */
export const FILTER_RECORDS_COMPONENT = 'dd478';
const USERS_SECTION = 'dd128';

/** One stored entry as the editor writes it. */
interface FilterRecordsEntry {
	id?: number;
	tipo?: unknown;
	value?: unknown;
}

/**
 * section_tipo → allowed section_ids, for one user. Data-derived from the USER
 * record, so a users-section write drops it through the shared event channel —
 * the getUserProjects posture (security/permissions.ts). Keyed by user_id, so
 * no cross-request bleed is possible.
 */
const filterRecordsCache = createDataCache<number, Map<string, number[]>>((cache, sectionTipo) => {
	if (sectionTipo === USERS_SECTION) cache.clear();
});

/** Drop one user's cached allow-list (or all of them). Test/ops seam. */
export function clearUserFilterRecordsCache(userId?: number): void {
	if (userId === undefined) filterRecordsCache.clear();
	else filterRecordsCache.delete(userId);
}

/**
 * The stored id list as positive integers, deduped. The editor already
 * validates to positive ints (validate_value), but a hand-edited or legacy
 * datum may not — and every id reaches SQL as an integer LITERAL, so this is
 * the SEARCH-04 assertion the predicate relies on.
 */
function validIds(value: unknown): number[] {
	if (!Array.isArray(value)) return [];
	const ids: number[] = [];
	for (const raw of value) {
		const id = Number(raw);
		if (Number.isInteger(id) && id > 0) ids.push(id);
	}
	return [...new Set(ids)];
}

/** Fold ONE stored entry into the allow-list (a useless entry folds to nothing). */
function collectEntry(allowed: Map<string, number[]>, entry: FilterRecordsEntry): void {
	const tipo = entry?.tipo;
	// A tipo-less entry names no section, so it can restrict none. Real data
	// carries them (a legacy nested {tipo,value} payload under `value`).
	if (typeof tipo !== 'string' || tipo === '') return;
	const ids = validIds(entry.value);
	if (ids.length === 0) return; // see the header, divergence 3
	// Two entries for the SAME section (only reachable from legacy/hand-edited
	// data — the editor keys its rows by tipo): both id sets were authored as
	// allowed, so they union rather than one silently winning.
	const previous = allowed.get(tipo);
	allowed.set(tipo, previous === undefined ? ids : [...new Set([...previous, ...ids])]);
}

/**
 * The user's row-level allow-list: section_tipo → allowed section_ids.
 * An EMPTY map means "no restriction anywhere" — the normal case.
 */
export async function getUserFilterRecords(userId: number): Promise<Map<string, number[]>> {
	const cached = filterRecordsCache.get(userId);
	if (cached !== undefined) return cached;

	const rows = (await sql.unsafe(
		'SELECT misc->$2 AS entries FROM matrix_users WHERE section_tipo = $1 AND section_id = $3 LIMIT 1',
		[USERS_SECTION, FILTER_RECORDS_COMPONENT, userId],
	)) as { entries: FilterRecordsEntry[] | null }[];

	const allowed = new Map<string, number[]>();
	for (const entry of rows[0]?.entries ?? []) collectEntry(allowed, entry);

	filterRecordsCache.set(userId, allowed);
	return allowed;
}
