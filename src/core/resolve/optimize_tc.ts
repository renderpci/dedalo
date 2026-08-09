/**
 * OptimizeTC — the fragment time-code optimiser
 * (PHP oracle: v7_php_frozen/master_dedalo/shared/class.OptimizeTC.php, v1.0.4
 *  — ONE copy in the frozen tree, loaded by core/base/class.loader.php and
 *  consumed by the v1 publication API through
 *  publication/server_api/v1/common/class.web_data.php :2535 and
 *  publication/server_api/v1/common/class.free_node.php :265).
 *
 * Given a transcription's raw text and one indexation tag, this decides which
 * time code the tagged fragment starts and ends at. It is NOT a "nearest mark"
 * scan; it has three stages, and the naive first stage alone drifts by up to a
 * minute on real oral-history material:
 *
 *   1. VALIDATION MARGIN — the neighbouring [TC_…_TC] mark counts only when it
 *      is within 55 characters of the tag. A mark further away is not evidence
 *      about this fragment, it is just the last mark someone happened to drop.
 *   2. FORWARD FALLBACK — for tc_in, when the preceding mark is out of margin
 *      but the FOLLOWING one is inside it, the following mark wins (and the
 *      mirror image for tc_out).
 *   3. VIRTUAL TC — when neither neighbour is inside the margin, the time code
 *      is INTERPOLATED: the seconds between the two surrounding marks are
 *      divided by the characters between them, giving a per-character rate that
 *      is then applied to the characters from the previous mark to the tag.
 *
 * WHY THIS IS ITS OWN MODULE. The v1 publication API is still PHP and still
 * serves the live oral-history websites, so the back office and the public site
 * must agree, mark for mark, about where a fragment begins. They diverged once
 * already (2026-08 oh1 beta audit: 19 of 62 tags off, up to 57 s early) because
 * the back office grew a private, simplified copy. There is exactly one copy of
 * this algorithm on the TS side and it lives here, next to the rest of the
 * TR/OptimizeTC surface; the indexation grid is a CALLER, and so is whatever
 * ports the publication path later.
 *
 * FAITHFULNESS. This is a transliteration, PHP quirks included, because the
 * quirks are observable in published sites:
 *   - `mb_strpos` returning false coerces to position 0 in PHP arithmetic.
 *   - The virtual-TC branch re-locates the marks with `mb_strpos(text, '[TC_'
 *     . $tc)`, i.e. by VALUE from the start of the text — not at the position
 *     it just found them. A repeated time code resolves to its FIRST occurrence.
 *   - `if(!$tcPrevPosAbs && !$tcNextPosAbs)` treats a mark found at absolute
 *     position 0 as "not found", so a text that opens with its only mark yields
 *     an EMPTY time code rather than that mark.
 *   - The `+16` / length arithmetic in `charPrevTCindexIn` overshoots the mark
 *     by the length of the `_TC]` tail; the character count it produces is the
 *     distance from the previous mark to the tag, not from the end of the mark.
 * None of these are "improved" here. A deliberate divergence would need a
 * wire-contract entry; parity needs none.
 *
 * All positions are CHARACTER positions (PHP runs these through `mb_*` with
 * `mb_internal_encoding('UTF-8')`), never UTF-16 code units — see {@link MbText}.
 *
 * Gate: test/unit/indexation_grid_tc_native.test.ts, whose expectations are
 * captured from the frozen PHP class itself.
 */

import { secondsToTc, tcToSeconds } from './tr_marks.ts';

/**
 * PHP TC2seg / seg2tc, re-exported so a caller needs ONE import for the whole
 * OptimizeTC surface (they live in tr_marks.ts beside the mark patterns).
 */
export { secondsToTc, tcToSeconds };

/** PHP `$margen` — the validation margin, in characters. */
const MARGIN_CHARS = 55;

/**
 * PHP TR::get_mark_pattern('tc'). Built per call: a /g RegExp carries
 * `lastIndex`, and a shared one is module state that leaks between requests.
 */
const TC_TAG_SOURCE = '\\[TC_([0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}(?:\\.[0-9]{1,3})?)_TC\\]';
const tcTagPattern = (): RegExp => new RegExp(TC_TAG_SOURCE, 'g');

/**
 * A string addressed in CHARACTERS, the way PHP's `mb_*` functions address it.
 *
 * This is not pedantry. The 55-character margin and the characters-per-second
 * rate are both measured in characters, and JavaScript string indices count
 * UTF-16 code units — every non-BMP character (Gothic, Linear B, Old Italic,
 * musical notation, emoji: all of them plausible in a heritage transcription)
 * counts twice and silently shifts the result. A text of 20 astral characters
 * between a mark and a tag is 50 characters away for PHP and 70 for a naive
 * JS `indexOf`, which is the difference between "use this mark" and "interpolate".
 *
 * All-BMP strings — the overwhelming majority — take a zero-allocation fast
 * path where character index === code-unit index.
 */
class MbText {
	readonly raw: string;
	/** Code-unit offset of every character; null on the all-BMP fast path. */
	private readonly offsets: number[] | null;
	readonly length: number;

	constructor(raw: string) {
		this.raw = raw;
		if (!/[\uD800-\uDBFF]/.test(raw)) {
			this.offsets = null;
			this.length = raw.length;
			return;
		}
		const offsets: number[] = [];
		for (let unit = 0; unit < raw.length; ) {
			offsets.push(unit);
			unit += (raw.codePointAt(unit) ?? 0) > 0xffff ? 2 : 1;
		}
		this.offsets = offsets;
		this.length = offsets.length;
	}

	/** Code-unit offset of character index `char`, clamped to the string. */
	private unitAt(char: number): number {
		if (this.offsets === null) return Math.min(Math.max(char, 0), this.raw.length);
		if (char <= 0) return 0;
		if (char >= this.offsets.length) return this.raw.length;
		return this.offsets[char] as number;
	}

	/** Character index containing code-unit offset `unit`. */
	private charAt(unit: number): number {
		if (this.offsets === null) return unit;
		let lo = 0;
		let hi = this.offsets.length - 1;
		let found = 0;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			if ((this.offsets[mid] as number) <= unit) {
				found = mid;
				lo = mid + 1;
			} else {
				hi = mid - 1;
			}
		}
		return found;
	}

	/** PHP mb_substr, including its negative-length semantics. */
	substr(start: number, length?: number): string {
		const total = this.length;
		const from = start < 0 ? Math.max(total + start, 0) : Math.min(start, total);
		let to: number;
		if (length === undefined) {
			to = total;
		} else if (length < 0) {
			to = Math.max(total + length, from);
		} else {
			to = Math.min(from + length, total);
		}
		if (to <= from) return '';
		return this.raw.slice(this.unitAt(from), this.unitAt(to));
	}

	/** PHP mb_strpos: the CHARACTER position of `needle`, or false. */
	strpos(needle: string): number | false {
		const unit = this.raw.indexOf(needle);
		return unit < 0 ? false : this.charAt(unit);
	}

	/** Character position of a code-unit offset produced by a RegExp match. */
	charOfUnit(unit: number): number {
		return this.charAt(unit);
	}
}

/** PHP mb_strlen. */
function mbStrlen(text: string): number {
	return new MbText(text).length;
}

/** The last / first complete [TC_…_TC] mark of a fragment, with its position. */
interface MarkHit {
	/** Character position of the mark inside the fragment. */
	position: number;
	/** The mark's time-code VALUE (PHP capture group 1). */
	value: string;
}

function lastMark(fragment: string): MarkHit | null {
	const matches = [...fragment.matchAll(tcTagPattern())];
	const hit = matches[matches.length - 1];
	if (hit === undefined || hit[1] === undefined) return null;
	// PHP takes mb_strrpos(fragment, $last_tc): the LAST occurrence of that
	// literal mark, which is this match — any later one would itself be a match.
	return { position: new MbText(fragment).charOfUnit(hit.index), value: hit[1] };
}

function firstMark(fragment: string): MarkHit | null {
	const pattern = tcTagPattern();
	const hit = pattern.exec(fragment);
	if (hit === null || hit[1] === undefined) return null;
	return { position: new MbText(fragment).charOfUnit(hit.index), value: hit[1] };
}

/**
 * PHP's virtual-TC branch, shared verbatim by optimize_tc_in and
 * optimize_tc_out (the two copies in the PHP class are identical).
 *
 * Returns '' for PHP's falsy-position case: BOTH marks resolving to a position
 * that is false (absent) or 0 (the very start of the text).
 */
function virtualTc(
	text: MbText,
	indexPos: number,
	prevTC: string | null,
	nextTC: string | null,
): string {
	const prevFound = text.strpos(`[TC_${prevTC ?? ''}`);
	const nextFound = text.strpos(`[TC_${nextTC ?? ''}`);
	if (!prevFound && !nextFound) return '';

	// PHP arithmetic on a false from mb_strpos treats it as 0.
	const prevPos = prevFound === false ? 0 : prevFound;
	const nextPos = nextFound === false ? 0 : nextFound;

	const difTCchar = nextPos - prevPos;
	const difSeg = tcToSeconds(nextTC ?? '') - tcToSeconds(prevTC ?? '');
	const segChar = difTCchar > 0 ? difSeg / difTCchar : 0;
	const charPrevTCindexIn = mbStrlen(text.substr(prevPos + 16, indexPos - prevPos));
	return secondsToTc(charPrevTCindexIn * segChar + tcToSeconds(prevTC ?? ''));
}

/**
 * PHP OptimizeTC::optimize_tc_in — the time code the tagged fragment STARTS at.
 *
 * @param text       the component_text_area raw text, marks included
 * @param indexIn    the opening tag, e.g. '[index-n-10-label-data::data]'
 * @param startPosition when given (and non-zero), search freely from this
 *                   CHARACTER position instead of locating `indexIn`. Exactly 0
 *                   is the intentional short circuit and returns '00:00:00.000'.
 * @param inMargin   characters subtracted from the located position; the
 *                   indexation grid passes 0.
 * @returns a time-code string, or '' when the text carries no usable marks.
 */
export function optimizeTcIn(
	text: string,
	indexIn: string | null,
	startPosition: number | null = null,
	inMargin = 100,
): string {
	// Intentional zero-position case: calculate nothing.
	if (startPosition === 0) return '00:00:00.000';

	const mb = new MbText(text);

	// PHP `!empty($start_position)`: null and 0 fall through to the tag search.
	let indexPos: number;
	if (startPosition !== null) {
		indexPos = startPosition - inMargin;
	} else {
		const found = mb.strpos(indexIn ?? '');
		indexPos = (found === false ? 0 : found) - inMargin;
	}
	if (indexPos < 0) indexPos = 0;

	// Stage 1 — the preceding mark, if it is inside the validation margin.
	const before = lastMark(mb.substr(0, indexPos));
	const prevTC = before === null ? '00:00:00.000' : before.value;
	let dif = before === null ? 0 : indexPos - before.position;
	if (dif < MARGIN_CHARS && dif > 0) return prevTC;

	// Stage 2 — the following mark, if IT is inside the margin.
	const after = firstMark(mb.substr(indexPos));
	const nextTC = after === null ? null : after.value;
	dif = after === null ? 0 : after.position;
	if (dif < MARGIN_CHARS && dif > 0) return nextTC as string;

	// Stage 3 — interpolate.
	return virtualTc(mb, indexPos, prevTC, nextTC);
}

/**
 * PHP OptimizeTC::optimize_tc_out — the time code the tagged fragment ENDS at.
 *
 * The mirror of {@link optimizeTcIn}: the FOLLOWING mark is consulted first.
 * Note the asymmetry PHP has and the grid depends on — `inMargin` is ADDED
 * here, and the grid passes 100, so a mark within 100 characters after the
 * closing tag is stepped over rather than chosen.
 *
 * @param endPosition when given, search freely from this CHARACTER position
 *                    instead of locating `indexOut`. Unlike the in side, 0 is
 *                    an ordinary value here (PHP checks `is_null`).
 */
export function optimizeTcOut(
	text: string,
	indexOut: string | null,
	endPosition: number | null = null,
	inMargin = 100,
): string {
	const mb = new MbText(text);

	let indexPos: number;
	if (endPosition === null) {
		const found = mb.strpos(indexOut ?? '');
		indexPos = (found === false ? 0 : found) + inMargin;
	} else {
		indexPos = endPosition + inMargin;
	}

	// Stage 1 — the following mark, if it is inside the validation margin.
	const after = firstMark(mb.substr(indexPos));
	const nextTC = after === null ? null : after.value;
	let dif = after === null ? 0 : after.position;
	if (dif < MARGIN_CHARS && dif > 0) return nextTC as string;

	// Stage 2 — the preceding mark. PHP leaves prevTC NULL here when there is
	// none (the in side defaults it to '00:00:00.000'); the difference is
	// visible in the virtual branch's '[TC_' . $prevTC lookup.
	const before = lastMark(mb.substr(0, indexPos));
	const prevTC = before === null ? null : before.value;
	dif = before === null ? 0 : indexPos - before.position;
	if (dif < MARGIN_CHARS && dif > 0) return prevTC as string;

	// Stage 3 — interpolate.
	return virtualTc(mb, indexPos, prevTC, nextTC);
}
