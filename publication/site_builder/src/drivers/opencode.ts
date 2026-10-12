/**
 * The OpenCode driver — a provider-agnostic alternative agent.
 *
 * Invocation: `opencode run --pure --format json [--session <id>] -- <prompt>` (the argv, the
 * restriction and the daemon's configuration are spelled in the builtin-only leaf
 * `./opencode_argv.ts`). Its JSON stream is coarser than Claude Code's, so file changes lean
 * entirely on the git backstop in the session manager.
 *
 * Provider credentials come from OPENCODE_ENV (config) — an ALLOWLIST of credential keys
 * (`isOpencodeCredentialKey`), refused at boot otherwise — forwarded only to this driver's child.
 *
 * PLANT (LEAD-1c, phase A) — WHAT A TURN LOADS IS THE DAEMON'S STATEMENT. opencode loads
 * configuration from the workspace (`opencode.json`, `.opencode/{agent,tool,plugin,command,skills}`
 * — a plugin is code it RUNS), from `.claude/skills` / `.agents/skills`, and from HOME; a turn's
 * Write or a build's postinstall can plant any of them for the NEXT turn, `bash: deny`
 * notwithstanding. So:
 *
 *   - the restriction (`OPENCODE_RESTRICTION_ENV`) turns every project, plugin and skill source
 *     off; `OPENCODE_CONFIG_CONTENT` carries the daemon's WHOLE configuration — its MCP server, its
 *     permission block, its brief as the one instruction file — merged last, and
 *     `OPENCODE_PERMISSION` restates the permission block in the key that overrides a
 *     configuration's. It rides `TurnPlan.env` (`opencodeTurnEnvironment`), merged OVER the
 *     caller's environment (`process.ts`): the daemon's value wins;
 *   - THE BRIEF is the daemon's: `AGENTS.md` read by the one bounded, link-refusing reader
 *     (`brief.ts`), written into `.builder/opencode-brief.md` (fd-based, 0640) and named as the
 *     one instruction file — removed with the turn. Nothing is written at the workspace root;
 *   - HOME is the HOME law's (`agent_identity.ts` S3-HOME): under `none`, a fresh HOME per run;
 *   - opencode's own off-plan traffic (auto-update, models catalogue, LSP downloads, share) is
 *     switched OFF and its database NAMED (`OPENCODE_DB`) by the same statement, in every mode;
 *   - A CONSOLE ACCOUNT IS REFUSED, EVERY TURN: an active `opencode console` account makes every
 *     start fetch its org's configuration and merge it after the daemon's (measured on 1.18.32:
 *     a remote LOCAL MCP server reached a fully restricted turn). No key closes it and no probe can
 *     see what a remote serves later, so admission reads the turn's database (`OPENCODE_DB`, the
 *     file the probe proved the binary opens) and refuses while it holds any account;
 *   - the prompt follows a literal `--`;
 *   - THE PROBE (`probeOpencodePlantClosure`) re-measures, per binary AND per operator environment,
 *     that the installed CLI honours every key: it plants one canary per SOURCE (each its own
 *     token) in a daemon-private scratch tree and asks the CLI what it would load (`debug config`,
 *     `debug agent build`, `debug skill`) twice — a CONTROL leg without the switches, where every
 *     canary must surface (a probe that cannot see a source proves nothing about it), and the
 *     turn's own environment, where none may and the resolved configuration must be the daemon's
 *     (the vacuity guard). A source loaded, a plugin that ran, a source the control could not see,
 *     a subcommand that failed, or a `run --help` (yargs writes it to STDERR) without a flag the
 *     argv needs — each refuses the driver, typed (503 `confinement.agent_cli_unsupported`), at
 *     every door: detect() (unavailable on /health), admit() (before the manager reserves
 *     anything) and the turn's setup. Only an answer every question gave (exit 0, in time) is
 *     cached. A probe that could not ASK (a question past its bound, a spawn the host refused
 *     for want of resources) and proved nothing against the binary is refused RETRYABLE
 *     (`confinement.agent_cli_unproved`), never as a defect of the binary;
 *   - THE OPEN DOOR STAYS CHEAP: detect() backs the unauthenticated GET /health, so it never
 *     starts a probe beside one in flight (one per binary and operator environment, joined by
 *     every door), answers within `OPENCODE_DETECT_WAIT_MS` whatever the probe takes, and serves
 *     an unproved answer for `OPENCODE_UNPROVED_HOLD_MS` before asking again. Admission joins a
 *     probe in flight but never takes the held answer — a turn asks the binary itself.
 *     Gate: tests/opencode_plant.test.ts (O12).
 *
 * STILL REFUSED UNDER `systemd_scope` (LEAD-1b_SPEC §0.3, phase B open) — DERIVED: until
 * opencode's configuration directory is a root-owned per-run mount point (`TURN_CONFIG_SUBDIRS`)
 * and its provider-SDK cache has a decided home (`OPENCODE_CONFINED_CACHE`), no confined opencode
 * turn runs. Gate: tests/opencode_refusal.test.ts.
 */

import { Database } from 'bun:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { lstatSync, realpathSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { config, parseEnvPairs } from '../config';
import { ConfinementRefusedError } from '../errors';
import { mkdirPrivate, readFilePrivate, relativeUnderRoot, removeFilePrivate, restateDaemonStateDir, writeFileAgentReadable, writeFilePrivate } from '../util/shared_tree';
import { runBinary } from '../util/spawn';
import { TURN_CONFIG_SUBDIRS, turnHomeEnvironment, unconfinedTurnChildEnvironment, unconfinedTurnDirs } from './agent_identity';
import { readBrief } from './brief';
import {
  listedYargsFlags,
  OPENCODE_ACCOUNT_TABLES,
  OPENCODE_PLANT_SOURCES,
  OPENCODE_PROBE_OFFLINE_ENV,
  OPENCODE_PROBE_QUESTIONS,
  OPENCODE_SOURCE_SWITCHES,
  OPENCODE_STATED_DB,
  type OpencodePlantSource,
  opencodeDaemonConfig,
  opencodePlantCanaries,
  opencodePlantVerdict,
  opencodeProbeConfig,
  opencodeStateDatabase,
  opencodeTurnArgv,
  opencodeTurnEnvironment,
  requiredOpencodeFlags,
} from './opencode_argv';
import { spawnAgentProcess, type TurnPlan } from './process';
import type { AgentDriver, AgentEvent, DriverInfo, SessionStartOptions, AgentProcess } from './types';

export { DENIED_PERMISSIONS } from './opencode_argv';

/** Each probe command's bound: a CLI that hangs answering what it loads is refused, not waited on. */
const PLANT_PROBE_TIMEOUT_MS = 10_000;

/**
 * HOW LONG detect() WAITS for a probe before answering "not proved yet" (unavailable). It backs
 * GET /health, which the engine bounds at 10 s for every action it pairs on, and a whole probe is
 * up to eight questions of `PLANT_PROBE_TIMEOUT_MS` each. The probe goes on; the next detect()
 * reads its answer.
 */
export const OPENCODE_DETECT_WAIT_MS = 3_000;

/**
 * HOW LONG detect() SERVES AN UNPROVED ANSWER before asking again: an unauthenticated caller of
 * /health must not be able to make the daemon spawn a probe per request.
 */
export const OPENCODE_UNPROVED_HOLD_MS = 60_000;

type ConfinementMode = typeof config.AGENT_CONFINEMENT;

/**
 * WHERE A CONFINED opencode KEEPS ITS PROVIDER-SDK CACHE — UNDECIDED. opencode installs a
 * provider's SDK package from npm on first use and keeps it under its data/cache directories; under
 * a unit those are the identity's writable `state/`, i.e. CODE the next turn of the site loads. Until
 * where that cache lives (and who may write it) is decided, no confined opencode turn runs.
 */
export const OPENCODE_CONFINED_CACHE: 'undecided' | 'decided' = 'undecided';

/** What lifting the `systemd_scope` refusal needs (phase B) — the derived conditions, a seam for the gate. */
export interface OpencodePhaseB {
  /** The root-owned mount points `.config` may hold (`agent_identity.ts` TURN_CONFIG_SUBDIRS). */
  readonly configSubdirs: readonly string[];
  readonly cache: 'undecided' | 'decided';
}

const PHASE_B: OpencodePhaseB = { configSubdirs: TURN_CONFIG_SUBDIRS, cache: OPENCODE_CONFINED_CACHE };

/**
 * THE REFUSAL (see the header): under `systemd_scope` no opencode turn runs until phase B's
 * conditions hold — DERIVED, not a flag: opencode's configuration directory is a root-owned per-run
 * mount point (`TURN_CONFIG_SUBDIRS` names `opencode`) AND where its provider-SDK cache lives is
 * decided. Either alone lifts nothing. `none` is the operator's declared-unconfined mode, where the
 * PLANT probe decides.
 */
export function assertOpencodeConfinable(mode: ConfinementMode = config.AGENT_CONFINEMENT, phaseB: OpencodePhaseB = PHASE_B): void {
  if (mode !== 'systemd_scope') return;
  const missing: string[] = [];
  if (!phaseB.configSubdirs.includes('opencode')) {
    missing.push("a root-owned per-run mount for opencode's own configuration directories (~/.config/opencode, ~/.opencode)");
  }
  if (phaseB.cache === 'undecided') missing.push("a decided home for opencode's provider-SDK cache (code the next turn would load)");
  if (missing.length === 0) return;
  throw new ConfinementRefusedError(
    'agent_cli_unsupported',
    `The opencode driver cannot run under AGENT_CONFINEMENT=systemd_scope yet: a confined turn has no ${missing.join(', and no ')}, ` +
      'so what a turn writes there could be read by the next one as the site identity. Use the claude_code driver on a ' +
      'confined host. Nothing was started.',
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The probe — does THIS binary honour the restriction?
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** How the probe runs a command (a seam for a gate stating its own runner). */
export type OpencodeProbeRunner = (
  argv: readonly string[],
  options: { readonly cwd: string; readonly env: Readonly<Record<string, string>> },
) => Promise<{ exitCode: number | null; stdout: string; stderr?: string; timedOut?: boolean }>;

const runProbe: OpencodeProbeRunner = (argv, options) =>
  runBinary(argv, { timeoutMs: PLANT_PROBE_TIMEOUT_MS, cwd: options.cwd, env: { ...options.env } });

/** What the probe of one binary found. */
export interface OpencodeProbe {
  readonly version: string | null;
  /** Empty = this binary may run a turn. */
  readonly problems: readonly string[];
  /**
   * True when the answer is a FACT ABOUT THE BINARY: every command it asked exited 0 within its
   * bound. A failed or slow command, a spawn that failed, an unprepared scratch tree are facts
   * about this moment — never cached, asked again next time.
   */
  readonly definitive: boolean;
  /**
   * True when every problem is a question the probe could not ASK just now — one that did not
   * answer within its bound, a spawn or a scratch tree the host refused for want of resources
   * (`TRANSIENT_ERRNOS`) — and nothing it did ask proved the binary unfit. Refused retryable
   * (`agent_cli_unproved`). A non-zero exit is the binary's own answer, a missing binary or an
   * EACCES an operator's to fix: neither is transient (both are still asked again).
   */
  readonly transient: boolean;
}

/** The errnos that say "the host could not, this moment" — never "this binary cannot". */
const TRANSIENT_ERRNOS: ReadonlySet<string> = new Set(['EAGAIN', 'EMFILE', 'ENFILE', 'ENOMEM', 'EBUSY', 'ETXTBSY']);

function transientErrno(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return typeof code === 'string' && TRANSIENT_ERRNOS.has(code);
}

type Asked =
  | { readonly ok: true; readonly stdout: string; readonly stderr: string }
  | { readonly ok: false; readonly why: string; readonly transient: boolean };

/** One probe command's outcome: its output, or why it gave none. A non-zero exit is no answer. */
async function ask(run: OpencodeProbeRunner, argv: readonly string[], cwd: string, env: Readonly<Record<string, string>>): Promise<Asked> {
  try {
    const result = await run(argv, { cwd, env });
    if (result.timedOut) return { ok: false, why: `'${argv.slice(1).join(' ')}' did not answer within ${PLANT_PROBE_TIMEOUT_MS / 1000}s`, transient: true };
    if (result.exitCode !== 0) return { ok: false, why: `'${argv.slice(1).join(' ')}' failed (exit ${String(result.exitCode)})`, transient: false };
    return { ok: true, stdout: result.stdout, stderr: result.stderr ?? '' };
  } catch (error) {
    return { ok: false, why: `'${argv.slice(1).join(' ')}' could not be run (${String((error as Error)?.message ?? error)})`, transient: transientErrno(error) };
  }
}

/** A word no path and no other token contains (the canary tokens and the scratch id). */
function randomWord(): string {
  return `z${randomBytes(8).toString('hex')}`;
}

/** The operator's credentials for opencode (`OPENCODE_ENV`, an allowlist refused at boot otherwise). */
function operatorOpencodeEnv(): Record<string, string> {
  return parseEnvPairs(config.OPENCODE_ENV);
}

export interface OpencodeProbeOptions {
  readonly stateRoot?: string;
  readonly run?: OpencodeProbeRunner;
  /** The operator's opencode environment the probe asks under (default: `OPENCODE_ENV`). */
  readonly operatorEnv?: Readonly<Record<string, string>>;
}

/**
 * PROBE `bin` — never cached here; `probeOpencode` is the cached door. Asks the binary's
 * `--version` and `run --help` (yargs writes help to STDERR: both streams are read), then the three
 * `debug` questions in a scratch workspace holding ONE canary per source (`OPENCODE_PLANT_SOURCES`),
 * twice:
 *
 *   - CONTROL — the turn's environment WITHOUT the four source switches: every canary must surface
 *     (the plugin by running), or the probe cannot see that source on this binary and refuses —
 *     a probe that sees nothing proves nothing;
 *   - RESTRICTED — EXACTLY the turn's environment (`opencodeTurnEnvironment`: the operator's
 *     credentials, the restriction over them), a fresh HOME, the TURN'S OWN persistent state as
 *     its data/state/cache, the egress switches: no canary may surface, and the resolved
 *     configuration must be exactly the daemon's (the vacuity guard, and no MCP server, agent or
 *     command beside it).
 *
 * HONEST LIMIT: the answer is cached per (binary, operator environment), so what a LATER turn
 * writes into that state is seen at the next probe (a restart, an upgrade, a changed
 * environment), not at the next turn. Under `none` there is no uid boundary at all — the turn
 * can write anything this daemon can — which is that mode's declared posture, not this probe's.
 */
export async function probeOpencodePlantClosure(bin: string, options: OpencodeProbeOptions = {}): Promise<OpencodeProbe> {
  if (!bin) return { version: null, problems: ['OPENCODE_BIN is not configured.'], definitive: true, transient: false };
  if (!isAbsolute(bin)) return { version: null, problems: [`OPENCODE_BIN ('${bin}') is not an absolute path.`], definitive: true, transient: false };
  const run = options.run ?? runProbe;
  const path = process.env.PATH ?? '/usr/bin:/bin';
  const versionRun = await ask(run, [bin, '--version'], '/', { PATH: path });
  if (!versionRun.ok) return { version: null, problems: [`OPENCODE_BIN ('${bin}'): ${versionRun.why}.`], definitive: false, transient: versionRun.transient };
  const match = `${versionRun.stdout}\n${versionRun.stderr}`.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return { version: null, problems: [`'${bin} --version' did not answer a version.`], definitive: false, transient: false };
  const version = match[0];

  // PROVEN: what an answer the binary gave says against it. UNASKED: questions this moment kept
  // from being asked — they prove nothing either way.
  const problems: string[] = [];
  const unasked: string[] = [];
  /**
   * THE ONE CLASSIFICATION of what the probe found: nothing = admitted (cached when `definitive`);
   * only unasked questions = refused RETRYABLE, never cached; any proven problem = refused, the
   * unasked listed beside it but never making it retryable.
   */
  const conclude = (definitive: boolean): OpencodeProbe => {
    if (problems.length === 0 && unasked.length === 0) return { version, problems: [], definitive, transient: false };
    if (problems.length === 0) {
      return {
        version,
        problems: [
          `opencode ${version} ('${bin}') could not be asked what it loads just now: ${unasked.join('; ')}. Nothing it ` +
            `answered proves it unfit; no answer is kept, so the next attempt asks again.`,
        ],
        definitive: false,
        transient: true,
      };
    }
    return {
      version,
      problems: [
        `opencode ${version} ('${bin}') cannot be proved restricted to the daemon's configuration: ${[...problems, ...unasked].join('; ')}. ` +
          `Unproved, a turn could load what a previous turn or a build planted in the workspace or HOME (a plugin is code it ` +
          `runs), so no opencode turn is run. Fix what is named, upgrade opencode, or use the claude_code driver.`,
      ],
      definitive,
      transient: false,
    };
  };
  const helpRun = await ask(run, [bin, 'run', '--help'], '/', { PATH: path });
  if (!helpRun.ok) {
    return { version, problems: [`opencode ${version}: ${helpRun.why}, so its flags cannot be proved.`], definitive: false, transient: helpRun.transient };
  }
  const listed = listedYargsFlags(`${helpRun.stdout}\n${helpRun.stderr}`);
  const missing = requiredOpencodeFlags().filter(flag => !listed.has(flag));
  if (missing.length > 0) problems.push(`'run --help' does not list ${missing.join(', ')}, which every turn's argv passes`);

  // THE SCRATCH TREE — daemon-private (0700), under the agent state root, one per probe.
  const stateRoot = options.stateRoot ?? config.AGENT_STATE_ROOT;
  if (!stateRoot || !isAbsolute(stateRoot)) {
    return {
      version,
      problems: [`AGENT_STATE_ROOT is not an absolute path, so opencode ${version}'s configuration sources cannot be probed.`],
      definitive: false,
      transient: false,
    };
  }
  const scratch = `probe/opencode-${randomWord()}`;
  const root = join(stateRoot, scratch);
  const tokens = Object.fromEntries(OPENCODE_PLANT_SOURCES.map(source => [source, randomWord()])) as Record<OpencodePlantSource, string>;
  try {
    const tree = opencodePlantCanaries({ tokens, root });
    // THE TURN'S OWN STATE: a turn runs (under `none`, the one mode an opencode turn runs in) with
    // the persistent `unconfined/turn/state` as its data/state/cache — where opencode keeps its
    // database (sessions AND the account whose org configuration it fetches) — so the probe asks
    // under that same state, never a fresh one that could hold none of it.
    const turnState = unconfinedTurnDirs(stateRoot).state;
    try {
      await mkdirPrivate(stateRoot, relative(stateRoot, turnState));
      for (const dir of tree.dirs) await mkdirPrivate(stateRoot, `${scratch}/${dir}`);
      for (const [relative, body] of tree.files) await writeFilePrivate(stateRoot, `${scratch}/${relative}`, body);
    } catch (error) {
      // Not a question the binary answered: a moment's resource refusal is UNASKED, anything else
      // a problem — classified by the ONE rule below (a transient beside a proven defect is the defect).
      (transientErrno(error) ? unasked : problems).push(`the probe's scratch tree under '${stateRoot}' could not be prepared (${String((error as Error).message)})`);
      return conclude(false);
    }
    const ws = join(root, 'ws');
    const home = join(root, 'home');
    const brief = join(root, tree.brief);
    // EXACTLY WHAT `declaredUnconfined` HANDS A TURN'S CHILD (the one function both use): the
    // manager's PATH, the driver's statement, the HOME law over it — with the turn's OWN network
    // (no proxy: under `none` there is none, and a probe behind a dead one could not see a remote
    // source the turn reaches). The ONE key added is OPENCODE_PROBE_OFFLINE_ENV (see there).
    const restricted: Record<string, string> = {
      ...unconfinedTurnChildEnvironment(
        { PATH: path, ...opencodeTurnEnvironment({ operatorEnv: options.operatorEnv ?? operatorOpencodeEnv(), configJson: opencodeProbeConfig(brief) }) },
        home,
        turnState,
      ),
      ...OPENCODE_PROBE_OFFLINE_ENV,
    };
    const control: Record<string, string> = { ...restricted };
    for (const key of OPENCODE_SOURCE_SWITCHES) delete control[key];
    let definitive = true;
    for (const leg of [
      { restricted: false, env: control },
      { restricted: true, env: restricted },
    ]) {
      const answers: string[] = [];
      let configAnswer: string | null = null;
      let legUnasked = false;
      for (const question of OPENCODE_PROBE_QUESTIONS) {
        const answer = await ask(run, [bin, ...question], ws, leg.env);
        if (!answer.ok) {
          (answer.transient ? unasked : problems).push(`${leg.restricted ? '' : 'control: '}${answer.why}`);
          legUnasked ||= answer.transient;
          definitive = false;
          continue;
        }
        answers.push(answer.stdout);
        if (question[1] === 'config') configAnswer = answer.stdout;
      }
      const marker = `${scratch}/${tree.pluginMarker}`;
      const pluginRan = (await readFilePrivate(stateRoot, marker).catch(() => null)) !== null;
      await rm(join(stateRoot, marker), { force: true });
      // A leg with an UNASKED question is no verdict: a canary "never surfaced" in the answer it
      // never got, a configuration it never read. Not believed either way — the leg is asked
      // whole at the next attempt (an unproved answer is never cached).
      if (!legUnasked) problems.push(...opencodePlantVerdict({ tokens, answers, configAnswer, pluginRan, brief, restricted: leg.restricted }));
    }
    // THE DATABASE admission reads for a console account must be the one this binary opens under
    // the turn's environment — asked, never assumed (a binary that ignored OPENCODE_DB would have
    // the daemon check one file while the turn reads another).
    const statedDatabase = opencodeStateDatabase(restricted.XDG_DATA_HOME ?? '');
    const dbAnswer = await ask(run, [bin, 'db', 'path'], ws, restricted);
    if (!dbAnswer.ok) {
      (dbAnswer.transient ? unasked : problems).push(dbAnswer.why);
      definitive = false;
    } else {
      const said = dbAnswer.stdout.trim().split('\n').pop()?.trim() ?? '';
      if (said !== statedDatabase) {
        problems.push(`'db path' answers '${said}', not the database the daemon states (OPENCODE_DB) and checks for a console account ('${statedDatabase}')`);
      }
    }
    return conclude(definitive);
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** One binary's identity: its resolved path and inode — an upgrade is a new key. */
function binaryKey(bin: string): string | null {
  try {
    const real = realpathSync(bin);
    const facts = statSync(real);
    return `${real}\0${facts.dev}\0${facts.ino}\0${facts.size}\0${facts.mtimeMs}`;
  } catch {
    return null;
  }
}

/** The operator environment's identity: the probe proves a binary UNDER it, so it is part of the key. */
function operatorEnvKey(env: Readonly<Record<string, string>>): string {
  const sorted = Object.keys(env)
    .sort()
    .map(key => [key, env[key]]);
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

/** The last DEFINITIVE probe per (binary, operator environment) — re-asked whenever either changes. */
const probeCache = new Map<string, OpencodeProbe>();

/** THE PROBE IN FLIGHT per key — every door joins it; no second probe of the same question starts. */
const probesInFlight = new Map<string, Promise<OpencodeProbe>>();

/** The last UNPROVED answer per key and when it was given — what detect() serves for the hold. */
const unprovedAnswers = new Map<string, { readonly probe: OpencodeProbe; readonly at: number }>();

/**
 * One probe question's key: the binary's identity (or, unresolvable, its spelling — still one
 * probe at a time) and the operator environment. `binary` is null (never cached) when unresolvable.
 */
function probeKey(bin: string, operatorEnv: Readonly<Record<string, string>>): { readonly key: string; readonly binary: string | null } {
  const binary = bin && isAbsolute(bin) ? binaryKey(bin) : null;
  return { key: `${binary ?? `unresolved\0${bin}`}\0${operatorEnvKey(operatorEnv)}`, binary };
}

/** The probe of `key`: the one in flight, or a new one registered BEFORE anything awaits. */
function joinProbe(bin: string, key: string, binary: string | null, options: OpencodeProbeOptions, now: () => number): Promise<OpencodeProbe> {
  const running = probesInFlight.get(key);
  if (running) return running;
  const probe = probeOpencodePlantClosure(bin, options)
    .then(answer => {
      if (answer.definitive && binary !== null) {
        const real = binary.slice(0, binary.indexOf('\0'));
        for (const stale of [...probeCache.keys()].filter(other => other.startsWith(`${real}\0`))) probeCache.delete(stale);
        probeCache.set(key, answer);
      } else if (!answer.definitive) {
        unprovedAnswers.set(key, { probe: answer, at: now() });
      }
      return answer;
    })
    .finally(() => {
      if (probesInFlight.get(key) === probe) probesInFlight.delete(key);
    });
  probesInFlight.set(key, probe);
  return probe;
}

/**
 * THE CACHED PROBE: asked by admit and every turn's setup (detect() reads it through its own
 * bound). A definitive answer is kept; a probe in flight is joined; an unproved answer is NOT
 * served here — a turn asks the binary itself.
 */
export async function probeOpencode(
  bin: string,
  options: Omit<OpencodeProbeOptions, 'stateRoot'> & { readonly now?: () => number } = {},
): Promise<OpencodeProbe> {
  const operatorEnv = options.operatorEnv ?? operatorOpencodeEnv();
  const { key, binary } = probeKey(bin, operatorEnv);
  const cached = probeCache.get(key);
  if (cached) return cached;
  return joinProbe(bin, key, binary, { run: options.run, operatorEnv }, options.now ?? Date.now);
}

/** The driver's seams: the binary, the mode, the runner, the operator environment, the clock. Production states none. */
export interface OpencodeSeams {
  readonly bin?: string;
  readonly mode?: ConfinementMode;
  readonly run?: OpencodeProbeRunner;
  readonly operatorEnv?: Readonly<Record<string, string>>;
  /** The clock the unproved hold is measured on (default `Date.now`). */
  readonly now?: () => number;
  /** detect()'s wait for a probe (default `OPENCODE_DETECT_WAIT_MS`). */
  readonly detectWaitMs?: number;
  /** The agent state root whose turn database admission reads (default `AGENT_STATE_ROOT`). */
  readonly stateRoot?: string;
}

/** Why a turn's database cannot be admitted, and whether that is a fact of this moment only. */
export interface OpencodeAccountProblem {
  readonly problem: string;
  readonly transient: boolean;
}

/**
 * THE TURN'S DATABASE HOLDS NO CONSOLE ACCOUNT — or why it is refused (see the header: an account
 * is a remote configuration source no key closes). Read-only, every admission, from the file the
 * daemon STATES (`OPENCODE_DB` under the turn state's data dir — the probe proved the binary opens
 * exactly it). Absent = no account yet (opencode creates it, empty). Anything that keeps the
 * question from being answered is refused too — a database that cannot be read cannot be proved
 * clean — retryable only when SQLite says it is busy. `null` = admitted; no state root = nothing to
 * read here (the probe and the confinement refuse that themselves).
 */
export function opencodeConsoleAccountProblem(stateRoot: string | undefined): OpencodeAccountProblem | null {
  if (!stateRoot || !isAbsolute(stateRoot)) return null;
  const { base, state } = unconfinedTurnDirs(stateRoot);
  const dataHome = turnHomeEnvironment(base, state).XDG_DATA_HOME ?? join(state, 'data');
  const path = opencodeStateDatabase(dataHome);
  const logout = `log it out (XDG_DATA_HOME='${dataHome}' OPENCODE_DB=${OPENCODE_STATED_DB} opencode console logout)`;
  try {
    if (!lstatSync(path).isFile()) {
      return { problem: `opencode's turn database '${path}' is not a regular file, so it cannot be proved to hold no console account.`, transient: false };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return { problem: `opencode's turn database '${path}' cannot be read (${String((error as Error).message)}).`, transient: transientErrno(error) };
  }
  let db: Database | null = null;
  try {
    db = new Database(path, { readonly: true });
    const found: string[] = [];
    for (const table of OPENCODE_ACCOUNT_TABLES) {
      const row = db.query(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number } | null;
      if ((row?.n ?? 0) > 0) found.push(`${row?.n} in '${table}'`);
    }
    if (found.length === 0) return null;
    return {
      problem:
        `opencode's turn database '${path}' holds a console account (${found.join(', ')}): opencode fetches that ` +
        `account's org configuration on every start and merges it after the daemon's (an MCP server it spawns, an ` +
        `agent's prompt), and no key turns that off. No opencode turn runs while it is there: ${logout}.`,
      transient: false,
    };
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    return {
      problem: `opencode's turn database '${path}' could not be read (${message}), so it cannot be proved to hold no console account.`,
      transient: /SQLITE_BUSY|SQLITE_LOCKED|database is locked/i.test(`${(error as { code?: string })?.code ?? ''} ${message}`),
    };
  } finally {
    db?.close();
  }
}

/**
 * THE DRIVER'S ADMISSION — the refusal under `systemd_scope`, then the probe: a CLI that does not
 * honour the restriction is refused, typed, before the manager reserves anything. A probe that
 * could not ASK is refused retryable (`agent_cli_unproved`); a proven defect is not.
 */
export async function admitOpencode(seams: OpencodeSeams = {}): Promise<void> {
  assertOpencodeConfinable(seams.mode ?? config.AGENT_CONFINEMENT);
  const probe = await probeOpencode(seams.bin ?? config.OPENCODE_BIN, { run: seams.run, operatorEnv: seams.operatorEnv, now: seams.now });
  if (probe.problems.length > 0) {
    throw new ConfinementRefusedError(probe.transient ? 'agent_cli_unproved' : 'agent_cli_unsupported', `${probe.problems.join(' ')} Nothing was started.`);
  }
  // Never cached: what the turn's database holds is asked at every admission (an account logged in
  // after the probe is refused at the next turn, not the next restart).
  const account = opencodeConsoleAccountProblem(seams.stateRoot ?? config.AGENT_STATE_ROOT);
  if (account) {
    throw new ConfinementRefusedError(account.transient ? 'agent_cli_unproved' : 'agent_cli_unsupported', `${account.problem} Nothing was started.`);
  }
}

/**
 * AVAILABLE MEANS PROVED RUNNABLE: refused under `systemd_scope` without probing; otherwise the
 * cached verdict, or the probe's answer if it comes within `OPENCODE_DETECT_WAIT_MS` (joined, never
 * a second one), or unavailable — "not proved yet" — while it runs on. An unproved answer is
 * served for `OPENCODE_UNPROVED_HOLD_MS` before /health may start another probe.
 */
export async function detectOpencode(seams: OpencodeSeams = {}): Promise<DriverInfo | null> {
  const bin = seams.bin ?? config.OPENCODE_BIN;
  if (!bin) return null;
  try {
    assertOpencodeConfinable(seams.mode ?? config.AGENT_CONFINEMENT);
  } catch {
    return null;
  }
  const now = seams.now ?? Date.now;
  const operatorEnv = seams.operatorEnv ?? operatorOpencodeEnv();
  const { key, binary } = probeKey(bin, operatorEnv);
  // Proved runnable means the turn's database admits a turn too (a console account refuses every one).
  const verdict = (probe: OpencodeProbe | null): DriverInfo | null =>
    probe === null || probe.version === null || probe.problems.length > 0 || opencodeConsoleAccountProblem(seams.stateRoot ?? config.AGENT_STATE_ROOT) !== null
      ? null
      : { id: 'opencode', binPath: bin, version: probe.version };
  const cached = probeCache.get(key);
  if (cached) return verdict(cached);
  const held = unprovedAnswers.get(key);
  if (held && now() - held.at < OPENCODE_UNPROVED_HOLD_MS) return verdict(held.probe);
  const probe = joinProbe(bin, key, binary, { run: seams.run, operatorEnv }, now);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waited = new Promise<null>(resolve => {
    timer = setTimeout(() => resolve(null), seams.detectWaitMs ?? OPENCODE_DETECT_WAIT_MS);
  });
  try {
    return verdict(await Promise.race([probe, waited]));
  } finally {
    clearTimeout(timer);
  }
}

/** Where the daemon writes an opencode turn's brief: its own state directory, never the workspace root. */
export const OPENCODE_BRIEF_FILE = 'opencode-brief.md';

/**
 * ONE TURN'S SETUP — the refusal and the probe FIRST (the guarantee behind admit()'s courtesy),
 * then the brief and the environment the daemon states.
 *
 * THE BRIEF IS THE DAEMON'S: `AGENTS.md` is read by the one bounded, link-refusing reader
 * (`brief.ts`), written by the daemon into `.builder/opencode-brief.md` (0640, through the fd-based
 * writer — never through a link), and handed to opencode as the ONE instruction file of the
 * daemon's configuration (an absolute path). Removed when the turn ends, on every path.
 */
export function opencodeTurnSetup(opts: SessionStartOptions, seams: OpencodeSeams = {}): () => Promise<TurnPlan> {
  return async () => {
    const bin = seams.bin ?? config.OPENCODE_BIN;
    await admitOpencode({ ...seams, bin });
    const brief = await readBrief(opts.workspace);
    let briefPath: string | null = null;
    const briefRelative = join(relativeUnderRoot(config.SITES_ROOT, opts.workspace), '.builder', OPENCODE_BRIEF_FILE);
    if (brief !== undefined) {
      await restateDaemonStateDir(config.SITES_ROOT, dirname(briefRelative));
      briefPath = await writeFileAgentReadable(config.SITES_ROOT, briefRelative, brief);
    }
    const written = briefPath;
    return {
      argv: opencodeTurnArgv({ bin, prompt: opts.prompt, resumeToken: opts.resumeToken }),
      env: opencodeTurnEnvironment({
        operatorEnv: seams.operatorEnv ?? operatorOpencodeEnv(),
        configJson: JSON.stringify(opencodeDaemonConfig(opts.mcp, written === null ? [] : [written])),
      }),
      parseLine: parseJsonLine,
      // Through the no-follow door (a planted `.builder` link is refused, never followed).
      ...(written === null ? {} : { cleanup: () => removeFilePrivate(config.SITES_ROOT, briefRelative) }),
    };
  };
}

function startTurn(opts: SessionStartOptions): AgentProcess {
  return spawnAgentProcess(opts, opencodeTurnSetup(opts));
}

/**
 * Maps one line of OpenCode's `--format json` output to zero or more AgentEvents. The
 * stream is coarser and more version-variable than Claude Code's, so this reads each field
 * defensively and surfaces only text, tool and the terminal session (→ resumeToken) frames;
 * file changes are left to the git backstop.
 */
function parseJsonLine(line: string): AgentEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return [];
  }
  const events: AgentEvent[] = [];
  if (typeof msg.text === 'string') events.push({ type: 'text', text: msg.text });
  if (typeof msg.tool === 'string') {
    events.push({ type: 'tool', name: msg.tool, summary: String(msg.tool) });
  }
  if (msg.type === 'session' && typeof msg.id === 'string') {
    events.push({ type: 'result', ok: true, resumeToken: msg.id, durationMs: 0 });
  }
  return events;
}

export const opencodeDriver: AgentDriver = {
  id: 'opencode',
  capabilities: { resume: true, mcpHttp: true, reportsFileChanges: false },
  detect: () => detectOpencode(),
  admit: () => admitOpencode(),
  startTurn,
};
