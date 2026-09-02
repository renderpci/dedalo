/**
 * CRAP / CYCLOMATIC-COMPLEXITY BASELINE — generator and drift checker.
 *
 *   bun run scripts/crap_baseline.ts --check    # print drift, exit 1 if any
 *   bun run scripts/crap_baseline.ts --update   # rewrite the JSON baseline
 *   bun run scripts/crap_baseline.ts --report   # human view, never fails
 *
 * ── WHAT THIS IS ─────────────────────────────────────────────────────────────
 * CRAP(m) = comp² × (1 − cov)³ + comp, so at full coverage CRAP == comp and a
 * "CRAP ≤ 6" rule is a HARD cyclomatic cap of 6. About a fifth of src/core/'s
 * functions exceed 6 today (exact census: the `summary` block of the baseline),
 * so a flat cap can never pass. What is enforceable is a SHRINK-ONLY RATCHET:
 * every file over the cap is frozen at the complexity it has today, and may
 * only get simpler.
 *
 * ── WHAT IT DOES NOT DO (say this out loud, it is the part readers assume) ───
 *  - It does NOT compute a CRAP score and it measures NO coverage. The cap is
 *    derived from CRAP's BEST CASE (cov = 1); this tree is at ~85% LINE
 *    coverage, so the gate is strictly WEAKER than a real CRAP ≤ 6.
 *  - It does NOT cover the whole repo. SCAN_ROOT is src/core ONLY. src/ai,
 *    src/config, src/diffusion, src/external, tools/, scripts/ (including THIS
 *    file and the metric it imports), publication/ and client/ are UNGATED — a
 *    new branchy module in any of them passes untouched.
 *  - It measures `*.ts` only. Other source under the root (src/core has three
 *    tracked `.js` files) is outside the metric; that set is enumerated by
 *    `unmeasuredSourceFiles()` and PINNED by the gate, so it is disclosed
 *    rather than silent.
 *  - It cannot see a SPLIT. Move a 19-complexity function from a listed file
 *    into a brand-new file and the totals do not change: the old entry goes
 *    stale, the new file trips the new-file rule, and a regeneration makes both
 *    green with `functionsOverCap` unmoved. Nothing here distinguishes that
 *    from a genuine improvement — the baseline diff and the reviewer do.
 *
 * The measurement lives in ONE place — scripts/lib/complexity.ts. This
 * generator and the tripwire gate both import it, so the number the gate
 * enforces is by construction the number this file wrote. Read that module's
 * header for the metric and every edge-case decision.
 *
 * ── COMPLIANCE IS ONE COMMAND ────────────────────────────────────────────────
 * Lowered a function's complexity? Run:
 *
 *     bun run scripts/crap_baseline.ts --update
 *
 * and commit the baseline alongside the refactor. That is the whole workflow.
 * `--check` is red for BOTH directions on purpose:
 *   - a file ABOVE its entry is a REGRESSION — fix the code, never the number;
 *   - a file BELOW its entry (or gone, or now at/under the cap) is a STALE
 *     entry — it makes the ratchet look stricter than it is and would let the
 *     file silently regress back up. Prune it with --update.
 *
 * `--update` REFUSES to launder a regression. Plain `--update` may only lower
 * or remove entries; raising one, or freezing a brand-new over-cap file,
 * requires the explicit `--allow-regression` flag. That is what keeps the
 * reflexive "gate is red, run the fix command" path from silently absorbing the
 * very growth this ratchet exists to stop: the developer has to type the word
 * regression, and the diff then carries a raised number that a reviewer sees.
 * `--allow-regression` also REQUIRES `--reason "<text>"`: the reason is
 * validated by the one shared validator and written into the baseline's
 * `ledger`, where the gate reads it (a commit message is read by no gate).
 *
 * ── WHAT THE BASELINE IS KEYED BY, AND WHAT THAT DOES NOT CATCH ─────────────
 * Entries are keyed by FILE, not by function, and hold that file's MAXIMUM
 * function complexity. Function names are unstable (anonymous callbacks, IIFEs,
 * class-property arrows) and reordering or renaming inside a file must not
 * churn the baseline — so names and line numbers are message-only and never
 * baseline material.
 *
 * The honest limitation of that choice, stated rather than hidden: inside a
 * file already listed at N, a NEW function at complexity < N does not move the
 * per-file max and so passes silently. What still catches it is
 * `summary.functionsOverCap` — the census counts FUNCTIONS, not files, so a new
 * over-cap function anywhere moves that number and fails --check. The two
 * together are the gate: per-file max stops any single function getting worse,
 * the census stops the population of over-cap functions growing.
 *
 * ── WHICH CENSUS NUMBERS ARE ASSERTED, AND WHY NOT ALL FOUR ─────────────────
 * `functionsOverCap` and `filesOverCap` are ASSERTED exactly: they are the debt
 * itself, and either one growing is the defect. `files` and `functions` are
 * ADVISORY — recorded for the human reading the artifact, never compared.
 * They carry no complexity information at all, and asserting them made the gate
 * red on ANY added or removed file or function (a 4-complexity helper did it),
 * whose only offered remedy was a blanket regeneration — training exactly the
 * reflex that could absorb a real regression. Vacuity, the reason the census
 * existed, is covered directly instead by CENSUS_FLOORS below.
 *
 * ── HERMETIC ────────────────────────────────────────────────────────────────
 * AST-only: no DB, no network, no coverage run, no clock, no randomness. It
 * reads only tracked source under src/core/ and finishes in well under a
 * second, so it is eligible for the hermetic CI tier. Deterministic across
 * machines: paths are repo-relative with forward slashes and every list is
 * sorted, so a macOS run and a debian-slim container write identical bytes.
 */

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	byPath,
	COMPLEXITY_CAP,
	type FileComplexity,
	REPO_ROOT,
	scanTree,
	summarize,
	unmeasuredSourceFiles,
} from './lib/complexity.ts';
import { readFlagValue, readReasonArg, thinReasonProblem } from './lib/reason_validator.ts';

/**
 * The measured tree. src/core/ only — the engine's core, where the debt is.
 * Everything else in the repo is UNGATED by this ratchet; see the header.
 */
export const SCAN_ROOT = 'src/core';

/**
 * Anti-vacuity floors, deliberately far BELOW the measured census so ordinary
 * churn never trips them. They exist because every other check here is of the
 * form "this violation list is empty": a broken glob or a moved scan root would
 * make all of them pass having inspected nothing. Fix the scanner, never the
 * floor.
 */
export const CENSUS_FLOORS = { files: 400, functions: 3000 } as const;

/** Source under SCAN_ROOT that the metric does NOT measure. See computeDrift. */
export function unmeasuredSources(): string[] {
	return unmeasuredSourceFiles(join(REPO_ROOT, SCAN_ROOT));
}

/** The frozen baseline. In engineering/ because a gate reads it (rewrite/ may not be read). */
export const BASELINE_PATH = 'engineering/crap_complexity_baseline.json';

export interface ComplexityBaseline {
	_: string;
	generated: string;
	cap: number;
	root: string;
	summary: {
		files: number;
		functions: number;
		functionsOverCap: number;
		filesOverCap: number;
	};
	/** The debt's history, inside the artifact. See LedgerEntry. */
	ledger: LedgerEntry[];
	files: Record<string, number>;
}

/**
 * One line of the debt's history — APPEND-ONLY, written by --update whenever
 * either asserted counter changed.
 *
 * WHY THE HISTORY LIVES IN THE ARTIFACT (P2-18 / GATE-22). The generator
 * guards the write IT performs; a merge resolution or a hand edit writes the
 * file without invoking it, and measured across this ratchet's life the frozen
 * debt GREW that way (+19 over-cap functions net, under a bare merge message).
 * The reference a working tree must be compared against cannot be ONLY git:
 * the hermetic CI tier checks out shallow, inside a container, so a merge-base
 * comparison would be vacuous exactly where it must run. The hermetic
 * reference is therefore the file's own ledger, anchored at `LEDGER_BIRTH`
 * (a constant in CODE, so the artifact cannot restart its own history):
 * `ledger[0]` MUST be the birth line, `summary` MUST equal the last line, and
 * every line that grew over its predecessor MUST carry a reason the shared
 * validator accepts. Hence every counter value above the birth is reachable
 * only through a reasoned line — a merge that raises the counters without
 * appending one is RED with no git at all.
 *
 * WHAT THAT DOES NOT CATCH, said out loud: a hand edit that REWRITES an
 * existing line's numbers (and summary to match) passes the hermetic
 * predicate — the birth pin stops it only for the first line. That edit is
 * visible in the diff of a history that is otherwise append-only, and where
 * history exists (`--check --reference <git-rev>`: verify.ts's `crap:ledger`
 * stage against the merge-base, hermetic.sh's `crap ledger` stage against a
 * reference it fetches)
 * `ledgerPrefixProblems` proves the append-only property itself: the
 * reference's ledger must be a PREFIX of the working ledger, line for line.
 *
 * `generated` is the one clock read in this generator, taken only when a line
 * is appended; an unchanged census re-writes byte-identical output.
 */
export interface LedgerEntry {
	generated: string;
	functionsOverCap: number;
	filesOverCap: number;
	reason?: string;
}

/**
 * The FIRST line of the ledger, forever. The day the history began and the debt
 * it began with; a constant here for the same reason `cap` is compared against
 * COMPLEXITY_CAP — the artifact does not get to redefine the gate, and a
 * ledger truncated to a fresh opener at today's census would otherwise be a
 * clean history. Never edit: history is not a setting.
 */
export const LEDGER_BIRTH: Readonly<LedgerEntry> = Object.freeze({
	generated: '2026-09-01',
	functionsOverCap: 688,
	filesOverCap: 268,
});

/** A ledgered growth is a decision about the engine's debt: a full sentence. */
export const LEDGER_REASON_MIN_WORDS = 12;

const PROSE = [
	'SHRINK-ONLY cyclomatic-complexity ratchet over src/core/.',
	`Each entry is that file's MAXIMUM function complexity, frozen at today's value; every file absent from the list is capped at ${COMPLEXITY_CAP}.`,
	`Why ${COMPLEXITY_CAP}: CRAP(m) = comp^2 * (1 - cov)^3 + comp collapses to CRAP = comp at full coverage, so "CRAP <= ${COMPLEXITY_CAP}" IS a cyclomatic cap of ${COMPLEXITY_CAP}. A flat cap can never pass here (see summary.functionsOverCap), which is exactly why this is a ratchet and not a threshold.`,
	'The metric has ONE implementation, scripts/lib/complexity.ts (AST-only, @babel/parser pinned EXACT because these numbers are a function of the parser taxonomy). Coverage is deliberately not an input: there is no lcov artifact in CI, and a gate needing an 8-minute coverage run is a gate nobody runs.',
	'DO NOT hand-edit. Regenerate with: bun run scripts/crap_baseline.ts --update — that is the entire compliance workflow after a refactor lowers complexity.',
	'An entry may only go DOWN. Raising one, or adding a file, means a function got more complex: that is a deliberate act, taken with --allow-regression --reason "<text>", and the reason is written into the ledger below. Lowering or removing an entry needs no justification, only the regenerated file in the same change.',
	'Stale entries are a gate failure, not a nuisance: an entry higher than reality makes the ratchet look stricter than it is and lets a simplified file quietly regress back up.',
	`ledger is the APPEND-ONLY history of the two asserted counters, written by --update whenever one changed. Its first line is pinned in code (LEDGER_BIRTH: ${LEDGER_BIRTH.generated}, ${LEDGER_BIRTH.functionsOverCap}/${LEDGER_BIRTH.filesOverCap}), summary must equal its last line, and a line that is not a shrink over the previous one (counters up, or flat: a per-file entry raised) must carry a reason (validated by scripts/lib/reason_validator.ts) — so every counter above the birth is reachable only through a reasoned line, and a merge resolution that raises summary without the generator is red without reading git. A rewritten line is the one edit the hermetic predicate cannot see; it shows in the diff, and --check --reference <git-rev> proves the prefix where history exists.`,
	'summary is the census of the frozen debt. functionsOverCap and filesOverCap are ASSERTED exactly (they ARE the debt); files and functions are ADVISORY — they carry no complexity information, and asserting them turned every added or removed file into a red gate whose only remedy was a blanket regeneration.',
	'SCOPE, so nobody assumes more: this measures *.ts under src/core ONLY. src/ai, src/config, src/diffusion, src/external, tools/, scripts/, publication/ and client/ are UNGATED, and non-.ts source inside src/core (three tracked .js files) is outside the metric — that set is enumerated and pinned by the gate rather than silently skipped.',
	"It is NOT a CRAP score and it measures NO coverage: the cap comes from CRAP's best case (cov = 1), so this gate is strictly WEAKER than a real CRAP <= 6. It also cannot see a function SPLIT out into a new file — the totals do not move and only the baseline diff shows it.",
].join(' ');

const GENERATED_BY =
	'bun run scripts/crap_baseline.ts --update (AST-only scan of src/core/ via scripts/lib/complexity.ts)';

/** Measure the tree. The single scan both --check and --update use. */
export function measure(): FileComplexity[] {
	return scanTree(join(REPO_ROOT, SCAN_ROOT));
}

/** Build the baseline object from a measurement. Keys sorted ⇒ idempotent bytes. */
export function buildBaseline(results: readonly FileComplexity[]): ComplexityBaseline {
	const files: Record<string, number> = {};
	for (const result of [...results].sort(byPath)) {
		if (result.maxComplexity > COMPLEXITY_CAP) files[result.file] = result.maxComplexity;
	}
	return {
		_: PROSE,
		generated: GENERATED_BY,
		cap: COMPLEXITY_CAP,
		root: SCAN_ROOT,
		summary: summarize(results),
		ledger: [],
		files,
	};
}

/** The counters the ledger tracks, taken from a summary or an entry. */
function counters(of: { functionsOverCap: number; filesOverCap: number }) {
	return { functionsOverCap: of.functionsOverCap, filesOverCap: of.filesOverCap };
}

/**
 * Carry the previous ledger onto a fresh measurement and append a line when a
 * tracked counter moved — OR when `regression` says the write raises a per-file
 * entry with the counters flat (a function already over the cap got worse: no
 * counter sees it, but it is a growth decision and its reason must land
 * somewhere a gate reads). `reason` (from --reason) is attached to the appended
 * line whenever given; `ledgerProblems` decides whether one was REQUIRED. The
 * writer then validates its own output with the same predicate the gate uses,
 * so a generator can never write a file the gate would refuse.
 */
export function appendLedger(
	previous: ComplexityBaseline | null,
	next: ComplexityBaseline,
	reason: string | null,
	today: string,
	regression = false,
): ComplexityBaseline {
	const carried = Array.isArray(previous?.ledger) ? [...previous.ledger] : [];
	const last = carried.at(-1);
	const fresh = counters(next.summary);
	const unchanged =
		last !== undefined &&
		last.functionsOverCap === fresh.functionsOverCap &&
		last.filesOverCap === fresh.filesOverCap;
	if (!unchanged || regression) {
		carried.push(
			reason === null ? { generated: today, ...fresh } : { generated: today, ...fresh, reason },
		);
	}
	return { ...next, ledger: carried };
}

/**
 * Everything wrong with a baseline's ledger, as message lines. Empty is green.
 *   - the ledger exists and has at least one line, and its first line IS
 *     `LEDGER_BIRTH` (a truncated history is not a clean one);
 *   - every line's counters are numbers and `generated` a date;
 *   - `summary` equals the LAST line (a hand edit or merge that raised the
 *     counters without the generator leaves them apart);
 *   - every line that is not a SHRINK over the previous line (counters up, or
 *     flat — a per-file raise) carries a reason the shared validator accepts.
 */
export function ledgerProblems(baseline: ComplexityBaseline): string[] {
	const problems: string[] = [];
	const ledger = baseline.ledger;
	if (!Array.isArray(ledger) || ledger.length === 0) {
		return [
			`${BASELINE_PATH}: no ledger — the debt's history is missing, so nothing pins summary to a reasoned line. Regenerate (${FIX_COMMAND}).`,
		];
	}
	const first = ledger[0] as LedgerEntry;
	if (
		first.generated !== LEDGER_BIRTH.generated ||
		first.functionsOverCap !== LEDGER_BIRTH.functionsOverCap ||
		first.filesOverCap !== LEDGER_BIRTH.filesOverCap
	) {
		problems.push(
			`ledger[0]: the history must begin at its birth (${LEDGER_BIRTH.generated}, ${LEDGER_BIRTH.functionsOverCap}/${LEDGER_BIRTH.filesOverCap} over-cap functions/files), found ${String(first.generated)}, ${String(first.functionsOverCap)}/${String(first.filesOverCap)} — a truncated or rewritten opening line restarts the debt's history at a number nobody reasoned for. Restore the committed ledger.`,
		);
	}
	ledger.forEach((entry, index) => {
		const where = `ledger[${index}]`;
		if (
			typeof entry.functionsOverCap !== 'number' ||
			typeof entry.filesOverCap !== 'number' ||
			!/^\d{4}-\d{2}-\d{2}$/.test(String(entry.generated))
		) {
			problems.push(
				`${where}: malformed (numeric functionsOverCap/filesOverCap and a YYYY-MM-DD generated are required)`,
			);
			return;
		}
		const before = index === 0 ? undefined : ledger[index - 1];
		if (before === undefined) return;
		const shrank =
			entry.functionsOverCap <= before.functionsOverCap &&
			entry.filesOverCap <= before.filesOverCap &&
			(entry.functionsOverCap < before.functionsOverCap ||
				entry.filesOverCap < before.filesOverCap);
		// Anything that is not a shrink is a growth decision: counters up, or
		// counters FLAT (the generator appends a flat line only for a per-file
		// raise under unchanged counters). Both carry a reason or are red.
		if (!shrank) {
			const problem = thinReasonProblem(entry.reason, LEDGER_REASON_MIN_WORDS);
			if (problem !== null)
				problems.push(
					`${where} (${entry.generated}): the debt GREW (${before.functionsOverCap}/${before.filesOverCap} -> ${entry.functionsOverCap}/${entry.filesOverCap} over-cap functions/files${entry.functionsOverCap === before.functionsOverCap && entry.filesOverCap === before.filesOverCap ? '; flat counters mean a per-file entry was raised' : ''}) and the line ${problem}`,
				);
		}
	});
	const last = ledger.at(-1) as LedgerEntry;
	const fresh = counters(
		baseline.summary ?? { functionsOverCap: Number.NaN, filesOverCap: Number.NaN },
	);
	if (
		last.functionsOverCap !== fresh.functionsOverCap ||
		last.filesOverCap !== fresh.filesOverCap
	) {
		problems.push(
			`summary (${fresh.functionsOverCap}/${fresh.filesOverCap} over-cap functions/files) does not equal the last ledger line (${last.functionsOverCap}/${last.filesOverCap}, ${last.generated}) — the counters were written WITHOUT the generator (a merge resolution or a hand edit). Regenerate (${FIX_COMMAND}); growth needs --allow-regression --reason "<text>".`,
		);
	}
	return problems;
}

/**
 * APPEND-ONLY, proved where history exists. `reference` is the artifact at a
 * git revision (the merge-base, on a tier that checks out full history) and
 * `current` the working tree's: every line of the reference must reappear,
 * byte-for-byte in its counters, reason and date, at the same index. A
 * rewritten, reordered or dropped line is the edit the hermetic predicate
 * cannot see, and this one can. Empty is green.
 */
export function ledgerPrefixProblems(
	reference: ComplexityBaseline,
	current: ComplexityBaseline,
): string[] {
	const problems: string[] = [];
	const before = Array.isArray(reference.ledger) ? reference.ledger : [];
	const after = Array.isArray(current.ledger) ? current.ledger : [];
	if (after.length < before.length) {
		problems.push(
			`ledger: the reference holds ${before.length} lines and the working tree ${after.length} — history was truncated; the ledger is append-only.`,
		);
	}
	// A per-file entry raised over the reference (counters flat or not) is a
	// growth decision, and a growth decision is a ledger line: the working
	// ledger must have grown past the reference's, and ledgerProblems holds
	// every such line to a reason.
	const raised = raisedEntries(reference, current);
	if (raised.length > 0) {
		const summary = `${raised.length} entr${raised.length === 1 ? 'y is' : 'ies are'} raised over the reference (${raised[0]}${raised.length > 1 ? ', …' : ''})`;
		if (after.length <= before.length) {
			problems.push(
				`ledger: ${summary} but no line was appended to the history — a raised number without a reasoned line is the hand edit this ratchet exists to refuse.`,
			);
		} else if (
			// The appended lines must carry the raise's reason. A SHRINK line needs
			// none by design, so "a line was appended" is not enough: a hand-raised
			// entry paired with a simplification elsewhere appended an unreasoned
			// net-shrink line and passed both legs (measured, 2026-09-02 review of
			// P2-18). At least one line past the reference's prefix must be reasoned.
			!after
				.slice(before.length)
				.some((line) => thinReasonProblem(line.reason, LEDGER_REASON_MIN_WORDS) === null)
		) {
			problems.push(
				`ledger: ${summary} and the ${after.length - before.length} line(s) appended since the reference carry no validated reason — a raise is a growth decision whatever the counters did elsewhere; it needs --allow-regression --reason "<text>" on the line that records it.`,
			);
		}
	}
	before.forEach((line, index) => {
		const now = after[index];
		if (now === undefined) return;
		if (
			now.generated !== line.generated ||
			now.functionsOverCap !== line.functionsOverCap ||
			now.filesOverCap !== line.filesOverCap ||
			(now.reason ?? null) !== (line.reason ?? null)
		) {
			problems.push(
				`ledger[${index}]: rewritten (reference ${line.generated} ${line.functionsOverCap}/${line.filesOverCap}${line.reason === undefined ? '' : ' with reason'}; working tree ${String(now.generated)} ${String(now.functionsOverCap)}/${String(now.filesOverCap)}${now.reason === undefined ? '' : ' with reason'}) — a history line is never edited, only followed.`,
			);
		}
	});
	return problems;
}

/**
 * Read the baseline. THROWS loudly if it is missing or malformed — a missing
 * baseline must fail the gate, never silently become "no constraints".
 * `path` defaults to the committed artifact; the gate hands a scratch copy.
 */
export function loadBaseline(path = join(REPO_ROOT, BASELINE_PATH)): ComplexityBaseline {
	let raw: string;
	try {
		raw = readFileSync(path, 'utf-8');
	} catch (error) {
		throw new Error(
			`crap_baseline: ${BASELINE_PATH} is missing or unreadable — the ratchet cannot run without it. Regenerate with: bun run scripts/crap_baseline.ts --update. (${String(error)})`,
		);
	}
	let parsed: ComplexityBaseline;
	try {
		parsed = JSON.parse(raw) as ComplexityBaseline;
	} catch (error) {
		throw new Error(`crap_baseline: ${BASELINE_PATH} is not valid JSON: ${String(error)}`);
	}
	if (typeof parsed.cap !== 'number' || parsed.files === null || typeof parsed.files !== 'object') {
		throw new Error(
			`crap_baseline: ${BASELINE_PATH} is malformed (expected numeric "cap" and an object "files").`,
		);
	}
	// The artifact does not get to redefine the gate. `cap` is compared against
	// every unlisted file, so a hand-raised cap would loosen the ratchet tree-wide;
	// `root` would otherwise be decorative, letting a baseline for one tree be
	// checked against another.
	if (parsed.cap !== COMPLEXITY_CAP) {
		throw new Error(
			`crap_baseline: ${BASELINE_PATH} declares cap ${parsed.cap} but the metric's COMPLEXITY_CAP is ${COMPLEXITY_CAP}. The cap is code, not data — change scripts/lib/complexity.ts and regenerate, never edit the JSON.`,
		);
	}
	if (parsed.root !== SCAN_ROOT) {
		throw new Error(
			`crap_baseline: ${BASELINE_PATH} was generated for root "${parsed.root}" but this checker measures "${SCAN_ROOT}" — regenerate it (${FIX_COMMAND}).`,
		);
	}
	return parsed;
}

// ---------------------------------------------------------------------------
// PART THREE OF THE RATCHET — the COVERAGE-EXEMPT list.
// ---------------------------------------------------------------------------

/**
 * Where the exemptions live. In engineering/ for the same reason the baseline
 * is: a GATE reads it, and rewrite/ is not on a clone.
 *
 * It is a COVERAGE list, and coverage here means LINE coverage (Bun emits no
 * BRDA branch records). It has NO effect on the complexity ratchet above: an
 * exempt function is still measured, still counts toward functionsOverCap, and
 * still may not exceed its file's frozen max. AN EXEMPTION IS FOR CODE THAT
 * CANNOT BE COVERED — never a way to silence a complexity regression.
 */
export const COVERAGE_EXEMPT_PATH = 'engineering/crap_coverage_exempt.json';

/** The marker every exempt function must carry NEXT TO THE CODE (DEC-12). */
export const COVERAGE_EXEMPT_MARKER = 'COVERAGE-EXEMPT';

/** Class for an entry the critics RESCUED — kept as a tombstone, NOT exempt. */
export const RESCUED_CLASS = 'NOT-EXEMPT-RESCUED';

export interface CoverageExemptEntry {
	file: string;
	symbol: string;
	class: string;
	reason: string;
}

export interface CoverageExemptList {
	marker: string;
	entries: CoverageExemptEntry[];
	[prose: string]: unknown;
}

/** Read the exempt list. THROWS — a missing list must be red, never "no rules". */
export function loadCoverageExempt(): CoverageExemptList {
	const path = join(REPO_ROOT, COVERAGE_EXEMPT_PATH);
	let parsed: CoverageExemptList;
	try {
		parsed = JSON.parse(readFileSync(path, 'utf-8')) as CoverageExemptList;
	} catch (error) {
		throw new Error(
			`crap_baseline: ${COVERAGE_EXEMPT_PATH} is missing or not valid JSON — the coverage-exemption gate cannot run without it, and it must never degrade into "nothing is exempt, nothing is checked". (${String(error)})`,
		);
	}
	if (!Array.isArray(parsed.entries) || parsed.marker !== COVERAGE_EXEMPT_MARKER) {
		throw new Error(
			`crap_baseline: ${COVERAGE_EXEMPT_PATH} is malformed (expected an "entries" array and marker "${COVERAGE_EXEMPT_MARKER}").`,
		);
	}
	return parsed;
}

export interface Drift {
	/** Files whose max complexity EXCEEDS their frozen entry (or the cap). */
	regressions: string[];
	/** Entries that no longer match reality and must be pruned or lowered. */
	stale: string[];
	/** Debt-census mismatches: functionsOverCap / filesOverCap only. */
	summary: string[];
	/** The scan itself is implausible — a broken glob or a moved root. */
	vacuity: string[];
}

export function hasDrift(drift: Drift): boolean {
	return (
		drift.regressions.length > 0 ||
		drift.stale.length > 0 ||
		drift.summary.length > 0 ||
		drift.vacuity.length > 0
	);
}

/** The one instruction most failure messages end with. */
export const FIX_COMMAND = 'bun run scripts/crap_baseline.ts --update';

/**
 * Compare a fresh measurement against the frozen baseline.
 *
 * Both directions are drift, deliberately — see this file's header.
 */
export function computeDrift(
	results: readonly FileComplexity[],
	baseline: ComplexityBaseline,
): Drift {
	const cap = baseline.cap;
	const measured = new Map(results.map((result) => [result.file, result]));
	const regressions: string[] = [];
	const stale: string[] = [];

	for (const result of results) {
		const frozen = baseline.files[result.file];
		const allowed = frozen ?? cap;
		if (result.maxComplexity > allowed) {
			const worst = result.worst;
			// A file with NO entry is a NEW over-cap file, and the remedy is NOT the
			// same: freezing it is precisely how new debt gets laundered in. Say so
			// here, so the two cases never share one misleading instruction.
			const remedy =
				frozen === undefined
					? ' — NEW over-cap file (no baseline entry): SIMPLIFY it, or freeze it deliberately with --update --allow-regression. A plain --update will REFUSE'
					: '';
			regressions.push(
				`${result.file}: max complexity ${result.maxComplexity} > allowed ${allowed}` +
					(worst
						? ` (worst: ${worst.name} at line ${worst.line}, complexity ${worst.complexity})`
						: '') +
					remedy,
			);
		}
	}

	for (const [file, allowed] of Object.entries(baseline.files).sort(([a], [b]) =>
		a < b ? -1 : a > b ? 1 : 0,
	)) {
		const result = measured.get(file);
		if (!result) {
			stale.push(`${file}: listed in the baseline but no longer present in ${SCAN_ROOT}`);
			continue;
		}
		if (allowed <= cap) {
			stale.push(
				`${file}: entry ${allowed} is at or under the cap ${cap} — it should not be listed`,
			);
			continue;
		}
		if (result.maxComplexity < allowed) {
			stale.push(
				`${file}: entry ${allowed} but the file now measures ${result.maxComplexity} — the ratchet must match reality`,
			);
		}
	}

	const fresh = summarize(results);
	// ONLY the debt numbers are asserted. `files` and `functions` are advisory —
	// see the header: they carry no complexity information, and freezing them made
	// every added or removed helper red with a blanket regeneration as its remedy.
	const summary: string[] = [];
	for (const key of ['functionsOverCap', 'filesOverCap'] as const) {
		const recorded = baseline.summary?.[key];
		if (recorded !== fresh[key])
			summary.push(`summary.${key}: baseline ${recorded} vs measured ${fresh[key]}`);
	}

	// Vacuity is what the census used to guard. Guard it directly, against the
	// MEASUREMENT rather than against the artifact, so a vacuous regeneration
	// cannot make a vacuous check green (the artifact would agree with itself).
	const vacuity: string[] = [];
	if (fresh.files < CENSUS_FLOORS.files)
		vacuity.push(
			`only ${fresh.files} files measured under ${SCAN_ROOT} (floor ${CENSUS_FLOORS.files}) — the scan root moved, the glob broke, or the tree is not checked out. Fix the scanner, never the floor.`,
		);
	if (fresh.functions < CENSUS_FLOORS.functions)
		vacuity.push(
			`only ${fresh.functions} functions measured under ${SCAN_ROOT} (floor ${CENSUS_FLOORS.functions}) — a parser returning no function nodes makes every check here green while checking nothing.`,
		);

	return { regressions, stale, summary, vacuity };
}

/** Human-readable drift report, ready to print or embed in a test message. */
export function formatDrift(drift: Drift): string {
	const lines: string[] = [];
	if (drift.regressions.length > 0) {
		lines.push(
			`COMPLEXITY REGRESSION (${drift.regressions.length}) — a function got MORE complex than the frozen baseline. Split it; do NOT raise the number:`,
		);
		for (const entry of drift.regressions) lines.push(`  + ${entry}`);
	}
	if (drift.stale.length > 0) {
		lines.push(
			`STALE BASELINE ENTRIES (${drift.stale.length}) — these no longer match reality; a too-high entry lets the file silently regress back up. Prune with \`${FIX_COMMAND}\`:`,
		);
		for (const entry of drift.stale) lines.push(`  - ${entry}`);
	}
	if (drift.summary.length > 0) {
		lines.push(
			`DEBT CENSUS MISMATCH (${drift.summary.length}) — the frozen count of over-cap FUNCTIONS/FILES disagrees with the measurement. This is what catches a new over-cap function hiding under an already-listed file's max. If it GREW, simplify; if it fell, re-freeze:`,
		);
		for (const entry of drift.summary) lines.push(`  ! ${entry}`);
	}
	if (drift.vacuity.length > 0) {
		lines.push(
			`VACUOUS SCAN (${drift.vacuity.length}) — the measurement is too small to mean anything, so every other check here is trivially green:`,
		);
		for (const entry of drift.vacuity) lines.push(`  # ${entry}`);
	}
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function serialize(baseline: ComplexityBaseline): string {
	return `${JSON.stringify(baseline, null, '\t')}\n`;
}

/**
 * The committed baseline in THREE states — never a null that means "compare
 * against nothing" (P2-18 / GATE-22, second round). The first draft returned
 * null on ANY load failure and `--update` then skipped `raisedEntries` and
 * opened a fresh one-line ledger AT the measurement: a merge-conflicted file
 * (unparseable JSON) DISABLED the guard, so "resolve the conflict by running
 * the fix command" froze whatever src/core had grown to, reason-less.
 *   - `present`: the parsed, validated artifact;
 *   - `absent`: no file — a bootstrap, compared against the EMPTY baseline
 *     (every over-cap file is new, the counters grow from 0), so it takes
 *     --allow-regression --reason like any other growth;
 *   - `unparseable`: a file that is not the artifact — the generator REFUSES.
 * Only the --update path may consume this; every read path that GATES uses
 * loadBaseline(), which throws.
 */
export type PreviousBaseline =
	| { kind: 'present'; baseline: ComplexityBaseline }
	| { kind: 'absent' }
	| { kind: 'unparseable'; error: string };

export function readPreviousBaseline(path = join(REPO_ROOT, BASELINE_PATH)): PreviousBaseline {
	if (!existsSync(path)) return { kind: 'absent' };
	try {
		return { kind: 'present', baseline: loadBaseline(path) };
	} catch (error) {
		return { kind: 'unparseable', error: String(error) };
	}
}

/** The baseline a bootstrap is compared against: no files, no debt, the birth line. */
function emptyBaseline(): ComplexityBaseline {
	return {
		_: '',
		generated: '',
		cap: COMPLEXITY_CAP,
		root: SCAN_ROOT,
		summary: { files: 0, functions: 0, functionsOverCap: 0, filesOverCap: 0 },
		ledger: [{ ...LEDGER_BIRTH }],
		files: {},
	};
}

/** Entries the new baseline would RAISE, or add above the cap. Message text. */
export function raisedEntries(previous: ComplexityBaseline, next: ComplexityBaseline): string[] {
	const raised: string[] = [];
	for (const [file, value] of Object.entries(next.files).sort(([a], [b]) =>
		a < b ? -1 : a > b ? 1 : 0,
	)) {
		const before = previous.files[file];
		if (before === undefined) {
			raised.push(`${file}: NEW over-cap file at ${value} (cap ${COMPLEXITY_CAP})`);
		} else if (value > before) {
			raised.push(`${file}: ${before} -> ${value}`);
		}
	}

	// THE SUMMARY COUNTERS ARE PART OF THE GUARD (P2-18 / GATE-07).
	//
	// The loop above compares each file's MAXIMUM complexity plus "new over-cap
	// file". It cannot see the case the census exists for: a NEW over-cap
	// function appearing UNDER a file that is already listed, whose max does not
	// move. That is why the frozen debt grew — measured across this ratchet's
	// life, functionsOverCap went 672 -> 701 -> 697 -> 702 -> 691, a net +19
	// over-cap functions and +1 over-cap file since the day it was created.
	//
	// Worse, the census leg's failure message named the FLAGLESS regeneration as
	// the remedy, so the reflex path WAS the laundering path. These counters are
	// asserted here, where `--update` has to clear them too.
	for (const counter of ['functionsOverCap', 'filesOverCap'] as const) {
		const before = previous.summary[counter];
		const after = next.summary[counter];
		if (typeof before === 'number' && typeof after === 'number' && after > before) {
			raised.push(
				`summary.${counter}: ${before} -> ${after} — a new over-cap ${
					counter === 'functionsOverCap' ? 'FUNCTION' : 'FILE'
				} appeared. If it hides under a file already at its frozen max, no per-file ` +
					'entry moves and only this counter says so.',
			);
		}
	}
	return raised;
}

/** What `--update` decided: a refusal (message, exit 1) or the baseline to write. */
export type UpdateDecision =
	| { kind: 'refuse'; message: string }
	| { kind: 'write'; baseline: ComplexityBaseline };

/**
 * THE --update DECISION, pure and exported so the gate proves the OUTCOME on
 * constructed fixtures — a conflicted file, a missing file, a growth with and
 * without a reason — instead of grepping the block that calls it.
 *
 * THE ANTI-LAUNDERING GUARD. Every failure message points at --update, so
 * --update must never be able to absorb growth by itself: a shrink-only
 * ratchet whose regeneration silently raises entries is not a ratchet. A
 * regression is a DECISION, and the decision's reason lives in the artifact
 * (the ledger), not in a commit message no gate reads. The writer refuses what
 * the gate would refuse — one predicate (`ledgerProblems`), two doors.
 */
export function updateDecision(
	previous: PreviousBaseline,
	measured: ComplexityBaseline,
	options: { allowRegression: boolean; reason: string | null; today: string },
): UpdateDecision {
	if (previous.kind === 'unparseable') {
		return {
			kind: 'refuse',
			message: [
				`REFUSING to write ${BASELINE_PATH}: the file exists but is not the artifact — ${previous.error}`,
				'A conflict marker or a truncated merge is not "no baseline": resolve the file to the version you mean (the merge-base copy, or one side), then re-run. The generator never compares against a baseline it could not read.',
			].join('\n'),
		};
	}
	const reference = previous.kind === 'present' ? previous.baseline : emptyBaseline();
	const raised = raisedEntries(reference, measured);
	if (!options.allowRegression) {
		if (raised.length > 0) {
			return {
				kind: 'refuse',
				message: [
					`REFUSING to write ${BASELINE_PATH}: this would RAISE ${raised.length} entr${raised.length === 1 ? 'y' : 'ies'} — i.e. freeze a complexity INCREASE${previous.kind === 'absent' ? ' (there is no committed baseline: every over-cap file is new)' : ''}. That is the one thing this ratchet exists to stop, and it must never happen as a side effect of "the gate was red so I ran the fix command".`,
					...raised.map((entry) => `  ^ ${entry}`),
					'',
					'Two legitimate answers, and only two:',
					'  (a) SIMPLIFY the function — split it, extract the branchy part; then --update writes cleanly;',
					`  (b) if the complexity is genuinely irreducible, say so out loud: ${FIX_COMMAND} --allow-regression --reason "<why>" — the reason is written into the baseline ledger, where the gate reads it, and the raised number is a visible, reviewable diff.`,
				].join('\n'),
			};
		}
	}
	if (options.allowRegression) {
		const problem =
			options.reason === null
				? 'none given'
				: thinReasonProblem(options.reason, LEDGER_REASON_MIN_WORDS);
		if (problem !== null) {
			return {
				kind: 'refuse',
				message: `REFUSING: --allow-regression needs --reason "<text>": ${problem}. A reason names the IRREDUCIBLE structure that forces the growth (at least ${LEDGER_REASON_MIN_WORDS} words; "temporary" and "later" are not reasons). It is written into ${BASELINE_PATH}'s ledger.`,
			};
		}
	}
	const baseline = appendLedger(
		reference,
		measured,
		options.reason,
		options.today,
		raised.length > 0,
	);
	const ledgerRed = ledgerProblems(baseline);
	if (ledgerRed.length > 0) {
		return {
			kind: 'refuse',
			message: [
				`REFUSING to write ${BASELINE_PATH}: its ledger would not pass the gate:`,
				...ledgerRed.map((line) => `  ^ ${line}`),
			].join('\n'),
		};
	}
	return { kind: 'write', baseline };
}

/**
 * The artifact at a git revision, for `--check --reference <rev>`. Throws when
 * the revision or the file cannot be read: an EXPLICIT reference that cannot be
 * resolved is a red gate, never a skipped leg.
 *
 * A value that names an EXISTING FILE is read as the reference artifact itself
 * (the gate's scratch probes, like `--baseline <path>`): that is how the
 * `--check --reference` EXIT CODE is proved on a rewritten history without
 * planting objects in the repository. CI passes a merge-base sha, never a path.
 */
export function loadReferenceBaseline(rev: string): ComplexityBaseline {
	if (rev.trim() === '') {
		// `git show ':<path>'` reads the INDEX, so an empty reference compared the
		// working tree against itself and every prefix leg was vacuous — exactly
		// what `--reference "$(git merge-base …)"` produces when merge-base fails.
		throw new Error(
			`crap_baseline: --reference is empty — the caller's revision lookup (merge-base, base branch fetch) produced nothing. An explicit reference that does not resolve is a red gate, not a comparison against the index.`,
		);
	}
	if (existsSync(rev) && statSync(rev).isFile()) {
		return JSON.parse(readFileSync(rev, 'utf-8')) as ComplexityBaseline;
	}
	const proc = Bun.spawnSync(['git', 'show', `${rev}:${BASELINE_PATH}`], {
		cwd: REPO_ROOT,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	if (proc.exitCode !== 0) {
		throw new Error(
			`crap_baseline: cannot read ${BASELINE_PATH} at --reference ${rev}: ${proc.stderr.toString().trim()}. An explicit reference that does not resolve is a red gate, not a skipped one.`,
		);
	}
	return JSON.parse(proc.stdout.toString()) as ComplexityBaseline;
}

/** The `--reference <rev>` (or `--reference=<rev>`) argument, or null when absent. */
export function readReferenceArg(argv: readonly string[]): string | null {
	const value = readFlagValue(argv, '--reference');
	const named = argv.some((arg) => arg === '--reference' || arg.startsWith('--reference='));
	if (named && (value === null || value.trim() === '')) {
		// The flag was GIVEN and its value is missing or blank (an unquoted
		// `$(git merge-base …)` that printed nothing): that is an explicit reference
		// that did not resolve, never "no reference asked for".
		throw new Error(
			'crap_baseline: --reference was given without a revision — an explicit reference that does not resolve is a red gate, not an absent one.',
		);
	}
	return value;
}

function main(): number {
	const args = new Set(process.argv.slice(2));
	const update = args.has('--update');
	const check = args.has('--check');
	const report = args.has('--report');
	const allowRegression = args.has('--allow-regression');
	const reason = readReasonArg(process.argv.slice(2));
	const referenceRev = readReferenceArg(process.argv.slice(2));
	// `--baseline <path>`: the artifact to read (and on --update, write) instead
	// of the committed one — for the gate's subprocess probes over a scratch
	// copy (a conflict marker, a missing file). CI never passes it.
	const baselinePath =
		readFlagValue(process.argv.slice(2), '--baseline') ?? join(REPO_ROOT, BASELINE_PATH);

	if (!update && !check && !report) {
		console.error(
			[
				'usage: bun run scripts/crap_baseline.ts (--check [--reference <git-rev>] | --update [--allow-regression --reason "<text>"] | --report)',
				'  --check   compare src/core/ against the frozen baseline; exit 1 on any drift',
				'  --update  rewrite engineering/crap_complexity_baseline.json from the measurement',
				'  --report  print the census and the worst offenders; never fails',
				'  --allow-regression  with --update: permit RAISING an entry or freezing a new',
				'                      over-cap file. Without it --update may only lower or remove.',
				'  --reason "<text>"   with --allow-regression: WHY the debt grows, written into the',
				'                      baseline ledger where the gate reads it (a commit message is not).',
				'  --reference <rev>   with --check: ALSO prove the ledger is append-only against the',
				'                      artifact at that git revision (the merge-base, where history exists;',
				"                      an existing file path is read as the artifact — the gate's probes).",
				'  --baseline <path>   read/write the artifact at <path> instead of the committed one',
				"                      (the gate's scratch probes; never passed by CI).",
			].join('\n'),
		);
		return 2;
	}

	const results = measure();
	const census = summarize(results);

	if (report) {
		console.log(
			`src/core/: ${census.files} files, ${census.functions} functions, ${census.functionsOverCap} over complexity ${COMPLEXITY_CAP} across ${census.filesOverCap} files.`,
		);
		const worst = [...results]
			.filter((result) => result.worst !== null)
			.sort((a, b) => b.maxComplexity - a.maxComplexity || a.file.localeCompare(b.file))
			.slice(0, 20);
		for (const result of worst) {
			console.log(
				`  ${String(result.maxComplexity).padStart(4)}  ${result.file}  (${result.worst?.name})`,
			);
		}
		if (!update && !check) return 0;
	}

	if (update) {
		// The decision is `updateDecision` — pure, exported, proved by the gate on
		// a conflicted file, a missing file and a growth. This block carries it out.
		const decision = updateDecision(readPreviousBaseline(baselinePath), buildBaseline(results), {
			allowRegression,
			reason,
			today: new Date().toISOString().slice(0, 10),
		});
		if (decision.kind === 'refuse') {
			console.error(decision.message);
			return 1;
		}
		writeFileSync(baselinePath, serialize(decision.baseline), 'utf-8');
		console.log(
			`wrote ${baselinePath === join(REPO_ROOT, BASELINE_PATH) ? BASELINE_PATH : baselinePath}: ${Object.keys(decision.baseline.files).length} files over complexity ${COMPLEXITY_CAP} (of ${census.files} scanned, ${census.functions} functions, ${census.functionsOverCap} functions over cap).`,
		);
		return 0;
	}

	const committed = loadBaseline(baselinePath);
	const ledgerRed = ledgerProblems(committed);
	if (referenceRev !== null) {
		// Where history exists, prove append-only against it (verify.ts: the
		// merge-base; hermetic.sh: the fetched base tip / first parent). An
		// unresolvable or EMPTY reference throws: loud, never skipped.
		ledgerRed.push(...ledgerPrefixProblems(loadReferenceBaseline(referenceRev), committed));
	}
	if (ledgerRed.length > 0) {
		console.error(
			[
				'DEBT LEDGER (the history inside the baseline) is inconsistent:',
				...ledgerRed.map((line) => `  ! ${line}`),
			].join('\n'),
		);
		return 1;
	}
	const drift = computeDrift(results, committed);
	if (!hasDrift(drift)) {
		console.log(
			`crap baseline clean: ${census.files} files, ${census.functions} functions, ${census.functionsOverCap} over complexity ${COMPLEXITY_CAP}.`,
		);
		return 0;
	}
	console.error(formatDrift(drift));
	console.error(
		`\nIf the change legitimately LOWERED complexity, regenerate and commit the baseline: ${FIX_COMMAND}`,
	);
	return 1;
}

if (import.meta.main) process.exit(main());
