/**
 * Criterion path reading (src/core/identify/path_read.ts) against the canonical
 * `test3` playground — the portable DB-integration surface (the suite DB is
 * dedalo_mib_v7_test and the preload re-seeds test3 from code, so these values
 * are pinned by src/core/test_data/test3_canonical.json, not by whatever a
 * developer last typed into the UI).
 *
 * The playground gives us a real relation hop inside one section: test3/1's
 * `test80` (component_portal) points at test3/27, whose `test52` holds 'El dos'.
 * That is the Coin→Type→Legend shape in miniature.
 *
 * The LAST describe block is the one that matters most: it takes the value this
 * reader produced, compiles it with criteria.ts, runs the resulting SQO through
 * the real search assembler, and requires the SEED TO FIND ITSELF. A reader that
 * disagrees with the matcher is worse than no reader, and this is the only
 * assertion that can catch that disagreement.
 *
 * READ-ONLY: nothing here writes to the database.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sanitizeClientSqo } from '../../src/core/concepts/sqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { criteriaToFilter, criterionToSqoLeaf } from '../../src/core/identify/criteria.ts';
import { MAX_PATH_HOPS, readPathValues } from '../../src/core/identify/path_read.ts';
import type {
	Criterion,
	CriterionPathStep,
	CriterionValue,
} from '../../src/core/identify/types.ts';
import { buildSearchSql } from '../../src/core/search/sql_assembler.ts';
import { DB_READY } from '../helpers/db_ready.ts';

const SEED = { sectionTipo: 'test3', sectionId: 1 };

/** test3/1 → (portal test80) → test3/27 — the one-section hop fixture. */
const HOP_TO_27: CriterionPathStep[] = [
	{ section_tipo: 'test3', component_tipo: 'test80' },
	{ section_tipo: 'test3', component_tipo: 'test52' },
];

function step(componentTipo: string): CriterionPathStep[] {
	return [{ section_tipo: 'test3', component_tipo: componentTipo }];
}

/**
 * The DB probe runs at COLLECTION time (test/helpers/db_ready.ts) so the cases
 * below can be gated with `describe.if` / `test.if`. They used to carry
 * `if (!dbReady) return;` in the body, which reported a PASS with no assertions
 * on a machine without Postgres — including for the cycle guard and the
 * seed-finds-itself block, the two things this file exists to prove.
 */

describe.if(DB_READY)('readPathValues — leaf kinds are descriptor-driven', () => {
	test('string family → text', async () => {
		expect(await readPathValues(SEED, step('test52'), { lang: 'lg-eng' })).toEqual({
			kind: 'text',
			values: ['input text content of one'],
		});
	});

	test('number family → number, in stored order, deduped', async () => {
		expect(await readPathValues(SEED, step('test22'))).toEqual({ kind: 'number', values: [99] });
		// test139 stores two items (365, 100) — the fan-out is a UNION, not a first-wins.
		expect(await readPathValues(SEED, step('test139'))).toEqual({
			kind: 'number',
			values: [365, 100],
		});
	});

	test('component_date → ordinal ranges read from the persisted start.time stamp', async () => {
		// The stamp is the value builder_date compares against (@.start.time), so the
		// reader takes it VERBATIM rather than recomputing from the year/month/day
		// fields. Reader and matcher must agree: if a stored stamp ever disagrees
		// with its own fields, a reader that recomputed would hand the matcher a
		// value the SQL can never match, and a record would fail to find itself.
		//
		// This fixture USED to be that disagreement — item 1 carried year 1628 with
		// a year-628 stamp — which is why the rule above matters. The fixture is now
		// corrected and the agreement is enforced by test3_canonical_fixture.test.ts.
		expect(await readPathValues(SEED, step('test145'))).toEqual({
			kind: 'date',
			ranges: [
				{ from: 52339305600, to: 52339305600 },
				{ from: 65068444800, to: 65068444800 },
			],
		});
	});

	test('relation family → locators, with the transient id stripped', async () => {
		const value = (await readPathValues(SEED, step('test88'))) as Extract<
			CriterionValue,
			{ kind: 'locators' }
		>;
		expect(value.kind).toBe('locators');
		expect(value.locators).toHaveLength(2);
		expect(value.locators.map((locator) => locator.section_id)).toEqual(['1', '2']);
		for (const locator of value.locators) {
			expect(locator).not.toHaveProperty('id');
			expect(locator.section_tipo).toBe('dd64');
		}
	});

	test('section_id is preserved as STORED (string here) — jsonb containment is type-strict', async () => {
		const value = (await readPathValues(SEED, step('test80'))) as Extract<
			CriterionValue,
			{ kind: 'locators' }
		>;
		expect(value.locators[0]?.section_id).toBe('27');
		expect(typeof value.locators[0]?.section_id).toBe('string');
	});

	test('an empty stored relation resolves to null, not to an empty value', async () => {
		expect(await readPathValues(SEED, step('test54'))).toBeNull();
	});
});

describe.if(DB_READY)('readPathValues — walking the path', () => {
	test('a relation hop reaches the linked record and reads its leaf there', async () => {
		expect(await readPathValues(SEED, HOP_TO_27, { lang: 'lg-spa' })).toEqual({
			kind: 'text',
			values: ['El dos'],
		});
	});

	test('the language is a PARAMETER (no ALS), and the component fallback chain still applies', async () => {
		// test3/27's test52 exists only in lg-spa; asking in lg-eng resolves through
		// resolveComponentValue's fallback rather than reading nothing.
		expect(await readPathValues(SEED, HOP_TO_27, { lang: 'lg-eng' })).toEqual({
			kind: 'text',
			values: ['El dos'],
		});
	});

	test('a hop that leads nowhere resolves to null (the LEFT JOIN misses)', async () => {
		// test3/27 holds no test80, so the second hop has no frontier.
		const twoHops: CriterionPathStep[] = [
			{ section_tipo: 'test3', component_tipo: 'test80' },
			{ section_tipo: 'test3', component_tipo: 'test80' },
			{ section_tipo: 'test3', component_tipo: 'test52' },
		];
		expect(await readPathValues(SEED, twoHops, { lang: 'lg-spa' })).toBeNull();
	});

	test('a non-relation hop is refused — conform can only join through the relation column', async () => {
		const badHop: CriterionPathStep[] = [
			{ section_tipo: 'test3', component_tipo: 'test52' },
			{ section_tipo: 'test3', component_tipo: 'test52' },
		];
		expect(await readPathValues(SEED, badHop)).toBeNull();
	});

	test('the depth cap refuses an over-long path instead of walking it', async () => {
		const tooDeep: CriterionPathStep[] = Array.from({ length: MAX_PATH_HOPS + 2 }, () => ({
			section_tipo: 'test3',
			component_tipo: 'test80',
		}));
		expect(tooDeep.length - 1).toBeGreaterThan(MAX_PATH_HOPS);
		expect(await readPathValues(SEED, tooDeep)).toBeNull();
	});

	test('a path whose hops run out of frontier stops (the canonical fixture has no back-link)', async () => {
		// test3/1 --test80--> test3/27, and 27 holds no test80, so a repeated-hop
		// path simply runs dry. Exactly at the cap, so a non-terminating walk would
		// hang this case rather than return. NOTE this case does NOT exercise the
		// visit guard — nothing here is ever reached twice; the guard has its own
		// describe below, over a fixture that genuinely points back at itself.
		const atCap: CriterionPathStep[] = Array.from({ length: MAX_PATH_HOPS }, () => ({
			section_tipo: 'test3',
			component_tipo: 'test80',
		}));
		atCap.push({ section_tipo: 'test3', component_tipo: 'test52' });
		expect(await readPathValues(SEED, atCap)).toBeNull();
	});
});

/**
 * THE CYCLE GUARD, over a record that really does point at itself.
 *
 * The guard (`visited`, keyed on section_tipo + section_id + component_tipo) is
 * the only thing standing between a self-referential ontology and an 8-deep
 * fan-out of reads. The canonical playground has no back-link, so a fixture
 * built from it can only ever prove that a walk runs OUT of frontier — which is
 * a different mechanism, and leaves the guard free to be deleted with every test
 * still green.
 *
 * So this block writes ONE scratch record whose portal points at itself, and
 * asserts the pair that only the guard can distinguish:
 *   - one hop through the self-link, then the leaf → reads the value;
 *   - the SAME hop twice, then the leaf → null, because the second pass over
 *     (test3, <scratch>, test80) is refused.
 * Delete the `visited` set and the second case returns the value too.
 *
 * SCRATCH DISCIPLINE: one row, a section_id far outside the canonical range,
 * removed in afterAll (canonicalTest3Drift counts stray test3 rows as drift).
 */
describe.if(DB_READY)(
	'readPathValues — the visit guard, over a real self-referential record',
	() => {
		const SELF_ID = 9990101;
		const SELF = { sectionTipo: 'test3', sectionId: SELF_ID };
		const LEAF_TEXT = 'the record that points at itself';

		/** [self-hop …n times, leaf] */
		function selfHops(count: number): CriterionPathStep[] {
			const path: CriterionPathStep[] = Array.from({ length: count }, () => ({
				section_tipo: 'test3',
				component_tipo: 'test80',
			}));
			path.push({ section_tipo: 'test3', component_tipo: 'test52' });
			return path;
		}

		beforeAll(async () => {
			// ::text::jsonb — the Bun.sql jsonb string-param trap (a bare ::jsonb binds
			// the string as a jsonb STRING scalar and the relation_search trigger's
			// jsonb_each explodes).
			await sql.unsafe(
				`INSERT INTO matrix_test (section_id, section_tipo, relation, string)
			 VALUES ($1, 'test3', $2::text::jsonb, $3::text::jsonb)`,
				[
					SELF_ID,
					JSON.stringify({
						test80: [
							{
								id: 1,
								type: 'dd151',
								section_id: String(SELF_ID),
								section_tipo: 'test3',
								from_component_tipo: 'test80',
							},
						],
					}),
					JSON.stringify({ test52: [{ id: 1, lang: 'lg-eng', value: LEAF_TEXT }] }),
				],
			);
		});

		afterAll(async () => {
			await sql.unsafe('DELETE FROM matrix_test WHERE section_tipo = $1 AND section_id = $2', [
				'test3',
				SELF_ID,
			]);
		});

		test('the fixture really links back to itself (the anti-vacuous half)', async () => {
			// Without this, "returns null" below would prove nothing: an unreadable
			// record returns null too.
			const linked = (await readPathValues(SELF, [
				{ section_tipo: 'test3', component_tipo: 'test80' },
			])) as Extract<CriterionValue, { kind: 'locators' }>;
			expect(linked.locators).toHaveLength(1);
			expect(linked.locators[0]?.section_tipo).toBe('test3');
			expect(String(linked.locators[0]?.section_id)).toBe(String(SELF_ID));
			// One hop through the self-link lands back on the record and reads its leaf.
			expect(await readPathValues(SELF, selfHops(1), { lang: 'lg-eng' })).toEqual({
				kind: 'text',
				values: [LEAF_TEXT],
			});
		});

		test('the SECOND pass over the same (record, component) is refused — the guard, not the frontier', async () => {
			// Hop 1 expands (test3, SELF, test80) and lands back on SELF. Hop 2 asks to
			// expand the very same triple: the guard skips it, the frontier empties, and
			// the walk returns null. Remove `visited` from path_read.ts and this hop
			// expands again, reaches the leaf, and the case returns LEAF_TEXT.
			expect(await readPathValues(SELF, selfHops(2), { lang: 'lg-eng' })).toBeNull();
		});

		test('a self-link at full depth reads exactly once, not MAX_PATH_HOPS times', async () => {
			expect(await readPathValues(SELF, selfHops(MAX_PATH_HOPS), { lang: 'lg-eng' })).toBeNull();
		});
	},
);

describe('readPathValues — refusals return null, never throw', () => {
	test('an empty path', async () => {
		expect(await readPathValues(SEED, [])).toBeNull();
	});

	test.if(DB_READY)('a missing seed record', async () => {
		expect(
			await readPathValues({ sectionTipo: 'test3', sectionId: 999999 }, step('test52')),
		).toBeNull();
	});

	test.if(DB_READY)('an unknown component tipo', async () => {
		expect(await readPathValues(SEED, step('nope999'))).toBeNull();
	});

	test.if(DB_READY)('an unknown section tipo', async () => {
		expect(
			await readPathValues({ sectionTipo: 'nope999', sectionId: 1 }, step('test52')),
		).toBeNull();
	});

	test.if(DB_READY)(
		"the pseudo tipo 'section_id' is refused (its matcher is a different builder)",
		async () => {
			expect(await readPathValues(SEED, step('section_id'))).toBeNull();
		},
	);

	test.if(DB_READY)('a step with no component_tipo', async () => {
		expect(
			await readPathValues(SEED, [{ section_tipo: 'test3' } as unknown as CriterionPathStep]),
		).toBeNull();
	});
});

/**
 * THE AGREEMENT GATE — reader ∘ compiler ∘ search engine must return the seed.
 *
 * Each case reads test3/1's value at a path, compiles it into an SQO filter, runs
 * that SQO through the real assembler, and requires section_id 1 in the result.
 * Any divergence between how the reader walks a path and how conform joins it
 * shows up here as a record that cannot find itself.
 */
describe.if(DB_READY)('reader ∘ criteria ∘ search — the seed finds itself', () => {
	function criterion(over: Partial<Criterion> & Pick<Criterion, 'mode' | 'path'>): Criterion {
		return {
			id: 'c',
			label: 'c',
			role: 'identifying',
			weight: 1,
			required: true,
			...over,
		};
	}

	/**
	 * Run a compiled criterion filter. A criterion compiles to a LEAF (or an $or
	 * over leaves); an SQO `filter` must be a boolean NODE, so the caller always
	 * wraps — which is exactly what criteriaToFilter's $and does.
	 */
	async function idsMatching(compiled: object): Promise<number[]> {
		const filter = '$and' in compiled ? compiled : { $and: [compiled] };
		const sqo = sanitizeClientSqo({
			section_tipo: ['test3'],
			limit: 500,
			offset: 0,
			filter,
		});
		const { sql: builtSql, params } = await buildSearchSql(sqo, {});
		const rows = (await sql.unsafe(builtSql, params as (string | number | null)[])) as {
			section_id: number | string;
		}[];
		return rows.map((row) => Number(row.section_id));
	}

	async function expectSelfMatch(criterionSpec: Criterion, lang?: string): Promise<void> {
		const value = await readPathValues(
			SEED,
			criterionSpec.path,
			lang === undefined ? {} : { lang },
		);
		expect(value).not.toBeNull();
		const filter = criteriaToFilter(
			[criterionSpec],
			new Map([[criterionSpec.id, value as CriterionValue]]),
		);
		expect(filter).not.toBeNull();
		expect(await idsMatching(filter as object)).toContain(SEED.sectionId);
	}

	test('same_locator over a relation component', async () => {
		await expectSelfMatch(criterion({ mode: 'same_locator', path: step('test88') }));
	});

	test('same_locator OR semantics: EACH of the seed locators matches on its own', async () => {
		// The $or must not collapse into one multi-locator (AND) leaf: pairing the
		// seed's real locator with an absent one must still return the seed.
		const value = (await readPathValues(SEED, step('test88'))) as Extract<
			CriterionValue,
			{ kind: 'locators' }
		>;
		const withGhost: CriterionValue = {
			kind: 'locators',
			locators: [...value.locators, { section_tipo: 'dd64', section_id: '999999' }],
		};
		const compiled = criterionToSqoLeaf(
			criterion({ mode: 'same_locator', path: step('test88') }),
			withGhost,
		);
		expect(await idsMatching(compiled as object)).toContain(SEED.sectionId);
	});

	test('same_term over a relation component', async () => {
		await expectSelfMatch(criterion({ mode: 'same_term', path: step('test80') }));
	});

	test('normalized_text over a string component', async () => {
		await expectSelfMatch(criterion({ mode: 'normalized_text', path: step('test52') }), 'lg-eng');
	});

	test('normalized_text ACROSS a relation hop (the Coin→Type→Legend shape)', async () => {
		await expectSelfMatch(criterion({ mode: 'normalized_text', path: HOP_TO_27 }), 'lg-spa');
	});

	test('numeric_tolerance over a number component', async () => {
		await expectSelfMatch(
			criterion({ mode: 'numeric_tolerance', path: step('test22'), tolerance: 1 }),
		);
	});

	test('numeric_tolerance with tolerance 0 still matches (the degenerate window)', async () => {
		await expectSelfMatch(
			criterion({ mode: 'numeric_tolerance', path: step('test22'), tolerance: 0 }),
		);
	});

	test('date_overlap over a component_date — including the stale-stamp item', async () => {
		await expectSelfMatch(criterion({ mode: 'date_overlap', path: step('test145'), tolerance: 0 }));
	});

	test('a criterion whose value the seed does NOT hold matches nothing here', async () => {
		// Sanity floor: the agreement cases above would be vacuous if every filter
		// simply returned every row.
		const compiled = criterionToSqoLeaf(
			criterion({ mode: 'normalized_text', path: step('test52') }),
			{
				kind: 'text',
				values: ['a value no test3 record holds'],
			},
		);
		expect(await idsMatching(compiled as object)).not.toContain(SEED.sectionId);
	});

	test('a MULTI-criterion pool $ands the required criteria and still returns the seed', async () => {
		const criteria = [
			criterion({ id: 'legend', mode: 'normalized_text', path: HOP_TO_27 }),
			criterion({ id: 'weight', mode: 'numeric_tolerance', path: step('test22'), tolerance: 1 }),
			criterion({ id: 'link', mode: 'same_locator', path: step('test88') }),
		];
		const values = new Map<string, CriterionValue | null>();
		for (const item of criteria) {
			values.set(item.id, await readPathValues(SEED, item.path, { lang: 'lg-spa' }));
		}
		const filter = criteriaToFilter(criteria, values) as { $and: unknown[] };
		expect(filter.$and).toHaveLength(3);
		expect(await idsMatching(filter)).toContain(SEED.sectionId);
	});
});
