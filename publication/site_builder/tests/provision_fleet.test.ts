/**
 * THE FLEET GATE — the property no single declaration can state about itself.
 *
 * `tests/provision.test.ts` proves that ONE instance is coherent: its roots are outside its
 * served trees, its config directory is outside its writable set, its engine's private
 * directory is outside everything it owns. Every one of those assertions passes, unchanged,
 * on a host where two museums declare the same unix user, the same workspaces root, the
 * same socket or the same server_name — because each declaration is checked against itself
 * and nothing checks them against each other. On a host running several museums that is not
 * an oversight, it is the isolation gone: the boundary between two instances IS a uid, a
 * gid and a set of paths, so two declarations agreeing on any of them provision cleanly,
 * render correct-looking files, and start two daemons that share the thing that was
 * supposed to keep them apart.
 *
 * So this file is adversarial by construction. Every test below is a fleet somebody could
 * plausibly write — a second museum given the parent of the first one's tree, a production
 * domain that happens to be another museum's DERIVED preprod hostname, a `/var/lib`
 * reached through a symlink — and the assertion is that the census names it, names BOTH
 * instances, and names the shared thing.
 *
 * The two other properties gated here are about a run, not a collision:
 *
 *   - P5, REFUSE THE INSTANCE AND NOT THE FLEET. One malformed declaration among four must
 *     refuse that one BY NAME and leave the other three provisionable. A `--all` run that
 *     aborts on the first bad file is a run an operator cannot use on the day it matters.
 *   - P7, NO SECRET IN A REPORT. A refusal is printed to a terminal and pasted into a
 *     ticket. A pasted credential must be reported by KEY and never by value — including
 *     through the JSON parser, which quotes the token it tripped over.
 *
 * Nothing here writes outside a `mkdtemp` scratch directory, and most of it writes nothing
 * at all: the census is a pure function of derived layouts, which is what lets it be
 * exhaustive.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { derive, type InstanceLayout, type InstanceManifest } from '../src/provision/layout';
import { parseManifest } from '../src/provision/schema';
import {
  FleetCollisionError,
  assertFleetDisjoint,
  fleetViolations,
  loadFleet,
  manifestOf,
  type FleetViolation,
} from '../src/provision/fleet';

/* ────────────────────────────────────────────────────────────────────────────────────
 * Fixtures — a valid museum, and a way to bend exactly one thing about it
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * A complete, valid declaration for one museum, parameterised only by its name.
 *
 * Every derived path, identity and hostname is spelled from that name, so TWO calls to this
 * function are a disjoint fleet by construction — which is the baseline the adversarial
 * cases below bend one field away from. A fixture that needed hand-editing to be disjoint
 * would make every collision test ambiguous about which edit caused the collision.
 */
function declaration(instance: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    instance,
    engine: {
      private_dir: `/srv/dedalo/${instance}/private`,
      group: `dedalo-${instance}`,
      checkout_dir: `/srv/dedalo/${instance}/master_dedalo`,
      bun_bin: `/srv/dedalo/${instance}/.bun/bin/bun`,
    },
    web: { server: 'nginx', group: 'www-data' },
    publication_api: { url: 'http://127.0.0.1:3100/publication/server_api/v2' },
    webspace_base: '/srv/www',
    sites: [{ slug: 'collection', domain: `www.${instance}.example.org` }],
    serving: {
      preprod: {
        enabled: true,
        auth: {
          mode: 'htpasswd',
          users: [
            {
              name: 'preview',
              password_file: `/etc/dedalo_sites/instances/${instance}/secrets/PREPROD_PASSWORD`,
            },
          ],
        },
      },
      prod: { tls: { mode: 'none' } },
    },
    agent: { driver: 'claude_code', bins: { claude_code: '/usr/local/bin/claude' } },
    ...overrides,
  };
}

/** The composition the whole subsystem is built on: parse, then derive. */
function layoutOf(instance: string, overrides: Record<string, unknown> = {}): InstanceLayout {
  return derive(parseManifest(declaration(instance, overrides)));
}

/**
 * A layout derived from a manifest with one field bent PAST the schema.
 *
 * Needed for exactly one class of test: the schema refuses a `..` segment and tidies a
 * trailing slash at parse time, so a declaration cannot carry two spellings of one
 * directory. The fleet census must still be right about them — an adopted host, a future
 * `provision adopt` reading paths off a disk, or a gate can all produce a manifest the
 * grammar never saw — so the manifest is validated and then one field is replaced.
 */
function layoutWith(instance: string, bend: Partial<InstanceManifest>): InstanceLayout {
  return derive({ ...parseManifest(declaration(instance)), ...bend } as InstanceManifest);
}

function fleetOf(...layouts: InstanceLayout[]): { layouts: InstanceLayout[] } {
  return { layouts };
}

/** Every violation naming both of these instances, whatever the order they were listed in. */
function between(violations: readonly FleetViolation[], a: string, b: string): FleetViolation[] {
  return violations.filter(
    violation => violation.instances.includes(a) && violation.instances.includes(b),
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Scratch host — the only thing in this file that touches a filesystem
 * ──────────────────────────────────────────────────────────────────────────────────── */

const scratchDirs: string[] = [];

/** A throwaway `/etc/dedalo_sites/instances` stand-in, swept after every test. */
function scratchFleetDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dedalo-fleet-'));
  scratchDirs.push(dir);
  return dir;
}

/** Write one instance directory. `body` is written verbatim so a test can break the JSON. */
function writeInstance(dir: string, name: string, body: string | object): string {
  const instanceDir = join(dir, name);
  mkdirSync(instanceDir, { recursive: true });
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(join(instanceDir, 'instance.json'), text, 'utf8');
  return instanceDir;
}

afterEach(() => {
  while (scratchDirs.length > 0) {
    rmSync(scratchDirs.pop()!, { recursive: true, force: true });
  }
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * The baseline
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a fleet of separate museums', () => {
  test('three default instances share nothing, and the law passes', () => {
    const fleet = fleetOf(layoutOf('alpha'), layoutOf('beta'), layoutOf('gamma'));
    expect(fleetViolations(fleet)).toEqual([]);
    expect(() => assertFleetDisjoint(fleet)).not.toThrow();
  });

  test('a shared BASE is not a collision — that is how a host holds several museums', () => {
    // Every instance's config dir is under /etc/dedalo_sites/instances, its state dir under
    // /var/lib, its webspaces under /srv/www. Claiming the bases would refuse every real
    // fleet, so the census claims the per-instance tree UNDER each base and nothing higher.
    const fleet = fleetOf(layoutOf('alpha'), layoutOf('beta'));
    const paths = fleetViolations(fleet).filter(violation => violation.kind === 'path');
    expect(paths).toEqual([]);
  });

  test('an INTRA-instance clash is not this census’s business', () => {
    // A single museum whose alias equals its own site's preprod hostname is refused by the
    // vhost renderers, which own that rule and explain it better. A second owner here would
    // be the one that drifts.
    const layout = layoutOf('alpha', {
      serving: {
        preprod: { enabled: true, auth: { mode: 'none' } },
        prod: { tls: { mode: 'none' } },
        aliases: { 'pre.www.alpha.example.org': 'collection' },
      },
    });
    expect(fleetViolations(fleetOf(layout))).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * Paths — sharing, nesting, and two spellings of one directory
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the path census', () => {
  test('two instances declaring the SAME workspaces root collide', () => {
    const fleet = fleetOf(
      layoutOf('alpha', { roots: { workspaces: '/srv/shared/work' } }),
      layoutOf('beta', { roots: { workspaces: '/srv/shared/work' } }),
    );
    const found = between(fleetViolations(fleet), 'alpha', 'beta').filter(v => v.kind === 'path');
    expect(found).toHaveLength(1);
    expect(found[0]!.shared).toBe('/srv/shared/work');
    expect(found[0]!.message).toContain('roots.workspaces');
    expect(found[0]!.message).toContain("'alpha'");
    expect(found[0]!.message).toContain("'beta'");
  });

  test('PREFIX CONTAINMENT COUNTS: /srv/shared against /srv/shared/beta', () => {
    // The collision that actually happens on a host: the second museum is given a directory
    // inside the first one's tree, and neither declaration looks wrong on its own.
    const fleet = fleetOf(
      layoutOf('alpha', { roots: { workspaces: '/srv/shared' } }),
      layoutOf('beta', { roots: { workspaces: '/srv/shared/beta' } }),
    );
    const found = between(fleetViolations(fleet), 'alpha', 'beta').filter(v => v.kind === 'path');
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain('overlaps');
  });

  test('a trailing slash and a .. segment are ONE directory, not two', () => {
    const fleet = fleetOf(
      layoutWith('alpha', { roots: { workspaces: '/srv/shared/work/' } }),
      layoutWith('beta', { roots: { workspaces: '/srv/shared/work/elsewhere/..' } }),
    );
    const found = between(fleetViolations(fleet), 'alpha', 'beta').filter(v => v.kind === 'path');
    expect(found).toHaveLength(1);
    expect(found[0]!.shared).toBe('/srv/shared/work');
  });

  test('a SYMLINK cannot smuggle one tree past the check under two names', () => {
    // The ordinary host, not a trick: /var/lib is a symlink, or /srv is reached through
    // one, and the two declarations spell the same tree two ways.
    const host = scratchFleetDir();
    const real = join(host, 'real');
    const link = join(host, 'link');
    mkdirSync(real, { recursive: true });
    symlinkSync(real, link);

    const fleet = fleetOf(
      layoutOf('alpha', { roots: { workspaces: join(real, 'work') } }),
      layoutOf('beta', { roots: { workspaces: join(link, 'work') } }),
    );
    const found = between(fleetViolations(fleet), 'alpha', 'beta').filter(v => v.kind === 'path');
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain('symlinks are followed');
  });

  test('a shared ENGINE private directory collides — the pairing is 1:1', () => {
    const fleet = fleetOf(
      layoutOf('alpha', {
        engine: {
          private_dir: '/srv/dedalo/shared/private',
          group: 'dedalo-alpha',
          checkout_dir: '/srv/dedalo/alpha/master_dedalo',
          bun_bin: '/srv/dedalo/alpha/.bun/bin/bun',
        },
      }),
      layoutOf('beta', {
        engine: {
          private_dir: '/srv/dedalo/shared/private',
          group: 'dedalo-beta',
          checkout_dir: '/srv/dedalo/beta/master_dedalo',
          bun_bin: '/srv/dedalo/beta/.bun/bin/bun',
        },
      }),
    );
    const found = between(fleetViolations(fleet), 'alpha', 'beta').filter(v => v.kind === 'path');
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("engine's private directory");
  });

  test("one instance's root CONTAINING another's engine private directory collides", () => {
    // The case the fleet law exists for. `derive()` already refuses a root that contains
    // the instance's OWN engine private dir; it cannot see anybody else's, and a service
    // user that can read the paired engine's ../private/ reads that museum's .env.
    const fleet = fleetOf(
      layoutOf('alpha', {
        engine: {
          private_dir: '/opt/alpha/private',
          group: 'dedalo-alpha',
          // Outside the widened workspaces root below: `derive()` refuses a checkout inside
          // this instance's OWN writable set, which is a different law from the fleet one
          // being measured here.
          checkout_dir: '/opt/alpha/master_dedalo',
          bun_bin: '/opt/alpha/.bun/bin/bun',
        },
        roots: { workspaces: '/srv/dedalo' },
      }),
      layoutOf('beta'), // engine.private_dir defaults to /srv/dedalo/beta/private
    );
    const found = between(fleetViolations(fleet), 'alpha', 'beta').filter(v => v.kind === 'path');
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain('/srv/dedalo/beta/private');
  });

  test('two daemons binding ONE socket collide', () => {
    // Today the socket is derived from the instance name and cannot collide on its own, so
    // the layouts are bent by hand — the row exists because a socket collision is the one
    // failure here an operator has already met somewhere else (two processes, one .sock,
    // every second request answered by the wrong one), and because the day a runtime path
    // becomes declarable the census must already cover it.
    const shared = '/run/dedalo-sites/shared/daemon.sock';
    const fleet = fleetOf(
      { ...layoutOf('alpha'), socketPath: shared },
      { ...layoutOf('beta'), socketPath: shared },
    );
    const found = between(fleetViolations(fleet), 'alpha', 'beta').filter(v => v.kind === 'path');
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain('daemon socket');
  });

  test('two sites of different museums may not share a webspace', () => {
    const fleet = fleetOf(
      layoutOf('alpha', { sites: [{ slug: 'collection', domain: 'www.alpha.example.org', webspace: '/srv/legacy/shared' }] }),
      layoutOf('beta', { sites: [{ slug: 'archive', domain: 'www.beta.example.org', webspace: '/srv/legacy/shared' }] }),
    );
    const found = between(fleetViolations(fleet), 'alpha', 'beta').filter(v => v.kind === 'path');
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("site 'collection's webspace");
    expect(found[0]!.message).toContain("site 'archive's webspace");
  });

  test('a shared htpasswd collides — one password file is every museum behind one credential', () => {
    const shared = '/etc/dedalo_sites/shared.htpasswd';
    const fleet = fleetOf(
      layoutOf('alpha', {
        serving: {
          preprod: { enabled: true, auth: { mode: 'htpasswd', htpasswd: shared } },
          prod: { tls: { mode: 'none' } },
        },
      }),
      layoutOf('beta', {
        serving: {
          preprod: { enabled: true, auth: { mode: 'htpasswd', htpasswd: shared } },
          prod: { tls: { mode: 'none' } },
        },
      }),
    );
    const found = between(fleetViolations(fleet), 'alpha', 'beta').filter(v => v.kind === 'path');
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain('preprod password file');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * Identities
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the identity census', () => {
  test('two adopted instances sharing a unix USER collide', () => {
    const fleet = fleetOf(
      layoutOf('alpha', { identity: { user: 'sitebuilder', group: 'alpha-grp' } }),
      layoutOf('beta', { identity: { user: 'sitebuilder', group: 'beta-grp' } }),
    );
    const found = fleetViolations(fleet).filter(violation => violation.kind === 'user');
    expect(found).toHaveLength(1);
    expect(found[0]!.shared).toBe('sitebuilder');
    expect(found[0]!.instances).toEqual(['alpha', 'beta']);
  });

  test('two adopted instances sharing a unix GROUP collide', () => {
    const fleet = fleetOf(
      layoutOf('alpha', { identity: { user: 'alpha-usr', group: 'sitebuilders' } }),
      layoutOf('beta', { identity: { user: 'beta-usr', group: 'sitebuilders' } }),
    );
    const found = fleetViolations(fleet).filter(violation => violation.kind === 'group');
    expect(found).toHaveLength(1);
    expect(found[0]!.shared).toBe('sitebuilders');
  });

  test('the SHARED host groups are not collisions', () => {
    // Every instance on a Debian host names www-data, and the engine group is whatever that
    // museum's engine unit was given. Comparing those would refuse every real fleet.
    const fleet = fleetOf(layoutOf('alpha'), layoutOf('beta'));
    expect(fleetViolations(fleet).filter(v => v.kind === 'group')).toEqual([]);
  });

  test('a duplicated instance NAME is reported once, not once per dimension', () => {
    const fleet = fleetOf(layoutOf('alpha'), layoutOf('alpha'));
    const violations = fleetViolations(fleet);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.kind).toBe('instance');
    expect(violations[0]!.shared).toBe('alpha');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * Hostnames — including the one a census forgets
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the hostname census', () => {
  test('two museums claiming one production hostname collide', () => {
    const fleet = fleetOf(
      layoutOf('alpha', { sites: [{ slug: 'collection', domain: 'www.museum.example.org' }] }),
      layoutOf('beta', { sites: [{ slug: 'archive', domain: 'www.museum.example.org' }] }),
    );
    // BOTH of that site's hostnames collide, and both are reported: the production name
    // and the preprod name derived from it. Two shared hostnames are two vhost conflicts,
    // and an operator who fixes one has fixed one.
    const found = fleetViolations(fleet).filter(violation => violation.kind === 'hostname');
    expect(found.map(violation => violation.shared).sort()).toEqual([
      'pre.www.museum.example.org',
      'www.museum.example.org',
    ]);
  });

  test("a production domain that IS another museum's DERIVED preprod hostname collides", () => {
    // The row a census forgets, because nobody wrote it down: `pre.<domain>` is derived and
    // lands in a vhost exactly as the production name does. Without it, one museum's
    // unpublished drafts are served from the other museum's vhost, and both declarations
    // look impeccable.
    const fleet = fleetOf(
      layoutOf('alpha', { sites: [{ slug: 'collection', domain: 'www.alpha.example.org' }] }),
      layoutOf('beta', { sites: [{ slug: 'archive', domain: 'pre.www.alpha.example.org' }] }),
    );
    const found = fleetViolations(fleet).filter(violation => violation.kind === 'hostname');
    expect(found).toHaveLength(1);
    expect(found[0]!.shared).toBe('pre.www.alpha.example.org');
    expect(found[0]!.message).toContain('preprod hostname');
    expect(found[0]!.instances).toEqual(['alpha', 'beta']);
  });

  test('a preprod hostname is claimed even where the draft surface is off today', () => {
    // A hostname that becomes a collision the day a museum enables its drafts is a
    // collision now — while both declarations are still being edited, which is the whole
    // value of the check.
    const fleet = fleetOf(
      layoutOf('alpha', {
        sites: [{ slug: 'collection', domain: 'www.alpha.example.org' }],
        serving: {
          preprod: { enabled: false, auth: { mode: 'none' } },
          prod: { tls: { mode: 'none' } },
        },
      }),
      layoutOf('beta', { sites: [{ slug: 'archive', domain: 'pre.www.alpha.example.org' }] }),
    );
    expect(fleetViolations(fleet).filter(v => v.kind === 'hostname')).toHaveLength(1);
  });

  test("an ALIAS colliding with another museum's site is named", () => {
    const fleet = fleetOf(
      layoutOf('alpha', { sites: [{ slug: 'collection', domain: 'www.alpha.example.org' }] }),
      layoutOf('beta', {
        sites: [{ slug: 'archive', domain: 'www.beta.example.org' }],
        serving: {
          preprod: { enabled: true, auth: { mode: 'none' } },
          prod: { tls: { mode: 'none' } },
          aliases: { 'www.alpha.example.org': 'archive' },
        },
      }),
    );
    const found = fleetViolations(fleet).filter(violation => violation.kind === 'hostname');
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain('serving.aliases');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * The host's resources
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the host budget', () => {
  const bounded = (instance: string, memory: string, cpu: string, tasks: number) =>
    layoutOf(instance, { resources: { memory_max: memory, cpu_quota: cpu, tasks_max: tasks } });

  test('no budget stated, no arithmetic performed', () => {
    const fleet = fleetOf(bounded('alpha', '8G', '200%', 512), bounded('beta', '8G', '200%', 512));
    expect(fleetViolations(fleet)).toEqual([]);
  });

  test('a fleet that fits its host passes', () => {
    const fleet = fleetOf(bounded('alpha', '4G', '100%', 256), bounded('beta', '4G', '100%', 256));
    const violations = fleetViolations(fleet, {
      hostBudget: { memory_max: '16G', cpu_quota: '400%', tasks_max: 1024 },
    });
    expect(violations).toEqual([]);
  });

  test('summed shares over the host budget are refused, with the breakdown', () => {
    const fleet = fleetOf(bounded('alpha', '8G', '200%', 512), bounded('beta', '12G', '100%', 256));
    const found = fleetViolations(fleet, { hostBudget: { memory_max: '16G' } });
    expect(found).toHaveLength(1);
    expect(found[0]!.kind).toBe('budget');
    expect(found[0]!.shared).toBe('memory_max');
    expect(found[0]!.message).toContain('20G');
    expect(found[0]!.message).toContain('16G');
    expect(found[0]!.instances).toEqual(['alpha', 'beta']);
  });

  test('an UNBOUNDED member makes every other limit decorative, and is named', () => {
    const fleet = fleetOf(bounded('alpha', '4G', '100%', 256), layoutOf('beta'));
    const found = fleetViolations(fleet, { hostBudget: { memory_max: '16G' } });
    expect(found).toHaveLength(1);
    expect(found[0]!.instances).toEqual(['beta']);
    expect(found[0]!.message).toContain('resources.memory_max');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * The port that does not exist
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the TCP listener tripwire', () => {
  test('a layout carrying a port refuses, naming the census that must gain a row', () => {
    const bent = { ...layoutOf('alpha'), port: 8080 } as unknown as InstanceLayout;
    expect(() => fleetViolations(fleetOf(bent))).toThrow(/src\/provision\/fleet\.ts/);
    expect(() => fleetViolations(fleetOf(bent))).toThrow(/TCP port/);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * Reporting — all of it, at once, in a stable order
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the report', () => {
  const colliding = () =>
    fleetOf(
      layoutOf('alpha', {
        identity: { user: 'sitebuilder', group: 'alpha-grp' },
        roots: { workspaces: '/srv/shared/work' },
        sites: [{ slug: 'collection', domain: 'www.museum.example.org' }],
      }),
      layoutOf('beta', {
        identity: { user: 'sitebuilder', group: 'beta-grp' },
        roots: { workspaces: '/srv/shared/work' },
        sites: [{ slug: 'archive', domain: 'www.museum.example.org' }],
      }),
    );

  test('THREE collisions are reported in ONE pass', () => {
    // An operator adding museum #4 must not fix one collision per provisioning run: each
    // run is another round trip against a host with live museum sites on it.
    const violations = fleetViolations(colliding());
    expect(new Set(violations.map(violation => violation.kind))).toEqual(
      new Set(['user', 'path', 'hostname']),
    );
    expect(violations.length).toBeGreaterThanOrEqual(3);
  });

  test('assertFleetDisjoint throws ONE error carrying every violation', () => {
    let error: unknown;
    try {
      assertFleetDisjoint(colliding());
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(FleetCollisionError);
    const collision = error as FleetCollisionError;
    expect(collision.violations).toEqual(fleetViolations(colliding()));
    expect(collision.message).toContain('sitebuilder');
    expect(collision.message).toContain('/srv/shared/work');
    expect(collision.message).toContain('www.museum.example.org');
    expect(collision.message).toContain('Nothing was provisioned.');
  });

  test('the report is a function of the FLEET, not of the order it was read in', () => {
    const [alpha, beta] = colliding().layouts as [InstanceLayout, InstanceLayout];
    expect(fleetViolations(fleetOf(beta, alpha))).toEqual(fleetViolations(fleetOf(alpha, beta)));
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * loadFleet — P5, and what a broken museum may cost the others
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('loadFleet', () => {
  test('reads every declaration under the directory, in instance-name order', () => {
    const dir = scratchFleetDir();
    for (const name of ['gamma', 'alpha', 'beta']) writeInstance(dir, name, declaration(name));

    const fleet = loadFleet(dir);
    expect(fleet.layouts.map(layout => layout.instance)).toEqual(['alpha', 'beta', 'gamma']);
    expect(fleet.refusals).toEqual([]);
    expect(manifestOf(fleet, 'beta').instance).toBe('beta');
    expect(fleet.members.map(member => member.instance)).toEqual(['alpha', 'beta', 'gamma']);
    expect(fleet.members[1]!.manifestPath).toBe(join(dir, 'beta', 'instance.json'));
    // The projection and the record are one build: neither can hold a museum the other lacks.
    expect(fleet.layouts).toEqual(fleet.members.map(member => member.layout));
  });

  test('P5: ONE malformed declaration among four refuses that one BY NAME', () => {
    const dir = scratchFleetDir();
    writeInstance(dir, 'alpha', declaration('alpha'));
    writeInstance(dir, 'beta', '{ "instance": "beta", ');   // truncated JSON
    writeInstance(dir, 'gamma', declaration('gamma'));
    writeInstance(dir, 'delta', declaration('delta'));

    const fleet = loadFleet(dir);
    expect(fleet.layouts.map(layout => layout.instance)).toEqual(['alpha', 'delta', 'gamma']);
    expect(fleet.refusals).toHaveLength(1);
    expect(fleet.refusals[0]!.instance).toBe('beta');
    expect(fleet.refusals[0]!.reason).toContain('not valid JSON');
    // And the three that loaded are provisionable, not merely present.
    expect(() => assertFleetDisjoint(fleet)).not.toThrow();
  });

  test('a declaration the schema refuses is refused by name, with the operator’s fix list', () => {
    const dir = scratchFleetDir();
    writeInstance(dir, 'alpha', declaration('alpha'));
    const broken = declaration('beta') as Record<string, unknown>;
    broken.web = { server: 'nginx' }; // web.group is required and never defaulted
    writeInstance(dir, 'beta', broken);

    const fleet = loadFleet(dir);
    expect(fleet.layouts.map(layout => layout.instance)).toEqual(['alpha']);
    expect(fleet.refusals[0]!.instance).toBe('beta');
    expect(fleet.refusals[0]!.reason).toContain('web.group');
  });

  test('a declaration that names a different instance than its directory is refused', () => {
    const dir = scratchFleetDir();
    writeInstance(dir, 'beta', declaration('alpha'));

    const fleet = loadFleet(dir);
    expect(fleet.layouts).toEqual([]);
    expect(fleet.refusals[0]!.instance).toBe('beta');
    expect(fleet.refusals[0]!.reason).toContain("names instance 'alpha'");
  });

  test('an instance directory with no declaration is refused', () => {
    const dir = scratchFleetDir();
    mkdirSync(join(dir, 'alpha'), { recursive: true });

    const fleet = loadFleet(dir);
    expect(fleet.refusals[0]!.instance).toBe('alpha');
    expect(fleet.refusals[0]!.reason).toContain('no readable instance.json');
  });

  test('a directory whose NAME cannot be an instance is refused (cp -r example example.bak)', () => {
    const dir = scratchFleetDir();
    writeInstance(dir, 'alpha', declaration('alpha'));
    writeInstance(dir, 'alpha.bak', declaration('alpha'));

    const fleet = loadFleet(dir);
    expect(fleet.layouts.map(layout => layout.instance)).toEqual(['alpha']);
    expect(fleet.refusals[0]!.instance).toBe('alpha.bak');
    expect(fleet.refusals[0]!.reason).toContain('not a valid instance name');
  });

  test('a stray FILE beside the museums is ignored, not refused', () => {
    // /etc directories collect notes and backups; a fleet that will not load because
    // somebody left a README beside eight museums is a fleet nobody can operate.
    const dir = scratchFleetDir();
    writeInstance(dir, 'alpha', declaration('alpha'));
    writeFileSync(join(dir, 'README.md'), 'operator notes\n', 'utf8');

    const fleet = loadFleet(dir);
    expect(fleet.layouts.map(layout => layout.instance)).toEqual(['alpha']);
    expect(fleet.refusals).toEqual([]);
  });

  test('a fleet with zero valid instances loads as EMPTY, with the reasons kept', () => {
    // The non-zero exit is `cli.ts`'s call — what counts as a failed run is a property of
    // the command an operator typed, not of the directory. What this module owes is the
    // distinction between "no museums here" and "every museum here is broken".
    const dir = scratchFleetDir();
    writeInstance(dir, 'alpha', '{ broken');
    writeInstance(dir, 'beta', '{ broken');

    const fleet = loadFleet(dir);
    expect(fleet.layouts).toEqual([]);
    expect(fleet.refusals.map(refusal => refusal.instance)).toEqual(['alpha', 'beta']);
  });

  test('an unreadable FLEET ROOT throws — that is the host, not one museum', () => {
    expect(() => loadFleet(join(scratchFleetDir(), 'not-a-directory'))).toThrow(
      /cannot read the instance directory/,
    );
  });

  test('manifestOf refuses to invent a declaration for a refused instance', () => {
    const dir = scratchFleetDir();
    writeInstance(dir, 'alpha', declaration('alpha'));
    const fleet = loadFleet(dir);
    expect(() => manifestOf(fleet, 'beta')).toThrow(/no declaration was loaded/);
  });

  test('loading and the fleet law COMPOSE: two colliding museums on a real host', () => {
    const dir = scratchFleetDir();
    writeInstance(dir, 'alpha', declaration('alpha', { roots: { workspaces: '/srv/shared/work' } }));
    writeInstance(dir, 'beta', declaration('beta', { roots: { workspaces: '/srv/shared/work' } }));

    const fleet = loadFleet(dir);
    expect(fleet.refusals).toEqual([]);
    let error: unknown;
    try {
      assertFleetDisjoint(fleet);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(FleetCollisionError);
    expect((error as FleetCollisionError).message).toContain(dir);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * P7 — a refusal is printed, pasted into a ticket, and must carry no secret
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('no secret in a report', () => {
  const SECRET = 'sk-live-THIS-MUST-NEVER-BE-PRINTED';

  test('an INLINED credential is refused by KEY, never by value', () => {
    const dir = scratchFleetDir();
    writeInstance(dir, 'alpha', declaration('alpha', { secrets: { ANTHROPIC_API_KEY: SECRET } }));

    const fleet = loadFleet(dir);
    expect(fleet.layouts).toEqual([]);
    const reason = fleet.refusals[0]!.reason;
    expect(reason).toContain('ANTHROPIC_API_KEY');
    expect(reason).not.toContain(SECRET);
  });

  test('a JSON syntax error does not quote the file — the parser is muzzled on purpose', () => {
    // A parse error names the token it tripped over. This file lives in a directory whose
    // purpose is to be beside credentials, so the position is something the operator looks
    // up on their own terminal; the refusal carries the command, not the content.
    const dir = scratchFleetDir();
    writeInstance(dir, 'alpha', `{ "secrets": { "ANTHROPIC_API_KEY": "${SECRET}" } oops }`);

    const fleet = loadFleet(dir);
    const reason = fleet.refusals[0]!.reason;
    expect(reason).not.toContain(SECRET);
    expect(reason).toContain('jq .');
  });

  test('a collision report names paths and identities only', () => {
    const dir = scratchFleetDir();
    for (const name of ['alpha', 'beta']) {
      writeInstance(
        dir,
        name,
        declaration(name, {
          roots: { workspaces: '/srv/shared/work' },
          secrets: { ANTHROPIC_API_KEY: `/etc/dedalo_sites/instances/${name}/secrets/ANTHROPIC_API_KEY` },
        }),
      );
    }
    const fleet = loadFleet(dir);
    const report = fleetViolations(fleet)
      .map(violation => violation.message)
      .join('\n');
    expect(report).toContain('/srv/shared/work');
    expect(report).not.toContain(SECRET);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * A path one instance READS must not sit in a tree another instance WRITES.
 *
 * Different question from exclusivity: two museums are not claiming the same path — one
 * names a credential, a TLS key or an agent binary that happens to live inside the other's
 * workspaces root or webspace, trees whose contents an agent turn authors. The owner then
 * controls the bytes the reader opens as its own credential, or the binary it executes as
 * its own agent. Sharing such a path is legitimate (one claude binary serves the host), so
 * only containment in a FOREIGN writable tree is refused.
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a read path inside another instance\'s writable tree', () => {
  const foreign = (patch: Record<string, unknown>) =>
    between(
      fleetViolations(
        fleetOf(
          layoutOf('alpha', patch),
          layoutOf('beta', { roots: { workspaces: '/srv/state/beta/workspaces' },
                             sites: [{ slug: 'one', domain: 'www.beta.example.org', webspace: '/srv/www-beta/site' }] }),
        ),
      ),
      'alpha',
      'beta',
    ).filter(v => v.kind === 'path');

  test('a credential file planted in another museum workspace is refused', () => {
    const found = foreign({ secrets: { ANTHROPIC_API_KEY: '/srv/state/beta/workspaces/planted' } });
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]!.message).toContain('workspaces root');
  });

  test('an agent binary inside another museum webspace is refused', () => {
    const found = foreign({ agent: { driver: 'claude_code', bins: { claude_code: '/srv/www-beta/site/claude' } } });
    expect(found.length).toBeGreaterThan(0);
  });

  test('a TLS private key inside another museum webspace is refused', () => {
    const found = foreign({
      serving: {
        preprod: { enabled: true, auth: { mode: 'htpasswd', users: [{ name: 'preview', password_file: '/etc/x/P' }] } },
        prod: { tls: { mode: 'files', certificate: '/etc/ssl/a.crt', key: '/srv/www-beta/site/a.key' } },
      },
    });
    expect(found.length).toBeGreaterThan(0);
  });

  test('but a SHARED agent binary outside every writable tree is fine', () => {
    // One claude install serves every museum on the host. Refusing that would refuse every
    // real fleet, which is how a correct-looking check gets switched off.
    expect(foreign({ agent: { driver: 'claude_code', bins: { claude_code: '/usr/local/bin/claude' } } })).toEqual([]);
  });
});
