/**
 * ONTOLOGY UPDATE — a throw in the dd_ontology RE-DERIVE never restores the old
 * matrix rows under the tlds already re-derived from the new ones
 * (cross-write:r3, review of b095553e22..ffc2a8479b, S2 ops-durability).
 *
 * THE DEFECT. importStagedOntologyFiles marked the import `completed` only after
 * deriveStagedNodes. That derive is one COMMITTED transaction per tld
 * (rebuildOntology), so a throw escaping it after the first tld committed — a
 * read inside rebuildOntology's own catch, the post-commit inspect, pass 2's
 * inspect — reached the catch with `landed: false`: restoreSnapshots put the OLD
 * matrix_ontology rows back for every staged tld, and the tld already re-derived
 * kept the dd_ontology built from the NEW rows. dd_ontology != parse(matrix) for
 * that tld: the state neither version was ever in, behind "previous state
 * restored".
 *
 * THE OUTCOME PINNED (two scratch tlds through the REAL shared layer, staged
 * files written from the package fixture's record lines):
 *   - the second tld's derive throws for real: a localontology0 override of its
 *     node that both removes and fills `css` (parser.ts statedOverrideKeys — a
 *     contradictory override; rebuildOntology rolls its transaction back, and the
 *     inspect in its catch parses the same record and throws again, out of it);
 *   - the import LANDED (Phase C committed every file): `completed`, the NEW rows
 *     of both tlds stand, the first tld is IN SYNC (its dd_ontology is the parse
 *     of the rows it stands on), and the errors name every tld to re-derive
 *     (never the raw text — it goes to the log);
 *   - FLOOR: the pre-state is real (the old rows and their derive, built through
 *     the same door) and the derive really ran for the first tld.
 *
 * Scratch: tlds `zzuda` / `zzudb` (sweep prefix `zzud%`), their registry rows in
 * matrix_ontology_main (+ TM + activity rows), one localontology0 override row
 * at an id asserted free first, a mkdtemp() dir; non-scratch census held,
 * zero residue asserted.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from '../../src/core/db/postgres.ts';
import { connFromConfig, type DbConnDescriptor } from '../../src/core/install/pg_exec.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { inspectOntology } from '../../src/core/ontology/ontology_state.ts';
import {
	HIERARCHY_TLD,
	ONTOLOGY_CSS,
	ONTOLOGY_MAIN_SECTION,
	ONTOLOGY_OVERWRITE,
	ONTOLOGY_PROPERTIES,
} from '../../src/core/ontology/ontology_tipos.ts';
import { importStagedOntologyFiles } from '../../src/core/ontology/ontology_update.ts';
import type { StagedFile } from '../../src/core/ontology/ontology_update_target.ts';
import { LOCAL_ONTOLOGY_SECTION } from '../../src/core/ontology/tld.ts';
import {
	type FixtureOntologyNode,
	ontologyCopyRow,
} from '../../src/core/test_data/ontology_package_fixture.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { countActivityRows, sweepActivityRows } from '../helpers/activity_rows.ts';

const ZZ_LIKE = 'zzud%';
const TLD_A = 'zzuda';
const TLD_B = 'zzudb';
/** The contradictory override's localontology0 id (asserted free before use). */
const OVERRIDE_ID = 947311;

let workDir = '';
let conn: DbConnDescriptor;
let model = '';
const registryIds = new Set<number>();

async function one(query: Promise<unknown>): Promise<string> {
	const rows = (await query) as { c: unknown }[];
	return String(rows[0]?.c);
}

async function nonScratchCensus(): Promise<Record<string, string>> {
	return {
		ddOntology: await one(
			sql`SELECT count(*)::int AS c FROM dd_ontology WHERE coalesce(tld, '') NOT LIKE ${ZZ_LIKE}`,
		),
		matrixOntology: await one(
			sql`SELECT count(*)::int AS c FROM matrix_ontology WHERE section_tipo NOT LIKE ${ZZ_LIKE}`,
		),
		registry: await one(
			sql`SELECT count(*)::int AS c FROM matrix_ontology_main
			     WHERE coalesce(string->${HIERARCHY_TLD}->0->>'value', '') NOT LIKE ${ZZ_LIKE}`,
		),
	};
}

/** The record terms of one scratch tld's matrix rows, by section_id. */
async function rowTerms(tld: string): Promise<string[]> {
	const rows = (await sql.unsafe(
		`SELECT section_id::text || ':' || coalesce(string->'ontology5'->0->>'value', '') AS r
		 FROM matrix_ontology WHERE section_tipo = $1 ORDER BY section_id`,
		[`${tld}0`],
	)) as { r: string }[];
	return rows.map((row) => row.r);
}

/** Stage one scratch tld's record lines as a plain .copy file (what the stager hands on). */
function staged(tld: string, nodes: FixtureOntologyNode[], tag: string): StagedFile {
	const stagedPath = join(workDir, `${tld}.${tag}.copy`);
	writeFileSync(stagedPath, nodes.map((node) => `${ontologyCopyRow(tld, node)}\n`).join(''));
	return { tld, sectionTipo: `${tld}0`, stagedPath };
}

async function importOnce(files: StagedFile[], tag: string) {
	const recoveryDir = mkdtempSync(join(workDir, `recovery-${tag}-`));
	const result = await importStagedOntologyFiles(files, { conn, userId: -1, recoveryDir });
	for (const row of (await sql`SELECT section_id FROM matrix_ontology_main
		WHERE section_tipo = ${ONTOLOGY_MAIN_SECTION}
		  AND coalesce(string->${HIERARCHY_TLD}->0->>'value', '') LIKE ${ZZ_LIKE}`) as {
		section_id: number;
	}[]) {
		registryIds.add(Number(row.section_id));
	}
	return result;
}

async function sweep(): Promise<void> {
	const ids = [...registryIds].map(String).join(',');
	if (ids !== '') {
		await sql`DELETE FROM matrix_time_machine WHERE section_tipo = ${ONTOLOGY_MAIN_SECTION}
			AND section_id = ANY(string_to_array(${ids}, ',')::int[])`;
		await sql`DELETE FROM matrix_ontology_main WHERE section_tipo = ${ONTOLOGY_MAIN_SECTION}
			AND section_id = ANY(string_to_array(${ids}, ',')::int[])`;
		await sweepActivityRows(ONTOLOGY_MAIN_SECTION, [...registryIds]);
	}
	await sql`DELETE FROM matrix_ontology WHERE section_tipo = ${LOCAL_ONTOLOGY_SECTION}
		AND section_id = ${OVERRIDE_ID}`;
	await sql`DELETE FROM matrix_ontology WHERE section_tipo LIKE ${ZZ_LIKE}`;
	await sql`DELETE FROM dd_ontology WHERE tld LIKE ${ZZ_LIKE}`;
	await sql`DELETE FROM matrix_time_machine WHERE section_tipo LIKE ${ZZ_LIKE}`;
	await sql`DELETE FROM matrix_counter WHERE tipo LIKE ${ZZ_LIKE}`;
	await clearOntologyDerivedCaches();
}

let censusBefore: Record<string, string> = {};

beforeAll(async () => {
	await assertTestDatabase('ontology_update_derive_throw_native');
	conn = connFromConfig();
	workDir = mkdtempSync(join(tmpdir(), 'zzud-'));
	await sweep();
	censusBefore = await nonScratchCensus();
	// The nodes' model: the suite's own component_input_text model node (what ontology7 is).
	const rows = (await sql`SELECT model_tipo FROM dd_ontology WHERE tipo = 'ontology7'`) as {
		model_tipo: string;
	}[];
	model = String(rows[0]?.model_tipo ?? '');
	expect(model).not.toBe('');
	const taken = (await sql`SELECT count(*)::int AS c FROM matrix_ontology
		WHERE section_tipo = ${LOCAL_ONTOLOGY_SECTION} AND section_id = ${OVERRIDE_ID}`) as {
		c: number;
	}[];
	expect(taken[0]?.c).toBe(0);
}, 60_000);

afterAll(async () => {
	await sweep();
	rmSync(workDir, { recursive: true, force: true });
	expect(await nonScratchCensus()).toEqual(censusBefore);
	expect((await sql`SELECT tipo FROM dd_ontology WHERE tld LIKE ${ZZ_LIKE}`) as unknown[]).toEqual(
		[],
	);
	expect(await countActivityRows(ONTOLOGY_MAIN_SECTION, [...registryIds])).toBe(0);
}, 60_000);

describe('importStagedOntologyFiles: a derive throw after a committed tld', () => {
	test('the import landed: the new rows stand, the derived tld is in sync, the rest is named', async () => {
		const node = (id: number, tld: string, term: string): FixtureOntologyNode => ({
			id,
			parent: `${tld}0`,
			model,
			term,
		});
		// PRE-STATE through the same door: the OLD rows and their derive.
		const old = await importOnce(
			[
				staged(TLD_A, [node(1, TLD_A, 'old a')], 'old'),
				staged(TLD_B, [node(1, TLD_B, 'old b')], 'old'),
			],
			'old',
		);
		expect(old.completed).toBe(true);
		expect(await rowTerms(TLD_A)).toEqual(['1:old a']);
		// FLOOR: the inspect read the tld's nodes — an empty drift over none proves nothing.
		const oldState = await inspectOntology(TLD_A);
		expect(oldState.matrixNodes).toBeGreaterThan(0);
		expect(oldState.drift).toEqual([]);

		// The second tld's node now carries a CONTRADICTORY override: its parse throws.
		await sql.unsafe(
			`INSERT INTO matrix_ontology (section_id, section_tipo, relation, misc)
			 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb)`,
			[
				OVERRIDE_ID,
				LOCAL_ONTOLOGY_SECTION,
				JSON.stringify({
					[ONTOLOGY_OVERWRITE]: [
						{
							id: 1,
							type: 'dd151',
							section_id: '1',
							section_tipo: `${TLD_B}0`,
							from_component_tipo: ONTOLOGY_OVERWRITE,
						},
					],
				}),
				JSON.stringify({
					[ONTOLOGY_PROPERTIES]: [{ id: 1, lang: 'lg-nolan', value: { css: null } }],
					[ONTOLOGY_CSS]: [{ id: 1, lang: 'lg-nolan', value: { '.x': {} } }],
				}),
			],
		);
		await clearOntologyDerivedCaches();

		const result = await importOnce(
			[
				staged(TLD_A, [node(1, TLD_A, 'new a'), node(2, TLD_A, 'new a2')], 'new'),
				staged(TLD_B, [node(1, TLD_B, 'new b')], 'new'),
			],
			'new',
		);
		// The rows of BOTH tlds are the update's — nothing was restored under a derive.
		expect(await rowTerms(TLD_A)).toEqual(['1:new a', '2:new a2']);
		expect(await rowTerms(TLD_B)).toEqual(['1:new b']);
		expect(result.completed).toBe(true);
		// FLOOR + the invariant: the first tld WAS re-derived from the new rows, and
		// its dd_ontology is the parse of the rows it stands on.
		const stateA = await inspectOntology(TLD_A);
		expect(stateA.matrixNodes).toBe(2);
		expect(stateA.drift).toEqual([]);
		// The operator is told the import landed and which tlds to re-derive — a
		// deliberate sentence, the raw parser text only in the log.
		expect(result.errors).toContain(
			`the ontology rows of this update were imported; re-deriving dd_ontology from them failed (see the server log) — rebuild the ontology of: ${TLD_A}, ${TLD_B}`,
		);
		expect(result.errors.join('\n')).not.toContain('both removes');
	}, 120_000);
});
