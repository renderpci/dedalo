/**
 * Phase 8 gate: MCP tool ACL parity. The AI tool surface (src/ai/mcp/tools.ts)
 * must grant an LLM EXACTLY the access its configured Dédalo user has — never
 * more (REWRITE_SPEC §8: "respecting the same ACL as human access", §10: "AI
 * tools denied exactly where humans are denied").
 *
 * THE SITUATION IS BUILT, NOT BORROWED (generic-`test`-TLD migration,
 * 2026-08-19). The gate used to read an install's `numisdata267` records and
 * user 16 — green on one machine, red on every other, and satisfiable at
 * 0-versus-0 wherever those records are absent. It now BUILDS the split it
 * asserts, out of two repo-owned pieces:
 *
 *   - the synthetic ACL identities (test/helpers/acl_identity_fixture.ts): a
 *     non-admin holding exactly ONE project (ACL_PROJECT_ID) and a read grant
 *     on `test3`, so "the gated user sees strictly fewer" cannot be vacuous;
 *   - three scratch `test3` records in the reserved ≥900000 band — two carrying
 *     the non-admin's project through test3's own component_filter (`test101`),
 *     one carrying a project they do NOT hold.
 *
 * `test3` is project-gated for real: `getComponentFilterTipo('test3')` resolves
 * `test101`, which is what buildProjectsFilter keys on. The canonical playground
 * records carry project 1 (not the fixture's), so they count for the admin and
 * are correctly invisible to the non-admin.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
	describeOntologyNode,
	readSectionRecord,
	searchSectionRecords,
} from '../../src/ai/mcp/tools.ts';
import { sql } from '../../src/core/db/postgres.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import {
	ACL_NON_ADMIN_USER_ID,
	ACL_PROJECT_ID,
	installAclIdentityFixture,
	removeAclIdentityFixture,
} from '../helpers/acl_identity_fixture.ts';
import {
	cleanScratchRecord,
	createScratchRecord,
	ensureCanonicalTest3,
} from '../helpers/test_data.ts';

/** The project-gated section and the component_filter that gates it. */
const GATED_SECTION = 'test3';
const FILTER_COMPONENT = 'test101';
/** test3's own input_text — the searchable literal of the playground. */
const TEXT_COMPONENT = 'test52';
/** Projects live in dd153; the locator type the real records carry. */
const PROJECTS_SECTION = 'dd153';
const PROJECT_LOCATOR_TYPE = 'dd675';

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
/** The synthetic non-admin: one project (ACL_PROJECT_ID), read grant on test3. */
const NON_ADMIN: Principal = {
	userId: ACL_NON_ADMIN_USER_ID,
	isGlobalAdmin: false,
	isDeveloper: false,
};

/** Scratch records this gate owns (reserved ≥900000 band). */
const VISIBLE_IDS = [941001, 941002];
const HIDDEN_ID = 941003;
/** A project the non-admin does NOT hold — what makes HIDDEN_ID hidden. */
const OTHER_PROJECT_ID = 1;

function projectLocator(projectId: number) {
	return [
		{
			id: 1,
			type: PROJECT_LOCATOR_TYPE,
			section_id: String(projectId),
			section_tipo: PROJECTS_SECTION,
			from_component_tipo: FILTER_COMPONENT,
		},
	];
}

async function createGatedRecord(sectionId: number, projectId: number): Promise<void> {
	await createScratchRecord(GATED_SECTION, sectionId, {
		relation: { [FILTER_COMPONENT]: projectLocator(projectId) },
		string: { [TEXT_COMPONENT]: [{ id: 1, lang: 'lg-eng', value: `acl scratch ${sectionId}` }] },
	});
}

beforeAll(async () => {
	await ensureCanonicalTest3();
	await installAclIdentityFixture();
	for (const id of VISIBLE_IDS) await createGatedRecord(id, ACL_PROJECT_ID);
	await createGatedRecord(HIDDEN_ID, OTHER_PROJECT_ID);
});

afterAll(async () => {
	for (const id of [...VISIBLE_IDS, HIDDEN_ID]) await cleanScratchRecord(GATED_SECTION, id);
	await removeAclIdentityFixture();
});

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

		// Every non-admin hit must be a real project record (no over-return).
		const inProject = new Set(
			(
				(await sql`
					SELECT section_id FROM matrix_test
					WHERE section_tipo = ${GATED_SECTION}
					  AND EXISTS (
						SELECT 1 FROM jsonb_array_elements(relation->${FILTER_COMPONENT}) e
						WHERE e->>'section_id' = ${String(ACL_PROJECT_ID)}
					)
				`) as { section_id: number }[]
			).map((row) => Number(row.section_id)),
		);
		expect(inProject.size).toBeGreaterThan(0);
		for (const hit of userResult.hits) {
			expect(hit.section_tipo).toBe(GATED_SECTION);
			expect(inProject.has(hit.section_id)).toBe(true);
		}
	});

	test("read: a record outside the user's projects reads empty for them, full for admin", async () => {
		// The scratch record built with a project the non-admin does NOT hold.
		const hiddenRows = (await sql`
			SELECT section_id FROM matrix_test
			WHERE section_tipo = ${GATED_SECTION}
			  AND section_id = ${HIDDEN_ID}
			  AND NOT EXISTS (
				SELECT 1 FROM jsonb_array_elements(relation->${FILTER_COMPONENT}) e
				WHERE e->>'section_id' = ${String(ACL_PROJECT_ID)}
			)
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
		// test3.test52 (input_text, lg-eng) is the playground's searchable
		// literal. An exact-match filter must narrow the result below the
		// section total and return exactly the records whose stored value equals
		// the query — i.e. the MCP filter routes through the same per-component
		// builder the web search uses.
		const sample = (await sql`
			SELECT (
				SELECT e->>'value'
				FROM jsonb_array_elements(string->${TEXT_COMPONENT}) e
				WHERE e->>'lang' = 'lg-eng' AND e->>'value' <> ''
				LIMIT 1
			) AS v
			FROM matrix_test
			WHERE section_tipo = ${GATED_SECTION}
			  AND section_id = ${VISIBLE_IDS[0] as number}
		`) as { v: string | null }[];
		const value = sample.map((row) => row.v).find((v) => v !== null && v !== '');
		expect(value).toBeTruthy();

		const unfiltered = await searchSectionRecords(SUPERUSER, {
			section_tipo: GATED_SECTION,
			limit: 100,
		});
		const filtered = await searchSectionRecords(SUPERUSER, {
			section_tipo: GATED_SECTION,
			limit: 100,
			filter: { component_tipo: TEXT_COMPONENT, query: `==${value}`, lang: 'lg-eng' },
		});

		expect(filtered.total).toBeGreaterThan(0);
		expect(filtered.total).toBeLessThan(unfiltered.total);

		// Ground truth: records whose lg-eng value equals `value` (exact match).
		const truth = new Set(
			(
				(await sql`
					SELECT section_id FROM matrix_test
					WHERE section_tipo = ${GATED_SECTION}
					  AND EXISTS (
						SELECT 1 FROM jsonb_array_elements(string->${TEXT_COMPONENT}) e
						WHERE e->>'lang' = 'lg-eng' AND e->>'value' = ${value}
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
			searchSectionRecords(SUPERUSER, { section_tipo: "test3'; DROP TABLE matrix; --" }),
		).rejects.toThrow();
	});
});
