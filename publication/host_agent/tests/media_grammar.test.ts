/**
 * src/media/grammar.ts — the agent's copy of the media filename law. The engine-equality
 * half lives in the ROOT gate (test/unit/media_protection_tripwire.test.ts: constants equal,
 * same verdict on the gates' CASES table); this file pins every refusal, the reserved
 * top-level names, and the zero-import rule that lets the root gate load the module without
 * the agent's config. Generic `test` TLD names only.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INSTANCE_MARKER } from '../src/instance/roots';
import {
  ALWAYS_MASTER_TIERS,
  MARKER_KEY,
  MAX_MEDIA_FILE_BYTES,
  MAX_MEDIA_PATH_BYTES,
  MEDIA_WORKING_FILE_EXTENSIONS,
  RESERVED_TOP_LEVEL,
  classifyMediaPath,
  markerKeyOf,
} from '../src/media/grammar';

describe('classifyMediaPath(put): only what the publication_host gate could serve', () => {
  test.each([
    ['image/1.5MB/0/test99_test3_770.jpg', 'test3_770'],
    ['av/404/test95_test3_2.mp4', 'test3_2'],
    ['av/subtitles/test95_test3_2_lg-spa.vtt', 'test3_2'],
    ['image/1.5MB/0/test94_test3_1.jpg', 'test3_1'],
    ['image/1.5MB/dir/deep/test99_test3_770.jpg', 'test3_770'],
  ])('accepts %s as record %s', (path, key) => {
    expect(classifyMediaPath(path, 'put')).toEqual({ ok: true, path, key });
  });

  test.each([
    ['/image/1.5MB/0/test99_test3_770.jpg', 'not_relative'],
    ['image/1.5MB/../original/test99_test3_770.jpg', 'dot_segment'],
    ['image/1.5MB/./test99_test3_770.jpg', 'dot_segment'],
    ['image//1.5MB/test99_test3_770.jpg', 'empty_segment'],
    ['image/1.5MB/0/', 'empty_segment'],
    ['', 'empty_segment'],
    ['.publication/pub/test3_770', 'hidden_segment'],
    ['image/1.5MB/.cache/test99_test3_770.jpg', 'hidden_segment'],
    ['image/thumb/0/.x_test3_770.jpg', 'hidden_segment'],
    ['image/1.5MB/0/test99_test3_770.jpg\u0000', 'control_char'],
    ['image/1.5MB/0/test99\ntest3_770.jpg', 'control_char'],
    ['image/test99_test3_770.jpg', 'too_shallow'],
    ['image/original/0/test99_test3_770.tif', 'master_tier'],
    ['image/ORIGINAL/0/test99_test3_770.tif', 'master_tier'],
    ['image/Modified/0/test99_test3_770.jpg', 'master_tier'],
    ['image/1.5MB/0/test99_test3_770.tmp', 'working_file'],
    ['image/1.5MB/0/test99_test3_770.CSV', 'working_file'],
    ['image/1.5MB/0/my_custom_name.jpg', 'grammar'],
    ['av/404/test95_TEST3_2.mp4', 'grammar'],
  ])('refuses %s (%s)', (path, reason) => {
    expect(classifyMediaPath(path, 'put')).toMatchObject({ ok: false, reason });
  });

  test('a path longer than MAX_MEDIA_PATH_BYTES is refused, counted in BYTES', () => {
    const long = `image/1.5MB/${'é'.repeat(MAX_MEDIA_PATH_BYTES / 2)}_test3_1.jpg`;
    expect(long.length).toBeLessThan(MAX_MEDIA_PATH_BYTES);
    expect(classifyMediaPath(long, 'put')).toMatchObject({ ok: false, reason: 'too_long' });
  });
});

describe('classifyMediaPath(delete): shape only', () => {
  test('a stray, a master and a non-grammar name are deletable (reconcile must remove them)', () => {
    expect(classifyMediaPath('stray.txt', 'delete')).toEqual({ ok: true, path: 'stray.txt', key: null });
    expect(classifyMediaPath('image/original/0/test99_test3_1.tif', 'delete')).toEqual({
      ok: true,
      path: 'image/original/0/test99_test3_1.tif',
      key: 'test3_1',
    });
    expect(classifyMediaPath('image/1.5MB/0/my_custom_name.jpg', 'delete')).toEqual({
      ok: true,
      path: 'image/1.5MB/0/my_custom_name.jpg',
      key: null,
    });
  });

  test('the shape refusals still hold: nothing outside the root, nothing the agent reserves', () => {
    expect(classifyMediaPath('../x.jpg', 'delete')).toMatchObject({ ok: false, reason: 'dot_segment' });
    expect(classifyMediaPath('/etc/passwd', 'delete')).toMatchObject({ ok: false, reason: 'not_relative' });
    expect(classifyMediaPath('.publication/copy/sha_index.ndjson', 'delete')).toMatchObject({
      ok: false,
      reason: 'reserved_segment',
    });
    expect(classifyMediaPath(INSTANCE_MARKER, 'delete')).toMatchObject({ ok: false, reason: 'reserved_segment' });
  });

  test('hidden entries below the reserved names are deletable (the manifest reports them as irregular)', () => {
    expect(classifyMediaPath('image/thumb/0/.x_test3_1.jpg', 'delete')).toEqual({
      ok: true,
      path: 'image/thumb/0/.x_test3_1.jpg',
      key: 'test3_1',
    });
    expect(classifyMediaPath('image/.cache/test99_test3_1.jpg', 'delete')).toMatchObject({ ok: true, key: 'test3_1' });
    expect(classifyMediaPath('.stray', 'delete')).toEqual({ ok: true, path: '.stray', key: null });
    expect(classifyMediaPath('image/1.5MB', 'delete')).toEqual({ ok: true, path: 'image/1.5MB', key: null });
  });
});

describe('markerKeyOf and the constants', () => {
  test("the key is the grammar's last two tokens, the shape MARKER_KEY admits", () => {
    expect(markerKeyOf('test99_test3_770_lg-spa.jpg')).toBe('test3_770');
    expect(markerKeyOf('my_custom_name.jpg')).toBeNull();
    expect(MARKER_KEY.test('test3_770')).toBe(true);
    expect(MARKER_KEY.test('TEST3_770')).toBe(false);
    expect(MARKER_KEY.test('test3_770/x')).toBe(false);
  });

  test('working files and master tiers are the closed lists; the file cap is a safe integer', () => {
    expect([...MEDIA_WORKING_FILE_EXTENSIONS]).toEqual(['deleted', 'temp', 'tmp', 'import', 'csv']);
    expect([...ALWAYS_MASTER_TIERS]).toEqual(['original', 'modified']);
    expect(Number.isSafeInteger(MAX_MEDIA_FILE_BYTES)).toBe(true);
  });

  test('the reserved top-level names are the marker store and the instance marker (src/instance/roots.ts)', () => {
    expect([...RESERVED_TOP_LEVEL]).toEqual(['.publication', INSTANCE_MARKER]);
  });

  test('the module has zero imports (the root media_protection_tripwire loads it)', () => {
    const source = readFileSync(join(import.meta.dir, '..', 'src', 'media', 'grammar.ts'), 'utf8');
    expect(source).not.toMatch(/^\s*import\b/m);
  });
});
