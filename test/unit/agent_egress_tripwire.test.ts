/**
 * TRIPWIRE: every READ tool the agent loop can execute is EGRESS-CLASSIFIED —
 * either gated by the addressed section (record content), exempt WITH A
 * REASON (ontology structure only), or a LOOP-LOCAL tool covered by the
 * post-execution per-hit filter. This is MECHANICAL — it iterates
 * **AGENT_TOOLS** (the loop's ACTUAL tool surface: registry read tools PLUS
 * every loop-local tool), so a NEW tool of either kind that nobody classified
 * fails here, not by silently shipping record content to an external model
 * provider ("Memory projects" privacy requirement). (2026-07-22: previously
 * only dedalo_semantic_search was hard-coded — a second loop-local tool could
 * have shipped unclassified; sec review 4c.)
 *
 * Method (mirrors mcp_write_scope_tripwire): for each gated tool, a
 * restrict-all policy must refuse the call BEFORE any handler runs; the
 * exemption map requires a reason string, so a future content tool cannot
 * quietly join it. Loop-local RAG tools are covered by filterEgressHits —
 * asserted here on shape INCLUDING the contributor rule (a `rag:` group
 * chunk's snippet carries deep-resolved text from OTHER sections).
 */

import { describe, expect, test } from 'bun:test';
import {
	EGRESS_GATED_READ_TOOLS,
	EGRESS_STRUCTURE_EXEMPT,
	filterEgressHits,
	gateAgentToolCall,
} from '../../src/ai/agent/egress.ts';
import { AGENT_TOOLS } from '../../src/ai/agent/loop.ts';
import { TOOL_REGISTRY } from '../../src/ai/mcp/registry.ts';

const RESTRICT_ALL = { external: true, policy: async () => 'restricted' as const };

/**
 * Loop-local tools (in AGENT_TOOLS but not the registry) whose egress cover is
 * the post-execution per-hit/per-passage filter. Adding a loop-local tool
 * means classifying it HERE (its results must flow through filterEgressHits)
 * or in the egress sets — never nowhere.
 */
const LOOP_LOCAL_HIT_FILTERED = new Set(['dedalo_semantic_search', 'dedalo_retrieve_passages']);

describe('agent egress tripwire (mechanical classification of every read tool)', () => {
	test('every AGENT_TOOLS entry is classified in EXACTLY one bucket', () => {
		const registryNames = new Set(TOOL_REGISTRY.map((spec) => spec.name));
		const loopToolNames = AGENT_TOOLS.map((tool) => tool.name);
		expect(loopToolNames.length).toBeGreaterThanOrEqual(6);
		for (const name of loopToolNames) {
			const gated = EGRESS_GATED_READ_TOOLS.has(name);
			const exempt = name in EGRESS_STRUCTURE_EXEMPT;
			const hitFiltered = LOOP_LOCAL_HIT_FILTERED.has(name);
			const buckets = [gated, exempt, hitFiltered].filter(Boolean).length;
			if (buckets === 0) {
				throw new Error(
					`Unclassified agent tool "${name}": add it to EGRESS_GATED_READ_TOOLS, EGRESS_STRUCTURE_EXEMPT (with a reason), or LOOP_LOCAL_HIT_FILTERED (in this tripwire, with filterEgressHits wired in loop.ts)`,
				);
			}
			if (buckets > 1) {
				throw new Error(`Agent tool "${name}" is in ${buckets} egress buckets — pick one`);
			}
			// a hit-filtered tool must be genuinely loop-local (not a registry tool
			// dodging the pre-execution gate)
			if (hitFiltered && registryNames.has(name)) {
				throw new Error(`"${name}" is a REGISTRY tool — it must use the pre-execution gate`);
			}
		}
	});

	test('no stale classifications: every classified name exists in the registry', () => {
		const known = new Set(TOOL_REGISTRY.map((spec) => spec.name));
		for (const name of EGRESS_GATED_READ_TOOLS) {
			expect(known.has(name)).toBe(true);
		}
		for (const name of Object.keys(EGRESS_STRUCTURE_EXEMPT)) {
			expect(known.has(name)).toBe(true);
		}
	});

	test('every exemption carries a non-empty reason', () => {
		for (const [name, reason] of Object.entries(EGRESS_STRUCTURE_EXEMPT)) {
			expect(typeof reason).toBe('string');
			expect(reason.length).toBeGreaterThan(10);
			expect(name.startsWith('dedalo_')).toBe(true);
		}
	});

	test('every GATED tool is refused under a restrict-all policy (handler never runs)', async () => {
		for (const name of EGRESS_GATED_READ_TOOLS) {
			const refusal = await gateAgentToolCall(RESTRICT_ALL, name, {
				section_tipo: 'any1',
				section_id: 1,
			});
			expect(refusal).not.toBeNull();
			expect(refusal?.error.code).toBe('egress_restricted');
		}
	});

	test('the loop-local RAG tools are covered by the per-hit filter', async () => {
		const { allowed, removed } = await filterEgressHits(RESTRICT_ALL, [
			{ section_tipo: 'oh1', section_id: 1 },
		]);
		expect(allowed).toEqual([]);
		expect(removed).toBe(1);
	});

	test('CONTRIBUTOR rule: a public host leaking a forbidden contributor is dropped', async () => {
		// policy: host section public, contributor section restricted
		const policy = async (sectionTipo: string) =>
			sectionTipo === 'oh1' ? ('public' as const) : ('restricted' as const);
		const egress = { external: true, policy };
		const { allowed, removed } = await filterEgressHits(egress, [
			// group chunk whose deep-resolved text came from the forbidden rsc99
			{ section_tipo: 'oh1', section_id: 1, component_tipo: 'rag:card', contributors: ['rsc99'] },
			// group chunk fed only by its own section — passes
			{ section_tipo: 'oh1', section_id: 2, component_tipo: 'rag:card', contributors: ['oh1'] },
		]);
		expect(allowed.map((h) => h.section_id)).toEqual([2]);
		expect(removed).toBe(1);
	});

	test('FAIL-CLOSED: a rag: group chunk with NO contributor metadata is dropped', async () => {
		const egress = { external: true, policy: async () => 'public' as const };
		const { allowed, removed } = await filterEgressHits(egress, [
			{ section_tipo: 'oh1', section_id: 1, component_tipo: 'rag:card', contributors: [] },
			// non-group chunk (image path / pre-group) with no contributors passes on host alone
			{ section_tipo: 'oh1', section_id: 2, component_tipo: 'oh23' },
		]);
		expect(allowed.map((h) => h.section_id)).toEqual([2]);
		expect(removed).toBe(1);
	});
});
