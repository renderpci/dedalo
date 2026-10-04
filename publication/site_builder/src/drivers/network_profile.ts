/**
 * WHAT A CONFINED RUN MAY REACH OVER A SOCKET — the ONE producer of every network property an
 * agent unit receives, and of the egress half of its environment (LEAD-1). Since LEAD-1b the
 * units are FILES root renders per (site, door) (`provision/render/agent_units.ts`), and this
 * leaf's list is written into them verbatim.
 *
 * WHAT WAS WRONG. The unit said `IPAddressAllow=any localhost`, then denied loopback and the
 * private ranges, under a header claiming "longest-prefix wins". systemd's IP filter is
 * ALLOW-WINS (systemd.resource-control(5): an address matching an allow entry is granted,
 * whatever the deny list says), so `any` granted Postgres, the engine, the DNS stub, the LAN
 * and the cloud metadata service to text a language model wrote. And no IP list could ever
 * have closed an ABSTRACT unix socket, which belongs to the network namespace, not to a path.
 *
 * WHAT THIS DOES INSTEAD. The boundary is not a list of addresses; it is a NAMESPACE:
 *
 *   - `PrivateNetwork=yes` on EVERY door: the unit's only interface is its own `lo`. Host
 *     loopback, the host's own address, the LAN, the metadata service, the DNS stub and every
 *     abstract AF_UNIX socket simply do not exist inside it.
 *   - `TemporaryFileSystem=/run:ro`: path sockets ignore network namespaces, so the host's
 *     `/run` (the engine's socket, Postgres, Debian's MariaDB, docker, this daemon, every
 *     site's agent sockets and every other run's egress gate) is masked outright;
 *     `ProtectHome=`/`PrivateTmp=` (the unit's hardening) mask `/home` and `/tmp`. The database sockets a distro puts OUTSIDE those — RHEL's
 *     MariaDB default is `/var/lib/mysql/mysql.sock`, mode 0777, in a traversable directory,
 *     and `ProtectSystem=strict` makes it read-only, which does not stop connect(2) — are
 *     hidden by name (`DATABASE_SOCKET_DIRS`, `InaccessiblePaths=`; `-` = absent is fine).
 *   - `TemporaryFileSystem=/dev/shm`: `PrivateDevices=` binds the host's `/dev/shm` (tmpfs,
 *     mode 1777) back into the private `/dev`, so without its own mask it would be the one
 *     world-writable directory every door of every museum and the host share — a path socket
 *     bound there by one museum's build is connectable from another's. Each unit gets a
 *     private one instead. `PrivateIPC=yes` is the same rule for what is NOT a path: SysV
 *     shared memory, semaphores and message queues (and the POSIX mqueue fs) are keyed per
 *     IPC namespace, so without it two concurrent runs under different agent uids could
 *     rendezvous on a world-readable SysV segment.
 *   - `PrivatePIDs=yes` — an EXTRA layer, rendered only where PID 1 is 257 or newer
 *     (`unit_properties.ts` EXTRA). What keeps two concurrent runs from reaching each other
 *     through /proc is the UID: every site has its own agent identity (LEAD-1b), so a live run
 *     of another site is another uid — `ProtectProc=invisible` hides its /proc entry and
 *     `ptrace_may_access` refuses its `/proc/<pid>/root` and environ — and a site's own runs
 *     never overlap at all (PID 1 serializes them: MaxConnections=1 per door, Conflicts= across
 *     doors). Below 257 (Ubuntu 24.04 = 255; Debian 12 and RHEL 9 = 252) the unit therefore
 *     renders without it, which is the accepted posture; on 257 it is added on top.
 *   - A door that needs the outside gets exactly ONE thing back: its own per-run directory,
 *     bound at `/run/dedalo-egress`, holding the unix sockets of the daemon's egress gate
 *     (`src/egress/gate.ts`) — a CONNECT proxy that speaks HOSTNAMES on this run's plan only,
 *     and (turns only) the Publication API's MCP endpoint with the key added daemon-side.
 *   - `IPAddressDeny=any` (+ `IPAddressAllow=localhost` on the proxy doors) is the BPF
 *     BACKSTOP. Inside the namespace `localhost` is the unit's own `lo`, where the egress shim
 *     (`egress_shim.ts`) forwards to those sockets. On a host that SILENTLY IGNORED
 *     `PrivateNetwork=` it would be the host's loopback — which is why the shim refuses to
 *     start anything unless every interface it can see is internal (exit 78). The filter is
 *     never the boundary; the namespace is, and the shim proves the namespace per run.
 *
 * THE DOORS. `turn` (proxy + MCP), `build` (proxy: a package registry), `git` (nothing: no
 * bind, no proxy, no inet family — `AF_UNIX`, plus `AF_NETLINK` so the shim can enumerate its
 * own interfaces, which is every door's first act). A caller states its door — there is no
 * default, so a new call site cannot inherit a wider profile by omission.
 *
 * THIS FILE IMPORTS ONLY NODE BUILTINS, never `../config`: it runs inside the unit (the shim
 * reads its port constants and its mount point) where the daemon's configuration does not
 * exist, and the repo tripwire (`test/unit/agent_confinement_tripwire.test.ts` §8) imports it
 * directly. Every fact it decides on arrives as an argument.
 */

import { isIP } from 'node:net';
import { join } from 'node:path';

/** Every door a confined run goes through. Closed: a fourth door is a new decision. */
export const DOORS = ['turn', 'build', 'git'] as const;
export type ConfinementDoor = (typeof DOORS)[number];

export interface DoorProfile {
  /** Does the unit get the egress gate's CONNECT proxy (and therefore a bound socket dir)? */
  readonly proxy: boolean;
  /** Does it get the Publication API's MCP endpoint through the gate? */
  readonly mcp: boolean;
}

/** What each door may reach, stated once. */
export const DOOR_PROFILE: Readonly<Record<ConfinementDoor, DoorProfile>> = Object.freeze({
  turn: Object.freeze({ proxy: true, mcp: true }),
  build: Object.freeze({ proxy: true, mcp: false }),
  git: Object.freeze({ proxy: false, mcp: false }),
});

/**
 * The unit-side loopback ports the shim listens on. Fixed constants, and they cannot collide
 * with anything: every unit has its own network namespace, so two concurrent turns each own
 * their own `127.0.0.1:3128`.
 */
export const PROXY_PORT = 3128;
export const MCP_PORT = 3129;

/** Where a door's per-run socket directory appears INSIDE the unit. */
export const EGRESS_MOUNT = '/run/dedalo-egress';

/**
 * The cgroupfs mask every agent unit carries (`TemporaryFileSystem=`), and conformance expects.
 * `ProtectProc=invisible` hides another uid's /proc/<pid>; it does not touch /sys/fs/cgroup, which
 * `ProtectSystem=strict` leaves readable — and there another site's run is a directory whose
 * world-readable `cgroup.procs` / `cpu.stat` / `memory.current` give its pids, timing and volume.
 * One spelling on every release (no `ProtectControlGroups=private`, which only 257 knows): an
 * empty read-only tmpfs; a runtime that asks its cgroup for limits finds none and falls back.
 */
export const CGROUPFS_MASK = '/sys/fs/cgroup:ro';

/** The socket names the gate serves and the shim forwards to. */
export const PROXY_SOCKET = 'proxy.sock';
export const MCP_SOCKET = 'mcp.sock';

/**
 * The key the confinement states the run's real working directory in. The unit itself starts
 * in `/` (see egress_shim.ts for why), and the shim runs the argv here.
 */
export const WORKDIR_ENV = 'DEDALO_UNIT_WORKDIR';

/**
 * The key the unit states the run's DOOR in (rendered `Environment=`): the shim refuses a
 * spec for any other door. (The daemon's network namespace identity, which the shim refuses
 * to run anything inside, travels in the spec frame — `unit_frames.ts` hostNetns.)
 */
export const DOOR_ENV = 'DEDALO_DOOR';

/** The only port the gate tunnels to. */
export const EGRESS_PORT = 443;

/** A build's registry when the museum named none — the one npm/bun resolve against. */
export const DEFAULT_REGISTRY_HOSTS: readonly string[] = Object.freeze(['registry.npmjs.org']);

/**
 * Claude Code's API host. The only one: the daemon forwards no `ANTHROPIC_BASE_URL` to the
 * child (claude_code.ts's env allowlist is ANTHROPIC_API_KEY, HOME, PATH), so there is no
 * other host a claude_code turn could be pointed at.
 */
export const ANTHROPIC_API_HOST = 'api.anthropic.com';

/** The facts an egress plan is derived from — all of them, as arguments. */
export interface EgressFacts {
  /** The turn's driver; decides where its model provider lives. */
  readonly driver?: string;
  /** AGENT_PROVIDER_HOSTS — an opencode/pi turn's model provider(s). */
  readonly providerHosts: readonly string[];
  /** BUILD_REGISTRY_HOSTS — a build's package registry(ies). */
  readonly registryHosts: readonly string[];
}

export interface EgressPlan {
  /** The hostnames the gate will CONNECT to (port 443 only). */
  readonly hosts: readonly string[];
  /** Does the gate serve the MCP socket? */
  readonly mcp: boolean;
}

/**
 * A lowercase, dotted DNS name with an alphabetic TLD. The TLD rule is what refuses every
 * IPv4 literal (its last label is numeric); `:` and `[` are not in the alphabet, so no IPv6
 * literal and no port can pass either.
 */
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Special-use names that resolve to THIS host or its LAN by definition (RFC 6761 localhost,
 * RFC 6762 .local, RFC 8375 home.arpa, ICANN's reserved .internal, the conventional
 * .localdomain, RFC 6761 .invalid). The gate would refuse their answers anyway — every one is
 * a private address — but a plan that names one is a misconfiguration to say at the door.
 */
const LOCAL_SUFFIXES: readonly string[] = Object.freeze([
  'localhost',
  'local',
  'internal',
  'home.arpa',
  'localdomain',
  'invalid',
]);

/**
 * Why `host` cannot be on an egress plan, or null when it can. Exported so the config parse
 * (`src/config.ts`) and the provisioner's schema refuse the same things the plan does.
 */
export function hostProblem(host: string): string | null {
  const bare = host.replace(/^\[|\]$/g, '');
  if (isIP(bare) !== 0) return `'${host}' is an IP literal — egress is by HOSTNAME only`;
  if (host === 'any' || host.includes('*')) return `'${host}' is a wildcard — a plan names hosts`;
  if (LOCAL_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`))) {
    return `'${host}' is a local special-use name — it resolves to this host or its LAN`;
  }
  if (!HOSTNAME.test(host)) {
    return `'${host}' is not a lowercase dotted DNS hostname (at least two labels, alphabetic TLD)`;
  }
  return null;
}

/** A comma-separated host list (a config value) → trimmed, lowercased, deduplicated entries. */
export function parseHostList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map(entry => entry.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

/**
 * The database directories a distro keeps its server SOCKET in outside `/run`, `/tmp` and
 * `/home` — made inaccessible in every unit, on every door. Masking a whole data directory is
 * deliberate: nothing a confined run does has any business there. (An engine socket an
 * operator places elsewhere is SITE_BUILDER_INSTANCES §10 residual 6a.)
 */
export const DATABASE_SOCKET_DIRS: readonly string[] = Object.freeze([
  '/var/lib/mysql', // RHEL/Fedora MariaDB & MySQL: mysql.sock
  '/var/lib/mariadb',
  '/var/lib/pgsql', // RHEL PostgreSQL's home
  '/var/lib/postgresql', // Debian PostgreSQL's home
]);

/** Every host a door's plan is built from, before the grammar is applied. */
function candidateHosts(door: ConfinementDoor, facts: EgressFacts): { key: string; hosts: string[] } {
  if (door === 'git') return { key: '', hosts: [] };
  if (door === 'build') {
    const hosts = facts.registryHosts.length > 0 ? [...facts.registryHosts] : [...DEFAULT_REGISTRY_HOSTS];
    return { key: 'BUILD_REGISTRY_HOSTS', hosts };
  }
  const driver = facts.driver ?? 'claude_code';
  if (driver === 'claude_code') return { key: 'claude_code', hosts: [ANTHROPIC_API_HOST] };
  return { key: 'AGENT_PROVIDER_HOSTS', hosts: [...facts.providerHosts] };
}

/**
 * Everything wrong with a door's plan, in words an operator acts on. Empty = the plan is
 * sound. Called by `confinementProblems()`, so a host whose plan cannot work refuses the
 * REQUEST instead of starting a unit that can reach nothing.
 */
export function planProblems(door: ConfinementDoor, facts: EgressFacts): string[] {
  const problems: string[] = [];
  const { key, hosts } = candidateHosts(door, facts);
  for (const host of hosts) {
    const problem = hostProblem(host);
    if (problem) problems.push(`${key}: ${problem}.`);
  }
  if (door === 'turn' && key === 'AGENT_PROVIDER_HOSTS' && hosts.length === 0) {
    problems.push(
      `AGENT_PROVIDER_HOSTS is empty, so a '${facts.driver}' turn has no model provider it may ` +
        `reach: egress is by hostname only, through the daemon's gate. Name the provider's API ` +
        `host(s), comma-separated (instance.json agent.provider_hosts on a provisioned host).`,
    );
  }
  return problems;
}

/**
 * THE PLAN — the hostnames the gate will tunnel to for this door, and whether it serves MCP.
 * Hosts that fail the grammar are DROPPED here (and named by `planProblems`): a plan never
 * carries an IP literal, a loopback name or a wildcard, whoever built the facts.
 */
export function egressPlanFor(door: ConfinementDoor, facts: EgressFacts): EgressPlan {
  const { hosts } = candidateHosts(door, facts);
  return Object.freeze({
    hosts: Object.freeze([...new Set(hosts)].filter(host => hostProblem(host) === null)),
    mcp: DOOR_PROFILE[door].mcp,
  });
}

/**
 * Why `path` cannot be ONE `BindPaths=` source (absolute, no whitespace, no ':'), or null.
 * Exported so `confinementProblems()` refuses a runtime directory that could never be bound
 * BEFORE a run opens anything, instead of the renderer throwing mid-run.
 */
export function bindablePathProblem(path: string): string | null {
  if (!path.startsWith('/') || /[\s:]/.test(path)) {
    return `'${path}' is not an absolute path free of whitespace and ':' — it would not survive systemd's BindPaths= grammar as one source`;
  }
  return null;
}

function assertBindablePath(path: string): void {
  const problem = bindablePathProblem(path);
  if (problem) throw new Error(`network_profile: egress dir ${problem}.`);
}

/**
 * THE UNIT'S NETWORK PROPERTIES, for one door — `K=V` strings, rendered by confinement.ts as
 * `--property=K=V`. The complete list: no other network property is rendered anywhere.
 */
export function unitNetworkProperties(
  door: ConfinementDoor,
  opts: { egressDir?: string; pidNamespace: boolean },
): string[] {
  const profile = DOOR_PROFILE[door];
  if (!profile) throw new Error(`network_profile: unknown door '${String(door)}'`);
  if (typeof opts?.pidNamespace !== 'boolean') {
    throw new Error(`network_profile: whether PID 1 renders a PID namespace must be STATED (pidNamespace), never defaulted`);
  }
  const props = [
    'PrivateNetwork=yes',
    'PrivateIPC=yes',
    // EXTRA, not required (see the header): the per-site uid is what hides another site's
    // live run; this adds a namespace on top where PID 1 knows the key.
    ...(opts.pidNamespace ? ['PrivatePIDs=yes'] : []),
    'TemporaryFileSystem=/run:ro',
    // PrivateDevices= (confinement.ts) binds the HOST's /dev/shm back into its private /dev:
    // a world-writable tmpfs every unit and the host share, where a path socket or a 0666 file
    // is a cross-museum channel no netns closes. A per-unit tmpfs instead — mode 1777 so POSIX
    // shared memory (shm_open) still works inside the unit, for the unit alone.
    'TemporaryFileSystem=/dev/shm:mode=1777,nosuid,nodev',
    `InaccessiblePaths=${DATABASE_SOCKET_DIRS.map(dir => `-${dir}`).join(' ')}`,
    'IPAddressDeny=any',
  ];
  if (profile.proxy) {
    if (!opts.egressDir) {
      throw new Error(`network_profile: the '${door}' door reaches the outside only through its egress dir, and none was given`);
    }
    assertBindablePath(opts.egressDir);
    props.push(
      // Inside the namespace, `localhost` is the unit's OWN lo — the shim's forwards.
      'IPAddressAllow=localhost',
      // READ-ONLY: connect(2) to a unix socket needs no writable mount, so the site's own run
      // cannot plant in the directory its gate serves from. The source is root's (provisioned).
      `BindReadOnlyPaths=${opts.egressDir}:${EGRESS_MOUNT}`,
      // AF_NETLINK so the shim can enumerate its interfaces (getifaddrs is a netlink query)
      // — inside a private namespace it sees only that namespace's own links.
      'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK',
    );
  } else {
    if (opts.egressDir) {
      throw new Error(`network_profile: the '${door}' door reaches nothing and must not be given an egress dir`);
    }
    // No inet family at all: git reaches nothing. AF_NETLINK only for the shim's own
    // interface enumeration (see above).
    props.push('RestrictAddressFamilies=AF_UNIX AF_NETLINK');
  }
  return props;
}

/**
 * The egress half of the child's environment: every HTTP client the agent or a build tool
 * uses is pointed at the shim's loopback proxy. A client that ignores these variables has NO
 * network at all (fail-closed), never a direct route.
 */
export function childEgressEnv(door: ConfinementDoor, driver?: string): Record<string, string> {
  if (!DOOR_PROFILE[door]?.proxy) return {};
  const proxy = `http://127.0.0.1:${PROXY_PORT}`;
  const env: Record<string, string> = {
    HTTPS_PROXY: proxy,
    https_proxy: proxy,
    HTTP_PROXY: proxy,
    http_proxy: proxy,
    NO_PROXY: '127.0.0.1,localhost',
    no_proxy: '127.0.0.1,localhost',
    // Node ≥ 24 honours HTTP(S)_PROXY for its built-in fetch only when asked.
    NODE_USE_ENV_PROXY: '1',
  };
  // Telemetry, auto-updaters, catalogue fetches and share uploads are hosts the plan does not
  // name: turned off rather than refused one CONNECT at a time (and a share upload is a
  // disclosure, not only a refused host).
  if (door === 'turn' && (driver ?? 'claude_code') === 'claude_code') {
    env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
    env.DISABLE_AUTOUPDATER = '1';
  }
  if (door === 'turn' && driver === 'opencode') {
    // Names read off the opencode 1.18 binary's own flag table. What CANNOT be turned off:
    // opencode installs a provider's SDK package from registry.npmjs.org on first use of that
    // provider — a museum whose agent HOME has not cached it names the registry in
    // AGENT_PROVIDER_HOSTS too (SITE_BUILDER_INSTANCES §6).
    env.OPENCODE_DISABLE_AUTOUPDATE = '1';
    env.OPENCODE_DISABLE_MODELS_FETCH = '1';
    env.OPENCODE_DISABLE_LSP_DOWNLOAD = '1';
    env.OPENCODE_DISABLE_SHARE = '1';
  }
  return env;
}

/**
 * THE PER-SITE SOCKET DIRECTORY: `<agentSocketDir>/egress/s<k>`.
 *
 * One per SITE identity, not per run: a site's runs never overlap (PID 1 serializes them). It
 * is ROOT's — provisioned (a tmpfiles.d line), root:<site's PRIVATE group> 0770 under a root
 * 0755 `egress/` — because it is the source of the unit's bind, which PID 1 resolves as root:
 * a directory the daemon's uid could rename is one it could re-point. The daemon writes its
 * sockets into it by group membership (0660, `src/egress/gate.ts`), the DAC layer under the
 * `/run` mask, and refuses to open a gate on anything else (`provisionedDirProblem`).
 */
export function egressDirFor(agentSocketDir: string, k: number): string {
  if (!Number.isInteger(k) || k < 1 || k > 999) throw new Error(`network_profile: ${String(k)} is not a site ordinal`);
  return join(agentSocketDir, 'egress', `s${k}`);
}
