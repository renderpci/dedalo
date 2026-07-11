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
 */

import { sql, withTransaction } from '../../core/db/postgres.ts';
import { DIFFUSION_JOBS_TABLE, ensureDiffusionJobTables } from './schema.ts';
import type { DiffusionJobState } from './schema.ts';

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
			// verified against Bun 1.3.9. Bun serializes objects to jsonb objects.
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

/** Record the spawned runner's pid on a claimed job (post-spawn, scheduler side). */
export async function recordRunnerPid(jobId: string, pid: number): Promise<void> {
	await sql.unsafe(
		`UPDATE "${DIFFUSION_JOBS_TABLE}"
		 SET runner = runner || jsonb_build_object('pid', $2::int)
		 WHERE job_id = $1`,
		[jobId, pid],
	);
}

/** Runner heartbeat — proves liveness to the sweeper. */
export async function heartbeatJob(jobId: string): Promise<void> {
	await sql.unsafe(`UPDATE "${DIFFUSION_JOBS_TABLE}" SET heartbeat_at = now() WHERE job_id = $1`, [
		jobId,
	]);
}

/**
 * Runner progress update (merged into totals) + observer notify. Mirrors the
 * old engine's update_progress fields (progress_store.ts:62-103) so the SSE
 * projection is a straight read.
 */
export async function updateJobProgress(
	jobId: string,
	update: {
		counter: number;
		msg?: string;
		section_label?: string;
		current?: { section_id?: string | number; time?: number };
		total_ms?: number;
		error?: string;
	},
): Promise<void> {
	const { error, ...totalsPatch } = update;
	await sql.unsafe(
		`UPDATE "${DIFFUSION_JOBS_TABLE}"
		 SET totals = totals || $2::jsonb,
		     heartbeat_at = now(),
		     errors = CASE WHEN $3::text IS NULL THEN errors ELSE errors || to_jsonb($3::text) END
		 WHERE job_id = $1`,
		[jobId, totalsPatch, error ?? null],
	);
	await notifyProgress(jobId);
}

/** Persist the resume checkpoint of the last COMMITTED chunk (runner side). */
export async function checkpointJob(
	jobId: string,
	checkpoint: Record<string, unknown>,
): Promise<void> {
	await sql.unsafe(
		`UPDATE "${DIFFUSION_JOBS_TABLE}"
		 SET checkpoint = $2::jsonb, heartbeat_at = now()
		 WHERE job_id = $1`,
		[jobId, checkpoint],
	);
}

/** Terminal transition (runner side): completed | failed | cancelled. */
export async function finishJob(
	jobId: string,
	state: Extract<DiffusionJobState, 'completed' | 'failed' | 'cancelled'>,
	result: Record<string, unknown>,
): Promise<void> {
	await sql.unsafe(
		`UPDATE "${DIFFUSION_JOBS_TABLE}"
		 SET state = $2, result = $3::jsonb, finished_at = now(),
		     totals = totals || jsonb_build_object('msg', $4::text)
		 WHERE job_id = $1`,
		[jobId, state, result, String((result as { msg?: unknown }).msg ?? '')],
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
			await finishJob(job.job_id, 'cancelled', {
				result: false,
				msg: 'Process cancelled by user',
			});
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

/** Count of jobs waiting to be claimed (scheduler backlog — admin widget input). */
export async function countQueuedJobs(): Promise<number> {
	await ensureDiffusionJobTables();
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM "${DIFFUSION_JOBS_TABLE}" WHERE state = 'queued'`,
	)) as { n: number }[];
	return rows[0]?.n ?? 0;
}

/**
 * Manual admin requeue of a TERMINAL/interrupted job → queued with a FRESH
 * attempt budget. Mirrors the sweepStaleJobs requeue SQL but is user-driven and
 * clears the previous outcome (result/errors/finished_at). The state guard
 * (only failed|cancelled|interrupted) guarantees a live running/queued row is
 * never disturbed. Returns the updated row, or null when no eligible row matched.
 */
export async function requeueTerminalJob(jobId: string): Promise<DiffusionJobRow | null> {
	await ensureDiffusionJobTables();
	const rows = (await sql.unsafe(
		`UPDATE "${DIFFUSION_JOBS_TABLE}"
		 SET state = 'queued', runner = '{}'::jsonb, heartbeat_at = NULL,
		     cancel_requested = false, attempt = 0, finished_at = NULL, result = NULL,
		     errors = '[]'::jsonb,
		     totals = totals || jsonb_build_object('msg', 'Requeued by admin')
		 WHERE job_id = $1 AND state IN ('failed','cancelled','interrupted')
		 RETURNING ${JOB_COLUMNS}`,
		[jobId],
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
	const swept = (await sql.unsafe(
		`UPDATE "${DIFFUSION_JOBS_TABLE}"
		 SET state = CASE WHEN attempt < max_attempts THEN 'queued' ELSE 'failed' END,
		     runner = CASE WHEN attempt < max_attempts THEN '{}'::jsonb ELSE runner END,
		     heartbeat_at = NULL,
		     finished_at = CASE WHEN attempt < max_attempts THEN finished_at ELSE now() END,
		     result = CASE WHEN attempt < max_attempts THEN result ELSE
		         jsonb_build_object('result', false,
		             'msg', 'Interrupted after ' || attempt || ' attempts (runner lost)') END,
		     totals = CASE WHEN attempt < max_attempts THEN totals ELSE
		         totals || jsonb_build_object(
		             'msg', 'Interrupted after ' || attempt || ' attempts (runner lost)') END
		 WHERE state = 'running'
		   AND (heartbeat_at IS NULL OR heartbeat_at < now() - make_interval(secs => $1))
		 RETURNING job_id, state`,
		[staleAfterSeconds],
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
