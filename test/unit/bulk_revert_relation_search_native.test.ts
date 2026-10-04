/**
 * THE TIME MACHINE'S RESTORE DOORS KEEP THE ANCESTOR INDEX (2026-09-27).
 *
 * `relation_search` is READ (conform.ts: `direct OR ancestor` for the legacy
 * component_autocomplete_hi), so a door that restores a relation key and
 * leaves the index naming the ancestors of the value it replaced makes a
 * broader-term search answer for a value the record no longer holds — until an
 * unrelated later save happens to re-derive it. The bulk revert's key writes,
 * the single-component restore and the record undelete all bypass
 * saveComponentData; each must apply the save's OWN index law
 * (relations/save.ts reindexRelationSearchLikeSave), never a copy.
 *
 * THE ORACLE IS THE SAVE ITSELF: every case compares the restored record's
 * index with the index a normal saveComponentData of the SAME value produced,
 * never with a hand-built expectation — so a change to the law moves both.
 * Anti-vacuous floors: the two values' chains are non-empty and DIFFER.
 *
 * SITUATION: `test3` (→ matrix_test) and its component_autocomplete_hi
 * `test205`, pointing at two terms of the synthetic hierarchy A whose chains
 * are [2,1] and [4,1] (read, never written). Records are created at runtime and
 * swept; assertTestDatabase before the first write.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { getMatrixTableFromTipo, getNode } from '../../src/core/ontology/resolver.ts';
import { getParentChainLocators } from '../../src/core/resolve/dd_info.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { SYNTHETIC_HIERARCHY_A_TLD } from '../../src/core/test_data/synthetic_hierarchy_constants.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { toolTimeMachineBulkRevert } from '../../tools/tool_time_machine/server/bulk_revert.ts';
import {
	restoreAbsentSectionRow,
	toolTimeMachineApplyValue,
} from '../../tools/tool_time_machine/server/tool_time_machine.ts';

const SECTION = 'test3';
const TABLE = 'matrix_test';
const HI_TIPO = 'test205';
const THESAURUS = `${SYNTHETIC_HIERARCHY_A_TLD}1`;
const USER_ID = -1;
/** Two terms with DIFFERENT, non-empty ancestor chains (asserted in beforeAll). */
const TERM_A = 5;
const TERM_B = 10;

const records: number[] = [];
const runs: number[] = [];
let bulkTable = '';

const term = (sectionId: number) => ({
	section_tipo: THESAURUS,
	section_id: sectionId,
	from_component_tipo: HI_TIPO,
});

async function newRecord(): Promise<number> {
	const id = await createSectionRecord(SECTION, USER_ID);
	records.push(id);
	return id;
}

async function setTerm(sectionId: number, target: number, bulk: number | null = null) {
	const saved = await saveComponentData({
		componentTipo: HI_TIPO,
		sectionTipo: SECTION,
		sectionId,
		lang: 'lg-nolan',
		userId: USER_ID,
		bulkProcessId: bulk,
		changedData: [{ action: 'set_data', id: null, value: [term(target)] }] as never,
	});
	expect(saved.ok).toBe(true);
}

/** The stored `relation` / `relation_search` keys of test205 (`undefined` = absent). */
async function keys(sectionId: number): Promise<{ relation: unknown; index: unknown }> {
	const rows = (await sql.unsafe(
		`SELECT relation->$3 AS relation, relation_search->$3 AS index
		   FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, sectionId, HI_TIPO],
	)) as { relation: unknown; index: unknown }[];
	return { relation: rows[0]?.relation ?? undefined, index: rows[0]?.index ?? undefined };
}

/** The index's ancestor ids, in stored order. */
const ancestorIds = (index: unknown): number[] =>
	(Array.isArray(index) ? index : []).map((entry) =>
		Number((entry as { section_id: unknown }).section_id),
	);

/** What a NORMAL save of `target` indexes — the oracle, measured on a fresh record. */
async function indexOfNormalSave(target: number): Promise<unknown> {
	const twin = await newRecord();
	await setTerm(twin, target);
	return (await keys(twin)).index;
}

beforeAll(async () => {
	await assertTestDatabase('bulk_revert_relation_search_native');
	// STRUCTURE FLOOR: the index law applies to this node, and the two terms'
	// chains are non-empty and different — else every assertion is vacuous.
	expect((await getNode(HI_TIPO))?.model).toBe('component_autocomplete_hi');
	const chainA = (await getParentChainLocators(THESAURUS, String(TERM_A))).map((p) => p.section_id);
	const chainB = (await getParentChainLocators(THESAURUS, String(TERM_B))).map((p) => p.section_id);
	expect(chainA.length).toBeGreaterThan(0);
	expect(chainB.length).toBeGreaterThan(0);
	expect(chainA).not.toEqual(chainB);
	bulkTable = (await getMatrixTableFromTipo('dd800')) as string;
}, 60_000);

afterAll(async () => {
	for (const id of records) {
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[SECTION, id],
		);
		await sql.unsafe(
			'DELETE FROM dedalo_ts_record_generation WHERE section_tipo = $1 AND section_id = $2',
			[SECTION, id],
		);
		await sql.unsafe(`DELETE FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`, [
			SECTION,
			id,
		]);
		await sql.unsafe(
			`DELETE FROM matrix_activity WHERE data->>'section_tipo' = $1 AND data->>'section_id' = $2`,
			[SECTION, String(id)],
		);
	}
	for (const id of runs) {
		await sql.unsafe(
			`DELETE FROM "${bulkTable}" WHERE section_tipo = 'dd800' AND section_id = $1`,
			[id],
		);
		await sql.unsafe(
			`DELETE FROM matrix_time_machine WHERE section_tipo = 'dd800' AND section_id = $1`,
			[id],
		);
	}
});

describe('restoring a relation key re-derives relation_search by the SAVE law', () => {
	test('bulk revert: a run that changed the portal leaves the index a normal save of the restored value writes', async () => {
		const expected = await indexOfNormalSave(TERM_A);
		const holder = await newRecord();
		await setTerm(holder, TERM_A);
		const run = await createSectionRecord('dd800', USER_ID);
		runs.push(run);
		await setTerm(holder, TERM_B, run);
		// FLOOR: the run moved the index to B's chain.
		expect(ancestorIds((await keys(holder)).index)).toEqual(
			ancestorIds(await indexOfNormalSave(TERM_B)),
		);

		const response = await toolTimeMachineBulkRevert({
			principal: await resolvePrincipal(USER_ID),
			userId: USER_ID,
			options: { bulk_process_id: run },
			background: false,
		} as never);
		expect(response.ok).toBe(true);
		const data = response.data as { counter: number; bulk_process_id: number };
		runs.push(data.bulk_process_id);
		expect(data.counter).toBe(1);

		const after = await keys(holder);
		expect((after.relation as { section_id: unknown }[]).map((l) => Number(l.section_id))).toEqual([
			TERM_A,
		]);
		expect(
			after.index,
			'the revert restored `relation` but left relation_search naming the run value’s ancestors',
		).toEqual(expected);
	}, 60_000);

	test('single-component TM restore (apply_value): the index follows the restored value', async () => {
		const expected = await indexOfNormalSave(TERM_A);
		const holder = await newRecord();
		await setTerm(holder, TERM_A);
		const [row] = (await sql.unsafe(
			`SELECT id FROM matrix_time_machine
			  WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 ORDER BY id DESC LIMIT 1`,
			[SECTION, holder, HI_TIPO],
		)) as { id: number }[];
		await setTerm(holder, TERM_B);
		const response = await toolTimeMachineApplyValue({
			principal: await resolvePrincipal(USER_ID),
			userId: USER_ID,
			options: {
				section_tipo: SECTION,
				section_id: holder,
				tipo: HI_TIPO,
				lang: 'lg-nolan',
				matrix_id: Number(row?.id),
			},
			background: false,
		} as never);
		expect(response.ok).toBe(true);
		expect((await keys(holder)).index).toEqual(expected);
	}, 60_000);

	test('record undelete: a snapshot whose index is stale comes back re-derived from its relation', async () => {
		const expected = await indexOfNormalSave(TERM_A);
		const staleIndex = await indexOfNormalSave(TERM_B);
		const address = await newRecord();
		// The address is free (the undelete is insert-only); its snapshot pairs
		// A's locator with B's chain — the index a thesaurus move since the delete
		// leaves in the snapshot.
		await sql.unsafe(`DELETE FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`, [
			SECTION,
			address,
		]);
		const restored = await restoreAbsentSectionRow(
			{
				relation: { [HI_TIPO]: [{ id: 1, type: 'dd151', ...term(TERM_A) }] },
				relation_search: { [HI_TIPO]: staleIndex },
			},
			0,
			SECTION,
			address,
			false,
			USER_ID,
		);
		expect(restored).not.toBeNull();
		expect((await keys(address)).index).toEqual(expected);
	}, 60_000);
});
