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
import type { FixedEnvKey } from './unit_frames';

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
 * (`<agentStateRoot>/s<k>/<door>`); git gets none at all. The build HOME is the identity's
 * (0700); the turn HOME is ROOT's (`TURN_HOME_SKELETON`, S3-HOME) with only `state/` the
 * identity's.
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
 * `GIT_CONFIG_GLOBAL` (kept only for `git remote`), so the planted filter still ran.
 *
 * THREE LAYERS, all in the TURN unit (the git door works on that repository; the build door runs
 * agent code by definition):
 *
 *   1. THE REPOSITORY IS MASKED: `InaccessiblePaths=<workspace>/.git`, rendered by root, compared
 *      by conformance. No `-` prefix: a turn whose workspace has no `.git` does not start (PID 1
 *      refuses the mount, and the daemon refuses it first, typed) — never a turn in which the
 *      agent's own Write could create a repository its next git reads.
 *   2. THE WORKSPACE ITSELF IS NO REPOSITORY EITHER. With `.git` unreadable, git's discovery
 *      next tests the workspace ROOT as an implicit BARE repository (setup.c: `HEAD`, `objects/`,
 *      `refs/`). Measured 2026-10-01, git 2.54: `rev-parse --git-dir` answers `.`, and a plain
 *      `git log` runs a planted `gpg.program`; Claude Code 2.1.286's own `git log` read the
 *      planted commit into the model's context (it passes `-c log.showSignature=false`, and its
 *      `status` dies — a root that IS the git dir is no work tree — so no planted program ran on
 *      that release; the next release's git calls are the probe's to see). So the turn unit
 *      binds a ROOT-RENDERED system configuration read-only over `/etc/gitconfig`
 *      (`turnSystemGitconfigPath`, saying `safe.bareRepository = explicit` and nothing else — no
 *      `safe.directory`; the host's own `/etc/gitconfig`, which might say `safe.directory = *`, is
 *      shadowed; on a host with none, PID 1 creates the empty mount point): a PROTECTED
 *      setting no repository-local config can override, so git refuses to use a discovered bare
 *      repository (git >= 2.38; measured on 2.54). And — for a git older than that, or one
 *      whose system configuration is not `/etc/gitconfig` — the daemon refuses, typed, before
 *      connecting, a turn whose workspace root carries `HEAD` (`TURN_BARE_REPOSITORY_MARKER`:
 *      every git's `is_git_directory` requires it, reftable included).
 *   3. NOTHING ABOVE THE WORKSPACE IS AGENT-WRITABLE inside a unit (`ProtectSystem=strict`,
 *      `ReadWritePaths=` the workspace alone), so the walk upward finds nothing planted.
 *
 *   4. GIT'S GLOBAL CONFIGURATION IS ROOT'S TOO (S3-HOME, below). git's global files are protected
 *      configuration read AFTER the system file (`~/.gitconfig`, `$XDG_CONFIG_HOME/git/config`),
 *      so a turn that could write either could say `safe.bareRepository = all` and reopen layer 2.
 *      The turn HOME is therefore ROOT's (`TURN_HOME_SKELETON`): `~/.gitconfig` is a root-rendered
 *      file saying the same directives, `XDG_CONFIG_HOME` is root's empty `~/.config`, and the
 *      only identity-writable place under HOME is `state/`. git never reads configuration from
 *      there (its global files are the two paths above); `state/` is the agent CLI's WRITABLE
 *      state, and what the CLI loads from `state/claude` (settings, hooks, skills, MCP servers in
 *      `.claude.json`) is closed by the PLANT argv (`--setting-sources ''`, `--strict-mcp-config`,
 *      the daemon's `--settings`), not by ownership — measured per turn by `claude_turn_plant`
 *      (H7-claude). Conformance checks the shape (closed world) before every run.
 *
 * HONEST LIMIT: a repository planted in a SUBDIRECTORY with a `.git` of its own is reached only
 * by a git run from there (every measured CLI call runs in, or `-C`, the workspace root); a
 * `HEAD` the turn's own Write creates mid-turn is refused by the daemon's check only at the NEXT
 * turn — within the turn, only the configuration of layers 2 and 4 stands (git >= 2.38). The
 * BUILD HOME is still the identity's own (a build runs agent-authored code by definition; its
 * git is not the turn's). The live probe (`deploy/probes/claude_plant_probe.ts` C5/P5, P5b for
 * the bare root, C6/P6 for the HOME) re-measures the CLI's git per release, and under
 * `AGENT_CONFINEMENT=none` (declared unconfined, the daemon's own uid) nothing is masked — the
 * turn HOME is only made FRESH per run there (`confinement.ts` `declaredUnconfined`).
 */
export const TURN_MASKED_REPOSITORY = '.git';

/** The paths the TURN unit masks inside its workspace (InaccessiblePaths=, no `-`). */
export function turnMaskedPaths(workspace: string): readonly string[] {
  return Object.freeze([join(workspace, TURN_MASKED_REPOSITORY)]);
}

/** A workspace ROOT carrying this is git-dir shaped (bare discovery needs it): a turn is refused. */
export const TURN_BARE_REPOSITORY_MARKER = 'HEAD';

/** Where that marker would be: directly in the workspace root (lstat'd — a link to nothing counts). */
export function turnBareRepositoryMarker(workspace: string): string {
  return join(workspace, TURN_BARE_REPOSITORY_MARKER);
}

/** Where the turn unit mounts its system git configuration (git's `$(sysconfdir)/gitconfig`). */
export const TURN_SYSTEM_GITCONFIG_MOUNT = '/etc/gitconfig';

/**
 * The turn's system git configuration — its ONLY directives (comments aside; the renderer adds
 * its stamp and a header). `safe.bareRepository` is honoured only from protected configuration
 * (system, global, command line), never from a repository's own `config`.
 */
export const TURN_SYSTEM_GITCONFIG_DIRECTIVES: readonly string[] = Object.freeze(['[safe]', '\tbareRepository = explicit']);

/**
 * The rendered file: root's, under the agent state root (root 0755). The unit masks that root
 * (`TemporaryFileSystem=`), which hides it from the run but not from PID 1, which resolves a
 * bind source on the host before it builds the namespace — the door HOMEs are bound the same way.
 */
export function turnSystemGitconfigPath(agentStateRoot: string): string {
  return join(agentStateRoot, 'turn.gitconfig');
}

/** The TURN unit's read-only bind of that file over git's system configuration (`source:dest`). */
export function turnGitconfigBind(agentStateRoot: string): string {
  return `${turnSystemGitconfigPath(agentStateRoot)}:${TURN_SYSTEM_GITCONFIG_MOUNT}`;
}

/** A gitconfig body's DIRECTIVES — every line that is not blank and not a `#`/`;` comment. */
export function gitconfigDirectives(body: string): string[] {
  return body.split('\n').filter(line => line.trim() !== '' && !/^\s*[#;]/.test(line));
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * S3-HOME — the turn HOME is ROOT's; only `state/` is the identity's (LEAD-1b §2.6a)
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** One path of the turn HOME as root leaves it. `rel` is relative to HOME (`.` is HOME). */
export interface TurnHomeRow {
  readonly rel: string;
  readonly type: 'dir' | 'file';
  /** `root` is the provisioner; `identity` is the site's agent identity (and its private group). */
  readonly owner: 'root' | 'identity';
  readonly mode: number;
}

/**
 * THE TURN HOME, AND NOTHING ELSE IN IT — the one source the plan (`provision/plan.ts`), the
 * rebuild (`provision/apply.ts`), the renderer (`render/agent_units.ts`, the `.gitconfig`) and
 * the conformance check (`confinement.ts` `turnHomeProblem`, closed world) all read.
 *
 * Every program a turn runs reads its configuration from HOME: git (`~/.gitconfig`,
 * `$XDG_CONFIG_HOME/git/config` — protected configuration, read after the system file), Bun
 * (`~/.bunfig.toml`), opencode (`~/.opencode`, `$XDG_CONFIG_HOME/opencode`), the agent CLI's own
 * state. While HOME was the identity's own persistent 0700 directory, one turn's Write could
 * plant configuration EVERY LATER TURN of that site would read. So HOME is root's and fixed:
 *
 *   - `.`          root 0755 — nothing can be created at HOME level;
 *   - `state`      the identity's 0700 — the one writable place: `CLAUDE_CONFIG_DIR` and the
 *                  `XDG_DATA/STATE/CACHE_HOME` point here. It is WRITABLE CLI STATE, not inert:
 *                  what the CLI loads from `state/claude` is closed by the PLANT argv
 *                  (`--setting-sources ''`, `--strict-mcp-config`, the daemon's `--settings`),
 *                  not by ownership; git and Bun read no configuration from it;
 *   - `.config`    root 0755 and EMPTY (`TURN_CONFIG_SUBDIRS`) — `XDG_CONFIG_HOME`;
 *   - `.gitconfig` root 0644, the turn's git directives (`TURN_SYSTEM_GITCONFIG_DIRECTIVES`)
 *                  and nothing else — so the global layer says what the system layer says.
 */
export const TURN_HOME_SKELETON: readonly TurnHomeRow[] = Object.freeze([
  Object.freeze({ rel: '.', type: 'dir', owner: 'root', mode: 0o755 } as const),
  Object.freeze({ rel: 'state', type: 'dir', owner: 'identity', mode: 0o700 } as const),
  Object.freeze({ rel: '.config', type: 'dir', owner: 'root', mode: 0o755 } as const),
  Object.freeze({ rel: '.gitconfig', type: 'file', owner: 'root', mode: 0o644 } as const),
]);

/** The relative name of the identity's writable state directory under the turn HOME. */
export const TURN_HOME_STATE = 'state';

/** The relative name of root's (empty) configuration directory under the turn HOME. */
export const TURN_HOME_CONFIG = '.config';

/** The relative name of root's global git configuration under the turn HOME. */
export const TURN_HOME_GITCONFIG = '.gitconfig';

/**
 * THE ONLY NAMES `.config` MAY HOLD — empty today. The extension point of the opencode phase B
 * (a root-owned mount point for a per-run tmpfs); a name appears here only with its mount.
 */
export const TURN_CONFIG_SUBDIRS: readonly string[] = Object.freeze([]);

/** The top-level names of the turn HOME (the skeleton minus `.`), for the closed-world check. */
export function turnHomeTopNames(): readonly string[] {
  return TURN_HOME_SKELETON.filter(row => row.rel !== '.' && !row.rel.includes('/')).map(row => row.rel);
}

/**
 * WHERE A TURN HOME IS STAGED while `provision apply` rebuilds an old-shape one:
 * `<agentStateRoot>/s<k>/turn.next`, beside the HOME in root's 0755 site directory — so neither
 * the identity nor the daemon can create, rename or replace it, and a crash between the staging
 * and the swap leaves a state the next apply resumes (`turn.next` present, `turn` absent).
 */
export function turnHomeStagingPath(agentStateRoot: string, k: number): string {
  return join(agentStateSiteDir(agentStateRoot, k), 'turn.next');
}

/**
 * WHERE A REBUILT TURN HOME IS ARCHIVED: `<agentStateRoot>/retired/<stem>.<utc>` (root 0700) —
 * beside the sites' state directories under the agent state root, so the rename stays on one
 * filesystem (the rebuild still proves it: same device, or nothing moves), and every agent unit's
 * `TemporaryFileSystem=<agentStateRoot>:ro` masks it: no run sees an archive, its own or another
 * site's. A SIBLING of the `s<k>` directories, never inside a HOME a unit binds back.
 */
export const AGENT_STATE_ARCHIVE = 'retired';

export function agentStateArchiveDir(agentStateRoot: string): string {
  return join(agentStateRoot, AGENT_STATE_ARCHIVE);
}

/** One entry the rebuild of a turn HOME moves into the new `state/` (`provision/apply.ts`). */
export interface TurnHomeCarry {
  /** Relative to the OLD HOME. Every component above it must be the identity's real directory. */
  readonly from: string;
  /** Relative to the staged HOME. Never overwritten when it already exists. */
  readonly to: string;
  readonly type: 'dir' | 'file';
  /** Why this entry survives a rebuild: it is STATE the CLI needs, not configuration. */
  readonly reason: string;
}

const RESUME = 'the CLI\'s session transcripts: `--resume` continues a conversation from them';
const ACCOUNT = 'the CLI\'s own account record (its onboarding and project bookkeeping)';
const LOGIN = 'the CLI\'s login (an operator who logged the identity in would have to again)';

/**
 * WHAT A REBUILD CARRIES — AN ALLOWLIST, each entry with its reason. The agent CLI's STATE by
 * rename, and nothing else: everything not listed — the old HOME's `.gitconfig`, `.config/`,
 * `.bunfig.toml`, any plant, and the rest of the CLI's directory (`settings.json`, `skills/`,
 * `agents/`, `commands/`, `CLAUDE.md`: configuration a turn could have written) — is ARCHIVED
 * root-only as evidence, never carried. Two source shapes: a pre-S3 HOME (`.claude`,
 * `.claude.json` at HOME level) and a refused S3 HOME being repaired (`state/claude/…`); the first
 * present wins, and a target that already exists is never overwritten.
 */
export const TURN_HOME_CARRY: readonly TurnHomeCarry[] = Object.freeze([
  Object.freeze({ from: 'state/claude/projects', to: 'state/claude/projects', type: 'dir', reason: RESUME } as const),
  Object.freeze({ from: 'state/claude/.claude.json', to: 'state/claude/.claude.json', type: 'file', reason: ACCOUNT } as const),
  Object.freeze({ from: 'state/claude/.credentials.json', to: 'state/claude/.credentials.json', type: 'file', reason: LOGIN } as const),
  Object.freeze({ from: '.claude/projects', to: 'state/claude/projects', type: 'dir', reason: RESUME } as const),
  Object.freeze({ from: '.claude.json', to: 'state/claude/.claude.json', type: 'file', reason: ACCOUNT } as const),
  Object.freeze({ from: '.claude/.credentials.json', to: 'state/claude/.credentials.json', type: 'file', reason: LOGIN } as const),
]);

/** The directory a rebuild always leaves in the new `state/` (the CLI's, `CLAUDE_CONFIG_DIR`). */
export const TURN_STATE_CLI_DIR = 'state/claude';

/**
 * THE DECLARED-UNCONFINED TURN'S HOMEs (S3-HOME under `none`): `<root>/unconfined/turn/state` is the
 * persistent state (the CLI's sessions survive), and every run gets a FRESH HOME
 * `<root>/unconfined/turn/run.<random>` — so whatever one run leaves at HOME level (`~/.gitconfig`,
 * `~/.config/git`, `~/.bunfig.toml`, `~/.opencode`) is gone for the next. The same uid can still write
 * `state/` directly: that is the declared posture (no uid boundary at all under `none`). Spelled
 * here, beside the HOME law, because the run (`confinement.ts`) and the opencode probe (which must
 * ask under the state a turn runs with) both name it.
 */
export function unconfinedTurnDirs(agentStateRoot: string): { readonly base: string; readonly state: string } {
  const base = join(agentStateRoot, 'unconfined', 'turn');
  return { base, state: join(base, TURN_HOME_STATE) };
}

/* ── the ONE shape predicate (conformance refuses it, the plan repairs it) ──────────────── */

/** One path of a turn HOME, as an observer saw it (lstat: a link is a link). */
export interface TurnHomeEntry {
  readonly type: 'dir' | 'file' | 'symlink' | 'other';
  /** Whose it is: the provisioner (`root`), the site identity, or anyone else. */
  readonly whose: 'root' | 'identity' | 'other';
  /** How its owner is named in a message (`uid 901`, `user 'x'`). */
  readonly ownerName: string;
  /** Permission bits (`& 0o7777`). */
  readonly mode: number;
}

/** What the predicate may ask of an observer — the daemon (lstat/readdir) or the plan (HostState). */
export interface TurnHomeView {
  /** lstat of `path`: null when absent, `{error}` when it cannot be examined. */
  readonly look: (path: string) => TurnHomeEntry | null | { readonly error: string };
  /**
   * The names in `dir`. null ONLY when `dir` is absent or not a directory (its row check names
   * it); `{error}` when it is a directory whose names were not read — never a silent skip, or the
   * closed world would vanish exactly when nobody looked.
   */
  readonly list: (dir: string) => readonly string[] | null | { readonly error: string };
  /** The directives of the regular file at `path`, or `{error}` when its bytes are not known. */
  readonly directives: (path: string) => readonly string[] | { readonly error: string };
  /** How the site identity is named in a message; null when it does not resolve. */
  readonly identity: string | null;
}

/**
 * EVERY WAY A TURN HOME IS NOT ROOT'S SKELETON, each naming its path — the ONE predicate both
 * `confinement.ts` `turnHomeProblem` (which REFUSES the site) and `provision/plan.ts` `agentPlan`
 * (which REBUILDS the HOME) ask, so a HOME the daemon refuses is a HOME `provision apply` repairs
 * — never one left refused forever. A CLOSED WORLD:
 *
 *   - every skeleton row is there, of its type, never a link;
 *   - root's rows are the provisioner's and writable by nobody else; `state/` is the site
 *     identity's and closed (`& 077 == 0`);
 *   - `.gitconfig` says exactly the turn's git directives;
 *   - HOME holds exactly the skeleton's names, and `.config/` nothing but `TURN_CONFIG_SUBDIRS`.
 */
export function turnHomeShapeProblems(home: string, view: TurnHomeView): string[] {
  const problems: string[] = [];
  for (const row of TURN_HOME_SKELETON) {
    const path = row.rel === '.' ? home : join(home, row.rel);
    const seen = view.look(path);
    if (seen !== null && 'error' in seen) {
      problems.push(`'${path}' cannot be examined (${seen.error})`);
      continue;
    }
    if (seen === null) {
      problems.push(`'${path}' is absent`);
      continue;
    }
    if (row.type === 'file') {
      if (seen.type !== 'file') problems.push(`'${path}' is not a regular file`);
      else if (seen.whose !== 'root') problems.push(`'${path}' is owned by ${seen.ownerName}, not the provisioner's`);
      else if ((seen.mode & 0o022) !== 0) problems.push(`'${path}' is writable by its group or by others (mode ${seen.mode.toString(8)})`);
      else {
        const said = view.directives(path);
        if ('error' in said) problems.push(`'${path}' cannot be read (${said.error})`);
        else if (JSON.stringify(said) !== JSON.stringify(TURN_SYSTEM_GITCONFIG_DIRECTIVES)) {
          problems.push(`'${path}' says ${JSON.stringify(said)}, not exactly ${JSON.stringify(TURN_SYSTEM_GITCONFIG_DIRECTIVES)}`);
        }
      }
      continue;
    }
    if (seen.type !== 'dir') {
      problems.push(`'${path}' is ${seen.type === 'symlink' ? 'a link' : 'not a directory'}`);
      continue;
    }
    if (row.owner === 'root') {
      if (seen.whose !== 'root') problems.push(`'${path}' is owned by ${seen.ownerName}, not the provisioner's`);
      else if ((seen.mode & 0o022) !== 0) problems.push(`'${path}' is writable by its group or by others (mode ${seen.mode.toString(8)})`);
    } else if (view.identity === null) {
      problems.push(`'${path}' cannot be checked: the site identity does not resolve`);
    } else if (seen.whose !== 'identity') {
      problems.push(`'${path}' is owned by ${seen.ownerName}, not the site identity's (${view.identity})`);
    } else if ((seen.mode & 0o077) !== 0) {
      problems.push(`'${path}' is open to its group or to others (mode ${seen.mode.toString(8)})`);
    }
  }
  // THE CLOSED WORLD: nothing but the skeleton at HOME level, nothing but the declared names in .config.
  for (const [dir, allowed] of [
    [home, turnHomeTopNames()],
    [join(home, TURN_HOME_CONFIG), TURN_CONFIG_SUBDIRS],
  ] as const) {
    const names = view.list(dir);
    if (names === null) continue;
    if ('error' in names) {
      problems.push(`'${dir}' cannot be listed (${names.error}), so nothing proves it holds only ${JSON.stringify([...allowed])}`);
      continue;
    }
    for (const name of [...names].sort()) {
      if (!allowed.includes(name)) {
        problems.push(`'${join(dir, name)}' is not part of the turn HOME (root provisions exactly ${JSON.stringify([...allowed])} there)`);
      }
    }
  }
  return problems;
}

/**
 * THE TURN'S CONFIGURATION AND STATE LOCATIONS, as a function of its HOME and state directory.
 * `XDG_CONFIG_HOME` is root's `.config` (never under `state/`: configuration is read-only);
 * the CLI's own directory (`CLAUDE_CONFIG_DIR`) and the data/state/cache dirs are the state's.
 * The confined unit fixes them (`unitFixedEnvironment`); the declared-unconfined turn sets them
 * over a fresh per-run HOME and a persistent state (`confinement.ts`).
 */
export function turnHomeEnvironment(
  home: string,
  stateDir: string = join(home, TURN_HOME_STATE),
): Readonly<Partial<Record<FixedEnvKey, string>>> {
  return Object.freeze({
    XDG_CONFIG_HOME: join(home, TURN_HOME_CONFIG),
    CLAUDE_CONFIG_DIR: join(stateDir, 'claude'),
    XDG_DATA_HOME: join(stateDir, 'data'),
    XDG_STATE_HOME: join(stateDir, 'xdg-state'),
    XDG_CACHE_HOME: join(stateDir, 'cache'),
  });
}

/**
 * THE DECLARED-UNCONFINED TURN'S CHILD ENVIRONMENT — the ONE function that says what a `none`
 * turn's process receives: the caller's environment (the manager's base, the driver's statement
 * over it), then the HOME law's keys over THAT (`runHome` fresh per run, `stateDir` persistent).
 * No egress key: under `none` there is no gate to send anything through. `declaredUnconfined`
 * spawns with it, and a driver's probe asks its binary under it — so the environment a probe
 * proves and the one a turn runs with cannot drift apart (gate: O13 in opencode_plant.test.ts).
 */
export function unconfinedTurnChildEnvironment(
  env: Readonly<Record<string, string>>,
  runHome: string,
  stateDir: string,
): Record<string, string> {
  return { ...env, HOME: runHome, ...(turnHomeEnvironment(runHome, stateDir) as Record<string, string>) };
}

/**
 * THE ENVIRONMENT A UNIT FIXES — rendered as `Environment=` lines by root, and the only
 * environment the run did not receive from the daemon. The shim refuses a spec that tries to
 * set any of these keys (`unit_frames.ts` FIXED_ENV_KEYS — the return type holds this to that
 * list), and they win over the spec's.
 *
 * `DEDALO_*` are for the shim alone and never reach the child.
 */
export function unitFixedEnvironment(opts: {
  readonly door: ConfinementDoor;
  readonly workspace: string;
  readonly agentStateRoot: string;
  readonly k: number;
}): Readonly<Partial<Record<FixedEnvKey, string>>> {
  assertDoor(opts.door);
  const home = agentHomeFor(opts.agentStateRoot, opts.k, opts.door);
  const env: Partial<Record<FixedEnvKey, string>> = {
    DEDALO_DOOR: opts.door,
    DEDALO_UNIT_WORKDIR: opts.workspace,
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
    HOME: home,
  };
  if (opts.door === 'turn') Object.assign(env, turnHomeEnvironment(home));
  if (opts.door === 'git') {
    // git reads no global and no system configuration: its whole configuration is the
    // repository's, which the daemon pins (GIT_DIR/GIT_WORK_TREE) per command.
    env.GIT_CONFIG_GLOBAL = '/dev/null';
    env.GIT_CONFIG_NOSYSTEM = '1';
  }
  return Object.freeze(env);
}
