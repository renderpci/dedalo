/**
 * RETIRED ARTIFACTS — what `provision apply` removes when a declaration stops needing something
 * it provisioned (the first case: a v1+v2 instance re-declared v2-only, which leaves the v1 pool,
 * its log rotation and the two v1 trees behind).
 *
 * THE RECORD. A plan cannot learn from the NEW declaration where the OLD one put things (a
 * v2-only declaration has no `site.fpm`, so it cannot even name the pool file). So apply keeps a
 * record of what it provisioned that may later be retired: `<config_base>/<instance>/provisioned.json`
 * (root:root 0644, MODES.provisionRecord), written LAST in the tail of every apply that changes it
 * (`provision-record`), so a run that fails earlier leaves the previous record and the next run
 * retires again. Retired = recorded − rendered now. The record names only the kinds in
 * RETIRABLE_KINDS and the trees in TREE_KINDS: a kind joins the table with its removal rule,
 * never by default (a web include, for one, is `Include`d by the operator's vhost: removing it
 * would break the server's configuration).
 *
 * THE GUARD — never a file that is not ours. A retired FILE is removed only when it still carries
 * OUR stamp for THIS instance and THAT kind, and its body matches its own stamp (no hand edit);
 * anything else is a refusal that names it. A retired TREE is removed only when its root is a real
 * directory with exactly the owner, group and mode provision apply gave it, under a trusted parent,
 * at the place this instance's layout puts it.
 *
 * THE REMOVAL. A file: renamed to the provisioner temp name and removed (the existing `remove`
 * door); an FPM pool under the host web lock, through `<pool>.dedalo-provision.bak` and the FPM
 * configtest (a host whose ONLY pool was ours must not be left with a master that refuses to
 * start), restored when the configtest or the reload fails. A tree: in the tail, after the agent
 * restarted on the new env file (it no longer serves v1): renamed to `<path>.dedalo-provision.retired`
 * inside its trusted parent, made root:root 0700 (no other account can reach anything in it by path
 * any more), then `rm -rf --one-file-system` (GNU rm walks descriptor-relative and never follows a
 * link). A leftover `.retired` from an interrupted run is finished by the next one.
 *
 * ZERO-DEPENDENCY: plan.ts imports it (types only from plan.ts: no runtime cycle).
 */
import { basename, dirname, isAbsolute, join, normalize } from 'node:path';
import { RETIRED_SUFFIX } from './exec_contract';
import { hasDrifted, parseStamp } from './hash';
import type { AgentLayout } from './layout';
import { MODES } from './layout';
import { PUBLICATION_API_DIR } from '../instance/roots';
import { TRUST_KIND } from './fapolicyd_trust';
import type { Artifact, ArtifactKind } from './render/types';

export const RECORD_NAME = 'provisioned.json';
/** A tree being removed. Never a `.conf`: no include glob matches it. The exec door's one admitted name. */
export { RETIRED_SUFFIX };
/** The rollback of a retired FPM pool (plan.ts VALIDATED_BACKUP_SUFFIX, respelled: no runtime cycle). */
const BACKUP_SUFFIX = '.dedalo-provision.bak';

/**
 * What a record may name: a rendered kind, or the fapolicyd trust file — written by the trust
 * program, not rendered, but stamped by it with TRUST_KIND, so the same guard judges it.
 */
export type RetirableKind = ArtifactKind | typeof TRUST_KIND;

/**
 * The kinds a plan may retire, and the validator their removal goes through. Closed. The trust
 * unit and its trust file go when fapolicyd is uninstalled (layout.trust becomes null).
 */
export const RETIRABLE_KINDS: Readonly<Partial<Record<RetirableKind, 'fpm' | null>>> = Object.freeze({
  fpm_pool: 'fpm',
  logrotate: null,
  logrotate_v1: null,
  trust_unit: null,
  [TRUST_KIND]: null,
});

/** The trees a plan may retire. Closed. */
export const TREE_KINDS = ['v1_api', 'v1_var'] as const;
export type TreeKind = (typeof TREE_KINDS)[number];

export interface RecordedArtifact {
  readonly kind: RetirableKind;
  readonly path: string;
  /** fpm_pool only: the FPM install that loads it (its reload after the removal). */
  readonly fpm?: { readonly unit: string; readonly bin: string };
}
export interface RecordedTree {
  readonly kind: TreeKind;
  readonly path: string;
}
export interface ProvisionRecord {
  readonly v: 1;
  readonly artifacts: readonly RecordedArtifact[];
  readonly trees: readonly RecordedTree[];
}

export const EMPTY_RECORD: ProvisionRecord = Object.freeze({ v: 1, artifacts: Object.freeze([]), trees: Object.freeze([]) });

export function recordPath(layout: AgentLayout): string {
  return join(layout.instanceDir, RECORD_NAME);
}

/** Where THIS layout puts each tree, or null when it has none of that kind. */
export function treePath(layout: AgentLayout, kind: TreeKind): string | null {
  if (kind === 'v1_api') return layout.v1 === null ? null : layout.v1.dirs.root;
  return layout.site?.v1 == null ? null : dirname(layout.site.v1.var.root);
}

/** The owner a tree's root has as provision apply leaves it: `agent` / `root` (MODES rows). */
export function treeMode(kind: TreeKind): (typeof MODES)['apiRoot'] {
  return kind === 'v1_api' ? MODES.apiRoot : MODES.hostBase;
}

/** What this layout provisions that a later declaration may retire. */
export function currentRecord(layout: AgentLayout, artifacts: readonly Artifact[]): ProvisionRecord {
  const fpm = layout.site?.v1?.fpm ?? null;
  const recorded: RecordedArtifact[] = artifacts
    .filter(art => art.kind in RETIRABLE_KINDS)
    .map(art => (art.kind === 'fpm_pool' && fpm !== null ? { kind: art.kind, path: art.path, fpm: { unit: fpm.unit, bin: fpm.bin } } : { kind: art.kind, path: art.path }));
  // The trust file is the trust program's (not rendered): recorded beside its unit.
  if (layout.trust !== null) recorded.push({ kind: TRUST_KIND, path: layout.trust.file });
  const trees: RecordedTree[] = [];
  for (const kind of TREE_KINDS) {
    const path = treePath(layout, kind);
    if (path !== null) trees.push({ kind, path });
  }
  return { v: 1, artifacts: recorded, trees };
}

export function encodeRecord(record: ProvisionRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

const CLEAN_PATH = (value: unknown): value is string =>
  typeof value === 'string' && isAbsolute(value) && normalize(value) === value && value !== '/' && !/[\0\n]/.test(value);

function parseArtifact(raw: unknown): RecordedArtifact | null {
  const entry = raw as Record<string, unknown> | null;
  if (entry === null || typeof entry !== 'object' || typeof entry.kind !== 'string' || !(entry.kind in RETIRABLE_KINDS)) return null;
  if (!CLEAN_PATH(entry.path)) return null;
  if (entry.kind !== 'fpm_pool') return entry.fpm === undefined ? { kind: entry.kind as RetirableKind, path: entry.path } : null;
  const fpm = entry.fpm as Record<string, unknown> | undefined;
  if (fpm === undefined || typeof fpm.unit !== 'string' || !/^[A-Za-z0-9@._-]{1,128}$/.test(fpm.unit) || !CLEAN_PATH(fpm.bin)) return null;
  return { kind: 'fpm_pool', path: entry.path, fpm: { unit: fpm.unit, bin: fpm.bin } };
}

function parseTree(raw: unknown): RecordedTree | null {
  const entry = raw as Record<string, unknown> | null;
  if (entry === null || typeof entry !== 'object' || !TREE_KINDS.includes(entry.kind as TreeKind) || !CLEAN_PATH(entry.path)) return null;
  return { kind: entry.kind as TreeKind, path: entry.path };
}

/** The record on the host: EMPTY_RECORD when absent, null when it is not one this module wrote. */
export function parseRecord(text: string | null | undefined): ProvisionRecord | null {
  if (text === undefined) return EMPTY_RECORD;
  if (text === null) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (raw?.v !== 1 || !Array.isArray(raw.artifacts) || !Array.isArray(raw.trees)) return null;
  const artifacts = raw.artifacts.map(parseArtifact);
  const trees = raw.trees.map(parseTree);
  if (artifacts.includes(null) || trees.includes(null)) return null;
  return { v: 1, artifacts: artifacts as RecordedArtifact[], trees: trees as RecordedTree[] };
}

/**
 * What a previous record names that the current one does not. FILES by path: a pool that moved
 * (another PHP version's pool directory) is retired, or two pools of one name would meet in one
 * FPM install. TREES by kind: a tree is retired when the declaration no longer has one of that kind
 * (v1 dropped); a tree that MOVED (a relocated state root) is the operator's move, not a
 * retirement — it is left where it is and leaves the record.
 */
export function retiredOf(previous: ProvisionRecord, current: ProvisionRecord): ProvisionRecord {
  const files = new Set(current.artifacts.map(entry => entry.path));
  const kinds = new Set(current.trees.map(entry => entry.kind));
  return {
    v: 1,
    artifacts: previous.artifacts.filter(entry => !files.has(entry.path)),
    trees: previous.trees.filter(entry => !kinds.has(entry.kind)),
  };
}

/** Every path observeHost must lstat for a record (the files, their rollbacks, the trees and their temps, the FPM binaries). */
export function recordWatch(record: ProvisionRecord): { readonly paths: string[]; readonly files: string[]; readonly units: string[] } {
  const paths: string[] = [];
  const files: string[] = [];
  const units: string[] = [];
  for (const entry of record.artifacts) {
    paths.push(entry.path, `${entry.path}${BACKUP_SUFFIX}`);
    files.push(entry.path, `${entry.path}${BACKUP_SUFFIX}`);
    if (entry.fpm !== undefined) {
      paths.push(entry.fpm.bin);
      units.push(entry.fpm.unit);
    }
  }
  for (const tree of record.trees) paths.push(tree.path, `${tree.path}${RETIRED_SUFFIX}`);
  return { paths, files, units };
}

/* ── the guards ───────────────────────────────────────────────────────────────────── */

export interface Facts {
  readonly type: string;
  readonly uid: number;
  readonly gid: number;
  readonly mode: number;
}

/**
 * Why a retired FILE may not be removed, or null: it must be a regular file stamped by this
 * provisioner for THIS instance and THIS kind, its body unedited. `text` is what observeHost read.
 */
export function retiredFileProblem(instance: string, entry: RecordedArtifact, facts: Facts, text: string | null | undefined): string | null {
  const what = `'${entry.path}' (the retired ${entry.kind})`;
  if (facts.type !== 'file') return `${what} is a ${facts.type}, not the file provision apply wrote — inspect it and remove it by hand`;
  if (typeof text !== 'string') return `${what} could not be read`;
  const parsed = parseStamp(text);
  if (parsed === null) return `${what} was not written by this provisioner (no stamp) — it is not removed: move it aside or remove it by hand`;
  if (parsed.instance !== instance || parsed.kind !== entry.kind) {
    return `${what} is stamped for '${parsed.instance} ${parsed.kind}', not '${instance} ${entry.kind}' — it is not removed: it belongs to someone else`;
  }
  if (hasDrifted(text)) return `${what} was edited by hand since provision apply wrote it — it is not removed: move it aside or remove it by hand`;
  return null;
}

/**
 * Why a retired TREE may not be removed, or null: at the place this instance's layout would put a
 * tree of its kind (the record is root's, but a path is judged, never trusted), a real directory
 * with exactly the MODES owner, group and mode, whose parent is a trusted directory.
 */
export function retiredTreeProblem(
  layout: AgentLayout,
  tree: RecordedTree,
  facts: Facts,
  owner: { readonly uid: number; readonly gid: number },
  parentTrusted: boolean,
): string | null {
  const what = `'${tree.path}' (the retired ${tree.kind === 'v1_api' ? 'Publication API v1 tree' : 'v1 pool directory'})`;
  if (!ownPlace(layout, tree)) return `${what} is not where this instance keeps it — it is not removed`;
  if (facts.type !== 'dir') return `${what} is a ${facts.type}, not a directory — inspect it and remove it by hand`;
  const mode = treeMode(tree.kind).mode;
  if (facts.uid !== owner.uid || facts.gid !== owner.gid || (facts.mode & 0o7777) !== mode) {
    return (
      `${what} is uid ${facts.uid} gid ${facts.gid} mode 0${(facts.mode & 0o7777).toString(8)}, not ${owner.uid}:${owner.gid} 0${mode.toString(8)} ` +
      'as provision apply left it — it is not removed: inspect it and remove it by hand'
    );
  }
  if (!parentTrusted) return `${what}: its parent '${dirname(tree.path)}' is not a root directory closed to others — it is not removed`;
  return null;
}

/** The tree sits where THIS instance's layout puts that kind (`<state>/publication_api/v1`, `<v1_var_base>/<instance>`). */
function ownPlace(layout: AgentLayout, tree: RecordedTree): boolean {
  if (tree.kind === 'v1_api') return tree.path === join(layout.state.root, PUBLICATION_API_DIR, 'v1');
  return basename(tree.path) === layout.instance;
}
