/**
 * S1-16 gate: the dd1758 diffusion ledger records the REAL acting user in
 * dd1762 — never a fabricated superuser −1.
 *
 * Runs as a NON-root actor on purpose: as root the expected value is
 * legitimately −1 and the gate could not detect the regression. PHP oracle
 * shape (diffusion_activity_logger:48-67): dd1762 carries logged_user_id();
 * when the user id is FALSY the field is omitted entirely.
 *
 * Drives the real unpublish path (deleteDiffusionRecord → logUnpublishOutcome
 * → logDiffusionActivity) with a stub native executor — no MariaDB writes;
 * the only DB writes are the dd1758 rows for a synthetic record id, reclaimed
 * in afterAll (diffusion_delete.test.ts hygiene pattern).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import {
	DIFFUSION_ACTIVITY_TABLE,
	deleteDiffusionRecord,
	logDiffusionActivity,
	registerNativeDiffusionSqlDelete,
	resetNativeDiffusionSqlDeleteForTests,
} from '../../src/core/diffusion_bridge/diffusion_delete.ts';

/** Non-root actor: any positive user id ≠ DEDALO_SUPERUSER (−1). */
const ACTOR_ID = 987654321;
/** Synthetic record ids — never real numisdata6 records. */
const PROBE_ID = 999999717;
const NO_USER_PROBE_ID = 999999718;

async function reclaimProbeRows(): Promise<void> {
	for (const probeId of [PROBE_ID, NO_USER_PROBE_ID]) {
		await sql.unsafe(
			`DELETE FROM "${DIFFUSION_ACTIVITY_TABLE}"
			 WHERE section_tipo = 'dd1758'
			   AND relation->'dd1763' @> $1::text::jsonb`,
			[JSON.stringify([{ section_id: String(probeId), section_tipo: 'numisdata6' }])],
		);
	}
}

afterAll(async () => {
	resetNativeDiffusionSqlDeleteForTests();
	await reclaimProbeRows();
});

describe('dd1758 ledger actor (dd1762, PHP parity)', () => {
	test('unpublish as a NON-root user writes the real actor to dd1762', async () => {
		await reclaimProbeRows(); // clean slate for the row-shape assertions

		// Stub native executor: confirms every target (no MariaDB involved).
		registerNativeDiffusionSqlDelete(async (targets) => ({
			deleted: targets.map((t) => `${t.database_name}|${t.table_name}`),
			errors: [],
		}));
		try {
			const outcome = await deleteDiffusionRecord('numisdata6', PROBE_ID, true, ACTOR_ID);
			expect(outcome.deleted.length).toBeGreaterThan(0);
		} finally {
			resetNativeDiffusionSqlDeleteForTests();
		}

		const rows = (await sql.unsafe(
			`SELECT relation->'dd1762'->0->>'section_id' AS actor_id,
			        relation->'dd1762'->0->>'section_tipo' AS actor_section,
			        relation->'dd1767'->0->>'section_id' AS action
			 FROM "${DIFFUSION_ACTIVITY_TABLE}"
			 WHERE section_tipo = 'dd1758'
			   AND relation->'dd1763' @> $1::text::jsonb
			 ORDER BY section_id`,
			[JSON.stringify([{ section_id: String(PROBE_ID), section_tipo: 'numisdata6' }])],
		)) as { actor_id: string | null; actor_section: string | null; action: string }[];
		expect(rows.length).toBeGreaterThan(0); // one per sql element
		for (const row of rows) {
			expect(row.action).toBe('2'); // unpublished (all targets confirmed)
			expect(row.actor_id).toBe(String(ACTOR_ID)); // the REAL actor — never '-1'
			expect(row.actor_section).toBe('dd128');
		}
	});

	test('no userId → dd1762 omitted entirely (PHP falsy shape), never -1', async () => {
		await logDiffusionActivity({
			sectionTipo: 'numisdata6',
			sectionId: NO_USER_PROBE_ID,
			elementTipo: null,
			action: 2,
		});
		const rows = (await sql.unsafe(
			`SELECT relation ? 'dd1762' AS has_actor,
			        relation->'dd1762'->0->>'section_id' AS actor_id
			 FROM "${DIFFUSION_ACTIVITY_TABLE}"
			 WHERE section_tipo = 'dd1758'
			   AND relation->'dd1763' @> $1::text::jsonb`,
			[JSON.stringify([{ section_id: String(NO_USER_PROBE_ID), section_tipo: 'numisdata6' }])],
		)) as { has_actor: boolean; actor_id: string | null }[];
		expect(rows.length).toBe(1);
		expect(rows[0]?.has_actor).toBe(false);
		expect(rows[0]?.actor_id).toBeNull();
	});
});
