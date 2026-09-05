/**
 * THE relation_index SEARCH IS A SEMI-JOIN, NOT A MATERIALISED ID LIST
 * (audit PERF-05).
 *
 * `builder_relation_index.ts` answers the only two operators a
 * component_relation_index search has: `*` (this section's records that ARE
 * indexed by a dd96 locator) and `!*` (the orphans). It used to answer them by
 * fetching EVERY inverse dd96 reference into the process, deduping the ids in
 * JS and inlining them into the statement TEXT — on a museum corpus, the whole
 * indexation table on the wire and a megabyte-class SQL string no plan cache
 * can reuse. It is now ONE uncorrelated subselect over matrix_relation_index.
 *
 * WHY THIS IS NOT A WIRE CHANGE. The retired shape's header called the
 * inlined literals a parity requirement ("intval'd LITERALS exactly like PHP")
 * — a parity argument for an oracle that has been dead since the cutover. The
 * ROWS are what the wire carries, and the equivalence leg below proves those
 * are identical by EXECUTING both shapes against the same corpus and comparing
 * the id sets, for both operators. A plan change, not a contract change.
 *
 * THE EMPTY CASES need no `1=0` / `1=1` special-casing any more, and the leg
 * below is what says so rather than the comment: over a section with no dd96
 * locators at all, `*` selects nothing and `!*` selects everything — which is
 * what an empty semi-join does by itself.
 *
 * CORPUS: the museum-scale scratch corpus (two dd96 locators, 1,220 records)
 * plus a small dd96-FREE scratch section for the empty case. Both are built
 * here and torn down (residue asserted 0).
 */

import { afterAll, beforeAll, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { runWithQueryTap } from '../../src/core/db/query_tap.ts';
import { buildRelationIndexFragment } from '../../src/core/search/builders/builder_relation_index.ts';
import type { BuilderContext, BuilderResult } from '../../src/core/search/builders/types.ts';
import { ParamsCollector } from '../../src/core/search/params.ts';
import { findInverseReferenceLocators } from '../../src/core/search/search_related.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import {
	ZZSCALE_INDEX_RELATION_TYPE,
	ZZSCALE_INDEX_TARGET_IDS,
	ZZSCALE_SECTION,
	ZZSCALE_TOTAL_RECORDS,
} from '../../src/core/test_data/situations/zzscale_constants.ts';
import {
	dropZzScaleCorpus,
	ensureZzScaleCorpus,
} from '../../src/core/test_data/situations/zzscale_corpus.ts';

const TABLE = 'matrix_test';
const ALIAS = 'h1';

/** The dd96-FREE section for the empty case. */
const EMPTY_TLD = 'zzsj';
const EMPTY_SECTION = 'zzsj1';
const EMPTY_RECORD_IDS = [1, 2, 3];

const EMPTY_SITUATION = situation({
	tld: EMPTY_TLD,
	name: 'relation_index empty case',
	nodes: [
		{
			tipo: EMPTY_SECTION,
			parent: 'test1',
			model: 'section',
			term: { 'lg-eng': 'zzsj no indexation' },
		},
	],
	records: EMPTY_RECORD_IDS.map((section_id) => ({ section_tipo: EMPTY_SECTION, section_id })),
});

function contextFor(sectionTipo: string): BuilderContext {
	return {
		alias: ALIAS,
		column: 'relation',
		tipo: `${sectionTipo}_index`,
		sectionTipo,
		table: TABLE,
		lang: 'lg-nolan',
		translatable: false,
		model: 'component_relation_index',
	};
}

function render(result: BuilderResult): { sql: string; params: unknown[] } {
	if (result === false || result.kind !== 'fragment') return { sql: '', params: [] };
	const collector = new ParamsCollector();
	return {
		sql: collector.substitute(result.sentence, result.tokenValues),
		params: collector.toArray(),
	};
}

/** Run a WHERE fragment against the scratch table and return the matched ids. */
async function idsMatching(
	sectionTipo: string,
	whereSql: string,
	params: unknown[],
): Promise<number[]> {
	const rows = (await sql.unsafe(
		`SELECT ${ALIAS}.section_id FROM "${TABLE}" ${ALIAS}
		 WHERE ${ALIAS}.section_tipo = $${params.length + 1} AND (${whereSql})
		 ORDER BY ${ALIAS}.section_id`,
		[...params, sectionTipo],
	)) as { section_id: number }[];
	return rows.map((row) => Number(row.section_id));
}

/** The RETIRED shape, rebuilt here as the reference implementation. */
async function materialisedShape(sectionTipo: string, operator: '*' | '!*'): Promise<string> {
	const hits = await findInverseReferenceLocators(
		[{ type: ZZSCALE_INDEX_RELATION_TYPE, section_tipo: sectionTipo }],
		{ limit: false, order: 'section_id' },
	);
	const referenced = new Set<number>();
	for (const hit of hits) {
		const id = Number((hit.locator_data as { section_id?: unknown }).section_id);
		if (Number.isInteger(id)) referenced.add(id);
	}
	if (referenced.size === 0) return operator === '*' ? '1=0' : '1=1';
	const list = [...referenced].join(',');
	return `${ALIAS}.section_id ${operator === '*' ? 'IN' : 'NOT IN'} (${list})`;
}

beforeAll(async () => {
	await ensureZzScaleCorpus();
	await ensureSituation(EMPTY_SITUATION);
}, 180000);

afterAll(async () => {
	expect(await dropZzScaleCorpus()).toBe(0);
	expect(await dropSituation(EMPTY_SITUATION)).toBe(0);
}, 180000);

test('the fragment is an uncorrelated semi-join with BOUND params — no inlined ids', async () => {
	const { sql: rendered, params } = render(
		await buildRelationIndexFragment(null, '*', contextFor(ZZSCALE_SECTION)),
	);
	expect(rendered).toContain('matrix_relation_index');
	expect(rendered).toStartWith(`${ALIAS}.section_id IN (SELECT`);
	// Values travel as parameters, and the section/type are exactly those two.
	expect(params).toEqual([ZZSCALE_SECTION, ZZSCALE_INDEX_RELATION_TYPE]);
	// The defect, stated as an assertion: no id list in the statement text.
	expect(rendered).not.toMatch(/IN \(\s*\d/);
	expect(rendered.length).toBeLessThan(400);
});

test('EQUIVALENCE — the semi-join selects exactly the rows the id list did', async () => {
	// The corpus floor: this is a real, non-trivial section (1,220 records) with
	// a real, non-empty indexation census.
	expect(ZZSCALE_TOTAL_RECORDS).toBeGreaterThan(1000);
	expect(ZZSCALE_INDEX_TARGET_IDS.length).toBeGreaterThan(0);

	for (const operator of ['*', '!*'] as const) {
		const semi = render(
			await buildRelationIndexFragment(null, operator, contextFor(ZZSCALE_SECTION)),
		);
		const semiIds = await idsMatching(ZZSCALE_SECTION, semi.sql, semi.params);
		const listIds = await idsMatching(
			ZZSCALE_SECTION,
			await materialisedShape(ZZSCALE_SECTION, operator),
			[],
		);
		expect(semiIds, `operator ${operator}: the two shapes disagree`).toEqual(listIds);
	}

	// …and the sets are the RIGHT ones, not merely equal to each other.
	const indexed = render(await buildRelationIndexFragment(null, '*', contextFor(ZZSCALE_SECTION)));
	expect(await idsMatching(ZZSCALE_SECTION, indexed.sql, indexed.params)).toEqual(
		[...ZZSCALE_INDEX_TARGET_IDS].sort((a, b) => a - b),
	);
	const orphans = render(await buildRelationIndexFragment(null, '!*', contextFor(ZZSCALE_SECTION)));
	expect((await idsMatching(ZZSCALE_SECTION, orphans.sql, orphans.params)).length).toBe(
		ZZSCALE_TOTAL_RECORDS - ZZSCALE_INDEX_TARGET_IDS.length,
	);
});

test('the EMPTY case needs no 1=0 / 1=1: an empty semi-join answers both', async () => {
	const empty = contextFor(EMPTY_SECTION);
	const indexed = render(await buildRelationIndexFragment(null, '*', empty));
	expect(indexed.sql).not.toBe('1=0');
	expect(await idsMatching(EMPTY_SECTION, indexed.sql, indexed.params)).toEqual([]);

	const orphans = render(await buildRelationIndexFragment(null, '!*', empty));
	expect(orphans.sql).not.toBe('1=1');
	expect(await idsMatching(EMPTY_SECTION, orphans.sql, orphans.params)).toEqual(EMPTY_RECORD_IDS);
});

test('building the fragment does NOT read the references (cost is constant)', async () => {
	// Warm the coverage probe / relation-table resolution (once per process).
	await buildRelationIndexFragment(null, '*', contextFor(ZZSCALE_SECTION));
	expect(ZZSCALE_TOTAL_RECORDS).toBeGreaterThan(1000); // the corpus floor

	const built = await runWithQueryTap('relation_index fragment build', async () =>
		buildRelationIndexFragment(null, '*', contextFor(ZZSCALE_SECTION)),
	);
	// ZERO statements: the predicate is assembled from the section tipo and the
	// locator type, and the database resolves the set when the search runs.
	expect(built.report.count).toBe(0);
	expect(render(built.result).sql).toContain('matrix_relation_index');

	// The reference implementation — the shape this replaced — pays to read the
	// references before it can even write the WHERE clause. That is the
	// in-gate control: a zero above only means something next to a non-zero here.
	const materialised = await runWithQueryTap('materialised id list', async () =>
		materialisedShape(ZZSCALE_SECTION, '*'),
	);
	expect(materialised.report.count).toBeGreaterThan(0);
});

test('the operator and time-machine contracts are unchanged', async () => {
	for (const operator of [null, '==', '!=', '!==']) {
		expect(await buildRelationIndexFragment(null, operator, contextFor(ZZSCALE_SECTION))).toBe(
			false,
		);
	}
	// An unresolvable leaf section still contributes nothing.
	expect(await buildRelationIndexFragment(null, '*', contextFor(''))).toBe(false);
	expect(
		buildRelationIndexFragment(null, '*', {
			...contextFor(ZZSCALE_SECTION),
			table: 'matrix_time_machine',
		}),
	).rejects.toThrow(/time-machine/);
});
