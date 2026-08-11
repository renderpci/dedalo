/**
 * getChildrenOfType (src/core/relations/children.ts:314) — the descriptor-partitioned
 * sibling-ordered direct-children read (PHP get_children_of_type :664).
 *
 * WHAT THIS PINS, branch by branch, as the function actually reads today:
 *   1. `componentTipo ?? getChildrenTipo(sectionTipo)` — explicit tipo bypasses the walk.
 *   2. childrenTipo === null  → `[]` (dd64 has no component_relation_children).
 *   3. parentTipo   === null  → `[]` (dd64 + an explicit children tipo: the ontology
 *      relation walk finds nothing and the section fallback has no parent component).
 *   4. is_descriptor declared as a STRING tipo → a second dd64 locator filter joined
 *      with op 'AND' → 'descriptor' sees dd64/1 only, 'non_descriptor' dd64/2 only.
 *   5. is_descriptor declared as a BOOLEAN (test65's section_map test83 has
 *      `is_descriptor: false`) → `typeof … === 'string'` is false, the filter is
 *      SILENTLY SKIPPED and BOTH children come back for BOTH types. This is the
 *      branch a "truthiness" refactor (`if (isDescriptorTipo)` → `!== undefined`)
 *      breaks: it would push a filter whose from_component_tipo is `false`.
 *   6. hits.length === 0 → early `[]` before any ordering work.
 *   7. thesaurus.order declared → orderChildHits; children WITHOUT a paired order
 *      value sink LAST (UNORDERED = MAX_SAFE_INTEGER) and ties keep section_id order.
 *   8. limit > 0 → slice(offset, offset+limit); limit 0 → slice(offset). Paging
 *      happens AFTER the ordering, so page 2 of an order-sorted set is the 2nd
 *      ordered child, not the 2nd by id.
 *   9. The wire shape: section_id is an INT
 *      (WC-2026-08-10-section-id-int-canonical — the PHP cast-to-string law is
 *      repealed), from_component_tipo is the CHILDREN tipo (test201 / test156),
 *      type is dd48 — never the dd47 stored on the link. The SEEDED parent /
 *      is_descriptor links below stay STRING on purpose: legacy stored data is
 *      real and the emitted id comes from the row's own int section_id column,
 *      not from the link's bytes.
 *
 * FIXTURE TRAP (cost an hour if ignored): a child's parent link MUST carry
 * `type: 'dd47'` and `from_component_tipo: 'test71'`. The canonical test3 playground
 * rows use dd151 links; copy-pasting them makes the inverse probe return zero and
 * every ordering assertion degenerates into comparing two empty arrays.
 *
 * FIXTURE MAP
 *   test3  → section_map test137: parent test71, order test22 (component_number),
 *            is_descriptor test88 (STRING tipo); children component test201.
 *   test65 → section_map test83 : parent test73, order test19,
 *            is_descriptor FALSE (boolean); children component test156.
 *   dd64   → no children/parent components at all (the unresolvable fixture);
 *            its rows 1 (yes/descriptor) and 2 (no/non-descriptor) are the
 *            is_descriptor targets.
 *
 * SCRATCH SURFACE (this file's namespace ONLY — other agents write the same database
 * concurrently, so no table-global count is taken anywhere here):
 *   matrix_test rows section_tipo IN ('test3','test65'), section_id 927000-927999
 *   matrix_time_machine rows, same tipos, same id range
 */

import { afterAll, beforeAll, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { getChildrenOfType } from '../../src/core/relations/children.ts';

const ID_MIN = 927000;
const ID_MAX = 927999;
const TIPOS = ['test3', 'test65'];

// test3 fixture
const T3 = 'test3';
const T3_PARENT_TIPO = 'test71';
const T3_ORDER_TIPO = 'test22';
const T3_DESCRIPTOR_TIPO = 'test88';
const T3_CHILDREN_TIPO = 'test201';
// test65 fixture (boolean is_descriptor)
const T65 = 'test65';
const T65_PARENT_TIPO = 'test73';
const T65_CHILDREN_TIPO = 'test156';

// --- scratch ids -----------------------------------------------------------
const PARTITION_PARENT = 927000;
const DESCRIPTOR_CHILD = 927001;
const NON_DESCRIPTOR_CHILD = 927002;

const ORDER_PARENT = 927100;
const ORDER_SECOND = 927101; // stored order 2 — LOWER id, HIGHER order
const ORDER_FIRST = 927102; // stored order 1 — HIGHER id, LOWER order
const ORDER_NONE = 927103; // no order value — sinks last

const TIE_PARENT = 927200;
const TIE_A = 927201;
const TIE_B = 927202;

const BOOL_PARENT = 927300;
const BOOL_CHILD_A = 927301;
const BOOL_CHILD_B = 927302;

const CHILDLESS_PARENT = 927400;

/** A parent link in the exact stored shape the inverse probe matches on. */
function parentLink(
	parentTipo: string,
	fromComponentTipo: string,
	parentId: number,
	idKey: number,
): Record<string, unknown> {
	return {
		id: idKey,
		type: 'dd47',
		section_id: String(parentId),
		section_tipo: parentTipo,
		from_component_tipo: fromComponentTipo,
	};
}

/** The dd64 is_descriptor locator (1 = descriptor / yes, 2 = non-descriptor / no). */
function descriptorLink(sectionId: 1 | 2): Record<string, unknown> {
	return {
		id: 1,
		type: 'dd151',
		section_id: String(sectionId),
		section_tipo: 'dd64',
		from_component_tipo: T3_DESCRIPTOR_TIPO,
	};
}

async function seedRow(input: {
	section_tipo: string;
	section_id: number;
	relation?: Record<string, unknown[]>;
	number?: Record<string, unknown[]>;
}): Promise<void> {
	await sql.unsafe(
		`INSERT INTO matrix_test (section_id, section_tipo, relation, "number")
		 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb)`,
		[
			input.section_id,
			input.section_tipo,
			input.relation === undefined ? null : JSON.stringify(input.relation),
			input.number === undefined ? null : JSON.stringify(input.number),
		] as (string | number | null)[],
	);
}

/** A test3 child: parent link + descriptor flag + optional paired order value. */
async function seedTest3Child(input: {
	section_id: number;
	parent_id: number;
	id_key: number;
	descriptor: 1 | 2;
	order?: string;
}): Promise<void> {
	await seedRow({
		section_tipo: T3,
		section_id: input.section_id,
		relation: {
			[T3_PARENT_TIPO]: [parentLink(T3, T3_PARENT_TIPO, input.parent_id, input.id_key)],
			[T3_DESCRIPTOR_TIPO]: [descriptorLink(input.descriptor)],
		},
		number:
			input.order === undefined
				? undefined
				: { [T3_ORDER_TIPO]: [{ id: input.id_key, value: input.order }] },
	});
}

async function scratchRowCount(): Promise<number> {
	let total = 0;
	for (const table of ['matrix_test', 'matrix_time_machine']) {
		const rows = (await sql.unsafe(
			`SELECT count(*)::int AS count FROM "${table}"
			  WHERE section_tipo = ANY(string_to_array($1, ','))
			    AND section_id BETWEEN $2 AND $3`,
			[TIPOS.join(','), ID_MIN, ID_MAX],
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
			[TIPOS.join(','), ID_MIN, ID_MAX],
		);
	}
}

/**
 * Just the child ids, in returned order — the ordering assertions' subject.
 * INT since WC-2026-08-10-section-id-int-canonical.
 */
function ids(children: { section_id: number | string }[]): (number | string)[] {
	return children.map((child) => child.section_id);
}

beforeAll(async () => {
	await cleanScratch();
	// Pre-count must be 0: a stray row from a crashed run would silently change
	// every result below. Never tolerate it, never work around it.
	expect(await scratchRowCount()).toBe(0);

	// --- descriptor partition
	await seedRow({ section_tipo: T3, section_id: PARTITION_PARENT });
	await seedTest3Child({
		section_id: DESCRIPTOR_CHILD,
		parent_id: PARTITION_PARENT,
		id_key: 1,
		descriptor: 1,
	});
	await seedTest3Child({
		section_id: NON_DESCRIPTOR_CHILD,
		parent_id: PARTITION_PARENT,
		id_key: 2,
		descriptor: 2,
	});

	// --- sibling ordering: stored 2, 1, none
	await seedRow({ section_tipo: T3, section_id: ORDER_PARENT });
	await seedTest3Child({
		section_id: ORDER_SECOND,
		parent_id: ORDER_PARENT,
		id_key: 11,
		descriptor: 1,
		order: '2',
	});
	await seedTest3Child({
		section_id: ORDER_FIRST,
		parent_id: ORDER_PARENT,
		id_key: 12,
		descriptor: 1,
		order: '1',
	});
	await seedTest3Child({
		section_id: ORDER_NONE,
		parent_id: ORDER_PARENT,
		id_key: 13,
		descriptor: 1,
	});

	// --- two unordered children (tie → section_id order preserved)
	await seedRow({ section_tipo: T3, section_id: TIE_PARENT });
	await seedTest3Child({ section_id: TIE_A, parent_id: TIE_PARENT, id_key: 21, descriptor: 1 });
	await seedTest3Child({ section_id: TIE_B, parent_id: TIE_PARENT, id_key: 22, descriptor: 1 });

	// --- boolean is_descriptor section (test65): NO descriptor locator at all
	await seedRow({ section_tipo: T65, section_id: BOOL_PARENT });
	for (const [index, childId] of [BOOL_CHILD_A, BOOL_CHILD_B].entries()) {
		await seedRow({
			section_tipo: T65,
			section_id: childId,
			relation: {
				[T65_PARENT_TIPO]: [parentLink(T65, T65_PARENT_TIPO, BOOL_PARENT, index + 1)],
			},
		});
	}

	// --- a parent with no children at all
	await seedRow({ section_tipo: T3, section_id: CHILDLESS_PARENT });
});

afterAll(async () => {
	await cleanScratch();
	// Fail loud if cleanup did not reach zero — a leaked scratch row poisons
	// every later run of this file and of anybody else reading test3/test65.
	expect(await scratchRowCount()).toBe(0);
});

test('descriptor partition splits the children by the dd64 is_descriptor locator', async () => {
	const descriptors = await getChildrenOfType(PARTITION_PARENT, T3, 'descriptor');
	const nonDescriptors = await getChildrenOfType(PARTITION_PARENT, T3, 'non_descriptor');

	// WC-2026-08-10-section-id-int-canonical: emitted child ids are int.
	expect(ids(descriptors)).toEqual([DESCRIPTOR_CHILD]);
	expect(ids(nonDescriptors)).toEqual([NON_DESCRIPTOR_CHILD]);
});

test('the emitted locator is the CHILDREN wire shape (int id, test201, dd48)', async () => {
	const [child] = await getChildrenOfType(PARTITION_PARENT, T3, 'descriptor');

	// WC-2026-08-10-section-id-int-canonical: int id (the seed's parent link is
	// string — the emitted id is the row's own int address, not the link's).
	expect(child).toEqual({
		section_tipo: T3,
		section_id: DESCRIPTOR_CHILD,
		from_component_tipo: T3_CHILDREN_TIPO,
		type: 'dd48',
	});
	// Explicit, because a String() slip here reads as harmless and re-injects the
	// repealed string form into every stored children locator.
	expect(typeof child?.section_id).toBe('number');
	// The stored link is dd47; what comes back is the COMPUTED children type.
	expect(child?.type).not.toBe('dd47');
});

test("'descriptor' is the default type argument", async () => {
	expect(await getChildrenOfType(PARTITION_PARENT, T3)).toEqual(
		await getChildrenOfType(PARTITION_PARENT, T3, 'descriptor'),
	);
	// …and the default is NOT the non_descriptor answer (otherwise the line above
	// would hold for any default at all).
	expect(ids(await getChildrenOfType(PARTITION_PARENT, T3))).not.toEqual([NON_DESCRIPTOR_CHILD]);
});

test('an explicit componentTipo bypasses the children-tipo walk with the same answer', async () => {
	const walked = await getChildrenOfType(PARTITION_PARENT, T3, 'descriptor');
	const explicit = await getChildrenOfType(PARTITION_PARENT, T3, 'descriptor', T3_CHILDREN_TIPO);

	expect(explicit).toEqual(walked);
	expect(explicit[0]?.from_component_tipo).toBe(T3_CHILDREN_TIPO);

	// The override must actually be USED, not merely agree with the walk: pass a
	// tipo the walk would never produce and watch it come back stamped on the
	// locator. (Without this, dropping the `componentTipo ??` override is invisible
	// — every other case here passes the same tipo the walk resolves anyway.)
	const overridden = await getChildrenOfType(PARTITION_PARENT, T3, 'descriptor', 'test52');
	expect(ids(overridden)).toEqual([DESCRIPTOR_CHILD]);
	expect(overridden[0]?.from_component_tipo).toBe('test52');
});

test('children sort by their paired order value; the unvalued child sinks last', async () => {
	const children = await getChildrenOfType(ORDER_PARENT, T3, 'descriptor');

	// Stored order values are 2 (927101), 1 (927102), none (927103): the answer is
	// NOT section_id order, which is what makes this assertion load-bearing.
	// WC-2026-08-10-section-id-int-canonical: int ids.
	expect(ids(children)).toEqual([ORDER_FIRST, ORDER_SECOND, ORDER_NONE]);
});

test('two unordered siblings keep section_id order (stable sort)', async () => {
	const children = await getChildrenOfType(TIE_PARENT, T3, 'descriptor');

	expect(ids(children)).toEqual([TIE_A, TIE_B]);
});

test('limit/offset page the ORDERED list, not the id-ordered one', async () => {
	// limit 1 / offset 1 → the order-2 child, which is the LOWEST id of the three:
	// paging before ordering would answer 927102 here.
	// WC-2026-08-10-section-id-int-canonical: int ids.
	expect(ids(await getChildrenOfType(ORDER_PARENT, T3, 'descriptor', null, 1, 1))).toEqual([
		ORDER_SECOND,
	]);
	expect(ids(await getChildrenOfType(ORDER_PARENT, T3, 'descriptor', null, 1, 0))).toEqual([
		ORDER_FIRST,
	]);
	// limit 0 = "all from offset" (slice(offset)), not "none".
	expect(ids(await getChildrenOfType(ORDER_PARENT, T3, 'descriptor', null, 0, 1))).toEqual([
		ORDER_SECOND,
		ORDER_NONE,
	]);
	// offset past the end is an empty page, not a throw.
	expect(await getChildrenOfType(ORDER_PARENT, T3, 'descriptor', null, 0, 9)).toEqual([]);
});

test('a BOOLEAN is_descriptor skips the filter: both children answer BOTH types', async () => {
	// test65's section_map (test83) declares `is_descriptor: false` — not a tipo.
	// typeof … === 'string' is false, so no dd64 filter is pushed and op stays
	// undefined. Both children are returned whichever type is asked for.
	const descriptors = await getChildrenOfType(BOOL_PARENT, T65, 'descriptor');
	const nonDescriptors = await getChildrenOfType(BOOL_PARENT, T65, 'non_descriptor');

	// WC-2026-08-10-section-id-int-canonical: int ids.
	expect(ids(descriptors)).toEqual([BOOL_CHILD_A, BOOL_CHILD_B]);
	expect(ids(nonDescriptors)).toEqual([BOOL_CHILD_A, BOOL_CHILD_B]);
	expect(descriptors[0]?.from_component_tipo).toBe(T65_CHILDREN_TIPO);
	expect(descriptors[0]?.type).toBe('dd48');
});

test('a parent with no children returns [] before any ordering work', async () => {
	expect(await getChildrenOfType(CHILDLESS_PARENT, T3, 'descriptor')).toEqual([]);
	expect(await getChildrenOfType(CHILDLESS_PARENT, T3, 'non_descriptor')).toEqual([]);
});

test('an unresolvable children tipo returns [] without throwing', async () => {
	// dd64 declares no component_relation_children → the first early return.
	expect(await getChildrenOfType(1, 'dd64')).toEqual([]);
});

test('an unresolvable parent tipo returns [] without throwing', async () => {
	// Children tipo supplied, so the first guard passes. test52 (component_input_text)
	// declares no component_relation_parent relation, and the dd64 section walk finds
	// none either → getRelatedParentTipo returns null → the SECOND early return.
	//
	// Note it must be test52, NOT test201: test201's own ontology relations name
	// test71, so getRelatedParentTipo('test201','dd64') resolves to test71 and this
	// case would leave the branch untouched (it would end at the empty-hits return
	// instead — a mutation to the parentTipo guard survived exactly that mistake).
	expect(await getChildrenOfType(1, 'dd64', 'descriptor', 'test52')).toEqual([]);
});
