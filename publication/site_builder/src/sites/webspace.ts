/**
 * WHERE A SITE LIVES ON THIS HOST — the runtime half of the provisioner's layout.
 *
 * THE QUESTION THIS MODULE ANSWERS, AND THE ANSWER IT NO LONGER INVENTS.
 *
 * The provisioner creates one WEBSPACE per site (marked, chowned, holding `pre`, `web` and
 * `.releases/`, with one vhost per surface pointing at it). This module finds that same
 * directory at create, build, publish and delete time — and until now it did so by
 * DERIVING it: `<WEBSPACE_BASE>/<domain>`, computed here, in parallel with the derivation
 * `derive()` performs on the other side. That was a defect and it was measurable:
 * `sites[].webspace` is an override the provisioner honours, the committed reference
 * declaration uses it, and for that site the two derivations named two different
 * directories. The vhosts served one; this daemon wrote into the other.
 *
 * So the derivation is GONE from this side. `webspacePath()` no longer exists — not
 * deprecated, not kept "for compatibility", because a second answer to the question IS the
 * defect. Every path now comes out of the site table the provisioner publishes
 * (`<configDir>/sites.json`, read and proved by `./site_table.ts`), and a site with no row
 * in it is refused BY NAME rather than published into a directory no vhost serves.
 *
 * THE TWO HALVES, AND WHY THEY ARE DIFFERENT FILES.
 *
 *   ./site_table.ts  — what the PROVISIONER SAYS. A pure read of a stamped file.
 *   this file        — what the FILESYSTEM SAYS: the directory exists, it declares itself
 *                      this instance's (`.dedalo_site_instance`, the same marker law the
 *                      state roots are held to), and this process can actually write in it.
 *
 * The second half cannot be folded into the first because its answer CHANGES while the
 * process runs: a webspace can be removed, or a re-provision can hand it to another
 * instance, between a build starting and its output being promoted. And it cannot be
 * skipped: `WEBSPACE_BASE` is shared by every museum on the host, so even a table row is a
 * path — a claim — until the directory itself says whose it is. The write probe answers the
 * other half of the same question: a webspace missing from the unit's `ReadWritePaths=` is
 * mounted READ-ONLY under `ProtectSystem=strict` and would otherwise fail as EROFS in the
 * middle of a publish, at night, on a live site.
 *
 * READS DO NOT PROVE, AND STILL DO NOT DERIVE. A dashboard listing and a disk measurement
 * must not throw because a webspace was removed, and must not write a probe file to answer
 * a question about bytes. They call `declaredSurface()`, which reads the table and stops
 * there: `null` when the provisioner never declared the site. What is gone is the third
 * option — the old `siteSurfaceUnchecked()`, which answered from the daemon's own
 * derivation and was, on the delete path, an `rm -rf` aimed at a directory nobody had
 * proved was ours.
 */

import { existsSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config';
import { declaredInstance } from '../instance/roots';
import { INSTANCE_MARKER, SURFACES, preprodDomainFor, type Surface, type SurfacePaths } from '../provision/layout';
import { WebspaceError, readSiteTable, type SiteTable, type SiteTableEntry } from './site_table';
import type { SiteManifest } from './manifest';

export type { Surface, SurfacePaths, SiteTable, SiteTableEntry };
export { SURFACES, WebspaceError };

/**
 * THIS INSTANCE'S SITE TABLE, read fresh.
 *
 * Read per call rather than cached: the file is a few hundred bytes, and a cached copy
 * would mean a `provision apply` that adds a museum's second site does not take effect
 * until somebody restarts the daemon — a second, staler answer to the one question this
 * whole change exists to give a single answer to.
 */
export function siteTable(): SiteTable {
  return readSiteTable(config.SITE_TABLE_FILE, config.DEDALO_SITE_INSTANCE);
}

/**
 * THE PROVISIONER'S ROW FOR ONE SITE, or a refusal naming it.
 *
 * `domain` is the domain the site's own manifest claims. It is checked against the row
 * because the two are written by different people at different times: the declaration says
 * "site 'archive' answers on archive.example.net" and the manifest says what the operator
 * typed into the create form. A disagreement means the daemon would publish this site into
 * the webspace of a domain it does not actually answer on, so it is refused rather than
 * resolved in either direction.
 */
export function declaredSite(slug: string, domain?: string): SiteTableEntry {
  const table = siteTable();
  const entry = table.bySlug(slug);
  if (!entry) {
    const known = table.entries.map(e => e.slug);
    throw new WebspaceError(
      `site '${slug}' is not in instance '${table.instance}'s site table ('${table.path}'), so ` +
        `the provisioner never created a webspace for it. The provisioner creates a site's ` +
        `webspace, its two release stores and its two vhosts from that site's entry under ` +
        `'sites' in instance.json; this daemon never creates one, because a directory the web ` +
        `server serves is not a directory an agent's daemon may invent. Declare the site and ` +
        `run 'provision apply'. ` +
        (known.length
          ? `The table declares: ${known.join(', ')}.`
          : `The table declares no sites at all.`),
    );
  }
  if (domain !== undefined && entry.domain !== domain) {
    throw new WebspaceError(
      `site '${slug}' answers on '${domain}' according to its own site.json, and on ` +
        `'${entry.domain}' according to instance '${table.instance}'s site table ` +
        `('${table.path}'). The webspace, the vhosts and the certificate all follow the ` +
        `table; publishing under the other name would put these bytes in a tree that serves ` +
        `a different hostname. Correct one of the two.`,
    );
  }
  return entry;
}

/**
 * PROVE A SITE'S WEBSPACE BEFORE WRITING INTO IT: the provisioner declared it, it exists,
 * it is a directory, it declares itself this instance's, and this process can write in it.
 *
 * Called before a site is created, before a build starts, again before its output is
 * promoted, and before a delete removes anything served — because the answer can change
 * between them, and because the earliest of them is the one that saves a museum a
 * five-minute build.
 */
export function assertWebspace(slug: string, domain: string): string {
  return proveSite(slug, domain).webspace;
}

/**
 * The same proving, handing back the whole ROW — so a caller that needs the surfaces does
 * not read the table twice and cannot read it twice with different answers (a re-provision
 * landing between the two calls is unlikely and would be silent, which is the worst pair of
 * properties a bug can have).
 */
function proveSite(slug: string, domain: string): SiteTableEntry {
  const entry = declaredSite(slug, domain);
  const webspace = entry.webspace;
  const instance = config.DEDALO_SITE_INSTANCE;

  if (!existsSync(webspace)) {
    throw new WebspaceError(
      `site '${slug}' answers on '${domain}', and instance '${instance}'s site table places ` +
        `it at '${webspace}' — and there is nothing there. The provisioner creates that ` +
        `directory; run 'provision apply' for instance '${instance}'.`,
    );
  }
  if (!statSync(webspace).isDirectory()) {
    throw new WebspaceError(`site '${slug}'s webspace '${webspace}' is not a directory.`);
  }

  const found = declaredInstance(webspace);
  if (found !== instance) {
    throw new WebspaceError(
      `site '${slug}'s webspace '${webspace}' does not declare itself instance ` +
        `'${instance}'s (its '${INSTANCE_MARKER}' reads ` +
        `${found === null ? 'nothing — there is no marker' : `'${found}'`}). ` +
        `'${config.WEBSPACE_BASE}' holds every museum's webspaces on this host, and a table ` +
        `is a file: the directory itself has to say whose it is. Writing here would replace ` +
        `${found === null ? 'an unclaimed tree' : `instance '${found}'s live site`}.`,
    );
  }

  assertWritable(slug, webspace);
  return entry;
}

/**
 * The write probe, in the webspace this time.
 *
 * Same reasoning as the boot probe over the state roots (`src/instance/roots.ts`): under
 * `ProtectSystem=strict` every path the unit's `ReadWritePaths=` does not name is READ-ONLY,
 * and a webspace missing from that list does not fail at install time — it fails as EROFS
 * halfway through copying a release. Here the cost of asking is one file created and
 * unlinked per build, and the answer arrives before the build rather than after it.
 */
function assertWritable(slug: string, webspace: string): void {
  const probe = join(webspace, `.dedalo_site_write_probe.${process.pid}`);
  try {
    writeFileSync(probe, '', { flag: 'w' });
  } catch (error) {
    throw new WebspaceError(
      `site '${slug}'s webspace '${webspace}' is not writable by this process ` +
        `(${(error as Error).message}). The generated unit lists every webspace in ` +
        `ReadWritePaths=; one that is missing is mounted read-only under ProtectSystem=strict ` +
        `and would fail in the middle of a publish instead of here. Re-run 'provision apply' ` +
        `for instance '${config.DEDALO_SITE_INSTANCE}'.`,
    );
  } finally {
    try {
      if (existsSync(probe)) unlinkSync(probe);
    } catch {
      // Best effort: an unremovable probe file is reported by the next probe.
    }
  }
}

/**
 * ONE SURFACE OF ONE SITE, proved and ready to promote into.
 *
 * The pair itself is the provisioner's — these are the exact strings `layout.sites[n]`
 * produced and the vhosts were rendered from. This function's whole job is the proving: a
 * caller holding a `SurfacePaths` from here knows the directory behind it exists, is this
 * instance's, and can be written to.
 */
export function siteSurface(manifest: SiteManifest, surface: Surface): SurfacePaths {
  return proveSite(manifest.slug, manifest.domain).surfaces[surface];
}

/** Both surfaces of a site, proved once. */
export function siteSurfaces(manifest: SiteManifest): Record<Surface, SurfacePaths> {
  const entry = proveSite(manifest.slug, manifest.domain);
  return { preprod: entry.surfaces.preprod, prod: entry.surfaces.prod };
}

/**
 * A SURFACE'S PAIR AS THE PROVISIONER DECLARED IT, WITHOUT THE FILESYSTEM PROVING — for
 * reads that must not throw and must not write.
 *
 * The status join renders every site of a museum, and one site whose webspace an operator
 * removed must not blank the dashboard for the rest; the disk measurement counts bytes and
 * has no business creating a probe file to do it. Both want the paths and neither is about
 * to write a release.
 *
 * `null` — never a fallback — when the site has no row: there IS no answer to "where does
 * this site publish" for a site the provisioner never declared, and the old code's answer
 * (derive it and hope) is what this change deletes. A caller reading `null` reports the
 * site as unbuilt, which is exactly what it is.
 */
export function declaredSurface(manifest: SiteManifest, surface: Surface): SurfacePaths | null {
  const entry = siteTable().bySlug(manifest.slug);
  if (!entry || entry.domain !== manifest.domain) return null;
  return entry.surfaces[surface];
}

/**
 * WHERE A VISITOR REACHES THIS SITE — assembled from the site's domain and the two facts
 * about the host that the declaration renders into the env.
 *
 * PROD follows `PROD_URL_SCHEME`, which `layout.ts` derives from `serving.prod.tls.mode`.
 * PREPROD is `http://` and not a knob: the generated draft vhost listens on port 80 only,
 * and says so as a stated residual in `src/provision/render/nginx.ts`. The day that residual
 * is fixed the scheme becomes a rendered fact like the other one — it must never become a
 * guess made here, because a link that does not open is worse than no link.
 */
export function siteUrl(manifest: SiteManifest, surface: Surface): string {
  if (surface === 'prod') {
    return `${config.PROD_URL_SCHEME}://${manifest.domain}/`;
  }
  return `http://${preprodDomainFor(config.PREPROD_HOST_PREFIX, manifest.domain)}/`;
}
