/**
 * THE DUMB APPLY, AND THE ONE MODULE THAT READS THE HOST.
 *
 * Three functions, and the split between them is the whole safety story of a provisioner
 * that runs as root on a box with a museum's live public site on it:
 *
 *   - `observeHost(layout)` — the ONLY code in this subsystem that looks at a real machine.
 *     It answers "who exists, what stands at each path, what do our own files currently
 *     say" into the plain `HostState` record `plan()` consumes. Nothing else here stats,
 *     spawns `id`, or reads a directory.
 *   - `apply(actions, io)` — executes an ALREADY DECIDED plan, in the order it was given,
 *     through an injected io. It decides NOTHING: whether a unit changed, whether a reload
 *     is warranted, whether a credential may be rewritten — all of that is `plan.ts`,
 *     against a HostState, in a pure function a gate can assert on.
 *   - `check(actions)` — reports that same plan and touches nothing. It takes no io at all,
 *     so a dry run cannot become a wet one by a later edit. That is the difference between
 *     a provisioner and an installer.
 *
 * WHY THE DECIDING LIVES NEXT DOOR. `plan()` is pure, so "the group action precedes the
 * user action that names it with `--gid`" is a test over an array rather than an experiment
 * on a live host — which is the defect this phase closes (`deploy/dedalo-ts.service:45-51`:
 * a `useradd` with no `--user-group` under a unit that hard-requires the group). If this
 * module decided anything, that decision would only be testable against a real machine.
 *
 * THE THREE RULES THIS MODULE DOES OWN, because they are execution and not policy:
 *
 *   1. IN ORDER, AND HALT ON THE FIRST FAILURE. The plan's order IS its meaning — `plan.ts`
 *      places `web_configtest` immediately before `web_reload` precisely so that halting is
 *      what makes reloading a broken configuration impossible. One bad vhost does not take
 *      down one site; it takes down every site the web server serves, this museum's and
 *      every other museum's on the box.
 *   2. NOTHING IS ROLLED BACK. §4's words are the right ones: a failure leaves the previous
 *      state intact and NAMES THE STEP. Undoing would mean deleting files on a museum's
 *      host to recover from a command that failed — a bigger operation than the one that
 *      went wrong.
 *   3. WRITE ONLY WHAT IS NOT ALREADY THERE. The plan already decided this from its
 *      HostState, but the HostState was read a moment earlier; between then and now a
 *      colleague may have edited the vhost. Re-reading costs a read and is the last thing
 *      standing between a stale plan and a surprise. When the bytes already agree, the
 *      write is skipped and SAID to be skipped.
 *
 * NO SECRET IN A REPORT. A report is printed to a terminal and pasted into a ticket, so:
 * this module never puts a credential's bytes into an outcome, a token it mints is written
 * and never returned, and the passwords it hashes for an htpasswd are read inside one
 * function that returns hashes and holds nothing. `check` cannot even reach a filesystem.
 *
 * Precedent: `src/core/media/protection.ts` in the engine — pure builders, a body hash in
 * the header, write only on drift, and a status path that writes nothing.
 */

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { INSTANCE_MARKER, type InstanceLayout, type InstanceManifest } from './layout';
import { renderAll } from './render';
import {
  changesTheHost,
  observedPaths,
  type Action,
  type EntryType,
  type FileAction,
  type HostState,
  type PathObservation,
} from './plan';

/* ────────────────────────────────────────────────────────────────────────────────────
 * The io seam
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * What a stat tells us that matters here. Deliberately the same three facts a
 * `PathObservation` carries, and deliberately NAMES rather than uids: an action says
 * `owner: 'www-data'`, and a second place in this subsystem that resolved that name to a
 * number would be a second place that could resolve it wrongly.
 *
 * LSTAT SEMANTICS. A symlink reports `type: 'symlink'` and never what it points at — the
 * served links are the museum's published state, and a provisioner that followed one while
 * setting a mode would be setting the mode of a release directory.
 */
export interface PathFacts {
  readonly type: EntryType;
  /** Permission bits only (`& 0o7777`), setgid included — never the file-type bits. */
  readonly mode: number;
  readonly owner: string;
  readonly group: string;
}

/** The result of running one command. `code` is the exit status; 127 means "not found". */
export interface ExecResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * EVERYTHING `apply` IS ALLOWED TO DO, as one injected interface.
 *
 * It exists so a gate can run a FULL apply against a temporary prefix with `exec` stubbed,
 * and — the property that matters most — so a second apply can be proven to be a no-op BY
 * COUNTING THE CALLS rather than by reading the report the same code wrote. A report that
 * says "nothing changed" is a claim; zero `writeFile` calls is a fact.
 *
 * Deliberately small, and deliberately not a filesystem: no `readdir`, no `rm`, no copy. A
 * provisioner that could delete is a provisioner that will one day delete a museum's
 * published site, and removal is a separate verb with its own refusals (`--purge-published`,
 * archive rather than delete) that does not belong behind this interface.
 *
 * `mintToken` and `hashPassword` are in here with the filesystem doors for one reason: they
 * are the two operations whose RESULT must never be asserted on. A gate that could predict
 * the token would be a gate demanding the token be predictable. Injected, they are also
 * fast — a suite that bcrypt-hashed for real would pay 100ms a run to prove nothing.
 */
export interface ProvisionIo {
  /** Facts about a path, or null when it does not exist. Never throws for absence. */
  stat(path: string): PathFacts | null;
  /** The bytes, or null when the path is absent or unreadable. Never throws for absence. */
  readFile(path: string): string | null;
  /** Create a directory, parents included. The mode is asserted separately: umask lies. */
  mkdir(path: string): void;
  /** Make `path` hold exactly these bytes, with this mode. Atomic where the host allows. */
  writeFile(path: string, body: string, mode: number): void;
  /** Create a symlink at `path` pointing at `target`. Never re-points an existing one. */
  symlink(path: string, target: string): void;
  /** `chown -h`: sets the LINK's ownership, never the target's. */
  chown(path: string, owner: string, group: string): void;
  chmod(path: string, mode: number): void;
  /** Run a command. The argv comes from the plan; it never carries a credential VALUE. */
  exec(argv: readonly string[]): ExecResult;
  /** Mint a credential. Returned to the writer and to nothing else, ever. */
  mintToken(bytes: number, encoding: 'base64url'): string;
  /** One bcrypt line's worth of hash. The password reaches this and stops here. */
  hashPassword(password: string): string;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The reports
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * WHAT HAPPENED TO ONE ACTION. Three statuses and no fourth: it was carried out, it was
 * deliberately not carried out, or it failed. "Skipped" is a first-class outcome and always
 * carries its reason, because silence must not read as success — a run that printed only
 * what it did would look identical whether it reloaded nothing because nothing had changed
 * or because it never got that far.
 */
export interface ActionOutcome {
  /** The action itself, so the caller formats it with `plan.describe()` — one voice. */
  readonly action: Action;
  readonly status: 'done' | 'skipped' | 'failed';
  /** WHY, in one line: paths, modes, owners, command output. Never a byte of content. */
  readonly detail: string;
}

export interface ApplyReport {
  /** False as soon as one action failed. The caller's exit status. */
  readonly ok: boolean;
  /** One entry per action, in the order the plan gave them. Length always matches. */
  readonly outcomes: readonly ActionOutcome[];
  readonly done: number;
  readonly skipped: number;
  readonly failed: number;
  /** Did anything on the host actually change? False is the answer a second run gives. */
  readonly changed: boolean;
  /** Every path whose bytes were written, in write order. */
  readonly written: readonly string[];
  /**
   * Files an OPERATOR must place — a provider key, an adopted password file. Not failures:
   * the run did everything it could, and this is the list of what remains. A caller that
   * exits 0 with a non-empty `awaiting` has told a museum its daemon is provisioned when
   * it cannot start, so the CLI treats this as non-zero and says so.
   */
  readonly awaiting: readonly string[];
  /** The action that stopped the run, or null. Named so the caller need not search. */
  readonly failure: ActionOutcome | null;
}

/**
 * The dry run, as a record. It carries the plan itself rather than a rendering of it: the
 * CLI owns the words (`plan.describe()`), so a `check` report and an `apply` report cannot
 * describe one action two different ways.
 */
export interface CheckReport {
  readonly actions: readonly Action[];
  /** Would this run change the host at all? An `awaiting` file alone is not a change. */
  readonly willChange: boolean;
  /** How many of each kind — the one-line summary an operator reads first. */
  readonly byKind: Readonly<Record<string, number>>;
  /** Paths whose bytes would be written, each with the disposition the plan gave. */
  readonly writes: readonly { readonly path: string; readonly disposition: string }[];
  /** Commands that would run, verbatim. An operator must read the exact argv beforehand. */
  readonly execs: readonly (readonly string[])[];
  /** Files only an operator can supply. A non-empty list is a run that will not finish. */
  readonly awaiting: readonly string[];
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * apply
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** Mode as an operator reads it in a §3 row: four octal digits, setgid visible. */
function octal(mode: number): string {
  return (mode & 0o7777).toString(8).padStart(4, '0');
}

/** The first lines of a command's own output, bounded — a report is read, not archived. */
function firstLines(text: string, lines = 2, max = 400): string {
  const trimmed = text
    .split('\n')
    .filter(line => line.trim() !== '')
    .slice(0, lines)
    .join(' | ');
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/** The run's own bookkeeping. Not exported: it is the run, not the report. */
interface RunState {
  readonly written: string[];
  readonly awaiting: string[];
}

/**
 * Bring one path's mode and ownership to what the action states, and say what moved.
 *
 * Re-asserted on every run, including runs that write nothing: a mode is not something set
 * once at install time, it is a property the host must hold, and a hand `chmod 777` on a
 * museum's htpasswd is exactly what a scheduled provisioner exists to put back. It costs a
 * `stat`, and when the host already agrees it performs ZERO mutating calls — which is what
 * lets the idempotence gate count calls instead of trusting a report.
 */
function reconcileAccess(
  io: ProvisionIo,
  path: string,
  owner: string,
  group: string,
  mode: number | null,
): string[] {
  const facts = io.stat(path);
  if (!facts) return [];
  const moved: string[] = [];
  // A symlink has no mode worth setting — §3 writes the mode column as '—' for the served
  // links — and chmod on one would silently apply to whatever it points at on some hosts.
  if (mode !== null && facts.type !== 'symlink' && (facts.mode & 0o7777) !== (mode & 0o7777)) {
    io.chmod(path, mode);
    moved.push(`mode ${octal(facts.mode)} → ${octal(mode)}`);
  }
  if (facts.owner !== owner || facts.group !== group) {
    io.chown(path, owner, group);
    moved.push(`owner ${facts.owner}:${facts.group} → ${owner}:${group}`);
  }
  return moved;
}

/** Run one command and turn it into an outcome. The argv is reported verbatim. */
function runCommand(io: ProvisionIo, argv: readonly string[]): { ok: boolean; detail: string } {
  if (!Array.isArray(argv) || argv.length === 0 || argv.some(part => typeof part !== 'string')) {
    return {
      ok: false,
      detail:
        'the action carries no runnable argv. Every command this provisioner runs is spelled by ' +
        'the plan, so that an operator reads the exact argv in --check before it runs as root.',
    };
  }
  const result = io.exec(argv);
  const spelled = argv.join(' ');
  if (result.code === 0) return { ok: true, detail: spelled };
  const output = firstLines(`${result.stderr}\n${result.stdout}`);
  return { ok: false, detail: `\`${spelled}\` exited ${result.code}${output ? `: ${output}` : ''}` };
}

/**
 * EXECUTE THE PLAN, IN ORDER, AND STOP AT THE FIRST FAILURE.
 *
 * In order and never reordered: a sort here would quietly overrule the gate that asserts on
 * the array, and the array is where the ordering law lives. Everything after a failure is
 * reported as skipped, by name, so the report is a complete account of the plan rather than
 * a truncated one — an operator must be able to see what did NOT happen.
 */
export function apply(actions: readonly Action[], io: ProvisionIo): ApplyReport {
  const outcomes: ActionOutcome[] = [];
  const state: RunState = { written: [], awaiting: [] };
  let failure: ActionOutcome | null = null;

  for (const action of actions) {
    if (failure) {
      outcomes.push({
        action,
        status: 'skipped',
        detail: `not attempted — the run stopped at the previous failure (${failure.action.kind})`,
      });
      continue;
    }
    // A THROWN io ERROR IS A NAMED FAILURE, NOT A STACK TRACE. `mkdir` on a read-only
    // filesystem, a rename across a full disk, a `chown` that cannot resolve a group the
    // declaration named: all of them are ordinary conditions on a museum's host, and all of
    // them must leave the operator with the same report as any other failure — the step,
    // the reason, and everything after it marked not attempted. A provisioner that died
    // mid-run would leave the host in a state nothing described.
    let outcome: ActionOutcome;
    try {
      outcome = executeOne(action, io, state);
    } catch (error) {
      outcome = {
        action,
        status: 'failed',
        detail: `${action.kind}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    outcomes.push(outcome);
    if (outcome.status === 'failed') failure = outcome;
  }

  const done = outcomes.filter(entry => entry.status === 'done').length;
  const skipped = outcomes.filter(entry => entry.status === 'skipped').length;
  const failed = outcomes.filter(entry => entry.status === 'failed').length;

  return Object.freeze({
    ok: failed === 0,
    outcomes: Object.freeze(outcomes),
    done,
    skipped,
    failed,
    changed: state.written.length > 0 || outcomes.some(entry => entry.status === 'done'),
    written: Object.freeze([...state.written]),
    awaiting: Object.freeze([...state.awaiting]),
    failure,
  });
}

/** One action, one outcome. Every branch either changes the host or explains why it did not. */
function executeOne(action: Action, io: ProvisionIo, state: RunState): ActionOutcome {
  switch (action.kind) {
    // ── The identities. NOT idempotent by nature (`groupadd` on an existing group is an
    // error, not a no-op), which is exactly why they are plan-decided: the planner has the
    // host's users and groups in its HostState and emits these only when they are missing.
    // This module runs the argv it was handed, in the position it was handed it — which is
    // what makes "the group comes first" assertable.
    case 'group': {
      const result = runCommand(io, action.argv);
      return result.ok
        ? { action, status: 'done', detail: `group '${action.name}' created — ${result.detail}` }
        : { action, status: 'failed', detail: `group '${action.name}': ${result.detail}` };
    }

    case 'user': {
      const result = runCommand(io, action.argv);
      return result.ok
        ? {
            action,
            status: 'done',
            detail: `user '${action.name}' created in group '${action.group}' — ${result.detail}`,
          }
        : { action, status: 'failed', detail: `user '${action.name}': ${result.detail}` };
    }

    // ── A root, a config directory, a webspace. The mode is not decoration: 2750 on a
    // webspace is what keeps one museum's UNPUBLISHED preprod tree out of every other uid
    // on the box, and the setgid bit is what makes a published release readable by the web
    // server at all.
    case 'dir': {
      const facts = io.stat(action.path);
      if (facts && facts.type !== 'dir') {
        return {
          action,
          status: 'failed',
          detail:
            `'${action.path}' exists and is a ${facts.type}, not a directory. The declaration ` +
            'says it is a root; nothing was created and nothing was changed.',
        };
      }
      if (!facts) {
        io.mkdir(action.path);
        // Fresh, so both are asserted rather than compared: `mkdir` is subject to the umask,
        // and a directory created by root is owned by root until it is not.
        io.chmod(action.path, action.mode);
        io.chown(action.path, action.owner, action.group);
        state.written.push(action.path);
        return {
          action,
          status: 'done',
          detail: `created ${action.path} ${action.owner}:${action.group} ${octal(action.mode)}`,
        };
      }
      const moved = reconcileAccess(io, action.path, action.owner, action.group, action.mode);
      return moved.length === 0
        ? {
            action,
            status: 'skipped',
            detail: `${action.path} already ${action.owner}:${action.group} ${octal(action.mode)}`,
          }
        : { action, status: 'done', detail: `${action.path}: ${moved.join(', ')}` };
    }

    // ── One file: a rendered artifact, a root marker, a minted token, a hashed htpasswd, or
    // a credential only a human can place. WHICH of those it is, is the plan's word
    // (`disposition` + `content`), and this branch is where all four become bytes.
    case 'file':
      return applyFile(action, io, state);

    // ── A served link. CREATE-IF-ABSENT AND NOTHING ELSE: an existing link points at
    // whatever the daemon last published, and re-pointing it here would roll a museum's live
    // site back to an empty placeholder. The provisioner's only job is that the path EXISTS
    // before the web server is reloaded.
    case 'symlink': {
      const facts = io.stat(action.path);
      if (facts && facts.type === 'symlink') {
        const moved = reconcileAccess(io, action.path, action.owner, action.group, null);
        return moved.length === 0
          ? {
              action,
              status: 'skipped',
              detail: `${action.path} is already a link — a published site is never re-pointed`,
            }
          : { action, status: 'done', detail: `${action.path}: ${moved.join(', ')}` };
      }
      if (facts) {
        return {
          action,
          status: 'failed',
          detail:
            `'${action.path}' is a ${facts.type} where the served link must be. Replacing it ` +
            'means deleting a directory a museum may have published into; refusing.',
        };
      }
      io.symlink(action.path, action.target);
      // `chown -h`, never through the link: the target is a release store owned by the same
      // uid, and following the link would be setting ownership on published content.
      io.chown(action.path, action.owner, action.group);
      state.written.push(action.path);
      return {
        action,
        status: 'done',
        detail: `linked ${action.path} -> ${action.target} (${action.owner}:${action.group})`,
      };
    }

    // ── A command. EVERY exec is fatal on failure, which is what the plan's ordering relies
    // on: `web_configtest` stands immediately before `web_reload`, so halting here is the
    // mechanism that makes reloading a broken configuration impossible.
    case 'exec': {
      const result = runCommand(io, action.argv);
      if (result.ok) return { action, status: 'done', detail: result.detail };
      const consequence =
        action.step === 'web_configtest'
          ? ' — NOTHING was reloaded and the running configuration is untouched'
          : '';
      return { action, status: 'failed', detail: `${action.step}: ${result.detail}${consequence}` };
    }

    default: {
      // Exhaustiveness as a compile error. A seventh action kind must be given an execution
      // rule HERE, in the same commit that adds it — never defaulted to "ignore", which
      // would make the provisioner silently skip the one step the release added.
      const unreachable: never = action;
      throw new Error(
        `apply: action kind '${String((unreachable as Action).kind)}' has no execution rule. ` +
          'Every action the plan can emit is executed by name; nothing is ignored.',
      );
    }
  }
}

/**
 * THE FILE BRANCH — the only place in this subsystem that overwrites a file on a live host,
 * and therefore the one with the most refusals.
 *
 * The dispositions, and why each behaves as it does:
 *
 *   - `awaiting` — the file must exist and only a human can supply it. NOTHING is written,
 *     and the path is reported so a run cannot end silently green with a museum's daemon
 *     unable to start.
 *   - `metadata` — the bytes are right and the access is not. The content is never touched:
 *     this is the disposition a CREDENTIAL gets, and re-writing one would destroy the value
 *     the museum placed there.
 *   - `create` / `rewrite` — produce the bytes and write them. A rewrite carries the plan's
 *     `drift` word (hand-edited, stale, unstamped, foreign) and this reports it BY NAME,
 *     because §4 requires a run that reverts a hand edit to say so rather than quietly
 *     reverting it.
 */
function applyFile(action: FileAction, io: ProvisionIo, state: RunState): ActionOutcome {
  if (action.disposition === 'awaiting') {
    state.awaiting.push(action.path);
    return {
      action,
      status: 'skipped',
      detail: `AWAITING AN OPERATOR: ${action.path} — ${action.reason}`,
    };
  }

  if (action.disposition === 'metadata') {
    const facts = io.stat(action.path);
    if (!facts) {
      return {
        action,
        status: 'failed',
        detail:
          `'${action.path}' was there when the plan was made and is gone now. Nothing was ` +
          'written — re-run, and the plan will be made against the host as it is.',
      };
    }
    const moved = reconcileAccess(io, action.path, action.owner, action.group, action.mode);
    return moved.length === 0
      ? { action, status: 'skipped', detail: `${action.path} already ${action.owner}:${action.group}` }
      : { action, status: 'done', detail: `${action.path}: ${moved.join(', ')}` };
  }

  // A CREDENTIAL IS NEVER REWRITTEN, and the check is here as well as in the planner. The
  // planner only ever mints a `random` file it observed to be ABSENT; if one is on disk now,
  // the host changed under the plan and the value on it is the museum's. Re-minting would
  // silently break the engine pairing that value already serves.
  if (action.content.source === 'random' && io.stat(action.path) !== null) {
    return {
      action,
      status: 'skipped',
      detail:
        `${action.path} already holds a credential — it appeared since the plan was made, and ` +
        'a value this tool did not place is never overwritten',
    };
  }

  const body = materialize(action, io);
  if (body === null) {
    return {
      action,
      status: 'failed',
      detail:
        `'${action.path}': a password file the recipe names could not be read. Nothing was ` +
        'written, and no part of what was read appears here.',
    };
  }

  // WRITE ONLY ON DRIFT — re-checked at the instant of the write, not at plan time. The
  // comparison is skipped for the two non-deterministic sources: a bcrypt is salted and a
  // minted token is random, so "the bytes differ" says nothing about either.
  if (action.content.source === 'literal' && io.readFile(action.path) === body) {
    const moved = reconcileAccess(io, action.path, action.owner, action.group, action.mode);
    return moved.length === 0
      ? { action, status: 'skipped', detail: `${action.path} already holds these bytes` }
      : { action, status: 'done', detail: `${action.path}: ${moved.join(', ')}` };
  }

  io.writeFile(action.path, body, action.mode);
  io.chown(action.path, action.owner, action.group);
  state.written.push(action.path);

  // WHAT IS SAID ABOUT IT. Never the content: a rendered artifact's body is harmless and a
  // token's is not, and a report that printed one would be a report an operator learns it is
  // safe to paste. The drift word is stated because reverting a hand edit in silence is how
  // a second source of truth survives to win later.
  const what =
    action.artifactKind !== undefined ? `${action.artifactKind} artifact` : contentNoun(action);
  const why = action.drift ? `, drift: ${action.drift}` : '';
  return {
    action,
    status: 'done',
    detail:
      `${action.disposition === 'create' ? 'wrote' : 'rewrote'} ${action.path} (${what}${why}) ` +
      `${action.owner}:${action.group} ${octal(action.mode)}`,
  };
}

/** What a file IS, in a word — never what it says. */
function contentNoun(action: FileAction): string {
  switch (action.content.source) {
    case 'literal':
      return 'generated file';
    case 'random':
      return 'minted credential';
    case 'htpasswd':
      return 'password file';
    case 'operator':
      return 'operator-supplied file';
  }
}

/**
 * THE BYTES A FILE ACTION ASKS FOR. Null means a recipe could not be followed — and the
 * caller turns that into a failure that names the FILE and nothing it read.
 *
 * This is the one function in the subsystem that reads a password. It reads it, hashes it,
 * and returns hashes; the plaintext exists inside this call and nowhere else. It is not
 * returned, not logged, not put in an outcome, and not kept — which is the whole reason the
 * plan carries a RECIPE (login names and file paths) instead of content.
 */
function materialize(action: FileAction, io: ProvisionIo): string | null {
  const content = action.content;
  switch (content.source) {
    case 'literal':
      return content.body;

    case 'random':
      // Written and never returned to the caller. `plan.ts` states the recipe (32 bytes,
      // base64url) precisely so that no value has to travel through a printable plan.
      return `${io.mintToken(content.bytes, content.encoding)}\n`;

    case 'htpasswd': {
      const lines: string[] = [];
      for (const user of content.users) {
        const password = io.readFile(user.passwordFile);
        if (password === null) return null;
        // The trailing newline of a file an operator wrote with an editor is not part of the
        // password. Nothing else is trimmed: leading spaces are somebody's deliberate choice.
        lines.push(`${user.name}:${io.hashPassword(password.replace(/\r?\n$/, ''))}`);
      }
      return `${lines.join('\n')}\n`;
    }

    case 'operator':
      // Only ever paired with `awaiting` or `metadata`, both of which returned above. A
      // `create` carrying it would mean the planner asked this module to invent a museum's
      // credential, which is the one thing it must never do.
      return null;
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * check
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE SAME PLAN, REPORTED, WITH NOTHING TOUCHED.
 *
 * It takes no io at all — not an io it declines to use, none. A dry run holding a handle to
 * a filesystem is one edit away from writing, and the whole value of `--check` is that an
 * operator can run it against a production host at any hour without reading the code first.
 * The signature is the guarantee.
 */
export function check(actions: readonly Action[]): CheckReport {
  const byKind: Record<string, number> = {};
  const writes: { path: string; disposition: string }[] = [];
  const execs: (readonly string[])[] = [];
  const awaiting: string[] = [];

  for (const action of actions) {
    byKind[action.kind] = (byKind[action.kind] ?? 0) + 1;
    switch (action.kind) {
      case 'file':
        if (action.disposition === 'awaiting') awaiting.push(action.path);
        else writes.push({ path: action.path, disposition: action.disposition });
        break;
      case 'dir':
        writes.push({ path: action.path, disposition: action.changes.join('+') });
        break;
      case 'symlink':
        writes.push({ path: action.path, disposition: `link -> ${action.target}` });
        break;
      case 'exec':
        execs.push(action.argv);
        break;
      case 'group':
      case 'user':
        execs.push(action.argv);
        break;
    }
  }

  return Object.freeze({
    actions: Object.freeze([...actions]),
    // An `awaiting` file is not a change: the run will write nothing for it. `plan.ts` owns
    // that distinction (`changesTheHost`), so this asks rather than restating it.
    willChange: actions.some(changesTheHost),
    byKind: Object.freeze(byKind),
    writes: Object.freeze(writes.map(entry => Object.freeze(entry))),
    execs: Object.freeze(execs),
    awaiting: Object.freeze(awaiting),
  });
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * hostIo — the seam, for real
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** uid → name, gid → name. A number is useless in a report and unusable in a comparison. */
function nameOfUser(uid: number): string {
  const result = spawnSync('id', ['-nu', String(uid)], { encoding: 'utf8' });
  return (result.status === 0 ? result.stdout.trim() : '') || String(uid);
}

function nameOfGroup(gid: number): string {
  const result = spawnSync('getent', ['group', String(gid)], { encoding: 'utf8' });
  const line = result.status === 0 ? result.stdout.trim() : '';
  return (line.split(':')[0] ?? '') || String(gid);
}

/** lstat, as PathFacts. Null for absence — a missing path is normal, not exceptional. */
function factsOf(path: string): PathFacts | null {
  try {
    const entry = lstatSync(path);
    const type: EntryType = entry.isDirectory()
      ? 'dir'
      : entry.isSymbolicLink()
        ? 'symlink'
        : entry.isFile()
          ? 'file'
          : 'other';
    return Object.freeze({
      type,
      mode: entry.mode & 0o7777,
      owner: nameOfUser(entry.uid),
      group: nameOfGroup(entry.gid),
    });
  } catch {
    return null;
  }
}

/** Everything here is the boring implementation; the decisions are all in `apply`. */
export function hostIo(): ProvisionIo {
  return {
    stat: factsOf,
    readFile(path: string): string | null {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return null;
      }
    },
    mkdir(path: string): void {
      mkdirSync(path, { recursive: true });
    },
    /**
     * WRITE SOMEWHERE ELSE, THEN RENAME. A vhost is read by a running web server and a unit
     * by systemd; a half-written file is a syntax error at exactly the moment nobody is
     * looking. The temporary lands in the same directory, so the rename cannot cross a
     * filesystem, and it is created with the FINAL mode — the bytes of a minted token are
     * never readable through a wider mode than §3 allows, not even briefly.
     */
    writeFile(path: string, body: string, mode: number): void {
      const temporary = join(dirname(path), `.${basename(path)}.dedalo-provision.${process.pid}.tmp`);
      try {
        writeFileSync(temporary, body, { encoding: 'utf8', mode });
        // `writeFileSync` honours the umask on creation, so the mode is asserted explicitly.
        chmodSync(temporary, mode);
        renameSync(temporary, path);
      } catch (error) {
        try {
          unlinkSync(temporary);
        } catch {
          // It may never have been created. Nothing to clean up, and nothing to say.
        }
        throw error;
      }
    },
    symlink(path: string, target: string): void {
      symlinkSync(target, path);
    },
    chown(path: string, owner: string, group: string): void {
      // Through `chown -h`, with the NAMES: the action carries 'www-data', and resolving
      // that to a number here would be a second place in the subsystem deciding what a group
      // name means. `-h` keeps a served link's ownership off the release it points at.
      const result = spawnSync('chown', ['-h', `${owner}:${group}`, path], { encoding: 'utf8' });
      if (result.status !== 0) {
        throw new Error(
          `apply: chown -h ${owner}:${group} '${path}' failed (${result.status ?? 'not run'}): ` +
            `${firstLines(result.stderr ?? '')}`,
        );
      }
    },
    chmod(path: string, mode: number): void {
      chmodSync(path, mode);
    },
    exec(argv: readonly string[]): ExecResult {
      const [command, ...args] = argv;
      const result = spawnSync(command as string, args, { encoding: 'utf8' });
      return Object.freeze({
        // A command that could not be spawned at all reports no status; 127 is the shell's
        // own "not found", which is what an operator will recognise in the report.
        code: result.status ?? 127,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? (result.error ? String(result.error.message) : ''),
      });
    },
    mintToken(bytes: number, encoding: 'base64url'): string {
      return randomBytes(bytes).toString(encoding);
    },
    hashPassword(password: string): string {
      // bcrypt, and `$2y$` on the wire: Apache's htpasswd and nginx's auth_basic both read
      // that prefix, while `$2b$` — what most libraries emit — is not recognised by every
      // crypt(3) a museum's distro might ship. The hashes are identical otherwise.
      const hashed = Bun.password.hashSync(password, { algorithm: 'bcrypt', cost: 12 });
      return hashed.replace(/^\$2[abxy]\$/, '$2y$');
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * observeHost — the only code here that touches a real machine
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * Does this user exist? `id -u` rather than a read of /etc/passwd, because a host may
 * resolve its users through LDAP or SSSD, and a provisioner that decided "absent" from a
 * file would run `useradd` for a user that already exists elsewhere — the exact collision
 * the isolation model cannot survive.
 */
function userExists(name: string): boolean {
  return spawnSync('id', ['-u', name], { encoding: 'utf8' }).status === 0;
}

/** The same NSS reasoning for groups. Absent `getent` (macOS) reads as "no group". */
function groupExists(name: string): boolean {
  return spawnSync('getent', ['group', name], { encoding: 'utf8' }).status === 0;
}

/** `systemctl <verb> <unit>` succeeded. False on a host with no systemd, which is honest. */
function systemctlSays(verb: string, unit: string): boolean {
  return spawnSync('systemctl', [verb, unit], { encoding: 'utf8' }).status === 0;
}

/**
 * THE PATHS WHOSE BYTES ARE READ, and no others.
 *
 * A WHITELIST rather than an exclusion list, because the difference between the two is a
 * museum's provider key in a HostState the moment somebody adds a path to the declaration
 * and forgets this file. What is here: the stamped artifacts (drift is a byte comparison)
 * and the root markers (§5 turns on which instance one names). What is deliberately not:
 * every credential file, and the htpasswd — whose LOGIN NAMES are observed separately and
 * whose hashes are not needed by anything.
 */
/**
 * THE PATHS WHOSE BYTES THIS HOST OBSERVER MUST READ.
 *
 * DERIVED from the renderers, never listed by hand. This was a second hand-maintained
 * census of the rendered artifacts sitting beside `RENDERERS` — the same two-independent-
 * derivations defect the whole subsystem exists to delete — and it had already drifted: the
 * site table was added as a sixth artifact and never added here, so `sites.json` was written
 * once and then never drift-checked again. A hand edit to the file that tells the daemon
 * where every museum's webspace is would have been invisible to `check`.
 *
 * The markers are added separately because no renderer produces them: `plan.ts` mints them
 * from the instance name. They are the only contentful paths that are not artifacts.
 */
function contentfulPaths(layout: InstanceLayout, manifest: InstanceManifest): Set<string> {
  const paths = new Set<string>(renderAll(layout, manifest).map(artifact => artifact.path));
  for (const root of [
    layout.roots.workspaces,
    layout.roots.home,
    layout.roots.audit,
    ...layout.sites.map(site => site.webspace),
  ]) {
    paths.add(join(root, INSTANCE_MARKER));
  }
  return paths;
}

/** The login names on an htpasswd — never a hash, and never the file's bytes anywhere else. */
function htpasswdNames(path: string): readonly string[] | undefined {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '' && !line.startsWith('#'))
    .map(line => line.slice(0, line.indexOf(':')))
    .filter(name => name !== '');
}

/**
 * READ THE HOST — the only function in this subsystem that does.
 *
 * It reads and never writes, so it is safe to run against a production host at any hour,
 * which is what makes `--check` meaningful. It takes no io seam on purpose: this IS the
 * other side of that seam, and a gate never calls it — a gate builds a `HostState` literal
 * and hands it to `plan()`, which is exactly why the planning rules are testable without a
 * machine.
 *
 * WHAT IT DELIBERATELY DOES NOT READ: the bytes of any credential file. Presence, mode,
 * owner and mtime are facts the plan needs; the value is not, in any mode, ever.
 */
export function observeHost(layout: InstanceLayout, manifest: InstanceManifest): HostState {
  const contentful = contentfulPaths(layout, manifest);

  const entries: Record<string, PathObservation> = {};
  for (const path of observedPaths(layout)) {
    const facts = factsOf(path);
    // AN OBSERVER THAT CANNOT STAT A PATH OMITS THE ENTRY. `PathObservation`'s header says
    // why: a blank observation is read as drift, and "I did not look" must never read as
    // "it was correct".
    if (!facts) continue;

    let content: string | undefined;
    if (contentful.has(path)) {
      const bytes = readFileTextOrUndefined(path);
      if (bytes !== undefined) content = bytes;
    }

    let target: string | undefined;
    if (facts.type === 'symlink') {
      target = readLinkOrUndefined(path);
    }

    let empty: boolean | undefined;
    if (facts.type === 'dir') {
      empty = directoryIsEmpty(path);
    }

    entries[path] = Object.freeze({
      type: facts.type,
      mode: facts.mode,
      owner: facts.owner,
      group: facts.group,
      ...(content !== undefined ? { content } : {}),
      ...(target !== undefined ? { target } : {}),
      ...(empty !== undefined ? { empty } : {}),
      mtimeMs: mtimeOrUndefined(path),
    });
  }

  const declaredNames = [
    layout.identity.user,
    layout.identity.group,
    layout.identity.webGroup,
    layout.identity.engineGroup,
  ];

  return Object.freeze({
    users: Object.freeze([layout.identity.user].filter(userExists)),
    groups: Object.freeze(
      declaredNames
        .filter((name, index) => declaredNames.indexOf(name) === index)
        .filter(groupExists),
    ),
    entries: Object.freeze(entries),
    unitEnabled: systemctlSays('is-enabled', layout.unitName),
    unitActive: systemctlSays('is-active', layout.unitName),
    htpasswdUsers: htpasswdNames(layout.htpasswd),
    nologinShell: [`/usr/sbin/nologin`, `/sbin/nologin`].find(shell => existsSync(shell)),
    webServerUnit: webServerUnitOf(layout),
  });
}

/** The web server's systemd unit AS THIS HOST SPELLS IT — `apache2` on Debian, `httpd` on
 * RHEL. A wrong guess is a reload that silently never happens, so it is observed rather
 * than assumed; when nothing answers, the field is omitted and the plan uses its default. */
function webServerUnitOf(layout: InstanceLayout): string | undefined {
  const candidates = layout.webServer === 'apache' ? ['apache2', 'httpd'] : ['nginx'];
  return candidates.find(unit => spawnSync('systemctl', ['cat', `${unit}.service`]).status === 0);
}

function readFileTextOrUndefined(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

function readLinkOrUndefined(path: string): string | undefined {
  try {
    // Verbatim, relative targets included: `build/promote.ts` keeps them relative so the
    // surface tree stays relocatable, and resolving one here would report drift forever.
    return readlinkSync(path);
  } catch {
    return undefined;
  }
}

function directoryIsEmpty(path: string): boolean | undefined {
  try {
    return readdirSync(path).length === 0;
  } catch {
    return undefined;
  }
}

function mtimeOrUndefined(path: string): number | undefined {
  try {
    return lstatSync(path).mtimeMs;
  } catch {
    return undefined;
  }
}
