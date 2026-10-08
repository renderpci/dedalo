/**
 * bun_asset.ts — the TS half of the Bun archive's trust (spec S7, §1.3): asset choice, the
 * committed table's strict grammar, the SHASUMS cross-check, the verdict, the release URL.
 * Also holds the COMMITTED `.bun-sha256` (repo root) to this grammar and to `.bun-version`.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUN_ASSETS } from '../src/provision/exec_contract';
import {
  BUN_RELEASE_BASE,
  BunAssetError,
  bunReleaseUrl,
  parseShasums,
  parseShaTable,
  pickAsset,
  sha256Hex,
  verifyArchive,
} from '../src/provision/init/bun_asset';
import { fakeBunZip, shaTable } from './fixtures/bun/zip_store';

const REPO = join(import.meta.dir, '..', '..', '..');
const PIN = '9.9.9';
const ZIP = fakeBunZip('bun-linux-x64', PIN);
const SHA = sha256Hex(ZIP);
const TABLE = shaTable(PIN, { 'bun-linux-x64': SHA });

describe('pickAsset', () => {
  test('x64 with and without AVX2, aarch64', () => {
    expect(pickAsset({ arch: 'x64', avx2: true, musl: false })).toBe('bun-linux-x64');
    expect(pickAsset({ arch: 'x64', avx2: false, musl: false })).toBe('bun-linux-x64-baseline');
    expect(pickAsset({ arch: 'aarch64', avx2: false, musl: false })).toBe('bun-linux-aarch64');
  });
  test('musl and an unknown CPU are refused', () => {
    expect(() => pickAsset({ arch: 'x64', avx2: true, musl: true })).toThrow(/musl/);
    expect(() => pickAsset({ arch: 'other', avx2: false, musl: false })).toThrow(BunAssetError);
  });
});

describe('parseShaTable', () => {
  test('the grammar round-trips, with or without the final newline', () => {
    const parsed = parseShaTable(TABLE);
    expect(parsed.pin).toBe(PIN);
    expect(parsed.signedBy).toBe('A'.repeat(40));
    expect(parsed.hashes['bun-linux-x64']).toBe(SHA);
    expect(parseShaTable(TABLE.slice(0, -1)).hashes['bun-linux-x64']).toBe(SHA);
  });
  test.each([
    ['a missing signed-by line', TABLE.replace(/# signed-by: .*\n/, '')],
    ['a lowercase fingerprint', TABLE.replace('A'.repeat(40), 'a'.repeat(40))],
    ['a header without the pin', TABLE.replace('# bun-v9.9.9', '# bun-v9.9')],
    ['assets out of order', TABLE.replace('bun-linux-aarch64.zip', 'bun-linux-x64-baseline.zip')],
    ['an extra line', `${TABLE}${'0'.repeat(64)}  bun-linux-x64.zip\n`],
    ['one space between hash and name', TABLE.replace(`${SHA}  `, `${SHA} `)],
    ['an uppercase hash', TABLE.replace(SHA, SHA.toUpperCase())],
    ['CRLF lines', TABLE.replace(/\n/g, '\r\n')],
  ])('%s is refused', (_what, text) => {
    expect(() => parseShaTable(text)).toThrow(BunAssetError);
  });
});

describe('parseShasums', () => {
  test('lines, CRLF tolerated, blanks ignored', () => {
    expect(parseShasums(`${SHA}  bun-linux-x64.zip\r\n\n${'1'.repeat(64)}  other.zip\n`)).toEqual([
      { sha: SHA, name: 'bun-linux-x64.zip' },
      { sha: '1'.repeat(64), name: 'other.zip' },
    ]);
  });
  test('an unreadable line is refused, not skipped', () => {
    expect(() => parseShasums(`${SHA}  bun-linux-x64.zip\ngarbage\n`)).toThrow(/line 2/);
  });
});

describe('verifyArchive', () => {
  const sums = `${'2'.repeat(64)}  bun-linux-aarch64.zip\n${SHA}  bun-linux-x64.zip\n`;
  test('the pinned bytes pass, with and without the cross-check', () => {
    expect(verifyArchive(ZIP, 'bun-linux-x64', PIN, TABLE, null)).toEqual({ ok: true, sha: SHA });
    expect(verifyArchive(ZIP, 'bun-linux-x64', PIN, TABLE, sums)).toEqual({ ok: true, sha: SHA });
  });
  test('one mutated byte is refused', () => {
    const bad = ZIP.slice();
    bad[40] = (bad[40] ?? 0) ^ 1;
    const verdict = verifyArchive(bad, 'bun-linux-x64', PIN, TABLE, null);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain('not the pinned release');
  });
  test('table pin ≠ source pin is refused', () => {
    const verdict = verifyArchive(ZIP, 'bun-linux-x64', '9.9.8', TABLE, null);
    expect(verdict.ok ? '' : verdict.reason).toContain('disagree');
  });
  test('sums disagreeing, sums naming the asset twice or never, garbage sums: refused', () => {
    for (const text of [
      `${'3'.repeat(64)}  bun-linux-x64.zip\n`,
      `${SHA}  bun-linux-x64.zip\n${SHA}  bun-linux-x64.zip\n`,
      `${SHA}  bun-linux-aarch64.zip\n`,
      'nope\n',
    ]) {
      expect(verifyArchive(ZIP, 'bun-linux-x64', PIN, TABLE, text).ok).toBe(false);
    }
  });
  test('a foreign asset, a bad pin, a broken table: refused', () => {
    expect(verifyArchive(ZIP, 'bun-darwin-aarch64', PIN, TABLE, null).ok).toBe(false);
    expect(verifyArchive(ZIP, 'bun-linux-x64', 'latest', TABLE, null).ok).toBe(false);
    expect(verifyArchive(ZIP, 'bun-linux-x64', PIN, 'x', null).ok).toBe(false);
  });
});

describe('bunReleaseUrl', () => {
  test('the default base and a mirror', () => {
    expect(bunReleaseUrl('1.4.2', 'bun-linux-x64')).toBe(`${BUN_RELEASE_BASE}/bun-v1.4.2/bun-linux-x64.zip`);
    expect(bunReleaseUrl('1.4.2', 'bun-linux-aarch64', 'https://mirror.example.org/bun')).toBe(
      'https://mirror.example.org/bun/bun-v1.4.2/bun-linux-aarch64.zip',
    );
  });
  test('http, a trailing slash, a bad pin or asset are refused', () => {
    expect(() => bunReleaseUrl('1.4.2', 'bun-linux-x64', 'http://mirror.example.org')).toThrow(/https/);
    expect(() => bunReleaseUrl('1.4.2', 'bun-linux-x64', 'https://mirror.example.org/')).toThrow(/https/);
    expect(() => bunReleaseUrl('1.4', 'bun-linux-x64')).toThrow(/pin/);
    expect(() => bunReleaseUrl('1.4.2', 'bun-windows-x64')).toThrow(/asset/);
  });
});

describe('the committed table', () => {
  test('.bun-sha256 parses, is for .bun-version, and lists BUN_ASSETS', () => {
    const table = parseShaTable(readFileSync(join(REPO, '.bun-sha256'), 'utf8'));
    expect(table.pin).toBe(readFileSync(join(REPO, '.bun-version'), 'utf8').trim());
    expect(Object.keys(table.hashes)).toEqual([...BUN_ASSETS]);
  });
});
