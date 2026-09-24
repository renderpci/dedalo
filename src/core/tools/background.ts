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

import { DedaloError, ok, toDedaloError, wireMessage } from '../errors/index.ts';
import { type JobRecord, jobAbortInfo, mediaJobs } from '../media/jobs.ts';
import { currentApplicationLang } from '../resolve/request_lang.ts';
import type { Principal } from '../security/permissions.ts';
import { currentRequestContext } from '../security/request_context.ts';
import type { LoadedTool } from './loader.ts';
import type { ToolActionSpec, ToolResponse } from './module.ts';

/** One background job's live record. */
export interface BackgroundJob {
	id: string;
	tool: string;
	action: string;
	/**
	 * `stopped` = the USER's Stop (stop_process) ended it: while still queued
	 * for its lane slot (the handler never ran), or while its handler ran and
	 * surfaced the stop by throwing (a cooperative handler's abort — e.g.
	 * `export.cancelled`). A stop is not a failure: it is journaled at info
	 * level and never counted in the `error` gauge, and it agrees with the lane
	 * record (media/jobs.ts: 'stopped', no `error` body). Any OTHER throw is
	 * `error`; a handler that returns is `done` — its own outcome.
	 */
	status: 'running' | 'done' | 'error' | 'stopped';
	result?: ToolResponse;
	error?: string;
	/** The requesting user (terminal-state journal identity, audit S2-16). */
	userId?: number;
	/** Date.now() at schedule time (duration for the journal). */
	startedAt?: number;
	/**
	 * The section the job was submitted for (`options.section_tipo` when a
	 * string), captured at submit. In-process only, NOT served by the framework
	 * wires: a tool reads it to tell which of the user's QUEUED jobs belong to a
	 * section before the handler has written anything (tool_export's
	 * list_export_jobs `pending` — a queued walk has no manifest yet).
	 */
	sectionTipo?: string;
}

/** The current RQO's id (the tool dispatcher opens the scope), or '' outside a request. */
function currentRequestId(): string {
	return currentRequestContext()?.requestId ?? '';
}

/** In-process job table (cleared on restart — see the ledger note above). */
const jobs = new Map<string, BackgroundJob>();

/** In-memory retention of TERMINAL job records (bounded map, audit S3-62). */
const TERMINAL_EVICT_AFTER_MS = 60 * 60 * 1000;

/** Inspect a background job's status/result (for a future status endpoint/tests). */
export function getBackgroundJob(id: string): BackgroundJob | undefined {
	return jobs.get(id);
}

/**
 * The caller's jobs for one tool, newest first.
 *
 * This is what makes CLIENT-SIDE job bookkeeping unnecessary. PHP forked a
 * DETACHED CLI child that the web layer had no memory of, so the only handle was
 * the {pid, pfile} pair handed back at launch — and the client had to persist it
 * (IndexedDB) or lose the job on the next page load. Here the job runs inside this
 * process and the registry already knows its tool and its owner, so a reloading
 * client can simply ASK: "do I have an import running?" The server is the single
 * source of truth, and the answer is correct in any tab, on any machine.
 *
 * `all` (global admins only) lifts the owner filter, matching the status wire.
 */
export function listBackgroundJobs(
	tool: string,
	userId: number,
	all = false,
): readonly BackgroundJob[] {
	const found: BackgroundJob[] = [];
	for (const job of jobs.values()) {
		if (job.tool !== tool) continue;
		if (!all && job.userId !== userId) continue;
		found.push(job);
	}
	// Newest first: a client re-attaching wants the run it just started, not the
	// one from an hour ago still inside the terminal-retention window.
	found.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
	return found;
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

/**
 * Did a finished job's captured response REFUSE? Envelope v2 says `ok:false`
 * (which a handler reaches only by throwing — the executor's catch converts it
 * into the captured response, so this is the terminal-state read).
 */
function jobRefused(response: ToolResponse | undefined): boolean {
	return response?.ok === false;
}

/** The journal line's tail and its channel for one terminal state. */
function terminalOutcome(job: BackgroundJob): { text: string; failed: boolean } {
	if (job.status === 'error') {
		return { text: `FAILED: ${job.error ?? 'unknown error'}`, failed: true };
	}
	if (job.status === 'stopped') {
		return { text: `stopped: ${job.error ?? 'never ran'}`, failed: false };
	}
	const failed = jobRefused(job.result);
	const outcome = failed ? `refused — ${String(job.result?.msg ?? '')}` : 'ok';
	return { text: `finished: ${outcome}`, failed };
}

/** Journal one terminal transition (audit S2-16: terminal states must be observable). */
function logTerminalState(job: BackgroundJob, logDetail?: string): void {
	const duration = job.startedAt !== undefined ? `${Date.now() - job.startedAt}ms` : '?ms';
	const identity = `${job.tool}::${job.action} (job ${job.id}, user ${job.userId ?? '?'}, ${duration})`;
	const { text, failed } = terminalOutcome(
		logDetail === undefined ? job : { ...job, error: logDetail },
	);
	(failed ? console.error : console.log)(`[background jobs] ${identity} ${text}`);
	// Bounded map (S3-62): evict the terminal record (with its full ToolResponse
	// payload) after the polling grace period.
	const evictionTimer = setTimeout(() => jobs.delete(job.id), TERMINAL_EVICT_AFTER_MS);
	if (typeof (evictionTimer as { unref?: () => void }).unref === 'function') {
		(evictionTimer as unknown as { unref: () => void }).unref();
	}
}

/**
 * Run an action's `admit` hook (ToolActionSpec.admit) — synchronously. The
 * caller relies on NOTHING yielding between this call and what it does next
 * (scheduleBackground registers the job), so a hook that returns a thenable is
 * a contract violation, refused loudly rather than awaited: awaiting it would
 * reopen the check-then-act gap the synchronous contract closes.
 */
export function runAdmission(
	spec: ToolActionSpec,
	principal: Principal,
	userId: number,
	options: Record<string, unknown>,
	coordinates: { tool: string; method: string },
): void {
	if (spec.admit === undefined) return;
	const returned: unknown = spec.admit({
		principal,
		userId,
		options,
		background: options.background_running === true,
	});
	if (
		returned !== undefined &&
		returned !== null &&
		typeof (returned as { then?: unknown }).then === 'function'
	) {
		// Never leave the hook's own rejection unhandled.
		(returned as Promise<unknown>).then(
			() => undefined,
			() => undefined,
		);
		throw new DedaloError('internal.invariant', {
			message: 'admit hook returned a promise — admission is synchronous by contract',
			coordinates,
		});
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
	/** Captured at SUBMIT time — the job outlives the request that started it. */
	clientIp?: string,
): ToolResponse {
	const allowed = loaded.module.backgroundRunnable ?? [];
	if (!allowed.includes(method)) {
		throw new DedaloError('tool.background_not_allowed', {
			coordinates: { tool: loaded.module.name, method },
		});
	}

	// THE LANE, read from the module's declaration — never inferred from the tool
	// or action name (PERF-11). An undeclared lane is a refusal, not a default:
	// silently filing the job into a fallback lane is how the starvation this
	// change removes would come back, and `tool.background_not_allowed` would lie
	// about the cause, so the refusal has its own closed-registry code.
	const lane = loaded.module.backgroundLanes?.[method];
	if (lane === undefined) {
		throw new DedaloError('tool.background_lane_undeclared', {
			coordinates: { tool: loaded.module.name, method },
		});
	}

	// ADMISSION, in the SAME synchronous step as the registration below: nothing
	// between this count and `jobs.set` yields, so two concurrent submissions of
	// one user cannot both pass a per-user cap (check-then-act, closed).
	runAdmission(spec, principal, userId, options, { tool: loaded.module.name, method });

	// The submitter's interface lang, read NOW — still the request's synchronous
	// flow — and handed to the handler explicitly (ToolActionContext.applicationLang):
	// a QUEUED job's handler runs from another job's release, never trusted to
	// inherit this request's lang scope.
	const applicationLang = currentApplicationLang();

	const job: BackgroundJob = {
		id: '',
		tool: loaded.module.name,
		action: method,
		status: 'running',
		userId,
		startedAt: Date.now(),
		...(typeof options.section_tipo === 'string' ? { sectionTipo: options.section_tipo } : {}),
	};

	// The work runs INSIDE the process-job registry (the same one the AV transcodes
	// and the backup widget use, and the only one dd_utils_api::get_process_status
	// can stream). That registry is what mints the pfile — without it the copied
	// client's progress panel polls a job that does not exist and never renders the
	// tool's report. Precedent: area_maintenance/widgets/update_data_version.ts.
	//
	// Errors are captured on the job record, never thrown into the void, and every
	// terminal transition is journaled (audit S2-16: a failed 10k-row import must
	// not be invisible).
	// Whether the HANDLER was entered. A job the manager ends before its worker
	// runs (stopped while queued, interrupted before its turn) has no handler
	// outcome to record — the onTerminal callback below ends it instead; a job
	// whose handler ran records its own outcome, and the callback leaves it be
	// (a deadline 'stopped' the manager reports while the handler is still
	// running must not end a record whose work — and lane slot — is still live).
	let handlerStarted = false;
	const record = mediaJobs.submit(
		`${loaded.module.name}_${method}`,
		async ({ onData, signal, jobId }) => {
			handlerStarted = true;
			// Publish a truthful first payload: the client's progress line reads
			// frame.data.msg on every tick, and a null data renders "undefined".
			onData({ msg: `Running ${loaded.module.name}::${method}`, is_running: true });
			try {
				const result = await spec.handler({
					principal,
					userId,
					options,
					background: true,
					clientIp,
					// The live-progress wire (PHP print_cli): every payload the handler
					// publishes replaces the job frame's `data`, which the client's SSE
					// reader renders on its next tick. Handlers throttle their own rate —
					// each call rewrites the pfile.
					publishProgress: (data: object) => onData(data),
					// Cooperative cancellation: the job manager's per-job controller
					// (stop_process / graceful shutdown abort it). Handlers check it at
					// loop boundaries and return a partial summary.
					signal,
					// The lane job's own id, so work that outlives the request can
					// record which job produced it (tool_export's manifest).
					backgroundJobId: jobId,
					applicationLang,
				});
				job.status = 'done';
				job.result = result;
				logTerminalState(job);
				// The RETURN VALUE becomes the final SSE frame's `data` — which is where
				// the client reads the per-file import report from (render_final_report).
				return result;
			} catch (error) {
				job.status = 'error';
				// (a STOP is re-labelled 'stopped' below.) `job.error` is SERVED (get_background_job_status /
				// get_background_jobs, to the owner and every global admin), and so
				// is the lane record's errors[] (media/jobs.ts recordFailure, the
				// pfile + every job frame). A handler's throw reaches BOTH as the
				// CONVERTER'S wire sentence, typed or not: an untyped throw is most
				// often a raw fs/driver error whose text names an absolute server
				// path ("ENOENT: …, open '/srv/…/media/…'"), and `.message` is
				// LOG-ONLY (ERRORS_SPEC §2.2). Rethrowing the CONVERTED error keeps
				// recordFailure's raw-text arm (error_taxonomy A6) for the AV workers
				// it exists for — no handler of this executor reaches it. The log
				// lines (here and the lane's) keep the full original message.
				const typed = toDedaloError(error);
				const logMessage = error instanceof Error ? error.message : String(error);
				job.error = wireMessage(typed);
				// The user's STOP surfaced as a throw (the handler's cooperative
				// abort) is the same event the lane records as 'stopped' — not a
				// failure: no error-level line, no `error` gauge (counters), and
				// the two job wires agree. A deadline / shutdown abort stays 'error'
				// (an operator limit or a dying process is not the user's choice).
				if (jobAbortInfo(signal)?.cause === 'stop') job.status = 'stopped';
				logTerminalState(job, logMessage);
				throw typed;
			}
		},
		// The owner: these ids are derived (guessable), so the status stream must be
		// able to refuse a poll from another user (api/process_status.ts). The lane
		// is the module's own declaration (see above).
		{
			lane,
			userId,
			onTerminal: (settled: JobRecord) => {
				if (handlerStarted || job.status !== 'running') return;
				// NEVER STARTED: a terminal transition with no handler outcome. Without
				// this the record reads 'running' until restart — listed as live by
				// get_background_jobs and counted by every admission hook that counts
				// this registry (tool_export's per-user cap would lose a slot for good).
				job.status = settled.status === 'stopped' ? 'stopped' : 'error';
				// A queued stop leaves the lane frame's errors[] empty (media/jobs.ts
				// endNeverStarted); an interruption carries its 'interrupted: …' line.
				job.error =
					settled.errors.at(-1) ??
					(settled.status === 'stopped'
						? 'stopped before it started (was queued)'
						: `ended '${settled.status}' before it started`);
				logTerminalState(job);
			},
		},
	);

	job.id = record.id;
	jobs.set(record.id, job);

	// Envelope v2: `data` is the started flag (a client re-attaches on a
	// successful body carrying `job_id` — job_follow.js), and the four handles
	// ride as EXTENSION KEYS — ERRORS_SPEC §3.0 names pid/pfile/job_id in the
	// closed legacy set.
	return ok(true, {
		requestId: currentRequestId(),
		extend: {
			// THE handle. A job runs in THIS process, so its id is all a consumer
			// needs: dd_utils_api::get_job_events subscribes to it and pushes every
			// state change (core/api/job_stream.ts), and get_background_job_status
			// polls it.
			job_id: record.id,
			background_job_id: record.id,
			// LEGACY handle, kept for the clients that still speak the pfile poll
			// wire (the area_maintenance widgets, the AV transcodes). pid is the
			// SERVER process — PHP returned a detached CLI child's pid — and pfile
			// is the BASENAME get_process_status accepts. New consumers use job_id.
			pid: process.pid,
			pfile: `${record.id}.json`,
		},
	});
}
