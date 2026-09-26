/**
 * CLIENT GATE VERDICT — the pure decision behind `bun run test:client`.
 *
 * Extracted from scripts/client_test_runner.ts (P0-2 / GATE-10..13) so the
 * verdict can be PROVED in a hermetic gate (test/unit/client_gate_inventory_tripwire)
 * instead of only exercised by a five-minute browser run: the runner scrapes the
 * page, this file decides, and the tripwire drives this file over planted
 * observations. `concludeRun` is the WHOLE decide-and-exit — verdict, the
 * `--update` banking and the exit code — so the runner's own tail is a print
 * loop and one `process.exit`, and the runner's `--replay` proves that tail as
 * a subprocess over a planted observation file.
 *
 * ── THE INVENTORY RECORD ─────────────────────────────────────────────────────
 * `engineering/client_gate_inventory.json` — shrink-only, in engineering/
 * because a gate reads it:
 *   suite_floor                 minimum CARDS the run must observe (non-deferred),
 *   mocha_test_floor            minimum mocha tests those cards must have RUN —
 *                               `tests - pending` per card, because mocha counts
 *                               a pending test (it.skip, a callback-less it(), a
 *                               this.skip()) inside `stats.tests`; a suite whose
 *                               tests are all pending ran nothing,
 *   assertion_free_it_budget    the STATIC count of `it()` bodies with no
 *                               assertion across the registered suites, which
 *                               may only fall (GATE-13's ratchet),
 *   skipped_registration_budget the STATIC count of registrations that can
 *                               never run — it.skip / xit / a callback-less
 *                               it() / describe.skip / xdescribe / xcontext /
 *                               context.skip — which may only fall: a suite
 *                               converted wholesale to it.skip is the static
 *                               shape of the all-pending hole.
 * A run that observes fewer suites or fewer RAN tests than the floor is RED
 * whatever its pass count says: a green over almost nothing is the whole class
 * this closes. Banked by the runner's `--update` after a run, which REFUSES to
 * lower a floor or raise a budget — a legitimate drop is a hand edit whose
 * commit says which suites went and why.
 *
 * ── THE OTHER LEGS ───────────────────────────────────────────────────────────
 *   - any card that was LOADED more than once during the run is RED
 *     (`data-run-count`, incremented by the page's one frame loader and reset
 *     when `run all` starts): the page's silent re-run was deleted (GATE-11),
 *     and a retry re-added under any name still has to load the frame again,
 *   - any non-deferred card that ran and reported ZERO ran tests, or no count
 *     at all, is RED (GATE-12): a suite that imports cleanly and registers
 *     nothing — or registers only pending tests — is not a pass,
 *   - a pending card, a failure outside KNOWN_FAILING, and a KNOWN_FAILING entry
 *     that passes are RED, as before.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyCount, type RatchetCheck } from './ratchet_check.ts';

export const REPO_ROOT = join(import.meta.dir, '..', '..');
export const INVENTORY_PATH = 'engineering/client_gate_inventory.json';

export interface ClientGateInventory {
	rule: string;
	suite_floor: number;
	mocha_test_floor: number;
	assertion_free_it_budget: number;
	skipped_registration_budget: number;
}

export const INVENTORY_KEYS = [
	'suite_floor',
	'mocha_test_floor',
	'assertion_free_it_budget',
	'skipped_registration_budget',
] as const;

export const INVENTORY_RULE =
	'SHRINK-ONLY inventory floor for the browser client tier (bun run test:client). suite_floor: the run must observe at least this many non-deferred suite cards; mocha_test_floor: those cards must have RUN at least this many mocha tests in total (per-card data-test-count MINUS data-pending-count, posted by frame_runner.js from runner.stats.tests / runner.stats.pending — mocha counts a pending test inside `tests`); assertion_free_it_budget: the static count of it() bodies with no assertion across the registered suites (test/helpers/client_suite_census.ts) — may only fall; skipped_registration_budget: the static count of registrations that can never run (it.skip, xit, a callback-less it(), describe.skip, xdescribe, xcontext, context.skip) — may only fall. Banked by `bun run scripts/client_test_runner.ts --update` after a green run, which REFUSES to lower a floor or raise a budget; a legitimate drop is a hand edit whose commit message says which suites went and why. Read by scripts/lib/client_gate_verdict.ts and test/unit/client_gate_inventory_tripwire.test.ts.';

/** One card, as the runner scraped it. */
export interface ObservedSuite {
	name: string;
	group: string;
	/** deferred | pass | fail | running | pending */
	status: string;
	/** `data-test-count` (mocha's `stats.tests`, pending INCLUDED), or null when the card carries none. */
	testCount: number | null;
	/** `data-pending-count` (mocha's `stats.pending`), or null when the card carries none. */
	pendingCount: number | null;
	/** `data-run-count`: how many times the page loaded this suite's frame since `run all` started; null = never. */
	runCount: number | null;
}

/** One failing mocha test, as the frame reported it (client/.../frame_runner.js). */
export interface SuiteFailure {
	title: string;
	message: string;
	stack?: string;
}

/**
 * ONE CARD EXACTLY AS THE PAGE HOLDS IT — the status class on its dot and its
 * `dataset` VERBATIM (`{...card.dataset}`, every `data-*` attribute as the
 * string it is). The runner's `page.evaluate` returns nothing else per card:
 * it knows no attribute name, so no default can be applied on the browser
 * side of the wire where no gate runs. Everything the verdict needs is derived
 * HERE, from the strings, by {@link observeCard} — and the tripwire drives
 * that derivation over a dataset produced by the page's own card_state.js.
 */
export interface ScrapedCard {
	/** deferred | pass | fail | running | pending, as read off the dot's classes. */
	status: string;
	dataset: Record<string, string | undefined>;
}

/**
 * ONE axe-core violation, per SURFACE and per rule: `nodes` is how many elements
 * on that surface the rule fired on. The pair (surface, rule id) is the budget's
 * key, so a regression on one surface cannot hide behind another surface's debt.
 */
export interface AxeViolation {
	surface: string;
	id: string;
	impact: string | null;
	nodes: number;
}

/** What the axe phase observed: which surfaces it actually mounted, and every violation. */
export interface AxeObservation {
	surfaces: string[];
	violations: AxeViolation[];
}

/** The page scrape, raw: the cards, the page's counters, the per-group stats. Also the `--replay` file shape. */
export interface ScrapedRun {
	cards: ScrapedCard[];
	counters: { total: number; pass: number; fail: number; pending: number };
	groups: Record<string, { pass: number; fail: number; pending: number }>;
	/**
	 * The accessibility phase. Absent means it did not run (an old replay file);
	 * present means its verdict is part of this run's, judged against
	 * engineering/client_a11y_budget.json.
	 */
	axe?: AxeObservation;
}

/** One card interpreted: the verdict's input plus the failure detail the runner prints. */
export interface SuiteResult extends ObservedSuite {
	/** Why it is red. Empty on a failing suite = no mocha failure at all. */
	failures: SuiteFailure[];
}

/**
 * A `data-*` count: a non-negative integer string, or NULL. Never a default —
 * `null` is what the verdict reds on ("no test count", "no pending count",
 * "no run count"), and a `?? 0` or `?? 1` here would be exactly the
 * one-line reopening the reviewers of P0-2 demonstrated.
 */
export function scrapedCount(raw: string | undefined): number | null {
	return raw !== undefined && /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : null;
}

/** Interpret one scraped card. Pure; the ONLY reader of the card's attribute names. */
export function observeCard(card: ScrapedCard): SuiteResult {
	const d = card.dataset;
	let failures: SuiteFailure[] = [];
	if (d.testFailures !== undefined && d.testFailures !== '') {
		try {
			const parsed = JSON.parse(d.testFailures) as unknown;
			failures = Array.isArray(parsed) ? (parsed as SuiteFailure[]) : [];
		} catch {
			failures = [{ title: '(unparseable failure payload)', message: d.testFailures }];
		}
	}
	return {
		name: d.testName ?? '',
		group: d.group ?? '',
		status: card.status,
		// `data-test-count` / `data-pending-count`: mocha's stats.tests and
		// stats.pending, posted by frame_runner.js and parked by card_state.js;
		// the verdict floors their DIFFERENCE. Absent = the suite never reached
		// mocha's end. `data-run-count`: how many times the page loaded the frame
		// since `run all` started — 1 on a clean run; a retry reads 2 and is red.
		testCount: scrapedCount(d.testCount),
		pendingCount: scrapedCount(d.pendingCount),
		runCount: scrapedCount(d.runCount),
		failures,
	};
}

/** The whole scrape interpreted — what the runner's tail prints and decides on. */
export interface RunResults {
	total: number;
	pass: number;
	fail: number;
	pending: number;
	groups: ScrapedRun['groups'];
	suites: SuiteResult[];
	axe?: AxeObservation;
}

export function observeRun(scraped: ScrapedRun): RunResults {
	const c = scraped.counters;
	const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
	return {
		total: n(c?.total),
		pass: n(c?.pass),
		fail: n(c?.fail),
		pending: n(c?.pending),
		groups: scraped.groups ?? {},
		suites: (scraped.cards ?? []).map((card) =>
			observeCard({ status: String(card?.status ?? 'pending'), dataset: card?.dataset ?? {} }),
		),
		axe: scraped.axe,
	};
}

// ---------------------------------------------------------------------------
// The accessibility budget (audit 2026-08-26 row P1-18 / finding CLI-10, CLI-22).
// ---------------------------------------------------------------------------

export const A11Y_BUDGET_PATH = 'engineering/client_a11y_budget.json';

export interface A11yBudget {
	rule: string;
	/** The surfaces the phase must have mounted; a missing one is red, not skipped. */
	required_surfaces: string[];
	/** key: `<surface>:<axe rule id>` → the node count still allowed, with its reason. */
	violations: Record<string, { nodes: number; reason: string }>;
}

export function loadA11yBudget(): A11yBudget {
	const path = join(REPO_ROOT, A11Y_BUDGET_PATH);
	if (!existsSync(path)) {
		throw new Error(
			`client_a11y_budget: ${A11Y_BUDGET_PATH} is missing — the axe phase cannot be judged without it.`,
		);
	}
	const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<A11yBudget>;
	if (!Array.isArray(parsed.required_surfaces) || parsed.required_surfaces.length === 0) {
		throw new Error(
			`client_a11y_budget: ${A11Y_BUDGET_PATH}.required_surfaces must be a non-empty array`,
		);
	}
	if (parsed.violations === null || typeof parsed.violations !== 'object') {
		throw new Error(`client_a11y_budget: ${A11Y_BUDGET_PATH}.violations must be an object`);
	}
	return parsed as A11yBudget;
}

/**
 * The pure a11y verdict: every reason the axe phase is red, one line each.
 *
 * The law is the one every other baseline in this repo follows. A violation
 * over its budget is red; an unbudgeted violation is red; a SURFACE the phase
 * did not mount is red (silence is not a pass); and a budgeted violation that
 * no longer fires is red too — a shrink that is not banked leaves an excuse
 * standing for a defect that is gone.
 */
export function judgeAxe(observed: AxeObservation, budget: A11yBudget): string[] {
	const errors: string[] = [];
	for (const surface of budget.required_surfaces) {
		if (!observed.surfaces.includes(surface)) {
			errors.push(
				`A11Y: the axe phase did not mount the '${surface}' surface — an unjudged surface is red, never silent`,
			);
		}
	}
	const seen = new Set<string>();
	for (const violation of observed.violations) {
		const key = `${violation.surface}:${violation.id}`;
		seen.add(key);
		const banked = budget.violations[key];
		if (banked === undefined) {
			errors.push(
				`A11Y: NEW violation ${key} on ${violation.nodes} node(s)${violation.impact ? ` (${violation.impact})` : ''} — fix it, or bank it with a reason in ${A11Y_BUDGET_PATH}`,
			);
		} else if (violation.nodes > banked.nodes) {
			errors.push(
				`A11Y: ${key} fired on ${violation.nodes} node(s), budget is ${banked.nodes} — the budget is SHRINK-ONLY`,
			);
		}
	}
	for (const [key, banked] of Object.entries(budget.violations)) {
		const surface = key.split(':')[0] ?? '';
		if (!observed.surfaces.includes(surface)) continue; // already reported as unmounted
		const violation = observed.violations.find((v) => `${v.surface}:${v.id}` === key);
		const nodes = violation?.nodes ?? 0;
		if (nodes < banked.nodes) {
			errors.push(
				`A11Y: ${key} now fires on ${nodes} node(s), banked ${banked.nodes} — lower it in ${A11Y_BUDGET_PATH} in the change that fixed it`,
			);
		}
	}
	return errors;
}

export interface VerdictInput {
	suites: ObservedSuite[];
	/** The page's pending counter. */
	pending: number;
	strict: boolean;
	knownFailing: ReadonlyMap<string, string>;
	inventory: ClientGateInventory;
	/** The accessibility phase's observation, when it ran, plus the budget it is judged against. */
	axe?: AxeObservation;
	a11yBudget?: A11yBudget;
}

export interface Verdict {
	exitCode: 0 | 1;
	/** Every reason the run is red, one line each. Empty on green. */
	errors: string[];
	/** Non-deferred cards observed. */
	observedSuites: number;
	/** Mocha tests those cards RAN (sum of tests - pending; a missing count is 0). */
	mochaTests: number;
	/** Mocha tests those cards reported PENDING. */
	mochaPending: number;
	unexpectedFailures: string[];
	unexpectedPasses: string[];
}

export function loadInventory(): ClientGateInventory {
	const path = join(REPO_ROOT, INVENTORY_PATH);
	if (!existsSync(path)) {
		throw new Error(
			`client_gate_inventory: ${INVENTORY_PATH} is missing — the client gate cannot floor its inventory without it. Bank one with: bun run scripts/client_test_runner.ts --update`,
		);
	}
	const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<ClientGateInventory>;
	for (const key of INVENTORY_KEYS) {
		const value = parsed[key];
		if (!Number.isInteger(value) || (value as number) < 0) {
			throw new Error(
				`client_gate_inventory: ${INVENTORY_PATH}.${key} is not a non-negative integer`,
			);
		}
	}
	return parsed as ClientGateInventory;
}

/** The tests a card actually RAN: mocha's `tests` minus its `pending`. Null when the card carries no count. */
export function ranTests(suite: Pick<ObservedSuite, 'testCount' | 'pendingCount'>): number | null {
	if (suite.testCount === null) return null;
	return suite.testCount - (suite.pendingCount ?? 0);
}

/** The pure verdict. Order of the error lines is the order the runner prints them. */
export function computeVerdict(input: VerdictInput): Verdict {
	const errors: string[] = [];
	const gated = input.suites.filter((s) => s.status !== 'deferred');
	const observedSuites = gated.length;
	const mochaTests = gated.reduce((sum, s) => sum + (ranTests(s) ?? 0), 0);
	const mochaPending = gated.reduce((sum, s) => sum + (s.pendingCount ?? 0), 0);

	// THE INVENTORY FLOOR, first — a run that observed almost nothing must not be
	// able to report success whatever else it says.
	if (observedSuites === 0) {
		errors.push(
			'INVENTORY: observed ZERO suites — the page never rendered the registry (an import-time error in the module chain?)',
		);
	} else if (observedSuites < input.inventory.suite_floor) {
		errors.push(
			`INVENTORY: observed ${observedSuites} suites, floor is ${input.inventory.suite_floor} — the page did not render the registry this run is supposed to check`,
		);
	}
	if (mochaTests < input.inventory.mocha_test_floor) {
		errors.push(
			`INVENTORY: ${mochaTests} mocha tests RAN (${mochaPending} pending), floor is ${input.inventory.mocha_test_floor} — suites are running fewer tests than the record`,
		);
	}
	for (const suite of gated) {
		if (suite.status !== 'pass' && suite.status !== 'fail') continue; // never loaded: counted below
		if (suite.runCount === null) {
			errors.push(
				`RETRIED: ${suite.group}/${suite.name} has a verdict but no run count — the page loaded it outside its own frame loader, or a stale index.js`,
			);
		} else if (suite.runCount > 1) {
			errors.push(
				`RETRIED: ${suite.group}/${suite.name} was loaded ${suite.runCount} times in one run — a re-run suite is red whatever its final dot says`,
			);
		}
	}
	for (const suite of gated) {
		if (suite.status === 'pending' || suite.status === 'running') continue; // counted below
		if (suite.testCount === null) {
			errors.push(
				`ZERO TESTS: ${suite.group}/${suite.name} reported no test count (the frame never reached mocha's end, or a stale frame_runner.js)`,
			);
		} else if (suite.pendingCount === null) {
			errors.push(
				`ZERO TESTS: ${suite.group}/${suite.name} reported a test count but no pending count — a stale index.js cannot tell a ran test from a skipped one`,
			);
		} else if (suite.testCount === 0) {
			errors.push(`ZERO TESTS: ${suite.group}/${suite.name} registered zero mocha tests`);
		} else if (suite.testCount - suite.pendingCount <= 0) {
			errors.push(
				`ZERO TESTS: ${suite.group}/${suite.name} ran zero mocha tests (${suite.pendingCount} pending of ${suite.testCount})`,
			);
		}
	}

	if (input.pending > 0) errors.push(`${input.pending} test suite(s) did not complete.`);

	const failed = gated.filter((s) => s.status === 'fail').map((s) => s.name);
	const unexpectedFailures = input.strict
		? failed
		: failed.filter((name) => !input.knownFailing.has(name));
	const unexpectedPasses = input.strict
		? []
		: [...input.knownFailing.keys()].filter(
				(name) => gated.find((s) => s.name === name)?.status === 'pass',
			);
	for (const name of unexpectedFailures) {
		errors.push(`NEW failing suite (not in KNOWN_FAILING): ${name}`);
	}
	for (const name of unexpectedPasses) {
		errors.push(
			`${name} is listed in KNOWN_FAILING but PASSED — delete its row in the same change that fixed it (a stale excuse becomes a blanket).`,
		);
	}

	// The accessibility phase. It rides the SAME verdict and the SAME exit, so a
	// keyboard- or screen-reader regression on the cataloguing surface reds the
	// client gate exactly like a failing suite does.
	if (input.axe !== undefined && input.a11yBudget !== undefined) {
		errors.push(...judgeAxe(input.axe, input.a11yBudget));
	}

	return {
		exitCode: errors.length > 0 ? 1 : 0,
		errors,
		observedSuites,
		mochaTests,
		mochaPending,
		unexpectedFailures,
		unexpectedPasses,
	};
}

export interface BankInput {
	observedSuites: number;
	mochaTests: number;
	assertionFreeIt: number;
	skippedRegistrations: number;
}

/**
 * The next inventory record, or the refusals that stop it being written. A
 * floor may only rise and a budget may only fall; the SAME rule the red
 * baselines and the crap ratchet follow.
 */
export function bankInventory(
	current: ClientGateInventory | null,
	observed: BankInput,
): { next: ClientGateInventory; refusals: string[] } {
	const refusals: string[] = [];
	if (current !== null) {
		if (observed.observedSuites < current.suite_floor) {
			refusals.push(
				`REFUSING to lower suite_floor ${current.suite_floor} → ${observed.observedSuites}: fewer suites ran than the record. If suites were deliberately removed, edit ${INVENTORY_PATH} by hand and say which ones and why in the commit.`,
			);
		}
		if (observed.mochaTests < current.mocha_test_floor) {
			refusals.push(
				`REFUSING to lower mocha_test_floor ${current.mocha_test_floor} → ${observed.mochaTests}: fewer mocha tests ran than the record.`,
			);
		}
		if (observed.assertionFreeIt > current.assertion_free_it_budget) {
			refusals.push(
				`REFUSING to raise assertion_free_it_budget ${current.assertion_free_it_budget} → ${observed.assertionFreeIt}: a new it() with no assertion was added. Assert something.`,
			);
		}
		if (observed.skippedRegistrations > current.skipped_registration_budget) {
			refusals.push(
				`REFUSING to raise skipped_registration_budget ${current.skipped_registration_budget} → ${observed.skippedRegistrations}: a test was switched off (it.skip / xit / a callback-less it() / describe.skip). Fix it or delete it.`,
			);
		}
	}
	return {
		next: {
			rule: INVENTORY_RULE,
			suite_floor: observed.observedSuites,
			mocha_test_floor: observed.mochaTests,
			assertion_free_it_budget: observed.assertionFreeIt,
			skipped_registration_budget: observed.skippedRegistrations,
		},
		refusals,
	};
}

/** Write the record. The caller has already checked `refusals` is empty. */
export function writeInventory(next: ClientGateInventory): void {
	writeFileSync(join(REPO_ROOT, INVENTORY_PATH), `${JSON.stringify(next, null, '\t')}\n`);
}

/** What the static census measured, for banking. */
export interface StaticCensus {
	assertionFreeIt: number;
	skippedRegistrations: number;
}

/**
 * THE STATIC HALF OF THE RECORD, judged without a browser — the bank's verdict for
 * `bun run scripts/client_test_runner.ts --check --json` (scripts/lib/ratchet_check.ts).
 *
 * Three of the four numbers are STATIC facts about the tree, and the hermetic tripwire
 * (client_gate_inventory_tripwire) requires each to EQUAL its measure — so a burn-down
 * (an assertion added to an empty it(), an it.skip deleted) or a newly registered suite
 * reddens the hermetic tier until the record is re-banked, and the only writer was the
 * five-minute browser run's `--update`. This is the same rule as {@link bankInventory},
 * applied to the static numbers only:
 *   assertion_free_it_budget / skipped_registration_budget — BUDGETS: lower is banked,
 *     higher is refused;
 *   suite_floor — a FLOOR equal to the registry's gated cards: higher is banked (a new
 *     suite raises it), lower is refused (removing suites stays a hand edit whose
 *     commit says which and why).
 * `mocha_test_floor` is the one DYNAMIC number (what mocha actually RAN) and is carried
 * through untouched: only a green browser run may move it.
 */
export function staticInventoryVerdict(
	current: ClientGateInventory,
	census: StaticCensus,
	gatedCards: number,
): { check: RatchetCheck; next: ClientGateInventory } {
	const check: RatchetCheck = {
		ratchet: 'client_gate_inventory',
		baselines: [INVENTORY_PATH],
		improvements: [],
		regressions: [],
	};
	classifyCount(
		check,
		'assertion_free_it_budget',
		current.assertion_free_it_budget,
		census.assertionFreeIt,
	);
	classifyCount(
		check,
		'skipped_registration_budget',
		current.skipped_registration_budget,
		census.skippedRegistrations,
	);
	classifyCount(check, 'suite_floor', current.suite_floor, gatedCards, false);
	return {
		check,
		next: {
			rule: INVENTORY_RULE,
			suite_floor: gatedCards,
			mocha_test_floor: current.mocha_test_floor,
			assertion_free_it_budget: census.assertionFreeIt,
			skipped_registration_budget: census.skippedRegistrations,
		},
	};
}

export interface RunConclusion {
	exitCode: 0 | 1;
	/** What to print, in order: `error` lines go to stderr. */
	lines: { level: 'log' | 'error'; text: string }[];
	/** The record to write, when `--update` was asked for and nothing refused it. */
	banked: ClientGateInventory | null;
}

/**
 * THE WHOLE DECIDE-AND-EXIT, pure. The runner prints `lines`, writes `banked`
 * if present and exits with `exitCode` — nothing else, so there is no runner
 * branch left that could look at the verdict and decide otherwise.
 *
 * `--update` banks what a GREEN run observed only (a floor taken from a broken
 * run is a floor on the breakage), and a bank refused in either direction
 * makes the run red.
 */
export function concludeRun(
	verdict: Verdict,
	options: { update: boolean; current: ClientGateInventory | null; census: StaticCensus },
): RunConclusion {
	const lines: RunConclusion['lines'] = verdict.errors.map((text) => ({
		level: 'error',
		text,
	}));
	let exitCode: 0 | 1 = verdict.exitCode;
	let banked: ClientGateInventory | null = null;
	if (options.update) {
		if (verdict.exitCode !== 0) {
			lines.push({
				level: 'error',
				text: '--update REFUSED: the run is red; a floor is banked from a green run only.',
			});
			exitCode = 1;
		} else {
			const bank = bankInventory(options.current, {
				observedSuites: verdict.observedSuites,
				mochaTests: verdict.mochaTests,
				assertionFreeIt: options.census.assertionFreeIt,
				skippedRegistrations: options.census.skippedRegistrations,
			});
			if (bank.refusals.length > 0) {
				for (const text of bank.refusals) lines.push({ level: 'error', text });
				exitCode = 1;
			} else {
				banked = bank.next;
				lines.push({
					level: 'log',
					text: `Banked ${INVENTORY_PATH}: suite_floor=${bank.next.suite_floor} mocha_test_floor=${bank.next.mocha_test_floor} assertion_free_it_budget=${bank.next.assertion_free_it_budget} skipped_registration_budget=${bank.next.skipped_registration_budget}`,
				});
			}
		}
	}
	return { exitCode, lines, banked };
}
