/**
 * tool_hierarchy `generate_virtual_section` — TS-NATIVE write-path contract.
 *
 * The virtual sections are provisioned with FIXED record ids (`<tld>0/1`
 * descriptor, `<tld>0/2` model), so Generate is NOT idempotent: a second run on
 * the same tld used to collide on matrix_ontology's
 * (section_id, section_tipo) unique key and surface the raw PostgresError to the
 * operator. Two contracts are pinned here:
 *
 *  1. RE-GENERATE REFUSES CLEANLY — an already-provisioned tld is detected
 *     BEFORE the write phase (result:false, "already generated", pointing at
 *     Force to create). No throw, and the existing nodes are left alone.
 *
 *  2. force_to_create REBUILDS WITHOUT EATING THE REGISTRY RECORD — the teardown
 *     is BY TLD (ontology::delete_ontology): dd_ontology nodes + the ontology_main
 *     row resolved from the tld + the `<tld>0` node records. The hierarchy1 record
 *     that DESCRIBES the hierarchy must survive, because provisioning re-reads it
 *     immediately afterwards. The pre-fix code called deleteOntologyMain, which
 *     deletes the CALLER's record — force_to_create destroyed the hierarchy1 record
 *     and then failed with "hierarchy record not found". That is the regression this
 *     test exists to catch; deleteOntologyMain keeps the record-deleting behavior for
 *     its OTHER caller (the dd_core_api delete cascade), where it is correct.
 *
 * Scratch hygiene: one throwaway hierarchy1 twin (tld 'zz'), its provisioned
 * dd_ontology nodes, its `zz0` node records and its ontology_main row — all swept
 * in afterAll. 'zz' is not a real Dédalo tld, so the sweep can be tld-scoped.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { generateVirtualSection } from '../../src/core/ontology/hierarchy_provision.ts';
import { deleteOntologyByTld } from '../../src/core/ontology/ontology_delete.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';
import { toolHierarchyGenerateVirtualSection } from '../../tools/tool_hierarchy/server/tool_hierarchy.ts';

const SECTION_TIPO = 'hierarchy1';
const TABLE = 'matrix_hierarchy_main';
const SCRATCH_ID = 900001;
const TLD = 'zz';
const NODES_SECTION = 'zz0';
const USER_ID = -1;

/** The tool's context, minus the parts this handler never reads. */
const toolContext = (options: Record<string, unknown>) =>
	({
		principal: { userId: USER_ID, isGlobalAdmin: true },
		userId: USER_ID,
		options,
		background: false,
	}) as never;

async function nodeRecordIds(): Promise<number[]> {
	const rows = (await sql.unsafe(
		'SELECT section_id FROM matrix_ontology WHERE section_tipo = $1 ORDER BY section_id',
		[NODES_SECTION],
	)) as { section_id: number }[];
	return rows.map((row) => Number(row.section_id));
}

async function scratchRecordExists(): Promise<boolean> {
	const rows = (await sql.unsafe(
		`SELECT section_id FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION_TIPO, SCRATCH_ID],
	)) as unknown[];
	return rows.length > 0;
}

async function sweep(): Promise<void> {
	await deleteOntologyByTld(TLD, (st, sid) => deleteSectionRecord(st, sid, USER_ID));
	await sql.unsafe(`DELETE FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`, [
		SECTION_TIPO,
		SCRATCH_ID,
	]);
	await sql.unsafe('DELETE FROM dd_ontology WHERE tld = $1', [TLD]);
	// The tool SEEDS a General Term record into the provisioned thesaurus sections
	// ('<tld>1' descriptors + '<tld>2' models, in matrix_hierarchy) via
	// createThesaurusGeneralTerm. deleteOntologyByTld only sweeps the '<tld>0' NODE
	// records, so without this the twins accumulate in matrix_hierarchy on every run.
	await sql.unsafe(`DELETE FROM matrix_hierarchy WHERE section_tipo IN ($1, $2)`, [
		`${TLD}1`,
		`${TLD}2`,
	]);
	await sql.unsafe(
		`DELETE FROM matrix_time_machine
		 WHERE section_tipo IN ($1, $2, $3) OR (section_tipo = $4 AND section_id = $5)`,
		[`${TLD}0`, `${TLD}1`, `${TLD}2`, SECTION_TIPO, SCRATCH_ID],
	);
	await clearOntologyDerivedCaches();
}

beforeAll(async () => {
	await sweep(); // a killed prior run must not poison this one
	await sql.unsafe(
		`INSERT INTO "${TABLE}" (section_id, section_tipo, string, relation)
		 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb)`,
		[
			SCRATCH_ID,
			SECTION_TIPO,
			JSON.stringify({
				hierarchy5: [{ id: 1, lang: 'lg-eng', value: 'ZZ Scratch' }],
				hierarchy6: [{ id: 1, lang: 'lg-nolan', value: 'ZZ' }],
				hierarchy109: [{ id: 1, lang: 'lg-nolan', value: 'hierarchy20' }],
			}),
			JSON.stringify({
				// active = si_no YES (dd64/1) and a typology — both mandatory preconditions.
				hierarchy4: [{ id: 1, section_id: '1', section_tipo: 'dd64' }],
				hierarchy9: [
					{
						id: 1,
						type: 'dd151',
						section_id: '2',
						section_tipo: 'hierarchy13',
						from_component_tipo: 'hierarchy9',
					},
				],
			}),
		],
	);
	await clearOntologyDerivedCaches();
});

afterAll(async () => {
	await sweep();
});

describe('generate_virtual_section', () => {
	test('provisions the descriptor + model virtual sections', async () => {
		const response = await generateVirtualSection({
			section_tipo: SECTION_TIPO,
			section_id: SCRATCH_ID,
			userId: USER_ID,
		});

		expect(response.result).toBe(true);
		expect(await nodeRecordIds()).toEqual([1, 2]);
	});

	test('a second Generate refuses cleanly instead of hitting the unique key', async () => {
		const response = await generateVirtualSection({
			section_tipo: SECTION_TIPO,
			section_id: SCRATCH_ID,
			userId: USER_ID,
		});

		expect(response.result).toBe(false);
		expect(response.msg).toContain('already generated');
		expect(response.errors.join(' ')).toContain('Force to create');
		// and it stopped BEFORE the write phase — the existing nodes are untouched.
		expect(await nodeRecordIds()).toEqual([1, 2]);
	});

	test('force_to_create rebuilds the tld and the hierarchy1 record survives', async () => {
		const response = await toolHierarchyGenerateVirtualSection(
			toolContext({
				section_tipo: SECTION_TIPO,
				section_id: SCRATCH_ID,
				force_to_create: true,
			}),
		);

		expect(response.result).toBe(true);
		// THE regression: the teardown must not delete the record it provisions from.
		expect(await scratchRecordExists()).toBe(true);
		expect(await nodeRecordIds()).toEqual([1, 2]);
	});
});
