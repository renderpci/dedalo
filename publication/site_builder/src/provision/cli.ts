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
 *   4. WHAT EACH VERB HONESTLY DOES. No verb is partial: `adopt` and `remove` were, for as
 *      long as they were argument handling in front of unwritten work, and the honest form
 *      of that was an exit code saying so rather than a summary implying otherwise. Both do
 *      their work now, the code is gone, and `--help` is GENERATED from the verb table — so
 *      a claim in this file and a claim in the help cannot disagree.
 *
 * THE SIBLINGS ARE REACHED THROUGH `ProvisionDeps`, injected. Not for mockery's sake: the
 * gate for this file has to drive the refusals, the exit codes and the fleet arithmetic
 * WITHOUT a host to provision, and a CLI that calls `observeHost()` directly can only be
 * tested by observing something. `hostDeps()` is the real wiring and is nine lines long.
 */

import { join } from 'node:path';

import { DEFAULT_PATHS, derive } from './layout';
import type { InstanceLayout, InstanceManifest } from './layout';
import { CREDENTIAL_NAME_PATTERN } from './schema';
import { renderAll } from './render';
import type { Artifact } from './render';
import { TOKEN_PLACEHOLDER } from './render/engine_fragment';
import { assertFleetDisjoint, loadFleet } from './fleet';
import type { Fleet, FleetMember, FleetMembers } from './fleet';
import { changesTheHost, describe, orphanedVhosts, plan } from './plan';
import type { Action, HostState, OrphanedVhost } from './plan';
import { apply, check, hostIo, observeHost } from './apply';
import type { ApplyReport, CheckReport, ProvisionIo } from './apply';
import {
  LEGACY_UNIT_PATH,
  RETIRED_ENV,
  adoptIo,
  applyMigration,
  describeMigration,
  inferManifest,
  migrationSteps,
  observePreInstance,
} from './adopt';
import type { AdoptIo, AdoptOverlay, InferOptions, MigrationReport, MigrationStep, PreInstance } from './adopt';
import { describeVerdict, expectationsFor, relocateExpectations, verifyServing } from './verify';
import type { ServedSite, ServingReport, SurfaceExpectation } from './verify';
import {
  applyRemoval,
  changesTheHost as removalChangesTheHost,
  describeRemoval,
  observeForRemoval,
  publishedSites,
  removalIo,
  removalPlan,
} from './remove';
import type { RemovalHost, RemovalIo, RemovalReport, RemovalStep } from './remove';

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
 * THERE IS NO 'UNSUPPORTED'. There was, for exactly as long as `adopt` and `remove` were
 * argument handling in front of unwritten work — a verb that did nothing and exited 0 would
 * read, in a script, exactly like a verb that worked, so it exited 5 and said so. Both verbs
 * do their work now, so the code is gone rather than kept as a number nothing returns: a
 * documented exit code no path produces is a promise to a script that will never be kept.
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
});

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/**
 * WHICH CODE SURVIVES when one run produces several. A `--all` run over six museums can
 * simultaneously fail on one, refuse another and find drift on a third; it returns ONE
 * number, and that number must be the most serious thing that happened. Ranked worst-first,
 * so a reader reads the order rather than inferring it from arithmetic.
 */
const EXIT_SEVERITY: readonly number[] = [EXIT.FAILED, EXIT.REFUSED, EXIT.DRIFT, EXIT.OK];

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
 * Note what is NOT here: no writer, no filesystem, no exec of this file's own. Every module
 * that touches a host takes an INJECTED io — `apply` its `ProvisionIo`, adoption its
 * `AdoptIo`, removal its `RemovalIo` — and this file's only role is to hand each one the
 * seam this record produces. It used to keep a bare `existsSync` for the one question
 * `remove` asked before refusing; that question is `publishedSites()`'s now, because "is
 * this site published" is a fact about a link's TARGET and not about a path existing, and a
 * front end answering it for itself is a front end deciding something about the host.
 */
export interface ProvisionDeps {
  loadFleet(dir: string): Fleet;
  assertFleetDisjoint(fleet: FleetMembers): void;
  observeHost(layout: InstanceLayout, manifest: InstanceManifest): HostState;
  plan(layout: InstanceLayout, manifest: InstanceManifest, host: HostState): Action[];
  /** The generated vhosts this host still holds that no declared site would produce. */
  orphanedVhosts(layout: InstanceLayout, host: HostState): OrphanedVhost[];
  /** The plan's own words. One voice: a `check` line and an `apply` line are the same line. */
  describe(action: Action): string;
  /** Would this action touch the host? An 'awaiting' file is a notice, not work. */
  changesTheHost(action: Action): boolean;
  apply(actions: readonly Action[], io: ProvisionIo): ApplyReport;
  check(actions: readonly Action[]): CheckReport;
  hostIo(): ProvisionIo;

  /* ── adoption. The declaration is INFERRED here and provisioned by plan/apply above. ── */
  adoptIo(): AdoptIo;
  observePreInstance(source: { from: string; legacyUnitPath: string }, io: AdoptIo): PreInstance;
  inferManifest(pre: PreInstance, options: InferOptions): InstanceManifest;
  derive(manifest: InstanceManifest): InstanceLayout;
  migrationSteps(pre: PreInstance, layout: InstanceLayout, manifest: InstanceManifest): MigrationStep[];
  describeMigration(step: MigrationStep): string;
  applyMigration(steps: readonly MigrationStep[], pre: PreInstance, io: AdoptIo): MigrationReport;

  /* ── the serving proof, run before AND after every migration. ── */
  expectationsFor(layout: InstanceLayout, sites: readonly ServedSite[], io: AdoptIo): SurfaceExpectation[];
  /** The same claims, at the address the migration moved each surface to. */
  relocateExpectations(
    expectations: readonly SurfaceExpectation[],
    layout: InstanceLayout,
  ): SurfaceExpectation[];
  verifyServing(expectations: readonly SurfaceExpectation[], io: AdoptIo): ServingReport;

  /* ── decommissioning. ── */
  removalIo(base: AdoptIo): RemovalIo;
  publishedSites(layout: InstanceLayout, io: AdoptIo): { slug: string; domain: string; release: string }[];
  observeForRemoval(layout: InstanceLayout, artifacts: readonly Artifact[], io: RemovalIo): RemovalHost;
  removalPlan(layout: InstanceLayout, artifacts: readonly Artifact[], host: RemovalHost, at: Date): RemovalStep[];
  describeRemoval(step: RemovalStep): string;
  removalChangesTheHost(step: RemovalStep): boolean;
  applyRemoval(steps: readonly RemovalStep[], io: RemovalIo): RemovalReport;
}

/** The real wiring. The only place in this file that knows the siblings by name. */
export function hostDeps(): ProvisionDeps {
  return {
    loadFleet,
    assertFleetDisjoint,
    observeHost,
    plan,
    orphanedVhosts,
    describe,
    changesTheHost,
    apply,
    check,
    hostIo,
    adoptIo,
    observePreInstance,
    inferManifest,
    derive,
    migrationSteps,
    describeMigration,
    applyMigration,
    expectationsFor,
    relocateExpectations,
    verifyServing,
    removalIo,
    publishedSites,
    observeForRemoval,
    removalPlan,
    describeRemoval,
    removalChangesTheHost,
    applyRemoval,
  };
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

/**
 * THE OPTIONAL FLAGS, as a closed list.
 *
 * Every verb states which of them it honours (`VerbSpec.flags`) and which it requires
 * (`VerbSpec.requires`), and `validateTarget` refuses anything else BY NAME. Before this
 * list existed only `--engine` was policed, so `provision apply --purge-published` was
 * accepted and silently ignored — an operator's typo reading, from the exit code, exactly
 * like the command they meant to type. On a host with six museums that is not a nicety.
 */
export const OPTIONAL_FLAGS = ['engine', 'purgePublished', 'from', 'declare', 'unit'] as const;
export type OptionalFlag = (typeof OPTIONAL_FLAGS)[number];

/** How each one is spelled on a command line — for the refusals and for `--help`. */
const FLAG_SPELLING: Readonly<Record<OptionalFlag, string>> = Object.freeze({
  engine: '--engine',
  purgePublished: '--purge-published',
  from: '--from',
  declare: '--declare',
  unit: '--unit',
});

/** The parsed command line. Every field is decided here and nowhere else. */
export interface ProvisionArgs {
  readonly verb: string | null;
  /** Explicitly named instances, in the order given. Empty when `--all` was used. */
  readonly instances: readonly string[];
  readonly all: boolean;
  readonly engine: boolean;
  readonly purgePublished: boolean;
  /** `adopt`: the pre-instance install directory — the one holding the `.env`. */
  readonly from: string | null;
  /** `adopt`: a JSON fragment of the declaration, merged over everything inferred. */
  readonly declare: string | null;
  /** `adopt`: the installed pre-instance unit, whose User=/Group= is the museum's identity. */
  readonly unit: string | null;
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
/**
 * THE OPTIONS THAT TAKE A VALUE, as a table.
 *
 * Five of them, and they were five identical `case` blocks — take the value, refuse an empty
 * one with a sentence, assign it — which is five chances to write the refusal differently and
 * one function nobody can read at a glance. The table states each one's noun and where it
 * goes; the loop below has one branch for all five.
 */
const VALUE_OPTIONS: Readonly<Record<string, { readonly needs: string; readonly take: (state: MutableArgs, value: string) => void }>> =
  Object.freeze({
    '--instance': { needs: 'an instance name', take: (state, value) => state.instances.push(value) },
    '--config-dir': { needs: 'a directory', take: (state, value) => void (state.configDir = value) },
    '--from': { needs: 'the pre-instance install directory', take: (state, value) => void (state.from = value) },
    '--declare': { needs: 'a JSON file', take: (state, value) => void (state.declare = value) },
    '--unit': { needs: 'the path of the installed unit', take: (state, value) => void (state.unit = value) },
  });

/** The flags that are simply present or absent. One name, one field. */
const BOOLEAN_OPTIONS: Readonly<Record<string, (state: MutableArgs) => void>> = Object.freeze({
  '--help': state => void (state.help = true),
  '-h': state => void (state.help = true),
  '--all': state => void (state.all = true),
  '--engine': state => void (state.engine = true),
  '--purge-published': state => void (state.purgePublished = true),
});

/** The parse's own accumulator — `ProvisionArgs` before it is frozen into one. */
interface MutableArgs {
  verb: string | null;
  instances: string[];
  all: boolean;
  engine: boolean;
  purgePublished: boolean;
  from: string | null;
  declare: string | null;
  unit: string | null;
  configDir: string;
  help: boolean;
}

export function parseArgs(argv: readonly string[]): ParseResult {
  const state: MutableArgs = {
    verb: null,
    instances: [],
    all: false,
    engine: false,
    purgePublished: false,
    from: null,
    declare: null,
    unit: null,
    configDir: DEFAULT_PATHS.configBase,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? '';

    if (!token.startsWith('-')) {
      if (state.verb !== null) {
        return {
          ok: false,
          message: `provision: unexpected argument '${token}' — one verb per run (already reading '${state.verb}').`,
        };
      }
      state.verb = token;
      continue;
    }

    // `--flag=value` and `--flag value` are both accepted: the first is what a script
    // writes, the second is what a person types, and refusing either would be a trap.
    const equals = token.indexOf('=');
    const name = equals === -1 ? token : token.slice(0, equals);
    const inlineValue = equals === -1 ? null : token.slice(equals + 1);

    const boolean = BOOLEAN_OPTIONS[name];
    if (boolean) {
      boolean(state);
      continue;
    }

    const option = VALUE_OPTIONS[name];
    if (!option) {
      return {
        ok: false,
        message: `provision: unknown option '${name}'. Nothing was read and nothing was written.`,
      };
    }

    let value = inlineValue;
    if (value === null) {
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith('-')) {
        value = next;
        index += 1;
      }
    }
    if (value === null || value.length === 0) {
      return { ok: false, message: `provision: ${name} needs ${option.needs}.` };
    }
    option.take(state, value);
  }

  return { ok: true, args: { ...state, instances: state.instances } };
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
}

interface VerbSpec {
  /** One line for `--help`. */
  readonly summary: string;
  /** 'fleet' takes `--instance` or `--all`; 'one' takes exactly one `--instance`. */
  readonly targets: 'fleet' | 'one';
  /** The optional flags this verb honours. Anything else given is REFUSED, by name. */
  readonly flags: readonly OptionalFlag[];
  /** The optional flags this verb cannot run without. */
  readonly requires?: readonly OptionalFlag[];
  run(context: VerbContext): number;
}

/**
 * THE CLOSED VERB TABLE — the only list of verbs in this file.
 *
 * `--help` is GENERATED from it, so the help text cannot document a verb that does not exist
 * nor omit one that does, and the gate asserts both directions against these keys. Same
 * argument `RENDERER_BY_KIND` makes about the renderers: a hand-written second list is
 * a list that will one day be wrong, and it will be wrong exactly when someone is reading it.
 */
export const VERBS: Readonly<Record<string, VerbSpec>> = Object.freeze({
  apply: {
    summary: 'converge the host onto the declaration — writes only what drifted',
    targets: 'fleet',
    flags: [],
    run: runApply,
  },
  check: {
    summary: 'plan without touching anything; exit 1 when the host has drifted',
    targets: 'fleet',
    flags: [],
    run: runCheck,
  },
  render: {
    summary: 'print the artifacts the declaration renders to; writes nothing',
    targets: 'fleet',
    flags: ['engine'],
    run: runRender,
  },
  list: {
    summary: 'list the declared instances, their identities and their sites',
    targets: 'fleet',
    flags: ['engine'],
    run: runList,
  },
  adopt: {
    summary: 'bring a hand-built install under the provisioner — infers, migrates, converges, proves',
    targets: 'one',
    flags: ['from', 'declare', 'unit'],
    requires: ['from'],
    run: runAdopt,
  },
  remove: {
    summary: 'decommission an instance — refuses while a site is published; archives, never deletes',
    targets: 'one',
    flags: ['purgePublished'],
    run: runRemove,
  },
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * Help
 * ──────────────────────────────────────────────────────────────────────────────────── */

const VERB_COLUMN = 8;

/** The verbs that honour one flag, quoted — so the help and the refusals read the table. */
function verbsAccepting(flag: OptionalFlag): string {
  const names = Object.entries(VERBS)
    .filter(([, spec]) => spec.flags.includes(flag))
    .map(([name]) => `'${name}'`);
  return names.length <= 1 ? (names[0] ?? '(no verb)') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

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
    const required = (spec.requires ?? []).map(flag => `${FLAG_SPELLING[flag]} <value>`);
    if (required.length > 0) {
      lines.push(`  ${' '.repeat(VERB_COLUMN)}requires ${required.join(' and ')}`);
    }
  }

  lines.push(
    '',
    'Options:',
    `  --instance <name>   the instance to act on; repeat it to name several`,
    `  --all               every instance declared under the config directory`,
    `  --engine            ${verbsAccepting('engine')} only: the engine pairing fragment alone`,
    `  --purge-published   ${verbsAccepting('purgePublished')} only: proceed even though a site is still published`,
    `  --from <dir>        ${verbsAccepting('from')} only: the pre-instance install directory holding its .env`,
    `  --declare <file>    ${verbsAccepting('declare')} only: a JSON fragment merged over everything inferred`,
    `  --unit <path>       ${verbsAccepting('unit')} only: the installed pre-instance unit`,
    `                      (default ${LEGACY_UNIT_PATH})`,
    `  --config-dir <dir>  where the declarations live (default ${DEFAULT_PATHS.configBase})`,
    `  --help, -h          this text`,
    '',
    'Exit codes:',
    `  ${EXIT.OK}  the run did what it was asked, or there was nothing to do`,
    `  ${EXIT.DRIFT}  'check' only: the host has drifted from its declaration (nothing written)`,
    `  ${EXIT.USAGE}  the command line was not understood`,
    `  ${EXIT.REFUSED}  an instance was refused — malformed, unknown, overlapping, still publishing,`,
    `     or waiting on a credential file only an operator can place`,
    `  ${EXIT.FAILED}  the work was attempted and failed — including an adoption that could not`,
    `     PROVE, afterwards, that every site still serves the release it served before`,
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

/**
 * THE FLEET, READ BUT NOT POLICED — the loader for the one verb that must work on a broken
 * host.
 *
 * The disjointness law refuses a whole host, which is right for every verb that WRITES: two
 * declarations sharing a root cannot be provisioned even one at a time. It is exactly wrong
 * for `remove`. A collision on this host is a state somebody has to be able to get out of,
 * and the way out is to take one of the two colliding instances off the box — so a `remove`
 * that refused on the collision would be a trap with no exit, and the operator's only
 * remaining move would be to edit `/etc/` by hand, which is how this subsystem's whole class
 * of defect starts.
 *
 * The collision is REPORTED, in full and by name. It is a fact about the host that an
 * operator removing an instance needs to see; what it is not is a reason to stop.
 */
function loadDeclarationsForRemoval(context: VerbContext): Fleet {
  const fleet = context.deps.loadFleet(context.args.configDir);
  try {
    context.deps.assertFleetDisjoint(fleet);
  } catch (error) {
    context.err(`provision remove: the declarations under ${fleet.dir} overlap — ${messageOf(error)}`);
    context.err(`  This is NOT a refusal: taking one of the colliding instances off this host is`);
    context.err(`  how the collision is resolved, and a verb that refused here would leave an`);
    context.err(`  operator with no way out but editing ${fleet.dir} by hand.`);
    context.err('');
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
type Planned =
  | { readonly ok: true; readonly actions: readonly Action[]; readonly host: HostState }
  | { readonly ok: false; readonly code: number };

function planFor(context: VerbContext, member: FleetMember, verb: string): Planned {
  const { deps, err } = context;

  let host: HostState;
  try {
    host = deps.observeHost(member.layout, member.manifest);
  } catch (error) {
    err(`provision: instance '${member.instance}' could not be ${verb} — this host would not be read: ${messageOf(error)}`);
    return { ok: false, code: EXIT.FAILED };
  }

  try {
    return { ok: true, actions: deps.plan(member.layout, member.manifest, host), host };
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

    // A SITE THE DECLARATION DROPPED IS STILL BEING SERVED. Reported before the plan and
    // counted as drift: this is the one kind of divergence a converged host can have and
    // still print "nothing to do", which is exactly why it must not be a footnote.
    const orphans = deps.orphanedVhosts(member.layout, planned.host);
    if (orphans.length > 0) {
      reportOrphans(context, member.instance, orphans);
      code = worse(code, EXIT.DRIFT);
    }

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

/**
 * NAME EVERY SITE THE DECLARATION DROPPED AND THE HOST STILL SERVES.
 *
 * Removing a site from `sites[]` un-declares it and nothing else: its two vhosts stay on the
 * host, stay enabled, and stay pointed at a webspace that still holds every release, so the
 * public site goes on answering with nothing in the declaration saying it exists. The
 * provisioner will not undo that for you — it would be a deletion, and this subsystem
 * archives rather than deletes — so what it owes you is the exact list, with the paths, and
 * a non-zero run.
 */
function reportOrphans(context: VerbContext, instance: string, orphans: readonly OrphanedVhost[]): void {
  const { err } = context;
  const enabled = orphans.filter(orphan => orphan.enabled).length;
  err(
    `provision: instance '${instance}' still holds ${orphans.length} generated vhost(s) that no ` +
      `declared site would produce${enabled > 0 ? `, ${enabled} of them ENABLED and being served` : ''}:`,
  );
  for (const orphan of orphans) err(`  ${orphan.path}${orphan.enabled ? '   (enabled)' : ''}`);
  err(`  Undeclaring a site does not un-provision it: the vhost stays, the link that enables it`);
  err(`  stays, and the webspace still holds every release — so the site is still on the`);
  err(`  internet with nothing in the declaration saying it exists. This provisioner never`);
  err(`  deletes, so it will not take them away: put the site back in the declaration if that`);
  err(`  was a mistake, or retire it by hand (remove the enabled link, test and reload the web`);
  err(`  server, then move the webspace aside) if it was not.`);
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
  const targets = resolveTargets(context);
  let code = targets.code;
  for (const member of targets.members) {
    code = worse(code, convergeOne(context, member));
  }
  return code;
}

/**
 * CONVERGE ONE MUSEUM — the body `apply` runs per instance, and the body `adopt` runs after
 * it has written the declaration.
 *
 * It is one function because adoption is NOT a second provisioner. Every rule about what a
 * host should end up holding — the group before the user, the marker before the children,
 * the configtest before the reload, write-only-on-drift — is in `plan()`, and an adoption
 * path that re-implemented even the calling of it would be a second place those rules could
 * be got wrong. What adoption adds is the declaration and the credentials; the converging is
 * this, unchanged.
 */
function convergeOne(context: VerbContext, member: FleetMember): number {
  const { deps, out, err } = context;

  const planned = planFor(context, member, 'applied');
  if (!planned.ok) return planned.code;

  // IDEMPOTENCE IS A PROPERTY OF THE PLAN, and it is honoured here by not calling `apply`
  // at all. A converged instance must not reach it even to be told there is nothing to do:
  // `apply` is the module that touches the host, and the cheapest way to be certain a
  // second run writes nothing is for the second run not to enter it. An 'awaiting' action
  // is a NOTICE (a credential file only a human can place), so it is printed and does not
  // count as work.
  // Same notice as `check`'s, on the verb that writes: `apply` cannot repair it (removing a
  // site's vhost and webspace is a deletion, and this provisioner does not delete), so it is
  // reported and the run is non-zero. Exiting 0 here would tell an operator the host matches
  // its declaration while it goes on serving a site nobody declared.
  const orphans = deps.orphanedVhosts(member.layout, planned.host);
  if (orphans.length > 0) reportOrphans(context, member.instance, orphans);

  const work = planned.actions.filter(action => deps.changesTheHost(action));
  const notices = planned.actions.filter(action => !deps.changesTheHost(action));
  if (work.length === 0) {
    if (notices.length === 0) {
      out(`${member.instance}: converged — nothing to do.`);
      return EXIT.OK;
    }
    out(`${member.instance}: nothing this provisioner may do — ${notices.length} notice(s):`);
    for (const notice of notices) out(`  ${deps.describe(notice)}`);
    return reportAwaiting(context, member.instance, notices.map(notice => deps.describe(notice)));
  }
  const orphanCode = orphans.length > 0 ? EXIT.REFUSED : EXIT.OK;

  out(`${member.instance}: applying ${planned.actions.length} action(s)`);

  let report: ApplyReport;
  try {
    report = deps.apply(planned.actions, deps.hostIo());
  } catch (error) {
    err(`provision: instance '${member.instance}' failed while applying — ${messageOf(error)}`);
    return EXIT.FAILED;
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
    return EXIT.FAILED;
  }

  out(
    `${member.instance}: ${report.done} done, ${report.skipped} skipped, ` +
      `${report.written.length} file(s) written${report.changed ? '' : ' — nothing on this host changed'}.`,
  );
  const code = report.awaiting.length > 0 ? reportAwaiting(context, member.instance, report.awaiting) : EXIT.OK;
  out('');
  return worse(code, orphanCode);
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * adopt — infer, migrate, converge, PROVE
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * TURN A HAND-BUILT INSTALL INTO INSTANCE N=1 OF THE SAME MECHANISM.
 *
 * Six moves, and the first and the last are the same one:
 *
 *   1. READ the pre-instance install and CAPTURE what every site is serving.
 *   2. PROVE, before anything is written, that this install can be proved at all. An install
 *      whose production link already disagrees with its own manifest is refused here —
 *      afterwards there would be no way to tell a pre-existing disagreement from one this
 *      migration caused, and "the migration is done" would be unsayable.
 *   3. INFER the declaration, verbatim: this museum's identity and its roots, exactly as
 *      they are on disk, so nothing moves and no site is republished.
 *   4. MIGRATE what `plan()` structurally cannot — write the declaration, move the
 *      credentials into root-owned 0600 files, retire the old env by RENAMING it, stop and
 *      disable the pre-instance unit.
 *   5. CONVERGE through the ordinary `plan()`/`apply()`: the missing group, the markers, the
 *      unit, the vhosts, `sites.json`, the pairing fragment, the new service enabled.
 *   6. PROVE AGAIN, against the expectations captured in step 1. This is the gate on
 *      declaring the migration done, and a failure here is FAILED and not DRIFT: a museum
 *      whose live site cannot be proved to still serve is not a museum that has been
 *      migrated, whatever else succeeded.
 */
function runAdopt(context: VerbContext): number {
  const { args, deps, out, err } = context;
  const instance = args.instances[0] ?? '';

  const fleet = loadDeclarations(context);
  if (fleet === null) return EXIT.REFUSED;

  const refusal = adoptionIsAllowed(context, fleet, instance);
  if (refusal !== null) return refusal;

  const io = deps.adoptIo();
  const overlay = readOverlay(context, io);
  if (overlay === null) return EXIT.USAGE;

  const inferred = inferForAdoption(context, io, instance, overlay);
  if (typeof inferred === 'number') return inferred;
  const { pre, manifest, layout } = inferred;
  announce(context, instance, pre, layout);

  // THE FLEET LAW, BEFORE ANYTHING IS WRITTEN. Every other verb is checked against the
  // declarations already on the host; adoption is the one that ADDS one, and it was adding
  // it unchecked — so a museum inferred onto a domain, a webspace or a root another museum
  // already holds was provisioned on top of it, and the collision it created then refused
  // every subsequent verb for the whole host. Asked here, at the last moment before the
  // first byte, so the answer is about the declaration this run actually inferred.
  const collision = fleetWouldCollide(context, fleet, layout, instance);
  if (collision !== null) return collision;

  const proved = proveBeforeWriting(context, io, pre, layout, instance);
  if (typeof proved === 'number') return proved;
  const expectations = proved;

  const migrated = migrate(context, io, pre, layout, manifest, instance);
  if (migrated !== EXIT.OK) return migrated;

  const member: FleetMember = { instance, manifestPath: layout.manifestPath, manifest, layout };
  const converged = convergeOne(context, member);

  // THE PROOF IS RUN WHATEVER THE CONVERGENCE SAID. A half-converged host that has moved a
  // museum's served link is the state an operator most needs named, and skipping the check
  // because an earlier step reported trouble is how that state goes unreported.
  // THE SAME CLAIMS, AT THE ADDRESS THEY NOW LIVE AT. A pre-instance install keeps its
  // surfaces under two shared roots and the derived layout keeps each site's inside its own
  // webspace, so the second measurement is taken where the migration put them — the slug,
  // the surface, the release and the source that produced the claim are all unchanged.
  const after = deps.verifyServing(deps.relocateExpectations(expectations, layout), io);
  if (!after.ok) {
    err(`provision adopt: instance '${instance}' MIGRATED BUT CANNOT BE DECLARED DONE — a site no longer serves what it served before:`);
    for (const verdict of after.failed) for (const line of describeVerdict(verdict)) err(`  ${line}`);
    err('');
    err(`The declaration, the credentials and the artifacts are in place; what is not proved is`);
    err(`the only thing that matters. Nothing here deletes bytes, so the release directories are`);
    err(`where they were: re-point the link named above and run 'provision check' again.`);
    return worse(converged, EXIT.FAILED);
  }

  out(`${instance}: adopted. ${expectations.length} surface(s) still serve exactly what they served before.`);
  out(`  The pre-instance environment is retired at ${join(pre.from, RETIRED_ENV)} — read it, do not delete it.`);
  out(`  Complete the pairing: ${layout.engineFragment} tells the engine where this daemon is.`);
  return converged;
}

/**
 * MAY THIS INSTANCE BE ADOPTED AT ALL? An exit code, or null to carry on.
 *
 * A declaration that exists AND IS BROKEN is evidence, and adoption would overwrite it. A
 * declaration that exists and is fine is NOT refused here: adoption is resumable, and the
 * step that writes it refuses only when what is on disk differs from the inference.
 */
function adoptionIsAllowed(context: VerbContext, fleet: Fleet, instance: string): number | null {
  const refused = fleet.refusals.find(refusal => refusal.instance === instance);
  if (!refused) return null;

  context.err(`provision adopt: instance '${instance}' already has a declaration, and it is refused — ${refused.reason}`);
  context.err(`  declaration: ${refused.manifestPath}`);
  context.err(`  Repair that file rather than adopting over it: adopt would overwrite the evidence.`);
  return EXIT.REFUSED;
}

/**
 * WOULD THIS MUSEUM COLLIDE WITH ONE ALREADY ON THIS HOST? An exit code, or null.
 *
 * The candidate fleet is the declared one with this instance's own layout in it — replacing
 * its earlier self on a resumed adoption, since a second run must not be refused for
 * colliding with what the first run wrote. `FleetMembers` exists for exactly this: the law
 * reads layouts, not a directory, so the question can be asked about a museum that has not
 * been written down yet.
 *
 * It is REFUSED and not a warning. A collision provisioned is one museum's daemon running
 * over another's tree, and — until this check existed — it also made every later verb refuse
 * the whole host, `remove` included, so the operator could not undo the thing this command
 * had just done to them.
 */
function fleetWouldCollide(
  context: VerbContext,
  fleet: Fleet,
  layout: InstanceLayout,
  instance: string,
): number | null {
  const others = fleet.layouts.filter(candidate => candidate.instance !== instance);
  try {
    context.deps.assertFleetDisjoint({ layouts: [...others, layout] });
    return null;
  } catch (error) {
    context.err(`provision adopt: instance '${instance}' cannot be adopted onto this host — ${messageOf(error)}`);
    context.err('');
    context.err(`Nothing was written. The declaration this install infers claims something a museum`);
    context.err(`already declared under ${fleet.dir}, and provisioning it would write into that`);
    context.err(`museum's tree. State the colliding field in the --declare fragment — a webspace, a`);
    context.err(`root, an identity, a domain — and adopt again.`);
    return EXIT.REFUSED;
  }
}

interface Inferred {
  readonly pre: PreInstance;
  readonly manifest: InstanceManifest;
  readonly layout: InstanceLayout;
}

/** Read the install and infer its declaration, or return the exit code of the refusal. */
function inferForAdoption(context: VerbContext, io: AdoptIo, instance: string, overlay: AdoptOverlay): Inferred | number {
  const { args, deps, err } = context;
  try {
    const pre = deps.observePreInstance(
      { from: args.from as string, legacyUnitPath: args.unit ?? LEGACY_UNIT_PATH },
      io,
    );
    const manifest = deps.inferManifest(pre, { instance, configDir: args.configDir, overlay });
    return { pre, manifest, layout: deps.derive(manifest) };
  } catch (error) {
    err(`provision adopt: ${messageOf(error)}`);
    return EXIT.REFUSED;
  }
}

/** What adoption read, before it writes anything — the operator's chance to stop it. */
function announce(context: VerbContext, instance: string, pre: PreInstance, layout: InstanceLayout): void {
  const { out } = context;
  out(`${instance}: adopting the install at ${pre.from}`);
  out(`  identity     ${layout.identity.user}:${layout.identity.group} (read from ${pre.legacyUnitPath}, kept verbatim)`);
  out(`  declaration  ${layout.manifestPath}`);
  out(`  environment  ${pre.envPath}${pre.envAlreadyRetired ? ' (already retired — resuming)' : ''}`);
  for (const site of layout.sites) out(`  site         ${site.slug}  ${site.domain}  ${site.webspace}`);
  out('');
}

/**
 * CAPTURE WHAT EVERY SITE IS SERVING, AND PROVE IT AGREES WITH WHAT THE SITE CLAIMS.
 *
 * An install whose production link already disagrees with its own manifest is refused here:
 * after the migration there would be no way to tell a pre-existing disagreement from one this
 * run caused, and "the migration is done" would be unsayable. Returns the expectations the
 * second proof is run against.
 */
function proveBeforeWriting(
  context: VerbContext,
  io: AdoptIo,
  pre: PreInstance,
  layout: InstanceLayout,
  instance: string,
): readonly SurfaceExpectation[] | number {
  const { deps, out, err } = context;

  let expectations: readonly SurfaceExpectation[];
  try {
    expectations = deps.expectationsFor(layout, servedSites(pre, layout), io);
  } catch (error) {
    err(`provision adopt: ${messageOf(error)}`);
    return EXIT.REFUSED;
  }

  const before = deps.verifyServing(expectations, io);
  if (!before.ok) {
    err(`provision adopt: instance '${instance}' cannot be adopted — this install does not currently serve what it claims to:`);
    for (const verdict of before.failed) for (const line of describeVerdict(verdict)) err(`  ${line}`);
    err('');
    err(`Nothing was written. Adoption proves the same thing before and after, so that "nothing`);
    err(`moved" is a measurement and not a hope — and an install that already disagrees with`);
    err(`itself makes the second measurement unreadable. Repair the disagreement first.`);
    return EXIT.REFUSED;
  }

  out(`  serving      ${expectations.length} surface(s) verified before anything was written.`);
  out('');
  return expectations;
}

/** The four things `plan()` structurally cannot do. OK, or the exit code of the failure. */
function migrate(
  context: VerbContext,
  io: AdoptIo,
  pre: PreInstance,
  layout: InstanceLayout,
  manifest: InstanceManifest,
  instance: string,
): number {
  const { deps, out, err } = context;

  let report: MigrationReport;
  try {
    report = deps.applyMigration(deps.migrationSteps(pre, layout, manifest), pre, io);
  } catch (error) {
    err(`provision adopt: the migration failed — ${messageOf(error)}`);
    return EXIT.FAILED;
  }

  for (const outcome of report.outcomes) {
    out(`  ${outcome.status.padEnd(7)} ${deps.describeMigration(outcome.step)}`);
    if (outcome.detail) out(`          ${outcome.detail}`);
  }
  if (!report.ok) {
    err(`provision adopt: instance '${instance}' stopped at: ${report.failure ? deps.describeMigration(report.failure.step) : 'an unnamed step'}`);
    if (report.failure?.detail) err(`  ${report.failure.detail}`);
    return EXIT.FAILED;
  }
  out('');
  return EXIT.OK;
}

/**
 * The pre-instance sites, paired with the webspace the DERIVED layout places them at.
 *
 * The pairing is the whole point of the check: the layout's webspace is where the adopted
 * host will serve from, the site's `published.release` is what it claims to be serving, and
 * a slug the declaration does not carry is a site that would silently stop being provisioned
 * at all — so it refuses rather than dropping it.
 */
function servedSites(pre: PreInstance, layout: InstanceLayout): ServedSite[] {
  return pre.sites.map(site => {
    const placed = layout.sites.find(candidate => candidate.slug === site.slug);
    if (!placed) {
      throw new Error(
        `adopt: site '${site.slug}' exists on this host and the declaration being adopted does ` +
          `not carry it. A site the declaration omits gets no webspace, no vhost and no row in ` +
          `sites.json — it would stop being served without anything saying so.`,
      );
    }
    return {
      slug: site.slug,
      webspace: placed.webspace,
      publishedRelease: site.publishedRelease,
      // WHERE THE BYTES ARE RIGHT NOW. Empty for a host already in the modern shape, and
      // for every surface a previous run of this command has already moved.
      surfaces: Object.fromEntries(
        Object.entries(site.surfaces).map(([surface, current]) => [surface, current.paths]),
      ),
    };
  });
}

/**
 * Read `--declare`, the JSON fragment merged over everything inferred.
 *
 * Null means the run is over (the message has been printed). An absent flag is `{}` and not
 * an error: a host whose pre-instance env happens to record everything needs no fragment.
 * The parser's message is NOT quoted, for the reason `fleet.ts` gives about `instance.json`:
 * a JSON syntax error echoes the token it tripped on, and this file sits wherever an
 * operator put it — possibly beside the credentials they were reading at the time.
 */
function readOverlay(context: VerbContext, io: AdoptIo): AdoptOverlay | null {
  const path = context.args.declare;
  if (path === null) return {};

  const text = io.readFile(path);
  if (text === null) {
    context.err(`provision adopt: --declare names '${path}', which could not be read.`);
    return null;
  }
  try {
    const document = JSON.parse(text) as unknown;
    if (typeof document !== 'object' || document === null || Array.isArray(document)) {
      context.err(`provision adopt: '${path}' must hold a JSON object — a fragment of the declaration.`);
      return null;
    }
    return document as AdoptOverlay;
  } catch {
    context.err(
      `provision adopt: '${path}' is not valid JSON. The parser's message is deliberately not ` +
        `quoted here: it echoes the token it tripped on. Run \`jq . ${path}\` to see where.`,
    );
    return null;
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * remove — P6: refuses by default, archives rather than deletes, never frees a uid
 * ──────────────────────────────────────────────────────────────────────────────────── */

function runRemove(context: VerbContext): number {
  const { args, deps, out, err } = context;
  const instance = args.instances[0] ?? '';

  const member = declaredMember(context, instance);
  if (member === null) return EXIT.REFUSED;

  const layout = member.layout;
  const io = deps.removalIo(deps.adoptIo());

  // P6, FIRST HALF: A PUBLISHED SITE IS A MUSEUM'S LIVE WEBSITE. "Published" is the served
  // link pointing at a RELEASE of its own store — not merely a link existing, which is true
  // of every provisioned site from the moment its placeholder is created.
  const published = deps.publishedSites(layout, io);
  if (published.length > 0 && !args.purgePublished) {
    err(`provision remove: instance '${instance}' still publishes ${published.length} site(s):`);
    for (const site of published) err(`  ${site.slug}  ${site.domain}  serving release '${site.release}'`);
    err('');
    err(`Nothing was removed. Taking a museum's public website down is an explicit act, never a`);
    err(`side effect of decommissioning a daemon. Re-run with --purge-published once the site is`);
    err(`genuinely retired — and note that even then the bytes are ARCHIVED, never deleted.`);
    return EXIT.REFUSED;
  }

  const steps = removalFor(context, member, io);
  if (typeof steps === 'number') return steps;

  out(`provision remove: instance '${instance}' — ${steps.length} step(s).`);
  if (published.length > 0) out(`  --purge-published was given: ${published.length} published site(s) are included.`);
  for (const step of steps) out(`  ${deps.describeRemoval(step)}`);
  out('');

  let report: RemovalReport;
  try {
    report = deps.applyRemoval(steps, io);
  } catch (error) {
    err(`provision remove: instance '${instance}' failed while removing — ${messageOf(error)}`);
    return EXIT.FAILED;
  }

  return reportRemoval(context, member, report);
}

/** The declared instance, or null after saying why it will not be acted on. */
function declaredMember(context: VerbContext, instance: string): FleetMember | null {
  const fleet = loadDeclarationsForRemoval(context);

  const member = fleet.members.find(candidate => candidate.instance === instance);
  if (member) return member;

  const refused = fleet.refusals.find(refusal => refusal.instance === instance);
  if (refused) {
    context.err(`provision remove: instance '${instance}' is declared but refused — ${refused.reason}`);
    context.err(`  A declaration this provisioner cannot read is a declaration it will not act on.`);
  } else {
    context.err(`provision remove: instance '${instance}' is not declared under ${fleet.dir}.`);
  }
  return null;
}

/**
 * The removal, planned. Two refusals, and they are different events: a declaration whose
 * artifacts will not RENDER cannot be removed at all, because "only what we wrote" is proved
 * by rendering what this declaration produces; a plan the removal module refuses is a plan
 * that was not shaped like a removal.
 */
function removalFor(context: VerbContext, member: FleetMember, io: RemovalIo): readonly RemovalStep[] | number {
  const { deps, err } = context;

  let artifacts: readonly Artifact[];
  try {
    artifacts = renderAll(member.layout, member.manifest);
  } catch (error) {
    err(`provision remove: instance '${member.instance}' could not be removed — its artifacts do not render: ${messageOf(error)}`);
    err(`  Removal deletes only files it can PROVE it wrote, and proving that means rendering`);
    err(`  what this declaration produces. Nothing was touched.`);
    return EXIT.REFUSED;
  }

  try {
    return deps.removalPlan(member.layout, artifacts, deps.observeForRemoval(member.layout, artifacts, io), new Date());
  } catch (error) {
    err(`provision remove: refusing instance '${member.instance}' — ${messageOf(error)}`);
    return EXIT.REFUSED;
  }
}

/** What became of the removal — and, above all, WHAT WAS ARCHIVED AND WHERE. */
function reportRemoval(context: VerbContext, member: FleetMember, report: RemovalReport): number {
  const { deps, out, err } = context;

  for (const outcome of report.outcomes) {
    out(`  ${outcome.status.padEnd(7)} ${deps.describeRemoval(outcome.step)}`);
    if (outcome.detail) out(`          ${outcome.detail}`);
  }
  out('');

  // Its own block: it is the one part of this report an operator has to keep. The bytes are
  // still on this disk, under these names, and nothing in this subsystem will ever remove them.
  if (report.archived.length > 0) {
    out(`  ARCHIVED — still on this disk, renamed beside themselves, nothing deleted:`);
    for (const moved of report.archived) out(`    ${moved.from}  →  ${moved.to}`);
    out('');
  }

  if (!report.ok) {
    err(`provision remove: instance '${member.instance}' stopped at: ${report.failure ? deps.describeRemoval(report.failure.step) : 'an unnamed step'}`);
    if (report.failure?.detail) err(`  ${report.failure.detail}`);
    return EXIT.FAILED;
  }

  const changed = report.outcomes.filter(outcome => outcome.status === 'done' && deps.removalChangesTheHost(outcome.step));
  out(
    `${member.instance}: decommissioned — ${changed.length} step(s) carried out, ` +
      `${report.archived.length} tree(s) archived, nothing deleted that this provisioner did not write.`,
  );

  // AFTER THE RUN, AND ONLY IF IT REALLY HAPPENED. This block used to be printed before the
  // first step, so a run that stopped at its second one still told the operator the account
  // had been locked. The claim is now made from the outcome that carries it.
  const locked = report.outcomes.some(
    outcome =>
      outcome.status === 'done' &&
      outcome.step.kind === 'exec' &&
      outcome.step.argv[0] === 'usermod' &&
      outcome.step.argv.includes('--lock'),
  );
  out(
    locked
      ? `  The account ${member.layout.identity.user} is now LOCKED, and it and the group ` +
          `${member.layout.identity.group} are KEPT.`
      : `  The account ${member.layout.identity.user} was NOT locked by this run (see the ` +
          `outcome above), and it and the group ${member.layout.identity.group} are KEPT.`,
  );
  out(`  Neither is ever deleted: freeing that uid would hand this museum's archived files to`);
  out(`  the next 'useradd' on this host. The instance NAME stays retired for the same reason.`);
  out(`  Remove ${member.manifestPath} by hand when you are satisfied: adoption and apply both`);
  out(`  read it, and this command does not delete the declaration it was asked about.`);
  return EXIT.OK;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Wiring
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** Options a caller (or the gate) may substitute. Every one of them defaults to the host. */
export interface RunOptions {
  readonly deps?: ProvisionDeps;
  readonly out?: (line: string) => void;
  readonly err?: (line: string) => void;
}

/** Is this optional flag set on the command line? One reading, for one closed list. */
function flagIsSet(args: ProvisionArgs, flag: OptionalFlag): boolean {
  switch (flag) {
    case 'engine':
      return args.engine;
    case 'purgePublished':
      return args.purgePublished;
    case 'from':
      return args.from !== null;
    case 'declare':
      return args.declare !== null;
    case 'unit':
      return args.unit !== null;
  }
}

/** Refuse a target selection the verb cannot honour, before anything is loaded. */
function validateTarget(verb: string, spec: VerbSpec, args: ProvisionArgs): string | null {
  for (const flag of OPTIONAL_FLAGS) {
    if (!flagIsSet(args, flag) || spec.flags.includes(flag)) continue;
    return (
      `provision: '${verb}' does not accept ${FLAG_SPELLING[flag]} — only ${verbsAccepting(flag)} ` +
      `does. A flag that is accepted and ignored is a run that quietly did something other ` +
      `than what was typed, on a host with several museums on it. Nothing was read.`
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

  // The REQUIRED flags last, because the questions are asked in the order an operator can
  // act on them: "that flag is not this verb's", then "which museum", then "and it needs
  // this". Being told about a missing --from before being told that --all is refused would
  // send someone to add a flag to a command that was never going to run.
  for (const flag of spec.requires ?? []) {
    if (flagIsSet(args, flag)) continue;
    return `provision: '${verb}' needs ${FLAG_SPELLING[flag]}. See --help for what it names.`;
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

    return spec.run({ args, deps, out, err });
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
