/**
 * THE SITE TABLE, READ — the daemon learning where its sites live instead of working it out.
 *
 * THE DEFECT THIS MODULE ENDS. A site's placement used to be derived twice: by the
 * provisioner (which creates the webspace, marks it, chowns it and renders two vhosts
 * against it) and, independently, by this daemon (`<WEBSPACE_BASE>/<domain>`, in
 * webspace.ts). Two derivations of one fact are free to disagree, and on the committed
 * reference declaration they did — `sites[].webspace` is an OVERRIDE the provisioner
 * honours, so the vhosts of the 'archive' site served `/srv/legacy-www/archive-example`
 * while this daemon published into `/home/www/archive.example.net`. Both trees existed.
 * Every file on the host read correctly. The published page simply never changed.
 *
 * The fix is not a cleverer derivation here. It is to have exactly ONE: the provisioner
 * publishes its answer as an artifact (`<configDir>/sites.json`, rendered by
 * `src/provision/render/sites.ts` from the same `layout.sites[n]` the vhosts are rendered
 * from), and this module reads it. Nothing in the daemon computes a webspace, a release
 * store or a served link ever again; `webspaceFor()` is not called on this side and
 * `webspacePath()` no longer exists.
 *
 * WHAT IS PROVED HERE, AND WHAT IS NOT. This module answers "what does the provisioner say
 * about this site?" — a pure question about a file. Whether the directory it names actually
 * exists, declares itself this instance's and can be written to is the OTHER half, and it
 * lives in `webspace.ts` because the answer changes while the process runs. A caller that
 * is about to write goes through webspace.ts; a caller that is only reading (a dashboard
 * listing, a disk measurement) may stop here, and gets a path the provisioner declared
 * rather than one this daemon invented.
 *
 * THE FILE IS TRUSTED BECAUSE IT IS PROVED, NOT BECAUSE IT IS OURS. It is root:root 0644 on
 * a museum's host, so the service user cannot write it — but a path is only a claim (the
 * law this subsystem is built on), so every read verifies the stamp, re-checks the hash
 * against the body (a hand edit is a refusal, not an input), and refuses a table stamped
 * for ANOTHER instance. Those three are exactly the questions `provision check` asks about
 * every other artifact; asking them here is what makes "the daemon reads the provisioner's
 * table" a fact rather than a hope.
 *
 * NO CACHE, DELIBERATELY. The table is a few hundred bytes and is read at create, build,
 * publish, delete and on each status join. Caching it would mean a `provision apply` that
 * adds a museum's second site does not take effect until somebody restarts the daemon —
 * and, worse, that the daemon would hold a second, staler answer to the very question this
 * module exists to have exactly one answer to.
 */

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { hasDrifted, parseStamp } from '../provision/hash';
import {
  DOMAIN_PATTERN,
  INSTANCE_PATTERN,
  SURFACES,
  isStrictlyWithin,
  type Surface,
  type SurfacePaths,
} from '../provision/layout';
import { SITE_TABLE_VERSION } from '../provision/render/sites';
import { SLUG_PATTERN } from '../util/slug';

/** The trailer every refusal here ends with — the same sentence the preflight uses. */
const NOTHING_WRITTEN = 'Nothing was written.';

/**
 * A REFUSAL ABOUT WHERE A SITE LIVES — the table could not be read, does not name this
 * site, or names a directory that is not ours to write in.
 *
 * ONE CLASS FOR BOTH HALVES, and not because they are the same code: they are the same
 * ANSWER. "This site has nowhere to publish" is what a caller can act on, and whether the
 * reason was a missing row or a missing marker is detail the message carries. A second
 * class would only mean a second route mapping to forget — which is precisely how the
 * careful sentences below reached an operator as `500 Internal server error` for a while
 * (the route mapping is in `src/util/response.ts`).
 *
 * It is declared HERE, in the module with no dependency on the daemon's config, so that the
 * boot preflight (`src/instance/roots.ts`) can raise it without an import cycle;
 * `webspace.ts` re-exports it, because that is where a caller meets it.
 */
export class WebspaceError extends Error {
  readonly code = 'webspace_unavailable';
  constructor(message: string) {
    super(`${message} ${NOTHING_WRITTEN}`);
    this.name = 'WebspaceError';
  }
}

/** One site, exactly as the provisioner declared it. Paths are strings from the table. */
export interface SiteTableEntry {
  readonly slug: string;
  readonly domain: string;
  readonly webspace: string;
  /** The two surface pairs, in the daemon's own `SurfacePaths` shape. */
  readonly surfaces: Readonly<Record<Surface, SurfacePaths>>;
}

/** The whole table, plus where it was read from (every refusal names the file). */
export interface SiteTable {
  readonly instance: string;
  readonly path: string;
  readonly entries: readonly SiteTableEntry[];
  /** The row for a slug, or null. Never a fallback, never a guess. */
  bySlug(slug: string): SiteTableEntry | null;
  /** The row that owns a domain, or null — the check `createSite` refuses a duplicate on. */
  byDomain(domain: string): SiteTableEntry | null;
}

/**
 * READ AND PROVE THE TABLE AT `path`, as belonging to `instance`.
 *
 * Explicit arguments rather than reading `config` here, for two reasons that are really
 * one: the boot preflight must be able to check a table before the daemon does anything
 * with it, and a gate must be able to load the table rendered for the EXAMPLE declaration
 * and ask this daemon's own resolver where site 'archive' lives — which is the assertion
 * whose absence let the two derivations disagree in the first place.
 */
export function readSiteTable(path: string, instance: string): SiteTable {
  if (!INSTANCE_PATTERN.test(instance)) {
    throw new WebspaceError(
      `readSiteTable was asked for instance '${instance}', which is not an instance name ` +
        `(${INSTANCE_PATTERN.source}).`,
    );
  }
  if (!existsSync(path)) {
    throw new WebspaceError(
      `instance '${instance}' has no site table at '${path}'. The PROVISIONER writes it ` +
        `(<config dir>/sites.json, root:root 0644) from the 'sites' of instance.json, and it ` +
        `is the ONLY thing that tells this daemon where a site's webspace, release stores and ` +
        `served links are — it derives none of them itself, because a second derivation is ` +
        `free to disagree with the vhosts. Run 'provision apply' for instance '${instance}'.`,
    );
  }

  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new WebspaceError(
      `the site table '${path}' could not be read (${(error as Error).message}).`,
    );
  }

  // THE SAME THREE QUESTIONS `provision check` ASKS OF EVERY ARTIFACT, in the same order,
  // through the same parser — an artifact this daemon ACTS on may not be held to a weaker
  // standard than one an operator merely looks at.
  const stamped = parseStamp(text);
  if (!stamped) {
    throw new WebspaceError(
      `the site table '${path}' carries no provisioner stamp on its first line, so it was ` +
        `not written by 'provision apply' — it was replaced wholesale. This daemon publishes ` +
        `into the directories this file names; it will not take them from an unsigned file.`,
    );
  }
  if (hasDrifted(text)) {
    throw new WebspaceError(
      `the site table '${path}' disagrees with its own stamp: it was edited in place. Its ` +
        `rows are where this daemon copies releases to and deletes release stores from. ` +
        `Change 'sites' in instance.json and re-run 'provision apply'.`,
    );
  }
  if (stamped.instance !== instance) {
    throw new WebspaceError(
      `the site table '${path}' is stamped for instance '${stamped.instance}', and this ` +
        `daemon is instance '${instance}'. One museum's placements in another museum's ` +
        `configuration directory would publish this instance's work into that one's webspaces.`,
    );
  }

  let document: unknown;
  try {
    document = JSON.parse(stamped.body);
  } catch (error) {
    throw new WebspaceError(
      `the site table '${path}' is not readable as JSON below its stamp line ` +
        `(${(error as Error).message}).`,
    );
  }

  return buildTable(document, path, instance);
}

/** The document → the table, with every row checked. A bad row fails the whole read. */
function buildTable(document: unknown, path: string, instance: string): SiteTable {
  const doc = asRecord(document, path, 'the document');

  // The version is refused FORWARDS only. An older daemon reading a table written by a
  // newer provisioner must say so rather than silently ignore fields it cannot see — that
  // is a museum whose sites moved and whose daemon kept publishing to the old paths.
  const version = doc.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new WebspaceError(`the site table '${path}' has no readable 'version' number.`);
  }
  if (version > SITE_TABLE_VERSION) {
    throw new WebspaceError(
      `the site table '${path}' is version ${version} and this daemon reads version ` +
        `${SITE_TABLE_VERSION}. It was written by a newer provisioner; upgrade the daemon ` +
        `rather than let it act on a table it only half understands.`,
    );
  }

  // The body must agree with the stamp about whose table this is. Two statements of one
  // fact in one file is not redundancy here: the stamp is what a `check` reads and the
  // field is what an operator reads, and a file where they disagree is a file that was
  // assembled, not rendered.
  if (doc.instance !== instance) {
    throw new WebspaceError(
      `the site table '${path}' is stamped for instance '${instance}' but its 'instance' ` +
        `field reads '${String(doc.instance)}'.`,
    );
  }

  const rows = doc.sites;
  if (!Array.isArray(rows)) {
    throw new WebspaceError(`the site table '${path}' has no 'sites' array.`);
  }

  const entries: SiteTableEntry[] = [];
  const bySlug = new Map<string, SiteTableEntry>();
  const byDomain = new Map<string, SiteTableEntry>();

  for (const [index, raw] of rows.entries()) {
    const entry = buildEntry(raw, path, index);
    // A DUPLICATE IS REFUSED, not resolved. `derive()` already refuses two sites sharing a
    // slug, a domain or a webspace; a table that carried one anyway would be two sites
    // publishing into one served tree, where the last promote silently wins — and picking
    // "the first" or "the last" here would be this daemon inventing a tie-break for a
    // situation that must never exist.
    const slugClash = bySlug.get(entry.slug);
    if (slugClash) {
      throw new WebspaceError(
        `the site table '${path}' declares the slug '${entry.slug}' twice.`,
      );
    }
    const domainClash = byDomain.get(entry.domain);
    if (domainClash) {
      throw new WebspaceError(
        `the site table '${path}' gives the domain '${entry.domain}' to both site ` +
          `'${domainClash.slug}' and site '${entry.slug}'. One hostname is one site: the two ` +
          `would share a webspace, a release store and a served link, and publishing the ` +
          `second would replace the first's live pages.`,
      );
    }
    entries.push(entry);
    bySlug.set(entry.slug, entry);
    byDomain.set(entry.domain, entry);
  }

  return Object.freeze({
    instance,
    path,
    entries: Object.freeze(entries),
    bySlug: (slug: string) => bySlug.get(slug) ?? null,
    byDomain: (domain: string) => byDomain.get(domain) ?? null,
  });
}

/** One row → one entry, in the daemon's own `SurfacePaths` shape. */
function buildEntry(raw: unknown, path: string, index: number): SiteTableEntry {
  const where = `sites[${index}] of the site table '${path}'`;
  const row = asRecord(raw, path, `sites[${index}]`);

  const slug = String(row.slug ?? '');
  if (!SLUG_PATTERN.test(slug)) {
    throw new WebspaceError(`${where} has '${slug}' as its slug, which is not a site slug.`);
  }
  const domain = String(row.domain ?? '');
  if (!DOMAIN_PATTERN.test(domain)) {
    throw new WebspaceError(`${where} has '${domain}' as its domain, which is not a hostname.`);
  }
  const webspace = absolutePath(row.webspace, `${where}: 'webspace'`);

  const surfaceRows = asRecord(row.surfaces, path, `sites[${index}].surfaces`);
  const surfaces = {} as Record<Surface, SurfacePaths>;
  for (const surface of SURFACES) {
    const pair = asRecord(surfaceRows[surface], path, `sites[${index}].surfaces.${surface}`);
    const storeDir = absolutePath(pair.store_dir, `${where}: ${surface} 'store_dir'`);
    const linkPath = absolutePath(pair.link_path, `${where}: ${surface} 'link_path'`);
    // The daemon rm -rf's a store and renames a symlink over a link path on the authority
    // of these two strings. Inside the webspace or the row is refused — which also means a
    // hand-assembled table can never point this daemon at a path outside the tree the
    // provisioner created for the site.
    for (const [what, candidate] of [['store_dir', storeDir], ['link_path', linkPath]] as const) {
      if (!isStrictlyWithin(candidate, webspace)) {
        throw new WebspaceError(
          `${where}: the ${surface} ${what} '${candidate}' is not inside the site's webspace ` +
            `'${webspace}'. This daemon copies releases into it and deletes it on demand.`,
        );
      }
    }
    surfaces[surface] = Object.freeze({ surface, webspace, storeDir, linkPath });
  }

  return Object.freeze({ slug, domain, webspace, surfaces: Object.freeze(surfaces) });
}

function asRecord(value: unknown, path: string, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new WebspaceError(`the site table '${path}' has no object at ${what}.`);
  }
  return value as Record<string, unknown>;
}

function absolutePath(value: unknown, what: string): string {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new WebspaceError(`${what} is '${String(value)}', which is not an absolute path.`);
  }
  return value;
}
