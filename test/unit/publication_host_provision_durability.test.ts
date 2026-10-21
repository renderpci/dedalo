/**
 * THE PROVISIONER'S WRITE DOORS SURVIVE A POWER CUT (review 2026-10-21, cross-diffusion r1).
 *
 * THE FINDING. `hostIo()` (publication/host_agent/src/provision/apply.ts) — the doors every
 * provisioned file goes through (units, sudoers, web includes, env files, the agent's own
 * installed files) — fsynced the TEMP file's bytes, then renamed it over its target and never
 * fsynced the directory. After a power cut the new name could be gone (the old file back, or no
 * file at all) although the run reported it written; init's own door (init/host_io.ts
 * writeBytesAtomic) already fsynced the directory, so the two doors held different contracts.
 *
 * WHAT IS ASSERTED — outcomes of the REAL doors on a real scratch tree, judged by the page-cache
 * model (test/helpers/power_loss_model.ts) at the moment each door returns:
 *   1. writeTemp + rename (the plan's write path): the target survives with its new bytes;
 *   2. installFile (the agent's code, root-owned copies): the destination survives;
 *   3. a rename to ANOTHER directory makes the new name durable there.
 * Non-vacuity: the model saw the writes, fsyncs and renames.
 *
 * The scratch tree is the doors' trust root and every account is this uid (the
 * provision_host_io seam), so nothing here needs root. WRITES: one os-tmp scratch tree, removed.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProvisionExec } from '../../publication/host_agent/src/exec.ts';
import { hostIo } from '../../publication/host_agent/src/provision/apply.ts';
import { startPowerLossModel } from '../helpers/power_loss_model.ts';

const SCRATCH = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'dd_provision_durable_')));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

const UID = process.getuid?.() ?? 0;
const GID = process.getgid?.() ?? 0;

/** Every account resolves to this uid: "root-owned" is owned by the running user here. */
const stubExec = { userId: () => UID } as unknown as ProvisionExec;

/** A fresh directory under the trust root (0755, this uid: a trusted ancestor). */
function freshDir(name: string): string {
	const dir = join(SCRATCH, name);
	mkdirSync(dir, { mode: 0o755 });
	return dir;
}

describe('hostIo: a renamed file survives a power cut', () => {
	test('writeTemp + rename: the target survives with its new bytes', () => {
		const dir = freshDir('write');
		const target = join(dir, 'dedalo-unit.service');
		writeFileSync(target, 'old\n');
		const model = startPowerLossModel(SCRATCH);
		try {
			const io = hostIo(stubExec, { trustRoot: SCRATCH });
			const temp = io.writeTemp(target, 'new\n', 0o644);
			io.rename(temp, target);
			expect(model.survives(target), model.explain(target)).toBe(true);
			expect(model.seen.renames).toBeGreaterThan(0);
			expect(model.seen.fsyncs).toBeGreaterThan(1);
		} finally {
			model.restore();
		}
		expect(readFileSync(target, 'utf8')).toBe('new\n');
	});

	test('installFile: the destination survives', () => {
		const sourceDir = freshDir('install_src');
		const dir = freshDir('install_dst');
		const source = join(sourceDir, 'bun');
		writeFileSync(source, 'binary bytes');
		const dst = join(dir, 'bun');
		const model = startPowerLossModel(SCRATCH);
		try {
			const io = hostIo(stubExec, { trustRoot: SCRATCH });
			expect(io.installFile).toBeDefined();
			io.installFile?.(source, dst, 0o755, UID, GID);
			expect(model.survives(dst), model.explain(dst)).toBe(true);
			expect(model.seen.writes).toBeGreaterThan(0);
		} finally {
			model.restore();
		}
		expect(readFileSync(dst, 'utf8')).toBe('binary bytes');
	});

	test('a rename into another directory is durable there', () => {
		const from = freshDir('move_from');
		const to = freshDir('move_to');
		const model = startPowerLossModel(SCRATCH);
		try {
			const io = hostIo(stubExec, { trustRoot: SCRATCH });
			const temp = io.writeTemp(join(from, 'record.json'), '{}\n', 0o600);
			const target = join(to, 'record.json');
			io.rename(temp, target);
			expect(model.survives(target), model.explain(target)).toBe(true);
		} finally {
			model.restore();
		}
	});
});
