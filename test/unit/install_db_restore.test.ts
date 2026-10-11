/**
 * P3 gate (LOAD-BEARING) — db_restore + set_root_pw against a REAL scratch DB.
 *
 * Creates a throwaway Postgres database, restores the vendored seed into it,
 * asserts the schema/ontology/extensions landed, sets the root password
 * (Argon2id), and verifies the stored hash against the password. Uses an
 * EXPLICIT connection descriptor throughout, so the live DB is never touched.
 * The scratch DB is dropped in afterAll.
 *
 * ATOMIC RESTORE (terminal installer, 2026-10-11): the seed is restored as ONE
 * transaction (`psql --single-transaction`), so a seed that fails part-way —
 * here the real seed with one bad statement APPENDED, after every table, row
 * and function of it has been executed — leaves its scratch database with ZERO
 * user objects (db_restore.ts inspectTargetDatabase), never a half-built one.
 *
 * Requires a reachable local Postgres (the same one the parity suite uses). When
 * the admin connection is unavailable the suite skips loudly rather than failing.
 *
 * CRASH TEARDOWN: `afterAll` is not a guarantee — a killed process runs no
 * code — so every DROP here is `WITH (FORCE)` and `beforeAll` first sweeps
 * this gate's own orphaned `<prefix><dead pid>` scratch databases through the
 * SHARED helper (test/helpers/scratch_database.ts — ONE implementation; its
 * header carries the measured incident, `dedalo_install_p4_48373`, 218 MB, the
 * refusal grammar, and what the sweep does NOT prove).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { config } from '../../src/config/config.ts';
import { isDedaloError } from '../../src/core/errors/index.ts';
import { inspectTargetDatabase, installDbFromSeed } from '../../src/core/install/db_restore.ts';
import { installFinish } from '../../src/core/install/finish.ts';
import { SEED_DUMP_PATH } from '../../src/core/install/paths.ts';
import type { DbConnDescriptor } from '../../src/core/install/pg_exec.ts';
import { runPsql } from '../../src/core/install/pg_exec.ts';
import { setRootPassword } from '../../src/core/install/root_pw.ts';
import { CORE_ONTOLOGY_TLDS } from '../../src/core/ontology/core_tlds.ts';
import { sweepOrphanScratchDatabases } from '../helpers/scratch_database.ts';

const SCRATCH_PREFIX = 'dedalo_install_p3_';
const SCRATCH_DB = `${SCRATCH_PREFIX}${process.pid}`;
const ROOT_PW = 'Testpw-Root-8';

/** Admin descriptor (target the maintenance DB to CREATE/DROP the scratch one). */
const admin: DbConnDescriptor = {
	database: 'postgres',
	host: config.db.host,
	port: config.db.port,
	user: config.db.user,
	password: config.db.password,
};
const scratch: DbConnDescriptor = { ...admin, database: SCRATCH_DB };
/** The broken-seed target: its own prefix, so each sweep keeps its `<prefix><pid>` grammar. */
const BROKEN_PREFIX = 'dedalo_install_p3b_';
const BROKEN_DB = `${BROKEN_PREFIX}${process.pid}`;
const broken: DbConnDescriptor = { ...admin, database: BROKEN_DB };

let available = false;

/**
 * Decided at COLLECTION time for the atomic-restore case (test.if reads it when
 * the test is declared, never after a hook ran — install_e2e's header): can this
 * role create a database. The older cases keep their hook-set flag.
 */
async function adminCanCreateDatabase(): Promise<boolean> {
	const probe = await runPsql(admin, [
		'-tAc',
		'SELECT rolcreatedb OR rolsuper FROM pg_roles WHERE rolname = current_user',
	]);
	return probe.exitCode === 0 && probe.stdout.trim() === 't';
}
const canCreate = await adminCanCreateDatabase();

// Crash teardown: the sweep lives ONCE in test/helpers/scratch_database.ts —
// its header carries the measured incident, the refusal grammar, and what the
// sweep does not prove.
beforeAll(async () => {
	const probe = await runPsql(admin, ['-tAc', 'SELECT 1']);
	if (probe.exitCode !== 0) return;
	// Reclaim what a killed predecessor could not (see the header).
	await sweepOrphanScratchDatabases(admin, SCRATCH_PREFIX);
	await sweepOrphanScratchDatabases(admin, BROKEN_PREFIX);
	await runPsql(admin, ['-c', `DROP DATABASE IF EXISTS "${SCRATCH_DB}" WITH (FORCE)`]);
	await runPsql(admin, ['-c', `DROP DATABASE IF EXISTS "${BROKEN_DB}" WITH (FORCE)`]);
	const created = await runPsql(admin, ['-c', `CREATE DATABASE "${SCRATCH_DB}"`]);
	const createdBroken = await runPsql(admin, ['-c', `CREATE DATABASE "${BROKEN_DB}"`]);
	available = created.exitCode === 0 && createdBroken.exitCode === 0;
});

afterAll(async () => {
	if (available) {
		await runPsql(admin, ['-c', `DROP DATABASE IF EXISTS "${SCRATCH_DB}" WITH (FORCE)`]);
		await runPsql(admin, ['-c', `DROP DATABASE IF EXISTS "${BROKEN_DB}" WITH (FORCE)`]);
	}
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
		expect(restored.ok).toBe(true);

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
		// The restored database is CORE-ONLY (installer unification A2): exactly the
		// core ontologies, no test3 playground record — and an explicit connection
		// says it left the pool-bound completion (stores, engine ontology, core
		// hierarchies) to the caller.
		const tlds = await runPsql(scratch, [
			'-tAc',
			"SELECT string_agg(DISTINCT tld, ',' ORDER BY tld) FROM dd_ontology",
		]);
		expect(tlds.stdout.trim().split(',')).toEqual([...CORE_ONTOLOGY_TLDS].sort());
		const playground = await runPsql(scratch, ['-tAc', 'SELECT count(*) FROM matrix_test']);
		expect(Number(playground.stdout.trim())).toBe(0);
		expect(restored.msg).toContain('explicit connection');
	}, 60000);

	test('a non-empty DB refuses re-restore (never clobbers data)', async () => {
		if (!available) return;
		// P1 sweep: a refusal is a THROWN registered code, never a `result:false` body.
		const error = await installDbFromSeed(scratch).then(
			() => null,
			(caught: unknown) => caught,
		);
		expect(isDedaloError(error)).toBe(true);
		expect((error as { code: string }).code).toBe('install.state_conflict');
		expect((error as Error).message).toContain('not empty');
	});

	test('set_root_pw writes an Argon2id hash at section_id -1 that verifies', async () => {
		if (!available) return;
		const set = await setRootPassword(ROOT_PW, scratch);
		expect(set.ok).toBe(true);

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
		const error = await setRootPassword('Another-Root-9', scratch).then(
			() => null,
			(caught: unknown) => caught,
		);
		expect(isDedaloError(error)).toBe(true);
		expect((error as { code: string }).code).toBe('install.state_conflict');
		expect((error as Error).message).toContain('already set');
	});

	test('install_finish seals only after root + password exist', async () => {
		if (!available) return;
		const finished = await installFinish(scratch);
		expect(finished.ok).toBe(true);
	});

	test.if(canCreate)(
		`a seed failing part-way is rolled back WHOLE: the database keeps zero user objects${canCreate ? '' : ' — SKIPPED: the admin role cannot CREATE DATABASE'}`,
		async () => {
			expect(available, 'the scratch databases were created').toBe(true);
			const dir = mkdtempSync(join(tmpdir(), 'dedalo_broken_seed_'));
			try {
				const brokenSeed = join(dir, 'broken.pgsql.gz');
				const sql = gunzipSync(readFileSync(SEED_DUMP_PATH)).toString('utf8');
				writeFileSync(
					brokenSeed,
					gzipSync(`${sql}\nSELECT this_function_does_not_exist_dedalo_p3b();\n`),
				);
				const before = await inspectTargetDatabase(broken);
				expect(before.emptyForInstall).toBe(true);
				const error = await installDbFromSeed(broken, brokenSeed).then(
					() => null,
					(caught: unknown) => caught,
				);
				expect(isDedaloError(error)).toBe(true);
				expect((error as { code: string }).code).toBe('install.step_failed');
				expect((error as Error).message).toContain('this_function_does_not_exist_dedalo_p3b');
				const after = await inspectTargetDatabase(broken);
				expect(after.userObjects).toEqual([]);
				expect(after.userObjectCount).toBe(0);
				expect(after.extensions).toEqual(before.extensions);
				// Anti-vacuity: the same seed WITHOUT the bad tail does build objects (test 1).
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		},
		120000,
	);
});
