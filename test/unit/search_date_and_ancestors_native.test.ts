/**
 * Two SILENT wrong-answer gates (audits/2026-08_oh1_beta REPORT §5.5). Both
 * bugs returned FEWER rows than PHP with no error — the worst failure mode for
 * a research archive, because the curator cannot tell.
 *
 * 1. PARTIAL-DATE SEARCH. The ordinary (JSONB) date branch emitted ONE
 *    `@.start.time == <first second of the typed period>` predicate, so a
 *    year-only search matched only records stamped exactly on 1 January of that
 *    year — 0 of 29 matching `oh1` records on the live install. PHP
 *    (trait.search_component_date.php resolve_date_mode_date_range_sql) builds
 *    an INTERVAL OVERLAP against the period's end
 *    (component_date::get_final_search_range_seconds), and its `>` / `<=`
 *    compare against that end, not its start.
 *
 * 2. THESAURUS BROADER-TERM SEARCH. The `relation_search` ancestor index is
 *    written on every legacy `component_autocomplete_hi` save
 *    (relations/save.ts maintainRelationSearchIndex) but was NEVER read:
 *    `buildRelationSearchAncestorFragment` was dead code. Searching a BROADER
 *    term therefore missed every record filed under a narrower one — PHP
 *    (trait.search_component_relation_common.php add_relation_search) consults
 *    both columns in one pass.
 *
 * Both halves assert against REAL stored rows through the REAL conform → render
 * path, not against hand-built SQL: a shape pin alone would not have caught
 * either bug. The date half reads the canonical `matrix_test` fixture and
 * writes nothing. The ancestor half PLANTS TWO SCRATCH RECORDS on `matrix_test`
 * (section_tipo `test3`, section_ids 998801 and 998802 — see the block comment
 * above `beforeAll`) and DELETEs them in `afterAll`: the shapes it needs
 * (a narrow term with its parent chain indexed; a hierarchy ROOT term with the
 * `relation_search` key deleted) do not exist in the canonical playground, and
 * asserting against the live archive is forbidden. `matrix_test` is a scratch
 * surface; nothing else in the tree is written.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { SqoFilterLeaf, SqoFilterNode } from '../../src/core/concepts/sqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { buildDateFragment } from '../../src/core/search/builders/builder_date.ts';
import type { BuilderContext } from '../../src/core/search/builders/types.ts';
import { conformFilter } from '../../src/core/search/conform.ts';
import { ParamsCollector } from '../../src/core/search/params.ts';
import { renderConformedFilter } from '../../src/core/search/sql_assembler.ts';

/** Conform one SQO node and render it to `{sql, params}` (the live pipeline). */
async function conformToSql(
	filter: SqoFilterLeaf | SqoFilterNode,
	alias: string,
	table: string,
): Promise<{ sql: string; params: unknown[] }> {
	const conformed = await conformFilter(filter as Record<string, unknown>, alias, table);
	const params = new ParamsCollector();
	return { sql: renderConformedFilter(conformed, params), params: params.toArray() };
}

/** Run a rendered WHERE fragment against a table and return the matching ids. */
async function idsMatching(
	table: string,
	alias: string,
	sectionTipo: string,
	where: { sql: string; params: unknown[] },
): Promise<number[]> {
	const rows = (await sql.unsafe(
		`SELECT ${alias}.section_id FROM ${table} AS ${alias}
		 WHERE ${alias}.section_tipo = '${sectionTipo}' AND (${where.sql})
		 ORDER BY 1`,
		where.params as string[],
	)) as { section_id: number }[];
	return rows.map((row) => Number(row.section_id));
}

// ---------------------------------------------------------------------------
// 1. PARTIAL-DATE SEARCH — interval overlap on ordinary (JSONB) sections
// ---------------------------------------------------------------------------

/**
 * The canonical test3 fixture stores `test145` (no `date_mode` property → PHP's
 * 'date' default) as 1628-06-09 and 2024-06-25 — neither stamped on 1 January,
 * so neither was reachable by a year-only search before this gate.
 */
const test145Path = [{ section_tipo: 'test3', component_tipo: 'test145' }];

function dateLeaf(q: unknown, operator: string | undefined, path = test145Path): SqoFilterLeaf {
	return { q, ...(operator === undefined ? {} : { q_operator: operator }), path } as SqoFilterLeaf;
}

describe('partial-date search matches dates INSIDE the typed period (the 0-of-29 bug)', () => {
	test('year-only q finds a record whose stored date is mid-year (1628-06-09)', async () => {
		const where = await conformToSql(
			dateLeaf([{ start: { year: 1628 } }], '='),
			'te3',
			'matrix_test',
		);
		const ids = await idsMatching('matrix_test', 'te3', 'test3', where);
		expect(ids.length).toBeGreaterThan(0);

		// …and it is exactly the set the fixture's own 1628 records form.
		const stored = (await sql.unsafe(
			`SELECT section_id FROM matrix_test
			 WHERE section_tipo = 'test3' AND date @? '$.test145[*] ? (@.start.year == 1628)'
			 ORDER BY 1`,
			[],
		)) as { section_id: number }[];
		expect(ids).toEqual(stored.map((row) => Number(row.section_id)));
	});

	test('year+month q narrows to that month; a neighbouring month finds nothing', async () => {
		const june = await conformToSql(
			dateLeaf([{ start: { year: 1628, month: 6 } }], '='),
			'te3',
			'matrix_test',
		);
		expect((await idsMatching('matrix_test', 'te3', 'test3', june)).length).toBeGreaterThan(0);

		const july = await conformToSql(
			dateLeaf([{ start: { year: 1628, month: 7 } }], '='),
			'te3',
			'matrix_test',
		);
		expect(await idsMatching('matrix_test', 'te3', 'test3', july)).toEqual([]);
	});

	test("'>' compares against the END of the typed period, '>=' against its start", async () => {
		// The fixture's later value is 2024-06-25. '> 2024' means "after ALL of
		// 2024" → no hit; '>= 2024' means "at or after 2024 begins" → hit.
		const after = await conformToSql(
			dateLeaf([{ start: { year: 2024 } }], '>'),
			'te3',
			'matrix_test',
		);
		expect(await idsMatching('matrix_test', 'te3', 'test3', after)).toEqual([]);

		const fromStart = await conformToSql(
			dateLeaf([{ start: { year: 2024 } }], '>='),
			'te3',
			'matrix_test',
		);
		expect((await idsMatching('matrix_test', 'te3', 'test3', fromStart)).length).toBeGreaterThan(0);
	});

	test("'<=' includes the whole typed year, '<' excludes it", async () => {
		const throughYear = await conformToSql(
			dateLeaf([{ start: { year: 1628 } }], '<='),
			'te3',
			'matrix_test',
		);
		expect((await idsMatching('matrix_test', 'te3', 'test3', throughYear)).length).toBeGreaterThan(
			0,
		);

		const beforeYear = await conformToSql(
			dateLeaf([{ start: { year: 1628 } }], '<'),
			'te3',
			'matrix_test',
		);
		expect(await idsMatching('matrix_test', 'te3', 'test3', beforeYear)).toEqual([]);
	});

	test('the emitted predicate is PHP-shaped: an interval overlap, not a point equality', async () => {
		const { sql: rendered } = await conformToSql(
			dateLeaf([{ start: { year: 1628 } }], '='),
			'te3',
			'matrix_test',
		);
		// 1628 * 372 * 86400 = 52325222400; period end = 1629 * … − 1 = 52357363199.
		// The first OR branch is the half a point equality can never express: a
		// stored [start, end] span that BRACKETS the typed period.
		expect(rendered).toBe(
			"te3.date @? '$.test145[*] ? ((@.start.time <= 52325222400 && @.end.time >= 52325222400)" +
				" || (@.start.time >= 52325222400 && @.start.time <= 52357363199))'",
		);
	});
});

/** A pure builder context (no DB): the date_mode is supplied explicitly. */
function ctx(overrides: Partial<BuilderContext> = {}): BuilderContext {
	return {
		alias: 'm',
		column: 'date',
		tipo: 'zz1',
		sectionTipo: 'zz0',
		table: 'matrix',
		lang: 'lg-nolan',
		translatable: false,
		model: 'component_date',
		...overrides,
	};
}

describe('partial-date search — the remaining date_modes PHP dispatches', () => {
	test("date_mode 'period' compares period.time (proves conform passes date_mode through)", async () => {
		const { sql: rendered } = await conformToSql(
			dateLeaf([{ period: { year: 2, month: 3 } }], '=', [
				{ section_tipo: 'test3', component_tipo: 'test173' },
			]),
			'te3',
			'matrix_test',
		);
		// convert_date_to_seconds(y=2, m=3) = 2*372d + 2*31d = 64281600 + 5356800.
		expect(rendered).toBe("te3.date @? '$.test173[*] ? (@.period.time == 69638400)'");
	});

	test("date_mode 'time' equality is a window over the typed precision", () => {
		// 14:00:00 → 50400 seconds; the unset minute/second fill to 14:59:59.
		expect(buildDateFragment([{ start: { hour: 14 } }], '=', ctx({ dateMode: 'time' }))).toEqual({
			kind: 'fragment',
			sentence: "m.date @? '$.zz1[*] ? (@.start.time >= 50400 && @.start.time <= 53999)'",
			tokenValues: {},
		});
	});

	test("date_mode 'time' non-equality compares the exact typed second", () => {
		expect(
			buildDateFragment([{ start: { hour: 14, minute: 30 } }], '>', ctx({ dateMode: 'time' })),
		).toMatchObject({
			sentence: "m.date @? '$.zz1[*] ? (@.start.time > 52200)'",
		});
	});

	test("date_mode 'date_time' equality is a start.time window (no end container)", () => {
		expect(
			buildDateFragment(
				[{ start: { year: 2026, month: 7, day: 5 } }],
				'=',
				ctx({ dateMode: 'date_time' }),
			),
		).toMatchObject({
			// 2026-07-05 → 2026*372d + 6*31d + 4d = 65117260800 + 16070400 + 345600.
			sentence:
				"m.date @? '$.zz1[*] ? (@.start.time >= 65133676800 && @.start.time <= 65133763199)'",
		});
	});

	test("date_mode 'date_time' '>' uses the period END, '>=' its start", () => {
		const q = [{ start: { year: 2026 } }];
		expect(buildDateFragment(q, '>', ctx({ dateMode: 'date_time' }))).toMatchObject({
			sentence: "m.date @? '$.zz1[*] ? (@.start.time > 65149401599)'",
		});
		expect(buildDateFragment(q, '>=', ctx({ dateMode: 'date_time' }))).toMatchObject({
			sentence: "m.date @? '$.zz1[*] ? (@.start.time >= 65117260800)'",
		});
	});

	test('an unhandled date_mode THROWS instead of silently returning nothing', () => {
		// 'time_range' (live on actv59): PHP logs an ERROR and emits NO sentence,
		// i.e. a silent empty result. Uncovered scope must fail loudly.
		expect(() =>
			buildDateFragment([{ start: { year: 2012 } }], '=', ctx({ dateMode: 'time_range' })),
		).toThrow(/time_range/);
	});

	test('existence operators still short-circuit before the mode dispatch', () => {
		expect(buildDateFragment(null, '*', ctx({ dateMode: 'time_range' }))).toMatchObject({
			sentence: "(m.date @? '$.zz1[*]')",
		});
	});
});

// ---------------------------------------------------------------------------
// 2. THESAURUS BROADER-TERM SEARCH — the relation_search ancestor index
// ---------------------------------------------------------------------------

/**
 * SCRATCH TWINS of the two live shapes. `test205` is a legacy
 * component_autocomplete_hi on section `test3`.
 *
 * 998801 — NARROW term. Links cl1/39 directly and carries its parent chain
 * (cl1/33 … cl1/1) in `relation_search` — byte-for-byte the shape
 * `maintainRelationSearchIndex` writes and the shape the live install stores
 * (verified read-only against `dedalo7_mht`: oh1/72 `relation_search.oh19`,
 * rsc197/1 `relation_search.rsc92`). Searching the ROOT term cl1/1 must
 * return it.
 *
 * 998802 — ROOT term. Links cl1/1, a hierarchy root, so it has NO ancestors:
 * `maintainRelationSearchIndex` passes `null` for the key and
 * `updateMatrixKeyData` DELETES it, leaving `relation_search` without a
 * `test205` key at all (relations/save.ts:368-375). This is not an exotic
 * shape — on the live `dedalo7_mht` archive 69 `oh1` records carry an `oh19`
 * (component_autocomplete_hi) relation with no `oh19` key in `relation_search`.
 * It is the row class PHP's `!=` grouping silently dropped.
 */
const SCRATCH_SECTION_ID = 998801;
const SCRATCH_ROOT_SECTION_ID = 998802;
const ANCESTOR_TIPO = 'test205';
const NARROW_TERM = {
	section_tipo: 'cl1',
	section_id: '39',
	from_component_tipo: ANCESTOR_TIPO,
};
const BROADER_TERM = {
	section_tipo: 'cl1',
	section_id: '1',
	from_component_tipo: ANCESTOR_TIPO,
};
const ancestorPath = [{ section_tipo: 'test3', component_tipo: ANCESTOR_TIPO }];

beforeAll(async () => {
	await sql.unsafe(
		`INSERT INTO matrix_test (section_id, section_tipo, relation, relation_search)
		 VALUES ($1, 'test3', $2::text::jsonb, $3::text::jsonb)
		 ON CONFLICT (section_id, section_tipo) DO UPDATE
		   SET relation = EXCLUDED.relation, relation_search = EXCLUDED.relation_search`,
		[
			String(SCRATCH_SECTION_ID),
			JSON.stringify({ [ANCESTOR_TIPO]: [{ id: 1, type: 'dd151', ...NARROW_TERM }] }),
			JSON.stringify({
				[ANCESTOR_TIPO]: [
					{
						type: 'dd151',
						section_id: '33',
						section_tipo: 'cl1',
						from_component_tipo: ANCESTOR_TIPO,
					},
					{
						type: 'dd151',
						section_id: '3',
						section_tipo: 'cl1',
						from_component_tipo: ANCESTOR_TIPO,
					},
					{
						type: 'dd151',
						section_id: '1',
						section_tipo: 'cl1',
						from_component_tipo: ANCESTOR_TIPO,
					},
				],
			}),
		],
	);

	// The ROOT-term twin: a maintained index whose key was DELETED for want of
	// ancestors. `relation_search` is present but carries no `test205` key.
	await sql.unsafe(
		`INSERT INTO matrix_test (section_id, section_tipo, relation, relation_search)
		 VALUES ($1, 'test3', $2::text::jsonb, '{}'::jsonb)
		 ON CONFLICT (section_id, section_tipo) DO UPDATE
		   SET relation = EXCLUDED.relation, relation_search = EXCLUDED.relation_search`,
		[
			String(SCRATCH_ROOT_SECTION_ID),
			JSON.stringify({ [ANCESTOR_TIPO]: [{ id: 1, type: 'dd151', ...BROADER_TERM }] }),
		],
	);
});

afterAll(async () => {
	await sql.unsafe(
		`DELETE FROM matrix_test WHERE section_tipo = 'test3' AND section_id IN ($1, $2)`,
		[String(SCRATCH_SECTION_ID), String(SCRATCH_ROOT_SECTION_ID)],
	);
});

describe('broader-term search reads the maintained ancestor index', () => {
	test('the fixture really is ancestor-only (guards the assertions below)', async () => {
		const rows = (await sql.unsafe(
			`SELECT (relation @> $2::text::jsonb) AS direct,
			        (relation_search @> $2::text::jsonb) AS ancestor
			 FROM matrix_test WHERE section_tipo = 'test3' AND section_id = $1`,
			[
				String(SCRATCH_SECTION_ID),
				JSON.stringify({ [ANCESTOR_TIPO]: [{ section_tipo: 'cl1', section_id: '1' }] }),
			],
		)) as { direct: boolean; ancestor: boolean }[];
		expect(rows[0]).toEqual({ direct: false, ancestor: true });
	});

	test('a search on the ROOT term returns the record filed under a narrower one', async () => {
		const where = await conformToSql(
			{ q: [BROADER_TERM], path: ancestorPath } as SqoFilterLeaf,
			'te3',
			'matrix_test',
		);
		expect(where.sql).toContain('relation_search');
		expect(await idsMatching('matrix_test', 'te3', 'test3', where)).toContain(SCRATCH_SECTION_ID);
	});

	test('the direct term still matches (the wrap widens, never narrows)', async () => {
		const where = await conformToSql(
			{ q: [NARROW_TERM], path: ancestorPath } as SqoFilterLeaf,
			'te3',
			'matrix_test',
		);
		expect(await idsMatching('matrix_test', 'te3', 'test3', where)).toContain(SCRATCH_SECTION_ID);
	});

	test('a NON-autocomplete_hi relation component is NOT wrapped', async () => {
		// test80 is a plain component_portal on the same section — no ancestor
		// index is maintained for it, so no relation_search clause may appear.
		const where = await conformToSql(
			{
				q: [{ section_tipo: 'cl1', section_id: '1' }],
				path: [{ section_tipo: 'test3', component_tipo: 'test80' }],
			} as SqoFilterLeaf,
			'te3',
			'matrix_test',
		);
		expect(where.sql).not.toContain('relation_search');
	});

	test('negation combines the two columns with AND, so an ancestor hit excludes', async () => {
		const where = await conformToSql(
			{ q: [BROADER_TERM], q_operator: '!==', path: ancestorPath } as SqoFilterLeaf,
			'te3',
			'matrix_test',
		);
		expect(where.sql).toContain('relation_search');
		expect(where.sql).toContain(' AND ');
		// The record IS indexed under cl1/1 through its ancestors, so a
		// "different from cl1/1" search must NOT return it.
		expect(await idsMatching('matrix_test', 'te3', 'test3', where)).not.toContain(
			SCRATCH_SECTION_ID,
		);
	});

	/**
	 * CORRECTION 3 of WC-2026-08-09-autocomplete-hi-ancestor-search. PHP's `!=`
	 * ancestor clause is `relation_search ? <tipo> AND NOT (relation_search @> q)`
	 * — it DEMANDS the key. A record whose term is a hierarchy ROOT has no
	 * ancestors, so `maintainRelationSearchIndex` deletes that key, PHP's first
	 * conjunct is false, and the `$and` grouping drops the record from every
	 * `!=` result. TS uses the STRICT not-contains twin (`!==`) on the ancestor
	 * half, which asks only "does not contain".
	 */
	test("'!=' keeps hierarchy-ROOT records, which PHP's key test dropped", async () => {
		const where = await conformToSql(
			{ q: [NARROW_TERM], q_operator: '!=', path: ancestorPath } as SqoFilterLeaf,
			'te3',
			'matrix_test',
		);
		const ids = await idsMatching('matrix_test', 'te3', 'test3', where);
		// The root-term record does NOT hold cl1/39, so "different from cl1/39"
		// must return it — its empty ancestor index is not a reason to hide it.
		expect(ids).toContain(SCRATCH_ROOT_SECTION_ID);
		// …and the record that DOES hold cl1/39 is still excluded.
		expect(ids).not.toContain(SCRATCH_SECTION_ID);
		// The ancestor half must not carry a key-existence test at all.
		expect(where.sql).toContain('relation_search');
		expect(where.sql).not.toMatch(/relation_search \?/);

		// THE FOSSIL: PHP's own shape, run against the same two rows. It drops the
		// root-term record — the silent under-return this correction closes.
		const qJson = JSON.stringify({ [ANCESTOR_TIPO]: [NARROW_TERM] });
		const phpShaped = {
			sql:
				'((te3.relation ? $1 AND NOT (te3.relation @> $2::text::jsonb))' +
				' AND (te3.relation_search ? $3 AND NOT (te3.relation_search @> $4::text::jsonb)))',
			params: [ANCESTOR_TIPO, qJson, ANCESTOR_TIPO, qJson],
		};
		expect(await idsMatching('matrix_test', 'te3', 'test3', phpShaped)).not.toContain(
			SCRATCH_ROOT_SECTION_ID,
		);
	});

	/**
	 * THREE-VALUED LOGIC on the negating arm. `relation_search` is written only
	 * for terms that HAVE ancestors, so it is NULL on most rows (measured
	 * read-only on the live `dedalo7_mht` archive: 1964 of 2175 `matrix` rows,
	 * and 72 of 76 `oh1` records). `NOT (NULL @> q)` is NULL, not TRUE, so an
	 * `$and` of [direct, ancestor] silently swallowed every such row: a
	 * strict-different search over `oh1` returned 4 of the 76 records it must.
	 * The negating arm therefore reads COALESCE(relation_search, '{}').
	 */
	test("'!==' still returns rows whose relation_search is NULL", async () => {
		const where = await conformToSql(
			{ q: [BROADER_TERM], q_operator: '!==', path: ancestorPath } as SqoFilterLeaf,
			'te3',
			'matrix_test',
		);
		expect(where.sql).toContain("COALESCE(te3.relation_search, '{}'::jsonb)");
		const ids = await idsMatching('matrix_test', 'te3', 'test3', where);
		// The canonical playground rows carry a `relation` but no relation_search
		// at all; none of them holds cl1/1, so all of them are "different from" it.
		const nullIndexed = (await sql.unsafe(
			`SELECT section_id FROM matrix_test
			 WHERE section_tipo = 'test3' AND relation_search IS NULL ORDER BY 1`,
			[],
		)) as { section_id: number }[];
		expect(nullIndexed.length).toBeGreaterThan(0);
		for (const row of nullIndexed) expect(ids).toContain(Number(row.section_id));
	});

	test('the POSITIVE arm keeps the bare column, so it stays GIN-index-served', async () => {
		const where = await conformToSql(
			{ q: [BROADER_TERM], path: ancestorPath } as SqoFilterLeaf,
			'te3',
			'matrix_test',
		);
		// `$or` already absorbs a NULL beside a TRUE, and COALESCE would defeat
		// matrix_relation_search_gin_idx — so no COALESCE here.
		expect(where.sql).toContain('te3.relation_search @>');
		expect(where.sql).not.toContain('COALESCE');
	});

	/**
	 * TRIPWIRE for the field the NULL-safety fix introduced. `columnExpr` lets a
	 * relation leaf compare against a raw SQL EXPRESSION instead of
	 * `<alias>.<column>`, so it bypasses the identifier gate that `column`
	 * passes through — the builders' standing security invariant
	 * (search/builders/types.ts header) holds here only while every assignment
	 * is built by a builder from already-gated context fields. It exists for ONE
	 * reason (the ancestor wrap's COALESCE) and must not quietly become a
	 * general escape hatch: any new assignment anywhere in `src/` fails this and
	 * has to be argued for here.
	 */
	test('columnExpr is assigned in exactly one place, and only from context.alias', async () => {
		const { Glob } = await import('bun');
		const assignments: string[] = [];
		for (const file of new Glob('src/**/*.ts').scanSync('.')) {
			const text = await Bun.file(file).text();
			for (const line of text.split('\n')) {
				// `columnExpr?:` (the interface declaration) is deliberately not matched.
				if (/(?:^|[^.\w])columnExpr\s*:/.test(line)) assignments.push(`${file}: ${line.trim()}`);
			}
		}
		expect(assignments).toHaveLength(1);
		expect(assignments[0]).toContain('src/core/search/builders/builder_relation.ts');
		// The only interpolation it may carry is the gated table alias.
		expect(assignments[0]).toMatch(/ancestorColumn/);
		expect(assignments[0]).not.toMatch(/leaf|rawQ|\bq\b/);
	});

	/**
	 * The `!*` arm of the grouping table (PHP already grouped it with `$and`; it
	 * was simply ungated). With `$or` the root-term record would satisfy
	 * "ancestor column is empty" and an IS-EMPTY search would return a record
	 * that plainly HAS a term.
	 */
	test("'!*' groups with AND, so a record with a term is never 'empty'", async () => {
		const where = await conformToSql(
			{ q: null, q_operator: '!*', path: ancestorPath } as SqoFilterLeaf,
			'te3',
			'matrix_test',
		);
		expect(where.sql).toContain('relation_search');
		expect(where.sql).toContain(' AND ');
		const ids = await idsMatching('matrix_test', 'te3', 'test3', where);
		expect(ids).not.toContain(SCRATCH_ROOT_SECTION_ID);
		expect(ids).not.toContain(SCRATCH_SECTION_ID);
		// Control: records with no test205 at all ARE empty and must come back.
		expect(ids.length).toBeGreaterThan(0);
	});

	test("the existence operator '*' also consults the ancestor column", async () => {
		const where = await conformToSql(
			{ q: null, q_operator: '*', path: ancestorPath } as SqoFilterLeaf,
			'te3',
			'matrix_test',
		);
		expect(where.sql).toContain('relation_search');
		expect(await idsMatching('matrix_test', 'te3', 'test3', where)).toContain(SCRATCH_SECTION_ID);
	});
});
