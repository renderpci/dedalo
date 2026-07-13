/**
 * dd_utils_api::get_process_status — the background-process status SSE stream
 * (PHP class.dd_utils_api.php::get_process_status; audit S2-15/DEC-22(a) +
 * S2-35 — the wire the copied client already speaks and the port had left
 * unmounted).
 *
 * CLIENT CONTRACT (common.js update_process_status → data_manager.request_stream
 * → read_stream): POST body `{dd_api:'dd_utils_api', action:'get_process_status',
 * update_rate, options:{pid, pfile}}`; response is an SSE-framed stream of JSON
 * frames `{pid, pfile, is_running, data, errors, total_time}` — the exact
 * JobStatusFrame shape core/media/jobs.ts persists (render_common.js SSE shape).
 * Framing matches the old engines: "data:\n{json}" right-padded to 16 KiB
 * (proxy flush workaround), terminated "\n\n" (read_stream's last===10 &&
 * previous===10 check).
 *
 * SOURCE OF TRUTH: the pfile registry under the TS processes dir
 * (../private/processes) via mediaJobs.frame() — which applies the lazy
 * dead-owner reconcile (S2-15), so a crashed job streams ONE terminal
 * 'interrupted' frame instead of spinning forever. Consumers today: the AV
 * transcode jobs and the make_backup widget's pg_dump record (backup.ts).
 *
 * SECURITY: session-gated by the dispatcher (auth + CSRF ran in front — the
 * client stream sends X-Dedalo-Csrf-Token). The pfile option is reduced to a
 * validated job-id BASENAME (no separators, no dot-dot) so the stream can only
 * ever read job records inside the processes dir — never arbitrary files.
 * PHP's per-user process-ownership check has no TS twin yet (job records do
 * not carry a user id); frames leak operational shape only, never record data.
 */

import type { Rqo } from '../concepts/rqo.ts';
import { type JobStatusFrame, mediaJobs } from '../media/jobs.ts';
import type { Principal } from '../security/permissions.ts';
import type { ApiResult } from './response.ts';

/** Old-engine SSE framing: pad to keep intermediary proxies flushing eagerly. */
const SSE_PAD_LENGTH = 16384;
const encoder = new TextEncoder();

function encodeSseChunk(frame: Record<string, unknown>): Uint8Array {
	let payload = `data:\n${JSON.stringify(frame)}`;
	if (payload.length < SSE_PAD_LENGTH) {
		payload += ' '.repeat(SSE_PAD_LENGTH - payload.length);
	}
	return encoder.encode(`${payload}\n\n`);
}

const SSE_HEADERS: Record<string, string> = {
	'Content-Type': 'text/event-stream',
	'Cache-Control': 'no-cache, must-revalidate',
	Connection: 'keep-alive',
	'X-Accel-Buffering': 'no',
};

/** A single-frame terminal stream (invalid input / unknown job — PHP parity:
 * errors ride as an SSE frame, never a JSON envelope the stream reader can't parse). */
function terminalStream(frame: Record<string, unknown>): ApiResult {
	return {
		status: 200,
		body: {},
		stream: new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encodeSseChunk(frame));
				controller.close();
			},
		}),
		streamHeaders: { ...SSE_HEADERS },
	};
}

/** Job id chars as minted by MediaJobManager/backup.ts — nothing path-like. */
const JOB_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/**
 * Reduce the client-supplied pfile (PHP: a filename relative to the process
 * path) to the job id, refusing anything that is not a plain basename.
 */
function jobIdFromPfile(pfile: string): string | null {
	if (pfile.includes('/') || pfile.includes('\\') || pfile.includes('..')) return null;
	const id = pfile.endsWith('.json') ? pfile.slice(0, -'.json'.length) : pfile;
	return JOB_ID_PATTERN.test(id) ? id : null;
}

/** Poll cadence clamp (client default 1000ms). */
function clampUpdateRate(value: unknown): number {
	const rate = Number(value ?? 1000) || 1000;
	return Math.min(10000, Math.max(250, rate));
}

/** Frame for a job id, or the terminal not-found frame (a vanished pfile must
 * end the stream, not error it — the client renders errors from the frame). */
function frameFor(id: string, pfile: string): JobStatusFrame | Record<string, unknown> {
	const frame = mediaJobs.frame(id);
	if (frame !== null) return frame;
	return {
		pid: null,
		pfile,
		is_running: false,
		data: { msg: `Error: process '${pfile}' not found` },
		errors: ['process file not found'],
		total_time: 0,
	};
}

/**
 * May this caller stream this job? Job ids are DERIVED (kind_pid_counter), so a
 * logged-in user can guess another user's id — and a tool job's frames carry that
 * user's payload (an import report: section ids, values, error rows). So an OWNED
 * job answers only its owner (a global admin sees every job, as in the maintenance
 * area). An unowned job (AV transcode, backup: operational shape only, no record
 * data) keeps the historical behavior — this closes the new surface without
 * silently changing the old one. PHP had a per-user process check; this is its twin.
 */
function mayStream(record: { user_id?: number | null }, principal: Principal): boolean {
	const owner = record.user_id ?? null;
	if (owner === null) return true;
	return principal.isGlobalAdmin || owner === principal.userId;
}

/**
 * The dispatch handler body (auth/CSRF already enforced by dispatchRqo).
 * Emits one frame immediately, then every `update_rate` ms until the job is
 * terminal or the client disconnects (stream cancel).
 */
export function getUtilsProcessStatus(rqo: Rqo, principal: Principal): ApiResult {
	const body = rqo as unknown as { update_rate?: unknown };
	const options = (rqo.options ?? {}) as { pid?: unknown; pfile?: unknown };
	const pfile = typeof options.pfile === 'string' ? options.pfile : '';
	if (pfile === '' || options.pid === undefined || options.pid === null) {
		// PHP: 'Error: pfile and pid are mandatory' — as a terminal SSE frame.
		return terminalStream({
			pid: null,
			pfile,
			is_running: false,
			data: { msg: 'Error: pfile and pid are mandatory' },
			errors: ['Error: pfile and pid are mandatory'],
			total_time: 0,
		});
	}
	const id = jobIdFromPfile(pfile);
	if (id === null) {
		return terminalStream({
			pid: null,
			pfile,
			is_running: false,
			data: { msg: 'Error: invalid pfile' },
			errors: ['invalid pfile'],
			total_time: 0,
		});
	}
	// Ownership (fail-closed): refuse BEFORE the first frame, and answer exactly as
	// a missing job would — no existence oracle for another user's job id.
	const record = mediaJobs.status(id);
	if (record !== null && !mayStream(record, principal)) {
		return terminalStream({
			pid: null,
			pfile,
			is_running: false,
			data: { msg: `Error: process '${pfile}' not found` },
			errors: ['process file not found'],
			total_time: 0,
		});
	}
	const updateRate = clampUpdateRate(body.update_rate);
	let cancelled = false;
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				while (!cancelled) {
					const frame = frameFor(id, pfile);
					controller.enqueue(encodeSseChunk(frame as unknown as Record<string, unknown>));
					if ((frame as { is_running: boolean }).is_running !== true) break;
					await Bun.sleep(updateRate);
				}
			} catch {
				/* client went away mid-enqueue — nothing to clean up */
			}
			try {
				controller.close();
			} catch {
				/* already closed/errored */
			}
		},
		cancel() {
			cancelled = true;
		},
	});
	return { status: 200, body: {}, stream, streamHeaders: { ...SSE_HEADERS } };
}
