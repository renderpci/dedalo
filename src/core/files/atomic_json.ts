/**
 * THE ATOMIC JSON STATE-FILE KERNEL — the ONE reader/writer/lock for the small JSON state
 * files an operator relies on under <private> (the publication-host registry and its runtime
 * results today). Extracted from the phase-3 registry (its laws, unchanged) so a second
 * store cannot grow a second, weaker writer. Built on the durability kernel (durable.ts).
 *
 *   read:  only a REGULAR file (O_NOFOLLOW: no symlink; O_NONBLOCK: a FIFO never blocks),
 *          mode exactly `mode`, owned by the engine user, at most `maxBytes` (a bigger file
 *          is refused, never parsed). Absent → null. Anything else → JsonFileError
 *          ('unreadable' | 'too_large'). Two shapes, one rule:
 *            - readPrivateJsonText — ASYNC (node:fs/promises FileHandle). For stores
 *              reached from the API dispatch table whose file grows with what it records:
 *              no read there may stall the event loop (sync_io_on_request_path_tripwire).
 *            - readPrivateJsonTextSync — bounded synchronous read (bounded_read.ts) for a
 *              store whose fixed interface is synchronous (the registry).
 *
 *   write: serialise FIRST, refuse past `maxBytes` BEFORE anything is created (a file every
 *          later read refuses would lock the store out of its own repair) → sibling temp
 *          (temp_path.ts) opened 'wx' at `mode` → every byte → fsync → chmod to the exact
 *          mode (a umask may only narrow) → rename over the target (a NEW inode: a reader
 *          sees the old bytes or the new, never a torn mix) → directory fsync. A failure
 *          removes the temp and propagates. Synchronous on numeric descriptors by design
 *          (durable.ts rationale); its cost is bounded by `maxBytes`, and it makes no call
 *          from the sync-I/O gate's forbidden class.
 *
 *   lock:  flock(2) on `${path}.lock`, opened without following a symlink and only as a
 *          regular file. The kernel releases a flock when its holder dies, so there is no
 *          stale lock to judge and the lock file is never deleted (a pid-file lock is racy
 *          by construction: two waiters reading one dead pid each delete — review
 *          2026-09-30). Exclusive across processes AND within one (flock binds the open
 *          file description, so a second open in the same process contends): NOT
 *          re-entrant, a nested take is refused as 'locked', never a deadlock. The wait is
 *          BOUNDED (LOCK_WAIT_MS) and then 'locked'. Two waits:
 *            - withJsonFileLockAsync polls with `await Bun.sleep` — the loop keeps serving.
 *              Every request-path caller uses it (runtime.ts).
 *            - withJsonFileLock polls with Bun.sleepSync — only for a synchronous
 *              interface (the registry: pairing CLI, rare operator edits).
 *          flock comes from libc via bun:ffi — libSystem on macOS, glibc `libc.so.6` on
 *          Linux; a libc without that name fails the first lock loudly.
 *
 * Request-independent: no module state.
 */

import { dlopen, FFIType } from 'bun:ffi';
import {
	chmodSync,
	closeSync,
	constants,
	fstatSync,
	fsyncSync,
	lstatSync,
	openSync,
	renameSync,
	rmSync,
	type Stats,
} from 'node:fs';
import { type FileHandle, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { readBoundedSync } from './bounded_read.ts';
import { fsyncDirectory, writeAllSync } from './durable.ts';
import { tempPathFor } from './temp_path.ts';

/** How long a taker waits for the lock before refusing. Holders hold it for one small file write. */
export const LOCK_WAIT_MS = 500;
export const LOCK_POLL_MS = 10;
const LOCK_EX = 2;
const LOCK_NB = 4;
const LOCK_UN = 8;

export type JsonFileErrorReason = 'unreadable' | 'too_large' | 'locked';

/** Every refusal of this kernel. The message names a path, never file contents. */
export class JsonFileError extends Error {
	readonly reason: JsonFileErrorReason;
	readonly path: string;

	constructor(reason: JsonFileErrorReason, path: string, detail: string) {
		super(`${path}: ${detail}`);
		this.name = 'JsonFileError';
		this.reason = reason;
		this.path = path;
	}
}

export interface PrivateFileOptions {
	/** The most bytes a read accepts and a write produces. */
	maxBytes: number;
	/** The exact mode the file has (read) and gets (write). Default 0o600. */
	mode?: number;
}

function errorCode(error: unknown): string {
	const code = (error as { code?: unknown } | null)?.code;
	return typeof code === 'string' ? code : 'unknown';
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

function openRefusal(path: string, error: unknown): JsonFileError {
	const code = errorCode(error);
	return code === 'ELOOP'
		? new JsonFileError('unreadable', path, 'must be a regular file, not a symlink')
		: new JsonFileError('unreadable', path, `could not be read (${code})`);
}

function assertPrivateStat(stat: Stats, path: string, mode: number): void {
	if (!stat.isFile()) throw new JsonFileError('unreadable', path, 'must be a regular file');
	const found = stat.mode & 0o777;
	if (found !== mode) {
		throw new JsonFileError(
			'unreadable',
			path,
			`must be mode ${mode.toString(8)}, found ${found.toString(8)}`,
		);
	}
	if (stat.uid !== process.geteuid?.()) {
		throw new JsonFileError('unreadable', path, 'must be owned by the engine user');
	}
}

function tooLarge(path: string, maxBytes: number): JsonFileError {
	return new JsonFileError('too_large', path, `exceeds ${maxBytes} bytes`);
}

function asReadError(path: string, error: unknown): JsonFileError {
	if (error instanceof JsonFileError) return error;
	return new JsonFileError('unreadable', path, `could not be read (${errorCode(error)})`);
}

/** Bounded SYNC read of a private state file. Absent → null; refused → JsonFileError. */
export function readPrivateJsonTextSync(path: string, options: PrivateFileOptions): string | null {
	let fd: number;
	try {
		fd = openSync(path, READ_FLAGS);
	} catch (error) {
		if (errorCode(error) === 'ENOENT') return null;
		throw openRefusal(path, error);
	}
	try {
		assertPrivateStat(fstatSync(fd), path, options.mode ?? 0o600);
		const bytes = readBoundedSync(fd, options.maxBytes);
		if (bytes === null) throw tooLarge(path, options.maxBytes);
		return bytes.toString('utf8');
	} catch (error) {
		throw asReadError(path, error);
	} finally {
		closeSync(fd);
	}
}

async function openForRead(path: string): Promise<FileHandle | null> {
	try {
		return await open(path, READ_FLAGS);
	} catch (error) {
		if (errorCode(error) === 'ENOENT') return null;
		throw openRefusal(path, error);
	}
}

/** At most `maxBytes + 1` bytes of the handle, or null past the cap. */
async function readBoundedAsync(handle: FileHandle, maxBytes: number): Promise<Buffer | null> {
	const buffer = Buffer.allocUnsafe(maxBytes + 1);
	let filled = 0;
	for (;;) {
		const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, null);
		if (bytesRead === 0) return buffer.subarray(0, filled);
		filled += bytesRead;
		if (filled > maxBytes) return null;
	}
}

/** Bounded ASYNC read of a private state file. Absent → null; refused → JsonFileError. */
export async function readPrivateJsonText(
	path: string,
	options: PrivateFileOptions,
): Promise<string | null> {
	const handle = await openForRead(path);
	if (handle === null) return null;
	try {
		assertPrivateStat(await handle.stat(), path, options.mode ?? 0o600);
		const bytes = await readBoundedAsync(handle, options.maxBytes);
		if (bytes === null) throw tooLarge(path, options.maxBytes);
		return bytes.toString('utf8');
	} catch (error) {
		throw asReadError(path, error);
	} finally {
		await handle.close();
	}
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/** The one on-disk encoding: tab-indented JSON + newline. */
export function encodeJsonFile(value: object): Uint8Array {
	return new TextEncoder().encode(`${JSON.stringify(value, null, '\t')}\n`);
}

function fillAndClose(fd: number, bytes: Uint8Array): void {
	try {
		writeAllSync(fd, bytes);
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
}

/** Durably and atomically replace `path` with `value`; refused past `maxBytes` before any file exists. */
export function writeJsonFileAtomic(
	path: string,
	value: object,
	options: PrivateFileOptions,
): void {
	const bytes = encodeJsonFile(value);
	if (bytes.length > options.maxBytes) throw tooLarge(path, options.maxBytes);
	const mode = options.mode ?? 0o600;
	const temp = tempPathFor(path);
	try {
		fillAndClose(openSync(temp, 'wx', mode), bytes);
		chmodSync(temp, mode);
		renameSync(temp, path);
	} finally {
		rmSync(temp, { force: true });
	}
	fsyncDirectory(dirname(path));
}

// ---------------------------------------------------------------------------
// Lock
// ---------------------------------------------------------------------------

type Flock = (fd: number, operation: number) => number;

function loadLibc(): { flock: Flock; close: () => void } {
	const path = process.platform === 'darwin' ? '/usr/lib/libSystem.B.dylib' : 'libc.so.6';
	const lib = dlopen(path, { flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 } });
	return { flock: lib.symbols.flock, close: () => lib.close() };
}

/** Is `fd` still the file at `path`? (someone may have deleted and re-created the lock file) */
function isCurrent(fd: number, path: string): boolean {
	try {
		const held = fstatSync(fd);
		const current = lstatSync(path);
		return held.ino === current.ino && held.dev === current.dev;
	} catch {
		return false;
	}
}

/** 'a+' without following a symlink: a planted link never redirects the lock file. */
const LOCK_FLAGS = constants.O_RDWR | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW;

function openLockFile(path: string): number {
	let fd: number;
	try {
		fd = openSync(path, LOCK_FLAGS, 0o600);
	} catch (error) {
		throw openRefusal(path, error);
	}
	if (!fstatSync(fd).isFile()) {
		closeSync(fd);
		throw new JsonFileError('unreadable', path, 'must be a regular file');
	}
	return fd;
}

/** One non-blocking attempt; the release function on success, null when held elsewhere. */
function tryLock(path: string, flock: Flock): (() => void) | null {
	const fd = openLockFile(path);
	if (flock(fd, LOCK_EX | LOCK_NB) === 0 && isCurrent(fd, path)) {
		return () => {
			flock(fd, LOCK_UN);
			closeSync(fd);
		};
	}
	closeSync(fd); // closing the descriptor drops any lock it took
	return null;
}

function lockBusy(path: string): JsonFileError {
	return new JsonFileError('locked', path, 'is held by another writer; retry when it finishes');
}

function acquireLockSync(path: string, flock: Flock): () => void {
	const deadline = Date.now() + LOCK_WAIT_MS;
	for (;;) {
		const release = tryLock(path, flock);
		if (release !== null) return release;
		if (Date.now() > deadline) throw lockBusy(path);
		Bun.sleepSync(LOCK_POLL_MS);
	}
}

async function acquireLockAsync(path: string, flock: Flock): Promise<() => void> {
	const deadline = Date.now() + LOCK_WAIT_MS;
	for (;;) {
		const release = tryLock(path, flock);
		if (release !== null) return release;
		if (Date.now() > deadline) throw lockBusy(path);
		await Bun.sleep(LOCK_POLL_MS);
	}
}

/** SYNC wait — only for a store whose interface is synchronous (see the header). */
export function withJsonFileLock<T>(path: string, body: () => T): T {
	const libc = loadLibc();
	try {
		const release = acquireLockSync(`${path}.lock`, libc.flock);
		try {
			return body();
		} finally {
			release();
		}
	} finally {
		libc.close();
	}
}

/** The request-path lock: the bounded wait yields the event loop. Released on resolve AND reject. */
export async function withJsonFileLockAsync<T>(
	path: string,
	body: () => T | Promise<T>,
): Promise<T> {
	const libc = loadLibc();
	try {
		const release = await acquireLockAsync(`${path}.lock`, libc.flock);
		try {
			return await body();
		} finally {
			release();
		}
	} finally {
		libc.close();
	}
}
