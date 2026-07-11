/**
 * Portal edit write operations — TS-NATIVE half (DEC-14b P1), the survival
 * twin of test/parity/portal_edit_writes_differential.test.ts (which compares
 * end states against the live PHP oracle and dies without it). The contracts
 * re-expressed here are the differential's PINNED shapes / the PHP source —
 * never unverified TS output:
 *
 *  - validateRelationInsert (PHP validate_data_element,
 *    component_relation_common.php:1058-1198): the picker's raw client
 *    locator normalizes to the stored bytes the differential pinned live
 *    2026-07-09 — `type` filled from the component's relation type,
 *    section_id stored as STRING, transient paginated_key stripped,
 *    from_component_tipo forced; duplicate + autoreference inserts return
 *    null (ignored); extra properties beyond the locator law are PRESERVED
 *    (the dd96 tag-link shape round-trips byte-identically).
 *  - applySortData (PHP update_data_value 'sort_data',
 *    class.component_common.php:4393-4476): absolute-position move validated
 *    against the stored item over the exact 4-property list
 *    (section_id/section_tipo/from_component_tipo/tag_id); mismatch refuses;
 *    paginated_key never persists. The down-move (target > source → moved
 *    lands AFTER the target) is PHP-SOURCE-derived — the differential only
 *    exercised up-moves.
 *  - sort_by_column: numisdata77 does not enable the `sort_by_column`
 *    property, so the gate refuses (result false, stored order untouched) —
 *    differential-pinned on both engines.
 *  - add_new_element (PHP component_relation_common.php:3770-3860): creates
 *    the target record, inherits the host's project filter into the TARGET's
 *    component_filter re-stamped ({from_component_tipo: <target filter
 *    tipo>, id: 1..n}), appends the link locator. The empty-host default
 *    (dd153/1 type dd675) is what the differential's fresh twins pinned; the
 *    seeded-filter re-stamp variant is PHP-SOURCE-derived (:3837-3843) — the
 *    differential never ran a host WITH a filter (and PHP's user-projects
 *    intersection does not apply to an unscoped root).
 *  - delete_locator (dd_component_portal_api): bulk removal by ar_properties
 *    match, STRICT tag_id compare (stored '7' vs sent 7 does NOT match —
 *    S1-06 caseB), omitted ar_properties = full-property-UNION compare (no
 *    over-delete — caseA), and rsc860's OWN dd96 relation type honored
 *    (caseC). Removed counts + surviving arrays are the probe-pinned values
 *    (V2_S1-06, PHP live 2026-07-09); survivors re-persist with tag_id CAST
 *    TO STRING (PHP locator class cast, byte-verified by the differential).
 *
 * NOT re-expressed (oracle-only by nature): the picker-insert SAVE ECHO test
 * (rsc92/fr1 term fallback + bare ddinfo breadcrumb) — it asserts subdatum
 * content of a REAL mutable fr1 term record and only means anything as a
 * live TS-vs-PHP diff.
 *
 * Scratch hygiene: fresh numisdata3 / rsc167 twins via createSectionRecord
 * (distinct counter-minted ids — no collision with sibling gates on the same
 * sections); add_new_element's created numisdata4 records tracked too. All
 * twins + their TM rows + the dd542 activity rows the dispatch save
 * chokepoint appends for OUR record ids are swept in afterAll
 * (matrix_activity is consultation-only for the engine doors; direct SQL
 * cleanup of our own rows mirrors delete_multi_native.test.ts).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { getComponentFilterTipo } from '../../src/core/ontology/resolver.ts';
import {
	applySortData,
	getRelationTypeByTipo,
	validateRelationInsert,
} from '../../src/core/relations/save.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const HOST_SECTION = 'numisdata3';
const PORTAL = 'numisdata77';
const TARGET_SECTION = 'numisdata4';

let tsContext: Record<string, unknown>;
const created: { sectionTipo: string; sectionId: number }[] = [];

function track(sectionTipo: string, sectionId: number): number {
	created.push({ sectionTipo, sectionId });
	return sectionId;
}

const locatorOf = (id: number, targetId: number | string, extra: Record<string, unknown> = {}) => ({
	id,
	type: 'dd151',
	section_id: String(targetId),
	section_tipo: TARGET_SECTION,
	from_component_tipo: PORTAL,
	...extra,
});

async function seedHost(locators: Record<string, unknown>[]): Promise<number> {
	const id = track(HOST_SECTION, await createSectionRecord(HOST_SECTION, -1));
	if (locators.length > 0) {
		await sql.unsafe(
			`UPDATE matrix SET relation = COALESCE(relation, '{}'::jsonb) || jsonb_build_object($1::text, $2::text::jsonb)
			 WHERE section_tipo = $3 AND section_id = $4`,
			[PORTAL, JSON.stringify(locators), HOST_SECTION, id],
		);
	}
	return id;
}

async function portalDataOf(
	id: number,
	tipo = PORTAL,
	sectionTipo = HOST_SECTION,
): Promise<unknown> {
	const rows = (await sql.unsafe(
		'SELECT relation->$1 AS v FROM matrix WHERE section_tipo = $2 AND section_id = $3',
		[tipo, sectionTipo, id],
	)) as { v: unknown }[];
	return rows[0]?.v ?? null;
}

function saveRqo(hostId: number, changedData: Record<string, unknown>[]): Record<string, unknown> {
	return {
		action: 'save',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			typo: 'source',
			type: 'component',
			model: 'component_portal',
			tipo: PORTAL,
			section_tipo: HOST_SECTION,
			section_id: String(hostId),
			mode: 'edit',
			lang: 'lg-nolan',
			action: null,
		},
		data: {
			section_id: String(hostId),
			section_tipo: HOST_SECTION,
			tipo: PORTAL,
			lang: 'lg-nolan',
			from_component_tipo: PORTAL,
			changed_data: changedData,
		},
	};
}

async function tsCall(rqo: Record<string, unknown>): Promise<Record<string, unknown>> {
	return (await dispatchRqo(structuredClone(rqo) as unknown as Rqo, tsContext as never))
		.body as Record<string, unknown>;
}

beforeAll(async () => {
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	tsContext = {
		requestId: 'portal_edit_writes_native_test',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	};
}, 60000);

afterAll(async () => {
	for (const row of created) {
		await sql.unsafe('DELETE FROM matrix WHERE section_tipo = $1 AND section_id = $2', [
			row.sectionTipo,
			row.sectionId,
		]);
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[row.sectionTipo, row.sectionId],
		);
	}
	// The dd542 activity rows the dispatch save chokepoint appended for OUR
	// records (dd546 = the saved component tipo, payload section_id = host id).
	const ids = created.map((row) => String(row.sectionId));
	if (ids.length > 0) {
		await sql.unsafe(
			`DELETE FROM matrix_activity
			 WHERE section_tipo = 'dd542'
			   AND string->'dd546'->0->>'value' = ANY($1::text[])
			   AND misc->'dd551'->0->'value'->>'section_id' = ANY($2::text[])`,
			[`{${PORTAL},rsc860}`, `{${ids.join(',')}}`],
		);
	}
});

// ---------------------------------------------------------------------------
// PURE(ish) normalization pins — byte-level on the normalized output, the
// differential's preferred surface (ontology reads only; no scratch writes).
// ---------------------------------------------------------------------------

describe('validateRelationInsert (PHP validate_data_element pins)', () => {
	const context = (existingItems: unknown[] = []) => ({
		componentTipo: PORTAL,
		model: 'component_portal',
		hostSectionTipo: HOST_SECTION,
		hostSectionId: 424242,
		translatable: false,
		lang: 'lg-nolan',
		existingItems,
	});

	test('picker payload normalizes: type filled, section_id → string, paginated_key stripped', async () => {
		// The EXACT payload component_portal.link_record sends after a picker
		// selection (numeric section_id, transient paginated_key, NO type).
		const normalized = await validateRelationInsert(
			{
				section_tipo: TARGET_SECTION,
				section_id: 101,
				paginated_key: 0,
				from_component_tipo: PORTAL,
			},
			context(),
		);
		// The differential's byte pin (live 2026-07-09): client 101 → stored
		// "101", type dd151 filled, paginated_key ABSENT.
		expect(normalized).toEqual({
			type: 'dd151',
			section_id: '101',
			section_tipo: TARGET_SECTION,
			from_component_tipo: PORTAL,
		});
	});

	test('duplicate insert is ignored (null) — the client dup check relies on it', async () => {
		const normalized = await validateRelationInsert(
			{ section_tipo: TARGET_SECTION, section_id: 101, from_component_tipo: PORTAL },
			context([locatorOf(1, 101)]),
		);
		expect(normalized).toBeNull();
	});

	test('autoreference (self-link) is ignored, loose-numeric section_id', async () => {
		const normalized = await validateRelationInsert(
			{ section_tipo: HOST_SECTION, section_id: 424242, from_component_tipo: PORTAL },
			context(),
		);
		expect(normalized).toBeNull();
	});

	test('bad-formed locator (missing section_id / section_tipo) is ignored (PHP :1058)', async () => {
		expect(await validateRelationInsert({ section_tipo: TARGET_SECTION }, context())).toBeNull();
		expect(await validateRelationInsert({ section_id: 101 }, context())).toBeNull();
	});

	test('tag-link dd96 shape: explicit type kept, extras preserved (S2-03)', async () => {
		// The REAL stored indexation-link shape the differential round-tripped
		// byte-identically (type dd96, STRING tag_id, section_top_* anchors).
		const tagLocator = {
			type: 'dd96',
			tag_id: '58',
			section_id: '101',
			section_tipo: TARGET_SECTION,
			section_top_id: '4',
			section_top_tipo: HOST_SECTION,
			tag_component_tipo: 'numisdata155',
			from_component_tipo: PORTAL,
		};
		const normalized = await validateRelationInsert({ ...tagLocator }, context());
		expect(normalized).toEqual(tagLocator);
	});

	test('relation type resolution: numisdata77 → dd151, rsc860 → its OWN dd96', async () => {
		expect(await getRelationTypeByTipo(PORTAL)).toBe('dd151');
		// rsc860 normalizes autocomplete_hi → portal but its own properties keep
		// relation_type dd96 (S1-06 caseC pin — the tool_indexation link type).
		expect(await getRelationTypeByTipo('rsc860')).toBe('dd96');
	});
});

describe('applySortData (PHP sort_data pins)', () => {
	const seed = () => [locatorOf(1, 101), locatorOf(2, 102), locatorOf(3, 103)];

	test('move up (2 → 0): moved locator lands BEFORE the target, paginated_key stripped', () => {
		const sorted = applySortData(seed(), {
			source_key: 2,
			target_key: 0,
			value: { ...locatorOf(3, 103), paginated_key: 2 },
		});
		expect(sorted).toEqual([locatorOf(3, 103), locatorOf(1, 101), locatorOf(2, 102)]);
		expect(Object.hasOwn(sorted?.[0] as object, 'paginated_key')).toBe(false);
	});

	test('move down (0 → 2): moved locator lands AFTER the target (PHP-source, :4459-4464)', () => {
		const items = [...seed(), locatorOf(4, 104)];
		const sorted = applySortData(items, {
			source_key: 0,
			target_key: 2,
			value: locatorOf(1, 101),
		});
		expect(sorted).toEqual([
			locatorOf(2, 102),
			locatorOf(3, 103),
			locatorOf(1, 101),
			locatorOf(4, 104),
		]);
	});

	test('locator mismatch refuses (null) — stale-drag guard over the 4-property law', () => {
		const sorted = applySortData(seed(), {
			source_key: 0,
			target_key: 1,
			value: locatorOf(1, 999), // does NOT match the stored item
		});
		expect(sorted).toBeNull();
	});

	test('source == target is a no-op copy', () => {
		const sorted = applySortData(seed(), {
			source_key: 1,
			target_key: 1,
			value: locatorOf(2, 102),
		});
		expect(sorted).toEqual(seed());
	});
});

// ---------------------------------------------------------------------------
// Stored end-state contracts — scratch DB twins driven through dispatchRqo
// (the wire chokepoint the differential exercised).
// ---------------------------------------------------------------------------

describe('portal edit writes, TS-native stored end states', () => {
	test('picker insert via dispatch: stored bytes, dup ignored, self-link ignored', async () => {
		const host = await seedHost([]);
		const pick = () => ({
			action: 'insert',
			id: null,
			value: {
				section_tipo: TARGET_SECTION,
				section_id: 101,
				paginated_key: 0,
				from_component_tipo: PORTAL,
			},
		});
		const response = await tsCall(saveRqo(host, [pick()]));
		expect((response as { result?: unknown }).result).not.toBe(false);
		// Differential pin: ONE stored locator, id stamped 1, normalized bytes.
		expect(await portalDataOf(host)).toEqual([locatorOf(1, 101)]);

		// Duplicate insert: ignored (pagination.total unchanged on the client).
		await tsCall(saveRqo(host, [pick()]));
		expect(await portalDataOf(host)).toEqual([locatorOf(1, 101)]);

		// Autoreference: a self-link is ignored.
		await tsCall(
			saveRqo(host, [
				{
					action: 'insert',
					id: null,
					value: { section_tipo: HOST_SECTION, section_id: host, from_component_tipo: PORTAL },
				},
			]),
		);
		expect(await portalDataOf(host)).toEqual([locatorOf(1, 101)]);
	}, 60000);

	test('sort_data locator mismatch via dispatch: refused, stored data untouched', async () => {
		const seed = [locatorOf(1, 101), locatorOf(2, 102)];
		const host = await seedHost(seed);
		const response = await tsCall(
			saveRqo(host, [
				{ action: 'sort_data', source_key: 0, target_key: 1, value: locatorOf(1, 999) },
			]),
		);
		expect((response as { result?: unknown }).result).toBe(false);
		expect(await portalDataOf(host)).toEqual(seed);
	}, 60000);

	test('sort_by_column: property gate refuses (numisdata77 does not enable it)', async () => {
		const seed = [locatorOf(1, 102), locatorOf(2, 101)];
		const host = await seedHost(seed);
		const response = await tsCall(
			saveRqo(host, [
				{ action: 'sort_by_column', component_tipo: 'numisdata158', direction: 'ASC', value: null },
			]),
		);
		expect((response as { result?: unknown }).result).toBe(false);
		expect(await portalDataOf(host)).toEqual(seed);
	}, 60000);

	test('add_new_element: creates + links a target with the DEFAULT project filter', async () => {
		const host = await seedHost([]);
		const response = await tsCall(
			saveRqo(host, [{ action: 'add_new_element', id: null, value: TARGET_SECTION }]),
		);
		expect((response as { result?: unknown }).result).not.toBe(false);

		const data = (await portalDataOf(host)) as Record<string, unknown>[];
		expect(data?.length).toBe(1);
		const newId = Number((data[0] as { section_id: string }).section_id);
		track(TARGET_SECTION, newId);
		// link locator shape (differential pin, modulo the counter-assigned id)
		expect(data[0]).toEqual(locatorOf(1, newId));

		// The created record inherits the DEFAULT project filter (the host twin
		// is fresh → empty filter → dd153/1 type dd675, the differential's case),
		// re-stamped with the TARGET's component_filter tipo and id 1.
		const targetFilterTipo = await getComponentFilterTipo(TARGET_SECTION);
		expect(targetFilterTipo).not.toBeNull();
		const filter = await portalDataOf(newId, targetFilterTipo as string, TARGET_SECTION);
		expect(filter).toEqual([
			{
				type: 'dd675',
				section_id: '1',
				section_tipo: 'dd153',
				from_component_tipo: targetFilterTipo,
				id: 1,
			},
		]);
	}, 60000);

	test('add_new_element: a host WITH a filter re-stamps it onto the target (PHP :3837-3843)', async () => {
		const host = await seedHost([]);
		const hostFilterTipo = await getComponentFilterTipo(HOST_SECTION);
		expect(hostFilterTipo).not.toBeNull();
		// seed the host's project filter with a NON-default item id (7) so the
		// re-stamp (id renumbered from 1, from_component_tipo replaced) is visible
		await sql.unsafe(
			`UPDATE matrix SET relation = COALESCE(relation, '{}'::jsonb) || jsonb_build_object($1::text, $2::text::jsonb)
			 WHERE section_tipo = $3 AND section_id = $4`,
			[
				hostFilterTipo,
				JSON.stringify([
					{
						type: 'dd675',
						section_id: '1',
						section_tipo: 'dd153',
						from_component_tipo: hostFilterTipo,
						id: 7,
					},
				]),
				HOST_SECTION,
				host,
			],
		);

		const response = await tsCall(
			saveRqo(host, [{ action: 'add_new_element', id: null, value: TARGET_SECTION }]),
		);
		expect((response as { result?: unknown }).result).not.toBe(false);
		const data = (await portalDataOf(host)) as Record<string, unknown>[];
		const newId = Number((data[0] as { section_id: string }).section_id);
		track(TARGET_SECTION, newId);

		const targetFilterTipo = await getComponentFilterTipo(TARGET_SECTION);
		const filter = await portalDataOf(newId, targetFilterTipo as string, TARGET_SECTION);
		expect(filter).toEqual([
			{
				type: 'dd675',
				section_id: '1',
				section_tipo: 'dd153',
				from_component_tipo: targetFilterTipo, // replaced (host tipo gone)
				id: 1, // renumbered from 1
			},
		]);
	}, 60000);

	test('tag-link dd96 insert round-trip: stored byte-identically with id stamped', async () => {
		const tagLocator = {
			type: 'dd96',
			tag_id: '58',
			section_id: '101',
			section_tipo: TARGET_SECTION,
			section_top_id: '4',
			section_top_tipo: HOST_SECTION,
			tag_component_tipo: 'numisdata155',
			from_component_tipo: PORTAL,
		};
		const host = await seedHost([]);
		const response = await tsCall(
			saveRqo(host, [{ action: 'insert', id: null, value: { ...tagLocator } }]),
		);
		expect((response as { result?: unknown }).result).not.toBe(false);
		expect(await portalDataOf(host)).toEqual([{ ...tagLocator, id: 1 }]);
	}, 60000);
});

// ---------------------------------------------------------------------------
// delete_locator (dd_component_portal_api) — the S1-06 probe-pinned matches.
// ---------------------------------------------------------------------------

const deleteLocatorRqo = (
	tipo: string,
	sectionTipo: string,
	hostId: number,
	options: Record<string, unknown>,
) => ({
	action: 'delete_locator',
	dd_api: 'dd_component_portal_api',
	prevent_lock: true,
	source: { typo: 'source', tipo, section_tipo: sectionTipo, section_id: String(hostId) },
	options,
});

describe('delete_locator, TS-native (bulk match / strict tag_id / full-union / dd96)', () => {
	test('bulk removal by tag_id/type property match: result 2, survivors re-cast', async () => {
		const seed = [
			locatorOf(1, 101, { tag_id: 7 }),
			locatorOf(2, 102, { tag_id: 7 }),
			locatorOf(3, 103, { tag_id: 9 }),
			locatorOf(4, 104),
		];
		const host = await seedHost(seed);
		const body = await tsCall(
			deleteLocatorRqo(PORTAL, HOST_SECTION, host, {
				locator: { tag_id: 7, type: 'dd151' },
				ar_properties: ['tag_id', 'type'],
			}),
		);
		expect((body as { result?: unknown }).result).toBe(2);
		// survivors: the PHP locator class re-persists with tag_id CAST TO STRING
		// (differential byte-pin) — the tag_id-less locator is untouched.
		expect(await portalDataOf(host)).toEqual([
			locatorOf(3, 103, { tag_id: '9' }),
			locatorOf(4, 104),
		]);
	}, 60000);

	test('stored tag_id "7" vs sent 7 does NOT match (strict compare, caseB)', async () => {
		const seed = [locatorOf(1, 101, { tag_id: '7' }), locatorOf(2, 102, { tag_id: '8' })];
		const host = await seedHost(seed);
		const body = await tsCall(
			deleteLocatorRqo(PORTAL, HOST_SECTION, host, {
				locator: { tag_id: 7, type: 'dd151' },
				ar_properties: ['tag_id', 'type'],
			}),
		);
		expect((body as { result?: unknown }).result).toBe(0);
		expect(await portalDataOf(host)).toEqual(seed);
	}, 60000);

	test('OMITTED ar_properties = full-union compare — no over-delete (caseA)', async () => {
		// two locators to the SAME target, different tag_id: the full locator must
		// remove exactly its own entry (the 4-field default would destroy both).
		const seed = [locatorOf(1, 101, { tag_id: '5' }), locatorOf(2, 101, { tag_id: '9' })];
		const host = await seedHost(seed);
		const body = await tsCall(
			deleteLocatorRqo(PORTAL, HOST_SECTION, host, { locator: { ...seed[0] } }),
		);
		expect((body as { result?: unknown }).result).toBe(1);
		expect(await portalDataOf(host)).toEqual([seed[1]]);
	}, 60000);

	test('rsc860 verbatim tool_indexation payload: own dd96 type honored (caseC)', async () => {
		const INDEXING_SECTION = 'rsc167';
		const INDEXING = 'rsc860';
		const tagLink = (id: number, tagId: string) => ({
			id,
			type: 'dd96',
			tag_id: tagId,
			section_id: '2',
			section_tipo: 'dc1',
			section_top_id: '2',
			section_top_tipo: 'ich100',
			tag_component_tipo: 'rsc36',
			from_component_tipo: INDEXING,
		});
		const seed = [tagLink(1, '2'), tagLink(2, '3')];
		const host = track(INDEXING_SECTION, await createSectionRecord(INDEXING_SECTION, -1));
		await sql.unsafe(
			`UPDATE matrix SET relation = COALESCE(relation, '{}'::jsonb) || jsonb_build_object($1::text, $2::text::jsonb)
			 WHERE section_tipo = $3 AND section_id = $4`,
			[INDEXING, JSON.stringify(seed), INDEXING_SECTION, host],
		);
		const body = await tsCall(
			deleteLocatorRqo(INDEXING, INDEXING_SECTION, host, {
				locator: { tag_id: '2', type: 'dd96' },
				ar_properties: ['tag_id', 'type'],
			}),
		);
		expect((body as { result?: unknown }).result).toBe(1);
		expect(await portalDataOf(host, INDEXING, INDEXING_SECTION)).toEqual([tagLink(2, '3')]);
	}, 60000);
});
