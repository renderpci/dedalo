/**
 * THE PLAN — every change this host needs, decided as a value, before anything is touched.
 *
 * The provisioner is four moves now, not three. DERIVE (`layout.ts` turns one declaration
 * into every name, path, owner and mode), RENDER (`render/` turns that layout into the
 * exact bytes of each artifact), PLAN (this file compares the derived intent against an
 * OBSERVED host and emits the ordered list of changes that closes the gap), APPLY (runs
 * that list and decides nothing). This module is the one that knows what "provisioned"
 * means; `apply.ts` is deliberately too stupid to know.
 *
 * WHY THE PLAN IS A PURE FUNCTION OF AN INJECTED OBSERVATION.
 *
 * `plan(layout, manifest, host)` reads no filesystem, spawns no process, reads no
 * environment and consults no clock. Everything it needs to know about the machine arrives
 * in `host: HostState` — which users and groups exist, what stands at each path with what
 * owner and mode, and the current bytes of each artifact. That is not purity for its own
 * sake. It is the only arrangement in which the ORDER of a provisioning run is testable:
 * the property that a `groupadd` always precedes the `useradd` that names it with `--gid`
 * is a property of a list, and a gate can assert it over a matrix of host states in
 * milliseconds without a container, a uid, or root.
 *
 * That ordering is not hypothetical. The retired `install.sh` ran
 * `useradd --system --create-home` with NO `--user-group`, leaving group creation to distro
 * policy, while the unit it installed hard-required `Group=dedalo-sites`. On a host whose
 * `USERGROUPS_ENAB` says no, the install succeeded and the daemon never started — the
 * engine's own unit documents the identical trap (`deploy/dedalo-ts.service`, the comment
 * above `User=`). Here a `user` action cannot be constructed without a primary group, the
 * group's creation is planned before it, and `assertPlanIsCoherent()` refuses the plan if
 * either is untrue. The defect is not fixed; it is unwritable.
 *
 * WHAT THE PLAN MAY NOT CONTAIN.
 *
 *   NO SECRET VALUE, anywhere. A plan is printed to a terminal by `check`, pasted into
 *   tickets and quoted in bug reports. A credential is therefore named by its FILE and
 *   never by its value: a file whose content the provisioner mints carries a RECIPE
 *   (`{source:'random', bytes, encoding}`), and a file whose content is derived from
 *   passwords carries the password FILES (`{source:'htpasswd', users}`). `describe()` never
 *   prints a body of any source, so there is no path from a declaration to a log line.
 *
 *   NO DELETION. Nothing in this union removes a user, a group, a release or a served
 *   link. A uid must never be reused — a uid freed by a removed instance and handed to the
 *   next one inherits every file the first one left on the host — and a museum's published
 *   site must never disappear because a declaration changed. Removal is a separate,
 *   explicit operator verb (`remove`, which archives and refuses while a site is published)
 *   and it is NOT expressible here. `assertPlanIsCoherent()` checks that too, by argv.
 *
 *   NO ACTION THAT WOULD DO NOTHING. A directory that already exists with the right owner
 *   and mode produces no action at all, and an artifact whose bytes match produces no
 *   action at all. On a settled host `plan()` returns an EMPTY array — which is what makes
 *   a second `apply` a no-op that can be scheduled, and what makes `check` readable: every
 *   line it prints is a line that is actually going to happen.
 *
 * Precedent for the whole shape: `src/core/media/protection.ts` in the engine — pure
 * builders, a body hash inside the artifact, a write that happens only on drift, and a
 * status call that writes nothing. This file is that design with the decision extracted
 * from the writer, because here the writer runs as root on a museum's host.
 */

import { dirname, join, relative } from 'node:path';
import type {
  InstanceLayout,
  InstanceManifest,
  ManifestPreprodUser,
  SiteLayout,
  Surface,
} from './layout';
import {
  INSTANCE_MARKER,
  MODES,
  PUBLICATION_API_KEY_KEY,
  SURFACES,
  credentialSources,
  isStrictlyWithin,
  markerContent,
  readWritePaths,
} from './layout';
import type { Artifact, ArtifactKind, ModeKey } from './render';
import { renderAll } from './render';
import { SERVICE_TOKEN_KEY } from './render/engine_fragment';
import { hasDrifted, parseStamp } from './hash';

/* ────────────────────────────────────────────────────────────────────────────────────
 * The observation
 *
 * Everything `plan()` is allowed to know about the machine. `apply.ts::observeHost()`
 * fills it in; a gate builds it by hand. Those two must be able to produce the same shape,
 * which is why every field here is plain data with no methods and no laziness.
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** What kind of thing stands at a path. `other` is a device, a socket, a fifo — anything
 * that is none of the three the provisioner knows how to reason about. */
export type EntryType = 'dir' | 'file' | 'symlink' | 'other';

/**
 * WHAT THE HOST HAS AT ONE PATH.
 *
 * `mode`, `owner` and `group` are NOT optional in spirit even though they are optional in
 * type: an observation that omits them is treated as DRIFT and the plan re-asserts the
 * metadata. That is the safe direction and it is deliberate — these numbers are the
 * isolation model (a `0750` webspace that lost its setgid bit is a museum's unpublished
 * drafts becoming world-readable), so "I did not look" must never read as "it was correct".
 * An observer that cannot stat a path should omit the ENTRY, not report a blank one.
 */
export interface PathObservation {
  readonly type: EntryType;
  /** The full permission word, `st_mode & 0o7777` — setgid INCLUDED. See MODES.webspace. */
  readonly mode?: number;
  /** The resolved user NAME, not the uid: the plan compares against `layout.identity`. */
  readonly owner?: string;
  /** The resolved group NAME. */
  readonly group?: string;
  /** For `type: 'symlink'`, what it points at, verbatim (relative targets stay relative). */
  readonly target?: string;
  /**
   * The complete current bytes — for the paths `observedPaths()` names and no others.
   * NEVER read a credential file into this: nothing in the plan needs a secret's content,
   * and a HostState carrying one would put it one `console.log` away from a ticket.
   */
  readonly content?: string;
  /**
   * Is this directory empty? Only meaningful for `type: 'dir'`, and only consulted for the
   * marked roots — §5's refusal semantics turn on it (an empty unmarked root is ADOPTED,
   * a non-empty unmarked root is REFUSED, because there is something there to lose).
   */
  readonly empty?: boolean;
  /**
   * Last modification, milliseconds. Consulted for exactly one comparison: a preprod
   * password file NEWER than the generated htpasswd means the operator rotated the
   * password and the hash on disk is stale. It is the only signal available that is a
   * fact about rotation without being a fact about the password.
   */
  readonly mtimeMs?: number;
}

/**
 * THE INJECTED HOST — the whole of what `plan()` may consult.
 *
 * `unitEnabled` / `unitActive` are required rather than optional on purpose. Without them
 * the plan cannot be idempotent: it would either re-issue `systemctl enable --now` on every
 * run (P4 broken, and a `restart` on a live museum every time the tool runs) or never issue
 * it at all. A partial observation is a silently wrong plan, and the compiler is the right
 * place to say so to whoever writes the next observer.
 */
export interface HostState {
  /** Every user name that exists on the host, or at least every one the plan may ask about. */
  readonly users: readonly string[];
  /** Every group name that exists. */
  readonly groups: readonly string[];
  /** Absolute path → what stands there. A path ABSENT from this map does not exist. */
  readonly entries: Readonly<Record<string, PathObservation>>;
  /** `systemctl is-enabled <unit>` succeeded. */
  readonly unitEnabled: boolean;
  /** `systemctl is-active <unit>` succeeded. */
  readonly unitActive: boolean;
  /**
   * The htpasswd's current LOGIN NAMES — never its hashes. It is what decides whether the
   * declared reviewer set still matches the file, and it is secret-free by construction:
   * a name is already in the declaration.
   */
  readonly htpasswdUsers?: readonly string[];
  /**
   * The host's nologin shell, when the observer looked. Debian and RHEL both ship
   * `/usr/sbin/nologin` today, which is the default below; the field exists because a
   * shell that does not exist makes `useradd` fail on the museum's host rather than here.
   */
  readonly nologinShell?: string;
  /**
   * The systemd unit that runs the web server: `nginx` on every distro, `apache2` on
   * Debian and `httpd` on RHEL. Declared by the observer because it is a fact about the
   * host, not about the declaration — and a wrong guess here is a reload that silently
   * never happens.
   */
  readonly webServerUnit?: string;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The actions
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE ORDER, as a value.
 *
 * §4 of `engineering/SITE_BUILDER_INSTANCES.md` states it as prose — "identities → roots
 * and modes → markers → secrets → rendered files → daemon-reload → vhost validate" — and
 * prose cannot be checked. Every action carries its phase, `plan()` emits them in this
 * order, and `assertPlanIsCoherent()` refuses a plan whose phases ever decrease. A future
 * step inserted in the wrong place is then a red gate rather than a museum whose unit
 * starts before the directory it is confined to exists.
 */
export const PHASES = ['identity', 'tree', 'link', 'secret', 'artifact', 'service', 'web'] as const;
export type Phase = (typeof PHASES)[number];

const PHASE_ORDER: Readonly<Record<Phase, number>> = Object.freeze(
  Object.fromEntries(PHASES.map((phase, index) => [phase, index])) as Record<Phase, number>,
);

interface ActionBase {
  readonly phase: Phase;
  /**
   * WHY this action is in the plan, as one clause an operator reads in a `check` report.
   * Not decoration: an action with no reason is an action nobody can review before it runs
   * as root, and this whole subsystem exists because six files did things nobody reviewed.
   */
  readonly reason: string;
}

/** `groupadd --system <name>`. Always planned BEFORE the user that names it. */
export interface GroupAction extends ActionBase {
  readonly kind: 'group';
  /** The group's name. `name` in both identity actions, so one field means one thing
   * whichever of the two a report is printing; the USER action's `group` is a different
   * fact (whose primary group it is) and keeps its own name for that reason. */
  readonly name: string;
  readonly argv: readonly string[];
}

/**
 * `useradd --system --gid <group> …`. The `--gid` is not optional and cannot be omitted:
 * see the header, and `deploy/dedalo-ts.service`'s comment above `User=` for the same trap
 * documented on the engine's side of the house.
 */
export interface UserAction extends ActionBase {
  readonly kind: 'user';
  readonly name: string;
  /** The PRIMARY group. The unit's `Group=` names it, so it must exist and must be theirs. */
  readonly group: string;
  /** `--home-dir`, pointed at the agent HOME the tree phase creates with MODES.home. */
  readonly home: string;
  readonly shell: string;
  readonly argv: readonly string[];
}

/** What is wrong with a directory the host already has. `create` means it is absent. */
export type DirChange = 'create' | 'owner' | 'mode';

/**
 * One directory, with the owner and mode §3's matrix says it has. Every dir action is a
 * `mkdir -p`: the ancestors this subsystem does not derive (`/etc/dedalo_sites/`, the
 * webspace base) carry no matrix row precisely because they are ordinary root-owned 0755
 * directories, and creating them as a side effect is the honest reading of that.
 */
export interface DirAction extends ActionBase {
  readonly kind: 'dir';
  readonly path: string;
  readonly mode: number;
  readonly owner: string;
  readonly group: string;
  /** The MODES row this directory is — provenance, so a report points at §3 and not a number. */
  readonly modeKey: ModeKey;
  /** Never empty: a directory that is already correct produces no action at all. */
  readonly changes: readonly DirChange[];
}

/**
 * WHERE A FILE'S BYTES COME FROM — and the reason a plan can be printed.
 *
 * `literal` is the only source whose bytes are IN the plan, and they are always bytes a
 * renderer produced from the declaration (or a marker's instance name). The other three
 * are recipes: `random` mints, `htpasswd` hashes passwords read at apply time from files
 * this record only NAMES, and `operator` means the provisioner cannot produce this file at
 * all and is waiting for a human to place it.
 */
export type FileContent =
  | { readonly source: 'literal'; readonly body: string }
  | { readonly source: 'random'; readonly bytes: number; readonly encoding: 'base64url' }
  | { readonly source: 'htpasswd'; readonly users: readonly HtpasswdUser[] }
  | { readonly source: 'operator' };

/** One preprod reviewer: a login name, and the root-owned file holding their password. */
export interface HtpasswdUser {
  readonly name: string;
  readonly passwordFile: string;
}

/**
 * `create` — absent, write it. `rewrite` — present and its bytes are not ours. `metadata` —
 * the bytes are right and the owner or mode is not. `awaiting` — it must exist and does
 * not, and only a human can supply it; apply writes NOTHING for one of these.
 */
export type FileDisposition = 'create' | 'rewrite' | 'metadata' | 'awaiting';

/** Why a rendered artifact is being rewritten. Reported by name, because §4 requires the
 * run to SAY which file it reverted rather than quietly reverting it. */
export type DriftKind =
  /** Its bytes disagree with its own stamp: somebody edited the file in place. */
  | 'hand_edited'
  /** Stamped, self-consistent, but not what this declaration renders today. */
  | 'stale'
  /** No stamp at all: the file was replaced wholesale. */
  | 'unstamped'
  /** Stamped for ANOTHER instance — one museum's file standing in another's path. */
  | 'foreign';

export interface FileAction extends ActionBase {
  readonly kind: 'file';
  readonly path: string;
  readonly disposition: FileDisposition;
  readonly content: FileContent;
  readonly mode: number;
  readonly owner: string;
  readonly group: string;
  /**
   * The MODES row, or `null` for the instance marker — which has no row, because §3 is a
   * GATED matrix (a `MODES` key with no row in the document is drift, and a row naming no
   * key is drift too) and this module cannot add one to a document it does not own. Its
   * owner and mode are `MARKER_MODE` below, with the reasoning stated there. The day §5's
   * marker gains a row in §3, that constant becomes a `MODES` key and this `null` goes.
   */
  readonly modeKey: ModeKey | null;
  /** Set when this file is a rendered artifact — the kind names the module that wrote it. */
  readonly artifactKind?: ArtifactKind;
  /** Set only on `rewrite`. */
  readonly drift?: DriftKind;
}

/**
 * One served link — `<webspace>/pre` or `<webspace>/web`, the document root of a vhost.
 *
 * CREATE-IF-ABSENT AND NOTHING ELSE. An existing link points at whatever the daemon last
 * published, and re-pointing it here would silently roll a museum's live site back to an
 * empty placeholder. The provisioner's only job is that the path EXISTS before the web
 * server is reloaded (`render/nginx.ts` says so in as many words: "the webspace and the
 * served links must EXIST before nginx is reloaded"), so a fresh site answers 404 from an
 * empty release store instead of failing the vhost.
 *
 * The target is RELATIVE, matching `build/promote.ts`'s own rule — "so the surface tree
 * stays relocatable" — and it points at the release STORE for the surface, a directory the
 * tree phase has already created and which is owned by the same uid as the link. That last
 * detail is load-bearing under Apache: `Options +SymLinksIfOwnerMatch` follows a link only
 * when link and target share an owner, so a placeholder owned by anyone else would be a
 * 403 on a site nobody had touched.
 *
 * There is no `mode`: a symlink has none that matters, and §3's row for `{pre,web}` writes
 * the mode column as `—` for exactly that reason. `lchown` is the whole of its metadata,
 * and apply must not follow the link while setting it.
 */
export interface SymlinkAction extends ActionBase {
  readonly kind: 'symlink';
  readonly path: string;
  readonly target: string;
  readonly owner: string;
  readonly group: string;
}

/**
 * The steps that are commands. Named rather than left as bare argv so a gate can assert an
 * ORDER (`web_configtest` before `web_reload`) without parsing a command line.
 */
export type ExecStep =
  | 'daemon_reload'
  | 'unit_enable'
  | 'unit_start'
  | 'unit_restart'
  | 'web_configtest'
  | 'web_reload';

/**
 * One command. EVERY exec is fatal on failure, so the gating is done by ORDER and needs no
 * flag: `web_configtest` stands immediately before `web_reload`, and an apply that halts on
 * the first failure therefore cannot reload a broken configuration. One bad vhost takes
 * down every site on the host, this museum's and every other museum's, so that ordering is
 * the single most important property in this file after the identity one.
 */
export interface ExecAction extends ActionBase {
  readonly kind: 'exec';
  readonly step: ExecStep;
  readonly argv: readonly string[];
}

export type Action =
  | GroupAction
  | UserAction
  | DirAction
  | FileAction
  | SymlinkAction
  | ExecAction;

/* ────────────────────────────────────────────────────────────────────────────────────
 * The few constants this module owns, and why each is here rather than in layout.ts
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE MARKER FILE'S OWNER AND MODE — a NAMED EXEMPTION, not an oversight.
 *
 * `MODES` is the executable copy of §3, and that table is gated in BOTH directions: a
 * `MODES` key with no row is drift, and a row naming no key is drift. §3 has no row for
 * §5's marker, so adding one to `MODES` from here would redden the document gate, and
 * editing the document is not this module's to do. The mode is therefore declared here,
 * once, with its reasoning, and the day the marker earns a row in §3 this constant becomes
 * a `MODES` key and the `modeKey: null` above disappears with it.
 *
 * ROOT-OWNED on purpose. The marker is the root's claim about WHOSE it is; a claim the
 * daemon can rewrite is not a claim. World-readable because the daemon must read it at
 * boot from inside a 0700 agent HOME it owns — the enclosing directory is what actually
 * limits who ever sees it.
 */
export const MARKER_MODE = Object.freeze({ owner: 'root', group: 'root', mode: 0o644 });

/**
 * HOW A SERVICE TOKEN IS MINTED. 32 bytes of CSPRNG, base64url — 43 characters, which
 * clears `src/config.ts`'s `SERVICE_TOKEN` minimum of 32 with room to spare, and contains
 * no character that needs quoting in an env file, a systemd unit or a shell.
 *
 * The plan states the RECIPE and never the value: `plan()` is pure, so it could not draw a
 * random number even if that were a good idea, and a token in a printable plan would be a
 * token in a ticket. `apply` draws the bytes, writes the file 0600 root:root, and prints
 * nothing.
 */
export const SERVICE_TOKEN_BYTES = 32;

/** Debian and RHEL both ship it; overridable per host through `HostState.nologinShell`. */
const DEFAULT_NOLOGIN_SHELL = '/usr/sbin/nologin';

/** The web server's systemd unit, when the observer did not say. */
const DEFAULT_WEB_UNITS: Readonly<Record<'nginx' | 'apache', string>> = Object.freeze({
  nginx: 'nginx',
  apache: 'apache2',
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * plan()
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE WHOLE RUN, AS A LIST — ordered, complete, and empty when the host already agrees.
 *
 * It throws rather than returning a broken plan. A refusal here refuses ONE INSTANCE: the
 * fleet loader catches it, reports that museum by name, and carries on with the rest, so a
 * malformed or hostile-looking host state can never abort provisioning for every museum on
 * the box. What refuses:
 *
 *   - a root that exists, holds something, and does not declare itself this instance's
 *     (§5's marker law — the one rule standing between a mistyped `webspace_base` and
 *     another museum's live site tree);
 *   - a FILE where a directory must be, or a directory where a served link must be — both
 *     are destructive to repair automatically, and neither is this tool's decision;
 *   - a plan that came out incoherent (`assertPlanIsCoherent`): a user before its group, a
 *     `useradd` without `--gid`, a deletion, a reload before its configtest, a secret
 *     planned for rewrite.
 */
export function plan(
  layout: InstanceLayout,
  manifest: InstanceManifest,
  host: HostState,
): Action[] {
  const actions: Action[] = [];

  actions.push(...identityActions(layout, host));
  actions.push(...treeActions(layout, host));
  actions.push(...linkActions(layout, host));
  actions.push(...secretActions(layout, host));
  actions.push(...artifactActions(layout, manifest, host));
  actions.push(...htpasswdActions(layout, host));
  actions.push(...serviceActions(layout, host, actions));
  actions.push(...webActions(layout, host, actions));

  assertPlanIsCoherent(actions, layout);
  return actions.map(action => Object.freeze(action));
}

/**
 * EVERY PATH `plan()` MAY CONSULT — the observer's shopping list.
 *
 * `observeHost()` cannot guess this, and a guess that came up one path short would produce
 * a plan that re-created a directory that already existed, or reported a settled artifact
 * as absent and rewrote a museum's live vhost. So the module that asks owns the list, and
 * the module that looks reads it from here. The bytes of an artifact are needed (drift is a
 * byte comparison); the bytes of a CREDENTIAL are never needed and must never be read into
 * a `HostState`.
 */
export function observedPaths(layout: InstanceLayout, manifest: InstanceManifest): string[] {
  const paths = new Set<string>();
  for (const entry of treeEntries(layout)) paths.add(entry.path);
  for (const root of markedRoots(layout)) paths.add(markerPath(root));
  for (const site of layout.sites) {
    for (const surface of SURFACES) paths.add(site.linkPath(surface));
  }
  // THE ARTIFACTS ARE DERIVED, NEVER LISTED. This function used to enumerate them by hand —
  // unitPath, envFile, siteTablePath, engineFragment, htpasswd, the vhost paths — which is
  // defect 3's exact shape, and it had already been paid for once: the comment that used to
  // sit here recorded that the site table was missing from the list and so was reported
  // absent on every run and rewritten forever. A hand list that is correct today is invisible
  // to every drift comparison; it becomes the defect later, when an artifact is added and
  // this copy is not. So it asks the renderers.
  for (const artifact of renderAll(layout, manifest)) paths.add(artifact.path);
  paths.add(layout.htpasswd);
  // The audit FILE, which is not a directory and therefore not in `treeEntries()`. Its
  // absence from this list is the defect this function's own gate caught: an observer that
  // never looked at it reported it missing on every run, and the provisioner re-created a
  // museum's audit trail forever. The list and the reader are one function apart for
  // exactly that reason.
  paths.add(layout.auditFile);
  for (const file of credentialFiles(layout)) paths.add(file.path);
  return [...paths].sort();
}

/**
 * Does this action change the host? False for exactly one disposition — `awaiting`, which
 * is the plan telling an operator that a file it cannot create is missing. `check` uses it
 * to answer "will this run do anything", and the idempotence gate uses it to assert that a
 * settled host produces nothing that writes.
 */
export function changesTheHost(action: Action): boolean {
  return !(action.kind === 'file' && action.disposition === 'awaiting');
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Phase 1 — identities
 * ──────────────────────────────────────────────────────────────────────────────────── */

function identityActions(layout: InstanceLayout, host: HostState): Action[] {
  const actions: Action[] = [];
  const { user, group } = layout.identity;

  // THE GROUP FIRST, ALWAYS — and separately, never as `useradd --user-group`. The unit
  // states `Group=` explicitly (a museum's daemon must not inherit whatever primary group
  // a distro decided to give it), so the group has to exist as a named thing whether or
  // not the user is being created in the same run: an ADOPTED identity often names a user
  // that already exists beside a group that does not.
  if (!host.groups.includes(group)) {
    actions.push({
      kind: 'group',
      phase: 'identity',
      name: group,
      argv: ['groupadd', '--system', group],
      reason:
        `the unit's Group= names '${group}', and systemd fails a unit whose group does not ` +
        `exist before the daemon is ever executed`,
    });
  }

  if (!host.users.includes(user)) {
    const shell = host.nologinShell ?? DEFAULT_NOLOGIN_SHELL;
    actions.push({
      kind: 'user',
      phase: 'identity',
      name: user,
      group,
      home: layout.roots.home,
      shell,
      // `--no-create-home` on purpose: the agent HOME is created by the tree phase with
      // MODES.home (0700, the museum's own group), not by useradd with a umask-derived
      // mode and a copy of /etc/skel dropped into the directory a coding agent works in.
      argv: [
        'useradd',
        '--system',
        '--gid',
        group,
        '--home-dir',
        layout.roots.home,
        '--no-create-home',
        '--shell',
        shell,
        '--comment',
        `Dedalo site builder instance ${layout.instance}`,
        user,
      ],
      reason: `instance '${layout.instance}' runs as its own uid, and '${user}' does not exist yet`,
    });
  }

  return actions;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Phase 2 — the tree: every directory §3 names, then the markers
 * ──────────────────────────────────────────────────────────────────────────────────── */

interface TreeEntry {
  readonly path: string;
  readonly modeKey: ModeKey;
  readonly what: string;
}

/**
 * EVERY DIRECTORY THIS INSTANCE OWNS, parents before children.
 *
 * The order is the creation order and is not incidental: `mkdir -p` on a child would
 * create its parent with the ambient umask, so `secrets/` created before `configDir` would
 * leave `/etc/dedalo_sites/instances/<i>/` at whatever 0755 root:root happened to mean —
 * which is correct by luck, and `.releases/` under a webspace is the case where the luck
 * runs out (it must be 2750 SU:WG, and an implicit parent would be 0755 root:root).
 *
 * `runtimeDir` is in the list even though systemd's `RuntimeDirectory=` creates it on every
 * start and removes it on stop. It is listed because `readWritePaths()` names it and every
 * entry of `ReadWritePaths=` must exist when the unit starts — and the completeness check
 * at the bottom of this function is what guarantees no entry of that set is ever missing
 * from this one. A path that is in the unit's writable set and in no directory action is
 * precisely the EROFS-at-publish-time defect this subsystem was built to delete.
 */
function treeEntries(layout: InstanceLayout): TreeEntry[] {
  const entries: TreeEntry[] = [
    { path: layout.configDir, modeKey: 'configDir', what: 'the instance config directory' },
    { path: layout.secretsDir, modeKey: 'secretsDir', what: 'the credential directory' },
    { path: layout.stateDir, modeKey: 'stateDir', what: 'the parent of the three state roots' },
    { path: layout.roots.workspaces, modeKey: 'workspaces', what: 'the workspaces root' },
    { path: layout.roots.home, modeKey: 'home', what: 'the agent HOME' },
    { path: layout.roots.audit, modeKey: 'auditDir', what: 'the audit directory' },
    { path: layout.runtimeDir, modeKey: 'runtimeDir', what: 'the runtime directory' },
  ];

  for (const site of layout.sites) {
    entries.push({
      path: site.webspace,
      modeKey: 'webspace',
      what: `site '${site.slug}'s webspace`,
    });
    // The release STORE itself, spelled from a derived path rather than from the literal
    // `.releases` — layout.ts owns that name, and a second spelling of it here would be a
    // second owner of the one directory that must never be served.
    entries.push({
      path: releaseStore(site),
      modeKey: 'releases',
      what: `site '${site.slug}'s release store`,
    });
    for (const surface of SURFACES) {
      entries.push({
        path: site.releasesDir(surface),
        modeKey: 'releases',
        what: `site '${site.slug}'s ${surface} release store`,
      });
    }
  }

  // THE COMPLETENESS CHECK, on the structure and not on the host: every path the unit will
  // make writable must be a directory this plan creates. It is asserted here rather than in
  // a test because it must hold for EVERY declaration, including the one a museum writes
  // tomorrow with a root override nobody anticipated.
  const planned = new Set(entries.map(entry => entry.path));
  for (const writable of readWritePaths(layout)) {
    if (!planned.has(writable)) {
      throw new Error(
        `plan(${layout.instance}): '${writable}' is in the unit's ReadWritePaths= and in no ` +
          `directory action. ` +
          `Under ProtectSystem=strict systemd fails a unit whose writable set names a path ` +
          `that does not exist — and a '-' prefix would hide it until the museum's first ` +
          `publish failed as EROFS. Nothing was planned.`,
      );
    }
  }

  return entries;
}

/** `<webspace>/.releases` — the parent of both surface stores, derived, never spelled. */
function releaseStore(site: SiteLayout): string {
  return dirname(site.releasesDir('prod'));
}

/**
 * THE ROOTS THAT CARRY A MARKER (§5). The three state roots and every webspace: exactly
 * the trees where a mistyped path in a declaration would put this instance on top of
 * somebody else's data, and exactly the trees whose destructive operations (a recursive
 * copy over a served tree, the suite's own `rm -rf`) take a root as an ordinary string.
 */
function markedRoots(layout: InstanceLayout): string[] {
  return [
    layout.roots.workspaces,
    layout.roots.home,
    layout.roots.audit,
    ...layout.sites.map(site => site.webspace),
  ];
}

function markerPath(root: string): string {
  return join(root, INSTANCE_MARKER);
}

function treeActions(layout: InstanceLayout, host: HostState): Action[] {
  const actions: Action[] = [];
  const content = markerContent(layout.instance);
  const marked = new Set(markedRoots(layout));

  /**
   * A ROOT IS MARKED THE MOMENT IT EXISTS, NOT AFTER THE WHOLE TREE.
   *
   * The markers used to be appended after every directory action. That left a window in
   * which a root had been created AND FILLED — a webspace gets its `.releases/pre` and
   * `.releases/web` children in this same phase — while still carrying no marker. An apply
   * that died anywhere in that window (a full disk, a killed run, a failed chown) left a
   * non-empty unmarked root, which §5's refusal below then reads as "another instance's
   * tree" on EVERY subsequent run. The museum could never be provisioned again without
   * somebody deleting directories by hand on a live host.
   *
   * Marking each root immediately after its own mkdir closes the window: the root is either
   * absent, or present and already claimed. Its children are created afterwards, so a death
   * between the two leaves an EMPTY marked root, which is exactly the resumable state.
   */
  for (const entry of treeEntries(layout)) {
    const action = dirAction(layout, host, entry);
    if (action) actions.push(action);
    if (marked.has(entry.path)) {
      const markerAction = markerActionFor(layout, host, entry.path, content);
      if (markerAction) actions.push(markerAction);
    }
  }

  // The audit FILE. Created here and chowned to the service user because §3's pairing —
  // root-owned directory, service-user-owned file — is what makes the trail append-only in
  // the filesystem rather than by convention: unlink and rename are permissions on the
  // DIRECTORY. A root-owned directory the daemon could not create a file in would mean no
  // log at all, so the provisioner creates it, once, and NEVER rewrites it afterwards: its
  // content is the record, and a "drifted" audit log is a working one.
  const auditObserved = host.entries[layout.auditFile];
  const auditMode = resolveMode(layout, 'auditFile');
  if (!auditObserved || metadataDrift(auditObserved, auditMode)) {
    actions.push({
      kind: 'file',
      phase: 'tree',
      path: layout.auditFile,
      disposition: auditObserved ? 'metadata' : 'create',
      content: { source: 'literal', body: '' },
      ...auditMode,
      reason:
        `the audit directory is root-owned so the daemon cannot unlink or rename its own ` +
        `log; the file inside it must therefore be created and chowned by the provisioner`,
    });
  }

  return actions;
}

/**
 * The marker action for one root, or null when the root already declares itself correctly.
 * Throws per §5 when the root holds data and does not say it is ours.
 */
function markerActionFor(
  layout: InstanceLayout,
  host: HostState,
  root: string,
  content: string,
): Action | null {
  {
    const path = markerPath(root);
    const observed = host.entries[path];
    const rootObserved = host.entries[root];

    // §5, the refusal that matters: a root that exists, holds something, and does not say
    // it is ours. Refused, never adopted and never overwritten — a path is a claim, and a
    // marker is the directory itself saying whose it is.
    if (rootObserved && rootObserved.empty === false) {
      const found = observed?.content?.trim();
      if (found !== layout.instance) {
        throw new Error(
          `plan(${layout.instance}): '${root}' already holds data and does not declare ` +
            `itself instance ` +
            `'${layout.instance}' (found: ${found ? `'${found}'` : 'no marker'}). This ` +
            `instance would be provisioned on top of another one's tree. Nothing was ` +
            `planned — check the declaration's roots, or mark the directory by hand if it ` +
            `really is this museum's.`,
        );
      }
    }

    if (observed?.content === content && !metadataDrift(observed, MARKER_MODE)) return null;
    return {
      kind: 'file',
      phase: 'tree',
      path,
      disposition: observed ? (observed.content === content ? 'metadata' : 'rewrite') : 'create',
      content: { source: 'literal', body: content },
      mode: MARKER_MODE.mode,
      owner: MARKER_MODE.owner,
      group: MARKER_MODE.group,
      modeKey: null,
      reason: `'${root}' must declare itself instance '${layout.instance}' before the daemon boots`,
    };
  }
}


function dirAction(layout: InstanceLayout, host: HostState, entry: TreeEntry): DirAction | null {
  const expected = resolveMode(layout, entry.modeKey);
  const observed = host.entries[entry.path];

  if (observed && observed.type !== 'dir') {
    throw new Error(
      `plan(${layout.instance}): ${entry.what} must be a directory at '${entry.path}', and ` +
        `the host has a ` +
        `${observed.type} there. Removing it is destructive and is not this tool's ` +
        `decision. Nothing was planned.`,
    );
  }

  const changes: DirChange[] = [];
  if (!observed) changes.push('create');
  if (observed && (observed.owner !== expected.owner || observed.group !== expected.group)) {
    changes.push('owner');
  }
  if (observed && (observed.mode ?? -1) !== expected.mode) changes.push('mode');
  if (changes.length === 0) return null;

  return {
    kind: 'dir',
    phase: 'tree',
    path: entry.path,
    ...expected,
    changes,
    reason: `${entry.what} must be ${expected.owner}:${expected.group} ${octal(expected.mode)}`,
  };
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Phase 3 — the served links
 * ──────────────────────────────────────────────────────────────────────────────────── */

function linkActions(layout: InstanceLayout, host: HostState): Action[] {
  const actions: Action[] = [];

  for (const site of layout.sites) {
    for (const surface of SURFACES) {
      const path = site.linkPath(surface);
      const observed = host.entries[path];

      // An existing link is the daemon's published state and is left exactly as it is,
      // whatever it points at. Re-pointing it would roll a museum's live site back to an
      // empty placeholder, silently, because a declaration was re-applied.
      if (observed?.type === 'symlink') continue;

      if (observed) {
        throw new Error(
          `plan(${layout.instance}): site '${site.slug}'s ${surface} document root ` +
            `'${path}' is a ` +
            `${observed.type} on this host and must be a symlink — publishing swaps it with ` +
            `an atomic rename, which cannot replace a directory. Nothing was planned.`,
        );
      }

      actions.push({
        kind: 'symlink',
        phase: 'link',
        path,
        target: relative(site.webspace, site.releasesDir(surface)),
        // §3's symlink row: the service user's, group-owned by the web server's group. The
        // link and its target share an owner so Apache's SymLinksIfOwnerMatch follows it.
        owner: layout.identity.user,
        group: layout.identity.webGroup,
        reason:
          `the ${surface} vhost's DocumentRoot must exist before the web server is ` +
          `reloaded; until the first publish it points at the empty release store`,
      });
    }
  }

  return actions;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Phase 4 — credentials
 * ──────────────────────────────────────────────────────────────────────────────────── */

interface CredentialFile {
  readonly path: string;
  readonly what: string;
  /** Can the provisioner produce this file, or must a human place it? */
  readonly mintable: boolean;
}

/**
 * EVERY CREDENTIAL FILE THIS DECLARATION NAMES — from all three places it can name one.
 *
 * They are gathered in one function because they get one treatment: the file must EXIST
 * (systemd fails a unit whose `LoadCredential=` source is missing, and nginx answers 500
 * for every preprod request when its `auth_basic_user_file` is not there), and its mode
 * The paths come from `credentialSources(layout)` — the same map `render/unit.ts` renders
 * `LoadCredential=` from and `render/engine_fragment.ts` quotes to the operator — so the file
 * this plan mints is the file the daemon is handed and the file an operator is told to read.
 *
 * The mode must be 0600 root:root WHEN THE PROVISIONER OWNS THE PLACE IT SITS. A credential the
 * declaration puts somewhere else on the host is the operator's placement, and this tool
 * does not chown files outside the directories it derives.
 */
function credentialFiles(layout: InstanceLayout): CredentialFile[] {
  const files: CredentialFile[] = [];
  const seen = new Set<string>();
  const add = (path: string, what: string, mintable: boolean) => {
    if (seen.has(path)) return;
    seen.add(path);
    files.push({ path, what, mintable });
  };

  // THE SHARED BEARER. Its path is the same expression `render/engine_fragment.ts` uses —
  // the declaration's own `secrets.SERVICE_TOKEN` if it names one, else the provisioner's
  // canonical place for that key — so the file the fragment tells an operator to `cat` is
  // the file this plan mints. Two spellings of that path would be a pairing that cannot be
  // completed, with both sides looking correct.
  const sources = credentialSources(layout);
  add(
    sources[SERVICE_TOKEN_KEY] as string,
    `the shared bearer '${SERVICE_TOKEN_KEY}' the engine authenticates with`,
    true,
  );

  for (const [key, path] of Object.entries(layout.secrets)) {
    add(path, `the declared credential '${key}'`, false);
  }

  // The Publication API key: the rendered env carries its PATH (`PUBLICATION_API_KEY_FILE`),
  // never its value, so the file has to be there for the daemon to have a key at all.
  const apiKeyFile = sources[PUBLICATION_API_KEY_KEY];
  if (apiKeyFile) add(apiKeyFile, "the Publication API key", false);

  for (const user of preprodUsers(layout)) {
    add(user.password_file, `preprod reviewer '${user.name}'s password`, false);
  }

  return files;
}

function preprodUsers(layout: InstanceLayout): readonly ManifestPreprodUser[] {
  return layout.serving.preprod.auth.users ?? [];
}

function secretActions(layout: InstanceLayout, host: HostState): Action[] {
  const actions: Action[] = [];
  const secretMode = resolveMode(layout, 'secret');

  for (const file of credentialFiles(layout)) {
    const observed = host.entries[file.path];
    // The provisioner asserts a mode only inside the directory it owns. Elsewhere the
    // placement is the operator's and re-chowning somebody else's file to root:root 0600
    // would break whatever else on the host was reading it.
    const ours = isStrictlyWithin(file.path, layout.secretsDir);

    if (!observed) {
      if (file.mintable) {
        actions.push({
          kind: 'file',
          phase: 'secret',
          path: file.path,
          disposition: 'create',
          content: { source: 'random', bytes: SERVICE_TOKEN_BYTES, encoding: 'base64url' },
          ...secretMode,
          reason:
            `${file.what} does not exist yet; apply mints ${SERVICE_TOKEN_BYTES} random ` +
            `bytes into it and prints nothing`,
        });
      } else {
        actions.push({
          kind: 'file',
          phase: 'secret',
          path: file.path,
          disposition: 'awaiting',
          content: { source: 'operator' },
          ...secretMode,
          reason:
            `${file.what} must be placed by an operator — the provisioner cannot invent a ` +
            `credential, and the unit will not start until this file exists`,
        });
      }
      continue;
    }

    // A CREDENTIAL IS NEVER REWRITTEN. Not when it looks wrong, not when it is empty, not
    // when the declaration changed: the value is the museum's, this tool does not hold it,
    // and rotating one is a deliberate operator act. Only the metadata is re-asserted.
    if (ours && metadataDrift(observed, secretMode)) {
      actions.push({
        kind: 'file',
        phase: 'secret',
        path: file.path,
        disposition: 'metadata',
        content: { source: 'operator' },
        ...secretMode,
        reason:
          `${file.what} must be ${secretMode.owner}:${secretMode.group} ` +
          `${octal(secretMode.mode)} — that is what makes LoadCredential worth anything`,
      });
    }
  }

  return actions;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Phase 5 — the rendered artifacts, and the one generated file no renderer can produce
 * ──────────────────────────────────────────────────────────────────────────────────── */

function artifactActions(
  layout: InstanceLayout,
  manifest: InstanceManifest,
  host: HostState,
): Action[] {
  const actions: Action[] = [];

  for (const rendered of renderAll(layout, manifest)) {
    const observed = host.entries[rendered.path];
    const expected = { mode: rendered.mode, owner: rendered.owner, group: rendered.group };

    if (!observed) {
      actions.push(artifactFile(rendered, 'create', undefined, `it is not on this host yet`));
      continue;
    }

    const current = observed.content ?? '';
    if (current !== rendered.body) {
      const drift = classifyDrift(current, layout.instance);
      actions.push(artifactFile(rendered, 'rewrite', drift, driftReason(drift)));
      continue;
    }

    if (metadataDrift(observed, expected)) {
      actions.push(
        artifactFile(
          rendered,
          'metadata',
          undefined,
          `its bytes are current and its access is not: it must be ${rendered.owner}:` +
            `${rendered.group} ${octal(rendered.mode)}`,
        ),
      );
    }
  }

  return actions;
}

function artifactFile(
  rendered: Artifact,
  disposition: FileDisposition,
  drift: DriftKind | undefined,
  reason: string,
): FileAction {
  return {
    kind: 'file',
    phase: 'artifact',
    path: rendered.path,
    disposition,
    content: { source: 'literal', body: rendered.body },
    mode: rendered.mode,
    owner: rendered.owner,
    group: rendered.group,
    modeKey: rendered.modeKey,
    artifactKind: rendered.kind,
    ...(drift ? { drift } : {}),
    reason,
  };
}

/**
 * WHY THE FILE ON THE HOST IS NOT THE FILE WE RENDER — reported by name, because §4 says a
 * run that reverts a hand edit must SAY SO. An artifact that survives a re-render is a
 * second source of truth, and one that is silently reverted is a second source of truth
 * that will win on the day nobody is watching.
 */
function classifyDrift(current: string, instance: string): DriftKind {
  const parsed = parseStamp(current);
  if (!parsed) return 'unstamped';
  if (parsed.instance !== instance) return 'foreign';
  if (hasDrifted(current)) return 'hand_edited';
  return 'stale';
}

function driftReason(drift: DriftKind): string {
  switch (drift) {
    case 'hand_edited':
      return `it was edited in place — the edit is REVERTED; change instance.json instead`;
    case 'unstamped':
      return `it carries no provisioner stamp: the file was replaced wholesale`;
    case 'foreign':
      return `it is stamped for ANOTHER instance — one museum's file in this one's path`;
    case 'stale':
      return `the declaration renders different bytes today`;
    default: {
      const unreachable: never = drift;
      throw new Error(`plan: unknown drift kind '${String(unreachable)}'`);
    }
  }
}

/**
 * THE PREPROD PASSWORD FILE — the one generated artifact that is not a rendered one.
 *
 * It cannot be: its content is a bcrypt of a password held in a root-owned 0600 file, plus
 * a random salt. A pure renderer can neither read the one nor draw the other, so the plan
 * carries the RECIPE (the login names and the files their passwords live in) and apply
 * hashes. No password and no hash is ever in this list.
 *
 * WHEN IT IS REWRITTEN, and why the answer is not "always". A bcrypt is salted, so
 * regenerating produces different bytes every time: an unconditional rewrite would report
 * drift on every run forever and would re-hash a museum's credential nightly. Two
 * secret-free signals decide instead — the SET OF LOGIN NAMES on the file (a name is
 * already in the declaration, so observing one leaks nothing), and whether a password file
 * is NEWER than the htpasswd, which is what an operator rotating a password looks like from
 * the outside.
 */
function htpasswdActions(layout: InstanceLayout, host: HostState): Action[] {
  const preprod = layout.serving.preprod;
  if (!preprod.enabled || preprod.auth.mode !== 'htpasswd') return [];

  const path = layout.htpasswd;
  const observed = host.entries[path];
  const expected = resolveMode(layout, 'htpasswd');
  const users = preprodUsers(layout);

  // An adopted declaration may pin an EXISTING htpasswd and declare no users at all (the
  // schema permits exactly that pairing and no other). That file is the operator's: the
  // provisioner requires it to exist — nginx answers 500 for every preprod request without
  // it — re-asserts the access the web server needs, and writes no content into it.
  if (users.length === 0) {
    if (!observed) {
      return [
        {
          kind: 'file',
          phase: 'artifact',
          path,
          disposition: 'awaiting',
          content: { source: 'operator' },
          ...expected,
          reason:
            `the declaration pins this password file and declares no reviewers, so it is ` +
            `the operator's to create; preprod answers 500 for every request until it exists`,
        },
      ];
    }
    return metadataDrift(observed, expected)
      ? [
          {
            kind: 'file',
            phase: 'artifact',
            path,
            disposition: 'metadata',
            content: { source: 'operator' },
            ...expected,
            reason: `the web server reads it as group '${expected.group}' and cannot today`,
          },
        ]
      : [];
  }

  // Every password must be on disk before a hash can be made of it. When one is missing the
  // `awaiting` action from the credential phase is the plan's statement about it, and no
  // htpasswd action is emitted: a recipe apply cannot follow is not a plan.
  const missing = users.filter(user => !host.entries[user.password_file]);
  if (missing.length > 0) return [];

  const recipe: FileContent = {
    source: 'htpasswd',
    users: users.map(user => ({ name: user.name, passwordFile: user.password_file })),
  };

  if (!observed) {
    return [
      {
        kind: 'file',
        phase: 'artifact',
        path,
        disposition: 'create',
        content: recipe,
        ...expected,
        reason: `preprod is served behind Basic auth and this museum has no password file yet`,
      },
    ];
  }

  const declared = users.map(user => user.name).sort();
  const present = [...(host.htpasswdUsers ?? [])].sort();
  const namesDiffer =
    declared.length !== present.length || declared.some((name, index) => name !== present[index]);
  const rotated = users.some(user => isNewer(host.entries[user.password_file], observed));

  if (namesDiffer || rotated) {
    return [
      {
        kind: 'file',
        phase: 'artifact',
        path,
        disposition: 'rewrite',
        content: recipe,
        ...expected,
        reason: namesDiffer
          ? `the declared reviewers (${declared.join(', ')}) are not the ones on the file`
          : `a reviewer's password file is newer than the hash on disk — it was rotated`,
      },
    ];
  }

  return metadataDrift(observed, expected)
    ? [
        {
          kind: 'file',
          phase: 'artifact',
          path,
          disposition: 'metadata',
          content: recipe,
          ...expected,
          reason: `the web server reads it as group '${expected.group}' and cannot today`,
        },
      ]
    : [];
}

function isNewer(source: PathObservation | undefined, target: PathObservation): boolean {
  if (source?.mtimeMs === undefined || target.mtimeMs === undefined) return false;
  return source.mtimeMs > target.mtimeMs;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Phase 6 — systemd
 * ──────────────────────────────────────────────────────────────────────────────────── */

function serviceActions(layout: InstanceLayout, host: HostState, planned: Action[]): Action[] {
  const actions: Action[] = [];
  const unitWritten = wroteFile(planned, layout.unitPath);
  const envWritten = wroteFile(planned, layout.envFile);

  // ONLY WHEN A UNIT ACTUALLY CHANGED. `daemon-reload` re-reads every unit on the host and
  // is not free; issuing it unconditionally would also make every run of this tool look
  // like it did something, which is the property that teaches an operator to stop reading
  // the output.
  if (unitWritten) {
    actions.push({
      kind: 'exec',
      phase: 'service',
      step: 'daemon_reload',
      argv: ['systemctl', 'daemon-reload'],
      reason: `'${layout.unitName}' changed on disk and systemd is still holding the old one`,
    });
  }

  if (!host.unitEnabled) {
    actions.push({
      kind: 'exec',
      phase: 'service',
      step: 'unit_enable',
      argv: ['systemctl', 'enable', layout.unitName],
      reason: `the museum's daemon must come back after a reboot`,
    });
  }

  if (!host.unitActive) {
    actions.push({
      kind: 'exec',
      phase: 'service',
      step: 'unit_start',
      argv: ['systemctl', 'start', layout.unitName],
      reason: `'${layout.unitName}' is not running`,
    });
  } else if (unitWritten || envWritten) {
    // The daemon parses its whole environment ONCE, at import (`src/config.ts`), so a
    // rewritten env reaches a running process only through a restart. Stated as its own
    // action, with its own reason, because restarting a museum's daemon interrupts whatever
    // agent session is open and an operator is entitled to see that in `check` first.
    actions.push({
      kind: 'exec',
      phase: 'service',
      step: 'unit_restart',
      argv: ['systemctl', 'restart', layout.unitName],
      reason: unitWritten
        ? `the unit changed and the running daemon is still the old one`
        : `the rendered env changed and the daemon reads it once, at start`,
    });
  }

  return actions;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Phase 7 — the web server
 * ──────────────────────────────────────────────────────────────────────────────────── */

function webActions(layout: InstanceLayout, host: HostState, planned: Action[]): Action[] {
  const vhostKinds: ArtifactKind[] = ['nginx_vhost', 'apache_vhost'];
  const changed = planned.some(
    action =>
      action.kind === 'file' &&
      action.artifactKind !== undefined &&
      vhostKinds.includes(action.artifactKind) &&
      action.disposition !== 'awaiting',
  );
  if (!changed) return [];

  const unit = host.webServerUnit ?? DEFAULT_WEB_UNITS[layout.webServer];
  const configtest: readonly string[] =
    layout.webServer === 'apache' ? ['apachectl', 'configtest'] : ['nginx', '-t'];

  return [
    {
      kind: 'exec',
      phase: 'web',
      step: 'web_configtest',
      argv: configtest,
      // The reason IS the design: one bad vhost does not take down one site, it takes down
      // every site the web server serves — this museum's and every other museum's on the
      // box. Every exec is fatal, and this one stands immediately before the reload, so an
      // apply that halts on failure cannot reload a configuration that does not parse.
      reason: `a vhost changed, and one bad file takes down every site on this host`,
    },
    {
      kind: 'exec',
      phase: 'web',
      step: 'web_reload',
      argv: ['systemctl', 'reload', unit],
      reason: `the changed vhosts are not being served until '${unit}' re-reads them`,
    },
  ];
}

function wroteFile(planned: readonly Action[], path: string): boolean {
  return planned.some(
    action =>
      action.kind === 'file' &&
      action.path === path &&
      (action.disposition === 'create' || action.disposition === 'rewrite'),
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * describe()
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * ONE LINE AN OPERATOR READS BEFORE ANY OF THIS RUNS AS ROOT.
 *
 * It prints WHAT and WHY and never a byte of content. Not the token it is about to mint,
 * not the password behind a hash, not the body of a rendered artifact — a `check` report
 * is pasted into tickets, and the only reliable way to keep a credential out of one is for
 * no function to be able to put it there.
 */
export function describe(action: Action): string {
  switch (action.kind) {
    case 'group':
      return `group   create ${action.name} (system) — ${action.reason}`;
    case 'user':
      return (
        `user    create ${action.name} (system, primary group ${action.group}, ` +
        `home ${action.home}, shell ${action.shell}) — ${action.reason}`
      );
    case 'dir':
      return (
        `dir     ${action.changes.join('+')} ${action.path} ` +
        `${action.owner}:${action.group} ${octal(action.mode)} — ${action.reason}`
      );
    case 'file':
      return (
        `file    ${action.disposition} ${action.path} ${action.owner}:${action.group} ` +
        `${octal(action.mode)} [${contentLabel(action.content)}] — ${action.reason}`
      );
    case 'symlink':
      return (
        `link    create ${action.path} -> ${action.target} ` +
        `${action.owner}:${action.group} — ${action.reason}`
      );
    case 'exec':
      return `exec    ${action.argv.join(' ')} — ${action.reason}`;
    default: {
      // Exhaustiveness as a compile error: a seventh kind must be described in the same
      // commit that adds it, not fall through to something an operator cannot read.
      const unreachable: never = action;
      throw new Error(`plan: unknown action kind '${String((unreachable as Action).kind)}'`);
    }
  }
}

/** What a file's bytes ARE, in a word — never what they say. */
function contentLabel(content: FileContent): string {
  switch (content.source) {
    case 'literal':
      return `rendered, ${content.body.length} bytes`;
    case 'random':
      return `${content.bytes} random bytes, ${content.encoding}, never printed`;
    case 'htpasswd':
      return `hashed from ${content.users.map(user => user.passwordFile).join(', ')}`;
    case 'operator':
      return `supplied by an operator`;
    default: {
      const unreachable: never = content;
      throw new Error(`plan: unknown content source '${String(unreachable)}'`);
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The plan checks itself
 *
 * Every property below is one a gate also asserts. It is checked HERE as well because a
 * gate proves it about the declarations a gate happens to hold, and this proves it about
 * the declaration a museum writes tomorrow — on the host, before anything runs as root.
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE PLAN'S OWN SAFETY CHECK — exported so it can be HELD, not merely called.
 *
 * `plan()` runs it on every plan it builds, which is where it belongs. But nothing in the
 * suite could ever hand it a plan that VIOLATES one of these rules: a violating plan cannot
 * come out of `plan()` — that is the point of the function — so every refusal below sat
 * unexecuted, and each could be disarmed with the suite green. These are the guards for
 * never-reuse-a-uid and for the retired installer's defect 3, and they are the only
 * enforcement those properties have.
 *
 * So it is a door: `tests/provision_plan.test.ts` builds a REAL plan and perturbs it in
 * each of the five ways, which is exactly the position this function is in the day a
 * planning rule changes and stops producing a lawful list.
 */
export function assertPlanIsCoherent(actions: readonly Action[], layout: InstanceLayout): void {
  // Every refusal below opens with the instance, because `--all` refuses ONE museum and
  // carries on with the rest: a message that does not say whose plan was rejected is a
  // message an operator cannot act on.
  const who = `plan(${layout.instance})`;
  // 1. THE PHASES NEVER GO BACKWARDS. The whole order is one comparison because every
  //    action carries where it belongs — see PHASES for why the prose version was not
  //    enough.
  let highest = -1;
  for (const action of actions) {
    const rank = PHASE_ORDER[action.phase];
    if (rank === undefined) {
      throw new Error(`${who}: action '${describe(action)}' carries no known phase.`);
    }
    if (rank < highest) {
      throw new Error(
        `${who}: '${describe(action)}' is in phase '${action.phase}', after a later phase had ` +
          `already begun. The order is ${PHASES.join(' → ')} and it is not decorative: a ` +
          `unit started before its writable set exists fails as EROFS on a museum's site.`,
      );
    }
    highest = rank;
  }

  // 2. NO USER WITHOUT A PRIMARY GROUP, AND NEVER BEFORE IT. This is defect 3, made
  //    unwritable rather than fixed.
  const groupsCreatedBy = new Map<string, number>();
  actions.forEach((action, index) => {
    if (action.kind === 'group') groupsCreatedBy.set(action.name, index);
  });
  actions.forEach((action, index) => {
    if (action.kind !== 'user') return;
    if (!action.argv.includes('--gid')) {
      throw new Error(
        `${who}: the useradd for '${action.name}' carries no --gid. Group creation would fall ` +
          `to distro policy while the unit hard-requires Group=${action.group}, which is ` +
          `exactly the trap the retired install.sh fell into. Nothing was planned.`,
      );
    }
    const created = groupsCreatedBy.get(action.group);
    if (created !== undefined && created > index) {
      throw new Error(
        `${who}: user '${action.name}' is created before its primary group '${action.group}'. ` +
          `useradd --gid fails on a group that does not exist yet. Nothing was planned.`,
      );
    }
  });

  // 3. NOTHING DELETES. Not a user, not a group, not a path. A uid freed by a deletion is a
  //    uid the next instance can be handed, and it inherits every file the first one left
  //    behind; a museum's published site must never disappear because a declaration was
  //    re-applied. Removal is an explicit operator verb elsewhere, and it archives.
  const destructive = /^(userdel|groupdel|deluser|delgroup|rm|rmdir|unlink|shred|mkfs)$/;
  for (const action of actions) {
    const argv = 'argv' in action ? action.argv : undefined;
    if (argv && argv[0] && destructive.test(argv[0])) {
      throw new Error(
        `${who}: '${argv.join(' ')}' would delete something. Nothing in a provisioning plan ` +
          `may remove a user, a group or a path — a reused uid inherits the previous ` +
          `instance's files, and a removed site is a museum's site going dark. Nothing was ` +
          `planned.`,
      );
    }
  }

  // 4. A MINTED CREDENTIAL IS ONLY EVER CREATED. Never rewritten, never re-minted: a
  //    rotation is an operator act, and a plan that could roll a token would break the
  //    pairing on both sides of the socket at once.
  for (const action of actions) {
    if (action.kind !== 'file') continue;
    if (action.content.source === 'random' && action.disposition !== 'create') {
      throw new Error(
        `${who}: '${action.path}' would be ${action.disposition}n with fresh random bytes. A ` +
          `credential is minted once, when it is absent, and never again. Nothing was planned.`,
      );
    }
    if (action.disposition === 'awaiting' && action.content.source !== 'operator') {
      throw new Error(
        `${who}: '${action.path}' is marked awaiting but carries content the provisioner could ` +
          `write. Nothing was planned.`,
      );
    }
  }

  // 5. THE RELOAD IS GATED BY ITS CONFIGTEST — by ORDER, which is the only mechanism that
  //    survives an apply that knows nothing about web servers.
  const configtest = actions.findIndex(a => a.kind === 'exec' && a.step === 'web_configtest');
  const reload = actions.findIndex(a => a.kind === 'exec' && a.step === 'web_reload');
  if (reload !== -1 && (configtest === -1 || configtest > reload)) {
    throw new Error(
      `${who}: the web server would be reloaded without a passing configuration test in front ` +
        `of it. One bad vhost takes down every site on this host. Nothing was planned.`,
    );
  }

  // 6. EVERY PATH IS ABSOLUTE and belongs to this instance's derived world. A relative path
  //    would be resolved against whatever directory the operator happened to be in.
  for (const action of actions) {
    const path = 'path' in action ? action.path : undefined;
    if (path !== undefined && !path.startsWith('/')) {
      throw new Error(
        `${who}: '${path}' is not absolute. Every path comes from derive(); a relative one ` +
          `means this module spelled it itself. Nothing was planned.`,
      );
    }
  }

}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Small shared helpers
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE MATRIX ROW, RESOLVED TO NAMES a `chown` can take.
 *
 * `render/types.ts` performs the identical resolution for artifacts and keeps it private,
 * so this is a second copy of two lines, and it is the one duplication in this file. The
 * right home is an exported helper on `render/types.ts` beside the matrix itself; until
 * that exists, `tests/provision_plan.test.ts` asserts the two agree on EVERY rendered
 * artifact — so the copies cannot drift silently, which is the property that matters.
 *
 * The resolution is an INDEX rather than a switch on purpose: `MODES`'s group vocabulary
 * ('group', 'webGroup', 'engineGroup') is spelled exactly like `layout.identity`'s fields,
 * so 'root' is the only case, and a fifth group added to the matrix resolves here without
 * an edit or silently fails to compile — never resolving to root by a fall-through.
 */
function resolveMode(
  layout: InstanceLayout,
  key: ModeKey,
): { mode: number; owner: string; group: string; modeKey: ModeKey } {
  const row = MODES[key];
  return {
    mode: row.mode,
    owner: row.owner === 'root' ? 'root' : layout.identity.user,
    group: row.group === 'root' ? 'root' : layout.identity[row.group],
    modeKey: key,
  };
}

/**
 * Does what the host has disagree with what §3 says it must be?
 *
 * An UNOBSERVED field counts as drift. See `PathObservation`: these numbers are the
 * isolation model, and "I did not look" must never be recorded as "it was correct".
 */
function metadataDrift(
  observed: PathObservation,
  expected: { mode: number; owner: string; group: string },
): boolean {
  return (
    observed.owner !== expected.owner ||
    observed.group !== expected.group ||
    (observed.mode ?? -1) !== expected.mode
  );
}

/** A mode as an operator writes it: four digits, setgid included. */
function octal(mode: number): string {
  return mode.toString(8).padStart(4, '0');
}
