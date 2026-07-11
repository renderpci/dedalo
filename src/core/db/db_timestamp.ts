/**
 * THE shared DB timestamp helper (PHP dd_date::get_timestamp_now_for_db).
 *
 * Every TM/data stamp path — component save, relations delete_locator,
 * translation tool, create/delete/duplicate record, observers — formats its
 * 'YYYY-MM-DD HH:MM:SS' stamps HERE, and nowhere else (S1-03: a UTC twin of
 * this helper once stamped matrix_time_machine with 2h-skewed rows).
 *
 * PHP emits WALL-CLOCK time in DEDALO_TIMEZONE (date_default_timezone_set at
 * bootstrap), NOT UTC — matrix_time_machine.timestamp is text-sorted, so both
 * engines must stamp the same clock or restore timelines mis-sort. The format
 * is timezone-aware (config.timezone), not host-local, so a host running on
 * UTC still stamps Dédalo's configured zone.
 */

import { config } from '../../config/config.ts';

/** One formatter per process — Intl.DateTimeFormat construction is expensive. */
const formatter = new Intl.DateTimeFormat('en-CA', {
	timeZone: config.timezone,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hourCycle: 'h23',
});

/**
 * 'YYYY-MM-DD HH:MM:SS' at the given instant (default: now), expressed as
 * DEDALO_TIMEZONE wall-clock time (PHP get_timestamp_now_for_db parity).
 */
export function dbTimestamp(now: Date = new Date()): string {
	const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
	for (const part of formatter.formatToParts(now)) {
		parts[part.type] = part.value;
	}
	return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
