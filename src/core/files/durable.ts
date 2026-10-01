/**
 * THE DURABILITY KERNEL: what a writer must do before it may tell a
 * WAL-durable record (a run ledger, a checkpoint, a "completed" job row) that
 * a file effect happened.
 *
 * A rename makes a write ATOMIC, not DURABLE. After a power cut (or a kernel
 * crash, never a process kill: the page cache outlives the process) a file
 * keeps only what was forced to disk:
 *
 *   - its BYTES are durable once the file is fsynced after its last write;
 *   - a DIRECTORY ENTRY (a creation, a rename, an unlink, a mkdir) is durable
 *     once its directory is fsynced after the change.
 *
 * So the durable publication of a file is: write a temp sibling, fsync it,
 * rename it over the final path, fsync the directory. Directory fsyncs batch:
 * a writer landing N files in one directory fsyncs each file but the directory
 * ONCE, through a DirectoryBarrier it flushes before it reports the batch.
 *
 * Synchronous node:fs calls on numeric descriptors, by design: every byte a
 * call returned for is in the OS, nothing rides a FileHandle a dying process
 * could leave to the garbage collector, and one I/O shape is what the
 * durability gate's power-cut model observes (test/helpers/power_loss_model.ts).
 *
 * A neutral kernel (no subsystem's vocabulary): the diffusion writers
 * (src/diffusion/writers/files.ts) and the core files-unlink door
 * (src/core/diffusion_bridge/diffusion_delete.ts) both import it.
 */

import { closeSync, fsyncSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * The error codes of a filesystem that does not implement a directory fsync
 * (some network and FUSE filesystems). There the guarantee is not available —
 * said loudly, never a failed write: the data is as durable as that
 * filesystem can make it.
 */
const DIRECTORY_FSYNC_UNSUPPORTED: ReadonlySet<string> = new Set([
	'EINVAL',
	'ENOTSUP',
	'EOPNOTSUPP',
]);

/** fsync a DIRECTORY: the entries created, renamed or unlinked in it survive a power cut. */
export function fsyncDirectory(dir: string): void {
	const fd = openSync(dir, 'r');
	try {
		fsyncSync(fd);
	} catch (error) {
		const code = (error as { code?: unknown } | null)?.code;
		if (typeof code !== 'string' || !DIRECTORY_FSYNC_UNSUPPORTED.has(code)) throw error;
		console.warn(
			`[durable] the filesystem of '${dir}' refuses a directory fsync (${code}) — renames and unlinks in it are not power-cut durable`,
		);
	} finally {
		closeSync(fd);
	}
}

/** fsync a FILE by path (its bytes, however they were written, reach the disk). */
export function fsyncFile(path: string): void {
	const fd = openSync(path, 'r');
	try {
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
}

/** Write every byte of `bytes` to `fd` (a short write is continued, never dropped). */
export function writeAllSync(fd: number, bytes: Uint8Array): void {
	let offset = 0;
	while (offset < bytes.byteLength) {
		offset += writeSync(fd, bytes, offset, bytes.byteLength - offset);
	}
}

/**
 * Directories whose entries changed and are not durable yet. A writer adds
 * the directory of every file it renamed in or unlinked, and flushes ONCE
 * before it reports the batch — one directory fsync per batch, not per file.
 */
export class DirectoryBarrier {
	private readonly dirs = new Set<string>();

	add(dir: string): void {
		this.dirs.add(dir);
	}

	/** fsync every pending directory; the barrier is empty after. */
	flush(): void {
		for (const dir of [...this.dirs]) {
			fsyncDirectory(dir);
			this.dirs.delete(dir);
		}
	}
}

/**
 * mkdir -p whose NEW levels survive a power cut: each created level's entry
 * lives in its parent, so every parent of a created level is fsynced — now, or
 * at `barrier`'s flush. Nothing created ⇒ nothing to sync.
 */
export function mkdirDurably(dir: string, barrier?: DirectoryBarrier): void {
	const first = mkdirSync(dir, { recursive: true });
	if (first === undefined) return;
	const stop = dirname(resolve(first));
	for (
		let level = resolve(dir);
		level !== stop && level !== dirname(level);
		level = dirname(level)
	) {
		const parent = dirname(level);
		if (barrier !== undefined) barrier.add(parent);
		else fsyncDirectory(parent);
	}
}
