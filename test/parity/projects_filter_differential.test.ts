/**
 * Phase 5c gate: projects filter (per-record ACL) differential.
 *
 * numisdata267 (15,114 records) is gated by component_filter numisdata21; each
 * record references a project (dd153). A non-admin principal with project [7]
 * must see EXACTLY the records whose numisdata21 relation contains project 7 —
 * the same set a direct EXISTS query returns. Admins and internal (no
 * principal) searches see everything.
 */

import { describe, expect, test } from 'bun:test';
import { sanitizeClientSqo } from '../../src/core/concepts/sqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { buildSearchSql } from '../../src/core/search/sql_assembler.ts';
import { matrixReadSource } from '../../src/core/section/read_source.ts';
import type { Principal } from '../../src/core/security/permissions.ts';

const GATED_SECTION = 'numisdata267';
const PROJECT_ID = 7;

/** A synthetic non-admin principal whose projects we control directly. */
function nonAdmin(userId: number): Principal {
	return { userId, isGlobalAdmin: false, isDeveloper: false };
}

async function runSearchIds(
	sqoInput: Record<string, unknown>,
	principal?: Principal,
): Promise<Set<number>> {
	const sqo = sanitizeClientSqo(structuredClone(sqoInput));
	const { sql: builtSql, params } = await buildSearchSql(sqo, { principal });
	const rows = (await sql.unsafe(builtSql, params as (string | number | null)[])) as {
		section_id: number;
	}[];
	return new Set(rows.map((row) => Number(row.section_id)));
}

describe('projects filter differential (Phase 5c gate)', () => {
	test('non-admin with project 7 sees exactly the project-7 records', async () => {
		// Ground truth: the records numisdata21 → project 7 (limit parity with the search).
		const truth = (await sql`
			SELECT section_id FROM matrix
			WHERE section_tipo = ${GATED_SECTION}
			  AND EXISTS (
				SELECT 1 FROM jsonb_array_elements(relation->'numisdata21') e
				WHERE e->>'section_id' = '7'
			)
			ORDER BY section_id LIMIT 500
		`) as { section_id: number }[];
		const truthIds = new Set(truth.map((r) => Number(r.section_id)));
		expect(truthIds.size).toBeGreaterThan(0);

		// Monkeypatch the user's projects to [7] by using a principal whose
		// projects we seed via the DB-backed reader is not possible here, so we
		// assert the SQL SHAPE result equals the truth by running the filter with
		// a principal whose getUserProjects resolves to [7]. user 16 has project 7.
		const searched = await runSearchIds(
			{ section_tipo: [GATED_SECTION], limit: 500, offset: 0 },
			nonAdmin(16), // real user whose dd170 = project 7
		);
		// Every searched id must be in truth (no over-return); and the counts
		// match within the shared limit window.
		for (const id of searched) {
			expect(truthIds.has(id)).toBe(true);
		}
		expect(searched.size).toBe(truthIds.size);
	});

	test('admin sees everything (filter skipped)', async () => {
		const adminIds = await runSearchIds(
			{ section_tipo: [GATED_SECTION], limit: 200, offset: 0 },
			{ userId: -1, isGlobalAdmin: true, isDeveloper: true },
		);
		const total = (await sql`
			SELECT count(DISTINCT section_id)::int AS n FROM matrix WHERE section_tipo = ${GATED_SECTION}
		`) as { n: number }[];
		// 200-row page of a 15k section: full page returned, unfiltered.
		expect(adminIds.size).toBe(200);
		expect((total[0]?.n as number) > 200).toBe(true);
	});

	test('internal search (no principal) skips the filter', async () => {
		const ids = await runSearchIds({ section_tipo: [GATED_SECTION], limit: 50, offset: 0 });
		expect(ids.size).toBe(50);
	});

	test('non-admin with NO projects sees nothing on a gated section', async () => {
		// user id 999999 has no dd170 data → impossible clause.
		const ids = await runSearchIds(
			{ section_tipo: [GATED_SECTION], limit: 50, offset: 0 },
			nonAdmin(999999),
		);
		expect(ids.size).toBe(0);
	});

	test('non-gated section is unaffected by the projects filter', async () => {
		// numisdata5 has NO component_filter anywhere in its subtree → non-admin
		// sees the full page. (numisdata6, by contrast, IS gated by the nested
		// component_filter numisdata127 — a good reminder that gating can live
		// deep under a section_group, not just as a direct child.)
		const ids = await runSearchIds(
			{ section_tipo: ['numisdata5'], limit: 5, offset: 0 },
			nonAdmin(16),
		);
		expect(ids.size).toBe(5);
	});

	test('gated section deep under a section_group is still filtered (numisdata6/numisdata127)', async () => {
		// user 16 (project 7); numisdata6 records reference projects 1,2,3,5,6,9,10
		// — none is 7 — so the non-admin correctly sees zero.
		const ids = await runSearchIds(
			{ section_tipo: ['numisdata6'], limit: 20, offset: 0 },
			nonAdmin(16),
		);
		const truth = (await sql`
			SELECT count(DISTINCT section_id)::int AS n FROM matrix
			WHERE section_tipo = 'numisdata6'
			  AND EXISTS (SELECT 1 FROM jsonb_array_elements(relation->'numisdata127') e WHERE e->>'section_id' = '7')
		`) as { n: number }[];
		expect(ids.size).toBe(truth[0]?.n as number);
	});
});

/**
 * MULTI-SECTION projects filter (2026-07-09, WC-011) — the autocomplete
 * picker's normal shape. Replaces the Phase 5c fail-closed throw with
 * per-section predicates: each section scoped by its OWN component_filter
 * tipo behind a section_tipo guard. DELIBERATE strictly-safer divergence from
 * PHP, whose filter keys off the FIRST section only (trait.where.php:743-744
 * + the str_replace UNION copy, class.search.php:1048-1065): ungated-first is
 * fail-OPEN there (gated sections leak unfiltered). These cases assert TS
 * ground-truth sets, NOT PHP equality — running them against PHP would (and
 * should) diverge on the fail-open case.
 *
 * Fixture census (probed 2026-07-09): numisdata5 = 441 records (ids 1-441,
 * ungated); numisdata267 = 15,114 records, of which 103 reference project 7
 * (ids 4223-14752). user 16 → project 7; both fit one 1000-row page.
 */
describe('multi-section projects filter (per-section ACL, WC-011)', () => {
	/** Keyed runner: section_ids collide across sections, so key by tipo/id. */
	async function runSearchKeys(
		sqoInput: Record<string, unknown>,
		principal?: Principal,
	): Promise<Set<string>> {
		const sqo = sanitizeClientSqo(structuredClone(sqoInput));
		const { sql: builtSql, params } = await buildSearchSql(sqo, { principal });
		const rows = (await sql.unsafe(builtSql, params as (string | number | null)[])) as {
			section_tipo: string;
			section_id: number;
		}[];
		return new Set(rows.map((row) => `${row.section_tipo}/${row.section_id}`));
	}

	async function project7GatedTruth(): Promise<Set<string>> {
		const truth = (await sql`
			SELECT DISTINCT section_id FROM matrix
			WHERE section_tipo = ${GATED_SECTION}
			  AND EXISTS (
				SELECT 1 FROM jsonb_array_elements(relation->'numisdata21') e
				WHERE e->>'section_id' = ${String(PROJECT_ID)}
			)
		`) as { section_id: number }[];
		return new Set(truth.map((r) => `${GATED_SECTION}/${Number(r.section_id)}`));
	}

	const countBy = (keys: Set<string>, tipo: string) =>
		[...keys].filter((key) => key.startsWith(`${tipo}/`)).length;

	test('mixed gated/ungated: gated scoped by its OWN filter, ungated fully visible', async () => {
		const truthGated = await project7GatedTruth();
		expect(truthGated.size).toBeGreaterThan(0); // fixture guard

		const keys = await runSearchKeys(
			{ section_tipo: [GATED_SECTION, 'numisdata5'], limit: 1000, offset: 0 },
			nonAdmin(16),
		);
		// No over-return: every gated key is in the project-7 truth set…
		for (const key of keys) {
			if (key.startsWith(`${GATED_SECTION}/`)) expect(truthGated.has(key)).toBe(true);
		}
		// …no under-return: the whole in-scope gated set and the whole ungated
		// section fit the 1000-row page (441 + 103 = 544).
		expect(countBy(keys, GATED_SECTION)).toBe(truthGated.size);
		expect(countBy(keys, 'numisdata5')).toBe(441);
	});

	test('ungated section FIRST still filters the gated one (the PHP fail-open case)', async () => {
		// PHP keys the projects filter off the FIRST section: this ordering emits
		// NO filter there and leaks all 15k numisdata267 records. TS must return
		// the identical set regardless of section_tipo order.
		const truthGated = await project7GatedTruth();
		const keys = await runSearchKeys(
			{ section_tipo: ['numisdata5', GATED_SECTION], limit: 1000, offset: 0 },
			nonAdmin(16),
		);
		for (const key of keys) {
			if (key.startsWith(`${GATED_SECTION}/`)) expect(truthGated.has(key)).toBe(true);
		}
		expect(countBy(keys, GATED_SECTION)).toBe(truthGated.size); // 103, not 15k
	});

	test('two gated sections with DIFFERENT filter tipos are each scoped by their own', async () => {
		// user 16: project 7 → 103 numisdata267 records, ZERO numisdata6 records
		// (numisdata6 references projects 1,2,3,5,6,9,10 via numisdata127).
		const truthGated = await project7GatedTruth();
		const keys = await runSearchKeys(
			{ section_tipo: [GATED_SECTION, 'numisdata6'], limit: 1000, offset: 0 },
			nonAdmin(16),
		);
		expect(countBy(keys, GATED_SECTION)).toBe(truthGated.size);
		expect(countBy(keys, 'numisdata6')).toBe(0);
	});

	test('admin multi-section bypasses the filter (full unfiltered page)', async () => {
		const keys = await runSearchKeys(
			{ section_tipo: [GATED_SECTION, 'numisdata5'], limit: 1000, offset: 0 },
			{ userId: -1, isGlobalAdmin: true, isDeveloper: true },
		);
		expect(keys.size).toBe(1000); // 15,114 + 441 records → page filled, unfiltered
	});

	test('projects-less non-admin: gated section empty, ungated still visible', async () => {
		const keys = await runSearchKeys(
			{ section_tipo: [GATED_SECTION, 'numisdata5'], limit: 1000, offset: 0 },
			nonAdmin(999999),
		);
		expect(countBy(keys, GATED_SECTION)).toBe(0);
		expect(countBy(keys, 'numisdata5')).toBe(441);
	});

	test('multi-section count: no throw, total = per-section scoped sum', async () => {
		// The count engine shares buildSearchSql (and shared the removed throw).
		const truthGated = await project7GatedTruth();
		const sqo = sanitizeClientSqo(
			structuredClone({ section_tipo: [GATED_SECTION, 'numisdata5'], limit: 10, offset: 0 }),
		);
		const total = await matrixReadSource.count(sqo, nonAdmin(16));
		expect(total).toBe(truthGated.size + 441);
	});
});
