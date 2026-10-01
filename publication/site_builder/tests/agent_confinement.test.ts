/**
 * WHAT AN AGENT RUN RUNS AS — the behavioural half of the confinement boundary.
 *
 * The sibling gates hold the turn's ENVIRONMENT (`agent_env_boundary.test.ts`), its API key
 * (`agent_boundary.test.ts`), and its cwd (`git_confinement.test.ts`, `paths.test.ts`). All
 * describe a child that was, until the confinement existed, spawned as the DAEMON'S OWN UID:
 * the shared bearer at `$CREDENTIALS_DIRECTORY`, every provider key in `/proc/self/environ`
 * and the append handle on the audit trail were readable to it by construction.
 *
 * Since LEAD-1b the daemon STARTS NOTHING. Root renders one socket, target and service
 * template per (site, door) — `User=` the site's own identity — and the daemon connects,
 * once, to the site's socket, hands the unit its argv and environment as a frame, and
 * relays what comes back. So this file asserts, against a stand-in PID 1 that listens on the
 * real per-(site, door) paths and speaks the frame protocol (`support/lead1b_host.ts`):
 *
 *   1. THE UNIT. A run of site S goes to S's own socket for its door, with S's reservation
 *      held; the spec carries the argv, an environment without any key the unit fixes, and
 *      the daemon's namespace identity. No uid, no unit name, no file PID 1 reads.
 *   2. THE EGRESS. What a RENDERED unit can reach is ASKED of a model of systemd
 *      (`support/systemd_reach.ts`, allow-wins), never read off property strings; the gate a
 *      run is served tunnels to its own plan's hosts and nothing else, lives exactly as long
 *      as the run, and is gone on every exit path.
 *   3. THE REFUSAL. A host that cannot do any of it starts nothing, and says which part is
 *      missing. Where `none` is DECLARED, every run announces itself into its own durable
 *      log — the one shape of unconfined run this daemon permits, never a silent fallback.
 *   4. THE CALL SITES. git runs through the git door, a build through the build door, a
 *      session's turn on its own driver — observed on the frames the stand-in received.
 *
 * Plus the per-turn credential residence (the MCP config a driver writes is 0640 and is
 * DELETED when the turn ends, on every exit path), the shared tree two uids work in, and the
 * planted-link reads. The lease, the death probe, conformance, boot reconciliation and the
 * per-site reach model are LEAD-1b's own gates (`lead1b_*.test.ts`).
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
import { provisionSite, resetInstance, roots, workspacePath } from './fixtures/instance';
import { config } from '../src/config';
import { CONFINED_ARGV, runBinary } from '../src/util/spawn';
import {
  appendFilePrivate,
  applySharedModes,
  mkdirPrivate,
  mkdirShared,
  PlantedSymlinkError,
  DAEMON_STATE_DIR_MODE,
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
  hostFacts,
  RUNTIME_PREFIX,
  readHostNetns,
  resolveAgentIdentity,
  policyFromConfig,
  type ConfinedChild,
  type ConfinementPolicy,
} from '../src/drivers/confinement';
import { FIXED_ENV_KEYS } from '../src/drivers/unit_frames';
import { MCP_PORT, PROXY_PORT } from '../src/drivers/network_profile';
import * as sessionManager from '../src/sessions/manager';
import { type Destination, describeDestination, reach } from './support/systemd_reach';
import { spawnAgentProcess } from '../src/drivers/process';
import { ALLOWED_TOOLS, DENIED_TOOLS, writeMcpConfig } from '../src/drivers/claude_code';
import { DENIED_PERMISSIONS, writeMcpConfig as writeOpencodeConfig } from '../src/drivers/opencode';
import { piDriver } from '../src/drivers/pi';
import { changedFiles, commitAll, excludeDaemonState } from '../src/sites/git';
import { createSite } from '../src/sites/workspace';
import { __setTestDriver } from '../src/drivers/registry';
import { busyReason, end, tryBegin, type ReservationKind } from '../src/workspace_activity';
import {
  appendEvent,
  listSessions,
  readMeta,
  replayEvents,
  writeMeta,
} from '../src/sessions/store';
import { getBuild, getBuildLog, latestBuild, startBuild } from '../src/build/builder';
import { readManifest, writeManifest } from '../src/sites/manifest';
import { ConfinementRefusedError, ConfinementUnavailableError } from '../src/errors';
import type { AgentDriver, AgentEvent } from '../src/drivers/types';
import { GATE_IDS, type GatePolicy, lead1bPolicy, socketPathFor, waitUntil } from './support/lead1b_host';
import {
  gateInstance,
  gateManifestDoc,
  renderAgentUnits,
  sweepScratch,
  unitProperties,
} from './support/lead1b_contract';

const scratch: string[] = [];

/** The site every single-site row runs; its identity is ordinal 1. */
const SLUG = 'site-a';
/** The daemon's network namespace identity the stand-in states (macOS and CI have no /proc). */
const TEST_NETNS = 'net:[4026531840]';
/** Where the unit's ExecStart must point: the in-unit shim that checks the netns first. */
const SHIM_PATH = join(import.meta.dir, '..', 'src', 'drivers', 'egress_shim.ts');

/** The stand-in PID 1s this file started — closed after each test, whatever it did. */
const hosts: GatePolicy[] = [];
/** Reservations a row took — released after each test, whatever it did. */
const reservations: Array<[string, ReservationKind]> = [];

afterEach(async () => {
  for (const host of hosts.splice(0)) {
    host.standIn.release();
    await host.standIn.close();
  }
  for (const [slug, kind] of reservations.splice(0)) end(slug, kind);
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
  sweepScratch();
});

/**
 * A REAL `systemd_scope` policy on this machine, against a stand-in PID 1: the per-(site,
 * door) sockets are real unix listeners with MaxConnections=1 semantics, `systemctl` is
 * answered, and the loaded properties conform. Each site's workspace exists.
 */
async function standIn(
  entries: Array<[string, number]> = [[SLUG, 1]],
  options: { overrides?: Record<string, unknown>; hostOverrides?: Record<string, unknown>; version?: number } = {},
): Promise<GatePolicy> {
  const host = await lead1bPolicy({ identities: new Map(entries), ...options });
  hosts.push(host);
  for (const [slug] of entries) mkdirSync(workspacePath(slug), { recursive: true });
  return host;
}

/** The policy with some fields replaced — and its egress seams MERGED, never lost. */
function withPolicy(host: GatePolicy, overrides: Record<string, unknown>): ConfinementPolicy {
  const seams = overrides.egressSeams as Record<string, unknown> | undefined;
  return {
    ...host.policy,
    ...overrides,
    ...(seams ? { egressSeams: { ...host.policy.egressSeams, ...seams } } : {}),
  } as ConfinementPolicy;
}

/** Hold the site's reservation for `kind`, as every real caller does, until `fn` settles. */
async function held<T>(slug: string, fn: () => Promise<T>, kind: ReservationKind = 'build'): Promise<T> {
  expect(tryBegin(slug, kind)).toBe(true);
  reservations.push([slug, kind]);
  try {
    return await fn();
  } finally {
    end(slug, kind);
  }
}

/** Read a confined child to its end and clean it up. */
async function drainChild(child: ConfinedChild): Promise<{ stdout: string; stderr: string; exit: Awaited<ConfinedChild['exited']> }> {
  const read = async (stream: AsyncIterable<Uint8Array>) => {
    let out = '';
    const decoder = new TextDecoder();
    for await (const chunk of stream) out += decoder.decode(chunk, { stream: true });
    return out + decoder.decode();
  };
  try {
    const [stdout, stderr] = await Promise.all([read(child.stdout), read(child.stderr)]);
    return { stdout, stderr, exit: await child.exited };
  } finally {
    await child.cleanup();
  }
}

/** One run of `door` for `slug` through the REAL confineTurn, drained. */
function runDoor(host: GatePolicy, door: 'turn' | 'build' | 'git', extra: Record<string, unknown> = {}, policy?: ConfinementPolicy) {
  const slug = (extra.slug as string | undefined) ?? SLUG;
  return held(slug, async () =>
    drainChild(
      await confineTurn(
        {
          door,
          slug,
          argv: door === 'git' ? ['git', 'status', '--porcelain'] : ['/opt/claude', '-p', 'build a page'],
          cwd: workspacePath(slug),
          env: { PATH: '/usr/bin:/bin' },
          timeoutMs: 60_000,
          ...extra,
        } as Parameters<typeof confineTurn>[0],
        policy ?? host.policy,
      ),
    ),
  );
}

/** The verb of a `systemctl` argv (its first non-option word). */
const verbOf = (args: readonly string[]) => args.find(arg => !arg.startsWith('-'));

/**
 * What the per-site gate directories hold right now (`s<k>/<entry>`). The directories are
 * ROOT's (tmpfiles.d) and outlive every run; what a run leaves behind is what is IN them.
 */
function egressEntries(host: GatePolicy): string[] {
  const dir = join(host.agentSocketDir, 'egress');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap(site => readdirSync(join(dir, site)).map(entry => `${site}/${entry}`));
}

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

/** The hosts a served gate is asked about while its run is live. */
const PROBE_HOSTS = Object.freeze(['api.anthropic.com', 'registry.npmjs.org', 'api.provider.example', 'evil.example.com']);

/**
 * The gate's resolver and dialer, STATED: every name resolves public and every dial is
 * refused — so a CONNECT answers 502 for a host ON the run's plan (resolved, dial tried) and
 * 403 for one that is not, and nothing ever leaves this machine.
 */
const REFUSING_DIAL = Object.freeze({
  lookup: async () => [{ address: '93.184.216.34', family: 4 }],
  dial: async () => {
    throw new Error('dial refused by the gate row');
  },
});

/** host → the served proxy's status, asked through site k's gate while its run is live. */
async function probeGate(host: GatePolicy, k = 1): Promise<Record<string, string>> {
  const proxy = join(host.agentSocketDir, 'egress', `s${k}`, 'proxy.sock');
  const out: Record<string, string> = {};
  for (const target of PROBE_HOSTS) out[target] = String(await connectThrough(proxy, `${target}:443`));
  return out;
}

/** A driver setup thunk for the supervisor rows. */
const plan = (argv: string[] = ['/opt/claude']) => async () => ({ argv, parseLine: (line: string) => [{ type: 'text' as const, text: line }] });

/** Drain an AgentProcess's events. */
async function drain(proc: ReturnType<typeof spawnAgentProcess>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of proc.events) events.push(event);
  return events;
}

/** A turn's start options for `slug` (default: SLUG) — the supervisor's input. */
function turnStart(extra: Record<string, unknown> = {}): Parameters<typeof spawnAgentProcess>[0] {
  const slug = (extra.slug as string | undefined) ?? SLUG;
  return {
    slug,
    workspace: workspacePath(slug),
    prompt: 'x',
    mcp: { name: 'dedalo_publication', url: `http://127.0.0.1:${MCP_PORT}/mcp` },
    env: { PATH: '/usr/bin:/bin' },
    timeoutMs: 30_000,
    ...extra,
  } as Parameters<typeof spawnAgentProcess>[0];
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * THE UNIT — a site's run goes to that site's socket, and carries no identity of its own
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a confined run is an instance of the SITE’s own unit, reached over its own socket', () => {
  test('one connect to the site’s turn socket; the spec is argv, env and the namespace — never a uid, a unit or a file', async () => {
    const host = await standIn();
    host.standIn.script = () => ({ kind: 'exit', code: 0, stdout: 'hello' });
    const result = await runDoor(host, 'turn');
    expect({ exit: result.exit.exitCode, stdout: result.stdout }).toEqual({ exit: 0, stdout: 'hello' });
    // THE SOCKET decides the uid: root rendered `User=` into the site's template, and nothing
    // the daemon sends can name another.
    expect(host.standIn.connects).toEqual([socketPathFor(host.agentSocketDir, 1, 'turn')]);
    const spec = host.standIn.specs[0]?.spec as Record<string, unknown>;
    expect(Object.keys(spec).sort()).toEqual(['argv', 'door', 'env', 'hostNetns', 'v']);
    expect({ door: spec.door, argv: spec.argv, hostNetns: spec.hostNetns }).toEqual({
      door: 'turn',
      argv: ['/opt/claude', '-p', 'build a page'],
      hostNetns: TEST_NETNS,
    });
    // The unit fixes HOME and the DEDALO_* keys; the daemon never sends one.
    const env = spec.env as Record<string, string>;
    expect(Object.keys(env).filter(key => key === 'HOME' || key.startsWith('DEDALO_'))).toEqual([]);
    // THE CONTROL PLANE: the daemon asked PID 1 questions and never started anything.
    const verbs = new Set(host.standIn.systemctlCalls.map(verbOf));
    expect([...verbs].filter(verb => verb !== 'show' && verb !== 'list-units' && verb !== 'stop')).toEqual([]);
    // No file was written for PID 1 to read as root (the pre-LEAD-1b per-run env file).
    expect(existsSync(join(host.runtimeDir, 'turns'))).toBe(false);
  });

  test('every door carries the daemon’s namespace identity — the shim refuses a spec without it', async () => {
    const host = await standIn();
    for (const door of ['turn', 'build', 'git'] as const) await runDoor(host, door);
    expect(host.standIn.specs.map(({ door, spec }) => ({ door, hostNetns: spec.hostNetns }))).toEqual([
      { door: 'turn', hostNetns: TEST_NETNS },
      { door: 'build', hostNetns: TEST_NETNS },
      { door: 'git', hostNetns: TEST_NETNS },
    ]);
    expect(host.standIn.connects).toEqual(
      (['turn', 'build', 'git'] as const).map(door => socketPathFor(host.agentSocketDir, 1, door)),
    );
  });

  test('the egress env wins over the caller’s, and git gets none', async () => {
    const host = await standIn();
    await runDoor(host, 'turn', {
      env: { PATH: '/usr/bin', HTTPS_PROXY: 'http://attacker.example:8080', NO_PROXY: '*' },
    });
    const turnEnv = host.standIn.specs[0]?.spec.env as Record<string, string>;
    expect({
      HTTPS_PROXY: turnEnv.HTTPS_PROXY,
      NO_PROXY: turnEnv.NO_PROXY,
      NODE_USE_ENV_PROXY: turnEnv.NODE_USE_ENV_PROXY,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: turnEnv.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC,
    }).toEqual({
      HTTPS_PROXY: `http://127.0.0.1:${PROXY_PORT}`,
      NO_PROXY: '127.0.0.1,localhost',
      NODE_USE_ENV_PROXY: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    });
    expect(JSON.stringify(turnEnv)).not.toContain('attacker.example');
    // git reaches nothing: no proxy is offered, so none can be wrong.
    await runDoor(host, 'git', { env: { PATH: '/usr/bin' } });
    const gitEnv = host.standIn.specs[1]?.spec.env as Record<string, string>;
    expect(Object.keys(gitEnv).filter(key => /proxy/i.test(key))).toEqual([]);
  });

  test('a caller handing a key the UNIT fixes is refused — nothing is connected', async () => {
    // HOME (the cross-site plant channel), the transpiler cache the agent's HOME could seed,
    // git's configuration and every DEDALO_* key are the unit's, fixed by root.
    const host = await standIn();
    const keys = [...FIXED_ENV_KEYS.filter(key => !key.endsWith('*')), 'DEDALO_UNIT_WORKDIR', 'DEDALO_DOOR'];
    expect(keys).toContain('HOME');
    for (const key of keys) {
      let refused: unknown = null;
      try {
        await runDoor(host, 'build', { env: { PATH: '/usr/bin', [key]: '/srv/elsewhere' } });
      } catch (error) {
        refused = error;
      }
      expect({ key, refused: refused instanceof Error && (refused as Error).message.includes(key) }).toEqual({ key, refused: true });
    }
    expect(host.standIn.connects).toEqual([]);
    expect(egressEntries(host)).toEqual([]);
    // The control: an ordinary key is carried.
    await runDoor(host, 'build', { env: { PATH: '/usr/bin', LANG: 'C.UTF-8' } });
    expect(host.standIn.specs[0]?.spec.env.LANG).toBe('C.UTF-8');
  });

  test('the Publication API key reaches the GATE, never the unit', async () => {
    const host = await standIn();
    await runDoor(host, 'turn', {
      mcpUpstream: { url: 'http://127.0.0.1:1/publication/server_api/v2', apiKey: 'publication-secret' },
    });
    expect(JSON.stringify(host.standIn.specs[0]?.spec)).not.toContain('publication-secret');
    // …and the gate DID serve the MCP door the key rides on (the positive control).
    expect(host.gateEvents.some(event => event.startsWith('serve ') && event.endsWith('mcp.sock'))).toBe(true);
  });

  test('an opencode turn with no declared provider host is a named refusal — asked of the RUN’s driver', async () => {
    // Hostname-only egress: a turn whose provider nobody named can reach nothing, and says
    // so before a session is accepted rather than failing inside the unit.
    const host = await standIn();
    const opencodeHost = withPolicy(host, {
      egressFacts: { driver: 'opencode', providerHosts: [], registryHosts: ['registry.npmjs.org'] },
    });
    expect((await confinementProblems(opencodeHost, 'turn', 'opencode')).join(' ')).toContain('AGENT_PROVIDER_HOSTS');
    // The site's OWN driver decides, not the instance default — in BOTH directions.
    expect((await confinementProblems(host.policy, 'turn', 'opencode')).join(' ')).toContain('AGENT_PROVIDER_HOSTS');
    expect((await confinementProblems(opencodeHost, 'turn', 'claude_code'))).toEqual([]);
    // A driver-less question about a turn is a question about the HOST: no plan is judged.
    expect((await confinementProblems(opencodeHost, 'turn'))).toEqual([]);
    // The GUARANTEE is never driver-less: confineTurn resolves the run's driver (here the
    // instance default) and refuses on its plan — before anything is connected.
    await expect(runDoor(host, 'turn', {}, opencodeHost)).rejects.toThrow(/AGENT_PROVIDER_HOSTS/);
    expect(host.standIn.connects).toEqual([]);
    // The positive control: the same host with a provider named refuses nothing.
    expect(
      (await confinementProblems(
        withPolicy(host, { egressFacts: { driver: 'opencode', providerHosts: ['api.provider.example'], registryHosts: [] } }),
        'turn',
        'opencode',
      )),
    ).toEqual([]);
  });
});

describe("the unit's ExecStart is the shim, and a shim the unit cannot trust is refused", () => {
  test('the daemon states its REAL runtime, shim and masked prefixes', () => {
    // The stand-in empties the masks (this host is not the one that runs the unit); this row
    // is what keeps that seam from being the production value.
    expect(CONFINEMENT_SHIM_PATH).toBe(SHIM_PATH);
    expect(policyFromConfig().unitExec).toEqual({
      runtime: process.execPath,
      shim: SHIM_PATH,
      maskedPrefixes: UNIT_MASKED_PREFIXES,
    });
    expect([...UNIT_MASKED_PREFIXES].sort()).toEqual(['/home', '/root', '/run', '/tmp', '/var/tmp']);
  });

  test('a shim under a masked prefix, writable by others, or absent is a named refusal — its imports too', async () => {
    const host = await standIn();
    const dir = mkdtempSync(join(existsSync('/tmp') ? '/tmp' : tmpdir(), 'dsb-shim-'));
    scratch.push(dir);
    const shim = join(dir, 'egress_shim.ts');
    const leaves = ['network_profile.ts', 'unit_frames.ts', 'agent_identity.ts', 'unit_properties.ts'];
    writeFileSync(shim, readFileSync(SHIM_PATH));
    chmodSync(shim, 0o644);
    for (const leaf of leaves) {
      writeFileSync(join(dir, leaf), readFileSync(join(dirname(SHIM_PATH), leaf)));
      chmodSync(join(dir, leaf), 0o644);
    }
    const withExec = async (unitExec: { shim: string; maskedPrefixes: readonly string[] }) =>
      (await confinementProblems(withPolicy(host, { unitExec: { runtime: process.execPath, ...unitExec } }), 'git')).join(' ');

    // Control: the copy itself is acceptable when nothing is masked.
    expect(await withExec({ shim, maskedPrefixes: [] })).toBe('');
    // Under /tmp, which PrivateTmp= hides from the unit: its ExecStart would not exist.
    expect(await withExec({ shim, maskedPrefixes: UNIT_MASKED_PREFIXES })).toContain('which the unit masks');
    // Writable by the group: an identity shares the instance group, and could replace it.
    chmodSync(shim, 0o664);
    expect(await withExec({ shim, maskedPrefixes: [] })).toContain('group- or world-writable');
    chmodSync(shim, 0o644);
    // …and every module it imports is held to the same rule.
    for (const leaf of leaves) {
      chmodSync(join(dir, leaf), 0o666);
      expect({ leaf, refused: (await withExec({ shim, maskedPrefixes: [] })).includes('group- or world-writable') }).toEqual({ leaf, refused: true });
      chmodSync(join(dir, leaf), 0o644);
    }
    // Absent: nothing to execute.
    expect(await withExec({ shim: join(dir, 'missing.ts'), maskedPrefixes: [] })).toContain('does not exist');
  });
});

describe('no secret outlives the turn', () => {
  test('both drivers write their MCP config 0640, key included, and never wider', async () => {
    // The mode is the assertion, not the bytes: this file carries the museum's Publication
    // API key (under a DECLARED `none`), and at 0644 it would be readable by every uid on the
    // host. 0640 leaves exactly the daemon and the instance group.
    // UNDER `SITES_ROOT`, because that is where a workspace is and because the writer
    // takes the trusted root and walks everything below it O_NOFOLLOW (see the plant legs).
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

  /**
   * THE TURN CAN OPEN WHAT IT IS HANDED — AS THE SITE'S IDENTITY. A confined turn is not the
   * daemon (LEAD-1b): it is a uid that owns nothing on the path and is a member of the
   * instance group. Behind a 0700 `.builder` (the daemon's own state) the 0640 `mcp.json` was
   * EACCES to `--mcp-config` for every turn; the suite never saw it because `none` runs as the
   * daemon's own uid. So the path is read as THAT principal, bit by bit: every directory from
   * the workspace down needs the group's `x`, the file the group's `r` — and the identity must
   * be able to WRITE neither the file nor `.builder` (it would point its own MCP client
   * anywhere). Both shapes of `.builder`: the one `mkdirPrivate` makes now, and a 0700 one made
   * before (restated by the writer, through its handle).
   */
  test('the site identity (group member, owner of nothing) can open the MCP config the turn is handed, and write neither it nor .builder', async () => {
    mkdirSync(roots.sitesRoot, { recursive: true });
    const rows: unknown[] = [];
    for (const shape of ['created now', 'a 0700 .builder from before'] as const) {
      const slug = `dedalo-mcp-reach-${shape === 'created now' ? 'new' : 'old'}-${process.pid}`;
      await mkdirShared(roots.sitesRoot, slug);
      const workspace = join(roots.sitesRoot, slug);
      scratch.push(workspace);
      if (shape === 'created now') {
        await mkdirPrivate(roots.sitesRoot, join(slug, '.builder'));
      } else {
        mkdirSync(join(workspace, '.builder'));
        chmodSync(join(workspace, '.builder'), 0o700);
      }
      const path = await writeMcpConfig({
        workspace,
        prompt: 'x',
        // `systemd_scope`'s shape: the unit's loopback, no headers (the gate adds the key).
        mcp: { name: 'dedalo_publication', url: `http://127.0.0.1:${MCP_PORT}/mcp` },
        env: {},
        timeoutMs: 1000,
      });
      const chain = [workspace, join(workspace, '.builder')];
      const facts = (each: string) => statSync(each);
      const groupOf = facts(workspace).gid;
      rows.push({
        shape,
        // The model's premise: one group along the path (setgid workspace; the daemon's own
        // primary group below it) — the instance group the identity is in.
        oneGroup: [...chain, path].every(each => facts(each).gid === groupOf),
        traverse: chain.every(dir => (facts(dir).mode & 0o010) !== 0),
        read: (facts(path).mode & 0o040) !== 0,
        writeFile: (facts(path).mode & 0o020) !== 0,
        writeBuilder: (facts(join(workspace, '.builder')).mode & 0o020) !== 0,
        listBuilder: (facts(join(workspace, '.builder')).mode & 0o040) !== 0,
        world: [...chain, path].some(each => (facts(each).mode & 0o007) !== 0),
      });
    }
    const expected = { oneGroup: true, traverse: true, read: true, writeFile: false, writeBuilder: false, listBuilder: false, world: false };
    expect(rows).toEqual([
      { shape: 'created now', ...expected },
      { shape: 'a 0700 .builder from before', ...expected },
    ]);
  });

  test('a real confined turn is relayed, says nothing about confinement, and leaves nothing for PID 1 behind', async () => {
    const host = await standIn();
    host.standIn.script = () => ({ kind: 'exit', code: 0, stdout: 'started\n' });
    const events = await held(SLUG, () => drain(spawnAgentProcess(turnStart(), plan(), host.policy)), 'turn');
    const texts = events.filter(event => event.type === 'text').map(event => (event.type === 'text' ? event.text : ''));
    // The turn really went through the unit — otherwise the rest of this asserts nothing.
    expect(texts).toContain('started');
    // …and nothing was announced: a CONFINED turn has nothing to confess.
    expect(texts.some(line => line.includes('[confinement]'))).toBe(false);
    expect(events.some(event => event.type === 'result')).toBe(true);
    expect(existsSync(join(host.runtimeDir, 'turns'))).toBe(false);
    expect(egressEntries(host)).toEqual([]);
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

describe('there is no silent unconfined run', () => {
  test('every missing piece is its own named refusal, and a complete host refuses nothing', async () => {
    const host = await standIn();
    for (const [label, policy] of [
      ['no site identity at all', withPolicy(host, { identities: new Map() })],
      ['a prefix that is not this museum’s grammar', withPolicy(host, { unitPrefix: 'anything' })],
      ['no systemctl on this host', withPolicy(host, { systemctlBin: '/nonexistent/systemctl' })],
      ['no runtime directory (tcp)', withPolicy(host, { listenKind: 'tcp' })],
      ['PID 1’s release unreadable', withPolicy(host, { host: { ...host.policy.host, pid1Version: () => null } })],
    ] as const) {
      const problems = (await confinementProblems(policy, 'git'));
      expect({ label, problems: problems.length }).toEqual({ label, problems: 1 });
      // 503, so the ENGINE relays "not right now, and here is what is missing" rather than
      // accepting a session that will never run.
      let refused: unknown = null;
      try {
        await assertConfinementAvailable('git', policy);
      } catch (error) {
        refused = error;
      }
      expect({ label, status: (refused as ConfinementUnavailableError | null)?.status }).toEqual({ label, status: 503 });
    }
    // The positive control: without it every assertion above would pass against a function
    // that always refused.
    for (const door of ['turn', 'build', 'git'] as const) {
      expect({ door, problems: (await confinementProblems(host.policy, door)) }).toEqual({ door, problems: [] });
    }
    await assertConfinementAvailable('turn', host.policy);
  });

  test('confineTurn itself refuses too — the check before the reservation is not the guarantee', async () => {
    const host = await standIn();
    await expect(runDoor(host, 'git', {}, withPolicy(host, { systemctlBin: '/nonexistent/systemctl' }))).rejects.toBeInstanceOf(
      ConfinementUnavailableError,
    );
    // A site the host declares no identity for is 503 identity_missing — never a fallback uid.
    const missing = await runDoor(host, 'git', {}, withPolicy(host, { identities: new Map([['site-b', 1]]) })).then(
      () => null,
      error => error,
    );
    expect(missing).toBeInstanceOf(ConfinementRefusedError);
    expect((missing as ConfinementRefusedError).code).toBe('identity_missing');
    expect(host.standIn.connects).toEqual([]);
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

  test("an unconfined run is a RUN, not a stub — with the unit's fixed HOME and git configuration", async () => {
    const host = await standIn();
    const none = withPolicy(host, { mode: 'none' });
    const open = (door: 'turn' | 'git') =>
      confineTurn({ door, argv: ['/usr/bin/env'], cwd: tmpdir(), env: { PATH: '/usr/bin:/bin' }, timeoutMs: 5_000 }, none).then(drainChild);
    const turn = await open('turn');
    expect(turn.exit.exitCode).toBe(0);
    // The same HOME a unit would have (per door, under the agent state root), never the caller's.
    expect(turn.stdout).toContain(`HOME=${join(host.agentStateRoot, 'unconfined', 'turn')}`);
    const git = await open('git');
    expect(git.stdout).toContain('HOME=/nonexistent');
    expect(git.stdout).toContain('GIT_CONFIG_GLOBAL=/dev/null');
    expect(git.stdout).toContain('GIT_CONFIG_NOSYSTEM=1');
    // Nothing reached PID 1: 'none' is the daemon's own child.
    expect(host.standIn.connects).toEqual([]);
    const child = await confineTurn({ door: 'git', argv: ['/usr/bin/true'], cwd: tmpdir(), env: {}, timeoutMs: 5_000 }, none);
    expect(child.announcement).toContain('[confinement]');
    expect(child.pid).toBeGreaterThan(0);
    await drainChild(child);
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

/* ────────────────────────────────────────────────────────────────────────────────────
 * THE OTHER DOORS — a build step and a git command are agent-authored too
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a build step and a git command run as the SITE’s identity, not as the daemon', () => {
  test('runConfined goes through the build door: its socket, its argv, its exit code — and its gate goes away', async () => {
    // The refutation this closes: the turn was confined and the BUILD was not, so an agent
    // that rewrote `site.json` (or shipped a package.json whose install scripts run) had its
    // own command executed by the next build AS THE SERVICE USER.
    const host = await standIn();
    host.standIn.script = () => ({ kind: 'exit', code: 7, stdout: 'installing', stderr: 'boom' });
    const log: string[] = [];
    const result = await held(SLUG, () =>
      runConfined(
        {
          door: 'build',
          slug: SLUG,
          argv: ['bun', 'install'],
          cwd: workspacePath(SLUG),
          env: { PATH: '/usr/bin:/bin' },
          timeoutMs: 5_000,
          label: 'build step',
          onStdout: chunk => log.push(chunk),
        },
        host.policy,
      ),
    );
    expect({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, failure: result.failure }).toEqual({
      exitCode: 7,
      stdout: 'installing',
      stderr: 'boom',
      failure: undefined,
    });
    expect(log.join('')).toContain('installing');
    expect(host.standIn.connects).toEqual([socketPathFor(host.agentSocketDir, 1, 'build')]);
    expect(host.standIn.specs.map(({ door, spec }) => ({ door, argv: spec.argv }))).toEqual([{ door: 'build', argv: ['bun', 'install'] }]);
    // The build door reaches its registry through the gate — served, then closed.
    expect(host.gateEvents.some(event => event.endsWith('proxy.sock'))).toBe(true);
    expect(egressEntries(host)).toEqual([]);
  });

  test('a git command is served NO gate: it reaches nothing at all', async () => {
    const host = await standIn();
    await runDoor(host, 'git');
    expect(host.standIn.specs.map(({ door }) => door)).toEqual(['git']);
    expect(host.gateEvents).toEqual([]);
    expect(host.chowns).toEqual([]);
  });

  test("a DECLARED 'none' announces the unconfined step into the build's own log", async () => {
    const host = await standIn();
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
      withPolicy(host, { mode: 'none' }),
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
    const host = await standIn();
    const refused = await held(SLUG, () =>
      runConfined(
        { door: 'build', slug: SLUG, argv: ['bun', 'install'], cwd: workspacePath(SLUG), env: {}, timeoutMs: 5_000 },
        withPolicy(host, { host: { ...host.policy.host, pid1Version: () => 247 } }),
      ),
    ).then(
      () => null,
      error => error,
    );
    expect(refused).toBeInstanceOf(ConfinementUnavailableError);
    expect(String((refused as Error).message)).toContain('PrivateIPC');
    expect(host.standIn.connects).toEqual([]);
    expect(egressEntries(host)).toEqual([]);
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
      // `.builder` itself is traverse-only to the group (DAEMON_STATE_DIR_MODE): the identity
      // opens the one file it is handed there, and lists, creates and renames nothing.
      expect(bits(join(dir, 'ws', '.builder'))).toBe(DAEMON_STATE_DIR_MODE);
      expect(DAEMON_STATE_DIR_MODE).toBe(0o710);
      await mkdirPrivate(dir, join('ws', '.builder', 'builds'));
      expect(bits(join(dir, 'ws', '.builder'))).toBe(DAEMON_STATE_DIR_MODE);
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
      // The one exception: the daemon's own per-site state stays its own (traverse-only).
      expect(bits(join(dir, '.builder'))).toBe(DAEMON_STATE_DIR_MODE);
      expect(PRIVATE_DIR_MODE).toBe(0o700);
      // Nothing else may list, create or rename in it, so the walk must not have opened what
      // is inside either: a build record restated to 0660 would be a record the agent
      // rewrites the day the directory itself is recreated by a turn.
      expect(bits(join(dir, '.builder')) & 0o067).toBe(0);
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
 * THE EGRESS — what a RENDERED unit can reach (LEAD-1, on LEAD-1b's root-rendered units)
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * WHAT NO CONFINED RUN MAY REACH, from the host's side: loopback services, the DNS stub,
 * the LAN, the metadata service, the host's own address, the internet DIRECTLY (egress is
 * the gate's job, by hostname), the engine's/databases' sockets wherever a distro puts
 * them, THIS daemon's socket, the host's /dev/shm, docker, SysV IPC and an abstract socket.
 * (Another SITE's run, sockets and state are G6's, uid-aware — `lead1b_c4_units.test.ts`.)
 */
function hostForbidden(runtimeDir: string): Destination[] {
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
    { kind: 'unix', path: join(runtimeDir, 'daemon.sock') },
    // The host's /dev/shm, which PrivateDevices= binds back into the private /dev.
    { kind: 'unix', path: '/dev/shm/x.sock' },
    // A SysV key / POSIX queue in the HOST's IPC namespace (every unit without PrivateIPC=).
    { kind: 'ipc', name: 'sysv:0x5a5a0001' },
    { kind: 'abstract', name: 'lp' },
  ];
}

/** The [Service] properties of site k's rendered `door` template. */
function templateProps(files: Map<string, { body: string }>, prefix: string, k: number, door: string): string[] {
  const file = files.get(`${prefix}s${k}-${door}@.service`);
  if (!file) throw new Error(`no rendered template ${prefix}s${k}-${door}@.service`);
  return unitProperties(file.body);
}

describe('THE EGRESS — a rendered unit reaches nothing on the host, the LAN or the internet directly', () => {
  test('every door of every site, at 255 and 257: the forbidden set is empty; its OWN gate is reachable', async () => {
    // LEAD-1, asked of what root REALLY renders. systemd's IP filter is allow-wins, so the
    // pre-fix `IPAddressAllow=any localhost` granted Postgres, the DNS stub, the LAN and the
    // metadata service whatever the deny list said.
    const gate = gateInstance('museo', ['collection', 'archive']);
    const prefix = gate.layout.agentUnitPrefix;
    for (const version of [255, 257]) {
      const files = await renderAgentUnits(gate, version);
      for (const [, k] of gate.identities) {
        for (const door of ['turn', 'build', 'git'] as const) {
          const props = templateProps(files, prefix, k, door);
          const reached = hostForbidden(gate.layout.runtimeDir)
            .filter(dest => reach(props, dest, { netnsHonoured: true }))
            .map(describeDestination);
          expect({ version, k, door, reached }).toEqual({ version, k, door, reached: [] });
          // THE MODEL IS NOT BLIND: a door that reaches out reaches its OWN site's gate (the
          // host path the unit binds to /run/dedalo-egress).
          const ownGate = join(gate.layout.agentSocketDir, 'egress', `s${k}`, 'proxy.sock');
          const own = reach(props, { kind: 'unix', path: ownGate }, { netnsHonoured: true });
          expect({ version, k, door, own }).toEqual({ version, k, door, own: door !== 'git' });
        }
      }
      // MUTATION CONTROL, on a real rendered template: the pre-fix allow reaches the host's
      // services — or "reached: []" above is blindness.
      const widened = [...templateProps(files, prefix, 1, 'build'), 'IPAddressAllow=any'];
      expect(reach(widened, { kind: 'inet', ip: '127.0.0.1', port: 5432 }, { netnsHonoured: false })).toBe(true);
      // …and without its IPC namespace it shares the host's SysV keys.
      const noIpc = templateProps(files, prefix, 1, 'build').filter(prop => prop !== 'PrivateIPC=yes');
      expect(reach(noIpc, { kind: 'ipc', name: 'sysv:0x5a5a0001' }, { netnsHonoured: true })).toBe(true);
    }
  });

  test('a workspace under /home re-exposes THAT directory inside ProtectHome=, and nothing beside it', async () => {
    // systemd.exec(5): ReadWritePaths= nested inside InaccessiblePaths= (which ProtectHome=yes
    // is) is re-exposed. An install whose workspaces live under /home/<svc> therefore gives
    // each unit ITS workspace — and the engine socket beside it, another site's workspace and
    // another user's home stay masked.
    const doc = gateManifestDoc('museo', ['collection', 'archive']);
    const gate = gateInstance('museo', ['collection', 'archive'], { ...doc, roots: { workspaces: '/home/dedalo/sites' } });
    const files = await renderAgentUnits(gate, 255);
    const props = templateProps(files, gate.layout.agentUnitPrefix, 1, 'git');
    const at = (path: string) => reach(props, { kind: 'unix', path }, { netnsHonoured: true });
    // Positive control: the lift is modelled, so a "blocked" below is not the model's blindness.
    expect(at('/home/dedalo/sites/collection/x.sock')).toBe(true);
    expect({
      sibling: at('/home/dedalo/.dedalo.sock'),
      otherSite: at('/home/dedalo/sites/archive/x.sock'),
      otherUser: at('/home/other/x.sock'),
      root: at('/root/x.sock'),
    }).toEqual({ sibling: false, otherSite: false, otherUser: false, root: false });
    // A tmpfs mask is NOT lifted by a nested path (there is nothing under it to re-expose).
    expect(reach(['ProtectHome=tmpfs', 'ReadWritePaths=/home/dedalo/agent'], { kind: 'unix', path: '/home/dedalo/agent/x' }, { netnsHonoured: true })).toBe(false);
    expect(reach(['PrivateTmp=yes', 'ReadWritePaths=/tmp/x'], { kind: 'unix', path: '/tmp/x/s' }, { netnsHonoured: true })).toBe(false);
  });
});

describe('the MCP credential stays with the daemon under systemd_scope', () => {
  test('the turn is handed a LOOPBACK MCP url and no key; the key rides only the daemon-side upstream', async () => {
    const key = config.PUBLICATION_API_KEY;
    expect(key.length).toBeGreaterThan(0); // the suite's env carries one, or this proves nothing
    mkdirSync(roots.sitesRoot, { recursive: true });
    const slug = `confinement-mcp-${process.pid}`;
    const workspace = join(roots.sitesRoot, slug);
    mkdirSync(join(workspace, '.builder'), { recursive: true });
    scratch.push(workspace);
    for (const driver of ['claude_code', 'opencode'] as const) {
      const opts = sessionManager.buildStartOptions(slug, driver, 'x', undefined, 'systemd_scope');
      expect({ driver, url: opts.mcp.url }).toEqual({ driver, url: `http://127.0.0.1:${MCP_PORT}/mcp` });
      expect({ driver, headers: opts.mcp.headers }).toEqual({ driver, headers: undefined });
      expect({ driver, upstreamKey: opts.mcpUpstream?.apiKey }).toEqual({ driver, upstreamKey: key });
      // No caller hands a run its HOME (G13): the unit fixes it.
      expect({ driver, home: 'HOME' in opts.env }).toEqual({ driver, home: false });
      const write = driver === 'claude_code' ? writeMcpConfig : writeOpencodeConfig;
      const path = await write(opts as Parameters<typeof writeMcpConfig>[0]);
      const body = readFileSync(path, 'utf8');
      expect({ driver, carriesKey: body.includes(key), carriesHeader: /x-api-key/i.test(body) }).toEqual({
        driver,
        carriesKey: false,
        carriesHeader: false,
      });
      expect({ driver, loopback: body.includes(`http://127.0.0.1:${MCP_PORT}/mcp`) }).toEqual({ driver, loopback: true });
      rmSync(path, { force: true });
    }
    // The DECLARED-unconfined mode keeps the direct shape: there is no gate to hold the key.
    const none = sessionManager.buildStartOptions(slug, 'claude_code', 'x', undefined, 'none');
    expect(none.mcp.headers?.['X-API-Key']).toBe(key);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * The gate a run is served, on every exit path
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the egress gate lives exactly as long as the run, on every exit path', () => {
  const upstream = { url: 'http://127.0.0.1:1/publication/server_api/v2', apiKey: 'publication-secret' };

  /** A turn that HANGS until released, observed while live: the gate's listing and its answers. */
  async function liveTurn(host: GatePolicy, extra: Record<string, unknown> = {}) {
    host.standIn.script = () => ({ kind: 'hang' });
    const policy = withPolicy(host, { egressSeams: REFUSING_DIAL });
    return held(
      SLUG,
      async () => {
        const proc = spawnAgentProcess(turnStart({ mcpUpstream: upstream, ...extra }), plan(), policy);
        const events = drain(proc);
        await waitUntil(() => host.standIn.specs.length === 1, 8_000, 'the turn to reach its unit');
        const listing = readdirSync(join(host.agentSocketDir, 'egress', 's1')).sort();
        const probe = await probeGate(host);
        host.standIn.release();
        return { events: await events, listing, probe };
      },
      'turn',
    );
  }

  test('success: the turn SAW its proxy and mcp sockets, served its own plan, and none outlive it', async () => {
    const host = await standIn();
    const { events, listing, probe } = await liveTurn(host);
    expect(events.some(event => event.type === 'result')).toBe(true);
    // The positive control: the site's door EXISTED while the unit ran…
    expect(listing).toEqual(['mcp.sock', 'proxy.sock']);
    // …and served the TURN plan of a claude_code run: its provider, nothing else.
    expect(probe).toEqual({
      'api.anthropic.com': '502',
      'registry.npmjs.org': '403',
      'api.provider.example': '403',
      'evil.example.com': '403',
    });
    expect(egressEntries(host)).toEqual([]);
  });

  test('a turn with NO mcpUpstream is served no mcp.sock — nothing forwards to /mcp without a key', async () => {
    const host = await standIn();
    const { events, listing } = await liveTurn(host, { mcpUpstream: undefined });
    expect(events.some(event => event.type === 'result')).toBe(true);
    expect(listing).toEqual(['proxy.sock']);
    expect(egressEntries(host)).toEqual([]);
  });

  test('setup failure, a unit that refuses, and a socket that will not connect leave no egress dir', async () => {
    // setup throws
    const a = await standIn();
    await held(SLUG, () => drain(spawnAgentProcess(turnStart(), async () => Promise.reject(new Error('driver setup failed')), a.policy)), 'turn');
    expect({ path: 'setup', left: egressEntries(a), connects: a.standIn.connects.length }).toEqual({ path: 'setup', left: [], connects: 0 });
    // the unit refuses AFTER the gate opened (no hello)
    const b = await standIn();
    b.standIn.script = () => ({ kind: 'refuse' });
    const refused = await held(SLUG, () => drain(spawnAgentProcess(turnStart({ mcpUpstream: upstream }), plan(), b.policy)), 'turn');
    expect(refused.some(event => event.type === 'error' && event.message.includes('confinement refused'))).toBe(true);
    expect(b.gateEvents.some(event => event.startsWith('serve '))).toBe(true);
    expect({ path: 'refusal', left: egressEntries(b) }).toEqual({ path: 'refusal', left: [] });
    // the socket refuses the connection
    const c = await standIn([[SLUG, 1]], {
      hostOverrides: { connect: () => Promise.reject(new Error('ECONNREFUSED')) },
    });
    const failed = await held(SLUG, () => drain(spawnAgentProcess(turnStart(), plan(), c.policy)), 'turn');
    expect(failed.some(event => event.type === 'error' && event.message.includes('refused the connection'))).toBe(true);
    expect({ path: 'connect', left: egressEntries(c) }).toEqual({ path: 'connect', left: [] });
  });

  test('an interrupt that lands WHILE the gate opens starts nothing, and leaves no door behind', async () => {
    // The window: an interrupt read only before confineTurn, whose gate is several awaits,
    // found no child — and the whole turn then ran. The run is opened with the interrupt's
    // signal, asked before the connect and again before the spec is sent.
    let release: () => void = () => {};
    const latch = new Promise<void>(resolve => {
      release = resolve;
    });
    let entered: () => void = () => {};
    const inGate = new Promise<void>(resolve => {
      entered = resolve;
    });
    const host = await standIn();
    const policy = withPolicy(host, {
      egressSeams: {
        beforeServe: async () => {
          entered();
          await latch;
        },
      },
    });
    const events = await held(
      SLUG,
      async () => {
        const proc = spawnAgentProcess(turnStart({ env: { SECRET: 'turn-secret' } }), plan(), policy);
        await inGate;
        const interrupted = proc.interrupt();
        release();
        const seen = await drain(proc);
        await interrupted;
        return seen;
      },
      'turn',
    );
    expect(events.some(event => event.type === 'error' && event.message.includes('interrupted before start'))).toBe(true);
    expect(events.some(event => event.type === 'result')).toBe(false);
    // Nothing was handed to PID 1, and what confineTurn opened is gone.
    expect({ connects: host.standIn.connects, specs: host.standIn.specs.length }).toEqual({ connects: [], specs: 0 });
    expect(egressEntries(host)).toEqual([]);
  });

  test('a gate that FAILS to close still ends the turn: the stream terminates and the driver cleanup runs', async () => {
    // The failure, made real rather than stubbed: while the unit "runs", the site's egress
    // directory is made unwritable, so the gate's own `rm` of its sockets is EACCES and close()
    // rejects. The turn's teardown must not ride on that one step: a throw there skipped the
    // driver's cleanup and `queue.close()`, and the session sat in 'running' forever.
    const host = await standIn();
    const egressParent = join(host.agentSocketDir, 'egress', 's1');
    host.standIn.script = () => {
      chmodSync(egressParent, 0o500);
      return { kind: 'exit', code: 0 };
    };
    let driverCleanups = 0;
    let outcome: { ended: boolean; events: AgentEvent[] };
    let leftBehind: string[];
    try {
      outcome = await held(
        SLUG,
        () =>
          Promise.race([
            drain(
              spawnAgentProcess(
                turnStart({ mcpUpstream: upstream }),
                async () => ({
                  argv: ['/opt/claude'],
                  parseLine: () => [],
                  cleanup: async () => {
                    driverCleanups++;
                  },
                }),
                host.policy,
              ),
            ).then(events => ({ ended: true, events })),
            Bun.sleep(10_000).then(() => ({ ended: false, events: [] as AgentEvent[] })),
          ]),
        'turn',
      );
      // The control: the close really failed — the run's sockets are still there.
      leftBehind = existsSync(egressParent) ? readdirSync(egressParent) : [];
    } finally {
      // Back to root's provisioned mode, so the scratch sweep can remove what the close left.
      if (existsSync(egressParent)) chmodSync(egressParent, 0o770);
    }
    expect({ ended: outcome.ended, driverCleanups, closeFailed: leftBehind.length > 0 }).toEqual({
      ended: true,
      driverCleanups: 1,
      closeFailed: true,
    });
    expect(outcome.events.some(event => event.type === 'result')).toBe(true);
    // The failure is a line in the session's own log, not a silence.
    expect(outcome.events.some(event => event.type === 'text' && event.text.includes('[egress]'))).toBe(true);
  });

  test('a refusal after the gate opened is reported AS itself, even when the gate then fails to close', async () => {
    // confineTurn's own catch: `await gate.close()` rejecting replaced the refusal the operator
    // must read (here: a unit that never said hello) with the unlink error of the teardown.
    const host = await standIn();
    const egressParent = join(host.agentSocketDir, 'egress', 's1');
    // Unwritable once the gate is up (its sockets made), so the teardown's unlink is EACCES.
    host.standIn.script = () => {
      chmodSync(egressParent, 0o500);
      return { kind: 'refuse' };
    };
    const policy = host.policy;
    let events: AgentEvent[];
    let leftBehind: string[];
    try {
      events = await held(SLUG, () => drain(spawnAgentProcess(turnStart(), plan(), policy)), 'turn');
      leftBehind = existsSync(egressParent) ? readdirSync(egressParent) : [];
    } finally {
      if (existsSync(egressParent)) chmodSync(egressParent, 0o770);
    }
    const refusal = events.find(event => event.type === 'error');
    const message = refusal?.type === 'error' ? refusal.message : '';
    expect({ closeFailed: leftBehind.length > 0, itself: /never said hello/.test(message) }).toEqual({
      closeFailed: true,
      itself: true,
    });
  });

  test('a build door whose gate FAILS to close still returns its own result, with an [egress] line in its log', async () => {
    // runConfined's `finally`: `await child.cleanup()` rejecting replaced the run's result (a
    // finished build) with the unlink error of the teardown.
    const host = await standIn();
    const egressParent = join(host.agentSocketDir, 'egress', 's1');
    host.standIn.script = () => {
      chmodSync(egressParent, 0o500);
      return { kind: 'exit', code: 0 };
    };
    const log: string[] = [];
    let outcome: { result: Awaited<ReturnType<typeof runConfined>> | null; error: unknown };
    let leftBehind: string[];
    try {
      outcome = await held(SLUG, () =>
        runConfined(
          {
            door: 'build',
            slug: SLUG,
            argv: ['bun', 'run', 'build'],
            cwd: workspacePath(SLUG),
            env: {},
            timeoutMs: 5_000,
            onStdout: chunk => log.push(chunk),
          },
          host.policy,
        ).then(
          result => ({ result, error: null }),
          error => ({ result: null, error }),
        ),
      );
      leftBehind = existsSync(egressParent) ? readdirSync(egressParent) : [];
    } finally {
      if (existsSync(egressParent)) chmodSync(egressParent, 0o770);
    }
    expect({
      closeFailed: leftBehind.length > 0,
      rejected: outcome.error !== null ? String(outcome.error) : null,
      exitCode: outcome.result?.exitCode,
    }).toEqual({ closeFailed: true, rejected: null, exitCode: 0 });
    expect(log.some(line => line.includes("[egress] this run's egress gate did not close cleanly"))).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * The trust the unit's first exec rests on, and the host facts it is asked of
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('what the unit executes first is trusted by WHO CAN CHANGE IT, not by who owns it', () => {
  test('the daemon states its REAL host facts: /run, id(1), /proc/self/ns/net — and a control plane that cannot start', async () => {
    const policy = policyFromConfig();
    expect(policy.host.runtimePrefix).toBe(RUNTIME_PREFIX);
    expect(RUNTIME_PREFIX).toBe('/run');
    expect(policy.host.resolveAgent).toBe(resolveAgentIdentity);
    expect(policy.host.readNetns).toBe(readHostNetns);
    expect(policy.egressSeams).toBeUndefined();
    // The resolver is real: this process's own user resolves to its own uid.
    const me = (await resolveAgentIdentity(String(process.env.USER ?? '')));
    if (process.env.USER && typeof process.getuid === 'function') expect(me?.uid).toBe(process.getuid());
    expect((await resolveAgentIdentity('no-such-user-dedalo-sb-test'))).toBeNull();
    // THE CONTROL PLANE: show, list-units and stop — a `start` never reaches the binary.
    for (const verb of ['start', 'restart', 'enable', 'kill']) {
      await expect(hostFacts('/usr/bin/false').systemctl([verb, 'x.service'])).rejects.toThrow(/not a verb the daemon may send/);
    }
  });

  /** A policy whose stat(2) lies about `overrides` paths (by suffix) — a chown a test cannot do. */
  function statPolicy(
    host: GatePolicy,
    overrides: Record<string, Partial<{ uid: number; gid: number; mode: number }>>,
    resolveAgent?: (name: string) => unknown,
  ): ConfinementPolicy {
    const base = host.policy.host;
    return withPolicy(host, {
      host: {
        ...base,
        ...(resolveAgent ? { resolveAgent } : {}),
        stat: (path: string) => {
          const real = base.stat(path);
          const hit = Object.entries(overrides).find(([suffix]) => path === suffix || path.endsWith(suffix));
          return hit ? { ...real, ...hit[1] } : real;
        },
      },
    });
  }
  const shimReal = () => realpathSync(SHIM_PATH);
  const IDENTITY = GATE_IDS.identityUid(1);

  test('a shim owned by a THIRD uid (the engine’s, which owns the checkout) is accepted', async () => {
    const host = await standIn();
    const third = statPolicy(host, { [shimReal()]: { uid: 4242, mode: 0o100644 } });
    expect((await confinementProblems(third, 'git'))).toEqual([]);
    expect((await confinementProblems(third, 'turn', 'claude_code'))).toEqual([]);
  });

  test('a shim owned by a site identity is a named refusal', async () => {
    const host = await standIn();
    const owned = statPolicy(host, { [shimReal()]: { uid: IDENTITY } });
    expect((await confinementProblems(owned, 'git')).join(' ')).toContain(`is owned by the site identity 'dedalo-a-test_1' (uid ${IDENTITY})`);
  });

  test('a shim an identity cannot READ, or a runtime it cannot EXECUTE, is refused — every run would fail at exec', async () => {
    const host = await standIn();
    const unreadable = statPolicy(host, { [shimReal()]: { uid: 4242, gid: 4242, mode: 0o100640 } });
    expect((await confinementProblems(unreadable, 'git')).join(' ')).toContain('cannot be read by the site identity');
    // …through its GROUP it can: the instance group every identity has as its primary.
    const viaGroup = statPolicy(host, { [shimReal()]: { uid: 4242, gid: GATE_IDS.instanceGid, mode: 0o100640 } });
    expect((await confinementProblems(viaGroup, 'git'))).toEqual([]);
    const noExec = statPolicy(host, { [realpathSync(process.execPath)]: { uid: 4242, gid: 4242, mode: 0o100750 } });
    expect((await confinementProblems(noExec, 'git')).join(' ')).toContain('cannot be executed by the site identity');
  });

  test('a directory above the shim an identity can WRITE or OWNS is refused (it could rename over it); a sticky one it does not own is not', async () => {
    const host = await standIn();
    const parent = dirname(shimReal());
    const refusedBy = async (overrides: Record<string, Partial<{ uid: number; gid: number; mode: number }>>) =>
      (await confinementProblems(statPolicy(host, overrides), 'git')).join(' ');
    expect(await refusedBy({ [parent]: { uid: IDENTITY, mode: 0o40755 } })).toContain('which the site identity');
    expect(await refusedBy({ [parent]: { uid: 4242, mode: 0o40777 } })).toContain('which the site identity');
    expect(await refusedBy({ [parent]: { uid: 4242, mode: 0o41777 } })).toBe('');
    // …unless the IDENTITY owns the sticky directory: the owner of a sticky directory may
    // rename anything inside it, so the exemption is only for a directory it does not own.
    expect(await refusedBy({ [parent]: { uid: IDENTITY, mode: 0o41777 } })).toContain('which the site identity');
    // An identity-owned directory whose mode reads 0555 TODAY is still its own: one chmod
    // from writable. Ownership, not the current bits, decides.
    expect(await refusedBy({ [parent]: { uid: IDENTITY, mode: 0o40555 } })).toContain('which the site identity');
    // The same rule one level further up.
    expect(await refusedBy({ [dirname(parent)]: { uid: IDENTITY, mode: 0o40555 } })).toContain('which the site identity');
  });

  test('a site identity this host does not have is a named refusal', async () => {
    const host = await standIn();
    const problems = (await confinementProblems(statPolicy(host, {}, () => null), 'git'));
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain('does not exist on this host');
  });
});

describe('a runtime directory outside /run is refused — the mask is what hides every site’s gate sockets', () => {
  test('a LISTEN_SOCKET under /srv is refused for every door', async () => {
    // The hand-configured host: /srv is visible (read-only) under ProtectSystem=strict and a
    // connect() needs no writable mount, so the daemon's socket and EVERY site's
    // egress/s<k>/mcp.sock would be one path away from a git hook (DAC aside).
    const host = await standIn();
    const srv = withPolicy(host, {
      listenSocket: '/srv/sb/state/daemon.sock',
      agentSocketDir: '/run/dedalo-sites-agents/test',
      host: { ...host.policy.host, runtimePrefix: RUNTIME_PREFIX },
    });
    for (const door of ['turn', 'build', 'git'] as const) {
      const problems = (await confinementProblems(srv, door, 'claude_code'));
      expect({ door, count: problems.length }).toEqual({ door, count: 1 });
      expect({ door, names: problems[0]?.includes('LISTEN_SOCKET') && problems[0]?.includes('/run') }).toEqual({ door, names: true });
    }
  });

  test('an AGENT_SOCKET_DIR under /srv is refused for every door — it holds every site’s egress gates', async () => {
    const host = await standIn();
    const srv = withPolicy(host, {
      listenSocket: '/run/dedalo-sites/test/daemon.sock',
      agentSocketDir: '/srv/sb/agents',
      host: { ...host.policy.host, runtimePrefix: RUNTIME_PREFIX },
    });
    for (const door of ['turn', 'build', 'git'] as const) {
      const problems = (await confinementProblems(srv, door, 'claude_code'));
      expect({ door, count: problems.length, names: problems[0]?.includes('AGENT_SOCKET_DIR') && problems[0]?.includes('/run') }).toEqual({
        door,
        count: 1,
        names: true,
      });
    }
  });

  test('an egress directory systemd cannot bind is refused UP FRONT — nothing opened, nothing connected', async () => {
    const host = await standIn();
    const colon = join(dirname(host.agentSocketDir), 'age:nts');
    mkdirSync(colon, { recursive: true });
    const policy = withPolicy(host, { agentSocketDir: colon });
    expect((await confinementProblems(policy, 'turn', 'claude_code')).join(' ')).toContain('BindPaths= grammar');
    await expect(runDoor(host, 'turn', {}, policy)).rejects.toBeInstanceOf(ConfinementUnavailableError);
    expect(existsSync(join(colon, 'egress'))).toBe(false);
    expect(host.standIn.connects).toEqual([]);
  });

  test('a namespace read that fails INSIDE confineTurn (after the up-front check passed) opens no gate and connects nothing', async () => {
    // M58: the namespace read moved after the gate opened stayed green, because every
    // failing-read row was refused by (await confinementProblems()) first. Here the up-front read
    // succeeds and confineTurn's own fails.
    const host = await standIn();
    let reads = 0;
    const policy = withPolicy(host, {
      host: {
        ...host.policy.host,
        readNetns: () => {
          reads += 1;
          if (reads >= 2) throw new Error('EACCES: /proc/self/ns/net');
          return TEST_NETNS;
        },
      },
    });
    await expect(runDoor(host, 'turn', { driver: 'claude_code' }, policy)).rejects.toBeInstanceOf(ConfinementUnavailableError);
    expect(reads).toBe(2);
    expect(host.gateEvents).toEqual([]);
    expect(egressEntries(host)).toEqual([]);
    expect(host.standIn.connects).toEqual([]);
  });

  test('a daemon that cannot read its own namespace identity is a named refusal', async () => {
    const host = await standIn();
    const blind = withPolicy(host, {
      host: {
        ...host.policy.host,
        readNetns: () => {
          throw new Error('ENOENT: /proc/self/ns/net');
        },
      },
    });
    const problems = (await confinementProblems(blind, 'git'));
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain('/proc/self/ns/net');
    await expect(runDoor(host, 'git', {}, blind)).rejects.toBeInstanceOf(ConfinementUnavailableError);
    expect(host.standIn.connects).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * The plan takes effect at the gate the run is given
 * ──────────────────────────────────────────────────────────────────────────────────── */

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
    try {
      for (const row of rows) {
        const host = await standIn();
        host.standIn.script = () => ({ kind: 'hang' });
        const policy = withPolicy(host, {
          egressSeams,
          egressFacts: { driver: 'claude_code', providerHosts: [...row.providers], registryHosts: ['registry.npmjs.org'] },
        });
        const statuses = await held(SLUG, async () => {
          const child = await confineTurn(
            { door: row.door, slug: SLUG, driver: row.driver, argv: ['/opt/x'], cwd: workspacePath(SLUG), env: {}, timeoutMs: 5_000 },
            policy,
          );
          const done = drainChild(child);
          try {
            const out: Record<string, number> = {};
            for (const target of PROBE_HOSTS) {
              out[target] = await connectThrough(join(host.agentSocketDir, 'egress', 's1', 'proxy.sock'), `${target}:443`);
            }
            return out;
          } finally {
            host.standIn.release();
            await done;
          }
        });
        for (const target of PROBE_HOSTS) {
          const want = (row.reach as readonly string[]).includes(target) ? 200 : 403;
          expect({ door: row.door, driver: row.driver, target, status: statuses[target] }).toEqual({
            door: row.door,
            driver: row.driver,
            target,
            status: want,
          });
        }
      }
    } finally {
      await new Promise<void>(resolve => echo.close(() => resolve()));
    }
  });

  test('the SUPERVISOR hands confineTurn the run’s own driver: an opencode turn on a claude_code host is judged on its own plan', async () => {
    // PR1: `driver: opts.driver` dropped from process.ts gave an opencode turn the
    // api.anthropic.com plan and started it; with it, the empty provider list refuses.
    const host = await standIn();
    const refused = await held(SLUG, () => drain(spawnAgentProcess(turnStart({ driver: 'opencode' }), plan(['/opt/opencode']), host.policy)), 'turn');
    const error = refused.find(event => event.type === 'error');
    expect(error?.type === 'error' && error.message).toContain('AGENT_PROVIDER_HOSTS');
    expect(host.standIn.connects).toEqual([]);
    // Control: the same host runs a claude_code turn.
    const ran = await held(SLUG, () => drain(spawnAgentProcess(turnStart(), plan(), host.policy)), 'turn');
    expect(ran.some(event => event.type === 'result')).toBe(true);
    expect(host.standIn.specs.map(({ door }) => door)).toEqual(['turn']);
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
  /** Every spec was the git door's, ran git, and carried no proxy. */
  function assertGitDoor(host: GatePolicy, specs: GatePolicy['standIn']['specs']): void {
    expect(specs.length).toBeGreaterThan(0);
    for (const { door, spec } of specs) {
      const command = (spec.argv as string[]).join(' ');
      expect({ command, door, ran: spec.argv[0] }).toEqual({ command, door: 'git', ran: 'git' });
      expect({ command, proxy: Object.keys(spec.env).filter(key => /proxy/i.test(key)) }).toEqual({ command, proxy: [] });
    }
  }

  test('git.ts: changedFiles, excludeDaemonState and commitAll state the git door on every command', async () => {
    // GI1: git's door changed to 'build' gave every git command a proxy socket and the
    // registry plan, and nothing reddened.
    await makeSite('door-git');
    const host = await standIn([['door-git', 1]]);
    await changedFiles('door-git', host.policy);
    await excludeDaemonState('door-git', host.policy);
    await commitAll('door-git', 'door check', host.policy);
    // status; rm --cached; (commitAll:) rm --cached, add -A, diff --cached — at least five.
    expect(host.standIn.specs.length).toBeGreaterThanOrEqual(5);
    assertGitDoor(host, host.standIn.specs);
    // …and no git command was served a gate: git reaches nothing at all.
    expect(host.gateEvents).toEqual([]);
    expect(new Set(host.standIn.connects)).toEqual(new Set([socketPathFor(host.agentSocketDir, 1, 'git')]));
    // git takes the site for itself when no caller holds it, and gives it back.
    expect(busyReason('door-git')).toBeNull();
  });

  test('builder.ts: every build step states the build door — its gate holds proxy.sock and serves the registry', async () => {
    // BD1/BD2: the builder's door changed and nothing reddened.
    await makeSite('door-build');
    const manifest = await readManifest('door-build');
    manifest.build = { install: 'true', build: 'true', output: 'src' };
    await writeManifest(manifest);
    const host = await standIn([['door-build', 1]]);
    host.standIn.script = (_k, door) => (door === 'build' ? { kind: 'hang' } : { kind: 'exit', code: 0 });
    const policy = withPolicy(host, { egressSeams: REFUSING_DIAL });
    const { build_id } = await startBuild('door-build', policy);
    const seen: Array<{ listing: string[]; probe: Record<string, string> }> = [];
    for (let step = 1; step <= 2; step++) {
      await waitUntil(() => host.standIn.specs.filter(({ door }) => door === 'build').length === step, 8_000, `build step ${step}`);
      seen.push({ listing: readdirSync(join(host.agentSocketDir, 'egress', 's1')).sort(), probe: await probeGate(host) });
      host.standIn.release();
    }
    for (let waited = 0; ; waited += 20) {
      const record = await getBuild('door-build', build_id);
      if (record && record.outcome !== 'running') break;
      if (waited > 8_000) throw new Error('build never finished');
      await Bun.sleep(20);
    }
    const steps = host.standIn.specs.filter(({ door }) => door === 'build');
    expect(steps.length).toBe(2);
    for (const { spec } of steps) {
      expect(spec.env.HTTPS_PROXY).toBe(`http://127.0.0.1:${PROXY_PORT}`);
      expect(JSON.stringify(spec.argv)).toContain('true');
    }
    for (const { listing, probe } of seen) {
      expect(listing).toEqual(['proxy.sock']);
      // …and the gate it was served tunnels to the BUILD plan (the registry) and nothing else.
      expect(probe).toEqual({
        'api.anthropic.com': '403',
        'registry.npmjs.org': '502',
        'api.provider.example': '403',
        'evil.example.com': '403',
      });
    }
  });

  test('startSession / sendMessage: an opencode site with no provider host is a 503 BEFORE any reservation', async () => {
    // MG4–MG6: the manager's driver-specific checks were never exercised.
    await makeSite('door-oc');
    // The site's driver is the DAEMON's record (sites/driver_record.ts), never site.json.
    const { writeSiteDriver } = await import('../src/sites/driver_record');
    await writeSiteDriver('door-oc', 'opencode');
    const host = await standIn([['door-oc', 1]]); // claude_code default, providerHosts []
    let refused: unknown = null;
    try {
      await sessionManager.startSession('door-oc', 'hello', undefined, host.policy);
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
    await expect(sessionManager.sendMessage(sessionId, 'again', host.policy)).rejects.toThrow(/AGENT_PROVIDER_HOSTS/);
    expect(busyReason('door-oc')).toBeNull();
    expect(host.standIn.connects).toEqual([]);
  });

  test('startSession: a claude_code site on an opencode-DEFAULT host with no provider list is accepted, and its git runs through the git door', async () => {
    // The S3 this closes: the driver-less courtesy check judged the INSTANCE default's plan, so
    // every claude_code site on such a host was refused for a provider list it does not use.
    await makeSite('door-cc');
    const host = await standIn([['door-cc', 1]]);
    host.standIn.script = (_k, door) => (door === 'turn' ? { kind: 'hang' } : { kind: 'exit', code: 0 });
    const policy = withPolicy(host, {
      egressFacts: { driver: 'opencode', providerHosts: [], registryHosts: ['registry.npmjs.org'] },
      egressSeams: REFUSING_DIAL,
    });
    // The driver hands its options to the REAL supervisor with NO seam of its own — exactly
    // what claude_code.ts does — so the only policy the turn can run under is the one the
    // manager put in `opts.confinement`.
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
    await waitUntil(() => host.standIn.specs.some(({ door }) => door === 'turn'), 8_000, 'the turn to reach its unit');
    const listing = readdirSync(join(host.agentSocketDir, 'egress', 's1')).sort();
    const probe = await probeGate(host);
    host.standIn.release();
    for (let waited = 0; sessionManager.getSessionState('door-cc').state === 'running'; waited += 20) {
      if (waited > 8_000) throw new Error('turn never finished');
      await Bun.sleep(20);
    }
    expect(handed.length).toBe(1);
    expect(handed[0] === policy).toBe(true);

    // THE TURN ran as an instance of THIS site's turn unit, served the claude_code plan.
    const turns = host.standIn.specs.filter(({ door }) => door === 'turn');
    expect(turns.map(({ spec }) => spec.argv)).toEqual([['/opt/claude']]);
    expect(listing).toEqual(['mcp.sock', 'proxy.sock']);
    expect(probe).toEqual({
      'api.anthropic.com': '502',
      'registry.npmjs.org': '403',
      'api.provider.example': '403',
      'evil.example.com': '403',
    });
    // The turn's own git (changedFiles, commitAll) ran under that SAME policy — every command
    // through the git door — and the specific commands are there, not just "some git ran".
    const gits = host.standIn.specs.filter(({ door }) => door !== 'turn');
    assertGitDoor(host, gits);
    const ran = gits.map(({ spec }) => (spec.argv as string[]).join(' '));
    for (const command of ['git status --porcelain', 'git add -A', 'git diff --cached --quiet']) {
      expect({ command, ran: ran.includes(command) }).toEqual({ command, ran: true });
    }
  });

  test('startBuild: a registry plan the BUILD door cannot use is a 503 BEFORE the reservation', async () => {
    // M19: the pre-reservation check asked about the 'turn' door, whose plan does not read
    // BUILD_REGISTRY_HOSTS — so a bad registry was caught only inside runConfined.
    await makeSite('door-reg');
    const manifest = await readManifest('door-reg');
    manifest.build = { install: 'true', build: 'true', output: 'src' };
    await writeManifest(manifest);
    const host = await standIn([['door-reg', 1]]);
    const policy = withPolicy(host, { egressFacts: { driver: 'claude_code', providerHosts: [], registryHosts: ['10.0.0.5'] } });
    // Control: the TURN plan of this same policy is sound — the refusal is the build door's.
    expect((await confinementProblems(policy, 'turn', 'claude_code'))).toEqual([]);
    let refused: unknown = null;
    try {
      await startBuild('door-reg', policy);
    } catch (error) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(ConfinementUnavailableError);
    expect((refused as ConfinementUnavailableError).status).toBe(503);
    expect(String((refused as Error).message)).toContain('BUILD_REGISTRY_HOSTS');
    expect(busyReason('door-reg')).toBeNull();
    expect(await latestBuild('door-reg')).toBeNull();
    expect(host.standIn.connects).toEqual([]);
  });
});

/* ──────────────────────────────────────────────────────────────────────────────────
 * A FIFO WHERE THE DAEMON WRITES — refused at once, never an open parked forever.
 *
 * `writeThroughHandle` opened `O_WRONLY|O_CREAT|O_NOFOLLOW` and asked its questions AFTER the
 * open returned. A fifo at the name parks a blocking write-open until a reader comes — forever,
 * in a Bun fs worker the turn's deadline never returns — so a build's `mkfifo site.json.tmp`
 * hung the daemon's next manifest write, and a fifo at `.builder/mcp.json` (in a `.builder` the
 * agent renamed away and re-made) hung every turn's setup; repeated, the pool starves every
 * other site's fs. The read direction was closed in round 4 (`readFileSharedBounded`); this is
 * the write direction: `O_NONBLOCK` (ENXIO with no reader) + regular-file-only, before any
 * question that could write.
 * ────────────────────────────────────────────────────────────────────────────────── */

describe('a FIFO where the daemon writes is refused at once, typed — never a parked open', () => {
  /** Run `attempt`; if it is still parked after 3 s, release it (open the read end) so the suite can exit. */
  async function refusedPromptly(
    fifo: string,
    attempt: () => Promise<unknown>,
    releaseWith: 'reader' | 'writer' = 'reader',
  ): Promise<{ outcome: unknown; ms: number }> {
    const { closeSync, constants, openSync } = await import('node:fs');
    const started = Date.now();
    const outcome = await Promise.race([
      attempt().then(
        () => 'written',
        (error: unknown) => error,
      ),
      Bun.sleep(3_000).then(() => 'parked'),
    ]);
    if (outcome === 'parked') {
      try {
        closeSync(openSync(fifo, (releaseWith === 'reader' ? constants.O_RDONLY : constants.O_WRONLY) | constants.O_NONBLOCK));
      } catch {
        // already released
      }
    }
    return { outcome, ms: Date.now() - started };
  }

  function fifoAt(path: string): void {
    expect(Bun.spawnSync(['mkfifo', path]).exitCode).toBe(0);
  }

  test('site.json.tmp planted as a fifo: the manifest write is refused, nothing parked', async () => {
    const { NotRegularFileError } = await import('../src/util/shared_tree');
    const dir = mkdtempSync(join(tmpdir(), 'dedalo-fifo-'));
    scratch.push(dir);
    await mkdirShared(dir, 'ws');
    fifoAt(join(dir, 'ws', 'site.json.tmp'));
    const { outcome, ms } = await refusedPromptly(join(dir, 'ws', 'site.json.tmp'), () =>
      writeFileSharedAtomic(dir, join('ws', 'site.json'), '{"name":"x"}'),
    );
    expect({ refused: outcome instanceof NotRegularFileError, prompt: ms < 2_000 }).toEqual({ refused: true, prompt: true });
    expect(existsSync(join(dir, 'ws', 'site.json'))).toBe(false);
  }, 15_000);

  test('.builder/mcp.json planted as a fifo in an agent-made .builder: the turn setup is refused, nothing parked', async () => {
    const { NotRegularFileError } = await import('../src/util/shared_tree');
    const slug = 'zzfifo-mcp';
    const ws = join(roots.sitesRoot, slug);
    rmSync(ws, { recursive: true, force: true });
    scratch.push(ws);
    await mkdirShared(roots.sitesRoot, slug);
    // The agent renamed the daemon's `.builder` away and made its own (same-parent rename).
    mkdirSync(join(ws, '.builder'));
    fifoAt(join(ws, '.builder', 'mcp.json'));
    const opts = {
      slug,
      workspace: ws,
      prompt: 'x',
      mcp: { name: 'dedalo_publication', url: 'http://127.0.0.1:9/mcp' },
      env: {},
      timeoutMs: 1_000,
    } as unknown as Parameters<typeof writeMcpConfig>[0];
    const { outcome, ms } = await refusedPromptly(join(ws, '.builder', 'mcp.json'), () => writeMcpConfig(opts));
    expect({ refused: outcome instanceof NotRegularFileError, prompt: ms < 2_000 }).toEqual({ refused: true, prompt: true });
  }, 15_000);

  test('the daemon’s private writer and appender refuse a fifo too (session meta, build log)', async () => {
    const { NotRegularFileError } = await import('../src/util/shared_tree');
    const dir = mkdtempSync(join(tmpdir(), 'dedalo-fifo-'));
    scratch.push(dir);
    await mkdirPrivate(dir, 'state');
    fifoAt(join(dir, 'state', 'meta.json'));
    fifoAt(join(dir, 'state', 'build.log'));
    for (const [name, attempt] of [
      ['meta.json', () => writeFilePrivate(dir, join('state', 'meta.json'), '{}')],
      ['build.log', () => appendFilePrivate(dir, join('state', 'build.log'), 'line\n')],
    ] as const) {
      const { outcome, ms } = await refusedPromptly(join(dir, 'state', name), attempt);
      expect({ name, refused: outcome instanceof NotRegularFileError, prompt: ms < 2_000 }).toEqual({ name, refused: true, prompt: true });
    }
  }, 20_000);

  test('the READ twin: readFileShared / readFilePrivate refuse a fifo at once (site.json, a session meta) — never a parked open', async () => {
    const { NotRegularFileError } = await import('../src/util/shared_tree');
    const dir = mkdtempSync(join(tmpdir(), 'dedalo-fifo-'));
    scratch.push(dir);
    await mkdirShared(dir, 'ws');
    await mkdirPrivate(dir, 'state');
    fifoAt(join(dir, 'ws', 'site.json'));
    fifoAt(join(dir, 'state', 'meta.json'));
    for (const [name, attempt] of [
      [join('ws', 'site.json'), () => readFileShared(dir, join('ws', 'site.json'))],
      [join('state', 'meta.json'), () => readFilePrivate(dir, join('state', 'meta.json'))],
    ] as const) {
      const { outcome, ms } = await refusedPromptly(join(dir, name), attempt, 'writer');
      expect({ name, refused: outcome instanceof NotRegularFileError, prompt: ms < 2_000 }).toEqual({ name, refused: true, prompt: true });
    }
  }, 20_000);

  test('a fifo WITH a reader (the agent holds the other end) is refused by fstat — nothing written through it', async () => {
    const { NotRegularFileError } = await import('../src/util/shared_tree');
    const { closeSync, constants, openSync, readSync } = await import('node:fs');
    const dir = mkdtempSync(join(tmpdir(), 'dedalo-fifo-'));
    scratch.push(dir);
    await mkdirShared(dir, 'ws');
    const fifo = join(dir, 'ws', 'site.json.tmp');
    fifoAt(fifo);
    const reader = openSync(fifo, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      const { outcome, ms } = await refusedPromptly(fifo, () => writeFileSharedAtomic(dir, join('ws', 'site.json'), '{"secret":"x"}'));
      const buffer = Buffer.alloc(64);
      let got = 0;
      try {
        got = readSync(reader, buffer, 0, 64, null);
      } catch {
        got = 0; // EAGAIN: nothing was written
      }
      expect({ refused: outcome instanceof NotRegularFileError, prompt: ms < 2_000, leaked: got }).toEqual({ refused: true, prompt: true, leaked: 0 });
    } finally {
      closeSync(reader);
    }
  }, 15_000);
});
