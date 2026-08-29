import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { rm } from 'node:fs/promises';
import {
  makeSourceDir,
  readServed,
  resetInstance,
  roots,
  workspacePath,
} from './fixtures/instance';
import { createSite } from '../src/sites/workspace';
import { readManifest } from '../src/sites/manifest';
import { promoteRelease, currentRelease } from '../src/build/promote';
import { publishSite, rollbackSite, productionReleases } from '../src/build/publish';
import { ConflictError } from '../src/errors';

const ACTOR = { user_id: 5, username: 'publisher' };

/** Simulate a build having produced a preprod release with known bytes. */
async function seedPreprod(slug: string, html: string): Promise<string> {
  const src = await makeSourceDir({ 'index.html': html }, workspacePath(slug, 'dist'));
  return promoteRelease(roots.preprodRoot, slug, src);
}

beforeEach(resetInstance);
afterEach(resetInstance);

describe('publish / rollback', () => {
  test('publish promotes the current preprod bytes to production and records it', async () => {
    await createSite({ slug: 'pubme', name: 'Publish Me', actor: ACTOR });
    await seedPreprod('pubme', '<h1>live</h1>');

    const result = await publishSite('pubme', ACTOR);
    expect(result.url).toContain('pubme');

    // Production serves exactly the previewed bytes.
    expect(await readServed('prod', 'pubme', 'index.html')).toBe('<h1>live</h1>');
    expect(await currentRelease(roots.prodRoot, 'pubme')).toBe(result.release);

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
    await rm(workspacePath('durable'), { recursive: true, force: true });
    expect(await readServed('prod', 'durable', 'index.html')).toBe('<h1>durable</h1>');
  });

  test('rollback re-activates a prior production release', async () => {
    await createSite({ slug: 'roll', name: 'Roll', actor: ACTOR });
    await seedPreprod('roll', '<h1>v1</h1>');
    const first = await publishSite('roll', ACTOR);
    await new Promise(r => setTimeout(r, 2));
    await seedPreprod('roll', '<h1>v2</h1>');
    const second = await publishSite('roll', ACTOR);

    expect(await readServed('prod', 'roll', 'index.html')).toBe('<h1>v2</h1>');

    await rollbackSite('roll', first.release, ACTOR);
    expect(await readServed('prod', 'roll', 'index.html')).toBe('<h1>v1</h1>');

    const history = await productionReleases('roll');
    expect(history.current).toBe(first.release);
    expect(history.releases).toContain(second.release);
  });
});
