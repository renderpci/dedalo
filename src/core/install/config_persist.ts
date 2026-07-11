/**
 * persist_config + verify_active_config (PHP installer_setup_manager /
 * installer_config_persistor). Writes ../private/.env with PHP key names (the
 * env.ts PHP_KEY_ALIASES resolve them, and project convention is to write the
 * PHP names) via an atomic two-phase commit, records the install state, and
 * generates the secrets. verify_active_config confirms the RESTARTED process
 * came up with the new config.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../../config/config.ts';
import { parseEnvFile } from '../../config/env.ts';
import { setServerState } from '../resolve/server_state.ts';
import { deriveLangConfig } from './lang_catalog.ts';
import { installPrivateDir } from './paths.ts';
import { connFromConfig, psqlSelect1 } from './pg_exec.ts';
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

/** Quote a value for the .env file when it needs it (spaces/quotes/empty). */
function envQuote(value: string): string {
	if (value === '') return '""';
	if (/[\s"'#=]/.test(value)) return `"${value.replace(/"/g, '\\"')}"`;
	return value;
}

export interface PersistConfigResult {
	result: boolean;
	msg: string;
	generated: Record<string, string>;
}

/** Write ../private/.env + state from the posted wizard config. */
export async function persistConfig(o: Record<string, unknown>): Promise<PersistConfigResult> {
	const str = (key: string, dflt = ''): string => {
		const value = o[key];
		return value === undefined || value === null ? dflt : String(value);
	};
	const diffusion = o.diffusion === true;
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
		return {
			result: false,
			msg: `Language selection invalid: ${langs.errors.join('; ')}`,
			generated: {},
		};
	}

	// Secrets: preserve an existing value, else generate (and surface once).
	const salt = prior.DEDALO_SALT_STRING ?? generateSecret();
	if (prior.DEDALO_SALT_STRING === undefined) generated.DEDALO_SALT_STRING = salt;
	let diffusionToken = prior.DEDALO_DIFFUSION_INTERNAL_TOKEN;
	if (diffusion && diffusionToken === undefined) {
		diffusionToken = generateSecret();
		generated.DEDALO_DIFFUSION_INTERNAL_TOKEN = diffusionToken;
	}

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
			`DEDALO_DIFFUSION_INTERNAL_TOKEN=${envQuote(diffusionToken ?? '')}`,
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
		return {
			result: false,
			msg: `Failed to write ../private/.env: ${(error as Error).message}`,
			generated: {},
		};
	}

	setServerState({
		install_status: 'configured',
		information: str('information') || undefined,
		info_key: str('info_key') || undefined,
	});

	return { result: true, msg: 'Configuration saved. The server will restart.', generated };
}

export interface VerifyActiveConfigResult {
	result: boolean;
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
			result: false,
			active: false,
			msg: 'Server restart pending — click Verify again in a moment',
		};
	}
	const entity = String(o.entity ?? '');
	const dbName = String(o.db_database ?? '');
	if (entity !== '' && config.entity !== entity) {
		return { result: false, active: false, msg: 'Active entity does not match the saved config' };
	}
	if (dbName !== '' && config.db.database !== dbName) {
		return { result: false, active: false, msg: 'Active database does not match the saved config' };
	}
	const live = await psqlSelect1(connFromConfig());
	if (live.exitCode !== 0) {
		return { result: false, active: false, msg: `Configured but DB unreachable: ${live.stderr}` };
	}
	return { result: true, active: true, msg: 'Active configuration verified' };
}
