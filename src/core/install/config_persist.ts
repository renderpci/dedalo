/**
 * persist_config + verify_active_config (PHP installer_setup_manager /
 * installer_config_persistor). Writes ../private/.env with PHP key names (the
 * env.ts PHP_KEY_ALIASES resolve them, and project convention is to write the
 * PHP names) via an atomic two-phase commit, records the install state, and
 * generates the secrets. verify_active_config confirms the RESTARTED process
 * came up with the new config.
 */

import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { config } from '../../config/config.ts';
import { parseEnvFile } from '../../config/env.ts';
import { DedaloError } from '../errors/index.ts';
import { setServerState } from '../resolve/server_state.ts';
import { deriveLangConfig } from './lang_catalog.ts';
import { installPrivateDir, SAMPLE_ENV_PATH } from './paths.ts';
import { connFromConfig, psqlSelect1 } from './pg_exec.ts';
import { refuseInstall } from './refuse.ts';
import { generateSecret } from './secret.ts';

/** Existing .env values (for preserve-or-generate on secrets); {} when absent. */
function existingEnv(): Record<string, string> {
	const path = join(installPrivateDir(), '.env');
	if (!existsSync(path)) return {};
	try {
		return parseEnvFile(readFileSync(path, 'utf8'));
	} catch {
		return {};
	}
}

/**
 * The existing .env's assignment lines, VERBATIM and in file order.
 *
 * Kept raw (not re-quoted from the parsed value) so a preserved key round-trips
 * byte-for-byte: parseEnvFile strips surrounding quotes without unescaping inner
 * ones, so re-emitting a parsed value through envQuote could corrupt it — the
 * same trap the JSON lang keys below already document.
 */
function existingEnvAssignments(): { key: string; line: string }[] {
	const path = join(installPrivateDir(), '.env');
	if (!existsSync(path)) return [];
	try {
		const assignments: { key: string; line: string }[] = [];
		for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
			const line = rawLine.trim();
			if (line.length === 0 || line.startsWith('#')) continue;
			const eq = line.indexOf('=');
			if (eq <= 0) continue;
			assignments.push({ key: line.slice(0, eq), line });
		}
		return assignments;
	} catch {
		return [];
	}
}

/** The keys an emitted body assigns — i.e. the ones this run OWNS. */
function assignedKeys(lines: readonly string[]): Set<string> {
	const keys = new Set<string>();
	for (const line of lines) {
		const eq = line.indexOf('=');
		if (eq > 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(line.slice(0, eq))) {
			keys.add(line.slice(0, eq));
		}
	}
	return keys;
}

/**
 * Quote a value for the .env file when it needs it (spaces/quotes/empty).
 *
 * A `.env` is LINE-BASED, so a CR/LF inside a value cannot be represented —
 * quoting does not help, the parser still splits on the newline and reads the
 * tail as a SEPARATE `KEY=value` line. That is arbitrary-key injection
 * (OPS-02, 2026-07-28 audit): a posted wizard field carrying
 * `foo\nDEDALO_BINARY_BASE=/tmp/evil` would inject a spawned-binary redirect.
 * No legitimate wizard value contains a newline or NUL, so REFUSE it (fail
 * loud) rather than emit a corrupt/injected file.
 */
export function envQuote(value: string): string {
	if (/[\r\n\0]/.test(value)) {
		throw new DedaloError('install.invalid_input', {
			message: 'install: configuration value contains an illegal control character',
			publicMessage: 'A submitted configuration value contains an illegal control character',
		});
	}
	if (value === '') return '""';
	if (/[\s"'#=]/.test(value)) return `"${value.replace(/"/g, '\\"')}"`;
	return value;
}

/** The step's answer on the ONLY path that returns: written (every refusal throws). */
export interface PersistConfigResult {
	ok: true;
	msg: string;
	generated: Record<string, string>;
}

/** Write ../private/.env + state from the posted wizard config. */
/*
 * COVERAGE-EXEMPT (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): a ONE-SHOT install procedure that
 * MUTATES THE MACHINE — config files, a database restore, root credentials, a
 * 126 MB hierarchy import, or a process restart. Blocked by DANGER, not by
 * fixture: the hermetic logic in the same subsystem (deriveLangConfig,
 * installIpAllowed, resolvePgBinary, the hierarchy_meta readers) IS gated
 * (test/unit/tier1_install_native.test.ts).
 */
export async function persistConfig(o: Record<string, unknown>): Promise<PersistConfigResult> {
	const str = (key: string, dflt = ''): string => {
		const value = o[key];
		return value === undefined || value === null ? dflt : String(value);
	};
	const diffusion = o.diffusion === true;
	const mailer = o.mailer === true;
	const prior = existingEnv();
	const generated: Record<string, string> = {};

	// LANGUAGES (mandatory once configured — config.ts requires these four keys
	// whenever INSTALL_MODE is false, so a fresh install MUST write them or the
	// post-restart boot crash-loops). The picked set drives both the map and the
	// code list; refuse (no .env write, no restart) on an unusable set so the
	// wizard surfaces it instead of writing a crashing config.
	const langs = deriveLangConfig({
		langs: (o.langs as string[] | string | undefined) ?? undefined,
		appLangDefault: o.app_lang_default === undefined ? undefined : String(o.app_lang_default),
		dataLangDefault: o.data_lang_default === undefined ? undefined : String(o.data_lang_default),
	});
	if (langs.errors.length > 0) {
		refuseInstall(
			'install.invalid_input',
			`Language selection invalid: ${langs.errors.join('; ')}`,
		);
	}

	// Secrets: preserve an existing value, else generate (and surface once).
	const salt = prior.DEDALO_SALT_STRING ?? generateSecret();
	if (prior.DEDALO_SALT_STRING === undefined) generated.DEDALO_SALT_STRING = salt;
	// OPS-04 (2026-07-28 audit): DEDALO_DIFFUSION_INTERNAL_TOKEN is NO LONGER
	// minted. The TS engine removed the diffusion socket + internal-token control
	// plane (see diffusion_bridge/diffusion_delete.ts) — the whole diffusion API
	// runs behind the normal dispatch gates now — so writing a fresh secret here
	// only left a weak, never-verified token sitting in every install's .env.

	// Build the .env body with PHP key names (the aliases env.ts already resolves).
	const lines: string[] = [
		'# Dédalo TS server configuration — written by the install wizard (DEC-19).',
		'# PHP key names are used so an operator migrating from PHP can read them.',
		'',
		'# --- Database (PostgreSQL) ---',
		`DEDALO_DATABASE_CONN=${envQuote(str('db_database'))}`,
		`DEDALO_USERNAME_CONN=${envQuote(str('db_username'))}`,
		`DEDALO_PASSWORD_CONN=${envQuote(str('db_password'))}`,
		`DEDALO_HOSTNAME_CONN=${envQuote(str('db_hostname', 'localhost'))}`,
		`DEDALO_DB_PORT_CONN=${envQuote(str('db_port', '5432'))}`,
		`DEDALO_SOCKET_CONN=${envQuote(str('db_socket'))}`,
		'',
		'# --- Entity / locale ---',
		`DEDALO_ENTITY=${envQuote(str('entity'))}`,
		`DEDALO_ENTITY_LABEL=${envQuote(str('entity_label', str('entity')))}`,
		`DEDALO_TIMEZONE=${envQuote(str('timezone', 'Europe/Madrid'))}`,
		`DEDALO_LOCALE=${envQuote(str('locale', 'es-ES'))}`,
		'',
		'# --- Languages (mandatory: config.ts refuses boot without them) ---',
		// The map/array keys are written as RAW compact JSON (NOT via envQuote):
		// parseEnvFile strips surrounding quotes but does not unescape inner \",
		// so an envQuote'd JSON value would not round-trip through JSON.parse.
		`DEDALO_APPLICATION_LANGS=${JSON.stringify(langs.applicationLangs)}`,
		`DEDALO_PROJECTS_DEFAULT_LANGS=${JSON.stringify(langs.projectsDefaultLangs)}`,
		`DEDALO_APPLICATION_LANGS_DEFAULT=${envQuote(langs.applicationLangsDefault)}`,
		`DEDALO_DATA_LANG_DEFAULT=${envQuote(langs.dataLangDefault)}`,
		`DEDALO_APPLICATION_LANG=${envQuote(langs.applicationLangsDefault)}`,
		`DEDALO_DATA_LANG=${envQuote(langs.dataLangDefault)}`,
		`DEDALO_STRUCTURE_LANG=${envQuote(langs.structureLang)}`,
		'',
		'# --- Secret (coexistence: written for PHP; TS auth uses Argon2id) ---',
		`DEDALO_SALT_STRING=${envQuote(salt)}`,
	];

	// Serving / media (CLI --media-path / --socket / --media-access-mode; the
	// browser wizard omits them). Written ONLY when provided, so a re-save that
	// does not carry them PRESERVES a prior value instead of clobbering it — same
	// never-delete-by-omission contract enforced below. SERVER_UNIX_SOCKET is the
	// load-bearing one: its default (/tmp/dedalo_ts.sock) mismatches the
	// /run/dedalo/ path a systemd+reverse-proxy deploy uses.
	const mediaPath = str('media_path');
	const unixSocket = str('unix_socket');
	const mediaAccessMode = str('media_access_mode');
	if (mediaPath !== '' || unixSocket !== '' || mediaAccessMode !== '') {
		lines.push('', '# --- Serving / media ---');
		if (mediaPath !== '') lines.push(`MEDIA_PATH=${envQuote(mediaPath)}`);
		if (unixSocket !== '') lines.push(`SERVER_UNIX_SOCKET=${envQuote(unixSocket)}`);
		if (mediaAccessMode !== '') lines.push(`DEDALO_MEDIA_ACCESS_MODE=${envQuote(mediaAccessMode)}`);
	}

	if (diffusion) {
		lines.push(
			'',
			'# --- Diffusion (native TS engine, MariaDB target) ---',
			'DEDALO_DIFFUSION_NATIVE=true',
			`DEDALO_DIFFUSION_DB_HOST=${envQuote(str('mysql_hostname', 'localhost'))}`,
			`DEDALO_DIFFUSION_DB_PORT=${envQuote(str('mysql_port', '3306'))}`,
			`DEDALO_DIFFUSION_DB_SOCKET=${envQuote(str('mysql_socket'))}`,
			`DEDALO_DIFFUSION_DB_USER=${envQuote(str('mysql_username'))}`,
			`DEDALO_DIFFUSION_DB_PASSWORD=${envQuote(str('mysql_password'))}`,
			`DEDALO_DIFFUSION_DB_NAME=${envQuote(str('mysql_database'))}`,
		);
	}
	if (mailer) {
		lines.push(
			'',
			'# --- Outbound email (SMTP relay — password recovery) ---',
			`DEDALO_SMTP_HOST=${envQuote(str('smtp_host'))}`,
			`DEDALO_SMTP_PORT=${envQuote(str('smtp_port', '587'))}`,
			`DEDALO_SMTP_SECURE=${envQuote(str('smtp_secure', 'tls'))}`,
			`DEDALO_SMTP_USER=${envQuote(str('smtp_user'))}`,
			`DEDALO_SMTP_PASS=${envQuote(str('smtp_pass'))}`,
			`DEDALO_SMTP_FROM=${envQuote(str('smtp_from'))}`,
			`DEDALO_SMTP_FROM_NAME=${envQuote(str('smtp_from_name'))}`,
		);
	}
	// NEVER DELETE BY OMISSION. This writer rebuilds .env from the posted form, so
	// every key the form does not carry used to vanish on save — and the wizard
	// INVITES a re-save (reload the page and it walks the config steps again from
	// an empty cfg). Observed twice on 2026-07-12: re-saving with the optional
	// Diffusion step untouched silently deleted all 8 DEDALO_DIFFUSION_* keys,
	// including the generated DEDALO_DIFFUSION_INTERNAL_TOKEN — a secret shown
	// once and then unrecoverable. Operator-appended keys (../private/.env is
	// append-only by project rule: MEDIA_DEV_ROUTE_ENABLED, DEDALO_SESSION_DB_PATH,
	// DB_POOL_MAX, …) died the same way.
	//
	// So: this run OWNS the keys it assigns; every other key already in the file is
	// carried over verbatim. Turning Diffusion OFF therefore no longer erases its
	// credentials — disabling it is an explicit .env edit (DEDALO_DIFFUSION_NATIVE),
	// never a side effect of not re-typing the form. Gate:
	// test/unit/install_persist_config.test.ts ('never deletes a key by omission').
	const owned = assignedKeys(lines);
	const preserved = existingEnvAssignments().filter((entry) => !owned.has(entry.key));
	if (preserved.length > 0) {
		lines.push(
			'',
			'# --- Preserved from the previous .env (not managed by the wizard form) ---',
			...preserved.map((entry) => entry.line),
		);
	}

	const body = `${lines.join('\n')}\n`;

	// Atomic two-phase commit: private dir 0700, stage .tmp (0600), back up an
	// existing .env, rename into place.
	try {
		const dir = installPrivateDir();
		mkdirSync(dir, { recursive: true, mode: 0o700 });
		const target = join(dir, '.env');
		const tmp = join(dir, `.env.tmp.${process.pid}`);
		writeFileSync(tmp, body, { mode: 0o600 });
		chmodSync(tmp, 0o600);
		if (existsSync(target)) {
			const backup = join(dir, `.env.bak.${Date.now()}`);
			renameSync(target, backup);
		}
		renameSync(tmp, target);
	} catch (error) {
		refuseInstall(
			'install.step_failed',
			`Failed to write ../private/.env: ${(error as Error).message}`,
			error,
		);
	}

	// Drop the key census next to the .env the operator just wrote. Before this, every
	// "see ../private/sample.env" in the docs and in four runtime error messages pointed
	// at a file that DID NOT EXIST — the renderer was PHP machinery that was never ported.
	//
	// Four deliberate properties:
	//   0644, not 0600  — it is a documented template with no secrets in it (only
	//                     placeholders). The private dir is 0700, so it is still not
	//                     world-reachable.
	//   copy, not render — the artifact is generated at commit time and gated byte-for-byte
	//                     by config_docs_tripwire. Rendering here would drag the catalog
	//                     into the install path and give a render bug a way to touch an
	//                     install.
	//   tmp + rename    — same atomicity as the .env: a half-written census is impossible.
	//   FAIL-SOFT       — a missing or unreadable template must NEVER block an install.
	//                     This is the one place we deliberately swallow an error, so it is
	//                     stated rather than left as a bare catch.
	try {
		const dir = installPrivateDir();
		const target = join(dir, 'sample.env');
		const tmp = join(dir, `sample.env.tmp.${process.pid}`);
		copyFileSync(SAMPLE_ENV_PATH, tmp);
		chmodSync(tmp, 0o644);
		renameSync(tmp, target);
	} catch (error) {
		console.warn(`[install] sample.env census not written: ${(error as Error).message}`);
	}

	setServerState({
		install_status: 'configured',
		information: str('information') || undefined,
		info_key: str('info_key') || undefined,
	});

	return { ok: true, msg: 'Configuration saved. The server will restart.', generated };
}

/**
 * A POLL ANSWER (see db_probe_plan.ts DbProbeResult): "the restart has not
 * happened yet" is the answer to the question the wizard asked, not a refusal —
 * the Verify button stays for a re-check.
 */
export interface VerifyActiveConfigResult {
	ok: boolean;
	active: boolean;
	msg: string;
}

/**
 * Confirm the RESTARTED process is running the new config: not in install mode,
 * entity/database match the posted values, and the DB answers. If it still hits
 * the old (install-mode) process, report active:false so the wizard re-checks.
 */
export async function verifyActiveConfig(
	o: Record<string, unknown>,
): Promise<VerifyActiveConfigResult> {
	if (config.installMode) {
		return {
			ok: false,
			active: false,
			msg: 'Server restart pending — click Verify again in a moment',
		};
	}
	const entity = String(o.entity ?? '');
	const dbName = String(o.db_database ?? '');
	if (entity !== '' && config.entity !== entity) {
		return { ok: false, active: false, msg: 'Active entity does not match the saved config' };
	}
	if (dbName !== '' && config.db.database !== dbName) {
		return { ok: false, active: false, msg: 'Active database does not match the saved config' };
	}
	const live = await psqlSelect1(connFromConfig());
	if (live.exitCode !== 0) {
		return { ok: false, active: false, msg: `Configured but DB unreachable: ${live.stderr}` };
	}
	return { ok: true, active: true, msg: 'Active configuration verified' };
}
