import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync } from 'node:fs';
import { rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../src/config';
import { createSite } from '../src/sites/workspace';
import { readManifest, writeManifest } from '../src/sites/manifest';
import { startBuild, getBuild, latestBuild } from '../src/build/builder';
import { currentRelease } from '../src/build/promote';

const ACTOR = { user_id: 3, username: 'builder-tester' };

async function wipe(): Promise<void> {
  await rm(config.SITES_ROOT, { recursive: true, force: true });
  await rm(config.PREPROD_ROOT, { recursive: true, force: true });
  await rm(config.PROD_ROOT, { recursive: true, force: true });
}

async function waitForBuild(slug: string, id: string): Promise<void> {
  const start = Date.now();
  for (;;) {
    const record = await getBuild(slug, id);
    if (record && record.outcome !== 'running') return;
    if (Date.now() - start > 8000) throw new Error('build never finished');
    await new Promise(r => setTimeout(r, 20));
  }
}

/** Rewrites a site's build spec to trivial, network-free, shell-free commands. */
async function useTrivialBuild(slug: string, output: string, buildOk: boolean): Promise<void> {
  const manifest = await readManifest(slug);
  manifest.build = { install: 'true', build: buildOk ? 'true' : 'false', output };
  await writeManifest(manifest);
}

beforeEach(wipe);
afterEach(wipe);

describe('build runner', () => {
  test('a successful build promotes the output to preprod and records success', async () => {
    await createSite({ slug: 'buildable', name: 'Buildable', actor: ACTOR });
    // Promote the template's existing src/ dir as the "output" so no real bundler runs.
    await useTrivialBuild('buildable', 'src', true);

    const { build_id } = await startBuild('buildable');
    await waitForBuild('buildable', build_id);

    const record = await getBuild('buildable', build_id);
    expect(record?.outcome).toBe('success');
    expect(record?.release).toBeTruthy();
    expect(record?.finished_at).toBeTruthy();

    // The preprod symlink now serves the promoted content.
    const release = await currentRelease(config.PREPROD_ROOT, 'buildable');
    expect(release).toBe(record!.release);
    expect(existsSync(join(config.PREPROD_ROOT, 'buildable', 'lib', 'dedalo.ts'))).toBe(true);

    // latestBuild reflects it.
    const latest = await latestBuild('buildable');
    expect(latest?.id).toBe(build_id);
  });

  test('a failing build is recorded as failed and nothing is promoted', async () => {
    await createSite({ slug: 'broken', name: 'Broken', actor: ACTOR });
    await useTrivialBuild('broken', 'src', false); // build command exits non-zero

    const { build_id } = await startBuild('broken');
    await waitForBuild('broken', build_id);

    const record = await getBuild('broken', build_id);
    expect(record?.outcome).toBe('failed');
    expect(record?.release).toBeNull();
    expect(await currentRelease(config.PREPROD_ROOT, 'broken')).toBeNull();
  });

  test('a build whose output dir is missing fails cleanly', async () => {
    await createSite({ slug: 'nodir', name: 'No Dir', actor: ACTOR });
    await useTrivialBuild('nodir', 'nonexistent-out', true);

    const { build_id } = await startBuild('nodir');
    await waitForBuild('nodir', build_id);

    const record = await getBuild('nodir', build_id);
    expect(record?.outcome).toBe('failed');
    expect(record?.error).toContain('nonexistent-out');
  });
});
