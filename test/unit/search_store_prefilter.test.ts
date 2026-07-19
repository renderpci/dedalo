/**
 * Search-store pre-filter on string searches (builder_string
 * withStorePrefilter + matrix_search_values, 2026-07-19) — the trigram-served
 * `EXISTS (… sv.tv LIKE '<tipo>:%<q>%')` clause prepended to POSITIVE match
 * shapes when the table is store-covered (its sync trigger exists).
 *
 * Pinned here:
 * - SQL shape: pre-filter present for contains/'=='/'='/literal/wildcards
 *   when searchStoreCovered, absent for negations/bare '*'/regex-meta
 *   q/uncovered tables; LIKE-wildcard escaping of q;
 * - store consistency on the live DB: the trigger keeps rows in sync on
 *   write/delete (matrix_test scratch record);
 * - superset equality: pre-filter AND exact === exact alone on real data.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { buildStringFragment } from '../../src/core/search/builders/builder_string.ts';
import type { BuilderContext, Fragment } from '../../src/core/search/builders/types.ts';

const PREFILTER = 'ANY (ARRAY(SELECT sv.section_id FROM matrix_search_values sv';

function ctx(overrides: Partial<BuilderContext> = {}): BuilderContext {
	return {
		alias: 'mix',
		column: 'string',
		tipo: 'rsc140',
		sectionTipo: 'rsc205',
		table: 'matrix',
		lang: 'lg-nolan',
		translatable: false,
		model: 'component_input_text',
		searchStoreCovered: true,
		...overrides,
	};
}

function sentenceOf(result: ReturnType<typeof buildStringFragment>): string {
	expect(result).not.toBe(false);
	expect((result as Fragment).kind).toBe('fragment');
	return (result as Fragment).sentence;
}

describe('search-store pre-filter SQL shape', () => {
	test('positive shapes carry the pre-filter when the table is covered', () => {
		for (const q of ['sarde', '==sarde', '=sarde', "'sarde'", 'sarde*', '*sarde', '*sarde*']) {
			const sentence = sentenceOf(buildStringFragment(q, null, false, ctx()));
			expect(sentence.startsWith('mix.section_id = ANY (ARRAY(SELECT sv.section_id')).toBe(true);
			expect(sentence).toContain(`sv.tv LIKE 'rsc140:%'`);
			// the exact predicate must survive untouched behind the pre-filter
			expect(sentence).toContain('jsonb_path_query(mix.string');
		}
	});

	test('no pre-filter on an uncovered table (byte-identical classic SQL)', () => {
		const covered = sentenceOf(buildStringFragment('sarde', null, false, ctx()));
		const bare = sentenceOf(
			buildStringFragment('sarde', null, false, ctx({ searchStoreCovered: false })),
		);
		expect(bare).not.toContain(PREFILTER);
		expect(covered).toContain(bare); // pre-filter strictly prepends
	});

	test('negations, emptiness and bare * never carry the pre-filter', () => {
		for (const q of ['!*', '*', '!=sarde', '-sarde', '!!']) {
			const result = buildStringFragment(q, null, false, ctx());
			if (result === false) continue;
			expect(JSON.stringify(result)).not.toContain(PREFILTER);
		}
	});

	test('regex metacharacters in q suppress the pre-filter (LIKE is literal-only)', () => {
		for (const q of ['^sarde', 'sarde$', 'sa.de', 'sar(de)', 'sa|de', 'sar\\de']) {
			const sentence = sentenceOf(buildStringFragment(q, null, false, ctx()));
			expect(sentence).not.toContain(PREFILTER);
		}
	});

	test('LIKE wildcards in a regex-plain q are escaped to literals', () => {
		const result = buildStringFragment('100%_x', null, false, ctx()) as Fragment;
		expect(result.sentence).toContain(PREFILTER);
		expect(result.tokenValues._Q0_).toBe('100\\%\\_x');
		expect(result.tokenValues._Q1_).toBe('100%_x'); // exact predicate keeps raw q
	});
});

describe('store sync trigger + superset (skips without DB/store)', () => {
	const SCRATCH_ID = 999901; // matrix_test scratch surface (test-only table)

	async function storeReady(): Promise<boolean> {
		try {
			const rows = (await sql`
				SELECT 1 AS ok FROM pg_trigger WHERE tgname = 'matrix_test_search_values_sync' LIMIT 1
			`) as { ok: number }[];
			return rows.length > 0;
		} catch {
			return false;
		}
	}

	afterAll(async () => {
		try {
			await sql`DELETE FROM matrix_test WHERE section_tipo = 'test3' AND section_id = ${SCRATCH_ID}`;
		} catch {
			// no DB — nothing to clean
		}
	});

	test('insert/update/delete keep matrix_search_values in sync', async () => {
		if (!(await storeReady())) return;
		const storeRows = () =>
			sql`SELECT tv FROM matrix_search_values
			    WHERE section_tipo = 'test3' AND section_id = ${SCRATCH_ID} ORDER BY tv` as Promise<
				{ tv: string }[]
			>;
		await sql`DELETE FROM matrix_test WHERE section_tipo = 'test3' AND section_id = ${SCRATCH_ID}`;
		await sql`INSERT INTO matrix_test (section_tipo, section_id, string)
		          VALUES ('test3', ${SCRATCH_ID}, '{"test45":[{"lang":"lg-nolan","value":"Ærøskøbing Título"}]}'::jsonb)`;
		let rows = await storeRows();
		expect(rows.map((r) => r.tv)).toEqual(['test45:aeroskobing titulo']);
		await sql`UPDATE matrix_test SET string = '{"test45":[{"lang":"lg-nolan","value":"Nuevo"}]}'::jsonb
		          WHERE section_tipo = 'test3' AND section_id = ${SCRATCH_ID}`;
		rows = await storeRows();
		expect(rows.map((r) => r.tv)).toEqual(['test45:nuevo']);
		await sql`DELETE FROM matrix_test WHERE section_tipo = 'test3' AND section_id = ${SCRATCH_ID}`;
		rows = await storeRows();
		expect(rows).toEqual([]);
	});

	// generous timeout: the UN-prefiltered exact side deliberately runs the
	// slow per-row scan (~1.4s per term on the full dataset)
	test('pre-filter AND exact returns the same set as exact alone', async () => {
		if (!(await storeReady())) return;
		for (const q of ['sarde', 'HERAULT']) {
			const exact = (await sql.unsafe(
				`SELECT count(*)::int AS n FROM matrix mix WHERE mix.section_tipo = 'rsc205'
				 AND (mix.string @? '$."rsc140"[*] ? (@."lang" == "lg-nolan")') AND EXISTS (
					SELECT 1 FROM jsonb_path_query(mix.string, '$."rsc140"[*] ? (@."lang" == "lg-nolan")') AS elem
					WHERE f_unaccent(elem->>'value') ~* f_unaccent($1))`,
				[q],
			)) as { n: number }[];
			const prefiltered = (await sql.unsafe(
				`SELECT count(*)::int AS n FROM matrix mix WHERE mix.section_tipo = 'rsc205'
				 AND mix.section_id = ANY (ARRAY(SELECT sv.section_id FROM matrix_search_values sv
					WHERE sv.tv LIKE 'rsc140:%' || lower(f_unaccent($1)) || '%'))
				 AND (mix.string @? '$."rsc140"[*] ? (@."lang" == "lg-nolan")') AND EXISTS (
					SELECT 1 FROM jsonb_path_query(mix.string, '$."rsc140"[*] ? (@."lang" == "lg-nolan")') AS elem
					WHERE f_unaccent(elem->>'value') ~* f_unaccent($1))`,
				[q],
			)) as { n: number }[];
			expect(prefiltered[0]?.n).toBe(exact[0]?.n as number);
		}
	}, 30000);
});
