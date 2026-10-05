/**
 * src/media/sha_index.ts — the agent's persisted (path → size, mtimeMs, sha256) cache over
 * the copy root. A CACHE: it answers only for the exact recorded size AND mtime, survives a
 * restart by replay, skips corrupt lines, and compacts itself.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COMPACT_SLACK,
  COPY_STATE_DIR,
  SHA_INDEX_FILE,
  ensureCopyStateDir,
  forgetSha,
  lookupSha,
  recordSha,
  resetShaIndexForTests,
  shaIndexEntries,
} from '../src/media/sha_index';
import { resetInstance, roots } from './fixtures/instance';

const ROOT = roots.mediaRoot as string;
const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const INDEX = join(ROOT, SHA_INDEX_FILE);

function logLines(): string[] {
  return readFileSync(INDEX, 'utf8').split('\n').filter(line => line !== '');
}

beforeEach(async () => {
  await resetInstance();
  resetShaIndexForTests();
});
afterEach(() => resetShaIndexForTests());

describe('sha index', () => {
  test('answers only for the recorded size AND mtime', () => {
    recordSha(ROOT, 'a/b/c.jpg', { size: 3, mtimeMs: 1000.5, sha256: H1 });
    expect(lookupSha(ROOT, 'a/b/c.jpg', 3, 1000.5)).toBe(H1);
    expect(lookupSha(ROOT, 'a/b/c.jpg', 4, 1000.5)).toBeNull();
    expect(lookupSha(ROOT, 'a/b/c.jpg', 3, 1001)).toBeNull();
    expect(lookupSha(ROOT, 'a/b/other.jpg', 3, 1000.5)).toBeNull();
  });

  test('survives a restart by replaying its log; a forget is replayed too', () => {
    recordSha(ROOT, 'p1', { size: 1, mtimeMs: 1, sha256: H1 });
    recordSha(ROOT, 'p2', { size: 2, mtimeMs: 2, sha256: H2 });
    forgetSha(ROOT, 'p1');
    resetShaIndexForTests();
    expect(lookupSha(ROOT, 'p1', 1, 1)).toBeNull();
    expect(lookupSha(ROOT, 'p2', 2, 2)).toBe(H2);
    expect(shaIndexEntries(ROOT)).toBe(1);
  });

  test('a corrupt line costs a re-hash, never a wrong answer', () => {
    ensureCopyStateDir(ROOT);
    writeFileSync(
      INDEX,
      ['garbage', '{"p":1}', '{"p":"x","s":1,"m":1,"h":"short"}', JSON.stringify({ p: 'ok', s: 1, m: 2, h: H1 }), ''].join('\n'),
    );
    expect(lookupSha(ROOT, 'ok', 1, 2)).toBe(H1);
    expect(lookupSha(ROOT, 'x', 1, 1)).toBeNull();
    expect(shaIndexEntries(ROOT)).toBe(1);
  });

  test('compacts once the log outgrows its live entries', () => {
    const rounds = COMPACT_SLACK + 5;
    for (let i = 0; i < rounds; i++) recordSha(ROOT, 'p', { size: i, mtimeMs: i, sha256: H1 });
    expect(logLines().length).toBeLessThan(COMPACT_SLACK);
    resetShaIndexForTests();
    expect(lookupSha(ROOT, 'p', rounds - 1, rounds - 1)).toBe(H1);
    expect(shaIndexEntries(ROOT)).toBe(1);
  });

  test('forgetting an unknown path writes nothing', () => {
    forgetSha(ROOT, 'never-recorded');
    expect(existsSync(INDEX)).toBe(false);
  });

  test('the copy state dir is private to the agent', () => {
    recordSha(ROOT, 'p', { size: 1, mtimeMs: 1, sha256: H1 });
    expect(statSync(join(ROOT, COPY_STATE_DIR)).mode & 0o077).toBe(0);
  });
});
