import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync } from 'node:fs';
import { rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../src/config';
import { createSite } from '../src/sites/workspace';
import { readManifest } from '../src/sites/manifest';
import { promoteRelease, currentRelease } from '../src/build/promote';
import { publishSite, rollbackSite, productionReleases } from '../src/build/publish';
import { ConflictError } from '../src/errors';

const ACTOR = { user_id: 5, username: 'publisher' };

async function wipe(): Promise<void> {
  await rm(config.SITES_ROOT, { recursive: true, force: true });
  await rm(config.PREPROD_ROOT, { recursive: true, force: true });
  await rm(config.PROD_ROOT, { recursive: true, force: true });
}

/** Simulate a build having produced a preprod release with known bytes. */
async function seedPreprod(slug: string, html: string): Promise<string> {
  const src = join(config.SITES_ROOT, slug, 'dist');
  await rm(src, { recursive: true, force: true });
  await Bun.write(join(src, 'index.html'), html);
  return promoteRelease(config.PREPROD_ROOT, slug, src);
}

beforeEach(wipe);
afterEach(wipe);

describe('publish / rollback', () => {
  test('publish promotes the current preprod bytes to production and records it', async () => {
    await createSite({ slug: 'pubme', name: 'Publish Me', actor: ACTOR });
    await seedPreprod('pubme', '<h1>live</h1>');

    const result = await publishSite('pubme', ACTOR);
    expect(result.url).toContain('pubme');

    // Production serves exactly the previewed bytes.
    expect(await readFile(join(config.PROD_ROOT, 'pubme', 'index.html'), 'utf8')).toBe('<h1>live</h1>');
    expect(await currentRelease(config.PROD_ROOT, 'pubme')).toBe(result.release);

    // The manifest records who published what.
    const manifest = await readManifest('pubme');
    expect(manifest.published?.release).toBe(result.release);
    expect(manifest.published?.by).toBe('publisher');
  });

  test('publishing with no preprod build is a conflict', async () => {
    await createSite({ slug: 'empty', name: 'Empty', actor: ACTOR });
    await expect(publishSite('empty', ACTOR)).rejects.toThrow(ConflictError);
  });

  test('production copy survives deleting the workspace', async () => {
    await createSite({ slug: 'durable', name: 'Durable', actor: ACTOR });
    await seedPreprod('durable', '<h1>durable</h1>');
    await publishSite('durable', ACTOR);

    // Remove the workspace entirely; production must still serve.
    await rm(join(config.SITES_ROOT, 'durable'), { recursive: true, force: true });
    expect(await readFile(join(config.PROD_ROOT, 'durable', 'index.html'), 'utf8')).toBe('<h1>durable</h1>');
  });

  test('rollback re-activates a prior production release', async () => {
    await createSite({ slug: 'roll', name: 'Roll', actor: ACTOR });
    await seedPreprod('roll', '<h1>v1</h1>');
    const first = await publishSite('roll', ACTOR);
    await new Promise(r => setTimeout(r, 2));
    await seedPreprod('roll', '<h1>v2</h1>');
    const second = await publishSite('roll', ACTOR);

    expect(await readFile(join(config.PROD_ROOT, 'roll', 'index.html'), 'utf8')).toBe('<h1>v2</h1>');

    await rollbackSite('roll', first.release, ACTOR);
    expect(await readFile(join(config.PROD_ROOT, 'roll', 'index.html'), 'utf8')).toBe('<h1>v1</h1>');

    const history = await productionReleases('roll');
    expect(history.current).toBe(first.release);
    expect(history.releases).toContain(second.release);
  });
});
