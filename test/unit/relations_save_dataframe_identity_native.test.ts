/**
 * FRAME IDENTITY WITHOUT A CALLER PAIRING — the import round-trip gate
 * (engineering/wire_contract/WC-2026-08-09-dataframe-import-id-key-identity.md).
 *
 * `validateRelationInsert` has two duplicate gates: the frame gate
 * (`dataframeEntriesEqual`, identity over DATAFRAME_TEST_EQUAL_PROPERTIES,
 * which INCLUDES `id_key`) and the generic relation gate (a hash of
 * [section_id, section_tipo, type, tag_id]). The frame gate used to be reachable
 * only when `context.pairing` was non-null — and a CSV import never has one,
 * because `dataframePairingOf` needs a caller ddo. So every imported frame fell
 * to the generic key, `id_key` was not part of it, and two frames pointing at
 * the SAME target from DIFFERENT main items collapsed into one, silently.
 *
 * These cases are all `pairing: null` on purpose: that is the import shape.
 * Pure — no DB, no fixture. `validateRelationInsert` only touches the database
 * on branches these inputs never reach (the model/tipo lookups fire for
 * relation models with a section target, not for a dd490 frame).
 */
// BINDS INSTALL TLDs: numisdata — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { describe, expect, test } from 'bun:test';
import { validateRelationInsert } from '../../src/core/relations/save.ts';

const HOST = {
	componentTipo: 'numisdata1530',
	model: 'component_dataframe',
	hostSectionTipo: 'numisdata6',
	hostSectionId: 2,
	translatable: false,
	lang: 'lg-nolan',
} as const;

/** A stored frame locator as the raw export writes it into the CSV. */
function frame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		section_tipo: 'numisdata34',
		section_id: '15657',
		from_component_tipo: 'numisdata1530',
		type: 'dd490',
		id_key: 1,
		main_component_tipo: 'numisdata163',
		...overrides,
	};
}

describe('validateRelationInsert — frame identity with no caller pairing (import)', () => {
	test('two frames on the SAME target from DIFFERENT main items are BOTH kept', async () => {
		// THE REGRESSION. Under the generic key both hash to
		// "15657|numisdata34|dd490|" and the second was dropped as "already
		// linked" — the other main item's framed content, gone with no issue row.
		const kept: unknown[] = [];
		for (const candidate of [frame({ id_key: 1 }), frame({ id_key: 2 })]) {
			const result = await validateRelationInsert(candidate, {
				...HOST,
				existingItems: kept,
				pairing: null,
			});
			if (result !== null) kept.push(result);
		}
		expect(kept).toHaveLength(2);
		expect(kept.map((item) => (item as Record<string, unknown>).id_key)).toEqual([1, 2]);
	});

	test('the SAME frame twice is still dropped — a re-import stays idempotent', async () => {
		const first = frame();
		const second = await validateRelationInsert(frame(), {
			...HOST,
			existingItems: [first],
			pairing: null,
		});
		expect(second).toBeNull();
	});

	test('id_key compares LOOSELY — a stored "2" and an incoming 2 are one frame', async () => {
		// The locator law's loose section_id rule, applied to the pairing key:
		// a CSV round trip can legitimately change the JSON type of id_key.
		const result = await validateRelationInsert(frame({ id_key: 2 }), {
			...HOST,
			existingItems: [frame({ id_key: '2' })],
			pairing: null,
		});
		expect(result).toBeNull();
	});

	test('a client-sent from_component_tipo is FORCED to the saving component, so it cannot spoof a distinct frame', async () => {
		// save.ts forces `value.from_component_tipo = context.componentTipo` before
		// either dedup gate (PHP-faithful, :1107-19). A payload claiming another
		// slot is therefore rewritten to THIS slot and collapses into the existing
		// frame — it does not sneak in as a second one.
		const result = await validateRelationInsert(frame({ from_component_tipo: 'numisdata1531' }), {
			...HOST,
			existingItems: [frame()],
			pairing: null,
		});
		expect(result).toBeNull();
	});

	test('a genuinely different slot IS a distinct frame — the slot comes from the save, not the payload', async () => {
		// Same target, same id_key, same main; only the SAVING component differs,
		// which is the only way the slot can legitimately differ.
		const result = await validateRelationInsert(frame(), {
			...HOST,
			componentTipo: 'numisdata1531',
			existingItems: [frame()],
			pairing: null,
		});
		expect(result).not.toBeNull();
		expect((result as Record<string, unknown>).from_component_tipo).toBe('numisdata1531');
	});

	test('a different main_component_tipo is a DISTINCT frame', async () => {
		const result = await validateRelationInsert(frame({ main_component_tipo: 'numisdata999' }), {
			...HOST,
			existingItems: [frame()],
			pairing: null,
		});
		expect(result).not.toBeNull();
	});

	test('nothing is normalized: the entry keeps its OWN pairing fields', async () => {
		// With no caller there is nothing authoritative to stamp. The id_key and
		// main_component_tipo written by the raw export ARE the identity — that is
		// what makes the export round trip.
		const result = (await validateRelationInsert(
			frame({ id_key: 7, main_component_tipo: 'numisdata163' }),
			{ ...HOST, existingItems: [], pairing: null },
		)) as Record<string, unknown>;
		expect(result.id_key).toBe(7);
		expect(result.main_component_tipo).toBe('numisdata163');
		expect(result.type).toBe('dd490');
	});

	test('a NON-frame relation still uses the generic key — unchanged behaviour', async () => {
		// The anti-overreach case: the new arm keys on type === 'dd490' only, so an
		// ordinary relation with a stray id_key must still dedupe generically.
		const ordinary = {
			section_tipo: 'numisdata34',
			section_id: '15657',
			type: 'dd67',
			id_key: 1,
		};
		const duplicate = { ...ordinary, id_key: 2 };
		const result = await validateRelationInsert(duplicate, {
			...HOST,
			model: 'component_portal',
			existingItems: [ordinary],
			pairing: null,
		});
		expect(result).toBeNull();
	});

	test('the PAIRED path still normalizes from the server caller context', async () => {
		// Unchanged: a widget save overrides whatever the client sent.
		const result = (await validateRelationInsert(
			frame({ id_key: 99, main_component_tipo: 'spoofed1', type: 'dataframe' }),
			{
				...HOST,
				existingItems: [],
				pairing: { frameTipo: 'numisdata1530', mainComponentTipo: 'numisdata163', idKey: 4 },
			},
		)) as Record<string, unknown>;
		expect(result.id_key).toBe(4);
		expect(result.main_component_tipo).toBe('numisdata163');
		expect(result.type).toBe('dd490');
	});
});
