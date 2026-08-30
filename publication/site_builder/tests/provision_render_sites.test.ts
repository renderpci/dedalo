/**
 * THE SITE TABLE'S WRITER — the half of the containment law that lives on the provisioner's
 * side.
 *
 * This artifact exists because a site's placement had TWO independent derivations that
 * disagreed on the committed reference declaration. The fix deleted one of them; what it
 * could not delete is that the law "a row's store_dir and link_path lie strictly inside its
 * webspace" is still stated TWICE — once by `render/sites.ts` as it writes the row, once by
 * `sites/site_table.ts` as it reads it back. That is the same shape as the four defects
 * this subsystem was rebuilt around, and both copies were held by nothing: disarming either
 * left the suite at 699 pass / 0 fail.
 *
 * The READER is gated in tests/webspace.test.ts ("a stamped table with a bad body is still
 * refused, row by row"). This file gates the WRITER, and it is a separate file because the
 * two are reached by different doors: the reader from a file on disk, the writer from a
 * layout — and a layout that would produce such a row cannot come out of `derive()`, which
 * refuses it earlier. So the renderer is handed the row directly, which is exactly the
 * position it is in the day a future derivation stops refusing.
 *
 * WHY IT MATTERS AT THE WRITER AT ALL, given the reader also checks: these are the last
 * strings checked before they become the target of a `rm -rf` (delete) and of a
 * rename-over-symlink (every publish), and the file they go into is signed by the
 * provisioner — the one side everybody downstream trusts. A row that escapes here is a
 * daemon pointed at somebody else's tree BY ITS OWN CONFIGURATION.
 */

import { describe, test, expect } from 'bun:test';
import { join } from 'node:path';
import {
  RELEASE_STORE_DIR,
  SURFACES,
  SURFACE_DIR,
  type InstanceLayout,
  type SiteLayout,
  type Surface,
} from '../src/provision/layout';
import { sitesRenderer, renderSiteTableBody } from '../src/provision/render/sites';

const WEBSPACE = '/srv/webspaces/museum.test';

/**
 * A layout carrying exactly one site, whose four paths this test controls.
 *
 * Hand-built rather than derived: `derive()` refuses an escaping pair before a renderer
 * ever sees it, so a fixture that went through it could not construct the situation. What
 * is asserted here is that the RENDERER refuses on its own — the property that still holds
 * the day another caller reaches it.
 */
function layoutWith(paths: {
  webspace?: string;
  storeDir?: (surface: Surface) => string;
  linkPath?: (surface: Surface) => string;
  slug?: string;
  domain?: string;
}): InstanceLayout {
  const webspace = paths.webspace ?? WEBSPACE;
  const site = {
    slug: paths.slug ?? 'museum',
    domain: paths.domain ?? 'museum.test',
    webspace,
    // The layout owns these names; a test that spelled them would be a second census of
    // the very thing this file is about.
    releasesDir:
      paths.storeDir ?? ((surface: Surface) => join(webspace, RELEASE_STORE_DIR, SURFACE_DIR[surface])),
    linkPath: paths.linkPath ?? ((surface: Surface) => join(webspace, SURFACE_DIR[surface])),
  } as unknown as SiteLayout;
  return {
    instance: 'museum-a',
    webspaceBase: '/srv/webspaces',
    siteTablePath: '/etc/dedalo_sites/instances/museum-a/sites.json',
    sites: [site],
  } as unknown as InstanceLayout;
}

describe('the renderer refuses a row it would not want the daemon to act on', () => {
  test('the fixture is honest: a well-formed layout renders', () => {
    const body = renderSiteTableBody(layoutWith({}));
    const document = JSON.parse(body) as { sites: Array<{ webspace: string }> };
    expect(document.sites).toHaveLength(1);
    expect(document.sites[0]?.webspace).toBe(WEBSPACE);
  });

  test.each([...SURFACES])("a %s RELEASE STORE outside the webspace is refused", surface => {
    const escaping = layoutWith({
      storeDir: (s: Surface) =>
        s === surface ? join(WEBSPACE, '..', 'somebody-else') : join(WEBSPACE, RELEASE_STORE_DIR, SURFACE_DIR[s]),
    });
    expect(() => renderSiteTableBody(escaping)).toThrow(/is not inside\s+its webspace/);
    // And the whole artifact is refused, not merely the row: nothing is rendered.
    expect(() => sitesRenderer.render(escaping, {} as never)).toThrow(/Nothing was rendered/);
  });

  test.each([...SURFACES])("a %s SERVED LINK outside the webspace is refused", surface => {
    const escaping = layoutWith({
      linkPath: (s: Surface) => (s === surface ? '/var/www/html' : join(WEBSPACE, SURFACE_DIR[s])),
    });
    expect(() => renderSiteTableBody(escaping)).toThrow(/is not inside\s+its webspace/);
  });

  test('the webspace itself may not BE the store or the link — strictly inside, not equal', () => {
    // `isStrictlyWithin`, not `isWithin`: a store that IS the webspace would put every
    // release under the document root, reachable by URL, rolled-back bytes and all.
    expect(() => renderSiteTableBody(layoutWith({ storeDir: () => WEBSPACE }))).toThrow(
      /is not inside\s+its webspace/,
    );
  });

  test('a RELATIVE path is refused — the daemon would resolve it against a cwd neither side knows', () => {
    expect(() => renderSiteTableBody(layoutWith({ webspace: 'srv/webspaces/museum.test' }))).toThrow(
      /not an absolute path/,
    );
  });

  test('a control character in a path is refused by name', () => {
    expect(() =>
      renderSiteTableBody(layoutWith({ webspace: '/srv/webspaces/museum\n.test' })),
    ).toThrow(/control character \\x0a/);
  });

  test('a slug or a domain that could never match a row is refused before it is published', () => {
    // The daemon looks a site up BY SLUG and confines its workspace path with the same
    // grammar, so a row whose slug cannot be one is a row nothing can ever match.
    expect(() => renderSiteTableBody(layoutWith({ slug: 'Not A Slug' }))).toThrow(/is not a site slug/);
    expect(() => renderSiteTableBody(layoutWith({ domain: 'not a hostname' }))).toThrow(/is not a\s+hostname/);
  });
});
