/**
 * install_db_from_default_file (PHP installer_database_manager). Restores the
 * vendored seed dump into an EMPTY database: schema (30+ tables), extensions,
 * functions, indexes, the populated core `dd_ontology`, root user (empty pw),
 * and the default project/profiles.
 *
 * Gate: the target DB must be empty (no `matrix_users` table) — a populated DB
 * is never clobbered. The dump is plain-format SQL, gunzipped in-process and fed
 * to psql with ON_ERROR_STOP=1; a nonzero exit is a hard failure (no partial
 * success). PGPASSWORD + -h/-p make it remote-safe.
 */

import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { SEED_DUMP_PATH } from './paths.ts';
import { connFromConfig, type DbConnDescriptor, runPsql } from './pg_exec.ts';
import { refuseInstall } from './refuse.ts';

/** The step's answer on the ONLY path that returns: restored (every refusal throws). */
export interface DbRestoreResult {
	ok: true;
	msg: string;
}

/** Is the target DB empty (no matrix_users table)? */
async function targetIsEmpty(conn: DbConnDescriptor): Promise<boolean> {
	const probe = await runPsql(conn, ['-tAc', "SELECT to_regclass('public.matrix_users')"]);
	if (probe.exitCode !== 0) {
		// Cannot even query → treat as "not safely empty"; the caller reports it.
		return false;
	}
	// to_regclass returns the relation name when it exists, empty/NULL otherwise.
	return probe.stdout.trim() === '';
}

/** Restore the seed dump into an empty database. `conn` defaults to config.db. */
/*
 * COVERAGE-EXEMPT (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): a ONE-SHOT install procedure that
 * MUTATES THE MACHINE — config files, a database restore, root credentials, a
 * 126 MB hierarchy import, or a process restart. Blocked by DANGER, not by
 * fixture: the hermetic logic in the same subsystem (deriveLangConfig,
 * installIpAllowed, resolvePgBinary, the hierarchy_meta readers) IS gated
 * (test/unit/tier1_install_native.test.ts).
 */
export async function installDbFromSeed(conn?: DbConnDescriptor): Promise<DbRestoreResult> {
	const connection = conn ?? connFromConfig();

	// Empty-DB gate: never restore over an existing install.
	const reachable = await runPsql(connection, ['-tAc', 'SELECT 1']);
	if (reachable.exitCode !== 0) {
		refuseInstall('install.step_failed', `Database not reachable: ${reachable.stderr}`);
	}
	if (!(await targetIsEmpty(connection))) {
		refuseInstall(
			'install.state_conflict',
			'Database is not empty (matrix_users already exists) — restore refused',
		);
	}

	// Decompress the seed to a temp .sql and restore with `psql -f` — far more
	// robust than streaming ~14 MB through stdin (backpressure/EPIPE). The temp
	// file is always removed.
	const tmpSql = join(tmpdir(), `dedalo_seed_${process.pid}_${Date.now()}.sql`);
	try {
		writeFileSync(tmpSql, gunzipSync(readFileSync(SEED_DUMP_PATH)));
	} catch (error) {
		rmSync(tmpSql, { force: true });
		refuseInstall(
			'install.step_failed',
			`Cannot read/decompress seed: ${(error as Error).message}`,
			error,
		);
	}
	try {
		const restore = await runPsql(connection, ['-v', 'ON_ERROR_STOP=1', '--quiet', '-f', tmpSql]);
		if (restore.exitCode !== 0) {
			refuseInstall(
				'install.step_failed',
				`Restore failed: ${restore.stderr || 'psql nonzero exit'}`,
			);
		}
		// Fresh installs get the full canonical test3 playground (WC-021 —
		// single verified source, src/core/test_data/; the dump ships one bare
		// row). Default-config path only: seed.ts writes through the pool, which
		// is guaranteed to point at this DB only when no explicit conn was given.
		if (conn === undefined) {
			const { resetTestSection } = await import('../test_data/seed.ts');
			await resetTestSection();
			// The generic `test` TLD STRUCTURE comes from its one reviewable
			// source (src/core/test_data/test_tld_ontology.json), materialized
			// through the engine's own doors: matrix_ontology `<tld>0` records,
			// then rebuildOntology() derives dd_ontology. The seed ships only the
			// bootstrap the rebuild needs (the ontology35 registry row), so this
			// is what actually gives a fresh install its Test area.
			// allowAnyDatabase: a fresh install's database IS the application's —
			// the door's test-database guard exists for the suite, not for here,
			// and this runs on a database this step just restored from the seed.
			const { materializeTestTldOntology } = await import('../test_data/test_tld_materialize.ts');
			const testTld = await materializeTestTldOntology({ allowAnyDatabase: true });
			return {
				ok: true,
				msg: `Database installed from seed + canonical test3 playground + test TLD ontology (${testTld.nodes} nodes in ${testTld.tlds.join(', ')}) — OK`,
			};
		}
		return {
			ok: true,
			msg: 'Database installed from seed — OK (test3 playground seed skipped: explicit connection)',
		};
	} finally {
		rmSync(tmpSql, { force: true });
	}
}
