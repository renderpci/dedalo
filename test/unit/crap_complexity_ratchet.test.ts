/**
 * CYCLOMATIC-COMPLEXITY RATCHET — src/core/ may only get simpler.
 *
 * CRAP(m) = comp² × (1 − cov)³ + comp. At full coverage that collapses to
 * CRAP = comp, so a "CRAP ≤ 6" rule IS a hard CYCLOMATIC cap of 6 no matter how
 * well tested a function is. About a fifth of src/core/'s functions exceed 6
 * today (the exact census lives in the baseline's `summary`, not restated here
 * where it would go stale), so a flat CRAP ≤ 6 gate can NEVER pass and was
 * rejected. What is enforceable — and what this gate is — is a SHRINK-ONLY
 * RATCHET: every file over the cap is FROZEN at the complexity it has today.
 * This gate freezes the debt; it does not demand it be paid at once.
 *
 * Coverage is deliberately not an input. There is no lcov artifact in CI
 * (verified: nothing in scripts/ci/ or the workflows produces one), so the
 * original "comp < 8 OR line coverage ≥ 25%" shape cannot back a fast gate —
 * gating on a stale committed lcov would be a lie, and a gate needing an
 * 8-minute coverage run is a gate nobody runs. (For the record: wherever
 * coverage IS discussed in this project it is LINE coverage — Bun emits no
 * BRDA branch records.)
 *
 * ── ONE IMPLEMENTATION OF THE METRIC ─────────────────────────────────────────
 * This gate COMPUTES NOTHING. It imports scripts/lib/complexity.ts (the metric)
 * through scripts/crap_baseline.ts (the generator/drift checker). A second
 * implementation of complexity would make the ratchet worthless: the number the
 * gate enforces must be, by construction, the number `--update` wrote. Every
 * edge-case decision (what counts as a decision node, why `?.` and `finally`
 * do not, why module-level code belongs to no function) lives in that module's
 * header — read it there, it is not restated here.
 *
 * ── THE FOUR RULES ───────────────────────────────────────────────────────────
 *  1. SHRINK-ONLY (the forward gate): no file may EXCEED its recorded baseline
 *     max, and the frozen DEBT census (functionsOverCap / filesOverCap) may not
 *     move. A raised entry is a deliberate, reviewable diff whose commit message
 *     must say why, and `--update` refuses to write one without
 *     `--allow-regression`. Deliberately NOT asserted: the `files` and
 *     `functions` totals. They carry no complexity information, and freezing
 *     them made this gate red on ANY added or removed file — a 4-complexity
 *     helper did it — whose only offered remedy was a blanket regeneration,
 *     training exactly the reflex that could absorb a real regression.
 *  2. STALENESS (what makes it a ratchet, not a floor): a file now BELOW its
 *     entry — or an entry for a file that no longer exists — is a FAILURE.
 *     Without this the ratchet silently loosens: a file improves 19 → 5, nobody
 *     re-freezes it, and it may later regress all the way back to 19 unseen.
 *     Same posture as INLINE_SECTION_ID_MATCH_RATCHET's self-test in
 *     ws_a_tripwires.test.ts, and a deleted/moved entry is stale, never skipped.
 *  3. NEW FILES ARE CAPPED: a src/core/ file absent from the baseline may not
 *     exceed complexity 7 — it may not enter "population B", the
 *     untested-and-branchy set this whole program targets. Two legitimate
 *     answers: simplify it, or add a NAMED exemption with a substantive reason.
 *  5. NO SILENT SKIPS AT THE DISCOVERY LAYER: the set of source files under
 *     src/core/ that the metric does NOT measure is PINNED by name. The engine
 *     throws on anything it cannot parse, but a file the glob never returned
 *     throws nothing at all — so the glob follows symlinks and dot-directories
 *     (this repo has a symlink culture), and everything left over is listed.
 *  6. THE COVERAGE-EXEMPT LIST (2026-08-11, part three of the ratchet — its own
 *     describe at the bottom of this file, with its own header): which src/core/
 *     functions no gate may EXECUTE and why, indexed in
 *     engineering/crap_coverage_exempt.json and MARKED next to the code. It is
 *     about LINE coverage, changes nothing about complexity, and may never be
 *     used to silence a complexity regression.
 *  4. ANTI-VACUITY FLOOR: the scan must prove it actually saw a plausible
 *     corpus. A broken glob, a moved directory or a parser returning [] would
 *     otherwise make rules 1-3 pass having checked NOTHING. This project has
 *     shipped exactly that failure before (client_libs_tripwire's history), so
 *     the floor is not hypothetical hygiene. Rule 4 also asserts the engine's
 *     LOUD-FAILURE posture directly: an unparseable file THROWS, it is never
 *     skipped — a skipped file is a file outside the gate.
 *
 * ── HONEST LIMITATIONS (stated, not hidden) ──────────────────────────────────
 *  - THIS IS NOT A CRAP SCORE, and no coverage is measured anywhere in it. The
 *    cap is derived from CRAP's BEST CASE (cov = 1); this tree sits at ~85%
 *    LINE coverage, so the gate is strictly WEAKER than a real CRAP ≤ 6 (a
 *    comp-6 function at 50% coverage scores CRAP 10.5, at 0% it scores 42).
 *    The naming is historical: what is enforced is cyclomatic complexity.
 *  - IT COVERS src/core/ ONLY, and inside it `*.ts` only. src/ai, src/config,
 *    src/diffusion, src/external, tools/, scripts/ (including the metric and
 *    generator this gate imports), publication/ and client/ are UNGATED — a new
 *    branchy module in any of them passes untouched. Non-.ts source inside
 *    src/core is enumerated and PINNED below rather than silently dropped.
 *  - IT CANNOT SEE A SPLIT. Move a 19-complexity function out of a listed file
 *    into a brand-new one: the old entry goes stale, the new file trips rule 3,
 *    and a regeneration makes both green with functionsOverCap unmoved. Nothing
 *    here distinguishes that from a genuine improvement — only the baseline
 *    diff and a reviewer do. `--update` refusing to RAISE an entry without an
 *    explicit `--allow-regression` is what keeps the regeneration honest.
 *  - Rule 3 is strictly weaker than rule 1 today and is a statement of the
 *    ENTRY rule rather than an independent net: an unlisted file at 7 already
 *    fails rule 1 at cap 6, and once `--update` freezes a new branchy file it
 *    is no longer "absent from the baseline" for either rule. What rule 3 buys
 *    is that the unthinking path is red BEFORE regeneration, with a message
 *    that names the two legitimate answers; what makes a regeneration visible
 *    is the baseline diff itself plus rule 1's census assertion.
 *  - The baseline is keyed by FILE (max complexity), so a NEW function below an
 *    already-listed file's max does not move that file's max. It is caught
 *    instead by the census (summary.functionsOverCap counts FUNCTIONS), which
 *    rule 1 asserts.
 *
 * HERMETIC: AST-only. No DB, no network, no coverage artifact, no clock, no
 * randomness — it imports nothing from src/, so the config catalog is never
 * even loaded. Every path it reads is version-controlled, so it runs on a bare
 * clone, and the whole scan is well under a second.
 *
 * Registered in engineering/TRIPWIRES.md + scripts/verify.ts + scripts/ci/hermetic.sh.
 */

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	BASELINE_PATH,
	CENSUS_FLOORS,
	COVERAGE_EXEMPT_MARKER,
	COVERAGE_EXEMPT_PATH,
	computeDrift,
	FIX_COMMAND,
	formatDrift,
	loadBaseline,
	loadCoverageExempt,
	measure,
	RESCUED_CLASS,
	SCAN_ROOT,
	unmeasuredSources,
} from '../../scripts/crap_baseline.ts';
import { analyzeFile, COMPLEXITY_CAP, summarize } from '../../scripts/lib/complexity.ts';

/**
 * ONE scan, shared by all four tests. `measure()` throws on any unreadable or
 * unparseable file, and `loadBaseline()` throws on a missing or malformed
 * baseline — a missing baseline must fail the gate, never degrade into "no
 * constraints". Both throws happen HERE, at module load, so they surface as a
 * loud failure of the whole file rather than as a quiet green.
 */
const RESULTS = measure();
const BASELINE = loadBaseline();
const DRIFT = computeDrift(RESULTS, BASELINE);

/** Shared framing for the failure messages — the thing a reader gets wrong first. */
const METRIC_NOTE =
	'This is CYCLOMATIC COMPLEXITY (CRAP == comp at full coverage, so "CRAP <= 6" IS a cyclomatic cap of 6). ' +
	`~20% of src/core/'s functions exceed ${COMPLEXITY_CAP} by construction, so a flat cap is unreachable: this gate FREEZES that debt rather than demanding it be paid at once.`;

// ---------------------------------------------------------------------------
// 1. SHRINK-ONLY — the forward gate.
// ---------------------------------------------------------------------------

describe('crap ratchet — src/core/ complexity may only shrink', () => {
	test('no file exceeds its frozen baseline max', () => {
		expect(
			DRIFT.regressions,
			`COMPLEXITY GREW past the frozen baseline in ${SCAN_ROOT}. ${METRIC_NOTE}\n` +
				`Each line names the file, its recorded value, the new value, and the offending function with its line:\n${formatDrift({ ...DRIFT, stale: [], summary: [], vacuity: [] })}\n` +
				`Two legitimate answers, and only two: SIMPLIFY the function (split it; extract the branchy part), or RAISE that file's entry DELIBERATELY — edit nothing by hand, run \`${FIX_COMMAND} --allow-regression\` (a plain \`${FIX_COMMAND}\` REFUSES to raise an entry, precisely so a red gate cannot be cleared by reflex), commit ${BASELINE_PATH} in the same change, and state in the commit message WHY the function had to get more complex. Never raise a number to get green.`,
		).toEqual([]);

		// The per-file max cannot see a NEW over-cap function added below an
		// already-listed file's maximum. The DEBT census counts FUNCTIONS, so it can.
		expect(
			DRIFT.summary,
			`FROZEN DEBT CENSUS MISMATCH: the baseline's count of over-cap functions/files disagrees with the measurement. ${METRIC_NOTE}\n${formatDrift({ ...DRIFT, regressions: [], stale: [], vacuity: [] })}\n` +
				`If functionsOverCap GREW, a new over-cap function was added (this is what catches one hiding under an already-listed file's max) — simplify it. If it FELL, the change legitimately improved things: re-freeze with \`${FIX_COMMAND}\`. Only the DEBT numbers are frozen: the plain file/function totals are advisory, so adding or deleting an ordinary file never lands you here.`,
		).toEqual([]);
	});

	// -----------------------------------------------------------------------
	// 2. STALENESS SELF-TEST — what makes this a ratchet rather than a floor.
	// -----------------------------------------------------------------------

	test('ratchet stays honest — no stale entries above reality, and none for files that are gone (staleness self-test)', () => {
		// Precedent: ws_a_tripwires.test.ts's INLINE_SECTION_ID_MATCH_RATCHET
		// self-test. A stale entry makes the ratchet look STRICTER than it is: a
		// file simplified 19 -> 5 that keeps its 19 may climb all the way back to
		// 19 with no gate and no reviewer noticing. computeDrift classifies three
		// stale shapes: entry above the measured value, entry at/under the cap
		// (should not be listed at all), and an entry whose file no longer exists
		// in the scan — a deleted or moved file is STALE, never skipped.
		expect(
			DRIFT.stale,
			`STALE BASELINE ENTRIES in ${BASELINE_PATH} — these no longer match reality, and a too-high entry silently loosens the ratchet (an improved file could regress back to its old value undetected). ` +
				`This includes entries for files that were DELETED or MOVED.\n${formatDrift({ ...DRIFT, regressions: [], summary: [], vacuity: [] })}\n` +
				`The one command that fixes this: \`${FIX_COMMAND}\` — then commit ${BASELINE_PATH} with the change that improved the code.`,
		).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// 3. NEW FILES ARE CAPPED.
// ---------------------------------------------------------------------------

/**
 * A file arriving new in src/core/ may not be born branchy. Frozen debt is a
 * legacy fact; NEW debt is a choice.
 *
 * THIS MUST EQUAL `baseline.cap`. `computeDrift` scores an unlisted file with
 * `frozen ?? cap`, so the generator (`--check`) already refuses a new file above
 * the cap. An earlier draft set this to 7 ("< 8", the population-B threshold)
 * while the cap was 6: a file at exactly 7 then PASSED here and FAILED
 * `--check`, i.e. gate and generator disagreed on the boundary — the one
 * divergence that makes a two-tool ratchet untrustworthy. The population-B
 * threshold of 8 belonged to the coverage alternative ("comp < 8 OR coverage
 * >= 25%"), and that clause was dropped: no lcov artifact exists in CI, so
 * nothing could evaluate it honestly. With the escape hatch gone, the
 * principled number is the CRAP cap itself.
 */
const NEW_FILE_CAP = COMPLEXITY_CAP;

/**
 * NAMED exemptions — never a bare set, never a silent skip. Key = repo-relative
 * path, value = the substantive reason this file could not be written under
 * complexity ${NEW_FILE_CAP}. "Refactor is hard" and "temporary" are not
 * reasons; a reason names the irreducible structure (e.g. an exhaustive
 * dispatch over a wire enum whose arms have no shared shape).
 *
 * EMPTY BY CONSTRUCTION as of 2026-08-09 — nothing in the tree required one.
 * Adding an entry is a reviewable act; the tests below assert both that the
 * reason is substantive and that the exemption is not stale.
 */
const NEW_FILE_COMPLEXITY_EXEMPTIONS: Readonly<Record<string, string>> = {};

describe('crap ratchet — a NEW src/core/ file may not be born over the cap', () => {
	// The gate and the generator must score an unlisted file IDENTICALLY.
	// computeDrift uses `frozen ?? baseline.cap`; this rule uses NEW_FILE_CAP. If
	// they ever differ, a file at the boundary passes one and fails the other, and
	// a developer gets a red `--check` from a green suite (or worse, the reverse).
	test('the new-file cap agrees with the baseline cap the generator scores against', () => {
		expect(
			BASELINE.cap,
			`Baseline cap ${BASELINE.cap} != the cap this rule enforces (${NEW_FILE_CAP}). ` +
				'An unlisted file would then be judged differently by `bun test` and by ' +
				'`scripts/crap_baseline.ts --check`. Fix the baseline, not this assertion.',
		).toBe(NEW_FILE_CAP);
	});

	test(`files absent from the baseline stay at or under complexity ${NEW_FILE_CAP}`, () => {
		const violations: string[] = [];
		for (const result of RESULTS) {
			if (BASELINE.files[result.file] !== undefined) continue; // frozen debt, rule 1 owns it
			if (NEW_FILE_COMPLEXITY_EXEMPTIONS[result.file] !== undefined) continue;
			if (result.maxComplexity <= NEW_FILE_CAP) continue;
			const worst = result.worst;
			violations.push(
				`${result.file}: ${result.maxComplexity}` +
					(worst ? ` (${worst.name} at line ${worst.line})` : ''),
			);
		}
		expect(
			violations,
			`A NEW ${SCAN_ROOT}/ file is born over complexity ${NEW_FILE_CAP}. ${METRIC_NOTE} Frozen debt is a legacy fact; new debt is a choice, and a file at 8+ enters "population B" — the untested-and-branchy set this whole program targets.\n` +
				`Two legitimate answers, and only two: (a) SIMPLIFY it — extract the branchy part into its own named function; (b) add a NAMED entry to NEW_FILE_COMPLEXITY_EXEMPTIONS in this file with a SUBSTANTIVE reason naming the irreducible structure (an exhaustive dispatch over a wire enum, a generated table). "Temporary" or "will refactor later" is not a reason and the reason test below will reject a thin one. Do NOT add the file to ${BASELINE_PATH} to make this green.\nOffenders: ${violations.join(', ')}`,
		).toEqual([]);
	});

	test('every new-file exemption carries a substantive reason and is not stale', () => {
		// An exemption with no reason, or one for a file that no longer needs it,
		// is the same defect as a stale ratchet entry: the list looks like it is
		// doing work it is not.
		const thin: string[] = [];
		const stale: string[] = [];
		const measured = new Map(RESULTS.map((result) => [result.file, result]));
		for (const [file, reason] of Object.entries(NEW_FILE_COMPLEXITY_EXEMPTIONS)) {
			if (typeof reason !== 'string' || reason.trim().split(/\s+/).length < 8) {
				thin.push(`${file}: ${JSON.stringify(reason)}`);
			}
			const result = measured.get(file);
			if (!result) {
				stale.push(`${file}: exempted but not present in ${SCAN_ROOT} (deleted or moved)`);
			} else if (result.maxComplexity <= NEW_FILE_CAP) {
				stale.push(
					`${file}: exempted but now measures ${result.maxComplexity} (at or under ${NEW_FILE_CAP}) — the exemption is no longer needed`,
				);
			} else if (BASELINE.files[file] !== undefined) {
				stale.push(
					`${file}: exempted AND listed in ${BASELINE_PATH} — the baseline entry already governs it; delete the exemption`,
				);
			}
		}
		expect(
			thin,
			`Thin new-file exemption reason(s). A reason must name the IRREDUCIBLE structure that forces the complexity (at least a sentence); "temporary", "TODO", "hard to split" are not reasons: ${thin.join(', ')}`,
		).toEqual([]);
		expect(
			stale,
			`Stale NEW_FILE_COMPLEXITY_EXEMPTIONS entries — delete them (an exemption that no longer applies makes the gate look stricter than it is): ${stale.join(', ')}`,
		).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// 4. ANTI-VACUITY FLOOR.
// ---------------------------------------------------------------------------

/**
 * WHY THIS EXISTS: every assertion above is of the form "this list of
 * violations is empty". A broken glob, a renamed/moved src/core/, a parser
 * returning no functions, or a scan root that silently resolves to nothing
 * would make ALL of them pass having inspected NOTHING — a green gate that
 * proves the opposite of what it claims. This project has already shipped that
 * exact failure (client_libs_tripwire quietly asserting over an absent tree),
 * which is why the floor is mandatory rather than decorative.
 *
 * The floor numbers (CENSUS_FLOORS, exported by the generator so the checker
 * and this gate cannot disagree) sit deliberately far BELOW the measured census
 * so ordinary churn — deleting a module, merging two files — never trips them.
 * They are a sanity floor, not a second baseline.
 */
/** A known-branchy, long-lived core file — the canary that the scan saw real code. */
const KNOWN_BRANCHY_FILE = 'src/core/api/dispatch.ts';
const KNOWN_BRANCHY_FLOOR = 10;

describe('crap ratchet — the scan is not vacuous', () => {
	test('the measurement saw a plausible corpus, and an unparseable file fails LOUDLY', () => {
		// summarize() — the SAME aggregation the baseline and the checker use. A
		// second reduce here would be a second implementation of the census the
		// rest of the gate trusts.
		const totals = summarize(RESULTS);
		expect(
			totals.files,
			`Vacuous scan: only ${totals.files} files measured under ${SCAN_ROOT} (floor ${CENSUS_FLOORS.files}). Every "no violations" assertion in this file is meaningless at this size — the scan root moved, the glob broke, or the tree is not checked out. Fix the scanner, never the floor.`,
		).toBeGreaterThanOrEqual(CENSUS_FLOORS.files);
		expect(
			totals.functions,
			`Vacuous scan: only ${totals.functions} functions measured under ${SCAN_ROOT} (floor ${CENSUS_FLOORS.functions}). A parser that returns no function nodes makes this whole gate green while checking nothing. Fix the scanner, never the floor.`,
		).toBeGreaterThanOrEqual(CENSUS_FLOORS.functions);
		// The checker carries the same floor, so `--check` cannot be green over a
		// vacuous scan either (a vacuous regeneration would otherwise agree with
		// itself). Asserted here so the two can never drift apart.
		expect(
			DRIFT.vacuity,
			`The drift checker itself reports a vacuous measurement:\n${formatDrift({ ...DRIFT, regressions: [], stale: [], summary: [] })}`,
		).toEqual([]);

		// A named canary: the totals could in principle be met by junk, so pin one
		// long-lived, genuinely branchy file and require a non-trivial value.
		const canary = RESULTS.find((result) => result.file === KNOWN_BRANCHY_FILE);
		expect(
			canary === undefined ? null : canary.file,
			`Anti-vacuity canary missing: ${KNOWN_BRANCHY_FILE} was not in the measurement. Either the scan is not covering ${SCAN_ROOT}, or the file moved — if it genuinely moved, point KNOWN_BRANCHY_FILE at another long-lived branchy core file.`,
		).toBe(KNOWN_BRANCHY_FILE);
		expect(
			canary?.maxComplexity ?? 0,
			`Anti-vacuity canary ${KNOWN_BRANCHY_FILE} measures ${canary?.maxComplexity ?? 0}, under the floor ${KNOWN_BRANCHY_FLOOR}. A parser that produced empty/trivial function bodies would look exactly like this. Verify the measurement before touching this number.`,
		).toBeGreaterThanOrEqual(KNOWN_BRANCHY_FLOOR);
		expect(
			Object.keys(BASELINE.files).length,
			`${BASELINE_PATH} lists ${Object.keys(BASELINE.files).length} files — a baseline this small cannot be the frozen debt of a ${totals.files}-file tree. A truncated or hand-edited baseline would make the ratchet nearly free.`,
		).toBeGreaterThanOrEqual(200);

		// LOUD FAILURE, NEVER SKIP: a file the scanner cannot parse must fail the
		// gate, not be skipped — a skipped file is a file outside the gate. The
		// engine throws; this asserts that contract instead of trusting it.
		const dir = mkdtempSync(join(tmpdir(), 'crap-ratchet-'));
		try {
			const broken = join(dir, 'broken.ts');
			writeFileSync(broken, 'export function f(: { if (}\n', 'utf-8');
			expect(() => analyzeFile(broken, 'broken.ts')).toThrow();

			// A file that does not exist must throw too (never an empty result).
			expect(() => analyzeFile(join(dir, 'absent.ts'), 'absent.ts')).toThrow();

			// The plugin list is not self-validating (babel silently accepts unknown
			// plugin names), so assert the one load-bearing case behaviourally: a
			// decorated class method must PARSE. A plugin rename then shows up as a
			// red test here rather than as a mystery throw over the whole tree.
			const decorated = join(dir, 'decorated.ts');
			writeFileSync(
				decorated,
				'declare const dec: MethodDecorator;\nclass A { @dec m(x: number) { return x > 1 ? 1 : 2; } }\nexport default A;\n',
				'utf-8',
			);
			const result = analyzeFile(decorated, 'decorated.ts');
			expect(result.functionCount).toBe(1);
			expect(result.maxComplexity).toBe(2);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	// -----------------------------------------------------------------------
	// 5. WHAT THE SCAN DOES NOT MEASURE IS NAMED, NOT SILENT.
	// -----------------------------------------------------------------------

	/**
	 * Every source file under src/core/ that the metric does NOT measure —
	 * other code extensions, plus the `*.test.ts` / `*.d.ts` exclusions.
	 *
	 * WHY THIS IS A GATE AND NOT A COMMENT: "the scan root is src/core/" reads
	 * as "the directory is covered", and it is not — the metric is `*.ts` only.
	 * Left unpinned, a new `.tsx`/`.js` module (or a src/core module named
	 * `foo.test.ts`, which would be excluded by shape) would enter the tree
	 * completely outside the gate with nothing to notice it. Pinned, it arrives
	 * as a red test naming the file.
	 *
	 * EMPTY since 2026-08-16: the three entries were the tools subsystem's
	 * CLIENT-SIDE browser JS, which moved out of src/ to
	 * client/dedalo/core/tools_common/ (WC-006) — src/core is engine TypeScript
	 * and nothing else again. To add a file here you must state which it is.
	 */
	const UNMEASURED_SOURCE_UNDER_SCAN_ROOT: string[] = [];

	test('the source under the scan root that is NOT measured is exactly the named set', () => {
		expect(
			unmeasuredSources(),
			`The set of source files under ${SCAN_ROOT} that this metric does NOT measure has changed. The scan measures *.ts only (minus *.test.ts and *.d.ts), so anything listed here is OUTSIDE the ratchet — which is fine only while it is DISCLOSED. ` +
				`If a new .tsx/.mts/.js module appeared: either bring it into the metric (scripts/lib/complexity.ts MEASURED_EXTENSION) or add it to UNMEASURED_SOURCE_UNDER_SCAN_ROOT in this file with a note saying what it is. If a src/core module was named *.test.ts, rename it — that suffix is an undetectable escape hatch. Never delete this assertion to get green.`,
		).toEqual(UNMEASURED_SOURCE_UNDER_SCAN_ROOT);
	});
});

// ---------------------------------------------------------------------------
// 6. THE COVERAGE-EXEMPT LIST — part three of the ratchet.
// ---------------------------------------------------------------------------

/**
 * WHAT THIS PART ADDS. Rules 1-5 above freeze CYCLOMATIC COMPLEXITY. They say
 * nothing about whether a function is exercised at all — and they cannot: there
 * is no lcov artifact in CI, and any COVERAGE figure discussed in this project
 * is LINE coverage, because Bun emits no BRDA branch records. So a src/core/
 * function absent from every suite raises a question this gate answers by
 * SHAPE rather than by measurement: is that a gap, or a decision?
 * `engineering/crap_coverage_exempt.json` is where a DECISION is recorded, with
 * a reason, and this describe is what makes the record honest.
 *
 * PER DEC-12, THE REASON MUST LIVE NEXT TO THE CODE. An invariant stated only in
 * a list is an invariant without a gate, so the load-bearing assertion here is
 * the MARKER check: the exempt source file must carry `COVERAGE-EXEMPT` next to
 * the exempted symbol. The JSON is the index over those markers, not a substitute
 * for them.
 *
 * IT IS NOT A SILENCER, AND THE GATE ENFORCES THAT. An exemption is for code that
 * CANNOT be covered (it destroys something no scratch surface contains, or it has
 * no decision to assert). It is never a way to quiet a complexity regression: as
 * of 2026-08-11 the ratchet is RED on three files from commit d1f5652783
 * (dd_component_portal_api.ts, ts_object/search.ts, ts_object/ts_api.ts) and
 * those three are deliberately ABSENT from the list. The rule is general — no
 * file currently reporting a regression above may hold an exemption — so nobody
 * can clear a red ratchet by writing a paragraph here.
 *
 * WHAT IT CANNOT DO, said plainly: it cannot verify that a listed function is
 * genuinely uncovered, nor that an unlisted one is covered. That needs the
 * coverage run this project deliberately does not gate on.
 */
describe('crap ratchet — the COVERAGE-EXEMPT list is named, reasoned, marked and honest', () => {
	const EXEMPT = loadCoverageExempt();
	/** Anti-vacuity: a truncated list would make every check below trivially green. */
	const MIN_ENTRIES = 20;
	/** Words that are not a reason. A reason names the irreducible structure. */
	const THIN_REASONS = /\b(todo|temporar|later|hard to test|no time|refactor soon)\b/i;

	test('the list is a plausible corpus (a truncated list checks nothing)', () => {
		expect(
			EXEMPT.entries.length,
			`${COVERAGE_EXEMPT_PATH} holds ${EXEMPT.entries.length} entries — below the floor ${MIN_ENTRIES}. Every assertion in this describe iterates the list, so a truncated or emptied file makes them all pass having inspected nothing. Restore the list; never lower the floor.`,
		).toBeGreaterThanOrEqual(MIN_ENTRIES);
	});

	test('every entry names a real file and symbol, is unique, and carries a substantive reason', () => {
		const problems: string[] = [];
		const seen = new Set<string>();
		for (const entry of EXEMPT.entries) {
			const key = `${entry.file}::${entry.symbol}`;
			if (seen.has(key)) problems.push(`${key}: DUPLICATE entry`);
			seen.add(key);
			if (!entry.file.startsWith(`${SCAN_ROOT}/`)) {
				problems.push(
					`${key}: file is outside ${SCAN_ROOT}/ — this list covers the scan root only`,
				);
				continue;
			}
			let source: string;
			try {
				source = readFileSync(entry.file, 'utf-8');
			} catch {
				problems.push(`${key}: file does not exist (deleted or moved) — the entry is STALE`);
				continue;
			}
			if (!source.includes(entry.symbol)) {
				problems.push(
					`${key}: symbol not found in the file — renamed or removed, the entry is STALE`,
				);
			}
			const reason = typeof entry.reason === 'string' ? entry.reason.trim() : '';
			if (reason.split(/\s+/).length < 12 || THIN_REASONS.test(reason)) {
				problems.push(`${key}: THIN reason ${JSON.stringify(reason)}`);
			}
			if (typeof entry.class !== 'string' || entry.class.trim() === '') {
				problems.push(`${key}: no class`);
			}
		}
		expect(
			problems,
			`${COVERAGE_EXEMPT_PATH} is stale or thin. This list records which src/core/ functions no test may execute, and why — it is about LINE COVERAGE (Bun emits no BRDA records, so nothing in this repo measures branch coverage) and has NO effect on the complexity ratchet. A reason must name the IRREDUCIBLE structure: what executing the function would destroy, or why there is no decision to assert. "Temporary" and "hard to test" are not reasons. If a symbol was renamed or deleted, update or remove the entry — a stale exemption makes the list look like it is doing work it is not.\n  ${problems.join('\n  ')}`,
		).toEqual([]);
	});

	test(`the reason lives NEXT TO THE CODE — every exempt file carries the ${COVERAGE_EXEMPT_MARKER} marker`, () => {
		// THE LOAD-BEARING ONE (DEC-12). A reason readable only in engineering/ is
		// invisible to the person editing the function, which is exactly who needs
		// it. The JSON indexes the markers; it does not replace them.
		const unmarked: string[] = [];
		for (const entry of EXEMPT.entries) {
			if (entry.class === RESCUED_CLASS) continue; // handled by its own test below
			let source: string;
			try {
				source = readFileSync(entry.file, 'utf-8');
			} catch {
				continue; // already reported as stale above
			}
			if (!source.includes(COVERAGE_EXEMPT_MARKER)) {
				unmarked.push(`${entry.file}::${entry.symbol}`);
			}
		}
		expect(
			unmarked,
			`These exempt files carry no ${COVERAGE_EXEMPT_MARKER} marker. Per DEC-12 an invariant stated without a mechanical gate is prohibited, and an exemption stated only in ${COVERAGE_EXEMPT_PATH} is exactly that: place the reason in a comment ON the function, then this gate holds the two together. (Again: this is LINE-coverage bookkeeping, not a complexity rule.)\n  ${unmarked.join('\n  ')}`,
		).toEqual([]);
	});

	test('a RESCUED entry is a tombstone: it carries no exemption marker and stays classified as not exempt', () => {
		// The critics pulled buildPublicationApiValue back OUT of the exempt list:
		// its whole-body catch is an error-envelope CHOICE with a wrong-output
		// consequence (defect D7), not adapter plumbing. It stays in the file as a
		// tombstone so nobody re-exempts it, and this asserts the tombstone did not
		// quietly become an exemption.
		const rescued = EXEMPT.entries.filter((entry) => entry.class === RESCUED_CLASS);
		expect(
			rescued.length,
			`No ${RESCUED_CLASS} entry left in ${COVERAGE_EXEMPT_PATH}. The rescued shells are the ones most likely to be re-proposed as exemptions; keeping the tombstone is what stops that.`,
		).toBeGreaterThanOrEqual(1);
		const wrong: string[] = [];
		for (const entry of rescued) {
			const source = readFileSync(entry.file, 'utf-8');
			if (source.includes(COVERAGE_EXEMPT_MARKER)) {
				wrong.push(
					`${entry.file}::${entry.symbol}: carries a ${COVERAGE_EXEMPT_MARKER} marker although it was RESCUED from the exempt list — a shell that turned out to hold a decision must NOT carry an exemption`,
				);
			}
			if (!source.includes('RESCUED')) {
				wrong.push(
					`${entry.file}::${entry.symbol}: the ledger line naming it as rescued (and the open defect it carries) is gone from the source`,
				);
			}
		}
		expect(wrong, wrong.join('\n  ')).toEqual([]);
	});

	test('an exemption may NOT cover a file that is currently a complexity REGRESSION', () => {
		// The one abuse this list invites. An exemption is about coverage — about
		// code no test may execute. It says nothing about complexity, and it must
		// never become the quiet way to clear a red ratchet: as of 2026-08-11 rule 1
		// is red on three files from commit d1f5652783, and the fix for that is to
		// simplify them or to raise their entry deliberately with
		// `--allow-regression`, never to write a paragraph here.
		const regressed = new Set(DRIFT.regressions.map((line) => line.split(':')[0] ?? ''));
		const abuse = EXEMPT.entries
			.filter((entry) => regressed.has(entry.file))
			.map((entry) => `${entry.file}::${entry.symbol}`);
		expect(
			abuse,
			`These files are exempt from COVERAGE and are ALSO currently over their frozen complexity max. The two are unrelated and this list may not be used to soften the first gate: an exemption is for code that CANNOT be covered, not a silencer for a legitimate complexity regression. Fix rule 1 (simplify, or \`${FIX_COMMAND} --allow-regression\` with the reason in the commit message), then re-add the coverage exemption if it is still true.\n  ${abuse.join('\n  ')}`,
		).toEqual([]);
	});
});
