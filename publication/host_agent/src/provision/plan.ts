/**
 * THE PLAN — pure: (layout, observed host) → the ordered Action[] that makes the host match
 * its declaration, or a PlanRefused naming every reason it will not. Never touches the host.
 *
 * Mirrors publication/site_builder/src/provision/plan.ts (HostState in, Action[] out,
 * describe(), assertPlanIsCoherent()) for one agent, without identities, links or removal.
 *
 * Order, always: mkdir/chown/chmod of directories (parents first, so a drifted parent is
 * fixed before its child is created) → write → chown/chmod of files → append-only (the audit
 * trail, LAST: the kernel refuses chown/chmod on an append-only file) → daemon-reload →
 * web-configtest → web-reload → enable → start → restart. Writes happen ONLY on drift: an
 * absent file, or a file carrying our valid stamp whose bytes differ from the render. A
 * file that is not ours (no stamp) or that was hand-edited (stamp ≠ body) is REFUSED.
 *
 * TRUST (finding: what root runs or grants must not be replaceable from below). The pinned
 * code — the configtest binary (the NOPASSWD sudo target), php_bin, bun_bin, agent_dir and
 * its entry point — and every ancestor of each must be real (the leaf not a symlink), owned
 * by root and not group- or world-writable; so must every existing ancestor of every managed
 * tree, outside the trees themselves. Facts are lstat facts (observeHost); ancestors at or
 * above `host.trustRoot` ('/' in production) are not judged.
 *
 * ACCESS (finding: a root-only agent_dir passed every trust check, then systemd failed
 * "Changing to the requested working directory failed: Permission denied"). Trust is not
 * reach: the account that RUNS the pinned code must be able to read and run it, judged like
 * the kernel with the credentials its unit gives it (./access.ts; accessRefusals below). And
 * on a unix listener engine_group must not be a group our own accounts own (engineGroupRefusal).
 *
 * THE AUDIT TRAIL IS APPEND-ONLY BY THE KERNEL (the audit contract, instance/roots.ts): the
 * file is created empty, agent-owned 0600, then given FS_APPEND_FL (`chattr +a`, an
 * `append-only` action). Once it carries the attribute its owner and mode cannot change in
 * place, so metadata drift on it is REFUSED (fix by hand), never planned.
 *
 * NO TEST SCRATCH TREE IN THE AGENT'S CHECKOUT. The agent's config falls back to the
 * committed `.env.test` (test mode: a public dummy token, unscrubbed 5xx detail) only when
 * `<agent_dir>/.test-tmp/` declares itself the suite's (src/config.ts TEST_SCRATCH_MARKER,
 * planted by the suite's preload). A provisioned agent_dir is root-owned and not writable by
 * the agent, so refusing a `.test-tmp` here makes that fallback unreachable on a host.
 *
 * NO DEVELOPMENT DEPENDENCY IN THE AGENT'S CHECKOUT. The deployment install is frozen and
 * production-only (`bun run hostagent:install` = `bun install --frozen-lockfile --production`):
 * a `<agent_dir>/node_modules/<devDependency>` means the tree was prepared with the dev
 * install or the suite ran in it — build tools the publication host never needs, refused like
 * `.test-tmp` (the OUTCOME is gated, not the script's spelling).
 *
 * ZERO-DEPENDENCY.
 */
import { dirname, join } from 'node:path';
import type { AccountGroups, Credentials } from './access';
import { EXECUTE, READ, accountCredentials, chmodFix, missingAccess, unitCredentials } from './access';
import { hasDrifted, parseStamp } from './hash';
import type { AgentLayout, WebServer } from './layout';
import { MODES, SERVICE_TOKEN_BYTES, WEB_CONFIGTEST_CANDIDATES, groupName, markerContent, ownerName } from './layout';
import { engineFragmentRenderer } from './render/engine_fragment';
import { envRenderer } from './render/env';
import { polkitRenderer } from './render/polkit';
import { sudoersRenderer } from './render/sudoers';
import { agentUnitGroups, agentUnitRenderer } from './render/unit_agent';
import { v2ScratchUnitRenderer, v2UnitGroups, v2UnitRenderer } from './render/unit_v2';
import type {
  Artifact,
  ArtifactEffect,
  ArtifactKind,
  ArtifactService,
  ArtifactValidator,
  RenderFacts,
  Renderer,
  UnitGroups,
} from './render/types';
import { ARTIFACT_KINDS, PENDING_FACTS } from './render/types';

/* ── the renderer registry ────────────────────────────────────────────────────────── */

/** One renderer per ARTIFACT_KINDS entry. */
export const RENDERERS: readonly Renderer[] = Object.freeze([
  envRenderer,
  agentUnitRenderer,
  v2UnitRenderer,
  v2ScratchUnitRenderer,
  sudoersRenderer,
  polkitRenderer,
  engineFragmentRenderer,
]);

/** THE CENSUS, both ways: no kind twice, no kind without a renderer. Throws. */
export function assertRendererCensus(renderers: readonly Renderer[]): void {
  const seen = new Set<ArtifactKind>();
  for (const renderer of renderers) {
    if (seen.has(renderer.kind)) {
      throw new Error(`render: two renderers claim the kind '${renderer.kind}'`);
    }
    seen.add(renderer.kind);
  }
  for (const kind of ARTIFACT_KINDS) {
    if (!seen.has(kind)) {
      throw new Error(`render: no renderer is registered for the artifact kind '${kind}'`);
    }
  }
}
assertRendererCensus(RENDERERS);

/** Every artifact this instance should hold, sorted by path; one path one artifact, all stamped. */
export function renderAll(
  layout: AgentLayout,
  facts: RenderFacts = PENDING_FACTS,
  renderers: readonly Renderer[] = RENDERERS,
): Artifact[] {
  const artifacts: Artifact[] = [];
  const byPath = new Map<string, ArtifactKind>();
  for (const renderer of renderers) {
    if (renderer.appliesTo && !renderer.appliesTo(layout)) continue;
    for (const produced of renderer.render(layout, facts)) {
      if (produced.kind !== renderer.kind) {
        throw new Error(`render: the '${renderer.kind}' renderer produced a '${produced.kind}' artifact`);
      }
      const first = byPath.get(produced.path);
      if (first) {
        throw new Error(`render: '${produced.path}' would be written twice (${first}, ${produced.kind})`);
      }
      const parsed = parseStamp(produced.body);
      if (!parsed || parsed.kind !== produced.kind || parsed.instance !== layout.instance || hasDrifted(produced.body)) {
        throw new Error(`render: the ${produced.kind} artifact for '${produced.path}' is not validly stamped`);
      }
      byPath.set(produced.path, produced.kind);
      artifacts.push(produced);
    }
  }
  return artifacts.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/* ── the observed host ────────────────────────────────────────────────────────────── */

export type EntryType = 'dir' | 'file' | 'symlink' | 'other';

export interface PathFacts {
  readonly type: EntryType;
  readonly uid: number;
  readonly gid: number;
  /** Permission bits only (`& 0o7777`). */
  readonly mode: number;
  /** A symlink's fully resolved path (realpath), when it resolves: the refusal names what to declare. */
  readonly target?: string;
}

export interface UnitFacts {
  readonly enabled: boolean;
  readonly active: boolean;
}

export interface HostState {
  /** Ancestors at or above this directory are not trust-checked. Production: '/'. */
  readonly trustRoot: string;
  /** Managed files observed carrying the append-only attribute (only the audit trail is probed). */
  readonly appendOnly: ReadonlySet<string>;
  /** lstat facts (never followed) of every managed path, the pinned code, and their ancestors. */
  readonly paths: ReadonlyMap<string, PathFacts>;
  /** Contents of the marker and of every artifact path that is a file; null = unreadable. Never a credential, never the audit log. */
  readonly contents: ReadonlyMap<string, string | null>;
  readonly users: ReadonlyMap<string, number>;
  readonly groups: ReadonlyMap<string, number>;
  readonly units: ReadonlyMap<string, UnitFacts>;
  /** Database groups (`id -g`, `id -G`) of agent_user, v1.user and v2.user; absent = unresolved. */
  readonly accountGroups: ReadonlyMap<string, AccountGroups>;
  /** agent_dir's whole tree as observeHost walked it (each path's lstat facts are in `paths`). */
  readonly agentTree: AgentTree;
}

/**
 * agent_dir's tree: agent_dir first, then every entry below it — lstat, never followed (a
 * symlink is an entry, not a door out of the tree). `incomplete` says why the walk stopped
 * short (past AGENT_TREE_WALK_CAP, an unlistable directory); plan REFUSES then, never skips.
 */
export interface AgentTree {
  readonly paths: readonly string[];
  readonly incomplete: string | null;
}

/** The most entries observeHost walks in agent_dir. A checkout (src/, node_modules/, package.json…) is a few hundred. */
export const AGENT_TREE_WALK_CAP = 20_000;

/** The suite's scratch tree inside a package checkout (tests/fixtures/instance.ts SCRATCH_DIR_NAME). */
export const TEST_SCRATCH_DIR = '.test-tmp';

/** Where observeHost looks for a test scratch tree in the agent's checkout. */
export function agentScratchPath(layout: AgentLayout): string {
  return join(layout.agentDir, TEST_SCRATCH_DIR);
}

/**
 * The agent package's devDependencies (publication/host_agent/package.json), sorted. A
 * literal, not a package.json import, because this module is zero-dependency
 * (tests/provision_zero_dep.test.ts); tests/provision_plan.test.ts holds it EQUAL to the
 * package's devDependencies, so adding one there without here is red. None may be installed
 * in agent_dir.
 */
export const AGENT_DEV_DEPENDENCIES: readonly string[] = Object.freeze(['@types/bun', 'typescript']);

/** Where observeHost looks for an installed development dependency in the agent's checkout. */
export function agentDevDependencyPaths(layout: AgentLayout): string[] {
  return AGENT_DEV_DEPENDENCIES.map(name => join(layout.agentDir, 'node_modules', name));
}

/* ── trust ────────────────────────────────────────────────────────────────────────── */

/** The strict ancestors of `path` strictly below `trustRoot`, shallowest first. */
export function ancestorsBelow(path: string, trustRoot: string): string[] {
  const out: string[] = [];
  for (let dir = dirname(path); dir !== trustRoot; dir = dirname(dir)) {
    if (dir === dirname(dir)) throw new Error(`plan: '${path}' is not under the trust root '${trustRoot}'`);
    out.unshift(dir);
  }
  return out;
}

/** null when owned by root (uid 0 or the host's `root` uid) and not group/world-writable. */
export function trustProblem(facts: { readonly uid: number; readonly mode: number }, rootUid: number): string | null {
  if (facts.uid !== 0 && facts.uid !== rootUid) return `owned by uid ${facts.uid}, not root`;
  if ((facts.mode & 0o022) !== 0) return `group- or world-writable (mode ${octal(facts.mode & 0o777)})`;
  return null;
}

/* ── the account that runs it can read and run it ─────────────────────────────────── */

/**
 * Trust (above) proves no non-root principal can REPLACE the pinned code; this proves the
 * accounts that RUN it can REACH it. Root walks and reads everything, so a tree only root can
 * enter passes every trust check and then the unit dies at start ("Changing to the requested
 * working directory failed: Permission denied"). Judged per account with the credentials its
 * process gets (./access.ts), on lstat facts:
 *   - the agent: x on every directory above agent_dir; r+x on every directory and r on every
 *     file of agent_dir's tree (walked whole — symlinks in it are entries, not followed);
 *     r+x on bun_bin and php_bin (it runs the v1 syntax check) and x above each;
 *   - v2 (its unit and the scratch template): r+x on bun_bin, x above it;
 *   - x above state_root for the agent, v2 and v1 (the site's PHP-FPM pool reads the v1
 *     releases and config through it). state_root's own tree is the provisioner's (MODES):
 *     not re-judged here.
 */

/** One account that runs something on the host, with what its process gets. */
interface Runner {
  readonly name: string;
  /** `(the agent)`, `(v2)`, `(v1)`. */
  readonly role: string;
  readonly cred: Credentials;
}

/** The agent's, v2's and v1's credentials, from the units this provisioner renders (render/unit_*.ts). */
function runners(layout: AgentLayout, host: HostState, refusals: string[]): { agent: Runner | null; v2: Runner | null; v1: Runner | null } {
  const { agentUser, v1User, v2User } = layout.identity;
  const database = (user: string, field: string): AccountGroups | null => {
    if (!host.users.has(user)) return null; // refused where accounts are checked
    const found = host.accountGroups.get(user);
    if (!found) refusals.push(`the groups of user '${user}' (${field}) could not be read (id -G ${user}) — this host's user database does not answer`);
    return found ?? null;
  };
  const gid = (group: string): number | null => host.groups.get(group) ?? null;

  // The credentials a unit gives: exactly the Group=/SupplementaryGroups= its renderer emits
  // (render/types.ts UnitGroups — the renderer writes its lines from the same value). A group
  // that does not resolve is refused where groups are checked: no runner is judged then.
  const fromUnit = (user: string, db: AccountGroups | null, groups: UnitGroups): Credentials | null => {
    if (!db) return null;
    const group = groups.group === null ? null : gid(groups.group);
    if (groups.group !== null && group === null) return null;
    const supplementary = groups.supplementary.map(gid);
    if (!supplementary.every((value): value is number => value !== null)) return null;
    return unitCredentials(host.users.get(user) as number, group, supplementary, db);
  };

  let agent: Runner | null = null;
  const agentCred = fromUnit(agentUser, database(agentUser, 'agent_user'), agentUnitGroups(layout));
  if (agentCred) agent = { name: agentUser, role: 'the agent', cred: agentCred };

  let v2: Runner | null = null;
  const v2Cred = fromUnit(v2User, database(v2User, 'v2.user'), v2UnitGroups(layout));
  if (v2Cred) v2 = { name: v2User, role: 'v2', cred: v2Cred };

  let v1: Runner | null = null;
  const v1Db = database(v1User, 'v1.user');
  if (v1Db) v1 = { name: v1User, role: 'v1', cred: accountCredentials(host.users.get(v1User) as number, v1Db) };
  return { agent, v2, v1 };
}

/** "read", "executed", "read and executed" — what the missing bits deny, for a file. */
function fileVerb(missing: number): string {
  const verbs = [missing & READ ? 'readable' : '', missing & EXECUTE ? 'executable' : ''].filter(Boolean);
  return verbs.join(' and ');
}

const TREE_FIX = (agentDir: string): string => `chmod -R u=rwX,go=rX ${agentDir}`;
const TREE_EXAMPLES = 3;

/** Every "cannot reach what it runs" problem, one line each: ACCOUNT, PATH and the exact fix. */
export function accessRefusals(layout: AgentLayout, host: HostState): string[] {
  const refusals: string[] = [];
  const { agent, v2, v1 } = runners(layout, host, refusals);
  const seen = new Set<string>();
  const once = (key: string, line: string): void => {
    if (seen.has(key)) return;
    seen.add(key);
    refusals.push(line);
  };
  const who = (runner: Runner): string => `${runner.name} (${runner.role})`;

  /** x on every directory strictly between the trust root and `target`. */
  const traverse = (runner: Runner | null, target: string): void => {
    if (!runner) return;
    for (const dir of ancestorsBelow(target, host.trustRoot)) {
      const facts = host.paths.get(dir);
      if (!facts || facts.type !== 'dir') continue; // missing or not a directory: refused by the trust checks
      const fix = chmodFix(dir, facts, runner.cred, EXECUTE);
      if (fix) once(`x ${runner.name} ${dir}`, `'${dir}' cannot be traversed by ${who(runner)} — ${fix}`);
    }
  };
  /** r+x on a pinned binary (and x above it). */
  const runs = (runner: Runner | null, field: string, path: string): void => {
    if (!runner) return;
    traverse(runner, path);
    const facts = host.paths.get(path);
    if (!facts || facts.type !== 'file') return; // refused by the pinned-code checks
    const fix = chmodFix(path, facts, runner.cred, READ | EXECUTE);
    if (fix) {
      const missing = missingAccess(facts, runner.cred, READ | EXECUTE);
      once(`rx ${runner.name} ${path}`, `${field} '${path}' is not ${fileVerb(missing)} by ${who(runner)} — ${fix}`);
    }
  };

  // The agent: its checkout, whole.
  if (agent && host.paths.get(layout.agentDir)?.type === 'dir') {
    traverse(agent, layout.agentDir);
    const { paths, incomplete } = host.agentTree;
    if (incomplete !== null) {
      refusals.push(
        `agent_dir '${layout.agentDir}' could not be walked whole (${incomplete}) — whether ${who(agent)} can read ` +
          'every file of it is unproven; agent_dir must hold the agent checkout only (src/, node_modules/, package.json…)',
      );
    }
    const unreadable: string[] = [];
    for (const path of paths) {
      const facts = host.paths.get(path);
      if (!facts || (facts.type !== 'dir' && facts.type !== 'file')) continue; // a link is judged by what it names, never followed
      const need = facts.type === 'dir' ? READ | EXECUTE : READ;
      if (missingAccess(facts, agent.cred, need) === 0) continue;
      if (path === layout.agentDir) {
        const missing = missingAccess(facts, agent.cred, need);
        refusals.push(
          `'${path}' ${missing & READ ? 'is not readable' : 'cannot be traversed'} by ${who(agent)} — ${TREE_FIX(layout.agentDir)}`,
        );
      } else {
        unreadable.push(path);
      }
    }
    if (unreadable.length > 0) {
      const examples = unreadable.slice(0, TREE_EXAMPLES).map(path => `'${path}'`).join(', ');
      const more = unreadable.length > TREE_EXAMPLES ? ', …' : '';
      refusals.push(
        `agent_dir '${layout.agentDir}' holds ${unreadable.length} ${unreadable.length === 1 ? 'entry' : 'entries'} not readable by ` +
          `${who(agent)} (${examples}${more}) — ${TREE_FIX(layout.agentDir)}`,
      );
    }
  }
  // The pinned runtimes, for whoever runs them.
  runs(agent, 'bun_bin', layout.bunBin);
  runs(v2, 'bun_bin', layout.bunBin);
  runs(agent, 'php_bin', layout.phpBin);
  // The way down to the state root (its own tree is MODES').
  for (const runner of [agent, v2, v1]) traverse(runner, layout.state.root);
  return refusals;
}

/**
 * RULE: on a unix listener the socket is 0660 <agent>:<engine_group> (render/unit_agent.ts
 * Group=), so engine_group must be the group of the account that runs Dédalo on this machine.
 * A group one of OUR accounts already owns as its primary group (or the v2 group) is
 * certainly wrong: pairing would only ever say "unreachable". What this cannot prove is that
 * the work system's account IS in the group — that account is unknown to the declaration;
 * the install guide's step-7 request through the socket is that proof.
 */
export function engineGroupRefusal(layout: AgentLayout, host: HostState): string | null {
  const { agentUser, v1User, v2User, v2Group, engineGroup } = layout.identity;
  if (layout.listen.kind !== 'unix' || engineGroup === null) return null;
  const gid = host.groups.get(engineGroup);
  if (gid === undefined) return null; // refused where groups are checked
  const primaryOf = (user: string): number | undefined => host.accountGroups.get(user)?.primary;
  let is: string | null = null;
  if (primaryOf(agentUser) === gid) is = "the agent's own group";
  else if (primaryOf(v1User) === gid) is = "the v1 user's group";
  // By NAME: the declaration names both; the account primaries can only be compared by gid.
  else if (engineGroup === v2Group) is = 'the v2 group';
  else if (primaryOf(v2User) === gid) is = "the v2 user's group";
  if (is === null) return null;
  return `engine_group '${engineGroup}' is ${is} — it must be the work system's group: id -gn <the account that runs Dédalo>`;
}

/* ── actions ──────────────────────────────────────────────────────────────────────── */

export type WriteLabel = ArtifactKind | 'marker' | 'credential' | 'audit_log';

export type WriteContent =
  | { readonly source: 'literal'; readonly body: string }
  | { readonly source: 'random'; readonly bytes: number };

interface Ownership {
  readonly owner: string;
  readonly group: string;
  readonly uid: number;
  readonly gid: number;
}

export interface MkdirAction extends Ownership {
  readonly op: 'mkdir';
  readonly path: string;
  readonly mode: number;
}
export interface WriteAction extends Ownership {
  readonly op: 'write';
  readonly path: string;
  readonly label: WriteLabel;
  readonly content: WriteContent;
  readonly disposition: 'create' | 'rewrite';
  readonly mode: number;
  readonly validate: ArtifactValidator | null;
}
export interface ChownAction extends Ownership {
  readonly op: 'chown';
  readonly path: string;
}
export interface ChmodAction {
  readonly op: 'chmod';
  readonly path: string;
  readonly mode: number;
}
export interface DaemonReloadAction {
  readonly op: 'daemon-reload';
}
export interface WebConfigtestAction {
  readonly op: 'web-configtest';
  readonly server: WebServer;
  readonly bin: string;
}
export interface WebReloadAction {
  readonly op: 'web-reload';
  readonly unit: string;
}
export interface UnitAction {
  readonly op: 'enable' | 'start' | 'restart';
  readonly unit: string;
}
/** `chattr +a` on the audit trail (the audit contract, instance/roots.ts). */
export interface AppendOnlyAction {
  readonly op: 'append-only';
  readonly path: string;
}

export type Action =
  | MkdirAction
  | WriteAction
  | ChownAction
  | ChmodAction
  | AppendOnlyAction
  | DaemonReloadAction
  | WebConfigtestAction
  | WebReloadAction
  | UnitAction;

const FS_OPS = new Set<Action['op']>(['mkdir', 'write', 'chown', 'chmod', 'append-only']);
const TAIL_ORDER: readonly Action['op'][] = ['daemon-reload', 'web-configtest', 'web-reload', 'enable', 'start', 'restart'];

export class PlanRefused extends Error {
  readonly reasons: readonly string[];
  constructor(instance: string, reasons: readonly string[]) {
    super(`plan refused for instance '${instance}':\n${reasons.map(reason => `  - ${reason}`).join('\n')}`);
    this.name = 'PlanRefused';
    this.reasons = reasons;
  }
}

/* ── plan ─────────────────────────────────────────────────────────────────────────── */

export function plan(
  layout: AgentLayout,
  host: HostState,
  facts: RenderFacts = PENDING_FACTS,
  renderers: readonly Renderer[] = RENDERERS,
): Action[] {
  const refusals: string[] = [];
  const artifacts = renderAll(layout, facts, renderers);

  // 1. What the provisioner never creates: accounts. Each refusal names the declaration field
  //    and the exact command, in the order they must run (a group before the user joining it).
  const nologin = 'useradd --system --no-create-home --shell /usr/sbin/nologin';
  const { agentUser, v1User, v2User, v2Group, engineGroup } = layout.identity;
  if (!host.groups.has('root')) refusals.push(`group 'root' does not exist — this is not a usable host`);
  if (!host.users.has('root')) refusals.push(`user 'root' does not exist — this is not a usable host`);
  if (!host.groups.has(v2Group)) {
    refusals.push(`group '${v2Group}' (v2.group) does not exist — create it: groupadd --system ${v2Group}`);
  }
  if (engineGroup !== null && !host.groups.has(engineGroup)) {
    refusals.push(
      `group '${engineGroup}' (engine_group) does not exist — it must be the group of the account that runs ` +
        `Dédalo on this machine (id -gn <that account>); correct the declaration rather than creating it`,
    );
  }
  if (!host.users.has(agentUser)) {
    refusals.push(`user '${agentUser}' (agent_user) does not exist — create it: ${nologin} --user-group ${agentUser}`);
  }
  if (!host.users.has(v1User)) {
    refusals.push(
      `user '${v1User}' (v1.user) does not exist — it is the site's PHP-FPM pool user: create it ` +
        `(${nologin} -g <the web server's group, e.g. www-data> ${v1User}) and set 'user = ${v1User}' in the site's pool file`,
    );
  }
  if (!host.users.has(v2User)) {
    refusals.push(`user '${v2User}' (v2.user) does not exist — create it: ${nologin} -g ${v2Group} ${v2User}`);
  }

  // 2. What the provisioner never creates either, and what root runs or grants: the pinned
  //    code. Real, root-owned, not group/world-writable — leaf and every ancestor.
  const rootUid = host.users.get('root') ?? 0;
  const judged = new Set<string>();
  const judgeAncestors = (label: string, path: string): void => {
    for (const dir of ancestorsBelow(path, host.trustRoot)) {
      if (judged.has(dir)) continue;
      judged.add(dir);
      const facts = host.paths.get(dir);
      if (!facts) continue; // a missing ancestor means a missing leaf: refused there
      if (facts.type !== 'dir') {
        refusals.push(`'${dir}' (above ${label}) is a ${facts.type}, not a real directory — declare the canonical path`);
        continue;
      }
      const problem = trustProblem(facts, rootUid);
      if (problem) refusals.push(`'${dir}' (above ${label}) is ${problem}`);
    }
  };
  const PINNED = [
    ['web.configtest_bin', layout.web.configtestBin, 'file', true],
    ['php_bin', layout.phpBin, 'file', true],
    ['bun_bin', layout.bunBin, 'file', true],
    ['agent_dir', layout.agentDir, 'dir', false],
    ['agent entry', layout.agentEntry, 'file', false],
  ] as const;
  for (const [field, path, kind, executable] of PINNED) {
    const facts = host.paths.get(path);
    if (!facts && path === layout.web.configtestBin) {
      refusals.push(
        `${field}: none of ${WEB_CONFIGTEST_CANDIDATES[layout.web.server].join(', ')} is a real executable ` +
          `file on this host — install ${layout.web.server} first`,
      );
      continue;
    }
    if (!facts) {
      refusals.push(
        path === layout.agentEntry
          ? `agent_dir has no '${path}' — check out publication/host_agent there first`
          : kind === 'dir'
            ? `${field} '${path}' does not exist — check out publication/host_agent there first`
            : `${field} '${path}' is not an executable file on this host`,
      );
      continue;
    }
    if (facts.type === 'symlink' && path === layout.web.configtestBin) {
      // Not a declared field: the operator cannot "declare the real path".
      refusals.push(
        `${field}: none of ${WEB_CONFIGTEST_CANDIDATES[layout.web.server].join(', ')} is a real executable ` +
          `file on this host ('${path}' is a symlink) — install ${layout.web.server} from the distribution's package`,
      );
      continue;
    }
    if (facts.type === 'symlink') {
      refusals.push(
        `${field} '${path}' is a symlink — declare the real path` +
          (facts.target ? ` ('${facts.target}')` : ' (it does not resolve)') +
          ' (a link can be repointed after this check)',
      );
      continue;
    }
    if (facts.type !== kind || (executable && (facts.mode & 0o111) === 0)) {
      refusals.push(
        kind === 'dir'
          ? `${field} '${path}' is a ${facts.type}, not a directory`
          : executable
            ? `${field} '${path}' is not an executable file on this host`
            : `agent_dir has no '${path}' — check out publication/host_agent there first`,
      );
      continue;
    }
    const problem = trustProblem(facts, rootUid);
    if (problem) {
      refusals.push(
        `${field} '${path}' is ${problem} — a non-root principal could replace what ${kind === 'dir' ? 'runs from it' : 'it runs'}; ` +
          'make it root-owned and not group- or world-writable',
      );
    }
    judgeAncestors(`${field} '${path}'`, path);
    if (kind === 'dir') judged.add(path);
  }
  if (host.paths.has(agentScratchPath(layout))) {
    refusals.push(
      `agent_dir holds a test scratch tree '${agentScratchPath(layout)}' — the suite ran in this checkout; ` +
        'remove it (it is what lets a hand start fall back to the committed .env.test test mode)',
    );
  }
  const devInstalled = agentDevDependencyPaths(layout).filter(path => host.paths.has(path));
  if (devInstalled.length > 0) {
    refusals.push(
      `agent_dir holds development dependencies (${devInstalled.map(path => `'${path}'`).join(', ')}) — ` +
        'it was prepared with hostagent:install:dev or the suite ran in it; delete its node_modules/ ' +
        "(a production install over it keeps the development packages), run 'bun run hostagent:install' " +
        '(frozen, production-only) and copy that tree',
    );
  }
  // 2b. …and the accounts that RUN it can reach it; the socket's group is the work system's.
  refusals.push(...accessRefusals(layout, host));
  const engineGroupProblem = engineGroupRefusal(layout, host);
  if (engineGroupProblem) refusals.push(engineGroupProblem);
  if (refusals.length > 0) throw new PlanRefused(layout.instance, refusals);

  // 3. What lies ABOVE the managed trees: a non-root principal there could redirect root's writes.
  const managedDirs = new Set(layout.directories.map(dir => dir.path));
  for (const target of [
    ...layout.directories.map(dir => dir.path),
    layout.state.marker,
    layout.serviceTokenPath,
    layout.state.auditFile,
    ...artifacts.map(art => art.path),
  ]) {
    for (const dir of ancestorsBelow(target, host.trustRoot)) {
      if (managedDirs.has(dir) || judged.has(dir)) continue;
      judged.add(dir);
      const facts = host.paths.get(dir);
      if (!facts) continue; // missing parents are refused where they are needed (below)
      if (facts.type !== 'dir') {
        refusals.push(`'${dir}' (above the managed '${target}') is a ${facts.type}, not a real directory`);
        continue;
      }
      const problem = trustProblem(facts, rootUid);
      if (problem) {
        refusals.push(`'${dir}' (above the managed '${target}') is ${problem} — a non-root principal could redirect the provisioner's root writes`);
      }
    }
  }

  const uidOf = (name: string): number => host.users.get(name) as number;
  const gidOf = (name: string): number => host.groups.get(name) as number;
  const ownership = (owner: string, group: string): Ownership => ({ owner, group, uid: uidOf(owner), gid: gidOf(group) });

  const fsActions: Action[] = [];
  const metaActions: Action[] = [];
  const sealActions: Action[] = [];
  const created = new Set<string>();
  const effects = new Set<ArtifactEffect>();
  const services: ArtifactService[] = [];

  const parentReady = (path: string): boolean => {
    const parent = dirname(path);
    return created.has(parent) || host.paths.get(parent)?.type === 'dir';
  };
  const metadata = (into: Action[], path: string, facts: PathFacts, own: Ownership, mode: number): void => {
    if (facts.uid !== own.uid || facts.gid !== own.gid) into.push({ op: 'chown', path, ...own });
    if ((facts.mode & 0o7777) !== mode) into.push({ op: 'chmod', path, mode });
  };

  // 4. Directories, parents first (layout sorted them); a drifted directory is fixed in
  //    place, BEFORE any child of it is created (apply's parent check needs it trusted).
  for (const dir of layout.directories) {
    const row = MODES[dir.modeKey];
    const own = ownership(ownerName(layout, row.owner), groupName(layout, row.group));
    const facts = host.paths.get(dir.path);
    if (!facts) {
      if (!parentReady(dir.path)) {
        refusals.push(`parent directory '${dirname(dir.path)}' of '${dir.path}' does not exist`);
        continue;
      }
      fsActions.push({ op: 'mkdir', path: dir.path, mode: row.mode, ...own });
      created.add(dir.path);
      continue;
    }
    if (facts.type !== 'dir') {
      refusals.push(`'${dir.path}' must be a directory (${dir.modeKey}) but is a ${facts.type}`);
      continue;
    }
    metadata(fsActions, dir.path, facts, own, row.mode);
  }

  // 5. The state-root marker: ours to create, never to retarget.
  {
    const row = MODES.marker;
    const own = ownership(ownerName(layout, row.owner), groupName(layout, row.group));
    const path = layout.state.marker;
    const facts = host.paths.get(path);
    if (!facts) {
      if (parentReady(path)) {
        fsActions.push({
          op: 'write',
          path,
          label: 'marker',
          content: { source: 'literal', body: markerContent(layout.instance) },
          disposition: 'create',
          mode: row.mode,
          validate: null,
          ...own,
        });
      } else {
        refusals.push(`parent directory '${dirname(path)}' of '${path}' does not exist`);
      }
    } else if (facts.type !== 'file') {
      refusals.push(`'${path}' (state-root marker) is a ${facts.type}, not a file`);
    } else if (host.contents.get(path) !== markerContent(layout.instance)) {
      refusals.push(`'${path}' does not mark instance '${layout.instance}' — this state root belongs to another instance`);
    } else {
      metadata(metaActions, path, facts, own, row.mode);
    }
  }

  // 6. Create-once files whose content is never ours to read or rewrite: the service token
  //    (minted) and the audit log (created empty; the agent appends).
  for (const [label, path, modeKey, content] of [
    ['credential', layout.serviceTokenPath, 'credential', { source: 'random', bytes: SERVICE_TOKEN_BYTES }],
    ['audit_log', layout.state.auditFile, 'auditFile', { source: 'literal', body: '' }],
  ] as const) {
    const row = MODES[modeKey];
    const own = ownership(ownerName(layout, row.owner), groupName(layout, row.group));
    const facts = host.paths.get(path);
    const seal = label === 'audit_log';
    if (!facts) {
      if (parentReady(path)) {
        fsActions.push({ op: 'write', path, label, content, disposition: 'create', mode: row.mode, validate: null, ...own });
        if (seal) sealActions.push({ op: 'append-only', path });
      } else {
        refusals.push(`parent directory '${dirname(path)}' of '${path}' does not exist`);
      }
    } else if (facts.type !== 'file') {
      refusals.push(`'${path}' (${label}) is a ${facts.type}, not a file`);
    } else if (seal && host.appendOnly.has(path)) {
      if (facts.uid !== own.uid || facts.gid !== own.gid || (facts.mode & 0o7777) !== row.mode) {
        refusals.push(
          `'${path}' (audit_log) is append-only, so its owner/mode cannot be corrected in place — ` +
            `chattr -a it, set ${own.owner}:${own.group} ${octal(row.mode)}, and re-run (the attribute is restored)`,
        );
      }
    } else {
      metadata(metaActions, path, facts, own, row.mode);
      if (seal) sealActions.push({ op: 'append-only', path });
    }
  }

  // 7. Rendered artifacts: write only on drift; refuse what is not ours or was hand-edited.
  for (const art of artifacts) {
    if (art.service) services.push(art.service);
    const own = ownership(art.owner, art.group);
    const facts = host.paths.get(art.path);
    const write = (disposition: 'create' | 'rewrite'): void => {
      fsActions.push({
        op: 'write',
        path: art.path,
        label: art.kind,
        content: { source: 'literal', body: art.body },
        disposition,
        mode: art.mode,
        validate: art.validate,
        ...own,
      });
      for (const effect of art.effects) effects.add(effect);
    };
    if (!facts) {
      if (parentReady(art.path)) write('create');
      else refusals.push(`parent directory '${dirname(art.path)}' of '${art.path}' does not exist`);
      continue;
    }
    if (facts.type !== 'file') {
      refusals.push(`'${art.path}' (${art.kind}) is a ${facts.type}, not a file`);
      continue;
    }
    const text = host.contents.get(art.path);
    if (text === null || text === undefined) {
      refusals.push(`'${art.path}' (${art.kind}) exists but could not be read`);
      continue;
    }
    const parsed = parseStamp(text);
    if (!parsed) {
      refusals.push(`'${art.path}' exists and was not written by this provisioner (no stamp) — move it aside`);
      continue;
    }
    if (parsed.instance !== layout.instance || parsed.kind !== art.kind) {
      refusals.push(`'${art.path}' is stamped for '${parsed.instance} ${parsed.kind}', not '${layout.instance} ${art.kind}'`);
      continue;
    }
    if (hasDrifted(text)) {
      refusals.push(`'${art.path}' (${art.kind}) was edited by hand since the provisioner wrote it — move it aside or restore it`);
      continue;
    }
    if (text !== art.body) {
      write('rewrite');
      continue;
    }
    metadata(metaActions, art.path, facts, own, art.mode);
  }

  if (refusals.length > 0) throw new PlanRefused(layout.instance, refusals);

  // 8. The tail.
  const tail: Action[] = [];
  if (effects.has('daemon_reload')) tail.push({ op: 'daemon-reload' });
  if (effects.has('reload_web')) {
    tail.push({ op: 'web-configtest', server: layout.web.server, bin: layout.web.configtestBin });
    tail.push({ op: 'web-reload', unit: layout.web.unit });
  }
  const started = new Set<string>();
  for (const service of services) {
    const facts = host.units.get(service.unit) ?? { enabled: false, active: false };
    if (!facts.enabled) tail.push({ op: 'enable', unit: service.unit });
    if (service.start && !facts.active) {
      tail.push({ op: 'start', unit: service.unit });
      started.add(service.unit);
    }
  }
  for (const [effect, unit] of [
    ['restart_agent', layout.agentUnitName],
    ['restart_v2', layout.v2.unit],
  ] as const) {
    if (effects.has(effect) && host.units.get(unit)?.active === true && !started.has(unit)) {
      tail.push({ op: 'restart', unit });
    }
  }
  tail.sort((a, b) => TAIL_ORDER.indexOf(a.op) - TAIL_ORDER.indexOf(b.op));

  const actions = [...fsActions, ...metaActions, ...sealActions, ...tail];
  assertPlanIsCoherent(actions, host);
  return actions;
}

/* ── coherence (a programming-error backstop, not a refusal) ──────────────────────── */

export function assertPlanIsCoherent(actions: readonly Action[], host: HostState): void {
  const madeDirs = new Set<string>();
  const touched = new Set<string>();
  const sealed = new Set<string>();
  let tailStarted = false;
  let reloaded = false;
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index] as Action;
    if (FS_OPS.has(action.op)) {
      if (tailStarted) throw new Error(`plan: '${describe(action)}' comes after a service action`);
    } else {
      tailStarted = true;
    }
    switch (action.op) {
      case 'mkdir':
      case 'write': {
        const parent = dirname(action.path);
        if (!madeDirs.has(parent) && host.paths.get(parent)?.type !== 'dir') {
          throw new Error(`plan: '${describe(action)}' has no parent directory`);
        }
        if (touched.has(action.path)) throw new Error(`plan: '${action.path}' is created or written twice`);
        touched.add(action.path);
        if (sealed.has(action.path)) throw new Error(`plan: '${action.path}' is written after it was made append-only`);
        if (action.op === 'mkdir') madeDirs.add(action.path);
        if (action.op === 'write' && action.label === 'credential') {
          if (action.disposition !== 'create' || action.content.source !== 'random') {
            throw new Error('plan: a credential is only ever minted, never rewritten');
          }
        }
        if (action.op === 'write' && action.label === 'audit_log') {
          if (action.disposition !== 'create' || action.content.source !== 'literal' || action.content.body !== '') {
            throw new Error('plan: the audit log is only ever created empty, never rewritten');
          }
        }
        break;
      }
      case 'chown':
      case 'chmod':
        if (sealed.has(action.path)) throw new Error(`plan: '${describe(action)}' comes after the file was made append-only`);
        break;
      case 'append-only':
        if (!touched.has(action.path) && host.paths.get(action.path)?.type !== 'file') {
          throw new Error(`plan: '${describe(action)}' names no file`);
        }
        sealed.add(action.path);
        break;
      case 'web-reload': {
        const previous = actions[index - 1];
        if (!previous || previous.op !== 'web-configtest') {
          throw new Error('plan: a web-reload must immediately follow a web-configtest');
        }
        break;
      }
      case 'daemon-reload':
        if (reloaded) throw new Error('plan: daemon-reload twice');
        reloaded = true;
        break;
      default:
        break;
    }
  }
  const daemonReload = actions.findIndex(action => action.op === 'daemon-reload');
  if (daemonReload !== -1) {
    const early = actions.findIndex(
      action => action.op === 'enable' || action.op === 'start' || action.op === 'restart',
    );
    if (early !== -1 && early < daemonReload) throw new Error('plan: a unit action precedes daemon-reload');
  }
}

/* ── the one voice ────────────────────────────────────────────────────────────────── */

function octal(mode: number): string {
  return `0${mode.toString(8)}`;
}

/** One line per action. Never a byte of content: a credential shows as "random bytes". */
export function describe(action: Action): string {
  switch (action.op) {
    case 'mkdir':
      return `mkdir ${action.path} (${action.owner}:${action.group} ${octal(action.mode)})`;
    case 'write': {
      const random = action.content.source === 'random' ? ` — ${action.content.bytes} random bytes, never shown` : '';
      return `write ${action.path} [${action.label}] ${action.disposition}${random} (${action.owner}:${action.group} ${octal(action.mode)})`;
    }
    case 'chown':
      return `chown ${action.owner}:${action.group} ${action.path}`;
    case 'chmod':
      return `chmod ${octal(action.mode)} ${action.path}`;
    case 'append-only':
      return `chattr +a ${action.path} (append-only audit trail)`;
    case 'daemon-reload':
      return 'systemctl daemon-reload';
    case 'web-configtest':
      return `${action.bin} -t (${action.server} configtest)`;
    case 'web-reload':
      return `systemctl reload ${action.unit}`;
    case 'enable':
    case 'start':
    case 'restart':
      return `systemctl ${action.op} ${action.unit}`;
    default: {
      const unreachable: never = action;
      throw new Error(`plan: unknown action ${JSON.stringify(unreachable)}`);
    }
  }
}
