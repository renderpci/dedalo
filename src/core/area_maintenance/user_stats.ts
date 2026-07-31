/**
 * User activity statistics (PHP diffusion/class.diffusion_section_stats.php):
 * per-user, per-day aggregates of the matrix_activity audit log stored as
 * dd1521 records in matrix_stats — what (action-code counts mapped to
 * ontology terms), where (section tipos touched), when (hour histogram) and
 * publish (per-section publish counts from dd1223 events).
 *
 * The rebuild flow (maintenance widget database_info.rebuild_user_stats)
 * DELETES a user's stats rows and recomputes every day from the surviving
 * matrix_activity rows. (!) That is intentionally lossy when the activity log
 * is shorter than the stats history — an admin decision; the differential
 * gate uses a SYNTHETIC user so real aggregates are never touched.
 */

import { encodeForJsonb } from '../db/json_codec.ts';
import { sql } from '../db/postgres.ts';

/** dd1521 record components (PHP USER_ACTIVITY_* constants). */
const UA_SECTION = 'dd1521';
const UA_USER = 'dd1522';
const UA_TYPE = 'dd1531';
const UA_DATE = 'dd1530';
const UA_TOTALS = 'dd1523';
const USERS_SECTION = 'dd128';

/** matrix_activity components (logger_backend_activity). */
const ACT_WHO = 'dd543';
const ACT_WHAT = 'dd545';
const ACT_WHERE = 'dd546';
const ACT_WHEN = 'dd547';
const ACT_DATA = 'dd551';

/** Activity what-code → ontology term tipo (PHP build_what $what_map). */
const WHAT_MAP: Record<string, string> = {
	'1': 'dd696', // login
	'2': 'dd697', // logout
	'3': 'dd695', // new
	'4': 'dd729', // delete
	'5': 'dd700', // save
	'6': 'dd694', // edit
	'7': 'dd693', // list
	'8': 'dd699', // search
	'9': 'dd1090', // upload
	'10': 'dd1080', // download
	'11': 'dd1094', // upload complete
	'12': 'dd1095', // delete file
	'13': 'dd1092', // recover section
	'14': 'dd1091', // recover component
	'15': 'dd1098', // statistics
	'16': 'dd1081', // new file version
};

/** 'where' keys the aggregation ignores (tool/internal areas). */
const WHERE_SKIP: ReadonlySet<string> = new Set(['dd271', 'dd1224', 'dd1225']);
/** The 'last publish' where-key routed to the publish histogram. */
const WHERE_PUBLISH = 'dd1223';

function userLocatorFilter(componentTipo: string, userId: number): string {
	// json_codec even for the read-side @> containment params — one binding
	// discipline for every jsonb param in this module (S2-07).
	return encodeForJsonb({
		[componentTipo]: [{ section_tipo: USERS_SECTION, section_id: String(userId) }],
	});
}

/**
 * The actor predicate for matrix_activity — the WC-056 indexed EXPRESSION pair,
 * NOT `relation @> …` containment.
 *
 * WHY (2026-07-30, the reported `rebuild_user_stats` statement timeout).
 * Containment can only be answered by the relation GIN, which returns the
 * actor's WHOLE history as one bitmap; a `timestamp` bound is then a Filter, so
 * every window — even a single day — pays for the full actor. Measured on the
 * 32.9M-row mdcat log, actor dd128/2 has 8.1M rows: `count(*)` alone took 57 s
 * against a 60 s `DB_STATEMENT_TIMEOUT_MS`, and the rebuild's row fetch (994 B
 * average width, plus a sort) never came close to finishing. `matrix_activity_
 * who_ts_idx` carries the actor AND `("timestamp", id)`, so the same predicate
 * written as an equality on its expressions turns any window into an index
 * RANGE scan: the identical single-day aggregate is 14 ms.
 *
 * THE INVARIANT is builder_relation's (element 0 is the only actor locator —
 * how activity_log.ts writes it, gated by activity_log_single_actor.test.ts).
 * section_tipo is bound explicitly, so a locator into another section can never
 * be a false positive.
 *
 * (!) DELIBERATE DEVIATION from the containment predicate it replaced: `->>` is
 * type-lossy where `@>` was type-strict, so a NUMERIC section_id would match here
 * and would not have before. Inert, not an oversight — both writers stringify
 * (activity_log.ts `String(...)`; PHP locator::set_section_id casts), and all
 * 32.94M mdcat rows are string-typed with jsonb_array_length(dd543) = 1.
 */
function whoScope(userId: number, params: unknown[]): string {
	params.push(String(userId), USERS_SECTION);
	const id = params.length - 1;
	return (
		`a.relation->'${ACT_WHO}'->0->>'section_id' = $${id} ` +
		`AND a.relation->'${ACT_WHO}'->0->>'section_tipo' = $${id + 1}`
	);
}

/**
 * Rows per aggregation statement — the knob that keeps every statement under
 * `DB_STATEMENT_TIMEOUT_MS` (60 s as configured).
 *
 * CALIBRATED, not guessed. The full rebuild window of the 8.1M-row mdcat actor
 * was run at 400k/page: 21 pages, 154 s total, pages ranging 2.8 s → 30.2 s. An
 * isolated EXPLAIN ANALYZE of the same 400k page was 3.4 s, so that spread is
 * cache state and TOAST width, not the plan — the headroom has to absorb an
 * order of magnitude, and 2× is not enough. The same window re-run at 100k has a
 * worst page of 5.3 s (~11× under the ceiling) and finished FASTER end to end —
 * 127 s over ~81 pages — because a narrower page spills less; the extra round
 * trips are noise against heap-read-bound work. Both runs returned identical
 * tallies (1124 keys, 21,643,162 counted dimensions), which is the paging
 * invariant holding at production scale.
 *
 * Pages bound BOTH the statement duration and the CTE tuplestore (19 MB at 400k),
 * so lowering this is always safe; raising it trades away the only margin.
 */
const AGGREGATE_PAGE_ROWS = 100000;

/** The marker `kind` of the paged aggregate's trailing cursor row. */
const CURSOR_KIND = '__cursor__';

/** One (day, dimension, key) count from the paged aggregate. */
interface ActivityTally {
	day: string;
	kind: 'what' | 'where' | 'when' | 'publish';
	/** Dimension-raw: the what CODE (not yet WHAT_MAP'd), the where/publish tipo, the hour. */
	key: string;
	n: number;
	/** Lowest contributing matrix_activity id — the first-encounter order carrier. */
	minId: number;
}

/**
 * Aggregate one actor's matrix_activity window IN THE DATABASE, paged.
 *
 * WHY IT IS NOT A ROW LOOP ANY MORE (2026-07-30). The dimensions this reduces to
 * are ~40 keys per day, but the rows behind them are the whole activity log: the
 * previous shape selected every matching row (7 columns, 4 of them jsonb) into
 * the process and folded it in TS. On the 8.1M-row actor that is ~8 GB across
 * the wire for an answer measured in kilobytes — the statement timeout was the
 * first wall it hit, not the last. Counting server-side makes the result size
 * independent of the log size, and the (timestamp, id) keyset page makes every
 * statement bounded by `AGGREGATE_PAGE_ROWS` instead of by the actor's history.
 *
 * Only the two extraction rules that DECIDE which dimension a row lands in live
 * in the SQL — the `where` value's array unwrap, and the dd1223 → publish
 * routing with its top_tipo/section_tipo preference. WHAT_MAP and WHERE_SKIP
 * stay in TS (below), so the mapping tables have exactly one home.
 *
 * `minId` per group is what preserves the totals array ORDER: the payload is
 * ordered by first encounter in id-ascending order, which is a pinned wire shape
 * (widget_request_native + the frozen get_widget_data fixture), so the order can
 * not be re-derived from the aggregate — it has to be carried.
 */
export async function aggregateActivity(
	userId: number,
	from: string | null,
	until: string,
	/**
	 * Page size. A parameter ONLY so the gate can drive the paging path with a
	 * handful of scratch rows (user_stats_paging.test.ts asserts that any page
	 * size yields byte-identical tallies) — production always takes the default.
	 */
	pageRows: number = AGGREGATE_PAGE_ROWS,
): Promise<{ tallies: ActivityTally[]; rows: number }> {
	const limit = Math.max(1, Math.trunc(pageRows));
	const tallies: ActivityTally[] = [];
	let rows = 0;
	let cursor: { ts: string; id: number } | null = null;

	for (;;) {
		const params: unknown[] = [];
		const scope = [whoScope(userId, params)];
		params.push(until);
		scope.push(`a."timestamp" < date($${params.length})`);
		if (from !== null) {
			params.push(from);
			scope.push(`a."timestamp" >= date($${params.length})`);
		}
		if (cursor !== null) {
			params.push(cursor.ts, cursor.id);
			scope.push(
				`(a."timestamp", a.id) > ($${params.length - 1}::timestamp, $${params.length}::int)`,
			);
		}

		const page = (await sql.unsafe(
			`WITH page AS (
				SELECT a.id, a."timestamp",
				       a.relation->'${ACT_WHAT}'->0->>'section_id' AS what_key,
				       a.date->'${ACT_WHEN}'->0->'start'->>'hour' AS hour_key,
				       CASE jsonb_typeof(a.string->'${ACT_WHERE}'->0->'value')
				            WHEN 'array' THEN
				                 CASE WHEN jsonb_typeof(a.string->'${ACT_WHERE}'->0->'value'->0) = 'string'
				                      THEN a.string->'${ACT_WHERE}'->0->'value'->>0 END
				            WHEN 'string' THEN a.string->'${ACT_WHERE}'->0->'value'#>>'{}'
				       END AS where_key,
				       CASE WHEN a.misc->'${ACT_DATA}'->0->'value'->'top_tipo' IS NULL
				              OR jsonb_typeof(a.misc->'${ACT_DATA}'->0->'value'->'top_tipo') = 'null'
				            THEN a.misc->'${ACT_DATA}'->0->'value'->'section_tipo'
				            ELSE a.misc->'${ACT_DATA}'->0->'value'->'top_tipo'
				       END AS publish_raw
				FROM matrix_activity a
				WHERE ${scope.join(' AND ')}
				ORDER BY a."timestamp", a.id
				LIMIT ${limit}
			)
			SELECT to_char(p."timestamp", 'YYYY-MM-DD') AS day, v.kind, v.key,
			       count(*)::bigint AS n, min(p.id)::bigint AS min_id
			FROM page p
			CROSS JOIN LATERAL (VALUES
				('what', p.what_key),
				('when', p.hour_key),
				(CASE WHEN p.where_key = '${WHERE_PUBLISH}' THEN 'publish' ELSE 'where' END,
				 CASE WHEN p.where_key = '${WHERE_PUBLISH}'
				      THEN CASE WHEN p.publish_raw IS NULL
				                  OR p.publish_raw IN ('null'::jsonb, 'false'::jsonb)
				                THEN NULL ELSE p.publish_raw#>>'{}' END
				      ELSE p.where_key END)
			) AS v(kind, key)
			-- (!) The empty-string guard below is DELIBERATELY blanket over all four
			-- dimensions; the row loop applied it to the where value only. Do not
			-- "restore parity" here: an empty key is unreachable (no writer emits
			-- one, 0 hits in 36.5M rows), and where it would have differed the old
			-- output was garbage anyway (Number of '' is 0, so an empty hour became
			-- a duplicate hour-0 entry).
			WHERE v.key IS NOT NULL AND v.key <> ''
			GROUP BY 1, 2, 3
			UNION ALL
			-- The keyset cursor + the page's row count, as one trailing row: the
			-- page CTE cannot be reached from a second statement, and re-deriving
			-- either would mean scanning the window twice.
			(SELECT to_char(p."timestamp", 'YYYY-MM-DD HH24:MI:SS.US'), '${CURSOR_KIND}', NULL,
			        (SELECT count(*)::bigint FROM page), p.id::bigint
			 FROM page p ORDER BY p."timestamp" DESC, p.id DESC LIMIT 1)`,
			params as (string | number)[],
		)) as { day: string; kind: string; key: string | null; n: string; min_id: string }[];

		let next: { ts: string; id: number } | null = null;
		let pageCount = 0;
		for (const row of page) {
			if (row.kind === CURSOR_KIND) {
				pageCount = Number(row.n);
				next = { ts: row.day, id: Number(row.min_id) };
				continue;
			}
			tallies.push({
				day: row.day,
				kind: row.kind as ActivityTally['kind'],
				key: String(row.key),
				n: Number(row.n),
				minId: Number(row.min_id),
			});
		}
		rows += pageCount;
		// A short page (or an empty one — no cursor row at all) is the last.
		if (next === null || pageCount < limit) break;
		cursor = next;
	}

	return { tallies, rows };
}

/**
 * Fold tallies into ONE dimension set, applying the two TS-side mapping tables:
 * WHAT_MAP (an unmapped action code is dropped, as PHP build_what drops it) and
 * WHERE_SKIP (tool areas leave the `where` histogram but still count in `what`
 * and `when` — the same asymmetry the row loop had).
 *
 * Insertion order is `minId` ascending, so a key's position is where it was
 * FIRST seen; a key split across pages accumulates at its earliest position.
 */
function foldTallies(tallies: ActivityTally[]): DayGroup {
	const group: DayGroup = {
		what: new Map(),
		where: new Map(),
		when: new Map(),
		publish: new Map(),
	};
	const add = (target: Map<string, number>, key: string, n: number): void => {
		target.set(key, (target.get(key) ?? 0) + n);
	};
	for (const tally of [...tallies].sort((a, b) => a.minId - b.minId)) {
		if (tally.kind === 'what') {
			const tipo = WHAT_MAP[tally.key];
			if (tipo !== undefined) add(group.what, tipo, tally.n);
		} else if (tally.kind === 'where') {
			if (!WHERE_SKIP.has(tally.key)) add(group.where, tally.key, tally.n);
		} else if (tally.kind === 'when') {
			add(group.when, tally.key, tally.n);
		} else {
			add(group.publish, tally.key, tally.n);
		}
	}
	return group;
}

/** PHP delete_user_activity_stats: drop every dd1521 row of one user. */
export async function deleteUserActivityStats(userId: number): Promise<boolean> {
	await sql.unsafe(
		'DELETE FROM matrix_stats WHERE section_tipo = $1 AND relation @> $2::text::jsonb',
		[UA_SECTION, userLocatorFilter(UA_USER, userId)],
	);
	return true;
}

interface DayGroup {
	what: Map<string, number>;
	where: Map<string, number>;
	when: Map<string, number>;
	publish: Map<string, number>;
}

export interface UpdateStatsResponse {
	result: unknown;
	msg: string;
	errors: string[];
	[extra: string]: unknown;
}

/**
 * PHP update_user_activity_stats: aggregate the user's matrix_activity rows
 * from the day after the last saved stats day (or from the beginning) up to
 * YESTERDAY inclusive, one dd1521 record per day with data.
 */
export async function updateUserActivityStats(
	userId: number,
	maxDays = 0,
	/**
	 * Aggregation page size — a TEST SEAM only (production always takes the
	 * default). It exists so a gate can drive the SAVED dd1521 totals array, the
	 * artifact the wire contract actually pins, across a page boundary: without it
	 * that array is only ever produced from a single page.
	 */
	pageRows: number = AGGREGATE_PAGE_ROWS,
): Promise<UpdateStatsResponse> {
	const response: UpdateStatsResponse = {
		result: false,
		msg: 'Error. Request failed. ',
		errors: [],
	};

	// last aggregated day (newest stats row of the user)
	const lastRows = (await sql.unsafe(
		'SELECT date FROM matrix_stats WHERE relation @> $1::text::jsonb ORDER BY id DESC LIMIT 1',
		[userLocatorFilter(UA_USER, userId)],
	)) as {
		date: Record<string, { start?: { year?: number; month?: number; day?: number } }[]> | null;
	}[];
	const lastStart = lastRows[0]?.date?.[UA_DATE]?.[0]?.start;
	let lastAggregated: Date | null = null;
	if (lastStart?.year && lastStart.month && lastStart.day) {
		lastAggregated = new Date(lastStart.year, lastStart.month - 1, lastStart.day);
	}

	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterday = new Date(today.getTime() - 24 * 3600 * 1000);
	if (lastAggregated !== null && lastAggregated.getTime() >= yesterday.getTime()) {
		response.result = 0;
		response.msg = 'Stats are already updated';
		return response;
	}

	const isoDate = (date: Date): string =>
		`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
			date.getDate(),
		).padStart(2, '0')}`;

	// activity scan: [day after last, today)
	const from =
		lastAggregated !== null ? isoDate(new Date(lastAggregated.getTime() + 24 * 3600 * 1000)) : null;
	const { tallies, rows: rowCount } = await aggregateActivity(
		userId,
		from,
		isoDate(today),
		pageRows,
	);

	const dayGroups = new Map<string, DayGroup>();
	const byDay = new Map<string, ActivityTally[]>();
	for (const tally of tallies) {
		const list = byDay.get(tally.day);
		if (list === undefined) byDay.set(tally.day, [tally]);
		else list.push(tally);
	}
	for (const [day, list] of byDay) dayGroups.set(day, foldTallies(list));

	if (rowCount === 0) {
		response.msg = 'No activity records found';
		response.result = [];
		return response;
	}

	const { termByTipo } = await import('../ontology/labels.ts');
	const { currentApplicationLang } = await import('../resolve/request_lang.ts');
	const appLang = currentApplicationLang();

	const updatedDays: { user: number; date: string }[] = [];
	for (const day of [...dayGroups.keys()].sort()) {
		if (maxDays > 0 && updatedDays.length >= maxDays) break;
		const [year, month, dayNum] = day.split('-').map(Number) as [number, number, number];

		// skip already-saved days
		const exists = (await sql.unsafe(
			`SELECT 1 FROM matrix_stats
			 WHERE relation @> $1::text::jsonb
			   AND ("date"->'${UA_DATE}'->0->'start'->>'year')::int = $2
			   AND ("date"->'${UA_DATE}'->0->'start'->>'month')::int = $3
			   AND ("date"->'${UA_DATE}'->0->'start'->>'day')::int = $4
			 LIMIT 1`,
			[userLocatorFilter(UA_USER, userId), year, month, dayNum],
		)) as unknown[];
		if (exists.length > 0) continue;

		const group = dayGroups.get(day) as DayGroup;
		const totals: Record<string, unknown>[] = [];
		for (const [tipo, value] of group.what) {
			totals.push({ type: 'what', tipo, value, label: await termByTipo(tipo, appLang) });
		}
		for (const [tipo, value] of group.where) {
			totals.push({ type: 'where', tipo, value });
		}
		for (const [hour, value] of group.when) {
			totals.push({ type: 'when', hour: Number(hour), value });
		}
		for (const [tipo, value] of group.publish) {
			totals.push({ type: 'publish', tipo, value });
		}
		if (totals.length === 0) continue;

		const saved = await saveUserActivity(totals, userId, 'day', year, month, dayNum);
		if (saved === false) continue;
		updatedDays.push({ user: userId, date: day });
	}

	response.result = updatedDays;
	response.msg =
		response.errors.length === 0 ? 'OK. Request done.' : 'Warning! Request done with errors';
	return response;
}

/** One canonical stats dimension entry (PHP cross_users_range_data shape). */
export interface CanonicalEntry {
	key: string | number;
	label: string | null;
	value: number;
}

/** The canonical totals object {who, what, where, when, publish}. */
export interface CanonicalTotals {
	who: CanonicalEntry[];
	what: CanonicalEntry[];
	where: CanonicalEntry[];
	when: CanonicalEntry[];
	publish: CanonicalEntry[];
}

/** One verticalized raw activity item (PHP get_interval_raw_activity_data). */
export type RawActivityItem =
	| { type: 'what'; tipo: string; value: number; label: string | null }
	| { type: 'where' | 'publish'; tipo: string; value: number }
	| { type: 'when'; hour: string | number; value: number };

const pad2 = (hour: number): string => String(hour).padStart(2, '0');

/** PHP dd_date::convert_date_to_seconds — the virtual 372-day-year calendar. */
export function virtualDateSeconds(year: number, month: number, day: number): number {
	return (year * 372 + (month - 1) * 31 + (day - 1)) * 86400;
}

/**
 * PHP get_interval_raw_activity_data: one flat pass over the user's
 * matrix_activity rows in [dateIn, dateOut) (exclusive upper bound),
 * verticalized to {type, tipo|hour, value} items — the same what-map /
 * where-skip / dd1223→publish routing as the per-day aggregation above.
 */
export async function getIntervalRawActivityData(
	userId: number,
	dateIn: string,
	dateOut: string,
): Promise<RawActivityItem[] | null> {
	// Day-keyed tallies folded into ONE set: the same paged, index-served
	// aggregation as the rebuild (its doc carries the why), flattened over the
	// whole interval. First-encounter order survives the flattening because
	// foldTallies orders by the global minimum id, not by day.
	const { tallies } = await aggregateActivity(userId, dateIn, dateOut);
	const { what, where, when, publish } = foldTallies(tallies);

	const { termByTipo } = await import('../ontology/labels.ts');
	const { currentApplicationLang } = await import('../resolve/request_lang.ts');
	const appLang = currentApplicationLang();
	const items: RawActivityItem[] = [];
	for (const [tipo, value] of what) {
		items.push({ type: 'what', tipo, value, label: await termByTipo(tipo, appLang) });
	}
	for (const [tipo, value] of where) items.push({ type: 'where', tipo, value });
	for (const [hour, value] of when) items.push({ type: 'when', hour, value });
	for (const [tipo, value] of publish) items.push({ type: 'publish', tipo, value });
	return items;
}

/** A fresh 24-slot hour histogram (PHP pre-fill, keys 0..23, labels '00'..'23'). */
function emptyWhen(): CanonicalEntry[] {
	return Array.from({ length: 24 }, (_, hour) => ({
		key: hour,
		label: pad2(hour),
		value: 0,
	}));
}

/**
 * PHP cross_users_range_data: aggregate the saved dd1521 matrix_stats rows of
 * one user over [dateIn, dateOut] (inclusive day bounds) into the canonical
 * {who, what, where, when, publish}. Null when no stats rows exist in range.
 * Day-granular date compare over the stored dd1530 start triple (equivalent
 * to PHP's virtual-seconds bounds for the day records this section holds).
 */
export async function crossUsersRangeData(
	dateIn: string,
	dateOut: string,
	userId: number,
	lang: string,
): Promise<CanonicalTotals | null> {
	const rows = (await sql.unsafe(
		`SELECT relation, misc->$4 AS totals, date
		 FROM matrix_stats
		 WHERE section_tipo = $5
		   AND relation @> $1::text::jsonb
		   AND make_date(
		         ("date"->'${UA_DATE}'->0->'start'->>'year')::int,
		         ("date"->'${UA_DATE}'->0->'start'->>'month')::int,
		         ("date"->'${UA_DATE}'->0->'start'->>'day')::int
		       ) BETWEEN date($2) AND date($3)
		 ORDER BY make_date(
		         ("date"->'${UA_DATE}'->0->'start'->>'year')::int,
		         ("date"->'${UA_DATE}'->0->'start'->>'month')::int,
		         ("date"->'${UA_DATE}'->0->'start'->>'day')::int
		       ) ASC, id ASC`,
		[userLocatorFilter(UA_USER, userId), dateIn, dateOut, UA_TOTALS, UA_SECTION],
	)) as {
		relation: { from_component_tipo?: string; section_tipo?: string; section_id?: unknown }[][];
		totals: { value?: unknown }[] | { value?: unknown } | null;
	}[];
	if (rows.length === 0) return null;

	const { termByTipo } = await import('../ontology/labels.ts');
	const termCache = new Map<string, string | null>();
	const resolveTerm = async (tipo: string): Promise<string | null> => {
		let label = termCache.get(tipo);
		if (label === undefined) {
			label = await termByTipo(tipo, lang);
			termCache.set(tipo, label);
		}
		return label;
	};

	const who = new Map<string, CanonicalEntry>();
	const what = new Map<string, CanonicalEntry>();
	const where = new Map<string, CanonicalEntry>();
	const publish = new Map<string, CanonicalEntry>();
	const when = new Map<number, CanonicalEntry>();
	for (const entry of emptyWhen()) when.set(Number(entry.key), entry);
	const userLabelCache = new Map<string, string | null>();

	for (const row of rows) {
		// unwrap component_json [{value, lang}] → the flattened totals array
		const rawTotals = row.totals;
		const wrapped = Array.isArray(rawTotals) ? rawTotals[0]?.value : rawTotals?.value;
		const totals = (Array.isArray(wrapped) ? wrapped.flat() : []) as {
			type?: string;
			tipo?: string;
			hour?: unknown;
			value?: unknown;
		}[];
		if (totals.length === 0) continue;

		// the row's user — (!) PHP LIVE DEFECT, mirrored: array_find iterates
		// the relation COLUMN's first-level values (per-tipo ARRAYS, never
		// locator objects), so no user ever matches and the `who` dimension is
		// permanently EMPTY on live PHP (oracle-verified 2026-07-10; pinned in
		// get_widget_data_differential). When PHP fixes it, scan the flattened
		// locators for from_component_tipo === dd1522 here and reconcile.
		const relationColumn = row.relation as unknown as Record<string, unknown[]> | null;
		const relations = (
			Array.isArray(relationColumn) ? relationColumn : Object.values(relationColumn ?? {})
		) as { from_component_tipo?: string; section_tipo?: string; section_id?: unknown }[];
		const user = relations.find(
			(item) => item?.from_component_tipo === UA_USER && item?.section_tipo === USERS_SECTION,
		);
		const userKey = user !== undefined ? String(user.section_id) : null;

		let whereActionsTotal = 0;
		for (const item of totals) {
			const type = item?.type;
			const value = Number(item?.value ?? 0);
			if (type === 'what' || type === 'where' || type === 'publish') {
				if (type === 'where') whereActionsTotal += value;
				const key = String(item.tipo ?? '');
				const target = type === 'what' ? what : type === 'where' ? where : publish;
				const existing = target.get(key);
				if (existing !== undefined) {
					existing.value += value;
				} else {
					target.set(key, { key, label: await resolveTerm(key), value });
				}
			} else if (type === 'when') {
				const hourKey = Number(item.hour);
				const existing = when.get(hourKey);
				if (existing !== undefined) {
					existing.value += value;
				} else {
					when.set(hourKey, { key: hourKey, label: pad2(hourKey), value });
				}
			}
		}

		if (userKey !== null && whereActionsTotal > 0) {
			const existing = who.get(userKey);
			if (existing !== undefined) {
				existing.value += whereActionsTotal;
			} else {
				let label = userLabelCache.get(userKey);
				if (label === undefined) {
					label = await resolveUserName(userKey, lang);
					userLabelCache.set(userKey, label);
				}
				who.set(userKey, { key: userKey, label, value: whereActionsTotal });
			}
		}
	}

	const whenList = [...when.values()].sort((a, b) =>
		String(a.label) < String(b.label) ? -1 : String(a.label) > String(b.label) ? 1 : 0,
	);
	return {
		who: [...who.values()],
		what: [...what.values()],
		where: [...where.values()],
		when: whenList,
		publish: [...publish.values()],
	};
}

/** The user record's name value (PHP DEDALO_USER_NAME_TIPO dd132 get_valor). */
async function resolveUserName(userId: string, lang: string): Promise<string | null> {
	const { readMatrixRecord } = await import('../db/matrix.ts');
	const record = await readMatrixRecord('matrix_users', USERS_SECTION, Number(userId));
	if (record === null) return null;
	const { resolveComponentValue } = await import('../resolve/component_data.ts');
	const { getModelByTipo } = await import('../ontology/resolver.ts');
	const model = (await getModelByTipo('dd132')) ?? 'component_input_text';
	const { value, fallbackValue } = await resolveComponentValue(record, 'dd132', model, lang);
	const first = (value ?? fallbackValue)?.[0] as { value?: unknown } | undefined;
	return typeof first?.value === 'string' ? first.value : null;
}

/**
 * PHP merge_raw_into_canonical: fold raw items into the canonical totals —
 * fresh empty structure when canonical is null; `when` re-densified to the
 * 24-slot hour histogram; new tipo keys resolve labels (raw `label` wins).
 */
export async function mergeRawIntoCanonical(
	canonical: CanonicalTotals | null,
	rawItems: RawActivityItem[],
	lang: string,
): Promise<CanonicalTotals> {
	const base: CanonicalTotals = canonical ?? {
		who: [],
		what: [],
		where: [],
		when: [],
		publish: [],
	};
	for (const dim of ['who', 'what', 'where', 'when', 'publish'] as const) {
		if (!Array.isArray(base[dim])) base[dim] = [];
	}

	const whenByHour = new Map<number, CanonicalEntry>();
	for (const entry of base.when) {
		if (entry !== null && typeof entry === 'object' && entry.key !== undefined) {
			whenByHour.set(Number(entry.key), entry);
		}
	}
	for (let hour = 0; hour < 24; hour++) {
		if (!whenByHour.has(hour)) {
			whenByHour.set(hour, { key: hour, label: pad2(hour), value: 0 });
		}
	}

	const index: Record<'what' | 'where' | 'publish', Map<string, CanonicalEntry>> = {
		what: new Map(),
		where: new Map(),
		publish: new Map(),
	};
	for (const dim of ['what', 'where', 'publish'] as const) {
		for (const entry of base[dim]) {
			if (entry !== null && typeof entry === 'object' && entry.key !== undefined) {
				index[dim].set(String(entry.key), entry);
			}
		}
	}

	const { termByTipo } = await import('../ontology/labels.ts');
	const termCache = new Map<string, string | null>();

	for (const item of rawItems) {
		if (item === null || typeof item !== 'object') continue;
		const value = Number((item as { value?: unknown }).value ?? 0);
		if (value === 0) continue;

		if (item.type === 'when') {
			const hour = Number(item.hour);
			if (hour < 0 || hour > 23 || Number.isNaN(hour)) continue;
			const slot = whenByHour.get(hour) as CanonicalEntry;
			slot.value += value;
			continue;
		}
		if (item.type === 'what' || item.type === 'where' || item.type === 'publish') {
			const key = item.tipo;
			if (typeof key !== 'string' || key === '') continue;
			const existing = index[item.type].get(key);
			if (existing !== undefined) {
				existing.value += value;
			} else {
				let label = termCache.get(key);
				if (label === undefined) {
					label =
						'label' in item && typeof item.label === 'string'
							? item.label
							: await termByTipo(key, lang);
					termCache.set(key, label);
				}
				const entry: CanonicalEntry = { key, label, value };
				index[item.type].set(key, entry);
				base[item.type].push(entry);
			}
		}
	}

	base.when = [...whenByHour.entries()].sort((a, b) => a[0] - b[0]).map(([, entry]) => entry);
	return base;
}

/**
 * PHP save_user_activity: one dd1521 record per aggregated day — the user
 * locator, the granularity type, the dd_date and the totals payload, plus the
 * per-component meta counters and the standard creation metadata.
 */
async function saveUserActivity(
	totals: Record<string, unknown>[],
	userId: number,
	type: string,
	year: number,
	month: number | null,
	day: number | null,
): Promise<number | false> {
	const { createSectionRecord } = await import('../section/record/create_record.ts');
	const sectionId = await createSectionRecord(UA_SECTION, -1);
	if (!sectionId) return false;

	const start: Record<string, number> = { year };
	if (month !== null) start.month = month;
	if (day !== null) start.day = day;
	// dd_date virtual-calendar seconds (372-day years / 31-day months) — PHP
	// save_user_activity stores it and the PHP date-range search MATCHES ON IT:
	// a row without `time` is invisible to the PHP reader (coexistence).
	start.time = virtualDateSeconds(year, month ?? 1, day ?? 1);

	const userLocator = {
		id: 1,
		type: 'dd151',
		section_id: String(userId),
		section_tipo: USERS_SECTION,
		from_component_tipo: UA_USER,
	};
	const counter = [{ count: 1 }];

	await sql.unsafe(
		`UPDATE matrix_stats
		 SET relation = COALESCE(relation, '{}'::jsonb) || jsonb_build_object($2::text, $3::text::jsonb),
		     string = COALESCE(string, '{}'::jsonb) || jsonb_build_object($4::text, $5::text::jsonb),
		     date = COALESCE(date, '{}'::jsonb) || jsonb_build_object($6::text, $7::text::jsonb),
		     misc = COALESCE(misc, '{}'::jsonb) || jsonb_build_object($8::text, $9::text::jsonb),
		     meta = COALESCE(meta, '{}'::jsonb) || $10::text::jsonb
		 WHERE section_tipo = $11 AND section_id = $1`,
		[
			sectionId,
			UA_USER,
			encodeForJsonb([userLocator]),
			UA_TYPE,
			encodeForJsonb([{ value: type, lang: 'lg-nolan', id: 1 }]),
			UA_DATE,
			encodeForJsonb([{ start, id: 1 }]),
			UA_TOTALS,
			encodeForJsonb([{ value: totals, lang: 'lg-nolan', id: 1 }]),
			encodeForJsonb({
				[UA_USER]: counter,
				[UA_TYPE]: counter,
				[UA_DATE]: counter,
				[UA_TOTALS]: counter,
			}),
			UA_SECTION,
		],
	);
	return sectionId;
}
