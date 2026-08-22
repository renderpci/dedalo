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
 *
 * NOT pure any more, and it never honestly was. Since
 * WC-2026-08-14-relation-insert-target-validation the door RESOLVES the calling
 * component's declared targets out of dd_ontology and REFUSES a locator that
 * names another section (`relation.insert_refused`). The old fixture survived
 * only because its caller tipo did not exist in the suite database, which
 * silently took the "no declared target ⇒ no constraint" exemption; the moment
 * the generic-TLD migration pointed it at a tipo the clone DOES ship, six cases
 * went red. So the gate now BUILDS its situation: two scratch dataframe slots in
 * a synthetic `zzdf` tld, each declaring `test3` as its target and NO
 * data_limit (a cap would refuse the second frame at the selection gate, for a
 * reason that has nothing to do with frame identity), swept in afterAll.
 */
// Generic `test`/`zz` TLDs only (AGENTS.md hard rule): the frames target the
// canonical test3 playground and the callers are built here.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { validateRelationInsert } from '../../src/core/relations/save.ts';

/** Synthetic caller tld — no install uses it, no section walk reaches it. */
const CALLER_TLD = 'zzdf';
/** The saving dataframe slot: targets test3, uncapped. */
const SLOT = `${CALLER_TLD}1`;
/** A second, genuinely different slot — same target, so only the slot differs. */
const OTHER_SLOT = `${CALLER_TLD}2`;
/** Main components the frames extend: names only, never resolved. */
const MAIN = `${CALLER_TLD}m1`;
const OTHER_MAIN = `${CALLER_TLD}m2`;
/** The target section every frame below points at, and one of its records. */
const TARGET_SECTION = 'test3';
const TARGET_ID = '1';

const HOST = {
	componentTipo: SLOT,
	model: 'component_dataframe',
	hostSectionTipo: TARGET_SECTION,
	hostSectionId: 2,
	translatable: false,
	lang: 'lg-nolan',
} as const;

/** A stored frame locator as the raw export writes it into the CSV. */
function frame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		section_tipo: TARGET_SECTION,
		section_id: TARGET_ID,
		from_component_tipo: SLOT,
		type: 'dd490',
		id_key: 1,
		main_component_tipo: MAIN,
		...overrides,
	};
}

async function buildSlot(tipo: string): Promise<void> {
	await sql.unsafe(
		`INSERT INTO dd_ontology (tipo, parent, model, tld, term, is_model, is_translatable, is_main, properties)
		 VALUES ($1, $2, 'component_dataframe', $3, $4::text::jsonb, false, false, false, $5::text::jsonb)`,
		[
			tipo,
			// Orphan parent: no section walk can reach these nodes.
			`${CALLER_TLD}x`,
			CALLER_TLD,
			JSON.stringify({ 'lg-spa': `scratch dataframe slot ${tipo}` }),
			JSON.stringify({
				source: {
					request_config: [
						{ sqo: { section_tipo: [{ value: [TARGET_SECTION], source: 'section' }] } },
					],
				},
			}),
		],
	);
}

async function purgeScratch(): Promise<void> {
	await sql.unsafe('DELETE FROM dd_ontology WHERE tld = $1', [CALLER_TLD]);
	await clearOntologyDerivedCaches();
}

beforeAll(async () => {
	await purgeScratch();
	await buildSlot(SLOT);
	await buildSlot(OTHER_SLOT);
	await clearOntologyDerivedCaches();
});

afterAll(async () => {
	await purgeScratch();
	const residue = (await sql.unsafe('SELECT count(*)::int AS n FROM dd_ontology WHERE tld = $1', [
		CALLER_TLD,
	])) as { n: number }[];
	expect(residue[0]?.n).toBe(0);
});

describe('validateRelationInsert — frame identity with no caller pairing (import)', () => {
	test('two frames on the SAME target from DIFFERENT main items are BOTH kept', async () => {
		// THE REGRESSION. Under the generic key both hash to
		// "<id>|test3|dd490|" and the second was dropped as "already
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
		const result = await validateRelationInsert(frame({ from_component_tipo: OTHER_SLOT }), {
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
			componentTipo: OTHER_SLOT,
			existingItems: [frame()],
			pairing: null,
		});
		expect(result).not.toBeNull();
		expect((result as Record<string, unknown>).from_component_tipo).toBe(OTHER_SLOT);
	});

	test('a different main_component_tipo is a DISTINCT frame', async () => {
		const result = await validateRelationInsert(frame({ main_component_tipo: OTHER_MAIN }), {
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
		const result = (await validateRelationInsert(frame({ id_key: 7, main_component_tipo: MAIN }), {
			...HOST,
			existingItems: [],
			pairing: null,
		})) as Record<string, unknown>;
		expect(result.id_key).toBe(7);
		expect(result.main_component_tipo).toBe(MAIN);
		expect(result.type).toBe('dd490');
	});

	test('a NON-frame relation still uses the generic key — unchanged behaviour', async () => {
		// The anti-overreach case: the new arm keys on type === 'dd490' only, so an
		// ordinary relation with a stray id_key must still dedupe generically.
		const ordinary = {
			section_tipo: TARGET_SECTION,
			section_id: TARGET_ID,
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
				pairing: { frameTipo: SLOT, mainComponentTipo: MAIN, idKey: 4 },
			},
		)) as Record<string, unknown>;
		expect(result.id_key).toBe(4);
		expect(result.main_component_tipo).toBe(MAIN);
		expect(result.type).toBe('dd490');
	});
});
