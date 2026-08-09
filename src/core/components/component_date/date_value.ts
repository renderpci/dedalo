/**
 * component_date — THE flat/human date formatter of the engine.
 *
 * ONE implementation, one home. This is the port of the PHP oracle's
 * `component_date::data_item_to_value()`
 * (v7_php_frozen/master_dedalo/core/component_date/class.component_date.php:339)
 * together with the `dd_date::get_dd_timestamp()` field rendering it delegates
 * to (core/common/class.dd_date.php:727). Every surface that turns a stored
 * component_date item into a human string goes through here:
 *
 *   - the "Referencias" relation-list panel and tool_export cells
 *     (core/resolve/relation_list.ts resolveCellValue, family 'date');
 *   - the thesaurus indexation grid's export atoms
 *     (core/section/indexation_grid.ts resolveAtoms, model component_date);
 *   - the RAG characterizer's date-role label (ai/rag/role_reader.ts).
 *
 * WHY IT LIVES HERE, AND WHY THE COPY IS GONE (2026-08 oh1 beta audit §5.6).
 * relation_list.ts carried a SECOND formatter — `d-m-Y` joined with '-', no
 * `date_mode` dispatch at all, and the MONTH silently dropped whenever the day
 * was absent (`if (month === undefined || day === undefined) return year`).
 * A partial date is the NORM in heritage cataloguing, so live `rsc170`/`rsc26`
 * "Dating" records reachable from the oh1 image portals were losing their month
 * in every Referencias cell and every export cell. Restoring the oracle is not
 * a wire divergence, so no WC entry accompanies this: PHP is what these cells
 * always meant to say.
 *
 * Single-source is TRIPWIRED: test/unit/date_flat_value_single_source_tripwire.ts
 * fails if a second date-part assembler appears in `src/`, or if any of the
 * consumers above stops importing this module. The behaviour is pinned against
 * the FROZEN PHP method itself in
 * test/unit/fixtures/date_value_native/date_value.oracle.json (captured by
 * eval'ing the method's own source text over the real dd_date class — never
 * regenerate it from TS output).
 *
 * FIDELITY NOTES (all of these are the oracle, not choices):
 *   - the Y/m/d separator is PHP's `$sep` default '/', NOT '-';
 *   - `Y` is `sprintf('%04d')` when a month or day is rendered (year 238 →
 *     '0238', BCE -44 → '-044', the sign counts toward the width) but UNPADDED
 *     in the year-only branch (`get_dd_timestamp('Y', $padding=false)`);
 *   - a missing month/day/clock field renders as '00', so a day without a
 *     month is '1912/00/04' and a yearless part is '0000/06/09';
 *   - `isset()` is null-blind: `{start:null}` falls back to the item ITSELF;
 *   - date_mode 'period' joins three slots with ' ' even when empty, so a
 *     year-only period really is '5 years  ' with two trailing spaces;
 *   - 'datetime' is a misspelling PHP logs and then treats as 'date_time';
 *   - any unknown date_mode falls through to 'date' (PHP `default:`) — the
 *     oracle is generic here and must stay generic.
 */

import { getLabels } from '../../labels/catalog.ts';
import { currentApplicationLang } from '../../resolve/request_lang.ts';

/** PHP `label::get_label()` strings the 'period' date_mode interpolates. */
export interface PeriodLabels {
	years: string;
	months: string;
	days: string;
}

export interface DateItemToValueOptions {
	/** PHP `$sep` — the Y/m/d field separator. Default '/'. */
	sep?: string;
	/**
	 * Localized unit labels for date_mode 'period'. REQUIRED for that mode:
	 * PHP always localizes them, so defaulting to English would be a silent
	 * narrowing. Resolve them with `resolvePeriodLabels()`.
	 */
	periodLabels?: PeriodLabels;
}

/**
 * PHP `label::get_label('years'|'months'|'days')` — the application-lang unit
 * labels of date_mode 'period'. Async (the label catalog is), so callers that
 * may meet a 'period' component resolve them once per run and hand them in.
 */
export async function resolvePeriodLabels(): Promise<PeriodLabels> {
	const labels = await getLabels(currentApplicationLang());
	return {
		years: labels.years ?? 'years',
		months: labels.months ?? 'months',
		days: labels.days ?? 'days',
	};
}

/** PHP `isset()`: present AND not null. */
function isset(part: Record<string, unknown>, key: string): boolean {
	return part[key] !== undefined && part[key] !== null;
}

/** PHP `is_object()` — an ARRAY is not an object, so `[]` is not a date part. */
function asPart(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

/** PHP `(int)` cast of a dd_date field, with '' / null / junk → 0. */
function toInt(value: unknown): number {
	if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : 0;
	const parsed = Number.parseInt(String(value ?? ''), 10);
	return Number.isNaN(parsed) ? 0 : parsed;
}

/** dd_date `sprintf('%04d', $year)` — width 4 INCLUDING the sign ('-044'). */
function padYear(value: unknown): string {
	const year = toInt(value);
	const sign = year < 0 ? '-' : '';
	return sign + String(Math.abs(year)).padStart(4 - sign.length, '0');
}

/**
 * dd_date `sprintf('%02d', $field)` after its negative-value fix (a field
 * below 1 that is not exactly 0 is logged and forced to 0).
 */
function pad2(value: unknown): string {
	let field = toInt(value);
	if (field !== 0 && field < 1) field = 0;
	return String(field).padStart(2, '0');
}

/** dd_date `get_dd_timestamp('Y', $padding=false)` — `$this->year ?? ''`. */
function rawYear(value: unknown): string {
	return value === undefined || value === null ? '' : String(value);
}

/** dd_date `get_dd_timestamp('H:i:s', true)`. */
function clock(part: Record<string, unknown>): string {
	return `${pad2(part.hour)}:${pad2(part.minute)}:${pad2(part.second)}`;
}

/**
 * The 'date' / 'range' calendar rendering with PHP's graceful degradation:
 * a day renders Y/m/d, a month-without-day renders Y/m (THE case the deleted
 * duplicate dropped), and a bare year renders unpadded.
 */
function calendar(part: Record<string, unknown>, sep: string): string {
	if (isset(part, 'day')) {
		return `${padYear(part.year)}${sep}${pad2(part.month)}${sep}${pad2(part.day)}`;
	}
	if (isset(part, 'month')) {
		return `${padYear(part.year)}${sep}${pad2(part.month)}`;
	}
	return rawYear(part.year);
}

/** PHP `isset($data_item->start) ? $data_item->start : $data_item`. */
function startOrSelf(item: Record<string, unknown>): unknown {
	return isset(item, 'start') ? item.start : item;
}

/**
 * Convert ONE stored component_date item to its human string, per date_mode.
 * PHP `component_date::data_item_to_value($data_item, $date_mode, $sep='/')`.
 *
 * @param item      a stored date item: `{start?, end?, period?}` or a bare
 *                  dd_date part (the legacy unwrapped shape PHP still accepts)
 * @param dateMode  the ontology node's `properties.date_mode` (PHP
 *                  `get_date_mode()`: the property, else 'date'). Unknown
 *                  modes fall through to 'date' exactly as PHP's `default:`.
 */
export function dateItemToValue(
	item: Record<string, unknown>,
	dateMode: string,
	options: DateItemToValueOptions = {},
): string {
	const sep = options.sep ?? '/';

	switch (dateMode) {
		case 'range': {
			let value = '';
			const start = asPart(item.start);
			if (start !== null) value += calendar(start, sep);
			const end = asPart(item.end);
			// PHP appends the separator whenever `end` is an OBJECT, even when
			// the rendered end is '' — bug-for-bug.
			if (end !== null) value += ` <> ${calendar(end, sep)}`;
			return value;
		}

		case 'time_range': {
			let value = '';
			const start = asPart(item.start);
			if (start !== null) value += clock(start);
			const end = asPart(item.end);
			if (end !== null) value += ` <> ${clock(end)}`;
			return value;
		}

		case 'period': {
			// PHP `!empty($data_item->period)`: any object passes (an empty
			// stdClass is truthy), a null/0/'' period does not.
			const period = asPart(item.period);
			if (period === null) return '';
			const labels = options.periodLabels;
			if (labels === undefined) {
				// Loud, never a silent English fallback: PHP localizes these
				// through label::get_label() on every call.
				throw new Error(
					"component_date date_mode 'period' needs localized unit labels — " +
						'pass options.periodLabels (resolvePeriodLabels())',
				);
			}
			return [
				isset(period, 'year') ? `${period.year} ${labels.years}` : '',
				isset(period, 'month') ? `${period.month} ${labels.months}` : '',
				isset(period, 'day') ? `${period.day} ${labels.days}` : '',
			].join(' ');
		}

		case 'time': {
			const part = asPart(startOrSelf(item));
			return part === null ? '' : clock(part);
		}

		// 'datetime' is a misspelling of 'date_time'; PHP logs an ERROR and
		// falls through so a usable value is still returned.
		case 'datetime':
		case 'date_time': {
			const part = asPart(startOrSelf(item));
			if (part === null) return '';
			return `${padYear(part.year)}${sep}${pad2(part.month)}${sep}${pad2(part.day)} ${clock(part)}`;
		}

		default: {
			// 'date' and every unrecognized mode (PHP `case 'date': default:`).
			const part = asPart(startOrSelf(item));
			return part === null ? '' : calendar(part, sep);
		}
	}
}

/**
 * The ontology node's effective date_mode (PHP `get_date_mode()`:
 * `$properties->date_mode ?? component_date::$default_date_mode`).
 */
export function dateModeOf(properties: unknown): string {
	const mode = (properties as { date_mode?: unknown } | null | undefined)?.date_mode;
	// PHP's `??` is null-blind only: an authored '' is passed through and lands
	// on the switch's `default:` — same as 'date', which is why it is safe here.
	return typeof mode === 'string' ? mode : 'date';
}
