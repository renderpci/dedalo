/**
 * Gate: the agent egress gate — record content never reaches an EXTERNAL
 * model provider when policy restricts it. Asserts: the pre-execution gate
 * refuses gated tools BEFORE any handler runs (fail-closed, incl. an
 * unclassifiable call); structure tools pass; local conversations are never
 * gated; semantic-search hits are filtered per record with an honest
 * restricted_hits_removed count; the env policy is default-deny
 * (DEDALO_AGENT_ALLOW_EXTERNAL_PROVIDER_DEFAULT unset ⇒ everything
 * restricted) and shares the RAG forbidden-sections list.
 */

import { describe, expect, test } from 'bun:test';
import {
	type AgentEgressOptions,
	buildAgentEgressPolicy,
	collectSectionTipos,
	filterEgressHits,
	gateAgentToolCall,
	gateAgentToolResult,
} from '../../src/ai/agent/egress.ts';
import type {
	AgentAssistantTurn,
	AgentLlmProvider,
	AgentTranscriptEntry,
} from '../../src/ai/agent/llm_provider.ts';
import { runAgent } from '../../src/ai/agent/loop.ts';
import type { Principal } from '../../src/core/security/permissions.ts';

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };

const RESTRICT_ALL: AgentEgressOptions = {
	external: true,
	policy: async () => 'restricted' as const,
};
const ALLOW_ALL: AgentEgressOptions = {
	external: true,
	policy: async () => 'public' as const,
};
const LOCAL: AgentEgressOptions = {
	external: false,
	policy: async () => 'restricted' as const, // must never even be consulted
};

describe('gateAgentToolCall (pre-execution)', () => {
	test('a gated tool on a restricted section is refused with the coded envelope', async () => {
		const refusal = await gateAgentToolCall(RESTRICT_ALL, 'dedalo_read_record', {
			section_tipo: 'oh1',
			section_id: 42,
		});
		expect(refusal).not.toBeNull();
		expect(refusal?.error.code).toBe('egress_restricted');
		expect(refusal?.error.hint).toContain('local');
	});

	test('fail-closed: a gated tool with no classifiable section is refused', async () => {
		const refusal = await gateAgentToolCall(ALLOW_ALL, 'dedalo_search_records', {});
		expect(refusal?.error.code).toBe('egress_restricted');
	});

	test('structure tools pass regardless of policy', async () => {
		expect(await gateAgentToolCall(RESTRICT_ALL, 'dedalo_list_sections', {})).toBeNull();
		expect(
			await gateAgentToolCall(RESTRICT_ALL, 'dedalo_describe_section', { section_tipo: 'oh1' }),
		).toBeNull();
		expect(await gateAgentToolCall(RESTRICT_ALL, 'dedalo_resolve', { name: 'People' })).toBeNull();
	});

	test('local conversations are never gated (policy not consulted)', async () => {
		expect(
			await gateAgentToolCall(LOCAL, 'dedalo_read_record', { section_tipo: 'oh1', section_id: 1 }),
		).toBeNull();
	});

	test('a public section on an external conversation passes', async () => {
		expect(
			await gateAgentToolCall(ALLOW_ALL, 'dedalo_read_record', {
				section_tipo: 'oh1',
				section_id: 1,
			}),
		).toBeNull();
	});

	test('a filter PATH into a restricted section is refused (inference oracle)', async () => {
		// The rows would come from the PUBLIC section, but the filter tests values
		// in the restricted one — "does a record in secret7 match X?".
		const selective: AgentEgressOptions = {
			external: true,
			policy: async (sectionTipo) => (sectionTipo === 'secret7' ? 'restricted' : 'public'),
		};
		const refusal = await gateAgentToolCall(selective, 'dedalo_search_records', {
			section_tipo: 'oh1',
			filter: {
				and: [
					{
						q: 'Pujol',
						path: [
							{ section_tipo: 'oh1', component_tipo: 'oh24' },
							{ section_tipo: 'secret7', component_tipo: 's7name' },
						],
					},
				],
			},
		});
		expect(refusal?.error.code).toBe('egress_restricted');
		expect(refusal?.error.message).toContain('secret7');
	});

	test('a raw_sqo tree naming a restricted section is refused', async () => {
		const selective: AgentEgressOptions = {
			external: true,
			policy: async (sectionTipo) => (sectionTipo === 'memory9' ? 'restricted' : 'public'),
		};
		const refusal = await gateAgentToolCall(selective, 'dedalo_search_records', {
			section_tipo: 'oh1',
			raw_sqo: { section_tipo: 'oh1', filter: { q: 'x', path: [{ section_tipo: 'memory9' }] } },
		});
		expect(refusal?.error.code).toBe('egress_restricted');
	});

	test('a filter path within PUBLIC sections still passes', async () => {
		expect(
			await gateAgentToolCall(ALLOW_ALL, 'dedalo_search_records', {
				section_tipo: 'oh1',
				filter: { and: [{ q: 'x', path: [{ section_tipo: 'rsc197' }] }] },
			}),
		).toBeNull();
	});

	test('collectSectionTipos deep-walks arrays and nested objects', () => {
		const found = collectSectionTipos({
			section_tipo: 'a1',
			filter: { or: [{ path: [{ section_tipo: 'b2' }] }, { and: [{ section_tipo: 'c3' }] }] },
			noise: [1, 'x', null, { section_tipo: '' }],
		});
		expect([...found].sort()).toEqual(['a1', 'b2', 'c3']);
	});
});

describe('gateAgentToolResult (post-execution — portal-resolved labels)', () => {
	test('a PUBLIC record whose result references a restricted section is refused', async () => {
		// readSectionRecord resolves portal components to the LABELS of linked
		// records; a public record linked to a restricted one would otherwise
		// carry that restricted label into the external model context.
		const selective: AgentEgressOptions = {
			external: true,
			policy: async (sectionTipo) => (sectionTipo === 'secret7' ? 'restricted' : 'public'),
		};
		const envelope = {
			ok: true,
			data: {
				section_tipo: 'oh1',
				section_id: 5,
				components: [
					{ tipo: 'oh24', value: [{ section_tipo: 'secret7', section_id: 9, label: 'Informant' }] },
				],
			},
		};
		const refusal = await gateAgentToolResult(selective, 'dedalo_read_record', envelope);
		expect(refusal?.error.code).toBe('egress_restricted');
		expect(refusal?.error.message).toContain('secret7');
	});

	test('a result referencing only public sections passes', async () => {
		const envelope = {
			ok: true,
			data: { section_tipo: 'oh1', related: [{ section_tipo: 'rsc197' }] },
		};
		expect(await gateAgentToolResult(ALLOW_ALL, 'dedalo_read_record', envelope)).toBeNull();
	});

	test('structure-exempt tools and local conversations are not scrubbed', async () => {
		const envelope = { ok: true, data: { section_tipo: 'secret7' } };
		expect(await gateAgentToolResult(RESTRICT_ALL, 'dedalo_list_sections', envelope)).toBeNull();
		expect(await gateAgentToolResult(LOCAL, 'dedalo_read_record', envelope)).toBeNull();
	});
});

describe('filterEgressHits (semantic search, post-execution)', () => {
	const hits = [
		{ section_tipo: 'oh1', section_id: 1, snippet: 'public one' },
		{ section_tipo: 'secret7', section_id: 2, snippet: 'private' },
		{ section_tipo: 'oh1', section_id: 3, snippet: 'public two' },
	];

	test('restricted hits are dropped with an honest removed count', async () => {
		const selective: AgentEgressOptions = {
			external: true,
			policy: async (sectionTipo) => (sectionTipo === 'secret7' ? 'restricted' : 'public'),
		};
		const { allowed, removed } = await filterEgressHits(selective, hits);
		expect(removed).toBe(1);
		expect(allowed.map((hit) => hit.section_id)).toEqual([1, 3]);
	});

	test('local conversations pass everything through untouched', async () => {
		const { allowed, removed } = await filterEgressHits(LOCAL, hits);
		expect(removed).toBe(0);
		expect(allowed).toBe(hits);
	});
});

describe('buildAgentEgressPolicy (env, default-deny)', () => {
	test('unset opt-in ⇒ EVERYTHING is restricted (fail-closed default)', async () => {
		const policy = buildAgentEgressPolicy({});
		expect(await policy('oh1', 1)).toBe('restricted');
	});

	test('opt-in true ⇒ public unless on the SHARED RAG forbidden list', async () => {
		const policy = buildAgentEgressPolicy({
			DEDALO_AGENT_ALLOW_EXTERNAL_PROVIDER_DEFAULT: 'true',
			DEDALO_RAG_EXTERNAL_PROVIDER_FORBIDDEN_SECTIONS: 'secret7, memory9',
		});
		expect(await policy('oh1', 1)).toBe('public');
		expect(await policy('secret7', 1)).toBe('restricted');
		expect(await policy('memory9', 1)).toBe('restricted');
	});

	test('a throwing publishable hook fails closed', async () => {
		const policy = buildAgentEgressPolicy(
			{ DEDALO_AGENT_ALLOW_EXTERNAL_PROVIDER_DEFAULT: 'true' },
			() => {
				throw new Error('classifier down');
			},
		);
		expect(await policy('oh1', 1)).toBe('restricted');
	});
});

class ScriptedProvider implements AgentLlmProvider {
	readonly name = 'scripted';
	readonly seenTranscripts: AgentTranscriptEntry[][] = [];
	private turnIndex = 0;
	constructor(private readonly script: AgentAssistantTurn[]) {}
	async createTurn(request: {
		transcript: AgentTranscriptEntry[];
	}): Promise<AgentAssistantTurn> {
		this.seenTranscripts.push([...request.transcript]);
		const turn = this.script[Math.min(this.turnIndex, this.script.length - 1)];
		this.turnIndex++;
		return turn as AgentAssistantTurn;
	}
}

describe('loop integration — external conversations get NO restricted record content', () => {
	test('a read_record call under restrict-all comes back egress_restricted, handler unrun', async () => {
		const provider = new ScriptedProvider([
			{
				text: '',
				tool_uses: [
					{
						id: 't1',
						name: 'dedalo_read_record',
						input: { section_tipo: 'numisdata4', section_id: 1 },
					},
				],
				stop_reason: 'tool_use',
			},
			{ text: 'done', tool_uses: [], stop_reason: 'end_turn' },
		]);
		const run = await runAgent(SUPERUSER, 'read it', provider, { egress: RESTRICT_ALL });
		const second = provider.seenTranscripts[1] as AgentTranscriptEntry[];
		const resultsEntry = second.find((entry) => entry.role === 'tool_results') as {
			results: { content: string; is_error: boolean }[];
		};
		const result = resultsEntry.results[0] as { content: string; is_error: boolean };
		expect(result.is_error).toBe(true);
		const envelope = JSON.parse(result.content) as { error: { code: string } };
		// The refusal is the GATE's envelope — had the handler run, a superuser
		// read of a real record would have returned ok:true data instead.
		expect(envelope.error.code).toBe('egress_restricted');
		expect(run.stop).toBe('end_turn');
	});

	test('the SAME call on a local conversation reaches the handler and returns data', async () => {
		const provider = new ScriptedProvider([
			{
				text: '',
				tool_uses: [
					{
						id: 't1',
						name: 'dedalo_search_section',
						input: { section_tipo: 'numisdata4', limit: 1 },
					},
				],
				stop_reason: 'tool_use',
			},
			{ text: 'done', tool_uses: [], stop_reason: 'end_turn' },
		]);
		await runAgent(SUPERUSER, 'search it', provider, { egress: LOCAL });
		const second = provider.seenTranscripts[1] as AgentTranscriptEntry[];
		const resultsEntry = second.find((entry) => entry.role === 'tool_results') as {
			results: { content: string; is_error: boolean }[];
		};
		const result = resultsEntry.results[0] as { content: string; is_error: boolean };
		expect(result.is_error).toBe(false);
		const envelope = JSON.parse(result.content) as { ok: boolean };
		expect(envelope.ok).toBe(true);
	});
});
