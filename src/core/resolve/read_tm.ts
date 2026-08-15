/**
 * Time Machine read — SQO mode 'tm' (PHP search_tm + tm_record +
 * section::get_tm_context). Lists a record's change history from
 * matrix_time_machine (flat columns, NOT the jsonb matrix shape) as the
 * standard read wire contract: a dd15 sections envelope whose entries carry
 * matrix_id/timestamp/caller/user facts, plus per-row component items.
 *
 * ONE PIPELINE (WC-2026-08-14-tm-cells-obey-list-emit-policy). This module owns
 * ROW ACQUISITION — the WHERE, the ORDER, the count, the envelope — and nothing
 * else. Every CELL is emitted by the shared `emitDdoData` in LIST mode over the
 * virtual dd15 record that `tm_record.ts` materializes per row, so the dd15 meta
 * columns and the caller section's own columns render through exactly the same
 * component emit hooks as they do in a section's own list: text_area truncation
 * and tag resolution, `fallback_value`, original-language forcing, the portal
 * subdatum. There is no second cell policy here any more; the flat columns are
 * transformed into component-shaped values ONCE, in `buildTmSectionRecord`.
 *
 * The only cell knowledge left in this file is `TM_CELL_DECORATORS` (the rsc329
 * note-navigation keys, which are not properties of any value) and the
 * superuser display name — both named, both small, both enumerable.
 *
 * FILTERS: filter_by_locators and/or conformed sqo.filter columns (the _tm
 * builder twins; the inspector/tool record-history cases —
 * section_tipo/section_id columns, optional tipo/lang narrowing). The
 * deleted-sections listing (sqo.filter with format:'column') is uncovered
 * scope and denies loudly. ORDER: the TM id column only (PHP default).
 *
 * PERMISSIONS: the dispatch read gates apply per SQO target (the CALLER
 * section, level >= 1). dd15's own columns resolve through the ordinary per-ddo
 * authz loop, floored by the §7.4 `time_machine_list` grant on the caller
 * section (WC-2026-08-14-tm-permission-floor); the unscoped browse is
 * global-admin only.
 */

import { config } from '../../config/config.ts';
import type { Ddo } from '../concepts/ddo.ts';
import { compareLocators, type StoredSectionId } from '../concepts/locator.ts';
import type { Rqo } from '../concepts/rqo.ts';
import type { Sqo } from '../concepts/sqo.ts';
import { sql } from '../db/postgres.ts';
import type { TimeMachineRow } from '../db/time_machine.ts';
import { createDataCache } from '../ontology/cache_factory.ts';
import { termByTipo } from '../ontology/labels.ts';
import {
	getColumnNameByModel,
	getModelByTipo,
	getTranslatableByTipo,
} from '../ontology/resolver.ts';
import type {
	EmitDdo,
	EmitRowContext,
	SectionReadSource,
	SectionRow,
} from '../section/read_source.ts';
import { type Principal, SUPERUSER_ID } from '../security/permissions.ts';
import {
	buildTmSectionRecord,
	TM_COLUMN_BULK_PROCESS_ID as TIPO_BULK_PROCESS,
	TM_COLUMN_TIPO as TIPO_COMPONENT,
	TM_COLUMN_DATA as TIPO_DATA,
	TM_COLUMN_MATRIX_ID as TIPO_MATRIX_ID,
	TM_NOTES_TEXT as TIPO_NOTES,
	TM_COLUMN_SECTION_ID as TIPO_SECTION_ID,
	TM_COLUMN_SECTION_TIPO as TIPO_SECTION_TIPO,
	TM_COLUMN_TIMESTAMP as TIPO_TIMESTAMP,
	TM_COLUMN_USER_ID as TIPO_USER,
	TM_NOTES_SECTION_TIPO,
} from '../tm_record/tm_record.ts';
import { EmissionContext } from './component_data.ts';
import { currentDataLang } from './request_lang.ts';
import type { StructureContextEntry } from './structure_context.ts';
import { conformTmFilter, type ParamSink } from './tm_filter.ts';

/**
 * The section-record TM list filters by a `tipo` COLUMN filter whose value is the
 * caller SECTION tipo (matrix_time_machine stores one record-level snapshot per
 * save with tipo = section_tipo, plus per-component rows). PHP scopes by it
 * (WHERE tipo = q); extract that value. Returns null when no such filter is set.
 */
function tipoColumnFilter(sqo: Record<string, unknown>): string | null {
	const filter = sqo.filter as { $and?: { q?: unknown; column_name?: unknown }[] } | undefined;
	const clause = filter?.$and?.find((c) => c?.column_name === 'tipo');
	return clause !== undefined && typeof clause.q === 'string' && clause.q !== '' ? clause.q : null;
}

/** TM virtual section + the users section (the rest come from tm_record.ts). */
const TM_SECTION_TIPO = 'dd15';

/** The two properties that ADDRESS a record — the locator pair, nothing else. */
const LOCATOR_ADDRESS_PROPERTIES = ['section_tipo', 'section_id'] as const;

/**
 * dd15 list-column tipo → the matrix_time_machine FLAT COLUMN its header-click
 * sorts by. dd15's columns ARE the table's own columns, so each maps 1:1 (PHP
 * search_tm orders over the same columns); the raw 'id'/'section_id'
 * pseudo-columns are the service defaults and pass through. A tipo that is not
 * here is uncovered scope and throws loudly in queryTmRows.
 *
 * (!) THIS MAP IS dd15-ONLY. In an ORDINARY section the record's id IS
 * `section_id`, and order_path.ts encodes that for every component_section_id
 * column — untouched by this map. dd15 is the exception: its rows have their own
 * PK (`id`, surfaced as matrix_id), so it has TWO id-ish columns that must not
 * be conflated —
 *   dd1573 "Id"         → `id`          the TM ROW's own id
 *   dd1212 "Section id" → `section_id`  the CALLER record's id (lg-spa term is
 *                                       literally "section_id")
 * dd1573 was absent here while tm_filter already resolved it to `id`, so the Id
 * column could be FILTERED but not SORTED — its header click fell through to the
 * uncovered-scope throw, leaving dd1212 as the only id-ish column that sorted.
 * Exported so tm_sort_policy.test.ts can pin the pair without a DB round-trip.
 */
export const TM_ORDER_COLUMN: Readonly<Record<string, string>> = {
	id: 'id',
	// The client's built-in leading "Id" column sends the `section_id`
	// PSEUDO-column — its descriptor means "the record's OWN id", not the literal
	// column name (view_default_list_section.rebuild_columns_map: `tipo:
	// 'section_id' // used to sort only`, path component_tipo 'section_id'). In an
	// ordinary section those coincide. In dd15 they DO NOT: the envelope addresses
	// each snapshot by the TM row PK (`section_id: row.id`, tmReadSource.getRows),
	// so the Id box DISPLAYS `id` — mapping its sort to the `section_id` column
	// made the column sort by something it does not show (the caller record's id),
	// which is why clicking Id returned 61468923, 4, 38, 28, … . Resolve the
	// pseudo-column to what dd15 actually displays: `id`.
	section_id: 'id',
	[TIPO_MATRIX_ID]: 'id', // dd1573 Id — the PK, the cheapest sort on the table
	// dd1212 is the CALLER record's id — a real, separate column, shown in its own
	// "Section id" column. It keeps ordering by `section_id`.
	[TIPO_SECTION_ID]: 'section_id', // dd1212 Section id — the caller record's id
	[TIPO_SECTION_TIPO]: 'section_tipo', // dd1772 Section tipo
	[TIPO_TIMESTAMP]: 'timestamp', // dd559 When
	[TIPO_COMPONENT]: 'tipo', // dd577 What (section tipo)
	[TIPO_USER]: 'user_id', // dd578 Who
	[TIPO_BULK_PROCESS]: 'bulk_process_id', // dd1371 Process
	[TIPO_DATA]: 'data', // dd1574 record snapshot (jsonb — total-ordered by PG)
};

/**
 * Bare-browse COUNT(*) cache (see tmReadSource.count). Data-event wired: ANY
 * record save/delete may append TM rows, so any section write clears it; the
 * TTL stamp bounds staleness against out-of-band (non-engine) inserts.
 */
const tmBareCountCache = createDataCache<string, { value: number; at: number }>((cache) =>
	cache.clear(),
);
const USERS_SECTION_TIPO = 'dd128';

// The dd128 component shown as the dd578 username SUBDATUM is no longer resolved
// here. It used to be read by hand off dd578's `source.request_config[0].show
// .ddo_map[0].tipo` because the cell was hand-built; hardcoding it as 'dd132' had
// previously reddened three TM gates when the shared ontology moved the ddo to
// dd452 (S2-43 channel 2). The generic portal emission reads that same
// request_config, so the ontology is once again the only place the answer lives.

/**
 * The row shape this reader selects (a superset of the shared TimeMachineRow:
 * it also pulls the record-level snapshot `data` for the list view). The fields
 * consumed by buildTmSectionRecord are exactly TimeMachineRow's.
 */
interface TmRow {
	id: number;
	section_id: number;
	section_tipo: string;
	tipo: string;
	lang: string;
	timestamp: string;
	user_id: number;
	bulk_process_id: number | null;
	/** The record-level snapshot (a full matrix-record jsonb) for the list view. */
	data: Record<string, unknown> | null;
}

/**
 * Build the WHERE for a TM query. `filter_by_locators` → per-component history
 * (OR of locator groups). Else a `tipo` column filter → the record-snapshot LIST
 * (WHERE tipo = q, matching PHP). Returns whether it is the record-list surface
 * (its rows carry a full-record snapshot whose component columns are the display).
 *
 * NO scope at all — a bare dd15 list (`section_tipo:['dd15']`, no
 * filter_by_locators, no tipo filter), which the client sends when the Time
 * Machine section is opened directly — matches PHP `search_tm` whose
 * build_main_where() is intentionally EMPTY: it returns ALL matrix_time_machine
 * rows (newest-first, paginated), NOT an error and NOT empty. So the where is
 * `true` and it renders as the who/when/where/what history (isRecordList=false).
 */
function buildTmWhere(sqo: Record<string, unknown>): {
	whereSql: string;
	params: unknown[];
	isRecordList: boolean;
	/** The where carries a RANGE predicate — see ParamSink.rangePredicate and the
	 * PLANNER BARRIER note in queryTmRows. Only the conformed component filter can
	 * produce one; locator and tipo scopes are pure equality. */
	rangeFilter: boolean;
} {
	const params: unknown[] = [];
	const locators = Array.isArray(sqo.filter_by_locators)
		? (sqo.filter_by_locators as Record<string, unknown>[])
		: [];
	if (locators.length > 0) {
		const groups = locators.map((locator) => {
			const clauses: string[] = [];
			params.push(String(locator.section_tipo ?? ''));
			clauses.push(`section_tipo = $${params.length}`);
			params.push(Number(locator.section_id ?? 0));
			clauses.push(`section_id = $${params.length}`);
			if (typeof locator.tipo === 'string' && locator.tipo !== '') {
				params.push(locator.tipo);
				clauses.push(`tipo = $${params.length}`);
			}
			if (typeof locator.lang === 'string' && locator.lang !== '') {
				params.push(locator.lang);
				clauses.push(`lang = $${params.length}`);
			}
			return `(${clauses.join(' AND ')})`;
		});
		return {
			whereSql: `(${groups.join(' OR ')})`,
			params,
			isRecordList: false,
			rangeFilter: false,
		};
	}
	const tipoFilter = tipoColumnFilter(sqo);
	if (tipoFilter !== null) {
		params.push(tipoFilter);
		return { whereSql: `tipo = $${params.length}`, params, isRecordList: true, rangeFilter: false };
	}
	// The standalone dd15 list search: conform component clauses to the flat
	// matrix_time_machine columns (PHP search_tm + the _tm traits). Absent this,
	// every component filter was silently ignored (the whole list came back).
	const sink: ParamSink = { params };
	const componentSql = conformTmFilter(sqo.filter, sink);
	if (componentSql !== null && componentSql !== '') {
		return {
			whereSql: componentSql,
			params,
			isRecordList: false,
			rangeFilter: sink.rangePredicate === true,
		};
	}
	// No scope → the bare dd15 list: ALL TM rows (PHP search_tm empty where).
	return { whereSql: 'true', params, isRecordList: false, rangeFilter: false };
}

/**
 * The ORDER BY clause for the plain TM page query, TABLE-QUALIFIED ALWAYS.
 *
 * The select list aliases `timestamp::text AS timestamp`, and in SQL a BARE
 * `ORDER BY timestamp` binds to the OUTPUT COLUMN, not the table column — so the
 * sort silently became "order by this computed text expression", which no index
 * can serve. The planner's only option was a parallel seq scan + top-N sort of
 * all 50.5M rows: the When header click measured 17 863 ms (19 583 ms live).
 * Qualifying as `tm."timestamp"` binds to the COLUMN, and the (timestamp, id
 * DESC) index serves it at 0.359 ms — the SAME rows in the same order, because
 * text and timestamp ordering coincide here (PG renders ISO with trimmed
 * trailing zeros, so fraction digits compare lexicographically exactly as they
 * compare numerically; verified identical over the first 2000 rows despite
 * 49.6M rows carrying fractional seconds).
 *
 * `timestamp` is the ONLY aliased field in that select — id/tipo/data/section_id
 * are emitted unaliased — which is why only the When sort was affected. Every
 * column is qualified anyway so a future alias cannot reintroduce this silently.
 * Extracted + exported so tm_sort_policy.test.ts can pin the qualification.
 */
export function buildTmOrderSql(orderColumn: string, direction: 'ASC' | 'DESC'): string {
	const col = `tm."${orderColumn}"`;
	// Stable ORDER BY: the non-unique sort columns (bulk saves share a timestamp,
	// bulk_process_id, section_tipo, …) get the PK `id` as tiebreaker so OFFSET
	// pages don't shuffle under ties. 'id'/'section_id' keep their exact prior
	// single-column SQL (section_id's tie behaviour is byte-gated — don't perturb).
	return orderColumn === 'id' || orderColumn === 'section_id'
		? `${col} ${direction}`
		: `${col} ${direction}, tm."id" ${direction}`;
}

export interface TmReadData {
	data: Record<string, unknown>[];
	/** Ledger of requested ddos this reader does not model. */
	unhandled: string[];
}

/**
 * The SUPERUSER display name in a history Who column (PHP
 * component_input_text::get_list_value, the 'tm' branch).
 *
 * The superuser row (-1) typically stores no display name, so the generic portal
 * emission resolves an empty username slice and the Who column renders blank —
 * on installs where most history was written by root, that is most of the
 * column. PHP hard-resolves it to 'Root'; this keeps that, applied to whichever
 * nested subdatum item the portal emitted rather than to a hand-built cell.
 *
 * Kept as an explicit named step (not folded into a component hook): it is a
 * property of the USERS section's superuser row, not of any component model.
 */
function applySuperuserDisplayName(slice: Record<string, unknown>[], userId: number): void {
	if (Number(userId) !== SUPERUSER_ID) return;
	// The item is ADDRESSED by a locator pair, so it is compared as one: the
	// locator law owns section_id equality (loose-numeric — a stored '-1' matches
	// -1, which an inline === would miss), and S2-04/DEC-21 forbids re-deriving
	// that rule inline anywhere but concepts/locator.ts.
	const superuserLocator = { section_tipo: USERS_SECTION_TIPO, section_id: SUPERUSER_ID };
	for (const item of slice) {
		if (!compareLocators(item as never, superuserLocator as never, LOCATOR_ADDRESS_PROPERTIES)) {
			continue;
		}
		const entries = item.entries;
		const empty =
			entries === null ||
			entries === undefined ||
			(Array.isArray(entries) &&
				(entries.length === 0 ||
					entries.every(
						(entry) =>
							entry === null ||
							typeof entry !== 'object' ||
							(entry as { value?: unknown }).value === undefined ||
							(entry as { value?: unknown }).value === '',
					)));
		if (empty) item.entries = [{ value: 'Root', lang: 'lg-nolan' }];
	}
}

/** The TM row-plus that a SectionRow carries in `raw` for emitTmRow. */
interface TmRawRow {
	row: TmRow;
	isRecordList: boolean;
}

/**
 * COUNT(*) for a TM where-shape, with the bare-browse cache. The BARE browse (no
 * scope, whereSql 'true') is a full-table COUNT(*) on the append-only TM table —
 * the only expensive count surface (the scoped ones are index-served). Serve it
 * from the data-event cache: every save this engine performs clears it (saves are
 * exactly when TM grows), with TM_COUNT_CACHE_TTL_MS as the freshness backstop for
 * out-of-band inserts. 0 disables (exact every time — the parity-environment
 * setting). Shared by the count surface (tmReadSource.count) AND the deep-page
 * ORDER-FLIP in queryTmRows, which needs the row total to fetch a far page from
 * the opposite end.
 */
async function tmCount(whereSql: string, params: unknown[]): Promise<number> {
	const ttl = config.ops.tmCountCacheTtlMs;
	const bare = whereSql === 'true';
	if (bare && ttl > 0) {
		const hit = tmBareCountCache.get('bare');
		if (hit !== undefined && Date.now() - hit.at < ttl) return hit.value;
	}
	const rows = (await sql.unsafe(
		`SELECT COUNT(*)::int AS c FROM matrix_time_machine WHERE ${whereSql}`,
		params,
	)) as { c: number }[];
	const value = Number(rows[0]?.c ?? 0);
	if (bare && ttl > 0) {
		tmBareCountCache.set('bare', { value, at: Date.now() });
	}
	return value;
}

/**
 * Query matrix_time_machine for one request (the two scoping surfaces of
 * buildTmWhere) and return the ordered/paginated rows plus which surface it is.
 * The sqo may be raw (direct readTimeMachineData) or sanitized (via the generic
 * readSectionRows) — both carry filter/filter_by_locators/order/limit/offset.
 */
async function queryTmRows(
	sqo: Record<string, unknown>,
): Promise<{ rows: TmRow[]; isRecordList: boolean }> {
	// TWO scoping surfaces (see buildTmWhere): the per-record component HISTORY
	// (filter_by_locators) and the section-record LIST (the tool_time_machine
	// browse: one row per record-level snapshot, tipo = caller section_tipo — PHP
	// applies the tipo column filter, WHERE tipo = q). A dd578 USER relation filter
	// is still IGNORED (PHP ignores it; tm_relation_filter_differential pins that).
	const { whereSql, params: scopeParams, isRecordList, rangeFilter } = buildTmWhere(sqo);

	// Order: dd15's list columns ARE matrix_time_machine's own flat columns, so a
	// header-click sort maps 1:1 to a real column (PHP search_tm orders over the
	// same columns). The client sends the column's component_tipo — map it to its
	// flat column; the raw 'id' (service default) and 'section_id' pseudo-columns
	// pass through. An unmapped tipo is still uncovered scope and throws loudly.
	const order = Array.isArray(sqo.order) ? (sqo.order as Record<string, unknown>[]) : [];
	const orderPath = (order[0]?.path as Record<string, unknown>[] | undefined)?.[0];
	const orderCol = orderPath?.component_tipo;
	const orderColumn = orderCol === undefined ? 'id' : TM_ORDER_COLUMN[String(orderCol)];
	if (orderColumn === undefined) {
		throw new Error(`TM read: order by '${orderCol}' is uncovered scope`);
	}
	const direction = String(order[0]?.direction ?? 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
	// TABLE-QUALIFIED, ALWAYS. The select list aliases `timestamp::text AS
	// timestamp`, and in SQL a BARE `ORDER BY timestamp` binds to the OUTPUT
	// COLUMN, not the table column — so the sort silently became "order by this
	// computed text expression", which no index can serve. The planner's only
	// option was a parallel seq scan + top-N sort of all 50.5M rows: the When
	// header click measured 17 863 ms (reported at 19 583 ms live). Qualifying it
	// as `tm."timestamp"` binds to the COLUMN and the (timestamp, id DESC) index
	// serves it — 0.359 ms, the same rows in the same order (text and timestamp
	// ordering are identical here: PG renders ISO with trimmed trailing zeros, so
	// the fraction digits compare lexicographically exactly as they compare
	// numerically; verified equal over the first 2000 rows despite 49.6M rows
	// carrying fractional seconds). `timestamp` is the ONLY aliased field in that
	// select — id/tipo/data/section_id are emitted unaliased, which is why only
	// the When sort was affected — but every column is qualified now so a future
	// alias cannot reintroduce this silently.
	const orderSql = buildTmOrderSql(orderColumn, direction);

	const limit = Number(sqo.limit ?? 10);
	const offset = Number(sqo.offset ?? 0);
	const params = [...scopeParams, limit, offset];

	// Deep-page acquisition on the unique `id` order (bare browse + record-snapshot
	// list, both PK/(tipo,id)-index-served). A plain OFFSET makes Postgres walk and
	// discard every skipped row — ≈3.7 s at offset 50 M on a 50 M-row table, even on
	// an index-only scan. Two compounding rewrites, both EXACT because `id` is the
	// unique, monotonic PK:
	//   1. ORDER-FLIP: a page in the far half is the SAME set of rows fetched from
	//      the OTHER end with a small offset, then reversed in memory. The last page
	//      ("navigate to the last records") becomes OFFSET 0 (≈0.1 ms, ~35000×).
	//      Needs the row total N (cached for the bare browse); paid only once we are
	//      already deep. No worse under concurrent inserts than plain OFFSET already
	//      is (TM is append-only; the count cache clears on every engine save).
	//   2. LATE ROW LOOKUP: find the page of ids on a narrow index scan first, then
	//      join back for the wide `data` jsonb — never reads a skipped row's snapshot.
	// The section_id order path keeps the plain query below: its sort key has ties,
	// and page membership under ties must not be perturbed (byte-gated reads).
	// PLANNER BARRIER (2026-07-26). A RANGE predicate combined with the `id` sort
	// has NO index that carries both — `("timestamp", id DESC)` orders by timestamp
	// across a range, the PK orders by id but cannot scope. The planner resolves
	// that by walking the `id` PK and filtering inline, betting that LIMIT lets it
	// stop early. On this APPEND-ONLY log the bet is exactly backwards: the filtered
	// column correlates with `id`, so every match sits at the far end and the walk
	// discards the whole prefix — a 2026 When-search discarded 45,992,453 PK entries
	// to return 10 rows (48.9 s at offset 1000, and 51.2 s at offset 30 — this is
	// NOT a deep-page problem). `OFFSET 0` in the innermost select is an
	// optimisation barrier: it blocks the LIMIT pushdown, so the range is scanned
	// index-only and top-N sorted — 440 ms / 770 ms, same rows, same order, no
	// correlation assumption. Applied ONLY for (range filter × id order): an
	// EQUALITY filter is served outright by its `(col, id DESC)` index at 2.6 ms and
	// barriering it would make it ~170x slower. Same family as the WC-046 rewrite
	// below, which is about page DEPTH and does not address this.
	const useBarrier = rangeFilter && orderColumn === 'id';
	if (useBarrier) {
		const barrierParams = [...scopeParams, limit, offset];
		const rows = (await sql.unsafe(
			`SELECT tm.id, tm.section_id, tm.section_tipo, tm.tipo, tm.lang, tm.timestamp::text AS timestamp, tm.user_id, tm.bulk_process_id, tm.data
			 FROM matrix_time_machine tm
			 JOIN (SELECT id FROM (SELECT id FROM matrix_time_machine
			                       WHERE ${whereSql}
			                       OFFSET 0) scoped
			       ORDER BY id ${direction}
			       LIMIT $${barrierParams.length - 1} OFFSET $${barrierParams.length}) page ON page.id = tm.id
			 ORDER BY tm.id ${direction}`,
			barrierParams,
		)) as TmRow[];
		return { rows, isRecordList };
	}

	const lateThreshold = config.ops.searchLateRowLookupOffset;
	if (lateThreshold >= 0 && offset >= lateThreshold && orderColumn === 'id') {
		let effDirection = direction;
		let effOffset = offset;
		let effLimit = limit;
		let reverse = false;
		const total = await tmCount(whereSql, scopeParams);
		// ascOffset = rows to skip from the opposite end for the same page. Flip only
		// when it strictly shortens the walk (offset in the far half) and a page exists.
		const ascOffset = total - offset - limit;
		if (total > offset && ascOffset < offset) {
			effDirection = direction === 'ASC' ? 'DESC' : 'ASC';
			effOffset = Math.max(0, ascOffset); // clamp: last partial page skips 0 from the end
			effLimit = Math.min(limit, total - offset); // last partial page has < limit rows
			reverse = true;
		}
		const lateParams = [...scopeParams, effLimit, effOffset];
		const rows = (await sql.unsafe(
			`SELECT tm.id, tm.section_id, tm.section_tipo, tm.tipo, tm.lang, tm.timestamp::text AS timestamp, tm.user_id, tm.bulk_process_id, tm.data
			 FROM matrix_time_machine tm
			 JOIN (SELECT id FROM matrix_time_machine
			       WHERE ${whereSql}
			       ORDER BY id ${effDirection}
			       LIMIT $${lateParams.length - 1} OFFSET $${lateParams.length}) page ON page.id = tm.id
			 ORDER BY tm.id ${effDirection}`,
			lateParams,
		)) as TmRow[];
		// The flip fetched the page in the opposite order; restore the requested one.
		if (reverse) rows.reverse();
		return { rows, isRecordList };
	}

	const rows = (await sql.unsafe(
		`SELECT id, section_id, section_tipo, tipo, lang, timestamp::text AS timestamp, user_id, bulk_process_id, data
		 FROM matrix_time_machine tm
		 WHERE ${whereSql}
		 ORDER BY ${orderSql}
		 LIMIT $${params.length - 1} OFFSET $${params.length}`,
		params,
	)) as TmRow[];
	return { rows, isRecordList };
}

/** The envelope-entry extras every dd15 row carries (client-consumed; byte-gated). */
function tmEnvelopeExtra(row: TmRow): Record<string, unknown> {
	return {
		matrix_id: row.id,
		timestamp: row.timestamp,
		caller_section_tipo: row.section_tipo,
		caller_section_id: row.section_id,
		bulk_process_id: row.bulk_process_id ?? 0,
		user_id: Number(row.user_id),
	};
}

/**
 * Per-cell decorations that are NOT derivable from the virtual record — the one
 * place dd15 still needs hand-written cell knowledge after the unification
 * (WC-2026-08-14-tm-cells-obey-list-emit-policy).
 *
 * Exactly one member, and it earns its place: the rsc329 annotation item carries
 * the note-record NAVIGATION keys the client note view consumes
 * (view_note_text_area.js) — `matrix_id` (the TM row id; note creation aborts
 * without it), `parent_section_tipo`/`parent_section_id` (the notes section
 * rsc832 + the existing note record, or null) and `created_by_user_id`. None of
 * those are properties of the VALUE, so no emit hook could produce them.
 *
 * `parent_section_id` is lifted OFF the first entry, where tm_record.ts's
 * `tmNoteValue` parked it (PHP component_text_area_json's 'tm' branch did the
 * same lift). The rest of the entry array is ADOPTED STORED TM DATA and is never
 * rewritten — a snapshot must keep the bytes the engine of the day wrote.
 *
 * A dd15 column with no decorator is simply generic. That is the point: the
 * default is the shared pipeline, and every deviation is enumerable here.
 */
const TM_CELL_DECORATORS: Readonly<
	Record<string, (item: Record<string, unknown>, row: TmRow) => void>
> = {
	[TIPO_NOTES]: (item, row) => {
		const entries = Array.isArray(item.entries) ? (item.entries as Record<string, unknown>[]) : [];
		const first = entries[0];
		const parentSectionId =
			first !== undefined && first !== null && typeof first === 'object'
				? ((first.parent_section_id ?? null) as StoredSectionId | null)
				: null;
		if (first !== undefined && first !== null && typeof first === 'object') {
			const { parent_section_id: _lifted, ...rest } = first;
			item.entries = [rest, ...entries.slice(1)];
		}
		item.parent_section_id = parentSectionId;
		item.parent_section_tipo = TM_NOTES_SECTION_TIPO;
		item.created_by_user_id = Number(row.user_id);
		item.matrix_id = row.id;
	},
};

/**
 * Emit ONE dd15 row's data items — one generic cell per requested ddo, resolved
 * from the virtual dd15 record that `tm_record.ts` materializes for the row.
 *
 * THE UNIFICATION (WC-2026-08-14-tm-cells-obey-list-emit-policy): every cell goes
 * through the shared `emitDdoData` in LIST mode, so every component emit hook
 * fires here exactly as it does in the section's own list — text_area truncation
 * (130 chars) with `addTagImgOnTheFly` and the DOS-01 source cap, the
 * `fallback_value` key, original-language forcing. The old private
 * `emitScalarCell` pushed `readComponentItems()` straight onto `emission.items`
 * and therefore skipped all of it, which is why a transcript column rendered
 * hundreds of characters of raw `[TC_…]` / `[index-…]` markup into a list cell.
 *
 * `emitDdo` is the shared emitDdoData, passed in (read_source.ts seam).
 */
async function emitTmRow(
	row: TmRow,
	ddoMap: Ddo[],
	lang: string,
	emission: EmissionContext,
	emitDdo: EmitDdo,
): Promise<void> {
	const requestedTipos = ddoMap
		.map((ddo) => ddo.tipo)
		.filter((tipo): tipo is string => typeof tipo === 'string');
	const ddoByTipo = new Map<string, unknown>();
	for (const ddo of ddoMap) {
		if (typeof ddo.tipo === 'string') ddoByTipo.set(ddo.tipo, ddo);
	}
	const clientDdoMap = ddoMap as unknown[];

	// Every cell resolves from the virtual dd15 record materialized by the SINGLE
	// dd15 builder (tm_record.ts) — the meta columns (who/when/where/what/process/
	// note) AND the section's own components in the record-snapshot list. It is
	// built once per row now rather than lazily: every branch needs it.
	// TmRow is TimeMachineRow minus the parity `dataText` twin (unused here).
	const tmRecord = await buildTmSectionRecord(row as unknown as TimeMachineRow, lang);

	// THE AUDIT-LANG RULE. A snapshot renders in the language it was RECORDED in,
	// never the language the menu happens to be on — `matrix_time_machine` carries
	// its own `lang` column precisely so a historical value can be shown as it was
	// stored. The old emitter applied no lang filter at all ("shows the stored
	// value verbatim"), which was this rule stated as an absence.
	//
	// A row whose lang is lg-nolan is NOT a data lang: whole-record snapshots
	// (delete/duplicate/section saves) are recorded that way and their snapshot
	// holds every language, so those follow the request lang like any list. Using
	// lg-nolan as a filter there would slice a translatable column to nothing and
	// turn this fix from "too much text" into "no text" — on the surface a user
	// reads to decide whether to restore.
	const snapshotLang =
		typeof row.lang === 'string' && row.lang !== '' && row.lang !== 'lg-nolan' ? row.lang : lang;

	const { SELECT_FAMILY_MODELS } = await import('../relations/models/select_family.ts');

	for (const tipo of requestedTipos) {
		const model = await getModelByTipo(tipo);

		// NAMED EXEMPTION — an unresolvable component tipo. emitDdoData THROWS on
		// one where the old emitScalarCell silently emitted nothing, and a TM log
		// is decade-scale on a long-lived install: a column whose ontology node has
		// since been removed must not 500 the whole history browse. Emit an
		// explicitly flagged empty cell instead. NOT a silent narrowing — the cell
		// announces itself, and the reason lives here rather than in a ledger only.
		if (model === null || getColumnNameByModel(model) === null) {
			emission.items.push({
				section_id: row.id,
				section_tipo: TM_SECTION_TIPO,
				tipo,
				mode: 'list',
				lang: 'lg-nolan',
				parent_tipo: TM_SECTION_TIPO,
				row_section_id: row.id,
				entries: [],
				fallback_value: null,
				error: 'unresolved_component_tipo',
				reason:
					'This Time Machine row references a component whose ontology node no longer resolves a model. The snapshot is kept; the column cannot be rendered.',
			} as never);
			continue;
		}

		// The NOTE column follows the REQUEST lang, not the snapshot lang: its
		// context lang seeds the note modal's editor, so a note must be written in
		// the same language the read filters by or a saved note never shows again
		// (grey icon over existing text). Every other column follows the audit-lang
		// rule. Non-translatable columns are nolan-forced by emitDdoData regardless.
		const cellLang = tipo === TIPO_NOTES ? lang : snapshotLang;
		const clientDdo = (ddoByTipo.get(tipo) ?? { tipo }) as Record<string, unknown>;
		// LIST mode is the whole point: it is what makes every emit hook fire.
		const cellDdo = { ...clientDdo, tipo, mode: 'list' };

		const before = emission.items.length;
		await emitDdo(
			cellDdo as never,
			clientDdoMap as never,
			tmRecord as never,
			{ section_tipo: TM_SECTION_TIPO, section_id: row.id },
			'list',
			cellLang,
			TM_SECTION_TIPO,
			emission,
		);

		// PORTAL family pins each nested block's parent to its own record; SELECT
		// family (a flat resolved label) has no nested blocks to pin.
		const isPortalFamily =
			getColumnNameByModel(model) === 'relation' && !SELECT_FAMILY_MODELS.has(model);
		for (let i = before; i < emission.items.length; i++) {
			const item = emission.items[i] as Record<string, unknown>;
			if (item.tipo === tipo) {
				// No mode restamp: the cell stays in the LIST mode it was emitted in,
				// matching the column ddo the context now declares
				// (WC-2026-08-14-tm-ddo-mode-retired). Context and data flipped
				// together — the byte-identical client binds a cell to its context by
				// an EXACT (tipo, mode, section_tipo) match and drops the column if the
				// two ever disagree. Nested SUBDATUM items keep their own mode for the
				// same reason (forcing them to 'tm' is what once blanked the dd578 Who
				// column); they need no special handling now that nothing is restamped.
				item.from_component_tipo ??= tipo;
				item.parent_section_id ??= row.id;
				TM_CELL_DECORATORS[tipo]?.(item, row);
			} else if (isPortalFamily && item.parent_section_id === undefined) {
				item.parent_section_id = item.section_id;
			}
		}

		if (tipo === TIPO_USER) {
			applySuperuserDisplayName(
				emission.items.slice(before) as unknown as Record<string, unknown>[],
				row.user_id,
			);
		}
	}
}

/**
 * The dd15 Time Machine read source (PHP search_tm + the per-row
 * tm_record::get_section_record materialization). Plugged into the generic
 * readSectionRows via section/read_source.ts so dd15 is served as a normal
 * section — same envelope/context/count, only row acquisition + cell policy differ.
 */
export const tmReadSource: SectionReadSource = {
	async getRows(sqo: Sqo): Promise<SectionRow[]> {
		const { rows, isRecordList } = await queryTmRows(sqo as Record<string, unknown>);
		return rows.map((row) => ({
			// dd15 addresses each snapshot by the TM row PK (its own `id`).
			section_tipo: TM_SECTION_TIPO,
			section_id: row.id,
			envelopeExtra: tmEnvelopeExtra(row),
			raw: { row, isRecordList } satisfies TmRawRow,
		}));
	},

	async count(sqo: Sqo): Promise<number> {
		const where = buildTmWhere(sqo as Record<string, unknown>);
		return tmCount(where.whereSql, where.params);
	},

	async emitRow(context: EmitRowContext): Promise<void> {
		const { row } = context.row.raw as TmRawRow;
		await emitTmRow(row, context.ddoMap, context.lang, context.emission, context.emitDdo);
	},

	buildContext: buildTmContext,
};

/**
 * Build the dd15 structure-context for a TM read (PHP section::get_json context
 * over the virtual dd15 record). dd15's LIST columns are the CLIENT's chosen
 * components (the caller section's fields shown as history columns), so — unlike
 * an ordinary section — its request_config.show.ddo_map is mirrored from
 * rqo.show.ddo_map (with ontology-term labels), NOT derived from the ontology.
 * The generic readSection context builder can't produce this, so the TM source
 * owns it (formerly the dispatch mode:'tm' branch).
 */
async function buildTmContext(rqo: Rqo, _principal: Principal): Promise<StructureContextEntry[]> {
	const source = (rqo.source ?? {}) as Record<string, unknown>;
	// The Time Machine (dd15) is consultation-only — cap at read (1) even for
	// admins so no TM column/subdatum renders editable (reverts go through
	// tool_time_machine, never inline edit). buildStructureContext caps the dd15
	// section by section_tipo too; this caps the value threaded to the columns.
	const permissions = 1;
	const { buildStructureContext } = await import('./structure_context.ts');

	// dd15's LIST columns are DERIVED FROM THE AUTHORISED SCOPE
	// (WC-2026-08-14-tm-scope-server-owned). The scope comes from the SQO the read
	// is executed against, so the columns and the WHERE cannot disagree.
	//
	// The client's own show.ddo_map is still honoured when it sends one, and that
	// is not laziness: a section instance sends the ddo_map the SERVER gave it in
	// the previous context read, so the two agree by construction, and a browser
	// holding a pre-unification client keeps working (tool JS ships with no
	// cachebust). Server-derived wins when the client sends nothing.
	//
	// Nothing renders without one of these: the bare browse falls through to
	// dd15's OWN ontology section_list, exactly like any other section.
	const clientColumns = rqo.show?.ddo_map ?? [];
	let columns: { tipo?: unknown; label?: unknown; view?: unknown; column_id?: unknown }[] =
		clientColumns;
	if (clientColumns.length === 0) {
		const { resolveTimeMachineScope, tmListColumns } = await import(
			'../section/list_definitions/time_machine_list.ts'
		);
		const scope = resolveTimeMachineScope(rqo.sqo as Record<string, unknown> | undefined, {
			surface: source.tm_surface,
		});
		const derived = await tmListColumns(scope);
		if (derived !== null) {
			columns = derived as never;
		} else {
			const { deriveSectionDdoMap } = await import('../section/read.ts');
			columns = (await deriveSectionDdoMap(TM_SECTION_TIPO, TM_SECTION_TIPO, 'list')) as never;
		}
	}

	const tmContext: StructureContextEntry[] = [];
	const sectionCtx = await buildStructureContext({
		tipo: TM_SECTION_TIPO,
		sectionTipo: TM_SECTION_TIPO,
		mode: 'list',
		lang: typeof source.lang === 'string' ? source.lang : currentDataLang(),
		permissions,
	});
	if (sectionCtx !== null) {
		// Mirror the client's show.ddo_map into the section's request_config so the
		// client renders the chosen columns (PHP parity — dd15 columns are client-driven).
		const requestConfig = (sectionCtx as { request_config?: { show?: { ddo_map?: unknown } }[] })
			.request_config?.[0];
		if (requestConfig?.show !== undefined) {
			const headerLang = typeof source.lang === 'string' ? source.lang : currentDataLang();
			requestConfig.show.ddo_map = await Promise.all(
				columns.map(async (d) => {
					const ddo = d as Record<string, unknown>;
					// PHP fills the column label from the ontology TERM when the client
					// didn't send one (dd1371→Proceso, dd559→Cuándo, …).
					const label =
						typeof ddo.label === 'string' && ddo.label !== ''
							? ddo.label
							: await termByTipo(String(ddo.tipo), headerLang);
					return {
						typo: 'ddo',
						tipo: ddo.tipo,
						section_tipo: TM_SECTION_TIPO,
						parent: TM_SECTION_TIPO,
						// LIST, not 'tm' (WC-2026-08-14-tm-ddo-mode-retired). The client
						// binds a cell to its context by an EXACT (tipo, mode, section_tipo)
						// match, so this and the data half flip together or the column
						// silently disappears.
						mode: 'list',
						view: ddo.view ?? null,
						label,
						...(ddo.column_id !== undefined ? { column_id: ddo.column_id } : {}),
					};
				}),
			);
		}
		tmContext.push(sectionCtx);
	}
	for (const ddo of columns) {
		if (typeof ddo.tipo !== 'string') continue;
		// Per-column lang follows PHP's component lang rule: a TRANSLATABLE column
		// gets the data lang, a non-translatable one lg-nolan. The dd15 meta
		// columns are all non-translatable; rsc329 (the TM annotation) is NOT —
		// its context lang seeds the note modal's editor, so notes must WRITE in
		// the same lang the TM read lang-filters by, or a saved note never shows
		// (grey icon over existing text).
		const columnLang = (await getTranslatableByTipo(ddo.tipo))
			? typeof source.lang === 'string'
				? source.lang
				: currentDataLang()
			: 'lg-nolan';
		const entry = await buildStructureContext({
			tipo: ddo.tipo,
			sectionTipo: TM_SECTION_TIPO,
			mode: 'list',
			lang: columnLang,
			permissions,
			parent: TM_SECTION_TIPO,
			view: (ddo as { view?: string }).view ?? null,
		});
		if (entry !== null) tmContext.push(entry);
	}
	return tmContext;
}

/**
 * Count TM rows for a request (pagination parity with the read). Thin wrapper
 * over the read source's count — kept for the count dispatch path / callers.
 */
export async function countTimeMachineData(rqo: Rqo): Promise<number> {
	return tmReadSource.count((rqo.sqo ?? {}) as Sqo);
}

/**
 * Adapter kept for direct callers/tests: run the TM query + build the standard
 * {sections envelope, per-row data} shape by composing the read source with the
 * shared emitDdoData. (The generic readSectionRows path does the same assembly.)
 */
export async function readTimeMachineData(rqo: Rqo): Promise<TmReadData> {
	const sqo = (rqo.sqo ?? {}) as Record<string, unknown>;
	const source = (rqo.source ?? {}) as Record<string, unknown>;
	// Request-scoped data lang backstop (S2-28), never a hardcoded lg-spa.
	const lang = typeof source.lang === 'string' ? source.lang : currentDataLang();
	const ddoMap = (rqo.show?.ddo_map ?? []) as Ddo[];
	const offset = Number(sqo.offset ?? 0);

	const { rows, isRecordList } = await queryTmRows(sqo);

	// The sections envelope (dd15; section_id = the TM row PK = matrix_id).
	const data: Record<string, unknown>[] = [
		{
			typo: 'sections',
			tipo: TM_SECTION_TIPO,
			section_tipo: [],
			entries: rows.map((row, index) => ({
				section_tipo: TM_SECTION_TIPO,
				section_id: row.id,
				paginated_key: index + offset,
				...tmEnvelopeExtra(row),
			})),
		},
	];

	// Requested column components (client ddo_map tipos, dd15-scoped only).
	const requestedTipos = ddoMap
		.map((ddo) => ddo.tipo)
		.filter((tipo): tipo is string => typeof tipo === 'string');
	const handled = new Set([TIPO_BULK_PROCESS, TIPO_TIMESTAMP, TIPO_USER, TIPO_COMPONENT]);
	// In the record-snapshot list, the section's own components ARE resolved (from
	// each snapshot's data), so only the per-component history reports metadata
	// misses as unhandled.
	const unhandled = isRecordList ? [] : requestedTipos.filter((tipo) => !handled.has(tipo));

	// Compose the shared per-row emission (identical to the generic readSectionRows
	// path — the source's emitRow over emitDdoData).
	const { emitDdoData } = await import('../section/read.ts');
	const emission = new EmissionContext(data as never);
	for (const row of rows) {
		await emitTmRow(row, ddoMap, lang, emission, emitDdoData as EmitDdo);
	}

	return { data, unhandled };
}
