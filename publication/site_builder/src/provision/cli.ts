/**
 * THE ONE ENTRY POINT — `bun run provision <verb>`.
 *
 * Everything an operator does to a museum's host goes through this file, and this file
 * DECIDES NOTHING about that host. It parses arguments, works out which instances a run is
 * about, calls the three modules that do the work, prints what they say, and returns an exit
 * code. The division is deliberate and it is the whole design of the phase:
 *
 *   fleet.ts   knows what is DECLARED on this host, and refuses a bad declaration BY NAME.
 *   plan.ts    is PURE: (layout, manifest, hostState) => Action[]. Ordering, drift and
 *              idempotency are properties of that array, so a gate asserts on the plan
 *              rather than on a live host.
 *   apply.ts   is DUMB: it executes an already-decided plan and makes no decisions of its
 *              own — writes only on drift, `daemon-reload` only when a unit changed, and
 *              never a reload after a failed config test. `check()` is the same report with
 *              no io at all.
 *   cli.ts     is this: arguments, targets, output, exit codes.
 *
 * WHY THAT MATTERS HERE. A provisioner that decides things in its front end is a
 * provisioner whose behaviour can only be tested by running it as root against a real box.
 * The one thing this file must therefore never grow is a rule about what should happen to a
 * host: no "if the unit looks fine, skip it", no "write it anyway, it is probably ours".
 * Every such sentence belongs in `plan()`, where a test can read it.
 *
 * WHAT THIS FILE IS ALLOWED TO KNOW, then, is exactly four things, and each is a property of
 * the COMMAND rather than of the host:
 *
 *   1. WHICH INSTANCES a run is about (`--instance` / `--all`), and that a malformed one is
 *      named and skipped rather than aborting the fleet. `fleet.ts` says outright that this
 *      decision is this file's: "what is a failure" is a property of what an operator typed.
 *   2. THAT NOTHING PRINTED COULD BE A SECRET. A plan is read in a terminal and pasted into
 *      a ticket; every line leaves through one writer, and that writer refuses a
 *      credential-shaped assignment carrying a value (`secretShapedAssignment`).
 *   3. WHAT AN EXIT CODE MEANS, so CI can branch on it — `check` exits DRIFT when there is
 *      work to do, which makes it an assertion rather than a report.
 *   4. WHAT EACH VERB HONESTLY DOES. Two verbs are PARTIAL today (`adopt`, `remove`), and
 *      `--help` says so in the same words the code does, because a verb that quietly does
 *      less than its name is worse on a museum's host than a verb that refuses.
 *
 * THE SIBLINGS ARE REACHED THROUGH `ProvisionDeps`, injected. Not for mockery's sake: the
 * gate for this file has to drive the refusals, the exit codes and the fleet arithmetic
 * WITHOUT a host to provision, and a CLI that calls `observeHost()` directly can only be
 * tested by observing something. `hostDeps()` is the real wiring and is nine lines long.
 */

import { existsSync } from 'node:fs';

import { DEFAULT_PATHS } from './layout';
import type { InstanceLayout, InstanceManifest } from './layout';
import { CREDENTIAL_NAME_PATTERN } from './schema';
import { renderAll } from './render';
import type { Artifact } from './render';
import { TOKEN_PLACEHOLDER } from './render/engine_fragment';
import { assertFleetDisjoint, loadFleet } from './fleet';
import type { Fleet, FleetMember, FleetMembers } from './fleet';
import { changesTheHost, describe, plan } from './plan';
import type { Action, HostState } from './plan';
import { apply, check, hostIo, observeHost } from './apply';
import type { ApplyReport, CheckReport, ProvisionIo } from './apply';

/* ────────────────────────────────────────────────────────────────────────────────────
 * Exit codes
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE CLOSED SET OF EXIT CODES. Closed because an operator's script and a CI job branch on
 * these numbers, and a code invented at a call site is a number nobody can look up.
 *
 * The one that carries a design decision is DRIFT. `check` renders the plan and writes
 * nothing; a host that needs work is not an ERROR, it is the answer to the question — but it
 * must still be a non-zero answer, or `provision check --all` cannot be the CI assertion
 * that a fleet is converged. So DRIFT is 1: distinguishable from a refusal, distinguishable
 * from a failure, and non-zero.
 *
 * UNSUPPORTED exists so that `adopt` and `remove` can be HONEST. Their argument handling and
 * their refusals are real; the host mutation behind them lands in Phase 8. A verb that did
 * nothing and exited 0 would read, in a script, exactly like a verb that worked.
 */
export const EXIT = Object.freeze({
  /** The run did what it was asked, or there was nothing to do. */
  OK: 0,
  /** `check` only: the host does not match its declaration. Nothing was written. */
  DRIFT: 1,
  /** The command line is not a command: unknown verb, missing target, refused combination. */
  USAGE: 2,
  /** An instance was refused — malformed, unknown, overlapping, unplannable, or publishing. */
  REFUSED: 3,
  /** The work was attempted and failed. Whatever apply reached, it named. */
  FAILED: 4,
  /** The verb exists, the arguments were accepted, and the work is not written yet. */
  UNSUPPORTED: 5,
});

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/**
 * WHICH CODE SURVIVES when one run produces several. A `--all` run over six museums can
 * simultaneously fail on one, refuse another and find drift on a third; it returns ONE
 * number, and that number must be the most serious thing that happened. Ranked worst-first,
 * so a reader reads the order rather than inferring it from arithmetic.
 */
const EXIT_SEVERITY: readonly number[] = [EXIT.FAILED, EXIT.REFUSED, EXIT.UNSUPPORTED, EXIT.DRIFT, EXIT.OK];

/** Combine two outcomes, keeping the more serious one. */
export function worse(a: number, b: number): number {
  const rank = (code: number): number => {
    const index = EXIT_SEVERITY.indexOf(code);
    // An unranked code is treated as the worst thing that could have happened, because the
    // alternative — ranking it best — turns an unknown failure into a green run.
    return index === -1 ? -1 : index;
  };
  return rank(a) <= rank(b) ? a : b;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The siblings, as an injectable record
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE FOUR MODULES THIS ENTRY POINT WIRES. Every one of them is a plain function elsewhere
 * in this directory; this record exists only so the gate can substitute them.
 *
 * Note what is NOT here: no writer, no filesystem, no exec. `apply` takes its own io
 * (`hostIo()`, the small stat/read/write/chown/chmod/exec seam it declares), and the only
 * other thing this file touches on a host is `exists()` — one call, for the one question
 * `remove` must ask before it refuses.
 */
export interface ProvisionDeps {
  loadFleet(dir: string): Fleet;
  assertFleetDisjoint(fleet: FleetMembers): void;
  observeHost(layout: InstanceLayout): HostState;
  plan(layout: InstanceLayout, manifest: InstanceManifest, host: HostState): Action[];
  /** The plan's own words. One voice: a `check` line and an `apply` line are the same line. */
  describe(action: Action): string;
  /** Would this action touch the host? An 'awaiting' file is a notice, not work. */
  changesTheHost(action: Action): boolean;
  apply(actions: readonly Action[], io: ProvisionIo): ApplyReport;
  check(actions: readonly Action[]): CheckReport;
  hostIo(): ProvisionIo;
}

/** The real wiring. The only place in this file that knows the siblings by name. */
export function hostDeps(): ProvisionDeps {
  return { loadFleet, assertFleetDisjoint, observeHost, plan, describe, changesTheHost, apply, check, hostIo };
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The secret guard (P7)
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE KEY of a credential-shaped assignment somewhere in this line, or null.
 *
 * P7 says no secret may appear in a log, a plan, an error or a report — and this is the one
 * place all four leave the process, so the rule is mechanical here rather than remembered at
 * two hundred call sites. `render` prints whole artifact bodies, which is the output most
 * likely to carry an assignment, and a `check` report is pasted into tickets by people who
 * did not write it.
 *
 * It scans ANYWHERE in the line rather than anchoring, because the line that would leak is
 * not a bare assignment — it is a plan line or an outcome detail with an assignment quoted
 * inside it.
 *
 * WHAT IS ALLOWED, and why each exemption is safe:
 *   - a PATH (`…_KEY_FILE="/etc/…"`). Naming the file is the design: the credential is 0600
 *     root:root and reaches the process through systemd's LoadCredential, so the path is a
 *     pointer nobody but root can follow. `env` renders exactly such a line.
 *   - the pairing SENTINEL. `engine_fragment.ts` renders an impossible value on purpose so
 *     an unfinished pairing is greppable; refusing to print it would hide the one line the
 *     operator is meant to act on.
 *   - a value carrying WHITESPACE, or shorter than `MIN_SECRET_LENGTH`. A credential is one
 *     opaque token; prose is not. Without this the guard fires on the unit's own comment
 *     about `KEY=VALUE` env syntax — and a guard that must be excepted on a generated file
 *     is a guard that will be excepted on the day it matters.
 *
 * WHAT IS NOT HERE, deliberately: an entropy rule ("no long random-looking run"). Every
 * artifact this subsystem prints opens with a 64-character hex body hash, so such a rule
 * would have to except its own stamp line on every artifact. This is a last line of defence,
 * not a proof: the rendered bytes are held secret-free from the other side by the examples
 * gate, and `plan.describe()` and `apply`'s outcome details are written never to carry a
 * value in the first place.
 */
const MIN_SECRET_LENGTH = 8;

export function secretShapedAssignment(line: string): string | null {
  const assignments = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"([^"\r\n]*)"|(\S+))/g;

  for (const match of line.matchAll(assignments)) {
    const key = match[1] ?? '';
    if (!CREDENTIAL_NAME_PATTERN.test(key)) continue;

    const value = (match[2] ?? match[3] ?? '').trim();
    if (value.length < MIN_SECRET_LENGTH) continue;
    if (/\s/.test(value)) continue;
    if (value === TOKEN_PLACEHOLDER) continue;
    if (value.startsWith('/')) continue;

    return key;
  }

  return null;
}

/**
 * Wrap a sink so that nothing secret-shaped can pass through it.
 *
 * It THROWS rather than redacting. A redaction is a silent repair of a defect that has
 * already happened — some renderer or some report is carrying a credential — and the run
 * would continue, printing the rest, with one starred line nobody reads twice. The refusal
 * names the KEY and never the value, so the message cannot itself be the disclosure.
 */
function guarded(sink: (line: string) => void): (line: string) => void {
  return (line: string): void => {
    const key = secretShapedAssignment(line);
    if (key !== null) {
      throw new Error(
        `provision: refusing to print a line that assigns '${key}' a value. A plan, a report ` +
          `and an error are all read in a terminal and pasted into tickets, so the provisioner ` +
          `names credential FILES and never credential VALUES. The value is not shown here ` +
          `either. Nothing further was printed.`,
      );
    }
    sink(line);
  };
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Arguments
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** The parsed command line. Every field is decided here and nowhere else. */
export interface ProvisionArgs {
  readonly verb: string | null;
  /** Explicitly named instances, in the order given. Empty when `--all` was used. */
  readonly instances: readonly string[];
  readonly all: boolean;
  readonly engine: boolean;
  readonly purgePublished: boolean;
  /** Where the declarations live. `loadFleet` is given this and nothing else. */
  readonly configDir: string;
  readonly help: boolean;
}

type ParseResult = { readonly ok: true; readonly args: ProvisionArgs } | { readonly ok: false; readonly message: string };

/**
 * Parse, and refuse anything not understood.
 *
 * An unknown flag is a REFUSAL and not a warning. This command runs as root against a
 * museum's host; a mistyped `--all` that is silently ignored is a run that quietly did
 * something other than what was typed, and the operator's only evidence that it was fine is
 * the exit code.
 */
export function parseArgs(argv: readonly string[]): ParseResult {
  let verb: string | null = null;
  const instances: string[] = [];
  let all = false;
  let engine = false;
  let purgePublished = false;
  let configDir: string = DEFAULT_PATHS.configBase;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? '';

    if (!token.startsWith('-')) {
      if (verb !== null) {
        return {
          ok: false,
          message: `provision: unexpected argument '${token}' — one verb per run (already reading '${verb}').`,
        };
      }
      verb = token;
      continue;
    }

    // `--flag=value` and `--flag value` are both accepted: the first is what a script
    // writes, the second is what a person types, and refusing either would be a trap.
    const equals = token.indexOf('=');
    const name = equals === -1 ? token : token.slice(0, equals);
    const inlineValue = equals === -1 ? null : token.slice(equals + 1);

    const takeValue = (): string | null => {
      if (inlineValue !== null) return inlineValue;
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('-')) return null;
      index += 1;
      return next;
    };

    switch (name) {
      case '--help':
      case '-h':
        help = true;
        break;
      case '--all':
        all = true;
        break;
      case '--engine':
        engine = true;
        break;
      case '--purge-published':
        purgePublished = true;
        break;
      case '--instance': {
        const value = takeValue();
        if (value === null || value.length === 0) {
          return { ok: false, message: `provision: --instance needs an instance name.` };
        }
        instances.push(value);
        break;
      }
      case '--config-dir': {
        const value = takeValue();
        if (value === null || value.length === 0) {
          return { ok: false, message: `provision: --config-dir needs a directory.` };
        }
        configDir = value;
        break;
      }
      default:
        return {
          ok: false,
          message: `provision: unknown option '${name}'. Nothing was read and nothing was written.`,
        };
    }
  }

  return { ok: true, args: { verb, instances, all, engine, purgePublished, configDir, help } };
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The verbs
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** What a verb's run receives. One object, so a new verb cannot invent a new call shape. */
interface VerbContext {
  readonly args: ProvisionArgs;
  readonly deps: ProvisionDeps;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
  /** Does this path exist on the host? Injected so `remove`'s refusal is drivable. */
  readonly exists: (path: string) => boolean;
}

interface VerbSpec {
  /** One line for `--help`. */
  readonly summary: string;
  /** 'fleet' takes `--instance` or `--all`; 'one' takes exactly one `--instance`. */
  readonly targets: 'fleet' | 'one';
  /** Whether `--engine` narrows this verb's output at all — see `validateTarget`. */
  readonly acceptsEngine: boolean;
  /**
   * What this verb does NOT do yet, in the operator's words. Printed by `--help` AND by the
   * verb itself, so the two cannot drift into a help text that promises what the code defers.
   */
  readonly deferred?: string;
  run(context: VerbContext): number;
}

/**
 * THE CLOSED VERB TABLE — the only list of verbs in this file.
 *
 * `--help` is GENERATED from it, so the help text cannot document a verb that does not exist
 * nor omit one that does, and the gate asserts both directions against these keys. Same
 * argument `RENDERER_BY_KIND` makes about the five renderers: a hand-written second list is
 * a list that will one day be wrong, and it will be wrong exactly when someone is reading it.
 */
export const VERBS: Readonly<Record<string, VerbSpec>> = Object.freeze({
  apply: {
    summary: 'converge the host onto the declaration — writes only what drifted',
    targets: 'fleet',
    acceptsEngine: false,
    run: runApply,
  },
  check: {
    summary: 'plan without touching anything; exit 1 when the host has drifted',
    targets: 'fleet',
    acceptsEngine: false,
    run: runCheck,
  },
  render: {
    summary: 'print the artifacts the declaration renders to; writes nothing',
    targets: 'fleet',
    acceptsEngine: true,
    run: runRender,
  },
  list: {
    summary: 'list the declared instances, their identities and their sites',
    targets: 'fleet',
    acceptsEngine: true,
    run: runList,
  },
  adopt: {
    summary: 'write a declaration for an instance that was built by hand',
    targets: 'one',
    acceptsEngine: false,
    deferred:
      'PARTIAL: the arguments and the refusals are real; inferring an existing host’s ' +
      'identity, roots and modes into a declaration lands in Phase 8. Nothing is read from ' +
      'the host and nothing is written today.',
    run: runAdopt,
  },
  remove: {
    summary: 'decommission an instance — refuses while a site is published',
    targets: 'one',
    acceptsEngine: false,
    deferred:
      'PARTIAL: the arguments and the refusals are real, and it prints the removal it would ' +
      'perform; executing that removal (archive, never delete — and never free the uid) ' +
      'lands in Phase 8. Nothing on the host is changed today.',
    run: runRemove,
  },
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * Help
 * ──────────────────────────────────────────────────────────────────────────────────── */

const VERB_COLUMN = 8;

/** The usage text, generated from `VERBS` so it documents exactly the verbs that exist. */
export function usageLines(): string[] {
  const lines: string[] = [
    'Dédalo site builder — the per-museum instance provisioner.',
    '',
    'Usage:',
    '  bun run provision <verb> [--instance <name>]… | --all  [options]',
    '',
    'Verbs:',
  ];

  for (const [name, spec] of Object.entries(VERBS)) {
    lines.push(`  ${name.padEnd(VERB_COLUMN)}${spec.summary}`);
    if (spec.deferred) lines.push(`  ${' '.repeat(VERB_COLUMN)}${spec.deferred}`);
  }

  lines.push(
    '',
    'Options:',
    `  --instance <name>   the instance to act on; repeat it to name several`,
    `  --all               every instance declared under the config directory`,
    `  --engine            'render' and 'list' only: the engine pairing fragment alone`,
    `  --purge-published   'remove' only: proceed even though a site is still published`,
    `  --config-dir <dir>  where the declarations live (default ${DEFAULT_PATHS.configBase})`,
    `  --help, -h          this text`,
    '',
    'Exit codes:',
    `  ${EXIT.OK}  the run did what it was asked, or there was nothing to do`,
    `  ${EXIT.DRIFT}  'check' only: the host has drifted from its declaration (nothing written)`,
    `  ${EXIT.USAGE}  the command line was not understood`,
    `  ${EXIT.REFUSED}  an instance was refused — malformed, unknown, overlapping, still publishing,`,
    `     or waiting on a credential file only an operator can place`,
    `  ${EXIT.FAILED}  the work was attempted and failed`,
    `  ${EXIT.UNSUPPORTED}  the verb exists and the work behind it is not written yet`,
    '',
    'A malformed declaration never aborts the fleet: it is named, skipped, and the run',
    'continues with the rest. A run in which NOTHING was valid exits non-zero.',
  );

  return lines;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Target resolution
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * Read the host's declarations, and refuse a fleet whose instances OVERLAP.
 *
 * The overlap check is not a per-instance refusal and must not be skipped past like one: two
 * museums sharing a root cannot be provisioned even one at a time, because writing either
 * one writes into the other's tree. So it empties the target set for the WHOLE run — while a
 * loader that throws outright (an unreadable config directory) is left to propagate, because
 * that is "the host is not what this command was pointed at" rather than a bad declaration.
 *
 * Returns null when the fleet was refused; the caller turns that into REFUSED.
 */
function loadDeclarations(context: VerbContext): Fleet | null {
  const fleet = context.deps.loadFleet(context.args.configDir);
  try {
    context.deps.assertFleetDisjoint(fleet);
  } catch (error) {
    context.err(`provision: the declarations under ${fleet.dir} overlap — ${messageOf(error)}`);
    context.err(`  Nothing was planned for ANY instance: provisioning either of two overlapping`);
    context.err(`  instances writes into the other museum's tree, so this is not a refusal that`);
    context.err(`  one instance can be skipped past.`);
    return null;
  }
  return fleet;
}

interface Targets {
  readonly members: readonly FleetMember[];
  /** The exit code the refusals alone justify — OK when there were none. */
  readonly code: number;
}

/**
 * Work out which museums this run is about — P5, in one function.
 *
 * With `--all` the refusals of the whole host are this run's business. With `--instance`
 * they are NOT: an operator repairing one museum should not be told about another museum's
 * typo, and certainly should not have their exit code decided by it.
 */
function resolveTargets(context: VerbContext): Targets {
  const { args, err } = context;

  const fleet = loadDeclarations(context);
  if (fleet === null) return { members: [], code: EXIT.REFUSED };

  const named = new Set(args.instances);
  const refusals = args.all ? fleet.refusals : fleet.refusals.filter(refusal => named.has(refusal.instance));

  const selected: FleetMember[] = [];
  let code: number = EXIT.OK;

  if (args.all) {
    selected.push(...fleet.members);
  } else {
    for (const name of args.instances) {
      const found = fleet.members.find(member => member.instance === name);
      if (found) {
        selected.push(found);
        continue;
      }
      if (!refusals.some(refusal => refusal.instance === name)) {
        err(`provision: instance '${name}' is not declared under ${fleet.dir}.`);
        code = worse(code, EXIT.REFUSED);
      }
    }
  }

  for (const refusal of refusals) {
    err(`provision: refusing instance '${refusal.instance}' — ${refusal.reason}`);
    err(`  declaration: ${refusal.manifestPath}`);
    code = worse(code, EXIT.REFUSED);
  }

  if (selected.length === 0) {
    err(
      args.all
        ? `provision: no instance under ${fleet.dir} could be used. Nothing was done.`
        : `provision: none of the named instances could be used. Nothing was done.`,
    );
    code = worse(code, EXIT.REFUSED);
  }

  return { members: selected, code };
}

/**
 * OBSERVE, THEN PLAN — the two steps `check` and `apply` share, with their failures kept
 * apart because they are not the same event.
 *
 * An observation that fails is the HOST refusing to be read (a directory this process cannot
 * enter, a `systemctl` that is not there): that is a failure. A plan that throws is this
 * museum's DECLARATION being unprovisionable — an undeclared root, a file where a directory
 * must be — which `plan()` documents as refusing ONE instance while the rest of the fleet
 * carries on. Reporting both as the same number would tell an operator to go and look at the
 * wrong thing.
 */
type Planned = { readonly ok: true; readonly actions: readonly Action[] } | { readonly ok: false; readonly code: number };

function planFor(context: VerbContext, member: FleetMember, verb: string): Planned {
  const { deps, err } = context;

  let host: HostState;
  try {
    host = deps.observeHost(member.layout);
  } catch (error) {
    err(`provision: instance '${member.instance}' could not be ${verb} — this host would not be read: ${messageOf(error)}`);
    return { ok: false, code: EXIT.FAILED };
  }

  try {
    return { ok: true, actions: deps.plan(member.layout, member.manifest, host) };
  } catch (error) {
    err(`provision: refusing instance '${member.instance}' — ${messageOf(error)}`);
    err(`  Nothing was planned for it; the rest of the fleet is unaffected.`);
    return { ok: false, code: EXIT.REFUSED };
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * list
 * ──────────────────────────────────────────────────────────────────────────────────── */

function runList(context: VerbContext): number {
  const { args, out } = context;
  const targets = resolveTargets(context);

  for (const member of targets.members) {
    const layout = member.layout;

    if (args.engine) {
      // The pairing view: the three facts an operator needs when an engine cannot reach its
      // daemon, and nothing else to read past.
      out(`${layout.instance}`);
      out(`  socket    ${layout.socketPath}  (${layout.identity.user}:${layout.identity.engineGroup})`);
      out(`  fragment  ${layout.engineFragment}`);
      out('');
      continue;
    }

    out(`${layout.instance}${layout.description ? ` — ${layout.description}` : ''}`);
    out(`  identity     ${layout.identity.user}:${layout.identity.group}${layout.identity.adopted ? ' (adopted)' : ''}`);
    out(`  unit         ${layout.unitName}`);
    out(`  declaration  ${member.manifestPath}`);
    out(`  socket       ${layout.socketPath}`);
    if (layout.sites.length === 0) {
      out('  sites        none declared yet');
    } else {
      for (const site of layout.sites) {
        out(`  site         ${site.slug}  ${site.domain}  ${site.webspace}`);
      }
    }
    out('');
  }

  return targets.code;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * render
 * ──────────────────────────────────────────────────────────────────────────────────── */

function runRender(context: VerbContext): number {
  const { args, out, err } = context;
  const targets = resolveTargets(context);
  let code = targets.code;

  for (const member of targets.members) {
    let artifacts: readonly Artifact[];
    try {
      artifacts = renderAll(member.layout, member.manifest);
    } catch (error) {
      // A renderer refusing is a per-instance fact, so it is a per-instance refusal: the
      // rest of the fleet still renders (P5), and the message is the renderer's own.
      err(`provision: instance '${member.instance}' rendered nothing — ${messageOf(error)}`);
      code = worse(code, EXIT.REFUSED);
      continue;
    }

    const selected = args.engine ? artifacts.filter(item => item.kind === 'engine_fragment') : artifacts;
    for (const item of selected) {
      out(`# ── ${item.path}  (${item.owner}:${item.group} ${formatMode(item.mode)}, ${item.kind})`);
      for (const line of item.body.split('\n')) out(line);
      out('');
    }
  }

  return code;
}

/** A mode as an operator writes it: four octal digits, setgid bit included. */
function formatMode(mode: number): string {
  return `0${(mode & 0o7777).toString(8).padStart(4, '0')}`;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * check — P3: writes nothing, and its exit code is the CI assertion
 * ──────────────────────────────────────────────────────────────────────────────────── */

function runCheck(context: VerbContext): number {
  const { deps, out, err } = context;
  const targets = resolveTargets(context);
  let code = targets.code;
  let drifted = 0;

  for (const member of targets.members) {
    const planned = planFor(context, member, 'checked');
    if (!planned.ok) {
      code = worse(code, planned.code);
      continue;
    }

    // `check()` takes no io AT ALL — not an io it declines to use, none — which is what
    // makes this verb safe to run on a production host at any hour.
    const report = deps.check(planned.actions);

    // AWAITING FIRST, and non-zero. These are files only a human can put there — a provider
    // key, an adopted password file. Reporting them after "converged" would be reporting
    // them after the line an operator stops reading at, and exiting 0 on them would tell a
    // museum its daemon is provisioned when it cannot start.
    if (report.awaiting.length > 0) {
      code = worse(code, reportAwaiting(context, member.instance, report.awaiting));
    }

    if (!report.willChange) {
      out(
        report.awaiting.length > 0
          ? `${member.instance}: nothing to do beyond the file(s) above.`
          : `${member.instance}: converged — nothing to do.`,
      );
      continue;
    }

    drifted += 1;
    out(`${member.instance}: ${report.actions.length} action(s) pending${summarize(report)}`);
    for (const action of report.actions) out(`  ${deps.describe(action)}`);

    // The exact argv, verbatim, because that is what an operator is actually deciding about.
    if (report.execs.length > 0) {
      out('  commands:');
      for (const argv of report.execs) out(`    ${argv.join(' ')}`);
    }

    out('');
    code = worse(code, EXIT.DRIFT);
  }

  if (drifted > 0) {
    out(`${drifted} instance(s) have drifted from their declaration. Nothing was written.`);
  }

  return code;
}

/**
 * NAME THE FILES A HUMAN MUST PLACE, AND MAKE THE RUN NON-ZERO.
 *
 * `apply.ts` states the rule and leaves the code to this file: a caller that exits 0 with a
 * non-empty `awaiting` has told a museum its daemon is provisioned when it cannot start. It
 * is REFUSED rather than FAILED because nothing went wrong — the provisioner did everything
 * it is allowed to do, and what remains is a credential it must never invent.
 */
function reportAwaiting(context: VerbContext, instance: string, awaiting: readonly string[]): number {
  context.err(`provision: instance '${instance}' is waiting on ${awaiting.length} file(s) only an operator can place:`);
  for (const path of awaiting) context.err(`  ${path}`);
  context.err(`  The provisioner never invents a credential. Put them in place and run again.`);
  return EXIT.REFUSED;
}

/** `byKind` as one line, in a stable order — the summary an operator reads first. */
function summarize(report: CheckReport): string {
  const kinds = Object.entries(report.byKind).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (kinds.length === 0) return '';
  return `: ${kinds.map(([kind, count]) => `${count} ${kind}`).join(', ')}`;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * apply — P2 (dumb) and P4 (idempotent, at this seam)
 * ──────────────────────────────────────────────────────────────────────────────────── */

function runApply(context: VerbContext): number {
  const { deps, out, err } = context;
  const targets = resolveTargets(context);
  let code = targets.code;

  for (const member of targets.members) {
    const planned = planFor(context, member, 'applied');
    if (!planned.ok) {
      code = worse(code, planned.code);
      continue;
    }

    // IDEMPOTENCE IS A PROPERTY OF THE PLAN, and it is honoured here by not calling `apply`
    // at all. A converged instance must not reach it even to be told there is nothing to do:
    // `apply` is the module that touches the host, and the cheapest way to be certain a
    // second run writes nothing is for the second run not to enter it. An 'awaiting' action
    // is a NOTICE (a credential file only a human can place), so it is printed and does not
    // count as work.
    const work = planned.actions.filter(action => deps.changesTheHost(action));
    const notices = planned.actions.filter(action => !deps.changesTheHost(action));
    if (work.length === 0) {
      if (notices.length === 0) {
        out(`${member.instance}: converged — nothing to do.`);
        continue;
      }
      out(`${member.instance}: nothing this provisioner may do — ${notices.length} notice(s):`);
      for (const notice of notices) out(`  ${deps.describe(notice)}`);
      code = worse(code, reportAwaiting(context, member.instance, notices.map(notice => deps.describe(notice))));
      continue;
    }

    out(`${member.instance}: applying ${planned.actions.length} action(s)`);

    let report: ApplyReport;
    try {
      report = deps.apply(planned.actions, deps.hostIo());
    } catch (error) {
      err(`provision: instance '${member.instance}' failed while applying — ${messageOf(error)}`);
      code = worse(code, EXIT.FAILED);
      continue;
    }

    // One line per action, in the plan's own words plus what became of it. "Skipped" is
    // printed like everything else: silence must not read as success.
    for (const outcome of report.outcomes) {
      out(`  ${outcome.status.padEnd(7)} ${deps.describe(outcome.action)}`);
      if (outcome.detail) out(`          ${outcome.detail}`);
    }

    if (!report.ok) {
      err(`provision: instance '${member.instance}' stopped at: ${report.failure ? deps.describe(report.failure.action) : 'an unnamed action'}`);
      if (report.failure?.detail) err(`  ${report.failure.detail}`);
      code = worse(code, EXIT.FAILED);
      continue;
    }

    out(
      `${member.instance}: ${report.done} done, ${report.skipped} skipped, ` +
        `${report.written.length} file(s) written${report.changed ? '' : ' — nothing on this host changed'}.`,
    );
    if (report.awaiting.length > 0) {
      code = worse(code, reportAwaiting(context, member.instance, report.awaiting));
    }
    out('');
  }

  return code;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * adopt — arguments and refusals real, inference deferred
 * ──────────────────────────────────────────────────────────────────────────────────── */

function runAdopt(context: VerbContext): number {
  const { args, out, err } = context;
  const instance = args.instances[0] ?? '';

  const fleet = loadDeclarations(context);
  if (fleet === null) return EXIT.REFUSED;

  // THE ONE REFUSAL ADOPT CAN ALREADY MAKE, and it is the important one: adopt WRITES a
  // declaration, and a declaration that already exists is either hand-written or the output
  // of a previous adopt. Overwriting it would replace the file every other artifact on this
  // host is generated from — with an inference, silently.
  const existing = fleet.members.find(member => member.instance === instance);
  if (existing) {
    err(`provision adopt: instance '${instance}' is already declared at ${existing.manifestPath}.`);
    err(`  Adopt WRITES a declaration; it will not replace one. Edit that file and run 'apply'.`);
    return EXIT.REFUSED;
  }
  const refused = fleet.refusals.find(refusal => refusal.instance === instance);
  if (refused) {
    err(`provision adopt: instance '${instance}' already has a declaration, and it is refused — ${refused.reason}`);
    err(`  declaration: ${refused.manifestPath}`);
    err(`  Repair that file rather than adopting over it: adopt would overwrite the evidence.`);
    return EXIT.REFUSED;
  }

  out(`provision adopt: nothing was read from this host and nothing was written.`);
  out('');
  out(VERBS.adopt?.deferred ?? '');
  out('');
  out(`Until then, an existing host is brought under the provisioner by hand:`);
  out(`  1. write ${fleet.dir}/${instance}/instance.json, declaring the identity, the roots`);
  out(`     and the paths the host ALREADY uses — 'identity' and 'paths' exist in the`);
  out(`     declaration precisely so an adopted host keeps its own names;`);
  out(`  2. run 'provision check --instance ${instance}' and read every action it plans`);
  out(`     BEFORE running apply. On an adopted host, the plan is the review.`);

  return EXIT.UNSUPPORTED;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * remove — P6: the refusals are real; the removal itself is Phase 8
 * ──────────────────────────────────────────────────────────────────────────────────── */

function runRemove(context: VerbContext): number {
  const { args, exists, out, err } = context;
  const instance = args.instances[0] ?? '';

  const fleet = loadDeclarations(context);
  if (fleet === null) return EXIT.REFUSED;

  const member = fleet.members.find(candidate => candidate.instance === instance);
  if (!member) {
    const refused = fleet.refusals.find(refusal => refusal.instance === instance);
    if (refused) {
      err(`provision remove: instance '${instance}' is declared but refused — ${refused.reason}`);
      err(`  A declaration this provisioner cannot read is a declaration it will not act on.`);
    } else {
      err(`provision remove: instance '${instance}' is not declared under ${fleet.dir}.`);
    }
    return EXIT.REFUSED;
  }

  const layout = member.layout;

  // P6, FIRST HALF: A PUBLISHED SITE IS A MUSEUM'S LIVE WEBSITE. The served surface is a
  // symlink the publish path maintains, so its presence is the honest question to ask — not
  // "was this instance in use", which nothing on a host can answer.
  const published = layout.sites.filter(site => exists(site.linkPath('prod')));
  if (published.length > 0 && !args.purgePublished) {
    err(`provision remove: instance '${instance}' still publishes ${published.length} site(s):`);
    for (const site of published) err(`  ${site.slug}  ${site.domain}  ${site.linkPath('prod')}`);
    err('');
    err(`Nothing was removed. Taking a museum's public website down is an explicit act, never a`);
    err(`side effect of decommissioning a daemon. Re-run with --purge-published once the site is`);
    err(`genuinely retired — and note that even then the bytes are ARCHIVED, never deleted.`);
    return EXIT.REFUSED;
  }

  out(`provision remove: instance '${instance}' — this is what removal WOULD do.`);
  out('');
  if (published.length > 0) {
    out(`  --purge-published was given: ${published.length} published site(s) are included.`);
    for (const site of published) out(`    ${site.slug}  ${site.domain}`);
    out('');
  }
  out(`  1. stop and disable ${layout.unitName}, then reload systemd.`);
  out(`  2. remove the artifacts this provisioner generated, and only those — every one`);
  out(`     carries its stamp, so a hand-written file at the same path is left alone:`);
  out(`       ${layout.unitPath}`);
  out(`       ${layout.envFile}`);
  out(`       ${layout.engineFragment}`);
  for (const site of layout.sites) {
    out(`       ${site.vhostPaths.prod}`);
    out(`       ${site.vhostPaths.preprod}`);
  }
  out(`  3. ARCHIVE, never delete. Each webspace and each state root is renamed beside`);
  out(`     itself as '<path>.retired-<utc-timestamp>' and left on disk:`);
  for (const site of layout.sites) out(`       ${site.webspace}`);
  out(`       ${layout.roots.workspaces}`);
  out(`       ${layout.roots.home}`);
  out(`     The audit trail (${layout.auditFile}) is kept exactly as it is — the record of a`);
  out(`     museum's site being built is not deleted because the tenancy ended.`);
  out(`  4. KEEP THE IDENTITY. The account ${layout.identity.user} is locked and NOT deleted,`);
  out(`     and neither is the group ${layout.identity.group}. Deleting the user frees its uid`);
  out(`     for the next 'useradd' on this host — and every archived byte above is owned by`);
  out(`     that NUMBER, not by that name, so the next museum would inherit this one's files`);
  out(`     by accident. A uid is never reused here, which is also why the instance NAME stays`);
  out(`     retired: the identity is derived from it.`);
  out('');
  out(VERBS.remove?.deferred ?? '');

  return EXIT.UNSUPPORTED;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Wiring
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** Options a caller (or the gate) may substitute. Every one of them defaults to the host. */
export interface RunOptions {
  readonly deps?: ProvisionDeps;
  readonly out?: (line: string) => void;
  readonly err?: (line: string) => void;
  readonly exists?: (path: string) => boolean;
}

/** Refuse a target selection the verb cannot honour, before anything is loaded. */
function validateTarget(verb: string, spec: VerbSpec, args: ProvisionArgs): string | null {
  if (args.engine && !spec.acceptsEngine) {
    return (
      `provision: --engine is only meaningful for 'render' and 'list'. A plan is not filterable ` +
      `by artifact: '${verb}' converges an instance or it does nothing, and a half-provisioned ` +
      `instance is the state this subsystem exists to make impossible.`
    );
  }

  if (spec.targets === 'fleet') {
    if (args.all && args.instances.length > 0) {
      return `provision: --all and --instance are exclusive. Name the instances, or name none of them.`;
    }
    if (!args.all && args.instances.length === 0) {
      return (
        `provision: '${verb}' needs --instance <name> or --all. A verb that guesses its own ` +
        `targets on a host with six museums on it is not a verb anyone should have.`
      );
    }
    return null;
  }

  // 'one': adopt and remove act on a single tenancy, and --all is REFUSED rather than
  // supported. Decommissioning or adopting a whole host in one keystroke is not an operation
  // that should have a flag.
  if (args.all) {
    return (
      `provision: '${verb}' acts on ONE instance; --all is refused. Removing or adopting a whole ` +
      `host in one keystroke is not an operation this command offers.`
    );
  }
  if (args.instances.length !== 1) {
    return `provision: '${verb}' needs exactly one --instance <name>.`;
  }
  return null;
}

/**
 * RUN THE COMMAND AND RETURN AN EXIT CODE. It never calls `process.exit` — the module entry
 * at the bottom does that, once, so this function stays callable from a gate and from
 * another script without taking the process down with it.
 */
export function run(argv: readonly string[], options: RunOptions = {}): number {
  const rawOut = options.out ?? ((line: string) => process.stdout.write(`${line}\n`));
  const rawErr = options.err ?? ((line: string) => process.stderr.write(`${line}\n`));
  const out = guarded(rawOut);
  const err = guarded(rawErr);

  try {
    const parsed = parseArgs(argv);
    if (!parsed.ok) {
      err(parsed.message);
      err('');
      for (const line of usageLines()) err(line);
      return EXIT.USAGE;
    }
    const args = parsed.args;

    if (args.help) {
      for (const line of usageLines()) out(line);
      return EXIT.OK;
    }

    if (args.verb === null) {
      err(`provision: no verb given.`);
      err('');
      for (const line of usageLines()) err(line);
      return EXIT.USAGE;
    }

    const spec = VERBS[args.verb];
    if (!spec) {
      err(`provision: '${args.verb}' is not a verb. The verbs are: ${Object.keys(VERBS).join(', ')}.`);
      err('');
      for (const line of usageLines()) err(line);
      return EXIT.USAGE;
    }

    const invalid = validateTarget(args.verb, spec, args);
    if (invalid !== null) {
      err(invalid);
      return EXIT.USAGE;
    }

    const deps = options.deps ?? hostDeps();
    const exists = options.exists ?? existsSync;

    return spec.run({ args, deps, out, err, exists });
  } catch (error) {
    // The last resort. Anything that reached here — a config directory that cannot be read,
    // a guard that refused to print a secret — is a run in which the host was left as it was
    // found, and the message says which.
    try {
      err(`provision: ${messageOf(error)}`);
    } catch {
      // The secret guard fired ON THE ERROR MESSAGE ITSELF. Say so without it: a message
      // carrying a credential is the one message that must not be printed in order to
      // explain why a message was not printed.
      rawErr(`provision: failed, and the failure message was itself refused for carrying a credential-shaped value.`);
    }
    return EXIT.FAILED;
  }
}

/** An error's message, never its stack: a stack in an operator's terminal is not evidence. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (import.meta.main) {
  process.exit(run(Bun.argv.slice(2)));
}
