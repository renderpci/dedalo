/**
 * DATAFRAME CONTRACT TRIPWIRE (DEC-12: "invariants are tripwired or deleted").
 *
 * Pure, no DB. Guards the two halves of the persisted-frame contract at their
 * SOURCE — the normalizer and the identity predicate in concepts/subdatum.ts —
 * plus the structural rule that let the whole defect exist:
 *
 *   DATAFRAME_TEST_EQUAL_PROPERTIES was exported, documented as "the save/dedup
 *   path", and imported by NOTHING in src/ or test/. A stated invariant with no
 *   mechanical consumer is exactly what DEC-12 forbids, and the write path
 *   duly deduped on something else (a full JSON signature including `id`,
 *   which made every duplicate unique). The last test here fails if the
 *   constant ever goes back to having no consumer — at which point the honest
 *   move is to delete it, not to leave the prose standing.
 */

import { describe, expect, test } from 'bun:test';
import { dataframePairingOf } from '../../src/core/concepts/rqo.ts';
import {
	DATAFRAME_RELATION_TYPE,
	DATAFRAME_TEST_EQUAL_PROPERTIES,
	dataframeEntriesEqual,
	dataframeEntryMatches,
	isDataframeEntry,
	normalizeDataframeEntry,
} from '../../src/core/concepts/subdatum.ts';

const PAIRING = { frameTipo: 'oh115', mainComponentTipo: 'oh24', idKey: 2 };

/** The oh1/368 payload, verbatim: what the client sends and the DB received. */
const RAW_CLIENT_LOCATOR = {
	section_id: 4,
	section_tipo: 'rolepos1',
	paginated_key: 0,
};

describe('normalizeDataframeEntry — the persisted-frame contract', () => {
	test('a raw client locator becomes the canonical frame', () => {
		expect(normalizeDataframeEntry(RAW_CLIENT_LOCATOR, PAIRING)).toEqual({
			type: 'dd490',
			id_key: 2,
			// WC-2026-08-10-section-id-int-canonical: the frame's record address is
			// an INT (repeals the "stringified per the locator law" pin).
			section_id: 4,
			section_tipo: 'rolepos1',
			from_component_tipo: 'oh115',
			main_component_tipo: 'oh24',
		});
	});

	test('the output is always READABLE by the pairing predicate', () => {
		// The invariant that actually broke: the writer produced entries the
		// reader could never match. These two functions must never disagree.
		const normalized = normalizeDataframeEntry(RAW_CLIENT_LOCATOR, PAIRING);
		expect(isDataframeEntry(normalized)).toBe(true);
		expect(dataframeEntryMatches(normalized, 'oh24', 2, 'oh115')).toBe(true);
	});

	test('client-supplied pairing fields are OVERRIDDEN, never trusted', () => {
		// The client sources id_key from the last read echo, so a single bad read
		// would otherwise corrupt every following write. `type` arrives as 'dd151'
		// from the portal tree-view branch — also wrong, also overridden.
		const hostile = {
			...RAW_CLIENT_LOCATOR,
			type: 'dd151',
			id_key: 99,
			main_component_tipo: 'someone_else',
			from_component_tipo: 'another_slot',
		};
		const normalized = normalizeDataframeEntry(hostile, PAIRING);
		expect(normalized.type).toBe(DATAFRAME_RELATION_TYPE);
		expect(normalized.id_key).toBe(2);
		expect(normalized.main_component_tipo).toBe('oh24');
		expect(normalized.from_component_tipo).toBe('oh115');
	});

	test('transients and legacy pairing keys are stripped', () => {
		const legacy = { ...RAW_CLIENT_LOCATOR, section_id_key: 7, section_tipo_key: 'oh24' };
		const keys = Object.keys(normalizeDataframeEntry(legacy, PAIRING));
		expect(keys).not.toContain('paginated_key');
		expect(keys).not.toContain('section_id_key');
		expect(keys).not.toContain('section_tipo_key');
	});

	test('id_key is stored as an INT even when the caller sends a numeric string', () => {
		const normalized = normalizeDataframeEntry(RAW_CLIENT_LOCATOR, { ...PAIRING, idKey: '3' });
		expect(normalized.id_key).toBe(3);
	});

	test('it is IDEMPOTENT — re-normalizing an already-stored frame is a no-op', () => {
		const once = normalizeDataframeEntry(RAW_CLIENT_LOCATOR, PAIRING);
		expect(normalizeDataframeEntry(once, PAIRING)).toEqual(once);
	});
});

describe('dataframePairingOf — ONE validity rule for every door', () => {
	// This predicate started life as three separate local rules (read: any
	// finite number; save: >= 1; merge: non-null), and a payload that passed one
	// while failing another could be written through the UNPAIRED path — landing
	// in exactly the unreadable shape the normalizer exists to prevent. These
	// cases are the disagreements, pinned.
	test('a complete pairing is accepted and id_key normalized to a NUMBER', () => {
		expect(dataframePairingOf({ main_component_tipo: 'oh24', id_key: '2' })).toEqual({
			main_component_tipo: 'oh24',
			id_key: 2,
		});
	});

	test.each([
		[
			'null main_component_tipo (client sends `self.caller?.tipo || null`)',
			{ main_component_tipo: null, id_key: 2 },
		],
		['empty main_component_tipo', { main_component_tipo: '', id_key: 2 }],
		['id_key 0 — item ids are 1-based', { main_component_tipo: 'oh24', id_key: 0 }],
		['id_key null', { main_component_tipo: 'oh24', id_key: null }],
		['id_key empty string', { main_component_tipo: 'oh24', id_key: '' }],
		[
			'id_key non-numeric — used to reach Math.trunc(Number()) and write NaN',
			{ main_component_tipo: 'oh24', id_key: 'abc' },
		],
		['id_key fractional', { main_component_tipo: 'oh24', id_key: 1.5 }],
		['no caller at all', null],
	])('REJECTS %s', (_label, caller) => {
		expect(dataframePairingOf(caller as never)).toBeNull();
	});
});

describe('mergeCallerEntries — the last gate before the column is written', () => {
	const SLOT = 'oh115';
	const caller = { main_component_tipo: 'oh24', id_key: 1 };
	const stored = [
		normalizeDataframeEntry(
			{ section_id: '9', section_tipo: 'rolepos1' },
			{ frameTipo: SLOT, mainComponentTipo: 'oh24', idKey: 2 },
		),
	];

	test('an invalid pairing leaves the slot EXACTLY as it was (no clobber, no garbage)', async () => {
		// Pre-fix this branch passed the incoming entries through UNTOUCHED and
		// wrote them — the no-pairing hole. Writing them would either clobber
		// every item's frames or store entries with no pairing key; both are
		// worse than doing nothing.
		const { mergeCallerEntries } = await import('../../src/core/relations/dataframe.ts');
		const merged = mergeCallerEntries(
			stored,
			[RAW_CLIENT_LOCATOR],
			{ main_component_tipo: undefined, id_key: undefined },
			SLOT,
		);
		expect(merged).toEqual(stored);
	});

	test('SIBLING frames of other main items always survive', async () => {
		const { mergeCallerEntries } = await import('../../src/core/relations/dataframe.ts');
		const merged = mergeCallerEntries(stored, [RAW_CLIENT_LOCATOR], caller, SLOT) ?? [];
		expect(merged).toContainEqual(stored[0] as Record<string, unknown>); // item 2's frame untouched
		expect(merged.length).toBe(2);
	});

	test('it normalizes AND dedups even when handed raw duplicates', async () => {
		const { mergeCallerEntries } = await import('../../src/core/relations/dataframe.ts');
		const merged =
			mergeCallerEntries([], [RAW_CLIENT_LOCATOR, { ...RAW_CLIENT_LOCATOR }], caller, SLOT) ?? [];
		expect(merged.length).toBe(1);
		expect(isDataframeEntry(merged[0])).toBe(true);
		expect(merged[0]?.id_key).toBe(1);
	});

	test('it does not MUTATE the entries it was handed', async () => {
		const { mergeCallerEntries } = await import('../../src/core/relations/dataframe.ts');
		const input = { ...RAW_CLIENT_LOCATOR };
		const snapshot = JSON.stringify(input);
		mergeCallerEntries([], [input], caller, SLOT);
		expect(JSON.stringify(input)).toBe(snapshot);
	});
});

describe('dataframeEntriesEqual — frame IDENTITY', () => {
	const base = normalizeDataframeEntry(RAW_CLIENT_LOCATOR, PAIRING);

	test('`id` is NOT part of identity (the oh1/368 duplicate)', () => {
		// ids 2 and 3 on that record differed by nothing else. A JSON-signature
		// dedup called them distinct; test_equal_properties calls them the same.
		expect(dataframeEntriesEqual({ ...base, id: 2 }, { ...base, id: 3 })).toBe(true);
	});

	test('section_id compares loosely (locator law)', () => {
		expect(dataframeEntriesEqual({ ...base, section_id: '4' }, { ...base, section_id: 4 })).toBe(
			true,
		);
	});

	test('a different id_key is a DIFFERENT frame — same target, other main item', () => {
		// Over-rejecting here would silently forbid framing one record from two
		// main items, which is the component's whole purpose.
		expect(dataframeEntriesEqual(base, { ...base, id_key: 1 })).toBe(false);
	});

	test('every identity property is load-bearing', () => {
		for (const property of DATAFRAME_TEST_EQUAL_PROPERTIES) {
			if (property === 'id_key') continue; // covered above with a real value
			expect(dataframeEntriesEqual(base, { ...base, [property]: 'CHANGED' })).toBe(false);
		}
	});
});

describe('DEC-12 — the invariant constants have mechanical consumers', () => {
	test('the WRITE doors BEHAVE as if wired — normalization is observable through them', async () => {
		// DATAFRAME_TEST_EQUAL_PROPERTIES shipped exported, documented as "the
		// save/dedup path", and imported by nothing at all — while that path
		// deduped on an unrelated key. A source-text grep for the helper names
		// would "pass" on a mention in a comment, so this drives the two doors
		// with a RAW locator and asserts the contract in the OUTPUT. Unhook the
		// helpers and this fails, whatever the source text says.
		const { mergeCallerEntries } = await import('../../src/core/relations/dataframe.ts');
		const { validateRelationInsert } = await import('../../src/core/relations/save.ts');

		// Door 1 — mergeCallerEntries.
		const merged =
			mergeCallerEntries(
				[],
				[RAW_CLIENT_LOCATOR],
				{ main_component_tipo: 'oh24', id_key: 2 },
				'oh115',
			) ?? [];
		expect(merged[0]).toEqual(normalizeDataframeEntry(RAW_CLIENT_LOCATOR, PAIRING));

		// Door 2 — validateRelationInsert with a pairing. oh115 declares
		// `properties.view: 'tree'` (it is a picker caller), so the door's
		// read-grant gate judges an ACTOR and is fail-closed without one — the
		// principal is threaded explicitly, as save_component does from dispatch.
		const { resolvePrincipal } = await import('../../src/core/security/permissions.ts');
		const principal = await resolvePrincipal(-1);
		const validated = await validateRelationInsert({ ...RAW_CLIENT_LOCATOR }, {
			componentTipo: 'oh115',
			model: 'component_dataframe',
			hostSectionTipo: 'oh1',
			hostSectionId: 368,
			translatable: false,
			lang: 'lg-nolan',
			existingItems: [],
			pairing: PAIRING,
			principal,
		} as never);
		expect(validated).toEqual(normalizeDataframeEntry(RAW_CLIENT_LOCATOR, PAIRING));

		// …and it must DROP a duplicate by test_equal_properties, not by JSON
		// signature (the `id` an insert mints would defeat a signature compare).
		const duplicate = await validateRelationInsert({ ...RAW_CLIENT_LOCATOR }, {
			componentTipo: 'oh115',
			model: 'component_dataframe',
			hostSectionTipo: 'oh1',
			hostSectionId: 368,
			translatable: false,
			lang: 'lg-nolan',
			existingItems: [{ ...(validated as Record<string, unknown>), id: 7 }],
			pairing: PAIRING,
			principal,
		} as never);
		expect(duplicate).toBeNull();
	});

	test('the type marker is the single source of frame detection', () => {
		expect(DATAFRAME_RELATION_TYPE).toBe('dd490');
		expect(isDataframeEntry({ type: 'dd151', id_key: 1, main_component_tipo: 'oh24' })).toBe(false);
		// The precise shape stored on oh1/368: pairing fields present, no marker.
		expect(isDataframeEntry({ id_key: 1, main_component_tipo: 'oh24' })).toBe(false);
	});
});
