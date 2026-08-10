/**
 * dd_ts_api.get_children_data — the tree's paged children door (PHP :211).
 *
 * WHY THIS FILE EXISTS. `getChildrenData` was the single worst risk-complexity
 * item left in src/core/: cyclomatic 20 at 0% line coverage (`ts_api.ts:105`),
 * with its delegate (`ts_object.ts:941`, comp 12) also untouched. Its FILE read
 * 72.6% covered, which is exactly the blind spot line coverage creates — the
 * branchiest function in a well-covered file can be the one nobody drives.
 *
 * The two functions split the work: the API layer parses the request, gates on
 * permissions and picks the MODE; the ts_object layer resolves and pages. Both
 * are driven here, through the API door, because that is the only way a client
 * reaches them.
 *
 * WHAT IS PINNED
 *   API   1. no `source` → the invalid-request envelope, before anything else.
 *         2. section_tipo present + permission level < 1 → refusal naming the tipo.
 *         3. section_tipo ABSENT → the ACL is never consulted (see the note on
 *            that test: this is a real property of the door, pinned as-is).
 *         4. mode A (no children list + section_id + children_tipo) → delegates,
 *            and returns the delegate's envelope VERBATIM.
 *         5. mode B (children list supplied) → parseChildData, own envelope.
 *         6. the defaults: area_model 'area_thesaurus', limit 300, offset 0.
 *   DELEGATE
 *         7. children_tipo whose model is not component_relation_children →
 *            'Wrong model', with the CALCULATED model in the message.
 *         8. pagination absent → {limit: defaultLimit, offset: 0}.
 *         9. total absent → counted; usePagination = limit > 0 && total > limit,
 *            so a limit at or above the total returns the UNPAGED read.
 *        10. the caller's pagination object is never mutated.
 *
 * KNOWN DEAD, deliberately not tested (stated rather than covered, per the
 * project's "invariants are tripwired or deleted" rule — these are reported,
 * not fixed, in this change): both functions end with
 *   `errors.length === 0 ? 'OK…' : 'Warning! …done with errors'`
 * and in BOTH the only pushes to `errors` are followed by an immediate
 * `return`. No path reaches the ternary with a non-empty `errors`, so the
 * 'Warning!' arm is unreachable in both. A test asserting it would have to
 * fabricate the state.
 *
 * FIXTURE TRAP (same one that cost an hour in children_of_type_order_native):
 * a child's parent link MUST carry `type: 'dd47'` and
 * `from_component_tipo: 'test71'`. The canonical test3 playground rows use
 * dd151 links; copy those and every children read returns zero.
 *
 * SCRATCH SURFACE (this file's namespace ONLY — other suites write the same
 * database concurrently, so no table-global count is taken anywhere here):
 *   matrix_test          section_tipo 'test3', section_id 929000-929999
 *   matrix_time_machine  same tipo, same id range
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { getChildrenData } from '../../src/core/ts_object/ts_api.ts';

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
/** A real user id with no project grants — getPermissions resolves it to 0. */
const NO_ACCESS: Principal = { userId: 999999, isGlobalAdmin: false, isDeveloper: false };

const TIPO = 'test3';
const PARENT_TIPO = 'test71';
const TERM_TIPO = 'test52'; // component_input_text — the WRONG-model witness
const CHILDREN_TIPO = 'test201'; // component_relation_children

const ID_MIN = 929000;
const ID_MAX = 929999;
const PARENT = 929000;
const CHILD_A = 929001;
const CHILD_B = 929002;
const CHILD_C = 929003;
const CHILDLESS = 929010;

async function seedNode(sectionId: number, parentId: number | null, term: string): Promise<void> {
	const relation =
		parentId === null
			? {}
			: {
					[PARENT_TIPO]: [
						{
							id: 1,
							type: 'dd47',
							section_id: String(parentId),
							section_tipo: TIPO,
							from_component_tipo: PARENT_TIPO,
						},
					],
				};
	await sql.unsafe(
		`INSERT INTO matrix_test (section_id, section_tipo, relation, "string")
		 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb)`,
		[
			sectionId,
			TIPO,
			JSON.stringify(relation),
			JSON.stringify({ [TERM_TIPO]: [{ id: 1, lang: 'lg-eng', value: term }] }),
		] as (string | number)[],
	);
}

async function sweepScratch(): Promise<void> {
	for (const table of ['matrix_test', 'matrix_time_machine']) {
		await sql.unsafe(
			`DELETE FROM ${table} WHERE section_tipo = $1 AND section_id BETWEEN $2 AND $3`,
			[TIPO, ID_MIN, ID_MAX] as (string | number)[],
		);
	}
}

beforeAll(async () => {
	await sweepScratch(); // a crashed previous run must not change what these read
	await seedNode(PARENT, null, 'zz children-data parent');
	await seedNode(CHILD_A, PARENT, 'zz child a');
	await seedNode(CHILD_B, PARENT, 'zz child b');
	await seedNode(CHILD_C, PARENT, 'zz child c');
	await seedNode(CHILDLESS, null, 'zz childless');
});

afterAll(sweepScratch);

/** The result envelope both modes share, once it is not `false`. */
type ChildrenResult = {
	ar_children_data: unknown[];
	pagination: Record<string, unknown> | null;
};

const resultOf = (response: { result: unknown }): ChildrenResult => response.result as ChildrenResult;

describe('get_children_data — the request envelope', () => {
	test('a request with NO source is refused before anything else runs', async () => {
		const response = await getChildrenData({ dd_api: 'dd_ts_api' } as never, SUPERUSER);
		expect(response.result).toBe(false);
		expect(response.msg).toBe('Invalid request. Source data is missing.');
		expect(response.errors).toEqual(['Missing source property in the request object.']);
	});

	test('a section the principal cannot read is refused, and the message names it', async () => {
		const response = await getChildrenData(
			{
				dd_api: 'dd_ts_api',
				action: 'get_children_data',
				source: { section_tipo: TIPO, section_id: PARENT, children_tipo: CHILDREN_TIPO },
			} as never,
			NO_ACCESS,
		);
		expect(response.result).toBe(false);
		expect(response.errors).toEqual(['insufficient permissions']);
		expect(response.msg).toBe(`Error. Insufficient permissions to read section (${TIPO})`);
	});

	test('a source with NO section_tipo never consults the ACL', async () => {
		// PINNED AS-IS, not endorsed. The permission gate is inside
		// `if (sectionTipo !== null && sectionTipo !== '')`, so a request that omits
		// section_tipo skips it entirely and lands in mode B. That is safe ONLY
		// because parseChildData re-checks each child against the principal; this
		// test exists so that if the gate is ever made unconditional, or the
		// per-child check is dropped, someone has to come here and decide which.
		const response = await getChildrenData(
			{ dd_api: 'dd_ts_api', action: 'get_children_data', source: {} } as never,
			NO_ACCESS,
		);
		expect(response.msg).toBe('OK. Request done successfully');
		expect(resultOf(response).ar_children_data).toEqual([]);
		expect(resultOf(response).pagination).toBeNull();
	});
});

describe('get_children_data — mode A (resolve the children ourselves)', () => {
	test('resolves every child and reports the authoritative total', async () => {
		const response = await getChildrenData(
			{
				dd_api: 'dd_ts_api',
				action: 'get_children_data',
				source: { section_tipo: TIPO, section_id: PARENT, children_tipo: CHILDREN_TIPO },
			} as never,
			SUPERUSER,
		);
		expect(response.msg).toBe('OK. Request done successfully');
		expect(response.errors).toEqual([]);
		expect(resultOf(response).ar_children_data).toHaveLength(3);
		// The defaults, pinned: limit 300 / offset 0 come from the API layer, total
		// is counted by the delegate.
		expect(resultOf(response).pagination).toEqual({ limit: 300, offset: 0, total: 3 });
	});

	test('a childless parent is an authoritative empty page, not a failure', async () => {
		const response = await getChildrenData(
			{
				dd_api: 'dd_ts_api',
				action: 'get_children_data',
				source: { section_tipo: TIPO, section_id: CHILDLESS, children_tipo: CHILDREN_TIPO },
			} as never,
			SUPERUSER,
		);
		expect(response.msg).toBe('OK. Request done successfully');
		expect(resultOf(response).ar_children_data).toEqual([]);
		expect(resultOf(response).pagination).toEqual({ limit: 300, offset: 0, total: 0 });
	});

	test('a limit BELOW the total pages the read; the total still reports every child', async () => {
		const response = await getChildrenData(
			{
				dd_api: 'dd_ts_api',
				action: 'get_children_data',
				source: { section_tipo: TIPO, section_id: PARENT, children_tipo: CHILDREN_TIPO },
				options: { pagination: { limit: 2, offset: 0 } },
			} as never,
			SUPERUSER,
		);
		expect(resultOf(response).ar_children_data).toHaveLength(2);
		expect(resultOf(response).pagination).toEqual({ limit: 2, offset: 0, total: 3 });
	});

	test('offset walks the pages', async () => {
		const response = await getChildrenData(
			{
				dd_api: 'dd_ts_api',
				action: 'get_children_data',
				source: { section_tipo: TIPO, section_id: PARENT, children_tipo: CHILDREN_TIPO },
				options: { pagination: { limit: 2, offset: 2 } },
			} as never,
			SUPERUSER,
		);
		expect(resultOf(response).ar_children_data).toHaveLength(1); // the 3rd child
	});

	test('a limit EQUAL to the total returns every child', async () => {
		// NOTE, measured: at limit === total the two branches are OBSERVATIONALLY
		// EQUIVALENT — the unpaged read and `getChildren(limit=3, offset=0)` return
		// the same three rows, so flipping `>` to `>=` here changes nothing a caller
		// can see. This test pins the RESULT, not which branch produced it; the
		// strictness itself is pinned by the next test, which is the case where the
		// two branches genuinely diverge.
		const response = await getChildrenData(
			{
				dd_api: 'dd_ts_api',
				action: 'get_children_data',
				source: { section_tipo: TIPO, section_id: PARENT, children_tipo: CHILDREN_TIPO },
				options: { pagination: { limit: 3, offset: 0 } },
			} as never,
			SUPERUSER,
		);
		expect(resultOf(response).ar_children_data).toHaveLength(3);
		expect(resultOf(response).pagination).toEqual({ limit: 3, offset: 0, total: 3 });
	});

	test('a supplied total EQUAL to the limit takes the UNPAGED read — and can return more rows than the limit', async () => {
		// This is where `total > limit` and `total >= limit` diverge observably, and
		// it is a real quirk of trusting a client total: with total=2 and limit=2
		// over a parent that really has 3 children, `>` makes usePagination FALSE,
		// so the unpaged read runs and THREE children come back through a request
		// that asked for two. Under `>=` it would page and return two.
		// Pinned as the behaviour that ships today, not endorsed — a client that
		// under-reports the total defeats its own limit.
		const response = await getChildrenData(
			{
				dd_api: 'dd_ts_api',
				action: 'get_children_data',
				source: { section_tipo: TIPO, section_id: PARENT, children_tipo: CHILDREN_TIPO },
				options: { pagination: { limit: 2, offset: 0, total: 2 } },
			} as never,
			SUPERUSER,
		);
		expect(resultOf(response).ar_children_data).toHaveLength(3);
	});

	test('a supplied total is TRUSTED — it is not recounted', async () => {
		// `if (currentPagination.total === undefined)` is the only counting gate, so
		// a client-sent total short-circuits the count AND drives usePagination.
		const response = await getChildrenData(
			{
				dd_api: 'dd_ts_api',
				action: 'get_children_data',
				source: { section_tipo: TIPO, section_id: PARENT, children_tipo: CHILDREN_TIPO },
				options: { pagination: { limit: 2, offset: 0, total: 99 } },
			} as never,
			SUPERUSER,
		);
		expect(resultOf(response).pagination?.total).toBe(99);
		expect(resultOf(response).ar_children_data).toHaveLength(2);
	});

	test('the caller pagination object is CLONED, never mutated', async () => {
		// The delegate spreads it (`{ ...pagination }`) and then stamps `total`.
		// Without the spread the caller's own object grows a `total` key it never
		// asked for — the "never mutate the caller's object" law.
		const callerPagination: Record<string, unknown> = { limit: 2, offset: 0 };
		await getChildrenData(
			{
				dd_api: 'dd_ts_api',
				action: 'get_children_data',
				source: { section_tipo: TIPO, section_id: PARENT, children_tipo: CHILDREN_TIPO },
				options: { pagination: callerPagination },
			} as never,
			SUPERUSER,
		);
		expect(callerPagination).toEqual({ limit: 2, offset: 0 });
	});

	test('a children_tipo of the wrong model is refused, and the message names the model found', async () => {
		const response = await getChildrenData(
			{
				dd_api: 'dd_ts_api',
				action: 'get_children_data',
				source: { section_tipo: TIPO, section_id: PARENT, children_tipo: TERM_TIPO },
			} as never,
			SUPERUSER,
		);
		expect(response.result).toBe(false);
		expect(response.errors).toEqual(['Wrong model']);
		// The CALCULATED model is in the message — that is what makes the error
		// diagnosable from a log line alone.
		expect(response.msg).toContain('Expected model (component_relation_children)');
		expect(response.msg).toContain('component_input_text');
	});
});

describe('get_children_data — mode B (children supplied by the caller)', () => {
	test('a supplied children list is parsed instead of resolved', async () => {
		const response = await getChildrenData(
			{
				dd_api: 'dd_ts_api',
				action: 'get_children_data',
				source: {
					section_tipo: TIPO,
					section_id: PARENT,
					children: [
						{ section_tipo: TIPO, section_id: CHILD_A },
						{ section_tipo: TIPO, section_id: CHILD_B },
					],
				},
			} as never,
			SUPERUSER,
		);
		expect(response.msg).toBe('OK. Request done successfully');
		expect(resultOf(response).ar_children_data).toHaveLength(2);
	});

	test('mode B wins even when section_id and children_tipo are also present', async () => {
		// The mode switch is `(children === null || children.length === 0) && …`, so
		// a NON-EMPTY children list takes mode B whatever else the source carries.
		// The parent has 3 children; supplying 1 must yield 1, not 3.
		const response = await getChildrenData(
			{
				dd_api: 'dd_ts_api',
				action: 'get_children_data',
				source: {
					section_tipo: TIPO,
					section_id: PARENT,
					children_tipo: CHILDREN_TIPO,
					children: [{ section_tipo: TIPO, section_id: CHILD_C }],
				},
			} as never,
			SUPERUSER,
		);
		expect(resultOf(response).ar_children_data).toHaveLength(1);
	});

	test('an EMPTY children list falls through to mode A, not to an empty answer', async () => {
		// `children.length === 0` is part of the mode-A condition precisely so an
		// empty array means "resolve them for me", not "there are none".
		const response = await getChildrenData(
			{
				dd_api: 'dd_ts_api',
				action: 'get_children_data',
				source: {
					section_tipo: TIPO,
					section_id: PARENT,
					children_tipo: CHILDREN_TIPO,
					children: [],
				},
			} as never,
			SUPERUSER,
		);
		expect(resultOf(response).ar_children_data).toHaveLength(3);
	});

	test('mode B echoes the pagination it was given, untouched', async () => {
		const response = await getChildrenData(
			{
				dd_api: 'dd_ts_api',
				action: 'get_children_data',
				source: {
					section_tipo: TIPO,
					section_id: PARENT,
					children: [{ section_tipo: TIPO, section_id: CHILD_A }],
				},
				options: { pagination: { limit: 10, offset: 0, total: 1 } },
			} as never,
			SUPERUSER,
		);
		expect(resultOf(response).pagination).toEqual({ limit: 10, offset: 0, total: 1 });
	});
});
