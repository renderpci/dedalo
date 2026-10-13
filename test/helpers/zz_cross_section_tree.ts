/**
 * THE CROSS-SECTION TREE — `zzcxt`, the shapes the museum-scale `zzscale`
 * corpus (one section, one table) cannot express, built for the PERF-6 walk
 * gate (`test/unit/children_recursive_set_native.test.ts`).
 *
 * A children walk crosses SECTIONS: a thesaurus virtual section's records hang
 * under the real section's records (same table, same parent component), and a
 * record of ANOTHER table may carry a parent link to a node the walk must NOT
 * follow (PHP searches only the parent section's table). One recursive
 * statement over the relation index has to reproduce exactly that, so each
 * case below is a way the set-based walk can differ from the per-node one:
 *
 *   ROOT tree (section A `zzcxt1`, matrix_test):
 *     A:ROOT ─┬─ A:ONE        (order 2)  ─┬─ A:DIAMOND_BOTTOM ─── A:DIAMOND_LEAF
 *             │                           └─ A:ONE_SIB  (order 2)
 *             ├─ A:TWO        (order 1)  ─┬─ A:TWO_SIB  (order 2)
 *             │                           └─ A:DIAMOND_BOTTOM (the same node)
 *             │   (poly: BOTTOM's order is PER PARENT, paired by id_key — 1 under
 *             │    ONE, 3 under TWO: FIRST of ONE's children, LAST of TWO's; a
 *             │    walk that picks the order value for the wrong parent swaps
 *             │    TWO's pair, and the pick's "first entry" fallback cannot hide it)
 *             ├─ A:TIE        (order 2 — ties ONE; the section_id tiebreak)
 *             ├─ B:TIE_TWIN   (order 2, SAME section_id as A:ONE — the tipo tiebreak)
 *             ├─ B:CROSS      (order 3)  ─┬─ B:CROSS_CHILD   (B under B)
 *             │                           └─ A:BACK          (A under B)
 *             ├─ A:UNORDERED  (no order value: sinks last)
 *             ├─ E:UNPLANNED  (order 4)  ─┬─ E:UNPLANNED_CHILD  (E under E)
 *             │                           └─ A:UNDER_UNPLANNED  (A under E)
 *             ├─ C:OTHER_TABLE ×3 (section C `zzcxt20` on matrix_hierarchy — EXCLUDED)
 *             └─ D:DECLARED_OTHER (section D `zzcxt30` on matrix_hierarchy — EXCLUDED)
 *     (and D:DECLARED_OTHER_2 under A:ONE — EXCLUDED)
 *   OUTSIDER: A:OUTSIDER (no parent — NOT in ROOT's subtree) holds a PORTAL link
 *            (`zzcxt8`, a non-parent relation in the SAME section and table) to
 *            A:ONE, and has four children of its own. The edge rule follows
 *            only the parent component: a walk that followed any relation into
 *            the tree would walk (count toward the cap) or emit the outsider.
 *   CYCLE:   A:CYCLE ⇄ B:CYCLE (each the other's parent) — terminates, [B:CYCLE]
 *   CHAIN:   A:CHAIN_ROOT → … one record per level, CHILDREN_RECURSIVE_MAX_DEPTH+1
 *            levels — the depth refusal.
 *
 * Section B (`zzcxt10`) is a VIRTUAL section of A (its relations name A), so it
 * borrows A's components and table — the real shape (es1 → hierarchy20).
 * Section C (`zzcxt20`) is a plain section on matrix_hierarchy whose record
 * stores a parent link under A's parent component: a relation-capable table,
 * so the inverse index HOLDS the edge, and only the table rule excludes it. C
 * is NOT among the children component's declared sections, so the walk meets
 * it unplanned (the JS table rule); its THREE records are also what would fill
 * a node cap a walk counted them toward (the node-cap legs).
 *
 * Section D (`zzcxt30`) is the same shape but DECLARED in the children
 * component's relations: the walk plans it up front, so only the SQL table
 * predicate (`cm.tbl = pm.tbl`) can exclude its records.
 *
 * Section E (`zzcxt40`) is a virtual of A NOT declared in the children
 * component: same table, expandable, with children of its own. The walk meets
 * E UNPLANNED in its first edge round (the edge is returned, not walked),
 * plans it, keeps it (same table) and seeds a SECOND round with it — the
 * fixpoint path of children.ts buildSubtreeAdjacency; a walk that dropped an
 * unplanned child's seed loses E's children.
 *
 * Section F (`zzcxt50`) is a REAL section with its own children and parent
 * components on `matrix_notes` — a table OUTSIDE the relation index: its nodes
 * can have no children here (findInverseReferences answers [] there), so the
 * walk must plan it as such and spend NO statement walking a root of it.
 *
 * A carries a SECOND children component, `zzcxt7` (declaring only A, ordered
 * after `zzcxt4` so the section's default stays `zzcxt4`): a walk with an
 * EXPLICIT children component plans the same sections differently (the
 * locators carry its tipo), so a plan cached per section alone — not per
 * (section, component) — answers the other component's walk wrongly.
 *
 * Section M (`zzcxt80`) is a real section whose section_map names a MALFORMED
 * order tipo (`x'--`): the order read interpolates that tipo into SQL, so it
 * must be refused (ontology.invalid_node) at the interpolation point, by every
 * caller — the one-level read and the recursive walk alike.
 *
 * Section G (`zzcxt60`, no section_map, so NO order component) and its virtual
 * H (`zzcxt70`) hold two children of G:G_ROOT that SHARE a section_id (H's
 * stored first): with no order value at all, the (section_id, section_tipo)
 * base order is the whole sibling order — G before H.
 *
 * Ids are explicit (900901..), built through `ensureSituation` (which asserts
 * the suite marker before its first write) and swept by `dropSituation`
 * (residue returned, asserted 0 by the consumer).
 */

import { CHILDREN_RECURSIVE_MAX_DEPTH } from '../../src/core/relations/children.ts';
import {
	dropSituation,
	ensureSituation,
	type Situation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

export const ZZXS_A = 'zzcxt1';
export const ZZXS_TERM = 'zzcxt2';
export const ZZXS_PARENT = 'zzcxt3';
export const ZZXS_CHILDREN = 'zzcxt4';
export const ZZXS_ORDER = 'zzcxt5';
export const ZZXS_SECTION_MAP = 'zzcxt6';
export const ZZXS_B = 'zzcxt10';
export const ZZXS_C = 'zzcxt20';
/** Declared target section on another table (see module doc). */
export const ZZXS_D = 'zzcxt30';
/** Undeclared virtual of A on A's table (see module doc). */
export const ZZXS_E = 'zzcxt40';
/** A section with children/parent components on a table outside the relation index (see module doc). */
export const ZZXS_F = 'zzcxt50';
/** A's SECOND children component (see module doc). */
export const ZZXS_CHILDREN_ALT = 'zzcxt7';
/** A's PORTAL — a non-parent relation in A (see module doc: OUTSIDER). */
export const ZZXS_PORTAL = 'zzcxt8';
/** The section with a MALFORMED section_map order tipo (see module doc). */
export const ZZXS_M = 'zzcxt80';
/** The malformed order tipo M's section_map names. */
export const ZZXS_M_BAD_ORDER = "x'--";
/** An unordered real section (no section_map) and its virtual (see module doc). */
export const ZZXS_G = 'zzcxt60';
export const ZZXS_H = 'zzcxt70';

/** Record ids, by role (see the module diagram). */
export const ZZXS = {
	ROOT: 900901,
	ONE: 900902,
	TWO: 900903,
	DIAMOND_BOTTOM: 900904,
	DIAMOND_LEAF: 900905,
	BACK: 900906,
	UNORDERED: 900907,
	TIE: 900908,
	/** B record sharing A:ONE's section_id. */
	TIE_TWIN: 900902,
	CROSS: 900951,
	CROSS_CHILD: 900952,
	OTHER_TABLE: 900971,
	OTHER_TABLE_2: 900972,
	OTHER_TABLE_3: 900973,
	DECLARED_OTHER: 900981,
	DECLARED_OTHER_2: 900982,
	UNPLANNED: 900991,
	UNPLANNED_CHILD: 900992,
	/** An A record under the E node. */
	UNDER_UNPLANNED: 900909,
	CYCLE_A: 900910,
	CYCLE_B: 900960,
	CHAIN_ROOT: 901001,
	/** A root address in F (no record needed: F's nodes have no children here). */
	F_ROOT: 900941,
	/** ONE's second child (order 2 — after DIAMOND_BOTTOM's 1 under ONE). */
	ONE_SIB: 900911,
	/** TWO's second child (order 2 — before DIAMOND_BOTTOM's 3 under TWO). */
	TWO_SIB: 900912,
	/** Outside ROOT's subtree; portal-links A:ONE (see module doc). */
	OUTSIDER: 900913,
	/** OUTSIDER's four children. */
	OUTSIDER_CHILDREN: [900914, 900915, 900916, 900917],
	M_ROOT: 900921,
	M_CHILD: 900922,
	G_ROOT: 900931,
	/** The id G's and H's children under G_ROOT share. */
	GH_TWIN: 900932,
} as const;

/** Levels in the chain under CHAIN_ROOT: one PAST the depth cap. */
export const ZZXS_CHAIN_DEPTH = CHILDREN_RECURSIVE_MAX_DEPTH + 1;

const PARENT_RELATION_TYPE = 'dd47';

function parentLink(itemId: number, parentTipo: string, parentId: number, component: string) {
	return {
		id: itemId,
		type: PARENT_RELATION_TYPE,
		section_tipo: parentTipo,
		section_id: parentId,
		from_component_tipo: component,
	};
}

interface RecordSpec {
	section_tipo: string;
	section_id: number;
	parents?: [string, number][];
	/** The parent component the links are stored under (default A's, ZZXS_PARENT). */
	parentComponent?: string;
	/** Order value paired to each parent link (same index), or null for none. */
	order?: (number | null)[];
	/** Portal (dd151) links stored under ZZXS_PORTAL — a NON-parent relation. */
	portal?: [string, number][];
}

function record(spec: RecordSpec) {
	const columns: Record<string, unknown> = {
		string: {
			[ZZXS_TERM]: [
				{ id: 1, lang: 'lg-eng', value: `zzcxt ${spec.section_tipo} ${spec.section_id}` },
			],
		},
	};
	const parents = spec.parents ?? [];
	const relation: Record<string, unknown> = {};
	if ((spec.portal ?? []).length > 0) {
		relation[ZZXS_PORTAL] = (spec.portal ?? []).map(([tipo, id], index) => ({
			id: index + 1,
			type: 'dd151',
			section_tipo: tipo,
			section_id: id,
			from_component_tipo: ZZXS_PORTAL,
		}));
		columns.relation = relation;
	}
	if (parents.length > 0) {
		const component = spec.parentComponent ?? ZZXS_PARENT;
		relation[component] = parents.map(([tipo, id], index) =>
			parentLink(index + 1, tipo, id, component),
		);
		columns.relation = relation;
		const order = (spec.order ?? [])
			.map((value, index) => (value === null ? null : { id: 1 + index, id_key: index + 1, value }))
			.filter((entry) => entry !== null);
		if (order.length > 0) columns.number = { [ZZXS_ORDER]: order };
	}
	return { section_tipo: spec.section_tipo, section_id: spec.section_id, columns };
}

function chain(): ReturnType<typeof record>[] {
	const out = [record({ section_tipo: ZZXS_A, section_id: ZZXS.CHAIN_ROOT })];
	for (let level = 1; level <= ZZXS_CHAIN_DEPTH; level++) {
		out.push(
			record({
				section_tipo: ZZXS_A,
				section_id: ZZXS.CHAIN_ROOT + level,
				parents: [[ZZXS_A, ZZXS.CHAIN_ROOT + level - 1]],
				order: [level],
			}),
		);
	}
	return out;
}

function build(): Situation {
	const A = ZZXS_A;
	const B = ZZXS_B;
	return situation({
		name: 'zzcxt cross-section children tree',
		tld: 'zzcxt',
		nodes: [
			{
				tipo: A,
				parent: 'test1',
				model: 'section',
				term: { 'lg-eng': 'zzcxt A' },
				relations: [{ tipo: 'test24' }],
			},
			{ tipo: ZZXS_TERM, parent: A, model: 'component_input_text', order_number: 1 },
			{ tipo: ZZXS_PARENT, parent: A, model: 'component_relation_parent', order_number: 2 },
			{
				tipo: ZZXS_CHILDREN,
				parent: A,
				model: 'component_relation_children',
				// The parent component it inverts, then the sections its children live in.
				relations: [{ tipo: ZZXS_PARENT }, { tipo: A }, { tipo: B }, { tipo: ZZXS_D }],
				order_number: 3,
			},
			{ tipo: ZZXS_ORDER, parent: A, model: 'component_number', order_number: 4 },
			// A's SECOND children component: same parent link, declares only A.
			{
				tipo: ZZXS_CHILDREN_ALT,
				parent: A,
				model: 'component_relation_children',
				relations: [{ tipo: ZZXS_PARENT }, { tipo: A }],
				order_number: 9,
			},
			{
				tipo: ZZXS_SECTION_MAP,
				parent: A,
				model: 'section_map',
				properties: {
					thesaurus: {
						term: ZZXS_TERM,
						parent: ZZXS_PARENT,
						children: ZZXS_CHILDREN,
						order: ZZXS_ORDER,
					},
				},
				order_number: 5,
			},
			// A's PORTAL to itself: a non-parent relation in the same section/table.
			{
				tipo: ZZXS_PORTAL,
				parent: A,
				model: 'component_portal',
				relations: [{ tipo: A }],
				order_number: 10,
			},
			// B — a VIRTUAL section of A (same components, same table).
			{
				tipo: B,
				parent: 'test1',
				model: 'section',
				term: { 'lg-eng': 'zzcxt B' },
				relations: [{ tipo: A }],
			},
			// C — a section on ANOTHER relation-capable table.
			{
				tipo: ZZXS_C,
				parent: 'test1',
				model: 'section',
				term: { 'lg-eng': 'zzcxt C' },
				relations: [{ tipo: 'dd425' }],
			},
			{ tipo: 'zzcxt21', parent: ZZXS_C, model: 'component_input_text', order_number: 1 },
			// D — DECLARED by the children component, on another relation-capable table.
			{
				tipo: ZZXS_D,
				parent: 'test1',
				model: 'section',
				term: { 'lg-eng': 'zzcxt D' },
				relations: [{ tipo: 'dd425' }],
			},
			{ tipo: 'zzcxt31', parent: ZZXS_D, model: 'component_input_text', order_number: 1 },
			// E — a VIRTUAL of A the children component does NOT declare.
			{
				tipo: ZZXS_E,
				parent: 'test1',
				model: 'section',
				term: { 'lg-eng': 'zzcxt E' },
				relations: [{ tipo: A }],
			},
			// F — children + parent components, on matrix_notes (not relation-capable).
			{
				tipo: ZZXS_F,
				parent: 'test1',
				model: 'section',
				term: { 'lg-eng': 'zzcxt F' },
				relations: [{ tipo: 'dd481' }],
			},
			{ tipo: 'zzcxt51', parent: ZZXS_F, model: 'component_relation_parent', order_number: 1 },
			{
				tipo: 'zzcxt52',
				parent: ZZXS_F,
				model: 'component_relation_children',
				relations: [{ tipo: 'zzcxt51' }, { tipo: ZZXS_F }],
				order_number: 2,
			},
			// M — its section_map names a MALFORMED order tipo.
			{
				tipo: ZZXS_M,
				parent: 'test1',
				model: 'section',
				term: { 'lg-eng': 'zzcxt M' },
				relations: [{ tipo: 'test24' }],
			},
			{ tipo: 'zzcxt81', parent: ZZXS_M, model: 'component_input_text', order_number: 1 },
			{ tipo: 'zzcxt82', parent: ZZXS_M, model: 'component_relation_parent', order_number: 2 },
			{
				tipo: 'zzcxt83',
				parent: ZZXS_M,
				model: 'component_relation_children',
				relations: [{ tipo: 'zzcxt82' }, { tipo: ZZXS_M }],
				order_number: 3,
			},
			{
				tipo: 'zzcxt85',
				parent: ZZXS_M,
				model: 'section_map',
				properties: {
					thesaurus: {
						term: 'zzcxt81',
						parent: 'zzcxt82',
						children: 'zzcxt83',
						order: ZZXS_M_BAD_ORDER,
					},
				},
				order_number: 4,
			},
			// G — no section_map (no order component); H — its virtual.
			{
				tipo: ZZXS_G,
				parent: 'test1',
				model: 'section',
				term: { 'lg-eng': 'zzcxt G' },
				relations: [{ tipo: 'test24' }],
			},
			{ tipo: 'zzcxt61', parent: ZZXS_G, model: 'component_relation_parent', order_number: 1 },
			{
				tipo: 'zzcxt62',
				parent: ZZXS_G,
				model: 'component_relation_children',
				relations: [{ tipo: 'zzcxt61' }, { tipo: ZZXS_G }, { tipo: ZZXS_H }],
				order_number: 2,
			},
			{
				tipo: ZZXS_H,
				parent: 'test1',
				model: 'section',
				term: { 'lg-eng': 'zzcxt H' },
				relations: [{ tipo: ZZXS_G }],
			},
		],
		records: [
			record({ section_tipo: A, section_id: ZZXS.ROOT }),
			record({ section_tipo: A, section_id: ZZXS.ONE, parents: [[A, ZZXS.ROOT]], order: [2] }),
			record({ section_tipo: A, section_id: ZZXS.TWO, parents: [[A, ZZXS.ROOT]], order: [1] }),
			record({ section_tipo: A, section_id: ZZXS.TIE, parents: [[A, ZZXS.ROOT]], order: [2] }),
			record({ section_tipo: B, section_id: ZZXS.TIE_TWIN, parents: [[A, ZZXS.ROOT]], order: [2] }),
			record({ section_tipo: B, section_id: ZZXS.CROSS, parents: [[A, ZZXS.ROOT]], order: [3] }),
			record({ section_tipo: A, section_id: ZZXS.UNORDERED, parents: [[A, ZZXS.ROOT]] }),
			...[ZZXS.OTHER_TABLE, ZZXS.OTHER_TABLE_2, ZZXS.OTHER_TABLE_3].map((id) =>
				record({ section_tipo: ZZXS_C, section_id: id, parents: [[A, ZZXS.ROOT]], order: [0] }),
			),
			record({
				section_tipo: ZZXS_D,
				section_id: ZZXS.DECLARED_OTHER,
				parents: [[A, ZZXS.ROOT]],
				order: [0],
			}),
			record({
				section_tipo: ZZXS_D,
				section_id: ZZXS.DECLARED_OTHER_2,
				parents: [[A, ZZXS.ONE]],
				order: [0],
			}),
			// E: met unplanned in round 1; its children only in round 2.
			record({
				section_tipo: ZZXS_E,
				section_id: ZZXS.UNPLANNED,
				parents: [[A, ZZXS.ROOT]],
				order: [4],
			}),
			record({
				section_tipo: ZZXS_E,
				section_id: ZZXS.UNPLANNED_CHILD,
				parents: [[ZZXS_E, ZZXS.UNPLANNED]],
				order: [2],
			}),
			record({
				section_tipo: A,
				section_id: ZZXS.UNDER_UNPLANNED,
				parents: [[ZZXS_E, ZZXS.UNPLANNED]],
				order: [1],
			}),
			// The diamond: BOTTOM under ONE and TWO (two links, two id_keys), its
			// order PER PARENT — first under ONE (1 < ONE_SIB's 2), last under TWO
			// (3 > TWO_SIB's 2).
			record({
				section_tipo: A,
				section_id: ZZXS.DIAMOND_BOTTOM,
				parents: [
					[A, ZZXS.ONE],
					[A, ZZXS.TWO],
				],
				order: [1, 3],
			}),
			record({ section_tipo: A, section_id: ZZXS.ONE_SIB, parents: [[A, ZZXS.ONE]], order: [2] }),
			record({ section_tipo: A, section_id: ZZXS.TWO_SIB, parents: [[A, ZZXS.TWO]], order: [2] }),
			// The OUTSIDER: a portal into the tree, children of its own, no parent.
			record({ section_tipo: A, section_id: ZZXS.OUTSIDER, portal: [[A, ZZXS.ONE]] }),
			...ZZXS.OUTSIDER_CHILDREN.map((id) =>
				record({ section_tipo: A, section_id: id, parents: [[A, ZZXS.OUTSIDER]], order: [1] }),
			),
			// M: a root and one child — the order read is reached, and refused.
			record({ section_tipo: ZZXS_M, section_id: ZZXS.M_ROOT }),
			record({
				section_tipo: ZZXS_M,
				section_id: ZZXS.M_CHILD,
				parents: [[ZZXS_M, ZZXS.M_ROOT]],
				parentComponent: 'zzcxt82',
			}),
			// G / H: two children sharing an id, H's stored FIRST.
			record({ section_tipo: ZZXS_G, section_id: ZZXS.G_ROOT }),
			record({
				section_tipo: ZZXS_H,
				section_id: ZZXS.GH_TWIN,
				parents: [[ZZXS_G, ZZXS.G_ROOT]],
				parentComponent: 'zzcxt61',
			}),
			record({
				section_tipo: ZZXS_G,
				section_id: ZZXS.GH_TWIN,
				parents: [[ZZXS_G, ZZXS.G_ROOT]],
				parentComponent: 'zzcxt61',
			}),
			record({
				section_tipo: A,
				section_id: ZZXS.DIAMOND_LEAF,
				parents: [[A, ZZXS.DIAMOND_BOTTOM]],
				order: [1],
			}),
			// Under the B node: a B child and an A child.
			record({
				section_tipo: B,
				section_id: ZZXS.CROSS_CHILD,
				parents: [[B, ZZXS.CROSS]],
				order: [2],
			}),
			record({ section_tipo: A, section_id: ZZXS.BACK, parents: [[B, ZZXS.CROSS]], order: [1] }),
			// The A ⇄ B cycle.
			record({
				section_tipo: A,
				section_id: ZZXS.CYCLE_A,
				parents: [[B, ZZXS.CYCLE_B]],
				order: [1],
			}),
			record({
				section_tipo: B,
				section_id: ZZXS.CYCLE_B,
				parents: [[A, ZZXS.CYCLE_A]],
				order: [1],
			}),
			...chain(),
		],
	});
}

export const ZZXS_SITUATION: Situation = build();

/** Build the tree on the suite database (refused anywhere else). */
export async function ensureCrossSectionTree(): Promise<void> {
	await assertTestDatabase('ensureCrossSectionTree');
	await ensureSituation(ZZXS_SITUATION);
}

/** Tear it down; returns the residue (0 = clean). */
export async function dropCrossSectionTree(): Promise<number> {
	await assertTestDatabase('dropCrossSectionTree');
	return dropSituation(ZZXS_SITUATION);
}
