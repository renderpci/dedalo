/**
 * THE TURN'S CONFINEMENT — the one place that decides what an agent turn RUNS AS, what it
 * may reach, and what it may spend.
 *
 * WHAT WAS WRONG. Every other boundary in this daemon was drawn and this one was not: the
 * child's environment is a closed key set, its cwd is realpath-proved inside the museum's
 * workspaces, its HOME is the agent's own tree, its git remote is pinned, and its daemon's
 * unit is hardened down to `ProtectSystem=strict`. And then the turn was spawned with
 * `Bun.spawn(argv)` — as the DAEMON'S OWN UID, in the daemon's own cgroup, with the
 * daemon's own network reach. No filesystem mode, no `Protect*` directive and no
 * `ReadWritePaths=` separates a process from itself: while the turn was the daemon, the
 * shared bearer under `$CREDENTIALS_DIRECTORY`, every provider key in `/proc/self/environ`
 * and the append handle on the audit trail were all one open() away from text a language
 * model wrote.
 *
 * WHAT THIS DOES. One turn becomes one TRANSIENT SYSTEMD SERVICE, started through
 * `systemd-run --uid=<agent user>` and authorized by the museum's own rendered polkit rule
 * (`render/agent_authorization.ts`). PID 1 — not this daemon — sets the uid, so the turn is
 * a different principal in the kernel's eyes and the daemon's secrets become unreachable
 * rather than merely undocumented. The same call carries the rest of the confinement,
 * because a transient unit accepts every property a unit file does:
 *
 *   - THE CAPS, per turn: MemoryMax, CPUQuota, TasksMax and RuntimeMaxSec. The last is the
 *     one that cannot be worked around — the daemon's own timer kills the CLIENT, and a
 *     client killed with SIGKILL would leave the agent running; PID 1 kills the UNIT.
 *   - THE EGRESS — a NAMESPACE, not an address list (`network_profile.ts` renders it, the
 *     one producer of every network property a unit gets). Every door runs in a private
 *     network namespace with `/run` masked: host loopback, the host's own address, the LAN,
 *     the metadata service, the DNS stub, every abstract unix socket and every service
 *     socket under `/run` are simply absent. A door that needs the outside (a turn's model
 *     provider, a build's package registry) gets ONE thing bound back in: its per-run
 *     socket directory, served by the daemon's egress gate (`src/egress/gate.ts`), which
 *     tunnels to HOSTNAMES on the run's plan only and adds the Publication API key on the
 *     daemon's side (the key never enters the unit). `git` gets nothing at all.
 *     WHY NOT AN IP LIST: systemd's IP filter is ALLOW-WINS, so the `IPAddressAllow=any`
 *     this header once defended ("longest-prefix wins") granted Postgres, the LAN and the
 *     metadata service whatever the deny list said (LEAD-1) — and no IP list closes an
 *     abstract socket. `IPAddressDeny=any` stays only as a BACKSTOP, made safe by the
 *     unit's ExecStart (`egress_shim.ts`), which refuses to run anything unless the
 *     namespace is really in effect.
 *   - THE FILESYSTEM. `ProtectSystem=strict` with exactly two writable paths: this turn's
 *     workspace and the agent's HOME.
 *
 * NO SECRET RIDES ON THE COMMAND LINE OR IN A UNIT PROPERTY. A transient unit's properties
 * are readable over D-Bus by any uid on the host (`systemctl show`), so the child's
 * environment is written to a per-turn 0600 file in the daemon's runtime directory and
 * passed as `EnvironmentFile=`; PID 1 reads it as root, and the file is deleted when the
 * turn ends. That is a strictly smaller residence than the `Bun.spawn` environment it
 * replaces, which lived in `/proc/<pid>/environ` for the life of the turn.
 *
 * AND WHERE THERE IS NO SYSTEMD — a laptop, a container, this suite — it REFUSES rather
 * than degrades, unless the daemon was explicitly configured `AGENT_CONFINEMENT=none`, in
 * which case every turn announces the fact into its own durable event log. There is no
 * silent fallback: an unconfined turn is either declared or it does not happen.
 */

import { existsSync, readlinkSync, realpathSync, statSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, isAbsolute, join } from 'node:path';
import { config } from '../config';
import { openEgressGate, type EgressGate, type EgressGateOptions } from '../egress/gate';
import { ConfinementUnavailableError } from '../errors';
import { CONFINED_ARGV, runBinary, type SpawnResult } from '../util/spawn';
import {
  bindablePathProblem,
  childEgressEnv,
  DOOR_PROFILE,
  type ConfinementDoor,
  type EgressFacts,
  egressDirFor,
  egressPlanFor,
  parseHostList,
  planProblems,
  HOST_NETNS_ENV,
  unitNetworkProperties,
  WORKDIR_ENV,
} from './network_profile';
import type { DriverId, McpUpstream } from './types';

export type { ConfinementDoor } from './network_profile';

/** The grammar the rendered unit prefix is held to at both ends (see layout.ts). */
const UNIT_PREFIX_PATTERN = /^[a-z][a-z0-9-]{2,60}-$/;

/** Anything that cannot survive inside one line of a systemd EnvironmentFile. */
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/** The unit's ExecStart: the shim that proves the namespace, then runs the argv. */
export const SHIM_PATH = join(import.meta.dir, 'egress_shim.ts');

/**
 * THE HOST PREFIXES A CONFINED UNIT CANNOT SEE: `ProtectHome=yes` (/home, /root, /run/user),
 * `PrivateTmp=yes` (/tmp, /var/tmp) and the `/run` mask. A runtime or shim that lives under
 * one of them is an ExecStart that does not exist inside the unit — every run would fail, so
 * the host is refused up front instead.
 */
export const UNIT_MASKED_PREFIXES: readonly string[] = Object.freeze(['/home', '/root', '/run', '/tmp', '/var/tmp']);

/**
 * WHERE THE DAEMON'S RUNTIME DIRECTORY MUST LIVE: under `/run`, which every unit masks
 * (`TemporaryFileSystem=/run:ro`). That directory holds the daemon's own socket, `turns/`
 * (the per-run 0600 secret files) and `egress/` (EVERY concurrent run's gate sockets) — and a
 * path socket ignores network namespaces, so the mask is the only thing between a git hook
 * and another run's `mcp.sock`. Not `/tmp` either, although PrivateTmp hides it: the daemon's
 * own unit has PrivateTmp too, and a path PID 1 resolves (BindPaths=, EnvironmentFile=) would
 * name the HOST's /tmp, not the daemon's.
 */
export const RUNTIME_PREFIX = '/run';

/**
 * THE SYSTEMD RELEASE EVERY RENDERED UNIT PROPERTY NEEDS — closed over what this module and
 * the network leaf render (a package gate holds the key set EQUAL to the properties of every
 * door's real argv, so a property cannot be added without stating its release, and a stale
 * entry cannot hold the floor up).
 *
 * WHY IT EXISTS: `systemd-run` refuses a property its systemd does not know ("Unknown
 * assignment"), and it does so at SPAWN — after the request was accepted, the gate opened
 * and the secret file written. A host below the floor would fail every run one at a time;
 * `confinementProblems()` refuses it up front instead, naming the directives it lacks.
 *
 * Each value is the release that introduced the setting (systemd NEWS). `ANCIENT` marks the
 * ones every systemd this could ever meet has had (209 is an upper bound for them, not their
 * release): the floor is decided by the newest, and those are exact.
 */
const ANCIENT = 209;
export const SYSTEMD_SINCE: Readonly<Record<string, number>> = Object.freeze({
  EnvironmentFile: ANCIENT,
  UMask: ANCIENT,
  PrivateTmp: ANCIENT,
  PrivateNetwork: ANCIENT,
  NoNewPrivileges: ANCIENT,
  PrivateDevices: 209,
  RestrictAddressFamilies: 211,
  CPUQuota: 213,
  ProtectHome: 214,
  TasksMax: 227,
  RuntimeMaxSec: 229,
  MemoryMax: 231,
  ReadWritePaths: 231,
  InaccessiblePaths: 231,
  // `strict` is what is rendered, and it is younger than the directive (214).
  ProtectSystem: 232,
  BindPaths: 233,
  IPAddressAllow: 235,
  IPAddressDeny: 235,
  LockPersonality: 235,
  TemporaryFileSystem: 238,
  RestrictSUIDSGID: 242,
  ProtectProc: 247,
  PrivateIPC: 248,
  PrivatePIDs: 257,
});

/** The oldest systemd a confined unit can be started on: the newest property's release. */
export const SYSTEMD_FLOOR: number = Math.max(...Object.values(SYSTEMD_SINCE));

/** The rendered properties a systemd of `version` does not know, newest first. */
export function propertiesNewerThan(version: number): string[] {
  return Object.entries(SYSTEMD_SINCE)
    .filter(([, since]) => since > version)
    .sort((a, b) => b[1] - a[1])
    .map(([name, since]) => `${name}= (${since})`);
}

/** The agent uid and every group it is in — the principal the ownership questions ask about. */
export interface AgentIdentity {
  readonly uid: number;
  readonly gids: readonly number[];
}

/** What `stat(2)` says about a file, for the trust questions. */
export interface FileFacts {
  readonly uid: number;
  readonly gid: number;
  readonly mode: number;
}

/**
 * THE POLICY — every fact about this host that the decision below depends on, in one
 * object.
 *
 * It is a parameter and not a read of `config` inside each function, for a reason that is
 * not style: the confinement's whole contract is what it does with a REAL systemd_scope
 * policy, and a module that read the frozen config singleton directly could only ever be
 * exercised in whatever mode the suite's own daemon happens to run in — which is `none`,
 * on a machine with no systemd. Threading the policy makes the confined path's argv, its
 * refusals and its per-turn secret file assertable, rather than described.
 */
export interface ConfinementPolicy {
  readonly mode: 'systemd_scope' | 'none';
  /** The uid a turn runs as. */
  readonly agentUser: string;
  /** The name every transient unit of this museum begins with; the polkit grant's scope. */
  readonly unitPrefix: string;
  readonly systemdRunBin: string;
  /** The daemon's socket — its directory is the runtime directory the env file lives in. */
  readonly listenSocket: string;
  readonly listenKind: 'unix' | 'tcp';
  /** Writable to the turn alongside its workspace. */
  readonly agentHome: string;
  /** What each door's egress plan is derived from (network_profile.ts egressPlanFor). */
  readonly egressFacts: EgressFacts;
  /**
   * WHAT THE UNIT EXECUTES FIRST: this daemon's own runtime and the egress shim, and the host
   * prefixes the unit cannot see. A policy field so a host that CANNOT run the unit (a CI
   * checkout under /home) can still have its argv asserted; `policyFromConfig()` always
   * states the real three.
   */
  readonly unitExec: {
    readonly runtime: string;
    readonly shim: string;
    readonly maskedPrefixes: readonly string[];
  };
  /**
   * THE HOST FACTS the refusals ask about, each a function so a host that is not this one
   * (a CI checkout, a macOS laptop) can state them; `policyFromConfig()` always states the
   * real ones (and a gate pins that it does).
   */
  readonly host: {
    /** The prefix the daemon's runtime directory must live under — RUNTIME_PREFIX. */
    readonly runtimePrefix: string;
    /** AGENT_USER → its uid and groups, or null when this host has no such user. */
    readonly resolveAgent: (user: string) => AgentIdentity | null;
    /** THIS daemon's network namespace identity (`net:[inode]`); throws where unreadable. */
    readonly readNetns: () => string;
    /** stat(2) of a resolved path. */
    readonly stat: (path: string) => FileFacts;
    /** The systemd release behind SYSTEMD_RUN_BIN (`systemd-run --version`), or null when unreadable. */
    readonly systemdVersion: (systemdRunBin: string) => number | null;
  };
  /**
   * The egress gate's test seams — resolver, dialer, and the hook run before each socket is
   * served (what lets a gate observe WHEN, relative to everything else, a gate was opened).
   * Absent in production: the system's resolver and dialer, no hook.
   */
  readonly egressSeams?: EgressGateOptions['seams'];
  readonly memoryMax: string;
  readonly cpuQuota: string;
  readonly tasksMax: number;
}

/** The policy this daemon is running under, read from the one configuration path. */
export function policyFromConfig(): ConfinementPolicy {
  return {
    mode: config.AGENT_CONFINEMENT,
    agentUser: config.AGENT_USER,
    unitPrefix: config.AGENT_UNIT_PREFIX,
    systemdRunBin: config.SYSTEMD_RUN_BIN,
    listenSocket: config.LISTEN_SOCKET,
    listenKind: config.LISTEN_KIND,
    agentHome: config.AGENT_HOME,
    egressFacts: {
      driver: config.AGENT_DRIVER,
      providerHosts: parseHostList(config.AGENT_PROVIDER_HOSTS),
      registryHosts: parseHostList(config.BUILD_REGISTRY_HOSTS),
    },
    unitExec: { runtime: process.execPath, shim: SHIM_PATH, maskedPrefixes: UNIT_MASKED_PREFIXES },
    host: HOST_FACTS,
    memoryMax: config.AGENT_TURN_MEMORY_MAX,
    cpuQuota: config.AGENT_TURN_CPU_QUOTA,
    tasksMax: config.AGENT_TURN_TASKS_MAX,
  };
}

/**
 * AGENT_USER → uid and groups, through the host's own NSS (`id`), so a user from LDAP/sssd
 * resolves exactly as `systemd-run --uid=` will resolve it. Only a SUCCESS is remembered: a
 * user the operator creates after the daemon started is found on the next request.
 */
const agentIdentities = new Map<string, AgentIdentity>();
export function resolveAgentIdentity(user: string): AgentIdentity | null {
  const known = agentIdentities.get(user);
  if (known) return known;
  const bin = ['/usr/bin/id', '/bin/id'].find(candidate => existsSync(candidate));
  if (!bin) return null;
  const ask = (flag: string): string | null => {
    const result = spawnSync(bin, [flag, '--', user], { encoding: 'utf8', timeout: 5_000 });
    return result.status === 0 ? String(result.stdout).trim() : null;
  };
  const uid = ask('-u');
  const gids = ask('-G');
  if (uid === null || gids === null || !/^\d+$/.test(uid)) return null;
  const identity = Object.freeze({
    uid: Number(uid),
    gids: Object.freeze(gids.split(/\s+/).filter(gid => /^\d+$/.test(gid)).map(Number)),
  });
  agentIdentities.set(user, identity);
  return identity;
}

/** This daemon's network namespace identity — Linux only; throws anywhere else. */
export function readHostNetns(): string {
  const identity = readlinkSync('/proc/self/ns/net');
  if (!identity) throw new Error('/proc/self/ns/net is empty');
  return identity;
}

/**
 * The systemd release `systemd-run --version` reports (its first line is `systemd <N> (…)`).
 * Only a SUCCESS is remembered, per binary: a host upgraded while the daemon runs is read
 * again on the next request that finds it unreadable, never pinned to a failure.
 */
const systemdVersions = new Map<string, number>();
export function readSystemdVersion(systemdRunBin: string): number | null {
  const known = systemdVersions.get(systemdRunBin);
  if (known !== undefined) return known;
  const result = spawnSync(systemdRunBin, ['--version'], { encoding: 'utf8', timeout: 5_000 });
  const match = result.status === 0 ? /^systemd (\d+)\b/m.exec(String(result.stdout)) : null;
  if (!match) return null;
  const version = Number(match[1]);
  systemdVersions.set(systemdRunBin, version);
  return version;
}

/** The real host facts — what `policyFromConfig()` always states. */
export const HOST_FACTS: ConfinementPolicy['host'] = Object.freeze({
  runtimePrefix: RUNTIME_PREFIX,
  resolveAgent: resolveAgentIdentity,
  readNetns: readHostNetns,
  systemdVersion: readSystemdVersion,
  stat: (path: string): FileFacts => {
    const stat = statSync(path);
    return { uid: stat.uid, gid: stat.gid, mode: stat.mode };
  },
});

/** What one confined (or declared-unconfined) turn is, from the supervisor's point of view. */
export interface ConfinedTurn {
  /** The argv to spawn. Wrapped under `systemd_scope`; the driver's own under `none`. */
  readonly argv: string[];
  /** The transient unit's name, or null when the turn is a plain child of this daemon. */
  readonly unitName: string | null;
  /** The environment `Bun.spawn` is handed — empty when it travelled as EnvironmentFile. */
  readonly env: Record<string, string>;
  /** Present ONLY for an unconfined turn: the line its session log must carry. */
  readonly announcement: string | null;
  /** Stops the transient unit (no-op when unconfined). Used by interrupt(). */
  stop(): void;
  /**
   * Closes the run's egress gate, then deletes the per-turn secret file. Always called, on
   * every exit path.
   */
  cleanup(): Promise<void>;
}

/**
 * IS A CONFINED RUN THROUGH THIS DOOR POSSIBLE ON THIS HOST, RIGHT NOW?
 *
 * Called by the session manager and the builder BEFORE they reserve a workspace or a
 * concurrency slot, so a host that cannot confine answers 503 to the request instead of
 * accepting work and failing it asynchronously. `confineTurn()` asks the same questions
 * again at the spawn — this one is the courtesy, that one is the guarantee.
 */
export function assertConfinementAvailable(
  door: ConfinementDoor,
  policy: ConfinementPolicy = policyFromConfig(),
  driver?: DriverId,
): void {
  if (policy.mode === 'none') return;
  const problems = confinementProblems(policy, door, driver);
  if (problems.length > 0) throw new ConfinementUnavailableError(problems.join(' '));
}

/** Is `path` equal to or under `prefix`? */
function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** The permission triple `who` gets on a file: owner, group (any of its groups) or other. */
function bitsFor(file: FileFacts, who: AgentIdentity): number {
  // eslint-disable-next-line no-bitwise -- the permission word is the question
  if (file.uid === who.uid) return (file.mode >> 6) & 0o7;
  // eslint-disable-next-line no-bitwise -- the permission word is the question
  if (who.gids.includes(file.gid)) return (file.mode >> 3) & 0o7;
  // eslint-disable-next-line no-bitwise -- the permission word is the question
  return file.mode & 0o7;
}

/**
 * Why a file the unit executes cannot be trusted to be what this daemon shipped, or null.
 *
 * THE TRUST RULE (the design's, not a narrower one): the file must not be the AGENT's —
 * neither owned by the agent uid, nor group/world-writable, nor inside a directory the agent
 * can write (it could rename a replacement over it) — and the agent must be able to use it
 * (`need`: read the shim, execute the runtime). Root, this daemon's uid and a THIRD uid (the
 * engine's `dedalo`, which owns the checkout and the pinned bun the daemon runs from) are all
 * acceptable owners: what makes a file untrustworthy is that the principal being confined
 * can change it, not who else can.
 */
function executableProblem(
  label: string,
  path: string,
  need: 'read' | 'execute',
  policy: ConfinementPolicy,
  agent: AgentIdentity | null,
): string | null {
  const maskedPrefixes = policy.unitExec.maskedPrefixes;
  let real: string;
  let file: FileFacts;
  try {
    real = realpathSync(path);
    file = policy.host.stat(real);
  } catch {
    return `${label} ('${path}') does not exist, so the unit has nothing to execute.`;
  }
  // Both spellings: the unit resolves the path it is given, and a symlink (`/var/run` →
  // `/run`) is resolved to what it names.
  const masked = maskedPrefixes.find(prefix => under(path, prefix) || under(real, prefix));
  if (masked) {
    return (
      `${label} ('${path}') is under ${masked}, which the unit masks (ProtectHome=, ` +
      `PrivateTmp=, the /run mask): the unit's ExecStart would not exist inside it. Install ` +
      `the site builder and its runtime outside ${UNIT_MASKED_PREFIXES.join(', ')}.`
    );
  }
  // eslint-disable-next-line no-bitwise -- the permission word is the question
  if ((file.mode & 0o022) !== 0) {
    return (
      `${label} ('${real}') is group- or world-writable: anything that can write it can ` +
      `replace what every confined unit runs before its namespace is proved.`
    );
  }
  // Without an identity there is nothing more to ask; confinementProblems names that itself.
  if (!agent) return null;
  if (file.uid === agent.uid) {
    return (
      `${label} ('${real}') is owned by uid ${file.uid}, the agent uid — the principal being ` +
      `confined must never own what its own unit executes first.`
    );
  }
  // eslint-disable-next-line no-bitwise -- the permission word is the question
  if ((bitsFor(file, agent) & (need === 'read' ? 0o4 : 0o1)) === 0) {
    return (
      `${label} ('${real}') cannot be ${need === 'read' ? 'read' : 'executed'} by the agent uid ` +
      `${agent.uid} (mode ${(file.mode & 0o777).toString(8)}, owner ${file.uid}, group ${file.gid}) — ` +
      `the unit runs AS the agent, so every run would fail at its first exec.`
    );
  }
  for (let dir = dirname(real); ; dir = dirname(dir)) {
    let parent: FileFacts;
    try {
      parent = policy.host.stat(dir);
    } catch {
      return `${label}: its directory '${dir}' cannot be examined.`;
    }
    // A directory the agent OWNS is writable whatever its mode says today: its owner can
    // chmod it back (a 0555 directory is one chmod from a 0755 one), and the owner of a
    // sticky directory may rename anything inside it. Ownership is decided before the bits.
    const agentOwned = parent.uid === agent.uid;
    // eslint-disable-next-line no-bitwise -- the permission word is the question
    const writable = agentOwned || (bitsFor(parent, agent) & 0o2) !== 0;
    // eslint-disable-next-line no-bitwise -- the sticky bit: only a file's owner may rename it
    const sticky = (parent.mode & 0o1000) !== 0 && !agentOwned;
    if (writable && !sticky) {
      return (
        `${label} ('${real}') lies under '${dir}', which the agent uid can write: it could ` +
        `rename its own file over what the unit executes first.`
      );
    }
    if (dir === dirname(dir)) break;
  }
  return null;
}

/** Every reason this host cannot run a confined unit through `door`, in the order an operator fixes them. */
export function confinementProblems(policy: ConfinementPolicy, door: ConfinementDoor, driver?: DriverId): string[] {
  const problems: string[] = [];
  if (!policy.agentUser) {
    problems.push(
      `AGENT_CONFINEMENT is 'systemd_scope' but AGENT_USER is empty: there is no uid to run ` +
        `the turn as, and running it as this daemon is the disclosure the setting exists to ` +
        `prevent. A provisioned instance renders both keys (provision apply).`,
    );
  }
  if (!UNIT_PREFIX_PATTERN.test(policy.unitPrefix)) {
    problems.push(
      `AGENT_UNIT_PREFIX ('${policy.unitPrefix}') does not match ` +
        `${UNIT_PREFIX_PATTERN.source}. It is the entire scope of this museum's polkit grant: ` +
        `a unit started outside it is not authorized, and a loose one would authorize more ` +
        `than this museum's own turns.`,
    );
  }
  if (!isAbsolute(policy.systemdRunBin) || !existsSync(policy.systemdRunBin)) {
    problems.push(
      `SYSTEMD_RUN_BIN ('${policy.systemdRunBin}') is not an absolute path to a file that ` +
        `exists. This host has no systemd-run, so no turn can be started under another uid.`,
    );
  } else {
    const version = policy.host.systemdVersion(policy.systemdRunBin);
    if (version === null) {
      problems.push(
        `the systemd release behind SYSTEMD_RUN_BIN ('${policy.systemdRunBin}') cannot be read ` +
          `(\`systemd-run --version\`), so it is unknown whether it accepts every property a ` +
          `confined unit is given; a confined unit needs systemd ${SYSTEMD_FLOOR} or newer.`,
      );
    } else if (version < SYSTEMD_FLOOR) {
      problems.push(
        `this host's systemd is ${version}, and a confined unit needs ${SYSTEMD_FLOOR} or newer: ` +
          `it does not know ${propertiesNewerThan(version).join(', ')}, and systemd-run would ` +
          `refuse the unit at spawn, failing every run. PrivatePIDs= is the one that keeps a ` +
          `museum's concurrent runs from reaching each other's egress sockets through /proc; ` +
          `upgrade systemd rather than drop it.`,
      );
    }
  }
  if (policy.listenKind !== 'unix') {
    problems.push(
      `LISTEN_KIND is '${policy.listenKind}', so this daemon has no runtime directory — and ` +
        `the per-turn environment must be written to a 0600 file there rather than onto a ` +
        `command line every uid on the host can read (systemctl show).`,
    );
  }
  problems.push(...runtimeDirProblems(policy));
  let agent: AgentIdentity | null = null;
  if (policy.agentUser) {
    agent = policy.host.resolveAgent(policy.agentUser);
    if (!agent) {
      problems.push(
        `AGENT_USER ('${policy.agentUser}') is not a user on this host (id -u): there is no uid ` +
          `for systemd-run to start the unit as. A provisioned instance creates it (provision apply).`,
      );
    }
  }
  for (const [label, path, need] of [
    ['the unit runtime (this daemon’s bun)', policy.unitExec.runtime, 'execute'],
    ['the egress shim', policy.unitExec.shim, 'read'],
    ['the egress shim’s network profile', join(dirname(policy.unitExec.shim), 'network_profile.ts'), 'read'],
  ] as const) {
    const problem = executableProblem(label, path, need, policy, agent);
    if (problem) problems.push(problem);
  }
  try {
    policy.host.readNetns();
  } catch {
    problems.push(
      `this daemon cannot read its own network namespace identity (/proc/self/ns/net), so a ` +
        `unit's shim could not prove it is in a DIFFERENT one — and a host that silently ignores ` +
        `PrivateNetwork= would run it on the host's loopback. A confined unit needs Linux /proc.`,
    );
  }
  // The plan only when the run's driver is known (a turn's provider host is the driver's), or
  // on a door whose plan does not depend on one: a driver-less question about a turn is a
  // question about this HOST, and must not refuse a site on the instance default's plan.
  if (driver !== undefined || door !== 'turn') {
    problems.push(...planProblems(door, egressFactsFor(policy, driver)));
  }
  return problems;
}

/**
 * Why the daemon's runtime directory (the directory of LISTEN_SOCKET) cannot hold a run's
 * gate sockets and secret files: it must be bindable (BindPaths= grammar) and under
 * RUNTIME_PREFIX, the one mask that hides it — and every other run's sockets — from a unit.
 */
function runtimeDirProblems(policy: ConfinementPolicy): string[] {
  const runtimeDir = dirname(policy.listenSocket);
  const problems: string[] = [];
  const grammar = bindablePathProblem(join(runtimeDir, 'egress'));
  if (grammar) problems.push(`LISTEN_SOCKET's directory: ${grammar}.`);
  // What the path RESOLVES to is what PID 1 binds and a unit could reach — a `/run/x` that
  // is a symlink into `/srv` is `/srv`. (Not created yet: the lexical path is the claim.)
  const resolve = (path: string) => {
    try {
      return realpathSync(path);
    } catch {
      return path;
    }
  };
  const prefix = policy.host.runtimePrefix;
  const real = resolve(runtimeDir);
  if (!under(real, prefix) && !under(real, resolve(prefix))) {
    problems.push(
      `LISTEN_SOCKET ('${policy.listenSocket}') is not under ${prefix}. Its directory holds this ` +
        `daemon's socket, turns/ (the per-run secret files) and egress/ (every concurrent run's ` +
        `gate sockets), and ${prefix} is the mask that hides all of them from a unit — a path ` +
        `socket ignores network namespaces, so anywhere else a git hook could reach another ` +
        `run's mcp.sock. A provisioned instance renders /run/<namespace>/<instance>/daemon.sock.`,
    );
  }
  return problems;
}

/** The policy's egress facts, with the run's own driver when the caller knows it. */
function egressFactsFor(policy: ConfinementPolicy, driver: DriverId | undefined): EgressFacts {
  return driver ? { ...policy.egressFacts, driver } : policy.egressFacts;
}

/**
 * BUILD THE RUN. Two side effects, both undone by `cleanup()`: the per-run environment file
 * and — on a door that reaches the outside — the run's egress gate.
 *
 * Under `none` it returns the driver's own argv and environment unchanged, plus the
 * announcement the supervisor must persist — the record that this run was not confined.
 */
export async function confineTurn(
  opts: {
    /** Which door this run goes through — REQUIRED: a new caller cannot inherit a wider one. */
    door: ConfinementDoor;
    argv: readonly string[];
    cwd: string;
    env: Record<string, string>;
    timeoutMs: number;
    /** What is being confined, for the announcement an unconfined run must carry. */
    label?: string;
    /** The run's driver, when known — decides a turn's provider host. */
    driver?: DriverId;
    /** The Publication API the gate's mcp.sock forwards to, key included (turns only). */
    mcpUpstream?: McpUpstream;
    /** Where the gate's accepted/refused destinations are written (the run's own log). */
    onEgress?: (line: string) => void;
  },
  policy: ConfinementPolicy = policyFromConfig(),
): Promise<ConfinedTurn> {
  // `undefined` is the supervisor passing its optional seam through untouched, and it means
  // "this daemon's own policy" — never "no policy", which would be an unconfined turn
  // arriving through a default parameter.
  if (!policy) policy = policyFromConfig();
  if (policy.mode === 'none') {
    return {
      argv: [...opts.argv],
      unitName: null,
      env: { ...opts.env },
      announcement:
        `[confinement] this ${opts.label ?? 'turn'} ran UNCONFINED — as the daemon's own uid, ` +
        `with no per-run egress policy and no per-run resource cap, because ` +
        `AGENT_CONFINEMENT is 'none' on this host. It is recorded here because an unconfined ` +
        `run must be a fact in the session's own log, never an absence.`,
      stop() {},
      async cleanup() {},
    };
  }

  // The run's driver, resolved: the guarantee always asks about a concrete plan (only the
  // manager's driver-less courtesy question skips it).
  const driver = opts.driver ?? ((policy.egressFacts.driver as DriverId | undefined) ?? 'claude_code');
  const problems = confinementProblems(policy, opts.door, driver);
  if (problems.length > 0) throw new ConfinementUnavailableError(problems.join(' '));

  const unitName = `${policy.unitPrefix}${randomUUID()}.service`;
  const runtimeDir = dirname(policy.listenSocket);
  const turnDir = join(runtimeDir, 'turns');
  const envFile = join(turnDir, `${unitName}.env`);
  const facts = egressFactsFor(policy, driver);
  const proxied = DOOR_PROFILE[opts.door].proxy;
  const egressDir = proxied ? egressDirFor(runtimeDir, unitName) : undefined;

  // EVERYTHING THAT CAN THROW, BEFORE ANYTHING IS OPENED: the network properties (the
  // BindPaths= grammar) and this daemon's namespace identity. A throw after the gate opened
  // would leave its sockets served — and, once the env file is written, a secret resident —
  // with no ConfinedTurn for the caller to clean up.
  const networkProperties = unitNetworkProperties(opts.door, egressDir ? { egressDir } : {});
  let hostNetns: string;
  try {
    hostNetns = policy.host.readNetns();
  } catch (error) {
    throw new ConfinementUnavailableError(
      `this daemon cannot read its own network namespace identity (${String(error)}); the ` +
        `unit's shim could not prove it is elsewhere. Nothing was started.`,
    );
  }

  // PID 1 is the wall clock of record. The supervisor's own timer fires first (it is the
  // one that can report a timeout as an event); this is the backstop for the case that
  // timer cannot cover — a client killed with SIGKILL, leaving an agent still running.
  const runtimeMaxSec = Math.ceil(opts.timeoutMs / 1000) + 15;

  const argv = [
    policy.systemdRunBin,
    '--quiet',
    // --pipe hands our stdio to the unit, --wait makes this process live exactly as long as
    // the turn, --collect removes the unit even when it failed (a museum's journal must not
    // fill with one dead transient unit per turn).
    '--pipe',
    '--wait',
    '--collect',
    `--unit=${unitName}`,
    `--uid=${policy.agentUser}`,
    // `/`, not the workspace: see WORKDIR_ENV below and egress_shim.ts.
    '--working-directory=/',
    `--property=EnvironmentFile=${envFile}`,
    `--property=RuntimeMaxSec=${runtimeMaxSec}`,
    `--property=MemoryMax=${policy.memoryMax}`,
    `--property=CPUQuota=${policy.cpuQuota}`,
    `--property=TasksMax=${policy.tasksMax}`,
    `--property=NoNewPrivileges=yes`,
    `--property=RestrictSUIDSGID=yes`,
    `--property=LockPersonality=yes`,
    `--property=PrivateTmp=yes`,
    `--property=PrivateDevices=yes`,
    `--property=ProtectSystem=strict`,
    `--property=ProtectHome=yes`,
    `--property=ProtectProc=invisible`,
    // 0007: what the agent creates in the shared tree stays readable AND writable to this
    // museum's group — the daemon has to read those bytes back to build, promote and commit
    // them — and closed to every other uid on the host. It is the other half of
    // `util/shared_tree.ts`, which states the same two modes for what the DAEMON creates.
    `--property=UMask=0007`,
    `--property=ReadWritePaths=${opts.cwd} ${policy.agentHome}`,
    // THE NETWORK — the leaf's list, verbatim, and nothing else (network_profile.ts).
    ...networkProperties.map(prop => `--property=${prop}`),
    '--',
    policy.unitExec.runtime,
    policy.unitExec.shim,
    '--',
    ...opts.argv,
  ];

  // THE GATE, then the env file: the unit's BindPaths= names a directory that must exist
  // when PID 1 builds the namespace, and a run must never start with a door nobody serves.
  // From the gate's opening on, every failure closes it and removes the env file.
  let gate: EgressGate | null = null;
  try {
    if (egressDir) {
      const plan = egressPlanFor(opts.door, facts);
      gate = await openEgressGate({
        dir: egressDir,
        // No upstream, no MCP socket: the gate never serves a door it has nowhere to send.
        plan: { hosts: plan.hosts, mcp: plan.mcp && opts.mcpUpstream !== undefined },
        publicationApiUrl: opts.mcpUpstream?.url ?? '',
        apiKey: opts.mcpUpstream?.apiKey ?? '',
        sink: line => opts.onEgress?.(line),
        seams: policy.egressSeams,
      });
    }
    await mkdir(turnDir, { recursive: true, mode: 0o700 });
    // 0600: PID 1 reads it as root; nothing else on the host may. The agent itself must not
    // read it either — it receives these values as its environment, which is a different
    // thing from being able to re-read them after the daemon has rotated one.
    const unitEnv = {
      ...opts.env,
      // The egress half wins over anything the caller passed: a driver's env cannot point
      // its own child around the gate.
      ...childEgressEnv(opts.door, facts.driver),
      // The workspace, for the shim to run the argv IN — the unit itself starts in `/` so
      // Bun loads no agent-authored bunfig/.env/tsconfig before the namespace is proved.
      [WORKDIR_ENV]: opts.cwd,
      // …and no transpiler cache the agent's HOME could have seeded.
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
      // THIS daemon's network namespace: the shim refuses to run anything still inside it,
      // and refuses outright when this key is missing.
      [HOST_NETNS_ENV]: hostNetns,
    };
    await writeFile(envFile, renderEnvironmentFile(unitEnv), { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    await gate?.close();
    await rm(envFile, { force: true });
    throw error;
  }

  let cleaned: Promise<void> | null = null;
  return {
    argv,
    unitName,
    // Empty ON PURPOSE: everything the child needs travelled in the 0600 file above, and a
    // second copy on this process's spawn would be a second residence for the same secret.
    env: {},
    announcement: null,
    stop() {
      // systemd-run's client relays a signal only while it lives; a turn whose client was
      // killed outright is stopped through PID 1, by the same grant that started it.
      try {
        const systemctl = join(dirname(policy.systemdRunBin), 'systemctl');
        spawn(systemctl, ['stop', unitName], { stdio: 'ignore' }).unref();
      } catch {
        // A stop that cannot be issued must not stop the interrupt path; RuntimeMaxSec is
        // still the kernel-side backstop.
      }
    },
    cleanup() {
      // The gate first — the run's only door out closes before its secrets go — then the
      // per-run environment. Idempotent: the supervisor may reach it from two paths.
      cleaned ??= (async () => {
        try {
          await gate?.close();
        } finally {
          await rm(envFile, { force: true });
        }
      })();
      return cleaned;
    },
  };
}

/**
 * The per-turn environment, in systemd's `EnvironmentFile=` grammar.
 *
 * Always quoted and escaped exactly as `render/env.ts` writes the instance's own env, for
 * the same reason: one rendering has to be read identically by systemd's parser and by an
 * operator's eye. A control character is REFUSED rather than escaped — a newline inside a
 * value ends the line it is on and starts an assignment of the agent's choosing, and this
 * file is read by PID 1.
 */
export function renderEnvironmentFile(env: Record<string, string>): string {
  const lines: string[] = [];
  for (const key of Object.keys(env).sort()) {
    const value = env[key] as string;
    if (CONTROL_CHARACTER.test(value)) {
      throw new ConfinementUnavailableError(
        `the value of '${key}' contains a control character and cannot be written into a ` +
          `systemd EnvironmentFile: the next line would be an assignment nothing intended. ` +
          `Nothing was spawned.`,
      );
    }
    lines.push(`${key}="${value.replace(/[\\"]/g, '\\$&')}"`);
  }
  return `${lines.join('\n')}\n`;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * THE OTHER DOOR — everything that is not an interactive turn
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * RUN A COMMAND IN A SITE WORKSPACE, AS THE AGENT.
 *
 * WHAT WAS WRONG, AND WHY THIS EXISTS. The turn was confined and the BUILD was not, and a
 * build is a routine, publisher-triggered execution of agent-authored text: `site.json`
 * lives inside the workspace the turn writes, `package.json`'s lifecycle scripts run on
 * `bun install`, and a `.git` a turn can replace carries hooks and clean/smudge filters that
 * `git add` executes. Every one of those ran as the SERVICE user — the uid that owns the
 * workspaces, the audit trail and, through `/run/credentials/<unit>`, the museum's bearer
 * token. The confinement had therefore made the build a WIDER principal than the turn, and
 * inverted the premise `build/builder.ts` rested on ("a build step runs at exactly an agent
 * turn's privilege, never wider").
 *
 * So a build step, a `git add`, and a turn are one decision with one implementation: the
 * same uid, the same transient-unit grant, the same caps, the same per-run 0600 environment
 * file and the same network design. What differs is the timeout the caller states and the
 * DOOR: a build reaches its package registry through the egress gate, a git command reaches
 * nothing at all.
 *
 * `util/spawn.ts` REFUSES a cwd inside `SITES_ROOT` without the token this function holds,
 * so this is not a convention a later call site can forget — it is the only way in.
 */
export async function runConfined(
  opts: {
    /** `build` or `git` — REQUIRED, and it decides what the run may reach (network_profile.ts). */
    door: ConfinementDoor;
    argv: readonly string[];
    cwd: string;
    env: Record<string, string>;
    timeoutMs: number;
    /** Names the run in the announcement a DECLARED-unconfined host must still make. */
    label?: string;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
  },
  policy: ConfinementPolicy = policyFromConfig(),
): Promise<SpawnResult> {
  const confined = await confineTurn(
    {
      door: opts.door,
      argv: opts.argv,
      cwd: opts.cwd,
      env: opts.env,
      timeoutMs: opts.timeoutMs,
      label: opts.label,
      // A build's blocked host is a line in the build log a museum reads afterwards.
      onEgress: line => opts.onStdout?.(`${line}\n`),
    },
    policy,
  );
  // An unconfined run says so in the ONE durable place this caller has — its own output
  // sink, which for a build is the build log a museum reads afterwards.
  if (confined.announcement) opts.onStdout?.(`${confined.announcement}\n`);
  try {
    const result = await runBinary(confined.argv, {
      cwd: opts.cwd,
      env: confined.env,
      timeoutMs: opts.timeoutMs,
      onStdout: opts.onStdout,
      onStderr: opts.onStderr,
      confined: CONFINED_ARGV,
    });
    // Killing the client does not stop a transient unit; PID 1 owns it. (RuntimeMaxSec is
    // the backstop behind this, for the case this process is gone too.)
    if (result.timedOut) confined.stop();
    return result;
  } finally {
    // The run's egress gate and its per-run environment residence go away on every path —
    // timeout and throw included, which is why it is a `finally` and not a line after the
    // await.
    await confined.cleanup();
  }
}
