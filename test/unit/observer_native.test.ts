/**
 * Server-side observer propagation — TS-NATIVE half (DEC-14b), the survival
 * twin of test/parity/observer_differential.test.ts (which needed the live PHP
 * oracle and died with it). The contract re-expressed here is the
 * differential's PINNED shape (oracle-captured 2026-07-11), never "whatever
 * TS emits":
 *
 * 1. {use_observable_dato} + set_dato_external (the dominant server config —
 *    the shipped example is hierarchy93 ← rsc387): saving an INDEXER locator
 *    (indexer → term TERM_ANCHOR) on a scratch REF_SECTION twin recomputes the
 *    term's MIRROR "who indexes me" bag — APPEND semantics: existing entries
 *    preserved in place, the twin appended as { id: <max existing item id + 1>,
 *    type 'dd151', section_id, section_tipo, from_component_tipo: MIRROR }
 *    (the differential pinned TS's id as PHP's + 1 — i.e. next-after-highest;
 *    PHP itself draws fresh ids from its own counter, which only ever grows,
 *    so next-after-highest is the shared law).
 * 2. The same save writes the twin's relation_search[INDEXER] ancestor
 *    index = the term's parent chain closest-first, tagged with the saved
 *    items' relation type — for TERM_ANCHOR that is 8 → 2 → 1.
 * 3. Deleting the twins (delete pipeline → inverse cleanup) restores the
 *    term's original bag byte-identically.
 * 4. DEFAULT branch (server.filter === false — the shipped example is
 *    rsc36 → rsc860): PHP leaves the relation_search index UNTOUCHED in this
 *    flow (oracle finding pinned in the differential) — the TS branch must
 *    no-op identically.
 *
 * Scratch hygiene: every record this file touches lives on the two sections it
 * builds, in `matrix_test`, and is swept whole in afterAll. There is no longer
 * a real record to capture-and-restore.
 */
// Migrated to the generic `test` TLD 2026-08-20 (AGENTS.md hard rules). This
// file used to drive the SHIPPED seed edges (rsc387 → hierarchy93 and
// rsc36 → rsc860) against records on the install sections `rsc205` (matrix) and
// `on1` (matrix_hierarchy), the latter planted by test/helpers/observer_term_seed.ts.
// It now builds the same two edge SHAPES itself, copied field for field out of
// those four shipped nodes (models, config_relation.relation_type dd96,
// use_self_section/use_observable_dato, set_dato_external params, the bare
// `server:{filter:false}`), on two scratch sections carrying the `test24`
// matrix_table relation so every record lands in `matrix_test`.
//
// WHY IT HAD TO MOVE, measured: on the suite ontology `rsc387` declares its
// targets as the country hierarchies (ad1, al1, …, af1) and NOT `on1`, so
// validateRelationInsert refused every save in this file with
// `relation.insert_refused (off_target)` — 4 of the 6 cases were RED at
// baseline for no reason but the corpus. The scratch INDEXER declares no
// target section, which is the gate's own declared exemption (an empty
// `constraint.targets` is "no target constraint", not "nothing is permitted").
//
// The relation_search golden keeps the differential's 58 → 8 → 2 → 1 topology
// verbatim; only the section_tipo it is spelled in changed. The ancestor walk
// reads the parent slot `getThesaurusMap()` resolves, which for a section with
// no section_map is the seed default `hierarchy36` — install-invariant
// (`hierarchy` is on the census's INVARIANT_TLDS), so the chain is stored under
// that key.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { getCounters } from '../../src/core/api/counters.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

// ---------------------------------------------------------------------------
// The situation this file builds (scratch band test9996x — distinct from
// observer_failsafe test9990x, observer_seed test9991x, observer_cascade
// test9992x, observer_equivalence test9994x, observer_reconcile test9993x).
// ---------------------------------------------------------------------------
/** The thesaurus-shaped TERM section (the `on1` role). */
const TERM_SECTION = 'test99960';
/** The referencing section the twins are created in (the `rsc205` role). */
const REF_SECTION = 'test99961';
/** component_autocomplete_hi, dd96 — the `rsc387` role. */
const INDEXER = 'test99962';
/** component_autocomplete, set_dato_external — the `hierarchy93` role. */
const MIRROR = 'test99963';
/** component_text_area — the `rsc36` role (the DEFAULT branch's observed). */
const TAG_TEXT = 'test99964';
/** component_autocomplete_hi with `server:{filter:false}` — the `rsc860` role. */
const TAG_INDEX = 'test99965';
/** Both scratch sections store here (the `test24` matrix_table term). */
const SCRATCH_TABLE = 'matrix_test';
/**
 * The parent slot the ancestor walk reads. `getThesaurusMap()` falls back to
 * the seed's `hierarchy36` for a section with no section_map — a `hierarchy`
 * tipo, which is install-invariant, so the chain is stored under this key.
 */
const PARENT_COMPONENT = 'hierarchy36';

/** The term the twins index, and its ancestor chain closest-first: 58 → 8 → 2 → 1. */
const TERM = { section_tipo: TERM_SECTION, section_id: 58 };
const TERM_CHAIN: [number, number | null][] = [
	[58, 8],
	[8, 2],
	[2, 1],
	[1, null],
];

/**
 * relation_search[INDEXER] after an INDEXER save targeting TERM — the ancestor
 * chain 8 → 2 → 1, closest-first, typed with the saved items' relation type
 * (dd96). The topology and every field but `section_tipo` are the golden the
 * retired differential captured from the live PHP oracle 2026-07-11.
 *
 * WC-2026-08-10-section-id-int-canonical: the addresses are INTs — the index
 * writer mints them through canonicalizeStoredSectionId.
 */
const RELATION_SEARCH_GOLDEN = [
	{ type: 'dd96', section_id: 8, section_tipo: TERM_SECTION, from_component_tipo: INDEXER },
	{ type: 'dd96', section_id: 2, section_tipo: TERM_SECTION, from_component_tipo: INDEXER },
	{ type: 'dd96', section_id: 1, section_tipo: TERM_SECTION, from_component_tipo: INDEXER },
];

/**
 * The scratch ontology. Every `properties` block below is copied from the
 * shipped node it stands in for (read out of dd_ontology 2026-08-20), minus the
 * install-specific css/request_config payload the observer kernel never reads.
 */
const SCRATCH_NODES: {
	tipo: string;
	parent: string;
	model: string;
	properties: Record<string, unknown>;
}[] = [
	{
		// rsc387: component_autocomplete_hi, relation type dd96, forward specs
		// naming the mirror's host section. NO source.request_config, so it
		// declares no target section — validateRelationInsert's declared
		// exemption, which is what the shipped node's country-hierarchy targets
		// would otherwise refuse.
		tipo: INDEXER,
		parent: REF_SECTION,
		model: 'component_autocomplete_hi',
		properties: {
			config_relation: { relation_type: 'dd96' },
			observers: [{ section_tipo: TERM_SECTION, component_tipo: MIRROR }],
		},
	},
	{
		// hierarchy93: component_autocomplete, observable-driven set_dato_external.
		tipo: MIRROR,
		parent: TERM_SECTION,
		model: 'component_autocomplete',
		properties: {
			source: {
				mode: 'external',
				section_to_search: [REF_SECTION],
				component_to_search: [INDEXER],
			},
			observe: [
				{
					component_tipo: INDEXER,
					server: {
						config: { use_self_section: false, use_observable_dato: true },
						perform: {
							function: 'set_dato_external',
							params: { save: true, changed: false, current_dato: false, references_limit: 0 },
						},
					},
				},
			],
		},
	},
	{
		// rsc36: the transcription text area the tag index observes.
		tipo: TAG_TEXT,
		parent: REF_SECTION,
		model: 'component_text_area',
		properties: { tags_index: { tipo: TAG_INDEX, section_id: 'self', section_tipo: 'self' } },
	},
	{
		// rsc860: observes the text area with a BARE `server:{filter:false}` —
		// no perform, non-info observer ⇒ the written-out terminal no-op branch.
		tipo: TAG_INDEX,
		parent: REF_SECTION,
		model: 'component_autocomplete_hi',
		properties: {
			view: 'indexation',
			observe: [
				{
					client: { event: 'click_tag_index', perform: { function: 'filter_data_by_tag_id' } },
					server: { filter: false },
					component_tipo: TAG_TEXT,
				},
				{
					client: { event: 'click_no_tag', perform: { function: 'reset_filter_data' } },
					server: { filter: false },
					component_tipo: TAG_TEXT,
				},
			],
			config_relation: { relation_type: 'dd96', tag_component_tipo: TAG_TEXT },
		},
	},
];

let original: unknown[] = [];
let afterFirst: unknown[] = [];
let afterSecond: unknown[] = [];
let afterCleanup: unknown[] = [];
let twinA = 0;
let twinB = 0;
let twinASearch: unknown = null;
let twinBSearch: unknown = null;

async function termBag(): Promise<unknown[]> {
	const rows = (await sql.unsafe(
		`SELECT relation->$3 AS bag FROM ${SCRATCH_TABLE}
		 WHERE section_tipo = $1 AND section_id = $2`,
		[TERM.section_tipo, TERM.section_id, MIRROR],
	)) as { bag: unknown[] | null }[];
	return rows[0]?.bag ?? [];
}

async function dispatchAsRoot(rqo: Record<string, unknown>): Promise<void> {
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	await dispatchRqo(
		rqo as unknown as Rqo,
		{
			requestId: 'observer_native_test',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
}

/** The exact rqo the differential saves (client save of an INDEXER locator). */
function saveRqo(recordId: number): Record<string, unknown> {
	const item = {
		id: 1,
		type: 'dd96',
		section_id: String(TERM.section_id),
		section_tipo: TERM.section_tipo,
		from_component_tipo: INDEXER,
	};
	return {
		action: 'save',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			typo: 'source',
			type: 'component',
			model: 'component_autocomplete_hi',
			tipo: INDEXER,
			section_tipo: REF_SECTION,
			section_id: String(recordId),
			mode: 'edit',
			lang: 'lg-nolan',
			action: null,
		},
		data: {
			section_id: String(recordId),
			section_tipo: REF_SECTION,
			tipo: INDEXER,
			lang: 'lg-nolan',
			from_component_tipo: INDEXER,
			value: [item],
			changed_data: [{ action: 'set_data', key: null, value: [item] }],
		},
	};
}

async function relationSearchOf(id: number, key: string): Promise<unknown> {
	const rows = (await sql.unsafe(
		`SELECT relation_search->$2 AS rs FROM ${SCRATCH_TABLE}
		 WHERE section_tipo = '${REF_SECTION}' AND section_id = $1`,
		[id, key],
	)) as { rs: unknown }[];
	return rows[0]?.rs ?? null;
}

async function clearResolverCaches(): Promise<void> {
	const { clearOntologyDerivedCaches } = await import(
		'../../src/core/ontology/cache_invalidation.ts'
	);
	await clearOntologyDerivedCaches();
}

/**
 * Residue-tolerant sweep: the two scratch sections are emptied WHOLE (they
 * exist only for this file, so every row on them is scratch by construction),
 * and the ontology band goes with them. Run BEFORE the seed as well as after,
 * so a crashed run cannot leave a fixture that fakes a green.
 */
async function sweepScratch(): Promise<void> {
	await sql.unsafe(`DELETE FROM dd_ontology WHERE tipo LIKE 'test9996%' AND tld = 'test'`);
	for (const sectionTipo of [TERM_SECTION, REF_SECTION]) {
		await sql.unsafe(`DELETE FROM ${SCRATCH_TABLE} WHERE section_tipo = $1`, [sectionTipo]);
		await sql.unsafe(`DELETE FROM matrix_time_machine WHERE section_tipo = $1`, [sectionTipo]);
		// matrix_counter is keyed by `tipo` (no section_tipo column) — the row
		// createSectionRecord allocates ids from.
		await sql.unsafe(`DELETE FROM matrix_counter WHERE tipo = $1`, [sectionTipo]);
	}
}

beforeAll(async () => {
	await sweepScratch();
	// The two sections. `test24` is the matrix_table node whose term is
	// `matrix_test` — asserted below, never assumed.
	for (const sectionTipo of [TERM_SECTION, REF_SECTION]) {
		await sql.unsafe(
			`INSERT INTO dd_ontology (id, tipo, parent, model, tld, relations, term)
			 VALUES ((SELECT COALESCE(MAX(id), 0) + 1500 FROM dd_ontology), $1, 'test1', 'section', 'test', $2::text::jsonb, $3::text::jsonb)`,
			[
				sectionTipo,
				JSON.stringify([{ tipo: 'test24' }]),
				JSON.stringify({ 'lg-eng': `observer native scratch ${sectionTipo}` }),
			],
		);
	}
	for (const node of SCRATCH_NODES) {
		await sql.unsafe(
			`INSERT INTO dd_ontology (id, tipo, parent, model, tld, properties)
			 VALUES ((SELECT COALESCE(MAX(id), 0) + 1500 FROM dd_ontology), $1, $2, $3, 'test', $4::text::jsonb)`,
			[node.tipo, node.parent, node.model, JSON.stringify(node.properties)],
		);
	}
	await clearResolverCaches();
	const { getMatrixTableFromTipo } = await import('../../src/core/ontology/resolver.ts');
	expect(await getMatrixTableFromTipo(TERM_SECTION)).toBe(SCRATCH_TABLE);
	expect(await getMatrixTableFromTipo(REF_SECTION)).toBe(SCRATCH_TABLE);

	// The term and its ancestor chain — what the relation_search golden walks.
	for (const [id, parentId] of TERM_CHAIN) {
		const relation =
			parentId === null
				? {}
				: {
						[PARENT_COMPONENT]: [
							{
								type: 'dd47',
								section_id: String(parentId),
								section_tipo: TERM_SECTION,
								from_component_tipo: PARENT_COMPONENT,
							},
						],
					};
		await sql.unsafe(
			`INSERT INTO ${SCRATCH_TABLE} (section_id, section_tipo, relation) VALUES ($1, $2, $3::text::jsonb)`,
			[id, TERM_SECTION, JSON.stringify(relation)],
		);
	}

	original = await termBag();
	twinA = await createSectionRecord(REF_SECTION, -1);
	twinB = await createSectionRecord(REF_SECTION, -1);

	await dispatchAsRoot(saveRqo(twinA));
	afterFirst = await termBag();
	await dispatchAsRoot(saveRqo(twinB));
	afterSecond = await termBag();

	twinASearch = await relationSearchOf(twinA, INDEXER);
	twinBSearch = await relationSearchOf(twinB, INDEXER);

	// Cleanup through the DELETE pipeline (inverse cleanup restores the term).
	await deleteSectionRecord(REF_SECTION, twinA, -1);
	await deleteSectionRecord(REF_SECTION, twinB, -1);
	afterCleanup = await termBag();
}, 60000);

afterAll(async () => {
	await sweepScratch();
	await clearResolverCaches();
});

describe('observer propagation TS-native (INDEXER → MIRROR)', () => {
	// The situation starts with an EMPTY mirror, so the append law is pinned
	// against a known baseline rather than against whatever a corpus held.
	test('the fixture starts from an empty mirror (the append baseline is known)', () => {
		expect(original).toEqual([]);
	});

	// WC-2026-08-10-section-id-int-canonical: the mirror entry's address is int.
	test('first save APPENDS the mirror entry at the term: next id, dd151, int section_id', () => {
		expect(afterFirst.length).toBe(original.length + 1);
		// existing entries preserved byte-identically, in place
		expect(afterFirst.slice(0, -1)).toEqual(original);
		const maxExistingId = (original as { id?: number }[]).reduce(
			(max, entry) => Math.max(max, Number(entry?.id ?? 0)),
			0,
		);
		expect(afterFirst[afterFirst.length - 1]).toEqual({
			id: maxExistingId + 1,
			type: 'dd151',
			section_id: twinA,
			section_tipo: REF_SECTION,
			from_component_tipo: MIRROR,
		});
	});

	test('second save appends AFTER the first, id incremented again', () => {
		expect(afterSecond.length).toBe(original.length + 2);
		expect(afterSecond.slice(0, -1)).toEqual(afterFirst);
		const firstEntry = afterFirst[afterFirst.length - 1] as { id: number };
		expect(afterSecond[afterSecond.length - 1]).toEqual({
			id: firstEntry.id + 1,
			type: 'dd151',
			section_id: twinB,
			section_tipo: REF_SECTION,
			from_component_tipo: MIRROR,
		});
	});

	test('the save writes the relation_search ancestor index (oracle-captured golden)', () => {
		expect(twinASearch).toEqual(RELATION_SEARCH_GOLDEN);
		expect(twinBSearch).toEqual(RELATION_SEARCH_GOLDEN);
	});

	test('deleting the twins restores the term to its original bag', () => {
		expect(afterCleanup).toEqual(original);
	});
});

// Bypass doors (review 2026-07-24): deletePortalLocator and duplicate write
// relation slots WITHOUT the saveComponentData chokepoint, so each fires the
// cascade itself — a refactor that drops/reorders either call must fail HERE.
describe('bypass doors fire the observer cascade', () => {
	test('duplicate ADDS the copy to the mirror; delete_locator REMOVES it', async () => {
		const base = await termBag();
		let twin = 0;
		let copy = 0;
		try {
			twin = await createSectionRecord(REF_SECTION, -1);
			await dispatchAsRoot(saveRqo(twin));
			expect((await termBag()).length).toBe(base.length + 1);

			// duplicate door: the copy is a NEW referencer → mirror gains it.
			const { duplicateSectionRecord } = await import(
				'../../src/core/section/record/duplicate_record.ts'
			);
			copy = await duplicateSectionRecord(REF_SECTION, twin, -1);
			expect((await termBag()).length).toBe(base.length + 2);

			// delete_locator door: removing the twin's locator fires the cascade at
			// the REMOVED target, and the recompute — a pure shrink — now APPLIES
			// (2026-08-06). This assertion is inverted from what it pinned before:
			// under the Phase-0 grow-only fail-safe the mirror KEPT the stale twin
			// entry, which is precisely the reported bug (an unlinked reference
			// mirrored forever). The copy stays, so the drop is adjudicated per
			// entry — not by length.
			const { deletePortalLocator } = await import('../../src/core/relations/save.ts');
			const refusedBefore = getCounters().observers_shrink_refused ?? 0;
			await deletePortalLocator(
				{ isGlobalAdmin: true, userId: -1 },
				{ tipo: INDEXER, section_tipo: REF_SECTION, section_id: twin },
				{
					locator: {
						type: 'dd96',
						section_id: String(TERM.section_id),
						section_tipo: TERM.section_tipo,
						from_component_tipo: INDEXER,
					},
					ar_properties: ['section_tipo', 'section_id', 'type', 'from_component_tipo'],
				},
			);
			// No refusal fires on a clean seed — the drop is simply the law.
			expect((getCounters().observers_shrink_refused ?? 0) - refusedBefore).toBe(0);
			const afterRemoval = await termBag();
			// The twin's entry is GONE; the duplicate's survives.
			expect(afterRemoval.length).toBe(base.length + 1);
			// WC-2026-08-10-section-id-int-canonical: mirror entries carry int
			// addresses, so identify them by the int (no String() laundering).
			expect(
				afterRemoval.some(
					(entry) => (entry as { section_id?: number | string }).section_id === twin,
				),
			).toBe(false);
			expect(
				afterRemoval.some(
					(entry) => (entry as { section_id?: number | string }).section_id === copy,
				),
			).toBe(true);
		} finally {
			// Delete pipeline restores the mirror; raw sweep is the crash belt.
			for (const id of [copy, twin]) {
				if (id === 0) continue;
				await deleteSectionRecord(REF_SECTION, id, -1).catch(() => {});
				await sql.unsafe(
					`DELETE FROM ${SCRATCH_TABLE} WHERE section_tipo = $1 AND section_id = $2`,
					[REF_SECTION, id],
				);
				await sql.unsafe(
					`DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2`,
					[REF_SECTION, id],
				);
			}
		}
		expect(await termBag()).toEqual(base);
	}, 30000);
});

// DEFAULT branch (server.filter === false): saving TAG_TEXT (tag text) triggers
// the TAG_INDEX observer on the SAME record. ORACLE PIN (differential, live
// 2026-07-11): PHP leaves the relation_search index UNTOUCHED in this flow —
// the TS branch must no-op identically. If the TS branch ever starts writing
// it, this fails and the divergence needs a fresh oracle run + ledger line.
describe('observer DEFAULT self-refresh TS-native (TAG_TEXT → TAG_INDEX relation_search no-op)', () => {
	test('the tag-text save leaves relation_search[TAG_INDEX] unwritten (null)', async () => {
		const id = await createSectionRecord(REF_SECTION, -1);
		const bag = [
			{
				id: 1,
				type: 'dd96',
				section_id: String(TERM.section_id),
				section_tipo: TERM.section_tipo,
				from_component_tipo: TAG_INDEX,
			},
		];
		await sql.unsafe(
			`UPDATE ${SCRATCH_TABLE}
			 SET relation = COALESCE(relation, '{}'::jsonb) || jsonb_build_object($3::text, $2::text::jsonb)
			 WHERE section_tipo = '${REF_SECTION}' AND section_id = $1`,
			[id, JSON.stringify(bag), TAG_INDEX],
		);
		try {
			await dispatchAsRoot({
				action: 'save',
				dd_api: 'dd_core_api',
				prevent_lock: true,
				source: {
					typo: 'source',
					type: 'component',
					model: 'component_text_area',
					tipo: TAG_TEXT,
					section_tipo: REF_SECTION,
					section_id: String(id),
					mode: 'edit',
					lang: 'lg-nolan',
					action: null,
				},
				data: {
					section_id: String(id),
					section_tipo: REF_SECTION,
					tipo: TAG_TEXT,
					lang: 'lg-nolan',
					from_component_tipo: TAG_TEXT,
					value: [{ id: 1, lang: 'lg-nolan', value: 'OBSERVER_REFRESH_NATIVE_GATE' }],
					changed_data: [
						{
							action: 'set_data',
							key: null,
							value: [{ id: 1, lang: 'lg-nolan', value: 'OBSERVER_REFRESH_NATIVE_GATE' }],
						},
					],
				},
			});
			expect(await relationSearchOf(id, TAG_INDEX)).toBeNull();
		} finally {
			await deleteSectionRecord(REF_SECTION, id, -1);
			await sql.unsafe(`DELETE FROM ${SCRATCH_TABLE} WHERE section_tipo = $1 AND section_id = $2`, [
				REF_SECTION,
				id,
			]);
			await sql.unsafe(
				`DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2`,
				[REF_SECTION, id],
			);
		}
	}, 60000);
});
