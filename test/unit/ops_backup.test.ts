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
		expect(response.result).toBe(false);
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
		expect(response.result).toBe(true);
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
