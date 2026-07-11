/**
 * dd_diffusion_api — client-facing diffusion actions (DIFFUSION_SPEC §4.2).
 *
 * Served from the MAIN API dispatcher (control plane): the byte-identical
 * tool_diffusion client reaches these through its DEDALO_DIFFUSION_API_URL
 * fallback with ZERO edits. Wire shapes are pinned verbatim against the old
 * engine (test/parity/fixtures/diffusion/pinned.ts):
 *
 * - diffuse .............. enqueue durable job → SSE stream over its progress
 * - get_process_status ... SSE poll stream by client process_id (reconnect)
 * - list_processes ....... { result:true, processes: progress_data[] }
 * - cancel_process ....... { result, msg }
 *
 * AUTHORIZATION (stronger than the old engine): every action runs behind the
 * dispatch gates (session, CSRF, allowlist); diffuse additionally requires
 * read permission on the source section (PHP SEC-13); status/cancel/list are
 * OWNER-SCOPED (global admins see all) — id knowledge alone grants nothing
 * (the old engine accepted any authenticated cookie for any process id).
 *
 * Progress transport is POLL-based over the durable job row (500ms/update_rate
 * cadence — the same cadence the old engine's status stream used). The
 * pg_notify emitted by the queue is forward-compatibility for a LISTEN-based
 * push upgrade; nothing depends on it yet (ledgered in STATUS.md).
 */

import { readEnv } from '../../config/env.ts';
import type { ApiResult } from '../../core/api/response.ts';
import type { Rqo } from '../../core/concepts/rqo.ts';
import { sanitizeClientSqo } from '../../core/concepts/sqo.ts';
import type { Principal } from '../../core/security/permissions.ts';
import { getPermissions } from '../../core/security/permissions.ts';
import {
	enqueueDiffusionJob,
	getJobByClientProcessId,
	getJobById,
	listJobsForCaller,
	requestCancel,
} from '../jobs/queue.ts';
import type { DiffusionJobRow } from '../jobs/queue.ts';
import { schedulerTick } from '../jobs/scheduler.ts';
import {
	encodeSseChunk,
	encodeSseCommentHeartbeat,
	notFoundProgressData,
	progressDataFromJob,
	sseResponseHeaders,
} from '../jobs/sse.ts';

/** Old-engine cadences (pinned): 2s state re-send on diffuse; 15s ":\n" on status. */
const DIFFUSE_HEARTBEAT_MS = 2000;
const STATUS_COMMENT_HEARTBEAT_MS = 15000;
const STATUS_DEFAULT_UPDATE_RATE_MS = 1000;
/** Poll cadence for change detection on the diffuse stream. */
const DIFFUSE_POLL_MS = 500;

const failBody = (msg: string, errors: string[]): ApiResult => ({
	status: 200,
	body: { result: false, msg: `Error. ${msg}`, errors },
});

/** Client label grammar: 'process_diffusion_{user}_{element}_{section}' and kin. */
const CLIENT_PROCESS_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

/** Admins observe every run; everyone else only their own (null = unscoped). */
function ownerScope(principal: Principal): number | null {
	return principal.isGlobalAdmin ? null : principal.userId;
}

/**
 * Build an SSE stream that follows ONE job until it leaves the running states.
 * `resolveJob` re-reads the row each poll (the stream survives runner
 * restarts — it observes the durable row, not a process). Emits on every
 * observable change, re-sends current state as the heartbeat (old diffuse
 * behavior), closes after the terminal chunk. A poll DB error is caught in
 * place: terminal error chunk + close (never a floating rejection — Bun kills
 * the whole process on the first one — and never a hung client stream).
 * Exported for the crash-survival gate (test/unit/diffusion_sse_resilience).
 */
export function buildJobFollowStream(
	resolveJob: () => Promise<DiffusionJobRow | null>,
	processIdForNotFound: string,
	pollMs: number,
	options: { commentHeartbeat: boolean },
): ReadableStream<Uint8Array> {
	let pollTimer: ReturnType<typeof setInterval> | undefined;
	let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
	let lastSerialized = '';
	let closed = false;

	const cleanup = () => {
		closed = true;
		if (pollTimer !== undefined) clearInterval(pollTimer);
		if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer);
	};

	return new ReadableStream<Uint8Array>({
		start(controller) {
			const push = (chunk: Uint8Array) => {
				if (closed) return;
				try {
					controller.enqueue(chunk);
				} catch {
					cleanup();
				}
			};
			const finish = () => {
				cleanup();
				try {
					controller.close();
				} catch {
					/* already closed by the client */
				}
			};

			const poll = async () => {
				if (closed) return;
				try {
					const job = await resolveJob();
					if (job === null) {
						// Old engine parity: unknown id → terminal not-found chunk.
						push(encodeSseChunk(notFoundProgressData(processIdForNotFound)));
						finish();
						return;
					}
					const snapshot = progressDataFromJob(job);
					// total_time ticks every second while running — strip it from the
					// change signature so we emit on REAL changes plus heartbeats,
					// not every poll.
					const { total_time: _ignored, ...changeSignature } = snapshot;
					const serialized = JSON.stringify(changeSignature);
					if (serialized !== lastSerialized) {
						lastSerialized = serialized;
						push(encodeSseChunk(snapshot));
					}
					if (!snapshot.is_running) {
						finish();
					}
				} catch (error) {
					// DB error mid-stream: loud log + terminal error chunk + close.
					// Swallowing without finish() would leave the client hanging on
					// a dead poll loop.
					console.error('[diffusion sse] job poll failed:', error);
					push(
						encodeSseChunk({
							process_id: processIdForNotFound,
							is_running: false,
							started_at: Date.now(),
							data: { msg: 'Error: process status read failed', counter: 0, total: 0 },
							total_time: '0 sec',
							errors: ['process status read failed'],
						}),
					);
					finish();
				}
			};

			// Initial state immediately (old engine sends it before any update).
			void poll();
			pollTimer = setInterval(() => void poll(), pollMs);
			heartbeatTimer = setInterval(
				() => {
					if (options.commentHeartbeat) {
						// get_process_status heartbeat: SSE comment line.
						push(encodeSseCommentHeartbeat());
						return;
					}
					// diffuse heartbeat: re-send current state (keeps proxies warm).
					// Caught: a heartbeat read failure is non-fatal (the poll loop
					// owns the terminal error path) but must never float (S1-15).
					void resolveJob()
						.then((job) => {
							if (job !== null) push(encodeSseChunk(progressDataFromJob(job)));
						})
						.catch((error) => console.error('[diffusion sse] heartbeat poll failed:', error));
				},
				options.commentHeartbeat ? STATUS_COMMENT_HEARTBEAT_MS : DIFFUSE_HEARTBEAT_MS,
			);
		},
		cancel() {
			cleanup();
		},
	});
}

/** ApiResult carrying an SSE stream (server.ts turns it into the raw Response). */
function sseResult(stream: ReadableStream<Uint8Array>): ApiResult {
	return {
		status: 200,
		body: {},
		stream,
		streamHeaders: sseResponseHeaders(),
	};
}

/**
 * `diffuse` — gate → sanitize → enqueue (or attach to the active run for the
 * same element+section) → follow stream.
 */
export async function diffuseAction(rqo: Rqo, principal: Principal): Promise<ApiResult> {
	const options = (rqo.options ?? {}) as Record<string, unknown>;
	const rawSqo = (rqo.sqo ?? null) as { section_tipo?: unknown } | null;
	const elementTipo =
		typeof options.diffusion_element_tipo === 'string'
			? options.diffusion_element_tipo
			: typeof options.diffusion_tipo === 'string'
				? options.diffusion_tipo
				: null;

	// The section being published is carried by the record-selection SQO (client
	// export(): section_tipo = self.caller.section_tipo), NOT by rqo.source.
	// create_source sets source.section_tipo to `self.section_tipo || self.tipo`,
	// which for a TOOL instance is the tool's OWN ontology tipo (e.g. dd1324
	// "tool directory"), never the open record's section — using it made the
	// resolver look for a SectionPlan that isn't in the element's plan. The PHP
	// oracle derives the same value via get_related_section_tipo(diffusion_tipo);
	// the SQO's section_tipo is the equivalent and ALSO scopes the record search,
	// keeping the resolver's primary SectionPlan and the searched rows consistent.
	const sqoSectionTipo = Array.isArray(rawSqo?.section_tipo)
		? (rawSqo.section_tipo.find((tipo): tipo is string => typeof tipo === 'string') ?? null)
		: typeof rawSqo?.section_tipo === 'string'
			? rawSqo.section_tipo
			: null;
	const sectionTipo = sqoSectionTipo;
	if (sectionTipo === null || elementTipo === null) {
		return failBody('diffuse requires sqo.section_tipo and options.diffusion_element_tipo', [
			'invalid_request',
		]);
	}

	// SEC-13: read permission on the source section, server-enforced.
	const level = await getPermissions(principal, sectionTipo, sectionTipo);
	if (level < 1) {
		return failBody('Insufficient permissions to diffuse this section', [
			'insufficient permissions',
		]);
	}

	// Staged-cutover routing (DIFFUSION_PLAN P5 step 2): when the deployment
	// pins DEDALO_DIFFUSION_NATIVE_ELEMENTS (csv of element tipos, or 'all'),
	// elements outside the list refuse LOUDLY — they still publish through
	// the old engine (never both engines on one element+section). Unset =
	// permissive (dev posture; the copied client only reaches this action
	// once DEDALO_DIFFUSION_NATIVE flips the environment key anyway).
	const routedElements = readEnv('DEDALO_DIFFUSION_NATIVE_ELEMENTS');
	if (routedElements !== undefined && routedElements !== '' && routedElements !== 'all') {
		const allowed = routedElements.split(',').map((entry: string) => entry.trim());
		if (!allowed.includes(elementTipo)) {
			return failBody(
				`Element ${elementTipo} is not routed to the native engine yet (DEDALO_DIFFUSION_NATIVE_ELEMENTS)`,
				['element_not_routed'],
			);
		}
	}

	// The record selection: sanitized at the boundary (server-only SQO keys
	// stripped, limits clamped) — the job spec NEVER stores a raw client SQO.
	const sqo = sanitizeClientSqo(
		(rqo.sqo ?? { section_tipo: [sectionTipo] }) as Record<string, unknown>,
	);

	const requestedProcessId = options.process_id;
	const clientProcessId =
		typeof requestedProcessId === 'string' && CLIENT_PROCESS_ID_PATTERN.test(requestedProcessId)
			? requestedProcessId
			: `process_diffusion_${principal.userId}_${elementTipo}_${sectionTipo}`;

	const estimatedTotal = Number(options.total ?? 0) || 0;
	const { process_id: _clientLabel, ...runnerOptions } = options;

	const { job } = await enqueueDiffusionJob({
		ownerUserId: principal.userId,
		clientProcessId,
		spec: {
			diffusion_element_tipo: elementTipo,
			section_tipo: sectionTipo,
			type: typeof options.type === 'string' ? options.type : 'sql',
			sqo: sqo as unknown as Record<string, unknown>,
			estimated_total: estimatedTotal,
			options: runnerOptions,
		},
	});

	// Immediate spawn attempt — no 2s scheduler-tick latency on the first chunk.
	void schedulerTick();

	return sseResult(
		buildJobFollowStream(() => getJobById(job.job_id), clientProcessId, DIFFUSE_POLL_MS, {
			commentHeartbeat: false,
		}),
	);
}

/** `get_process_status` — reconnect stream by client process_id (owner-scoped). */
export async function getProcessStatusAction(rqo: Rqo, principal: Principal): Promise<ApiResult> {
	const body = rqo as unknown as { process_id?: unknown; update_rate?: unknown };
	const processId = typeof body.process_id === 'string' ? body.process_id : null;
	if (processId === null || !CLIENT_PROCESS_ID_PATTERN.test(processId)) {
		// Old engine parity: missing id → single terminal SSE chunk, not a JSON error.
		const chunk = encodeSseChunk({
			process_id: '',
			is_running: false,
			started_at: Date.now(),
			data: { msg: 'Error: process_id is required', counter: 0, total: 0 },
			total_time: '0 sec',
			errors: ['process_id is required'],
		});
		return sseResult(
			new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(chunk);
					controller.close();
				},
			}),
		);
	}
	const updateRate = Math.min(
		10000,
		Math.max(
			250,
			Number(body.update_rate ?? STATUS_DEFAULT_UPDATE_RATE_MS) || STATUS_DEFAULT_UPDATE_RATE_MS,
		),
	);
	const scope = ownerScope(principal);
	return sseResult(
		buildJobFollowStream(() => getJobByClientProcessId(processId, scope), processId, updateRate, {
			commentHeartbeat: true,
		}),
	);
}

/** `list_processes` — { result:true, processes:[progress_data…] } (24h window). */
export async function listProcessesAction(_rqo: Rqo, principal: Principal): Promise<ApiResult> {
	const jobs = await listJobsForCaller(ownerScope(principal));
	return {
		status: 200,
		body: {
			result: true,
			processes: jobs.map((job) => progressDataFromJob(job)),
		},
	};
}

/** `cancel_process` — pinned { result, msg } contract, owner-scoped. */
export async function cancelProcessAction(rqo: Rqo, principal: Principal): Promise<ApiResult> {
	const body = rqo as unknown as { process_id?: unknown };
	const processId = typeof body.process_id === 'string' ? body.process_id : null;
	if (processId === null || !CLIENT_PROCESS_ID_PATTERN.test(processId)) {
		return {
			status: 400,
			body: {
				result: false,
				msg: 'Missing or invalid process_id',
				errors: ['invalid_process_id'],
			},
		};
	}
	const { cancelled } = await requestCancel(processId, ownerScope(principal));
	return {
		status: 200,
		body: {
			result: cancelled,
			msg: cancelled
				? `Process ${processId} cancelled`
				: `Process ${processId} not found or not running`,
		},
	};
}

/** `get_diffusion_info` — panel descriptors (PHP :355 contract; SEC read gate). */
export async function getDiffusionInfoAction(rqo: Rqo, principal: Principal): Promise<ApiResult> {
	const options = (rqo.options ?? {}) as { section_tipo?: unknown };
	const sectionTipo = typeof options.section_tipo === 'string' ? options.section_tipo : null;
	if (sectionTipo === null) {
		return failBody('Missing section_tipo.', ['Missing section_tipo.']);
	}
	const level = await getPermissions(principal, sectionTipo, sectionTipo);
	if (level < 1) {
		return failBody('Insufficient permissions', ['insufficient permissions']);
	}
	const { buildDiffusionInfo } = await import('./info.ts');
	const result = await buildDiffusionInfo(sectionTipo);
	return {
		status: 200,
		body: { result, msg: 'Diffusion info retrieved successfully', errors: [] },
	};
}

/** `get_engine_advisory` — client reads the body TOP-LEVEL (state/title/checks). */
export async function getEngineAdvisoryAction(_rqo: Rqo, principal: Principal): Promise<ApiResult> {
	const { buildEngineAdvisory } = await import('./info.ts');
	return { status: 200, body: buildEngineAdvisory(principal.isGlobalAdmin) };
}

/** `retry_pending_deletions` — native dd1758 pending-unpublish retry. */
export async function retryPendingDeletionsAction(
	_rqo: Rqo,
	_principal: Principal,
): Promise<ApiResult> {
	const { retryPendingDiffusion } = await import('../../core/diffusion_bridge/diffusion_delete.ts');
	const summary = await retryPendingDiffusion();
	return {
		status: 200,
		body: {
			result: true,
			msg: `Retried ${summary.retried} of ${summary.total} pending deletions (${summary.remaining} remaining)`,
			...summary,
		},
	};
}
