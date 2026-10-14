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
 *  (b) ABORT AFTER ANY STEP leaves only what was there before: until the
 *      instance could have served (host_first_boot started — campaign 3
 *      C3-11; a completed engine install included, its child's own --abort
 *      attested unserved), every file this install wrote is gone (what
 *      remains is the pre-existing host, byte-equal, and what the scratch
 *      runner's COMMANDS left — their removal is a logged command, not a file
 *      effect) and the record is removed; from then on the instance is KEPT
 *      and only the host steps after the engine were undone.
 *
 *  (c) CUSTOM LAYOUTS (owner decisions 2026-10-12): a new account with a
 *      typed group, and an existing hosting account whose primary group is
 *      named apart from it — a kill around host_identity / host_runtime / the
 *      engine, then --resume, converges to that layout's uninterrupted host
 *      (the frozen digest holds the RESOLVED group — critique B2).
 *
 * DB-FREE, network-free (the hermetic tier runs it); ~70 short child processes.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
	plantOwned,
	productionRaw,
	REPO_ROOT,
	ROOT_PASSWORD,
	SCRATCH_DIR,
	type ScratchIdentity,
	scratchFilePaths,
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

/** A child driver: one executor run of `raw`'s plan through the scratch seam. */
function writeDriver(name: string, raw: Record<string, unknown>): string {
	const path = join(scratchBase, name);
	writeFileSync(
		path,
		[
			`import { buildInstallPlan } from ${JSON.stringify(join(REPO_ROOT, 'src/core/install/install_plan.ts'))};`,
			`import { buildPlanFile } from ${JSON.stringify(join(REPO_ROOT, 'src/core/install/run_files_core.ts'))};`,
			`import { executeHostInstall } from ${JSON.stringify(join(REPO_ROOT, 'src/core/install/host/host_executor.ts'))};`,
			'const mode = process.argv[2];',
			`const secrets = { root_password: ${JSON.stringify(ROOT_PASSWORD)} };`,
			`const plan = buildInstallPlan(${JSON.stringify(raw)}, { rootPassword: secrets.root_password, requireRootPassword: true });`,
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
	return path;
}

/** The child of the default layout. */
const DRIVER = writeDriver('drive.ts', productionRaw(VARIANT));

let counter = 0;

/** A planted scratch host (the decoy included; `layout`: a custom account's world); answers its root. */
function scratchRoot(layout: Layout | null = null): string {
	counter += 1;
	const root = join(scratchBase, `r${counter}`);
	plant(root, hostFiles(VARIANT));
	plant(root, new Map([DECOY]));
	for (const [path, owned] of layout?.owned ?? []) plantOwned(root, path, owned);
	mkdirSync(join(root, SCRATCH_DIR), { recursive: true });
	writeFileSync(
		join(root, SCRATCH_DIR, 'responses.json'),
		JSON.stringify(hostResponses(VARIANT, layout?.identity)),
	);
	return root;
}

/** A custom install folder / service account (owner decisions 2026-10-12). */
interface Layout {
	name: string;
	identity: ScratchIdentity;
	extra: Record<string, unknown>;
	owned: readonly [string, { owner: string; group: string; mode: number; content?: string }][];
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
	driver: string = DRIVER,
): Promise<ChildRun> {
	const { DEDALO_INSTALL_FAULT: _inherited, ...inherited } = process.env;
	const env: Record<string, string | undefined> = {
		...inherited,
		DEDALO_INSTALL_HOST_ROOT: root,
		...(fault === undefined ? {} : { DEDALO_INSTALL_FAULT: fault }),
	};
	const proc = Bun.spawn([process.execPath, driver, mode], {
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
	for (const full of scratchFilePaths(root)) {
		const path = full.slice(root.length);
		if (path.startsWith(`/${SCRATCH_DIR}/`) || path.startsWith(`${RUN_DIR}/`)) continue;
		// Bytes, not text: the fake Bun zip is binary.
		state[path] = createHash('sha256').update(readFileSync(full)).digest('hex');
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
		const after = hostState(root);
		reference.state = after;
		reference.changes = changes(root);
		expect(reference.changes.length).toBeGreaterThan(20);
		// The walk's floor: the run planted more than ten host files the fresh scratch lacked.
		const grown = Object.keys(after).length - Object.keys(reference.before).length;
		expect(grown).toBeGreaterThan(10);
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
	// LIVE once the instance has served: its unit ran (host_first_boot — C3-11, measured
	// since campaign 3c D1) — a kill after the engine but before the first start is a full
	// abort (the child's own --abort, attested unserved).
	const live = STEPS.indexOf(step) >= STEPS.indexOf('host_first_boot');
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

describe('a kill INSIDE host_first_boot before its start is not a served instance (campaign 3b N9)', () => {
	test('killed after the step started but before `systemctl start`: --abort removes the instance whole', async () => {
		const root = scratchRoot();
		const killed = await child(root, 'fresh', 'host_first_boot:before');
		expect(killed.killed).toBe(true);
		const log = loggedCommands(root);
		expect(log.some((line) => line.includes('systemctl start dedalo-ts@'))).toBe(false);
		const aborted = await child(root, 'abort');
		expect(aborted.outcome?.result).toBe('aborted');
		// never "the instance has served": the full undo, the engine install included
		expect(aborted.outcome?.undoing ?? '').toContain('host_engine');
		expect(fullAbortProblems(root, 'host_first_boot:before')).toEqual([]);
	}, 60_000);
});

// ── (c) custom layouts: the resolved group survives a kill ───────────────────

/**
 * Two custom layouts (owner decisions 2026-10-12) whose service GROUP is
 * decided by the host facts host_preflight froze: a new account with a typed
 * group of its own, and an existing hosting account whose primary group is
 * named apart from it. A kill around host_identity / host_runtime / the engine,
 * then --resume, converges to the layout's own uninterrupted host — a digest
 * frozen without the resolved group would refuse every resume (critique B2).
 */
const HOSTING_HOME = '/home/drill.example.org';
const LAYOUTS: readonly Layout[] = [
	{
		name: 'a new account, a typed group of its own',
		identity: {
			user: 'site_a',
			group: 'webgrp',
			dir: '/srv/apps/a/dedalo',
			uid: 998,
			gid: 997,
			shell: '/usr/sbin/nologin',
			existing: false,
		},
		extra: { install_dir: '/srv/apps/a/dedalo', service_user: 'site_a', service_group: 'webgrp' },
		owned: [],
	},
	{
		name: 'an existing hosting account, its primary group named apart',
		identity: {
			user: 'drill.example.org',
			group: 'psacln',
			dir: `${HOSTING_HOME}/dedalo`,
			home: HOSTING_HOME,
			uid: 1500,
			gid: 1501,
			shell: '/bin/bash',
			existing: true,
		},
		extra: { install_dir: `${HOSTING_HOME}/dedalo`, service_user: 'drill.example.org' },
		owned: [
			[HOSTING_HOME, { owner: 'drill.example.org', group: 'psacln', mode: 0o750 }],
			[
				`${HOSTING_HOME}/notes.txt`,
				{ owner: 'drill.example.org', group: 'psacln', mode: 0o600, content: 'own notes\n' },
			],
		],
	},
];

const LAYOUT_FAULTS = [
	'host_identity:before',
	'host_identity:after',
	'host_runtime:after',
	'host_engine:after',
];

describe('custom layouts: a kill, then --resume, converges to the layout’s uninterrupted host (c)', () => {
	for (const [index, layout] of LAYOUTS.entries()) {
		test(`${layout.name}: ${LAYOUT_FAULTS.length} killed processes`, async () => {
			const driver = writeDriver(`drive_layout_${index}.ts`, productionRaw(VARIANT, layout.extra));
			const reference = scratchRoot(layout);
			const fresh = await child(reference, 'fresh', undefined, driver);
			expect(fresh.outcome?.message ?? null).toBeNull();
			expect(fresh.outcome?.result).toBe('complete');
			const expected = hostState(reference);
			const expectedChanges = changes(reference);
			expect(
				expectedChanges.some((line) => line.includes(` -g ${layout.identity.group} -- `)),
			).toBe(true);
			const failures: string[] = [];
			await pool(LAYOUT_FAULTS, 4, async (fault) => {
				const root = scratchRoot(layout);
				const killed = await child(root, 'fresh', fault, driver);
				const resumed = await child(root, 'resume', undefined, driver);
				if (!killed.killed) failures.push(`${fault}: not killed`);
				if (resumed.outcome?.result !== 'complete') {
					failures.push(`${fault}: resume ended ${JSON.stringify(resumed.outcome)}`);
					return;
				}
				const state = hostState(root);
				const differing = Object.keys({ ...state, ...expected }).filter(
					(path) => state[path] !== expected[path],
				);
				if (differing.length > 0)
					failures.push(`${fault}: the host differs at ${differing.join(', ')}`);
				const commands = countDiff(changes(root), expectedChanges);
				if (commands.length > 0)
					failures.push(`${fault}: commands differ: ${commands.join(' | ')}`);
			});
			expect(failures).toEqual([]);
		}, 120_000);
	}
});
