/**
 * THE AGENT RUN'S CONFINEMENT — the one place that decides what an agent run (a turn, a build
 * step, a git command in a site workspace) RUNS AS, what it may reach, and what it may spend.
 *
 * WHAT WAS WRONG, TWICE. First the turn was spawned with `Bun.spawn(argv)` — as the DAEMON'S
 * OWN UID, holding the shared bearer, every provider key and the audit handle one `open()` away
 * from text a language model wrote. Then it became a TRANSIENT unit the daemon asked PID 1 to
 * start under `--uid=<agent>`, authorized by a polkit grant of "start" — and polkit is shown a
 * transient unit's name and verb, never the uid it would run as, so on systemd >= 257 that grant
 * let the service user start `<prefix>x.service` AS ROOT (F2). One uid for every site of a
 * museum, and one shared HOME, besides.
 *
 * WHAT THIS DOES (LEAD-1b). The daemon STARTS NOTHING and CHOOSES NO UID. Root renders, per
 * declared site k and door d, a socket, a target and a unit template whose `User=` is the site's
 * own identity (`provision/render/agent_units.ts`). A run is:
 *
 *   1. RESERVED. The site's workspace reservation (`workspace_activity.ts`) must be held — a
 *      site's runs are sequential by construction — and at most one run per site is open here
 *      (`site_busy` otherwise). A site with no identity is refused (`identity_missing`): there
 *      is no fallback uid, ever.
 *   2. PROVED IDLE. PID 1 is asked (`systemctl show NConnections`, `list-units`) whether a run
 *      of this identity is still alive — a previous daemon's, a unit that outlived its
 *      connection. One is stopped (awaited); one that will not die QUARANTINES the identity
 *      (`identity_quarantined`) until PID 1 reports it dead. Nothing is opened meanwhile.
 *   3. CHECKED. What PID 1 LOADED for the unit is compared, property by property, with what
 *      this daemon expects (`conformance`): a unit FILE silently ignores a key its systemd does
 *      not know, so the file saying the right thing is not enough (`unit_nonconformant`).
 *   4. GATED. A door that reaches the outside gets its egress gate (`src/egress/gate.ts`) in
 *      `<agent socket dir>/egress/s<k>` — ROOT's, provisioned (root:<site group> 0770; the unit
 *      binds it read-only), its sockets the SITE's private group (0660).
 *   5. CONNECTED — ONCE. One `connect()` to the site's door socket; PID 1 starts the instance;
 *      the shim says hello (H) and the daemon sends the run's spec (S: argv, env, its own
 *      network namespace) over the connection — no file for PID 1, no secret in a property.
 *      Never retried: a unit that does not say hello is `unit_refused`, with PID 1's own
 *      diagnosis.
 *   6. RELAYED. Output arrives as O/E frames; the exit status of record is the X frame. A
 *      connection that ends WITHOUT one is a FAILED run (`unit_ended_without_exit_frame`),
 *      never exit 0.
 *   7. FREED ONLY ON PROVEN DEATH. The connection is closed, the gate closed, and the site is
 *      released only once PID 1 reports the instance dead and the socket's connection count
 *      back at zero; otherwise the identity is quarantined and a background probe frees it.
 *
 * `reconcileAgentUnits()` runs the idle proof over every declared identity at BOOT, before the
 * session sweep and before the daemon listens (`src/boot.ts`): a run a killed daemon left
 * behind quarantines its identity, rebuilt from PID 1's state and never from memory. At
 * SHUTDOWN, `stopOpeningRuns()` is the first step: no connect after it (`daemon_stopping`),
 * because a socket-activated start would cancel the daemon's own stop job.
 *
 * THE CONTROL PLANE is `systemctl show / list-units / stop` through ONE wrapper
 * (`host.systemctl`, absolute `SYSTEMCTL_BIN`); the polkit rule grants the service user STOP and
 * KILL on its own enumerated instances and nothing else.
 *
 * AND WHERE THERE IS NO SYSTEMD — a laptop, a container, this suite — it REFUSES rather than
 * degrades, unless the daemon was explicitly configured `AGENT_CONFINEMENT=none`, in which case
 * every run announces the fact into its own durable log. There is no silent fallback: an
 * unconfined run is either declared or it does not happen.
 */

import { execFile, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, type Stats, statSync } from 'node:fs';
import { connect as netConnect, type Socket } from 'node:net';
import { userInfo } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { config } from '../config';
import { openEgressGate, provisionedDirProblem, type EgressGate, type EgressGateOptions } from '../egress/gate';
import { ConfinementRefusedError, ConfinementUnavailableError } from '../errors';
import { daemonUnitName } from '../provision/layout';
import { confinedPath } from '../util/paths';
import { CONFINED_ARGV, spawnChild, type SpawnResult } from '../util/spawn';
import { holdsReservation } from '../workspace_activity';
import {
  agentHomeFor,
  agentIdentityName,
  agentSocketPath,
  agentUnitNames,
  egressDirForSite,
  legacyTransientUnitGlob,
  gitconfigDirectives,
  legacyTransientUnitRegex,
  TURN_BARE_REPOSITORY_MARKER,
  TURN_SYSTEM_GITCONFIG_DIRECTIVES,
  turnBareRepositoryMarker,
  turnGitconfigBind,
  turnMaskedPaths,
  turnSystemGitconfigPath,
  unitFixedEnvironment,
} from './agent_identity';
import {
  bindablePathProblem,
  CGROUPFS_MASK,
  childEgressEnv,
  DATABASE_SOCKET_DIRS,
  DOOR_PROFILE,
  DOORS,
  type ConfinementDoor,
  type EgressFacts,
  EGRESS_MOUNT,
  egressPlanFor,
  parseHostList,
  planProblems,
} from './network_profile';
import {
  encodeJsonFrame,
  FrameDecoder,
  FrameError,
  isFixedEnvKey,
  parseExit,
  parseHello,
  type ExitRecord,
} from './unit_frames';
import { extraRendered, floorRefusal, SYSTEMD_FLOOR } from './unit_properties';
import type { DriverId, McpUpstream } from './types';

export type { ConfinementDoor } from './network_profile';

/** The grammar the rendered unit prefix is held to at both ends (see layout.ts). */
const UNIT_PREFIX_PATTERN = /^[a-z][a-z0-9-]{2,60}-$/;

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
 * (`TemporaryFileSystem=/run:ro`). It holds the daemon's own socket and `egress/` (EVERY
 * site's gate sockets) — and a path socket ignores network namespaces, so the mask is one of
 * the three layers between a git hook and another site's `mcp.sock` (the uid and the private
 * group's DAC are the other two).
 */
export const RUNTIME_PREFIX = '/run';

/** A site identity as the host resolves it: its uid, its primary gid and every group it is in. */
export interface AgentIdentity {
  readonly uid: number;
  readonly gid: number;
  readonly gids: readonly number[];
}

/** What `stat(2)` says about a file, for the trust questions. */
export interface FileFacts {
  readonly uid: number;
  readonly gid: number;
  readonly mode: number;
}

/** One `systemctl` answer. */
export interface SystemctlAnswer {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * The gate-tunable waits (spec §2.4). Production uses the defaults; a gate states small ones,
 * because a gate cannot wait 15 s for a stand-in PID 1.
 */
export interface ConfinementTiming {
  /** How long to re-probe a live leftover after asking PID 1 to stop it (15 s). */
  readonly reprobeWindowMs: number;
  /** Between two probes (250 ms). */
  readonly pollMs: number;
  /** How long the unit has to say hello — covers a Conflicts= stop of another door (30 s). */
  readonly helloTimeoutMs: number;
  /** How long a finished run's unit has to be reported dead before it is stopped (5 s). */
  readonly deathGraceMs: number;
  /** Between two background probes of a quarantined identity (5 s). */
  readonly quarantinePollMs: number;
}

export const DEFAULT_TIMING: ConfinementTiming = Object.freeze({
  reprobeWindowMs: 15_000,
  pollMs: 250,
  helloTimeoutMs: 30_000,
  deathGraceMs: 5_000,
  quarantinePollMs: 5_000,
});

/**
 * THE POLICY — every fact about this host that the decisions below depend on, in one object.
 *
 * A parameter and not a read of `config` inside each function, because the confinement's whole
 * contract is what it does with a REAL systemd_scope policy, and a module that read the frozen
 * config singleton could only ever be exercised in the mode the suite's own daemon runs in —
 * `none`, on a machine with no systemd. Threaded, the confined path's refusals, its lease and
 * its wire are assertable against a stand-in PID 1 (`tests/support/lead1b_host.ts`).
 */
export interface ConfinementPolicy {
  readonly mode: 'systemd_scope' | 'none';
  /** The instance — the identities' and the daemon unit's names are spelled from it. */
  readonly instance: string;
  /** Declared slug → its identity's ordinal (AGENT_IDENTITIES). */
  readonly identities: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
  /** The name every agent unit of this museum begins with. */
  readonly unitPrefix: string;
  /** Absolute `systemctl` — the control plane. */
  readonly systemctlBin: string;
  /** Where the per-(site, door) sockets listen (AGENT_SOCKET_DIR). */
  readonly agentSocketDir: string;
  /** The agent state root the units mask (AGENT_STATE_ROOT). */
  readonly agentStateRoot: string;
  /** The resume epoch sessions are stamped with (AGENT_IDENTITY_EPOCH). */
  readonly identityEpoch: number;
  /** This daemon's own user and primary group — what the sockets must belong to. */
  readonly serviceUser: string;
  readonly instanceGroup: string;
  /** The daemon's socket — its directory is the runtime directory the egress gates live in. */
  readonly listenSocket: string;
  readonly listenKind: 'unix' | 'tcp';
  /** What each door's egress plan is derived from (network_profile.ts egressPlanFor). */
  readonly egressFacts: EgressFacts;
  /** WHAT THE UNIT EXECUTES FIRST: this daemon's own runtime and the shim, and the masked prefixes. */
  readonly unitExec: {
    readonly runtime: string;
    readonly shim: string;
    readonly maskedPrefixes: readonly string[];
    /**
     * What the TURN unit's shim executes next: each driver's configured CLI (CLAUDE_CODE_BIN).
     * Held to the same trust rule as the runtime — probed as the daemon, it says nothing about
     * whether the site identities can reach it. Absent = not configured (the driver refuses).
     */
    readonly agentClis?: Readonly<Partial<Record<DriverId, string>>>;
  };
  /** Each door's wall-clock ceiling (ms): the unit's RuntimeMaxSec is this + 15 s. */
  readonly doorTimeoutsMs: Readonly<Record<ConfinementDoor, number>>;
  /** The per-run caps the units carry. */
  readonly memoryMax: string;
  readonly cpuQuota: string;
  readonly tasksMax: number;
  /** The waits; defaults to DEFAULT_TIMING. */
  readonly timing?: Partial<ConfinementTiming>;
  /**
   * THE HOST FACTS the refusals and the lease ask about, each a function so a host that is not
   * this one (a CI checkout, a macOS laptop, a stand-in PID 1) can state them.
   */
  readonly host: HostFacts;
  /**
   * The egress gate's test seams — resolver, dialer, the chgrp, and the hook run before each
   * socket is served. Absent in production.
   */
  readonly egressSeams?: EgressGateOptions['seams'];
}

/** A host answer that may arrive now or later: the real host's NSS questions are asynchronous. */
export type Awaitable<T> = T | Promise<T>;

export interface HostFacts {
  /** The prefix the daemon's runtime directory must live under — RUNTIME_PREFIX. */
  readonly runtimePrefix: string;
  /** THIS daemon's network namespace identity (`net:[inode]`); throws where unreadable. */
  readonly readNetns: () => string;
  /** stat(2) of a resolved path. */
  readonly stat: (path: string) => FileFacts;
  /** PID 1's release (`systemctl show -p Version --value`), or null when unreadable. */
  readonly pid1Version: () => number | null;
  /** The control plane: `systemctl <args>` — show, list-units and stop only. */
  readonly systemctl: (args: readonly string[]) => Promise<SystemctlAnswer>;
  /** One connect(2) to a unit socket. */
  readonly connect: (path: string) => Promise<Socket>;
  /**
   * A site identity → its uid, primary gid and groups (NSS), or null when absent. The NSS
   * questions below may answer asynchronously (the real host does: a spawn per question, per
   * identity, per run must never block the event loop every SSE stream and relay shares).
   */
  readonly resolveAgent: (name: string) => Awaitable<AgentIdentity | null>;
  /** A group's members (NSS), or null when it does not exist. */
  readonly groupMembers: (name: string) => Awaitable<readonly string[] | null>;
  /** A group's gid (NSS), or null when it does not exist. */
  readonly groupGid: (name: string) => Awaitable<number | null>;
  /** THIS process's supplementary groups (getgroups). */
  readonly ownGroups: () => readonly number[];
  /**
   * EVERY account the host enumerates (`getent passwd`): name, uid (`id`) and PRIMARY gid — the
   * one group membership `getent group` never lists; null when it cannot.
   */
  readonly listAccounts: () => Awaitable<ReadonlyArray<{ readonly name: string; readonly id: number; readonly gid: number }> | null>;
  /** EVERY group the host enumerates (`getent group`): name and gid; null when it cannot. */
  readonly listGroups: () => Awaitable<ReadonlyArray<{ readonly name: string; readonly id: number }> | null>;
  /**
   * The uid that provisioned the sites' egress directories — ROOT (0). A stand-in PID 1, which
   * cannot make a directory root's, states its own.
   */
  readonly provisionerUid: number;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The real host
 * ──────────────────────────────────────────────────────────────────────────────────── */

const ID_BIN = () => ['/usr/bin/id', '/bin/id'].find(candidate => existsSync(candidate));
const GETENT_BIN = () => ['/usr/bin/getent', '/bin/getent'].find(candidate => existsSync(candidate));

/**
 * A site identity → uid, gid and groups, through the host's own NSS (`id`), so an identity
 * from LDAP/sssd resolves exactly as PID 1 will resolve `User=`.
 *
 * NEVER REMEMBERED. Every run's checks (`confinementProblems`) ask the host again: PID 1
 * resolves `User=` when it starts the unit, so the uid a check proves must be the uid the host
 * says NOW. A cache would keep proving the uid of first use while a drifted host (`usermod -o
 * -u`, an NSS change) ran two sites as one uid — the one drift the shared-uid refusal below
 * exists to catch. `bin` is the gate's seam; production asks `/usr/bin/id`.
 */
export async function resolveAgentIdentity(name: string, bin: string | undefined = ID_BIN()): Promise<AgentIdentity | null> {
  if (!bin) return null;
  const ask = async (flag: string): Promise<string | null> => {
    const result = await runQuiet(bin, [flag, '--', name]);
    return result.code === 0 ? result.stdout.trim() : null;
  };
  // Concurrently, and never on the event loop: a synchronous spawn per question per identity
  // per run froze every SSE stream and relay the daemon serves for as long as NSS took.
  const [uid, gid, gids] = await Promise.all([ask('-u'), ask('-g'), ask('-G')]);
  if (uid === null || gid === null || gids === null || !/^\d+$/.test(uid) || !/^\d+$/.test(gid)) return null;
  return Object.freeze({
    uid: Number(uid),
    gid: Number(gid),
    gids: Object.freeze(gids.split(/\s+/).filter(entry => /^\d+$/.test(entry)).map(Number)),
  });
}

/**
 * One NSS/lookup process, asynchronously, bounded (5 s) — the shape of every host question the
 * run's checks ask. A spawn failure or a kill answers a non-zero code, never a throw.
 */
function runQuiet(bin: string, args: readonly string[], maxBuffer = 1024 * 1024): Promise<{ code: number; stdout: string }> {
  return new Promise(resolveRun => {
    execFile(bin, [...args], { encoding: 'utf8', timeout: 5_000, maxBuffer }, (error, stdout) => {
      const status = (error as { code?: unknown } | null)?.code;
      resolveRun({ code: error ? (typeof status === 'number' ? status : 1) : 0, stdout: String(stdout ?? '') });
    });
  });
}

/**
 * `getent group <name>` → gid and members. IN-FLIGHT SHARED, NEVER REMEMBERED: `groupGid` and
 * `groupMembers` of one name asked together (as every run's checks ask them) share one
 * process; the entry is dropped the moment it settles, so the next question asks the host again.
 */
const groupLookups = new Map<string, Promise<{ gid: number; members: string[] } | null>>();
function getentGroup(name: string): Promise<{ gid: number; members: string[] } | null> {
  const pending = groupLookups.get(name);
  if (pending) return pending;
  const lookup = (async () => {
    const bin = GETENT_BIN();
    if (!bin) return null;
    const result = await runQuiet(bin, ['group', name]);
    if (result.code !== 0) return null;
    const [, , gid, members] = result.stdout.trim().split(':');
    if (!/^\d+$/.test(gid ?? '')) return null;
    return { gid: Number(gid), members: (members ?? '').split(',').filter(Boolean) };
  })().finally(() => groupLookups.delete(name));
  groupLookups.set(name, lookup);
  return lookup;
}

/** This daemon's network namespace identity — Linux only; throws anywhere else. */
export function readHostNetns(): string {
  const identity = readlinkSync('/proc/self/ns/net');
  if (!identity) throw new Error('/proc/self/ns/net is empty');
  return identity;
}

/**
 * `systemctl <args>`, pinned, with no shell, a bounded time and no password prompt. The ONE
 * control-plane door: show, list-units and stop — never start (the rule grants none).
 *
 * ASYNCHRONOUS FOR REAL. This is the call that waits on PID 1 over D-Bus — slowest exactly when
 * PID 1 is busy (a `daemon-reload` from provision apply) — and a run makes about ten of them
 * (the idle proof, conformance, the death poll), a quarantine four every probe. A blocking
 * spawn here froze Bun's one event loop for each: every SSE stream, every other site's relay,
 * the hello timeout. `execFile` waits without blocking; the 20 s bound stays.
 */
function systemctlVia(bin: string): (args: readonly string[]) => Promise<SystemctlAnswer> {
  return async args => {
    const verb = args.find(arg => !arg.startsWith('-'));
    if (verb !== 'show' && verb !== 'list-units' && verb !== 'stop') {
      throw new Error(`confinement: '${String(verb)}' is not a verb the daemon may send PID 1 (show, list-units, stop).`);
    }
    return new Promise<SystemctlAnswer>(resolveAnswer => {
      execFile(
        bin,
        ['--no-pager', '--no-ask-password', ...args],
        { encoding: 'utf8', timeout: 20_000, maxBuffer: 8 * 1024 * 1024 },
        (error, stdout, stderr) => {
          // A non-zero exit carries its status as a number; a spawn failure or a kill does not.
          const status = (error as { code?: unknown } | null)?.code;
          const code = error ? (typeof status === 'number' ? status : 1) : 0;
          resolveAnswer({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
        },
      );
    });
  };
}

/**
 * HOW LONG PID 1's RELEASE IS BELIEVED before it is asked again. Not forever: `apt upgrade`
 * followed by `daemon-reexec` changes the release under a running daemon (255 → 257), and the
 * PrivatePIDs warning and the floor are decided by it. Not every call either: the question is
 * a synchronous spawn on the admission path.
 */
export const PID1_VERSION_TTL_MS = 30_000;

/** Per binary: the last release read and when. A failed read is never remembered. */
const pid1Versions = new Map<string, { readonly version: number; readonly at: number }>();

/**
 * PID 1's release (`systemctl show -p Version --value`), re-read once the last reading is
 * older than PID1_VERSION_TTL_MS — so a host upgraded and re-executed under the daemon is seen
 * within that bound, without a restart. `now` is the gate's clock seam.
 */
export function pid1VersionVia(bin: string, now: () => number = Date.now): () => number | null {
  return () => {
    const known = pid1Versions.get(bin);
    if (known !== undefined && now() - known.at < PID1_VERSION_TTL_MS) return known.version;
    const result = spawnSync(bin, ['--no-pager', 'show', '-p', 'Version', '--value'], { encoding: 'utf8', timeout: 5_000 });
    const match = result.status === 0 ? /^(\d+)/.exec(String(result.stdout).trim()) : null;
    if (!match) {
      pid1Versions.delete(bin);
      return null;
    }
    const version = Number(match[1]);
    pid1Versions.set(bin, { version, at: now() });
    return version;
  };
}

/**
 * EVERY account (or group) the host enumerates — `getent passwd` / `getent group` — as name
 * and numeric id; null when it cannot be enumerated. Asked on EVERY run, never cached, for the
 * same reason `resolveAgentIdentity` is: a uid another account shares is two principals.
 */
async function getentList(database: 'passwd' | 'group'): Promise<Array<{ name: string; id: number; gid: number }> | null> {
  const bin = GETENT_BIN();
  if (!bin) return null;
  const result = await runQuiet(bin, [database], 64 * 1024 * 1024);
  if (result.code !== 0) return null;
  return parseGetentList(database, result.stdout);
}

/**
 * `getent passwd` / `group` text → name, id and (passwd) the PRIMARY gid, field 4. A passwd line
 * without a numeric field 4 is refused as a whole enumeration (null): an account whose primary
 * group cannot be read cannot be proved outside every private group. (`gid` is the id itself
 * for a group line, and unused.) Exported for its gate.
 */
export function parseGetentList(database: 'passwd' | 'group', text: string): Array<{ name: string; id: number; gid: number }> | null {
  const out: Array<{ name: string; id: number; gid: number }> = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const [name, , id, gid] = line.split(':');
    if (!name || !/^\d+$/.test(id ?? '')) continue;
    if (database === 'passwd') {
      if (!/^\d+$/.test(gid ?? '')) return null;
      out.push({ name, id: Number(id), gid: Number(gid) });
    } else {
      out.push({ name, id: Number(id), gid: Number(id) });
    }
  }
  return out;
}

/** The real host facts for one `systemctl` binary. */
export function hostFacts(systemctlBin: string): HostFacts {
  return Object.freeze({
    runtimePrefix: RUNTIME_PREFIX,
    readNetns: readHostNetns,
    stat: (path: string): FileFacts => {
      const facts = statSync(path);
      return { uid: facts.uid, gid: facts.gid, mode: facts.mode };
    },
    pid1Version: pid1VersionVia(systemctlBin),
    systemctl: systemctlVia(systemctlBin),
    listAccounts: () => getentList('passwd'),
    listGroups: () => getentList('group'),
    connect: (path: string) =>
      new Promise<Socket>((resolveSocket, reject) => {
        const socket = netConnect(path);
        socket.once('connect', () => resolveSocket(socket));
        socket.once('error', reject);
      }),
    resolveAgent: resolveAgentIdentity,
    groupMembers: async (name: string) => (await getentGroup(name))?.members ?? null,
    groupGid: async (name: string) => (await getentGroup(name))?.gid ?? null,
    ownGroups: () => (typeof process.getgroups === 'function' ? process.getgroups() : []),
    provisionerUid: 0,
  });
}

/** The real host facts for the default `systemctl`. */
export const HOST_FACTS: HostFacts = hostFacts('/usr/bin/systemctl');

/** This daemon's own user and primary group names, read once. */
let selfNames: { user: string; group: string } | null = null;
function ownNames(): { user: string; group: string } {
  if (selfNames) return selfNames;
  const user = userInfo().username;
  const bin = ID_BIN();
  const group = bin ? String(spawnSync(bin, ['-gn'], { encoding: 'utf8', timeout: 5_000 }).stdout ?? '').trim() : '';
  selfNames = { user, group: group || user };
  return selfNames;
}

/** The policy this daemon is running under, read from the one configuration path. */
export function policyFromConfig(): ConfinementPolicy {
  const self = config.AGENT_CONFINEMENT === 'systemd_scope' ? ownNames() : { user: '', group: '' };
  return {
    mode: config.AGENT_CONFINEMENT,
    instance: config.DEDALO_SITE_INSTANCE,
    identities: config.AGENT_IDENTITIES,
    unitPrefix: config.AGENT_UNIT_PREFIX,
    systemctlBin: config.SYSTEMCTL_BIN,
    agentSocketDir: config.AGENT_SOCKET_DIR,
    agentStateRoot: config.AGENT_STATE_ROOT,
    identityEpoch: config.AGENT_IDENTITY_EPOCH,
    serviceUser: self.user,
    instanceGroup: self.group,
    listenSocket: config.LISTEN_SOCKET,
    listenKind: config.LISTEN_KIND,
    egressFacts: {
      driver: config.AGENT_DRIVER,
      providerHosts: parseHostList(config.AGENT_PROVIDER_HOSTS),
      registryHosts: parseHostList(config.BUILD_REGISTRY_HOSTS),
    },
    unitExec: {
      runtime: process.execPath,
      shim: SHIM_PATH,
      maskedPrefixes: UNIT_MASKED_PREFIXES,
      agentClis: config.CLAUDE_CODE_BIN ? { claude_code: config.CLAUDE_CODE_BIN } : {},
    },
    doorTimeoutsMs: {
      turn: config.SESSION_TURN_TIMEOUT_MS,
      build: Math.max(config.INSTALL_TIMEOUT_MS, config.BUILD_TIMEOUT_MS),
      git: config.GIT_TIMEOUT_MS,
    },
    memoryMax: config.AGENT_TURN_MEMORY_MAX,
    cpuQuota: config.AGENT_TURN_CPU_QUOTA,
    tasksMax: config.AGENT_TURN_TASKS_MAX,
    host: hostFacts(config.SYSTEMCTL_BIN),
  };
}

/** The policy's identities as a Map, whichever shape it was stated in. */
export function identitiesOf(policy: ConfinementPolicy): ReadonlyMap<string, number> {
  const identities = policy.identities;
  if (identities instanceof Map) return identities;
  return new Map(Object.entries((identities ?? {}) as Record<string, number>));
}

function timingOf(policy: ConfinementPolicy): ConfinementTiming {
  return { ...DEFAULT_TIMING, ...(policy.timing ?? {}) };
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Can this host run a confined run at all?
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * IS A CONFINED RUN THROUGH THIS DOOR POSSIBLE ON THIS HOST, RIGHT NOW?
 *
 * Called by the session manager and the builder BEFORE they reserve a workspace, so a host
 * that cannot confine answers 503 to the request instead of accepting work and failing it
 * asynchronously. The run asks the same questions again when it opens — this is the courtesy,
 * that is the guarantee.
 */
export async function assertConfinementAvailable(
  door: ConfinementDoor,
  policy: ConfinementPolicy = policyFromConfig(),
  driver?: DriverId,
  /**
   * The site the run would be — its OWN questions (an identity? quarantined?) are asked here
   * too, before the caller reserves anything: a site that cannot run answers the request 503
   * instead of being accepted and failing asynchronously.
   */
  slug?: string,
): Promise<void> {
  if (policy.mode === 'none') return;
  // The host first (can it confine at all?), then this site (can IT run?).
  const problems = await confinementProblems(policy, door, driver);
  if (problems.length > 0) throw new ConfinementUnavailableError(problems.join(' '));
  if (slug !== undefined) admissibleOrdinal(policy, slug, door);
}

/**
 * THE SITE'S OWN ADMISSION: its identity's ordinal, or a typed refusal — no identity
 * (`identity_missing`: there is no fallback uid, ever) or a quarantined one
 * (`identity_quarantined`: a run of it outlived its connection). Asked by the admission check
 * above and again when the run opens; the answers cannot differ in kind, only in time.
 */
function admissibleOrdinal(policy: ConfinementPolicy, slug: string, door: ConfinementDoor): number {
  const k = identitiesOf(policy).get(slug);
  if (k === undefined) {
    throw new ConfinementRefusedError(
      'identity_missing',
      `site '${slug}' has no agent identity (AGENT_IDENTITIES) on this host, so there is no uid its ${door} run ` +
        `could be — and there is no fallback. Run provision apply (it creates one identity per declared site). ` +
        `Nothing was started.`,
    );
  }
  const quarantined = leaseOf(policy).quarantined.get(k);
  if (quarantined) {
    throw new ConfinementRefusedError(
      'identity_quarantined',
      `site '${slug}' (identity s${k}) is quarantined: ${quarantined.reason}. Nothing was opened.`,
    );
  }
  return k;
}

/** Is `path` equal to or under `prefix`? */
function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** The permission triple `who` gets on a file: owner, group (any of its groups) or other. */
function bitsFor(file: FileFacts, who: AgentIdentity): number {
  if (file.uid === who.uid) return (file.mode >> 6) & 0o7;
  if (who.gids.includes(file.gid) || who.gid === file.gid) return (file.mode >> 3) & 0o7;
  return file.mode & 0o7;
}

interface NamedIdentity {
  readonly name: string;
  readonly identity: AgentIdentity;
}

/**
 * Why a file a unit executes cannot be trusted to be what this daemon shipped, or null.
 *
 * THE TRUST RULE: the file must be changeable by NO site identity — neither owned by one, nor
 * group/world-writable, nor inside a directory one can write (it could rename a replacement
 * over it) — and every identity must be able to use it (`need`: read the shim, execute the
 * runtime). Asked of EVERY identity, never the first: the unit of site 2 executes the same shim
 * as site 1's. Root, this daemon's uid and a third uid (the engine's, which owns the checkout)
 * are all acceptable owners: what makes a file untrustworthy is that a principal being confined
 * can change it.
 */
function executableProblem(
  label: string,
  path: string,
  need: 'read' | 'execute',
  policy: ConfinementPolicy,
  identities: readonly NamedIdentity[],
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
  const masked = maskedPrefixes.find(prefix => under(path, prefix) || under(real, prefix));
  if (masked) {
    return (
      `${label} ('${path}') is under ${masked}, which the unit masks (ProtectHome=, ` +
      `PrivateTmp=, the /run mask): the unit's ExecStart would not exist inside it. Install ` +
      `the site builder and its runtime outside ${UNIT_MASKED_PREFIXES.join(', ')}.`
    );
  }
  if ((file.mode & 0o022) !== 0) {
    return (
      `${label} ('${real}') is group- or world-writable: anything that can write it can ` +
      `replace what every confined unit runs before its namespace is proved.`
    );
  }
  for (const { name, identity } of identities) {
    const who = `the site identity '${name}' (uid ${identity.uid})`;
    if (file.uid === identity.uid) {
      return `${label} ('${real}') is owned by ${who} — a confined principal must never own what a unit executes first.`;
    }
    if ((bitsFor(file, identity) & (need === 'read' ? 0o4 : 0o1)) === 0) {
      return (
        `${label} ('${real}') cannot be ${need === 'read' ? 'read' : 'executed'} by ${who} ` +
        `(mode ${(file.mode & 0o777).toString(8)}, owner ${file.uid}, group ${file.gid}) — the unit runs AS ` +
        `that identity, so every run would fail at its first exec.`
      );
    }
    for (let dir = dirname(real); ; dir = dirname(dir)) {
      let parent: FileFacts;
      try {
        parent = policy.host.stat(dir);
      } catch {
        return `${label}: its directory '${dir}' cannot be examined.`;
      }
      // A directory the identity OWNS is writable whatever its mode says today (its owner can
      // chmod it back), and the owner of a sticky directory may rename anything inside it.
      const owned = parent.uid === identity.uid;
      const writable = owned || (bitsFor(parent, identity) & 0o2) !== 0;
      const sticky = (parent.mode & 0o1000) !== 0 && !owned;
      if (writable && !sticky) {
        return (
          `${label} ('${real}') lies under '${dir}', which ${who} can write: it could rename its ` +
          `own file over what every site's unit executes first.`
        );
      }
      // …and every directory on the way must be SEARCHABLE by it: the file's own bits say
      // nothing about reaching it, and a 0750 directory of another group makes every run
      // fail at its first exec (203/EXEC, or the shim's 127) after the gate opened — nameless.
      if ((bitsFor(parent, identity) & 0o1) === 0) {
        return (
          `${label} ('${real}') lies under '${dir}', which ${who} cannot search (mode ` +
          `${(parent.mode & 0o7777).toString(8)}, owner ${parent.uid}, group ${parent.gid}) — the unit runs AS that ` +
          `identity, so it could never reach it. Make the directory traversable (o+x) or install it elsewhere.`
        );
      }
      if (dir === dirname(dir)) break;
    }
  }
  return null;
}

/** Every reason this host cannot run a confined unit through `door`, in the order an operator fixes them. */
export async function confinementProblems(policy: ConfinementPolicy, door: ConfinementDoor, driver?: DriverId): Promise<string[]> {
  const problems: string[] = [];
  const version = policy.host.pid1Version();
  if (version === null) {
    problems.push(
      `PID 1's systemd release cannot be read (systemctl show -p Version), so it is unknown whether ` +
        `the root-rendered agent units carry every property this daemon relies on; a confined unit ` +
        `REQUIRES systemd ${SYSTEMD_FLOOR} or newer.`,
    );
  } else if (version < SYSTEMD_FLOOR) {
    problems.push(floorRefusal(version));
  }
  if (!UNIT_PREFIX_PATTERN.test(policy.unitPrefix)) {
    problems.push(
      `AGENT_UNIT_PREFIX ('${policy.unitPrefix}') does not match ${UNIT_PREFIX_PATTERN.source}: every ` +
        `agent unit and the polkit rule are named from it.`,
    );
  }
  if (!isAbsolute(policy.systemctlBin ?? '') || !existsSync(policy.systemctlBin)) {
    problems.push(
      `SYSTEMCTL_BIN ('${policy.systemctlBin}') is not an absolute path to a file that exists: the ` +
        `daemon cannot ask PID 1 whether a run is alive, nor stop one. On a provisioned host declare ` +
        `agent.systemctl_bin in the instance declaration and run provision apply (a hand edit to the ` +
        `rendered env is reverted by the next apply).`,
    );
  }
  for (const [key, value] of [
    ['AGENT_SOCKET_DIR', policy.agentSocketDir],
    ['AGENT_STATE_ROOT', policy.agentStateRoot],
  ] as const) {
    if (!value || !isAbsolute(value)) {
      problems.push(`${key} ('${String(value ?? '')}') is not an absolute path — provision apply renders it.`);
    }
  }
  if (policy.listenKind !== 'unix') {
    problems.push(
      `LISTEN_KIND is '${policy.listenKind}', so this daemon has no runtime directory for the sites' ` +
        `egress gates — which must live under ${RUNTIME_PREFIX}, the mask every unit applies.`,
    );
  }
  problems.push(...runtimeDirProblems(policy));

  // THE IDENTITIES: every declared site's, resolved and PROVED — never a fallback uid.
  const identities = identitiesOf(policy);
  if (identities.size === 0) {
    problems.push(
      `AGENT_IDENTITIES declares no site identity: there is no uid any site's run could be, and ` +
        `running it as this daemon (or a shared agent) is the disclosure this exists to prevent. ` +
        `Run provision apply, which creates one identity per declared site and renders the key.`,
    );
  }
  const resolved: NamedIdentity[] = [];
  const ownUid = typeof process.getuid === 'function' ? process.getuid() : -1;
  const ownGroups = new Set(policy.host.ownGroups());
  const uids = new Map<number, string>();
  const privateGids: Array<{ name: string; gid: number | null }> = [];
  // EVERY HOST QUESTION AT ONCE, then judged in order: the answers are the host as it is NOW
  // (asked on every run, never remembered), and asking them concurrently keeps a museum with
  // many sites from paying one NSS round-trip per question per identity in sequence.
  const ordered = [...identities.entries()].sort((a, b) => a[1] - b[1]);
  const named = ordered.map(([slug, k]) => {
    try {
      return { slug, k, name: agentIdentityName(policy.instance, k), error: null as string | null };
    } catch (error) {
      return { slug, k, name: '', error: (error as Error).message };
    }
  });
  const [instanceGid, answers, accountsList, groupsList] = await Promise.all([
    policy.host.groupGid(policy.instanceGroup),
    Promise.all(
      named.map(async entry => {
        if (entry.error !== null) return null;
        const [identity, privateGid, members] = await Promise.all([
          policy.host.resolveAgent(entry.name),
          policy.host.groupGid(entry.name),
          policy.host.groupMembers(entry.name),
        ]);
        return { identity, privateGid, members };
      }),
    ),
    ordered.length > 0 ? policy.host.listAccounts() : null,
    ordered.length > 0 ? policy.host.listGroups() : null,
  ]);
  for (const [index, { slug, k, name, error }] of named.entries()) {
    if (error !== null) {
      problems.push(`AGENT_IDENTITIES: site '${slug}' → ${String(k)}: ${error}`);
      continue;
    }
    const answer = answers[index] as { identity: AgentIdentity | null; privateGid: number | null; members: readonly string[] | null };
    const identity = answer.identity;
    if (!identity) {
      problems.push(`the identity '${name}' of site '${slug}' does not exist on this host (id). Run provision apply.`);
      continue;
    }
    if (identity.uid === 0 || identity.uid === ownUid) {
      problems.push(`the identity '${name}' of site '${slug}' has uid ${identity.uid} — root's or this daemon's own.`);
      continue;
    }
    const twin = uids.get(identity.uid);
    if (twin !== undefined) problems.push(`the identities '${twin}' and '${name}' share uid ${identity.uid}.`);
    uids.set(identity.uid, name);
    if (instanceGid === null || identity.gid !== instanceGid) {
      problems.push(
        `the identity '${name}' has primary gid ${identity.gid}, not the instance group '${policy.instanceGroup}'` +
          `${instanceGid === null ? ' (which this host does not resolve)' : ` (${instanceGid})`}.`,
      );
    }
    const privateGid = answer.privateGid;
    if (privateGid === null || !identity.gids.includes(privateGid)) {
      problems.push(`the identity '${name}' is not in its private group '${name}'. Run provision apply.`);
    }
    // EXACTLY {instance group, private group} — a set, not a superset. PID 1 applies initgroups
    // under User=, so every group the identity holds rides into every run of the site: `adm` /
    // `systemd-journal` (the host journal), `shadow`, another museum's instance group (its 2770
    // drafts — ProtectSystem=strict makes paths read-only, it does not hide them). `id -G` asks
    // NSS by name, so this holds where enumeration (`getent group`) is off.
    const extraGids = [...new Set(identity.gids)].filter(gid => gid !== instanceGid && gid !== privateGid);
    if (extraGids.length > 0) {
      problems.push(
        `the identity '${name}' is also in group(s) ${extraGids.join(', ')} — beyond its instance group and its ` +
          `private group, and a run carries every group of its identity. Remove the membership (gpasswd -d ${name} <group>).`,
      );
    }
    const members = answer.members;
    const expected = [policy.serviceUser, name].sort();
    if (!members || [...members].sort().join(',') !== expected.join(',')) {
      problems.push(
        `the private group '${name}' must hold exactly '${policy.serviceUser}' and '${name}', and holds ` +
          `${members ? `[${members.join(', ')}]` : 'nothing (it does not exist)'}.`,
      );
    }
    if (privateGid !== null && !ownGroups.has(privateGid)) {
      problems.push(
        `this daemon is not (yet) in the private group '${name}' (gid ${privateGid}): restart the daemon after ` +
          `provision apply — a process's groups are read once, at start.`,
      );
    }
    resolved.push({ name, identity });
    privateGids.push({ name, gid: privateGid });
  }
  problems.push(...hostWideProblems(policy, resolved, privateGids, accountsList, groupsList));
  const shimDir = dirname(policy.unitExec.shim);
  for (const [label, path, need] of [
    ['the unit runtime (this daemon’s bun)', policy.unitExec.runtime, 'execute'],
    ['the egress shim', policy.unitExec.shim, 'read'],
    ['the egress shim’s network profile', join(shimDir, 'network_profile.ts'), 'read'],
    ['the egress shim’s frame codec', join(shimDir, 'unit_frames.ts'), 'read'],
    ['the egress shim’s identity names', join(shimDir, 'agent_identity.ts'), 'read'],
    ['the unit property table', join(shimDir, 'unit_properties.ts'), 'read'],
  ] as const) {
    const problem = executableProblem(label, path, need, policy, resolved);
    if (problem) problems.push(problem);
  }
  // THE TURN'S CLI — the next thing its unit executes, as every identity: the run's driver's at
  // admission, every configured one at boot (no driver: the sites may differ).
  if (door === 'turn') {
    const clis = Object.entries(policy.unitExec.agentClis ?? {}).filter(
      ([id, bin]) => typeof bin === 'string' && bin !== '' && (driver === undefined || id === driver),
    );
    for (const [id, bin] of clis) {
      const key = id === 'claude_code' ? 'CLAUDE_CODE_BIN' : `the ${id} binary`;
      const problem = executableProblem(`the ${id} CLI (${key})`, bin as string, 'execute', policy, resolved);
      if (problem) problems.push(problem);
    }
  }
  // THE STOP GRANT, PROVED: without it no run can be interrupted or timed out (a run whose
  // shim ignores EOF holds its site quarantined until RuntimeMaxSec), and the boot reconcile
  // cannot clean a crash's leftover — so it is asked before any run starts, never discovered at
  // the first interrupt. One declared site's probe stands for all: the rule grants them together.
  const firstDeclared = ordered[0]?.[1];
  if (firstDeclared !== undefined && UNIT_PREFIX_PATTERN.test(policy.unitPrefix)) {
    const problem = await stopGrantProblem(policy, firstDeclared);
    if (problem) problems.push(problem);
  }
  try {
    policy.host.readNetns();
  } catch {
    problems.push(
      `this daemon cannot read its own network namespace identity (/proc/self/ns/net), so a unit's shim ` +
        `could not prove it is in a DIFFERENT one. A confined unit needs Linux /proc.`,
    );
  }
  // The plan only when the run's driver is known (a turn's provider host is the driver's), or on
  // a door whose plan does not depend on one.
  if (driver !== undefined || door !== 'turn') {
    problems.push(...planProblems(door, egressFactsFor(policy, driver)));
  }
  return problems;
}

/**
 * EVERY REASON THIS HOST CANNOT CONFINE A RUN, ASKED AT BOOT — the union over the doors (a turn's
 * provider plan is the per-run question: it depends on the site's driver). Empty under `none`.
 * Never cached: each run asks `confinementProblems` again and refuses; this only SAYS it before
 * the first request (`src/boot.ts` step 1c), so a misprovisioned host — a site added and the env
 * hand-edited without a restart, a group membership the daemon has not picked up — is a boot line
 * instead of a host that boots green and fails every run.
 */
export async function bootConfinementProblems(policy: ConfinementPolicy = policyFromConfig()): Promise<string[]> {
  if (policy.mode !== 'systemd_scope') return [];
  const out: string[] = [];
  for (const door of DOORS) {
    for (const problem of await confinementProblems(policy, door)) if (!out.includes(problem)) out.push(problem);
  }
  return out;
}

/**
 * NO OTHER PRINCIPAL SHARES A SITE'S UID OR ITS PRIVATE GROUP — host-wide, not only among this
 * instance's identities. A uid another account holds (another museum's identity after a merged
 * or restored /etc/passwd, an NSS/LDAP entry, `usermod -o -u`, `nobody`) is ONE principal to the
 * kernel: its processes read each other's /proc/<pid>/environ and cwd, and on 248–256 (no
 * PrivatePIDs) can ptrace each other. A private gid another group holds opens the site's gate
 * sockets (0660) to that group's members. Enumerated on EVERY run (PID 1 resolves `User=` when
 * it starts the unit); a host that cannot be enumerated is refused, never assumed clean.
 *
 * HONEST LIMIT: an ENUMERATION sees only the NSS sources that enumerate. An entry held only in
 * one that does not (sssd's default `enumerate = false`, most LDAP setups) is invisible here, and
 * a by-id lookup would not prove uniqueness either (it answers the first source's entry — the
 * identity itself). The identity's own GROUP SET is the exception: `id -G <name>` resolves by
 * name through every source, and confinementProblems refuses anything beyond {instance, private}.
 */
function hostWideProblems(
  policy: ConfinementPolicy,
  resolved: readonly NamedIdentity[],
  privateGids: ReadonlyArray<{ name: string; gid: number | null }>,
  accounts: ReadonlyArray<{ readonly name: string; readonly id: number; readonly gid: number }> | null,
  groups: ReadonlyArray<{ readonly name: string; readonly id: number }> | null,
): string[] {
  if (resolved.length === 0) return [];
  if (accounts === null || groups === null) {
    return [
      `this host's ${accounts === null ? 'account' : 'group'} database cannot be enumerated (getent ` +
        `${accounts === null ? 'passwd' : 'group'}), so it cannot be proved that no other principal shares a ` +
        `site identity's uid or private group.`,
    ];
  }
  const problems: string[] = [];
  for (const { name, identity } of resolved) {
    const holders = accounts.filter(account => account.id === identity.uid && account.name !== name).map(account => `'${account.name}'`);
    if (holders.length > 0) {
      problems.push(
        `the identity '${name}' has uid ${identity.uid}, which ${holders.join(', ')} also hold${holders.length === 1 ? 's' : ''}: ` +
          `to the kernel that is one principal (each could read the other's /proc/<pid>/environ and workspace). ` +
          `Give the identity a uid of its own (provision apply refuses the same ledger).`,
      );
    }
  }
  for (const { name, gid } of privateGids) {
    if (gid === null) continue;
    const sharing = groups.filter(group => group.id === gid && group.name !== name).map(group => `'${group.name}'`);
    if (sharing.length > 0) {
      problems.push(
        `the private group '${name}' has gid ${gid}, which ${sharing.join(', ')} also ha${sharing.length === 1 ? 's' : 've'}: ` +
          `its members would open this site's egress sockets.`,
      );
    }
    // THE MEMBERSHIP `getent group` NEVER LISTS: an account whose PRIMARY gid is this private
    // group's (a restored passwd line, an LDAP gidNumber) is in it to the kernel — it traverses the
    // 0770 egress directory and connects to the 0660 gate sockets, mcp.sock carrying the museum's
    // Publication API key. Only the site's identity and this daemon's user may be members.
    const primaries = accounts
      .filter(account => account.gid === gid && account.name !== name && account.name !== policy.serviceUser)
      .map(account => `'${account.name}'`);
    if (primaries.length > 0) {
      problems.push(
        `the private group '${name}' (gid ${gid}) is the PRIMARY group of ${primaries.join(', ')} — a membership no ` +
          `group line lists, which would open this site's egress sockets. Give ${primaries.length === 1 ? 'that account' : 'those accounts'} ` +
          `a primary group of ${primaries.length === 1 ? 'its' : 'their'} own (provision apply refuses the same ledger).`,
      );
    }
  }
  return problems;
}

/**
 * Why the daemon's socket or the sites' gate directories cannot be hidden from every unit:
 * both must be under RUNTIME_PREFIX (the `/run` every unit masks), and the gates' `egress/`
 * (under AGENT_SOCKET_DIR, root's) must be bindable (BindReadOnlyPaths= grammar).
 */
function runtimeDirProblems(policy: ConfinementPolicy): string[] {
  const runtimeDir = dirname(policy.listenSocket);
  const problems: string[] = [];
  const egressBase = join(policy.agentSocketDir, 'egress');
  const grammar = bindablePathProblem(egressBase);
  if (grammar) problems.push(`AGENT_SOCKET_DIR's egress directory: ${grammar}.`);
  const resolvePath = (path: string) => {
    try {
      return realpathSync(path);
    } catch {
      return path;
    }
  };
  const prefix = policy.host.runtimePrefix;
  for (const [label, path, holds] of [
    ['LISTEN_SOCKET', policy.listenSocket, `this daemon's socket`],
    ['AGENT_SOCKET_DIR', policy.agentSocketDir, `every site's door sockets and egress gates`],
  ] as const) {
    const real = resolvePath(label === 'LISTEN_SOCKET' ? runtimeDir : path);
    if (!under(real, prefix) && !under(real, resolvePath(prefix))) {
      problems.push(
        `${label} ('${path}') is not under ${prefix}. It holds ${holds}, and ${prefix} is the mask that hides ` +
          `them from every unit. A provisioned instance renders them under /run.`,
      );
    }
  }
  return problems;
}

/** The policy's egress facts, with the run's own driver when the caller knows it. */
function egressFactsFor(policy: ConfinementPolicy, driver: DriverId | undefined): EgressFacts {
  return driver ? { ...policy.egressFacts, driver } : policy.egressFacts;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * PID 1's state — the one authority on whether a run is alive
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * `systemctl show` text → property map, with a REPEATED key ACCUMULATED (space-joined), never
 * last-wins. `systemctl show` prints a struct-array property ONE LINE PER ENTRY
 * (systemctl-show.c: `TemporaryFileSystem=`, `BindPaths=`, `BindReadOnlyPaths=`, each
 * `ExecStart=` command) and a string array on one line; both spellings parse to the same set.
 * Last-wins kept only the final entry: every agent unit's four tmpfs entries read as one, and
 * every confined run of a real 252/255 host would have been refused `TemporaryFileSystem` — and
 * a second `ExecStart=` record would have been read as the only one.
 */
export function parseShow(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq);
    const value = line.slice(eq + 1);
    const before = out[key];
    out[key] = before === undefined || before === '' ? value : value === '' ? before : `${before} ${value}`;
  }
  return out;
}

async function show(policy: ConfinementPolicy, unit: string, properties?: readonly string[]): Promise<Record<string, string> | null> {
  const args = properties ? ['show', '-p', properties.join(','), unit] : ['show', unit];
  try {
    const answer = await policy.host.systemctl(args);
    return answer.code === 0 ? parseShow(answer.stdout) : null;
  } catch {
    return null;
  }
}

/** The socket's live connection count; null when PID 1 cannot say (never read as zero). */
async function connectionsOf(policy: ConfinementPolicy, k: number, door: ConfinementDoor): Promise<number | null> {
  const answer = await show(policy, agentUnitNames(policy.unitPrefix, k, door).socket, ['NConnections']);
  const value = answer?.NConnections;
  return value !== undefined && /^\d+$/.test(value) ? Number(value) : null;
}

/**
 * Instances of site k (any door) PID 1 still counts as alive — and any PRE-LEAD-1b transient
 * run of this museum (`<prefix><uuid>.service`, the shared agent's, not bound to this daemon):
 * one of those may be writing any site's workspace, so while one lives no site is idle. It is
 * not this daemon's to stop (the rule grants no such name); the migration stops them as root,
 * and a leftover keeps every site quarantined until PID 1 reports it gone. Null = cannot say.
 */
async function liveInstancesOf(policy: ConfinementPolicy, k: number): Promise<string[] | null> {
  let answer: SystemctlAnswer;
  try {
    answer = await policy.host.systemctl([
      'list-units',
      '--all',
      '--plain',
      '--no-legend',
      `${policy.unitPrefix}s${k}-*@*.service`,
      legacyTransientUnitGlob(policy.unitPrefix),
    ]);
  } catch {
    return null;
  }
  if (answer.code !== 0) return null;
  const legacy = legacyTransientUnitRegex(policy.unitPrefix);
  const live: string[] = [];
  for (const line of answer.stdout.split('\n')) {
    const [unit, , active] = line.trim().split(/\s+/);
    if (!unit) continue;
    if (!legacy.test(unit) && !DOORS.some(door => agentUnitNames(policy.unitPrefix, k, door).instanceRegex.test(unit))) continue;
    if (active && active !== 'inactive' && active !== 'failed') {
      live.push(unit);
      continue;
    }
    // Listed DEAD — and PID 1 still lists it: a dead unit whose cgroup still holds a process
    // is never garbage-collected. Dead means EMPTY, asked of PID 1, never inferred.
    if (!(await cgroupEmpty(policy, unit))) live.push(unit);
  }
  return live;
}

/**
 * IS THE UNIT'S CGROUP EMPTY? A unit PID 1 reports `inactive`/`failed` has stopped being a
 * SERVICE; whether its PROCESSES are gone is another question. They are not when the stop
 * skipped SIGKILL (`SendSIGKILL=no`, a catchable `FinalKillSignal=` — a drop-in conformance
 * refuses, but a run already started under one is not undone by refusing the next): PID 1 then
 * marks the unit failed, releases `MaxConnections=`, and the run's processes keep running as
 * the site's uid. So death is `TasksCurrent` 0 or `[not set]` (no cgroup at all) — anything
 * else, an unreadable answer included, is a run still alive.
 */
async function cgroupEmpty(policy: ConfinementPolicy, unit: string): Promise<boolean> {
  const answer = await show(policy, unit, ['TasksCurrent']);
  return tasksGone(answer?.TasksCurrent);
}

/** `TasksCurrent` as `systemctl show` prints it: 0, or `[not set]` once the cgroup is gone. */
function tasksGone(value: string | undefined): boolean {
  return value === '0' || value === '[not set]';
}

/** Is site k idle — no live instance, no socket counting a connection? null = cannot say. */
async function idleState(policy: ConfinementPolicy, k: number): Promise<{ idle: boolean; live: string[]; why: string }> {
  const live = await liveInstancesOf(policy, k);
  if (live === null) return { idle: false, live: [], why: 'PID 1 could not list its units' };
  const busy: string[] = [];
  for (const door of DOORS) {
    const count = await connectionsOf(policy, k, door);
    if (count === null) return { idle: false, live, why: `PID 1 could not report ${door}'s socket` };
    if (count > 0) busy.push(`${door} (${count} connection${count === 1 ? '' : 's'})`);
  }
  if (live.length === 0 && busy.length === 0) return { idle: true, live, why: '' };
  return {
    idle: false,
    live,
    why: [live.length > 0 ? `live: ${live.join(', ')}` : '', busy.length > 0 ? `busy sockets: ${busy.join(', ')}` : '']
      .filter(Boolean)
      .join('; '),
  };
}

/** How long a PROVED stop grant is believed before it is asked again (a refusal never is). */
export const STOP_GRANT_TTL_MS = 30_000;

/** Per (systemctl, probe unit): when the grant was last proved. */
const stopGrants = new Map<string, number>();

/**
 * The instance the grant probe stops: `<prefix>s<k>-git@0-0-0.service` — inside the rule's
 * grammar (render/agent_authorization.ts), never a real run (PID 1 names an accepted connection
 * after its peer's pid and uid, and no peer is pid 0, uid 0), so the stop is a no-op job on a
 * unit that is not running: it exercises exactly polkit's manage-units check with verb=stop.
 */
export function stopGrantProbeUnit(prefix: string, k: number): string {
  return `${agentUnitNames(prefix, k, 'git').instanceStem}0-0-0.service`;
}

/**
 * THE POLKIT STOP GRANT, ASKED OF PID 1 — the plan's `pkaction --version` proves only that a
 * polkit able to read the rule is installed, not that the rule is there or polkitd answers. A
 * granted answer is believed for STOP_GRANT_TTL_MS; a refusal is never remembered. null = proved.
 */
export async function stopGrantProblem(policy: ConfinementPolicy, k: number, now: () => number = Date.now): Promise<string | null> {
  const unit = stopGrantProbeUnit(policy.unitPrefix, k);
  const key = `${policy.systemctlBin}\u0000${unit}`;
  const proved = stopGrants.get(key);
  if (proved !== undefined && now() - proved < STOP_GRANT_TTL_MS) return null;
  let answer: SystemctlAnswer;
  try {
    answer = await policy.host.systemctl(['stop', unit]);
  } catch (error) {
    return `PID 1 did not answer the stop-grant probe (systemctl stop ${unit}: ${String(error)}), so it is unknown whether this daemon may stop its sites' runs.`;
  }
  if (answer.code === 0) {
    stopGrants.set(key, now());
    return null;
  }
  const said = answer.stderr.trim() || answer.stdout.trim() || '(no message)';
  if (/access denied|not authorized|interactive authentication required/i.test(said)) {
    return (
      `the polkit rule that grants this daemon STOP on its sites' runs is absent or polkitd is not running: the probe ` +
      `'systemctl stop ${unit}' was denied (exit ${answer.code}: ${said}). Without it no run can be interrupted or timed ` +
      `out. Run provision apply (it renders /etc/polkit-1/rules.d/) and make sure polkitd is installed and running.`
    );
  }
  return `PID 1 refused the stop-grant probe 'systemctl stop ${unit}' (exit ${answer.code}: ${said}).`;
}

/**
 * ASK PID 1 TO STOP `unit` — and KEEP its answer. null when PID 1 accepted the stop; otherwise
 * what it said, for the quarantine reason and the log.
 *
 * The answer used to be thrown away, so a stop the polkit grant did not cover (the rule file
 * deleted, polkitd masked or crashed, a host where `pkaction` exists and no polkitd runs) was
 * DENIED on every call while the only symptom was an unexplained `identity_quarantined` — "still
 * alive after it was asked to stop" — for as long as RuntimeMaxSec let the unit live. A refused
 * stop is now named where the operator reads: the refusal, the quarantine, the log.
 */
async function stopUnit(policy: ConfinementPolicy, unit: string): Promise<string | null> {
  let answer: SystemctlAnswer;
  try {
    answer = await policy.host.systemctl(['stop', unit]);
  } catch (error) {
    // Unanswered is not a pass: the caller re-probes, and a unit still alive quarantines.
    const refusal = `the stop of ${unit} got no answer from PID 1 (${String(error)})`;
    console.error(`[confinement] ${refusal}`);
    return refusal;
  }
  if (answer.code === 0) return null;
  const said = answer.stderr.trim() || answer.stdout.trim() || '(no message)';
  const authorization = /access denied|not authorized|interactive authentication required/i.test(said)
    ? ` — is the polkit rule provision apply renders (/etc/polkit-1/rules.d/) present and polkitd running? It is what grants this daemon STOP on its sites' runs`
    : '';
  const refusal = `the stop of ${unit} was REFUSED by PID 1 (exit ${answer.code}: ${said})${authorization}`;
  console.error(`[confinement] ${refusal}`);
  return refusal;
}

const sleep = (ms: number) => new Promise<void>(resolveSleep => setTimeout(resolveSleep, ms));

/* ────────────────────────────────────────────────────────────────────────────────────
 * The lease: one run per site, freed only on proven death
 * ──────────────────────────────────────────────────────────────────────────────────── */

interface LeaseState {
  /** Slugs with a run open. */
  readonly runs: Set<string>;
  /** Quarantined ordinals → the slug whose run slot the quarantine still holds (if any). */
  readonly quarantined: Map<number, { reason: string; heldSlug: string | null; timer: ReturnType<typeof setInterval> | null }>;
  /** The daemon is shutting down: no run opens any more (`stopOpeningRuns`). */
  stopping: boolean;
}

/** Keyed by the socket directory — one per host in production, one per stand-in in a gate. */
const leases = new Map<string, LeaseState>();

function leaseOf(policy: ConfinementPolicy): LeaseState {
  const key = policy.agentSocketDir || `(none):${policy.instance}`;
  let state = leases.get(key);
  if (!state) {
    state = { runs: new Set(), quarantined: new Map(), stopping: false };
    leases.set(key, state);
  }
  return state;
}

/**
 * THE LEASE, AS IT STANDS — read-only: which sites have a run open, and which identities are
 * quarantined (and whose run slot each quarantine still holds). What the gates assert the
 * "freed only on proven death" rule against directly, rather than through the next run's idle
 * proof (which would hide a release that came too early).
 */
export function leaseSnapshot(policy: ConfinementPolicy): {
  readonly runs: readonly string[];
  readonly quarantined: ReadonlyArray<{ readonly k: number; readonly heldSlug: string | null; readonly reason: string }>;
} {
  const state = leaseOf(policy);
  return Object.freeze({
    runs: Object.freeze([...state.runs].sort()),
    quarantined: Object.freeze(
      [...state.quarantined.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([k, entry]) => Object.freeze({ k, heldSlug: entry.heldSlug, reason: entry.reason })),
    ),
  });
}

/**
 * THE DAEMON IS STOPPING: from this instant no confined run opens. Called SYNCHRONOUSLY by the
 * shutdown (`src/boot.ts` shutdownSequence), before the drain.
 *
 * WHY. Every agent instance is `BindsTo=` the daemon unit, and a connect to a site's socket
 * makes PID 1 queue the instance's start — which pulls the daemon in, and a start job REPLACES
 * a stop job that is not irreversible. A turn that ends during the drain would otherwise commit
 * through the git socket, cancelling `systemctl stop` of the daemon (and provision apply's
 * quiesce with it) and starting the daemon again once it exits. A refused commit loses nothing:
 * the work stays in the tree, and the session is marked for the next boot's recovery commit
 * (`sessions/manager.ts`). Irreversible for the lease: a stopping daemon does not un-stop.
 */
export function stopOpeningRuns(policy: ConfinementPolicy): void {
  leaseOf(policy).stopping = true;
}

function refuseWhileStopping(lease: LeaseState, slug: string, door: ConfinementDoor): void {
  if (!lease.stopping) return;
  throw new ConfinementRefusedError(
    'daemon_stopping',
    `the daemon is shutting down, so the ${door} run of '${slug}' was not opened: a connect now would ask PID 1 to ` +
      `start the unit, and that start would cancel the daemon's own stop. Nothing was started; work left ` +
      `uncommitted is committed by the next start's recovery sweep.`,
  );
}

function slugOf(policy: ConfinementPolicy, k: number): string {
  for (const [slug, ordinal] of identitiesOf(policy)) if (ordinal === k) return slug;
  return `s${k}`;
}

/**
 * QUARANTINE site k's identity: nothing more is opened on it until PID 1 reports every one of
 * its runs dead. Lives only in memory and is always rebuilt from PID 1 (`reconcileAgentUnits`),
 * so a restart can neither lose one nor invent one. A background probe frees it.
 */
export function quarantine(policy: ConfinementPolicy, k: number, reason: string, heldSlug: string | null = null): void {
  const state = leaseOf(policy);
  const existing = state.quarantined.get(k);
  if (existing) {
    if (heldSlug && !existing.heldSlug) existing.heldSlug = heldSlug;
    return;
  }
  console.error(`[confinement] site ${slugOf(policy, k)} identity s${k} quarantined: ${reason}`);
  const entry: { reason: string; heldSlug: string | null; timer: ReturnType<typeof setInterval> | null } = {
    reason,
    heldSlug,
    timer: null,
  };
  state.quarantined.set(k, entry);
  let probing = false;
  entry.timer = setInterval(() => {
    if (probing) return;
    probing = true;
    void idleState(policy, k)
      .then(({ idle }) => {
        if (!idle) return;
        if (entry.timer) clearInterval(entry.timer);
        state.quarantined.delete(k);
        if (entry.heldSlug) state.runs.delete(entry.heldSlug);
        console.error(`[confinement] site ${slugOf(policy, k)} identity s${k} released: PID 1 reports it idle.`);
      })
      .finally(() => {
        probing = false;
      });
  }, timingOf(policy).quarantinePollMs);
  // A quarantine must never be what keeps the process alive.
  (entry.timer as { unref?: () => void }).unref?.();
}

/**
 * PROVE SITE k IDLE, or quarantine it. A live run left over is STOPPED (awaited, through the
 * rule's stop grant) and re-probed for the window; one that is still alive after it
 * quarantines the identity and refuses.
 */
export async function proveIdle(policy: ConfinementPolicy, k: number): Promise<void> {
  const state = leaseOf(policy);
  const quarantined = state.quarantined.get(k);
  if (quarantined) {
    throw new ConfinementRefusedError('identity_quarantined', `site identity s${k} is quarantined: ${quarantined.reason}. Nothing was opened.`);
  }
  const timing = timingOf(policy);
  let probe = await idleState(policy, k);
  if (probe.idle) return;
  const refusals: string[] = [];
  for (const unit of probe.live) {
    const refusal = await stopUnit(policy, unit);
    if (refusal) refusals.push(refusal);
  }
  const deadline = Date.now() + timing.reprobeWindowMs;
  for (;;) {
    probe = await idleState(policy, k);
    if (probe.idle) return;
    if (Date.now() >= deadline) break;
    await sleep(timing.pollMs);
  }
  const reason =
    `a run is still alive after it was asked to stop (${probe.why})` + (refusals.length > 0 ? `; ${refusals.join('; ')}` : '');
  quarantine(policy, k, reason);
  throw new ConfinementRefusedError(
    'identity_quarantined',
    `site '${slugOf(policy, k)}' (identity s${k}) cannot be opened: ${reason}. It is quarantined until PID 1 ` +
      `reports it dead. Nothing was opened.`,
  );
}

/**
 * RECONCILE AT BOOT — before the session sweep and before the daemon listens (`src/boot.ts`).
 * Every declared identity is proved idle; one that is not is quarantined (and stays so until
 * PID 1 says otherwise). Never throws: a boot that could not reconcile a site refuses that
 * site's runs, it does not refuse to boot.
 */
export async function reconcileAgentUnits(policy: ConfinementPolicy = policyFromConfig()): Promise<void> {
  if (policy.mode !== 'systemd_scope') return;
  for (const [slug, k] of [...identitiesOf(policy).entries()].sort((a, b) => a[1] - b[1])) {
    try {
      await proveIdle(policy, k);
    } catch (error) {
      if (!(error instanceof ConfinementRefusedError)) {
        quarantine(policy, k, `the boot reconciliation could not prove it idle (${(error as Error).message})`);
      }
      console.error(`[confinement] boot: site '${slug}' (s${k}) is not idle — ${(error as Error).message}`);
    }
  }
}

/**
 * AWAIT DEATH. Proven when PID 1 reports the instance UNKNOWN, or inactive/failed with an EMPTY
 * cgroup (`cgroupEmpty`: a unit whose stop skipped SIGKILL is failed while its processes run
 * on), AND the door socket counts no connection. An instance this run never learned (no hello)
 * is proved through the site's whole unit list instead — every instance of site k, dead units
 * that still hold a process included. Past the grace the instance is stopped (awaited) and
 * re-probed.
 */
async function awaitDeath(
  policy: ConfinementPolicy,
  k: number,
  door: ConfinementDoor,
  instance: string | null,
): Promise<{ readonly dead: true } | { readonly dead: false; readonly stopRefused: string | null }> {
  const timing = timingOf(policy);
  const dead = async (): Promise<boolean> => {
    if (instance) {
      const state = await show(policy, instance, ['ActiveState', 'LoadState', 'TasksCurrent']);
      if (!state) return false;
      const gone =
        state.LoadState === 'not-found' ||
        ((state.ActiveState === 'inactive' || state.ActiveState === 'failed') && tasksGone(state.TasksCurrent));
      if (!gone) return false;
    } else {
      const live = await liveInstancesOf(policy, k);
      if (live === null || live.length > 0) return false;
    }
    return (await connectionsOf(policy, k, door)) === 0;
  };
  const grace = Date.now() + timing.deathGraceMs;
  for (;;) {
    if (await dead()) return { dead: true };
    if (Date.now() >= grace) break;
    await sleep(Math.min(timing.pollMs, 50));
  }
  const stopRefused = instance ? await stopUnit(policy, instance) : null;
  const window = Date.now() + timing.reprobeWindowMs;
  for (;;) {
    if (await dead()) return { dead: true };
    if (Date.now() >= window) return { dead: false, stopRefused };
    await sleep(timing.pollMs);
  }
}

/** The quarantine reason of a run that did not die, with PID 1's refused stop if there was one. */
function undeadReason(base: string, death: { readonly dead: false; readonly stopRefused: string | null }): string {
  return death.stopRefused ? `${base}; ${death.stopRefused}` : base;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Conformance — what PID 1 LOADED
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** `1s`, `500ms`, `7min 15s`, `1h 2min` → microseconds; null when unparseable. */
function timespanMicros(value: string | undefined): number | null {
  if (value === undefined) return null;
  const text = value.trim();
  if (/^\d+$/.test(text)) return Number(text);
  const units: Record<string, number> = {
    us: 1,
    usec: 1,
    ms: 1_000,
    msec: 1_000,
    s: 1_000_000,
    sec: 1_000_000,
    min: 60_000_000,
    h: 3_600_000_000,
    d: 86_400_000_000,
  };
  let total = 0;
  const parts = text.split(/\s+/);
  for (const part of parts) {
    const match = /^(\d+(?:\.\d+)?)([a-z]+)$/.exec(part);
    if (!match || units[match[2] as string] === undefined) return null;
    total += Number(match[1]) * (units[match[2] as string] as number);
  }
  return Math.round(total);
}

/** `2G` → bytes (1024-based, as systemd reads MemoryMax=). */
function sizeBytes(value: string): number | null {
  const match = /^(\d+)([KMGT]?)$/.exec(value.trim());
  if (!match) return null;
  const scale: Record<string, number> = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };
  return Number(match[1]) * (scale[match[2] as string] as number);
}

const words = (value: string | undefined): string[] => (value ?? '').split(/\s+/).filter(Boolean);
const sameSet = (a: readonly string[], b: readonly string[]) => {
  const left = [...new Set(a)].sort();
  const right = [...new Set(b)].sort();
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
};
const includesAll = (have: readonly string[], want: readonly string[]) => want.every(entry => have.includes(entry));

/** `Environment=A=1 B=2` → map. */
function environmentOf(value: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const token of (value ?? '').match(/"(?:[^"\\]|\\.)*"|\S+/g) ?? []) {
    const bare = token.startsWith('"') ? token.slice(1, -1) : token;
    const eq = bare.indexOf('=');
    if (eq > 0) out[bare.slice(0, eq)] = bare.slice(eq + 1);
  }
  return out;
}

/**
 * `ExecStart={ path=… ; argv[]=a b ; … }` (and `ExecStartEx`'s `flags=…`) → its parts, or null
 * unless the value holds EXACTLY ONE command. `path=` is what PID 1 executes — an `@` prefix
 * runs another binary behind the same argv — and `flags=` carries the prefixes that change WHO
 * runs it (`+` privileged, `!`/`!!` no-setuid/ambient: the shim as ROOT behind `User=`).
 */
function execCommand(value: string | undefined): { path: string; argv: string[]; flags: string | null } | null {
  const text = value ?? '';
  const commands = text.match(/\{[^}]*\}/g) ?? [];
  if (commands.length !== 1) return null;
  const command = commands[0] as string;
  const path = /(?:^|[{;])\s*path=([^;]*);/.exec(command);
  const argv = /(?:^|;)\s*argv\[\]=([^;]*);/.exec(command);
  const flags = /(?:^|;)\s*flags=([^;]*);/.exec(command);
  if (!path || !argv) return null;
  return { path: (path[1] as string).trim(), argv: words(argv[1]), flags: flags ? (flags[1] as string).trim() : null };
}

/** `BindPaths=src:dst:rbind …` → `src:dst` pairs. */
/** lstat, or null when the path does not exist (a dangling link EXISTS: lstat sees the link). */
function lstatOrNull(path: string): Stats | null {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * THE TURN'S SYSTEM gitconfig, as root rendered it (`turnSystemGitconfigPath`) — or why not: a
 * regular file (never a link), the PROVISIONER's, writable by nobody else, whose only directives
 * are `TURN_SYSTEM_GITCONFIG_DIRECTIVES`. PID 1 binds whatever is there into every turn: absent,
 * the unit would not start (a nameless failure); widened (`safe.directory = *`), it would OPEN the
 * repository the mask closes.
 */
export function turnGitconfigProblem(policy: ConfinementPolicy): string | null {
  const path = turnSystemGitconfigPath(policy.agentStateRoot);
  let facts: Stats | null;
  try {
    facts = lstatOrNull(path);
  } catch (error) {
    return `'${path}' cannot be examined (${String(error)})`;
  }
  if (facts === null) return `'${path}' is absent`;
  if (!facts.isFile()) return `'${path}' is not a regular file`;
  if (facts.uid !== policy.host.provisionerUid) return `'${path}' is owned by uid ${facts.uid}, not the provisioner's`;
  if ((Number(facts.mode) & 0o022) !== 0) return `'${path}' is writable by its group or by others (mode ${(Number(facts.mode) & 0o7777).toString(8)})`;
  let body: string;
  try {
    body = readFileSync(path, 'utf8');
  } catch (error) {
    return `'${path}' cannot be read (${String(error)})`;
  }
  const directives = gitconfigDirectives(body);
  if (JSON.stringify(directives) !== JSON.stringify(TURN_SYSTEM_GITCONFIG_DIRECTIVES)) {
    return `'${path}' says ${JSON.stringify(directives)}, not exactly ${JSON.stringify(TURN_SYSTEM_GITCONFIG_DIRECTIVES)}`;
  }
  return null;
}

function bindPairs(value: string | undefined): string[] {
  return words(value).map(token => {
    const bare = token.replace(/^-/, '');
    const [src, dst] = bare.split(':');
    return `${src}:${dst ?? src}`;
  });
}

/** An IP token set, with systemd's resolution of `any` and `localhost`. */
function ipSet(value: string | undefined): string[] {
  return words(value).flatMap(token =>
    token === 'any' ? ['0.0.0.0/0', '::/0'] : token === 'localhost' ? ['127.0.0.0/8', '::1/128'] : [token],
  );
}

/** The template's exec hooks: every one must be unset (only ExecStart runs, and it is compared). */
export const UNIT_UNSET_EXEC: readonly string[] = Object.freeze(
  ['ExecCondition', 'ExecStartPre', 'ExecStartPost', 'ExecReload', 'ExecStop', 'ExecStopPost'].flatMap(key => [key, `${key}Ex`]),
);

/**
 * What would widen who the run is or what it holds, beyond the rendered file: all unset —
 * or, where `systemctl show` prints a value for an unset key, at that DEFAULT
 * (UNIT_WIDENING_DEFAULTS). Among them the ENVFILE class: every key that makes PID 1 read,
 * open, mount, create or chown a path AS ROOT on the unit's behalf — `EnvironmentFiles`, the
 * `*Directory` family, `RootDirectory`/`RootImage`, `OpenFile` (253: PID 1 opens the path as
 * root and hands the run the descriptor — a root read for the site's uid), `MountImages` (247),
 * `ExtensionImages` (248), `ExtensionDirectories` (251), the pinned-BPF paths (`BPFProgram`,
 * `IPIngressFilterPath`, `IPEgressFilterPath`) and `LogNamespace` — so a drop-in cannot put
 * back the primitive LEAD-1b closed (PID 1 following a daemon-owned path as root).
 *
 * A DENYLIST, and stated as one: a widening key a future systemd adds is not on it. Closing
 * that needs the inverse (every key PID 1 reports SET is rendered or a known default), which
 * needs the real `systemctl show` of a conforming unit to know the defaults — the P7 capture
 * (engineering/SITE_BUILDER_INSTANCES.md §10, residual 9). Until it lands, this list is the claim.
 */
export const UNIT_UNSET_WIDENING: readonly string[] = Object.freeze([
  'SupplementaryGroups',
  'AmbientCapabilities',
  'JoinsNamespaceOf',
  'NetworkNamespacePath',
  'IPCNamespacePath',
  'PAMName',
  'LoadCredential',
  'LoadCredentialEncrypted',
  'SetCredential',
  'SetCredentialEncrypted',
  'ImportCredential',
  'EnvironmentFiles',
  'PassEnvironment',
  'RuntimeDirectory',
  'StateDirectory',
  'CacheDirectory',
  'LogsDirectory',
  'ConfigurationDirectory',
  'RootDirectory',
  'RootImage',
  'OpenFile',
  'MountImages',
  'ExtensionImages',
  'ExtensionDirectories',
  'BPFProgram',
  'IPIngressFilterPath',
  'IPEgressFilterPath',
  'LogNamespace',
  'PrivateUsers',
]);

/** The value `systemctl show` prints for a widening key nobody set — accepted as unset. */
export const UNIT_WIDENING_DEFAULTS: Readonly<Record<string, string>> = Object.freeze({ PrivateUsers: 'no' });

/** The socket's exec hooks (they run as root): all unset. */
export const SOCKET_UNSET_EXEC: readonly string[] = Object.freeze(['ExecStartPre', 'ExecStartPost', 'ExecStopPre', 'ExecStopPost']);

/**
 * IS WHAT PID 1 LOADED FOR (site k, door) WHAT THIS DAEMON EXPECTS?
 *
 * `systemctl show` of the template (as `@probe`), the socket and the target, compared through
 * a CLOSED map of normalisers: every REQUIRED property is compared STRICTLY (equality, or ⊇ for
 * dependency lists PID 1 extends with its own implicit ones), and every property that would
 * WIDEN the run if a drop-in set it — an exec hook (root's with `+`), a supplementary group, an
 * ambient capability, a joined namespace, a credential, another kill mode, a dynamic user — must
 * be unset or at its default (UNIT_UNSET_EXEC, UNIT_UNSET_WIDENING, SOCKET_UNSET_EXEC); a
 * mismatch throws `unit_nonconformant` naming the property. A property in none of these is not
 * compared — the lists are the claim, and G9 holds a row for every entry. `PrivatePIDs` absent on a PID 1 that knows it is a
 * WARNING, not a refusal (the posture then equals 255's, which is the accepted one).
 */
export async function conformance(k: number, door: ConfinementDoor, policy: ConfinementPolicy): Promise<{ warnings: string[] }> {
  const names = agentUnitNames(policy.unitPrefix, k, door);
  const templateProbe = `${names.instanceStem}probe.service`;
  const [service, socket, target] = await Promise.all([
    show(policy, templateProbe),
    show(policy, names.socket),
    show(policy, names.target),
  ]);
  const refuse = (property: string, detail: string): never => {
    throw new ConfinementRefusedError(
      'unit_nonconformant',
      `what PID 1 loaded for site ${slugOf(policy, k)}'s ${door} door (s${k}) is not what this daemon expects: ` +
        `${property} — ${detail}. Nothing was started. Re-run provision apply (and daemon-reload); a unit ` +
        `file silently ignores a key its systemd does not know.`,
    );
  };
  if (!service) refuse('the template', `systemctl show ${templateProbe} gave no answer`);
  if (!socket) refuse('the socket', `systemctl show ${names.socket} gave no answer`);
  if (!target) refuse('the target', `systemctl show ${names.target} gave no answer`);
  const svc = service as Record<string, string>;
  const sock = socket as Record<string, string>;
  const tgt = target as Record<string, string>;

  const version = policy.host.pid1Version() ?? SYSTEMD_FLOOR;
  const workspace = confinedPath(config.SITES_ROOT, slugOf(policy, k));
  const proxy = DOOR_PROFILE[door].proxy;
  const identity = agentIdentityName(policy.instance, k);
  const daemonUnit = daemonUnitName(policy.instance);
  const ceilingMs = policy.doorTimeoutsMs[door];
  const warnings: string[] = [];

  const equal = (property: string, have: string | undefined, want: string) => {
    if (have !== want) refuse(property, `loaded '${have ?? '(absent)'}', expected '${want}'`);
  };

  /** A property that must be UNSET: `systemctl show` omits an empty one, so absent or empty. */
  const unset = (unit: Record<string, string>, label: string, property: string) => {
    const have = unit[property];
    if (have === undefined || have.trim() === '') return;
    if (label === 'template' && UNIT_WIDENING_DEFAULTS[property] === have.trim()) return;
    refuse(property, `the ${label} loaded '${have}', expected it unset`);
  };

  // WHO and HOW — and nothing that runs as someone else, or joins someone else.
  equal('User', svc.User, identity);
  if (svc.Group !== undefined && svc.Group !== '' && svc.Group !== policy.instanceGroup) {
    refuse('Group', `loaded '${svc.Group}', expected unset or the instance group '${policy.instanceGroup}'`);
  }
  equal('DynamicUser', svc.DynamicUser, 'no');
  equal('Type', svc.Type, 'exec');
  equal('WorkingDirectory', svc.WorkingDirectory, '/');
  equal('StandardInput', svc.StandardInput, 'socket');
  equal('StandardOutput', svc.StandardOutput, 'socket');
  equal('StandardError', svc.StandardError, 'journal');
  equal('CollectMode', svc.CollectMode, 'inactive-or-failed');
  // A run is over when its CGROUP is empty: under any other kill mode the shim's exit would
  // leave the run's other processes alive under the site's uid while PID 1 reported the unit
  // dead — and the idle proof asks PID 1 about units, not processes.
  equal('KillMode', svc.KillMode, 'control-group');
  // …and the kill REACHES it: SIGTERM, then SIGKILL past TimeoutStopSec, then SIGKILL again for
  // what survived the stop. `SendSIGKILL=no` or a catchable `FinalKillSignal=` lets a stop end
  // with the unit FAILED and its cgroup still populated — MaxConnections released, the lease
  // free, the site's next run (its other HOME) starting beside the survivor as the same uid.
  // (The death proof asks the cgroup too — `cgroupEmpty` — so a unit already started under such
  // a drop-in is not counted dead either.)
  equal('KillSignal', svc.KillSignal, '15');
  equal('SendSIGKILL', svc.SendSIGKILL, 'yes');
  equal('FinalKillSignal', svc.FinalKillSignal, '9');
  const command = execCommand(svc.ExecStart);
  const argv = command?.argv ?? [];
  const expectedArgv = `${policy.unitExec.runtime} ${policy.unitExec.shim}`;
  if (!command) refuse('ExecStart', `loaded '${svc.ExecStart ?? '(absent)'}', expected exactly one command`);
  if (argv.join(' ') !== expectedArgv) {
    const resolved = argv.map(token => {
      try {
        return realpathSync(token);
      } catch {
        return token;
      }
    });
    const hint =
      resolved.join(' ') === expectedArgv
        ? ` — the same files through a symlink: declare engine.bun_bin and engine.checkout_dir as the resolved ` +
          `paths ('${expectedArgv}'), which provision check requires`
        : '';
    refuse('ExecStart', `loaded argv '${argv.join(' ')}', expected '${expectedArgv}'${hint}`);
  }
  // WHAT IS EXECUTED, not only what it is called: `path=` is the binary PID 1 runs.
  if (command?.path !== policy.unitExec.runtime) {
    refuse('ExecStart path', `loaded path '${command?.path ?? ''}', expected '${policy.unitExec.runtime}' (an '@' prefix runs another binary behind the argv)`);
  }
  // AND AS WHOM: ExecStartEx states the prefixes ExecStart cannot — `+` (privileged), `!` and
  // `!!` (no setuid, ambient) run the shim and the agent as ROOT while User= still reads as
  // the identity. Required present (every PID 1 at the floor prints it) and flag-free.
  const extended = execCommand(svc.ExecStartEx);
  if (!extended) refuse('ExecStartEx', `loaded '${svc.ExecStartEx ?? '(absent)'}', expected exactly one command with no flags`);
  if (extended?.path !== policy.unitExec.runtime || extended.argv.join(' ') !== expectedArgv) {
    refuse('ExecStartEx', `loaded path '${extended?.path ?? ''}' argv '${extended?.argv.join(' ') ?? ''}', expected '${expectedArgv}'`);
  }
  if (extended?.flags === null || (extended?.flags ?? '') !== '') {
    refuse('ExecStartEx flags', `loaded flags '${extended?.flags ?? '(absent)'}', expected none — a prefix would change who runs the shim`);
  }
  // Nothing else is executed for the unit: a `+`-prefixed hook runs as ROOT, any hook runs
  // before the shim has proved a thing.
  for (const property of UNIT_UNSET_EXEC) unset(svc, 'template', property);
  // No identity, capability, namespace or credential the unit file does not grant.
  for (const property of UNIT_UNSET_WIDENING) unset(svc, 'template', property);
  const env = environmentOf(svc.Environment);
  const fixed = unitFixedEnvironment({ door, workspace, agentStateRoot: policy.agentStateRoot, k });
  const envKeys = Object.keys(env).sort();
  const fixedKeys = Object.keys(fixed).sort();
  if (envKeys.join(',') !== fixedKeys.join(',') || fixedKeys.some(key => env[key] !== fixed[key])) {
    refuse('Environment', `loaded ${JSON.stringify(env)}, expected ${JSON.stringify(fixed)}`);
  }
  // THE HARDENING, strictly.
  for (const [property, want] of [
    ['NoNewPrivileges', 'yes'],
    ['RestrictSUIDSGID', 'yes'],
    ['LockPersonality', 'yes'],
    ['PrivateTmp', 'yes'],
    ['PrivateDevices', 'yes'],
    ['ProtectSystem', 'strict'],
    ['ProtectHome', 'yes'],
    ['ProtectProc', 'invisible'],
    ['UMask', '0007'],
    ['PrivateNetwork', 'yes'],
    ['PrivateIPC', 'yes'],
  ] as const) {
    equal(property, svc[property], want);
  }
  if (extraRendered('PrivatePIDs', version) && svc.PrivatePIDs !== 'yes') {
    warnings.push(
      `site ${slugOf(policy, k)}'s ${door} unit (s${k}) runs WITHOUT PrivatePIDs= on systemd ${version}, which knows ` +
        `it — the posture equals 255's (per-site uids keep concurrent runs apart); re-run provision apply to add the layer.`,
    );
  }
  // WHAT IT MAY WRITE, SEE AND BIND.
  if (!sameSet(words(svc.ReadWritePaths), [workspace])) {
    refuse('ReadWritePaths', `loaded '${svc.ReadWritePaths ?? ''}', expected exactly '${workspace}'`);
  }
  const tmpfs = words(svc.TemporaryFileSystem);
  if (!sameSet(tmpfs, ['/run:ro', '/dev/shm:mode=1777,nosuid,nodev', `${policy.agentStateRoot}:ro`, CGROUPFS_MASK])) {
    refuse('TemporaryFileSystem', `loaded '${svc.TemporaryFileSystem ?? ''}'`);
  }
  // The database sockets on every door — and on the TURN door its workspace's repository
  // (`turnMaskedPaths`: the agent CLI's own git must find no `.git` to run a planted filter from).
  const masked = [...DATABASE_SOCKET_DIRS.map(dir => `-${dir}`), ...(door === 'turn' ? turnMaskedPaths(workspace) : [])];
  if (!sameSet(words(svc.InaccessiblePaths), masked)) {
    refuse('InaccessiblePaths', `loaded '${svc.InaccessiblePaths ?? ''}', expected '${masked.join(' ')}'`);
  }
  const expectedBinds = proxy ? [`${agentHomeFor(policy.agentStateRoot, k, door)}:${agentHomeFor(policy.agentStateRoot, k, door)}`] : [];
  if (!sameSet(bindPairs(svc.BindPaths), expectedBinds)) {
    refuse('BindPaths', `loaded '${svc.BindPaths ?? ''}', expected '${expectedBinds.join(' ')}'`);
  }
  // The egress gate: root's directory, bound READ-ONLY (connect(2) needs no writable mount).
  // …and, on the TURN door, root's system gitconfig over git's own (`turnGitconfigBind`: the
  // agent CLI's git must not take the workspace ROOT for a bare repository once .git is masked).
  const expectedReadOnlyBinds = [
    ...(proxy ? [`${egressDirForSite(policy.agentSocketDir, k)}:${EGRESS_MOUNT}`] : []),
    ...(door === 'turn' ? [turnGitconfigBind(policy.agentStateRoot)] : []),
  ];
  if (!sameSet(bindPairs(svc.BindReadOnlyPaths), expectedReadOnlyBinds)) {
    refuse('BindReadOnlyPaths', `loaded '${svc.BindReadOnlyPaths ?? ''}', expected '${expectedReadOnlyBinds.join(' ')}'`);
  }
  // THE NETWORK.
  if (!sameSet(ipSet(svc.IPAddressDeny), ['0.0.0.0/0', '::/0'])) refuse('IPAddressDeny', `loaded '${svc.IPAddressDeny ?? ''}'`);
  if (!sameSet(ipSet(svc.IPAddressAllow), proxy ? ['127.0.0.0/8', '::1/128'] : [])) {
    refuse('IPAddressAllow', `loaded '${svc.IPAddressAllow ?? ''}'`);
  }
  const families = proxy ? ['AF_UNIX', 'AF_INET', 'AF_INET6', 'AF_NETLINK'] : ['AF_UNIX', 'AF_NETLINK'];
  if (!sameSet(words(svc.RestrictAddressFamilies), families)) {
    refuse('RestrictAddressFamilies', `loaded '${svc.RestrictAddressFamilies ?? ''}'`);
  }
  // THE CAPS.
  const memory = sizeBytes(policy.memoryMax);
  if (memory === null || String(memory) !== svc.MemoryMax) refuse('MemoryMax', `loaded '${svc.MemoryMax ?? ''}', expected ${policy.memoryMax}`);
  const quota = /^(\d+)%$/.exec(policy.cpuQuota);
  if (!quota || timespanMicros(svc.CPUQuotaPerSecUSec) !== Number(quota[1]) * 10_000) {
    refuse('CPUQuota', `loaded CPUQuotaPerSecUSec '${svc.CPUQuotaPerSecUSec ?? ''}', expected ${policy.cpuQuota}`);
  }
  equal('TasksMax', svc.TasksMax, String(policy.tasksMax));
  const runtimeMax = (Math.ceil(ceilingMs / 1000) + 15) * 1_000_000;
  if (timespanMicros(svc.RuntimeMaxUSec) !== runtimeMax) {
    refuse('RuntimeMaxUSec', `loaded '${svc.RuntimeMaxUSec ?? ''}', expected the ${door} ceiling + 15 s (${runtimeMax / 1_000_000}s)`);
  }
  if (timespanMicros(svc.TimeoutStopUSec) !== 10_000_000) refuse('TimeoutStopUSec', `loaded '${svc.TimeoutStopUSec ?? ''}', expected 10s`);
  // THE BINDING.
  if (!includesAll(words(svc.BindsTo), [names.target, daemonUnit])) refuse('BindsTo', `loaded '${svc.BindsTo ?? ''}'`);
  if (!includesAll(words(svc.After), [names.target, daemonUnit])) refuse('After', `loaded '${svc.After ?? ''}'`);

  // THE SOCKET — root's hooks on it run as root: none.
  for (const property of SOCKET_UNSET_EXEC) unset(sock, 'socket', property);
  // Stopped WITH the daemon: a stop of the daemon puts a stop job on the socket in the same
  // transaction, and a socket with a stop pending accepts nothing — without it a connect made
  // while the daemon is being stopped activates an instance whose BindsTo= pulls in a START of
  // the daemon, which cancels the stop.
  if (!includesAll(words(sock.PartOf), [daemonUnit])) refuse('PartOf', `the socket loaded '${sock.PartOf ?? ''}', expected ${daemonUnit}`);
  equal('DirectoryMode', sock.DirectoryMode, '0755');
  equal('Accept', sock.Accept, 'yes');
  equal('MaxConnections', sock.MaxConnections, '1');
  equal('SocketUser', sock.SocketUser, policy.serviceUser);
  equal('SocketGroup', sock.SocketGroup, policy.instanceGroup);
  equal('SocketMode', sock.SocketMode, '0600');
  equal('Listen', sock.Listen, `${agentSocketPath(policy.agentSocketDir, k, door)} (Stream)`);
  if (timespanMicros(sock.TriggerLimitIntervalUSec) !== 2_000_000) refuse('TriggerLimitIntervalUSec', `loaded '${sock.TriggerLimitIntervalUSec ?? ''}'`);
  equal('TriggerLimitBurst', sock.TriggerLimitBurst, '20');

  // THE TARGET: this door conflicts with the site's other two, and is ordered.
  const others = DOORS.filter(other => other !== door).map(other => agentUnitNames(policy.unitPrefix, k, other).target);
  if (!includesAll(words(tgt.Conflicts), others)) refuse('Conflicts', `loaded '${tgt.Conflicts ?? ''}', expected ${others.join(' ')}`);
  const after = (door === 'turn' ? ['build', 'git'] : door === 'build' ? ['git'] : []).map(
    other => agentUnitNames(policy.unitPrefix, k, other as ConfinementDoor).target,
  );
  if (!includesAll(words(tgt.After), after)) refuse('target After', `loaded '${tgt.After ?? ''}'`);
  equal('StopWhenUnneeded', tgt.StopWhenUnneeded, 'yes');

  return { warnings };
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The run
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** A byte stream the consumer iterates. Closed exactly once. */
class ChunkQueue implements AsyncIterable<Uint8Array> {
  private buffer: Uint8Array[] = [];
  private waiters: Array<(result: IteratorResult<Uint8Array>) => void> = [];
  private done = false;
  push(chunk: Uint8Array): void {
    if (this.done) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value: chunk, done: false });
    else this.buffer.push(chunk);
  }
  close(): void {
    if (this.done) return;
    this.done = true;
    for (const waiter of this.waiters.splice(0)) waiter({ value: undefined, done: true });
  }
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    return {
      next: () => {
        const chunk = this.buffer.shift();
        if (chunk) return Promise.resolve({ value: chunk, done: false });
        if (this.done) return Promise.resolve({ value: undefined, done: true });
        return new Promise(resolveNext => this.waiters.push(resolveNext));
      },
    };
  }
}

export interface ConfinedExit {
  readonly exitCode: number | null;
  readonly signal: string | null;
  /** Set when the run failed without a status of record (see the header, step 6). */
  readonly failure?: string;
}

/**
 * ONE RUN, FROM THE CALLER'S SIDE — the same shape whatever the mode, so the supervisor
 * (`process.ts`) and `runConfined` consume one thing.
 */
export interface ConfinedChild {
  /** Present ONLY for a declared-unconfined run: the line its log must carry. */
  readonly announcement: string | null;
  readonly stdout: AsyncIterable<Uint8Array>;
  readonly stderr: AsyncIterable<Uint8Array>;
  /** Resolves when the run is over — its status of record. */
  readonly exited: Promise<ConfinedExit>;
  /** The child's pid for a declared-unconfined run, -1 for a unit (PID 1 owns it). */
  readonly pid: number;
  /** End the run (interrupt, timeout). Awaited: it asks PID 1 too. */
  stop(): Promise<void>;
  /**
   * Close everything the run opened, on every exit path: the connection, the egress gate, and
   * — only once PID 1 reports the unit dead — the site's run slot. Idempotent.
   */
  cleanup(): Promise<void>;
}

export interface ConfineOptions {
  /** Which door this run goes through — REQUIRED: a new caller cannot inherit a wider one. */
  readonly door: ConfinementDoor;
  /** The site. Its identity is the run's uid; its reservation must be held. */
  readonly slug?: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env: Record<string, string>;
  readonly timeoutMs: number;
  /** What is being run, for the announcement an unconfined run must carry. */
  readonly label?: string;
  /** The run's driver, when known — decides a turn's provider host. */
  readonly driver?: DriverId;
  /** The Publication API the gate's mcp.sock forwards to, key included (turns only). */
  readonly mcpUpstream?: McpUpstream;
  /** Where the gate's accepted/refused destinations are written (the run's own log). */
  readonly onEgress?: (line: string) => void;
  /**
   * An interrupt that lands WHILE the run is being opened (the gate is several awaits): asked
   * before the connect and again before the spec is sent, so a stopped turn starts nothing.
   */
  readonly signal?: AbortSignal;
}

/** The run was interrupted before its spec reached the unit: nothing ran. */
export class RunAbortedError extends Error {
  constructor(door: ConfinementDoor) {
    super(`the ${door} run was interrupted before it started; nothing ran.`);
    this.name = 'RunAbortedError';
  }
}

/**
 * OPEN A RUN. Under `none`, the declared-unconfined child (announced); under `systemd_scope`,
 * the socket-activated unit of the site's identity, through steps 1–5 of the header. Nothing is
 * left open when this throws.
 */
export async function confineTurn(opts: ConfineOptions, policy: ConfinementPolicy = policyFromConfig()): Promise<ConfinedChild> {
  // `undefined` is the supervisor passing its optional seam through untouched: this daemon's own.
  if (!policy) policy = policyFromConfig();
  if (policy.mode === 'none') return declaredUnconfined(opts, policy);
  return openConfinedRun(opts, policy);
}

/** The declared-unconfined run: the daemon's own child, announced, with the unit's fixed environment. */
function declaredUnconfined(opts: ConfineOptions, policy: ConfinementPolicy): ConfinedChild {
  if (opts.signal?.aborted) throw new RunAbortedError(opts.door);
  const env: Record<string, string> = { ...opts.env };
  if (opts.door === 'git') {
    env.HOME = '/nonexistent';
    env.GIT_CONFIG_GLOBAL = '/dev/null';
    env.GIT_CONFIG_NOSYSTEM = '1';
  } else if (policy.agentStateRoot) {
    const home = join(policy.agentStateRoot, 'unconfined', opts.door);
    mkdirSync(home, { recursive: true, mode: 0o700 });
    env.HOME = home;
  }
  const child = spawnChild(opts.argv, { cwd: opts.cwd, env, confined: CONFINED_ARGV });
  const exited: Promise<ConfinedExit> = child.exited.then(code => ({
    exitCode: code,
    signal: (child.signalCode as string | null) ?? null,
  }));
  let settled = false;
  void exited.then(() => {
    settled = true;
  });
  return {
    announcement:
      `[confinement] this ${opts.label ?? 'turn'} ran UNCONFINED — as the daemon's own uid, ` +
      `with no per-run egress policy and no per-run resource cap, because ` +
      `AGENT_CONFINEMENT is 'none' on this host. It is recorded here because an unconfined ` +
      `run must be a fact in the session's own log, never an absence.`,
    stdout: child.stdout as unknown as AsyncIterable<Uint8Array>,
    stderr: child.stderr as unknown as AsyncIterable<Uint8Array>,
    exited,
    pid: child.pid,
    async stop() {
      if (settled) return;
      child.kill('SIGINT');
      const escalate = setTimeout(() => child.kill(9), 5_000);
      await exited.finally(() => clearTimeout(escalate));
    },
    async cleanup() {},
  };
}

/**
 * WHY THE WORKSPACE IS NOT WHAT `ReadWritePaths=` MUST BIND, or null: a real directory (lstat —
 * never a symlink, never another kind of file) whose resolved path is `<real SITES_ROOT>/<slug>`.
 *
 * The same class §2.7 closed for the egress directory: a bind source PID 1 resolves as root
 * that a non-root uid could re-point. `SITES_ROOT` is the service user's (2770), so its uid can
 * rename `<slug>` and leave a link in its place; PID 1 would then bind the link's TARGET
 * read-write, before the shim runs. HONEST LIMIT: this is the daemon checking itself, so it
 * catches a stray rename by anything of the service uid and a daemon bug — not a COMPROMISED
 * daemon, which skips its own check. That residual is stated in
 * engineering/SITE_BUILDER_INSTANCES.md (accepted residuals); closing it needs root-provisioned
 * per-site mount sources, and sites are created at runtime.
 */
export function workspaceDirProblem(workspace: string, sitesRoot: string = config.SITES_ROOT): string | null {
  let facts: ReturnType<typeof lstatSync>;
  try {
    facts = lstatSync(workspace);
  } catch {
    return 'it does not exist';
  }
  if (facts.isSymbolicLink()) return 'it is a symbolic link (PID 1 would bind its target)';
  if (!facts.isDirectory()) return 'it is not a directory';
  let real: string;
  let rootReal: string;
  try {
    real = realpathSync(workspace);
    rootReal = realpathSync(sitesRoot);
  } catch (error) {
    return `it cannot be resolved (${String(error)})`;
  }
  const expected = join(rootReal, relative(resolve(sitesRoot), resolve(workspace)));
  return real === expected ? null : `it resolves to '${real}', not '${expected}'`;
}

/** Read frames off `socket` until one arrives (or it ends / times out). */
function firstFrame(socket: Socket, decoder: FrameDecoder, timeoutMs: number): Promise<{ type: string; payload: Uint8Array; rest: Array<{ type: string; payload: Uint8Array }> } | null> {
  return new Promise(resolveFrame => {
    let done = false;
    const finish = (value: { type: string; payload: Uint8Array; rest: Array<{ type: string; payload: Uint8Array }> } | null) => {
      if (done) return;
      done = true;
      holdAfterFirst(socket);
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('close', onClose);
      socket.off('end', onClose);
      resolveFrame(value);
    };
    const onData = (chunk: Buffer) => {
      let frames: Array<{ type: string; payload: Uint8Array }>;
      try {
        frames = decoder.push(chunk);
      } catch {
        finish(null);
        return;
      }
      if (frames.length > 0) {
        const [first, ...rest] = frames;
        finish({ ...(first as { type: string; payload: Uint8Array }), rest });
      }
    };
    const onClose = () => finish(null);
    const timer = setTimeout(() => finish(null), timeoutMs);
    socket.on('data', onData);
    socket.once('close', onClose);
    socket.once('end', onClose);
  });
}

/** Pause the socket once the first frame is read, so nothing flows before the relay listens. */
function holdAfterFirst(socket: Socket): void {
  socket.pause();
}

async function openConfinedRun(opts: ConfineOptions, policy: ConfinementPolicy): Promise<ConfinedChild> {
  const slug = opts.slug;
  if (!slug) {
    throw new Error(`confinement: a confined ${opts.door} run names no site — its identity is the site's; nothing was opened.`);
  }
  // 1. RESERVED — synchronously, before any await.
  if (!holdsReservation(slug)) {
    throw new Error(
      `confinement: a confined ${opts.door} run of '${slug}' was asked for without the site's reservation ` +
        `(workspace_activity.ts). Every run of a site holds it; nothing was opened.`,
    );
  }
  const workspace = confinedPath(config.SITES_ROOT, slug);
  if (resolve(opts.cwd) !== workspace) {
    throw new Error(`confinement: a run of '${slug}' asked for cwd '${opts.cwd}', not its workspace '${workspace}'. Nothing was opened.`);
  }
  const lease = leaseOf(policy);
  refuseWhileStopping(lease, slug, opts.door);
  const k = admissibleOrdinal(policy, slug, opts.door);
  if (lease.runs.has(slug)) {
    throw new ConfinementRefusedError(
      'site_busy',
      `site '${slug}' already has a run open. A site's runs are sequential (its reservation serializes them), so ` +
        `this is a daemon bug — refused, and nothing was opened.`,
    );
  }
  for (const key of Object.keys(opts.env)) {
    if (isFixedEnvKey(key)) {
      throw new Error(
        `confinement: the ${opts.door} run of '${slug}' was handed '${key}', which the unit fixes (HOME, DEDALO_*, ` +
          `the transpiler cache, git's configuration). No caller sets it. Nothing was opened.`,
      );
    }
  }
  lease.runs.add(slug);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    lease.runs.delete(slug);
  };

  const timing = timingOf(policy);
  const door = opts.door;
  const driver = opts.driver ?? ((policy.egressFacts.driver as DriverId | undefined) ?? 'claude_code');
  let gate: EgressGate | null = null;
  let socket: Socket | null = null;
  try {
    const problems = await confinementProblems(policy, door, driver);
    if (problems.length > 0) throw new ConfinementUnavailableError(problems.join(' '));
    let hostNetns: string;
    try {
      hostNetns = policy.host.readNetns();
    } catch (error) {
      throw new ConfinementUnavailableError(
        `this daemon cannot read its own network namespace identity (${String(error)}); the unit's shim ` +
          `could not prove it is elsewhere. Nothing was started.`,
      );
    }
    // 2. PROVED IDLE (a live leftover stopped, or the identity quarantined).
    await proveIdle(policy, k);
    // 3. CHECKED against what PID 1 loaded.
    const { warnings } = await conformance(k, door, policy);
    for (const warning of warnings) console.warn(`[confinement] ${warning}`);
    // …and the ONE bind source the daemon's uid could still swap: `ReadWritePaths=` names the
    // workspace, and PID 1 follows a symlink there AS ROOT when it builds the unit's namespace.
    const swapped = workspaceDirProblem(workspace);
    if (swapped) {
      throw new ConfinementUnavailableError(
        `site '${slug}''s workspace '${workspace}' is not the real directory the unit binds: ${swapped}. PID 1 ` +
          `resolves ReadWritePaths= as root, so it would bind whatever this names read-write into the run. ` +
          `Nothing was opened.`,
      );
    }
    // …and a TURN's masked repository must EXIST: the unit masks it with no `-` (PID 1 refuses
    // to start the unit without it), because a turn in a workspace with no `.git` could Write one
    // that its own CLI's next git reads. Refused here first, typed, before anything connects.
    if (door === 'turn') {
      for (const path of turnMaskedPaths(workspace)) {
        if (!existsSync(path)) {
          throw new ConfinementUnavailableError(
            `site '${slug}''s workspace has no repository at '${path}' (absent, or a link to nothing). The turn unit ` +
              `masks it so the agent CLI's own git cannot run a planted filter, and does not start without it. ` +
              `Restore the site's repository (it is created with the site). Nothing was opened.`,
          );
        }
      }
      // …and the workspace ROOT must not be a repository itself: with `.git` masked, git's
      // discovery takes a root carrying HEAD (+ objects/, refs/) for a BARE repository and runs
      // its planted config. The unit's system gitconfig refuses that (git >= 2.38); this refuses
      // it for every git, before anything connects (agent_identity.ts, layer 2).
      const marker = turnBareRepositoryMarker(workspace);
      if (lstatOrNull(marker) !== null) {
        throw new ConfinementUnavailableError(
          `site '${slug}''s workspace root carries '${TURN_BARE_REPOSITORY_MARKER}' ('${marker}'): it is shaped like a bare ` +
            `repository, which the agent CLI's own git would use (and run a planted filter from) once the unit masks ` +
            `'.git'. Remove it (nothing the site builds needs a '${TURN_BARE_REPOSITORY_MARKER}' at the root). Nothing was opened.`,
        );
      }
      const gitconfig = turnGitconfigProblem(policy);
      if (gitconfig) {
        throw new ConfinementUnavailableError(
          `the turn units' system git configuration ${gitconfig}. The turn unit binds it over /etc/gitconfig so the agent ` +
            `CLI's git never takes the workspace root for a bare repository. Run provision apply. Nothing was opened.`,
        );
      }
    }
    // 4. GATED — the site's own ROOT-PROVISIONED directory (the source of a bind PID 1
    // resolves as root: nothing this daemon's uid could re-point), its private group, before
    // anything is served.
    const facts = egressFactsFor(policy, driver);
    if (DOOR_PROFILE[door].proxy) {
      const dir = egressDirForSite(policy.agentSocketDir, k);
      const group = await policy.host.groupGid(agentIdentityName(policy.instance, k));
      if (group === null) {
        throw new ConfinementUnavailableError(`site '${slug}''s private group does not resolve; run provision apply.`);
      }
      const owner = policy.host.provisionerUid;
      const provisioned = provisionedDirProblem(dir, { owner, group }, policy.egressSeams?.lstat);
      if (provisioned) {
        throw new ConfinementUnavailableError(
          `site '${slug}''s egress directory is not as root provisioned it: ${provisioned}. Run provision apply ` +
            `(it renders the tmpfiles.d line that makes it root:<site group> 0770). Nothing was opened.`,
        );
      }
      const plan = egressPlanFor(door, facts);
      gate = await openEgressGate({
        dir,
        group,
        owner,
        plan: { hosts: plan.hosts, mcp: plan.mcp && opts.mcpUpstream !== undefined },
        publicationApiUrl: opts.mcpUpstream?.url ?? '',
        apiKey: opts.mcpUpstream?.apiKey ?? '',
        sink: line => opts.onEgress?.(line),
        seams: policy.egressSeams,
      });
    }
    // 5. CONNECTED — once, never retried (and not at all once the run was interrupted).
    if (opts.signal?.aborted) throw new RunAbortedError(door);
    // Asked again: the shutdown may have begun during the awaits above (the idle proof, the
    // conformance, the gate) — and the connect is the act that would cancel it.
    refuseWhileStopping(lease, slug, door);
    const path = agentSocketPath(policy.agentSocketDir, k, door);
    try {
      socket = await policy.host.connect(path);
    } catch (error) {
      throw new ConfinementRefusedError('unit_refused', `the ${door} socket of site '${slug}' ('${path}') refused the connection (${String(error)}). Nothing was started.`);
    }
    socket.on('error', () => {});
    // The close is observed from the moment of connect, so a unit that says its last word and
    // hangs up in one burst is never missed by a listener attached a tick later.
    const connection = socket;
    const closed = new Promise<void>(resolveClosed => connection.once('close', () => resolveClosed()));
    const decoder = new FrameDecoder();
    const first = await firstFrame(socket, decoder, timing.helloTimeoutMs);
    const names = agentUnitNames(policy.unitPrefix, k, door);
    let instance: string | null = null;
    if (first && first.type === 'H') {
      try {
        const hello = parseHello(first.payload);
        if (hello.door === door && names.instanceRegex.test(hello.unit)) instance = hello.unit;
      } catch {
        instance = null;
      }
    }
    if (instance === null) {
      socket.destroy();
      const diagnosis = await show(policy, names.socket, ['NConnections', 'ActiveState', 'Result']);
      throw new ConfinementRefusedError(
        'unit_refused',
        `the ${door} unit of site '${slug}' (s${k}) never said hello${first ? ' in the protocol' : ''} — PID 1 reports ` +
          `${diagnosis ? JSON.stringify(diagnosis) : 'nothing'}. The connection is never retried; nothing ran.`,
      );
    }
    if (opts.signal?.aborted) {
      socket.destroy();
      throw new RunAbortedError(door);
    }
    const spec = {
      v: 1,
      door,
      argv: [...opts.argv],
      env: { ...opts.env, ...childEgressEnv(door, facts.driver) },
      hostNetns,
    };
    socket.write(encodeJsonFrame('S', spec));
    return relay(socket, closed, decoder, first?.rest ?? [], { policy, k, door, instance, gate, release, lease, slug });
  } catch (error) {
    socket?.destroy();
    try {
      await gate?.close();
    } catch (closeError) {
      try {
        opts.onEgress?.(`[egress] this run's egress gate did not close cleanly (${String(closeError)}).`);
      } catch {
        // A broken sink must not replace the refusal.
      }
    }
    if (socket) {
      // A connection was made: the site is released only on proven death.
      const death = await awaitDeath(policy, k, door, null);
      if (death.dead) release();
      else quarantine(policy, k, undeadReason(`the unit that refused the run did not die`, death), slug);
    } else {
      // Nothing reached PID 1 from this run: its slot is free (a quarantine, if proveIdle set
      // one, is what holds the identity).
      release();
    }
    throw error;
  }
}

/** Steps 6–7: relay the frames, and on the way out free the site only on proven death. */
function relay(
  socket: Socket,
  closed: Promise<void>,
  decoder: FrameDecoder,
  early: Array<{ type: string; payload: Uint8Array }>,
  run: {
    policy: ConfinementPolicy;
    k: number;
    door: ConfinementDoor;
    instance: string;
    gate: EgressGate | null;
    release: () => void;
    lease: LeaseState;
    slug: string;
  },
): ConfinedChild {
  const stdout = new ChunkQueue();
  const stderr = new ChunkQueue();
  let exit: ExitRecord | null = null;
  let violation: string | null = null;
  const take = (frame: { type: string; payload: Uint8Array }) => {
    if (violation || exit) {
      violation ??= `a '${frame.type}' frame after the exit record`;
      return;
    }
    if (frame.type === 'O') stdout.push(frame.payload);
    else if (frame.type === 'E') stderr.push(frame.payload);
    else if (frame.type === 'X') {
      try {
        exit = parseExit(frame.payload);
        socket.end();
      } catch (error) {
        violation = (error as Error).message;
      }
    } else violation = `an unexpected '${frame.type}' frame`;
    if (violation) socket.destroy();
  };
  const exited = new Promise<ConfinedExit>(resolveExit => {
    const finish = () => {
      try {
        decoder.end();
      } catch (error) {
        violation ??= (error as FrameError).message;
      }
      stdout.close();
      stderr.close();
      if (exit && !violation) resolveExit({ exitCode: exit.code, signal: exit.signal });
      else {
        resolveExit({
          exitCode: null,
          signal: null,
          failure: violation ? `protocol_violation: ${violation}` : 'unit_ended_without_exit_frame',
        });
      }
    };
    void closed.then(finish);
  });
  for (const frame of early) take(frame);
  socket.on('data', chunk => {
    try {
      for (const frame of decoder.push(chunk as Buffer)) take(frame);
    } catch (error) {
      violation ??= (error as Error).message;
      socket.destroy();
    }
  });
  socket.resume();

  let cleaned: Promise<void> | null = null;
  return {
    announcement: null,
    stdout,
    stderr,
    exited,
    pid: -1,
    async stop() {
      // EOF is the shim's signal to end its child (SIGTERM, then SIGKILL); PID 1 is asked too,
      // through the rule's stop grant, because a stop must not depend on the unit cooperating.
      socket.destroy();
      // A refused stop is logged by stopUnit and named again by cleanup's quarantine if the
      // unit then outlives its connection.
      await stopUnit(run.policy, run.instance);
    },
    cleanup() {
      cleaned ??= (async () => {
        socket.destroy();
        let closeError: unknown = null;
        try {
          await run.gate?.close();
        } catch (error) {
          closeError = error;
        }
        const death = await awaitDeath(run.policy, run.k, run.door, run.instance);
        if (death.dead) run.release();
        else quarantine(run.policy, run.k, undeadReason(`its ${run.door} run (${run.instance}) outlived its connection`, death), run.slug);
        if (closeError) throw closeError;
      })();
      return cleaned;
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * THE OTHER DOOR — everything that is not an interactive turn
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** A run's result: the SpawnResult shape, plus the failure a unit without an X frame is. */
export interface ConfinedResult extends SpawnResult {
  /** `unit_ended_without_exit_frame` (or a protocol violation) — the run FAILED, whatever it printed. */
  readonly failure?: string;
}

/**
 * RUN A COMMAND IN A SITE WORKSPACE, AS THE SITE'S IDENTITY.
 *
 * A build step, an install script and a `git add` are agent-authored text as much as a turn
 * is — `site.json` lives in the workspace a turn writes, `package.json`'s lifecycle scripts run
 * on `bun install`, a `.git` a turn can replace carries hooks and filters. So they go through
 * the same door: the site's own identity, its own unit per door, the same caps, the same
 * network design. What differs is the timeout the caller states and the DOOR: a build reaches
 * its package registry through the egress gate, a git command reaches nothing at all.
 *
 * `util/spawn.ts` REFUSES a cwd inside `SITES_ROOT` without this module's token, so this is not
 * a convention a later call site can forget — it is the only way in.
 */
export async function runConfined(
  opts: ConfineOptions & {
    readonly onStdout?: (chunk: string) => void;
    readonly onStderr?: (chunk: string) => void;
  },
  policy: ConfinementPolicy = policyFromConfig(),
): Promise<ConfinedResult> {
  const child = await confineTurn(
    {
      ...opts,
      // A build's blocked host is a line in the build log a museum reads afterwards.
      onEgress: opts.onEgress ?? (line => opts.onStdout?.(`${line}\n`)),
    },
    policy,
  );
  // An unconfined run says so in the ONE durable place this caller has — its own output sink.
  if (child.announcement) opts.onStdout?.(`${child.announcement}\n`);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void child.stop();
  }, opts.timeoutMs);
  try {
    const drain = async (stream: AsyncIterable<Uint8Array>, sink?: (chunk: string) => void): Promise<string> => {
      const decoder = new TextDecoder();
      let out = '';
      for await (const chunk of stream) {
        const text = decoder.decode(chunk, { stream: true });
        out += text;
        if (text) sink?.(text);
      }
      const tail = decoder.decode();
      if (tail) {
        out += tail;
        sink?.(tail);
      }
      return out;
    };
    const [stdout, stderr] = await Promise.all([drain(child.stdout, opts.onStdout), drain(child.stderr, opts.onStderr)]);
    const exit = await child.exited;
    if (exit.failure) {
      const line = `[confinement] the ${opts.door} run FAILED: ${exit.failure} — no status of record, so it is not a success.\n`;
      try {
        opts.onStderr?.(line);
      } catch {
        // A broken sink must not replace the result.
      }
      return { exitCode: null, stdout, stderr: `${stderr}${line}`, timedOut, failure: exit.failure };
    }
    return { exitCode: exit.exitCode, stdout, stderr, timedOut };
  } finally {
    clearTimeout(timer);
    try {
      await child.cleanup();
    } catch (closeError) {
      try {
        opts.onStdout?.(
          `[egress] this run's egress gate did not close cleanly (${String(closeError)}); its sockets may remain in the site's egress directory until the next run unlinks them.\n`,
        );
      } catch {
        // A broken sink must not replace the run's result either.
      }
      console.error('[confinement] a run egress gate failed to close:', closeError);
    }
  }
}
