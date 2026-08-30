/**
 * DECOMMISSIONING A TENANCY — the one verb in this subsystem that takes things away, built
 * so that it can only ever take away less than it looks like it does.
 *
 * A museum ends its tenancy. Its daemon must stop, its unit must go, its vhosts must stop
 * being served, and the host must stop being told that this instance exists. What must NOT
 * happen — under any flag, in any order, on any host — is that a museum's cultural material
 * ceases to exist because an operator typed a command with the wrong name after it.
 *
 * The design follows from that, and every part of it is a refusal to do the easy thing:
 *
 *   1. IT REFUSES BY DEFAULT WHILE A SITE IS PUBLISHED. Taking a museum's public website off
 *      the internet is an explicit act, never a side effect of retiring a daemon.
 *      `--purge-published` is how someone says they meant it, and even then:
 *   2. IT ARCHIVES; IT NEVER DELETES. Every tree with a museum's bytes in it is RENAMED
 *      beside itself as `<path>.retired-<utc>`. A rename is atomic, reversible by hand, and
 *      keeps the ownership and modes of everything inside — so a decommission that turns out
 *      to have been a mistake is undone with `mv`, by an operator who is not this program.
 *   3. IT DELETES ONLY WHAT IT WROTE, AND ONLY WHEN IT CAN PROVE IT WROTE IT. The generated
 *      artifacts carry a body-hash stamp naming their instance; a file at one of those paths
 *      whose stamp is absent, unreadable, or names ANOTHER instance is left exactly where it
 *      is and reported. That is the difference between removing an instance's unit and
 *      removing whatever happened to be at the path an instance's unit would have.
 *   4. IT NEVER FREES A UID. The account is locked, not deleted, and neither is the group.
 *      Every archived byte above is owned by a NUMBER; deleting the user returns that number
 *      to the pool the next `useradd` draws from, and the next museum on this host would
 *      inherit the last one's files by accident. It is also why the instance NAME stays
 *      retired — the identity is derived from it.
 *
 * ── THE SAME SHAPE AS THE REST OF THE PHASE ─────────────────────────────────────────────
 *
 * `removalPlan()` is PURE: `(layout, artifacts, host, at) => RemovalStep[]`. Which files are
 * ours, what is archived where, and the order of the whole thing are properties of an array
 * a gate can read without a host to decommission. `applyRemoval()` is DUMB and decides
 * nothing. The reason is the one `plan.ts` gives at length and which is sharper here: this
 * is the destructive verb, and a destructive verb whose behaviour can only be observed by
 * running it as root is a verb nobody can review.
 *
 * The artifact CENSUS is not kept here. It is `renderAll()`'s — the caller hands it the
 * artifacts, so the set of files removal knows about is the set the provisioner writes, by
 * construction rather than by a list somebody maintains. A second census of the artifacts is
 * the subsystem's defect #3 and it would fail in the worst possible direction here: a file
 * this list forgot is a museum's vhost left serving after its tenancy ended.
 */

import { unlinkSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

import type { AdoptIo } from './adopt';
import { parseStamp } from './hash';
import {
  AUDIT_FILE_NAME,
  SURFACES,
  credentialSources,
  releaseNameFromLinkTarget,
  surfacePaths,
  type InstanceLayout,
} from './layout';
import type { Artifact } from './render';

/* ────────────────────────────────────────────────────────────────────────────────────
 * What removal may know about the host
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * The observed facts removal reasons about. Injected for the same reason `HostState` is: the
 * ORDER and the refusals are properties of a value, and a gate must be able to build one.
 */
export interface RemovalHost {
  /** Absolute path → its current bytes, for the artifact paths only. Absent means absent. */
  readonly artifactBodies: Readonly<Record<string, string>>;
  /** Absolute path → does something stand here. Every archivable tree, and nothing else. */
  readonly present: Readonly<Record<string, boolean>>;
  /**
   * Absolute path → what the symlink there points at, VERBATIM, or null for anything that
   * is not a symlink (absent included). Read for the enabling links alone.
   *
   * A link carries no stamp, so the proof that one is ours is its TARGET: it names a vhost
   * file this declaration renders, and that file's own stamp is what proves the pair. That
   * is why the target is observed rather than the mere existence of the path — a link at
   * our filename pointing at somebody else's configuration is not ours to unlink.
   */
  readonly links: Readonly<Record<string, string | null>>;
  /**
   * Absolute root → the instance name its `.dedalo_site_instance` marker declares, or null
   * when it carries none. Observed for every tree this removal could archive.
   *
   * THE DERIVED SET IS NOT PROOF OF OWNERSHIP. A declaration that collides with a live
   * museum derives that museum's paths — same webspace, same roots — so a coherence check
   * that only asks "is this path inside MY derived set" says yes about somebody else's
   * serving tree, and the removal archives the victim instead of the offender. The marker
   * is the tree itself saying whose it is, and it is the only thing that can tell the two
   * declarations apart.
   */
  readonly claims: Readonly<Record<string, string | null>>;
}

/**
 * WHAT A FAILING COMMAND MEANS — stated per step, because the two answers are opposite and
 * "it printed a non-zero status" cannot tell them apart.
 *
 * `tolerate` is for the systemd verbs: `systemctl stop` on a unit that is already stopped,
 * `disable` on one that was never installed, report non-zero, and that is the NORMAL answer
 * on a host where a previous decommission got half way. `stop` is for everything else, and
 * the case that made this a field rather than a rule is the web-server configuration test:
 * downgrading a failed `nginx -t` to "skipped" let a removal reload a configuration that
 * does not parse — taking down every OTHER museum on the host — and then report
 * "decommissioned" and exit 0.
 */
export type ExecFailure = 'tolerate' | 'stop';

/** One step of a removal. */
export type RemovalStep =
  | {
      readonly kind: 'exec';
      readonly what: string;
      readonly argv: readonly string[];
      /** What a non-zero status means for THIS command. See `ExecFailure`. */
      readonly onFailure: ExecFailure;
    }
  /** A generated artifact this instance is proved to own. */
  | { readonly kind: 'unlink'; readonly path: string; readonly what: string }
  /** A tree or a file renamed beside itself. The bytes stay on this disk. */
  | { readonly kind: 'archive'; readonly from: string; readonly to: string; readonly what: string }
  /** A path removal deliberately LEFT ALONE, and why. Changes nothing; reported. */
  | { readonly kind: 'left'; readonly path: string; readonly why: string };

/** Does this step change the host at all? False for `left`, which is a notice. */
export function changesTheHost(step: RemovalStep): boolean {
  return step.kind !== 'left';
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The archive suffix
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * `<path>.retired-<utc>` — the one spelling of an archived name.
 *
 * A COMPACT UTC INSTANT, seconds included and no punctuation a shell has an opinion about:
 * `20260830T114500Z`. Two removals of the same instance a year apart therefore do not
 * collide, and `ls` sorts them chronologically. The instant is passed IN rather than read
 * from a clock, because `removalPlan()` is pure — and because every path of one run must
 * carry the SAME instant, or an operator restoring an instance would have to match trees by
 * eye across three different timestamps.
 */
export function retiredName(path: string, at: Date): string {
  const stamp = at.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${path}.retired-${stamp}`;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The plan
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * EVERYTHING A DECOMMISSION DOES, IN ORDER.
 *
 * The order is the safety argument and is asserted by `assertRemovalIsCoherent()`:
 *
 *   1. STOP the daemon, then DISABLE it, then reload systemd. Stopping first is what lets a
 *      running agent turn finish its own shutdown; disabling a still-running unit would
 *      leave a daemon alive with nothing on the host describing it.
 *   2. UNLINK the generated artifacts we can prove are ours — the unit, the env, the site
 *      table, the pairing fragment, every vhost — and the per-instance htpasswd. Only after
 *      the daemon is stopped: removing a unit's env file underneath a running service is how
 *      a restart becomes a boot failure nobody can explain.
 *   3. RELOAD the web server, so the removed vhosts stop being served. After the unlinks and
 *      never before, and gated by a configtest exactly as `plan()` gates its own reload: one
 *      bad configuration takes down every OTHER museum on this host too.
 *   4. ARCHIVE the trees: each webspace (which is where the release stores live), the
 *      workspaces root, the agent HOME, and the audit FILE. Last, because everything above
 *      is reversible by re-running `provision apply` and this is the step that moves a
 *      museum's bytes.
 *   5. LOCK the account, and keep it. Never `userdel`, never `groupdel`.
 */
export function removalPlan(
  layout: InstanceLayout,
  artifacts: readonly Artifact[],
  host: RemovalHost,
  at: Date,
  options: { readonly webServerUnit?: string } = {},
): RemovalStep[] {
  const steps: RemovalStep[] = [];

  /* 1 — the daemon. */
  // TOLERANT: a unit already stopped, already disabled, or never installed reports non-zero,
  // and that is the normal answer on a host where a previous decommission got half way.
  steps.push({
    kind: 'exec',
    what: `stop ${layout.unitName}`,
    argv: ['systemctl', 'stop', layout.unitName],
    onFailure: 'tolerate',
  });
  steps.push({
    kind: 'exec',
    what: `disable ${layout.unitName}`,
    argv: ['systemctl', 'disable', layout.unitName],
    onFailure: 'tolerate',
  });
  steps.push({
    kind: 'exec',
    what: 'reload systemd',
    argv: ['systemctl', 'daemon-reload'],
    onFailure: 'tolerate',
  });

  /* 2 — DISABLE FIRST, then the artifacts. The order is not cosmetic: a link in
   *     `sites-enabled/` whose vhost has just been unlinked is a dangling include, and the
   *     configtest three steps below would fail on it — leaving this museum's tenancy
   *     half-removed AND every other museum on the host one reload away from an outage. So
   *     the museum stops being served first, and only then does its configuration go. */
  const disableSteps = disabledVhosts(layout, host);
  steps.push(...disableSteps);

  const artifactSteps = removableArtifacts(layout, artifacts, host);
  steps.push(...artifactSteps);
  const removedAVhost =
    artifactSteps.some(step => step.kind === 'unlink' && step.what.endsWith('_vhost')) ||
    disableSteps.some(step => step.kind === 'unlink');

  // The htpasswd is generated by `plan()` rather than by a renderer, so it carries no stamp
  // and cannot be proved ours the way an artifact can. It is removed only when it sits in
  // the directory this instance owns — an adopted layout may pin it somewhere the host was
  // already keeping it, and that placement is the operator's.
  if (host.present[layout.htpasswd] && dirname(layout.htpasswd) === layout.configDir) {
    steps.push({ kind: 'unlink', path: layout.htpasswd, what: "the instance's preprod password file" });
  } else if (host.present[layout.htpasswd]) {
    steps.push({
      kind: 'left',
      path: layout.htpasswd,
      why: 'it lives outside the instance config directory — an adopted placement is the operator’s',
    });
  }

  /* 3 — the web server, gated by its own configtest. */
  if (removedAVhost) {
    const unit = options.webServerUnit ?? (layout.webServer === 'apache' ? 'apache2' : 'nginx');
    // FATAL, both of them. A configtest that fails means the configuration this removal just
    // produced does not parse; reloading anyway takes down every site on the host, and
    // continuing past it would go on to archive a museum's trees and lock its account while
    // reporting the run a success.
    steps.push({
      kind: 'exec',
      what: `check the ${layout.webServer} configuration before reloading it`,
      argv: layout.webServer === 'apache' ? ['apachectl', '-t'] : ['nginx', '-t'],
      onFailure: 'stop',
    });
    steps.push({
      kind: 'exec',
      what: `reload ${unit}`,
      argv: ['systemctl', 'reload', unit],
      onFailure: 'stop',
    });
  }

  /* 4 — the bytes. Archived, never deleted. */
  for (const site of layout.sites) {
    steps.push(
      archiveOrNote(host, site.webspace, at, `site '${site.slug}'s webspace, release stores included`, layout.instance),
    );
  }
  steps.push(archiveOrNote(host, layout.roots.workspaces, at, 'the workspaces root', layout.instance));
  steps.push(archiveOrNote(host, layout.roots.home, at, "the agent's HOME", layout.instance));
  steps.push(archiveOrNote(host, layout.auditFile, at, `the audit trail (${AUDIT_FILE_NAME})`, layout.instance, layout.roots.audit));

  /* 4b — THE CREDENTIALS, NAMED. Every one of them is still on this host after this run:
   *      the declaration is left (the operator decides), and `secrets/` sits inside the
   *      directory that holds it. That is the right default — a museum's bearer and its
   *      provider keys are not this command's to destroy, and the engine on the other side
   *      of the pairing is still holding the same token — but leaving them SILENTLY is how
   *      five live credentials stay on a decommissioned host with nothing anywhere saying
   *      so. So each is a reported step, by path, with what it is. */
  for (const [key, path] of Object.entries(credentialSources(layout))) {
    if (!host.present[path]) continue;
    steps.push({
      kind: 'left',
      path,
      why: `it holds this museum's ${key}, and it is still readable by root on this host — revoke it at the provider and delete it by hand when you are satisfied`,
    });
  }

  /* 5 — the identity, kept. */
  steps.push({
    kind: 'exec',
    what: `lock the account ${layout.identity.user} — it is NOT deleted, and its uid is never reused`,
    argv: ['usermod', '--lock', layout.identity.user],
    // TOLERANT: an account already locked, or one this host never created, is not a reason
    // to report a decommission as failed after every byte has been archived.
    onFailure: 'tolerate',
  });

  assertRemovalIsCoherent(steps, layout);
  return steps.map(step => Object.freeze(step));
}

/**
 * ONE STEP PER GENERATED ARTIFACT: remove it, or say why it was left.
 *
 * The proof is the stamp — a body hash naming the instance that wrote the file — and there
 * are exactly three answers. It is gone already; it is not ours (no readable stamp, or one
 * naming another museum), so it stays and is reported; or it is ours and it goes. There is no
 * fourth, and in particular no "it is at our path so it must be ours": that sentence is how a
 * decommission removes the vhost an operator wrote by hand years before this subsystem
 * existed, or — worse — the one belonging to the museum next door.
 */
function removableArtifacts(
  layout: InstanceLayout,
  artifacts: readonly Artifact[],
  host: RemovalHost,
): RemovalStep[] {
  const ordered = [...artifacts].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return ordered.map((artifact): RemovalStep => {
    const body = host.artifactBodies[artifact.path];
    if (body === undefined) return { kind: 'left', path: artifact.path, why: 'already gone' };

    const parsed = parseStamp(body);
    if (parsed === null) {
      return {
        kind: 'left',
        path: artifact.path,
        why:
          'it carries no readable provisioner stamp. This subsystem removes what it can prove ' +
          'it wrote and nothing else; a hand-written file at a generated path is an operator’s',
      };
    }
    if (parsed.instance !== layout.instance) {
      return {
        kind: 'left',
        path: artifact.path,
        why: `it is stamped for instance '${parsed.instance}', not '${layout.instance}' — removing it would decommission another museum`,
      };
    }
    return { kind: 'unlink', path: artifact.path, what: `the generated ${artifact.kind}` };
  });
}

/**
 * TAKE EVERY VHOST OUT OF THE DIRECTORY THE WEB SERVER READS.
 *
 * `provision apply` enables a museum's vhosts by linking them into `sites-enabled/`;
 * decommissioning has to undo exactly that, or the tenancy ends with its sites still being
 * served by a link into a `sites-available` file that is about to be deleted — which is
 * both "the museum is still on the internet after its tenancy ended" and "the next reload
 * of this host fails for everybody".
 *
 * OURS IS PROVED BY THE TARGET, since a symlink carries no stamp of its own: the link must
 * resolve to the vhost path THIS declaration renders. Anything else at that path — a real
 * file, a link somewhere else, nothing at all — is reported and left, exactly as an
 * unstamped artifact is.
 */
function disabledVhosts(layout: InstanceLayout, host: RemovalHost): RemovalStep[] {
  const steps: RemovalStep[] = [];

  for (const site of layout.sites) {
    for (const surface of SURFACES) {
      const path = site.vhostEnabledPaths[surface];
      const vhost = site.vhostPaths[surface];
      // The `conf.d` shape: the file IS the enabled configuration, and unlinking the
      // artifact below is the whole of disabling it.
      if (path === vhost) continue;

      const target = host.links[path];
      if (target === undefined || target === null) {
        if (host.present[path]) {
          steps.push({
            kind: 'left',
            path,
            why:
              'it is not a symlink. This subsystem enables a vhost with a link and removes ' +
              'only what it can prove it wrote; a COPY of a configuration here is an operator’s',
          });
        }
        continue;
      }
      if (resolve(dirname(path), target) !== vhost) {
        steps.push({
          kind: 'left',
          path,
          why: `it points at '${target}', not at this instance's ${surface} vhost '${vhost}' — unlinking it would disable somebody else's site`,
        });
        continue;
      }
      steps.push({ kind: 'unlink', path, what: `the link enabling site '${site.slug}'s ${surface} vhost` });
    }
  }

  return steps;
}

function archiveOrNote(
  host: RemovalHost,
  path: string,
  at: Date,
  what: string,
  instance: string,
  /**
   * Where the CLAIM lives, when it is not the path itself. A marker is a file inside a
   * directory, so a FILE cannot carry one: the audit trail's ownership is declared by the
   * audit root it sits in.
   */
  claimedBy: string = path,
): RemovalStep {
  if (!host.present[path]) return { kind: 'left', path, why: 'already gone' };
  // Only a tree that DECLARES itself ours may be archived. An unmarked tree is left too:
  // this subsystem has never written an unmarked root, so one here was not put there by
  // this instance, and a removal is the worst possible moment to start guessing.
  const claim = host.claims[claimedBy];
  if (claim !== instance) {
    return {
      kind: 'left',
      path,
      why:
        claim === null || claim === undefined
          ? `${claimedBy === path ? 'it declares' : `its root '${claimedBy}' declares`} no instance — not ours to archive`
          : `${claimedBy === path ? 'it declares' : `its root '${claimedBy}' declares`} ` +
            `instance '${claim}', not '${instance}' — archiving it would retire another ` +
            `museum's tree`,
    };
  }
  return { kind: 'archive', from: path, to: retiredName(path, at), what };
}

/**
 * REFUSE A REMOVAL THAT IS NOT SHAPED LIKE A REMOVAL.
 *
 * The properties are small and they are the ones that would be expensive to get wrong:
 * nothing this plan touches may be a path OUTSIDE the instance's own derived set; a reload
 * may never stand without a configtest immediately before it; and an archive's destination
 * must differ from its source, because a rename onto itself is a silent no-op that would
 * report a museum's tree as archived while it sat exactly where it was.
 */
export function assertRemovalIsCoherent(steps: readonly RemovalStep[], layout: InstanceLayout): void {
  const seen: RemovalStep[] = [];
  for (const step of steps) {
    if (step.kind === 'archive') assertArchiveIsBesideItself(step, layout);
    if (step.kind === 'exec') assertExecIsAllowed(step, seen, layout);
    seen.push(step);
  }
}

/**
 * An archive is a RENAME BESIDE THE ORIGINAL. Onto itself it changes nothing while reporting
 * that a museum's tree was archived; into another directory it can cross a filesystem, and a
 * rename that has to fall back to a copy can half-move a museum's bytes.
 */
function assertArchiveIsBesideItself(step: RemovalStep & { kind: 'archive' }, layout: InstanceLayout): void {
  if (step.to === step.from) {
    throw new Error(
      `remove(${layout.instance}): the archive of '${step.from}' would rename it onto itself, ` +
        `which changes nothing while reporting that a museum's tree was archived. Nothing was ` +
        `planned.`,
    );
  }
  if (dirname(step.to) !== dirname(step.from)) {
    throw new Error(
      `remove(${layout.instance}): '${step.from}' would be archived to '${step.to}', in a ` +
        `different directory. An archive is a rename BESIDE the original so it cannot cross a ` +
        `filesystem and cannot half-copy a museum's bytes. Nothing was planned.`,
    );
  }
}

/**
 * The two commands a removal may never contain: a `userdel` in any form, and a web-server
 * reload with no configuration test immediately in front of it.
 */
function assertExecIsAllowed(
  step: RemovalStep & { kind: 'exec' },
  seen: readonly RemovalStep[],
  layout: InstanceLayout,
): void {
  if (step.argv[0] === 'userdel' || step.argv[0] === 'groupdel') {
    throw new Error(
      `remove(${layout.instance}): a plan may never delete a user or a group. Every archived ` +
        `byte is owned by a uid, and freeing that number hands this museum's files to the next ` +
        `account created on this host. Nothing was planned.`,
    );
  }

  if (!(step.argv[0] === 'systemctl' && step.argv[1] === 'reload')) return;

  const last = seen.filter(entry => entry.kind === 'exec').pop();
  const isConfigtest = last?.kind === 'exec' && (last.argv[0] === 'nginx' || last.argv[0] === 'apachectl');
  if (!isConfigtest) {
    throw new Error(
      `remove(${layout.instance}): a web-server reload is planned with no configuration test ` +
        `immediately before it. One bad configuration takes down every site on this host, this ` +
        `museum's and every other museum's. Nothing was planned.`,
    );
  }
}

/** One step, in the words a report prints. */
export function describeRemoval(step: RemovalStep): string {
  switch (step.kind) {
    case 'exec':
      return `${step.what}: ${step.argv.join(' ')}`;
    case 'unlink':
      return `remove ${step.what} — ${step.path}`;
    case 'archive':
      return `archive ${step.what}: ${step.from} → ${basename(step.to)}`;
    case 'left':
      return `LEFT ALONE ${step.path} — ${step.why}`;
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Executing it
 * ──────────────────────────────────────────────────────────────────────────────────── */

export interface RemovalOutcome {
  readonly step: RemovalStep;
  readonly status: 'done' | 'skipped' | 'failed';
  readonly detail: string;
}

export interface RemovalReport {
  readonly ok: boolean;
  readonly outcomes: readonly RemovalOutcome[];
  /** Every path whose bytes were moved rather than removed — what an operator writes down. */
  readonly archived: readonly { readonly from: string; readonly to: string }[];
  readonly failure: RemovalOutcome | null;
}

/** What executing a removal may do. `unlink` exists here and in no other io in the phase. */
export interface RemovalIo extends AdoptIo {
  unlink(path: string): void;
}

/**
 * RUN THE PLAN, IN ORDER, STOPPING AT THE FIRST FAILURE.
 *
 * A `systemctl` that reports non-zero on a unit that is already stopped or already disabled
 * is SKIPPED and not failed — that is the normal answer on a host where a previous
 * decommission got half way — while anything that touches bytes is fatal, because a removal
 * that continued past a failed archive would go on to lock the account of an instance whose
 * tree is in an unknown state.
 */
export function applyRemoval(steps: readonly RemovalStep[], io: RemovalIo): RemovalReport {
  const outcomes: RemovalOutcome[] = [];
  const archived: { from: string; to: string }[] = [];
  let failure: RemovalOutcome | null = null;

  for (const step of steps) {
    if (failure) {
      outcomes.push({ step, status: 'skipped', detail: 'not reached — an earlier step failed' });
      continue;
    }

    const outcome = carryOut(step, io);
    outcomes.push(outcome);
    if (outcome.status === 'failed') failure = outcome;
    if (outcome.status === 'done' && step.kind === 'archive') archived.push({ from: step.from, to: step.to });
  }

  return Object.freeze({
    ok: failure === null,
    outcomes: Object.freeze(outcomes),
    archived: Object.freeze(archived),
    failure,
  });
}

/** One step. Four kinds, four small answers, and a thrown error is a failure like any other. */
function carryOut(step: RemovalStep, io: RemovalIo): RemovalOutcome {
  try {
    switch (step.kind) {
      case 'left':
        return { step, status: 'skipped', detail: step.why };

      case 'exec': {
        // THE STEP SAYS WHAT ITS OWN FAILURE MEANS (see `ExecFailure`). Every result is
        // reported verbatim either way: silence must not read as success, and a downgraded
        // failure is silence wearing a status word.
        const result = io.exec(step.argv);
        if (result.code === 0) return { step, status: 'done', detail: step.argv.join(' ') };
        return step.onFailure === 'tolerate'
          ? {
              step,
              status: 'skipped',
              detail: `${step.argv.join(' ')} exited ${result.code} — already done, or never there`,
            }
          : {
              step,
              status: 'failed',
              detail:
                `${step.argv.join(' ')} exited ${result.code}. ${firstLine(result.stderr)}`.trim() +
                ` This command is not one whose failure may be tolerated: the removal stops here.`,
            };
      }

      case 'unlink':
        if (io.stat(step.path) === null) return { step, status: 'skipped', detail: 'already gone' };
        io.unlink(step.path);
        return { step, status: 'done', detail: `removed ${step.path}` };

      case 'archive':
        return archiveOne(step, io);
    }
  } catch (error) {
    return { step, status: 'failed', detail: (error as Error).message };
  }
}

/**
 * A rename beside the original — and never onto an existing one. Burying an earlier archive
 * is the one way this verb could still destroy a museum's bytes, so it is FATAL and not
 * skipped: everything after it would go on to lock an account whose tree is in an unknown
 * state.
 */
function archiveOne(step: RemovalStep & { kind: 'archive' }, io: RemovalIo): RemovalOutcome {
  if (io.stat(step.from) === null) return { step, status: 'skipped', detail: 'already gone' };
  if (io.stat(step.to) !== null) {
    return { step, status: 'failed', detail: `'${step.to}' already exists; archiving onto it would bury an earlier archive` };
  }
  io.rename(step.from, step.to);
  return { step, status: 'done', detail: `${step.from} → ${step.to}` };
}

/** One line of a command's stderr, for a report — never a wall of output in a terminal. */
function firstLine(stderr: string | undefined): string {
  const line = (stderr ?? '').split('\n').find(entry => entry.trim() !== '');
  return line ? line.trim() : '';
}

/** The real wiring: the adopter's io plus the one door only removal has. */
export function removalIo(base: AdoptIo): RemovalIo {
  return {
    ...base,
    unlink(path: string): void {
      unlinkSync(path);
    },
  };
}

/**
 * READ WHAT REMOVAL REASONS ABOUT — the artifacts' current bytes, and which trees exist.
 *
 * The artifact set is the CALLER's (`renderAll()`'s), never a list assembled here, for the
 * reason the header gives: a second census of the files this subsystem writes is defect #3,
 * and here it would fail as a museum's vhost left serving after its tenancy ended. What this
 * function adds is only the looking.
 *
 * It reads and never writes, so a caller may run it to print a removal before deciding.
 */
export function observeForRemoval(
  layout: InstanceLayout,
  artifacts: readonly Artifact[],
  io: RemovalIo,
): RemovalHost {
  const artifactBodies: Record<string, string> = {};
  for (const artifact of artifacts) {
    const body = io.readFile(artifact.path);
    if (body !== null) artifactBodies[artifact.path] = body;
  }

  const present: Record<string, boolean> = {};
  const links: Record<string, string | null> = {};
  const enabled = layout.sites.flatMap(site => SURFACES.map(surface => site.vhostEnabledPaths[surface]));
  for (const path of [
    ...layout.sites.map(site => site.webspace),
    layout.roots.workspaces,
    layout.roots.home,
    layout.auditFile,
    layout.htpasswd,
    ...enabled,
    // The credential FILES — whether they are there, never a byte of what they hold.
    ...Object.values(credentialSources(layout)),
  ]) {
    present[path] = io.stat(path) !== null;
  }
  for (const path of enabled) {
    links[path] = io.readLink(path);
  }

  // Whose tree is this, according to the tree? Read for every path removal could archive —
  // the marker is the only thing that distinguishes an instance's own webspace from an
  // identically-derived one belonging to a museum that is still serving.
  const claims: Record<string, string | null> = {};
  for (const root of [
    layout.roots.workspaces,
    layout.roots.home,
    layout.roots.audit,
    ...layout.sites.map((site) => site.webspace),
  ]) {
    claims[root] = io.readInstanceMarker ? io.readInstanceMarker(root) : null;
  }

  return Object.freeze({
    artifactBodies: Object.freeze(artifactBodies),
    present: Object.freeze(present),
    links: Object.freeze(links),
    claims: Object.freeze(claims),
  });
}

/**
 * WHICH SITES ARE STILL PUBLISHED — the question `remove` refuses on.
 *
 * A site is published when its production link points at a RELEASE of its own store, not
 * merely when a link exists: `plan()` creates a placeholder link for every declared site the
 * moment it is provisioned, so "the link exists" is true of a museum that has never
 * published anything at all, and refusing on it would make `remove` refuse every instance on
 * every host forever — a refusal that always fires is a refusal nobody reads.
 */
export function publishedSites(layout: InstanceLayout, io: AdoptIo): { readonly slug: string; readonly domain: string; readonly release: string }[] {
  const published: { slug: string; domain: string; release: string }[] = [];
  for (const site of layout.sites) {
    const paths = surfacePaths(site.webspace, 'prod');
    const target = io.readLink(paths.linkPath);
    if (target === null) continue;
    const release = releaseNameFromLinkTarget(paths, target);
    if (release !== null) published.push({ slug: site.slug, domain: site.domain, release });
  }
  return published;
}
