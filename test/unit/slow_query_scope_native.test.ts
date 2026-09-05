/**
 * THE SLOW-QUERY LOG MEASURES THE WHOLE ENGINE, NOT HALF OF IT (OPS-13, S-12).
 *
 * THE DEFECT. `DEDALO_SLOW_QUERY_MS` was evaluated in ONE place: the pooled
 * branch of the `sql` proxy (`runOnPool`). The other two lanes returned the
 * executor's query RAW and UNTIMED — statements issued inside `withTransaction`
 * (that is, the ENTIRE write path) and every statement on a `sql.reserve()`d
 * connection. An operator who set the key was told the engine was measured; the
 * half that writes was invisible.
 *
 * WHAT THIS GATE PROVES, against a live server:
 *   1. one statement slower than the threshold on EACH side of the executor
 *      branch — pooled, inside a transaction, and on a reserved connection,
 *      through BOTH call shapes (tagged template and `.unsafe`) — produces a
 *      `[db] slow query` line naming its lane;
 *   2. a FAST statement on each of those lanes produces none (the threshold is
 *      still a threshold, not a firehose);
 *   3. the query budget helper counts statements from every lane and NAMES the
 *      offending call site when a ceiling is breached;
 *   4. `runWithQueryTap` REFUSES an unarmed posture instead of reporting a zero;
 *   5. `sql.reserve()` inside an ambient transaction is refused loudly — a
 *      second connection cannot see the transaction's uncommitted writes.
 *
 * WHY A SUBPROCESS for (1) and (2): the threshold is part of the frozen config
 * snapshot, taken when `src/config/config.ts` is first imported — which the test
 * preload has long since done. Driving a child process with
 * `DEDALO_SLOW_QUERY_MS` in its environment measures the REAL production path
 * (config → query_tap → the proxy) rather than a seam invented for the test.
 * The child inherits this run's environment, so it talks to the SUITE database
 * and the suite media root like every other gate here.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';
import { runWithQueryTap } from '../../src/core/db/query_tap.ts';
import { expectQueryBudget } from '../helpers/query_budget.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const POSTGRES_MODULE = join(REPO_ROOT, 'src/core/db/postgres.ts');
const QUERY_TAP_MODULE = join(REPO_ROOT, 'src/core/db/query_tap.ts');

/** Comfortably above the threshold below, short enough to keep the run quick. */
const SLEEP_S = 0.4;
const THRESHOLD_MS = 200;

const scratchDir = mkdtempSync(join(tmpdir(), 'dedalo-slow-query-'));
afterAll(() => rmSync(scratchDir, { recursive: true, force: true }));

/** Write `source` into the scratch dir and run it with `bun`, returning its output. */
async function runDriver(
	name: string,
	source: string,
	env: Record<string, string | undefined>,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const file = join(scratchDir, name);
	writeFileSync(file, source, 'utf8');
	// process.execPath, never a bare 'bun' off $PATH: the child must run the
	// runtime UNDER TEST (ops_runtime_pin).
	const child = Bun.spawn([process.execPath, file], {
		cwd: REPO_ROOT,
		env: { ...process.env, ...env } as Record<string, string>,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	return { exitCode, stdout, stderr };
}

/** Every `[db] slow query` line the child logged, parsed into its lane + text. */
function slowQueryLines(stderr: string): { lane: string; text: string }[] {
	const parsed: { lane: string; text: string }[] = [];
	for (const line of stderr.split('\n')) {
		const match = /^\[db\] slow query \d+ms \(threshold \d+ms, lane ([a-z]+)\): (.*)$/.exec(
			line.trim(),
		);
		if (match !== null) parsed.push({ lane: match[1] as string, text: match[2] as string });
	}
	return parsed;
}

const DRIVER_SOURCE = `
import { sql, withTransaction } from ${JSON.stringify(POSTGRES_MODULE)};

const SLEEP = 'SELECT pg_sleep(${SLEEP_S})';

// LANE 1 — the pool (the only lane that was ever measured).
await sql\`SELECT pg_sleep(${SLEEP_S})\`;
await sql.unsafe('SELECT 1 AS fast_marker_pooled', []);

// LANE 2 — inside a transaction: the whole write path.
await withTransaction(async () => {
	await sql\`SELECT pg_sleep(${SLEEP_S})\`;
	await sql.unsafe(SLEEP, []);
	await sql.unsafe('SELECT 1 AS fast_marker_transaction', []);
});

// LANE 3 — a caller-owned reserved connection.
const reserved = await sql.reserve();
try {
	await reserved\`SELECT pg_sleep(${SLEEP_S})\`;
	await reserved.unsafe(SLEEP, []);
	await reserved.unsafe('SELECT 1 AS fast_marker_reserved', []);
} finally {
	reserved.release();
}
console.log('driver: done');
process.exit(0);
`;

describe('the slow-query log covers every executor lane (OPS-13)', () => {
	test('a slow statement on the pool, in a transaction and on a reserved connection ALL log', async () => {
		const { exitCode, stdout, stderr } = await runDriver('slow_driver.ts', DRIVER_SOURCE, {
			DEDALO_SLOW_QUERY_MS: String(THRESHOLD_MS),
		});
		expect(exitCode, `driver failed:\n${stderr}`).toBe(0);
		expect(stdout).toContain('driver: done');

		const lines = slowQueryLines(stderr);
		const lanes = new Set(lines.map((line) => line.lane));
		expect(
			[...lanes].sort(),
			`the slow-query log did not fire on every lane. Lines seen:\n${stderr}`,
		).toEqual(['pooled', 'reserved', 'transaction']);

		// BOTH call shapes on the two lanes that were previously unmeasured: the
		// tagged template (the `apply` trap) and `.unsafe` (the `get` trap).
		expect(lines.filter((line) => line.lane === 'transaction').length).toBeGreaterThanOrEqual(2);
		expect(lines.filter((line) => line.lane === 'reserved').length).toBeGreaterThanOrEqual(2);

		// And the threshold is still a threshold.
		expect(
			lines.filter((line) => line.text.includes('fast_marker')),
			'a statement faster than the threshold was logged as slow',
		).toEqual([]);
	}, 60000);
});

describe('the query tap counts statements from every lane', () => {
	test('a mixed pooled/in-transaction/reserved workload is counted per lane', async () => {
		const { report } = await expectQueryBudget(
			'mixed lanes',
			{ ceiling: 10, corpus: 5 },
			async () => {
				await sql`SELECT 1 AS n`;
				await sql.unsafe('SELECT 2 AS n', []);
				await withTransaction(async () => {
					await sql`SELECT 3 AS n`;
					await sql.unsafe('SELECT 4 AS n', []);
				});
				const reserved = await sql.reserve();
				try {
					await reserved.unsafe('SELECT 5 AS n', []);
				} finally {
					reserved.release();
				}
			},
		);
		expect(report.byLane.pooled).toBeGreaterThanOrEqual(2);
		expect(report.byLane.transaction).toBeGreaterThanOrEqual(2);
		expect(report.byLane.reserved).toBeGreaterThanOrEqual(1);
		expect(report.count).toBeGreaterThanOrEqual(5);
	}, 30000);

	test('a breached ceiling names the count AND the offending caller frames', async () => {
		let failure: string | null = null;
		try {
			await expectQueryBudget('n+1 probe', { ceiling: 1, corpus: 4 }, async () => {
				for (const n of [1, 2, 3, 4]) {
					await sql.unsafe(`SELECT ${n} AS n`, []);
				}
			});
		} catch (error) {
			failure = (error as Error).message;
		}
		expect(failure, 'a 4-statement scope passed a ceiling of 1').not.toBeNull();
		expect(failure).toContain('4 statements over a corpus of 4');
		expect(failure).toContain('Top call sites:');
		// The attribution must point at THIS file, not at the db layer's own frames.
		expect(failure, `caller frames were not attributed:\n${failure}`).toContain(
			'slow_query_scope_native.test.ts',
		);
	}, 30000);

	test('an empty corpus is refused — a count over nothing asserts nothing', async () => {
		let failure: string | null = null;
		try {
			await expectQueryBudget('empty corpus', { ceiling: 5, corpus: 0 }, async () => {
				await sql.unsafe('SELECT 1 AS n', []);
			});
		} catch (error) {
			failure = (error as Error).message;
		}
		expect(failure).toContain('EMPTY corpus');
	}, 30000);
});

describe('the tap refuses what it cannot honestly measure', () => {
	test('runWithQueryTap REFUSES an unarmed posture instead of reporting zero', async () => {
		const savedMediaRoot = process.env.DEDALO_TEST_MEDIA_ROOT;
		const savedDevMode = process.env.DEDALO_DEV_MODE;
		let failure: string | null = null;
		try {
			// Empty, not deleted: the process environment outranks ../private/.env,
			// so this is unarmed on any machine's config.
			process.env.DEDALO_TEST_MEDIA_ROOT = '';
			process.env.DEDALO_DEV_MODE = 'false';
			await runWithQueryTap('unarmed', async () => undefined);
		} catch (error) {
			failure = (error as Error).message;
		} finally {
			if (savedMediaRoot === undefined) delete process.env.DEDALO_TEST_MEDIA_ROOT;
			else process.env.DEDALO_TEST_MEDIA_ROOT = savedMediaRoot;
			if (savedDevMode === undefined) delete process.env.DEDALO_DEV_MODE;
			else process.env.DEDALO_DEV_MODE = savedDevMode;
		}
		expect(failure, 'the tap opened on a posture that does not arm it').not.toBeNull();
		expect(failure).toContain('does not arm it');
	});

	test('the tap is armed again once the suite posture is restored', async () => {
		const { report } = await runWithQueryTap('armed again', async () => {
			await sql.unsafe('SELECT 1 AS n', []);
		});
		expect(report.count).toBeGreaterThan(0);
	}, 30000);

	test('sql.reserve() inside an ambient transaction is REFUSED', async () => {
		let failure: string | null = null;
		try {
			await withTransaction(async () => {
				await sql.reserve();
			});
		} catch (error) {
			failure = (error as Error).message;
		}
		expect(failure, 'a reserved second connection was handed out inside a transaction').toContain(
			'sql.reserve() was called inside an ambient transaction',
		);
	}, 30000);
});

describe('the tap costs nothing when no scope is open', () => {
	test('a statement outside every tap scope is not attributed', async () => {
		// Not a performance assertion — a contract one: attribution (the stack
		// capture) happens ONLY inside runWithQueryTap, so a plain statement
		// leaves no frame anywhere to read.
		const before = await sql.unsafe('SELECT 1 AS n', []);
		expect((before as { n: number }[])[0]?.n).toBe(1);
		const { report } = await runWithQueryTap('scoped', async () => {
			await sql.unsafe('SELECT 2 AS n', []);
		});
		expect(report.count).toBe(1);
	}, 30000);
});

const UNARMED_DRIVER_SOURCE = `
import { runWithQueryTap, queryTapArmed } from ${JSON.stringify(QUERY_TAP_MODULE)};
console.log('armed:', queryTapArmed());
try {
	await runWithQueryTap('production posture', async () => undefined);
	console.log('opened: yes');
} catch (error) {
	console.log('refused:', (error as Error).message.includes('does not arm it'));
}
process.exit(0);
`;

describe('the tap never opens on a production posture', () => {
	test('a child process with neither DEDALO_DEV_MODE nor a suite media root refuses', async () => {
		const { exitCode, stdout, stderr } = await runDriver(
			'unarmed_driver.ts',
			UNARMED_DRIVER_SOURCE,
			{ DEDALO_DEV_MODE: 'false', DEDALO_TEST_MEDIA_ROOT: '' },
		);
		expect(exitCode, `driver failed:\n${stderr}`).toBe(0);
		expect(stdout).toContain('armed: false');
		expect(stdout).toContain('refused: true');
		expect(stdout).not.toContain('opened: yes');
	}, 60000);
});
