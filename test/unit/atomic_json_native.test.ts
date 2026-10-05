/**
 * The atomic JSON state-file kernel (src/core/files/atomic_json.ts) — the laws extracted
 * from the phase-3 registry, now shared: a read accepts only a regular, 0600, engine-owned
 * file within its byte cap (no symlink, a FIFO never blocks), sync and async alike; a write
 * is bounded BEFORE anything is created, lands through temp 0600 → fsync → rename (new
 * inode) → dir fsync and leaves no temp; the flock lock is exclusive across processes AND
 * within one (not re-entrant), never follows a symlinked lock file, is freed by the kernel
 * when its holder dies (the lock file is never deleted), waits bounded, and — async —
 * yields the event loop while it waits.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
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
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	JsonFileError,
	readPrivateJsonText,
	readPrivateJsonTextSync,
	withJsonFileLock,
	withJsonFileLockAsync,
	writeJsonFileAtomic,
} from '../../src/core/files/atomic_json.ts';

const KERNEL_MODULE = join(import.meta.dir, '../../src/core/files/atomic_json.ts');
const MAX = 4096;

let dir: string;
let target: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'atomic_json_'));
	target = join(dir, 'state.json');
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

/** The JsonFileError reason `run` throws/rejects with, null when it succeeds. */
async function reasonOf(run: () => unknown): Promise<string | null> {
	try {
		await run();
		return null;
	} catch (error) {
		return error instanceof JsonFileError ? error.reason : `foreign: ${String(error)}`;
	}
}

describe('writeJsonFileAtomic', () => {
	test('writes tab-indented JSON + newline at mode 0600 and leaves no temp sibling', () => {
		writeJsonFileAtomic(target, { version: 1, hosts: {} }, { maxBytes: MAX });
		expect(readFileSync(target, 'utf8')).toBe('{\n\t"version": 1,\n\t"hosts": {}\n}\n');
		expect(statSync(target).mode & 0o777).toBe(0o600);
		expect(readdirSync(dir)).toEqual(['state.json']);
	});

	test('replacing a 0644 file yields a NEW 0600 inode (rename, never an in-place rewrite)', () => {
		writeFileSync(target, 'old', { mode: 0o644 });
		const before = statSync(target).ino;
		writeJsonFileAtomic(target, { a: 1 }, { maxBytes: MAX });
		expect(statSync(target).mode & 0o777).toBe(0o600);
		expect(statSync(target).ino).not.toBe(before);
		expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual({ a: 1 });
	});

	test('a value past maxBytes is refused as too_large BEFORE any file is created', async () => {
		expect(
			await reasonOf(() =>
				writeJsonFileAtomic(target, { pad: 'x'.repeat(MAX) }, { maxBytes: MAX }),
			),
		).toBe('too_large');
		expect(readdirSync(dir)).toEqual([]);
	});

	test('a failed rename propagates and leaves no temp sibling', () => {
		mkdirSync(target);
		writeFileSync(join(target, 'keep'), 'x');
		expect(() => writeJsonFileAtomic(target, { a: 1 }, { maxBytes: MAX })).toThrow();
		expect(readdirSync(dir)).toEqual(['state.json']);
	});

	test('an unserialisable value throws before any file is created', () => {
		expect(() => writeJsonFileAtomic(target, { n: 1n }, { maxBytes: MAX })).toThrow(TypeError);
		expect(readdirSync(dir)).toEqual([]);
	});
});

const READERS = [
	['sync', (path: string) => readPrivateJsonTextSync(path, { maxBytes: MAX })],
	['async', (path: string) => readPrivateJsonText(path, { maxBytes: MAX })],
] as const;

for (const [shape, read] of READERS) {
	describe(`readPrivateJsonText (${shape})`, () => {
		test('an absent file is null', async () => {
			expect(await read(target)).toBeNull();
		});

		test('a private (0600) file is its text', async () => {
			writeFileSync(target, '{"a":1}\n', { mode: 0o600 });
			expect(await read(target)).toBe('{"a":1}\n');
		});

		test('a file of any other mode is unreadable', async () => {
			writeFileSync(target, '{}', { mode: 0o600 });
			chmodSync(target, 0o644);
			expect(await reasonOf(() => read(target))).toBe('unreadable');
		});

		test('a symlink is unreadable, never followed', async () => {
			const real = join(dir, 'real.json');
			writeFileSync(real, '{}', { mode: 0o600 });
			symlinkSync(real, target);
			expect(await reasonOf(() => read(target))).toBe('unreadable');
		});

		test('a directory is unreadable, never an absent file', async () => {
			mkdirSync(target);
			expect(await reasonOf(() => read(target))).toBe('unreadable');
		});

		test('a FIFO is unreadable and never blocks the read', async () => {
			Bun.spawnSync(['mkfifo', target]);
			expect(await reasonOf(() => read(target))).toBe('unreadable');
		});

		test('a file past the cap is too_large, never parsed', async () => {
			writeFileSync(target, 'x'.repeat(MAX + 1), { mode: 0o600 });
			expect(await reasonOf(() => read(target))).toBe('too_large');
			writeFileSync(target, 'x'.repeat(MAX), { mode: 0o600 });
			expect(await read(target)).toHaveLength(MAX); // the cap is inclusive
		});
	});
}

/** A child process that takes the lock and holds it until killed. */
async function holdInChild(path: string): Promise<ReturnType<typeof Bun.spawn>> {
	const child = Bun.spawn(
		[
			process.execPath,
			'-e',
			`import { writeSync } from 'node:fs';
			 import { withJsonFileLock } from ${JSON.stringify(KERNEL_MODULE)};
			 withJsonFileLock(${JSON.stringify(path)}, () => { writeSync(1, 'held\\n'); Bun.sleepSync(30000); });`,
		],
		{ stdout: 'pipe', stderr: 'pipe' },
	);
	const first = await (child.stdout as ReadableStream<Uint8Array>).getReader().read();
	expect(new TextDecoder().decode(first.value)).toBe('held\n');
	return child;
}

describe('withJsonFileLock (sync wait — sync interfaces only)', () => {
	test('returns the value of the body; the lock is released (retakeable), its file kept', () => {
		expect(withJsonFileLock(target, () => 42)).toBe(42);
		expect(withJsonFileLock(target, () => 43)).toBe(43);
		expect(readdirSync(dir)).toEqual(['state.json.lock']);
	});

	test('releases the lock when the body throws', () => {
		expect(() =>
			withJsonFileLock(target, () => {
				throw new RangeError('boom');
			}),
		).toThrow('boom');
		expect(withJsonFileLock(target, () => 'again')).toBe('again');
	});

	test('is NOT re-entrant: a nested take is refused as locked, never a deadlock', async () => {
		expect(
			await reasonOf(() => withJsonFileLock(target, () => withJsonFileLock(target, () => 1))),
		).toBe('locked');
	});

	test('a symlinked lock file is refused as unreadable and the body never runs', async () => {
		const elsewhere = join(dir, 'elsewhere');
		symlinkSync(elsewhere, `${target}.lock`);
		let ran = false;
		expect(
			await reasonOf(() =>
				withJsonFileLock(target, () => {
					ran = true;
				}),
			),
		).toBe('unreadable');
		expect(ran).toBe(false);
		expect(existsSync(elsewhere)).toBe(false);
	});

	test('another process holding it → locked; its death frees it with nothing deleted', async () => {
		const child = await holdInChild(target);
		try {
			expect(await reasonOf(() => withJsonFileLock(target, () => 1))).toBe('locked');
		} finally {
			child.kill('SIGKILL');
			await child.exited;
		}
		expect(existsSync(`${target}.lock`)).toBe(true);
		expect(withJsonFileLock(target, () => 'took')).toBe('took');
	});
});

describe('withJsonFileLockAsync (the request-path lock)', () => {
	test('returns the value of an async body and releases the lock', async () => {
		expect(await withJsonFileLockAsync(target, async () => 42)).toBe(42);
		expect(await withJsonFileLockAsync(target, () => 43)).toBe(43);
	});

	test('releases the lock when the body rejects', async () => {
		await expect(
			withJsonFileLockAsync(target, async () => {
				throw new RangeError('boom');
			}),
		).rejects.toThrow('boom');
		expect(await withJsonFileLockAsync(target, () => 'again')).toBe('again');
	});

	test('is NOT re-entrant: a nested take is refused after its bounded wait, never a deadlock', async () => {
		expect(
			await reasonOf(() =>
				withJsonFileLockAsync(target, () => withJsonFileLockAsync(target, () => 1)),
			),
		).toBe('locked');
	});

	test('another process holding it → locked after the bounded wait, and the wait YIELDS the loop', async () => {
		const child = await holdInChild(target);
		try {
			let ticks = 0;
			const timer = setInterval(() => {
				ticks++;
			}, 5);
			const reason = await reasonOf(() => withJsonFileLockAsync(target, () => 1));
			clearInterval(timer);
			expect(reason).toBe('locked');
			expect(ticks).toBeGreaterThan(5); // a Bun.sleepSync wait would starve the timer
		} finally {
			child.kill('SIGKILL');
			await child.exited;
		}
		expect(await withJsonFileLockAsync(target, () => 'took')).toBe('took');
	});

	test('two takers in one process serialize: both run, never overlapping', async () => {
		let inside = 0;
		let maxInside = 0;
		const work = async (): Promise<string> => {
			inside++;
			maxInside = Math.max(maxInside, inside);
			await Bun.sleep(30);
			inside--;
			return 'done';
		};
		const results = await Promise.all([
			withJsonFileLockAsync(target, work),
			withJsonFileLockAsync(target, work),
		]);
		expect(results).toEqual(['done', 'done']);
		expect(maxInside).toBe(1);
	});
});
