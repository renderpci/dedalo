/**
 * S1-11 gate: data-derived caches get a WRITE and DELETE invalidation channel.
 *
 * The durable channel: every persistent record write (record_write chokepoint)
 * and every record delete (delete_record step 7) fires fireSaveEvent, which
 * fans the section tipo out to the registered section-data listeners. The
 * datalist records componentTipo→targetSections at populate time, so a write
 * to a TARGET section evicts exactly the option lists built from it.
 *
 * Scratch surface: matrix_test via the REAL ontology section 'test2' (its
 * matrix_table relation resolves to matrix_test), reserved high section_id.
 * Every row this file creates (matrix + time machine) is removed after.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { withTransaction } from '../../src/core/db/postgres.ts';
import { getDatalist } from '../../src/core/relations/datalist.ts';
import { getUserAuthorizedProjects } from '../../src/core/relations/filter_projects.ts';
import { resolveHierarchySectionsFromTypes } from '../../src/core/relations/request_config/explicit.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';
import { persistRecordColumns } from '../../src/core/section_record/record_write.ts';
import { fireSaveEvent } from '../../src/core/section_record/save_event.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

const TEST_TABLE = 'matrix_test';
const TARGET_SECTION = 'test2'; // real ontology section → matrix_test
const NEW_SECTION_ID = 900411; // reserved: collides with nothing real
const COMPONENT_TIPO = 'zzdatalist1'; // synthetic owner — datalist keys on it

/** Explicit-config properties targeting TARGET_SECTION with no label ddos (labels ''). */
const COMPONENT_PROPERTIES = {
	source: {
		request_config: [
			{
				api_engine: 'dedalo',
				sqo: { section_tipo: [TARGET_SECTION] },
				show: { ddo_map: [] },
			},
		],
	},
};

function warmDatalist(): ReturnType<typeof getDatalist> {
	return getDatalist(COMPONENT_TIPO, COMPONENT_PROPERTIES, TARGET_SECTION, 'lg-eng');
}

function cleanup(): Promise<void> {
	return cleanScratchRecord(TARGET_SECTION, NEW_SECTION_ID, TEST_TABLE);
}

describe('datalist staleness: write + delete of a target-section record (S1-11)', () => {
	beforeAll(cleanup);
	afterAll(cleanup);

	test('a record write through the chokepoint makes the datalist re-query', async () => {
		const before = await warmDatalist();
		expect(await warmDatalist()).toBe(before); // cache hit → same instance
		expect(before.some((item) => item.section_id === String(NEW_SECTION_ID))).toBe(false);

		// WRITE a new record of the target section through the production
		// chokepoint (persistRecordColumns → fireSaveEvent).
		const outcome = await persistRecordColumns(
			{ table: TEST_TABLE, sectionTipo: TARGET_SECTION, sectionId: NEW_SECTION_ID },
			{ string: { test1: [{ id: 1, lang: 'lg-eng', value: 'datalist staleness probe' }] } },
		);
		expect(outcome).toBe('inserted');

		const after = await warmDatalist();
		expect(after).not.toBe(before); // evicted → re-queried
		expect(after.some((item) => item.section_id === String(NEW_SECTION_ID))).toBe(true);
	});

	test('a record DELETE makes the datalist re-query (delete_record fires the event)', async () => {
		const before = await warmDatalist();
		expect(before.some((item) => item.section_id === String(NEW_SECTION_ID))).toBe(true);

		const result = await deleteSectionRecord(TARGET_SECTION, NEW_SECTION_ID, -1);
		expect(result.removed).toBe(true);

		const after = await warmDatalist();
		expect(after).not.toBe(before);
		expect(after.some((item) => item.section_id === String(NEW_SECTION_ID))).toBe(false);
	});

	test('a write to an UNRELATED section leaves the datalist cached', async () => {
		const before = await warmDatalist();
		await fireSaveEvent('numisdata6'); // not a target of this datalist
		expect(await warmDatalist()).toBe(before);
	});

	test('an IN-TX save event is deferred to the transaction settle (S1-14 posture)', async () => {
		const before = await warmDatalist();
		await withTransaction(async () => {
			await fireSaveEvent(TARGET_SECTION);
			// Deferred: mid-tx the shared cache must stay untouched.
			expect(await warmDatalist()).toBe(before);
		});
		expect(await warmDatalist()).not.toBe(before); // replayed on COMMIT
	});
});

describe('filter_projects + hierarchy sections listeners (S1-11 durable channel)', () => {
	test('a dd153 (projects) event rebuilds the authorized-projects cache', async () => {
		const before = await getUserAuthorizedProjects();
		expect(await getUserAuthorizedProjects()).toBe(before);
		await fireSaveEvent('dd153');
		const after = await getUserAuthorizedProjects();
		expect(after).not.toBe(before);
		expect(after).toEqual(before); // no data changed — same content, fresh read
	});

	test('an unrelated event leaves the authorized-projects cache untouched', async () => {
		const before = await getUserAuthorizedProjects();
		await fireSaveEvent('numisdata6');
		expect(await getUserAuthorizedProjects()).toBe(before);
	});

	test('a hierarchy1 (registry) event rebuilds the hierarchy-sections cache', async () => {
		const before = await resolveHierarchySectionsFromTypes([1]);
		expect(await resolveHierarchySectionsFromTypes([1])).toBe(before);
		await fireSaveEvent('hierarchy1');
		const after = await resolveHierarchySectionsFromTypes([1]);
		expect(after).not.toBe(before);
		expect(after).toEqual(before);
	});
});

// NOTE: no afterAll(closeDatabasePool) — the pool is shared module state
// across the test files bun runs in one process (matrix_read.test.ts NOTE).
