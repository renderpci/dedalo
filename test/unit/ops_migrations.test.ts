/**
 * Ordered-migration runner gate (audit S2-39, WS-E item 7).
 *
 * THE GUARANTEES under test, against the REAL Postgres:
 * - pending numbered .sql files apply in filename order, each recorded in the
 *   version table;
 * - a re-run applies nothing (idempotent boot);
 * - a failing migration aborts the run WITHOUT recording itself (the next
 *   boot retries it; later files never leapfrog a hole);
 * - non-matching filenames are ignored.
 *
 * Scratch surfaces only: a temp migrations dir + a dedalo_ts_test_* version
 * table + dedalo_ts_test_* target tables, all dropped in afterAll.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations } from '../../install/db/migrate.ts';
import { sql } from '../../src/core/db/postgres.ts';

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

	test('refuses an invalid version-table name (identifier chokepoint)', async () => {
		await expect(runMigrations({ dir, versionTable: 'bad"name; DROP TABLE x' })).rejects.toThrow(
			/invalid version table/,
		);
	});
});
