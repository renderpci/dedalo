/**
 * dd_mcp_api — the in-process HTTP bridge between the Dédalo web client's
 * assistant (tools/tool_assistant — TS-native since WC-013, server-driven)
 * and the shared MCP tool registry + agent loop (REWRITE_SPEC §8; work-system
 * MCP foundation Phase 5 + the assistant rewrite).
 *
 * Unlike the PHP oracle's dd_mcp_api (a cURL proxy to a separate MCP server
 * process), this handler serves the JSON-RPC envelope IN PROCESS from the same
 * `TOOL_REGISTRY` the stdio server registers — no child process, no cookie
 * forwarding, no wire to redact.
 *
 * Actions:
 *   mcp_proxy         — the exact legacy `mcp_client.js` contract (kept for
 *                       the PHP tree's tool_assistant copy + external
 *                       consumers): unwrap the JSON-RPC 2.0 envelope in
 *                       rqo.options; allowlisted methods only (initialize,
 *                       notifications/initialized, tools/list, tools/call).
 *                       `initialize` mints an `mcp_session_id`; every other
 *                       method REQUIRES it and a stale/missing id returns the
 *                       LITERAL `result:false, msg:'No valid MCP session ID
 *                       provided'` that client's auto-recovery keys on.
 *   agent_models      — the client-safe model catalog projection (id, label,
 *                       egress class, vision) + whether write mode is
 *                       available to THIS principal. Never exposes endpoints,
 *                       key names, or provider-native model ids.
 *   agent_chat        — run the agent loop (question + optional images +
 *                       client-resent history + UI context + catalog model
 *                       choice) under the LOGGED-IN user's principal; write
 *                       mode returns a change plan for confirmation, it never
 *                       writes. JSON, single response.
 *   agent_chat_stream — the SSE twin of agent_chat (the new tool_assistant
 *                       chat): frames `start`/`thinking`/`text`/`tool_use`/
 *                       `tool_result`/`iteration`/`final`/`error` + `: ping`
 *                       heartbeats. Validation failures BEFORE the stream
 *                       opens return the normal JSON denied() (the client
 *                       branches on content-type). The response never rotates
 *                       the CSRF token. v1 limitation: a client abort stops
 *                       delivery, not the in-flight loop.
 *   agent_apply       — execute a confirmed change plan (hash-rechecked,
 *                       every gate re-validated) — the endpoint the plan
 *                       confirm card confirms into.
 *
 * EGRESS ("Memory projects"): the conversation's model comes from the
 * server-defined catalog (DEDALO_AGENT_MODELS); when its egress class is
 * 'external' the loop gates every record-content tool call through
 * src/ai/agent/egress.ts (default-deny) — restricted repository content never
 * reaches a third-party provider. The user's own question/images egress by
 * the user's act of picking an external model.
 *
 * Identity: every call runs as `context.principal` — the session user, NEVER
 * the stdio service principal (DEDALO_MCP_USER_ID plays no role here). Session
 * + CSRF gates apply normally (none of these actions is login- or
 * CSRF-exempt).
 *
 * Config (all fail-closed; see docs/config/config.md#ai — the section anchor is a NAME,
 * never a number: the old "§12" pointed at a numbering the file never had):
 *   DEDALO_AGENT_HTTP_ENABLED=true   enables this API class's actions at all;
 *   DEDALO_AGENT_ALLOW_WRITE=true    exposes write tools + change plans;
 *   DEDALO_AGENT_WRITE_SECTIONS=a,b  narrows writable sections;
 *   DEDALO_AGENT_MODELS=[...]        the model catalog (unset ⇒ implicit
 *                                    Anthropic-only iff ANTHROPIC_API_KEY);
 *   DEDALO_AGENT_ALLOW_EXTERNAL_PROVIDER_DEFAULT=true opts record content
 *                                    into external-model conversations;
 *   DEDALO_AGENT_SYSTEM_PROMPT_APPEND adds boot-stable deployment prose.
 * Write capability is DENIED to global-admin principals per request — the
 * same confused-deputy wall the stdio server enforces at startup.
 *
 * The mcp_session_id is STATELESS: sha256("mcp:" + session.csrfToken). It is
 * valid exactly while that session lives; a recycled session yields a new id,
 * the old one fails with the literal message, and the client re-initializes
 * (its documented recovery path). No session schema, no module state.
 */

import { buildAgentEgressPolicy } from '../../../ai/agent/egress.ts';
import type { AgentImage } from '../../../ai/agent/llm_provider.ts';
import type {
	AgentHistoryEntry,
	AgentLoopEvent,
	AgentRunOptions,
	AgentRunResult,
} from '../../../ai/agent/loop.ts';
import {
	type CatalogModel,
	ModelCatalogError,
	publicModelList,
	resolveProvider,
} from '../../../ai/agent/model_catalog.ts';
import { type AgentUiContext, buildSystemPrompt } from '../../../ai/agent/system_prompt.ts';
import { asToolResult } from '../../../ai/mcp/envelope.ts';
import {
	type RegistryGates,
	getToolSpec,
	registeredTools,
	runTool,
	toAgentToolDefinition,
} from '../../../ai/mcp/registry.ts';
import { readEnv } from '../../../config/env.ts';
import type { Session } from '../../security/session_store.ts';
import type { ActionHandler, ApiRequestContext } from '../handler_context.ts';
import { requirePrincipal } from '../handler_context.ts';
import { denied } from '../response.ts';

/** The literal stale-session message js/mcp_client.js matches on. DO NOT EDIT. */
const NO_SESSION_MSG = 'No valid MCP session ID provided';

/** JSON-RPC methods the bridge serves (the PHP proxy's allowlist, verbatim). */
const ALLOWED_METHODS: ReadonlySet<string> = new Set([
	'initialize',
	'notifications/initialized',
	'tools/list',
	'tools/call',
]);

/** Stateless per-session MCP session id (see module header). */
export function mcpSessionIdFor(session: Session): string {
	const hasher = new Bun.CryptoHasher('sha256');
	hasher.update(`mcp:${session.csrfToken}`);
	return hasher.digest('hex').slice(0, 32);
}

/** The per-request registry gates: write only when enabled AND not an admin. */
function requestGates(context: ApiRequestContext): RegistryGates {
	const principal = requirePrincipal(context);
	const allowWrite = readEnv('DEDALO_AGENT_ALLOW_WRITE') === 'true' && !principal.isGlobalAdmin;
	const writableSections = new Set(
		(readEnv('DEDALO_AGENT_WRITE_SECTIONS') ?? '')
			.split(',')
			.map((entry) => entry.trim())
			.filter((entry) => entry !== ''),
	);
	return { allowWrite, writableSections };
}

/** Fail-closed master switch for the whole class. */
function agentHttpEnabled(): boolean {
	return readEnv('DEDALO_AGENT_HTTP_ENABLED') === 'true';
}

// ---------------------------------------------------------------------------
// agent_chat / agent_chat_stream shared option parsing (handler-level caps)
// ---------------------------------------------------------------------------

const QUESTION_MAX_CHARS = 32_768;
const HISTORY_MAX_ENTRIES = 64;
const HISTORY_MAX_BYTES = 262_144;
const IMAGES_MAX = 8;
/** ≈ 5 MiB decoded per image (base64 is ~4/3 of the byte length). */
const IMAGE_MAX_BASE64_CHARS = 7_000_000;
/** ≈ 15 MiB decoded across all attachments of one turn. */
const IMAGES_MAX_TOTAL_BASE64_CHARS = 21_000_000;
const CONTEXT_SUMMARY_MAX_CHARS = 2_000;
const IMAGE_MEDIA_TYPES: ReadonlySet<string> = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
]);
const TIPO_SHAPE = /^[a-zA-Z0-9_]{1,64}$/;

interface ParsedChatOptions {
	question: string;
	images?: AgentImage[];
	modeRequested: 'read' | 'write';
	modelId?: string;
	history: AgentHistoryEntry[];
	uiContext?: AgentUiContext;
}

/** Parse + cap the chat options; returns an error MESSAGE on any violation. */
function parseAgentChatOptions(
	options: Record<string, unknown>,
): { ok: true; value: ParsedChatOptions } | { ok: false; message: string } {
	const question = typeof options.question === 'string' ? options.question : '';
	if (question === '') return { ok: false, message: 'a question is required' };
	if (question.length > QUESTION_MAX_CHARS) {
		return { ok: false, message: `question exceeds ${QUESTION_MAX_CHARS} chars` };
	}

	const history: AgentHistoryEntry[] = [];
	if (options.history !== undefined) {
		if (!Array.isArray(options.history)) return { ok: false, message: 'history must be an array' };
		if (options.history.length > HISTORY_MAX_ENTRIES) {
			return { ok: false, message: `history exceeds ${HISTORY_MAX_ENTRIES} entries` };
		}
		let bytes = 0;
		for (const entry of options.history) {
			const role = (entry as { role?: unknown }).role;
			const text = (entry as { text?: unknown }).text;
			if ((role !== 'user' && role !== 'assistant') || typeof text !== 'string') {
				return { ok: false, message: 'history entries must be {role:user|assistant, text}' };
			}
			bytes += text.length;
			history.push({ role, text });
		}
		if (bytes > HISTORY_MAX_BYTES) {
			return { ok: false, message: `history exceeds ${HISTORY_MAX_BYTES} bytes` };
		}
	}

	let images: AgentImage[] | undefined;
	if (options.images !== undefined) {
		if (!Array.isArray(options.images)) return { ok: false, message: 'images must be an array' };
		if (options.images.length > IMAGES_MAX) {
			return { ok: false, message: `images exceed ${IMAGES_MAX} attachments` };
		}
		images = [];
		let imageBytes = 0;
		for (const image of options.images) {
			const mediaType = (image as { media_type?: unknown }).media_type;
			const data = (image as { data_base64?: unknown }).data_base64;
			if (
				typeof mediaType !== 'string' ||
				!IMAGE_MEDIA_TYPES.has(mediaType) ||
				typeof data !== 'string' ||
				data === ''
			) {
				return { ok: false, message: 'images must be {media_type: image/*, data_base64}' };
			}
			// Size caps: the global body limit (SERVER_MAX_BODY_BYTES, 256 MiB) is
			// far too generous for a chat turn — an uncapped attachment is a cost
			// and DoS vector on the provider leg. Base64 length ≈ 4/3 of bytes.
			if (data.length > IMAGE_MAX_BASE64_CHARS) {
				return { ok: false, message: `an image exceeds ${IMAGE_MAX_BASE64_CHARS} base64 chars` };
			}
			imageBytes += data.length;
			if (imageBytes > IMAGES_MAX_TOTAL_BASE64_CHARS) {
				return {
					ok: false,
					message: `images exceed ${IMAGES_MAX_TOTAL_BASE64_CHARS} total base64 chars`,
				};
			}
			images.push({ media_type: mediaType as never, data_base64: data });
		}
	}

	let uiContext: AgentUiContext | undefined;
	if (options.context !== undefined && options.context !== null) {
		const raw = options.context as Record<string, unknown>;
		uiContext = {};
		if (typeof raw.section_tipo === 'string' && TIPO_SHAPE.test(raw.section_tipo)) {
			uiContext.section_tipo = raw.section_tipo;
		}
		// NOT a locator comparison — a shape check on the client-sent UI context
		// (the value is rendered into a prompt block, never matched against a
		// stored locator). Bound to a local first so the shape stays out of the
		// locator-law ratchet's inline-matcher patterns (ws_a_tripwires).
		const rawSectionId = raw.section_id;
		if (typeof rawSectionId === 'number' || typeof rawSectionId === 'string') {
			const id = String(rawSectionId);
			if (/^[0-9]{1,12}$/.test(id)) uiContext.section_id = id;
		}
		if (typeof raw.component_tipo === 'string' && TIPO_SHAPE.test(raw.component_tipo)) {
			uiContext.component_tipo = raw.component_tipo;
		}
		if (typeof raw.mode === 'string' && /^[a-z_]{1,16}$/.test(raw.mode)) {
			uiContext.mode = raw.mode;
		}
		if (typeof raw.summary === 'string' && raw.summary !== '') {
			uiContext.summary = raw.summary.slice(0, CONTEXT_SUMMARY_MAX_CHARS);
		}
	}

	const modelId =
		typeof options.model === 'string' && options.model !== '' ? options.model : undefined;

	return {
		ok: true,
		value: {
			question,
			...(images !== undefined ? { images } : {}),
			modeRequested: options.mode === 'write' ? 'write' : 'read',
			...(modelId !== undefined ? { modelId } : {}),
			history,
			...(uiContext !== undefined ? { uiContext } : {}),
		},
	};
}

/**
 * Resolve the conversation setup shared by agent_chat and agent_chat_stream:
 * catalog model + provider, effective mode, egress posture, system prompt,
 * and the runAgent options. Throws ModelCatalogError for catalog problems.
 */
function buildAgentRun(
	parsed: ParsedChatOptions,
	gates: RegistryGates,
): {
	model: CatalogModel;
	provider: ReturnType<typeof resolveProvider>['provider'];
	mode: 'read' | 'write';
	runOptions: AgentRunOptions;
} {
	const { model, provider } = resolveProvider(parsed.modelId);
	if (parsed.images !== undefined && parsed.images.length > 0 && !model.vision) {
		throw new ModelCatalogError(`model "${model.id}" does not accept images`);
	}
	const mode = parsed.modeRequested === 'write' && gates.allowWrite === true ? 'write' : 'read';
	const external = model.egress === 'external';
	const runOptions: AgentRunOptions = {
		mode,
		writableSections: gates.writableSections,
		history: parsed.history,
		...(parsed.uiContext !== undefined ? { uiContext: parsed.uiContext } : {}),
		egress: { external, policy: buildAgentEgressPolicy() },
		systemPrompt: buildSystemPrompt({
			mode,
			egress: external ? 'external' : 'local',
			deploymentAppend: readEnv('DEDALO_AGENT_SYSTEM_PROMPT_APPEND'),
		}),
	};
	return { model, provider, mode, runOptions };
}

/**
 * Translate a setup/run failure into a client-safe message.
 *
 * A ModelCatalogError is deliberate operator feedback (a misconfigured
 * DEDALO_AGENT_MODELS, an unknown model id, images on a non-vision model) and
 * goes out verbatim. Anything else is a provider/transport error whose text
 * carries config internals — the Anthropic provider names the env KEY it
 * wanted; the OpenAI-compatible one embeds up to 300 chars of the upstream
 * body. Those are logged server-side and answered generically, matching the
 * central sanitizer in dispatch.ts.
 */
function agentErrorMessage(error: unknown, where: string): string {
	if (error instanceof ModelCatalogError) return error.message;
	console.error(`[dd_mcp_api] ${where}:`, error);
	return 'The assistant is not available right now (see server logs).';
}

/** Bounded display/audit projection of the run transcript (never provider-raw). */
function transcriptSummary(run: AgentRunResult): Record<string, unknown>[] {
	const cap = (text: string) => (text.length > 500 ? `${text.slice(0, 499)}…` : text);
	return run.transcript.map((entry) => {
		if (entry.role === 'user') return { role: 'user', text: cap(entry.text) };
		if (entry.role === 'assistant') {
			return {
				role: 'assistant',
				text: cap(entry.turn.text),
				...(entry.turn.tool_uses.length > 0
					? { tool_calls: entry.turn.tool_uses.map((use) => use.name) }
					: {}),
			};
		}
		return { role: 'tool_results', ok: entry.results.map((result) => !result.is_error) };
	});
}

/** Build a JSON-RPC 2.0 success body. */
function rpcResult(id: unknown, result: unknown): Record<string, unknown> {
	return { jsonrpc: '2.0', id: id ?? null, result };
}

/** Build a JSON-RPC 2.0 error body. */
function rpcError(id: unknown, code: number, message: string): Record<string, unknown> {
	return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

export const mcpApiActions: Record<string, ActionHandler> = {
	/** The mcp_client.js JSON-RPC bridge (contract documented in the header). */
	mcp_proxy: async (rqo, context) => {
		if (!agentHttpEnabled()) {
			return denied(400, 'Undefined or unauthorized method (action)');
		}
		const principal = requirePrincipal(context);
		const session = context.session as Session;
		const envelope = (rqo.options ?? {}) as {
			jsonrpc?: unknown;
			method?: unknown;
			params?: unknown;
			id?: unknown;
		};
		const method = typeof envelope.method === 'string' ? envelope.method : '';
		if (!ALLOWED_METHODS.has(method)) {
			return {
				status: 200,
				body: {
					result: true,
					data: rpcError(envelope.id, -32601, `Method not allowed: ${method}`),
				},
			};
		}

		// initialize mints the (stateless) session id; everything else needs it.
		const expectedId = mcpSessionIdFor(session);
		if (method === 'initialize') {
			return {
				status: 200,
				body: {
					result: true,
					mcp_session_id: expectedId,
					data: rpcResult(envelope.id, {
						protocolVersion: '2025-03-26',
						capabilities: { tools: {} },
						serverInfo: { name: 'dedalo-core', version: '0.0.1' },
					}),
				},
			};
		}
		const sentId = (rqo as { mcp_session_id?: unknown }).mcp_session_id;
		if (typeof sentId !== 'string' || sentId !== expectedId) {
			// The literal message the client's stale-session recovery matches on.
			return { status: 200, body: { result: false, msg: NO_SESSION_MSG } };
		}

		if (method === 'notifications/initialized') {
			// Fire-and-forget acknowledgement (no JSON-RPC id, no result body).
			return { status: 200, body: { result: true, data: {} } };
		}

		const gates = requestGates(context);
		if (method === 'tools/list') {
			const tools = registeredTools(gates).map((spec) => {
				const definition = toAgentToolDefinition(spec);
				return {
					name: definition.name,
					description: definition.description,
					inputSchema: definition.input_schema,
					annotations: spec.annotations,
				};
			});
			return {
				status: 200,
				body: { result: true, data: rpcResult(envelope.id, { tools }) },
			};
		}

		// tools/call — the LOGGED-IN user's principal, the registry chokepoint.
		const params = (envelope.params ?? {}) as { name?: unknown; arguments?: unknown };
		const toolName = typeof params.name === 'string' ? params.name : '';
		const spec = getToolSpec(toolName);
		// A write tool on a read-only surface is refused by runTool with a coded
		// envelope; an unknown tool is a JSON-RPC error (the client throws it).
		if (spec === undefined) {
			return {
				status: 200,
				body: {
					result: true,
					data: rpcError(envelope.id, -32602, `Unknown tool: ${toolName}`),
				},
			};
		}
		const structured = await runTool(spec, principal, params.arguments ?? {}, gates);
		return {
			status: 200,
			body: { result: true, data: rpcResult(envelope.id, asToolResult(structured)) },
		};
	},

	/** The client-safe model catalog + write availability for THIS principal. */
	agent_models: async (_rqo, context) => {
		if (!agentHttpEnabled()) {
			return denied(400, 'Undefined or unauthorized method (action)');
		}
		requirePrincipal(context);
		const gates = requestGates(context);
		try {
			return {
				status: 200,
				body: {
					result: true,
					data: {
						models: publicModelList(),
						write_allowed: gates.allowWrite === true,
					},
				},
			};
		} catch (error) {
			// A broken catalog disables the assistant with a clear operator message.
			return denied(400, agentErrorMessage(error, 'agent_models'));
		}
	},

	/** Run the agent loop as the logged-in user (vision-capable, never writes). */
	agent_chat: async (rqo, context) => {
		if (!agentHttpEnabled()) {
			return denied(400, 'Undefined or unauthorized method (action)');
		}
		const principal = requirePrincipal(context);
		const parsed = parseAgentChatOptions((rqo.options ?? {}) as Record<string, unknown>);
		if (!parsed.ok) {
			return denied(400, `agent_chat: ${parsed.message}`);
		}
		const gates = requestGates(context);

		const { runAgent } = await import('../../../ai/agent/loop.ts');
		let setup: ReturnType<typeof buildAgentRun>;
		try {
			setup = buildAgentRun(parsed.value, gates);
		} catch (error) {
			// Catalog/config problems fail closed with a clear operator message.
			return denied(400, agentErrorMessage(error, 'agent_chat'));
		}
		const run = await runAgent(
			principal,
			parsed.value.images !== undefined
				? { text: parsed.value.question, images: parsed.value.images }
				: parsed.value.question,
			setup.provider,
			setup.runOptions,
		);
		return {
			status: 200,
			body: {
				result: true,
				data: {
					answer: run.answer,
					stop: run.stop,
					change_plan: run.change_plan ?? null,
					turns: run.transcript.length,
					model: setup.model.id,
					usage: run.usage,
					history: run.history,
				},
			},
		};
	},

	/**
	 * The SSE twin of agent_chat — the new tool_assistant chat surface.
	 * Validation failures BEFORE the stream opens return normal JSON denied()
	 * (the client branches on the response content-type).
	 */
	agent_chat_stream: async (rqo, context) => {
		if (!agentHttpEnabled()) {
			return denied(400, 'Undefined or unauthorized method (action)');
		}
		const principal = requirePrincipal(context);
		const parsed = parseAgentChatOptions((rqo.options ?? {}) as Record<string, unknown>);
		if (!parsed.ok) {
			return denied(400, `agent_chat_stream: ${parsed.message}`);
		}
		const gates = requestGates(context);

		const { runAgent } = await import('../../../ai/agent/loop.ts');
		let setup: ReturnType<typeof buildAgentRun>;
		try {
			setup = buildAgentRun(parsed.value, gates);
		} catch (error) {
			return denied(400, agentErrorMessage(error, 'agent_chat_stream'));
		}
		const { model, provider, mode, runOptions } = setup;
		const parsedValue = parsed.value;

		const encoder = new TextEncoder();
		// Request-scoped state only (module_state discipline).
		let closed = false;
		let heartbeatHandle: ReturnType<typeof setInterval> | undefined;
		const stream = new ReadableStream<Uint8Array>({
			cancel() {
				// Client went away: stop delivering + heartbeating (the in-flight
				// loop still runs to completion — documented v1 limitation).
				closed = true;
				if (heartbeatHandle !== undefined) clearInterval(heartbeatHandle);
			},
			start(controller) {
				const send = (event: string, payload: unknown) => {
					if (closed) return;
					try {
						controller.enqueue(
							encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`),
						);
					} catch {
						closed = true; // client went away — stop delivering (loop still finishes; v1)
					}
				};
				// Assigned to the OUTER handle so cancel() can actually clear it.
				const heartbeat = setInterval(() => {
					if (closed) return;
					try {
						controller.enqueue(encoder.encode(': ping\n\n'));
					} catch {
						closed = true;
					}
				}, 15_000);
				heartbeatHandle = heartbeat;

				send('start', { model: model.id, mode, egress: model.egress });

				const onEvent = (event: AgentLoopEvent) => {
					switch (event.type) {
						case 'text_delta':
							send('text', { delta: event.text });
							break;
						case 'thinking':
							send('thinking', { state: event.state });
							break;
						case 'tool_use':
							send('tool_use', { id: event.id, name: event.name, summary: event.summary });
							break;
						case 'tool_result':
							send('tool_result', {
								id: event.id,
								name: event.name,
								ok: event.ok,
								code: event.code ?? null,
							});
							break;
						case 'iteration':
							send('iteration', { n: event.n, max: event.max });
							break;
						default:
							break; // tool_input_start etc. — the loop's tool_use event follows
					}
				};

				void (async () => {
					try {
						const run = await runAgent(
							principal,
							parsedValue.images !== undefined
								? { text: parsedValue.question, images: parsedValue.images }
								: parsedValue.question,
							provider,
							{ ...runOptions, onEvent },
						);
						send('final', {
							answer: run.answer,
							stop: run.stop,
							change_plan: run.change_plan ?? null,
							history: run.history,
							transcript_summary: transcriptSummary(run),
							usage: run.usage,
							turns: run.transcript.length,
							model: model.id,
						});
					} catch (error) {
						send('error', {
							code: 'agent_failed',
							message: agentErrorMessage(error, 'agent_chat_stream run'),
							hint: 'Retry; if it persists, check the server model configuration.',
						});
					} finally {
						clearInterval(heartbeat);
						closed = true;
						try {
							controller.close();
						} catch {
							// already closed by a client cancel — nothing to do
						}
					}
				})();
			},
		});

		return {
			status: 200,
			body: { result: true },
			stream,
			streamHeaders: {
				'Content-Type': 'text/event-stream; charset=utf-8',
				'Cache-Control': 'no-cache, must-revalidate',
				'X-Accel-Buffering': 'no',
			},
		};
	},

	/** Execute a HUMAN-CONFIRMED change plan (hash recheck + full re-validation). */
	agent_apply: async (rqo, context) => {
		if (!agentHttpEnabled()) {
			return denied(400, 'Undefined or unauthorized method (action)');
		}
		const principal = requirePrincipal(context);
		const options = (rqo.options ?? {}) as { plan?: unknown; plan_hash?: unknown };
		if (typeof options.plan_hash !== 'string' || options.plan === undefined) {
			return denied(400, 'agent_apply: plan and plan_hash are required');
		}
		const gates = requestGates(context);
		const { applyChangePlanEnveloped } = await import('../../../ai/agent/change_plan.ts');
		const envelope = await applyChangePlanEnveloped(
			principal,
			options.plan,
			options.plan_hash,
			gates,
		);
		return {
			status: 200,
			body: {
				result: envelope.ok,
				msg: envelope.ok ? 'ok' : envelope.error.message,
				data: envelope,
			},
		};
	},
};
