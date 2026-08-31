/**
 * PARITY BASELINE TRIPWIRE — the parity tier's red set may only SHRINK.
 *
 * ── WHAT IT GUARDS ───────────────────────────────────────────────────────────
 * The parity tier is permanently red and cannot be made green: its 76 harvested
 * gates were recorded against ONE installation's records (`monedaiberica`,
 * final harvest 2026-07-11) and the PHP oracle is decommissioned, so a
 * re-harvest is impossible by definition (AGENTS.md "THE VERIFICATION STORY";
 * retirement map in engineering/ORACLE_HARVEST.md). Measured 2026-08-24 on the
 * suite DB: 270 pass / 99 fail / 13 skip across 78 files.
 *
 * ~99 permanent reds is not merely ugly — it is a tier nobody reads, and the
 * hundredth red, the real regression, is invisible in it. That already happened
 * once (WC-034 addendum, `search_options`: a genuine break sat inside the
 * parity noise). This gate puts a FLOOR under the debt so the tier becomes
 * readable again: the reds of the day are frozen in
 * engineering/parity_baseline.json and anything else is red.
 *
 * ── KEYED PER FILE **AND PER TEST NAME** ─────────────────────────────────────
 * Deliberately not a count. A file that stops failing test A and starts failing
 * test B has an unchanged count — and that swap is exactly the regression this
 * exists to catch. So the unit is the individual case, named by its full
 * describe chain, exactly as bun prints it.
 *
 * ── ONE IMPLEMENTATION OF THE MEASURE ────────────────────────────────────────
 * This gate COMPUTES NOTHING. It imports scripts/lib/parity_census.ts (which
 * RUNS `bun test test/parity` under bun's JUnit reporter — ~7 s, credless:
 * ORACLE_MODE defaults to `fixtures`) through scripts/parity_baseline.ts (the
 * generator / drift checker). A second implementation of the measure would make
 * the ratchet worthless. The subprocess is the honest way: the tier's reds are
 * an observable fact, and the only way to know them is to run it.
 *
 * ── THE RULES (mirrored from generic_tld_tripwire / error_throw_ratchet) ─────
 *  1. SHRINK-ONLY: a failing test with no frozen entry is RED. The generator
 *     REFUSES to absorb growth without `--allow-regression`; the commit message
 *     must then say why the new red is acceptable.
 *  2. STALENESS = FAILURE: a frozen entry that now PASSES, is now SKIPPED, or
 *     no longer exists is RED — otherwise the ratchet loosens silently and a
 *     fixed gate can quietly break again unnoticed. One fix:
 *     `bun run scripts/parity_baseline.ts`.
 *  3. FROZEN DEBT: `measured` is asserted exactly, so a shrink must be
 *     re-frozen (and a run that measures NOTHING cannot read as green).
 *  4. ANTI-VACUITY: floors on the files/cases the tier actually reported, plus
 *     a self-test of the JUnit parser (a failure MUST be seen as a failure, a
 *     pass as a pass, a skip as a skip) — otherwise every rule above is free.
 *
 * ── HOW TO LOWER THE COUNT ───────────────────────────────────────────────────
 * Retire a corpus-bound gate in favour of its generic-`test`-TLD twin
 * (engineering/ORACLE_HARVEST.md, DEC-14b map), then re-run the generator and
 * commit the JSON with the change. Never edit the JSON by hand; never add an
 * entry to get green.
 *
 * ── HONEST LIMITATIONS ───────────────────────────────────────────────────────
 *  - It freezes NAMES, so RENAMING a permanently-red test reads as one stale
 *    entry + one regression. That is correct (the reviewer must look), but it
 *    means a rename costs a deliberate re-freeze.
 *  - A test that fails NON-DETERMINISTICALLY would flap this gate. The tier was
 *    measured three consecutive times on 2026-08-24 with a byte-identical
 *    failure set, so today it does not; a flap here is a report of a race in
 *    the tier, not a reason to loosen the gate.
 *  - It says nothing about WHY a test is red. The frozen list is debt, not
 *    approval: an entry here is a gate awaiting retirement, never a blessed
 *    failure.
 *
 * NOT hermetic: it runs the parity tier (frozen fixture store, and for some
 * gates the suite database). It never writes the baseline.
 *
 * Registered in engineering/TRIPWIRES.md + scripts/verify.ts.
 */

import { describe, expect, test } from 'bun:test';
import { basename } from 'node:path';
import {
	childEnv,
	parseJunit,
	runParityTier,
	TIER_COMMAND,
} from '../../scripts/lib/parity_census.ts';
import {
	BASELINE_PATH,
	computeDrift,
	FIX_COMMAND,
	formatDrift,
	loadBaseline,
	TIER_FILE_FLOOR,
	TIER_TEST_FLOOR,
} from '../../scripts/parity_baseline.ts';
import { readEnv } from '../../src/config/env.ts';
import { testDatabaseName } from '../helpers/test_database.ts';
import { testMediaRootPath } from '../helpers/test_media_root.ts';

/**
 * THE LIVE DRIFT CHECK RUNS FROM HERE AGAIN (2026-08-24, second pass).
 *
 * It was quarantined the same day: spawning `bun test test/parity` from INSIDE a
 * `bun test` process reported a different tier than the standalone census — a
 * flood of reds the standalone run does not have, PLUS frozen ones reported as
 * "no longer failing". Stripping the per-run env seams did not close the gap, so
 * the legs were skipped behind a flag with a named reason rather than reporting
 * a number nobody could trust. That was the right call while the cause was
 * unknown; a ratchet that misreports is worse than none.
 *
 * THE CAUSE, found and fixed in `scripts/lib/parity_census.ts` childEnv(): the
 * census stripped the per-run seams but deliberately KEPT the DB addressing, so
 * the child could "still refuse to touch an installation". But
 * `test/preload/test_database.ts` REWRITES `DB_NAME` to the suite database — so
 * a child spawned from a `bun test` parent inherited `DB_NAME=<app>_test` and
 * derived `<app>_test_test`, which does not exist. Every DB-backed parity gate
 * died, some at module scope, which is precisely the mixed regressions-plus-
 * stale signature. Reproduced OUTSIDE bun-test nesting with a plain
 * `DB_NAME=<app>_test bun run scripts/parity_baseline.ts --check`, so the
 * mechanism is not a guess. `DB_NAME`, `DEDALO_DATABASE_CONN` and
 * `DEDALO_TEST_MEDIA_ROOT` are now stripped too, and the child's own preloads
 * re-derive them — which is what enforced the installation refusal all along.
 *
 * Nothing was loosened to achieve this: `computeDrift`, the baseline bytes, the
 * floors and the frozen `measured` block are untouched. The legs cost one ~7 s
 * tier subprocess per run.
 *
 * DEDALO_PARITY_DRIFT=0 disables them for a runner that cannot spawn a
 * subprocess; `bun run scripts/parity_baseline.ts --check` remains the standalone
 * entry point and measures identically.
 */
const LIVE_DRIFT = process.env.DEDALO_PARITY_DRIFT !== '0';
if (!LIVE_DRIFT) {
	console.warn(
		'[parity_baseline_tripwire] live drift legs DISABLED by DEDALO_PARITY_DRIFT=0. Enforcement: `bun run scripts/parity_baseline.ts --check`.',
	);
}
const RUN = LIVE_DRIFT ? runParityTier() : null;
const BASELINE = loadBaseline();
/** Only meaningful when the live legs run; the static legs never read it. */
const DRIFT = RUN === null ? null : computeDrift(RUN, BASELINE);

const WHY =
	'The parity tier is permanently red by construction (corpus-bound gates against a decommissioned oracle). This ratchet is what keeps the NEXT real regression visible inside that noise.';

describe('parity baseline ratchet — the tier’s red set may only shrink', () => {
	test.if(LIVE_DRIFT)('no parity test fails that the baseline does not already freeze', () => {
		expect(
			(DRIFT as NonNullable<typeof DRIFT>).regressions,
			`NEW PARITY REDS. ${WHY}\n${formatDrift({ ...(DRIFT as NonNullable<typeof DRIFT>), stale: [], summary: [], vacuity: [] })}\n` +
				`Reproduce with \`${TIER_COMMAND}\`. Two legitimate answers, and only two: FIX the regression, or freeze it DELIBERATELY — run \`${FIX_COMMAND} --allow-regression\` (a plain \`${FIX_COMMAND}\` REFUSES growth), commit ${BASELINE_PATH} in the same change, and state in the commit message WHY the new red is acceptable. "It is corpus-bound" is not an answer: the corpus-bound reds are already frozen.`,
		).toEqual([]);
	});

	test.if(LIVE_DRIFT)(
		'ratchet stays honest — no frozen red that now passes, is skipped, or is gone',
		() => {
			expect(
				(DRIFT as NonNullable<typeof DRIFT>).stale,
				`STALE ENTRIES in ${BASELINE_PATH} — a frozen red that is no longer red leaves a hole the ratchet stops watching, so that gate could break again unnoticed.\n${formatDrift({ ...(DRIFT as NonNullable<typeof DRIFT>), regressions: [], summary: [], vacuity: [] })}\n` +
					`The one command that fixes this: \`${FIX_COMMAND}\` — then commit ${BASELINE_PATH} with the change that improved the tier.`,
			).toEqual([]);
		},
	);

	test.if(LIVE_DRIFT)('frozen debt matches the measurement exactly', () => {
		expect(
			(DRIFT as NonNullable<typeof DRIFT>).summary,
			`FROZEN DEBT MISMATCH: the baseline's \`measured\` block disagrees with the run.\n${formatDrift({ ...(DRIFT as NonNullable<typeof DRIFT>), regressions: [], stale: [], vacuity: [] })}\n` +
				`If it GREW, a new red was added — fix it. If it FELL, the change improved the tier: re-freeze with \`${FIX_COMMAND}\`.`,
		).toEqual([]);
	});
});

describe('parity baseline ratchet — anti-vacuity', () => {
	test.if(LIVE_DRIFT)('the tier actually ran (floors on files and cases)', () => {
		expect(
			(DRIFT as NonNullable<typeof DRIFT>).vacuity,
			formatDrift({
				...(DRIFT as NonNullable<typeof DRIFT>),
				regressions: [],
				stale: [],
				summary: [],
			}),
		).toEqual([]);
		expect((RUN as NonNullable<typeof RUN>).files.length).toBeGreaterThanOrEqual(TIER_FILE_FLOOR);
		expect((RUN as NonNullable<typeof RUN>).totals.tests).toBeGreaterThanOrEqual(TIER_TEST_FLOOR);
		// The tier under ratchet is the parity tier and nothing else.
		for (const file of (RUN as NonNullable<typeof RUN>).files)
			expect(file.startsWith('test/parity/')).toBe(true);
	});

	test.if(LIVE_DRIFT)(
		'the scan really found the frozen reds (a blind measure would freeze nothing)',
		() => {
			// The whole ratchet is free if the census cannot see a failure. It must
			// report reds, in more than one file, and the baseline must hold them.
			expect((RUN as NonNullable<typeof RUN>).totals.fail).toBeGreaterThan(0);
			expect((RUN as NonNullable<typeof RUN>).totals.pass).toBeGreaterThan(0);
			const failingFiles = new Set(
				(RUN as NonNullable<typeof RUN>).cases
					.filter((c) => c.status === 'fail')
					.map((c) => c.file),
			);
			expect(failingFiles.size).toBeGreaterThan(1);
			expect(Object.keys(BASELINE.files).sort()).toEqual([...failingFiles].sort());
			// Every frozen name is a real, currently-observed case (stale covers the
			// converse; this is the direct statement that the list is not fiction).
			const observed = new Set(
				(RUN as NonNullable<typeof RUN>).cases.map((c) => `${c.file} ${c.name}`),
			);
			for (const [file, names] of Object.entries(BASELINE.files)) {
				for (const name of names) expect(observed.has(`${file} ${name}`)).toBe(true);
			}
		},
	);

	test('the JUnit measure distinguishes fail / pass / skip', () => {
		// Proves the parser is not blind — the property every rule above rests on.
		const xml = [
			'<?xml version="1.0" encoding="UTF-8"?>',
			'<testsuites name="bun test" tests="3">',
			'  <testsuite name="test/parity/x.test.ts" file="test/parity/x.test.ts">',
			'    <testsuite name="outer" file="test/parity/x.test.ts">',
			'      <testcase name="green" classname="outer" />',
			'      <testcase name="red" classname="outer">',
			'        <failure message="expect(received).toEqual(expected)">diff</failure>',
			'      </testcase>',
			'      <testcase name="grey" classname="outer">',
			'        <skipped />',
			'      </testcase>',
			'    </testsuite>',
			'  </testsuite>',
			'</testsuites>',
		].join('\n');
		const parsed = parseJunit(xml);
		expect(parsed.totals).toEqual({ tests: 3, pass: 1, fail: 1, skip: 1 });
		expect(parsed.cases.map((c) => `${c.file} | ${c.name} | ${c.status}`)).toEqual([
			'test/parity/x.test.ts | outer > green | pass',
			'test/parity/x.test.ts | outer > red | fail',
			'test/parity/x.test.ts | outer > grey | skip',
		]);
	});

	test('the drift rules bite in BOTH directions (planted, in-memory)', () => {
		// HERMETIC, and deliberately so: this leg builds its OWN baseline-shaped
		// run instead of mutating a live one, so it proves the drift rules bite
		// even where the tier cannot be measured (see the header — the live legs
		// skip inside `bun test`). A rule-checker that only runs when the thing it
		// checks is already available is the weakest possible place for it.
		const baselineRun = {
			files: Object.keys(BASELINE.files),
			totals: {
				tests: BASELINE.measured.tier_tests,
				pass: BASELINE.measured.tier_pass,
				fail: BASELINE.measured.failing_tests,
				skip: BASELINE.measured.tier_skip,
			},
			cases: Object.entries(BASELINE.files).flatMap(([file, names]) =>
				names.map((name) => ({ file, name, status: 'fail' as const })),
			),
		};
		// The synthetic base reproduces the frozen debt exactly, so it drifts in
		// neither direction — the control every plant below is measured against.
		expect(computeDrift(baselineRun, BASELINE).regressions).toEqual([]);
		expect(computeDrift(baselineRun, BASELINE).stale).toEqual([]);

		// A regression: a red the baseline does not list.
		const withNewRed = {
			...baselineRun,
			cases: [
				...baselineRun.cases,
				{ file: 'test/parity/x.test.ts', name: 'planted > new red', status: 'fail' as const },
			],
		};
		expect(computeDrift(withNewRed, BASELINE).regressions.length).toBe(1);

		// Staleness: a frozen red that now passes.
		const firstFile = Object.keys(BASELINE.files)[0] ?? '';
		const firstName = BASELINE.files[firstFile]?.[0] ?? '';
		const withFixed = {
			...baselineRun,
			cases: baselineRun.cases.map((c) =>
				c.file === firstFile && c.name === firstName ? { ...c, status: 'pass' as const } : c,
			),
		};
		const staleDrift = computeDrift(withFixed, BASELINE);
		expect(staleDrift.stale.length).toBe(1);
		expect(staleDrift.stale.some((l) => l.includes('now PASSES') && l.includes(firstName))).toBe(
			true,
		);

		// And the SKIP swap the review found: a frozen red silenced with `.skip`
		// must not read as clean either.
		const withSkipped = {
			...baselineRun,
			cases: baselineRun.cases.map((c) =>
				c.file === firstFile && c.name === firstName ? { ...c, status: 'skip' as const } : c,
			),
		};
		expect(computeDrift(withSkipped, BASELINE).stale.length).toBe(1);
	});
});

/**
 * CENSUS ADDRESSING — the child must measure the database the parent built.
 *
 * THE DEFECT THIS FREEZES (2026-08-31). `childEnv()` strips DB_NAME and
 * DEDALO_DATABASE_CONN so a nested `bun test` cannot re-derive `<app>_test_test`. It
 * left the child nothing to address with, so the child fell through
 * `testDatabaseName()` to `readEnv('DB_NAME')` — whose last resort is
 * ../private/.env. A developer HAS that file, so the child re-derived the suite
 * database and everything worked. The hosted db tier has no such file by design, so
 * the same code reached the literal fallback `dedalo_ts_test`, a database nothing
 * creates: MEASURED 254 of 382 cases, 60 pass, with the tier's size floor the only
 * thing that noticed. One file crashed at collection and ~40 more degraded into
 * `(unnamed)` placeholders, so it read as a corpus problem rather than an address.
 *
 * The fix has two halves and BOTH are asserted here, because either alone is wrong:
 * the preload pins the resolved name (making the derivation idempotent under
 * nesting), and childEnv passes it explicitly (so no re-derivation is needed).
 *
 * HONEST LIMIT: this proves the child is handed the name THIS process resolves. It
 * does not prove such a database exists — `privateDir` freezes at module load
 * (src/config/env.ts), so the absent-file case cannot be simulated in-process. The
 * end-to-end proof is the CI-shaped run in engineering/CI.md.
 */
describe('census addressing — the child measures the database the parent built', () => {
	test('childEnv hands the child an EXPLICIT database, never a derivation', () => {
		const composed = childEnv();
		expect(typeof composed.DEDALO_TEST_DATABASE, 'the census must name the database').toBe(
			'string',
		);
		expect((composed.DEDALO_TEST_DATABASE ?? '').length).toBeGreaterThan(0);
		expect(composed.DEDALO_TEST_DATABASE).toBe(testDatabaseName());
	});

	test('the addressing keys are STILL stripped — the fix is not a restored seam', () => {
		const composed = childEnv();
		expect(composed.DB_NAME, 'DB_NAME must stay stripped').toBeUndefined();
		expect(composed.DEDALO_DATABASE_CONN, 'the alias must stay stripped').toBeUndefined();
	});

	test('the derivation is IDEMPOTENT — no `_test_test`, whatever the parent carries', () => {
		// Driven over a SYNTHETIC env rather than this process's, so the claim is about
		// the function and not about how this file happened to be launched. Same
		// save/clear/restore shape shard_partition_tripwire uses for the same reason.
		const KEYS = ['DEDALO_TEST_DATABASE', 'DB_NAME', 'DEDALO_DATABASE_CONN'] as const;
		const saved = new Map<string, string | undefined>();
		for (const key of KEYS) {
			saved.set(key, process.env[key]);
			delete process.env[key];
		}
		try {
			// A parent that has ALREADY been repointed (the nested `bun test` case): the
			// pinned name is reused verbatim, never suffixed again.
			process.env.DEDALO_TEST_DATABASE = 'zzsuite_test';
			process.env.DB_NAME = 'zzsuite_test';
			const nested = childEnv().DEDALO_TEST_DATABASE;
			expect(nested, 'a pinned suite name must survive a nested compose').toBe('zzsuite_test');
			expect(nested).not.toMatch(/_test_test$/);

			// A shard child: the suffix its runner added must not leak into the address.
			process.env.DEDALO_TEST_DATABASE = 'zzsuite_test__shard2';
			expect(childEnv().DEDALO_TEST_DATABASE).not.toMatch(/__shard\d+.*_test$/);

			// THE STANDALONE PARENT — the one the db tier actually uses, and the only
			// context that can catch a missing composition. `bun run scripts/parity_baseline.ts`
			// has no preload, so nothing has pinned the key; childEnv must DERIVE it here or
			// the child falls through to the literal `dedalo_ts_test`. Asserting it in this
			// process would be vacuous: the preload has already pinned the real value, so the
			// copy of process.env carries it whether childEnv composes anything or not.
			delete process.env.DEDALO_TEST_DATABASE;
			process.env.DB_NAME = 'zzsuite';
			expect(
				childEnv().DEDALO_TEST_DATABASE,
				'with no pin inherited, the census must resolve the suite database itself',
			).toBe('zzsuite_test');
		} finally {
			for (const [key, value] of saved) {
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
			}
		}
	});

	test('the PRELOAD half: this bun test process pinned the name it resolved', () => {
		// Behavioural, not textual: this process IS a `bun test` process, so the preload
		// has run. Deleting the pin in test/preload/test_database.ts reds this.
		const pinned = readEnv('DEDALO_TEST_DATABASE');
		expect(pinned, 'the preload must pin the resolved suite database').toBeDefined();
		expect(pinned).toBe(testDatabaseName());
		// The derived surfaces follow the same name rather than diverging from it.
		expect(basename(testMediaRootPath())).toBe(testDatabaseName());
	});

	test('anti-vacuity: the composed name is a real suite database, not the literal fallback', () => {
		// `dedalo_ts_test` is what testDatabaseName() returns when it knows NOTHING. If the
		// census ever composes it again on a configured machine, the address is being
		// guessed and this whole describe is measuring a fiction.
		expect(childEnv().DEDALO_TEST_DATABASE).not.toBe('dedalo_ts_test');
		expect(testDatabaseName()).toMatch(/_test$/);
	});
});
