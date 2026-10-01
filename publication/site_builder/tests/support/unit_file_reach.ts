/**
 * WHAT ONE RENDERED AGENT UNIT CAN REACH OF ANOTHER — the uid-aware half of the reach model
 * (LEAD-1b spec §6 G6).
 *
 * `systemd_reach.ts` answers "what does this unit's MOUNT view contain" and assumes every
 * concurrent unit is the same uid (true of the transient design, where one agent user ran
 * every run). LEAD-1b's boundary is different: one uid per SITE, units rendered by root per
 * (site, door), and PID 1 serializing a site's doors. So this model reads the RENDERED FILES
 * and adds the three things the kernel and PID 1 decide on top of mounts:
 *
 *   - WHO a unit runs as: `User=` resolved through a passwd/group ledger (uid, gids). Two
 *     sites rendered with one `User=` are one principal, and the model says so.
 *   - DAC, per path: search on every ancestor directory, then read (a file or a listing) or
 *     write (connect(2) to a unix socket) on the target — owner/group/other bits.
 *   - /proc: a process of unit V is visible to unit U, and `/proc/<pid>/root` + `environ`
 *     followable, only when U has no private PID namespace AND U's uid equals V's
 *     (`ProtectProc=invisible` hides other uids; `ptrace_may_access` needs the same uid
 *     without CAP_SYS_PTRACE). Through it, U sees V's MOUNT view with U's own credentials.
 *   - CO-SCHEDULING: U and V can be alive at the same instant unless PID 1 forbids it — a
 *     socket with `MaxConnections=1` has at most one live instance, and two units bound
 *     (`BindsTo=`) to targets in `Conflicts=` never run together.
 *
 * Every question is stated from the HOST's side (a host path, a unit's environment) and the
 * model finds ANY route to it. It is a model: PID 1's real semantics are proved by the live
 * probe (spec §8, P2–P4); this is what makes a renderer change that breaks them red offline.
 */

import { mountVisible, mountWritable, parseProperties } from './systemd_reach';
import { unitDirectives, unitValues } from './lead1b_contract';

export interface Principal {
  readonly name: string;
  readonly uid: number;
  readonly gids: readonly number[];
}

export interface FsNode {
  readonly uid: number;
  readonly gid: number;
  readonly mode: number;
}

/** One rendered (site, door) run, as PID 1 would start it. */
export interface ModelUnit {
  /** e.g. `s1-turn`. */
  readonly id: string;
  readonly k: number;
  readonly door: string;
  /** `[Service]` directives as `K=V`. */
  readonly props: readonly string[];
  readonly principal: Principal;
  /** `[Unit] BindsTo=` names. */
  readonly bindsTo: readonly string[];
  /** The socket's `MaxConnections=`. */
  readonly maxConnections: number;
}

export interface HostModel {
  readonly units: readonly ModelUnit[];
  /** Target name → the targets it `Conflicts=` with. */
  readonly conflicts: ReadonlyMap<string, readonly string[]>;
  /** Host path → owner/group/mode. A path absent here is not asked about for DAC. */
  readonly nodes: ReadonlyMap<string, FsNode>;
}

export type ReachQuestion =
  /** connect(2) to a path socket. */
  | { readonly kind: 'connect'; readonly path: string }
  /** open a file, or list a directory, for reading. */
  | { readonly kind: 'read'; readonly path: string }
  /** create a file in a directory. */
  | { readonly kind: 'write'; readonly path: string }
  /** read another unit's /proc/<pid>/environ. */
  | { readonly kind: 'environ'; readonly of: string };

function yes(props: readonly string[], key: string): boolean {
  const values = parseProperties(props).get(key) ?? [];
  const value = values[values.length - 1];
  return value !== undefined && /^(yes|true|1|on)$/i.test(value.trim());
}

function bits(node: FsNode, who: Principal): number {
  if (who.uid === 0) return 0o7;
  if (node.uid === who.uid) return (node.mode >> 6) & 0o7;
  if (who.gids.includes(node.gid)) return (node.mode >> 3) & 0o7;
  return node.mode & 0o7;
}

function ancestors(path: string): string[] {
  const out: string[] = [];
  let current = path;
  for (;;) {
    const parent = current.slice(0, current.lastIndexOf('/')) || '/';
    if (parent === current) break;
    out.push(parent);
    current = parent;
  }
  return out;
}

/** DAC: search on every known ancestor, then `need` on the target (if known). */
export function dacAllows(model: HostModel, who: Principal, path: string, need: number): boolean {
  for (const dir of ancestors(path)) {
    const node = model.nodes.get(dir);
    if (node && (bits(node, who) & 0o1) === 0) return false;
  }
  const node = model.nodes.get(path);
  return node ? (bits(node, who) & need) === need : true;
}

/** Can U and V be alive at the same instant? */
export function coScheduled(model: HostModel, u: ModelUnit, v: ModelUnit): boolean {
  if (u.id === v.id) return u.maxConnections > 1;
  for (const a of u.bindsTo) {
    for (const b of v.bindsTo) {
      if ((model.conflicts.get(a) ?? []).includes(b) || (model.conflicts.get(b) ?? []).includes(a)) return false;
    }
  }
  return true;
}

/** Can a process of U see V's processes in /proc and follow them? */
export function procVisible(u: ModelUnit, v: ModelUnit): boolean {
  if (yes(u.props, 'PrivatePIDs')) return false;
  return u.principal.uid === v.principal.uid;
}

const NEED: Record<'connect' | 'read' | 'write', number> = { connect: 0o2, read: 0o4, write: 0o3 };

/** The routes by which U reaches `question`, as readable strings; empty = unreachable. */
export function routes(model: HostModel, u: ModelUnit, question: ReachQuestion): string[] {
  const found: string[] = [];
  if (question.kind === 'environ') {
    for (const v of model.units) {
      if (v.id !== question.of) continue;
      if (coScheduled(model, u, v) && procVisible(u, v)) found.push(`/proc/<${v.id}>/environ`);
    }
    return found;
  }
  const need = NEED[question.kind];
  // A WRITE needs a writable mount too: a read-only bind is visible and unwritable.
  const mounted = (props: readonly string[]) =>
    question.kind === 'write' ? mountWritable(props, question.path) : mountVisible(props, question.path);
  if (mounted(u.props) && dacAllows(model, u.principal, question.path, need)) {
    found.push('its own mount view');
  }
  for (const v of model.units) {
    if (v === u && u.maxConnections <= 1) continue;
    if (!coScheduled(model, u, v) || !procVisible(u, v)) continue;
    if (mounted(v.props) && dacAllows(model, u.principal, question.path, need)) {
      found.push(`/proc/<${v.id}>/root`);
    }
  }
  return found;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Building the model from rendered files
 * ──────────────────────────────────────────────────────────────────────────────────── */

export interface RenderedSet {
  /** basename → body */
  readonly files: ReadonlyMap<string, string>;
  /** The unit prefix. */
  readonly prefix: string;
  /** Declared ordinals. */
  readonly ordinals: readonly number[];
  readonly doors: readonly string[];
  /** user name → principal (the host's passwd + group, as the ledger says). */
  readonly passwd: ReadonlyMap<string, Principal>;
}

export function buildModel(set: RenderedSet, nodes: ReadonlyMap<string, FsNode>): HostModel {
  const units: ModelUnit[] = [];
  const conflicts = new Map<string, string[]>();
  for (const k of set.ordinals) {
    for (const door of set.doors) {
      const id = `s${k}-${door}`;
      const template = set.files.get(`${set.prefix}${id}@.service`);
      const socket = set.files.get(`${set.prefix}${id}.socket`);
      const target = set.files.get(`${set.prefix}${id}.target`);
      if (!template || !socket || !target) throw new Error(`reach model: ${id} is missing a rendered unit (template/socket/target)`);
      const users = unitValues(template, 'User', 'Service');
      if (users.length !== 1) throw new Error(`reach model: ${id} renders ${users.length} User= lines`);
      const principal = set.passwd.get(users[0] as string);
      if (!principal) throw new Error(`reach model: ${id} runs as '${users[0]}', which is no identity of the ledger`);
      const max = unitValues(socket, 'MaxConnections', 'Socket');
      units.push({
        id,
        k,
        door,
        props: unitDirectives(template)
          .filter(entry => entry.section === 'Service')
          .map(entry => `${entry.key}=${entry.value}`),
        principal,
        bindsTo: unitValues(template, 'BindsTo', 'Unit').flatMap(value => value.split(/\s+/).filter(Boolean)),
        // An absent MaxConnections= is systemd's default of 64.
        maxConnections: max.length > 0 ? Number(max[max.length - 1]) : 64,
      });
      conflicts.set(
        `${set.prefix}${id}.target`,
        unitValues(target, 'Conflicts', 'Unit').flatMap(value => value.split(/\s+/).filter(Boolean)),
      );
    }
  }
  return { units, conflicts, nodes };
}
