/**
 * Ordered-migration runner gate (audit S2-39, WS-E item 7).
 *
 * THE GUARANTEES under test, against the REAL Postgres:
 * - pending numbered .sql files apply in filename order, each recorded in the
 *   version table;
 * - a re-run applies nothing (idempotent boot);
 * - a failing migration aborts the run WITHOUT recording itself (the next
 *   boot retries it; later files never leapfrog a hole);
 * - non-matching filenames are ignored;
 * - a migration that times out WAITING for a lock (SQLSTATE 55P03) is retried
 *   after a backoff and lands once the lock is free; with no retry left it
 *   aborts unrecorded (2026-09-27 — 0010_tm_role.sql ALTERs the largest table
 *   of an install, whose instant lock queues behind any long reader);
 * - a migration's RUN is not bounded by the pool's statement_timeout;
 * - an ONLINE file is deferred by the boot run (not a hole) and built by the
 *   post-listen run CONCURRENTLY; an INVALID leftover is dropped and rebuilt;
 *   a file outside the online grammar is refused unrecorded.
 *
 * Scratch surfaces only: a temp migrations dir + a dedalo_ts_test_* version
 * table + dedalo_ts_test_* target tables, all dropped in afterAll.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	MIGRATION_LOCK_TIMEOUT,
	runMigrations,
	runOnlineMigrations,
	stopOnlineMigrations,
} from '../../install/db/migrate.ts';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';

const VERSION_TABLE = `dedalo_ts_test_migrations_${process.pid}`;
const TARGET_TABLE = `dedalo_ts_test_migr_target_${process.pid}`;
const dir = mkdtempSync(join(tmpdir(), 'dedalo_migrations_'));

afterAll(async () => {
	rmSync(dir, { recursive: true, force: true });
	await sql.unsafe(`DROP TABLE IF EXISTS "${VERSION_TABLE}"`, []);
	await sql.unsafe(`DROP TABLE IF EXISTS "${TARGET_TABLE}"`, []);
});

describe('migrations runner (S2-39)', () => {
	test('applies pending files in order, records them, and is idempotent', async () => {
		writeFileSync(
			join(dir, '0001_create_target.sql'),
			`CREATE TABLE IF NOT EXISTS "${TARGET_TABLE}" (id int PRIMARY KEY, label text)`,
		);
		writeFileSync(
			join(dir, '0002_add_column.sql'),
			`ALTER TABLE "${TARGET_TABLE}" ADD COLUMN extra text`,
		);
		writeFileSync(join(dir, 'notes.txt'), 'not a migration'); // ignored shape

		const first = await runMigrations({ dir, versionTable: VERSION_TABLE });
		expect(first.applied).toEqual(['0001_create_target.sql', '0002_add_column.sql']);
		expect(first.skipped).toBe(0);

		// The schema actually changed (the ALTER ran after the CREATE).
		const columns = (await sql.unsafe(
			'SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position',
			[TARGET_TABLE],
		)) as { column_name: string }[];
		expect(columns.map((column) => column.column_name)).toEqual(['id', 'label', 'extra']);

		// Idempotent re-run: nothing re-applies.
		const second = await runMigrations({ dir, versionTable: VERSION_TABLE });
		expect(second.applied).toEqual([]);
		expect(second.skipped).toBe(2);
	});

	test('a failing migration aborts without being recorded; later files wait', async () => {
		writeFileSync(join(dir, '0003_broken.sql'), 'SELECT * FROM this_table_does_not_exist_42');
		writeFileSync(
			join(dir, '0004_after_hole.sql'),
			`ALTER TABLE "${TARGET_TABLE}" ADD COLUMN late text`,
		);

		await expect(runMigrations({ dir, versionTable: VERSION_TABLE })).rejects.toThrow();

		const recorded = (await sql.unsafe(
			`SELECT version FROM "${VERSION_TABLE}" ORDER BY version`,
			[],
		)) as { version: string }[];
		// Neither the broken file nor its successor was recorded.
		expect(recorded.map((row) => row.version)).toEqual([
			'0001_create_target.sql',
			'0002_add_column.sql',
		]);

		// Fixing the hole lets the run complete in order.
		writeFileSync(join(dir, '0003_broken.sql'), 'SELECT 1');
		const healed = await runMigrations({ dir, versionTable: VERSION_TABLE });
		expect(healed.applied).toEqual(['0003_broken.sql', '0004_after_hole.sql']);
	});

	/**
	 * Hold ACCESS EXCLUSIVE on the target from ANOTHER connection for `holdMs`.
	 * Resolves `locked` once the lock is really held, so the migration is known
	 * to start behind it.
	 */
	function holdTargetLock(holdMs: number): { locked: Promise<void>; released: Promise<void> } {
		let signalLocked: () => void = () => {};
		const locked = new Promise<void>((resolve) => {
			signalLocked = resolve;
		});
		const released = withTransaction(async () => {
			await sql.unsafe(`LOCK TABLE "${TARGET_TABLE}" IN ACCESS EXCLUSIVE MODE`, []);
			signalLocked();
			await Bun.sleep(holdMs);
		});
		return { locked, released };
	}

	test('a lock-timeout migration is RETRIED and lands once the lock is free', async () => {
		writeFileSync(
			join(dir, '0005_behind_a_lock.sql'),
			`SET LOCAL lock_timeout = '150ms';\nALTER TABLE "${TARGET_TABLE}" ADD COLUMN behind_lock text`,
		);
		const holder = holdTargetLock(900);
		await holder.locked;
		const run = await runMigrations({
			dir,
			versionTable: VERSION_TABLE,
			lockRetryDelaysMs: [250, 250, 250, 250, 250, 250, 250, 250],
		});
		await holder.released;
		expect(run.applied).toEqual(['0005_behind_a_lock.sql']);
		const columns = (await sql.unsafe(
			'SELECT column_name FROM information_schema.columns WHERE table_name = $1',
			[TARGET_TABLE],
		)) as { column_name: string }[];
		expect(columns.map((column) => column.column_name)).toContain('behind_lock');
	});

	test('a lock timeout with no retry left aborts WITHOUT recording the file', async () => {
		writeFileSync(
			join(dir, '0006_still_locked.sql'),
			`SET LOCAL lock_timeout = '100ms';\nALTER TABLE "${TARGET_TABLE}" ADD COLUMN still_locked text`,
		);
		const holder = holdTargetLock(600);
		await holder.locked;
		const error = await runMigrations({
			dir,
			versionTable: VERSION_TABLE,
			lockRetryDelaysMs: [50],
		}).catch((caught: unknown) => caught);
		await holder.released;
		expect((error as { errno?: string }).errno).toBe('55P03');
		const recorded = (await sql.unsafe(`SELECT version FROM "${VERSION_TABLE}"`, [])) as {
			version: string;
		}[];
		expect(recorded.map((row) => row.version)).not.toContain('0006_still_locked.sql');
		// The lock gone, the next boot applies it.
		const healed = await runMigrations({ dir, versionTable: VERSION_TABLE });
		expect(healed.applied).toEqual(['0006_still_locked.sql']);
	});

	test('the runner bounds every migration lock wait by default (SET LOCAL, never session-wide)', async () => {
		writeFileSync(
			join(dir, '0007_reads_its_timeout.sql'),
			`CREATE TABLE "${TARGET_TABLE}_timeout" AS SELECT current_setting('lock_timeout') AS value`,
		);
		try {
			const run = await runMigrations({ dir, versionTable: VERSION_TABLE });
			expect(run.applied).toEqual(['0007_reads_its_timeout.sql']);
			const rows = (await sql.unsafe(`SELECT value FROM "${TARGET_TABLE}_timeout"`, [])) as {
				value: string;
			}[];
			expect(rows[0]?.value).toBe(MIGRATION_LOCK_TIMEOUT);
			// SET LOCAL died with the migration's transaction: a pooled read sees the default.
			const after = (await sql.unsafe(`SELECT current_setting('lock_timeout') AS value`, [])) as {
				value: string;
			}[];
			expect(after[0]?.value).not.toBe(MIGRATION_LOCK_TIMEOUT);
		} finally {
			await sql.unsafe(`DROP TABLE IF EXISTS "${TARGET_TABLE}_timeout"`, []);
		}
	});

	test('a migration RUN outlives a pool-level statement_timeout (0011’s full-heap build)', async () => {
		// The pool's DB_STATEMENT_TIMEOUT_MS, simulated on the connection the run
		// joins: a 100ms ceiling, and a file that runs 300ms. Without the runner's
		// own `statement_timeout = 0` it dies 57014, which is never retried.
		writeFileSync(join(dir, '0008_long_build.sql'), 'SELECT pg_sleep(0.3)');
		const run = await withTransaction(async () => {
			await sql.unsafe(`SET LOCAL statement_timeout = '100ms'`, []);
			return runMigrations({ dir, versionTable: VERSION_TABLE });
		});
		expect(run.applied).toEqual(['0008_long_build.sql']);
	});

	/** Whether an index exists, and whether it is VALID (null = absent). */
	async function indexState(name: string): Promise<boolean | null> {
		const rows = (await sql.unsafe(
			`SELECT i.indisvalid AS valid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = $1`,
			[name],
		)) as { valid: boolean }[];
		return rows.length === 0 ? null : rows[0]?.valid === true;
	}

	test('an ONLINE file is never run pre-listen — later boot files still land — and the online run builds it CONCURRENTLY', async () => {
		const index = `${TARGET_TABLE}_online_idx`;
		writeFileSync(
			join(dir, '0009_online_index.sql'),
			`-- ONLINE MIGRATION: a full-heap build must not hold the listener.\nCREATE INDEX CONCURRENTLY IF NOT EXISTS ${index} ON "${TARGET_TABLE}" (label);\nANALYZE "${TARGET_TABLE}";\n`,
		);
		writeFileSync(
			join(dir, '0010_after_online.sql'),
			`ALTER TABLE "${TARGET_TABLE}" ADD COLUMN after_online text`,
		);
		const boot = await runMigrations({ dir, versionTable: VERSION_TABLE });
		expect(boot.applied).toEqual(['0010_after_online.sql']);
		expect(boot.deferred).toEqual(['0009_online_index.sql']);
		expect(await indexState(index)).toBeNull();
		const online = await runOnlineMigrations({ dir, versionTable: VERSION_TABLE });
		expect(online.applied).toEqual(['0009_online_index.sql']);
		expect(await indexState(index)).toBe(true);
		// Recorded: neither runner runs it again. FLOOR: both re-runs SAW the
		// recorded set, this file in it (an empty verdict from a runner that read
		// no version table would pass the two emptiness checks on its own).
		const recorded = (await sql.unsafe(`SELECT version FROM "${VERSION_TABLE}"`, [])) as {
			version: string;
		}[];
		expect(recorded.map((row) => row.version)).toContain('0009_online_index.sql');
		const bootAgain = await runMigrations({ dir, versionTable: VERSION_TABLE });
		const onlineAgain = await runOnlineMigrations({ dir, versionTable: VERSION_TABLE });
		expect(bootAgain.skipped).toBeGreaterThanOrEqual(recorded.length);
		expect(onlineAgain.skipped).toBeGreaterThanOrEqual(recorded.length);
		expect(bootAgain.deferred).toEqual([]);
		expect(onlineAgain.applied).toEqual([]);
	});

	test('an INVALID leftover of a killed build is dropped and rebuilt, never kept by IF NOT EXISTS', async () => {
		const index = `${TARGET_TABLE}_unique_label_idx`;
		// A failed CONCURRENTLY build leaves its index INVALID (duplicates here).
		await sql.unsafe(
			`INSERT INTO "${TARGET_TABLE}" (id, label) VALUES (901, 'dup'), (902, 'dup')`,
			[],
		);
		await expect(
			sql.unsafe(`CREATE UNIQUE INDEX CONCURRENTLY ${index} ON "${TARGET_TABLE}" (label)`, []),
		).rejects.toThrow();
		expect(await indexState(index)).toBe(false); // FLOOR: a real INVALID leftover
		await sql.unsafe(`DELETE FROM "${TARGET_TABLE}" WHERE id = 902`, []);
		writeFileSync(
			join(dir, '0011_online_unique.sql'),
			`-- ONLINE MIGRATION: rebuild over a leftover.\nCREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ${index} ON "${TARGET_TABLE}" (label);\n`,
		);
		const online = await runOnlineMigrations({ dir, versionTable: VERSION_TABLE });
		expect(online.applied).toEqual(['0011_online_unique.sql']);
		expect(await indexState(index)).toBe(true);
	});

	test('an ONLINE file outside the grammar is refused and never recorded', async () => {
		const file = '0012_online_bad.sql';
		writeFileSync(
			join(dir, file),
			`-- ONLINE MIGRATION: not an index build.\nDELETE FROM "${TARGET_TABLE}";\n`,
		);
		try {
			await expect(runOnlineMigrations({ dir, versionTable: VERSION_TABLE })).rejects.toThrow(
				/outside the grammar/,
			);
			const recorded = (await sql.unsafe(`SELECT version FROM "${VERSION_TABLE}"`, [])) as {
				version: string;
			}[];
			expect(recorded.map((row) => row.version)).not.toContain(file);
		} finally {
			rmSync(join(dir, file), { force: true });
		}
	});

	test('a SHUTDOWN stops an online build in flight: bounded, cancelled, unrecorded', async () => {
		// The build a SIGTERM lands in: unbounded on its reserved connection, so
		// without the stop hook pool.end() waited for all of it. A 0.5 s
		// IMMUTABLE expression over 10 rows = seconds per heap pass (CONCURRENTLY
		// makes two), far past the bound asserted below.
		const file = '0013_online_slow.sql';
		const slow = `dedalo_ts_test_slow_${process.pid}`;
		const index = `${TARGET_TABLE}_slow_idx`;
		await sql.unsafe(
			`CREATE OR REPLACE FUNCTION ${slow}(t text) RETURNS text LANGUAGE plpgsql IMMUTABLE
			 AS $$ BEGIN PERFORM pg_sleep(0.5); RETURN t; END $$`,
			[],
		);
		await sql.unsafe(
			`INSERT INTO "${TARGET_TABLE}" (id, label) SELECT g, 'slow' || g FROM generate_series(950, 959) g`,
			[],
		);
		writeFileSync(
			join(dir, file),
			`-- ONLINE MIGRATION: a slow build.\nCREATE INDEX CONCURRENTLY IF NOT EXISTS ${index} ON "${TARGET_TABLE}" (${slow}(label));\n`,
		);
		try {
			const run = runOnlineMigrations({ dir, versionTable: VERSION_TABLE });
			const outcome = run.then(
				() => 'finished',
				(error: unknown) => (error as { errno?: unknown }).errno,
			);
			// FLOOR: the build is really running when the stop arrives.
			let building = false;
			for (let i = 0; i < 100 && !building; i++) {
				const rows = (await sql.unsafe(
					`SELECT 1 FROM pg_stat_activity WHERE state = 'active' AND query LIKE $1`,
					[`%CREATE INDEX CONCURRENTLY%${index}%`],
				)) as unknown[];
				building = rows.length > 0;
				if (!building) await Bun.sleep(50);
			}
			expect(building).toBe(true);
			const started = Date.now();
			await stopOnlineMigrations();
			expect(Date.now() - started).toBeLessThan(3_000);
			expect(await outcome).toBe('57014'); // cancelled, never finished
			const recorded = (await sql.unsafe(`SELECT version FROM "${VERSION_TABLE}"`, [])) as {
				version: string;
			}[];
			expect(recorded.map((row) => row.version)).not.toContain(file);
			expect(await indexState(index)).not.toBe(true); // INVALID leftover (or none): next boot rebuilds
		} finally {
			rmSync(join(dir, file), { force: true });
			await sql.unsafe(`DROP INDEX IF EXISTS "${index}"`, []);
			await sql.unsafe(`DELETE FROM "${TARGET_TABLE}" WHERE id BETWEEN 950 AND 959`, []);
			await sql.unsafe(`DROP FUNCTION IF EXISTS ${slow}(text)`, []);
		}
	}, 30_000);

	test('refuses an invalid version-table name (identifier chokepoint)', async () => {
		await expect(runMigrations({ dir, versionTable: 'bad"name; DROP TABLE x' })).rejects.toThrow(
			/invalid version table/,
		);
	});
});
