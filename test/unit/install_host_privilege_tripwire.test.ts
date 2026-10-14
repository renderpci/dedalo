/**
 * THE ROOT PROCESS NEVER LOADS THE ENGINE, NEVER HOLDS A SECRET IN THE OPEN, AND
 * THE ENGINE STEPS RUN AS THE INSTANCE (terminal installer phase 4, 2026-10-12;
 * src/core/install/host/, scripts/install.ts's host dispatch).
 *
 * The production route's front end runs as ROOT. If it loaded the engine's
 * configuration it would freeze it for the wrong private directory (the root
 * process's checkout, not the instance's home) and run psql as root; so it runs
 * the HOST steps only, and one host step (host_engine) starts the engine steps
 * in a CHILD, as the instance user, with the secrets on stdin.
 *
 * WHAT IS MEASURED (outcomes — a static walk misses the dynamic imports this
 * CLI depends on, so the processes are RUN and asked what they evaluated):
 *  (a) the REAL entry — `bun scripts/install.ts --answers <file> --execute
 *      --secrets-stdin`, production route, the scratch seam armed
 *      (DEDALO_INSTALL_HOST_ROOT: the recording runner and a marked scratch
 *      root) — and a child driving the WHOLE production table to `complete`
 *      over a scratch source: neither ever evaluated src/config/config.ts,
 *      src/core/install/pg_exec.ts or src/core/resolve/server_state.ts (the
 *      module registry, dumped at exit by a preload). Positive control: the
 *      same dump of a process that DOES load the config lists it.
 *  (b) NO SECRET IN THE OPEN: the root, database, publication and mail
 *      passwords are in no logged argv, no file the run wrote (plan, state,
 *      owners, rendered files), and nothing it printed.
 *  (c) THE ENGINE CHILD runs as `ded_<instance>` (runuser), in the instance's
 *      tree, with HOME the instance's — and its secrets on stdin.
 *  (d) host/** is OFF THE SERVER'S IMPORT CLOSURE (the same walker as
 *      sync_io_on_request_path_tripwire): no request can reach a module that
 *      spawns apt, useradd or systemctl.
 *
 * DB-FREE (the children connect to nothing: every command is the recording
 * runner's), network-free; the hermetic tier runs it.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ANSWERS_FILE_SCHEMA } from '../../src/core/install/install_plan.ts';
import {
	HOST_VARIANTS,
	type HostVariant,
	hostFiles,
	hostResponses,
	INSTANCE,
	loggedCommands,
	loggedRequests,
	productionRaw,
	REPO_ROOT,
	ROOT_PASSWORD,
	SCRATCH_DIR,
	scratchFilePaths,
	sourceFiles,
} from '../helpers/install_host_scratch.ts';
import { reachableModules } from '../helpers/request_path_closure.ts';

const scratchBase = mkdtempSync(join(tmpdir(), 'dedalo_install_host_privilege_'));
afterAll(() => rmSync(scratchBase, { recursive: true, force: true }));

/** The modules the root process must never evaluate. */
const FORBIDDEN = [
	'src/config/config.ts',
	'src/core/install/pg_exec.ts',
	'src/core/resolve/server_state.ts',
] as const;

/** The secrets of the run (each distinct, each greppable). */
const SECRETS = Object.freeze({
	root_password: ROOT_PASSWORD,
	db_password: 'Zz-Db-Secret-61x',
	mysql_password: 'Zz-Mysql-Secret-72y',
	smtp_pass: 'Zz-Smtp-Secret-83z',
});

/** With publication and mail on (their passwords are secrets the run is handed). */
const SERVICES = {
	diffusion: true,
	mysql_hostname: 'mariadb.example.org',
	mysql_port: '3306',
	mysql_username: 'web_demo',
	mailer: true,
	smtp_host: 'smtp.example.org',
	smtp_port: '587',
	smtp_secure: 'tls',
	smtp_user: 'mailer@example.org',
	smtp_from: 'noreply@example.org',
};

const VARIANT = HOST_VARIANTS[0] as HostVariant;

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

let counter = 0;

/** A planted scratch host + a scratch source; answers their paths. */
function scratchHost(): { root: string; source: string; base: string } {
	counter += 1;
	const base = join(scratchBase, `h${counter}`);
	const root = join(base, 'root');
	const source = join(base, 'source');
	plant(root, hostFiles(VARIANT));
	plant(source, sourceFiles());
	mkdirSync(join(root, SCRATCH_DIR), { recursive: true });
	writeFileSync(join(root, SCRATCH_DIR, 'responses.json'), JSON.stringify(hostResponses(VARIANT)));
	return { root, source, base };
}

/** The preload that dumps the module registry at exit (what the process EVALUATED). */
function writeDumpPreload(base: string): string {
	const preload = join(base, 'dump_modules.ts');
	writeFileSync(
		preload,
		[
			"import { writeFileSync } from 'node:fs';",
			"process.on('exit', () => {",
			'\twriteFileSync(process.env.DUMP_MODULES_TO as string, JSON.stringify(Object.keys(require.cache)));',
			'});',
			'',
		].join('\n'),
	);
	return preload;
}

/** Run `argv` (after `bun --preload <dump>`) with the scratch seam armed; answers what it evaluated and printed. */
async function runDumped(
	base: string,
	argv: string[],
	env: Record<string, string>,
	stdin: string,
): Promise<{ exitCode: number; out: string; modules: string[] }> {
	const dump = join(base, `modules_${counter}_${argv.length}.json`);
	const child = Bun.spawn([process.execPath, '--preload', writeDumpPreload(base), ...argv], {
		cwd: REPO_ROOT,
		env: { ...process.env, ...env, DUMP_MODULES_TO: dump } as Record<string, string>,
		stdin: new TextEncoder().encode(stdin),
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	const modules = (JSON.parse(readFileSync(dump, 'utf8')) as string[])
		.filter((path) => path.startsWith(REPO_ROOT))
		.map((path) => path.slice(REPO_ROOT.length + 1));
	return { exitCode, out: `${stdout}\n${stderr}`, modules };
}

/** Every text file under `dir` that holds `needle`. */
function filesHolding(dir: string, needle: string): string[] {
	return scratchFilePaths(dir).filter((path) => readFileSync(path, 'utf8').includes(needle));
}

/** Every secret value found in the log, the files under `root` and the output. */
function leaks(root: string, out: string): string[] {
	return Object.entries(SECRETS).flatMap(([key, value]) => [
		...loggedCommands(root)
			.filter((line) => line.includes(value))
			.map((line) => `${key} in argv: ${line}`),
		...filesHolding(root, value).map((path) => `${key} in ${path}`),
		...(out.includes(value) ? [`${key} in the output`] : []),
	]);
}

// ── (a)+(b) the real entry ───────────────────────────────────────────────────

describe('the production root process loads no engine module and leaks no secret (a, b)', () => {
	test('scripts/install.ts --answers --execute (the scratch seam armed): config, pg_exec, server_state never evaluated', async () => {
		const host = scratchHost();
		const answers = join(host.base, 'answers.json');
		writeFileSync(
			answers,
			JSON.stringify({
				schema: ANSWERS_FILE_SCHEMA,
				answers: { ...productionRaw(VARIANT), ...SERVICES },
			}),
		);
		const run = await runDumped(
			host.base,
			['scripts/install.ts', '--answers', answers, '--execute', '--secrets-stdin'],
			{ DEDALO_INSTALL_HOST_ROOT: host.root },
			JSON.stringify(SECRETS),
		);
		// It RAN host steps (the anti-vacuity): the preflight measured, the packages went
		// in, the user was created — then the runtime step refused this checkout's Bun
		// table for the scratch host's fake zip (the real table vouches for real Bun).
		const log = loggedCommands(host.root);
		expect(log.some((line) => line.startsWith('/usr/bin/apt-get install'))).toBe(true);
		expect(log.some((line) => line.startsWith('/usr/sbin/useradd'))).toBe(true);
		expect(run.out).toContain('does not match .bun-sha256');
		expect(run.exitCode).not.toBe(0);
		expect(run.modules.length).toBeGreaterThan(50);
		expect(run.modules).toContain('src/core/install/host/host_executor.ts');
		expect(FORBIDDEN.filter((module) => run.modules.includes(module))).toEqual([]);
		expect(leaks(host.root, run.out)).toEqual([]);
	});

	test('the whole production table, run to `complete` in a child: config, pg_exec, server_state never evaluated; no secret anywhere', async () => {
		const host = scratchHost();
		const driver = join(host.base, 'drive.ts');
		writeFileSync(
			driver,
			[
				`import { buildInstallPlan } from ${JSON.stringify(join(REPO_ROOT, 'src/core/install/install_plan.ts'))};`,
				`import { buildPlanFile } from ${JSON.stringify(join(REPO_ROOT, 'src/core/install/run_files_core.ts'))};`,
				`import { executeHostInstall } from ${JSON.stringify(join(REPO_ROOT, 'src/core/install/host/host_executor.ts'))};`,
				'const secrets = JSON.parse(await Bun.stdin.text());',
				`const plan = buildInstallPlan(${JSON.stringify({ ...productionRaw(VARIANT), ...SERVICES })}, { rootPassword: secrets.root_password, requireRootPassword: true });`,
				'if (plan.errors.length > 0) { console.log(plan.errors.join("; ")); process.exit(2); }',
				'const outcome = await executeHostInstall(',
				"\t{ mode: 'fresh', execute: true, planFile: buildPlanFile(plan, secrets), secrets },",
				'\t{ log: (line) => console.log(line), warn: (line) => console.log(line), showOnce: () => true },',
				`\t{ source: ${JSON.stringify(host.source)}, skipPrivilegeCheck: true, sleep: async () => {} },`,
				');',
				'console.log(`RESULT ${outcome.result} ${outcome.message ?? ""}`);',
				'',
			].join('\n'),
		);
		const run = await runDumped(
			host.base,
			[driver],
			{ DEDALO_INSTALL_HOST_ROOT: host.root },
			JSON.stringify(SECRETS),
		);
		expect(run.out).toContain('RESULT complete');
		expect(run.exitCode).toBe(0);
		expect(run.modules).toContain('src/core/install/host/production/engine_delegate.ts');
		expect(FORBIDDEN.filter((module) => run.modules.includes(module))).toEqual([]);
		expect(leaks(host.root, run.out)).toEqual([]);
		// (c) the engine child: as the instance, in its tree, its HOME, secrets on stdin.
		const child = loggedRequests(host.root).find((entry) => entry.argv.includes('--request-stdin'));
		// It dies with the installer (C3-29): the death prefix outside and inside runuser.
		const death = ['/usr/bin/setpriv', '--pdeathsig', 'KILL', '--'];
		expect(child?.argv.slice(0, 14)).toEqual([
			...death,
			'/usr/sbin/runuser',
			'-u',
			`ded_${INSTANCE}`,
			'-g',
			`ded_${INSTANCE}`,
			'--',
			...death,
		]);
		expect(child?.cwd).toBe(`/home/ded_${INSTANCE}/dedalo`);
		expect(child?.env.HOME).toBe(`/home/ded_${INSTANCE}`);
		// runuser RESETS HOME to the account's home: the instance's HOME rides argv
		// too, or an existing hosting account's home collects Bun's caches.
		expect(child?.argv.slice(14, 16)).toEqual(['/usr/bin/env', `HOME=/home/ded_${INSTANCE}`]);
		expect(child?.stdin).toBe(true);
	});

	test('positive control: a process that DOES load the configuration shows it in the same dump', async () => {
		const host = scratchHost();
		const driver = join(host.base, 'loads_config.ts');
		writeFileSync(
			driver,
			`await import(${JSON.stringify(join(REPO_ROOT, 'src/config/config.ts'))});\n`,
		);
		const run = await runDumped(host.base, [driver], {}, '');
		expect(run.modules).toContain('src/config/config.ts');
	});
});

// ── (d) off the server's closure ─────────────────────────────────────────────

describe('host/** is off the server import closure (d)', () => {
	test('no module under src/core/install/host/ is reachable from the server or the dispatcher', () => {
		const reachable = reachableModules().map((file) => file.slice(REPO_ROOT.length + 1));
		// The walker is real: large, and it reaches into src/core/install (Maintenance ›
		// Import hierarchies — the wizard router that once reached the plan is gone).
		expect(reachable.length).toBeGreaterThan(500);
		expect(reachable).toContain('src/core/install/hierarchy_import.ts');
		expect(reachable.filter((file) => file.startsWith('src/core/install/host/'))).toEqual([]);
		expect(reachable).not.toContain('scripts/ops/boot_status.ts');
	});

	test('positive control: the walker DOES reach host/** from the CLI that runs it', () => {
		const fromCli = reachableModules(true, ['scripts/install.ts']).map((file) =>
			file.slice(REPO_ROOT.length + 1),
		);
		expect(fromCli).toContain('src/core/install/host/host_executor.ts');
	});
});
