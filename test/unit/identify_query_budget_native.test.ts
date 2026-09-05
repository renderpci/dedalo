/**
 * IDENTIFICATION'S READ COST — measured through the PRODUCTION seams (PERF-01 /
 * P2-11).
 *
 * WHY THIS GATE EXISTS, and why no existing identify gate covers it. Every
 * other test of `findMatches` INJECTS `findPool` / `readValues` /
 * `filterAccessible` (identify_match.test.ts and its siblings do, deliberately:
 * the scoring rules are pure logic and deserve to be tested as such). The
 * consequence is that the number of DATABASE STATEMENTS a real identification
 * issues was exercised by nothing at all — and it was quadratic-shaped in two
 * independent places:
 *
 *   1. the candidate ACL: `security/record_scope.ts` asked its projects
 *      predicate ONCE PER CANDIDATE (sanitizeClientSqo + buildSearchSql + one
 *      statement each), so a 500-record pool cost 500 round-trips;
 *   2. the criterion reader: `identify/path_read.ts` re-fetched a WHOLE matrix
 *      row per criterion, so an N-criterion profile read the seed's row N times
 *      and each candidate's row N times again.
 *
 * WHAT IS ASSERTED, and why it is a DIFFERENTIAL rather than one magic number.
 * A bare ceiling over one pool size is satisfied by any constant overhead a
 * warm cache happens to leave, and it rots the day an unrelated lookup joins
 * the path. The defect being gated is a SLOPE: how many extra statements each
 * extra candidate costs. So the same corpus is identified twice, at two pool
 * caps, and the difference must be EXACTLY the number of extra candidates —
 * one whole-row read each, and nothing else. Before the fix the slope was
 * 1 (ACL probe) + one per criterion (row re-read) per candidate.
 *
 * THE CALLER IS A NON-ADMIN, and that is load-bearing: `scopeRecordHits`
 * short-circuits a global admin entirely, so an admin-driven budget would never
 * touch the ACL leg this gate is about. The synthetic reader from
 * `acl_identity_fixture` holds exactly one project, and the corpus below is
 * built INTO that project (the `filter_projects_scope_native` /`mcp_tools`
 * idiom: test3's `test101` component_filter carrying the project locator).
 *
 * The corpus is the gate's OWN — scratch `test3` records in the reserved band,
 * carrying a nonce nobody else holds, so the pool query selects these records
 * and only these records whatever else the suite database contains.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { findMatches } from '../../src/core/identify/match.ts';
import type { Criterion, IdentificationProfile } from '../../src/core/identify/types.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import {
	ACL_NON_ADMIN_USER_ID,
	ACL_PROJECT_ID,
	installAclIdentityFixture,
	removeAclIdentityFixture,
} from '../helpers/acl_identity_fixture.ts';
import { DB_READY } from '../helpers/db_ready.ts';
import { expectQueryBudget } from '../helpers/query_budget.ts';
import {
	cleanScratchRecord,
	createScratchRecord,
	ensureCanonicalTest3,
} from '../helpers/test_data.ts';

/** The playground section, its literal components and its project filter. */
const SECTION = 'test3';
/**
 * THE ONE COMPONENT THE READER MAY READ, and the reason all three criteria name
 * it. `acl_identity_fixture`'s reader profile grants exactly `test3` (level 1)
 * and `test3.test92` (level 1); every other component answers 0, and a criterion
 * on a denied component is never read at all — the gate would then measure a
 * flow that touches no row. What this budget counts is the number of WHOLE-ROW
 * READS, which depends on how many criteria walk a record, never on which
 * component each of them names, so three criteria over one granted component
 * measure exactly what a curator's three-component profile costs.
 */
const CRITERION_COMPONENT = 'test92';
const FILTER_COMPONENT = 'test101';
const PROJECTS_SECTION = 'dd153';
const PROJECT_LOCATOR_TYPE = 'dd675';

/** Scratch ids this gate owns (reserved ≥ 900000 band; the seed sorts first). */
const SEED_ID = 941201;
const CANDIDATE_IDS = [
	941202, 941203, 941204, 941205, 941206, 941207, 941208, 941209, 941210, 941211,
];

/**
 * The value every record in this corpus shares — and nothing else in the
 * database does. It is what makes the pool query select exactly this corpus.
 */
const NONCE_TARGET_SECTION = 'dd64';
const NONCE_TARGET_ID = '941299';

const READER: Principal = {
	userId: ACL_NON_ADMIN_USER_ID,
	isGlobalAdmin: false,
	isDeveloper: false,
};

function criterion(id: string, componentTipo: string): Criterion {
	return {
		id,
		label: id,
		path: [{ section_tipo: SECTION, component_tipo: componentTipo }],
		role: 'identifying',
		weight: 1,
		mode: 'same_locator',
		required: false,
	};
}

/**
 * THREE criteria, deliberately: the row re-read this gate measures was once per
 * criterion, so a one-criterion profile could not tell the fixed cost from the
 * repeated one.
 */
const PROFILE: IdentificationProfile = {
	id: 'identify_query_budget',
	label: 'query budget profile',
	sectionTipos: [SECTION],
	typeSectionTipo: null,
	previewComponent: null,
	criteria: [
		criterion('first', CRITERION_COMPONENT),
		criterion('second', CRITERION_COMPONENT),
		criterion('third', CRITERION_COMPONENT),
	],
	thresholds: { sameType: 0.9, candidate: 0.5 },
	exactSetIdentity: false,
};

function projectLocator() {
	return [
		{
			id: 1,
			type: PROJECT_LOCATOR_TYPE,
			section_id: String(ACL_PROJECT_ID),
			section_tipo: PROJECTS_SECTION,
			from_component_tipo: FILTER_COMPONENT,
		},
	];
}

async function createCorpusRecord(sectionId: number): Promise<void> {
	await createScratchRecord(SECTION, sectionId, {
		relation: {
			[FILTER_COMPONENT]: projectLocator(),
			// The shared identifying value: a locator nothing else in the database
			// points at, so the pool query selects this corpus and only it.
			[CRITERION_COMPONENT]: [
				{
					id: 1,
					type: 'dd63',
					section_id: NONCE_TARGET_ID,
					section_tipo: NONCE_TARGET_SECTION,
					from_component_tipo: CRITERION_COMPONENT,
				},
			],
		},
	});
}

const ALL_IDS = [SEED_ID, ...CANDIDATE_IDS];

beforeAll(async () => {
	// Guarded rather than early-returned: the hooks must not touch a database
	// that is not there, and a bare `return` in a body is what the anti-vacuity
	// law refuses.
	if (DB_READY) {
		await ensureCanonicalTest3();
		await installAclIdentityFixture();
		for (const id of ALL_IDS) await createCorpusRecord(id);
	}
});

afterAll(async () => {
	if (DB_READY) {
		for (const id of ALL_IDS) await cleanScratchRecord(SECTION, id);
		await removeAclIdentityFixture();
	}
});

/** One identification of the scratch seed, through the PRODUCTION seams. */
function identify(poolCap: number) {
	return findMatches({
		profile: PROFILE,
		seed: { sectionTipo: SECTION, sectionId: SEED_ID },
		principal: READER,
		poolCap,
	});
}

const SMALL_CAP = 2;
const LARGE_CAP = 8;

/**
 * The whole shape of one identification, DERIVED rather than pinned as a
 * number: one pool query, one scope probe for the seed and one for the pool
 * (both batched — a chunk covers up to 200 records), and one whole-row read per
 * record (the seed plus each candidate), memoized across the criteria. Two
 * statements of slack for the ambient lookups this gate does not pin
 * (permissions, ontology) on a cold cache.
 *
 * Measured green at exactly `candidates + 4`; the slope leg below is the
 * exact one, this ceiling is what catches a regression that inflates the
 * CONSTANT half instead of the per-candidate half.
 */
function ceilingFor(candidates: number): number {
	return 1 + 2 + (candidates + 1) + 2;
}

describe.if(DB_READY)('identification reads are batched and memoized (PERF-01)', () => {
	test('the corpus is real, visible to the non-admin reader, and scored through the production seams', async () => {
		// Warm every ambient cache (ontology tables, permissions, descriptors) so
		// the two measurements below differ only by the corpus.
		// THE CORPUS FLOOR, first: every assertion below is about a scored pool,
		// and a pool that was never built satisfies all of them. The corpus must
		// also EXCEED the large cap, or the cap stops being the thing that decides
		// how many candidates are scored.
		expect(CANDIDATE_IDS.length).toBeGreaterThan(LARGE_CAP);
		const warm = await identify(LARGE_CAP);
		expect(warm.results.length, 'the reader must actually score candidates').toBe(LARGE_CAP);
		expect(warm.restrictedCriteria, 'every criterion must be readable, or nothing is read').toEqual(
			[],
		);
		expect(
			warm.blindCriteria,
			'the seed must hold all three values, or no comparison happens',
		).toEqual([]);
		for (const result of warm.results) {
			expect(result.sectionTipo).toBe(SECTION);
			expect(CANDIDATE_IDS).toContain(result.sectionId);
			expect(result.score).toBe(1);
		}
	});

	test('each extra candidate costs exactly ONE statement — the pool ACL is one query, the row read is memoized', async () => {
		const { report: small } = await expectQueryBudget(
			`findMatches over ${SMALL_CAP} candidates`,
			{ ceiling: ceilingFor(SMALL_CAP), corpus: SMALL_CAP },
			() => identify(SMALL_CAP),
		);
		const { report: large } = await expectQueryBudget(
			`findMatches over ${LARGE_CAP} candidates`,
			{ ceiling: ceilingFor(LARGE_CAP), corpus: LARGE_CAP },
			() => identify(LARGE_CAP),
		);

		// THE SLOPE. Per extra candidate: one row read, memoized across the three
		// criteria, and NO extra ACL statement (the projects probe covers the whole
		// pool in one). Before PERF-01 this difference was 4 per candidate.
		expect(
			large.count - small.count,
			`identification cost ${large.count} statements for ${LARGE_CAP} candidates and ${small.count} for ${SMALL_CAP}: ` +
				`${large.count - small.count} extra statements for ${LARGE_CAP - SMALL_CAP} extra candidates, expected exactly one each. ` +
				'A slope above 1 means either the candidate ACL went back to one probe per hit (record_scope.ts) or the criterion ' +
				'reader lost its row memo (path_read.ts / the runWithRecordMemo scope findMatches opens).',
		).toBe(LARGE_CAP - SMALL_CAP);
	});
});
