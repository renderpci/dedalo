import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { rm } from 'node:fs/promises';
import {
  makeSourceDir,
  provisionSite,
  readServed,
  resetInstance,
  siteDomain,
  surfaceOf,
  workspacePath,
} from './fixtures/instance';
import { createSite } from '../src/sites/workspace';
import { readManifest } from '../src/sites/manifest';
import { promoteRelease, currentRelease } from '../src/build/promote';
import { publishSite, rollbackSite, productionReleases } from '../src/build/publish';
import { config } from '../src/config';
import { ConflictError, LimitExceededError } from '../src/errors';

const ACTOR = { user_id: 5, username: 'publisher' };

/**
 * A site that exists on both sides: its webspace provisioned (the operator's half) and its
 * workspace created (the daemon's). That pairing is what publishing now needs.
 */
async function makeSite(slug: string, name: string): Promise<void> {
  const { domain } = await provisionSite(slug);
  await createSite({ slug, name, domain, actor: ACTOR });
}

/** Simulate a build having produced a preprod release with known bytes. */
async function seedPreprod(slug: string, html: string): Promise<string> {
  const src = await makeSourceDir({ 'index.html': html }, workspacePath(slug, 'dist'));
  return promoteRelease(surfaceOf(slug, 'preprod'), src);
}

beforeEach(resetInstance);
afterEach(resetInstance);

describe('publish / rollback', () => {
  test('publish promotes the current preprod bytes to production and records it', async () => {
    await makeSite('pubme', 'Publish Me');
    await seedPreprod('pubme', '<h1>live</h1>');

    const result = await publishSite('pubme', ACTOR);
    // The site's OWN domain, at the root of it — not a shared base URL with the slug as a
    // path segment. (PROD_URL_SCHEME is http in the suite's env; a museum's is https.)
    expect(result.url).toBe(`http://${siteDomain('pubme')}/`);

    // Production serves exactly the previewed bytes.
    expect(await readServed('prod', 'pubme', 'index.html')).toBe('<h1>live</h1>');
    expect(await currentRelease(surfaceOf('pubme', 'prod'))).toBe(result.release);

    // The manifest records who published what.
    const manifest = await readManifest('pubme');
    expect(manifest.published?.release).toBe(result.release);
    expect(manifest.published?.by).toBe('publisher');
  });

  test('publishing with no preprod build is a conflict', async () => {
    await makeSite('empty', 'Empty');
    await expect(publishSite('empty', ACTOR)).rejects.toThrow(ConflictError);
  });

  test('production copy survives deleting the workspace', async () => {
    await makeSite('durable', 'Durable');
    await seedPreprod('durable', '<h1>durable</h1>');
    await publishSite('durable', ACTOR);

    // Remove the workspace entirely; production must still serve.
    await rm(workspacePath('durable'), { recursive: true, force: true });
    expect(await readServed('prod', 'durable', 'index.html')).toBe('<h1>durable</h1>');
  });

  test('a site over quota is refused BEFORE the copy, not after it', async () => {
    // The quota counts the workspace plus BOTH release stores, and it is asked immediately
    // before the promote — the step that adds the copy. A publish that measured first and
    // copied anyway would have already spent the disk it was meant to refuse.
    await makeSite('fat', 'Fat');
    const payload = 'x'.repeat(2 * 1024 * 1024);
    for (let i = 0; i < config.RELEASES_RETAINED; i++) {
      await seedPreprod('fat', payload);
      await new Promise(r => setTimeout(r, 2));
    }

    await expect(publishSite('fat', ACTOR)).rejects.toThrow(LimitExceededError);
    // Nothing was promoted: production has no release at all.
    expect(await currentRelease(surfaceOf('fat', 'prod'))).toBeNull();
    expect((await readManifest('fat')).published).toBeNull();
  });

  test('rollback re-activates a prior production release', async () => {
    await makeSite('roll', 'Roll');
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
