/**
 * Background tool execution (PHP exec_::request_cli → process_runner.php).
 *
 * PHP forks a CLI child because PHP is request-scoped and cannot keep working
 * after the response is sent. Bun's server is a persistent process, so the
 * faithful equivalent is a fire-and-forget promise plus an in-process job
 * record: schedule the handler, return immediately, let it run on the event
 * loop. The declarative permission gate has ALREADY run in the dispatcher
 * (before this call); here we enforce the SECOND allowlist — the action must be
 * listed in the module's backgroundRunnable (PHP BACKGROUND_RUNNABLE), else no
 * background fork is granted.
 *
 * LEDGERED (engineering/TOOLS_SPEC.md): jobs die on server restart (a PHP CLI child
 * survives an Apache reload), and a CPU-bound handler shares the event loop — a
 * Bun Worker executor is a drop-in follow-up behind this same signature.
 */

import type { Principal } from '../security/permissions.ts';
import type { LoadedTool } from './loader.ts';
import type { ToolActionSpec, ToolResponse } from './module.ts';

/** One background job's live record. */
export interface BackgroundJob {
	id: string;
	tool: string;
	action: string;
	status: 'running' | 'done' | 'error';
	result?: ToolResponse;
	error?: string;
	/** The requesting user (terminal-state journal identity, audit S2-16). */
	userId?: number;
	/** Date.now() at schedule time (duration for the journal). */
	startedAt?: number;
}

/** In-process job table (cleared on restart — see the ledger note above). */
const jobs = new Map<string, BackgroundJob>();

/** In-memory retention of TERMINAL job records (bounded map, audit S3-62). */
const TERMINAL_EVICT_AFTER_MS = 60 * 60 * 1000;

/** Inspect a background job's status/result (for a future status endpoint/tests). */
export function getBackgroundJob(id: string): BackgroundJob | undefined {
	return jobs.get(id);
}

/** Clear the job table (tests). */
export function resetBackgroundJobs(): void {
	jobs.clear();
}

/** Gauge snapshot for the admin counters endpoint (audit S2-37). */
export function getBackgroundJobStats(): { total: number; running: number; error: number } {
	let running = 0;
	let error = 0;
	for (const job of jobs.values()) {
		if (job.status === 'running') running += 1;
		else if (job.status === 'error') error += 1;
	}
	return { total: jobs.size, running, error };
}

/**
 * Graceful-shutdown journal (audit S2-16/S2-17): in-process jobs DIE with the
 * server — say so on the record and in the log instead of vanishing silently.
 */
export function logDyingBackgroundJobs(): void {
	for (const job of jobs.values()) {
		if (job.status !== 'running') continue;
		job.status = 'error';
		job.error = 'killed by server shutdown before completion';
		console.error(
			`[background jobs] ${job.tool}::${job.action} (job ${job.id}, user ${job.userId ?? '?'}) killed by server shutdown before completion`,
		);
	}
}

/** Journal one terminal transition (audit S2-16: terminal states must be observable). */
function logTerminalState(job: BackgroundJob): void {
	const duration = job.startedAt !== undefined ? `${Date.now() - job.startedAt}ms` : '?ms';
	const identity = `${job.tool}::${job.action} (job ${job.id}, user ${job.userId ?? '?'}, ${duration})`;
	if (job.status === 'error') {
		console.error(`[background jobs] ${identity} FAILED: ${job.error ?? 'unknown error'}`);
	} else {
		const result = job.result?.result;
		const outcome = result === false ? `result:false — ${job.result?.msg ?? ''}` : 'ok';
		const log = result === false ? console.error : console.log;
		log(`[background jobs] ${identity} finished: ${outcome}`);
	}
	// Bounded map (S3-62): evict the terminal record (with its full ToolResponse
	// payload) after the polling grace period.
	const evictionTimer = setTimeout(() => jobs.delete(job.id), TERMINAL_EVICT_AFTER_MS);
	if (typeof (evictionTimer as { unref?: () => void }).unref === 'function') {
		(evictionTimer as unknown as { unref: () => void }).unref();
	}
}

/**
 * Schedule an action to run in the background and return immediately. Refuses
 * (synchronously) when the action is not in the module's backgroundRunnable
 * allowlist — the second gate, matching process_runner's re-check.
 */
export function scheduleBackground(
	loaded: LoadedTool,
	method: string,
	spec: ToolActionSpec,
	options: Record<string, unknown>,
	principal: Principal,
	userId: number,
): ToolResponse {
	const allowed = loaded.module.backgroundRunnable ?? [];
	if (!allowed.includes(method)) {
		return {
			result: false,
			msg: `Error. Method not allowed for background execution: ${method}`,
			errors: ['background_not_allowed'],
		};
	}

	const id = crypto.randomUUID();
	const job: BackgroundJob = {
		id,
		tool: loaded.module.name,
		action: method,
		status: 'running',
		userId,
		startedAt: Date.now(),
	};
	jobs.set(id, job);

	// Fire-and-forget: the handler runs after we return. Errors are captured on
	// the job record, never thrown into the void — and every terminal transition
	// is journaled (audit S2-16: a failed 10k-row import must not be invisible).
	void spec
		.handler({ principal, userId, options, background: true })
		.then((result) => {
			job.status = 'done';
			job.result = result;
			logTerminalState(job);
		})
		.catch((error: unknown) => {
			job.status = 'error';
			job.error = error instanceof Error ? error.message : String(error);
			logTerminalState(job);
		});

	return {
		result: true,
		msg: 'OK. Background process started',
		errors: [],
		background_job_id: id,
	};
}
