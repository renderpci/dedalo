/**
 * WHERE A SITE LIVES — and the assertion whose absence let the two answers disagree.
 *
 * THE DEFECT. A site's placement was derived TWICE: by the provisioner (`sites[].webspace`
 * if the declaration states it, `<webspace_base>/<domain>` otherwise) and, independently,
 * by the daemon (`<WEBSPACE_BASE>/<domain>`, always). The committed reference declaration
 * USES the override, so for its 'archive' site the two derivations named two different
 * directories: the byte-gated vhosts served `/srv/legacy-www/archive-example`, and the
 * daemon published into `/home/www/archive.example.net`. Both existed. Every file on the
 * host read correctly. The published page never changed.
 *
 * Every gate in this file existed then. None of them could see it, because all of them
 * asked the daemon and the fixture the same question and the fixture derived its answer the
 * same way the daemon did. So the first describe below asks the only question that could
 * have caught it: does the path the daemon resolves EQUAL THE DOCUMENT ROOT IN THE RENDERED
 * VHOST — for the committed declaration, for every site, on both surfaces, including the
 * one that uses the override.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  SCRATCH_ROOT,
  declareSite,
  makeSourceDir,
  markerPath,
  provisionSite,
  resetInstance,
  roots,
  siteDomain,
  surfaceOf,
  undeclareSite,
  webspaceOf,
  workspacePath,
} from './fixtures/instance';
import { config } from '../src/config';
import { SURFACES, derive, type Surface } from '../src/provision/layout';
import { parseManifest } from '../src/provision/schema';
import { renderAll } from '../src/provision/render';
import { readSiteTable } from '../src/sites/site_table';
import {
  WebspaceError,
  assertWebspace,
  declaredSite,
  declaredSurface,
  siteSurface,
  siteSurfaces,
  siteTable,
  siteUrl,
} from '../src/sites/webspace';
import { createSite, assertWithinQuota, deleteSite, siteDiskUsageMb } from '../src/sites/workspace';
import { promoteRelease } from '../src/build/promote';
import { LimitExceededError } from '../src/errors';
import type { SiteManifest } from '../src/sites/manifest';

const ACTOR = { user_id: 7, username: 'webspace-tester' };

/** A manifest-shaped object — enough for the placement functions, which read two fields. */
function manifestFor(slug: string, domain = siteDomain(slug)): SiteManifest {
  return { slug, domain } as SiteManifest;
}

beforeEach(resetInstance);
afterEach(resetInstance);

/* ────────────────────────────────────────────────────────────────────────────────────
 * The assertion that was missing
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the daemon resolves the very path the rendered vhost serves', () => {
  /** The committed reference declaration — the one an operator copies. */
  const declarationPath = join(import.meta.dir, '..', 'deploy', 'examples', 'instance.example.json');

  /** Every document root a rendered vhost states: `root "…";` / `DocumentRoot "…"`. */
  function docRootsOf(body: string): string[] {
    return [...body.matchAll(/^\s*(?:root|DocumentRoot)\s+"([^"]+)"/gm)].map(match => match[1] as string);
  }

  /**
   * The DAEMON's answer for the example instance: its own reader, over the site table the
   * provisioner renders for that declaration. Written to a scratch file and read back
   * through `readSiteTable` rather than inspected in memory, because the file — stamp line,
   * JSON body, instance check — is the actual interface between the two sides.
   */
  function daemonTableFor(body: string) {
    const dir = join(SCRATCH_ROOT, 'example_table');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'sites.json');
    writeFileSync(path, body, 'utf8');
    return readSiteTable(path, 'example');
  }

  test.each([...SURFACES])(
    'every site of the committed declaration: the %s document root IS the daemon\'s path',
    (surface: Surface) => {
      for (const webServer of ['nginx', 'apache'] as const) {
        const doc = JSON.parse(require('node:fs').readFileSync(declarationPath, 'utf8'));
        doc.web = { ...(doc.web ?? {}), server: webServer };
        const manifest = parseManifest(doc);
        const layout = derive(manifest);
        const artifacts = renderAll(layout, manifest);

        const table = daemonTableFor(artifacts.find(a => a.kind === 'sites')!.body);
        expect(table.entries.length).toBe(layout.sites.length);

        for (const site of layout.sites) {
          // What the DAEMON would publish into, knowing only its instance name and the
          // domain in the site's own site.json.
          const resolved = table.bySlug(site.slug);
          expect({ slug: site.slug, declared: resolved !== null }).toEqual({
            slug: site.slug,
            declared: true,
          });
          const linkPath = resolved!.surfaces[surface].linkPath;

          // What the WEB SERVER reads, out of the byte-gated vhost for that surface.
          const vhost = artifacts.find(a => a.path === site.vhostPaths[surface]);
          expect({ slug: site.slug, surface, vhost: vhost !== undefined }).toEqual({
            slug: site.slug,
            surface,
            vhost: true,
          });
          const docRoots = docRootsOf(vhost!.body);

          // THE PAIRING. The served document root is the daemon's link path, exactly.
          expect({ slug: site.slug, surface, webServer, docRoots }).toEqual({
            slug: site.slug,
            surface,
            webServer,
            docRoots: expect.arrayContaining([linkPath]),
          });
          // And nothing else in that file points anywhere but this site's webspace — the
          // half that fails loudly when the two sides disagree about the webspace ITSELF
          // (the prod vhost's ACME location names the webspace root, not the link).
          for (const docRoot of docRoots) {
            expect({ slug: site.slug, surface, docRoot, inside: docRoot.startsWith(resolved!.webspace) }).toEqual({
              slug: site.slug,
              surface,
              docRoot,
              inside: true,
            });
          }
        }
      }
    },
  );

  test('the site that uses the declaration\'s `webspace` OVERRIDE is the one that proves it', () => {
    // S6, stated on its own rather than left to fall out of the loop above. 'archive' is
    // declared with `"webspace": "/srv/legacy-www/archive-example"`, so its DEFAULT
    // placement (`<webspace_base>/<domain>`) is a completely different directory — the one
    // the daemon used to publish into. If the table ever carried the default for it, this
    // fails; if the daemon ever derived again, the loop above fails.
    const doc = JSON.parse(require('node:fs').readFileSync(declarationPath, 'utf8'));
    const manifest = parseManifest(doc);
    const layout = derive(manifest);
    const table = daemonTableFor(renderAll(layout, manifest).find(a => a.kind === 'sites')!.body);

    const archive = table.bySlug('archive');
    expect(archive!.webspace).toBe('/srv/legacy-www/archive-example');
    // The path the OLD derivation produced, spelled out so the divergence is visible in the
    // test rather than implied: it must appear nowhere in the daemon's answer.
    const derivedDefault = `${layout.webspaceBase}/archive.example.net`;
    expect(archive!.webspace).not.toBe(derivedDefault);
    for (const surface of SURFACES) {
      expect(archive!.surfaces[surface].linkPath.startsWith(derivedDefault)).toBe(false);
      expect(archive!.surfaces[surface].storeDir.startsWith('/srv/legacy-www/archive-example/')).toBe(true);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * The table is the only source
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the daemon derives nothing and reads the provisioner instead', () => {
  test('a site the table does not carry has no placement at all', () => {
    // Not a fallback, not `<base>/<domain>`: nothing. That is the whole change.
    expect(() => declaredSite('ghost')).toThrow(WebspaceError);
    expect(() => declaredSite('ghost')).toThrow(/is not in instance 'test's site table/);
    expect(declaredSurface(manifestFor('ghost'), 'prod')).toBeNull();
  });

  test('a declared site resolves to the table\'s own strings, on both surfaces', async () => {
    await provisionSite('demo');
    const entry = declaredSite('demo', siteDomain('demo'));
    for (const surface of SURFACES) {
      const pair = surfaceOf('demo', surface);
      expect(entry.surfaces[surface].storeDir).toBe(pair.storeDir);
      expect(entry.surfaces[surface].linkPath).toBe(pair.linkPath);
    }
  });

  test('a site whose OWN webspace is overridden publishes into the override', async () => {
    // The suite's version of the reference declaration's 'archive': the fixture declares an
    // override, and every daemon-side answer follows it — including the one a promote uses.
    const override = join(SCRATCH_ROOT, 'legacy_www', 'oddly-placed');
    const { domain } = await provisionSite('odd', { webspace: override });
    expect(assertWebspace('odd', domain)).toBe(override);
    expect(siteSurface(manifestFor('odd'), 'prod').linkPath).toBe(join(override, 'web'));

    await createSite({ slug: 'odd', name: 'Odd', domain, actor: ACTOR });
    const source = await makeSourceDir({ 'index.html': 'override' }, workspacePath('odd', 'out'));
    await promoteRelease(siteSurface(manifestFor('odd'), 'preprod'), source);
    expect(await Bun.file(join(override, 'pre', 'index.html')).text()).toBe('override');
  });

  test('the two surfaces of a site are two DIFFERENT stores inside one webspace', async () => {
    await provisionSite('demo');
    const { preprod, prod } = siteSurfaces(manifestFor('demo'));
    expect(preprod.webspace).toBe(prod.webspace);
    expect(preprod.storeDir).not.toBe(prod.storeDir);
    expect(preprod.linkPath).not.toBe(prod.linkPath);
    // Neither store is UNDER a served link — a store inside the document root would be
    // reachable by URL, rolled-back bytes and all.
    expect(preprod.storeDir.startsWith(preprod.linkPath + '/')).toBe(false);
    expect(prod.storeDir.startsWith(prod.linkPath + '/')).toBe(false);
  });

  test('a manifest whose domain disagrees with the table is refused', async () => {
    await provisionSite('demo');
    expect(() => siteSurface(manifestFor('demo', 'somewhere.else.test'), 'prod')).toThrow(
      /according to its own site.json/,
    );
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * The table itself is proved, like every other artifact
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the site table is read the way `provision check` reads an artifact', () => {
  test('an absent table is a named refusal, not an empty answer', async () => {
    await rm(roots.siteTable, { force: true });
    expect(() => siteTable()).toThrow(/has no site table/);
    expect(() => siteTable()).toThrow(/provision apply/);
  });

  test('a HAND-EDITED table is refused — the stamp is a hash of the body', async () => {
    await provisionSite('demo');
    const text = await Bun.file(roots.siteTable).text();
    // The likeliest hand edit there is: repoint a site at another directory.
    await writeFile(roots.siteTable, text.replace('demo.test', 'demo.test-edited'), 'utf8');
    expect(() => siteTable()).toThrow(/edited in place/);
  });

  test('a table stamped for ANOTHER instance is refused', async () => {
    await provisionSite('demo');
    const text = await Bun.file(roots.siteTable).text();
    await writeFile(roots.siteTable, text.replace('provision: test sites', 'provision: museum-b sites'), 'utf8');
    expect(() => siteTable()).toThrow(/museum-b/);
  });

  test('an unstamped table is refused rather than trusted', async () => {
    await provisionSite('demo');
    const text = await Bun.file(roots.siteTable).text();
    await writeFile(roots.siteTable, text.split('\n').slice(1).join('\n'), 'utf8');
    expect(() => siteTable()).toThrow(/carries no provisioner stamp/);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * A declared path is still only a path
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a webspace must exist and say whose it is', () => {
  test('a provisioned webspace resolves', async () => {
    await provisionSite('demo');
    expect(assertWebspace('demo', siteDomain('demo'))).toBe(webspaceOf('demo'));
    expect(siteSurface(manifestFor('demo'), 'prod').linkPath).toBe(surfaceOf('demo', 'prod').linkPath);
  });

  test('a declared-but-missing webspace is refused, naming the site and the path', async () => {
    await declareSite('demo');
    let message = '';
    try {
      assertWebspace('demo', siteDomain('demo'));
    } catch (error) {
      message = (error as Error).message;
      expect(error).toBeInstanceOf(WebspaceError);
    }
    expect(message).toContain('demo');
    expect(message).toContain(siteDomain('demo'));
    expect(message).toContain(webspaceOf('demo'));
    expect(message).toContain('provision apply');
    expect(message).toContain('Nothing was written');
  });

  test('a webspace marked for another instance is refused, and says whose it is', async () => {
    await declareSite('demo');
    const webspace = webspaceOf('demo');
    await mkdir(webspace, { recursive: true });
    await writeFile(markerPath(webspace), 'museum-b\n', 'utf8');
    expect(() => assertWebspace('demo', siteDomain('demo'))).toThrow(/museum-b/);
  });

  test('an UNMARKED directory at the declared path is refused too', async () => {
    // A path is a claim — a table row included. An unmarked directory under the shared base
    // is somebody's unfinished provisioning or an unrelated site: not ours to publish into.
    await declareSite('demo');
    await mkdir(webspaceOf('demo'), { recursive: true });
    expect(() => assertWebspace('demo', siteDomain('demo'))).toThrow(WebspaceError);
    expect(() => assertWebspace('demo', siteDomain('demo'))).toThrow(/there is no marker/);
  });

  test('a FILE where the webspace should be is refused rather than written through', async () => {
    await declareSite('demo');
    await mkdir(roots.webspaceBase, { recursive: true });
    await writeFile(webspaceOf('demo'), 'not a directory', 'utf8');
    expect(() => assertWebspace('demo', siteDomain('demo'))).toThrow(/not a directory/);
  });

  test('both surfaces are proved together', async () => {
    await provisionSite('demo');
    const surfaces = siteSurfaces(manifestFor('demo'));
    expect(surfaces.preprod.linkPath).toBe(surfaceOf('demo', 'preprod').linkPath);
    expect(surfaces.prod.linkPath).toBe(surfaceOf('demo', 'prod').linkPath);

    await rm(webspaceOf('demo'), { recursive: true, force: true });
    expect(() => siteSurfaces(manifestFor('demo'))).toThrow(WebspaceError);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * Deleting
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a delete touches only what it has proved is ours', () => {
  test('a webspace that stops declaring itself ours is LEFT ALONE, and the delete says so', async () => {
    // B4: the delete used to `rm -rf` a derived path. For a site using the override that is
    // another site's — or another INSTANCE's — live production, removed by a daemon that
    // never asked whose directory it was.
    const { domain } = await provisionSite('doomed');
    await createSite({ slug: 'doomed', name: 'Doomed', domain, actor: ACTOR });
    const source = await makeSourceDir({ 'index.html': 'LIVE' }, workspacePath('doomed', 'out'));
    await promoteRelease(surfaceOf('doomed', 'preprod'), source);
    const served = join(surfaceOf('doomed', 'preprod').linkPath, 'index.html');
    expect(await Bun.file(served).text()).toBe('LIVE');

    // The webspace is handed to somebody else between the create and the delete.
    await writeFile(markerPath(webspaceOf('doomed')), 'museum-b\n', 'utf8');

    const result = await deleteSite('doomed', true);
    // The workspace goes — a site nobody can delete is worse than one that leaves bytes.
    expect(await Bun.file(join(workspacePath('doomed'), 'site.json')).exists()).toBe(false);
    // The served bytes do NOT.
    expect(await Bun.file(served).text()).toBe('LIVE');
    expect(result.removed).toEqual([]);
    expect(result.skipped.map(entry => entry.surface).sort()).toEqual(['preprod', 'prod']);
    expect(result.skipped[0]!.reason).toContain('museum-b');
  });

  test('a proved webspace IS cleaned up, both halves of the surface', async () => {
    const { domain } = await provisionSite('tidy');
    await createSite({ slug: 'tidy', name: 'Tidy', domain, actor: ACTOR });
    const source = await makeSourceDir({ 'index.html': 'x' }, workspacePath('tidy', 'out'));
    await promoteRelease(surfaceOf('tidy', 'preprod'), source);

    const result = await deleteSite('tidy', false);
    expect(result.removed).toEqual(['preprod']);
    expect(result.skipped).toEqual([]);
    expect(await Bun.file(surfaceOf('tidy', 'preprod').linkPath).exists()).toBe(false);
    expect(await Bun.file(join(surfaceOf('tidy', 'preprod').storeDir, '.keep')).exists()).toBe(false);
  });

  test('a site the table no longer declares is not deleted from a guessed path', async () => {
    // The state a museum reaches by removing a site from instance.json and re-applying,
    // with the workspace still on disk. There is then no declared path to clean up, and the
    // daemon must not invent one: the old code would have derived `<base>/<domain>` and
    // `rm -rf`'d whatever stood there.
    const { domain } = await provisionSite('unrowed');
    await createSite({ slug: 'unrowed', name: 'Unrowed', domain, actor: ACTOR });
    const source = await makeSourceDir({ 'index.html': 'STILL SERVED' }, workspacePath('unrowed', 'out'));
    await promoteRelease(surfaceOf('unrowed', 'preprod'), source);
    const served = join(surfaceOf('unrowed', 'preprod').linkPath, 'index.html');

    await undeclareSite('unrowed');

    const result = await deleteSite('unrowed', true);
    expect(result.removed).toEqual([]);
    expect(result.skipped[0]!.reason).toContain('site table');
    expect(await Bun.file(served).text()).toBe('STILL SERVED');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * URLs and the quota
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe("a site's URL is built from its own domain", () => {
  test('prod answers at the domain root, preprod at the draft host', () => {
    const manifest = manifestFor('demo');
    // PROD_URL_SCHEME and PREPROD_HOST_PREFIX are rendered into the env from the
    // declaration; the suite's env states http/pre.
    expect(siteUrl(manifest, 'prod')).toBe(`${config.PROD_URL_SCHEME}://${siteDomain('demo')}/`);
    expect(siteUrl(manifest, 'preprod')).toBe(
      `http://${config.PREPROD_HOST_PREFIX}.${siteDomain('demo')}/`,
    );
    // Never a shared base URL with the slug as a path segment — that shape is deleted.
    expect(siteUrl(manifest, 'prod')).not.toContain('/demo/');
  });
});

describe('the quota measures what a site actually consumes', () => {
  test('the workspace AND both release stores are counted', async () => {
    const { domain } = await provisionSite('heavy');
    await createSite({ slug: 'heavy', name: 'Heavy', domain, actor: ACTOR });
    const manifest = manifestFor('heavy');

    const before = await siteDiskUsageMb(manifest);
    expect(before.workspaceMb).toBeGreaterThan(0);
    expect(before.preprodMb).toBe(0);
    expect(before.prodMb).toBe(0);

    // A megabyte of "build output", promoted to both surfaces.
    const payload = 'x'.repeat(1024 * 1024);
    const src = await makeSourceDir({ 'index.html': payload }, workspacePath('heavy', 'out'));
    await promoteRelease(surfaceOf('heavy', 'preprod'), src);
    await promoteRelease(surfaceOf('heavy', 'prod'), src);

    const after = await siteDiskUsageMb(manifest);
    expect(after.preprodMb).toBeGreaterThan(0.9);
    expect(after.prodMb).toBeGreaterThan(0.9);
    expect(after.totalMb).toBeGreaterThan(after.workspaceMb + 1.8);
  });

  test('releases alone can exceed the quota, and the refusal says so', async () => {
    const { domain } = await provisionSite('bloated');
    await createSite({ slug: 'bloated', name: 'Bloated', domain, actor: ACTOR });
    const manifest = manifestFor('bloated');

    // Under the old measure (workspace only) this site was comfortably within quota: the
    // bytes are in the release stores, which nothing counted and no museum can see. The
    // build output is deleted after each promote, so the workspace stays small on purpose —
    // that is the whole point of the case.
    const payload = 'x'.repeat(2 * 1024 * 1024);
    for (let i = 0; i < config.RELEASES_RETAINED; i++) {
      const src = await makeSourceDir({ [`f${i}.html`]: payload }, workspacePath('bloated', 'out'));
      await promoteRelease(surfaceOf('bloated', 'preprod'), src);
      await new Promise(r => setTimeout(r, 2));
    }
    await rm(workspacePath('bloated', 'out'), { recursive: true, force: true });

    const usage = await siteDiskUsageMb(manifest);
    expect(usage.workspaceMb).toBeLessThan(config.SITE_DISK_QUOTA_MB);
    expect(usage.totalMb).toBeGreaterThan(config.SITE_DISK_QUOTA_MB);

    const promise = assertWithinQuota(manifest, 'a turn');
    await expect(promise).rejects.toThrow(LimitExceededError);
    await expect(promise).rejects.toThrow(/preprod releases/);
  });

  test('THE INCOMING COPY IS COUNTED — a promote cannot carry a site past the limit', async () => {
    // S5. The gate measured what a site already occupied and then let the caller add a whole
    // build on top of it: a site sitting just under its quota could be carried to nearly
    // twice it by one promote. The same site, the same disk, the same call — the only
    // difference is whether what is about to be copied in is weighed.
    const { domain } = await provisionSite('brimming');
    await createSite({ slug: 'brimming', name: 'Brimming', domain, actor: ACTOR });
    const manifest = manifestFor('brimming');

    const usage = await siteDiskUsageMb(manifest);
    const headroom = config.SITE_DISK_QUOTA_MB - usage.totalMb;
    expect(headroom).toBeGreaterThan(0);

    // Without the incoming copy the site is within quota…
    await assertWithinQuota(manifest, 'a turn');
    // …and with it, it is not.
    const promise = assertWithinQuota(manifest, 'promoting a build', headroom + 1);
    await expect(promise).rejects.toThrow(LimitExceededError);
    await expect(promise).rejects.toThrow(/about to be copied in/);
  });

  test('a site within quota passes', async () => {
    const { domain } = await provisionSite('light');
    await createSite({ slug: 'light', name: 'Light', domain, actor: ACTOR });
    await assertWithinQuota(manifestFor('light'), 'a turn');
  });
});
