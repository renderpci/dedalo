/**
 * P3 gate (LOAD-BEARING) — db_restore + set_root_pw against a REAL scratch DB.
 *
 * Creates a throwaway Postgres database, restores the vendored seed into it,
 * asserts the schema/ontology/extensions landed, sets the root password
 * (Argon2id), and verifies the stored hash against the password. Uses an
 * EXPLICIT connection descriptor throughout, so the live DB is never touched.
 * The scratch DB is dropped in afterAll.
 *
 * Requires a reachable local Postgres (the same one the parity suite uses). When
 * the admin connection is unavailable the suite skips loudly rather than failing.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { installDbFromSeed } from '../../src/core/install/db_restore.ts';
import { installFinish } from '../../src/core/install/finish.ts';
import type { DbConnDescriptor } from '../../src/core/install/pg_exec.ts';
import { runPsql } from '../../src/core/install/pg_exec.ts';
import { setRootPassword } from '../../src/core/install/root_pw.ts';

const SCRATCH_DB = `dedalo_install_p3_${process.pid}`;
const ROOT_PW = 'Testpw12345';

/** Admin descriptor (target the maintenance DB to CREATE/DROP the scratch one). */
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
});

afterAll(async () => {
	if (available) await runPsql(admin, ['-c', `DROP DATABASE IF EXISTS "${SCRATCH_DB}"`]);
	// installFinish sealed the scratch state file — reset so sibling suites in
	// the same run do not observe a sealed install.
	const { setServerState } = await import('../../src/core/resolve/server_state.ts');
	setServerState({ install_status: undefined });
});

describe('db_restore + set_root_pw (P3, load-bearing)', () => {
	test('restore into an empty DB populates schema, ontology, and extensions', async () => {
		if (!available) {
			console.warn('[UNCOVERED] no admin Postgres connection — P3 restore skipped');
			return;
		}
		const restored = await installDbFromSeed(scratch);
		expect(restored.result).toBe(true);

		const users = await runPsql(scratch, ['-tAc', 'SELECT count(*) FROM matrix_users']);
		expect(Number(users.stdout.trim())).toBeGreaterThanOrEqual(1);
		const ontology = await runPsql(scratch, ['-tAc', 'SELECT count(*) FROM dd_ontology']);
		expect(Number(ontology.stdout.trim())).toBeGreaterThan(100);
		const ext = await runPsql(scratch, [
			'-tAc',
			"SELECT string_agg(extname, ',' ORDER BY extname) FROM pg_extension",
		]);
		expect(ext.stdout).toContain('pg_trgm');
		expect(ext.stdout).toContain('unaccent');
	}, 60000);

	test('a non-empty DB refuses re-restore (never clobbers data)', async () => {
		if (!available) return;
		const again = await installDbFromSeed(scratch);
		expect(again.result).toBe(false);
		expect(again.msg).toContain('not empty');
	});

	test('set_root_pw writes an Argon2id hash at section_id -1 that verifies', async () => {
		if (!available) return;
		const set = await setRootPassword(ROOT_PW, scratch);
		expect(set.result).toBe(true);

		const read = await runPsql(scratch, [
			'-tAc',
			"SELECT string->'dd133'->0->>'value' FROM matrix_users WHERE section_id = -1",
		]);
		const hash = read.stdout.trim();
		expect(hash.startsWith('$argon2id$')).toBe(true);
		expect(await Bun.password.verify(ROOT_PW, hash)).toBe(true);
	});

	test('set_root_pw refuses when a password already exists', async () => {
		if (!available) return;
		const again = await setRootPassword('Another12345', scratch);
		expect(again.result).toBe(false);
		expect(again.msg).toContain('already set');
	});

	test('install_finish seals only after root + password exist', async () => {
		if (!available) return;
		const finished = await installFinish(scratch);
		expect(finished.result).toBe(true);
	});
});
