/**
 * init/tree_copy.ts on a REAL tree (seam: scratch under .test-tmp is the trust root, this uid
 * is "root"; spec §9 Real filesystem). Proves:
 *   - the digest is the §1.3 algorithm exactly (lines `F <sha> ./p` / `L <target> ./p` /
 *     `D ./p`, C byte order of the path, joined with `\n`, sha256) — recomputed independently
 *     here, so a change to the walk is red;
 *   - a code tree refuses: an absolute link, a link out of the tree, a dangling link, a FIFO,
 *     a name with a line break;
 *   - installTree: rebuilt (not copied) root-owned u=rwX,go=rX with setuid/setgid dropped, the
 *     digest re-taken, swapped by two renames; the previous tree kept as `.prev` until
 *     commitTree, put back by restoreTree; a source that changed since compare is refused and
 *     nothing is touched; an unfinished `.prev` is refused (resume first).
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync, readFileSync, readlinkSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProvisionExec } from '../src/provision/exec_contract';
import { initHostIo } from '../src/provision/init/host_io';
import {
  commitTree,
  digestLines,
  hostTreeReader,
  hostTreeWriter,
  installTree,
  newPathOf,
  prevPathOf,
  restoreTree,
  treeDigest,
  treeEntries,
  TreeRefused,
} from '../src/provision/init/tree_copy';
import type { InitIo } from '../src/provision/init/types';
import { freshScratch } from './fixtures/instance';

const UID = process.getuid?.() ?? 0;
const GID = process.getgid?.() ?? 0;
const exec = { userId: () => UID } as unknown as ProvisionExec;
const reader = hostTreeReader();

let root = '';
let io: InitIo;
beforeEach(async () => {
  root = await freshScratch('itree');
  chmodSync(root, 0o755);
  io = initHostIo(exec, { trustRoot: root, rootUid: UID });
});

function sha(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** A small code tree: files, an executable, a nested dir, a relative link inside. */
function codeTree(dir: string): void {
  mkdirSync(join(dir, 'src', 'lib'), { recursive: true });
  mkdirSync(join(dir, 'node_modules', '.bin'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), '{"name":"x"}\n');
  writeFileSync(join(dir, 'src', 'index.ts'), 'export {};\n');
  writeFileSync(join(dir, 'src', 'lib', 'a-b.ts'), 'a\n');
  writeFileSync(join(dir, 'src', 'run.sh'), '#!/bin/sh\n', { mode: 0o4755 });
  symlinkSync('../../src/index.ts', join(dir, 'node_modules', '.bin', 'tool'));
}

describe('treeDigest — the §1.3 algorithm', () => {
  test('is sha256 of the F/L/D lines in C byte order of ./path', () => {
    const dir = join(root, 'src');
    mkdirSync(dir);
    codeTree(dir);
    const expected = [
      'D ./node_modules',
      'D ./node_modules/.bin',
      'L ../../src/index.ts ./node_modules/.bin/tool',
      `F ${sha('{"name":"x"}\n')} ./package.json`,
      'D ./src',
      `F ${sha('export {};\n')} ./src/index.ts`,
      'D ./src/lib',
      `F ${sha('a\n')} ./src/lib/a-b.ts`,
      `F ${sha('#!/bin/sh\n')} ./src/run.sh`,
    ];
    expect(digestLines(treeEntries(dir, reader))).toEqual(expected);
    expect(treeDigest(dir, reader)).toBe(sha(expected.join('\n')));
    // The root itself is not an entry; an empty tree is sha256('').
    mkdirSync(join(root, 'empty'));
    expect(treeDigest(join(root, 'empty'))).toBe(sha(''));
  });

  test('byte order, not locale order: "a-b" sorts before "a/…" and upper case before lower', () => {
    const dir = join(root, 'order');
    mkdirSync(join(dir, 'a'), { recursive: true });
    writeFileSync(join(dir, 'a-b'), '');
    writeFileSync(join(dir, 'a', 'c'), '');
    writeFileSync(join(dir, 'B'), '');
    expect(treeEntries(dir, reader).map(e => e.path)).toEqual(['./B', './a', './a-b', './a/c']);
  });

  test('a code tree refuses what root must not run', () => {
    const cases: [string, (dir: string) => void, string][] = [
      ['absolute link', dir => symlinkSync('/etc/passwd', join(dir, 'abs')), 'absolute symlink'],
      ['link out of the tree', dir => symlinkSync('../../outside', join(dir, 'out')), 'outside the tree'],
      ['dangling link', dir => symlinkSync('nowhere', join(dir, 'dangle')), 'does not resolve'],
      ['a FIFO', dir => Bun.spawnSync(['mkfifo', join(dir, 'fifo')]), 'neither a file'],
      ['a line break in a name', dir => writeFileSync(join(dir, 'bad\nname'), ''), 'line break'],
    ];
    for (const [label, plant, why] of cases) {
      const dir = join(root, label.replace(/\W/g, '_'));
      mkdirSync(dir);
      writeFileSync(join(root, 'outside'), '');
      plant(dir);
      expect(() => treeEntries(dir, reader)).toThrow(why);
    }
    expect(() => treeEntries(join(root, 'absent'), reader)).toThrow('not a real directory');
    const many = join(root, 'many');
    mkdirSync(many);
    for (let i = 0; i < 5; i += 1) writeFileSync(join(many, `f${i}`), '');
    expect(() => treeEntries(many, reader, 3)).toThrow('more than 3 entries');
  });

  test('a link that climbs out lexically but resolves back in is still refused (no ".." escape)', () => {
    const dir = join(root, 'climb');
    mkdirSync(dir);
    writeFileSync(join(dir, 'f'), '');
    symlinkSync('../climb/f', join(dir, 'l'));
    expect(() => treeEntries(dir, reader)).toThrow('outside the tree');
  });
});

describe('installTree', () => {
  function setup(): { src: string; dst: string; writer: ReturnType<typeof hostTreeWriter> } {
    const src = join(root, 'stage');
    mkdirSync(src);
    codeTree(src);
    mkdirSync(join(root, 'opt'));
    return { src, dst: join(root, 'opt', 'host_agent'), writer: hostTreeWriter(io) };
  }

  test('first install: rebuilt with computed modes (setuid dropped), same digest, no .prev', () => {
    const { src, dst, writer } = setup();
    const digest = treeDigest(src, reader);
    const result = installTree(src, dst, reader, writer, { uid: UID, gid: GID, expectedDigest: digest });
    expect(result).toEqual({ dst, new: newPathOf(dst), prev: null, digest });
    expect(treeDigest(dst, reader)).toBe(digest);
    expect(statSync(join(dst, 'src', 'run.sh')).mode & 0o7777).toBe(0o755);
    expect(statSync(join(dst, 'package.json')).mode & 0o7777).toBe(0o644);
    expect(statSync(join(dst, 'src')).mode & 0o7777).toBe(0o755);
    expect(readlinkSync(join(dst, 'node_modules', '.bin', 'tool'))).toBe('../../src/index.ts');
    expect(lstatSync(newPathOf(dst), { throwIfNoEntry: false })).toBeUndefined();
  });

  test('a second install keeps the previous tree as .prev; commitTree removes it, restoreTree puts it back', () => {
    const { src, dst, writer } = setup();
    installTree(src, dst, reader, writer, { uid: UID, gid: GID });
    const firstDigest = treeDigest(dst, reader);
    writeFileSync(join(src, 'src', 'index.ts'), 'export const v = 2;\n');
    const second = installTree(src, dst, reader, writer, { uid: UID, gid: GID });
    expect(second.prev).toBe(prevPathOf(dst));
    expect(treeDigest(prevPathOf(dst), reader)).toBe(firstDigest);
    expect(restoreTree(dst, reader, io)).toBe('restored');
    expect(treeDigest(dst, reader)).toBe(firstDigest);
    expect(lstatSync(newPathOf(dst), { throwIfNoEntry: false })).toBeUndefined();
    expect(restoreTree(dst, reader, io)).toBe('nothing');
    installTree(src, dst, reader, writer, { uid: UID, gid: GID });
    expect(commitTree(dst, reader, io)).toBe(true);
    expect(lstatSync(prevPathOf(dst), { throwIfNoEntry: false })).toBeUndefined();
    expect(commitTree(dst, reader, io)).toBe(false);
    expect(readFileSync(join(dst, 'src', 'index.ts'), 'utf8')).toBe('export const v = 2;\n');
  });

  test('MUTATION: a source changed since compare is refused and dst is untouched', () => {
    const { src, dst, writer } = setup();
    const shown = treeDigest(src, reader);
    writeFileSync(join(src, 'src', 'index.ts'), 'tampered\n');
    expect(() => installTree(src, dst, reader, writer, { uid: UID, gid: GID, expectedDigest: shown })).toThrow('changed since it was compared');
    expect(lstatSync(dst, { throwIfNoEntry: false })).toBeUndefined();
    expect(lstatSync(newPathOf(dst), { throwIfNoEntry: false })).toBeUndefined();
  });

  test('MUTATION: an escaping symlink in the source is refused before anything is built', () => {
    const { src, dst, writer } = setup();
    symlinkSync('/etc/passwd', join(src, 'src', 'evil'));
    expect(() => installTree(src, dst, reader, writer, { uid: UID, gid: GID })).toThrow(TreeRefused);
    expect(lstatSync(newPathOf(dst), { throwIfNoEntry: false })).toBeUndefined();
  });

  test('an unfinished .prev is refused (resume first); a crashed .new is cleared, never reused', () => {
    const { src, dst, writer } = setup();
    mkdirSync(newPathOf(dst));
    writeFileSync(join(newPathOf(dst), 'stale'), 'x');
    installTree(src, dst, reader, writer, { uid: UID, gid: GID });
    expect(lstatSync(join(dst, 'stale'), { throwIfNoEntry: false })).toBeUndefined();
    mkdirSync(prevPathOf(dst));
    expect(() => installTree(src, dst, reader, writer, { uid: UID, gid: GID })).toThrow('never finished');
    expect(restoreTree(dst, reader, io)).toBe('restored');
  });

  test('a build that fails half-way removes its .new tree', () => {
    const { src, dst } = setup();
    let writes = 0;
    const failing = {
      io: { ...io, writeTempNamed: (...args: Parameters<InitIo['writeTempNamed']>) => (++writes === 3 ? (() => { throw new Error('ENOSPC'); })() : io.writeTempNamed(...args)) } as InitIo,
      symlink: (target: string, path: string) => symlinkSync(target, path),
    };
    expect(() => installTree(src, dst, reader, failing, { uid: UID, gid: GID })).toThrow('ENOSPC');
    expect(lstatSync(newPathOf(dst), { throwIfNoEntry: false })).toBeUndefined();
    expect(lstatSync(dst, { throwIfNoEntry: false })).toBeUndefined();
  });

  test('a failed second rename puts the previous tree back', () => {
    const { src, dst, writer } = setup();
    installTree(src, dst, reader, writer, { uid: UID, gid: GID });
    const before = treeDigest(dst, reader);
    writeFileSync(join(src, 'package.json'), '{"name":"y"}\n');
    const breaking = {
      io: { ...io, renameDir: (from: string, to: string) => { if (from === newPathOf(dst)) throw new Error('EXDEV'); io.renameDir(from, to); } } as InitIo,
      symlink: writer.symlink,
    };
    expect(() => installTree(src, dst, reader, breaking, { uid: UID, gid: GID })).toThrow('EXDEV');
    expect(treeDigest(dst, reader)).toBe(before);
  });
});
