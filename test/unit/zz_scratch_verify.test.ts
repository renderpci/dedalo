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
