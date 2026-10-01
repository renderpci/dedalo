/**
 * SWEEP MANY SUITE MARIADB LANES at once — the shard runner's teardown (PUB-05 review
 * 2026-09-30, S2).
 *
 * `bun run test:shard` gives each bin `DEDALO_TEST_DATABASE=<template>__shard<N>`, so the
 * first MariaDB gate a shard runs installs and starts a DETACHED `mariadbd` under
 * `../private/test_mariadb/<template>__shard<N>`. `sweepShardClones`
 * (scripts/lib/test_shard_db.ts) hands this module its own shard-name grammar, so the
 * name is never re-typed here, and gets back what it may report: each MARKED lane root
 * the matcher names is stopped and removed (`sweepSuiteMariadb`); an UNMARKED one is
 * refused, kept, and reported — the caller's red, never a silent skip. A MARKED root whose
 * sweep FAILS (a held lock, an rm error) is a third outcome, `failed`, carrying the real
 * error: calling it "refused" made the shard runner print a false "no marker — the suite
 * did not create it" for a lane the suite did create (review 2026-09-30). A lane whose
 * root is gone but whose KILLED sweep left `.<lane>.swept-…` behind — or whose KILLED
 * claim left `.<lane>.claim-…` (a dead pid) — is swept too, so the leftover is collected
 * (`sweepSuiteMariadb`).
 *
 * THE ONE LISTER OF THE LANE BASE. Every listing of `../private/test_mariadb/` — the
 * lanes a shard sweep visits, the leftovers a lane's sweep collects, what a gate reads
 * back to see what a sweep left — goes through `suiteMariadbLaneEntries()`, whose root
 * is this module's own (never a caller's argument). So the sweep also lives here
 * (`sweepSuiteMariadb`), not in test/helpers/suite_mariadb.ts: every gate that acquires
 * the suite target imports that helper, and a listing there made each of them a walker
 * of a root it does not choose (census_derivation_tripwire; PUB-05 review 2026-09-30).
 * The helper keeps the LOCKED half (`detachSuiteMariadbRoot`: stop + rename under the
 * lane lock); this module lists, refuses, and deletes marker-last.
 *
 * Held by test/unit/suite_mariadb_target_native.test.ts (legs (k)–(m), (r), "lane
 * sweep") and test/unit/shard_mariadb_sweep_native.test.ts (the shard sweep, floored on
 * this lister).
 */

import { existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { detachSuiteMariadbRoot, laneLeftoverOf } from './suite_mariadb.ts';
import {
	SUITE_MARIADB_MARKER_FILE,
	type SuiteMariadbPaths,
	suiteMariadbPaths,
} from './suite_mariadb_env.ts';
import { testDatabaseName } from './test_database.ts';

/** `../private/test_mariadb/` — where every lane root and its leftovers live (lane-independent). */
function laneBase(): string {
	return dirname(suiteMariadbPaths(testDatabaseName()).root);
}

/**
 * Every entry of the lane base, sorted — lane roots (`<lane>`) and the leftovers beside
 * them (`.<lane>.swept-…`, `.<lane>.claim-…`); empty when the base does not exist yet.
 * The root is this module's: a caller narrows the NAMES it reads, never the directory.
 */
export function suiteMariadbLaneEntries(): string[] {
	const base = laneBase();
	return existsSync(base) ? readdirSync(base).sort() : [];
}

/**
 * Delete a lane root that is OFF its path (a sweep's trash), marker LAST: interrupted at
 * any point, what remains still carries `.dedalo_test_mariadb` (or is empty), so the
 * next sweep can finish it. Refuses — keeps — a non-empty directory without the marker.
 */
function removeMarkedTree(dir: string): boolean {
	if (!existsSync(dir)) return true;
	const entries = readdirSync(dir);
	if (entries.length > 0 && !entries.includes(SUITE_MARIADB_MARKER_FILE)) return false;
	for (const entry of entries)
		if (entry !== SUITE_MARIADB_MARKER_FILE)
			rmSync(join(dir, entry), { recursive: true, force: true });
	rmSync(join(dir, SUITE_MARIADB_MARKER_FILE), { force: true });
	rmSync(dir, { recursive: true, force: true });
	return true;
}

/** Collect every leftover of a KILLED sweep or claim of `lane` (see `removeMarkedTree`). */
function collectSweptTrash(paths: SuiteMariadbPaths): void {
	const base = dirname(paths.root);
	for (const entry of suiteMariadbLaneEntries()) {
		const leftover = laneLeftoverOf(entry);
		if (leftover?.lane !== paths.suiteDb || !leftover.collectable) continue;
		if (!removeMarkedTree(join(base, entry)))
			console.warn(
				`suite_mariadb: kept ${join(base, entry)} — shaped like a leftover of ${paths.suiteDb} but it carries no ${SUITE_MARIADB_MARKER_FILE}`,
			);
	}
}

/**
 * SWEEP a lane: stop its server and delete its whole root (datadir, logs, ledger) —
 * for a disposable lane (a shard clone) or a rebuild (`test:db:setup`). Deletes ONLY a
 * root that carries `.dedalo_test_mariadb`, the file the suite writes when it creates
 * one; any other directory at that path is refused, loudly, untouched (the media
 * root's rule). A lane with no root is a no-op (beyond collecting a killed sweep's
 * leftovers).
 *
 * ATOMIC, UNDER THE LANE LOCK (review 2026-09-30, S3). `rmSync(root)` unlinks the marker
 * first, so a sweep killed mid-rm used to leave an UNMARKED root that every later sweep
 * refused and every ensure threw on; and the rm ran after the lock was released, so a
 * process queued on the lock took it over a root being deleted. Now the stop AND a
 * same-directory `rename` of the root to `.<lane>.swept-<pid>-<ms>` happen while the lock
 * is held (`detachSuiteMariadbRoot`) — the lane path is marked until the instant it is
 * absent — and the trash is deleted marker-last after the release; a queued process
 * re-validates its lock and is told the lane was swept (`suite_mariadb_lock.ts`). Held
 * by suite_mariadb_target_native legs (k), (l), (m).
 */
export async function sweepSuiteMariadb(
	suiteDb?: string,
): Promise<{ stopped: boolean; removed: boolean }> {
	const paths = suiteMariadbPaths(suiteDb);
	collectSweptTrash(paths);
	if (!existsSync(paths.root)) {
		rmSync(paths.socketDir, { recursive: true, force: true });
		return { stopped: false, removed: false };
	}
	if (!existsSync(paths.markerFile))
		throw new Error(
			`suite_mariadb: REFUSING to sweep ${paths.root} — it carries no ${SUITE_MARIADB_MARKER_FILE}, so the suite did not create it. Nothing was stopped or deleted.`,
		);
	const trash = join(dirname(paths.root), `.${paths.suiteDb}.swept-${process.pid}-${Date.now()}`);
	const { stopped } = await detachSuiteMariadbRoot(paths, trash);
	removeMarkedTree(trash);
	return { stopped, removed: true };
}

/** What a lane sweep did: removed, refused (no marker — not the suite's), or failed (marked, with the error). */
export interface SuiteMariadbLanesSweep {
	swept: string[];
	refused: string[];
	failed: { lane: string; error: string }[];
}

/** Sweep every lane root under `../private/test_mariadb/` whose lane name `match`es. */
export async function sweepSuiteMariadbLanes(
	match: (lane: string) => boolean,
): Promise<SuiteMariadbLanesSweep> {
	const report: SuiteMariadbLanesSweep = { swept: [], refused: [], failed: [] };
	const entries = suiteMariadbLaneEntries();
	for (const entry of entries) {
		// A KILLED sweep's or claim's leftover of a lane whose root is already gone (or was
		// never renamed in): the lane's own sweep collects it — a root-less lane is
		// otherwise never visited. A claim whose pid still lives is building it: skipped.
		const leftover = laneLeftoverOf(entry);
		if (leftover === null || !leftover.collectable) continue;
		const { lane } = leftover;
		if (!match(lane) || entries.includes(lane)) continue;
		try {
			await sweepSuiteMariadb(lane);
		} catch (error) {
			report.failed.push({ lane, error: error instanceof Error ? error.message : String(error) });
		}
	}
	for (const lane of entries) {
		if (!match(lane)) continue;
		try {
			// Refusal is decided HERE, by the marker, before anything is attempted — so a
			// "refused" is always the true "the suite did not create it".
			if (!existsSync(suiteMariadbPaths(lane).markerFile)) {
				report.refused.push(lane);
				continue;
			}
			const { removed } = await sweepSuiteMariadb(lane);
			if (removed) report.swept.push(lane);
		} catch (error) {
			report.failed.push({ lane, error: error instanceof Error ? error.message : String(error) });
		}
	}
	return report;
}
