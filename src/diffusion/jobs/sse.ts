/**
 * Verbatim client wire for diffusion progress (DIFFUSION_SPEC §2.3).
 *
 * Two responsibilities, both pinned byte-for-byte against the old engine
 * (see test/parity/fixtures/diffusion/pinned.ts for the source anchors):
 *
 * 1. progressDataFromJob — project a durable job row into the progress_data
 *    shape the copied client parses (old lib/types.ts:229-247). The
 *    CLIENT-FACING process_id is the client label, never the job UUID.
 * 2. encodeSseChunk — the exact SSE framing the client's
 *    data_manager.read_stream expects: "data:\n{json}", right-padded with
 *    spaces to 16384 chars (Apache/Nginx proxy flush workaround), "\n\n".
 *
 * Everything here is pure — no DB, no timers — so the golden tests pin it
 * without infrastructure.
 */

import type { ActiveJobRow, DiffusionJobRow } from './queue.ts';
import type { DiffusionJobState } from './schema.ts';

/**
 * SSE payload padding boundary — the old engine right-pads every chunk to this
 * length so reverse proxies flush early short chunks (old index.ts:66-70). The
 * parity fixtures (test/parity/fixtures/diffusion/pinned.ts) carry an
 * INDEPENDENT copy of these values on purpose: a drift here fails the golden
 * test instead of silently moving the pin.
 */
const SSE_PAD_LENGTH = 16384;

/** SSE response headers (old index.ts:361-368). */
const SSE_HEADERS = {
	'Content-Type': 'text/event-stream',
	'Cache-Control': 'no-cache, must-revalidate',
	Connection: 'keep-alive',
	'X-Accel-Buffering': 'no',
} as const;

/** progress_data as serialized to the client (old engine lib/types.ts:229). */
export interface ProgressData {
	process_id: string;
	is_running: boolean;
	started_at: number;
	data: {
		msg: string;
		counter: number;
		total: number;
		section_label?: string;
		/** Progress marker echoing `RecordIR.sectionId` (the diffusion IR keeps
		 * the published/raw form — string on an unswept install, or an external
		 * remote id): WC-2026-08-10-section-id-int-canonical. */
		current?: { section_id?: string | number; time?: number };
		total_ms?: number;
		diffusion_data?: unknown;
		last_update_record_response?: unknown;
		consolidated_files?: unknown;
	};
	total_time: string;
	errors: string[];
	result?: Record<string, unknown>;
}

const encoder = new TextEncoder();

/** Old-engine format_elapsed (progress_store.ts:279-299), reproduced exactly. */
export function formatElapsed(ms: number): string {
	if (ms < 1000) return `${ms} ms`;
	const sec = Math.floor(ms / 1000);
	if (sec < 60) return `${sec} sec`;
	const min = Math.floor(sec / 60);
	const remSec = sec % 60;
	if (min < 60) return remSec > 0 ? `${min} min ${remSec} sec` : `${min} min`;
	const hours = Math.floor(min / 60);
	const remMin = min % 60;
	return remMin > 0 ? `${hours} h ${remMin} min` : `${hours} h`;
}

/** A job is "running" on the wire while it is queued or executing. */
function isRunningState(job: DiffusionJobRow): boolean {
	return job.state === 'queued' || job.state === 'running';
}

/**
 * Project one job row into the client progress_data shape. Field-by-field
 * parity with the old progress_store entries; `started_at` falls back to
 * created_at (a queued job has not started yet but the client only uses the
 * value for list ordering).
 */
export function progressDataFromJob(job: DiffusionJobRow): ProgressData {
	const startedAtMs = (job.started_at ?? job.created_at).getTime();
	const endMs = job.finished_at?.getTime() ?? Date.now();
	const totals = job.totals ?? {};
	const data: ProgressData['data'] = {
		msg: totals.msg ?? 'Starting diffusion...',
		counter: totals.counter ?? 0,
		total: totals.total ?? 0,
	};
	if (totals.section_label !== undefined) data.section_label = totals.section_label;
	if (totals.current !== undefined) data.current = totals.current;
	if (totals.total_ms !== undefined) data.total_ms = totals.total_ms;
	const result = job.result ?? undefined;
	// finish_process parity: file-producing runs surface diffusion_data /
	// consolidated_files inside data so the client reads them from the last
	// SSE chunk (progress_store.ts:123-139).
	if (result !== undefined) {
		const typed = result as {
			diffusion_data?: unknown;
			consolidated_files?: unknown;
			result?: boolean;
			msg?: string;
			errors?: string[];
			diffusion_class?: string;
		};
		if (typed.diffusion_data !== undefined) {
			data.diffusion_data = typed.diffusion_data;
			data.last_update_record_response = {
				result: typed.result ?? false,
				msg: [typed.msg ?? ''],
				errors: typed.errors ?? [],
				class: typed.diffusion_class ?? 'diffusion_rdf',
				diffusion_data: typed.diffusion_data,
			};
		}
		if (typed.consolidated_files !== undefined) {
			data.consolidated_files = typed.consolidated_files;
		}
	}
	const projected: ProgressData = {
		process_id: job.client_process_id,
		is_running: isRunningState(job),
		started_at: startedAtMs,
		data,
		total_time: formatElapsed(Math.max(0, endMs - startedAtMs)),
		errors: job.errors ?? [],
	};
	if (result !== undefined && !isRunningState(job)) {
		projected.result = result;
	}
	return projected;
}

/** The "unknown process id" terminal chunk (old index.ts:725-737). */
export function notFoundProgressData(processId: string): ProgressData {
	return {
		process_id: processId,
		is_running: false,
		started_at: Date.now(),
		data: { msg: 'Process not found', counter: 0, total: 0 },
		total_time: '0 sec',
		errors: ['Process not found or already completed'],
	};
}

/**
 * The one SSE framing. Both encoders below delegate here so the queue stream
 * cannot drift from the pinned per-job framing — the client's
 * data_manager.read_stream reassembles frames by this exact shape, and the
 * golden fixtures pin these bytes.
 */
function encodeSsePayload(json: string): Uint8Array {
	let payload = `data:\n${json}`;
	if (payload.length < SSE_PAD_LENGTH) {
		payload += ' '.repeat(SSE_PAD_LENGTH - payload.length);
	}
	payload += '\n\n';
	return encoder.encode(payload);
}

/** Verbatim SSE chunk framing (old index.ts encode_sse_chunk :56-75). */
export function encodeSseChunk(data: ProgressData): Uint8Array {
	return encodeSsePayload(JSON.stringify(data));
}

/**
 * ─── The admin queue stream (WC-067) ────────────────────────────────────────
 *
 * A SECOND, narrower wire alongside ProgressData. ProgressData follows ONE job
 * for its owner; this follows the whole ACTIVE queue for a global admin.
 *
 * (!) The key set below is a CONTRACT, not a convenience, and is asserted by
 * diffusion_queue_stream_tripwire. It carries what a progress display needs
 * and nothing else. It must never grow to include `spec` (the sanitized SQO),
 * `checkpoint`, `result`, `runner`, or `errors[]` — those are unbounded in
 * size, and this frame is re-serialized once a second for every connected
 * admin. Adding one "just for debugging" is how a 1 Hz stream becomes a
 * bandwidth incident. They remain available on the widget's get_value.
 */

/** One active job as serialized on the admin queue stream. */
export interface QueueJobView {
	job_id: string;
	/** The client-facing label, never the job UUID — same rule as ProgressData. */
	process_id: string;
	state: DiffusionJobState;
	counter: number;
	total: number;
	msg: string | null;
	cancel_requested: boolean;
	attempt: number;
	max_attempts: number;
}

/**
 * Project one active row onto the wire. counter/total arrive as TEXT (see
 * ActiveJobRow) and are coerced here: a malformed legacy value degrades that
 * ONE job to 0 rather than aborting the stream for everybody.
 */
export function queueJobView(row: ActiveJobRow): QueueJobView {
	return {
		job_id: row.job_id,
		process_id: row.client_process_id,
		state: row.state,
		counter: Number(row.counter_text) || 0,
		total: Number(row.total_text) || 0,
		msg: row.msg ?? null,
		cancel_requested: row.cancel_requested === true,
		attempt: row.attempt,
		max_attempts: row.max_attempts,
	};
}

/** One frame of the admin queue stream. */
export interface QueueFrame {
	/** Discriminator — the client rejects anything else, including the
	 * synthetic first frame data_manager.read_stream injects before any
	 * server bytes arrive. */
	kind: 'diffusion_queue';
	/** Emitted-at, epoch ms. VOLATILE: stripped from the change signature, or
	 * every poll would look like a change and the stream would never be quiet. */
	at: number;
	scheduler: {
		running: number;
		queued: number;
		max_runners: number;
		paused: boolean;
		/** A quiesce is waiting for the running jobs to finish (set_scheduler
		 * drain_resume). Always accompanied by paused:true — the drain holds
		 * dispatch for its whole duration. */
		draining: boolean;
		stale_after_seconds: number;
	};
	jobs: QueueJobView[];
	/** Sorted job_id join — the client's cheap "the set changed" test. */
	membership: string;
	/** Membership changed since the previous frame: a job started or reached a
	 * terminal state. The client answers this with ONE history refetch, which
	 * is why the stream itself never reads the 24h window. */
	refresh: boolean;
	/** Set only on the max-lifetime final frame: reconnect, nothing is wrong. */
	reconnect?: true;
	errors: string[];
}

/** Queue-frame framing — same bytes-on-the-wire rules as encodeSseChunk. */
export function encodeQueueSseChunk(frame: QueueFrame): Uint8Array {
	return encodeSsePayload(JSON.stringify(frame));
}

/** The ":\n" comment heartbeat used by the get_process_status stream. */
export function encodeSseCommentHeartbeat(): Uint8Array {
	return encoder.encode(':\n');
}

/** Response headers for every diffusion SSE stream (old index.ts:361-368). */
export function sseResponseHeaders(): Record<string, string> {
	return { ...SSE_HEADERS };
}
