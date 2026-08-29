/**
 * Workspace lifecycle — create and delete the on-disk site.
 *
 * A workspace is a directory under SITES_ROOT/<slug>/ containing the git repo, the
 * manifest, the agent context file, the daemon's private .builder/ state, and (once the
 * agent runs) the site source. Creation scaffolds a template, writes the manifest, writes
 * AGENTS.md and inits git. Deletion removes the workspace and the preprod symlink; the
 * production copy is left alone unless an explicit purge is requested (prod is a separate
 * tree precisely so a workspace delete cannot take down a live site).
 *
 * EVERY SERVED PATH THIS MODULE TOUCHES IS A PROVED PATH. Creation refuses a site the
 * provisioner never declared and a domain another site already owns; deletion — which is an
 * `rm -rf` at a directory a web server is reading — operates only on rows of the
 * provisioner's site table whose webspace carries THIS instance's marker. There is no
 * unchecked variant left to reach for: the one that existed (`siteSurfaceUnchecked`) derived
 * its own path, and a delete aimed at a derived path is a delete aimed at whatever that
 * derivation happens to produce on the day the two sides disagree.
 */

import { mkdir, rm, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { confinedPath } from '../util/paths';
import { config } from '../config';
import { isValidSlug } from '../util/slug';
import { DOMAIN_PATTERN, type Surface } from '../provision/layout';
import { ValidationError, ConflictError, LimitExceededError, NotFoundError } from '../errors';
import { manifestSchema, readManifest, writeManifest, type SiteManifest } from './manifest';
import { scaffold, templateExists } from './template';
import { writeAgentsFile } from '../context/agents_md';
import { initRepo } from './git';
import { assertWebspace, declaredSurface, siteSurface, WebspaceError } from './webspace';
import type { Actor } from '../security/auth';

export interface CreateSiteInput {
  slug: string;
  name: string;
  /**
   * The domain this site will answer on — the pairing with the webspace the provisioner
   * created for it. Supplied by the operator (through the engine), never invented here: a
   * domain needs DNS, a vhost and a certificate, and none of the three is this daemon's.
   */
  domain: string;
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
 * WHICH EXISTING SITE ALREADY ANSWERS ON `domain`, or null.
 *
 * Read off the manifests rather than off the site table, deliberately: the table says which
 * domains the provisioner PREPARED, and this question is which of them a site has already
 * been created on. A manifest too broken to read is skipped rather than fatal — it cannot
 * be evidence that a domain is taken, and a corrupt site.json must not make every create
 * impossible.
 */
async function siteOwningDomain(domain: string): Promise<string | null> {
  for (const slug of await listSlugs()) {
    const manifest = await readManifest(slug).catch(() => null);
    if (manifest && manifest.domain === domain) return slug;
  }
  return null;
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

  // WHERE IT WILL PUBLISH, PROVED BEFORE ANYTHING IS SCAFFOLDED. A site whose webspace the
  // provisioner never created has nowhere to go; discovering that after an agent has spent
  // an afternoon building it is discovering it at the worst possible moment. The manifest
  // schema has already been given the same grammar, so a malformed domain fails as a
  // validation error below rather than as a missing directory.
  const domain = typeof input.domain === 'string' ? input.domain.trim().toLowerCase() : '';
  if (!DOMAIN_PATTERN.test(domain)) {
    throw new ValidationError(
      `domain must be a lowercase dotted hostname (got '${input.domain}'). It is the domain ` +
        `this site answers on, and the webspace the provisioner created for it is named after ` +
        `it.`,
    );
  }
  // ONE HOSTNAME IS ONE SITE — the same rule the provisioner enforces over the declaration
  // (`schema.ts`: "two vhosts racing for the same name, where the winner is whichever file
  // the web server read last"), enforced here over what actually exists on the daemon.
  //
  // Without it a second site could be created on a domain another site already answers on,
  // and the daemon would hand both the SAME webspace, the same release stores and the same
  // served links: publishing the second silently replaces the first's live production bytes.
  // Measured over the socket before this check existed — the create returned 201 and the new
  // site reported the existing site's release.
  const owner = await siteOwningDomain(domain);
  if (owner !== null) {
    throw new ConflictError(
      `The domain '${domain}' already belongs to the site '${owner}'. One hostname is one ` +
        `site: the two would share a webspace, a release store and a served link, and ` +
        `publishing this one would replace '${owner}'s live pages. Nothing was created.`,
      'domain_taken',
    );
  }

  // WHERE IT WILL PUBLISH — the provisioner's own row for this site, then the directory it
  // names, proved to exist, to declare itself ours and to be writable.
  assertWebspace(input.slug, domain);

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
      domain,
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

/** What a delete actually did — reported, because half of it can legitimately not happen. */
export interface DeleteSiteResult {
  readonly slug: string;
  /** The surfaces whose served link and release store were removed. */
  readonly removed: readonly Surface[];
  /** The surfaces left alone, and the refusal that says why. */
  readonly skipped: readonly { readonly surface: Surface; readonly reason: string }[];
}

/**
 * Removes the workspace and the site's DRAFT surface. Production is removed only when
 * purgeProd — prod is a separate copy precisely so a workspace delete cannot take down a
 * live site, and "delete the site I was working on" must not mean "take the museum's
 * published pages off the internet" unless somebody said so.
 *
 * The site's webspace itself is NOT removed: the provisioner created it, owns its mode and
 * ownership, and both vhosts still name it. What goes is what this daemon put there — the
 * served link and the release store of the surface being deleted.
 *
 * EVERY PATH IT DELETES IS PROVED FIRST, and this is the half that was wrong. The old code
 * derived the paths (`<WEBSPACE_BASE>/<domain>`, from the manifest, unchecked) and `rm -rf`'d
 * them: for a site using the declaration's `webspace` override that is a delete aimed at a
 * directory belonging to whatever else happens to be at the derived path — another site's
 * webspace, or another INSTANCE's live production. The paths now come from the provisioner's
 * site table, and the directory has to declare itself this instance's before anything is
 * removed (`siteSurface` → the marker + the write probe).
 *
 * A surface that cannot be proved is SKIPPED AND REPORTED, never forced. The workspace still
 * goes — "I cannot delete this site" would be a site nobody can ever get rid of — but the
 * served bytes of a tree that has not said it is ours are not this daemon's to remove, and
 * an operator is told exactly which surface was left behind and why (the route puts the list
 * in the response and in the audit line).
 */
export async function deleteSite(slug: string, purgeProd: boolean): Promise<DeleteSiteResult> {
  if (!siteExists(slug)) {
    throw new NotFoundError(`No site named '${slug}'`);
  }
  // Read BEFORE the workspace goes: the manifest is what names the site in the table. A
  // manifest too broken to read costs the served cleanup, not the delete.
  const manifest = await readManifest(slug).catch(() => null);

  await rm(workspaceDir(slug), { recursive: true, force: true });

  const surfaces: Surface[] = purgeProd ? ['preprod', 'prod'] : ['preprod'];
  const removed: Surface[] = [];
  const skipped: { surface: Surface; reason: string }[] = [];

  for (const surface of surfaces) {
    if (!manifest) {
      skipped.push({
        surface,
        reason:
          `site '${slug}'s site.json could not be read, so there is no way to say which row ` +
          `of the site table — and therefore which directory — belongs to it. Nothing served ` +
          `was removed.`,
      });
      continue;
    }
    let paths;
    try {
      paths = siteSurface(manifest, surface);
    } catch (error) {
      if (!(error instanceof WebspaceError)) throw error;
      skipped.push({ surface, reason: (error as Error).message });
      continue;
    }
    // The link first: while the store is being removed, a link still pointing into it
    // would serve a directory that is disappearing under the web server's feet.
    await rm(paths.linkPath, { recursive: true, force: true }).catch(() => {});
    await rm(paths.storeDir, { recursive: true, force: true }).catch(() => {});
    removed.push(surface);
  }

  for (const entry of skipped) {
    console.warn(`[delete_site] ${slug}: the ${entry.surface} surface was left alone — ${entry.reason}`);
  }

  return { slug, removed, skipped };
}

/**
 * Disk usage of a directory tree in megabytes (recursive). Symlinks are skipped rather than
 * followed, so a walk can neither escape the tree nor count the same bytes twice through a
 * link — and a missing directory is 0 rather than a throw, because "this site has never been
 * published" is a legitimate state to measure.
 *
 * Exported because the quota now has to weigh what is ABOUT to be copied as well as what is
 * already there (see `assertWithinQuota`), and the caller that knows where the incoming
 * bytes are is the build/publish path, not this one.
 */
export async function treeSizeMb(dir: string): Promise<number> {
  if (!existsSync(dir)) return 0;
  let bytes = 0;
  async function walk(path: string): Promise<void> {
    const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
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

/** The workspace's own footprint: the git repo, node_modules, the build output, .builder/. */
export async function workspaceSizeMb(slug: string): Promise<number> {
  return treeSizeMb(workspaceDir(slug));
}

/** What one site occupies, broken down — the numbers the quota is measured against. */
export interface SiteDiskUsage {
  readonly workspaceMb: number;
  readonly preprodMb: number;
  readonly prodMb: number;
  readonly totalMb: number;
}

/**
 * EVERYTHING A SITE CONSUMES: the workspace PLUS both release stores.
 *
 * The quota used to measure the workspace alone, which measured the wrong thing at the wrong
 * moment. A site's retained releases are RELEASES_RETAINED immutable copies of its build
 * output, on each of two surfaces — for a heavy site that is the larger half of its
 * footprint, and it is the half a museum cannot see or clean up. Measuring only the
 * workspace meant a site could be refused a chat turn for a fat `node_modules` while another
 * quietly filled the disk with released copies of itself, and it is the disk filling up that
 * takes the published sites of every OTHER museum on the host down with it.
 */
export async function siteDiskUsageMb(manifest: SiteManifest): Promise<SiteDiskUsage> {
  // A READ, so the surfaces are the provisioner's DECLARED ones and no directory is proved:
  // counting bytes must not write a probe file, and a site the table does not carry occupies
  // nothing on either surface — which is true, and is what `null` means here.
  const stores = (['preprod', 'prod'] as const).map(
    surface => declaredSurface(manifest, surface)?.storeDir ?? null,
  );
  const [workspaceMb, preprodMb, prodMb] = await Promise.all([
    workspaceSizeMb(manifest.slug),
    stores[0] ? treeSizeMb(stores[0]) : Promise.resolve(0),
    stores[1] ? treeSizeMb(stores[1]) : Promise.resolve(0),
  ]);
  return { workspaceMb, preprodMb, prodMb, totalMb: workspaceMb + preprodMb + prodMb };
}

/**
 * THE QUOTA GATE, asked before any work that GROWS the site: a new agent turn, and a
 * promotion (which adds a whole release copy).
 *
 * Enforced before the promote and not only before the turn, because the promote is the
 * operation that adds the copy — a build that finishes, publishes and only then discovers
 * the site is over quota has already spent the disk it was supposed to be refused.
 *
 * AND IT COUNTS THE INCOMING COPY. `incomingMb` is the size of the tree that is about to be
 * copied into a release store, and without it this gate was half of one: it measured what a
 * site occupied and then let the caller add a whole build's worth on top, so a site sitting
 * just under its quota could be carried to nearly TWICE it by a single promote — measured,
 * and exactly the state a quota exists to prevent, because it is the disk filling up that
 * takes every OTHER museum's published site on the host down with it. The caller passes it
 * because the caller is the one that knows where the incoming bytes are (`treeSizeMb`).
 */
export async function assertWithinQuota(
  manifest: SiteManifest,
  what: string,
  incomingMb = 0,
): Promise<void> {
  const usage = await siteDiskUsageMb(manifest);
  const needed = usage.totalMb + incomingMb;
  if (needed > config.SITE_DISK_QUOTA_MB) {
    throw new LimitExceededError(
      `Site over disk quota: ${what} needs ${Math.round(needed)} MB ` +
        `(workspace ${Math.round(usage.workspaceMb)} MB + preprod releases ` +
        `${Math.round(usage.preprodMb)} MB + prod releases ${Math.round(usage.prodMb)} MB` +
        (incomingMb > 0 ? ` + ${Math.round(incomingMb)} MB about to be copied in` : '') +
        `) against a limit of ${config.SITE_DISK_QUOTA_MB} MB`,
      'disk_quota',
    );
  }
}
