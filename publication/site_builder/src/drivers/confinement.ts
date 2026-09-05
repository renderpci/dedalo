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
 *   - THE EGRESS. `IPAddressAllow=any` with the host's own loopback and every private range
 *     DENIED (longest-prefix wins, so the deny of a /8 beats the allow of any). The agent
 *     may talk to the model provider it exists to call and to the public web; it may NOT
 *     reach the engine, the databases, the other museums' sockets or the museum's LAN. The
 *     Publication API — its one legitimate local destination — is allowed back explicitly,
 *     derived from PUBLICATION_API_URL, and a museum whose API answers on some other
 *     private address states it in AGENT_EGRESS_ALLOW.
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

import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { dirname, isAbsolute, join } from 'node:path';
import { config } from '../config';
import { ConfinementUnavailableError } from '../errors';
import { CONFINED_ARGV, runBinary, type SpawnResult } from '../util/spawn';

/** The grammar the rendered unit prefix is held to at both ends (see layout.ts). */
const UNIT_PREFIX_PATTERN = /^[a-z][a-z0-9-]{2,60}-$/;

/** Anything that cannot survive inside one line of a systemd EnvironmentFile. */
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/**
 * WHERE A TURN MAY NOT GO, whatever else is allowed.
 *
 * Loopback first, because that is where this host keeps the things a museum's agent must
 * never reach: the engine's socket, Postgres, MariaDB, the other instances' daemons and
 * this daemon itself. Then the private ranges — the museum's LAN, its NAS, its router's
 * admin page — and the link-local block that carries a cloud host's metadata service,
 * which is the single most valuable unauthenticated endpoint on a rented machine.
 *
 * Stated as prefixes rather than as "deny everything and list what is allowed", because the
 * destination the agent legitimately needs is a model provider's global anycast estate: an
 * allowlist of it does not exist, cannot be maintained by a museum, and would be answered
 * on every host by someone widening it back to `any`.
 */
export const EGRESS_DENY: readonly string[] = Object.freeze([
  'localhost',
  'link-local',
  'multicast',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '100.64.0.0/10',
  '169.254.0.0/16',
  'fc00::/7',
  'fe80::/10',
]);

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
  readonly publicationApiUrl: string;
  readonly egressAllow: string;
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
    publicationApiUrl: config.PUBLICATION_API_URL,
    egressAllow: config.AGENT_EGRESS_ALLOW,
    memoryMax: config.AGENT_TURN_MEMORY_MAX,
    cpuQuota: config.AGENT_TURN_CPU_QUOTA,
    tasksMax: config.AGENT_TURN_TASKS_MAX,
  };
}

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
  /** Deletes the per-turn secret file. Always called, on every exit path. */
  cleanup(): Promise<void>;
}

/**
 * IS A CONFINED TURN POSSIBLE ON THIS HOST, RIGHT NOW?
 *
 * Called by the session manager BEFORE it reserves a workspace or a concurrency slot, so a
 * host that cannot confine answers 503 to the request instead of accepting a session and
 * failing it asynchronously. `confineTurn()` asks the same questions again at the spawn —
 * this one is the courtesy, that one is the guarantee.
 */
export function assertTurnConfinementAvailable(policy: ConfinementPolicy = policyFromConfig()): void {
  if (policy.mode === 'none') return;
  const problems = confinementProblems(policy);
  if (problems.length > 0) throw new ConfinementUnavailableError(problems.join(' '));
}

/** Every reason this host cannot run a confined turn, in the order an operator fixes them. */
export function confinementProblems(policy: ConfinementPolicy): string[] {
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
  }
  if (policy.listenKind !== 'unix') {
    problems.push(
      `LISTEN_KIND is '${policy.listenKind}', so this daemon has no runtime directory — and ` +
        `the per-turn environment must be written to a 0600 file there rather than onto a ` +
        `command line every uid on the host can read (systemctl show).`,
    );
  }
  return problems;
}

/**
 * BUILD THE TURN. Pure decision, one side effect: the per-turn environment file.
 *
 * Under `none` it returns the driver's own argv and environment unchanged, plus the
 * announcement the supervisor must persist — the record that this turn was not confined.
 */
export async function confineTurn(
  opts: {
    argv: readonly string[];
    cwd: string;
    env: Record<string, string>;
    timeoutMs: number;
    /** What is being confined, for the announcement an unconfined run must carry. */
    label?: string;
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

  const problems = confinementProblems(policy);
  if (problems.length > 0) throw new ConfinementUnavailableError(problems.join(' '));

  const unitName = `${policy.unitPrefix}${randomUUID()}.service`;
  const runtimeDir = dirname(policy.listenSocket);
  const turnDir = join(runtimeDir, 'turns');
  const envFile = join(turnDir, `${unitName}.env`);
  await mkdir(turnDir, { recursive: true, mode: 0o700 });
  // 0600: PID 1 reads it as root; nothing else on the host may. The agent itself must not
  // read it either — it receives these values as its environment, which is a different
  // thing from being able to re-read them after the daemon has rotated one.
  await writeFile(envFile, renderEnvironmentFile(opts.env), { encoding: 'utf8', mode: 0o600 });

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
    `--working-directory=${opts.cwd}`,
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
    `--property=RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6`,
    // 0007: what the agent creates in the shared tree stays readable AND writable to this
    // museum's group — the daemon has to read those bytes back to build, promote and commit
    // them — and closed to every other uid on the host. It is the other half of
    // `util/shared_tree.ts`, which states the same two modes for what the DAEMON creates.
    `--property=UMask=0007`,
    `--property=ReadWritePaths=${opts.cwd} ${policy.agentHome}`,
    `--property=IPAddressAllow=${egressAllow(policy).join(' ')}`,
    `--property=IPAddressDeny=${EGRESS_DENY.join(' ')}`,
    '--',
    ...opts.argv,
  ];

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
    async cleanup() {
      await rm(envFile, { force: true });
    },
  };
}

/**
 * WHERE A TURN MAY GO. `any` (the model provider is global anycast and cannot be listed),
 * then the destinations that must survive the deny list above: the Publication API — the
 * turn's ONLY legitimate local reach, and the whole reason it has an MCP endpoint — plus
 * whatever else this museum declared.
 */
export function egressAllow(policy: ConfinementPolicy): string[] {
  const allow = ['any', ...publicationApiAllowTokens(policy)];
  for (const extra of policy.egressAllow.split(',')) {
    const token = extra.trim();
    if (token) allow.push(token);
  }
  return [...new Set(allow)];
}

/**
 * The Publication API's address as an `IPAddressAllow=` token, when it is derivable.
 *
 * An IP literal becomes its own host route and `localhost` becomes systemd's own name for
 * the loopback block. A DNS NAME yields nothing — deliberately: resolving it here would
 * bind a museum's egress policy to whatever the resolver answered at the moment a turn
 * started, and a name that resolves publicly is already covered by `any`. A museum whose
 * API answers on a private address behind a name states that address in AGENT_EGRESS_ALLOW,
 * which is the key that exists for exactly this case.
 */
function publicationApiAllowTokens(policy: ConfinementPolicy): string[] {
  let host: string;
  try {
    host = new URL(policy.publicationApiUrl).hostname;
  } catch {
    return [];
  }
  const bare = host.replace(/^\[|\]$/g, '');
  if (bare === 'localhost' || /^127\./.test(bare) || bare === '::1') return ['localhost'];
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bare)) return [`${bare}/32`];
  if (bare.includes(':')) return [`${bare}/128`];
  return [];
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
 * same uid, the same transient-unit grant, the same egress policy, the same caps, and the
 * same per-run 0600 environment file. What differs is the timeout the caller states.
 *
 * `util/spawn.ts` REFUSES a cwd inside `SITES_ROOT` without the token this function holds,
 * so this is not a convention a later call site can forget — it is the only way in.
 */
export async function runConfined(
  opts: {
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
    { argv: opts.argv, cwd: opts.cwd, env: opts.env, timeoutMs: opts.timeoutMs, label: opts.label },
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
    // The per-run environment residence goes away on every path — timeout and throw
    // included, which is why it is a `finally` and not a line after the await.
    await confined.cleanup();
  }
}
