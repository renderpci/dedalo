/**
 * TRIPWIRE — a gate that can pass while asserting nothing is not a gate
 * (P2-19; closes GATE-25, GATE-26, GATE-27, GATE-28, GATE-29, GATE-32).
 *
 * Bun counts a test that returns before asserting as a PASS. Measured
 * 2026-08-31: 325 such sites across 110 files, and 302 `toEqual([])` verdicts
 * whose feeding census has no floor — an emptiness assertion passes perfectly
 * when the scan that fed it read nothing at all.
 *
 * The sharpest instances the audit names:
 *   - the P5 install gate, whose header says it "Skips loudly when no admin
 *     Postgres connection is available" while its body returns bare with NO
 *     output — the whole PHP-free install path reported two green ticks having
 *     spawned nothing whenever the developer's role lacked CREATEDB;
 *   - `media_protection`'s escape guard, unconditionally true under the
 *     harness, so the assertion that a media mode with no root must THROW was
 *     unconditionally skipped and reported PASS;
 *   - `coex_tag_tripwire` and `client_caller_chain_tripwire`, which assert
 *     "this list is empty" over directory walks that can silently yield
 *     nothing — rename a directory and both pass having read zero bytes.
 *
 * THE HONEST IDIOM is `test.skip` with the reason in the test NAME, which the
 * runner then says out loud. This gate freezes today's debt SHRINK-ONLY so no
 * new silent return can land, and the burn-down proceeds as its own pass — the
 * same shape as the CRAP and browser-lint ratchets.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptinessAssertions, vacuitySites } from '../../scripts/lib/vacuity_census.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const BUDGET_PATH = join(REPO_ROOT, 'engineering', 'gate_vacuity_budget.json');

interface Budget {
	silent_returns: number;
	unfloored_emptiness: number;
	measured: string;
}

function budget(): Budget {
	return JSON.parse(readFileSync(BUDGET_PATH, 'utf8')) as Budget;
}

describe('a gate must be able to fail', () => {
	const sites = vacuitySites(REPO_ROOT);
	const emptiness = emptinessAssertions(REPO_ROOT);
	const allowed = budget();

	test('the census actually reads the suite (anti-vacuity — this gate included)', () => {
		// This file asserts emptiness-shaped things itself. If the walker returned
		// nothing, every rule below would pass while reading zero bytes — the exact
		// defect being gated. So the scan must prove it saw the tree.
		const scanned = new Set(sites.map((site) => site.file));
		expect(scanned.size).toBeGreaterThan(50);
		expect(sites.length).toBeGreaterThan(100);
	});

	test('silent early returns may only SHRINK', () => {
		expect(
			sites.length,
			`${sites.length} test bodies return before asserting anything (budget ` +
				`${allowed.silent_returns}). Bun counts each as a PASS. Use test.skip with the ` +
				'reason in the test NAME so the runner says what did not run — never a bare ' +
				'`return`. The budget only falls.',
		).toBeLessThanOrEqual(allowed.silent_returns);
	});

	test('unfloored emptiness assertions may only SHRINK', () => {
		expect(
			emptiness.length,
			`${emptiness.length} files assert toEqual([]) with no corpus floor (budget ` +
				`${allowed.unfloored_emptiness}). Such a verdict passes when the census that fed ` +
				'it read NOTHING. Add a floor (expect(scanned.length).toBeGreaterThan(N)) and, ' +
				'better, a planted-offender positive control.',
		).toBeLessThanOrEqual(allowed.unfloored_emptiness);
	});

	test('the budget is banked when it falls', () => {
		// A budget left far above reality stops being a ratchet: it silently
		// re-admits everything already paid off. Bank progress in the same commit.
		const slackReturns = allowed.silent_returns - sites.length;
		const slackEmptiness = allowed.unfloored_emptiness - emptiness.length;
		expect(
			slackReturns,
			`The budget allows ${allowed.silent_returns} silent returns but there are ` +
				`${sites.length}. Lower it — regenerate with scripts/gate_vacuity_budget.ts --update.`,
		).toBeLessThanOrEqual(0);
		expect(slackEmptiness, 'Lower the unfloored-emptiness budget too.').toBeLessThanOrEqual(0);
	});

	test('the oracle canary tells the truth about what it did NOT verify', () => {
		// GATE-32. FIXTURE_EXEMPT_GATES is legitimately EMPTY — those 23 live-only
		// gates RETIRED with the PHP oracle. The defect is different and the first
		// draft of this test got it wrong: four parity files still hold blocks
		// gated on hasLivePhpOracle(), which is false FOREVER (ORACLE_MODE defaults
		// to fixtures and a re-harvest is impossible by definition). They are in
		// the tree, counted as passing files, and verify nothing. The canary — the
		// one gate whose entire job is to say what a run does not verify — could
		// not see them, because the only list it consulted was the empty one.
		const canary = readFileSync(join(REPO_ROOT, 'test/parity/oracle_canary.test.ts'), 'utf8');
		expect(
			canary,
			'oracle_canary must census the permanently-unreachable parity gates FROM THE TREE ' +
				'and say so out loud. A canary that reports zero skips is not a canary.',
		).toContain('permanentlyUnreachableParityGates');
		expect(canary, 'the census must be derived, not a hand-kept list').toMatch(
			/scanSync|readdirSync/,
		);
	});
});
