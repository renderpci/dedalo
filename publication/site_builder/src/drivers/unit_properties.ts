/**
 * THE SYSTEMD RELEASE EVERY RENDERED AGENT-UNIT KEY NEEDS — split into what a confined unit
 * REQUIRES and what it renders as an EXTRA layer (LEAD-1b, spec §2.8).
 *
 * WHY IT EXISTS. A unit FILE silently ignores a key its systemd does not know (where
 * `systemd-run` refused it). A host below the floor would therefore run units that lack a
 * property this daemon believes they have — so the floor is refused up front
 * (`confinement.ts` confinementProblems, `render/agent_units.ts`), and what PID 1 actually
 * LOADED is checked before every run (`confinement.ts` conformance).
 *
 * THE SPLIT. `REQUIRED` is every key the renderer writes into a socket, target or template on
 * any host; `SYSTEMD_FLOOR = max(REQUIRED) = 248` (PrivateIPC). `EXTRA = {PrivatePIDs: 257}`
 * is rendered only when PID 1 is 257 or newer: concurrent runs are kept apart by per-site
 * uids that PID 1 serializes per site (MaxConnections=1 and door-target Conflicts=), which do
 * not depend on a PID namespace — so its absence on 255 (Ubuntu 24.04, Debian 12) is the
 * accepted posture, not a refusal. A package gate holds the key set EQUAL to what the
 * renderer writes at 255 (REQUIRED) and at 257 (REQUIRED ∪ EXTRA), so a key cannot be added
 * without stating its release, and a stale entry cannot hold the floor up.
 *
 * Each value is the release that introduced the setting (systemd NEWS). `ANCIENT` marks the
 * ones every systemd this could ever meet has had (209 is an upper bound, not their release):
 * the floor is decided by the newest, and those are exact.
 *
 * BUILTINS ONLY: the renderer (zero-dep), the daemon and the repo tripwire import it.
 */

const ANCIENT = 209;

export const REQUIRED: Readonly<Record<string, number>> = Object.freeze({
  // [Unit] / [Install]
  Description: ANCIENT,
  After: ANCIENT,
  BindsTo: ANCIENT,
  PartOf: ANCIENT,
  Conflicts: ANCIENT,
  StopWhenUnneeded: ANCIENT,
  CollectMode: 236,
  WantedBy: ANCIENT,
  // [Socket]
  ListenStream: ANCIENT,
  Accept: ANCIENT,
  MaxConnections: ANCIENT,
  SocketUser: 214,
  SocketGroup: 214,
  SocketMode: ANCIENT,
  DirectoryMode: ANCIENT,
  TriggerLimitIntervalSec: 230,
  TriggerLimitBurst: 230,
  // [Service] — identity and I/O. `Type=exec` is what is rendered, younger than the key.
  Type: 240,
  User: ANCIENT,
  WorkingDirectory: ANCIENT,
  StandardInput: ANCIENT,
  StandardOutput: ANCIENT,
  StandardError: ANCIENT,
  TimeoutStopSec: ANCIENT,
  KillMode: ANCIENT,
  KillSignal: ANCIENT,
  SendSIGKILL: ANCIENT,
  FinalKillSignal: 243,
  ExecStart: ANCIENT,
  Environment: ANCIENT,
  // [Service] — hardening (the transient argv's set, minus EnvironmentFile and PrivatePIDs).
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
  BindReadOnlyPaths: 233,
  IPAddressAllow: 235,
  IPAddressDeny: 235,
  LockPersonality: 235,
  TemporaryFileSystem: 238,
  RestrictSUIDSGID: 242,
  ProtectProc: 247,
  PrivateIPC: 248,
});

/** Rendered only where PID 1 is at least this release. Never part of the floor. */
export const EXTRA: Readonly<Record<string, number>> = Object.freeze({
  PrivatePIDs: 257,
});

/** The oldest systemd a confined unit is rendered for: the newest REQUIRED key's release. */
export const SYSTEMD_FLOOR: number = Math.max(...Object.values(REQUIRED));

/** The REQUIRED keys a systemd of `version` does not know, newest first. EXTRA never counts. */
export function propertiesNewerThan(version: number): string[] {
  return Object.entries(REQUIRED)
    .filter(([, since]) => since > version)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([name, since]) => `${name}= (${since})`);
}

/** Every key a unit rendered for PID 1 `version` may carry. */
export function renderedKeys(version: number): string[] {
  return [
    ...Object.keys(REQUIRED),
    ...Object.entries(EXTRA)
      .filter(([, since]) => version >= since)
      .map(([name]) => name),
  ].sort();
}

/** Is the EXTRA layer `key` rendered for PID 1 `version`? */
export function extraRendered(key: keyof typeof EXTRA | string, version: number): boolean {
  const since = EXTRA[key];
  return since !== undefined && version >= since;
}

/** The refusal text for a PID 1 below the floor (one wording, three callers). */
export function floorRefusal(version: number): string {
  return (
    `systemd ${version} (PID 1) is older than ${SYSTEMD_FLOOR}, the newest property a confined ` +
    `unit REQUIRES (${propertiesNewerThan(version).join(', ')}). No run was started. Upgrade ` +
    `systemd. PrivatePIDs= (${EXTRA.PrivatePIDs}) is an EXTRA layer rendered only on ` +
    `>= ${EXTRA.PrivatePIDs}: concurrent runs are kept apart by per-site uids that PID 1 ` +
    `serializes, which do not depend on it.`
  );
}
