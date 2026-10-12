/**
 * THE HOST STEPS SURVIVE A KILL BETWEEN ANY TWO OF THEM (terminal installer
 * phase 4, 2026-10-12; src/core/install/host/host_executor.ts over the one step
 * loop, src/core/install/step_loop.ts's fault seam).
 *
 * A REAL PROCESS is killed: a child bun runs the production route through the
 * scratch seam (DEDALO_INSTALL_HOST_ROOT — the recording runner and a marked
 * scratch root, host/scratch.ts) with DEDALO_INSTALL_FAULT=<host step>:before
 * or :after — SIGKILL from inside the loop, no handler runs, exactly what a
 * power cut or `kill -9` leaves. Then a NEW process resumes (or aborts).
 *
 * WHAT IS MEASURED, for EVERY production host step, both kill points:
 *  (a) RESUME CONVERGES: `--resume` completes, and the scratch host it leaves —
 *      every file's bytes, every recorded mode and owner — EQUALS the host an
 *      uninterrupted run leaves; the MULTISET of host-changing commands across
 *      the killed run and its resume EQUALS the uninterrupted run's (nothing
 *      done twice, nothing skipped). The plan/state record's own timestamps
 *      are the only difference allowed.
 *  (b) ABORT AFTER ANY STEP leaves only what was there before: before the
 *      engine completes, every file this install wrote is gone (what remains
 *      is the pre-existing host, byte-equal, and what the scratch runner's
 *      COMMANDS left — their removal is a logged command, not a file effect)
 *      and the record is removed; once the engine completed, the instance is
 *      KEPT and only the host steps after it were undone.
 *
 * DB-FREE, network-free (the hermetic tier runs it); ~60 short child processes.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PRODUCTION_HOST_STEP_IDS } from '../../src/core/install/install_plan.ts';
import {
	changesHost,
	HOST_VARIANTS,
	type HostVariant,
	hostFiles,
	hostResponses,
	loggedCommands,
	productionRaw,
	REPO_ROOT,
	ROOT_PASSWORD,
	SCRATCH_DIR,
	sourceFiles,
} from '../helpers/install_host_scratch.ts';

const scratchBase = mkdtempSync(join(tmpdir(), 'dedalo_install_host_resume_'));
afterAll(() => rmSync(scratchBase, { recursive: true, force: true }));

const VARIANT = HOST_VARIANTS[0] as HostVariant; // ubuntu2604 + nginx + letsencrypt: every step planned
const RUN_DIR = '/var/lib/dedalo-install/demo';
const DB = 'dedalo_demo';

/** The steps this variant plans (all of them: Let's Encrypt plans host_web_http). */
const STEPS: readonly string[] = [...PRODUCTION_HOST_STEP_IDS];

/** A file outside this install (another site): never touched. */
const DECOY = [
	'/etc/nginx/conf.d/museum-shop.conf',
	'server {\n\tserver_name shop.example.org;\n}\n',
] as const;

/** Write `files` under `base` (a path ending in `/` is a directory). */
function plant(base: string, files: ReadonlyMap<string, string>): void {
	for (const [path, content] of files) {
		const real = join(base, path);
		if (path.endsWith('/')) {
			mkdirSync(real, { recursive: true });
			continue;
		}
		mkdirSync(dirname(real), { recursive: true });
		writeFileSync(real, content);
	}
}

const SOURCE = join(scratchBase, 'source');
plant(SOURCE, sourceFiles());

/** The child: one executor run of the variant's plan through the scratch seam. */
const DRIVER = join(scratchBase, 'drive.ts');
writeFileSync(
	DRIVER,
	[
		`import { buildInstallPlan } from ${JSON.stringify(join(REPO_ROOT, 'src/core/install/install_plan.ts'))};`,
		`import { buildPlanFile } from ${JSON.stringify(join(REPO_ROOT, 'src/core/install/run_files_core.ts'))};`,
		`import { executeHostInstall } from ${JSON.stringify(join(REPO_ROOT, 'src/core/install/host/host_executor.ts'))};`,
		'const mode = process.argv[2];',
		`const secrets = { root_password: ${JSON.stringify(ROOT_PASSWORD)} };`,
		`const plan = buildInstallPlan(${JSON.stringify(productionRaw(VARIANT))}, { rootPassword: secrets.root_password, requireRootPassword: true });`,
		'const request = mode === "fresh"',
		'\t? { mode, execute: true, planFile: buildPlanFile(plan, secrets), secrets }',
		`\t: { mode, execute: true, givenAnswers: plan.answers, givenKeys: [], secrets, confirmDatabase: ${JSON.stringify(DB)} };`,
		'const lines = [];',
		'const outcome = await executeHostInstall(request, { log: (l) => lines.push(l), warn: (l) => lines.push(l), showOnce: () => true },',
		`\t{ source: ${JSON.stringify(SOURCE)}, sleep: async () => {} });`,
		'console.log(JSON.stringify({ result: outcome.result, failedStep: outcome.failedStep, message: outcome.message, undoing: lines.find((l) => l.startsWith("→ undoing:")) ?? null }));',
		'',
	].join('\n'),
);

let counter = 0;

/** A planted scratch host (the decoy included); answers its root. */
function scratchRoot(): string {
	counter += 1;
	const root = join(scratchBase, `r${counter}`);
	plant(root, hostFiles(VARIANT));
	plant(root, new Map([DECOY]));
	mkdirSync(join(root, SCRATCH_DIR), { recursive: true });
	writeFileSync(join(root, SCRATCH_DIR, 'responses.json'), JSON.stringify(hostResponses(VARIANT)));
	return root;
}

interface ChildRun {
	killed: boolean;
	outcome: {
		result: string;
		failedStep: string | null;
		message: string | null;
		undoing: string | null;
	} | null;
}

/** Run the driver in a child (`fault`: DEDALO_INSTALL_FAULT). */
async function child(
	root: string,
	mode: 'fresh' | 'resume' | 'abort',
	fault?: string,
): Promise<ChildRun> {
	const { DEDALO_INSTALL_FAULT: _inherited, ...inherited } = process.env;
	const env: Record<string, string | undefined> = {
		...inherited,
		DEDALO_INSTALL_HOST_ROOT: root,
		...(fault === undefined ? {} : { DEDALO_INSTALL_FAULT: fault }),
	};
	const proc = Bun.spawn([process.execPath, DRIVER, mode], {
		cwd: REPO_ROOT,
		env: env as Record<string, string>,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const [stdout] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	const line = stdout.trim().split('\n').at(-1) ?? '';
	return {
		killed: proc.signalCode === 'SIGKILL',
		outcome: line.startsWith('{') ? (JSON.parse(line) as ChildRun['outcome']) : null,
	};
}

/**
 * The scratch host as it stands: every file's sha256 by host path, plus the
 * owners sidecar — the run's own record (plan/state/lock: timestamps) and the
 * scratch runner's files excluded.
 */
function hostState(root: string): Record<string, string> {
	const state: Record<string, string> = {};
	for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile()) continue;
		const path = join(entry.parentPath, entry.name).slice(root.length);
		if (path.startsWith(`/${SCRATCH_DIR}/`) || path.startsWith(`${RUN_DIR}/`)) continue;
		state[path] = createHash('sha256')
			.update(readFileSync(join(root, path)))
			.digest('hex');
	}
	const owners = join(root, SCRATCH_DIR, 'owners.json');
	state['<owners>'] = existsSync(owners) ? readFileSync(owners, 'utf8') : '';
	return state;
}

/** The multiset of host-changing commands, sorted. */
function changes(root: string): string[] {
	return loggedCommands(root).filter(changesHost).sort();
}

/** Run `items` with at most `limit` in flight. */
async function pool<T>(
	items: readonly T[],
	limit: number,
	work: (item: T) => Promise<void>,
): Promise<void> {
	const queue = [...items];
	const workers = Array.from({ length: limit }, async () => {
		for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
	});
	await Promise.all(workers);
}

// ── the uninterrupted reference ──────────────────────────────────────────────

const reference = {
	state: {} as Record<string, string>,
	changes: [] as string[],
	before: {} as Record<string, string>,
};

describe('the uninterrupted reference', () => {
	test('a fresh run completes (the baseline every killed run is held to)', async () => {
		const root = scratchRoot();
		reference.before = hostState(root);
		const run = await child(root, 'fresh');
		expect(run.outcome?.message ?? null).toBeNull();
		expect(run.outcome?.result).toBe('complete');
		reference.state = hostState(root);
		reference.changes = changes(root);
		expect(reference.changes.length).toBeGreaterThan(20);
		expect(Object.keys(reference.state).length).toBeGreaterThan(
			Object.keys(reference.before).length + 10,
		);
	}, 60_000);
});

// ── (a) kill + resume ────────────────────────────────────────────────────────

/** What differs between two multisets of commands (each line whose count differs). */
function countDiff(done: readonly string[], expected: readonly string[]): string[] {
	const count = (list: readonly string[], line: string) => list.filter((x) => x === line).length;
	return [...new Set([...done, ...expected])].filter(
		(line) => count(done, line) !== count(expected, line),
	);
}

/** One kill + resume: the problems found (none = converged). */
async function killThenResume(fault: string): Promise<string[]> {
	const root = scratchRoot();
	const killed = await child(root, 'fresh', fault);
	const resumed = await child(root, 'resume');
	if (resumed.outcome?.result !== 'complete') {
		return [`${fault}: resume ended ${JSON.stringify(resumed.outcome)}`];
	}
	const state = hostState(root);
	const differing = Object.keys({ ...state, ...reference.state }).filter(
		(path) => state[path] !== reference.state[path],
	);
	const commands = countDiff(changes(root), reference.changes);
	return [
		...(killed.killed
			? []
			: [`${fault}: the process was not killed (${JSON.stringify(killed.outcome)})`]),
		...(differing.length > 0 ? [`${fault}: the host differs at ${differing.join(', ')}`] : []),
		...(commands.length > 0
			? [`${fault}: the host-changing commands differ: ${commands.join(' | ')}`]
			: []),
	];
}

describe('a kill before or after ANY host step, then --resume, converges to the uninterrupted host (a)', () => {
	test(`every step × before|after (${STEPS.length * 2} killed processes)`, async () => {
		expect(STEPS.length).toBe(15);
		const failures: string[] = [];
		const faults = STEPS.flatMap((step) => [`${step}:before`, `${step}:after`]);
		await pool(faults, 6, async (fault) => {
			failures.push(...(await killThenResume(fault)));
		});
		expect(failures).toEqual([]);
	}, 240_000);
});

// ── (b) kill + abort ─────────────────────────────────────────────────────────

/** The steps after the engine (what an abort of a LIVE instance undoes). */
const AFTER_ENGINE = STEPS.slice(STEPS.indexOf('host_engine') + 1);

/** What the scratch runner's commands created (their effects — `creates` — are not undone by a logged rm). */
const COMMAND_EFFECTS =
	/^\/home\/ded_demo\/(dedalo\/|backups\/state\/LAST_OK$)|^\/etc\/letsencrypt\/live\/dedalo-demo\//;

/** A LIVE instance's abort: only the steps after the engine undone, its record and user kept. */
function liveAbortProblems(root: string, step: string, said: string): string[] {
	const undone = said === 'nothing' ? [] : said.split(', ');
	const expected = [...AFTER_ENGINE]
		.reverse()
		.filter((item) => STEPS.indexOf(item) <= STEPS.indexOf(step) && item !== 'host_public_probe');
	const log = loggedCommands(root);
	const userKept =
		log.includes(
			'/usr/sbin/useradd --system --user-group --home-dir /home/ded_demo --no-create-home --shell /usr/sbin/nologin ded_demo',
		) && !log.some((line) => line.startsWith('/usr/sbin/userdel'));
	return [
		...(JSON.stringify(undone) === JSON.stringify(expected)
			? []
			: [`${step}: undid ${undone.join(',')} — expected ${expected.join(',')}`]),
		...(existsSync(join(root, RUN_DIR, 'install.state.json'))
			? []
			: [`${step}: the live instance's record was removed`]),
		...(userKept ? [] : [`${step}: the instance user was touched`]),
	];
}

/** An abort before the engine completed: only the pre-existing host and the commands' own effects remain. */
function fullAbortProblems(root: string, step: string): string[] {
	const state = hostState(root);
	const left = Object.keys(state).filter(
		(path) =>
			path !== '<owners>' && state[path] !== reference.before[path] && !COMMAND_EFFECTS.test(path),
	);
	const gone = Object.keys(reference.before).filter(
		(path) => path !== '<owners>' && state[path] === undefined && !path.endsWith('.zip'),
	);
	return [
		...(left.length > 0 ? [`${step}: left ${left.join(', ')}`] : []),
		...(gone.length > 0 ? [`${step}: removed pre-existing ${gone.join(', ')}`] : []),
		...(existsSync(join(root, RUN_DIR, 'install.state.json'))
			? [`${step}: the record survived the abort`]
			: []),
	];
}

/** One kill after `step`, then --abort: the problems found. */
async function killThenAbort(step: string): Promise<string[]> {
	const root = scratchRoot();
	await child(root, 'fresh', `${step}:after`);
	const aborted = await child(root, 'abort');
	if (aborted.outcome?.result !== 'aborted') {
		return [`${step}: abort ended ${JSON.stringify(aborted.outcome)}`];
	}
	const decoy =
		hostState(root)[DECOY[0]] === reference.before[DECOY[0]]
			? []
			: [`${step}: the decoy site changed`];
	const live = STEPS.indexOf(step) >= STEPS.indexOf('host_engine');
	const said = (aborted.outcome.undoing ?? '').replace('→ undoing: ', '');
	return [
		...decoy,
		...(live ? liveAbortProblems(root, step, said) : fullAbortProblems(root, step)),
	];
}

describe('a kill after ANY host step, then --abort --confirm-database, leaves only what was there (b)', () => {
	test(`every step (${STEPS.length} killed processes + their aborts)`, async () => {
		expect(STEPS.length).toBe(15);
		const failures: string[] = [];
		await pool(STEPS, 6, async (step) => {
			failures.push(...(await killThenAbort(step)));
		});
		expect(failures).toEqual([]);
	}, 240_000);
});
