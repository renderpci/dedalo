/**
 * TRIPWIRE: every READ tool the agent loop can execute is EGRESS-CLASSIFIED —
 * either gated by the addressed section (record content) or exempt WITH A
 * REASON (ontology structure only). This is MECHANICAL — it iterates
 * TOOL_REGISTRY.filter(t => !t.write) plus the loop-local
 * dedalo_semantic_search, so a NEW read tool that nobody classified fails
 * here, not by silently shipping record content to an external model
 * provider ("Memory projects" privacy requirement).
 *
 * Method (mirrors mcp_write_scope_tripwire): for each gated tool, a
 * restrict-all policy must refuse the call BEFORE any handler runs; the
 * exemption map requires a reason string, so a future content tool cannot
 * quietly join it. dedalo_semantic_search is covered by the post-execution
 * per-hit filter (filterEgressHits) — asserted here on shape.
 */

import { describe, expect, test } from 'bun:test';
import {
	EGRESS_GATED_READ_TOOLS,
	EGRESS_STRUCTURE_EXEMPT,
	filterEgressHits,
	gateAgentToolCall,
} from '../../src/ai/agent/egress.ts';
import { TOOL_REGISTRY } from '../../src/ai/mcp/registry.ts';

const RESTRICT_ALL = { external: true, policy: async () => 'restricted' as const };

describe('agent egress tripwire (mechanical classification of every read tool)', () => {
	test('every non-write registry tool is classified in EXACTLY one bucket', () => {
		const readTools = TOOL_REGISTRY.filter((spec) => !spec.write).map((spec) => spec.name);
		expect(readTools.length).toBeGreaterThanOrEqual(5);
		for (const name of readTools) {
			const gated = EGRESS_GATED_READ_TOOLS.has(name);
			const exempt = name in EGRESS_STRUCTURE_EXEMPT;
			if (!gated && !exempt) {
				throw new Error(
					`Unclassified read tool "${name}": add it to EGRESS_GATED_READ_TOOLS or EGRESS_STRUCTURE_EXEMPT (with a reason) in src/ai/agent/egress.ts`,
				);
			}
			if (gated && exempt) {
				throw new Error(`Read tool "${name}" is in BOTH egress buckets — pick one`);
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

	test('the loop-local semantic search is covered by the per-hit filter', async () => {
		const { allowed, removed } = await filterEgressHits(RESTRICT_ALL, [
			{ section_tipo: 'oh1', section_id: 1 },
		]);
		expect(allowed).toEqual([]);
		expect(removed).toBe(1);
	});
});
