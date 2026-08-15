/**
 * set_root_pw (PHP installer_config_manager::set_root_pw, TS-native). Stores the
 * root user's password as an Argon2id hash (Bun.password.hash) directly on
 * matrix_users section_id -1, component dd133 — the same JSONB shape auth.ts
 * reads (`string.dd133[0].value`, must start with `$argon2`). Written by direct
 * UPDATE because the normal save path refuses section_id < 1.
 *
 * NOTE the deliberate divergence from PHP: PHP stores a REVERSIBLE openssl blob;
 * the TS server verifies Argon2id and rejects legacy hashes, so a TS-installed
 * DB is TS-login-only until PHP (if ever) is reconfigured (ledgered, DEC-19).
 *
 * Gate: not sealed (the dispatch surface guarantees this pre-seal) and the root
 * password is still empty (fresh seed) — never silently overwrite a real one.
 */

import { connFromConfig, type DbConnDescriptor, runPsql } from './pg_exec.ts';
import { refuseInstall } from './refuse.ts';

/** The step's answer on the ONLY path that returns: success (every refusal throws). */
export interface SetRootPwResult {
	ok: true;
	msg: string;
}

const ROOT_SECTION_ID = -1;
const USERS_SECTION_TIPO = 'dd128';
const PASSWORD_COMPONENT = 'dd133';

/** Set the root password. `conn` defaults to config.db (browser post-restart). */
/*
 * COVERAGE-EXEMPT (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): a ONE-SHOT install procedure that
 * MUTATES THE MACHINE — config files, a database restore, root credentials, a
 * 126 MB hierarchy import, or a process restart. Blocked by DANGER, not by
 * fixture: the hermetic logic in the same subsystem (deriveLangConfig,
 * installIpAllowed, resolvePgBinary, the hierarchy_meta readers) IS gated
 * (test/unit/tier1_install_native.test.ts).
 */
export async function setRootPassword(
	password: string,
	conn?: DbConnDescriptor,
): Promise<SetRootPwResult> {
	if (password.length < 8) {
		refuseInstall('install.invalid_input', 'Password must be at least 8 characters');
	}
	const connection = conn ?? connFromConfig();

	// Gate: the root user must exist and still have an empty password.
	const probe = await runPsql(connection, [
		'-tAc',
		`SELECT coalesce(jsonb_array_length(string->'${PASSWORD_COMPONENT}'), 0) FROM matrix_users WHERE section_id = ${ROOT_SECTION_ID} AND section_tipo = '${USERS_SECTION_TIPO}'`,
	]);
	if (probe.exitCode !== 0) {
		refuseInstall('install.step_failed', `Cannot read root user: ${probe.stderr}`);
	}
	if (probe.stdout.trim() === '') {
		refuseInstall(
			'install.state_conflict',
			'Root user not found — run the database install step first',
		);
	}
	if (Number(probe.stdout.trim()) > 0) {
		refuseInstall('install.state_conflict', 'Root password is already set');
	}

	// Argon2id hash. The hash charset ($argon2id$v=...$<b64>$<b64>) contains no
	// single quotes or backslashes, so embedding it in a single-quoted SQL literal
	// is injection-safe; the SQL is piped via stdin (never on argv).
	const hash = await Bun.password.hash(password, { algorithm: 'argon2id' });
	if (/['\\]/.test(hash)) {
		refuseInstall('install.step_failed', 'Unexpected hash format — aborting for safety');
	}
	const updateSql = `UPDATE matrix_users
		SET string = jsonb_set(
			coalesce(string, '{}'::jsonb),
			'{${PASSWORD_COMPONENT}}',
			jsonb_build_array(jsonb_build_object('id', 1, 'value', '${hash}', 'lang', 'lg-nolan'))
		)
		WHERE section_id = ${ROOT_SECTION_ID} AND section_tipo = '${USERS_SECTION_TIPO}';`;
	const applied = await runPsql(connection, ['-v', 'ON_ERROR_STOP=1', '--quiet'], {
		stdin: updateSql,
	});
	if (applied.exitCode !== 0) {
		refuseInstall('install.step_failed', `Failed to set password: ${applied.stderr}`);
	}
	return { ok: true, msg: 'Root password set — OK' };
}
