/**
 * Publishing — promote the exact bytes a user previewed on preprod to production.
 *
 * Publish is deliberately NOT a rebuild: it copies the current preprod release (the same
 * artifact the user reviewed) into the production release store and flips the prod
 * symlink. So what goes live is exactly what was approved, and a publish can never
 * surface a different build than the preview showed.
 *
 * Production releases are copies, independent of the workspace and of preprod — deleting
 * either never affects a published site. Rollback re-activates any retained prod release.
 * Both update the manifest's `published` pointer so the site status reflects reality.
 */

import { existsSync } from 'node:fs';
import { confinedRealPath } from '../util/paths';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { readManifest, writeManifest } from '../sites/manifest';
import { assertWithinQuota, siteExists, treeSizeMb } from '../sites/workspace';
import { declaredSurface, siteSurfaces, siteUrl } from '../sites/webspace';
import {
  promoteRelease,
  activateRelease,
  listReleases,
  currentRelease,
  releasePath,
} from './promote';
import type { Actor } from '../security/auth';

export interface PublishResult {
  release: string;
  url: string;
}

/** Promotes the current preprod release to production. Requires a previewed build. */
export async function publishSite(slug: string, actor: Actor): Promise<PublishResult> {
  if (!siteExists(slug)) throw new NotFoundError(`No site named '${slug}'`);

  // BOTH SURFACES OF ONE SITE, out of one webspace — the pair the vhosts serve. Proved
  // before anything is read or copied: the same directory refusal a build gets.
  const manifest = await readManifest(slug);
  const surfaces = siteSurfaces(manifest);

  const preprodRelease = await currentRelease(surfaces.preprod);
  if (!preprodRelease) {
    throw new ConflictError('Nothing to publish — build the site first', 'no_build');
  }
  if (!existsSync(releasePath(surfaces.preprod, preprodRelease))) {
    throw new ConflictError('The current preprod release is missing — rebuild', 'no_build');
  }
  // REALPATH, not the lexical join. This release directory was made by this daemon (a
  // staging copy renamed into place), so a link here would mean something had replaced it —
  // and "it was ours when we wrote it" is not a property the copy that follows should rest
  // on. Same helper, same law as the build output's own resolution.
  const source = confinedRealPath(surfaces.preprod.storeDir, preprodRelease);

  // The quota counts the INCOMING copy: a publish adds a whole second copy of the release,
  // in the prod store, and a gate that weighed only what was already on disk would let the
  // one operation that doubles a site's footprint through unweighed.
  await assertWithinQuota(manifest, `publishing '${slug}'`, await treeSizeMb(source));

  // A COPY, not a re-point. Two stores is what keeps preprod's pruning away from the bytes
  // production serves; sharing them would make a publish free and a prune fatal.
  const prodRelease = await promoteRelease(surfaces.prod, source);

  manifest.published = { release: prodRelease, at: new Date().toISOString(), by: actor.username };
  await writeManifest(manifest);

  return { release: prodRelease, url: siteUrl(manifest, 'prod') };
}

/** Rolls production back to a retained release. */
export async function rollbackSite(slug: string, release: string, actor: Actor): Promise<PublishResult> {
  if (!siteExists(slug)) throw new NotFoundError(`No site named '${slug}'`);
  if (typeof release !== 'string' || release.length === 0) {
    throw new ValidationError('release is required');
  }

  const manifest = await readManifest(slug);
  await activateRelease(siteSurfaces(manifest).prod, release);

  manifest.published = { release, at: new Date().toISOString(), by: actor.username };
  await writeManifest(manifest);

  return { release, url: siteUrl(manifest, 'prod') };
}

/** The production release history (newest first) plus the live one. */
export async function productionReleases(slug: string): Promise<{ releases: string[]; current: string | null }> {
  if (!siteExists(slug)) throw new NotFoundError(`No site named '${slug}'`);
  // A READ: the surface as the PROVISIONER DECLARED it, with no filesystem proving, because
  // proving a webspace includes a WRITE probe and a listing must neither write nor fail. A
  // site with no row in the table has no production tree at all, which lists as nothing —
  // and is true, where the old derived-and-hope answer could have listed another site's.
  const prod = declaredSurface(await readManifest(slug), 'prod');
  if (!prod) return { releases: [], current: null };
  return {
    releases: await listReleases(prod),
    current: await currentRelease(prod),
  };
}
