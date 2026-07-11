/**
 * PINNED old-engine client-wire shapes (diffusion P0 gate — DIFFUSION_PLAN D3).
 *
 * The byte-identical tool_diffusion client speaks EXACTLY these shapes; the
 * new engine must serve them verbatim from the main API. Every field below is
 * pinned from the old Bun engine source (v7/master_dedalo/diffusion/api/v1):
 *
 * - progress_data / engine_response ......... lib/types.ts:221-247, :182-191
 * - SSE chunk encoding ...................... index.ts encode_sse_chunk (:56-75):
 *     payload = "data:\n" + JSON.stringify(progress_data), right-padded with
 *     spaces to 16384 chars when shorter, then "\n\n". Headers:
 *     text/event-stream + no-cache + keep-alive + X-Accel-Buffering:no.
 * - diffuse stream .......................... index.ts:302-370 — initial chunk
 *     immediately, push updates, 2s heartbeat re-sending current state,
 *     stream closes when is_running goes false.
 * - get_process_status ...................... index.ts:682-772 — poll stream
 *     (update_rate default 1000ms), ":\n" comment heartbeat every 15s,
 *     "Process not found" terminal chunk when the id is unknown.
 * - list_processes .......................... index.ts:979-989 —
 *     { result:true, processes: progress_data[] }.
 * - cancel_process .......................... index.ts:990-1010 —
 *     { result:boolean, msg:string } (+400 invalid_process_id shape).
 *
 * CLIENT CONSUMPTION (tools/tool_diffusion/js/render_tool_diffusion.js):
 * - stream chunks: is_running, total_time, errors, result?,
 *   data.{msg,counter,total,section_label,current.{section_id,time},total_ms},
 *   data.{diffusion_data,last_update_record_response,consolidated_files}
 *   (:51-52, :958-1016).
 * - reconnect: sorts processes by started_at DESC and matches
 *   p.process_id === 'process_diffusion_{user}_{element}_{section}' (:806-812),
 *   then calls get_process_status with that same id (:1092).
 *
 * (!) OLD-ENGINE DEFECT, fixed here on purpose: the old engine ignored the
 * client-sent options.process_id (index.ts:313 server UUID only), so the
 * reconnect find() could never match. The new engine exposes the CLIENT label
 * as the client-facing process_id (owner-scoped); the durable job UUID stays
 * internal. This is a behavior IMPROVEMENT on an already-broken path — the
 * wire SHAPES remain verbatim.
 */

/** SSE payload padding boundary (index.ts:66-70 — proxy flush workaround). */
export const SSE_PAD_LENGTH = 16384;

/** SSE response headers (index.ts:361-368). */
export const SSE_HEADERS = {
	'Content-Type': 'text/event-stream',
	'Cache-Control': 'no-cache, must-revalidate',
	Connection: 'keep-alive',
	'X-Accel-Buffering': 'no',
} as const;

/** Heartbeat cadences (index.ts:325 diffuse=2s state re-send; :713 status=15s ":\n"). */
export const DIFFUSE_HEARTBEAT_MS = 2000;
export const STATUS_COMMENT_HEARTBEAT_MS = 15000;
export const STATUS_DEFAULT_UPDATE_RATE_MS = 1000;

/** progress_data key order as the old engine serializes it (lib/types.ts:229-247). */
export const PROGRESS_DATA_KEYS = [
	'process_id',
	'is_running',
	'started_at',
	'data',
	'total_time',
	'errors',
	// 'result' present only once finished
] as const;

export const PROGRESS_DATA_DATA_KEYS_REQUIRED = ['msg', 'counter', 'total'] as const;

/** A mid-run chunk exactly as the old engine emits it (create_process + update_progress). */
export const PINNED_RUNNING_CHUNK = {
	process_id: 'process_diffusion_8_test1_test3',
	is_running: true,
	started_at: 1751700000000,
	data: {
		msg: 'Processing records 3 of 10...',
		counter: 3,
		total: 10,
		current: { section_id: 3, time: 120 },
		total_ms: 3600,
	},
	total_time: '3 sec',
	errors: [],
} as const;

/** A terminal chunk (finish_process — result embedded, is_running false). */
export const PINNED_FINISHED_CHUNK = {
	process_id: 'process_diffusion_8_test1_test3',
	is_running: false,
	started_at: 1751700000000,
	data: {
		msg: 'OK. Diffusion done',
		counter: 10,
		total: 10,
	},
	total_time: '12 sec',
	errors: [],
	result: {
		result: true,
		msg: 'OK. Diffusion done',
		tables: [{ table_name: 'interview', records_affected: 10, records_count: 10 }],
	},
} as const;

/** get_process_status unknown-id terminal chunk (index.ts:725-737). */
export const PINNED_NOT_FOUND_CHUNK_SHAPE = {
	is_running: false,
	data: { msg: 'Process not found', counter: 0, total: 0 },
	total_time: '0 sec',
	errors: ['Process not found or already completed'],
} as const;

/** cancel_process responses (index.ts:1005-1010). */
export const PINNED_CANCEL_OK = (processId: string) => ({
	result: true,
	msg: `Process ${processId} cancelled`,
});
export const PINNED_CANCEL_MISS = (processId: string) => ({
	result: false,
	msg: `Process ${processId} not found or not running`,
});

/** Cancellation surfaces inside the progress entry (progress_store.ts:192-207). */
export const CANCELLED_MSG = 'Process cancelled by user';

/**
 * total_time formatting (progress_store.ts format_elapsed :279-299):
 * <1s → "{ms} ms"; <60s → "{s} sec"; <60m → "{m} min[ {s} sec]"; else
 * "{h} h[ {m} min]".
 */
export const PINNED_TOTAL_TIME_CASES: ReadonlyArray<[number, string]> = [
	[999, '999 ms'],
	[1000, '1 sec'],
	[59000, '59 sec'],
	[60000, '1 min'],
	[135000, '2 min 15 sec'],
	[3600000, '1 h'],
	[3900000, '1 h 5 min'],
];
