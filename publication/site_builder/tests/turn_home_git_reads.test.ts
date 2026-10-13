/**
 * H7-git — WHAT A TURN'S REAL `git` READS AS GLOBAL CONFIGURATION IS ROOT'S, WHATEVER A PREVIOUS
 * TURN PLANTED (S3-HOME, LEAD-1b §2.6a).
 *
 * The other S3-HOME gates (turn_home.test.ts H1–H6) hold the SHAPE: who owns HOME, which keys the
 * unit fixes, what conformance refuses. This one asks the program the shape exists for. git reads
 * its global configuration from `$HOME/.gitconfig` and `$XDG_CONFIG_HOME/git/config` — protected
 * configuration, read after the system file the turn unit binds — so a turn that could write
 * either could say `safe.bareRepository = all` for every later turn and reopen the repository the
 * mask closes.
 *
 * Held here, on the REAL git binary:
 *
 *   CONFINED — the turn unit's environment as the daemon renders it (`unitFixedEnvironment`), its
 *   HOME built from the PLAN (every directory with its planned owner) and the RENDERED artifacts.
 *   A previous turn plants `[safe] bareRepository = all` + `zz.plant = 1` at EVERY place it can
 *   write — every candidate config path (`<v>/.gitconfig`, `<v>/git/config` for HOME, every
 *   environment value, `state/`, `state/.config`) whose nearest planned directory is the site
 *   identity's. Then the global origins are EXACTLY `file:<home>/.gitconfig`, `zz.plant` is absent
 *   and `safe.bareRepository` is root's (`explicit`).
 *
 *   UNCONFINED (declared `none`) — two real runs through `confineTurn`: the first plants at every
 *   candidate its environment names, the second's git reads none of it.
 *
 *   CONTROL — the same harness with `XDG_CONFIG_HOME` under `state/` DOES read the plant: the gate
 *   can see what it says is absent.
 *
 * Who may write a path is decided by the PLAN's owners, never by this file's idea of the layout;
 * the paths git reads are decided by git.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import * as identityModule from '../src/drivers/agent_identity';
import { confineTurn, policyFromConfig, type ConfinedChild, type ConfinementPolicy } from '../src/drivers/confinement';
import { derive, type InstanceLayout, type InstanceManifest } from '../src/provision/layout';
import { agentPlan, plan, type HostState } from '../src/provision/plan';
import { renderAll } from '../src/provision/render';
import { parseManifest } from '../src/provision/schema';

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

const GIT = Bun.which('git') ?? '/usr/bin/git';
const PATH = [...new Set([dirname(GIT), '/usr/bin', '/bin'])].join(':');
const PLANT = '[safe]\n\tbareRepository = all\n[zz]\n\tplant = 1\n';

function declare(): { manifest: InstanceManifest; layout: InstanceLayout } {
  const manifest = parseManifest(
    {
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
    },
    { source: 'the H7-git gate' },
  );
  return { manifest, layout: derive(manifest) };
}

const bareHost = (): HostState => ({ users: [], groups: [], entries: {}, unitEnabled: false, unitActive: false });

/**
 * git's GLOBAL-scope configuration as git reads it for any command — every file of that scope
 * (`--show-scope`; NOT `git config --global`, which on git 2.54 lists ONLY `~/.gitconfig` when it
 * exists while every other command also reads `$XDG_CONFIG_HOME/git/config` — measured), and the
 * EFFECTIVE `safe.bareRepository` (last one read wins; the system file is off, no repository here).
 */
function globalConfig(env: Record<string, string>, cwd: string): { origins: string[]; lines: string[]; bare: string } {
  const list = spawnSync(GIT, ['config', '--list', '--show-origin', '--show-scope'], { env, cwd, encoding: 'utf8' });
  const lines = String(list.stdout)
    .split('\n')
    .filter(line => line.startsWith('global\t'))
    .map(line => line.slice('global\t'.length));
  const origins = [...new Set(lines.map(line => line.slice(0, line.indexOf('\t'))))].sort();
  const bare = spawnSync(GIT, ['config', '--get', 'safe.bareRepository'], { env, cwd, encoding: 'utf8' });
  return { origins, lines, bare: String(bare.stdout).trim() || '(unset)' };
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The confined turn: its HOME from the plan, its environment from the renderer
 * ──────────────────────────────────────────────────────────────────────────────────── */

interface BuiltHome {
  readonly root: string;
  /** The turn HOME, relocated under `root`. */
  readonly home: string;
  /** The turn's environment as the unit fixes it, relocated. */
  readonly env: Record<string, string>;
  /** Every candidate path the identity can write, relocated — where a previous turn plants. */
  readonly planted: string[];
}

function buildConfinedHome(mutateEnv: (env: Record<string, string>, home: string) => void = () => {}): BuiltHome {
  const decl = declare();
  const root = scratchDir('h7-git-');
  const at = (path: string) => join(root, path);
  const k = 1;
  const identity = identityModule.agentIdentityName(decl.layout.instance, k);
  const home = identityModule.agentHomeFor(decl.layout.agentStateRoot, k, 'turn');
  const actions = plan(decl.layout, decl.manifest, bareHost());
  const owners = new Map<string, string>();
  for (const action of actions) {
    if (action.kind !== 'dir') continue;
    if (action.path !== home && !action.path.startsWith(`${home}/`)) continue;
    owners.set(action.path, action.owner);
    mkdirSync(at(action.path), { recursive: true });
  }
  const rootFiles = new Set<string>();
  for (const artifact of renderAll(decl.layout, decl.manifest, agentPlan(decl.layout, bareHost()).facts)) {
    if (!artifact.path.startsWith(`${home}/`)) continue;
    mkdirSync(dirname(at(artifact.path)), { recursive: true });
    writeFileSync(at(artifact.path), artifact.body);
    if (artifact.owner === 'root') rootFiles.add(artifact.path);
  }
  const fixed = identityModule.unitFixedEnvironment({ door: 'turn', workspace: '/srv/w/one', agentStateRoot: decl.layout.agentStateRoot, k }) as Record<string, string>;
  const env: Record<string, string> = { ...fixed };
  mutateEnv(env, home);

  /** Writable by the identity = the nearest PLANNED directory at or above it is the identity's. */
  const writable = (path: string): boolean => {
    if (rootFiles.has(path)) return false;
    let dir = path;
    for (;;) {
      const owner = owners.get(dir);
      if (owner !== undefined) return owner === identity;
      if (dir === home || !dir.startsWith(`${home}/`)) return false;
      dir = dirname(dir);
    }
  };

  const values = new Set<string>([home, join(home, 'state'), join(home, 'state', '.config')]);
  for (const value of Object.values(env)) if (isAbsolute(value) && (value === home || value.startsWith(`${home}/`))) values.add(value);
  const planted: string[] = [];
  for (const value of values) {
    for (const candidate of [join(value, '.gitconfig'), join(value, 'git', 'config')]) {
      if (!writable(candidate)) continue;
      mkdirSync(dirname(at(candidate)), { recursive: true });
      writeFileSync(at(candidate), PLANT);
      planted.push(at(candidate));
    }
  }
  const relocated: Record<string, string> = { PATH, GIT_CONFIG_NOSYSTEM: '1' };
  for (const [key, value] of Object.entries(env)) relocated[key] = isAbsolute(value) && value.startsWith('/') && (value === home || value.startsWith(`${home}/`)) ? at(value) : value;
  return { root, home: at(home), env: relocated, planted };
}

describe('H7-git — the confined turn’s git reads only root’s global configuration', () => {
  test('every place the identity can write is planted, and git reads exactly <home>/.gitconfig, nothing planted, bareRepository root’s', () => {
    const built = buildConfinedHome();
    // Vacuity guard: a previous turn had somewhere to write.
    expect(built.planted.length).toBeGreaterThan(0);
    const read = globalConfig(built.env, built.root);
    expect({
      origins: read.origins,
      plant: read.lines.some(line => line.includes('zz.plant')),
      bareRepository: read.bare,
    }).toEqual({
      origins: [`file:${join(built.home, '.gitconfig')}`],
      plant: false,
      bareRepository: 'explicit',
    });
  });

  test('CONTROL: the same harness with XDG_CONFIG_HOME under state/ DOES read the plant', () => {
    const built = buildConfinedHome((env, home) => {
      env.XDG_CONFIG_HOME = join(home, 'state', '.config');
    });
    const read = globalConfig(built.env, built.root);
    // (The effective bareRepository may still be root's — ~/.gitconfig is read after the XDG file —
    // but every other key a plant says is live: the plant IS read.)
    expect({ plant: read.lines.some(line => line.includes('zz.plant')), fromState: read.origins.some(origin => origin.includes('/state/')) }).toEqual({ plant: true, fromState: true });
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * The declared-unconfined turn: two real runs through confineTurn
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('H7-git — under AGENT_CONFINEMENT=none, the next run’s git reads nothing the previous run planted', () => {
  async function run(policy: ConfinementPolicy, script: string): Promise<string> {
    const child: ConfinedChild = await confineTurn({ door: 'turn', argv: ['/bin/sh', '-c', script], cwd: tmpdir(), env: { PATH, GIT_CONFIG_NOSYSTEM: '1' }, timeoutMs: 10_000 }, policy);
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

  const PLANT_EVERYWHERE =
    `plant='${PLANT.replace(/\n/g, '\\n').replace(/\t/g, '\\t')}'; ` +
    'for v in "$HOME" "$HOME/state" "$HOME/state/.config" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_STATE_HOME" "$XDG_CACHE_HOME" "$CLAUDE_CONFIG_DIR"; do ' +
    '[ -n "$v" ] || continue; mkdir -p "$v/git" 2>/dev/null; printf "$plant" > "$v/.gitconfig" 2>/dev/null; printf "$plant" > "$v/git/config" 2>/dev/null; done; ' +
    'mkdir -p "$HOME/.config/git" 2>/dev/null; printf "$plant" > "$HOME/.config/git/config" 2>/dev/null; echo PLANTED';

  const READ = `${GIT} config --list --show-origin --show-scope; echo "BARE=$(${GIT} config --get safe.bareRepository)"`;

  test('run 1 plants at every candidate its environment names; run 2’s git reads none of it', async () => {
    const policy: ConfinementPolicy = { ...policyFromConfig(), mode: 'none', agentStateRoot: scratchDir('h7-git-none-') };
    expect(await run(policy, PLANT_EVERYWHERE)).toContain('PLANTED');
    const second = await run(policy, READ);
    expect({ plant: second.includes('zz.plant'), bareAll: /BARE=all/.test(second) }).toEqual({ plant: false, bareAll: false });
  });
});
