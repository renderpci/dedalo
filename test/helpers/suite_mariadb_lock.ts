/**
 * THE LANE LOCK of the suite MariaDB target (PUB-05) — serializes ensure (install,
 * start, provision) and stop across every process of one lane.
 *
 * libc `flock(2)` is the primitive. The KERNEL releases it when its holder's descriptor
 * closes, which includes the holder dying, so there is no stale lock to detect and
 * nothing to delete: `<root>/.lock` is never removed, and whatever it contains (the
 * last holder's pid, for a human) decides nothing.
 *
 * WHY NOT A PID FILE (the first version: O_EXCL create, then "holder dead → rm").
 * Racy by construction (review 2026-09-30): a waiter reading between another's create
 * and its pid write saw an empty file, called it stale and deleted a LIVE lock; two
 * waiters that both read a dead pid could each delete — the second deleting the
 * first's fresh lock. Either way two processes ran ensure on one lane (`install()`
 * rm-ing a datadir under a running `mariadb-install-db`, two `mariadbd` on one
 * datadir). Every "delete the stale lock" step has that shape; a kernel-released lock
 * has no such step.
 *
 * Portable across this project's targets — macOS (libSystem) and the glibc CI image,
 * measured 2026-09-30 in both: a second open description, even in the same process,
 * cannot take it; a spawned (detached) child does not inherit the descriptor; the lock
 * is free the moment the holder exits or is killed.
 *
 * THE LOCK FOLLOWS THE ROOT. A sweep takes the whole root (and `.lock` with it) off its
 * path in one rename while holding the lock. A process that was already queued holds a
 * descriptor on THAT file, so once the sweep releases it the flock succeeds on a lock
 * nobody else will ever take — over a lane that no longer exists. Every successful
 * flock is therefore re-validated: the descriptor must still be the file at
 * `<root>/.lock` (same device + inode). If it is not, the lock is dropped; a lane whose
 * root is gone throws (`SUITE_MARIADB_LANE_SWEPT`), a root re-created meanwhile is
 * retried on its own `.lock`. Held by suite_mariadb_target_native leg (l).
 *
 * A module of its own (node: + bun:ffi + the env-only paths) so a gate can exercise it
 * from child processes without importing the provisioner's `src/` graph. Held by
 * test/unit/suite_mariadb_target_native.test.ts leg (i).
 */

import { dlopen, FFIType } from 'bun:ffi';
import {
	closeSync,
	existsSync,
	fstatSync,
	openSync,
	readFileSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { suiteMariadbPaths } from './suite_mariadb_env.ts';

const LOCK_EX = 2;
const LOCK_NB = 4;
const LOCK_UN = 8;

let libc: { flock: (fd: number, operation: number) => number } | undefined;

function flock(fd: number, operation: number): number {
	if (libc === undefined) {
		const path = process.platform === 'darwin' ? '/usr/lib/libSystem.B.dylib' : 'libc.so.6';
		libc = dlopen(path, {
			flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
		}).symbols;
	}
	return libc.flock(fd, operation);
}

/** Named in the throw when a lane is swept while a process waits for its lock. */
export const SUITE_MARIADB_LANE_SWEPT = 'the lane was swept while this process waited for its lock';

/** True when `fd` is still the file at `path` (a sweep renames the root away under it). */
function isCurrent(fd: number, path: string): boolean {
	try {
		const held = fstatSync(fd);
		const current = statSync(path);
		return held.ino === current.ino && held.dev === current.dev;
	} catch {
		return false;
	}
}

function lastHolder(file: string): string {
	try {
		return readFileSync(file, 'utf8').trim() || 'unknown';
	} catch {
		return 'unknown';
	}
}

/**
 * Take this lane's lock (the lane root must exist); resolves to its release function.
 * Polls a non-blocking exclusive `flock` every 200 ms — a blocking call would stall
 * the event loop — and throws after `timeoutMs`. The provisioner passes a wait DERIVED
 * from the deadlines its holders run under (`suiteMariadbLockWaitMs`, leg (q)); the
 * default here serves a caller that holds it briefly.
 *
 * `onQueued` is called ONCE, when the first attempt found the lock held — i.e. while
 * this process holds a descriptor on the lock file. An OBSERVABLE "queued", so a gate
 * never assumes it after a sleep (leg (l)).
 */
export async function acquireSuiteMariadbLock(
	suiteDb?: string,
	timeoutMs = 180_000,
	onQueued?: () => void,
): Promise<() => void> {
	const paths = suiteMariadbPaths(suiteDb);
	if (!existsSync(paths.root))
		throw new Error(`suite_mariadb: no lane root at ${paths.root} — nothing to lock`);
	const deadline = Date.now() + timeoutMs;
	let fd: number;
	let queued = false;
	for (;;) {
		try {
			fd = openSync(paths.lockFile, 'a+');
		} catch (error) {
			if (!existsSync(paths.root))
				throw new Error(`suite_mariadb: ${SUITE_MARIADB_LANE_SWEPT} (${paths.root})`);
			throw error;
		}
		while (flock(fd, LOCK_EX | LOCK_NB) !== 0) {
			if (!queued) {
				queued = true;
				onQueued?.();
			}
			if (Date.now() > deadline) {
				closeSync(fd);
				throw new Error(
					`suite_mariadb: ${paths.lockFile} is held (last holder pid ${lastHolder(paths.lockFile)}) for over ${timeoutMs / 1000}s`,
				);
			}
			await Bun.sleep(200);
		}
		if (isCurrent(fd, paths.lockFile)) break;
		// Locked a file that is no longer this lane's: a sweep took the root away.
		flock(fd, LOCK_UN);
		closeSync(fd);
		if (!existsSync(paths.markerFile))
			throw new Error(`suite_mariadb: ${SUITE_MARIADB_LANE_SWEPT} (${paths.root})`);
	}
	writeFileSync(paths.lockFile, `${process.pid}\n`); // diagnostics only — decides nothing
	let released = false;
	return () => {
		if (released) return;
		released = true;
		flock(fd, LOCK_UN);
		closeSync(fd);
	};
}
