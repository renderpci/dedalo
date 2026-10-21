/**
 * THE GHOST UNPUBLISH WAITS ON ONE BUDGET ACROSS EVERY TARGET (closure review
 * cross-diffusion:r3, S3 "Ghost-unpublish 'ONE budget across every target' has
 * no multi-target gate").
 *
 * public_tier_reconcile.ts unpublishGhosts promises the operator ONE budget
 * (`boundMs`) for the whole apply, however many targets it visits — the twin of
 * the lang sweep's leg in diffusion_operator_fence_budget_native ("ONE budget
 * per call"). Only the one-target case was gated, so a door that handed each
 * target a FRESH budget (`mode: { boundMs }` instead of what is left of the
 * deadline) stayed green while two held targets cost the operator's request two
 * budgets, ten cost ten.
 *
 * WHAT IS ASSERTED: two file ghosts on two distinct services, both directories
 * held EXCLUSIVELY from other sessions (as a runner's unit holds them) well past
 * the budget; the apply returns within ONE budget (+ slack), reports BOTH lock
 * keys in sorted order, removes nothing, and both ghost files are still there.
 *
 * WRITES: none in Postgres (advisory locks on the suite database, released); two
 * ghost files in an os-tmp scratch dir, removed in afterAll.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from '../../src/core/db/postgres.ts';
import {
	DIFFUSION_TARGET_LOCK_CLASS,
	fileTargetLockKey,
} from '../../src/core/diffusion_bridge/target_lock.ts';
import { unpublishGhosts } from '../../src/diffusion/targets/mariadb/public_tier_reconcile.ts';

const RUN = `${process.pid}_${Date.now().toString(36)}`;
const FORMAT = 'markdown';
const SERVICE_ONE = `zzgob_one_${RUN}`;
const SERVICE_TWO = `zzgob_two_${RUN}`;
const SCRATCH = mkdtempSync(join(realpathSync(tmpdir()), 'dd_ghost_one_budget_'));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

const BUDGET_MS = 2_000;
/** Long past the budget: a door that waits per target finishes only after two budgets. */
const HOLD_MS = 9_000;

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

function fileGhost(service: string, sectionId: number) {
	const path = join(SCRATCH, `${service}_${sectionId}.md`);
	writeFileSync(path, '# ghost\n');
	return {
		path,
		ghost: {
			store: 'file' as const,
			target: `${FORMAT}:${service}`,
			section_tipo: 'zzgob1',
			section_id: sectionId,
			path,
			reason: 'record_absent' as const,
		},
	};
}

describe('the ghost unpublish shares ONE budget across every held target', () => {
	test('two held targets cost one budget; both reported in sorted order; nothing removed', async () => {
		const one = fileGhost(SERVICE_ONE, 1);
		const two = fileGhost(SERVICE_TWO, 2);
		const keys = [fileTargetLockKey(FORMAT, SERVICE_ONE), fileTargetLockKey(FORMAT, SERVICE_TWO)];
		const holds = await Promise.all(keys.map(holdFor));
		const startedAt = Date.now();
		let outcome: Awaited<ReturnType<typeof unpublishGhosts>>;
		let elapsed: number;
		let presentAtReturn: boolean[];
		try {
			outcome = await unpublishGhosts([two.ghost, one.ghost], { boundMs: BUDGET_MS });
			elapsed = Date.now() - startedAt;
			presentAtReturn = [existsSync(one.path), existsSync(two.path)];
		} finally {
			await Promise.all(holds.map((hold) => hold.released));
		}
		expect(elapsed, 'each held target got a fresh budget').toBeLessThan(BUDGET_MS + 1_500);
		expect(outcome.removed).toBe(0);
		expect(outcome.failed.map((line) => line.split(': ')[0])).toEqual([...keys].sort());
		expect(presentAtReturn, 'a ghost was unlinked inside a held target').toEqual([true, true]);
	}, 30_000);
});
