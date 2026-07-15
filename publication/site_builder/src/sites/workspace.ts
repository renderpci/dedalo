/**
 * Workspace lifecycle — create and delete the on-disk site.
 *
 * A workspace is a directory under SITES_ROOT/<slug>/ containing the git repo, the
 * manifest, the agent context file, the daemon's private .builder/ state, and (once the
 * agent runs) the site source. Creation scaffolds a template, writes the manifest, writes
 * AGENTS.md and inits git. Deletion removes the workspace and the preprod symlink; the
 * production copy is left alone unless an explicit purge is requested (prod is a separate
 * tree precisely so a workspace delete cannot take down a live site).
 */

import { mkdir, rm, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { confinedPath } from '../util/paths';
import { config } from '../config';
import { isValidSlug } from '../util/slug';
import { ValidationError, ConflictError, LimitExceededError, NotFoundError } from '../errors';
import { manifestSchema, writeManifest, type SiteManifest } from './manifest';
import { scaffold, templateExists } from './template';
import { writeAgentsFile } from '../context/agents_md';
import { initRepo } from './git';
import type { Actor } from '../security/auth';

export interface CreateSiteInput {
  slug: string;
  name: string;
  template?: string;
  driver?: 'claude_code' | 'opencode' | 'pi';
  actor: Actor;
}

function workspaceDir(slug: string): string {
  return confinedPath(config.SITES_ROOT, slug);
}

export function siteExists(slug: string): boolean {
  return isValidSlug(slug) && existsSync(join(config.SITES_ROOT, slug, 'site.json'));
}

/** Lists slugs of existing sites (directories under SITES_ROOT that hold a site.json). */
export async function listSlugs(): Promise<string[]> {
  if (!existsSync(config.SITES_ROOT)) return [];
  const entries = await readdir(config.SITES_ROOT, { withFileTypes: true });
  const slugs: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue; // .audit and friends
    if (existsSync(join(config.SITES_ROOT, entry.name, 'site.json'))) {
      slugs.push(entry.name);
    }
  }
  return slugs.sort();
}

/**
 * Creates a site: validate the slug/name, refuse a duplicate or an over-cap instance,
 * confirm the template exists, then scaffold → write manifest → write AGENTS.md → init git
 * in that order (git init last so the first commit captures the fully-scaffolded tree). Any
 * failure past the mkdir rolls the whole directory back (see the catch), so a failed create
 * leaves nothing behind and is retryable with the same slug.
 */
export async function createSite(input: CreateSiteInput): Promise<SiteManifest> {
  if (!isValidSlug(input.slug)) {
    throw new ValidationError(
      'slug must be 2–40 chars, lowercase letters/digits/hyphens, starting with a letter',
    );
  }
  if (typeof input.name !== 'string' || input.name.trim().length === 0 || input.name.length > 200) {
    throw new ValidationError('name must be a non-empty string up to 200 chars');
  }
  if (siteExists(input.slug)) {
    throw new ConflictError(`A site named '${input.slug}' already exists`, 'slug_exists');
  }

  const existing = await listSlugs();
  if (existing.length >= config.MAX_SITES) {
    throw new LimitExceededError(`Site limit reached (${config.MAX_SITES})`, 'max_sites');
  }

  const templateId = input.template ?? 'basic';
  if (!(await templateExists(templateId))) {
    throw new ValidationError(`Unknown template '${templateId}'`);
  }

  const dir = workspaceDir(input.slug);
  await mkdir(dir, { recursive: true });

  try {
    await scaffold(input.slug, templateId);

    const manifest: SiteManifest = manifestSchema.parse({
      slug: input.slug,
      name: input.name.trim(),
      owner_user_id: input.actor.user_id,
      created_at: new Date().toISOString(),
      driver: input.driver ?? config.AGENT_DRIVER,
      template: templateId,
      build: {},
      published: null,
    });
    await writeManifest(manifest);
    await writeAgentsFile(manifest);
    await mkdir(join(dir, '.builder'), { recursive: true });
    await initRepo(input.slug);

    return manifest;
  } catch (error) {
    // Roll back a half-created workspace so a failed create is retryable with the same
    // slug rather than wedged behind a directory that has no valid manifest.
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

/** Removes the workspace and preprod symlink. Prod copy removed only when purgeProd. */
export async function deleteSite(slug: string, purgeProd: boolean): Promise<void> {
  if (!siteExists(slug)) {
    throw new NotFoundError(`No site named '${slug}'`);
  }
  await rm(workspaceDir(slug), { recursive: true, force: true });
  // Preprod symlink (points into a release dir) — safe to unlink; releases are pruned
  // by the promote layer.
  await rm(confinedPath(config.PREPROD_ROOT, slug), { recursive: true, force: true }).catch(() => {});
  await rm(confinedPath(config.PREPROD_ROOT, '.releases', slug), { recursive: true, force: true }).catch(() => {});
  if (purgeProd) {
    await rm(confinedPath(config.PROD_ROOT, slug), { recursive: true, force: true }).catch(() => {});
    await rm(confinedPath(config.PROD_ROOT, '.releases', slug), { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Disk usage of a workspace in megabytes (recursive). Used for the quota gate. Symlinks are
 * skipped rather than followed, so the walk cannot escape the workspace or double-count a
 * release the workspace happens to link to — the measured number is the workspace's own
 * footprint.
 */
export async function workspaceSizeMb(slug: string): Promise<number> {
  const dir = workspaceDir(slug);
  let bytes = 0;
  async function walk(path: string): Promise<void> {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(path, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        const info = await stat(full).catch(() => null);
        if (info) bytes += info.size;
      }
    }
  }
  await walk(dir);
  return bytes / (1024 * 1024);
}
