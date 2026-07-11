/**
 * Phase 8 gate: MCP tool ACL parity. The AI tool surface (src/ai/mcp/tools.ts)
 * must grant an LLM EXACTLY the access its configured Dédalo user has — never
 * more (REWRITE_SPEC §8: "respecting the same ACL as human access", §10: "AI
 * tools denied exactly where humans are denied").
 *
 * Fixture: numisdata267 is gated by component_filter numisdata21. Non-admin
 * user 16 holds project 7, so they see only project-7 records; the superuser
 * (-1) sees everything. We assert the MCP handlers reproduce that split for
 * both search (count + hits) and read (gated records read empty for the
 * non-admin, populated for the admin).
 */

import { describe, expect, test } from 'bun:test';
import {
	describeOntologyNode,
	readSectionRecord,
	searchSectionRecords,
} from '../../src/ai/mcp/tools.ts';
import { sql } from '../../src/core/db/postgres.ts';
import type { Principal } from '../../src/core/security/permissions.ts';

const GATED_SECTION = 'numisdata267';

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
/** Real non-admin whose dd170 projects resolve to [7] (see projects_filter test). */
const NON_ADMIN: Principal = { userId: 16, isGlobalAdmin: false, isDeveloper: false };

describe('MCP tools — ACL parity (Phase 8 gate)', () => {
	test('search: non-admin count/hits are a gated subset of the admin view', async () => {
		const adminResult = await searchSectionRecords(SUPERUSER, {
			section_tipo: GATED_SECTION,
			limit: 100,
		});
		const userResult = await searchSectionRecords(NON_ADMIN, {
			section_tipo: GATED_SECTION,
			limit: 100,
		});

		// Admin sees the whole section; the gated user sees strictly fewer.
		expect(adminResult.total).toBeGreaterThan(0);
		expect(userResult.total).toBeGreaterThan(0);
		expect(userResult.total).toBeLessThan(adminResult.total);

		// Every non-admin hit must be a real project-7 record (no over-return).
		const projectSeven = new Set(
			(
				(await sql`
					SELECT section_id FROM matrix
					WHERE section_tipo = ${GATED_SECTION}
					  AND EXISTS (
						SELECT 1 FROM jsonb_array_elements(relation->'numisdata21') e
						WHERE e->>'section_id' = '7'
					)
				`) as { section_id: number }[]
			).map((row) => Number(row.section_id)),
		);
		expect(projectSeven.size).toBeGreaterThan(0);
		for (const hit of userResult.hits) {
			expect(hit.section_tipo).toBe(GATED_SECTION);
			expect(projectSeven.has(hit.section_id)).toBe(true);
		}
	});

	test("read: a record outside the user's projects reads empty for them, full for admin", async () => {
		// Find a gated record the non-admin must NOT see (no project-7 relation).
		const hiddenRows = (await sql`
			SELECT section_id FROM matrix
			WHERE section_tipo = ${GATED_SECTION}
			  AND NOT EXISTS (
				SELECT 1 FROM jsonb_array_elements(relation->'numisdata21') e
				WHERE e->>'section_id' = '7'
			)
			ORDER BY section_id LIMIT 1
		`) as { section_id: number }[];
		expect(hiddenRows.length).toBe(1);
		const hiddenId = Number(hiddenRows[0]?.section_id);

		const adminRead = await readSectionRecord(SUPERUSER, {
			section_tipo: GATED_SECTION,
			section_id: hiddenId,
		});
		const userRead = await readSectionRecord(NON_ADMIN, {
			section_tipo: GATED_SECTION,
			section_id: hiddenId,
		});

		// The `sections` envelope always leads `data`; its `entries` are the
		// records the caller actually resolved. Admin finds the record; the
		// gated user's envelope is empty — existence is never confirmed to them
		// (empty entries, not an error, no leaked component values).
		const entriesOf = (read: { data: unknown[] }): unknown[] => {
			const envelope = read.data.find((item) => (item as { typo?: string }).typo === 'sections') as
				| { entries?: unknown[] }
				| undefined;
			return envelope?.entries ?? [];
		};
		expect(entriesOf(adminRead).length).toBe(1);
		expect(entriesOf(userRead).length).toBe(0);
		// And the admin actually resolved component values beyond the envelope.
		expect(adminRead.data.length).toBeGreaterThan(1);
	});

	test('search: a component filter narrows results via the real search builders', async () => {
		// numisdata6.numisdata16 (input_text, lg-spa) is the proven searchable
		// fixture from sqo_differential. An exact-match filter must narrow the
		// result below the section total and return exactly the records whose
		// stored value equals the query — i.e. the MCP filter routes through the
		// same per-component builder the web search uses.
		const SEARCH_SECTION = 'numisdata6';
		const TEXT_COMPONENT = 'numisdata16';
		// Grab a real lg-spa value (the element whose lang == 'lg-spa'), so the
		// lang-scoped filter matches what is actually stored.
		const sample = (await sql`
			SELECT (
				SELECT e->>'value'
				FROM jsonb_array_elements(string->'numisdata16') e
				WHERE e->>'lang' = 'lg-spa' AND e->>'value' <> ''
				LIMIT 1
			) AS v
			FROM matrix
			WHERE section_tipo = ${SEARCH_SECTION}
			  AND string->'numisdata16' IS NOT NULL
			ORDER BY section_id
		`) as { v: string | null }[];
		const value = sample.map((row) => row.v).find((v) => v !== null && v !== '');
		expect(value).toBeTruthy();

		const unfiltered = await searchSectionRecords(SUPERUSER, {
			section_tipo: SEARCH_SECTION,
			limit: 100,
		});
		const filtered = await searchSectionRecords(SUPERUSER, {
			section_tipo: SEARCH_SECTION,
			limit: 100,
			filter: { component_tipo: TEXT_COMPONENT, query: `==${value}`, lang: 'lg-spa' },
		});

		expect(filtered.total).toBeGreaterThan(0);
		expect(filtered.total).toBeLessThan(unfiltered.total);

		// Ground truth: records whose lg-spa value equals `value` (exact match).
		const truth = new Set(
			(
				(await sql`
					SELECT section_id FROM matrix
					WHERE section_tipo = ${SEARCH_SECTION}
					  AND EXISTS (
						SELECT 1 FROM jsonb_array_elements(string->'numisdata16') e
						WHERE e->>'lang' = 'lg-spa' AND e->>'value' = ${value}
					)
				`) as { section_id: number }[]
			).map((row) => Number(row.section_id)),
		);
		for (const hit of filtered.hits) {
			expect(truth.has(hit.section_id)).toBe(true);
		}
	});

	test('describe: a section tipo resolves to the section model', async () => {
		const described = await describeOntologyNode(SUPERUSER, { tipo: GATED_SECTION });
		expect(described.tipo).toBe(GATED_SECTION);
		expect(described.model).toBe('section');
	});

	test('search: invalid section_tipo is rejected at the identifier chokepoint', async () => {
		await expect(
			searchSectionRecords(SUPERUSER, { section_tipo: "oh1'; DROP TABLE matrix; --" }),
		).rejects.toThrow();
	});
});
