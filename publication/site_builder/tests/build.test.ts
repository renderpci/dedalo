import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  provisionSite,
  resetInstance,
  roots,
  servedPath,
  surfaceOf,
  workspacePath,
} from './fixtures/instance';
import { createSite } from '../src/sites/workspace';
import { readManifest, writeManifest } from '../src/sites/manifest';
import { startBuild, getBuild, latestBuild } from '../src/build/builder';
import { currentRelease } from '../src/build/promote';

const ACTOR = { user_id: 3, username: 'builder-tester' };

/** A site with both halves in place: a provisioned webspace and a created workspace. */
async function makeSite(slug: string, name: string): Promise<void> {
  const { domain } = await provisionSite(slug);
  await createSite({ slug, name, domain, actor: ACTOR });
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

beforeEach(resetInstance);
afterEach(resetInstance);

describe('build runner', () => {
  test('a successful build promotes the output to preprod and records success', async () => {
    await makeSite('buildable', 'Buildable');
    // Promote the template's existing src/ dir as the "output" so no real bundler runs.
    await useTrivialBuild('buildable', 'src', true);

    const { build_id } = await startBuild('buildable');
    await waitForBuild('buildable', build_id);

    const record = await getBuild('buildable', build_id);
    expect(record?.outcome).toBe('success');
    expect(record?.release).toBeTruthy();
    expect(record?.finished_at).toBeTruthy();

    // The preprod symlink now serves the promoted content.
    const release = await currentRelease(surfaceOf('buildable', 'preprod'));
    expect(release).toBe(record!.release);
    expect(existsSync(servedPath('preprod', 'buildable', 'lib', 'dedalo.ts'))).toBe(true);

    // latestBuild reflects it.
    const latest = await latestBuild('buildable');
    expect(latest?.id).toBe(build_id);
  });

  test('a failing build is recorded as failed and nothing is promoted', async () => {
    await makeSite('broken', 'Broken');
    await useTrivialBuild('broken', 'src', false); // build command exits non-zero

    const { build_id } = await startBuild('broken');
    await waitForBuild('broken', build_id);

    const record = await getBuild('broken', build_id);
    expect(record?.outcome).toBe('failed');
    expect(record?.release).toBeNull();
    expect(await currentRelease(surfaceOf('broken', 'preprod'))).toBeNull();
  });

  test('a build for a site whose webspace is gone is refused before it runs', async () => {
    // The build would produce bytes with nowhere to go. Refusing at startBuild is what
    // keeps a museum from waiting five minutes to be told that.
    await makeSite('orphan', 'Orphan');
    await rm(surfaceOf('orphan', 'preprod').webspace, { recursive: true, force: true });
    await expect(startBuild('orphan')).rejects.toThrow(/webspace/);
  });

  test('a build whose output ROOT is a SYMLINK is refused, and nothing outside is served', async () => {
    // L7, through the real pipeline rather than by calling a helper. `promoteRelease` refused
    // a symlinked ENTRY it walked over and never lstat'd the directory it was HANDED, and the
    // builder resolved that directory with the LEXICAL confinedPath — which asks a question
    // about a string. So an agent turn that replaced its output directory with a link got
    // that link's target copied into the release store and SERVED: verified end to end, a
    // file outside the workspace read back through the served link.
    await makeSite('linked', 'Linked');
    await useTrivialBuild('linked', 'out', true);

    // A secret standing in for "anything outside the workspace this daemon can read".
    const outside = join(roots.agentHome, 'outside');
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'stolen.txt'), 'NOT PART OF THIS SITE', 'utf8');
    await symlink(outside, workspacePath('linked', 'out'));

    const { build_id } = await startBuild('linked');
    await waitForBuild('linked', build_id);

    const record = await getBuild('linked', build_id);
    expect(record?.outcome).toBe('failed');
    expect(record?.error).toContain('symbolic link');
    expect(record?.release).toBeNull();
    // Nothing was promoted, so nothing is served — and in particular the file outside the
    // workspace never entered the release store.
    expect(await currentRelease(surfaceOf('linked', 'preprod'))).toBeNull();
    expect(existsSync(servedPath('preprod', 'linked', 'stolen.txt'))).toBe(false);
    expect(existsSync(join(surfaceOf('linked', 'preprod').storeDir))).toBe(false);
  });

  test('a build whose output resolves outside the workspace through a link is refused', async () => {
    // The same trick one level up: the output directory itself is real, but it is reached
    // through a symlinked ancestor. The lexical check approves; the realpath does not.
    await makeSite('via-link', 'Via Link');
    await useTrivialBuild('via-link', 'through/dist', true);

    const outside = join(roots.agentHome, 'elsewhere');
    await mkdir(join(outside, 'dist'), { recursive: true });
    await writeFile(join(outside, 'dist', 'index.html'), 'OUTSIDE', 'utf8');
    await symlink(outside, workspacePath('via-link', 'through'));

    const { build_id } = await startBuild('via-link');
    await waitForBuild('via-link', build_id);

    const record = await getBuild('via-link', build_id);
    expect(record?.outcome).toBe('failed');
    expect(record?.error).toContain('outside the workspace');
    expect(await currentRelease(surfaceOf('via-link', 'preprod'))).toBeNull();
  });

  test('a build whose output dir is missing fails cleanly', async () => {
    await makeSite('nodir', 'No Dir');
    await useTrivialBuild('nodir', 'nonexistent-out', true);

    const { build_id } = await startBuild('nodir');
    await waitForBuild('nodir', build_id);

    const record = await getBuild('nodir', build_id);
    expect(record?.outcome).toBe('failed');
    expect(record?.error).toContain('nonexistent-out');
  });
});
