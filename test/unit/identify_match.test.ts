/**
 * Scoring and explanation. These are the rules a curator will argue with, so
 * they are tested as pure logic over injected readers rather than through a
 * live corpus.
 *
 * The judgement that matters most here is what ABSENCE means. Collections are
 * incomplete by nature: most records do not fill most fields. If "neither side
 * records this" counted as disagreement, every sparse record would score low
 * for being sparse rather than for being different, and the ranking would
 * mostly measure cataloguing effort.
 */

import { describe, expect, test } from 'bun:test';
import type { ComponentGrant } from '../../src/core/identify/component_access.ts';
import {
	type AccessFilter,
	type CandidateRecord,
	IdentifyAccessError,
	compareValues,
	findMatches,
} from '../../src/core/identify/match.ts';
import { parseProfile } from '../../src/core/identify/profile.ts';
import type {
	Criterion,
	CriterionPathStep,
	CriterionValue,
	IdentificationProfile,
} from '../../src/core/identify/types.ts';
import type { Principal } from '../../src/core/security/permissions.ts';

/**
 * The scoring cases are about scoring, so they run as an unscoped admin — the
 * default access filter short-circuits for a global admin and never touches the
 * database. The ACCESS cases below inject their own filter.
 */
const ADMIN: Principal = { userId: 1, isGlobalAdmin: true, isDeveloper: false };
const CURATOR: Principal = { userId: 7, isGlobalAdmin: false, isDeveloper: false };

/**
 * The per-component half of the gate, injected. The cases that are not ABOUT
 * component grants grant everything, exactly as `identify_propose.test.ts` does:
 * the production default is `getPermissions`, which would put a dd774 fixture
 * between these pure-logic assertions and the rule they check.
 */
const grantAll: ComponentGrant = async () => 1;

const PATH: CriterionPathStep[] = [{ section_tipo: 'test3', component_tipo: 'test145' }];

function criterion(overrides: Partial<Criterion> = {}): Criterion {
	return {
		id: 'c',
		label: 'C',
		path: PATH,
		role: 'identifying',
		weight: 1,
		mode: 'same_locator',
		required: false,
		...overrides,
	};
}

const locators = (...ids: number[]): CriterionValue => ({
	kind: 'locators',
	locators: ids.map((id) => ({ section_tipo: 'term1', section_id: id })),
});
const text = (...values: string[]): CriterionValue => ({ kind: 'text', values });
const numbers = (...values: number[]): CriterionValue => ({ kind: 'number', values });
const dates = (...ranges: Array<[number, number]>): CriterionValue => ({
	kind: 'date',
	ranges: ranges.map(([from, to]) => ({ from, to })),
});

describe('compareValues', () => {
	test('absence is not disagreement', () => {
		expect(compareValues(criterion(), null, locators(1)).agreed).toBeNull();
		expect(compareValues(criterion(), locators(1), null).agreed).toBeNull();
		expect(compareValues(criterion(), locators(), locators(1)).agreed).toBeNull();
	});

	test('locators agree when they share any value', () => {
		expect(compareValues(criterion(), locators(1, 2), locators(2, 3)).agreed).toBe(true);
		expect(compareValues(criterion(), locators(1), locators(9)).agreed).toBe(false);
	});

	test('text ignores case, accents and whitespace', () => {
		const result = compareValues(
			criterion({ mode: 'normalized_text' }),
			text('  Iberian   BRONZE '),
			text('ibérian bronze'),
		);
		expect(result.agreed).toBe(true);
	});

	test('numbers agree within tolerance and not outside it', () => {
		const c = criterion({ mode: 'numeric_tolerance', tolerance: 0.2 });
		expect(compareValues(c, numbers(9.1), numbers(9.25)).agreed).toBe(true);
		expect(compareValues(c, numbers(9.1), numbers(9.6)).agreed).toBe(false);
		// Zero tolerance means exact — not "everything matches".
		expect(
			compareValues(
				criterion({ mode: 'numeric_tolerance', tolerance: 0 }),
				numbers(2),
				numbers(2.1),
			).agreed,
		).toBe(false);
	});

	test('dates agree when ranges overlap, including touching endpoints', () => {
		const c = criterion({ mode: 'date_overlap' });
		expect(compareValues(c, dates([100, 200]), dates([150, 300])).agreed).toBe(true);
		expect(compareValues(c, dates([100, 200]), dates([200, 300])).agreed).toBe(true);
		expect(compareValues(c, dates([100, 199]), dates([200, 300])).agreed).toBe(false);
	});

	test('mismatched kinds disagree rather than throwing', () => {
		expect(compareValues(criterion(), text('x'), locators(1)).agreed).toBe(false);
	});

	test('every comparison explains itself', () => {
		// An unexplained score is either ignored or over-trusted.
		expect(compareValues(criterion(), locators(1, 2), locators(2)).detail).toContain('shares');
		expect(compareValues(criterion(), locators(1), locators(2)).detail).toBe('no shared value');
	});
});

/** Values keyed by "sectionId|criterionId", so a fake reader can serve a corpus. */
function readerFor(corpus: Record<string, CriterionValue | null>) {
	return async (
		record: { sectionTipo: string; sectionId: number },
		path: CriterionPathStep[],
	): Promise<CriterionValue | null> =>
		corpus[`${record.sectionId}|${path[path.length - 1]?.component_tipo}`] ?? null;
}

function profileWith(
	criteria: unknown[],
	overrides: Record<string, unknown> = {},
): IdentificationProfile {
	return parseProfile({
		id: 'p',
		label: 'P',
		sectionTipos: ['test3'],
		criteria,
		...overrides,
	});
}

describe('findMatches', () => {
	const deity = {
		id: 'deity',
		label: 'Deity',
		path: [{ section_tipo: 'test3', component_tipo: 'deity' }],
		role: 'identifying',
		weight: 3,
	};
	const symbol = {
		id: 'symbol',
		label: 'Symbol',
		path: [{ section_tipo: 'test3', component_tipo: 'symbol' }],
		role: 'identifying',
		weight: 1,
	};

	const pool = async () => [
		{ sectionTipo: 'test3', sectionId: 2 },
		{ sectionTipo: 'test3', sectionId: 3 },
	];

	test('ranks by share of achievable identifying weight and explains each', async () => {
		const report = await findMatches({
			principal: ADMIN,
			componentGrant: grantAll,
			profile: profileWith([deity, symbol]),
			seed: { sectionTipo: 'test3', sectionId: 1 },
			findPool: pool,
			readValues: readerFor({
				'1|deity': locators(10),
				'1|symbol': locators(20),
				'2|deity': locators(10),
				'2|symbol': locators(20), // both → 4/4
				'3|deity': locators(10),
				'3|symbol': locators(99), // deity only → 3/4
			}),
		});

		expect(report.results.map((r) => r.sectionId)).toEqual([2, 3]);
		expect(report.results[0]?.score).toBe(1);
		expect(report.results[1]?.score).toBe(0.75);
		expect(report.results[0]?.verdict).toBe('same_type');
		// Every result carries its breakdown, one entry per non-ignored criterion.
		expect(report.results[1]?.outcomes).toHaveLength(2);
		expect(report.results[1]?.outcomes.find((o) => o.criterionId === 'symbol')?.agreed).toBe(false);
	});

	test('a criterion neither side records does not drag the score down', async () => {
		const report = await findMatches({
			principal: ADMIN,
			componentGrant: grantAll,
			profile: profileWith([deity, symbol]),
			seed: { sectionTipo: 'test3', sectionId: 1 },
			findPool: async () => [{ sectionTipo: 'test3', sectionId: 2 }],
			readValues: readerFor({
				'1|deity': locators(10),
				'2|deity': locators(10),
				// neither records `symbol`
			}),
		});
		// 3/3, not 3/4: an unrecordable criterion was never achievable.
		expect(report.results[0]?.score).toBe(1);
		expect(report.blindCriteria).toEqual(['symbol']);
	});

	test('a required criterion is a gate, not a weight', async () => {
		// BOTH halves of the title, because the first one alone passes with the
		// second fully broken. `weight` is IGNORED when a criterion is `required`
		// (types.ts Criterion.weight, IDENTIFY_SPEC §3): a required criterion is
		// the POOL GATE, so every scored candidate already agrees on it, and
		// counting its weight adds the same constant to BOTH sides of the ratio —
		// pulling every score toward `sameType`.
		//
		// The concrete numbers are the ones that make it a verdict change: legend
		// (required, weight 6) + symbol (weight 1), sameType 0.85. A candidate
		// sharing the legend but differing on the symbol is 0/1 → `weak` under the
		// contract, and 6/7 = 0.857 → `same_type` if the gate's weight is counted.
		const legend = {
			id: 'legend',
			label: 'Legend',
			path: [{ section_tipo: 'test3', component_tipo: 'legend' }],
			role: 'identifying',
			weight: 6,
			required: true,
		};
		const report = await findMatches({
			principal: ADMIN,
			componentGrant: grantAll,
			profile: profileWith([legend, symbol], {
				thresholds: { sameType: 0.85, candidate: 0.5 },
			}),
			seed: { sectionTipo: 'test3', sectionId: 1 },
			findPool: async () => [
				{ sectionTipo: 'test3', sectionId: 2 },
				{ sectionTipo: 'test3', sectionId: 3 },
				{ sectionTipo: 'test3', sectionId: 4 },
			],
			readValues: readerFor({
				'1|legend': locators(10),
				'1|symbol': locators(20),
				'2|legend': locators(10),
				'2|symbol': locators(20), // gate + the one scored feature
				'3|legend': locators(10), // gate passes…
				'3|symbol': locators(99), // …and everything scoreable differs
				'4|legend': locators(77), // fails the gate outright
				'4|symbol': locators(20),
			}),
		});

		// A GATE: a candidate that does not share it is not a match at all,
		// whatever else it agrees on.
		expect(report.results.map((r) => r.sectionId)).toEqual([2, 3]);

		// NOT A WEIGHT: it is out of the ratio on both sides, so the score is the
		// share of the criteria that actually discriminate.
		const byId = new Map(report.results.map((r) => [r.sectionId, r]));
		expect(byId.get(2)?.score).toBe(1);
		expect(byId.get(3)?.score).toBe(0);
		expect(byId.get(3)?.verdict).toBe('weak');

		// AND THE BREAKDOWN SAYS SO. `weight` still reports the DECLARED 6 —
		// that is what the curator authored — so the marker is the only thing
		// standing between this row and a reader crediting the gate with six
		// points it never contributed. It is also why the fix is a marker and
		// not a zeroed weight: at weight 0 this row would be indistinguishable
		// from the descriptive one below it, i.e. the profile's gate would read
		// as its least important criterion. Three states, all distinguishable:
		// gate (required) / weighted (weight > 0) / descriptive (weight 0).
		const gate = byId.get(2)?.outcomes.find((o) => o.criterionId === 'legend');
		expect(gate?.required).toBe(true);
		expect(gate?.weight).toBe(6);
		const weighted = byId.get(2)?.outcomes.find((o) => o.criterionId === 'symbol');
		expect(weighted?.required).toBeUndefined();
		expect(weighted?.weight).toBe(1);
	});

	test('a profile whose only identifying criterion is required still answers', async () => {
		// The edge the rule above creates: with the gate out of the ratio there is
		// nothing left to divide by. "Every survivor agreed on everything this
		// profile can judge" must not become "nothing comparable, no results" —
		// that would silently empty the simplest profile a curator can write
		// ("same legend = same type").
		const report = await findMatches({
			principal: ADMIN,
			componentGrant: grantAll,
			profile: profileWith([{ ...deity, required: true }]),
			seed: { sectionTipo: 'test3', sectionId: 1 },
			findPool: pool,
			readValues: readerFor({
				'1|deity': locators(10),
				'2|deity': locators(10),
				'3|deity': locators(77), // fails the gate
			}),
		});
		expect(report.results.map((r) => r.sectionId)).toEqual([2]);
		expect(report.results[0]?.score).toBe(1);
		expect(report.results[0]?.verdict).toBe('same_type');
	});

	test('descriptive criteria are reported but never scored', async () => {
		const report = await findMatches({
			principal: ADMIN,
			componentGrant: grantAll,
			profile: profileWith([deity, { ...symbol, id: 'weight_g', role: 'descriptive' }]),
			seed: { sectionTipo: 'test3', sectionId: 1 },
			findPool: async () => [{ sectionTipo: 'test3', sectionId: 2 }],
			readValues: readerFor({
				'1|deity': locators(10),
				'2|deity': locators(10),
				'1|symbol': numbers(9),
				'2|symbol': numbers(4), // disagrees, must not lower the score
			}),
		});
		expect(report.results[0]?.score).toBe(1);
		const descriptive = report.results[0]?.outcomes.find((o) => o.criterionId === 'weight_g');
		expect(descriptive?.weight).toBe(0);
		// Weight 0 means DESCRIPTIVE and nothing else: the gate above carries its
		// own marker precisely so the two never collapse into one rendering.
		expect(descriptive?.required).toBeUndefined();
	});

	test('exact-set identity separates a shared die from a mere resemblance', async () => {
		const profile = profileWith([deity, symbol], { exactSetIdentity: true });
		const report = await findMatches({
			principal: ADMIN,
			componentGrant: grantAll,
			profile,
			seed: { sectionTipo: 'test3', sectionId: 1 },
			findPool: pool,
			readValues: readerFor({
				'1|deity': locators(10),
				'1|symbol': locators(20),
				'2|deity': locators(10),
				'2|symbol': locators(20), // identical sets
				'3|deity': locators(10, 11), // superset: same score, different object
				'3|symbol': locators(20),
			}),
		});
		const byId = new Map(report.results.map((r) => [r.sectionId, r]));
		expect(byId.get(2)?.verdict).toBe('same_type');
		// Scores the same, but carries an element the seed does not: not the same die.
		expect(byId.get(3)?.verdict).not.toBe('same_type');
	});

	test('the seed never matches itself', async () => {
		const report = await findMatches({
			principal: ADMIN,
			componentGrant: grantAll,
			profile: profileWith([deity]),
			seed: { sectionTipo: 'test3', sectionId: 1 },
			findPool: async () => [
				{ sectionTipo: 'test3', sectionId: 1 },
				{ sectionTipo: 'test3', sectionId: 2 },
			],
			readValues: readerFor({ '1|deity': locators(10), '2|deity': locators(10) }),
		});
		expect(report.results.map((r) => r.sectionId)).toEqual([2]);
	});

	test('a truncated pool is reported, not silently cut', async () => {
		// The fake pool obeys the TWO facts the real one has, because the bug lives
		// exactly in them: the query HONOURS the limit it is handed, and the SEED
		// comes back in its own result set (it satisfies its own `$or` filter by
		// construction, and the default order is section_id, so it sits inside the
		// window). Fetching "cap + 1 and then drop the seed" leaves exactly `cap`
		// survivors and reports `moreAvailable: false` on a pool that WAS cut.
		const corpus: CandidateRecord[] = [1, 2, 3].map((sectionId) => ({
			sectionTipo: 'test3',
			sectionId,
		}));
		const report = await findMatches({
			principal: ADMIN,
			componentGrant: grantAll,
			profile: profileWith([deity]),
			seed: { sectionTipo: 'test3', sectionId: 1 },
			poolCap: 1,
			findPool: async (_profile, _values, cap) => corpus.slice(0, cap),
			readValues: readerFor({
				'1|deity': locators(10),
				'2|deity': locators(10),
				'3|deity': locators(10),
			}),
		});
		// Presenting 1 of 2 as "the matches" would be a lie by omission.
		expect(report.moreAvailable).toBe(true);
		expect(report.results).toHaveLength(1);
	});

	test('a pool that fits under the cap does not claim there is more', async () => {
		// Same honest fake: the seed is in the rows, and the limit is obeyed. The
		// flag must not fire merely because the seed used up a row.
		const corpus: CandidateRecord[] = [1, 2].map((sectionId) => ({
			sectionTipo: 'test3',
			sectionId,
		}));
		const report = await findMatches({
			principal: ADMIN,
			componentGrant: grantAll,
			profile: profileWith([deity]),
			seed: { sectionTipo: 'test3', sectionId: 1 },
			poolCap: 5,
			findPool: async (_profile, _values, cap) => corpus.slice(0, cap),
			readValues: readerFor({ '1|deity': locators(10), '2|deity': locators(10) }),
		});
		expect(report.moreAvailable).toBe(false);
		expect(report.results.map((r) => r.sectionId)).toEqual([2]);
	});

	test('a required criterion the SEED lacks does not empty the results', async () => {
		// The gate asks "does the candidate have this?", not "do both sides?".
		// A worn, half-catalogued coin with an empty deity field is exactly the
		// object identification exists for; gating on the seed's own gap would
		// return nothing and explain nothing.
		const report = await findMatches({
			principal: ADMIN,
			componentGrant: grantAll,
			profile: profileWith([{ ...deity, required: true }, symbol]),
			seed: { sectionTipo: 'test3', sectionId: 1 },
			findPool: pool,
			readValues: readerFor({
				// seed records NO deity
				'1|symbol': locators(20),
				'2|deity': locators(10),
				'2|symbol': locators(20),
				'3|deity': locators(10),
				'3|symbol': locators(20),
			}),
		});
		expect(report.results.map((r) => r.sectionId).sort()).toEqual([2, 3]);
		expect(report.blindCriteria).toContain('deity');
	});

	test('a candidate with nothing comparable is absent, not a zero', async () => {
		const report = await findMatches({
			principal: ADMIN,
			componentGrant: grantAll,
			profile: profileWith([deity]),
			seed: { sectionTipo: 'test3', sectionId: 1 },
			findPool: async () => [{ sectionTipo: 'test3', sectionId: 2 }],
			readValues: readerFor({ '1|deity': locators(10) }), // candidate records nothing
		});
		expect(report.results).toEqual([]);
	});
});

/**
 * ACCESS. A match result QUOTES the other record's values back ("both
 * 'Athena'"), so an unscoped identification run is a read of every record the
 * profile's sections hold. Two independent gates, tested independently: the
 * principal reaches the pool QUERY (where the projects filter lives), and every
 * candidate is re-checked per record before it is read.
 */
describe('findMatches — access control', () => {
	const deity = {
		id: 'deity',
		label: 'Deity',
		path: [{ section_tipo: 'test3', component_tipo: 'deity' }],
		role: 'identifying',
		weight: 1,
	};
	const seed = { sectionTipo: 'test3', sectionId: 1 };
	const corpus = readerFor({
		'1|deity': locators(10),
		'2|deity': locators(10),
		'3|deity': locators(10),
	});

	/** An ACL that admits only the listed section_ids (the seed included). */
	function allowOnly(...ids: number[]): AccessFilter {
		return async (_principal, records: readonly CandidateRecord[]) =>
			records.filter((record) => ids.includes(record.sectionId));
	}

	test('the principal reaches the pool finder — the projects filter runs there or nowhere', async () => {
		// buildSearchSql applies the per-record projects filter ONLY when it is
		// given a principal; the pool query used to be built with no options at
		// all, which made every identification run an unscoped internal search.
		let seenPrincipal: Principal | undefined;
		await findMatches({
			principal: CURATOR,
			componentGrant: grantAll,
			profile: profileWith([deity]),
			seed,
			findPool: async (_profile, _values, _cap, principal) => {
				seenPrincipal = principal;
				return [];
			},
			readValues: corpus,
			filterAccessible: allowOnly(1),
		});
		expect(seenPrincipal).toBe(CURATOR);
	});

	test('a denied principal gets nothing — not a score, not a detail string', async () => {
		const report = await findMatches({
			principal: CURATOR,
			componentGrant: grantAll,
			profile: profileWith([deity]),
			seed,
			findPool: async () => [
				{ sectionTipo: 'test3', sectionId: 2 },
				{ sectionTipo: 'test3', sectionId: 3 },
			],
			readValues: corpus,
			filterAccessible: allowOnly(1), // the seed only: both candidates are denied
		});
		expect(report.results).toEqual([]);
	});

	test('an inaccessible candidate is never even READ', async () => {
		// The gate has to run BEFORE the read, not filter its output: the read is
		// what pulls the other record's values into memory.
		const readRecordIds: number[] = [];
		await findMatches({
			principal: CURATOR,
			componentGrant: grantAll,
			profile: profileWith([deity]),
			seed,
			findPool: async () => [
				{ sectionTipo: 'test3', sectionId: 2 },
				{ sectionTipo: 'test3', sectionId: 3 },
			],
			readValues: async (record, path) => {
				readRecordIds.push(record.sectionId);
				return corpus(record, path);
			},
			filterAccessible: allowOnly(1, 3),
		});
		expect(readRecordIds).toContain(3);
		expect(readRecordIds).not.toContain(2);
	});

	test('accessible candidates still score normally — the gate is a filter, not an off switch', async () => {
		const report = await findMatches({
			principal: CURATOR,
			componentGrant: grantAll,
			profile: profileWith([deity]),
			seed,
			findPool: async () => [
				{ sectionTipo: 'test3', sectionId: 2 },
				{ sectionTipo: 'test3', sectionId: 3 },
			],
			readValues: corpus,
			filterAccessible: allowOnly(1, 3),
		});
		expect(report.results.map((r) => r.sectionId)).toEqual([3]);
		expect(report.results[0]?.score).toBe(1);
	});

	test('a seed the principal cannot read is refused, not answered with an empty list', async () => {
		// "No matches" would be a lie about a record they may not open at all.
		await expect(
			findMatches({
				principal: CURATOR,
				componentGrant: grantAll,
				profile: profileWith([deity]),
				seed,
				findPool: async () => [{ sectionTipo: 'test3', sectionId: 2 }],
				readValues: corpus,
				filterAccessible: allowOnly(999),
			}),
		).rejects.toThrow(IdentifyAccessError);
	});

	test('the cap flag reports the CAP, never how much the ACL hid', async () => {
		// moreAvailable must not become an existence oracle: it answers "the cap
		// stopped us", which is true of the pool the search returned.
		const report = await findMatches({
			principal: CURATOR,
			componentGrant: grantAll,
			profile: profileWith([deity]),
			seed,
			poolCap: 1,
			// Honest fake, as above: the seed is in the rows and the limit is obeyed.
			findPool: async (_profile, _values, cap) =>
				[1, 2, 3].map((sectionId) => ({ sectionTipo: 'test3', sectionId })).slice(0, cap),
			readValues: corpus,
			filterAccessible: allowOnly(1), // everything hidden
		});
		expect(report.results).toEqual([]);
		expect(report.moreAvailable).toBe(true);
	});
});

/**
 * PER-COMPONENT GRANTS (finding B2).
 *
 * The record gate says the caller may OPEN the candidate. dd774 grants are
 * per-(section, component), and a match outcome QUOTES the component's value
 * back ("both 'Athena'"), frequently from a component in a different section
 * (a coin's legend lives on its Type). So the record gate is necessary and not
 * sufficient, and these cases pin the second question — asked through the ONE
 * shared rule, `core/identify/component_access.ts` criterionReadableOn.
 */
describe('findMatches — per-component grants', () => {
	const deity = {
		id: 'deity',
		label: 'Deity',
		path: [{ section_tipo: 'test3', component_tipo: 'deity' }],
		role: 'identifying',
		weight: 3,
	};
	const symbol = {
		id: 'symbol',
		label: 'Symbol',
		path: [{ section_tipo: 'test3', component_tipo: 'symbol' }],
		role: 'identifying',
		weight: 1,
	};
	/** The two-hop case the shared gate exists for: Coin → Type → Legend. */
	const legend = {
		id: 'legend',
		label: 'Type › Legend',
		path: [
			{ section_tipo: 'test3', component_tipo: 'toType' },
			{ section_tipo: 'test4', component_tipo: 'legend' },
		],
		role: 'identifying',
		weight: 1,
	};

	const seed = { sectionTipo: 'test3', sectionId: 1 };
	/** These cases are about the COMPONENT gate; the record gate has its own block. */
	const allowAll: AccessFilter = async (_principal, records) => [...records];
	const onePool = async () => [{ sectionTipo: 'test3', sectionId: 2 }];

	/** A dd774 gap: every component readable EXCEPT the named ones. */
	function grantExcept(...denied: string[]): ComponentGrant {
		return async (_principal, _sectionTipo, componentTipo) =>
			denied.includes(componentTipo) ? 0 : 1;
	}

	test('a denied criterion is never quoted — and never even read', async () => {
		const readPaths: string[] = [];
		const report = await findMatches({
			principal: CURATOR,
			filterAccessible: allowAll,
			componentGrant: grantExcept('symbol'),
			profile: profileWith([deity, symbol]),
			seed,
			findPool: onePool,
			readValues: async (record, path) => {
				readPaths.push(`${record.sectionId}|${path[path.length - 1]?.component_tipo}`);
				return readerFor({
					'1|deity': locators(10),
					'2|deity': locators(10),
					'1|symbol': text('Athena'),
					'2|symbol': text('Athena'),
				})(record, path);
			},
		});

		const outcome = report.results[0]?.outcomes.find((o) => o.criterionId === 'symbol');
		expect(outcome?.restricted).toBe(true);
		expect(outcome?.agreed).toBeNull();
		expect(outcome?.detail).not.toContain('Athena');
		// Nothing anywhere in the answer quotes the value, and the value was never
		// pulled out of the database in the first place — on the candidate OR on
		// the seed, whose read is what builds the pool query.
		expect(JSON.stringify(report)).not.toContain('Athena');
		expect(readPaths).not.toContain('2|symbol');
		expect(readPaths).not.toContain('1|symbol');
		// The run says it was partial. A different score with no label is the
		// failure mode option (a) has to answer for.
		expect(report.restrictedCriteria).toEqual(['symbol']);
	});

	test('the LEAF component is checked, not just the entry hop', async () => {
		// The entry component (`toType`) is readable — the caller may follow the
		// link. The component whose value would be quoted (`legend`, in another
		// section) is not.
		const report = await findMatches({
			principal: CURATOR,
			filterAccessible: allowAll,
			componentGrant: grantExcept('legend'),
			profile: profileWith([deity, legend]),
			seed,
			findPool: onePool,
			readValues: readerFor({
				'1|deity': locators(10),
				'2|deity': locators(10),
				'1|legend': text('SAECVLI'),
				'2|legend': text('SAECVLI'),
			}),
		});

		const outcome = report.results[0]?.outcomes.find((o) => o.criterionId === 'legend');
		expect(outcome?.restricted).toBe(true);
		expect(JSON.stringify(report)).not.toContain('SAECVLI');
		expect(report.restrictedCriteria).toEqual(['legend']);
	});

	test('a denied criterion is dropped from the RATIO, not scored as disagreement', async () => {
		// THE CHOSEN OPTION (a), asserted as a divergence: the pair below agrees on
		// the deity and DIFFERS on the symbol. A privileged caller sees 3/4; a
		// caller who may not read `symbol` sees 3/3, because a criterion they
		// cannot be shown was never achievable for them — the same rule absence
		// already gets. The candidate stays, and the report labels the run partial.
		const corpus = readerFor({
			'1|deity': locators(10),
			'2|deity': locators(10),
			'1|symbol': locators(20),
			'2|symbol': locators(99),
		});
		const input = {
			principal: CURATOR,
			filterAccessible: allowAll,
			profile: profileWith([deity, symbol]),
			seed,
			findPool: onePool,
			readValues: corpus,
		};

		const privileged = await findMatches({ ...input, componentGrant: grantAll });
		expect(privileged.results[0]?.score).toBe(0.75);
		expect(privileged.restrictedCriteria).toEqual([]);
		expect(privileged.results[0]?.outcomes.map((o) => o.restricted)).toEqual([
			undefined,
			undefined,
		]);
		// The full breakdown still quotes what agreed and what differed.
		expect(privileged.results[0]?.outcomes.find((o) => o.criterionId === 'symbol')?.agreed).toBe(
			false,
		);

		const restricted = await findMatches({ ...input, componentGrant: grantExcept('symbol') });
		expect(restricted.results[0]?.sectionId).toBe(2);
		expect(restricted.results[0]?.score).toBe(1);
		expect(restricted.restrictedCriteria).toEqual(['symbol']);
	});

	test('a candidate whose only agreement is a denied criterion is dropped', async () => {
		// Option (a) keeps the candidate — but its PRESENCE would then be the
		// disclosure: the pool was selected on the criteria, so "it is here at all,
		// and nothing I can read agrees" says it shares the value I may not see.
		const corpus = readerFor({
			'1|deity': locators(10),
			'2|deity': locators(10),
			'1|symbol': locators(20),
			'2|symbol': locators(99),
		});
		const input = {
			principal: CURATOR,
			filterAccessible: allowAll,
			profile: profileWith([deity, symbol]),
			seed,
			findPool: onePool,
			readValues: corpus,
		};

		const privileged = await findMatches({ ...input, componentGrant: grantAll });
		expect(privileged.results[0]?.score).toBe(0.75);

		const restricted = await findMatches({ ...input, componentGrant: grantExcept('deity') });
		expect(restricted.results).toEqual([]);
	});

	test('a required criterion the caller may not read drops the candidate', async () => {
		// The gate cannot be verified, and every candidate in the pool was selected
		// BY it — admitting them would answer "does this record share the value you
		// may not read?" with a yes.
		const report = await findMatches({
			principal: CURATOR,
			filterAccessible: allowAll,
			componentGrant: grantExcept('deity'),
			profile: profileWith([{ ...deity, required: true }, symbol]),
			seed,
			findPool: onePool,
			readValues: readerFor({
				'1|deity': locators(10),
				'2|deity': locators(10),
				'1|symbol': locators(20),
				'2|symbol': locators(20),
			}),
		});
		expect(report.results).toEqual([]);
	});

	test('a required criterion the seed is blind to gates nobody — so it drops nobody', async () => {
		// §5: a seed that lacks a required field does not empty the result set, so
		// that criterion is not a gate for a privileged caller either and a denial
		// on it is an ordinary restriction, not rule 2. Observable only across
		// SECTIONS: readable on the seed's (we can see it records nothing) and
		// denied on the candidate's. Denied on the SEED it stays a drop — an
		// unknown gate is not a passed one.
		const report = await findMatches({
			principal: CURATOR,
			filterAccessible: allowAll,
			componentGrant: async (_principal, sectionTipo, componentTipo) =>
				sectionTipo === 'test4' && componentTipo === 'deity' ? 0 : 1,
			profile: profileWith([{ ...deity, required: true }, symbol], {
				sectionTipos: ['test3', 'test4'],
			}),
			seed,
			findPool: async () => [{ sectionTipo: 'test4', sectionId: 2 }],
			readValues: readerFor({
				// the seed records no deity at all
				'2|deity': locators(10),
				'1|symbol': locators(20),
				'2|symbol': locators(20),
			}),
		});
		expect(report.results[0]?.sectionId).toBe(2);
		expect(report.blindCriteria).toEqual(['deity']);
		expect(report.restrictedCriteria).toEqual(['deity']);
	});

	test('a restricted criterion is not reported as blind', async () => {
		// `blindCriteria` means "the seed records nothing here" — a curatorial
		// statement about the data. Saying that about a criterion the caller merely
		// may not read would be a lie about the record.
		const report = await findMatches({
			principal: CURATOR,
			filterAccessible: allowAll,
			componentGrant: grantExcept('symbol'),
			profile: profileWith([deity, symbol]),
			seed,
			findPool: onePool,
			readValues: readerFor({
				'1|deity': locators(10),
				'2|deity': locators(10),
				'1|symbol': locators(20),
				'2|symbol': locators(20),
			}),
		});
		expect(report.blindCriteria).toEqual([]);
		expect(report.restrictedCriteria).toEqual(['symbol']);
	});

	test('the grant is asked once per (path, section), not once per candidate', async () => {
		// This runs per (criterion, candidate) over a pool of up to DEFAULT_POOL_CAP
		// records; re-asking would multiply the permission lookups by the pool size.
		const asked: string[] = [];
		await findMatches({
			principal: CURATOR,
			filterAccessible: allowAll,
			componentGrant: async (_principal, sectionTipo, componentTipo) => {
				asked.push(`${sectionTipo}|${componentTipo}`);
				return 1;
			},
			profile: profileWith([deity, symbol]),
			seed,
			findPool: async () => [2, 3, 4, 5].map((sectionId) => ({ sectionTipo: 'test3', sectionId })),
			readValues: readerFor({
				'1|deity': locators(10),
				'2|deity': locators(10),
				'3|deity': locators(10),
				'4|deity': locators(10),
				'5|deity': locators(10),
			}),
		});
		expect(asked).toEqual(['test3|deity', 'test3|symbol']);
	});
});
