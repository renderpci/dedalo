/**
 * THE TIER RUNNER — the ONE way a ratcheted tier (unit, parity, MariaDB) is RUN
 * and measured: `bun test` on the tier's sorted file list under the JUnit
 * reporter, parsed by scripts/lib/parity_census.ts (`parseJunit`, `childEnv`).
 *
 * Split out of parity_census.ts (2026-10-02) when running a tier started to
 * WALK its paths (scripts/lib/test_order.ts): the census's pure halves — the
 * JUnit parser, the child env, the case types — are imported by gates that never
 * run a tier, and must not reach a tree walk they do not floor.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { childEnv, type ParityRun, parseJunit, REPO_ROOT, TIER_PATH } from './parity_census.ts';
import { TEST_TIMEOUT_FLAG } from './test_flags.ts';
import { tierFileArgs } from './test_order.ts';

export function runParityTier(): ParityRun {
	return runTier([TIER_PATH]);
}

/**
 * The census child's argv. The tier's PATHS are never handed to bun as-is: a
 * directory runs in raw readdir order (differs per host filesystem) and a bare
 * file is a substring filter run in that same order. `tierFileArgs` expands them
 * to ONE codepoint-sorted, `./`-prefixed file list, so the unit/parity/MariaDB
 * tiers run in the same order on every host (scripts/lib/test_order.ts; gate:
 * tier_file_order_tripwire).
 */
export function tierArgv(paths: readonly string[], outfile: string): string[] {
	return [
		'bun',
		'test',
		TEST_TIMEOUT_FLAG,
		'--reporter=junit',
		`--reporter-outfile=${outfile}`,
		...tierFileArgs(paths, REPO_ROOT),
	];
}

/**
 * Run ANY tier under the JUnit reporter and parse it. Generalized from
 * `runParityTier` when the unit tier needed the same measure (P0-1, 2026-08-29) —
 * one runner, so the seam-stripping (`childEnv`) and the timeout can never differ
 * between two tiers that are both meant to be ratcheted the same way.
 */
export function runTier(paths: string[]): ParityRun {
	// RECURSION GUARD. A tier whose `paths` include `test/unit` measures the very
	// directory every gate lives in, so a gate that CALLS this — the natural
	// `unit_baseline_tripwire` twin of `parity_baseline_tripwire` — would spawn a child
	// `bun test test/unit`, which runs that gate again, which spawns another: unbounded,
	// at roughly five minutes per level. The parity tier is safe only by accident of
	// layout (its paths are `test/parity` while its gate lives in `test/unit`), so the
	// guard belongs here rather than in either instance.
	//
	// Found by adversarial review 2026-08-29, before such a gate was written.
	if (process.env.DEDALO_TIER_CENSUS_RUNNING === '1') {
		throw new Error(
			`tier_census: refusing to run \`bun test ${paths.join(' ')}\` from inside a tier census that is already running. A tier whose paths contain the directory its own gate lives in would recurse without bound; if you are writing that gate, it must read the frozen baseline rather than re-measure the tier.`,
		);
	}
	const dir = mkdtempSync(join(tmpdir(), 'dedalo-tier-census-'));
	const outfile = join(dir, 'tier.junit.xml');
	try {
		const proc = Bun.spawnSync(tierArgv(paths, outfile), {
			cwd: REPO_ROOT,
			stdout: 'pipe',
			stderr: 'pipe',
			env: childEnv(),
		});
		let xml: string;
		try {
			xml = readFileSync(outfile, 'utf8');
		} catch {
			throw new Error(
				`tier_census: \`bun test ${paths.join(' ')} ${TEST_TIMEOUT_FLAG}\` wrote no JUnit report (exit ${proc.exitCode}). The tier did not run; the census refuses to report an empty result set.\n--- stderr tail ---\n${proc.stderr.toString().split('\n').slice(-25).join('\n')}`,
			);
		}
		const run = parseJunit(xml);
		run.stderrTail = proc.stderr.toString().split('\n').slice(-40).join('\n');
		if (run.totals.tests === 0) {
			throw new Error(
				`tier_census: \`bun test ${paths.join(' ')} ${TEST_TIMEOUT_FLAG}\` reported ZERO test cases (exit ${proc.exitCode}) — the tier is not being measured. Fix the runner, never the floor.`,
			);
		}
		return run;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}
