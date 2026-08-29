/**
 * The fixture's own guard — the suite may only destroy a root that SAYS it is the
 * suite's.
 *
 * `resetInstance()` is an `rm -rf` over three paths that come from an ordinary file
 * (`.env.test`) through an ordinary string. The engine applies exactly this law to its
 * test database (`dedalo_test_marker`) and its test media root (`.dedalo_test_media`):
 * a path is a claim, a marker is the directory itself saying whose it is. Without these
 * tests the marker is decoration — written by every reset, read by nothing.
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  INSTANCE,
  INSTANCE_MARKER,
  allRoots,
  instanceRootIsMarked,
  markInstanceRoot,
  markerPath,
  resetInstance,
  roots,
} from './fixtures/instance';

afterEach(async () => {
  // Leave the instance declared however this file mangled it.
  for (const root of allRoots()) {
    await rm(root, { recursive: true, force: true });
    await markInstanceRoot(root);
  }
});

describe('resetInstance refuses what it does not own', () => {
  test('refuses a populated root with no marker, and destroys nothing', async () => {
    await rm(roots.sitesRoot, { recursive: true, force: true });
    await mkdir(roots.sitesRoot, { recursive: true });
    const precious = join(roots.sitesRoot, 'index.html');
    await writeFile(precious, 'IRREPLACEABLE', 'utf8');

    await expect(resetInstance()).rejects.toThrow(/does not declare itself instance/);
    expect(await readFile(precious, 'utf8')).toBe('IRREPLACEABLE');
  });

  test('refuses a populated root marked for ANOTHER instance', async () => {
    await rm(roots.prodRoot, { recursive: true, force: true });
    await mkdir(roots.prodRoot, { recursive: true });
    await writeFile(markerPath(roots.prodRoot), 'museum-b\n', 'utf8');
    await writeFile(join(roots.prodRoot, 'live.html'), 'B LIVE SITE', 'utf8');

    await expect(resetInstance()).rejects.toThrow(/museum-b/);
    expect(existsSync(join(roots.prodRoot, 'live.html'))).toBe(true);
  });

  test('refuses BEFORE wiping any root, so a bad third root leaves the first two intact', async () => {
    await resetInstance();
    await writeFile(join(roots.sitesRoot, 'ours.txt'), 'ours', 'utf8');
    // Poison the LAST root walked.
    await writeFile(markerPath(roots.prodRoot), 'someone-else\n', 'utf8');
    await writeFile(join(roots.prodRoot, 'theirs.txt'), 'theirs', 'utf8');

    await expect(resetInstance()).rejects.toThrow(/someone-else/);
    expect(existsSync(join(roots.sitesRoot, 'ours.txt'))).toBe(true);
  });

  test('adopts an EMPTY unmarked root rather than punishing a clean checkout', async () => {
    await rm(roots.preprodRoot, { recursive: true, force: true });
    await mkdir(roots.preprodRoot, { recursive: true });
    expect(await instanceRootIsMarked(roots.preprodRoot)).toBe(false);

    await resetInstance();
    expect(await instanceRootIsMarked(roots.preprodRoot)).toBe(true);
  });

  test('a reset leaves every root declared, so the instance stays bootable', async () => {
    await resetInstance();
    for (const root of allRoots()) {
      expect(existsSync(markerPath(root))).toBe(true);
      expect((await readFile(join(root, INSTANCE_MARKER), 'utf8')).trim()).toBe(INSTANCE);
    }
  });
});
