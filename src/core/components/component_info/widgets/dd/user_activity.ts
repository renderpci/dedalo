/**
 * user_activity widget (PHP core/widgets/dd/user_activity) — ASYNC.
 *
 * PHP is_async() === true: the read-time aggregate SKIPS it on both engines
 * (pinned in info_widget_differential); the client fetches it on demand via
 * the dd_component_info get_widget_data action — this compute is that
 * delivery.
 *
 * IT SHOWS THE USER'S WHOLE HISTORY (WC-2026-08-12-user-activity-full-history).
 * The ontology calls this widget "a graphic visualization of whole user
 * activity" and the client renders it as one — "Total actions", "Sections
 * touched", "Peak hour" — but the window used to be hardcoded to the last 365
 * days, so a decade-old account showed the last few weeks. Measured on the
 * oral-history archive: user 1 has 284,743 activity rows since 2015 and 705
 * pre-aggregated stats days, of which the widget showed 21 events.
 *
 * Two branches over the widget's user (section_id = the dd128 user record id):
 *
 *   SAVED HISTORY EXISTS (the normal case) — read the pre-aggregated dd1521
 *   rows over their OWN span (savedStatsDayBounds → crossUsersRangeData), then
 *   merge the raw activity log for the TAIL after the last saved day (today
 *   included, since today is never saved). Cost is the aggregate the nightly
 *   catch-up already built, plus however far behind that catch-up is.
 *
 *   NO SAVED HISTORY — nothing to bound the read with, so the raw log is
 *   aggregated over the fallback window (last year .. today). This is the one
 *   place a bound is imposed rather than derived, and it is deliberate: an
 *   unbounded live aggregation over an actor with millions of rows is the
 *   statement-timeout this subsystem was rewritten to avoid (user_stats.ts
 *   aggregateActivity). A user in this state has never been aggregated at all.
 *
 * One output item per IPO entry: {widget, key, widget_id:'totals', value}
 * where value is the canonical {who, what, where, when, publish} or null.
 *
 * PHP's optional options.date_in/date_out never reach this widget through
 * the get_widget_data channel (the PHP handler's widget_options bag carries
 * no date keys) — the defaults always apply, both engines.
 */

import type {
	CanonicalTotals,
	RawActivityItem,
	SavedStatsBounds,
} from '../../../../area_maintenance/user_stats.ts';
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

/**
 * The calendar dates the pipeline reads. `dateIn`/`dateOut` are the FALLBACK
 * window only (the no-saved-history branch); a user with saved rows takes their
 * span from the store instead.
 */
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

/** The user_stats readers the pipeline drives (injected — the test seam). */
export interface ActivityDeps {
	savedStatsDayBounds: (userId: number) => Promise<SavedStatsBounds | null>;
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

/** The calendar day after `day` (ISO), via the DST-safe UTC-noon anchor. */
export function dayAfter(day: string): string {
	return new Date(new Date(`${day}T12:00:00Z`).getTime() + 24 * 3600 * 1000)
		.toISOString()
		.slice(0, 10);
}

/**
 * The raw activity log aggregated over [from, tomorrow) and merged onto
 * `totals` — the un-aggregated tail in the saved branch, the whole answer in
 * the fallback branch. `from` after today means there is no tail to read.
 */
async function mergeLiveRange(
	totals: CanonicalTotals | null,
	from: string,
	window: ActivityWindow,
	userId: number,
	lang: string,
	deps: ActivityDeps,
): Promise<CanonicalTotals | null> {
	if (from > window.todayStr) return totals;
	const raw = await deps.getIntervalRawActivityData(userId, from, window.tomorrowStr);
	if (raw === null || raw.length === 0) return totals;
	return await deps.mergeRawIntoCanonical(totals, raw, lang);
}

/**
 * WHOLE-HISTORY resolution for ONE user (see the module header for the two
 * branches). Returns the canonical totals, or null when the user has no
 * activity at all.
 */
export async function resolveActivityTotals(
	window: ActivityWindow,
	userId: number,
	lang: string,
	deps: ActivityDeps,
): Promise<CanonicalTotals | null> {
	const bounds = await deps.savedStatsDayBounds(userId);

	// No saved history — the catch-up has never run for this user. Aggregate the
	// raw log over the FALLBACK window only (see the header: the one imposed
	// bound, against an unbounded scan of a millions-of-rows actor).
	if (bounds === null) {
		console.warn(
			`user_activity: no saved dd1521 history for user ${userId} — live aggregation over ${window.dateIn}..${window.todayStr}`,
		);
		return await mergeLiveRange(null, window.dateIn, window, userId, lang, deps);
	}

	// Saved history — its OWN span, then the raw tail after the last saved day.
	const totals = await deps.crossUsersRangeData(bounds.firstDay, bounds.lastDay, userId, lang);
	return await mergeLiveRange(totals, dayAfter(bounds.lastDay), window, userId, lang, deps);
}

async function computeUserActivity(ipo: unknown[], context: WidgetContext): Promise<WidgetItem[]> {
	const {
		savedStatsDayBounds,
		crossUsersRangeData,
		getIntervalRawActivityData,
		mergeRawIntoCanonical,
	} = await import('../../../../area_maintenance/user_stats.ts');
	const userId = Number(context.sectionId);
	const { dbTimestamp } = await import('../../../../db/db_timestamp.ts');
	const window = activityWindow(dbTimestamp().slice(0, 10));
	const lang = context.lang;
	const deps: ActivityDeps = {
		savedStatsDayBounds,
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
