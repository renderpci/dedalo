import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { INSTANCE_MARKER, STATE_SUBDIRS, markerContent } from '../src/instance/roots';
import {
  INSTANCE,
  SCRATCH_ROOT,
  allRoots,
  assertDestroyable,
  isMarked,
  markerPath,
  resetInstance,
  roots,
  scratchPath,
  statePath,
} from './fixtures/instance';

const GUARD_DIR = scratchPath('guard_gate');

afterEach(() => rmSync(GUARD_DIR, { recursive: true, force: true }));

describe('the test instance seam', () => {
  test('.env.test and the fixture agree on the instance name', () => {
    const env = readFileSync(join(import.meta.dir, '..', '.env.test'), 'utf8');
    expect(env.match(/^INSTANCE=(.*)$/m)?.[1]?.trim()).toBe(INSTANCE);
  });

  test('every root lives inside the scratch tree', () => {
    expect(allRoots().length).toBe(3);
    for (const root of allRoots()) expect(root.startsWith(`${SCRATCH_ROOT}/`)).toBe(true);
  });

  test('resetInstance leaves a marked state root with its fixed children and empty media/socket dirs', async () => {
    await resetInstance();
    expect(isMarked(SCRATCH_ROOT)).toBe(true);
    expect(readFileSync(markerPath(roots.stateRoot), 'utf8')).toBe(markerContent(INSTANCE));
    for (const sub of STATE_SUBDIRS) expect(existsSync(statePath(sub))).toBe(true);
    expect(readdirSync(roots.mediaRoot!)).toEqual([]);
    expect(readdirSync(roots.socketDir!)).toEqual([]);
  });

  test('resetInstance removes what a previous test left behind', async () => {
    await resetInstance();
    writeFileSync(statePath('rules', 'leftover.conf'), 'x');
    mkdirSync(join(roots.mediaRoot!, 'image'), { recursive: true });
    await resetInstance();
    expect(existsSync(statePath('rules', 'leftover.conf'))).toBe(false);
    expect(readdirSync(roots.mediaRoot!)).toEqual([]);
  });

  test('a non-empty directory that does not declare this instance is refused, untouched', () => {
    mkdirSync(GUARD_DIR, { recursive: true });
    writeFileSync(join(GUARD_DIR, 'precious'), 'x');
    expect(() => assertDestroyable(GUARD_DIR)).toThrow('refuses to wipe');
    writeFileSync(join(GUARD_DIR, INSTANCE_MARKER), markerContent('other'));
    expect(() => assertDestroyable(GUARD_DIR)).toThrow('refuses to wipe');
    expect(existsSync(join(GUARD_DIR, 'precious'))).toBe(true);
  });

  test('absent, empty and marked directories are destroyable', () => {
    expect(() => assertDestroyable(GUARD_DIR)).not.toThrow();
    mkdirSync(GUARD_DIR, { recursive: true });
    expect(() => assertDestroyable(GUARD_DIR)).not.toThrow();
    writeFileSync(join(GUARD_DIR, 'x'), 'x');
    writeFileSync(join(GUARD_DIR, INSTANCE_MARKER), markerContent(INSTANCE));
    expect(() => assertDestroyable(GUARD_DIR)).not.toThrow();
  });

  test('a scratch path outside the scratch tree is refused', () => {
    expect(() => scratchPath('..', 'escape')).toThrow('is not inside');
    expect(dirname(GUARD_DIR)).toBe(SCRATCH_ROOT);
  });
});
