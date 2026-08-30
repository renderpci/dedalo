import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../src/config';
import {
  declareSite,
  markerPath,
  provisionSite,
  readServed,
  releaseStorePath,
  resetInstance,
  roots,
  siteDomain,
  surfaceOf,
  webspaceOf,
  workspacePath,
  makeSourceDir,
} from './fixtures/instance';
import { createSite, deleteSite, listSlugs, siteExists } from '../src/sites/workspace';
import { readManifest } from '../src/sites/manifest';
import { promoteRelease } from '../src/build/promote';
import { WebspaceError } from '../src/sites/webspace';
import { ConflictError, ValidationError, LimitExceededError } from '../src/errors';

const ACTOR = { user_id: 42, username: 'tester' };

/**
 * A site the PROVISIONER has already prepared: its webspace exists and declares itself this
 * instance's, which is the precondition `createSite` refuses without. On a museum's host
 * that is `provision apply`; here it is the fixture.
 */
async function createProvisionedSite(slug: string, name: string): Promise<void> {
  const { domain } = await provisionSite(slug);
  await createSite({ slug, name, domain, actor: ACTOR });
}

beforeEach(resetInstance);
afterEach(resetInstance);

describe('createSite', () => {
  test('scaffolds a workspace with a valid manifest, git repo and AGENTS.md', async () => {
    const { domain } = await provisionSite('demo');
    const manifest = await createSite({ slug: 'demo', name: 'Demo Site', domain, actor: ACTOR });

    expect(manifest.slug).toBe('demo');
    expect(manifest.name).toBe('Demo Site');
    // The pairing with the host: the domain it answers on, which is also the name of the
    // webspace the provisioner made for it.
    expect(manifest.domain).toBe(siteDomain('demo'));
    expect(manifest.owner_user_id).toBe(42);
    expect(manifest.driver).toBe(config.AGENT_DRIVER);
    expect(manifest.template).toBe('basic');
    expect(manifest.published).toBeNull();

    const dir = workspacePath('demo');
    expect(existsSync(join(dir, 'site.json'))).toBe(true);
    expect(existsSync(join(dir, '.git'))).toBe(true);
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(dir, '.builder'))).toBe(true);
    // The template's package.json travels; template.json does not.
    expect(existsSync(join(dir, 'package.json'))).toBe(true);
    expect(existsSync(join(dir, 'template.json'))).toBe(false);

    // Re-reading the manifest validates it against the schema.
    const reread = await readManifest('demo');
    expect(reread.slug).toBe('demo');
  });

  test('substitutes the publication API URL placeholder into the template', async () => {
    await createProvisionedSite('sub', 'Sub');
    const helper = await readFile(workspacePath('sub', 'src', 'lib', 'dedalo.ts'), 'utf8');
    expect(helper).toContain(config.PUBLICATION_API_URL);
    expect(helper).not.toContain('__PUBLICATION_API_URL__');
  });

  test('embeds the site brief in AGENTS.md and links CLAUDE.md to it', async () => {
    await createProvisionedSite('brief', 'Brief Site');
    const agents = await readFile(workspacePath('brief', 'AGENTS.md'), 'utf8');
    expect(agents).toContain('Brief Site');
    expect(agents).toContain(config.PUBLICATION_API_URL);
    expect(agents).toContain('Static output only');
    // Symlink resolves to the same content.
    const claude = await readFile(workspacePath('brief', 'CLAUDE.md'), 'utf8');
    expect(claude).toBe(agents);
  });

  test('rejects an invalid slug and a duplicate', async () => {
    await expect(
      createSite({ slug: 'Bad Slug', name: 'x', domain: siteDomain('bad'), actor: ACTOR }),
    ).rejects.toThrow(ValidationError);
    await createProvisionedSite('dup', 'First');
    await expect(
      createSite({ slug: 'dup', name: 'Second', domain: siteDomain('dup'), actor: ACTOR }),
    ).rejects.toThrow(ConflictError);
  });

  test('enforces MAX_SITES', async () => {
    for (let i = 0; i < config.MAX_SITES; i++) {
      await createProvisionedSite(`site-${i}`, `Site ${i}`);
    }
    await provisionSite('overflow');
    await expect(
      createSite({ slug: 'overflow', name: 'x', domain: siteDomain('overflow'), actor: ACTOR }),
    ).rejects.toThrow(LimitExceededError);
  });

  test('a failed create leaves no wedged directory', async () => {
    await provisionSite('wedge');
    await expect(
      createSite({
        slug: 'wedge',
        name: 'x',
        domain: siteDomain('wedge'),
        template: 'nonexistent',
        actor: ACTOR,
      }),
    ).rejects.toThrow();
    expect(siteExists('wedge')).toBe(false);
    expect(existsSync(workspacePath('wedge'))).toBe(false);
  });

  test('a site the provisioner never DECLARED is refused, naming it', async () => {
    // The failure K2 left open: the daemon published into a tree no vhost served. It now
    // says so at CREATE time — before an agent spends an afternoon on a site that has
    // nowhere to go — and it refuses from the site TABLE rather than from a path it made
    // up: an undeclared site has no webspace to name, and inventing one is the defect.
    const promise = createSite({
      slug: 'homeless',
      name: 'Homeless',
      domain: siteDomain('homeless'),
      actor: ACTOR,
    });
    await expect(promise).rejects.toThrow(WebspaceError);
    await expect(promise).rejects.toThrow(/site 'homeless' is not in instance 'test's site table/);
    await expect(promise).rejects.toThrow(/provision apply/);
    await expect(promise).rejects.toThrow(/Nothing was written/);
    expect(siteExists('homeless')).toBe(false);
  });

  test('a DECLARED site whose webspace was never created is refused, naming the path', async () => {
    // The other half: the provisioner published the row and the directory is not there
    // (a half-finished apply, or a webspace an operator removed). The refusal quotes the
    // path the TABLE gives, which is the path the vhosts serve.
    const { domain } = await declareSite('unbuilt');
    const promise = createSite({ slug: 'unbuilt', name: 'Unbuilt', domain, actor: ACTOR });
    await expect(promise).rejects.toThrow(WebspaceError);
    await expect(promise).rejects.toThrow(webspaceOf('unbuilt'));
    await expect(promise).rejects.toThrow(/Nothing was written/);
    expect(siteExists('unbuilt')).toBe(false);
  });

  test('a site whose manifest domain disagrees with the table is refused', async () => {
    // The table says where site 'shifted' answers; a create that claims another domain for
    // it would publish these bytes into a tree serving a different hostname.
    await declareSite('shifted');
    const promise = createSite({
      slug: 'shifted',
      name: 'Shifted',
      domain: siteDomain('elsewhere'),
      actor: ACTOR,
    });
    await expect(promise).rejects.toThrow(WebspaceError);
    await expect(promise).rejects.toThrow(/site table/);
    expect(siteExists('shifted')).toBe(false);
  });

  test('a second site may not claim a domain another site already owns', async () => {
    // B2, measured over the daemon's socket before this check existed: POST /v1/sites with
    // a domain another site already answers on returned 201, and the new site reported the
    // EXISTING site's release — one webspace, one release store, one served link, and the
    // second publish silently replacing the first museum page's bytes.
    await createProvisionedSite('first', 'First');
    await provisionSite('second');

    const promise = createSite({
      slug: 'second',
      name: 'Second',
      domain: siteDomain('first'),
      actor: ACTOR,
    });
    await expect(promise).rejects.toThrow(ConflictError);
    await expect(promise).rejects.toThrow(/already belongs to the site 'first'/);
    expect(siteExists('second')).toBe(false);
    // And the first site's own placement is untouched by the attempt.
    expect(await listSlugs()).toEqual(['first']);
  });

  test("a webspace declaring ANOTHER instance is refused, and nothing is written", async () => {
    // WEBSPACE_BASE holds every museum's webspaces, so `<base>/<domain>` is a path this
    // instance can spell for somebody else's live site. The marker is what stops it.
    // DECLARED by the provisioner (the row exists), and the directory at that path belongs
    // to somebody else — which is exactly the case a table alone cannot answer: a table is
    // a file, and only the directory can say whose it is.
    await declareSite('neighbour');
    const webspace = webspaceOf('neighbour');
    await mkdir(webspace, { recursive: true });
    await writeFile(markerPath(webspace), 'other-museum\n', 'utf8');

    const promise = createSite({
      slug: 'neighbour',
      name: 'Neighbour',
      domain: siteDomain('neighbour'),
      actor: ACTOR,
    });
    await expect(promise).rejects.toThrow(WebspaceError);
    await expect(promise).rejects.toThrow(/other-museum/);
    expect(siteExists('neighbour')).toBe(false);
  });

  test('a domain that is not a hostname is refused before anything is created', async () => {
    await expect(
      createSite({ slug: 'weird', name: 'Weird', domain: 'not a domain', actor: ACTOR }),
    ).rejects.toThrow(ValidationError);
    expect(siteExists('weird')).toBe(false);
  });
});

describe('listSlugs / deleteSite', () => {
  test('lists created sites, sorted', async () => {
    // Renamed: it used to promise "and ignores dotdirs" while creating no dotdir. The
    // dotdir property is asserted two tests below, where one is actually created.
    await createProvisionedSite('alpha', 'A');
    await createProvisionedSite('beta', 'B');
    expect(await listSlugs()).toEqual(['alpha', 'beta']);
  });

  test('returns [] when the workspaces root does not exist at all', async () => {
    // The guard at workspace.ts:42. It used to be covered only incidentally, by the
    // hand-rolled wipes that left the root absent; resetInstance() now always recreates
    // it, so without this test the branch is unreachable from the suite.
    await rm(roots.sitesRoot, { recursive: true, force: true });
    expect(existsSync(roots.sitesRoot)).toBe(false);
    expect(await listSlugs()).toEqual([]);
  });

  test('ignores dot-directories in the workspaces root', async () => {
    // .audit and the instance marker's neighbours: a dotdir is never a site, even when
    // it holds a site.json. Previously asserted by a test name that created no dotdir.
    await createProvisionedSite('real', 'Real');
    await mkdir(workspacePath('.hidden'), { recursive: true });
    await writeFile(workspacePath('.hidden', 'site.json'), '{}', 'utf8');
    expect(await listSlugs()).toEqual(['real']);
  });

  test('deletes the workspace and the draft surface, and leaves production alone', async () => {
    await createProvisionedSite('gone', 'Gone');
    const draft = await promoteRelease(
      surfaceOf('gone', 'preprod'),
      await makeSourceDir({ 'index.html': 'draft' }, workspacePath('gone', 'dist')),
    );
    const live = await promoteRelease(
      surfaceOf('gone', 'prod'),
      await makeSourceDir({ 'index.html': 'live' }, workspacePath('gone', 'dist')),
    );

    await deleteSite('gone', false);

    expect(siteExists('gone')).toBe(false);
    expect(existsSync(workspacePath('gone'))).toBe(false);
    // The draft goes with the workspace…
    expect(existsSync(releaseStorePath('preprod', 'gone', draft))).toBe(false);
    // …and the published site stays up. Prod is a separate copy for exactly this reason.
    expect(existsSync(releaseStorePath('prod', 'gone', live))).toBe(true);
    expect(await readServed('prod', 'gone', 'index.html')).toBe('live');
    // The webspace itself is the provisioner's, not the daemon's, and stays.
    expect(existsSync(webspaceOf('gone'))).toBe(true);
  });

  test('purge_prod takes the published copy down too', async () => {
    await createProvisionedSite('purged', 'Purged');
    const live = await promoteRelease(
      surfaceOf('purged', 'prod'),
      await makeSourceDir({ 'index.html': 'live' }, workspacePath('purged', 'dist')),
    );
    await deleteSite('purged', true);
    expect(existsSync(releaseStorePath('prod', 'purged', live))).toBe(false);
    expect(existsSync(surfaceOf('purged', 'prod').linkPath)).toBe(false);
  });

  test('deleting an unknown site throws NotFound', async () => {
    await expect(deleteSite('never', false)).rejects.toThrow();
  });
});
