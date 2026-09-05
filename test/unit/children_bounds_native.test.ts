/**
 * THE RECURSIVE CHILDREN WALK IS BOUNDED, EMITS EACH NODE ONCE, AND ORDERS BY
 * ONE RULE (PERF-02 / PERF-03).
 *
 * WHAT IS PINNED (outcomes, never spellings):
 *   1. the walk REFUSES past its depth cap with a typed
 *      `relation.subtree_too_large` — it never truncates, because a narrowed
 *      subtree is a wrong answer that looks like a right one;
 *   2. one level under the cap the SAME shape answers completely, so the
 *      refusal above cannot be satisfied by a walk that simply stopped early;
 *   3. both caps are compared in ONE pure predicate (`subtreeBoundExceeded`),
 *      gated at its boundaries — the 200,000-node case cannot be built as
 *      records, and a cap enforced only in a branch no test reaches is not
 *      enforced. The DEPTH leg proves that predicate is actually consulted by
 *      the walk, which is the same call site the node leg passes through;
 *   4. a POLY-HIERARCHY node is emitted ONCE, however many parents list it —
 *      the "already deduplicated by locator" contract the batch walk
 *      documented and did not keep (it pushed a whole direct-children list
 *      before the shared visited set pruned it);
 *   5. the children engine and the thesaurus tree resolve a child's per-parent
 *      ORDER by the SAME rule (`node_repository.ts` `pickOrderValueForParent`), including the
 *      legacy section-coords entry the children engine used to miss;
 *   6. the `hierarchy_terms` fixed_filter expansion is capped BELOW the walk's
 *      own node cap, so a runaway config is reported as a config error.
 *
 * FIXTURES. Two scratch situations on reserved `zz*` TLDs, built here and torn
 * down with the residue asserted 0: `zzbounds` (a 66-record CHAIN — the only
 * shape that reaches a depth cap — plus a 3-child ORDER ISLAND carrying one
 * entry of each pairing generation) and the museum-scale `zzscale` corpus for
 * its poly-hierarchy island. No install's TLD, no ambient records.
 */

import { afterAll, beforeAll, expect, test } from 'bun:test';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import {
	CHILDREN_RECURSIVE_MAX_DEPTH,
	CHILDREN_RECURSIVE_MAX_NODES,
	getChildren,
	getChildrenRecursive,
	getChildrenRecursiveBatch,
	subtreeBoundExceeded,
} from '../../src/core/relations/children.ts';
import {
	assertHierarchyTermsWithinCap,
	HIERARCHY_TERMS_MAX_IDS,
} from '../../src/core/relations/request_config/filters.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import {
	ZZSCALE_POLY_CHILD_ID,
	ZZSCALE_POLY_PARENT_A_ID,
	ZZSCALE_POLY_PARENT_B_ID,
	ZZSCALE_SECTION,
} from '../../src/core/test_data/situations/zzscale_constants.ts';
import {
	dropZzScaleCorpus,
	ensureZzScaleCorpus,
} from '../../src/core/test_data/situations/zzscale_corpus.ts';
import { fetchNodeInfo } from '../../src/core/ts_object/node_repository.ts';

const SECTION = 'zzbounds1';
const TERM = 'zzbounds2';
const PARENT = 'zzbounds3';
const CHILDREN = 'zzbounds4';
const ORDER = 'zzbounds5';
const SECTION_MAP = 'zzbounds6';
const PARENT_RELATION_TYPE = 'dd47';

/** The chain: root id 1, then one child per level. */
const CHAIN_ROOT = 1;
/** One level PAST the cap, counted from the root's children (depth 1). */
const CHAIN_DEPTH = CHILDREN_RECURSIVE_MAX_DEPTH + 1;
const CHAIN_LAST_ID = CHAIN_ROOT + CHAIN_DEPTH;

/** The ORDER ISLAND: one parent, three children, one pairing generation each. */
const ORDER_PARENT = 1000;
const ORDER_PAIRED = 1001; // id-keyed entry            → 3
const ORDER_COORDS = 1002; // section-coords entry      → 1 (items[0] says 9)
const ORDER_UNKEYED = 1003; // legacy unkeyed entry     → 2

function parentLocator(itemId: number, parentId: number): Record<string, unknown> {
	return {
		id: itemId,
		type: PARENT_RELATION_TYPE,
		section_id: parentId,
		section_tipo: SECTION,
		from_component_tipo: PARENT,
	};
}

function chainRecords(): {
	section_tipo: string;
	section_id: number;
	columns: Record<string, unknown>;
}[] {
	const records = [];
	for (let id = CHAIN_ROOT; id <= CHAIN_LAST_ID; id++) {
		const columns: Record<string, unknown> = {
			string: { [TERM]: [{ id: 1, lang: 'lg-eng', value: `zzbounds chain ${id}` }] },
		};
		if (id > CHAIN_ROOT) {
			columns.relation = { [PARENT]: [parentLocator(1, id - 1)] };
			columns.number = { [ORDER]: [{ id: 1, value: id }] };
		}
		records.push({ section_tipo: SECTION, section_id: id, columns });
	}
	return records;
}

function orderIslandRecords(): {
	section_tipo: string;
	section_id: number;
	columns: Record<string, unknown>;
}[] {
	const base = (id: number, order: Record<string, unknown>[]) => ({
		section_tipo: SECTION,
		section_id: id,
		columns: {
			string: { [TERM]: [{ id: 1, lang: 'lg-eng', value: `zzbounds order ${id}` }] },
			relation: { [PARENT]: [parentLocator(1, ORDER_PARENT)] },
			number: { [ORDER]: order },
		},
	});
	return [
		{
			section_tipo: SECTION,
			section_id: ORDER_PARENT,
			columns: { string: { [TERM]: [{ id: 1, lang: 'lg-eng', value: 'zzbounds order parent' }] } },
		},
		// 1. paired to the parent-link item id — the authoritative generation.
		base(ORDER_PAIRED, [{ id: 1, value: 3 }]),
		// 2. a LEGACY SECTION-COORDS entry, behind an unkeyed one that says 9.
		// The retired children-engine rule (`paired ?? items[0]`) answered 9;
		// the shared rule answers 1 (WC-2026-09-05-children-order-one-rule).
		base(ORDER_COORDS, [
			{ value: 9 },
			{ section_tipo_key: SECTION, section_id_key: ORDER_PARENT, value: 1 },
		]),
		// 3. the legacy unkeyed (v6 POSITIONAL) shape — unchanged by the merge.
		base(ORDER_UNKEYED, [{ value: 2 }]),
	];
}

function zzBounds() {
	return situation({
		name: 'zzbounds children-walk bounds',
		tld: 'zzbounds',
		nodes: [
			{ tipo: SECTION, parent: 'test1', model: 'section', term: { 'lg-eng': 'zzbounds' } },
			{
				tipo: TERM,
				parent: SECTION,
				model: 'component_input_text',
				is_translatable: true,
				order_number: 1,
			},
			{ tipo: PARENT, parent: SECTION, model: 'component_relation_parent', order_number: 2 },
			{
				tipo: CHILDREN,
				parent: SECTION,
				model: 'component_relation_children',
				relations: [{ tipo: PARENT }],
				order_number: 3,
			},
			{ tipo: ORDER, parent: SECTION, model: 'component_number', order_number: 4 },
			{
				tipo: SECTION_MAP,
				parent: SECTION,
				model: 'section_map',
				properties: {
					thesaurus: { term: TERM, parent: PARENT, children: CHILDREN, order: ORDER },
				},
				order_number: 5,
			},
		],
		records: [...chainRecords(), ...orderIslandRecords()],
	});
}

beforeAll(async () => {
	await ensureSituation(zzBounds());
	await ensureZzScaleCorpus();
}, 180000);

afterAll(async () => {
	expect(await dropSituation(zzBounds())).toBe(0);
	expect(await dropZzScaleCorpus()).toBe(0);
}, 180000);

// ---------------------------------------------------------------------------
// 1-3 — the bounds
// ---------------------------------------------------------------------------

test('the bound predicate refuses at BOTH caps, and only past them', () => {
	expect(subtreeBoundExceeded(CHILDREN_RECURSIVE_MAX_DEPTH, 1)).toBeNull();
	expect(subtreeBoundExceeded(CHILDREN_RECURSIVE_MAX_DEPTH + 1, 1)).toBe('depth');
	expect(subtreeBoundExceeded(1, CHILDREN_RECURSIVE_MAX_NODES)).toBeNull();
	expect(subtreeBoundExceeded(1, CHILDREN_RECURSIVE_MAX_NODES + 1)).toBe('nodes');
	// Both caps are real bounds, not zero and not infinity.
	expect(CHILDREN_RECURSIVE_MAX_DEPTH).toBeGreaterThan(8);
	expect(CHILDREN_RECURSIVE_MAX_NODES).toBeGreaterThan(1000);
});

test('a subtree DEEPER than the cap is REFUSED, typed, never truncated', async () => {
	let refused: unknown;
	try {
		await getChildrenRecursive(CHAIN_ROOT, SECTION);
	} catch (error) {
		refused = error;
	}
	expect(refused).toBeInstanceOf(DedaloError);
	const dedalo = refused as DedaloError;
	expect(dedalo.code).toBe('relation.subtree_too_large');
	expect(dedalo.details?.limit).toBe('depth');
	expect(dedalo.details?.cap).toBe(CHILDREN_RECURSIVE_MAX_DEPTH);
	// The refusal names the ROOT the caller asked about, not the leaf it died on.
	expect(dedalo.coordinates?.section_id).toBe(CHAIN_ROOT);
});

test('one level UNDER the cap the same chain answers COMPLETELY', async () => {
	// From the chain's second record the deepest descendant sits at exactly the
	// cap — so the refusal above is a bound, not a walk that stops early.
	const descendants = await getChildrenRecursive(CHAIN_ROOT + 1, SECTION);
	expect(descendants.length).toBe(CHAIN_DEPTH - 1);
	expect(Math.max(...descendants.map((child) => Number(child.section_id)))).toBe(CHAIN_LAST_ID);
});

// ---------------------------------------------------------------------------
// 4 — the poly-hierarchy dedup
// ---------------------------------------------------------------------------

test('a POLY-HIERARCHY node is emitted ONCE across a batch of its parents', async () => {
	const descendants = await getChildrenRecursiveBatch([
		{ section_id: ZZSCALE_POLY_PARENT_A_ID, section_tipo: ZZSCALE_SECTION },
		{ section_id: ZZSCALE_POLY_PARENT_B_ID, section_tipo: ZZSCALE_SECTION },
	]);
	const emitted = descendants.filter((child) => Number(child.section_id) === ZZSCALE_POLY_CHILD_ID);

	// The corpus floor: both parents really do list it (else this is vacuous).
	expect((await getChildren(ZZSCALE_POLY_PARENT_A_ID, ZZSCALE_SECTION)).length).toBe(1);
	expect((await getChildren(ZZSCALE_POLY_PARENT_B_ID, ZZSCALE_SECTION)).length).toBe(1);
	expect(emitted.length).toBe(1);
});

// ---------------------------------------------------------------------------
// 5 — ONE order rule
// ---------------------------------------------------------------------------

test('the children engine resolves per-parent order by the SHARED rule', async () => {
	const ids = (await getChildren(ORDER_PARENT, SECTION)).map((child) => Number(child.section_id));

	// Values under this parent: coords 1 < unkeyed 2 < paired 3. The retired
	// children-engine rule read the coords child's items[0] (9) and put it LAST
	// — the exact ordering this asserts against.
	expect(ids).toEqual([ORDER_COORDS, ORDER_UNKEYED, ORDER_PAIRED]);
});

test('the thesaurus tree resolves the SAME values through fetchNodeInfo', async () => {
	const info = await fetchNodeInfo(
		[ORDER_COORDS, ORDER_UNKEYED, ORDER_PAIRED].map((id) => ({
			section_tipo: SECTION,
			section_id: id,
		})),
		{ section_tipo: SECTION, section_id: ORDER_PARENT },
	);
	expect(info.get(`${SECTION}_${ORDER_COORDS}`)?.order).toBe(1);
	expect(info.get(`${SECTION}_${ORDER_UNKEYED}`)?.order).toBe(2);
	expect(info.get(`${SECTION}_${ORDER_PAIRED}`)?.order).toBe(3);
});

// ---------------------------------------------------------------------------
// 6 — the fixed_filter expansion cap
// ---------------------------------------------------------------------------

test('an over-cap hierarchy_terms expansion is a CONFIG error, and under-cap is silent', () => {
	expect(() => assertHierarchyTermsWithinCap(HIERARCHY_TERMS_MAX_IDS, SECTION, 1)).not.toThrow();
	let refused: unknown;
	try {
		assertHierarchyTermsWithinCap(HIERARCHY_TERMS_MAX_IDS + 1, SECTION, 1);
	} catch (error) {
		refused = error;
	}
	expect(refused).toBeInstanceOf(DedaloError);
	expect((refused as DedaloError).code).toBe('ontology.invalid_node');
	// The config cap sits BELOW the walk's own ceiling, so a runaway fixed_filter
	// is reported as the config mistake it is rather than as a runaway subtree.
	expect(HIERARCHY_TERMS_MAX_IDS).toBeLessThan(CHILDREN_RECURSIVE_MAX_NODES);
});
