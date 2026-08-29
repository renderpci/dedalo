/**
 * THE SITE TABLE — the provisioner telling the daemon where every site of this instance
 * lives, so that the daemon never has to work it out for itself.
 *
 * WHY THIS ARTIFACT EXISTS, MEASURED RATHER THAN ARGUED.
 *
 * A site's placement had TWO independent derivations. `derive()` produced one
 * (`sites[].webspace` when the declaration states it, `<webspace_base>/<domain>` when it
 * does not) and rendered the vhosts against it; `src/sites/webspace.ts` produced another
 * (`<WEBSPACE_BASE>/<domain>`, always) and published against that. On the committed
 * reference declaration the two disagreed for the site that uses the override: the vhosts
 * of 'archive' serve `/srv/legacy-www/archive-example`, and the daemon wrote into
 * `/home/www/archive.example.net` — a directory no web server has ever read. Every file on
 * the host looked correct. The museum's page simply never changed.
 *
 * Two answers to one question is the defect, and the fix is not a third answer that is
 * "more careful": it is to delete one of them. The provisioner is the side that OWNS the
 * placement (it creates the directory, marks it, chowns it and points two vhosts at it), so
 * it PUBLISHES its answer here, and the daemon READS it and derives nothing
 * (`src/sites/site_table.ts`, `src/sites/webspace.ts`).
 *
 * WHAT IT CONTAINS: the exact strings `layout.sites[n]` produces. Slug, domain, webspace,
 * and per surface the release store and the served link — the same values the vhosts are
 * rendered from, one line above in the same derivation. Nothing computed here, nothing
 * abbreviated, nothing that has to be recombined at the far end: a table the reader had to
 * do arithmetic on would be a third derivation wearing a data file's clothes.
 *
 * WHY IT IS JSON, AND WHY ITS FIRST LINE IS NOT.
 *
 * The reader is a program, and this is the one artifact of the six no human edits and no
 * daemon parses with a grammar of its own — so JSON, read with `JSON.parse`, rather than a
 * fifth ad-hoc key/value format nobody would test the edge cases of. The stamp law is
 * unconditional though (every artifact carries one, `renderAll()` re-reads it back), and
 * JSON has no comment syntax, so the stamp rides on a `//` line ABOVE the document and the
 * reader strips exactly that line before parsing. That is why `stamp()` takes a comment
 * prefix at all. The alternative — a `_stamp` FIELD inside the JSON — was rejected: the
 * hash would then cover a document containing itself, and `parseStamp`/`hasDrifted`, which
 * every other artifact on the host is checked with, would need a second implementation for
 * this one file.
 *
 * PURE, ZERO-DEP, STAMPED, STABLE — the law in ./types.ts. The sites are sorted by SLUG
 * rather than left in declaration order, because a museum reordering two entries in
 * instance.json must not read as drift to a provisioner that writes only on drift.
 */

import { isAbsolute } from 'node:path';
import type { InstanceLayout, SiteLayout, Surface } from '../layout';
import { DOMAIN_PATTERN, SURFACES, isStrictlyWithin } from '../layout';
import { SLUG_PATTERN } from '../../util/slug';
import type { Renderer } from './types';
import { artifact } from './types';

/**
 * The comment prefix the stamp line uses, and the string the reader strips.
 *
 * Exported because `src/sites/site_table.ts` reads this file back and must agree about the
 * one line that is not JSON. Two spellings of it would be a daemon that cannot parse the
 * table the provisioner just wrote — the exact class of two-sided coincidence this artifact
 * exists to end, reappearing inside the fix.
 */
export const SITE_TABLE_COMMENT_PREFIX = '//';

/** The document version. Bumped only when a READER would have to behave differently. */
export const SITE_TABLE_VERSION = 1;

/** One surface of one site, as the table states it. */
export interface SiteTableSurfaceRow {
  /** `<webspace>/.releases/<pre|web>` — the immutable copies, one directory per release. */
  readonly store_dir: string;
  /** `<webspace>/<pre|web>` — the symlink the vhost's document root names. */
  readonly link_path: string;
}

/** One site, as the table states it. Snake_case: this is JSON, like the declaration. */
export interface SiteTableRow {
  readonly slug: string;
  readonly domain: string;
  readonly webspace: string;
  readonly surfaces: Readonly<Record<Surface, SiteTableSurfaceRow>>;
}

/** The whole document. `instance` is what makes a foreign table refusable at boot. */
export interface SiteTableDocument {
  readonly version: number;
  readonly instance: string;
  /** Echoed for an operator reading the file; the daemon uses `sites[].webspace`. */
  readonly webspace_base: string;
  readonly sites: readonly SiteTableRow[];
}

export const sitesRenderer: Renderer = {
  kind: 'sites',
  render(layout) {
    return [
      artifact(layout, {
        kind: 'sites',
        path: layout.siteTablePath,
        // root:root 0644 — only root writes the file that says where the daemon may
        // publish; the daemon (its own uid, in none of root's groups) must be able to read
        // it. See MODES.siteTable.
        mode: 'siteTable',
        body: renderSiteTableBody(layout),
        commentPrefix: SITE_TABLE_COMMENT_PREFIX,
      }),
    ];
  },
};

/**
 * The document, minus the stamp line `artifact()` puts above it.
 *
 * Two spaces of indentation and a trailing newline: this file is read by a program, but it
 * is also the first thing an operator opens when a museum's publish lands in the wrong
 * place, and a one-line JSON blob answers that question badly.
 */
export function renderSiteTableBody(layout: InstanceLayout): string {
  const document: SiteTableDocument = {
    version: SITE_TABLE_VERSION,
    instance: layout.instance,
    webspace_base: pathValue('webspace_base', layout.webspaceBase),
    sites: [...layout.sites]
      .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
      .map(row),
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

/** One site's row, and the last place its strings are checked before they are published. */
function row(site: SiteLayout): SiteTableRow {
  if (!SLUG_PATTERN.test(site.slug)) {
    throw new Error(
      `render(sites): '${site.slug}' is not a site slug (${SLUG_PATTERN.source}). The daemon ` +
        `looks a site up in this table BY SLUG and confines its workspace path with the same ` +
        `grammar; a slug that cannot be one would be a row nothing can ever match. Nothing ` +
        `was rendered.`,
    );
  }
  if (!DOMAIN_PATTERN.test(site.domain)) {
    throw new Error(
      `render(sites): site '${site.slug}' has the domain '${site.domain}', which is not a ` +
        `hostname (${DOMAIN_PATTERN.source}). Nothing was rendered.`,
    );
  }

  const webspace = pathValue(`site '${site.slug}' webspace`, site.webspace);
  const surfaces = {} as Record<Surface, SiteTableSurfaceRow>;
  for (const surface of SURFACES) {
    const storeDir = pathValue(`site '${site.slug}' ${surface} release store`, site.releasesDir(surface));
    const linkPath = pathValue(`site '${site.slug}' ${surface} served link`, site.linkPath(surface));
    // BOTH PATHS LIVE INSIDE THE WEBSPACE, and this is checked rather than assumed because
    // the daemon acts on these strings: it rm -rf's a store on delete and swaps a symlink
    // over a link path on every publish. A row whose paths escaped its own webspace would
    // be a table entry pointing this daemon at somebody else's tree, published by the one
    // side everybody downstream trusts.
    for (const [what, path] of [['release store', storeDir], ['served link', linkPath]] as const) {
      if (!isStrictlyWithin(path, webspace)) {
        throw new Error(
          `render(sites): site '${site.slug}'s ${surface} ${what} ('${path}') is not inside ` +
            `its webspace ('${webspace}'). The daemon writes and deletes at these paths on ` +
            `the authority of this file. Nothing was rendered.`,
        );
      }
    }
    surfaces[surface] = Object.freeze({ store_dir: storeDir, link_path: linkPath });
  }

  return {
    slug: site.slug,
    domain: site.domain,
    webspace,
    surfaces: Object.freeze(surfaces),
  };
}

/**
 * A path on its way into the document.
 *
 * JSON.stringify escapes everything, so nothing here can BREAK the file the way a newline
 * breaks an env file — this is the other half of the obligation in ./types.ts: refusing
 * what cannot be meant. A control character in a path is never a museum's intention, and a
 * relative one would be resolved by the daemon against a working directory neither side
 * knows.
 */
function pathValue(what: string, value: string): string {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new Error(
      `render(sites): ${what} is '${value}', which is not an absolute path. Nothing was rendered.`,
    );
  }
  const control = /[\x00-\x1f\x7f]/.exec(value);
  if (control) {
    const code = `\\x${control[0].charCodeAt(0).toString(16).padStart(2, '0')}`;
    throw new Error(
      `render(sites): ${what} contains the control character ${code}. Nothing was rendered.`,
    );
  }
  return value;
}
