/**
 * GENERIC-TLD TRIPWIRE — the set of GATE files that bind a specific-install
 * ontology TLD may only SHRINK.
 *
 * ── WHAT IT GUARDS ───────────────────────────────────────────────────────────
 * AGENTS.md hard rules (2026-08-19): a test uses the generic `test` TLD and
 * BUILDS the situation it tests (src/core/test_data/situations); it never
 * binds a specific install's TLD (`numisdata`, `rsc`, `oh`, `tch`, `tchi`,
 * `ich`, `mdcat`, `zenon`, `dmm`, `cult`…). Such a gate is green on the machine
 * that holds that install's records and red on every other — the parity tier
 * was 208-red on the suite DB for exactly this reason (2026-08-18), and that
 * noise hid a real regression (WC-034 addendum, `search_options`).
 *
 * On adoption day 307 of 722 test files bound an install TLD. A flat gate
 * cannot pass; this is a SHRINK-ONLY RATCHET on the FILE SET, frozen in
 * engineering/generic_tld_baseline.json: a listed file may only lose TLDs or
 * leave the list; an unlisted file may bind NONE.
 *
 * ── ONE IMPLEMENTATION OF THE MEASURE ────────────────────────────────────────
 * This gate COMPUTES NOTHING. It imports scripts/lib/tld_census.ts (the
 * measure) through scripts/generic_tld_baseline.ts (the generator / drift
 * checker). A second implementation would make the ratchet worthless.
 *
 * ── THE RULES (mirrored from error_throw_ratchet) ─────────────────────────────
 *  1. SHRINK-ONLY: no file may bind a TLD its entry does not list; no new file
 *     may bind any. The generator REFUSES to absorb growth without
 *     `--allow-regression`; the commit message must say why.
 *  2. STALENESS = FAILURE: a file now binding fewer TLDs than its entry, or an
 *     entry for a file that is gone, is RED — otherwise the ratchet loosens
 *     silently. The one fix: `bun run scripts/generic_tld_baseline.ts`.
 *  3. NEW FILES BIND NOTHING: frozen debt is a legacy fact; new debt is a choice.
 *  4. ANTI-VACUITY: a floor on files scanned, and the token grammar is
 *     self-tested (a comment must NOT count, a string binding MUST).
 *  5. INVARIANT SANITY: `test`, `dd`, `hierarchy`, `ontology`, `ontologytype`,
 *     `lg` can never be denied — a careless INSTALL_TLDS addition cannot flip
 *     the whole suite red.
 *
 * ── HOW TO LOWER THE COUNT ───────────────────────────────────────────────────
 * Rebuild the test on the generic TLD: declare its structure as a situation
 * (`situation({tld:'zz…', nodes, records})`, ensure/drop), or use the
 * playground `test3` for what it already carries; then re-run the generator
 * and commit the JSON with the change. Never edit the JSON by hand; never add
 * a file to get green.
 *
 * ── THE MEASURED TREES (widened 2026-08-22) ──────────────────────────────────
 * `test/**\/*.test.ts` (unit + parity), `client/dedalo/test/client/js/**\/*.js`
 * (the browser suite) and `src/core/test_data/**\/*.ts` (the test-data writers)
 * — SCAN_ROOTS in scripts/lib/tld_census.ts. The last two were added after a
 * client gate (`test_additional_text_area.js`) was found binding the `dmm`
 * install's demo ontology, propped up by a `src/core/test_data` fixture that
 * PROVISIONED it, both invisible to a census that only looked at `*.test.ts`.
 * A census that cannot see a tree is not evidence about that tree.
 *
 * ── HONEST LIMITATIONS ───────────────────────────────────────────────────────
 *  - It measures TIPO tokens (`<tld><digits>`), comments blanked. A test that
 *    reaches an install's records through a helper WITHOUT naming a tipo is
 *    outside it (a helper is scanned only if it lives in a measured tree).
 *  - INSTALL_TLDS is a KNOWN list, grow-only. An install TLD nobody has named
 *    yet is not denied until it is added there.
 *  - `fixtures/` path segments are excluded everywhere (they are data, reached
 *    through gates), as is `node_modules`.
 *  - A CONSTRUCTED token is invisible: `'numis' + 'data1'`, `` `numis${'data1'}` ``
 *    and `seed('rsc', 170)` all produce an install tipo the scan cannot see.
 *    That is deliberate — the migrated gates use `seed()` to say "this is a
 *    SEED-SHIPPED reference, not an install binding", and three parity gates
 *    build a token whose bytes are part of a frozen fixture they must match.
 *    But it is a door: `seed('numisdata', 6)` would sail through. The rule the
 *    census cannot enforce, and a reviewer must: `seed()` is for the
 *    seed-shipped TLDs (rsc, dd, hierarchy, ontology, ontologytype, lg) ONLY.
 *  - A STRUCTURAL binding through a shared helper is invisible for the same
 *    reason as the first bullet, and there are live instances: the observer
 *    gates measure census-clean while reaching `on1`/`rsc205`/`rsc387` at
 *    runtime through `test/helpers/observer_term_seed.ts`. So a "N files bind"
 *    answer is N TEXTUAL bindings, never a count of gates that touch an
 *    install's shape.
 *
 * HERMETIC: filesystem reads of tracked source only. No DB, no network, no
 * clock; imports nothing from src/.
 *
 * Registered in engineering/TRIPWIRES.md + scripts/verify.ts.
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { Glob } from 'bun';
import {
	BASELINE_PATH,
	computeDrift,
	FIX_COMMAND,
	formatDrift,
	loadBaseline,
} from '../../scripts/generic_tld_baseline.ts';
import {
	census,
	deniedTldsIn,
	INSTALL_TLDS,
	INVARIANT_TLDS,
	REPO_ROOT,
	SCAN_ROOTS,
	scannedFileCount,
} from '../../scripts/lib/tld_census.ts';

const RESULTS = census();
const BASELINE = loadBaseline();
const DRIFT = computeDrift(RESULTS, BASELINE);

const WHY =
	"A test must use the generic `test` TLD and BUILD the situation it tests (src/core/test_data/situations) — a gate bound to one install's records is green on one machine and red everywhere else (AGENTS.md hard rules 2026-08-19).";

describe('generic_tld ratchet — install-TLD bindings in tests may only shrink', () => {
	test('no test file binds an install TLD its frozen entry does not list (unlisted files bind none)', () => {
		expect(
			DRIFT.regressions,
			`NEW INSTALL-TLD BINDINGS in test files. ${WHY}\n${formatDrift({ ...DRIFT, stale: [], summary: [], vacuity: [] })}\n` +
				`Two legitimate answers, and only two: rebuild the test on the generic TLD (situation() / test3), or RAISE the entry DELIBERATELY — run \`${FIX_COMMAND} --allow-regression\` (a plain \`${FIX_COMMAND}\` REFUSES growth), commit ${BASELINE_PATH} in the same change, and state in the commit message WHY the test must bind that install. Never add a file to get green.`,
		).toEqual([]);

		expect(
			DRIFT.summary,
			`FROZEN DEBT MISMATCH: the baseline summary disagrees with the measurement.\n${formatDrift({ ...DRIFT, regressions: [], stale: [], vacuity: [] })}\n` +
				`If it GREW, a new binding was added — rebuild that test generically. If it FELL, the change improved things: re-freeze with \`${FIX_COMMAND}\`.`,
		).toEqual([]);
	});

	test('ratchet stays honest — no stale entries above reality, none for files that are gone', () => {
		expect(
			DRIFT.stale,
			`STALE BASELINE ENTRIES in ${BASELINE_PATH} — a too-wide entry silently loosens the ratchet.\n${formatDrift({ ...DRIFT, regressions: [], summary: [], vacuity: [] })}\n` +
				`The one command that fixes this: \`${FIX_COMMAND}\` — then commit ${BASELINE_PATH} with the change that improved the test.`,
		).toEqual([]);
	});

	test('anti-vacuity — the scan saw a real corpus', () => {
		expect(
			DRIFT.vacuity,
			formatDrift({ ...DRIFT, regressions: [], stale: [], summary: [] }),
		).toEqual([]);
		expect(scannedFileCount()).toBeGreaterThan(300);
	});

	test('every measured tree is real and contributes files', () => {
		// A root that matches NOTHING silently un-measures a whole tree — exactly
		// the hole this gate had until 2026-08-22. Each root must see files.
		for (const { root, glob } of SCAN_ROOTS) {
			const seen = [...new Glob(glob).scanSync({ cwd: join(REPO_ROOT, root) })].length;
			expect(
				seen,
				`measured tree ${root}/${glob} matched NO file — the root moved or the glob broke. Fix the scanner, never the root list.`,
			).toBeGreaterThan(0);
		}
	});

	test('the client suite and the test-data writers ARE measured', () => {
		// Named explicitly: a future narrowing of SCAN_ROOTS back to `test/` would
		// re-open the door the dmm "map of grapes" binding walked through.
		const roots = SCAN_ROOTS.map((entry) => entry.root);
		expect(roots).toContain('client/dedalo/test/client/js');
		expect(roots).toContain('src/core/test_data');
	});
});

describe('generic_tld ratchet — the measure is what it claims', () => {
	// The vectors are BUILT, not spelled: a literal 'numisdata6' in this file
	// would itself be a binding by the census's own rule (it caught exactly that
	// on first run — the gate measures its own source, as it should).
	const tipo = (tld: string, n: number) => `${tld}${n}`;
	const NUMIS = tipo('numis' + 'data', 6);
	const RSC = tipo('r' + 'sc', 170);
	const TCHI = tipo('tc' + 'hi', 1);

	test('token grammar: a string binding counts, a comment does not, an allowed TLD does not', () => {
		expect(
			deniedTldsIn(`const s = '${NUMIS}'; const r = "${RSC}"; sqo.section_tipo = '${TCHI}';`),
		).toEqual({ ['numis' + 'data']: [NUMIS], ['r' + 'sc']: [RSC], ['tc' + 'hi']: [TCHI] });
		expect(
			deniedTldsIn(`// never use ${NUMIS} here\n/* ${RSC} was the old way */\nconst t = 'test3';`),
		).toEqual({});
		expect(
			deniedTldsIn(`const a = 'test3', b = 'dd6', c = 'hierarchy1', d = 'zzsit1', e = 'es1';`),
		).toEqual({});
		// A bare TLD word is prose, not a binding.
		expect(deniedTldsIn(`const why = 'the ${'numis' + 'data'} install';`)).toEqual({});
		// Word boundaries: an identifier that merely CONTAINS a tipo does not bind.
		expect(deniedTldsIn(`const my_${RSC}_thing = 1; const ${RSC}x = 2;`)).toEqual({});
	});

	test('invariant TLDs can never be denied', () => {
		for (const tld of INVARIANT_TLDS) expect(INSTALL_TLDS.has(tld)).toBe(false);
		expect(/^zz/.test([...INSTALL_TLDS].join(' '))).toBe(false);
		for (const tld of INSTALL_TLDS) expect(tld.startsWith('zz')).toBe(false);
	});

	test('INSTALL_TLDS is sorted (grow-only, reviewable diffs)', () => {
		const list = [...INSTALL_TLDS];
		expect(list).toEqual([...list].sort());
	});
});
