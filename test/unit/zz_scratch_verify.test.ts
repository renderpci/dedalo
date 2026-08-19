// BINDS INSTALL TLDs: numisdata — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { expect, test } from 'bun:test';
import { validateRelationInsert } from '../../src/core/relations/save.ts';

test('two frames same target different id_key, pairing null', async () => {
	const frames = [
		{
			section_tipo: 'numisdata34',
			section_id: '15657',
			from_component_tipo: 'numisdata1530',
			type: 'dd490',
			id_key: 1,
			main_component_tipo: 'numisdata163',
		},
		{
			section_tipo: 'numisdata34',
			section_id: '15657',
			from_component_tipo: 'numisdata1530',
			type: 'dd490',
			id_key: 2,
			main_component_tipo: 'numisdata163',
		},
	];
	const acc: unknown[] = [];
	for (const f of frames) {
		const r = await validateRelationInsert(f as Record<string, unknown>, {
			componentTipo: 'numisdata1530',
			model: 'component_dataframe',
			hostSectionTipo: 'numisdata6',
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
