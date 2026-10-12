/**
 * S3-HOME — THE TURN'S HOME IS ROOT'S, AND ONLY `state/` IS THE IDENTITY'S (LEAD-1b §2.6a).
 *
 * Before: a turn ran with `HOME=<agentStateRoot>/s<k>/turn`, the site identity's own 0700
 * directory, kept across turns. git reads its GLOBAL configuration from there (`~/.gitconfig`,
 * `~/.config/git/config` — protected configuration, read AFTER the system file the turn unit
 * binds), Bun reads `~/.bunfig.toml`, opencode `~/.opencode` and `~/.config/opencode`. So one
 * turn's Write (or a build's postinstall that reaches it) could say `safe.bareRepository = all`
 * for every LATER turn of that site and reopen the repository the mask closes — the residual
 * `TURN_MASKED_REPOSITORY`'s header names "open, not closed here".
 *
 * After (the final design, held here as OUTCOMES):
 *
 *   H1. the turn unit's environment points the agent's config at root's read-only `.config` and
 *       its state under `state/`; the plan makes the HOME root 0755, `state/` the identity's
 *       0700, `.config/` root 0755; root renders `<home>/.gitconfig` (0644, the turn's git
 *       directives and nothing else);
 *   H2. every key the unit fixes is one the shim and the daemon refuse from a caller;
 *   H3. a HOME not in that shape is refused, typed and NAMED, at admission, at the run's open
 *       (nothing connects) and at boot — for that site alone;
 *   H4. an old-shape HOME is rebuilt by `provision apply`: daemon stopped, the identity proved
 *       idle, then a staged `turn.next` rebuild — never re-owned in place;
 *   H4b. ONE PREDICATE REFUSES AND REPAIRS: on the same host, the plan finds a problem exactly
 *       where the daemon refuses (every H3 defect, and not the control), and plans the rebuild
 *       for every kind of drift — not only an identity-owned HOME;
 *   H4c. the archive is `<agentStateRoot>/retired` (every unit masks it), and a rebuild whose
 *       HOME and archive are not one filesystem is refused with nothing moved;
 *   H5. the rebuild carries the CLI STATE by rename — an allowlist: the session transcripts, the
 *       account record, the login — follows no link, ARCHIVES everything else root-only
 *       (H5b: the CLI's settings, skills, agents), deletes nothing, and resumes after a crash;
 *   H6. under a declared `none` the HOME is fresh per run and the state persists.
 *
 * The paths, modes and keys are spelled HERE from the design's table — never imported from
 * the daemon — so a daemon constant that drifted cannot agree with itself and pass.
 */

import { afterEach, describe, expect, setSystemTime, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  lchmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as identityModule from '../src/drivers/agent_identity';
import {
  TURN_SYSTEM_GITCONFIG_DIRECTIVES,
  agentIdentityName,
  gitconfigDirectives,
  unitFixedEnvironment,
} from '../src/drivers/agent_identity';
import {
  assertConfinementAvailable,
  bootConfinementProblems,
  confineTurn,
  policyFromConfig,
  reconcileAgentUnits,
  runConfined,
  type ConfinedChild,
  type ConfinementPolicy,
} from '../src/drivers/confinement';
import { DOORS } from '../src/drivers/network_profile';
import { ConfinementUnavailableError } from '../src/errors';
import { isFixedEnvKey } from '../src/drivers/unit_frames';
import { apply, check, type PathFacts, type ProvisionIo } from '../src/provision/apply';
import { MODES, derive, type InstanceLayout, type InstanceManifest } from '../src/provision/layout';
import {
  agentPlan,
  assertPlanIsCoherent,
  observedPaths,
  plan,
  type Action,
  type HostState,
  type PathObservation,
} from '../src/provision/plan';
import * as planModule from '../src/provision/plan';
import { renderAll } from '../src/provision/render';
import { parseManifest } from '../src/provision/schema';
import { end, tryBegin } from '../src/workspace_activity';
import { type FakeAccount, fakeLedger, useraddAccount, usermodAccount } from './support/fake_accounts';
import { GATE_IDS, type GatePolicy, TURN_HOME_SKELETON_NAMES, lead1bPolicy } from './support/lead1b_host';
import { simulatedTurnHomeListings } from './support/turn_home_listing';
import { workspacePath } from './fixtures/instance';

const scratch: string[] = [];
const hosts: GatePolicy[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) {
    host.standIn.release();
    await host.standIn.close();
  }
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The design's table, spelled once here
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** The five keys S3-HOME adds to the turn unit, as a function of its HOME and state dir. */
function expectedTurnEnv(home: string, stateDir = join(home, 'state')): Record<string, string> {
  return {
    XDG_CONFIG_HOME: join(home, '.config'),
    CLAUDE_CONFIG_DIR: join(stateDir, 'claude'),
    XDG_DATA_HOME: join(stateDir, 'data'),
    XDG_STATE_HOME: join(stateDir, 'xdg-state'),
    XDG_CACHE_HOME: join(stateDir, 'cache'),
  };
}
const TURN_HOME_KEYS = Object.keys(expectedTurnEnv('/h'));

/**
 * WHAT A REBUILD CARRIES (the design's allowlist) — the CLI's STATE: its session transcripts, its
 * account record and its login, from a refused S3 HOME's `state/claude` or a pre-S3 HOME's
 * `.claude`/`.claude.json`. Never the CLI's whole directory (settings, hooks, skills, agents).
 */
const CARRY = [
  { from: 'state/claude/projects', to: 'state/claude/projects', type: 'dir' },
  { from: 'state/claude/.claude.json', to: 'state/claude/.claude.json', type: 'file' },
  { from: 'state/claude/.credentials.json', to: 'state/claude/.credentials.json', type: 'file' },
  { from: '.claude/projects', to: 'state/claude/projects', type: 'dir' },
  { from: '.claude.json', to: 'state/claude/.claude.json', type: 'file' },
  { from: '.claude/.credentials.json', to: 'state/claude/.credentials.json', type: 'file' },
];

/* ────────────────────────────────────────────────────────────────────────────────────
 * A declaration and a host, as the plan gate builds them (tests/provision_plan.test.ts)
 * ──────────────────────────────────────────────────────────────────────────────────── */

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
      preprod: { enabled: true, auth: { mode: 'htpasswd', users: [{ name: 'preview', password_file: '/etc/creds/PREPROD_PASSWORD' }] } },
      prod: { tls: { mode: 'none' } },
    },
    agent: { driver: 'claude_code', bins: { claude_code: '/usr/local/bin/claude' } },
  };
}

interface Declaration {
  readonly manifest: InstanceManifest;
  readonly layout: InstanceLayout;
}

function declare(doc: unknown = baseDoc()): Declaration {
  const manifest = parseManifest(doc, { source: 'the turn-home gate' });
  return { manifest, layout: derive(manifest) };
}

function bareHost(): HostState {
  return { users: [], groups: [], entries: {}, unitEnabled: false, unitActive: false };
}

/** A rebuild action, read loosely: its kind is the design's, and HEAD's type does not know it. */
type Rebuild = {
  kind: 'turn_home_rebuild';
  phase: string;
  k: number;
  home: string;
  staging: string;
  identity: string;
  group: string;
  retired: { dir: string; stem: string };
  carry: ReadonlyArray<{ from: string; to: string; type: string }>;
};
const rebuildsOf = (actions: readonly unknown[]): Rebuild[] =>
  actions.filter((action): action is Rebuild => (action as { kind?: string }).kind === 'turn_home_rebuild');

/** One apply, simulated — the plan gate's simulator, plus the rebuild the design adds. */
function simulate(host: HostState, actions: readonly Action[], layout: InstanceLayout): HostState {
  const entries: Record<string, PathObservation> = { ...host.entries };
  const users = [...host.users];
  const groups = [...host.groups];
  let unitEnabled = host.unitEnabled;
  let unitActive = host.unitActive;
  let htpasswdUsers = host.htpasswdUsers;
  let ledgerAccounts: FakeAccount[] = [...(host.agentLedger?.accounts ?? [])].map(account => ({
    ...useraddAccount(account.name, account.uid, account.gid, account.gecos),
    ...(account.retired ? { password: '!!', expire: '1' } : {}),
  }));
  const ledgerGroups = [...(host.agentLedger?.groups ?? [])].map(group => ({ ...group, members: [...group.members] }));
  const enabledSockets = new Set(host.enabledSockets ?? []);
  let nextId = 20_000 + ledgerAccounts.length + ledgerGroups.length;
  const groupNamed = (name: string) => {
    let group = ledgerGroups.find(entry => entry.name === name);
    if (!group) {
      group = { name, gid: nextId++, members: [] };
      ledgerGroups.push(group);
    }
    return group;
  };
  const flag = (argv: readonly string[], name: string) => {
    const at = argv.indexOf(name);
    return at >= 0 ? argv[at + 1] : undefined;
  };
  const dropTree = (root: string) => {
    for (const path of Object.keys(entries)) if (path === root || path.startsWith(`${root}/`)) delete entries[path];
  };
  const rebuiltHomes = new Set<string>();
  for (const action of actions as readonly any[]) {
    switch (action.kind) {
      case 'group':
        groups.push(action.name);
        groupNamed(action.name);
        break;
      case 'user':
        users.push(action.name);
        ledgerAccounts.push(useraddAccount(action.name, nextId++, groupNamed(action.group).gid, flag(action.argv, '--comment') ?? ''));
        if (action.supplementary) groupNamed(action.supplementary).members.push(action.name);
        break;
      case 'archive':
        dropTree(action.from);
        break;
      case 'unlink':
        delete entries[action.path];
        break;
      case 'dir':
        entries[action.path] = { type: 'dir', mode: action.mode, owner: action.owner, group: action.group, empty: true };
        break;
      case 'symlink':
        entries[action.path] = { type: 'symlink', target: action.target, owner: action.owner, group: action.group };
        break;
      case 'file': {
        if (action.disposition === 'awaiting') break;
        const previous = entries[action.path];
        const content = action.content.source === 'literal' ? action.content.body : (previous?.content ?? '(opaque)');
        if (action.content.source === 'htpasswd') htpasswdUsers = action.content.users.map((user: { name: string }) => user.name);
        entries[action.path] = { type: 'file', mode: action.mode, owner: action.owner, group: action.group, content, mtimeMs: 1 };
        break;
      }
      case 'turn_home_rebuild': {
        // The rebuilt HOME: the skeleton's directories (its `.gitconfig` is the artifact phase's).
        rebuiltHomes.add(action.home);
        dropTree(action.home);
        dropTree(action.staging);
        entries[action.home] = { type: 'dir', mode: 0o755, owner: 'root', group: 'root', empty: false };
        entries[join(action.home, 'state')] = { type: 'dir', mode: 0o700, owner: action.identity, group: action.group, empty: false };
        entries[join(action.home, '.config')] = { type: 'dir', mode: 0o755, owner: 'root', group: 'root', empty: true };
        break;
      }
      case 'exec':
        if (action.step === 'unit_enable') unitEnabled = true;
        if (action.step === 'unit_start' || action.step === 'unit_restart') unitActive = true;
        if (action.step === 'daemon_stop') unitActive = false;
        if (action.step === 'identity_membership') {
          const group = groupNamed(action.argv[3] as string);
          if (!group.members.includes(action.argv[2] as string)) group.members.push(action.argv[2] as string);
        }
        if (action.step === 'identity_lock') {
          const name = action.argv[action.argv.length - 1];
          ledgerAccounts = ledgerAccounts.map(entry => (entry.name === name ? usermodAccount(entry, action.argv) : entry));
        }
        if (action.step === 'agent_sockets_enable') for (const socket of action.argv.slice(3)) enabledSockets.add(socket);
        if (action.step === 'agent_tmpfiles_create') {
          for (const line of String(entries[action.argv[2] as string]?.content ?? '').split('\n')) {
            const [type, path, mode, owner, group] = line.trim().split(/\s+/);
            if (type !== 'd' || !path || !mode || !owner || !group) continue;
            entries[path] = { type: 'dir', mode: Number.parseInt(mode, 8), owner, group, empty: true };
          }
        }
        break;
    }
  }
  const marked: Record<string, PathObservation> = {};
  for (const [path, observation] of Object.entries(entries)) {
    marked[path] =
      observation.type === 'dir'
        ? { ...observation, empty: !Object.keys(entries).some(other => other !== path && other.startsWith(`${path}/`)) }
        : observation;
  }
  return {
    ...host,
    users,
    groups,
    entries: marked,
    // As `observeHost` lists them (a real turn-HOME dir with no listing is a planned problem).
    turnHomeEntries: simulatedTurnHomeListings(layout.agentStateRoot, marked, host.turnHomeEntries, rebuiltHomes),
    unitEnabled,
    unitActive,
    htpasswdUsers,
    agentLedger: fakeLedger(layout, ledgerAccounts, ledgerGroups),
    enabledSockets: [...enabledSockets],
  };
}

/** The operator places what only they can (the preprod password), as the plan gate does. */
function placeOperatorFiles(host: HostState, actions: readonly Action[]): HostState {
  const entries: Record<string, PathObservation> = { ...host.entries };
  for (const action of actions) {
    if (action.kind !== 'file' || action.disposition !== 'awaiting') continue;
    entries[action.path] = { type: 'file', mode: action.mode, owner: action.owner, group: action.group, content: '(a credential)', mtimeMs: 0 };
  }
  return { ...host, entries };
}

function settle(decl: Declaration, start: HostState = bareHost()): HostState {
  let host = start;
  for (let round = 1; round <= 6; round++) {
    const actions = plan(decl.layout, decl.manifest, host);
    if (actions.length === 0) return host;
    host = placeOperatorFiles(simulate(host, actions, decl.layout), actions);
  }
  throw new Error('the plan never settled in six applies');
}

/** Site one's paths on the gate declaration (k = 1: the first allocated ordinal). */
function turnPaths(layout: InstanceLayout, k = 1) {
  const site = join(layout.agentStateRoot, `s${k}`);
  const home = join(site, 'turn');
  return {
    site,
    home,
    state: join(home, 'state'),
    config: join(home, '.config'),
    gitconfig: join(home, '.gitconfig'),
    staging: join(site, 'turn.next'),
    build: join(site, 'build'),
    identity: agentIdentityName(layout.instance, k),
  };
}

const touchesTurn = (action: any, paths: ReturnType<typeof turnPaths>) =>
  [action.path, action.from, action.home].some(
    (path: unknown) => typeof path === 'string' && (path === paths.home || path.startsWith(`${paths.home}/`) || path === paths.staging),
  ) && !(action.kind === 'file' && action.path === paths.gitconfig);

/* ────────────────────────────────────────────────────────────────────────────────────
 * H1 — render and plan, fresh host
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('H1 — the turn HOME is root’s, rendered and planned so', () => {
  test('the turn unit fixes the five keys, exactly; XDG_CONFIG_HOME is root’s `.config`, never under state/', () => {
    const decl = declare();
    const { facts } = agentPlan(decl.layout, bareHost());
    const artifacts = renderAll(decl.layout, decl.manifest, facts);
    const paths = turnPaths(decl.layout);
    const template = artifacts.find(artifact => artifact.path.endsWith(`/${decl.layout.agentUnitPrefix}s1-turn@.service`));
    expect(template?.path ?? 'no turn template rendered').toContain('s1-turn@.service');
    const env: Record<string, string> = {};
    for (const line of (template?.body ?? '').split('\n')) {
      const match = /^Environment=([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
      if (match) env[match[1] as string] = match[2] as string;
    }
    const want = expectedTurnEnv(paths.home);
    expect(Object.fromEntries(TURN_HOME_KEYS.map(key => [key, env[key] ?? '(absent)']))).toEqual(want);
    expect(env.HOME).toBe(paths.home);
    expect((env.XDG_CONFIG_HOME ?? '').startsWith(`${paths.state}/`)).toBe(false);
    // The build door is unchanged: its HOME stays its identity's own, and it fixes none of the five.
    const build = artifacts.find(artifact => artifact.path.endsWith(`/${decl.layout.agentUnitPrefix}s1-build@.service`));
    for (const key of TURN_HOME_KEYS) expect({ key, build: (build?.body ?? '').includes(`Environment=${key}=`) }).toEqual({ key, build: false });
  });

  test('the plan makes the HOME root 0755, state/ the identity’s 0700, .config/ root 0755 — the build HOME stays the identity’s 0700', () => {
    const decl = declare();
    const paths = turnPaths(decl.layout);
    const dirs = new Map(
      plan(decl.layout, decl.manifest, bareHost())
        .filter(action => action.kind === 'dir')
        .map(action => [action.path, action] as const),
    );
    const row = (path: string) => {
      const action = dirs.get(path);
      return action?.kind === 'dir' ? { owner: action.owner, group: action.group, mode: action.mode.toString(8) } : 'not planned';
    };
    const identityGroup = dirs.get(paths.build)?.kind === 'dir' ? (dirs.get(paths.build) as { group: string }).group : '(no build HOME)';
    expect({
      home: row(paths.home),
      state: row(paths.state),
      config: row(paths.config),
      build: row(paths.build),
    }).toEqual({
      home: { owner: 'root', group: 'root', mode: '755' },
      state: { owner: paths.identity, group: identityGroup, mode: '700' },
      config: { owner: 'root', group: 'root', mode: '755' },
      build: { owner: paths.identity, group: identityGroup, mode: '700' },
    });
    // The matrix rows they come from (layout.ts MODES is the one source of an owner or a mode).
    const modes = MODES as unknown as Record<string, { owner: string; group: string; mode: number } | undefined>;
    expect({
      agentTurnHome: modes.agentTurnHome,
      agentTurnState: modes.agentTurnState,
      agentTurnConfig: modes.agentTurnConfig,
      agentHome: modes.agentHome,
    }).toEqual({
      agentTurnHome: { owner: 'root', group: 'root', mode: 0o755 },
      agentTurnState: { owner: 'identity', group: 'group', mode: 0o700 },
      agentTurnConfig: { owner: 'root', group: 'root', mode: 0o755 },
      agentHome: { owner: 'identity', group: 'group', mode: 0o700 },
    });
  });

  test('root renders <home>/.gitconfig: 0644 root:root, saying the turn’s git directives and nothing else', () => {
    const decl = declare();
    const { facts } = agentPlan(decl.layout, bareHost());
    const paths = turnPaths(decl.layout);
    const file = renderAll(decl.layout, decl.manifest, facts).find(artifact => artifact.path === paths.gitconfig);
    expect(file ? { owner: file.owner, group: file.group, mode: file.mode.toString(8) } : 'not rendered').toEqual({
      owner: 'root',
      group: 'root',
      mode: '644',
    });
    expect(gitconfigDirectives(file?.body ?? '')).toEqual([...TURN_SYSTEM_GITCONFIG_DIRECTIVES]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * H2 — every key the unit fixes is one nobody else may set
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('H2 — fixed-key totality', () => {
  test('for every door and ordinal, every key the unit fixes is a fixed key; the turn door fixes the five', () => {
    for (const door of DOORS) {
      for (const k of [1, 2, 999]) {
        const env = unitFixedEnvironment({ door, workspace: '/w/site', agentStateRoot: '/s', k });
        for (const key of Object.keys(env)) expect({ door, k, key, fixed: isFixedEnvKey(key) }).toEqual({ door, k, key, fixed: true });
      }
    }
    const turn = unitFixedEnvironment({ door: 'turn', workspace: '/w/site', agentStateRoot: '/s', k: 7 });
    expect(Object.fromEntries(TURN_HOME_KEYS.map(key => [key, (turn as Readonly<Record<string, string | undefined>>)[key] ?? '(absent)']))).toEqual(expectedTurnEnv('/s/s7/turn'));
    for (const key of TURN_HOME_KEYS) expect({ key, fixed: isFixedEnvKey(key) }).toEqual({ key, fixed: true });
  });

  test('a run handed one of the five is refused before anything connects — the unit’s value is the only one', async () => {
    const slug = 'site-fixedkey';
    const host = await lead1bPolicy({ identities: new Map([[slug, 1]]) });
    hosts.push(host);
    const ws = workspacePath(slug);
    rmSync(ws, { recursive: true, force: true });
    mkdirSync(join(ws, '.git'), { recursive: true });
    scratch.push(ws);
    for (const key of TURN_HOME_KEYS) {
      const before = host.standIn.connects.length;
      expect(tryBegin(slug, 'turn')).toBe(true);
      let refused: Error | null = null;
      try {
        await runConfined({ door: 'turn', slug, argv: ['true'], cwd: ws, env: { PATH: '/usr/bin:/bin', [key]: '/planted' }, timeoutMs: 5_000 }, host.policy);
      } catch (error) {
        refused = error as Error;
      } finally {
        end(slug, 'turn');
      }
      expect({ key, fixedKeyRefusal: /which the unit fixes/.test(String(refused?.message)) && String(refused?.message).includes(key), connects: host.standIn.connects.length - before }).toEqual({
        key,
        fixedKeyRefusal: true,
        connects: 0,
      });
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * H3 — a HOME not in that shape is refused at every door, for its site alone
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('H3 — the turn HOME’s shape is checked by conformance, at admission, at the open and at boot', () => {
  const A = 'site-home-a';
  const B = 'site-home-b';

  async function twoSites(): Promise<GatePolicy> {
    const host = await lead1bPolicy({ identities: new Map([[A, 1], [B, 2]]) });
    hosts.push(host);
    for (const slug of [A, B]) {
      const ws = workspacePath(slug);
      rmSync(ws, { recursive: true, force: true });
      mkdirSync(join(ws, '.git'), { recursive: true });
      scratch.push(ws);
    }
    return host;
  }

  async function open(host: GatePolicy, slug: string): Promise<{ typed: string | undefined; message: string; connects: number }> {
    const before = host.standIn.connects.length;
    expect(tryBegin(slug, 'turn')).toBe(true);
    let refused: unknown = null;
    try {
      await runConfined({ door: 'turn', slug, argv: ['true'], cwd: workspacePath(slug), env: { PATH: '/usr/bin:/bin' }, timeoutMs: 5_000 }, host.policy);
    } catch (error) {
      refused = error;
    } finally {
      end(slug, 'turn');
    }
    return { typed: (refused as Error | null)?.name, message: String((refused as Error | null)?.message ?? ''), connects: host.standIn.connects.length - before };
  }

  async function admit(host: GatePolicy, slug: string): Promise<{ typed: string | null; code: string | null; message: string }> {
    try {
      await assertConfinementAvailable('turn', host.policy, 'claude_code', slug);
      return { typed: null, code: null, message: '' };
    } catch (error) {
      return { typed: (error as Error).name, code: ((error as { code?: string }).code ?? null) as string | null, message: String((error as Error).message) };
    }
  }

  /** A refusal NAMES the path the way these refusals do — quoted — and is not some other refusal. */
  const names = (message: string, path: string) => message.includes(`'${path}'`) && !/Environment —/.test(message);

  test('control: a HOME in the skeleton’s shape admits, opens (one connect) and says nothing at boot', async () => {
    const host = await twoSites();
    expect(await admit(host, A)).toEqual({ typed: null, code: null, message: '' });
    const opened = await open(host, A);
    expect({ typed: opened.typed, connects: opened.connects }).toEqual({ typed: undefined, connects: 1 });
    expect(await bootConfinementProblems(host.policy)).toEqual([]);
  });

  const home = (host: GatePolicy, k = 1) => join(host.agentStateRoot, `s${k}`, 'turn');

  const DEFECTS: ReadonlyArray<readonly [string, (host: GatePolicy) => string]> = [
    ['the HOME owned by the identity', host => { host.turnHomeOwners.set(home(host), GATE_IDS.identityUid(1)); return home(host); }],
    ['the HOME 0775', host => { chmodSync(home(host), 0o775); return home(host); }],
    ['.gitconfig absent', host => { rmSync(join(home(host), '.gitconfig')); return join(home(host), '.gitconfig'); }],
    ['.gitconfig a link to a valid root file', host => {
      const file = join(home(host), '.gitconfig');
      const real = join(host.agentStateRoot, 'elsewhere.gitconfig');
      writeFileSync(real, readFileSync(file, 'utf8'), { mode: 0o644 });
      rmSync(file);
      symlinkSync(real, file);
      return file;
    }],
    ['.gitconfig saying bareRepository = all', host => {
      const file = join(home(host), '.gitconfig');
      writeFileSync(file, `${readFileSync(file, 'utf8')}[safe]\n\tbareRepository = all\n`);
      chmodSync(file, 0o644);
      return file;
    }],
    // The bytes are exactly the directives — only WHO may rewrite them is wrong: one turn of the
    // identity could then plant `safe.bareRepository=all` (git's GLOBAL layer) for every later turn.
    ['.gitconfig owned by the identity, its bytes correct', host => {
      host.turnHomeOwners.set(join(home(host), '.gitconfig'), GATE_IDS.identityUid(1));
      return join(home(host), '.gitconfig');
    }],
    ['.gitconfig 0664, its bytes correct', host => { chmodSync(join(home(host), '.gitconfig'), 0o664); return join(home(host), '.gitconfig'); }],
    ['.gitconfig 0646, its bytes correct', host => { chmodSync(join(home(host), '.gitconfig'), 0o646); return join(home(host), '.gitconfig'); }],
    ['.config/git present', host => { mkdirSync(join(home(host), '.config', 'git')); return join(home(host), '.config', 'git'); }],
    ['.config/opencode present', host => { mkdirSync(join(home(host), '.config', 'opencode')); return join(home(host), '.config', 'opencode'); }],
    ['a stray .bunfig.toml', host => { writeFileSync(join(home(host), '.bunfig.toml'), '[install]\n'); return join(home(host), '.bunfig.toml'); }],
    ['a stray .opencode', host => { mkdirSync(join(home(host), '.opencode')); return join(home(host), '.opencode'); }],
    ['a stray .node_modules', host => { mkdirSync(join(home(host), '.node_modules')); return join(home(host), '.node_modules'); }],
    ['state a link', host => {
      const state = join(home(host), 'state');
      renameSync(state, `${state}.real`);
      symlinkSync(`${state}.real`, state);
      return state;
    }],
    ['state 0750', host => { chmodSync(join(home(host), 'state'), 0o750); return join(home(host), 'state'); }],
    // A LINK is refused as a link, whatever it points at: here root's own, empty, 0755 directory —
    // every other check (owner, mode, the closed world) would pass through it.
    ['.config a link to an empty root directory', host => {
      const config = join(home(host), '.config');
      const real = join(host.agentStateRoot, 'elsewhere.config');
      mkdirSync(real, { mode: 0o755 });
      chmodSync(real, 0o755);
      rmSync(config, { recursive: true });
      symlinkSync(real, config);
      if (typeof (lchmodSync as unknown) === 'function') {
        try {
          lchmodSync(config, 0o755);
        } catch {
          // Linux has no lchmod: a link's own mode is 0777 there (and refused for its mode too).
        }
      }
      return config;
    }],
    ['state owned by another site’s identity', host => {
      host.turnHomeOwners.set(join(home(host), 'state'), GATE_IDS.identityUid(2));
      return join(home(host), 'state');
    }],
  ];

  /**
   * The host AS THE PROVISIONER'S OBSERVER SEES IT (`observeHost`'s shape): lstat facts by owner
   * NAME (the gate's lstat seam states the uid), a regular file's bytes, and the HOME's listings.
   */
  function observed(host: GatePolicy, k = 1): HostState {
    const lstat = host.policy.turnHomeSeams?.lstat as (path: string) => NonNullable<ReturnType<typeof lstatSync>> | null;
    const name = (uid: number) =>
      uid === host.policy.host.provisionerUid ? 'root' : uid === GATE_IDS.identityUid(k) ? agentIdentityName(host.facts.instance, k) : `uid${uid}`;
    const entries: Record<string, PathObservation> = {};
    const turnHomeEntries: Record<string, readonly string[]> = {};
    for (const rel of ['.', 'state', '.config', '.gitconfig']) {
      const path = rel === '.' ? home(host, k) : join(home(host, k), rel);
      const facts = lstat(path);
      if (!facts) continue;
      const type = facts.isSymbolicLink() ? 'symlink' : facts.isDirectory() ? 'dir' : facts.isFile() ? 'file' : 'other';
      entries[path] = {
        type,
        mode: Number(facts.mode) & 0o7777,
        owner: name(Number(facts.uid)),
        group: 'g',
        ...(type === 'file' ? { content: readFileSync(path, 'utf8') } : {}),
      } as PathObservation;
      if (type === 'dir' && (rel === '.' || rel === '.config')) turnHomeEntries[path] = readdirSync(path).sort();
    }
    return { ...bareHost(), entries, turnHomeEntries };
  }

  test('H4b — ONE PREDICATE: on the same host, the plan finds a problem exactly where the daemon refuses', async () => {
    const plannedProblems = (planModule as unknown as { plannedTurnHomeProblems?: (...args: unknown[]) => string[] }).plannedTurnHomeProblems;
    expect(typeof plannedProblems).toBe('function');
    const layoutOf = (host: GatePolicy) => ({ instance: host.facts.instance }) as InstanceLayout;
    // Control: the skeleton — the daemon admits, the plan sees nothing to repair.
    const healthy = await twoSites();
    expect((await admit(healthy, A)).typed).toBeNull();
    expect(plannedProblems?.(layoutOf(healthy), observed(healthy), 1, home(healthy))).toEqual([]);
    for (const [label, plant] of DEFECTS) {
      const host = await twoSites();
      plant(host);
      const refused = (await admit(host, A)).code === 'unit_nonconformant';
      const repaired = (plannedProblems?.(layoutOf(host), observed(host), 1, home(host)) ?? []).length > 0;
      expect({ label, refused, repaired }).toEqual({ label, refused: true, repaired: true });
    }
  });

  for (const [label, plant] of DEFECTS) {
    test(`${label}: refused, typed and named, at admission, at the open and at boot — site s1 only`, async () => {
      const host = await twoSites();
      const path = plant(host);
      const admission = await admit(host, A);
      expect({ label, typed: admission.typed, code: admission.code, named: names(admission.message, path) }).toEqual({
        label,
        typed: 'ConfinementRefusedError',
        code: 'unit_nonconformant',
        named: true,
      });
      const opened = await open(host, A);
      expect({ label, typed: opened.typed, named: names(opened.message, path), connects: opened.connects }).toEqual({
        label,
        typed: 'ConfinementRefusedError',
        named: true,
        connects: 0,
      });
      const boot = await bootConfinementProblems(host.policy);
      expect({
        label,
        said: boot.some(problem => problem.includes(`(s1) turn`) && names(problem, path)),
        onlyS1: boot.every(problem => problem.includes(`site '${A}' (s1)`)),
      }).toEqual({ label, said: true, onlyS1: true });
      // The healthy second site still opens: the check is per site, not host-wide.
      const other = await open(host, B);
      expect({ label, typed: other.typed, connects: other.connects }).toEqual({ label, typed: undefined, connects: 1 });
    });
  }

  // A directory of the closed world this process cannot LIST is a problem, never a pass. 0311 is
  // root's, not group/other-writable — every row check passes it — and its owner can lstat a child
  // (`x`) but not readdir (`r`): a stray planted before the chmod is invisible to the closed world.
  for (const rel of ['.', '.config'] as const) {
    test(`${rel === '.' ? 'the HOME' : '.config'} unlistable (0311, a stray inside): refused, naming it 'cannot be listed' — never admitted`, async () => {
      // Root reads any directory: the situation exists only for a non-root suite (CI: uid 1001).
      expect(process.getuid?.()).not.toBe(0);
      const host = await twoSites();
      const dir = rel === '.' ? home(host) : join(home(host), '.config');
      writeFileSync(join(dir, rel === '.' ? '.bunfig.toml' : 'stray'), '[install]\n');
      chmodSync(dir, 0o311);
      try {
        const admission = await admit(host, A);
        expect({ code: admission.code, said: admission.message.includes(`'${dir}' cannot be listed`) }).toEqual({ code: 'unit_nonconformant', said: true });
        const boot = await bootConfinementProblems(host.policy);
        expect(boot.some(problem => problem.includes(`'${dir}' cannot be listed`))).toBe(true);
      } finally {
        chmodSync(dir, 0o755);
      }
    });
  }
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * H4 — the migration, planned
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('H4 — an old-shape HOME is rebuilt by a staged, quiesced rebuild, never re-owned in place', () => {
  /** A settled host whose turn HOME is the pre-S3 shape: the identity’s own 0700, nothing in it observed. */
  function oldShapeHost(decl: Declaration): HostState {
    const settled = settle(decl);
    const paths = turnPaths(decl.layout);
    const entries: Record<string, PathObservation> = {};
    for (const [path, observation] of Object.entries(settled.entries)) {
      if (path === paths.home || path.startsWith(`${paths.home}/`) || path === paths.staging) continue;
      entries[path] = observation;
    }
    const build = settled.entries[paths.build];
    entries[paths.home] = { type: 'dir', owner: paths.identity, group: build?.group ?? decl.layout.identity.group, mode: 0o700, empty: false };
    return { ...settled, entries, unitActive: true };
  }

  test('the observer is asked about every skeleton path and the staging directory', () => {
    const decl = declare();
    const paths = turnPaths(decl.layout);
    const observed = new Set(observedPaths(decl.layout, decl.manifest, new Map([['one', 1]])));
    expect({
      state: observed.has(paths.state),
      config: observed.has(paths.config),
      gitconfig: observed.has(paths.gitconfig),
      staging: observed.has(paths.staging),
      archive: observed.has(join(decl.layout.agentStateRoot, 'retired')),
    }).toEqual({ state: true, config: true, gitconfig: true, staging: true, archive: true });
  });

  test('daemon_stop, then the identity proved idle, then turn_home_rebuild — and no tree action on the turn paths', () => {
    const decl = declare();
    const paths = turnPaths(decl.layout);
    const actions = plan(decl.layout, decl.manifest, oldShapeHost(decl));
    const rebuilds = rebuildsOf(actions);
    expect(rebuilds.map(rebuild => ({ k: rebuild.k, home: rebuild.home, staging: rebuild.staging, identity: rebuild.identity, retired: rebuild.retired }))).toEqual([
      { k: 1, home: paths.home, staging: paths.staging, identity: paths.identity, retired: { dir: join(decl.layout.agentStateRoot, 'retired'), stem: 's1-turn' } },
    ]);
    // What is carried is the CLI's STATE, an allowlist — never its whole directory.
    expect(rebuilds[0]?.carry.map(entry => ({ from: entry.from, to: entry.to, type: entry.type }))).toEqual(CARRY);
    const at = (predicate: (action: any) => boolean) => actions.findIndex(predicate);
    const stop = at(action => action.kind === 'exec' && action.step === 'daemon_stop');
    const proof = at(action => action.kind === 'exec' && action.step === 'quiesce_proof' && action.argv.join(' ') === `pgrep -U ${paths.identity}`);
    const rebuild = at(action => action.kind === 'turn_home_rebuild');
    expect({ stop: stop >= 0, proof: proof > stop, rebuild: rebuild > proof }).toEqual({ stop: true, proof: true, rebuild: true });
    // NEVER re-owned in place: no dir action on HOME, state or .config while the old tree stands.
    expect(actions.filter(action => action.kind === 'dir' && touchesTurn(action, paths)).map(action => (action as { path: string }).path)).toEqual([]);
  });

  test('the coherence check accepts that plan, and refuses a rebuild with no proof or another archive directory', () => {
    const decl = declare();
    const actions = plan(decl.layout, decl.manifest, oldShapeHost(decl));
    expect(rebuildsOf(actions).length).toBe(1);
    expect(() => assertPlanIsCoherent(actions, decl.layout)).not.toThrow();
    const identity = turnPaths(decl.layout).identity;
    const unproved = actions.filter(action => !(action.kind === 'exec' && action.step === 'quiesce_proof' && action.argv.includes(identity)));
    expect(() => assertPlanIsCoherent(unproved, decl.layout)).toThrow();
    const elsewhere = actions.map(action =>
      (action as { kind: string }).kind === 'turn_home_rebuild' ? ({ ...action, retired: { dir: '/tmp/elsewhere', stem: 's1-turn' } } as unknown as Action) : action,
    );
    expect(() => assertPlanIsCoherent(elsewhere, decl.layout)).toThrow();
    // The OLD archive (the state dir's `retired/`, beside the agent state root) is not this one.
    const besideRoot = actions.map(action =>
      (action as { kind: string }).kind === 'turn_home_rebuild' ? ({ ...action, retired: { dir: decl.layout.retiredDir, stem: 's1-turn' } } as unknown as Action) : action,
    );
    expect(() => assertPlanIsCoherent(besideRoot, decl.layout)).toThrow();
    // A carry list widened past the allowlist (the whole CLI directory) is not the one constant.
    const widened = actions.map(action =>
      (action as { kind: string }).kind === 'turn_home_rebuild'
        ? ({ ...action, carry: [{ from: '.claude', to: 'state/claude', type: 'dir', reason: 'everything' }] } as unknown as Action)
        : action,
    );
    expect(() => assertPlanIsCoherent(widened, decl.layout)).toThrow();
  });

  test('H4b — EVERY kind of drift is planned for repair, not only an identity-owned HOME; the repaired host plans nothing more', () => {
    const decl = declare();
    const paths = turnPaths(decl.layout);
    const settled = settle(decl);
    // The settled host is the skeleton: no rebuild, nothing for the plan's predicate.
    expect(rebuildsOf(plan(decl.layout, decl.manifest, { ...settled, unitActive: true })).length).toBe(0);
    const listed = (names: readonly string[], config: readonly string[] = []) => ({ [paths.home]: names, [paths.config]: config });
    const SKELETON = ['.config', '.gitconfig', 'state'];
    const DRIFT: ReadonlyArray<readonly [string, (host: HostState) => HostState]> = [
      ['a stray .bunfig.toml at HOME level', host => ({ ...host, turnHomeEntries: listed([...SKELETON, '.bunfig.toml']) })],
      ['.config/git planted', host => ({ ...host, turnHomeEntries: listed(SKELETON, ['git']) })],
      ['state/ a link', host => ({ ...host, entries: { ...host.entries, [paths.state]: { type: 'symlink', target: '/etc', owner: paths.identity, group: 'g' } } })],
      ['state/ another identity’s', host => ({ ...host, entries: { ...host.entries, [paths.state]: { ...host.entries[paths.state], type: 'dir', owner: 'dedalo-a-gate_9' } as PathObservation } })],
      ['.gitconfig saying more than the directives', host => ({
        ...host,
        entries: { ...host.entries, [paths.gitconfig]: { ...host.entries[paths.gitconfig], type: 'file', content: '[safe]\n\tbareRepository = all\n' } as PathObservation },
      })],
      ['.gitconfig the identity’s, its bytes correct', host => ({
        ...host,
        entries: { ...host.entries, [paths.gitconfig]: { ...host.entries[paths.gitconfig], type: 'file', owner: paths.identity } as PathObservation },
      })],
      ['.gitconfig 0664, its bytes correct', host => ({
        ...host,
        entries: { ...host.entries, [paths.gitconfig]: { ...host.entries[paths.gitconfig], type: 'file', mode: 0o664 } as PathObservation },
      })],
      ['.gitconfig 0646, its bytes correct', host => ({
        ...host,
        entries: { ...host.entries, [paths.gitconfig]: { ...host.entries[paths.gitconfig], type: 'file', mode: 0o646 } as PathObservation },
      })],
      // The observer saw a real HOME but did not LIST it: unknown is never "only the skeleton".
      ['the HOME observed as a directory but never listed', host => ({ ...host, turnHomeEntries: {} })],
      ['the HOME group-writable', host => ({ ...host, entries: { ...host.entries, [paths.home]: { ...host.entries[paths.home], type: 'dir', mode: 0o775 } as PathObservation } })],
    ];
    for (const [label, drift] of DRIFT) {
      const host = { ...drift({ ...settled, turnHomeEntries: listed(SKELETON) }), unitActive: true };
      const actions = plan(decl.layout, decl.manifest, host);
      const rebuilds = rebuildsOf(actions);
      expect({ label, rebuilds: rebuilds.map(rebuild => rebuild.k) }).toEqual({ label, rebuilds: [1] });
      expect(() => assertPlanIsCoherent(actions, decl.layout)).not.toThrow();
      const repaired = { ...placeOperatorFiles(simulate(host, actions, decl.layout), actions), turnHomeEntries: listed(SKELETON) };
      expect({ label, again: rebuildsOf(plan(decl.layout, decl.manifest, repaired)).length }).toEqual({ label, again: 0 });
    }
  });

  test('H4c — the archive is <agentStateRoot>/retired, root 0700, created by the plan beside the sites’ state (every unit masks the root)', () => {
    const decl = declare();
    const archive = join(decl.layout.agentStateRoot, 'retired');
    const dir = plan(decl.layout, decl.manifest, bareHost()).find(action => action.kind === 'dir' && action.path === archive) as
      | { owner: string; group: string; mode: number }
      | undefined;
    expect(dir === undefined ? 'no dir action' : { owner: dir.owner, group: dir.group, mode: dir.mode }).toEqual({ owner: 'root', group: 'root', mode: 0o700 });
  });

  test('a non-directory standing at turn.next is refused by the plan, by name — never renamed over', () => {
    const decl = declare();
    const paths = turnPaths(decl.layout);
    const old = oldShapeHost(decl);
    const host = { ...old, entries: { ...old.entries, [paths.staging]: { type: 'file', mode: 0o644, owner: paths.identity, group: 'x' } as PathObservation } };
    expect(() => plan(decl.layout, decl.manifest, host)).toThrow(paths.staging);
  });

  test('re-planning the rebuilt host plans nothing more on the turn paths; turn.next without turn is a resume', () => {
    const decl = declare();
    const paths = turnPaths(decl.layout);
    const old = oldShapeHost(decl);
    const first = plan(decl.layout, decl.manifest, old);
    expect(rebuildsOf(first).length).toBe(1);
    const rebuilt = placeOperatorFiles(simulate(old, first, decl.layout), first);
    const again = plan(decl.layout, decl.manifest, rebuilt);
    expect(again.filter(action => touchesTurn(action, paths) || (action.kind === 'exec' && action.step === 'quiesce_proof'))).toEqual([]);
    // A crash between the staging and the swap: `turn.next` stands, `turn` is gone.
    const entries: Record<string, PathObservation> = {};
    for (const [path, observation] of Object.entries(rebuilt.entries)) {
      if (path === paths.home || path.startsWith(`${paths.home}/`)) entries[path.replace(paths.home, paths.staging)] = observation;
      else entries[path] = observation;
    }
    const resumed = plan(decl.layout, decl.manifest, { ...rebuilt, entries });
    expect(rebuildsOf(resumed).map(rebuild => ({ home: rebuild.home, staging: rebuild.staging }))).toEqual([{ home: paths.home, staging: paths.staging }]);
    expect(resumed.filter(action => action.kind === 'dir' && touchesTurn(action, paths))).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * H5 — the migration, applied
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('H5 — the rebuild carries the CLI state, archives the rest root-only, deletes nothing', () => {
  const IDENTITY = 'dedalo-a-gate_1';
  const GROUP = 'dedalo-site-gate';
  const FOREIGN = 'dedalo-a-gate_2';

  interface ScratchOptions {
    /** `.claude` is a link to a tree outside the HOME. */
    readonly claudeIsLink?: boolean;
    /** The HOME is a REFUSED S3 HOME (root's, `state/claude/…`) instead of a pre-S3 one. */
    readonly s3?: boolean;
    /** `.claude.json` belongs to another identity. */
    readonly foreignAccount?: boolean;
    /** The device the io reports for the archive directory (default: the real one). */
    readonly archiveDev?: number;
    /** The old HOME holds NONE of the CLI's state (no `.claude`, no `.claude.json`): nothing to carry. */
    readonly nothingToCarry?: boolean;
  }

  /** A scratch tree with an old HOME, and an io over it whose ownership is recorded (a suite is not root). */
  function scratchHost(options: ScratchOptions = {}) {
    const root = scratchDir('turn-home-apply-');
    const stateRoot = join(root, 'agents');
    const retired = join(stateRoot, 'retired');
    const site = join(stateRoot, 's1');
    const home = join(site, 'turn');
    // Where the CLI's directory sits in the old HOME: `.claude` (pre-S3) or `state/claude` (S3).
    const cli = options.s3 ? join(home, 'state', 'claude') : join(home, '.claude');
    const account = options.s3 ? join(cli, '.claude.json') : join(home, '.claude.json');
    mkdirSync(join(home, '.config', 'git'), { recursive: true });
    mkdirSync(retired, { recursive: true });
    const access = new Map<string, { owner: string; group: string; mode: number }>();
    const own = (path: string, owner: string, group: string, mode: number) => access.set(path, { owner, group, mode });
    own(stateRoot, 'root', 'root', 0o755);
    own(site, 'root', 'root', 0o755);
    own(retired, 'root', 'root', 0o700);
    if (options.s3) {
      own(home, 'root', 'root', 0o755);
      mkdirSync(join(home, 'state'), { recursive: true });
      own(join(home, 'state'), IDENTITY, GROUP, 0o700);
    } else {
      own(home, IDENTITY, GROUP, 0o700);
    }
    if (options.nothingToCarry) {
      // No CLI directory at all.
    } else if (options.claudeIsLink) {
      mkdirSync(join(root, 'outside', 'projects'), { recursive: true });
      writeFileSync(join(root, 'outside', 'projects', 'x.jsonl'), '{"outside":true}\n');
      symlinkSync(join(root, 'outside'), cli);
      own(cli, IDENTITY, GROUP, 0o777);
      // Seen THROUGH the link, the tree it names is the identity's own (a tree it made elsewhere):
      // only the check of every component above an entry stops a rename that follows the link.
      own(join(cli, 'projects'), IDENTITY, GROUP, 0o700);
    } else {
      // The CLI's STATE (carried) …
      mkdirSync(join(cli, 'projects', '-ws-one'), { recursive: true });
      writeFileSync(join(cli, 'projects', '-ws-one', 'sess-1.jsonl'), '{"turn":1}\n');
      writeFileSync(join(cli, '.credentials.json'), '{"login":"operator"}\n');
      own(cli, IDENTITY, GROUP, 0o700);
      own(join(cli, 'projects'), IDENTITY, GROUP, 0o700);
      own(join(cli, 'projects', '-ws-one'), IDENTITY, GROUP, 0o700);
      own(join(cli, 'projects', '-ws-one', 'sess-1.jsonl'), IDENTITY, GROUP, 0o600);
      own(join(cli, '.credentials.json'), IDENTITY, GROUP, 0o600);
      // … and the CLI's CONFIGURATION a turn could have written (never carried: H5b).
      writeFileSync(join(cli, 'settings.json'), '{"hooks":{"PreToolUse":[{"command":"curl planted"}]}}\n');
      mkdirSync(join(cli, 'skills', 'planted'), { recursive: true });
      writeFileSync(join(cli, 'skills', 'planted', 'SKILL.md'), '# planted\n');
      for (const path of [join(cli, 'settings.json'), join(cli, 'skills'), join(cli, 'skills', 'planted'), join(cli, 'skills', 'planted', 'SKILL.md')]) {
        own(path, IDENTITY, GROUP, 0o700);
      }
    }
    if (!options.nothingToCarry) {
      writeFileSync(account, '{"userID":"x"}\n');
      own(account, options.foreignAccount ? FOREIGN : IDENTITY, GROUP, 0o600);
    }
    // The plants a turn could leave for every later turn.
    writeFileSync(join(home, '.gitconfig'), '[safe]\n\tbareRepository = all\n');
    own(join(home, '.gitconfig'), IDENTITY, GROUP, 0o600);
    writeFileSync(join(home, '.config', 'git', 'config'), '[safe]\n\tbareRepository = all\n');
    own(join(home, '.config'), IDENTITY, GROUP, 0o700);
    own(join(home, '.config', 'git'), IDENTITY, GROUP, 0o700);
    own(join(home, '.config', 'git', 'config'), IDENTITY, GROUP, 0o600);
    writeFileSync(join(home, '.bunfig.toml'), '[install]\nregistry = "http://planted"\n');
    own(join(home, '.bunfig.toml'), IDENTITY, GROUP, 0o600);

    let failRename: ((from: string, to: string) => boolean) | null = null;
    const renames: Array<[string, string]> = [];
    const io: ProvisionIo & {
      access: typeof access;
      renames: typeof renames;
      setFailRename: (f: typeof failRename) => void;
    } = {
      access,
      renames,
      setFailRename: f => {
        failRename = f;
      },
      stat(path: string): PathFacts | null {
        let facts: ReturnType<typeof lstatSync>;
        try {
          facts = lstatSync(path);
        } catch {
          return null;
        }
        const recorded = access.get(path);
        return {
          type: facts.isSymbolicLink() ? 'symlink' : facts.isDirectory() ? 'dir' : facts.isFile() ? 'file' : 'other',
          mode: recorded?.mode ?? facts.mode & 0o7777,
          owner: recorded?.owner ?? 'root',
          group: recorded?.group ?? 'root',
          dev: path === retired && options.archiveDev !== undefined ? options.archiveDev : Number(facts.dev),
        };
      },
      readFile: path => {
        try {
          return readFileSync(path, 'utf8');
        } catch {
          return null;
        }
      },
      mkdir: path => {
        mkdirSync(path, { recursive: true });
      },
      writeFile: (path, body, mode) => {
        writeFileSync(path, body);
        own(path, access.get(path)?.owner ?? 'root', access.get(path)?.group ?? 'root', mode);
      },
      symlink: (path, target) => symlinkSync(target, path),
      chown: (path, owner, group) => own(path, owner, group, access.get(path)?.mode ?? lstatSync(path).mode & 0o7777),
      chmod: (path, mode) => own(path, access.get(path)?.owner ?? 'root', access.get(path)?.group ?? 'root', mode),
      exec: () => ({ code: 0, stdout: '', stderr: '' }),
      rename: (from, to) => {
        if (failRename?.(from, to)) throw new Error(`rename ${from} -> ${to}: injected failure (a power cut between the two renames)`);
        mkdirSync(dirname(to), { recursive: true });
        renameSync(from, to);
        renames.push([from, to]);
        // The record follows the inode.
        for (const [path, facts] of [...access.entries()]) {
          if (path === from || path.startsWith(`${from}/`)) {
            access.delete(path);
            access.set(to + path.slice(from.length), facts);
          }
        }
      },
      unlink: path => rmSync(path, { force: true }),
      mintToken: () => 'x',
      hashPassword: () => 'x',
    };
    const action = {
      kind: 'turn_home_rebuild',
      phase: 'quiesce',
      k: 1,
      home,
      staging: join(site, 'turn.next'),
      identity: IDENTITY,
      group: GROUP,
      retired: { dir: retired, stem: 's1-turn' },
      carry: (identityModule as unknown as { TURN_HOME_CARRY: unknown }).TURN_HOME_CARRY,
      reason: 'the gate',
    } as unknown as Action;
    return { root, home, retired, site, io, action };
  }

  /** Every non-directory entry under `dir` (links included), relative. */
  function leaves(dir: string): string[] {
    if (!existsSync(dir)) return [];
    const out: string[] = [];
    const walk = (at: string, rel: string) => {
      for (const name of readdirSync(at)) {
        const path = join(at, name);
        const facts = lstatSync(path);
        if (facts.isDirectory() && !facts.isSymbolicLink()) walk(path, join(rel, name));
        else out.push(join(rel, name));
      }
    };
    walk(dir, '');
    return out.sort();
  }

  const archives = (retired: string) => readdirSync(retired).filter(name => name.startsWith('s1-turn.')).map(name => join(retired, name));

  const CARRIED = ['.claude.json', '.credentials.json', 'projects/-ws-one/sess-1.jsonl'];

  test('HOME becomes the skeleton; the CLI STATE is carried into state/claude; the plants sit only in a root-only archive', () => {
    const { home, retired, io, action } = scratchHost();
    const before = leaves(home).length;
    const report = apply([action], io);
    expect(report.failure?.detail ?? null).toBeNull();
    expect(readdirSync(home).sort()).toEqual(['.config', 'state']);
    expect(readdirSync(join(home, '.config'))).toEqual([]);
    expect({
      home: io.access.get(home),
      state: io.access.get(join(home, 'state')),
      config: io.access.get(join(home, '.config')),
    }).toEqual({
      home: { owner: 'root', group: 'root', mode: 0o755 },
      state: { owner: IDENTITY, group: GROUP, mode: 0o700 },
      config: { owner: 'root', group: 'root', mode: 0o755 },
    });
    expect(leaves(join(home, 'state', 'claude'))).toEqual(CARRIED);
    expect(readFileSync(join(home, 'state', 'claude', 'projects', '-ws-one', 'sess-1.jsonl'), 'utf8')).toBe('{"turn":1}\n');
    expect(readFileSync(join(home, 'state', 'claude', '.claude.json'), 'utf8')).toBe('{"userID":"x"}\n');
    const [archive, ...more] = archives(retired);
    expect({ archives: more.length + (archive ? 1 : 0) }).toEqual({ archives: 1 });
    expect(io.access.get(archive as string)).toEqual({ owner: 'root', group: 'root', mode: 0o700 });
    // H5b: the CLI's CONFIGURATION (a hook, a skill) is archived as evidence, never carried.
    expect(leaves(archive as string)).toEqual(['.bunfig.toml', '.claude/settings.json', '.claude/skills/planted/SKILL.md', '.config/git/config', '.gitconfig']);
    // Nothing deleted: every file the old HOME held is in the new HOME or in the archive.
    expect(leaves(home).length + leaves(archive as string).length).toBe(before);
  });

  test('a REFUSED S3 HOME (root’s, drifted) is rebuilt the same way: state carried from state/claude, the archive closed 0700', () => {
    const { home, retired, io, action } = scratchHost({ s3: true });
    const report = apply([action], io);
    expect(report.failure?.detail ?? null).toBeNull();
    expect(readdirSync(home).sort()).toEqual(['.config', 'state']);
    expect(leaves(join(home, 'state', 'claude'))).toEqual(CARRIED);
    const [archive] = archives(retired);
    // The old HOME was root's 0755: the archive is CLOSED to 0700, not merely moved.
    expect(io.access.get(archive as string)).toEqual({ owner: 'root', group: 'root', mode: 0o700 });
    expect(leaves(archive as string)).toEqual([
      '.bunfig.toml',
      '.config/git/config',
      '.gitconfig',
      'state/claude/settings.json',
      'state/claude/skills/planted/SKILL.md',
    ]);
  });

  test('a .claude that is a LINK is not carried (named in the result); state/claude is a fresh directory of the identity', () => {
    const { root, home, retired, io, action } = scratchHost({ claudeIsLink: true });
    const report = apply([action], io);
    expect(report.failure?.detail ?? null).toBeNull();
    const claude = join(home, 'state', 'claude');
    expect(lstatSync(claude).isSymbolicLink()).toBe(false);
    expect(existsSync(join(claude, 'projects'))).toBe(false);
    expect(io.access.get(claude)).toEqual({ owner: IDENTITY, group: GROUP, mode: 0o700 });
    expect(String(report.outcomes[0]?.detail)).toContain('.claude/projects');
    // The link itself went to the archive with the rest, untouched; nothing it names was moved.
    expect(lstatSync(join(archives(retired)[0] as string, '.claude')).isSymbolicLink()).toBe(true);
    expect(io.renames.some(([from]) => from.startsWith(`${join(home, '.claude')}/`))).toBe(false);
    expect(readFileSync(join(root, 'outside', 'projects', 'x.jsonl'), 'utf8')).toBe('{"outside":true}\n');
  });

  test('an entry of ANOTHER owner is not carried (named), even where the allowlist names it', () => {
    const { home, retired, io, action } = scratchHost({ foreignAccount: true });
    const report = apply([action], io);
    expect(report.failure?.detail ?? null).toBeNull();
    expect(existsSync(join(home, 'state', 'claude', '.claude.json'))).toBe(false);
    expect(String(report.outcomes[0]?.detail)).toContain(`.claude.json (a file of ${FOREIGN}`);
    expect(existsSync(join(archives(retired)[0] as string, '.claude.json'))).toBe(true);
  });

  test('a carry target ALREADY in the staging (a resumed partial run) is never overwritten: kept byte for byte, the source named and archived', () => {
    const { home, site, retired, io, action } = scratchHost();
    const staged = join(site, 'turn.next', 'state', 'claude');
    mkdirSync(staged, { recursive: true });
    writeFileSync(join(staged, '.credentials.json'), 'ZZ_PRESEEDED_LOGIN\n');
    for (const path of [join(site, 'turn.next'), join(site, 'turn.next', 'state'), staged]) io.access.set(path, { owner: IDENTITY, group: GROUP, mode: 0o700 });
    io.access.set(join(site, 'turn.next'), { owner: 'root', group: 'root', mode: 0o755 });
    io.access.set(join(staged, '.credentials.json'), { owner: IDENTITY, group: GROUP, mode: 0o600 });
    const report = apply([action], io);
    expect(report.failure?.detail ?? null).toBeNull();
    expect(readFileSync(join(home, 'state', 'claude', '.credentials.json'), 'utf8')).toBe('ZZ_PRESEEDED_LOGIN\n');
    expect(String(report.outcomes[0]?.detail)).toContain('.claude/.credentials.json (its target state/claude/.credentials.json already exists)');
    // The source was not lost: it is in the archive with the rest.
    expect(readFileSync(join(archives(retired)[0] as string, '.claude', '.credentials.json'), 'utf8')).toBe('{"login":"operator"}\n');
  });

  test('a HOME with NOTHING to carry still gets the CLI’s directory: state/claude, the identity’s, 0700', () => {
    const { home, io, action } = scratchHost({ nothingToCarry: true });
    const report = apply([action], io);
    expect(report.failure?.detail ?? null).toBeNull();
    const claude = join(home, 'state', 'claude');
    expect({
      dir: existsSync(claude) && lstatSync(claude).isDirectory() && !lstatSync(claude).isSymbolicLink(),
      access: io.access.get(claude),
      empty: existsSync(claude) ? readdirSync(claude) : '(absent)',
    }).toEqual({ dir: true, access: { owner: IDENTITY, group: GROUP, mode: 0o700 }, empty: [] });
  });

  test('--check names the HOME rebuild among the writes the operator approves', () => {
    const { home, action } = scratchHost();
    const writes = check([action]).writes.filter(entry => entry.path === home);
    expect(writes.map(entry => entry.disposition.startsWith("rebuild root's"))).toEqual([true]);
  });

  test('H4c — HOME and archive on two filesystems: refused, NOTHING moved', () => {
    const { home, site, retired, io, action } = scratchHost({ archiveDev: 987_654_321 });
    const before = leaves(home);
    const report = apply([action], io);
    expect({ ok: report.ok, named: String(report.failure?.detail).includes('not one filesystem') }).toEqual({ ok: false, named: true });
    expect({ renames: io.renames, staging: existsSync(join(site, 'turn.next')), home: leaves(home), archives: archives(retired) }).toEqual({
      renames: [],
      staging: false,
      home: before,
      archives: [],
    });
  });

  test('an archive name already taken: refused, NOTHING moved — an archive is never overwritten', () => {
    const { home, site, retired, io, action } = scratchHost();
    setSystemTime(new Date('2026-10-11T12:00:00.000Z'));
    try {
      mkdirSync(join(retired, 's1-turn.20261011T120000Z'));
      writeFileSync(join(retired, 's1-turn.20261011T120000Z', 'earlier'), 'an earlier archive\n');
      const before = leaves(home);
      const report = apply([action], io);
      expect({ ok: report.ok, named: String(report.failure?.detail).includes('never overwritten') }).toEqual({ ok: false, named: true });
      expect({ renames: io.renames, staging: existsSync(join(site, 'turn.next')), home: leaves(home) }).toEqual({ renames: [], staging: false, home: before });
      expect(readFileSync(join(retired, 's1-turn.20261011T120000Z', 'earlier'), 'utf8')).toBe('an earlier archive\n');
    } finally {
      setSystemTime();
    }
  });

  test('a crash between staging and swap is resumed: re-applied, the carried state is intact and the HOME is the skeleton', () => {
    const { home, site, io, action } = scratchHost();
    io.setFailRename((from, to) => from === join(site, 'turn.next') && to === home);
    const crashed = apply([action], io);
    expect(crashed.ok).toBe(false);
    expect(existsSync(home)).toBe(false);
    io.setFailRename(null);
    const resumed = apply([action], io);
    expect(resumed.failure?.detail ?? null).toBeNull();
    expect(readdirSync(home).sort()).toEqual(['.config', 'state']);
    expect(leaves(join(home, 'state', 'claude'))).toEqual(CARRIED);
    expect(existsSync(join(site, 'turn.next'))).toBe(false);
  });

  test('a resume whose staging is NOT the skeleton is refused, never swapped in', () => {
    const { home, site, io, action } = scratchHost();
    io.setFailRename((from, to) => from === join(site, 'turn.next') && to === home);
    expect(apply([action], io).ok).toBe(false);
    io.setFailRename(null);
    // Between the crash and the resume, the staged state/ is not the identity's any more.
    io.access.set(join(site, 'turn.next', 'state'), { owner: FOREIGN, group: GROUP, mode: 0o700 });
    const resumed = apply([action], io);
    expect({ ok: resumed.ok, named: String(resumed.failure?.detail).includes(join(site, 'turn.next', 'state')) }).toEqual({ ok: false, named: true });
    expect({ home: existsSync(home), staging: existsSync(join(site, 'turn.next')) }).toEqual({ home: false, staging: true });
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * H6 — declared unconfined: a fresh HOME per run, a persistent state
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('H6 — under AGENT_CONFINEMENT=none the turn HOME is fresh per run and the state persists', () => {
  async function drain(child: ConfinedChild): Promise<string> {
    let out = '';
    const decoder = new TextDecoder();
    try {
      for await (const chunk of child.stdout) out += decoder.decode(chunk, { stream: true });
      await child.exited;
    } finally {
      await child.cleanup();
    }
    return out + decoder.decode();
  }

  const envOf = (stdout: string) =>
    Object.fromEntries(
      stdout
        .split('\n')
        .filter(line => /^[A-Z_]+=/.test(line))
        .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
    );

  const SCRIPT =
    '/usr/bin/env; ' +
    // XDG_CONFIG_HOME, as the run finds it: a real, EMPTY directory (never a dangling path).
    'if [ -d "$XDG_CONFIG_HOME" ] && [ ! -L "$XDG_CONFIG_HOME" ]; then echo XDG_CONFIG_DIR=yes; else echo XDG_CONFIG_DIR=no; fi; ' +
    'echo XDG_CONFIG_ENTRIES=$(ls -A "$XDG_CONFIG_HOME" 2>/dev/null | wc -l | tr -d " "); ' +
    'if [ -e "$HOME/.gitconfig" ]; then echo PLANT_SEEN=yes; else echo PLANT_SEEN=no; fi; ' +
    'if [ -e "$CLAUDE_CONFIG_DIR/keep" ]; then echo STATE_SEEN=yes; else echo STATE_SEEN=no; fi; ' +
    'printf "[safe]\\n\\tbareRepository = all\\n" > "$HOME/.gitconfig"; ' +
    'mkdir -p "$CLAUDE_CONFIG_DIR" && touch "$CLAUDE_CONFIG_DIR/keep"';

  test('two runs get two HOMEs (a plant in the first is absent in the second), one state, and the run dir is gone after exit', async () => {
    const root = scratchDir('turn-home-none-');
    const none: ConfinementPolicy = { ...policyFromConfig(), mode: 'none', agentStateRoot: root };
    const run = async () =>
      envOf(await drain(await confineTurn({ door: 'turn', argv: ['/bin/sh', '-c', SCRIPT], cwd: tmpdir(), env: { PATH: '/usr/bin:/bin', XDG_CONFIG_HOME: '/caller/wins' }, timeoutMs: 10_000 }, none)));
    const first = await run();
    const second = await run();
    const base = join(root, 'unconfined', 'turn');
    const stateDir = join(base, 'state');
    for (const [label, env] of [['first', first], ['second', second]] as const) {
      expect({ label, home: String(env.HOME).startsWith(join(base, 'run.')) }).toEqual({ label, home: true });
      // The daemon's keys win over the caller's.
      expect({ label, env: Object.fromEntries(TURN_HOME_KEYS.map(key => [key, env[key] ?? '(absent)'])) }).toEqual({
        label,
        env: expectedTurnEnv(String(env.HOME), stateDir),
      });
    }
    expect(first.HOME).not.toBe(second.HOME);
    for (const [label, env] of [['first', first], ['second', second]] as const) {
      expect({ label, xdgConfigDir: env.XDG_CONFIG_DIR, xdgConfigEntries: env.XDG_CONFIG_ENTRIES }).toEqual({
        label,
        xdgConfigDir: 'yes',
        xdgConfigEntries: '0',
      });
    }
    // The persistent state holds the CLI's login and transcripts: closed to group and others.
    expect((lstatSync(stateDir).mode & 0o7777).toString(8)).toBe('700');
    expect({ plantSeenBySecond: second.PLANT_SEEN, stateSeenBySecond: second.STATE_SEEN }).toEqual({ plantSeenBySecond: 'no', stateSeenBySecond: 'yes' });
    expect({ firstRunDir: existsSync(String(first.HOME)), secondRunDir: existsSync(String(second.HOME)) }).toEqual({ firstRunDir: false, secondRunDir: false });
  });

  test('`none` with no absolute AGENT_STATE_ROOT: every turn is refused AND the boot says so (never a quiet boot)', async () => {
    // The key is optional in the schema (systemd_scope derives it per instance); under `none` it is
    // the turn's only HOME. A turn refuses without it — the boot must name the key, or an install
    // that never set it boots clean and every turn fails with "confinement unavailable".
    for (const agentStateRoot of [undefined, '', 'relative/state']) {
      const none = { ...policyFromConfig(), mode: 'none', agentStateRoot } as ConfinementPolicy;
      const boot = await bootConfinementProblems(none);
      let refused: unknown = null;
      try {
        await confineTurn({ door: 'turn', argv: ['/bin/true'], cwd: tmpdir(), env: { PATH: '/usr/bin:/bin' }, timeoutMs: 5_000 }, none);
      } catch (error) {
        refused = error;
      }
      expect({
        agentStateRoot,
        bootNamesKey: boot.length === 1 && boot[0].includes('AGENT_STATE_ROOT'),
        turnRefused: refused instanceof ConfinementUnavailableError && String((refused as Error).message).includes('AGENT_STATE_ROOT'),
      }).toEqual({ agentStateRoot, bootNamesKey: true, turnRefused: true });
    }
    // Control: with the root set, `none` has nothing to say at boot.
    expect(await bootConfinementProblems({ ...policyFromConfig(), mode: 'none', agentStateRoot: scratchDir('turn-home-none-boot-') })).toEqual([]);
  });

  test('a killed daemon’s run HOMEs are swept at boot (reconcile under none); the persistent state is kept', async () => {
    const root = scratchDir('turn-home-sweep-');
    const none: ConfinementPolicy = { ...policyFromConfig(), mode: 'none', agentStateRoot: root };
    const base = join(root, 'unconfined', 'turn');
    // What a daemon killed mid-turn leaves: two run HOMEs (one holding a plant), and the state.
    mkdirSync(join(base, 'run.AbC123'), { recursive: true });
    writeFileSync(join(base, 'run.AbC123', '.gitconfig'), '[safe]\n\tbareRepository = all\n');
    mkdirSync(join(base, 'run.ZzZ999', '.config'), { recursive: true });
    mkdirSync(join(base, 'state', 'claude'), { recursive: true });
    writeFileSync(join(base, 'state', 'claude', 'keep'), 'session');
    await reconcileAgentUnits(none);
    expect(readdirSync(base).sort()).toEqual(['state']);
    expect(readFileSync(join(base, 'state', 'claude', 'keep'), 'utf8')).toBe('session');
  });

  test('the PRE-S3 persistent HOME’s CLI state is carried into state/ at boot — the allowlist only, never through a link, never over a target', async () => {
    // Before S3-HOME, `<root>/unconfined/turn` WAS the turn's HOME: a `none` host that logged the
    // CLI in has its login there, where `CLAUDE_CONFIG_DIR=state/claude` no longer looks.
    const root = scratchDir('turn-home-carry-none-');
    const base = join(root, 'unconfined', 'turn');
    mkdirSync(join(base, '.claude', 'projects', '-ws-one'), { recursive: true });
    writeFileSync(join(base, '.claude', 'projects', '-ws-one', 'sess.jsonl'), '{"turn":1}\n');
    writeFileSync(join(base, '.claude', '.credentials.json'), '{"login":"operator"}\n');
    writeFileSync(join(base, '.claude', 'settings.json'), '{"hooks":"planted"}\n'); // configuration: never carried
    // The account record exists at the target already (a later login): never overwritten.
    writeFileSync(join(base, '.claude.json'), '{"old":true}\n');
    mkdirSync(join(base, 'state', 'claude'), { recursive: true });
    writeFileSync(join(base, 'state', 'claude', '.claude.json'), '{"current":true}\n');
    const none: ConfinementPolicy = { ...policyFromConfig(), mode: 'none', agentStateRoot: root };
    await reconcileAgentUnits(none);
    const claude = join(base, 'state', 'claude');
    expect({
      login: readFileSync(join(claude, '.credentials.json'), 'utf8'),
      transcript: readFileSync(join(claude, 'projects', '-ws-one', 'sess.jsonl'), 'utf8'),
      account: readFileSync(join(claude, '.claude.json'), 'utf8'),
      settingsCarried: existsSync(join(claude, 'settings.json')),
      oldAccountKept: readFileSync(join(base, '.claude.json'), 'utf8'),
    }).toEqual({
      login: '{"login":"operator"}\n',
      transcript: '{"turn":1}\n',
      account: '{"current":true}\n',
      settingsCarried: false,
      oldAccountKept: '{"old":true}\n',
    });
    // A second boot carries nothing more and moves nothing back.
    await reconcileAgentUnits(none);
    expect(readFileSync(join(claude, '.credentials.json'), 'utf8')).toBe('{"login":"operator"}\n');

    // A `.claude` that is a LINK is never carried through.
    const linked = scratchDir('turn-home-carry-link-');
    const outside = scratchDir('turn-home-carry-outside-');
    writeFileSync(join(outside, '.credentials.json'), 'ZZ_OUTSIDE\n');
    mkdirSync(join(linked, 'unconfined', 'turn'), { recursive: true });
    symlinkSync(outside, join(linked, 'unconfined', 'turn', '.claude'));
    await reconcileAgentUnits({ ...none, agentStateRoot: linked });
    expect({
      carried: existsSync(join(linked, 'unconfined', 'turn', 'state', 'claude', '.credentials.json')),
      outsideIntact: readFileSync(join(outside, '.credentials.json'), 'utf8'),
    }).toEqual({ carried: false, outsideIntact: 'ZZ_OUTSIDE\n' });
  });

  test('a run HOME that cannot be removed at exit is LOGGED and left to the boot sweep — the daemon process lives on', async () => {
    // The removal runs in a detached `exited.then`: a throw there is an unhandled rejection, which
    // ends the daemon (every live session on every site). So the run is driven in its OWN process,
    // and the outcome is that process's: still alive after the run, the failure on its stderr.
    expect({ precondition: process.getuid?.() === 0 ? 'running as root: a 0500 directory does not refuse root' : 'non-root' }).toEqual({
      precondition: 'non-root',
    });
    const root = scratchDir('turn-home-rmfail-');
    const driver = join(root, 'driver.ts');
    writeFileSync(
      driver,
      [
        `import { confineTurn, policyFromConfig } from ${JSON.stringify(join(import.meta.dir, '..', 'src', 'drivers', 'confinement.ts'))};`,
        `const policy = { ...policyFromConfig(), mode: 'none', agentStateRoot: ${JSON.stringify(join(root, 'state_root'))} };`,
        // The run leaves a subdirectory it made unwritable, with a file in it: rmSync throws EACCES.
        `const child = await confineTurn({ door: 'turn', argv: ['/bin/sh', '-c', 'mkdir "$HOME/locked" && touch "$HOME/locked/f" && chmod 0500 "$HOME/locked" && echo RUN_HOME=$HOME'], cwd: ${JSON.stringify(root)}, env: { PATH: '/usr/bin:/bin' }, timeoutMs: 10_000 }, policy);`,
        `let out = ''; for await (const chunk of child.stdout) out += new TextDecoder().decode(chunk);`,
        `await child.exited; await child.cleanup(); await Bun.sleep(300);`,
        `process.stdout.write(out + 'ALIVE\\n');`,
      ].join('\n'),
    );
    const proc = Bun.spawnSync(['bun', driver], { cwd: join(import.meta.dir, '..'), env: process.env, stdout: 'pipe', stderr: 'pipe' });
    const stdout = proc.stdout.toString();
    const stderr = proc.stderr.toString();
    const runHome = /^RUN_HOME=(.*)$/m.exec(stdout)?.[1] ?? '(no run home reported)';
    try {
      expect({ exit: proc.exitCode, alive: stdout.includes('ALIVE'), logged: stderr.includes(`could not remove the declared-unconfined run HOME '${runHome}'`) }).toEqual({
        exit: 0,
        alive: true,
        logged: true,
      });
      expect(existsSync(runHome)).toBe(true);
    } finally {
      if (existsSync(join(runHome, 'locked'))) chmodSync(join(runHome, 'locked'), 0o700);
    }
    // The next boot sweep removes the leftover once it can be removed.
    await reconcileAgentUnits({ ...policyFromConfig(), mode: 'none', agentStateRoot: join(root, 'state_root') });
    expect(existsSync(runHome)).toBe(false);
  });

  test('a boot sweep that cannot remove a leftover logs it and does not throw (the reconciliation never throws)', async () => {
    expect(process.getuid?.() === 0 ? 'root' : 'non-root').toBe('non-root');
    const root = scratchDir('turn-home-sweepfail-');
    const base = join(root, 'unconfined', 'turn');
    mkdirSync(join(base, 'run.Locked1', 'locked'), { recursive: true });
    writeFileSync(join(base, 'run.Locked1', 'locked', 'f'), 'x');
    chmodSync(join(base, 'run.Locked1', 'locked'), 0o500);
    mkdirSync(join(base, 'run.Free2'), { recursive: true });
    const logged: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void logged.push(args.map(String).join(' '));
    try {
      await reconcileAgentUnits({ ...policyFromConfig(), mode: 'none', agentStateRoot: root });
    } finally {
      console.error = original;
      chmodSync(join(base, 'run.Locked1', 'locked'), 0o700);
    }
    expect({
      leftover: existsSync(join(base, 'run.Locked1')),
      freeSwept: existsSync(join(base, 'run.Free2')),
      logged: logged.some(line => line.includes(join(base, 'run.Locked1'))),
    }).toEqual({ leftover: true, freeSwept: false, logged: true });
  });

  test('without AGENT_STATE_ROOT a turn is refused, naming the key — never run with the daemon’s own HOME', async () => {
    const none = { ...policyFromConfig(), mode: 'none', agentStateRoot: undefined } as unknown as ConfinementPolicy;
    let refused: Error | null = null;
    try {
      await drain(await confineTurn({ door: 'turn', argv: ['/usr/bin/true'], cwd: tmpdir(), env: { PATH: '/usr/bin:/bin' }, timeoutMs: 5_000 }, none));
    } catch (error) {
      refused = error as Error;
    }
    expect({ typed: refused?.name ?? null, named: String(refused?.message).includes('AGENT_STATE_ROOT') }).toEqual({
      typed: 'ConfinementUnavailableError',
      named: true,
    });
  });
});

/* The skeleton the fixture builds is the design's — held, so the fixture cannot drift from it. */
test('the fixture’s turn HOME is the design’s skeleton', () => {
  expect([...TURN_HOME_SKELETON_NAMES].sort()).toEqual(['.config', '.gitconfig', 'state']);
  const skeleton = (identityModule as unknown as { TURN_HOME_SKELETON?: ReadonlyArray<{ rel: string; type: string; owner: string; mode: number }> }).TURN_HOME_SKELETON;
  expect(skeleton?.map(row => ({ rel: row.rel, type: row.type, owner: row.owner, mode: row.mode })) ?? 'agent_identity exports no TURN_HOME_SKELETON').toEqual([
    { rel: '.', type: 'dir', owner: 'root', mode: 0o755 },
    { rel: 'state', type: 'dir', owner: 'identity', mode: 0o700 },
    { rel: '.config', type: 'dir', owner: 'root', mode: 0o755 },
    { rel: '.gitconfig', type: 'file', owner: 'root', mode: 0o644 },
  ]);
});
