/**
 * P2 gate — persist_config + check_directories (DEC-19).
 *
 * DEDALO_INSTALL_PRIVATE_DIR redirects the installer's writes to a scratch dir
 * so the live ../private/.env is never touched. Asserts: the .env carries PHP
 * key names, is chmod 600, backs up an existing file on overwrite, `generated`
 * carries only NEW secrets, and the state flips to 'configured'.
 */

import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnvFile } from '../../src/config/env.ts';
import { persistConfig } from '../../src/core/install/config_persist.ts';
import { checkDirectories } from '../../src/core/install/directories.ts';
import { getServerState, setServerState } from '../../src/core/resolve/server_state.ts';

const scratch = mkdtempSync(join(tmpdir(), 'dedalo_install_p2_'));

beforeEach(() => {
	process.env.DEDALO_INSTALL_PRIVATE_DIR = scratch;
});
afterEach(() => {
	process.env.DEDALO_INSTALL_PRIVATE_DIR = undefined;
	setServerState({ install_status: undefined, information: undefined, info_key: undefined });
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const BASE_CFG = {
	db_hostname: 'localhost',
	db_port: '5432',
	db_database: 'dedalo_test_db',
	db_username: 'tester',
	db_password: 'secret pass',
	entity: 'testent',
	entity_label: 'Test Entity',
	information: 'fingerprint',
	info_key: 'k123',
	timezone: 'Europe/Madrid',
	locale: 'es-ES',
};

describe('persist_config (P2)', () => {
	test('writes .env with PHP key names, 0600, and generates the salt', async () => {
		const result = await persistConfig({ ...BASE_CFG });
		expect(result.result).toBe(true);
		expect(result.generated.DEDALO_SALT_STRING).toMatch(/^[0-9a-f]{64}$/);

		const envPath = join(scratch, '.env');
		const parsed = parseEnvFile(readFileSync(envPath, 'utf8'));
		expect(parsed.DEDALO_DATABASE_CONN).toBe('dedalo_test_db');
		expect(parsed.DEDALO_USERNAME_CONN).toBe('tester');
		expect(parsed.DEDALO_PASSWORD_CONN).toBe('secret pass');
		expect(parsed.DEDALO_ENTITY).toBe('testent');
		expect(parsed.DEDALO_ENTITY_LABEL).toBe('Test Entity');
		expect(parsed.DEDALO_SALT_STRING).toBe(result.generated.DEDALO_SALT_STRING);

		// 0600 perms (owner-only).
		expect(statSync(envPath).mode & 0o777).toBe(0o600);

		// State moved to 'configured' with the fingerprints.
		const state = getServerState();
		expect(state.install_status).toBe('configured');
		expect(state.information).toBe('fingerprint');
		expect(state.info_key).toBe('k123');
	});

	test('an existing .env is backed up, and an existing salt is PRESERVED (not regenerated)', async () => {
		const envPath = join(scratch, '.env');
		writeFileSync(envPath, 'DEDALO_SALT_STRING=deadbeef\nOLD=1\n');
		const result = await persistConfig({ ...BASE_CFG });
		expect(result.result).toBe(true);
		// Salt preserved → NOT in `generated`.
		expect(result.generated.DEDALO_SALT_STRING).toBeUndefined();
		const parsed = parseEnvFile(readFileSync(envPath, 'utf8'));
		expect(parsed.DEDALO_SALT_STRING).toBe('deadbeef');
		// A timestamped backup of the prior file exists.
		const { readdirSync } = await import('node:fs');
		expect(readdirSync(scratch).some((n) => n.startsWith('.env.bak.'))).toBe(true);
	});

	test('diffusion enabled → diffusion keys + internal token written', async () => {
		const result = await persistConfig({
			...BASE_CFG,
			diffusion: true,
			mysql_hostname: 'localhost',
			mysql_port: '3306',
			mysql_database: 'web_dedalo',
			mysql_username: 'diff',
			mysql_password: 'dpw',
		});
		expect(result.result).toBe(true);
		expect(result.generated.DEDALO_DIFFUSION_INTERNAL_TOKEN).toMatch(/^[0-9a-f]{64}$/);
		const parsed = parseEnvFile(readFileSync(join(scratch, '.env'), 'utf8'));
		expect(parsed.DEDALO_DIFFUSION_NATIVE).toBe('true');
		expect(parsed.DEDALO_DIFFUSION_DB_USER).toBe('diff');
		expect(parsed.DEDALO_DIFFUSION_DB_NAME).toBe('web_dedalo');
	});

	test('mailer enabled → the DEDALO_SMTP_* keys are written from the posted form', async () => {
		const result = await persistConfig({
			...BASE_CFG,
			mailer: true,
			smtp_host: 'smtp.example.org',
			smtp_port: '465',
			smtp_secure: 'ssl',
			smtp_user: 'dedalo@example.org',
			smtp_pass: 'mail pw',
			smtp_from: 'noreply@example.org',
			smtp_from_name: 'Dédalo',
		});
		expect(result.result).toBe(true);
		const parsed = parseEnvFile(readFileSync(join(scratch, '.env'), 'utf8'));
		expect(parsed.DEDALO_SMTP_HOST).toBe('smtp.example.org');
		expect(parsed.DEDALO_SMTP_PORT).toBe('465');
		expect(parsed.DEDALO_SMTP_SECURE).toBe('ssl');
		expect(parsed.DEDALO_SMTP_USER).toBe('dedalo@example.org');
		expect(parsed.DEDALO_SMTP_PASS).toBe('mail pw');
		expect(parsed.DEDALO_SMTP_FROM).toBe('noreply@example.org');
		expect(parsed.DEDALO_SMTP_FROM_NAME).toBe('Dédalo');
	});

	test('mailer disabled/absent → no SMTP keys written', async () => {
		// Own scratch: the shared one may already carry SMTP keys from the enabled
		// test, and the never-delete invariant would (correctly) preserve them.
		const scratch2 = mkdtempSync(join(tmpdir(), 'dedalo_install_p2_mailoff_'));
		process.env.DEDALO_INSTALL_PRIVATE_DIR = scratch2;
		try {
			const result = await persistConfig({ ...BASE_CFG, smtp_host: 'smtp.example.org' });
			expect(result.result).toBe(true);
			const parsed = parseEnvFile(readFileSync(join(scratch2, '.env'), 'utf8'));
			// The smtp_* form fields are ignored without the explicit mailer:true flag.
			expect(parsed.DEDALO_SMTP_HOST).toBeUndefined();
			expect(parsed.DEDALO_SMTP_PORT).toBeUndefined();
		} finally {
			process.env.DEDALO_INSTALL_PRIVATE_DIR = scratch;
			rmSync(scratch2, { recursive: true, force: true });
		}
	});

	test('previously-written SMTP keys survive a mailer-less re-save (never-delete)', async () => {
		const envPath = join(scratch, '.env');
		writeFileSync(
			envPath,
			[
				'DEDALO_SALT_STRING=deadbeef',
				'DEDALO_SMTP_HOST=smtp.old.org',
				'DEDALO_SMTP_USER=old',
				'',
			].join('\n'),
		);
		const result = await persistConfig({ ...BASE_CFG });
		expect(result.result).toBe(true);
		const parsed = parseEnvFile(readFileSync(envPath, 'utf8'));
		expect(parsed.DEDALO_SMTP_HOST).toBe('smtp.old.org');
		expect(parsed.DEDALO_SMTP_USER).toBe('old');
	});

	/**
	 * The 2026-07-12 data loss, mechanically. The wizard invites a re-save (a page
	 * reload walks the config steps again from an EMPTY cfg), and persist_config
	 * rebuilds .env from the posted form — so on the second save every key the form
	 * did not carry was DELETED. It ate all 8 DEDALO_DIFFUSION_* keys twice, taking
	 * the generated DEDALO_DIFFUSION_INTERNAL_TOKEN (shown once, then unrecoverable)
	 * with them, plus operator-appended keys, which is what ../private/.env is FOR
	 * (append-only, documented keys).
	 *
	 * Omission is not consent: a key the form does not manage must survive verbatim.
	 */
	test('never deletes a key by omission — unmanaged keys survive a re-save verbatim', async () => {
		const envPath = join(scratch, '.env');
		// A configured install: diffusion set up, plus keys only an operator writes.
		writeFileSync(
			envPath,
			[
				'DEDALO_SALT_STRING=deadbeef',
				'DEDALO_DIFFUSION_NATIVE=true',
				'DEDALO_DIFFUSION_DB_USER=diffuser',
				'DEDALO_DIFFUSION_DB_NAME=web_default',
				'DEDALO_DIFFUSION_INTERNAL_TOKEN=tok_shown_once',
				'MEDIA_DEV_ROUTE_ENABLED=true',
				'DB_POOL_MAX=17',
				'',
			].join('\n'),
		);

		// Re-save from a FRESH wizard page: no diffusion fields, no operator keys.
		const result = await persistConfig({ ...BASE_CFG });
		expect(result.result).toBe(true);

		const parsed = parseEnvFile(readFileSync(envPath, 'utf8'));

		// The diffusion block survives — token included. This is the bug that bit.
		expect(parsed.DEDALO_DIFFUSION_NATIVE).toBe('true');
		expect(parsed.DEDALO_DIFFUSION_DB_USER).toBe('diffuser');
		expect(parsed.DEDALO_DIFFUSION_DB_NAME).toBe('web_default');
		expect(parsed.DEDALO_DIFFUSION_INTERNAL_TOKEN).toBe('tok_shown_once');

		// Operator-appended keys survive too.
		expect(parsed.MEDIA_DEV_ROUTE_ENABLED).toBe('true');
		expect(parsed.DB_POOL_MAX).toBe('17');

		// ...while the keys the form DOES own are still updated from the form,
		// exactly once (a preserved copy must not shadow the new value).
		expect(parsed.DEDALO_ENTITY).toBe('testent');
		expect(parsed.DEDALO_DATABASE_CONN).toBe('dedalo_test_db');
		expect(parsed.DEDALO_SALT_STRING).toBe('deadbeef'); // preserved, not regenerated
		const body = readFileSync(envPath, 'utf8');
		for (const key of ['DEDALO_ENTITY', 'DEDALO_SALT_STRING', 'DEDALO_DIFFUSION_DB_USER']) {
			const assignments = body
				.split('\n')
				.filter((line) => line.trim().startsWith(`${key}=`)).length;
			expect(assignments, `${key} must be assigned exactly once`).toBe(1);
		}
	});

	test('serving keys written when provided (--media-path / --socket / --media-access-mode)', async () => {
		const scratch2 = mkdtempSync(join(tmpdir(), 'dedalo_install_p2_serving_'));
		process.env.DEDALO_INSTALL_PRIVATE_DIR = scratch2;
		try {
			const result = await persistConfig({
				...BASE_CFG,
				media_path: '/srv/dedalo/media',
				unix_socket: '/run/dedalo/dedalo_ts.sock',
				media_access_mode: 'publication',
			});
			expect(result.result).toBe(true);
			const parsed = parseEnvFile(readFileSync(join(scratch2, '.env'), 'utf8'));
			expect(parsed.MEDIA_PATH).toBe('/srv/dedalo/media');
			expect(parsed.SERVER_UNIX_SOCKET).toBe('/run/dedalo/dedalo_ts.sock');
			expect(parsed.DEDALO_MEDIA_ACCESS_MODE).toBe('publication');
		} finally {
			process.env.DEDALO_INSTALL_PRIVATE_DIR = scratch;
			rmSync(scratch2, { recursive: true, force: true });
		}
	});

	test('serving keys omitted → not written, and a prior value is preserved (never-delete)', async () => {
		const scratch2 = mkdtempSync(join(tmpdir(), 'dedalo_install_p2_serving_off_'));
		process.env.DEDALO_INSTALL_PRIVATE_DIR = scratch2;
		try {
			// A prior install set the socket; a re-save carries no serving flags.
			writeFileSync(
				join(scratch2, '.env'),
				[
					'DEDALO_SALT_STRING=deadbeef',
					'SERVER_UNIX_SOCKET=/run/dedalo/dedalo_ts.sock',
					'',
				].join('\n'),
			);
			const result = await persistConfig({ ...BASE_CFG });
			expect(result.result).toBe(true);
			const parsed = parseEnvFile(readFileSync(join(scratch2, '.env'), 'utf8'));
			// Preserved verbatim — an empty flag must not clobber it.
			expect(parsed.SERVER_UNIX_SOCKET).toBe('/run/dedalo/dedalo_ts.sock');
			// A serving key never set stays absent (no empty assignment written).
			expect(parsed.MEDIA_PATH).toBeUndefined();
			expect(parsed.DEDALO_MEDIA_ACCESS_MODE).toBeUndefined();
		} finally {
			process.env.DEDALO_INSTALL_PRIVATE_DIR = scratch;
			rmSync(scratch2, { recursive: true, force: true });
		}
	});

	test('check_directories creates + verifies the private tree', () => {
		const r = checkDirectories({ create: true });
		expect(r.result).toBe(true);
		const priv = r.dirs.find((d) => d.label === 'Private config');
		expect(priv?.exists).toBe(true);
		expect(priv?.writable).toBe(true);
	});

	test('writes the four MANDATORY lang keys; JSON keys round-trip through parseEnvFile', async () => {
		// The picked set drives both the map and the code list.
		const result = await persistConfig({
			...BASE_CFG,
			langs: ['lg-eng', 'lg-spa'],
			app_lang_default: 'lg-eng',
			data_lang_default: 'lg-spa',
		});
		expect(result.result).toBe(true);
		const parsed = parseEnvFile(readFileSync(join(scratch, '.env'), 'utf8'));

		// The two JSON-shaped keys must parse back EXACTLY (the raw-write contract:
		// envQuote'd JSON would break here because parseEnvFile does not unescape).
		expect(JSON.parse(parsed.DEDALO_APPLICATION_LANGS as string)).toEqual({
			'lg-eng': 'English',
			'lg-spa': 'Castellano',
		});
		expect(JSON.parse(parsed.DEDALO_PROJECTS_DEFAULT_LANGS as string)).toEqual([
			'lg-eng',
			'lg-spa',
		]);

		// The scalar mandatory keys + the coherent APPLICATION_LANG/DATA_LANG mirror.
		expect(parsed.DEDALO_APPLICATION_LANGS_DEFAULT).toBe('lg-eng');
		expect(parsed.DEDALO_DATA_LANG_DEFAULT).toBe('lg-spa');
		expect(parsed.DEDALO_APPLICATION_LANG).toBe('lg-eng');
		expect(parsed.DEDALO_DATA_LANG).toBe('lg-spa');
		expect(parsed.DEDALO_STRUCTURE_LANG).toBe('lg-spa');
	});

	test('no langs posted → defaults to the whole catalog (still bootable)', async () => {
		const result = await persistConfig({ ...BASE_CFG });
		expect(result.result).toBe(true);
		const parsed = parseEnvFile(readFileSync(join(scratch, '.env'), 'utf8'));
		const map = JSON.parse(parsed.DEDALO_APPLICATION_LANGS as string) as Record<string, string>;
		expect(Object.keys(map).length).toBe(10);
		expect(map['lg-eng']).toBe('English');
	});

	test('REFUSES an unusable lang selection — no .env written', async () => {
		const scratch2 = mkdtempSync(join(tmpdir(), 'dedalo_install_p2_langfail_'));
		process.env.DEDALO_INSTALL_PRIVATE_DIR = scratch2;
		try {
			// default ∉ the selected set → refuse
			const result = await persistConfig({
				...BASE_CFG,
				langs: ['lg-eng'],
				app_lang_default: 'lg-spa',
			});
			expect(result.result).toBe(false);
			expect(result.msg).toContain('Language selection invalid');
			// nothing written
			const { existsSync } = await import('node:fs');
			expect(existsSync(join(scratch2, '.env'))).toBe(false);
		} finally {
			process.env.DEDALO_INSTALL_PRIVATE_DIR = scratch;
			rmSync(scratch2, { recursive: true, force: true });
		}
	});
});
