/**
 * Gate: the shared MCP tool registry — the one catalog every surface (stdio
 * server, HTTP bridge, agent loop) consumes. Asserts the catalog's mechanical
 * invariants so a new tool cannot land half-declared:
 *
 *   - every spec carries a complete annotation set, a tier, and a dedalo_* name;
 *   - write specs are hidden unless a surface opts in (fail-closed);
 *   - runTool refuses a write tool on a read-only surface and off-allowlist
 *     sections with CODED envelopes (the model-facing contract);
 *   - invalid input never reaches a handler (envelope, not a throw);
 *   - the agent-tool projection produces a JSON-schema object per tool.
 */

import { describe, expect, test } from 'bun:test';
import { HINTS } from '../../src/ai/mcp/envelope.ts';
import {
	TOOL_REGISTRY,
	getToolSpec,
	registeredTools,
	runTool,
	toAgentToolDefinition,
} from '../../src/ai/mcp/registry.ts';

const SCOPED_USER = { userId: 16, isGlobalAdmin: false, isDeveloper: false };

describe('MCP tool registry (shared-catalog gate)', () => {
	test('every spec is fully declared', () => {
		expect(TOOL_REGISTRY.length).toBeGreaterThan(0);
		const names = new Set<string>();
		for (const spec of TOOL_REGISTRY) {
			expect(spec.name).toMatch(/^dedalo_[a-z0-9_]+$/);
			expect(names.has(spec.name)).toBe(false);
			names.add(spec.name);
			expect(spec.title.length).toBeGreaterThan(0);
			expect(spec.description.length).toBeGreaterThan(0);
			expect(['primitive', 'agent']).toContain(spec.tier);
			expect(typeof spec.write).toBe('boolean');
			for (const key of [
				'readOnlyHint',
				'destructiveHint',
				'idempotentHint',
				'openWorldHint',
			] as const) {
				expect(typeof spec.annotations[key]).toBe('boolean');
			}
			// A write tool must never claim to be read-only (and vice versa).
			expect(spec.annotations.readOnlyHint).toBe(!spec.write);
			expect(Object.keys(spec.inputShape).length).toBeGreaterThan(0);
		}
	});

	test('write specs are hidden unless the surface opts in (fail-closed)', () => {
		const readOnly = registeredTools();
		expect(readOnly.some((spec) => spec.write)).toBe(false);
		const writable = registeredTools({ allowWrite: true });
		expect(writable.some((spec) => spec.write)).toBe(true);
		// Read tools present on both surfaces.
		expect(readOnly.some((spec) => spec.name === 'dedalo_search_section')).toBe(true);
		expect(writable.length).toBe(TOOL_REGISTRY.length);
	});

	test('runTool refuses a write tool on a read-only surface (coded envelope)', async () => {
		const spec = getToolSpec('dedalo_create_record');
		expect(spec).toBeDefined();
		if (spec === undefined) return;
		const result = await runTool(spec, SCOPED_USER, { section_tipo: 'test2' });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe('permission_denied');
			expect(result.error.hint).toBe(HINTS.permission_denied);
		}
	});

	test('runTool refuses an off-allowlist section (coded envelope)', async () => {
		const spec = getToolSpec('dedalo_create_record');
		if (spec === undefined) throw new Error('spec missing');
		const result = await runTool(
			spec,
			SCOPED_USER,
			{ section_tipo: 'test2' },
			{
				allowWrite: true,
				writableSections: new Set(['oh1']),
			},
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe('section_not_writable');
		}
	});

	test('invalid input never reaches a handler (invalid_request envelope)', async () => {
		const spec = getToolSpec('dedalo_read_record');
		if (spec === undefined) throw new Error('spec missing');
		// section_id must be a number; a malformed call gets a coded envelope.
		const result = await runTool(spec, SCOPED_USER, { section_tipo: 'oh1' });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe('invalid_request');
		}
	});

	test('a thrown identifier-gate error becomes an invalid_tipo envelope', async () => {
		const spec = getToolSpec('dedalo_describe_node');
		if (spec === undefined) throw new Error('spec missing');
		const result = await runTool(spec, SCOPED_USER, { tipo: "oh1'; DROP TABLE matrix; --" });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe('invalid_tipo');
			expect(result.error.hint).toContain('never guess a tipo');
		}
	});

	test('the agent projection yields a JSON-schema object per read tool', () => {
		for (const spec of registeredTools()) {
			const definition = toAgentToolDefinition(spec);
			expect(definition.name).toBe(spec.name);
			expect(definition.input_schema.type).toBe('object');
			expect(definition.input_schema.properties).toBeDefined();
		}
	});
});
