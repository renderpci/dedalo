#!/usr/bin/env bun
/**
 * Regenerate the SHRINK-ONLY vacuity budget (P2-19).
 *
 *   bun run scripts/gate_vacuity_budget.ts            # report
 *   bun run scripts/gate_vacuity_budget.ts --update   # bank a LOWER count
 *
 * REFUSES to raise either number: a ratchet that records whatever it measured
 * this minute is not a ratchet, it is a diary. (P2-18 is the general form of
 * that rule; this generator is written to satisfy it from the start.)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptinessAssertions, vacuitySites } from './lib/vacuity_census.ts';

const REPO_ROOT = join(import.meta.dir, '..');
const BUDGET_PATH = join(REPO_ROOT, 'engineering', 'gate_vacuity_budget.json');

const NOTE =
	'SHRINK-ONLY budget for P2-19. silent_returns: test bodies that `return` before asserting ' +
	'anything — Bun counts each as a PASS. unfloored_emptiness: files asserting toEqual([]) with no ' +
	'corpus floor, which pass when the census feeding them read nothing. Both may only go DOWN. ' +
	'The honest idiom for a genuinely unrunnable test is test.skip with the reason in the test NAME. ' +
	'Regenerate with: bun run scripts/gate_vacuity_budget.ts --update (it REFUSES to raise).';

const counts = {
	silent_returns: vacuitySites(REPO_ROOT).length,
	unfloored_emptiness: emptinessAssertions(REPO_ROOT).length,
};

if (!process.argv.includes('--update')) {
	console.log(JSON.stringify(counts, null, '\t'));
	process.exit(0);
}

if (existsSync(BUDGET_PATH)) {
	const current = JSON.parse(readFileSync(BUDGET_PATH, 'utf8')) as typeof counts;
	for (const key of ['silent_returns', 'unfloored_emptiness'] as const) {
		if (counts[key] > current[key]) {
			console.error(
				`REFUSED: ${key} is ${counts[key]}, ABOVE the recorded ${current[key]}. ` +
					'This ratchet only shrinks — fix the new sites instead of recording them.',
			);
			process.exit(1);
		}
	}
}

writeFileSync(
	BUDGET_PATH,
	`${JSON.stringify({ _: NOTE, ...counts, measured: new Date().toISOString().slice(0, 10) }, null, '\t')}\n`,
);
console.log(`wrote ${BUDGET_PATH}:`, counts);
