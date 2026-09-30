/**
 * Native SQL delete propagation seam (DIFFUSION_PLAN P2 "drop the socket
 * hop"; socket plumbing fully retired at the 2026-07-11 cutover — P5 step 3).
 * THE GUARANTEES under test:
 * - with a registered native executor, deleteDiffusionRecord routes sql
 *   targets through it, with the exact engine-wire target shape;
 * - partial confirmation lands split across deleted/pending;
 * - the real executor (targets/mariadb) treats a missing table (1146) and an
 *   UNKNOWN database (1049) as idempotent success (the oracle posture).
 *
 * dd1758 writes are avoided (logActivity=false); the DB is never mutated.
 *
 * THE REAL EXECUTOR RUNS AGAINST THE SUITE's MariaDB (PUB-05, audit 2026-09-26).
 * Its legs used to reach whatever server `../private/.env` named: on a runner
 * without one the connection error was swallowed into the very errno class the
 * legs assert (or surfaced as an unexplained red), so the verdict depended on the
 * machine. `beforeAll` now acquires the zzd situation's target databases on the
 * lane's suite server (`requireSuiteMariadb`), so `zzd_probe_db` answers errno 1146
 * for a table never created — deterministic, on every machine.
 *
 * 1049 IS PROVEN, NOT ASSUMED. The suite user holds per-database grants (the
 * production posture), so an arbitrary absent name answers 1044 at connect and never
 * reaches the 1049 branch; the suite therefore provisions GRANTED_ABSENT_CONTROL_DB —
 * granted, never created — the one name that answers 1049. Each leg first reads the
 * errno its database actually gives through the same engine pool, so a leg can never
 * silently test another branch.
 *
 * 1044 IS DELIBERATELY NOT PINNED (review 2026-09-30). The executor today counts 1044
 * ("access denied to database") as a missing database (`isMissingDatabaseError`,
 * src/diffusion/targets/mariadb/db.ts) and so CONFIRMS the delete. Under per-database
 * grants 1044 answers two different situations: the database is absent, OR it exists
 * and the diffusion user's grant was revoked or never given — in which case the rows
 * stay on the public site while dd1758 records the record as unpublished and no retry
 * ever sees it. That is an open ENGINE question (raised to the integrator), not a
 * contract: a leg asserting "1044 is an idempotent success" would freeze the fail-open
 * reading and make its fix look like a regression. When the owner decides, the leg that
 * lands pins the decided posture (pending / config error) — with a wire_contract entry
 * if 1044 stays idempotent.
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
import {
	closeAllTargetPools,
	getTargetPool,
	type MariadbErrorLike,
} from '../../src/diffusion/targets/mariadb/db.ts';
import { executeSqlDeleteTargets } from '../../src/diffusion/targets/mariadb/delete_record.ts';
import { GRANTED_ABSENT_CONTROL_DB, requireSuiteMariadb } from '../helpers/suite_mariadb.ts';
import {
	countZzdOntology,
	dropZzdOntology,
	SQL_KEY_ONE,
	SQL_KEY_TWO,
	SQL_SECTION,
	seedZzdOntology,
	zzdTargetDatabases,
} from '../helpers/zzd_diffusion_fixture.ts';

/** The two sql targets the fixture guarantees on SQL_SECTION. */
const FIXTURE_KEYS = [SQL_KEY_ONE, SQL_KEY_TWO].sort();

beforeAll(async () => {
	await requireSuiteMariadb(import.meta.path, zzdTargetDatabases());
	const { preCount } = await seedZzdOntology();
	expect(preCount).toBe(0);
}, 120_000);

afterAll(async () => {
	resetNativeDiffusionSqlDeleteForTests();
	await closeAllTargetPools();
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

	/** The errno the engine's own pool meets on `database` (the branch the executor takes). */
	async function errnoAt(database: string, table: string): Promise<number | 'no error'> {
		try {
			await getTargetPool(database).unsafe(`SELECT 1 FROM \`${table}\` LIMIT 0`, []);
			return 'no error';
		} catch (error) {
			return (error as MariadbErrorLike).errno ?? -1;
		}
	}

	test('real executor: a missing TABLE (errno 1146) is an idempotent success', async () => {
		const [database] = zzdTargetDatabases();
		const table = 'dedalo_ts_never_created_table';
		expect(await errnoAt(database as string, table)).toBe(1146);
		const result = await executeSqlDeleteTargets([
			{ database_name: database as string, table_name: table, section_ids: [1] },
		]);
		expect(result.deleted).toEqual([`${database}|${table}`]);
		expect(result.errors).toEqual([]);
	});

	test('real executor: an UNKNOWN database (errno 1049 — granted, never created) is an idempotent success', async () => {
		expect(await errnoAt(GRANTED_ABSENT_CONTROL_DB, 'whatever')).toBe(1049);
		const result = await executeSqlDeleteTargets([
			{ database_name: GRANTED_ABSENT_CONTROL_DB, table_name: 'whatever', section_ids: [1] },
		]);
		expect(result.deleted).toEqual([`${GRANTED_ABSENT_CONTROL_DB}|whatever`]);
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
