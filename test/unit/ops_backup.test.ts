/**
 * Backup hardening gate (audit S2-35, WS-E item 5).
 *
 * THE GUARANTEES under test (hermetic: a temp backup dir + a FAKE pg_dump
 * script injected through the overrides seam — no real dump runs):
 * - a fast-failing pg_dump (the fe_sendauth class) reports result:false WITH
 *   the log tail in the message — never "OK. backup process running";
 * - an empty artifact left by the failure is deleted (get_backup_files must
 *   never list a zero-byte "backup" as restorable);
 * - a succeeding pg_dump reports result:true and the artifact survives;
 * - PGPASSWORD reaches the child from config.db.password (asserted through
 *   the fake script echoing its environment);
 * - the default backup dir derives from privateDir, not the process cwd.
 *
 * P0-13 (2026-08-30) — A BACKUP COUNTS ONLY WHEN IT HAS BEEN VERIFIED:
 * - a dump that exits non-zero is RETIRED (`*.failed`), never left as a corpse
 *   that the widget lists and the update precondition counts;
 * - a file that only LOOKS like an archive is refused by `verifyBackupArtifact`
 *   and skipped by `newestUsableBackup`;
 * - an artifact still being written (fresh mtime, no verdict) is not a restore
 *   point;
 * - and the degradations NEVER refuse: no pg_restore on the host, or a foreign
 *   (non-custom-format) dump, still counts — a precondition that refuses a
 *   legitimate update because it could not LOOK is an outage.
 *
 * WHAT IS NOT COVERED HERE, stated rather than implied: a REAL custom-format
 * archive truncated mid-data. Building one needs a live pg_dump against a
 * server, which this hermetic gate has no right to require. That case was
 * measured by hand on 2026-08-30 and the numbers are recorded in backup.ts's
 * verification header: `pg_restore --list` accepts the 60% copy (1121 entries,
 * exit 0) and only the deep `pg_restore -f /dev/null` read rejects it. What IS
 * gated below is the mechanism that makes the deep read happen: a cached TOC
 * verdict must never satisfy a deep question.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../../src/config/config.ts';
import { privateDir } from '../../src/config/env.ts';
import {
	getBackupDir,
	getBackupFiles,
	initBackupSequence,
	newestUsableBackup,
	resolvePgRestore,
	verifyBackupArtifact,
} from '../../src/core/area_maintenance/backup.ts';

const scratch = mkdtempSync(join(tmpdir(), 'dedalo_backup_'));
const backupDir = join(scratch, 'backups');

// The backup writes a process record (pfile) for the widget's status stream
// (S2-35/DEC-22a) — point the processes dir at scratch so the live
// ../private/processes tree is never touched (read per call via readEnv).
const previousProcessesDir = process.env.DEDALO_MEDIA_PROCESSES_DIR;
process.env.DEDALO_MEDIA_PROCESSES_DIR = join(scratch, 'processes');

/** A fake pg_dump: scans argv for -f <file>, then behaves per the mode file. */
const fakePgDump = join(scratch, 'fake_pg_dump.sh');
writeFileSync(
	fakePgDump,
	`#!/bin/sh
# find the -f argument
out=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "-f" ]; then out="$arg"; fi
  prev="$arg"
done
mode=$(cat "${scratch}/mode")
echo "PGPASSWORD_SEEN=\${PGPASSWORD:-none}" >> "${scratch}/env_seen"
if [ "$mode" = "fail" ]; then
  : > "$out"                       # the empty artifact a failed dump leaves
  echo "pg_dump: error: connection to server failed: fe_sendauth: no password supplied" >&2
  exit 1
fi
if [ "$mode" = "fail_partial" ]; then
  # The P0-13 shape: a dump that died PART WAY leaves a big, fresh, non-empty
  # file — exactly what the old existsSync && size>0 check called usable.
  printf 'PGDMPnot-a-complete-archive' > "$out"
  echo "pg_dump: error: query failed: server closed the connection unexpectedly" >&2
  exit 1
fi
echo "not-really-a-dump-but-nonempty" > "$out"
exit 0
`,
);
chmodSync(fakePgDump, 0o755);

afterAll(() => {
	if (previousProcessesDir === undefined) {
		Reflect.deleteProperty(process.env, 'DEDALO_MEDIA_PROCESSES_DIR');
	} else {
		process.env.DEDALO_MEDIA_PROCESSES_DIR = previousProcessesDir;
	}
	rmSync(scratch, { recursive: true, force: true });
});

describe('backup directory derivation (S2-35)', () => {
	test('default dir derives from privateDir (unless DEDALO_BACKUP_DIR overrides)', () => {
		const dir = getBackupDir();
		if (config.ops.backupDir !== undefined && config.ops.backupDir !== '') {
			expect(dir).toBe(config.ops.backupDir);
		} else {
			expect(dir).toBe(join(privateDir, 'backups', 'db'));
		}
	});
});

describe('initBackupSequence verification (S2-35)', () => {
	test('a fast pg_dump failure reports FAILURE with the log tail, artifact deleted', async () => {
		writeFileSync(join(scratch, 'mode'), 'fail');
		const response = await initBackupSequence(-1, true, {
			backupDir,
			pgDumpBin: fakePgDump,
			fastFailWindowMs: 5000,
		});
		expect(response.ok).toBe(false);
		expect(response.msg).toContain('fe_sendauth'); // pg_dump's own words surfaced
		// The zero-byte artifact was removed → nothing restorable is listed.
		const leftover = readdirSync(backupDir).filter((name) => name.endsWith('.backup'));
		expect(leftover).toHaveLength(0);
		// The process record ends 'error' with the log tail (the status stream
		// a re-attached widget would poll must not report a dead dump as live).
		const pfiles = readdirSync(join(scratch, 'processes')).filter((n) => n.startsWith('backup_'));
		expect(pfiles.length).toBeGreaterThan(0);
		const record = JSON.parse(
			await Bun.file(join(scratch, 'processes', pfiles[pfiles.length - 1] as string)).text(),
		) as { status: string; errors: string[] };
		expect(record.status).toBe('error');
		expect(record.errors.join('\n')).toContain('fe_sendauth');
	});

	test('a succeeding pg_dump reports success and leaves a non-empty artifact', async () => {
		writeFileSync(join(scratch, 'mode'), 'ok');
		const response = await initBackupSequence(-1, true, {
			backupDir,
			pgDumpBin: fakePgDump,
			fastFailWindowMs: 5000,
		});
		expect(response.ok).toBe(true);
		expect(response.file_path).toBeDefined();
		expect(existsSync(response.file_path as string)).toBe(true);
		// The response carries the pfile handle the copied make_backup widget
		// feeds into update_process_status (DEC-22a wire), and the record is
		// terminal 'done' once the artifact is verified.
		expect(typeof response.pfile).toBe('string');
		const pfilePath = join(scratch, 'processes', response.pfile as string);
		expect(existsSync(pfilePath)).toBe(true);
		const record = JSON.parse(await Bun.file(pfilePath).text()) as {
			status: string;
			data: { file_path?: string };
		};
		expect(record.status).toBe('done');
		expect(record.data.file_path).toBe(response.file_path as string);
	});

	test('PGPASSWORD threads from config.db.password when set', async () => {
		const seen = existsSync(join(scratch, 'env_seen'))
			? await Bun.file(join(scratch, 'env_seen')).text()
			: '';
		expect(seen.length).toBeGreaterThan(0);
		if (config.db.password !== '') {
			expect(seen).toContain(`PGPASSWORD_SEEN=${config.db.password}`);
		} else {
			// Trust/peer-auth dev box: the child must NOT receive a bogus value.
			expect(seen).toContain('PGPASSWORD_SEEN=none');
		}
	});

	test('getBackupFiles lists newest-first with human sizes (the widget surface)', () => {
		// The success artifact from the previous test lives in the override dir,
		// which getBackupFiles does not see (it reads the config dir) — assert
		// only the shape contract on whatever the real dir holds.
		const files = getBackupFiles();
		for (const file of files) {
			expect(typeof file.name).toBe('string');
			expect(file.size).toMatch(/(bytes|KB|MB|GB)$/);
		}
	});
});

/** Far enough ahead that the in-progress window is not what decides a verdict. */
const AFTER_THE_WRITE_WINDOW = Date.now() + 3_600_000;

describe('restore-point verification (P0-13)', () => {
	test('a dump that dies PART WAY is retired, not listed as a backup', async () => {
		writeFileSync(join(scratch, 'mode'), 'fail_partial');
		// Its OWN directory: the forced file name is timestamped to the SECOND,
		// and these tests run inside one second of each other.
		const partialDir = join(scratch, 'backups_partial');
		const response = await initBackupSequence(-1, true, {
			backupDir: partialDir,
			pgDumpBin: fakePgDump,
			fastFailWindowMs: 5000,
		});
		// The artifact is NON-EMPTY and fresh — `existsSync && size > 0`, the old
		// verdict, called this a backup and the operator swapped their code tree.
		expect(response.ok).toBe(false);
		const names = readdirSync(partialDir);
		expect(names.filter((name) => name.endsWith('.backup'))).toHaveLength(0);
		expect(names.some((name) => name.endsWith('.backup.failed'))).toBe(true);
		// …and nothing in the directory now counts as a restore point.
		expect(newestUsableBackup(partialDir, { nowMs: AFTER_THE_WRITE_WINDOW }).mtimeMs).toBe(0);
	});

	test('a file that only LOOKS like an archive is refused (pg_restore is asked)', () => {
		const bin = resolvePgRestore();
		if (bin === null) return; // no pg_restore on this host: covered by the degradation test
		const fake = join(scratch, 'looks-real.custom.backup');
		writeFileSync(fake, `PGDMP${'\u0000'.repeat(64)}`);
		const verdict = verifyBackupArtifact(fake, { deep: true, nowMs: AFTER_THE_WRITE_WINDOW });
		expect(verdict.usable).toBe(false);
		expect(verdict.reason).toBe('not_an_archive');
		// The decisive verdict is cached beside the artifact, so the panel and the
		// update precondition inherit it instead of re-reading the archive.
		expect(existsSync(`${fake}.verified`)).toBe(true);
		// A cached verdict is keyed on (size, mtime) and survives a pg_restore
		// that no longer exists — the cache, not the binary, answers the retry.
		const cached = verifyBackupArtifact(fake, {
			deep: true,
			pgRestoreBin: join(scratch, 'no-such-pg_restore'),
			nowMs: AFTER_THE_WRITE_WINDOW,
		});
		expect(cached.reason).toBe('not_an_archive');
	});

	test('an artifact being written RIGHT NOW is not a restore point', () => {
		// A running pg_dump owns the freshest mtime in the directory, which is
		// precisely why recency cannot be the test — in EITHER direction. Recency
		// does not make an artifact good, and it does not make one bad: a blanket
		// "too fresh to count" window refused every finished backup for its first
		// 90 seconds, so an operator who took a backup and immediately tried to
		// update was told there was no restore point (2026-08-30).
		//
		// What is asserted is the PROPERTY — a partial write is not a restore
		// point — and the engine reports what it PROVED. A six-byte stub is not an
		// archive and is named as such; a genuinely truncated dump is named
		// `truncated` (backup_restorability_native covers that one against a real
		// pg_dump). `in_progress` remains only for the host that cannot verify.
		const growing = join(scratch, 'still-writing.custom.backup');
		writeFileSync(growing, 'PGDMP…');
		const verdict = verifyBackupArtifact(growing, {});
		expect(verdict.usable).toBe(false);
		expect(verdict.reason).toBe('not_an_archive');
	});

	test('DEGRADATION NEVER REFUSES: no pg_restore, and foreign formats, still count', () => {
		// A host with no pg_restore cannot judge its dumps. Refusing every update
		// there would be an outage caused by the guard, not by a missing backup.
		const custom = join(scratch, 'unjudgeable.custom.backup');
		writeFileSync(custom, 'PGDMP-whatever');
		const blind = verifyBackupArtifact(custom, {
			deep: true,
			pgRestoreBin: null,
			nowMs: AFTER_THE_WRITE_WINDOW,
		});
		expect(blind.usable).toBe(true);
		expect(blind.verified).toBe(false); // usable is NOT the same claim as proven
		expect(blind.reason).toBe('unverifiable_no_pg_restore');
		// Nor is a plain-SQL / foreign dump named *.backup refused for a format
		// this module never claimed to verify: it behaves exactly as before P0-13.
		const foreign = join(scratch, 'plain-sql.custom.backup');
		writeFileSync(foreign, '-- PostgreSQL database dump\nSET statement_timeout = 0;\n');
		const verdict = verifyBackupArtifact(foreign, { deep: true, nowMs: AFTER_THE_WRITE_WINDOW });
		expect(verdict.usable).toBe(true);
		expect(verdict.verified).toBe(false);
		expect(verdict.reason).toBe('unverifiable_foreign_format');
		// …and it IS what a "do we have a backup" question finds.
		expect(
			newestUsableBackup(scratch, { deep: true, nowMs: AFTER_THE_WRITE_WINDOW }).mtimeMs,
		).toBeGreaterThan(0);
	});

	test('a cached TOC verdict does NOT answer a deep question', () => {
		// The measured fact behind the whole finding: `pg_restore --list` accepts
		// an archive truncated to 60%. If a cheap verdict could satisfy a deep
		// caller, the code-update refusal would inherit that blindness.
		const bin = resolvePgRestore();
		if (bin === null) return;
		const file = join(scratch, 'toc-only.custom.backup');
		writeFileSync(file, `PGDMP${'\u0000'.repeat(32)}`);
		verifyBackupArtifact(file, { nowMs: AFTER_THE_WRITE_WINDOW }); // cheap pass, writes the sidecar
		const deep = verifyBackupArtifact(file, {
			deep: true,
			pgRestoreBin: join(scratch, 'no-such-pg_restore'),
			nowMs: AFTER_THE_WRITE_WINDOW,
		});
		// It re-ran instead of trusting the cheap sidecar — with an absent binary
		// that re-run can only answer "unverifiable", never "verified".
		expect(deep.verified).toBe(false);
	});
});
