import { beforeEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BundleRefused,
  type BundleLimits,
  type BundleRefusalReason,
  DEFAULT_MAX_PATH_LENGTH,
  extractBundle,
} from '../src/releases/ustar';
import { resetInstance, roots } from './fixtures/instance';
import { bundle, gzip, paxEntry, paxRecord, streamOf, type TarEntry, ustar } from './fixtures/ustar_writer';

const LIMITS: BundleLimits = { maxBytes: 1 << 20, maxEntries: 1000, maxPathLength: DEFAULT_MAX_PATH_LENGTH };
const RESERVED = ['config_api/server_config_api.php'] as const;

/** <stateRoot>/ustar/{dest, outside} — `outside` is where an escape would land. */
let base: string;
let dest: string;
let outside: string;

beforeEach(async () => {
  await resetInstance();
  base = join(roots.stateRoot, 'ustar');
  dest = join(base, 'dest');
  outside = join(base, 'outside');
  await mkdir(dest, { recursive: true });
  await mkdir(outside, { recursive: true });
});

function caseInsensitive(): boolean {
  const probe = join(import.meta.dir, '..', 'package.json'.toUpperCase());
  return existsSync(probe);
}

async function refusal(bytes: Uint8Array, limits: BundleLimits = LIMITS): Promise<BundleRefusalReason> {
  try {
    await extractBundle(streamOf(bytes), dest, limits, RESERVED);
  } catch (err) {
    expect(err).toBeInstanceOf(BundleRefused);
    // Nothing left behind: the staging dir is gone, nothing escaped beside it.
    expect(existsSync(dest)).toBe(false);
    expect(await readdir(outside)).toEqual([]);
    expect((await readdir(base)).sort()).toEqual(['outside']);
    return (err as BundleRefused).reason;
  }
  throw new Error('expected a refusal');
}

describe('extractBundle — happy path', () => {
  test('files, dirs, implicit parents, PAX + prefix paths, normalized modes, compressed sha256', async () => {
    const long = `${'d'.repeat(80)}/${'e'.repeat(90)}.txt`; // > 100 bytes: ustar prefix split
    const paxLong = `p/${'q'.repeat(150)}/${'r'.repeat(150)}.txt`; // > 255 bytes: PAX path
    const gz = bundle([
      { path: 'src/', type: '5', mode: 0o700 },
      { path: 'src/index.ts', data: 'export {};\n', mode: 0o600 },
      { path: 'bin/run', data: '#!/bin/sh\n', mode: 0o700 },
      { path: 'node_modules/a/b/c.js', data: 'x' }, // parents implicit
      { path: 'node_modules/a', type: '5' }, // explicit after implicit is fine
      { path: 'old_nul_type', type: '\0', data: 'legacy' },
      { path: long, data: 'long' },
      paxEntry(paxRecord('path', paxLong)),
      { path: 'ignored-by-pax', data: 'pax' },
      { path: 'empty', data: '' },
    ]);
    const res = await extractBundle(streamOf(gz, 1), dest, LIMITS, RESERVED);

    expect(res.sha256).toBe(createHash('sha256').update(gz).digest('hex'));
    expect(res.entries).toBe(9);
    expect(res.bytes).toBe(11 + 10 + 1 + 6 + 4 + 3 + 0);
    expect(await readFile(join(dest, 'src/index.ts'), 'utf8')).toBe('export {};\n');
    expect(await readFile(join(dest, long), 'utf8')).toBe('long');
    expect(await readFile(join(dest, paxLong), 'utf8')).toBe('pax');
    expect(existsSync(join(dest, 'ignored-by-pax'))).toBe(false);
    expect(await readFile(join(dest, 'old_nul_type'), 'utf8')).toBe('legacy');
    expect((await stat(join(dest, 'src'))).mode & 0o777).toBe(0o755);
    expect((await stat(join(dest, 'node_modules/a/b'))).mode & 0o777).toBe(0o755);
    expect((await stat(join(dest, 'src/index.ts'))).mode & 0o777).toBe(0o644);
    expect((await stat(join(dest, 'bin/run'))).mode & 0o777).toBe(0o755);
  });

  test('bytes after the end-of-archive blocks are hashed, not parsed', async () => {
    const raw = ustar([{ path: 'a', data: 'a' }]);
    const withTail = new Uint8Array(raw.length + 4096); // record padding, as tar writes it
    withTail.set(raw);
    const gz = gzip(withTail);
    const res = await extractBundle(streamOf(gz), dest, LIMITS, RESERVED);
    expect(res.sha256).toBe(createHash('sha256').update(gz).digest('hex'));
    expect(res.entries).toBe(1);
  });
});

describe('extractBundle — refusals (each before the offending entry is written)', () => {
  const ok: TarEntry = { path: 'ok.txt', data: 'fine' };
  const cases: Array<[string, () => Uint8Array, BundleRefusalReason, BundleLimits?]> = [
    ['plain tar, not gzip', () => ustar([ok]), 'not_gzip'],
    ['empty stream', () => new Uint8Array(0), 'not_gzip'],
    ['gzip cut short', () => bundle([ok]).subarray(0, 30), 'truncated'],
    ['no end-of-archive blocks', () => bundle([ok], { end: false }), 'truncated'],
    ['file data shorter than its size', () => gzip(ustar([{ ...ok, size: 4096 }], { end: false })), 'truncated'],
    ['bad header checksum', () => bundle([{ ...ok, corruptChecksum: true }]), 'bad_checksum'],
    ['GNU magic', () => bundle([{ ...ok, gnuMagic: true }]), 'entry_type'],
    ['symlink entry', () => bundle([ok, { path: 'link', type: '2', linkname: '/etc/passwd' }]), 'entry_type'],
    ['hardlink entry', () => bundle([ok, { path: 'hard', type: '1', linkname: 'ok.txt' }]), 'entry_type'],
    ['GNU long-name entry', () => bundle([{ path: '././@LongLink', type: 'L', data: 'x' }]), 'entry_type'],
    ['PAX global header', () => bundle([{ path: 'g', type: 'g', data: paxRecord('path', 'x') }]), 'entry_type'],
    ['directory with a size', () => bundle([{ path: 'd/', type: '5', size: 1, data: 'x' }]), 'entry_type'],
    ['PAX key other than path', () => bundle([paxEntry(paxRecord('mtime', '1')), ok]), 'pax_key'],
    ['PAX linkpath', () => bundle([paxEntry(paxRecord('linkpath', '/etc')), ok]), 'pax_key'],
    ['PAX path twice', () => bundle([paxEntry(paxRecord('path', 'a') + paxRecord('path', 'b')), ok]), 'pax_key'],
    ['PAX record malformed', () => bundle([paxEntry('99 path=x\n'), ok]), 'pax_key'],
    ['PAX length splits a UTF-8 char', () => bundle([paxEntry('8 path=\u00e9\n'), ok]), 'pax_key'],
    ['PAX invalid UTF-8', () => bundle([{ ...paxEntry(''), data: new Uint8Array([...new TextEncoder().encode('11 path=a'), 0xff, 0x0a]) }, ok]), 'pax_key'],
    ['PAX then end of archive', () => bundle([ok, paxEntry(paxRecord('path', 'z'))]), 'pax_key'],
    ['PAX then PAX', () => bundle([paxEntry(paxRecord('path', 'a')), paxEntry(paxRecord('path', 'b')), ok]), 'pax_key'],
    ['absolute path', () => bundle([ok, { path: '/etc/cron.d/x', data: 'x' }]), 'absolute_path'],
    ['absolute path via PAX', () => bundle([paxEntry(paxRecord('path', '/tmp/x')), ok]), 'absolute_path'],
    ['.. segment', () => bundle([ok, { path: '../outside/evil', data: 'x' }]), 'dot_segment'],
    ['inner .. segment', () => bundle([{ path: 'a/../../outside/evil', data: 'x' }]), 'dot_segment'],
    ['leading ./', () => bundle([{ path: './a', data: 'x' }]), 'dot_segment'],
    ['empty segment', () => bundle([{ path: 'a//b', data: 'x' }]), 'dot_segment'],
    ['backslash', () => bundle([{ path: 'a\\b', data: 'x' }]), 'dot_segment'],
    ['duplicate file', () => bundle([ok, ok]), 'duplicate_path'],
    ['duplicate dir', () => bundle([{ path: 'd/', type: '5' }, { path: 'd/', type: '5' }]), 'duplicate_path'],
    ['file under a file', () => bundle([ok, { path: 'ok.txt/child', data: 'x' }]), 'duplicate_path'],
    ['file over an implicit dir', () => bundle([{ path: 'd/f', data: 'x' }, { path: 'd', data: 'x' }]), 'duplicate_path'],
    ['path over the cap', () => bundle([paxEntry(paxRecord('path', 'x/'.repeat(512) + 'x')), ok]), 'path_too_long'],
    ['segment over NAME_MAX', () => bundle([paxEntry(paxRecord('path', 'x'.repeat(256))), ok]), 'path_too_long'],
    [
      'too many entries',
      () => bundle([ok, { path: 'b', data: '' }, { path: 'c', data: '' }]),
      'too_many_entries',
      { ...LIMITS, maxEntries: 2 },
    ],
    ['content over maxBytes', () => bundle([{ path: 'big', data: new Uint8Array(2048) }]), 'too_large', { ...LIMITS, maxBytes: 1024 }],
    [
      'gzip bomb after the end blocks',
      () => {
        const raw = ustar([ok]);
        const bomb = new Uint8Array(raw.length + 4 * 1024 * 1024);
        bomb.set(raw);
        return gzip(bomb);
      },
      'too_large',
      { ...LIMITS, maxBytes: 1024, maxEntries: 4 },
    ],
    ['reserved path', () => bundle([ok, { path: 'config_api/server_config_api.php', data: '<?php' }]), 'reserved_path'],
    ['under a reserved path', () => bundle([{ path: 'config_api/server_config_api.php/x', data: 'x' }]), 'reserved_path'],
    // Folded on every fs (not gated on caseInsensitive()): a second spelling is refused.
    ['reserved path, other case', () => bundle([ok, { path: 'CONFIG_API/server_config_api.php', data: '<?php' }]), 'reserved_path'],
    ['under a reserved path, other case', () => bundle([{ path: 'Config_Api/Server_Config_Api.php/x', data: 'x' }]), 'reserved_path'],
  ];

  for (const [name, build, reason, limits] of cases) {
    test(`${name} → ${reason}`, async () => {
      expect(await refusal(build(), limits)).toBe(reason);
    });
  }
});

describe('extractBundle — case-insensitive filesystem', () => {
  // On a case-folding filesystem (macOS APFS default) `A` and `a` are one name: the second
  // spelling must be a bundle refusal (EEXIST → duplicate_path), never a raw fs error.
  test.if(caseInsensitive())('a dir spelled over a file of another case → duplicate_path', async () => {
    expect(await refusal(bundle([{ path: 'A', data: 'x' }, { path: 'a/x', data: 'x' }]))).toBe('duplicate_path');
  });
  test.if(caseInsensitive())('a file spelled over a file of another case → duplicate_path', async () => {
    expect(await refusal(bundle([{ path: 'A', data: 'x' }, { path: 'a', data: 'x' }]))).toBe('duplicate_path');
  });
});

describe('extractBundle — destDir preconditions (caller errors, not bundle refusals)', () => {
  test('a non-empty destDir is refused and left intact', async () => {
    await writeFile(join(dest, 'keep'), 'mine');
    const err = await extractBundle(streamOf(bundle([{ path: 'a', data: 'a' }])), dest, LIMITS, []).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(BundleRefused);
    expect(await readFile(join(dest, 'keep'), 'utf8')).toBe('mine');
  });

  test('a symlinked destDir is refused and its target untouched', async () => {
    const link = join(base, 'link');
    await symlink(outside, link);
    const err = await extractBundle(streamOf(bundle([{ path: 'a', data: 'a' }])), link, LIMITS, []).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(BundleRefused);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(await readdir(outside)).toEqual([]);
  });
});

describe('ustar.ts stays zero-dependency (the root repo imports it)', () => {
  test('every import is a node: builtin', () => {
    const src = readFileSync(join(import.meta.dir, '../src/releases/ustar.ts'), 'utf8');
    // The transpiler's own scan: static imports, re-exports (`export … from`), import(), require().
    const specs = new Bun.Transpiler({ loader: 'ts' }).scanImports(src).map((i) => i.path);
    expect(specs.length).toBeGreaterThan(0);
    // The scan sees every bypass form a line-regex missed.
    const probe = "export { z } from 'zod'; await import('a'); require('b'); import c from 'd';";
    expect(new Bun.Transpiler({ loader: 'ts' }).scanImports(probe).map((i) => i.path).sort()).toEqual(['a', 'b', 'd', 'zod']);
    for (const s of specs) expect(s).toMatch(/^node:/);
  });
});
