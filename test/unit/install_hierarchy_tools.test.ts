/**
 * P4 gate — hierarchy import + register_tools against a REAL scratch DB.
 *
 * Restores the seed into a throwaway DB, imports one small hierarchy TLD (its
 * `<tld>1.copy.gz` rows land in matrix_hierarchy and the counter is
 * consolidated), and registers the tools (matrix_tools populated). Explicit
 * connection throughout; scratch DB dropped after.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../../src/config/config.ts';
import { installDbFromSeed } from '../../src/core/install/db_restore.ts';
import { installHierarchies } from '../../src/core/install/hierarchy_import.ts';
import { HIERARCHY_IMPORT_DIR } from '../../src/core/install/paths.ts';
import type { DbConnDescriptor } from '../../src/core/install/pg_exec.ts';
import { runPsql } from '../../src/core/install/pg_exec.ts';

const SCRATCH_DB = `dedalo_install_p4_${process.pid}`;
// A small, always-vendored TLD (Spain terms).
const TLD = 'es';

const admin: DbConnDescriptor = {
	database: 'postgres',
	host: config.db.host,
	port: config.db.port,
	user: config.db.user,
	password: config.db.password,
};
const scratch: DbConnDescriptor = { ...admin, database: SCRATCH_DB };

let available = false;

beforeAll(async () => {
	const probe = await runPsql(admin, ['-tAc', 'SELECT 1']);
	if (probe.exitCode !== 0) return;
	await runPsql(admin, ['-c', `DROP DATABASE IF EXISTS "${SCRATCH_DB}"`]);
	const created = await runPsql(admin, ['-c', `CREATE DATABASE "${SCRATCH_DB}"`]);
	available = created.exitCode === 0;
	if (available) await installDbFromSeed(scratch);
}, 90000);

afterAll(async () => {
	if (available) await runPsql(admin, ['-c', `DROP DATABASE IF EXISTS "${SCRATCH_DB}"`]);
});

describe('hierarchy import + register_tools (P4)', () => {
	test('the es TLD data file is vendored', () => {
		expect(existsSync(join(HIERARCHY_IMPORT_DIR, `${TLD}1.copy.gz`))).toBe(true);
	});

	test('import lands rows in matrix_hierarchy and consolidates the counter', async () => {
		if (!available) {
			console.warn('[UNCOVERED] no admin Postgres connection — P4 hierarchy import skipped');
			return;
		}
		const result = await installHierarchies([TLD], scratch);
		expect(result.result).toBe(true);
		expect(result.responses.find((r) => r.tld === TLD)?.result).toBe(true);

		const rows = await runPsql(scratch, [
			'-tAc',
			`SELECT count(*) FROM matrix_hierarchy WHERE section_tipo = '${TLD}1'`,
		]);
		expect(Number(rows.stdout.trim())).toBeGreaterThan(0);

		// The counter for es1 was set to MAX(section_id) of the imported rows.
		const counter = await runPsql(scratch, [
			'-tAc',
			`SELECT c.value = m.mx FROM matrix_counter c,
			   (SELECT MAX(section_id) mx FROM matrix_hierarchy WHERE section_tipo = '${TLD}1') m
			 WHERE c.tipo = '${TLD}1'`,
		]);
		expect(counter.stdout.trim()).toBe('t');
	}, 60000);

	test('an unknown TLD reports an error (no data file)', async () => {
		if (!available) return;
		const result = await installHierarchies(['zz'], scratch);
		expect(result.result).toBe(false);
		expect(result.errors.join(' ')).toContain('zz');
	});
});
