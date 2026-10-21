/**
 * THE PROVISIONER'S REAL IO (`hostIo`) — its READ, and the `st_dev` its STAT reports: the part
 * `provision_host_io.test.ts` (the writer, the hash, the exec wrapper, stat's type/mode) does not
 * hold. The planning gates hand `plan()` a HostState literal and `apply()` a fake io, so only a
 * real filesystem can hold these.
 *
 *   R1. A READ NEVER BLOCKS. `hostIo().readFile` is the read behind `apply` (drift checks, the
 *       htpasswd password files), `provision remove` (every artifact's stamp — including a pre-S3
 *       turn HOME's `.gitconfig`, which its identity can replace) and `provision adopt` (a
 *       pre-instance workspace's `site.json`, which an agent writes). It was a path read: a FIFO
 *       planted at one of those names hung the root CLI forever. Now a FIFO, a socket or a device
 *       reads as null — "could not be read", which every caller already handles — and a regular
 *       file (through an operator's link too) still reads whole.
 *   R3. `provision adopt`'s INSTANCE-MARKER read never blocks either. `adoptIo().readInstanceMarker`
 *       reads `<root>/.dedalo_site_instance` — a name inside 2770 `SITES_ROOT`, which an agent may
 *       write — through the same `readRegularFile`: a FIFO there is null (no marker), not a hang.
 *   R2. `stat` reports the REAL `st_dev`. The turn HOME rebuild (S3-HOME) moves by rename and
 *       refuses unless the HOME, its site directory and the archive report ONE device — so a
 *       `dev` that is missing or constant would make every real rebuild refuse (or none).
 *
 * Each FIFO read runs in a CHILD process with a deadline: a regression must go red, not hang the
 * suite the way it hung the CLI.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { adoptIo } from '../src/provision/adopt';
import { hostIo } from '../src/provision/apply';
import { INSTANCE_MARKER } from '../src/provision/layout';

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'zz-host-io-'));
  scratch.push(dir);
  return dir;
}

function mkfifo(path: string): void {
  const made = spawnSync('mkfifo', [path]);
  if (made.status !== 0) throw new Error(`mkfifo '${path}' failed: ${String(made.stderr)}`);
}

const APPLY = resolve(import.meta.dir, '../src/provision/apply.ts');
const ADOPT = resolve(import.meta.dir, '../src/provision/adopt.ts');

/** `hostIo().readFile(path)` in a child with a deadline: its answer, or `'HUNG'`. */
function readInChild(path: string): unknown {
  const script = `const { hostIo } = await import(${JSON.stringify(APPLY)}); console.log(JSON.stringify({ read: hostIo().readFile(${JSON.stringify(path)}) }));`;
  const child = spawnSync(process.execPath, ['-e', script], { timeout: 8_000, encoding: 'utf8' });
  if (child.status === null) return 'HUNG';
  if (child.status !== 0) return `exit ${child.status}: ${child.stderr}`;
  return (JSON.parse(child.stdout.trim().split('\n').pop() as string) as { read: unknown }).read;
}

describe('R1 — a provisioner read never blocks', () => {
  test('a FIFO at the path reads as null, at once — never a read that waits for a writer', () => {
    const dir = scratchDir();
    const fifo = join(dir, '.gitconfig');
    mkfifo(fifo);
    expect(readInChild(fifo)).toBeNull();
  }, 20_000);

  test('a link to a FIFO reads as null too (the link is followed, the FIFO still refused)', () => {
    const dir = scratchDir();
    mkfifo(join(dir, 'pipe'));
    symlinkSync('pipe', join(dir, 'site.json'));
    expect(readInChild(join(dir, 'site.json'))).toBeNull();
  }, 20_000);

  test('CONTROL: a regular file reads whole, through an operator’s link as well; absent and a directory are null', () => {
    const dir = scratchDir();
    writeFileSync(join(dir, 'password'), 'secret-bytes\n');
    symlinkSync('password', join(dir, 'linked'));
    mkdirSync(join(dir, 'adir'));
    const io = hostIo();
    expect({
      file: io.readFile(join(dir, 'password')),
      linked: io.readFile(join(dir, 'linked')),
      absent: io.readFile(join(dir, 'nope')),
      directory: io.readFile(join(dir, 'adir')),
    }).toEqual({ file: 'secret-bytes\n', linked: 'secret-bytes\n', absent: null, directory: null });
  });
});

/** `adoptIo().readInstanceMarker(root)` in a child with a deadline: its answer, or `'HUNG'`. */
function readMarkerInChild(root: string): unknown {
  const script = `const { adoptIo } = await import(${JSON.stringify(ADOPT)}); console.log(JSON.stringify({ read: adoptIo().readInstanceMarker(${JSON.stringify(root)}) }));`;
  const child = spawnSync(process.execPath, ['-e', script], { timeout: 8_000, encoding: 'utf8' });
  if (child.status === null) return 'HUNG';
  if (child.status !== 0) return `exit ${child.status}: ${child.stderr}`;
  return (JSON.parse(child.stdout.trim().split('\n').pop() as string) as { read: unknown }).read;
}

describe('R3 — the adopt instance-marker read never blocks', () => {
  test('a FIFO planted at the instance marker reads as null, at once', () => {
    const root = scratchDir();
    mkfifo(join(root, INSTANCE_MARKER));
    expect(readMarkerInChild(root)).toBeNull();
  }, 20_000);

  test('CONTROL: a regular marker reads trimmed; absent and empty are null', () => {
    const marked = scratchDir();
    writeFileSync(join(marked, INSTANCE_MARKER), '  museum-a\n');
    const empty = scratchDir();
    writeFileSync(join(empty, INSTANCE_MARKER), '\n');
    const io = adoptIo();
    expect({
      marked: io.readInstanceMarker(marked),
      absent: io.readInstanceMarker(scratchDir()),
      empty: io.readInstanceMarker(empty),
    }).toEqual({ marked: 'museum-a', absent: null, empty: null });
  });
});

describe('R2 — stat reports the real st_dev the rebuild compares', () => {
  test('dev is the path’s own lstat device, for a directory, a file and a link', () => {
    const dir = scratchDir();
    writeFileSync(join(dir, 'f'), 'x');
    symlinkSync('f', join(dir, 'l'));
    const io = hostIo();
    for (const path of [dir, join(dir, 'f'), join(dir, 'l')]) {
      expect({ path, dev: io.stat(path)?.dev }).toEqual({ path, dev: Number(lstatSync(path).dev) });
    }
    // Non-vacuous: the device is a real number, and a path on another device would differ.
    expect(typeof io.stat(dir)?.dev).toBe('number');
    expect(io.stat(join(dir, 'missing'))).toBeNull();
  });
});
