/**
 * S1-05 gate: the dataframe removal CASCADE (PHP remove_dataframe_data_by_id,
 * trait.dataframe_common.php:280-369) fires on ALL THREE removal paths:
 *
 *   1. component item remove (saveComponentData 'remove' branch);
 *   2. portal unlink (dd_component_portal_api deletePortalLocator);
 *   3. record delete propagation (deleteSectionRecord →
 *      removeAllInverseReferences).
 *
 * Per flavor: the removed item's paired frame entries vanish from the slot,
 * SIBLING items' frames survive, and — the re-attachment regression — the
 * production read-path matcher (dataframeEntryMatches via filterCallerEntries)
 * finds NOTHING for the removed id, so a future item reusing the id can never
 * silently re-attach the stale uncertainty/qualifier data. PHP-fidelity: the
 * slot strip emits NO Time Machine row (PHP tm_record::$save_tm=false, REL-01
 * — the main component's TM row captures full state), asserted per flavor.
 *
 * Fixtures are SCRATCH records only (fresh numisdata3 hosts on matrix — the
 * portal suite's pattern — plus reserved test2 ids on matrix_test for the
 * record-delete target), cleaned before AND after. The real ontology pair
 * numisdata75 (portal) / numisdata1531 (component_dataframe ddo of its
 * request_config) drives the slot resolution, like the Wave-2 probe.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { filterCallerEntries } from '../../src/core/relations/dataframe.ts';
import { deletePortalLocator } from '../../src/core/relations/save.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

const HOST_SECTION = 'numisdata3'; // matrix
const PORTAL = 'numisdata75';
const SLOT = 'numisdata1531'; // component_dataframe ddo of numisdata75's config
const TARGET_SECTION = 'test2'; // matrix_test (record-delete flavor target)
/** Reserved scratch test2 ids — collide with nothing real. */
const TARGET_ID_A = 990231;
const TARGET_ID_B = 990232;
const USER_ID = 1;

const created: { table: string; sectionTipo: string; sectionId: number }[] = [];

function portalItem(id: number, targetId: number): Record<string, unknown> {
	return {
		id,
		type: 'dd151',
		section_id: String(targetId),
		section_tipo: TARGET_SECTION,
		from_component_tipo: PORTAL,
	};
}

function frameEntry(idKey: number, frameTargetId: number): Record<string, unknown> {
	return {
		type: 'dd490',
		section_id: String(frameTargetId),
		section_tipo: 'numisdata4',
		from_component_tipo: SLOT,
		main_component_tipo: PORTAL,
		id_key: idKey,
	};
}

/** Fresh scratch host with two portal items (ids 1, 2) + one frame each. */
async function seedHost(): Promise<number> {
	const hostId = await createSectionRecord(HOST_SECTION, -1);
	created.push({ table: 'matrix', sectionTipo: HOST_SECTION, sectionId: hostId });
	const relation = {
		[PORTAL]: [portalItem(1, TARGET_ID_A), portalItem(2, TARGET_ID_B)],
		[SLOT]: [frameEntry(1, 990301), frameEntry(2, 990302)],
	};
	await sql.unsafe(
		`UPDATE matrix SET relation = COALESCE(relation, '{}'::jsonb) || $1::text::jsonb
		 WHERE section_tipo = $2 AND section_id = $3`,
		[JSON.stringify(relation), HOST_SECTION, hostId],
	);
	return hostId;
}

async function relationKey(hostId: number, key: string): Promise<Record<string, unknown>[]> {
	const rows = (await sql.unsafe(
		'SELECT relation->$1 AS v FROM matrix WHERE section_tipo = $2 AND section_id = $3',
		[key, HOST_SECTION, hostId],
	)) as { v: Record<string, unknown>[] | null }[];
	return rows[0]?.v ?? [];
}

async function slotTmRowCount(hostId: number): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM matrix_time_machine
		 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3`,
		[HOST_SECTION, hostId, SLOT],
	)) as { n: number }[];
	return rows[0]?.n ?? 0;
}

/** The re-attachment regression: the read-path matcher finds nothing. */
function orphansOf(slotData: Record<string, unknown>[], idKey: number): unknown[] {
	return filterCallerEntries(slotData, { main_component_tipo: PORTAL, id_key: idKey }, SLOT);
}

async function cleanTargets(): Promise<void> {
	for (const id of [TARGET_ID_A, TARGET_ID_B]) {
		await cleanScratchRecord(TARGET_SECTION, id);
	}
}

beforeAll(async () => {
	await cleanTargets(); // a crashed previous run cannot poison this one
});

afterAll(async () => {
	for (const row of created) {
		await cleanScratchRecord(row.sectionTipo, row.sectionId, row.table);
	}
	await cleanTargets();
});

describe('dataframe cascade on the three removal paths (S1-05)', () => {
	test('item remove: paired frames stripped, siblings survive, NO slot TM row', async () => {
		const hostId = await seedHost();
		const result = await saveComponentData({
			componentTipo: PORTAL,
			sectionTipo: HOST_SECTION,
			sectionId: hostId,
			lang: 'lg-nolan',
			changedData: [{ action: 'remove', id: 1, value: null }],
			userId: USER_ID,
		});
		expect(result.ok).toBe(true);

		const portalAfter = await relationKey(hostId, PORTAL);
		expect(portalAfter.map((item) => item.id)).toEqual([2]);

		const slotAfter = await relationKey(hostId, SLOT);
		expect(orphansOf(slotAfter, 1)).toEqual([]); // re-attachment regression
		expect(orphansOf(slotAfter, 2).length).toBe(1); // sibling frame survives

		// PHP suppresses the slot's own TM row (main TM row captures full state).
		expect(await slotTmRowCount(hostId)).toBe(0);
		const mainTm = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM matrix_time_machine
			 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3`,
			[HOST_SECTION, hostId, PORTAL],
		)) as { n: number }[];
		expect((mainTm[0]?.n ?? 0) > 0).toBe(true);
	}, 30000);

	test('portal unlink (delete_locator): removed locator cascades its frames', async () => {
		const hostId = await seedHost();
		const response = await deletePortalLocator(
			{ isGlobalAdmin: true, userId: USER_ID },
			{ tipo: PORTAL, section_tipo: HOST_SECTION, section_id: hostId },
			{
				locator: {
					section_id: String(TARGET_ID_A),
					section_tipo: TARGET_SECTION,
					from_component_tipo: PORTAL,
					type: 'dd151',
				},
				ar_properties: ['section_id', 'section_tipo', 'from_component_tipo', 'type'],
			},
		);
		expect(response.result).toBe(1);

		const portalAfter = await relationKey(hostId, PORTAL);
		expect(portalAfter.map((item) => item.id)).toEqual([2]);

		const slotAfter = await relationKey(hostId, SLOT);
		expect(orphansOf(slotAfter, 1)).toEqual([]);
		expect(orphansOf(slotAfter, 2).length).toBe(1);
		expect(await slotTmRowCount(hostId)).toBe(0);
	}, 30000);

	test('record delete: inverse-reference strip cascades the paired frames', async () => {
		const hostId = await seedHost();
		// the record the host's portal item id 1 points at
		await createSectionRecord(TARGET_SECTION, -1, new Date(), TARGET_ID_A);

		const outcome = await deleteSectionRecord(TARGET_SECTION, TARGET_ID_A, USER_ID);
		expect(outcome.removed).toBe(true);

		const portalAfter = await relationKey(hostId, PORTAL);
		expect(portalAfter.map((item) => item.id)).toEqual([2]); // inverse ref gone

		const slotAfter = await relationKey(hostId, SLOT);
		expect(orphansOf(slotAfter, 1)).toEqual([]);
		expect(orphansOf(slotAfter, 2).length).toBe(1);
		expect(await slotTmRowCount(hostId)).toBe(0);
	}, 30000);
});
