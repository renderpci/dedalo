/**
 * recalculateSiblingOrders (src/core/relations/parent.ts:416) and sortChildren
 * (:484) — the two sibling-order writers of a Dédalo hierarchy. Both walk a
 * parent's children, resolve each child's parent-link id_key and write the
 * position into the CHILD's own order component paired to that id_key.
 *
 * The difference the tests pin: recalculate DERIVES the child list (descriptor
 * children, already sibling-ordered by children.ts orderChildHits, so an
 * id-less child SINKS LAST), while sortChildren TAKES the list from the caller
 * in the exact order given. Both burn a position on a skipped child — `order++`
 * runs whether or not anything was written.
 *
 * NOT COVERED, and why. The two `order++` statements in recalculateSiblingOrders'
 * skip branches (:435, :445) are UNOBSERVABLE: the child list comes from
 * getChildrenOfTypeLocators, which sinks every unresolvable-id_key child LAST
 * (children.ts orderChildHits, UNORDERED = MAX_SAFE_INTEGER), so a skipped child
 * is always the tail and the burnt position is never handed to anybody. Deleting
 * both statements leaves this file green — deliberately, rather than by a test
 * shaped to fake the coverage. sortChildren's `order++` IS observable (the caller
 * supplies the list unsorted) and is pinned below.
 *
 * SCRATCH SURFACE (this file's namespace ONLY — other agents write the same
 * database concurrently):
 *   matrix_test rows section_tipo='test3', section_id 916100-916199
 *   matrix_time_machine rows section_tipo='test3', section_id 916100-916199
 * No table-global count is taken anywhere in this file.
 *
 * FIXTURE. test3 section_map: parent='test71', order='test22'
 * (component_number), is_descriptor='test88'. A parent link MUST carry
 * type 'dd47' + from_component_tipo 'test71' or the inverse child probe
 * returns nothing and every ordering assertion collapses to comparing empty
 * arrays. test38 is the section with no thesaurus map — the "no order
 * component" fixture.
 */

import { afterAll, beforeEach, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { recalculateSiblingOrders, sortChildren } from '../../src/core/relations/parent.ts';

const SECTION = 'test3';
const PARENT_TIPO = 'test71';
const ORDER_TIPO = 'test22';
const DESCRIPTOR_TIPO = 'test88';
const ID_MIN = 916100;
const ID_MAX = 916199;

/** A parent link. `id: null` omits the item id — the unresolvable-id_key case. */
function parentLink(sectionId: number, id: number | null): Record<string, unknown> {
	const locator: Record<string, unknown> = {
		type: 'dd47',
		section_id: String(sectionId),
		section_tipo: SECTION,
		from_component_tipo: PARENT_TIPO,
	};
	if (id !== null) locator.id = id;
	return locator;
}

async function seedNode(input: {
	section_id: number;
	parents?: Record<string, unknown>[];
	descriptor?: boolean;
	order?: unknown[];
}): Promise<void> {
	const relation: Record<string, unknown[]> = {};
	if (input.parents !== undefined) relation[PARENT_TIPO] = input.parents;
	if (input.descriptor !== false) {
		relation[DESCRIPTOR_TIPO] = [
			{
				id: 1,
				type: 'dd151',
				section_id: '1',
				section_tipo: 'dd64',
				from_component_tipo: DESCRIPTOR_TIPO,
			},
		];
	}
	await sql.unsafe(
		`INSERT INTO matrix_test (section_id, section_tipo, relation, "number")
		 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb)`,
		[
			input.section_id,
			SECTION,
			Object.keys(relation).length === 0 ? null : JSON.stringify(relation),
			input.order === undefined ? null : JSON.stringify({ [ORDER_TIPO]: input.order }),
		] as (string | number | null)[],
	);
}

/** The raw `number` column TEXT — for byte-identity assertions. */
async function numberText(sectionId: number): Promise<string | null> {
	const rows = (await sql.unsafe(
		`SELECT "number"::text AS "number" FROM matrix_test
		  WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, sectionId],
	)) as { number: string | null }[];
	// NEVER swallow a missing row: it means this file's own seed failed.
	if (rows.length === 0) throw new Error(`numberText: ${SECTION}/${sectionId} is gone`);
	return rows[0]?.number ?? null;
}

async function orderItems(sectionId: number): Promise<{ id?: number; value?: unknown }[]> {
	const text = await numberText(sectionId);
	const numberColumn = text === null ? {} : (JSON.parse(text) as Record<string, []>);
	return (numberColumn[ORDER_TIPO] ?? []) as { id?: number; value?: unknown }[];
}

/** The order value paired to id_key 1 (the id every seed above uses). */
async function orderValue(sectionId: number, idKey = 1): Promise<unknown> {
	const item = (await orderItems(sectionId)).find((entry) => Number(entry.id) === idKey);
	return item === undefined ? null : item.value;
}

async function scratchRowCount(): Promise<number> {
	let total = 0;
	for (const table of ['matrix_test', 'matrix_time_machine']) {
		const rows = (await sql.unsafe(
			`SELECT count(*)::int AS count FROM "${table}"
			  WHERE section_tipo = ANY(string_to_array($1, ','))
			    AND section_id BETWEEN $2 AND $3`,
			[`${SECTION},test38`, ID_MIN, ID_MAX],
		)) as { count: number }[];
		total += rows[0]?.count ?? 0;
	}
	return total;
}

async function cleanScratch(): Promise<void> {
	for (const table of ['matrix_test', 'matrix_time_machine']) {
		await sql.unsafe(
			`DELETE FROM "${table}" WHERE section_tipo = ANY(string_to_array($1, ','))
			   AND section_id BETWEEN $2 AND $3`,
			[`${SECTION},test38`, ID_MIN, ID_MAX],
		);
	}
}

beforeEach(async () => {
	await cleanScratch();
	expect(await scratchRowCount()).toBe(0);
});

afterAll(async () => {
	await cleanScratch();
	const left = await scratchRowCount();
	if (left !== 0) {
		throw new Error(`sibling_order_write scratch cleanup left ${left} row(s) in 916100-916199`);
	}
});

// ---------------------------------------------------------------------------
// recalculateSiblingOrders
// ---------------------------------------------------------------------------

test('recalculateSiblingOrders renumbers sparse descriptor children densely 1..n', async () => {
	await seedNode({ section_id: 916100 });
	await seedNode({
		section_id: 916101,
		parents: [parentLink(916100, 1)],
		order: [{ id: 1, value: 5 }],
	});
	await seedNode({
		section_id: 916102,
		parents: [parentLink(916100, 1)],
		order: [{ id: 1, value: 7 }],
	});
	await seedNode({
		section_id: 916103,
		parents: [parentLink(916100, 1)],
		order: [{ id: 1, value: 9 }],
	});

	expect(await recalculateSiblingOrders(SECTION, SECTION, 916100)).toBe(true);

	// The walk order is the SIBLING order (5 < 7 < 9), so the dense run follows it.
	expect(await orderValue(916101)).toBe(1);
	expect(await orderValue(916102)).toBe(2);
	expect(await orderValue(916103)).toBe(3);
});

test('recalculateSiblingOrders BURNS the position of a child whose parent link carries no id', async () => {
	// A child with an id-less parent link cannot resolve an id_key, so it sinks
	// LAST in orderChildHits (UNORDERED) — the skip is therefore always the tail
	// position, never a hole in the middle.
	await seedNode({ section_id: 916110 });
	await seedNode({
		section_id: 916111,
		parents: [parentLink(916110, 1)],
		order: [{ id: 1, value: 5 }],
	});
	await seedNode({
		section_id: 916112,
		parents: [parentLink(916110, 1)],
		order: [{ id: 1, value: 7 }],
	});
	await seedNode({
		section_id: 916113,
		parents: [parentLink(916110, null)],
		order: [{ id: 9, value: 99 }],
	});
	const strayBefore = await numberText(916113);

	expect(await recalculateSiblingOrders(SECTION, SECTION, 916110)).toBe(true);

	expect(await orderValue(916111)).toBe(1);
	expect(await orderValue(916112)).toBe(2);
	// Untouched, byte for byte — position 3 is consumed and written nowhere.
	expect(await numberText(916113)).toBe(strayBefore);
});

test('recalculateSiblingOrders is a NO-OP when the stored order is already correct — even as a STRING', async () => {
	// The equality is Math.trunc(Number(value)) === order, so '1' counts as 1.
	// A regression to a strict === would rewrite the row, dropping the sibling
	// key and re-typing the value — hence the byte-identity assertion.
	await seedNode({ section_id: 916120 });
	await seedNode({
		section_id: 916121,
		parents: [parentLink(916120, 1)],
		order: [{ id: 1, value: '1', marker: 'keep-me' }],
	});
	const before = await numberText(916121);

	expect(await recalculateSiblingOrders(SECTION, SECTION, 916120)).toBe(true);
	expect(await numberText(916121)).toBe(before);
});

test('recalculateSiblingOrders SKIPS non-descriptor children entirely', async () => {
	await seedNode({ section_id: 916130 });
	await seedNode({
		section_id: 916131,
		parents: [parentLink(916130, 1)],
		order: [{ id: 1, value: 5 }],
	});
	// child of the same parent, but no is_descriptor locator ⇒ outside the walk.
	await seedNode({
		section_id: 916132,
		parents: [parentLink(916130, 1)],
		descriptor: false,
		order: [{ id: 1, value: 7 }],
	});
	const nonDescriptorBefore = await numberText(916132);

	expect(await recalculateSiblingOrders(SECTION, SECTION, 916130)).toBe(true);
	expect(await orderValue(916131)).toBe(1);
	expect(await numberText(916132)).toBe(nonDescriptorBefore);
});

test('recalculateSiblingOrders returns false and writes nothing when the section has NO order component', async () => {
	// test38 declares no section_map thesaurus ⇒ getComponentOrderTipo → null.
	await sql.unsafe(
		`INSERT INTO matrix_test (section_id, section_tipo, relation)
		 VALUES ($1,'test38',$2::text::jsonb)`,
		[916140, JSON.stringify({ [PARENT_TIPO]: [parentLink(916141, 1)] })] as (string | number)[],
	);
	const rowsBefore = (await sql.unsafe(
		`SELECT "number"::text AS "number" FROM matrix_test
		  WHERE section_tipo='test38' AND section_id = $1`,
		[916140],
	)) as { number: string | null }[];

	expect(await recalculateSiblingOrders('test38', SECTION, 916140)).toBe(false);

	const rowsAfter = (await sql.unsafe(
		`SELECT "number"::text AS "number" FROM matrix_test
		  WHERE section_tipo='test38' AND section_id = $1`,
		[916140],
	)) as { number: string | null }[];
	expect(rowsAfter).toEqual(rowsBefore);
	expect(rowsAfter[0]?.number).toBeNull();
});

// ---------------------------------------------------------------------------
// sortChildren
// ---------------------------------------------------------------------------

test('sortChildren writes the caller-given positions and returns ONLY the records it changed', async () => {
	await seedNode({ section_id: 916150 });
	await seedNode({
		section_id: 916151,
		parents: [parentLink(916150, 1)],
		order: [{ id: 1, value: 5 }],
	});
	await seedNode({
		section_id: 916152,
		parents: [parentLink(916150, 1)],
		order: [{ id: 1, value: 2 }], // already in position 2 ⇒ skipped
	});
	await seedNode({
		section_id: 916153,
		parents: [parentLink(916150, 1)],
		order: [{ id: 1, value: 9 }],
	});

	const locators = [916151, 916152, 916153].map((sectionId) => ({
		section_tipo: SECTION,
		section_id: sectionId,
	}));
	const changed = await sortChildren(SECTION, locators, SECTION, 916150);

	expect(changed).toEqual([
		{ value: 1, locator: { section_tipo: SECTION, section_id: 916151 } },
		{ value: 3, locator: { section_tipo: SECTION, section_id: 916153 } },
	]);
	// Stored state is 1,2,3 — the skipped one included.
	expect(await orderValue(916151)).toBe(1);
	expect(await orderValue(916152)).toBe(2);
	expect(await orderValue(916153)).toBe(3);
});

test('sortChildren honours the CALLER order, not the stored sibling order', async () => {
	// The reversal is what a drag-and-drop reorder actually sends; if the engine
	// re-derived the list this assertion would come back 1,2,3.
	await seedNode({ section_id: 916160 });
	await seedNode({
		section_id: 916161,
		parents: [parentLink(916160, 1)],
		order: [{ id: 1, value: 1 }],
	});
	await seedNode({
		section_id: 916162,
		parents: [parentLink(916160, 1)],
		order: [{ id: 1, value: 2 }],
	});

	const changed = await sortChildren(
		SECTION,
		[
			{ section_tipo: SECTION, section_id: 916162 },
			{ section_tipo: SECTION, section_id: 916161 },
		],
		SECTION,
		916160,
	);

	expect(changed).toHaveLength(2);
	expect(await orderValue(916162)).toBe(1);
	expect(await orderValue(916161)).toBe(2);
});

test('sortChildren BURNS the position of a locator whose id_key or table is unresolvable', async () => {
	// `order++` sits at the TOP of the loop and sortChildren does no ordering
	// pass of its own, so a skipped MIDDLE locator really is in the middle: the
	// third locator gets 3, not 2.
	await seedNode({ section_id: 916170 });
	await seedNode({
		section_id: 916171,
		parents: [parentLink(916170, 1)],
		order: [{ id: 1, value: 5 }],
	});
	// no parent link at all ⇒ resolveParentLinkIdKey returns 0.
	await seedNode({ section_id: 916172, order: [{ id: 1, value: 7 }] });
	await seedNode({
		section_id: 916173,
		parents: [parentLink(916170, 1)],
		order: [{ id: 1, value: 9 }],
	});
	const unresolvableBefore = await numberText(916172);

	const changed = await sortChildren(
		SECTION,
		[
			{ section_tipo: SECTION, section_id: 916171 },
			{ section_tipo: SECTION, section_id: 916172 },
			{ section_tipo: SECTION, section_id: 916173 },
		],
		SECTION,
		916170,
	);

	// Fail loud rather than narrow silently: `false` here would mean the fixture
	// lost its order component, not that the skip behaved.
	if (changed === false) throw new Error('sortChildren returned false — fixture broken');
	expect(changed.map((change) => change.value)).toEqual([1, 3]);
	expect(await orderValue(916171)).toBe(1);
	expect(await numberText(916172)).toBe(unresolvableBefore);
	expect(await orderValue(916173)).toBe(3);
});

test('sortChildren skips a locator whose section_tipo resolves to NO matrix table, burning its position too', async () => {
	await seedNode({ section_id: 916180 });
	await seedNode({
		section_id: 916181,
		parents: [parentLink(916180, 1)],
		order: [{ id: 1, value: 5 }],
	});

	const changed = await sortChildren(
		SECTION,
		[
			{ section_tipo: 'zzt999', section_id: 916189 }, // getMatrixTableFromTipo → null
			{ section_tipo: SECTION, section_id: 916181 },
		],
		SECTION,
		916180,
	);

	expect(changed).toEqual([{ value: 2, locator: { section_tipo: SECTION, section_id: 916181 } }]);
	expect(await orderValue(916181)).toBe(2);
});

test('sortChildren returns the LITERAL false — not an empty change list — when there is no order component', async () => {
	const result = await sortChildren(
		'test38',
		[{ section_tipo: 'test38', section_id: 916190 }],
		SECTION,
		916190,
	);
	// The distinction is load-bearing: [] means "ordered, nothing moved",
	// false means "this section cannot be ordered at all".
	// toBe is Object.is, so a regression to `return []` reddens here; the
	// Array.isArray line states the intent for a reader.
	expect(result).toBe(false);
	expect(Array.isArray(result)).toBe(false);
});
