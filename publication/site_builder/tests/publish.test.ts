import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  makeSourceDir,
  provisionSite,
  readServed,
  resetInstance,
  siteDomain,
  surfaceOf,
  workspacePath,
} from './fixtures/instance';
import { assertWithinQuota, createSite, siteDiskUsageMb } from '../src/sites/workspace';
import { readManifest } from '../src/sites/manifest';
import { promoteRelease, currentRelease, releasePath } from '../src/build/promote';
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

  /**
   * THE QUOTA COUNTS THE INCOMING COPY — the argument, not just the call.
   *
   * The test above exceeds the quota with what is ALREADY on disk, so it passes whether or
   * not `treeSizeMb(source)` is passed to `assertWithinQuota`: measured, replacing that
   * third argument with `0` left the whole suite green. Publish is the one operation that
   * DOUBLES a site's footprint (a whole second copy of the release, in the prod store), so
   * the case that matters is a site comfortably within quota whose publish would not be.
   *
   * Built here: the site measures under the cap, and under it again after the publish is
   * refused — so the refusal cannot be explained by the existing bytes.
   */
  test('a publish that would DOUBLE a site past its quota is refused, though the site fits', async () => {
    await makeSite('doubler', 'Doubler');
    // One preprod release of a bit over a third of the quota. Workspace + preprod store
    // then sit under the cap; adding a second copy of the release does not.
    const mb = Math.max(2, Math.ceil(config.SITE_DISK_QUOTA_MB / 3));
    await seedPreprod('doubler', 'x'.repeat(mb * 1024 * 1024));

    const manifest = await readManifest('doubler');
    const before = await siteDiskUsageMb(manifest);
    expect(before.totalMb).toBeLessThan(config.SITE_DISK_QUOTA_MB);
    // The incoming copy is what tips it: the site fits, the site-plus-copy does not.
    expect(before.totalMb + mb).toBeGreaterThan(config.SITE_DISK_QUOTA_MB);
    // And the standing measurement really does pass — so the refusal below is the
    // INCOMING copy being weighed, and nothing else.
    await assertWithinQuota(manifest, 'a turn');

    await expect(publishSite('doubler', ACTOR)).rejects.toThrow(LimitExceededError);
    expect(await currentRelease(surfaceOf('doubler', 'prod'))).toBeNull();
    expect((await readManifest('doubler')).published).toBeNull();
  });

  /**
   * A PREPROD RELEASE THAT HAS BEEN REPLACED BY A SYMLINK IS NEVER PUBLISHED — and it is
   * refused BEFORE the foreign tree is even measured.
   *
   * The release directory was made by this daemon (a staging copy renamed into place), so a
   * link standing there means something replaced it, and "it was ours when we wrote it" is
   * not a property the copy onto a PUBLIC domain should rest on. Two guards now stand in
   * front of that: `confinedRealPath` at the publish caller, and `assertSourceRoot` inside
   * `promoteRelease` (gated in tests/promote.test.ts). They are redundant on the OUTCOME —
   * measured, downgrading this caller to the lexical join still refuses, because the second
   * guard catches it — so the outcome alone cannot hold the caller's choice of helper.
   *
   * WHAT DISTINGUISHES THEM IS WHEN. `confinedRealPath` runs before `treeSizeMb(source)`.
   * With the lexical join the daemon measures the LINK'S TARGET and charges a foreign tree
   * against this museum's quota — so a large enough planted tree turns a symlink refusal
   * into a quota refusal, and a museum is told its site is too big when nothing of its own
   * grew. The tree here is deliberately larger than the quota, and the assertion is that
   * the answer is still the symlink refusal.
   */
  test('a preprod release REPLACED by a symlink is refused as a symlink, before the target is measured', async () => {
    await makeSite('swapped', 'Swapped');
    const release = await seedPreprod('swapped', '<h1>ours</h1>');

    // Somebody else's tree — bigger than this site's whole quota.
    const elsewhere = join(surfaceOf('swapped', 'preprod').webspace, '..', 'not-our-tree');
    await mkdir(elsewhere, { recursive: true });
    await writeFile(
      join(elsewhere, 'index.html'),
      'x'.repeat((config.SITE_DISK_QUOTA_MB + 2) * 1024 * 1024),
      'utf8',
    );
    const releaseDir = releasePath(surfaceOf('swapped', 'preprod'), release);
    await rm(releaseDir, { recursive: true, force: true });
    await symlink(elsewhere, releaseDir);

    const failure = await publishSite('swapped', ACTOR).then(
      () => null,
      (error: unknown) => error as Error,
    );
    expect(failure).not.toBeNull();
    // NOT a quota refusal: the foreign tree was never measured.
    expect(failure).not.toBeInstanceOf(LimitExceededError);
    expect((failure as Error).message).toMatch(/symlink escapes root/);

    // And production serves nothing — in particular not the link's target.
    expect(await currentRelease(surfaceOf('swapped', 'prod'))).toBeNull();
    expect((await readManifest('swapped')).published).toBeNull();
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
