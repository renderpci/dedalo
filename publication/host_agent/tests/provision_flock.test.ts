/**
 * flock.ts — the REAL LockIo on a real filesystem (macOS and Linux; seam: a scratch base under
 * .test-tmp and the test's own uid/gid in place of root's — no root needed). Two processes
 * contend on a real flock(2); kill -9 of the holder releases it at once (nothing stale can
 * remain, so the interleaving that broke a rename-takeover cannot arise); O_NOFOLLOW refuses a
 * planted symlink at the lock path.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { lstatSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { flockIo, splitDev } from '../src/provision/flock';
import { LockBusy, LockRefused, acquireInstanceLockSync, parseOwnerRecord, peekInstanceLock } from '../src/provision/lock';
import { freshScratch } from './fixtures/instance';

const UID = process.getuid?.() ?? 0;
const GID = process.getgid?.() ?? 0;
const FLOCK_TS = join(import.meta.dir, '..', 'src', 'provision', 'flock.ts');
const SPEC = { uid: UID, gid: GID, mode: 0o600, create: true } as const;

const children: ReturnType<typeof Bun.spawn>[] = [];
afterEach(() => {
  for (const child of children.splice(0)) child.kill('SIGKILL');
});

/** A child process that takes the lock and prints `held`, then sleeps until killed. */
async function holder(path: string, mode: 'ex' | 'sh'): Promise<ReturnType<typeof Bun.spawn>> {
  const script = `
    const { flockIo } = await import(${JSON.stringify(FLOCK_TS)});
    const io = flockIo();
    const fd = io.openLockFile(${JSON.stringify(path)}, ${JSON.stringify(SPEC)});
    if (!io.tryFlock(fd, ${JSON.stringify(mode)})) { console.log('busy'); process.exit(3); }
    console.log('held');
    await Bun.sleep(60000);
  `;
  const child = Bun.spawn([process.execPath, '-e', script], { stdout: 'pipe', stderr: 'pipe' });
  children.push(child);
  const reader = (child.stdout as ReadableStream<Uint8Array>).getReader();
  const { value } = await reader.read();
  reader.releaseLock();
  expect(new TextDecoder().decode(value).trim()).toBe('held');
  return child;
}

describe('flock(2) through bun:ffi, two processes', () => {
  test('a child holding LOCK_EX blocks both modes here; kill -9 releases it at once', async () => {
    const dir = await freshScratch('flock_ex');
    const path = join(dir, 'init.lock');
    const io = flockIo();
    const child = await holder(path, 'ex');
    const fd = io.openLockFile(path, SPEC);
    expect(io.tryFlock(fd, 'ex')).toBe(false);
    expect(io.tryFlock(fd, 'sh')).toBe(false);
    if (process.platform === 'linux') expect(io.holderFromProcLocks(path)).toEqual([child.pid]);
    else expect(io.holderFromProcLocks(path)).toBeNull();
    child.kill('SIGKILL');
    await child.exited;
    expect(io.tryFlock(fd, 'ex')).toBe(true);
    io.unlock(fd);
  });

  test('two shared holders coexist; an exclusive waits for both', async () => {
    const dir = await freshScratch('flock_sh');
    const path = join(dir, 'init.lock');
    const io = flockIo();
    const first = await holder(path, 'sh');
    await holder(path, 'sh');
    const fd = io.openLockFile(path, SPEC);
    expect(io.tryFlock(fd, 'sh')).toBe(true);
    io.unlock(fd);
    const fd2 = io.openLockFile(path, SPEC);
    expect(io.tryFlock(fd2, 'ex')).toBe(false);
    first.kill('SIGKILL');
    await first.exited;
    expect(io.tryFlock(fd2, 'ex')).toBe(false); // the second shared holder still lives
    io.unlock(fd2);
  });

  test('acquireInstanceLockSync on the real io: dirs 0700, lock 0600, owner record; a live holder → LockBusy', async () => {
    const base = join(await freshScratch('flock_instance'), 'init');
    const io = flockIo();
    const lock = acquireInstanceLockSync('test', 'ex', { base, io, verb: 'apply', uid: UID, gid: GID });
    expect(lstatSync(base).mode & 0o7777).toBe(0o700);
    expect(lstatSync(join(base, 'test')).mode & 0o7777).toBe(0o700);
    expect(lstatSync(lock.path).mode & 0o7777).toBe(0o600);
    expect(parseOwnerRecord(readFileSync(`${lock.path}.owner`, 'utf8'))?.pid).toBe(process.pid);
    // A second descriptor in this process is a second open file description: flock conflicts.
    expect(() =>
      acquireInstanceLockSync('test', 'sh', { base, io, verb: 'check', uid: UID, gid: GID, waitMs: 200 }),
    ).toThrow(LockBusy);
    expect(peekInstanceLock('test', { base, io, uid: UID, gid: GID }).held).toBe(true);
    lock.release();
    expect(peekInstanceLock('test', { base, io, uid: UID, gid: GID })).toEqual({ held: false });
    const again = acquireInstanceLockSync('test', 'sh', { base, io, verb: 'check', uid: UID, gid: GID, waitMs: 200 });
    again.release();
  });
});

describe('O_NOFOLLOW and the expected identity', () => {
  test('a planted symlink at the lock path is refused, and its target is never created', async () => {
    const dir = await freshScratch('flock_symlink');
    const target = join(dir, 'elsewhere');
    const path = join(dir, 'web.lock');
    symlinkSync(target, path);
    expect(() => flockIo().openLockFile(path, SPEC)).toThrow(LockRefused);
    expect(() => flockIo().openLockFile(path, { ...SPEC, create: false })).toThrow(/symlink/);
    expect(() => lstatSync(target)).toThrow();
  });

  test('a symlink to a VALID lock file is refused too (create and open paths alike)', async () => {
    const dir = await freshScratch('flock_symlink_valid');
    const real = join(dir, 'real.lock');
    writeFileSync(real, '', { mode: 0o600 });
    const path = join(dir, 'init.lock');
    symlinkSync(real, path);
    expect(() => flockIo().openLockFile(path, SPEC)).toThrow(/symlink/);
    expect(() => flockIo().openLockFile(path, { ...SPEC, create: false })).toThrow(/symlink/);
  });

  test('an existing lock file with another mode is refused, never fixed', async () => {
    const dir = await freshScratch('flock_mode');
    const path = join(dir, 'provision.lock');
    writeFileSync(path, '', { mode: 0o666 });
    expect(() => flockIo().openLockFile(path, SPEC)).toThrow(/not the file root created/);
    expect(lstatSync(path).mode & 0o777).not.toBe(0o600);
  });

  test('an agent open (create: false) of a missing file is refused and creates nothing', async () => {
    const dir = await freshScratch('flock_agent');
    const path = join(dir, 'web.lock');
    expect(() => flockIo().openLockFile(path, { ...SPEC, mode: 0o640, create: false })).toThrow(LockRefused);
    expect(() => lstatSync(path)).toThrow();
  });

  test('readOwner never follows a link; writeOwner round-trips', async () => {
    const dir = await freshScratch('flock_owner');
    const io = flockIo();
    io.writeOwner(join(dir, 'init.lock.owner'), '{"pid":1}\n');
    expect(io.readOwner(join(dir, 'init.lock.owner'))).toBe('{"pid":1}\n');
    expect(lstatSync(join(dir, 'init.lock.owner')).mode & 0o777).toBe(0o600);
    symlinkSync(join(dir, 'init.lock.owner'), join(dir, 'link.owner'));
    expect(io.readOwner(join(dir, 'link.owner'))).toBeNull();
    expect(io.readOwner(join(dir, 'absent'))).toBeNull();
  });
});

test('splitDev is glibc major()/minor()', () => {
  expect(splitDev((8 << 8) | 1)).toEqual({ major: 8, minor: 1 });
  expect(splitDev(0xfd00)).toEqual({ major: 0xfd, minor: 0 });
  // A large minor (minor >= 256) uses the high bits.
  // minor 261 = 0x105: its low byte (0x05) in bits 0-7, its high bits (0x100) shifted by 12.
  expect(splitDev((259 << 8) | 0x05 | (0x100 << 12))).toEqual({ major: 259, minor: 261 });
});
