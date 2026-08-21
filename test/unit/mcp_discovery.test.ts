/**
 * Gate: MCP discovery tier + search upgrade (Phase 2 of the work-system MCP
 * foundation — rewrite/ai/mcp_review.md §2).
 *
 * - name→tipo resolution is accent/case-insensitive and NEVER auto-picks an
 *   ambiguous label (pure tests, no DB);
 * - dedalo_list_sections is ACL-honest: a gated user sees a strict subset of
 *   the admin census (live DB);
 * - dedalo_describe_section maps fields with simplified types and resolves a
 *   real portal's target sections (test3 → test80 → test3);
 * - dedalo_resolve_path validates a real traversal and rejects a fake one;
 * - dedalo_search_records routes typed recursive filters through the same
 *   per-component builders as the web search (exact-match ground truth), and
 *   the raw_sqo escape hatch cannot smuggle an invalid identifier past the
 *   chokepoint.
 *
 * THE SITUATION IS BUILT, NOT BORROWED (generic-`test`-TLD migration,
 * 2026-08-19). Every fixture used to be an install's record (`numisdata3`,
 * `numisdata6`, `numisdata267`, user 16) — green on one machine only, and
 * satisfiable at 0-versus-0 everywhere else. The gate now runs on the generic
 * `test` playground: `test3` with its portal `test80`, its literal `test52`,
 * and — for the ACL half — the synthetic identities of
 * test/helpers/acl_identity_fixture.ts plus three scratch records this file
 * creates and removes, two of them carrying the non-admin's project through
 * test3's own component_filter `test101`.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
	matchTerm,
	normalizeLabel,
	pickUnambiguous,
	resolveFieldCandidates,
} from '../../src/ai/mcp/label_resolution.ts';
import { getToolSpec, runTool } from '../../src/ai/mcp/registry.ts';
import {
	describeSection,
	listSections,
	resolveOntologyName,
	resolvePath,
} from '../../src/ai/mcp/tools/discovery.ts';
import { countRecords, searchRecords } from '../../src/ai/mcp/tools/search.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { labelByTipo } from '../../src/core/ontology/labels.ts';
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

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
/** The synthetic non-admin: ONE project, a read grant on test3 (see the fixture). */
const NON_ADMIN: Principal = {
	userId: ACL_NON_ADMIN_USER_ID,
	isGlobalAdmin: false,
	isDeveloper: false,
};

/** Generic `test` playground fixtures (shared with the mcp_tools gate). */
const HOST_SECTION = 'test3';
/** test3's portal whose declared target is test3 itself. */
const PORTAL_FIELD = 'test80';
const TEXT_SECTION = 'test3';
const TEXT_COMPONENT = 'test52';
/** A section PORTAL_FIELD does NOT link — the negative half of resolve_path. */
const UNLINKED_SECTION = 'test2';
/** The project-gated section (component_filter test101) — test3 again. */
const GATED_SECTION = 'test3';
const FILTER_COMPONENT = 'test101';
const PROJECTS_SECTION = 'dd153';
const PROJECT_LOCATOR_TYPE = 'dd675';

/** Scratch records this gate owns (reserved >= 900000 band). */
const VISIBLE_IDS = [942001, 942002];
const HIDDEN_ID = 942003;
/** A project the non-admin does NOT hold — what makes HIDDEN_ID hidden. */
const OTHER_PROJECT_ID = 1;

async function createGatedRecord(sectionId: number, projectId: number): Promise<void> {
	await createScratchRecord(GATED_SECTION, sectionId, {
		relation: {
			[FILTER_COMPONENT]: [
				{
					id: 1,
					type: PROJECT_LOCATOR_TYPE,
					section_id: String(projectId),
					section_tipo: PROJECTS_SECTION,
					from_component_tipo: FILTER_COMPONENT,
				},
			],
		},
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

describe('label resolution (pure)', () => {
	test('normalizeLabel strips accents, case and extra whitespace', () => {
		expect(normalizeLabel('  História   ORAL ')).toBe('historia oral');
		expect(normalizeLabel('Ceca')).toBe('ceca');
	});

	test('matchTerm ranks exact < prefix < substring across languages', () => {
		const term = { 'lg-eng': 'Surname', 'lg-spa': 'Apellido' };
		expect(matchTerm(term, 'surname')?.rank).toBe(0);
		expect(matchTerm(term, 'apellido')?.rank).toBe(0);
		expect(matchTerm(term, 'sur')?.rank).toBe(1);
		expect(matchTerm(term, 'name')?.rank).toBe(2);
		expect(matchTerm(term, 'zzz')).toBeNull();
	});

	test('pickUnambiguous: one exact wins over looser matches; two exacts are ambiguous', () => {
		const fields = [
			{ tipo: 'aa1', term: { 'lg-eng': 'Name' } },
			{ tipo: 'aa2', term: { 'lg-eng': 'Name (variant)' } },
			{ tipo: 'aa3', term: { 'lg-eng': 'Name' } },
		];
		// 'name' matches aa1+aa3 exactly and aa2 by prefix → ambiguous.
		expect(pickUnambiguous(resolveFieldCandidates('name', fields))).toBeNull();
		// 'name (variant)' matches aa2 exactly, others not at all → unambiguous.
		expect(pickUnambiguous(resolveFieldCandidates('name (variant)', fields))?.tipo).toBe('aa2');
		// A valid tipo passes through without touching labels.
		expect(pickUnambiguous(resolveFieldCandidates('aa3', fields))?.tipo).toBe('aa3');
	});
});

describe('MCP discovery tools (live ontology)', () => {
	test('list_sections: gated user sees a strict subset of the admin census', async () => {
		const adminView = await listSections(SUPERUSER, {});
		const userView = await listSections(NON_ADMIN, {});
		expect(adminView.sections.length).toBeGreaterThan(0);
		const adminTipos = new Set(adminView.sections.map((section) => section.tipo));
		expect(adminTipos.has(TEXT_SECTION)).toBe(true);
		// Subset + strictly fewer (user 16 is project-gated).
		for (const section of userView.sections) {
			expect(adminTipos.has(section.tipo)).toBe(true);
		}
		expect(userView.sections.length).toBeLessThan(adminView.sections.length);
	});

	test('describe_section maps fields with simplified types + portal targets', async () => {
		const described = await describeSection(SUPERUSER, { section: HOST_SECTION });
		expect(described.section_tipo).toBe(HOST_SECTION);
		const portal = described.fields.find((field) => field.tipo === PORTAL_FIELD);
		expect(portal).toBeDefined();
		expect(portal?.type).toBe('link');
		expect(portal?.target_sections?.length ?? 0).toBeGreaterThan(0);

		const textSection = await describeSection(SUPERUSER, { section: TEXT_SECTION });
		const textField = textSection.fields.find((field) => field.tipo === TEXT_COMPONENT);
		expect(textField?.type).toBe('text');
	});

	test('describe_section accepts the human section name (round-trip via label)', async () => {
		const label = await labelByTipo(TEXT_SECTION, 'lg-spa');
		expect(label).toBeTruthy();
		const described = await describeSection(SUPERUSER, {
			section: label as string,
			lang: 'lg-spa',
		});
		expect(described.section_tipo).toBe(TEXT_SECTION);
	});

	test('resolve: a section label resolves to its tipo among the candidates', async () => {
		const label = await labelByTipo(TEXT_SECTION, 'lg-spa');
		const resolved = await resolveOntologyName(SUPERUSER, { name: label as string });
		expect(resolved.candidates.some((candidate) => candidate.tipo === TEXT_SECTION)).toBe(true);
	});

	test('resolve_path validates a real portal traversal and rejects a fake one', async () => {
		const described = await describeSection(SUPERUSER, { section: HOST_SECTION });
		const portal = described.fields.find((field) => field.tipo === PORTAL_FIELD);
		const target = portal?.target_sections?.[0] as string;
		expect(target).toBeTruthy();
		// Any leaf field of the target completes a [section, portal, section, leaf] path.
		const targetMap = await describeSection(SUPERUSER, { section: target });
		const leaf = targetMap.fields[0];
		expect(leaf).toBeDefined();

		const resolved = await resolvePath(SUPERUSER, {
			path: [HOST_SECTION, PORTAL_FIELD, target, (leaf as { tipo: string }).tipo],
		});
		expect(resolved.path).toEqual([
			{ section_tipo: HOST_SECTION, component_tipo: PORTAL_FIELD },
			{ section_tipo: target, component_tipo: (leaf as { tipo: string }).tipo },
		]);

		// A traversal into a section the portal does NOT target fails loudly.
		const unlinked = await describeSection(SUPERUSER, { section: UNLINKED_SECTION });
		const unlinkedLeaf = unlinked.fields[0] as { tipo: string };
		expect(unlinkedLeaf).toBeDefined();
		await expect(
			resolvePath(SUPERUSER, {
				path: [HOST_SECTION, PORTAL_FIELD, UNLINKED_SECTION, unlinkedLeaf.tipo],
			}),
		).rejects.toMatchObject({
			code: 'request.invalid',
			publicMessage: expect.stringMatching(/does not link/),
		});
	});
});

describe('MCP search upgrade (live DB)', () => {
	/** A stored lg-eng value of test3.test52 (the playground's searchable literal). */
	async function sampleValue(): Promise<string> {
		const rows = (await sql`
			SELECT (
				SELECT e->>'value'
				FROM jsonb_array_elements(string->${TEXT_COMPONENT}) e
				WHERE e->>'lang' = 'lg-eng' AND e->>'value' <> ''
				LIMIT 1
			) AS v
			FROM matrix_test
			WHERE section_tipo = ${TEXT_SECTION}
			  AND string->${TEXT_COMPONENT} IS NOT NULL
			ORDER BY section_id
		`) as { v: string | null }[];
		const value = rows.map((row) => row.v).find((v) => v !== null && v !== '');
		if (value === undefined || value === null) throw new Error('fixture value missing');
		return value;
	}

	test('typed eq filter reproduces the ground truth via the real builders', async () => {
		const value = await sampleValue();
		const result = await searchRecords(SUPERUSER, {
			section_tipo: TEXT_SECTION,
			filter: { field: TEXT_COMPONENT, op: 'eq', value, lang: 'lg-eng' },
			full_count: true,
			limit: 100,
		});
		expect(result.pagination.total).toBeGreaterThan(0);

		const truth = new Set(
			(
				(await sql`
					SELECT section_id FROM matrix_test
					WHERE section_tipo = ${TEXT_SECTION}
					  AND EXISTS (
						SELECT 1 FROM jsonb_array_elements(string->${TEXT_COMPONENT}) e
						WHERE e->>'lang' = 'lg-eng' AND e->>'value' = ${value}
					)
				`) as { section_id: number }[]
			).map((row) => Number(row.section_id)),
		);
		expect(result.data.hits.length).toBe(truth.size);
		for (const hit of result.data.hits) {
			expect(truth.has(hit.section_id)).toBe(true);
		}
	});

	test('recursive OR nesting widens the result; count agrees with full_count', async () => {
		const value = await sampleValue();
		const eqOnly = await searchRecords(SUPERUSER, {
			section_tipo: TEXT_SECTION,
			filter: { field: TEXT_COMPONENT, op: 'eq', value, lang: 'lg-eng' },
			full_count: true,
		});
		const orWidened = await searchRecords(SUPERUSER, {
			section_tipo: TEXT_SECTION,
			filter: {
				or: [
					{ field: TEXT_COMPONENT, op: 'eq', value, lang: 'lg-eng' },
					{ field: TEXT_COMPONENT, op: 'not_empty', lang: 'lg-eng' },
				],
			},
			full_count: true,
		});
		expect(orWidened.pagination.total as number).toBeGreaterThanOrEqual(
			eqOnly.pagination.total as number,
		);

		const counted = await countRecords(SUPERUSER, {
			section_tipo: TEXT_SECTION,
			filter: { field: TEXT_COMPONENT, op: 'eq', value, lang: 'lg-eng' },
		});
		expect(counted.total).toBe(eqOnly.pagination.total as number);
	});

	test('field labels resolve inside filters (label ≡ tipo result)', async () => {
		const value = await sampleValue();
		const label = await labelByTipo(TEXT_COMPONENT, 'lg-spa');
		expect(label).toBeTruthy();
		const byTipo = await countRecords(SUPERUSER, {
			section_tipo: TEXT_SECTION,
			filter: { field: TEXT_COMPONENT, op: 'eq', value, lang: 'lg-eng' },
		});
		const byLabel = await countRecords(SUPERUSER, {
			section_tipo: TEXT_SECTION,
			filter: { field: label as string, op: 'eq', value, lang: 'lg-eng' },
		});
		expect(byLabel.total).toBe(byTipo.total);
	});

	test('ACL: the gated user total is strictly below the admin total', async () => {
		const adminCount = await countRecords(SUPERUSER, { section_tipo: GATED_SECTION });
		const userCount = await countRecords(NON_ADMIN, { section_tipo: GATED_SECTION });
		expect(adminCount.total).toBeGreaterThan(0);
		expect(userCount.total).toBeGreaterThan(0);
		expect(userCount.total).toBeLessThan(adminCount.total);
	});

	test('raw_sqo cannot smuggle an invalid identifier or retarget the search', async () => {
		const spec = getToolSpec('dedalo_search_records');
		if (spec === undefined) throw new Error('spec missing');
		// Injection-shaped component tipo inside a raw_sqo leaf → invalid_tipo.
		const smuggled = await runTool(spec, SUPERUSER, {
			section_tipo: TEXT_SECTION,
			raw_sqo: {
				filter: {
					$and: [
						{
							q: 'x',
							path: [{ section_tipo: TEXT_SECTION, component_tipo: "x'; DROP TABLE matrix; --" }],
						},
					],
				},
			},
		});
		expect(smuggled.ok).toBe(false);
		if (!smuggled.ok) expect(smuggled.error.code).toBe('request.invalid_tipo');

		// A section_tipo smuggled INSIDE raw_sqo is ignored: the search stays on
		// the validated argument.
		const retargeted = await searchRecords(SUPERUSER, {
			section_tipo: TEXT_SECTION,
			raw_sqo: { filter: undefined, limit: 5, section_tipo: [UNLINKED_SECTION] } as unknown,
		});
		for (const hit of retargeted.data.hits) {
			expect(hit.section_tipo).toBe(TEXT_SECTION);
		}
	});

	test('server-only SQO keys are stripped before the assembler', async () => {
		// A smuggled prebuilt sentence/params pair must be inert (sanitize gate).
		const result = await searchRecords(SUPERUSER, {
			section_tipo: TEXT_SECTION,
			raw_sqo: {
				filter: undefined,
				limit: 1,
				sentence: 'SELECT * FROM matrix_users',
				skip_projects_filter: true,
			} as unknown,
		});
		expect(result.data.hits.length).toBeLessThanOrEqual(1);
		for (const hit of result.data.hits) {
			expect(hit.section_tipo).toBe(TEXT_SECTION);
		}
	});
});
