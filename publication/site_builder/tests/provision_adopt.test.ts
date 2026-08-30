/**
 * ADOPTION, AGAINST A PRE-INSTANCE INSTALL THAT REALLY EXISTS.
 *
 * `tests/provision_cli.test.ts` holds the COMMAND — the flags, the exit codes, the order the
 * verb calls its siblings in. This file holds the thing that actually has to be true, and it
 * cannot be asserted with fakes: given a hand-built install on disk, with real released bytes
 * under real served symlinks, adoption must produce a declaration whose DERIVED layout is the
 * tree that is already there, move the credentials out of the plaintext env, retire that file
 * rather than delete it — and be able to PROVE afterwards that not one site moved.
 *
 * WHAT THE SYNTHETIC INSTALL IS. A temporary prefix holding exactly what the retired
 * installer left on a museum's host: a `.env` with the roots and five credentials in
 * plaintext, a `dedalo-site-builder.service` naming a `User=` and no `Group=` (the latent
 * failure the installer left — the unit hard-required a group that distro policy might never
 * have created), three state roots with content in them, and two webspaces whose `pre` and
 * `web` symlinks point at real, non-empty release directories. It is built by this file and
 * torn down after; nothing here touches a path outside its own prefix.
 *
 * WHY IT RUNS THE REAL `plan()` AND `apply()`. Because "nothing moves" is a claim about what
 * PROVISIONING does to an adopted host, not about what adoption writes. Running the migration
 * and then stopping would prove that the declaration is right; running the whole converge
 * afterwards and re-reading the same six links is what proves that the museum's live pages
 * are still coming off the same bytes. The io is the seam: real writes and real renames
 * inside the prefix, ownership recorded (a suite is not root), commands stubbed.
 *
 * WHAT IT MAY NOT DO, and does not: assert a credential's VALUE anywhere it could be printed.
 * The secrecy assertions run the other way round — every line of every report is searched for
 * the values, and the values are distinctive strings chosen so that a leak cannot hide.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

import {
  LEGACY_UNIT_PATH,
  MIGRATED_CREDENTIALS,
  PRE_INSTANCE_ENV,
  RETIRED_ENV,
  applyMigration,
  describeMigration,
  inferManifest,
  migrationSteps,
  movesBytes,
  observePreInstance,
  preInstanceSurface,
  type AdoptIo,
  type AdoptOverlay,
  type PreInstance,
} from '../src/provision/adopt';
import {
  expectationsFor,
  relocateExpectations,
  verifyServing,
  describeVerdict,
  type ServedSite,
} from '../src/provision/verify';
import {
  INSTANCE_MARKER,
  SURFACES,
  derive,
  type InstanceLayout,
  type InstanceManifest,
  type Surface,
} from '../src/provision/layout';
import { apply, type PathFacts, type ExecResult } from '../src/provision/apply';
import { observedPaths, plan, type EntryType, type HostState, type PathObservation } from '../src/provision/plan';
import { renderAll } from '../src/provision/render';

/* ────────────────────────────────────────────────────────────────────────────────────
 * The distinctive credential values — chosen so a leak cannot hide in a report
 * ──────────────────────────────────────────────────────────────────────────────────── */

const VALUES: Readonly<Record<string, string>> = Object.freeze({
  SERVICE_TOKEN: 'ZZbearer-value-must-never-be-printed-0000',
  ANTHROPIC_API_KEY: 'ZZanthropic-value-must-never-be-printed',
  OPENCODE_ENV: 'OPENAI_API_KEY=ZZopencode-value-must-never-be-printed',
  PI_ENV: 'PI_API_KEY=ZZpi-value-must-never-be-printed',
  PUBLICATION_API_KEY: 'ZZpublication-value-must-never-be-printed',
});

const RELEASES: Readonly<Record<Surface, string>> = Object.freeze({
  preprod: '20260829-draft',
  prod: '20260828-live',
});

const SITES = Object.freeze([
  { slug: 'collection', domain: 'www.example.org' },
  { slug: 'archive', domain: 'archive.example.net' },
]);

const prefixes: string[] = [];
afterAll(() => {
  for (const prefix of prefixes) rmSync(prefix, { recursive: true, force: true });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * The pre-instance install — BUILT FROM THE BYTES THAT ACTUALLY SHIPPED
 *
 * There has only ever been ONE installer: `install.sh` + `sample.env` +
 * `deploy/dedalo-site-builder.service`, deleted in b46a29418e when the renderers replaced
 * them. This fixture is built from those three files, recovered verbatim into
 * `tests/fixtures/pre_instance/` and frozen by hash below, because a fixture written from
 * memory is how `adopt` came to read AGENT_HOME, AUDIT_DIR and WEBSPACE_BASE — three keys
 * that install never wrote — and so could not adopt any install that has ever existed.
 *
 * Recover them again, if you ever need to check:
 *     git show b46a29418e^:publication/site_builder/sample.env
 *     git show b46a29418e^:publication/site_builder/install.sh
 *     git show b46a29418e^:publication/site_builder/deploy/dedalo-site-builder.service
 * ──────────────────────────────────────────────────────────────────────────────────── */

const FIXTURE_DIR = join(import.meta.dir, 'fixtures', 'pre_instance');

/**
 * THE RECOVERED BYTES, FROZEN. History cannot be re-fetched by a hermetic gate — there is no
 * git here — so the three files are committed and their hashes are stated. Editing one to
 * make a test pass is then a red gate rather than a quiet rewrite of what the past was.
 */
const RECOVERED: Readonly<Record<string, string>> = Object.freeze({
  'sample.env': 'a5fc4310755f58cacbda538e3d47a2a9d052b182613877f0ef510ea93523b753',
  'install.sh': '458bfad3c5ea7b3269ca95f60f1b35e81ae8fa8256197b0310c3fd0e21ce2cb1',
  'dedalo-site-builder.service': '5b579e8b4aa1798165fbb9f42f7f32fe79264211f11d86b59a17f4eee00f9716',
});

function recovered(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8');
}

interface Install {
  readonly prefix: string;
  /** `install.sh`'s `HERE` — the package directory the `.env` sits beside. */
  readonly from: string;
  readonly unitPath: string;
  /** `SITES_ROOT`. */
  readonly workspaces: string;
  /** `PREPROD_ROOT` / `PROD_ROOT` — the two SHARED surface roots of the retired shape. */
  readonly preprodRoot: string;
  readonly prodRoot: string;
  /** The checkout the unit runs the daemon out of, and the pinned bun beside it. */
  readonly checkout: string;
  readonly bunBin: string;
  /** Where the ADOPTED layout puts webspaces — declared in the fragment, not inferred. */
  readonly webspaceBase: string;
  readonly overlay: AdoptOverlay;
}

/** `<webspace base>/<domain>` — where a site's bytes END UP, not where they start. */
function webspaceOf(install: Install, site: { domain: string }): string {
  return join(install.webspaceBase, site.domain);
}

/**
 * The retired `(root, slug)` pair — ASKED OF `adopt.ts`, never spelled here.
 *
 * `preInstanceSurface()` is the one place in the tree that still remembers the shape the
 * only shipped daemon wrote; a gate that spelled it a second time would keep passing on the
 * day that spelling was corrected, which is what the seam tripwire refuses.
 */
function legacySurface(install: Install, surface: Surface, slug: string): { store: string; link: string } {
  const paths = preInstanceSurface(surface === 'prod' ? install.prodRoot : install.preprodRoot, slug, surface);
  return { store: paths.storeDir, link: paths.linkPath };
}

function write(path: string, body: string, mode = 0o644): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, 'utf8');
  chmodSync(path, mode);
}

/**
 * Build a museum's pre-instance host, out of the shipped files.
 *
 * `sample.env` and the unit are read verbatim and RELOCATED — every absolute path the two
 * of them name is rewritten under this run's temporary prefix, and nothing else about them
 * is touched. So the KEYS this fixture feeds adoption are exactly the keys that install
 * wrote, including the three modern ones it never had, and a change to what history was is
 * a change to a hash.
 */
function makeInstall(options: { published?: boolean; unitWithoutGroup?: boolean } = {}): Install {
  const prefix = mkdtempSync(join(tmpdir(), 'dedalo-adopt-'));
  prefixes.push(prefix);

  const under = (path: string): string => join(prefix, path.replace(/^\//, ''));
  const install: Install = {
    prefix,
    from: under('/opt/dedalo/master_dedalo/publication/site_builder'),
    unitPath: under('/etc/systemd/system/dedalo-site-builder.service'),
    workspaces: under('/var/lib/dedalo_sites/workspaces'),
    preprodRoot: under('/var/lib/dedalo_sites/preprod'),
    prodRoot: under('/var/www/dedalo_sites'),
    checkout: under('/opt/dedalo/master_dedalo'),
    bunBin: under('/opt/dedalo/.bun/bin/bun'),
    webspaceBase: under('/srv/www'),
    overlay: {
      // The three facts a pre-instance install records NOWHERE, plus this gate's own
      // relocation of the host bases into its prefix.
      engine: {
        private_dir: under('/srv/dedalo/example/private'),
        group: 'dedalo-example',
      },
      web: { server: 'nginx', group: 'www-data' },
      webspace_base: under('/srv/www'),
      paths: {
        state_base: under('/var/lib/dedalo_sites'),
        unit_dir: under('/etc/systemd/system'),
        vhost_dir: under('/etc/nginx/sites-available'),
        vhost_enabled_dir: under('/etc/nginx/sites-enabled'),
      },
      serving: { prod: { tls: { mode: 'letsencrypt', account_email: 'ops@example.org' } } },
    },
  };

  // ── THE `.env`, as install.sh wrote it: sample.env with a generated SERVICE_TOKEN, and
  //    every absolute path relocated into this prefix. The credentials are this file's own
  //    distinctive values so a leak into any report cannot hide.
  let env = recovered('sample.env').replace(/^([A-Z_]+)=(\/\S*)$/gm, (_line, key, value) => `${key}=${under(value)}`);
  for (const [key, value] of Object.entries(VALUES)) {
    env = env.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}="${value}"`);
  }
  env = env.replace(/^CLAUDE_CODE_BIN=.*$/m, `CLAUDE_CODE_BIN=${under('/usr/local/bin/claude')}`);
  write(join(install.from, PRE_INSTANCE_ENV), env, 0o600);

  // ── THE INSTALLED UNIT, relocated the same way. `--unit` names it; its `User=`/`Group=`
  //    are the museum's identity and its `WorkingDirectory=`/`ExecStart=` are where the
  //    daemon's code and runtime actually are.
  let unit = recovered('dedalo-site-builder.service').replace(/(^|=|\s)(\/(?:opt|var|etc|srv|usr)\/\S*)/gm, (_m, lead, path) => `${lead}${under(path)}`);
  if (options.unitWithoutGroup) {
    // The retired installer's LATENT FAILURE, kept reachable: `useradd --system
    // --create-home` with no `--user-group` left group creation to distro policy, and a
    // unit with no `Group=` is read as "named after the user" (plan() creates it).
    unit = unit.replace(/^Group=.*$\n/m, '');
  }
  write(install.unitPath, unit);

  // ── THE ROOTS install.sh §2 created, and no others. There is no AGENT_HOME and no
  //    separate audit directory: the audit trail is a file inside SITES_ROOT/.audit.
  for (const dir of [install.workspaces, join(install.workspaces, '.audit'), install.preprodRoot, install.prodRoot]) {
    mkdirSync(dir, { recursive: true });
  }
  write(join(install.workspaces, '.audit', 'audit.jsonl'), '{"action":"create_site"}\n');

  // ── The sites: a manifest each under SITES_ROOT, and two surfaces each under the SHARED
  //    surface roots — `<root>/.releases/<slug>/<release>`, served through `<root>/<slug>`.
  for (const site of SITES) {
    write(
      join(install.workspaces, site.slug, 'site.json'),
      `${JSON.stringify(
        {
          slug: site.slug,
          name: site.slug,
          owner_user_id: 1,
          created_at: '2026-08-01T00:00:00.000Z',
          driver: 'claude_code',
          template: 'basic',
          build: { install: 'bun install', build: 'bun run build', output: 'dist' },
          domain: site.domain,
          published:
            options.published === false ? null : { release: RELEASES.prod, at: '2026-08-28T00:00:00.000Z', by: 'paco' },
        },
        null,
        2,
      )}\n`,
    );
    plantSurfaces(install, site, options.published !== false);
  }

  return install;
}

/**
 * One site's two surfaces, as the RETIRED daemon left them: a store per (root, slug), a
 * release directory holding real bytes, and a served symlink whose target is RELATIVE —
 * the store's own path plus the release, which is what `promote.ts` wrote, verbatim.
 */
function plantSurfaces(install: Install, site: { slug: string; domain: string }, published: boolean): void {
  for (const surface of SURFACES) {
    const { store, link } = legacySurface(install, surface, site.slug);
    const release = RELEASES[surface];
    if (surface === 'prod' && !published) {
      mkdirSync(store, { recursive: true });
      symlinkSync(relative(dirname(link), store), link);
      continue;
    }
    write(join(store, release, 'index.html'), `<h1>${site.slug} ${surface}</h1>\n`);
    symlinkSync(relative(dirname(link), join(store, release)), link);
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The io: real bytes inside the prefix, ownership recorded, commands stubbed
 * ──────────────────────────────────────────────────────────────────────────────────── */

interface RecordingIo extends AdoptIo {
  readonly access: Map<string, { owner: string; group: string; mode: number }>;
  readonly execLog: string[][];
  readonly host: { users: Set<string>; groups: Set<string>; unitEnabled: boolean; unitActive: boolean };
}

function entryType(path: string): EntryType {
  const entry = lstatSync(path);
  return entry.isSymbolicLink() ? 'symlink' : entry.isDirectory() ? 'dir' : entry.isFile() ? 'file' : 'other';
}

/** Anything the layout puts outside the prefix (only `/run`) lands inside it. */
function onHost(install: Install, path: string): string {
  return path.startsWith(install.prefix) ? path : join(install.prefix, path);
}

function makeIo(install: Install): RecordingIo {
  const access = new Map<string, { owner: string; group: string; mode: number }>();
  const execLog: string[][] = [];
  const host = { users: new Set<string>(), groups: new Set<string>(), unitEnabled: false, unitActive: false };
  const on = (path: string): string => onHost(install, path);

  return {
    access,
    execLog,
    host,
    stat(path: string): PathFacts | null {
      const real = on(path);
      try {
        lstatSync(real);
      } catch {
        return null;
      }
      const recorded = access.get(path);
      return {
        type: entryType(real),
        mode: recorded?.mode ?? lstatSync(real).mode & 0o7777,
        owner: recorded?.owner ?? 'root',
        group: recorded?.group ?? 'root',
      };
    },
    readFile(path: string): string | null {
      try {
        return readFileSync(on(path), 'utf8');
      } catch {
        return null;
      }
    },
    readLink(path: string): string | null {
      try {
        return readlinkSync(on(path));
      } catch {
        return null;
      }
    },
    readDir(path: string): string[] | null {
      try {
        return readdirSync(on(path)).sort();
      } catch {
        return null;
      }
    },
    readInstanceMarker(root: string): string | null {
      try {
        return readFileSync(on(`${root}/.dedalo_site_instance`), 'utf8').trim() || null;
      } catch {
        return null;
      }
    },
    mkdir(path: string): void {
      mkdirSync(on(path), { recursive: true });
    },
    writeFile(path: string, body: string, mode: number): void {
      mkdirSync(dirname(on(path)), { recursive: true });
      writeFileSync(on(path), body, 'utf8');
      chmodSync(on(path), mode);
      const recorded = access.get(path);
      access.set(path, { owner: recorded?.owner ?? 'root', group: recorded?.group ?? 'root', mode });
    },
    symlink(path: string, target: string): void {
      symlinkSync(target, on(path));
    },
    rename(from: string, to: string): void {
      renameSync(on(from), on(to));
    },
    chown(path: string, owner: string, group: string): void {
      const recorded = access.get(path);
      access.set(path, { owner, group, mode: recorded?.mode ?? lstatSync(on(path)).mode & 0o7777 });
    },
    chmod(path: string, mode: number): void {
      chmodSync(on(path), mode);
      const recorded = access.get(path);
      access.set(path, { owner: recorded?.owner ?? 'root', group: recorded?.group ?? 'root', mode });
    },
    exec(argv: readonly string[]): ExecResult {
      execLog.push([...argv]);
      const line = argv.join(' ');
      if (argv[0] === 'groupadd') host.groups.add(argv[argv.length - 1] as string);
      if (argv[0] === 'useradd') host.users.add(argv[argv.length - 1] as string);
      if (line.startsWith('systemctl enable')) host.unitEnabled = true;
      if (line.startsWith('systemctl start') || line.startsWith('systemctl restart')) host.unitActive = true;
      return { code: 0, stdout: '', stderr: '' };
    },
    mintToken(): string {
      return 'ZZminted-token-that-must-never-be-printed';
    },
    hashPassword(password: string): string {
      return `$2y$fake$${password.length}`;
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Helpers the whole file shares
 * ──────────────────────────────────────────────────────────────────────────────────── */

interface Adopted {
  readonly install: Install;
  readonly io: RecordingIo;
  readonly pre: PreInstance;
  readonly manifest: InstanceManifest;
  readonly layout: InstanceLayout;
  readonly served: ServedSite[];
}

/** Observe and infer, without writing anything. */
function adoptDryRun(install: Install, io: RecordingIo = makeIo(install)): Adopted {
  const pre = observePreInstance({ from: install.from, legacyUnitPath: install.unitPath }, io);
  const manifest = inferManifest(pre, {
    instance: 'example',
    configDir: join(install.prefix, 'etc/dedalo_sites/instances'),
    overlay: install.overlay,
  });
  const layout = derive(manifest);
  // The same pairing `cli.ts` performs: the webspace the site will be served from, plus —
  // for as long as the bytes are still under the shared surface roots — where they are now.
  const served: ServedSite[] = pre.sites.map(site => ({
    slug: site.slug,
    webspace: layout.sites.find(candidate => candidate.slug === site.slug)!.webspace,
    publishedRelease: site.publishedRelease,
    surfaces: Object.fromEntries(
      Object.entries(site.surfaces).map(([surface, current]) => [surface, current.paths]),
    ),
  }));
  return { install, io, pre, manifest, layout, served };
}

/** The `HostState` the real observer would produce, read off the synthetic host. */
function observe(adopted: Adopted): HostState {
  const { install, io, layout, manifest } = adopted;
  const contentful = new Set<string>([
    ...renderAll(layout, manifest).map(artifact => artifact.path),
    ...[layout.roots.workspaces, layout.roots.home, layout.roots.audit, ...layout.sites.map(site => site.webspace)].map(
      root => join(root, INSTANCE_MARKER),
    ),
  ]);

  const entries: Record<string, PathObservation> = {};
  for (const path of observedPaths(layout, manifest)) {
    const facts = io.stat(path);
    if (!facts) continue;
    const real = onHost(install, path);
    entries[path] = {
      type: facts.type,
      mode: facts.mode,
      owner: facts.owner,
      group: facts.group,
      ...(contentful.has(path) ? { content: readFileSync(real, 'utf8') } : {}),
      ...(facts.type === 'symlink' ? { target: readlinkSync(real) } : {}),
      ...(facts.type === 'dir' ? { empty: readdirSync(real).length === 0 } : {}),
      mtimeMs: lstatSync(real).mtimeMs,
    };
  }

  return {
    users: [...io.host.users],
    groups: [...io.host.groups, layout.identity.webGroup, layout.identity.engineGroup],
    entries,
    unitEnabled: io.host.unitEnabled,
    unitActive: io.host.unitActive,
    nologinShell: '/usr/sbin/nologin',
    webServerUnit: 'nginx',
  };
}

/** The whole thing: migrate, then converge through the ordinary plan/apply. */
function adoptFully(install: Install): Adopted & { migrationLines: string[]; applyLines: string[] } {
  const adopted = adoptDryRun(install);
  const steps = migrationSteps(adopted.pre, adopted.layout, adopted.manifest);
  const migration = applyMigration(steps, adopted.pre, adopted.io);
  expect(migration.failure?.detail ?? 'ok').toBe('ok');

  const actions = plan(adopted.layout, adopted.manifest, observe(adopted));
  const report = apply(actions, adopted.io);
  expect(report.failure?.detail ?? 'ok').toBe('ok');

  return {
    ...adopted,
    migrationLines: migration.outcomes.map(outcome => `${describeMigration(outcome.step)} :: ${outcome.detail}`),
    applyLines: report.outcomes.map(outcome => outcome.detail),
  };
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * 1. Nothing moves
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the inferred declaration describes what is already on disk', () => {
  test('the recovered installer files are the ones that shipped, byte for byte', () => {
    // The whole fixture is built from these three, so if they can drift, so can every
    // assertion below. There is no git in a hermetic gate; a hash is the frozen substitute.
    for (const [name, digest] of Object.entries(RECOVERED)) {
      expect({ name, sha256: createHash('sha256').update(recovered(name)).digest('hex') }).toEqual({
        name,
        sha256: digest,
      });
    }
    // And they really are the pre-instance shape: the three modern root keys are ABSENT,
    // which is the whole reason adoption could not read them.
    const sample = recovered('sample.env');
    for (const key of ['SITES_ROOT', 'PREPROD_ROOT', 'PROD_ROOT']) expect(sample).toContain(`${key}=`);
    for (const key of ['AGENT_HOME', 'AUDIT_DIR', 'WEBSPACE_BASE']) expect(sample).not.toContain(`${key}=`);
  });

  test('the identity is the unit’s, verbatim — never the derived `dedalo-site-<instance>`', () => {
    const { layout } = adoptDryRun(makeInstall());
    expect(layout.identity.user).toBe('dedalo-sites');
    expect(layout.identity.group).toBe('dedalo-sites');
    expect(layout.identity.adopted).toBe(true);
  });

  test('a unit with no Group= reads as “named after the user” — the installer’s latent failure', () => {
    // `useradd --system --create-home` with no `--user-group` left group creation to distro
    // policy while the unit hard-required a Group=. plan() creates it, before the user.
    const { layout } = adoptDryRun(makeInstall({ unitWithoutGroup: true }));
    expect(layout.identity.user).toBe('dedalo-sites');
    expect(layout.identity.group).toBe('dedalo-sites');
  });

  test('the daemon’s code and runtime are READ off the installed unit, never inferred', () => {
    const install = makeInstall();
    const { manifest, layout } = adoptDryRun(install);
    expect(manifest.engine.checkout_dir).toBe(install.checkout);
    expect(manifest.engine.bun_bin).toBe(install.bunBin);
    expect(layout.daemon.workingDirectory).toBe(install.from);
  });

  test('the workspaces root is kept VERBATIM; the two roots it never had are derived', () => {
    const install = makeInstall();
    const { manifest, layout } = adoptDryRun(install);
    // SITES_ROOT: every site's source and its git history stays exactly where it is.
    expect(layout.roots.workspaces).toBe(install.workspaces);
    // AGENT_HOME and AUDIT_DIR were never keys of the daemon that shipped, so they are left
    // UNSTATED in the declaration and the layout derives them — writing today's default
    // into a museum's file would freeze it there.
    expect(manifest.roots?.home).toBeUndefined();
    expect(manifest.roots?.audit).toBeUndefined();
    expect(layout.roots.home).toBe(join(layout.stateDir, 'home'));
    expect(layout.roots.audit).toBe(join(layout.stateDir, 'audit'));
    // And the audit root is NOT the one the retired daemon appended to: that one lives
    // inside the workspaces root, where an agent turn could unlink the record of itself.
    expect(layout.roots.audit.startsWith(install.workspaces)).toBe(false);
  });

  test('every site’s webspace is where the new layout puts it, and the bytes are not there yet', () => {
    const install = makeInstall();
    const { layout } = adoptDryRun(install);
    expect(layout.sites.map(site => site.slug).sort()).toEqual(SITES.map(site => site.slug).sort());
    for (const site of layout.sites) {
      const declared = SITES.find(candidate => candidate.slug === site.slug)!;
      expect(site.webspace).toBe(webspaceOf(install, declared));
      // Nothing has moved yet — the surfaces are still under the two shared roots.
      expect(existsSync(site.webspace)).toBe(false);
      for (const surface of SURFACES) {
        expect(existsSync(legacySurface(install, surface, site.slug).link)).toBe(true);
      }
    }
  });

  test('the caps the install had stated survive, and the ones it did not stay unstated', () => {
    const { manifest } = adoptDryRun(makeInstall());
    // sample.env's own numbers, not this gate's.
    expect(manifest.limits?.max_sites).toBe(20);
    expect(manifest.limits?.releases_retained).toBe(5);
    // Every cap sample.env stated is carried; an unstated one stays unstated.
    expect(manifest.limits?.build_timeout_ms).toBe(300000);
  });

  test('the --declare fragment supplies what a pre-instance install never recorded', () => {
    const install = makeInstall();
    const { manifest } = adoptDryRun(install);
    expect(manifest.engine.group).toBe('dedalo-example');
    expect(manifest.web.group).toBe('www-data');
    expect(manifest.serving.prod.tls.mode).toBe('letsencrypt');
  });

  test('without it, adoption REFUSES and says which flag supplies the missing fields', () => {
    const install = { ...makeInstall(), overlay: {} };
    expect(() => adoptDryRun(install)).toThrow(/--declare/);
  });

  test('a site on disk that the declaration would drop is refused, not silently unserved', () => {
    const install = makeInstall();
    const io = makeIo(install);
    const pre = observePreInstance({ from: install.from, legacyUnitPath: install.unitPath }, io);
    const manifest = inferManifest(pre, {
      instance: 'example',
      configDir: join(install.prefix, 'etc/dedalo_sites/instances'),
      overlay: { ...install.overlay, sites: [{ slug: 'collection', domain: 'www.example.org' }] },
    });
    const layout = derive(manifest);
    expect(layout.sites.map(site => site.slug)).toEqual(['collection']);
    // The CLI's `servedSites()` is what refuses; the fact it refuses ON is here.
    expect(pre.sites.map(site => site.slug).sort()).toEqual(['archive', 'collection']);
  });
});

describe('a full adoption moves nothing a museum is serving', () => {
  test('the six surfaces serve the same releases, the same listings and the same bytes', () => {
    const install = makeInstall();
    const before = snapshotServing(legacyLinks(install));
    const done = adoptFully(install);
    expect(snapshotServing(webspaceLinks(done.layout))).toEqual(before);
  });

  test('and the serving check says so, run against the same claims at both addresses', () => {
    const install = makeInstall();
    const dry = adoptDryRun(install);
    const expectations = expectationsFor(dry.layout, dry.served, dry.io);
    expect(verifyServing(expectations, dry.io).ok).toBe(true);

    const done = adoptFully(install);
    const after = verifyServing(relocateExpectations(expectations, done.layout), done.io);
    expect(after.failed.flatMap(describeVerdict)).toEqual([]);
    expect(after.ok).toBe(true);
    // The claims themselves are untouched: same slug, same surface, same release, same
    // source. Only the pair of paths is re-derived, which is what makes the second
    // measurement a measurement and not a tautology.
    const relocated = relocateExpectations(expectations, done.layout);
    expect(relocated.map(entry => [entry.slug, entry.surface, entry.expected, entry.source])).toEqual(
      expectations.map(entry => [entry.slug, entry.surface, entry.expected, entry.source]),
    );
  });

  test('the published bytes are MOVED, never copied, and the old store is gone', () => {
    const install = makeInstall();
    const done = adoptFully(install);
    for (const site of SITES) {
      for (const surface of SURFACES) {
        const { store } = legacySurface(install, surface, site.slug);
        expect({ surface, slug: site.slug, left: existsSync(store) }).toEqual({
          surface,
          slug: site.slug,
          left: false,
        });
      }
    }
  });

  test('the audit trail is moved OUT of the root the service user can unlink from', () => {
    const install = makeInstall();
    const done = adoptFully(install);
    expect(existsSync(join(install.workspaces, '.audit', 'audit.jsonl'))).toBe(false);
    expect(readFileSync(onHost(install, done.layout.auditFile), 'utf8')).toContain('create_site');
  });

  test('the unit, the vhosts, sites.json and the pairing fragment are installed', () => {
    const install = makeInstall();
    const { layout, manifest, io } = adoptFully(install);
    for (const artifact of renderAll(layout, manifest)) {
      expect({ path: artifact.path, present: io.stat(artifact.path) !== null }).toEqual({
        path: artifact.path,
        present: true,
      });
    }
  });

  test('EVERY VHOST ENDS UP ENABLED — the museum is served, not merely converged', () => {
    // B1, proved through the whole stack rather than at the plan level: after a real
    // migration and a real apply, each rendered vhost has a link in the directory the web
    // server actually reads, and that link resolves to the file this run wrote. A host with
    // the files and without the links is a museum whose domain answers the default host.
    const install = makeInstall();
    const { layout, io } = adoptFully(install);
    for (const site of layout.sites) {
      for (const surface of SURFACES) {
        const link = site.vhostEnabledPaths[surface];
        const facts = io.stat(link);
        expect({ site: site.slug, surface, type: facts?.type }).toEqual({
          site: site.slug,
          surface,
          type: 'symlink',
        });
        const target = io.readLink(link) as string;
        expect(resolve(dirname(link), target)).toBe(site.vhostPaths[surface]);
        // …and it names a file that is really there, with this instance's stamp on it.
        expect(io.readFile(site.vhostPaths[surface])).toContain(`dedalo-provision: ${layout.instance}`);
      }
    }
  });

  test('the group the retired installer never created is created BEFORE the user', () => {
    const install = makeInstall();
    const { io, layout } = adoptFully(install);
    const commands = io.execLog.map(argv => argv.join(' '));
    const group = commands.findIndex(line => line.startsWith('groupadd'));
    const user = commands.findIndex(line => line.startsWith('useradd'));
    expect(group).toBeGreaterThan(-1);
    expect(commands[group]).toContain(layout.identity.group);
    if (user > -1) expect(group).toBeLessThan(user);
  });

  test('every root is stamped with this instance’s marker', () => {
    const install = makeInstall();
    const { layout, io } = adoptFully(install);
    for (const root of [layout.roots.workspaces, layout.roots.home, layout.roots.audit, ...layout.sites.map(site => site.webspace)]) {
      expect(io.readFile(join(root, INSTANCE_MARKER))).toContain('example');
    }
  });
});

/**
 * WHAT EACH SURFACE IS SERVING, keyed by site and surface rather than by path.
 *
 * The path is the one thing that legitimately CHANGES — a pre-instance surface lives under
 * a shared root and ends up inside its site's webspace — so keying on it would compare two
 * disjoint maps and pass. What must not change is the answer to "which release, holding
 * which bytes": the release NAME, the directory listing, and the page itself.
 */
function snapshotServing(links: Readonly<Record<string, string>>): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const [key, link] of Object.entries(links)) {
    const target = readlinkSync(link);
    const resolved = join(dirname(link), target);
    snapshot[key] = {
      release: basename(resolved),
      entries: existsSync(resolved) ? readdirSync(resolved).sort() : null,
      body: existsSync(join(resolved, 'index.html')) ? readFileSync(join(resolved, 'index.html'), 'utf8') : null,
    };
  }
  return snapshot;
}

/** The six links as they stand BEFORE the migration: `(root, slug)`, per surface. */
function legacyLinks(install: Install): Record<string, string> {
  const links: Record<string, string> = {};
  for (const site of SITES) {
    for (const surface of SURFACES) links[`${site.slug}/${surface}`] = legacySurface(install, surface, site.slug).link;
  }
  return links;
}

/** The same six, AFTER: inside each site's own webspace. */
function webspaceLinks(layout: InstanceLayout): Record<string, string> {
  const links: Record<string, string> = {};
  for (const site of layout.sites) {
    for (const surface of SURFACES) links[`${site.slug}/${surface}`] = site.linkPath(surface);
  }
  return links;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * 2. The credentials leave the env file
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the credentials leave the plaintext env', () => {
  test('THE MIGRATION ITSELF writes each one 0600 root:root', () => {
    // Asserted on the migration ALONE, before `plan()`/`apply()` run. The provisioner
    // re-asserts a credential's metadata on every converge, so a migration that wrote a
    // secret world-readable would be repaired a second later and the repair would hide the
    // window in which the value was readable by anything on the host.
    const install = makeInstall();
    const adopted = adoptDryRun(install);
    const report = applyMigration(migrationSteps(adopted.pre, adopted.layout, adopted.manifest), adopted.pre, adopted.io);
    expect(report.ok).toBe(true);

    for (const key of MIGRATED_CREDENTIALS) {
      const path =
        key === 'PUBLICATION_API_KEY' ? (adopted.layout.envVars.PUBLICATION_API_KEY_FILE as string) : adopted.layout.secretPath(key);
      expect({ key, access: adopted.io.access.get(path) }).toEqual({
        key,
        access: { owner: 'root', group: 'root', mode: 0o600 },
      });
    }
  });

  test('each lands in its own file at 0600 root:root', () => {
    const install = makeInstall();
    const { io, layout } = adoptFully(install);

    for (const key of MIGRATED_CREDENTIALS) {
      const path = key === 'PUBLICATION_API_KEY' ? (layout.envVars.PUBLICATION_API_KEY_FILE as string) : layout.secretPath(key);
      expect({ key, present: io.stat(path) !== null }).toEqual({ key, present: true });
      expect({ key, access: io.access.get(path) }).toEqual({ key, access: { owner: 'root', group: 'root', mode: 0o600 } });
      expect(io.readFile(path)?.trim()).toBe(VALUES[key] as string);
    }
  });

  test('the shared bearer is PRESERVED, never re-minted — the engine is already paired with it', () => {
    const install = makeInstall();
    const { io, layout } = adoptFully(install);
    expect(io.readFile(layout.secretPath('SERVICE_TOKEN'))?.trim()).toBe(VALUES.SERVICE_TOKEN);
  });

  test('the old file is RENAMED, never deleted, and still holds everything', () => {
    const install = makeInstall();
    adoptFully(install);

    expect(existsSync(join(install.from, PRE_INSTANCE_ENV))).toBe(false);
    const retired = join(install.from, RETIRED_ENV);
    expect(existsSync(retired)).toBe(true);
    const text = readFileSync(retired, 'utf8');
    for (const key of MIGRATED_CREDENTIALS) expect(text).toContain(`${key}="${VALUES[key] as string}"`);
  });

  test('the retired file is taken AWAY from the daemon uid — 0600 service-owned', () => {
    // The retired installer wrote that file `chown $SERVICE_USER:$SERVICE_GROUP`,
    // `chmod 600` (its §4). Renaming it and stopping there leaves the daemon's own uid —
    // and every agent turn that runs as it — owning a file with the bearer and every
    // provider key in it, which undoes the whole point of moving them to LoadCredential.
    const install = makeInstall();
    const io = makeIo(install);
    io.access.set(join(install.from, PRE_INSTANCE_ENV), {
      owner: 'dedalo-sites',
      group: 'dedalo-sites',
      mode: 0o600,
    });

    const adopted = adoptDryRun(install, io);
    const report = applyMigration(migrationSteps(adopted.pre, adopted.layout, adopted.manifest), adopted.pre, io);
    expect(report.failure?.detail ?? 'ok').toBe('ok');

    const retired = join(install.from, RETIRED_ENV);
    expect(io.access.get(retired)).toEqual({ owner: 'root', group: 'root', mode: 0o600 });
    // The bytes are still there — it is kept as the only record of how this daemon was
    // configured — just no longer as the service user's.
    expect(readFileSync(retired, 'utf8')).toContain(VALUES.SERVICE_TOKEN as string);
  });

  test('…and from a WORLD-READABLE one: 0644 is taken away too', () => {
    // The other plausible starting mode, and the worse one: an operator who edited the file
    // and let their umask decide. Nothing about the retirement may depend on which it was.
    const install = makeInstall();
    const io = makeIo(install);
    const envPath = join(install.from, PRE_INSTANCE_ENV);
    chmodSync(envPath, 0o644);
    io.access.set(envPath, { owner: 'dedalo-sites', group: 'dedalo-sites', mode: 0o644 });

    const adopted = adoptDryRun(install, io);
    const report = applyMigration(migrationSteps(adopted.pre, adopted.layout, adopted.manifest), adopted.pre, io);
    expect(report.failure?.detail ?? 'ok').toBe('ok');

    const retired = join(install.from, RETIRED_ENV);
    expect(io.access.get(retired)).toEqual({ owner: 'root', group: 'root', mode: 0o600 });
    expect(lstatSync(retired).mode & 0o7777).toBe(0o600);
  });

  test('a retirement that could not revoke is a FAILED step, not a quiet success', () => {
    // The bytes moved and the credentials did not become root's. Reporting that as done is
    // reporting a migration as secure when the uid it was taken away from can still read it.
    const install = makeInstall();
    const io = makeIo(install);
    const adopted = adoptDryRun(install, io);
    const refusing: AdoptIo = {
      ...io,
      chown(path: string, owner: string, group: string): void {
        if (path.endsWith(RETIRED_ENV)) throw new Error('Operation not permitted');
        io.chown(path, owner, group);
      },
    };
    const report = applyMigration(
      migrationSteps(adopted.pre, adopted.layout, adopted.manifest),
      adopted.pre,
      refusing,
    );
    expect(report.ok).toBe(false);
    expect(report.failure?.detail).toContain('could NOT be taken away from the service user');
    // …and it names the one command that repairs it, without printing a byte of the file.
    expect(report.failure?.detail).toContain('chown root:root');
    for (const value of Object.values(VALUES)) expect(report.failure?.detail).not.toContain(value);
  });

  test('the rendered environment carries not one of them', () => {
    const install = makeInstall();
    const { io, layout } = adoptFully(install);
    const env = io.readFile(layout.envFile) ?? '';
    for (const value of Object.values(VALUES)) expect(env).not.toContain(value);
    // What it carries instead is the PATH of the one key that is named as a path.
    expect(env).toContain('PUBLICATION_API_KEY_FILE');
  });

  test('no value reaches any report, description or error', () => {
    const install = makeInstall();
    const done = adoptFully(install);
    const printed = [
      ...done.migrationLines,
      ...done.applyLines,
      ...migrationSteps(done.pre, done.layout, done.manifest).map(describeMigration),
      JSON.stringify(done.manifest),
    ].join('\n');
    for (const value of Object.values(VALUES)) expect(printed).not.toContain(value);
    // …while the KEYS are named, because an operator has to know where each one went.
    for (const key of MIGRATED_CREDENTIALS) expect(printed).toContain(key);
  });

  test('a credential with nowhere to go is REFUSED, never silently left behind', () => {
    // The value survives — nothing here deletes anything — but a museum whose provider key
    // was quietly dropped at retirement has a daemon that boots and cannot reach its provider,
    // and nothing on disk says why.
    const adopted = adoptDryRun(makeInstall());
    // A layout derived from a declaration that names no credential files at all. `adopt`'s
    // own inference never produces one — it asks the layout where each credential goes — but
    // `migrationSteps` is an exported door and this is what a caller reaching it with a
    // hand-built declaration would hand it. A guard whose only value is for a future caller
    // has to be reachable BY one, so it is asked here directly.
    const stripped = { ...adopted.manifest, secrets: {}, publication_api: { url: adopted.manifest.publication_api.url } };
    expect(() => migrationSteps(adopted.pre, derive(stripped as InstanceManifest), adopted.manifest)).toThrow(
      /names no file for it/,
    );
  });

  test('an EMPTY assignment is not a credential and is not migrated', () => {
    const install = makeInstall();
    const path = join(install.from, PRE_INSTANCE_ENV);
    writeFileSync(path, readFileSync(path, 'utf8').replace(/^PI_ENV=.*$/m, 'PI_ENV=""'), 'utf8');
    const { pre, manifest } = adoptDryRun(install);
    expect(Object.keys(pre.credentials).sort()).not.toContain('PI_ENV');
    expect(Object.keys(manifest.secrets ?? {})).not.toContain('PI_ENV');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 3. Idempotence — a second adopt is a row of skips
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a second adoption of the same instance', () => {
  test('reads the retired env, infers the SAME declaration, and writes nothing', () => {
    const install = makeInstall();
    const first = adoptFully(install);

    const second = adoptDryRun(install, first.io);
    expect(second.pre.envAlreadyRetired).toBe(true);
    expect(second.manifest).toEqual(first.manifest);

    const steps = migrationSteps(second.pre, second.layout, second.manifest);
    const report = applyMigration(steps, second.pre, second.io);
    expect(report.ok).toBe(true);
    // NOT ONE BYTE. The two `systemctl` steps are re-issued on purpose (re-asserting that a
    // superseded daemon is not running is the safe direction), so the property is stated on
    // the steps that WRITE: none of them may be carried out a second time.
    expect(
      report.outcomes.filter(outcome => outcome.status === 'done' && movesBytes(outcome.step)).map(outcome => outcome.step.kind),
    ).toEqual([]);
    expect(report.changed).toBe(false);
  });

  test('and the provisioning it hands over to writes nothing either', () => {
    const install = makeInstall();
    const first = adoptFully(install);
    const actions = plan(first.layout, first.manifest, observe(first));
    expect(actions.filter(action => !(action.kind === 'file' && action.disposition === 'awaiting'))).toEqual([]);
  });

  test('a declaration on disk that DIFFERS from the inference is refused, not overwritten', () => {
    const install = makeInstall();
    const first = adoptFully(install);
    const hand = `${JSON.stringify({ ...first.manifest, description: 'edited by an operator' }, null, 2)}\n`;
    first.io.writeFile(first.layout.manifestPath, hand, 0o640);

    const second = adoptDryRun(install, first.io);
    const report = applyMigration(migrationSteps(second.pre, second.layout, second.manifest), second.pre, second.io);
    expect(report.ok).toBe(false);
    expect(report.failure?.detail).toContain('NOT what adoption infers');
    // And the operator's file is exactly as they left it.
    expect(first.io.readFile(first.layout.manifestPath)).toBe(hand);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 4. The serving check FAILS on each of the three things that can go wrong
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the post-migration serving check', () => {
  /** Adopt for real, then break exactly one thing, then re-run the same expectations. */
  function afterBreaking(mutate: (install: Install, adopted: Adopted) => void): ReturnType<typeof verifyServing> {
    const install = makeInstall();
    const adopted = adoptDryRun(install);
    const expectations = expectationsFor(adopted.layout, adopted.served, adopted.io);
    expect(verifyServing(expectations, adopted.io).ok).toBe(true);
    mutate(install, adopted);
    return verifyServing(expectations, adopted.io);
  }

  test('FAILS when a served symlink dangles', () => {
    const report = afterBreaking(install => {
      const { link } = legacySurface(install, 'prod', SITES[0]!.slug);
      rmSync(join(dirname(link), readlinkSync(link)), { recursive: true, force: true });
    });
    expect(report.ok).toBe(false);
    expect(report.failed.flatMap(describeVerdict).join('\n')).toContain('dangles');
  });

  test('FAILS when the target exists but is EMPTY', () => {
    const report = afterBreaking(install => {
      const { link } = legacySurface(install, 'prod', SITES[0]!.slug);
      unlinkSync(join(dirname(link), readlinkSync(link), 'index.html'));
    });
    expect(report.ok).toBe(false);
    expect(report.failed.flatMap(describeVerdict).join('\n')).toContain('EMPTY');
  });

  test('FAILS when the served release disagrees with what site.json says is published', () => {
    const report = afterBreaking(install => {
      const { link, store } = legacySurface(install, 'prod', SITES[0]!.slug);
      write(join(store, 'someone-elses-release', 'index.html'), 'x\n');
      unlinkSync(link);
      symlinkSync(relative(dirname(link), join(store, 'someone-elses-release')), link);
    });
    expect(report.ok).toBe(false);
    const text = report.failed.flatMap(describeVerdict).join('\n');
    expect(text).toContain("serves release 'someone-elses-release'");
    expect(text).toContain(RELEASES.prod);
  });

  test("an install whose prod link ALREADY disagrees with site.json is caught BEFORE anything is written", () => {
    // The expectation for production comes from `site.json`'s `published.release` and never
    // from the link being checked. Reading it off the link would make the production half of
    // this verifier unfalsifiable — it would agree with itself by construction — and the one
    // install it must refuse is exactly this one: after the migration nobody could tell a
    // pre-existing disagreement from one the migration caused, so "done" becomes unsayable.
    const install = makeInstall();
    const { link, store } = legacySurface(install, 'prod', SITES[0]!.slug);
    write(join(store, 'a-release-nobody-published', 'index.html'), 'x\n');
    unlinkSync(link);
    symlinkSync(relative(dirname(link), join(store, 'a-release-nobody-published')), link);

    const adopted = adoptDryRun(install);
    const report = verifyServing(expectationsFor(adopted.layout, adopted.served, adopted.io), adopted.io);
    expect(report.ok).toBe(false);
    const text = report.failed.flatMap(describeVerdict).join('\n');
    expect(text).toContain("serves release 'a-release-nobody-published'");
    expect(text).toContain(RELEASES.prod);
    expect(text).toContain("site.json's published.release");
  });

  test('a site that was never published expects a PLACEHOLDER, and that is checkable too', () => {
    const install = makeInstall({ published: false });
    const adopted = adoptDryRun(install);
    const expectations = expectationsFor(adopted.layout, adopted.served, adopted.io);
    expect(verifyServing(expectations, adopted.io).ok).toBe(true);

    // Point it at a release it never published: the check catches the OTHER direction too.
    const { link, store } = legacySurface(install, 'prod', SITES[0]!.slug);
    write(join(store, 'sneaked-in', 'index.html'), 'x\n');
    unlinkSync(link);
    symlinkSync(relative(dirname(link), join(store, 'sneaked-in')), link);
    const report = verifyServing(expectations, adopted.io);
    expect(report.ok).toBe(false);
    expect(report.failed.flatMap(describeVerdict).join('\n')).toContain('never been published');
  });

  test('A SITE THAT WAS NEVER PUBLISHED OR PREVIEWED IS NORMAL, not a refusal', () => {
    // The daemon that shipped created a surface's link on its FIRST promote, so a museum
    // with a drafted-but-unbuilt site simply has no link for it. Reading that as "this
    // surface is broken" refused adoption for a HEALTHY install, before writing anything,
    // over a site nobody had finished — and there was no flag and no repair, because there
    // was nothing wrong.
    const install = makeInstall();
    for (const surface of SURFACES) {
      const { link, store } = legacySurface(install, surface, SITES[0]!.slug);
      unlinkSync(link);
      rmSync(store, { recursive: true, force: true });
    }
    // …and the site's own manifest agrees: it claims no published release.
    const manifestPath = join(install.workspaces, SITES[0]!.slug, 'site.json');
    const document = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    document.published = null;
    writeFileSync(manifestPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

    const adopted = adoptDryRun(install);
    const expectations = expectationsFor(adopted.layout, adopted.served, adopted.io);
    const report = verifyServing(expectations, adopted.io);
    expect(report.failed.flatMap(describeVerdict)).toEqual([]);
    expect(report.ok).toBe(true);

    // The OTHER site is untouched and still held to what it serves — the tolerance is per
    // surface, not a switch that turns the check off.
    expect(
      expectations
        .filter(entry => entry.mustBeServed)
        .map(entry => `${entry.slug}/${entry.surface}`)
        .sort(),
    ).toEqual(SURFACES.map(surface => `${SITES[1]!.slug}/${surface}`).sort());
  });

  test('…but a site whose manifest CLAIMS a release and has no link is still a refusal', () => {
    // The tolerance may not extend one inch further: a site that says it published
    // something and has nothing serving it is the exact disagreement this check exists for.
    const install = makeInstall();
    const { link } = legacySurface(install, 'prod', SITES[0]!.slug);
    unlinkSync(link);

    const adopted = adoptDryRun(install);
    const report = verifyServing(expectationsFor(adopted.layout, adopted.served, adopted.io), adopted.io);
    expect(report.ok).toBe(false);
    expect(report.failed.flatMap(describeVerdict).join('\n')).toContain('does not exist');
  });

  test('after the migration, every declared surface must have a link — placeholder or not', () => {
    // The tolerance is for what was found BEFORE. Afterwards the provisioner has created a
    // placeholder for every declared site, so the second measurement holds the host to it.
    const install = makeInstall();
    for (const surface of SURFACES) {
      const { link, store } = legacySurface(install, surface, SITES[0]!.slug);
      unlinkSync(link);
      rmSync(store, { recursive: true, force: true });
    }
    const manifestPath = join(install.workspaces, SITES[0]!.slug, 'site.json');
    const document = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    document.published = null;
    writeFileSync(manifestPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

    const adopted = adoptDryRun(install);
    const expectations = expectationsFor(adopted.layout, adopted.served, adopted.io);
    for (const entry of relocateExpectations(expectations, adopted.layout)) {
      expect({ slug: entry.slug, surface: entry.surface, mustBeServed: entry.mustBeServed }).toEqual({
        slug: entry.slug,
        surface: entry.surface,
        mustBeServed: true,
      });
    }
  });

  test('an expectation for a webspace this instance does not own is refused outright', () => {
    const install = makeInstall();
    const adopted = adoptDryRun(install);
    expect(() =>
      expectationsFor(adopted.layout, [{ slug: 'collection', webspace: '/srv/somebody-else', publishedRelease: null }], adopted.io),
    ).toThrow(/not\s+one of instance/);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 5. Refusals
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('adoption refuses rather than guessing', () => {
  test('an install directory with no environment file at all', () => {
    const install = makeInstall();
    unlinkSync(join(install.from, PRE_INSTANCE_ENV));
    expect(() => adoptDryRun(install)).toThrow(/holds neither/);
  });

  test('a unit that states no User=', () => {
    const install = makeInstall();
    write(install.unitPath, ['[Service]', 'ExecStart=/usr/bin/bun run start', ''].join('\n'));
    expect(() => adoptDryRun(install)).toThrow(/states no 'User='/);
  });

  test('an environment file the shared parser cannot read', () => {
    const install = makeInstall();
    const path = join(install.from, PRE_INSTANCE_ENV);
    writeFileSync(path, `${readFileSync(path, 'utf8')}this is not an assignment\n`, 'utf8');
    expect(() => adoptDryRun(install)).toThrow(/cannot read \(line/);
  });

  test('a site manifest with no domain', () => {
    const install = makeInstall();
    write(join(install.workspaces, 'collection', 'site.json'), '{"slug":"collection"}\n');
    expect(() => adoptDryRun(install)).toThrow(/has no domain/);
  });

  test('and the default unit path is the one the retired installer used', () => {
    expect(LEGACY_UNIT_PATH.endsWith('/dedalo-site-builder.service')).toBe(true);
  });
});
