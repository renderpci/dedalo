/**
 * THE TEST INSTANCE — the one place the suite learns where its scratch roots are,
 * how to reset them, and what declares them the suite's to destroy.
 *
 * WHY THIS EXISTS. Until now every test that touched the filesystem read the roots
 * straight off the frozen config singleton and carried its own three-line `wipeRoots()`.
 * Seven copies of the same knowledge: seven files to edit whenever the daemon's idea of
 * "where my roots are" changes, and seven chances to edit six of them. Two changes have
 * since landed through this seam without a single filesystem test file learning a path —
 * the roots becoming instance-scoped (AGENT_HOME / AUDIT_DIR / WEBSPACE_BASE, one instance
 * per daemon), and the served surfaces becoming PER-SITE WEBSPACE PAIRS (`<webspace>/pre`,
 * `<webspace>/web`), which deleted PREPROD_ROOT and PROD_ROOT outright. The config shape
 * moves HERE, once, and the test files keep reading `roots.sitesRoot`, calling
 * `resetInstance()` and now `provisionSite()` unchanged.
 *
 * That is the whole point of building the fixture BEFORE the refactor rather than after.
 * A test suite that reaches through to the config singleton has no seam, so a config
 * change breaks every file at once and the real regressions are unreadable inside the
 * noise. With the seam in place, a broken root wiring is ONE red file, and a broken
 * behaviour is the test that actually asserts that behaviour.
 *
 * THE MARKER IS WRITTEN NOW, THOUGH NOTHING READS IT YET. Each root carries a
 * `.dedalo_site_instance` file naming the instance it belongs to. Today nothing asks for
 * it; the daemon will (it must refuse to boot against a root that has not declared
 * itself, exactly as the engine refuses a media root without `.dedalo_test_media` and a
 * database without its `dedalo_test_marker` row — a PATH is a claim, a MARKER is the
 * directory itself saying what it is and whose it is). Writing it here today means the
 * boot assertion arrives to a fixture that already satisfies it, instead of arriving
 * with eleven red files and the temptation to weaken the assertion.
 *
 * SCOPE. This module owns ROOTS and their lifecycle. It deliberately does NOT wrap the
 * rest of the config (SERVICE_TOKEN, MAX_SITES, BASE_PATH …): those keys are not moving,
 * and a wrapper around a stable thing is indirection without a seam.
 */

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { config } from '../../src/config';
import {
  INSTANCE_MARKER,
  derive,
  markerContent,
  surfacePaths,
  webspaceFor,
  type InstanceManifest,
  type ManifestSite,
  type Surface,
  type SurfacePaths,
} from '../../src/provision/layout';
import { sitesRenderer } from '../../src/provision/render/sites';

/**
 * The instance these scratch roots belong to. Generic on purpose — the same law as the
 * engine's generic `test` TLD: a fixture named after a real museum passes on one machine
 * and nowhere else.
 */
export const INSTANCE = 'test';

/**
 * The marker filename and its content come from `src/provision/layout.ts`, which owns
 * every naming convention on this subsystem — they are RE-EXPORTED here, never restated.
 *
 * This is the seam the fixture was built to be. The suite writes the marker, the daemon's
 * boot check will read it, and the provisioner plants it; three readers of one filename,
 * and a fixture that spelled its own copy would be the fourth — passing green while the
 * daemon refused to boot against the very roots the suite had just declared. The
 * guarantee is not "the marker is written", it is "everyone means the same file".
 *
 * The content is the INSTANCE NAME and nothing else (newline-terminated), so the boot
 * check can be a string compare rather than a parse: a root that names another instance is
 * as wrong as a root that names none, and must be refusable on that basis.
 */
export { INSTANCE_MARKER };
export const INSTANCE_MARKER_CONTENT = markerContent(INSTANCE);

/**
 * The scratch roots, read from config ONCE, in this one module, and frozen.
 *
 * Read once because the daemon's own config is parsed once at import (src/config.ts) and
 * a test that re-reads it mid-run would be asserting against a value nothing else in the
 * process can see. Frozen because a test that reassigns a root is not testing the daemon
 * any more — it is testing a root the daemon never had.
 */
export const roots = Object.freeze({
  /** Workspaces: the git repos the agents work in. */
  sitesRoot: config.SITES_ROOT,
  /** The agent's HOME — its own root, never inside a tree an agent turn writes to. */
  agentHome: config.AGENT_HOME,
  /** The audit trail's directory. On a provisioned host root-owned; here, the suite's. */
  auditDir: config.AUDIT_DIR,
  /**
   * The parent of the per-site WEBSPACES — and, since the surfaces became webspace pairs,
   * the only place a served byte lives. `PREPROD_ROOT` and `PROD_ROOT` used to be here:
   * one tree per surface, every site a directory inside it, served at `<root>/<slug>/`.
   * The provisioner never built that shape and no generated vhost ever served it, so the
   * two keys are gone from the daemon's configuration and gone from here with it.
   */
  webspaceBase: config.WEBSPACE_BASE,
  /**
   * The instance CONFIG directory — not a daemon root (the daemon never writes here; on a
   * museum's host it is root-owned /etc), but the suite has to hold it because the
   * provisioner's SITE TABLE lives in it and the fixture plays the provisioner.
   */
  configDir: dirname(config.SITE_TABLE_FILE),
  /** The site table itself: `<configDir>/sites.json`, the file the daemon reads. */
  siteTable: config.SITE_TABLE_FILE,
});

/**
 * The scratch directory the roots live under, and its bare name.
 *
 * Exported for the same reason the roots are: a walker that needs to SKIP the scratch tree
 * (tests/provision_examples.test.ts walks the package looking for stale artifacts) would
 * otherwise hardcode '.test-tmp', which is the pile this fixture exists to prevent. One
 * spelling, derived from the roots themselves, so moving them moves this too.
 */
export const SCRATCH_ROOT = dirname(roots.sitesRoot);
export const SCRATCH_DIR_NAME = SCRATCH_ROOT.split('/').filter(Boolean).pop() ?? '.test-tmp';

/** The two SERVED surfaces, re-exported so a test names 'preprod' and never a root. */
export type { Surface, SurfacePaths };

/**
 * Every root, in the order a reset walks them.
 *
 * FOUR: the three the daemon's boot preflight holds, plus the webspace base. A root the
 * reset does not walk is a root one test leaves dirty for the next (the audit gate's
 * "reading an absent log returns empty" is exactly that shape). The seam existed for moves
 * like this one — the surfaces stopped being roots and no filesystem test file learned a
 * path for it.
 */
export function allRoots(): readonly string[] {
  return [roots.sitesRoot, roots.agentHome, roots.auditDir, roots.webspaceBase];
}

/** Where a root's instance marker lives. */
export function markerPath(root: string): string {
  return join(root, INSTANCE_MARKER);
}

/**
 * Declare `root` as belonging to this instance, creating it if needed.
 *
 * Idempotent, and it REWRITES rather than skipping an existing marker: a root left over
 * from another instance's run must end up naming this one, not keep its old claim.
 */
export async function markInstanceRoot(root: string): Promise<string> {
  await mkdir(root, { recursive: true });
  await writeFile(markerPath(root), INSTANCE_MARKER_CONTENT, 'utf8');
  return root;
}

/** Does `root` declare itself ours? (The shape the daemon's boot check will need.) */
export async function instanceRootIsMarked(root: string): Promise<boolean> {
  const marker = markerPath(root);
  if (!existsSync(marker)) return false;
  return (await readFile(marker, 'utf8')).trim() === INSTANCE;
}

/**
 * A root that exists but does NOT declare itself ours is REFUSED, never destroyed.
 *
 * The same law the engine applies to its test database and its test media root: a path
 * is only a claim, and a claim is not a guarantee. `.env.test` is an ordinary file, a
 * root is an ordinary string, and `resetInstance()` is an `rm -rf` — so the one thing
 * standing between a mistyped root and somebody's real site tree must be the directory
 * itself saying whose it is. An EMPTY directory is adopted rather than refused: there is
 * nothing there to destroy, and refusing it would only punish a clean checkout.
 */
async function assertDestroyable(root: string): Promise<void> {
  if (!existsSync(root)) return; // nothing to destroy
  if (await instanceRootIsMarked(root)) return; // ours, by its own declaration

  const entries = await readdir(root);
  if (entries.length === 0) return; // empty: nothing to lose by adopting it

  const marker = markerPath(root);
  const found = existsSync(marker) ? (await readFile(marker, 'utf8')).trim() : '(no marker)';
  throw new Error(
    `resetInstance refuses to wipe '${root}': it holds ${entries.length} entr` +
      `${entries.length === 1 ? 'y' : 'ies'} and does not declare itself instance ` +
      `'${INSTANCE}' (found: ${found}). Nothing was written. Expected a ` +
      `'${INSTANCE_MARKER}' file naming '${INSTANCE}' — if this really is a scratch ` +
      `root, delete it by hand and re-run.`,
  );
}

/**
 * WIPE AND RE-DECLARE EVERY ROOT — the single replacement for every hand-rolled
 * `wipeRoots()` in the suite.
 *
 * Three properties the copies did not have:
 *
 *   - It REFUSES a root that is not ours (see assertDestroyable above). The copies were
 *     an unguarded `rm -rf` on whatever the config happened to resolve to.
 *   - It resets EVERY root, always. The copies each wiped the subset their file
 *     happened to dirty, which quietly made every test depend on which file ran before
 *     it. A test starts from the same empty instance whatever else the suite did.
 *   - It leaves the instance BOOTABLE, not merely empty: `rm -rf` takes the marker with
 *     it, so the reset plants it again. A fixture that resets into an undeclared
 *     instance would fail the boot check the moment it exists.
 */
export async function resetInstance(): Promise<void> {
  // Check every root BEFORE destroying any, so a bad LAST root cannot leave the earlier
  // ones already wiped.
  for (const root of allRoots()) await assertDestroyable(root);
  await assertDestroyable(roots.configDir);
  for (const root of allRoots()) {
    await rm(root, { recursive: true, force: true });
    await markInstanceRoot(root);
  }
  // AND THE INSTANCE'S CONFIG DIRECTORY, which holds the provisioner's site table. A reset
  // that left the table behind would start the next test with the previous one's sites
  // declared — and since the daemon now answers every placement question out of that file,
  // that is not a stale directory, it is stale ANSWERS.
  await rm(roots.configDir, { recursive: true, force: true });
  await markInstanceRoot(roots.configDir);
  declaredSites.clear();
  await writeSiteTable();
}

/** A path inside the WORKSPACE root (a site's repo, or the scratch source below). */
export function workspacePath(...segments: string[]): string {
  return join(roots.sitesRoot, ...segments);
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The per-site webspaces AND THE SITE TABLE — the fixture playing the PROVISIONER
 *
 * On a museum's host the provisioner does two things for a site: it CREATES the webspace
 * (marks it, chowns it, renders its two vhosts) and it PUBLISHES the placement into
 * `<configDir>/sites.json`, the table the daemon reads and out of which every path it
 * writes to comes. The daemon derives none of them — that was the defect (two derivations
 * of one fact, disagreeing on any site that uses the declaration's `webspace` override).
 *
 * The suite has no provisioner, so this fixture does both jobs — and does the second one
 * through `derive()` and the REAL `sites` renderer rather than by hand-writing JSON. A
 * fixture that spelled the table itself would be a second writer of the format: green on
 * the day the renderer changed shape and the daemon could no longer read what the
 * provisioner writes, which is the precise failure the table exists to make impossible.
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * The sites this instance has DECLARED, in declaration order — the fixture's stand-in for
 * the `sites` array of instance.json. Module state, cleared by every `resetInstance()`, so
 * a test starts from an instance with no sites declared at all.
 */
const declaredSites = new Map<string, ManifestSite>();

/**
 * The domain a test site answers on.
 *
 * `.test` is the RFC 6761 reserved TLD — the same law as the engine's generic `test` TLD:
 * a fixture named after a real museum's domain passes on one machine and nowhere else, and
 * a fixture named after a REGISTRABLE domain is a suite that could one day reach somebody.
 */
export function siteDomain(slug: string): string {
  return `${slug}.test`;
}

/**
 * The declaration the fixture derives everything from — the suite's instance.json.
 *
 * `paths.config_base` is pinned so that the table `derive()` places at
 * `<config_base>/<instance>/sites.json` IS the file `.env.test` tells the daemon to read.
 * The two are asserted equal below rather than assumed: a fixture writing the table where
 * the daemon does not look would fail every test with "the provisioner never created a
 * webspace", which is a true sentence about a false situation and would send somebody
 * hunting in the wrong module.
 */
function instanceDeclaration(): InstanceManifest {
  return {
    instance: INSTANCE,
    web: { group: 'www-data' },
    engine: { group: 'dedalo-engine', private_dir: join(SCRATCH_ROOT, 'engine_private') },
    agent: { driver: 'claude_code' },
    publication_api: { url: config.PUBLICATION_API_URL },
    serving: {
      preprod: { enabled: true, auth: { mode: 'none' } },
      prod: { tls: { mode: 'none' } },
    },
    paths: { config_base: dirname(roots.configDir), state_base: join(SCRATCH_ROOT, 'state') },
    roots: { workspaces: roots.sitesRoot, home: roots.agentHome, audit: roots.auditDir },
    webspace_base: roots.webspaceBase,
    sites: [...declaredSites.values()],
  } as InstanceManifest;
}

/** The derived layout of the suite's instance — the provisioner's answer, in full. */
export function instanceLayout(): ReturnType<typeof derive> {
  return derive(instanceDeclaration());
}

/**
 * RENDER AND WRITE THE SITE TABLE, exactly as `provision apply` would: the real renderer's
 * bytes, at the path the real layout names.
 */
async function writeSiteTable(): Promise<void> {
  const manifest = instanceDeclaration();
  const layout = derive(manifest);
  if (layout.siteTablePath !== roots.siteTable) {
    throw new Error(
      `the fixture would write the site table to '${layout.siteTablePath}' while the daemon ` +
        `reads '${roots.siteTable}' (SITE_TABLE_FILE in .env.test). The two must be one path: ` +
        `set SITE_TABLE_FILE to <config_base>/${INSTANCE}/sites.json.`,
    );
  }
  const [rendered] = sitesRenderer.render(layout, manifest);
  await mkdir(dirname(rendered!.path), { recursive: true });
  await writeFile(rendered!.path, rendered!.body, 'utf8');
}

/**
 * DECLARE a site — a row in the table, and nothing on disk.
 *
 * The provisioner's two halves are separable and a test needs them separately: "declared
 * but never created" is exactly the state the daemon must refuse to publish into, and it is
 * unreachable if declaring always made the directory.
 */
export async function declareSite(
  slug: string,
  options: { domain?: string; webspace?: string } = {},
): Promise<{ slug: string; domain: string; webspace: string }> {
  const domain = options.domain ?? siteDomain(slug);
  const site: ManifestSite = options.webspace
    ? { slug, domain, webspace: options.webspace }
    : { slug, domain };
  declaredSites.set(slug, site);
  await writeSiteTable();
  return { slug, domain, webspace: webspaceOf(slug) };
}

/**
 * UN-DECLARE a site: the row leaves the table, the directory stays where it is.
 *
 * The state a museum reaches by removing a site from instance.json and re-applying, with
 * the workspace still on disk. The daemon must then refuse to publish it and must not
 * delete anything at a path it has to invent, which is only assertable if the fixture can
 * reach this state at all.
 */
export async function undeclareSite(slug: string): Promise<void> {
  declaredSites.delete(slug);
  await writeSiteTable();
}

/**
 * DECLARE AND CREATE a site's webspace, exactly as `provision apply` would: the row exists
 * in the table, the directory exists and declares itself this instance's, and nothing else
 * is planted — the release stores and the served links are the daemon's to make.
 *
 * Returns the domain, because that is what `createSite` needs next; a test that wants the
 * path asks `webspaceOf`.
 */
export async function provisionSite(
  slug: string,
  options: { domain?: string; webspace?: string } = {},
): Promise<{ slug: string; domain: string; webspace: string }> {
  const declared = await declareSite(slug, options);
  await markInstanceRoot(declared.webspace);
  return declared;
}

/**
 * Where a test site's webspace is — READ OFF THE DERIVED LAYOUT, never re-derived here.
 *
 * For a site with no override that is `<WEBSPACE_BASE>/<domain>`; for one WITH an override
 * it is the override, which is the whole point: the fixture must be able to express the
 * shape the committed reference declaration uses, and a fixture that always answered
 * `<base>/<domain>` could not.
 */
export function webspaceOf(slug: string): string {
  const site = instanceLayout().sites.find(entry => entry.slug === slug);
  if (site) return site.webspace;
  // Not declared: the DEFAULT placement, so a test can still name the path a site WOULD
  // have had (the "declared nowhere / created nowhere" refusals quote it).
  return webspaceFor(roots.webspaceBase, siteDomain(slug));
}

/** One surface of a test site, as the daemon's promote layer wants it: the pair. */
export function surfaceOf(slug: string, surface: Surface): SurfacePaths {
  return surfacePaths(webspaceOf(slug), surface);
}

/** A path inside a served surface — `servedPath('prod', 'demo', 'index.html')`. */
export function servedPath(surface: Surface, slug: string, ...segments: string[]): string {
  return join(surfaceOf(slug, surface).linkPath, ...segments);
}

/** A path inside a surface's RELEASE STORE — the immutable copies behind the served link. */
export function releaseStorePath(surface: Surface, slug: string, ...segments: string[]): string {
  return join(surfaceOf(slug, surface).storeDir, ...segments);
}

/**
 * Read a file THROUGH the served symlink — the assertion "what the web server would
 * hand a visitor right now", which is the only thing a promote/publish/rollback test
 * actually cares about. Reading the release directory directly would pass even if the
 * symlink swap never happened.
 */
export function readServed(surface: Surface, slug: string, ...segments: string[]): Promise<string> {
  return readFile(servedPath(surface, slug, ...segments), 'utf8');
}

/**
 * The default scratch source directory: a plain directory of files standing in for
 * "whatever a build produced". Inside the workspace root so `resetInstance()` sweeps it.
 * The `__…__` name is not a valid slug, so it can never collide with a real site.
 */
export const SCRATCH_SOURCE = workspacePath('__src__');

/**
 * Build a source directory from a {relative path → content} map, replacing whatever was
 * there. Returns the directory, so a caller can hand it straight to `promoteRelease`.
 *
 * Replacing rather than merging is deliberate: a promote test that writes v2 over v1
 * must promote v2 ALONE, or "the symlink now serves the new release" would pass on a
 * directory that still holds the old bytes too.
 */
export async function makeSourceDir(
  files: Record<string, string>,
  dir: string = SCRATCH_SOURCE,
): Promise<string> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const [relative, content] of Object.entries(files)) {
    const target = join(dir, relative);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return dir;
}
