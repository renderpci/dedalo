/**
 * P5 gate (E2E) — the full TS-native install via the CLI, ending in a real root
 * login. Spawns scripts/install.ts against a throwaway Postgres database with
 * ALL writes redirected to a scratch dir (private/.env, state, sessions), so the
 * live install is never touched. Proves the entire PHP-free path:
 *   pre-flight → db connection → .env → directories → seed restore → Argon2id
 *   root pw → seal → root login verified.
 *
 * Skips loudly when no admin Postgres connection is available.
 *
 * CRASH TEARDOWN: `afterAll` is not a guarantee — a killed process runs no
 * code — so every DROP here is `WITH (FORCE)` and `beforeAll` first sweeps
 * this gate's own orphaned `<prefix><dead pid>` scratch databases through the
 * SHARED helper (test/helpers/scratch_database.ts — ONE implementation; its
 * header carries the measured incident, `dedalo_install_p4_48373`, 218 MB, the
 * refusal grammar, and what the sweep does NOT prove).
 * It also says nothing about the scratch DIRECTORY this gate makes under the
 * system temp dir, which has its own teardown and its own leak.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { config } from '../../src/config/config.ts';
import type { DbConnDescriptor } from '../../src/core/install/pg_exec.ts';
import { runPsql } from '../../src/core/install/pg_exec.ts';
import { sweepOrphanScratchDatabases } from '../helpers/scratch_database.ts';

const SCRATCH_PREFIX = 'dedalo_install_e2e_';
const SCRATCH_DB = `${SCRATCH_PREFIX}${process.pid}`;
const CLI = resolve(import.meta.dir, '../../scripts/install.ts');
const scratchDir = mkdtempSync(join(tmpdir(), 'dedalo_install_e2e_'));

const admin: DbConnDescriptor = {
	database: 'postgres',
	host: config.db.host,
	port: config.db.port,
	user: config.db.user,
	password: config.db.password,
};

let available = false;

// Crash teardown: the sweep lives ONCE in test/helpers/scratch_database.ts —
// its header carries the measured incident, the refusal grammar, and what the
// sweep does not prove.
beforeAll(async () => {
	const probe = await runPsql(admin, ['-tAc', 'SELECT 1']);
	if (probe.exitCode !== 0) return;
	// Reclaim what a killed predecessor could not (see the header).
	await sweepOrphanScratchDatabases(admin, SCRATCH_PREFIX);
	await runPsql(admin, ['-c', `DROP DATABASE IF EXISTS "${SCRATCH_DB}" WITH (FORCE)`]);
	const created = await runPsql(admin, ['-c', `CREATE DATABASE "${SCRATCH_DB}"`]);
	available = created.exitCode === 0;
});

afterAll(async () => {
	if (available)
		await runPsql(admin, ['-c', `DROP DATABASE IF EXISTS "${SCRATCH_DB}" WITH (FORCE)`]);
	rmSync(scratchDir, { recursive: true, force: true });
});

/** Run the install CLI against the scratch DB with fully redirected writes. */
function runCli(extraArgs: string[] = []): { exitCode: number; out: string } {
	const proc = Bun.spawnSync(
		[
			'bun',
			'run',
			CLI,
			'--db-name',
			SCRATCH_DB,
			'--db-user',
			config.db.user,
			'--db-host',
			config.db.host,
			'--db-port',
			String(config.db.port),
			'--entity',
			'e2etest',
			'--root-password',
			'RootPw12345',
			'--skip-tools',
			...extraArgs,
		],
		{
			env: {
				...process.env,
				DEDALO_INSTALL_PRIVATE_DIR: scratchDir,
				DEDALO_TS_STATE_PATH: join(scratchDir, 'ts_state.json'),
				DEDALO_SESSION_DB_PATH: join(scratchDir, 'sessions.sqlite'),
			},
			stdout: 'pipe',
			stderr: 'pipe',
		},
	);
	return {
		exitCode: proc.exitCode,
		out: proc.stdout.toString() + proc.stderr.toString(),
	};
}

describe('TS-native install e2e (P5)', () => {
	test('the CLI installs a fresh DB and verifies the root login', () => {
		if (!available) {
			console.warn('[UNCOVERED] no admin Postgres connection — e2e install skipped');
			return;
		}
		const { exitCode, out } = runCli();
		expect(out).toContain('root login verified');
		expect(exitCode).toBe(0);
	}, 120000);

	test('re-running the CLI on the now-populated DB refuses the restore', () => {
		if (!available) return;
		const { exitCode, out } = runCli();
		expect(exitCode).not.toBe(0);
		expect(out).toContain('not empty');
	}, 60000);
});
