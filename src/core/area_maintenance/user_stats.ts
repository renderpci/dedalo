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
	const params: unknown[] = [userLocatorFilter(ACT_WHO, userId)];
	const filters: string[] = [];
	if (lastAggregated !== null) {
		const nextDay = new Date(lastAggregated.getTime() + 24 * 3600 * 1000);
		params.push(isoDate(nextDay));
		filters.push(`"timestamp" >= date($${params.length})`);
	}
	params.push(isoDate(today));
	filters.push(`"timestamp" < date($${params.length})`);

	const activityRows = (await sql.unsafe(
		`SELECT section_tipo, section_id, timestamp::text AS timestamp,
		        relation, string, date, misc
		 FROM matrix_activity
		 WHERE relation @> $1::text::jsonb AND ${filters.join(' AND ')}
		 ORDER BY id ASC`,
		params as (string | number)[],
	)) as {
		timestamp: string | null;
		relation: Record<string, unknown[]> | null;
		string: Record<string, unknown[]> | null;
		date: Record<string, unknown[]> | null;
		misc: Record<string, unknown[]> | null;
	}[];

	const dayGroups = new Map<string, DayGroup>();
	let rowCount = 0;
	for (const row of activityRows) {
		if (!row.timestamp) continue;
		const day = row.timestamp.slice(0, 10);
		let group = dayGroups.get(day);
		if (group === undefined) {
			group = { what: new Map(), where: new Map(), when: new Map(), publish: new Map() };
			dayGroups.set(day, group);
		}
		rowCount++;

		// what: the action code (dd545 locator section_id → term tipo)
		const whatFirst = (row.relation?.[ACT_WHAT] as { section_id?: unknown }[] | undefined)?.[0];
		if (whatFirst !== undefined && whatFirst !== null && typeof whatFirst === 'object') {
			const mapped = WHAT_MAP[String(whatFirst.section_id)];
			if (mapped !== undefined) {
				group.what.set(mapped, (group.what.get(mapped) ?? 0) + 1);
			}
		}

		// where: the touched area tipo (dd546 string); dd1223 routes to publish
		const whereFirst = (row.string?.[ACT_WHERE] as { value?: unknown }[] | undefined)?.[0];
		let whereKey = whereFirst?.value;
		if (Array.isArray(whereKey)) whereKey = whereKey[0];
		if (typeof whereKey === 'string' && whereKey !== '') {
			if (whereKey === WHERE_PUBLISH) {
				const dataFirst = (row.misc?.[ACT_DATA] as { value?: unknown }[] | undefined)?.[0];
				const message = dataFirst?.value as
					| { top_tipo?: unknown; section_tipo?: unknown }
					| undefined;
				const publishTipo = message?.top_tipo ?? message?.section_tipo;
				if (publishTipo !== undefined && publishTipo !== null && publishTipo !== false) {
					const key = String(publishTipo);
					group.publish.set(key, (group.publish.get(key) ?? 0) + 1);
				}
			} else if (!WHERE_SKIP.has(whereKey)) {
				group.where.set(whereKey, (group.where.get(whereKey) ?? 0) + 1);
			}
		}

		// when: the hour histogram (dd547 date start.hour)
		const whenFirst = (row.date?.[ACT_WHEN] as { start?: { hour?: unknown } }[] | undefined)?.[0];
		const hour = whenFirst?.start?.hour;
		if (hour !== undefined && hour !== null) {
			const key = String(hour);
			group.when.set(key, (group.when.get(key) ?? 0) + 1);
		}
	}

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
	const rows = (await sql.unsafe(
		`SELECT section_tipo, section_id, relation, string, date, misc
		 FROM matrix_activity
		 WHERE relation @> $1::text::jsonb
		   AND "timestamp" >= date($2) AND "timestamp" < date($3)
		 ORDER BY id ASC`,
		[userLocatorFilter(ACT_WHO, userId), dateIn, dateOut],
	)) as {
		relation: Record<string, unknown[]> | null;
		string: Record<string, unknown[]> | null;
		date: Record<string, unknown[]> | null;
		misc: Record<string, unknown[]> | null;
	}[];

	const what = new Map<string, number>();
	const where = new Map<string, number>();
	const when = new Map<string, number>();
	const publish = new Map<string, number>();
	for (const row of rows) {
		// what (dd545 locator section_id → term tipo, PHP build_what)
		const whatFirst = (row.relation?.[ACT_WHAT] as { section_id?: unknown }[] | undefined)?.[0];
		if (whatFirst !== undefined && whatFirst !== null && typeof whatFirst === 'object') {
			const mapped = WHAT_MAP[String(whatFirst.section_id)];
			if (mapped !== undefined) what.set(mapped, (what.get(mapped) ?? 0) + 1);
		}
		// where (dd546 string); dd1223 → publish; tool areas skipped
		const whereFirst = (row.string?.[ACT_WHERE] as { value?: unknown }[] | undefined)?.[0];
		let whereKey = whereFirst?.value;
		if (Array.isArray(whereKey)) whereKey = whereKey[0];
		if (typeof whereKey === 'string' && whereKey !== '') {
			if (whereKey === WHERE_PUBLISH) {
				const dataFirst = (row.misc?.[ACT_DATA] as { value?: unknown }[] | undefined)?.[0];
				const message = dataFirst?.value as
					| { top_tipo?: unknown; section_tipo?: unknown }
					| undefined;
				const publishTipo = message?.top_tipo ?? message?.section_tipo;
				if (publishTipo !== undefined && publishTipo !== null && publishTipo !== false) {
					const key = String(publishTipo);
					publish.set(key, (publish.get(key) ?? 0) + 1);
				}
			} else if (!WHERE_SKIP.has(whereKey)) {
				where.set(whereKey, (where.get(whereKey) ?? 0) + 1);
			}
		}
		// when (dd547 date start.hour)
		const whenFirst = (row.date?.[ACT_WHEN] as { start?: { hour?: unknown } }[] | undefined)?.[0];
		const hour = whenFirst?.start?.hour;
		if (hour !== undefined && hour !== null) {
			const key = String(hour);
			when.set(key, (when.get(key) ?? 0) + 1);
		}
	}

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
