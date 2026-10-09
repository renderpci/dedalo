/**
 * P0 gate — install-mode boot (DEC-19 TS-native install).
 *
 * `config.ts` builds and FREEZES `config` at import time, so install mode cannot
 * be toggled in-process: each case imports config in a fresh Bun subprocess with
 * a controlled environment and reports the resolved shape as JSON.
 *
 * The four required keys are blanked to '' in the child env; `process.env` wins
 * over `../private/.env` in `readEnv`, and '' short-circuits before the PHP-alias
 * lookup, so a blanked TS key reads as unset regardless of the dev machine's real
 * `.env`. `DEDALO_TS_STATE_PATH` points at a nonexistent file so the install
 * reads as NOT sealed.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONFIG_PATH = resolve(import.meta.dir, '../../src/config/config.ts');
const NO_SEAL_STATE = '/tmp/dedalo_install_mode_boot_no_such_state.json';

/** Import config in a child process with `env` and return its outcome. */
function probeConfig(env: Record<string, string>): {
	ok: boolean;
	value: {
		installMode: boolean;
		entity: string;
		database: string;
		host: string;
		user: string;
	} | null;
	stderr: string;
} {
	const program = `import { config } from ${JSON.stringify(CONFIG_PATH)};
		console.log(JSON.stringify({
			installMode: config.installMode,
			entity: config.entity,
			database: config.db.database,
			host: config.db.host,
			user: config.db.user,
		}));`;
	const proc = Bun.spawnSync(['bun', '-e', program], {
		env: { ...process.env, ...env },
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const stdout = proc.stdout.toString().trim();
	const stderr = proc.stderr.toString();
	if (proc.exitCode !== 0) return { ok: false, value: null, stderr };
	return { ok: true, value: JSON.parse(stdout), stderr };
}

/** Blank all four required keys (fresh, unconfigured machine). */
const UNCONFIGURED = {
	ENTITY: '',
	DB_NAME: '',
	DB_HOST: '',
	DB_USER: '',
	DEDALO_TS_STATE_PATH: NO_SEAL_STATE,
};

describe('install-mode boot (P0)', () => {
	test('all four required keys unset AND not sealed → install mode, no throw, sentinels', () => {
		const result = probeConfig(UNCONFIGURED);
		expect(result.ok).toBe(true);
		expect(result.value?.installMode).toBe(true);
		// Sentinels stand in for the absent keys so the wizard can boot.
		expect(result.value?.entity).toBe('install');
		expect(result.value?.database).toBe('dedalo_install_placeholder');
		expect(result.value?.host).toBe('localhost');
		expect(result.value?.user).toBe('dedalo');
	});

	test('PARTIAL config (some required keys set, others not) → still throws (operator error)', () => {
		const result = probeConfig({ ...UNCONFIGURED, ENTITY: 'myentity' });
		expect(result.ok).toBe(false);
		// The precise missing-key error, not a silent install-mode fallback.
		expect(result.stderr).toContain("Missing required config key 'DB_NAME'");
	});

	test('a SEALED install with the four keys unset → throws (never re-enters the wizard on live data)', () => {
		const sealPath = resolve(import.meta.dir, `../../scratch_install_sealed_${process.pid}.json`);
		Bun.write(sealPath, JSON.stringify({ install_status: 'sealed' }));
		try {
			const result = probeConfig({ ...UNCONFIGURED, DEDALO_TS_STATE_PATH: sealPath });
			expect(result.ok).toBe(false);
			expect(result.stderr).toContain('Missing required config key');
		} finally {
			Bun.spawnSync(['rm', '-f', sealPath]);
		}
	});

	test("the wizard's first call (start) answers with NO database reachable", () => {
		// 2026-10-08: in a container — no Postgres on the sentinel localhost — start
		// threw "Failed to connect" while building page_globals (the projects
		// default langs read lg1 records), and the wizard's first screen was a bare
		// 500. A dev box hid it: its own Postgres answered the sentinel. Here the
		// sentinel is pointed at a port nothing listens on, so ANY database read in
		// the install branch fails the case.
		const program = `const { coreApiActions } = await import(${JSON.stringify(resolve(import.meta.dir, '../../src/core/api/handlers/dd_core_api.ts'))});
			const result = await coreApiActions.start({ action: 'start', options: {} }, { requestId: 'install-mode-boot', session: null });
			const body = result.body;
			console.log(JSON.stringify({
				status: result.status,
				model: body?.data?.context?.[0]?.model ?? null,
				langs: body?.environment?.result?.page_globals?.dedalo_projects_default_langs ?? null,
			}));
			process.exit(0);`;
		const proc = Bun.spawnSync(['bun', '-e', program], {
			env: { ...process.env, ...UNCONFIGURED, DB_PORT: '1' },
			stdout: 'pipe',
			stderr: 'pipe',
		});
		const stdout = proc.stdout.toString().trim().split('\n').at(-1) ?? '';
		expect(proc.exitCode, proc.stderr.toString().slice(-2000)).toBe(0);
		const answer = JSON.parse(stdout) as { status: number; model: string | null; langs: unknown };
		expect(answer.status).toBe(200);
		expect(answer.model).toBe('installer');
		// Named from the installer's own catalog (install mode derives lg-eng).
		expect(answer.langs).toEqual([{ label: 'English', value: 'lg-eng', tld2: 'en' }]);
	});

	test('fully configured (real ../private/.env, no overrides) → NOT install mode', () => {
		// No env blanking: the dev machine's real .env satisfies all four keys.
		const result = probeConfig({ DEDALO_TS_STATE_PATH: NO_SEAL_STATE });
		expect(result.ok).toBe(true);
		expect(result.value?.installMode).toBe(false);
	});
});

describe('mid-wizard boot never writes the not-yet-seeded database (2026-10-08)', () => {
	// After *Save config* the server restarts out of install mode into a database
	// that is still EMPTY. Boot migrations and the search-store DDL then created
	// the seed's own objects and the seed restore failed ("function f_unaccent
	// already exists") — every browser-wizard install broke. Booting a real server
	// against an empty and a seeded database is the install e2e's job; this
	// ratchet holds the two facts that make the fix: every DB boot block keys on
	// the mid-wizard predicate, and the SEAL restarts the process so the sealed
	// instance gets the boot it skipped.
	const SERVER = readFileSync(resolve(import.meta.dir, '../../src/server.ts'), 'utf8');
	const ENGINE = readFileSync(resolve(import.meta.dir, '../../src/core/install/engine.ts'), 'utf8');

	test('server.ts gates DB boot work on install mode AND the mid-wizard state', () => {
		expect(SERVER).toMatch(/const databaseBoot = !config\.installMode && !installInProgress\(\);/);
		const gated = SERVER.match(/if \(databaseBoot && !smokeBoot\)/g) ?? [];
		expect(
			gated.length,
			'anti-vacuity: the DB boot blocks (migrations, boot block, online migrations, update confirm)',
		).toBeGreaterThanOrEqual(4);
		expect(
			SERVER.includes('if (!config.installMode && !smokeBoot)'),
			'a boot block keys on install mode ALONE — mid-wizard it runs against the empty, not-yet-seeded database',
		).toBe(false);
	});

	test('install_finish schedules the restart into the sealed instance', () => {
		// engine.ts dispatches through the STEP_HANDLERS map (2026-10-08): the
		// install_finish handler is a map entry, closed by `\n\t},`.
		const at = ENGINE.indexOf('\tinstall_finish: async');
		expect(at, "engine.ts: no 'install_finish' step handler").toBeGreaterThanOrEqual(0);
		const finish = ENGINE.slice(at);
		const block = finish.slice(0, finish.indexOf('\n\t},'));
		expect(block).toContain('await installFinish()');
		expect(block).toContain("scheduleServerRestart('install sealed')");
		expect(block.indexOf('await installFinish()')).toBeLessThan(
			block.indexOf('scheduleServerRestart('),
		);
	});
});
