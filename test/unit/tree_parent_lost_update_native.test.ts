/**
 * CORE-3 — the tree's parent-link and sibling-order writes are LOCKED
 * read-modify-writes, and they refuse to run without a transaction.
 *
 * THE FAILURE CLASS. Every mutation in `relations/parent.ts` rewrites a WHOLE
 * component key of the CHILD record (its parent-link locators, or its
 * per-parent order dataframe) from a value it read a moment earlier. With an
 * UNLOCKED read, whatever another session commits on that key between the read
 * and the write is overwritten out of existence: a curator's new parent link, a
 * second move of a multi-parent node, the order of the node under its OTHER
 * parent. The overwriting call answers ok; nothing anywhere records the loss.
 * A heritage thesaurus loses a broader term silently.
 *
 * WHY TWO CONNECTIONS. The defect exists only between sessions, so each case
 * FORCES the interleave and proves it happened (test/helpers/lock_wait.ts):
 * a holder (or a curator's ordinary save, held open) owns the child row; the
 * tree write is started; Postgres reports it WAITING on that owner; only then
 * is the owner released. A run in which the wait did not happen is RED.
 *
 *   L1  two save_order calls on the two parents of one node   → both orders land
 *   L2  two moves of one multi-parent node (no order)          → both moves land
 *   L3  a move vs a curator's parent-field insert              → both land
 *   L4  a save_order vs a curator's order save                 → both values land
 *   L5  addParent vs a curator's parent-field insert           → both land (latent:
 *       no production caller races it today)
 *   L6  the contract: every mutator refuses outside a transaction and writes
 *       nothing — also when it is given nothing to write (an empty write set,
 *       an empty ordering, a parent with no children), so a caller that forgot
 *       its transaction fails on its first call; addParent on a missing row
 *       answers false (no silent ok)
 *   L7  lock ORDER: two sortChildren over the same rows in opposite orders, in
 *       plain transactions (no retry) → no deadlock
 *   L8  two moves of ONE node out of the SAME parent (P1→P2, P1→P3) → exactly
 *       one lands; the second finds its `from` link gone and is refused, never
 *       turned into an add (the node is never under both targets)
 *   L10 the order mutators on their OWN (no caller lock taken first):
 *       setChildOrder / removeChildOrder vs a curator's order save → both land
 *   L9  lock ORDER across doors: a move renumbering its old siblings vs a
 *       save_order under another parent of those siblings, plain transactions
 *       → no deadlock (the renumber takes the sibling rows in ONE sorted batch)
 *
 * SITUATION: scratch TLD `zztlk` (test/helpers/tree_lock_situation.ts) — an
 * ordered and an order-less thesaurus section, records created at runtime and
 * swept with the TLD. Never test3, never an id band.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql, sqlStateOf, withTransaction } from '../../src/core/db/postgres.ts';
import { isDedaloError } from '../../src/core/errors/index.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { getParentTipo } from '../../src/core/relations/children.ts';
import {
	addParent,
	moveParent,
	persistTreeKeys,
	recalculateSiblingOrders,
	removeChildOrder,
	setChildOrder,
	sortChildren,
} from '../../src/core/relations/parent.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { saveOrder, updateParentData } from '../../src/core/ts_object/ts_api.ts';
import {
	currentBackendPid,
	holdRows,
	settle,
	waitForLockWaiters,
	waitUntilBlockedBy,
} from '../helpers/lock_wait.ts';
import {
	dropTreeSituation,
	ensureTreeSituation,
	newNodes,
	orderUnder,
	PARENT_LINK_TYPE,
	parentIds,
	ROOT_USER_ID,
	rowFingerprint,
	seedLinks,
	succeeded,
	type TreeSection,
	treeSituation,
} from '../helpers/tree_lock_situation.ts';

const TREE = treeSituation('zztlk');
const ORDERED = TREE.ordered;
const PLAIN = TREE.plain;
const SUPERUSER: Principal = { userId: ROOT_USER_ID, isGlobalAdmin: true, isDeveloper: true };
/** How long a forced interleave may take to become observable. */
const WAIT_MS = 15_000;

beforeAll(async () => {
	await ensureTreeSituation(TREE);
	// STRUCTURE FLOOR: the situation resolved to what every case writes through.
	for (const s of [ORDERED, PLAIN]) {
		expect(await getMatrixTableFromTipo(s.section)).toBe(s.table);
		expect(await getParentTipo(s.section)).toBe(s.parent);
	}
}, 60_000);

afterAll(async () => {
	expect(await dropTreeSituation(TREE)).toBe(0);
}, 60_000);

function moveRqo(s: TreeSection, child: number, from: number, to: number) {
	return {
		source: {
			section_tipo: s.section,
			section_id: child,
			old_parent_section_tipo: s.section,
			old_parent_section_id: from,
			new_parent_section_tipo: s.section,
			new_parent_section_id: to,
		},
	} as never;
}

function orderRqo(s: TreeSection, parent: number, children: number[]) {
	return {
		source: {
			section_tipo: s.section,
			ar_locators: children.map((id) => ({ section_tipo: s.section, section_id: id })),
			parent_section_tipo: s.section,
			parent_section_id: parent,
		},
	} as never;
}

function linkTo(s: TreeSection, parent: number, itemId?: number) {
	return {
		...(itemId === undefined ? {} : { id: itemId }),
		section_tipo: s.section,
		section_id: parent,
		from_component_tipo: s.parent,
		type: PARENT_LINK_TYPE,
	};
}

/**
 * A curator's ORDINARY save on `componentTipo` of `sectionId`, held OPEN after
 * its write (its row lock lives until `release`).
 */
async function heldCuratorSave(
	s: TreeSection,
	componentTipo: string,
	sectionId: number,
	changedData: Record<string, unknown>[],
): Promise<{ pid: number; ok: boolean; release: () => Promise<void> }> {
	let releaseGate: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		releaseGate = resolve;
	});
	let wrote: (value: { pid: number; ok: boolean }) => void = () => {};
	const written = new Promise<{ pid: number; ok: boolean }>((resolve) => {
		wrote = resolve;
	});
	const transaction = withTransaction(async () => {
		const pid = await currentBackendPid();
		const saved = await saveComponentData({
			componentTipo,
			sectionTipo: s.section,
			sectionId,
			lang: 'lg-nolan',
			changedData: changedData as never,
			userId: ROOT_USER_ID,
		});
		wrote({ pid, ok: saved.ok });
		await gate;
	});
	const { pid, ok } = await written;
	return {
		pid,
		ok,
		release: async () => {
			releaseGate();
			await transaction;
		},
	};
}

// ---------------------------------------------------------------------------
// L1-L5 — the lost updates
// ---------------------------------------------------------------------------

describe('CORE-3: concurrent tree writes on one node never lose each other', () => {
	test('L1 two save_order calls on the two parents of ONE node both land', async () => {
		const [p1, p2, s1, s2, x] = await newNodes(ORDERED, 5);
		await seedLinks(ORDERED, x, [
			{ parent: p1, itemId: 1, order: 1 },
			{ parent: p2, itemId: 2, order: 1 },
		]);
		await seedLinks(ORDERED, s1, [{ parent: p1, itemId: 1, order: 2 }]);
		await seedLinks(ORDERED, s2, [{ parent: p2, itemId: 1, order: 2 }]);

		const holder = await holdRows([
			{ table: ORDERED.table, sectionTipo: ORDERED.section, sectionId: x },
		]);
		const first = settle(saveOrder(orderRqo(ORDERED, p1, [s1, x]), SUPERUSER));
		const second = settle(saveOrder(orderRqo(ORDERED, p2, [s2, x]), SUPERUSER));
		const bothWaited = await waitForLockWaiters(2, [holder.pid], WAIT_MS);
		await holder.release();
		const outcomes = await Promise.all([first, second]);

		expect(bothWaited, 'the interleave did not happen: both writers must wait on the node').toBe(
			true,
		);
		expect(outcomes.map((o) => o.status)).toEqual(['fulfilled', 'fulfilled']);
		// THE DEFECT: each call rewrote X's WHOLE order key from an unlocked read,
		// so the second commit reverted the first one's pair.
		expect(await orderUnder(ORDERED, x, p1)).toBe(2);
		expect(await orderUnder(ORDERED, x, p2)).toBe(2);
		expect(await orderUnder(ORDERED, s1, p1)).toBe(1);
		expect(await orderUnder(ORDERED, s2, p2)).toBe(1);
	}, 60_000);

	test('L2 two moves of ONE multi-parent node (no order component) both land', async () => {
		const [p1, p2, p3, p4, x] = await newNodes(PLAIN, 5);
		await seedLinks(PLAIN, x, [
			{ parent: p1, itemId: 1 },
			{ parent: p4, itemId: 2 },
		]);

		const holder = await holdRows([
			{ table: PLAIN.table, sectionTipo: PLAIN.section, sectionId: x },
		]);
		const first = settle(updateParentData(moveRqo(PLAIN, x, p1, p2), SUPERUSER));
		const second = settle(updateParentData(moveRqo(PLAIN, x, p4, p3), SUPERUSER));
		const bothWaited = await waitForLockWaiters(2, [holder.pid], WAIT_MS);
		await holder.release();
		const outcomes = await Promise.all([first, second]);

		expect(bothWaited, 'the interleave did not happen: both moves must wait on the node').toBe(
			true,
		);
		expect(outcomes.map((o) => o.status)).toEqual(['fulfilled', 'fulfilled']);
		// Unlocked, the later commit re-persists the parent list it read before
		// the first move committed: P1 comes back and P2 is lost.
		expect(await parentIds(PLAIN, x)).toEqual([p2, p3].sort((a, b) => a - b));
	}, 60_000);

	test("L3 a move vs a curator's parent-field insert: both links survive", async () => {
		const [p1, p3, pc, x] = await newNodes(PLAIN, 4);
		await seedLinks(PLAIN, x, [{ parent: p1, itemId: 1 }]);

		const curator = await heldCuratorSave(PLAIN, PLAIN.parent, x, [
			{ action: 'insert', id: null, value: { section_tipo: PLAIN.section, section_id: pc } },
		]);
		const move = settle(updateParentData(moveRqo(PLAIN, x, p1, p3), SUPERUSER));
		const moveWaited = await waitUntilBlockedBy(curator.pid, 1, WAIT_MS);
		await curator.release();
		const outcome = await move;

		expect(curator.ok).toBe(true);
		expect(moveWaited, 'the interleave did not happen: the move must wait on the curator').toBe(
			true,
		);
		expect(outcome.status).toBe('fulfilled');
		// THE DEFECT: the move rewrote the key from a read taken before the
		// curator committed — the curator's Pc vanished with ok:true on both sides.
		expect(await parentIds(PLAIN, x)).toEqual([p3, pc].sort((a, b) => a - b));
	}, 60_000);

	test("L4 a save_order vs a curator's order save: both values survive", async () => {
		const [p1, p2, s1, x] = await newNodes(ORDERED, 4);
		await seedLinks(ORDERED, x, [
			{ parent: p1, itemId: 1, order: 1 },
			{ parent: p2, itemId: 2, order: 1 },
		]);
		await seedLinks(ORDERED, s1, [{ parent: p1, itemId: 1, order: 2 }]);

		const curator = await heldCuratorSave(ORDERED, ORDERED.order as string, x, [
			{ action: 'update', id: 2, value: { id: 2, value: 5 } },
		]);
		const reorder = settle(saveOrder(orderRqo(ORDERED, p1, [s1, x]), SUPERUSER));
		const reorderWaited = await waitUntilBlockedBy(curator.pid, 1, WAIT_MS);
		await curator.release();
		const outcome = await reorder;

		expect(curator.ok).toBe(true);
		expect(
			reorderWaited,
			'the interleave did not happen: the reorder must wait on the curator',
		).toBe(true);
		expect(outcome.status).toBe('fulfilled');
		expect(await orderUnder(ORDERED, x, p1)).toBe(2);
		// THE DEFECT: the reorder re-persisted X's order key read before the
		// curator's commit, reverting the curator's value under P2.
		expect(await orderUnder(ORDERED, x, p2)).toBe(5);
	}, 60_000);

	test("L5 addParent vs a curator's parent-field insert: both links survive", async () => {
		const [p1, p2, pc, x] = await newNodes(PLAIN, 4);
		await seedLinks(PLAIN, x, [{ parent: p1, itemId: 1 }]);

		const curator = await heldCuratorSave(PLAIN, PLAIN.parent, x, [
			{ action: 'insert', id: null, value: { section_tipo: PLAIN.section, section_id: pc } },
		]);
		const add = settle(
			withTransaction(() =>
				addParent(PLAIN.section, x, PLAIN.parent, linkTo(PLAIN, p2), ROOT_USER_ID),
			),
		);
		const addWaited = await waitUntilBlockedBy(curator.pid, 1, WAIT_MS);
		await curator.release();
		const outcome = await add;

		expect(curator.ok).toBe(true);
		expect(addWaited, 'the interleave did not happen: addParent must wait on the curator').toBe(
			true,
		);
		expect(outcome.status).toBe('fulfilled');
		expect(outcome.status === 'fulfilled' && succeeded(outcome.value)).toBe(true);
		expect(await parentIds(PLAIN, x)).toEqual([p1, p2, pc].sort((a, b) => a - b));
	}, 60_000);
});

// ---------------------------------------------------------------------------
// L6 — the contract
// ---------------------------------------------------------------------------

/** A fixture where EVERY mutator below would genuinely change a row. */
async function contractFixture(): Promise<{
	p1: number;
	p2: number;
	p3: number;
	s1: number;
	x: number;
}> {
	const [p1, p2, p3, s1, x] = await newNodes(ORDERED, 5);
	await seedLinks(ORDERED, x, [
		{ parent: p1, itemId: 1, order: 3 },
		{ parent: p2, itemId: 2, order: 1 },
	]);
	await seedLinks(ORDERED, s1, [{ parent: p1, itemId: 1, order: 2 }]);
	return { p1, p2, p3, s1, x };
}

type Fixture = Awaited<ReturnType<typeof contractFixture>>;

const MUTATORS: [string, (f: Fixture) => Promise<unknown>][] = [
	[
		'addParent',
		(f) => addParent(ORDERED.section, f.x, ORDERED.parent, linkTo(ORDERED, f.p3), ROOT_USER_ID),
	],
	[
		'moveParent',
		(f) =>
			moveParent(
				ORDERED.section,
				f.x,
				ORDERED.parent,
				linkTo(ORDERED, f.p2),
				linkTo(ORDERED, f.p3),
				ROOT_USER_ID,
			),
	],
	[
		'setChildOrder',
		(f) => setChildOrder(ORDERED.section, f.x, linkTo(ORDERED, f.p2, 2), ROOT_USER_ID),
	],
	[
		'removeChildOrder',
		(f) => removeChildOrder(ORDERED.section, f.x, linkTo(ORDERED, f.p1, 1), ROOT_USER_ID),
	],
	[
		'recalculateSiblingOrders',
		(f) => recalculateSiblingOrders(ORDERED.section, ORDERED.section, f.p1, ROOT_USER_ID),
	],
	[
		// THE WRITE itself: outside a transaction the chokepoint's fast path would
		// autocommit the value and file its history as a separate write.
		'persistTreeKeys',
		(f) =>
			persistTreeKeys(
				{ table: ORDERED.table, sectionTipo: ORDERED.section, sectionId: f.x },
				[
					{
						column: 'relation',
						key: ORDERED.parent,
						after: [linkTo(ORDERED, f.p3, 9)],
					},
				],
				ROOT_USER_ID,
			),
	],
	[
		'sortChildren',
		(f) =>
			sortChildren(
				ORDERED.section,
				[
					{ section_tipo: ORDERED.section, section_id: f.x },
					{ section_tipo: ORDERED.section, section_id: f.s1 },
				],
				ORDERED.section,
				f.p1,
				ROOT_USER_ID,
			),
	],
	// NOTHING TO WRITE: the refusal must not depend on the input carrying a
	// write (each of these reaches no locked read of a row).
	[
		'persistTreeKeys (an empty write set)',
		(f) =>
			persistTreeKeys(
				{ table: ORDERED.table, sectionTipo: ORDERED.section, sectionId: f.x },
				[],
				ROOT_USER_ID,
			),
	],
	[
		'sortChildren (an empty ordering)',
		(f) => sortChildren(ORDERED.section, [], ORDERED.section, f.p1, ROOT_USER_ID),
	],
	[
		'recalculateSiblingOrders (a parent with no children)',
		(f) => recalculateSiblingOrders(ORDERED.section, ORDERED.section, f.p3, ROOT_USER_ID),
	],
];

describe('CORE-3: the parent.ts mutation contract', () => {
	for (const [name, run] of MUTATORS) {
		test(`L6 ${name} outside a transaction refuses (internal.invariant) and writes NOTHING`, async () => {
			const fixture = await contractFixture();
			const before = [
				await rowFingerprint(ORDERED, fixture.x),
				await rowFingerprint(ORDERED, fixture.s1),
			];
			const outcome = await settle(run(fixture));
			const after = [
				await rowFingerprint(ORDERED, fixture.x),
				await rowFingerprint(ORDERED, fixture.s1),
			];
			expect(outcome.status, `${name} ran a read-modify-write with no transaction`).toBe(
				'rejected',
			);
			const reason = outcome.status === 'rejected' ? outcome.reason : null;
			expect(isDedaloError(reason) ? reason.code : String(reason)).toBe('internal.invariant');
			expect(after).toEqual(before);
		}, 30_000);
	}

	test('L6 addParent on a MISSING row answers false (no silent ok) and writes nothing', async () => {
		const [p1, gone] = await newNodes(PLAIN, 2);
		await sql.unsafe(`DELETE FROM "${PLAIN.table}" WHERE section_tipo = $1 AND section_id = $2`, [
			PLAIN.section,
			gone,
		]);
		const result = await withTransaction(() =>
			addParent(PLAIN.section, gone, PLAIN.parent, linkTo(PLAIN, p1, 1), ROOT_USER_ID),
		);
		// THE DEFECT: the UPDATE matched 0 rows and the call still answered ok.
		expect(succeeded(result)).toBe(false);
		expect(await rowFingerprint(PLAIN, gone)).toBeNull();
	}, 30_000);
});

// ---------------------------------------------------------------------------
// L7 — lock ordering
// ---------------------------------------------------------------------------

describe('CORE-3: sibling rewrites lock in ONE order', () => {
	test('L7 opposite-order sortChildren over the same rows, plain transactions: no deadlock', async () => {
		const [p1, p2, x, m, y] = await newNodes(ORDERED, 5);
		// Every row changes under BOTH parents, so each call writes all three.
		await seedLinks(ORDERED, x, [
			{ parent: p1, itemId: 1, order: 2 },
			{ parent: p2, itemId: 2, order: 2 },
		]);
		await seedLinks(ORDERED, m, [
			{ parent: p1, itemId: 1, order: 3 },
			{ parent: p2, itemId: 2, order: 1 },
		]);
		await seedLinks(ORDERED, y, [
			{ parent: p1, itemId: 1, order: 1 },
			{ parent: p2, itemId: 2, order: 3 },
		]);
		const locators = (ids: number[]) =>
			ids.map((id) => ({ section_tipo: ORDERED.section, section_id: id }));

		const holder = await holdRows([
			{ table: ORDERED.table, sectionTipo: ORDERED.section, sectionId: m },
		]);
		const first = settle(
			withTransaction(() =>
				sortChildren(ORDERED.section, locators([x, m, y]), ORDERED.section, p1, ROOT_USER_ID),
			),
		);
		const second = settle(
			withTransaction(() =>
				sortChildren(ORDERED.section, locators([y, m, x]), ORDERED.section, p2, ROOT_USER_ID),
			),
		);
		const bothWaiting = await waitForLockWaiters(2, [holder.pid], WAIT_MS);
		await holder.release();
		const outcomes = await Promise.all([first, second]);

		expect(bothWaiting, 'the interleave did not happen: both rewrites must be waiting').toBe(true);
		const deadlocked = outcomes.filter(
			(o) => o.status === 'rejected' && sqlStateOf(o.reason) === '40P01',
		).length;
		// THE DEFECT: row-by-row locking in caller order — X then M against Y then
		// M — is a lock-order inversion; Postgres aborts one side with 40P01.
		expect(deadlocked, 'a sibling rewrite deadlocked (40P01)').toBe(0);
		expect(outcomes.map((o) => o.status)).toEqual(['fulfilled', 'fulfilled']);
		expect([
			await orderUnder(ORDERED, x, p1),
			await orderUnder(ORDERED, m, p1),
			await orderUnder(ORDERED, y, p1),
		]).toEqual([1, 2, 3]);
		expect([
			await orderUnder(ORDERED, y, p2),
			await orderUnder(ORDERED, m, p2),
			await orderUnder(ORDERED, x, p2),
		]).toEqual([1, 2, 3]);
	}, 60_000);
});

// ---------------------------------------------------------------------------
// L8 — a move whose `from` link a concurrent move already took
// ---------------------------------------------------------------------------

describe('CORE-3: a stale move is refused, never turned into an add', () => {
	test('L8 two moves of ONE node out of the SAME parent: exactly one lands, the node has ONE parent', async () => {
		const [p1, p2, p3, x] = await newNodes(PLAIN, 4);
		await seedLinks(PLAIN, x, [{ parent: p1, itemId: 1 }]);

		const holder = await holdRows([
			{ table: PLAIN.table, sectionTipo: PLAIN.section, sectionId: x },
		]);
		const first = settle(updateParentData(moveRqo(PLAIN, x, p1, p2), SUPERUSER));
		const second = settle(updateParentData(moveRqo(PLAIN, x, p1, p3), SUPERUSER));
		const bothWaited = await waitForLockWaiters(2, [holder.pid], WAIT_MS);
		await holder.release();
		const outcomes = await Promise.all([first, second]);

		expect(bothWaited, 'the interleave did not happen: both moves must wait on the node').toBe(
			true,
		);
		expect(outcomes.filter((o) => o.status === 'fulfilled').length).toBe(1);
		const refused = outcomes.find((o) => o.status === 'rejected');
		const reason = refused?.status === 'rejected' ? refused.reason : null;
		expect(isDedaloError(reason) ? reason.code : String(reason)).toBe('tree.node_write_failed');
		expect(String((reason as { cause?: { message?: unknown } } | null)?.cause?.message)).toContain(
			'Remove old parent locator failed',
		);
		// THE DEFECT GUARDED: the second move, finding P1 gone, ADDS its target
		// anyway — X under both P2 and P3, both calls answering success.
		const parents = await parentIds(PLAIN, x);
		expect([[p2], [p3]]).toContainEqual(parents);
	}, 60_000);
});

// ---------------------------------------------------------------------------
// L9 — a move's sibling renumber vs a save_order over the same siblings
// ---------------------------------------------------------------------------

describe('CORE-3: a move and a reorder over shared siblings lock in ONE order', () => {
	test('L9 move renumbering P1 vs save_order under P2, plain transactions: no deadlock', async () => {
		// Y < Z by id; both under P1 AND P2. Under P1 the order is X, Z, Y, so the
		// move's renumber visits Z before Y; save_order(P2, [Z, Y]) locks its batch
		// by id (Y, Z). Row by row, the move would hold Z waiting on Y while the
		// reorder holds Y waiting on Z: a lock-order inversion, 40P01.
		const [p1, p2, q, x, y, z] = await newNodes(ORDERED, 6);
		await seedLinks(ORDERED, x, [{ parent: p1, itemId: 1, order: 1 }]);
		await seedLinks(ORDERED, z, [
			{ parent: p1, itemId: 1, order: 2 },
			{ parent: p2, itemId: 2, order: 2 },
		]);
		await seedLinks(ORDERED, y, [
			{ parent: p1, itemId: 1, order: 3 },
			{ parent: p2, itemId: 2, order: 1 },
		]);

		const holder = await holdRows([
			{ table: ORDERED.table, sectionTipo: ORDERED.section, sectionId: y },
		]);
		// The reorder queues on Y FIRST (it holds nothing yet: Y leads its batch).
		const reorder = settle(
			withTransaction(() =>
				sortChildren(
					ORDERED.section,
					[z, y].map((id) => ({ section_tipo: ORDERED.section, section_id: id })),
					ORDERED.section,
					p2,
					ROOT_USER_ID,
				),
			),
		);
		const reorderWaited = await waitUntilBlockedBy(holder.pid, 1, WAIT_MS);
		// The move: X out of P1 into Q, then P1's siblings renumbered (Z 2→1, Y 3→2).
		const move = settle(
			withTransaction(async () => {
				const moved = await moveParent(
					ORDERED.section,
					x,
					ORDERED.parent,
					linkTo(ORDERED, p1),
					linkTo(ORDERED, q),
					ROOT_USER_ID,
				);
				await recalculateSiblingOrders(ORDERED.section, ORDERED.section, p1, ROOT_USER_ID);
				return moved;
			}),
		);
		const bothWaiting = await waitForLockWaiters(2, [holder.pid], WAIT_MS);
		await holder.release();
		const outcomes = await Promise.all([reorder, move]);

		expect(reorderWaited, 'the reorder never queued on the held sibling').toBe(true);
		expect(bothWaiting, 'the interleave did not happen: both writers must be waiting').toBe(true);
		const deadlocked = outcomes.filter(
			(o) => o.status === 'rejected' && sqlStateOf(o.reason) === '40P01',
		).length;
		expect(deadlocked, 'a move and a reorder deadlocked (40P01)').toBe(0);
		expect(outcomes.map((o) => o.status)).toEqual(['fulfilled', 'fulfilled']);
		expect(await parentIds(ORDERED, x)).toEqual([q]);
		expect([await orderUnder(ORDERED, z, p1), await orderUnder(ORDERED, y, p1)]).toEqual([1, 2]);
		expect([await orderUnder(ORDERED, z, p2), await orderUnder(ORDERED, y, p2)]).toEqual([1, 2]);
	}, 60_000);
});

// ---------------------------------------------------------------------------
// L10 — the order mutators lock their own read
// ---------------------------------------------------------------------------

const ORDER_MUTATORS: [string, (x: number, p1: number) => Promise<unknown>, number | null][] = [
	// setChildOrder writes X's order under P1: descriptor-children count + 1 = 2
	// (X itself is already P1's one child).
	[
		'setChildOrder',
		(x, p1) => setChildOrder(ORDERED.section, x, linkTo(ORDERED, p1, 1), ROOT_USER_ID),
		2,
	],
	// removeChildOrder drops X's order under P1.
	[
		'removeChildOrder',
		(x, p1) => removeChildOrder(ORDERED.section, x, linkTo(ORDERED, p1, 1), ROOT_USER_ID),
		null,
	],
];

describe('CORE-3: an order mutator called on its own never reverts a concurrent save', () => {
	for (const [name, run, expectedUnderP1] of ORDER_MUTATORS) {
		test(`L10 ${name} vs a curator's order save on the same node: both values survive`, async () => {
			const [p1, p2, x] = await newNodes(ORDERED, 3);
			await seedLinks(ORDERED, x, [
				{ parent: p1, itemId: 1, order: 7 },
				{ parent: p2, itemId: 2, order: 1 },
			]);

			const curator = await heldCuratorSave(ORDERED, ORDERED.order as string, x, [
				{ action: 'update', id: 2, value: { id: 2, value: 5 } },
			]);
			const mutation = settle(withTransaction(() => run(x, p1)));
			const waited = await waitUntilBlockedBy(curator.pid, 1, WAIT_MS);
			await curator.release();
			const outcome = await mutation;

			expect(curator.ok).toBe(true);
			expect(waited, `the interleave did not happen: ${name} must wait on the curator`).toBe(true);
			expect(outcome.status).toBe('fulfilled');
			expect(await orderUnder(ORDERED, x, p1)).toBe(expectedUnderP1);
			// THE DEFECT GUARDED: an unlocked read rewrites X's whole order key from
			// the value before the curator's commit, reverting its P2 value.
			expect(await orderUnder(ORDERED, x, p2)).toBe(5);
		}, 60_000);
	}
});
