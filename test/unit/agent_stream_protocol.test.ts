/**
 * Gate: agent_chat_stream — the SSE contract the new tool_assistant client
 * consumes, driven through the REAL dispatch (dispatchRqo) with session
 * fixtures. Asserts: fail-closed master switch; JSON denied() BEFORE the
 * stream opens on validation failures (the client branches on content-type);
 * the frame protocol (start → iteration/tool activity/text deltas → final
 * with resendable history); agent_models is gated + secret-free; unknown
 * model / vision refusals on agent_chat.
 *
 * The model catalog is mock.module'd so the loop runs a deterministic
 * SCRIPTED streaming provider (no key, no network). mock.module is
 * process-global and mock.restore() does NOT revert it — afterAll re-installs
 * the real module so later suites are not poisoned.
 */

import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import type {
	AgentAssistantTurn,
	AgentLlmProvider,
	AgentTranscriptEntry,
	AgentTurnDelta,
} from '../../src/ai/agent/llm_provider.ts';
import * as realCatalog from '../../src/ai/agent/model_catalog.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import {
	type Session,
	createSession,
	destroySession,
	getSession,
} from '../../src/core/security/session_store.ts';

const REAL_CATALOG = { ...realCatalog };

/** Scripted provider that also exercises the streaming sink. */
class StreamingScriptedProvider implements AgentLlmProvider {
	readonly name = 'scripted';
	private turnIndex = 0;

	async createTurn(
		_request: { transcript: AgentTranscriptEntry[] },
		onDelta?: (delta: AgentTurnDelta) => void,
	): Promise<AgentAssistantTurn> {
		this.turnIndex++;
		if (this.turnIndex === 1) {
			return {
				text: '',
				tool_uses: [{ id: 'tu_1', name: 'not_a_tool', input: { q: 'x' } }],
				stop_reason: 'tool_use',
			};
		}
		onDelta?.({ type: 'thinking', state: 'start' });
		onDelta?.({ type: 'thinking', state: 'stop' });
		onDelta?.({ type: 'text_delta', text: 'Hel' });
		onDelta?.({ type: 'text_delta', text: 'lo' });
		return {
			text: 'Hello',
			tool_uses: [],
			stop_reason: 'end_turn',
			usage: { input_tokens: 10, output_tokens: 2 },
		};
	}
}

const SCRIPTED_MODEL = {
	id: 'scripted',
	label: 'Scripted',
	provider: 'anthropic' as const,
	model: 'scripted-native',
	egress: 'local' as const,
	vision: true,
};

mock.module('../../src/ai/agent/model_catalog.ts', () => ({
	...REAL_CATALOG,
	resolveProvider: (modelId: string | undefined) => {
		if (modelId === 'nope') {
			throw new REAL_CATALOG.ModelCatalogError('Unknown model "nope" — pick one from agent_models');
		}
		if (modelId === 'novision') {
			return {
				model: { ...SCRIPTED_MODEL, id: 'novision', vision: false },
				provider: new StreamingScriptedProvider(),
			};
		}
		return { model: SCRIPTED_MODEL, provider: new StreamingScriptedProvider() };
	},
}));

// Import AFTER the mock so the handler's static binding resolves to the stub.
const { dispatchRqo } = await import('../../src/core/api/dispatch.ts');

let adminToken: string;
let admin: Session;
const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = [
	'DEDALO_AGENT_HTTP_ENABLED',
	'DEDALO_AGENT_ALLOW_WRITE',
	'DEDALO_AGENT_MODELS',
	'ANTHROPIC_API_KEY',
];

beforeAll(() => {
	for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
	process.env.DEDALO_AGENT_HTTP_ENABLED = 'true';
	adminToken = createSession(-1, 'debug_superuser', true);
	admin = getSession(adminToken) as Session;
});

afterAll(() => {
	destroySession(adminToken);
	for (const [key, value] of Object.entries(savedEnv)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
	mock.module('../../src/ai/agent/model_catalog.ts', () => REAL_CATALOG);
	mock.restore();
});

function contextFor(session: Session | null, csrf?: string | null) {
	return {
		requestId: crypto.randomUUID(),
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: csrf === undefined ? (session?.csrfToken ?? null) : csrf,
	};
}

function chatRqo(action: string, options: Record<string, unknown>): Rqo {
	return { action, dd_api: 'dd_mcp_api', options } as unknown as Rqo;
}

interface SseFrame {
	event: string;
	data: Record<string, unknown>;
}

async function readFrames(stream: ReadableStream<Uint8Array>): Promise<SseFrame[]> {
	const text = await new Response(stream).text();
	const frames: SseFrame[] = [];
	for (const record of text.split('\n\n')) {
		const lines = record.split('\n');
		const eventLine = lines.find((line) => line.startsWith('event: '));
		const dataLine = lines.find((line) => line.startsWith('data: '));
		if (eventLine === undefined || dataLine === undefined) continue; // heartbeats
		frames.push({
			event: eventLine.slice(7).trim(),
			data: JSON.parse(dataLine.slice(6)) as Record<string, unknown>,
		});
	}
	return frames;
}

describe('agent_chat_stream — SSE protocol', () => {
	test('fail-closed: master switch OFF refuses with plain JSON, no stream', async () => {
		process.env.DEDALO_AGENT_HTTP_ENABLED = '';
		try {
			const result = await dispatchRqo(
				chatRqo('agent_chat_stream', { question: 'hi' }),
				contextFor(admin) as never,
			);
			expect(result.status).toBe(400);
			expect(result.stream).toBeUndefined();
		} finally {
			process.env.DEDALO_AGENT_HTTP_ENABLED = 'true';
		}
	});

	test('validation failures return JSON denied() BEFORE the stream opens', async () => {
		const noQuestion = await dispatchRqo(
			chatRqo('agent_chat_stream', {}),
			contextFor(admin) as never,
		);
		expect(noQuestion.status).toBe(400);
		expect(noQuestion.stream).toBeUndefined();

		const badHistory = await dispatchRqo(
			chatRqo('agent_chat_stream', { question: 'q', history: [{ role: 'tool', text: 'x' }] }),
			contextFor(admin) as never,
		);
		expect(badHistory.status).toBe(400);
		expect(badHistory.stream).toBeUndefined();
	});

	test('a session + CSRF are required (normal dispatch gates run in front)', async () => {
		const noSession = await dispatchRqo(
			chatRqo('agent_chat_stream', { question: 'q' }),
			contextFor(null) as never,
		);
		expect(noSession.status).toBeGreaterThanOrEqual(400);
		expect(noSession.stream).toBeUndefined();

		const badCsrf = await dispatchRqo(
			chatRqo('agent_chat_stream', { question: 'q' }),
			contextFor(admin, 'wrong-token') as never,
		);
		expect(badCsrf.status).toBeGreaterThanOrEqual(400);
		expect(badCsrf.stream).toBeUndefined();
	});

	test('the frame protocol: start → iteration/tool activity → text deltas → final', async () => {
		const result = await dispatchRqo(
			chatRqo('agent_chat_stream', {
				question: 'say hello',
				history: [
					{ role: 'user', text: 'earlier q' },
					{ role: 'assistant', text: 'earlier a' },
				],
			}),
			contextFor(admin) as never,
		);
		expect(result.status).toBe(200);
		expect(result.streamHeaders?.['Content-Type']).toStartWith('text/event-stream');
		expect(result.stream).toBeDefined();

		const frames = await readFrames(result.stream as ReadableStream<Uint8Array>);
		const types = frames.map((frame) => frame.event);

		expect(types[0]).toBe('start');
		expect(frames[0]?.data).toEqual({ model: 'scripted', mode: 'read', egress: 'local' });
		expect(types).toContain('iteration');
		expect(types).toContain('tool_use');
		expect(types).toContain('tool_result');
		expect(types).toContain('thinking');
		expect(types[types.length - 1]).toBe('final');
		expect(types.indexOf('tool_use')).toBeLessThan(types.indexOf('tool_result'));

		const toolUse = frames.find((frame) => frame.event === 'tool_use');
		expect(toolUse?.data.name).toBe('not_a_tool');
		const toolResult = frames.find((frame) => frame.event === 'tool_result');
		expect(toolResult?.data.ok).toBe(false);

		// text deltas concatenate to the final answer
		const deltas = frames
			.filter((frame) => frame.event === 'text')
			.map((frame) => frame.data.delta)
			.join('');
		expect(deltas).toBe('Hello');

		const final = frames[frames.length - 1]?.data as {
			answer: string;
			stop: string;
			history: { role: string; text: string }[];
			usage: Record<string, number>;
			model: string;
			change_plan: unknown;
			transcript_summary: unknown[];
		};
		expect(final.answer).toBe('Hello');
		expect(final.stop).toBe('end_turn');
		expect(final.model).toBe('scripted');
		expect(final.change_plan).toBeNull();
		expect(final.usage.output_tokens).toBe(2);
		expect(Array.isArray(final.transcript_summary)).toBe(true);
		// resendable history: prior turns + this exchange
		expect(final.history).toEqual([
			{ role: 'user', text: 'earlier q' },
			{ role: 'assistant', text: 'earlier a' },
			{ role: 'user', text: 'say hello' },
			{ role: 'assistant', text: 'Hello' },
		]);
	});
});

describe('agent_models — gated, secret-free', () => {
	test('fail-closed behind the master switch', async () => {
		process.env.DEDALO_AGENT_HTTP_ENABLED = '';
		try {
			const result = await dispatchRqo(chatRqo('agent_models', {}), contextFor(admin) as never);
			expect(result.status).toBe(400);
		} finally {
			process.env.DEDALO_AGENT_HTTP_ENABLED = 'true';
		}
	});

	test('returns the public projection + write availability; never leaks secrets', async () => {
		process.env.DEDALO_AGENT_MODELS = JSON.stringify([
			{
				id: 'local-llm',
				label: 'Local LLM',
				provider: 'openai_compatible',
				model: 'native-secret-model',
				endpoint: 'http://internal-host:8000/v1/chat/completions',
				api_key_env: 'SECRET_LOCAL_API_KEY',
				egress: 'local',
			},
		]);
		try {
			const result = await dispatchRqo(chatRqo('agent_models', {}), contextFor(admin) as never);
			expect(result.status).toBe(200);
			const data = (result.body as { data: { models: unknown[]; write_allowed: boolean } }).data;
			expect(data.models).toEqual([
				{ id: 'local-llm', label: 'Local LLM', egress: 'local', vision: false, default: true },
			]);
			// admin principals never get write mode (confused-deputy wall)
			expect(data.write_allowed).toBe(false);
			const serialized = JSON.stringify(result.body);
			expect(serialized).not.toContain('internal-host');
			expect(serialized).not.toContain('SECRET_LOCAL_API_KEY');
			expect(serialized).not.toContain('native-secret-model');
		} finally {
			// biome-ignore lint/performance/noDelete: assigning undefined coerces to the STRING 'undefined' — only delete truly unsets the key
			delete process.env.DEDALO_AGENT_MODELS;
		}
	});
});

describe('agent_chat — model + vision validation', () => {
	test('an unknown model id is refused with a clear message', async () => {
		const result = await dispatchRqo(
			chatRqo('agent_chat', { question: 'q', model: 'nope' }),
			contextFor(admin) as never,
		);
		expect(result.status).toBe(400);
		expect((result.body as { msg: string }).msg).toContain('Unknown model');
	});

	test('images on a vision:false model are refused, not silently stripped', async () => {
		const result = await dispatchRqo(
			chatRqo('agent_chat', {
				question: 'what is this?',
				model: 'novision',
				images: [{ media_type: 'image/png', data_base64: 'AAAA' }],
			}),
			contextFor(admin) as never,
		);
		expect(result.status).toBe(400);
		expect((result.body as { msg: string }).msg).toContain('does not accept images');
	});

	test('agent_chat returns model/usage/history alongside the answer', async () => {
		const result = await dispatchRqo(
			chatRqo('agent_chat', { question: 'say hello' }),
			contextFor(admin) as never,
		);
		expect(result.status).toBe(200);
		const data = (
			result.body as {
				data: { answer: string; model: string; usage: unknown; history: unknown[] };
			}
		).data;
		expect(data.answer).toBe('Hello');
		expect(data.model).toBe('scripted');
		expect(data.history).toEqual([
			{ role: 'user', text: 'say hello' },
			{ role: 'assistant', text: 'Hello' },
		]);
	});
});
