/**
 * THE AGENT UNITS — root-rendered files that decide what an agent run IS, so the daemon never
 * has to (LEAD-1b, spec §2.2).
 *
 * WHAT THEY REPLACE. An agent run used to be a TRANSIENT unit the daemon asked PID 1 to start
 * (`systemd-run --uid=<agent>`), authorized by a polkit grant of "start" — and polkit is shown
 * a transient unit's name and verb, never the uid it would run as, so that grant was root (F2).
 * No rule can bind the run-as uid; so the uid is not asked for at all. Root renders, per
 * declared site k and door d ∈ {turn, build, git}:
 *
 *   - `<prefix>s<k>-<d>.socket` — `Accept=yes`, `MaxConnections=1`, the service user's alone
 *     (0600). The daemon connects to it; PID 1 accepts the connection into a fresh instance
 *     of the template. `MaxConnections=1` is released only when that instance is DEAD, so at
 *     most one run per (site, door) is ever alive. `PartOf=` the daemon's unit: a stop of the
 *     daemon puts a STOP job on every socket in the same transaction, and a socket with a
 *     stop pending accepts nothing (socket.c `socket_enter_running`) — so no connect made
 *     while the daemon is being stopped can activate an instance whose `BindsTo=` would pull
 *     in a START of the daemon and cancel its stop. The daemon's unit `Wants=` them back.
 *   - `<prefix>s<k>-<d>.target` — `Conflicts=` with the site's other two doors, ordered, so
 *     starting one door stops the others and waits for them to be dead first: at most one run
 *     per SITE is ever alive, enforced by PID 1 (systemd.unit(5): a stop is ordered before a
 *     start whenever the two units have any ordering dependency).
 *   - `<prefix>s<k>-<d>@.service` — `User=` the site's identity (a string in a root-owned
 *     file, not a parameter anyone passes), `BindsTo=` its door target AND the daemon's own
 *     unit (see CRASH CLEANUP below for what that does and does not enforce), the whole hardening set, the door's network
 *     profile (`drivers/network_profile.ts`, verbatim), the per-run caps and a
 *     `RuntimeMaxSec` of the door's ceiling + 15 s. ExecStart is this daemon's own pinned
 *     runtime and the shim, which reads the run's argv and environment off the connection
 *     (`drivers/unit_frames.ts`) — so NO FILE is handed to PID 1 (no `EnvironmentFile=`, no
 *     `StandardOutput=file:`, no credential), and no secret rides a unit property.
 *
 * CRASH CLEANUP — WHAT `BindsTo=` THE DAEMON ENFORCES, BY PID 1's RELEASE. A `systemctl stop` or
 * `restart` of the daemon stops every live run first, on every release (the stop job propagates).
 * A CRASH of the `Restart=always` daemon (SIGSEGV, the OOM killer) differs: from systemd 254 the
 * unit passes through failed/inactive before its auto-restart (`RestartMode=normal`, the default),
 * so `BindsTo=` stops its runs; BELOW 254 (Ubuntu 22.04 = 249, Debian 12 / RHEL 9 = 252 … up to
 * 253) an auto-restart moves active → activating without ever leaving the active set, and
 * `BindsTo=` stops NOTHING. There, a crash's cleanup is (1) the shim, which kills the child's
 * process group on EOF of the daemon's connection (which a crash closes), and (2) the restarted
 * daemon's boot reconcile (`reconcileAgentUnits` → `proveIdle`, BEFORE it listens), which stops
 * or quarantines any leftover instance. (2) is the load-bearing layer on EVERY release; a child
 * that SIGSTOPs its same-uid shim outlives (1) and is bounded by the quarantine and RuntimeMaxSec.
 * `BindsTo=` the daemon is kept for the stop path and for ≥ 254, never counted on below it.
 *
 * EGRESS. A proxy door's gate directory `<agentSocketDir>/egress/s<k>` is the SOURCE of a
 * bind PID 1 resolves as root, so it is ROOT's: declared here as a tmpfiles.d line (root:<site
 * group> 0770 under a root 0755 `egress/`), applied by `provision apply` and re-created at
 * every boot in the empty `/run` — never the daemon's runtime directory, which its uid could
 * re-point. The unit binds it READ-ONLY (connect(2) needs no writable mount).
 *
 * HOME. Every unit masks the whole agent state root and binds back ONLY its own door's HOME:
 * a build cannot read or plant the turn's `~/.claude`, and no site sees another's. git gets
 * no HOME (`/nonexistent`) and no global configuration.
 *
 * FOR PID 1'S VERSION. Every key is in `drivers/unit_properties.ts`: `REQUIRED` (floor 248,
 * PrivateIPC) is always rendered and a PID 1 below it is REFUSED here, by name — a unit file
 * silently ignores a key its systemd does not know; `EXTRA` (PrivatePIDs, 257) is rendered
 * only where PID 1 has it.
 *
 * The renderer law of ./types.ts applies: pure, zero-dep, stamped, no credential. The facts it
 * needs beyond the layout — which ordinal each site holds, which release PID 1 is — arrive as
 * `RenderFacts`; without them it renders NOTHING (fail-closed: no unit, no run).
 */

import { join } from 'node:path';
import {
  agentHomeFor,
  agentIdentityName,
  agentSocketPath,
  agentUnitNames,
  egressDirForSite,
  turnMaskedPaths,
  unitFixedEnvironment,
} from '../../drivers/agent_identity';
import { CGROUPFS_MASK, DOOR_PROFILE, DOORS, type ConfinementDoor, unitNetworkProperties } from '../../drivers/network_profile';
import { extraRendered, floorRefusal, renderedKeys, SYSTEMD_FLOOR } from '../../drivers/unit_properties';
import type { InstanceLayout, InstanceManifest } from '../layout';
import { CPU_QUOTA_PATTERN, SYSTEMD_SIZE_PATTERN, UNIX_NAME_PATTERN } from '../layout';
import type { Artifact, Renderer, RenderFacts } from './types';
import { artifact } from './types';

/** The shim, relative to the daemon's working directory (this package). */
export const SHIM_RELATIVE = join('src', 'drivers', 'egress_shim.ts');

/** A unit's stop timeout. The daemon's hello wait (30 s) covers a Conflicts= stop of it. */
export const AGENT_UNIT_TIMEOUT_STOP_SEC = 10;

/** PID 1 re-arms a socket after this many drops in the interval; the daemon connects once per run. */
export const TRIGGER_LIMIT = Object.freeze({ intervalSec: 2, burst: 20 });

/** Seconds PID 1 lets a run outlive the daemon's own timer before it kills the unit. */
export const RUNTIME_MARGIN_SEC = 15;

/** `RuntimeMaxSec=` for a door: its ceiling (ms, rounded up to whole seconds) + the margin. */
export function runtimeMaxSec(ceilingMs: number): number {
  return Math.ceil(ceilingMs / 1000) + RUNTIME_MARGIN_SEC;
}

/** Target ordering: turn after build and git, build after git — any ordering orders stop before start. */
const AFTER: Readonly<Record<ConfinementDoor, readonly ConfinementDoor[]>> = Object.freeze({
  turn: ['build', 'git'],
  build: ['git'],
  git: [],
});

const CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * A path value: absolute, with no whitespace, quote, backslash, control character or `%`.
 * REFUSED rather than escaped: the daemon compares what PID 1 loaded against these very
 * strings (conformance), and a `%` specifier escaped here would be a path the two sides spell
 * differently.
 */
function unitPath(label: string, value: string): string {
  if (typeof value !== 'string' || !value.startsWith('/') || CONTROL.test(value) || /[\s"'\\%]/.test(value)) {
    throw new Error(
      `render(agent_units): ${label} ('${String(value)}') must be an absolute path with no whitespace, ` +
        `quote, backslash, '%' or control character — unit path directives cannot carry one. Nothing was rendered.`,
    );
  }
  return value;
}

function matching(pattern: RegExp, label: string, value: string): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(`render(agent_units): ${label} '${String(value)}' does not match ${pattern.source}. Nothing was rendered.`);
  }
  return value;
}

/** A fixed-environment value: a path (held to the path grammar) or a bare word. */
function envValue(key: string, value: string): string {
  if (value.startsWith('/')) return unitPath(key, value);
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`render(agent_units): the fixed ${key} '${value}' is neither a path nor a bare word. Nothing was rendered.`);
  }
  return value;
}

/** A network property line from the leaf: its path values are held to the same grammar. */
function networkLine(prop: string): string {
  if (CONTROL.test(prop) || prop.includes('%')) {
    throw new Error(`render(agent_units): a network property carries a control character or a '%'. Nothing was rendered.`);
  }
  return prop;
}

export const agentUnitsRenderer: Renderer = {
  kind: 'agent_units',

  render(layout: InstanceLayout, _manifest: InstanceManifest, facts?: RenderFacts): Artifact[] {
    if (!facts) return [];
    const version = facts.systemdVersion;
    if (!Number.isInteger(version) || version < SYSTEMD_FLOOR) {
      throw new Error(`render(agent_units): ${floorRefusal(version)}`);
    }
    const declared = new Map(layout.sites.map(site => [site.slug, site]));
    const svcUser = matching(UNIX_NAME_PATTERN, 'identity.user', layout.identity.user);
    const svcGroup = matching(UNIX_NAME_PATTERN, 'identity.group', layout.identity.group);
    const bun = unitPath('the pinned bun binary', layout.daemon.bun);
    const shim = unitPath('the shim', join(layout.daemon.workingDirectory, SHIM_RELATIVE));
    const stateRoot = unitPath('the agent state root', layout.agentStateRoot);
    const socketDir = unitPath('the agent socket directory', layout.agentSocketDir);
    const caps = layout.agentRunCaps;
    const memoryMax = matching(SYSTEMD_SIZE_PATTERN, 'the per-run MemoryMax', caps.memoryMax);
    const cpuQuota = matching(CPU_QUOTA_PATTERN, 'the per-run CPUQuota', caps.cpuQuota);
    if (!Number.isInteger(caps.tasksMax) || caps.tasksMax < 1) throw new Error('render(agent_units): the per-run TasksMax is not a positive integer.');

    const ordinals = new Set<number>();
    const artifacts: Artifact[] = [];
    const entries = [...facts.agentIdentities.entries()].sort((a, b) => a[1] - b[1]);
    for (const [slug, k] of entries) {
      if (!declared.has(slug)) {
        throw new Error(
          `render(agent_units): the identity facts bind '${slug}' (s${k}), which instance '${layout.instance}' ` +
            `does not declare. Units for an undeclared site are a run nobody may start. Nothing was rendered.`,
        );
      }
      if (ordinals.has(k)) {
        throw new Error(`render(agent_units): two sites hold ordinal ${k}. One identity is one site. Nothing was rendered.`);
      }
      ordinals.add(k);
      const identity = agentIdentityName(layout.instance, k);
      const workspace = unitPath(`site '${slug}'s workspace`, join(layout.roots.workspaces, slug));
      const header = (what: string) => [
        `# GENERATED by publication/site_builder/src/provision/render/agent_units.ts — do NOT edit.`,
        `#`,
        `# Instance ${layout.instance}, site '${slug}' (identity ${identity}, s${k}): ${what}.`,
        `# Rendered by ROOT from ${layout.manifestPath} and the host's identity ledger. A hand`,
        `# edit is drift, re-rendered away; the daemon also refuses to run a unit whose LOADED`,
        `# properties differ from what it expects (conformance): every property rendered here, and`,
        `# the hooks, groups, capabilities, namespaces and credentials a drop-in could add.`,
      ];

      for (const door of DOORS) {
        const names = agentUnitNames(layout.agentUnitPrefix, k, door);
        const others = DOORS.filter(other => other !== door).map(other => agentUnitNames(layout.agentUnitPrefix, k, other).target);
        const after = AFTER[door].map(other => agentUnitNames(layout.agentUnitPrefix, k, other).target);

        /* ── the socket ─────────────────────────────────────────────────────────── */
        const socket = [
          ...header(`the ${door} door's socket`),
          `#`,
          `# The daemon connects here ONCE per run and starts nothing: PID 1 accepts the`,
          `# connection into one instance of ${names.template}. MaxConnections=1 is released`,
          `# only when that instance is dead, so one run per (site, door) at most; a connection`,
          `# over it is accepted and dropped. The socket is the service user's alone (0600).`,
          ``,
          `[Unit]`,
          `Description=Dedalo site agent socket - ${layout.instance} s${k} ${door}`,
          `# Stopped WITH the daemon, in its transaction: a socket with a stop pending accepts no`,
          `# connection, so nothing activated during the daemon's stop can cancel it.`,
          `PartOf=${layout.unitName}`,
          ``,
          `[Socket]`,
          `ListenStream=${unitPath('the socket path', agentSocketPath(socketDir, k, door))}`,
          `Accept=yes`,
          `MaxConnections=1`,
          `SocketUser=${svcUser}`,
          `SocketGroup=${svcGroup}`,
          `SocketMode=0600`,
          `DirectoryMode=0755`,
          `TriggerLimitIntervalSec=${TRIGGER_LIMIT.intervalSec}s`,
          `TriggerLimitBurst=${TRIGGER_LIMIT.burst}`,
          ``,
          `[Install]`,
          `WantedBy=sockets.target`,
        ];

        /* ── the target ─────────────────────────────────────────────────────────── */
        const target = [
          ...header(`the ${door} door's exclusion target`),
          `#`,
          `# A site's doors never run together: starting this target stops the other two`,
          `# (Conflicts=), and the ordering makes PID 1 wait for them to be DEAD before this`,
          `# door's run is started.`,
          ``,
          `[Unit]`,
          `Description=Dedalo site agent door - ${layout.instance} s${k} ${door}`,
          `Conflicts=${others.join(' ')}`,
          ...(after.length > 0 ? [`After=${after.join(' ')}`] : []),
          `StopWhenUnneeded=yes`,
        ];

        /* ── the template ───────────────────────────────────────────────────────── */
        const profile = DOOR_PROFILE[door];
        const network = unitNetworkProperties(door, {
          ...(profile.proxy ? { egressDir: unitPath('the egress directory', egressDirForSite(socketDir, k)) } : {}),
          pidNamespace: extraRendered('PrivatePIDs', version),
        });
        const fixedEnv = unitFixedEnvironment({ door, workspace, agentStateRoot: stateRoot, k });
        const ceilingMs = layout.doorCeilingsMs[door];
        const template = [
          ...header(`one ${door} run (a template; PID 1 instantiates it per accepted connection)`),
          ``,
          `[Unit]`,
          `Description=Dedalo site agent run - ${layout.instance} s${k} ${door}`,
          `# Bound to its door (the site's exclusion) and to the daemon: a stop of the daemon stops its runs;`,
          `# a CRASH does so only on systemd >= 254 — below, the daemon's boot reconcile is the cleanup.`,
          `BindsTo=${names.target} ${layout.unitName}`,
          `After=${names.target} ${layout.unitName}`,
          `CollectMode=inactive-or-failed`,
          ``,
          `[Service]`,
          `Type=exec`,
          `# WHO: fixed here, by root. The daemon cannot choose it.`,
          `User=${matching(UNIX_NAME_PATTERN, 'the site identity', identity)}`,
          `# In '/', never the workspace: Bun must load no agent-authored bunfig/.env before the`,
          `# shim has proved the namespace. The shim runs the argv in DEDALO_UNIT_WORKDIR.`,
          `WorkingDirectory=/`,
          `StandardInput=socket`,
          `StandardOutput=socket`,
          `StandardError=journal`,
          `TimeoutStopSec=${AGENT_UNIT_TIMEOUT_STOP_SEC}`,
          `# A run is over when its CGROUP is empty: the stop reaches every process of it, and ends`,
          `# in SIGKILL. (systemd's defaults — stated, because the daemon compares them.)`,
          `KillMode=control-group`,
          `KillSignal=SIGTERM`,
          `SendSIGKILL=yes`,
          `FinalKillSignal=SIGKILL`,
          `ExecStart=${bun} ${shim}`,
          `# THE FIXED ENVIRONMENT — and nothing else: the run's own environment arrives over the`,
          `# connection (the shim refuses a spec that tries to set any of these keys).`,
          ...Object.entries(fixedEnv).map(([key, value]) => `Environment=${key}=${envValue(key, value)}`),
          `NoNewPrivileges=yes`,
          `RestrictSUIDSGID=yes`,
          `LockPersonality=yes`,
          `PrivateTmp=yes`,
          `PrivateDevices=yes`,
          `ProtectSystem=strict`,
          `ProtectHome=yes`,
          `ProtectProc=invisible`,
          `UMask=0007`,
          `# WHAT IT MAY WRITE: its own site's workspace — and its own door's HOME, bound below.`,
          `ReadWritePaths=${workspace}`,
          `# The whole agent state root is masked; only this door's own HOME comes back.`,
          `TemporaryFileSystem=${stateRoot}:ro`,
          `# cgroupfs too: ProtectProc= hides another uid's /proc/<pid>, not /sys/fs/cgroup, where every`,
          `# site's run is a directory whose cgroup.procs, cpu.stat and memory.current are world-readable.`,
          `TemporaryFileSystem=${CGROUPFS_MASK}`,
          ...(door === 'git' ? [] : [`BindPaths=${unitPath('the door HOME', agentHomeFor(stateRoot, k, door))}`]),
          ...network.map(networkLine),
          ...(door === 'turn'
            ? [
                `# THE TURN'S OWN git SEES NO REPOSITORY: the agent CLI runs git itself and would run a`,
                `# planted .git/config filter (no '-': a workspace without .git does not start a turn).`,
                `InaccessiblePaths=${turnMaskedPaths(workspace).map(path => unitPath('the turn-masked repository', path)).join(' ')}`,
              ]
            : []),
          `MemoryMax=${memoryMax}`,
          `CPUQuota=${cpuQuota}`,
          `TasksMax=${caps.tasksMax}`,
          `RuntimeMaxSec=${runtimeMaxSec(ceilingMs)}`,
        ];

        for (const [name, lines] of [
          [names.socket, socket],
          [names.target, target],
          [names.template, template],
        ] as const) {
          artifacts.push(
            artifact(layout, {
              kind: 'agent_units',
              path: join(dirnameOf(layout.unitPath), name),
              // Read by PID 1 as root: 0644 root:root, like the daemon's own unit.
              mode: 'hostConfig',
              body: `${lines.join('\n')}\n`,
            }),
          );
        }
      }
    }

    assertOnlyKnownKeys(artifacts, version);

    /* ── the egress directories, root's (systemd-tmpfiles) ───────────────────────────── */
    const egressBase = unitPath('the egress base', join(socketDir, 'egress'));
    const tmpfiles = [
      `# GENERATED by publication/site_builder/src/provision/render/agent_units.ts — do NOT edit.`,
      `#`,
      `# Instance ${layout.instance}: the sites' egress gate directories. Each is the SOURCE of a`,
      `# bind PID 1 resolves AS ROOT when it sets up a site's unit, so it is root's and nothing`,
      `# the daemon's uid can rename or re-point (it writes its sockets in by group membership).`,
      `# /run is empty at every boot: these lines re-create them; provision apply applies them.`,
      `d ${socketDir} 0755 root root -`,
      `d ${egressBase} 0755 root root -`,
      ...entries.map(
        ([, k]) =>
          `d ${unitPath('an egress directory', egressDirForSite(socketDir, k))} 0770 root ${matching(UNIX_NAME_PATTERN, 'a private group', agentIdentityName(layout.instance, k))} -`,
      ),
    ];
    artifacts.push(
      artifact(layout, {
        kind: 'agent_units',
        path: layout.agentTmpfilesPath,
        // Read by systemd-tmpfiles as root: 0644 root:root, like the units.
        mode: 'hostConfig',
        body: `${tmpfiles.join('\n')}\n`,
      }),
    );
    return artifacts;
  },
};

/** The unit directory: the directory the daemon's own unit is installed in. */
function dirnameOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/')) || '/';
}

/**
 * EVERY KEY RENDERED IS A KEY WITH A STATED RELEASE, and none is newer than PID 1. A key
 * outside `unit_properties.ts` would be a property whose absence on an older host nobody
 * checks — a unit file ignores what its systemd does not know.
 */
function assertOnlyKnownKeys(artifacts: readonly Artifact[], version: number): void {
  const allowed = new Set(renderedKeys(version));
  for (const produced of artifacts) {
    if (!/\.(socket|target|service)$/.test(produced.path)) continue;
    for (const raw of produced.body.split('\n')) {
      const line = raw.trim();
      if (line === '' || line.startsWith('#') || line.startsWith('[')) continue;
      const key = line.slice(0, line.indexOf('='));
      if (!allowed.has(key)) {
        throw new Error(
          `render(agent_units): '${key}=' in ${produced.path} has no stated systemd release in ` +
            `drivers/unit_properties.ts (or is newer than PID 1 ${version}). Nothing was rendered.`,
        );
      }
    }
  }
}
