/**
 * diffusion_server_control widget — the NATIVE diffusion engine dashboard +
 * lifecycle (re-homed off the PHP daemon-era widget; the id stays for registry
 * stability). Status, durable job queue, scheduler controls, pending-unpublish
 * retry.
 */

import type { DiffusionJobRow } from '../../../diffusion/jobs/queue.ts';
import { sql } from '../../db/postgres.ts';
import type { WidgetModule, WidgetResponse } from './support.ts';

/** Pending unpublish rows (dd1758 whose dd1767 action is unpublish_pending). */
export async function countPendingDiffusion(): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT COUNT(*) AS n FROM matrix_activity_diffusion
		 WHERE section_tipo = 'dd1758'
		   AND relation->'dd1767' @> '[{"section_id":"3","section_tipo":"dd1774"}]'`,
		[],
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
	const [running, queued, jobs, pending] = await Promise.all([
		queue.countRunningJobs(),
		queue.countQueuedJobs(),
		queue.listJobsForCaller(null), // admin scope: all jobs (24h window, LIMIT 200)
		countPendingDiffusion(),
	]);
	const langsRaw = readEnv('DEDALO_DIFFUSION_LANGS') ?? '';
	const config = {
		native: readEnv('DEDALO_DIFFUSION_NATIVE') === 'true',
		native_elements: readEnv('DEDALO_DIFFUSION_NATIVE_ELEMENTS') ?? null,
		resolve_levels: envIntOrNull(readEnv('DEDALO_DIFFUSION_RESOLVE_LEVELS')),
		langs: langsRaw
			.split(',')
			.map((lang) => lang.trim())
			.filter((lang) => lang !== ''),
		batch_rows: envIntOrNull(readEnv('DEDALO_DIFFUSION_BATCH_ROWS')),
		batch_records: envIntOrNull(readEnv('DEDALO_DIFFUSION_BATCH_RECORDS')),
		target_db_socket: (readEnv('DEDALO_DIFFUSION_DB_SOCKET') ?? '') !== '',
		target_db_host: readEnv('DEDALO_DIFFUSION_DB_HOST') ?? null,
		target_db_user_configured: (readEnv('DEDALO_DIFFUSION_DB_USER') ?? '') !== '',
		formats: [...writers.WRITER_REGISTRY.keys()],
	};
	return {
		result: {
			engine: info.buildEngineAdvisory(true),
			scheduler: {
				running,
				max_runners: scheduler.getMaxRunners(),
				queued,
				stale_after_seconds: scheduler.STALE_AFTER_SECONDS,
				paused: scheduler.isSchedulerPaused(),
			},
			jobs: jobs.map(mapJobToClient),
			pending,
			config,
			is_admin: true, // the dispatch gate already enforced global admin
		},
		msg: 'OK. Request done successfully',
		errors: [],
	};
}

/** cancel_process — mark the queue row cancelled (admin scope), no socket. */
async function diffusionCancelProcess(options: Record<string, unknown>): Promise<WidgetResponse> {
	const processId = options.process_id;
	if (typeof processId !== 'string' || processId === '') {
		return {
			result: false,
			msg: 'Error. Missing or invalid process_id',
			errors: ['invalid_process_id'],
		};
	}
	const { queue } = await diffusionModules();
	const { cancelled } = await queue.requestCancel(processId, null); // admin: any owner
	return {
		result: cancelled,
		msg: cancelled
			? `OK. Process ${processId} cancelled`
			: `No active job for process ${processId}`,
		errors: cancelled ? [] : ['not_found'],
	};
}

/** requeue_job — re-run a terminal/interrupted job, then kick the scheduler. */
async function diffusionRequeueJob(options: Record<string, unknown>): Promise<WidgetResponse> {
	const jobId = options.job_id;
	if (typeof jobId !== 'string' || jobId === '') {
		return {
			result: false,
			msg: 'Error. Missing or invalid job_id',
			errors: ['invalid_job_id'],
		};
	}
	const { queue, scheduler } = await diffusionModules();
	const job = await queue.requeueTerminalJob(jobId);
	if (job === null) {
		return {
			result: false,
			msg: 'Job not found or not in a requeueable (failed/cancelled/interrupted) state',
			errors: ['not_requeueable'],
		};
	}
	void scheduler.schedulerTick(); // immediate non-blocking kick, mirrors the enqueue path
	return { result: true, msg: `OK. Job ${jobId} requeued`, errors: [] };
}

/** purge_jobs — housekeeping: drop aged terminal job rows. */
async function diffusionPurgeJobs(options: Record<string, unknown>): Promise<WidgetResponse> {
	const hours =
		typeof options.older_than_hours === 'number' && options.older_than_hours >= 0
			? options.older_than_hours
			: 24;
	const { queue } = await diffusionModules();
	const { purged } = await queue.purgeTerminalJobs(hours);
	return {
		result: true,
		msg: `OK. Purged ${purged} terminal job(s) older than ${hours}h`,
		errors: [],
	};
}

/** set_scheduler — pause/resume job DISPATCH (in-memory; sweeper keeps running). */
async function diffusionSetScheduler(options: Record<string, unknown>): Promise<WidgetResponse> {
	const action = options.action;
	if (action !== 'pause' && action !== 'resume') {
		return {
			result: false,
			msg: "Error. Invalid scheduler action. Allowed: 'pause' | 'resume'",
			errors: ['invalid_action'],
		};
	}
	const { scheduler } = await diffusionModules();
	if (action === 'pause') scheduler.pauseScheduler();
	else scheduler.resumeScheduler();
	const paused = scheduler.isSchedulerPaused();
	return {
		result: true,
		msg: paused ? 'OK. Scheduler paused (no new jobs dispatched)' : 'OK. Scheduler resumed',
		errors: [],
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
		return {
			result: { pending } as unknown as WidgetResponse['result'],
			msg: `OK. ${pending} pending deletion(s)`,
			errors: [],
		};
	}
	const limit = typeof options.limit === 'number' ? options.limit : 100;
	const { retryPendingDiffusion } = await import('../../diffusion_bridge/diffusion_delete.ts');
	const outcome = await retryPendingDiffusion(limit);
	return {
		result: {
			total: outcome.total,
			retried: outcome.retried,
			remaining: outcome.remaining,
		} as unknown as WidgetResponse['result'],
		msg: `OK. Retried ${outcome.retried} of ${outcome.total} pending deletion(s); ${outcome.remaining} remaining`,
		errors: [],
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
