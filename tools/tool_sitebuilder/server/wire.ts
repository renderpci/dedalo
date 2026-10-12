/**
 * The wire vocabulary shared between the daemon client and the action handlers.
 *
 * The daemon renders errors as RFC 9457 problem+json carrying a stable machine `reason`
 * extension. This maps every reason it can send (and transport failures) onto the
 * REGISTERED `site_builder.*` codes (src/core/errors/registry.ts) that the dispatch
 * chokepoint turns into the envelope, so the client branches on a code rather than on prose.
 *
 * THE CODE IS THE MESSAGE (WIRE-MAP, 2026-10-11). The browser renders a refusal from its
 * code's LABEL (client render_api_error.js reads the label before any message), so a
 * sentence riding `publicMessage` reached nobody but an MCP or curl caller — while every
 * daemon reason that was not a confinement one fell through to `site_builder.rejected`
 * ("the site builder rejected the request") whether it meant "that name is taken", "a
 * build is running, try again" or "the server is full". So:
 *  - every DAEMON reason (`DAEMON_REASONS`, publication/site_builder/src/errors.ts) has its
 *    own code, and the map below is typed exhaustive over that union (an unmapped reason is
 *    a tsc error) and gated equal to the runtime list (test/unit/tool_sitebuilder.test.ts);
 *  - every ENGINE-authored refusal has its own code too (`siteBuilderRefusal`), with no
 *    prose argument: the label is the text;
 *  - a DAEMON-SUPPLIED `detail` is another service's prose. It is LOG-ONLY: it goes in the
 *    throw's `message` (the console line) and never onto the wire, so the daemon can never
 *    write the browser's error text. No `site_builder.*` throw carries `publicMessage`.
 *
 * THE STREAM DOOR TOO (2026-10-11). A turn's error event (stored in the session log and
 * relayed by `session_stream`) carries a `reason` from the daemon's `TURN_ERROR_REASONS`
 * (publication/site_builder/src/drivers/turn_errors.ts) and no sentence; `relaySessionFrames`
 * rewrites each error record into the ONE converter's body (`toErrorBody`) for the code
 * `TURN_EVENT_REASON_CODES` maps it to, and passes every other record byte-for-byte. A record
 * with no reason or an unknown one (a log written before the fix, a daemon newer than the
 * engine) is `site_builder.failed` — its prose never crosses.
 *
 * The imports of the daemon's reason unions are TYPE-ONLY (erased at run time): the two stay
 * separate deployables that share no runtime module, and the engine's tsc still refuses a
 * reason the daemon added without a code here.
 */

import type { TurnErrorReason } from '../../../publication/site_builder/src/drivers/turn_errors.ts';
import type { DaemonReason } from '../../../publication/site_builder/src/errors.ts';
import { DedaloError, type ErrorCode, toErrorBody } from '../../../src/core/errors/index.ts';

/** The daemon's problem+json shape (only the fields we read). */
export interface DaemonProblem {
	type?: string;
	title?: string;
	status?: number;
	detail?: string;
	reason?: string;
}

/**
 * THE DAEMON'S CONFINEMENT REFUSALS (503) → a registered code that says WHO must act.
 *
 * Every one used to fall through to the status-derived default, `site_builder.failed`
 * (retryable): a host that cannot confine the agent, a site with no identity, a CLI that
 * cannot be told to ignore agent-written configuration all read "an error, try again" —
 * and retrying changes nothing until an operator acts.
 *
 *  - `site_builder.busy` (retryable) — it clears by itself: a run still alive or being
 *    proved dead, the daemon restarting, an agent CLI that could not be asked just now
 *    (`agent_cli_unproved`: a probe question past its bound — asked again next attempt).
 *  - `site_builder.confinement_unavailable` (not retryable) — an operator must act.
 */
export const CONFINEMENT_REASON_CODES = Object.freeze({
	confinement_unavailable: 'site_builder.confinement_unavailable',
	'confinement.identity_missing': 'site_builder.confinement_unavailable',
	'confinement.unit_refused': 'site_builder.confinement_unavailable',
	'confinement.unit_nonconformant': 'site_builder.confinement_unavailable',
	'confinement.agent_cli_unsupported': 'site_builder.confinement_unavailable',
	'confinement.site_busy': 'site_builder.busy',
	'confinement.identity_quarantined': 'site_builder.busy',
	'confinement.daemon_stopping': 'site_builder.busy',
	'confinement.agent_cli_unproved': 'site_builder.busy',
} as const satisfies Readonly<Record<Extract<DaemonReason, `confinement${string}`>, ErrorCode>>);

/**
 * EVERY REASON THE DAEMON SENDS → the code a museum reads for it. Exhaustive by type
 * (`satisfies Record<DaemonReason, …>`), equal to the daemon's runtime `DAEMON_REASONS` by
 * gate. Contract: engineering/wire_contract/WC-2026-10-11-site-builder-reason-codes.md.
 *
 *  - the six busy reasons (another reservation holds the site) → `site_builder.busy`
 *    (503, retryable): it clears without anyone acting;
 *  - the site-state conflicts → their own 409s, each naming what to do;
 *  - the three limits → their own 429s; only `max_concurrent_sessions` (server-wide turn
 *    concurrency) is retryable, as `site_builder.capacity`.
 */
export const DAEMON_REASON_CODES = Object.freeze({
	session_running: 'site_builder.busy',
	build_running: 'site_builder.busy',
	site_initializing: 'site_builder.busy',
	site_recovering: 'site_builder.busy',
	git_running: 'site_builder.busy',
	site_deleting: 'site_builder.busy',
	slug_exists: 'site_builder.slug_exists',
	workspace_exists: 'site_builder.workspace_exists',
	domain_taken: 'site_builder.domain_taken',
	webspace_unavailable: 'site_builder.webspace_unavailable',
	no_build: 'site_builder.no_build',
	not_running: 'site_builder.not_running',
	max_sites: 'site_builder.site_limit',
	disk_quota: 'site_builder.disk_quota',
	max_concurrent_sessions: 'site_builder.capacity',
	...CONFINEMENT_REASON_CODES,
} as const satisfies Readonly<Record<DaemonReason, ErrorCode>>);

/**
 * The daemon's machine `reason`, and ONLY that. The problem `type` URI is not read: its
 * segments (`conflict`, `limit-exceeded`) name a class, not a cause, and branching on them
 * is how every 409 became one undifferentiated `rejected`.
 */
function reasonOf(problem: DaemonProblem): string {
	return typeof problem.reason === 'string' ? problem.reason.trim() : '';
}

function isDaemonReason(reason: string): reason is DaemonReason {
	return Object.hasOwn(DAEMON_REASON_CODES, reason);
}

/**
 * The registered code for a daemon problem. A problem with no reason (a malformed request,
 * an auth failure) takes the caller's status-derived `fallback`; so does a reason this engine
 * does not know (a daemon newer than the engine) — with one log line naming the reason, never
 * the daemon's detail, so the gap is visible to whoever reads the log.
 */
export function codeForProblem(problem: DaemonProblem, fallback: ErrorCode): ErrorCode {
	const reason = reasonOf(problem);
	if (reason === '') return fallback;
	if (isDaemonReason(reason)) return DAEMON_REASON_CODES[reason];
	console.error('[tool_sitebuilder] unmapped daemon reason', reason);
	return fallback;
}

/** Cap any daemon-supplied prose before it reaches the LOG (never the wire). */
export function capDetail(detail: string | undefined, fallback: string): string {
	if (typeof detail !== 'string' || detail.length === 0) return fallback;
	return detail.length > 300 ? `${detail.slice(0, 297)}…` : detail;
}

/**
 * THE ENGINE'S OWN REFUSALS — one code each, decided before the daemon is asked anything.
 * The label of the code is the sentence a museum reads; nothing else rides the throw.
 *
 * `perm.*` is deliberately NOT used for the two permission refusals: the client maps
 * `perm.*` to the no-access PAGE (error_policy.js), which would replace the tool panel
 * rather than tell its user what they may not do here.
 */
export type SiteBuilderRefusalCode = Extract<
	ErrorCode,
	| 'site_builder.invalid_slug'
	| 'site_builder.invalid_id'
	| 'site_builder.name_required'
	| 'site_builder.domain_required'
	| 'site_builder.text_required'
	| 'site_builder.confirmation_required'
	| 'site_builder.not_permitted'
	| 'site_builder.not_session_owner'
>;

/**
 * An ENGINE-AUTHORED refusal. `coordinates` are log-only (which field, which action) and
 * never reach the wire's text.
 */
export function siteBuilderRefusal(
	code: SiteBuilderRefusalCode,
	coordinates: Record<string, string | number> = {},
): DedaloError {
	return new DedaloError(code, {
		coordinates: { tool: 'tool_sitebuilder', ...coordinates },
	});
}

/**
 * A DAEMON-SIDE (or transport) failure. `detail` is the daemon's own prose or the engine's
 * log line: it stays in `message` (log-only) and is never offered as `publicMessage`.
 */
export function siteBuilderFailure(
	code: ErrorCode,
	detail: string,
	coordinates: Record<string, string | number> = {},
): DedaloError {
	return new DedaloError(code, {
		message: detail,
		coordinates: { tool: 'tool_sitebuilder', ...coordinates },
	});
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The stream door (session_stream) — a reason in, the converter's body out
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * EVERY REASON THE STREAM CAN CARRY → its code: the control door's map, the supervisor's own
 * faults, and the SSE responder's frame. Exhaustive by type over `TurnErrorReason`; gated
 * set-equal to the daemon's runtime `TURN_ERROR_REASONS`, and the daemon's `TURN_ERROR_RETRIABLE`
 * gated equal to each code's registry `retryable` (test/unit/tool_sitebuilder_stream_codes.test.ts).
 *
 *  - `turn_timeout` / `turn_interrupted` — their own codes, retryable (nothing is wrong);
 *  - `turn_setup_failed` — its own, not retryable (an unreadable brief, a write the setup could
 *    not make: the same request fails the same way);
 *  - `turn_agent_exited` — `site_builder.agent_failed`: the AGENT failed; its own words ride
 *    the event as `agent_output`, labelled;
 *  - the run that ended with no status, was killed, or broke — `site_builder.failed` (retryable);
 *  - `replay_failed` — the stored log could not be read back; not retryable (a reconnect would
 *    read the same unreadable log).
 */
export const TURN_EVENT_REASON_CODES = Object.freeze({
	...DAEMON_REASON_CODES,
	turn_timeout: 'site_builder.turn_timeout',
	turn_interrupted: 'site_builder.turn_interrupted',
	turn_setup_failed: 'site_builder.turn_setup_failed',
	turn_agent_exited: 'site_builder.agent_failed',
	turn_unit_lost: 'site_builder.failed',
	turn_agent_killed: 'site_builder.failed',
	turn_failed: 'site_builder.failed',
	replay_failed: 'site_builder.replay_failed',
} as const satisfies Readonly<Record<TurnErrorReason, ErrorCode>>);

function isStreamReason(reason: unknown): reason is TurnErrorReason {
	return typeof reason === 'string' && Object.hasOwn(TURN_EVENT_REASON_CODES, reason);
}

/** The code a stream reason maps to; an absent or unknown reason is `site_builder.failed`, logged by name only. */
function codeForStreamReason(reason: unknown): ErrorCode {
	if (isStreamReason(reason)) return TURN_EVENT_REASON_CODES[reason];
	console.error(
		'[tool_sitebuilder] a session stream error carried',
		typeof reason === 'string'
			? `the unmapped reason '${reason.slice(0, 64)}'`
			: 'no reason (a log from before the stream door, or a daemon regression)',
	);
	return 'site_builder.failed';
}

/**
 * The converter's body for a stream reason — the one shape the browser reads (ERRORS_SPEC §5.3).
 * The throw's log-only message names the reason only when it is a LISTED one: an unknown token
 * is the daemon's text, and even the debug block (DEDALO_DEBUG_API_ERRORS) must not relay it.
 */
function streamErrorBody(reason: unknown, what: string): ReturnType<typeof toErrorBody> {
	const named = isStreamReason(reason) ? reason : 'no listed reason';
	return toErrorBody(siteBuilderFailure(codeForStreamReason(reason), `${what} (${named})`));
}

/**
 * THE LARGEST RECORD THE RELAY BUFFERS. The daemon bounds no event (an agent's text block is one
 * stdout line, unbounded), so the engine bounds what it holds per connection while it waits for a
 * record's terminator: far above any agent event measured (a text block is kilobytes; the tool
 * summaries are cut at 120 characters), and a ceiling on the memory one stream can pin. A record
 * past it ends the stream with `site_builder.stream_lost` — never buffered without bound.
 */
export const MAX_RELAY_RECORD_BYTES = 8 * 1024 * 1024;

/** One SSE record's `event:` name and joined `data:` payload (comments and ids kept aside). */
function parseRecord(record: string): { event: string | null; data: string | null } {
	let event: string | null = null;
	const data: string[] = [];
	for (const line of record.split('\n')) {
		if (line === '' || line.startsWith(':')) continue;
		const colon = line.indexOf(':');
		const field = colon === -1 ? line : line.slice(0, colon);
		let value = colon === -1 ? '' : line.slice(colon + 1);
		if (value.startsWith(' ')) value = value.slice(1);
		if (field === 'event') event = value;
		else if (field === 'data') data.push(value);
	}
	return { event, data: data.length > 0 ? data.join('\n') : null };
}

/** The record with its `data:` lines replaced by ONE line holding `payload` (ids and comments kept, in order). */
function withData(record: string, payload: unknown): string {
	const kept = record.split('\n').filter((line) => !/^data(:|$)/.test(line));
	return [...kept, `data: ${JSON.stringify(payload)}`].join('\n');
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/**
 * ONE SSE RECORD (no terminator) AS THE BROWSER MAY SEE IT:
 *  - a stored ERROR event → `{seq, ts, body:{type:'error', error:<toErrorBody>, agent_output?}}`:
 *    its code from its reason, its prose gone (only `agent_output`, the agent's own labelled
 *    words, rides along);
 *  - an `event: error` frame (the daemon's `replay_failed`) → the converter's body for its code;
 *  - a data record that is not JSON → dropped (the browser could render nothing of it, and it
 *    is nobody's vetted text);
 *  - every other record → BYTE-IDENTICAL.
 */
export function projectStreamRecord(record: string): string | null {
	const { event, data } = parseRecord(record);
	if (data === null) return record; // a comment (`: ping`) or an empty record
	const payload = parseJson(data);
	if (event === 'error') {
		const reason = (payload as { reason?: unknown } | null)?.reason;
		return withData(record, streamErrorBody(reason, 'session stream frame'));
	}
	if (payload === undefined || payload === null || typeof payload !== 'object') {
		console.error('[tool_sitebuilder] a session stream record was not JSON; dropped');
		return null;
	}
	const stored = payload as {
		seq?: unknown;
		ts?: unknown;
		body?: { type?: unknown; reason?: unknown; agent_output?: unknown };
	};
	if (stored.body?.type !== 'error') return record;
	const reason = stored.body.reason;
	const body: Record<string, unknown> = {
		type: 'error',
		error: streamErrorBody(reason, 'session event'),
	};
	if (reason === 'turn_agent_exited' && typeof stored.body.agent_output === 'string') {
		body.agent_output = stored.body.agent_output.slice(-500);
	}
	return withData(record, { seq: stored.seq, ts: stored.ts, body });
}

/** The engine's own terminal frame: the upstream leg died (or overran the record bound). */
export function streamLostFrame(): string {
	return `event: error\ndata: ${JSON.stringify(toErrorBody(siteBuilderFailure('site_builder.stream_lost', 'session stream lost')))}\n\n`;
}

/**
 * THE RELAY: the daemon's SSE bytes in, the browser's out. Splits on the blank line and buffers
 * ACROSS CHUNKS (a record arrives in as many reads as the network makes of it), projects each
 * record (`projectStreamRecord`), and at the end projects a trailing unterminated record too —
 * nothing is ever flushed raw. A record that outgrows `MAX_RELAY_RECORD_BYTES` before its
 * terminator, or an upstream that dies, ends the stream with the converter's `stream_lost`
 * body; the cause is the server log's. `cancel()` (the browser went away) aborts the upstream.
 */
export function relaySessionFrames(
	upstream: ReadableStream<Uint8Array>,
	abortUpstream: () => void,
): ReadableStream<Uint8Array> {
	const reader = upstream.getReader();
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let buffer = '';
	let pendingBytes = 0;
	/** Projects one record; true only when something was ENQUEUED (a dropped record is not). */
	const emit = (
		controller: ReadableStreamDefaultController<Uint8Array>,
		record: string,
	): boolean => {
		const projected = projectStreamRecord(record);
		if (projected === null) return false;
		controller.enqueue(encoder.encode(`${projected}\n\n`));
		return true;
	};
	const lose = (controller: ReadableStreamDefaultController<Uint8Array>, cause: string): void => {
		console.error('[tool_sitebuilder] session stream lost:', cause);
		controller.enqueue(encoder.encode(streamLostFrame()));
		controller.close();
		abortUpstream();
		reader.cancel().catch(() => {});
	};
	return new ReadableStream<Uint8Array>({
		// ONE pull reads until it has ENQUEUED something or ended the stream: a pull that
		// resolves having enqueued nothing is not called again (no new read request arrives
		// while the consumer waits on the same one), so a record split across reads — or a
		// chunk whose only complete records were DROPPED (not JSON) — would hang. Hence two
		// flags: `split` (a terminator was consumed: re-measure the pending bytes) and
		// `enqueued` (the only condition that may end this pull).
		async pull(controller) {
			for (;;) {
				let chunk: Awaited<ReturnType<typeof reader.read>>;
				try {
					chunk = await reader.read();
				} catch (error) {
					lose(controller, String(error));
					return;
				}
				if (chunk.done) {
					buffer += decoder.decode();
					if (buffer.trim() !== '') emit(controller, buffer.replace(/\n+$/, ''));
					buffer = '';
					controller.close();
					return;
				}
				buffer += decoder.decode(chunk.value, { stream: true });
				pendingBytes += chunk.value.byteLength;
				let at = buffer.indexOf('\n\n');
				let split = false;
				let enqueued = false;
				while (at !== -1) {
					if (emit(controller, buffer.slice(0, at))) enqueued = true;
					split = true;
					buffer = buffer.slice(at + 2);
					at = buffer.indexOf('\n\n');
				}
				if (split) pendingBytes = Buffer.byteLength(buffer);
				if (pendingBytes > MAX_RELAY_RECORD_BYTES) {
					buffer = '';
					lose(
						controller,
						`a record outgrew ${MAX_RELAY_RECORD_BYTES} bytes before its terminator`,
					);
					return;
				}
				if (enqueued) return;
			}
		},
		cancel() {
			abortUpstream();
			reader.cancel().catch(() => {});
		},
	});
}
