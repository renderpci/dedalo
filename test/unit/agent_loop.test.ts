/**
 * Phase 8 gate: the agent loop — tool-use loop over the ACL-gated handlers.
 *
 * Runs fully OFFLINE via a deterministic SCRIPTED provider (the LLM seam):
 * the script requests real tool calls, the loop executes them against the
 * live DB under the caller's Principal, and the results flow back into the
 * transcript. The DoD assertions: the SAME scripted trajectory yields data
 * for an authorized user and an empty/denied result for a user the human
 * API denies; the iteration cap ends runaway loops; the fail-closed
 * Anthropic provider refuses to construct without credentials.
 */

import { describe, expect, test } from 'bun:test';
import type {
	AgentAssistantTurn,
	AgentLlmProvider,
	AgentTranscriptEntry,
} from '../../src/ai/agent/llm_provider.ts';
import { runAgent } from '../../src/ai/agent/loop.ts';
import type { Principal } from '../../src/core/security/permissions.ts';

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
const NO_ACCESS: Principal = { userId: 999999, isGlobalAdmin: false, isDeveloper: false };

/** Deterministic provider: plays back a fixed script of assistant turns. */
class ScriptedProvider implements AgentLlmProvider {
	readonly name = 'scripted';
	readonly seenTranscripts: AgentTranscriptEntry[][] = [];
	private turnIndex = 0;

	constructor(private readonly script: AgentAssistantTurn[]) {}

	async createTurn(request: { transcript: AgentTranscriptEntry[] }): Promise<AgentAssistantTurn> {
		this.seenTranscripts.push([...request.transcript]);
		const turn = this.script[Math.min(this.turnIndex, this.script.length - 1)];
		this.turnIndex++;
		return turn as AgentAssistantTurn;
	}
}

/** Script: search the Cecas section, then answer from the result. */
function searchThenAnswerScript(): AgentAssistantTurn[] {
	return [
		{
			text: '',
			tool_uses: [
				{
					id: 'toolu_1',
					name: 'dedalo_search_section',
					input: { section_tipo: 'numisdata4', limit: 3 },
				},
			],
			stop_reason: 'tool_use',
		},
		{ text: 'FINAL ANSWER', tool_uses: [], stop_reason: 'end_turn' },
	];
}

describe('agent loop (Phase 8 gate — offline scripted provider)', () => {
	test('executes real tool calls under the principal and feeds results back', async () => {
		const provider = new ScriptedProvider(searchThenAnswerScript());
		const run = await runAgent(SUPERUSER, 'How many cecas are there?', provider);

		expect(run.stop).toBe('end_turn');
		expect(run.answer).toBe('FINAL ANSWER');

		// The second model turn saw the REAL tool result from the live DB.
		const secondTranscript = provider.seenTranscripts[1] as AgentTranscriptEntry[];
		const resultsEntry = secondTranscript.find((entry) => entry.role === 'tool_results');
		expect(resultsEntry).toBeDefined();
		const result = (resultsEntry as { results: { content: string; is_error: boolean }[] })
			.results[0];
		expect(result?.is_error).toBe(false);
		// Tool results reach the model as the shared structured envelope.
		const envelope = JSON.parse(result?.content as string) as {
			ok: boolean;
			data: { total: number; hits: unknown[] };
		};
		expect(envelope.ok).toBe(true);
		expect(envelope.data.total).toBeGreaterThan(0);
		expect(envelope.data.hits.length).toBeGreaterThan(0);
	});

	test('a user the human API denies gets NOTHING from the same trajectory (DoD)', async () => {
		const provider = new ScriptedProvider(searchThenAnswerScript());
		const run = await runAgent(NO_ACCESS, 'How many cecas are there?', provider);

		const secondTranscript = provider.seenTranscripts[1] as AgentTranscriptEntry[];
		const resultsEntry = secondTranscript.find((entry) => entry.role === 'tool_results') as {
			results: { content: string; is_error: boolean }[];
		};
		const result = resultsEntry.results[0] as { content: string; is_error: boolean };
		// Either the tool denies loudly (is_error) or returns ZERO hits — never data.
		if (result.is_error) {
			expect(result.content.length).toBeGreaterThan(0);
		} else {
			const envelope = JSON.parse(result.content) as {
				ok: boolean;
				data: { total: number; hits: unknown[] };
			};
			expect(envelope.ok).toBe(true);
			expect(envelope.data.total).toBe(0);
			expect(envelope.data.hits).toEqual([]);
		}
		expect(run.stop).toBe('end_turn');
	});

	test('unknown tools return is_error results (the model can adapt)', async () => {
		const provider = new ScriptedProvider([
			{
				text: '',
				tool_uses: [{ id: 'toolu_x', name: 'not_a_tool', input: {} }],
				stop_reason: 'tool_use',
			},
			{ text: 'ok', tool_uses: [], stop_reason: 'end_turn' },
		]);
		await runAgent(SUPERUSER, 'q', provider);
		const secondTranscript = provider.seenTranscripts[1] as AgentTranscriptEntry[];
		const resultsEntry = secondTranscript.find((entry) => entry.role === 'tool_results') as {
			results: { content: string; is_error: boolean }[];
		};
		expect(resultsEntry.results[0]?.is_error).toBe(true);
	});

	test('the iteration cap ends a runaway loop', async () => {
		// A provider that ALWAYS asks for another tool call.
		const provider = new ScriptedProvider([
			{
				text: '',
				tool_uses: [{ id: 't', name: 'dedalo_describe_node', input: { tipo: 'numisdata4' } }],
				stop_reason: 'tool_use',
			},
		]);
		const run = await runAgent(SUPERUSER, 'loop forever', provider);
		expect(run.stop).toBe('max_iterations');
	});

	test('onEvent reports iteration + tool activity in order (streaming surface feed)', async () => {
		const { summarizeToolArgs } = await import('../../src/ai/agent/loop.ts');
		const provider = new ScriptedProvider(searchThenAnswerScript());
		const events: { type: string; name?: string; ok?: boolean }[] = [];
		await runAgent(SUPERUSER, 'q', provider, {
			onEvent: (event) => events.push(event as { type: string }),
		});
		const types = events.map((event) => event.type);
		expect(types[0]).toBe('iteration');
		expect(types).toContain('tool_use');
		expect(types).toContain('tool_result');
		expect(types.indexOf('tool_use')).toBeLessThan(types.indexOf('tool_result'));
		const toolResult = events.find((event) => event.type === 'tool_result') as { ok: boolean };
		expect(toolResult.ok).toBe(true);
		// the human-readable summary helper is pure and capped
		const summary = summarizeToolArgs({ section_tipo: 'oh1', query: 'x'.repeat(300) });
		expect(summary).toContain('section_tipo=oh1');
		expect(summary.length).toBeLessThanOrEqual(140);
	});

	test('the Anthropic provider fails closed without credentials', async () => {
		// S3-68: the old `if (process.env.ANTHROPIC_API_KEY) return` guard was
		// INVERTED coverage — the no-key error path silently no-oped on any
		// machine that HAS a key (the common case here). Mask the key instead:
		// an empty process-env value beats ../private/.env in readEnv and the
		// provider treats '' as absent, so this assertion runs EVERYWHERE.
		const { AnthropicProvider } = await import('../../src/ai/agent/anthropic_provider.ts');
		const saved = process.env.ANTHROPIC_API_KEY;
		process.env.ANTHROPIC_API_KEY = '';
		try {
			expect(() => new AnthropicProvider()).toThrow(/ANTHROPIC_API_KEY/);
		} finally {
			// biome-ignore lint/performance/noDelete: assigning undefined leaves the STRING 'undefined' in process.env
			if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
			else process.env.ANTHROPIC_API_KEY = saved;
		}
	});
});
