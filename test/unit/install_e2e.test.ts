/**
 * P5 gate (E2E) — the full TS-native install via the CLI, ending in a real root
 * login. Spawns scripts/install.ts against a throwaway Postgres database with
 * ALL writes redirected to a scratch dir (private/.env, state, sessions), so the
 * live install is never touched. Proves the entire PHP-free path:
 *   pre-flight → db connection → .env → directories → seed restore (+ core
 *   hierarchy activation) → Argon2id root pw → optional thesauri → seal → root
 *   login verified.
 *
 * And, since the installer unification (2026-10-08), what the install LEAVES:
 *  - the step lines the CLI prints are exactly the steps its own `--plan`
 *    announces (the CLI runs the shared plan, not a private sequence);
 *  - Languages (lg) is ACTIVE (hierarchy4 → dd64/1) with ZERO lg rows in
 *    matrix_hierarchy — activated against the seed's matrix_langs terms, never
 *    imported;
 *  - the shared default thesaurus set reached the CLI (no --hierarchies given):
 *    every default tld is registered active and its terms are in;
 *  - the written .env carries the official ONTOLOGY_SERVERS / CODE_SERVERS
 *    and no DEDALO_SUPERVISED.
 * The default thesaurus import (tens of thousands of rows) is why the first
 * case's timeout is generous — measured, never narrowed by passing
 * `--hierarchies none`.
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
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { config } from '../../src/config/config.ts';
import { parseEnvFile } from '../../src/config/env.ts';
import { defaultOptionalHierarchies } from '../../src/core/install/hierarchy_meta.ts';
import {
	OFFICIAL_CODE_SERVER,
	OFFICIAL_ONTOLOGY_SERVER,
} from '../../src/core/install/install_plan.ts';
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

/**
 * DECIDED AT MODULE TOP LEVEL, BEFORE ANY `test.if` IS REGISTERED. `test.if(x)`
 * reads `x` when the test is DECLARED — during collection, long before any
 * `beforeAll` runs — so a flag a hook sets is always its initial `false`: from
 * P2-19 until 2026-10-08 this gate set `available` in `beforeAll` and both cases
 * SKIPPED on every machine, the admin connection notwithstanding (and nobody saw
 * that its root password failed the policy). The probe asks the one thing the
 * gate needs: can this role create a database. Creating it stays in `beforeAll`,
 * so collecting the file (a filtered run) creates nothing; a CREATE that then
 * fails is a red, not a skip — the probe said it would work.
 */
async function adminCanCreateDatabase(): Promise<boolean> {
	const probe = await runPsql(admin, [
		'-tAc',
		'SELECT rolcreatedb OR rolsuper FROM pg_roles WHERE rolname = current_user',
	]);
	return probe.exitCode === 0 && probe.stdout.trim() === 't';
}
const available = await adminCanCreateDatabase();

// Crash teardown: the sweep lives ONCE in test/helpers/scratch_database.ts —
// its header carries the measured incident, the refusal grammar, and what the
// sweep does not prove.
beforeAll(async () => {
	if (!available) return;
	// Reclaim what a killed predecessor could not (see the header).
	await sweepOrphanScratchDatabases(admin, SCRATCH_PREFIX);
	await runPsql(admin, ['-c', `DROP DATABASE IF EXISTS "${SCRATCH_DB}" WITH (FORCE)`]);
	const created = await runPsql(admin, ['-c', `CREATE DATABASE "${SCRATCH_DB}"`]);
	expect(created.exitCode, `CREATE DATABASE ${SCRATCH_DB}: ${created.stderr}`).toBe(0);
});

afterAll(async () => {
	if (available)
		await runPsql(admin, ['-c', `DROP DATABASE IF EXISTS "${SCRATCH_DB}" WITH (FORCE)`]);
	rmSync(scratchDir, { recursive: true, force: true });
});

/** The answers every run gives (no --hierarchies: the shared default applies). */
function cliArgs(): string[] {
	return [
		'--db-name',
		SCRATCH_DB,
		'--db-user',
		config.db.user,
		'--db-host',
		config.db.host,
		'--db-port',
		String(config.db.port),
		// The admin connection's own password, when it has one: a runner's Postgres
		// (md5/scram) asks for it, where a desk's trust/.pgpass setup does not — without
		// it the CLI's connection check is refused on CI and passes here (2026-10-09).
		...(config.db.password ? ['--db-password', config.db.password] : []),
		'--entity',
		'e2etest',
		'--root-password',
		// Must pass the ONE password policy (src/core/security/password_policy.ts):
		// set_root_pw enforces it, and the old 'RootPw12345' failed it ('sequence').
		'Mosaic-Kestrel-Harbor-47',
		'--skip-tools',
	];
}

/** Run the install CLI against the scratch DB with fully redirected writes. */
function runCli(extraArgs: string[] = []): { exitCode: number; out: string } {
	const proc = Bun.spawnSync(['bun', 'run', CLI, ...cliArgs(), ...extraArgs], {
		env: {
			...process.env,
			DEDALO_INSTALL_PRIVATE_DIR: scratchDir,
			DEDALO_TS_STATE_PATH: join(scratchDir, 'ts_state.json'),
			DEDALO_SESSION_DB_PATH: join(scratchDir, 'sessions.sqlite'),
		},
		stdout: 'pipe',
		stderr: 'pipe',
	});
	return {
		exitCode: proc.exitCode,
		out: proc.stdout.toString() + proc.stderr.toString(),
	};
}

const scratchConn = (): DbConnDescriptor => ({ ...admin, database: SCRATCH_DB });

/** One scalar from the scratch install's database. */
async function scratchScalar(query: string): Promise<string> {
	const res = await runPsql(scratchConn(), ['-tAc', query]);
	expect(res.exitCode, res.stderr).toBe(0);
	return res.stdout.trim();
}

/** The hierarchy1 registry record of a tld: its active flag's dd64 section_id. */
function registryActiveSql(tld: string): string {
	return `SELECT relation->'hierarchy4'->0->>'section_id' FROM matrix_hierarchy_main
	         WHERE section_tipo = 'hierarchy1' AND lower(string->'hierarchy6'->0->>'value') = '${tld}'`;
}

/**
 * THE REASON GOES IN THE NAME (P2-19 / GATE-25).
 *
 * These two tests used to `return` when no admin connection was available —
 * the first after a console.warn, the second in silence. Bun counts a returning
 * body as a PASS, so the ENTIRE PHP-free install path reported two green ticks
 * having spawned nothing whenever the developer's role lacked CREATEDB. The
 * header above says this file "Skips loudly"; it did not.
 *
 * `test.if` reports a real SKIP, and the name carries why, so an unrunnable
 * gate is legible in the runner's own output instead of indistinguishable from
 * a verified one.
 */
const WHY_SKIPPED =
	'SKIPPED: no admin Postgres connection (DB_ADMIN_* unset, or the role lacks CREATEDB)';
const named = (what: string): string => (available ? what : `${what} — ${WHY_SKIPPED}`);

describe('TS-native install e2e (P5)', () => {
	test.if(available)(
		named('the CLI installs a fresh DB and verifies the root login'),
		async () => {
			const started = performance.now();
			const { exitCode, out } = runCli();
			console.log(`[install_e2e] CLI install took ${Math.round(performance.now() - started)} ms`);
			expect(out).toContain('root login verified');
			expect(exitCode).toBe(0);

			// The CLI ran the SHARED plan: its printed step ids are its own --plan.
			const planned = Bun.spawnSync(['bun', 'run', CLI, ...cliArgs(), '--plan'], {
				stdout: 'pipe',
				stderr: 'pipe',
			});
			expect(planned.exitCode, planned.stderr.toString()).toBe(0);
			const plan = JSON.parse(planned.stdout.toString().trim()) as {
				steps: string[];
				hierarchies: string[];
			};
			const printed = [...out.matchAll(/^→ \[([a-z_]+)\]/gm)].map((match) => match[1]);
			expect(printed.length).toBeGreaterThan(5);
			expect(printed).toEqual(plan.steps);

			// Languages: ACTIVE, and not one lg row imported into matrix_hierarchy.
			expect(await scratchScalar(registryActiveSql('lg'))).toBe('1');
			expect(
				await scratchScalar(
					"SELECT count(*) FROM matrix_hierarchy WHERE section_tipo ~ '^lg[0-9]+$'",
				),
			).toBe('0');

			// The shared default thesauri reached the CLI: registered active, terms in.
			const defaults = defaultOptionalHierarchies();
			expect(defaults.length).toBeGreaterThan(0);
			expect(plan.hierarchies).toEqual(defaults);
			for (const tld of defaults) {
				expect(await scratchScalar(registryActiveSql(tld)), `${tld} active`).toBe('1');
				// The section tipo is BUILT (`${tld}1`), never spelled: a literal would
				// feed the suite-fixture allowlist scan (scripts/lib/hierarchy_allowlist.ts).
				const terms = Number(
					await scratchScalar(
						`SELECT count(*) FROM matrix_hierarchy WHERE section_tipo = '${tld}${1}'`,
					),
				);
				expect(terms, `${tld} terms imported`).toBeGreaterThan(0);
			}

			// The written .env: the official update servers, never DEDALO_SUPERVISED.
			const env = parseEnvFile(readFileSync(join(scratchDir, '.env'), 'utf8'));
			expect(JSON.parse(env.ONTOLOGY_SERVERS as string)).toEqual([OFFICIAL_ONTOLOGY_SERVER]);
			expect(JSON.parse(env.CODE_SERVERS as string)).toEqual([OFFICIAL_CODE_SERVER]);
			expect(env.DEDALO_SUPERVISED).toBeUndefined();
		},
		600000,
	);

	test.if(available)(
		named('re-running the CLI on the now-populated DB refuses the restore'),
		() => {
			const { exitCode, out } = runCli();
			expect(exitCode).not.toBe(0);
			expect(out).toContain('not empty');
		},
		60000,
	);
});
