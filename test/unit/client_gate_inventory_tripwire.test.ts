/**
 * CLIENT GATE INVENTORY — the browser tier's verdict cannot be green over nothing.
 *
 * ── WHAT IT GUARDS (P0-2 / GATE-10, GATE-11, GATE-12, GATE-13) ──────────────
 * `bun run test:client` drives ~133 Mocha suites in headless Chrome and exits
 * on a verdict. Four ways that verdict said green while asserting nothing:
 *   GATE-10  the readiness wait matched a button nothing ever disabled, so an
 *            import-time throw in the page left a listener-less button, zero
 *            cards, and exit 0;
 *   GATE-11  a failed suite was re-run once and its retry's PASS reported, the
 *            first attempt's reasons deleted;
 *   GATE-12  a suite that imports cleanly and registers zero `it()` reported
 *            `failures === 0`, i.e. PASS — two gated suites were in that state;
 *            and its variant: mocha counts a PENDING test (it.skip, a
 *            callback-less `it('title')`, `this.skip()`) inside `stats.tests`,
 *            so a suite whose tests are all pending reports N tests, runs
 *            none, and was green at every layer;
 *   GATE-13  `it()` bodies with no assertion at all drive the client write
 *            path and verify none of it.
 *
 * ── WHAT CLOSES THEM ─────────────────────────────────────────────────────────
 *   - `#test_run_all` ships DISABLED in index.html and index.js enables it only
 *     after list.js populated the cards — a real readiness signal;
 *   - the page-side retry is DELETED; the page's ONE frame loader bumps the
 *     card's `data-run-count` (reset when `run all` starts) and the verdict
 *     reds any card loaded more than once — a retry re-added under any name
 *     still has to load the frame again;
 *   - frame_runner.js posts `runner.stats.tests` AND `runner.stats.pending`;
 *     the page-side verdict of a suite is a PURE module,
 *     client/dedalo/test/client/js/card_state.js (no DOM): from the message as
 *     posted to the card's state — pass/fail, both counts parked on the card
 *     (`data-test-count`, `data-pending-count`, both or neither), the failure
 *     detail — and index.js only APPLIES what it returns; a suite that RAN zero
 *     tests is FAIL there, and the verdict floors and reds on `tests - pending`;
 *   - the runner's scrape returns each card's `dataset` VERBATIM and knows no
 *     attribute name; `observeCard` (the verdict module) is the ONLY reader of
 *     the attributes and never defaults an absent count — so the whole chain
 *     frame message → card_state.js → dataset → observeCard → computeVerdict
 *     is driven HERE in bun, with no browser, over the reviewer's exact
 *     all-pending shape;
 *   - the verdict is a PURE function (scripts/lib/client_gate_verdict.ts) over
 *     the scraped cards and a SHRINK-ONLY record,
 *     engineering/client_gate_inventory.json: a minimum SUITE count, a minimum
 *     RAN mocha TEST count (not suites), a static assertion-free-`it()` budget
 *     and a static switched-off-registration budget (it.skip / xit /
 *     callback-less it() / describe.skip…) that may only fall. `concludeRun`
 *     is the WHOLE decide-and-exit — verdict, `--update` banking, exit code —
 *     and the runner's `--replay` runs that tail as a subprocess over a planted
 *     observation, so the exit code is measured, not read off a substring.
 *
 * ── WHAT THIS GATE PROVES, HERMETICALLY ──────────────────────────────────────
 *   1. every verdict leg, driven in memory with a positive control per leg —
 *      the all-pending suite among them;
 *   2. the banking refusals, both directions, and `concludeRun` end to end;
 *   3. the RUNNER PROCESS exits on the verdict: `--replay` over a planted RAW
 *      scrape (cards as `{status, dataset}`) — zero suites exits 1, an
 *      all-pending dataset exits 1, a dataset with no pending count exits 1, a
 *      healthy one exits 0 (a subprocess, no browser, no server, no DB) — so
 *      the interpretation of the attributes is inside the measured process;
 *   3b. the PAGE→RUNNER CHAIN end to end in memory: card_state.js over the
 *      frame's messages, applied to a card, scraped by observeCard, judged by
 *      computeVerdict — all-pending is red, zero-count is red, a message with
 *      no counts parks none and is red, a healthy one is green;
 *   4. a STATIC census, TOTAL over the registered suites (shared reader:
 *      test/helpers/client_suite_census.ts): every registered suite file has at
 *      least one LIVE `it()` (not it.skip, with a callback), the assertion-free
 *      count and the switched-off count each equal their budget (below =
 *      re-bank; above = a new hole), and the recorded suite floor equals the
 *      cards the registry produces (a floor below the inventory is loose, above
 *      it is always red);
 *   5. the page wiring the verdict depends on — the button ships disabled, the
 *      frame posts both counts, index.js hands the message AS POSTED to
 *      card_state.js and applies its answer (and derives no count itself), its
 *      ONE frame loader counts the load, the scrape spreads the dataset —
 *      measured on the client source, because a verdict over a field the page
 *      never sets is a verdict over nothing. These are the only spelling-shaped
 *      legs left, and each is a call site, not a derivation.
 *
 * ── HONEST LIMITS ────────────────────────────────────────────────────────────
 *  - The mocha test floor's relation to reality is only measurable by running
 *    the browser tier; here it is bounded below by the suite floor. A stale
 *    (too low) test floor is caught only by the next `--update`.
 *  - "Has an assertion" is a static regex over the `it()` body (chai
 *    `assert.*`, `expect(`, `.should`, `throw`). A body that asserts through a
 *    helper is counted as assertion-free; that overcounts, and the budget is a
 *    ceiling, so overcounting only makes the ratchet stricter.
 *  - `--replay` trusts the scrape it is given; it proves the tail from the
 *    dataset down, and the page half is proved through card_state.js. What no
 *    hermetic leg can see is the browser wiring between the two (index.js's
 *    message listener actually firing) — that is the browser tier's own run.
 *  - scripts/ci/client_gate.sh is invoked by no workflow (P0-1): a floor that
 *    runs nowhere floors nothing. This gate makes the floor CORRECT; P0-1 makes
 *    it RUN.
 *
 * HERMETIC: static scans, in-memory verdicts, and one subprocess of the runner
 * in `--replay` mode. No DB, no browser, no network.
 *
 * Registered in engineering/TRIPWIRES.md + scripts/verify.ts.
 */

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	apply_card_state,
	card_state_from_message,
	count_run,
	reset_run_count,
} from '../../client/dedalo/test/client/js/card_state.js';
import {
	bankInventory,
	type ClientGateInventory,
	computeVerdict,
	concludeRun,
	loadInventory,
	type ObservedSuite,
	observeCard,
	observeRun,
	ranTests,
	type ScrapedCard,
	type ScrapedRun,
	scrapedCount,
} from '../../scripts/lib/client_gate_verdict.ts';
import {
	bodyAsserts,
	componentMatrixModels,
	countAssertionFreeIt,
	countIt,
	countLiveIt,
	countSkippedRegistrations,
	gatedCardCount,
	gatedSuiteNames,
	itBodies,
	itRegistrations,
	NOT_A_SUITE,
	REPO_ROOT,
	registeredSuiteNames,
	SUITE_DIR,
	scanRegisteredSuites,
	staticCensusTotals,
	suiteFiles,
} from '../helpers/client_suite_census.ts';

const INVENTORY = loadInventory();

/** A healthy observation: N green cards, each loaded once with a real, all-ran test count. */
function healthy(n: number, testsEach = 8): ObservedSuite[] {
	return Array.from({ length: n }, (_, i) => ({
		name: `test_planted_${i}`,
		group: 'generic',
		status: 'pass',
		testCount: testsEach,
		pendingCount: 0,
		runCount: 1,
	}));
}

const record: ClientGateInventory = {
	rule: '',
	suite_floor: 10,
	mocha_test_floor: 80,
	assertion_free_it_budget: 3,
	skipped_registration_budget: 1,
};

function verdictOf(
	suites: ObservedSuite[],
	overrides: Partial<Parameters<typeof computeVerdict>[0]> = {},
) {
	return computeVerdict({
		suites,
		pending: 0,
		strict: false,
		knownFailing: new Map(),
		inventory: record,
		...overrides,
	});
}

describe('client gate verdict — every leg, in memory', () => {
	test('control: a healthy run at the floor is green', () => {
		const v = verdictOf(healthy(10));
		expect(v.errors).toEqual([]);
		expect(v.exitCode).toBe(0);
		expect(v.observedSuites).toBe(10);
		expect(v.mochaTests).toBe(80);
	});

	test('ZERO suites is red, whatever the counters say (GATE-10)', () => {
		const v = verdictOf([]);
		expect(v.exitCode).toBe(1);
		expect(v.errors.some((l) => l.includes('observed ZERO suites'))).toBe(true);
	});

	test('fewer suites than the floor is red', () => {
		const v = verdictOf(healthy(9));
		expect(v.exitCode).toBe(1);
		expect(v.errors.some((l) => l.includes('observed 9 suites, floor is 10'))).toBe(true);
	});

	test('fewer mocha TESTS than the floor is red even with every suite present and green', () => {
		const v = verdictOf(healthy(10, 7)); // 70 < 80
		expect(v.exitCode).toBe(1);
		expect(v.errors.some((l) => l.includes('70 mocha tests RAN (0 pending), floor is 80'))).toBe(
			true,
		);
	});

	test('a card loaded more than once in the run is red even though its dot is green (GATE-11)', () => {
		const suites = healthy(10);
		(suites[3] as ObservedSuite).runCount = 2;
		const v = verdictOf(suites);
		expect(v.exitCode).toBe(1);
		expect(v.errors.filter((l) => l.startsWith('RETRIED:'))).toHaveLength(1);
		expect(v.errors[0]).toContain('test_planted_3');
		expect(v.errors[0]).toContain('loaded 2 times');
	});

	test('a card with a verdict but NO run count is red (loaded outside the frame loader)', () => {
		const suites = healthy(10);
		(suites[3] as ObservedSuite).runCount = null;
		const v = verdictOf(suites);
		expect(v.exitCode).toBe(1);
		expect(v.errors).toEqual([
			'RETRIED: generic/test_planted_3 has a verdict but no run count — the page loaded it outside its own frame loader, or a stale index.js',
		]);
	});

	test('a suite that registered ZERO tests is red even with a green dot (GATE-12)', () => {
		const suites = healthy(10, 9); // 90 ≥ 80 even with one card at 0 (81)
		(suites[5] as ObservedSuite).testCount = 0;
		const v = verdictOf(suites);
		expect(v.exitCode).toBe(1);
		expect(v.errors).toEqual(['ZERO TESTS: generic/test_planted_5 registered zero mocha tests']);
	});

	test('a suite whose tests are ALL PENDING ran zero tests and is red (GATE-12, the variant)', () => {
		// mocha's stats.tests INCLUDES pending: 9 registered, 9 pending, 0 ran.
		const suites = healthy(10, 9);
		(suites[5] as ObservedSuite).pendingCount = 9;
		const v = verdictOf(suites);
		expect(v.exitCode).toBe(1);
		expect(v.errors).toEqual([
			'ZERO TESTS: generic/test_planted_5 ran zero mocha tests (9 pending of 9)',
		]);
		expect(v.mochaTests).toBe(81); // the floor counts RAN tests, not registered
		expect(v.mochaPending).toBe(9);
		// A suite with SOME pending tests is fine — the ran ones count.
		const some = healthy(10, 9);
		(some[5] as ObservedSuite).pendingCount = 4;
		expect(verdictOf(some).errors).toEqual([]);
		expect(verdictOf(some).mochaTests).toBe(86);
		expect(ranTests({ testCount: 9, pendingCount: 4 })).toBe(5);
		expect(ranTests({ testCount: null, pendingCount: 0 })).toBeNull();
	});

	test('pending tests count against the mocha TEST floor: 133 all-pending suites are red', () => {
		// The exact shape the reviewer reproduced: every card green, 30 registered
		// tests each, all 30 pending. 3990 registered, 0 ran.
		const suites = healthy(133, 30).map((s) => ({ ...s, pendingCount: 30 }));
		const v = computeVerdict({
			suites,
			pending: 0,
			strict: false,
			knownFailing: new Map(),
			inventory: INVENTORY,
		});
		expect(v.exitCode).toBe(1);
		expect(v.mochaTests).toBe(0);
		expect(v.errors[0]).toContain(
			`0 mocha tests RAN (3990 pending), floor is ${INVENTORY.mocha_test_floor}`,
		);
		expect(v.errors.filter((l) => l.startsWith('ZERO TESTS:'))).toHaveLength(133);
	});

	test("a suite with NO test count (never reached mocha's end) is red", () => {
		const suites = healthy(10, 9);
		(suites[5] as ObservedSuite).testCount = null;
		const v = verdictOf(suites);
		expect(v.exitCode).toBe(1);
		expect(v.errors.some((l) => l.includes('reported no test count'))).toBe(true);
	});

	test('a suite with a test count but NO pending count is red (a stale index.js)', () => {
		const suites = healthy(10, 9);
		(suites[5] as ObservedSuite).pendingCount = null;
		const v = verdictOf(suites);
		expect(v.exitCode).toBe(1);
		expect(v.errors.some((l) => l.includes('no pending count'))).toBe(true);
	});

	test('deferred cards are outside the inventory: neither counted nor red', () => {
		const suites = [
			...healthy(10),
			{
				name: 'test_deferred',
				group: 'tools',
				status: 'deferred',
				testCount: null,
				pendingCount: null,
				runCount: null,
			},
		];
		const v = verdictOf(suites);
		expect(v.errors).toEqual([]);
		expect(v.observedSuites).toBe(10);
	});

	test('a pending suite, a new failure, and a stale KNOWN_FAILING row are each red', () => {
		expect(verdictOf(healthy(10), { pending: 1 }).errors).toEqual([
			'1 test suite(s) did not complete.',
		]);

		const failing = healthy(10);
		(failing[0] as ObservedSuite).status = 'fail';
		expect(verdictOf(failing).errors).toEqual([
			'NEW failing suite (not in KNOWN_FAILING): test_planted_0',
		]);
		// listed → not red; listed and PASSING → red
		expect(
			verdictOf(failing, { knownFailing: new Map([['test_planted_0', 'reason']]) }).errors,
		).toEqual([]);
		expect(
			verdictOf(healthy(10), { knownFailing: new Map([['test_planted_0', 'reason']]) }).errors[0],
		).toContain('listed in KNOWN_FAILING but PASSED');
		// --strict ignores the list in both directions
		expect(
			verdictOf(failing, { strict: true, knownFailing: new Map([['test_planted_0', 'r']]) })
				.exitCode,
		).toBe(1);
	});
});

describe('client gate inventory — banking is shrink-only', () => {
	test('a green run at or above the record banks the observed counts', () => {
		const banked = bankInventory(record, {
			observedSuites: 12,
			mochaTests: 100,
			assertionFreeIt: 2,
			skippedRegistrations: 0,
		});
		expect(banked.refusals).toEqual([]);
		expect(banked.next.suite_floor).toBe(12);
		expect(banked.next.mocha_test_floor).toBe(100);
		expect(banked.next.assertion_free_it_budget).toBe(2);
		expect(banked.next.skipped_registration_budget).toBe(0);
		expect(banked.next.rule.length).toBeGreaterThan(100);
	});

	test('lowering either floor, or raising either budget, is REFUSED', () => {
		const at = { observedSuites: 10, mochaTests: 80, assertionFreeIt: 3, skippedRegistrations: 1 };
		const fewerSuites = bankInventory(record, { ...at, observedSuites: 9 });
		expect(fewerSuites.refusals).toHaveLength(1);
		expect(fewerSuites.refusals[0]).toContain('REFUSING to lower suite_floor 10 → 9');

		const fewerTests = bankInventory(record, { ...at, mochaTests: 79 });
		expect(fewerTests.refusals).toHaveLength(1);
		expect(fewerTests.refusals[0]).toContain('REFUSING to lower mocha_test_floor 80 → 79');

		const moreUnasserted = bankInventory(record, { ...at, assertionFreeIt: 4 });
		expect(moreUnasserted.refusals).toHaveLength(1);
		expect(moreUnasserted.refusals[0]).toContain(
			'REFUSING to raise assertion_free_it_budget 3 → 4',
		);

		const moreSwitchedOff = bankInventory(record, { ...at, skippedRegistrations: 2 });
		expect(moreSwitchedOff.refusals).toHaveLength(1);
		expect(moreSwitchedOff.refusals[0]).toContain(
			'REFUSING to raise skipped_registration_budget 1 → 2',
		);
		expect(bankInventory(record, at).refusals).toEqual([]);
	});

	test('with no record yet, the first bank is accepted', () => {
		expect(
			bankInventory(null, {
				observedSuites: 1,
				mochaTests: 1,
				assertionFreeIt: 0,
				skippedRegistrations: 0,
			}).refusals,
		).toEqual([]);
	});

	test('concludeRun IS the exit: red verdict → 1, --update on a red run refused, refused bank → 1, clean bank → record', () => {
		const census = { assertionFreeIt: 3, skippedRegistrations: 1 };
		const green = verdictOf(healthy(10));
		const red = verdictOf([]);

		expect(concludeRun(green, { update: false, current: record, census })).toEqual({
			exitCode: 0,
			lines: [],
			banked: null,
		});
		const redRun = concludeRun(red, { update: false, current: record, census });
		expect(redRun.exitCode).toBe(1);
		expect(redRun.banked).toBeNull();
		expect(redRun.lines.map((l) => l.level)).toEqual(red.errors.map(() => 'error'));

		const redUpdate = concludeRun(red, { update: true, current: record, census });
		expect(redUpdate.exitCode).toBe(1);
		expect(redUpdate.banked).toBeNull();
		expect(redUpdate.lines.at(-1)?.text).toContain('--update REFUSED: the run is red');

		// Green verdict, but the bank would raise a budget: red, nothing written.
		const refused = concludeRun(green, {
			update: true,
			current: record,
			census: { assertionFreeIt: 4, skippedRegistrations: 1 },
		});
		expect(refused.exitCode).toBe(1);
		expect(refused.banked).toBeNull();
		expect(refused.lines.at(-1)?.text).toContain('REFUSING to raise assertion_free_it_budget');

		const banked = concludeRun(green, { update: true, current: record, census });
		expect(banked.exitCode).toBe(0);
		expect(banked.banked).toEqual({
			rule: expect.stringContaining('SHRINK-ONLY'),
			suite_floor: 10,
			mocha_test_floor: 80,
			assertion_free_it_budget: 3,
			skipped_registration_budget: 1,
		});
		expect(banked.lines.at(-1)?.text).toContain('Banked engineering/client_gate_inventory.json');
	});
});

/** A scraped card, RAW: the strings the page's dataset holds. */
function rawCard(
	name: string,
	status: string,
	dataset: Record<string, string | undefined>,
): ScrapedCard {
	return { status, dataset: { testName: name, group: 'generic', ...dataset } };
}
function rawRun(cards: ScrapedCard[], pending = 0): ScrapedRun {
	return {
		cards,
		counters: {
			total: cards.length,
			pass: cards.filter((c) => c.status === 'pass').length,
			fail: cards.filter((c) => c.status === 'fail').length,
			pending,
		},
		groups: {},
	};
}
/** N green raw cards, each loaded once, `each` tests, none pending. */
function rawHealthy(n: number, each: number): ScrapedCard[] {
	return Array.from({ length: n }, (_, i) =>
		rawCard(`test_planted_${i}`, 'pass', {
			testCount: String(each),
			pendingCount: '0',
			runCount: '1',
		}),
	);
}

describe('client gate runner — the PROCESS exits on the verdict (--replay subprocess)', () => {
	// The runner's tail (`observeRun` + `report`) is shared by the browser run
	// and by --replay, so the exit code measured here is the exit code a
	// browser run produces from the same dataset. Nothing else can prove it: a
	// substring check on `exitCode = …` is a spelling, and the runner could
	// call the verdict and ignore it — or default an absent count one line
	// before the verdict sees it (the reviewer's `?? 0` / `?? 1`), which is why
	// the replay file is the RAW scrape and the interpretation runs inside the
	// measured process.
	const dir = mkdtempSync(join(tmpdir(), 'client_gate_replay_'));
	const runnerPath = join(REPO_ROOT, 'scripts/client_test_runner.ts');
	const run = (name: string, observation: unknown) => {
		const file = join(dir, `${name}.json`);
		writeFileSync(file, JSON.stringify(observation));
		const proc = Bun.spawnSync(['bun', runnerPath, '--replay', file, '--no-reseed'], {
			cwd: REPO_ROOT,
			stdout: 'pipe',
			stderr: 'pipe',
			// A replay must never touch a server or a database; give it nothing to find.
			env: { ...process.env, DB_PORT: '1', TEST_URL: '' },
		});
		return {
			exitCode: proc.exitCode,
			stdout: proc.stdout.toString(),
			stderr: proc.stderr.toString(),
		};
	};
	const each = Math.ceil(INVENTORY.mocha_test_floor / INVENTORY.suite_floor) + 1;

	test('a replay of ZERO suites exits 1 and names the reason', () => {
		const r = run('zero', rawRun([]));
		expect(r.stdout).toContain('--replay:');
		expect(r.stderr).toContain('observed ZERO suites');
		expect(r.exitCode).toBe(1);
	});

	test('a replay of an all-pending inventory (green dots, tests === pending on every card) exits 1', () => {
		const cards = rawHealthy(INVENTORY.suite_floor, 40).map((c) => ({
			...c,
			dataset: { ...c.dataset, pendingCount: '40' },
		}));
		const r = run('pending', rawRun(cards));
		expect(r.stderr).toContain('mocha tests RAN');
		expect(r.stderr).toContain('ran zero mocha tests (40 pending of 40)');
		expect(r.exitCode).toBe(1);
	});

	test('a replay whose cards carry a test count but NO pending count exits 1 (nothing defaults it)', () => {
		const cards = rawHealthy(INVENTORY.suite_floor, each).map((c) => {
			const { pendingCount: _absent, ...rest } = c.dataset;
			return { ...c, dataset: rest };
		});
		const r = run('no_pending', rawRun(cards));
		expect(r.stderr).toContain('no pending count');
		expect(r.exitCode).toBe(1);
	});

	test('a replay whose cards carry a verdict but NO run count exits 1 (nothing defaults it)', () => {
		const cards = rawHealthy(INVENTORY.suite_floor, each).map((c) => {
			const { runCount: _absent, ...rest } = c.dataset;
			return { ...c, dataset: rest };
		});
		const r = run('no_run', rawRun(cards));
		expect(r.stderr).toContain('no run count');
		expect(r.exitCode).toBe(1);
	});

	test('a replay of a healthy inventory at the record exits 0 (the control)', () => {
		const r = run('healthy', rawRun(rawHealthy(INVENTORY.suite_floor, each)));
		expect(r.stdout).toContain(`across ${INVENTORY.suite_floor} gated suites`);
		expect(r.stderr).toBe('');
		expect(r.exitCode).toBe(0);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe('client gate — the PAGE→RUNNER chain, in memory: frame message → card_state.js → dataset → observeCard → verdict', () => {
	// The page's decision (client/dedalo/test/client/js/card_state.js) is a pure
	// ES module with no DOM, so bun runs it over the exact payloads
	// frame_runner.js posts. The card is a bare `{dataset}`; what card_state.js
	// parks on it is what the runner scrapes VERBATIM and `observeCard` reads.
	// One-line reopenings the reviewers demonstrated — `pending_count = 0` in
	// the page, `?? 0` in the scrape — now change what these legs observe.
	type Card = { dataset: Record<string, string | undefined>; title?: string };
	const card = (name = 'test_planted'): Card => ({ dataset: { testName: name, group: 'generic' } });
	/** Frame message → card → scraped → observed, for one suite loaded once. */
	const observe = (message: object, c: Card = card()) => {
		count_run(c);
		const state = card_state_from_message(message);
		expect(state).not.toBeNull();
		apply_card_state(c, state);
		return { state, observed: observeCard({ status: state.status, dataset: c.dataset }) };
	};
	const testEnd = (tests: number, pending: number, fail = 0, failures: unknown[] = []) => ({
		type: 'test_end',
		stats: { tests, pending, fail, pass: tests - pending - fail },
		failures,
	});
	const verdictOver = (observed: ReturnType<typeof observeCard>[]) =>
		verdictOf(observed, { inventory: { ...record, suite_floor: 1, mocha_test_floor: 1 } });

	test('control: a suite that ran its tests is a PASS card with both counts parked, and green through the verdict', () => {
		const { state, observed } = observe(testEnd(8, 0));
		expect(state.status).toBe('pass');
		expect(observed).toMatchObject({
			name: 'test_planted',
			status: 'pass',
			testCount: 8,
			pendingCount: 0,
			runCount: 1,
			failures: [],
		});
		expect(ranTests(observed)).toBe(8);
		expect(verdictOver([observed]).errors).toEqual([]);
	});

	test("the reviewer's shape: 30 tests, 30 pending — FAIL on the card, 30/30 parked, red through the verdict", () => {
		const { state, observed } = observe(testEnd(30, 30));
		expect(state.status).toBe('fail');
		expect(state.failures[0]?.title).toBe('(ran zero tests, 30 pending)');
		expect(observed.testCount).toBe(30);
		expect(observed.pendingCount).toBe(30);
		expect(ranTests(observed)).toBe(0);
		const verdict = verdictOver([observed]);
		expect(verdict.exitCode).toBe(1);
		expect(verdict.errors.some((e) => /ran zero mocha tests \(30 pending of 30\)/.test(e))).toBe(
			true,
		);
		// 133 of them, as the browser tier would present it: red on the floor too.
		const many = Array.from(
			{ length: 133 },
			(_, i) => observe(testEnd(30, 30), card(`test_planted_${i}`)).observed,
		);
		const wide = verdictOf(many, {
			inventory: { ...record, suite_floor: 133, mocha_test_floor: 3000 },
		});
		expect(wide.exitCode).toBe(1);
		expect(wide.mochaTests).toBe(0);
		expect(wide.mochaPending).toBe(30 * 133);
	});

	test('a suite that registered ZERO tests is FAIL on the card and red through the verdict', () => {
		const { state, observed } = observe(testEnd(0, 0));
		expect(state.status).toBe('fail');
		expect(state.failures[0]?.title).toBe('(registered zero tests)');
		expect(observed.testCount).toBe(0);
		expect(verdictOver([observed]).errors.some((e) => /registered zero mocha tests/.test(e))).toBe(
			true,
		);
	});

	test('a frame that sent NO counts (stale frame_runner.js) parks zero, reads as ran-zero, red', () => {
		const { state, observed } = observe({ type: 'test_end', stats: { fail: 0 }, failures: [] });
		expect(state.status).toBe('fail');
		expect(observed.testCount).toBe(0);
		expect(observed.pendingCount).toBe(0);
		expect(verdictOver([observed]).exitCode).toBe(1);
	});

	test('a setup error and a watchdog park NO counts (both deleted), and the verdict reds the absence', () => {
		const c = card();
		c.dataset.testCount = '8';
		c.dataset.pendingCount = '0';
		const error = observe({ type: 'test_error', error: 'boom' }, c);
		expect(error.state.status).toBe('fail');
		expect(c.dataset.testCount).toBeUndefined();
		expect(c.dataset.pendingCount).toBeUndefined();
		expect(error.observed.testCount).toBeNull();
		expect(error.observed.failures[0]?.message).toBe('boom');
		expect(verdictOver([error.observed]).errors.some((e) => /no test count/.test(e))).toBe(true);
		const dog = observe({ type: 'watchdog', ms: 5 });
		expect(dog.observed.testCount).toBeNull();
		expect(dog.observed.failures[0]?.title).toContain('watchdog');
	});

	test('a mocha failure is FAIL with its detail parked; counted-but-undetailed failures say so', () => {
		const { state, observed } = observe(
			testEnd(3, 0, 1, [{ title: 't', message: 'm', stack: 's' }]),
		);
		expect(state.status).toBe('fail');
		expect(observed.failures).toEqual([{ title: 't', message: 'm', stack: 's' }]);
		const undetailed = observe(testEnd(3, 0, 1, []));
		expect(undetailed.observed.failures[0]?.title).toContain(
			'counted 1 failure(s) but sent no detail',
		);
	});

	test('the counts are parked BOTH OR NEITHER, and the scrape never defaults an absent one', () => {
		const c = card();
		apply_card_state(c, { status: 'pass', test_count: 5, pending_count: null, failures: [] });
		expect(c.dataset.testCount).toBeUndefined();
		expect(c.dataset.pendingCount).toBeUndefined();
		expect(scrapedCount(undefined)).toBeNull();
		expect(scrapedCount('')).toBeNull();
		expect(scrapedCount('x')).toBeNull();
		expect(scrapedCount('0')).toBe(0);
		expect(scrapedCount('12')).toBe(12);
		const half = observeCard({ status: 'pass', dataset: { testCount: '5' } });
		expect(half.pendingCount).toBeNull();
		expect(half.runCount).toBeNull();
		expect(verdictOver([half]).errors.some((e) => /no pending count/.test(e))).toBe(true);
	});

	test('a second frame load reads 2 and is red; run-all reset brings it back to 1 (GATE-11)', () => {
		const c = card();
		const twice = observe(testEnd(8, 0), c);
		count_run(c);
		const state = card_state_from_message(testEnd(8, 0));
		apply_card_state(c, state);
		const again = observeCard({ status: state.status, dataset: c.dataset });
		expect(twice.observed.runCount).toBe(1);
		expect(again.runCount).toBe(2);
		expect(verdictOver([again]).errors.some((e) => /loaded 2 times/.test(e))).toBe(true);
		reset_run_count(c);
		expect(c.dataset.runCount).toBeUndefined();
		count_run(c);
		expect(c.dataset.runCount).toBe('1');
	});

	test('observeRun interprets the whole scrape: cards, counters, and a card with no dataset at all', () => {
		const results = observeRun({
			cards: [
				rawCard('a', 'pass', { testCount: '3', pendingCount: '1', runCount: '1' }),
				{ status: 'pending', dataset: {} },
			],
			counters: { total: 2, pass: 1, fail: 0, pending: 1 },
			groups: { generic: { pass: 1, fail: 0, pending: 1 } },
		});
		expect(results.total).toBe(2);
		expect(results.suites[0]).toMatchObject({
			name: 'a',
			testCount: 3,
			pendingCount: 1,
			runCount: 1,
		});
		expect(results.suites[1]).toMatchObject({ name: '', status: 'pending', testCount: null });
	});
});

describe('client gate inventory — static census, TOTAL over the registered suites', () => {
	const scan = scanRegisteredSuites();

	test('the census sees the inventory (anti-vacuity)', () => {
		expect(scan.length).toBeGreaterThan(90);
		expect(scan.map((s) => s.name)).toContain('test_page');
		expect(scan.map((s) => s.name)).toContain('test_unknown_error');
		expect(scan.reduce((sum, s) => sum + s.its, 0)).toBeGreaterThan(1000);
		// Every registered name is a file the census read, and the registry's
		// gated arrays are the same names minus the parameterized area.
		const files = new Set(suiteFiles());
		// The Glob walk itself is floored (census_derivation: a walk without a floor
		// on ITS result passes vacuously when its root moves — the per-name check
		// below would then fail, but only through the registry, not the walk).
		expect(files.size).toBeGreaterThan(90);
		for (const name of registeredSuiteNames()) expect(files.has(name), name).toBe(true);
		expect(gatedSuiteNames().length).toBeGreaterThan(90);
		expect(componentMatrixModels().length).toBeGreaterThan(25);
	});

	test('every registered suite file registers at least one LIVE it() (GATE-12, statically)', () => {
		// LIVE: not it.skip, with a callback. A suite converted wholesale to
		// it.skip / it('title') still "has it()s" and runs nothing.
		const empty = scan.filter((s) => s.liveIts === 0).map((s) => s.name);
		expect(
			empty,
			'Registered suites with NO runnable it(): they render a card that can never go red. ' +
				`Register real tests (an async describe is not one — Mocha never awaits it; an it.skip is not one either).\n  ${empty.join('\n  ')}`,
		).toEqual([]);
	});

	test('switched-off registrations equal the recorded budget (shrink-only ratchet, GATE-12)', () => {
		const measured = staticCensusTotals(scan).skippedRegistrations;
		const offenders = scan.filter((s) => s.skipped > 0).map((s) => `${s.name}: ${s.skipped}`);
		expect(
			measured,
			'MORE switched-off registrations (it.skip / xit / callback-less it() / describe.skip / xdescribe) ' +
				`than the budget allows. A test that is switched off is a pending test mocha counts and never runs.\n  ${offenders.join('\n  ')}`,
		).toBeLessThanOrEqual(INVENTORY.skipped_registration_budget);
		expect(
			measured,
			`FEWER switched-off registrations (${measured}) than the budget (${INVENTORY.skipped_registration_budget}) — re-bank.`,
		).toBe(INVENTORY.skipped_registration_budget);
	});

	test('the two suites the audit named now carry real assertions', () => {
		for (const name of ['test_page', 'test_unknown_error']) {
			const source = readFileSync(join(SUITE_DIR, `${name}.js`), 'utf8');
			expect(countIt(source), name).toBeGreaterThanOrEqual(2);
			expect(countAssertionFreeIt(source), name).toBe(0);
			expect(/describe\([^,]+,\s*async/.test(source), `${name}: async describe`).toBe(false);
		}
	});

	test('assertion-free it() bodies equal the recorded budget (shrink-only ratchet, GATE-13)', () => {
		const measured = staticCensusTotals(scan).assertionFreeIt;
		const offenders = scan
			.filter((s) => s.assertionFree > 0)
			.map((s) => `${s.name}: ${s.assertionFree}`);
		expect(
			measured,
			'MORE it() bodies without an assertion than the budget allows. A test that ' +
				'drives the write path and checks nothing verifies nothing — assert the ' +
				`post-write model and DOM.\n  ${offenders.join('\n  ')}`,
		).toBeLessThanOrEqual(INVENTORY.assertion_free_it_budget);
		expect(
			measured,
			`FEWER assertion-free it() bodies (${measured}) than the budget (${INVENTORY.assertion_free_it_budget}) — the win is not locked in. Re-bank: bun run scripts/client_test_runner.ts --update (or lower the number by hand in the same change).`,
		).toBe(INVENTORY.assertion_free_it_budget);
	});

	test('the recorded suite floor IS the inventory the registry produces', () => {
		// Below it the floor is loose (a suite can vanish unnoticed); above it the
		// gate is always red. `run all` queues one card per gated name plus one per
		// component-matrix model, so the number is derivable here.
		const cards = gatedCardCount();
		expect(cards).toBeGreaterThan(100);
		expect(
			INVENTORY.suite_floor,
			`suite_floor ${INVENTORY.suite_floor} ≠ ${cards} gated cards in test_registry.js + elements.js. Adding a suite raises the floor: re-bank (--update) or edit the record in the same change.`,
		).toBe(cards);
		expect(INVENTORY.mocha_test_floor).toBeGreaterThan(INVENTORY.suite_floor);
		expect(INVENTORY.rule).toContain('SHRINK-ONLY');
	});

	test('the it() scanner reads bodies and assertions the way the ratchet needs (positive controls)', () => {
		const src = [
			"describe('x', function() {",
			"  it('asserts', function() { assert.equal(1, 1) })",
			"  it('expects', async () => { const v = await f(); expect(v).to.equal(1) })",
			"  it('nothing', function() { instance.change_value({ value: 'x' }) })",
			"  it('pending only')",
			"  // it('commented out', function() {})",
			"  it.skip('skipped but asserting', () => { assert.ok(true) })",
			'  const s = \'it("inside a string", function() {})\'',
			'})',
		].join('\n');
		const bodies = itBodies(src);
		expect(bodies).toHaveLength(5);
		expect(countIt(src)).toBe(5);
		expect(countAssertionFreeIt(src)).toBe(2); // 'nothing' + 'pending only'
		expect(bodyAsserts('{ if (x) { assert.ok(y) } }')).toBe(true);
		expect(bodyAsserts('{ instance.change_value(v); await instance.refresh() }')).toBe(false);
		// LIVE vs switched off: it.skip and the callback-less it() can never run.
		expect(itRegistrations(src).map((r) => r.live)).toEqual([true, true, true, false, false]);
		expect(countLiveIt(src)).toBe(3);
		expect(countSkippedRegistrations(src)).toBe(2);
		// A named-function callback is live; a comma inside the body or an options
		// object is not read as a second argument; xit/describe.skip/xdescribe count.
		const more = [
			"it('named', data_read)",
			"it('args', function() { f(1, 2); const o = { a: 1, b: 2 } })",
			"xit('x', () => {})",
			"describe.skip('d', () => { it('inside', () => { assert.ok(1) }) })",
			"xdescribe('xd', () => {})",
			"context.skip('c', () => {})",
			'const s = \'it.skip("in a string")\'',
		].join('\n');
		expect(itRegistrations(more).map((r) => r.live)).toEqual([true, true, true]);
		expect(countSkippedRegistrations(more)).toBe(4);
		expect(countSkippedRegistrations("it('a', () => { expect(1).to.equal(1) })")).toBe(0);
	});
});

describe('client gate inventory — the page wiring the verdict reads', () => {
	const page = (file: string) => readFileSync(join(SUITE_DIR, '..', file), 'utf8');
	/** A client script with its comments STRIPPED, so a commented-out call cannot satisfy a call-site leg. */
	const script = (file: string) =>
		readFileSync(join(SUITE_DIR, file), 'utf8')
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

	test('#test_run_all ships DISABLED and is enabled by index.js after the cards exist (GATE-10)', () => {
		const html = page('index.html');
		const button = /<button id="test_run_all"[^>]*>/.exec(html)?.[0] ?? '';
		expect(button.length).toBeGreaterThan(0);
		expect(button, 'the readiness wait needs a button that starts disabled').toContain('disabled');
		const index = script('index.js');
		expect(index).toMatch(/run_all_btn\.disabled = false/);
	});

	test('the frame posts both counts; index.js hands the message AS POSTED to card_state.js and derives nothing (GATE-12)', () => {
		const frame = script('frame_runner.js');
		expect(frame).toMatch(/tests\s*:\s*runner\.stats\.tests/);
		expect(frame).toMatch(/pending\s*:\s*runner\.stats\.pending/);
		const index = script('index.js');
		expect(index).toMatch(/import \{[^}]*card_state_from_message[^}]*\} from '\.\/card_state\.js'/);
		// The message goes in untouched — `e.data`, not a reshaped copy — and the
		// answer is applied, not re-derived: index.js writes no count itself.
		expect(index).toMatch(/card_state_from_message\(e\.data\)/);
		expect(index).toMatch(/apply_card_state\(find_card\(test_name\), state\)/);
		expect(index).not.toMatch(/dataset\.(testCount|pendingCount|runCount|testFailures)\s*=/);
		expect(index).not.toMatch(/stats\??\.(tests|pending|fail)/);
		// The decision text lives in the pure module, where the chain leg reads it.
		const decision = script('card_state.js');
		expect(decision).toContain('(registered zero tests)');
		expect(decision).toContain('(ran zero tests, ');
		expect(decision).not.toMatch(/\bdocument\b|\bwindow\b|^\s*import /m);
		// The runner's scrape spreads the dataset and interprets NOTHING in the
		// browser: no attribute name appears inside page.evaluate.
		const runner = readFileSync(join(REPO_ROOT, 'scripts/client_test_runner.ts'), 'utf8');
		const evaluateStart = runner.indexOf('const scraped: ScrapedRun = await page.evaluate(');
		expect(evaluateStart).toBeGreaterThan(0);
		const evaluate = runner.slice(
			evaluateStart,
			runner.indexOf('exitCode = report(', evaluateStart),
		);
		expect(evaluate).toMatch(/dataset:\s*\{\s*\.\.\.\(card as HTMLElement\)\.dataset\s*\}/);
		expect(evaluate).not.toMatch(/dataset\.(testCount|pendingCount|runCount|testFailures)/);
		expect(runner).toMatch(/report\(observeRun\(scraped\)\)/);
	});

	test('the ONE frame loader counts the load, run-all resets it (GATE-11)', () => {
		const index = script('index.js');
		// The frame src is set in exactly one place, and that place counts the load.
		const loaders = index.match(/test_frame\.src\s*=/g) ?? [];
		expect(loaders).toHaveLength(1);
		// …and that place is inside the loader that bumps the count: from
		// `window.load_test =` to the next top-level section, both the src set
		// and the `count_run(` CALL (not merely its import) must appear.
		const loaderStart = index.indexOf('window.load_test = function');
		expect(loaderStart).toBeGreaterThan(0);
		const loader = index.slice(loaderStart, index.indexOf('// run all', loaderStart));
		expect(loader).toMatch(/test_frame\.src\s*=/);
		expect(loader).toMatch(/\bcount_run\(find_card\(test_name\)\)/);
		expect(index).toMatch(/for \(const card of visible_cards\) reset_run_count\(card\)/);
		// The semantics of count_run / reset_run_count are proved in the chain
		// legs above; runtime defence when the static one is fooled: a card with
		// a verdict and NO run count is red (proved in memory above).
	});

	test('the browser run and --replay end in the SAME exit (so the replay legs measure the browser run)', () => {
		// `conclude` is the one place the runner exits on a verdict; the browser
		// run's promise resolves INTO it and --replay calls it. Without this, a
		// browser-path `exitCode = 0` would sit outside everything --replay proves.
		const runner = readFileSync(join(REPO_ROOT, 'scripts/client_test_runner.ts'), 'utf8');
		const stripped = runner
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
		expect(stripped).toMatch(
			/function conclude\(scraped: ScrapedRun\): never \{\s*process\.exit\(report\(observeRun\(scraped\)\)\);\s*\}/,
		);
		expect(stripped).toMatch(/main\(\)\.then\(conclude,/);
		expect(stripped).toMatch(/conclude\(JSON\.parse\(readFileSync\(replayFile/);
		// `report(` is CALLED exactly once (inside conclude); no other tail exists.
		const reportCalls = stripped.match(/(?<!function )\breport\(/g) ?? [];
		expect(reportCalls).toHaveLength(1);
		expect(stripped).not.toMatch(/\bexitCode\s*=\s*0\b/);
	});

	test('NOT_A_SUITE is shared, not duplicated', () => {
		// The registration tripwire must read the same enumerated list.
		const sibling = readFileSync(
			join(REPO_ROOT, 'test/unit/client_suite_registration_tripwire.test.ts'),
			'utf8',
		);
		expect(sibling).toContain("from '../helpers/client_suite_census.ts'");
		expect(sibling).not.toMatch(/const NOT_A_SUITE\s*[:=]/);
		expect(Object.keys(NOT_A_SUITE).length).toBe(3);
	});
});
