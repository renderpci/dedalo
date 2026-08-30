/**
 * THE PLAN'S GATE — the orderings and the refusals, never the wording.
 *
 * `src/provision/plan.ts` exists so that the decisions a provisioning run makes are a VALUE
 * a gate can hold, instead of a sequence of side effects that can only be observed by
 * running them as root on a museum's host. This file is the payoff: every property below is
 * asserted over a MATRIX of host states — nothing exists, everything exists, one thing
 * drifted — because a provisioner is only interesting on the second run and on the wrong
 * host, and a single happy-path fixture would go green on all of the defects this subsystem
 * was built to delete.
 *
 * What is asserted, and why each one is here rather than left to review:
 *
 *   - A `groupadd` always precedes the `useradd` that names it, and no `useradd` is ever
 *     planned without `--gid`. That is the retired installer's defect 3, which the engine's
 *     own unit also documents (`deploy/dedalo-ts.service`, above `User=`): a clean install
 *     and a daemon that never starts, on whichever host's `USERGROUPS_ENAB` says no.
 *   - Every path in the unit's `ReadWritePaths=` is a directory the plan creates. Under
 *     `ProtectSystem=strict` a missing entry is not an install failure — it is EROFS at
 *     publish time, on a museum's live site.
 *   - A settled host yields an EMPTY plan. Idempotence is the property that makes this tool
 *     schedulable and its output readable, and it is the first thing a refactor breaks.
 *   - A credential is never rewritten, and no value ever reaches a printed line.
 *   - The web server's configuration test stands between a vhost change and a reload, by
 *     ORDER, because one bad vhost takes down every site on the host.
 *
 * The host states are built by SIMULATING an apply over the plan's own output. That is not
 * a convenience: a hand-written "everything exists" fixture drifts away from the plan the
 * moment a row is added to §3, and would then assert idempotence about a host the
 * provisioner does not actually produce.
 */

import { describe, expect, test } from 'bun:test';
import { basename, dirname, join, resolve } from 'node:path';
import type { InstanceLayout, InstanceManifest } from '../src/provision/layout';
import { INSTANCE_MARKER, MODES, SURFACES, derive, isStrictlyWithin, markerContent, readWritePaths } from '../src/provision/layout';
import { parseManifest } from '../src/provision/schema';
import { artifact, renderAll } from '../src/provision/render';
import type { ModeKey } from '../src/provision/render';
import { SERVICE_TOKEN_KEY } from '../src/provision/render/engine_fragment';
import { stamp } from '../src/provision/hash';
import type {
  Action,
  ExecAction,
  FileAction,
  HostState,
  PathObservation,
  UserAction,
} from '../src/provision/plan';
import {
  PHASES,
  assertPlanIsCoherent,
  changesTheHost,
  describe as describeAction,
  observedPaths,
  orphanedVhosts,
  plan,
} from '../src/provision/plan';

/* ────────────────────────────────────────────────────────────────────────────────────
 * Declarations
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** The smallest declaration that parses — the shape every other provision gate uses. */
function baseDoc(): Record<string, any> {
  return {
    instance: 'gate',
    engine: {
      private_dir: '/srv/dedalo/gate/private',
      group: 'dedalo-gate',
      checkout_dir: '/srv/dedalo/gate/master_dedalo',
      bun_bin: '/srv/dedalo/gate/.bun/bin/bun',
    },
    web: { server: 'nginx', group: 'www-data' },
    publication_api: { url: 'http://127.0.0.1:3100/publication/server_api/v2' },
    sites: [{ slug: 'one', domain: 'one.example.org' }],
    serving: {
      preprod: {
        enabled: true,
        auth: {
          mode: 'htpasswd',
          users: [{ name: 'preview', password_file: '/etc/creds/PREPROD_PASSWORD' }],
        },
      },
      prod: { tls: { mode: 'none' } },
    },
    agent: { driver: 'claude_code', bins: { claude_code: '/usr/local/bin/claude' } },
  };
}

function docWith(patch: Record<string, any>): Record<string, any> {
  const doc = baseDoc();
  for (const [key, value] of Object.entries(patch)) {
    doc[key] =
      value !== null && typeof value === 'object' && !Array.isArray(value) && typeof doc[key] === 'object'
        ? { ...doc[key], ...value }
        : value;
  }
  return doc;
}

interface Declaration {
  readonly manifest: InstanceManifest;
  readonly layout: InstanceLayout;
}

function declare(doc: unknown = baseDoc()): Declaration {
  const manifest = parseManifest(doc, { source: 'the plan gate' });
  return { manifest, layout: derive(manifest) };
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Host states
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** A fixed clock. The plan reads no clock; only the fixtures need one, for rotation. */
const NOW = 1_000_000;
const EARLIER = NOW - 5_000;

/** A host on which nothing of this instance exists. The first run's world. */
function bareHost(): HostState {
  return { users: [], groups: [], entries: {}, unitEnabled: false, unitActive: false };
}

function withEntries(host: HostState, entries: Record<string, PathObservation>): HostState {
  return { ...host, entries: { ...host.entries, ...entries } };
}

/**
 * ONE APPLY, SIMULATED. It is deliberately as dumb as `apply.ts` is supposed to be: it
 * performs what each action says and decides nothing, so a host state built from it is the
 * host the provisioner actually produces rather than the one a fixture author imagined.
 */
function simulate(host: HostState, actions: readonly Action[]): HostState {
  const entries: Record<string, PathObservation> = { ...host.entries };
  const users = [...host.users];
  const groups = [...host.groups];
  let unitEnabled = host.unitEnabled;
  let unitActive = host.unitActive;
  let htpasswdUsers = host.htpasswdUsers;

  for (const action of actions) {
    switch (action.kind) {
      case 'group':
        groups.push(action.name);
        break;
      case 'user':
        users.push(action.name);
        break;
      case 'dir':
        entries[action.path] = {
          type: 'dir',
          mode: action.mode,
          owner: action.owner,
          group: action.group,
          empty: true,
        };
        break;
      case 'symlink':
        entries[action.path] = {
          type: 'symlink',
          target: action.target,
          owner: action.owner,
          group: action.group,
        };
        break;
      case 'file': {
        if (action.disposition === 'awaiting') break; // only a human can place this one
        const previous = entries[action.path];
        // The opaque sources are opaque here too: the simulator never invents a credential,
        // which is what keeps this fixture honest about what a HostState may hold.
        const content =
          action.content.source === 'literal'
            ? action.content.body
            : (previous?.content ?? '(opaque, never observed)');
        if (action.content.source === 'htpasswd') {
          htpasswdUsers = action.content.users.map(user => user.name);
        }
        entries[action.path] = {
          type: 'file',
          mode: action.mode,
          owner: action.owner,
          group: action.group,
          content,
          mtimeMs: NOW,
        };
        break;
      }
      case 'exec':
        if (action.step === 'unit_enable') unitEnabled = true;
        if (action.step === 'unit_start' || action.step === 'unit_restart') unitActive = true;
        break;
    }
  }

  // The rest of the observation is carried through unchanged — an apply does not stop the
  // observer from having listed the vhost directories, and `vhostDirEntries` in particular
  // must survive, or a fixture would forget the files a dropped site left behind.
  return markNonEmpty({ ...host, users, groups, entries, unitEnabled, unitActive, htpasswdUsers });
}

/** A directory holding anything is not empty — which is what §5's refusal turns on. */
function markNonEmpty(host: HostState): HostState {
  const entries: Record<string, PathObservation> = { ...host.entries };
  for (const [path, observation] of Object.entries(entries)) {
    if (observation.type !== 'dir') continue;
    const holds = Object.keys(entries).some(other => other !== path && other.startsWith(`${path}/`));
    entries[path] = { ...observation, empty: !holds };
  }
  return { ...host, entries };
}

/** The operator does their half: every credential the provisioner cannot invent is placed. */
function placeOperatorFiles(host: HostState, actions: readonly Action[]): HostState {
  const entries: Record<string, PathObservation> = { ...host.entries };
  for (const action of actions) {
    if (action.kind !== 'file' || action.disposition !== 'awaiting') continue;
    entries[action.path] = {
      type: 'file',
      mode: action.mode,
      owner: action.owner,
      group: action.group,
      content: '(a credential, never read into a HostState)',
      mtimeMs: EARLIER,
    };
  }
  return markNonEmpty({ ...host, entries });
}

/**
 * RUN THE THING UNTIL IT STOPS CHANGING — and report how many applies that took.
 *
 * Two is the honest answer and the fixture asserts it: the first run cannot generate the
 * htpasswd because the operator's password file is not on the host yet, and the second one
 * can. A third would mean something in the plan is not idempotent.
 */
function settle(decl: Declaration, start: HostState = bareHost()): { host: HostState; rounds: number } {
  let host = start;
  for (let round = 1; round <= 5; round++) {
    const actions = plan(decl.layout, decl.manifest, host);
    if (actions.length === 0) return { host, rounds: round - 1 };
    host = placeOperatorFiles(simulate(host, actions), actions);
  }
  throw new Error('the plan never settled in five applies');
}

function planFor(decl: Declaration, host: HostState): Action[] {
  return plan(decl.layout, decl.manifest, host);
}

function files(actions: readonly Action[]): FileAction[] {
  return actions.filter((action): action is FileAction => action.kind === 'file');
}

function fileAt(actions: readonly Action[], path: string): FileAction | undefined {
  return files(actions).find(action => action.path === path);
}

function execSteps(actions: readonly Action[]): string[] {
  return actions.filter(action => action.kind === 'exec').map(action => action.step);
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * 1. Identities — defect 3, made unwritable
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('identities', () => {
  test('the group is created BEFORE the user that names it', () => {
    const decl = declare();
    const actions = planFor(decl, bareHost());
    const groupIndex = actions.findIndex(action => action.kind === 'group');
    const userIndex = actions.findIndex(action => action.kind === 'user');

    expect(groupIndex).toBeGreaterThanOrEqual(0);
    expect(userIndex).toBeGreaterThanOrEqual(0);
    expect(groupIndex).toBeLessThan(userIndex);
  });

  test('no useradd is ever planned without --gid naming the instance group', () => {
    // Over the whole matrix, not one host: the interesting case is the host where the
    // group already exists and only the user is created — precisely the state in which
    // `useradd` with no `--gid` would have looked fine.
    const decl = declare();
    const hosts: HostState[] = [
      bareHost(),
      { ...bareHost(), groups: [decl.layout.identity.group] },
      { ...bareHost(), users: ['someone-else'], groups: ['unrelated'] },
    ];
    for (const host of hosts) {
      for (const action of planFor(decl, host)) {
        if (action.kind !== 'user') continue;
        const gid = action.argv.indexOf('--gid');
        expect(gid).toBeGreaterThan(0);
        expect(action.argv[gid + 1]).toBe(decl.layout.identity.group);
        expect(action.group).toBe(decl.layout.identity.group);
      }
    }
  });

  test('an existing identity is left alone — no usermod, no groupmod, no second useradd', () => {
    const decl = declare();
    const host: HostState = {
      ...bareHost(),
      users: [decl.layout.identity.user],
      groups: [decl.layout.identity.group],
    };
    const actions = planFor(decl, host);
    expect(actions.some(action => action.kind === 'user' || action.kind === 'group')).toBe(false);
  });

  test('an ADOPTED identity still gets its group when the host lacks one', () => {
    // The declaration names a user that already exists and a group that does not — the
    // shape a hand-built install arrives in, and the one where the unit's Group= is a boot
    // failure waiting to happen.
    const decl = declare(docWith({ identity: { user: 'legacy-builder', group: 'legacy-builder' } }));
    const host: HostState = { ...bareHost(), users: ['legacy-builder'], groups: [] };
    const actions = planFor(decl, host);
    const group = actions.find(action => action.kind === 'group');
    expect(group?.kind === 'group' && group.name).toBe('legacy-builder');
    expect(actions.some(action => action.kind === 'user')).toBe(false);
  });

  test("the useradd points HOME at the layout's agent home and creates nothing there", () => {
    const decl = declare();
    const user = planFor(decl, bareHost()).find(action => action.kind === 'user');
    expect(user?.kind).toBe('user');
    if (user?.kind !== 'user') return;
    expect(user.home).toBe(decl.layout.roots.home);
    expect(user.argv).toContain('--no-create-home');
    expect(user.argv).toContain('--system');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 2. The tree — every writable path, and every matrix row
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the tree', () => {
  test('every ReadWritePaths= entry gets a directory action', () => {
    // Asserted over a declaration whose roots have been moved OFF the defaults and whose
    // second site lives outside the webspace base, because naming the base instead of the
    // sites is exactly the shortcut that produced the original EROFS.
    const decl = declare(
      docWith({
        roots: { audit: '/srv/audit/gate', workspaces: '/data/gate/workspaces' },
        webspace_base: '/srv/www',
        sites: [
          { slug: 'one', domain: 'one.example.org' },
          { slug: 'two', domain: 'two.example.org', webspace: '/srv/legacy/two' },
        ],
      }),
    );
    const dirs = new Set(
      planFor(decl, bareHost())
        .filter(action => action.kind === 'dir')
        .map(action => action.path),
    );
    for (const writable of readWritePaths(decl.layout)) {
      expect(dirs.has(writable)).toBe(true);
    }
  });

  test('every directory row of the matrix is planned with its own owner, group and mode', () => {
    const decl = declare();
    const actions = planFor(decl, bareHost());
    const byPath = new Map(
      actions.filter(action => action.kind === 'dir').map(action => [action.path, action]),
    );

    const expected: [string, ModeKey][] = [
      [decl.layout.configDir, 'configDir'],
      [decl.layout.secretsDir, 'secretsDir'],
      [decl.layout.stateDir, 'stateDir'],
      [decl.layout.roots.workspaces, 'workspaces'],
      [decl.layout.roots.home, 'home'],
      [decl.layout.roots.audit, 'auditDir'],
      [decl.layout.runtimeDir, 'runtimeDir'],
      [decl.layout.sites[0]!.webspace, 'webspace'],
      [decl.layout.sites[0]!.releasesDir('preprod'), 'releases'],
      [decl.layout.sites[0]!.releasesDir('prod'), 'releases'],
    ];

    for (const [path, modeKey] of expected) {
      const action = byPath.get(path);
      expect(action?.kind).toBe('dir');
      if (action?.kind !== 'dir') continue;
      expect(action.modeKey).toBe(modeKey);
      expect(action.mode).toBe(MODES[modeKey].mode);
      expect(action.changes).toContain('create');
    }
  });

  test('the release STORE itself is planned, not left to an implicit mkdir -p', () => {
    // `.releases` created as a side effect of `mkdir -p .releases/web` would be 0755
    // root:root: no setgid, so every release the daemon writes carries the wrong group and
    // the web server 403s on a site that published successfully.
    const decl = declare();
    const store = decl.layout.sites[0]!.releasesDir('prod').replace(/\/[^/]+$/, '');
    const action = planFor(decl, bareHost()).find(a => a.kind === 'dir' && a.path === store);
    expect(action?.kind).toBe('dir');
    if (action?.kind !== 'dir') return;
    expect(action.mode).toBe(MODES.releases.mode);
    expect(action.mode & 0o2000).toBe(0o2000); // setgid, compared as a bit and not a word
  });

  test('the webspace keeps its setgid bit and its closed world bits', () => {
    const decl = declare();
    const action = planFor(decl, bareHost()).find(
      a => a.kind === 'dir' && a.path === decl.layout.sites[0]!.webspace,
    );
    if (action?.kind !== 'dir') throw new Error('no webspace action');
    expect(action.mode).toBe(0o2750);
    expect(action.owner).toBe(decl.layout.identity.user);
    expect(action.group).toBe(decl.layout.identity.webGroup);
  });

  test('a directory that is already right produces NO action, and a drifted mode produces one', () => {
    const decl = declare();
    const path = decl.layout.roots.home;
    const correct: PathObservation = {
      type: 'dir',
      mode: MODES.home.mode,
      owner: decl.layout.identity.user,
      group: decl.layout.identity.group,
      empty: true,
    };
    const rightHost = withEntries(bareHost(), { [path]: correct });
    expect(planFor(decl, rightHost).some(a => a.kind === 'dir' && a.path === path)).toBe(false);

    const looseHost = withEntries(bareHost(), { [path]: { ...correct, mode: 0o755 } });
    const drifted = planFor(decl, looseHost).find(a => a.kind === 'dir' && a.path === path);
    expect(drifted?.kind === 'dir' && drifted.changes).toEqual(['mode']);
  });

  test('a FILE where a root must be is refused, and nothing is planned', () => {
    const decl = declare();
    const host = withEntries(bareHost(), {
      [decl.layout.roots.workspaces]: { type: 'file', mode: 0o644, owner: 'root', group: 'root' },
    });
    expect(() => planFor(decl, host)).toThrow(/must be a directory/);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 3. The marker law (§5)
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the marker law', () => {
  const marked = (layout: InstanceLayout) => [
    layout.roots.workspaces,
    layout.roots.home,
    layout.roots.audit,
    ...layout.sites.map(site => site.webspace),
  ];

  test('every root is planted with a marker naming this instance and nothing else', () => {
    const decl = declare();
    const actions = planFor(decl, bareHost());
    for (const root of marked(decl.layout)) {
      const action = fileAt(actions, join(root, INSTANCE_MARKER));
      expect(action?.disposition).toBe('create');
      expect(action?.content).toEqual({
        source: 'literal',
        body: markerContent(decl.layout.instance),
      });
      // Root-owned: a claim the daemon could rewrite is not a claim.
      expect(action?.owner).toBe('root');
    }
  });

  test('a NON-EMPTY root that declares nothing is REFUSED by name', () => {
    const decl = declare();
    const root = decl.layout.roots.workspaces;
    const host = withEntries(bareHost(), {
      [root]: { type: 'dir', mode: MODES.workspaces.mode, owner: decl.layout.identity.user, group: decl.layout.identity.group, empty: false },
    });
    expect(() => planFor(decl, host)).toThrow(new RegExp(root));
    expect(() => planFor(decl, host)).toThrow(/no marker/);
  });

  test("a NON-EMPTY root marked for ANOTHER instance is refused, naming what it found", () => {
    const decl = declare();
    const root = decl.layout.sites[0]!.webspace;
    const host = withEntries(bareHost(), {
      [root]: { type: 'dir', mode: MODES.webspace.mode, owner: decl.layout.identity.user, group: decl.layout.identity.webGroup, empty: false },
      [join(root, INSTANCE_MARKER)]: { type: 'file', mode: 0o644, owner: 'root', group: 'root', content: markerContent('another-museum') },
    });
    expect(() => planFor(decl, host)).toThrow(/another-museum/);
  });

  test('an EMPTY unmarked root is adopted and marked — a clean host is not punished', () => {
    const decl = declare();
    const root = decl.layout.roots.audit;
    const host = withEntries(bareHost(), {
      [root]: { type: 'dir', mode: MODES.auditDir.mode, owner: 'root', group: decl.layout.identity.group, empty: true },
    });
    const actions = planFor(decl, host);
    expect(fileAt(actions, join(root, INSTANCE_MARKER))?.disposition).toBe('create');
  });

  test('the audit FILE is created once and never rewritten, whatever it holds', () => {
    const decl = declare();
    const created = fileAt(planFor(decl, bareHost()), decl.layout.auditFile);
    expect(created?.disposition).toBe('create');
    expect(created?.owner).toBe(decl.layout.identity.user);
    expect(created?.mode).toBe(MODES.auditFile.mode);

    // A log with lines in it. A "drifted" audit trail is a working one.
    const host = withEntries(bareHost(), {
      [decl.layout.auditFile]: {
        type: 'file',
        mode: MODES.auditFile.mode,
        owner: decl.layout.identity.user,
        group: decl.layout.identity.group,
        content: '{"event":"session.start"}\n',
      },
    });
    expect(fileAt(planFor(decl, host), decl.layout.auditFile)).toBeUndefined();
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 4. The served links
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the served links', () => {
  test('each surface gets a relative link into its own release store, owned by the daemon', () => {
    const decl = declare();
    const actions = planFor(decl, bareHost());
    const site = decl.layout.sites[0]!;
    for (const surface of SURFACES) {
      const link = actions.find(a => a.kind === 'symlink' && a.path === site.linkPath(surface));
      expect(link?.kind).toBe('symlink');
      if (link?.kind !== 'symlink') continue;
      expect(link.target.startsWith('/')).toBe(false); // relocatable, as promote.ts requires
      expect(join(site.webspace, link.target)).toBe(site.releasesDir(surface));
      // Link and target share an owner, or Apache's SymLinksIfOwnerMatch will not follow it.
      expect(link.owner).toBe(decl.layout.identity.user);
      expect(link.group).toBe(decl.layout.identity.webGroup);
    }
  });

  test('an EXISTING link is never re-pointed — a published site is not rolled back by a re-apply', () => {
    const decl = declare();
    const site = decl.layout.sites[0]!;
    const host = withEntries(bareHost(), {
      [site.linkPath('prod')]: {
        type: 'symlink',
        target: '.releases/web/20260829T101010101Z-000001',
        owner: decl.layout.identity.user,
        group: decl.layout.identity.webGroup,
      },
    });
    expect(planFor(decl, host).some(a => a.kind === 'symlink' && a.path === site.linkPath('prod'))).toBe(
      false,
    );
  });

  test('a DIRECTORY standing where a served link belongs is refused', () => {
    // promote.ts swaps the link with rename(2), which cannot replace a directory: every
    // publish would fail, at publish time, on a museum's site.
    const decl = declare();
    const site = decl.layout.sites[0]!;
    const host = withEntries(bareHost(), {
      [site.linkPath('preprod')]: { type: 'dir', mode: 0o755, owner: 'root', group: 'root', empty: true },
    });
    expect(() => planFor(decl, host)).toThrow(/must be a symlink/);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 5. Credentials — minted once, never rewritten, never printed
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('credentials', () => {
  test('the shared bearer is minted when absent, at the path the engine fragment names', () => {
    const decl = declare();
    const path = decl.layout.secretPath(SERVICE_TOKEN_KEY);
    const action = fileAt(planFor(decl, bareHost()), path);
    expect(action?.disposition).toBe('create');
    expect(action?.content.source).toBe('random');
    expect(action?.owner).toBe('root');
    expect(action?.group).toBe('root');
    expect(action?.mode).toBe(0o600);
    // The recipe is in the plan; the value never is, because plan() cannot draw one.
    expect(JSON.stringify(action)).not.toMatch(/[A-Za-z0-9_-]{32,}/);
  });

  test("a declaration that names its own SERVICE_TOKEN file is minted THERE, not twice", () => {
    const pinned = '/etc/creds/gate/SERVICE_TOKEN';
    const decl = declare(docWith({ secrets: { SERVICE_TOKEN: pinned } }));
    const minted = files(planFor(decl, bareHost())).filter(a => a.content.source === 'random');
    expect(minted).toHaveLength(1);
    expect(minted[0]!.path).toBe(pinned);
  });

  test('a declared credential the provisioner cannot invent is AWAITING, not created', () => {
    const decl = declare(docWith({ secrets: { ANTHROPIC_API_KEY: '/etc/creds/ANTHROPIC_API_KEY' } }));
    const action = fileAt(planFor(decl, bareHost()), '/etc/creds/ANTHROPIC_API_KEY');
    expect(action?.disposition).toBe('awaiting');
    expect(action?.content).toEqual({ source: 'operator' });
    expect(changesTheHost(action!)).toBe(false);
  });

  test('a credential is NEVER planned for rewrite, on any host state', () => {
    const decl = declare(docWith({ secrets: { ANTHROPIC_API_KEY: '/etc/creds/ANTHROPIC_API_KEY' } }));
    const secretPaths = new Set([
      decl.layout.secretPath(SERVICE_TOKEN_KEY),
      '/etc/creds/ANTHROPIC_API_KEY',
      '/etc/creds/PREPROD_PASSWORD',
    ]);
    const hosts: HostState[] = [
      bareHost(),
      settle(decl).host,
      // Present, but with the modes an operator left behind: still never a content rewrite.
      withEntries(bareHost(), {
        [decl.layout.secretPath(SERVICE_TOKEN_KEY)]: {
          type: 'file',
          mode: 0o644,
          owner: 'root',
          group: 'staff',
          content: '(opaque)',
        },
      }),
    ];
    for (const host of hosts) {
      for (const action of files(planFor(decl, host))) {
        if (!secretPaths.has(action.path)) continue;
        expect(action.disposition).not.toBe('rewrite');
        expect(action.content.source).not.toBe('literal');
      }
    }
  });

  test('a credential inside the provisioner\'s own directory has its access re-asserted', () => {
    const decl = declare();
    const path = decl.layout.secretPath(SERVICE_TOKEN_KEY);
    const host = withEntries(bareHost(), {
      [path]: { type: 'file', mode: 0o644, owner: 'root', group: 'root', content: '(opaque)' },
    });
    const action = fileAt(planFor(decl, host), path);
    expect(action?.disposition).toBe('metadata');
    expect(action?.mode).toBe(0o600);
  });

  test("a credential the operator placed OUTSIDE the instance's directories is not chowned", () => {
    // The provisioner asserts modes on the tree it derives. Re-owning a file somewhere else
    // on the host to root:root 0600 would break whatever else was reading it.
    const decl = declare(docWith({ secrets: { ANTHROPIC_API_KEY: '/opt/shared/ANTHROPIC_API_KEY' } }));
    const host = withEntries(bareHost(), {
      '/opt/shared/ANTHROPIC_API_KEY': {
        type: 'file',
        mode: 0o640,
        owner: 'ops',
        group: 'ops',
        content: '(opaque)',
      },
    });
    expect(fileAt(planFor(decl, host), '/opt/shared/ANTHROPIC_API_KEY')).toBeUndefined();
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 6. The rendered artifacts and their drift
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('rendered artifacts', () => {
  test('every artifact renderAll produces is planned, with the access the renderer resolved', () => {
    const decl = declare();
    const actions = planFor(decl, bareHost());
    for (const rendered of renderAll(decl.layout, decl.manifest)) {
      const action = fileAt(actions, rendered.path);
      expect(action?.disposition).toBe('create');
      expect(action?.content).toEqual({ source: 'literal', body: rendered.body });
      expect(action?.owner).toBe(rendered.owner);
      expect(action?.group).toBe(rendered.group);
      expect(action?.mode).toBe(rendered.mode);
      expect(action?.artifactKind).toBe(rendered.kind);
    }
  });

  test("the plan's own owner/mode resolution agrees with the renderer's, row by row", () => {
    // `plan.ts` resolves a MODES row to names in two lines that `render/types.ts` also has,
    // privately. Until that helper is shared, this is what keeps the two copies honest: for
    // EVERY row of the matrix, the plan's answer must equal `artifact()`'s.
    const decl = declare();
    const actions = planFor(decl, bareHost());
    const seen = new Map<ModeKey, { owner: string; group: string; mode: number }>();
    for (const action of actions) {
      if (action.kind === 'dir') seen.set(action.modeKey, action);
      if (action.kind === 'file' && action.modeKey) seen.set(action.modeKey, action);
    }
    expect(seen.size).toBeGreaterThan(5);
    for (const [modeKey, resolved] of seen) {
      const reference = artifact(decl.layout, { kind: 'unit', path: '/tmp/x', mode: modeKey, body: '' });
      expect({ owner: resolved.owner, group: resolved.group, mode: resolved.mode }).toEqual({
        owner: reference.owner,
        group: reference.group,
        mode: reference.mode,
      });
    }
  });

  test('a hand-edited artifact is a REWRITE, named as a hand edit', () => {
    const decl = declare();
    const { host } = settle(decl);
    const unit = host.entries[decl.layout.unitPath]!;
    const edited = withEntries(host, {
      [decl.layout.unitPath]: { ...unit, content: `${unit.content}\n# somebody's local fix\n` },
    });
    const action = fileAt(planFor(decl, edited), decl.layout.unitPath);
    expect(action?.disposition).toBe('rewrite');
    expect(action?.drift).toBe('hand_edited');
    expect(action?.reason).toMatch(/REVERTED/);
  });

  test('an artifact stamped for ANOTHER instance is reported as foreign, not as stale', () => {
    const decl = declare();
    const { host } = settle(decl);
    const foreign = stamp('unit', 'another-museum', '# some other museum\n');
    const action = fileAt(
      planFor(decl, withEntries(host, {
        [decl.layout.unitPath]: { ...host.entries[decl.layout.unitPath]!, content: foreign },
      })),
      decl.layout.unitPath,
    );
    expect(action?.drift).toBe('foreign');
  });

  test('a file with no stamp at all is reported as unstamped', () => {
    const decl = declare();
    const { host } = settle(decl);
    const action = fileAt(
      planFor(decl, withEntries(host, {
        [decl.layout.envFile]: { ...host.entries[decl.layout.envFile]!, content: 'PORT=1\n' },
      })),
      decl.layout.envFile,
    );
    expect(action?.drift).toBe('unstamped');
  });

  test('a changed DECLARATION makes the artifact stale, not hand-edited', () => {
    const before = declare();
    const { host } = settle(before);
    const after = declare(docWith({ resources: { memory_max: '8G' } }));
    const action = fileAt(planFor(after, host), after.layout.unitPath);
    expect(action?.disposition).toBe('rewrite');
    expect(action?.drift).toBe('stale');
  });

  test('an artifact whose bytes are right but whose access is not is METADATA, not a rewrite', () => {
    const decl = declare();
    const { host } = settle(decl);
    const env = host.entries[decl.layout.envFile]!;
    const action = fileAt(
      planFor(decl, withEntries(host, { [decl.layout.envFile]: { ...env, mode: 0o644 } })),
      decl.layout.envFile,
    );
    expect(action?.disposition).toBe('metadata');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 7. The preprod password file
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the preprod password file', () => {
  test('it is not generated until every reviewer password is on the host', () => {
    const decl = declare();
    const first = planFor(decl, bareHost());
    expect(fileAt(first, decl.layout.htpasswd)).toBeUndefined();
    expect(fileAt(first, '/etc/creds/PREPROD_PASSWORD')?.disposition).toBe('awaiting');
  });

  test('it is generated from the password FILES, and carries no password and no hash', () => {
    const decl = declare();
    const host = placeOperatorFiles(bareHost(), planFor(decl, bareHost()));
    const action = fileAt(planFor(decl, host), decl.layout.htpasswd);
    expect(action?.disposition).toBe('create');
    expect(action?.content).toEqual({
      source: 'htpasswd',
      users: [{ name: 'preview', passwordFile: '/etc/creds/PREPROD_PASSWORD' }],
    });
    expect(action?.group).toBe(decl.layout.identity.webGroup);
    expect(action?.mode).toBe(MODES.htpasswd.mode);
  });

  test('a settled file is not re-hashed — a salted bcrypt would drift on every single run', () => {
    const decl = declare();
    const { host } = settle(decl);
    expect(fileAt(planFor(decl, host), decl.layout.htpasswd)).toBeUndefined();
  });

  test('adding a reviewer rewrites it; the reason names the declared set', () => {
    const decl = declare();
    const { host } = settle(decl);
    const grown = declare(
      docWith({
        serving: {
          ...baseDoc().serving,
          preprod: {
            enabled: true,
            auth: {
              mode: 'htpasswd',
              users: [
                { name: 'preview', password_file: '/etc/creds/PREPROD_PASSWORD' },
                { name: 'curator', password_file: '/etc/creds/CURATOR_PASSWORD' },
              ],
            },
          },
        },
      }),
    );
    const withPasswords = withEntries(host, {
      '/etc/creds/CURATOR_PASSWORD': { type: 'file', mode: 0o600, owner: 'root', group: 'root', content: '(opaque)', mtimeMs: EARLIER },
    });
    const action = fileAt(planFor(grown, withPasswords), grown.layout.htpasswd);
    expect(action?.disposition).toBe('rewrite');
    expect(action?.reason).toMatch(/curator/);
  });

  test('a ROTATED password rewrites it — a newer password file than the hash', () => {
    const decl = declare();
    const { host } = settle(decl);
    const rotated = withEntries(host, {
      '/etc/creds/PREPROD_PASSWORD': {
        ...host.entries['/etc/creds/PREPROD_PASSWORD']!,
        mtimeMs: NOW + 60_000,
      },
    });
    const action = fileAt(planFor(decl, rotated), decl.layout.htpasswd);
    expect(action?.disposition).toBe('rewrite');
    expect(action?.reason).toMatch(/rotated/);
  });

  test('preprod turned off plans no password file at all', () => {
    const decl = declare(
      docWith({
        serving: { ...baseDoc().serving, preprod: { enabled: false, auth: { mode: 'none' } } },
      }),
    );
    expect(fileAt(planFor(decl, bareHost()), decl.layout.htpasswd)).toBeUndefined();
  });

  test("an adopted declaration that pins a password file and declares no reviewers waits for it", () => {
    const decl = declare(
      docWith({
        serving: {
          ...baseDoc().serving,
          preprod: {
            enabled: true,
            auth: { mode: 'htpasswd', htpasswd: '/etc/legacy/preprod.htpasswd' },
          },
        },
      }),
    );
    const action = fileAt(planFor(decl, bareHost()), '/etc/legacy/preprod.htpasswd');
    expect(action?.disposition).toBe('awaiting');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 8. systemd and the web server — ordering, and only on a real change
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('systemd and the web server', () => {
  test('a first run reloads systemd, enables and starts, tests the config and reloads — in that order', () => {
    const decl = declare();
    expect(execSteps(planFor(decl, bareHost()))).toEqual([
      'daemon_reload',
      'unit_enable',
      'unit_start',
      'web_configtest',
      'web_reload',
    ]);
  });

  test('daemon-reload happens ONLY when a unit body actually changed', () => {
    const decl = declare();
    const { host } = settle(decl);
    // A vhost drifted; the unit did not.
    const vhost = decl.layout.sites[0]!.vhostPaths.prod;
    const drifted = withEntries(host, {
      [vhost]: { ...host.entries[vhost]!, content: '# replaced by hand\n' },
    });
    const steps = execSteps(planFor(decl, drifted));
    expect(steps).not.toContain('daemon_reload');
    expect(steps).toEqual(['web_configtest', 'web_reload']);
  });

  test('the configuration test always stands immediately before the reload', () => {
    const decl = declare();
    for (const host of [bareHost(), settle(decl).host]) {
      const steps = execSteps(planFor(decl, host));
      const reload = steps.indexOf('web_reload');
      if (reload === -1) continue;
      expect(steps[reload - 1]).toBe('web_configtest');
    }
  });

  test('nothing is reloaded when no vhost changed', () => {
    const decl = declare();
    const { host } = settle(decl);
    const env = host.entries[decl.layout.envFile]!;
    const drifted = withEntries(host, { [decl.layout.envFile]: { ...env, content: '# gone\n' } });
    expect(execSteps(planFor(decl, drifted))).not.toContain('web_reload');
  });

  test('a rewritten env restarts the daemon, because it reads its environment once', () => {
    const decl = declare();
    const { host } = settle(decl);
    const env = host.entries[decl.layout.envFile]!;
    const drifted = withEntries(host, { [decl.layout.envFile]: { ...env, content: '# gone\n' } });
    const restart = planFor(decl, drifted).find(a => a.kind === 'exec' && a.step === 'unit_restart');
    expect(restart?.kind).toBe('exec');
    expect(restart?.reason).toMatch(/reads it once/);
  });

  test('an Apache host tests and reloads Apache, never nginx', () => {
    const decl = declare(docWith({ web: { server: 'apache', group: 'www-data' } }));
    const actions = planFor(decl, bareHost()).filter(a => a.kind === 'exec');
    const argv = actions.map(a => a.argv.join(' '));
    expect(argv).toContain('apachectl configtest');
    expect(argv.some(line => line.startsWith('nginx'))).toBe(false);
  });

  test('the observer may name the web server unit this distro actually uses', () => {
    const decl = declare(docWith({ web: { server: 'apache', group: 'apache' } }));
    const host = { ...bareHost(), webServerUnit: 'httpd' };
    const reload = planFor(decl, host).find(a => a.kind === 'exec' && a.step === 'web_reload');
    expect(reload?.kind === 'exec' && reload.argv).toEqual(['systemctl', 'reload', 'httpd']);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 8b. THE VHOSTS ARE ENABLED — the difference between a converged host and a served one
 *
 * Until 2026-08-30 this provisioner wrote every vhost into `sites-available/` and no action
 * anywhere linked it into `sites-enabled/`. On Debian — the documented target — a fully
 * converged, fully green provision therefore served NOTHING: nginx reads only the enabled
 * directory, and every gate in this file was green the whole time because every artifact
 * the subsystem knew about was in place.
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a rendered vhost is a served vhost', () => {
  /** Two sites, so the assertion is "one enable per vhost" and not "an enable exists". */
  function twoSites(): Declaration {
    return declare(
      docWith({
        sites: [
          { slug: 'one', domain: 'one.example.org' },
          { slug: 'two', domain: 'two.example.org' },
        ],
      }),
    );
  }

  test('a two-site instance plans one enabling link per vhost, and the configtest and reload still follow', () => {
    const decl = twoSites();
    const actions = planFor(decl, bareHost());

    const expected = decl.layout.sites
      .flatMap(site => SURFACES.map(surface => site.vhostEnabledPaths[surface]))
      .sort();
    expect(expected.length).toBe(4);

    const enables = actions.filter(
      (action): action is Extract<Action, { kind: 'symlink' }> =>
        action.kind === 'symlink' && expected.includes(action.path),
    );
    expect(
      enables.map(action => action.path).sort(),
      'every vhost this declaration renders must be linked into the directory the web ' +
        'server actually reads. A vhost in sites-available and nothing in sites-enabled is ' +
        'a museum whose domain answers the default host.',
    ).toEqual(expected);

    // The link names its own vhost, RELATIVELY, so the pair survives a chroot or a bind
    // mount — and it names the file for THIS site and surface, not just any of the four.
    for (const site of decl.layout.sites) {
      for (const surface of SURFACES) {
        const action = enables.find(entry => entry.path === site.vhostEnabledPaths[surface]);
        expect(action?.kind).toBe('symlink');
        const target = action?.kind === 'symlink' ? action.target : '';
        expect({ surface, absolute: target.startsWith('/') }).toEqual({ surface, absolute: false });
        expect(resolve(dirname(site.vhostEnabledPaths[surface]), target)).toBe(site.vhostPaths[surface]);
      }
    }

    // AND THE GATING SURVIVES: every enable stands before the configtest, which stands
    // immediately before the reload. A link created after the test would be served without
    // ever having been parsed.
    const steps = execSteps(actions);
    expect(steps.slice(-2)).toEqual(['web_configtest', 'web_reload']);
    const configtest = actions.findIndex(a => a.kind === 'exec' && a.step === 'web_configtest');
    for (const enable of enables) expect(actions.indexOf(enable)).toBeLessThan(configtest);
  });

  test('a host whose vhosts are settled but never enabled is repaired, and reloaded', () => {
    // The exact state the defect left behind on every host it ever provisioned: every
    // artifact correct, `check` reporting nothing to do, and the museum unserved.
    const decl = twoSites();
    const { host } = settle(decl);
    const unenabled = {
      ...host,
      entries: Object.fromEntries(
        Object.entries(host.entries).filter(
          ([path]) => !decl.layout.sites.some(site => SURFACES.some(s => site.vhostEnabledPaths[s] === path)),
        ),
      ),
    };

    const actions = planFor(decl, unenabled);
    expect(actions.filter(action => action.kind === 'symlink').length).toBe(4);
    // No vhost drifted, so the reload is justified by the enabling alone.
    expect(actions.some(action => action.kind === 'file' && action.artifactKind?.endsWith('vhost'))).toBe(false);
    expect(execSteps(actions)).toEqual(['web_configtest', 'web_reload']);
  });

  test('a settled host plans no enabling link at all — the second run is still empty', () => {
    const decl = twoSites();
    const { host } = settle(decl);
    expect(plan(decl.layout, decl.manifest, host)).toEqual([]);
  });

  test('a host that includes its vhost directory directly needs no enabling step', () => {
    // RHEL's conf.d: the two directories are ONE, and writing the file IS enabling it.
    const decl = declare(
      docWith({ paths: { vhost_dir: '/etc/nginx/conf.d', vhost_enabled_dir: '/etc/nginx/conf.d' } }),
    );
    expect(decl.layout.sites[0]!.vhostEnabledPaths.prod).toBe(decl.layout.sites[0]!.vhostPaths.prod);
    expect(planFor(decl, bareHost()).filter(action => action.kind === 'symlink' && action.phase === 'web')).toEqual([]);
    // …and it is still tested and reloaded, because the file itself is the configuration.
    expect(execSteps(planFor(decl, bareHost())).slice(-2)).toEqual(['web_configtest', 'web_reload']);
  });

  test('a COPY of a vhost standing where the link belongs refuses the whole instance', () => {
    const decl = declare();
    const path = decl.layout.sites[0]!.vhostEnabledPaths.prod;
    const host = withEntries(bareHost(), {
      [path]: { type: 'file', mode: 0o644, owner: 'root', group: 'root', content: '# hand-copied\n' },
    });
    expect(() => plan(decl.layout, decl.manifest, host)).toThrow(/is a file on this host/);
  });

  test('a link pointing at somebody else’s configuration is never re-pointed', () => {
    const decl = declare();
    const path = decl.layout.sites[0]!.vhostEnabledPaths.preprod;
    const host = withEntries(bareHost(), {
      [path]: { type: 'symlink', target: '../sites-available/somebody-else.conf', owner: 'root', group: 'root' },
    });
    expect(() => plan(decl.layout, decl.manifest, host)).toThrow(/points at/);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 8c. A SITE THE DECLARATION DROPPED IS STILL BEING SERVED
 *
 * Deleting a site from `sites[]` un-declares it and nothing else: its two vhosts stay on the
 * host, stay enabled, and stay pointed at a webspace holding every release. Every signal the
 * provisioner gives says otherwise — the row leaves `sites.json`, `check` says "converged" —
 * which is what makes it dangerous rather than merely incomplete.
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('vhosts the declaration used to carry', () => {
  /** A host settled on TWO sites, then a declaration that carries only one. */
  function afterDropping(): { decl: Declaration; host: HostState } {
    const two = declare(
      docWith({
        sites: [
          { slug: 'one', domain: 'one.example.org' },
          { slug: 'two', domain: 'two.example.org' },
        ],
      }),
    );
    const { host } = settle(two);
    // What the real observer reports: the NAMES in the two vhost directories.
    const listed = withEntries(host, {}) as HostState;
    const names = (dir: string): string[] =>
      Object.keys(host.entries)
        .filter(path => dirname(path) === dir)
        .map(path => path.slice(dir.length + 1));
    const withListing: HostState = {
      ...listed,
      vhostDirEntries: {
        [two.layout.vhostDir]: names(two.layout.vhostDir),
        [two.layout.vhostEnabledDir]: names(two.layout.vhostEnabledDir),
      },
    };
    return {
      decl: declare(docWith({ sites: [{ slug: 'one', domain: 'one.example.org' }] })),
      host: withListing,
    };
  }

  test('the dropped site’s vhosts are named, and the enabled one is called out', () => {
    const { decl, host } = afterDropping();
    const orphans = orphanedVhosts(decl.layout, host);
    expect(orphans.map(orphan => orphan.path.replace(/^.*\//, '')).sort()).toEqual([
      'dedalo-site-gate-two-pre.conf',
      'dedalo-site-gate-two-pre.conf',
      'dedalo-site-gate-two.conf',
      'dedalo-site-gate-two.conf',
    ]);
    // Two of the four are the LINKS: the museum is still being served from them.
    expect(orphans.filter(orphan => orphan.enabled).length).toBe(2);
  });

  test('…while the plan itself reports the host as converged', () => {
    // The whole reason this is a separate question. Once the drop has been applied, every
    // artifact matches, nothing drifts, and `check` says there is nothing to do — with the
    // site still on the internet.
    const { decl, host } = afterDropping();
    const settled = settle(decl, host).host;
    expect(plan(decl.layout, decl.manifest, settled).filter(changesTheHost)).toEqual([]);
    // And it is STILL reported, on that hundredth run as on the first: the answer is read
    // off the directories, not out of a site table this run rewrote.
    expect(orphanedVhosts(decl.layout, settled).length).toBe(4);
  });

  test('a declaration that carries every site reports nothing', () => {
    const decl = declare();
    const { host } = settle(decl);
    const dir = decl.layout.vhostDir;
    const enabled = decl.layout.vhostEnabledDir;
    const listing: HostState = {
      ...host,
      vhostDirEntries: {
        [dir]: decl.layout.sites.flatMap(site => SURFACES.map(s => basename(site.vhostPaths[s]))),
        [enabled]: decl.layout.sites.flatMap(site => SURFACES.map(s => basename(site.vhostEnabledPaths[s]))),
      },
    };
    expect(orphanedVhosts(decl.layout, listing)).toEqual([]);
  });

  test('another museum’s vhosts, and the web server’s own, are never this instance’s to speak about', () => {
    const decl = declare();
    const { host } = settle(decl);
    const listing: HostState = {
      ...host,
      vhostDirEntries: {
        [decl.layout.vhostDir]: [
          'default',
          'dedalo-site-other-museum-coleccion.conf',
          ...decl.layout.sites.flatMap(site => SURFACES.map(s => basename(site.vhostPaths[s]))),
        ],
      },
    };
    expect(orphanedVhosts(decl.layout, listing)).toEqual([]);
  });

  test('an observer that did not list the directories reports nothing, and refuses nothing', () => {
    const decl = declare();
    expect(orphanedVhosts(decl.layout, bareHost())).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 9. Idempotence — P4, at the plan level
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('idempotence', () => {
  test('a settled host yields an EMPTY plan: no write, no reload, no daemon-reload', () => {
    const decl = declare();
    const { host, rounds } = settle(decl);
    expect(plan(decl.layout, decl.manifest, host)).toEqual([]);
    // Two applies and no more: the first cannot hash a password that is not on the host yet.
    expect(rounds).toBe(2);
  });

  test('the settled host of the COMMITTED example declaration is settled too', () => {
    const example = declare(
      JSON.parse(
        require('node:fs').readFileSync(
          join(import.meta.dir, '..', 'deploy', 'examples', 'instance.example.json'),
          'utf8',
        ),
      ),
    );
    const { host } = settle(example);
    expect(plan(example.layout, example.manifest, host).filter(changesTheHost)).toEqual([]);
  });

  test('observedPaths() names every path the plan consults — nothing is decided blind', () => {
    // If the observer's shopping list were one path short, the plan would believe that path
    // absent and re-create it forever. Narrowing a settled host to exactly the list must
    // therefore leave the plan empty.
    const decl = declare();
    const { host } = settle(decl);
    const allowed = new Set(observedPaths(decl.layout, decl.manifest));
    const narrowed: Record<string, PathObservation> = {};
    for (const [path, observation] of Object.entries(host.entries)) {
      if (allowed.has(path)) narrowed[path] = observation;
    }
    expect(plan(decl.layout, decl.manifest, { ...host, entries: narrowed })).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 10. The laws that hold over every plan
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('laws that hold over every plan', () => {
  /** The matrix: the states a provisioner is actually run against. */
  function matrix(): { name: string; decl: Declaration; host: HostState }[] {
    const plain = declare();
    const settled = settle(plain).host;
    const unit = settled.entries[plain.layout.unitPath]!;
    const apache = declare(docWith({ web: { server: 'apache', group: 'www-data' } }));
    const moved = declare(
      docWith({
        roots: { audit: '/srv/audit/gate' },
        webspace_base: '/srv/www',
        secrets: { ANTHROPIC_API_KEY: '/etc/creds/ANTHROPIC_API_KEY' },
        sites: [
          { slug: 'one', domain: 'one.example.org' },
          { slug: 'two', domain: 'two.example.org', webspace: '/srv/legacy/two' },
        ],
      }),
    );
    return [
      { name: 'nothing exists', decl: plain, host: bareHost() },
      { name: 'everything exists', decl: plain, host: settled },
      {
        name: 'partially drifted',
        decl: plain,
        host: withEntries(settled, {
          [plain.layout.unitPath]: { ...unit, content: `${unit.content}# edited\n` },
          [plain.layout.roots.home]: { ...settled.entries[plain.layout.roots.home]!, mode: 0o755 },
        }),
      },
      { name: 'apache, nothing exists', decl: apache, host: bareHost() },
      { name: 'moved roots and a second site', decl: moved, host: bareHost() },
      { name: 'identities already present', decl: plain, host: { ...bareHost(), users: [plain.layout.identity.user], groups: [plain.layout.identity.group] } },
    ];
  }

  test('the phases never go backwards', () => {
    for (const { name, decl, host } of matrix()) {
      const ranks = planFor(decl, host).map(action => PHASES.indexOf(action.phase));
      const sorted = [...ranks].sort((a, b) => a - b);
      expect({ name, ranks }).toEqual({ name, ranks: sorted });
    }
  });

  test('NOTHING in any plan deletes a user, a group or a path', () => {
    const destructive = /^(userdel|groupdel|deluser|delgroup|rm|rmdir|unlink|shred)$/;
    for (const { decl, host } of matrix()) {
      for (const action of planFor(decl, host)) {
        const argv = 'argv' in action ? action.argv : [];
        expect(argv.filter(word => destructive.test(word))).toEqual([]);
      }
    }
  });

  test('every path in every plan is absolute', () => {
    for (const { decl, host } of matrix()) {
      for (const action of planFor(decl, host)) {
        if ('path' in action) expect(action.path.startsWith('/')).toBe(true);
      }
    }
  });

  test('every action carries a reason a person can read', () => {
    for (const { decl, host } of matrix()) {
      for (const action of planFor(decl, host)) {
        expect(action.reason.length).toBeGreaterThan(15);
      }
    }
  });

  test('describe() prints no file body, and no value of any opaque file', () => {
    for (const { decl, host } of matrix()) {
      for (const action of planFor(decl, host)) {
        const line = describeAction(action);
        expect(line).toContain(action.reason);
        expect(line.includes('\n')).toBe(false);
        if (action.kind !== 'file') continue;
        if (action.content.source === 'literal' && action.content.body.length > 0) {
          // The bytes are never quoted — only their count.
          expect(line).not.toContain(action.content.body);
          expect(line).toMatch(/\d+ bytes/);
        }
        if (action.content.source === 'random') {
          expect(line).toMatch(/never printed/);
        }
      }
    }
  });

  test('the plan itself carries no credential value — only paths and recipes', () => {
    for (const { decl, host } of matrix()) {
      for (const action of files(planFor(decl, host))) {
        if (action.content.source === 'literal') continue; // rendered bytes, secret-free by law
        expect(JSON.stringify(action.content)).not.toContain('opaque');
        expect(Object.keys(action.content)).not.toContain('body');
      }
    }
  });

  test('a plan over a drifted host still contains only actions that change something', () => {
    for (const { decl, host } of matrix()) {
      for (const action of planFor(decl, host)) {
        if (action.kind === 'dir') expect(action.changes.length).toBeGreaterThan(0);
        if (action.kind === 'file' && action.disposition === 'awaiting') {
          expect(changesTheHost(action)).toBe(false);
        }
      }
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * A FAILED APPLY MUST NOT WEDGE THE INSTANCE.
 *
 * The markers used to be appended after EVERY directory action, so a root could be created
 * and then FILLED — a webspace gets its .releases/pre and .releases/web children in the same
 * phase — while still carrying no marker. An apply that died in that window (full disk,
 * killed run, failed chown) left a non-empty unmarked root, which §5's refusal then reads as
 * "another instance's tree" on every subsequent run. The museum could never be provisioned
 * again without deleting directories by hand on a live host.
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('every root is claimed before anything can be put in it', () => {
  test("each marked root's marker is planned before any action writes INSIDE that root", () => {
    const { manifest, layout } = declare();
    const actions = plan(layout, manifest, bareHost());

    const markedRoots = [
      layout.roots.workspaces,
      layout.roots.home,
      layout.roots.audit,
      ...layout.sites.map(site => site.webspace),
    ];

    for (const root of markedRoots) {
      const pathOf = (a: Action): string | undefined => ('path' in a ? a.path : undefined);
      const markerIndex = actions.findIndex(a => pathOf(a) === join(root, INSTANCE_MARKER));
      expect(markerIndex).toBeGreaterThanOrEqual(0);

      // Anything strictly inside the root, other than the marker itself.
      const firstInside = actions.findIndex(a => {
        const p = pathOf(a);
        return p !== undefined && p !== join(root, INSTANCE_MARKER) && isStrictlyWithin(p, root);
      });
      if (firstInside >= 0) {
        expect(markerIndex).toBeLessThan(firstInside);
      }
    }
  });

  test('the root directory itself is created immediately before its marker', () => {
    const { manifest, layout } = declare();
    const actions = plan(layout, manifest, bareHost());
    for (const root of [layout.roots.workspaces, ...layout.sites.map(s => s.webspace)]) {
      const dirIndex = actions.findIndex(a => a.kind === 'dir' && 'path' in a && a.path === root);
      const markerIndex = actions.findIndex(a => 'path' in a && a.path === join(root, INSTANCE_MARKER));
      expect(dirIndex).toBeGreaterThanOrEqual(0);
      expect(markerIndex).toBe(dirIndex + 1);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * THE PLAN'S OWN SAFETY CHECK
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * `assertPlanIsCoherent` IS the enforcement of never-reuse-a-uid and of the retired
 * installer's defect 3, and none of its refusals had ever been executed: a violating plan
 * cannot come out of `plan()`, so nothing in the suite could reach them. Measured before
 * this block existed — disarming the phase-order assertion, the `--gid` check, the
 * group-before-user check, the destructive-argv loop and the re-mint refusal each left the
 * suite at 699 pass / 0 fail. Breaking the PLAN instead does redden, which is what proves
 * the properties currently hold and leaves open the question of what holds them.
 *
 * So a REAL plan is built and then perturbed one rule at a time. The unperturbed plan is
 * asserted to pass first, so a refusal below can never be the perturbation machinery.
 */
describe('a plan that broke one of its own rules would be refused', () => {
  const decl = declare();
  /** A lawful plan of a fresh host — long enough to contain every action kind. */
  function lawfulPlan(): Action[] {
    return planFor(decl, bareHost());
  }

  test('the lawful plan passes — so every refusal below is the perturbation, not the fixture', () => {
    expect(() => assertPlanIsCoherent(lawfulPlan(), decl.layout)).not.toThrow();
  });

  test('phases that go BACKWARDS are refused, naming the order', () => {
    const actions = lawfulPlan();
    // The last action of the plan, moved to the front: a `web` step before `identity`.
    const last = actions[actions.length - 1] as Action;
    expect(PHASES.indexOf(last.phase)).toBeGreaterThan(0);
    const message = refusal(() => assertPlanIsCoherent([...actions.slice(0, -1), last, actions[0] as Action], decl.layout));
    expect(message).toContain('after a later phase had already begun');
    expect(message).toContain(PHASES.join(' → '));
  });

  test('an action carrying no known phase is refused rather than sorted somewhere', () => {
    const actions = lawfulPlan();
    const broken = { ...(actions[0] as Action), phase: 'invented' as never };
    expect(() => assertPlanIsCoherent([broken, ...actions.slice(1)], decl.layout)).toThrow(
      /carries no known phase/,
    );
  });

  test('a useradd with no --gid is refused — the trap the retired install.sh fell into', () => {
    const actions = lawfulPlan();
    const user = actions.find((action): action is UserAction => action.kind === 'user');
    expect(user).toBeDefined();
    const stripped = { ...(user as UserAction), argv: (user as UserAction).argv.filter(arg => arg !== '--gid') };
    const message = refusal(() =>
      assertPlanIsCoherent(actions.map(action => (action === user ? stripped : action)), decl.layout),
    );
    expect(message).toContain('carries no --gid');
    expect(message).toContain('Nothing was planned');
  });

  test('a user created BEFORE its primary group is refused — useradd --gid would fail', () => {
    const actions = lawfulPlan();
    const userIndex = actions.findIndex(action => action.kind === 'user');
    const user = actions[userIndex] as UserAction;
    const groupIndex = actions.findIndex(
      action => action.kind === 'group' && action.name === user.group,
    );
    expect(groupIndex).toBeGreaterThanOrEqual(0);
    expect(groupIndex).toBeLessThan(userIndex);

    // Swap them: same actions, same phases, only the order of the two is wrong.
    const swapped = [...actions];
    swapped[groupIndex] = user;
    swapped[userIndex] = actions[groupIndex] as Action;
    const message = refusal(() => assertPlanIsCoherent(swapped, decl.layout));
    expect(message).toContain('is created before its primary group');
  });

  test.each(['userdel', 'groupdel', 'deluser', 'delgroup', 'rm', 'rmdir', 'unlink', 'shred', 'mkfs'])(
    'a plan step that would run %s is refused — NOTHING in a plan deletes',
    binary => {
      // A uid freed by a deletion is a uid the next instance can be handed, and it inherits
      // every file the first one left behind.
      const actions = lawfulPlan();
      const exec = actions.find((action): action is ExecAction => action.kind === 'exec');
      expect(exec).toBeDefined();
      const destructive = { ...(exec as ExecAction), argv: [binary, '-rf', '/srv/webspaces/museum'] };
      const message = refusal(() =>
        assertPlanIsCoherent(actions.map(action => (action === exec ? destructive : action)), decl.layout),
      );
      expect(message).toContain('would delete something');
      expect(message).toContain('a reused uid inherits');
    },
  );

  test('a MINTED credential that would be rewritten rather than created is refused', () => {
    // A rotation is an operator act; a plan that could roll a token would break the pairing
    // on both sides of the socket at once.
    const actions = lawfulPlan();
    const minted = actions.find(
      (action): action is FileAction => action.kind === 'file' && action.content.source === 'random',
    );
    expect(minted).toBeDefined();
    expect((minted as FileAction).disposition).toBe('create');
    const rewritten = { ...(minted as FileAction), disposition: 'rewrite' as const };
    const message = refusal(() =>
      assertPlanIsCoherent(actions.map(action => (action === minted ? rewritten : action)), decl.layout),
    );
    expect(message).toContain('fresh random bytes');
    expect(message).toContain('minted once');
  });

  test('an AWAITING file that the provisioner could actually write is refused', () => {
    const actions = lawfulPlan();
    const writable = actions.find(
      (action): action is FileAction => action.kind === 'file' && action.content.source !== 'operator',
    );
    expect(writable).toBeDefined();
    const pretending = { ...(writable as FileAction), disposition: 'awaiting' as const };
    expect(() =>
      assertPlanIsCoherent(actions.map(action => (action === writable ? pretending : action)), decl.layout),
    ).toThrow(/marked awaiting but carries content/);
  });

  test('every refusal names the instance, because --all refuses ONE museum and carries on', () => {
    const actions = lawfulPlan();
    const broken = { ...(actions[0] as Action), phase: 'invented' as never };
    expect(refusal(() => assertPlanIsCoherent([broken, ...actions.slice(1)], decl.layout))).toContain(
      `plan(${decl.layout.instance})`,
    );
  });
});

/** The message of a call that must throw. */
function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected a refusal, got none');
}
