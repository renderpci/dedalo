/**
 * THE BACKUP WRITES THROUGH THE ONE DURABLE DOOR (audit 2026-09-26 residual:
 * backup.ts private fsync helpers → core/files/durable.ts).
 *
 * backup.ts kept its OWN durability helpers beside the kernel every other
 * file writer uses (src/core/files/durable.ts) — a second, weaker writer:
 *   - its `writeFileDurably` (the `.verified` proof sidecar) renamed the temp
 *     into place and NEVER fsynced the directory, so on the verification path a
 *     power cut could take the cached proof's NAME away after the verdict was
 *     reported (a rename is atomic, not durable);
 *   - it wrote the JSON with ONE `writeSync(fd, text)` and ignored the count,
 *     so a short write left a TORN proof the reader then refuses — the archive
 *     is read in full again, a multi-GB `pg_restore` per torn sidecar.
 * Both are kernel laws (durable.ts: "a DIRECTORY ENTRY is durable once its
 * directory is fsynced"; `writeAllSync`: "a short write is continued, never
 * dropped"), which is why the fix is to USE the kernel, not to repair a copy.
 *
 * OUTCOMES, never spellings: the power-cut model (test/helpers/power_loss_model.ts)
 * answers whether the proof survives; a short-writing `writeSync` answers
 * whether the proof is whole (a second verification is answered from it without
 * asking pg_restore again). The orphan-promotion leg pins the other door the
 * module routes through the kernel (the proof written before the promotion
 * survives a power cut).
 *
 * DB-FREE: a scratch directory and a FAKE pg_restore that records its calls
 * and passes — the verdict machinery under test is the cache, not the read.
 */

import { afterAll, describe, expect, spyOn, test } from 'bun:test';
import * as nodeFs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as backup from '../../src/core/area_maintenance/backup.ts';
import { startPowerLossModel } from '../helpers/power_loss_model.ts';

const scratch = nodeFs.mkdtempSync(join(tmpdir(), 'dedalo_backup_sidecar_'));
const RESTORE_LOG = join(scratch, 'pg_restore.calls');
const fakePgRestore = join(scratch, 'fake_pg_restore.sh');
nodeFs.writeFileSync(fakePgRestore, `#!/bin/sh\necho "$*" >> '${RESTORE_LOG}'\nexit 0\n`);
nodeFs.chmodSync(fakePgRestore, 0o755);

afterAll(() => {
	nodeFs.rmSync(scratch, { recursive: true, force: true });
});

/** A custom-format-looking artifact (the magic is all the classifier reads before pg_restore). */
function plantArtifact(dir: string, name: string): string {
	nodeFs.mkdirSync(dir, { recursive: true });
	const path = join(dir, name);
	nodeFs.writeFileSync(path, `PGDMP${'x'.repeat(4096)}`);
	return path;
}

const restoreCalls = (): number =>
	nodeFs.existsSync(RESTORE_LOG)
		? nodeFs.readFileSync(RESTORE_LOG, 'utf8').split('\n').filter(Boolean).length
		: 0;

const options = { pgRestoreBin: fakePgRestore, budgetMs: 30_000 };

describe('backup proof sidecars are written through the durable kernel', () => {
	test('a cached proof written on the verification path survives a power cut', async () => {
		const dir = join(scratch, 'power');
		const artifact = plantArtifact(
			dir,
			'2026-01-01_000000.zz.postgresql_-1_forced_dbv7.custom.backup',
		);
		const model = startPowerLossModel(dir);
		let verdict: backup.BackupVerdict;
		try {
			verdict = await backup.verifyBackupArtifact(artifact, options);
		} finally {
			model.restore();
		}
		expect(verdict.reason).toBe('verified_deep');
		const sidecar = `${artifact}.verified`;
		expect(nodeFs.existsSync(sidecar)).toBe(true);
		// Non-vacuous: the model saw the write, its fsync and the rename.
		expect(model.seen.renames).toBeGreaterThan(0);
		expect(model.seen.fsyncs).toBeGreaterThan(0);
		expect(model.survives(sidecar), model.explain(sidecar)).toBe(true);
	});

	test('a short write never leaves a torn proof (the next verification reads the cache)', async () => {
		const dir = join(scratch, 'short');
		const artifact = plantArtifact(
			dir,
			'2026-01-01_000001.zz.postgresql_-1_forced_dbv7.custom.backup',
		);
		const realWriteSync = nodeFs.writeSync;
		let shortened = 0;
		// The kernel may take fewer bytes than offered; a writer must continue.
		const spy = spyOn(nodeFs, 'writeSync').mockImplementation(((
			fd: number,
			data: string | NodeJS.ArrayBufferView,
			offsetOrPosition?: number | null,
			length?: number | BufferEncoding | null,
			position?: number | null,
		): number => {
			const bytes =
				typeof data === 'string'
					? Buffer.from(data)
					: new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
			const offset =
				typeof data === 'string' ? 0 : typeof offsetOrPosition === 'number' ? offsetOrPosition : 0;
			const wanted =
				typeof data !== 'string' && typeof length === 'number' ? length : bytes.byteLength - offset;
			const taken = wanted > 1 ? Math.ceil(wanted / 2) : wanted;
			if (taken < wanted) shortened += 1;
			return realWriteSync(fd, bytes, offset, taken, typeof data === 'string' ? null : position);
		}) as typeof nodeFs.writeSync);
		let first: backup.BackupVerdict;
		try {
			first = await backup.verifyBackupArtifact(artifact, options);
		} finally {
			spy.mockRestore();
		}
		expect(first.reason).toBe('verified_deep');
		expect(shortened).toBeGreaterThan(0); // the short write really happened
		const record = JSON.parse(nodeFs.readFileSync(`${artifact}.verified`, 'utf8')) as {
			reason: string;
			size: number;
		};
		expect(record.reason).toBe('verified_deep');
		expect(record.size).toBe(nodeFs.statSync(artifact).size);
		// The whole point of the proof: the next asker is answered without a read.
		const before = restoreCalls();
		const second = await backup.verifyBackupArtifact(artifact, options);
		expect(second.reason).toBe('verified_deep');
		expect(restoreCalls()).toBe(before);
	});

	test('an adopted orphan: its proof survives a power cut (the promotion fsyncs through the kernel)', async () => {
		const dir = join(scratch, 'orphan');
		const finalPath = join(dir, '2026-01-01_000002.zz.postgresql_-1_forced_dbv7.custom.backup');
		const part = plantArtifact(dir, `${finalPath.slice(dir.length + 1)}.part`);
		const twoDaysAgo = new Date(Date.now() - 48 * 3_600_000);
		nodeFs.utimesSync(part, twoDaysAgo, twoDaysAgo);
		const model = startPowerLossModel(dir);
		try {
			await backup.adoptOrphanedParts(dir, options);
		} finally {
			model.restore();
		}
		expect(nodeFs.existsSync(part)).toBe(false);
		expect(nodeFs.existsSync(finalPath)).toBe(true);
		// The final NAME is given by link+unlink (renameNoClobber), a door the model
		// does not spy — so it cannot prove that entry (conservative by
		// construction). The proof's entry it CAN: written through the kernel and
		// covered by a directory fsync after it appeared.
		const sidecar = `${finalPath}.verified`;
		expect(model.survives(sidecar), model.explain(sidecar)).toBe(true);
	});
});
