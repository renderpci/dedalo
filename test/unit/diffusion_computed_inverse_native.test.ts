/**
 * Computed-model relation hops in the diffusion resolver — the gate for the
 * hierarchy40-class NULL-publication bug (2026-08-11).
 *
 * THE DEFECT THIS PINS. component_relation_index and
 * component_relation_children STORE NOTHING under their own tipo: both are
 * computed per read (the inverse matrix_relation_index question, resp. the
 * derived dd47 children). The old resolveHop read every non-relation_list hop
 * through readComponentItems (the stored slice), so a ddo chain hopping
 * through either model got rawLocators = [], zero atoms, and the published
 * column was silently NULL. The fix routes ONLY the locator source through
 * the models' own engines (resolveIndexConfig + findInverseReferenceLocators,
 * resp. getChildren); queueing, gates and child recursion are untouched.
 *
 * WHY THIS FAILS ON THE OLD BEHAVIOUR: every positive assertion below rests
 * on locators the stored slice cannot produce — the seeded records carry NO
 * data under test25/test201 (faithful: these models never store any). Old
 * code ⇒ empty atoms, NULL columns, no frontier batches ⇒ cases 1-3 all red.
 *
 * Scratch convention (database_info_integrity_native.test.ts): matrix_test /
 * section test3, own id subrange, fail-loud empty-before / clean-after checks
 * over matrix_test + matrix_time_machine + matrix_relation_index. The preload
 * (canonical_test3.ts) additionally wipes test3 strays before every run.
 * All records here are MINTED by this file — never a mutable production row.
 *
 * Fixture ontology (verified in dd_ontology, beforeAll fails loud if absent):
 * - test25  component_relation_index, no request_config ⇒ relationType dd96,
 *   targetSections 'all' — byte-identical config shape to hierarchy40.
 * - test201 component_relation_children ↔ test71 component_relation_parent.
 * - test52  component_input_text (the leaf the chains publish).
 * - test92  component_publication (dd64/1 = yes) — the live gate is used,
 *   no skipPublicationStateCheck shortcut.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { getChildren } from '../../src/core/relations/children.ts';
import { findInverseReferenceLocators } from '../../src/core/search/search_related.ts';
import type { PublicationPlan } from '../../src/diffusion/plan/types.ts';
import type { ResolvedBatch, ResolveOptions } from '../../src/diffusion/resolve/resolver.ts';
import { resolvePublication } from '../../src/diffusion/resolve/resolver.ts';

// ---------------------------------------------------------------------------
// Scratch surface — own subrange so a parallel/crashed sibling suite
// (database_info_integrity_native uses 930000-930999) can never collide.
// ---------------------------------------------------------------------------
const SECTION_TIPO = 'test3';
const ID_MIN = 931100;
const ID_MAX = 931199;
const HOST_ID = 931101; // the record the computed hops are asked about
const POINTER_A = 931102; // dd96-references HOST via test54 (portal)
const POINTER_B = 931103; // dd96-references HOST via test54 (portal)
const CHILD_A = 931104; // dd47 parent-links to HOST via test71
const CHILD_B = 931105; // dd47 parent-links to HOST via test71
const LONER_ID = 931110; // negative control: nothing points at it

const RUN_STARTED_AT = 1_754_900_000; // deterministic epoch seconds

/** test92 publication = yes (dd64/1) — the same shape live test3 records carry. */
const PUB_YES = {
	id: 1,
	type: 'dd151',
	section_id: '1',
	section_tipo: 'dd64',
	from_component_tipo: 'test92',
};

async function cleanScratch(): Promise<void> {
	await sql`DELETE FROM matrix_test
	          WHERE section_tipo = ${SECTION_TIPO} AND section_id BETWEEN ${ID_MIN} AND ${ID_MAX}`;
	await sql`DELETE FROM matrix_time_machine
	          WHERE section_tipo = ${SECTION_TIPO} AND section_id BETWEEN ${ID_MIN} AND ${ID_MAX}`;
}

/** Rows left on any surface this suite touches (index rows are trigger-owned). */
async function scratchResidue(): Promise<number> {
	const [m] = (await sql`SELECT count(*)::int AS n FROM matrix_test
		WHERE section_tipo = ${SECTION_TIPO} AND section_id BETWEEN ${ID_MIN} AND ${ID_MAX}`) as {
		n: number;
	}[];
	const [tm] = (await sql`SELECT count(*)::int AS n FROM matrix_time_machine
		WHERE section_tipo = ${SECTION_TIPO} AND section_id BETWEEN ${ID_MIN} AND ${ID_MAX}`) as {
		n: number;
	}[];
	const [ri] = (await sql`SELECT count(*)::int AS n FROM matrix_relation_index
		WHERE section_tipo = ${SECTION_TIPO} AND section_id BETWEEN ${ID_MIN} AND ${ID_MAX}`) as {
		n: number;
	}[];
	return (m?.n ?? 0) + (tm?.n ?? 0) + (ri?.n ?? 0);
}

async function seedRecord(
	sectionId: number,
	relation: Record<string, unknown>,
	text: string,
): Promise<void> {
	const stringColumn = { test52: [{ id: 1, lang: 'lg-eng', value: text }] };
	await sql.unsafe(
		`INSERT INTO matrix_test (section_tipo, section_id, relation, string)
		 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb)`,
		[SECTION_TIPO, sectionId, JSON.stringify(relation), JSON.stringify(stringColumn)],
	);
}

// ---------------------------------------------------------------------------
// Hand-written plans. resolvePublication is the ONLY door into walkChainLevel
// (PreparedField/prepareFields are module-private), and PublicationPlan is
// documented as a plain JSON-serializable value — so the plan is a literal:
// no compile, no diffusion domain, no VirtualDiffusionTree (warnings: [] ⇒
// the resolver never fetches it).
// ---------------------------------------------------------------------------

interface HopSpec {
	tipo: string;
	model: string;
}

/**
 * One-section plan over test3: `<column>` = hop → test52 leaf (the published
 * text), `<column>_raw` = the bare hop (its chain atoms expose the resolved
 * locators for the atoms-vs-engine equality assertions).
 */
function planFor(hop: HopSpec, column: string): PublicationPlan {
	return {
		planId: `test-computed-inverse-${hop.model}`,
		elementTipo: 'test_element',
		format: 'sql',
		serviceName: null,
		target: { kind: 'table', database: 'scratch_unused' },
		sections: [
			{
				sectionTipo: SECTION_TIPO,
				tableName: 'scratch_unused',
				tableTipo: 'test_table_node',
				fields: [
					{
						id: 'field_a',
						columnName: column,
						sourceChain: [
							{ kind: 'relation-hop', tipo: hop.tipo, model: hop.model, sectionTipo: SECTION_TIPO },
							{
								kind: 'component',
								tipo: 'test52',
								model: 'component_input_text',
								sectionTipo: SECTION_TIPO,
								parent: hop.tipo,
							},
						],
						transform: [],
						column: { fieldModel: 'field_text' },
						policy: {},
					},
					{
						id: 'field_b',
						columnName: `${column}_raw`,
						sourceChain: [
							{ kind: 'relation-hop', tipo: hop.tipo, model: hop.model, sectionTipo: SECTION_TIPO },
						],
						transform: [],
						column: { fieldModel: 'field_text' },
						policy: {},
					},
				],
			},
		],
		recursion: { maxLevels: 0 },
		langPolicy: { langs: ['lg-eng'], mainLang: 'lg-eng' },
		warnings: [],
	};
}

const INDEX_PLAN = planFor({ tipo: 'test25', model: 'component_relation_index' }, 'who_refs');
const CHILDREN_PLAN = planFor(
	{ tipo: 'test201', model: 'component_relation_children' },
	'children_of',
);
// relation_list contrast plan (case 3): bare hop only — it exists to show the
// :1131 queue exemption still holds for relation_list WHILE its locators are
// non-empty (so the no-queue observation is not vacuous).
const RELATION_LIST_PLAN: PublicationPlan = {
	...planFor({ tipo: 'test25', model: 'relation_list' }, 'refs_list'),
	planId: 'test-computed-inverse-relation-list',
};
// Keep only the bare-hop field (field_b) — built from the literal one line up.
const relationListSection = RELATION_LIST_PLAN.sections[0];
const relationListBareField = relationListSection?.fields[1];
if (relationListSection === undefined || relationListBareField === undefined) {
	throw new Error('relation_list contrast plan lost its bare-hop field');
}
relationListSection.fields = [relationListBareField];

async function runResolution(
	plan: PublicationPlan,
	sectionId: number,
	maxLevels: number,
	overrides: Partial<ResolveOptions> = {},
): Promise<ResolvedBatch[]> {
	const batches: ResolvedBatch[] = [];
	const generator = resolvePublication(plan, {
		sectionTipo: SECTION_TIPO,
		runStartedAt: RUN_STARTED_AT,
		sqo: {
			section_tipo: SECTION_TIPO,
			filter_by_locators: [{ section_tipo: SECTION_TIPO, section_id: String(sectionId) }],
		},
		maxLevels,
		...overrides,
	});
	for await (const batch of generator) batches.push(batch);
	return batches;
}

/** {sectionTipo, sectionId} pairs of a bare-hop field's chain atoms. */
function chainAtomPairs(batch: ResolvedBatch, fieldId: string): [string, number][] {
	const field = batch.records[0]?.fields.get(fieldId);
	const values = (field?.values ?? []) as {
		kind: string;
		links?: { sectionTipo: string; sectionId: number | string }[];
	}[];
	const pairs: [string, number][] = [];
	for (const atom of values) {
		expect(atom.kind).toBe('chain'); // a bare hop resolves to locator chains
		for (const link of atom.links ?? []) pairs.push([link.sectionTipo, Number(link.sectionId)]);
	}
	return pairs;
}

beforeAll(async () => {
	// FAIL LOUD, never invisible-green: no trigger / no fixture ontology / a
	// dirty surface each abort the suite with a real error (the ledgered
	// anti-pattern is `if (!ready) return` — a green run that asserted nothing).
	const trigger = (await sql`
		SELECT 1 AS ok FROM pg_trigger WHERE tgname = 'matrix_test_relation_index_sync' LIMIT 1
	`) as { ok: number }[];
	if (trigger.length === 0) {
		throw new Error(
			'matrix_test has no relation_index sync trigger — the relation-index store is unmaintained on this database',
		);
	}

	const nodes = (await sql`
		SELECT tipo, model FROM dd_ontology
		WHERE tipo IN ('test25', 'test201', 'test71', 'test52', 'test92')
	`) as { tipo: string; model: string }[];
	const modelOf = new Map(nodes.map((node) => [node.tipo, node.model]));
	const expected: [string, string][] = [
		['test25', 'component_relation_index'],
		['test201', 'component_relation_children'],
		['test71', 'component_relation_parent'],
		['test52', 'component_input_text'],
		['test92', 'component_publication'],
	];
	for (const [tipo, model] of expected) {
		if (modelOf.get(tipo) !== model) {
			throw new Error(
				`fixture ontology missing/drifted: expected ${tipo}=${model}, got '${modelOf.get(tipo)}'`,
			);
		}
	}

	const residue = await scratchResidue();
	if (residue > 0) throw new Error(`scratch surface not empty before seeding: ${residue} row(s)`);

	// HOST: publication yes, NOTHING stored under test25/test201 — faithful to
	// the computed models' storage contract (they never store anything).
	await seedRecord(HOST_ID, { test92: [PUB_YES] }, 'host text');
	// Pointers: a dd96 relation entry targeting HOST (what test25 inverts).
	for (const [id, label] of [
		[POINTER_A, 'pointer A text'],
		[POINTER_B, 'pointer B text'],
	] as [number, string][]) {
		await seedRecord(
			id,
			{
				test92: [PUB_YES],
				test54: [
					{
						id: 1,
						type: 'dd96',
						section_tipo: SECTION_TIPO,
						section_id: String(HOST_ID),
						from_component_tipo: 'test54',
					},
				],
			},
			label,
		);
	}
	// Children: a dd47 parent link (test71) targeting HOST (what test201 derives from).
	for (const [id, label] of [
		[CHILD_A, 'child A text'],
		[CHILD_B, 'child B text'],
	] as [number, string][]) {
		await seedRecord(
			id,
			{
				test92: [PUB_YES],
				test71: [
					{
						id: 1,
						type: 'dd47',
						section_tipo: SECTION_TIPO,
						section_id: String(HOST_ID),
						from_component_tipo: 'test71',
					},
				],
			},
			label,
		);
	}
	// Negative control: publishable, but nothing anywhere points at it.
	await seedRecord(LONER_ID, { test92: [PUB_YES] }, 'loner text');
});

afterAll(async () => {
	await cleanScratch();
	const residue = await scratchResidue();
	if (residue > 0) throw new Error(`scratch surface left ${residue} row(s) behind`);
});

// ---------------------------------------------------------------------------
// Case 1 — component_relation_index
// ---------------------------------------------------------------------------
describe('component_relation_index hop (the hierarchy40 bug)', () => {
	test('resolved atoms are non-empty and equal the findInverseReferenceLocators set; the column publishes NON-NULL', async () => {
		const batches = await runResolution(INDEX_PLAN, HOST_ID, 0);
		expect(batches.length).toBe(1);
		const batch = batches[0] as ResolvedBatch;
		expect(batch.records.length).toBe(1);
		expect(batch.records[0]?.status).toBe('publish');
		expect(batch.errors).toEqual([]);

		// Atoms of the bare hop = the locators; OLD behaviour: [] (stored slice
		// of test25 is empty by definition), so this line is the bug's tombstone.
		const atomPairs = chainAtomPairs(batch, 'field_b');
		expect(atomPairs.length).toBeGreaterThan(0);

		// The SAME inverse question the read path asks (resolveIndexConfig on
		// test25 yields relationType dd96, targetSections 'all' — no
		// request_config), asked directly of the engine:
		const engineHits = await findInverseReferenceLocators(
			[{ type: 'dd96', section_tipo: SECTION_TIPO, section_id: HOST_ID }],
			{ sectionTipos: 'all', limit: false, order: 'section_id' },
		);
		const enginePairs = engineHits.map(
			(hit) => [hit.section_tipo, Number(hit.section_id)] as [string, number],
		);
		expect(atomPairs).toEqual(enginePairs);
		// ...and the seeded ground truth, so neither side is trusted blindly:
		expect(atomPairs).toEqual([
			[SECTION_TIPO, POINTER_A],
			[SECTION_TIPO, POINTER_B],
		]);

		// The published column: the pointers' test52 values — NOT NULL.
		expect(batch.rows.length).toBe(1); // one configured lang
		const column = batch.rows[0]?.columns.who_refs;
		expect(column).not.toBeNull();
		expect(column).toContain('pointer A text');
		expect(column).toContain('pointer B text');
	});

	test('negative control: a record nothing references still publishes NULL (empty is honest, not a masked bug)', async () => {
		const batches = await runResolution(INDEX_PLAN, LONER_ID, 0);
		expect(batches.length).toBe(1);
		expect(batches[0]?.errors).toEqual([]);
		expect(chainAtomPairs(batches[0] as ResolvedBatch, 'field_b')).toEqual([]);
		expect(batches[0]?.rows[0]?.columns.who_refs).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Case 2 — component_relation_children
// ---------------------------------------------------------------------------
describe('component_relation_children hop', () => {
	test('resolved atoms equal the getChildren set; the column publishes the children texts NON-NULL', async () => {
		const batches = await runResolution(CHILDREN_PLAN, HOST_ID, 0);
		expect(batches.length).toBe(1);
		const batch = batches[0] as ResolvedBatch;
		expect(batch.errors).toEqual([]);

		const atomPairs = chainAtomPairs(batch, 'field_b');
		expect(atomPairs.length).toBeGreaterThan(0);

		// The SAME engine relationChildrenResolver rides, asked directly:
		const engineChildren = await getChildren(HOST_ID, SECTION_TIPO, 'test201', 0, 0);
		const enginePairs = engineChildren.map(
			(child) => [child.section_tipo, Number(child.section_id)] as [string, number],
		);
		expect(atomPairs).toEqual(enginePairs);
		expect(atomPairs).toEqual([
			[SECTION_TIPO, CHILD_A],
			[SECTION_TIPO, CHILD_B],
		]);

		const column = batch.rows[0]?.columns.children_of;
		expect(column).not.toBeNull();
		expect(column).toContain('child A text');
		expect(column).toContain('child B text');
	});

	test('negative control: a childless record publishes NULL', async () => {
		const batches = await runResolution(CHILDREN_PLAN, LONER_ID, 0);
		expect(batches.length).toBe(1);
		expect(chainAtomPairs(batches[0] as ResolvedBatch, 'field_b')).toEqual([]);
		expect(batches[0]?.rows[0]?.columns.children_of).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Case 3 — THE CONSTRAINT: only the locator source changed; queueing still
// obeys the generic level/sectionPlans rule of resolver.ts (queue guard).
//
// HONESTY NOTE: ctx.frontier is module-private, so the frontier is asserted
// through its ONLY observable consequence — the yielded level-(N-1) batches.
// That proxy is exact, not approximate: a frontier entry either becomes a
// yielded batch or the record was already used this run (not the case here).
// ---------------------------------------------------------------------------
describe('queueing is unchanged (locator source only)', () => {
	test('an index hop QUEUES its linked plan-section records within the level budget (generic rule, no computed-model special case)', async () => {
		const batches = await runResolution(INDEX_PLAN, HOST_ID, 1);
		// primary batch at level 1 + ONE frontier batch at level 0 with exactly
		// the hop's linked records. Old behaviour: zero locators ⇒ no frontier
		// batch at all ⇒ this fails red.
		expect(batches.length).toBe(2);
		expect(batches[0]?.level).toBe(1);
		expect(batches[1]?.level).toBe(0);
		const frontierIds = (batches[1]?.records ?? [])
			.map((record) => Number(record.sectionId))
			.sort();
		expect(frontierIds).toEqual([POINTER_A, POINTER_B]);
	});

	test('a children hop queues identically', async () => {
		const batches = await runResolution(CHILDREN_PLAN, HOST_ID, 1);
		expect(batches.length).toBe(2);
		expect(batches[1]?.level).toBe(0);
		const frontierIds = (batches[1]?.records ?? [])
			.map((record) => Number(record.sectionId))
			.sort();
		expect(frontierIds).toEqual([CHILD_A, CHILD_B]);
	});

	test('level budget still gates: maxLevels 0 yields NO frontier batch', async () => {
		const batches = await runResolution(INDEX_PLAN, HOST_ID, 0);
		expect(batches.length).toBe(1);
	});

	test('the relation_list exemption was NOT extended: its hop resolves non-empty locators yet never queues', async () => {
		const batches = await runResolution(RELATION_LIST_PLAN, HOST_ID, 1);
		// relation_list inverts EVERY relation type pointing at HOST: the two
		// dd96 pointers AND the two dd47 parent links = 4 locators — non-empty,
		// so the single-batch observation below is not vacuously true.
		const atomPairs = chainAtomPairs(batches[0] as ResolvedBatch, 'field_b');
		expect(atomPairs.length).toBe(4);
		expect(batches.length).toBe(1); // no frontier despite budget + SectionPlan
	});
});
