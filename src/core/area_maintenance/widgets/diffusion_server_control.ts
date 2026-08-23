/**
 * diffusion_server_control widget — the NATIVE diffusion engine dashboard +
 * lifecycle (re-homed off the PHP daemon-era widget; the id stays for registry
 * stability). Status, durable job queue, scheduler controls, pending-unpublish
 * retry.
 */

import type { DiffusionJobRow } from '../../../diffusion/jobs/queue.ts';
import { sql } from '../../db/postgres.ts';
import { DedaloError } from '../../errors/dedalo_error.ts';
import type { WidgetModule, WidgetResponse } from './support.ts';

/** Pending unpublish rows (dd1758 whose dd1767 action is unpublish_pending). */
export async function countPendingDiffusion(): Promise<number> {
	// Whole-column containment (not relation->'dd1767' @> ...) so the existing
	// relation GIN index serves the predicate — the arrow form seq-scans the
	// multi-million-row table.
	//
	// The action is probed in EVERY stored shape — the D16 explicit
	// `diffusion_action` key this engine writes, plus both typed section_id
	// forms of the legacy locator shape (WC-2026-08-10-section-id-int-canonical:
	// jsonb `@>` is type-strict, and the legacy form is a string until the int
	// sweep, an int after). A single-shape probe would silently report zero
	// pending unpublishes. The payload set is owned by the ledger writer, so the
	// widget never restates it.
	const { DIFFUSION_ACTION, diffusionActionContains } = await import(
		'../../diffusion_bridge/diffusion_delete.ts'
	);
	const queryParams: string[] = [];
	const pendingClause = diffusionActionContains(
		'relation',
		DIFFUSION_ACTION.unpublishPending,
		(payload) => {
			queryParams.push(payload);
			return `$${queryParams.length}`;
		},
	);
	const rows = (await sql.unsafe(
		`SELECT COUNT(*) AS n FROM matrix_activity_diffusion
		 WHERE section_tipo = 'dd1758'
		   AND ${pendingClause}`,
		queryParams,
	)) as { n: number | string }[];
	return Number(rows[0]?.n ?? 0);
}

/** Project a durable job row to the admin-facing shape the widget renders. */
function mapJobToClient(row: DiffusionJobRow): Record<string, unknown> {
	// job_id is exposed here deliberately: the queue's "auth is never by
	// id-knowledge" rule is upheld by the global-admin DISPATCH gate, not by
	// keeping the id secret. Requeue/purge need the unambiguous row id.
	return {
		job_id: row.job_id,
		process_id: row.client_process_id,
		state: row.state,
		element_tipo: row.spec?.diffusion_element_tipo ?? null,
		section_tipo: row.spec?.section_tipo ?? null,
		type: row.spec?.type ?? null,
		counter: row.totals?.counter ?? 0,
		total: row.totals?.total ?? 0,
		msg: row.totals?.msg ?? null,
		attempt: row.attempt,
		max_attempts: row.max_attempts,
		cancel_requested: row.cancel_requested,
		created_at: row.created_at,
		started_at: row.started_at,
		finished_at: row.finished_at,
		errors: row.errors,
	};
}

/** Parse a positive integer from an env string, else null. */
function envIntOrNull(raw: string | undefined): number | null {
	if (raw === undefined || raw === '') return null;
	const n = Number(raw);
	return Number.isFinite(n) ? n : null;
}

/**
 * Lazy diffusion-module loader — the boundary rule (DIFFUSION_SPEC §2.5)
 * allows core to reach src/diffusion only through DYNAMIC imports (same seam
 * as dispatch.ts / server.ts boot); the type-only DiffusionJobRow import above
 * is erased at compile and carries no runtime edge.
 */
async function diffusionModules() {
	const [info, queue, scheduler, writers] = await Promise.all([
		import('../../../diffusion/api/info.ts'),
		import('../../../diffusion/jobs/queue.ts'),
		import('../../../diffusion/jobs/scheduler.ts'),
		import('../../../diffusion/writers/registry.ts'),
	]);
	return { info, queue, scheduler, writers };
}

/**
 * diffusion_server_control.get_value — the NATIVE engine dashboard: the
 * in-process advisory (no separate daemon to be "down"), the durable job queue
 * (all states, admin scope), the scheduler status (concurrency + backlog +
 * pause flag), the pending-unpublish count and an engine-native config summary.
 */
export async function diffusionControlGetValue(): Promise<WidgetResponse> {
	const { info, queue, scheduler, writers } = await diffusionModules();
	const { readEnv } = await import('../../../config/env.ts');
	const { readBool } = await import('../../../config/readers.ts');
	const { config } = await import('../../../config/config.ts');
	const [running, queued, jobs, pending] = await Promise.all([
		queue.countRunningJobs(),
		queue.countQueuedJobs(),
		queue.listJobsForCaller(null), // admin scope: all jobs (24h window, LIMIT 200)
		countPendingDiffusion(),
	]);
	const configSummary = {
		// readBool, not readEnv==='true': the catalog default (true) must apply on
		// an install that never wrote the key, or this panel reports "external
		// engine" while buildPlainVars routes the tool at the native one.
		native: readBool('DEDALO_DIFFUSION_NATIVE'),
		// Wire value UNCHANGED (comma string or null — the client renders it with
		// String(...)), but the SOURCE is now the one resolved set: the raw key may
		// hold a JSON array, which the readEnv passthrough here published verbatim.
		native_elements:
			config.diffusion.nativeElements.length > 0 ? config.diffusion.nativeElements.join(',') : null,
		resolve_levels: envIntOrNull(readEnv('DEDALO_DIFFUSION_RESOLVE_LEVELS')),
		// The ONE resolution of the publication languages, never a second parse of
		// the raw key (the hand `.split(',')` that stood here shredded the JSON
		// array the v6->v7 migration writes into phantom codes). The UNSET case now
		// DERIVES the project languages rather than showing an empty list: the
		// frozen oracle (test/parity/fixtures/oracle_harvest/widgets_differential.json,
		// `dedalo_diffusion_langs`) shows the full derived set, so an empty panel
		// contradicted what the engine actually publishes.
		langs: [...config.diffusion.langs],
		batch_rows: envIntOrNull(readEnv('DEDALO_DIFFUSION_BATCH_ROWS')),
		batch_records: envIntOrNull(readEnv('DEDALO_DIFFUSION_BATCH_RECORDS')),
		target_db_socket: (readEnv('DEDALO_DIFFUSION_DB_SOCKET') ?? '') !== '',
		target_db_host: readEnv('DEDALO_DIFFUSION_DB_HOST') ?? null,
		target_db_user_configured: (readEnv('DEDALO_DIFFUSION_DB_USER') ?? '') !== '',
		formats: [...writers.WRITER_REGISTRY.keys()],
	};
	return {
		data: {
			engine: info.buildEngineAdvisory(true),
			scheduler: {
				running,
				max_runners: scheduler.getMaxRunners(),
				queued,
				stale_after_seconds: scheduler.STALE_AFTER_SECONDS,
				paused: scheduler.isSchedulerPaused(),
				draining: scheduler.isSchedulerDraining(),
			},
			jobs: jobs.map(mapJobToClient),
			pending,
			// wire key unchanged; the local const is `configSummary` so it cannot be
			// confused with the engine `config` object it now reads from.
			config: configSummary,
			is_admin: true, // the dispatch gate already enforced global admin
		},
	};
}

/** cancel_process — mark the queue row cancelled (admin scope), no socket. */
async function diffusionCancelProcess(options: Record<string, unknown>): Promise<WidgetResponse> {
	const processId = options.process_id;
	if (typeof processId !== 'string' || processId === '') {
		throw new DedaloError('diffusion.invalid_process_id');
	}
	const { queue } = await diffusionModules();
	const { cancelled } = await queue.requestCancel(processId, null); // admin: any owner
	if (!cancelled) {
		throw new DedaloError('resource.not_found', { coordinates: { process_id: processId } });
	}
	return { data: true, msg: `OK. Process ${processId} cancelled` };
}

/** requeue_job — re-run a terminal/interrupted job, then kick the scheduler. */
async function diffusionRequeueJob(options: Record<string, unknown>): Promise<WidgetResponse> {
	const jobId = options.job_id;
	if (typeof jobId !== 'string' || jobId === '') {
		throw new DedaloError('diffusion.invalid_job_id');
	}
	const { queue, scheduler } = await diffusionModules();
	const job = await queue.requeueTerminalJob(jobId);
	if (job === null) {
		throw new DedaloError('diffusion.not_requeueable', { coordinates: { job_id: jobId } });
	}
	void scheduler.schedulerTick(); // immediate non-blocking kick, mirrors the enqueue path
	return { data: true, msg: `OK. Job ${jobId} requeued` };
}

/** purge_jobs — housekeeping: drop aged terminal job rows. */
async function diffusionPurgeJobs(options: Record<string, unknown>): Promise<WidgetResponse> {
	const hours =
		typeof options.older_than_hours === 'number' && options.older_than_hours >= 0
			? options.older_than_hours
			: 24;
	const { queue } = await diffusionModules();
	const { purged } = await queue.purgeTerminalJobs(hours);
	return { data: true, msg: `OK. Purged ${purged} terminal job(s) older than ${hours}h` };
}

/**
 * set_scheduler — control job DISPATCH (in-memory; the sweeper keeps running).
 *
 * These are the three lifecycle controls. They act on DISPATCH, not on a
 * process: post-cutover diffusion runs inside this server (WC-005), so there is
 * no daemon to start or stop. `drain_resume` is the honest analogue of the old
 * "restart" — quiesce, then start dispatching again.
 */
async function diffusionSetScheduler(options: Record<string, unknown>): Promise<WidgetResponse> {
	const action = options.action;
	if (action !== 'pause' && action !== 'resume' && action !== 'drain_resume') {
		throw new DedaloError('diffusion.invalid_action');
	}
	const { scheduler } = await diffusionModules();

	if (action === 'drain_resume') {
		// COVERAGE-EXEMPT, this already-draining arm (coverage plan §5.2; reason
		// registered in engineering/crap_coverage_exempt.json): reaching it requires a
		// real drain in flight on the run-shared scheduler singleton, which no gate may
		// start. Already dropped once by a prior plan — do not re-propose it.
		if (scheduler.isSchedulerDraining()) {
			throw new DedaloError('diffusion.already_draining');
		}
		// STARTED, not awaited. The wait is bounded by DRAIN_TIMEOUT_MS (minutes),
		// which outlives any request budget — SERVER_IDLE_TIMEOUT_S caps at 255 s
		// and the proxy's read timeout sits at 300 s. Progress is observable on the
		// queue stream (`scheduler.draining`), which is how the widget follows it.
		// Caught, never floating: an unhandled rejection kills the process (S1-15).
		void scheduler.drainAndResume().catch((error) => {
			console.error('[diffusion] drain failed:', error);
		});
		return {
			data: true,
			msg: 'OK. Draining — dispatch held until the running jobs finish, then resumed',
		};
	}

	if (action === 'pause') scheduler.pauseScheduler();
	else scheduler.resumeScheduler();
	const paused = scheduler.isSchedulerPaused();
	return {
		data: true,
		msg: paused ? 'OK. Scheduler paused (no new jobs dispatched)' : 'OK. Scheduler resumed',
	};
}

/**
 * retry_pending_deletions — count_only reports the pending dd1758 rows;
 * otherwise re-runs them through retryPendingDiffusion (DIFFU-08 in-place
 * flip). Response shape mirrors dd_diffusion_api::retry_pending_deletions.
 */
async function diffusionRetryPending(options: Record<string, unknown>): Promise<WidgetResponse> {
	if (options.count_only === true) {
		const pending = await countPendingDiffusion();
		return { data: { pending }, msg: `OK. ${pending} pending deletion(s)` };
	}
	// COVERAGE-EXEMPT, this `count_only=false` retry arm (coverage plan §5.2; reason
	// registered in engineering/crap_coverage_exempt.json): it re-runs an UNFILTERED
	// select over the run-shared dd1758 pending table and flips rows in place, so a
	// gate would act on other agents' data. It is already gated by a SUBPROCESS test
	// (prior-plan drop) — do not re-propose an in-process one.
	const limit = typeof options.limit === 'number' ? options.limit : 100;
	const { retryPendingDiffusion } = await import('../../diffusion_bridge/diffusion_delete.ts');
	const outcome = await retryPendingDiffusion(limit);
	return {
		data: { total: outcome.total, retried: outcome.retried, remaining: outcome.remaining },
		msg: `OK. Retried ${outcome.retried} of ${outcome.total} pending deletion(s); ${outcome.remaining} remaining`,
	};
}

export const widget: WidgetModule = {
	spec: {
		// Re-homed onto the NATIVE diffusion engine (durable job queue + scheduler);
		// the id stays for registry stability, but the visible label no longer
		// mirrors the PHP daemon-era term — an INTENTIONAL divergence from the PHP
		// oracle (carved out of the label byte-parity check in widgets_differential).
		id: 'diffusion_server_control',
		category: 'diffusion',
		background: true,
		label: { kind: 'literal', text: 'Diffusion engine & queue' },
	},
	apiActions: {
		get_value: diffusionControlGetValue,
		cancel_process: diffusionCancelProcess,
		requeue_job: diffusionRequeueJob,
		purge_jobs: diffusionPurgeJobs,
		set_scheduler: diffusionSetScheduler,
		retry_pending_deletions: diffusionRetryPending,
	},
	getValue: diffusionControlGetValue,
};
