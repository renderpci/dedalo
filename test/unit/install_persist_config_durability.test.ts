/**
 * NATIVE GATE — persist_config's `.env` survives a POWER CUT, not only a kill
 * (cross-ops:r0, finding "installer .env renamed into place with no fsync").
 *
 * The `.env` persist_config writes is the only home of the generated
 * DEDALO_SALT_STRING and the database password. The executor checkpoints the
 * step as done through a FSYNCED state file (run_files_core writeFileAtomic),
 * so the `.env` it vouches for must be on disk before persistConfig returns —
 * the law of the durability kernel (src/core/files/durable.ts: "a rename makes
 * a write ATOMIC, not DURABLE"). Before the fix the file was staged with
 * writeFileSync, the backup copied, the stage renamed over `.env` — nothing
 * fsynced: after a power cut the checkpoint said "done" over a `.env` that
 * could come back empty, or not at all.
 *
 * OUTCOMES, through the power-cut model (test/helpers/power_loss_model.ts):
 *   - a fresh install's `.env` survives a cut at the instant persistConfig returns;
 *   - a rewrite's `.env.bak.*` (the pre-install file `--abort` restores) survives too;
 *   - the private dir the installer CREATES survives (its entry in the parent),
 *     owner-only, and the sample.env census written beside the .env survives;
 *   - a failed write leaves no secret-holding staged copy behind;
 *   - `--abort` (persist_config's undo) puts the pre-install `.env` back
 *     durably and sweeps every staged copy a killed run can leave — the
 *     kernel's `<name>.tmp-<base36>` temp siblings as well as the legacy
 *     `.env.tmp.<pid>`.
 */

import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnvFile } from '../../src/config/env.ts';
import { isDedaloError } from '../../src/core/errors/index.ts';
import { persistConfig } from '../../src/core/install/config_persist.ts';
import { SAMPLE_ENV_PATH } from '../../src/core/install/paths.ts';
import { INSTALL_STEPS } from '../../src/core/install/steps.ts';
import { setServerState } from '../../src/core/resolve/server_state.ts';
import { startPowerLossModel } from '../helpers/power_loss_model.ts';

const roots: string[] = [];
afterEach(() => {
	delete process.env.DEDALO_INSTALL_PRIVATE_DIR;
	setServerState({ install_status: undefined, information: undefined, info_key: undefined });
});
afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function scratchRoot(): string {
	const root = mkdtempSync(join(tmpdir(), 'dd-persist-durable-'));
	roots.push(root);
	return root;
}

const CFG = {
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

describe('persist_config durability (power-cut model)', () => {
	test('a fresh install: the private dir it creates and its .env (salt, password) survive a cut', async () => {
		const root = scratchRoot();
		const privateDir = join(root, 'private');
		process.env.DEDALO_INSTALL_PRIVATE_DIR = privateDir;
		const model = startPowerLossModel(root);
		try {
			const result = await persistConfig({ ...CFG });
			const envPath = join(privateDir, '.env');
			expect(model.survives(envPath), model.explain(envPath)).toBe(true);
			// Non-vacuous: what survives is the file holding THIS run's secrets.
			const parsed = parseEnvFile(readFileSync(envPath, 'utf8'));
			expect(parsed.DEDALO_SALT_STRING).toBe(result.generated.DEDALO_SALT_STRING);
			expect(parsed.DB_PASSWORD).toBe('secret pass');
			// The private dir the installer created is owner-only, and the key census
			// written beside the .env (sample.env) survives the cut too.
			expect(statSync(privateDir).mode & 0o777).toBe(0o700);
			const census = join(privateDir, 'sample.env');
			expect(readFileSync(census, 'utf8')).toBe(readFileSync(SAMPLE_ENV_PATH, 'utf8'));
			expect(model.survives(census), model.explain(census)).toBe(true);
		} finally {
			model.restore();
		}
	});

	test('a rewrite: the new .env AND the pre-install backup survive a cut', async () => {
		const root = scratchRoot();
		const privateDir = join(root, 'private');
		mkdirSync(privateDir, { mode: 0o700 });
		writeFileSync(join(privateDir, '.env'), 'DEDALO_SALT_STRING=feedface\nKEEP_ME=1\n');
		process.env.DEDALO_INSTALL_PRIVATE_DIR = privateDir;
		const model = startPowerLossModel(root);
		try {
			await persistConfig({ ...CFG });
			const envPath = join(privateDir, '.env');
			expect(model.survives(envPath), model.explain(envPath)).toBe(true);
			const backups = readdirSync(privateDir).filter((name) => name.startsWith('.env.bak.'));
			expect(backups.length).toBe(1);
			const backup = join(privateDir, backups[0] as string);
			expect(readFileSync(backup, 'utf8')).toBe('DEDALO_SALT_STRING=feedface\nKEEP_ME=1\n');
			expect(model.survives(backup), model.explain(backup)).toBe(true);
		} finally {
			model.restore();
		}
	});

	test('the .env is durable on its own — not by grace of the fail-soft census written after it', async () => {
		const root = scratchRoot();
		const privateDir = join(root, 'private');
		// `sample.env` is a DIRECTORY: the census write (fail-soft) fails, so no later
		// directory fsync can cover for the .env's own.
		mkdirSync(join(privateDir, 'sample.env'), { recursive: true });
		process.env.DEDALO_INSTALL_PRIVATE_DIR = privateDir;
		const model = startPowerLossModel(root);
		try {
			await persistConfig({ ...CFG });
			const envPath = join(privateDir, '.env');
			expect(model.survives(envPath), model.explain(envPath)).toBe(true);
		} finally {
			model.restore();
		}
	});

	test('a failed write is refused and leaves no staged copy of the secrets behind', async () => {
		const root = scratchRoot();
		const privateDir = join(root, 'private');
		// `.env` is a DIRECTORY: nothing can be renamed over it, so the write fails.
		mkdirSync(join(privateDir, '.env'), { recursive: true });
		process.env.DEDALO_INSTALL_PRIVATE_DIR = privateDir;
		let refused: unknown = null;
		try {
			await persistConfig({ ...CFG });
		} catch (error) {
			refused = error;
		}
		expect(isDedaloError(refused)).toBe(true);
		const leftovers = readdirSync(privateDir).filter(
			(name) => name !== '.env' && !name.startsWith('.env.bak.') && name.startsWith('.env'),
		);
		expect(leftovers).toEqual([]);
	});

	test('--abort restores the pre-install .env durably and sweeps every staged copy of the secrets', async () => {
		const root = scratchRoot();
		const privateDir = join(root, 'private');
		mkdirSync(privateDir, { mode: 0o700 });
		const original = 'DEDALO_SALT_STRING=feedface\nOPERATOR=1\n';
		writeFileSync(join(privateDir, '.env'), 'DB_NAME=written_by_the_install\n');
		writeFileSync(join(privateDir, '.env.bak.2000'), original);
		// What killed persist runs leave: the durable door's temp siblings, and the legacy name.
		const staged = ['.env.tmp-abc12345', '.env.bak.2000.tmp-def67890', '.env.tmp.4242'];
		for (const name of staged) writeFileSync(join(privateDir, name), 'DB_PASSWORD=secret\n');
		process.env.DEDALO_INSTALL_PRIVATE_DIR = privateDir;
		const state = {
			preflight: {
				env_existed: true,
				env_sha256: createHash('sha256').update(original).digest('hex'),
				env_backups_before: [],
				sample_env_existed: true,
			},
			created: { env_backup: '.env.bak.2000', env_backups: ['.env.bak.2000'], sample_env: false },
		};
		const undo = INSTALL_STEPS.persist_config.undo;
		if (undo === undefined) throw new Error('persist_config has no undo');
		const model = startPowerLossModel(root);
		try {
			await undo({ state } as never);
			const envPath = join(privateDir, '.env');
			expect(readFileSync(envPath, 'utf8')).toBe(original);
			expect(model.survives(envPath), model.explain(envPath)).toBe(true);
		} finally {
			model.restore();
		}
		for (const name of staged) expect(existsSync(join(privateDir, name)), name).toBe(false);
		expect(existsSync(join(privateDir, '.env.bak.2000'))).toBe(false);
	});
});
