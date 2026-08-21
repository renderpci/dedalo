/**
 * Native SQL delete propagation seam (DIFFUSION_PLAN P2 "drop the socket
 * hop"; socket plumbing fully retired at the 2026-07-11 cutover — P5 step 3).
 * THE GUARANTEES under test:
 * - with a registered native executor, deleteDiffusionRecord routes sql
 *   targets through it, with the exact engine-wire target shape;
 * - partial confirmation lands split across deleted/pending;
 * - the real executor (targets/mariadb) treats missing table/database as
 *   idempotent success (oracle errno 1146/1049 posture).
 *
 * dd1758 writes are avoided (logActivity=false); the DB is never mutated.
 */
// Migrated to the generic `test` TLD 2026-08-19: the sql diffusion section is
// PROVISIONED by the `zzd` situation, so the seam test no longer probes an
// install's sections (and can no longer skip itself into a silent pass).

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { NativeSqlDeleteTarget } from '../../src/core/diffusion_bridge/diffusion_delete.ts';
import {
	deleteDiffusionRecord,
	registerNativeDiffusionSqlDelete,
	resetNativeDiffusionSqlDeleteForTests,
} from '../../src/core/diffusion_bridge/diffusion_delete.ts';
import { getSectionDiffusionTargets } from '../../src/core/diffusion_bridge/diffusion_map.ts';
import { executeSqlDeleteTargets } from '../../src/diffusion/targets/mariadb/delete_record.ts';
import {
	countZzdOntology,
	dropZzdOntology,
	SQL_KEY_ONE,
	SQL_KEY_TWO,
	SQL_SECTION,
	seedZzdOntology,
} from '../helpers/zzd_diffusion_fixture.ts';

/** The two sql targets the fixture guarantees on SQL_SECTION. */
const FIXTURE_KEYS = [SQL_KEY_ONE, SQL_KEY_TWO].sort();

beforeAll(async () => {
	const { preCount } = await seedZzdOntology();
	expect(preCount).toBe(0);
});

afterAll(async () => {
	resetNativeDiffusionSqlDeleteForTests();
	await dropZzdOntology();
	expect(await countZzdOntology()).toBe(0);
});

describe('native diffusion sql delete (registration seam)', () => {
	test('the fixture section really carries the two sql targets', async () => {
		const keys = (await getSectionDiffusionTargets(SQL_SECTION))
			.filter((target) => target.type === 'sql' || target.type === 'socrata')
			.map((target) => `${target.database_name}|${target.table_name}`)
			.sort();
		expect(keys).toEqual(FIXTURE_KEYS);
	});

	test('registered executor receives the engine-wire targets; outcome splits by confirmation', async () => {
		const seen: NativeSqlDeleteTarget[][] = [];
		registerNativeDiffusionSqlDelete(async (targets) => {
			seen.push(targets);
			// Confirm all but the first target — exercises the pending split.
			return {
				deleted: targets.slice(1).map((t) => `${t.database_name}|${t.table_name}`),
				errors: [],
			};
		});

		const outcome = await deleteDiffusionRecord(SQL_SECTION, 999999901, false);

		expect(seen.length).toBe(1);
		const call = seen[0] ?? [];
		const key = (t: NativeSqlDeleteTarget): string => `${t.database_name}|${t.table_name}`;
		expect(call.map(key).sort()).toEqual(FIXTURE_KEYS);
		for (const target of call) {
			expect(target.section_ids).toEqual([999999901]);
			expect(target.section_tipo).toBe(SQL_SECTION);
		}
		// the FIRST target was not confirmed → pending; the rest → deleted
		expect(outcome.pending).toEqual([key(call[0] as NativeSqlDeleteTarget)]);
		expect(outcome.deleted).toEqual(call.slice(1).map(key));
	});

	// (The 'explicit socketPath forces the legacy engine path' test retired at
	// the 2026-07-11 cutover with the socket plumbing itself.)

	test('real executor: missing table and missing database are idempotent successes', async () => {
		const result = await executeSqlDeleteTargets([
			{
				database_name: 'zzd_probe_db',
				table_name: 'dedalo_ts_never_created_table',
				section_ids: [1],
			},
			{
				database_name: 'dedalo_ts_no_such_db',
				table_name: 'whatever',
				section_ids: [1],
			},
		]);
		expect(result.deleted).toEqual([
			'zzd_probe_db|dedalo_ts_never_created_table',
			'dedalo_ts_no_such_db|whatever',
		]);
		expect(result.errors).toEqual([]);
	});

	test('real executor drops the publication markers of confirmed targets (S2-31)', async () => {
		// Seed a marker in a temp store; the errno-tolerated no-op delete must
		// still unpublish it (record gone ⇒ marker gone), exactly like the old
		// engine's delete_handler apply_table_state call.
		const { promises: fs } = await import('node:fs');
		const { tmpdir } = await import('node:os');
		const { join } = await import('node:path');
		const { applyTableState, overrideMediaIndexBaseForTests } = await import(
			'../../src/diffusion/targets/mediastore/media_index.ts'
		);
		const base = await fs.mkdtemp(join(tmpdir(), 'dedalo_ts_media_index_'));
		overrideMediaIndexBaseForTests(base);
		try {
			await applyTableState(
				'zzd_probe_db',
				'zz_marker_probe_missing_table',
				SQL_SECTION,
				[90001],
				[],
			);
			const marker = join(base, `pub/${SQL_SECTION}_90001`);
			expect(
				await fs.access(marker).then(
					() => true,
					() => false,
				),
			).toBe(true);

			const result = await executeSqlDeleteTargets([
				{
					database_name: 'zzd_probe_db',
					// NON-scratch name (the store's dedalo_ts_* guard would no-op the
					// marker apply); still missing in MariaDB → errno-1146 tolerated,
					// so the real database is never touched.
					table_name: 'zz_marker_probe_missing_table',
					section_ids: [90001],
					section_tipo: SQL_SECTION,
				},
			]);
			expect(result.deleted).toEqual(['zzd_probe_db|zz_marker_probe_missing_table']);
			expect(
				await fs.access(marker).then(
					() => true,
					() => false,
				),
			).toBe(false);
			expect(
				await fs
					.access(join(base, `dbs/zzd_probe_db/zz_marker_probe_missing_table/${SQL_SECTION}_90001`))
					.then(
						() => true,
						() => false,
					),
			).toBe(false);
		} finally {
			overrideMediaIndexBaseForTests(null);
			await fs.rm(base, { recursive: true, force: true });
		}
	});
});
