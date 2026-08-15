/**
 * UNTYPED-THROW RATCHET — `throw new Error(` in src/ and tools/ may only SHRINK.
 *
 * ── WHAT IT GUARDS ───────────────────────────────────────────────────────────
 * The engine's failure signal is being retyped (error-taxonomy plan, decision 4
 * "middle"): every NON-internal failure (caller / auth / permission / not_found
 * / conflict / limit / unavailable) gets a REGISTERED CODE that the converter
 * turns into the v2 envelope, a status, and a label; only genuine engine
 * invariants may remain as bare `throw new Error(...)`. At the P0 freeze the
 * tree held ~430 such sites — the plan's ~409 grep count plus the 18 grep
 * silently dropped in its "binary" files (the exact census lives in the baseline's
 * `summary`, not restated here where it would go stale). A flat "zero untyped
 * throws" gate can therefore not pass today, and was not proposed. What is
 * enforceable — and what this gate is — is a SHRINK-ONLY RATCHET: every file is
 * FROZEN at the count it has today and may only go down; a new file starts at
 * ZERO. This gate freezes the debt; the P3 burn-down pays it.
 *
 * ── ONE IMPLEMENTATION OF THE COUNT ──────────────────────────────────────────
 * This gate COMPUTES NOTHING. It imports scripts/lib/throw_census.ts (the
 * census) through scripts/error_throw_baseline.ts (the generator/drift
 * checker). A second count would make the ratchet worthless: the number the
 * gate enforces must be, by construction, the number the generator wrote.
 * Every counting decision (what the token is, why comments AND string
 * contents are blanked first, why TypeError/RangeError are a separate
 * informational metric, why the census reads files itself and NEVER shells out
 * to grep) lives in that module's header — read it there.
 *
 * ── THE RULES (mirrored from crap_complexity_ratchet) ────────────────────────
 *  1. SHRINK-ONLY: no file may EXCEED its baseline entry, and the frozen debt
 *     summary (files, total) may not move. A raised entry is a deliberate,
 *     reviewable diff whose commit message must say why, and the generator
 *     REFUSES to write one without `--allow-regression`.
 *  2. STALENESS = FAILURE: a file now BELOW its entry, or an entry for a file
 *     that no longer exists, is RED — otherwise the ratchet silently loosens
 *     (a file cleaned 17 -> 3 could climb back to 17 unseen). The one fix is
 *     `bun run scripts/error_throw_baseline.ts`, committed with the change.
 *  3. NEW FILES ARE CAPPED AT 0: a file absent from the baseline may not hold
 *     a single untyped throw. Frozen debt is a legacy fact; new debt is a choice.
 *  4. ANTI-VACUITY: the scan must prove it saw a plausible corpus (a floor on
 *     files scanned), and the three files grep classifies as BINARY —
 *     src/core/media/ingest/upload.ts, src/core/identify/match.ts,
 *     src/core/search/bare_count.ts — must be present in the census with a
 *     numeric count (upload.ts > 0 today: the largest single holder). A grep-
 *     based census silently drops those three; this pin is what proves the
 *     census is not one.
 *  5. ZERO-TIER (plan §3 P3 exit): the request chokepoints, security, tools
 *     dispatch, write path, DB layer and section_id grammar must reach 0. NOT
 *     yet enforced — `ZERO_TIER_ENFORCED` (scripts/lib/throw_census.ts) is
 *     `false` at P0 and the describe below only REPORTS the per-prefix totals.
 *     Flipping it to `true` is the P3 exit criterion; the enforced check is
 *     already implemented behind the flag.
 *
 * ── HOW TO LOWER A COUNT ─────────────────────────────────────────────────────
 * Replace the bare throw with the registered-code form (`src/core/errors/`,
 * once landed — a typed throw is not counted), or delete the site; then run
 * `bun run scripts/error_throw_baseline.ts` and commit the JSON with the change.
 * Never edit the JSON by hand; never raise a number to get green.
 *
 * ── HONEST LIMITATIONS ───────────────────────────────────────────────────────
 *  - It is a TOKEN count: `throw new Error(` exactly (whitespace-tolerant).
 *    `throw err` re-throws, `new Error(` stored or returned, and every
 *    subclass/typed form are outside it by design.
 *  - It cannot see a MOVE: a site relocated into another file goes stale in one
 *    entry and trips rule 3 in the other; only the baseline diff shows it.
 *  - `*.test.ts`, `dist/`, `node_modules/`, scripts/, publication/, client/
 *    are UNGATED.
 *
 * HERMETIC: filesystem reads of tracked source only. No DB, no network, no
 * clock; imports nothing from src/.
 *
 * Registered in engineering/TRIPWIRES.md + scripts/verify.ts.
 */

import { describe, expect, test } from 'bun:test';
import {
	BASELINE_PATH,
	CORPUS_FLOOR,
	computeDrift,
	FIX_COMMAND,
	formatDrift,
	loadBaseline,
} from '../../scripts/error_throw_baseline.ts';
import {
	census,
	countThrows,
	SCAN_ROOTS,
	summarize,
	ZERO_TIER,
	ZERO_TIER_ENFORCED,
	zeroTierTotals,
} from '../../scripts/lib/throw_census.ts';

/**
 * ONE scan, shared by every test. `census()` throws on an unreadable file and
 * `loadBaseline()` on a missing/malformed baseline — both at module load, so a
 * missing baseline is a loud failure of the whole file, never "no constraints".
 */
const RESULTS = census();
const BASELINE = loadBaseline();
const DRIFT = computeDrift(RESULTS, BASELINE);
const TOTALS = summarize(RESULTS);

const WHY =
	'Untyped `throw new Error(` is the failure signal the error-taxonomy plan retires (decision 4 "middle"): non-internal failures get a REGISTERED CODE, engine invariants stay untyped under this shrink-only ratchet.';

// ---------------------------------------------------------------------------
// 1. SHRINK-ONLY — the forward gate.
// ---------------------------------------------------------------------------

describe('error_throw ratchet — untyped throws may only shrink', () => {
	test('no file exceeds its frozen baseline count (unlisted files are capped at 0)', () => {
		expect(
			DRIFT.regressions,
			`UNTYPED THROWS GREW past the frozen baseline. ${WHY}\n${formatDrift({ ...DRIFT, stale: [], summary: [], vacuity: [], zeroTier: [] })}\n` +
				`Two legitimate answers, and only two: give the failure a REGISTERED CODE (a typed throw is not counted), or RAISE that file's entry DELIBERATELY — edit nothing by hand, run \`${FIX_COMMAND} --allow-regression\` (a plain \`${FIX_COMMAND}\` REFUSES to raise an entry, so a red gate cannot be cleared by reflex), commit ${BASELINE_PATH} in the same change, and state in the commit message WHY the throw had to stay untyped. Never raise a number to get green.`,
		).toEqual([]);

		expect(
			DRIFT.summary,
			`FROZEN DEBT MISMATCH: the baseline's summary (files/total) disagrees with the measurement.\n${formatDrift({ ...DRIFT, regressions: [], stale: [], vacuity: [], zeroTier: [] })}\n` +
				`If it GREW, a new untyped throw was added — type it. If it FELL, the change improved things: re-freeze with \`${FIX_COMMAND}\`.`,
		).toEqual([]);
	});

	// -----------------------------------------------------------------------
	// 2. STALENESS SELF-TEST — what makes this a ratchet rather than a floor.
	// -----------------------------------------------------------------------

	test('ratchet stays honest — no stale entries above reality, and none for files that are gone', () => {
		expect(
			DRIFT.stale,
			`STALE BASELINE ENTRIES in ${BASELINE_PATH} — a too-high entry silently loosens the ratchet (a cleaned file could regress back to its old count undetected). This includes entries for files that were DELETED or MOVED.\n${formatDrift({ ...DRIFT, regressions: [], summary: [], vacuity: [], zeroTier: [] })}\n` +
				`The one command that fixes this: \`${FIX_COMMAND}\` — then commit ${BASELINE_PATH} with the change that improved the code.`,
		).toEqual([]);
	});

	// -----------------------------------------------------------------------
	// 3. NEW FILES ARE CAPPED AT 0 — asserted independently of the drift
	//    walk so the rule is legible on its own, with its own message.
	// -----------------------------------------------------------------------

	test('a file absent from the baseline holds ZERO untyped throws', () => {
		const born = RESULTS.filter(
			(result) => BASELINE.files[result.file] === undefined && result.untyped > 0,
		).map((result) => `${result.file}: ${result.untyped}`);
		expect(
			born,
			`A file with NO baseline entry holds untyped throws. Frozen debt is a legacy fact; new debt is a choice. ${WHY} Give each failure a registered code; do NOT add the file to ${BASELINE_PATH} to get green (a plain \`${FIX_COMMAND}\` refuses to; \`--allow-regression\` is for a stated engine invariant, with the reason in the commit message).\nOffenders: ${born.join(', ')}`,
		).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// 4. ANTI-VACUITY FLOOR + the grep-binary pins.
// ---------------------------------------------------------------------------

/**
 * grep classifies these three as binary and DROPS them from any grep-based
 * count. They are pinned here by name so the census must PROVE it read them
 * itself (readFileSync, never a shell-out). upload.ts is also the largest single
 * holder of untyped throws at the P0 freeze, so it must be > 0.
 */
const GREP_BINARY_PINS = [
	'src/core/media/ingest/upload.ts',
	'src/core/identify/match.ts',
	'src/core/search/bare_count.ts',
] as const;
const MUST_BE_POSITIVE = 'src/core/media/ingest/upload.ts';

describe('error_throw ratchet — the scan is not vacuous', () => {
	test('the census saw a plausible corpus', () => {
		expect(
			TOTALS.scanned,
			`Vacuous scan: only ${TOTALS.scanned} files scanned under ${SCAN_ROOTS.join('/, ')}/ (floor ${CORPUS_FLOOR}). Every "no violations" assertion in this file is meaningless at this size — the roots moved, the glob broke, or the tree is not checked out. Fix the scanner, never the floor.`,
		).toBeGreaterThanOrEqual(CORPUS_FLOOR);
		expect(
			DRIFT.vacuity,
			`The drift checker itself reports a vacuous measurement:\n${formatDrift({ ...DRIFT, regressions: [], stale: [], summary: [], zeroTier: [] })}`,
		).toEqual([]);
		expect(
			Object.keys(BASELINE.files).length,
			`${BASELINE_PATH} lists ${Object.keys(BASELINE.files).length} files — a baseline this small cannot be the frozen debt of a ${TOTALS.scanned}-file tree. A truncated or hand-edited baseline would make the ratchet nearly free.`,
		).toBeGreaterThanOrEqual(50);
	});

	test('the three grep-binary files are in the census with a numeric count (the census never shells out to grep)', () => {
		const byFile = new Map(RESULTS.map((result) => [result.file, result]));
		for (const pin of GREP_BINARY_PINS) {
			const entry = byFile.get(pin);
			expect(
				entry === undefined ? null : entry.file,
				`Grep-binary pin ${pin} is MISSING from the census. Either the scan is not covering it (glob/roots broke) or the census regressed to a grep-based count that drops binary-classified files. If the file genuinely moved, re-point the pin at its new path — never delete it.`,
			).toBe(pin);
			expect(Number.isInteger(entry?.untyped), `${pin}: untyped count is not an integer`).toBe(
				true,
			);
			expect(Number.isInteger(entry?.builtin), `${pin}: builtin count is not an integer`).toBe(
				true,
			);
		}
		expect(
			byFile.get(MUST_BE_POSITIVE)?.untyped ?? 0,
			`${MUST_BE_POSITIVE} counts 0 untyped throws — at the P0 freeze it was the largest holder in the tree. A reader that stops at the first NUL byte, or a stripper that swallowed the file into one string, would look exactly like this. Verify the census before touching this pin (if the file was genuinely burned down to 0 in P3, retarget MUST_BE_POSITIVE at another baseline holder).`,
		).toBeGreaterThan(0);
	});

	test('the counter is exact on the shapes it must and must not count (self-test)', () => {
		// The counting contract, asserted behaviourally so a stripper or regex
		// regression shows up here with a name rather than as a mystery drift.
		const source = [
			"throw new Error('a'); // throw new Error('in a comment')",
			'/* throw new Error("in a block") */',
			"const message = 'text says throw new Error(x)';",
			'const template = `throw new Error(${y})`;',
			"if (bad) throw  new Error ('spaced');",
			"throw new TypeError('t'); throw new RangeError('r');",
			'throw err;',
			"const stored = new Error('not thrown');",
			"const rx = /'/; throw new Error('after a regex literal');",
		].join('\n');
		expect(countThrows(source)).toEqual({ untyped: 3, builtin: 2 });
		expect(countThrows('')).toEqual({ untyped: 0, builtin: 0 });
	});
});

// ---------------------------------------------------------------------------
// 5. ZERO-TIER — reported at P0, enforced at the P3 exit.
// ---------------------------------------------------------------------------

describe('error_throw ratchet — zero-tier prefixes (plan §3 P3 exit)', () => {
	const ZT = zeroTierTotals(RESULTS);
	const ZT_TOTAL = Object.values(ZT).reduce((sum, count) => sum + count, 0);

	test("the zero-tier list is the plan's and every prefix is resolvable", () => {
		expect([...ZERO_TIER]).toEqual([
			'src/core/api/',
			'src/core/security/',
			'src/core/tools/',
			'tools/',
			'src/core/section/record/',
			'src/core/db/',
			'src/core/concepts/section_id.ts',
		]);
		// Every prefix must denote something the census actually scanned — a
		// typo here would make that prefix vacuously "at zero".
		for (const prefix of ZERO_TIER) {
			const seen = RESULTS.some((result) =>
				prefix.endsWith('/') ? result.file.startsWith(prefix) : result.file === prefix,
			);
			expect(seen, `zero-tier prefix ${prefix} matched NO scanned file — moved, or a typo`).toBe(
				true,
			);
		}
	});

	test(`zero-tier totals (informational until ZERO_TIER_ENFORCED; currently ${ZERO_TIER_ENFORCED})`, () => {
		const lines = Object.entries(ZT).map(
			([prefix, count]) => `  ${String(count).padStart(4)}  ${prefix}`,
		);
		console.log(
			`error_throw ratchet — zero-tier untyped throws (total ${ZT_TOTAL}):\n${lines.join('\n')}`,
		);
		if (!ZERO_TIER_ENFORCED) {
			// P0: report only. The assertion is that the report is well-formed —
			// every prefix present with an integer — so the P3 flip lands on a
			// test that already runs, not on a rewrite.
			for (const [prefix, count] of Object.entries(ZT)) {
				expect(Number.isInteger(count), `${prefix}: non-integer total`).toBe(true);
			}
			return;
		}
		// P3 EXIT: the enforced form. No baseline entry can excuse a zero-tier site.
		expect(
			DRIFT.zeroTier,
			`ZERO-TIER VIOLATION — these prefixes must hold ZERO untyped throws (${ZERO_TIER.join(', ')}). ${WHY} Every remaining site here must throw a registered code; no baseline entry may excuse it.\n${formatDrift({ ...DRIFT, regressions: [], stale: [], summary: [], vacuity: [] })}`,
		).toEqual([]);
		expect(ZT_TOTAL).toBe(0);
	});
});
