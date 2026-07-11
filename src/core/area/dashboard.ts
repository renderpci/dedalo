/**
 * Dashboard engine — the statistics an area serves for the sections inside it
 * (PHP area_common::get_dashboard_data / metric_total / metric_activity_30d,
 * class.area_common.php). Built for every dashboard-behavior area (plain `area`
 * + the no-special-behavior stubs). engineering/AREA_SPEC.md §4.
 *
 * Payload:
 *   { area_tipo, area_label, generated_at, metrics, sections:[{section_tipo,
 *     label, model, color, <metric>, recent_7d}], activity_30d }
 *   activity_30d = { date_from, date_to, days:[{date, by_section, by_user}],
 *     users:[{id,label}], available_ranges }
 */

import { config } from '../../config/config.ts';
import { AREA_CHILD_INCLUDE_MODELS, DASHBOARD_CHILD_EXCLUDE_MODELS } from '../concepts/area.ts';
import { ACTIVITY_SECTION_TIPO } from '../concepts/section.ts';
import { sql } from '../db/postgres.ts';
import { labelByTipo } from '../ontology/labels.ts';
import { getModelByTipo } from '../ontology/resolver.ts';
import { countSectionRecords } from '../search/count.ts';
import type { Principal } from '../security/permissions.ts';
import { dashboardColor } from './color.ts';

// Activity component tipos (PHP logger_backend_activity::$_COMPONENT_WHO/WHERE).
const ACTIVITY_WHO_TIPO = 'dd543'; // component_portal — the user
const ACTIVITY_WHERE_TIPO = 'dd546'; // component_input_text — the target section tipo
const DATA_NOLAN = 'lg-nolan';
const USERNAME_TIPO = 'dd132';

interface DashboardSectionItem {
	section_tipo: string;
	label: string;
	model: string;
	color: string;
	total?: number | null;
	recent_7d?: number;
}

interface ActivityDay {
	date: string;
	by_section: Record<string, number>;
	by_user: Record<string, number>;
}

interface ActivityPayload {
	date_from: string;
	date_to: string;
	days: ActivityDay[];
	users: { id: number | string; label: string }[];
	available_ranges: { key: string; label: string; days: number }[];
}

/**
 * The section tipos inside an area (PHP get_dashboard_child_sections): a
 * pre-order walk that ACCEPTS section, DESCENDS area+section, EXCLUDES
 * login/tools/section_list/filter/section_tool, with a cycle guard and
 * order-preserving dedup. Ordering = order_number then id (ontology tree order).
 */
export async function getDashboardChildSections(areaTipo: string): Promise<string[]> {
	// Faithful port of the PHP recursive walker (get_dashboard_child_sections):
	// per node, read its direct children with the SAME query PHP uses
	// (get_ar_children_of_this → ORDER BY order_number ASC, no tie-break — ties
	// fall to DB heap order). Running the identical query against the same DB
	// reproduces PHP's sibling order exactly, including ties (a JS re-sort on
	// order_number/id would diverge on ties). accept section / descend
	// area+section / exclude login|tools|section_list|filter|section_tool /
	// visited-set cycle guard / order-preserving dedup.
	const result: string[] = [];
	const visited = new Set<string>();
	const walk = async (tipo: string): Promise<void> => {
		if (visited.has(tipo)) return; // ontology cycle guard
		visited.add(tipo);
		const children = (await sql.unsafe(
			'SELECT tipo, model FROM dd_ontology WHERE parent = $1 ORDER BY order_number ASC',
			[tipo],
		)) as { tipo: string; model: string }[];
		for (const child of children) {
			const model = child.model;
			if (DASHBOARD_CHILD_EXCLUDE_MODELS.has(model)) continue;
			if (model === 'section') result.push(child.tipo);
			// descend into area + section (AREA_CHILD_INCLUDE_MODELS minus
			// section_tool, which the exclude set already dropped above)
			if (AREA_CHILD_INCLUDE_MODELS.has(model) && model !== 'section_tool') await walk(child.tipo);
		}
	};
	await walk(areaTipo);

	// dedup preserving first-seen order (PHP array_unique)
	return [...new Set(result)];
}

/** nolan-lang username of a user (PHP login::logged_user_username → dd132 values joined). */
async function resolveUsername(userId: number): Promise<string> {
	const rows = (await sql.unsafe(
		`SELECT COALESCE(data->'${USERNAME_TIPO}', string->'${USERNAME_TIPO}') AS items
		 FROM matrix_users WHERE section_id = $1`,
		[userId],
	)) as { items: { lang?: string; value?: unknown }[] | null }[];
	const items = rows[0]?.items ?? [];
	return items
		.filter((item) => item?.lang === DATA_NOLAN)
		.map((item) => (typeof item?.value === 'string' ? item.value : ''))
		.join(' ');
}

/**
 * Date-window helpers — DEDALO_TIMEZONE wall-clock, NOT host/runner local
 * (PHP DateTime->format('Y-m-d') under date_default_timezone_set). The old
 * `new Date().getFullYear()/getMonth()/getDate()` derivation used the
 * PROCESS timezone: `bun test` forces TZ=UTC, so between 00:00 and 02:00
 * CEST the TS window lagged PHP's by one day and the area_dashboard
 * differential went red with zero code change. Deriving via Intl in
 * config.timezone matches PHP on any runner TZ (matrix_activity timestamps
 * are stamped in the same zone — db_timestamp.ts, S1-03).
 */
const zonedDateFormatter = new Intl.DateTimeFormat('en-CA', {
	timeZone: config.timezone,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
});

/** Today's 'YYYY-MM-DD' in DEDALO_TIMEZONE (en-CA locale formats ISO-style). */
function zonedToday(): string {
	return zonedDateFormatter.format(new Date());
}

/** Pure calendar-day arithmetic on a 'YYYY-MM-DD' string (DST-immune). */
function addDays(ymd: string, delta: number): string {
	const [year, month, day] = ymd.split('-').map(Number);
	return new Date(Date.UTC(year as number, (month as number) - 1, (day as number) + delta))
		.toISOString()
		.slice(0, 10);
}

/**
 * Area-level activity aggregated by day/section/user over a rolling window
 * (PHP metric_activity_30d). Direct JSONB SQL on matrix_activity; only rows
 * whose WHERE value is one of this area's child sections are counted; empty days
 * are filled for a continuous chart. Returns null when the area has no sections.
 */
export async function metricActivity(
	childSections: string[],
	rangeDays: number,
): Promise<ActivityPayload | null> {
	if (childSections.length === 0) return null;

	const dateToStr = zonedToday();
	const dateFromStr = addDays(dateToStr, -rangeDays);

	const rows = (await sql.unsafe(
		`SELECT date_trunc('day', "timestamp")::date::text AS day,
		        relation->'${ACTIVITY_WHO_TIPO}'->0->>'section_id' AS user_id,
		        string->'${ACTIVITY_WHERE_TIPO}'->0->>'value' AS where_tipo
		 FROM "matrix_activity"
		 WHERE section_tipo = $1
		   AND "timestamp" >= date($2)
		   AND "timestamp" <  date($3)`,
		[ACTIVITY_SECTION_TIPO, dateFromStr, dateToStr],
	)) as { day: string; user_id: string | null; where_tipo: string | null }[];

	const sectionSet = new Set(childSections);
	const dayBuckets = new Map<
		string,
		{ by_section: Record<string, number>; by_user: Record<string, number> }
	>();
	const userIds: string[] = [];
	const seenUsers = new Set<string>();

	for (const row of rows) {
		let whereVal = row.where_tipo;
		// legacy array-encoded value, e.g. "[\"rsc167\"]"
		if (typeof whereVal === 'string' && whereVal.startsWith('[')) {
			try {
				const decoded = JSON.parse(whereVal);
				if (Array.isArray(decoded) && decoded.length > 0) whereVal = String(decoded[0]);
			} catch {
				// leave as-is; the containment check below drops it
			}
		}
		if (whereVal === null || whereVal === '' || !sectionSet.has(whereVal)) continue;

		let bucket = dayBuckets.get(row.day);
		if (bucket === undefined) {
			bucket = { by_section: {}, by_user: {} };
			dayBuckets.set(row.day, bucket);
		}
		bucket.by_section[whereVal] = (bucket.by_section[whereVal] ?? 0) + 1;
		const userId = row.user_id;
		if (userId !== null && userId !== '') {
			bucket.by_user[userId] = (bucket.by_user[userId] ?? 0) + 1;
			if (!seenUsers.has(userId)) {
				seenUsers.add(userId);
				userIds.push(userId);
			}
		}
	}

	const users = await Promise.all(
		userIds.map(async (uid) => {
			const label = await resolveUsername(Number(uid));
			// PHP array-key coercion turns a numeric-string user id into an int
			// (so the JSON carries a number, e.g. -1 not "-1").
			const id: number | string = /^-?\d+$/.test(uid) ? Number(uid) : uid;
			return { id, label: label !== '' ? label : `User #${uid}` };
		}),
	);

	// Fill every calendar day in [date_from, date_to) for continuous rendering
	// (pure YYYY-MM-DD arithmetic — ISO strings compare lexicographically).
	const days: ActivityDay[] = [];
	for (let dateStr = dateFromStr; dateStr < dateToStr; dateStr = addDays(dateStr, 1)) {
		const bucket = dayBuckets.get(dateStr);
		days.push({
			date: dateStr,
			by_section: bucket ? bucket.by_section : {},
			by_user: bucket ? bucket.by_user : {},
		});
	}

	return {
		date_from: dateFromStr,
		date_to: dateToStr,
		days,
		users,
		available_ranges: [
			{ key: '1m', label: '1 month', days: 30 },
			{ key: '3m', label: '3 months', days: 90 },
			{ key: '6m', label: '6 months', days: 180 },
			{ key: '1y', label: '1 year', days: 365 },
		],
	};
}

/** The full dashboard payload for an area (PHP get_dashboard_data). */
export async function getDashboardData(
	principal: Principal,
	areaTipo: string,
	metricNames: string[],
): Promise<Record<string, unknown>> {
	const childSections = await getDashboardChildSections(areaTipo);

	// Per-section items — metrics are independent, so resolve them concurrently
	// (PHP loops sequentially; the walk order is preserved by Promise.all).
	const sections: DashboardSectionItem[] = await Promise.all(
		childSections.map(async (sectionTipo): Promise<DashboardSectionItem> => {
			const model = (await getModelByTipo(sectionTipo)) ?? 'section';
			const item: DashboardSectionItem = {
				section_tipo: sectionTipo,
				label: (await labelByTipo(sectionTipo)) ?? sectionTipo,
				model,
				color: dashboardColor(sectionTipo),
			};
			// metric_<name> dispatch — 'total' is the only built-in metric.
			for (const name of metricNames) {
				if (name === 'total') item.total = await countSectionRecords(principal, sectionTipo);
			}
			return item;
		}),
	);

	const activity30d = await metricActivity(childSections, 30);

	// recent_7d badge — accumulate the last 7 days of activity by section.
	if (activity30d !== null && activity30d.days.length > 0) {
		const recentBySection: Record<string, number> = {};
		for (const day of activity30d.days.slice(-7)) {
			for (const [tipo, count] of Object.entries(day.by_section)) {
				recentBySection[tipo] = (recentBySection[tipo] ?? 0) + Number(count);
			}
		}
		for (const item of sections) {
			item.recent_7d = recentBySection[item.section_tipo] ?? 0;
		}
	}

	return {
		area_tipo: areaTipo,
		area_label: (await labelByTipo(areaTipo)) ?? areaTipo,
		generated_at: Math.floor(Date.now() / 1000),
		metrics: metricNames,
		sections,
		activity_30d: activity30d,
	};
}
