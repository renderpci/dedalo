/**
 * Gate: stateless multi-turn — the caller resends text-only history; the loop
 * threads it AHEAD of the current question as plain transcript entries (no
 * tool traffic is ever replayed), prepends the volatile context block to THIS
 * turn only, and returns the ready-to-resend history for the next turn.
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

class ScriptedProvider implements AgentLlmProvider {
	readonly name = 'scripted';
	readonly seenTranscripts: AgentTranscriptEntry[][] = [];
	readonly seenSystems: string[] = [];
	private turnIndex = 0;

	constructor(private readonly script: AgentAssistantTurn[]) {}

	async createTurn(request: {
		system: string;
		transcript: AgentTranscriptEntry[];
	}): Promise<AgentAssistantTurn> {
		this.seenTranscripts.push([...request.transcript]);
		this.seenSystems.push(request.system);
		const turn = this.script[Math.min(this.turnIndex, this.script.length - 1)];
		this.turnIndex++;
		return turn as AgentAssistantTurn;
	}
}

const ANSWER: AgentAssistantTurn = { text: 'THE ANSWER', tool_uses: [], stop_reason: 'end_turn' };

describe('multi-turn threading (stateless)', () => {
	test('history entries map onto plain transcript entries AHEAD of the question', async () => {
		const provider = new ScriptedProvider([ANSWER]);
		await runAgent(SUPERUSER, 'third question', provider, {
			history: [
				{ role: 'user', text: 'first question' },
				{ role: 'assistant', text: 'first answer' },
			],
		});
		const transcript = provider.seenTranscripts[0] as AgentTranscriptEntry[];
		expect(transcript.length).toBe(3);
		expect(transcript[0]).toEqual({ role: 'user', text: 'first question' });
		// assistant history becomes a plain end_turn turn with NO tool traffic
		expect(transcript[1]).toEqual({
			role: 'assistant',
			turn: { text: 'first answer', tool_uses: [], stop_reason: 'end_turn' },
		});
		expect((transcript[2] as { text: string }).text).toBe('third question');
	});

	test('the result returns ready-to-resend history (prior + this turn)', async () => {
		const provider = new ScriptedProvider([ANSWER]);
		const run = await runAgent(SUPERUSER, 'q2', provider, {
			history: [
				{ role: 'user', text: 'q1' },
				{ role: 'assistant', text: 'a1' },
			],
		});
		expect(run.history).toEqual([
			{ role: 'user', text: 'q1' },
			{ role: 'assistant', text: 'a1' },
			{ role: 'user', text: 'q2' },
			{ role: 'assistant', text: 'THE ANSWER' },
		]);
	});

	test('the context block rides on THIS turn only — never into history', async () => {
		const provider = new ScriptedProvider([ANSWER]);
		const run = await runAgent(SUPERUSER, 'what is in this record?', provider, {
			uiContext: { section_tipo: 'oh1', section_id: 42, mode: 'edit' },
		});
		const transcript = provider.seenTranscripts[0] as AgentTranscriptEntry[];
		const sent = (transcript[0] as { text: string }).text;
		expect(sent).toContain('<current_ui_context>');
		expect(sent).toContain('section_tipo=oh1');
		expect(sent.endsWith('what is in this record?')).toBe(true);
		// history keeps the BARE question (byte-stable resends = warm cache)
		expect(run.history[0]).toEqual({ role: 'user', text: 'what is in this record?' });
		// and the system prompt never carries it
		expect(provider.seenSystems[0]).not.toContain('<current_ui_context>');
	});

	test('usage accumulates across turns when the provider reports it', async () => {
		const withUsage = (turn: AgentAssistantTurn, input: number, output: number) => ({
			...turn,
			usage: { input_tokens: input, output_tokens: output },
		});
		const provider = new ScriptedProvider([
			withUsage(
				{
					text: '',
					tool_uses: [{ id: 't1', name: 'not_a_tool', input: {} }],
					stop_reason: 'tool_use',
				},
				100,
				10,
			),
			withUsage(ANSWER, 200, 20),
		]);
		const run = await runAgent(SUPERUSER, 'q', provider);
		expect(run.usage).toEqual({ input_tokens: 300, output_tokens: 30 });
	});
});
