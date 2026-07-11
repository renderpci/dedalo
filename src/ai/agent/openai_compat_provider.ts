/**
 * OpenAI-compatible chat-completions provider for the agent loop — the
 * "local model" leg of the model catalog (Ollama, vLLM, LM Studio, llama.cpp
 * server, or any OpenAI-compatible API). Unlike the RAG HttpLlmProvider
 * (single grounded-QA shot), this one speaks the full TOOL-USE turn contract
 * of AgentLlmProvider; it reuses the same transport patterns (injectable
 * fetch, abort timeout, tolerant extraction) without touching the RAG module.
 *
 * EGRESS is the caller's decision (the model catalog classifies each entry
 * external|local); this class only performs transport.
 *
 * Known server quirks tolerated (each has a test vector):
 *  - `function.arguments` arriving as an OBJECT instead of a JSON string;
 *  - the whole `tool_calls` array arriving in one final chunk;
 *  - missing tool-call `id` (synthesized — ids only need in-transcript
 *    consistency);
 *  - `finish_reason: "stop"` on turns that DID emit tool calls.
 */

import type {
	AgentAssistantTurn,
	AgentImage,
	AgentLlmProvider,
	AgentToolDefinition,
	AgentToolUse,
	AgentTranscriptEntry,
	AgentTurnDelta,
	AgentTurnUsage,
} from './llm_provider.ts';

export interface OpenAiCompatConfig {
	endpoint: string;
	model: string;
	apiKey?: string;
	maxTokens?: number;
	/** Idle timeout: aborts when no bytes arrive for this long (default 120s). */
	timeoutMs?: number;
	/** Injectable fetch (defaults to global fetch). For tests. */
	fetchImpl?: typeof fetch;
}

export class OpenAiCompatProvider implements AgentLlmProvider {
	readonly name = 'openai_compatible';
	private readonly fetchImpl: typeof fetch;

	constructor(private readonly cfg: OpenAiCompatConfig) {
		this.fetchImpl = cfg.fetchImpl ?? fetch;
	}

	async createTurn(
		request: {
			system: string;
			tools: AgentToolDefinition[];
			transcript: AgentTranscriptEntry[];
		},
		onDelta?: (delta: AgentTurnDelta) => void,
	): Promise<AgentAssistantTurn> {
		const body = buildChatCompletionsRequest({
			model: this.cfg.model,
			maxTokens: this.cfg.maxTokens ?? 4096,
			system: request.system,
			tools: request.tools,
			transcript: request.transcript,
			stream: onDelta !== undefined,
		});

		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (this.cfg.apiKey) headers.Authorization = `Bearer ${this.cfg.apiKey}`;

		const controller = new AbortController();
		const timeoutMs = this.cfg.timeoutMs ?? 120_000;
		let idleTimer = setTimeout(() => controller.abort(), timeoutMs);
		const touch = () => {
			clearTimeout(idleTimer);
			idleTimer = setTimeout(() => controller.abort(), timeoutMs);
		};

		try {
			const response = await this.fetchImpl(this.cfg.endpoint, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: controller.signal,
			});
			if (!response.ok) {
				const detail = await response.text().catch(() => '');
				throw new Error(`agent_llm_http_${response.status}: ${detail.slice(0, 300)}`);
			}
			if (onDelta !== undefined && response.body !== null) {
				return await this.consumeStream(response.body, onDelta, touch);
			}
			touch();
			const decoded = (await response.json()) as unknown;
			return parseChatCompletion(decoded);
		} finally {
			clearTimeout(idleTimer);
		}
	}

	private async consumeStream(
		body: ReadableStream<Uint8Array>,
		onDelta: (delta: AgentTurnDelta) => void,
		touch: () => void,
	): Promise<AgentAssistantTurn> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		const acc = new ToolCallAccumulator();
		let text = '';
		let finishReason: string | null = null;
		let usage: AgentTurnUsage | undefined;
		let buffer = '';

		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			touch();
			buffer += decoder.decode(value, { stream: true });
			// SSE records are separated by a blank line; process complete lines.
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';
			for (const rawLine of lines) {
				const line = rawLine.trim();
				if (!line.startsWith('data:')) continue;
				const data = line.slice(5).trim();
				if (data === '' || data === '[DONE]') continue;
				let chunk: unknown;
				try {
					chunk = JSON.parse(data);
				} catch {
					continue; // tolerate partial/garbage frames from lax servers
				}
				if (!isObject(chunk)) continue;
				const choice = firstChoice(chunk);
				if (choice !== null) {
					const delta = isObject(choice.delta) ? choice.delta : undefined;
					if (delta !== undefined) {
						if (typeof delta.content === 'string' && delta.content !== '') {
							text += delta.content;
							onDelta({ type: 'text_delta', text: delta.content });
						}
						if (Array.isArray(delta.tool_calls)) {
							acc.addFragments(delta.tool_calls, (name) =>
								onDelta({ type: 'tool_input_start', name }),
							);
						}
					}
					if (typeof choice.finish_reason === 'string') {
						finishReason = choice.finish_reason;
					}
				}
				const chunkUsage = extractUsage(chunk);
				if (chunkUsage !== undefined) usage = chunkUsage;
			}
		}

		const toolUses = acc.finish();
		return {
			text,
			tool_uses: toolUses,
			stop_reason: mapFinishReason(finishReason, toolUses.length > 0),
			...(usage !== undefined ? { usage } : {}),
		};
	}
}

/** Pure request builder — exported for the offline wire-shape gate. */
export function buildChatCompletionsRequest(params: {
	model: string;
	maxTokens: number;
	system: string;
	tools: AgentToolDefinition[];
	transcript: AgentTranscriptEntry[];
	stream: boolean;
}): Record<string, unknown> {
	const messages: Record<string, unknown>[] = [{ role: 'system', content: params.system }];
	for (const entry of params.transcript) {
		if (entry.role === 'user') {
			messages.push({ role: 'user', content: toUserContent(entry.text, entry.images) });
		} else if (entry.role === 'assistant') {
			const message: Record<string, unknown> = { role: 'assistant' };
			message.content = entry.turn.text === '' ? null : entry.turn.text;
			if (entry.turn.tool_uses.length > 0) {
				message.tool_calls = entry.turn.tool_uses.map((use) => ({
					id: use.id,
					type: 'function',
					function: { name: use.name, arguments: JSON.stringify(use.input) },
				}));
			}
			messages.push(message);
		} else {
			for (const result of entry.results) {
				messages.push({
					role: 'tool',
					tool_call_id: result.tool_use_id,
					content: result.content,
				});
			}
		}
	}
	const body: Record<string, unknown> = {
		model: params.model,
		max_tokens: params.maxTokens,
		messages,
	};
	if (params.tools.length > 0) {
		body.tools = params.tools.map((tool) => ({
			type: 'function',
			function: {
				name: tool.name,
				description: tool.description,
				parameters: tool.input_schema,
			},
		}));
	}
	if (params.stream) {
		body.stream = true;
		// Ask for usage on the final chunk where supported; harmless elsewhere.
		body.stream_options = { include_usage: true };
	}
	return body;
}

/** Parse a NON-streaming chat-completions response into an agent turn. */
export function parseChatCompletion(decoded: unknown): AgentAssistantTurn {
	if (!isObject(decoded)) throw new Error('agent_llm_bad_response');
	const choice = firstChoice(decoded);
	if (choice === null) throw new Error('agent_llm_bad_response');
	const message = isObject(choice.message) ? choice.message : {};
	const text = typeof message.content === 'string' ? message.content : '';
	const acc = new ToolCallAccumulator();
	if (Array.isArray(message.tool_calls)) {
		acc.addFragments(message.tool_calls, () => {});
	}
	const toolUses = acc.finish();
	const finishReason = typeof choice.finish_reason === 'string' ? choice.finish_reason : null;
	const usage = extractUsage(decoded);
	return {
		text,
		tool_uses: toolUses,
		stop_reason: mapFinishReason(finishReason, toolUses.length > 0),
		...(usage !== undefined ? { usage } : {}),
	};
}

function mapFinishReason(
	finishReason: string | null,
	hasToolCalls: boolean,
): AgentAssistantTurn['stop_reason'] {
	if (hasToolCalls) return 'tool_use'; // some servers say "stop" despite tool calls
	if (finishReason === 'tool_calls') return 'tool_use';
	if (finishReason === 'length') return 'max_tokens';
	return 'end_turn';
}

/** Chat-completions vision content (data URLs for base64 images). */
function toUserContent(text: string, images?: AgentImage[]): unknown {
	if (images === undefined || images.length === 0) return text;
	const parts: Record<string, unknown>[] = images.map((image) => ({
		type: 'image_url',
		image_url: {
			url: 'url' in image ? image.url : `data:${image.media_type};base64,${image.data_base64}`,
		},
	}));
	parts.push({ type: 'text', text });
	return parts;
}

/**
 * Accumulates tool-call fragments across streaming chunks (or swallows a
 * complete array in one go). Keyed by the OpenAI `index` field; missing ids
 * are synthesized at finish().
 */
class ToolCallAccumulator {
	private readonly byIndex = new Map<number, { id?: string; name: string; args: string }>();
	private readonly announced = new Set<number>();

	addFragments(fragments: unknown[], onStart: (name: string) => void): void {
		for (let i = 0; i < fragments.length; i++) {
			const fragment = fragments[i];
			if (!isObject(fragment)) continue;
			const index = typeof fragment.index === 'number' ? fragment.index : i;
			let slot = this.byIndex.get(index);
			if (slot === undefined) {
				slot = { name: '', args: '' };
				this.byIndex.set(index, slot);
			}
			if (typeof fragment.id === 'string' && fragment.id !== '') slot.id = fragment.id;
			const fn = isObject(fragment.function) ? fragment.function : undefined;
			if (fn !== undefined) {
				if (typeof fn.name === 'string' && fn.name !== '') {
					slot.name += fn.name;
					if (!this.announced.has(index)) {
						this.announced.add(index);
						onStart(slot.name);
					}
				}
				// Quirk: `arguments` may be a ready-made object instead of a string.
				if (typeof fn.arguments === 'string') slot.args += fn.arguments;
				else if (isObject(fn.arguments)) slot.args = JSON.stringify(fn.arguments);
			}
		}
	}

	finish(): AgentToolUse[] {
		const uses: AgentToolUse[] = [];
		const indexes = [...this.byIndex.keys()].sort((a, b) => a - b);
		for (const index of indexes) {
			const slot = this.byIndex.get(index);
			if (slot === undefined || slot.name === '') continue;
			let input: Record<string, unknown>;
			try {
				const parsed: unknown = slot.args === '' ? {} : JSON.parse(slot.args);
				input = isObject(parsed) ? parsed : { raw: slot.args };
			} catch {
				input = { raw: slot.args };
			}
			uses.push({ id: slot.id ?? `call_${index}`, name: slot.name, input });
		}
		return uses;
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function firstChoice(decoded: Record<string, unknown>): Record<string, unknown> | null {
	const choices = decoded.choices;
	if (Array.isArray(choices) && choices.length > 0 && isObject(choices[0])) {
		return choices[0];
	}
	return null;
}

function extractUsage(decoded: Record<string, unknown>): AgentTurnUsage | undefined {
	const usage = decoded.usage;
	if (!isObject(usage)) return undefined;
	const out: AgentTurnUsage = {};
	const inTok = usage.prompt_tokens ?? usage.input_tokens;
	const outTok = usage.completion_tokens ?? usage.output_tokens;
	if (typeof inTok === 'number') out.input_tokens = inTok;
	if (typeof outTok === 'number') out.output_tokens = outTok;
	return Object.keys(out).length > 0 ? out : undefined;
}
