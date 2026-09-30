/**
 * OPS-2 (audit 2026-09-26) — A DUMP STILL BEING WRITTEN IS INVISIBLE.
 *
 * THE DEFECT. `initBackupSequence` pointed pg_dump's `-f` straight at the FINAL
 * `*.backup` name. For the whole life of the dump — minutes to hours on a real
 * install — a partial archive sat under the one name every scanner matches: the
 * make_backup widget listed it, the freshness scan judged it, and a second call
 * landing on the same name judged the LIVE dump "disproved" (a header-only
 * prefix is not an archive yet) and retired it out from under its own pg_dump.
 * The filename grammar was also built twice (backup.ts and the widget).
 *
 * THE FINAL SHAPE THIS GATE MEASURES (design: audits/2026-09-26_full, lane 2):
 * - in-flight bytes live at `<final>.part`, claimed atomically (`open wx`); a
 *   second claimant of the same name SKIPS and never touches the live dump;
 * - only a pg_dump that exited 0 AND whose bytes read end to end is promoted
 *   (`.verified` sidecar written at the FINAL name, then rename); every failure
 *   is kept as `<final>.failed`, never deleted, never left as `.part`;
 * - a `.part` older than 24 h is an orphan and is ADOPTED by the same full read
 *   (promoted when it proves complete, kept aside as `.orphaned` otherwise) —
 *   never deleted; a young one may be a live dump of another process and is
 *   never touched;
 * - the status record stays LIVE (owned by this server's job registry) through
 *   the verification, so a poll can never reconcile a good backup to
 *   `interrupted`;
 * - a promotion that could not LOOK (no pg_restore, a read past its budget) is
 *   promoted without a proof; a name that appeared meanwhile is never
 *   overwritten; the throttle skips only over a USABLE backup;
 * - the widget advertises the same name the engine writes (one builder);
 * - the poll handle is always pollable (the server's pid, even for a job queued
 *   behind a full maintenance lane); a user stop kills the dump, a shutdown does
 *   not; nothing is ever renamed over an existing file — a second failure under
 *   one name is `.failed.1`, a taken final name keeps its bytes; an EMPTY orphan
 *   is never touched (a dump queued behind a lock writes nothing yet); and the
 *   adoption asserted is the one initBackupSequence starts, observed read-only.
 *
 * SEAMS: `BackupOverrides.now` (the filename clock), `getBackupFiles(dir)`,
 * `backupFreshness(dir, { pgRestoreBin })`. Every leg runs in a scratch backup
 * directory with a FAKE pg_dump built from a REAL archive of the suite database
 * (a READ), and the real pg_restore (through a recording wrapper) as verifier.
 * The process records go to a marked scratch processes dir.
 */

import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import * as realConfigModule from '../../src/config/config.ts';
import { getUtilsProcessStatus } from '../../src/core/api/process_status.ts';
import type { BackupOverrides, BackupResponse } from '../../src/core/area_maintenance/backup.ts';
// Namespace import: `getBackupFiles(dir)` and the async `backupFreshness` are
// part of the fix; a namespace keeps this file loadable against any shape.
import * as backup from '../../src/core/area_maintenance/backup.ts';
import { widget as makeBackupWidget } from '../../src/core/area_maintenance/widgets/make_backup.ts';
import { mediaJobs } from '../../src/core/media/jobs.ts';
import { SUPERUSER_ID } from '../../src/core/security/permissions.ts';
import * as preconditions from '../../src/core/update/preconditions.ts';
import { buildRealArchive } from '../helpers/real_backup_archive.ts';
import { markProcessesDir } from '../helpers/test_media_root.ts';

const scratch = mkdtempSync(join(tmpdir(), 'dedalo_backup_inflight_'));
const processesDir = markProcessesDir(join(scratch, 'processes'));
const previousProcessesDir = process.env.DEDALO_MEDIA_PROCESSES_DIR;
process.env.DEDALO_MEDIA_PROCESSES_DIR = processesDir;

const realArchive = buildRealArchive(scratch);
const pgRestore = backup.resolvePgRestore();
const REAL_BYTES_READY = realArchive.path !== null && pgRestore !== null;
if (!REAL_BYTES_READY) {
	console.warn(
		`[backup_inflight] real-archive legs SKIPPED (not passed): ${
			pgRestore === null ? 'no pg_restore on this host; ' : ''
		}${realArchive.note}`,
	);
}

const MODE = join(scratch, 'mode');
const RELEASE = join(scratch, 'release');
const DUMP_LOG = join(scratch, 'pg_dump.argv');
/** The fake pg_dump's own pid, one line per run, in the same order as DUMP_LOG. */
const PID_LOG = join(scratch, 'pg_dump.pid');
const RESTORE_LOG = join(scratch, 'pg_restore.argv');

/**
 * A pg_dump that writes the REAL archive in two steps: a 2 KB prefix (header,
 * no complete TOC — what a live dump looks like in its first moments), then
 * blocks on RELEASE (self-releasing after 30 s so a hung leg cannot hang the
 * run), then per mode: `ok` writes the rest and exits 0; `truncated_ok` writes
 * up to 60% and exits 0 (a dump that lied); `fail` exits 1; `full_then_fail`
 * writes the WHOLE archive and then exits 1 (an error after the data — the bytes
 * read back perfectly, and only the exit status says the dump did not complete).
 */
const fakePgDump = join(scratch, 'fake_pg_dump.sh');
writeFileSync(
	fakePgDump,
	`#!/bin/sh
out=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "-f" ]; then out="$arg"; fi
  prev="$arg"
done
mode=$(cat '${MODE}')
printf '%s\\n' "$out" >> '${DUMP_LOG}'
printf '%s\\n' "$$" >> '${PID_LOG}'
src='${realArchive.path ?? ''}'
size=$(wc -c < "$src" | tr -d ' ')
head -c 2048 "$src" > "$out"
i=0
while [ ! -f '${RELEASE}' ] && [ $i -lt 600 ]; do sleep 0.05; i=$((i+1)); done
case "$mode" in
  fail)
    echo "pg_dump: error: query failed: server closed the connection unexpectedly" >&2
    exit 1 ;;
  full_then_fail)
    tail -c +2049 "$src" >> "$out"
    echo "pg_dump: error: could not close output file: Input/output error" >&2
    exit 1 ;;
  truncated_ok)
    cut=$((size * 6 / 10))
    tail -c +2049 "$src" | head -c $((cut - 2048)) >> "$out"
    exit 0 ;;
  *)
    tail -c +2049 "$src" >> "$out"
    exit 0 ;;
esac
`,
);
chmodSync(fakePgDump, 0o755);

const countingRestore = join(scratch, 'pg_restore_wrapper.sh');
writeFileSync(
	countingRestore,
	`#!/bin/sh\nprintf '%s\\n' "$*" >> '${RESTORE_LOG}'\nexec '${pgRestore ?? 'pg_restore'}' "$@"\n`,
);
chmodSync(countingRestore, 0o755);

afterAll(() => {
	writeFileSync(RELEASE, ''); // never leave a fake blocked
	if (previousProcessesDir === undefined) {
		Reflect.deleteProperty(process.env, 'DEDALO_MEDIA_PROCESSES_DIR');
	} else {
		process.env.DEDALO_MEDIA_PROCESSES_DIR = previousProcessesDir;
	}
	rmSync(scratch, { recursive: true, force: true });
});

/* ------------------------------------------------------------------------- */

function lines(path: string): string[] {
	if (!existsSync(path)) return [];
	return readFileSync(path, 'utf-8').trim().split('\n').filter(Boolean);
}
const backupNames = (dir: string) => readdirSync(dir).filter((name) => name.endsWith('.backup'));
const partNames = (dir: string) => readdirSync(dir).filter((name) => name.endsWith('.part'));
const failedNames = (dir: string) => readdirSync(dir).filter((name) => name.endsWith('.failed'));

type DumpMode = 'ok' | 'fail' | 'truncated_ok' | 'full_then_fail';
function setMode(mode: DumpMode): void {
	writeFileSync(MODE, mode);
}
function hold(): void {
	rmSync(RELEASE, { force: true });
}
function release(): void {
	writeFileSync(RELEASE, '');
}

function start(
	dir: string,
	now?: Date,
	extra: Partial<BackupOverrides> = {},
	forced = true,
): Promise<BackupResponse> {
	const overrides = {
		backupDir: dir,
		pgDumpBin: fakePgDump,
		pgRestoreBin: countingRestore,
		fastFailWindowMs: 300,
		...(now === undefined ? {} : { now }),
		...extra,
	} as BackupOverrides;
	return backup.initBackupSequence(-1, forced, overrides);
}

/** A pg_restore script (argv recorded) — `body` decides what it does per stage. */
function restoreScript(name: string, body: string): { bin: string; log: string } {
	const log = join(scratch, `${name}.argv`);
	const bin = join(scratch, name);
	writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\n${body}\n`);
	chmodSync(bin, 0o755);
	// Warm the first exec (macOS scans a new script's provenance on its first run,
	// which can take hundreds of ms — longer than a small budget).
	Bun.spawnSync([bin, '--version'], { stdout: 'ignore', stderr: 'ignore' });
	rmSync(log, { force: true });
	return { bin, log };
}

/**
 * Wait until the fake pg_dump has STARTED WRITING: its argv is logged and its
 * `-f` target holds the 2 KB prefix. A freshly written script's first exec can
 * take hundreds of ms on macOS (the provenance scan), so a fixed fast-fail window
 * is no proof that the dump is under way.
 */
async function dumpStarted(expectedDumps: number, timeoutMs = 15_000): Promise<string> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const targets = lines(DUMP_LOG);
		const target = targets[expectedDumps - 1];
		if (target !== undefined && existsSync(target) && statSync(target).size >= 2048) return target;
		await Bun.sleep(20);
	}
	throw new Error(`pg_dump #${expectedDumps} never started writing`);
}

interface ProcessRecord {
	status: string;
	data: { file_path?: string; msg?: string };
	errors: string[];
}
async function terminalRecord(
	pfile: string | undefined,
	timeoutMs = 20_000,
): Promise<ProcessRecord> {
	expect(typeof pfile).toBe('string');
	const path = join(processesDir, pfile as string);
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (existsSync(path)) {
			const record = JSON.parse(readFileSync(path, 'utf-8')) as ProcessRecord;
			if (record.status !== 'running' && record.status !== 'queued') return record;
		}
		await Bun.sleep(50);
	}
	throw new Error(`process record '${pfile}' never reached a terminal status`);
}

const freshness = (dir: string, verify?: { pgRestoreBin?: string | null }) =>
	Promise.resolve(
		(
			preconditions.backupFreshness as unknown as (
				d: string,
				v?: object,
			) => { hours: number | null; rejected: unknown[]; verdict: { reason: string } | null }
		)(dir, verify),
	);

/* ------------------------------------------------------------------------- */

describe.if(REAL_BYTES_READY)('OPS-2: a dump in flight is not a backup', () => {
	/** The one clock both claimants read, so they collide on the same final name. */
	const NOW = new Date(2026, 0, 2, 3, 4, 5);
	const dir = join(scratch, 'inflight');
	let first: BackupResponse;
	let partBefore: { ino: number; size: number } | null = null;

	beforeAll(async () => {
		mkdirSync(dir, { recursive: true });
		setMode('ok');
		hold();
		first = await start(dir, NOW);
		await dumpStarted(1);
	});

	test('a — while pg_dump writes, no *.backup name exists; the bytes live at .part', async () => {
		expect(first.ok).toBe(true);
		expect(first.file_path ?? '').toMatch(/\.custom\.backup$/);
		// THE FINDING: the partial archive sat under the final name.
		expect(backupNames(dir)).toEqual([]);
		const parts = partNames(dir);
		expect(parts).toEqual([`${basename(first.file_path as string)}.part`]);
		const stats = statSync(join(dir, parts[0] as string));
		partBefore = { ino: stats.ino, size: stats.size };
		// Nothing lists it, and nothing judges it.
		expect((backup.getBackupFiles as (d?: string) => unknown[])(dir)).toEqual([]);
		const answer = await freshness(dir, { pgRestoreBin: countingRestore });
		expect(answer.hours).toBeNull();
		expect(answer.rejected).toHaveLength(0);
	});

	test('b — a second claimant of the same name skips and never touches the live dump', async () => {
		const second = await start(dir, NOW);
		// Give a wrongly spawned second pg_dump time to log itself before counting.
		await Bun.sleep(300);
		// THE FINDING: the collision check judged the LIVE dump (a 2 KB prefix is
		// not an archive yet) "disproved" and retired it from under its pg_dump.
		expect(failedNames(dir)).toEqual([]);
		const parts = partNames(dir);
		expect(parts).toHaveLength(1);
		const stats = statSync(join(dir, parts[0] as string));
		expect({ ino: stats.ino, size: stats.size }).toEqual(partBefore as never);
		// One dump ran, not two, and the caller was told why.
		expect(lines(DUMP_LOG)).toHaveLength(1);
		expect(second.ok).toBe(true);
		expect(second.msg).toContain('Skipped backup');
	});

	test('c — on success the dump is promoted: sidecar at the final name, then the name', async () => {
		const restoreSpawnsBefore = lines(RESTORE_LOG).length;
		release();
		const record = await terminalRecord(first.pfile);
		expect(record.status).toBe('done');
		const final = first.file_path as string;
		expect(record.data.file_path).toBe(final);

		expect(existsSync(final)).toBe(true);
		expect(partNames(dir)).toEqual([]);
		expect(readFileSync(final).equals(readFileSync(realArchive.path as string))).toBe(true);
		// The proof was recorded for the FINAL name and matches its identity.
		const sidecar = JSON.parse(readFileSync(`${final}.verified`, 'utf-8')) as {
			reason: string;
			size: number;
			mtimeMs: number;
		};
		const stats = statSync(final);
		expect(sidecar.reason).toBe('verified_deep');
		expect(sidecar.size).toBe(stats.size);
		expect(sidecar.mtimeMs).toBe(stats.mtimeMs);
		expect(existsSync(`${final}.part.verified`)).toBe(false);
		expect(lines(RESTORE_LOG).length).toBeGreaterThan(restoreSpawnsBefore);

		// The next asker inherits the proof instead of re-reading the archive.
		const spawnsBefore = lines(RESTORE_LOG).length;
		const answer = await freshness(dir, { pgRestoreBin: countingRestore });
		expect(answer.verdict?.reason).toBe('verified_deep');
		expect(lines(RESTORE_LOG).length).toBe(spawnsBefore);
	});

	const LEG_D: Record<'fail' | 'truncated_ok' | 'full_then_fail', string> = {
		fail: 'exits 1',
		truncated_ok: 'exits 0 over truncated bytes',
		// I2: the bytes are a complete, readable archive — only the exit status
		// says the dump did not finish. A gate whose failing dump also wrote bad
		// bytes cannot tell the exit-code check from the read.
		full_then_fail: 'writes a COMPLETE archive and then exits 1',
	};
	for (const mode of ['fail', 'truncated_ok', 'full_then_fail'] as const) {
		test(`d — a dump that ${LEG_D[mode]} is kept as .failed, never named .backup`, async () => {
			const failDir = join(scratch, `failing_${mode}`);
			mkdirSync(failDir, { recursive: true });
			setMode(mode);
			hold();
			const dumpsBefore = lines(DUMP_LOG).length;
			const response = await start(failDir);
			await dumpStarted(dumpsBefore + 1);
			const sampledBackupNames: string[] = [];
			for (let sample = 0; sample < 5; sample += 1) {
				sampledBackupNames.push(...backupNames(failDir));
				await Bun.sleep(40);
			}
			release();
			const record = await terminalRecord(response.pfile);
			sampledBackupNames.push(...backupNames(failDir));

			// THE FINDING (in-flight half): the partial bytes had the backup name.
			expect(sampledBackupNames).toEqual([]);
			expect(record.status).toBe('error');
			const final = response.file_path as string;
			expect(existsSync(`${final}.failed`)).toBe(true);
			expect(existsSync(final)).toBe(false);
			expect(partNames(failDir)).toEqual([]);
			expect(statSync(`${final}.failed`).size).toBeGreaterThan(0); // kept, not deleted
			if (mode !== 'truncated_ok') {
				expect(record.errors.join('\n')).toContain('pg_dump exited 1');
			}
			if (mode === 'full_then_fail') {
				// The retired bytes ARE the whole archive: the read alone would have
				// promoted them.
				expect(
					readFileSync(`${final}.failed`).equals(readFileSync(realArchive.path as string)),
				).toBe(true);
			}
		});
	}

	test('e — an orphaned .part older than 24 h is ADOPTED by a full read, never deleted', async () => {
		// THE REVIEW FINDING: the first cut of OPS-2 unlinked every part older than
		// 24 h. Under KillMode=process a dump outlives a server restart, finishes,
		// and its promotion died with the old process — so a COMPLETE restore point
		// was destroyed, which the pre-fix engine never did.
		const sweepDir = join(scratch, 'sweep');
		mkdirSync(sweepDir, { recursive: true });
		const grammar = (second: number) =>
			join(sweepDir, `2026-01-01_00000${second}.zz.postgresql_-1_forced_dbv7.custom.backup`);
		const complete = `${grammar(0)}.part`; // a finished dump nobody promoted
		const corpse = `${grammar(1)}.part`; // a dump that died with the machine
		const young = `${grammar(2)}.part`; // maybe a live dump of another process
		const nameTaken = `${grammar(3)}.part`; // complete, but its final name holds other bytes
		const empty = `${grammar(4)}.part`; // maybe a pg_dump still queued behind a table lock
		const asideTaken = `${grammar(5)}.part`; // a corpse whose `.orphaned` name is already taken
		const foreign = join(sweepDir, 'x.custom.backup');
		const whole = readFileSync(realArchive.path as string);
		writeFileSync(complete, whole);
		writeFileSync(corpse, 'PGDMP orphan of a dead server');
		writeFileSync(young, 'PGDMP maybe a live dump of another process');
		writeFileSync(nameTaken, whole);
		writeFileSync(grammar(3), 'an operator copy that must survive');
		writeFileSync(empty, '');
		writeFileSync(asideTaken, 'PGDMP a second orphan of a dead server');
		writeFileSync(`${grammar(5)}.orphaned`, 'PGDMP an earlier orphan kept aside');
		writeFileSync(foreign, '-- PostgreSQL database dump\n');
		const twoDaysAgo = new Date(Date.now() - 48 * 3_600_000);
		const aMinuteAgo = new Date(Date.now() - 60_000);
		for (const aged of [complete, corpse, nameTaken, empty, asideTaken, foreign]) {
			utimesSync(aged, twoDaysAgo, twoDaysAgo);
		}
		utimesSync(young, aMinuteAgo, aMinuteAgo);

		// A dump into the directory starts the adoption (detached — the request
		// never waits on it). This test OBSERVES that pass and never runs one of its
		// own: `orphanAdoptionSettled` only awaits a pass already in flight, so the
		// adoption asserted below is the one initBackupSequence started — delete that
		// call and nothing here is adopted (review: the old leg called
		// adoptOrphanedParts itself, and stayed green without the production call).
		setMode('ok');
		release();
		const response = await start(sweepDir);
		await backup.orphanAdoptionSettled(sweepDir);
		await terminalRecord(response.pfile);
		await backup.orphanAdoptionSettled(sweepDir);

		// The complete orphan got its final name, with its proof.
		expect(existsSync(complete)).toBe(false);
		expect(readFileSync(grammar(0)).equals(whole)).toBe(true);
		const sidecar = JSON.parse(readFileSync(`${grammar(0)}.verified`, 'utf-8')) as {
			reason: string;
		};
		expect(sidecar.reason).toBe('verified_deep');
		// The corpse is kept aside — its bytes intact — and no longer a part.
		expect(existsSync(corpse)).toBe(false);
		expect(readFileSync(`${grammar(1)}.orphaned`, 'utf-8')).toBe('PGDMP orphan of a dead server');
		expect(existsSync(grammar(1))).toBe(false);
		// A proven orphan whose name is taken never overwrites what is there
		// (renameSync would have): the other bytes survive, the orphan is kept aside.
		expect(readFileSync(grammar(3), 'utf-8')).toBe('an operator copy that must survive');
		expect(existsSync(nameTaken)).toBe(false);
		expect(readFileSync(`${grammar(3)}.orphaned`).equals(whole)).toBe(true);
		// A taken `.orphaned` is never overwritten either: the next free number.
		expect(existsSync(asideTaken)).toBe(false);
		expect(readFileSync(`${grammar(5)}.orphaned`, 'utf-8')).toBe(
			'PGDMP an earlier orphan kept aside',
		);
		expect(readFileSync(`${grammar(5)}.orphaned.1`, 'utf-8')).toBe(
			'PGDMP a second orphan of a dead server',
		);
		// The young part, the EMPTY aged part and the foreign file are untouched.
		expect(readFileSync(young, 'utf-8')).toBe('PGDMP maybe a live dump of another process');
		expect(Math.abs(statSync(young).mtimeMs - aMinuteAgo.getTime())).toBeLessThan(1000);
		expect(existsSync(empty)).toBe(true);
		expect(existsSync(`${grammar(4)}.orphaned`)).toBe(false);
		expect(readFileSync(foreign, 'utf-8')).toBe('-- PostgreSQL database dump\n');
	});

	test('f — the widget advertises the name the engine writes (one grammar)', async () => {
		// Not red before the fix (the two copies happened to agree for a forced
		// dump by user -1): this is the regression gate for the de-duplication.
		const grammar =
			/^\d{4}-\d{2}-\d{2}_\d{6}\.[^/]+\.postgresql_-1_forced_dbv[\d-]*\.custom\.backup$/;
		const timestamp = /^\d{4}-\d{2}-\d{2}_\d{6}/;
		const value = await (
			makeBackupWidget.getValue as NonNullable<typeof makeBackupWidget.getValue>
		)({}, { userId: SUPERUSER_ID } as never);
		const advertised = String((value.data as { file_name?: unknown }).file_name);
		const written = basename(first.file_path as string);
		expect(advertised).toMatch(grammar);
		expect(written).toMatch(grammar);
		expect(advertised.replace(timestamp, 'T')).toBe(written.replace(timestamp, 'T'));
	});
});

/* ------------------------------------------------------------------------- *
 * THE PROMOTION'S OTHER BRANCHES (OPS-2 review, 2026-09-30). Each leg below is
 * a mutation the first cut of these gates let through GREEN.
 * ------------------------------------------------------------------------- */

const jobIdOf = (response: BackupResponse): string =>
	(response.pfile as string).replace(/\.json$/, '');

describe.if(REAL_BYTES_READY)(
	'OPS-2: promotion — liveness, degradations, collisions, throttle',
	() => {
		test('g — the status record stays LIVE while the finished dump is verified, then says done', async () => {
			// THE FINDING: the record was a bare pfile owned by the pg_dump CHILD. After
			// pg_dump exited, the full read still had to run — and the widget's next poll
			// saw 'running' under a dead owner, ran the lazy reconcile, and reported a
			// SUCCESSFUL backup as 'interrupted: owning server process died'.
			const dir = join(scratch, 'liveness');
			mkdirSync(dir, { recursive: true });
			const gate = join(scratch, 'g_restore.release');
			const slow = restoreScript(
				'g_restore.sh',
				`if [ "$1" = "-f" ]; then i=0; while [ ! -f '${gate}' ] && [ $i -lt 600 ]; do sleep 0.05; i=$((i+1)); done; fi\nexec '${pgRestore}' "$@"`,
			);
			setMode('ok');
			hold();
			const dumpsBefore = lines(DUMP_LOG).length;
			const response = await start(dir, undefined, { pgRestoreBin: slow.bin });
			await dumpStarted(dumpsBefore + 1);
			release();
			// Wait until pg_dump has EXITED and the full read is blocked.
			const deadline = Date.now() + 15_000;
			while (!lines(slow.log).some((line) => line.startsWith('-f ')) && Date.now() < deadline) {
				await Bun.sleep(20);
			}
			expect(lines(slow.log).some((line) => line.startsWith('-f '))).toBe(true);
			const frames = [];
			for (let sample = 0; sample < 8; sample += 1) {
				frames.push(mediaJobs.frame(jobIdOf(response)));
				await Bun.sleep(60);
			}
			for (const frame of frames) {
				expect(frame?.is_running).toBe(true);
				expect(frame?.errors).toEqual([]);
			}
			expect(JSON.stringify(frames.at(-1)?.data)).toContain('Verifying backup');
			writeFileSync(gate, '');
			const record = await terminalRecord(response.pfile);
			expect(record.status).toBe('done');
			expect(record.errors).toEqual([]);
			expect(record.data.msg ?? '').toContain('verified_deep');
		});

		test('h — a full read that outruns its budget still PROMOTES a dump that exited 0, without a proof', async () => {
			// The mutation this kills: dropping `unverifiable_timeout` from the
			// promotable set retires EVERY large dump whose read is slow — the install
			// never holds a restore point, and the throttle keeps producing corpses.
			const dir = join(scratch, 'promote_timeout');
			mkdirSync(dir, { recursive: true });
			const listRealFullSleeps = restoreScript(
				'h_restore.sh',
				`if [ "$1" = "-f" ]; then exec sleep 10; fi\nexec '${pgRestore}' "$@"`,
			);
			setMode('ok');
			release();
			const response = await start(dir, undefined, {
				pgRestoreBin: listRealFullSleeps.bin,
				budgetMs: 1500,
			});
			const record = await terminalRecord(response.pfile);
			const final = response.file_path as string;
			// The FULL stage is the one that ran out (not --list).
			expect(lines(listRealFullSleeps.log).some((line) => line.startsWith('-f '))).toBe(true);
			expect(record.status).toBe('done');
			expect(record.data.msg ?? '').toContain('not verified (unverifiable_timeout)');
			expect(existsSync(final)).toBe(true);
			// …and nothing claims a proof it does not have (the reverse mutation).
			expect(existsSync(`${final}.verified`)).toBe(false);
			expect(existsSync(`${final}.failed`)).toBe(false);
			expect(partNames(dir)).toEqual([]);
		});

		test('q — a read killed from OUTSIDE still promotes a dump that exited 0, without a proof', async () => {
			// OPS-1 review, third round: only the bytes disprove. A promotion read the
			// OOM killer (or an EIO blip, or an old pg_restore) cut short says nothing
			// about the dump — exit 0 proved it complete. Dropping
			// `unverifiable_read_failed` from the promotable set retired this complete
			// dump as `.failed`, a name no scanner counts again.
			const dir = join(scratch, 'promote_read_failed');
			mkdirSync(dir, { recursive: true });
			const killedFullRead = restoreScript(
				'q_restore.sh',
				`if [ "$1" = "-f" ]; then kill -9 $$; fi\nexec '${pgRestore}' "$@"`,
			);
			setMode('ok');
			release();
			const response = await start(dir, undefined, { pgRestoreBin: killedFullRead.bin });
			const record = await terminalRecord(response.pfile);
			const final = response.file_path as string;
			expect(lines(killedFullRead.log).some((line) => line.startsWith('-f '))).toBe(true);
			expect(record.status).toBe('done');
			expect(record.data.msg ?? '').toContain('not verified (unverifiable_read_failed)');
			expect(readFileSync(final).equals(readFileSync(realArchive.path as string))).toBe(true);
			expect(existsSync(`${final}.verified`)).toBe(false);
			expect(existsSync(`${final}.failed`)).toBe(false);
			expect(partNames(dir)).toEqual([]);
		});

		test('i — a host with no pg_restore promotes a dump that exited 0, without a proof', async () => {
			const dir = join(scratch, 'promote_blind');
			mkdirSync(dir, { recursive: true });
			setMode('ok');
			release();
			const response = await start(dir, undefined, { pgRestoreBin: null });
			const record = await terminalRecord(response.pfile);
			const final = response.file_path as string;
			expect(record.status).toBe('done');
			expect(record.data.msg ?? '').toContain('not verified (unverifiable_no_pg_restore)');
			expect(readFileSync(final).equals(readFileSync(realArchive.path as string))).toBe(true);
			expect(existsSync(`${final}.verified`)).toBe(false);
			expect(existsSync(`${final}.failed`)).toBe(false);
		});

		test('j — a file that appears at the final name while the dump runs is never overwritten', async () => {
			const dir = join(scratch, 'name_taken');
			mkdirSync(dir, { recursive: true });
			setMode('ok');
			hold();
			const dumpsBefore = lines(DUMP_LOG).length;
			const response = await start(dir);
			await dumpStarted(dumpsBefore + 1);
			const final = response.file_path as string;
			const sentinel = 'an operator copied something here meanwhile';
			writeFileSync(final, sentinel);
			release();
			const record = await terminalRecord(response.pfile);
			expect(record.status).toBe('error');
			expect(readFileSync(final, 'utf-8')).toBe(sentinel);
			expect(existsSync(`${final}.failed`)).toBe(true);
			expect(readFileSync(`${final}.failed`).equals(readFileSync(realArchive.path as string))).toBe(
				true,
			);
			expect(partNames(dir)).toEqual([]);
		});

		test('k — the throttle skips only over a USABLE backup; a recent truncated dump does not suppress the next', async () => {
			// P0-13's throttle half: a regression to recency (newestBackupMtimeMs) makes
			// a 1-hour-old corpse suppress the nightly dump — the install then has no
			// restore point at all.
			const ageMs = 3_600_000;
			const truncDir = join(scratch, 'throttle_truncated');
			mkdirSync(truncDir, { recursive: true });
			const cut = join(truncDir, '2026-01-01_000000.zz.postgresql_-1_dbv7.custom.backup');
			const whole = readFileSync(realArchive.path as string);
			writeFileSync(cut, whole.subarray(0, Math.floor(whole.length * 0.6)));
			utimesSync(cut, new Date(Date.now() - ageMs), new Date(Date.now() - ageMs));
			setMode('ok');
			release();
			const dumped = await start(truncDir, undefined, {}, false);
			expect(dumped.ok).toBe(true);
			expect(dumped.msg).not.toContain('Skipped');
			await terminalRecord(dumped.pfile);

			// CONTROL: the same age over a COMPLETE archive skips.
			const cleanDir = join(scratch, 'throttle_clean');
			mkdirSync(cleanDir, { recursive: true });
			const clean = join(cleanDir, '2026-01-01_000000.zz.postgresql_-1_dbv7.custom.backup');
			writeFileSync(clean, whole);
			utimesSync(clean, new Date(Date.now() - ageMs), new Date(Date.now() - ageMs));
			const dumpsBefore = lines(DUMP_LOG).length;
			const skipped = await start(cleanDir, undefined, {}, false);
			expect(skipped.ok).toBe(true);
			expect(skipped.msg).toContain('Skipped backup');
			expect(lines(DUMP_LOG)).toHaveLength(dumpsBefore);
		});

		test('l — a throttle scan still verifying when the wait runs out means DUMP ANYWAY', async () => {
			const dir = join(scratch, 'throttle_pending');
			mkdirSync(dir, { recursive: true });
			const clean = join(dir, '2026-01-01_000000.zz.postgresql_-1_dbv7.custom.backup');
			writeFileSync(clean, readFileSync(realArchive.path as string));
			const hourAgo = new Date(Date.now() - 3_600_000);
			utimesSync(clean, hourAgo, hourAgo);
			const gate = join(scratch, 'l_restore.release');
			// Blocks every read past the panel wait (self-releasing after 30 s); the
			// warm-up `--version` passes straight through.
			const slow = restoreScript(
				'l_restore.sh',
				`if [ "$1" != "--version" ]; then i=0; while [ ! -f '${gate}' ] && [ $i -lt 600 ]; do sleep 0.05; i=$((i+1)); done; fi\nexec '${pgRestore}' "$@"`,
			);
			setMode('ok');
			release();
			try {
				const response = await start(dir, undefined, { pgRestoreBin: slow.bin }, false);
				expect(response.ok).toBe(true);
				expect(response.msg).not.toContain('Skipped');
				writeFileSync(gate, '');
				await terminalRecord(response.pfile, 60_000);
			} finally {
				writeFileSync(gate, '');
			}
		}, 60_000);
	},
);

/* ------------------------------------------------------------------------- *
 * THE REVIEW'S SECOND ROUND (2026-09-30): the poll handle of a QUEUED dump, the
 * adoption's exemption for this process's own parts, stop vs shutdown, and the
 * no-overwrite retirement. Each leg is a mutation the previous gates let through.
 * ------------------------------------------------------------------------- */

function pidIsAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function until(predicate: () => boolean, what: string, timeoutMs = 20_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() > deadline) throw new Error(`timed out waiting for: ${what}`);
		await Bun.sleep(30);
	}
}

/** The first SSE frame `get_process_status` streams for a handle — the client's own poll. */
async function firstPollFrame(pid: unknown, pfile: unknown): Promise<Record<string, unknown>> {
	const outcome = getUtilsProcessStatus(
		{
			dd_api: 'dd_utils_api',
			action: 'get_process_status',
			update_rate: 250,
			options: { pid, pfile },
		} as never,
		{ userId: SUPERUSER_ID, isGlobalAdmin: true, isDeveloper: false },
	);
	const reader = (outcome.stream as ReadableStream<Uint8Array>).getReader();
	const { value } = await reader.read();
	await reader.cancel();
	const text = new TextDecoder().decode(value);
	const body = text
		.split('data:\n')
		.map((part) => part.trim())
		.find((part) => part !== '');
	return JSON.parse(body as string) as Record<string, unknown>;
}

describe.if(REAL_BYTES_READY)('OPS-2: handle, ownership, stop, retirement', () => {
	test('n — a dump QUEUED behind a full maintenance lane still answers a pollable handle', async () => {
		// THE FINDING: the handle's pid was the pg_dump child's, which a queued job
		// does not have — `extend.pid: null`, which the client refuses to poll and
		// the server answers "pfile and pid are mandatory": "running", then nothing.
		const dir = join(scratch, 'queued_handle');
		mkdirSync(dir, { recursive: true });
		const gate = Promise.withResolvers<void>();
		const depth = mediaJobs.laneDepths().maintenance;
		for (let slot = depth.active; slot < depth.max; slot += 1) {
			mediaJobs.submit(
				'zz_backup_lane_blocker',
				async () => {
					await gate.promise;
					return true;
				},
				{ lane: 'maintenance', deadlineMs: 0 },
			);
		}
		let response: BackupResponse | null = null;
		try {
			expect(mediaJobs.laneDepths().maintenance.active).toBe(depth.max);
			setMode('ok');
			release();
			response = await start(dir);
			expect(response.ok).toBe(true);
			expect(mediaJobs.status(jobIdOf(response))?.status).toBe('queued');
			expect(typeof response.pid).toBe('number');
			const frame = await firstPollFrame(response.pid, response.pfile);
			expect(frame.errors).toEqual([]);
			expect(frame.is_running).toBe(true);
		} finally {
			gate.resolve();
		}
		const record = await terminalRecord((response as BackupResponse).pfile);
		expect(record.status).toBe('done');
	});

	test("r — the widget's dump job belongs to the CALLER; the file keeps the -1 grammar", async () => {
		// The job owner decides who may stream and stop the dump, and is who the
		// record says asked. The widget used to hand the FILE-NAME identity (-1,
		// root) to the job too, so every dump was root's whoever clicked. Driven
		// through the widget's own action, with the configured dir and binaries
		// pointed at scratch (asserted before the call, as an outcome).
		const dir = join(scratch, 'widget_owner');
		const binDir = join(scratch, 'widget_owner_bin');
		mkdirSync(dir, { recursive: true });
		mkdirSync(binDir, { recursive: true });
		symlinkSync(fakePgDump, join(binDir, 'pg_dump'));
		symlinkSync(countingRestore, join(binDir, 'pg_restore'));
		const REAL_CONFIG = { ...realConfigModule };
		setMode('ok');
		release();
		mock.module('../../src/config/config.ts', () => ({
			...REAL_CONFIG,
			config: {
				...REAL_CONFIG.config,
				ops: { ...REAL_CONFIG.config.ops, backupDir: dir, pgBinPath: binDir },
			},
		}));
		try {
			expect(backup.getBackupDir()).toBe(dir);
			expect(backup.resolvePgDump()).toBe(join(binDir, 'pg_dump'));
			const caller = 4242;
			const response = (await makeBackupWidget.apiActions?.make_psql_backup?.({}, {
				userId: caller,
			} as never)) as unknown as { extend: { pfile: string; file_path: string } };
			const jobId = response.extend.pfile.replace(/\.json$/, '');
			expect(mediaJobs.status(jobId)?.user_id).toBe(caller);
			expect(basename(response.extend.file_path)).toContain('.postgresql_-1_forced_');
			const record = await terminalRecord(response.extend.pfile);
			expect(record.status).toBe('done');
		} finally {
			mock.module('../../src/config/config.ts', () => REAL_CONFIG);
		}
	});

	test("o — adoption never judges this process's OWN live part, however old it looks", async () => {
		// A dump blocked on a lock sits quiet — its mtime can age past the orphan
		// threshold while it is very much alive. Mutation this kills: dropping the
		// `partsInFlight` exemption, which judges the live 2 KB prefix
		// `not_an_archive` and moves it aside from under its own pg_dump.
		const dir = join(scratch, 'own_live_part');
		mkdirSync(dir, { recursive: true });
		setMode('ok');
		hold();
		const dumpsBefore = lines(DUMP_LOG).length;
		const first = await start(dir, new Date(2026, 1, 1, 1, 1, 1));
		const livePart = await dumpStarted(dumpsBefore + 1);
		const twoDaysAgo = new Date(Date.now() - 48 * 3_600_000);
		utimesSync(livePart, twoDaysAgo, twoDaysAgo);
		const inode = statSync(livePart).ino;
		const readsBefore = lines(RESTORE_LOG).length;

		// A second dump into the same directory starts an adoption pass.
		const second = await start(dir, new Date(2026, 1, 1, 1, 1, 2));
		await backup.orphanAdoptionSettled(dir);
		expect(
			lines(RESTORE_LOG)
				.slice(readsBefore)
				.filter((line) => line.includes(livePart)),
		).toEqual([]);
		expect(statSync(livePart).ino).toBe(inode);
		expect(readdirSync(dir).filter((name) => name.includes('.orphaned'))).toEqual([]);

		release();
		expect((await terminalRecord(first.pfile)).status).toBe('done');
		expect((await terminalRecord(second.pfile)).status).toBe('done');
		expect(existsSync(first.file_path as string)).toBe(true);
	});

	test('p — a user STOP kills the dump and keeps its bytes; a server SHUTDOWN leaves pg_dump running', async () => {
		// A regression that killed on shutdown would destroy every in-progress backup
		// at each deploy restart, unobserved; one that ignored a stop would leave the
		// operator unable to cancel a dump.
		const dir = join(scratch, 'stop_vs_shutdown');
		mkdirSync(dir, { recursive: true });
		setMode('ok');
		hold();
		let dumpsBefore = lines(DUMP_LOG).length;
		const stopped = await start(dir, new Date(2026, 3, 1, 1, 1, 1));
		await dumpStarted(dumpsBefore + 1);
		const stoppedPid = Number(lines(PID_LOG)[dumpsBefore]);
		expect(pidIsAlive(stoppedPid)).toBe(true);
		expect(mediaJobs.stop(jobIdOf(stopped))).toBe(true);
		const stoppedFinal = stopped.file_path as string;
		await until(
			() => existsSync(`${stoppedFinal}.failed`) && !existsSync(`${stoppedFinal}.part`),
			'the stopped dump retired as .failed',
		);
		expect(pidIsAlive(stoppedPid)).toBe(false);
		expect(existsSync(stoppedFinal)).toBe(false);
		expect(statSync(`${stoppedFinal}.failed`).size).toBeGreaterThan(0);

		dumpsBefore = lines(DUMP_LOG).length;
		const survivor = await start(dir, new Date(2026, 3, 1, 1, 1, 2));
		await dumpStarted(dumpsBefore + 1);
		const survivorPid = Number(lines(PID_LOG)[dumpsBefore]);
		const survivorFinal = survivor.file_path as string;
		try {
			expect(mediaJobs.interruptLive('backup_inflight_native: simulated shutdown')).toContain(
				jobIdOf(survivor),
			);
			await Bun.sleep(400);
			expect(pidIsAlive(survivorPid)).toBe(true);
			expect(existsSync(`${survivorFinal}.part`)).toBe(true);
		} finally {
			release();
		}
		// It finishes; in production the adoption promotes it after the restart —
		// here this process's continuation is still alive and does it.
		await until(() => existsSync(survivorFinal), 'the surviving dump promoted');
		expect(readFileSync(survivorFinal).equals(readFileSync(realArchive.path as string))).toBe(true);
	});

	test('m — a retirement never overwrites an earlier failure kept under the same name', async () => {
		// THE FINDING: retireFailedArtifact unlinked an existing `<final>.failed`
		// before renaming onto it — a second failure under one name destroyed the
		// first one's bytes, while every header promised they are kept.
		const dir = join(scratch, 'retire_unique');
		mkdirSync(dir, { recursive: true });
		const NOW_M = new Date(2026, 2, 3, 4, 5, 6);
		setMode('fail');
		/** A failing dump at NOW_M, held until it has started (so the request answers with its pfile). */
		const failingRun = async (): Promise<BackupResponse> => {
			hold();
			const dumpsBefore = lines(DUMP_LOG).length;
			const response = await start(dir, NOW_M);
			await dumpStarted(dumpsBefore + 1);
			release();
			await terminalRecord(response.pfile);
			return response;
		};
		const firstRun = await failingRun();
		const final = firstRun.file_path as string;
		// Mark the first failure's bytes, so its survival is observable.
		writeFileSync(`${final}.failed`, 'the FIRST failure, kept for the operator');
		// A disproved file under the final name (our suffix, no archive magic): the
		// next dump's collision check retires it, then that dump fails too.
		writeFileSync(final, Buffer.alloc(64 * 1024));
		await failingRun();

		expect(readFileSync(`${final}.failed`, 'utf-8')).toBe(
			'the FIRST failure, kept for the operator',
		);
		const kept = readdirSync(dir)
			.filter((name) => name.startsWith(basename(final)) && name.includes('.failed'))
			.sort();
		expect(kept).toEqual(
			[
				`${basename(final)}.failed`,
				`${basename(final)}.failed.1`,
				`${basename(final)}.failed.2`,
			].sort(),
		);
		// The disproved file (zeros) and the second dump's bytes are both there.
		const sizes = kept.map((name) => statSync(join(dir, name)).size);
		expect(sizes).toContain(64 * 1024);
		expect(sizes.filter((size) => size === 2048)).toHaveLength(1);
		expect(existsSync(final)).toBe(false);
		expect(partNames(dir)).toEqual([]);
	});
});
