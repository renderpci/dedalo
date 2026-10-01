/**
 * ONE AGENT IDENTITY PER DECLARED SITE — the names, and nothing else (LEAD-1b).
 *
 * A confined run of site `k` (a turn, a build step, a git command) is a process of the unix
 * user `dedalo-a-<instance>_<k>`, started by PID 1 from a unit ROOT rendered for that site
 * (`provision/render/agent_units.ts`). This leaf owns every string that identity is spelled
 * with, because four parties must spell it identically or the boundary is decorative:
 *
 *   - the provisioner (`provision/plan.ts`), which creates the account and its private group;
 *   - the renderers (`render/agent_units.ts`, `render/agent_authorization.ts`), which put its
 *     name into `User=` and enumerate its units in the polkit rule;
 *   - the daemon (`drivers/confinement.ts`), which connects to the site's sockets, proves its
 *     units idle and checks what PID 1 loaded;
 *   - the fleet census (`provision/fleet.ts`), which proves no two museums can be each other.
 *
 * THE NAME. `AGENT_IDENTITY_STEM + <instance> + '_' + k`: 9 + 19 + 1 + 3 = 32 characters for
 * the longest legal instance at the largest ordinal — exactly the unix ceiling, ASSERTED below
 * rather than described. `_` is outside the instance grammar, so the name parses back at its
 * last `_` to exactly the (instance, k) it was built from; the ordinal is canonical decimal
 * (no leading zero), so one ordinal has one spelling. The stem differs from the service
 * user's (`dedalo-site-`, character 8) and the retired per-museum agent's (`dedalo-agent-`,
 * character 9), so the three namespaces cannot meet.
 *
 * THE PRIVATE GROUP carries the SAME name: its only members are the service user and this
 * identity. It group-owns the site's egress gate directory and sockets (0750/0660), which is
 * the DAC layer under the unit's `/run` mask (spec §2.7).
 *
 * BUILTINS ONLY. The shim imports this file inside a confined unit, where the daemon's
 * configuration does not exist; `layout.ts` (pure, dependency-free) and `config.ts` import it
 * too, and the repo tripwire imports it directly.
 */

import { join } from 'node:path';
import { type ConfinementDoor, DOORS } from './network_profile';

/** The identity stem. `layout.ts` asserts it is `${VENDOR}-a-`, spelled from the one prefix. */
export const AGENT_IDENTITY_STEM = 'dedalo-a-';

/** The largest ordinal a site identity may carry: three decimal digits, or the name overflows. */
export const MAX_AGENT_ORDINAL = 999;

/** The Linux user-name ceiling (`useradd` refuses anything longer). Restated: builtins only. */
const MAX_NAME_LENGTH = 32;

/**
 * The instance grammar, restated for a builtins-only leaf. `layout.ts` asserts its own
 * `INSTANCE_PATTERN` has exactly this source, so the two cannot drift apart silently.
 */
export const IDENTITY_INSTANCE_SOURCE = '^[a-z][a-z0-9-]{1,18}$';
const INSTANCE = new RegExp(IDENTITY_INSTANCE_SOURCE);
const LONGEST_INSTANCE = 19;

if (AGENT_IDENTITY_STEM.length + LONGEST_INSTANCE + 1 + String(MAX_AGENT_ORDINAL).length > MAX_NAME_LENGTH) {
  throw new Error(
    `agent_identity: '${AGENT_IDENTITY_STEM}' + a ${LONGEST_INSTANCE}-character instance + '_' + ` +
      `${MAX_AGENT_ORDINAL} exceeds the ${MAX_NAME_LENGTH}-character unix user-name ceiling. Every ` +
      `identity of a long-named museum would fail at useradd, not here.`,
  );
}

/** A canonical ordinal: an integer 1..MAX_AGENT_ORDINAL. */
export function isAgentOrdinal(k: unknown): k is number {
  return typeof k === 'number' && Number.isInteger(k) && k >= 1 && k <= MAX_AGENT_ORDINAL;
}

/** Site k's identity (and private group) name. Throws on anything that is not an identity. */
export function agentIdentityName(instance: string, k: number): string {
  if (typeof instance !== 'string' || !INSTANCE.test(instance)) {
    throw new Error(`agent_identity: '${String(instance)}' is not an instance name (${IDENTITY_INSTANCE_SOURCE}).`);
  }
  if (!isAgentOrdinal(k)) {
    throw new Error(
      `agent_identity: ${String(k)} is not a site ordinal — an integer from 1 to ${MAX_AGENT_ORDINAL}. ` +
        `Ordinals are never reused, so a host whose sites have consumed ${MAX_AGENT_ORDINAL} of them ` +
        `must retire the instance rather than wrap.`,
    );
  }
  const name = `${AGENT_IDENTITY_STEM}${instance}_${k}`;
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(`agent_identity: '${name}' is ${name.length} characters; the unix ceiling is ${MAX_NAME_LENGTH}.`);
  }
  return name;
}

const PARSE = /^dedalo-a-([a-z][a-z0-9-]{1,18})_([1-9][0-9]{0,2})$/;

/** The (instance, ordinal) a canonical identity name was built from, or null for anything else. */
export function parseAgentIdentityName(name: string): { instance: string; ordinal: number } | null {
  if (typeof name !== 'string' || !name.startsWith(AGENT_IDENTITY_STEM)) return null;
  const match = PARSE.exec(name);
  if (!match) return null;
  const instance = match[1] as string;
  const ordinal = Number(match[2]);
  if (!isAgentOrdinal(ordinal)) return null;
  // Round trip: one ordinal, one spelling.
  return agentIdentityName(instance, ordinal) === name ? { instance, ordinal } : null;
}

/** GECOS of a site identity: the slug it is bound to, the ledger's only record of the binding. */
export const IDENTITY_GECOS_PREFIX = 'dedalo site ';

export function identityGecos(slug: string): string {
  return `${IDENTITY_GECOS_PREFIX}${slug}`;
}

/** The slug a GECOS field binds, or null when it is not a site identity's. */
export function slugFromGecos(gecos: string): string | null {
  if (typeof gecos !== 'string' || !gecos.startsWith(IDENTITY_GECOS_PREFIX)) return null;
  const slug = gecos.slice(IDENTITY_GECOS_PREFIX.length);
  return /^[a-z][a-z0-9-]{1,39}$/.test(slug) ? slug : null;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The units of (site k, door d)
 * ──────────────────────────────────────────────────────────────────────────────────── */

export interface AgentUnitNames {
  /** `<prefix>s<k>-<d>.socket` — Accept=yes, MaxConnections=1, the service user's 0600 socket. */
  readonly socket: string;
  /** `<prefix>s<k>-<d>@.service` — the template every accepted connection instantiates. */
  readonly template: string;
  /** `<prefix>s<k>-<d>.target` — Conflicts= with the site's other two doors. */
  readonly target: string;
  /**
   * An instance PID 1 starts for one connection: `<template stem>@<INSTANCE_SUFFIX>.service`
   * (socket.c `instance_from_socket` for AF_UNIX — every form a PID 1 in support spells, see
   * INSTANCE_SUFFIX_SOURCE). Anchored at both ends.
   */
  readonly instanceRegex: RegExp;
  /** The stem the instance names begin with (`<prefix>s<k>-<d>@`), for listing. */
  readonly instanceStem: string;
}

function assertDoor(door: string): asserts door is ConfinementDoor {
  if (!(DOORS as readonly string[]).includes(door)) {
    throw new Error(`agent_identity: '${String(door)}' is not a door (${DOORS.join(', ')}).`);
  }
}

/** A regex-safe copy of a unit prefix (its grammar is `[a-z0-9-]`, but say so structurally). */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * THE INSTANCE NAME PID 1 GIVES ONE ACCEPTED AF_UNIX CONNECTION — socket.c
 * `instance_from_socket`, read at the tags, in its three spellings:
 *
 *   - systemd <= 257:            `<nr>-<pid>-<uid>`
 *   - systemd >= 258:            `<nr>-<cookie>-<pid>_<pidfd id>-<uid>`
 *   - systemd >= 258, no pidfd:  `<nr>-<cookie>-<pid>-<uid>`
 *
 * One source for the daemon's regex and the polkit rule's (both anchor it after the literal
 * `<prefix>s<k>-<door>@` and before `.service`). The floor is 248 and nothing caps the
 * release, so a grammar that knew only the first form would refuse EVERY run on a 258 host
 * (the hello names a unit the daemon does not recognise) and leave the stop grant matching
 * nothing — a total outage, fail-closed but an outage.
 */
export const INSTANCE_SUFFIX_SOURCE = '[0-9]+-[0-9]+-[0-9]+(?:_[0-9]+-[0-9]+|-[0-9]+)?';

/**
 * THE PRE-LEAD-1b TRANSIENT RUN — `<prefix><uuid v4>.service`, started by `systemd-run
 * --uid=<the per-museum agent>` (HEAD before LEAD-1b, `randomUUID()`). Such a run is not bound
 * to the daemon and outlives it; the migration stops every one before it re-owns a workspace,
 * and the daemon counts one still alive as a reason no site of the museum is idle.
 *
 * The GLOB is EXACT-LENGTH — character classes, no `*` — so it cannot reach past this
 * prefix into another museum's units (`ab`'s `dedalo-site-ab-agent-` is a prefix of
 * `ab-agent-x`'s); the regex is its anchored twin.
 */
const HEX = '[0-9a-f]';
const UUID_SHAPE = [8, 4, 4, 4, 12];

export function legacyTransientUnitGlob(prefix: string): string {
  return `${prefix}${UUID_SHAPE.map(length => HEX.repeat(length)).join('-')}.service`;
}

export function legacyTransientUnitRegex(prefix: string): RegExp {
  return new RegExp(`^${escapeRegex(prefix)}${UUID_SHAPE.map(length => `${HEX}{${length}}`).join('-')}\\.service$`);
}

/** The three unit names of (site k, door d), and the exact grammar of its instances. */
export function agentUnitNames(prefix: string, k: number, door: ConfinementDoor): AgentUnitNames {
  assertDoor(door);
  if (!isAgentOrdinal(k)) throw new Error(`agent_identity: ${String(k)} is not a site ordinal.`);
  const stem = `${prefix}s${k}-${door}`;
  return Object.freeze({
    socket: `${stem}.socket`,
    template: `${stem}@.service`,
    target: `${stem}.target`,
    instanceStem: `${stem}@`,
    instanceRegex: new RegExp(`^${escapeRegex(stem)}@${INSTANCE_SUFFIX_SOURCE}\\.service$`),
  });
}

/** Where (site k, door d)'s socket listens: `<agentSocketDir>/s<k>-<d>.sock`. */
export function agentSocketPath(agentSocketDir: string, k: number, door: ConfinementDoor): string {
  assertDoor(door);
  if (!isAgentOrdinal(k)) throw new Error(`agent_identity: ${String(k)} is not a site ordinal.`);
  return join(agentSocketDir, `s${k}-${door}.sock`);
}

/** Site k's agent state directory (root:root 0755): `<agentStateRoot>/s<k>`. */
export function agentStateSiteDir(agentStateRoot: string, k: number): string {
  if (!isAgentOrdinal(k)) throw new Error(`agent_identity: ${String(k)} is not a site ordinal.`);
  return join(agentStateRoot, `s${k}`);
}

/**
 * The HOME a door runs with. turn and build each get their own directory
 * (`<agentStateRoot>/s<k>/<door>`, the identity's, 0700); git gets none at all.
 */
export const GIT_HOME = '/nonexistent';

export function agentHomeFor(agentStateRoot: string, k: number, door: ConfinementDoor): string {
  assertDoor(door);
  return door === 'git' ? GIT_HOME : join(agentStateSiteDir(agentStateRoot, k), door);
}

/** The doors that own a HOME directory under the state root. */
export const STATEFUL_DOORS: readonly ConfinementDoor[] = Object.freeze(['turn', 'build']);

/**
 * The per-site egress gate directory: `<agentSocketDir>/egress/s<k>` — ROOT's (provisioned by
 * a tmpfiles.d line, root:<site group> 0770, under a root 0755 `egress/`), never the daemon's:
 * it is the source of a bind PID 1 resolves as root.
 */
export function egressDirForSite(agentSocketDir: string, k: number): string {
  if (!isAgentOrdinal(k)) throw new Error(`agent_identity: ${String(k)} is not a site ordinal.`);
  return join(agentSocketDir, 'egress', `s${k}`);
}

/**
 * THE TURN'S git SEES NO REPOSITORY. The agent CLI runs git ITSELF — Claude Code 2.1.286, at
 * startup: `git -c core.fsmonitor= -c core.hooksPath=/dev/null … status --short`, `ls-files`,
 * `log`, `config` in the workspace — and neutralises the fsmonitor and the hooks but not
 * `filter.<x>.clean`. So a `.git/config` filter plus an attributes line (planted by a build's
 * postinstall, a git hook, or the turn's own Write) ran arbitrary commands, through sh, as the
 * site identity INSIDE THE TURN UNIT — the provider key, the MCP gate, the persistent turn HOME —
 * despite the Bash deny and every PLANT closure of the argv.
 *
 * NOT AN ENVIRONMENT VARIABLE. `GIT_DIR=/nonexistent` in the turn's environment was measured
 * USELESS: the CLI builds its own environment for those calls and drops `GIT_DIR` and
 * `GIT_CONFIG_GLOBAL` (kept only for `git remote`), so the planted filter still ran. So the
 * turn unit MASKS the repository: `InaccessiblePaths=<workspace>/.git`, rendered by root,
 * compared by conformance — every git the turn starts finds `.git` unreadable and no repository
 * (nothing above the workspace is agent-writable). No `-` prefix: a turn whose workspace has no
 * `.git` at all does not start (PID 1 refuses the mount, and the daemon refuses it first, typed)
 * — never a turn in which the agent's own Write could create a repository its next git reads.
 * The masked path is the TURN's only: the git door works on that repository, the build door
 * runs agent code by definition. HONEST LIMIT: it masks the repository every measured CLI git
 * call uses (its cwd and `-C` are the workspace root); a repository planted in a SUBDIRECTORY is
 * reached only by a git run from there. The live probe (`deploy/probes/claude_plant_probe.ts`
 * C5/P5) re-measures the CLI's git per release, and under `AGENT_CONFINEMENT=none` (declared
 * unconfined, the daemon's own uid) nothing is masked at all.
 */
export const TURN_MASKED_REPOSITORY = '.git';

/** The paths the TURN unit masks inside its workspace (InaccessiblePaths=, no `-`). */
export function turnMaskedPaths(workspace: string): readonly string[] {
  return Object.freeze([join(workspace, TURN_MASKED_REPOSITORY)]);
}

/**
 * THE ENVIRONMENT A UNIT FIXES — rendered as `Environment=` lines by root, and the only
 * environment the run did not receive from the daemon. The shim refuses a spec that tries to
 * set any of these keys (`unit_frames.ts` FIXED_ENV_KEYS), and they win over the spec's.
 *
 * `DEDALO_*` are for the shim alone and never reach the child.
 */
export function unitFixedEnvironment(opts: {
  readonly door: ConfinementDoor;
  readonly workspace: string;
  readonly agentStateRoot: string;
  readonly k: number;
}): Readonly<Record<string, string>> {
  assertDoor(opts.door);
  const env: Record<string, string> = {
    DEDALO_DOOR: opts.door,
    DEDALO_UNIT_WORKDIR: opts.workspace,
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
    HOME: agentHomeFor(opts.agentStateRoot, opts.k, opts.door),
  };
  if (opts.door === 'git') {
    // git reads no global and no system configuration: its whole configuration is the
    // repository's, which the daemon pins (GIT_DIR/GIT_WORK_TREE) per command.
    env.GIT_CONFIG_GLOBAL = '/dev/null';
    env.GIT_CONFIG_NOSYSTEM = '1';
  }
  return Object.freeze(env);
}
