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
import { config } from '../config';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { readManifest, writeManifest } from '../sites/manifest';
import { siteExists } from '../sites/workspace';
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

  const preprodRelease = await currentRelease(config.PREPROD_ROOT, slug);
  if (!preprodRelease) {
    throw new ConflictError('Nothing to publish — build the site first', 'no_build');
  }
  const source = releasePath(config.PREPROD_ROOT, slug, preprodRelease);
  if (!existsSync(source)) {
    throw new ConflictError('The current preprod release is missing — rebuild', 'no_build');
  }

  const prodRelease = await promoteRelease(config.PROD_ROOT, slug, source);

  const manifest = await readManifest(slug);
  manifest.published = { release: prodRelease, at: new Date().toISOString(), by: actor.username };
  await writeManifest(manifest);

  return { release: prodRelease, url: `${config.PROD_BASE_URL.replace(/\/$/, '')}/${slug}/` };
}

/** Rolls production back to a retained release. */
export async function rollbackSite(slug: string, release: string, actor: Actor): Promise<PublishResult> {
  if (!siteExists(slug)) throw new NotFoundError(`No site named '${slug}'`);
  if (typeof release !== 'string' || release.length === 0) {
    throw new ValidationError('release is required');
  }

  await activateRelease(config.PROD_ROOT, slug, release);

  const manifest = await readManifest(slug);
  manifest.published = { release, at: new Date().toISOString(), by: actor.username };
  await writeManifest(manifest);

  return { release, url: `${config.PROD_BASE_URL.replace(/\/$/, '')}/${slug}/` };
}

/** The production release history (newest first) plus the live one. */
export async function productionReleases(slug: string): Promise<{ releases: string[]; current: string | null }> {
  if (!siteExists(slug)) throw new NotFoundError(`No site named '${slug}'`);
  return {
    releases: await listReleases(config.PROD_ROOT, slug),
    current: await currentRelease(config.PROD_ROOT, slug),
  };
}
