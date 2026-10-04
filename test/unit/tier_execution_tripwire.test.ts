/**
 * TIER EXECUTION — a tier script must actually RUN the array it declares.
 *
 * P0-1 of the 2026-08-26 deep audit, gate 1 of 3. The sibling gates answer
 * different halves: `ci_workflow_tripwire` rule 3c answers "is every tripwire
 * ASSIGNED to a tier", `tier_assignment_tripwire` answers "does every test FILE have
 * an executing home", and this one answers the question underneath both — "does the
 * tier script execute anything at all?"
 *
 * It is not a hypothetical failure. `hermetic.sh` ran `bun run lint` before its
 * tripwire block under `set -e`, so for 45 commits a red lint meant ZERO tripwires
 * executed while the tier reported one red line about formatting. Every gate in the
 * array was green by never running. The stages are independent now (`tier_status`),
 * and this gate holds the shape that made the silence possible:
 *
 *   1. each tier script contains a `bun test` invocation that expands its OWN array
 *      (`"${NAME[@]}"`, not a hard-coded path list that can drift from the array);
 *   2. that array is non-empty, and parses to the count the script itself reports;
 *   3. the invocation is not conditional on an earlier stage's success — no `&&`
 *      chain from a previous command, which is the `set -e` failure in another
 *      spelling;
 *   4. the timeout is passed explicitly, because Bun 1.4.0 SILENTLY IGNORES
 *      `[test] timeout` in bunfig — a tier without it runs on an unchosen 5 s cap
 *      and turns load into flakes (measured: two DB gates that pass in isolation).
 *
 * Census: TOTAL over the tier scripts, derived by scanning `scripts/ci/` for files
 * that declare a `*_TRIPWIRES` array — a new tier cannot be added without landing
 * here.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');
const CI_DIR = join(ROOT, 'scripts/ci');

/** The literal copy of TEST_TIMEOUT_MS every tier must pass on the command line. */
const REQUIRED_TIMEOUT_FLAG = '--timeout=30000';

interface Tier {
	file: string;
	source: string;
	arrayName: string;
}

/**
 * DERIVED, not enumerated: any script in `scripts/ci/` declaring a `*_TRIPWIRES=(`
 * array is a tier and is held to every rule below. A third tier added without an
 * execution line fails here on the day it lands.
 */
function discoverTiers(): Tier[] {
	const tiers: Tier[] = [];
	for (const entry of readdirSync(CI_DIR).sort()) {
		if (!entry.endsWith('.sh')) continue;
		const source = readFileSync(join(CI_DIR, entry), 'utf8');
		const declaration = source.match(/^([A-Z0-9_]*TRIPWIRES)=\(/m);
		if (declaration?.[1] === undefined) continue;
		tiers.push({ file: `scripts/ci/${entry}`, source, arrayName: declaration[1] });
	}
	return tiers;
}

/** The entries of a bash array literal, in declaration order. */
function arrayEntries(source: string, name: string): string[] {
	const start = source.indexOf(`${name}=(`);
	const end = source.indexOf('\n)', start);
	if (start === -1 || end === -1) return [];
	return source
		.slice(start + name.length + 2, end)
		.split('\n')
		.map((line) => line.replace(/#.*$/, '').trim())
		.filter((line) => line.length > 0);
}

interface Stage {
	lines: string[];
	/** Index of `order_test_paths "${NAME[@]}"`, -1 when absent. */
	orderLine: number;
	/** Index of the first `bun test … "${TEST_ORDER_PATHS[@]}"` after it, -1 when absent. */
	bunLine: number;
}

function tierStage(tier: Tier): Stage {
	const lines = tier.source.split('\n');
	const orderLine = lines.findIndex(
		(line) =>
			!line.trimStart().startsWith('#') &&
			line.includes(`order_test_paths "\${${tier.arrayName}[@]}"`),
	);
	const bunLine =
		orderLine === -1
			? -1
			: lines.findIndex(
					(line, index) =>
						index > orderLine &&
						!line.trimStart().startsWith('#') &&
						line.includes('bun test') &&
						line.includes('"${TEST_ORDER_PATHS[@]}"'),
				);
	return { lines, orderLine, bunLine };
}

/** Run the tier's array block + its stage lines under bash, `bun` stubbed to print its argv. */
function runStageWithStubBun(tier: Tier): { argv: string[]; rc: number } {
	const stage = tierStage(tier);
	if (stage.orderLine === -1 || stage.bunLine === -1) {
		throw new Error(`${tier.file}: no ordered tripwire stage to execute`);
	}
	const start = tier.source.indexOf(`${tier.arrayName}=(`);
	const arrayBlock = tier.source.slice(start, tier.source.indexOf('\n)', start) + 2);
	const script = [
		'set -euo pipefail',
		'source scripts/ci/test_order.sh',
		arrayBlock,
		'tw_rc=0',
		'bun() { printf \'ARG\\t%s\\n\' "$@"; }',
		...stage.lines.slice(stage.orderLine, stage.bunLine + 1),
		'printf \'RC\\t%s\\n\' "$tw_rc"',
	].join('\n');
	const proc = Bun.spawnSync(['bash', '-c', script], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
	const out = proc.stdout.toString().split('\n');
	const argv = out.filter((l) => l.startsWith('ARG\t')).map((l) => l.slice(4));
	const rcLine = out.find((l) => l.startsWith('RC\t'));
	if (proc.exitCode !== 0 || rcLine === undefined) {
		throw new Error(
			`${tier.file}: the stubbed stage did not complete (exit ${proc.exitCode}): ${proc.stderr}`,
		);
	}
	return { argv, rc: Number(rcLine.slice(3)) };
}

const TIERS = discoverTiers();

describe('tier execution — a declared array is an EXECUTED array', () => {
	test('the discovery found tiers (the scan is not silently empty)', () => {
		// Without this every assertion below passes over an empty list — the exact
		// vacuity this whole gate exists to make impossible.
		expect(TIERS.length).toBeGreaterThanOrEqual(2);
		expect(TIERS.map((t) => t.file)).toContain('scripts/ci/hermetic.sh');
		expect(TIERS.map((t) => t.file)).toContain('scripts/ci/db_tier.sh');
	});

	for (const tier of TIERS) {
		describe(tier.file, () => {
			test('runs its own array through bun test', () => {
				// `"${NAME[@]}"` and not a path list: an invocation that re-spells the
				// files can drift from the array silently, which is the same failure as
				// not running at all, one refactor later. The array reaches bun through
				// `order_test_paths` (scripts/ci/test_order.sh: sorted `./` paths — a bare
				// name is a bun FILTER run in per-host readdir order), so the stage is two
				// lines: the ordering call on the OWN array, then `bun test` on its result.
				const stage = tierStage(tier);
				expect(
					stage.orderLine,
					`${tier.file} declares ${tier.arrayName} but never orders it (\`order_test_paths "\${${tier.arrayName}[@]}"\`). ` +
						'A declared array that nothing runs is a tier reporting green by silence.',
				).toBeGreaterThanOrEqual(0);
				expect(
					stage.bunLine,
					`${tier.file}: no \`bun test … "\${TEST_ORDER_PATHS[@]}"\` line follows the ordering of ${tier.arrayName}.`,
				).toBeGreaterThanOrEqual(0);
			});

			test('the array is non-empty', () => {
				const entries = arrayEntries(tier.source, tier.arrayName);
				expect(
					entries.length,
					`${tier.file}: ${tier.arrayName} is empty — the tier runs, and proves nothing.`,
				).toBeGreaterThan(0);
				for (const entry of entries) {
					expect(entry.startsWith('test/'), `${tier.file}: '${entry}' is not a test path`).toBe(
						true,
					);
				}
			});

			test('bun receives exactly the array, sorted and ./-prefixed (stage executed, bun stubbed)', () => {
				// OUTCOME, not spelling: the stage's own lines run under bash with `bun`
				// replaced by a function that prints its argv. Reverting to the bare array,
				// dropping the sort, or running a different list all change what bun gets.
				const entries = arrayEntries(tier.source, tier.arrayName);
				const expected = [...new Set(entries)].sort().map((entry) => `./${entry}`);
				const { argv, rc } = runStageWithStubBun(tier);
				expect(
					rc,
					`${tier.file}: the stage reported tw_rc=${rc} with every array entry present`,
				).toBe(0);
				expect(argv[0]).toBe('test');
				expect(argv.filter((arg) => !arg.startsWith('-')).slice(1)).toEqual(expected);
			});

			test('the invocation passes the explicit timeout', () => {
				// Bun 1.4.0 silently ignores `[test] timeout` in bunfig.toml, so a tier
				// without the flag runs on an unchosen 5 s cap: gates that pass in
				// isolation fail under a loaded runner, and the tier's red set becomes
				// load-dependent rather than a statement about the code.
				const { argv } = runStageWithStubBun(tier);
				expect(
					argv.includes(REQUIRED_TIMEOUT_FLAG),
					`${tier.file}: the bun test invocation must pass ${REQUIRED_TIMEOUT_FLAG} explicitly ` +
						'(bunfig [test] timeout is silently ignored by Bun).',
				).toBe(true);
			});

			test('the invocation is not gated behind an earlier stage succeeding', () => {
				// The 45-commit failure in another spelling. `set -e` was one way to make
				// the tripwires conditional on lint; `previous && bun test ...` is the
				// other, and it survives the tier_status refactor unnoticed.
				const stage = tierStage(tier);
				for (const index of [stage.orderLine, stage.bunLine]) {
					const line = stage.lines[index] ?? '';
					const command = line.includes('bun test') ? 'bun test' : 'order_test_paths';
					const beforeCommand = line.slice(0, line.indexOf(command));
					expect(
						beforeCommand.includes('&&'),
						`${tier.file}: the tripwire run is chained behind an earlier command with '&&' — ` +
							'a red earlier stage would skip every gate. Record the earlier verdict and run this ' +
							'stage unconditionally.',
					).toBe(false);
				}
			});
		});
	}

	// EVERY tier keeps its stages independent, not just the one that was caught.
	//
	// `hermetic.sh` ran lint before its tripwires under `set -e`, so a red lint meant
	// zero gates executed — 45 commits of a tier reporting a formatting error while
	// proving nothing. That was fixed in Batch 0. `db_tier.sh` had the identical shape
	// and, the moment the unit and parity stages landed BELOW its tripwire block, the
	// identical consequence: one red gate would skip the entire 725-file unit tier.
	// Both are pinned here so neither can regress, and so a third tier inherits the
	// rule by landing in TIERS.
	for (const tier of TIERS) {
		test(`${tier.file} keeps its stages independent (the 45-commit regression)`, () => {
			expect(
				tier.source.includes('tier_status=0'),
				`${tier.file} has no tier_status accumulator: under \`set -e\` the first red stage ends ` +
					'the script and every stage after it is skipped while the log shows one failure.',
			).toBe(true);
			expect(
				/tier_status=1|tier_status=\$\?/.test(tier.source),
				`${tier.file} never RAISES tier_status — the accumulator is declared and unused, which ` +
					'reports green while a stage was red.',
			).toBe(true);
			expect(
				/\[ "\$tier_status" -eq 0 \]|exit "?\$tier_status"?/.test(tier.source),
				`${tier.file} never EXITS on tier_status — it records every verdict and then returns 0, ` +
					'which is a tier that cannot fail.',
			).toBe(true);
		});
	}
});
