/**
 * THE ENTRY POINT'S GATE — arguments, refusals, exit codes, and the help text's honesty.
 *
 * This file asserts on the COMMAND, never on a host. That is possible because the phase is
 * built so that it is: `plan()` is pure and `check()` takes no io at all, so the CLI's whole
 * job is choosing museums, printing, and returning a number — and all three are drivable
 * with the siblings injected. Nothing here writes a file, spawns a process, or needs root.
 *
 * WHAT IS ACTUALLY BEING PROTECTED:
 *
 *   - P4, AT THE SEAM. A converged instance must not reach `apply` at all. The gate holds
 *     the strong form: `deps.apply` is asserted NOT CALLED, because "apply was called and
 *     decided to do nothing" and "apply was never called" are the same green run today and a
 *     very different one the day apply grows a side effect.
 *   - P5, THE FLEET LAW. One malformed declaration is named and skipped and the OTHER
 *     museums are still provisioned — asserted by watching the good instance go through
 *     while the bad one is reported. A run in which nothing was valid exits non-zero.
 *     `fleet.ts` states outright that this decision belongs to the CLI; this is where it is
 *     written down.
 *   - THE TWO WAYS AN INSTANCE CAN DROP OUT ARE NOT THE SAME EVENT. A host that will not be
 *     read is FAILED; a declaration that cannot be planned is REFUSED. An operator told the
 *     wrong one goes and looks at the wrong thing.
 *   - P6, THE PUBLISHED SITE. `remove` refuses while a site is published, and the refusal is
 *     asserted to print NOTHING about what removal would do: a refusal that still shows the
 *     plan is a refusal an operator reads as a dry run.
 *   - P7, NO SECRET ANYWHERE. Driven from both ends: the predicate is asserted directly, and
 *     a sibling that hands the CLI a credential-shaped line is asserted to take the run down
 *     WITHOUT the value reaching the output.
 *   - THE HELP TEXT DOCUMENTS EXACTLY THE VERBS THAT EXIST, both directions, against the one
 *     table the CLI dispatches on. A verb that is only in the help is a promise nothing
 *     keeps; a verb that is only in the code is a capability nobody can find.
 *
 * THE FIXTURE IS THE COMMITTED EXAMPLE DECLARATION, parsed and derived for real. A
 * hand-built layout would let this file drift away from what `derive()` produces, and the
 * outputs asserted below — paths, identities, vhosts, the pairing fragment — are exactly the
 * ones an operator reads.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { derive, DEFAULT_PATHS, type InstanceManifest } from '../src/provision/layout';
import { parseManifest } from '../src/provision/schema';
import type { Action } from '../src/provision/plan';
import type { ActionOutcome, ApplyReport, CheckReport, ProvisionIo } from '../src/provision/apply';
import type { Fleet, FleetMember, FleetRefusal } from '../src/provision/fleet';
import {
  EXIT,
  VERBS,
  hostDeps,
  parseArgs,
  run,
  secretShapedAssignment,
  usageLines,
  worse,
  type ProvisionDeps,
} from '../src/provision/cli';

/* ────────────────────────────────────────────────────────────────────────────────────
 * The fixture: the committed declaration, parsed and derived for real
 * ──────────────────────────────────────────────────────────────────────────────────── */

const EXAMPLE_PATH = join(import.meta.dir, '..', 'deploy', 'examples', 'instance.example.json');
const EXAMPLE_RAW = JSON.parse(readFileSync(EXAMPLE_PATH, 'utf8')) as Record<string, unknown>;
const DEFAULT_DIR: string = DEFAULT_PATHS.configBase;

/**
 * One loaded member, optionally renamed so a fleet can hold several.
 *
 * A renamed instance is stripped back to no sites and no aliases: the example declares its
 * audit root and its site domains explicitly, so a second museum carrying them would be the
 * exact overlap the real fleet law refuses — and this file has no business building one by
 * accident while testing something else.
 */
function member(name?: string): FleetMember {
  const raw: Record<string, unknown> = structuredClone(EXAMPLE_RAW);
  if (name) {
    raw.instance = name;
    raw.roots = { audit: `/srv/dedalo_audit/${name}` };
    raw.sites = [];
    const serving = { ...(raw.serving as Record<string, unknown>) };
    delete serving.aliases;
    raw.serving = serving;
  }
  const manifest = parseManifest(raw);
  const layout = derive(manifest);
  return { instance: layout.instance, manifestPath: layout.manifestPath, manifest, layout };
}

const EXAMPLE = member();

function fleetOf(members: readonly FleetMember[], refusals: readonly FleetRefusal[] = [], dir = DEFAULT_DIR): Fleet {
  return { dir, members, layouts: members.map(entry => entry.layout), refusals };
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The injected siblings
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * An action, in the only shape this file needs one: something `describe()` can name.
 *
 * `Action` belongs to `plan.ts` and this gate does not restate it — it casts, because what
 * is under test here is the CLI's arithmetic over a plan (is it empty? how many? in what
 * order was it printed? did apply see the same array?), never a plan's contents.
 */
function action(label: string): Action {
  return { kind: 'exec', label } as unknown as Action;
}

const labelOf = (item: Action): string => (item as unknown as { label: string }).label;

function checkReport(actions: readonly Action[], extras: Partial<CheckReport> = {}): CheckReport {
  return { actions, willChange: actions.length > 0, byKind: {}, writes: [], execs: [], awaiting: [], ...extras };
}

function applyReport(actions: readonly Action[], failure: ActionOutcome | null = null): ApplyReport {
  const outcomes: ActionOutcome[] = actions.map(item => ({ action: item, status: 'done', detail: 'wrote 1 file' }));
  return {
    ok: failure === null,
    outcomes: failure === null ? outcomes : [failure],
    done: failure === null ? actions.length : 0,
    skipped: 0,
    failed: failure === null ? 0 : 1,
    changed: failure === null,
    written: [],
    awaiting: [],
    failure,
  };
}

/** A recognisable io object, so the gate can assert apply was handed the host's own seam. */
const IO_SENTINEL = { sentinel: 'host-io' } as unknown as ProvisionIo;

interface Calls {
  loadFleet: string[];
  observeHost: string[];
  plan: string[];
  check: number;
  apply: Array<{ actions: readonly Action[]; io: ProvisionIo }>;
}

interface FakeOptions {
  /** Instance name → the plan for it. Absent means an empty plan (converged). */
  readonly plans?: Readonly<Record<string, readonly Action[]>>;
  /** Instance name → the message `observeHost` throws for it. */
  readonly observeThrows?: Readonly<Record<string, string>>;
  /** Instance name → the message `plan()` throws for it. */
  readonly planThrows?: Readonly<Record<string, string>>;
  /** Action label → the message `apply` throws on. */
  readonly applyThrows?: Readonly<Record<string, string>>;
  /** Action label → an outcome `apply` REPORTS as failed (rather than throwing). */
  readonly applyFails?: Readonly<Record<string, string>>;
  /** Make the whole fleet refuse as overlapping. */
  readonly disjointThrows?: string;
  /** Extra fields for the check report — refusals, execs. */
  readonly checkExtras?: Partial<CheckReport>;
  /** Which actions touch the host. Default: all of them. */
  readonly changesTheHost?: (item: Action) => boolean;
  /** Override the plan's words — used to drive the secret guard. */
  readonly describe?: (item: Action) => string;
}

function fakeDeps(fleet: Fleet, options: FakeOptions = {}): { deps: ProvisionDeps; calls: Calls } {
  const calls: Calls = { loadFleet: [], observeHost: [], plan: [], check: 0, apply: [] };

  const deps: ProvisionDeps = {
    loadFleet(dir) {
      calls.loadFleet.push(dir);
      return fleet;
    },
    assertFleetDisjoint() {
      if (options.disjointThrows) throw new Error(options.disjointThrows);
    },
    observeHost(layout) {
      calls.observeHost.push(layout.instance);
      const boom = options.observeThrows?.[layout.instance];
      if (boom) throw new Error(boom);
      return { users: [], groups: [], entries: {}, unitEnabled: false, unitActive: false };
    },
    plan(layout) {
      calls.plan.push(layout.instance);
      const boom = options.planThrows?.[layout.instance];
      if (boom) throw new Error(boom);
      return [...(options.plans?.[layout.instance] ?? [])];
    },
    describe(item) {
      return options.describe ? options.describe(item) : labelOf(item);
    },
    changesTheHost(item) {
      return options.changesTheHost ? options.changesTheHost(item) : true;
    },
    apply(actions, io) {
      calls.apply.push({ actions, io });
      const first = actions[0];
      const label = first ? labelOf(first) : '';
      const thrown = options.applyThrows?.[label];
      if (thrown) throw new Error(thrown);
      const failed = options.applyFails?.[label];
      if (failed && first) return applyReport(actions, { action: first, status: 'failed', detail: failed });
      return applyReport(actions);
    },
    check(actions) {
      calls.check += 1;
      return checkReport(actions, options.checkExtras);
    },
    hostIo() {
      return IO_SENTINEL;
    },
  };

  return { deps, calls };
}

function invoke(
  argv: readonly string[],
  options: { deps?: ProvisionDeps; exists?: (path: string) => boolean } = {},
): { code: number; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  const code = run(argv, {
    deps: options.deps,
    exists: options.exists ?? (() => false),
    out: line => out.push(line),
    err: line => err.push(line),
  });
  return { code, out, err };
}

const joined = (lines: readonly string[]): string => lines.join('\n');

/* ────────────────────────────────────────────────────────────────────────────────────
 * The help text
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('--help documents exactly the verbs that exist', () => {
  /** The names in the "Verbs:" block — read the way an operator reads them. */
  function documentedVerbs(lines: readonly string[]): string[] {
    const start = lines.indexOf('Verbs:');
    expect(start).toBeGreaterThan(-1);
    const names: string[] = [];
    for (let index = start + 1; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      if (line === '') break;
      const match = /^ {2}(\S+)/.exec(line);
      if (match?.[1]) names.push(match[1]);
    }
    return names;
  }

  test('every verb in the table is documented, and nothing else is', () => {
    expect(documentedVerbs(usageLines()).sort()).toEqual(Object.keys(VERBS).sort());
  });

  test('the two PARTIAL verbs say so — in the help and in the code, as one string', () => {
    for (const name of ['adopt', 'remove']) {
      const spec = VERBS[name];
      expect(spec?.deferred).toBeTruthy();
      expect(spec?.deferred).toContain('PARTIAL');
      expect(joined(usageLines())).toContain(spec?.deferred ?? '@@never@@');
    }
  });

  test('a verb that is not deferred makes no PARTIAL claim', () => {
    for (const name of ['apply', 'check', 'render', 'list']) {
      expect(VERBS[name]?.deferred).toBeUndefined();
    }
  });

  test('--help prints to stdout, documents every exit code, and exits OK', () => {
    const result = invoke(['--help']);
    expect(result.code).toBe(EXIT.OK);
    expect(result.err).toEqual([]);
    expect(joined(result.out)).toContain('Usage:');
    for (const code of Object.values(EXIT)) {
      expect(joined(result.out)).toContain(`  ${code}  `);
    }
  });

  test('the default config directory in the help is the one the loader is given', () => {
    expect(joined(usageLines())).toContain(DEFAULT_DIR);

    const { deps, calls } = fakeDeps(fleetOf([EXAMPLE]));
    invoke(['list', '--all'], { deps });
    expect(calls.loadFleet).toEqual([DEFAULT_DIR]);
  });

  test('--config-dir moves it', () => {
    const { deps, calls } = fakeDeps(fleetOf([EXAMPLE]));
    invoke(['list', '--config-dir', '/tmp/elsewhere', '--all'], { deps });
    expect(calls.loadFleet).toEqual(['/tmp/elsewhere']);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * Argument parsing
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('parseArgs', () => {
  test('reads the verb, the flags and both spellings of a valued option', () => {
    const parsed = parseArgs(['check', '--instance', 'one', '--instance=two', '--all', '--engine']);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.args.verb).toBe('check');
    expect(parsed.args.instances).toEqual(['one', 'two']);
    expect(parsed.args.all).toBe(true);
    expect(parsed.args.engine).toBe(true);
  });

  test('flags may precede the verb', () => {
    const parsed = parseArgs(['--all', 'render']);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.args.verb).toBe('render');
  });

  test('an option with no value is refused rather than defaulted', () => {
    for (const argv of [['check', '--instance'], ['check', '--instance', '--all'], ['check', '--config-dir']]) {
      expect(parseArgs(argv).ok).toBe(false);
    }
  });

  test('an unknown option is refused BY NAME — a silently ignored flag is a run that did something else', () => {
    const parsed = parseArgs(['check', '--force']);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain('--force');
  });

  test('a second verb is refused', () => {
    expect(parseArgs(['check', 'apply']).ok).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * Usage refusals — every one of them loads nothing and writes nothing
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the command line is refused before anything is loaded', () => {
  test('no verb: usage on stderr, exit USAGE', () => {
    const result = invoke([]);
    expect(result.code).toBe(EXIT.USAGE);
    expect(joined(result.err)).toContain('no verb given');
    expect(joined(result.err)).toContain('Usage:');
    expect(result.out).toEqual([]);
  });

  test('an unknown verb names itself and the verbs that exist', () => {
    const result = invoke(['provisionn', '--all']);
    expect(result.code).toBe(EXIT.USAGE);
    expect(joined(result.err)).toContain("'provisionn' is not a verb");
    for (const name of Object.keys(VERBS)) expect(joined(result.err)).toContain(name);
  });

  test('an unknown option is a usage error, not a warning', () => {
    const result = invoke(['apply', '--all', '--yes']);
    expect(result.code).toBe(EXIT.USAGE);
    expect(joined(result.err)).toContain('--yes');
  });

  test('--all and --instance are exclusive', () => {
    const result = invoke(['check', '--all', '--instance', 'example']);
    expect(result.code).toBe(EXIT.USAGE);
    expect(joined(result.err)).toContain('exclusive');
  });

  test('a fleet verb with no target refuses rather than guessing', () => {
    for (const verb of ['apply', 'check', 'render', 'list']) {
      const result = invoke([verb]);
      expect(result.code).toBe(EXIT.USAGE);
      expect(joined(result.err)).toContain('--all');
    }
  });

  test('--engine is refused on the verbs that cannot narrow a plan', () => {
    for (const verb of ['apply', 'check']) {
      const result = invoke([verb, '--all', '--engine']);
      expect(result.code).toBe(EXIT.USAGE);
      expect(joined(result.err)).toContain('--engine');
      expect(joined(result.err)).toContain('render');
    }
  });

  test('adopt and remove act on ONE instance — never a whole host', () => {
    for (const verb of ['adopt', 'remove']) {
      const all = invoke([verb, '--all']);
      expect(all.code).toBe(EXIT.USAGE);
      expect(joined(all.err)).toContain('--all is refused');

      const none = invoke([verb]);
      expect(none.code).toBe(EXIT.USAGE);
      expect(joined(none.err)).toContain('exactly one');

      expect(invoke([verb, '--instance', 'a', '--instance', 'b']).code).toBe(EXIT.USAGE);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * P5 — refuse the instance, not the fleet
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the fleet (P5)', () => {
  const good = member('good');
  const refusal: FleetRefusal = {
    instance: 'broken',
    manifestPath: '/etc/dedalo_sites/instances/broken/instance.json',
    reason: 'instance.json: unknown key "webspaces"',
  };

  test('--all: a malformed instance is named and skipped, the rest are still applied', () => {
    const { deps, calls } = fakeDeps(fleetOf([good], [refusal]), { plans: { good: [action('write unit')] } });
    const result = invoke(['apply', '--all'], { deps });

    // The good museum was provisioned…
    expect(calls.apply).toHaveLength(1);
    expect(joined(result.out)).toContain('good: 1 done');
    // …the broken one was reported BY NAME, with its reason and its file…
    expect(joined(result.err)).toContain("refusing instance 'broken'");
    expect(joined(result.err)).toContain('unknown key');
    expect(joined(result.err)).toContain(refusal.manifestPath);
    // …and the run still says, in its exit code, that something declared was not done.
    expect(result.code).toBe(EXIT.REFUSED);
  });

  test('a fleet with zero valid instances exits non-zero and plans nothing', () => {
    const { deps, calls } = fakeDeps(fleetOf([], [refusal]));
    const result = invoke(['apply', '--all'], { deps });
    expect(result.code).toBe(EXIT.REFUSED);
    expect(calls.plan).toEqual([]);
    expect(calls.apply).toEqual([]);
    expect(joined(result.err)).toContain('Nothing was done');
  });

  test('an empty host is zero valid instances too', () => {
    const { deps } = fakeDeps(fleetOf([]));
    expect(invoke(['list', '--all'], { deps }).code).toBe(EXIT.REFUSED);
  });

  test('--instance naming a refused instance reports THAT instance', () => {
    const { deps, calls } = fakeDeps(fleetOf([good], [refusal]));
    const result = invoke(['check', '--instance', 'broken'], { deps });
    expect(result.code).toBe(EXIT.REFUSED);
    expect(joined(result.err)).toContain("refusing instance 'broken'");
    expect(calls.plan).toEqual([]);
  });

  test('--instance naming nothing at all says so, and names the directory it looked in', () => {
    const { deps } = fakeDeps(fleetOf([good], [], '/etc/decl'));
    const result = invoke(['check', '--instance', 'ghost'], { deps });
    expect(result.code).toBe(EXIT.REFUSED);
    expect(joined(result.err)).toContain("instance 'ghost' is not declared under /etc/decl");
  });

  test("another museum's typo is not this run's business", () => {
    const { deps, calls } = fakeDeps(fleetOf([good], [refusal]));
    const result = invoke(['check', '--instance', 'good'], { deps });
    expect(result.code).toBe(EXIT.OK);
    expect(joined(result.err)).not.toContain('broken');
    expect(calls.plan).toEqual(['good']);
  });

  test('an OVERLAPPING fleet refuses the whole run — not one instance at a time', () => {
    const { deps, calls } = fakeDeps(fleetOf([good, member('other')]), {
      disjointThrows: "instances 'good' and 'other' both claim /var/lib/dedalo_sites/good",
    });
    const result = invoke(['apply', '--all'], { deps });
    expect(result.code).toBe(EXIT.REFUSED);
    expect(joined(result.err)).toContain('overlap');
    expect(joined(result.err)).toContain('both claim');
    expect(calls.plan).toEqual([]);
    expect(calls.apply).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * check — P3
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('check (P3)', () => {
  test('a converged host exits OK and never reaches apply', () => {
    const { deps, calls } = fakeDeps(fleetOf([EXAMPLE]));
    const result = invoke(['check', '--all'], { deps });
    expect(result.code).toBe(EXIT.OK);
    expect(joined(result.out)).toContain('converged');
    expect(calls.apply).toEqual([]);
  });

  test('drift exits DRIFT, prints every action in order, and writes nothing', () => {
    const { deps, calls } = fakeDeps(fleetOf([EXAMPLE]), {
      plans: {
        example: [action('group create dedalo-site-example'), action('user create dedalo-site-example --gid dedalo-site-example')],
      },
    });
    const result = invoke(['check', '--all'], { deps });

    expect(result.code).toBe(EXIT.DRIFT);
    expect(calls.check).toBe(1);
    expect(calls.apply).toEqual([]);
    const text = joined(result.out);
    expect(text).toContain('example: 2 action(s) pending');
    // The ordering law of this phase, read off the printed plan: the group precedes the user
    // that names it with --gid.
    expect(text.indexOf('group create')).toBeLessThan(text.indexOf('user create'));
    expect(text).toContain('Nothing was written');
  });

  test('the exact argv of every command is printed — that is what the operator is deciding about', () => {
    const { deps } = fakeDeps(fleetOf([EXAMPLE]), {
      plans: { example: [action('reload nginx')] },
      checkExtras: { execs: [['nginx', '-t'], ['systemctl', 'reload', 'nginx']] },
    });
    const result = invoke(['check', '--all'], { deps });
    expect(joined(result.out)).toContain('nginx -t');
    expect(joined(result.out)).toContain('systemctl reload nginx');
  });

  test('a plan waiting on a file only a human can place is REFUSED, not merely drifted', () => {
    // `apply.ts` states the rule and leaves the code to the CLI: exiting 0 here would tell a
    // museum its daemon is provisioned when it cannot start.
    const { deps } = fakeDeps(fleetOf([EXAMPLE]), {
      plans: { example: [action('write env')] },
      checkExtras: { awaiting: ['/etc/dedalo_sites/instances/example/secrets/ANTHROPIC_API_KEY'] },
    });
    const result = invoke(['check', '--all'], { deps });
    expect(result.code).toBe(EXIT.REFUSED);
    expect(joined(result.err)).toContain('waiting on 1 file(s) only an operator can place');
    expect(joined(result.err)).toContain('ANTHROPIC_API_KEY');
    expect(joined(result.err)).toContain('never invents a credential');
  });

  test('an instance that is otherwise converged still reports what it is waiting for', () => {
    const { deps } = fakeDeps(fleetOf([EXAMPLE]), {
      checkExtras: { awaiting: ['/etc/dedalo_sites/instances/example/secrets/SERVICE_TOKEN'] },
    });
    const result = invoke(['check', '--all'], { deps });
    expect(result.code).toBe(EXIT.REFUSED);
    expect(joined(result.out)).toContain('nothing to do beyond the file(s) above');
  });

  test('a host that will not be read is FAILED; a declaration that will not plan is REFUSED', () => {
    const unreadable = fakeDeps(fleetOf([member('unreadable')]), {
      observeThrows: { unreadable: 'EACCES: /etc/dedalo_sites/instances/unreadable' },
    });
    const first = invoke(['check', '--all'], { deps: unreadable.deps });
    expect(first.code).toBe(EXIT.FAILED);
    expect(joined(first.err)).toContain('would not be read');

    const unplannable = fakeDeps(fleetOf([member('unplannable')]), {
      planThrows: { unplannable: 'a file stands where the webspace must be' },
    });
    const second = invoke(['check', '--all'], { deps: unplannable.deps });
    expect(second.code).toBe(EXIT.REFUSED);
    expect(joined(second.err)).toContain("refusing instance 'unplannable'");
    expect(joined(second.err)).toContain('the rest of the fleet is unaffected');
  });

  test('an unreadable host does not stop the next museum', () => {
    const good = member('good');
    const { deps, calls } = fakeDeps(fleetOf([member('bad'), good]), {
      observeThrows: { bad: 'EACCES' },
      plans: { good: [action('write unit')] },
    });
    const result = invoke(['check', '--all'], { deps });
    expect(result.code).toBe(EXIT.FAILED);
    expect(calls.plan).toEqual(['good']);
  });

  test('drift anywhere in a fleet drifts the run', () => {
    const { deps } = fakeDeps(fleetOf([member('calm'), member('busy')]), { plans: { busy: [action('write env')] } });
    expect(invoke(['check', '--all'], { deps }).code).toBe(EXIT.DRIFT);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * apply — P2 and P4
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('apply', () => {
  test('a converged instance does not reach apply AT ALL (P4)', () => {
    const { deps, calls } = fakeDeps(fleetOf([EXAMPLE]));
    const result = invoke(['apply', '--all'], { deps });
    expect(result.code).toBe(EXIT.OK);
    expect(calls.apply).toEqual([]);
    expect(joined(result.out)).toContain('nothing to do');
  });

  test('a plan of pure NOTICES is still not work — it prints and does not apply', () => {
    // An 'awaiting' action is the plan telling an operator a credential file is missing.
    // Applying it would be a write nobody asked for, and P4 counts it as no work at all.
    const { deps, calls } = fakeDeps(fleetOf([EXAMPLE]), {
      plans: { example: [action('awaiting: place /etc/.../secrets/ANTHROPIC_API_KEY')] },
      changesTheHost: () => false,
    });
    const result = invoke(['apply', '--all'], { deps });
    expect(result.code).toBe(EXIT.REFUSED);
    expect(calls.apply).toEqual([]);
    expect(joined(result.out)).toContain('awaiting: place');
    expect(joined(result.err)).toContain('only an operator can place');
  });

  test('a drifted instance is applied ONCE, with exactly the planned actions and the host io', () => {
    const actions = [action('write /etc/systemd/system/dedalo-site-builder@example.service')];
    const { deps, calls } = fakeDeps(fleetOf([EXAMPLE]), { plans: { example: actions } });
    const result = invoke(['apply', '--all'], { deps });

    expect(result.code).toBe(EXIT.OK);
    expect(calls.apply).toHaveLength(1);
    expect(calls.apply[0]?.actions).toEqual(actions);
    expect(calls.apply[0]?.io).toBe(IO_SENTINEL);
    expect(joined(result.out)).toContain('example: 1 done, 0 skipped');
  });

  test('every outcome is printed, in the plan’s own words', () => {
    const { deps } = fakeDeps(fleetOf([EXAMPLE]), { plans: { example: [action('write env')] } });
    const result = invoke(['apply', '--all'], { deps });
    expect(joined(result.out)).toContain('done    write env');
    expect(joined(result.out)).toContain('wrote 1 file');
  });

  test('a successful apply that still awaits a human file is non-zero', () => {
    const actions = [action('write env')];
    const { deps } = fakeDeps(fleetOf([EXAMPLE]), { plans: { example: actions } });
    // The report says the run did everything it could and one file remains.
    const wrapped: ProvisionDeps = {
      ...deps,
      apply(list, io) {
        const report = deps.apply(list, io);
        return { ...report, awaiting: ['/etc/dedalo_sites/instances/example/secrets/ANTHROPIC_API_KEY'] };
      },
    };
    const result = invoke(['apply', '--all'], { deps: wrapped });
    expect(result.code).toBe(EXIT.REFUSED);
    expect(joined(result.out)).toContain('example: 1 done');
    expect(joined(result.err)).toContain('only an operator can place');
  });

  test('a REPORTED failure is FAILED and names the action it stopped at', () => {
    const { deps } = fakeDeps(fleetOf([EXAMPLE]), {
      plans: { example: [action('reload nginx')] },
      applyFails: { 'reload nginx': 'nginx -t failed; no reload was attempted' },
    });
    const result = invoke(['apply', '--all'], { deps });
    expect(result.code).toBe(EXIT.FAILED);
    expect(joined(result.err)).toContain('stopped at: reload nginx');
    expect(joined(result.err)).toContain('no reload was attempted');
  });

  test('a THROWN failure is FAILED too, and does not stop the next museum', () => {
    const { deps, calls } = fakeDeps(fleetOf([member('first'), member('second')]), {
      plans: { first: [action('boom')], second: [action('write env')] },
      applyThrows: { boom: 'the host went away mid-run' },
    });
    const result = invoke(['apply', '--all'], { deps });

    expect(result.code).toBe(EXIT.FAILED);
    expect(joined(result.err)).toContain("instance 'first' failed while applying");
    expect(calls.apply).toHaveLength(2);
    expect(joined(result.out)).toContain('second: 1 done');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * render — pure, and one of the two verbs --engine narrows
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('render', () => {
  test('prints every artifact with its host path, owner, group and mode', () => {
    const { deps, calls } = fakeDeps(fleetOf([EXAMPLE]));
    const result = invoke(['render', '--all'], { deps });

    expect(result.code).toBe(EXIT.OK);
    // Nothing was observed and nothing was planned: render is a pure function of the
    // declaration and must not touch the host to answer.
    expect(calls.observeHost).toEqual([]);
    expect(calls.plan).toEqual([]);

    const text = joined(result.out);
    expect(text).toContain(EXAMPLE.layout.unitPath);
    expect(text).toContain(EXAMPLE.layout.envFile);
    expect(text).toContain(EXAMPLE.layout.engineFragment);
    expect(text).toContain('(root:root 00644, unit)');
    // The bodies themselves, stamp line first.
    expect(text).toContain('# dedalo-provision: example unit ');
  });

  test('--engine prints the pairing fragment and nothing else', () => {
    const { deps } = fakeDeps(fleetOf([EXAMPLE]));
    const result = invoke(['render', '--all', '--engine'], { deps });

    expect(result.code).toBe(EXIT.OK);
    const headers = result.out.filter(line => line.startsWith('# ── '));
    expect(headers).toHaveLength(1);
    expect(headers[0]).toContain(EXAMPLE.layout.engineFragment);
    expect(joined(result.out)).toContain('DEDALO_SITE_BUILDER_SOCKET');
    expect(joined(result.out)).not.toContain(EXAMPLE.layout.unitPath);
  });

  test('a renderer that refuses a declaration refuses THAT instance only', () => {
    // A manifest carrying a key no renderer understands: `engine_fragment.ts` refuses to
    // render a pairing for a declaration it cannot fully read, rather than naming a socket
    // the engine may not be about to use.
    const undeclarable: FleetMember = {
      ...EXAMPLE,
      manifest: { ...EXAMPLE.manifest, listen: '0.0.0.0:9000' } as unknown as InstanceManifest,
    };
    const good = member('good');
    const { deps } = fakeDeps(fleetOf([undeclarable, good]));
    const result = invoke(['render', '--all'], { deps });

    expect(result.code).toBe(EXIT.REFUSED);
    expect(joined(result.err)).toContain('rendered nothing');
    // The other museum still rendered.
    expect(joined(result.out)).toContain(good.layout.unitPath);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * list
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('list', () => {
  test('names the identity, the unit, the declaration and every site', () => {
    const { deps } = fakeDeps(fleetOf([EXAMPLE]));
    const result = invoke(['list', '--all'], { deps });

    expect(result.code).toBe(EXIT.OK);
    const text = joined(result.out);
    expect(text).toContain(EXAMPLE.layout.identity.user);
    expect(text).toContain(EXAMPLE.layout.unitName);
    expect(text).toContain(EXAMPLE.manifestPath);
    for (const site of EXAMPLE.layout.sites) {
      expect(text).toContain(site.slug);
      expect(text).toContain(site.domain);
    }
  });

  test('--engine reduces it to the pairing facts', () => {
    const { deps } = fakeDeps(fleetOf([EXAMPLE]));
    const result = invoke(['list', '--all', '--engine'], { deps });
    const text = joined(result.out);
    expect(text).toContain(EXAMPLE.layout.socketPath);
    expect(text).toContain(EXAMPLE.layout.engineFragment);
    expect(text).not.toContain(EXAMPLE.layout.unitName);
  });

  test('an instance with no sites says so rather than printing nothing', () => {
    const { deps } = fakeDeps(fleetOf([member('fresh')]));
    expect(joined(invoke(['list', '--all'], { deps }).out)).toContain('none declared yet');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * remove — P6
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('remove (P6)', () => {
  const publishedLink = EXAMPLE.layout.sites[0]?.linkPath('prod') ?? '';
  const isPublished = (path: string): boolean => path === publishedLink;

  test('refuses while a site is published, and shows no removal plan at all', () => {
    const { deps } = fakeDeps(fleetOf([EXAMPLE]));
    const result = invoke(['remove', '--instance', 'example'], { deps, exists: isPublished });

    expect(result.code).toBe(EXIT.REFUSED);
    expect(joined(result.err)).toContain('still publishes 1 site(s)');
    expect(joined(result.err)).toContain(publishedLink);
    expect(joined(result.err)).toContain('--purge-published');
    // A refusal that still prints the plan reads as a dry run, and an operator who read one
    // would believe the removal had been described rather than declined.
    expect(result.out).toEqual([]);
  });

  test('--purge-published gets past the refusal and still executes nothing', () => {
    const { deps } = fakeDeps(fleetOf([EXAMPLE]));
    const result = invoke(['remove', '--instance', 'example', '--purge-published'], { deps, exists: isPublished });

    expect(result.code).toBe(EXIT.UNSUPPORTED);
    const text = joined(result.out);
    expect(text).toContain('what removal WOULD do');
    expect(text).toContain('PARTIAL');
    expect(text).toContain('Phase 8');
  });

  test('the removal it describes archives rather than deletes, and never frees the uid', () => {
    const { deps } = fakeDeps(fleetOf([EXAMPLE]));
    const result = invoke(['remove', '--instance', 'example'], { deps });

    expect(result.code).toBe(EXIT.UNSUPPORTED);
    const text = joined(result.out);
    expect(text).toContain('ARCHIVE, never delete');
    expect(text).toContain('retired-<utc-timestamp>');
    expect(text).toContain('KEEP THE IDENTITY');
    expect(text).toContain(EXAMPLE.layout.identity.user);
    expect(text).toContain('frees its uid');
    // The artifacts it would take away are named, so an operator can check them first.
    expect(text).toContain(EXAMPLE.layout.unitPath);
    expect(text).toContain(EXAMPLE.layout.sites[0]?.vhostPaths.prod ?? '@@none@@');
  });

  test('an instance that is not declared is refused, not invented', () => {
    const { deps } = fakeDeps(fleetOf([EXAMPLE]));
    const result = invoke(['remove', '--instance', 'ghost'], { deps });
    expect(result.code).toBe(EXIT.REFUSED);
    expect(joined(result.err)).toContain("'ghost' is not declared");
  });

  test('a declared but REFUSED instance is not removed either', () => {
    const { deps } = fakeDeps(fleetOf([], [{ instance: 'broken', manifestPath: '/etc/x/broken/instance.json', reason: 'bad json' }]));
    const result = invoke(['remove', '--instance', 'broken'], { deps });
    expect(result.code).toBe(EXIT.REFUSED);
    expect(joined(result.err)).toContain('declared but refused');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * adopt
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('adopt', () => {
  test('refuses to write over a declaration that already exists', () => {
    const { deps } = fakeDeps(fleetOf([EXAMPLE]));
    const result = invoke(['adopt', '--instance', 'example'], { deps });
    expect(result.code).toBe(EXIT.REFUSED);
    expect(joined(result.err)).toContain(EXAMPLE.manifestPath);
    expect(joined(result.err)).toContain('will not replace one');
  });

  test('refuses to adopt over a declaration that is merely broken — that file is evidence', () => {
    const { deps } = fakeDeps(fleetOf([], [{ instance: 'half', manifestPath: '/etc/x/half/instance.json', reason: 'bad json' }]));
    const result = invoke(['adopt', '--instance', 'half'], { deps });
    expect(result.code).toBe(EXIT.REFUSED);
    expect(joined(result.err)).toContain('overwrite the evidence');
  });

  test('otherwise it says exactly what it does not do yet, and does nothing', () => {
    const { deps, calls } = fakeDeps(fleetOf([EXAMPLE]));
    const result = invoke(['adopt', '--instance', 'newcomer'], { deps });

    expect(result.code).toBe(EXIT.UNSUPPORTED);
    const text = joined(result.out);
    expect(text).toContain('nothing was read from this host and nothing was written');
    expect(text).toContain('Phase 8');
    expect(calls.observeHost).toEqual([]);
    expect(calls.apply).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * P7 — no secret in a plan, a log, an error or a report
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('no secret leaves this process (P7)', () => {
  test('the predicate catches a credential-shaped assignment, wherever it sits in the line', () => {
    expect(secretShapedAssignment('ANTHROPIC_API_KEY="sk-ant-notarealkey"')).toBe('ANTHROPIC_API_KEY');
    expect(secretShapedAssignment('  SERVICE_TOKEN=deadbeefdeadbeef')).toBe('SERVICE_TOKEN');
    expect(secretShapedAssignment('# PREPROD_PASSWORD=hunter2istooshort')).toBe('PREPROD_PASSWORD');
    expect(secretShapedAssignment('write env: X_SECRET="abcdefghijkl" — 1 file')).toBe('X_SECRET');
  });

  test('and allows the things that are not disclosures', () => {
    // A credential FILE is named on purpose — it is 0600 root:root, so the path is a pointer
    // nobody but root can follow.
    expect(secretShapedAssignment('PUBLICATION_API_KEY_FILE="/etc/dedalo_sites/instances/example/secrets/K"')).toBeNull();
    // The pairing sentinel is the one line the operator is meant to act on.
    expect(secretShapedAssignment('DEDALO_SITE_BUILDER_TOKEN="PASTE_THE_SERVICE_TOKEN_VALUE_HERE"')).toBeNull();
    // Prose about env syntax — which the unit really does carry.
    expect(secretShapedAssignment('# KEY=VALUE, no quoting to disagree about, and')).toBeNull();
    // An empty assignment discloses nothing; a key that is not credential-shaped is config.
    expect(secretShapedAssignment('SERVICE_TOKEN=')).toBeNull();
    expect(secretShapedAssignment('DEPLOYMENT_MODE="nginx"')).toBeNull();
    expect(secretShapedAssignment('LoadCredential=ANTHROPIC_API_KEY:/etc/x/secrets/ANTHROPIC_API_KEY')).toBeNull();
  });

  test('a sibling that hands the CLI a secret takes the run down, and the value never lands', () => {
    const { deps } = fakeDeps(fleetOf([EXAMPLE]), {
      plans: { example: [action('x')] },
      describe: () => 'write env: ANTHROPIC_API_KEY="sk-ant-thisvaluemustnotbeprinted"',
    });
    const result = invoke(['check', '--all'], { deps });

    expect(result.code).toBe(EXIT.FAILED);
    const everything = `${joined(result.out)}\n${joined(result.err)}`;
    expect(everything).not.toContain('sk-ant-thisvaluemustnotbeprinted');
    expect(everything).toContain('ANTHROPIC_API_KEY');
    expect(everything).toContain('never credential VALUES');
  });

  test('a real render of the committed declaration trips nothing', () => {
    const { deps } = fakeDeps(fleetOf([EXAMPLE]));
    const result = invoke(['render', '--all'], { deps });
    expect(result.code).toBe(EXIT.OK);
    for (const line of [...result.out, ...result.err]) {
      expect(secretShapedAssignment(line)).toBeNull();
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * Exit codes and the real wiring
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('exit codes', () => {
  test('are the documented, closed set', () => {
    expect(EXIT).toEqual({ OK: 0, DRIFT: 1, USAGE: 2, REFUSED: 3, FAILED: 4, UNSUPPORTED: 5 });
  });

  test('the most serious outcome of a run is the one it returns', () => {
    expect(worse(EXIT.OK, EXIT.DRIFT)).toBe(EXIT.DRIFT);
    expect(worse(EXIT.DRIFT, EXIT.REFUSED)).toBe(EXIT.REFUSED);
    expect(worse(EXIT.REFUSED, EXIT.FAILED)).toBe(EXIT.FAILED);
    expect(worse(EXIT.FAILED, EXIT.OK)).toBe(EXIT.FAILED);
    expect(worse(EXIT.UNSUPPORTED, EXIT.DRIFT)).toBe(EXIT.UNSUPPORTED);
    // An unranked code is treated as the worst thing that happened, never the best.
    expect(worse(EXIT.OK, 99)).toBe(99);
  });
});

describe('the real wiring', () => {
  test('hostDeps names every sibling the CLI calls — nothing is left undefined', () => {
    const deps = hostDeps();
    for (const name of ['loadFleet', 'assertFleetDisjoint', 'observeHost', 'plan', 'describe', 'changesTheHost', 'apply', 'check', 'hostIo'] as const) {
      expect(typeof deps[name]).toBe('function');
    }
  });
});
