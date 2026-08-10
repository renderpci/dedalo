/**
 * TREE SEARCH — TS-native gate for `searchThesaurus`
 * (src/core/ts_object/search.ts:71).
 *
 * The function turns a flat list of search hits into the PARTIAL TREE the
 * client renders: every hit, the full ancestor chain of every hit, and the
 * COMPLETE sibling list at each ancestor level, deduped by `tipo:id` in
 * insertion order. Three contracts are load-bearing and were ungated:
 *
 *  1. `found[].section_id` is a STRING (wire fact — PHP pushes the DB row id
 *     through a locator, and the client compares it as a string).
 *  2. children get a POSITIONAL order (index+1 in the sibling list), NOT their
 *     stored order value (a PHP quirk preserved on purpose).
 *  3. FIRST WINS: a node already in the map is never rebuilt. Both `has()`
 *     guards are exercised with fixtures where the second write WOULD differ:
 *      - the ancestor guard: a mid-chain ancestor is written first as a
 *        POSITIONAL SIBLING (order 1); the ancestor branch would rewrite it
 *        with `options = {}` → order null. Needs a TWO-LEVEL chain.
 *      - the sibling guard: a MULTI-PARENT node appears in two different
 *        ancestors' children lists; the second write would change its
 *        `ts_parent`. (A single-level fixture cannot gate either guard —
 *        deleting them yields a byte-identical Map.)
 *
 * SCRATCH SURFACES (this file owns them exclusively):
 *  - matrix_test, section_tipo 'test3', section_id 923000..923999 — seeded by
 *    DIRECT INSERT (no matrix_counter bump) and swept before every test plus a
 *    fail-loud afterAll.
 *  - matrix_time_machine tails for the same range.
 * Nothing outside that range is written; the canonical test3 rows (1, 2, 27)
 * are never touched, and no table-global count is ever asserted.
 */

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { addParent } from '../../src/core/relations/parent.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { searchThesaurus } from '../../src/core/ts_object/search.ts';

const SECTION = 'test3';
const TABLE = 'matrix_test';
const PARENT_TIPO = 'test71'; // component_relation_parent of test3
const ORDER_TIPO = 'test22'; // component_number carrying the per-parent order
const TERM_TIPO = 'test52'; // component_input_text (the thesaurus term)
const DESCRIPTOR_TIPO = 'test88'; // is_descriptor (dd64 si/no)

const SCRATCH_MIN = 923000;
const SCRATCH_MAX = 923999;

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };

type NodeData = Awaited<ReturnType<typeof searchThesaurus>>['result'][number];

function siNoYes(componentTipo: string): Record<string, unknown> {
	return {
		id: 1,
		type: 'dd151',
		section_id: '1',
		section_tipo: 'dd64',
		from_component_tipo: componentTipo,
	};
}

/**
 * Direct INSERT of a scratch node carrying `term` in test52 (searchable) and a
 * descriptor flag. `relation` starts with an EMPTY parent array — the shape a
 * real rootless thesaurus term has (canonical test3/1 stores exactly that).
 */
async function seedNode(sectionId: number, term: string): Promise<void> {
	if (sectionId < SCRATCH_MIN || sectionId > SCRATCH_MAX) {
		throw new Error(`seedNode: ${sectionId} is outside this file's scratch range`);
	}
	await sql.unsafe(
		`INSERT INTO "${TABLE}" (section_tipo, section_id, string, relation)
		 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb)`,
		[
			SECTION,
			sectionId,
			encodeForJsonb({ [TERM_TIPO]: [{ id: 1, lang: 'lg-eng', value: term }] }),
			encodeForJsonb({ [DESCRIPTOR_TIPO]: [siNoYes(DESCRIPTOR_TIPO)], [PARENT_TIPO]: [] }),
		],
	);
}

/** Link `childId` under `parentId` through the real machinery (id + order allocation). */
async function link(childId: number, parentId: number): Promise<void> {
	const added = await addParent(SECTION, childId, PARENT_TIPO, {
		section_tipo: SECTION,
		section_id: parentId,
		from_component_tipo: PARENT_TIPO,
		type: 'dd47',
	});
	if (!added.ok) throw new Error(`fixture link ${childId}→${parentId} failed`);
}

/** Overwrite the child's per-parent stored order value (id_key 1 = its first parent link). */
async function setStoredOrder(childId: number, idKey: number, value: number): Promise<void> {
	await sql.unsafe(
		`UPDATE "${TABLE}" SET "number" = jsonb_set(COALESCE("number", '{}'::jsonb), $3::text[], $4::text::jsonb)
		  WHERE section_tipo = $1 AND section_id = $2`,
		[
			SECTION,
			childId,
			`{${ORDER_TIPO}}`,
			encodeForJsonb([{ id: idKey, value }]) as unknown as string,
		],
	);
}

/** The thesaurus SQO the client sends: one contains-filter on the term component. */
function termSqo(term: string): Record<string, unknown> {
	return {
		id: 'thesaurus',
		section_tipo: [SECTION],
		limit: 100,
		offset: 0,
		filter: {
			$and: [{ q: term, path: [{ section_tipo: SECTION, component_tipo: TERM_TIPO }] }],
		},
		select: [],
	};
}

function nodeOf(result: NodeData[], sectionId: number): NodeData {
	const found = result.find((node) => node.ts_id === `${SECTION}_${sectionId}`);
	if (found === undefined) {
		throw new Error(
			`expected node ${SECTION}_${sectionId} in the result (got ${result.map((n) => n.ts_id).join(', ')})`,
		);
	}
	return found;
}

async function sweepScratch(): Promise<void> {
	await sql.unsafe(
		`DELETE FROM "${TABLE}" WHERE section_tipo = $1 AND section_id BETWEEN $2 AND $3`,
		[SECTION, SCRATCH_MIN, SCRATCH_MAX],
	);
	await sql.unsafe(
		`DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id BETWEEN $2 AND $3`,
		[SECTION, SCRATCH_MIN, SCRATCH_MAX],
	);
}

beforeEach(async () => {
	await sweepScratch();
	// getChildren/ts_object memoize per-ontology lookups AND the node terms; a
	// scratch id reused across cases would otherwise serve a previous fixture.
	await clearOntologyDerivedCaches();
});

afterAll(async () => {
	await sweepScratch();
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM "${TABLE}"
		  WHERE section_tipo = $1 AND section_id BETWEEN $2 AND $3`,
		[SECTION, SCRATCH_MIN, SCRATCH_MAX],
	)) as { n: number }[];
	const tm = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM matrix_time_machine
		  WHERE section_tipo = $1 AND section_id BETWEEN $2 AND $3`,
		[SECTION, SCRATCH_MIN, SCRATCH_MAX],
	)) as { n: number }[];
	if (Number(rows[0]?.n) !== 0 || Number(tm[0]?.n) !== 0) {
		throw new Error(
			`ts_search_native: scratch cleanup did NOT reach zero (matrix=${rows[0]?.n}, time_machine=${tm[0]?.n})`,
		);
	}
});

// ===========================================================================
// hit + ancestor expansion
// ===========================================================================
describe('searchThesaurus — a hit expands into its ancestor chain', () => {
	test('emits the hit (positional order, parent ts_id) then its root, with a STRING found id', async () => {
		const ROOT = 923100;
		const CHILD = 923110;
		const TERM = 'ZZTSSEARCHalpha';
		await seedNode(ROOT, 'ZZTSSEARCHrootalpha');
		await seedNode(CHILD, TERM);
		await link(CHILD, ROOT);

		const response = await searchThesaurus(termSqo(TERM), SUPERUSER);

		expect(response.total).toBe(1);
		expect(response.msg).toBe('Records found: 1');
		expect(response.errors).toEqual([]);
		// WIRE FACT: section_id comes back as the canonical INT
		// (WC-2026-08-10-section-id-int-canonical; was string in the PHP era).
		expect(response.found).toEqual([{ section_tipo: SECTION, section_id: CHILD }]);
		expect(typeof response.found[0]?.section_id).toBe('number');

		// insertion order: the ancestor's full sibling list first, the ancestor after.
		expect(response.result.map((node) => node.ts_id)).toEqual([
			`${SECTION}_${CHILD}`,
			`${SECTION}_${ROOT}`,
		]);

		const child = nodeOf(response.result, CHILD);
		expect(child.ts_parent).toBe(`${SECTION}_${ROOT}`);
		expect(child.order).toBe(1);
		expect(child.mode).toBe('list');
		// int-canonical node ids (WC-2026-08-10-section-id-int-canonical)
		expect(child.section_id).toBe(CHILD);
		expect(typeof child.section_id).toBe('number');

		const root = nodeOf(response.result, ROOT);
		expect(root.ts_parent).toBe('root');
		// getMainOrder('test'): no matrix_ontology_main row for the tld → null.
		expect(root.order).toBeNull();
	}, 30000);

	test('no hits → empty tree, zero total, empty found/errors', async () => {
		const response = await searchThesaurus(termSqo('ZZTSSEARCHnothingmatchesthis'), SUPERUSER);
		expect(response.total).toBe(0);
		expect(response.msg).toBe('Records found: 0');
		expect(response.result).toEqual([]);
		expect(response.found).toEqual([]);
		expect(response.errors).toEqual([]);
	}, 30000);
});

// ===========================================================================
// positional order (the PHP quirk)
// ===========================================================================
describe('searchThesaurus — sibling order is POSITIONAL, not the stored value', () => {
	test('stored orders 9 and 7 become 1 and 2 — in STORED-order sequence, not id order', async () => {
		// The lower id carries the HIGHER stored order on purpose: the emitted
		// sequence must be [LATER, EARLIER], so neither "id order" nor "the stored
		// value passed through" can satisfy the assertions.
		const ROOT = 923200;
		const LATER = 923210; // stored order 9 → second sibling
		const EARLIER = 923211; // stored order 7 → first sibling
		const TERM = 'ZZTSSEARCHbeta';
		await seedNode(ROOT, 'ZZTSSEARCHrootbeta');
		await seedNode(LATER, TERM);
		await seedNode(EARLIER, 'ZZTSSEARCHsiblingbeta');
		await link(LATER, ROOT);
		await link(EARLIER, ROOT);
		await setStoredOrder(LATER, 1, 9);
		await setStoredOrder(EARLIER, 1, 7);

		const response = await searchThesaurus(termSqo(TERM), SUPERUSER);

		expect(response.total).toBe(1);
		// the non-matching sibling is pulled in by the ancestor expansion.
		expect(response.result.map((node) => node.ts_id)).toEqual([
			`${SECTION}_${EARLIER}`,
			`${SECTION}_${LATER}`,
			`${SECTION}_${ROOT}`,
		]);
		expect(nodeOf(response.result, EARLIER).order).toBe(1);
		expect(nodeOf(response.result, LATER).order).toBe(2);
	}, 30000);
});

// ===========================================================================
// rootless hits
// ===========================================================================
describe('searchThesaurus — a hit with no parents is its own root', () => {
	test('two rootless hits yield exactly two root nodes and a two-entry found list', async () => {
		const A = 923300;
		const B = 923301;
		const TERM = 'ZZTSSEARCHgamma';
		await seedNode(A, TERM);
		await seedNode(B, TERM);

		const response = await searchThesaurus(termSqo(TERM), SUPERUSER);

		expect(response.total).toBe(2);
		expect(response.msg).toBe('Records found: 2');
		expect(response.result).toHaveLength(2);
		expect(response.result.map((node) => node.ts_id).sort()).toEqual([
			`${SECTION}_${A}`,
			`${SECTION}_${B}`,
		]);
		for (const node of response.result) {
			expect(node.ts_parent).toBe('root');
			// the rootless branch passes `{}` — no order, and getMainOrder is not consulted.
			expect(node.order).toBeNull();
		}
		// int-canonical found ids (WC-2026-08-10-section-id-int-canonical)
		expect(response.found.map((row) => row.section_id).sort()).toEqual([A, B].sort());
	}, 30000);
});

// ===========================================================================
// FIRST WINS — both has() guards, with fixtures where the 2nd write differs
// ===========================================================================
describe('searchThesaurus — first-wins dedup', () => {
	test('a mid-chain ancestor keeps the POSITIONAL order it got as a sibling', async () => {
		// two-level chain: ROOT → MID → {HIT, SIB}. MID is written twice per hit:
		// as a positional sibling of ROOT (order 1) and, one level deeper, as the
		// ancestor itself (which would pass `{}` → order null). First wins.
		const ROOT = 923400;
		const MID = 923410;
		const HIT = 923420;
		const SIB = 923421;
		const TERM = 'ZZTSSEARCHdelta';
		await seedNode(ROOT, 'ZZTSSEARCHrootdelta');
		await seedNode(MID, 'ZZTSSEARCHmiddelta');
		await seedNode(HIT, TERM);
		await seedNode(SIB, 'ZZTSSEARCHsibdelta');
		await link(MID, ROOT);
		await link(HIT, MID);
		await link(SIB, MID);

		const response = await searchThesaurus(termSqo(TERM), SUPERUSER);

		expect(response.total).toBe(1);
		expect(response.result.map((node) => node.ts_id)).toEqual([
			`${SECTION}_${MID}`, // sibling list of ROOT (level 0)
			`${SECTION}_${ROOT}`, // the level-0 ancestor itself
			`${SECTION}_${HIT}`, // sibling list of MID (level 1)
			`${SECTION}_${SIB}`,
		]);

		const mid = nodeOf(response.result, MID);
		expect(mid.order).toBe(1); // the sibling write survives the ancestor write
		expect(mid.ts_parent).toBe(`${SECTION}_${ROOT}`);
		expect(nodeOf(response.result, ROOT).ts_parent).toBe('root');
		expect(nodeOf(response.result, HIT).ts_parent).toBe(`${SECTION}_${MID}`);
		expect(nodeOf(response.result, HIT).order).toBe(1);
		expect(nodeOf(response.result, SIB).order).toBe(2);
	}, 30000);

	test('a multi-parent node keeps the ts_parent of the sibling list that reached it first', async () => {
		// SHARED is a child of BOTH ROOT and MID, so it appears in two different
		// sibling lists: first as a child of ROOT (level 0), then as a child of MID
		// (level 1). Without the has() guard the second pass would rewrite its
		// ts_parent to MID and change its positional order.
		const ROOT = 923500;
		const MID = 923510;
		const SHARED = 923520;
		const HIT = 923521;
		const TERM = 'ZZTSSEARCHepsilon';
		await seedNode(ROOT, 'ZZTSSEARCHrootepsilon');
		await seedNode(MID, 'ZZTSSEARCHmidepsilon');
		await seedNode(SHARED, 'ZZTSSEARCHsharedepsilon');
		await seedNode(HIT, TERM);
		await link(MID, ROOT);
		await link(SHARED, ROOT); // parent link #1
		await link(SHARED, MID); // parent link #2 — the multi-parent fixture
		await link(HIT, MID);

		const response = await searchThesaurus(termSqo(TERM), SUPERUSER);

		expect(response.total).toBe(1);
		const shared = nodeOf(response.result, SHARED);
		expect(shared.ts_parent).toBe(`${SECTION}_${ROOT}`); // NOT MID
		expect(nodeOf(response.result, HIT).ts_parent).toBe(`${SECTION}_${MID}`);
		// SHARED appears exactly once in the whole tree.
		expect(response.result.filter((node) => node.ts_id === `${SECTION}_${SHARED}`)).toHaveLength(1);
	}, 30000);
});
