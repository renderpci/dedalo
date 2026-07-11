/**
 * tool_tc core (PHP tool_tc::change_all_timecodes → replace_tc_codes).
 *
 * Offsets every `[TC_HH:MM:SS.mmm_TC]` mark in a transcription text by a signed
 * number of seconds, clamped at zero. For POSITIVE offsets the replacement map
 * is applied in REVERSE order so an earlier mark's new value can't collide with
 * a later mark's original (PHP array_reverse). Pure text transform — no media
 * I/O. Reuses the shared TR mark helpers (tr_marks.ts).
 */

import { TC_PATTERN, secondsToTc, tcToSeconds } from '../../resolve/tr_marks.ts';

/**
 * Replace every TC mark's timecode by `offsetSeconds`. Returns the rewritten
 * text and the {oldTc → newTc} map actually applied. On any parse failure the
 * original text is returned unchanged (PHP defensive contract).
 */
export function replaceTimecodes(
	rawText: string,
	offsetSeconds: number,
): { text: string; changes: Record<string, string> } {
	if (typeof rawText !== 'string' || rawText === '' || !Number.isFinite(offsetSeconds)) {
		return { text: rawText, changes: {} };
	}
	try {
		// Collect the inner timecodes in document order.
		const inner: string[] = [];
		for (const match of rawText.matchAll(TC_PATTERN)) {
			inner.push(match[1] as string);
		}
		if (inner.length === 0) return { text: rawText, changes: {} };

		// Build old→new (dedup; clamp ≥ 0).
		const changes: Record<string, string> = {};
		for (const tc of inner) {
			if (tc in changes) continue;
			const seconds = Math.max(0, tcToSeconds(tc) + offsetSeconds);
			changes[tc] = secondsToTc(seconds);
		}

		// Positive offsets: apply in reverse so a mark's new value never
		// overwrites a not-yet-processed later mark's original.
		const entries = Object.entries(changes);
		const ordered = offsetSeconds > 0 ? entries.reverse() : entries;
		let text = rawText;
		for (const [oldTc, newTc] of ordered) {
			if (oldTc === newTc) continue;
			text = text.split(`[TC_${oldTc}_TC]`).join(`[TC_${newTc}_TC]`);
		}
		return { text, changes };
	} catch {
		return { text: rawText, changes: {} };
	}
}
