/**
 * Unit gates for the shared section_tool tool_context helper
 * (src/core/tools/section_tool_context.ts) — the PHP
 * tool_common::create_tool_simple_context enrichment semantics both the menu
 * rewrite and the `start` reroute depend on. DB-backed (ontology lookups), no
 * oracle needed; the wire shape itself is pinned by
 * test/parity/section_tool_start_differential.test.ts and menu_differential.
 */

import { describe, expect, test } from 'bun:test';
import {
	buildSectionToolContext,
	enrichToolConfig,
} from '../../src/core/tools/section_tool_context.ts';
import type { ToolSimpleContext } from '../../src/core/tools/types.ts';

// A stable core-ontology tipo for the enrichment lookups (dd85 = menu).
const REAL_TIPO = 'dd85';

const FAKE_TOOL = {
	typo: 'ddo',
	type: 'tool',
	section_tipo: 'dd1324',
	mode: 'edit',
	model: 'tool_fake',
	label: 'Fake tool',
	css: { url: '/x.css' },
	name: 'tool_fake',
	icon: '/x.svg',
	show_in_inspector: false,
	show_in_component: false,
} as unknown as ToolSimpleContext;

describe('enrichToolConfig (create_tool_simple_context semantics)', () => {
	test("resolves 'self' sentinels to the passed tipos (null by default) and stamps model/translatable/label", async () => {
		const raw = {
			ddo_map: [
				{ role: 'caller', tipo: 'self', section_tipo: 'self' },
				{ role: 'real', tipo: REAL_TIPO, section_tipo: 'dd85' },
			],
		};
		const enriched = (await enrichToolConfig(raw)) as {
			ddo_map: Record<string, unknown>[];
		};
		// 'self' → null when no runtime tipo is passed (menu + start flows);
		// a null tipo gets NO enrichment stamps (PHP guards identically).
		expect(enriched.ddo_map[0]!.tipo).toBeNull();
		expect(enriched.ddo_map[0]!.section_tipo).toBeNull();
		expect(enriched.ddo_map[0]!.model).toBeUndefined();
		// A real tipo gets model + translatable + label stamped.
		expect(typeof enriched.ddo_map[1]!.model).toBe('string');
		expect(typeof enriched.ddo_map[1]!.translatable).toBe('boolean');
		expect(typeof enriched.ddo_map[1]!.label).toBe('string');
		expect((enriched.ddo_map[1]!.label as string).length).toBeGreaterThan(0);

		const withSelf = (await enrichToolConfig(raw, 'oh1', 'oh1')) as {
			ddo_map: Record<string, unknown>[];
		};
		expect(withSelf.ddo_map[0]!.tipo).toBe('oh1');
		expect(withSelf.ddo_map[0]!.section_tipo).toBe('oh1');
	});

	test('NEVER mutates the input (the raw ontology row properties)', async () => {
		const raw = { ddo_map: [{ role: 'caller', tipo: 'self', section_tipo: REAL_TIPO }] };
		const before = JSON.stringify(raw);
		await enrichToolConfig(raw);
		expect(JSON.stringify(raw)).toBe(before);
	});

	test('null/ddo_map-less configs pass through untouched', async () => {
		expect(await enrichToolConfig(null)).toBeNull();
		expect(await enrichToolConfig({ open: true })).toEqual({ open: true });
	});

	test('an existing model is KEPT (PHP fills only when missing)', async () => {
		const enriched = (await enrichToolConfig({
			ddo_map: [{ tipo: REAL_TIPO, section_tipo: 'dd85', model: 'component_custom' }],
		})) as { ddo_map: Record<string, unknown>[] };
		expect(enriched.ddo_map[0]!.model).toBe('component_custom');
	});
});

describe('buildSectionToolContext', () => {
	test('unknown tool or empty bag → null (caller decides drop vs ship-without)', async () => {
		expect(await buildSectionToolContext({}, [FAKE_TOOL])).toBeNull();
		expect(await buildSectionToolContext({ tool_other: {} }, [FAKE_TOOL])).toBeNull();
	});

	test('known tool → simple context + tool_config appended LAST (wire-load-bearing order)', async () => {
		const bag = { tool_fake: { ddo_map: [{ role: 'x', tipo: REAL_TIPO, section_tipo: 'dd85' }] } };
		const context = (await buildSectionToolContext(bag, [FAKE_TOOL])) as Record<string, unknown>;
		expect(context).not.toBeNull();
		expect(context.name).toBe('tool_fake');
		// PHP sets tool_config after the DDO is built (class.tool_common.php:663)
		// — it must serialize as the LAST key.
		expect(Object.keys(context).at(-1)).toBe('tool_config');
		const ddoMap = (context.tool_config as { ddo_map: Record<string, unknown>[] }).ddo_map;
		expect(typeof ddoMap[0]!.label).toBe('string');
	});
});
