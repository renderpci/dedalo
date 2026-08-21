/**
 * Criterion → SQO compilation (src/core/identify/criteria.ts).
 *
 * The compiler is PURE, so this gate is exhaustive and needs no database: every
 * mode, every value kind, every mismatch, and — the point of the file — the
 * exact SHAPES, because a wrong-but-plausible leaf returns wrong candidates
 * silently.
 *
 * Two invariants beyond the per-mode shapes:
 *  1. Every emitted node PARSES as an SQO filter (concepts/sqo.ts schemas).
 *     The compiler must not be able to invent a second query language.
 *  2. An OR over relation locators is SEPARATE LEAVES, never one multi-locator
 *     leaf — an array of locators in one leaf compiles to a single jsonb `@>`
 *     containment, which is AND (verified in code and against the live store;
 *     see the criteria.ts header). Getting this backwards turns "agrees on any
 *     of the seed's Types" into "carries all of them", which returns almost
 *     nothing and looks like a data problem.
 */
// Migrated to the generic `test` TLD 2026-08-20 (AGENTS.md hard rule). Install tipos
// were replaced by their twins from src/core/test_data/test_tld_tipo_map.json; the
// seed-shipped ones (rsc/dd/hierarchy/ontology/lg) have no twin and stay, because they
// ship with every installation.

import { describe, expect, test } from 'bun:test';
import { sqoFilterLeafSchema, sqoFilterNodeSchema } from '../../src/core/concepts/sqo.ts';
import { criteriaToFilter, criterionToSqoLeaf } from '../../src/core/identify/criteria.ts';
import type { Criterion, CriterionValue, MatchMode } from '../../src/core/identify/types.ts';

const PATH = [
	{ section_tipo: 'test6100', component_tipo: 'test6230' },
	{ section_tipo: 'test6099', component_tipo: 'test6123' },
];

function criterion(mode: MatchMode, over: Partial<Criterion> = {}): Criterion {
	return {
		id: 'c1',
		label: 'Type › Obverse legend',
		path: PATH,
		role: 'identifying',
		weight: 1,
		mode,
		required: true,
		...over,
	};
}

/** Both invariant 1 and a readability guard: an emitted node must be SQO. */
function expectValidSqo(node: unknown): void {
	const asNode = sqoFilterNodeSchema.safeParse(node);
	const asLeaf = sqoFilterLeafSchema.safeParse(node);
	expect(asNode.success || asLeaf.success).toBe(true);
}

describe('criterionToSqoLeaf — same_locator', () => {
	test('ONE seed locator compiles to ONE leaf carrying the criterion path', () => {
		const value: CriterionValue = {
			kind: 'locators',
			locators: [{ section_tipo: 'test6099', section_id: '27' }],
		};
		const compiled = criterionToSqoLeaf(criterion('same_locator'), value);
		// section_id emits CANONICAL (int) even when the seed stored '27'
		// (WC-2026-08-10-section-id-int-canonical).
		expect(compiled).toEqual({
			q: [{ section_tipo: 'test6099', section_id: 27 }],
			path: PATH,
		});
		expectValidSqo(compiled);
	});

	test('MANY seed locators compile to SEPARATE leaves under $or (never one leaf)', () => {
		const value: CriterionValue = {
			kind: 'locators',
			locators: [
				{ section_tipo: 'test6099', section_id: '27' },
				{ section_tipo: 'test6099', section_id: '31' },
			],
		};
		const compiled = criterionToSqoLeaf(criterion('same_locator'), value) as {
			$or: { q: unknown[] }[];
		};
		expect(Object.keys(compiled)).toEqual(['$or']);
		expect(compiled.$or).toHaveLength(2);
		// THE anti-regression: each leaf carries exactly ONE locator, because a
		// two-locator leaf is a single `@>` containment = AND.
		for (const leaf of compiled.$or) {
			expect(leaf.q).toHaveLength(1);
		}
		expect(compiled.$or[0]?.q).toEqual([{ section_tipo: 'test6099', section_id: 27 }]);
		expect(compiled.$or[1]?.q).toEqual([{ section_tipo: 'test6099', section_id: 31 }]);
		expectValidSqo(compiled);
	});

	test('q carries ONLY the identity fields — no id, type or from_component_tipo', () => {
		const value: CriterionValue = {
			kind: 'locators',
			locators: [
				{
					section_tipo: 'test6099',
					section_id: '27',
					id: 4,
					type: 'dd151',
					from_component_tipo: 'test6230',
				},
			],
		};
		const compiled = criterionToSqoLeaf(criterion('same_locator'), value) as { q: object[] };
		expect(compiled.q[0]).toEqual({ section_tipo: 'test6099', section_id: 27 });
	});

	test('section_id emits CANONICAL — int for addresses, verbatim for external ids (WC-2026-08-10)', () => {
		// The old law here ("travels VERBATIM") is repealed: builder_relation now
		// probes both typed forms, and the compiler emits the canonical one.
		const asString = criterionToSqoLeaf(criterion('same_locator'), {
			kind: 'locators',
			locators: [{ section_tipo: 'test3', section_id: '27' }],
		}) as { q: { section_id: unknown }[] };
		const asNumber = criterionToSqoLeaf(criterion('same_locator'), {
			kind: 'locators',
			locators: [{ section_tipo: 'test3', section_id: 27 }],
		}) as { q: { section_id: unknown }[] };
		// A non-convertible external remote id is NOT an address in disguise —
		// its stored bytes are the value and must survive untouched.
		const asExternalRef = criterionToSqoLeaf(criterion('same_locator'), {
			kind: 'locators',
			locators: [{ section_tipo: 'test7342', section_id: '001338683' }],
		}) as { q: { section_id: unknown }[] };
		expect(asString.q[0]?.section_id).toBe(27);
		expect(asNumber.q[0]?.section_id).toBe(27);
		expect(asExternalRef.q[0]?.section_id).toBe('001338683');
	});

	test('a non-locator value is a profile error, not a query', () => {
		expect(
			criterionToSqoLeaf(criterion('same_locator'), { kind: 'text', values: ['x'] }),
		).toBeNull();
		expect(
			criterionToSqoLeaf(criterion('same_locator'), { kind: 'locators', locators: [] }),
		).toBeNull();
	});

	test('the emitted path is a COPY — a compiled filter never aliases the profile', () => {
		const source = criterion('same_locator');
		const compiled = criterionToSqoLeaf(source, {
			kind: 'locators',
			locators: [{ section_tipo: 'test3', section_id: 1 }],
		}) as { path: object[] };
		expect(compiled.path).not.toBe(source.path);
		expect(compiled.path[0]).not.toBe(source.path[0]);
	});
});

describe('criterionToSqoLeaf — same_term', () => {
	test('is byte-identical to same_locator TODAY (the hierarchy seam is unwired)', () => {
		const value: CriterionValue = {
			kind: 'locators',
			locators: [
				{ section_tipo: 'es1', section_id: '185' },
				{ section_tipo: 'es1', section_id: '186' },
			],
		};
		expect(criterionToSqoLeaf(criterion('same_term'), value)).toEqual(
			criterionToSqoLeaf(criterion('same_locator'), value) as object,
		);
	});

	test('emits NO relation_search / ancestor flag — the wrap is deliberately not wired', () => {
		const compiled = criterionToSqoLeaf(criterion('same_term'), {
			kind: 'locators',
			locators: [{ section_tipo: 'es1', section_id: '185' }],
		});
		expect(JSON.stringify(compiled)).not.toContain('relation_search');
		expect(JSON.stringify(compiled)).not.toContain('ancestor');
	});
});

describe('criterionToSqoLeaf — normalized_text', () => {
	test("one value → one leaf with the string builder's '==' equality operator", () => {
		const compiled = criterionToSqoLeaf(criterion('normalized_text'), {
			kind: 'text',
			values: ['El dos'],
		});
		expect(compiled).toEqual({ q: 'El dos', q_operator: '==', path: PATH });
		expectValidSqo(compiled);
	});

	test('many values → $or of equality leaves', () => {
		const compiled = criterionToSqoLeaf(criterion('normalized_text'), {
			kind: 'text',
			values: ['ATHENA', 'Athena'],
		}) as { $or: unknown[] };
		expect(compiled.$or).toHaveLength(2);
		expectValidSqo(compiled);
	});

	test('empty strings are dropped; an all-empty value compiles to nothing', () => {
		expect(
			criterionToSqoLeaf(criterion('normalized_text'), { kind: 'text', values: ['', 'Athena'] }),
		).toEqual({ q: 'Athena', q_operator: '==', path: PATH });
		expect(
			criterionToSqoLeaf(criterion('normalized_text'), { kind: 'text', values: ['', ''] }),
		).toBeNull();
	});

	test('a non-text value is a profile error', () => {
		expect(
			criterionToSqoLeaf(criterion('normalized_text'), { kind: 'number', values: [1] }),
		).toBeNull();
	});
});

describe('criterionToSqoLeaf — numeric_tolerance', () => {
	test("the window rides INSIDE q as the number builder's '...' between", () => {
		const compiled = criterionToSqoLeaf(criterion('numeric_tolerance', { tolerance: 0.5 }), {
			kind: 'number',
			values: [4.54],
		});
		expect(compiled).toEqual({ q: '4.04...5.04', path: PATH });
		expectValidSqo(compiled);
	});

	test('tolerance 0 (and an absent tolerance) degenerate to equality', () => {
		expect(
			criterionToSqoLeaf(criterion('numeric_tolerance', { tolerance: 0 }), {
				kind: 'number',
				values: [99],
			}),
		).toEqual({ q: '99...99', path: PATH });
		expect(
			criterionToSqoLeaf(criterion('numeric_tolerance'), { kind: 'number', values: [99] }),
		).toEqual({ q: '99...99', path: PATH });
	});

	test('a negative tolerance is read as slack, not as an inverted window', () => {
		expect(
			criterionToSqoLeaf(criterion('numeric_tolerance', { tolerance: -2 }), {
				kind: 'number',
				values: [10],
			}),
		).toEqual({ q: '8...12', path: PATH });
	});

	test('bounds never reach the builder in exponent form (coerceNumeric would read 0)', () => {
		const compiled = criterionToSqoLeaf(criterion('numeric_tolerance', { tolerance: 0.0000001 }), {
			kind: 'number',
			values: [0.0000002],
		}) as { q: string };
		expect(compiled.q).not.toContain('e');
		expect(compiled.q).toMatch(/^-?\d+(\.\d+)?\.\.\.-?\d+(\.\d+)?$/);
	});

	test('negative values keep their sign', () => {
		expect(
			criterionToSqoLeaf(criterion('numeric_tolerance', { tolerance: 1 }), {
				kind: 'number',
				values: [-5],
			}),
		).toEqual({ q: '-6...-4', path: PATH });
	});

	test('many values → $or of windows', () => {
		const compiled = criterionToSqoLeaf(criterion('numeric_tolerance', { tolerance: 1 }), {
			kind: 'number',
			values: [10, 20],
		}) as { $or: { q: string }[] };
		expect(compiled.$or.map((leaf) => leaf.q)).toEqual(['9...11', '19...21']);
		expectValidSqo(compiled);
	});

	test('a non-number value is a profile error', () => {
		expect(
			criterionToSqoLeaf(criterion('numeric_tolerance'), { kind: 'text', values: ['4.54'] }),
		).toBeNull();
	});
});

describe('criterionToSqoLeaf — date_overlap', () => {
	const VIRTUAL_YEAR = 372 * 24 * 60 * 60;

	test('one range → an $and of two YEAR bounds, upper exclusive on the next year', () => {
		const compiled = criterionToSqoLeaf(criterion('date_overlap', { tolerance: 0 }), {
			kind: 'date',
			ranges: [{ from: 1628 * VIRTUAL_YEAR, to: 1630 * VIRTUAL_YEAR }],
		});
		expect(compiled).toEqual({
			$and: [
				{ q: { start: { year: 1628 } }, q_operator: '>=', path: PATH },
				{ q: { start: { year: 1631 } }, q_operator: '<', path: PATH },
			],
		});
		expectValidSqo(compiled);
	});

	test('tolerance widens the window in YEARS on both sides', () => {
		const compiled = criterionToSqoLeaf(criterion('date_overlap', { tolerance: 25 }), {
			kind: 'date',
			ranges: [{ from: 1628 * VIRTUAL_YEAR, to: 1628 * VIRTUAL_YEAR }],
		}) as { $and: { q: { start: { year: number } } }[] };
		expect(compiled.$and[0]?.q.start.year).toBe(1603);
		expect(compiled.$and[1]?.q.start.year).toBe(1654);
	});

	test('the q is an OBJECT, so a BC (negative) year survives', () => {
		const compiled = criterionToSqoLeaf(criterion('date_overlap', { tolerance: 0 }), {
			kind: 'date',
			ranges: [{ from: -500 * VIRTUAL_YEAR, to: -400 * VIRTUAL_YEAR }],
		}) as { $and: { q: { start: { year: number } } }[] };
		expect(compiled.$and[0]?.q.start.year).toBe(-500);
		expect(compiled.$and[1]?.q.start.year).toBe(-399);
	});

	test('mid-year seconds floor onto their own year (never a half-year bound)', () => {
		const compiled = criterionToSqoLeaf(criterion('date_overlap', { tolerance: 0 }), {
			kind: 'date',
			// 2024-06-25, the canonical test3/1 test145 second item.
			ranges: [{ from: 65068444800, to: 65068444800 }],
		}) as { $and: { q: { start: { year: number } } }[] };
		expect(compiled.$and[0]?.q.start.year).toBe(2024);
		expect(compiled.$and[1]?.q.start.year).toBe(2025);
	});

	test('many ranges → $or of windows', () => {
		const compiled = criterionToSqoLeaf(criterion('date_overlap', { tolerance: 0 }), {
			kind: 'date',
			ranges: [
				{ from: 628 * VIRTUAL_YEAR, to: 628 * VIRTUAL_YEAR },
				{ from: 2024 * VIRTUAL_YEAR, to: 2024 * VIRTUAL_YEAR },
			],
		}) as { $or: unknown[] };
		expect(compiled.$or).toHaveLength(2);
		expectValidSqo(compiled);
	});

	test('a non-date value is a profile error', () => {
		expect(
			criterionToSqoLeaf(criterion('date_overlap'), { kind: 'number', values: [1628] }),
		).toBeNull();
	});
});

describe('criterionToSqoLeaf — non-SQO and malformed cases', () => {
	test('image_similarity is NOT an SQO leaf — the caller routes it to the vector store', () => {
		expect(
			criterionToSqoLeaf(criterion('image_similarity', { tolerance: 0.8 }), {
				kind: 'text',
				values: ['whatever'],
			}),
		).toBeNull();
		expect(
			criterionToSqoLeaf(criterion('image_similarity'), { kind: 'locators', locators: [] }),
		).toBeNull();
	});

	test('an empty path compiles to nothing (a leaf with no path matches everything)', () => {
		expect(
			criterionToSqoLeaf(criterion('normalized_text', { path: [] }), {
				kind: 'text',
				values: ['x'],
			}),
		).toBeNull();
	});

	test('an unknown mode compiles to nothing rather than to a wrong shape', () => {
		expect(
			criterionToSqoLeaf(criterion('not_a_mode' as MatchMode), { kind: 'text', values: ['x'] }),
		).toBeNull();
	});

	test('a single-step path compiles as a one-step SQO path', () => {
		const single = [{ section_tipo: 'test3', component_tipo: 'test52' }];
		expect(
			criterionToSqoLeaf(criterion('normalized_text', { path: single }), {
				kind: 'text',
				values: ['El dos'],
			}),
		).toEqual({ q: 'El dos', q_operator: '==', path: single });
	});
});

describe('criteriaToFilter — the candidate-pool query', () => {
	const legend = criterion('normalized_text', { id: 'legend', required: true });
	const weight = criterion('numeric_tolerance', {
		id: 'weight',
		required: false,
		role: 'descriptive',
		tolerance: 0.5,
		path: [{ section_tipo: 'test6100', component_tipo: 'test6170' }],
	});

	test('$and over the REQUIRED criteria only — ranking criteria never gate', () => {
		const filter = criteriaToFilter(
			[legend, weight],
			new Map<string, CriterionValue | null>([
				['legend', { kind: 'text', values: ['ATHENA'] }],
				['weight', { kind: 'number', values: [4.54] }],
			]),
		);
		expect(filter).toEqual({ $and: [{ q: 'ATHENA', q_operator: '==', path: PATH }] });
		expectValidSqo(filter);
	});

	test("an 'ignored' criterion is skipped even when it is marked required", () => {
		const off = criterion('normalized_text', { id: 'legend', required: true, role: 'ignored' });
		expect(
			criteriaToFilter([off], new Map([['legend', { kind: 'text', values: ['ATHENA'] }]])),
		).toBeNull();
	});

	test('a required criterion the SEED lacks is SKIPPED, not turned into an impossible filter', () => {
		const other = criterion('normalized_text', {
			id: 'mint',
			path: [{ section_tipo: 'test6100', component_tipo: 'test6106' }],
		});
		const filter = criteriaToFilter(
			[legend, other],
			new Map<string, CriterionValue | null>([
				['legend', { kind: 'text', values: ['ATHENA'] }],
				['mint', null],
			]),
		);
		expect(filter).toEqual({ $and: [{ q: 'ATHENA', q_operator: '==', path: PATH }] });
	});

	test('a criterion with NO entry at all is skipped (an absent key is an absent value)', () => {
		expect(criteriaToFilter([legend], new Map())).toBeNull();
	});

	test('an uncompilable required criterion (image_similarity) does not gate the pool', () => {
		const visual = criterion('image_similarity', { id: 'obverse', required: true });
		expect(
			criteriaToFilter([visual], new Map([['obverse', { kind: 'text', values: ['x'] }]])),
		).toBeNull();
	});

	test('nothing compiled → null, NEVER an empty $and (which reads as true-for-all)', () => {
		expect(criteriaToFilter([], new Map())).toBeNull();
		expect(
			criteriaToFilter([weight], new Map([['weight', { kind: 'number', values: [4] }]])),
		).toBeNull();
	});

	test('several required criteria all land in the $and, in profile order', () => {
		const mint = criterion('same_locator', {
			id: 'mint',
			path: [{ section_tipo: 'test6100', component_tipo: 'test6106' }],
		});
		const filter = criteriaToFilter(
			[legend, mint],
			new Map<string, CriterionValue | null>([
				['legend', { kind: 'text', values: ['ATHENA'] }],
				['mint', { kind: 'locators', locators: [{ section_tipo: 'test6105', section_id: 7 }] }],
			]),
		) as { $and: unknown[] };
		expect(filter.$and).toHaveLength(2);
		expect(filter.$and[0]).toEqual({ q: 'ATHENA', q_operator: '==', path: PATH });
		expectValidSqo(filter);
	});
});
