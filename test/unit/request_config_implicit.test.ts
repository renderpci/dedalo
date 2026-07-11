/**
 * request_config IMPLICIT — unit gate for the legacy graph-walk builder
 * (RELATIONS_SPEC.md §4, spec gate 3 groundwork).
 * PHP oracle nomenclature: implicit ≡ v5, explicit ≡ v6.
 *
 * PHP oracle: trait.request_config_v5.php (build_request_config_v5 :78,
 * clean_and_extract_related :508, build_legacy_ddo_map :618) + the
 * data-driven selection rule (class.common.php:3502).
 *
 * Fixtures are REAL ontology rows of the shared dedalo_mib_v7 install — the
 * RELATIONS_SPEC §7 corpus components that carry NO source.request_config:
 *   numisdata967 (radio_button)      relations [dd501, dd503]
 *   numisdata71  (autocomplete)      relations [numisdata41, numisdata43, numisdata195]
 *   numisdata1562 (select)           relations [numisdata1554, numisdata1557]
 *   numisdata55  (relation_related)  legacy `source` object, relations
 *                                    [numisdata4, numisdata130, numisdata159, numisdata147]
 */

import { describe, expect, test } from 'bun:test';
import { selectRequestConfigStrategy } from '../../src/core/concepts/request_config.ts';
import { getNode } from '../../src/core/ontology/resolver.ts';
import { buildRequestConfigForElement } from '../../src/core/relations/request_config/build.ts';
import {
	type RequestConfigContext,
	extractSqoSectionTipos,
} from '../../src/core/relations/request_config/explicit.ts';
import { buildImplicitComponentListConfig } from '../../src/core/relations/request_config/implicit.ts';

const editContext = (ownerTipo: string, ownerSectionTipo: string): RequestConfigContext => ({
	ownerTipo,
	ownerSectionTipo,
	mode: 'edit',
	ownerIsSection: false,
});

describe('selectRequestConfigStrategy (the class.common.php:3502 branch)', () => {
	test('no-source components select implicit', async () => {
		for (const tipo of ['numisdata967', 'numisdata71', 'numisdata1562']) {
			const node = await getNode(tipo);
			expect(selectRequestConfigStrategy(node?.properties ?? null)).toBe('implicit');
		}
	});

	test('a legacy source object WITHOUT request_config still selects implicit (numisdata55)', async () => {
		const node = await getNode('numisdata55');
		expect(selectRequestConfigStrategy(node?.properties ?? null)).toBe('implicit');
	});

	test('an explicit request_config selects explicit (numisdata161)', async () => {
		const node = await getNode('numisdata161');
		expect(selectRequestConfigStrategy(node?.properties ?? null)).toBe('explicit');
	});
});

describe('buildImplicitComponentListConfig — graph-walk target + ddo derivation', () => {
	test('numisdata967: first section relation (dd501) is the target, stripped from ddos', async () => {
		const config = await buildImplicitComponentListConfig(
			'numisdata967',
			editContext('numisdata967', 'numisdata3'),
		);
		expect(config).toHaveLength(1);
		expect(extractSqoSectionTipos(config[0])).toEqual(['dd501']);
		const ddoTipos = (config[0]?.show?.ddo_map ?? []).map((ddo) => ddo.tipo);
		expect(ddoTipos).toEqual(['dd503']);
		// Implicit legacy shape: SCALAR section_tipo on the ddo, mode forced 'list'.
		expect(config[0]?.show?.ddo_map[0]?.section_tipo).toBe('dd501');
		expect(config[0]?.show?.ddo_map[0]?.mode).toBe('list');
		expect(config[0]?.show?.ddo_map[0]?.parent).toBe('numisdata967');
	});

	test('numisdata71: target numisdata41, ddos [numisdata43, numisdata195]', async () => {
		const config = await buildImplicitComponentListConfig(
			'numisdata71',
			editContext('numisdata71', 'numisdata3'),
		);
		expect(extractSqoSectionTipos(config[0])).toEqual(['numisdata41']);
		expect((config[0]?.show?.ddo_map ?? []).map((ddo) => ddo.tipo)).toEqual([
			'numisdata43',
			'numisdata195',
		]);
	});

	test('numisdata1562: target numisdata1554, ddo numisdata1557', async () => {
		const config = await buildImplicitComponentListConfig(
			'numisdata1562',
			editContext('numisdata1562', 'numisdata3'),
		);
		expect(extractSqoSectionTipos(config[0])).toEqual(['numisdata1554']);
		expect((config[0]?.show?.ddo_map ?? []).map((ddo) => ddo.tipo)).toEqual(['numisdata1557']);
	});

	test('numisdata55 (legacy source object): implicit walk over its relation nodes', async () => {
		const node = await getNode('numisdata55');
		const config = await buildRequestConfigForElement(
			node?.properties ?? null,
			editContext('numisdata55', 'numisdata4'),
		);
		expect(extractSqoSectionTipos(config[0])).toEqual(['numisdata4']);
		expect((config[0]?.show?.ddo_map ?? []).map((ddo) => ddo.tipo)).toEqual([
			'numisdata130',
			'numisdata159',
			'numisdata147',
		]);
	});

	test('api_engine/type wrap matches the explicit shape (single dedalo main item)', async () => {
		const config = await buildImplicitComponentListConfig(
			'numisdata967',
			editContext('numisdata967', 'numisdata3'),
		);
		expect(config[0]?.api_engine).toBe('dedalo');
		expect(config[0]?.type).toBe('main');
	});
});

describe('explicit-config-required models (PHP trait.request_config_v5.php:88)', () => {
	test('component_relation_children forced through the implicit path throws loudly', async () => {
		// hierarchy49 is a real component_relation_children; force the implicit
		// path directly — PHP throws regardless of whether the live node carries
		// an explicit config. The error text is PHP-verbatim (keeps "v5").
		expect(
			buildImplicitComponentListConfig('hierarchy49', editContext('hierarchy49', 'ts1')),
		).rejects.toThrow(/v5 resolution fallback is no longer supported/);
	});
});
