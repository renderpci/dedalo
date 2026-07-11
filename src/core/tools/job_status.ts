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
 * user). Job ids are unguessable (UUID / pid+counter). A background job is
 * additionally scoped to the tool that started it AND to the requesting user
 * (global admins may read any user's jobs); a miss on any axis returns the
 * same 'job_not_found' so the surface is not an existence oracle.
 */

import { mediaJobs } from '../media/jobs.ts';
import type { Principal } from '../security/permissions.ts';
import { getBackgroundJob } from './background.ts';
import type { ToolActionContext, ToolActionSpec, ToolResponse } from './module.ts';

/** The reserved framework action name the dispatcher intercepts for every tool. */
export const BACKGROUND_JOB_STATUS_ACTION = 'get_background_job_status';

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
