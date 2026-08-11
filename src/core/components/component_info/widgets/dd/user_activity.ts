/**
 * user_activity widget (PHP core/widgets/dd/user_activity) — ASYNC.
 *
 * PHP is_async() === true: the read-time aggregate SKIPS it on both engines
 * (pinned in info_widget_differential); the client fetches it on demand via
 * the dd_component_info get_widget_data action — this compute is that
 * delivery.
 *
 * Three-tier pipeline over the widget's user (section_id = the dd128 user
 * record id), window default = last year .. today:
 *   1. saved range (date_in .. yesterday) from the pre-aggregated dd1521
 *      stats rows (crossUsersRangeData);
 *   2. today supplement: one day of raw activity-log rows merged on top
 *      (getIntervalRawActivityData + mergeRawIntoCanonical);
 *   3. live full-range fallback when 1+2 produced nothing (catch-up never
 *      ran) — re-aggregate the whole window from the raw activity log.
 * One output item per IPO entry: {widget, key, widget_id:'totals', value}
 * where value is the canonical {who, what, where, when, publish} or null.
 *
 * PHP's optional options.date_in/date_out never reach this widget through
 * the get_widget_data channel (the PHP handler's widget_options bag carries
 * no date keys) — the defaults always apply, both engines.
 */

import type { CanonicalTotals, RawActivityItem } from '../../../../area_maintenance/user_stats.ts';
import type { InfoWidgetDescriptor, WidgetContext, WidgetItem } from '../widget_common.ts';

/** PHP user_activity::is_canonical_empty — no actionable data in any dimension. */
export function isCanonicalEmpty(totals: CanonicalTotals | null): boolean {
	if (totals === null || typeof totals !== 'object') return true;
	if (Array.isArray(totals.what) && totals.what.length > 0) return false;
	if (Array.isArray(totals.where) && totals.where.length > 0) return false;
	if (Array.isArray(totals.publish) && totals.publish.length > 0) return false;
	if (Array.isArray(totals.who) && totals.who.length > 0) return false;
	if (Array.isArray(totals.when)) {
		for (const entry of totals.when) {
			if (entry !== null && typeof entry === 'object' && Number(entry.value ?? 0) > 0) {
				return false;
			}
		}
	}
	return true;
}

/** The five calendar dates the three-tier pipeline reads. */
export interface ActivityWindow {
	dateIn: string;
	dateOut: string;
	todayStr: string;
	tomorrowStr: string;
	yesterdayStr: string;
}

/**
 * Calendar window in DEDALO_TIMEZONE wall-clock, NOT process-local Date
 * getters (S1-03 class): activity/TM rows are stamped wall-clock via
 * dbTimestamp, and PHP's "today" is date() under date_default_timezone_set.
 * A process on TZ=UTC (UTC-hosted prod is common) read "today" one day behind
 * between local midnight and the zone offset — the today-supplement silently
 * dropped the current day's activity nightly.
 * Neighbor dates derive from a UTC-noon anchor of the wall date (DST-safe).
 */
export function activityWindow(todayStr: string): ActivityWindow {
	const anchor = new Date(`${todayStr}T12:00:00Z`);
	const isoAtOffset = (days: number): string =>
		new Date(anchor.getTime() + days * 24 * 3600 * 1000).toISOString().slice(0, 10);
	const tomorrowStr = isoAtOffset(1);
	const yesterdayStr = isoAtOffset(-1);
	const yearAgo = new Date(anchor);
	yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
	const dateIn = yearAgo.toISOString().slice(0, 10);
	const dateOut = todayStr;
	return { dateIn, dateOut, todayStr, tomorrowStr, yesterdayStr };
}

/** The three user_stats readers the pipeline drives (injected, one per tier). */
export interface ActivityDeps {
	crossUsersRangeData: (
		dateIn: string,
		dateOut: string,
		userId: number,
		lang: string,
	) => Promise<CanonicalTotals | null>;
	getIntervalRawActivityData: (
		userId: number,
		dateIn: string,
		dateOut: string,
	) => Promise<RawActivityItem[] | null>;
	mergeRawIntoCanonical: (
		canonical: CanonicalTotals | null,
		rawItems: RawActivityItem[],
		lang: string,
	) => Promise<CanonicalTotals>;
}

/** The three-tier resolution for ONE user over ONE window. */
export async function resolveActivityTotals(
	window: ActivityWindow,
	userId: number,
	lang: string,
	deps: ActivityDeps,
): Promise<CanonicalTotals | null> {
	const { dateIn, dateOut, todayStr, tomorrowStr, yesterdayStr } = window;
	const { crossUsersRangeData, getIntervalRawActivityData, mergeRawIntoCanonical } = deps;

	// Tier 1 — saved range, upper bound yesterday (today is never saved)
	const endSaved = dateOut >= todayStr ? yesterdayStr : dateOut;
	let totals: CanonicalTotals | null =
		endSaved >= dateIn ? await crossUsersRangeData(dateIn, endSaved, userId, lang) : null;

	// Tier 2 — today supplement (bounded: one day of raw activity)
	if (dateOut >= todayStr) {
		const rawToday = await getIntervalRawActivityData(userId, todayStr, tomorrowStr);
		if (rawToday !== null && rawToday.length > 0) {
			totals = await mergeRawIntoCanonical(totals, rawToday, lang);
		}
	}

	// Tier 3 — live full-range fallback (catch-up has not run yet)
	if (isCanonicalEmpty(totals)) {
		console.warn(
			`user_activity: cache-driven path empty for user ${userId}, range ${dateIn}..${dateOut} — falling back to live full-range aggregation`,
		);
		const rawFull = await getIntervalRawActivityData(userId, dateIn, tomorrowStr);
		if (rawFull !== null && rawFull.length > 0) {
			totals = await mergeRawIntoCanonical(null, rawFull, lang);
		}
	}

	return totals;
}

async function computeUserActivity(ipo: unknown[], context: WidgetContext): Promise<WidgetItem[]> {
	const { crossUsersRangeData, getIntervalRawActivityData, mergeRawIntoCanonical } = await import(
		'../../../../area_maintenance/user_stats.ts'
	);
	const userId = Number(context.sectionId);
	const { dbTimestamp } = await import('../../../../db/db_timestamp.ts');
	const window = activityWindow(dbTimestamp().slice(0, 10));
	const lang = context.lang;
	const deps: ActivityDeps = {
		crossUsersRangeData,
		getIntervalRawActivityData,
		mergeRawIntoCanonical,
	};

	const data: WidgetItem[] = [];
	for (const [key] of ipo.entries()) {
		const totals = await resolveActivityTotals(window, userId, lang, deps);
		data.push({ widget: 'user_activity', key, widget_id: 'totals', value: totals });
	}
	return data;
}

export const user_activity: InfoWidgetDescriptor = {
	name: 'user_activity',
	path: '/dd/user_activity',
	isAsync: true,
	computeData: computeUserActivity,
};
