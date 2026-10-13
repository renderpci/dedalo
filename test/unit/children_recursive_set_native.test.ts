/**
 * PERF-6 — THE RECURSIVE CHILDREN WALK IS ONE SET, AND STILL THE SAME ANSWER.
 *
 * `getChildrenRecursive` / `getChildrenRecursiveBatch` (relations/children.ts)
 * walked a subtree one `getChildren` per visited node: a 1,200-node branch cost
 * ~1,650 statements (read_query_budget_native SHAPE 3 holds the scale leg).
 * The fix fetches every edge in ONE recursive statement and replays it in
 * process. This file holds the EQUALITY leg: whatever the engine does inside,
 * its output must be, node for node and in order, the output of an independent
 * per-node walk over the public one-level door (`test/helpers/children_walk_oracle.ts`)
 * — and its refusals must be the oracle's refusals (code, root, limit).
 *
 * Shapes compared (each one a way a set-based walk can differ):
 *   - zzscale: the 1,199-node root, the 440-wide parent, the poly-hierarchy
 *     island, and a BATCH whose second root lies inside the first root's subtree;
 *   - zzcxt (test/helpers/zz_cross_section_tree.ts): a child in a virtual sibling
 *     section on the same table (expanded, and ITS children of both sections),
 *     children on another table in an UNDECLARED section (excluded by the JS
 *     table rule) and in a DECLARED one (excluded only by the SQL predicate), a
 *     same-table section the children component does not declare (met
 *     UNPLANNED in the first edge round, kept, and expanded by a SECOND round —
 *     the walk's fixpoint path), an order component with ties across
 *     sections (the section_id / section_tipo tiebreak), an unordered child, a
 *     diamond, an A⇄B parent cycle (terminates, emits the other node once), and
 *     a chain one level past the depth cap (the 'depth' refusal, naming the root).
 *
 * And the COST leg the per-node walk cannot pass: the cross-section tree is
 * answered in EXACTLY TWO edge rounds (one per planning generation: the
 * declared sections, then the undeclared same-table section met in round 1)
 * plus one order read per child section, whatever its size. The round count
 * is the fixpoint's own bound — a walk that stopped at round 1 loses E's
 * children (the equality leg), and one that looped would pay more here.
 *
 * And the PLANNING the per-node walk never needed: a section whose table is
 * outside the relation index (`zzcxt50` on matrix_notes) is planned as having
 * no children — its root answers [] at ZERO walk statements; a walk with an
 * EXPLICIT children component (`zzcxt7`, A's second) plans per (section,
 * component) — the same process walking A with the default component first
 * must not answer the explicit walk from the default's cached plan.
 *
 * And the SATURATION BACKSTOP (children.ts replaySubtree): unreachable through
 * a correct fetch (walkDescendants argues why), so it is driven with a
 * hand-built CUT adjacency — refused as 'nodes', never returned whole.
 *
 * And the EDGE FETCH itself (descendant_walk.ts fetchSubtreeEdges), measured
 * on its own output: it follows ONLY the parent component (a portal from an
 * outsider into the tree is neither walked nor returned: `walked` never
 * exceeds the true descendant count), and it is BOUNDED by its cap (the
 * 1,199-node zzscale root under a cap of 100 walks exactly 100 nodes and
 * returns far fewer edges than the subtree holds — the statement's own work is
 * the bound, not only the refusal the replay reaches either way).
 *
 * And the per-parent ORDER PICK (a poly-hierarchy node first under one parent,
 * last under the other), the order tipo's IDENTIFIER GATE at its one
 * interpolation point (a malformed section_map order is refused,
 * ontology.invalid_node, by the one-level read and the walk alike), and the
 * (section_id, section_tipo) BASE ORDER of a parent with no order component at
 * all (two children sharing an id across sections: the tipo decides).
 *
 * And the NODE BOUND through the real walk (getChildrenRecursiveUnderNodeCap,
 * the named seam that lowers it): a cap equal to the subtree's size is
 * answered — the excluded other-table children, met unplanned, must not count
 * toward it and fake a refusal — and one below is refused as 'nodes', exactly
 * like the oracle under the same cap. And on a ONE-ROUND subtree (A:ONE, the
 * zzscale root — one statement walks it all, under the walk's own cap): a cap
 * of exactly the subtree is answered — the statement's cap must leave room for
 * the roots, and a DECLARED other-table child (planned, so only the
 * recursion's table rule keeps it out) must never be walked or counted.
 *
 * And the INDEX READINESS the walk owes because it reads matrix_relation_index
 * directly: with the tree's table uncovered (its index rows deleted inside a
 * rolled-back transaction) both walks refuse `search.index_unavailable` —
 * never a partial subtree. And the CHUNKED order read: a 440-id group read in
 * chunks of 100 (readOrderRowsChunked's named seam) is ceil(440/100)
 * statements and the same rows as one read.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { SEARCH_STORE_BACKFILLS } from '../../src/core/db/db_assets.ts';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';
import { runWithQueryTap } from '../../src/core/db/query_tap.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import * as childrenModule from '../../src/core/relations/children.ts';
import {
	CHILDREN_RECURSIVE_MAX_DEPTH,
	CHILDREN_RELATION_TYPE,
	type ChildLocator,
	getChildren,
	getChildrenRecursive,
	getChildrenRecursiveBatch,
	getComponentOrderTipo,
} from '../../src/core/relations/children.ts';
import { fetchSubtreeEdges } from '../../src/core/relations/descendant_walk.ts';
import { clearSearchStoreCache, relationIndexCovers } from '../../src/core/search/search_store.ts';
import {
	ZZSCALE_LEVEL1_FIRST_ID,
	ZZSCALE_LEVEL1_LAST_ID,
	ZZSCALE_LEVEL2_FIRST_ID,
	ZZSCALE_PARENT_COMPONENT,
	ZZSCALE_POLY_CHILD_ID,
	ZZSCALE_POLY_PARENT_A_ID,
	ZZSCALE_POLY_PARENT_B_ID,
	ZZSCALE_ROOT_DESCENDANT_COUNT,
	ZZSCALE_ROOT_ID,
	ZZSCALE_SECTION,
	ZZSCALE_WIDE_PARENT_ID,
} from '../../src/core/test_data/situations/zzscale_constants.ts';
import {
	dropZzScaleCorpus,
	ensureZzScaleCorpus,
} from '../../src/core/test_data/situations/zzscale_corpus.ts';
import {
	engineOutcome,
	oracleDescendants,
	type WalkOutcome,
} from '../helpers/children_walk_oracle.ts';
import { DB_READY } from '../helpers/db_ready.ts';
import {
	dropCrossSectionTree,
	ensureCrossSectionTree,
	ZZXS,
	ZZXS_A,
	ZZXS_B,
	ZZXS_C,
	ZZXS_CHAIN_DEPTH,
	ZZXS_CHILDREN,
	ZZXS_CHILDREN_ALT,
	ZZXS_D,
	ZZXS_E,
	ZZXS_F,
	ZZXS_G,
	ZZXS_H,
	ZZXS_M,
	ZZXS_M_BAD_ORDER,
	ZZXS_PARENT,
	ZZXS_PORTAL,
} from '../helpers/zz_cross_section_tree.ts';

type Root = { section_tipo: string; section_id: number };
/**
 * The named node-cap seam, reached through the namespace: a tree without it
 * reddens the node-bound leg on an assertion, never unlinks the whole file.
 */
const getChildrenRecursiveUnderNodeCap = (roots: Root[], maxNodes: number) => {
	const seam = (
		childrenModule as unknown as {
			getChildrenRecursiveUnderNodeCap?: (roots: Root[], maxNodes: number) => Promise<unknown[]>;
		}
	).getChildrenRecursiveUnderNodeCap;
	if (seam === undefined)
		throw new Error('children.ts: getChildrenRecursiveUnderNodeCap is missing');
	return seam(roots, maxNodes) as ReturnType<typeof getChildrenRecursiveBatch>;
};

const ref = (sectionTipo: string, sectionId: number) => ({
	section_tipo: sectionTipo,
	section_id: sectionId,
});

/** Compact `tipo/id` list of an outcome's nodes (readable diffs). */
function idsOf(outcome: WalkOutcome): string[] | WalkOutcome {
	return 'nodes' in outcome
		? outcome.nodes.map((node) => `${node.section_tipo}/${node.section_id}`)
		: outcome;
}

async function single(sectionTipo: string, sectionId: number) {
	const engine = await engineOutcome(() => getChildrenRecursive(sectionId, sectionTipo));
	const oracle = await oracleDescendants([ref(sectionTipo, sectionId)]);
	return { engine, oracle };
}

async function batch(roots: { section_tipo: string; section_id: number }[]) {
	const engine = await engineOutcome(() => getChildrenRecursiveBatch(roots));
	const oracle = await oracleDescendants(roots);
	return { engine, oracle };
}

describe.if(DB_READY)('PERF-6 — the recursive walk equals the per-node oracle', () => {
	beforeAll(async () => {
		await ensureZzScaleCorpus();
		await ensureCrossSectionTree();
	}, 180_000);

	afterAll(async () => {
		expect(await dropCrossSectionTree()).toBe(0);
		expect(await dropZzScaleCorpus()).toBe(0);
	}, 180_000);

	// ── zzscale ──────────────────────────────────────────────────────────────

	test('zzscale root: 1,199 nodes, identical order', async () => {
		const { engine, oracle } = await single(ZZSCALE_SECTION, ZZSCALE_ROOT_ID);
		expect('nodes' in oracle && oracle.nodes.length).toBe(ZZSCALE_ROOT_DESCENDANT_COUNT);
		expect(idsOf(engine)).toEqual(idsOf(oracle));
	}, 120_000);

	test('zzscale wide parent, identical order', async () => {
		const { engine, oracle } = await single(ZZSCALE_SECTION, ZZSCALE_WIDE_PARENT_ID);
		expect('nodes' in oracle && oracle.nodes.length).toBeGreaterThan(400);
		expect(idsOf(engine)).toEqual(idsOf(oracle));
	}, 120_000);

	test('zzscale poly-hierarchy island: each parent alone, and both in one batch', async () => {
		for (const parent of [ZZSCALE_POLY_PARENT_A_ID, ZZSCALE_POLY_PARENT_B_ID]) {
			const { engine, oracle } = await single(ZZSCALE_SECTION, parent);
			expect(idsOf(oracle)).toEqual([`${ZZSCALE_SECTION}/${ZZSCALE_POLY_CHILD_ID}`]);
			expect(idsOf(engine)).toEqual(idsOf(oracle));
		}
		const { engine, oracle } = await batch([
			ref(ZZSCALE_SECTION, ZZSCALE_POLY_PARENT_A_ID),
			ref(ZZSCALE_SECTION, ZZSCALE_POLY_PARENT_B_ID),
		]);
		expect(idsOf(oracle)).toEqual([`${ZZSCALE_SECTION}/${ZZSCALE_POLY_CHILD_ID}`]);
		expect(idsOf(engine)).toEqual(idsOf(oracle));
	});

	test('zzscale batch whose later roots lie INSIDE the first root’s subtree', async () => {
		const roots = [
			ref(ZZSCALE_SECTION, ZZSCALE_ROOT_ID),
			ref(ZZSCALE_SECTION, ZZSCALE_WIDE_PARENT_ID),
			ref(ZZSCALE_SECTION, ZZSCALE_LEVEL2_FIRST_ID),
		];
		const { engine, oracle } = await batch(roots);
		expect('nodes' in oracle && oracle.nodes.length).toBe(ZZSCALE_ROOT_DESCENDANT_COUNT);
		expect(idsOf(engine)).toEqual(idsOf(oracle));
	}, 120_000);

	test('zzscale batch over every depth-1 root', async () => {
		const roots = [];
		for (let id = ZZSCALE_LEVEL1_FIRST_ID; id <= ZZSCALE_LEVEL1_LAST_ID; id++) {
			roots.push(ref(ZZSCALE_SECTION, id));
		}
		const { engine, oracle } = await batch(roots);
		expect(idsOf(engine)).toEqual(idsOf(oracle));
	}, 120_000);

	// ── zzcxt: across sections ────────────────────────────────────────────────

	test('cross-section tree: same answer as the oracle, and the shapes are really there', async () => {
		const { engine, oracle } = await single(ZZXS_A, ZZXS.ROOT);
		const oracleIds = idsOf(oracle) as string[];
		// Non-degeneracy of the situation, asserted on the ORACLE's answer.
		expect(oracleIds).toContain(`${ZZXS_B}/${ZZXS.CROSS}`); // B under A
		expect(oracleIds).toContain(`${ZZXS_B}/${ZZXS.CROSS_CHILD}`); // B under B
		expect(oracleIds).toContain(`${ZZXS_A}/${ZZXS.BACK}`); // A under B
		expect(oracleIds).toContain(`${ZZXS_B}/${ZZXS.TIE_TWIN}`);
		for (const id of [ZZXS.OTHER_TABLE, ZZXS.OTHER_TABLE_2, ZZXS.OTHER_TABLE_3]) {
			expect(oracleIds).not.toContain(`${ZZXS_C}/${id}`); // other table, undeclared
		}
		for (const id of [ZZXS.DECLARED_OTHER, ZZXS.DECLARED_OTHER_2]) {
			expect(oracleIds).not.toContain(`${ZZXS_D}/${id}`); // other table, DECLARED
		}
		// The undeclared same-table section: met unplanned, and its children.
		expect(oracleIds).toContain(`${ZZXS_E}/${ZZXS.UNPLANNED}`);
		expect(oracleIds).toContain(`${ZZXS_E}/${ZZXS.UNPLANNED_CHILD}`); // E under E
		expect(oracleIds).toContain(`${ZZXS_A}/${ZZXS.UNDER_UNPLANNED}`); // A under E
		expect(oracleIds.filter((id) => id === `${ZZXS_A}/${ZZXS.DIAMOND_BOTTOM}`).length).toBe(1);
		expect(oracleIds).toContain(`${ZZXS_A}/${ZZXS.DIAMOND_LEAF}`);
		// The per-parent order of the poly node, on the public one-level door:
		// FIRST under ONE, LAST under TWO (its value is paired to each parent).
		const level = async (id: number) =>
			(await getChildren(id, ZZXS_A)).map((child) => `${child.section_tipo}/${child.section_id}`);
		expect(await level(ZZXS.ONE)).toEqual([
			`${ZZXS_A}/${ZZXS.DIAMOND_BOTTOM}`,
			`${ZZXS_A}/${ZZXS.ONE_SIB}`,
		]);
		expect(await level(ZZXS.TWO)).toEqual([
			`${ZZXS_A}/${ZZXS.TWO_SIB}`,
			`${ZZXS_A}/${ZZXS.DIAMOND_BOTTOM}`,
		]);
		// … and the walk claims it under TWO (expanded first): right after TWO_SIB.
		const bottomAt = oracleIds.indexOf(`${ZZXS_A}/${ZZXS.DIAMOND_BOTTOM}`);
		expect(oracleIds[bottomAt - 1]).toBe(`${ZZXS_A}/${ZZXS.TWO_SIB}`);
		// The outsider (a PORTAL into ONE, not a parent link) and its children are not descendants.
		for (const id of [ZZXS.OUTSIDER, ...ZZXS.OUTSIDER_CHILDREN]) {
			expect(oracleIds).not.toContain(`${ZZXS_A}/${id}`);
		}
		// The unordered child sinks after every ordered sibling.
		const firstLevel = oracleIds.slice(0, 7);
		expect(firstLevel[firstLevel.length - 1]).toBe(`${ZZXS_A}/${ZZXS.UNORDERED}`);
		expect(idsOf(engine)).toEqual(oracleIds);
	});

	test('the A⇄B cycle terminates and emits the other node once', async () => {
		const { engine, oracle } = await single(ZZXS_A, ZZXS.CYCLE_A);
		expect(idsOf(oracle)).toEqual([`${ZZXS_B}/${ZZXS.CYCLE_B}`]);
		expect(idsOf(engine)).toEqual(idsOf(oracle));
		const reverse = await single(ZZXS_B, ZZXS.CYCLE_B);
		expect(idsOf(reverse.engine)).toEqual(idsOf(reverse.oracle));
	});

	test('a cross-section batch: roots in both sections, the second inside the first', async () => {
		const { engine, oracle } = await batch([ref(ZZXS_A, ZZXS.ROOT), ref(ZZXS_B, ZZXS.CROSS)]);
		expect(idsOf(engine)).toEqual(idsOf(oracle));
	});

	test('the chain one level past the cap: the same typed DEPTH refusal, naming the root', async () => {
		expect(ZZXS_CHAIN_DEPTH).toBe(CHILDREN_RECURSIVE_MAX_DEPTH + 1);
		const { engine, oracle } = await single(ZZXS_A, ZZXS.CHAIN_ROOT);
		expect(oracle).toEqual({
			refused: {
				code: 'relation.subtree_too_large',
				root: ref(ZZXS_A, ZZXS.CHAIN_ROOT),
				limit: 'depth',
			},
		});
		expect(engine).toEqual(oracle);
		// A batch refuses naming the root it was expanding — the chain, second.
		const both = await batch([ref(ZZXS_A, ZZXS.CYCLE_A), ref(ZZXS_A, ZZXS.CHAIN_ROOT)]);
		expect(both.engine).toEqual(both.oracle);
	});

	test('an unordered parent: siblings sharing a section_id across sections come in (id, tipo) order', async () => {
		const level = (await getChildren(ZZXS.G_ROOT, ZZXS_G)).map(
			(child) => `${child.section_tipo}/${child.section_id}`,
		);
		// H's record was stored first; the base order puts G (the lower tipo) first.
		expect(level).toEqual([`${ZZXS_G}/${ZZXS.GH_TWIN}`, `${ZZXS_H}/${ZZXS.GH_TWIN}`]);
		const { engine, oracle } = await single(ZZXS_G, ZZXS.G_ROOT);
		expect(idsOf(oracle)).toEqual(level);
		expect(idsOf(engine)).toEqual(idsOf(oracle));
	});

	test('a MALFORMED section_map order tipo is refused at the interpolation point — one-level read and walk alike', async () => {
		const refusal = async (work: () => Promise<unknown>) => {
			try {
				await work();
				return null;
			} catch (error) {
				return {
					code: (error as { code?: string }).code,
					order_tipo: (error as { coordinates?: Record<string, unknown> }).coordinates?.order_tipo,
				};
			}
		};
		const expected = { code: 'ontology.invalid_node', order_tipo: ZZXS_M_BAD_ORDER };
		expect(await refusal(() => getChildren(ZZXS.M_ROOT, ZZXS_M))).toEqual(expected);
		expect(await refusal(() => getChildrenRecursive(ZZXS.M_ROOT, ZZXS_M))).toEqual(expected);
		expect(await refusal(() => getChildrenRecursiveBatch([ref(ZZXS_M, ZZXS.M_ROOT)]))).toEqual(
			expected,
		);
	});

	// ── the edge fetch, on its own output ────────────────────────────────────

	test('the edge fetch follows ONLY the parent component: a portal into the tree is never walked', async () => {
		const tableA = (await getMatrixTableFromTipo(ZZXS_A)) as string;
		const tableD = (await getMatrixTableFromTipo(ZZXS_D)) as string;
		const root = ref(ZZXS_A, ZZXS.ROOT);
		const { edges, walked } = await fetchSubtreeEdges(
			[root],
			[
				{ section_tipo: ZZXS_A, parent_tipo: ZZXS_PARENT, tbl: tableA },
				{ section_tipo: ZZXS_B, parent_tipo: ZZXS_PARENT, tbl: tableA },
				{ section_tipo: ZZXS_D, parent_tipo: null, tbl: tableD },
			],
			10_000,
		);
		const whole = await oracleDescendants([root]);
		const size = 'nodes' in whole ? whole.nodes.length : 0;
		expect(size).toBeGreaterThan(8);
		// Every node the statement counts is a descendant (or the root) …
		expect(walked).toBeLessThanOrEqual(size + 1);
		// … and no edge touches the outsider (its portal is not a parent link).
		const outsiders = new Set<number>([ZZXS.OUTSIDER, ...ZZXS.OUTSIDER_CHILDREN]);
		const touching = edges.filter(
			(edge) =>
				(edge.child_tipo === ZZXS_A && outsiders.has(edge.child_id)) ||
				(edge.parent_tipo === ZZXS_A && outsiders.has(edge.parent_id)),
		);
		expect(touching).toEqual([]);
		// Non-degeneracy: the portal row IS in the index, pointing at ONE — so
		// only the parent-component rule keeps it out.
		const portalRows = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM matrix_relation_index
			  WHERE section_tipo = $1 AND section_id = $2 AND from_component_tipo = $3
			    AND target_section_tipo = $1 AND target_section_id = $4`,
			[ZZXS_A, ZZXS.OUTSIDER, ZZXS_PORTAL, ZZXS.ONE],
		)) as { n: number }[];
		expect(portalRows[0]?.n).toBe(1);
	});

	test('the edge fetch is BOUNDED by its cap: the 1,199-node root under 100 walks 100 nodes, far fewer edges', async () => {
		const table = (await getMatrixTableFromTipo(ZZSCALE_SECTION)) as string;
		const cap = 100;
		const { edges, walked } = await fetchSubtreeEdges(
			[ref(ZZSCALE_SECTION, ZZSCALE_ROOT_ID)],
			[{ section_tipo: ZZSCALE_SECTION, parent_tipo: ZZSCALE_PARENT_COMPONENT, tbl: table }],
			cap,
		);
		expect(walked).toBe(cap);
		// The edges of the first `cap` nodes only — never the whole subtree's.
		expect(edges.length).toBeLessThan(ZZSCALE_ROOT_DESCENDANT_COUNT);
		// Non-degeneracy: uncapped, the same fetch does return every edge.
		const whole = await fetchSubtreeEdges(
			[ref(ZZSCALE_SECTION, ZZSCALE_ROOT_ID)],
			[{ section_tipo: ZZSCALE_SECTION, parent_tipo: ZZSCALE_PARENT_COMPONENT, tbl: table }],
			10_000,
		);
		expect(whole.edges.length).toBe(ZZSCALE_ROOT_DESCENDANT_COUNT);
	}, 120_000);

	// ── the cost the per-node walk cannot pay ────────────────────────────────

	test('cost: the cross-section tree is exactly TWO edge rounds + one order read per child section', async () => {
		await getChildrenRecursive(ZZXS.ROOT, ZZXS_A); // warm the ontology caches
		const { result, report } = await runWithQueryTap('zzcxt recursive', () =>
			getChildrenRecursive(ZZXS.ROOT, ZZXS_A),
		);
		expect(result.length).toBeGreaterThan(8);
		const resultIds = result.map((node) => `${node.section_tipo}/${node.section_id}`);
		expect(resultIds).toContain(`${ZZXS_E}/${ZZXS.UNPLANNED_CHILD}`);
		expect(resultIds).toContain(`${ZZXS_A}/${ZZXS.UNDER_UNPLANNED}`);
		const childSections = new Set(result.map((node) => node.section_tipo));
		expect(childSections).toEqual(new Set([ZZXS_A, ZZXS_B, ZZXS_E]));
		// THE BUDGET: two edge rounds + one order read per (child section,
		// order component) group — whatever the tree's size.
		expect(report.count).toBeLessThanOrEqual(2 + childSections.size);
		// And the rounds are exactly two: round 1 walks the declared sections and
		// meets E unplanned; round 2 expands E (E's children and A under E).
		const edgeStatements = report.callers
			.filter((caller) => caller.frames.includes('descendant_walk.ts'))
			.reduce((sum, caller) => sum + caller.count, 0);
		expect(edgeStatements).toBe(2);
	});

	// ── planning: what the per-node walk resolved per call ─────────────────

	test('a section on a table outside the relation index: [] like the oracle, at ZERO walk statements', async () => {
		const { engine, oracle } = await single(ZZXS_F, ZZXS.F_ROOT);
		expect(oracle).toEqual({ nodes: [] });
		expect(engine).toEqual(oracle);
		// Warm, then measure: a section whose nodes cannot have children here is
		// never walked — no edge fetch, no order read.
		const { result, report } = await runWithQueryTap('zzcxt F root', () =>
			getChildrenRecursive(ZZXS.F_ROOT, ZZXS_F),
		);
		expect(result).toEqual([]);
		expect(report.count).toBe(0);
	});

	test('an explicit children component plans per (section, component): default first, then explicit, each the oracle', async () => {
		const root = ref(ZZXS_A, ZZXS.ROOT);
		// The DEFAULT walk first, so its plans are cached when the explicit one runs.
		const byDefault = await engineOutcome(() => getChildrenRecursive(ZZXS.ROOT, ZZXS_A));
		expect(byDefault).toEqual(await oracleDescendants([root]));
		const explicit = await engineOutcome(() =>
			getChildrenRecursive(ZZXS.ROOT, ZZXS_A, ZZXS_CHILDREN_ALT),
		);
		const explicitOracle = await oracleDescendants([root], { componentTipo: ZZXS_CHILDREN_ALT });
		expect(explicit).toEqual(explicitOracle);
		// Non-degeneracy: the two walks really differ — each locator names ITS
		// children component.
		const components = (outcome: WalkOutcome) =>
			new Set('nodes' in outcome ? outcome.nodes.map((node) => node.from_component_tipo) : []);
		expect(components(byDefault)).toEqual(new Set([ZZXS_CHILDREN]));
		expect(components(explicitOracle)).toEqual(new Set([ZZXS_CHILDREN_ALT]));
	});

	// ── the saturation backstop (unreachable through a correct fetch) ──────

	test('replaySubtree: a CUT adjacency (saturated) is refused as nodes even under the bound; a whole one is served', () => {
		const seam = (
			childrenModule as unknown as {
				replaySubtree?: (
					roots: Root[],
					childrenOf: ReadonlyMap<string, readonly ChildLocator[]>,
					saturated: boolean,
					maxNodes: number,
				) => ChildLocator[];
			}
		).replaySubtree;
		if (seam === undefined) throw new Error('children.ts: replaySubtree is missing');
		const root = ref(ZZXS_A, 1);
		const child = (id: number): ChildLocator => ({
			section_tipo: ZZXS_A,
			section_id: id,
			from_component_tipo: ZZXS_CHILDREN,
			type: CHILDREN_RELATION_TYPE,
		});
		const childrenOf = new Map<string, ChildLocator[]>([[`${ZZXS_A}_1`, [child(2), child(3)]]]);
		// Whole: served, two nodes, far under the bound.
		expect(seam([root], childrenOf, false, 10)).toEqual([child(2), child(3)]);
		// Cut: the same two nodes, but the fetch said it stopped early — the true
		// answer is a refusal naming the root, never a short subtree.
		let refusal: unknown = null;
		try {
			seam([root], childrenOf, true, 10);
		} catch (error) {
			refusal = error;
		}
		expect({
			code: (refusal as { code?: string } | null)?.code,
			limit: (refusal as { details?: { limit?: string } } | null)?.details?.limit,
			coordinates: (refusal as { coordinates?: unknown } | null)?.coordinates,
		}).toEqual({ code: 'relation.subtree_too_large', limit: 'nodes', coordinates: root });
	});

	// ── the node bound, through the real walk ────────────────────────────────

	test('node bound: a cap equal to the subtree is answered; one below is refused as nodes', async () => {
		const root = ref(ZZXS_A, ZZXS.ROOT);
		const whole = await oracleDescendants([root]);
		const size = 'nodes' in whole ? whole.nodes.length : 0;
		expect(size).toBeGreaterThan(8);
		// Exactly the subtree: answered. The three C children (unplanned, other
		// table) and the two D children are never kept, so they cannot fill it.
		const atCap = await engineOutcome(() => getChildrenRecursiveUnderNodeCap([root], size));
		expect(idsOf(atCap)).toEqual(idsOf(whole));
		// One below: refused, as the oracle refuses under the same cap.
		const below = await engineOutcome(() => getChildrenRecursiveUnderNodeCap([root], size - 1));
		const oracleBelow = await oracleDescendants([root], { maxNodes: size - 1 });
		expect(oracleBelow).toEqual({
			refused: { code: 'relation.subtree_too_large', root, limit: 'nodes' },
		});
		expect(below).toEqual(oracleBelow);
		// The zzscale root (1,199 nodes) under a cap of 100: the edge fetch
		// saturates, and the refusal is still the oracle's.
		const scaleRoot = ref(ZZSCALE_SECTION, ZZSCALE_ROOT_ID);
		const scaleBelow = await engineOutcome(() =>
			getChildrenRecursiveUnderNodeCap([scaleRoot], 100),
		);
		expect(scaleBelow).toEqual(await oracleDescendants([scaleRoot], { maxNodes: 100 }));
		expect(scaleBelow).toEqual({
			refused: { code: 'relation.subtree_too_large', root: scaleRoot, limit: 'nodes' },
		});
	}, 120_000);

	test('node bound on a ONE-ROUND subtree: a cap equal to it is answered — the walk’s own cap leaves room for the roots, and other-table nodes are never counted', async () => {
		// A:ONE's subtree lies wholly in sections planned BEFORE the first round
		// (A, and D — declared, on another table), so ONE statement walks it: the
		// cap that statement runs under is the whole bound. ONE also has a DECLARED
		// other-table child (D:DECLARED_OTHER_2): planned, so only the recursion's
		// table rule keeps the statement from walking — and counting — it.
		const one = ref(ZZXS_A, ZZXS.ONE);
		const whole = await oracleDescendants([one]);
		const size = 'nodes' in whole ? whole.nodes.length : 0;
		expect(idsOf(whole)).toEqual([
			`${ZZXS_A}/${ZZXS.DIAMOND_BOTTOM}`,
			`${ZZXS_A}/${ZZXS.ONE_SIB}`,
			`${ZZXS_A}/${ZZXS.DIAMOND_LEAF}`,
		]);
		const atCap = await engineOutcome(() => getChildrenRecursiveUnderNodeCap([one], size));
		expect(idsOf(atCap)).toEqual(idsOf(whole));
		const below = await engineOutcome(() => getChildrenRecursiveUnderNodeCap([one], size - 1));
		expect(below).toEqual(await oracleDescendants([one], { maxNodes: size - 1 }));
		expect(below).toEqual({
			refused: { code: 'relation.subtree_too_large', root: one, limit: 'nodes' },
		});
		// The statement itself, under the walk's real plans: it counts the seed and
		// the kept subtree — never the planned other-table child.
		const tableA = (await getMatrixTableFromTipo(ZZXS_A)) as string;
		const tableD = (await getMatrixTableFromTipo(ZZXS_D)) as string;
		expect(tableD).not.toBe(tableA);
		const { edges, walked } = await fetchSubtreeEdges(
			[one],
			[
				{ section_tipo: ZZXS_A, parent_tipo: ZZXS_PARENT, tbl: tableA },
				{ section_tipo: ZZXS_B, parent_tipo: ZZXS_PARENT, tbl: tableA },
				{ section_tipo: ZZXS_D, parent_tipo: null, tbl: tableD },
			],
			10_000,
		);
		expect(walked).toBe(size + 1);
		expect(edges.some((edge) => edge.child_tipo === ZZXS_D)).toBe(false);
		// Non-degeneracy: the other-table edge IS in the index, under ONE's parent component.
		const declaredRows = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM matrix_relation_index
			  WHERE section_tipo = $1 AND section_id = $2 AND from_component_tipo = $3
			    AND target_section_tipo = $4 AND target_section_id = $5`,
			[ZZXS_D, ZZXS.DECLARED_OTHER_2, ZZXS_PARENT, ZZXS_A, ZZXS.ONE],
		)) as { n: number }[];
		expect(declaredRows[0]?.n).toBe(1);
		// The museum-scale one-round subtree: the zzscale root under a cap of
		// exactly its 1,199 descendants is answered, one fewer is refused.
		const scaleRoot = ref(ZZSCALE_SECTION, ZZSCALE_ROOT_ID);
		const scaleAtCap = await engineOutcome(() =>
			getChildrenRecursiveUnderNodeCap([scaleRoot], ZZSCALE_ROOT_DESCENDANT_COUNT),
		);
		expect('nodes' in scaleAtCap && scaleAtCap.nodes.length).toBe(ZZSCALE_ROOT_DESCENDANT_COUNT);
		expect(
			await engineOutcome(() =>
				getChildrenRecursiveUnderNodeCap([scaleRoot], ZZSCALE_ROOT_DESCENDANT_COUNT - 1),
			),
		).toEqual({
			refused: { code: 'relation.subtree_too_large', root: scaleRoot, limit: 'nodes' },
		});
	}, 120_000);

	// ── the index the walk reads directly ────────────────────────────────────

	test('an UNCOVERED relation index refuses the walk (search.index_unavailable) — never a partial subtree', async () => {
		// The edge fetch reads matrix_relation_index itself, bypassing
		// findInverseReferences' readiness guard — so the walk must ask the same
		// question. The tree's table is made uncovered INSIDE a rolled-back
		// transaction (its index rows deleted while its relation data stays).
		const table = (await getMatrixTableFromTipo(ZZXS_A)) as string;
		const contract = SEARCH_STORE_BACKFILLS.find(
			(candidate) => candidate.store === 'matrix_relation_index',
		);
		if (contract === undefined) throw new Error('no matrix_relation_index backfill contract');
		const codeOf = async (work: () => Promise<unknown>) => {
			try {
				await work();
				return 'answered';
			} catch (error) {
				return (error as { code?: string }).code ?? String(error);
			}
		};
		const sentinel = new Error('rollback');
		const seen: Record<string, string> = {};
		clearSearchStoreCache();
		try {
			await expect(
				withTransaction(async () => {
					await sql.unsafe(contract.deleteFor(table), []);
					clearSearchStoreCache();
					expect(await relationIndexCovers([table])).toBe(false);
					seen.single = await codeOf(() => getChildrenRecursive(ZZXS.ROOT, ZZXS_A));
					seen.batch = await codeOf(() => getChildrenRecursiveBatch([ref(ZZXS_A, ZZXS.ONE)]));
					throw sentinel;
				}),
			).rejects.toBe(sentinel);
		} finally {
			clearSearchStoreCache();
		}
		expect(seen).toEqual({
			single: 'search.index_unavailable',
			batch: 'search.index_unavailable',
		});
		// Restored by the rollback: covered, and the walk answers again.
		expect(await relationIndexCovers([table])).toBe(true);
		expect(await codeOf(() => getChildrenRecursive(ZZXS.ROOT, ZZXS_A))).toBe('answered');
	}, 120_000);

	// ── the order read, chunked ──────────────────────────────────────────────

	test('the order read of a group LARGER than its chunk: every chunk read, one statement each, the same rows as one read', async () => {
		const seam = (
			childrenModule as unknown as {
				readOrderRowsChunked?: (
					childSectionTipo: string,
					sectionIds: readonly number[],
					orderComponentTipo: string,
					chunk?: number,
				) => Promise<Record<string, unknown>[]>;
			}
		).readOrderRowsChunked;
		if (seam === undefined) throw new Error('children.ts: readOrderRowsChunked is missing');
		const orderTipo = await getComponentOrderTipo(ZZSCALE_SECTION);
		if (orderTipo === null) throw new Error('zzscale has no order component');
		const ids = (await getChildren(ZZSCALE_WIDE_PARENT_ID, ZZSCALE_SECTION))
			.map((child) => child.section_id)
			.sort((a, b) => a - b);
		expect(ids.length).toBeGreaterThan(400);
		const chunk = 100;
		const byId = (rows: Record<string, unknown>[]) =>
			rows
				.map((row) => JSON.stringify([Number(row.section_id), row.order_arr, row.parent_arr]))
				.sort();
		const whole = await seam(ZZSCALE_SECTION, ids, orderTipo, ids.length);
		expect(whole.length).toBe(ids.length);
		const { result: chunked, report } = await runWithQueryTap('order chunks', () =>
			seam(ZZSCALE_SECTION, ids, orderTipo, chunk),
		);
		expect(byId(chunked)).toEqual(byId(whole));
		expect(report.count).toBe(Math.ceil(ids.length / chunk));
		// A chunk outside (0, the production chunk] is refused, never a silent default.
		for (const bad of [0, -1, 1.5]) {
			expect(await seam(ZZSCALE_SECTION, ids, orderTipo, bad).catch((error) => error.code)).toBe(
				'internal.invariant',
			);
		}
	}, 120_000);
});
