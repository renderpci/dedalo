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

describe('section_list_thesaurus (§7.5)', () => {
	test('resolves numisdata3 tree elements from the node show.ddo_map', async () => {
		const elements = await getSectionListThesaurus('numisdata3');
		// numisdata317: [{numisdata27 term}, {numisdata73 icon}, {numisdata73 link_children}]
		expect(elements).toEqual([
			{ tipo: 'numisdata27', type: 'term' },
			{ tipo: 'numisdata73', type: 'icon', icon: 'CH' },
			{ tipo: 'numisdata73', type: 'link_children' },
		]);
		expect(await getThesaurusTermTipos('numisdata3')).toEqual(['numisdata27']);
	});

	test('a section with no section_list_thesaurus node resolves to []', async () => {
		expect(await getSectionListThesaurus('numisdata999999')).toEqual([]);
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
				tipo: 'numisdata3',
				section_tipo: 'numisdata3',
				mode: 'list_thesaurus',
			},
			sqo: { section_tipo: ['numisdata3'], limit: 1, offset: 0 },
		} as never);
		const envelope = result.data.find(
			(item) => (item as { typo?: string }).typo === 'sections',
		) as { tipo?: string } | undefined;
		expect(envelope?.tipo).toBe('numisdata3');
		expect((result.context[0] as { mode?: string } | undefined)?.mode).toBe('list_thesaurus');
	});

	test("mode 'list_thesaurus' swaps the derived column selection (rsc197)", async () => {
		// The mode's only server-side effect: the request_config build derives the
		// columns from the section_list_thesaurus child instead of section_list
		// (PHP trait.request_config_utils :270-280). rsc197 People: full 11-column
		// list vs the 3-element thesaurus selection tool_indexation renders.
		const { deriveSectionDdoMap } = await import('../../src/core/section/read.ts');
		const listMap = await deriveSectionDdoMap('rsc197', 'rsc197', 'list');
		const thesaurusMap = await deriveSectionDdoMap('rsc197', 'rsc197', 'list_thesaurus');
		expect(thesaurusMap.map((ddo) => ddo.tipo)).toEqual(['rsc85', 'rsc86', 'rsc1051']);
		expect(listMap.length).toBeGreaterThan(thesaurusMap.length);
	});
});

describe('indexation_list (§7.3)', () => {
	test('resolves rsc197 grid config from the node head/row properties', async () => {
		const config = await getIndexationListConfig('rsc197');
		expect(config).not.toBeNull();
		expect(config?.tipo).toBe('rsc1129');
		// rsc1129 has a row ddo_map (rsc261/rsc85/rsc86/rsc89), no head, class_list people.
		expect(config?.rowDdoMap.map((ddo) => ddo.tipo)).toEqual(['rsc261', 'rsc85', 'rsc86', 'rsc89']);
		expect(config?.headDdoMap).toEqual([]);
		expect(config?.renderLabel).toBe(false);
		expect(config?.classList).toBe('people');
		expect(config?.rowClassList).toBe('line people');
	});

	test('a section with no indexation_list node resolves to null', async () => {
		expect(await getIndexationListConfig('numisdata3')).toBeNull();
	});
});

describe('time_machine_list (§7.4)', () => {
	test('finds the permission-target tipo (virtual-aware)', async () => {
		expect(await getTimeMachineListTipo('numisdata3')).toBe('numisdata587');
		expect(await getTimeMachineListTipo('numisdata4')).toBe('numisdata588');
	});

	test('a global admin may access every section time machine', async () => {
		const admin = await resolvePrincipal(-1);
		expect(await canAccessTimeMachineList(admin, 'numisdata3')).toBe(true);
		expect(await canAccessTimeMachineList(admin, 'numisdata4')).toBe(true);
	});

	test('a non-admin without the grant is denied (fail-closed)', async () => {
		const user16 = await resolvePrincipal(16);
		// numisdata588 grant is 0, numisdata587 ungranted → both denied.
		expect(await canAccessTimeMachineList(user16, 'numisdata3')).toBe(false);
		expect(await canAccessTimeMachineList(user16, 'numisdata4')).toBe(false);
	});
});
