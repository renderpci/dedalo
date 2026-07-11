/**
 * Phase 4 gate v0 (plan A3/A6): READ pipeline differential — the TS
 * readSectionRows data[] versus the live PHP dd_core_api::read data[] for the
 * same RQO (explicit show.ddo_map so both sides resolve identical components).
 *
 * Compared per item: the record identity, component tipo, mode, lang and the
 * VALUE payload (entries) + fallback_value + subdatum stamps. Fields the TS
 * pipeline does not emit yet are checked structurally on the PHP side and
 * logged as uncovered rather than silently ignored.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readSectionRows } from '../../src/core/section/read.ts';
import { adoptEntriesArrayContract } from './normalize.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

/** The replayed RQO: 3 string components of numisdata6, 5 records. */
const READ_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	source: {
		model: 'section',
		tipo: 'numisdata6',
		section_tipo: 'numisdata6',
		mode: 'list',
		lang: 'lg-spa',
		action: 'search',
	},
	sqo: { section_tipo: ['numisdata6'], limit: 5, offset: 0 },
	show: {
		ddo_map: [
			{ tipo: 'numisdata16', section_tipo: 'self', parent: 'self', mode: 'list', lang: 'lg-spa' },
			{ tipo: 'numisdata17', section_tipo: 'self', parent: 'self', mode: 'list', lang: 'lg-spa' },
			{ tipo: 'numisdata18', section_tipo: 'self', parent: 'self', mode: 'list', lang: 'lg-spa' },
		],
	},
};

/** Reduce a data item to the comparable core both sides must agree on. */
function comparableItem(item: Record<string, unknown>): Record<string, unknown> {
	return {
		tipo: item.tipo,
		section_tipo: item.section_tipo,
		section_id: item.section_id,
		mode: item.mode,
		lang: item.lang,
		entries: item.entries ?? null,
		fallback_value: item.fallback_value ?? null,
		row_section_id: item.row_section_id ?? null,
		parent_tipo: item.parent_tipo ?? null,
	};
}

describe.if(hasPhpCredentials())(
	'read pipeline differential: TS vs live PHP (Phase 4 gate v0)',
	() => {
		let phpData: Record<string, unknown>[];
		let tsData: Record<string, unknown>[];

		beforeAll(async () => {
			if (!hasPhpCredentials()) return;
			const client = new PhpApiClient();
			const loggedIn = await client.login(
				config.phpReference.username as string,
				config.phpReference.password as string,
			);
			if (!loggedIn) throw new Error('PHP login failed');
			const { body } = await client.call(structuredClone(READ_RQO));
			const result = body.result as { data: Record<string, unknown>[] };
			// DEC-02 / WIRE_CONTRACT.md WC-001: assert the adopted `entries: []`
			// empty contract (PHP's `entries: null` is the fossil shape at this seam).
			phpData = adoptEntriesArrayContract(result.data);
			tsData = (await readSectionRows(READ_RQO as unknown as Rqo)) as unknown as Record<
				string,
				unknown
			>[];
		});

		test('sections envelope matches (typo/tipo/entries incl. paginated_key)', () => {
			if (!hasPhpCredentials()) return;
			const phpEnvelope = phpData[0] as Record<string, unknown>;
			const tsEnvelope = tsData[0] as Record<string, unknown>;
			expect(tsEnvelope.typo).toBe(phpEnvelope.typo);
			expect(tsEnvelope.tipo).toBe(phpEnvelope.tipo);
			expect(tsEnvelope.entries).toEqual(phpEnvelope.entries);
		});

		test('component data items match: identity, order, entries, fallback, stamps', () => {
			if (!hasPhpCredentials()) return;
			// PHP data[] may include items for components NOT in our ddo_map (e.g.
			// injected defaults). Compare the subset for our three components, in
			// order — a missing or extra item for OUR tipos is a failure.
			const targetTipos = new Set(['numisdata16', 'numisdata17', 'numisdata18']);
			const phpItems = phpData.slice(1).filter((item) => targetTipos.has(item.tipo as string));
			const tsItems = tsData.slice(1).filter((item) => targetTipos.has(item.tipo as string));
			// Non-empty floor: an empty PHP side must redden, not compare 0 items.
			expect(phpItems.length).toBeGreaterThan(0);
			expect(tsItems.map(comparableItem)).toEqual(phpItems.map(comparableItem));
		});

		test('EDIT mode: single record, untruncated values match PHP', async () => {
			if (!hasPhpCredentials()) return;
			const editRqo = structuredClone(READ_RQO) as Record<string, unknown> & {
				source: Record<string, unknown>;
				sqo: Record<string, unknown>;
				show: { ddo_map: Record<string, unknown>[] };
			};
			editRqo.source.mode = 'edit';
			editRqo.sqo = {
				section_tipo: ['numisdata6'],
				filter_by_locators: [{ section_tipo: 'numisdata6', section_id: '1' }],
				limit: 1,
				offset: 0,
			};
			for (const ddo of editRqo.show.ddo_map) {
				ddo.mode = 'edit';
			}

			const client = new PhpApiClient();
			await client.login(
				config.phpReference.username as string,
				config.phpReference.password as string,
			);
			const { body } = await client.call(structuredClone(editRqo));
			// DEC-02 / WIRE_CONTRACT.md WC-001 (see above).
			const phpEdit = adoptEntriesArrayContract(
				(body.result as { data: Record<string, unknown>[] }).data,
			);
			const tsEdit = (await readSectionRows(editRqo as unknown as Rqo)) as unknown as Record<
				string,
				unknown
			>[];

			const targetTipos = new Set(['numisdata16', 'numisdata17', 'numisdata18']);
			const phpItems = phpEdit.filter((item) => targetTipos.has(item.tipo as string));
			const tsItems = tsEdit.filter((item) => targetTipos.has(item.tipo as string));
			expect(tsItems.map(comparableItem)).toEqual(phpItems.map(comparableItem));
			// Edit values are UNTRUNCATED: the long text_area (numisdata18) must not
			// end with the list-mode ellipsis.
			const longText = tsItems.find((item) => item.tipo === 'numisdata18') as {
				entries: { value: string }[] | null;
			};
			expect(longText.entries?.[0]?.value.includes('...</p>')).toBe(false);
		}, 30000);

		test('PHP-only fields are surfaced, not silently ignored (coverage ledger)', () => {
			if (!hasPhpCredentials()) return;
			const knownFields = new Set([
				'tipo',
				'section_tipo',
				'section_id',
				'mode',
				'lang',
				'from_component_tipo',
				'entries',
				'fallback_value',
				'row_section_id',
				'parent_tipo',
				'parent_section_id',
				'pagination',
				'counter',
				'transliterate_value',
				'debug_model',
				'debug_label',
				'debug_dataframe',
				'typo',
				'literal',
			]);
			const unknownFields = new Set<string>();
			for (const item of phpData.slice(1)) {
				for (const field of Object.keys(item)) {
					if (!knownFields.has(field)) unknownFields.add(field);
				}
			}
			if (unknownFields.size > 0) {
				console.warn(
					`[UNCOVERED] PHP data-item fields not yet modeled: ${[...unknownFields].join(', ')}`,
				);
			}
			expect(true).toBe(true); // ledger test never fails; it reports
		});
	},
);
