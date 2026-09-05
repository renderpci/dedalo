/**
 * Durable diffusion job queue (DIFFUSION_SPEC §4.2, DIFFUSION_PLAN D3-P0).
 *
 * The single Postgres-backed source of truth for diffusion runs. The main
 * server ENQUEUES and OBSERVES; a spawned runner process CLAIMS and EXECUTES.
 * The two sides share nothing but these rows — that is what makes runner
 * placement (local spawn vs separate machine) a deployment choice, keeps a
 * run alive across browser disconnects and server restarts, and lets any
 * server instance stream any run's progress.
 *
 * Identity model (pinned fixtures test/parity/fixtures/diffusion/pinned.ts):
 * - `job_id` (server UUID) is the durable capability — internal only.
 * - `client_process_id` is the copied client's deterministic label
 *   ('process_diffusion_{user}_{element}_{section}') — the CLIENT-FACING
 *   process_id in every wire payload. Authorization is NEVER by id knowledge:
 *   status/cancel are owner-scoped (or global admin).
 *
 * All timing math uses DB now() (single clock); JS Date appears only in the
 * SSE projection layer (sse.ts) where the client expects epoch ms.
 *
 * LEASE MODEL (PUB-13, WC-2026-09-05-diffusion-lease-epoch-fence). A row can be
 * claimed more than once: the sweeper requeues a stale-heartbeat run and a later
 * claim hands it to a NEW runner. `attempt` is incremented inside the claim
 * statement and `(job_id, attempt)` is the per-claim EPOCH — the lease. Every
 * write a lease-holder makes carries it and is fenced with
 * `AND attempt = $epoch AND state = 'running'`; zero rows affected means the
 * lease was revoked and the caller throws `diffusion.lease_revoked` WITHOUT
 * writing. Reads are never fenced.
 *
 * `attempt` IS STRICTLY MONOTONIC FOR THE LIFE OF THE ROW — the claim is the
 * ONLY statement that assigns it, and only as `attempt + 1`. Nothing lowers or
 * resets it, because an epoch that can be RE-ISSUED is not an epoch: a reset
 * hands epoch 1 to a second claim while a slow-but-alive runner from the first
 * claim still holds epoch 1, and both fence legs then match for the loser (an
 * ABA on the counter — the defect this model exists to close). The retry BUDGET
 * is therefore carried by `max_attempts`, never by rewinding the epoch: the
 * admin requeue extends the budget (`max_attempts = attempt + N`) and leaves
 * the counter alone. Gate: `queue_fence_tripwire` (census of every assignment
 * to `attempt`) + `queue_fence_native` (the ABA is built and refused).
 *
 * The only unfenced writers are the control plane's own: the claim (which
 * ISSUES the epoch), the sweeper (which REVOKES it), the owner-scoped cancel
 * flag, the queued-row finalizer and the admin requeue — each state-guarded on
 * its own terms and enumerated in `queue_fence_tripwire`.
 */

import { sql, withTransaction } from '../../core/db/postgres.ts';
import { DedaloError, type FailureRecord, toFailureRecord } from '../../core/errors/index.ts';
import type { DiffusionJobState } from './schema.ts';
import { DIFFUSION_JOBS_TABLE, ensureDiffusionJobTables } from './schema.ts';

/** Postgres NOTIFY channel bumped on every observable job change. */
export const JOB_PROGRESS_CHANNEL = 'diffusion_job_progress';

/** The immutable enqueue spec (sanitized BEFORE it gets here — never raw client SQO). */
export interface DiffusionJobSpec {
	diffusion_element_tipo: string;
	section_tipo: string;
	/** Output format type from the element ('sql'|'rdf'|'xml'|'markdown'|...). */
	type: string;
	/** Sanitized SQO (sanitizeClientSqo output) — the record selection. */
	sqo: Record<string, unknown>;
	/** Client-estimated total records (options.total), display-only. */
	estimated_total: number;
	/** Original request options (levels, lang, ...) for the runner. */
	options: Record<string, unknown>;
}

/** One job row as read back from Postgres (jsonb columns already objects). */
export interface DiffusionJobRow {
	job_id: string;
	client_process_id: string;
	owner_user_id: number;
	kind: string;
	spec: DiffusionJobSpec;
	state: DiffusionJobState;
	checkpoint: Record<string, unknown>;
	totals: {
		counter?: number;
		total?: number;
		msg?: string;
		section_label?: string;
		/** Progress marker echoing `RecordIR.sectionId` — the diffusion IR keeps
		 * the raw/published form (string on an unswept install, or an external
		 * remote id): WC-2026-08-10-section-id-int-canonical. */
		current?: { section_id?: string | number; time?: number };
		total_ms?: number;
	};
	errors: string[];
	result: Record<string, unknown> | null;
	cancel_requested: boolean;
	attempt: number;
	max_attempts: number;
	runner: { pid?: number; host?: string };
	heartbeat_at: Date | null;
	created_at: Date;
	started_at: Date | null;
	finished_at: Date | null;
}

const JOB_COLUMNS = `job_id, client_process_id, owner_user_id, kind, spec, state,
	checkpoint, totals, errors, result, cancel_requested, attempt, max_attempts,
	runner, heartbeat_at, created_at, started_at, finished_at`;

/**
 * Normalize a raw row from Bun.sql into DiffusionJobRow. Defense-in-depth:
 * a jsonb value that was ever written double-encoded (a pre-stringified
 * parameter binds as a jsonb STRING scalar — see the enqueue comment) reads
 * back as a raw JSON string; parse-if-string keeps every caller on objects
 * even if a legacy/buggy row slips through.
 */
function normalizeJobRow(row: Record<string, unknown>): DiffusionJobRow {
	const parse = (value: unknown): unknown =>
		typeof value === 'string' ? JSON.parse(value) : value;
	return {
		...(row as unknown as DiffusionJobRow),
		spec: parse(row.spec) as DiffusionJobSpec,
		checkpoint: parse(row.checkpoint) as Record<string, unknown>,
		totals: parse(row.totals) as DiffusionJobRow['totals'],
		errors: parse(row.errors) as string[],
		result: (row.result === null ? null : parse(row.result)) as Record<string, unknown> | null,
		runner: parse(row.runner) as DiffusionJobRow['runner'],
	};
}

function normalizeJobRows(rows: unknown): DiffusionJobRow[] {
	return (rows as Record<string, unknown>[]).map(normalizeJobRow);
}

/** Notify observers (SSE pollers today, LISTEN subscribers later) of a change. */
async function notifyProgress(jobId: string): Promise<void> {
	await sql.unsafe(`SELECT pg_notify('${JOB_PROGRESS_CHANNEL}', $1)`, [jobId]);
}

/**
 * The per-claim capability: a job row plus the attempt that claimed it. Held by
 * the runner process (passed on its argv, never re-read from the row — a re-read
 * is a second race) and by the scheduler for the row it just claimed.
 */
export interface JobLease {
	job_id: string;
	attempt: number;
}

/**
 * Refuse a fenced write whose predicate matched nothing: another claim owns the
 * row (or it is no longer running). Typed, so the runner can abort its own
 * process without writing a terminal state over the live epoch's run.
 */
function assertLeaseHeld(rows: unknown, lease: JobLease, operation: string): void {
	if ((rows as unknown[]).length > 0) return;
	throw new DedaloError('diffusion.lease_revoked', {
		coordinates: { job: lease.job_id, attempt: lease.attempt, operation },
	});
}

export interface EnqueueResult {
	job: DiffusionJobRow;
	/** True when an ACTIVE run for the same element+section already existed —
	 * the caller attaches to it instead of starting a duplicate. */
	attached: boolean;
}

/**
 * Enqueue a diffusion run, or ATTACH to the already-active one for the same
 * element+section (the partial unique index is the arbiter — no read-check
 * race). Attach mirrors the copied client's UX: a re-click / page reload on a
 * running publication reconnects rather than double-publishing.
 */
export async function enqueueDiffusionJob(input: {
	ownerUserId: number;
	clientProcessId: string;
	spec: DiffusionJobSpec;
}): Promise<EnqueueResult> {
	await ensureDiffusionJobTables();
	const rows = (await sql.unsafe(
		`INSERT INTO "${DIFFUSION_JOBS_TABLE}" (client_process_id, owner_user_id, spec, totals)
		 VALUES ($1, $2, $3::jsonb, $4::jsonb)
		 ON CONFLICT ((spec->>'diffusion_element_tipo'), (spec->>'section_tipo'))
			WHERE state IN ('queued','running')
		 DO NOTHING
		 RETURNING ${JOB_COLUMNS}`,
		[
			input.clientProcessId,
			input.ownerUserId,
			// Objects, NEVER JSON.stringify: a pre-stringified value binds as a
			// jsonb STRING scalar (spec->>'key' = NULL, unique index inert) —
			// verified against Bun 1.4.0 (2026-08-25; unchanged since 1.3.9). Bun
			// serializes objects to jsonb objects.
			input.spec,
			{
				counter: 0,
				total: input.spec.estimated_total,
				msg: 'Starting diffusion...',
			},
		],
	)) as unknown;
	const inserted = normalizeJobRows(rows)[0];
	if (inserted !== undefined) {
		await notifyProgress(inserted.job_id);
		return { job: inserted, attached: false };
	}
	// Conflict path: return the live run for this target.
	const active = (await sql.unsafe(
		`SELECT ${JOB_COLUMNS} FROM "${DIFFUSION_JOBS_TABLE}"
		 WHERE spec->>'diffusion_element_tipo' = $1 AND spec->>'section_tipo' = $2
		   AND state IN ('queued','running')
		 ORDER BY created_at DESC LIMIT 1`,
		[input.spec.diffusion_element_tipo, input.spec.section_tipo],
	)) as unknown;
	const activeJob = normalizeJobRows(active)[0];
	if (activeJob === undefined) {
		// The active run finished between INSERT and SELECT — retry once.
		return enqueueDiffusionJob(input);
	}
	return { job: activeJob, attached: true };
}

/**
 * Claim the oldest queued job (scheduler side): queued → running under
 * FOR UPDATE SKIP LOCKED so concurrent schedulers (or a future second server
 * instance) never double-claim. Returns null when the queue is empty.
 *
 * `maxRunning` (audit S3-64): the runner budget is checked INSIDE the claim
 * statement (one snapshot) instead of the old read-count-then-claim two-step,
 * which let two scheduler instances both observe count<max and both claim.
 *
 * That alone was NOT atomic: under READ COMMITTED two CONCURRENT claim
 * statements each snapshot count(running) before either commits, both pass
 * the budget gate, and SKIP LOCKED hands them DIFFERENT queued rows — both
 * admit, overshooting the budget by one per extra concurrent claimer
 * (reproduced by the ops_diffusion_queue.test.ts concurrency gate). Admission
 * is therefore serialized with a transaction-scoped advisory lock keyed on
 * the jobs table: the second claimer's statement only runs after the first
 * COMMITs its 'running' row, so its count subquery sees it. A claim is one
 * fast indexed statement — the serialization window is negligible.
 */
export async function claimNextQueuedJob(
	runnerHost: string,
	maxRunning?: number,
): Promise<DiffusionJobRow | null> {
	await ensureDiffusionJobTables();
	return withTransaction(async () => {
		await sql.unsafe('SELECT pg_advisory_xact_lock(hashtext($1))', [
			`${DIFFUSION_JOBS_TABLE}:claim`,
		]);
		const rows = (await sql.unsafe(
			`UPDATE "${DIFFUSION_JOBS_TABLE}" jobs
			 SET state = 'running', started_at = COALESCE(jobs.started_at, now()),
			     heartbeat_at = now(), attempt = jobs.attempt + 1,
			     runner = jsonb_build_object('host', $1::text)
			 WHERE jobs.job_id = (
				SELECT job_id FROM "${DIFFUSION_JOBS_TABLE}"
				WHERE state = 'queued'
				  AND ($2::int IS NULL OR
				       (SELECT count(*) FROM "${DIFFUSION_JOBS_TABLE}" WHERE state = 'running') < $2::int)
				ORDER BY created_at
				FOR UPDATE SKIP LOCKED
				LIMIT 1
			 )
			 RETURNING ${JOB_COLUMNS}`,
			[runnerHost, maxRunning ?? null],
		)) as unknown;
		return normalizeJobRows(rows)[0] ?? null;
	});
}

/**
 * Record the spawned runner's pid on a claimed job (post-spawn, scheduler side).
 * LEASE-FENCED: by the time the spawn returns the sweeper may already have
 * requeued and re-claimed the row, and stamping the dead runner's pid onto the
 * live epoch would make the sweeper's cross-check name the wrong process.
 */
export async function recordRunnerPid(lease: JobLease, pid: number): Promise<void> {
	const rows = (await sql.unsafe(
		`UPDATE "${DIFFUSION_JOBS_TABLE}"
		 SET runner = runner || jsonb_build_object('pid', $3::int)
		 WHERE job_id = $1 AND attempt = $2::int AND state = 'running'
		 RETURNING job_id`,
		[lease.job_id, lease.attempt, pid],
	)) as unknown;
	assertLeaseHeld(rows, lease, 'recordRunnerPid');
}

/**
 * Runner heartbeat — proves liveness to the sweeper. LEASE-FENCED: a revoked
 * runner that kept beating would keep the row looking alive and stop the
 * sweeper from ever healing the run the live epoch is doing.
 */
export async function heartbeatJob(lease: JobLease): Promise<void> {
	const rows = (await sql.unsafe(
		`UPDATE "${DIFFUSION_JOBS_TABLE}" SET heartbeat_at = now()
		 WHERE job_id = $1 AND attempt = $2::int AND state = 'running'
		 RETURNING job_id`,
		[lease.job_id, lease.attempt],
	)) as unknown;
	assertLeaseHeld(rows, lease, 'heartbeatJob');
}

/**
 * Runner progress update (merged into totals) + observer notify. Mirrors the
 * old engine's update_progress fields (progress_store.ts:62-103) so the SSE
 * projection is a straight read.
 */
export async function updateJobProgress(
	lease: JobLease,
	update: {
		counter: number;
		msg?: string;
		section_label?: string;
		/** Same IR-marker union as DiffusionJobRow.totals.current above. */
		current?: { section_id?: string | number; time?: number };
		total_ms?: number;
		error?: string;
	},
): Promise<void> {
	const { error, ...totalsPatch } = update;
	const rows = (await sql.unsafe(
		`UPDATE "${DIFFUSION_JOBS_TABLE}"
		 SET totals = totals || $3::jsonb,
		     heartbeat_at = now(),
		     errors = CASE WHEN $4::text IS NULL THEN errors ELSE errors || to_jsonb($4::text) END
		 WHERE job_id = $1 AND attempt = $2::int AND state = 'running'
		 RETURNING job_id`,
		[lease.job_id, lease.attempt, totalsPatch, error ?? null],
	)) as unknown;
	assertLeaseHeld(rows, lease, 'updateJobProgress');
	await notifyProgress(lease.job_id);
}

/** Persist the resume checkpoint of the last COMMITTED chunk (runner side). */
export async function checkpointJob(
	lease: JobLease,
	checkpoint: Record<string, unknown>,
): Promise<void> {
	const rows = (await sql.unsafe(
		`UPDATE "${DIFFUSION_JOBS_TABLE}"
		 SET checkpoint = $3::jsonb, heartbeat_at = now()
		 WHERE job_id = $1 AND attempt = $2::int AND state = 'running'
		 RETURNING job_id`,
		[lease.job_id, lease.attempt, checkpoint],
	)) as unknown;
	assertLeaseHeld(rows, lease, 'checkpointJob');
}

/**
 * The persisted job OUTCOME (`result` column; the follow stream's terminal
 * chunk copies it as `result`): a success record `{ok:true, msg, tables?,
 * errors?, …}` (per-record diagnostic lines in `errors` — a completed job is
 * not a failure) or a converter-made FailureRecord `{ok:false, error, msg}`
 * (`diffusion.cancelled` / `diffusion.run_failed` / `diffusion.runner_lost` /
 * `diffusion.runner_spawn_failed` / a typed compile failure).
 */
export type DiffusionJobResult =
	| ({ ok: true; msg: string } & Record<string, unknown>)
	| (FailureRecord & { msg: string });

/** A FailureRecord with the `msg` line the client renders (converter-made error, reader-facing extras). */
export function failedJobResult(
	error: unknown,
	msg: string,
	extend: Record<string, unknown> = {},
): DiffusionJobResult {
	return { ...toFailureRecord(error, extend), msg };
}

/**
 * Terminal transition (lease-holder side): completed | failed | cancelled.
 * LEASE-FENCED — the write this fence exists for. A revoked runner finishing
 * "its" job would stamp the loser's outcome onto the row the LIVE attempt is
 * still publishing into, and the follow stream would report the loser's state
 * as the run's ending.
 */
export async function finishJob(
	lease: JobLease,
	state: Extract<DiffusionJobState, 'completed' | 'failed' | 'cancelled'>,
	result: DiffusionJobResult,
): Promise<void> {
	const rows = (await sql.unsafe(
		`UPDATE "${DIFFUSION_JOBS_TABLE}"
		 SET state = $3, result = $4::jsonb, finished_at = now(),
		     totals = totals || jsonb_build_object('msg', $5::text)
		 WHERE job_id = $1 AND attempt = $2::int AND state = 'running'
		 RETURNING job_id`,
		[lease.job_id, lease.attempt, state, result, result.msg],
	)) as unknown;
	assertLeaseHeld(rows, lease, 'finishJob');
	await notifyProgress(lease.job_id);
}

/**
 * Terminal transition for a job that was NEVER claimed (server side): the
 * owner-scoped cancel of a QUEUED row. No lease exists — no runner ever owned
 * it — so the guard is the state itself; a row that got claimed between the
 * cancel flag and this call belongs to its runner, which honors the flag.
 */
export async function finalizeQueuedJob(
	jobId: string,
	state: Extract<DiffusionJobState, 'cancelled' | 'failed'>,
	result: DiffusionJobResult,
): Promise<void> {
	await sql.unsafe(
		`UPDATE "${DIFFUSION_JOBS_TABLE}"
		 SET state = $2, result = $3::jsonb, finished_at = now(),
		     totals = totals || jsonb_build_object('msg', $4::text)
		 WHERE job_id = $1 AND state = 'queued'`,
		[jobId, state, result, result.msg],
	);
	await notifyProgress(jobId);
}

/**
 * Cancellation request (server side, owner-scoped; admin passes ownerUserId
 * null). Marks the flag — the runner honors it between batches — and returns
 * whether an ACTIVE job matched (the pinned cancel_process contract).
 */
export async function requestCancel(
	clientProcessId: string,
	ownerUserId: number | null,
): Promise<{ cancelled: boolean; job: DiffusionJobRow | null }> {
	await ensureDiffusionJobTables();
	const rows = (await sql.unsafe(
		`UPDATE "${DIFFUSION_JOBS_TABLE}"
		 SET cancel_requested = true,
		     errors = errors || to_jsonb('Process cancelled by user'::text),
		     totals = totals || jsonb_build_object('msg', 'Process cancelled by user')
		 WHERE client_process_id = $1
		   AND state IN ('queued','running')
		   AND ($2::int IS NULL OR owner_user_id = $2::int)
		 RETURNING ${JOB_COLUMNS}`,
		[clientProcessId, ownerUserId],
	)) as unknown;
	const job = normalizeJobRows(rows)[0] ?? null;
	if (job !== null) {
		// A QUEUED job has no runner to honor the flag — finalize it here.
		if (job.state === 'queued') {
			await finalizeQueuedJob(
				job.job_id,
				'cancelled',
				failedJobResult(new DedaloError('diffusion.cancelled'), 'Process cancelled by user'),
			);
		} else {
			await notifyProgress(job.job_id);
		}
		return { cancelled: true, job };
	}
	return { cancelled: false, job: null };
}

/** Runner-side check between batches. */
export async function isCancelRequested(jobId: string): Promise<boolean> {
	const rows = (await sql.unsafe(
		`SELECT cancel_requested FROM "${DIFFUSION_JOBS_TABLE}" WHERE job_id = $1`,
		[jobId],
	)) as { cancel_requested: boolean }[];
	return rows[0]?.cancel_requested ?? true;
}

export async function getJobById(jobId: string): Promise<DiffusionJobRow | null> {
	await ensureDiffusionJobTables();
	const rows = (await sql.unsafe(
		`SELECT ${JOB_COLUMNS} FROM "${DIFFUSION_JOBS_TABLE}" WHERE job_id = $1`,
		[jobId],
	)) as unknown;
	return normalizeJobRows(rows)[0] ?? null;
}

/**
 * Newest job for a client label, owner-scoped (admin: ownerUserId null).
 * Client reconnect + get_process_status resolve through this.
 */
export async function getJobByClientProcessId(
	clientProcessId: string,
	ownerUserId: number | null,
): Promise<DiffusionJobRow | null> {
	await ensureDiffusionJobTables();
	const rows = (await sql.unsafe(
		`SELECT ${JOB_COLUMNS} FROM "${DIFFUSION_JOBS_TABLE}"
		 WHERE client_process_id = $1
		   AND ($2::int IS NULL OR owner_user_id = $2::int)
		 ORDER BY created_at DESC LIMIT 1`,
		[clientProcessId, ownerUserId],
	)) as unknown;
	return normalizeJobRows(rows)[0] ?? null;
}

/**
 * Jobs visible to a caller for list_processes — owner-scoped (admin: all),
 * bounded to the old store's 24h retention window so the payload matches the
 * old engine's auto-purged view (progress_store.ts MAX_AGE_MS).
 */
export async function listJobsForCaller(ownerUserId: number | null): Promise<DiffusionJobRow[]> {
	await ensureDiffusionJobTables();
	return normalizeJobRows(
		await sql.unsafe(
			`SELECT ${JOB_COLUMNS} FROM "${DIFFUSION_JOBS_TABLE}"
			 WHERE created_at > now() - interval '24 hours'
			   AND ($1::int IS NULL OR owner_user_id = $1::int)
			 ORDER BY created_at DESC
			 LIMIT 200`,
			[ownerUserId],
		),
	);
}

/** Count of currently claimed runs (scheduler concurrency limit input). */
export async function countRunningJobs(): Promise<number> {
	await ensureDiffusionJobTables();
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM "${DIFFUSION_JOBS_TABLE}" WHERE state = 'running'`,
	)) as { n: number }[];
	return rows[0]?.n ?? 0;
}

/**
 * One ACTIVE job as read for the admin queue stream. Deliberately NOT
 * DiffusionJobRow: the jsonb columns are projected to scalars in SQL and the
 * unbounded ones are not selected at all (see listActiveJobs).
 *
 * counter/total/msg arrive as TEXT on purpose. A `::int` cast in the query
 * would make ONE malformed legacy totals value abort the whole stream for
 * every admin; coercing per field in the projection degrades that to a single
 * job showing 0.
 */
export interface ActiveJobRow {
	job_id: string;
	client_process_id: string;
	state: DiffusionJobState;
	counter_text: string | null;
	total_text: string | null;
	msg: string | null;
	cancel_requested: boolean;
	attempt: number;
	max_attempts: number;
	/** Window aggregates — exact over the whole active set, see below. */
	n_running: number;
	n_queued: number;
}

/**
 * The active job set for the admin queue stream (WC-067) — the ONLY statement
 * that stream's tick is allowed to run.
 *
 * (!) NOT listJobsForCaller(null). That reader is the 24h HISTORY view behind
 * list_processes and the maintenance widget's get_value: up to 200 rows of six
 * whole jsonb columns, including `spec` (which carries the entire sanitized
 * SQO) and `errors` (an unbounded string[] appended per failing field), every
 * one of them re-parsed by normalizeJobRow on every read. Polling THAT once a
 * second per connected admin re-reads a quarter of a megabyte of rows that
 * cannot change — 24h of completed history — to observe a counter that moves
 * once per batch. This reader returns only rows that can still change, and
 * projects them narrow.
 *
 * The counts are WINDOW aggregates, not a separate query: Postgres evaluates
 * window functions after WHERE but before ORDER BY/LIMIT, so they stay exact
 * over the whole active set even when LIMIT truncates the rows returned. That
 * makes the LIMIT an output cap, never a correctness cap.
 *
 * Served by the partial index <table>_state_idx (schema.ts) — which exists for
 * exactly this predicate and had no observer until now.
 */
export async function listActiveJobs(): Promise<ActiveJobRow[]> {
	await ensureDiffusionJobTables();
	return (await sql.unsafe(
		`SELECT job_id, client_process_id, state,
		        totals->>'counter' AS counter_text,
		        totals->>'total'   AS total_text,
		        totals->>'msg'     AS msg,
		        cancel_requested, attempt, max_attempts,
		        (count(*) FILTER (WHERE state = 'running') OVER ())::int AS n_running,
		        (count(*) FILTER (WHERE state = 'queued')  OVER ())::int AS n_queued
		   FROM "${DIFFUSION_JOBS_TABLE}"
		  WHERE state IN ('queued','running')
		  ORDER BY created_at DESC
		  LIMIT 100`,
	)) as ActiveJobRow[];
}

/**
 * One of the caller's own ACTIVE jobs, projected for the activity tray.
 *
 * (!) NOT listJobsForCaller(userId). That reader is the 24h HISTORY view — up to
 * 200 rows of whole jsonb columns including `spec` (the entire sanitized SQO) and
 * an unbounded `errors` — and its own comment warns against putting it on a
 * repeating read. The tray asks "what of mine is running right now" on every page
 * load, which is exactly that mistake in a new caller. This reader answers only
 * that question, filtered by owner and projected to scalars in SQL.
 *
 * Served by the same partial `_state_idx` as listActiveJobs; the owner predicate
 * narrows an already-tiny set.
 */
export interface OwnedActiveJobRow {
	job_id: string;
	client_process_id: string;
	state: DiffusionJobState;
	section_tipo: string | null;
	diffusion_element_tipo: string | null;
	counter_text: string | null;
	total_text: string | null;
	msg: string | null;
	created_at: string;
	/** Null while live; the terminal instant once finished. */
	finished_at: string | null;
	/** The job's own error list, so a FAILED publication can say why. */
	errors: unknown;
}

export async function listActiveJobsForOwner(
	ownerUserId: number,
	recentTerminalMs: number,
): Promise<OwnedActiveJobRow[]> {
	await ensureDiffusionJobTables();
	return (await sql.unsafe(
		`SELECT job_id, client_process_id, state,
		        spec->>'section_tipo'            AS section_tipo,
		        spec->>'diffusion_element_tipo'  AS diffusion_element_tipo,
		        totals->>'counter' AS counter_text,
		        totals->>'total'   AS total_text,
		        totals->>'msg'     AS msg,
		        created_at, finished_at, errors
		   FROM "${DIFFUSION_JOBS_TABLE}"
		  WHERE owner_user_id = $1::int
		    AND (state IN ('queued','running')
		         OR finished_at > now() - ($2::int * interval '1 millisecond'))
		  ORDER BY created_at DESC
		  LIMIT 50`,
		[ownerUserId, recentTerminalMs],
	)) as OwnedActiveJobRow[];
}

/** Count of jobs waiting to be claimed (scheduler backlog — admin widget input). */
export async function countQueuedJobs(): Promise<number> {
	await ensureDiffusionJobTables();
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM "${DIFFUSION_JOBS_TABLE}" WHERE state = 'queued'`,
	)) as { n: number }[];
	return rows[0]?.n ?? 0;
}

/**
 * Attempts an admin requeue grants, counted FORWARD from the current epoch.
 * Mirrors the schema's `max_attempts` DEFAULT (schema.ts) — the same budget a
 * freshly enqueued job gets.
 */
const ADMIN_REQUEUE_ATTEMPT_BUDGET = 3;

/**
 * Manual admin requeue of a TERMINAL/interrupted job → queued with a FRESH
 * attempt budget. Mirrors the sweepStaleJobs requeue SQL but is user-driven and
 * clears the previous outcome (result/errors/finished_at). The state guard
 * (only failed|cancelled|interrupted) guarantees a live running/queued row is
 * never disturbed. Returns the updated row, or null when no eligible row matched.
 *
 * (!) It does NOT reset `attempt` (PUB-13). Rewinding the counter re-issues an
 * epoch: a runner that was merely SLOW under epoch 1 — the sweeper took its row,
 * the budget ran out, an admin revived it — would find its lease matching the
 * NEW claim's epoch 1 again and every fenced write would land on the live run
 * (measured ABA). The budget is granted by raising `max_attempts` instead, so
 * the epoch only ever moves forward and the loser stays locked out for the life
 * of the row.
 */
export async function requeueTerminalJob(jobId: string): Promise<DiffusionJobRow | null> {
	await ensureDiffusionJobTables();
	const rows = (await sql.unsafe(
		`UPDATE "${DIFFUSION_JOBS_TABLE}"
		 SET state = 'queued', runner = '{}'::jsonb, heartbeat_at = NULL,
		     cancel_requested = false, finished_at = NULL, result = NULL,
		     max_attempts = attempt + $2::int,
		     errors = '[]'::jsonb,
		     totals = totals || jsonb_build_object('msg', 'Requeued by admin')
		 WHERE job_id = $1 AND state IN ('failed','cancelled','interrupted')
		 RETURNING ${JOB_COLUMNS}`,
		[jobId, ADMIN_REQUEUE_ATTEMPT_BUDGET],
	)) as unknown;
	const job = normalizeJobRows(rows)[0] ?? null;
	if (job !== null) await notifyProgress(job.job_id);
	return job;
}

/**
 * Housekeeping: hard-delete terminal jobs (completed|failed|cancelled) finished
 * before the cutoff. Returns the number of rows removed.
 */
export async function purgeTerminalJobs(olderThanHours: number): Promise<{ purged: number }> {
	await ensureDiffusionJobTables();
	const rows = (await sql.unsafe(
		`WITH deleted AS (
			DELETE FROM "${DIFFUSION_JOBS_TABLE}"
			WHERE state IN ('completed','failed','cancelled')
			  AND finished_at IS NOT NULL
			  AND finished_at < now() - make_interval(hours => $1)
			RETURNING job_id
		 )
		 SELECT count(*)::int AS n FROM deleted`,
		[olderThanHours],
	)) as { n: number }[];
	return { purged: rows[0]?.n ?? 0 };
}

/**
 * Sweep crashed runs: running jobs whose heartbeat is older than
 * `staleAfterSeconds` re-queue (attempt budget permitting) or fail. Runs at
 * boot and on an interval (spec §4.2 crash recovery). Chunk determinism +
 * idempotent writes make the re-run safe.
 *
 * CRASH-ATOMIC (audit S3-63): both transitions happen in ONE statement — the
 * old two-step (mark 'interrupted', then requeue/fail per job) could crash
 * between the UPDATEs and strand a job in 'interrupted', a black-hole state
 * no automatic path revisited and purge never deleted. 'interrupted' remains
 * a manual-requeue-eligible state (requeueTerminalJob) but the sweeper no
 * longer parks jobs there.
 */
export async function sweepStaleJobs(staleAfterSeconds: number): Promise<{
	requeued: string[];
	failed: string[];
}> {
	await ensureDiffusionJobTables();
	// The failure RECORD (`{ok:false, error:{code:'diffusion.runner_lost',…}}`)
	// is converter-made in TS and bound as jsonb (`$N::text::jsonb` — the Bun.sql
	// bind rule: a bare `::jsonb` on a string param double-encodes it as a jsonb
	// STRING scalar); only the attempt-count `msg` line is composed in SQL (the
	// count is known only inside the UPDATE).
	const runnerLost = JSON.stringify(toFailureRecord(new DedaloError('diffusion.runner_lost')));
	const swept = (await sql.unsafe(
		`UPDATE "${DIFFUSION_JOBS_TABLE}"
		 SET state = CASE WHEN attempt < max_attempts THEN 'queued' ELSE 'failed' END,
		     runner = CASE WHEN attempt < max_attempts THEN '{}'::jsonb ELSE runner END,
		     heartbeat_at = NULL,
		     finished_at = CASE WHEN attempt < max_attempts THEN finished_at ELSE now() END,
		     result = CASE WHEN attempt < max_attempts THEN result ELSE
		         $2::text::jsonb || jsonb_build_object(
		             'msg', 'Interrupted after ' || attempt || ' attempts (runner lost)') END,
		     totals = CASE WHEN attempt < max_attempts THEN totals ELSE
		         totals || jsonb_build_object(
		             'msg', 'Interrupted after ' || attempt || ' attempts (runner lost)') END
		 -- UNFENCED BY DESIGN: this statement is the REVOKER. It does not check
		 -- runner.pid either — a runner on another host has no pid here, so pid
		 -- liveness could only ever cover the local deployment. The epoch fence is
		 -- the structural closure: whichever process lost the row cannot write to
		 -- it again, alive or not (PUB-13).
		 WHERE state = 'running'
		   AND (heartbeat_at IS NULL OR heartbeat_at < now() - make_interval(secs => $1))
		 RETURNING job_id, state`,
		[staleAfterSeconds, runnerLost],
	)) as { job_id: string; state: string }[];
	const requeued: string[] = [];
	const failed: string[] = [];
	for (const job of swept) {
		(job.state === 'queued' ? requeued : failed).push(job.job_id);
		await notifyProgress(job.job_id);
	}
	return { requeued, failed };
}

/** Test helper: hard-delete rows created by a suite (never used in production). */
export async function deleteJobsForTests(jobIds: string[]): Promise<void> {
	if (jobIds.length === 0) return;
	// Bun.sql serializes JS arrays without the {} wrapper — build the
	// Postgres array literal explicitly (uuids are hex+dashes, no quoting needed).
	await sql.unsafe(`DELETE FROM "${DIFFUSION_JOBS_TABLE}" WHERE job_id = ANY($1::uuid[])`, [
		`{${jobIds.join(',')}}`,
	]);
}
