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
		const result = probeConfig({ ...UNCONFIGURED, ENTITY: 'mib' });
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

	test('fully configured (real ../private/.env, no overrides) → NOT install mode', () => {
		// No env blanking: the dev machine's real .env satisfies all four keys.
		const result = probeConfig({ DEDALO_TS_STATE_PATH: NO_SEAL_STATE });
		expect(result.ok).toBe(true);
		expect(result.value?.installMode).toBe(false);
	});
});
