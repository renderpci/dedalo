/**
 * WHAT AN AGENT TURN RUNS AS — the behavioural half of the confinement boundary.
 *
 * The sibling gates hold the turn's ENVIRONMENT (`agent_env_boundary.test.ts`), its HOME and
 * its API key (`agent_boundary.test.ts`), and its cwd (`git_confinement.test.ts`,
 * `paths.test.ts`). All four describe a child that was, until this file existed, spawned as
 * the DAEMON'S OWN UID: the shared bearer at `$CREDENTIALS_DIRECTORY`, every provider key in
 * `/proc/self/environ` and the append handle on the audit trail were readable to it by
 * construction, because no mode and no `Protect*` directive separates a process from itself.
 *
 * So this file asserts the four things that make a turn a different principal, and it
 * asserts them on the REAL policy rather than on the suite's own: `confineTurn()` takes a
 * `ConfinementPolicy` precisely so the `systemd_scope` path — which no macOS suite can ever
 * RUN — can still be exercised, argv for argv, on this machine.
 *
 *   1. THE UID AND THE SCOPE. `systemd-run --uid=<agent user>`, in a transient unit whose
 *      name begins with this museum's own prefix (the whole scope of its polkit grant).
 *   2. THE EGRESS. Every door (turn / build / git) renders EXACTLY the network leaf's list
 *      (`drivers/network_profile.ts`): a private network namespace, `/run` masked, and — on a
 *      door that reaches out — one per-run socket directory served by the daemon's egress
 *      gate. What the rendered unit can reach is ASKED of a model of systemd
 *      (`support/systemd_reach.ts`, allow-wins), never read off the property strings; the
 *      ExecStart is the shim that proves the namespace first.
 *   3. THE CAPS. MemoryMax, CPUQuota, TasksMax and a RuntimeMaxSec PID 1 enforces.
 *   4. THE REFUSAL. A host that cannot do any of it starts nothing, and says which part is
 *      missing. Where `none` is DECLARED, every turn announces itself into the session's own
 *      durable log — the one shape of unconfined run this daemon permits, and never a
 *      silent fallback.
 *
 * Plus the per-turn credential residence: the MCP config a driver writes is 0640 and is
 * DELETED when the turn ends, on every exit path.
 */

import { describe, test, expect, afterEach, beforeEach } from 'bun:test';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { linkSync } from 'node:fs';
import { connect, createServer, type Socket } from 'node:net';
import { provisionSite, resetInstance, roots } from './fixtures/instance';
import { config } from '../src/config';
import { CONFINED_ARGV, runBinary } from '../src/util/spawn';
import {
  appendFilePrivate,
  applySharedModes,
  mkdirPrivate,
  mkdirShared,
  PlantedSymlinkError,
  PRIVATE_DIR_MODE,
  PRIVATE_FILE_MODE,
  SHARED_DIR_MODE,
  SHARED_FILE_MODE,
  PlantedHardLinkError,
  ForeignOwnerError,
  readFilePrivate,
  readFileShared,
  writeFileAgentReadable,
  writeFilePrivate,
  writeFileShared,
  writeFileSharedAtomic,
} from '../src/util/shared_tree';
import {
  confineTurn,
  runConfined,
  confinementProblems,
  assertConfinementAvailable,
  SHIM_PATH as CONFINEMENT_SHIM_PATH,
  UNIT_MASKED_PREFIXES,
  HOST_FACTS,
  RUNTIME_PREFIX,
  readHostNetns,
  readSystemdVersion,
  resolveAgentIdentity,
  policyFromConfig,
  propertiesNewerThan,
  renderEnvironmentFile,
  SYSTEMD_FLOOR,
  SYSTEMD_SINCE,
  type ConfinementPolicy,
} from '../src/drivers/confinement';
import * as sessionManager from '../src/sessions/manager';
import {
  type Destination,
  describeDestination,
  parseProperties,
  reach,
  unitPropertiesOf,
} from './support/systemd_reach';
import { spawnAgentProcess } from '../src/drivers/process';
import { ALLOWED_TOOLS, DENIED_TOOLS, writeMcpConfig } from '../src/drivers/claude_code';
import { DENIED_PERMISSIONS, writeMcpConfig as writeOpencodeConfig } from '../src/drivers/opencode';
import { piDriver } from '../src/drivers/pi';
import { changedFiles, commitAll, excludeDaemonState } from '../src/sites/git';
import { createSite } from '../src/sites/workspace';
import { __setTestDriver } from '../src/drivers/registry';
import { busyReason } from '../src/workspace_activity';
import {
  appendEvent,
  listSessions,
  readMeta,
  replayEvents,
  writeMeta,
} from '../src/sessions/store';
import { getBuild, getBuildLog, latestBuild, startBuild } from '../src/build/builder';
import { readManifest, writeManifest } from '../src/sites/manifest';
import { ConfinementUnavailableError } from '../src/errors';
import type { AgentDriver, AgentEvent } from '../src/drivers/types';

const scratch: string[] = [];

/**
 * The agent the suite's policies confine: a uid and a group no file on this machine has, so
 * every trust question is asked of an OTHER principal — which is what the agent is.
 */
const TEST_AGENT = Object.freeze({ uid: 4_000_000_001, gids: Object.freeze([4_000_000_001]) });
/** A daemon network namespace identity, stated (macOS and CI containers have no /proc). */
const TEST_NETNS = 'net:[4026531840]';

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * A REAL `systemd_scope` policy, on this machine.
 *
 * The runner is a scratch file that exists (the refusal it stands in for is "no systemd-run
 * here", and `existsSync` is the whole of that question), and the socket path gives the
 * runtime directory the per-turn environment file is written into. Nothing here is spawned:
 * what is asserted is the argv this daemon would hand PID 1, which is the artifact the
 * confinement actually is.
 */
function systemdPolicy(overrides: Partial<ConfinementPolicy> & Record<string, unknown> = {}): ConfinementPolicy {
  // A SHORT root: the turn door binds real unix sockets under the runtime directory, and
  // sun_path is 104 bytes on macOS (108 on Linux) — a scratch dir under the default
  // TMPDIR would fail the bind for a reason that has nothing to do with confinement.
  const dir = mkdtempSync(join(existsSync('/tmp') ? '/tmp' : tmpdir(), 'dsb-'));
  scratch.push(dir);
  const runner = join(dir, 'systemd-run');
  writeFileSync(runner, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  mkdirSync(join(dir, 'run'), { recursive: true, mode: 0o750 });
  return {
    mode: 'systemd_scope',
    agentUser: 'dedalo-agent-test',
    unitPrefix: 'dedalo-site-test-agent-',
    systemdRunBin: runner,
    listenSocket: join(dir, 'run', 'daemon.sock'),
    listenKind: 'unix',
    agentHome: join(dir, 'home'),
    // What the egress plan is derived from (drivers/network_profile.ts egressPlanFor).
    egressFacts: { driver: 'claude_code', providerHosts: [], registryHosts: ['registry.npmjs.org'] },
    // The REAL runtime and shim — the argv rows below assert them — with NO masked prefixes:
    // this machine (and CI, whose checkout is under /home) is not the host that runs the
    // unit, so the location refusal would describe the test host rather than the argv. The
    // refusal itself is asserted on its own, with the real prefixes, in 'the unit's ExecStart'.
    unitExec: { runtime: process.execPath, shim: SHIM_PATH, maskedPrefixes: [] },
    // The host facts, STATED: the runtime prefix is this scratch root (the real one is /run,
    // which a test cannot write — the row 'the daemon states its REAL runtime…' pins that),
    // the agent is TEST_AGENT, and the namespace identity is a constant. stat(2) is real.
    host: {
      runtimePrefix: dir,
      resolveAgent: () => TEST_AGENT,
      readNetns: () => TEST_NETNS,
      stat: HOST_FACTS.stat,
      // A systemd that knows every property rendered (the floor has its own rows below).
      systemdVersion: () => SYSTEMD_FLOOR,
    },
    // PRE-FIX FIELDS, kept so the mutation leg (the old renderer restored) runs to the
    // assertion that matters instead of crashing on a missing field. Inert after the fix.
    publicationApiUrl: 'http://127.0.0.1:8080/publication/server_api/v2',
    egressAllow: '',
    memoryMax: '2G',
    cpuQuota: '200%',
    tasksMax: 512,
    ...overrides,
  } as unknown as ConfinementPolicy;
}

/** `--property=X=…` → the value, for the assertions below. */
function property(argv: readonly string[], name: string): string | undefined {
  const hit = argv.find(entry => entry.startsWith(`--property=${name}=`));
  return hit?.slice(`--property=${name}=`.length);
}

describe('a confined turn runs as the AGENT uid, in its own transient unit', () => {
  test('the argv is systemd-run with --uid and a unit inside this museum’s prefix', async () => {
    const policy = systemdPolicy();
    const turn = await confineTurn(
      { door: 'turn', argv: ['/opt/claude', '-p', 'build a page'], cwd: '/srv/ws/site-a', env: {}, timeoutMs: 60_000 },
      policy,
    );
    try {
      // THE UID. Without it the turn is this daemon, whatever else the argv says — which is
      // the entire defect this module was written for.
      expect(turn.argv).toContain(`--uid=${policy.agentUser}`);
      expect(turn.argv[0]).toBe(policy.systemdRunBin);

      // THE SCOPE. A unit named outside the prefix is a unit the museum's polkit rule does
      // not authorize, so a drifted prefix is a daemon that cannot start a turn at all —
      // which is the safe direction, and the reason both ends read one derived string.
      const unit = turn.argv.find(entry => entry.startsWith('--unit='))?.slice('--unit='.length);
      expect(unit?.startsWith(policy.unitPrefix)).toBe(true);
      expect(unit?.endsWith('.service')).toBe(true);
      expect(turn.unitName).toBe(unit ?? null);

      // The driver's own command is still there, after the shim's own `--` and nowhere else:
      // the unit's ExecStart is the shim (it proves the namespace first), then this argv.
      expect(turn.argv.slice(turn.argv.indexOf('--') + 1)).toEqual([
        process.execPath,
        SHIM_PATH,
        '--',
        '/opt/claude',
        '-p',
        'build a page',
      ]);
      // Two turns are two units: a fixed name would make a second turn collide with the
      // first and (with --collect) tear it down.
      const second = await confineTurn(
        { door: 'turn', argv: ['/opt/claude'], cwd: '/srv/ws/site-a', env: {}, timeoutMs: 60_000 },
        policy,
      );
      expect(second.unitName).not.toBe(turn.unitName);
      await second.cleanup();
    } finally {
      await turn.cleanup();
    }
  });

  test('THE EGRESS — a turn reaches nothing on the host, the LAN or the internet directly', async () => {
    // LEAD-1, asked of what the renderer REALLY produced. systemd's IP filter is allow-wins,
    // so the pre-fix `IPAddressAllow=any localhost` granted Postgres, the DNS stub, the LAN
    // and the metadata service whatever the deny list said.
    const policy = systemdPolicy();
    const turn = await confineTurn(
      {
        door: 'turn',
        argv: ['/opt/claude'],
        cwd: '/srv/ws/site-a',
        env: {},
        timeoutMs: 60_000,
        mcpUpstream: { url: 'http://127.0.0.1:1/publication/server_api/v2', apiKey: 'publication-secret' },
      } as Parameters<typeof confineTurn>[0],
      policy,
    );
    try {
      expect({ door: 'turn', reached: reachedForbidden(turn.argv, policy) }).toEqual({ door: 'turn', reached: [] });
    } finally {
      await turn.cleanup();
    }
  });

  test('every door renders EXACTLY the network leaf’s properties, and runs through the shim', async () => {
    const net = await networkLeaf();
    // turn — rendered, not run.
    const policy = systemdPolicy();
    const turn = await confineTurn(
      {
        door: 'turn',
        argv: ['/opt/claude', '-p', 'x'],
        cwd: '/srv/ws/site-a',
        env: { PATH: '/usr/bin' },
        timeoutMs: 60_000,
        mcpUpstream: { url: 'http://127.0.0.1:1/publication/server_api/v2', apiKey: 'publication-secret' },
      } as Parameters<typeof confineTurn>[0],
      policy,
    );
    try {
      assertDoorShape(net, 'turn', turn.argv, ['/opt/claude', '-p', 'x']);
      const envBody = readFileSync(property(turn.argv, 'EnvironmentFile') as string, 'utf8');
      expect(envBody).toContain(`HTTPS_PROXY="http://127.0.0.1:${net.PROXY_PORT}"`);
      expect(envBody).toContain('NODE_USE_ENV_PROXY="1"');
      // The Publication API key reaches the GATE, never the unit: not its argv, not its env.
      expect(turn.argv.join(' ')).not.toContain('publication-secret');
      expect(envBody).not.toContain('publication-secret');
    } finally {
      await turn.cleanup();
    }
    // build and git — RUN through the recording runner, so the argv is what executed.
    for (const door of ['build', 'git'] as const) {
      const runner = recordingPolicy();
      const result = await runConfined(
        { door, argv: ['bun', 'install'], cwd: runner.cwd, env: { PATH: '/usr/bin:/bin' }, timeoutMs: 5_000 } as Parameters<
          typeof runConfined
        >[0],
        runner.policy,
      );
      expect({ door, exit: result.exitCode }).toEqual({ door, exit: 0 });
      expect({ door, reached: reachedForbidden(runner.argv(), runner.policy) }).toEqual({ door, reached: [] });
      assertDoorShape(net, door, runner.argv(), ['bun', 'install']);
      const proxied = runner.envBody().includes(`HTTPS_PROXY="http://127.0.0.1:${net.PROXY_PORT}"`);
      expect({ door, proxied }).toEqual({ door, proxied: door === 'build' });
    }
  });

  test('an opencode turn with no declared provider host is a named refusal — asked of the RUN’s driver', async () => {
    // Hostname-only egress: a turn whose provider nobody named can reach nothing, and says
    // so before a session is accepted rather than failing inside the unit.
    const opencodeHost = systemdPolicy({
      egressFacts: { driver: 'opencode', providerHosts: [], registryHosts: ['registry.npmjs.org'] },
    });
    expect(confinementProblems(opencodeHost, 'turn', 'opencode').join(' ')).toContain('AGENT_PROVIDER_HOSTS');
    // The site's OWN driver decides, not the instance default — in BOTH directions: a
    // claude_code policy asked about an opencode site refuses…
    expect(confinementProblems(systemdPolicy(), 'turn', 'opencode').join(' ')).toContain('AGENT_PROVIDER_HOSTS');
    // …and an opencode-default host with no provider list does NOT refuse a claude_code site,
    // whose plan (api.anthropic.com) is sound.
    expect(confinementProblems(opencodeHost, 'turn', 'claude_code')).toEqual([]);
    // A driver-less question about a turn is a question about the HOST: no plan is judged.
    expect(confinementProblems(opencodeHost, 'turn')).toEqual([]);
    // The GUARANTEE is never driver-less: confineTurn resolves the run's driver (here the
    // instance default) and refuses on its plan.
    await expect(
      confineTurn({ door: 'turn', argv: ['/opt/x'], cwd: '/srv/ws/a', env: {}, timeoutMs: 5_000 }, opencodeHost),
    ).rejects.toThrow(/AGENT_PROVIDER_HOSTS/);
    // The positive control: the same host with a provider named refuses nothing.
    expect(
      confinementProblems(
        systemdPolicy({
          egressFacts: { driver: 'opencode', providerHosts: ['api.provider.example'], registryHosts: [] },
        }),
        'turn',
        'opencode',
      ),
    ).toEqual([]);
  });

  test('the per-turn caps are on the unit, wall clock included', async () => {
    const policy = systemdPolicy({ memoryMax: '3G', cpuQuota: '150%', tasksMax: 64 });
    const turn = await confineTurn(
      { door: 'turn', argv: ['/opt/claude'], cwd: '/srv/ws/site-a', env: {}, timeoutMs: 60_000 },
      policy,
    );
    try {
      expect(property(turn.argv, 'MemoryMax')).toBe('3G');
      expect(property(turn.argv, 'CPUQuota')).toBe('150%');
      expect(property(turn.argv, 'TasksMax')).toBe('64');
      // PID 1's own wall clock, strictly LONGER than the supervisor's timer: the daemon's
      // timer is the one that can report a timeout as an event, and this is the backstop for
      // an agent whose client was killed outright.
      const runtimeMax = Number(property(turn.argv, 'RuntimeMaxSec'));
      expect(runtimeMax).toBeGreaterThan(60);
      // The filesystem: strict, with exactly the turn's workspace and the agent's home.
      expect(turn.argv).toContain('--property=ProtectSystem=strict');
      expect(property(turn.argv, 'ReadWritePaths')).toBe(`/srv/ws/site-a ${policy.agentHome}`);
      expect(turn.argv).toContain('--property=NoNewPrivileges=yes');
    } finally {
      await turn.cleanup();
    }
  });
});

describe("the unit's ExecStart is the shim, and a shim the unit cannot trust is refused", () => {
  test('the daemon states its REAL runtime, shim and masked prefixes', () => {
    // The suite's systemdPolicy() empties the masks (this host is not the one that runs the
    // unit); this row is what keeps that seam from being the production value.
    expect(CONFINEMENT_SHIM_PATH).toBe(SHIM_PATH);
    expect(policyFromConfig().unitExec).toEqual({
      runtime: process.execPath,
      shim: SHIM_PATH,
      maskedPrefixes: UNIT_MASKED_PREFIXES,
    });
    expect([...UNIT_MASKED_PREFIXES].sort()).toEqual(['/home', '/root', '/run', '/tmp', '/var/tmp']);
  });

  test('a shim under a masked prefix, writable by others, or absent is a named refusal', () => {
    const dir = mkdtempSync(join(existsSync('/tmp') ? '/tmp' : tmpdir(), 'dsb-shim-'));
    scratch.push(dir);
    const shim = join(dir, 'egress_shim.ts');
    writeFileSync(shim, readFileSync(SHIM_PATH));
    writeFileSync(join(dir, 'network_profile.ts'), readFileSync(join(dirname(SHIM_PATH), 'network_profile.ts')));
    chmodSync(shim, 0o644);
    chmodSync(join(dir, 'network_profile.ts'), 0o644);
    const withExec = (unitExec: { shim: string; maskedPrefixes: readonly string[] }) =>
      confinementProblems(systemdPolicy({ unitExec: { runtime: process.execPath, ...unitExec } }), 'turn').join(' ');

    // Control: the copy itself is acceptable when nothing is masked.
    expect(withExec({ shim, maskedPrefixes: [] })).toBe('');
    // Under /tmp, which PrivateTmp= hides from the unit: its ExecStart would not exist.
    expect(withExec({ shim, maskedPrefixes: UNIT_MASKED_PREFIXES })).toContain('which the unit masks');
    // Writable by the group: the agent shares the instance group, and could replace it.
    chmodSync(shim, 0o664);
    expect(withExec({ shim, maskedPrefixes: [] })).toContain('group- or world-writable');
    chmodSync(shim, 0o644);
    // …and the one module it imports is held to the same rule.
    chmodSync(join(dir, 'network_profile.ts'), 0o666);
    expect(withExec({ shim, maskedPrefixes: [] })).toContain('network profile');
    // Absent: nothing to execute.
    expect(withExec({ shim: join(dir, 'missing.ts'), maskedPrefixes: [] })).toContain('does not exist');
  });

  test('the egress env wins over the caller’s, and git gets none', async () => {
    const net = await networkLeaf();
    const policy = systemdPolicy();
    const turn = await confineTurn(
      {
        door: 'turn',
        argv: ['/opt/claude'],
        cwd: '/srv/ws/site-a',
        env: {
          PATH: '/usr/bin',
          HTTPS_PROXY: 'http://attacker.example:8080',
          NO_PROXY: '*',
          // A caller cannot re-enable the transpiler cache the agent's HOME could have seeded.
          BUN_RUNTIME_TRANSPILER_CACHE_PATH: '/srv/home/.bun/cache',
        },
        timeoutMs: 60_000,
      },
      policy,
    );
    try {
      const body = readFileSync(property(turn.argv, 'EnvironmentFile') as string, 'utf8');
      expect(body.split('\n').filter(line => line.startsWith('BUN_RUNTIME_TRANSPILER_CACHE_PATH='))).toEqual([
        'BUN_RUNTIME_TRANSPILER_CACHE_PATH="0"',
      ]);
      expect(body).not.toContain('/srv/home/.bun/cache');
      expect(body).toContain(`HTTPS_PROXY="http://127.0.0.1:${net.PROXY_PORT}"`);
      expect(body).toContain('NO_PROXY="127.0.0.1,localhost"');
      expect(body).not.toContain('attacker.example');
      expect(body).toContain('DEDALO_UNIT_WORKDIR="/srv/ws/site-a"');
      expect(body).toContain('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="1"');
    } finally {
      await turn.cleanup();
    }
  });
});

describe('no secret rides on the command line, and none outlives the turn', () => {
  test('the child environment travels in a 0600 file, not in a unit property', async () => {
    const policy = systemdPolicy();
    const turn = await confineTurn(
      {
        door: 'turn',
        argv: ['/opt/claude'],
        cwd: '/srv/ws/site-a',
        env: { PATH: '/usr/bin', HOME: policy.agentHome, ANTHROPIC_API_KEY: 'sk-ant-secret' },
        timeoutMs: 60_000,
      },
      policy,
    );
    const envFile = property(turn.argv, 'EnvironmentFile');
    expect(envFile).toBeDefined();
    // NOT ON THE COMMAND LINE. A transient unit's properties are readable over D-Bus by any
    // uid on the host, so a `--setenv=ANTHROPIC_API_KEY=…` would publish a museum's provider
    // key to every other museum's service user.
    expect(turn.argv.join(' ')).not.toContain('sk-ant-secret');
    // …and not in this process's spawn environment either: the child gets nothing here.
    expect(turn.env).toEqual({});

    const body = readFileSync(envFile as string, 'utf8');
    expect(body).toContain('ANTHROPIC_API_KEY="sk-ant-secret"');
    // eslint-disable-next-line no-bitwise -- the permission word is the assertion
    expect(statSync(envFile as string).mode & 0o777).toBe(0o600);

    // AND IT GOES AWAY. Residence is the half of a credential's exposure that outlives the
    // work it was for.
    await turn.cleanup();
    expect(existsSync(envFile as string)).toBe(false);
  });

  test('a control character in a value is REFUSED rather than escaped', () => {
    expect(() => renderEnvironmentFile({ EVIL: 'a\nExecStart=/bin/sh' })).toThrow(
      ConfinementUnavailableError,
    );
    expect(renderEnvironmentFile({ B: 'two words', A: 'q"uote' })).toBe('A="q\\"uote"\nB="two words"\n');
  });

  test('both drivers write their MCP config 0640, key included, and never wider', async () => {
    // The mode is the assertion, not the bytes: this file carries the museum's Publication
    // API key, and at 0644 it would be readable by every uid on the host — every other
    // museum's service user and every other museum's AGENT included. 0640 leaves exactly the
    // daemon and its own agent, which share this instance's group.
    // UNDER `SITES_ROOT`, because that is where a workspace is and because the writer now
    // takes the trusted root and walks everything below it O_NOFOLLOW: a driver that wrote
    // the key by path — which is what both did — had nothing between the key and a planted
    // link (see the plant legs below).
    mkdirSync(roots.sitesRoot, { recursive: true });
    const workspace = mkdtempSync(join(roots.sitesRoot, 'dedalo-confinement-mcp-'));
    scratch.push(workspace);
    await mkdir(join(workspace, '.builder'), { recursive: true });
    const start = {
      workspace,
      prompt: 'x',
      mcp: {
        name: 'dedalo_publication',
        url: 'http://127.0.0.1:8080/publication/server_api/v2/mcp',
        headers: { 'X-API-Key': 'publication-secret' },
      },
      env: {},
      timeoutMs: 1000,
    };
    for (const write of [writeMcpConfig, writeOpencodeConfig]) {
      const path = await write(start);
      // eslint-disable-next-line no-bitwise -- the permission word is the assertion
      expect({ path, mode: statSync(path).mode & 0o777 }).toEqual({ path, mode: 0o640 });
      expect(readFileSync(path, 'utf8')).toContain('publication-secret');
    }
  });

  test('a real confined turn leaves NO per-turn environment file behind', async () => {
    // The supervisor's own half of the residence story, observed rather than described: a
    // turn is spawned through a stand-in runner (this machine has no systemd), and the
    // daemon's runtime directory is read before and after. `readdirSync` on the turns
    // directory is the assertion — a cleanup that only ran on the happy path, or only in the
    // driver's thunk, leaves the museum's provider keys in a file on disk until reboot.
    const policy = systemdPolicy();
    const runner = policy.systemdRunBin;
    writeFileSync(runner, '#!/bin/sh\necho started\nexit 0\n');
    chmodSync(runner, 0o755);
    const turnDir = join(dirname(policy.listenSocket), 'turns');

    const seen: string[] = [];
    const proc = spawnAgentProcess(
      {
        workspace: tmpdir(),
        prompt: 'x',
        mcp: { name: 'x', url: 'http://x/mcp' },
        env: { ANTHROPIC_API_KEY: 'sk-ant-in-the-file' },
        timeoutMs: 30_000,
      },
      async () => ({ argv: ['/opt/claude'], parseLine: (line: string) => [{ type: 'text' as const, text: line }] }),
      policy,
    );
    for await (const event of proc.events) if (event.type === 'text') seen.push(event.text);

    // The turn really went through the wrapper — otherwise the rest of this asserts nothing.
    expect(seen).toContain('started');
    // …and nothing was announced: a CONFINED turn has nothing to confess.
    expect(seen.some(line => line.includes('[confinement]'))).toBe(false);
    expect(existsSync(turnDir) ? readdirSync(turnDir) : []).toEqual([]);
  });

  test("the claude_code driver deletes its MCP config, whatever the turn did", async () => {
    // The file carries the museum's Publication API key into a directory an agent writes to.
    // Written 0640, deleted when the turn ends — including the turn that FAILED, which is the
    // path a cleanup written after the read loop would never reach.
    mkdirSync(roots.sitesRoot, { recursive: true });
    const workspace = mkdtempSync(join(roots.sitesRoot, 'dedalo-confinement-ws-'));
    scratch.push(workspace);
    await mkdir(join(workspace, '.builder'), { recursive: true });
    const mcpPath = join(workspace, '.builder', 'mcp.json');
    await writeFile(mcpPath, '{}', { mode: 0o640 });

    let cleaned = false;
    const proc = spawnAgentProcess(
      {
        workspace,
        prompt: 'x',
        mcp: { name: 'dedalo_publication', url: 'http://x/mcp' },
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
        timeoutMs: 30_000,
      },
      async () => ({
        argv: ['/usr/bin/false'],
        parseLine: () => [],
        cleanup: async () => {
          cleaned = true;
          rmSync(mcpPath, { force: true });
        },
      }),
    );
    for await (const _event of proc.events) {
      void _event;
    }
    expect(cleaned).toBe(true);
    expect(existsSync(mcpPath)).toBe(false);
  });
});

describe('there is no silent unconfined turn', () => {
  test('every missing piece is its own named refusal, and nothing is spawned', () => {
    for (const [label, policy] of [
      ['no agent uid', systemdPolicy({ agentUser: '' })],
      ['a prefix that is not this museum’s grammar', systemdPolicy({ unitPrefix: 'anything' })],
      ['no systemd-run on this host', systemdPolicy({ systemdRunBin: '/nonexistent/systemd-run' })],
      ['no runtime directory (tcp)', systemdPolicy({ listenKind: 'tcp' })],
    ] as const) {
      const problems = confinementProblems(policy, 'turn');
      expect({ label, problems: problems.length }).toEqual({ label, problems: 1 });
      expect(() => assertConfinementAvailable('turn', policy)).toThrow(ConfinementUnavailableError);
      // 503, so the ENGINE relays "not right now, and here is what is missing" rather than
      // accepting a session that will never run.
      try {
        assertConfinementAvailable('turn', policy);
        throw new Error('unreachable');
      } catch (error) {
        expect((error as ConfinementUnavailableError).status).toBe(503);
      }
    }
    // The positive control: a complete policy refuses nothing. Without it every assertion
    // above would pass against a function that always refused.
    for (const door of ['turn', 'build', 'git'] as const) {
      expect({ door, problems: confinementProblems(systemdPolicy(), door) }).toEqual({ door, problems: [] });
    }
    expect(() => assertConfinementAvailable('turn', systemdPolicy())).not.toThrow();
  });

  test('confineTurn itself refuses too — the check before the reservation is not the guarantee', async () => {
    await expect(
      confineTurn(
        { door: 'turn', argv: ['/opt/claude'], cwd: '/srv/ws/a', env: {}, timeoutMs: 1000 },
        systemdPolicy({ agentUser: '' }),
      ),
    ).rejects.toThrow(ConfinementUnavailableError);
  });

  test("a DECLARED 'none' announces itself into the session's own durable log", async () => {
    // The suite runs under AGENT_CONFINEMENT=none (no systemd here), so this is the daemon's
    // real policy and the announcement is a real event of a real turn — persisted by the
    // session manager exactly like any other text event.
    expect(policyFromConfig().mode).toBe('none');
    const events: AgentEvent[] = [];
    const proc = spawnAgentProcess(
      {
        workspace: tmpdir(),
        prompt: 'x',
        mcp: { name: 'x', url: 'http://x/mcp' },
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
        timeoutMs: 30_000,
      },
      async () => ({ argv: ['/usr/bin/true'], parseLine: () => [] }),
    );
    for await (const event of proc.events) events.push(event);
    const first = events[0];
    expect(first?.type).toBe('text');
    expect(first?.type === 'text' && first.text).toContain('[confinement]');
    expect(first?.type === 'text' && first.text).toContain('UNCONFINED');
    // …and the turn really ran: an announcement instead of a turn would be a different bug.
    expect(events.some(event => event.type === 'result')).toBe(true);
  });

  test("an unconfined turn keeps the driver's own argv and env — it is a run, not a stub", async () => {
    const turn = await confineTurn(
      { door: 'turn', argv: ['/usr/bin/true', 'x'], cwd: '/tmp', env: { PATH: '/usr/bin' }, timeoutMs: 1000 },
      systemdPolicy({ mode: 'none' }),
    );
    expect(turn.argv).toEqual(['/usr/bin/true', 'x']);
    expect(turn.env).toEqual({ PATH: '/usr/bin' });
    expect(turn.unitName).toBeNull();
    expect(turn.announcement).toContain('[confinement]');
  });
});

describe('the tools a turn may use are STATED, not inherited', () => {
  test('Bash, WebFetch and WebSearch are denied on every driver that runs', () => {
    // The refuter's whole narrowing of this finding rested on Bash not being auto-granted in
    // headless mode — another project's default, invisible in this tree and free to change.
    for (const denied of ['Bash', 'WebFetch', 'WebSearch']) {
      expect({ denied, present: DENIED_TOOLS.includes(denied) }).toEqual({ denied, present: true });
      expect({ denied, allowed: ALLOWED_TOOLS.includes(denied) }).toEqual({ denied, allowed: false });
    }
    // The allow list is still a working set: reading and writing files IS the job.
    for (const allowed of ['Read', 'Write', 'Edit']) {
      expect({ allowed, present: ALLOWED_TOOLS.includes(allowed) }).toEqual({ allowed, present: true });
    }
    // OpenCode says the same thing in its own vocabulary, in the file the DAEMON writes.
    expect(DENIED_PERMISSIONS.bash).toBe('deny');
    expect(DENIED_PERMISSIONS.webfetch).toBe('deny');
    expect(DENIED_PERMISSIONS.edit).toBe('allow');
  });

  test('the unimplemented driver REFUSES a turn rather than inheriting a default', () => {
    expect(() =>
      piDriver.startTurn({
        workspace: '/tmp',
        prompt: 'x',
        mcp: { name: 'x', url: 'http://x/mcp' },
        env: {},
        timeoutMs: 1000,
      }),
    ).toThrow();
  });
});

describe('the per-turn environment file lives where only root and the daemon can read it', () => {
  test('it is under the daemon runtime directory, never inside the workspace', async () => {
    const policy = systemdPolicy();
    const turn = await confineTurn(
      { door: 'turn', argv: ['/opt/claude'], cwd: '/srv/ws/site-a', env: { PATH: '/usr/bin' }, timeoutMs: 1000 },
      policy,
    );
    try {
      const envFile = property(turn.argv, 'EnvironmentFile') as string;
      // Inside the workspace it would be a file the AGENT can unlink and replace — and the
      // replacement is read by PID 1, as root, to build the turn's own environment.
      expect(envFile.startsWith('/srv/ws/site-a')).toBe(false);
      expect(dirname(dirname(envFile))).toBe(dirname(policy.listenSocket));
    } finally {
      await turn.cleanup();
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * THE OTHER DOOR — a build step and a git command are agent-authored too
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * A `systemd_scope` policy whose runner RECORDS what it was handed.
 *
 * `runConfined` actually executes the wrapper (that is the difference between it and
 * `confineTurn`, and it is the half the refutation reached through: the argv can be perfect
 * while the thing that runs is something else). The stand-in writes its own argv, and the
 * contents of the EnvironmentFile it was pointed at, into files this gate then reads — so
 * what is asserted is the process that ran, not a plan for one.
 */
/** The hosts the recording runner asks the bound proxy about, while the unit "runs". */
const PROBE_HOSTS = Object.freeze(['api.anthropic.com', 'registry.npmjs.org', 'api.provider.example', 'evil.example.com']);

function recordingPolicy(overrides: Partial<ConfinementPolicy> & Record<string, unknown> = {}) {
  // The gate's resolver and dialer, STATED: every name resolves public, and every dial is
  // refused — so a CONNECT answers 502 for a host ON the run's plan (resolved, dial tried)
  // and 403 for one that is not, and nothing ever leaves this machine.
  const policy = systemdPolicy({
    egressSeams: {
      lookup: async () => [{ address: '93.184.216.34', family: 4 }],
      dial: async () => {
        throw new Error('dial refused by the recording runner');
      },
    },
    ...overrides,
  });
  const dir = dirname(policy.systemdRunBin);
  // WHILE the unit runs, the runner asks the bound proxy.sock about PROBE_HOSTS: what the
  // served gate will tunnel to is then an observation of the run, not of a plan object.
  const probe = join(dir, 'probe.ts');
  writeFileSync(
    probe,
    `import { connect } from 'node:net';
const sock = process.argv[2];
for (const host of ${JSON.stringify(PROBE_HOSTS)}) {
  const status = await new Promise((resolve) => {
    const s = connect(sock);
    let got = '';
    s.on('error', (e) => resolve('error'));
    s.on('data', (c) => { got += c.toString('latin1'); if (got.includes('\\r\\n')) { s.destroy(); resolve(got.split(' ')[1]); } });
    s.write('CONNECT ' + host + ':443 HTTP/1.1\\r\\n\\r\\n');
  });
  console.log(host + ' ' + status);
}
`,
  );
  const argvLog = join(dir, 'argv.log');
  const envLog = join(dir, 'env.log');
  const egressLog = join(dir, 'egress.log');
  // EVERY invocation, numbered, as well: a real call site (commitAll, a build) runs several.
  const callsDir = join(dir, 'calls');
  mkdirSync(callsDir, { recursive: true });
  writeFileSync(
    policy.systemdRunBin,
    '#!/bin/sh\n' +
      `n=$(ls -1 ${callsDir} | grep -c '\\.argv$')\n` +
      `printf '%s\\n' "$@" > ${argvLog}\n` +
      `printf '%s\\n' "$@" > ${callsDir}/$n.argv\n` +
      'for a in "$@"; do\n' +
      '  case "$a" in\n' +
      `    --property=EnvironmentFile=*) cat "\${a#--property=EnvironmentFile=}" > ${envLog}; cp ${envLog} ${callsDir}/$n.env ;;\n` +
      // WHILE the unit runs: what the per-run egress directory it was bound really holds.
      `    --property=BindPaths=*) v="\${a#--property=BindPaths=}"; ls -1 "\${v%%:*}" > ${egressLog} 2>&1; cp ${egressLog} ${callsDir}/$n.egress; ` +
      `"${process.execPath}" ${probe} "\${v%%:*}/proxy.sock" > ${callsDir}/$n.probe 2>&1 ;;\n` +
      '  esac\n' +
      'done\n' +
      'exit 0\n',
    { mode: 0o755 },
  );
  // A REAL cwd: `runConfined` runs the wrapper, and a spawn into a directory that does not
  // exist fails before the wrapper is ever reached.
  const cwd = join(dir, 'workspace');
  mkdirSync(cwd, { recursive: true });
  return {
    policy,
    cwd,
    argv: () => readFileSync(argvLog, 'utf8').split('\n').filter(Boolean),
    envBody: () => readFileSync(envLog, 'utf8'),
    egressListing: () => (existsSync(egressLog) ? readFileSync(egressLog, 'utf8').split('\n').filter(Boolean) : null),
    /** Every invocation of the runner, in order: its argv, env file and bound egress listing. */
    calls: () => {
      const lines = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean) : null);
      const count = readdirSync(callsDir).filter(name => name.endsWith('.argv')).length;
      return Array.from({ length: count }, (_unused, n) => ({
        argv: lines(join(callsDir, `${n}.argv`)) ?? [],
        env: existsSync(join(callsDir, `${n}.env`)) ? readFileSync(join(callsDir, `${n}.env`), 'utf8') : '',
        egress: lines(join(callsDir, `${n}.egress`)),
        /** host → the served proxy's status: 502 = on the plan (dial tried), 403 = not. */
        probe: Object.fromEntries((lines(join(callsDir, `${n}.probe`)) ?? []).map(line => line.split(' '))) as Record<
          string,
          string
        >,
      }));
    },
    envFilePath: () =>
      readFileSync(argvLog, 'utf8')
        .split('\n')
        .find(line => line.startsWith('--property=EnvironmentFile='))
        ?.slice('--property=EnvironmentFile='.length) as string,
  };
}

describe('a build step and a git command run as the AGENT, not as the daemon', () => {
  test('runConfined EXECUTES the wrapper — the uid, the scope and the caps are on what ran', async () => {
    // The refutation this closes: the turn was confined and the BUILD was not, so an agent
    // that rewrote `site.json` (or shipped a package.json whose install scripts run) had its
    // own command executed by the next build AS THE SERVICE USER — the uid that owns the
    // workspaces, the audit trail and the credential directory. The build was a WIDER
    // principal than the turn it was supposed to be no wider than.
    const runner = recordingPolicy();
    const result = await runConfined(
      {
        door: 'build',
        argv: ['bun', 'install'],
        cwd: runner.cwd,
        env: { PATH: '/usr/bin:/bin', HOME: '/srv/home' },
        timeoutMs: 5_000,
        label: 'build step',
      },
      runner.policy,
    );
    expect(result.exitCode).toBe(0);

    const argv = runner.argv();
    expect(argv).toContain(`--uid=${runner.policy.agentUser}`);
    const unit = argv.find(entry => entry.startsWith('--unit='))?.slice('--unit='.length) as string;
    expect(unit.startsWith(runner.policy.unitPrefix)).toBe(true);
    // The UNIT starts in `/` — Bun must load no agent-authored bunfig/.env before the shim
    // has proved the namespace — and the shim runs the step in the workspace it is told.
    expect(argv).toContain('--working-directory=/');
    expect(runner.envBody()).toContain(`DEDALO_UNIT_WORKDIR="${runner.cwd}"`);
    // The build's own command survives the wrapper intact, after the shim's `--`.
    expect(argv.slice(argv.indexOf('--') + 1)).toEqual([process.execPath, SHIM_PATH, '--', 'bun', 'install']);
    // The same egress and the same caps as a turn: a package registry is on the public
    // internet, and the engine, the databases and the LAN are not reachable from either.
    expect({ reached: reachedForbidden(argv, runner.policy) }).toEqual({ reached: [] });
    expect(argv).toContain(`--property=MemoryMax=${runner.policy.memoryMax}`);
    expect(argv).toContain('--property=ProtectSystem=strict');
    // MUTATION CONTROL, on this real argv: one more read-only view of the whole egress/
    // directory must reach a concurrent turn's sockets — or "reached: []" above is blindness.
    const egressRoot = join(dirname(runner.policy.listenSocket), 'egress');
    const sep = argv.indexOf('--');
    const widened = [...argv.slice(0, sep), `--property=BindReadOnlyPaths=${egressRoot}:/run/dedalo-all`, ...argv.slice(sep)];
    expect(reachedForbidden(widened, runner.policy).filter(dest => dest.includes(SIBLING_RUN)).length).toBe(2);
    // …and WITHOUT its PID namespace the same real argv reaches a concurrent turn's two sockets
    // through /proc/<pid>/root, and nothing else — the row above is not blind to that route.
    const shared = argv.filter(arg => arg !== '--property=PrivatePIDs=yes');
    expect(shared.length).toBe(argv.length - 1);
    expect(reachedForbidden(shared, runner.policy)).toEqual([
      `unix:/run/dedalo-sites/test/egress/${SIBLING_RUN}/proxy.sock`,
      `unix:/run/dedalo-sites/test/egress/${SIBLING_RUN}/mcp.sock`,
    ]);
    // …and without its IPC namespace it shares the host's SysV keys.
    expect(reachedForbidden(argv.filter(arg => arg !== '--property=PrivateIPC=yes'), runner.policy)).toEqual([
      'ipc:sysv:0x5a5a0001',
    ]);
  });

  test('what the agent creates stays readable to the daemon — UMask=0007 on the unit', async () => {
    // The other half of the shared tree: the daemon has to read those bytes back to build,
    // promote and commit them, and a 0640 file created by the agent under its own umask
    // would be one the daemon can read and never rewrite. World bits stay closed.
    const runner = recordingPolicy();
    await runConfined(
      { door: 'build', argv: ['bun', 'run', 'build'], cwd: runner.cwd, env: {}, timeoutMs: 5_000 },
      runner.policy,
    );
    expect(runner.argv()).toContain('--property=UMask=0007');
  });

  test('the step environment travels in the per-run 0600 file, and is gone afterwards', async () => {
    const runner = recordingPolicy();
    await runConfined(
      {
        door: 'build',
        argv: ['bun', 'install'],
        cwd: runner.cwd,
        env: { PATH: '/usr/bin:/bin', HOME: '/srv/home' },
        timeoutMs: 5_000,
      },
      runner.policy,
    );
    // It really was readable to the child, as a file — not on the command line, where
    // `systemctl show` and every uid on the host would see it.
    expect(runner.envBody()).toContain('HOME="/srv/home"');
    expect(runner.argv().join(' ')).not.toContain('/srv/home"');
    // …and it does not outlive the step: `runConfined` cleans up in a `finally`.
    expect(existsSync(runner.envFilePath())).toBe(false);
  });

  test('a step whose own command fails still leaves nothing behind', async () => {
    const runner = recordingPolicy();
    writeFileSync(runner.policy.systemdRunBin, '#!/bin/sh\nexit 7\n', { mode: 0o755 });
    const result = await runConfined(
      { door: 'build', argv: ['bun', 'run', 'build'], cwd: runner.cwd, env: {}, timeoutMs: 5_000 },
      runner.policy,
    );
    expect(result.exitCode).toBe(7);
    const turnsDir = join(dirname(runner.policy.listenSocket), 'turns');
    expect(existsSync(turnsDir) ? readdirSync(turnsDir) : []).toEqual([]);
  });

  test("a DECLARED 'none' announces the unconfined step into the build's own log", async () => {
    const chunks: string[] = [];
    const result = await runConfined(
      {
        door: 'build',
        argv: ['/bin/echo', 'built'],
        cwd: '/tmp',
        env: { PATH: '/usr/bin:/bin' },
        timeoutMs: 5_000,
        label: 'build step',
        onStdout: chunk => chunks.push(chunk),
      },
      systemdPolicy({ mode: 'none' }),
    );
    expect(result.exitCode).toBe(0);
    // The log a museum reads afterwards says which principal ran its build. Silence would
    // make an unconfined build indistinguishable from a confined one.
    expect(chunks[0]).toContain('[confinement]');
    expect(chunks[0]).toContain('UNCONFINED');
    expect(chunks[0]).toContain('build step');
    // And it is a RUN, not a stub: the command still executed, unwrapped.
    expect(chunks.join('')).toContain('built');
  });

  test('a host that cannot confine refuses the step rather than running it as the daemon', async () => {
    const runner = recordingPolicy({ agentUser: '' });
    await expect(
      runConfined(
        { door: 'build', argv: ['bun', 'install'], cwd: runner.cwd, env: {}, timeoutMs: 5_000 },
        runner.policy,
      ),
    ).rejects.toBeInstanceOf(ConfinementUnavailableError);
    expect(existsSync(join(dirname(runner.policy.systemdRunBin), 'argv.log'))).toBe(false);
  });
});

describe('the confinement is a DOOR: nothing runs in a workspace around it', () => {
  test('runBinary refuses a cwd inside the workspaces root', async () => {
    // The structural half. `src/build/builder.ts` and `src/sites/git.ts` go through
    // `runConfined`, but a gate that only asserted that would be answered by the next call
    // site added beside them — which is exactly how the build door was left open while the
    // turn was closed. The refusal lives at the one place a process is created.
    await expect(
      runBinary(['/bin/echo', 'hi'], { cwd: roots.sitesRoot, timeoutMs: 5_000 }),
    ).rejects.toThrow(/runConfined/);
    await expect(
      runBinary(['/bin/echo', 'hi'], {
        cwd: join(roots.sitesRoot, 'site-a', 'src'),
        timeoutMs: 5_000,
      }),
    ).rejects.toThrow(/inside the site workspaces/);
    // Relative and climbing spellings are the same question — it is asked on the RESOLVED
    // path, never on the string. Spelled as a raw string, because `join()` normalizes its
    // argument: a test that passes join(root,'..',basename(root),'site-b') hands runBinary
    // an already-clean `<root>/site-b` and proves nothing about the resolve() in the door.
    await expect(
      runBinary(['/bin/echo', 'hi'], {
        cwd: `${roots.sitesRoot}/../${basename(roots.sitesRoot)}/site-b`,
        timeoutMs: 5_000,
      }),
    ).rejects.toThrow(/inside the site workspaces/);
    // And a RELATIVE cwd, which a config key spelled without a leading slash produces:
    // resolved against this process's cwd, it is the same directory or it is not.
    const previousCwd = process.cwd();
    mkdirSync(dirname(roots.sitesRoot), { recursive: true });
    process.chdir(dirname(roots.sitesRoot));
    try {
      await expect(
        runBinary(['/bin/echo', 'hi'], {
          cwd: `${basename(roots.sitesRoot)}/site-c`,
          timeoutMs: 5_000,
        }),
      ).rejects.toThrow(/inside the site workspaces/);
    } finally {
      process.chdir(previousCwd);
    }
  });

  test('and it runs everything else — the refusal is scoped, not a wall', async () => {
    // The positive control. Without it the assertions above are satisfied by a `runBinary`
    // that refuses everything, which would be a daemon that cannot probe a driver version.
    const outside = await runBinary(['/bin/echo', 'probe'], { cwd: tmpdir(), timeoutMs: 5_000 });
    expect(outside.exitCode).toBe(0);
    expect(outside.stdout.trim()).toBe('probe');
    // And the confinement's own token opens it — the door has exactly one key.
    mkdirSync(roots.sitesRoot, { recursive: true });
    const through = await runBinary(['/bin/echo', 'confined'], {
      cwd: roots.sitesRoot,
      timeoutMs: 5_000,
      confined: CONFINED_ARGV,
    });
    expect(through.exitCode).toBe(0);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * THE TREE THE TWO UIDS SHARE
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a workspace is created so the OTHER uid can actually work in it', () => {
  /** A scratch tree under the daemon's own umask — the condition that produced the defect. */
  function underDaemonUmask<T>(body: (dir: string) => Promise<T>): Promise<T> {
    const previous = process.umask(0o027);
    const dir = mkdtempSync(join(tmpdir(), 'dedalo-shared-tree-'));
    scratch.push(dir);
    return body(dir).finally(() => {
      process.umask(previous);
    });
  }

  const bits = (path: string) => statSync(path).mode & 0o7777;

  test('the daemon umask really strips the group write bit — the control', async () => {
    // Without this the three assertions below could pass on a machine whose umask happens
    // to be 0002, and the defect (mkdir asking for 2770 and getting 2750) would be invisible
    // exactly where it happened: on a provisioned host, where UMask=0027 is on the unit.
    await underDaemonUmask(async dir => {
      const plain = join(dir, 'plain');
      await mkdir(plain, { recursive: true, mode: 0o2770 });
      expect(bits(plain) & 0o020).toBe(0);
    });
  });

  test('a shared directory is 2770 whatever the umask, at every level it created', async () => {
    await underDaemonUmask(async dir => {
      await mkdirShared(dir, join('workspaces', 'site-a'));
      // The LITERAL, not the constant: `expect(bits(x)).toBe(SHARED_DIR_MODE)` alone is
      // satisfied by any value the constant is changed to, so it would pin nothing.
      expect(SHARED_DIR_MODE).toBe(0o2770);
      expect(bits(join(dir, 'workspaces', 'site-a'))).toBe(0o2770);
      // The parent too: a 2770 child under a 0750 parent is a directory the group cannot
      // reach, which is the same failure one level up.
      expect(bits(join(dir, 'workspaces'))).toBe(0o2770);
    });
  });

  test('a shared file is 0660 — the agent EDITS site.json and AGENTS.md, it does not read them', async () => {
    await underDaemonUmask(async dir => {
      await writeFileShared(dir, 'AGENTS.md', 'brief');
      expect(SHARED_FILE_MODE).toBe(0o660);
      expect(bits(join(dir, 'AGENTS.md'))).toBe(0o660);
      // Atomic writes carry the mode over the rename — the inode moves, so the mode has to
      // be set on the temporary file or the manifest lands 0640 on every save.
      await writeFileSharedAtomic(dir, 'site.json', '{}');
      expect(bits(join(dir, 'site.json'))).toBe(0o660);
      expect(existsSync(join(dir, 'site.json.tmp'))).toBe(false);
      // And the daemon's own files inside the same tree are its own. The writers do NOT
      // create parents: a write states an existing chain, which is what makes every
      // component of it checkable.
      await mkdirPrivate(dir, join('.builder', 'builds'));
      await writeFilePrivate(dir, join('.builder', 'builds', 'b1.json'), '{}');
      expect(PRIVATE_FILE_MODE).toBe(0o600);
      expect(bits(join(dir, '.builder', 'builds', 'b1.json'))).toBe(0o600);
      await appendFilePrivate(dir, join('.builder', 'builds', 'b1.log'), 'line\n');
      await appendFilePrivate(dir, join('.builder', 'builds', 'b1.log'), 'two\n');
      expect(readFileSync(join(dir, '.builder', 'builds', 'b1.log'), 'utf8')).toBe('line\ntwo\n');
      expect(bits(join(dir, '.builder', 'builds', 'b1.log'))).toBe(0o600);
    });
  });

  test('a nested private path does not WIDEN the private directory above it', async () => {
    // MEASURED DEFECT: `ensureDir` moded every component it walked, giving non-leaf ones the
    // SHARED mode. `mkdirPrivate('<slug>/.builder/builds')` — which is what the first build
    // of a site calls — therefore re-opened `.builder` from 0700 to 2770, handing the agent
    // uid rwx on the daemon's own state: it could unlink a 0600 build record and write its
    // own in its place, for the API to serve back as the daemon's.
    await underDaemonUmask(async dir => {
      await mkdirShared(dir, 'ws');
      await mkdirPrivate(dir, join('ws', '.builder'));
      expect(bits(join(dir, 'ws', '.builder'))).toBe(0o700);
      await mkdirPrivate(dir, join('ws', '.builder', 'builds'));
      expect(bits(join(dir, 'ws', '.builder'))).toBe(0o700);
      expect(bits(join(dir, 'ws', '.builder', 'builds'))).toBe(0o700);
      // The workspace above it is untouched by a call that did not create it.
      expect(bits(join(dir, 'ws'))).toBe(0o2770);
      // And a private path whose parents are MISSING creates them private, never shared:
      // widening on the way to a private leaf is the same defect one level up.
      await mkdirPrivate(dir, join('ws', 'deep', 'state'));
      expect(bits(join(dir, 'ws', 'deep'))).toBe(0o700);
      // The shared door refuses to be the way in: `.builder` is never created shared.
      await expect(mkdirShared(dir, join('ws', '.builder', 'x'))).rejects.toThrow(/mkdirPrivate/);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────────────
   * THE PLANT THE OPEN TREE MADE POSSIBLE
   *
   * Opening the workspace to the agent (2770, which is what lets a turn work at all) also
   * let it drop a symlink where the DAEMON writes. `confinedPath` is lexical: it proves the
   * spelling and knows nothing about the inode. A daemon-side writeFile/chmod through a
   * planted link is PUB-01 handed back — the 0600 audit trail truncated, refilled with
   * agent-authored text and re-moded 0660 — with the daemon's own uid doing it.
   *
   * Each leg plants at one of the three real targets and asserts the OUTSIDE file is
   * untouched: same bytes, same mode, and the refusal names the path.
   * ────────────────────────────────────────────────────────────────────────────────── */
  describe('a symlink where the daemon writes is refused, never followed', () => {
    /** An outside file with the audit trail's own shape: 0600, content that must survive. */
    function outsideVictim(dir: string): string {
      const victim = join(dir, 'audit.jsonl');
      writeFileSync(victim, '{"actor":1}\n', { mode: 0o600 });
      chmodSync(victim, 0o600);
      return victim;
    }

    const untouched = (victim: string) => {
      expect(readFileSync(victim, 'utf8')).toBe('{"actor":1}\n');
      expect(bits(victim)).toBe(0o600);
    };

    test('the manifest tmp file — the publish-path plant', async () => {
      await underDaemonUmask(async dir => {
        const victim = outsideVictim(dir);
        const ws = join(dir, 'ws');
        await mkdirShared(dir, 'ws');
        symlinkSync(victim, join(ws, 'site.json.tmp'));
        await expect(
          writeFileSharedAtomic(dir, join('ws', 'site.json'), '{"name":"PWNED"}'),
        ).rejects.toBeInstanceOf(PlantedSymlinkError);
        untouched(victim);
      });
    });

    test('AGENTS.md — the regeneration plant', async () => {
      await underDaemonUmask(async dir => {
        const victim = outsideVictim(dir);
        await mkdirShared(dir, 'ws');
        symlinkSync(victim, join(dir, 'ws', 'AGENTS.md'));
        await expect(writeFileShared(dir, join('ws', 'AGENTS.md'), 'brief')).rejects.toBeInstanceOf(
          PlantedSymlinkError,
        );
        untouched(victim);
      });
    });

    test('.builder — the every-build plant, and the chmod it would have carried', async () => {
      await underDaemonUmask(async dir => {
        const target = join(dir, 'target');
        mkdirSync(target, { recursive: true });
        chmodSync(target, 0o750);
        await mkdirShared(dir, 'ws');
        symlinkSync(target, join(dir, 'ws', '.builder'));
        // mkdirPrivate would have chmodded `target` to 0700 and then created a 2770
        // directory inside it: an agent-directed chmod of anything the daemon can reach.
        await expect(
          mkdirPrivate(dir, join('ws', '.builder', 'builds')),
        ).rejects.toBeInstanceOf(PlantedSymlinkError);
        expect(bits(target)).toBe(0o750);
        expect(existsSync(join(target, 'builds'))).toBe(false);
      });
    });

    test('and a build record written through a replaced .builder', async () => {
      await underDaemonUmask(async dir => {
        const victim = outsideVictim(dir);
        await mkdirShared(dir, 'ws');
        await mkdirPrivate(dir, join('ws', '.builder', 'builds'));
        symlinkSync(victim, join(dir, 'ws', '.builder', 'builds', 'b1.json'));
        await expect(
          writeFilePrivate(dir, join('ws', '.builder', 'builds', 'b1.json'), '{"outcome":"x"}'),
        ).rejects.toBeInstanceOf(PlantedSymlinkError);
        await expect(
          appendFilePrivate(dir, join('ws', '.builder', 'builds', 'b1.json'), 'x'),
        ).rejects.toBeInstanceOf(PlantedSymlinkError);
        untouched(victim);
      });
    });

    test('a link in a PARENT component is refused too — O_NOFOLLOW asks about the last one', async () => {
      await underDaemonUmask(async dir => {
        const outsideDir = join(dir, 'outside');
        mkdirSync(outsideDir, { recursive: true });
        const victim = join(outsideDir, 'AGENTS.md');
        writeFileSync(victim, '{"actor":1}\n', { mode: 0o600 });
        chmodSync(victim, 0o600);
        await mkdirShared(dir, 'ws');
        // The last component is a real file; the DIRECTORY above it is the link. An open
        // with O_NOFOLLOW alone would happily truncate `outside/AGENTS.md`.
        symlinkSync(outsideDir, join(dir, 'ws', 'sub'));
        await expect(
          writeFileShared(dir, join('ws', 'sub', 'AGENTS.md'), 'brief'),
        ).rejects.toBeInstanceOf(PlantedSymlinkError);
        untouched(victim);
      });
    });

    test('the refusal names the path, and the positive control still writes', async () => {
      await underDaemonUmask(async dir => {
        await mkdirShared(dir, 'ws');
        symlinkSync(join(dir, 'elsewhere'), join(dir, 'ws', 'AGENTS.md'));
        await expect(writeFileShared(dir, join('ws', 'AGENTS.md'), 'x')).rejects.toThrow(
          /symlink at '.*ws\/AGENTS\.md'/,
        );
        // Without this the four legs above are satisfied by a module that refuses
        // everything — a daemon that can never create a site.
        await writeFileShared(dir, join('ws', 'README.md'), 'ok');
        expect(readFileSync(join(dir, 'ws', 'README.md'), 'utf8')).toBe('ok');
        expect(bits(join(dir, 'ws', 'README.md'))).toBe(0o660);
      });
    });


    /*
     * THE FOUR WRITERS THAT WERE STILL PATH-BASED — the same plant, one call site each.
     *
     * The first repair routed the workspace-building modules through this module and scoped
     * the census to their directories, which is exactly the shape of a census that misses
     * things: `sites/git.ts` (the exclusion, rewritten on EVERY commit, into a `.git` the
     * agent owns), both drivers' MCP configs (which carry the museum's Publication API key)
     * and the session store (every event of every turn) were all still writing by path.
     * Measured on this suite before the repair: the outside 0600 file was truncated and
     * refilled by the daemon in each case.
     */
    async function plantedWorkspace(name: string): Promise<{ ws: string; victim: string }> {
      mkdirSync(roots.sitesRoot, { recursive: true });
      const ws = join(roots.sitesRoot, name);
      rmSync(ws, { recursive: true, force: true });
      mkdirSync(ws, { recursive: true });
      scratch.push(ws);
      const outside = mkdtempSync(join(tmpdir(), 'dedalo-plant-victim-'));
      scratch.push(outside);
      const victim = join(outside, 'audit.jsonl');
      writeFileSync(victim, '{"actor":1}\n', { mode: 0o600 });
      chmodSync(victim, 0o600);
      return { ws, victim };
    }

    const survived = (victim: string) => {
      expect(readFileSync(victim, 'utf8')).toBe('{"actor":1}\n');
      expect(bits(victim)).toBe(0o600);
    };

    test("the MCP config — the credential plant, in BOTH drivers", async () => {
      const { ws, victim } = await plantedWorkspace('zzplantmcp');
      const start = {
        workspace: ws,
        prompt: 'x',
        mcp: { name: 'dedalo_publication', url: 'http://127.0.0.1:8080/mcp', headers: { 'X-API-Key': 'THE-MUSEUM-KEY' } },
        env: {},
        timeoutMs: 1000,
      };
      // claude_code writes into `.builder/`; the agent can replace that whole directory.
      mkdirSync(join(ws, '.builder'));
      symlinkSync(victim, join(ws, '.builder', 'mcp.json'));
      await expect(writeMcpConfig(start)).rejects.toBeInstanceOf(PlantedSymlinkError);
      survived(victim);
      // opencode writes at the workspace ROOT, under a filename the agent is told to leave
      // alone — which is a name it knows and can therefore replace with a link.
      symlinkSync(victim, join(ws, 'opencode.json'));
      await expect(writeOpencodeConfig(start)).rejects.toBeInstanceOf(PlantedSymlinkError);
      survived(victim);
      expect(readFileSync(victim, 'utf8')).not.toContain('THE-MUSEUM-KEY');
    });

    test('the git exclusion — the plant on every commit, in a .git the AGENT owns', async () => {
      const { ws, victim } = await plantedWorkspace('zzplantgit');
      mkdirSync(join(ws, '.git', 'info'), { recursive: true });
      // (1) the tmp sibling the atomic writer creates: a refusal.
      symlinkSync(victim, join(ws, '.git', 'info', 'exclude.tmp'));
      await expect(excludeDaemonState('zzplantgit')).rejects.toBeInstanceOf(PlantedSymlinkError);
      survived(victim);
      rmSync(join(ws, '.git', 'info', 'exclude.tmp'));
      // (2) a link at the TARGET: `rename` replaces the link, it never writes through it —
      // which is the property that lets this daemon write into a directory it does not own.
      symlinkSync(victim, join(ws, '.git', 'info', 'exclude'));
      await excludeDaemonState('zzplantgit').catch(() => {
        // the `git rm --cached` that follows needs a real repository; the WRITE is the subject
      });
      survived(victim);
      expect(lstatSync(join(ws, '.git', 'info', 'exclude')).isSymbolicLink()).toBe(false);
      expect(readFileSync(join(ws, '.git', 'info', 'exclude'), 'utf8')).toContain('/.builder/');
      // (3) a link where a DIRECTORY component belongs.
      rmSync(join(ws, '.git'), { recursive: true, force: true });
      mkdirSync(join(ws, '.git'));
      symlinkSync(dirname(victim), join(ws, '.git', 'info'));
      await expect(excludeDaemonState('zzplantgit')).rejects.toBeInstanceOf(PlantedSymlinkError);
      survived(victim);
    });

    test('the session transcript — the plant on every event', async () => {
      const { ws, victim } = await plantedWorkspace('zzplantsess');
      // The agent may unlink `.builder` and put its own name there (accepted: availability).
      // What it may not do is have the daemon write the session log through it.
      symlinkSync(dirname(victim), join(ws, '.builder'));
      await expect(
        appendEvent('zzplantsess', 'sess1', { type: 'text', text: 'transcript' }),
      ).rejects.toBeInstanceOf(PlantedSymlinkError);
      await expect(
        writeMeta({
          session_id: 'sess1',
          slug: 'zzplantsess',
          driver: 'claude_code',
          started_at: new Date().toISOString(),
          turns: 1,
          state: 'idle',
          resume_token: null,
        }),
      ).rejects.toBeInstanceOf(PlantedSymlinkError);
      survived(victim);
      expect(existsSync(join(dirname(victim), 'sessions'))).toBe(false);

      // AND THE SAME PLANT ONE LEVEL DOWN, with every directory genuinely the daemon's: the
      // JSONL log and the meta sidecar are the files, and a refusal that only ever came from
      // the directory walk would leave both writers path-based.
      rmSync(join(ws, '.builder'));
      mkdirSync(join(ws, '.builder', 'sessions'), { recursive: true });
      symlinkSync(victim, join(ws, '.builder', 'sessions', 'sess2.jsonl'));
      await expect(
        appendEvent('zzplantsess', 'sess2', { type: 'text', text: 'transcript' }),
      ).rejects.toBeInstanceOf(PlantedSymlinkError);
      // The meta sidecar is written ATOMICALLY (tmp + rename), so it has the two legs the
      // git exclusion has: a link at the TMP name is refused, and a link at the TARGET is
      // REPLACED by the rename rather than written through. Both leave the victim intact,
      // which is the property under test; the rename is what also keeps a concurrent
      // `readMeta` from ever seeing a half-written sidecar.
      const meta = {
        session_id: 'sess2',
        slug: 'zzplantsess',
        driver: 'claude_code' as const,
        started_at: new Date().toISOString(),
        turns: 1,
        state: 'idle' as const,
        resume_token: null,
      };
      symlinkSync(victim, join(ws, '.builder', 'sessions', 'sess2.meta.json.tmp'));
      await expect(writeMeta(meta)).rejects.toBeInstanceOf(PlantedSymlinkError);
      survived(victim);
      rmSync(join(ws, '.builder', 'sessions', 'sess2.meta.json.tmp'));
      symlinkSync(victim, join(ws, '.builder', 'sessions', 'sess2.meta.json'));
      await writeMeta(meta);
      survived(victim);
      const sidecar = join(ws, '.builder', 'sessions', 'sess2.meta.json');
      expect(lstatSync(sidecar).isSymbolicLink()).toBe(false);
      expect(bits(sidecar)).toBe(0o600);
      expect(readFileSync(sidecar, 'utf8')).toContain('"session_id": "sess2"');
      // The positive control: an unplanted session really is written, 0600.
      await appendEvent('zzplantsess', 'sess3', { type: 'text', text: 'ok' });
      const log = join(ws, '.builder', 'sessions', 'sess3.jsonl');
      expect(readFileSync(log, 'utf8')).toContain('"text":"ok"');
      expect(bits(log)).toBe(0o600);
    });

    test('a HARD link is refused too — O_NOFOLLOW cannot see a second name', async () => {
      // A symlink is a pointer a check can see; a hard link is the SAME INODE under another
      // name, so `O_NOFOLLOW` is silent about it and the write lands in the original file
      // with nothing anywhere to notice. An agent uid that can read a 0660 instance file can
      // link it into its own tree under a name this daemon writes. The link COUNT is the
      // only thing that says so, and it is read off the handle before anything is truncated.
      await underDaemonUmask(async dir => {
        const victim = join(dir, 'audit.jsonl');
        writeFileSync(victim, '{"actor":1}\n', { mode: 0o600 });
        chmodSync(victim, 0o600);
        await mkdirShared(dir, 'ws');
        await mkdirPrivate(dir, join('ws', '.builder'));
        linkSync(victim, join(dir, 'ws', 'AGENTS.md'));
        linkSync(victim, join(dir, 'ws', '.builder', 'build.json'));
        await expect(writeFileShared(dir, join('ws', 'AGENTS.md'), 'x')).rejects.toBeInstanceOf(
          PlantedHardLinkError,
        );
        await expect(
          writeFilePrivate(dir, join('ws', '.builder', 'build.json'), '{}'),
        ).rejects.toBeInstanceOf(PlantedHardLinkError);
        // Not truncated, not appended to, not re-moded: the open carries no O_TRUNC, so the
        // question is asked before the file can be emptied as a side effect of asking it.
        expect(readFileSync(victim, 'utf8')).toBe('{"actor":1}\n');
        expect(bits(victim)).toBe(0o600);
        // The positive control: one name is the ordinary case and still writes.
        await writeFileShared(dir, join('ws', 'README.md'), 'ok');
        expect(readFileSync(join(dir, 'ws', 'README.md'), 'utf8')).toBe('ok');
      });
    });

    test('a file this daemon does not OWN is refused — the plant O_NOFOLLOW and nlink both miss', async () => {
      // The third way to put your inode where this daemon writes: not a link at all. The
      // agent uid can unlink a file in a 2770 workspace and author its own in its place —
      // `opencode.json`, whose name it is told and can therefore recreate. The write would
      // then land the museum's Publication API key in a file whose MODE the agent chose, and
      // the closing `fchmod` would fail EPERM only AFTER the bytes were on disk.
      //
      // Two uids cannot be produced in this suite, so the QUESTION is moved instead of the
      // file: `process.getuid` answers someone else for the duration, which is exactly what
      // the daemon sees when the inode is the agent's.
      await underDaemonUmask(async dir => {
        await mkdirShared(dir, 'ws');
        await writeFileShared(dir, join('ws', 'opencode.json'), '{"mine":true}');
        const real = process.getuid;
        Object.defineProperty(process, 'getuid', { value: () => 999_999, configurable: true });
        try {
          await expect(
            writeFileAgentReadable(dir, join('ws', 'opencode.json'), '{"key":"THE-MUSEUM-KEY"}'),
          ).rejects.toBeInstanceOf(ForeignOwnerError);
          await expect(
            writeFileShared(dir, join('ws', 'opencode.json'), 'x'),
          ).rejects.toBeInstanceOf(ForeignOwnerError);
          // Nothing written: not the key, not a wider mode.
          expect(readFileSync(join(dir, 'ws', 'opencode.json'), 'utf8')).toBe('{"mine":true}');
          expect(readFileSync(join(dir, 'ws', 'opencode.json'), 'utf8')).not.toContain('MUSEUM-KEY');
        } finally {
          Object.defineProperty(process, 'getuid', { value: real, configurable: true });
        }
        // The positive control, with the daemon's real uid back: the same write succeeds 0640.
        await writeFileAgentReadable(dir, join('ws', 'opencode.json'), '{"key":"k"}');
        expect(bits(join(dir, 'ws', 'opencode.json'))).toBe(0o640);
      });
    });

    test('a build record this daemon did not write is not read back as its own', async () => {
      await underDaemonUmask(async dir => {
        await mkdirShared(dir, 'ws');
        await mkdirPrivate(dir, join('ws', '.builder'));
        await writeFilePrivate(dir, join('ws', '.builder', 'build.json'), '{"id":"b1"}');
        const real = process.getuid;
        Object.defineProperty(process, 'getuid', { value: () => 999_999, configurable: true });
        try {
          await expect(
            readFilePrivate(dir, join('ws', '.builder', 'build.json')),
          ).rejects.toBeInstanceOf(ForeignOwnerError);
        } finally {
          Object.defineProperty(process, 'getuid', { value: real, configurable: true });
        }
        // SHARED READS ARE THE OTHER LAW ON PURPOSE, and it is asserted in the same test so
        // the asymmetry cannot be read as an oversight: `site.json` is 0660 and the agent may
        // legitimately rewrite it, so what the shared door proves is the INODE (no link, no
        // second name) and the schema proves the content. Only the daemon's own state — a
        // build record, a session transcript it replays as its own word — asks who wrote it.
        await writeFileShared(dir, join('ws', 'site.json'), '{"slug":"x"}');
        Object.defineProperty(process, 'getuid', { value: () => 999_999, configurable: true });
        try {
          expect(await readFileShared(dir, join('ws', 'site.json'))).toBe('{"slug":"x"}');
        } finally {
          Object.defineProperty(process, 'getuid', { value: real, configurable: true });
        }
        expect(await readFilePrivate(dir, join('ws', '.builder', 'build.json'))).toBe('{"id":"b1"}');
        // An absent file is `null` from both doors — an ordinary answer, never a refusal.
        expect(await readFilePrivate(dir, join('ws', '.builder', 'nope.json'))).toBeNull();
        expect(await readFileShared(dir, join('ws', 'nope.json'))).toBeNull();
      });
    });

    test('the agent-readable writer is 0640 — read by the turn, writable by no one but the daemon', async () => {
      await underDaemonUmask(async dir => {
        await mkdirShared(dir, 'ws');
        await mkdirPrivate(dir, join('ws', '.builder'));
        await writeFileAgentReadable(dir, join('ws', '.builder', 'mcp.json'), '{}');
        // The LITERAL beside the constant: the turn's own process reads the museum's key out
        // of this file (group r), and nothing it writes may repoint its MCP client (no group w).
        expect(bits(join(dir, 'ws', '.builder', 'mcp.json'))).toBe(0o640);
      });
    });

    test('applySharedModes does not chmod through a link either', async () => {
      await underDaemonUmask(async dir => {
        const victim = outsideVictim(dir);
        await mkdirShared(dir, 'ws');
        symlinkSync(victim, join(dir, 'ws', 'index.html'));
        const outsideDir = join(dir, 'outside');
        mkdirSync(outsideDir, { recursive: true });
        chmodSync(outsideDir, 0o700);
        symlinkSync(outsideDir, join(dir, 'ws', 'src'));
        await applySharedModes(join(dir, 'ws'));
        untouched(victim);
        expect(bits(outsideDir)).toBe(0o700);
      });
    });
  });

  test('a tree written by something else is restated, and the daemon keeps .builder', async () => {
    await underDaemonUmask(async dir => {
      await mkdir(join(dir, 'src'), { recursive: true });
      await writeFile(join(dir, 'src', 'index.html'), '<h1/>', 'utf8');
      await mkdirPrivate(dir, '.builder');
      await writeFile(join(dir, '.builder', 'build.json'), '{}', 'utf8');
      await applySharedModes(dir);

      expect(bits(join(dir, 'src'))).toBe(0o2770);
      expect(bits(join(dir, 'src', 'index.html'))).toBe(0o660);
      // The one exception: the daemon's own per-site state stays its own.
      expect(bits(join(dir, '.builder'))).toBe(PRIVATE_DIR_MODE);
      expect(PRIVATE_DIR_MODE).toBe(0o700);
      // Nothing else may enter it, so the walk must not have opened what is inside either:
      // a build record restated to 0660 would be a record the agent rewrites the day the
      // directory itself is recreated by a turn.
      expect(bits(join(dir, '.builder')) & 0o077).toBe(0);
      expect(bits(join(dir, '.builder', 'build.json'))).not.toBe(SHARED_FILE_MODE);
    });
  });
});

/**
 * THE READ DIRECTION — the same confused deputy, and the half the first repair left open.
 *
 * PUB-01's stated impact is that the agent can READ the daemon's `SERVICE_TOKEN`, the
 * instance `.env` and the 0600 actor audit trail. Closing every daemon-side WRITE does not
 * close that: a `readFile` on a LEXICAL `confinedPath` follows a planted link exactly as a
 * `writeFile` did, and the daemon then hands the bytes back over the museum's own API.
 *
 * MEASURED, with agent-uid actions only (the agent may unlink `.builder` and rebuild it —
 * accepted as availability, `sites/workspace.ts`): `rm -rf .builder; mkdir -p
 * .builder/builds; echo '{"id":"b1"…}' > b1.json; ln -s <daemon secret> b1.log` made
 * `getBuildLog` return `SERVICE_TOKEN=…` and `GET /sites/<slug>/builds/b1` serve it as
 * `{...record, log}`. The same shape was live at `getBuild`, `readManifest`, `replayEvents`,
 * `readMeta` and `listSessions`.
 *
 * So every one of those doors is asserted here to REFUSE — with the secret's bytes never
 * appearing in what comes back — and each has its positive control, because a module that
 * refused everything would satisfy the refusals alone.
 */
describe('a planted link is not READ through either — the daemon does not serve what it was pointed at', () => {
  const SECRET = 'SERVICE_TOKEN=super-secret-bearer\n';

  /** A workspace under the real SITES_ROOT, plus a 0600 daemon secret OUTSIDE it. */
  function readPlantWorkspace(name: string): { ws: string; secret: string } {
    mkdirSync(roots.sitesRoot, { recursive: true });
    const ws = join(roots.sitesRoot, name);
    rmSync(ws, { recursive: true, force: true });
    mkdirSync(ws, { recursive: true });
    scratch.push(ws);
    // OUTSIDE the workspace but on ITS filesystem: the hard-link plant below needs one
    // device, as the real attack does. tmpdir() is another mount on a CI runner whose
    // checkout is a volume (GitLab's /builds) — linkSync then dies EXDEV (2026-09-26).
    const outside = mkdtempSync(join(dirname(roots.sitesRoot), 'dedalo-read-victim-'));
    scratch.push(outside);
    const secret = join(outside, 'service.env');
    writeFileSync(secret, SECRET, { mode: 0o600 });
    chmodSync(secret, 0o600);
    return { ws, secret };
  }

  const record = (id: string) =>
    JSON.stringify({
      id,
      outcome: 'success',
      started_at: '2026-01-01T00:00:00.000Z',
      finished_at: '2026-01-01T00:00:01.000Z',
      release: null,
      error: null,
    });

  test('the build log and the build record — the exploit as it was measured', async () => {
    const { ws, secret } = readPlantWorkspace('zzreadbuild');
    const builds = join(ws, '.builder', 'builds');
    mkdirSync(builds, { recursive: true });
    writeFileSync(join(builds, 'b1.json'), record('b1'));
    symlinkSync(secret, join(builds, 'b1.log'));

    // THE LEAK: `getBuildLog` opened the link as the daemon and `handleGetBuild` returned
    // the bytes as `{...record, log}`. It is a refusal now, and the refusal NAMES the path.
    await expect(getBuildLog('zzreadbuild', 'b1')).rejects.toBeInstanceOf(PlantedSymlinkError);
    await expect(getBuildLog('zzreadbuild', 'b1')).rejects.toThrow(/b1\.log/);

    // The record itself is the same door.
    rmSync(join(builds, 'b1.json'));
    symlinkSync(secret, join(builds, 'b1.json'));
    await expect(getBuild('zzreadbuild', 'b1')).rejects.toBeInstanceOf(PlantedSymlinkError);
    // …including through `latestBuild`, which is what the site list calls.
    await expect(latestBuild('zzreadbuild')).rejects.toBeInstanceOf(PlantedSymlinkError);

    // A DIRECTORY COMPONENT, which is the plant the agent can actually make: `.builder` is
    // 0700 INSIDE a 2770 workspace, so the turn cannot enter it but can replace it.
    rmSync(join(ws, '.builder'), { recursive: true, force: true });
    symlinkSync(dirname(secret), join(ws, '.builder'));
    await expect(getBuildLog('zzreadbuild', 'b1')).rejects.toBeInstanceOf(PlantedSymlinkError);
    await expect(latestBuild('zzreadbuild')).rejects.toBeInstanceOf(PlantedSymlinkError);

    // A HARD LINK, which `O_NOFOLLOW` cannot see: the read door reads `nlink` too, so the
    // secret is not served under a second name either.
    rmSync(join(ws, '.builder'));
    mkdirSync(builds, { recursive: true });
    linkSync(secret, join(builds, 'b2.log'));
    writeFileSync(join(builds, 'b2.json'), record('b2'));
    await expect(getBuildLog('zzreadbuild', 'b2')).rejects.toBeInstanceOf(PlantedHardLinkError);

    // POSITIVE CONTROL: an ordinary record and log are read back, so none of the above is a
    // door that refuses everything. An ABSENT build is `null`, never a throw — the two
    // answers stay distinguishable, which is why a refusal cannot be served as a 404.
    writeFileSync(join(builds, 'b3.json'), record('b3'), { mode: 0o600 });
    writeFileSync(join(builds, 'b3.log'), 'built ok\n', { mode: 0o600 });
    expect((await getBuild('zzreadbuild', 'b3'))?.id).toBe('b3');
    expect(await getBuildLog('zzreadbuild', 'b3')).toBe('built ok\n');
    expect(await getBuild('zzreadbuild', 'nosuch')).toBeNull();
    expect(await getBuildLog('zzreadbuild', 'nosuch')).toBeNull();
    // And nothing anywhere handed back the secret.
    expect(await getBuildLog('zzreadbuild', 'b3')).not.toContain('super-secret-bearer');
  });

  test('the manifest — read through the same door it is written through', async () => {
    const { ws, secret } = readPlantWorkspace('zzreadmanifest');
    symlinkSync(secret, join(ws, 'site.json'));
    await expect(readManifest('zzreadmanifest')).rejects.toBeInstanceOf(PlantedSymlinkError);

    // POSITIVE CONTROL: the real manifest parses. `site.json` is SHARED (0660) — the agent
    // may legitimately rewrite it — so what this door proves is the inode, and the schema
    // proves the content.
    rmSync(join(ws, 'site.json'));
    writeFileSync(
      join(ws, 'site.json'),
      JSON.stringify({
        slug: 'zzreadmanifest',
        name: 'Read plant',
        owner_user_id: 1,
        created_at: '2026-01-01T00:00:00.000Z',
        driver: 'claude_code',
        template: 'blank',
        build: { install: 'bun install', build: 'bun run build', output: 'dist' },
        domain: 'zzreadmanifest.test',
        published: null,
      }),
    );
    expect((await readManifest('zzreadmanifest')).domain).toBe('zzreadmanifest.test');
    // An absent manifest is still an ordinary ENOENT for the callers that `.catch(() => null)`.
    await expect(readManifest('zznosuchsite')).rejects.toThrow(/ENOENT/);
  });

  test('the session transcript, the meta sidecar and the session index', async () => {
    const { ws, secret } = readPlantWorkspace('zzreadsess');
    const sessions = join(ws, '.builder', 'sessions');
    mkdirSync(sessions, { recursive: true });
    symlinkSync(secret, join(sessions, 's1.jsonl'));
    symlinkSync(secret, join(sessions, 's1.meta.json'));

    await expect(replayEvents('zzreadsess', 's1', 0)).rejects.toBeInstanceOf(PlantedSymlinkError);
    await expect(readMeta('zzreadsess', 's1')).rejects.toBeInstanceOf(PlantedSymlinkError);
    // The index reads every sidecar, so it is the same leak in a loop.
    await expect(listSessions('zzreadsess')).rejects.toBeInstanceOf(PlantedSymlinkError);

    // The directory component, again the plant the agent can really make.
    rmSync(join(ws, '.builder'), { recursive: true, force: true });
    symlinkSync(dirname(secret), join(ws, '.builder'));
    await expect(replayEvents('zzreadsess', 's1', 0)).rejects.toBeInstanceOf(PlantedSymlinkError);
    await expect(listSessions('zzreadsess')).rejects.toBeInstanceOf(PlantedSymlinkError);

    // POSITIVE CONTROL: a real session is appended, replayed and indexed.
    rmSync(join(ws, '.builder'));
    await appendEvent('zzreadsess', 's2', { type: 'text', text: 'hello' });
    await writeMeta({
      session_id: 's2',
      slug: 'zzreadsess',
      driver: 'claude_code',
      started_at: '2026-01-01T00:00:00.000Z',
      turns: 1,
      state: 'idle',
      resume_token: null,
    });
    const replayed = await replayEvents('zzreadsess', 's2', -1);
    expect(replayed.map(e => (e.body as { text?: string }).text)).toEqual(['hello']);
    expect((await listSessions('zzreadsess')).map(s => s.session_id)).toEqual(['s2']);
    // An unknown session stays an ordinary empty answer, not a refusal.
    expect(await replayEvents('zzreadsess', 'nosuch', 0)).toEqual([]);
    expect(await readMeta('zzreadsess', 'nosuch')).toBeNull();
    expect(await listSessions('zznosuchsite')).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * THE EGRESS — what a unit can reach, asked of the argv it was really given (LEAD-1)
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** The network leaf — imported lazily so its absence is the egress rows' red, not the file's. */
interface NetworkLeaf {
  DOORS: readonly string[];
  PROXY_PORT: number;
  MCP_PORT: number;
  unitNetworkProperties(door: string, opts: { egressDir?: string }): string[];
}
async function networkLeaf(): Promise<NetworkLeaf> {
  return (await import('../src/drivers/network_profile' as string)) as NetworkLeaf;
}

/** Where the unit's ExecStart must point: the in-unit shim that checks the netns first. */
const SHIM_PATH = join(import.meta.dir, '..', 'src', 'drivers', 'egress_shim.ts');

/** Every property that decides what a unit can reach over a socket. */
const NETWORK_KEYS = new Set([
  'PrivateNetwork',
  'PrivateIPC',
  // Whether a concurrent same-uid run's sockets are reachable through /proc/<pid>/root.
  'PrivatePIDs',
  'TemporaryFileSystem',
  'InaccessiblePaths',
  'IPAddressAllow',
  'IPAddressDeny',
  'BindPaths',
  'BindReadOnlyPaths',
  'RestrictAddressFamilies',
]);

/**
 * WHAT NO CONFINED RUN MAY REACH, from the host's side: loopback services, the DNS stub,
 * the LAN, the metadata service, the host's own address, the internet DIRECTLY (egress is
 * the gate's job, by hostname), the engine's/databases' sockets wherever a distro puts
 * them, THIS daemon's socket and per-turn secret files, ANOTHER run's egress sockets, the
 * host's /dev/shm, docker, and an abstract socket.
 */
function forbiddenFor(policy: ConfinementPolicy): Destination[] {
  const runtime = dirname(policy.listenSocket);
  return [
    { kind: 'inet', ip: '127.0.0.1', port: 5432 },
    { kind: 'inet', ip: '127.0.0.1', port: 8080 },
    { kind: 'inet', ip: '127.0.0.53', port: 53 },
    { kind: 'inet', ip: '::1', port: 5432 },
    { kind: 'inet', ip: '10.0.0.5', port: 22 },
    { kind: 'inet', ip: '192.168.1.1', port: 80 },
    { kind: 'inet', ip: '169.254.169.254', port: 80 },
    { kind: 'inet', ip: '203.0.113.7', port: 22 },
    { kind: 'inet', ip: '1.1.1.1', port: 443 },
    { kind: 'unix', path: '/run/postgresql/.s.PGSQL.5432' },
    { kind: 'unix', path: '/var/run/postgresql/.s.PGSQL.5432' },
    { kind: 'unix', path: '/tmp/.s.PGSQL.5432' },
    { kind: 'unix', path: '/run/dedalo/dedalo_ts.sock' },
    { kind: 'unix', path: '/run/mysqld/mysqld.sock' },
    // RHEL/Fedora MariaDB's DEFAULT socket — outside /run, /tmp and /home, mode 0777.
    { kind: 'unix', path: '/var/lib/mysql/mysql.sock' },
    { kind: 'unix', path: '/var/run/docker.sock' },
    { kind: 'unix', path: '/home/dedalo/.dedalo.sock' },
    { kind: 'unix', path: policy.listenSocket },
    { kind: 'unix', path: join(runtime, 'turns', 'x.service.env') },
    // A CONCURRENT run's egress sockets: the per-run bind is the run's identity, so a build or
    // a git run that could open a sibling turn's mcp.sock would speak with the daemon's key.
    { kind: 'unix', path: join(runtime, 'egress', SIBLING_RUN, 'proxy.sock') },
    { kind: 'unix', path: join(runtime, 'egress', SIBLING_RUN, 'mcp.sock') },
    // The host's /dev/shm, which PrivateDevices= binds back into the private /dev.
    { kind: 'unix', path: '/dev/shm/x.sock' },
    // A SysV key / POSIX queue in the HOST's IPC namespace (every unit without PrivateIPC=).
    { kind: 'ipc', name: 'sysv:0x5a5a0001' },
    { kind: 'abstract', name: 'lp' },
  ];
}
/** A concurrent run's uuid (its egress dir is a sibling of the run under test). */
const SIBLING_RUN = '11111111-1111-1111-1111-111111111111';

/**
 * THE NON-NETWORK PROPERTIES a unit is given — closed. `assertDoorShape` holds the COMPLETE
 * key set of every rendered argv to the leaf's network keys plus exactly these, so a property
 * added anywhere (a `NetworkNamespacePath=`, a `JoinsNamespaceOf=` that would keep
 * `PrivateNetwork=yes` in the argv and still put the unit on the host's network) is a
 * deliberate edit of this list, never an invisible one.
 */
const NON_NETWORK_KEYS = Object.freeze([
  'CPUQuota',
  'EnvironmentFile',
  'LockPersonality',
  'MemoryMax',
  'NoNewPrivileges',
  'PrivateDevices',
  'PrivateTmp',
  'ProtectHome',
  'ProtectProc',
  'ProtectSystem',
  'ReadWritePaths',
  'RestrictSUIDSGID',
  'RuntimeMaxSec',
  'TasksMax',
  'UMask',
]);
/** …and the systemd-run flags that are not properties, by name. Closed too. */
const RUN_FLAGS = Object.freeze(['--collect', '--pipe', '--quiet', '--uid', '--unit', '--wait', '--working-directory']);

/** The forbidden destinations the unit this argv describes CAN reach (want: none). */
function reachedForbidden(argv: readonly string[], policy: ConfinementPolicy): string[] {
  const props = unitPropertiesOf(argv);
  // A scratch policy's runtime dir is under /tmp (a test cannot write /run), and PrivateTmp
  // would mask it for a reason that is not the design. The design's reason is /run:
  // `confinementProblems()` REFUSES a runtime dir outside RUNTIME_PREFIX ('a runtime outside
  // /run is refused', below), so /run is the only place a real one can be — and it is modelled
  // there. The rows asserting the daemon socket and turns/ unreachable then hold because of the
  // /run mask the refusal guarantees, which is exactly the claim.
  const runtime = dirname(policy.listenSocket);
  const rerooted = (path: string) => (path.startsWith(runtime) ? `/run/dedalo-sites/test${path.slice(runtime.length)}` : path);
  const rerootedProps = props.map(prop =>
    prop.startsWith('BindPaths=') || prop.startsWith('BindReadOnlyPaths=')
      ? prop.replace(/=(\S+?):/, (_m, src: string) => `=${rerooted(src)}:`)
      : prop,
  );
  // A CONCURRENT TURN of the same museum (the same agent uid): this very unit shape, its one
  // bind pointing at the sibling run's directory. Never "the unit runs alone" — the question
  // is precisely what one run can reach of another.
  const concurrentTurn = [
    ...rerootedProps.filter(prop => !prop.startsWith('BindPaths=')),
    `BindPaths=/run/dedalo-sites/test/egress/${SIBLING_RUN}:/run/dedalo-egress`,
  ];
  return forbiddenFor(policy)
    .map(dest => (dest.kind === 'unix' ? { ...dest, path: rerooted(dest.path) } : dest))
    .filter(dest => reach(rerootedProps, dest, { netnsHonoured: true, concurrent: [concurrentTurn] }))
    .map(describeDestination);
}

/** The door's rendered shape: the leaf's network list verbatim, the shim in front. */
function assertDoorShape(net: NetworkLeaf, door: string, argv: readonly string[], original: readonly string[]): void {
  const props = unitPropertiesOf(argv);
  const network = props.filter(prop => NETWORK_KEYS.has(prop.slice(0, prop.indexOf('='))));
  const bind = parseProperties(props).get('BindPaths')?.[0];
  const egressDir = bind ? bind.split(':')[0] : undefined;
  const expected = net.unitNetworkProperties(door, egressDir ? { egressDir } : {});
  expect({ door, network: [...network].sort() }).toEqual({ door, network: [...expected].sort() });
  // THE WHOLE KEY SET, not only the keys this gate knows to be about the network: every
  // property on the unit is the leaf's or one of NON_NETWORK_KEYS, each exactly once.
  const keyOf = (prop: string) => prop.slice(0, prop.indexOf('='));
  const leafKeys = expected.map(keyOf);
  expect({ door, keys: props.map(keyOf).sort() }).toEqual({ door, keys: [...leafKeys, ...NON_NETWORK_KEYS].sort() });
  // (A recorded argv has no runner path in front — `$@` — and a rendered one does.)
  const head = argv.slice(0, argv.indexOf('--')).filter(arg => arg.startsWith('--'));
  const flags = head.filter(arg => !arg.startsWith('--property=')).map(arg => arg.split('=')[0] as string);
  expect({ door, stray: argv.slice(0, argv.indexOf('--')).filter(arg => !arg.startsWith('--')).length <= 1 }).toEqual({
    door,
    stray: true,
  });
  expect({ door, flags: flags.sort() }).toEqual({ door, flags: [...RUN_FLAGS].sort() });
  // The only allow is the unit's own loopback (inside its own netns).
  const allow = (parseProperties(props).get('IPAddressAllow') ?? []).join(' ').split(/\s+/).filter(Boolean);
  expect({ door, allow }).toEqual({ door, allow: door === 'git' ? allow.filter(t => t === 'localhost') : ['localhost'] });
  // ExecStart is the shim, which checks the namespace and then runs the original argv.
  const tail = argv.slice(argv.indexOf('--') + 1);
  expect({ door, tail }).toEqual({ door, tail: [process.execPath, SHIM_PATH, '--', ...original] });
  expect(existsSync(SHIM_PATH)).toBe(true);
}

describe('the MCP credential stays with the daemon under systemd_scope', () => {
  test('the turn is handed a LOOPBACK MCP url and no key; the key rides only the daemon-side upstream', async () => {
    const net = await networkLeaf();
    const build = (sessionManager as unknown as Record<string, unknown>).buildStartOptions as
      | ((slug: string, driver: string, prompt: string, resume: string | undefined, mode?: string) => {
          workspace: string;
          mcp: { name: string; url: string; headers?: Record<string, string> };
          mcpUpstream?: { url: string; apiKey?: string };
        })
      | undefined;
    // The seam the fix exports: the manager's start options, under a stated mode.
    expect(typeof build).toBe('function');
    const key = config.PUBLICATION_API_KEY;
    expect(key.length).toBeGreaterThan(0); // the suite's env carries one, or this proves nothing
    mkdirSync(roots.sitesRoot, { recursive: true });
    const slug = `confinement-mcp-${process.pid}`;
    const workspace = join(roots.sitesRoot, slug);
    mkdirSync(join(workspace, '.builder'), { recursive: true });
    scratch.push(workspace);
    for (const driver of ['claude_code', 'opencode'] as const) {
      const opts = (build as NonNullable<typeof build>)(slug, driver, 'x', undefined, 'systemd_scope');
      expect({ driver, url: opts.mcp.url }).toEqual({ driver, url: `http://127.0.0.1:${net.MCP_PORT}/mcp` });
      expect({ driver, headers: opts.mcp.headers }).toEqual({ driver, headers: undefined });
      expect({ driver, upstreamKey: opts.mcpUpstream?.apiKey }).toEqual({ driver, upstreamKey: key });
      const write = driver === 'claude_code' ? writeMcpConfig : writeOpencodeConfig;
      const path = await write(opts as Parameters<typeof writeMcpConfig>[0]);
      const body = readFileSync(path, 'utf8');
      expect({ driver, carriesKey: body.includes(key), carriesHeader: /x-api-key/i.test(body) }).toEqual({
        driver,
        carriesKey: false,
        carriesHeader: false,
      });
      expect({ driver, loopback: body.includes(`http://127.0.0.1:${net.MCP_PORT}/mcp`) }).toEqual({ driver, loopback: true });
      rmSync(path, { force: true });
    }
    // The DECLARED-unconfined mode keeps the direct shape: there is no gate to hold the key.
    const none = (build as NonNullable<typeof build>)(slug, 'claude_code', 'x', undefined, 'none');
    expect(none.mcp.headers?.['X-API-Key']).toBe(key);
  });
});

describe('the egress gate lives exactly as long as the run, on every exit path', () => {
  const upstream = { url: 'http://127.0.0.1:1/publication/server_api/v2', apiKey: 'publication-secret' };
  const egressEntries = (policy: ConfinementPolicy) => {
    const dir = join(dirname(policy.listenSocket), 'egress');
    return existsSync(dir) ? readdirSync(dir) : [];
  };
  const start = (workspace: string, env: Record<string, string> = {}) =>
    ({
      workspace,
      prompt: 'x',
      mcp: { name: 'dedalo_publication', url: 'http://127.0.0.1:1/mcp' },
      mcpUpstream: upstream,
      env,
      timeoutMs: 30_000,
    }) as Parameters<typeof spawnAgentProcess>[0];
  const drain = async (proc: ReturnType<typeof spawnAgentProcess>) => {
    const events: AgentEvent[] = [];
    for await (const event of proc.events) events.push(event);
    return events;
  };

  test('success: the turn SAW its proxy and mcp sockets, and none outlive it', async () => {
    const runner = recordingPolicy();
    const events = await drain(
      spawnAgentProcess(start(runner.cwd), async () => ({ argv: ['/opt/claude'], parseLine: () => [] }), runner.policy),
    );
    expect(events.some(event => event.type === 'result')).toBe(true);
    // The positive control: the per-run door EXISTED while the unit ran…
    expect((runner.egressListing() ?? []).sort()).toEqual(['mcp.sock', 'proxy.sock']);
    // …and served the TURN plan of a claude_code run: its provider, nothing else.
    expect(runner.calls()[0]?.probe).toEqual({
      'api.anthropic.com': '502',
      'registry.npmjs.org': '403',
      'api.provider.example': '403',
      'evil.example.com': '403',
    });
    expect(egressEntries(runner.policy)).toEqual([]);
  });

  test('a turn with NO mcpUpstream is served no mcp.sock — nothing forwards to /mcp without a key', async () => {
    // A turn door's profile names MCP, but the gate has nowhere to send it: a served mcp.sock
    // would forward the agent's requests to the Publication API bare. The door the run SAW
    // is the proxy alone.
    const runner = recordingPolicy();
    const events = await drain(
      spawnAgentProcess(
        { ...start(runner.cwd), mcpUpstream: undefined },
        async () => ({ argv: ['/opt/claude'], parseLine: () => [] }),
        runner.policy,
      ),
    );
    expect(events.some(event => event.type === 'result')).toBe(true);
    expect(runner.egressListing()).toEqual(['proxy.sock']);
    expect(egressEntries(runner.policy)).toEqual([]);
  });

  test('setup failure, confinement refusal and spawn failure leave no egress dir', async () => {
    // setup throws
    const a = recordingPolicy();
    await drain(
      spawnAgentProcess(start(a.cwd), async () => {
        throw new Error('driver setup failed');
      }, a.policy),
    );
    expect({ path: 'setup', left: egressEntries(a.policy) }).toEqual({ path: 'setup', left: [] });
    // confinement refuses AFTER the door could have opened: an env value the env file refuses
    const b = recordingPolicy();
    const refused = await drain(
      spawnAgentProcess(start(b.cwd, { EVIL: 'a\nExecStart=/bin/sh' }), async () => ({ argv: ['/opt/claude'], parseLine: () => [] }), b.policy),
    );
    expect(refused.some(event => event.type === 'error' && event.message.includes('confinement refused'))).toBe(true);
    expect({ path: 'refusal', left: egressEntries(b.policy) }).toEqual({ path: 'refusal', left: [] });
    // the runner exists but cannot be executed
    const c = recordingPolicy();
    chmodSync(c.policy.systemdRunBin, 0o644);
    const failed = await drain(
      spawnAgentProcess(start(c.cwd), async () => ({ argv: ['/opt/claude'], parseLine: () => [] }), c.policy),
    );
    expect(failed.some(event => event.type === 'error')).toBe(true);
    expect({ path: 'spawn', left: egressEntries(c.policy) }).toEqual({ path: 'spawn', left: [] });
  });

  test('an interrupt that lands WHILE confineTurn opens the gate spawns nothing, and leaves no door or secret', async () => {
    // The window: interruptRequested was read only BEFORE confineTurn, whose gate and env file
    // are several awaits; a stop landing there found no child, and the whole turn then ran.
    let release: () => void = () => {};
    const latch = new Promise<void>(resolve => {
      release = resolve;
    });
    let entered: () => void = () => {};
    const inGate = new Promise<void>(resolve => {
      entered = resolve;
    });
    const runner = recordingPolicy({
      egressSeams: {
        beforeServe: async () => {
          entered();
          await latch;
        },
      },
    });
    const proc = spawnAgentProcess(
      start(runner.cwd, { SECRET: 'turn-secret' }),
      async () => ({ argv: ['/opt/claude'], parseLine: () => [] }),
      runner.policy,
    );
    await inGate;
    const interrupted = proc.interrupt();
    release();
    const events = await drain(proc);
    await interrupted;
    expect(events.some(event => event.type === 'error' && event.message.includes('interrupted before start'))).toBe(true);
    expect(events.some(event => event.type === 'result')).toBe(false);
    // Nothing was handed to PID 1, and what confineTurn opened is gone.
    expect(runner.calls()).toEqual([]);
    expect(egressEntries(runner.policy)).toEqual([]);
    const turns = join(dirname(runner.policy.listenSocket), 'turns');
    expect(existsSync(turns) ? readdirSync(turns) : []).toEqual([]);
  });

  test('a build door that fails still closes its gate', async () => {
    const runner = recordingPolicy();
    writeFileSync(
      runner.policy.systemdRunBin,
      readFileSync(runner.policy.systemdRunBin, 'utf8').replace(/exit 0\n$/, 'exit 7\n'),
      { mode: 0o755 },
    );
    const result = await runConfined(
      { door: 'build', argv: ['bun', 'run', 'build'], cwd: runner.cwd, env: {}, timeoutMs: 5_000 } as Parameters<
        typeof runConfined
      >[0],
      runner.policy,
    );
    expect(result.exitCode).toBe(7);
    expect(runner.egressListing()).toEqual(['proxy.sock']);
    expect(egressEntries(runner.policy)).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * The trust the unit's first exec rests on, and the host facts it is asked of
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('what the unit executes first is trusted by WHO CAN CHANGE IT, not by who owns it', () => {
  test('the daemon states its REAL host facts: /run, id(1), /proc/self/ns/net, stat(2), the system resolver', () => {
    const policy = policyFromConfig();
    expect(policy.host).toBe(HOST_FACTS);
    expect(HOST_FACTS.runtimePrefix).toBe(RUNTIME_PREFIX);
    expect(RUNTIME_PREFIX).toBe('/run');
    expect(HOST_FACTS.resolveAgent).toBe(resolveAgentIdentity);
    expect(HOST_FACTS.readNetns).toBe(readHostNetns);
    expect(HOST_FACTS.systemdVersion).toBe(readSystemdVersion);
    expect(policy.egressSeams).toBeUndefined();
    // The resolver is real: this process's own user resolves to its own uid.
    const me = resolveAgentIdentity(String(process.env.USER ?? ''));
    if (process.env.USER && typeof process.getuid === 'function') expect(me?.uid).toBe(process.getuid());
    expect(resolveAgentIdentity('no-such-user-dedalo-sb-test')).toBeNull();
  });

  /** A policy whose stat(2) lies about `overrides` paths (by suffix) — a chown a test cannot do. */
  function statPolicy(
    overrides: Record<string, Partial<{ uid: number; gid: number; mode: number }>>,
    agent: { uid: number; gids: readonly number[] } | null = TEST_AGENT,
  ): ConfinementPolicy {
    const base = systemdPolicy();
    return {
      ...base,
      host: {
        ...base.host,
        resolveAgent: () => agent,
        stat: (path: string) => {
          const real = HOST_FACTS.stat(path);
          const hit = Object.entries(overrides).find(([suffix]) => path === suffix || path.endsWith(suffix));
          return hit ? { ...real, ...hit[1] } : real;
        },
      },
    };
  }
  const shimReal = () => realpathSync(SHIM_PATH);

  test('a shim owned by a THIRD uid (the engine’s, which owns the checkout) is accepted', () => {
    // The S1 this closes: the rule was "root or this daemon", and the documented layout runs
    // the daemon from the ENGINE's checkout with the engine's bun — both owned by `dedalo`, a
    // third uid — so every door on every provisioned host refused.
    const third = statPolicy({ [shimReal()]: { uid: 4242, mode: 0o100644 } });
    expect(confinementProblems(third, 'git')).toEqual([]);
    expect(confinementProblems(third, 'turn', 'claude_code')).toEqual([]);
  });

  test('a shim owned by the AGENT uid is a named refusal', () => {
    const owned = statPolicy({ [shimReal()]: { uid: TEST_AGENT.uid } });
    expect(confinementProblems(owned, 'git').join(' ')).toContain('the agent uid');
    expect(confinementProblems(owned, 'git').join(' ')).toContain(`owned by uid ${TEST_AGENT.uid}`);
  });

  test('a shim the agent cannot READ, or a runtime it cannot EXECUTE, is refused — every run would fail at exec', () => {
    const unreadable = statPolicy({ [shimReal()]: { uid: 4242, gid: 4242, mode: 0o100640 } });
    expect(confinementProblems(unreadable, 'git').join(' ')).toContain('cannot be read by the agent uid');
    // …through its GROUP it can: the instance group the agent shares.
    const viaGroup = statPolicy(
      { [shimReal()]: { uid: 4242, gid: 777, mode: 0o100640 } },
      { uid: TEST_AGENT.uid, gids: [777] },
    );
    expect(confinementProblems(viaGroup, 'git')).toEqual([]);
    const noExec = statPolicy({ [realpathSync(process.execPath)]: { uid: 4242, mode: 0o100750 } });
    expect(confinementProblems(noExec, 'git').join(' ')).toContain('cannot be executed by the agent uid');
  });

  test('a directory above the shim the agent can WRITE or OWNS is refused (it could rename over it); a sticky one it does not own is not', () => {
    const parent = dirname(shimReal());
    const writable = statPolicy({ [parent]: { uid: TEST_AGENT.uid, mode: 0o40755 } });
    expect(confinementProblems(writable, 'git').join(' ')).toContain('which the agent uid can write');
    const worldWritable = statPolicy({ [parent]: { uid: 4242, mode: 0o40777 } });
    expect(confinementProblems(worldWritable, 'git').join(' ')).toContain('which the agent uid can write');
    const sticky = statPolicy({ [parent]: { uid: 4242, mode: 0o41777 } });
    expect(confinementProblems(sticky, 'git')).toEqual([]);
    // …unless the AGENT owns the sticky directory: the owner of a sticky directory may
    // rename anything inside it, so the exemption is only for a directory it does not own.
    const stickyOwned = statPolicy({ [parent]: { uid: TEST_AGENT.uid, mode: 0o41777 } });
    expect(confinementProblems(stickyOwned, 'git').join(' ')).toContain('which the agent uid can write');
    // An agent-owned directory whose mode reads 0555 TODAY is still the agent's: one chmod
    // from writable. Ownership, not the current bits, decides.
    const readOnlyOwned = statPolicy({ [parent]: { uid: TEST_AGENT.uid, mode: 0o40555 } });
    expect(confinementProblems(readOnlyOwned, 'git').join(' ')).toContain('which the agent uid can write');
    // The same rule one level further up: an agent-owned grandparent is as bad as the parent.
    const grandOwned = statPolicy({ [dirname(parent)]: { uid: TEST_AGENT.uid, mode: 0o40555 } });
    expect(confinementProblems(grandOwned, 'git').join(' ')).toContain('which the agent uid can write');
  });

  test('an AGENT_USER this host does not have is a named refusal', () => {
    const missing = statPolicy({}, null);
    const problems = confinementProblems(missing, 'git');
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain('is not a user on this host');
  });
});

describe('a host whose systemd does not know every rendered property is refused UP FRONT', () => {
  test('SYSTEMD_SINCE is exactly the property set every door really renders — no property without its release, no stale entry', async () => {
    const policy = systemdPolicy();
    const rendered = new Set<string>();
    for (const door of ['turn', 'build', 'git'] as const) {
      const run = await confineTurn({ door, argv: ['/opt/x'], cwd: '/srv/ws/a', env: {}, timeoutMs: 5_000 }, policy);
      try {
        for (const prop of unitPropertiesOf(run.argv)) rendered.add(prop.slice(0, prop.indexOf('=')));
      } finally {
        await run.cleanup();
      }
    }
    expect([...rendered].sort()).toEqual(Object.keys(SYSTEMD_SINCE).sort());
    // The floor IS the newest rendered property's release (today PrivatePIDs=, 257).
    expect(SYSTEMD_FLOOR).toBe(Math.max(...[...rendered].map(key => SYSTEMD_SINCE[key] as number)));
    expect(propertiesNewerThan(SYSTEMD_FLOOR)).toEqual([]);
  });

  test('one release below the floor: refused on every door, naming what it lacks, before anything is opened', async () => {
    for (const version of [SYSTEMD_FLOOR - 1, 252, 247]) {
      const base = systemdPolicy();
      const served: string[] = [];
      const old = {
        ...base,
        host: { ...base.host, systemdVersion: () => version },
        egressSeams: { beforeServe: (socket: string) => void served.push(socket) },
      } as ConfinementPolicy;
      for (const door of ['turn', 'build', 'git'] as const) {
        const problems = confinementProblems(old, door, 'claude_code');
        expect({ version, door, count: problems.length }).toEqual({ version, door, count: 1 });
        expect(problems[0]).toContain(`systemd is ${version}`);
        expect(problems[0]).toContain(`needs ${SYSTEMD_FLOOR} or newer`);
        for (const lacking of propertiesNewerThan(version)) expect(problems[0]).toContain(lacking);
        expect(() => assertConfinementAvailable(door, old, 'claude_code')).toThrow(ConfinementUnavailableError);
        await expect(
          confineTurn({ door, argv: ['/opt/x'], cwd: '/srv/ws/a', env: { SECRET: 's' }, timeoutMs: 5_000 }, old),
        ).rejects.toBeInstanceOf(ConfinementUnavailableError);
      }
      expect({ version, served }).toEqual({ version, served: [] });
      const runtime = dirname(old.listenSocket);
      expect({ version, egress: existsSync(join(runtime, 'egress')), turns: existsSync(join(runtime, 'turns')) }).toEqual({
        version,
        egress: false,
        turns: false,
      });
    }
    // PrivatePIDs= is what 256 lacks; 247 lacks PrivateIPC= too, newest first.
    expect(propertiesNewerThan(SYSTEMD_FLOOR - 1)).toEqual([`PrivatePIDs= (${SYSTEMD_FLOOR})`]);
    expect(propertiesNewerThan(247).slice(0, 2)).toEqual(['PrivatePIDs= (257)', 'PrivateIPC= (248)']);
  });

  test('an unreadable version is a refusal, never a pass; the floor itself is accepted', () => {
    const base = systemdPolicy();
    const blind = { ...base, host: { ...base.host, systemdVersion: () => null } } as ConfinementPolicy;
    const problems = confinementProblems(blind, 'git');
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain('cannot be read');
    expect(confinementProblems(base, 'git')).toEqual([]);
    const newer = { ...base, host: { ...base.host, systemdVersion: () => SYSTEMD_FLOOR + 3 } } as ConfinementPolicy;
    expect(confinementProblems(newer, 'git')).toEqual([]);
  });

  test('readSystemdVersion reads `systemd-run --version`’s first line, and remembers only a success', () => {
    const dir = mkdtempSync(join(existsSync('/tmp') ? '/tmp' : tmpdir(), 'dsv-'));
    scratch.push(dir);
    const bin = (name: string, body: string) => {
      const path = join(dir, name);
      writeFileSync(path, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
      return path;
    };
    const debian = bin('deb', `printf 'systemd 252 (252.17-1~deb12u1)\\n+PAM +AUDIT\\n'`);
    expect(readSystemdVersion(debian)).toBe(252);
    // Remembered: the same binary now answering differently is not asked again.
    writeFileSync(debian, `#!/bin/sh\nprintf 'systemd 999 (x)\\n'\n`, { mode: 0o755 });
    expect(readSystemdVersion(debian)).toBe(252);
    const garbage = bin('garbage', `printf 'not systemd\\n'`);
    expect(readSystemdVersion(garbage)).toBeNull();
    const failing = bin('failing', `printf 'systemd 257 (x)\\n'; exit 1`);
    expect(readSystemdVersion(failing)).toBeNull();
    // A failure is NOT remembered: the binary fixed, the next read succeeds.
    writeFileSync(failing, `#!/bin/sh\nprintf 'systemd 257 (257.4-1)\\n'\n`, { mode: 0o755 });
    expect(readSystemdVersion(failing)).toBe(257);
    expect(readSystemdVersion(join(dir, 'absent'))).toBeNull();
  });
});

describe('a runtime directory outside /run is refused — the mask is what hides every run’s sockets', () => {
  test('a LISTEN_SOCKET under /srv is refused for every door, un-rerooted', () => {
    // The hand-configured host: /srv is visible (read-only) under ProtectSystem=strict and a
    // connect() needs no writable mount, so the daemon's socket and EVERY concurrent run's
    // egress/<uuid>/mcp.sock would be one path away from a git hook.
    const base = systemdPolicy();
    const srv = { ...base, listenSocket: '/srv/sb/state/daemon.sock', host: { ...base.host, runtimePrefix: RUNTIME_PREFIX } };
    for (const door of ['turn', 'build', 'git'] as const) {
      const problems = confinementProblems(srv, door, 'claude_code');
      expect({ door, count: problems.length }).toEqual({ door, count: 1 });
      expect({ door, names: problems[0]?.includes('LISTEN_SOCKET') && problems[0]?.includes('/run') }).toEqual({
        door,
        names: true,
      });
    }
  });

  test('a runtime dir systemd cannot bind is refused UP FRONT — nothing opened, no secret written', async () => {
    // What this row proves: confinementProblems() refuses a ':' runtime dir, so confineTurn
    // never reaches its own ordering. (It does NOT prove that ordering: once the up-front check
    // passes, unitNetworkProperties cannot throw — the per-run dir adds only a uuid — so where
    // it sits is not observable. The ordering that IS observable, the namespace read, is the
    // next row.)
    const base = systemdPolicy();
    const root = dirname(dirname(base.listenSocket));
    const colon = join(root, 'ru:n');
    mkdirSync(colon, { recursive: true });
    const policy = { ...base, listenSocket: join(colon, 'daemon.sock') };
    expect(confinementProblems(policy, 'turn', 'claude_code').join(' ')).toContain("BindPaths= grammar");
    await expect(
      confineTurn({ door: 'turn', argv: ['/opt/x'], cwd: '/srv/ws/a', env: { SECRET: 's' }, timeoutMs: 5_000 }, policy),
    ).rejects.toBeInstanceOf(ConfinementUnavailableError);
    expect(existsSync(join(colon, 'egress'))).toBe(false);
    expect(existsSync(join(colon, 'turns'))).toBe(false);
  });

  test('a namespace read that fails INSIDE confineTurn (after the up-front check passed) opens no gate and writes no secret', async () => {
    // M58: the namespace identity read moved after the gate opened stayed green, because every
    // failing-read row was refused by confinementProblems() first. Here the up-front read
    // succeeds and confineTurn's own fails — the gate's beforeServe hook records whether a gate
    // was EVER opened, and the runtime dir must hold no egress/ and no turns/ afterwards.
    const base = systemdPolicy();
    let reads = 0;
    const served: string[] = [];
    const policy = {
      ...base,
      host: {
        ...base.host,
        readNetns: () => {
          reads += 1;
          if (reads >= 2) throw new Error('EACCES: /proc/self/ns/net');
          return TEST_NETNS;
        },
      },
      egressSeams: { beforeServe: (socket: string) => void served.push(socket) },
    } as ConfinementPolicy;
    await expect(
      confineTurn(
        { door: 'turn', driver: 'claude_code', argv: ['/opt/x'], cwd: '/srv/ws/a', env: { SECRET: 's' }, timeoutMs: 5_000 },
        policy,
      ),
    ).rejects.toBeInstanceOf(ConfinementUnavailableError);
    expect(reads).toBe(2);
    expect(served).toEqual([]);
    const runtime = dirname(policy.listenSocket);
    expect(existsSync(join(runtime, 'egress'))).toBe(false);
    expect(existsSync(join(runtime, 'turns'))).toBe(false);
  });

  test('a daemon that cannot read its own namespace identity refuses, and the env file always carries it', async () => {
    const base = systemdPolicy();
    const blind = {
      ...base,
      host: {
        ...base.host,
        readNetns: () => {
          throw new Error('ENOENT: /proc/self/ns/net');
        },
      },
    };
    const problems = confinementProblems(blind, 'git');
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain('/proc/self/ns/net');
    await expect(
      confineTurn({ door: 'git', argv: ['git', 'status'], cwd: '/srv/ws/a', env: {}, timeoutMs: 5_000 }, blind),
    ).rejects.toBeInstanceOf(ConfinementUnavailableError);
    // The identity the shim compares against is in the env file of EVERY door — the shim
    // refuses without it, so an env file without it is a run that can never start.
    for (const door of ['turn', 'build', 'git'] as const) {
      const run = await confineTurn({ door, argv: ['/opt/x'], cwd: '/srv/ws/a', env: {}, timeoutMs: 5_000 }, base);
      try {
        const body = readFileSync(property(run.argv, 'EnvironmentFile') as string, 'utf8');
        expect({ door, carries: body.includes(`DEDALO_HOST_NETNS="${TEST_NETNS}"`) }).toEqual({ door, carries: true });
      } finally {
        await run.cleanup();
      }
    }
  });
});

describe('a workspace or HOME under /home re-exposes THAT directory inside ProtectHome=, and nothing beside it', () => {
  test('the unit reaches its own ReadWritePaths under /home; a sibling socket in the same /home dir stays hidden', async () => {
    // systemd.exec(5): ReadWritePaths= nested inside InaccessiblePaths= (which ProtectHome=yes
    // is) is re-exposed. An install whose roots live under /home/<svc> therefore gives its
    // unit THAT directory — the model now says so — and the engine socket beside it
    // (/home/dedalo/.dedalo.sock, the row every door's FORBIDDEN list holds) is still masked.
    const base = systemdPolicy();
    const policy = { ...base, agentHome: '/home/dedalo/agent' } as ConfinementPolicy;
    const run = await confineTurn(
      { door: 'git', argv: ['git', 'status'], cwd: '/home/dedalo/sites/a', env: {}, timeoutMs: 5_000 },
      policy,
    );
    try {
      const props = unitPropertiesOf(run.argv);
      const at = (path: string) => reach(props, { kind: 'unix', path }, { netnsHonoured: true });
      // Positive controls: the lift is modelled, so a "blocked" below is not the model's blindness.
      expect({ home: at('/home/dedalo/agent/x.sock'), workspace: at('/home/dedalo/sites/a/x.sock') }).toEqual({
        home: true,
        workspace: true,
      });
      expect({
        sibling: at('/home/dedalo/.dedalo.sock'),
        otherSite: at('/home/dedalo/sites/b/x.sock'),
        otherUser: at('/home/other/x.sock'),
        root: at('/root/x.sock'),
      }).toEqual({ sibling: false, otherSite: false, otherUser: false, root: false });
      // A tmpfs mask is NOT lifted by a nested path (there is nothing under it to re-expose).
      expect(reach(['ProtectHome=tmpfs', 'ReadWritePaths=/home/dedalo/agent'], { kind: 'unix', path: '/home/dedalo/agent/x' }, { netnsHonoured: true })).toBe(false);
      expect(reach(['PrivateTmp=yes', 'ReadWritePaths=/tmp/x'], { kind: 'unix', path: '/tmp/x/s' }, { netnsHonoured: true })).toBe(false);
    } finally {
      await run.cleanup();
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * The plan takes effect at the gate the run is given
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** CONNECT `target` through a unix proxy socket; the status code. */
function connectThrough(socketPath: string, target: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket: Socket = connect(socketPath);
    let buffer = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`no reply to CONNECT ${target}`));
    }, 5_000);
    socket.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on('data', chunk => {
      buffer += chunk.toString('latin1');
      if (!buffer.includes('\r\n')) return;
      clearTimeout(timer);
      socket.destroy();
      resolve(Number(buffer.split(' ')[1]));
    });
    socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`);
  });
}

describe('the gate a run is given tunnels to ITS plan’s hosts and nothing else', () => {
  test('turn (claude_code), turn (opencode) and build: planned → 200, everything else → 403', async () => {
    // CF18: a host appended to what the gate was opened with stayed green, because the rows
    // only checked the sockets EXISTED. Here the served proxy is asked, at the place the plan
    // takes effect, with the resolver and dialer stated (never the public internet).
    const echo = createServer(socket => socket.pipe(socket));
    await new Promise<void>(resolve => echo.listen(0, '127.0.0.1', resolve));
    const port = (echo.address() as { port: number }).port;
    const egressSeams = {
      lookup: async () => [{ address: '93.184.216.34', family: 4 }],
      dial: () =>
        new Promise<Socket>((resolve, reject) => {
          const socket = connect(port, '127.0.0.1', () => resolve(socket));
          socket.once('error', reject);
        }),
    };
    const rows = [
      { door: 'turn', driver: 'claude_code', providers: [], reach: ['api.anthropic.com'] },
      // NP25: a host that names provider hosts (for its opencode sites) gives a claude_code turn
      // NOTHING more than its own API host.
      { door: 'turn', driver: 'claude_code', providers: ['api.provider.example'], reach: ['api.anthropic.com'] },
      { door: 'turn', driver: 'opencode', providers: ['api.provider.example'], reach: ['api.provider.example'] },
      { door: 'build', driver: undefined, providers: [], reach: ['registry.npmjs.org'] },
      { door: 'build', driver: undefined, providers: ['api.provider.example'], reach: ['registry.npmjs.org'] },
    ] as const;
    const everyone = ['api.anthropic.com', 'api.provider.example', 'registry.npmjs.org', 'evil.example.com'];
    try {
      for (const row of rows) {
        const base = systemdPolicy();
        const policy = {
          ...base,
          egressSeams,
          egressFacts: { driver: 'claude_code', providerHosts: [...row.providers], registryHosts: ['registry.npmjs.org'] },
        } as ConfinementPolicy;
        const run = await confineTurn(
          { door: row.door, driver: row.driver, argv: ['/opt/x'], cwd: '/srv/ws/a', env: {}, timeoutMs: 5_000 },
          policy,
        );
        try {
          const bind = property(run.argv, 'BindPaths') as string;
          const proxySock = join(bind.split(':')[0] as string, 'proxy.sock');
          for (const host of everyone) {
            const status = await connectThrough(proxySock, `${host}:443`);
            const want = (row.reach as readonly string[]).includes(host) ? 200 : 403;
            expect({ door: row.door, driver: row.driver, host, status }).toEqual({
              door: row.door,
              driver: row.driver,
              host,
              status: want,
            });
          }
        } finally {
          await run.cleanup();
        }
      }
    } finally {
      await new Promise<void>(resolve => echo.close(() => resolve()));
    }
  });

  test('the SUPERVISOR hands confineTurn the run’s own driver: an opencode turn on a claude_code host is judged on its own plan', async () => {
    // PR1: `driver: opts.driver` dropped from process.ts gave an opencode turn the
    // api.anthropic.com plan and started it; with it, the empty provider list refuses.
    const runner = recordingPolicy();
    const start = (driver?: 'opencode') =>
      ({
        workspace: runner.cwd,
        driver,
        prompt: 'x',
        mcp: { name: 'dedalo_publication', url: 'http://127.0.0.1:1/mcp' },
        env: {},
        timeoutMs: 30_000,
      }) as Parameters<typeof spawnAgentProcess>[0];
    const drain = async (proc: ReturnType<typeof spawnAgentProcess>) => {
      const events: AgentEvent[] = [];
      for await (const event of proc.events) events.push(event);
      return events;
    };
    const refused = await drain(
      spawnAgentProcess(start('opencode'), async () => ({ argv: ['/opt/opencode'], parseLine: () => [] }), runner.policy),
    );
    const error = refused.find(event => event.type === 'error');
    expect(error?.type === 'error' && error.message).toContain('AGENT_PROVIDER_HOSTS');
    expect(existsSync(join(dirname(runner.policy.systemdRunBin), 'argv.log'))).toBe(false);
    // Control: the same host runs a claude_code turn.
    const ran = await drain(
      spawnAgentProcess(start(), async () => ({ argv: ['/opt/claude'], parseLine: () => [] }), runner.policy),
    );
    expect(ran.some(event => event.type === 'result')).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * The REAL call sites state the right door
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the real call sites: git runs through the git door, a build through the build door, a session on its own driver', () => {
  const ACTOR = { user_id: 7, username: 'door-tester' };
  beforeEach(resetInstance);
  afterEach(async () => {
    __setTestDriver('claude_code', null);
    await resetInstance();
  });
  async function makeSite(slug: string): Promise<void> {
    const { domain } = await provisionSite(slug);
    await createSite({ slug, name: slug, domain, actor: ACTOR });
  }
  type Call = { argv: string[]; env: string; egress: string[] | null; probe: Record<string, string> };
  function assertGitDoor(net: NetworkLeaf, calls: Call[], runner: ReturnType<typeof recordingPolicy>): void {
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const tail = call.argv.slice(call.argv.indexOf('--') + 1);
      const original = tail.slice(3);
      expect({ ran: original[0] }).toEqual({ ran: 'git' });
      assertDoorShape(net, 'git', call.argv, original);
      expect({ git: original.join(' '), bind: call.argv.some(arg => arg.startsWith('--property=BindPaths=')) }).toEqual({
        git: original.join(' '),
        bind: false,
      });
      expect({ git: original.join(' '), proxy: /HTTPS?_PROXY=/i.test(call.env) }).toEqual({ git: original.join(' '), proxy: false });
      expect({ git: original.join(' '), reached: reachedForbidden(call.argv, runner.policy) }).toEqual({
        git: original.join(' '),
        reached: [],
      });
    }
  }

  test('git.ts: changedFiles, excludeDaemonState and commitAll state the git door on every command', async () => {
    // GI1: git's door changed to 'build' gave every git command a proxy socket and the
    // registry plan, and nothing reddened — every package row passed the door literally.
    const net = await networkLeaf();
    await makeSite('door-git');
    const runner = recordingPolicy();
    await changedFiles('door-git', runner.policy);
    await excludeDaemonState('door-git', runner.policy);
    await commitAll('door-git', 'door check', runner.policy);
    const calls = runner.calls();
    // status; rm --cached; (commitAll:) rm --cached, add -A, diff --cached — at least five.
    expect(calls.length).toBeGreaterThanOrEqual(5);
    assertGitDoor(net, calls, runner);
  });

  test('builder.ts: every build step states the build door — its bound dir holds proxy.sock and nothing else', async () => {
    // BD1/BD2: the builder's door changed and nothing reddened.
    const net = await networkLeaf();
    await makeSite('door-build');
    const manifest = await readManifest('door-build');
    manifest.build = { install: 'true', build: 'true', output: 'src' };
    await writeManifest(manifest);
    const runner = recordingPolicy();
    const { build_id } = await startBuild('door-build', runner.policy);
    for (let waited = 0; ; waited += 20) {
      const record = await getBuild('door-build', build_id);
      if (record && record.outcome !== 'running') break;
      if (waited > 8_000) throw new Error('build never finished');
      await Bun.sleep(20);
    }
    const calls = runner.calls();
    expect(calls.map(call => call.argv.slice(call.argv.indexOf('--') + 4))).toEqual([['true'], ['true']]);
    for (const call of calls) {
      assertDoorShape(net, 'build', call.argv, call.argv.slice(call.argv.indexOf('--') + 4));
      expect(call.egress).toEqual(['proxy.sock']);
      expect(call.env).toContain(`HTTPS_PROXY="http://127.0.0.1:${net.PROXY_PORT}"`);
      // …and the gate it was served tunnels to the BUILD plan (the registry) and nothing else:
      // a build given the turn door would reach the model provider and not its registry.
      expect(call.probe).toEqual({
        'api.anthropic.com': '403',
        'registry.npmjs.org': '502',
        'api.provider.example': '403',
        'evil.example.com': '403',
      });
      expect(reachedForbidden(call.argv, runner.policy)).toEqual([]);
    }
  });

  test('startSession / sendMessage: an opencode site with no provider host is a 503 BEFORE any reservation', async () => {
    // MG4–MG6: the manager's driver-specific checks were never exercised.
    await makeSite('door-oc');
    const manifest = await readManifest('door-oc');
    await writeManifest({ ...manifest, driver: 'opencode' });
    const runner = recordingPolicy(); // claude_code default, providerHosts []
    let refused: unknown = null;
    try {
      await sessionManager.startSession('door-oc', 'hello', undefined, runner.policy);
    } catch (error) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(ConfinementUnavailableError);
    expect((refused as ConfinementUnavailableError).status).toBe(503);
    expect(String((refused as Error).message)).toContain('AGENT_PROVIDER_HOSTS');
    expect(busyReason('door-oc')).toBeNull();
    expect(await listSessions('door-oc')).toEqual([]);
    // A follow-up on an existing opencode session is judged the same way, before reserving.
    const sessionId = crypto.randomUUID();
    await writeMeta({
      session_id: sessionId,
      slug: 'door-oc',
      driver: 'opencode',
      started_at: new Date().toISOString(),
      turns: 1,
      state: 'idle',
      resume_token: null,
    });
    await expect(sessionManager.sendMessage(sessionId, 'again', runner.policy)).rejects.toThrow(/AGENT_PROVIDER_HOSTS/);
    expect(busyReason('door-oc')).toBeNull();
  });

  test('startSession: a claude_code site on an opencode-DEFAULT host with no provider list is accepted, and its git runs through the git door', async () => {
    // The S3 this closes: the driver-less courtesy check judged the INSTANCE default's plan, so
    // every claude_code site on such a host was refused for a provider list it does not use.
    const net = await networkLeaf();
    await makeSite('door-cc');
    const base = recordingPolicy();
    const policy = {
      ...base.policy,
      egressFacts: { driver: 'opencode', providerHosts: [], registryHosts: ['registry.npmjs.org'] },
    } as ConfinementPolicy;
    // The driver hands its options to the REAL supervisor with NO seam of its own — exactly
    // what claude_code.ts does — so the only policy the turn can run under is the one the
    // manager put in `opts.confinement`. (M16: the manager dropping it; M17: the supervisor
    // ignoring it. Either way the turn falls to this host's config and no turn unit is seen.)
    const handed: Array<ConfinementPolicy | undefined> = [];
    const fake: AgentDriver = {
      id: 'claude_code',
      capabilities: { resume: true, mcpHttp: true, reportsFileChanges: true },
      async detect() {
        return { id: 'claude_code', binPath: 'fake', version: '1' };
      },
      startTurn(opts) {
        handed.push(opts.confinement);
        return spawnAgentProcess(opts, async () => ({ argv: ['/opt/claude'], parseLine: () => [] }));
      },
    };
    __setTestDriver('claude_code', fake);
    const { session_id } = await sessionManager.startSession('door-cc', 'hello', 'claude_code', policy);
    expect(session_id).toBeTruthy();
    for (let waited = 0; sessionManager.getSessionState('door-cc').state === 'running'; waited += 20) {
      if (waited > 8_000) throw new Error('turn never finished');
      await Bun.sleep(20);
    }
    expect(handed.length).toBe(1);
    expect(handed[0] === policy).toBe(true);

    const calls = base.calls();
    const originalOf = (call: Call) => call.argv.slice(call.argv.indexOf('--') + 4);
    // THE TURN ran as a unit of THIS policy: the turn door's shape, its bound dir holding the
    // proxy and MCP sockets, and a gate serving the claude_code plan.
    const turns = calls.filter(call => originalOf(call)[0] === '/opt/claude');
    expect(turns.length).toBe(1);
    const turn = turns[0] as Call;
    assertDoorShape(net, 'turn', turn.argv, ['/opt/claude']);
    expect([...(turn.egress ?? [])].sort()).toEqual(['mcp.sock', 'proxy.sock']);
    expect(turn.probe).toEqual({
      'api.anthropic.com': '502',
      'registry.npmjs.org': '403',
      'api.provider.example': '403',
      'evil.example.com': '403',
    });
    // The turn's own git (changedFiles, commitAll) ran under that SAME policy — every command
    // through the git door — and the specific commands are there, not just "some git ran" (M14/M15:
    // either call made without the policy runs unconfined and vanishes from this record).
    const gits = calls.filter(call => call !== turn);
    assertGitDoor(net, gits, base);
    const ran = gits.map(call => originalOf(call).join(' '));
    for (const command of ['git status --porcelain', 'git add -A', 'git diff --cached --quiet']) {
      expect({ command, ran: ran.includes(command) }).toEqual({ command, ran: true });
    }
  });

  test('startBuild: a registry plan the BUILD door cannot use is a 503 BEFORE the reservation', async () => {
    // M19: the pre-reservation check asked about the 'turn' door, whose plan does not read
    // BUILD_REGISTRY_HOSTS — so a bad registry was caught only inside runConfined, after the
    // workspace was reserved and a build record written, which is what the check prevents.
    await makeSite('door-reg');
    const manifest = await readManifest('door-reg');
    manifest.build = { install: 'true', build: 'true', output: 'src' };
    await writeManifest(manifest);
    const runner = recordingPolicy({
      egressFacts: { driver: 'claude_code', providerHosts: [], registryHosts: ['10.0.0.5'] },
    });
    // Control: the TURN plan of this same policy is sound — the refusal is the build door's.
    expect(confinementProblems(runner.policy, 'turn', 'claude_code')).toEqual([]);
    let refused: unknown = null;
    try {
      await startBuild('door-reg', runner.policy);
    } catch (error) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(ConfinementUnavailableError);
    expect((refused as ConfinementUnavailableError).status).toBe(503);
    expect(String((refused as Error).message)).toContain('BUILD_REGISTRY_HOSTS');
    expect(busyReason('door-reg')).toBeNull();
    expect(await latestBuild('door-reg')).toBeNull();
    expect(runner.calls()).toEqual([]);
  });
});
