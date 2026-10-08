/**
 * lock.ts — the lock POLICY over a fake LockIo (seam: an in-memory flock table with scripted
 * foreign holders and a fake clock; no fs, no root). The real system calls are
 * tests/provision_flock.test.ts's.
 */
import { describe, expect, test } from 'bun:test';
import type { DirFacts, LockFileSpec, LockIo, LockMode } from '../src/provision/lock';
import {
  INIT_BASE,
  LOCK_POLL_MS,
  LOCK_WAIT_MS,
  LockBusy,
  LockRefused,
  acquireHostLockAsync,
  acquireHostLockSync,
  acquireInstanceLockSync,
  describeHolder,
  encodeOwnerRecord,
  ensureInitDirs,
  instanceLockPath,
  lockHolder,
  parseOwnerRecord,
  parseProcLocks,
  peekInstanceLock,
} from '../src/provision/lock';

interface Held {
  readonly mode: LockMode;
  readonly pid: number;
}

/** An in-memory flock table: `foreign` holders are other processes (scripted), fds are ours. */
function fakeIo(options: { dirs?: Record<string, DirFacts>; procLocks?: boolean } = {}) {
  let clock = 1_000_000;
  const dirs = new Map<string, DirFacts>(Object.entries(options.dirs ?? {}));
  const files = new Map<string, LockFileSpec>();
  const holders = new Map<string, Held[]>();
  const fds = new Map<number, string>();
  const ourHeld = new Map<number, LockMode>();
  const owners = new Map<string, string>();
  const log: string[] = [];
  let nextFd = 10;
  let sleeps = 0;
  const allHolders = (path: string): Held[] => [
    ...(holders.get(path) ?? []),
    ...[...ourHeld].filter(([fd]) => fds.get(fd) === path).map(([, mode]) => ({ mode, pid: 4242 })),
  ];
  const io: LockIo = {
    openLockFile(path, spec) {
      const existing = files.get(path);
      if (existing === undefined) {
        if (!spec.create) throw new LockRefused(`lock: cannot open '${path}' (ENOENT)`);
        files.set(path, spec);
        dirs.set(path, { type: 'file', uid: spec.uid, mode: spec.mode });
      } else if (existing.uid !== spec.uid || existing.mode !== spec.mode) {
        throw new LockRefused(`lock: '${path}' is not the file root created`);
      }
      const fd = nextFd++;
      fds.set(fd, path);
      log.push(`open ${path}`);
      return fd;
    },
    tryFlock(fd, mode) {
      const path = fds.get(fd) as string;
      const others = allHolders(path).filter((_, index, list) => list[index] !== undefined);
      const mine = ourHeld.get(fd);
      const competing = others.filter(h => !(mine !== undefined && h.pid === 4242 && h.mode === mine));
      const free = mode === 'sh' ? competing.every(h => h.mode === 'sh') : competing.length === 0;
      if (free) ourHeld.set(fd, mode);
      return free;
    },
    unlock(fd) {
      ourHeld.delete(fd);
      log.push(`unlock ${fds.get(fd)}`);
      fds.delete(fd);
    },
    readOwner: path => owners.get(path) ?? null,
    writeOwner(path, record) {
      owners.set(path, record);
      log.push(`owner ${path}`);
    },
    holderFromProcLocks(path) {
      if (options.procLocks === false) return null;
      return [...new Set(allHolders(path).map(h => h.pid))].sort((a, b) => a - b);
    },
    lstat: path => dirs.get(path) ?? null,
    mkdir(path, mode, uid) {
      dirs.set(path, { type: 'dir', uid, mode });
      log.push(`mkdir ${path} 0${mode.toString(8)}`);
    },
    now: () => clock,
    sleepSync(ms) {
      sleeps += 1;
      clock += ms;
    },
    async sleep(ms) {
      sleeps += 1;
      clock += ms;
    },
  };
  return {
    io,
    log,
    owners,
    holders,
    files,
    dirs,
    ourHeld,
    sleeps: () => sleeps,
    hold(path: string, mode: LockMode, pid: number) {
      holders.set(path, [...(holders.get(path) ?? []), { mode, pid }]);
    },
  };
}

const BASE = '/scratch/init';
const LOCK = instanceLockPath(BASE, 'test');
const OPTS = { base: BASE, uid: 0, gid: 0 } as const;

describe('the instance lock (spec S12 1)', () => {
  test('exclusive on a free lock: creates <base>/<instance> 0700, holds, writes the owner record', () => {
    const fake = fakeIo();
    const lock = acquireInstanceLockSync('test', 'ex', { ...OPTS, io: fake.io, verb: 'apply', pid: 77 });
    expect(lock.path).toBe('/scratch/init/test/init.lock');
    expect(lock.instance).toBe('test');
    expect(fake.log.slice(0, 2)).toEqual(['mkdir /scratch/init 0700', 'mkdir /scratch/init/test 0700']);
    expect(fake.files.get(LOCK)).toEqual({ uid: 0, gid: 0, mode: 0o600, create: true });
    expect(parseOwnerRecord(fake.owners.get(`${LOCK}.owner`) ?? null)).toEqual({
      pid: 77,
      verb: 'apply',
      started: new Date(1_000_000).toISOString(),
    });
    lock.release();
    lock.release(); // idempotent
    expect(fake.log.filter(line => line.startsWith('unlock'))).toEqual([`unlock ${LOCK}`]);
  });

  test('exclusive vs an exclusive holder waits the 5 s, then LockBusy naming the holder', () => {
    const fake = fakeIo();
    fake.hold(LOCK, 'ex', 900);
    fake.io.mkdir(BASE, 0o700, 0, 0);
    fake.io.mkdir(`${BASE}/test`, 0o700, 0, 0);
    fake.io.openLockFile(LOCK, { uid: 0, gid: 0, mode: 0o600, create: true });
    fake.owners.set(`${LOCK}.owner`, encodeOwnerRecord({ pid: 900, verb: 'init', started: '2026-10-08T10:00:00.000Z' }));
    let error: unknown;
    try {
      acquireInstanceLockSync('test', 'ex', { ...OPTS, io: fake.io, verb: 'apply' });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(LockBusy);
    expect((error as LockBusy).holder).toEqual({ pids: [900], verb: 'init', pid: 900, since: '2026-10-08T10:00:00.000Z' });
    expect((error as Error).message).toBe("instance 'test' is held by init pid 900 since 2026-10-08T10:00:00.000Z; waited 5 s");
    expect(fake.sleeps()).toBe(LOCK_WAIT_MS.instance / LOCK_POLL_MS);
    expect(fake.ourHeld.size).toBe(0); // the descriptor was closed
    // The owner record of the waiter was never written.
    expect(parseOwnerRecord(fake.owners.get(`${LOCK}.owner`) ?? null)?.verb).toBe('init');
  });

  test('exclusive vs a SHARED holder (a running check) waits too', () => {
    const fake = fakeIo();
    fake.hold(LOCK, 'sh', 901);
    fake.io.mkdir(BASE, 0o700, 0, 0);
    fake.io.mkdir(`${BASE}/test`, 0o700, 0, 0);
    fake.io.openLockFile(LOCK, { uid: 0, gid: 0, mode: 0o600, create: true });
    expect(() => acquireInstanceLockSync('test', 'ex', { ...OPTS, io: fake.io, verb: 'apply' })).toThrow(LockBusy);
  });

  test('shared + shared both proceed; shared never writes the owner record', () => {
    const fake = fakeIo();
    fake.hold(LOCK, 'sh', 902);
    fake.io.mkdir(BASE, 0o700, 0, 0);
    fake.io.mkdir(`${BASE}/test`, 0o700, 0, 0);
    fake.io.openLockFile(LOCK, { uid: 0, gid: 0, mode: 0o600, create: true });
    const first = acquireInstanceLockSync('test', 'sh', { ...OPTS, io: fake.io, verb: 'check' });
    const second = acquireInstanceLockSync('test', 'sh', { ...OPTS, io: fake.io, verb: 'check' });
    expect([first.mode, second.mode]).toEqual(['sh', 'sh']);
    expect(fake.owners.size).toBe(0);
    expect(fake.sleeps()).toBe(0);
  });

  test('shared vs an exclusive holder: LockBusy after 5 s (check answers BUSY)', () => {
    const fake = fakeIo();
    fake.hold(LOCK, 'ex', 903);
    fake.io.mkdir(BASE, 0o700, 0, 0);
    fake.io.mkdir(`${BASE}/test`, 0o700, 0, 0);
    fake.io.openLockFile(LOCK, { uid: 0, gid: 0, mode: 0o600, create: true });
    expect(() => acquireInstanceLockSync('test', 'sh', { ...OPTS, io: fake.io, verb: 'check' })).toThrow(LockBusy);
    expect(fake.sleeps()).toBe(50);
  });

  test('a holder that leaves during the wait is waited for, not refused', () => {
    const fake = fakeIo();
    fake.hold(LOCK, 'ex', 904);
    fake.io.mkdir(BASE, 0o700, 0, 0);
    fake.io.mkdir(`${BASE}/test`, 0o700, 0, 0);
    fake.io.openLockFile(LOCK, { uid: 0, gid: 0, mode: 0o600, create: true });
    const io: LockIo = {
      ...fake.io,
      sleepSync(ms) {
        fake.io.sleepSync(ms);
        if (fake.sleeps() === 3) fake.holders.delete(LOCK); // the holder exits (the kernel drops its flock)
      },
    };
    const lock = acquireInstanceLockSync('test', 'ex', { ...OPTS, io, verb: 'apply' });
    expect(lock.mode).toBe('ex');
    expect(fake.sleeps()).toBe(3);
  });

  test('a failing owner-record write releases the lock it just took', () => {
    const fake = fakeIo();
    const io: LockIo = {
      ...fake.io,
      writeOwner() {
        throw new Error('EIO');
      },
    };
    expect(() => acquireInstanceLockSync('test', 'ex', { ...OPTS, io, verb: 'apply' })).toThrow('EIO');
    expect(fake.ourHeld.size).toBe(0);
  });

  test('a lock file with other metadata is refused, never fixed', () => {
    const fake = fakeIo();
    fake.io.mkdir(BASE, 0o700, 0, 0);
    fake.io.mkdir(`${BASE}/test`, 0o700, 0, 0);
    fake.files.set(LOCK, { uid: 1000, gid: 1000, mode: 0o666, create: true });
    expect(() => acquireInstanceLockSync('test', 'ex', { ...OPTS, io: fake.io, verb: 'apply' })).toThrow(LockRefused);
  });

  test('a bad instance name is refused before any directory is touched', () => {
    const fake = fakeIo();
    expect(() => acquireInstanceLockSync('../x', 'ex', { ...OPTS, io: fake.io, verb: 'apply' })).toThrow(LockRefused);
    expect(fake.log).toEqual([]);
  });
});

describe('the lock directories (the trampoline step-3 law)', () => {
  test.each([
    ['a symlink', { type: 'symlink', uid: 0, mode: 0o777 }, /a symlink/],
    ['foreign', { type: 'dir', uid: 1000, mode: 0o700 }, /owned by uid 1000, not root/],
    ['group-writable', { type: 'dir', uid: 0, mode: 0o770 }, /group- or other-writable \(mode 0770\)/],
    ['a file', { type: 'file', uid: 0, mode: 0o600 }, /a file, not a directory/],
  ] as const)('INIT_BASE that is %s is refused', (_name, facts, pattern) => {
    const fake = fakeIo({ dirs: { [BASE]: facts } });
    expect(() => ensureInitDirs(BASE, 'test', fake.io)).toThrow(pattern);
    expect(fake.log).toEqual([]);
  });

  test('the instance directory is judged too; a good existing one is kept as it is', () => {
    const good = { type: 'dir', uid: 0, mode: 0o700 } as const;
    const fake = fakeIo({ dirs: { [BASE]: good, [`${BASE}/test`]: { type: 'dir', uid: 0, mode: 0o757 } } });
    expect(() => ensureInitDirs(BASE, 'test', fake.io)).toThrow(/test' is group- or other-writable/);
    const ok = fakeIo({ dirs: { [BASE]: good, [`${BASE}/test`]: good } });
    expect(ensureInitDirs(BASE, 'test', ok.io)).toBe(`${BASE}/test`);
    expect(ok.log).toEqual([]);
  });

  test('INIT_BASE is the one constant install.sh shares', () => {
    expect(INIT_BASE).toBe('/var/lib/dedalo_publication_host_init');
  });
});

describe('the holder (/proc/locks first, the record only when they agree)', () => {
  test('a record whose pid /proc/locks does not list is ignored', () => {
    const record = { pid: 12, verb: 'init', started: '2026-10-08T10:00:00.000Z' };
    expect(lockHolder([900], record)).toEqual({ pids: [900], verb: null, pid: 900, since: null });
    expect(describeHolder(lockHolder([900], record))).toBe('another process pid 900');
    expect(lockHolder([12], record).verb).toBe('init');
  });

  test('without /proc/locks (macOS) nothing is claimed', () => {
    const holder = lockHolder(null, { pid: 12, verb: 'init', started: '2026-10-08T10:00:00.000Z' });
    expect(holder).toEqual({ pids: null, verb: null, pid: null, since: null });
    expect(describeHolder(holder)).toBe('another process');
    expect(describeHolder(lockHolder([3, 4], null))).toBe('another process pids 3,4');
  });

  test('parseOwnerRecord accepts only the exact shape', () => {
    expect(parseOwnerRecord(null)).toBeNull();
    expect(parseOwnerRecord('not json')).toBeNull();
    expect(parseOwnerRecord('null')).toBeNull();
    expect(parseOwnerRecord('{"pid":0,"verb":"init","started":"2026-10-08T10:00:00.000Z"}')).toBeNull();
    expect(parseOwnerRecord('{"pid":1,"verb":"Init\\u001b","started":"2026-10-08T10:00:00.000Z"}')).toBeNull();
    expect(parseOwnerRecord('{"pid":1,"verb":"init","started":"yesterday"}')).toBeNull();
    expect(parseOwnerRecord('x'.repeat(5000))).toBeNull();
  });

  test('parseProcLocks: holders of this inode only, never a waiter', () => {
    const text = [
      '1: FLOCK  ADVISORY  WRITE 1234 08:01:131074 0 EOF',
      '1: -> FLOCK  ADVISORY  WRITE 5555 08:01:131074 0 EOF',
      '2: FLOCK  ADVISORY  READ  2222 08:01:131074 0 EOF',
      '3: FLOCK  ADVISORY  WRITE 3333 08:01:999 0 EOF',
      '4: POSIX  ADVISORY  WRITE 4444 fd:00:131074 0 EOF',
      'garbage',
    ].join('\n');
    expect(parseProcLocks(text, { major: 8, minor: 1 }, 131074)).toEqual([1234, 2222]);
    expect(parseProcLocks(text, { major: 0xfd, minor: 0 }, 131074)).toEqual([4444]);
  });
});

describe('--dry-run peek (spec §7): never waits, never creates, never writes', () => {
  test('a missing lock file is free and nothing is created', () => {
    const fake = fakeIo();
    expect(peekInstanceLock('test', { base: BASE, io: fake.io })).toEqual({ held: false });
    expect(fake.log).toEqual([]);
  });

  test('a live exclusive holder is reported; the peek releases its own descriptor', () => {
    const fake = fakeIo();
    fake.files.set(LOCK, { uid: 0, gid: 0, mode: 0o600, create: true });
    fake.dirs.set(LOCK, { type: 'file', uid: 0, mode: 0o600 });
    fake.hold(LOCK, 'ex', 905);
    expect(peekInstanceLock('test', { base: BASE, io: fake.io })).toEqual({
      held: true,
      holder: { pids: [905], verb: null, pid: 905, since: null },
    });
    expect(fake.sleeps()).toBe(0);
    expect(fake.owners.size).toBe(0);
    expect(fake.ourHeld.size).toBe(0);
    fake.holders.delete(LOCK);
    expect(peekInstanceLock('test', { base: BASE, io: fake.io })).toEqual({ held: false });
  });
});

describe('the host locks (spec S12 2/3)', () => {
  const DIR = '/scratch/_host/locks';

  test('provision.lock is root:root 0600; web.lock root:<pubhost> 0640; both exclusive', () => {
    const fake = fakeIo();
    const provision = acquireHostLockSync('provision', { dir: DIR, io: fake.io });
    const web = acquireHostLockSync('web', { dir: DIR, io: fake.io, gid: 990 });
    expect([provision.path, web.path]).toEqual([`${DIR}/provision.lock`, `${DIR}/web.lock`]);
    expect([provision.mode, web.mode, provision.instance]).toEqual(['ex', 'ex', null]);
    expect(fake.files.get(`${DIR}/provision.lock`)).toEqual({ uid: 0, gid: 0, mode: 0o600, create: true });
    expect(fake.files.get(`${DIR}/web.lock`)).toEqual({ uid: 0, gid: 990, mode: 0o640, create: true });
  });

  test('the web lock held past 30 s: LockBusy (root REFUSED / agent host_busy), naming the pid', () => {
    const fake = fakeIo();
    fake.files.set(`${DIR}/web.lock`, { uid: 0, gid: 990, mode: 0o640, create: true });
    fake.hold(`${DIR}/web.lock`, 'ex', 906);
    let error: unknown;
    try {
      acquireHostLockSync('web', { dir: DIR, io: fake.io, gid: 990 });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(LockBusy);
    expect((error as Error).message).toBe('the host web lock is held by another process pid 906; waited 30 s');
    expect(fake.sleeps()).toBe(LOCK_WAIT_MS.web / LOCK_POLL_MS);
  });

  test('the agent variant is async, opens read-only without creating, and times out the same way', async () => {
    const fake = fakeIo();
    await expect(acquireHostLockAsync('web', { dir: DIR, io: fake.io, create: false })).rejects.toBeInstanceOf(LockRefused);
    fake.files.set(`${DIR}/web.lock`, { uid: 0, gid: 990, mode: 0o640, create: true });
    const lock = await acquireHostLockAsync('web', { dir: DIR, io: fake.io, create: false });
    expect(lock.mode).toBe('ex');
    lock.release();
    fake.hold(`${DIR}/web.lock`, 'ex', 907);
    await expect(acquireHostLockAsync('web', { dir: DIR, io: fake.io, create: false, waitMs: 500 })).rejects.toBeInstanceOf(
      LockBusy,
    );
  });
});
