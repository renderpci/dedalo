/**
 * init/host_io.ts — init's REAL filesystem doors, unprivileged, in a scratch tree under
 * .test-tmp/. SEAM (spec §2.2, §9 "Non-root on macOS"): the scratch directory is the trust root
 * and the test's own uid counts as root (`rootUid`), so "root-owned" = owned by this uid and
 * fchown to our own ids is a no-op the kernel allows; foreign uids are never created. Proves:
 *   - writeBytesAtomic: binary bytes, owner/mode set on the descriptor, the hidden temp gone,
 *     a stale link at the temp name unlinked (never followed), a link at the target replaced
 *     (its target untouched);
 *   - every door re-judges the ancestry at the moment of the write: a symlinked or
 *     group-writable ancestor is refused;
 *   - O_NOFOLLOW everywhere: appendSync, readOperatorFile, readRootFile refuse/ignore a link,
 *     readOperatorFile refuses a second hard link; flock.ts refuses a planted link at
 *     init.lock / web.lock;
 *   - removeTree never leaves its root nor follows a link; renameDir never lands on an entry;
 *   - readProcFile serves only the /proc allowlist.
 */
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, linkSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, statSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProvisionExec } from '../src/provision/exec_contract';
import { flockIo } from '../src/provision/flock';
import { INIT_TEMP_SUFFIX, READ_CAP_BYTES, initHostIo, initTempPath, lstatFacts, PROC_ALLOWLIST, procPathAllowed, ensureDir } from '../src/provision/init/host_io';
import type { InitIo } from '../src/provision/init/types';
import type { PinExpectation } from '../src/provision/plan';
import { BINARY_READ_CAP_BYTES } from '../src/provision/init/types';
import { freshScratch } from './fixtures/instance';

const UID = process.getuid?.() ?? 0;
const GID = process.getgid?.() ?? 0;
/** Only userId is consulted by the doors (hostIo's root uid); everything else is never spawned here. */
const exec = { userId: () => UID } as unknown as ProvisionExec;

let root = '';
let io: InitIo;
beforeEach(async () => {
  root = await freshScratch('ihio');
  chmodSync(root, 0o755);
  io = initHostIo(exec, { trustRoot: root, rootUid: UID, procRoot: join(root, 'fakeproc') });
});
afterAll(async () => {
  await freshScratch('ihio');
});

function nested(...parts: string[]): string {
  const dir = join(root, ...parts);
  mkdirSync(dir, { recursive: true, mode: 0o755 });
  return dir;
}

describe('writeBytesAtomic', () => {
  test('binary bytes land whole, with the mode and owner, through a hidden temp that is gone after', () => {
    const dir = nested('a');
    const path = join(dir, 'blob.bin');
    const bytes = new Uint8Array(256).map((_, i) => i);
    io.writeBytesAtomic(path, bytes, 0o640, UID, GID);
    expect(new Uint8Array(readFileSync(path))).toEqual(bytes);
    const stats = statSync(path);
    expect(stats.mode & 0o7777).toBe(0o640);
    expect(stats.uid).toBe(UID);
    expect(initTempPath(path)).toBe(join(dir, `.blob.bin${INIT_TEMP_SUFFIX}`));
    expect(lstatFacts(initTempPath(path))).toBeNull();
  });

  test('a stale symlink at the temp name is unlinked, never written through', () => {
    const dir = nested('a');
    const victim = join(root, 'victim');
    writeFileSync(victim, 'keep');
    const path = join(dir, 'conf');
    symlinkSync(victim, initTempPath(path));
    io.writeBytesAtomic(path, new TextEncoder().encode('new'), 0o644, UID, GID);
    expect(readFileSync(victim, 'utf8')).toBe('keep');
    expect(readFileSync(path, 'utf8')).toBe('new');
  });

  test('a symlink AT the target is replaced by the file; its target is untouched', () => {
    const dir = nested('a');
    const victim = join(root, 'victim');
    writeFileSync(victim, 'keep');
    const path = join(dir, 'conf');
    symlinkSync(victim, path);
    io.writeBytesAtomic(path, new TextEncoder().encode('mine'), 0o600, UID, GID);
    expect(lstatSync(path).isFile()).toBe(true);
    expect(readFileSync(victim, 'utf8')).toBe('keep');
  });

  test('a directory at the temp name is refused, not recursed', () => {
    const dir = nested('a');
    const path = join(dir, 'conf');
    mkdirSync(initTempPath(path));
    expect(() => io.writeBytesAtomic(path, new Uint8Array([1]), 0o600, UID, GID)).toThrow('a directory sits at the temp name');
  });

  test('a failed write leaves no temp behind', () => {
    const dir = nested('a');
    mkdirSync(join(dir, 'isdir'));
    expect(() => io.writeBytesAtomic(join(dir, 'isdir'), new Uint8Array([1]), 0o600, UID, GID)).toThrow();
    expect(lstatFacts(initTempPath(join(dir, 'isdir')))).toBeNull();
  });
});

describe('the ancestry is judged at the moment of every write', () => {
  test('a symlinked ancestor is refused (the write cannot be redirected)', () => {
    const real = nested('real', 'inner');
    symlinkSync(join(root, 'real'), join(root, 'link'));
    expect(real).toContain('real');
    expect(() => io.writeBytesAtomic(join(root, 'link', 'inner', 'f'), new Uint8Array([1]), 0o600, UID, GID)).toThrow('not a real directory');
    expect(() => io.appendSync(join(root, 'link', 'inner', 'j'), 'x')).toThrow('not a real directory');
  });

  test('a group-writable ancestor above the grandparent is refused; the immediate parent may be anyone’s', () => {
    nested('loose', 'mid', 'parent');
    chmodSync(join(root, 'loose'), 0o775);
    expect(() => io.writeBytesAtomic(join(root, 'loose', 'mid', 'parent', 'f'), new Uint8Array([1]), 0o600, UID, GID)).toThrow('group- or world-writable');
    // appendSync (the journal) has no grandparent exception: rule 1 whole.
    expect(() => io.appendSync(join(root, 'loose', 'mid', 'j'), 'x')).toThrow('group- or world-writable');
    chmodSync(join(root, 'loose'), 0o755);
    chmodSync(join(root, 'loose', 'mid', 'parent'), 0o775);
    expect(() => io.writeBytesAtomic(join(root, 'loose', 'mid', 'parent', 'f'), new Uint8Array([1]), 0o600, UID, GID)).not.toThrow();
  });

  /*
   * The state tree's API files: `publication_api/<api>/` is the agent's, `shared/` in it root's.
   * Modelled with a world-writable grandparent (a non-root gate cannot create a foreign-owned one;
   * trustProblem treats both alike). Without the pinned write, rule 1 refused the drill's v2.env.
   * The caller states the MODES row `shared/` must match (review S3-1); a substitute made after
   * the pin receives nothing (S3-2). No platform guard: CI's hermetic tier runs it on Linux.
   */
  // The group a new directory gets is the platform's (BSD: the parent's; Linux: ours): read it back.
  const sharedRow = (dir: string): PinExpectation => ({ parent: dir, uid: UID, gid: lstatFacts(dir)?.gid ?? GID, mode: 0o750 });

  test('an untrusted GRANDPARENT: the write is pinned to the root parent (O_NOFOLLOW + inode), and lands', () => {
    const shared = nested('publication_api', 'v2', 'shared');
    chmodSync(join(root, 'publication_api', 'v2'), 0o777);
    chmodSync(shared, 0o750);
    const cwd = process.cwd();
    io.writeBytesAtomic(join(shared, 'v2.env'), new TextEncoder().encode('DB=x\n'), 0o640, UID, GID, sharedRow(shared));
    expect(readFileSync(join(shared, 'v2.env'), 'utf8')).toBe('DB=x\n');
    expect(statSync(join(shared, 'v2.env')).mode & 0o777).toBe(0o640);
    expect(lstatFacts(initTempPath(join(shared, 'v2.env')))).toBeNull();
    expect(process.cwd()).toBe(cwd);
  });

  test('an untrusted grandparent: a parent swapped for a link, or one others may write, is refused and nothing is written', () => {
    const v2 = nested('publication_api', 'v2');
    chmodSync(v2, 0o777);
    const elsewhere = nested('elsewhere');
    symlinkSync(elsewhere, join(v2, 'shared'));
    expect(() => io.writeBytesAtomic(join(v2, 'shared', 'v2.env'), new Uint8Array([1]), 0o640, UID, GID, sharedRow(join(v2, 'shared')))).toThrow('without following a link');
    expect(readdirSync(elsewhere)).toEqual([]);
    const loose = nested('publication_api', 'v2', 'loose');
    chmodSync(loose, 0o777);
    expect(() => io.writeBytesAtomic(join(loose, 'v2.env'), new Uint8Array([1]), 0o640, UID, GID, { ...sharedRow(loose), mode: 0o777 })).toThrow('group- or world-writable');
    expect(readdirSync(loose)).toEqual([]);
    expect(process.cwd()).not.toBe(loose);
  });

  test('S3-1: the pinned parent must be the MODES row the caller expects — any other root directory is refused', () => {
    const v2 = nested('publication_api', 'v2');
    chmodSync(v2, 0o777);
    const shared = nested('publication_api', 'v2', 'shared');
    chmodSync(shared, 0o755); // root's, closed to others — but not v2Shared's 0750
    const file = join(shared, 'v2.env');
    expect(() => io.writeBytesAtomic(file, new Uint8Array([1]), 0o640, UID, GID)).toThrow('stated no expectation');
    expect(() => io.writeBytesAtomic(file, new Uint8Array([1]), 0o640, UID, GID, sharedRow(v2))).toThrow('expectation names');
    expect(() => io.writeBytesAtomic(file, new Uint8Array([1]), 0o640, UID, GID, sharedRow(shared))).toThrow('not the expected uid');
    expect(() => io.writeBytesAtomic(file, new Uint8Array([1]), 0o640, UID, GID, { ...sharedRow(shared), mode: 0o755, gid: (lstatFacts(shared)?.gid ?? GID) + 1 })).toThrow('not the expected uid');
    expect(readdirSync(shared)).toEqual([]);
    chmodSync(shared, 0o750);
    io.writeBytesAtomic(file, new Uint8Array([1]), 0o640, UID, GID, sharedRow(shared));
    expect(readdirSync(shared)).toEqual(['v2.env']);
  });

  test('S3-2: a substitute put in place AFTER the pin receives nothing — the write lands in the pinned inode', () => {
    const v2 = nested('publication_api', 'v2');
    chmodSync(v2, 0o777);
    const shared = nested('publication_api', 'v2', 'shared');
    chmodSync(shared, 0o750);
    const inode = lstatSync(shared).ino;
    const moved = join(v2, 'shared.moved');
    const raced = initHostIo(exec, {
      trustRoot: root,
      rootUid: UID,
      onPinned: dir => {
        renameSync(dir, moved);
        mkdirSync(dir);
        chmodSync(dir, 0o750);
      },
    });
    raced.writeBytesAtomic(join(shared, 'v2.env'), new TextEncoder().encode('DB=x\n'), 0o640, UID, GID, sharedRow(shared));
    expect(readdirSync(shared)).toEqual([]);
    expect(readdirSync(moved)).toEqual(['v2.env']);
    expect(readFileSync(join(moved, 'v2.env'), 'utf8')).toBe('DB=x\n');
    expect(lstatSync(moved).ino).toBe(inode);
  });

  test('the temp of a pinned write (an interrupted v2.env, --resume) is removed through the same pin, never without it', () => {
    const v2 = nested('publication_api', 'v2');
    chmodSync(v2, 0o777);
    const shared = nested('publication_api', 'v2', 'shared');
    chmodSync(shared, 0o750);
    const temp = initTempPath(join(shared, 'v2.env'));
    writeFileSync(temp, 'x');
    expect(() => io.removeInitTemp(temp)).toThrow('no matching expectation');
    expect(() => io.removeInitTemp(temp, { ...sharedRow(shared), mode: 0o755 })).toThrow('not the expected');
    expect(lstatFacts(temp)).not.toBeNull();
    io.removeInitTemp(temp, sharedRow(shared));
    expect(lstatFacts(temp)).toBeNull();
    io.removeInitTemp(temp, sharedRow(shared)); // absent: nothing to do
  });

  test('a path that is not clean is refused before any lstat', () => {
    expect(() => io.writeBytesAtomic(`${root}/a/../b`, new Uint8Array([1]), 0o600, UID, GID)).toThrow('not a clean absolute path');
    expect(() => io.writeBytesAtomic('relative/x', new Uint8Array([1]), 0o600, UID, GID)).toThrow('not a clean absolute path');
  });
});

describe('the other doors', () => {
  test('writeTempNamed is exclusive and takes a plain name only', () => {
    const dir = nested('t');
    const path = io.writeTempNamed(dir, 'x.txt', new TextEncoder().encode('one'), 0o640);
    expect(readFileSync(path, 'utf8')).toBe('one');
    expect(statSync(path).mode & 0o777).toBe(0o640);
    expect(() => io.writeTempNamed(dir, 'x.txt', new Uint8Array([1]), 0o640)).toThrow();
    for (const bad of ['', '.', '..', 'a/b']) expect(() => io.writeTempNamed(dir, bad, new Uint8Array([1]), 0o600)).toThrow('plain file name');
  });

  test('removeInitTemp removes only *.dedalo-init.tmp, never a directory', () => {
    const dir = nested('r');
    const temp = join(dir, `.f${INIT_TEMP_SUFFIX}`);
    writeFileSync(temp, 'x');
    io.removeInitTemp(temp);
    expect(lstatFacts(temp)).toBeNull();
    io.removeInitTemp(temp); // absent: nothing to do
    writeFileSync(join(dir, 'keep.conf'), 'x');
    expect(() => io.removeInitTemp(join(dir, 'keep.conf'))).toThrow('not an init temp file');
    mkdirSync(join(dir, `.d${INIT_TEMP_SUFFIX}`));
    expect(() => io.removeInitTemp(join(dir, `.d${INIT_TEMP_SUFFIX}`))).toThrow('is a directory');
  });

  test('removeTree stays under its root and never follows a link out', () => {
    const outside = nested('outside');
    writeFileSync(join(outside, 'precious'), 'keep');
    const tree = nested('tree', 'sub');
    writeFileSync(join(tree, 'f'), 'x');
    symlinkSync(outside, join(root, 'tree', 'escape'));
    io.removeTree(join(root, 'tree'), root);
    expect(lstatFacts(join(root, 'tree'))).toBeNull();
    expect(readFileSync(join(outside, 'precious'), 'utf8')).toBe('keep');
    io.removeTree(join(root, 'tree'), root); // absent
    expect(() => io.removeTree(outside, join(root, 'tree'))).toThrow('is not under');
    expect(() => io.removeTree(root, root)).toThrow('is not under');
  });

  test('renameDir moves a real directory onto a free name only', () => {
    nested('from');
    io.renameDir(join(root, 'from'), join(root, 'to'));
    expect(lstatFacts(join(root, 'to'))?.type).toBe('dir');
    nested('busy');
    expect(() => io.renameDir(join(root, 'to'), join(root, 'busy'))).toThrow('it exists');
    writeFileSync(join(root, 'file'), 'x');
    expect(() => io.renameDir(join(root, 'file'), join(root, 'free'))).toThrow('not a real directory');
  });

  test('appendSync appends (creating 0600) and refuses a symlink at the path', () => {
    const dir = nested('j');
    const path = join(dir, 'journal.jsonl');
    io.appendSync(path, 'one\n');
    io.appendSync(path, 'two\n');
    expect(readFileSync(path, 'utf8')).toBe('one\ntwo\n');
    expect(statSync(path).mode & 0o777).toBe(0o600);
    const victim = join(root, 'victim');
    writeFileSync(victim, 'keep');
    symlinkSync(victim, join(dir, 'planted'));
    expect(() => io.appendSync(join(dir, 'planted'), 'x')).toThrow('without following a link');
    expect(readFileSync(victim, 'utf8')).toBe('keep');
  });

  test('readOperatorFile: bytes, owner, mode, sha — never through a link, never a second hard link', () => {
    const dir = nested('o');
    const path = join(dir, 'vhost.conf');
    writeFileSync(path, 'ServerName example.org\n', { mode: 0o644 });
    const file = io.readOperatorFile(path);
    expect(Buffer.from(file.bytes).toString()).toBe('ServerName example.org\n');
    expect(file.uid).toBe(UID);
    expect(file.mode).toBe(0o644);
    expect(file.sha).toBe(new Bun.CryptoHasher('sha256').update('ServerName example.org\n').digest('hex'));
    symlinkSync(path, join(dir, 'link.conf'));
    expect(() => io.readOperatorFile(join(dir, 'link.conf'))).toThrow('symbolic link');
    linkSync(path, join(dir, 'hard.conf'));
    expect(() => io.readOperatorFile(path)).toThrow('2 hard links');
    mkdirSync(join(dir, 'd'));
    expect(() => io.readOperatorFile(join(dir, 'd'))).toThrow('not a regular file');
  });

  test('readOperatorFile caps: 8 MiB by default; a binary cap reads the Bun archive; a larger cap is clamped', () => {
    const dir = nested('cap');
    const path = join(dir, 'bun-linux-aarch64.zip');
    writeFileSync(path, '', { mode: 0o600 });
    truncateSync(path, 36_602_920); // the drill's real archive size (sparse: nothing is written)
    expect(() => io.readOperatorFile(path)).toThrow(`over the ${READ_CAP_BYTES}-byte cap`);
    expect(io.readOperatorFile(path, BINARY_READ_CAP_BYTES).bytes.length).toBe(36_602_920);
    truncateSync(path, BINARY_READ_CAP_BYTES + 1);
    expect(() => io.readOperatorFile(path, Number.MAX_SAFE_INTEGER)).toThrow(`over the ${BINARY_READ_CAP_BYTES}-byte cap`);
  });

  test('readRootFile: text, or null when absent or a link', () => {
    const dir = nested('rr');
    writeFileSync(join(dir, 'sudoers'), '@includedir /etc/sudoers.d\n');
    expect(io.readRootFile(join(dir, 'sudoers'))).toBe('@includedir /etc/sudoers.d\n');
    expect(io.readRootFile(join(dir, 'absent'))).toBeNull();
    symlinkSync(join(dir, 'sudoers'), join(dir, 'link'));
    expect(io.readRootFile(join(dir, 'link'))).toBeNull();
  });

  test('ensureDir creates once with the mode; an existing non-directory is refused', () => {
    const path = join(root, 'kept');
    ensureDir(io, path, 0o700, UID, GID, lstatFacts);
    expect(statSync(path).mode & 0o777).toBe(0o700);
    ensureDir(io, path, 0o700, UID, GID, lstatFacts); // kept as it is
    writeFileSync(join(root, 'plain'), 'x');
    expect(() => ensureDir(io, join(root, 'plain'), 0o700, UID, GID, lstatFacts)).toThrow('not a directory');
  });

  test('the ProvisionIo doors are hostIo’s, on the same seam', () => {
    const dir = join(root, 'pdir');
    io.mkdir(dir, 0o750);
    io.chmod(dir, 0o750);
    expect(statSync(dir).mode & 0o777).toBe(0o750);
    const temp = io.writeTemp(join(dir, 'x'), 'body', 0o600);
    expect(temp.endsWith('.dedalo-provision.tmp')).toBe(true);
    io.removeTemp(temp);
  });
});

describe('readProcFile serves the allowlist only', () => {
  test('allowed paths are read (here from the scratch /proc), anything else is refused loudly', () => {
    const proc = nested('fakeproc', 'proc', 'sys', 'kernel');
    writeFileSync(join(proc, 'osrelease'), '4.18.0-553.el8_10.x86_64\n');
    nested('fakeproc', 'proc', 'self');
    writeFileSync(join(root, 'fakeproc', 'proc', 'self', 'environ'), 'PATH=/usr/bin\0');
    expect(io.readProcFile('/proc/sys/kernel/osrelease')).toBe('4.18.0-553.el8_10.x86_64\n');
    expect(io.readProcFile('/proc/self/environ')).toBe('PATH=/usr/bin\0');
    expect(io.readProcFile('/proc/locks')).toBeNull(); // allowed, absent here
    for (const bad of ['/proc/cpuinfo', '/etc/passwd', '/proc/self/../1/environ', '/proc/1/environ', '/proc/sys/kernel/hostname', '/proc/net/../self/x']) {
      expect(() => io.readProcFile(bad)).toThrow('not on the /proc allowlist');
    }
    expect(PROC_ALLOWLIST).toHaveLength(5);
    expect(procPathAllowed('/proc/self/attr/current')).toBe(true);
    expect(procPathAllowed('/proc/net/tcp6')).toBe(true);
    expect(procPathAllowed('/proc/sys/kernel/random/boot_id')).toBe(true);
  });

  test('a link at the last component is not followed', () => {
    const self = nested('fakeproc', 'proc', 'self');
    writeFileSync(join(root, 'secret'), 'x');
    symlinkSync(join(root, 'secret'), join(self, 'cmdline'));
    expect(readlinkSync(join(self, 'cmdline'))).toBe(join(root, 'secret'));
    expect(io.readProcFile('/proc/self/cmdline')).toBeNull();
  });
});

describe('flock.ts refuses a planted link at the lock paths (O_NOFOLLOW)', () => {
  test('init.lock and web.lock', () => {
    const lockIo = flockIo();
    for (const name of ['init.lock', 'web.lock']) {
      const victim = join(root, `victim-${name}`);
      writeFileSync(victim, '');
      symlinkSync(victim, join(root, name));
      expect(() => lockIo.openLockFile(join(root, name), { uid: UID, gid: GID, mode: 0o600, create: true })).toThrow();
    }
  });
});
