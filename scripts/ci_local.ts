#!/usr/bin/env bun
/**
 * RUN THE CI TIERS THE WAY THE RUNNER RUNS THEM — here, before pushing.
 *
 * WHY THIS EXISTS. `scripts/verify.ts` proves the code works ON YOUR MACHINE: with
 * ../private/.env loaded, your Postgres, your libc. The hosted tiers run with none of
 * that — `scripts/ci/db_tier.sh` composes its whole environment in-process precisely so
 * nothing is inherited, and there is no ../private/.env on a runner at all. Nothing
 * executed the tiers that way locally, so the RUNNER was the first place the code ever
 * met the runner's environment, and CI became the debugger: ~10 minutes and a pasted log
 * per iteration.
 *
 * MEASURED COST OF NOT HAVING THIS (2026-08-31): twelve defects in one day, every one
 * invisible to `verify` and guaranteed to be found by a runner and only by a runner —
 * an unset egress allowlist, an anti-vacuity probe that required the private file, the
 * parity census addressing a database nobody builds, eight config keys the tier never
 * composed, a BSD-only `gzcat`, an nginx gate that bound :80, a suite database that
 * inherited the host's collation. Four of those are caught by this script on a Mac; the
 * platform-bound ones need `--docker` (see below), which is the same script one layer
 * down.
 *
 * WHAT IT DOES NOT DO. It does not replace `verify` — that is the developer-environment
 * gate and stays. This is the OTHER environment, and both matter.
 *
 * TWO MODES.
 *
 *   HOST (default). The tier scripts run on this machine, with an empty scratch private
 *   dir. THE ONE THING IT BORROWS FROM ../private/.env is the Postgres CONNECTION (host,
 *   port, user, password) — never any application config. A runner is handed a database
 *   by its service container; you are handed one by your machine. That is a fact about
 *   where Postgres lives, not about how the engine is configured. Every DEDALO_* key the
 *   tiers need, they compose themselves — which is exactly the property under test. What
 *   host mode CANNOT reproduce is the platform: libc, GNU vs BSD userland, the media
 *   tools, the browser, the uid.
 *
 *   --docker. The tier scripts run INSIDE THE CI IMAGE (ci/Dockerfile — the image the
 *   workflows run in) through ci/compose.yml: the db/instance tiers against the SAME
 *   pgvector digest db.yml's service pins, reached at 127.0.0.1:5432 exactly as a hosted
 *   job reaches it; the hermetic tier with no database at all, as on its runner. Nothing
 *   is read from ../private — not even the connection. Every CI-vs-Mac difference that
 *   made the runner the debugger (2026-09: 25 red unit files there against 3 here, all of
 *   them missing ffmpeg/magick/poppler/mariadb) is gone by construction. See
 *   ci/compose.yml for what is copied from the workflows and why.
 *
 * WHAT --docker RUNS. By default the WORKING TREE: HEAD plus every tracked change and
 * every untracked, not-ignored file, made into ONE commit on top of HEAD inside the
 * container — the tree as it would be if you committed everything now. That shape is
 * load-bearing: the crap ledger compares against HEAD^ on a push, so the uncommitted
 * work must BE the tip, or the ledger would compare your edits against the commit before
 * the one you are standing on. `--ref <rev>` runs that commit EXACTLY instead (no
 * overlay) — the pre-push hook passes the sha being pushed, because a push sends
 * commits, not a working tree. The host repo is mounted read-only and never written.
 *
 * THE IMAGE. `dedalo-ci:local`, built from ci/Dockerfile when absent or STALE — stale
 * meaning its `org.dedalo.ci.fingerprint` label is not sha256(ci/Dockerfile ++
 * .bun-version) of this checkout. `--pull` takes `ghcr.io/renderpci/dedalo-ci:fp-<fp>`
 * instead (what ci-image.yml publishes for exactly this definition) and runs it by the
 * digest it resolved to. Either way the label is verified before a tier starts.
 *
 * THE VERDICTS. Every tier's output is streamed through and parsed into stages from the
 * tier scripts' own `== <tier>: …` lines (their "the stages are independent" law makes
 * each stage print a header and, when red, a `RED in …` line). The summary names each
 * red stage with the command that reproduces or fixes it; `--summary <file>` also writes
 * it as JSON: {tiers:[{tier, verdict, exit_code, duration_s, stages:[{name, verdict,
 * fix_hint, failures}]}]}. Exit 0 green, 1 red, 2 could not run (no docker, no image,
 * no Postgres connection, bad arguments).
 *
 * Usage:
 *   bun run ci:local              # every tier, on this machine, as CI runs them
 *   bun run ci:local --hermetic   # typecheck + lint + static tripwires + daemon packages
 *   bun run ci:local --db         # suite DB build + DB tripwires + unit tier + parity
 *   bun run ci:local --instance   # suite DB build + browser client suite + both update drills
 *   bun run ci:local --keep       # (host mode) leave the scratch private dir on disk
 *   bun run ci:local --docker [--hermetic|--db|--instance]   # the same, in the CI image
 *       [--ref <rev>]             # run that commit exactly, not the working tree
 *       [--pull]                  # use the published ghcr image, not a local build
 *       [--base <branch>]         # behave as a pull_request against <branch> (the base
 *                                 # is resolved from THIS repo's local branch of that name)
 *       [--audit-base <sha>]      # the push's `before`: what the remote had (the pre-push
 *                                 # hook passes its remote sha; default: host upstream)
 *   Any mode: [--summary <file.json>]
 *
 * The db and instance tiers each DROP AND REBUILD their own suite database. In host mode
 * that is `dedalo_ci_test` on your Postgres (distinct from the one `bun run
 * test:db:setup` builds, so yours is not disturbed); in --docker mode it is a fresh
 * pgvector container per tier, removed with its volume afterwards — as two CI jobs each
 * get a fresh service container.
 *
 * THE INSTANCE TIER ON macOS HOST MODE needs a short TMPDIR (`TMPDIR=/tmp/dd bun run
 * ci:local --instance`): the update drills bind unix sockets under it and macOS caps that
 * path at 104 bytes (AGENTS.md, test:update). --docker is Linux and needs nothing. The
 * tier is also the long one — a suite build plus 133 browser suites plus two drills.
 */

import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..');

/** The tiers, in the order a push runs them. `prefix` is what the script prints as `== <prefix>: …`. */
/**
 * `workflowSteps` are the job's `run:` steps BEFORE the tier script, copied from the
 * workflow — the tier scripts do not repeat them. db.yml's two jobs run `bun install
 * --frozen-lockfile` as a step of their own (hermetic.sh installs itself); leaving it out
 * is not a smaller run but a different one: the first --docker db run without it measured
 * 46 red DB tripwires, every one `Cannot find package 'zod'`. The db.yml apt step
 * (postgresql-client-18) is not copied: the image carries that client. --docker only —
 * host mode runs in your checkout, whose node_modules already exist.
 */
export const TIERS = [
	{
		id: 'hermetic',
		script: 'scripts/ci/hermetic.sh',
		flag: '--hermetic',
		prefix: 'hermetic',
		needsDb: false,
		workflowSteps: [] as readonly string[],
	},
	{
		id: 'db',
		script: 'scripts/ci/db_tier.sh',
		flag: '--db',
		prefix: 'db_tier',
		needsDb: true,
		workflowSteps: ['bun install --frozen-lockfile'] as readonly string[],
	},
	{
		id: 'instance',
		script: 'scripts/ci/instance_tier.sh',
		flag: '--instance',
		prefix: 'instance_tier',
		needsDb: true,
		workflowSteps: ['bun install --frozen-lockfile'] as readonly string[],
	},
] as const;
type Tier = (typeof TIERS)[number];

const LOCAL_IMAGE = 'dedalo-ci:local';
const REGISTRY_IMAGE = 'ghcr.io/renderpci/dedalo-ci';
const FINGERPRINT_LABEL = 'org.dedalo.ci.fingerprint';
const BUN_CACHE_VOLUME = 'dedalo-ci-bun-cache';
const COMPOSE_FILE = join(REPO_ROOT, 'ci', 'compose.yml');

/** Where the container sees the checkout (worktree files: the overlay's source). */
export const CONTAINER_SRC = '/src';
/** Where the container sees the repository's COMMON git dir (objects + refs: the clone's source). */
export const CONTAINER_GIT = '/src-git';

// ── arguments ────────────────────────────────────────────────────────────────

const BOOLEAN_FLAGS = new Set([
	'--hermetic',
	'--db',
	'--instance',
	'--keep',
	'--docker',
	'--pull',
	'--fail-fast',
	'--help',
	'-h',
]);
const VALUE_FLAGS = new Set(['--summary', '--ref', '--base', '--audit-base']);

interface Args {
	flags: Set<string>;
	values: Map<string, string>;
}

/**
 * Strict: an unknown flag is an error, never ignored — a typo (`--hermtic`) that silently
 * ran EVERY tier, or a `--summary` that silently wrote nothing, would be a gate lying
 * about what it ran. A lone `--` (what `bun run ci:local -- --docker` forwards) is skipped.
 */
function parseArgs(argv: string[]): Args {
	const flags = new Set<string>();
	const values = new Map<string, string>();
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index] as string;
		if (arg === '--') continue;
		const eq = arg.indexOf('=');
		const name = eq === -1 ? arg : arg.slice(0, eq);
		if (VALUE_FLAGS.has(name)) {
			const value = eq === -1 ? argv[++index] : arg.slice(eq + 1);
			if (value === undefined || value === '' || value.startsWith('--'))
				fail(`${name} needs a value`);
			values.set(name, value as string);
		} else if (BOOLEAN_FLAGS.has(arg)) {
			flags.add(arg);
		} else {
			fail(`unknown argument '${arg}' (bun run ci:local --help)`);
		}
	}
	return { flags, values };
}

/**
 * `base` minus every variable git calls REPOSITORY-LOCAL — `git rev-parse --local-env-vars`,
 * git's own list (GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, GIT_COMMON_DIR, GIT_OBJECT_DIRECTORY,
 * the `git -c` channel, …), plus the GIT_CONFIG_KEY_<n>/VALUE_<n> pairs GIT_CONFIG_COUNT
 * indexes. Every git this script spawns names its repository by `cwd` (REPO_ROOT, a scratch
 * root); an inherited GIT_DIR would override that silently — git exports one into a hook run
 * from a linked worktree, and a caller can export its own — and `workingTreeLists(<scratch>)`
 * would list, or a tier would measure, a different repository. Transport/identity variables
 * (GIT_SSH_COMMAND, GIT_CONFIG_GLOBAL, GIT_CEILING_DIRECTORIES, …) are not repository-local
 * and pass through. The list is asked of git once, with no GIT_* at all in its environment.
 */
let repositoryLocalGitVars: ReadonlySet<string> | undefined;
export function gitScrubbedEnv(
	base: Record<string, string | undefined> = process.env,
): Record<string, string | undefined> {
	if (repositoryLocalGitVars === undefined) {
		const bare = Object.fromEntries(
			Object.entries(base).filter(([key]) => !key.startsWith('GIT_')),
		);
		const proc = Bun.spawnSync(['git', 'rev-parse', '--local-env-vars'], {
			cwd: tmpdir(),
			env: bare,
			stdout: 'pipe',
			stderr: 'pipe',
		});
		if (proc.exitCode !== 0)
			fail(`git rev-parse --local-env-vars failed: ${proc.stderr.toString().trim()}`);
		repositoryLocalGitVars = new Set(
			proc.stdout
				.toString()
				.split('\n')
				.filter((name) => name !== ''),
		);
		if (!repositoryLocalGitVars.has('GIT_DIR'))
			fail('git rev-parse --local-env-vars did not name GIT_DIR — refusing to trust its list');
	}
	const local = repositoryLocalGitVars;
	return Object.fromEntries(
		Object.entries(base).filter(
			([key]) => !local.has(key) && !/^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(key),
		),
	);
}

/** Could-not-run: exit 2, distinct from a red tier (1). */
function fail(message: string): never {
	console.error(`ci:local: ${message}`);
	process.exit(2);
}

// ── stage parsing ────────────────────────────────────────────────────────────

type StageVerdict = 'green' | 'red' | 'skipped' | 'advisory';

interface Stage {
	name: string;
	verdict: StageVerdict;
	fix_hint: string | null;
	/** `(fail) …` test lines the stage printed (first 25), so the summary names what broke. */
	failures: string[];
	/** Why the stage is what it is, when the log said so (a SKIPPED reason, an abort). */
	notes: string[];
	/**
	 * What a red-baseline ratchet (scripts/lib/red_baseline.ts formatDrift) said moved, as
	 * `<BLOCK>: <entry>` — REGRESSIONS / PER-FILE FLOORS (regressions) are growth; STALE,
	 * SUMMARY, PER-FILE FLOORS (stale, re-freeze) are improvements waiting to be banked.
	 */
	drift: string[];
	/** The stage's own output — for classifying the fix, never serialized. */
	lines: string[];
}

export interface TierResult {
	tier: string;
	/** `not_run`: `--fail-fast` stopped before it because an earlier tier was red. */
	verdict: 'green' | 'red' | 'not_run';
	exit_code: number;
	duration_s: number;
	stages: Omit<Stage, 'lines'>[];
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI colour codes is the point
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
const MARKER = /^== ([a-z_]+): (.*)$/;
const MAX_FAILURES = 25;
const MAX_DRIFT = 40;
/** formatDrift's block headers (scripts/lib/red_baseline.ts); entries follow, indented two spaces. */
const DRIFT_BLOCK =
	/^(REGRESSIONS|STALE|SUMMARY|VACUITY|PER-FILE FLOORS \((?:regressions|stale, re-freeze)\)):$/;
const REGRESSION_BLOCKS = new Set(['REGRESSIONS', 'PER-FILE FLOORS (regressions)']);
/** bun's end-of-run recap ("3 tests failed:") — the (fail) lines after it belong to no header. */
const FAIL_RECAP = /^\s*\d+ tests? failed:?\s*$/;
/** The marker this script's own container driver prints to open a workflow `run:` step. */
const WORKFLOW_STEP = 'workflow_step';
const TEST_FILE_HEADER = /^(?:::group::|##\[group\])?(\S+\.test\.[cm]?[jt]sx?):$/;

/**
 * The tier scripts' OWN stage protocol, read back:
 *   `== <prefix>: <label>`                  a stage begins
 *   `== <prefix>: RED in <what> (exit N)`   the running stage is red
 *   `== <prefix>: … — ADVISORY …`           the running stage drifted but does not fail the tier
 *   `== <prefix>: RED` / `GREEN` / `OK`     the tier's own final verdict (not a stage)
 *   `== <other>: SKIPPED — <why>`           a child (audit.ts) skipped the running stage
 *   `== workflow_step: <command>`           (ci:local's own) a workflow `run:` step, as a stage
 * Keyed on the protocol, never on the current stage LABELS, so a stage another change
 * adds or renames is reported without an edit here. A tier that exits non-zero with no
 * red stage died under `set -e`: the stage that was running is where it died.
 */
export function parseStages(
	prefix: string,
	output: string,
	exitCode: number,
): Omit<Stage, 'lines'>[] {
	const stages: Stage[] = [];
	const current = (): Stage | undefined => stages[stages.length - 1];
	// bun prints each file as a header line before its tests (`::group::<file>:` under
	// GITHUB_ACTIONS, as GitHub's log shows it `##[group]<file>:`), and repeats every
	// failure in its end-of-run recap — so a failure is keyed to its file and deduplicated.
	let file: string | undefined;
	let driftBlock: string | undefined;
	for (const raw of output.split('\n')) {
		const line = raw.replace(ANSI, '').replace(/\r$/, '');
		const marker = MARKER.exec(line);
		if (marker === null) {
			const stage = current();
			if (stage === undefined) continue;
			stage.lines.push(line);
			const block = DRIFT_BLOCK.exec(line);
			if (block !== null) {
				driftBlock = block[1];
				continue;
			}
			if (driftBlock !== undefined && line.startsWith('  ') && line.trim() !== '') {
				if (stage.drift.length < MAX_DRIFT) stage.drift.push(`${driftBlock}: ${line.trim()}`);
				continue;
			}
			driftBlock = undefined;
			const header = TEST_FILE_HEADER.exec(line);
			if (header !== null) file = header[1];
			else if (FAIL_RECAP.test(line)) file = undefined;
			else if (line.startsWith('(fail) ')) {
				// Two kinds of line, two dedup rules. A line UNDER a file header is keyed to
				// that file and is a duplicate only of the identical key: two files may each
				// have a failing `test('rejects bad input')`, and both are failures (the old
				// suffix match dropped the second file's). A RECAP line carries no file, so it
				// repeats a keyed one when any known failure ends with it — only then is the
				// suffix match the right question.
				const bare = line.slice(7);
				const duplicate =
					file === undefined
						? stage.failures.some((known) => known === bare || known.endsWith(` › ${bare}`))
						: stage.failures.includes(`${file} › ${bare}`);
				if (stage.failures.length < MAX_FAILURES && !duplicate)
					stage.failures.push(file === undefined ? bare : `${file} › ${bare}`);
			}
			continue;
		}
		file = undefined;
		driftBlock = undefined;
		const [, who, text] = marker as unknown as [string, string, string];
		const stage = current();
		if (who === WORKFLOW_STEP) {
			stages.push(newStage(text));
			continue;
		}
		if (who !== prefix) {
			if (stage !== undefined && text.startsWith('SKIPPED') && stage.verdict === 'green') {
				stage.verdict = 'skipped';
				stage.notes.push(text);
			}
			stage?.lines.push(line);
			continue;
		}
		if (text.startsWith('RED in ')) {
			if (stage !== undefined) {
				stage.verdict = 'red';
				stage.notes.push(text);
			}
		} else if (/^(RED|GREEN|OK)\b/.test(text)) {
			// the tier's final verdict line
		} else if (/ADVISORY/.test(text) && !/\[ADVISORY\]\s*$/.test(text)) {
			// `… drift (exit N) — ADVISORY, not failing the tier`; a HEADER that merely
			// labels its stage `[ADVISORY]` opens a stage like any other (below).
			if (stage !== undefined && stage.verdict === 'green') {
				stage.verdict = 'advisory';
				stage.notes.push(text);
			}
		} else if (/^(bun \d|installing )/.test(text)) {
			// a version banner / a toolchain note, not a stage
			stage?.lines.push(line);
		} else {
			stages.push(newStage(text));
		}
	}
	if (exitCode !== 0 && !stages.some((stage) => stage.verdict === 'red')) {
		const last = current();
		if (last === undefined) {
			const start = newStage('tier start');
			start.verdict = 'red';
			start.notes.push(`exited ${exitCode} before its first stage`);
			stages.push(start);
		} else {
			last.verdict = 'red';
			last.notes.push(`the tier ABORTED here (exit ${exitCode}) — every later stage never ran`);
		}
	}
	return stages.map((stage) => {
		const { lines, ...rest } = stage;
		return {
			...rest,
			fix_hint: stage.verdict === 'red' || stage.verdict === 'advisory' ? fixHint(stage) : null,
		};
	});
}

function newStage(name: string): Stage {
	return { name, verdict: 'green', fix_hint: null, failures: [], notes: [], drift: [], lines: [] };
}

/**
 * The command that reproduces — or, for ratchet drift, FIXES — a red stage. Classified by
 * the stage label and, for the ratchet question, by what the stage printed: a red-baseline
 * ratchet's own drift blocks when it printed them (growth is a regression to fix, never to
 * bank; a fall is banked by one command), else the words a budget tripwire uses. Improvement
 * drift that the repo refuses until it is re-recorded is the red this repo hits most.
 */
function fixHint(stage: Stage): string {
	const name = stage.name.toLowerCase();
	const text = stage.lines.join('\n');
	const ratchet =
		/banked when it falls|\bbudget\b|shrink-only|baseline|ratchet|--update\b|per.file record/i.test(
			text,
		);
	const bank =
		'bun run baselines:bank (writes improvement-only drift; a regression needs --allow-regression --reason)';
	const firstFailure =
		stage.failures[0] === undefined ? '' : ` — first failure: ${stage.failures[0]}`;
	const grew = stage.drift.some((entry) =>
		REGRESSION_BLOCKS.has(entry.slice(0, entry.indexOf(':'))),
	);
	const driftHint =
		stage.drift.length === 0
			? undefined
			: grew
				? 'a REGRESSION against the frozen baseline (see drift): fix the code — an intended one is re-recorded with --allow-regression --reason, never banked'
				: `improvement-only drift: ${bank} --with-db`;
	if (name.startsWith('bun install --frozen-lockfile'))
		return 'bun install --frozen-lockfile (the workflow step — bun.lock out of step with a package.json?)';
	if (name.includes('bun install'))
		return 'bun install --frozen-lockfile (bun.lock out of step with a package.json?)';
	if (name.includes('typecheck') || name.includes('lint'))
		return 'bunx tsc --noEmit; bun run lint; bun run lint:browser (a browser-lint budget that FELL: bun run baselines:bank)';
	if (name.includes('crap ledger'))
		return `bun run scripts/crap_baseline.ts --check --reference HEAD^ ; counts that fell: ${bank}`;
	if (name.includes('audit'))
		return 'bun run scripts/ci/audit.ts --force (time-based inputs: a new upstream advisory or an expired vendor window — see .github/workflows/nightly.yml)';
	if (name.includes('daemon'))
		return 'cd publication/<site_builder|server_api/v2> && bun install --frozen-lockfile && bunx tsc --noEmit && bun test (all pass + exit 1 = coverageThreshold)';
	if (name.includes('suite database'))
		return 'bun run test:db:setup (the suite build itself failed — every later stage never ran)';
	if (name.includes('unit tier'))
		return `bun run scripts/unit_baseline.ts --check — ${driftHint ?? `drift: ${bank} --with-db`}`;
	if (name.includes('parity'))
		return `bun run scripts/parity_baseline.ts --check — ${driftHint ?? `drift: ${bank} --with-db`}; an intended wire change needs an engineering/wire_contract/ entry the same day`;
	if (name.includes('client suite'))
		return 'bun run test:client (reseed on; the suite starts its own server)';
	if (name.includes('release channel')) return 'TMPDIR=/tmp/dd bun run test:update';
	if (name.includes('developer channel')) return 'TMPDIR=/tmp/dd bun run test:update:dev';
	if (name.includes('tripwire')) {
		const run = `bun test --timeout=30000 <the failing file>${firstFailure}`;
		return ratchet
			? `${bank} — if the tripwire says a budget/baseline FELL; otherwise ${run}`
			: run;
	}
	if (driftHint !== undefined) return driftHint;
	return ratchet ? bank : `reproduce: bun run ci:local --docker (this stage)${firstFailure}`;
}

// ── running a tier with its output streamed AND captured ─────────────────────

export async function runStreaming(
	cmd: string[],
	options: { cwd: string; env: Record<string, string | undefined> },
) {
	const proc = Bun.spawn(cmd, {
		cwd: options.cwd,
		env: options.env,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	// The two pipes are merged into ONE capture (a stage header goes to stdout, the bun
	// `(fail)` lines under it to stderr — the parser needs them in one order), but merged
	// by WHOLE LINES: a chunk ends wherever the pipe buffer did, so appending chunks as
	// they arrive could splice an stderr chunk into the middle of a stdout line and hide a
	// `== <tier>: RED in …` marker from the parser. Each stream keeps its own partial
	// line and only complete lines reach `captured`; the tail is flushed at EOF.
	const captured: string[] = [];
	const pump = async (stream: ReadableStream<Uint8Array>, sink: NodeJS.WriteStream) => {
		const decoder = new TextDecoder();
		let partial = '';
		for await (const chunk of stream) {
			sink.write(chunk);
			partial += decoder.decode(chunk, { stream: true });
			const end = partial.lastIndexOf('\n');
			if (end !== -1) {
				captured.push(partial.slice(0, end + 1));
				partial = partial.slice(end + 1);
			}
		}
		partial += decoder.decode();
		if (partial !== '') captured.push(`${partial}\n`);
	};
	await Promise.all([pump(proc.stdout, process.stdout), pump(proc.stderr, process.stderr)]);
	const code = await proc.exited;
	return { code, output: captured.join('') };
}

async function runTier(
	tier: Tier,
	cmd: string[],
	options: { cwd: string; env: Record<string, string | undefined> },
): Promise<TierResult> {
	const started = performance.now();
	const { code, output } = await runStreaming(cmd, options);
	const stages = parseStages(tier.prefix, output, code);
	return {
		tier: tier.id,
		verdict: code === 0 ? 'green' : 'red',
		exit_code: code,
		duration_s: Math.round((performance.now() - started) / 1000),
		stages,
	};
}

/**
 * `--fail-fast`: once a tier is red the run's verdict is RED whatever the later tiers say,
 * so a caller that only needs the verdict (scripts/hooks/pre-push) stops there instead of
 * spending the db + instance tiers' ~11 minutes on an answer already given. The skipped
 * tier is still REPORTED (`not_run`), never silently absent from the summary.
 */
export function failFastSkip(
	args: Pick<Args, 'flags'>,
	tier: Tier,
	results: readonly TierResult[],
): TierResult | null {
	if (!args.flags.has('--fail-fast')) return null;
	const red = results.find((result) => result.verdict === 'red');
	if (red === undefined) return null;
	console.log(`\n══════ ${tier.id} — NOT RUN (--fail-fast: ${red.tier} is red) ══════`);
	return { tier: tier.id, verdict: 'not_run', exit_code: -1, duration_s: 0, stages: [] };
}

// ── host mode ────────────────────────────────────────────────────────────────

/**
 * The Postgres connection, and NOTHING else, out of ../private/.env.
 *
 * Parsed with the same minimal grammar `src/config/env.ts` uses rather than importing it:
 * importing the config layer would load the developer's whole configuration, which is the
 * one thing this script exists to withhold from the tiers.
 */
function connectionFromPrivateEnv(): Record<string, string> {
	const CONNECTION_KEYS = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD'] as const;
	const path = join(REPO_ROOT, '..', 'private', '.env');
	if (!existsSync(path)) return {};
	const found: Record<string, string> = {};
	for (const raw of readFileSync(path, 'utf8').split('\n')) {
		const line = raw.trim();
		if (line === '' || line.startsWith('#')) continue;
		const eq = line.indexOf('=');
		if (eq === -1) continue;
		const key = line.slice(0, eq).trim();
		if (!(CONNECTION_KEYS as readonly string[]).includes(key)) continue;
		found[key] = line
			.slice(eq + 1)
			.trim()
			.replace(/^(['"])(.*)\1$/, '$2');
	}
	return found;
}

/**
 * Where the Postgres CLIENT binaries live. `db_tier.sh` defaults this to the Debian path
 * its runner has; on any other host that directory does not exist and `pg_dump` cannot be
 * resolved, so the suite build dies before it starts. Derived from the psql on PATH.
 */
function pgBinPath(): string | undefined {
	const which = Bun.spawnSync(['which', 'pg_dump'], { stdout: 'pipe', stderr: 'ignore' });
	const found = which.stdout.toString().trim();
	return found === '' ? undefined : dirname(found);
}

async function runOnHost(args: Args, tiers: readonly Tier[]): Promise<TierResult[]> {
	// THE RUNNER'S CONDITION, made real: an EMPTY directory where ../private would be.
	// Not a missing path — `db_tier.sh` does `mkdir -p ../private` itself, so a runner has
	// the directory and not the file. Reproducing the file's absence is the point; a
	// missing directory would test something else.
	const privateDir = mkdtempSync(join(tmpdir(), 'dedalo-ci-local-private-'));

	const connection = connectionFromPrivateEnv();
	const missing = ['DB_HOST', 'DB_USER'].filter(
		(key) => process.env[key] === undefined && connection[key] === undefined,
	);
	if (missing.length > 0) {
		rmSync(privateDir, { recursive: true, force: true });
		fail(
			`no Postgres connection. ${missing.join(' and ')} is neither in your environment nor in ../private/.env.\n` +
				'A runner is handed a database by its service container; this script needs to be told where yours is\n' +
				'(or run it in the CI image, which brings its own: bun run ci:local --docker).',
		);
	}

	const binPath = process.env.DEDALO_PG_BIN_PATH ?? pgBinPath();
	const env: Record<string, string | undefined> = {
		...gitScrubbedEnv(),
		...connection,
		// The caller's explicit values still win over the file's.
		...Object.fromEntries(
			['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD']
				.filter((key) => process.env[key] !== undefined)
				.map((key) => [key, process.env[key]]),
		),
		DEDALO_PRIVATE_DIR: privateDir,
		...(binPath === undefined ? {} : { DEDALO_PG_BIN_PATH: binPath }),
	};

	console.log(`== ci:local: private dir ${privateDir} (empty — the runner's condition)`);
	console.log(`== ci:local: tiers ${tiers.map((tier) => tier.id).join(', ')}`);
	if (binPath !== undefined) console.log(`== ci:local: pg client ${binPath}`);

	const results: TierResult[] = [];
	for (const tier of tiers) {
		const skipped = failFastSkip(args, tier, results);
		if (skipped !== null) {
			results.push(skipped);
			continue;
		}
		console.log(`\n══════ ${tier.id} ══════`);
		results.push(await runTier(tier, ['bash', tier.script], { cwd: REPO_ROOT, env }));
	}

	if (args.flags.has('--keep')) console.log(`\n== ci:local: kept ${privateDir}`);
	else rmSync(privateDir, { recursive: true, force: true });
	return results;
}

// ── docker mode ──────────────────────────────────────────────────────────────

/**
 * What runs INSIDE the container, written to /ci-in/driver.sh (the compose entrypoint).
 *
 * As root, only: create `runner` at uid/gid 1001 (the GitHub-hosted runner's), give it its
 * home and the bun cache mount. Then everything else as `runner` via `runuser` — which,
 * without `-l`, keeps the compose environment and sets HOME/USER/SHELL, as a runner step
 * sees them.
 *
 * As runner: clone the host's COMMON git dir (mounted read-only at CONTAINER_GIT) SHARING
 * its object store — full history, nothing copied — check out the requested sha on the branch name a push checkout has, and, in
 * working-tree mode, lay the host's changes over it and COMMIT them, so HEAD is the tree
 * under test and HEAD^ is the commit you are standing on (see the header: the crap
 * ledger's push reference). Then exec the tier script, exactly as the workflow step does.
 */
const IN_CONTAINER_DRIVER = `#!/usr/bin/env bash
set -euo pipefail
if [ "$(id -u)" = 0 ]; then
	getent group 1001 >/dev/null || groupadd -g 1001 runner
	id runner >/dev/null 2>&1 || useradd -u 1001 -g 1001 -M -d /home/runner -s /bin/bash runner
	mkdir -p /home/runner/work/dedalo /home/runner/work/_temp /home/runner/.bun/install/cache
	chown runner:runner /home/runner /home/runner/work /home/runner/work/dedalo /home/runner/work/_temp \\
		/home/runner/.bun /home/runner/.bun/install /home/runner/.bun/install/cache
	exec runuser -u runner -- bash /ci-in/driver.sh
fi
cd /home/runner/work/dedalo
echo "== ci:local(docker): image $(cat /etc/dedalo-ci-image 2>/dev/null | cut -c1-12) · $(uname -m) · uid $(id -u) · bun $(bun --version)"
# The clone's source is the COMMON git dir, never ${CONTAINER_SRC}: from a linked worktree
# ${CONTAINER_SRC}/.git is a FILE naming a HOST path the container cannot resolve.
git clone --quiet --shared --no-checkout ${CONTAINER_GIT} dedalo
cd dedalo
git checkout --quiet -B "$DEDALO_CI_BRANCH" "$DEDALO_CI_SHA"
# The clone made its default branch track origin (= the HOST repo's local branch, i.e.
# the pushed sha itself), and -B keeps that config. Left in place, hermetic.sh's
# desk fallback (merge-base with @{upstream}) resolves the audit base to HEAD and
# SKIPS a pushed lockfile change. A runner's checkout has no upstream either; the push's
# base arrives as DEDALO_CI_AUDIT_BASE, resolved on the host (runInDocker).
git branch --quiet --unset-upstream 2>/dev/null || true
if [ "$DEDALO_CI_OVERLAY" = 1 ]; then
	if [ -s /ci-in/copy.lst ]; then tar -C ${CONTAINER_SRC} --null -T /ci-in/copy.lst -cf - | tar -xf -; fi
	if [ -s /ci-in/delete.lst ]; then xargs -0 rm -f -- < /ci-in/delete.lst; fi
	git add -A
	if ! git diff --cached --quiet; then
		git -c user.name=ci-local -c user.email=ci-local@localhost commit --quiet --no-verify -m 'ci:local — the working tree'
	fi
fi
export GITHUB_SHA="$(git rev-parse HEAD)"
echo "== ci:local(docker): HEAD $(git log -1 --format='%h %s') · HEAD^ $(git rev-parse --short 'HEAD^' 2>/dev/null || echo none)"
# The workflow's own run: steps before the tier (TIERS.workflowSteps), one per line; a red
# step ends the job here, as it does on GitHub.
while IFS= read -r step; do
	[ -n "$step" ] || continue
	echo "== workflow_step: $step"
	bash -c "$step"
done < /ci-in/steps.lst
exec bash "$DEDALO_CI_TIER_SCRIPT"
`;

function docker(
	args: string[],
	options: { quiet?: boolean; env?: Record<string, string | undefined> } = {},
) {
	const proc = Bun.spawnSync(['docker', ...args], {
		cwd: REPO_ROOT,
		env: options.env ?? gitScrubbedEnv(),
		stdout: options.quiet === false ? 'inherit' : 'pipe',
		stderr: options.quiet === false ? 'inherit' : 'pipe',
	});
	return {
		code: proc.exitCode ?? 1,
		stdout: proc.stdout?.toString().trim() ?? '',
		stderr: proc.stderr?.toString().trim() ?? '',
	};
}

/** sha256(ci/Dockerfile ++ .bun-version) — the image's identity, same bytes ci-image.yml hashes. */
function imageFingerprint(): string {
	const hasher = new Bun.CryptoHasher('sha256');
	hasher.update(readFileSync(join(REPO_ROOT, 'ci', 'Dockerfile')));
	hasher.update(readFileSync(join(REPO_ROOT, '.bun-version')));
	return hasher.digest('hex');
}

function imageLabel(ref: string): string | undefined {
	const inspect = docker([
		'image',
		'inspect',
		ref,
		'--format',
		`{{ index .Config.Labels "${FINGERPRINT_LABEL}" }}`,
	]);
	return inspect.code === 0 ? inspect.stdout : undefined;
}

/**
 * The image to run, current for THIS checkout's ci/Dockerfile + .bun-version, or exit 2.
 * Local: reuse dedalo-ci:local when its label matches, else build it (native arch — the
 * image is multi-arch, so Apple Silicon runs arm64 without emulation). --pull: the
 * published fp-<fp> tag, run by the digest it resolved to so the run names exactly what
 * it ran.
 */
function ensureImage(pull: boolean): string {
	const fingerprint = imageFingerprint();
	if (pull) {
		const tag = `${REGISTRY_IMAGE}:fp-${fingerprint}`;
		console.log(`== ci:local: pulling ${tag}`);
		if (docker(['pull', tag], { quiet: false }).code !== 0) {
			fail(
				`could not pull ${tag}. ci-image.yml publishes it when ci/Dockerfile or .bun-version lands on master/v7;\n` +
					'  for a definition not yet published, drop --pull and the image is built locally.',
			);
		}
		const digest = docker([
			'image',
			'inspect',
			tag,
			'--format',
			'{{ index .RepoDigests 0 }}',
		]).stdout;
		if (imageLabel(tag) !== fingerprint)
			fail(`${tag} carries the wrong ${FINGERPRINT_LABEL} label — refusing it.`);
		return digest === '' ? tag : digest;
	}
	const label = imageLabel(LOCAL_IMAGE);
	if (label === fingerprint) return LOCAL_IMAGE;
	console.log(
		label === undefined
			? `== ci:local: ${LOCAL_IMAGE} absent — building it from ci/Dockerfile`
			: `== ci:local: ${LOCAL_IMAGE} is STALE (label ${label.slice(0, 12)}, checkout ${fingerprint.slice(0, 12)}) — rebuilding`,
	);
	const build = docker(
		[
			'buildx',
			'build',
			'-f',
			'ci/Dockerfile',
			'--build-arg',
			`DEDALO_CI_FINGERPRINT=${fingerprint}`,
			'-t',
			LOCAL_IMAGE,
			'--load',
			'.',
		],
		{ quiet: false },
	);
	if (build.code !== 0) fail('the CI image build failed (output above).');
	if (imageLabel(LOCAL_IMAGE) !== fingerprint)
		fail(`the rebuilt ${LOCAL_IMAGE} does not carry fingerprint ${fingerprint}.`);
	return LOCAL_IMAGE;
}

function git(args: string[], cwd: string = REPO_ROOT): string {
	const proc = Bun.spawnSync(['git', ...args], {
		cwd,
		env: gitScrubbedEnv(),
		stdout: 'pipe',
		stderr: 'pipe',
	});
	if (proc.exitCode !== 0) fail(`git ${args.join(' ')} failed: ${proc.stderr.toString().trim()}`);
	return proc.stdout.toString();
}

/**
 * The push's `before` — GitHub's `event.before`, the ref's tip on the remote before this
 * push — which hermetic.sh's dependency audit diffs against (its `--changed-since`). It
 * must cover EVERY commit being pushed, or a lockfile bump in any commit but the tip is
 * SKIPPED here while GitHub audits it: the container cannot know it (its clone of the
 * host repo sees the pushed sha as its own upstream), so it is resolved HERE and passed
 * as DEDALO_CI_AUDIT_BASE, the caller-knows-the-remote door hermetic.sh documents.
 *   explicit  `--audit-base <rev>` — the pre-push hook's remote sha. All zeros (a new
 *             branch: what git hands the hook, and what GitHub sends) passes through as
 *             is, and hermetic.sh resolves it to nothing → the audit RUNS. A hex sha this
 *             clone never fetched passes through too — the container cannot fetch it
 *             either and the audit RUNS: the safe direction. Anything else must resolve.
 *   default   merge-base(<tree under test>, the host branch's @{upstream}): all unpushed
 *             work, as of the last fetch. No upstream → '' → the audit RUNS.
 * Never HEAD / HEAD^ — the defect this replaced.
 */
function resolveAuditBase(explicit: string | undefined, sha: string): string {
	if (explicit !== undefined) {
		if (/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(explicit)) return explicit;
		const proc = Bun.spawnSync(
			['git', 'rev-parse', '--verify', '--quiet', `${explicit}^{commit}`],
			{
				cwd: REPO_ROOT,
				env: gitScrubbedEnv(),
				stdout: 'pipe',
				stderr: 'pipe',
			},
		);
		if (proc.exitCode !== 0) fail(`--audit-base ${explicit} is not a commit in this repository`);
		return proc.stdout.toString().trim();
	}
	const upstream = Bun.spawnSync(['git', 'rev-parse', '--verify', '--quiet', '@{upstream}'], {
		cwd: REPO_ROOT,
		env: gitScrubbedEnv(),
		stdout: 'pipe',
		stderr: 'pipe',
	});
	if (upstream.exitCode !== 0) return '';
	const mergeBase = Bun.spawnSync(['git', 'merge-base', sha, upstream.stdout.toString().trim()], {
		cwd: REPO_ROOT,
		env: gitScrubbedEnv(),
		stdout: 'pipe',
		stderr: 'pipe',
	});
	return mergeBase.exitCode === 0 ? mergeBase.stdout.toString().trim() : '';
}

/**
 * The working tree as two NUL-separated lists, computed HERE with the host's own git and
 * index (inside the container every file's stat data differs from the index, so git there
 * would re-hash the whole tree): the paths to lay over HEAD (when they exist on disk) and
 * the paths HEAD has that the disk does not.
 *
 * The question is "what differs between HEAD and THE DISK", so it is asked as exactly that:
 * `git diff HEAD` (working tree vs HEAD, straight through the index) + the untracked-not-
 * ignored files. NOT `ls-files --modified`, which compares the disk with the INDEX: a
 * `git add`ed edit, a `git add`ed new file and a `git rm`ed file all agree with the index
 * and vanished from the overlay, so the container tested a tree that was not the one on
 * disk. `--no-renames`: a detected rename would name only its new path and the old one
 * would survive in the container. Exported for the fixture gate
 * (test/unit/ci_local_native.test.ts), which builds each of those states in a scratch repo.
 */
export function workingTreeLists(root: string = REPO_ROOT): { copy: string[]; remove: string[] } {
	const split = (text: string) => text.split('\0').filter((path) => path !== '');
	const changed = new Set([
		...split(git(['diff', '--name-only', '-z', '--no-renames', 'HEAD', '--'], root)),
		...split(git(['ls-files', '-z', '--others', '--exclude-standard'], root)),
	]);
	// A top-level node_modules of ANY type stays out: `.gitignore`'s `node_modules/` matches
	// only a directory, so a SYMLINKED node_modules (the one the hook lends a linked
	// worktree) was listed as untracked, copied as a dangling host link, and the tier died
	// at `bun install` with ENOENT. The container installs its own from the lockfile.
	changed.delete('node_modules');
	const copy: string[] = [];
	const remove: string[] = [];
	for (const path of changed) {
		let exists = true;
		try {
			lstatSync(join(root, path));
		} catch {
			exists = false;
		}
		(exists ? copy : remove).push(path);
	}
	return { copy: copy.sort(), remove: remove.sort() };
}

/**
 * The two host paths the container mounts read-only: the checkout (the overlay is copied
 * from its files) and the repository's COMMON git dir (the clone reads objects and refs
 * from it). They are one tree in a plain checkout; from a LINKED WORKTREE they are not —
 * the worktree's `.git` is a file (`gitdir: <host path>/.git/worktrees/<name>`) and a
 * clone of the worktree mount alone died in the container on a path it could not see
 * (2026-09-26). Asked of git (`--git-common-dir`, absolute), never inferred from layout,
 * so a `--separate-git-dir` checkout resolves too. Exported for ci_local_native, which
 * mounts them by copy after moving the originals away and runs the driver's own clone.
 */
export function containerMounts(root: string = REPO_ROOT): { host: string; container: string }[] {
	const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], root).trim();
	const top = git(['rev-parse', '--show-toplevel'], root).trim();
	// Objects borrowed through alternates (`git clone --shared` / `--reference`) live at a
	// host path the container cannot see: its clone died on "unable to read tree". Refuse
	// up front, naming the cure, rather than fail deep inside the container.
	const alternates = join(common, 'objects', 'info', 'alternates');
	if (existsSync(alternates) && readFileSync(alternates, 'utf8').trim() !== '') {
		fail(
			`ci:local --docker cannot run from a repository whose objects come through alternates (${alternates}); run \`git repack -a -d\` and remove that file, or use a full clone.`,
		);
	}
	return [
		{ host: resolve(top), container: CONTAINER_SRC },
		{ host: resolve(common), container: CONTAINER_GIT },
	];
}

/** The driver's text, exported so a gate runs ITS clone line, not a copy of it. */
export const DRIVER_SCRIPT = IN_CONTAINER_DRIVER;

async function runInDocker(args: Args, tiers: readonly Tier[]): Promise<TierResult[]> {
	if (docker(['info', '--format', '{{.ServerVersion}}']).code !== 0) {
		fail('docker is not reachable (is Docker Desktop running?).');
	}
	if (docker(['compose', 'version', '--short']).code !== 0)
		fail('`docker compose` (v2) is not available.');
	if (args.flags.has('--keep'))
		console.log('== ci:local: --keep applies to host mode; --docker always removes its containers');

	const image = ensureImage(args.flags.has('--pull'));
	if (docker(['volume', 'create', BUN_CACHE_VOLUME]).code !== 0)
		fail(`could not create volume ${BUN_CACHE_VOLUME}.`);

	// What to run: an exact commit (--ref), or HEAD + the working tree as one commit.
	const ref = args.values.get('--ref');
	const sha = git(['rev-parse', '--verify', `${ref ?? 'HEAD'}^{commit}`]).trim();
	const branchName = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
	const branch = branchName === 'HEAD' || branchName === '' ? 'master' : branchName;
	const base = args.values.get('--base');
	const auditBase =
		base === undefined ? resolveAuditBase(args.values.get('--audit-base'), sha) : '';
	if (base !== undefined && args.values.has('--audit-base'))
		fail('--audit-base is a push fact; with --base the audit diffs against the PR target');

	// The run's inputs, mounted read-only at /ci-in. Under the OS temp dir, which Docker
	// Desktop shares by default (/var/folders, /tmp) — never inside the repo.
	// mkdtemp is 0700 and the container reads it as uid 1001, not as you: open it up
	// (it holds a driver script and two path lists, nothing secret).
	const inputs = mkdtempSync(join(tmpdir(), 'dedalo-ci-docker-'));
	chmodSync(inputs, 0o755);
	writeFileSync(join(inputs, 'driver.sh'), IN_CONTAINER_DRIVER, { mode: 0o644 });
	let overlay = false;
	if (ref === undefined) {
		const lists = workingTreeLists();
		overlay = true;
		writeFileSync(join(inputs, 'copy.lst'), lists.copy.map((path) => `${path}\0`).join(''));
		writeFileSync(join(inputs, 'delete.lst'), lists.remove.map((path) => `${path}\0`).join(''));
		console.log(
			`== ci:local: tree = HEAD ${sha.slice(0, 12)} + working tree (${lists.copy.length} changed/untracked, ${lists.remove.length} deleted) as one commit`,
		);
	} else {
		writeFileSync(join(inputs, 'copy.lst'), '');
		writeFileSync(join(inputs, 'delete.lst'), '');
		console.log(`== ci:local: tree = ${ref} (${sha.slice(0, 12)}) exactly`);
	}
	console.log(`== ci:local: image ${image}`);
	console.log(
		`== ci:local: tiers ${tiers.map((tier) => tier.id).join(', ')} (docker, ${process.arch})`,
	);
	if (base !== undefined) console.log(`== ci:local: as a pull_request against ${base}`);
	else
		console.log(
			`== ci:local: audit base (push \`before\`) ${auditBase === '' ? '<none — the audit runs>' : auditBase.slice(0, 12)}`,
		);

	const results: TierResult[] = [];
	let activeProject: string | undefined;
	const composeEnvBase: Record<string, string | undefined> = {
		...gitScrubbedEnv(),
		DEDALO_CI_IMAGE_REF: image,
		...Object.fromEntries(
			containerMounts().map((mount) => [
				mount.container === CONTAINER_SRC ? 'DEDALO_CI_SRC' : 'DEDALO_CI_GIT',
				mount.host,
			]),
		),
		DEDALO_CI_IN: inputs,
		DEDALO_CI_SHA: sha,
		DEDALO_CI_BRANCH: base === undefined ? branch : `ci-local-pr`,
		DEDALO_CI_GITHUB_REF: base === undefined ? `refs/heads/${branch}` : 'refs/pull/0/merge',
		DEDALO_CI_EVENT: base === undefined ? 'push' : 'pull_request',
		DEDALO_CI_BASE_REF: base ?? '',
		DEDALO_CI_AUDIT_BASE: auditBase,
		DEDALO_CI_OVERLAY: overlay ? '1' : '0',
		// compose.yml REQUIRES this (`:?`) for every command it parses, `down` included —
		// without it the teardown fails to interpolate and leaks the project's network.
		DEDALO_CI_TIER_SCRIPT: 'none',
	};
	const teardown = (project: string) => {
		const down = docker(
			[
				'compose',
				'-f',
				COMPOSE_FILE,
				'-p',
				project,
				'--profile',
				'db',
				'down',
				'-v',
				'--remove-orphans',
			],
			{
				env: composeEnvBase,
			},
		);
		if (down.code !== 0)
			console.error(
				`== ci:local: WARNING — could not remove compose project ${project}: ${down.stderr}\n   remove it by hand: docker compose -p ${project} down -v`,
			);
	};
	const onSignal = () => {
		if (activeProject !== undefined) {
			console.error(`\n== ci:local: interrupted — removing ${activeProject}`);
			teardown(activeProject);
		}
		rmSync(inputs, { recursive: true, force: true });
		process.exit(130);
	};
	process.on('SIGINT', onSignal);
	process.on('SIGTERM', onSignal);

	try {
		for (const tier of tiers) {
			const skipped = failFastSkip(args, tier, results);
			if (skipped !== null) {
				results.push(skipped);
				continue;
			}
			// One compose project per tier: each CI job gets a FRESH service container, and
			// the instance tier's fixture must not see the db tier's 725-file pollution.
			const project = `dedalo-ci-${process.pid}-${tier.id}`;
			activeProject = project;
			const env = { ...composeEnvBase, DEDALO_CI_TIER_SCRIPT: tier.script };
			writeFileSync(
				join(inputs, 'steps.lst'),
				tier.workflowSteps.map((step) => `${step}\n`).join(''),
				{ mode: 0o644 },
			);
			console.log(`\n══════ ${tier.id} (docker) ══════`);
			const service = tier.needsDb ? 'runner-db' : 'runner';
			const cmd = ['docker', 'compose', '-f', COMPOSE_FILE, '-p', project];
			if (tier.needsDb) cmd.push('--profile', 'db');
			cmd.push('run', '--rm', '-T', service);
			try {
				results.push(await runTier(tier, cmd, { cwd: REPO_ROOT, env }));
			} finally {
				teardown(project);
				activeProject = undefined;
			}
		}
	} finally {
		process.off('SIGINT', onSignal);
		process.off('SIGTERM', onSignal);
		rmSync(inputs, { recursive: true, force: true });
	}
	return results;
}

// ── summary ──────────────────────────────────────────────────────────────────

const GLYPH: Record<StageVerdict, string> = { green: '✓', red: '✗', skipped: '–', advisory: '!' };

function printSummary(results: TierResult[]): void {
	console.log('\n── CI:LOCAL SUMMARY ──');
	for (const result of results) {
		if (result.verdict === 'not_run') {
			console.log(`  – ${result.tier}  (not run — --fail-fast)`);
			continue;
		}
		console.log(
			`  ${result.verdict === 'green' ? '✓' : '✗'} ${result.tier}  (${result.duration_s}s, exit ${result.exit_code})`,
		);
		for (const stage of result.stages) {
			console.log(
				`      ${GLYPH[stage.verdict]} ${stage.name}${stage.verdict === 'green' ? '' : `  [${stage.verdict}]`}`,
			);
			if (stage.verdict === 'red' || stage.verdict === 'advisory') {
				for (const note of stage.notes) console.log(`          ${note}`);
				// A ratchet stage's (fail) lines include every red its baseline already
				// lists; what it said MOVED is the drift, so that is what is shown for it.
				const shown =
					stage.drift.length > 0 ? stage.drift : stage.failures.map((f) => `(fail) ${f}`);
				for (const entry of shown.slice(0, 8)) console.log(`          ${entry}`);
				if (shown.length > 8) console.log(`          … ${shown.length - 8} more (in --summary)`);
				if (stage.fix_hint !== null) console.log(`          → ${stage.fix_hint}`);
			}
		}
	}
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	if (args.flags.has('--help') || args.flags.has('-h')) {
		console.log(
			'bun run ci:local [--hermetic] [--db] [--instance] [--keep] [--fail-fast] [--summary <file>]\n' +
				'bun run ci:local --docker [--hermetic] [--db] [--instance] [--ref <rev>] [--audit-base <sha>] [--pull] [--base <branch>] [--fail-fast] [--summary <file>]\n\n' +
				'Runs the CI tiers with the environment a RUNNER has: no ../private/.env, every\n' +
				'DEDALO_* key composed by the tier itself. Host mode takes only the Postgres\n' +
				'connection from your machine; on macOS run --instance under a short TMPDIR\n' +
				'(TMPDIR=/tmp/dd). --docker runs them in the CI image (ci/Dockerfile) against the\n' +
				"pinned pgvector service (ci/compose.yml) — the runner's platform, not just its\n" +
				'config. Default tree: the working tree as one commit on HEAD; --ref runs a commit\n' +
				'exactly. --fail-fast stops after the first red tier (the rest are reported\n' +
				'not_run). Exit 0 green, 1 red, 2 could not run.',
		);
		process.exit(0);
	}
	if (!args.flags.has('--docker')) {
		for (const flag of ['--ref', '--base', '--audit-base'])
			if (args.values.has(flag))
				fail(`${flag} needs --docker (host mode runs this checkout in place)`);
		if (args.flags.has('--pull')) fail('--pull needs --docker');
	}

	const selected = TIERS.filter((tier) => args.flags.has(tier.flag));
	const tiers = selected.length > 0 ? selected : TIERS;

	const results = args.flags.has('--docker')
		? await runInDocker(args, tiers)
		: await runOnHost(args, tiers);

	printSummary(results);
	const summaryPath = args.values.get('--summary');
	if (summaryPath !== undefined) {
		// `bun run` moves cwd to the package root; a relative path means where the CALLER
		// stood, which bun records in INIT_CWD.
		const path = resolve(process.env.INIT_CWD ?? process.cwd(), summaryPath);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(
			path,
			`${JSON.stringify({ mode: args.flags.has('--docker') ? 'docker' : 'host', tiers: results }, null, '\t')}\n`,
		);
		console.log(`\n== ci:local: summary written to ${path}`);
	}

	// A `not_run` tier exists only after a red one, so the red one already fails the run.
	const failed = results.filter((result) => result.verdict === 'red');
	if (failed.length > 0) {
		console.log(
			`\nCI:LOCAL RED — ${failed.map((result) => result.tier).join(', ')}. This is what the runner will say.`,
		);
		process.exit(1);
	}
	console.log('\nCI:LOCAL GREEN');
}

if (import.meta.main) await main();
