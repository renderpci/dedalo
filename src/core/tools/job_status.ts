/**
 * JOB-STATUS surface — the minimal honest wire for the two async job families
 * (audit DEC-22a / S2-15 + S2-16).
 *
 * 1. MEDIA transcode jobs (MediaJobManager): `process_uploaded_file` returns a
 *    `job_id`, but until this action existed NOTHING served `frame()` — a failed
 *    transcode showed the user 'ok' and a video that never appeared. The
 *    `get_job_status` action (mounted on tool_upload, the tool that mints the
 *    job ids) serves the client-shaped JobStatusFrame for one job id.
 *
 * 2. BACKGROUND tool jobs (background.ts): `background_running=true` returns a
 *    `background_job_id` that was a dead pointer — `getBackgroundJob` had no
 *    HTTP surface. `get_background_job_status` is a FRAMEWORK action served by
 *    the dispatcher itself for EVERY tool (after the active+authorized gates),
 *    so each backgroundRunnable module gets a poll wire without per-module
 *    registration. The name is RESERVED: the dispatcher answers it before the
 *    module's apiActions are consulted, so a module must never define it.
 *
 * Security posture: both reads run behind dispatch gates 1-4 (authenticated
 * caller, valid tool name, tool ACTIVE in dd1324, tool authorized for the
 * user). Job ids are DERIVED, not secret (kind_pid_counter — a background job now
 * runs in the same process-job registry as the media jobs, so that its pfile can
 * be streamed by dd_utils_api::get_process_status). Obscurity is therefore NOT the
 * boundary: a background job is scoped to the tool that started it AND to the
 * requesting user (global admins may read any user's jobs), and the SSE stream
 * enforces the same ownership from the job record (api/process_status.ts). A miss
 * on any axis returns the same 'job_not_found' — no existence oracle.
 */

import { mediaJobs } from '../media/jobs.ts';
import type { Principal } from '../security/permissions.ts';
import { getBackgroundJob, listBackgroundJobs } from './background.ts';
import type { ToolActionContext, ToolActionSpec, ToolResponse } from './module.ts';

/** The reserved framework action name the dispatcher intercepts for every tool. */
export const BACKGROUND_JOB_STATUS_ACTION = 'get_background_job_status';

/**
 * The other reserved framework action: LIST the caller's jobs for this tool.
 *
 * `get_background_job_status` answers "how is job X doing?" — which presupposes
 * the caller still HAS the id. After a page reload it does not, and the PHP-era
 * answer was to make the client persist the id itself (IndexedDB). That is client
 * state duplicating something the server is authoritative about: it is per-browser
 * (invisible in another tab), it goes stale when the server restarts and the
 * in-process job dies with it, and getting the store/key pair wrong is a silent
 * runtime throw. So the client asks instead, and keeps nothing.
 */
export const BACKGROUND_JOBS_ACTION = 'get_background_jobs';

function notFound(msg: string): ToolResponse {
	return { result: false, msg: `Error. Request failed. ${msg}`, errors: ['job_not_found'] };
}

/**
 * Media job status handler (DEC-22a): serve the JobStatusFrame for one media
 * job id. The response carries the frame fields at the TOP level (pid, pfile,
 * is_running, data, errors, total_time) — the exact shape the vendored client's
 * render_common.js status machinery reads — plus the tool envelope.
 */
async function mediaJobStatus(ctx: ToolActionContext): Promise<ToolResponse> {
	const jobId = typeof ctx.options.job_id === 'string' ? ctx.options.job_id : '';
	if (jobId === '') {
		return {
			result: false,
			msg: 'Error. Request failed. missing job_id',
			errors: ['invalid_request'],
		};
	}
	const frame = mediaJobs.frame(jobId);
	if (frame === null) return notFound(`unknown media job: ${jobId}`);
	return {
		result: true,
		msg: 'ok',
		pid: frame.pid,
		pfile: frame.pfile,
		is_running: frame.is_running,
		data: frame.data,
		errors: frame.errors,
		total_time: frame.total_time,
	};
}

/**
 * The mountable action spec for the media job status wire. permission null is
 * deliberate and documented: dispatch gates 1-4 already require an
 * authenticated user authorized for the mounting tool; the job id itself is an
 * unguessable capability minted by an action that DID pass a 'record' write
 * gate, and the frame exposes no record data beyond the job's own file paths.
 */
export const MEDIA_JOB_STATUS_ACTION: ToolActionSpec = {
	permission: null,
	handler: mediaJobStatus,
};

/**
 * Background tool-job status (S2-16), served by the dispatcher for every tool.
 * Scope: the job must belong to `toolName` (the tool the RQO addressed) and to
 * the requesting user unless the caller is a global admin. Terminal records
 * live for the bounded retention window (background.ts TERMINAL_EVICT_AFTER_MS)
 * and die with the server — restart-lost jobs read as not found, matching the
 * ledgered in-process design.
 */
export function backgroundJobStatusResponse(
	toolName: string,
	principal: Principal,
	userId: number,
	options: Record<string, unknown>,
): ToolResponse {
	const jobId =
		typeof options.background_job_id === 'string'
			? options.background_job_id
			: typeof options.job_id === 'string'
				? options.job_id
				: '';
	if (jobId === '') {
		return {
			result: false,
			msg: 'Error. Request failed. missing background_job_id',
			errors: ['invalid_request'],
		};
	}
	const job = getBackgroundJob(jobId);
	if (
		job === undefined ||
		job.tool !== toolName ||
		(!principal.isGlobalAdmin && job.userId !== userId)
	) {
		// One answer for absent / wrong-tool / other-user: no existence oracle.
		return notFound(`unknown background job: ${jobId}`);
	}
	return {
		result: true,
		msg: 'ok',
		errors: [],
		job: {
			id: job.id,
			tool: job.tool,
			action: job.action,
			status: job.status,
			error: job.error ?? null,
			// The captured ToolResponse of a finished job (null while running /
			// after an error) — the caller's window onto "did my import succeed".
			response: job.status === 'done' ? (job.result ?? null) : null,
		},
	};
}

/**
 * List the caller's jobs for `toolName` (BACKGROUND_JOBS_ACTION), newest first —
 * the wire a reloading client uses to find the run it lost the id for.
 *
 * Scope is the same as the status wire: own jobs only, unless the caller is a
 * global admin. Deliberately NO `response` payload here — a list is a directory,
 * not a bulk export of every recent import's report; the caller subscribes to the
 * job it cares about (get_job_events) and gets the report on the terminal frame.
 *
 * `options.action` optionally narrows to one action ('import_files'), so a tool
 * with several background actions can ask about just the one it renders.
 */
export function backgroundJobsResponse(
	toolName: string,
	principal: Principal,
	userId: number,
	options: Record<string, unknown>,
): ToolResponse {
	const action = typeof options.action === 'string' ? options.action : null;
	const jobs = listBackgroundJobs(toolName, userId, principal.isGlobalAdmin).filter(
		(job) => action === null || job.action === action,
	);
	return {
		result: jobs.map((job) => ({
			id: job.id,
			tool: job.tool,
			action: job.action,
			status: job.status,
			error: job.error ?? null,
			started_at: job.startedAt ?? null,
		})),
		msg: 'ok',
		errors: [],
	};
}
