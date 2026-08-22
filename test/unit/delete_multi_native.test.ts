/**
 * SQO-driven multi-delete — TS-NATIVE half, the DEC-14b survival twin of
 * test/parity/delete_multi_differential.test.ts's TS-contract test (its PHP
 * half pins a live PHP DEFECT — the per-record loop crashes after the first
 * delete — and dies with the oracle; the TS contract it asserted survives
 * HERE).
 *
 * PHP sections::delete with an rqo.sqo runs the SQO search and deletes every
 * matched record (delete_mode 'delete_record'). The TS dispatch mirrors the
 * intended contract: global-admin only (fail closed), the SQO stays confined
 * to the gated section, and per deleted record — one record-level Time
 * Machine snapshot (tipo = section_tipo, the recovery audit point) before the
 * row removal. result = the deleted section_ids AS STRINGS, in match order.
 *
 * Fixture: three fresh testmint1 twins (matrix); a filter_by_locators SQO
 * selects exactly the first two. Asserted: those two rows gone, the third
 * intact, result lists exactly the two ids, ONE record-level TM snapshot per
 * deleted record and none for the survivor.
 *
 * Scratch hygiene: all three twins + their TM rows swept in afterAll, plus
 * the two dd542 activity rows the dispatch delete loop appends
 * (matrix_activity is consultation-only for the engine doors; direct SQL
 * cleanup of our own rows mirrors the differential), plus the dd1758
 * unpublish-log rows the diffusion bridge writes for testmint1 (a section
 * WITH sql diffusion targets — they land in the bun-test scratch table via
 * the DIFFUSION_ACTIVITY_TABLE seam; swept only when the seam is active,
 * never from the PHP-owned real table). Anatomy of the dd542 activity rows
 * is covered by activity_log_native.test.ts, not re-asserted here.
 */
// Migrated to the generic `test` TLD 2026-08-20 (AGENTS.md hard rule). Install tipos
// were replaced by their twins from src/core/test_data/test_tld_tipo_map.json; the
// seed-shipped ones (rsc/dd/hierarchy/ontology/lg) have no twin and stay, because they
// ship with every installation.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { activityTable } from '../../src/core/diffusion_bridge/diffusion_delete.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const SECTION = 'testmint1';
// RESOLVED, not assumed: a cloned `test` section carries its own `matrix_table`
// relation (→ `matrix_test`), so a hard-coded `matrix` writes where the engine
// will never read.
const TABLE = 'matrix_test';
const USER_ID = -1;

/** Three twins; [0] and [1] get deleted, [2] survives. */
const ids: number[] = [];
let result: unknown;

async function existing(candidates: number[]): Promise<number[]> {
	const rows = (await sql.unsafe(
		`SELECT section_id FROM ${TABLE} WHERE section_tipo = $1 AND section_id = ANY($2::int[])`,
		[SECTION, `{${candidates.join(',')}}`],
	)) as { section_id: number }[];
	return rows.map((row) => Number(row.section_id)).sort((a, b) => a - b);
}

/** Record-level TM snapshot count per section_id (tipo = section tipo). */
async function tmSnapshotCounts(candidates: number[]): Promise<Map<number, number>> {
	const rows = (await sql.unsafe(
		`SELECT section_id, count(*)::int AS n FROM matrix_time_machine
		 WHERE section_tipo = $1 AND tipo = $1 AND section_id = ANY($2::int[])
		 GROUP BY section_id`,
		[SECTION, `{${candidates.join(',')}}`],
	)) as { section_id: number; n: number }[];
	return new Map(rows.map((row) => [Number(row.section_id), row.n]));
}

beforeAll(async () => {
	for (let i = 0; i < 3; i++) ids.push(await createSectionRecord(SECTION, USER_ID));

	const token = createSession(USER_ID, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(USER_ID);
	const dispatched = await dispatchRqo(
		{
			action: 'delete',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			source: {
				typo: 'source',
				model: 'section',
				tipo: SECTION,
				section_tipo: SECTION,
				action: 'delete',
				delete_mode: 'delete_record',
			},
			sqo: {
				section_tipo: [SECTION],
				limit: 0,
				offset: 0,
				filter_by_locators: ids
					.slice(0, 2)
					.map((id) => ({ section_tipo: SECTION, section_id: String(id) })),
			},
		} as unknown as Rqo,
		{
			requestId: 'delete_multi_native_test',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
	result = (dispatched.body as { data?: unknown }).data;
}, 60000);

afterAll(async () => {
	for (const id of ids) {
		await sql.unsafe(`DELETE FROM ${TABLE} WHERE section_tipo = $1 AND section_id = $2`, [
			SECTION,
			id,
		]);
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[SECTION, id],
		);
	}
	// The dd542 activity rows the delete loop appended for OUR record ids.
	if (ids.length > 0) {
		await sql.unsafe(
			`DELETE FROM matrix_activity
			 WHERE section_tipo = 'dd542'
			   AND string->'dd546'->0->>'value' = $1
			   AND misc->'dd551'->0->'value'->>'section_id' = ANY($2::text[])`,
			[SECTION, `{${ids.map(String).join(',')}}`],
		);
	}
	// The dd1758 unpublish-log rows for OUR record ids — scratch seam only
	// (the real matrix_activity_diffusion is PHP-owned; never touched).
	if (ids.length > 0 && activityTable().startsWith('dedalo_ts_test_')) {
		await sql.unsafe(
			`DELETE FROM "${activityTable()}"
			 WHERE section_tipo = 'dd1758'
			   AND string->'dd1765'->0->>'value' = $1
			   AND number->'dd1764'->0->>'value' = ANY($2::text[])`,
			[SECTION, `{${ids.map(String).join(',')}}`],
		);
	}
});

describe('sqo multi-delete (TS-native contract)', () => {
	test('result lists exactly the two SQO-matched ids, as ints', () => {
		// int-canonical delete result ids (WC-2026-08-10-section-id-int-canonical)
		expect(result).toEqual(ids.slice(0, 2));
	});

	test('exactly the two matched rows are gone; the third twin is intact', async () => {
		expect(await existing(ids)).toEqual([ids[2] as number]);
	});

	test('one record-level TM snapshot per deleted record, none for the survivor', async () => {
		const counts = await tmSnapshotCounts(ids);
		expect(counts.get(ids[0] as number)).toBe(1);
		expect(counts.get(ids[1] as number)).toBe(1);
		expect(counts.has(ids[2] as number)).toBe(false);
	});
});
