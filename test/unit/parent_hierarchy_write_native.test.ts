/**
 * addParent (src/core/relations/parent.ts) — the upward hierarchy link
 * writer. Every branch of the function is exercised against real rows: the
 * auto-reference guard and the descendant-cycle guard (both refuse
 * `tree.cycle` since ONT-5), the locator defaults, the item-id pre-allocation,
 * the initial sibling order, and the dedup-append. Every call runs in its own
 * transaction: a parent.ts mutation refuses without one (CORE-3).
 *
 * SCRATCH SURFACE (this file's namespace ONLY — other agents write the same
 * database concurrently):
 *   matrix_test rows section_tipo='test3', section_id 916000-916099
 *   matrix_time_machine rows section_tipo='test3', section_id 916000-916099
 * Nothing here takes a table-global count: every assertion is scoped to a row
 * this file seeded, or to a baseline captured in the same test body.
 *
 * FIXTURE. test3's section_map declares parent='test71',
 * order='test22' (component_number), is_descriptor='test88', term='test52',
 * children='test201'; test38 is the section with NO thesaurus map at all.
 * A parent link is `{section_tipo, section_id, type:'dd47',
 * from_component_tipo:'test71', id}` — the canonical test3 records use
 * type 'dd151' for their OTHER relations, and copying that shape here makes
 * the inverse descriptor probe return zero.
 */

import { afterAll, beforeEach, expect, test } from 'bun:test';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';
import { isDedaloError } from '../../src/core/errors/index.ts';
import { addParent, type ParentLocator } from '../../src/core/relations/parent.ts';

const SECTION = 'test3';
const PARENT_TIPO = 'test71';
const ORDER_TIPO = 'test22';
const DESCRIPTOR_TIPO = 'test88';
const ID_MIN = 916000;
const ID_MAX = 916099;

interface RowText {
	relation: string | null;
	number: string | null;
	meta: string | null;
}

/** A parent locator in the exact stored shape. */
function parentLink(sectionId: number, id: number): Record<string, unknown> {
	return {
		id,
		type: 'dd47',
		section_id: String(sectionId),
		section_tipo: SECTION,
		from_component_tipo: PARENT_TIPO,
	};
}

/** Seed one test3 scratch record. `descriptor` adds the test88 → dd64/1 locator. */
async function seedNode(input: {
	section_id: number;
	parents?: Record<string, unknown>[];
	descriptor?: boolean;
	order?: unknown[];
	meta?: unknown;
}): Promise<void> {
	const relation: Record<string, unknown[]> = {};
	if (input.parents !== undefined) relation[PARENT_TIPO] = input.parents;
	if (input.descriptor === true) {
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
	const numberColumn = input.order === undefined ? null : { [ORDER_TIPO]: input.order };
	await sql.unsafe(
		`INSERT INTO matrix_test (section_id, section_tipo, relation, "number", meta)
		 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb, $5::text::jsonb)`,
		[
			input.section_id,
			SECTION,
			Object.keys(relation).length === 0 ? null : JSON.stringify(relation),
			numberColumn === null ? null : JSON.stringify(numberColumn),
			input.meta === undefined ? null : JSON.stringify(input.meta),
		] as (string | number | null)[],
	);
}

/** Read one scratch row, jsonb projected as TEXT so byte compares are possible. */
async function readRow(sectionId: number): Promise<RowText> {
	const rows = (await sql.unsafe(
		`SELECT relation::text AS relation, "number"::text AS "number", meta::text AS meta
		   FROM matrix_test WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, sectionId],
	)) as RowText[];
	const row = rows[0];
	// NEVER `if (row === undefined) return;` — a vanished scratch row is a
	// failure of this file's own contract, not a reason to pass.
	if (row === undefined) throw new Error(`readRow: ${SECTION}/${sectionId} is gone`);
	return row;
}

/** The parent locators stored on a scratch record. */
async function parentLocators(sectionId: number): Promise<Record<string, unknown>[]> {
	const row = await readRow(sectionId);
	const relation = row.relation === null ? {} : (JSON.parse(row.relation) as Record<string, []>);
	return (relation[PARENT_TIPO] ?? []) as Record<string, unknown>[];
}

/** The order-component items stored on a scratch record. */
async function orderItems(sectionId: number): Promise<{ id?: number; value?: unknown }[]> {
	const row = await readRow(sectionId);
	const numberColumn = row.number === null ? {} : (JSON.parse(row.number) as Record<string, []>);
	return (numberColumn[ORDER_TIPO] ?? []) as { id?: number; value?: unknown }[];
}

/** How many rows this file owns, in matrix_test and the time-machine tail. */
async function scratchRowCount(): Promise<number> {
	let total = 0;
	for (const table of ['matrix_test', 'matrix_time_machine']) {
		const rows = (await sql.unsafe(
			`SELECT count(*)::int AS count FROM "${table}"
			  WHERE section_tipo = $1 AND section_id BETWEEN $2 AND $3`,
			[SECTION, ID_MIN, ID_MAX],
		)) as { count: number }[];
		total += rows[0]?.count ?? 0;
	}
	return total;
}

async function cleanScratch(): Promise<void> {
	for (const table of ['matrix_test', 'matrix_time_machine']) {
		await sql.unsafe(
			`DELETE FROM "${table}" WHERE section_tipo = $1 AND section_id BETWEEN $2 AND $3`,
			[SECTION, ID_MIN, ID_MAX],
		);
	}
}

beforeEach(async () => {
	await cleanScratch();
	// Pre-condition: a leftover from a crashed run would be picked up by the
	// inverse child probes below and silently move every order assertion.
	expect(await scratchRowCount()).toBe(0);
});

afterAll(async () => {
	await cleanScratch();
	const left = await scratchRowCount();
	if (left !== 0) {
		throw new Error(`parent_hierarchy_write scratch cleanup left ${left} row(s) in 916000-916099`);
	}
});

/** Who the fixture's tree writes are attributed to (root). */
const ACTOR = -1;

/** addParent in its own transaction (every parent.ts mutation requires one). */
function add(sectionTipo: string, sectionId: number, locator: ParentLocator): Promise<boolean> {
	return withTransaction(() => addParent(sectionTipo, sectionId, PARENT_TIPO, locator, ACTOR));
}

/** The DedaloError code `run` rejected with — a resolved call is a failure. */
async function refusalCode(run: Promise<unknown>): Promise<string> {
	try {
		await run;
	} catch (error) {
		return isDedaloError(error) ? error.code : String(error);
	}
	throw new Error('expected a refusal, but the call resolved');
}

// ---------------------------------------------------------------------------
// the happy path
// ---------------------------------------------------------------------------

test('addParent writes ONE locator carrying the dd47/from_component_tipo defaults and an allocated integer id', async () => {
	await seedNode({ section_id: 916000 });
	await seedNode({ section_id: 916001 });

	const result = await add(SECTION, 916001, {
		section_tipo: SECTION,
		section_id: 916000,
	});

	expect(result).toBe(true);
	const locators = await parentLocators(916001);
	expect(locators).toHaveLength(1);
	const locator = locators[0] as Record<string, unknown>;
	expect(locator.section_tipo).toBe(SECTION);
	expect(Number(locator.section_id)).toBe(916000);
	expect(locator.type).toBe('dd47'); // RELATION_TYPE_PARENT default
	expect(locator.from_component_tipo).toBe(PARENT_TIPO); // defaulted to the relation tipo
	expect(Number.isInteger(locator.id)).toBe(true);
	expect(Number(locator.id)).toBeGreaterThanOrEqual(1);

	// The item id came from the record's own meta counter, not a guess.
	const meta = JSON.parse((await readRow(916001)).meta ?? '{}') as Record<
		string,
		{ count?: number }[]
	>;
	expect(meta[PARENT_TIPO]?.[0]?.count).toBe(Number(locator.id));

	// The initial sibling order landed on the CHILD, paired to that item id.
	// 916000 had no descriptor children when setChildOrder ran ⇒ 0 + 1.
	expect(await orderItems(916001)).toEqual([{ id: Number(locator.id), value: 1 }]);
});

test('addParent PRESERVES a caller-supplied id/type/from_component_tipo and allocates nothing', async () => {
	await seedNode({ section_id: 916002 });
	await seedNode({ section_id: 916003 });

	const result = await add(SECTION, 916003, {
		section_tipo: SECTION,
		section_id: 916002,
		id: 77,
		type: 'dd47',
		from_component_tipo: PARENT_TIPO,
	});

	expect(result).toBe(true);
	const locators = await parentLocators(916003);
	expect(locators).toHaveLength(1);
	expect(locators[0]?.id).toBe(77);
	// No allocation happened: the meta counter was never touched.
	expect((await readRow(916003)).meta).toBeNull();
	// …and the order value paired to the SUPPLIED id.
	expect(await orderItems(916003)).toEqual([{ id: 77, value: 1 }]);
});

// ---------------------------------------------------------------------------
// the auto-reference guard
// ---------------------------------------------------------------------------

test('addParent refuses an auto-reference — STRING section_id included — as tree.cycle and writes nothing', async () => {
	// The string form is the load-bearing one: node identity is the ONE locator
	// equality (compareLocators: loose section_id); a strict compare of the raw
	// values would let '916010' through and make a record its own parent.
	await seedNode({ section_id: 916010, order: [{ id: 1, value: 5 }] });
	const before = await readRow(916010);

	expect(
		await refusalCode(add(SECTION, 916010, { section_tipo: SECTION, section_id: '916010' })),
	).toBe('tree.cycle');
	expect(await readRow(916010)).toEqual(before);

	// Paired numeric twin — same refusal, same untouched bytes.
	expect(
		await refusalCode(add(SECTION, 916010, { section_tipo: SECTION, section_id: 916010 })),
	).toBe('tree.cycle');
	expect(await readRow(916010)).toEqual(before);
});

test('the auto-reference guard is tipo-scoped: the same id in ANOTHER section is a legal parent', async () => {
	// Control for the case above — proves the refusal came from the guard's
	// section_tipo half and not from an unconditional bail-out.
	await seedNode({ section_id: 916011 });
	const result = await add(SECTION, 916011, {
		section_tipo: 'test65',
		section_id: 916011,
	});
	expect(result).toBe(true);
	expect(await parentLocators(916011)).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// the descendant-cycle guard
// ---------------------------------------------------------------------------

test('addParent refuses tree.cycle when the prospective parent is a DESCENDANT of the child', async () => {
	// 916020 → 916021 → 916022, built through addParent itself.
	await seedNode({ section_id: 916020 });
	await seedNode({ section_id: 916021 });
	await seedNode({ section_id: 916022 });
	expect(await add(SECTION, 916021, { section_tipo: SECTION, section_id: 916020 })).toBe(true);
	expect(await add(SECTION, 916022, { section_tipo: SECTION, section_id: 916021 })).toBe(true);

	const before = await readRow(916020);
	expect(
		await refusalCode(add(SECTION, 916020, { section_tipo: SECTION, section_id: 916022 })),
	).toBe('tree.cycle');
	// The refusal is total: no locator, no order entry, no counter bump.
	expect(await readRow(916020)).toEqual(before);
});

test('a cycle is refused BEFORE the id allocation and the order write: a caller that swallows tree.cycle and COMMITS stores nothing', async () => {
	// addParent is an engine API: its refusal must leave nothing behind even
	// when the caller catches it and commits its transaction (D15's law, for the
	// cycle). The record-write hook alone would refuse only at the PARENT-KEY
	// write — after the item id was burnt and the order value (+ its history
	// row) written in the same transaction, which this commit would keep.
	await seedNode({ section_id: 916023 });
	await seedNode({ section_id: 916024 });
	expect(await add(SECTION, 916024, { section_tipo: SECTION, section_id: 916023 })).toBe(true);
	const before = await readRow(916023);
	const rowsBefore = await scratchRowCount();

	const code = await withTransaction(async () => {
		try {
			await addParent(
				SECTION,
				916023,
				PARENT_TIPO,
				{ section_tipo: SECTION, section_id: 916024 },
				ACTOR,
			);
			return 'resolved';
		} catch (error) {
			return isDedaloError(error) ? error.code : String(error);
		}
	});

	expect(code).toBe('tree.cycle');
	expect(await readRow(916023)).toEqual(before); // no link, no order value, no counter bump
	expect(await scratchRowCount()).toBe(rowsBefore); // no history row
});

test('a NON-descendant parent two levels up the same tree is accepted (the cycle guard is not a blanket refusal)', async () => {
	// 916030 → 916031 → 916032; adding 916030 as a SECOND parent of 916032 is a
	// legal diamond, not a cycle.
	await seedNode({ section_id: 916030 });
	await seedNode({ section_id: 916031 });
	await seedNode({ section_id: 916032 });
	await add(SECTION, 916031, { section_tipo: SECTION, section_id: 916030 });
	await add(SECTION, 916032, { section_tipo: SECTION, section_id: 916031 });

	const result = await add(SECTION, 916032, {
		section_tipo: SECTION,
		section_id: 916030,
	});
	expect(result).toBe(true);
	expect(await parentLocators(916032)).toHaveLength(2);
});

// ---------------------------------------------------------------------------
// dedup-append — and D15
// ---------------------------------------------------------------------------

test('a duplicate addParent is refused BEFORE it allocates an id or writes an order value (D15 fixed 2026-08-09)', async () => {
	await seedNode({ section_id: 916040 });
	await seedNode({ section_id: 916041, descriptor: true });

	const first = await add(SECTION, 916041, {
		section_tipo: SECTION,
		section_id: 916040,
	});
	expect(first).toBe(true);
	expect(await orderItems(916041)).toEqual([{ id: 1, value: 1 }]);

	const second = await add(SECTION, 916041, {
		section_tipo: SECTION,
		section_id: 916040,
	});

	// The equality is section_tipo + section_id + type + from_component_tipo,
	// so the re-add is refused and the relation column keeps exactly one link.
	expect(second).toBe(false);
	expect(await parentLocators(916041)).toHaveLength(1);
	expect(Number((await parentLocators(916041))[0]?.id)).toBe(1);

	// D15 FIXED 2026-08-09 — CORRECT behaviour pinned. addParent used to call
	// allocateComponentItemId + setChildOrder BEFORE the dedup check, so a
	// refused duplicate burnt item id 2 and left an order value keyed to it — an
	// id that never lands in the relation column. The dedup check now runs
	// first, so a refusal writes NOTHING: one order item and the counter at 1.
	expect(await orderItems(916041)).toEqual([{ id: 1, value: 1 }]);
	const meta = JSON.parse((await readRow(916041)).meta ?? '{}') as Record<
		string,
		{ count?: number }[]
	>;
	expect(meta[PARENT_TIPO]?.[0]?.count).toBe(1); // no burnt id.
});

test('the dedup key is FOUR-part: a link differing only in type — or only in from_component_tipo — is NOT a duplicate', async () => {
	// PHP add_locator_to_data compares section_tipo + section_id + type +
	// from_component_tipo. Narrowing that key to the coordinates alone would
	// silently swallow these two appends.
	await seedNode({ section_id: 916045 });
	await seedNode({ section_id: 916046 });

	expect(await add(SECTION, 916046, { section_tipo: SECTION, section_id: 916045 })).toBe(true);
	expect(
		await add(SECTION, 916046, {
			section_tipo: SECTION,
			section_id: 916045,
			type: 'dd151', // same coordinates, different relation type
		}),
	).toBe(true);
	expect(
		await add(SECTION, 916046, {
			section_tipo: SECTION,
			section_id: 916045,
			from_component_tipo: 'test54', // same coordinates, different origin component
		}),
	).toBe(true);

	const locators = await parentLocators(916046);
	expect(locators).toHaveLength(3);
	expect(locators.map((locator) => locator.type)).toEqual(['dd47', 'dd151', 'dd47']);
	expect(locators.map((locator) => locator.from_component_tipo)).toEqual([
		PARENT_TIPO,
		PARENT_TIPO,
		'test54',
	]);
});

test('a SECOND, different parent appends rather than replacing', async () => {
	await seedNode({ section_id: 916042 });
	await seedNode({ section_id: 916043 });
	await seedNode({ section_id: 916044 });

	await add(SECTION, 916044, { section_tipo: SECTION, section_id: 916042 });
	await add(SECTION, 916044, { section_tipo: SECTION, section_id: 916043 });

	const locators = await parentLocators(916044);
	expect(locators).toHaveLength(2);
	expect(locators.map((locator) => Number(locator.section_id))).toEqual([916042, 916043]);
	// Independent order per parent — the whole point of the id_key pairing.
	expect(locators.map((locator) => Number(locator.id))).toEqual([1, 2]);
	expect(await orderItems(916044)).toEqual([
		{ id: 1, value: 1 },
		{ id: 2, value: 1 },
	]);
});

// ---------------------------------------------------------------------------
// the initial sibling order
// ---------------------------------------------------------------------------

test('the initial order is the parent’s DESCRIPTOR-children count + 1, keyed to the new locator id', async () => {
	await seedNode({ section_id: 916050 });
	// two existing descriptor children…
	await seedNode({
		section_id: 916051,
		parents: [parentLink(916050, 1)],
		descriptor: true,
		order: [{ id: 1, value: 1 }],
	});
	await seedNode({
		section_id: 916052,
		parents: [parentLink(916050, 1)],
		descriptor: true,
		order: [{ id: 1, value: 2 }],
	});
	// …and one NON-descriptor child, which must not be counted.
	await seedNode({ section_id: 916054, parents: [parentLink(916050, 1)] });
	await seedNode({ section_id: 916053 });

	const result = await add(SECTION, 916053, {
		section_tipo: SECTION,
		section_id: 916050,
	});
	expect(result).toBe(true);

	const locator = (await parentLocators(916053))[0] as Record<string, unknown>;
	expect(await orderItems(916053)).toEqual([{ id: Number(locator.id), value: 3 }]);
});

test('addParent still links when the section declares NO order component (test38): locator yes, order no', async () => {
	// test38 has no thesaurus section_map at all ⇒ orderContext() is null and
	// setChildOrder writes nothing — the link lands without an order.
	await sql.unsafe(
		`INSERT INTO matrix_test (section_id, section_tipo) VALUES ($1,'test38'), ($2,'test38')`,
		[916060, 916061],
	);
	try {
		const result = await add('test38', 916061, {
			section_tipo: 'test38',
			section_id: 916060,
		});
		expect(result).toBe(true);
		const rows = (await sql.unsafe(
			`SELECT relation::text AS relation, "number"::text AS "number"
			   FROM matrix_test WHERE section_tipo='test38' AND section_id = $1`,
			[916061],
		)) as { relation: string | null; number: string | null }[];
		expect(rows[0]?.number).toBeNull();
		const relation = JSON.parse(rows[0]?.relation ?? '{}') as Record<string, unknown[]>;
		expect(relation[PARENT_TIPO]).toHaveLength(1);
	} finally {
		await sql.unsafe(
			`DELETE FROM matrix_test WHERE section_tipo='test38' AND section_id BETWEEN $1 AND $2`,
			[ID_MIN, ID_MAX],
		);
		await sql.unsafe(
			`DELETE FROM matrix_time_machine WHERE section_tipo='test38' AND section_id BETWEEN $1 AND $2`,
			[ID_MIN, ID_MAX],
		);
	}
});
