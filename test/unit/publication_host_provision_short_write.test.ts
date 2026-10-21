/**
 * THE PROVISIONER'S WRITE DOORS NEVER RENAME A SHORT WRITE INTO PLACE (closure review
 * cross-diffusion:r5, S2).
 *
 * THE FINDING. `hostIo()` (publication/host_agent/src/provision/apply.ts) — `writeTemp` (units,
 * sudoers/polkit rules, env files, the selinux import) and `installFile` (the host-map renderer and
 * its ~100 MB bun binary) — called `writeSync(fd, bytes)` ONCE and dropped the count. write(2) on a
 * regular file returns a SHORT count when the disk fills (the ENOSPC only comes on the next call,
 * which never happened): the truncated temp was fsynced, renamed over the live path and reported
 * done. init's own doors (init/host_io.ts) already looped.
 *
 * WHAT IS ASSERTED — outcomes of the REAL doors on a real scratch tree, with node:fs `writeSync`
 * made to behave as the kernel does on a filling disk:
 *   1. a short write is CONTINUED: the target holds every byte (writeTemp + rename, installFile);
 *   2. a short write then ENOSPC: the door throws, the target keeps its OLD bytes and no temp is
 *      left behind (never a truncated file renamed into place);
 *   3. a write that makes no progress (0 bytes) is refused, never spun on;
 *   4. init's doors (init/host_io.ts) share the same full-write door.
 * Non-vacuity: every leg asserts the short write actually happened.
 *
 * The scratch tree is the doors' trust root and every account is this uid, so nothing here needs
 * root. WRITES: one os-tmp scratch tree, removed.
 */

import { afterAll, describe, expect, spyOn, test } from 'bun:test';
import * as nodeFs from 'node:fs';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProvisionExec } from '../../publication/host_agent/src/exec.ts';
import { hostIo } from '../../publication/host_agent/src/provision/apply.ts';
import { initHostIo } from '../../publication/host_agent/src/provision/init/host_io.ts';

const SCRATCH = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'dd_provision_short_')));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

const UID = process.getuid?.() ?? 0;
const GID = process.getgid?.() ?? 0;
const stubExec = { userId: () => UID } as unknown as ProvisionExec;

function freshDir(name: string): string {
	const dir = join(SCRATCH, name);
	mkdirSync(dir, { mode: 0o755 });
	return dir;
}

type Mode = 'short-then-ok' | 'short-then-enospc' | 'zero';

/**
 * node:fs writeSync as a filling disk answers it: the FIRST call writes half its bytes and returns
 * that count; then either the rest is written normally, every later call throws ENOSPC, or (zero)
 * every call returns 0 without writing. Only descriptors opened under `dir` are affected.
 */
function fillingDisk(dir: string, mode: Mode) {
	const real = nodeFs.writeSync as (...a: unknown[]) => number;
	const realOpen = nodeFs.openSync as (...a: unknown[]) => number;
	const fds = new Set<number>();
	const seen = { short: 0, calls: 0 };
	const openSpy = spyOn(nodeFs, 'openSync').mockImplementation(((...args: unknown[]) => {
		const fd = realOpen(...args);
		if (String(args[0]).startsWith(dir)) fds.add(fd);
		return fd;
	}) as typeof nodeFs.openSync);
	const writeSpy = spyOn(nodeFs, 'writeSync').mockImplementation(((
		fd: number,
		data: unknown,
		...rest: unknown[]
	) => {
		if (!fds.has(fd)) return real(fd, data, ...rest);
		seen.calls += 1;
		if (mode === 'zero') return 0;
		const buffer = typeof data === 'string' ? Buffer.from(data) : (data as Uint8Array);
		const offset = typeof rest[0] === 'number' ? rest[0] : 0;
		const length = typeof rest[1] === 'number' ? rest[1] : buffer.length - offset;
		if (seen.short === 0 && length > 1) {
			seen.short += 1;
			return real(fd, buffer, offset, Math.floor(length / 2));
		}
		if (mode === 'short-then-enospc') {
			throw Object.assign(new Error('ENOSPC: no space left on device, write'), {
				code: 'ENOSPC',
				errno: -28,
			});
		}
		return real(fd, buffer, offset, length);
	}) as typeof nodeFs.writeSync);
	return {
		seen,
		restore(): void {
			writeSpy.mockRestore();
			openSpy.mockRestore();
		},
	};
}

const BODY = `[Unit]\nDescription=${'x'.repeat(4000)}\n`;

describe('hostIo.writeTemp: a short write is never renamed into place', () => {
	test('a short write is continued: the target holds every byte', () => {
		const dir = freshDir('wt_ok');
		const target = join(dir, 'dedalo.service');
		writeFileSync(target, 'old\n');
		const disk = fillingDisk(dir, 'short-then-ok');
		try {
			const io = hostIo(stubExec, { trustRoot: SCRATCH });
			io.rename(io.writeTemp(target, BODY, 0o644), target);
		} finally {
			disk.restore();
		}
		expect(disk.seen.short).toBe(1);
		expect(readFileSync(target, 'utf8')).toBe(BODY);
	});

	test('a short write then ENOSPC: throws, the old file stays, no temp is left', () => {
		const dir = freshDir('wt_enospc');
		const target = join(dir, 'dedalo.env');
		writeFileSync(target, 'old\n');
		const disk = fillingDisk(dir, 'short-then-enospc');
		let thrown: unknown = null;
		try {
			const io = hostIo(stubExec, { trustRoot: SCRATCH });
			io.rename(io.writeTemp(target, BODY, 0o600), target);
		} catch (error) {
			thrown = error;
		} finally {
			disk.restore();
		}
		expect(disk.seen.short).toBe(1);
		expect(String(thrown)).toContain('ENOSPC');
		expect(readFileSync(target, 'utf8')).toBe('old\n');
		expect(readdirSync(dir)).toEqual(['dedalo.env']);
	});

	test('a write that makes no progress is refused, never spun on', () => {
		const dir = freshDir('wt_zero');
		const target = join(dir, 'rule.rules');
		const disk = fillingDisk(dir, 'zero');
		let thrown: unknown = null;
		try {
			hostIo(stubExec, { trustRoot: SCRATCH }).writeTemp(target, BODY, 0o644);
		} catch (error) {
			thrown = error;
		} finally {
			disk.restore();
		}
		expect(disk.seen.calls).toBeGreaterThan(0);
		expect(String(thrown)).toContain('no progress');
		expect(existsSync(target)).toBe(false);
		expect(readdirSync(dir)).toEqual([]);
	});
});

describe('hostIo.installFile: a short copy is never renamed into place', () => {
	const source = (): string => {
		const dir = freshDir(`src_${Math.random().toString(36).slice(2)}`);
		const path = join(dir, 'bun');
		writeFileSync(path, Buffer.alloc(64 * 1024, 7));
		return path;
	};

	test('a short write is continued: the copy is whole', () => {
		const src = source();
		const dir = freshDir('if_ok');
		const dst = join(dir, 'bun');
		const disk = fillingDisk(dir, 'short-then-ok');
		try {
			hostIo(stubExec, { trustRoot: SCRATCH }).installFile?.(src, dst, 0o755, UID, GID);
		} finally {
			disk.restore();
		}
		expect(disk.seen.short).toBe(1);
		expect(readFileSync(dst).equals(readFileSync(src))).toBe(true);
	});

	test('a short write then ENOSPC: throws, the old binary stays, no temp is left', () => {
		const src = source();
		const dir = freshDir('if_enospc');
		const dst = join(dir, 'bun');
		writeFileSync(dst, 'old binary');
		const disk = fillingDisk(dir, 'short-then-enospc');
		let thrown: unknown = null;
		try {
			hostIo(stubExec, { trustRoot: SCRATCH }).installFile?.(src, dst, 0o755, UID, GID);
		} catch (error) {
			thrown = error;
		} finally {
			disk.restore();
		}
		expect(disk.seen.short).toBe(1);
		expect(String(thrown)).toContain('ENOSPC');
		expect(readFileSync(dst, 'utf8')).toBe('old binary');
		expect(readdirSync(dir)).toEqual(['bun']);
	});
});

describe("init's doors share the full-write door", () => {
	test('writeBytesAtomic continues a short write', () => {
		const dir = freshDir('init_ok');
		const target = join(dir, 'declaration.json');
		const disk = fillingDisk(dir, 'short-then-ok');
		try {
			const io = initHostIo(stubExec, { trustRoot: SCRATCH, rootUid: UID });
			io.writeBytesAtomic(target, Buffer.from(BODY), 0o600, UID, GID);
		} finally {
			disk.restore();
		}
		expect(disk.seen.short).toBe(1);
		expect(readFileSync(target, 'utf8')).toBe(BODY);
	});

	test('writeBytesAtomic refuses a write that makes no progress', () => {
		const dir = freshDir('init_zero');
		const target = join(dir, 'declaration.json');
		const disk = fillingDisk(dir, 'zero');
		let thrown: unknown = null;
		try {
			const io = initHostIo(stubExec, { trustRoot: SCRATCH, rootUid: UID });
			io.writeBytesAtomic(target, Buffer.from(BODY), 0o600, UID, GID);
		} catch (error) {
			thrown = error;
		} finally {
			disk.restore();
		}
		expect(String(thrown)).toContain('no progress');
		expect(existsSync(target)).toBe(false);
	});
});
