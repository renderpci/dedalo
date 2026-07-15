/**
 * hierarchy_state — inspect / ensure / rebuild. TS-NATIVE write-path contract.
 *
 * The four situations the PHP-inherited flows got wrong, each pinned here:
 *
 *  1. DANGLING ROOT (the Albania bug). The seed presets a hierarchy45 locator pointing at
 *     `<tld>1`/1 on 158 of 269 registry records — a record that does not exist until that
 *     tld's thesaurus is imported. The old check asked "is the locator SET?", said yes, and
 *     never created the root, so the tree had nothing to hang children on and the hierarchy
 *     could not be activated at all. `ensure` asks whether the TARGET EXISTS, treats a
 *     dangling locator as ABSENT, and creates the root.
 *
 *  2. HARD-CODED IDS. PHP pinned the model root to `<tld>2`/2 — an id that exists in almost
 *     no install (live: `es2` has no records at all, so Spain's General-term-model dangled
 *     from the day it was installed). `ensure` RESOLVES the root (lowest id) or creates one;
 *     it never hard-codes.
 *
 *  3. IMPORTED THESAURUS. When the terms ARE there, the root must be the imported one —
 *     linking blindly would be wrong, and minting a new one (what tool_hierarchy's
 *     createThesaurusGeneralTerm did) would bury the real root under a duplicate.
 *
 *  4. IDEMPOTENCE. The wizard re-runs, the operator presses the button twice. The second
 *     ensure must be a no-op (`applied: []`), not a second root.
 *
 * Scratch: tld 'zz' (not a real Dédalo tld → the sweep can be tld-scoped). The registry
 * twin is created directly so each test starts from a known, hostile shape.
 */

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import {
	ensureHierarchy,
	inspectHierarchy,
	rebuildHierarchy,
} from '../../src/core/ontology/hierarchy_state.ts';
import { deleteOntologyByTld } from '../../src/core/ontology/ontology_delete.ts';
import { getSectionMapValue } from '../../src/core/ontology/section_map.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';

const TLD = 'zz';
const SECTION = 'hierarchy1';
const TABLE = 'matrix_hierarchy_main';
const SCRATCH_ID = 900010;
const USER_ID = -1;

const check = (state: Awaited<ReturnType<typeof inspectHierarchy>>, id: string) =>
	state.checks.find((entry) => entry.id === id);

async function terms(sectionTipo: string): Promise<number[]> {
	const rows = (await sql.unsafe(
		'SELECT section_id FROM matrix_hierarchy WHERE section_tipo = $1 ORDER BY section_id',
		[sectionTipo],
	)) as { section_id: number }[];
	return rows.map((row) => Number(row.section_id));
}

async function rootLocator(componentTipo: string): Promise<Record<string, unknown> | null> {
	const rows = (await sql.unsafe(
		`SELECT relation->$3->0 AS loc FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, SCRATCH_ID, componentTipo],
	)) as { loc: Record<string, unknown> | null }[];
	return rows[0]?.loc ?? null;
}

/** Seed the registry twin. `presetRoot` reproduces the seed's DANGLING hierarchy45. */
async function seedRegistry(presetRoot: boolean): Promise<void> {
	const relation: Record<string, unknown[]> = {
		hierarchy9: [
			{
				id: 1,
				type: 'dd151',
				section_id: '2', // toponymy
				section_tipo: 'hierarchy13',
				from_component_tipo: 'hierarchy9',
			},
		],
	};
	if (presetRoot) {
		// EXACTLY what the seed ships: a Link locator at <tld>1/1, whose target does not exist.
		relation.hierarchy45 = [
			{ id: 1, type: 'dd151', section_id: '1', section_tipo: `${TLD}1`, from_component_tipo: 'hierarchy45' },
		];
	}
	await sql.unsafe(
		`INSERT INTO "${TABLE}" (section_id, section_tipo, string, relation)
		 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb)`,
		[
			SCRATCH_ID,
			SECTION,
			JSON.stringify({
				hierarchy5: [{ id: 1, lang: 'lg-eng', value: 'ZZ Scratch' }],
				hierarchy6: [{ id: 1, lang: 'lg-nolan', value: 'ZZ' }],
			}),
			JSON.stringify(relation),
		],
	);
	await clearOntologyDerivedCaches();
}

async function sweep(): Promise<void> {
	await deleteOntologyByTld(TLD, (st, sid) => deleteSectionRecord(st, sid, USER_ID));
	await sql.unsafe('DELETE FROM dd_ontology WHERE tld = $1', [TLD]);
	await sql.unsafe(`DELETE FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`, [
		SECTION,
		SCRATCH_ID,
	]);
	await sql.unsafe('DELETE FROM matrix_hierarchy WHERE section_tipo IN ($1, $2)', [
		`${TLD}1`,
		`${TLD}2`,
	]);
	await sql.unsafe(
		`DELETE FROM matrix_time_machine WHERE section_tipo IN ($1, $2, $3)
		   OR (section_tipo = $4 AND section_id = $5)`,
		[`${TLD}0`, `${TLD}1`, `${TLD}2`, SECTION, SCRATCH_ID],
	);
	await clearOntologyDerivedCaches();
}

beforeEach(sweep);
afterAll(sweep);

describe('inspectHierarchy', () => {
	test('reports a DANGLING root as broken, naming the missing target', async () => {
		await seedRegistry(true); // the seed's preset hierarchy45 → zz1/1, which does not exist

		const state = await inspectHierarchy(SCRATCH_ID);

		expect(state.usable).toBe(false);
		const root = check(state, 'root_term');
		expect(root?.ok).toBe(false);
		expect(root?.detail).toContain('DANGLING');
		expect(root?.detail).toContain('zz1/1');
		// and it is a pure read — nothing was created
		expect(await terms(`${TLD}1`)).toEqual([]);
	});

	test('flags a BARE active locator (invisible to the portals) as not ok', async () => {
		await seedRegistry(false);
		await sql.unsafe(
			`UPDATE "${TABLE}" SET relation = relation || $3::text::jsonb
			 WHERE section_tipo = $1 AND section_id = $2`,
			[
				SECTION,
				SCRATCH_ID,
				JSON.stringify({ hierarchy4: [{ id: 1, section_id: '1', section_tipo: 'dd64' }] }),
			],
		);

		const active = check(await inspectHierarchy(SCRATCH_ID), 'active');

		expect(active?.ok).toBe(false);
		expect(active?.detail).toContain('BARE');
	});
});

describe('ensureHierarchy', () => {
	test('repairs the dangling root by CREATING it, and the hierarchy becomes usable', async () => {
		await seedRegistry(true);

		const outcome = await ensureHierarchy(SCRATCH_ID, USER_ID);

		expect(outcome.result).toBe(true);
		expect(outcome.state.usable).toBe(true);
		// the root was created (the section was empty), not linked to a phantom
		expect(await terms(`${TLD}1`)).toHaveLength(1);
		const locator = await rootLocator('hierarchy45');
		expect(locator).toMatchObject({
			type: 'dd48', // Child — the canonical shape, replacing the seed's dd151
			section_tipo: `${TLD}1`,
			from_component_tipo: 'hierarchy45',
		});
		// and it points at the record that now EXISTS
		expect(await terms(`${TLD}1`)).toContain(Number(locator?.section_id));
	});

	test('LINKS the imported root instead of minting a duplicate', async () => {
		await seedRegistry(true);
		await ensureHierarchy(SCRATCH_ID, USER_ID); // provision the ontology first
		// Simulate an imported thesaurus whose root is NOT id 1 (hard-coded ids are the disease).
		await sql.unsafe('DELETE FROM matrix_hierarchy WHERE section_tipo = $1', [`${TLD}1`]);
		await sql.unsafe(
			`INSERT INTO matrix_hierarchy (section_id, section_tipo, string, relation)
			 VALUES (7, $1, '{}'::jsonb, '{}'::jsonb), (9, $1, '{}'::jsonb, '{}'::jsonb)`,
			[`${TLD}1`],
		);
		await sql.unsafe(
			`UPDATE "${TABLE}" SET relation = relation - 'hierarchy45'
			 WHERE section_tipo = $1 AND section_id = $2`,
			[SECTION, SCRATCH_ID],
		);

		const outcome = await ensureHierarchy(SCRATCH_ID, USER_ID);

		expect(outcome.result).toBe(true);
		// the EXISTING root (lowest id) is linked; no third record is minted
		expect(await terms(`${TLD}1`)).toEqual([7, 9]);
		expect(await rootLocator('hierarchy45')).toMatchObject({ section_id: '7' });
	});

	// A root term is the node the whole tree descends from. An unnamed one renders as an
	// empty row at the top of the thesaurus — the tool used to leave exactly that.
	test('NAMES a created root after the hierarchy, via the section_map term component', async () => {
		await seedRegistry(true);

		await ensureHierarchy(SCRATCH_ID, USER_ID);

		// The term component is resolved from the section_map (hierarchy52 →
		// {thesaurus:{term:'hierarchy25'}}), NOT hard-coded — a hierarchy on another real
		// section names a different component.
		const termTipo = await getSectionMapValue(`${TLD}1`, 'thesaurus', 'term');
		expect(termTipo).toBe('hierarchy25');

		const rootId = Number((await rootLocator('hierarchy45'))?.section_id);
		const rows = (await sql.unsafe(
			'SELECT string->$3 AS term FROM matrix_hierarchy WHERE section_tipo = $1 AND section_id = $2',
			[`${TLD}1`, rootId, String(termTipo)],
		)) as { term: { id?: number; lang?: string; value?: unknown }[] | null }[];

		// Copied verbatim from the hierarchy's own name (hierarchy5) — every language item.
		expect(rows[0]?.term).toEqual([{ id: 1, lang: 'lg-eng', value: 'ZZ Scratch' }]);

		// ...and the MODEL root is named too.
		const modelRootId = Number((await rootLocator('hierarchy59'))?.section_id);
		const modelRows = (await sql.unsafe(
			'SELECT string->$3 AS term FROM matrix_hierarchy WHERE section_tipo = $1 AND section_id = $2',
			[`${TLD}2`, modelRootId, String(termTipo)],
		)) as { term: { value?: unknown }[] | null }[];
		expect(modelRows[0]?.term?.[0]?.value).toBe('ZZ Scratch');
	});

	// Fill-only: an imported root, or one an operator renamed, is not ours to clobber.
	test('never OVERWRITES a root term that already has a name', async () => {
		await seedRegistry(true);
		await ensureHierarchy(SCRATCH_ID, USER_ID);
		const rootId = Number((await rootLocator('hierarchy45'))?.section_id);
		await sql.unsafe(
			`UPDATE matrix_hierarchy SET string = $3::text::jsonb
			 WHERE section_tipo = $1 AND section_id = $2`,
			[
				`${TLD}1`,
				rootId,
				JSON.stringify({ hierarchy25: [{ id: 1, lang: 'lg-eng', value: 'Renamed by hand' }] }),
			],
		);

		const outcome = await ensureHierarchy(SCRATCH_ID, USER_ID);

		expect(outcome.result).toBe(true);
		const rows = (await sql.unsafe(
			"SELECT string->'hierarchy25'->0->>'value' AS value FROM matrix_hierarchy WHERE section_tipo = $1 AND section_id = $2",
			[`${TLD}1`, rootId],
		)) as { value: string }[];
		expect(rows[0]?.value).toBe('Renamed by hand'); // untouched
	});

	test('is idempotent — the second run changes nothing', async () => {
		await seedRegistry(true);
		const first = await ensureHierarchy(SCRATCH_ID, USER_ID);
		expect(first.applied.length).toBeGreaterThan(0);
		const rootsAfterFirst = await terms(`${TLD}1`);

		const second = await ensureHierarchy(SCRATCH_ID, USER_ID);

		expect(second.result).toBe(true);
		expect(second.applied).toEqual([]); // nothing left to do
		expect(second.msg).toContain('Already consistent');
		expect(await terms(`${TLD}1`)).toEqual(rootsAfterFirst); // no duplicate root
	});

	test('refuses (without writing) when the hierarchy has no typology', async () => {
		await sql.unsafe(
			`INSERT INTO "${TABLE}" (section_id, section_tipo, string, relation)
			 VALUES ($1, $2, $3::text::jsonb, '{}'::jsonb)`,
			[
				SCRATCH_ID,
				SECTION,
				JSON.stringify({ hierarchy6: [{ id: 1, lang: 'lg-nolan', value: 'ZZ' }] }),
			],
		);
		await clearOntologyDerivedCaches();

		const outcome = await ensureHierarchy(SCRATCH_ID, USER_ID);

		expect(outcome.result).toBe(false);
		expect(outcome.msg).toContain('typology');
		expect(await terms(`${TLD}1`)).toEqual([]); // no ontology, no root, no half-built state
	});
});

describe('rebuildHierarchy', () => {
	test('rebuilds the ontology and PRESERVES the terms', async () => {
		await seedRegistry(true);
		await ensureHierarchy(SCRATCH_ID, USER_ID);
		// Add a term the operator would have entered — a rebuild must never eat it.
		await sql.unsafe(
			`INSERT INTO matrix_hierarchy (section_id, section_tipo, string, relation)
			 VALUES (42, $1, '{}'::jsonb, '{}'::jsonb)`,
			[`${TLD}1`],
		);
		const before = await terms(`${TLD}1`);
		expect(before).toContain(42);

		const outcome = await rebuildHierarchy(SCRATCH_ID, USER_ID, (st, sid) =>
			deleteSectionRecord(st, sid, USER_ID),
		);

		expect(outcome.result).toBe(true);
		expect(outcome.state.usable).toBe(true);
		expect(await terms(`${TLD}1`)).toEqual(before); // the TERMS survived the teardown
		expect(outcome.applied[0]).toContain('tore down');
	});
});
