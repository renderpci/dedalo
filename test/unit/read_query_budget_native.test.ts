/**
 * THE READ PATH'S STATEMENT BUDGET — per SHAPE, never one number for all of
 * them (PERF-02/PERF-03).
 *
 * WHY IT EXISTS. An N+1 is invisible to every assertion about RESULTS: the
 * list renders, the children come back ordered, the subtree is complete — one
 * statement per row instead of one per page, and nothing is red until an
 * install with a real corpus is slow. `children.ts orderChildHits` issued TWO
 * full-row reads PER CHILD (the parent-link id_key, then the order value), so
 * the 440-wide node below cost ~881 statements to answer; it now costs ONE
 * batched read per section_tipo group, resolved in process by the shared
 * pairing rule (`ts_object/node_repository.ts` `pickOrderValueForParent`).
 *
 * ONE CEILING PER SHAPE. A single "reads are cheap" number generalises to
 * nothing: a list page, a wide node's children and a whole subtree pay
 * structurally different costs, and a ceiling loose enough for the third is
 * satisfied by any regression in the first. Each budget below states its own
 * ARITHMETIC and is shrink-only.
 *
 * THE CORPUS IS THE MEASUREMENT (`zzscale_corpus.ts`, built and torn down
 * here, residue asserted 0): 440 children under one node and 1,199 descendants
 * at depth 3. A budget over an empty situation is satisfied by any ceiling —
 * `expectQueryBudget` refuses a zero corpus, and every leg below also asserts
 * the corpus FLOOR it measured over.
 *
 * WARM CACHES, ON PURPOSE. Every measured door is called ONCE before the tap
 * opens, so the ontology/section_map resolver reads (which happen once per
 * process, not per item) are not counted. The budgets are about per-ITEM cost;
 * counting cold cache fills would make them drift with test order.
 */

import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { runWithQueryTap } from '../../src/core/db/query_tap.ts';
import {
	getChildren,
	getChildrenRecursive,
	getChildrenRecursiveBatch,
} from '../../src/core/relations/children.ts';
import { readSection } from '../../src/core/section/read.ts';
import {
	ZZSCALE_LEVEL1_FIRST_ID,
	ZZSCALE_LEVEL1_LAST_ID,
	ZZSCALE_LEVEL2_FIRST_ID,
	ZZSCALE_ROOT_DESCENDANT_COUNT,
	ZZSCALE_ROOT_ID,
	ZZSCALE_SECTION,
	ZZSCALE_WIDE_CHILD_COUNT,
	ZZSCALE_WIDE_PARENT_ID,
} from '../../src/core/test_data/situations/zzscale_constants.ts';
import {
	dropZzScaleCorpus,
	ensureZzScaleCorpus,
} from '../../src/core/test_data/situations/zzscale_corpus.ts';
import { expectQueryBudget } from '../helpers/query_budget.ts';

/** The corpus floors each budget is only meaningful above. */
const WIDE_CHILD_FLOOR = 400;
const DESCENDANT_FLOOR = 1000;
const LIST_ROW_FLOOR = 1;

/** The list page this budget is about. */
const LIST_PAGE_SIZE = 20;

/**
 * CEILING 1 — ONE LIST PAGE of {@link LIST_PAGE_SIZE} records.
 * Arithmetic: the page is answered by a FIXED set of statements — the row
 * search, the batched row read, the record prefetch and the structure-context
 * reads that are not resolver-cached — none of which is per-row. Measured 12;
 * 14 leaves room for one more context read and REFUSES a per-row read (which
 * would put the count past the page size at once).
 */
const LIST_PAGE_CEILING = 14;

/**
 * CEILING 2 — getChildren of a node with {@link ZZSCALE_WIDE_CHILD_COUNT}
 * children. Arithmetic: 1 inverse-index search + 1 batched order read PER
 * SECTION_TIPO GROUP in the child set (one group here) = 2. The ceiling is 3,
 * one group's slack; the pre-batch engine spent 1 + 2x440 = 881.
 */
const WIDE_CHILDREN_CEILING = 3;

/**
 * CEILING 3 — getChildrenRecursive over a whole subtree: FLAT, whatever its size.
 *
 * Arithmetic (PERF-6): the walk fetches every edge of the subtree in ONE
 * recursive statement over the relation index (one more round only when the
 * walk crosses into a section it had not planned — not here, one section), then
 * ONE batched order read per (child section, order component) group (one
 * group here), and replays the edges in process. 1 + 1 = 2; the ceiling 4
 * leaves room for the coverage probe and one extra round, and is INDEPENDENT of
 * the tree size — the per-node walk this replaced paid one search per node plus
 * one order read per internal node (1,651 statements for this subtree).
 *
 * SCALE INVARIANCE is the actual law: the root (1,199 descendants), the wide
 * parent (1,189) and a depth-2 node (a handful) must cost the SAME number of
 * statements, and so must a batch over every depth-1 root. A ceiling alone
 * could be met by a walk that is merely cheaper per node; equal counts across
 * three orders of magnitude cannot.
 */
const RECURSIVE_CEILING = 4;

function listRqo(): never {
	return {
		action: 'read',
		source: {
			action: null,
			model: 'section',
			tipo: ZZSCALE_SECTION,
			section_tipo: ZZSCALE_SECTION,
			mode: 'list',
		},
		sqo: { section_tipo: [ZZSCALE_SECTION], limit: LIST_PAGE_SIZE, offset: 0 },
	} as never;
}

beforeAll(async () => {
	await ensureZzScaleCorpus();
}, 120000);

afterAll(async () => {
	expect(await dropZzScaleCorpus()).toBe(0);
}, 120000);

test('SHAPE 1 — one list page costs a FIXED number of statements, not one per row', async () => {
	// Warm: the resolver/section_map reads are once-per-process, not per row.
	const warm = await readSection(listRqo());
	const rows = (warm as { data: unknown[] }).data.length;
	expect(rows).toBeGreaterThan(LIST_ROW_FLOOR);

	const { report } = await expectQueryBudget(
		'list page',
		{ ceiling: LIST_PAGE_CEILING, corpus: rows },
		async () => readSection(listRqo()),
	);
	// The page grew nothing per row: the count is under the page size itself.
	expect(report.count).toBeLessThan(LIST_PAGE_SIZE);
});

test('SHAPE 2 — getChildren of a 440-wide node is ONE batched order read', async () => {
	await getChildren(ZZSCALE_WIDE_PARENT_ID, ZZSCALE_SECTION);

	const { result } = await expectQueryBudget(
		'wide node children',
		{ ceiling: WIDE_CHILDREN_CEILING, corpus: ZZSCALE_WIDE_CHILD_COUNT },
		async () => getChildren(ZZSCALE_WIDE_PARENT_ID, ZZSCALE_SECTION),
	);

	// The corpus floor: a shrunk corpus makes the ceiling meaningless.
	expect(ZZSCALE_WIDE_CHILD_COUNT).toBeGreaterThan(WIDE_CHILD_FLOOR);
	expect((result as unknown[]).length).toBe(ZZSCALE_WIDE_CHILD_COUNT);
});

test('SHAPE 2b — the batched read still ORDERS: children come back inverted', async () => {
	// The order value DECREASES in the id (zzScaleOrderValue), and the inverse
	// index answers in ASCENDING id order — so a descending answer proves the
	// batched statement's values were actually paired and sorted, not echoed.
	const children = await getChildren(ZZSCALE_WIDE_PARENT_ID, ZZSCALE_SECTION);
	const ids = children.map((child) => Number(child.section_id));
	expect(ids.length).toBe(ZZSCALE_WIDE_CHILD_COUNT);
	expect(ids[0]).toBeGreaterThan(Number(ids[ids.length - 1]));
	expect([...ids].sort((a, b) => b - a)).toEqual(ids);
});

test('SHAPE 3 — a whole subtree costs a FLAT number of statements, independent of its size', async () => {
	// Warm the ontology caches for every measured door (per-process, not per-item).
	await getChildrenRecursive(ZZSCALE_ROOT_ID, ZZSCALE_SECTION);
	const depth1Roots = Array.from(
		{ length: ZZSCALE_LEVEL1_LAST_ID - ZZSCALE_LEVEL1_FIRST_ID + 1 },
		(_, i) => ({ section_tipo: ZZSCALE_SECTION, section_id: ZZSCALE_LEVEL1_FIRST_ID + i }),
	);
	await getChildrenRecursiveBatch(depth1Roots);

	const root = await expectQueryBudget(
		'recursive subtree (root)',
		{ ceiling: RECURSIVE_CEILING, corpus: ZZSCALE_ROOT_DESCENDANT_COUNT },
		async () => getChildrenRecursive(ZZSCALE_ROOT_ID, ZZSCALE_SECTION),
	);
	expect(ZZSCALE_ROOT_DESCENDANT_COUNT).toBeGreaterThan(DESCENDANT_FLOOR);
	expect((root.result as unknown[]).length).toBe(ZZSCALE_ROOT_DESCENDANT_COUNT);

	const wide = await runWithQueryTap('recursive subtree (wide parent)', () =>
		getChildrenRecursive(ZZSCALE_WIDE_PARENT_ID, ZZSCALE_SECTION),
	);
	expect(wide.result.length).toBeGreaterThan(WIDE_CHILD_FLOOR);

	const small = await runWithQueryTap('recursive subtree (depth-2 node)', () =>
		getChildrenRecursive(ZZSCALE_LEVEL2_FIRST_ID, ZZSCALE_SECTION),
	);
	expect(small.result.length).toBeGreaterThan(0);
	expect(small.result.length).toBeLessThan(10);

	const batch = await runWithQueryTap('recursive batch (every depth-1 root)', () =>
		getChildrenRecursiveBatch(depth1Roots),
	);
	expect(batch.result.length).toBeGreaterThan(WIDE_CHILD_FLOOR);

	// Exactly ONE edge statement per walk (attributed to the edge fetcher).
	const edgeStatements = (report: { callers: { frames: string; count: number }[] }) =>
		report.callers
			.filter((caller) => caller.frames.includes('descendant_walk.ts'))
			.reduce((sum, caller) => sum + caller.count, 0);
	expect({
		root: edgeStatements(root.report),
		wide: edgeStatements(wide.report),
		small: edgeStatements(small.report),
		batch: edgeStatements(batch.report),
	}).toEqual({ root: 1, wide: 1, small: 1, batch: 1 });

	// Scale invariance: three orders of magnitude, one statement count.
	expect({
		wide: wide.report.count,
		small: small.report.count,
		batch: batch.report.count,
	}).toEqual({ wide: root.report.count, small: root.report.count, batch: root.report.count });
});

test('POSITIVE CONTROL — a planted per-row read BREACHES its budget', async () => {
	// The offender: read the same page one record at a time. If the tap, the
	// helper or the ceiling arithmetic were inert, this would pass — and so
	// would every real N+1 the three budgets above are meant to catch.
	const ids = Array.from({ length: LIST_PAGE_SIZE }, (_, i) => ZZSCALE_LEVEL2_FIRST_ID + i);
	await expect(
		expectQueryBudget(
			'planted N+1',
			{ ceiling: LIST_PAGE_CEILING, corpus: ids.length },
			async () => {
				for (const id of ids) await readMatrixRecord('matrix_test', ZZSCALE_SECTION, id);
			},
		),
	).rejects.toThrow(/BREACHED/);
});
