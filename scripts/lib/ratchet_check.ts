/**
 * THE BANKING CONTRACT — `--check --json`, shared by every ratchet in the repo.
 *
 * THE ONE MACHINE-READABLE DRIFT VERDICT every ratchet prints under
 * `--check --json`, and the ONLY thing `scripts/baselines_bank.ts` reads.
 *
 * Why a shared shape and not "the bank parses each script's prose": the prose is
 * written for a human and changes with every adversarial review; a bank keyed on
 * it would silently start mis-classifying the day a message is reworded — a gate
 * pinned to spellings. Each ratchet classifies its OWN drift with its OWN drift
 * computation (never a copy of it) into two lists:
 *
 *   regressions   — EVERYTHING the bank may not write away: debt that grew (the
 *                   set the ratchet's own writer refuses without
 *                   --allow-regression), a scan that measured too little to mean
 *                   anything (vacuity), and structural drift a regeneration does
 *                   not cure (a header claim, a missing reason). A non-empty list
 *                   means the bank writes NOTHING for that ratchet.
 *   improvements  — drift the ratchet's own writer banks WITHOUT the flag: a
 *                   count that fell, a frozen red that now passes, an entry for
 *                   a file that is gone, a new test file's per-file floor record
 *                   (only ever alone: a new file that adds a red is a regression
 *                   through the red list, and every writer is all-or-nothing).
 *
 * The CLASSIFICATION never widens what a writer accepts — a line is an
 * improvement only when the writer would bank it flaglessly — and never narrows
 * what a gate reddens: `--check` without `--json` is unchanged, and the exit code
 * under `--json` is the same "any drift ⇒ 1" (an unbanked improvement is still
 * red: that is the rule every one of these gates enforces).
 *
 * Deliberately NOT in scripts/lib/red_baseline.ts: test/unit/ratchet_integrity_tripwire
 * judges any script that imports THAT file by the shared writer's refusal instead of its
 * own, so importing it from the hermetic ratchets for a type would have exempted each of
 * them from its own anti-laundering census.
 */

export interface RatchetCheck {
	/** Registry id (scripts/baselines_bank.ts REGISTRY). */
	ratchet: string;
	/** Repo-relative artifact(s) this verdict is about. */
	baselines: string[];
	improvements: string[];
	regressions: string[];
}

/** `--check --json` asked for: the machine-readable verdict instead of the human report. */
export function wantsCheckJson(argv: readonly string[]): boolean {
	return argv.includes('--check') && argv.includes('--json');
}

/**
 * Print the verdict as ONE JSON line on stdout and return the exit code the
 * plain `--check` returns: 1 on ANY drift, 0 clean.
 */
export function emitRatchetCheck(
	check: RatchetCheck,
	log: (line: string) => void = (line) => console.log(line),
): 0 | 1 {
	log(JSON.stringify(check));
	return check.improvements.length + check.regressions.length > 0 ? 1 : 0;
}

/**
 * A numeric count compared against its frozen value, sorted into the bucket its
 * DIRECTION says: `lowerIsBetter` for a budget (debt), `false` for a floor.
 * Equal is no line at all.
 */
export function classifyCount(
	target: { improvements: string[]; regressions: string[] },
	label: string,
	frozen: number,
	measured: number,
	lowerIsBetter = true,
): void {
	if (measured === frozen) return;
	const line = `${label}: ${frozen} → ${measured}`;
	const better = lowerIsBetter ? measured < frozen : measured > frozen;
	(better ? target.improvements : target.regressions).push(line);
}
