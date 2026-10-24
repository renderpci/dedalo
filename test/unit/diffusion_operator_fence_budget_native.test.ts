/**
 * THE OPERATOR DOORS NEVER HANG ON A HELD TARGET (review 2026-10-21, cross-diffusion r1).
 *
 * THE FINDING. The phantom-lang sweep (`sweep_published_langs`) and the ghost
 * unpublish (`reconcile` apply of `public_tier`) took the publication-target
 * fence with `mode: 'wait'` — no bound — inside the operator's HTTP request. A
 * runner's fence unit holds its target for as long as its target statement
 * runs (WC-2026-09-30-diffusion-target-fence residual R4: a MariaDB lock wait
 * defaults to a day; a half-open TCP write never returns), so either request
 * hung with it.
 *
 * WHAT IS ASSERTED — outcomes, with the target held from ANOTHER session exactly
 * like a writer's unit holds it (`pg_advisory_lock(DIFFUSION_TARGET_LOCK_CLASS,
 * hashtext(<key>))`), released only after the door's budget is long spent:
 *   1. the lang sweep returns within its budget, names the busy database in
 *      `errors`, and sends the target NOTHING (no discovery, no DELETE);
 *      with the database free it does run (positive control);
 *   2. the ghost unpublish returns within its budget, reports the busy target
 *      in `failed`, removes nothing and leaves the ghost file in place; with the
 *      directory free it unlinks it (positive control);
 *   3. ONE budget per call: two held databases cost the sweep one budget, not
 *      one each.
 * The default budget is a finite bound (OPERATOR_FENCE_BOUND_MS) shared with the
 * media-index doors.
 *
 * WRITES: none in Postgres (advisory locks only, on the suite database); one
 * ghost file in an os-tmp scratch dir, removed in afterAll. The lang sweep's
 * target is an injected in-memory pool (no MariaDB).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from '../../src/core/db/postgres.ts';
import {
	DIFFUSION_TARGET_LOCK_CLASS,
	fileTargetLockKey,
	OPERATOR_FENCE_BOUND_MS,
	sqlTargetLockKey,
} from '../../src/core/diffusion_bridge/target_lock.ts';
import {
	type LangSweepDependencies,
	type MariadbQueryable,
	sweepPhantomLangs,
} from '../../src/diffusion/targets/mariadb/lang_sweep.ts';
import { unpublishGhosts } from '../../src/diffusion/targets/mariadb/public_tier_reconcile.ts';
import { MEDIA_INDEX_FENCE_BOUND_MS } from '../../src/diffusion/targets/mediastore/media_index.ts';

/** Unique per run: two lanes never contend for one key. */
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const DB_A = `zzopf_a_${RUN}`;
const DB_B = `zzopf_b_${RUN}`;
const FILE_FORMAT = 'markdown';
const FILE_SERVICE = `zzopf_svc_${RUN}`;
const SCRATCH = mkdtempSync(join(realpathSync(tmpdir()), 'dd_operator_fence_'));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

/** The door's budget in this gate, and how long the holder keeps the target past it. */
const BUDGET_MS = 1_500;
const HOLD_MS = 8_000;

/**
 * Hold `key` EXCLUSIVELY from another session (a reserved connection), the way a
 * runner's unit holds it, and release it after `HOLD_MS` — long after the
 * door's budget, so an unbounded door finishes only then (red on elapsed),
 * never hangs the gate.
 */
async function holdFor(key: string): Promise<{ released: Promise<void> }> {
	const connection = await sql.reserve();
	await connection.unsafe('SELECT pg_advisory_lock($1::int, hashtext($2))', [
		DIFFUSION_TARGET_LOCK_CLASS,
		key,
	]);
	const released = Bun.sleep(HOLD_MS).then(async () => {
		try {
			await connection.unsafe('SELECT pg_advisory_unlock($1::int, hashtext($2))', [
				DIFFUSION_TARGET_LOCK_CLASS,
				key,
			]);
		} finally {
			connection.release();
		}
	});
	return { released };
}

/** An in-memory target: every statement recorded, no tables. */
function recordingDependencies(databases: string[]): {
	dependencies: LangSweepDependencies;
	statements: string[];
} {
	const statements: string[] = [];
	const pool: MariadbQueryable = {
		unsafe(statement: string) {
			statements.push(statement);
			return Promise.resolve([]);
		},
	};
	return {
		statements,
		dependencies: {
			getPool: () => pool,
			listTargetDatabases: async () => ({ databases, invalid: [] }),
			listDeclaredTables: async () => new Set<string>(),
			policyLangs: () => ['lg-spa'],
		},
	};
}

describe('the operator budget is a finite bound', () => {
	test('OPERATOR_FENCE_BOUND_MS is finite and positive, and the media-index doors share it', () => {
		expect(Number.isFinite(OPERATOR_FENCE_BOUND_MS)).toBe(true);
		expect(OPERATOR_FENCE_BOUND_MS).toBeGreaterThan(0);
		expect(MEDIA_INDEX_FENCE_BOUND_MS).toBe(OPERATOR_FENCE_BOUND_MS);
	});
});

describe('the phantom-lang sweep never hangs on a held database', () => {
	test('held: returns within its budget, the database named in errors, nothing sent to the target', async () => {
		const { dependencies, statements } = recordingDependencies([DB_A]);
		const hold = await holdFor(sqlTargetLockKey(DB_A));
		const startedAt = Date.now();
		let result: Awaited<ReturnType<typeof sweepPhantomLangs>>;
		let elapsed: number;
		try {
			result = await sweepPhantomLangs({ langs: ['lg-zzz'], boundMs: BUDGET_MS }, dependencies);
			elapsed = Date.now() - startedAt;
		} finally {
			await hold.released;
		}
		expect(elapsed, 'the sweep waited past its budget for a held database').toBeLessThan(
			BUDGET_MS + 2_500,
		);
		expect(result.errors.length).toBe(1);
		expect(result.errors[0]).toStartWith(`${DB_A}: publication target busy`);
		expect(result.errors[0]).toContain(sqlTargetLockKey(DB_A));
		expect(statements, 'the sweep touched a database a writer holds').toEqual([]);
		expect(result.swept).toEqual([]);
	}, 30_000);

	test('free (positive control): the sweep takes the database and runs its discovery', async () => {
		const { dependencies, statements } = recordingDependencies([DB_A]);
		const result = await sweepPhantomLangs({ langs: ['lg-zzz'], boundMs: BUDGET_MS }, dependencies);
		expect(result.errors).toEqual([]);
		expect(statements.length, 'the fenced sweep never reached its database').toBeGreaterThan(0);
	}, 30_000);

	test('ONE budget per call: two held databases cost one budget, not one each', async () => {
		const { dependencies, statements } = recordingDependencies([DB_A, DB_B]);
		const holdA = await holdFor(sqlTargetLockKey(DB_A));
		const holdB = await holdFor(sqlTargetLockKey(DB_B));
		const budget = 2_000;
		const startedAt = Date.now();
		let result: Awaited<ReturnType<typeof sweepPhantomLangs>>;
		let elapsed: number;
		try {
			result = await sweepPhantomLangs({ langs: ['lg-zzz'], boundMs: budget }, dependencies);
			elapsed = Date.now() - startedAt;
		} finally {
			await Promise.all([holdA.released, holdB.released]);
		}
		expect(elapsed, 'each held database got a fresh budget').toBeLessThan(budget + 1_500);
		expect(result.errors.map((line) => line.split(':')[0])).toEqual([DB_A, DB_B]);
		expect(statements).toEqual([]);
	}, 30_000);
});

describe('the ghost unpublish never hangs on a held target', () => {
	function fileGhost(sectionId: number): {
		ghost: Parameters<typeof unpublishGhosts>[0][number];
		path: string;
	} {
		const path = join(SCRATCH, `zzopf1_${sectionId}.md`);
		writeFileSync(path, '# ghost\n');
		return {
			path,
			ghost: {
				store: 'file',
				target: `${FILE_FORMAT}:${FILE_SERVICE}`,
				section_tipo: 'zzopf1',
				section_id: sectionId,
				path,
				reason: 'record_absent',
			},
		};
	}

	test('held: returns within its budget, the target in failed, the ghost left in place', async () => {
		const { ghost, path } = fileGhost(1);
		const hold = await holdFor(fileTargetLockKey(FILE_FORMAT, FILE_SERVICE));
		const startedAt = Date.now();
		let outcome: Awaited<ReturnType<typeof unpublishGhosts>>;
		let elapsed: number;
		let presentAtReturn: boolean;
		try {
			outcome = await unpublishGhosts([ghost], { boundMs: BUDGET_MS });
			elapsed = Date.now() - startedAt;
			presentAtReturn = existsSync(path);
		} finally {
			await hold.released;
		}
		expect(elapsed, 'the ghost unpublish waited past its budget for a held target').toBeLessThan(
			BUDGET_MS + 2_500,
		);
		expect(presentAtReturn, 'a ghost was unlinked inside a held target').toBe(true);
		expect(outcome.removed).toBe(0);
		expect(outcome.failed.length).toBe(1);
		expect(outcome.failed[0]).toStartWith(
			`${fileTargetLockKey(FILE_FORMAT, FILE_SERVICE)}: publication target busy`,
		);
		expect(outcome.failed[0]).toContain('1 ghost(s) left');
	}, 30_000);

	test('free (positive control): the ghost is unlinked', async () => {
		const { ghost, path } = fileGhost(2);
		const outcome = await unpublishGhosts([ghost], { boundMs: BUDGET_MS });
		expect(outcome).toEqual({ removed: 1, failed: [] });
		expect(existsSync(path)).toBe(false);
	}, 30_000);
});
