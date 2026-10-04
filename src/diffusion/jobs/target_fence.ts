/**
 * THE PUBLICATION TARGET FENCE (DIFF-2, WC-2026-09-30-diffusion-target-fence).
 *
 * The lease epoch (PUB-13) fences every write to the JOB ROW; what can be
 * corrupted, though, is the TARGET — a MariaDB database, a files directory.
 * Before this fence a runner checked its lease only when it wrote progress,
 * i.e. AFTER a batch's rows or files had landed: a runner the sweeper revoked
 * while it was merely slow kept publishing into the target the new epoch was
 * publishing into. So every durable effect of a run is ONE UNIT:
 *
 *   withFencedBatch = one Postgres transaction that
 *     1. takes the TARGET's advisory lock (`pg_try_advisory_xact_lock(
 *        DIFFUSION_TARGET_LOCK_CLASS, hashtext(<target key>))`, a try-lock in a
 *        loop that holds NO connection while the target is busy, and tells the
 *        job row once — the busy message);
 *     2. THEN re-reads the lease (`attempt = $epoch AND state = 'running'`)
 *        `FOR KEY SHARE` — a runner revoked while it waited writes nothing, and
 *        the sweeper (`FOR UPDATE SKIP LOCKED`) cannot revoke a runner in the
 *        middle of its batch, while heartbeat / progress / cancel (NO KEY
 *        UPDATE) never conflict with it;
 *     3. runs the target I/O and the batch's tail (dd1758, run ledger,
 *        progress, checkpoint), all committed together.
 *
 * THE LOCK ITSELF LIVES IN THE BRIDGE (src/core/diffusion_bridge/target_lock.ts):
 * it is a CROSS-DOOR CONTRACT between core and this subsystem — every door that
 * writes a target names it the same way, `sql:<database>`,
 * `files:<format>/<dir label>` (logical names, never absolute paths): the
 * runner, the MariaDB delete executor, the ghost unpublish, the lang sweep, the
 * media-index apply, and core's files-unlink door. The DELETE-ONLY doors
 * (record delete — sql and files — and the ghost unpublish) take it SHARED:
 * they never exclude each other, only the exclusive writers (gate:
 * diffusion_target_fence_native D3/D4). This module adds the JOB to it: the
 * lease read under the lock, and the runner's pool precondition.
 *
 * THE ONE PLACE A TRANSACTION SPANS TARGET I/O: only a unit of this module may
 * hold a Postgres transaction across target writes. It holds no matrix row
 * lock (an advisory lock + one job row's KEY SHARE + a short tail) and is
 * bounded by FENCE_IDLE_BOUND_MS (`idle_in_transaction_session_timeout`): a
 * FROZEN holder's session is killed by Postgres, its lock released.
 * (Residual R1, ledgered: a thawed zombie whose session was killed can finish
 * at most the one in-flight target batch.)
 *
 * A LIVE HOLDER NEVER LOSES ITS FENCE: the bound is for a frozen process, not a
 * slow target. A unit's target step can legitimately outlast it with no
 * Postgres statement in between — an ALTER adding an indexed column to a large
 * published table, a lang sweep's chunk loop, a MariaDB statement queued behind
 * a metadata lock. So every unit that opens its transaction runs a TIMER-DRIVEN
 * keepalive (`SELECT 1` on the unit's own connection every tenth of the bound)
 * for the whole time its work is in flight: the idle clock never reaches the
 * bound while the event loop runs, and a frozen process sends nothing. No door
 * has to remember to call it (gate: diffusion_target_fence_native "a live unit
 * outlasting the idle bound keeps its lock").
 */

import { getPoolStats, sql, sqlStateOf } from '../../core/db/postgres.ts';
import {
	fileTargetLockKey,
	sqlTargetLockKey,
	TargetBusy,
	type TargetLockOptions,
	type TargetLockOutcome,
	withTargetLock,
} from '../../core/diffusion_bridge/target_lock.ts';
import { DedaloError } from '../../core/errors/index.ts';
import { TABLE_FORMATS } from '../plan/formats.ts';
import type { PublicationPlan } from '../plan/types.ts';
import { fileTargetDirLabel } from '../writers/files.ts';
import type { JobLease } from './queue.ts';
import { DIFFUSION_JOBS_TABLE } from './schema.ts';

/** The lock key of the target a plan publishes into (the bridge's grammar). */
export function publicationTargetLockKey(plan: PublicationPlan): string {
	if (TABLE_FORMATS.has(plan.format) && plan.target.kind === 'table') {
		return sqlTargetLockKey(plan.target.database);
	}
	return fileTargetLockKey(plan.format, fileTargetDirLabel(plan));
}

/**
 * Hold the lease for the rest of the unit: the job row, still on this epoch
 * and running, `FOR KEY SHARE`. Zero rows = the lease was revoked (typed). A
 * 55P03 (the row momentarily locked past FENCE_LOCK_TIMEOUT) retries the
 * whole unit — nothing has been written yet.
 */
async function holdLease(lease: JobLease): Promise<void> {
	let rows: unknown[];
	try {
		rows = (await sql.unsafe(
			`SELECT job_id FROM "${DIFFUSION_JOBS_TABLE}"
			 WHERE job_id = $1 AND attempt = $2::int AND state = 'running'
			 FOR KEY SHARE`,
			[lease.job_id, lease.attempt],
		)) as unknown[];
	} catch (error) {
		if (sqlStateOf(error) === '55P03') throw new TargetBusy('lease row');
		throw error;
	}
	if (rows.length === 0) {
		throw new DedaloError('diffusion.lease_revoked', {
			coordinates: { job: lease.job_id, attempt: lease.attempt, operation: 'fence' },
		});
	}
}

/**
 * ONE fenced unit of a run: the target lock, THEN the lease held `FOR KEY
 * SHARE`, then `work` (target I/O + the tail), committed together. Waits for a
 * busy target (telling the job row once through `onBusy`); `shouldStop`
 * (the cancel flag) gives up with `{acquired: false, reason: 'stopped'}`. A
 * revoked lease is the typed `diffusion.lease_revoked` — nothing was written.
 */
export function withFencedBatch<T>(
	lease: JobLease,
	key: string,
	work: () => Promise<T>,
	options: Omit<TargetLockOptions, 'mode'> = {},
): Promise<TargetLockOutcome<T>> {
	return withTargetLock(
		key,
		async () => {
			await holdLease(lease);
			return work();
		},
		{ ...options, mode: 'wait' },
	);
}

/**
 * A runner needs two connections: the fence unit's transaction, and the
 * heartbeat that proves it alive meanwhile. A pool of one would deadlock the
 * heartbeat behind the batch — refused loudly at run start.
 */
export function assertRunnerPool(): void {
	const { max } = getPoolStats();
	if (max < 2) {
		throw new DedaloError('internal.invariant', {
			message: `diffusion runner: the database pool holds ${max} connection(s); a runner needs at least 2 (the fenced batch + its heartbeat) — raise DB_POOL_MAX`,
		});
	}
}
