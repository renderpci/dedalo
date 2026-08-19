/**
 * STATUS-PROSE DETECTOR — the ONE implementation of "this sentence narrates a
 * transient RED state as if it were a standing fact", imported by the gate and
 * by any sweep that reports the same finding. Like `scripts/lib/complexity.ts`,
 * the metric has exactly one home: if a gate and a report ever classified prose
 * differently, the finding would be an argument instead of a measurement.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Red is how ratchets die. A comment, a ledger row or an exemption file that
 * says "the ratchet is red as of <date> on <these files>" makes red the
 * EXPECTED condition: the next reader regenerates the baseline by reflex,
 * because the documentation told them red is normal here. The narration is
 * also never load-bearing — no gate in this repo reads it (the tripwire-index
 * parser takes only the first column, and `scripts/verify.ts` has no
 * allowlist) — so it is pure liability: policy-shaped prose that goes stale
 * the moment the red is fixed, and then trains the wrong reflex forever.
 * The RULE wording around such prose ("a red gate is fixed by simplifying or
 * by a deliberate --allow-regression, never by a paragraph") is correct and
 * general; only the dated INSTANCE claim is the defect. This detector is
 * built to see exactly that difference.
 *
 * ── WHAT IS FLAGGED ─────────────────────────────────────────────────────────
 * A STATUS WORD (`red` | `failing` | `broken`) PAIRED with an INSTANCE MARKER,
 * in either order. The pairing is the whole idea: a status word alone is RULE
 * language and legal; a marker alone is a date or a sha and legal; together
 * they are a claim about the state of the tree at a moment in time — the thing
 * that goes stale.
 *
 * Two marker classes, with different reach, because they bind differently:
 *  - FAR markers (within 120 chars either side of the status word):
 *    `as of <ISO date>`, `known-red` / `known failing`, and a 7-40 char hex
 *    COMMIT SHA (required to mix letters and digits, so a plain long number —
 *    a section_id, a byte count — is never a sha). These name the instance
 *    from a distance: "(as of 2026-08-11 the ratchet is red on three files
 *    from commit d1f5652783)" pairs across a whole parenthetical.
 *  - NEAR markers (within 40 chars): the temporal adverbs `currently` /
 *    `today`. Adverbs bind tightly to their predicate — "currently red" is a
 *    state claim, but "no file currently reporting a regression may hold an
 *    exemption ... never a way to silence a red ratchet" is a live-read RULE
 *    whose `currently` and whose `red` belong to different clauses. The
 *    narrow window is what keeps that rule legal without whitelisting it.
 *
 * ── WHAT IS NOT FLAGGED (measured, not hoped) ──────────────────────────────
 * Bare rule wording. Roughly forty of engineering/TRIPWIRES.md's rows use
 * `red`/`fails` as RULE language — "un-gating = red", "a stale entry is RED",
 * "either alone is a red gate", "a new unclassified read tool fails CI" — and
 * every one of them must stay legal, which is why `fails` is not a status
 * word here and why a bare ISO date (every row opens with one) is not a
 * marker: only the `as of` spelling claims state.
 *
 * ── NORMALIZATION FIRST (required, not cosmetic) ────────────────────────────
 * Comment leaders (`/**`, a continuation `*`, `//`) are stripped per line and
 * all whitespace runs collapse to single spaces BEFORE matching. The known
 * offender in crap_complexity_ratchet.test.ts spans five comment lines; a
 * line-based scan cannot see it at all.
 *
 * HERMETIC: a pure function over a string. No filesystem, no DB, no network.
 */

/** Status words that, PAIRED with an instance marker, narrate transient state.
 * `fails`/`fail` are deliberately absent: they are the repo's standard rule
 * verb ("an unlisted file fails CI") and pairing them would flag rules. */
const STATUS_WORD = /\b(red|failing|broken)\b/gi;

/** Far-binding instance markers — see the header for why each spelling. The
 * sha alternative demands at least one letter AND one digit among its hex
 * chars, so `001338683` (a zero-padded remote id) and `16777216` are never
 * "commits" while `d1f5652783` is. */
const FAR_MARKER =
	/\bas of \d{4}-\d{2}-\d{2}\b|\bknown[- ](?:red|failing)\b|\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/i;

/** Near-binding instance markers — temporal adverbs, tight window only. */
const NEAR_MARKER = /\b(?:currently|today)\b/i;

/** Chars of context searched either side of a status word for a FAR marker. */
const FAR_WINDOW = 120;
/** Chars of context searched either side of a status word for a NEAR marker. */
const NEAR_WINDOW = 40;
/** Chars of context kept either side of the status word in a returned excerpt
 * — enough to locate and judge the sentence, short enough to quote in a gate
 * failure message. */
const EXCERPT_CONTEXT = 80;

/**
 * Collapse source prose to one matchable line: strip JS comment leaders
 * (a block-comment opener, a continuation-line `*` with or without the
 * closing slash, a `//` lead) at the start of each line, then fold every
 * whitespace run into a single space.
 * Only LEADERS are stripped — an inline `//` inside a URL or a string is
 * content, and eating the rest of its line would hide an offender after it.
 */
function normalizeProse(text: string): string {
	const lines = text.split('\n').map((line) => {
		let s = line.replace(/^\s+/, '');
		s = s.replace(/^\/\*+/, ''); // `/*`, `/**` opener
		s = s.replace(/^\*+\/?/, ''); // continuation `*`, closer `*/`
		s = s.replace(/^\/\//, ''); // line comment lead
		return s;
	});
	return lines.join(' ').replace(/\s+/g, ' ').trim();
}

/** Cut a clean excerpt around [from, to): trim to word boundaries at cut
 * edges so the quote is greppable prose, not half a token. */
function excerptAround(normalized: string, from: number, to: number): string {
	const rawStart = Math.max(0, from - EXCERPT_CONTEXT);
	const rawEnd = Math.min(normalized.length, to + EXCERPT_CONTEXT);
	let slice = normalized.slice(rawStart, rawEnd);
	if (rawStart > 0) slice = slice.replace(/^\S*\s+/, '');
	if (rawEnd < normalized.length) slice = slice.replace(/\s+\S*$/, '');
	return slice;
}

/**
 * Scan `text` for status-word/instance-marker pairs and return one excerpt
 * per offending region (overlapping anchors merge into the first excerpt, so
 * "red ... sha ... red" in one sentence is one finding, not two). Empty array
 * when the text is clean.
 */
export function findStatusProse(text: string): string[] {
	const normalized = normalizeProse(text);
	const hits: string[] = [];
	let coveredTo = -1;
	for (const match of normalized.matchAll(STATUS_WORD)) {
		const start = match.index;
		const end = start + match[0].length;
		if (start < coveredTo) continue; // inside the previous excerpt: same finding
		const far = normalized.slice(Math.max(0, start - FAR_WINDOW), end + FAR_WINDOW);
		const near = normalized.slice(Math.max(0, start - NEAR_WINDOW), end + NEAR_WINDOW);
		if (!FAR_MARKER.test(far) && !NEAR_MARKER.test(near)) continue;
		hits.push(excerptAround(normalized, start, end));
		coveredTo = end + EXCERPT_CONTEXT;
	}
	return hits;
}
