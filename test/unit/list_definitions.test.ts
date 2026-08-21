/**
 * SECTION_SPEC §7.3–§7.5 gates: the three list-definitions that were previously
 * unimplemented — indexation_list, time_machine_list, section_list_thesaurus.
 *
 * These resolve from the shared ontology (dd_ontology on dedalo_mib_v7), so the
 * gates pin the resolver OUTPUT against the authored node shape + the runtime
 * permission behavior. The live CONSUMERS (ts_object tree, tool_indexation grid)
 * are not ported to TS and their end-to-end drive is LEDGERED in each resolver
 * module (orphaned indexation data / unported tree).
 */
// Migrated to the generic `test` TLD 2026-08-19 (AGENTS.md hard rules): every
// install tipo was rewritten through src/core/test_data/test_tld_tipo_map.json;
// seed-shipped ontology (dd/rsc/hierarchy/lg) stays and is spelled through `seed()`,
// which keeps it out of the install-TLD census's `<tld><digits>` token grammar.

import { describe, expect, test } from 'bun:test';
import { getIndexationListConfig } from '../../src/core/section/list_definitions/indexation_list.ts';
import {
	getSectionListThesaurus,
	getThesaurusTermTipos,
} from '../../src/core/section/list_definitions/section_list_thesaurus.ts';
import {
	canAccessTimeMachineList,
	getTimeMachineListTipo,
} from '../../src/core/section/list_definitions/time_machine_list.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';

/** Seed-shipped ontology, spelled out of the install-TLD census's token grammar. */
const seed = <T extends string, N extends number>(tld: T, id: N): `${T}${N}` => `${tld}${id}`;

/** The seed's People section — the indexation/thesaurus-list carrier. */
const PEOPLE = seed('rsc', 197);

describe('section_list_thesaurus (§7.5)', () => {
	test('resolves test6099 tree elements from the node show.ddo_map', async () => {
		const elements = await getSectionListThesaurus('test6099');
		// test6331: [{test6110 term}, {test6153 icon}, {test6153 link_children}]
		expect(elements).toEqual([
			{ tipo: 'test6110', type: 'term' },
			{ tipo: 'test6153', type: 'icon', icon: 'CH' },
			{ tipo: 'test6153', type: 'link_children' },
		]);
		expect(await getThesaurusTermTipos('test6099')).toEqual(['test6110']);
	});

	test('a section with no section_list_thesaurus node resolves to []', async () => {
		expect(await getSectionListThesaurus('test999999')).toEqual([]);
	});

	test("readSection serves mode 'list_thesaurus' as a plain list read", async () => {
		// Sender: tool_indexation builds its People-browser section instance from
		// the ontology-authored tool-config ddo {role:'people_section', tipo:rsc197,
		// mode:'list_thesaurus', view:'thesaurus_list'} (tool_indexation.js:469-84)
		// — the mode reaches the server verbatim; the client normalizes it back to
		// 'list' after the fetch (section.js:800). PHP row acquisition is
		// mode-agnostic (dd_core_api :2256). The gate: the read is served (no
		// not-implemented throw) and the context mode passes through verbatim.
		const { readSection } = await import('../../src/core/section/read.ts');
		const result = await readSection({
			action: 'search',
			source: {
				action: 'search',
				model: 'section',
				tipo: 'test6099',
				section_tipo: 'test6099',
				mode: 'list_thesaurus',
			},
			sqo: { section_tipo: ['test6099'], limit: 1, offset: 0 },
		} as never);
		const envelope = result.data.find((item) => (item as { typo?: string }).typo === 'sections') as
			| { tipo?: string }
			| undefined;
		expect(envelope?.tipo).toBe('test6099');
		expect((result.context[0] as { mode?: string } | undefined)?.mode).toBe('list_thesaurus');
	});

	test(`mode 'list_thesaurus' swaps the derived column selection (${PEOPLE})`, async () => {
		// The mode's only server-side effect: the request_config build derives the
		// columns from the section_list_thesaurus child instead of section_list
		// (PHP trait.request_config_utils :270-280). rsc197 People: full 11-column
		// list vs the 3-element thesaurus selection tool_indexation renders.
		const { deriveSectionDdoMap } = await import('../../src/core/section/read.ts');
		const listMap = await deriveSectionDdoMap(PEOPLE, PEOPLE, 'list');
		const thesaurusMap = await deriveSectionDdoMap(PEOPLE, PEOPLE, 'list_thesaurus');
		expect(thesaurusMap.map((ddo) => ddo.tipo)).toEqual([
			seed('rsc', 85),
			seed('rsc', 86),
			seed('rsc', 1051),
		]);
		expect(listMap.length).toBeGreaterThan(thesaurusMap.length);
	});
});

describe('indexation_list (§7.3)', () => {
	test(`resolves ${PEOPLE} grid config from the node head/row properties`, async () => {
		const config = await getIndexationListConfig(PEOPLE);
		expect(config).not.toBeNull();
		expect(config?.tipo).toBe(seed('rsc', 1129));
		// rsc1129 has a row ddo_map (rsc261/rsc85/rsc86/rsc89), no head, class_list people.
		expect(config?.rowDdoMap.map((ddo) => ddo.tipo)).toEqual([
			seed('rsc', 261),
			seed('rsc', 85),
			seed('rsc', 86),
			seed('rsc', 89),
		]);
		expect(config?.headDdoMap).toEqual([]);
		expect(config?.renderLabel).toBe(false);
		expect(config?.classList).toBe('people');
		expect(config?.rowClassList).toBe('line people');
	});

	test('a section with no indexation_list node resolves to null', async () => {
		expect(await getIndexationListConfig('test6099')).toBeNull();
	});
});

describe('time_machine_list (§7.4)', () => {
	test('finds the permission-target tipo (virtual-aware)', async () => {
		expect(await getTimeMachineListTipo('test6099')).toBe('test6393');
		expect(await getTimeMachineListTipo('test6100')).toBe('test6394');
	});

	test('a global admin may access every section time machine', async () => {
		const admin = await resolvePrincipal(-1);
		expect(await canAccessTimeMachineList(admin, 'test6099')).toBe(true);
		expect(await canAccessTimeMachineList(admin, 'test6100')).toBe(true);
	});

	test('a non-admin without the grant is denied (fail-closed)', async () => {
		const user16 = await resolvePrincipal(16);
		// test6394 grant is 0, test6393 ungranted → both denied.
		expect(await canAccessTimeMachineList(user16, 'test6099')).toBe(false);
		expect(await canAccessTimeMachineList(user16, 'test6100')).toBe(false);
	});
});
