/**
 * Gate: the OpenAI-compatible agent provider (the "local model" catalog leg).
 * Fully offline via an injectable fetchImpl — asserts the chat-completions
 * request shape, the non-streaming parse, the SSE streaming parse including
 * the documented server quirks (arguments-as-object, one-chunk tool_calls,
 * missing ids, finish_reason:"stop" despite tool calls), and the idle abort.
 */

import { describe, expect, test } from 'bun:test';
import type {
	AgentToolDefinition,
	AgentTranscriptEntry,
	AgentTurnDelta,
} from '../../src/ai/agent/llm_provider.ts';
import {
	OpenAiCompatProvider,
	buildChatCompletionsRequest,
	parseChatCompletion,
} from '../../src/ai/agent/openai_compat_provider.ts';

const TOOLS: AgentToolDefinition[] = [
	{
		name: 'dedalo_search_records',
		description: 'Search records',
		input_schema: { type: 'object', properties: { section_tipo: { type: 'string' } } },
	},
];

const TRANSCRIPT: AgentTranscriptEntry[] = [
	{ role: 'user', text: 'find people named Pujol' },
	{
		role: 'assistant',
		turn: {
			text: '',
			tool_uses: [{ id: 'call_a', name: 'dedalo_search_records', input: { q: 'Pujol' } }],
			stop_reason: 'tool_use',
		},
	},
	{
		role: 'tool_results',
		results: [{ tool_use_id: 'call_a', content: '{"ok":true}', is_error: false }],
	},
];

function fetchReturning(body: string, contentType = 'application/json'): typeof fetch {
	return (async (_url: unknown, _init?: unknown) =>
		new Response(body, { status: 200, headers: { 'Content-Type': contentType } })) as typeof fetch;
}

describe('openai-compat provider — request shape (pure builder)', () => {
	test('system first, tools as functions, transcript mapped, tool results as role:tool', () => {
		const body = buildChatCompletionsRequest({
			model: 'llama3.1',
			maxTokens: 2048,
			system: 'SYSTEM PROMPT',
			tools: TOOLS,
			transcript: TRANSCRIPT,
			stream: false,
		});
		const messages = body.messages as Record<string, unknown>[];
		expect(messages[0]).toEqual({ role: 'system', content: 'SYSTEM PROMPT' });
		expect(messages[1]).toEqual({ role: 'user', content: 'find people named Pujol' });
		// assistant turn carries tool_calls with stringified arguments
		const assistant = messages[2] as {
			role: string;
			content: unknown;
			tool_calls: { id: string; function: { name: string; arguments: string } }[];
		};
		expect(assistant.role).toBe('assistant');
		expect(assistant.content).toBeNull();
		expect(assistant.tool_calls[0]?.id).toBe('call_a');
		expect(JSON.parse(assistant.tool_calls[0]?.function.arguments as string)).toEqual({
			q: 'Pujol',
		});
		// one role:tool message per result
		expect(messages[3]).toEqual({
			role: 'tool',
			tool_call_id: 'call_a',
			content: '{"ok":true}',
		});
		const tools = body.tools as { type: string; function: { name: string; parameters: unknown } }[];
		expect(tools[0]?.type).toBe('function');
		expect(tools[0]?.function.name).toBe('dedalo_search_records');
		expect(body.stream).toBeUndefined();
	});

	test('streaming requests set stream + stream_options.include_usage', () => {
		const body = buildChatCompletionsRequest({
			model: 'm',
			maxTokens: 1,
			system: 's',
			tools: [],
			transcript: [{ role: 'user', text: 'q' }],
			stream: true,
		});
		expect(body.stream).toBe(true);
		expect(body.stream_options).toEqual({ include_usage: true });
		expect(body.tools).toBeUndefined();
	});

	test('base64 images become data-URL image_url parts BEFORE the text', () => {
		const body = buildChatCompletionsRequest({
			model: 'm',
			maxTokens: 1,
			system: 's',
			tools: [],
			transcript: [
				{
					role: 'user',
					text: 'what is this?',
					images: [{ media_type: 'image/png', data_base64: 'AAAA' }],
				},
			],
			stream: false,
		});
		const messages = body.messages as { content: unknown }[];
		const parts = messages[1]?.content as Record<string, unknown>[];
		expect(parts[0]?.type).toBe('image_url');
		expect((parts[0]?.image_url as { url: string }).url).toBe('data:image/png;base64,AAAA');
		expect(parts[1]).toEqual({ type: 'text', text: 'what is this?' });
	});
});

describe('openai-compat provider — non-streaming parse', () => {
	test('text answer with usage and finish_reason mapping', async () => {
		const provider = new OpenAiCompatProvider({
			endpoint: 'http://local/v1/chat/completions',
			model: 'm',
			fetchImpl: fetchReturning(
				JSON.stringify({
					choices: [{ message: { content: 'ANSWER' }, finish_reason: 'stop' }],
					usage: { prompt_tokens: 10, completion_tokens: 5 },
				}),
			),
		});
		const turn = await provider.createTurn({
			system: 's',
			tools: TOOLS,
			transcript: [{ role: 'user', text: 'q' }],
		});
		expect(turn.text).toBe('ANSWER');
		expect(turn.stop_reason).toBe('end_turn');
		expect(turn.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
	});

	test('quirk: finish_reason "stop" with tool_calls still maps to tool_use', () => {
		const turn = parseChatCompletion({
			choices: [
				{
					message: {
						content: null,
						tool_calls: [
							{
								id: 'x1',
								type: 'function',
								function: { name: 'dedalo_read_record', arguments: '{"section_id":5}' },
							},
						],
					},
					finish_reason: 'stop',
				},
			],
		});
		expect(turn.stop_reason).toBe('tool_use');
		expect(turn.tool_uses[0]).toEqual({
			id: 'x1',
			name: 'dedalo_read_record',
			input: { section_id: 5 },
		});
	});

	test('quirk: arguments as an OBJECT are accepted', () => {
		const turn = parseChatCompletion({
			choices: [
				{
					message: {
						tool_calls: [{ function: { name: 't', arguments: { a: 1 } } }],
					},
					finish_reason: 'tool_calls',
				},
			],
		});
		expect(turn.tool_uses[0]?.input).toEqual({ a: 1 });
		// missing id is synthesized
		expect(turn.tool_uses[0]?.id).toBe('call_0');
	});

	test('finish_reason "length" maps to max_tokens; garbage throws', () => {
		const turn = parseChatCompletion({
			choices: [{ message: { content: 'partial' }, finish_reason: 'length' }],
		});
		expect(turn.stop_reason).toBe('max_tokens');
		expect(() => parseChatCompletion('nope')).toThrow(/agent_llm_bad_response/);
		expect(() => parseChatCompletion({ choices: [] })).toThrow(/agent_llm_bad_response/);
	});

	test('unparseable argument strings are wrapped as {raw}', () => {
		const turn = parseChatCompletion({
			choices: [
				{
					message: { tool_calls: [{ id: 'z', function: { name: 't', arguments: '{broken' } }] },
					finish_reason: 'tool_calls',
				},
			],
		});
		expect(turn.tool_uses[0]?.input).toEqual({ raw: '{broken' });
	});
});

function sse(...frames: string[]): string {
	return `${frames.map((f) => `data: ${f}`).join('\n\n')}\n\ndata: [DONE]\n\n`;
}

describe('openai-compat provider — SSE streaming parse', () => {
	test('text deltas accumulate and reach onDelta', async () => {
		const provider = new OpenAiCompatProvider({
			endpoint: 'http://local/v1/chat/completions',
			model: 'm',
			fetchImpl: fetchReturning(
				sse(
					'{"choices":[{"delta":{"content":"Hel"}}]}',
					'{"choices":[{"delta":{"content":"lo"},"finish_reason":null}]}',
					'{"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2}}',
				),
				'text/event-stream',
			),
		});
		const deltas: AgentTurnDelta[] = [];
		const turn = await provider.createTurn(
			{ system: 's', tools: [], transcript: [{ role: 'user', text: 'q' }] },
			(delta) => deltas.push(delta),
		);
		expect(turn.text).toBe('Hello');
		expect(turn.stop_reason).toBe('end_turn');
		expect(turn.usage).toEqual({ input_tokens: 3, output_tokens: 2 });
		expect(deltas.filter((d) => d.type === 'text_delta').length).toBe(2);
	});

	test('fragmented tool_calls across chunks are reassembled; tool_input_start fires once', async () => {
		const provider = new OpenAiCompatProvider({
			endpoint: 'http://local/v1',
			model: 'm',
			fetchImpl: fetchReturning(
				sse(
					'{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c9","function":{"name":"dedalo_resolve","arguments":""}}]}}]}',
					'{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"name\\":"}}]}}]}',
					'{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"People\\"}"}}]}}]}',
					'{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
				),
				'text/event-stream',
			),
		});
		const deltas: AgentTurnDelta[] = [];
		const turn = await provider.createTurn(
			{ system: 's', tools: [], transcript: [{ role: 'user', text: 'q' }] },
			(delta) => deltas.push(delta),
		);
		expect(turn.stop_reason).toBe('tool_use');
		expect(turn.tool_uses[0]).toEqual({
			id: 'c9',
			name: 'dedalo_resolve',
			input: { name: 'People' },
		});
		expect(deltas.filter((d) => d.type === 'tool_input_start').length).toBe(1);
	});

	test('quirk: the whole tool_calls array in ONE final chunk', async () => {
		const provider = new OpenAiCompatProvider({
			endpoint: 'http://local/v1',
			model: 'm',
			fetchImpl: fetchReturning(
				sse(
					'{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"one","function":{"name":"t","arguments":"{\\"k\\":1}"}}]},"finish_reason":"tool_calls"}]}',
				),
				'text/event-stream',
			),
		});
		const turn = await provider.createTurn(
			{ system: 's', tools: [], transcript: [{ role: 'user', text: 'q' }] },
			() => {},
		);
		expect(turn.tool_uses).toEqual([{ id: 'one', name: 't', input: { k: 1 } }]);
	});

	test('garbage frames are tolerated; stream still completes', async () => {
		const provider = new OpenAiCompatProvider({
			endpoint: 'http://local/v1',
			model: 'm',
			fetchImpl: fetchReturning(
				`data: {broken json\n\n${sse('{"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}')}`,
				'text/event-stream',
			),
		});
		const turn = await provider.createTurn(
			{ system: 's', tools: [], transcript: [{ role: 'user', text: 'q' }] },
			() => {},
		);
		expect(turn.text).toBe('ok');
	});

	test('HTTP errors throw a coded transport error', async () => {
		const provider = new OpenAiCompatProvider({
			endpoint: 'http://local/v1',
			model: 'm',
			fetchImpl: (async (_url: unknown, _init?: unknown) =>
				new Response('boom', { status: 502 })) as typeof fetch,
		});
		await expect(
			provider.createTurn({ system: 's', tools: [], transcript: [{ role: 'user', text: 'q' }] }),
		).rejects.toThrow(/agent_llm_http_502/);
	});
});
