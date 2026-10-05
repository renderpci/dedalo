/**
 * BOUNDED SYNCHRONOUS READ — a small file read whose cost is capped by the CALLER, not by
 * whatever the file on disk has grown to.
 *
 * Bun serves every request from one event loop, so a synchronous read that scales with a
 * file's bytes stalls the whole installation (sync_io_on_request_path_tripwire). Some
 * stores must still read synchronously — a read taken under an flock(2) the same process
 * polls for cannot yield to the loop without deadlocking a second in-process acquirer —
 * and for those the honest fix is a CAP: at most `maxBytes + 1` bytes are ever read, and
 * a file past the cap is reported (null) for the caller to refuse by its own vocabulary.
 */

import { readSync } from 'node:fs';

/**
 * Every byte of the open descriptor `fd`, or null when it holds more than `maxBytes`.
 * Short reads are continued; at most `maxBytes + 1` bytes are read in total.
 */
export function readBoundedSync(fd: number, maxBytes: number): Buffer | null {
	const buffer = Buffer.allocUnsafe(maxBytes + 1);
	let filled = 0;
	for (;;) {
		const read = readSync(fd, buffer, filled, buffer.length - filled, null);
		if (read === 0) return buffer.subarray(0, filled);
		filled += read;
		if (filled > maxBytes) return null;
	}
}
