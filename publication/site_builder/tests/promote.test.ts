import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile, readFile, readlink, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../src/config';
import { promoteRelease, activateRelease, listReleases, currentRelease } from '../src/build/promote';

const ROOT = config.PREPROD_ROOT;
const SRC = join(config.SITES_ROOT, '__src__');

async function wipe(): Promise<void> {
  await rm(ROOT, { recursive: true, force: true });
  await rm(SRC, { recursive: true, force: true });
}

async function makeSource(content: string): Promise<void> {
  await rm(SRC, { recursive: true, force: true });
  await mkdir(SRC, { recursive: true });
  await writeFile(join(SRC, 'index.html'), content, 'utf8');
}

beforeEach(wipe);
afterEach(wipe);

describe('promoteRelease', () => {
  test('copies the source into a release and points the served symlink at it', async () => {
    await makeSource('<h1>v1</h1>');
    const release = await promoteRelease(ROOT, 'demo', SRC);

    const link = join(ROOT, 'demo');
    expect(existsSync(link)).toBe(true);
    // The symlink target is relative and inside the release store.
    const target = await readlink(link);
    expect(target).toBe(join('.releases', 'demo', release));
    // Serving through the link yields the promoted content.
    expect(await readFile(join(link, 'index.html'), 'utf8')).toBe('<h1>v1</h1>');
    expect(await currentRelease(ROOT, 'demo')).toBe(release);
  });

  test('a second promote swaps the symlink atomically to the new release', async () => {
    await makeSource('<h1>v1</h1>');
    const r1 = await promoteRelease(ROOT, 'demo', SRC);
    await makeSource('<h1>v2</h1>');
    const r2 = await promoteRelease(ROOT, 'demo', SRC);

    expect(r2).not.toBe(r1);
    expect(await readFile(join(ROOT, 'demo', 'index.html'), 'utf8')).toBe('<h1>v2</h1>');
    expect(await currentRelease(ROOT, 'demo')).toBe(r2);
    // The old release still exists on disk (rollback target).
    expect(existsSync(join(ROOT, '.releases', 'demo', r1))).toBe(true);
  });

  test('activateRelease rolls back to a prior release', async () => {
    await makeSource('<h1>v1</h1>');
    const r1 = await promoteRelease(ROOT, 'demo', SRC);
    await makeSource('<h1>v2</h1>');
    await promoteRelease(ROOT, 'demo', SRC);

    await activateRelease(ROOT, 'demo', r1);
    expect(await readFile(join(ROOT, 'demo', 'index.html'), 'utf8')).toBe('<h1>v1</h1>');
    expect(await currentRelease(ROOT, 'demo')).toBe(r1);
  });

  test('activateRelease throws for an unknown release', async () => {
    await makeSource('<h1>v1</h1>');
    await promoteRelease(ROOT, 'demo', SRC);
    await expect(activateRelease(ROOT, 'demo', 'nope')).rejects.toThrow();
  });

  test('prunes releases beyond RELEASES_RETAINED but keeps the current one', async () => {
    // Promote more than the retention limit; give each a distinct id.
    const made: string[] = [];
    for (let i = 0; i < config.RELEASES_RETAINED + 3; i++) {
      await makeSource(`<h1>v${i}</h1>`);
      made.push(await promoteRelease(ROOT, 'demo', SRC));
      // release ids are millisecond-stamped; ensure ordering/uniqueness
      await new Promise(r => setTimeout(r, 2));
    }
    const remaining = await readdir(join(ROOT, '.releases', 'demo'));
    expect(remaining.length).toBeLessThanOrEqual(config.RELEASES_RETAINED);
    // The most recent (current) release survived pruning.
    expect(remaining).toContain(made[made.length - 1]);
  });

  test('listReleases returns newest first', async () => {
    await makeSource('a');
    const r1 = await promoteRelease(ROOT, 'demo', SRC);
    await new Promise(r => setTimeout(r, 2));
    await makeSource('b');
    const r2 = await promoteRelease(ROOT, 'demo', SRC);
    const releases = await listReleases(ROOT, 'demo');
    expect(releases[0]).toBe(r2);
    expect(releases).toContain(r1);
  });
});
