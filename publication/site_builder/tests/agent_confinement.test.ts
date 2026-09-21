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
 *   2. THE EGRESS. `IPAddressAllow=any` with loopback and every private range denied — the
 *      model provider stays reachable, the engine and the databases do not.
 *   3. THE CAPS. MemoryMax, CPUQuota, TasksMax and a RuntimeMaxSec PID 1 enforces.
 *   4. THE REFUSAL. A host that cannot do any of it starts nothing, and says which part is
 *      missing. Where `none` is DECLARED, every turn announces itself into the session's own
 *      durable log — the one shape of unconfined run this daemon permits, and never a
 *      silent fallback.
 *
 * Plus the per-turn credential residence: the MCP config a driver writes is 0640 and is
 * DELETED when the turn ends, on every exit path.
 */

import { describe, test, expect, afterEach } from 'bun:test';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
import { roots } from './fixtures/instance';
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
  EGRESS_DENY,
  confineTurn,
  runConfined,
  confinementProblems,
  assertTurnConfinementAvailable,
  egressAllow,
  policyFromConfig,
  renderEnvironmentFile,
  type ConfinementPolicy,
} from '../src/drivers/confinement';
import { spawnAgentProcess } from '../src/drivers/process';
import { ALLOWED_TOOLS, DENIED_TOOLS, writeMcpConfig } from '../src/drivers/claude_code';
import { DENIED_PERMISSIONS, writeMcpConfig as writeOpencodeConfig } from '../src/drivers/opencode';
import { piDriver } from '../src/drivers/pi';
import { excludeDaemonState } from '../src/sites/git';
import {
  appendEvent,
  listSessions,
  readMeta,
  replayEvents,
  writeMeta,
} from '../src/sessions/store';
import { getBuild, getBuildLog, latestBuild } from '../src/build/builder';
import { readManifest } from '../src/sites/manifest';
import { ConfinementUnavailableError } from '../src/errors';
import type { AgentEvent } from '../src/drivers/types';

const scratch: string[] = [];

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
function systemdPolicy(overrides: Partial<ConfinementPolicy> = {}): ConfinementPolicy {
  const dir = mkdtempSync(join(tmpdir(), 'dedalo-confinement-'));
  scratch.push(dir);
  const runner = join(dir, 'systemd-run');
  writeFileSync(runner, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  return {
    mode: 'systemd_scope',
    agentUser: 'dedalo-agent-test',
    unitPrefix: 'dedalo-site-test-agent-',
    systemdRunBin: runner,
    listenSocket: join(dir, 'run', 'daemon.sock'),
    listenKind: 'unix',
    agentHome: join(dir, 'home'),
    publicationApiUrl: 'http://127.0.0.1:8080/publication/server_api/v2',
    egressAllow: '',
    memoryMax: '2G',
    cpuQuota: '200%',
    tasksMax: 512,
    ...overrides,
  };
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
      { argv: ['/opt/claude', '-p', 'build a page'], cwd: '/srv/ws/site-a', env: {}, timeoutMs: 60_000 },
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

      // The driver's own command is still there, after the `--` separator and nowhere else.
      expect(turn.argv.slice(turn.argv.indexOf('--') + 1)).toEqual(['/opt/claude', '-p', 'build a page']);
      // Two turns are two units: a fixed name would make a second turn collide with the
      // first and (with --collect) tear it down.
      const second = await confineTurn(
        { argv: ['/opt/claude'], cwd: '/srv/ws/site-a', env: {}, timeoutMs: 60_000 },
        policy,
      );
      expect(second.unitName).not.toBe(turn.unitName);
      await second.cleanup();
    } finally {
      await turn.cleanup();
    }
  });

  test('the egress policy allows the public internet and DENIES the host and the LAN', async () => {
    const policy = systemdPolicy();
    const turn = await confineTurn(
      { argv: ['/opt/claude'], cwd: '/srv/ws/site-a', env: {}, timeoutMs: 60_000 },
      policy,
    );
    try {
      const deny = (property(turn.argv, 'IPAddressDeny') ?? '').split(' ');
      // The four that carry the disclosure: loopback (the engine, the databases, the other
      // museums' sockets), the three RFC1918 blocks (the museum's LAN) and the link-local
      // block (a cloud host's unauthenticated metadata service).
      for (const denied of ['localhost', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16']) {
        expect({ denied, present: deny.includes(denied) }).toEqual({ denied, present: true });
      }
      expect(deny.sort()).toEqual([...EGRESS_DENY].sort());

      const allow = (property(turn.argv, 'IPAddressAllow') ?? '').split(' ');
      // `any` is deliberate and is not a hole: the deny list above wins on every prefix it
      // names (systemd matches longest-prefix), and the model provider the agent exists to
      // call cannot be enumerated.
      expect(allow).toContain('any');
      // …and the ONE local destination that must survive the deny: this museum's Publication
      // API, derived from its URL rather than typed.
      expect(allow).toContain('localhost');
      expect(turn.argv).toContain('--property=RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6');
    } finally {
      await turn.cleanup();
    }
  });

  test('a declared extra destination and an IP-literal API both reach the allow list', () => {
    const tokens = egressAllow(
      systemdPolicy({ publicationApiUrl: 'http://10.4.0.7:8080/api', egressAllow: '10.9.9.0/24, ' }),
    );
    expect(tokens).toContain('10.4.0.7/32');
    expect(tokens).toContain('10.9.9.0/24');
    // A DNS name yields no token — stated, because the alternative (resolving it here) would
    // pin a museum's egress policy to one moment's DNS answer.
    expect(egressAllow(systemdPolicy({ publicationApiUrl: 'https://api.example.org/v2' }))).toEqual(['any']);
  });

  test('the per-turn caps are on the unit, wall clock included', async () => {
    const policy = systemdPolicy({ memoryMax: '3G', cpuQuota: '150%', tasksMax: 64 });
    const turn = await confineTurn(
      { argv: ['/opt/claude'], cwd: '/srv/ws/site-a', env: {}, timeoutMs: 60_000 },
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

describe('no secret rides on the command line, and none outlives the turn', () => {
  test('the child environment travels in a 0600 file, not in a unit property', async () => {
    const policy = systemdPolicy();
    const turn = await confineTurn(
      {
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
      const problems = confinementProblems(policy);
      expect({ label, problems: problems.length }).toEqual({ label, problems: 1 });
      expect(() => assertTurnConfinementAvailable(policy)).toThrow(ConfinementUnavailableError);
      // 503, so the ENGINE relays "not right now, and here is what is missing" rather than
      // accepting a session that will never run.
      try {
        assertTurnConfinementAvailable(policy);
        throw new Error('unreachable');
      } catch (error) {
        expect((error as ConfinementUnavailableError).status).toBe(503);
      }
    }
    // The positive control: a complete policy refuses nothing. Without it every assertion
    // above would pass against a function that always refused.
    expect(confinementProblems(systemdPolicy())).toEqual([]);
    expect(() => assertTurnConfinementAvailable(systemdPolicy())).not.toThrow();
  });

  test('confineTurn itself refuses too — the check before the reservation is not the guarantee', async () => {
    await expect(
      confineTurn(
        { argv: ['/opt/claude'], cwd: '/srv/ws/a', env: {}, timeoutMs: 1000 },
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
      { argv: ['/usr/bin/true', 'x'], cwd: '/tmp', env: { PATH: '/usr/bin' }, timeoutMs: 1000 },
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
      { argv: ['/opt/claude'], cwd: '/srv/ws/site-a', env: { PATH: '/usr/bin' }, timeoutMs: 1000 },
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
function recordingPolicy(overrides: Partial<ConfinementPolicy> = {}) {
  const policy = systemdPolicy(overrides);
  const dir = dirname(policy.systemdRunBin);
  const argvLog = join(dir, 'argv.log');
  const envLog = join(dir, 'env.log');
  writeFileSync(
    policy.systemdRunBin,
    '#!/bin/sh\n' +
      `printf '%s\\n' "$@" > ${argvLog}\n` +
      'for a in "$@"; do\n' +
      '  case "$a" in\n' +
      `    --property=EnvironmentFile=*) cat "\${a#--property=EnvironmentFile=}" > ${envLog} ;;\n` +
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
    expect(argv).toContain(`--working-directory=${runner.cwd}`);
    // The build's own command survives the wrapper intact, after the `--`.
    expect(argv.slice(argv.indexOf('--') + 1)).toEqual(['bun', 'install']);
    // The same egress and the same caps as a turn: a package registry is on the public
    // internet, and the engine, the databases and the LAN are not reachable from either.
    expect(argv).toContain(`--property=IPAddressDeny=${EGRESS_DENY.join(' ')}`);
    expect(argv).toContain(`--property=MemoryMax=${runner.policy.memoryMax}`);
    expect(argv).toContain('--property=ProtectSystem=strict');
  });

  test('what the agent creates stays readable to the daemon — UMask=0007 on the unit', async () => {
    // The other half of the shared tree: the daemon has to read those bytes back to build,
    // promote and commit them, and a 0640 file created by the agent under its own umask
    // would be one the daemon can read and never rewrite. World bits stay closed.
    const runner = recordingPolicy();
    await runConfined(
      { argv: ['bun', 'run', 'build'], cwd: runner.cwd, env: {}, timeoutMs: 5_000 },
      runner.policy,
    );
    expect(runner.argv()).toContain('--property=UMask=0007');
  });

  test('the step environment travels in the per-run 0600 file, and is gone afterwards', async () => {
    const runner = recordingPolicy();
    await runConfined(
      {
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
      { argv: ['bun', 'run', 'build'], cwd: runner.cwd, env: {}, timeoutMs: 5_000 },
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
        { argv: ['bun', 'install'], cwd: runner.cwd, env: {}, timeoutMs: 5_000 },
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
    const outside = mkdtempSync(join(tmpdir(), 'dedalo-read-victim-'));
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
