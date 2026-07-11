/**
 * RELATIONS_SPEC.md Phase E units — the relation-family search fragments:
 *
 * 1. The _tm TWIN (PHP trait.search_component_relation_common_tm): on the
 *    matrix_time_machine table every operator emits scalar user_id SQL —
 *    SQL-string pinned (the search_Test pattern).
 * 2. The registry SEARCH face: relation-column models dispatch to the shared
 *    containment builder; children/index/external THROW their ledger reason.
 * 3. The CORRECT autocomplete_hi ancestor wrap
 *    (buildRelationSearchAncestorFragment — deliberately NOT live, PHP
 *    defect pin): executed directly against the shared DB, an ancestor
 *    locator present ONLY in relation_search matches the record.
 * 4. search_related filter_by_locators_op 'AND': intersection semantics on
 *    the real §15657 fixture (holds BOTH object1/99 and object1/96 via
 *    numisdata34).
 */

import { describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { getRelationSearchFragmentBuilder } from '../../src/core/relations/registry.ts';
import {
	buildRelationFragment,
	buildRelationSearchAncestorFragment,
} from '../../src/core/search/builders/builder_relation.ts';
import { buildRelationChildrenFragment } from '../../src/core/search/builders/builder_relation_children.ts';
import { buildRelationIndexFragment } from '../../src/core/search/builders/builder_relation_index.ts';
import type { BuilderContext } from '../../src/core/search/builders/types.ts';
import { ParamsCollector } from '../../src/core/search/params.ts';
import { findInverseReferences } from '../../src/core/search/search_related.ts';

const tmContext: BuilderContext = {
	alias: 'tm',
	column: 'relation',
	tipo: 'dd578', // the TM envelope's user portal
	sectionTipo: 'dd15',
	table: 'matrix_time_machine',
	lang: 'lg-nolan',
	translatable: false,
	model: 'component_portal',
};

/** test3's component_relation_children (paired parent test71, table matrix_test). */
const childrenContext: BuilderContext = {
	alias: 'te3',
	column: 'relation',
	tipo: 'test201',
	sectionTipo: 'test3',
	table: 'matrix_test',
	lang: 'lg-nolan',
	translatable: false,
	model: 'component_relation_children',
};

/** Render a fragment to {sql, params} for SQL-string pinning. */
function render(result: ReturnType<typeof buildRelationFragment>): {
	sql: string;
	params: unknown[];
} {
	const collector = new ParamsCollector();
	if (result === false) return { sql: '', params: [] };
	if (result.kind === 'fragment') {
		return {
			sql: collector.substitute(result.sentence, result.tokenValues),
			params: collector.toArray(),
		};
	}
	const parts = result.items.map((item) => {
		if (item === false || item.kind !== 'fragment') return '';
		return collector.substitute(item.sentence, item.tokenValues);
	});
	const joiner = result.op === '$and' ? ' AND ' : ' OR ';
	return { sql: `( ${parts.join(joiner)} )`, params: collector.toArray() };
}

describe('_tm twin (matrix_time_machine scalar user_id column)', () => {
	test("default '==' resolves the locator's section_id to user_id =", () => {
		const { sql: rendered, params } = render(
			buildRelationFragment([{ section_tipo: 'dd128', section_id: '1' }], null, tmContext),
		);
		expect(rendered).toBe('tm.user_id = $1');
		expect(params).toEqual(['1']);
	});

	test("'!=' and '!==' are identical on the scalar column", () => {
		for (const operator of ['!=', '!==']) {
			const { sql: rendered, params } = render(
				buildRelationFragment([{ section_tipo: 'dd128', section_id: 7 }], operator, tmContext),
			);
			expect(rendered).toBe('tm.user_id != $1');
			expect(params).toEqual(['7']);
		}
	});

	test("'!*' / '*' are NULL checks", () => {
		expect(render(buildRelationFragment(null, '!*', tmContext)).sql).toBe('tm.user_id IS NULL');
		expect(render(buildRelationFragment(null, '*', tmContext)).sql).toBe('tm.user_id IS NOT NULL');
	});

	test('a q JSON STRING decodes (the PHP wire shape)', () => {
		const { sql: rendered, params } = render(
			buildRelationFragment('{"section_id": 3}', null, tmContext),
		);
		expect(rendered).toBe('tm.user_id = $1');
		expect(params).toEqual(['3']);
	});
});

describe('registry search face', () => {
	test('the relation family shares the containment builder', async () => {
		for (const model of ['component_portal', 'component_select', 'component_relation_related']) {
			const builder = await getRelationSearchFragmentBuilder(model);
			expect(builder).toBe(buildRelationFragment);
		}
	});

	test('children/index dispatch to their DEDICATED pipelines (ported 2026-07-10)', async () => {
		expect(await getRelationSearchFragmentBuilder('component_relation_children')).toBe(
			buildRelationChildrenFragment,
		);
		expect(await getRelationSearchFragmentBuilder('component_relation_index')).toBe(
			buildRelationIndexFragment,
		);
	});

	test('external still THROWS — the faithful port of a PHP fatal', async () => {
		expect(getRelationSearchFragmentBuilder('component_external')).rejects.toThrow(
			/not searchable/,
		);
	});
});

describe('relation_children builder (PHP trait.search_component_relation_children)', () => {
	const scanShape = /EXISTS \(SELECT 1 FROM "matrix_test" AS sub CROSS JOIN LATERAL/;

	test("default '==' emits the specific-child EXISTS; repeated _Q1_ collapses to ONE param", async () => {
		const result = await buildRelationChildrenFragment(
			{ section_tipo: 'test3', section_id: '5', id: 'dom-77' },
			null,
			childrenContext,
		);
		const { sql: rendered, params } = render(result as Exclude<typeof result, Promise<unknown>>);
		expect(rendered).toMatch(scanShape);
		expect(rendered).toContain("elem->>'section_id' = te3.section_id::text");
		expect(rendered).toContain("sub.section_id::text = ($2::text::jsonb->>'section_id')");
		// _Q1_ appears 3× in the sentence but binds ONCE (ParamsCollector dedup).
		expect(params).toEqual(['test71', '{"section_tipo":"test3","section_id":"5"}']);
	});

	test("'!*' / '*' are the parent-has-children scans (no _Q2_)", async () => {
		const empty = render(
			(await buildRelationChildrenFragment(null, '!*', childrenContext)) as never,
		);
		expect(empty.sql).toMatch(/^NOT EXISTS \(/);
		expect(empty.params).toEqual(['test71']);
		const notEmpty = render(
			(await buildRelationChildrenFragment(null, '*', childrenContext)) as never,
		);
		expect(notEmpty.sql).toMatch(/^EXISTS \(/);
		expect(notEmpty.params).toEqual(['test71']);
	});

	test("'!=' = has-children AND not-this-child; '!==' = single NOT EXISTS", async () => {
		const q = { section_tipo: 'test3', section_id: '9' };
		const different = render(
			(await buildRelationChildrenFragment(q, '!=', childrenContext)) as never,
		);
		expect(different.sql).toMatch(/^EXISTS \(.+\) AND NOT EXISTS \(/);
		const strict = render(
			(await buildRelationChildrenFragment(q, '!==', childrenContext)) as never,
		);
		expect(strict.sql).toMatch(/^NOT EXISTS \(/);
		expect(strict.sql).not.toContain(') AND NOT EXISTS (');
	});

	test("invalid q becomes '[]' — the clause RUNS and matches nothing (never dropped)", async () => {
		const result = await buildRelationChildrenFragment('garbage', null, childrenContext);
		const { params } = render(result as never);
		expect(params).toEqual(['test71', '[]']);
	});

	test('multi-locator arrays throw cleanly (PHP emits invalid jsonb)', async () => {
		expect(
			buildRelationChildrenFragment(
				[
					{ section_tipo: 'test3', section_id: '1' },
					{ section_tipo: 'test3', section_id: '2' },
				],
				null,
				childrenContext,
			),
		).rejects.toThrow(/multi-locator/);
	});

	test('unpaired components drop the clause (false); matrix_time_machine throws', async () => {
		// numisdata77 is a portal — no paired component_relation_parent.
		expect(
			await buildRelationChildrenFragment(null, '*', {
				...childrenContext,
				tipo: 'numisdata77',
				sectionTipo: 'numisdata3',
				table: 'matrix',
			}),
		).toBe(false);
		expect(
			buildRelationChildrenFragment(null, '*', {
				...childrenContext,
				table: 'matrix_time_machine',
			}),
		).rejects.toThrow(/time-machine/);
	});
});

describe('relation_index builder (PHP trait.search_component_relation_index)', () => {
	const indexContext: BuilderContext = {
		alias: 'h1',
		column: 'relation',
		tipo: 'hierarchy40',
		sectionTipo: 'tema1',
		table: 'matrix_hierarchy',
		lang: 'lg-nolan',
		translatable: false,
		model: 'component_relation_index',
	};

	test("'*' emits a literal intval'd IN list over the dd96 references (tema1 has many)", async () => {
		const result = await buildRelationIndexFragment(null, '*', indexContext);
		const { sql: rendered, params } = render(result as never);
		expect(rendered).toMatch(/^h1\.section_id IN \(\d+(,\d+)*\)$/);
		expect(params).toEqual([]); // zero params — PHP interpolates intval'd ids
	});

	test("'!*' emits NOT IN over the same set", async () => {
		const result = await buildRelationIndexFragment(null, '!*', indexContext);
		const { sql: rendered } = render(result as never);
		expect(rendered).toMatch(/^h1\.section_id NOT IN \(\d+(,\d+)*\)$/);
	});

	test('a reference-less section degenerates to 1=0 / 1=1 (PHP :184/:225)', async () => {
		const bare = { ...indexContext, tipo: 'test149', sectionTipo: 'test65', table: 'matrix_test' };
		expect(render((await buildRelationIndexFragment(null, '*', bare)) as never).sql).toBe('1=0');
		expect(render((await buildRelationIndexFragment(null, '!*', bare)) as never).sql).toBe('1=1');
	});

	test('any other operator drops the clause (PHP returns the SQO sentence-less)', async () => {
		for (const operator of [null, '==', '!=', '!==']) {
			expect(await buildRelationIndexFragment(null, operator, indexContext)).toBe(false);
		}
	});

	test('matrix_time_machine throws (no _tm twin exists)', async () => {
		expect(
			buildRelationIndexFragment(null, '*', { ...indexContext, table: 'matrix_time_machine' }),
		).rejects.toThrow(/time-machine/);
	});
});

describe('autocomplete_hi ancestor wrap (correct machinery, unit-gated — NOT live)', () => {
	test('an ancestor locator present ONLY in relation_search matches through the wrap', async () => {
		// A real maintained index row: numisdata155's relation_search on
		// numisdata4 holds ancestor locators the relation column does NOT.
		const rows = (await sql.unsafe(
			`SELECT section_id, relation_search->'numisdata155'->0 AS ancestor
			 FROM matrix
			 WHERE section_tipo = 'numisdata4' AND relation_search ? 'numisdata155'
			 LIMIT 1`,
			[],
		)) as { section_id: number; ancestor: Record<string, unknown> | null }[];
		const fixture = rows[0];
		if (fixture === undefined || fixture.ancestor === null) {
			throw new Error('fixture missing: no maintained relation_search rows on numisdata4');
		}

		const context: BuilderContext = {
			alias: 'm',
			column: 'relation',
			tipo: 'numisdata155',
			sectionTipo: 'numisdata4',
			table: 'matrix',
			lang: 'lg-nolan',
			translatable: false,
			model: 'component_portal',
		};
		const wrapped = buildRelationSearchAncestorFragment([fixture.ancestor], null, context);
		const { sql: whereSql, params } = render(wrapped);
		expect(whereSql).toContain('relation_search');

		const counted = (await sql.unsafe(
			`SELECT count(*)::int AS total FROM matrix m
			 WHERE m.section_tipo = 'numisdata4' AND m.section_id = ${Number(fixture.section_id)} AND ${whereSql}`,
			params as string[],
		)) as { total: number }[];
		expect(counted[0]?.total).toBe(1);

		// The UNWRAPPED (live, PHP-parity) clause does NOT match — proving the
		// wrap is what recovers ancestor hits.
		const direct = buildRelationFragment([fixture.ancestor], null, context);
		const { sql: directSql, params: directParams } = render(direct);
		const directCount = (await sql.unsafe(
			`SELECT count(*)::int AS total FROM matrix m
			 WHERE m.section_tipo = 'numisdata4' AND m.section_id = ${Number(fixture.section_id)} AND ${directSql}`,
			directParams as string[],
		)) as { total: number }[];
		expect(directCount[0]?.total).toBe(0);
	});
});

describe("search_related filter_by_locators_op 'AND'", () => {
	const both = [
		{ section_tipo: 'object1', section_id: 99, from_component_tipo: 'numisdata34' },
		{ section_tipo: 'object1', section_id: 96, from_component_tipo: 'numisdata34' },
	];

	test('AND returns the intersection (a strict subset of OR here)', async () => {
		const orHits = await findInverseReferences(both, { limit: false, order: 'section_id' });
		const andHits = await findInverseReferences(both, {
			limit: false,
			order: 'section_id',
			op: 'AND',
		});
		expect(andHits.length).toBeGreaterThan(0); // §15657 holds both targets
		expect(andHits.length).toBeLessThan(orHits.length);
		const orKeys = new Set(orHits.map((hit) => `${hit.section_tipo}_${hit.section_id}`));
		for (const hit of andHits) {
			expect(orKeys.has(`${hit.section_tipo}_${hit.section_id}`)).toBe(true);
		}
		expect(
			andHits.some((hit) => hit.section_tipo === 'numisdata3' && hit.section_id === 15657),
		).toBe(true);
	});
});
