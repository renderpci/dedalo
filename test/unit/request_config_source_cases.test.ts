/**
 * resolveSqoSectionTipos source cases — unit gate for the full PHP
 * get_request_config_section_tipo case inventory
 * (class.component_relation_common.php:2679-2908) + the v6-trait
 * check_tipo_is_valid prune (trait.request_config_v6.php:262-270).
 *
 * Live fixtures (shared dedalo_mib_v7 install, read-only):
 *   ontology_sections — ontology1 tree components / dd1766 (222 targets)
 *   field_value       — hierarchy1's hierarchy45 (value ['hierarchy53']) →
 *                       the ACTIVE hierarchies' target sections (es1, fr1…);
 *                       dd1758's dd1763 → [] (no active activity records)
 *   check_tipo_is_valid — numisdata279's category1 (TLD installed, node absent)
 */

import { describe, expect, test } from 'bun:test';
import { getModelByTipo } from '../../src/core/ontology/resolver.ts';
import {
	type RequestConfigContext,
	clearOntologySectionsCache,
	resolveOntologySections,
	resolveSqoSectionTipos,
} from '../../src/core/relations/request_config/explicit.ts';

const context = (ownerSectionTipo: string): RequestConfigContext => ({
	ownerTipo: 'test1',
	ownerSectionTipo,
	mode: 'edit',
	ownerIsSection: false,
});

describe('hierarchy_terms source (PHP :2850-65)', () => {
	test('locator entries resolve to their section_tipo, order preserved; malformed dropped', async () => {
		const raw = [
			{
				source: 'hierarchy_terms',
				value: [
					{ recursive: true, section_id: '202', section_tipo: 'aa1' },
					{ section_id: '7', section_tipo: 'bb1' },
					{ section_id: '9' }, // no section_tipo → dropped
					'not-an-object',
				],
			},
		];
		// aa1/bb1 don't resolve a model on this install — the validity prune
		// would drop them, so use REAL section tipos to isolate the case logic.
		const real = [
			{
				source: 'hierarchy_terms',
				value: [
					{ recursive: true, section_id: '1', section_tipo: 'numisdata4' },
					{ section_id: '2', section_tipo: 'numisdata3' },
				],
			},
		];
		expect(await resolveSqoSectionTipos(real, context('test3'))).toEqual([
			'numisdata4',
			'numisdata3',
		]);
		// Synthetic tipos without ontology nodes are pruned by check_tipo_is_valid.
		expect(await resolveSqoSectionTipos(raw, context('test3'))).toEqual([]);
	});
});

describe('ontology_sections source (PHP class.ontology.php:1509-51)', () => {
	test('resolves every registry target; value ignored; cached', async () => {
		clearOntologySectionsCache();
		const first = await resolveOntologySections();
		expect(first.length).toBeGreaterThan(0);
		expect(first).toContain('dd0');
		expect(first).toContain('rsc0');
		// Cache identity on the second call.
		expect(await resolveOntologySections()).toBe(first);
		clearOntologySectionsCache();
		const fresh = await resolveOntologySections();
		expect(fresh).not.toBe(first);
		expect(fresh).toEqual(first);
		// Through the source case — `value` is ignored (PHP :2739-42). The
		// trait-level check_tipo_is_valid prune then drops registry targets
		// whose ontology is registered but NOT installed (no dd_ontology node —
		// e.g. the country roots ws0/ye0/za0), exactly like PHP :262-270.
		const viaSource = await resolveSqoSectionTipos(
			[{ source: 'ontology_sections', value: ['ignored1'] }],
			context('ontology1'),
		);
		const installed: string[] = [];
		for (const tipo of [...new Set(first)]) {
			if ((await getModelByTipo(tipo)) !== null) installed.push(tipo);
		}
		expect(viaSource).toEqual(installed);
		expect(viaSource).toContain('dd0');
		expect(viaSource).toContain('rsc0');
		expect(viaSource.length).toBeLessThan(first.length);
	});
});

describe('field_value source (PHP :2744-2848)', () => {
	test('hierarchy1 + hierarchy53 resolves the ACTIVE hierarchies targets (sections only)', async () => {
		const resolved = await resolveSqoSectionTipos(
			[{ source: 'field_value', value: ['hierarchy53'] }],
			context('hierarchy1'),
		);
		expect(resolved.length).toBeGreaterThan(0);
		expect(resolved).toContain('es1');
		expect(resolved).toContain('fr1');
		for (const tipo of resolved) {
			expect(await getModelByTipo(tipo)).toBe('section');
		}
	});

	test('dd1758 + dd1765 short-circuits to [] (no active activity records — PHP :2797)', async () => {
		const resolved = await resolveSqoSectionTipos(
			[{ source: 'field_value', value: ['dd1765'] }],
			context('dd1758'),
		);
		expect(resolved).toEqual([]);
	});
});

describe('entry contract (PHP :2688-2725, :2867-88, :2892-95)', () => {
	test('object entry without source is DROPPED (PHP :2718-25)', async () => {
		const resolved = await resolveSqoSectionTipos(
			[{ value: ['numisdata4'] }],
			context('numisdata3'),
		);
		expect(resolved).toEqual([]);
	});

	test("live 'section_tipo' alias keeps section semantics (default branch)", async () => {
		const resolved = await resolveSqoSectionTipos(
			[{ source: 'section_tipo', value: ['numisdata4'] }],
			context('numisdata3'),
		);
		expect(resolved).toEqual(['numisdata4']);
	});

	test('unknown source name still resolves with section semantics (PHP default)', async () => {
		const resolved = await resolveSqoSectionTipos(
			[{ source: 'future_source', value: ['numisdata4'] }],
			context('numisdata3'),
		);
		expect(resolved).toEqual(['numisdata4']);
	});

	test('terminal dedup collapses duplicates across entries (PHP array_unique :2892-95)', async () => {
		const resolved = await resolveSqoSectionTipos(
			[
				{ source: 'section', value: ['numisdata4', 'numisdata3'] },
				{ source: 'section', value: ['numisdata4'] },
			],
			context('numisdata3'),
		);
		expect(resolved).toEqual(['numisdata4', 'numisdata3']);
	});

	test('check_tipo_is_valid prune: installed TLD but NO node → dropped (numisdata279/category1)', async () => {
		// category1's TLD 'category' IS installed (category0 exists) but the
		// category1 node does not — PHP prunes it at the trait (:262-270); the
		// TLD gate alone would keep it (the pre-fix TS divergence).
		const resolved = await resolveSqoSectionTipos(
			[{ source: 'section', value: ['category1', 'numisdata4'] }],
			context('numisdata3'),
		);
		expect(resolved).toEqual(['numisdata4']);
	});
});
