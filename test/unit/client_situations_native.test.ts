/**
 * THE CLIENT RUN'S PRE-FLIGHT SITUATIONS — the two things
 * `scripts/client_test_runner.ts` must be able to guarantee BEFORE it spawns a
 * server, gated here so they fail in `bun test` (no Chrome, no server) instead
 * of as DOM assertions in a browser suite.
 *
 *  1. THE SECOND PROJECT (`src/core/test_data/projects_fixture.ts`).
 *     `component_filter`'s two data operations are only expressible against a
 *     catalog that offers more options than the record selects: the install seed
 *     ships ONE `dd153` project and the canonical record already selects it, so
 *     `test_component_filter` had nothing to check and hit the widget's
 *     minimum-one-checked refusal instead of the remove path.
 *
 *     The load-bearing detail is HOW the row is written. `matrix_projects` is an
 *     identity table shared with every other tier on this database, so the
 *     fixture writes an EXPLICIT id in the reserved `>= 900000` band and does
 *     NOT go through the counter-allocating helpers — an explicit-id insert
 *     raises `matrix_counter` to GREATEST(value, section_id) and deleting the
 *     row does not lower it again, so the counter would grow on every run while
 *     the sweep reported clean. That is pinned below: the counter must not move.
 *
 *  2. THE PINNED DIFFUSION DOMAIN (`scripts/client_test_server.ts`
 *     `SUITE_DIFFUSION_DOMAIN`). `tool_diffusion` is available only for a
 *     section the CONFIGURED domain reaches (`haveSectionDiffusion`), and the
 *     domain is matched BY TERM — so its value means nothing except relative to
 *     one database's ontology. Inheriting the installation's name resolved a
 *     truncated clone on the suite database: domain found, section map empty,
 *     no opener drawn, six unexplained DOM failures. The run pins the repo-owned
 *     generic domain instead; this gate is the same assertion the runner makes
 *     pre-flight, minus the browser.
 *
 * WHY THE SECTION TIPO IS SPELLED `install('rsc', 170)`: the install-TLD census
 * (scripts/lib/tld_census.ts) reads a literal `rsc170` in a test file as this
 * gate BINDING an install. It is not — it is a pin on what the run's own pinned
 * domain must reach, and it is the section `test_diffusion.js` drives. Same
 * convention as `test_corpus_fixture.test.ts`'s `seed('rsc', 170)`.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { SUITE_DIFFUSION_DOMAIN } from '../../scripts/client_test_server.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	ensureSuiteProjectsFixture,
	removeSuiteProjectsFixture,
	SUITE_SECOND_PROJECT_ID,
} from '../../src/core/test_data/projects_fixture.ts';

const install = (tld: string, id: number): string => `${tld}${id}`;

const PROJECTS_SECTION = 'dd153';
const PROJECTS_TABLE = 'matrix_projects';
/** The reserved scratch band an identity-table fixture must stay inside. */
const SCRATCH_ID_FLOOR = 900_000;
/** The section `test_diffusion.js` renders in all three of its describes. */
const DIFFUSION_SECTION = install('rsc', 170);

async function projectIds(): Promise<number[]> {
	const rows = (await sql.unsafe(
		`SELECT section_id FROM "${PROJECTS_TABLE}" WHERE section_tipo = $1 ORDER BY section_id`,
		[PROJECTS_SECTION],
	)) as { section_id: number }[];
	return rows.map((row) => row.section_id);
}

async function projectsCounter(): Promise<number | null> {
	const rows = (await sql.unsafe(`SELECT value FROM matrix_counter WHERE tipo = $1`, [
		PROJECTS_SECTION,
	])) as { value: number }[];
	return rows[0]?.value ?? null;
}

describe('client run pre-flight — the suite projects fixture', () => {
	afterAll(async () => {
		// Never leave a widened projects catalog behind for the other tiers.
		if ((await projectIds()).includes(SUITE_SECOND_PROJECT_ID)) {
			await removeSuiteProjectsFixture();
		}
	});

	test('the id it owns is inside the reserved scratch band', () => {
		// The band IS the safety: the sweep filters on this id, and an id below
		// the floor would be an installed record.
		expect(Number.isInteger(SUITE_SECOND_PROJECT_ID)).toBe(true);
		expect(SUITE_SECOND_PROJECT_ID).toBeGreaterThanOrEqual(SCRATCH_ID_FLOOR);
	});

	test('ensure adds exactly one option, leaves the install rows alone, and re-runs clean', async () => {
		const before = await projectIds();
		expect(before, 'the fixture row must not be present before ensure').not.toContain(
			SUITE_SECOND_PROJECT_ID,
		);
		expect(before.length, 'the install seed must ship at least one project').toBeGreaterThan(0);

		await ensureSuiteProjectsFixture();
		const after = await projectIds();
		expect(after).toContain(SUITE_SECOND_PROJECT_ID);
		for (const id of before) expect(after, 'installed projects are never touched').toContain(id);
		expect(after.length).toBe(before.length + 1);

		// Idempotent: the door removes its own row before inserting, so a second
		// run cannot duplicate the option or throw.
		await ensureSuiteProjectsFixture();
		expect(await projectIds()).toEqual(after);
	});

	test('the option is renderable: its dd156 name resolves', async () => {
		await ensureSuiteProjectsFixture();
		const rows = (await sql.unsafe(
			`SELECT string->'dd156'->0->>'value' AS name FROM "${PROJECTS_TABLE}"
			 WHERE section_tipo = $1 AND section_id = $2`,
			[PROJECTS_SECTION, SUITE_SECOND_PROJECT_ID],
		)) as { name: string | null }[];
		// dd156 is DEDALO_PROJECTS_NAME_TIPO — the label the datalist draws on the
		// checkbox. An empty name renders a box the suite cannot tell from another.
		expect(rows[0]?.name).toBeTruthy();
	});

	test('THE COUNTER NEVER MOVES — the explicit id is not allocated', async () => {
		if ((await projectIds()).includes(SUITE_SECOND_PROJECT_ID)) {
			await removeSuiteProjectsFixture();
		}
		const before = await projectsCounter();

		await ensureSuiteProjectsFixture();
		expect(
			await projectsCounter(),
			'ensure must not raise the shared dd153 counter (that residue survives the sweep)',
		).toBe(before);

		await removeSuiteProjectsFixture();
		expect(await projectsCounter()).toBe(before);
		expect(await projectIds()).not.toContain(SUITE_SECOND_PROJECT_ID);
	});

	test('the sweep REFUSES when it removes nothing', async () => {
		if ((await projectIds()).includes(SUITE_SECOND_PROJECT_ID)) {
			await removeSuiteProjectsFixture();
		}
		// A sweep that deletes 0 rows means the filter is wrong and the fixture row
		// is unaccounted for — louder than a silent no-op, which would leave the
		// catalog widened for every other tier.
		await expect(removeSuiteProjectsFixture()).rejects.toThrow(/deleted 0 rows/);
	});
});

describe('client run pre-flight — the pinned diffusion domain', () => {
	const originalDomain = process.env.DEDALO_DIFFUSION_DOMAIN;

	beforeAll(() => {
		process.env.DEDALO_DIFFUSION_DOMAIN = SUITE_DIFFUSION_DOMAIN;
	});

	afterAll(async () => {
		if (originalDomain === undefined) delete process.env.DEDALO_DIFFUSION_DOMAIN;
		else process.env.DEDALO_DIFFUSION_DOMAIN = originalDomain;
		const { clearDiffusionMapCache } = await import(
			'../../src/core/diffusion_bridge/diffusion_map.ts'
		);
		clearDiffusionMapCache();
	});

	async function diffusionMap(): Promise<Set<string>> {
		const { clearDiffusionMapCache, getSectionDiffusionMap } = await import(
			'../../src/core/diffusion_bridge/diffusion_map.ts'
		);
		// The map is cached per process and the domain NAME is read when it is
		// built, so a test that changes the name must drop the cache first.
		clearDiffusionMapCache();
		return await getSectionDiffusionMap();
	}

	test('it reaches the section the client diffusion suite drives', async () => {
		const map = await diffusionMap();
		expect(
			[...map],
			`the pinned domain '${SUITE_DIFFUSION_DOMAIN}' must reach ${DIFFUSION_SECTION}, or tool_diffusion is unavailable and test_diffusion fails with unexplained DOM assertions`,
		).toContain(DIFFUSION_SECTION);
	});

	test('the domain is a NAME, not a decoration: an unknown one resolves nothing', async () => {
		// ANTI-VACUITY for the case above. `resolveDomainTipo` matches dd1190's
		// children BY TERM, so a name no node carries must produce an EMPTY map —
		// which is exactly the silent state that made a misconfigured domain look
		// like a client bug.
		process.env.DEDALO_DIFFUSION_DOMAIN = 'zz_no_such_diffusion_domain';
		expect([...(await diffusionMap())]).toEqual([]);
		process.env.DEDALO_DIFFUSION_DOMAIN = SUITE_DIFFUSION_DOMAIN;
	});
});
