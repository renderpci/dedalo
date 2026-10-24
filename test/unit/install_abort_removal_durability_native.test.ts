/**
 * NATIVE GATE — what `--abort` REMOVES stays removed after a POWER CUT
 * (cross-ops:r1, review finding "--abort .env removal branch unlinks without a
 * directory fsync, unlike the durable restore branch beside it").
 *
 * The restore branch of persist_config's undo went through the durability kernel
 * (writeFileDurably: temp → fsync → rename → directory fsync). Its siblings did
 * not: the `.env` removal when the install found none, the sweep of the install's
 * `.env.bak.*` backups and staged temp copies, its `sample.env` — and abortRun's
 * removal of the plan + state files, which IS the "aborted" it reports. A rename
 * or an unlink is durable only once its directory is fsynced (src/core/files/
 * durable.ts): after a cut, an unlink no fsync covered can bring the file back —
 * the database password and salt the abort said it took back, or a plan + state
 * that a later `--resume` takes for a live run.
 *
 * OUTCOMES, through the power-cut model (test/helpers/power_loss_model.ts —
 * conservative: an unlink it did not see, or one no spied directory fsync
 * covered, is never a durable absence):
 *   A. persist_config's undo on an install that found NO `.env`: the `.env` it
 *      wrote, its backups, every staged copy and its sample.env are gone, and
 *      each absence survives a cut at the instant the undo returns;
 *   B. `--abort` through the executor: the plan and state files' absence
 *      survives a cut at the instant it reports "aborted".
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeInstall } from '../../src/core/install/executor.ts';
import { PLAN_FILE, STATE_FILE } from '../../src/core/install/run_files.ts';
import { INSTALL_STEPS } from '../../src/core/install/steps.ts';
import { setServerState } from '../../src/core/resolve/server_state.ts';
import {
	FAKE_BASE_ANSWERS,
	fakeHost,
	fakePlan,
	fakeTable,
	recordingIo,
	withPrivateDir,
} from '../helpers/install_fake_executor.ts';
import { startPowerLossModel } from '../helpers/power_loss_model.ts';

const scratch = mkdtempSync(join(tmpdir(), 'dd-abort-durable-'));
afterAll(() => {
	setServerState({ install_status: undefined, information: undefined, info_key: undefined });
	rmSync(scratch, { recursive: true, force: true });
});

describe('--abort removals survive a power cut', () => {
	test('A. persist_config undo with no pre-install .env: every removal is a durable absence', async () => {
		const root = mkdtempSync(join(scratch, 'a-'));
		const privateDir = join(root, 'private');
		mkdirSync(privateDir, { mode: 0o700 });
		const written = ['.env', '.env.bak.3000', '.env.tmp-abc12345', '.env.tmp.4242', 'sample.env'];
		for (const name of written) writeFileSync(join(privateDir, name), 'DB_PASSWORD=secret\n');
		const state = {
			preflight: {
				env_existed: false,
				env_sha256: null,
				env_backups_before: [],
				sample_env_existed: false,
			},
			created: { env_backup: null, env_backups: ['.env.bak.3000'], sample_env: true },
		};
		const undo = INSTALL_STEPS.persist_config.undo;
		if (undo === undefined) throw new Error('persist_config has no undo');
		await withPrivateDir(privateDir, async () => {
			const model = startPowerLossModel(root);
			try {
				const said = await undo({ state } as never);
				expect(said).toContain('removed .env');
				expect(model.seen.unlinks, 'the model saw no unlink — the gate is vacuous').toBe(
					written.length,
				);
				for (const name of written) {
					const path = join(privateDir, name);
					expect(model.absenceSurvives(path), `${name}: its removal is not power-cut durable`).toBe(
						true,
					);
				}
			} finally {
				model.restore();
			}
		});
	});

	test('B. --abort: the plan + state removal it reports as "aborted" is a durable absence', async () => {
		const privateDir = mkdtempSync(join(scratch, 'b-'));
		await withPrivateDir(privateDir, async () => {
			const { plan, planFile } = fakePlan();
			const first = plan.steps[0];
			if (first === undefined) throw new Error('empty fake plan');
			const failed = await executeInstall(
				{ mode: 'fresh', planFile, plan, secrets: { root_password: 'Mosaic-Kestrel-Harbor-47' } },
				recordingIo().io,
				{
					table: fakeTable([], {
						[first]: {
							run: async () => {
								throw new Error('stop');
							},
						},
					}),
					host: fakeHost().host,
				},
			);
			expect(failed.result).toBe('failed');
			const runDir = join(privateDir, 'install');
			const model = startPowerLossModel(privateDir);
			try {
				const aborted = await executeInstall(
					{
						mode: 'abort',
						secrets: {},
						confirmDatabase: String(FAKE_BASE_ANSWERS.db_database),
					},
					recordingIo().io,
					{ table: fakeTable([]), host: fakeHost().host },
				);
				expect(aborted.result, aborted.message ?? '').toBe('aborted');
				for (const name of [PLAN_FILE, STATE_FILE]) {
					const path = join(runDir, name);
					expect(model.absenceSurvives(path), `${name}: its removal is not power-cut durable`).toBe(
						true,
					);
				}
			} finally {
				model.restore();
			}
		});
	});
});
