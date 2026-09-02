/**
 * THE ONE REASON VALIDATOR — shared by every ratchet that records a "why".
 *
 * Three artifacts in this repo accept debt on the strength of a written reason:
 * the crap ratchet's new-file exemptions and its coverage-exempt list, the
 * dependency-advisory baseline's accepted entries, and the crap baseline's
 * growth ledger. Each used to validate that reason on its own — and one of them
 * validated by WORD COUNT ALONE while its failure message promised the
 * blacklist that lived in ANOTHER describe block (P2-18 / GATE-23): "This is
 * temporary and we will refactor it later on" was accepted by the very rule
 * whose message named it as rejected.
 *
 * A validator that exists once cannot drift from itself. `THIN_REASONS` is the
 * single blacklist; `thinReasonProblem()` is the single predicate; the per-site
 * minimum word count is the only thing a caller decides. A gate asserts that no
 * other `THIN_REASONS` is declared anywhere under scripts/ or test/.
 *
 * A reason names the IRREDUCIBLE structure: what forces the complexity, why an
 * advisory is unreachable from shipped code, what a coverage run would destroy.
 * "Temporary", "TODO", "hard to test" and "later" describe an intention, and an
 * intention is not a reason. Neither validator here can tell a substantive
 * sentence from a plausible-sounding one — that is the reviewer's job; what
 * they CAN do is refuse the empty, the thin and the self-confessed placeholder.
 */

/**
 * Words that are not a reason. Shared, never redeclared.
 *
 * `temporar\w*` and not `temporar\b`: measured, the first spelling of this
 * blacklist wrote `\btemporar\b`, which can match NOTHING ("temporary" has no
 * word boundary after the r) — so every failure message promised to reject
 * "temporary" while the predicate accepted it, the GATE-23 shape centralised.
 * The gate now holds a positive control that says only "temporary".
 */
export const THIN_REASONS = /\b(todo|temporar\w*|later|hard to test|no time|refactor soon)\b/i;

/**
 * Why `reason` is not acceptable, or null when it is.
 *
 * `minWords` is the caller's floor: 8 for a new-file complexity exemption (one
 * sentence naming the structure), 12 for a coverage exemption, an accepted
 * advisory or a ledgered growth (a decision about shipped code deserves a
 * sentence with a subject and a consequence).
 */
export function thinReasonProblem(reason: unknown, minWords: number): string | null {
	if (typeof reason !== 'string') return 'no reason recorded (not a string)';
	const trimmed = reason.trim();
	if (trimmed === '') return 'no reason recorded (empty)';
	const words = trimmed.split(/\s+/).length;
	if (words < minWords)
		return `reason has ${words} word${words === 1 ? '' : 's'}, fewer than the ${minWords} a substantive one takes`;
	const thin = THIN_REASONS.exec(trimmed);
	if (thin !== null)
		return `reason contains "${thin[0]}" — an intention, not a reason (THIN_REASONS)`;
	return null;
}

/**
 * The value of a `--<flag> <value>` (or `--<flag>=<value>`) argument, or null
 * when absent or when the next token is itself a flag. ONE reader for every
 * generator's value-taking flag (`--reason`, `--reference`, `--baseline`), so
 * they cannot drift on the `--x=` spelling or on "the next token is a flag".
 */
export function readFlagValue(argv: readonly string[], flag: string): string | null {
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i] as string;
		if (arg === flag) {
			const next = argv[i + 1];
			return next === undefined || next.startsWith('--') ? null : next;
		}
		if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
	}
	return null;
}

/**
 * The `--reason "<text>"` (or `--reason=<text>`) argument of a generator's
 * command line, or null when absent. ONE reason per invocation: a run that
 * accepts several new entries records the same triage on each of them; a
 * per-entry reason is a per-entry run.
 */
export function readReasonArg(argv: readonly string[]): string | null {
	return readFlagValue(argv, '--reason');
}
