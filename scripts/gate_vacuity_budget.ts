#!/usr/bin/env bun
/**
 * Regenerate the SHRINK-ONLY vacuity budget (P2-19).
 *
 *   bun run scripts/gate_vacuity_budget.ts                 # report
 *   bun run scripts/gate_vacuity_budget.ts --update        # bank a LOWER count
 *   bun run scripts/gate_vacuity_budget.ts --check --json  # the bank's verdict
 *                                                          # (scripts/lib/ratchet_check.ts RatchetCheck)
 *
 * The gate (test/unit/gate_vacuity_tripwire.test.ts) requires the count to EQUAL
 * the budget, so a fall is red until banked — which is what `baselines:bank`
 * does, through `--update` and never by writing the JSON itself.
 *
 * REFUSES to raise either number: a ratchet that records whatever it measured
 * this minute is not a ratchet, it is a diary. (P2-18 is the general form of
 * that rule; this generator is written to satisfy it from the start.)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	classifyCount,
	emitRatchetCheck,
	type RatchetCheck,
	wantsCheckJson,
} from './lib/ratchet_check.ts';
import {
	CORPUS_FLOOR,
	emptinessAssertions,
	testFilesScanned,
	vacuitySites,
} from './lib/vacuity_census.ts';

const REPO_ROOT = join(import.meta.dir, '..');
const BUDGET_PATH = join(REPO_ROOT, 'engineering', 'gate_vacuity_budget.json');

const NOTE =
	'SHRINK-ONLY budget for P2-19. silent_returns: test bodies that `return` before asserting ' +
	'anything — Bun counts each as a PASS. unfloored_emptiness: files asserting toEqual([]) with no ' +
	'corpus floor, which pass when the census feeding them read nothing. Both may only go DOWN. ' +
	'The honest idiom for a genuinely unrunnable test is test.skip with the reason in the test NAME. ' +
	'Regenerate with: bun run scripts/gate_vacuity_budget.ts --update (it REFUSES to raise).';

/** The two budgeted counts — both debt, both meant to fall to zero. */
export interface VacuityCounts {
	silent_returns: number;
	unfloored_emptiness: number;
}

const KEYS = ['silent_returns', 'unfloored_emptiness'] as const;

/**
 * THE BANK'S VERDICT (`--check --json`, scripts/lib/ratchet_check.ts), pure so the
 * bank's gate plants it in both directions (test/unit/baselines_bank_native.test.ts).
 *
 * Both counts are BUDGETS (debt): lower is an improvement the `--update` writer banks
 * flaglessly, higher is growth it refuses. Two things are regressions no matter what
 * the counts say:
 *   - a walk at or under the corpus floor (`CORPUS_FLOOR`, scripts/lib/vacuity_census.ts —
 *     the ONE value the gate asserts too): both counts are meant to FALL to zero, so a
 *     census that read nothing looks like the best burn-down ever, and the bank must see
 *     a blind walk as a regression, never as an improvement to write down;
 *   - a missing budget (`budget === null`): not "no constraints" — a regression the bank
 *     must not paper over by minting one.
 */
export function vacuityVerdict(
	scanned: number,
	counts: VacuityCounts,
	budget: VacuityCounts | null,
): RatchetCheck {
	const verdict: RatchetCheck = {
		ratchet: 'gate_vacuity_budget',
		baselines: ['engineering/gate_vacuity_budget.json'],
		improvements: [],
		regressions: [],
	};
	if (scanned <= CORPUS_FLOOR) {
		verdict.regressions.push(
			`vacuity: only ${scanned} test files scanned (floor ${CORPUS_FLOOR}) — the walk went blind; fix the census, never the budget`,
		);
	}
	if (budget === null) {
		verdict.regressions.push(
			'engineering/gate_vacuity_budget.json is missing — the ratchet cannot run without it',
		);
	} else {
		for (const key of KEYS) classifyCount(verdict, key, budget[key], counts[key]);
	}
	return verdict;
}

function readBudget(): VacuityCounts | null {
	if (!existsSync(BUDGET_PATH)) return null;
	return JSON.parse(readFileSync(BUDGET_PATH, 'utf8')) as VacuityCounts;
}

function main(): number {
	const counts: VacuityCounts = {
		silent_returns: vacuitySites(REPO_ROOT).length,
		unfloored_emptiness: emptinessAssertions(REPO_ROOT).length,
	};

	if (wantsCheckJson(process.argv)) {
		return emitRatchetCheck(vacuityVerdict(testFilesScanned(REPO_ROOT), counts, readBudget()));
	}

	if (!process.argv.includes('--update')) {
		console.log(JSON.stringify(counts, null, '\t'));
		return 0;
	}

	const current = readBudget();
	if (current !== null) {
		for (const key of KEYS) {
			if (counts[key] > current[key]) {
				console.error(
					`REFUSED: ${key} is ${counts[key]}, ABOVE the recorded ${current[key]}. ` +
						'This ratchet only shrinks — fix the new sites instead of recording them.',
				);
				return 1;
			}
		}
	}

	writeFileSync(
		BUDGET_PATH,
		`${JSON.stringify({ _: NOTE, ...counts, measured: new Date().toISOString().slice(0, 10) }, null, '\t')}\n`,
	);
	console.log(`wrote ${BUDGET_PATH}:`, counts);
	return 0;
}

if (import.meta.main) process.exit(main());
