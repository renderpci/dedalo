/**
 * `newestBackupMtimeMs` — the recency primitive behind the backup throttle
 * window AND core/update/preconditions.ts's "a recent backup exists" warning
 * (plan §4.1.6).
 *
 * OPERATOR-VISIBLE FAILURE THIS GATES: an install whose last pg_dump FAILED
 * reports a fresh backup, so the pre-update panel stops warning and the
 * operator runs a data migration with no usable dump. The mechanism is the
 * sibling `.backup.log` that `initBackupSequence` writes next to every dump
 * and which is ALWAYS newer than the dump itself — a suffix match loosened to
 * `.includes('.backup')` counts that log as a backup.
 *
 * Injectable by design: the directory is a parameter, so this never touches
 * the real private/backups/db. It writes into an OS tmpdir and removes it.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newestBackupMtimeMs } from '../../src/core/area_maintenance/backup.ts';

/** Seconds since epoch, so utimesSync and mtimeMs agree exactly. */
const T_OLD = 1_600_000_000;
const T_MID = 1_700_000_000;
const T_NEW = 1_800_000_000;

let dir = '';

function put(name: string, atSeconds: number): void {
	const path = join(dir, name);
	writeFileSync(path, 'x');
	utimesSync(path, atSeconds, atSeconds);
}

beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), 'dedalo-backup-recency-'));
});

afterAll(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('newestBackupMtimeMs', () => {
	test('a missing directory returns 0, never throws', () => {
		// preconditions.ts calls this on installs that have never backed up.
		expect(newestBackupMtimeMs(join(dir, 'does-not-exist'))).toBe(0);
	});

	test('an empty directory returns 0', () => {
		const empty = mkdtempSync(join(tmpdir(), 'dedalo-backup-empty-'));
		try {
			expect(newestBackupMtimeMs(empty)).toBe(0);
		} finally {
			rmSync(empty, { recursive: true, force: true });
		}
	});

	test('the NEWEST *.backup wins, not the first or last listed name', () => {
		put('2020-01-01_000000.db.custom.backup', T_MID);
		put('2019-01-01_000000.db.custom.backup', T_OLD);
		expect(newestBackupMtimeMs(dir)).toBe(T_MID * 1000);
	});

	test('a NEWER sibling .backup.log does NOT count as a backup', () => {
		// initBackupSequence writes this log next to every dump; it is always
		// newer than the dump, and on a FAILED dump it is all that exists.
		put('2020-01-01_000000.db.custom.backup.log', T_NEW);
		expect(newestBackupMtimeMs(dir)).toBe(T_MID * 1000);
	});

	test('a directory holding ONLY a .backup.log reports NO backup (0)', () => {
		const logsOnly = mkdtempSync(join(tmpdir(), 'dedalo-backup-logs-'));
		try {
			const path = join(logsOnly, '2020-01-01_000000.db.custom.backup.log');
			writeFileSync(path, 'pg_dump: error: connection failed');
			utimesSync(path, T_NEW, T_NEW);
			expect(newestBackupMtimeMs(logsOnly)).toBe(0);
		} finally {
			rmSync(logsOnly, { recursive: true, force: true });
		}
	});
});
