/**
 * DECOMMISSIONING — the destructive verb, held to the properties that make it safe.
 *
 * There is only one thing this file is really about: after `provision remove` has run, every
 * byte a museum ever produced is still on the disk. Not "recoverable from a backup", not
 * "recreatable" — still there, under a name an operator can `mv` back. Everything else here
 * exists to make that provable rather than promised.
 *
 * FIVE PROPERTIES, and each is a different way the verb could betray it:
 *
 *   1. IT REFUSES WHILE A SITE IS PUBLISHED, and "published" means the served link points at
 *      a RELEASE — not that a link exists, which is true of every provisioned site from the
 *      moment its placeholder is created. That distinction is the difference between a
 *      refusal that protects live sites and a refusal that fires on every instance forever
 *      and is therefore worked around with a flag on the first day.
 *   2. `--purge-published` GETS PAST THE REFUSAL AND STILL ARCHIVES. The flag says "I mean
 *      it about the website", never "delete the museum's work".
 *   3. IT REMOVES ONLY WHAT IT CAN PROVE IT WROTE. A file at a generated path whose stamp is
 *      missing or names another instance is left where it is and reported by name.
 *   4. IT NEVER FREES A UID. No `userdel` may appear in a plan, and the plan itself refuses
 *      one — because every archived byte is owned by a number, and returning that number to
 *      the pool hands this museum's files to the next account created on this host.
 *   5. A RELOAD NEVER STANDS WITHOUT A CONFIGTEST BEFORE IT. One bad web-server
 *      configuration takes down every OTHER museum on the host too.
 *
 * The host is synthetic and lives under a temporary prefix; the io is real inside it, with
 * ownership recorded and commands stubbed. Nothing here runs as root and nothing here
 * touches a path outside its own prefix.
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
import { basename, dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';

import { parseManifest } from '../src/provision/schema';
import { derive, type InstanceLayout, type InstanceManifest } from '../src/provision/layout';
import { renderAll, type Artifact } from '../src/provision/render';
import { stamp } from '../src/provision/hash';
import type { PathFacts, ExecResult } from '../src/provision/apply';
import type { EntryType } from '../src/provision/plan';
import type { AdoptIo } from '../src/provision/adopt';
import {
  applyRemoval,
  assertRemovalIsCoherent,
  describeRemoval,
  observeForRemoval,
  publishedSites,
  removalPlan,
  retiredName,
  type RemovalIo,
  type RemovalStep,
} from '../src/provision/remove';

const AT = new Date('2026-08-30T11:45:00.000Z');
const EXAMPLE_PATH = join(import.meta.dir, '..', 'deploy', 'examples', 'instance.example.json');

const prefixes: string[] = [];
afterAll(() => {
  for (const prefix of prefixes) rmSync(prefix, { recursive: true, force: true });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * A provisioned host, under a temporary prefix
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** Every absolute path in the declaration, moved under the prefix. Nothing else changes. */
function relocate(value: unknown, prefix: string): unknown {
  if (typeof value === 'string') return value.startsWith('/') ? join(prefix, value) : value;
  if (Array.isArray(value)) return value.map(entry => relocate(entry, prefix));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, relocate(entry, prefix)]),
    );
  }
  return value;
}

interface Host {
  readonly prefix: string;
  readonly manifest: InstanceManifest;
  readonly layout: InstanceLayout;
  readonly artifacts: readonly Artifact[];
  readonly io: RecordingIo;
}

function write(path: string, body: string, mode = 0o644): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, 'utf8');
  chmodSync(path, mode);
}

/**
 * A host as `provision apply` leaves it: every artifact written with its real stamp, both
 * webspaces built, and each site's two surfaces served — production from a real release when
 * `published`, from the empty placeholder when not.
 */
function makeHost(options: { published?: boolean } = {}): Host {
  const prefix = mkdtempSync(join(tmpdir(), 'dedalo-remove-'));
  prefixes.push(prefix);

  const raw = relocate(JSON.parse(readFileSync(EXAMPLE_PATH, 'utf8')), prefix) as Record<string, unknown>;
  raw.paths = {
    config_base: join(prefix, 'etc/dedalo_sites/instances'),
    state_base: join(prefix, 'var/lib/dedalo_sites'),
    unit_dir: join(prefix, 'etc/systemd/system'),
    vhost_dir: join(prefix, 'etc/nginx/sites-available'),
    vhost_enabled_dir: join(prefix, 'etc/nginx/sites-enabled'),
  };

  const manifest = parseManifest(raw);
  const layout = derive(manifest);
  const artifacts = renderAll(layout, manifest);

  for (const artifact of artifacts) write(artifact.path, artifact.body);
  // …and ENABLED, exactly as `provision apply` leaves them: a vhost in sites-available and
  // nothing in sites-enabled is a museum nginx never reads.
  mkdirSync(join(prefix, 'etc/nginx/sites-enabled'), { recursive: true });
  for (const site of layout.sites) {
    // Same law as the state roots: a provisioned webspace declares whose it is.
    mkdirSync(site.webspace, { recursive: true });
    write(join(site.webspace, '.dedalo_site_instance'), `${layout.instance}\n`);
    for (const surface of ['preprod', 'prod'] as const) {
      const link = site.vhostEnabledPaths[surface];
      symlinkSync(relative(dirname(link), site.vhostPaths[surface]), link);
    }
  }
  write(layout.htpasswd, 'preview:$2y$fake$8\n', 0o640);
  for (const root of [layout.roots.workspaces, layout.roots.home, layout.roots.audit]) {
    mkdirSync(root, { recursive: true });
    // A PROVISIONED root DECLARES itself. `plan()` stamps this marker the moment it creates
    // each root, and `remove` now refuses to archive a tree that does not carry it — a
    // declaration colliding with a live museum derives that museum's paths, so the derived
    // set alone cannot tell the offender's webspace from the victim's.
    write(join(root, '.dedalo_site_instance'), `${layout.instance}\n`);
  }
  write(layout.auditFile, '{"action":"publish"}\n');
  write(join(layout.roots.workspaces, 'collection', 'site.json'), '{}\n');

  for (const site of layout.sites) {
    // Same law as the state roots: a provisioned webspace declares whose it is.
    mkdirSync(site.webspace, { recursive: true });
    write(join(site.webspace, '.dedalo_site_instance'), `${layout.instance}\n`);
    for (const surface of ['preprod', 'prod'] as const) {
      const store = site.releasesDir(surface);
      mkdirSync(store, { recursive: true });
      const live = surface === 'prod' && options.published === false;
      if (live) {
        symlinkSync(relative(site.webspace, store), site.linkPath(surface));
        continue;
      }
      const release = `2026082${surface === 'prod' ? '8' : '9'}-r1`;
      write(join(store, release, 'index.html'), `<h1>${site.slug}</h1>\n`);
      symlinkSync(relative(site.webspace, join(store, release)), site.linkPath(surface));
    }
  }

  return { prefix, manifest, layout, artifacts, io: makeIo(prefix) };
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The io
 * ──────────────────────────────────────────────────────────────────────────────────── */

interface RecordingIo extends RemovalIo {
  readonly execLog: string[][];
  readonly unlinked: string[];
}

function entryType(path: string): EntryType {
  const entry = lstatSync(path);
  return entry.isSymbolicLink() ? 'symlink' : entry.isDirectory() ? 'dir' : entry.isFile() ? 'file' : 'other';
}

function makeIo(prefix: string, failing?: (argv: readonly string[]) => ExecResult | null): RecordingIo {
  const execLog: string[][] = [];
  const unlinked: string[] = [];
  const on = (path: string): string => (path.startsWith(prefix) ? path : join(prefix, path));

  const base: AdoptIo = {
    stat(path: string): PathFacts | null {
      const real = on(path);
      try {
        lstatSync(real);
      } catch {
        return null;
      }
      return { type: entryType(real), mode: lstatSync(real).mode & 0o7777, owner: 'root', group: 'root' };
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
      write(on(path), body, mode);
    },
    symlink(path: string, target: string): void {
      symlinkSync(target, on(path));
    },
    rename(from: string, to: string): void {
      renameSync(on(from), on(to));
    },
    chown(): void {},
    chmod(path: string, mode: number): void {
      chmodSync(on(path), mode);
    },
    exec(argv: readonly string[]): ExecResult {
      execLog.push([...argv]);
      return failing?.(argv) ?? { code: 0, stdout: '', stderr: '' };
    },
    mintToken(): string {
      return 'unused';
    },
    hashPassword(): string {
      return 'unused';
    },
  };

  return {
    ...base,
    execLog,
    unlinked,
    unlink(path: string): void {
      unlinked.push(path);
      unlinkSync(on(path));
    },
  };
}

function planFor(host: Host, at: Date = AT): RemovalStep[] {
  return removalPlan(host.layout, host.artifacts, observeForRemoval(host.layout, host.artifacts, host.io), at);
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * 1. What "published" means
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a published site is a link pointing at a RELEASE', () => {
  test('a provisioned but never-published site is NOT published', () => {
    const host = makeHost({ published: false });
    // Both placeholders exist — that is what the provisioner creates — and neither counts.
    for (const site of host.layout.sites) expect(existsSync(site.linkPath('prod'))).toBe(true);
    expect(publishedSites(host.layout, host.io)).toEqual([]);
  });

  test('a site serving a release is, and it is named with the release', () => {
    const host = makeHost();
    const published = publishedSites(host.layout, host.io);
    expect(published.map(site => site.slug).sort()).toEqual(host.layout.sites.map(site => site.slug).sort());
    for (const site of published) expect(site.release).toBe('20260828-r1');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 2. Archive, never delete
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the removal archives a museum’s bytes and deletes only what it wrote', () => {
  test('every webspace, both state roots and the audit file are ARCHIVED beside themselves', () => {
    const host = makeHost();
    const steps = planFor(host);
    const archived = steps.filter(step => step.kind === 'archive');
    const sources = archived.map(step => (step.kind === 'archive' ? step.from : ''));

    for (const site of host.layout.sites) expect(sources).toContain(site.webspace);
    expect(sources).toContain(host.layout.roots.workspaces);
    expect(sources).toContain(host.layout.roots.home);
    expect(sources).toContain(host.layout.auditFile);

    // ONE instant across the whole run, so an operator restoring a tenancy matches the
    // trees by name rather than by eye.
    for (const step of archived) {
      if (step.kind !== 'archive') continue;
      expect(step.to).toBe(retiredName(step.from, AT));
      expect(step.to).toContain('.retired-20260830T114500Z');
      expect(dirname(step.to)).toBe(dirname(step.from));
    }
  });

  test('after a real run the bytes are still on the disk, under the archived name', () => {
    const host = makeHost();
    const before = readFileSync(join(host.layout.sites[0]!.releasesDir('prod'), '20260828-r1', 'index.html'), 'utf8');

    const report = applyRemoval(planFor(host), host.io);
    expect(report.failure?.detail ?? 'ok').toBe('ok');
    expect(report.ok).toBe(true);

    for (const moved of report.archived) {
      expect(existsSync(moved.from)).toBe(false);
      expect(existsSync(moved.to)).toBe(true);
    }
    const webspace = host.layout.sites[0]!;
    const archivedWebspace = retiredName(webspace.webspace, AT);
    const releasePath = join(archivedWebspace, relative(webspace.webspace, webspace.releasesDir('prod')), '20260828-r1', 'index.html');
    expect(readFileSync(releasePath, 'utf8')).toBe(before);
  });

  test('the generated artifacts are removed — and nothing else is', () => {
    const host = makeHost();
    applyRemoval(planFor(host), host.io);
    for (const artifact of host.artifacts) expect(existsSync(artifact.path)).toBe(false);
    expect(host.io.unlinked).toContain(host.layout.htpasswd);
    // The declaration is NOT removed: this command does not delete the file it was asked about.
    expect(existsSync(host.layout.manifestPath) || host.io.unlinked.includes(host.layout.manifestPath)).toBe(false);
    expect(host.io.unlinked).not.toContain(host.layout.manifestPath);
  });

  test('a file at a generated path that we cannot prove is ours is LEFT ALONE, by name', () => {
    const host = makeHost();
    const hand = host.layout.sites[0]!.vhostPaths.prod;
    write(hand, "# an operator's own vhost, written before any of this existed\n");

    const steps = planFor(host);
    const left = steps.find(step => step.kind === 'left' && step.path === hand);
    expect(left).toBeDefined();
    expect(describeRemoval(left!)).toContain('no readable provisioner stamp');

    applyRemoval(steps, host.io);
    expect(existsSync(hand)).toBe(true);
  });

  test('a file stamped for ANOTHER instance is left alone and says whose it is', () => {
    const host = makeHost();
    const foreign = host.layout.unitPath;
    write(foreign, stamp('unit', 'other-museum', '[Service]\n'));

    const steps = planFor(host);
    const left = steps.find(step => step.kind === 'left' && step.path === foreign);
    expect(describeRemoval(left!)).toContain("stamped for instance 'other-museum'");

    applyRemoval(steps, host.io);
    expect(existsSync(foreign)).toBe(true);
  });

  test('an archive that would bury an earlier archive FAILS rather than overwriting it', () => {
    const host = makeHost();
    mkdirSync(retiredName(host.layout.roots.home, AT), { recursive: true });
    const report = applyRemoval(planFor(host), host.io);
    expect(report.ok).toBe(false);
    expect(report.failure?.detail).toContain('would bury an earlier archive');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 2b. A DECOMMISSIONED MUSEUM STOPS BEING SERVED
 *
 * `apply` links every vhost into the directory the web server reads; `remove` has to undo
 * exactly that. Removing the vhost FILE alone leaves a link in `sites-enabled/` pointing at
 * nothing, which is two failures at once: this museum is still enabled after its tenancy
 * ended, and the next reload of this host — every other museum's included — fails on a
 * dangling include.
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a removed instance is DISABLED, not merely unlinked', () => {
  test('every enabling link is removed, before the configtest, and nothing dangles after', () => {
    const host = makeHost();
    const enabled = host.layout.sites.flatMap(site =>
      (['preprod', 'prod'] as const).map(surface => site.vhostEnabledPaths[surface]),
    );
    expect(enabled.length).toBe(2 * host.layout.sites.length);
    for (const link of enabled) expect(lstatSync(link).isSymbolicLink()).toBe(true);

    const steps = planFor(host);
    const unlinks = steps.flatMap(step => (step.kind === 'unlink' ? [step.path] : []));
    for (const link of enabled) expect(unlinks).toContain(link);

    // BEFORE the configtest: a dangling include is exactly what the test would fail on.
    const configtest = steps.findIndex(step => step.kind === 'exec' && step.argv[0] === 'nginx');
    expect(configtest).toBeGreaterThan(-1);
    for (const link of enabled) {
      expect(steps.findIndex(step => step.kind === 'unlink' && step.path === link)).toBeLessThan(configtest);
    }

    const report = applyRemoval(steps, host.io);
    expect(report.ok).toBe(true);
    for (const link of enabled) expect(existsSync(link) || lstatSync(link, { throwIfNoEntry: false }) !== undefined).toBe(false);
  });

  test('a link in the enabled directory that points somewhere else is LEFT, by name', () => {
    const host = makeHost();
    const link = host.layout.sites[0]!.vhostEnabledPaths.prod;
    unlinkSync(link);
    symlinkSync('../sites-available/somebody-elses.conf', link);

    const steps = planFor(host);
    const left = steps.find(step => step.kind === 'left' && step.path === link);
    expect(left).toBeDefined();
    expect(describeRemoval(left!)).toContain('somebody-elses.conf');

    applyRemoval(steps, host.io);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
  });

  test('a hand-COPIED vhost in the enabled directory is left alone', () => {
    const host = makeHost();
    const link = host.layout.sites[0]!.vhostEnabledPaths.preprod;
    unlinkSync(link);
    write(link, '# an operator copied this here years ago\n');

    const steps = planFor(host);
    const left = steps.find(step => step.kind === 'left' && step.path === link);
    expect(describeRemoval(left!)).toContain('is not a symlink');
    applyRemoval(steps, host.io);
    expect(existsSync(link)).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 3. The uid is never freed, and the order holds
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the identity survives the tenancy', () => {
  test('the plan locks the account and never deletes it', () => {
    const host = makeHost();
    const commands = planFor(host).flatMap(step => (step.kind === 'exec' ? [step.argv.join(' ')] : []));
    expect(commands).toContain(`usermod --lock ${host.layout.identity.user}`);
    expect(commands.some(line => line.startsWith('userdel') || line.startsWith('groupdel'))).toBe(false);
  });

  test('EVERY LIVE CREDENTIAL IS NAMED — kept, and never left silently', () => {
    // The declaration is left behind on purpose (the operator decides) and `secrets/` is
    // inside the directory that holds it, so a decommissioned host keeps this museum's
    // bearer and every provider key. That is the right default and a terrible silence: five
    // live credentials on a host nobody is looking after any more, with nothing anywhere
    // saying they are there.
    const host = makeHost();
    const secret = host.layout.secretPath('SERVICE_TOKEN');
    write(secret, 'not-a-real-token\n', 0o600);

    const steps = planFor(host);
    const left = steps.find(step => step.kind === 'left' && step.path === secret);
    expect(left).toBeDefined();
    expect(describeRemoval(left!)).toContain('SERVICE_TOKEN');
    expect(describeRemoval(left!)).toContain('revoke it at the provider');

    // NAMED, not removed: it is still there afterwards, holding what it held.
    applyRemoval(steps, host.io);
    expect(readFileSync(secret, 'utf8')).toBe('not-a-real-token\n');
    expect(host.io.unlinked).not.toContain(secret);
  });

  test('a plan carrying a userdel or a groupdel is REFUSED by the coherence check', () => {
    const host = makeHost();
    for (const command of [
      ['userdel', host.layout.identity.user],
      ['groupdel', host.layout.identity.group],
    ]) {
      expect(() =>
        assertRemovalIsCoherent(
          [{ kind: 'exec', what: 'delete the identity', argv: command, onFailure: 'tolerate' }],
          host.layout,
        ),
      ).toThrow(/may never delete a user or a group/);
    }
  });

  test('a web-server reload with no configtest before it is REFUSED', () => {
    const host = makeHost();
    expect(() =>
      assertRemovalIsCoherent(
        [{ kind: 'exec', what: 'reload', argv: ['systemctl', 'reload', 'nginx'], onFailure: 'stop' }],
        host.layout,
      ),
    ).toThrow(/no configuration\s+test/);
  });

  test('the real plan puts the configtest immediately before the reload', () => {
    const host = makeHost();
    const commands = planFor(host).flatMap(step => (step.kind === 'exec' ? [step.argv.join(' ')] : []));
    const reload = commands.indexOf('systemctl reload nginx');
    expect(reload).toBeGreaterThan(0);
    expect(commands[reload - 1]).toBe('nginx -t');
  });

  test('an archive onto itself is REFUSED — it would report a move that never happened', () => {
    const host = makeHost();
    expect(() =>
      assertRemovalIsCoherent(
        [{ kind: 'archive', from: host.layout.roots.home, to: host.layout.roots.home, what: 'the home' }],
        host.layout,
      ),
    ).toThrow(/onto\s+itself/);
  });

  test('an archive into another directory is REFUSED — an archive is a rename beside', () => {
    const host = makeHost();
    expect(() =>
      assertRemovalIsCoherent(
        [{ kind: 'archive', from: host.layout.roots.home, to: join(host.prefix, 'elsewhere/home'), what: 'the home' }],
        host.layout,
      ),
    ).toThrow(/different directory/);
  });

  test('the daemon is stopped before it is disabled, and both before any byte moves', () => {
    const host = makeHost();
    const steps = planFor(host);
    const kinds = steps.map(step => step.kind);
    const commands = steps.map(step => (step.kind === 'exec' ? step.argv.join(' ') : ''));

    const stop = commands.indexOf(`systemctl stop ${host.layout.unitName}`);
    const disable = commands.indexOf(`systemctl disable ${host.layout.unitName}`);
    expect(stop).toBeGreaterThan(-1);
    expect(disable).toBeGreaterThan(stop);
    expect(kinds.indexOf('archive')).toBeGreaterThan(disable);
    // …and the artifacts go after the daemon has stopped, never underneath a live service.
    expect(kinds.indexOf('unlink')).toBeGreaterThan(disable);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 4. Failing part way
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a removal that fails', () => {
  test('A FAILED CONFIGTEST STOPS THE RUN — it is not "skipped", and the run is not ok', () => {
    // Every failing command used to be downgraded to `skipped`, which is right for the
    // systemd verbs (a unit already stopped answers non-zero on a resumed decommission) and
    // catastrophic for this one: the reload after it was issued anyway, taking down every
    // OTHER museum on the host, and the run reported "decommissioned" and exited 0.
    const host = makeHost();
    const io = makeIo(host.prefix, argv =>
      argv.join(' ') === 'nginx -t' ? { code: 1, stdout: '', stderr: 'bad config\nline 2' } : null,
    );
    const steps = removalPlan(host.layout, host.artifacts, observeForRemoval(host.layout, host.artifacts, io), AT);
    const report = applyRemoval(steps, io);

    const configtest = report.outcomes.find(
      outcome => outcome.step.kind === 'exec' && outcome.step.argv.join(' ') === 'nginx -t',
    );
    expect(configtest?.status).toBe('failed');
    expect(configtest?.detail).toContain('exited 1');
    expect(configtest?.detail).toContain('bad config');
    expect(report.ok).toBe(false);

    // AND THE RELOAD NEVER RAN. That is the property, not the status word.
    expect(io.execLog.map(argv => argv.join(' '))).not.toContain('systemctl reload nginx');
    // Nor did anything after it: no tree archived, no account locked.
    expect(report.archived).toEqual([]);
    expect(io.execLog.map(argv => argv[0])).not.toContain('usermod');
  });

  test('a systemd verb that answers non-zero is still SKIPPED — the tolerance is per step', () => {
    // The other half of the same distinction: `systemctl stop` on a unit that is already
    // stopped, or was never installed, is the normal answer on a resumed decommission.
    const host = makeHost();
    // The unit verbs only: a failing `systemctl reload nginx` is a different question (the
    // vhosts are gone and the web server did not re-read them), and it is fatal.
    const io = makeIo(host.prefix, argv =>
      argv[0] === 'systemctl' && argv[2] !== 'nginx' ? { code: 5, stdout: '', stderr: '' } : null,
    );
    const report = applyRemoval(planFor(host), io);
    const stop = report.outcomes.find(
      outcome => outcome.step.kind === 'exec' && outcome.step.argv[1] === 'stop',
    );
    expect(stop?.status).toBe('skipped');
    expect(stop?.detail).toContain('exited 5');
    // Reported verbatim, and the run carried on to archive the bytes.
    expect(report.ok).toBe(true);
    expect(report.archived.length).toBeGreaterThan(0);
  });

  test('a step after a failed ARCHIVE is skipped rather than carried out', () => {
    const host = makeHost();
    mkdirSync(retiredName(host.layout.sites[0]!.webspace, AT), { recursive: true });
    const report = applyRemoval(planFor(host), host.io);

    expect(report.ok).toBe(false);
    const after = report.outcomes.slice(report.outcomes.findIndex(outcome => outcome.status === 'failed') + 1);
    expect(after.every(outcome => outcome.status === 'skipped')).toBe(true);
    // The account was NOT locked, because the run never reached it.
    expect(host.io.execLog.map(argv => argv[0])).not.toContain('usermod');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 5. Idempotence
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a second removal', () => {
  test('finds everything already gone and moves nothing', () => {
    const host = makeHost();
    expect(applyRemoval(planFor(host), host.io).ok).toBe(true);

    const second = applyRemoval(planFor(host, new Date('2026-09-01T00:00:00.000Z')), host.io);
    expect(second.ok).toBe(true);
    expect(second.archived).toEqual([]);
    expect(second.outcomes.filter(outcome => outcome.status === 'done' && outcome.step.kind !== 'exec')).toEqual([]);
  });

  test('and it says, of every path, that it was already gone rather than nothing at all', () => {
    const host = makeHost();
    applyRemoval(planFor(host), host.io);
    const steps = planFor(host, new Date('2026-09-01T00:00:00.000Z'));
    const left = steps.filter(step => step.kind === 'left');
    expect(left.length).toBeGreaterThan(0);
    for (const step of left) expect(describeRemoval(step)).toContain('LEFT ALONE');
    expect(steps.map(describeRemoval).join('\n')).toContain('already gone');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 6. The archived name
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the archived name', () => {
  test('is the path, beside itself, with a compact UTC instant', () => {
    expect(retiredName('/srv/www/example.org', AT)).toBe('/srv/www/example.org.retired-20260830T114500Z');
    expect(basename(retiredName('/a/b', AT)).startsWith('b.retired-')).toBe(true);
  });

  test('two removals a year apart do not collide', () => {
    expect(retiredName('/a/b', AT)).not.toBe(retiredName('/a/b', new Date('2027-08-30T11:45:00.000Z')));
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * A REMOVAL MAY ONLY ARCHIVE WHAT DECLARES ITSELF ITS OWN.
 *
 * `remove` tolerates a fleet collision on purpose — taking the offending instance off the
 * host is HOW an operator resolves one, so a collision must not make `remove` unusable. But
 * tolerance without a guard was worse than the refusal: a declaration that collides with a
 * live museum DERIVES that museum's paths, so "is this inside my derived set" says yes about
 * somebody else's serving tree, and removing the offender archived the victim.
 *
 * The marker is the tree's own statement of whose it is, and it is the only thing that can
 * tell two identical derivations apart.
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('removal refuses to archive another instance\'s tree', () => {
  test('a webspace marked for ANOTHER instance is LEFT, and named', () => {
    const host = makeHost();
    const victim = host.layout.sites[0]!.webspace;
    write(join(victim, '.dedalo_site_instance'), 'museum-b\n');

    const steps = removalPlan(host.layout, host.artifacts, observeForRemoval(host.layout, host.artifacts, host.io), AT);
    const archived = steps.filter((s) => s.kind === 'archive').map((s) => (s as { from: string }).from);
    expect(archived).not.toContain(victim);

    const left = steps.find((s) => s.kind === 'left' && (s as { path: string }).path === victim);
    expect(left).toBeDefined();
    expect((left as { why: string }).why).toContain('museum-b');
  });

  test('an UNMARKED tree is left too — this subsystem never wrote one', () => {
    const host = makeHost();
    const root = host.layout.roots.workspaces;
    rmSync(join(root, '.dedalo_site_instance'));

    const steps = removalPlan(host.layout, host.artifacts, observeForRemoval(host.layout, host.artifacts, host.io), AT);
    expect(steps.filter((s) => s.kind === 'archive').map((s) => (s as { from: string }).from)).not.toContain(root);
  });

  test('the instance\'s OWN trees are still archived — the guard is not a blanket refusal', () => {
    // Anti-vacuity: a guard that refused everything would pass the two tests above.
    const host = makeHost();
    const steps = removalPlan(host.layout, host.artifacts, observeForRemoval(host.layout, host.artifacts, host.io), AT);
    const archived = steps.filter((s) => s.kind === 'archive').map((s) => (s as { from: string }).from);
    for (const site of host.layout.sites) expect(archived).toContain(site.webspace);
    expect(archived).toContain(host.layout.roots.workspaces);
    expect(archived).toContain(host.layout.auditFile);
  });
});
