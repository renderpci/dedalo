/**
 * JOB EVENT STREAM — the native (push) status wire for in-process jobs, plus the
 * SSE primitives the legacy poll wire (process_status.ts) shares with it.
 *
 * WHY A SECOND WIRE. `dd_utils_api::get_process_status` is a faithful port of a
 * PHP workaround: PHP forked a detached CLI child that could not talk to the web
 * request, so the child wrote a JSON "process file" and the web layer TAILED it
 * on a timer. The client therefore identifies a job by `{pid, pfile}` and the
 * server re-reads a file every `update_rate` ms. In Bun the job runs inside the
 * process that is serving the stream — there is an object in memory. So here the
 * consumer SUBSCRIBES (core/media/jobs.ts `subscribe`) and every state change is
 * pushed the instant it happens: no timer, no re-read, no 0-1000 ms lag, and the
 * job is addressed by its `job_id` alone.
 *
 * The poll wire is NOT removed: the AV transcodes and the backup widget speak it
 * and are not worth regressing. New consumers use this one.
 *
 * SECURITY. Job ids are DERIVED (kind_pid_counter), i.e. guessable, and a tool
 * job's frames carry that user's payload (an import report: section ids, values,
 * failed rows). An OWNED job therefore streams only to its owner (a global admin
 * sees any job, as in the maintenance area); an UNOWNED job (transcode, backup:
 * operational shape only) keeps the historical behavior. Absent, wrong-owner and
 * malformed all answer the SAME terminal frame — no existence oracle.
 */

import type { Rqo } from '../concepts/rqo.ts';
import { type JobRecord, type JobStatusFrame, mediaJobs } from '../media/jobs.ts';
import type { Principal } from '../security/permissions.ts';
import type { ApiResult } from './response.ts';

/** Old-engine SSE framing: pad to keep intermediary proxies flushing eagerly. */
const SSE_PAD_LENGTH = 16384;
const encoder = new TextEncoder();

/** Frame → one padded SSE chunk (read_stream's last===10 && previous===10 check). */
export function encodeSseChunk(frame: Record<string, unknown>): Uint8Array {
	let payload = `data:\n${JSON.stringify(frame)}`;
	if (payload.length < SSE_PAD_LENGTH) {
		payload += ' '.repeat(SSE_PAD_LENGTH - payload.length);
	}
	return encoder.encode(`${payload}\n\n`);
}

export const SSE_HEADERS: Record<string, string> = {
	'Content-Type': 'text/event-stream',
	'Cache-Control': 'no-cache, must-revalidate',
	Connection: 'keep-alive',
	'X-Accel-Buffering': 'no',
};

/**
 * A single-frame terminal stream (invalid input / unknown job). Errors ride as an
 * SSE frame, never as a JSON envelope the stream reader cannot parse.
 */
export function terminalStream(frame: Record<string, unknown>): ApiResult {
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
export const JOB_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/**
 * May this caller stream this job? See the SECURITY note in the header: an owned
 * job answers only its owner (or a global admin); an unowned one is open.
 */
export function mayStreamJob(record: { user_id?: number | null }, principal: Principal): boolean {
	const owner = record.user_id ?? null;
	if (owner === null) return true;
	return principal.isGlobalAdmin || owner === principal.userId;
}

/**
 * The one answer for absent / wrong-owner / malformed — deliberately identical,
 * and shaped like a real terminal frame so the client renders it as an end state.
 */
function notFoundFrame(jobId: string, reason: string): Record<string, unknown> {
	return {
		job_id: jobId,
		is_running: false,
		data: { msg: `Error: job '${jobId}' not found` },
		errors: [reason],
		total_time: 0,
	};
}

/**
 * Re-send the current frame on this cadence when the job publishes nothing. A
 * silent import (a long DB write between progress ticks) must not look like a
 * dead connection to an intermediary proxy — 15 s is well inside the usual 60 s
 * proxy read timeout.
 */
const KEEPALIVE_MS = 15000;

/**
 * dd_utils_api::get_job_events — subscribe to one job's frames and push them.
 *
 * Contract: POST `{dd_api:'dd_utils_api', action:'get_job_events',
 * options:{job_id}}` → an SSE stream of `JobStatusFrame` (the same frame shape
 * the poll wire emits, so the client's read_stream is unchanged) with `job_id`
 * added. The stream ENDS on the first frame whose `is_running` is false, which
 * is the frame that carries the job's return value in `data` — for an import,
 * the full report.
 */
export function getJobEvents(rqo: Rqo, principal: Principal): ApiResult {
	const options = (rqo.options ?? {}) as { job_id?: unknown };
	const jobId = typeof options.job_id === 'string' ? options.job_id : '';
	if (jobId === '' || !JOB_ID_PATTERN.test(jobId)) {
		return terminalStream(notFoundFrame(jobId, 'invalid job_id'));
	}

	const record: JobRecord | null = mediaJobs.status(jobId);
	if (record === null || !mayStreamJob(record, principal)) {
		return terminalStream(notFoundFrame(jobId, 'job not found'));
	}

	const withId = (frame: JobStatusFrame): Record<string, unknown> => ({
		...frame,
		job_id: jobId,
	});

	// Already terminal (a poll that arrives after the job finished — e.g. the client
	// reconnecting after a reload): one frame carrying the report, then close.
	const current = mediaJobs.frame(jobId);
	if (current !== null && current.is_running !== true) return terminalStream(withId(current));

	let unsubscribe: (() => void) | null = null;
	let keepalive: ReturnType<typeof setInterval> | null = null;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let closed = false;
			const close = (): void => {
				if (closed) return;
				closed = true;
				unsubscribe?.();
				if (keepalive !== null) clearInterval(keepalive);
				try {
					controller.close();
				} catch {
					/* already closed/errored */
				}
			};
			const send = (frame: JobStatusFrame): void => {
				if (closed) return;
				try {
					controller.enqueue(encodeSseChunk(withId(frame)));
				} catch {
					// The client went away mid-enqueue: stop pushing into a dead stream.
					close();
					return;
				}
				if (frame.is_running !== true) close();
			};

			unsubscribe = mediaJobs.subscribe(jobId, send);

			// The state as of NOW, before any further change — the client must not wait
			// for the next publish to see that the job is alive.
			const first = mediaJobs.frame(jobId);
			if (first !== null) send(first);

			// The job may have finished in the window between the status() read above
			// and subscribe() — that terminal commit had no subscriber to wake. Re-read
			// and close on it rather than hanging until the keepalive notices.
			const afterSubscribe = mediaJobs.frame(jobId);
			if (afterSubscribe !== null && afterSubscribe.is_running !== true) send(afterSubscribe);

			keepalive = setInterval(() => {
				const frame = mediaJobs.frame(jobId);
				// A vanished record (terminal eviction) ends the stream rather than
				// keeping a connection open forever against a job nobody remembers.
				if (frame === null) {
					close();
					return;
				}
				send(frame);
			}, KEEPALIVE_MS);
			if (typeof (keepalive as { unref?: () => void }).unref === 'function') {
				(keepalive as unknown as { unref: () => void }).unref();
			}
		},
		cancel() {
			unsubscribe?.();
			if (keepalive !== null) clearInterval(keepalive);
		},
	});

	return { status: 200, body: {}, stream, streamHeaders: { ...SSE_HEADERS } };
}
