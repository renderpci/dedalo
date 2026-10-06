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
 * ZERO-DEPENDENCY.
 */
import { dirname, join } from 'node:path';
import { hasDrifted, parseStamp } from './hash';
import type { AgentLayout, WebServer } from './layout';
import { MODES, SERVICE_TOKEN_BYTES, WEB_CONFIGTEST_CANDIDATES, groupName, markerContent, ownerName } from './layout';
import { engineFragmentRenderer } from './render/engine_fragment';
import { envRenderer } from './render/env';
import { polkitRenderer } from './render/polkit';
import { sudoersRenderer } from './render/sudoers';
import { agentUnitRenderer } from './render/unit_agent';
import { v2ScratchUnitRenderer, v2UnitRenderer } from './render/unit_v2';
import type {
  Artifact,
  ArtifactEffect,
  ArtifactKind,
  ArtifactService,
  ArtifactValidator,
  RenderFacts,
  Renderer,
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
}

/** The suite's scratch tree inside a package checkout (tests/fixtures/instance.ts SCRATCH_DIR_NAME). */
export const TEST_SCRATCH_DIR = '.test-tmp';

/** Where observeHost looks for a test scratch tree in the agent's checkout. */
export function agentScratchPath(layout: AgentLayout): string {
  return join(layout.agentDir, TEST_SCRATCH_DIR);
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

  // 1. What the provisioner never creates: accounts.
  const users = ['root', layout.identity.agentUser, layout.identity.v1User, layout.identity.v2User];
  const groups = ['root', layout.identity.v2Group];
  if (layout.identity.engineGroup !== null) groups.push(layout.identity.engineGroup);
  for (const name of users) {
    if (!host.users.has(name)) {
      refusals.push(
        `user '${name}' does not exist — create it first ` +
          `(useradd --system --no-create-home --shell /usr/sbin/nologin ${name})`,
      );
    }
  }
  for (const name of groups) {
    if (!host.groups.has(name)) refusals.push(`group '${name}' does not exist — create it first (groupadd --system ${name})`);
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
