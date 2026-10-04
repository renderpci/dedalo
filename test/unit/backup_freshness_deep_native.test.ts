/**
 * OPS-1 (audit 2026-09-26) — THE BACKUP-FRESHNESS VERDICT IS THE DEEP ONE, and
 * asking it never freezes the server.
 *
 * THE DEFECT. `backupFreshness()` — the ONE predicate behind both the update
 * panel's `backup_fresh` line and the code-update refusal — asked the CHEAP
 * question (`newestUsableBackup(dir, { deep: false })` → `pg_restore --list`).
 * Measured on real bytes (backup_restorability_native): `--list` accepts an
 * archive cut to 60%, because the TOC sits at the front. So a pg_dump that died
 * at 60% was reported as a fresh restore point, and the unwaived code update —
 * whose rollback contract leans on that restore point — proceeded. Two further
 * holes lived beside it: a verification that ran out of its (constant, 120 s)
 * budget was `usable: true` (fails OPEN above ~16 GB at 7.4 s/GB), and every
 * verification was `Bun.spawnSync`, which freezes the single-threaded server
 * for the whole read.
 *
 * THE FINAL SHAPE THIS GATE MEASURES (design: audits/2026-09-26_full, lane 2):
 * - one verdict = a full async `pg_restore -f /dev/null` read; `verified_toc`
 *   no longer exists and a legacy `verified_toc` sidecar vouches for nothing;
 * - a verify that outruns its size-scaled budget (`verifyBudgetMs`,
 *   `DEDALO_BACKUP_VERIFY_SECONDS_PER_GB`) is `unverifiable_timeout`,
 *   `usable: false`, never cached — and the require path REFUSES with a remedy;
 * - concurrent askers share ONE read (single-flight), at most 3 candidates are
 *   read, and a file that moved during its read is `in_progress`, not proven;
 * - the HTTP surfaces (panel, update_data_version's warnings) race the SAME
 *   shared scan against a bounded wait and say `verifying`, never `ok`.
 *
 * SEAMS the gate drives (production callers pass none of them):
 * - `backupFreshness(dir?, verify?)`, `backupFreshnessWithin(maxWaitMs, dir?, verify?)`,
 *   `requireFreshBackup(dir?, verify?)`, `backupWarningsWithin(maxWaitMs, dir?, verify?)`
 *   where `verify = { pgRestoreBin?, budgetMs? }`;
 * - `consumerStatus(principal, { backupDir?, backupVerify?, waitMs? })`.
 *
 * Every leg BUILDS its situation in a fresh scratch directory — nothing here
 * reads, writes or verifies the installation's backup directory. The real
 * archive is a READ of the suite database. Fake pg_restore binaries are `sh`
 * wrappers that record their argv and then exec the REAL pg_restore, so every
 * verdict below is still pg_restore's own.
 */

import { afterAll, describe, expect, mock, test } from 'bun:test';
import {
	chmodSync,
	closeSync,
	copyFileSync,
	existsSync,
	ftruncateSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
	writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import * as realConfigModule from '../../src/config/config.ts';
import { config } from '../../src/config/config.ts';
import type { BackupVerdict } from '../../src/core/area_maintenance/backup.ts';
// Namespace imports: the surfaces under test are ASYNC and some are new with
// OPS-1; a namespace keeps this file loadable against any shape of the module
// so a missing surface reds its own leg, not the whole file.
import * as backup from '../../src/core/area_maintenance/backup.ts';
import { DedaloError } from '../../src/core/errors/index.ts';
import { SUPERUSER_ID } from '../../src/core/security/permissions.ts';
import * as preconditions from '../../src/core/update/preconditions.ts';
import type { StatusCheck } from '../../src/core/update/status.ts';
import * as status from '../../src/core/update/status.ts';
import { ageMinutes, buildRealArchive, truncatedCopy } from '../helpers/real_backup_archive.ts';

const scratch = mkdtempSync(join(tmpdir(), 'dedalo_freshness_deep_'));
const REAL_CONFIG = { ...realConfigModule };
afterAll(() => {
	mock.module('../../src/config/config.ts', () => REAL_CONFIG);
	rmSync(scratch, { recursive: true, force: true });
});

const realArchive = buildRealArchive(scratch);
const pgRestore = backup.resolvePgRestore();
const REAL_BYTES_READY = realArchive.path !== null && pgRestore !== null;
if (!REAL_BYTES_READY) {
	console.warn(
		`[backup_freshness_deep] real-archive legs SKIPPED (not passed): ${
			pgRestore === null ? 'no pg_restore on this host; ' : ''
		}${realArchive.note}`,
	);
}

const superuser = { userId: SUPERUSER_ID } as never;
const GiB = 2 ** 30;

interface VerifyOptions {
	pgRestoreBin?: string | null;
	budgetMs?: number;
}
interface Freshness {
	newest: number;
	hours: number | null;
	stale: boolean;
	verified: boolean;
	verdict: BackupVerdict | null;
	rejected: BackupVerdict[];
}
type Pending = { pending: true; candidate: unknown };

/* The final surfaces, typed once (see the header for their contract). */
const freshness = (dir: string, verify?: VerifyOptions): Promise<Freshness> =>
	Promise.resolve(
		(preconditions.backupFreshness as unknown as (d: string, v?: VerifyOptions) => Freshness)(
			dir,
			verify,
		),
	);
const freshnessWithin = (
	waitMs: number,
	dir: string,
	verify?: VerifyOptions,
): Promise<Freshness | Pending> =>
	(
		(preconditions as Record<string, unknown>).backupFreshnessWithin as (
			w: number,
			d: string,
			v?: VerifyOptions,
		) => Promise<Freshness | Pending>
	)(waitMs, dir, verify);
const requireFresh = (dir: string, verify?: VerifyOptions): Promise<unknown> =>
	(
		(preconditions as Record<string, unknown>).requireFreshBackup as (
			d: string,
			v?: VerifyOptions,
		) => Promise<unknown>
	)(dir, verify);
const warningsWithin = (waitMs: number, dir: string, verify?: VerifyOptions): Promise<string[]> =>
	(
		(preconditions as Record<string, unknown>).backupWarningsWithin as (
			w: number,
			d: string,
			v?: VerifyOptions,
		) => Promise<string[]>
	)(waitMs, dir, verify);
const verify = (
	path: string,
	options: VerifyOptions & { nowMs?: number },
): Promise<BackupVerdict> =>
	Promise.resolve(
		(backup.verifyBackupArtifact as unknown as (p: string, o: object) => BackupVerdict)(
			path,
			options,
		),
	);

/* ------------------------------------------------------------------------- */

let dirSeq = 0;
function freshDir(name: string): string {
	dirSeq += 1;
	const dir = join(scratch, `${String(dirSeq).padStart(2, '0')}_${name}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function placeComplete(dir: string, name: string, minutesOld: number): string {
	const path = join(dir, name);
	copyFileSync(realArchive.path as string, path);
	ageMinutes(path, minutesOld);
	return path;
}

function placeTruncated(dir: string, name: string, minutesOld: number): string {
	const path = join(dir, name);
	truncatedCopy(realArchive.path as string, path, 0.6);
	ageMinutes(path, minutesOld);
	return path;
}

function script(name: string, body: string): string {
	const path = join(scratch, name);
	writeFileSync(path, `#!/bin/sh\n${body}\n`);
	chmodSync(path, 0o755);
	return path;
}

/** A pg_restore that records its argv (one line per spawn) and then IS pg_restore. */
function countingRestore(name: string): { bin: string; log: string } {
	const log = join(scratch, `${name}.argv`);
	const bin = script(name, `printf '%s\\n' "$*" >> '${log}'\nexec '${pgRestore}' "$@"`);
	return { bin, log };
}

/**
 * A pg_restore that waits for `release` (self-releasing after `maxSeconds`, so a
 * synchronous caller that blocks the event loop cannot deadlock the run), records
 * its argv, then IS pg_restore.
 */
function blockingRestore(
	name: string,
	maxSeconds = 3,
): { bin: string; log: string; release: () => void } {
	const log = join(scratch, `${name}.argv`);
	const gate = join(scratch, `${name}.release`);
	const ticks = maxSeconds * 20;
	const bin = script(
		name,
		`printf '%s\\n' "$*" >> '${log}'\ni=0\nwhile [ ! -f '${gate}' ] && [ $i -lt ${ticks} ]; do sleep 0.05; i=$((i+1)); done\nexec '${pgRestore}' "$@"`,
	);
	return { bin, log, release: () => writeFileSync(gate, '') };
}

function spawnLines(log: string): string[] {
	if (!existsSync(log)) return [];
	return readFileSync(log, 'utf-8').trim().split('\n').filter(Boolean);
}
function fullReads(log: string): number {
	return spawnLines(log).filter((line) => line.startsWith('-f /dev/null')).length;
}

async function refusalOf(promise: Promise<unknown>): Promise<DedaloError> {
	try {
		await promise;
	} catch (error) {
		expect(error).toBeInstanceOf(DedaloError);
		return error as DedaloError;
	}
	throw new Error('expected update.refused, the precondition resolved');
}

function byId(checks: StatusCheck[], id: string): StatusCheck {
	const found = checks.find((entry) => entry.id === id);
	if (found === undefined) throw new Error(`no check '${id}'`);
	return found;
}

/* ------------------------------------------------------------------------- */

describe.if(REAL_BYTES_READY)('OPS-1: freshness asks the deep question', () => {
	test('A — a real 60% cut is NOT a fresh backup, and the unwaived update refuses', async () => {
		const dir = freshDir('A_truncated');
		const cut = placeTruncated(dir, 'died-at-60.custom.backup', 60);

		const answer = await freshness(dir);
		// THE FINDING: the cheap `--list` pass accepted this file as a restore point.
		expect(answer.hours).toBeNull();
		expect(answer.stale).toBe(true);
		expect(answer.rejected[0]?.reason).toBe('truncated');
		expect(answer.rejected[0]?.filePath).toBe(cut);

		const refused = await refusalOf(requireFresh(dir));
		expect(refused.code).toBe('update.refused');
		expect(refused.message).toContain(`'${basename(cut)}'`);
		expect(refused.message).toContain('(truncated)');
	});

	test('B — a legacy `verified_toc` sidecar keyed to the cut vouches for nothing', async () => {
		// Field installs carry sidecars the HEAD engine wrote; a TOC verdict is
		// blind to truncation, so it must be re-verified, never trusted.
		const dir = freshDir('B_legacy_sidecar');
		const cut = placeTruncated(dir, 'died-at-60.custom.backup', 60);
		const stats = statSync(cut);
		writeFileSync(
			`${cut}.verified`,
			JSON.stringify({
				size: stats.size,
				mtimeMs: stats.mtimeMs,
				reason: 'verified_toc',
				verifiedAt: Date.now(),
			}),
		);

		const answer = await freshness(dir);
		expect(answer.hours).toBeNull();
		expect(answer.rejected[0]?.reason).toBe('truncated');
		const refused = await refusalOf(requireFresh(dir));
		expect(refused.code).toBe('update.refused');
	});

	test('C — a verify that outruns its budget is NOT usable, is not cached, and refuses with a remedy', async () => {
		// A pg_restore that never finishes within the budget. `exec` so the kill
		// reaches the process holding the stderr pipe.
		const sleeper = script('sleeping_restore.sh', 'exec sleep 5');
		const dir = freshDir('C_timeout');
		const path = placeComplete(dir, 'complete.custom.backup', 60);

		const started = performance.now();
		const verdict = await verify(path, { pgRestoreBin: sleeper, budgetMs: 200 });
		const elapsed = performance.now() - started;
		// THE FINDING: an unproven artifact counted as a restore point.
		expect(verdict.usable).toBe(false);
		expect(verdict.verified).toBe(false);
		expect(verdict.reason).toBe('unverifiable_timeout');
		// The budget is honoured (a 5 s child killed at ~200 ms).
		expect(elapsed).toBeLessThan(2000);
		// A timeout describes THIS host at THIS moment, never the file.
		expect(existsSync(`${path}.verified`)).toBe(false);
		// …and it did not disprove anything: the artifact is still where it was.
		expect(existsSync(path)).toBe(true);
		expect(existsSync(`${path}.failed`)).toBe(false);

		const answer = await freshness(dir, { pgRestoreBin: sleeper, budgetMs: 200 });
		expect(answer.hours).toBeNull();
		expect(answer.rejected[0]?.reason).toBe('unverifiable_timeout');

		const refused = await refusalOf(requireFresh(dir, { pgRestoreBin: sleeper, budgetMs: 200 }));
		expect(refused.code).toBe('update.refused');
		expect(refused.message).toContain('(unverifiable_timeout)');
		expect(refused.message).toContain('DEDALO_BACKUP_VERIFY_SECONDS_PER_GB');
		expect(refused.message).toContain('waive_backup');
	});

	test('D (control) — a complete archive is verified_deep once, then answered from the sidecar', async () => {
		const dir = freshDir('D_control');
		const path = placeComplete(dir, 'complete.custom.backup', 60);
		const restore = countingRestore('D_restore.sh');

		const first = await freshness(dir, { pgRestoreBin: restore.bin });
		expect(first.verdict?.reason).toBe('verified_deep');
		expect(first.verdict?.filePath).toBe(path);
		expect(first.verified).toBe(true);
		expect(first.hours).not.toBeNull();
		expect(Math.abs((first.hours as number) - 1)).toBeLessThan(0.1);
		expect(first.stale).toBe(1 > config.ops.backupTimeRangeHours);
		expect(fullReads(restore.log)).toBe(1);
		// A good backup never refuses (the guard's own outage).
		await requireFresh(dir, { pgRestoreBin: restore.bin });

		const spawnsBefore = spawnLines(restore.log).length;
		const second = await freshness(dir, { pgRestoreBin: restore.bin });
		expect(second.verdict?.reason).toBe('verified_deep');
		expect(spawnLines(restore.log).length).toBe(spawnsBefore);
	});

	test('E — two concurrent cold askers share ONE full read', async () => {
		const dir = freshDir('E_single_flight');
		placeComplete(dir, 'complete.custom.backup', 60);
		// A little latency so the two askers genuinely overlap.
		const log = join(scratch, 'E_restore.argv');
		const bin = script(
			'E_restore.sh',
			`printf '%s\\n' "$*" >> '${log}'\nsleep 0.3\nexec '${pgRestore}' "$@"`,
		);

		const [one, two] = await Promise.all([
			freshness(dir, { pgRestoreBin: bin }),
			freshness(dir, { pgRestoreBin: bin }),
		]);
		expect(fullReads(log)).toBe(1);
		expect(one.verdict?.reason).toBe('verified_deep');
		expect(two.verdict?.reason).toBe('verified_deep');
	});

	test('F — verifying never freezes the event loop; a bounded wait answers `pending`', async () => {
		// Part 1: the verifier itself is asynchronous. A synchronous spawn blocks
		// the loop for the whole read, so no interval can tick during it.
		const dir = freshDir('F_async');
		const path = placeComplete(dir, 'complete.custom.backup', 60);
		const slow = blockingRestore('F_restore_1.sh');
		let ticks = 0;
		const ticker = setInterval(() => {
			ticks += 1;
		}, 20);
		const releaser = setTimeout(slow.release, 300);
		let verdict: BackupVerdict;
		try {
			verdict = await verify(path, { pgRestoreBin: slow.bin });
		} finally {
			clearInterval(ticker);
			clearTimeout(releaser);
		}
		expect(ticks).toBeGreaterThanOrEqual(5);
		expect(verdict.reason).toBe('verified_deep');

		// Part 2: the HTTP door waits a bounded time and says so.
		const dir2 = freshDir('F_within');
		const path2 = placeComplete(dir2, 'complete.custom.backup', 60);
		const slow2 = blockingRestore('F_restore_2.sh', 10);
		let ticks2 = 0;
		const ticker2 = setInterval(() => {
			ticks2 += 1;
		}, 20);
		let pending: Freshness | Pending;
		const started = performance.now();
		try {
			pending = await freshnessWithin(50, dir2, { pgRestoreBin: slow2.bin });
			await Bun.sleep(150);
		} finally {
			clearInterval(ticker2);
		}
		expect(performance.now() - started).toBeLessThan(500 + 150);
		expect((pending as Pending).pending).toBe(true);
		expect(JSON.stringify((pending as Pending).candidate)).toContain(basename(path2));
		expect(ticks2).toBeGreaterThanOrEqual(5);

		slow2.release();
		const settled = await freshness(dir2, { pgRestoreBin: slow2.bin });
		expect(settled.verdict?.reason).toBe('verified_deep');
		expect(settled.verdict?.filePath).toBe(path2);
		// The bounded wait and the settled ask were ONE verification.
		expect(fullReads(slow2.log)).toBe(1);
	});

	test('G — at most 3 candidates are read; a clean 5th never rescues the directory', async () => {
		const dir = freshDir('G_cap');
		for (const minutes of [10, 20, 30, 40]) {
			placeTruncated(dir, `cut-${minutes}.custom.backup`, minutes);
		}
		placeComplete(dir, 'older-clean.custom.backup', 60);
		const restore = countingRestore('G_restore.sh');

		const answer = await freshness(dir, { pgRestoreBin: restore.bin });
		expect(answer.hours).toBeNull();
		expect(answer.rejected).toHaveLength(3);
		for (const refused of answer.rejected) expect(refused.reason).toBe('truncated');
		expect(fullReads(restore.log)).toBeLessThanOrEqual(3);
	});

	test('H — a truncated newest dump falls through to the older clean one', async () => {
		const dir = freshDir('H_fallthrough');
		const cut = placeTruncated(dir, 'newest-cut.custom.backup', 10);
		const clean = placeComplete(dir, 'older-clean.custom.backup', 60);

		const answer = await freshness(dir);
		expect(answer.rejected[0]?.filePath).toBe(cut);
		expect(answer.rejected[0]?.reason).toBe('truncated');
		expect(answer.verdict?.filePath).toBe(clean);
		expect(answer.verdict?.reason).toBe('verified_deep');
		expect(Math.abs((answer.hours as number) - 1)).toBeLessThan(0.1);
	});

	test('I — a file that grew during its full read is in_progress and never cached', async () => {
		const dir = freshDir('I_moved');
		const path = placeComplete(dir, 'growing.custom.backup', 10);
		// Appends one byte to the archive only for the FULL read, then reads it.
		const bin = script(
			'I_restore.sh',
			`for a; do last="$a"; done\nif [ "$1" = "-f" ]; then printf 'x' >> "$last"; fi\nexec '${pgRestore}' "$@"`,
		);

		const verdict = await verify(path, { pgRestoreBin: bin });
		expect(verdict.reason).toBe('in_progress');
		expect(verdict.usable).toBe(false);
		expect(existsSync(`${path}.verified`)).toBe(false);
	});

	test('K — the FULL read outrunning its budget is unverifiable_timeout: not usable, not cached, not disproved', async () => {
		// The REALISTIC timeout: `--list` takes ~0.03 s in production; the stage that
		// runs out is the ~7.4 s/GB full read. Leg C's stand-in times out at --list,
		// so deleting the full-stage branch left every gate green — and a good,
		// slow-to-read backup was then cached as `truncated` and retired.
		const dir = freshDir('K_full_timeout');
		const path = placeComplete(dir, 'complete.custom.backup', 60);
		const log = join(scratch, 'K_restore.argv');
		const bin = script(
			'K_restore.sh',
			`printf '%s\\n' "$*" >> '${log}'\nif [ "$1" = "-f" ]; then exec sleep 10; fi\nexec '${pgRestore}' "$@"`,
		);
		Bun.spawnSync([bin, '--version'], { stdout: 'ignore', stderr: 'ignore' }); // warm the first exec
		rmSync(log, { force: true });

		const verdict = await verify(path, { pgRestoreBin: bin, budgetMs: 1500 });
		// The --list stage PASSED and the full read is the one that ran out.
		expect(spawnLines(log)[0]).toBe(`--list ${path}`);
		expect(fullReads(log)).toBe(1);
		expect(verdict.reason).toBe('unverifiable_timeout');
		expect(verdict.usable).toBe(false);
		expect(verdict.verified).toBe(false);
		expect(existsSync(`${path}.verified`)).toBe(false);
		expect(existsSync(`${path}.failed`)).toBe(false);
		expect(existsSync(path)).toBe(true);
	});

	test('L — the require path awaits the SETTLED verdict, never a bounded wait (I3)', async () => {
		// The fail-open this kills: a require path that raced the scan against a
		// wait and passed on `pending` lets an unwaived update proceed over a cold,
		// multi-GB truncated dump as soon as the wait is lost.
		const dir = freshDir('L_settled');
		placeTruncated(dir, 'died-at-60.custom.backup', 60);
		const slow = blockingRestore('L_restore.sh', 10);
		const releaser = setTimeout(slow.release, 300);
		const started = performance.now();
		try {
			const refused = await refusalOf(requireFresh(dir, { pgRestoreBin: slow.bin }));
			expect(refused.code).toBe('update.refused');
			expect(refused.message).toContain('(truncated)');
		} finally {
			clearTimeout(releaser);
			slow.release();
		}
		expect(performance.now() - started).toBeGreaterThanOrEqual(250);
	});

	test('M — two DIFFERENT archives never have their full reads overlap (one slot)', async () => {
		// Single-flight (leg E) shares a read of ONE file; this is the other claim —
		// at most one full read at a time, whatever the file. The wrapper marks a
		// busy file around the real read and reports any read that starts while
		// another holds it.
		const busy = join(scratch, 'M_busy');
		const log = join(scratch, 'M_restore.argv');
		const bin = script(
			'M_restore.sh',
			[
				'if [ "$1" = "-f" ]; then',
				`  if [ -f '${busy}' ]; then echo overlap >> '${log}'; fi`,
				`  : > '${busy}'`,
				'  sleep 0.3',
				`  '${pgRestore}' "$@"; rc=$?`,
				`  rm -f '${busy}'`,
				`  echo read >> '${log}'`,
				'  exit $rc',
				'fi',
				`exec '${pgRestore}' "$@"`,
			].join('\n'),
		);
		const one = freshDir('M_one');
		const two = freshDir('M_two');
		placeComplete(one, 'complete.custom.backup', 60);
		placeComplete(two, 'complete.custom.backup', 60);

		const [a, b] = await Promise.all([
			freshness(one, { pgRestoreBin: bin }),
			freshness(two, { pgRestoreBin: bin }),
		]);
		expect(a.verdict?.reason).toBe('verified_deep');
		expect(b.verdict?.reason).toBe('verified_deep');
		const events = spawnLines(log);
		expect(events.filter((line) => line === 'read')).toHaveLength(2);
		expect(events.filter((line) => line === 'overlap')).toEqual([]);
	});
});

describe('OPS-2 review: our suffix is our grammar', () => {
	test('N — a zero-filled `*.custom.backup` is not_an_archive: no fresh backup, and the update refuses', async () => {
		// Measured before the fix: a 5 MB file of zeros under our suffix, 20 min
		// old, read `unverifiable_foreign_format` → usable → the unwaived update
		// proceeded with no restorable dump. The format degradation is for names we
		// never claimed; `.custom.backup` is always `pg_dump -F c`.
		const dir = freshDir('N_zero_filled');
		const path = join(dir, 'crash-zeros.custom.backup');
		writeFileSync(path, Buffer.alloc(64 * 1024));
		ageMinutes(path, 20);

		const verdict = await verify(path, {});
		expect(verdict.reason).toBe('not_an_archive');
		expect(verdict.usable).toBe(false);
		const answer = await freshness(dir);
		expect(answer.hours).toBeNull();
		expect(answer.rejected[0]?.reason).toBe('not_an_archive');
		const refused = await refusalOf(requireFresh(dir));
		expect(refused.code).toBe('update.refused');
		expect(refused.message).toContain('(not_an_archive)');

		// CONTROL: the same foreign bytes under a name we never claimed keep the
		// degradation (counted, unproven).
		const foreignDir = freshDir('N_foreign_name');
		const foreign = join(foreignDir, 'plain-sql.backup');
		writeFileSync(foreign, '-- PostgreSQL database dump\n');
		ageMinutes(foreign, 20);
		const degraded = await verify(foreign, {});
		expect(degraded.reason).toBe('unverifiable_foreign_format');
		expect(degraded.usable).toBe(true);
	});
});

describe('OPS-1: the verify budget scales with size', () => {
	test('J — verifyBudgetMs is monotone, floored at 60 s, clears 2x the measured rate, and follows the key', () => {
		const budget = (backup as Record<string, unknown>).verifyBudgetMs as (
			size: number,
			secondsPerGib?: number,
		) => number;
		// THE FINDING: one constant (120 s) for every size — a 16 GB archive at the
		// measured 7.4 s/GB needs ~118 s, so anything larger timed out and (then)
		// counted as usable.
		expect(typeof budget).toBe('function');
		const oneMb = budget(1_000_000);
		const oneGib = budget(GiB);
		const sixteen = budget(16 * GiB);
		expect(oneMb).toBeGreaterThanOrEqual(60_000);
		expect(oneGib).toBeGreaterThanOrEqual(oneMb);
		expect(sixteen).toBeGreaterThan(oneGib);
		expect(sixteen).toBeGreaterThan(2 * 16 * 7_400);
		expect(budget(64 * GiB)).toBeGreaterThan(sixteen);
		// The default IS the config key, and raising the key raises the budget.
		const perGib = (config.ops as unknown as Record<string, unknown>).backupVerifySecondsPerGb;
		expect(typeof perGib).toBe('number');
		expect(budget(16 * GiB, perGib as number)).toBe(sixteen);
		expect(budget(16 * GiB, (perGib as number) * 2)).toBeGreaterThan(sixteen);
		// A timer cannot hold more than 2^31-1 ms: past it setTimeout fires after
		// ~1 ms and SIGKILLs every read at once. 30 GiB at 100000 s/GiB on a slow
		// NAS is 3e9 ms — it must clamp, never overflow.
		const MAX_TIMER = 2 ** 31 - 1;
		expect(budget(30 * GiB, 100_000)).toBe(MAX_TIMER);
		expect(budget(1024 * GiB, Number.MAX_SAFE_INTEGER)).toBeLessThanOrEqual(MAX_TIMER);
	});

	test('J2 — an over-long budget still lets a read FINISH (the clamp is what reaches the timer)', async () => {
		// Outcome, not arithmetic: with an unclamped 3e9 ms timer the read was
		// SIGKILLed after ~1 ms and every verify became `unverifiable_timeout`.
		const dir = freshDir('J2_overflow');
		const path = join(dir, 'foreign-plain.backup');
		writeFileSync(path, 'PGDMP');
		ageMinutes(path, 20);
		const bin = script('J2_restore.sh', 'sleep 0.2\nexit 1');
		const verdict = await verify(path, { pgRestoreBin: bin, budgetMs: 3_000_000_000 });
		expect(verdict.reason).not.toBe('unverifiable_timeout');
	});

	test('J3 — with NO budget passed, a real read runs under verifyBudgetMs(size), and the key moves it', async () => {
		// Every timeout leg passes an explicit `budgetMs`; the production path is the
		// DEFAULT (`options.budgetMs ?? verifyBudgetMs(size)`). Mutating that default
		// to a constant — the old 120 s included — stayed green until the verdict
		// carried the budget it ran under. A SPARSE multi-GiB archive (magic, then a
		// hole) makes the size-scaled value differ from the 60 s floor.
		const dir = freshDir('J3_default_budget');
		const path = join(dir, 'large.custom.backup');
		const fd = openSync(path, 'w');
		try {
			writeSync(fd, 'PGDMP');
			ftruncateSync(fd, 5 * GiB);
		} finally {
			closeSync(fd);
		}
		ageMinutes(path, 30);
		const size = statSync(path).size;
		const bin = script('J3_restore.sh', 'exit 0');
		const perGib = config.ops.backupVerifySecondsPerGb;
		const expected = backup.verifyBudgetMs(size, perGib);
		expect(expected).toBeGreaterThan(120_000); // not the floor, not the old constant

		const cached = await verify(path, { pgRestoreBin: bin });
		expect(cached.reason).toBe('verified_deep');
		expect(cached.budgetMs).toBe(expected);
		const pure = await backup.judgeArtifact(path, { pgRestoreBin: bin });
		expect(pure.budgetMs).toBe(expected);

		// The key is what an operator on slow storage raises: the budget follows it.
		rmSync(`${path}.verified`, { force: true });
		mock.module('../../src/config/config.ts', () => ({
			...REAL_CONFIG,
			config: {
				...REAL_CONFIG.config,
				ops: { ...REAL_CONFIG.config.ops, backupVerifySecondsPerGb: perGib * 3 },
			},
		}));
		try {
			const raised = backup.verifyBudgetMs(size, perGib * 3);
			expect(raised).toBeGreaterThan(expected);
			expect((await verify(path, { pgRestoreBin: bin })).budgetMs).toBe(raised);
			expect((await backup.judgeArtifact(path, { pgRestoreBin: bin })).budgetMs).toBe(raised);
		} finally {
			mock.module('../../src/config/config.ts', () => REAL_CONFIG);
		}
	});
});

describe.if(REAL_BYTES_READY)('OPS-1: the HTTP surfaces wait a bounded time', () => {
	test('Panel — backup_fresh says `verifying` while the scan runs, then the settled verdict', async () => {
		// SAFETY, not a spelling check: a panel with no bounded-wait freshness door
		// has no backup-dir seam either, and calling it would read (and write
		// sidecars into) the INSTALLATION's backup directory.
		expect(typeof (preconditions as Record<string, unknown>).backupFreshnessWithin).toBe(
			'function',
		);
		const dir = freshDir('panel');
		const cut = placeTruncated(dir, 'died-at-60.custom.backup', 60);
		const slow = blockingRestore('panel_restore.sh', 10);
		const panel = (waitMs: number) =>
			Promise.resolve(
				(
					status.consumerStatus as unknown as (
						p: never,
						s: object,
					) => ReturnType<typeof status.consumerStatus>
				)(superuser, { backupDir: dir, backupVerify: { pgRestoreBin: slow.bin }, waitMs }),
			);

		const started = performance.now();
		const during = byId((await panel(50)).checks, 'backup_fresh');
		expect(during.state).toBe('warn');
		expect(during.detail).toBe('verifying');
		expect(during.scope ?? '').toContain(basename(cut));
		expect(performance.now() - started).toBeLessThan(5000);

		slow.release();
		await freshness(dir, { pgRestoreBin: slow.bin });
		const after = byId((await panel(50)).checks, 'backup_fresh');
		expect(after.state).toBe('warn');
		expect(after.detail).toBe('none');
		expect(after.scope).toBe(`${basename(cut)} (truncated)`);
	});

	test('Warn path — a fourth sentence while pending; the three settled sentences are byte-frozen', async () => {
		const dir = freshDir('warn_pending');
		const cut = placeTruncated(dir, 'died-at-60.custom.backup', 60);
		const slow = blockingRestore('warn_restore.sh', 10);

		const pending = await warningsWithin(50, dir, { pgRestoreBin: slow.bin });
		expect(pending).toHaveLength(1);
		expect(pending[0]).toContain(
			`The newest database backup ('${basename(cut)}') is still being verified — retry shortly`,
		);

		slow.release();
		await freshness(dir, { pgRestoreBin: slow.bin });
		expect(await warningsWithin(50, dir, { pgRestoreBin: slow.bin })).toEqual([
			`Warning. No usable database backup found — the newest dump ('${basename(cut)}') did not verify (truncated); make a backup before updating`,
		]);

		const empty = freshDir('warn_empty');
		expect(await warningsWithin(50, empty)).toEqual([
			'Warning. No database backup found — make a backup before updating',
		]);

		const staleDir = freshDir('warn_stale');
		const range = config.ops.backupTimeRangeHours;
		placeComplete(staleDir, 'old.custom.backup', (range + 2) * 60);
		expect(await warningsWithin(60_000, staleDir)).toEqual([
			`Warning. Newest database backup is about ${range + 2} hours old — make a fresh backup before updating`,
		]);

		const freshDirPath = freshDir('warn_fresh');
		placeComplete(freshDirPath, 'new.custom.backup', 10);
		expect(await warningsWithin(60_000, freshDirPath)).toEqual([]);
	});
});

/* ------------------------------------------------------------------------- *
 * OPS-1 REVIEW, SECOND ROUND (2026-09-30): the per-file single flight on its own,
 * the scan generation, and ONLY THE BYTES DISPROVE.
 * ------------------------------------------------------------------------- */

describe.if(REAL_BYTES_READY)('OPS-1 review: sharing, generations, what a failure means', () => {
	test('E2 — two concurrent verifyBackupArtifact calls on ONE file share one full read', async () => {
		// Leg E goes through the directory scan, whose own single flight masks this
		// one; the restore door and the name-collision path ask the file directly.
		const dir = freshDir('E2_file_single_flight');
		const path = placeComplete(dir, 'complete.custom.backup', 60);
		const log = join(scratch, 'E2_restore.argv');
		const bin = script(
			'E2_restore.sh',
			`printf '%s\\n' "$*" >> '${log}'\nsleep 0.3\nexec '${pgRestore}' "$@"`,
		);
		const [one, two] = await Promise.all([
			verify(path, { pgRestoreBin: bin }),
			verify(path, { pgRestoreBin: bin }),
		]);
		expect(fullReads(log)).toBe(1);
		expect(one.reason).toBe('verified_deep');
		expect(two.reason).toBe('verified_deep');
	});

	test('O — an asker who arrives after a NEW backup appeared gets a walk that sees it', async () => {
		// THE FINDING: a walk snapshots its candidates when it starts, and a later
		// asker JOINED it — so an operator who made a backup while the panel's scan
		// was still reading an older corpse was refused "no usable backup" beside a
		// proven fresh one.
		const dir = freshDir('O_generation');
		placeTruncated(dir, 'older-cut.custom.backup', 30);
		const slow = blockingRestore('O_restore.sh', 10);
		try {
			const first = backup.newestUsableBackup(dir, { pgRestoreBin: slow.bin });
			await Bun.sleep(200);
			const fresh = placeComplete(dir, 'newer-complete.custom.backup', 1);
			const second = backup.newestUsableBackup(dir, { pgRestoreBin: slow.bin });
			slow.release();
			const [before, after] = await Promise.all([first, second]);
			// The first walk is honest about ITS snapshot; the second saw the new file.
			expect(before.verdict).toBeNull();
			expect(after.verdict?.filePath).toBe(fresh);
			expect(after.verdict?.reason).toBe('verified_deep');
		} finally {
			slow.release();
		}
	});

	test('P1 — an I/O error on the backup storage is not a disproof: not cached, read again next time', async () => {
		const dir = freshDir('P1_io_error');
		const path = placeComplete(dir, 'complete.custom.backup', 60);
		const flag = join(scratch, 'P1_failed_once');
		const bin = script(
			'P1_restore.sh',
			`if [ "$1" = "-f" ] && [ ! -f '${flag}' ]; then : > '${flag}'; echo "pg_restore: error: could not read from input file: Input/output error" >&2; exit 1; fi\nexec '${pgRestore}' "$@"`,
		);
		const first = await verify(path, { pgRestoreBin: bin });
		expect(first.reason).toBe('unverifiable_read_failed');
		expect(first.usable).toBe(false);
		// Not a disproof: nothing cached against a GOOD archive…
		expect(existsSync(`${path}.verified`)).toBe(false);
		// …so the next ask reads it again and proves it.
		const second = await verify(path, { pgRestoreBin: bin });
		expect(second.reason).toBe('verified_deep');
	});

	test('P2 — an UNRECOGNIZED failure is read again; one that does not repeat proves nothing against the file', async () => {
		const dir = freshDir('P2_unrecognized_once');
		const path = placeComplete(dir, 'complete.custom.backup', 60);
		const flag = join(scratch, 'P2_failed_once');
		const log = join(scratch, 'P2_restore.argv');
		const bin = script(
			'P2_restore.sh',
			`printf '%s\\n' "$*" >> '${log}'\nif [ "$1" = "-f" ] && [ ! -f '${flag}' ]; then : > '${flag}'; echo "pg_restore: error: a hiccup nobody catalogued" >&2; exit 1; fi\nexec '${pgRestore}' "$@"`,
		);
		const verdict = await verify(path, { pgRestoreBin: bin });
		expect(verdict.reason).toBe('verified_deep');
		expect(fullReads(log)).toBe(2);
	});

	test('P3 — an unrecognized failure that REPEATS word for word is a property of the bytes', async () => {
		// Measured: a real archive with a corrupt block reads "out of memory" (a
		// garbage length field) on every read — damage no message list names.
		const dir = freshDir('P3_unrecognized_twice');
		const path = placeComplete(dir, 'complete.custom.backup', 60);
		const bin = script(
			'P3_restore.sh',
			`if [ "$1" = "-f" ]; then echo "out of memory" >&2; exit 1; fi\nexec '${pgRestore}' "$@"`,
		);
		const verdict = await verify(path, { pgRestoreBin: bin });
		expect(verdict.reason).toBe('truncated');
		expect(JSON.parse(readFileSync(`${path}.verified`, 'utf-8')).reason).toBe('truncated');
	});

	test('R — a disproof cached by an engine BEFORE the byte-only classifier is read again', async () => {
		// HEAD cached `truncated` for ANY failed full read and `not_an_archive` for
		// ANY failed --list — an OOM kill, an EIO, an old pg_restore. Those sidecars
		// are on field installs, keyed to size+mtime and otherwise indistinguishable
		// from a real disproof: trusting them refused a GOOD archive forever (and let
		// a name collision retire it). A record without the classifier generation is
		// re-derived once; the fresh verdict is cached under the current one.
		for (const legacy of [
			{ reason: 'truncated', detail: 'pg_restore was killed (SIGKILL)' },
			{
				reason: 'not_an_archive',
				detail: 'pg_restore: error: unsupported version (1.16) in file header',
			},
		]) {
			const dir = freshDir(`R_legacy_${legacy.reason}`);
			const path = placeComplete(dir, 'complete.custom.backup', 60);
			const stats = statSync(path);
			writeFileSync(
				`${path}.verified`,
				JSON.stringify({ size: stats.size, mtimeMs: stats.mtimeMs, verifiedAt: 1, ...legacy }),
			);
			const restore = countingRestore(`R_${legacy.reason}.sh`);
			const verdict = await verify(path, { pgRestoreBin: restore.bin });
			expect(verdict.reason).toBe('verified_deep');
			expect(fullReads(restore.log)).toBe(1);
			const rewritten = JSON.parse(readFileSync(`${path}.verified`, 'utf-8'));
			expect(rewritten.reason).toBe('verified_deep');
			// …and the re-derived record IS trusted: no second read.
			await verify(path, { pgRestoreBin: restore.bin });
			expect(fullReads(restore.log)).toBe(1);
		}
	});

	test('P4 — a pg_restore OLDER than the archive is a host limit, never a disproof', async () => {
		const dir = freshDir('P4_old_pg_restore');
		const path = placeComplete(dir, 'complete.custom.backup', 60);
		const bin = script(
			'P4_restore.sh',
			'echo "pg_restore: error: unsupported version (1.16) in file header" >&2\nexit 1',
		);
		const verdict = await verify(path, { pgRestoreBin: bin });
		expect(verdict.reason).toBe('unverifiable_read_failed');
		expect(existsSync(`${path}.verified`)).toBe(false);
	});
});

/* ------------------------------------------------------------------------- *
 * OPS-6/PERF-11 review (S2): THE HOST'S LOCALE NEVER DECIDES THE VERDICT.
 *
 * The host-vs-bytes call (HOST_BOUND_FAILURE / ARCHIVE_DAMAGE) reads pg_restore's
 * words. An NLS-built pg_restore translates them under the server's LANG — so on
 * a Spanish/German host a pg_restore older than the archive, or an unopenable
 * file, matched neither list, repeated word for word on the re-read, and was
 * cached as a DISPROOF of a GOOD archive. Every leg runs the verification in a
 * CHILD SERVER PROCESS started under a non-C locale: Bun.spawn without `env`
 * hands the child the process's ORIGINAL environment, so mutating process.env
 * in this process would not reproduce what a server started under es_ES does.
 * ------------------------------------------------------------------------- */

const BACKUP_MODULE = join(import.meta.dir, '../../src/core/area_maintenance/backup.ts');
const REPO_ROOT = join(import.meta.dir, '../..');
const LOCALE_CHILD = join(scratch, 'locale_verify_child.ts');
writeFileSync(
	LOCALE_CHILD,
	`import { verifyBackupArtifact } from ${JSON.stringify(BACKUP_MODULE)};
const [path, bin] = Bun.argv.slice(2);
const verdict = await verifyBackupArtifact(path, { pgRestoreBin: bin });
await Bun.write(Bun.stdout, JSON.stringify(verdict));
process.exit(0);
`,
);

/** Verify `path` in a child process whose whole environment carries `locale`. */
async function verifyUnderLocale(
	path: string,
	bin: string,
	locale: string,
	extraEnv: Record<string, string> = {},
): Promise<BackupVerdict> {
	const child = Bun.spawn([process.execPath, LOCALE_CHILD, path, bin], {
		cwd: REPO_ROOT,
		stdout: 'pipe',
		stderr: 'pipe',
		env: {
			...(process.env as Record<string, string>),
			LANG: locale,
			LC_ALL: locale,
			LC_MESSAGES: locale,
			LANGUAGE: locale.slice(0, 2),
			...extraEnv,
		},
	});
	const [exitCode, out, err] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	if (exitCode !== 0) throw new Error(`locale child exited ${exitCode}: ${err}`);
	return JSON.parse(out) as BackupVerdict;
}

/** A copy of the real archive whose header claims format 1.99 (newer than any pg_restore). */
function placeFutureFormat(dir: string, name: string): string {
	const path = placeComplete(dir, name, 60);
	const fd = openSync(path, 'r+');
	try {
		// "PGDMP" + vmaj + vmin + vrev: vmin = 99.
		writeSync(fd, Buffer.from([99]), 0, 1, 6);
	} finally {
		closeSync(fd);
	}
	return path;
}

/**
 * The first installed locale under which THIS host's pg_restore really translates
 * its words — measured on real bytes, never assumed (a glibc without the locale
 * generated, or a slim image without pg's message catalogs, answers in English; the
 * CI image generates es_ES/de_DE/fr_FR and keeps the catalogs — ci/Dockerfile).
 */
function translatingLocale(): string | null {
	if (!REAL_BYTES_READY) return null;
	const dir = freshDir('locale_probe');
	const probe = placeFutureFormat(dir, 'probe.custom.backup');
	for (const locale of ['es_ES.UTF-8', 'es_ES.utf8', 'de_DE.UTF-8', 'de_DE.utf8', 'fr_FR.UTF-8']) {
		const run = Bun.spawnSync([pgRestore as string, '--list', probe], {
			stdout: 'ignore',
			stderr: 'pipe',
			env: {
				...(process.env as Record<string, string>),
				LANG: locale,
				LC_ALL: locale,
				LC_MESSAGES: locale,
			},
		});
		const words = new TextDecoder().decode(run.stderr ?? new Uint8Array());
		if (run.exitCode !== 0 && words.includes('1.99') && !/unsupported version/i.test(words)) {
			return locale;
		}
	}
	return null;
}
const TRANSLATING_LOCALE = translatingLocale();
if (REAL_BYTES_READY && TRANSLATING_LOCALE === null) {
	console.warn(
		'[backup_freshness_deep] translated-locale legs SKIPPED (not passed): no installed locale makes this pg_restore translate (the env leg still runs)',
	);
}

describe('OPS-6/PERF-11 review: the verdict never depends on the host locale', () => {
	test('S1 — pg_restore is spawned under the C message locale and without the credential, whatever the server runs under', async () => {
		// Host-independent (no real pg_restore needed): the child's OWN environment
		// is what gettext reads, so it is what this leg measures.
		const dir = freshDir('S1_child_env');
		const path = join(dir, 'probe.custom.backup');
		writeFileSync(path, `PGDMP${'x'.repeat(64)}`);
		ageMinutes(path, 60);
		const envLog = join(scratch, 'S1_restore.env');
		const bin = script('S1_restore.sh', `env > '${envLog}'\nexit 0`);
		const verdict = await verifyUnderLocale(path, bin, 'es_ES.UTF-8', {
			PGPASSWORD: 'locale-leg-sentinel',
		});
		expect(verdict.reason).toBe('verified_deep');
		const seen = Object.fromEntries(
			readFileSync(envLog, 'utf-8')
				.split('\n')
				.filter((line) => line.includes('='))
				.map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
		);
		// LC_ALL outranks LANG/LC_MESSAGES, and under C gettext ignores LANGUAGE.
		expect(seen.LC_ALL).toBe('C');
		expect(seen.PGPASSWORD).toBeUndefined();
	});

	test.if(REAL_BYTES_READY)(
		'S5 — a disproof cached by the generation-2 classifier (locale-blind) is read again',
		async () => {
			// Generation 2 classified a TRANSLATED host failure as a disproof and cached
			// it; those records are on field installs, keyed to size+mtime. They are
			// re-derived once, and the fresh verdict is cached under the current generation.
			const dir = freshDir('S5_generation_2');
			const path = placeComplete(dir, 'complete.custom.backup', 60);
			const stats = statSync(path);
			writeFileSync(
				`${path}.verified`,
				JSON.stringify({
					size: stats.size,
					mtimeMs: stats.mtimeMs,
					verifiedAt: 1,
					classifier: 2,
					reason: 'not_an_archive',
					detail: 'pg_restore: error: versión no soportada (1.16) en el encabezado del archivo',
				}),
			);
			const restore = countingRestore('S5_restore.sh');
			const verdict = await verify(path, { pgRestoreBin: restore.bin });
			expect(verdict.reason).toBe('verified_deep');
			expect(fullReads(restore.log)).toBe(1);
			await verify(path, { pgRestoreBin: restore.bin });
			expect(fullReads(restore.log)).toBe(1);
		},
	);

	describe.if(TRANSLATING_LOCALE !== null)('on a host whose pg_restore translates', () => {
		const locale = TRANSLATING_LOCALE as string;

		test('S2 — a pg_restore OLDER than the archive stays a host limit under a translated locale', async () => {
			const dir = freshDir('S2_future_format_translated');
			const path = placeFutureFormat(dir, 'future.custom.backup');
			const verdict = await verifyUnderLocale(path, pgRestore as string, locale);
			expect(verdict.reason).toBe('unverifiable_read_failed');
			expect(existsSync(`${path}.verified`)).toBe(false);
		});

		test('S3 — a file pg_restore cannot open stays a host failure under a translated locale', async () => {
			const dir = freshDir('S3_unopenable_translated');
			const path = placeComplete(dir, 'complete.custom.backup', 60);
			const missing = join(dir, 'gone.custom.backup');
			// The engine's own stat/magic checks see the real file; pg_restore is
			// then pointed at a path that does not exist — its real, localized words.
			const bin = script(
				'S3_restore.sh',
				`if [ "$1" = "--list" ]; then exec '${pgRestore}' --list '${missing}'; fi\nexec '${pgRestore}' -f /dev/null '${missing}'`,
			);
			const verdict = await verifyUnderLocale(path, bin, locale);
			expect(verdict.reason).toBe('unverifiable_read_failed');
			expect(existsSync(`${path}.verified`)).toBe(false);
		});

		test('S4 (control) — under the same locale real damage is still disproved and a good archive still proved', async () => {
			const dir = freshDir('S4_control_translated');
			const cut = placeTruncated(dir, 'died-at-60.custom.backup', 60);
			const good = placeComplete(dir, 'complete.custom.backup', 60);
			expect((await verifyUnderLocale(cut, pgRestore as string, locale)).reason).toBe('truncated');
			expect((await verifyUnderLocale(good, pgRestore as string, locale)).reason).toBe(
				'verified_deep',
			);
		});
	});
});
