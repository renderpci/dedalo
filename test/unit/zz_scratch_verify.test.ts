// Migrated to the generic `test` TLD 2026-08-20 (AGENTS.md hard rule). Install tipos
// were replaced by their twins from src/core/test_data/test_tld_tipo_map.json; the
// seed-shipped ones (rsc/dd/hierarchy/ontology/lg) have no twin and stay, because they
// ship with every installation.

import { expect, test } from 'bun:test';
import { validateRelationInsert } from '../../src/core/relations/save.ts';

test('two frames same target different id_key, pairing null', async () => {
	const frames = [
		{
			section_tipo: 'test6117',
			section_id: '15657',
			from_component_tipo: 'testmint1036',
			type: 'dd490',
			id_key: 1,
			main_component_tipo: 'testmint1014',
		},
		{
			section_tipo: 'test6117',
			section_id: '15657',
			from_component_tipo: 'testmint1036',
			type: 'dd490',
			id_key: 2,
			main_component_tipo: 'testmint1014',
		},
	];
	const acc: unknown[] = [];
	for (const f of frames) {
		const r = await validateRelationInsert(f as Record<string, unknown>, {
			componentTipo: 'testmint1036',
			model: 'component_dataframe',
			hostSectionTipo: 'testmint1',
			hostSectionId: 2,
			translatable: false,
			lang: 'lg-nolan',
			existingItems: acc,
			pairing: null,
		});
		console.log('->', JSON.stringify(r));
		if (r !== null) acc.push(r);
	}
	console.log('kept', acc.length);
	expect(acc.length).toBe(2);
});
