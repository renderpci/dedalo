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
 * SITE, SELINUX AND HOST-WIDE STATE (provision init, step 1; spec S4, S5, S9, S11, §5.9). With a
 * `site`: the web include and the dedicated v1 pool are artifacts with POST-RENAME validators (`web`,
 * `fpm`: apply.ts installValidatedPostRename, under the host web lock), the v1 pool's own
 * directories are created, and the tail gains fpm-configtest → fpm-reload. On an SELinux host the
 * instance's file-context rules and port label are imported in one `semanage import` transaction,
 * then relabelled (restorecon), both before every configtest op; an operator rule on one of our specs
 * with another type, or a v2 port the policy types otherwise, is REFUSED (never overridden). Every
 * declaration ensures the HOST-WIDE directories (HOST_BASE, its locks; on nginx `conf_d` the map and
 * renderer directories) — each created under a temporary name and renamed, an existing one with other
 * metadata refused, never chowned — and the two host lock files; on nginx `conf_d` the plan also
 * rewrites the renderer's identities.json and sweeps contributions no declaration owns. The caller
 * holds the host provision lock around planning and applying (apply.ts lockHostProvision).
 *
 * ZERO-DEPENDENCY.
 */
import { dirname, join } from 'node:path';
import type { AccountGroups, Credentials } from './access';
import { EXECUTE, READ, accountCredentials, chmodFix, missingAccess, unitCredentials } from './access';
import type { RestoreconTarget } from './exec_contract';
import { HOST_STAMP_INSTANCE, hasDrifted, parseStamp } from './hash';
import type { AgentLayout, HostLockName, ModeKey, WebServer } from './layout';
import {
  DEFAULT_PATHS,
  HOST_LOCK_FILES,
  HOST_MAP_UNIT,
  MODES,
  PUBHOST_GROUP,
  SERVICE_TOKEN_BYTES,
  SYSTEMD_FLOOR,
  WEB_CONFIGTEST_CANDIDATES,
  groupName,
  markerContent,
  ownerName,
  webLogBase,
} from './layout';
import type { TrustDerivation } from './fapolicyd_trust';
import { TRUST_FILE_MODE, pendingEntry, renderTrustFile, trustFileProblem } from './fapolicyd_trust';
import { engineFragmentRenderer } from './render/engine_fragment';
import { envRenderer } from './render/env';
import { fpmPoolRenderer } from './render/fpm_pool';
import { logrotateRenderer, v1LogrotateRenderer } from './render/logrotate';
import { hostMapUnitRenderer } from './render/host_map_unit';
import { nginxMapIncludeRenderer } from './render/nginx_map_include';
import { polkitRenderer } from './render/polkit';
import { sudoersRenderer } from './render/sudoers';
import { trustUnitRenderer } from './render/trust_unit';
import { agentUnitGroups, agentUnitRenderer } from './render/unit_agent';
import { v2ScratchUnitRenderer, v2UnitGroups, v2UnitRenderer } from './render/unit_v2';
import { webIncludeRenderer } from './render/web_include';
import type {
  Artifact,
  ArtifactEffect,
  ArtifactKind,
  ArtifactService,
  ArtifactValidator,
  RenderFacts,
  Renderer,
  UnitGroups,
  WriteValidator,
} from './render/types';
import { ARTIFACT_KINDS, PENDING_FACTS } from './render/types';
import { parseHostMapResult } from '../rules/host_map';
import {
  IDENTITIES_FILE,
  MAP_GRAMMAR,
  MAP_RENDERER_FILES,
  parseRendererVersion,
  renderIdentities,
  renderRendererVersion,
  rendererInstallDecision,
} from './host_map_renderer';
import type { RecordedArtifact, RecordedTree } from './retire';
import {
  RETIRABLE_KINDS,
  RETIRED_SUFFIX,
  currentRecord,
  encodeRecord,
  parseRecord,
  recordPath,
  retiredFileProblem,
  retiredOf,
  retiredTreeProblem,
} from './retire';
import type { SelinuxRuleFacts } from './selinux';
import {
  SELINUX_IMPORT_NAME,
  SELINUX_STATE_NAME,
  encodeSelinuxState,
  fcontextEntry,
  importLines,
  isHomeLayout,
  labelScope,
  parseSelinuxState,
  portEntry,
  restoreconTargets,
  selinuxPort,
  selinuxRules,
} from './selinux';

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
  webIncludeRenderer,
  fpmPoolRenderer,
  nginxMapIncludeRenderer,
  hostMapUnitRenderer,
  logrotateRenderer,
  v1LogrotateRenderer,
  trustUnitRenderer,
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
      const stampedFor = produced.hostWide ? HOST_STAMP_INSTANCE : layout.instance;
      if (!parsed || parsed.kind !== produced.kind || parsed.instance !== stampedFor || hasDrifted(produced.body)) {
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
  /** Device and inode (observeHost's lstat): carried into a pinned door's expectation (PinExpectation). */
  readonly dev?: number;
  readonly ino?: number;
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
  // ── provision init, step 1 (all optional: a HostState without them is a host without them) ──
  /** `systemctl --version` (spec S10); absent/null = unknown, the floor is not judged. */
  readonly systemdVersion?: number | null;
  /** The SELinux facts (spec S9); absent = no SELinux on this host. */
  readonly selinux?: SelinuxObserved;
  /**
   * The other declarations in the config base and their agent users' uids (identities.json, the
   * contribution sweep, the port-label lifecycle). ABSENT = not observed: the plan then neither
   * rewrites identities.json nor sweeps (it would drop every other instance) and says so (planReport).
   */
  readonly siblings?: readonly SiblingFacts[];
  /** The entries of the host map's contrib directory (nginx `conf_d`), lstat only. Absent = not listed. */
  readonly contributions?: readonly ContributionFacts[];
  /** With a site: the web server's own dump lists the include (DUMP_INCLUDES / nginx -T). null/absent = unknown. */
  readonly webReference?: boolean | null;
  /**
   * nginx `conf_d` (spec §13.5): the installed renderer copy's VERSION text (null = none installed)
   * and the digest of THIS agent_dir's renderer closure (null = it could not be read whole).
   * Absent = not observed: the renderer is then not installed by this plan (planReport says so).
   */
  readonly renderer?: { readonly installed: string | null; readonly ownDigest: string | null };
  /** nginx `conf_d`: the live host map exists, and the root renderer's last `result.json` text (null = none). */
  readonly hostMap?: { readonly live: boolean; readonly result: string | null };
  /**
   * fapolicyd hosts (layout.trust): the trust set derived NOW (fapolicyd_trust.ts deriveTrust, read
   * only) and whether the daemon runs. The trust file's own lstat facts and text are in `paths` /
   * `contents`. Absent on a fapolicyd layout = not observed: the plan refuses (it cannot judge).
   */
  readonly trust?: { readonly derivation: TrustDerivation; readonly daemonActive: boolean };
}

/** What observeHost learns of SELinux (spec S9, §5.9). */
export interface SelinuxObserved {
  readonly mode: 'absent' | 'disabled' | 'permissive' | 'enforcing';
  /** `/etc/selinux/<SELINUXTYPE>/` exists and semanage is installed (the disabled-with-store branch). */
  readonly storePresent: boolean;
  /** `semanage fcontext -l -C`: the local file-context rules. */
  readonly localFcontext: readonly { readonly spec: string; readonly type: string }[];
  /** `semanage port -l -C`: the local port labels. */
  readonly localPorts: readonly { readonly type: string; readonly proto: string; readonly port: number }[];
  /** `semanage port -l` (policy and local), tcp: port → type. */
  readonly portTypes: ReadonlyMap<number, string>;
  /** `restorecon -n -v` over this instance's existing targets: what would be relabelled. */
  readonly pending: readonly { readonly path: string; readonly from: string; readonly to: string }[];
  /** `<configBase>/<instance>/selinux.state` (what the last apply registered), null = absent. */
  readonly state: string | null;
  /** getsebool of SELINUX_BOOLEANS (read, never written by the provisioner). */
  readonly booleans: Readonly<Record<string, boolean>>;
  /** The media root lies on a local or `seclabel` filesystem (a network mount is labelled by its own `context=`). */
  readonly mediaLabelable: boolean;
}

export interface SiblingFacts {
  readonly layout: AgentLayout;
  /** The sibling's agent user's uid; null = that account does not exist. */
  readonly agentUid: number | null;
}

export interface ContributionFacts {
  /** The file name in the contrib directory. */
  readonly name: string;
  readonly type: EntryType;
  readonly uid: number;
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

/**
 * THE ANCESTRY LAW (spec §2.2, exported for init's footgun guards): every directory strictly between
 * `trustRoot` and `path` must be a real directory (never a link) owned by root and not group- or
 * world-writable. One refusal line per bad directory; a directory already in `judged` is not judged
 * twice (several paths share ancestors); a missing ancestor is skipped (its leaf is refused there).
 */
export function judgeAncestors(
  label: string,
  path: string,
  trustRoot: string,
  lstat: (path: string) => PathFacts | null | undefined,
  rootUid: number,
  judged: Set<string>,
): string[] {
  const refusals: string[] = [];
  for (const dir of ancestorsBelow(path, trustRoot)) {
    if (judged.has(dir)) continue;
    judged.add(dir);
    const facts = lstat(dir);
    if (!facts) continue; // a missing ancestor means a missing leaf: refused there
    if (facts.type !== 'dir') {
      refusals.push(`'${dir}' (above ${label}) is a ${facts.type}, not a real directory — declare the canonical path`);
      continue;
    }
    const problem = trustProblem(facts, rootUid);
    if (problem) refusals.push(`'${dir}' (above ${label}) is ${problem}`);
  }
  return refusals;
}

/**
 * The polkit daemon's account. EL's polkit package ships its rules directory OWNED by it
 * (`/etc/polkit-1/rules.d` polkitd:root 0700, measured RHEL 9.8 polkit-0.117): the daemon that
 * EVALUATES a rules file already decides every grant, so its owning the directory the file sits in
 * gives it nothing it lacks. That one directory — the immediate parent of the instance's polkit rules
 * file, judged for that file only — may be the daemon's, never group- or world-writable
 * (polkitDirTrusted); every other ancestor of every target stays root's (apply.ts assertSafeParent
 * already lets the immediate parent of a renamed-into-place file be another principal's).
 */
export const POLKIT_DAEMON_USER = 'polkitd';
/** polkit's unit, Debian and EL alike: restarted after a fapolicyd trust update that lists a new rules file. */
export const POLKIT_UNIT = 'polkit';

/** Whether `facts` is the polkit rules directory as the polkit package ships it (POLKIT_DAEMON_USER). */
export function polkitDirTrusted(facts: PathFacts | undefined, polkitdUid: number | undefined): boolean {
  return facts?.type === 'dir' && polkitdUid !== undefined && facts.uid === polkitdUid && (facts.mode & 0o022) === 0;
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
 *     r+x on bun_bin and php_bin (it runs the v1 syntax check — v1 only) and x above each;
 *   - v2 (its unit and the scratch template): r+x on bun_bin, x above it;
 *   - x above state_root for the agent, v2 and v1 (the site's PHP-FPM pool reads the v1
 *     releases and config through it; no v1 account on a v2-only instance). state_root's own tree is the provisioner's (MODES):
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
  const { agentUser, v2User } = layout.identity;
  const v1User = layout.v1?.user ?? null;
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
  const v1Db = v1User === null ? null : database(v1User, 'v1.user');
  if (v1Db && v1User !== null) v1 = { name: v1User, role: 'v1', cred: accountCredentials(host.users.get(v1User) as number, v1Db) };
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
  if (layout.v1 !== null) runs(agent, 'php_bin', layout.v1.phpBin);
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
  const { agentUser, v2User, v2Group, engineGroup } = layout.identity;
  const v1User = layout.v1?.user ?? null;
  if (layout.listen.kind !== 'unix' || engineGroup === null) return null;
  const gid = host.groups.get(engineGroup);
  if (gid === undefined) return null; // refused where groups are checked
  const primaryOf = (user: string): number | undefined => host.accountGroups.get(user)?.primary;
  let is: string | null = null;
  if (primaryOf(agentUser) === gid) is = "the agent's own group";
  else if (v1User !== null && primaryOf(v1User) === gid) is = "the v1 user's group";
  // By NAME: the declaration names both; the account primaries can only be compared by gid.
  else if (engineGroup === v2Group) is = 'the v2 group';
  else if (primaryOf(v2User) === gid) is = "the v2 user's group";
  if (is === null) return null;
  return `engine_group '${engineGroup}' is ${is} — it must be the work system's group: id -gn <the account that runs Dédalo>`;
}

/* ── actions ──────────────────────────────────────────────────────────────────────── */

export type WriteLabel = ArtifactKind | 'marker' | 'credential' | 'audit_log' | 'host_identities' | 'host_lock' | 'fapolicyd_trust';

export type WriteContent =
  | { readonly source: 'literal'; readonly body: string }
  | { readonly source: 'random'; readonly bytes: number };

interface Ownership {
  readonly owner: string;
  readonly group: string;
  readonly uid: number;
  readonly gid: number;
}

/**
 * A file installed with a POST-RENAME validator (web/fpm) keeps its rollback beside it until the
 * reload that loads it succeeded: the previous bytes at `<path>.dedalo-provision.bak` (a rewrite),
 * or an empty `<path>.dedalo-provision.created` marker (a create, rolled back by removal). Their
 * presence on a later run means "reload pending" — the plan reloads (spec §5.9), so a run that died
 * between the write and the reload never leaves a configuration on disk the server did not load.
 * Neither suffix ends in `.conf`: no include glob ever matches them.
 */
export const VALIDATED_BACKUP_SUFFIX = '.dedalo-provision.bak';
export const VALIDATED_CREATED_SUFFIX = '.dedalo-provision.created';

/**
 * What a reload restores when the server is not active after it. `retire`: a retired FPM pool
 * (retire.ts) waits at `<path>.dedalo-provision.bak` until the reload succeeded — restored by
 * renaming it back, dropped after a good reload.
 */
export interface RestoreEntry {
  readonly path: string;
  readonly disposition: 'create' | 'rewrite' | 'retire';
}

/** The host web lock a validator or a configtest+reload pair is taken under (spec S12 3). */
export interface HostLockRef {
  readonly dir: string;
  readonly uid: number;
  readonly gid: number;
}

/**
 * WHAT THE PINNED PARENT MUST BE (security review S3-1). "A root directory closed to others" is not
 * enough: any such directory an attacker could substitute (the agent's own `publication_api/<api>/`
 * may hold one root left behind, a package's spare root:root 0755 directory) would pass. The caller
 * states the parent it EXPECTS — exact owner, group and mode (the MODES row for the state tree's
 * `shared/`; the observed facts for `/var/log/<server>`) and, when the plan observed it, the
 * directory's identity (observeHost's dev + ino, carried in the action) — and anything else is refused.
 */
export interface PinExpectation {
  /** The directory pinned: the entry's parent. A door refuses a pin whose parent is another. */
  readonly parent: string;
  readonly uid: number;
  readonly gid: number;
  /** Permission bits (`& 0o7777`). */
  readonly mode: number;
  /** The identity observed (observeHost lstat), when the plan observed the directory. */
  readonly dev?: number;
  readonly ino?: number;
}

export interface MkdirAction extends Ownership {
  readonly op: 'mkdir';
  readonly path: string;
  readonly mode: number;
  /**
   * HOST-WIDE (spec §5.9): created as this temporary sibling, fchown/fchmod'ed through its
   * descriptor, then renamed into place — no other process ever sees it with the wrong metadata.
   */
  readonly via?: string;
  /** The parent pinned (rule 1's one exception, apply.ts pinnedParentOf) and what it must be. */
  readonly pin?: PinExpectation;
}
export interface WriteAction extends Ownership {
  readonly op: 'write';
  readonly path: string;
  readonly label: WriteLabel;
  readonly content: WriteContent;
  readonly disposition: 'create' | 'rewrite';
  readonly mode: number;
  readonly validate: ArtifactValidator | null;
  /** What `validate` runs (null for none); web/fpm also name the host web lock they are taken under. */
  readonly validator?: WriteValidator | null;
  readonly lock?: HostLockRef;
}
export interface ChownAction extends Ownership {
  readonly op: 'chown';
  readonly path: string;
  readonly pin?: PinExpectation;
}
export interface ChmodAction {
  readonly op: 'chmod';
  readonly path: string;
  readonly mode: number;
  readonly pin?: PinExpectation;
}
export interface DaemonReloadAction {
  readonly op: 'daemon-reload';
}
export interface WebConfigtestAction {
  readonly op: 'web-configtest';
  readonly server: WebServer;
  readonly bin: string;
  /** Held from this configtest through the reload that follows it. */
  readonly lock?: HostLockRef;
}
export interface WebReloadAction {
  readonly op: 'web-reload';
  readonly unit: string;
  /**
   * The files this run wrote with the `web` validator: restored from their backups when the
   * server is not active after the reload (an AVC or a bad module kills the master at reload).
   */
  readonly restore?: readonly RestoreEntry[];
  readonly server?: WebServer;
  readonly bin?: string;
}
export interface FpmConfigtestAction {
  readonly op: 'fpm-configtest';
  readonly bin: string;
  readonly lock?: HostLockRef;
}
export interface FpmReloadAction {
  readonly op: 'fpm-reload';
  readonly unit: string;
  readonly bin: string;
  /** The pool files this run wrote: restored when the FPM master is not active after the reload. */
  readonly restore: readonly RestoreEntry[];
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
/**
 * The contribution sweep (spec §5.9) and a RETIRED artifact (retire.ts): renamed to the
 * provisioner temp name, then removed — never followed. With `validator` (a retired FPM pool):
 * under the host web lock, renamed to `<path>.dedalo-provision.bak`, then the FPM configtest —
 * restored when it fails; the backup stays for the reload (`keepRollback`) or goes at once.
 */
export interface RemoveAction {
  readonly op: 'remove';
  readonly path: string;
  readonly why: string;
  readonly validator?: { readonly kind: 'fpm'; readonly bin: string; readonly unit: string };
  readonly lock?: HostLockRef;
  readonly keepRollback?: boolean;
}
/**
 * A RETIRED TREE (retire.ts), in the tail after the agent restarted: renamed to
 * `<path>.dedalo-provision.retired` (`resume`: that temp is left over, the rename is done),
 * chowned root:root and chmodded 0700 through the entry door, then `rm -rf --one-file-system`.
 */
export interface RemoveTreeAction {
  readonly op: 'remove-tree';
  readonly path: string;
  readonly temp: string;
  readonly resume: boolean;
  readonly uid: number;
  readonly gid: number;
}
/** The provision record (retire.ts), LAST: a run that failed earlier keeps the previous one. */
export interface ProvisionRecordAction {
  readonly op: 'provision-record';
  readonly path: string;
  readonly body: string;
  readonly uid: number;
  readonly gid: number;
}
/**
 * Root's host-map renderer copy (spec §13.5): MAP_RENDERER_FILES copied from agent_dir, the
 * verified bun as `<dir>/bun`, the empty bunfig, then VERSION LAST (the record never names a copy
 * that is not whole). Each file atomic (temp → fchown/fchmod → rename); unchanged copies are rewritten
 * byte-identical (the digest decided).
 */
export interface RendererInstallAction {
  readonly op: 'renderer-install';
  readonly dir: string;
  readonly sourceDir: string;
  readonly files: readonly string[];
  /** The subdirectories the copy needs that are missing (relative, parents first), created root 0755. */
  readonly subdirs: readonly string[];
  readonly bun: string;
  readonly versionBody: string;
  readonly why: string;
  readonly uid: number;
  readonly gid: number;
}
/** One `semanage import` transaction, then `selinux.state` (spec S9, §5.9). */
export interface SelinuxImportAction {
  readonly op: 'selinux-import';
  /** `<configBase>/<instance>/selinux.import` — written as its provisioner temp (root 0600), removed after. */
  readonly file: string;
  /** Empty when only the registration history moved (rules registered by an earlier run). */
  readonly lines: readonly string[];
  readonly statePath: string;
  readonly stateBody: string;
  /** root's uid/gid (the import temp and the state file are root's). */
  readonly uid: number;
  readonly gid: number;
}
/**
 * fapolicyd's database after this run wrote the instance's trust file (fapolicyd_trust.ts
 * commitTrust): `fapolicyd-cli --update`, then wait until `--dump-db` lists `pending` (the last line
 * the new file added; null = it only removed lines). In the tail BEFORE every start and restart: the
 * agent and v2 run code only the new file trusts.
 */
export interface FapolicydUpdateAction {
  readonly op: 'fapolicyd-update';
  readonly path: string;
  readonly pending: string | null;
}
/** restorecon over the instance's targets, then the same as a dry run that must find nothing (spec §5.9). */
export interface SelinuxRestoreconAction {
  readonly op: 'selinux-restorecon';
  readonly targets: readonly RestoreconTarget[];
}

export type Action =
  | MkdirAction
  | WriteAction
  | ChownAction
  | ChmodAction
  | AppendOnlyAction
  | RemoveAction
  | RendererInstallAction
  | DaemonReloadAction
  | SelinuxImportAction
  | SelinuxRestoreconAction
  | FapolicydUpdateAction
  | FpmConfigtestAction
  | FpmReloadAction
  | WebConfigtestAction
  | WebReloadAction
  | UnitAction
  | RemoveTreeAction
  | ProvisionRecordAction;

const FS_OPS = new Set<Action['op']>(['mkdir', 'write', 'chown', 'chmod', 'append-only', 'remove', 'renderer-install']);
const TAIL_ORDER: readonly Action['op'][] = [
  'daemon-reload',
  'selinux-import',
  'selinux-restorecon',
  'fapolicyd-update',
  'fpm-configtest',
  'fpm-reload',
  'web-configtest',
  'web-reload',
  'enable',
  'start',
  'restart',
  'remove-tree',
  'provision-record',
];

export class PlanRefused extends Error {
  readonly reasons: readonly string[];
  constructor(instance: string, reasons: readonly string[]) {
    super(`plan refused for instance '${instance}':\n${reasons.map(reason => `  - ${reason}`).join('\n')}`);
    this.name = 'PlanRefused';
    this.reasons = reasons;
  }
}

/* ── the host-wide and site directories (spec S5, S11, §5.9) ──────────────────────── */

export interface ExtraDir {
  readonly path: string;
  readonly modeKey: ModeKey;
  /** Shared by several instances: created under a temp name and renamed; other metadata is refused, never fixed. */
  readonly hostWide: boolean;
}

/** The temporary sibling a host-wide directory is created as (`.<name>.dedalo-provision.tmp`). */
export function hostDirTemp(path: string): string {
  const parent = dirname(path);
  const name = path.slice(parent === '/' ? 1 : parent.length + 1);
  return join(parent, `.${name}.dedalo-provision.tmp`);
}

/** The directories the plan ensures beyond layout.directories: host-wide state and the v1 pool's own. */
export function extraDirectories(layout: AgentLayout): ExtraDir[] {
  const dirs: ExtraDir[] = [
    { path: layout.host.base, modeKey: 'hostBase', hostWide: true },
    { path: layout.host.locksDir, modeKey: 'hostLocks', hostWide: true },
  ];
  if (layout.web.server === 'nginx' && layout.web.nginxMap === 'conf_d') {
    dirs.push(
      { path: layout.host.nginxMapDir, modeKey: 'hostNginxMap', hostWide: true },
      { path: layout.host.nginxContribDir, modeKey: 'hostNginxContrib', hostWide: true },
      { path: layout.host.mapRendererDir, modeKey: 'hostMapRenderer', hostWide: true },
    );
  }
  if (layout.site !== null) {
    // The v1 pool's own directories: none on a v2-only instance.
    if (layout.site.v1 !== null) {
      const v1 = layout.site.v1.var;
      dirs.push(
        { path: dirname(v1.root), modeKey: 'hostBase', hostWide: false },
        { path: v1.root, modeKey: 'v1Var', hostWide: false },
        { path: v1.tmp, modeKey: 'v1VarWork', hostWide: false },
        { path: v1.log, modeKey: 'v1VarWork', hostWide: false },
      );
    }
    // The site's web server logs, outside the home (layout.ts webLogBase): its parent is the web server package's.
    if (isHomeLayout(layout)) dirs.push({ path: layout.site.webLogsDir, modeKey: 'webLogs', hostWide: false });
  }
  return dirs;
}

/** The two host lock files (spec S12): provision.lock root 0600, web.lock root:dedalo_pubhost 0640. */
export function hostLockFiles(layout: AgentLayout): { name: HostLockName; path: string; modeKey: ModeKey }[] {
  return [
    { name: 'provision', path: join(layout.host.locksDir, HOST_LOCK_FILES.provision), modeKey: 'hostProvisionLock' },
    { name: 'web', path: join(layout.host.locksDir, HOST_LOCK_FILES.web), modeKey: 'hostWebLock' },
  ];
}


function mapManaged(layout: AgentLayout): boolean {
  return layout.web.server === 'nginx' && layout.web.nginxMap === 'conf_d';
}


/** Where the instance's SELinux import temp and registration history live. */
export function selinuxPaths(layout: AgentLayout): { importFile: string; stateFile: string } {
  return { importFile: join(layout.instanceDir, SELINUX_IMPORT_NAME), stateFile: join(layout.instanceDir, SELINUX_STATE_NAME) };
}

/** The S9 rule facts: media eligibility (host), the shared-media consent (declaration), home by boolean (host). */
export function ruleFacts(layout: AgentLayout, selinux: SelinuxObserved): SelinuxRuleFacts {
  const state = parseSelinuxState(selinux.state);
  const recorded = new Set((state?.fcontext ?? []).map(entry => entry.spec));
  const home = selinuxRules(layout, { mediaLabelable: false, sharedMediaAccepted: false, homeTraverseByBoolean: false }).find(r => r.row === 'H');
  return {
    mediaLabelable: selinux.mediaLabelable,
    // Shared media is an operator path: labelled only with the declaration's consent
    // (`media.selinux_label`, written by init's `selinux.media_access=act`). Withdrawn, the rule
    // leaves the table and the recorded registration is removed like any other stale one.
    sharedMediaAccepted: layout.media.mode === 'shared' && layout.media.selinuxLabel,
    // The home is made traversable by httpd_enable_homedirs instead, unless our exact rule is already registered.
    homeTraverseByBoolean: selinux.booleans.httpd_enable_homedirs === true && !(home !== undefined && recorded.has(home.spec)),
  };
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
  const { agentUser, v2User, v2Group, engineGroup } = layout.identity;
  const v1User = layout.v1?.user ?? null;
  if (!host.groups.has('root')) refusals.push(`group 'root' does not exist — this is not a usable host`);
  if (!host.users.has('root')) refusals.push(`user 'root' does not exist — this is not a usable host`);
  if (!host.groups.has(PUBHOST_GROUP)) {
    // Spec S11: created only by init (D2); a hand-provisioned host runs the guide's step.
    refusals.push(
      `group '${PUBHOST_GROUP}' (host-wide: every agent unit's SupplementaryGroups=) does not exist — create it: ` +
        `groupadd --system ${PUBHOST_GROUP}`,
    );
  }
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
  // No v1 account on a v2-only instance (the declaration has no v1 block).
  if (v1User !== null && !host.users.has(v1User)) {
    // Decision A: v1 runs in its OWN dedicated pool under its own account, never the site's pool.
    refusals.push(
      `user '${v1User}' (v1.user) does not exist — create it: ${nologin} --user-group ${v1User}; ` +
        'it runs only the dedicated v1 pool',
    );
  }
  if (!host.users.has(v2User)) {
    refusals.push(`user '${v2User}' (v2.user) does not exist — create it: ${nologin} -g ${v2Group} ${v2User}`);
  }
  // The systemd profile (spec S10): below SYSTEMD_FLOOR the host cannot load the units' hardening.
  if (host.systemdVersion !== undefined && host.systemdVersion !== null && host.systemdVersion < SYSTEMD_FLOOR) {
    refusals.push(
      `systemd ${host.systemdVersion} is older than ${SYSTEMD_FLOOR}, the oldest systemd the units are rendered for — this host is not supported`,
    );
  }
  // 2. What the provisioner never creates either, and what root runs or grants: the pinned
  //    code. Real, root-owned, not group/world-writable — leaf and every ancestor.
  const rootUid = host.users.get('root') ?? 0;
  const judged = new Set<string>();
  const lstat = (path: string): PathFacts | undefined => host.paths.get(path);
  const PINNED: (readonly [string, string, 'file' | 'dir', boolean])[] = [
    ['web.configtest_bin', layout.web.configtestBin, 'file', true],
    ...(layout.v1 === null ? [] : [['php_bin', layout.v1.phpBin, 'file', true] as const]),
    ['bun_bin', layout.bunBin, 'file', true],
    ['agent_dir', layout.agentDir, 'dir', false],
    ['agent entry', layout.agentEntry, 'file', false],
  ];
  // The FPM master root runs as `<bin> -t` (the fpm validator): pinned code like the configtest binary.
  if (layout.site?.v1 != null) PINNED.push(['site.fpm.bin', layout.site.v1.fpm.bin, 'file', true]);
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
    refusals.push(...judgeAncestors(`${field} '${path}'`, path, host.trustRoot, lstat, rootUid, judged));
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
  const extra = extraDirectories(layout);
  const lockFiles = hostLockFiles(layout);
  const managedDirs = new Set([...layout.directories.map(dir => dir.path), ...extra.map(dir => dir.path)]);
  const identitiesPath = join(layout.host.mapRendererDir, IDENTITIES_FILE);
  // Rule 1's one exception (apply.ts pinnedParentOf): a managed DIRECTORY (not host-wide: those
  // rename into place) whose parent is a root directory closed to others may have an untrusted
  // grandparent — the directory doors pin the parent. Ubuntu's rsyslog makes /var/log root:syslog
  // 0775, the grandparent of the site's web log directory.
  // The pinned parent must be the directory OBSERVED (apply.ts withPinnedDir, review S3-1): its
  // owner, group, mode, device and inode ride the actions (pinOf), and it must sit on its parent's
  // device — a mount over the name is not the directory the plan judged.
  const pinnable = new Map<string, string>();
  for (const dir of extra) {
    if (dir.hostWide) continue;
    const chain = ancestorsBelow(dir.path, host.trustRoot);
    if (chain.length < 2) continue;
    const parentPath = chain[chain.length - 1] as string;
    const grandparentPath = chain[chain.length - 2] as string;
    const parent = host.paths.get(parentPath);
    if (parent?.type !== 'dir' || trustProblem(parent, rootUid) !== null) continue;
    const grandparent = host.paths.get(grandparentPath);
    if (grandparent?.type !== 'dir' || trustProblem(grandparent, rootUid) === null) continue; // rule 1 holds: nothing to pin
    if (parent.dev !== undefined && grandparent.dev !== undefined && parent.dev !== grandparent.dev) {
      refusals.push(
        `'${parentPath}' is a mount point (device ${parent.dev}, its parent '${grandparentPath}' on ${grandparent.dev}) under an untrusted ` +
          `directory — the pinned write into it (for '${dir.path}') needs it on its parent's device`,
      );
      continue;
    }
    pinnable.set(dir.path, grandparentPath);
  }
  const pinOf = (path: string): { pin: PinExpectation } | Record<string, never> => {
    if (!pinnable.has(path)) return {};
    const parent = dirname(path);
    const facts = host.paths.get(parent) as PathFacts;
    return {
      pin: {
        parent,
        uid: facts.uid,
        gid: facts.gid,
        mode: facts.mode & 0o7777,
        ...(facts.dev !== undefined ? { dev: facts.dev } : {}),
        ...(facts.ino !== undefined ? { ino: facts.ino } : {}),
      },
    };
  };
  for (const target of [
    ...layout.directories.map(dir => dir.path),
    ...extra.map(dir => dir.path),
    ...lockFiles.map(file => file.path),
    layout.state.marker,
    layout.serviceTokenPath,
    layout.state.auditFile,
    ...artifacts.map(art => art.path),
    ...(layout.trust === null ? [] : [layout.trust.file]),
  ]) {
    for (const dir of ancestorsBelow(target, host.trustRoot)) {
      if (managedDirs.has(dir) || judged.has(dir)) continue;
      // Not marked judged: another target under the same directory is judged by rule 1 as usual.
      if (target === layout.polkitPath && dir === dirname(target) && polkitDirTrusted(host.paths.get(dir), host.users.get(POLKIT_DAEMON_USER))) continue;
      if (pinnable.get(target) === dir && host.paths.get(dir)?.type === 'dir') continue; // judged per target: another may not pin it
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
  const webLock: HostLockRef = { dir: layout.host.locksDir, uid: rootUid, gid: gidOf(PUBHOST_GROUP) };

  const fsActions: Action[] = [];
  const metaActions: Action[] = [];
  const sealActions: Action[] = [];
  const created = new Set<string>();
  const effects = new Set<ArtifactEffect>();
  const services: ArtifactService[] = [];
  const validated = { web: [] as RestoreEntry[], fpm: [] as RestoreEntry[] };

  const parentReady = (path: string): boolean => {
    const parent = dirname(path);
    return created.has(parent) || host.paths.get(parent)?.type === 'dir';
  };
  const metadata = (into: Action[], path: string, facts: PathFacts, own: Ownership, mode: number): void => {
    if (facts.uid !== own.uid || facts.gid !== own.gid) into.push({ op: 'chown', path, ...own, ...pinOf(path) });
    if ((facts.mode & 0o7777) !== mode) into.push({ op: 'chmod', path, mode, ...pinOf(path) });
  };

  // 4. Directories, parents first; a drifted directory is fixed in place, BEFORE any child of it is
  //    created (apply's parent check needs it trusted). Host-wide ones are never fixed (refused).
  //    Missing ancestors of the host base and of the v1 pool's directory are created root 0755.
  const wanted = new Map<string, ExtraDir>();
  for (const dir of layout.directories) wanted.set(dir.path, { path: dir.path, modeKey: dir.modeKey, hostWide: false });
  for (const dir of extra) {
    if (!wanted.has(dir.path)) wanted.set(dir.path, dir);
  }
  for (const root of [layout.host.base, ...(layout.site?.v1 == null ? [] : [dirname(layout.site.v1.var.root)])]) {
    for (const dir of ancestorsBelow(root, host.trustRoot)) {
      if (!host.paths.has(dir) && !wanted.has(dir)) wanted.set(dir, { path: dir, modeKey: 'hostBase', hostWide: true });
    }
  }
  const ordered = [...wanted.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const dir of ordered) {
    const row = MODES[dir.modeKey];
    const own = ownership(ownerName(layout, row.owner), groupName(layout, row.group));
    const facts = host.paths.get(dir.path);
    if (dir.hostWide && host.paths.has(hostDirTemp(dir.path))) {
      refusals.push(`'${hostDirTemp(dir.path)}' is left over from an interrupted apply — remove it (rmdir) and re-run`);
      continue;
    }
    if (!facts) {
      if (!parentReady(dir.path)) {
        refusals.push(
          dir.modeKey === 'webLogs'
            ? `the web server's log directory '${dirname(dir.path)}' does not exist — is ${layout.web.unit} installed? The site logs into '${dir.path}' (paths.web_log_base)`
            : `parent directory '${dirname(dir.path)}' of '${dir.path}' does not exist`,
        );
        continue;
      }
      fsActions.push({ op: 'mkdir', path: dir.path, mode: row.mode, ...own, ...(dir.hostWide ? { via: hostDirTemp(dir.path) } : {}), ...pinOf(dir.path) });
      created.add(dir.path);
      continue;
    }
    if (facts.type !== 'dir') {
      refusals.push(`'${dir.path}' must be a directory (${dir.modeKey}) but is a ${facts.type}`);
      continue;
    }
    if (dir.hostWide) {
      if (facts.uid !== own.uid || facts.gid !== own.gid || (facts.mode & 0o7777) !== row.mode) {
        refusals.push(
          `'${dir.path}' (host-wide, shared by every instance on this host) is uid ${facts.uid} gid ${facts.gid} ` +
            `mode ${octal(facts.mode & 0o7777)}, not ${own.owner}:${own.group} ${octal(row.mode)} — a host-wide anomaly: ` +
            'find out who changed it before fixing it by hand (it is never chowned)',
        );
      }
      continue;
    }
    metadata(fsActions, dir.path, facts, own, row.mode);
  }

  // 4b. The host lock files, created empty once (spec S12) — never rewritten; other metadata refused.
  //     Created only while absent, by root under the host provision lock (agents never create one).
  for (const file of lockFiles) {
    const row = MODES[file.modeKey];
    const own = ownership(ownerName(layout, row.owner), groupName(layout, row.group));
    const facts = host.paths.get(file.path);
    if (!facts) {
      if (parentReady(file.path)) {
        fsActions.push({
          op: 'write',
          path: file.path,
          label: 'host_lock',
          content: { source: 'literal', body: '' },
          disposition: 'create',
          mode: row.mode,
          validate: null,
          ...own,
        });
      } else refusals.push(`parent directory '${dirname(file.path)}' of '${file.path}' does not exist`);
      continue;
    }
    if (facts.type !== 'file' || facts.uid !== own.uid || facts.gid !== own.gid || (facts.mode & 0o7777) !== row.mode) {
      refusals.push(
        `'${file.path}' (the host ${file.name} lock) is not a ${own.owner}:${own.group} ${octal(row.mode)} regular file — ` +
          'a host-wide anomaly: remove it when no provisioner or agent runs, and re-run',
      );
    }
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
      const validator = validatorFor(layout, art.validate);
      fsActions.push({
        op: 'write',
        path: art.path,
        label: art.kind,
        content: { source: 'literal', body: art.body },
        disposition,
        mode: art.mode,
        validate: art.validate,
        validator,
        ...(art.validate === 'web' || art.validate === 'fpm' ? { lock: webLock } : {}),
        ...own,
      });
      if (art.validate === 'web') validated.web.push({ path: art.path, disposition });
      if (art.validate === 'fpm') validated.fpm.push({ path: art.path, disposition });
      for (const effect of art.effects) effects.add(effect);
    };
    if (!facts) {
      if (parentReady(art.path)) write('create');
      else refusals.push(missingParent(layout, art));
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
    // A host-wide artifact is stamped `_host` (hash.ts), never with an instance (spec §2.2).
    const stampedFor = art.hostWide ? HOST_STAMP_INSTANCE : layout.instance;
    if (parsed.instance !== stampedFor || parsed.kind !== art.kind) {
      refusals.push(`'${art.path}' is stamped for '${parsed.instance} ${parsed.kind}', not '${stampedFor} ${art.kind}'`);
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
    // Written and validated by an earlier run that never reached its reload: reload it now.
    if (art.validate === 'web' || art.validate === 'fpm') {
      const pending: RestoreEntry | null = host.paths.has(`${art.path}${VALIDATED_BACKUP_SUFFIX}`)
        ? { path: art.path, disposition: 'rewrite' }
        : host.paths.has(`${art.path}${VALIDATED_CREATED_SUFFIX}`)
          ? { path: art.path, disposition: 'create' }
          : null;
      if (pending !== null) {
        validated[art.validate].push(pending);
        for (const effect of art.effects) effects.add(effect);
      }
    }
  }

  // 7b. nginx `conf_d` (spec §13.5): the root renderer's identities.json, and the contribution sweep.
  const removed: string[] = [];
  if (mapManaged(layout) && host.siblings !== undefined) {
    const owners = new Map<string, number>();
    const ownUid = host.users.get(agentUser);
    if (ownUid !== undefined) owners.set(layout.instance, ownUid);
    for (const sibling of host.siblings) {
      if (mapManaged(sibling.layout) && sibling.agentUid !== null) owners.set(sibling.layout.instance, sibling.agentUid);
    }
    const row = MODES.nginxMapInclude; // root:root 0644, a host-wide root file (spec §13.2)
    const own = ownership(ownerName(layout, row.owner), groupName(layout, row.group));
    const body = renderIdentities(Object.fromEntries(owners));
    const facts = host.paths.get(identitiesPath);
    const content: WriteContent = { source: 'literal', body };
    if (!facts || (facts.type === 'file' && host.contents.get(identitiesPath) !== body)) {
      if (!facts && !parentReady(identitiesPath)) {
        refusals.push(`parent directory '${dirname(identitiesPath)}' of '${identitiesPath}' does not exist`);
      } else {
        fsActions.push({
          op: 'write',
          path: identitiesPath,
          label: 'host_identities',
          content,
          disposition: facts ? 'rewrite' : 'create',
          mode: row.mode,
          validate: null,
          ...own,
        });
      }
    } else if (facts.type !== 'file') {
      refusals.push(`'${identitiesPath}' (the host map renderer's identities) is a ${facts.type}, not a file`);
    } else {
      metadata(metaActions, identitiesPath, facts, own, row.mode);
    }
    for (const entry of host.contributions ?? []) {
      if (!entry.name.endsWith('.json')) continue; // an agent's in-flight temp, not a contribution
      const name = entry.name.slice(0, -'.json'.length);
      const path = join(layout.host.nginxContribDir, entry.name);
      if (name === '_seed' && entry.type === 'file' && entry.uid === rootUid) continue; // init's seed (§5.10)
      const owner = owners.get(name);
      let why: string | null = null;
      if (entry.type !== 'file') why = `a ${entry.type}, not a contribution file`;
      else if (owner === undefined) why = `no nginx conf_d declaration names instance '${name}'`;
      else if (entry.uid !== owner) why = `owned by uid ${entry.uid}, not instance '${name}''s agent (uid ${owner})`;
      if (why !== null) {
        fsActions.push({ op: 'remove', path, why });
        removed.push(path);
      }
    }
  }

  // 7c. nginx `conf_d` (spec §13.5): root's renderer copy, never downgraded (rendererInstallDecision).
  if (mapManaged(layout) && host.renderer !== undefined) {
    const own = host.renderer.ownDigest;
    if (own === null) {
      refusals.push(
        `the host map renderer's files could not be read whole from agent_dir '${layout.agentDir}' ` +
          `(${MAP_RENDERER_FILES.join(', ')}) — reinstall the agent checkout`,
      );
    } else {
      const installed = parseRendererVersion(host.renderer.installed);
      const decision = rendererInstallDecision(installed, { grammar: MAP_GRAMMAR, digest: own });
      if (decision.install) {
        const subdirs = [...new Set(MAP_RENDERER_FILES.flatMap(file => subdirsOf(file)))]
          .sort()
          .filter(sub => !host.paths.has(join(layout.host.mapRendererDir, sub)));
        fsActions.push({
          op: 'renderer-install',
          dir: layout.host.mapRendererDir,
          sourceDir: layout.agentDir,
          files: [...MAP_RENDERER_FILES],
          subdirs,
          bun: layout.bunBin,
          versionBody: renderRendererVersion({ grammar: MAP_GRAMMAR, digest: own, from: layout.instance }),
          why: decision.why,
          uid: rootUid,
          gid: host.groups.get('root') ?? 0,
        });
      }
    }
  }

  // 7f. fapolicyd (owner decision 2026-10-09): the instance's trust file, written on drift with the
  //     bytes the trust oneshot renders (fapolicyd_trust.ts), never over a file that is not ours.
  let trustUpdate: FapolicydUpdateAction | null = null;
  // Whether this run's trust update lists the polkit rule (see 9).
  let polkitTrusted = false;
  if (layout.trust !== null) {
    const path = layout.trust.file;
    const observed = host.trust;
    if (observed === undefined) {
      refusals.push(`fapolicyd is installed but the trust set of '${layout.instance}' was not observed — nothing can be judged`);
    } else if (observed.derivation.kind === 'refused') {
      refusals.push(...observed.derivation.reasons.map(reason => `fapolicyd trust: ${reason} — nothing is trusted until it is fixed`));
    } else {
      const body = renderTrustFile(layout.instance, observed.derivation);
      const own = ownership('root', 'root');
      const facts = host.paths.get(path);
      const text = host.contents.get(path) ?? null;
      const write = (disposition: 'create' | 'rewrite'): void => {
        polkitTrusted = observed.derivation.kind === 'ok' && observed.derivation.entries.some(entry => entry.path === layout.polkitPath);
        fsActions.push({ op: 'write', path, label: 'fapolicyd_trust', content: { source: 'literal', body }, disposition, mode: TRUST_FILE_MODE, validate: null, ...own });
        if (observed.daemonActive) trustUpdate = { op: 'fapolicyd-update', path, pending: pendingEntry(disposition === 'create' ? null : text, body) };
      };
      if (!facts) {
        if (parentReady(path)) write('create');
        else refusals.push(`fapolicyd's trust directory '${dirname(path)}' does not exist — is fapolicyd installed whole?`);
      } else if (facts.type !== 'file') {
        refusals.push(`'${path}' (the fapolicyd trust of '${layout.instance}') is a ${facts.type}, not a file`);
      } else {
        const problem = trustFileProblem(layout.instance, path, text);
        if (problem !== null) refusals.push(problem);
        else if (text !== body) write('rewrite');
        else metadata(metaActions, path, facts, own, TRUST_FILE_MODE);
      }
    }
  }

  // 7e. What an earlier apply provisioned and the declaration no longer needs (retire.ts).
  const retirement = planRetirement(layout, host, artifacts, { rootUid, rootGid: host.groups.get('root') ?? 0, webLock });
  refusals.push(...retirement.refusals);
  fsActions.push(...retirement.fs);
  const ownFpmUnit = layout.site?.v1?.fpm.unit ?? null;
  for (const pending of retirement.fpm) {
    if (pending.unit !== ownFpmUnit) continue;
    validated.fpm.push(...pending.restore);
    effects.add('reload_fpm');
  }

  // 7d. A reload needs a running server: reloading a stopped unit fails after the files moved.
  for (const [effect, unit, what] of [
    ['reload_web', layout.web.unit, 'the web server'],
    ['reload_fpm', layout.site?.v1?.fpm.unit ?? '', 'PHP-FPM'],
  ] as const) {
    if (effects.has(effect) && host.units.get(unit)?.active === false) {
      refusals.push(`${what} unit '${unit}' is not running — its reload would fail: systemctl enable --now ${unit}.service, then re-run`);
    }
  }

  // 8. SELinux (spec S9): the instance's rules and port label, then the relabel.
  const selinuxTail: Action[] = [];
  if (host.selinux !== undefined) {
    selinuxTail.push(...selinuxActions(layout, host, host.selinux, created, refusals));
  }

  if (refusals.length > 0) throw new PlanRefused(layout.instance, refusals);

  // 9. The tail.
  const tail: Action[] = [...selinuxTail, ...(trustUpdate === null ? [] : [trustUpdate])];
  // fapolicyd: polkitd (re)loads a rules file the moment it is written — here BEFORE the trust update
  // lists it, so with allow_filesystem_mark = 1 its load was denied and the agent's grant missing
  // until polkit happened to reload again (measured, RHEL 10.2 two-machine drill, 2026-10-09: every
  // reload the agent asked for answered "Interactive authentication required"). polkit.service has no
  // reload: it is restarted after every trust update that lists the rule (it keeps no state but its
  // rules), so a load that failed earlier — the rule written before its trust, or by a provisioner that
  // did not trust it — heals on the next apply that touches the trust (a code or Bun upgrade, a new rule).
  if (trustUpdate !== null && polkitTrusted) {
    tail.push({ op: 'restart', unit: POLKIT_UNIT });
  }
  if (effects.has('daemon_reload')) tail.push({ op: 'daemon-reload' });
  if (effects.has('reload_fpm') && layout.site?.v1 != null) {
    const { bin, unit } = layout.site.v1.fpm;
    tail.push({ op: 'fpm-configtest', bin, lock: webLock });
    tail.push({ op: 'fpm-reload', unit, bin, restore: [...validated.fpm] });
  }
  // A retired pool's FPM install that is not this declaration's own (a v2-only one has none).
  for (const pending of retirement.fpm) {
    if (pending.unit === ownFpmUnit) continue;
    tail.push({ op: 'fpm-configtest', bin: pending.bin, lock: webLock });
    tail.push({ op: 'fpm-reload', unit: pending.unit, bin: pending.bin, restore: [...pending.restore] });
  }
  if (effects.has('reload_web')) {
    tail.push({ op: 'web-configtest', server: layout.web.server, bin: layout.web.configtestBin, lock: webLock });
    tail.push({
      op: 'web-reload',
      unit: layout.web.unit,
      restore: [...validated.web],
      server: layout.web.server,
      bin: layout.web.configtestBin,
    });
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
  // The root map renderer drops swept contributions from the live map (it needs its unit: P8's artifact).
  if (removed.length > 0 && artifacts.some(art => art.kind === 'host_map_unit') && !started.has(HOST_MAP_UNIT)) {
    tail.push({ op: 'start', unit: HOST_MAP_UNIT });
    started.add(HOST_MAP_UNIT);
  }
  for (const [effect, unit] of [
    ['restart_agent', layout.agentUnitName],
    ['restart_v2', layout.v2.unit],
  ] as const) {
    if (effects.has(effect) && host.units.get(unit)?.active === true && !started.has(unit)) {
      tail.push({ op: 'restart', unit });
    }
  }
  // LAST: the retired trees (the agent restarted on its new env file above), then the record.
  tail.push(...retirement.tail);
  // A reload ranks with its configtest, and the sort is stable: each pair stays a pair.
  const rank = (op: Action['op']): number =>
    TAIL_ORDER.indexOf(op === 'fpm-reload' ? 'fpm-configtest' : op === 'web-reload' ? 'web-configtest' : op);
  tail.sort((a, b) => rank(a.op) - rank(b.op));

  const actions = [...fsActions, ...metaActions, ...sealActions, ...tail];
  assertPlanIsCoherent(actions, host);
  return actions;
}

/* ── retired artifacts (retire.ts) ───────────────────────────────────────────────── */

interface RetirementContext {
  readonly rootUid: number;
  readonly rootGid: number;
  readonly webLock: HostLockRef;
}
/** A retired pool's FPM install: reloaded after the removal (only while it runs). */
interface RetiredFpm {
  readonly unit: string;
  readonly bin: string;
  readonly restore: RestoreEntry[];
}
interface Retirement {
  readonly refusals: string[];
  readonly fs: Action[];
  readonly fpm: RetiredFpm[];
  readonly tail: Action[];
}

/** The record as observeHost read it: undefined = absent, null = present but unreadable. */
function recordText(host: HostState, path: string): string | null | undefined {
  if (!host.paths.has(path)) return undefined;
  return host.contents.get(path) ?? null;
}

/**
 * What the record names and the render no longer produces, removed under retire.ts's guards; and
 * the record rewritten LAST when it moved. An absent record and an empty one are the same: an
 * instance that provisions nothing retirable never gets the file.
 */
export function planRetirement(layout: AgentLayout, host: HostState, artifacts: readonly Artifact[], ctx: RetirementContext): Retirement {
  const out: Retirement = { refusals: [], fs: [], fpm: [], tail: [] };
  const path = recordPath(layout);
  const text = recordText(host, path);
  const previous = parseRecord(text);
  if (previous === null) {
    out.refusals.push(`'${path}' (the provision record) is not one provision apply wrote — it lists what may be retired: restore it, or move it aside and re-run (nothing earlier is then retired)`);
    return out;
  }
  const current = currentRecord(layout, artifacts);
  const retired = retiredOf(previous, current);
  for (const entry of retired.artifacts) retireFile(layout, host, entry, ctx, out);
  for (const tree of retired.trees) retireTree(layout, host, tree, ctx, out);
  const body = encodeRecord(current);
  const empty = current.artifacts.length === 0 && current.trees.length === 0;
  if (text !== body && !(text === undefined && empty)) {
    out.tail.push({ op: 'provision-record', path, body, uid: ctx.rootUid, gid: ctx.rootGid });
  }
  return out;
}

function addRetiredFpm(out: Retirement, fpm: { readonly unit: string; readonly bin: string }, entry: RestoreEntry): void {
  const found = out.fpm.find(pending => pending.unit === fpm.unit);
  if (found) found.restore.push(entry);
  else out.fpm.push({ unit: fpm.unit, bin: fpm.bin, restore: [entry] });
}

/** The FPM master root runs as `<bin> -t`: pinned code, judged like site.fpm.bin. */
function retiredFpmBinProblem(host: HostState, bin: string, rootUid: number): string | null {
  const facts = host.paths.get(bin);
  const label = `the retired pool's FPM binary '${bin}'`;
  if (facts?.type !== 'file' || (facts.mode & 0o111) === 0) return `${label} is not an executable file on this host — its pool cannot be retired with a configtest`;
  const problem = trustProblem(facts, rootUid);
  if (problem) return `${label} is ${problem} — make it root-owned and not group- or world-writable`;
  const above = judgeAncestors(label, bin, host.trustRoot, p => host.paths.get(p), rootUid, new Set());
  return above.length > 0 ? above.join('; ') : null;
}

function retireFile(layout: AgentLayout, host: HostState, entry: RecordedArtifact, ctx: RetirementContext, out: Retirement): void {
  const fpm = RETIRABLE_KINDS[entry.kind] === 'fpm' ? entry.fpm : undefined;
  const backup = `${entry.path}${VALIDATED_BACKUP_SUFFIX}`;
  const facts = host.paths.get(entry.path);
  const backupFacts = host.paths.get(backup);
  if (facts === undefined) {
    if (fpm !== undefined && backupFacts !== undefined) retirePending(layout, host, entry, fpm, backupFacts, out);
    return;
  }
  const problem = retiredFileProblem(layout.instance, entry, facts, host.contents.get(entry.path));
  if (problem !== null) {
    out.refusals.push(problem);
    return;
  }
  const why = `retired: the declaration no longer provisions this ${entry.kind}`;
  if (fpm === undefined) {
    out.fs.push({ op: 'remove', path: entry.path, why });
    return;
  }
  const binProblem = backupFacts !== undefined ? `'${backup}' is left over beside the retired pool — remove it by hand and re-run` : retiredFpmBinProblem(host, fpm.bin, ctx.rootUid);
  if (binProblem !== null) {
    out.refusals.push(binProblem);
    return;
  }
  const active = host.units.get(fpm.unit)?.active === true;
  out.fs.push({ op: 'remove', path: entry.path, why, validator: { kind: 'fpm', bin: fpm.bin, unit: fpm.unit }, lock: ctx.webLock, keepRollback: active });
  if (active) addRetiredFpm(out, fpm, { path: entry.path, disposition: 'retire' });
}

/** An earlier run retired the pool and never reached its reload: reload now (running) or drop the rollback. */
function retirePending(
  layout: AgentLayout,
  host: HostState,
  entry: RecordedArtifact,
  fpm: { readonly unit: string; readonly bin: string },
  backupFacts: PathFacts,
  out: Retirement,
): void {
  const backup = `${entry.path}${VALIDATED_BACKUP_SUFFIX}`;
  const problem = retiredFileProblem(layout.instance, { ...entry, path: backup }, backupFacts, host.contents.get(backup));
  if (problem !== null) out.refusals.push(problem);
  else if (host.units.get(fpm.unit)?.active === true) addRetiredFpm(out, fpm, { path: entry.path, disposition: 'retire' });
  else out.fs.push({ op: 'remove', path: backup, why: `the rollback of a retired ${entry.kind} (its FPM install is not running)` });
}

function retireTree(layout: AgentLayout, host: HostState, tree: RecordedTree, ctx: RetirementContext, out: Retirement): void {
  const temp = `${tree.path}${RETIRED_SUFFIX}`;
  const parent = host.paths.get(dirname(tree.path));
  const parentTrusted = parent?.type === 'dir' && trustProblem(parent, ctx.rootUid) === null;
  const tempFacts = host.paths.get(temp);
  const facts = host.paths.get(tree.path);
  const removal = { op: 'remove-tree' as const, path: tree.path, temp, uid: ctx.rootUid, gid: ctx.rootGid };
  if (tempFacts !== undefined) {
    if (facts !== undefined) out.refusals.push(`'${temp}' is left over beside the retired '${tree.path}' — inspect both and remove the temp by hand`);
    else if (tempFacts.type !== 'dir' || !parentTrusted) out.refusals.push(`'${temp}' (an interrupted tree removal) is not a directory under a trusted parent — remove it by hand`);
    else out.tail.push({ ...removal, resume: true });
    return;
  }
  if (facts === undefined) return;
  const owner =
    tree.kind === 'v1_api' ? { uid: host.users.get(layout.identity.agentUser) ?? -1, gid: ctx.rootGid } : { uid: ctx.rootUid, gid: ctx.rootGid };
  const problem = retiredTreeProblem(layout, tree, facts, owner, parentTrusted);
  if (problem !== null) out.refusals.push(problem);
  else out.tail.push({ ...removal, resume: false });
}

/** `src/rules/x.ts` → ['src', 'src/rules']: the directories a relative file needs, parents first. */
function subdirsOf(file: string): string[] {
  const parts = file.split('/').slice(0, -1);
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
}

/** What a write's validator runs, resolved from the layout (spec §5.9 validator plumbing). */
function validatorFor(layout: AgentLayout, validate: ArtifactValidator | null): WriteValidator | null {
  switch (validate) {
    case null:
      return null;
    case 'sudoers':
      return { kind: 'sudoers' };
    case 'web':
      return { kind: 'web', server: layout.web.server, bin: layout.web.configtestBin, unit: layout.web.unit };
    case 'fpm': {
      if (layout.site?.v1 == null) throw new Error('plan: an fpm validator without a v1 site');
      return { kind: 'fpm', bin: layout.site.v1.fpm.bin, unit: layout.site.v1.fpm.unit };
    }
    default: {
      const unreachable: never = validate;
      throw new Error(`plan: unknown validator ${String(unreachable)}`);
    }
  }
}

/** A missing parent, said in the operator's terms where the parent is a package's directory. */
function missingParent(layout: AgentLayout, art: Artifact): string {
  const parent = dirname(art.path);
  if (art.kind === 'fpm_pool' && layout.site?.v1 != null) {
    const { flavor, version } = layout.site.v1.fpm;
    return `the PHP-FPM pool directory '${parent}' does not exist — is PHP-FPM ${version} (${flavor}) installed? (site.fpm)`;
  }
  if (art.kind === 'nginx_map_include') return `nginx's conf.d '${parent}' does not exist — is nginx installed? (paths.nginx_conf_d)`;
  if (art.kind === 'logrotate') return `'${parent}' does not exist — is logrotate installed? The site's web logs (${layout.site?.webLogsDir ?? 'the site log directory'}) are rotated from there (paths.logrotate_dir)`;
  if (art.kind === 'logrotate_v1') return `'${parent}' does not exist — is logrotate installed? The v1 API's own log (${layout.site?.v1?.var.log ?? 'the v1 log directory'}) is rotated from there (paths.logrotate_dir)`;
  return `parent directory '${parent}' of '${art.path}' does not exist`;
}

/**
 * The SELinux ops (spec S9, §5.9): desired rules vs the local registry. A local rule on one of our
 * specs with another type, or the v2 port typed otherwise by the policy, is refused; missing ones
 * are imported (one transaction) with the `-d` lines of rules this instance registered before and
 * no longer needs (a relocation, a port change) — unless a sibling still needs them; then the
 * registration history is rewritten and the targets relabelled.
 */
function selinuxActions(
  layout: AgentLayout,
  host: HostState,
  selinux: SelinuxObserved,
  created: ReadonlySet<string>,
  refusals: string[],
): Action[] {
  const scope = labelScope(selinux.mode, selinux.storePresent);
  if (!scope.register) return [];
  const rfacts = ruleFacts(layout, selinux);
  const rules = selinuxRules(layout, rfacts);
  const port = selinuxPort(layout);
  const local = new Map<string, string>();
  for (const entry of selinux.localFcontext) local.set(entry.spec, entry.type);
  const add = [];
  for (const r of rules) {
    const theirs = local.get(r.spec);
    if (theirs === undefined) add.push(fcontextEntry(r));
    else if (theirs !== r.type) {
      refusals.push(
        `the local SELinux rule '${r.spec}' types it '${theirs}', not '${r.type}' (S9 row ${r.row}) — an operator rule ` +
          'on one of our specs is never overridden: semanage fcontext -l -C, then remove or correct it',
      );
    }
  }
  let portNeeded = false;
  const portType = selinux.portTypes.get(port.port);
  if (portType === undefined) portNeeded = true;
  else if (portType !== port.type) {
    refusals.push(
      `v2.port ${port.port} is typed '${portType}' by the SELinux policy, not ${port.type} — choose another v2.port ` +
        '(provision init proposes a free, untyped one): semanage port -l -C',
    );
  }
  // What this instance registered before and no longer needs (spec S9 lifecycle).
  const previous = parseSelinuxState(selinux.state);
  const siblingSpecs = new Set<string>();
  const siblingPorts = new Set<number>();
  for (const sibling of host.siblings ?? []) {
    for (const r of selinuxRules(sibling.layout, rfacts)) siblingSpecs.add(r.spec);
    siblingPorts.add(sibling.layout.v2.port);
  }
  const desiredSpecs = new Set(rules.map(r => r.spec));
  const del = [];
  for (const entry of previous?.fcontext ?? []) {
    if (desiredSpecs.has(entry.spec) || siblingSpecs.has(entry.spec)) continue;
    if (local.get(entry.spec) !== entry.type) continue; // gone already, or now the operator's
    del.push(fcontextEntry(entry));
  }
  const localPorts = new Set(selinux.localPorts.filter(p => p.proto === 'tcp' && p.type === port.type).map(p => p.port));
  for (const old of previous?.ports ?? []) {
    if (old === port.port || siblingPorts.has(old) || !localPorts.has(old)) continue;
    del.push(portEntry(old));
  }
  if (portNeeded) add.push(portEntry(port.port));

  const actions: Action[] = [];
  const { importFile, stateFile } = selinuxPaths(layout);
  const registeredPorts = [port.port];
  const stateBody = encodeSelinuxState({
    v: 1,
    fcontext: rules.map(r => ({ spec: r.spec, fileType: r.fileType, type: r.type })),
    ports: registeredPorts,
  });
  const lines = refusals.length === 0 ? importLines(add, del) : [];
  if (lines.length > 0 || selinux.state !== stateBody) {
    actions.push({ op: 'selinux-import', file: importFile, lines, statePath: stateFile, stateBody, uid: host.users.get('root') ?? 0, gid: host.groups.get('root') ?? 0 });
  }
  if (!scope.relabel) return actions;
  // Relabel what exists (or this run creates); the H directory and the exact rows never recursively.
  const targets = restoreconTargets(layout, rfacts).filter(t => created.has(t.path) || host.paths.has(t.path));
  const pending = selinux.pending.length > 0;
  const fresh = targets.some(t => created.has(t.path));
  if (targets.length > 0 && (lines.length > 0 || pending || fresh)) actions.push({ op: 'selinux-restorecon', targets });
  return actions;
}

/* ── facts and drift for check (spec §5.9) ────────────────────────────────────────── */

export interface PlanReport {
  /** Informational lines: printed by check and apply, never drift. */
  readonly facts: readonly string[];
  /** What check reports as drift although no action can fix it (the operator must). */
  readonly drift: readonly string[];
}

/** The scratch overrides of `paths` (spec §2.2): production never sets them; check prints any that is set. */
function overrides(layout: AgentLayout): string[] {
  const set: string[] = [];
  const pairs: [string, string, string][] = [
    ['paths.host_base', layout.host.base, DEFAULT_PATHS.hostBase],
    ['paths.nginx_conf_d', layout.host.nginxConfD, DEFAULT_PATHS.nginxConfD],
  ];
  pairs.push(['paths.logrotate_dir', dirname(layout.logrotatePath), DEFAULT_PATHS.logrotateDir]);
  if (layout.site !== null) {
    if (layout.site.v1 !== null) {
      pairs.push(['paths.v1_var_base', dirname(dirname(layout.site.v1.var.root)), DEFAULT_PATHS.v1VarBase]);
    }
    pairs.push(['paths.web_log_base', dirname(layout.site.webLogsDir), webLogBase(layout.web.server, layout.site.family)]);
  }
  for (const [field, value, normal] of pairs) if (value !== normal) set.push(`${field} = ${value}`);
  return set;
}

export function planReport(layout: AgentLayout, host: HostState): PlanReport {
  const facts: string[] = [];
  const drift: string[] = [];
  facts.push(`ProtectHome=${layout.protectHome} on the agent unit (host-wide: ${layout.protectHome === 'read-only' ? 'a declaration on this host lives under a home tree' : 'no declaration lives under a home tree'})`);
  for (const line of overrides(layout)) facts.push(`scratch override set: ${line} (production declarations never set it)`);
  if (mapManaged(layout) && host.hostMap !== undefined) {
    const result = parseHostMapResult(host.hostMap.result);
    facts.push(
      `host map: ${host.hostMap.live ? 'the live map exists' : 'no live map yet (nothing pushed: the variables are undefined)'}` +
        (result === null ? '; the renderer has not run' : `; last render ${result.outcome}, ${result.contributions.length} contribution(s), ${result.invalid} invalid`),
    );
    const installed = parseRendererVersion(host.renderer?.installed ?? null);
    if (installed !== null) facts.push(`host map renderer: grammar ${installed.grammar}, digest ${installed.digest.slice(0, 12)}, installed by '${installed.from}'`);
    for (const refusal of result?.refused ?? []) {
      const line = `the host map renderer refused '${refusal.instance}': ${refusal.reason}`;
      if (refusal.reason === 'map_contribution_newer') drift.push(`${line} — run 'provision apply' for that newer instance (it upgrades the renderer)`);
      else facts.push(line);
    }
  }
  if (mapManaged(layout) && host.renderer === undefined) {
    facts.push('the host map renderer copy was not checked: its install state was not observed');
  }
  if (mapManaged(layout) && host.siblings === undefined) {
    facts.push('identities.json and the contribution sweep were not planned: the sibling declarations were not observed');
  }
  // fapolicyd: a release the trust set left out is not trusted — every one is named (it never runs).
  if (layout.trust !== null && host.trust?.derivation.kind === 'ok') {
    const derived = host.trust.derivation;
    facts.push(`fapolicyd: ${derived.entries.length} file(s) trusted in ${layout.trust.file} (${derived.releases.join(', ') || 'no release yet'})`);
    for (const reason of derived.refused) drift.push(`fapolicyd trust: ${reason}`);
  }
  if (layout.site !== null) {
    if (host.webReference === false) {
      drift.push(`the web server's configuration no longer includes ${join(layout.instanceDir, `web.${layout.web.server}.conf`)} — the vhost reference was removed (provision init restores it)`);
    } else if (host.webReference === null || host.webReference === undefined) {
      facts.push('the vhost reference to the web include was not checked (the web server dump was not available)');
    }
  }
  const selinux = host.selinux;
  if (selinux !== undefined) {
    const scope = labelScope(selinux.mode, selinux.storePresent);
    if (selinux.mode === 'disabled' && scope.register) facts.push('SELinux disabled: rules registered for a later enable; nothing relabelled');
    else if (!scope.register) facts.push(`SELinux ${selinux.mode}: no labels managed`);
    else {
      facts.push(`SELinux ${selinux.mode}: labels managed (S9)`);
      if (selinux.pending.length > 0) {
        drift.push(`${selinux.pending.length} path(s) carry another label than their rule: ${selinux.pending.slice(0, 3).map(p => `${p.path} (${p.from} → ${p.to})`).join(', ')}`);
      }
      const relay = selinux.booleans.httpd_can_network_relay === true || selinux.booleans.httpd_graceful_shutdown === true;
      const connect = selinux.booleans.httpd_can_network_connect === true;
      facts.push(
        `SELinux booleans: httpd_graceful_shutdown=${String(selinux.booleans.httpd_graceful_shutdown ?? false)} ` +
          `httpd_can_network_relay=${String(selinux.booleans.httpd_can_network_relay ?? false)} ` +
          `httpd_can_network_connect=${String(connect)}`,
      );
      if (!relay && !connect) drift.push('httpd cannot connect to the v2 port: setsebool -P httpd_can_network_relay on (provision init asks)');
      if (isHomeLayout(layout)) {
        const rfacts = ruleFacts(layout, selinux);
        if (rfacts.homeTraverseByBoolean) facts.push('the site home is traversable through httpd_enable_homedirs (no exact rule)');
      }
      if (layout.media.root !== null && layout.media.mode === 'shared' && !ruleFacts(layout, selinux).sharedMediaAccepted) {
        facts.push(`the shared media root ${layout.media.root} is not labelled by the provisioner: the declaration has no media.selinux_label (provision init's selinux.media_access=act writes it)`);
      }
    }
  }
  return { facts, drift };
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
        if (action.op === 'write' && action.label === 'host_lock') {
          if (action.disposition !== 'create' || action.content.source !== 'literal' || action.content.body !== '') {
            throw new Error('plan: a host lock file is only ever created empty, never rewritten');
          }
        }
        if (action.op === 'write' && (action.validate === 'web' || action.validate === 'fpm') && action.lock === undefined) {
          throw new Error(`plan: '${describe(action)}' is validated by its server's configtest outside the host web lock`);
        }
        break;
      }
      case 'renderer-install':
        if (!madeDirs.has(action.dir) && host.paths.get(action.dir)?.type !== 'dir') {
          throw new Error(`plan: '${describe(action)}' has no directory to install into`);
        }
        break;
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
      case 'fpm-reload': {
        const previous = actions[index - 1];
        if (!previous || previous.op !== 'fpm-configtest') {
          throw new Error('plan: an fpm-reload must immediately follow an fpm-configtest');
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
  // SELinux (spec §5.9): the relabel follows the import, and both precede every configtest.
  const importAt = actions.findIndex(action => action.op === 'selinux-import');
  const relabelAt = actions.findIndex(action => action.op === 'selinux-restorecon');
  const firstConfigtest = actions.findIndex(action => action.op === 'web-configtest' || action.op === 'fpm-configtest');
  if (importAt !== -1 && relabelAt !== -1 && relabelAt < importAt) throw new Error('plan: restorecon precedes the SELinux import');
  if (firstConfigtest !== -1) {
    for (const at of [importAt, relabelAt]) {
      if (at !== -1 && at > firstConfigtest) throw new Error('plan: an SELinux op comes after a configtest');
    }
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
      return `mkdir ${action.path} (${action.owner}:${action.group} ${octal(action.mode)})${action.via ? ' via a temporary name' : ''}`;
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
    case 'remove':
      return `remove ${action.path} (${action.why})${action.validator ? ` — then ${action.validator.bin} -t; restored if it fails` : ''}`;
    case 'remove-tree':
      return `remove ${action.resume ? `the rest of ${action.temp}` : `${action.path} (retired; via ${action.temp}, root 0700, rm -rf --one-file-system)`}`;
    case 'provision-record':
      return `record what is provisioned in ${action.path}`;
    case 'renderer-install':
      return `install the host map renderer into ${action.dir} (${action.why}: ${action.files.length} files + bun from ${action.sourceDir})`;
    case 'daemon-reload':
      return 'systemctl daemon-reload';
    case 'selinux-import':
      return action.lines.length > 0
        ? `semanage import (${action.lines.length} rule line(s)): ${action.lines.join(' ; ')}`
        : `record the registered SELinux rules in ${action.statePath}`;
    case 'selinux-restorecon':
      return `restorecon -v ${action.targets.map(t => `${t.recursive ? '-R ' : ''}${t.path}`).join(' ')}`;
    case 'fapolicyd-update':
      return `fapolicyd-cli --update (${action.path}), then wait until the daemon lists ${action.pending === null ? 'it' : `'${action.pending.split(' ')[0]}'`}`;
    case 'fpm-configtest':
      return `${action.bin} -t (php-fpm configtest)`;
    case 'fpm-reload':
      return `systemctl reload ${action.unit}`;
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
