/**
 * The REAL numisdata203 alias, post-migration (WC-020; TS-golden — the alias
 * feature is TS-native, so no oracle is involved BY DESIGN; the generic
 * contract gates live in component_alias.test.ts on scratch fixtures).
 *
 * VISIBLY gated on the DB state: before `scripts/migrate_component_alias.ts
 * --execute` runs, the whole describe SKIPS (the probe checks the migrated
 * shape — alias_of present, retired v5 keys gone). A skip here is a
 * measurable statement ("migration not applied"), not a silent green.
 */

import { describe, expect, test } from 'bun:test';
import { getNode } from '../../src/core/ontology/resolver.ts';

const migrated = await (async () => {
	const properties = (await getNode('numisdata203'))?.properties as {
		alias_of?: unknown;
		max_records?: unknown;
	} | null;
	return properties?.alias_of === 'numisdata77' && properties.max_records === undefined;
})();

describe.if(migrated)('numisdata203 — the migrated coins alias (WC-020)', () => {
	test('context identity: model/legacy_model=component_portal, label own, merged config limit 1', async () => {
		const { buildStructureContext } = await import('../../src/core/resolve/structure_context.ts');
		const entry = await buildStructureContext({
			tipo: 'numisdata203',
			sectionTipo: 'numisdata3',
			mode: 'edit',
			lang: 'lg-spa',
			permissions: 3,
		});
		expect(entry?.tipo).toBe('numisdata203');
		expect(entry?.model).toBe('component_portal');
		expect(entry?.legacy_model).toBe('component_portal');
		expect(entry?.view).toBe('mosaic');
		// The folded tool-grid css, not the v5 400px skin.
		expect(JSON.stringify(entry?.css)).toContain('28rem');
		const rc = (entry?.request_config as { show?: { sqo_config?: { limit?: number } } }[])?.[0];
		expect(rc?.show?.sqo_config?.limit).toBe(1);
	});

	test("read via the alias pages the TARGET's coins at limit 1 (record numisdata3/1)", async () => {
		const { readComponentData } = await import('../../src/core/section/read.ts');
		const items = await readComponentData({
			action: 'read',
			source: {
				tipo: 'numisdata203',
				section_tipo: 'numisdata3',
				section_id: '1',
				mode: 'edit',
				lang: 'lg-spa',
			},
		} as never);
		const own = items.find((item) => item.tipo === 'numisdata203');
		expect(own).toBeDefined();
		expect((own?.pagination as { limit: number }).limit).toBe(1);
		expect((own?.pagination as { total: number }).total).toBeGreaterThan(1);
		expect((own?.entries as unknown[]).length).toBe(1);
		// The merged show children resolve (publication + obverse/reverse portals).
		const childTipos = new Set(items.map((item) => item.tipo));
		expect(childTipos.has('numisdata158')).toBe(true);
	});

	test('the re-pointed ddo_map serves the alias tipo with NO inline properties (start reroute)', async () => {
		const { getPropertiesByTipo } = await import('../../src/core/ontology/resolver.ts');
		const properties = (await getPropertiesByTipo('numisdata201')) as {
			tool_config?: Record<string, { ddo_map?: Record<string, unknown>[] }>;
		} | null;
		const coins = properties?.tool_config?.tool_numisdata_epigraphy?.ddo_map?.find(
			(entry) => entry.role === 'coins',
		);
		expect(coins?.tipo).toBe('numisdata203');
		expect(coins?.properties).toBeUndefined();
		// The enriched tool_context entry the client receives resolves the model.
		const { enrichToolConfig } = await import('../../src/core/tools/section_tool_context.ts');
		const enriched = (await enrichToolConfig(
			properties?.tool_config?.tool_numisdata_epigraphy,
		)) as { ddo_map: Record<string, unknown>[] };
		const enrichedCoins = enriched.ddo_map.find((entry) => entry.role === 'coins');
		expect(enrichedCoins?.model).toBe('component_portal');
		expect(enrichedCoins?.label).toBeDefined(); // the alias's own term
	});
});

// Always-on breadcrumb: the skip state is itself asserted so a suite listing
// shows WHERE the gate stands (never a silent absence).
test(`numisdata203 migration state: ${migrated ? 'APPLIED — gates above ran' : 'NOT APPLIED — gates above skipped (run scripts/migrate_component_alias.ts)'}`, () => {
	expect(typeof migrated).toBe('boolean');
});
