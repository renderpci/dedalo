/**
 * THE TRANSCRIPTION POLL HANDLE (closure Step 3, TOOLS-3 review r7;
 * WC-2026-09-30-transcription-record-tipo) — what `automatic_transcription`
 * hands the client in place of the transcriber's raw job id, and the ONLY thing
 * `check_server_transcriber_status` accepts as `pid`.
 *
 * WHY. The client poll used to forward the caller-supplied `pid` to the
 * transcriber verbatim. Its read gate checked whichever `media_ddo` the caller
 * named, but nothing tied the polled JOB to that record or to that user: the
 * on-premise sidecar keys a job by its own sequential-looking id (`job-42`) and
 * is polled with no audio URL, so a user holding READ on any one recording of
 * their own could walk the ids and receive the finished transcripts of other
 * people's restricted interviews. A job is a resource with an owner; the handle
 * makes that ownership a property of the request, not of the caller's honesty.
 *
 * WHAT IT BINDS. The raw job id, the engine it was submitted to, the submitting
 * user, and the media GRANT the submit was authorized on (section, component,
 * record) — sealed with an HMAC (SHA-256) under a key drawn once per process.
 * The poll accepts a handle only when the seal verifies AND the user AND the
 * record of the poll's own read grant equal the bound ones; the effect (which
 * job, which engine) is then taken FROM THE HANDLE, never from the payload.
 *
 * WHY A PROCESS KEY (no configuration, no table). The server-side half of a job
 * — the detached completion poll that saves the transcript — lives in this
 * process and dies with it (background.ts, ledgered). A handle that outlived
 * the process would let the client report a job as running or done whose
 * result nothing will ever save; with the key, a restart retires every handle
 * at the same moment it retires the job that could have honoured it.
 *
 * The handle is opaque to the client, which stores and echoes it unchanged
 * (render_tool_transcription.js — IndexedDB `pid`).
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Drawn once per process (see the header): never exported, never logged. */
const HANDLE_KEY = randomBytes(32);

/** The handle grammar's version tag — a different tag never verifies. */
const HANDLE_TAG = 'dtp1';

/** What a handle binds. */
export interface PollBinding {
	/** The transcriber's own job id (babel pid / the sidecar's job id). */
	readonly pid: string | number;
	/** The engine name the job was SUBMITTED to (the tool config's name). */
	readonly engine: string;
	/** The submitting user. */
	readonly userId: number;
	/** The media GRANT the submit was authorized on. */
	readonly sectionTipo: string;
	readonly componentTipo: string;
	readonly sectionId: number;
}

function seal(payload: string): string {
	return createHmac('sha256', HANDLE_KEY).update(`${HANDLE_TAG}.${payload}`).digest('base64url');
}

/** Mint the opaque handle for a submitted job. */
export function issuePollHandle(binding: PollBinding): string {
	const payload = Buffer.from(
		JSON.stringify([
			binding.pid,
			binding.engine,
			binding.userId,
			binding.sectionTipo,
			binding.componentTipo,
			binding.sectionId,
		]),
	).toString('base64url');
	return `${HANDLE_TAG}.${payload}.${seal(payload)}`;
}

/**
 * The binding a handle seals, or null when it is not a handle THIS process
 * issued (a raw job id, a forged or altered handle, one from before a restart).
 * Constant-time on the seal.
 */
export function readPollHandle(handle: unknown): PollBinding | null {
	if (typeof handle !== 'string') return null;
	const parts = handle.split('.');
	if (parts.length !== 3 || parts[0] !== HANDLE_TAG) return null;
	const [, payload, mac] = parts as [string, string, string];
	const expected = Buffer.from(seal(payload));
	const given = Buffer.from(mac);
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
	let fields: unknown;
	try {
		fields = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
	} catch {
		return null;
	}
	if (!Array.isArray(fields) || fields.length !== 6) return null;
	const [pid, engine, userId, sectionTipo, componentTipo, sectionId] = fields as unknown[];
	if (
		(typeof pid !== 'string' && typeof pid !== 'number') ||
		typeof engine !== 'string' ||
		typeof userId !== 'number' ||
		typeof sectionTipo !== 'string' ||
		typeof componentTipo !== 'string' ||
		typeof sectionId !== 'number'
	) {
		return null;
	}
	return { pid, engine, userId, sectionTipo, componentTipo, sectionId };
}

/**
 * True when the handle's binding is THIS poll's: the same user, and the same
 * (section, component, record) the poll's own read grant was issued on.
 */
export function bindingMatches(
	binding: PollBinding,
	userId: number,
	grant: {
		readonly sectionTipo: string;
		readonly componentTipo: string;
		readonly sectionId: number;
	},
): boolean {
	return (
		binding.userId === userId &&
		binding.sectionTipo === grant.sectionTipo &&
		binding.componentTipo === grant.componentTipo &&
		binding.sectionId === grant.sectionId
	);
}
