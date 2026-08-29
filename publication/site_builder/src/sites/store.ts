/**
 * The read side of sites — assembling the status view the engine's UI renders.
 *
 * A site's "status" is the manifest plus the live facts that live outside it: whether a
 * session is currently running (sessions/manager.ts), the last build's outcome, and the
 * currently-served preprod release. This module joins those without owning any of them,
 * so there is one place the /v1/sites shape is defined.
 */

import { readManifest, type SiteManifest } from './manifest';
import { listSlugs } from './workspace';
import { declaredSurface, siteUrl } from './webspace';
import { currentRelease } from '../build/promote';
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
  // DECLARED, NOT PROVED, and deliberately: this is the dashboard's read. A site whose
  // webspace an operator has removed must show as unbuilt, not blow up the listing — the
  // refusal belongs on the paths that WRITE (build, publish), where it can be acted on. What
  // it is NOT any more is DERIVED: a site the provisioner never declared has no preprod
  // surface to report on, and says so with `null` instead of reporting whatever happens to
  // sit at a path this daemon made up.
  const preprod = declaredSurface(manifest, 'preprod');
  const release = preprod ? await currentRelease(preprod) : null;

  return {
    manifest,
    session,
    last_build,
    preprod: { url: siteUrl(manifest, 'preprod'), release },
    published: manifest.published,
  };
}

/**
 * The status of every site, for the list view. One site whose status cannot be assembled
 * (a corrupt manifest, a half-deleted workspace) is dropped rather than failing the whole
 * listing — a single broken site must not blank the operator's entire dashboard.
 */
export async function allSiteStatuses(): Promise<SiteStatus[]> {
  const slugs = await listSlugs();
  const statuses = await Promise.all(slugs.map(slug => siteStatus(slug).catch(() => null)));
  return statuses.filter((s): s is SiteStatus => s !== null);
}
