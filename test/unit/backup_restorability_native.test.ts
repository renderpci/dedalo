/**
 * RESTORE-POINT CENSUS (audit P0-13 / DATA "a backup must be a verified restore
 * point", 2026-08-30) — the artifact-state axis, on REAL custom-format bytes.
 *
 * THE DEFECT THIS GATE EXISTS FOR. Until 2026-08-30 the only question this
 * engine asked of a backup artifact was `existsSync(file) && statSync(file).size
 * > 0` (`artifactIsUsable`, deleted with the same audit item). A pg_dump killed
 * at 60% leaves a LARGE, NON-EMPTY, PERFECTLY FRESH file: it passed that check,
 * it was the newest mtime in the directory, and so
 * `core/update/preconditions.ts backupFreshness()` — the gate that since
 * 2026-08-23 turns "no backup" into a REFUSAL for a code update — reported a
 * restore point. The operator was told they were ready and replaced the whole
 * code tree with no way back. The pre-existing gate (test/unit/ops_backup.test.ts)
 * pinned only the ZERO-BYTE and the CLEAN artifact, which is exactly why the
 * truncated case shipped: the census over artifact STATES had a hole in the
 * middle.
 *
 * WHAT MAKES THIS GATE DIFFERENT FROM ops_backup.test.ts, and why both exist:
 * that file drives `initBackupSequence` with a FAKE pg_dump, so its "archives"
 * are invented byte strings and it says so in its own header ("what is NOT
 * covered here: a REAL custom-format archive truncated mid-data"). This file
 * closes precisely that: it makes pg_dump — the one `resolvePgDump()` picks, so
 * the binary a real backup would use — write a REAL custom-format archive from
 * the SUITE database (a READ; nothing here writes to Postgres), and cuts it.
 * A truncated archive is therefore a real file prefix, never a hand-made
 * lookalike, because the whole finding is about what pg_restore can and cannot
 * see in real archive bytes.
 *
 * MEASURED HERE, 2026-08-30, pg 18.4 / pg_restore 18, `-t dd_ontology` out of
 * the suite database (842 KB archive, 51 TOC entries): `pg_restore --list` on
 * the archive cut to 60% lists ALL 51 entries and exits 0 — the cheap pass
 * cannot see truncation at all — while `pg_restore -f /dev/null` fails on it
 * with "could not read from input file: end of file". Building the archive
 * costs ~0.2 s and every verification of it is milliseconds, which is why this
 * census can afford real bytes for every state.
 *
 * THE CENSUS IS TOTAL BY DERIVATION, not by enumeration: the last describe
 * parses the `BackupVerdictReason` union out of backup.ts's source and requires
 * every member to be either exercised below or carry a written exemption. Add a
 * verdict reason to the engine and this gate goes red until the census covers
 * it.
 *
 * THE NEGATIVE CONTROL IS LOAD-BEARING. A gate written because a bad backup
 * passed becomes a far worse outage the day it refuses a GOOD one: the operator
 * then cannot update at all, and the pressure is to waive the check. So the
 * clean real archive is asserted through the same three surfaces as every
 * refusal — verdict, `newestUsableBackup`, `backupFreshness` — and must come
 * back usable, VERIFIED, counted and not stale.
 *
 * OPS-1 (2026-09-30): there is ONE verdict now, the full read. The cheap
 * `verified_toc` verdict is gone, and a read that outruns its budget is NOT a
 * backup (`unverifiable_timeout`, usable:false) — both exercised below.
 *
 * WHAT THIS GATE DOES NOT PROVE, stated rather than implied:
 * - It does not touch the make_backup WIDGET LIST. `getBackupFiles(dir)` now
 *   takes a directory, and a dump THIS engine runs is only ever listed once
 *   promoted (backup_inflight_native.test.ts), but a corpse left by a FOREIGN job
 *   under a `*.backup` name is still listed as a file. Closing that needs a
 *   `usable` key in the make_backup payload, which is a wire-shape change with a
 *   WC entry and a client pass.
 * - It does not prove a RESTORE works — that is the restore door's own gate
 *   (restore_door_native.test.ts).
 * - It says nothing about the freshness THRESHOLD — that is backupFreshness's
 *   own arithmetic, gated in backup_freshness_deep_native.test.ts.
 * - Without a reachable suite Postgres the real-bytes describe SKIPS (loudly,
 *   `describe.if`) instead of passing empty; the derivation census still runs.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import {
	chmodSync,
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	type BackupVerdictReason,
	newestUsableBackup,
	resolvePgRestore,
	verifyBackupArtifact,
} from '../../src/core/area_maintenance/backup.ts';
import { backupFreshness } from '../../src/core/update/preconditions.ts';
import {
	ageMinutes,
	buildRealArchive,
	truncatedCopy as cutArchive,
} from '../helpers/real_backup_archive.ts';

const scratch = mkdtempSync(join(tmpdir(), 'dedalo_restorability_'));
afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * A REAL custom-format archive of `dd_ontology` out of the SUITE database, built
 * with the engine's OWN `resolvePgDump()` (test/helpers/real_backup_archive.ts):
 * on a host carrying several majors, a pg_dump older than the server refuses
 * outright, and the archive must be readable by the pg_restore
 * `verifyBackupArtifact` will pick — both resolvers walk the same candidate
 * order (backup.ts pgBinCandidates).
 */
const realArchive = buildRealArchive(scratch);
const pgRestoreBin = resolvePgRestore();
/**
 * Gate at COLLECTION time (`describe.if`), never with an early `return` inside a
 * test body: a body that returns reports a PASS having asserted nothing, which
 * is the green-suite trap (S2-40) and is worse than a red, because it is
 * indistinguishable from a gate that ran.
 */
const REAL_BYTES_READY = realArchive.path !== null && pgRestoreBin !== null;
if (!REAL_BYTES_READY) {
	console.warn(
		`[backup_restorability] real-archive cases SKIPPED (not passed): ${
			pgRestoreBin === null ? 'no pg_restore on this host; ' : ''
		}${realArchive.note}`,
	);
}

/** A fresh directory per state, so `newestUsableBackup` answers about one file. */
function stateDir(name: string): string {
	const dir = join(scratch, `state_${name}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

/** The first `fraction` of the real archive — a real prefix, never an invention. */
function truncatedCopy(target: string, fraction: number): void {
	cutArchive(realArchive.path as string, target, fraction);
}

/** A pg_restore stand-in that never finishes (`exec`, so the kill reaches the pipe holder). */
function sleepingRestore(): string {
	const path = join(scratch, 'sleeping_pg_restore.sh');
	writeFileSync(path, '#!/bin/sh\nexec sleep 5\n');
	chmodSync(path, 0o755);
	return path;
}

/**
 * The REALISTIC timeout: the real `--list` (0.03 s in production) passes and the
 * FULL read (~7.4 s/GB) is the stage that runs out. The stand-in above times out
 * at `--list` and never reaches the full-read branch.
 */
function fullReadSleepsRestore(): string {
	const path = join(scratch, 'full_read_sleeps_pg_restore.sh');
	writeFileSync(
		path,
		`#!/bin/sh\nif [ "$1" = "-f" ]; then exec sleep 10; fi\nexec '${pgRestoreBin ?? 'pg_restore'}' "$@"\n`,
	);
	chmodSync(path, 0o755);
	// Warm the first exec (macOS provenance scan) so the real --list fits its budget.
	Bun.spawnSync([path, '--version'], { stdout: 'ignore', stderr: 'ignore' });
	return path;
}

/** The real `--list` passes; the FULL read's process is SIGKILLed from outside. */
function killedFullReadRestore(): string {
	const path = join(scratch, 'killed_full_read_pg_restore.sh');
	writeFileSync(
		path,
		`#!/bin/sh\nif [ "$1" = "-f" ]; then kill -9 $$; fi\nexec '${pgRestoreBin ?? 'pg_restore'}' "$@"\n`,
	);
	chmodSync(path, 0o755);
	return path;
}

interface ArtifactState {
	/** The physical situation an operator's backup directory can be in. */
	state: string;
	/** What the engine must call it. */
	reason: BackupVerdictReason;
	/** May it count as a restore point? */
	usable: boolean;
	/** Was it PROVEN restorable (a stronger claim than usable)? */
	verified: boolean;
	/** Builds the artifact and returns its path (the path may not exist). */
	build(dir: string): string;
	/** How the three surfaces are asked (default: the production verification). */
	verify?: { pgRestoreBin?: string | null; budgetMs?: number };
}

/**
 * THE CENSUS over artifact states. `absent`, `empty` and `clean` were the only
 * ones anything pinned before P0-13; the three in between are where a museum
 * loses its last copy.
 */
const STATES: ArtifactState[] = [
	{
		state: 'absent',
		reason: 'missing',
		usable: false,
		verified: false,
		build: (dir) => join(dir, 'never-written.custom.backup'),
	},
	{
		state: 'empty',
		reason: 'empty',
		usable: false,
		verified: false,
		build: (dir) => {
			// What a pg_dump that dies at connect leaves behind.
			const path = join(dir, 'zero-byte.custom.backup');
			writeFileSync(path, '');
			ageMinutes(path, 10);
			return path;
		},
	},
	{
		state: 'in_progress',
		// `truncated`, not `in_progress`, and that is the honest verdict: a dump
		// still being written IS a partial archive, the deep read says so, and the
		// engine reports what it PROVED rather than what it guessed from an mtime.
		// The `in_progress` reason survives only for a host that cannot verify at
		// all (no pg_restore, or a format this binary will not read), where age is
		// the best answer available — that branch is covered separately.
		reason: 'truncated',
		usable: false,
		verified: false,
		build: (dir) => {
			// WHAT A DUMP STILL BEING WRITTEN ACTUALLY LOOKS LIKE ON DISK: a partial
			// archive with a mtime of now. An earlier version of this fixture used a
			// COMPLETE archive with a fresh mtime and called it "indistinguishable,
			// from the outside, from a dump still being written". It is distinguishable,
			// and pinning the guess instead of the property cost an outage: the engine
			// refused every finished backup for the first 90 seconds of its life, so an
			// operator who took a backup and immediately tried to update was told there
			// was no restore point.
			//
			// Measured 2026-08-30 on a 7.6 MB custom dump cut to 60%: `pg_restore
			// --list` exits 0 — the TOC is at the FRONT and the data blocks are never
			// read — while `pg_restore -f /dev/null` exits 1, "could not read from
			// input file: end of file". So the deep read answers it, and the age
			// heuristic survives only on a host that cannot run pg_restore at all.
			const path = join(dir, 'being-written.custom.backup');
			const whole = readFileSync(realArchive.path as string);
			writeFileSync(path, whole.subarray(0, Math.floor(whole.length * 0.6)));
			return path;
		},
	},
	{
		state: 'truncated',
		reason: 'truncated',
		usable: false,
		verified: false,
		build: (dir) => {
			// THE FINDING. Big, non-empty, fresh, a valid header and a complete
			// TOC — everything the deleted `existsSync && size > 0` looked at.
			const path = join(dir, 'died-at-60-percent.custom.backup');
			truncatedCopy(path, 0.6);
			ageMinutes(path, 10);
			return path;
		},
	},
	{
		state: 'header_cut',
		reason: 'not_an_archive',
		usable: false,
		verified: false,
		build: (dir) => {
			// A dump killed early enough to cut the TOC itself: the cheap pass
			// already catches this one, and it must not be mistaken for the
			// state above — different bytes, different layer, both refused.
			const path = join(dir, 'died-at-the-header.custom.backup');
			truncatedCopy(path, 0.002);
			ageMinutes(path, 10);
			return path;
		},
	},
	{
		state: 'foreign_format',
		reason: 'unverifiable_foreign_format',
		usable: true,
		verified: false,
		build: (dir) => {
			// An install whose *.backup files are plain-SQL dumps must keep
			// behaving exactly as it did before P0-13: counted, never claimed
			// as proven. Refusing a format we never claimed to verify would be
			// an outage caused by the guard. (A name OUTSIDE our `.custom.backup`
			// suffix — that one is our grammar, see 'own_suffix_zero_filled'.)
			const path = join(dir, 'plain-sql-dump.backup');
			writeFileSync(path, '--\n-- PostgreSQL database dump\n--\nSET statement_timeout = 0;\n');
			ageMinutes(path, 10);
			return path;
		},
	},
	{
		state: 'own_suffix_zero_filled',
		reason: 'not_an_archive',
		usable: false,
		verified: false,
		build: (dir) => {
			// What a crash can leave under OUR name: the size of a dump, none of its
			// bytes. It used to be `unverifiable_foreign_format` → usable, and the
			// unwaived code update proceeded with no restorable dump.
			const path = join(dir, 'zero-filled.custom.backup');
			writeFileSync(path, Buffer.alloc(64 * 1024));
			ageMinutes(path, 10);
			return path;
		},
	},
	{
		state: 'full_read_outran_budget',
		reason: 'unverifiable_timeout',
		usable: false,
		verified: false,
		// The --list stage passes; the FULL read outruns a 1.5 s budget.
		verify: { pgRestoreBin: fullReadSleepsRestore(), budgetMs: 1500 },
		build: (dir) => {
			const path = join(dir, 'complete-slow-to-read.custom.backup');
			copyFileSync(realArchive.path as string, path);
			ageMinutes(path, 10);
			return path;
		},
	},
	{
		state: 'unproven_in_budget',
		reason: 'unverifiable_timeout',
		usable: false,
		verified: false,
		// OPS-1: a read that could not finish PROVED NOTHING, so it is not a backup —
		// it used to be `usable: true`, which failed OPEN on every archive too big
		// to read inside a constant 120 s. A complete archive, judged by a
		// pg_restore that never finishes inside a 200 ms budget.
		verify: { pgRestoreBin: sleepingRestore(), budgetMs: 200 },
		build: (dir) => {
			const path = join(dir, 'complete-but-unread.custom.backup');
			copyFileSync(realArchive.path as string, path);
			ageMinutes(path, 10);
			return path;
		},
	},
	{
		state: 'read_killed_from_outside',
		reason: 'unverifiable_read_failed',
		usable: false,
		verified: false,
		// A COMPLETE archive whose full read is killed by a signal WE did not send
		// (the OOM killer, an operator). It used to read `truncated` — a cached
		// disproof of a good backup, retired on the next name collision. A killed
		// read proves nothing either way (OPS-1 review).
		verify: { pgRestoreBin: killedFullReadRestore() },
		build: (dir) => {
			const path = join(dir, 'complete-read-killed.custom.backup');
			copyFileSync(realArchive.path as string, path);
			ageMinutes(path, 10);
			return path;
		},
	},
	{
		state: 'clean',
		reason: 'verified_deep',
		usable: true,
		verified: true,
		build: (dir) => {
			// THE NEGATIVE CONTROL: a real, complete archive.
			const path = join(dir, 'complete.custom.backup');
			copyFileSync(realArchive.path as string, path);
			ageMinutes(path, 10);
			return path;
		},
	},
];

describe.if(REAL_BYTES_READY)('restore-point census over artifact states (P0-13)', () => {
	for (const artifact of STATES) {
		test(`'${artifact.state}' is judged '${artifact.reason}' by all three surfaces`, async () => {
			const dir = stateDir(artifact.state);
			const path = artifact.build(dir);

			// 1. THE VERDICT — the successor to the deleted `artifactIsUsable`.
			const verdict = await verifyBackupArtifact(path, artifact.verify ?? {});
			expect(verdict.reason).toBe(artifact.reason);
			expect(verdict.usable).toBe(artifact.usable);
			expect(verdict.verified).toBe(artifact.verified);

			// 2. THE DIRECTORY SCAN — what the panel's scope and the code-update
			//    precondition both read. A refused artifact must not merely be
			//    unproven: it must not be the answer to "have we got a backup".
			const scan = await newestUsableBackup(dir, artifact.verify ?? {});
			if (artifact.usable) {
				expect(scan.mtimeMs).toBeGreaterThan(0);
				expect(scan.verdict?.filePath).toBe(path);
			} else {
				expect(scan.mtimeMs).toBe(0);
				expect(scan.verdict).toBeNull();
			}

			// 3. THE UPDATE GATE — backupFreshness() is the pipeline's own
			//    predicate, called here exactly as core/update/status.ts's
			//    backup_fresh check and checkUpdatePreconditions call it. An
			//    unusable artifact must leave `hours` null (which is what the
			//    code update turns into `update.refused`), never a fresh age.
			const freshness = await backupFreshness(dir, artifact.verify ?? {});
			if (artifact.usable) {
				expect(freshness.hours).not.toBeNull();
				expect(freshness.stale).toBe(false);
				expect(freshness.verified).toBe(artifact.verified);
			} else {
				expect(freshness.hours).toBeNull();
				expect(freshness.stale).toBe(true);
				expect(freshness.verified).toBe(false);
				// …and the operator is told WHICH file was refused and why —
				// the difference between making a new backup and hunting a
				// phantom. (`absent` has nothing to name.)
				if (artifact.state === 'absent') {
					expect(freshness.rejected).toHaveLength(0);
				} else {
					expect(freshness.rejected[0]?.reason).toBe(artifact.reason);
					expect(freshness.rejected[0]?.filePath).toBe(path);
				}
			}
		});
	}

	test('a TOC pass ACCEPTS the truncated archive — which is why the ONE verdict reads it all', async () => {
		// The measured fact the whole finding rests on, asserted on real bytes:
		// `pg_restore --list` walks a header and TOC that the 60% cut left intact
		// and exits 0. Until OPS-1 that pass produced a `verified_toc` "usable"
		// verdict, and the freshness path asked it — so the code-update refusal
		// inherited exactly this blindness. Asked directly here, raw:
		const dir = stateDir('toc_vs_deep');
		const path = join(dir, 'died-at-60-percent.custom.backup');
		truncatedCopy(path, 0.6);
		ageMinutes(path, 10);

		const list = Bun.spawnSync([pgRestoreBin as string, '--list', path], {
			stdout: 'ignore',
			stderr: 'ignore',
		});
		expect(list.exitCode).toBe(0);

		// …while the engine's one verdict reads the data blocks and disproves it.
		const verdict = await verifyBackupArtifact(path);
		expect(verdict.reason).toBe('truncated');
		expect(verdict.usable).toBe(false);
		expect(verdict.detail ?? '').toContain('end of file'); // pg_restore's own words
		// A decisive verdict is cached — and it is the DEEP one.
		const sidecar = JSON.parse(readFileSync(`${path}.verified`, 'utf-8')) as { reason: string };
		expect(sidecar.reason).toBe('truncated');
	});

	test('pg_restore is actually RUN: --list first, then the whole-archive read', async () => {
		// Without this the census could be satisfied by any predicate that
		// happened to agree with it — the audit asks for the verification to
		// HAPPEN. The wrapper records argv and then execs the real binary, so
		// the verdict it produces is still pg_restore's.
		const log = join(scratch, 'pg_restore_argv.log');
		const wrapper = join(scratch, 'pg_restore_wrapper.sh');
		writeFileSync(
			wrapper,
			`#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\nexec '${pgRestoreBin}' "$@"\n`,
		);
		chmodSync(wrapper, 0o755);

		const dir = stateDir('observed');
		const path = join(dir, 'complete.custom.backup');
		copyFileSync(realArchive.path as string, path);
		ageMinutes(path, 10);

		const verdict = await verifyBackupArtifact(path, { pgRestoreBin: wrapper });
		expect(verdict.reason).toBe('verified_deep');

		const calls = readFileSync(log, 'utf-8').trim().split('\n');
		expect(calls).toHaveLength(2);
		expect(calls[0]).toBe(`--list ${path}`);
		expect(calls[1]).toBe(`-f /dev/null ${path}`);
	});

	test('DEGRADATION IS NOT REFUSAL: a host with no pg_restore still has a backup', async () => {
		// A guard that fires on a legitimate path is an outage. On a host that
		// cannot LOOK at the archive, the real, complete archive keeps counting
		// exactly as it did before P0-13 — unproven, but counted.
		const dir = stateDir('blind_host');
		const path = join(dir, 'complete.custom.backup');
		copyFileSync(realArchive.path as string, path);
		ageMinutes(path, 10);

		const verdict = await verifyBackupArtifact(path, { pgRestoreBin: null });
		expect(verdict.reason).toBe('unverifiable_no_pg_restore');
		expect(verdict.usable).toBe(true);
		expect(verdict.verified).toBe(false);
	});
});

/* ------------------------------------------------------------------------- *
 * DERIVATION: the census above must stay TOTAL, and the recency primitive must
 * stay out of the "have we got a backup" question.
 * ------------------------------------------------------------------------- */

const BACKUP_SOURCE = join(import.meta.dir, '../../src/core/area_maintenance/backup.ts');

/** Which case in this file exercises each verdict reason. */
const COVERED: Record<string, string> = {
	missing: "STATES 'absent'",
	empty: "STATES 'empty'",
	in_progress:
		"STATES 'in_progress' pins that a partial write reads `truncated`; the reason itself (a file that MOVED during its read) is backup_freshness_deep_native leg I",
	truncated: "STATES 'truncated' + the TOC-vs-deep case",
	not_an_archive: "STATES 'header_cut' + 'own_suffix_zero_filled'",
	unverifiable_foreign_format: "STATES 'foreign_format'",
	unverifiable_timeout:
		"STATES 'unproven_in_budget' (the --list stage) + 'full_read_outran_budget' (the FULL read) (+ backup_freshness_deep_native legs C, K)",
	verified_deep: "STATES 'clean' (the negative control)",
	unverifiable_no_pg_restore: 'the blind-host degradation case',
	unverifiable_read_failed:
		"STATES 'read_killed_from_outside' (+ backup_freshness_deep_native legs P1, P2, P4: an I/O error, a failure that did not repeat, a pg_restore older than the archive)",
};

/**
 * SHRINK-ONLY, one written reason each. Not a place to park inconvenience: a
 * reason listed here is a reason NOTHING proves. (Empty since OPS-1 made the
 * budget injectable and `unverifiable_timeout` moved to COVERED.)
 */
const EXEMPT: Record<string, string> = {};

describe('the census is derived from the engine, not enumerated here', () => {
	test('every BackupVerdictReason is exercised or exempted with a reason', () => {
		const source = readFileSync(BACKUP_SOURCE, 'utf-8');
		const union = source.match(/export type BackupVerdictReason =([\s\S]*?);\n/);
		expect(union).not.toBeNull();
		const reasons = [...(union?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map(
			(match) => match[1] as string,
		);
		// A parse that silently found nothing would make this test vacuously
		// green — the exact failure mode the gate is meant to prevent.
		expect(reasons.length).toBeGreaterThan(5);

		const accounted = new Set([...Object.keys(COVERED), ...Object.keys(EXEMPT)]);
		expect(reasons.filter((reason) => !accounted.has(reason))).toEqual([]);
		// And nothing accounted for here may have disappeared from the engine:
		// a stale entry would advertise coverage of a state that cannot occur.
		expect([...accounted].filter((reason) => !reasons.includes(reason))).toEqual([]);
		// An exemption is never also a claim of coverage.
		expect(Object.keys(EXEMPT).filter((reason) => reason in COVERED)).toEqual([]);
	});

	test('no production code asks RECENCY where it must ask USABILITY', () => {
		// `newestBackupMtimeMs` is the honest answer to "when was something last
		// written here" and nothing more: a dump that died at 60%, and one being
		// written right now, both own the freshest mtime. It has no production
		// caller left (the throttle and core/update/preconditions.ts moved to
		// newestUsableBackup on 2026-08-30) and must not acquire one — that is
		// how the finding came back into the update gate the first time.
		const src = join(import.meta.dir, '../../src');
		const offenders: string[] = [];
		const walk = (dir: string): void => {
			for (const entry of readdirSync(dir, { withFileTypes: true })) {
				const path = join(dir, entry.name);
				if (entry.isDirectory()) {
					walk(path);
					continue;
				}
				if (!entry.name.endsWith('.ts')) continue;
				if (path === BACKUP_SOURCE) continue; // its definition and its own doc
				if (readFileSync(path, 'utf-8').includes('newestBackupMtimeMs')) offenders.push(path);
			}
		};
		walk(src);
		expect(offenders).toEqual([]);
	});
});
