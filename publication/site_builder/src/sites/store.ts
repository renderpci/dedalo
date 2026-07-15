/**
 * The read side of sites — assembling the status view the engine's UI renders.
 *
 * A site's "status" is the manifest plus the live facts that live outside it: whether a
 * session is currently running (sessions/manager.ts), the last build's outcome, and the
 * currently-served preprod release. This module joins those without owning any of them,
 * so there is one place the /v1/sites shape is defined.
 */

import { existsSync } from 'node:fs';
import { readlink } from 'node:fs/promises';
import { basename } from 'node:path';
import { confinedPath } from '../util/paths';
import { config } from '../config';
import { readManifest, type SiteManifest } from './manifest';
import { listSlugs } from './workspace';
import { getSessionState } from '../sessions/manager';
import { latestBuild, type BuildStatus } from '../build/builder';

export interface SiteStatus {
  manifest: SiteManifest;
  session: { state: 'idle' | 'running' | 'interrupted' | 'error'; session_id: string | null };
  last_build: BuildStatus | null;
  preprod: { url: string; release: string | null };
  published: SiteManifest['published'];
}

export async function siteStatus(slug: string): Promise<SiteStatus> {
  const manifest = await readManifest(slug);
  const session = getSessionState(slug);
  const last_build = await latestBuild(slug);
  const release = await currentPreprodRelease(slug);

  return {
    manifest,
    session,
    last_build,
    preprod: { url: `${config.PREPROD_BASE_URL}/${slug}/`, release },
    published: manifest.published,
  };
}

export async function allSiteStatuses(): Promise<SiteStatus[]> {
  const slugs = await listSlugs();
  const statuses = await Promise.all(slugs.map(slug => siteStatus(slug).catch(() => null)));
  return statuses.filter((s): s is SiteStatus => s !== null);
}

/** The release directory the preprod symlink currently points at, or null. */
async function currentPreprodRelease(slug: string): Promise<string | null> {
  const link = confinedPath(config.PREPROD_ROOT, slug);
  if (!existsSync(link)) return null;
  try {
    const target = await readlink(link);
    return basename(target);
  } catch {
    return null;
  }
}
