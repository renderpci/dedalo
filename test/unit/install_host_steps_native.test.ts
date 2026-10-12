/**
 * THE PRODUCTION HOST STEPS, RUN END TO END ON A SCRATCH HOST (terminal
 * installer phase 4, 2026-10-12; src/core/install/host/ — the production table
 * host_table.ts, the executor host_executor.ts over the ONE step loop).
 *
 * Every host step runs for real — the executor, the step loop, the state file,
 * every step's run/verify/undo — against a SCRATCH ROOT (host/fs.ts under a
 * marked mkdtemp dir) with the RECORDING RUNNER (host/runner.ts: nothing is
 * executed; each argv is logged and answered from the scratch host's response
 * table, test/helpers/install_host_scratch.ts). Nothing touches this machine:
 * no package manager, systemctl, useradd, certbot or web-server reload runs.
 *
 * WHAT IS MEASURED (outcomes, never spellings), for EVERY supported OS row ×
 * nginx|apache × Let's Encrypt|the institution's files:
 *  (a) REVIEW EQUALS RUN: every command the run executed that CHANGES the host
 *      is one the Review listed (the run's own frozen plan context through
 *      hostReview), in the Review's order — a listed command is absent only
 *      when its `unless` probe said it was already done (or the web user was
 *      already in the instance group); every other logged command is a
 *      read-only probe. And the Review the operator SAW before the run
 *      (reviewHostCommands, through the scratch seam) is the run's list.
 *  (b) WHAT LANDED: every file the Review writes holds its rendered bytes at
 *      its mode and owner, every directory its mode and owner (the owners
 *      sidecar of the scratch root).
 *  (c) IDEMPOTENT: a second run of a complete install runs no command that
 *      changes the host (only verifies) and answers `already_complete`.
 *  (d) NO SECRET LEAVES: the root password is in no logged argv, no file under
 *      the scratch root and no transcript line; the engine child received it
 *      on stdin (the log records only that there WAS a stdin).
 *  (e) ABORT UNDOES ONLY WHAT THIS INSTALL CREATED: pre-existing decoys (another
 *      site's file, another instance's registry entry, the shared templates and
 *      Bun it uses) survive byte-equal; a COMPLETE install is never taken apart
 *      (only the host steps after the engine are undone); a failed one drops
 *      its database only with --confirm-database, removes the user and the
 *      directories it created, and TELLS the packages it kept.
 *  (f) REFUSALS, each with its sentence, before anything changes: an
 *      unsupported OS (the sentence lists the supported rows), no root (the
 *      sudo command), nginx older than 1.25.1, an Apache module missing (the
 *      enabling command TOLD — the run stops, a resume continues once it is
 *      enabled), every name clash (user, database, role, unit, drop-ins, site
 *      file, socket, the address served by another site, a port held, another
 *      PostgreSQL major on the port), a foreign template unit, and the
 *      institution's certificate expired, for another address or with another key.
 *
 * DB-FREE and network-free (the hermetic tier runs it): the certificate is
 * minted in memory by the openssl CLI (absent = RED, never a skip).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { NOT_INSTALLED_EXIT_CODE } from '../../src/config/install_state.ts';
import type {
	HostCommand,
	HostPlanCtx,
	MkdirCommand,
} from '../../src/core/install/host/contract.ts';
import { effectiveArgv } from '../../src/core/install/host/execute.ts';
import { hostFs } from '../../src/core/install/host/fs.ts';
import { hostReview, hostTable } from '../../src/core/install/host/host_table.ts';
import { instancePaths } from '../../src/core/install/host/layout.ts';
import { osRowById, supportedOsList } from '../../src/core/install/host/os_support.ts';
import { REFUSED_BOOT_EXIT } from '../../src/core/install/host/production/first_boot.ts';
import { certificatePaths, siteText } from '../../src/core/install/host/production/web.ts';
import { reviewHostCommands } from '../../src/core/install/host/review.ts';
import type { RecordedResponse } from '../../src/core/install/host/runner.ts';
import { stackFileOf } from '../../src/core/install/host/stack/layout.ts';
import { renderTemplate, UNIT_TEMPLATES } from '../../src/core/install/host/systemd/render.ts';
import {
	type HostStepId,
	type InstallAnswers,
	normalizeInstallAnswers,
} from '../../src/core/install/install_plan.ts';
import { MEDIA_DIR_MODE } from '../../src/core/install/media_tree.ts';
import type { RunEnding } from '../../src/core/install/run_events.ts';
import { readPlanFile, readStateFile } from '../../src/core/install/run_files_core.ts';
import { doneSummary } from '../../src/core/install/ui/screens/done.ts';
import {
	BUN_PIN,
	CERT_PATHS,
	freshRequest,
	HOST_VARIANTS,
	type HostVariant,
	hostFiles,
	hostResponses,
	INSTANCE,
	laterRequest,
	loggedCommands,
	loggedRequests,
	mintCertificate,
	productionPlan,
	productionPlanCtx,
	READ_ONLY_PROBES,
	REPO_ROOT,
	ROOT_PASSWORD,
	runHost,
	SCRATCH_DIR,
	type ScratchHost,
	SERVER_NAME,
	scratchFilePaths,
	sourceFiles,
	UNSUPPORTED_OS_RELEASE,
	variantName,
} from '../helpers/install_host_scratch.ts';

const scratchBase = mkdtempSync(join(tmpdir(), 'dedalo_install_host_steps_'));
afterAll(() => rmSync(scratchBase, { recursive: true, force: true }));

const CERT = mintCertificate(SERVER_NAME);
const RUN_DIR = `/var/lib/dedalo-install/${INSTANCE}`;
const DB = `dedalo_${INSTANCE}`;

// ── planting (this gate writes; the helper only answers bytes) ───────────────

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

interface PlantOptions {
	/** Extra host files (decoys, a planted binary, a foreign unit…). */
	files?: ReadonlyMap<string, string>;
	/** Responses placed BEFORE the scratch host's (first match wins). */
	responses?: readonly RecordedResponse[];
	/** Replace the os-release. */
	osRelease?: string;
}

/** A planted scratch host of `variant`. */
function scratchHost(variant: HostVariant, options: PlantOptions = {}): ScratchHost {
	counter += 1;
	const base = join(scratchBase, `h${counter}`);
	const root = join(base, 'root');
	const source = join(base, 'source');
	plant(root, hostFiles(variant, CERT));
	plant(source, sourceFiles());
	if (options.osRelease !== undefined)
		plant(root, new Map([['/etc/os-release', options.osRelease]]));
	plant(root, options.files ?? new Map());
	mkdirSync(join(root, SCRATCH_DIR), { recursive: true });
	writeFileSync(
		join(root, SCRATCH_DIR, 'responses.json'),
		JSON.stringify([...(options.responses ?? []), ...hostResponses(variant)]),
	);
	return { root, source };
}

/** Replace the responses of a planted host (an operator fixed something between runs). */
function replaceResponses(
	host: ScratchHost,
	variant: HostVariant,
	first: readonly RecordedResponse[],
): void {
	writeFileSync(
		join(host.root, SCRATCH_DIR, 'responses.json'),
		JSON.stringify([...first, ...hostResponses(variant)]),
	);
}

// ── the run's own Review (its frozen plan context) ───────────────────────────

/** The plan context the run froze (the plan file + the preflight's facts). */
function frozenContext(host: ScratchHost): HostPlanCtx {
	const dir = join(host.root, RUN_DIR);
	const plan = readPlanFile(dir);
	const state = readStateFile(dir);
	const facts = state?.preflight.host?.facts;
	if (plan === null || facts === undefined || facts.os === null) throw new Error('no frozen run');
	const answers = normalizeInstallAnswers(plan.answers as Record<string, unknown>).answers;
	return {
		plan,
		answers,
		facts,
		row: osRowById(facts.os),
		paths: instancePaths(answers, BUN_PIN),
		source: host.source,
	};
}

/** Every host command of the plan, per step (the Review's list, as objects). */
function reviewCommands(ctx: HostPlanCtx): { step: HostStepId; command: HostCommand }[] {
	const table = hostTable(() => ctx);
	return (ctx.plan.steps as HostStepId[]).flatMap((step) =>
		table[step].commands(ctx).map((command) => ({ step, command })),
	);
}

/** An exec command as the runner logs it. */
function logged(ctx: HostPlanCtx, command: HostCommand & { kind: 'exec' }): string {
	return effectiveArgv(command, ctx.row, ctx.paths.user).join(' ');
}

/** The commands a run may log without the Review listing them: READ-ONLY probes only. */
const READ_ONLY = READ_ONLY_PROBES;

/** The Review's mutating execs, in order, with what may excuse their absence from a run. */
function mutatingReview(ctx: HostPlanCtx): { line: string; skippable: boolean }[] {
	return reviewCommands(ctx)
		.map(({ command }) => command)
		.filter((command): command is HostCommand & { kind: 'exec' } => command.kind === 'exec')
		.filter((command) => command.mutates)
		.map((command) => ({
			line: logged(ctx, command),
			// An `unless` probe said "already done"; the web user already in the group.
			skippable: command.unless !== undefined || command.argv.includes('-aG'),
		}));
}

/** Walk the Review's mutating list against the run's mutating log: in order, nothing extra. */
function reviewEqualsRun(ctx: HostPlanCtx, log: readonly string[]): string[] {
	const review = mutatingReview(ctx);
	const reviewed = new Set(review.map((item) => item.line));
	const problems = log
		.filter((line) => !reviewed.has(line) && !READ_ONLY.some((pattern) => pattern.test(line)))
		.map((line) => `not on the Review, not a read-only probe: ${line}`);
	const ran = log.filter((line) => reviewed.has(line));
	let at = 0;
	for (const item of review) {
		if (ran[at] === item.line) at += 1;
		else if (!item.skippable) problems.push(`on the Review, not run (in order): ${item.line}`);
	}
	if (at < ran.length) problems.push(`run out of the Review's order: ${ran.slice(at).join(' | ')}`);
	return problems;
}

/** Every file and directory the Review writes, at its last write's bytes, mode and owner. */
function landedProblems(host: ScratchHost, ctx: HostPlanCtx): string[] {
	const fs = hostFs(host.root, join(host.root, SCRATCH_DIR, 'owners.json'));
	const last = new Map<string, HostCommand>();
	for (const { command } of reviewCommands(ctx)) {
		if (command.kind === 'write' || command.kind === 'mkdir') last.set(command.path, command);
	}
	const problems: string[] = [];
	for (const [path, command] of last) {
		const stat = fs.stat(path);
		if (command.kind === 'write' && fs.readText(path) !== command.content)
			problems.push(`${path}: not its render`);
		if (command.kind !== 'write' && command.kind !== 'mkdir') continue;
		if (stat?.mode !== command.mode)
			problems.push(`${path}: mode ${stat?.mode.toString(8)}, not ${command.mode.toString(8)}`);
		if (stat?.owner !== command.owner || stat.group !== command.group)
			problems.push(
				`${path}: owner ${stat?.owner}:${stat?.group}, not ${command.owner}:${command.group}`,
			);
	}
	return problems;
}

/** Every file under `dir` (recursive), as text. */
function allFiles(dir: string): { path: string; text: string }[] {
	return scratchFilePaths(dir).map((path) => ({ path, text: readFileSync(path, 'utf8') }));
}

/** Mutating log lines (anything that is not a read-only probe). */
function mutatingLog(log: readonly string[]): string[] {
	return log.filter((line) => !READ_ONLY.some((pattern) => pattern.test(line)));
}

// ── (a)–(d) every variant ────────────────────────────────────────────────────

describe('every production variant runs end to end: Review ≡ run, files landed, idempotent, no secret (a–d)', () => {
	test('the matrix is every supported row × nginx|apache × letsencrypt|files', () => {
		expect(HOST_VARIANTS.length).toBe(12);
		expect(new Set(HOST_VARIANTS.map((variant) => variant.os))).toEqual(
			new Set(['ubuntu2604', 'debian13', 'el10']),
		);
	});

	for (const variant of HOST_VARIANTS) {
		test(variantName(variant), async () => {
			const host = scratchHost(variant);
			const { plan, planFile } = productionPlan(variant);
			const first = await runHost(host, freshRequest(planFile));
			expect(first.outcome.message).toBeNull();
			expect(first.outcome.result).toBe('complete');
			const ctx = frozenContext(host);
			const log = loggedCommands(host.root);
			// (a) Review equals run.
			expect(reviewEqualsRun(ctx, log)).toEqual([]);
			expect(mutatingReview(ctx).length).toBeGreaterThan(20);
			// (b) what landed.
			expect(landedProblems(host, ctx)).toEqual([]);
			// The firewall is told, never changed.
			expect(
				first.outcome.told.some((line) => line.startsWith('firewall (checked, not changed)')),
			).toBe(true);
			expect(
				log.some((line) => /firewall-cmd --(add|remove)|ufw (allow|deny|enable)/.test(line)),
			).toBe(false);
			// (d) no secret: argv, files, transcript; the engine child got it on stdin.
			const leaks = [
				...log.filter((line) => line.includes(ROOT_PASSWORD)),
				...allFiles(host.root)
					.filter((file) => file.text.includes(ROOT_PASSWORD))
					.map((file) => file.path),
				...first.transcript.lines.filter((line) => line.includes(ROOT_PASSWORD)),
			];
			expect(leaks).toEqual([]);
			const child = loggedRequests(host.root).find((entry) =>
				entry.argv.includes('--request-stdin'),
			);
			expect(child?.stdin).toBe(true);
			expect(child?.argv.slice(0, 4)).toEqual(['/usr/sbin/runuser', '-u', `ded_${INSTANCE}`, '--']);
			// The salt went to the one-time display, never to the transcript.
			expect(first.transcript.shown.join('\n')).toContain('scratch-salt-value');
			expect(first.transcript.lines.join('\n')).not.toContain('scratch-salt-value');
			// (c) idempotent.
			const second = await runHost(host, laterRequest('resume', plan));
			expect(second.outcome.result).toBe('already_complete');
			expect(mutatingLog(loggedCommands(host.root).slice(log.length))).toEqual([]);
		});
	}
});

// ── (a) the Review the operator saw ─────────────────────────────────────────

describe('the Review shown before the run lists the commands the run executes (a)', () => {
	for (const variant of [HOST_VARIANTS[0], HOST_VARIANTS.at(-1)] as HostVariant[]) {
		test(`${variantName(variant)}: reviewHostCommands (before) ≡ the run's frozen list (after)`, async () => {
			const host = scratchHost(variant);
			// The Review reads this checkout (a git one): so does the run here.
			mkdirSync(join(host.source, '.git'));
			const { plan, planFile } = productionPlan(variant);
			const previous = process.env.DEDALO_INSTALL_HOST_ROOT;
			process.env.DEDALO_INSTALL_HOST_ROOT = host.root;
			let shown: Awaited<ReturnType<typeof reviewHostCommands>>;
			try {
				shown = await reviewHostCommands(plan);
			} finally {
				if (previous === undefined) delete process.env.DEDALO_INSTALL_HOST_ROOT;
				else process.env.DEDALO_INSTALL_HOST_ROOT = previous;
			}
			// The Review's own probes are read-only.
			expect(mutatingLog(loggedCommands(host.root))).toEqual([]);
			const before = loggedCommands(host.root).length;
			expect((await runHost(host, freshRequest(planFile))).outcome.result).toBe('complete');
			expect(loggedCommands(host.root).length).toBeGreaterThan(before);
			// The exact TEXT: every Review line equals the run's — the checkout the Review
			// read its templates from (this repo) and the run's (the scratch source) aside.
			const normalize = (line: string) =>
				line.split(host.source).join('<source>').split(REPO_ROOT).join('<source>');
			const run = hostReview(frozenContext(host));
			expect(run.map((block) => block.step)).toEqual(shown.map((block) => block.step));
			for (const block of shown) {
				const ran = run.find((item) => item.step === block.step)?.commands ?? [];
				expect(ran.map(normalize), block.step).toEqual(block.commands.map(normalize));
			}
		});
	}
});

// ── (e) abort ────────────────────────────────────────────────────────────────

const UBUNTU_NGINX_LE = HOST_VARIANTS[0] as HostVariant;
const DEBIAN_APACHE_LE = HOST_VARIANTS.find(
	(variant) =>
		variant.os === 'debian13' && variant.web === 'apache' && variant.tls === 'letsencrypt',
) as HostVariant;

/** Another instance on the same host, and another site: what an abort must never touch. */
function decoys(variant: HostVariant): Map<string, string> {
	const row = osRowById(variant.os);
	const files = new Map<string, string>([
		[
			'/etc/nginx/conf.d/museum-shop.conf',
			'server {\n\tlisten 443 ssl;\n\tserver_name shop.example.org;\n}\n',
		],
		[
			'/var/lib/dedalo-install/instances/other.json',
			`${JSON.stringify({ instance: 'other', bun_pin: BUN_PIN, templates: true, selinux_module: false, nginx_map_owner: false, media: '/srv/dedalo/other/dedalo/media' }, null, '\t')}\n`,
		],
		[`/opt/dedalo/bun/${BUN_PIN}/bun`, 'the runtime instance other runs\n'],
		['/srv/dedalo/other/dedalo/media/image/original/x_test3_1.jpg', 'a heritage image\n'],
	]);
	// The shared templates other already installed: byte-equal to this release's.
	for (const name of UNIT_TEMPLATES)
		files.set(`/etc/systemd/system/${name}`, renderTemplate(name, row, REPO_ROOT));
	return files;
}

/** Each decoy still holds its bytes. */
function decoysIntact(host: ScratchHost, files: ReadonlyMap<string, string>): string[] {
	return [...files]
		.filter(([path, text]) => {
			try {
				return readFileSync(join(host.root, path), 'utf8') !== text;
			} catch {
				return true;
			}
		})
		.map(([path]) => path);
}

/** The logged runs of `argv` that were fed a stdin (psql's CREATE/DROP travel there). */
function stdinRuns(host: ScratchHost, argv: string): number {
	return loggedRequests(host.root).filter((entry) => entry.stdin && entry.argv.join(' ') === argv)
		.length;
}

describe('abort undoes only what this install created (e)', () => {
	test('a COMPLETE install: only the host steps after the engine are undone; the instance and every decoy survive', async () => {
		const files = decoys(UBUNTU_NGINX_LE);
		const host = scratchHost(UBUNTU_NGINX_LE, { files });
		const { plan, planFile } = productionPlan(UBUNTU_NGINX_LE);
		expect((await runHost(host, freshRequest(planFile))).outcome.result).toBe('complete');
		const site = join(host.root, `/etc/nginx/conf.d/dedalo-${INSTANCE}.conf`);
		expect(statSync(site).isFile()).toBe(true);
		const before = loggedCommands(host.root).length;
		const abort = await runHost(host, laterRequest('abort', plan));
		expect(abort.outcome.result).toBe('aborted');
		expect(abort.outcome.keptLive).toBe(true);
		const undoing = abort.transcript.lines.find((line) => line.startsWith('→ undoing:')) ?? '';
		expect(undoing.replace('→ undoing: ', '').split(', ')).toEqual([
			'host_backup_verify',
			'host_web_site',
			'host_tls',
			'host_web_http',
			'host_watchdog',
			'host_first_boot',
			'host_selinux',
			'host_units',
		]);
		const undone = loggedCommands(host.root).slice(before);
		// The instance stays: no user removed, no engine abort, the database untouched.
		expect(undone.filter((line) => /userdel|groupdel|--abort/.test(line))).toEqual([]);
		expect(decoysIntact(host, files)).toEqual([]);
		// What it created after the engine is gone: our site file and drop-ins.
		expect(() => statSync(site)).toThrow();
		expect(() =>
			statSync(
				join(
					host.root,
					`/etc/systemd/system/dedalo-ts@${INSTANCE}.service.d/10-dedalo-install.conf`,
				),
			),
		).toThrow();
		// The record stays (a --resume puts the undone steps back).
		expect(readStateFile(join(host.root, RUN_DIR))?.outcome).toBe('in_progress');
	});

	test('a FAILED install: no database dropped without --confirm-database; with it, the database, the user and the empty directories go, the packages are told kept', async () => {
		const files = decoys(UBUNTU_NGINX_LE);
		const pg = osRowById('ubuntu2604').pgBinDir;
		const bun = `/opt/dedalo/bun/${BUN_PIN}/bun`;
		const child = `/usr/sbin/runuser -u ded_${INSTANCE} -- ${bun} run /home/ded_${INSTANCE}/dedalo/scripts/install.ts`;
		const host = scratchHost(UBUNTU_NGINX_LE, {
			files,
			responses: [
				{ match: `${child} --request-stdin`, exit: 9, stderr: 'the seed restore failed' },
				{
					match: `${child} --status --json`,
					after: `${child} --request-stdin`,
					until: `${child} --abort`,
					stdout:
						'{"exists":true,"outcome":"in_progress","failed_step":"install_db_from_default_file"}\n',
				},
			],
		});
		const { plan, planFile } = productionPlan(UBUNTU_NGINX_LE);
		const fresh = await runHost(host, freshRequest(planFile));
		expect(fresh.outcome.result).toBe('failed');
		expect(fresh.outcome.failedStep).toBe('host_engine');
		const psql = `/usr/sbin/runuser -u postgres -- ${pg}/psql -X -q -A -t -v ON_ERROR_STOP=1 -h /var/run/postgresql -p 5432 -d postgres`;
		expect(stdinRuns(host, psql)).toBe(2); // CREATE ROLE, CREATE DATABASE
		// Without the database name typed back: refused, nothing dropped.
		const beforeRefusal = loggedCommands(host.root).length;
		const refused = await runHost(host, laterRequest('abort', plan));
		expect(refused.outcome.result).not.toBe('aborted');
		expect(refused.outcome.message).toContain(`--confirm-database ${DB}`);
		expect(stdinRuns(host, psql)).toBe(2);
		// Checked BEFORE anything is undone: no engine --abort (it would reset the database on
		// the operator's behalf), no user removed, no step undone — the install is whole.
		const duringRefusal = loggedCommands(host.root).slice(beforeRefusal);
		expect(duringRefusal.filter((line) => /--abort|userdel|groupdel|rm -rf/.test(line))).toEqual(
			[],
		);
		expect(refused.transcript.lines.some((line) => line.startsWith('→ undoing:'))).toBe(false);
		// With it: dropped (DROP DATABASE, DROP ROLE), the user removed, empty dirs gone.
		const aborted = await runHost(host, laterRequest('abort', plan, DB));
		expect(aborted.outcome.message).toBeNull();
		expect(aborted.outcome.result).toBe('aborted');
		expect(stdinRuns(host, psql)).toBe(4);
		expect(aborted.outcome.keptLive).toBe(false);
		const log = loggedCommands(host.root);
		expect(log).toContain(`/usr/sbin/userdel ded_${INSTANCE}`);
		// The home this install created goes with the user (no file left to a reusable uid);
		// it was never filled by useradd's skeleton, and the package cache never lived in it.
		expect(log).toContain(`/usr/bin/rm -rf /home/ded_${INSTANCE}`);
		expect(log.some((line) => line.includes('useradd') && line.includes('--create-home'))).toBe(
			false,
		);
		const install = loggedRequests(host.root).find((entry) =>
			entry.argv.join(' ').includes(`/bun install --frozen-lockfile`),
		);
		expect(install?.env.BUN_INSTALL_CACHE_DIR?.startsWith(`/home/ded_${INSTANCE}/dedalo/`)).toBe(
			true,
		);
		expect(log).toContain(
			`/usr/sbin/runuser -u ded_${INSTANCE} -- /usr/bin/rm -rf /home/ded_${INSTANCE}/dedalo/.bun-install-cache`,
		);
		expect(
			log.filter((line) => line.startsWith(`${child} --abort --confirm-database ${DB}`)).length,
		).toBe(1);
		for (const dir of [
			`/srv/dedalo/${INSTANCE}/dedalo/media`,
			`/home/ded_${INSTANCE}/private`,
			`/opt/dedalo/instances/${INSTANCE}/bin`,
		])
			expect(() => statSync(join(host.root, dir)), dir).toThrow();
		expect(decoysIntact(host, files)).toEqual([]);
		expect(aborted.transcript.lines.join('\n')).toContain(
			'kept (shared host state, never removed)',
		);
		// No record is left (a fresh install may start again).
		expect(readPlanFile(join(host.root, RUN_DIR))).toBeNull();
	});
});

// ── (f) refusals ─────────────────────────────────────────────────────────────

/** A fresh run of `variant` on a planted host; answers the outcome and whether anything changed. */
async function freshOn(
	variant: HostVariant,
	options: PlantOptions = {},
	extra: Record<string, unknown> = {},
	now?: () => number,
) {
	const host = scratchHost(variant, options);
	const { plan, planFile } = productionPlan(variant, extra);
	const run = await runHost(host, freshRequest(planFile), now === undefined ? {} : { now });
	return { host, plan, outcome: run.outcome, changed: mutatingLog(loggedCommands(host.root)) };
}

/** A System check refusal: refused or failed AT host_preflight, nothing changed on the host. */
async function preflightRefusal(
	variant: HostVariant,
	options: PlantOptions,
	extra: Record<string, unknown> = {},
	now?: () => number,
): Promise<string> {
	const { outcome, changed } = await freshOn(variant, options, extra, now);
	expect(outcome.failedStep).toBe('host_preflight');
	expect(changed).toEqual([]);
	return outcome.message ?? '';
}

const NGINX_PRESENT = new Map([['/usr/sbin/nginx', '']]);

describe('refusals, each before anything changes (f)', () => {
	test('an unsupported OS: the sentence names it and lists every supported row (newest releases only)', async () => {
		const message = await preflightRefusal(UBUNTU_NGINX_LE, { osRelease: UNSUPPORTED_OS_RELEASE });
		expect(message).toContain('Ubuntu 24.04.3 LTS is not supported');
		expect(message).toContain(supportedOsList());
		expect(supportedOsList()).toBe(
			'Ubuntu 26.04 LTS, Debian 13 (trixie), RHEL / Rocky Linux / AlmaLinux 10',
		);
	});

	test('not root: refused with the sudo command (the preflight measures the effective uid)', async () => {
		const message = await preflightRefusal(UBUNTU_NGINX_LE, {
			responses: [{ match: '/usr/bin/id -u', stdout: '1000\n' }],
		});
		expect(message).toContain('the production route must run as root: sudo sh install.sh');
	});

	test('not root, before the preflight: the executor refuses before writing its record', async () => {
		const host = scratchHost(UBUNTU_NGINX_LE);
		const { planFile } = productionPlan(UBUNTU_NGINX_LE);
		expect(process.geteuid?.()).not.toBe(0);
		const { executeHostInstall } = await import('../../src/core/install/host/host_executor.ts');
		const { scratchRunner } = await import('../../src/core/install/host/runner.ts');
		const marker = join(host.root, SCRATCH_DIR);
		const outcome = await executeHostInstall(
			freshRequest(planFile),
			{ log: () => {}, warn: () => {} },
			{
				runner: scratchRunner(marker),
				fs: hostFs(host.root, join(marker, 'owners.json')),
				source: host.source,
			},
		);
		expect(outcome.result).toBe('refused');
		// Linux: the sudo form; any other system: the production route is Linux-only.
		expect(outcome.message).toContain(
			process.platform === 'linux' ? 'sudo sh install.sh' : 'use the docker or trial route',
		);
		expect(() => statSync(join(host.root, RUN_DIR))).toThrow();
		expect(loggedCommands(host.root)).toEqual([]);
	});

	test('nginx older than 1.25.1 (`http2 on;`): refused with the minimum, no fallback form', async () => {
		const message = await preflightRefusal(UBUNTU_NGINX_LE, {
			files: NGINX_PRESENT,
			responses: [{ match: '/usr/sbin/nginx -v', stderr: 'nginx version: nginx/1.24.0\n' }],
		});
		expect(message).toContain('nginx 1.24.0 is older than 1.25.1');
	});

	test('nginx 1.26 on the host is accepted (the version floor is not vacuous)', async () => {
		const { outcome } = await freshOn(UBUNTU_NGINX_LE, {
			files: NGINX_PRESENT,
			responses: [{ match: '/usr/sbin/nginx -v', stderr: 'nginx version: nginx/1.26.3\n' }],
		});
		expect(outcome.result).toBe('complete');
	});

	test('an Apache module missing: the enabling command is TOLD, never run; a resume continues once it is enabled', async () => {
		const { host, plan, outcome } = await freshOn(DEBIAN_APACHE_LE, {
			responses: [
				{
					match: '/usr/sbin/apache2ctl -M',
					stdout:
						' ssl_module (shared)\n headers_module (shared)\n http2_module (shared)\n rewrite_module (shared)\n proxy_module (shared)\n',
				},
			],
		});
		expect(outcome.failedStep).toBe('host_web_http');
		expect(outcome.message).toContain('a2enmod proxy_http && systemctl reload apache2');
		expect(loggedCommands(host.root).filter((line) => line.includes('a2enmod'))).toEqual([]);
		replaceResponses(host, DEBIAN_APACHE_LE, []);
		expect((await runHost(host, laterRequest('resume', plan))).outcome.result).toBe('complete');
	});

	const clashes: {
		name: string;
		options: PlantOptions;
		extra?: Record<string, unknown>;
		variant?: HostVariant;
		sentence: string;
	}[] = [
		{
			name: 'the instance user exists',
			options: {
				responses: [
					{
						match: `/usr/bin/getent passwd ded_${INSTANCE}`,
						stdout: `ded_${INSTANCE}:x:1001:1001::/home/ded_${INSTANCE}:/bin/bash\n`,
					},
				],
			},
			sentence: `the user ded_${INSTANCE} already exists`,
		},
		{
			name: 'the database exists',
			options: {
				responses: [
					{
						match: '/usr/sbin/runuser -u postgres -- /usr/lib/postgresql/18/bin/psql -XAtq',
						stdout: '1 0\n',
					},
				],
			},
			sentence: `database ${DB} already exists`,
		},
		{
			name: 'the role exists',
			options: {
				responses: [
					{
						match: '/usr/sbin/runuser -u postgres -- /usr/lib/postgresql/18/bin/psql -XAtq',
						stdout: '0 1\n',
					},
				],
			},
			sentence: `role ded_${INSTANCE} already exists`,
		},
		{
			name: 'the server unit is enabled',
			options: {
				responses: [
					{
						match: '/usr/bin/systemctl list-unit-files',
						stdout: `dedalo-ts@${INSTANCE}.service enabled enabled\n`,
					},
				],
			},
			sentence: `dedalo-ts@${INSTANCE}.service is already enabled`,
		},
		{
			name: 'the server unit has drop-ins',
			options: { files: new Map([[`/etc/systemd/system/dedalo-ts@${INSTANCE}.service.d/`, '']]) },
			sentence: 'already has drop-ins',
		},
		{
			name: 'the site file exists',
			options: { files: new Map([[`/etc/nginx/conf.d/dedalo-${INSTANCE}.conf`, 'server {}\n']]) },
			sentence: `/etc/nginx/conf.d/dedalo-${INSTANCE}.conf already exists`,
		},
		{
			name: 'the socket exists',
			options: { files: new Map([[`/run/dedalo-${INSTANCE}/dedalo_ts.sock`, '']]) },
			sentence: `the socket /run/dedalo-${INSTANCE}/dedalo_ts.sock already exists`,
		},
		{
			name: 'another site serves the address on our ports',
			options: {
				files: NGINX_PRESENT,
				responses: [
					{ match: '/usr/sbin/nginx -v', stderr: 'nginx version: nginx/1.26.3\n' },
					{
						match: '/usr/sbin/nginx -T',
						stdout: `# configuration file /etc/nginx/sites-enabled/museum.conf:\nserver {\n\tlisten 443 ssl;\n\tserver_name ${SERVER_NAME};\n}\n`,
					},
				],
			},
			sentence: `${SERVER_NAME} is already served on port 80/443 by /etc/nginx/sites-enabled/museum.conf`,
		},
		{
			name: 'a non-standard port held by another program',
			variant: HOST_VARIANTS.find(
				(variant) =>
					variant.os === 'ubuntu2604' && variant.web === 'nginx' && variant.tls === 'files',
			) as HostVariant,
			extra: { https_port: '8443' },
			options: {
				responses: [
					{
						match: '/usr/bin/ss -ltnpH',
						stdout: 'LISTEN 0 511 0.0.0.0:8443 0.0.0.0:* users:(("node",pid=812,fd=21))\n',
					},
				],
			},
			sentence: 'port 8443 is held by node',
		},
		{
			name: 'another PostgreSQL major on the database port (a second cluster would be made beside it)',
			variant: HOST_VARIANTS.find(
				(variant) =>
					variant.os === 'debian13' && variant.web === 'nginx' && variant.tls === 'letsencrypt',
			) as HostVariant,
			options: {
				files: new Map([['/usr/bin/pg_lsclusters', '']]),
				responses: [
					{
						match: '/usr/bin/pg_lsclusters --no-header',
						stdout:
							'16  main    5432 online postgres /var/lib/postgresql/16/main /var/log/postgresql/postgresql-16-main.log\n',
					},
				],
			},
			sentence: 'PostgreSQL 16 already runs on this host on port 5432',
		},
		{
			name: "another file defines the site's nginx upstream (global names: nginx -t would fail host-wide)",
			options: {
				files: NGINX_PRESENT,
				responses: [
					{ match: '/usr/sbin/nginx -v', stderr: 'nginx version: nginx/1.26.3\n' },
					{
						match: '/usr/sbin/nginx -T',
						stdout: `# configuration file /etc/nginx/conf.d/legacy.conf:\nupstream dedalo_${INSTANCE} { server 127.0.0.1:9; }\n`,
					},
				],
			},
			sentence: `nginx name dedalo_${INSTANCE} is already defined in /etc/nginx/conf.d/legacy.conf`,
		},
		{
			name: 'the web server configuration dump fails (an unread dump is no evidence of no clash)',
			options: {
				files: NGINX_PRESENT,
				responses: [
					{ match: '/usr/sbin/nginx -v', stderr: 'nginx version: nginx/1.26.3\n' },
					{ match: '/usr/sbin/nginx -T', exit: 1, stderr: 'nginx: [emerg] unknown directive' },
				],
			},
			sentence: '`nginx -T` (the configuration dump) failed (exit 1)',
		},
		{
			name: "EL Apache's site listing fails (`httpd -S`)",
			variant: HOST_VARIANTS.find(
				(variant) => variant.os === 'el10' && variant.web === 'apache' && variant.tls === 'files',
			) as HostVariant,
			options: {
				files: new Map([['/usr/sbin/apachectl', '']]),
				responses: [
					{ match: '/usr/sbin/httpd -v', stdout: 'Server version: Apache/2.4.63 (AlmaLinux)\n' },
					{ match: '/usr/sbin/httpd -S', exit: 1, stderr: 'AH00526: Syntax error' },
				],
			},
			sentence: '`/usr/sbin/httpd -S` failed (exit 1)',
		},
		{
			name: 'an instance directory already exists (never taken over: the answers may point at /var/www, /srv…)',
			options: { files: new Map([[`/srv/dedalo/${INSTANCE}/`, '']]) },
			sentence: `/srv/dedalo/${INSTANCE} already exists`,
		},
		{
			name: 'a media path whose web root is a foreign directory (/var/www)',
			extra: { media_path: '/var/www/dedalo/media' },
			options: { files: new Map([['/var/www/html/index.html', 'the default site\n']]) },
			sentence: '/var/www already exists',
		},
	];

	for (const clash of clashes) {
		test(`a clash — ${clash.name}: refused at the System check`, async () => {
			const message = await preflightRefusal(
				clash.variant ?? UBUNTU_NGINX_LE,
				clash.options,
				clash.extra ?? {},
			);
			expect(message).toContain(clash.sentence);
		});
	}

	test('a foreign template unit (another installer, an edited copy): refused, never overwritten', async () => {
		const foreign = '[Service]\nExecStart=/usr/local/bin/someone-else\n';
		const { host, outcome } = await freshOn(UBUNTU_NGINX_LE, {
			files: new Map([['/etc/systemd/system/dedalo-ts@.service', foreign]]),
		});
		expect(outcome.failedStep).toBe('host_units');
		expect(outcome.message).toContain('already exist(s) with other content');
		expect(readFileSync(join(host.root, '/etc/systemd/system/dedalo-ts@.service'), 'utf8')).toBe(
			foreign,
		);
	});

	const FILES_VARIANT = HOST_VARIANTS.find(
		(variant) => variant.os === 'ubuntu2604' && variant.web === 'nginx' && variant.tls === 'files',
	) as HostVariant;

	test("the institution's certificate EXPIRED: refused at the System check", async () => {
		const later = Date.now() + 400 * 24 * 3600 * 1000;
		const message = await preflightRefusal(FILES_VARIANT, {}, {}, () => later);
		expect(message).toContain(`${CERT_PATHS.cert}: the certificate expired on`);
	});

	test("the institution's certificate names ANOTHER address: refused", async () => {
		const other = mintCertificate('other.example.org');
		const message = await preflightRefusal(FILES_VARIANT, {
			files: new Map([
				[CERT_PATHS.cert, other.cert],
				[CERT_PATHS.key, other.key],
			]),
		});
		expect(message).toContain(`the certificate does not name ${SERVER_NAME}`);
	});

	test("the institution's key belongs to ANOTHER certificate: refused", async () => {
		const stranger = mintCertificate(SERVER_NAME);
		const message = await preflightRefusal(FILES_VARIANT, {
			files: new Map([[CERT_PATHS.key, stranger.key]]),
		});
		expect(message).toContain('the key does not belong to the certificate');
	});

	test("the institution's VALID certificate passes (the refusals above are not vacuous)", async () => {
		const { outcome } = await freshOn(FILES_VARIANT);
		expect(outcome.result).toBe('complete');
	});
});

// ── the directory modes (the DIR_MODE_REGISTER's rule, for the host steps) ───

describe('every directory a production install creates has a deliberate mode (b)', () => {
	test("the instance's data is never world-readable; MEDIA_PATH at the media tree's mode; root's dirs are root's", () => {
		for (const variant of HOST_VARIANTS) {
			const ctx = productionPlanCtx(variant);
			const dirs = reviewCommands(ctx)
				.map(({ command }) => command)
				.filter((command): command is MkdirCommand => command.kind === 'mkdir');
			expect(dirs.length).toBeGreaterThan(15);
			for (const dir of dirs) {
				// Nothing world-writable, ever; nothing of the instance world-readable.
				expect(dir.mode & 0o002, dir.path).toBe(0);
				if (dir.owner === ctx.paths.user) expect(dir.mode & 0o007, dir.path).toBe(0);
				// A world-searchable dir is root's (the /opt runtime, the shared parents).
				if (dir.mode & 0o001) expect(`${dir.owner}:${dir.group}`, dir.path).toBe('root:root');
			}
			const mode = (path: string) => dirs.find((dir) => dir.path === path)?.mode;
			expect(mode(ctx.paths.media)).toBe(MEDIA_DIR_MODE);
			expect(mode(ctx.paths.privateDir)).toBe(0o700);
			expect(mode(ctx.paths.home)).toBe(0o750);
			expect(mode(ctx.paths.binDir)).toBe(0o755);
		}
	});
});

// ── the package lists come first (measured: the Debian 13 drill) ────────────

describe('apt: the package lists are fetched before anything is installed (a fresh host has none)', () => {
	test('every apt row: `apt-get update` precedes the first `apt-get install` (a repository setup package included)', () => {
		for (const variant of HOST_VARIANTS.filter((item) => osRowById(item.os).tool === 'apt')) {
			const ctx = productionPlanCtx(variant);
			const apt = reviewCommands(ctx)
				.map(({ command }) => command)
				.filter((command): command is HostCommand & { kind: 'exec' } => command.kind === 'exec')
				.map((command) => command.argv.join(' '))
				.filter((line) => line.startsWith('/usr/bin/apt-get '));
			expect(apt[0], variantName(variant)).toBe('/usr/bin/apt-get update');
			// Debian 13 adds PGDG: its lists are fetched again before the transaction.
			if (variant.os === 'debian13') {
				const install = apt.findIndex((line) => line.includes(' postgresql-18'));
				expect(apt[install - 1], variantName(variant)).toBe('/usr/bin/apt-get update');
			}
		}
	});
});

// ── the 2026-10-12 review: the web steps, the probes, the abort's own guarantees ──

const PG = osRowById('ubuntu2604').pgBinDir;
const PSQL_POSTGRES = `/usr/sbin/runuser -u postgres -- ${PG}/psql -X -q -A -t -v ON_ERROR_STOP=1 -h /var/run/postgresql -p 5432 -d postgres`;
const PUBLIC_HEALTH = `/usr/bin/curl -sS -o /dev/null -w %{http_code} --max-time 20 --resolve ${SERVER_NAME}:443:127.0.0.1 https://${SERVER_NAME}/health`;
const RULE_COPY = `/etc/nginx/dedalo/${INSTANCE}/media_protection.conf`;

/** The engine child failing its run (an abort is then a FULL one: nothing live). */
function engineFails(): RecordedResponse[] {
	const bun = `/opt/dedalo/bun/${BUN_PIN}/bun`;
	const child = `/usr/sbin/runuser -u ded_${INSTANCE} -- ${bun} run /home/ded_${INSTANCE}/dedalo/scripts/install.ts`;
	return [
		{ match: `${child} --request-stdin`, exit: 9, stderr: 'the seed restore failed' },
		{
			match: `${child} --status --json`,
			after: `${child} --request-stdin`,
			until: `${child} --abort`,
			stdout:
				'{"exists":true,"outcome":"in_progress","failed_step":"install_db_from_default_file"}\n',
		},
	];
}

describe('the web steps never leave the host half-configured (review)', () => {
	test('a failed configuration test at host_web_site: the site goes back to stage 1; an abort removes every web file and the group membership', async () => {
		const { host, plan, outcome } = await freshOn(UBUNTU_NGINX_LE, {
			responses: [
				{
					match: '/usr/sbin/nginx -t',
					whenPath: RULE_COPY,
					exit: 1,
					stderr: `nginx: [emerg] duplicate upstream "dedalo_${INSTANCE}"`,
				},
			],
		});
		expect(outcome.failedStep).toBe('host_web_site');
		const ctx = frozenContext(host);
		const site = `/etc/nginx/conf.d/dedalo-${INSTANCE}.conf`;
		// The host's nginx is left with the configuration it accepted (stage 1), never the refused one.
		expect(readFileSync(join(host.root, site), 'utf8')).toBe(siteText(ctx, null));
		const abort = await runHost(host, laterRequest('abort', plan));
		expect(abort.outcome.message).toBeNull();
		expect(abort.outcome.result).toBe('aborted');
		for (const path of [
			site,
			RULE_COPY,
			`/etc/nginx/dedalo/${INSTANCE}/media_protection_map.conf`,
			`/etc/nginx/dedalo/${INSTANCE}`,
		])
			expect(() => statSync(join(host.root, path)), path).toThrow();
		expect(loggedCommands(host.root)).toContain(`/usr/bin/gpasswd -d www-data ded_${INSTANCE}`);
	});

	test("Apache: a failed module listing is refused as what it is — never read as 'modules missing'", async () => {
		const { outcome } = await freshOn(DEBIAN_APACHE_LE, {
			responses: [{ match: '/usr/sbin/apache2ctl -M', exit: 1, stderr: 'AH00526: Syntax error' }],
		});
		expect(outcome.failedStep).toBe('host_web_http');
		expect(outcome.message).toContain("listing Apache's modules failed");
		expect(outcome.message).not.toContain('lacks the modules');
	});

	test('the site includes only ROOT-OWNED copies of the media rules, never a file under MEDIA_PATH', () => {
		const ctx = productionPlanCtx(UBUNTU_NGINX_LE);
		const includes = [
			...siteText(ctx, certificatePaths(ctx)).matchAll(/^\s*include\s+(\S+);/gm),
		].map((m) => m[1] as string);
		expect(includes).toEqual([RULE_COPY]);
		expect(includes.filter((path) => path.startsWith(ctx.paths.media))).toEqual([]);
		const apache = productionPlanCtx(DEBIAN_APACHE_LE);
		const vhost = siteText(apache, certificatePaths(apache));
		expect(vhost).not.toMatch(/AllowOverride\s+All/);
		// Merged after every .htaccess: the instance's file can never switch CGI on.
		expect(vhost).toMatch(
			/<Location "\/dedalo\/media\/">\s*Options -Indexes -ExecCGI\s*<\/Location>/,
		);
	});
});

describe('the public address is polled while the reload settles (review)', () => {
	test('it answers on the 4th probe: the install completes', async () => {
		const { host, outcome } = await freshOn(UBUNTU_NGINX_LE, {
			responses: [
				{ match: PUBLIC_HEALTH, afterCount: 3, stdout: '200' },
				{ match: PUBLIC_HEALTH, stdout: '000' },
			],
		});
		expect(outcome.message).toBeNull();
		expect(outcome.result).toBe('complete');
		expect(loggedCommands(host.root).filter((line) => line === PUBLIC_HEALTH).length).toBe(4);
	});

	test('it never answers: refused after the bound, the probe file removed', async () => {
		let clock = Date.now();
		const { host, outcome } = await freshOn(
			UBUNTU_NGINX_LE,
			{ responses: [{ match: PUBLIC_HEALTH, stdout: '000' }] },
			{},
			() => {
				clock += 5_000;
				return clock;
			},
		);
		expect(outcome.failedStep).toBe('host_public_probe');
		expect(outcome.message).toContain('/health through the public address: expected 200, got 000');
		const log = loggedCommands(host.root);
		expect(log.filter((line) => line === PUBLIC_HEALTH).length).toBeGreaterThan(3);
		// The probe file: written and removed by the instance user, never by root through a path.
		const probe = `/srv/dedalo/${INSTANCE}/dedalo/media/image/thumb/dd_install_probe_dd0_0.jpg`;
		expect(log).toContain(
			`/usr/sbin/runuser -u ded_${INSTANCE} -- /usr/bin/install -D -m 0640 /dev/null ${probe}`,
		);
		expect(log).toContain(`/usr/sbin/runuser -u ded_${INSTANCE} -- /usr/bin/rm -f ${probe}`);
	});
});

describe("a Let's Encrypt STAGING install completes (the probe cannot verify a test chain)", () => {
	const STAGING_HEALTH = `/usr/bin/curl -sS -o /dev/null -w %{http_code} --max-time 20 --resolve ${SERVER_NAME}:443:127.0.0.1 --insecure https://${SERVER_NAME}/health`;

	test('staging: every public probe skips chain verification, the install completes and says so', async () => {
		const { host, outcome } = await freshOn(
			UBUNTU_NGINX_LE,
			{ responses: [{ match: STAGING_HEALTH, stdout: '200' }] },
			{ letsencrypt_staging: true },
		);
		expect(outcome.message).toBeNull();
		expect(outcome.result).toBe('complete');
		const probes = loggedCommands(host.root).filter((line) =>
			line.includes('--max-time 20 --resolve'),
		);
		expect(probes.length).toBeGreaterThanOrEqual(3);
		for (const line of probes) expect(line).toContain(' --insecure ');
	});

	test('a real certificate: no probe ever skips chain verification', async () => {
		const { host, outcome } = await freshOn(UBUNTU_NGINX_LE);
		expect(outcome.result).toBe('complete');
		const probes = loggedCommands(host.root).filter((line) =>
			line.includes('--max-time 20 --resolve'),
		);
		expect(probes.length).toBeGreaterThanOrEqual(3);
		for (const line of probes) expect(line).not.toContain('--insecure');
	});
});

describe('a unit that REFUSED to boot stops the first-boot wait at once (phase 5)', () => {
	const SOCKET_HEALTH = '/usr/bin/curl -s -o /dev/null -w %{http_code} --max-time 10 --unix-socket';
	const show = (property: string) =>
		`/usr/bin/systemctl show -p ${property} --value dedalo-ts@${INSTANCE}.service`;

	test('the refusal exit is the engine one (not imported by the root-run step — held equal here)', () => {
		expect(REFUSED_BOOT_EXIT).toBe(NOT_INSTALLED_EXIT_CODE);
	});

	test('exit 78 (`failed`, never restarted): refused on the first poll, naming the unit and the journal', async () => {
		let clock = Date.now();
		const { host, outcome } = await freshOn(
			UBUNTU_NGINX_LE,
			{
				responses: [
					{ match: SOCKET_HEALTH, exit: 7, stdout: '000' },
					{ match: show('Result'), stdout: 'exit-code\n' },
					{ match: show('ExecMainStatus'), stdout: '78\n' },
				],
			},
			{},
			() => {
				clock += 5_000;
				return clock;
			},
		);
		expect(outcome.failedStep).toBe('host_first_boot');
		expect(outcome.message).toContain(`dedalo-ts@${INSTANCE}.service refused to boot (exit 78`);
		expect(outcome.message).toContain(`journalctl -u dedalo-ts@${INSTANCE}.service`);
		// One poll, not the whole bound.
		expect(loggedCommands(host.root).filter((line) => line.startsWith(SOCKET_HEALTH)).length).toBe(
			1,
		);
	});

	test('another failure exit is NOT read as a refusal: the wait runs to its bound (the check is not vacuous)', async () => {
		let clock = Date.now();
		const { host, outcome } = await freshOn(
			UBUNTU_NGINX_LE,
			{
				responses: [
					{ match: SOCKET_HEALTH, exit: 7, stdout: '000' },
					{ match: show('Result'), stdout: 'exit-code\n' },
					{ match: show('ExecMainStatus'), stdout: '1\n' },
				],
			},
			{},
			() => {
				clock += 60_000;
				return clock;
			},
		);
		expect(outcome.failedStep).toBe('host_first_boot');
		expect(outcome.message).not.toContain('refused to boot');
		expect(outcome.message).toContain('not reached after');
		expect(
			loggedCommands(host.root).filter((line) => line.startsWith(SOCKET_HEALTH)).length,
		).toBeGreaterThan(1);
	});
});

describe('an abort undoes only what it measured as created (review)', () => {
	test('PostgreSQL unknowable at the System check: the existing role is measured before the CREATE and never dropped', async () => {
		const { host, plan, outcome } = await freshOn(UBUNTU_NGINX_LE, {
			responses: [
				{ match: `/usr/sbin/runuser -u postgres -- ${PG}/psql -XAtq`, stdout: '' },
				{ match: `${PSQL_POSTGRES} -c SELECT 1 / count(*) FROM pg_roles`, stdout: '1\n' },
				...engineFails(),
			],
		});
		expect(outcome.failedStep).toBe('host_engine');
		const state = readStateFile(join(host.root, RUN_DIR));
		expect(state?.preflight.host?.facts.roleExists).toBeNull();
		expect(state?.created.host?.pg_role).toBe(false);
		expect(state?.created.host?.pg_database).toBe(true);
		expect(stdinRuns(host, PSQL_POSTGRES)).toBe(1); // CREATE DATABASE only
		const aborted = await runHost(host, laterRequest('abort', plan, DB));
		expect(aborted.outcome.result).toBe('aborted');
		expect(stdinRuns(host, PSQL_POSTGRES)).toBe(2); // + DROP DATABASE — never DROP ROLE
		expect(aborted.transcript.lines.join('\n')).toContain(`dropped ${DB}`);
		expect(aborted.transcript.lines.join('\n')).not.toContain(`ded_${INSTANCE} and`);
	});

	test('PostgreSQL not answering whether the role exists: refused, nothing created', async () => {
		const { outcome } = await freshOn(UBUNTU_NGINX_LE, {
			responses: [
				{ match: `/usr/sbin/runuser -u postgres -- ${PG}/psql -XAtq`, stdout: '' },
				{ match: `${PSQL_POSTGRES} -c SELECT 1 / count(*) FROM pg_roles`, exit: 2 },
			],
		});
		expect(outcome.failedStep).toBe('host_database');
		expect(outcome.message).toContain('PostgreSQL did not answer whether');
	});

	test("templates an earlier (aborted) instance wrote: the last instance's abort removes them — the registry decides, not the writer", async () => {
		const row = osRowById(UBUNTU_NGINX_LE.os);
		const templates = new Map(
			UNIT_TEMPLATES.map((name) => [
				`/etc/systemd/system/${name}`,
				renderTemplate(name, row, REPO_ROOT),
			]),
		);
		const host = scratchHost(UBUNTU_NGINX_LE, { files: templates });
		const { plan, planFile } = productionPlan(UBUNTU_NGINX_LE);
		expect((await runHost(host, freshRequest(planFile))).outcome.result).toBe('complete');
		expect(readStateFile(join(host.root, RUN_DIR))?.created.host?.units).toEqual([]);
		const abort = await runHost(host, laterRequest('abort', plan));
		expect(abort.outcome.result).toBe('aborted');
		for (const path of templates.keys())
			expect(() => statSync(join(host.root, path)), path).toThrow();
	});
});

describe('Done says what the route did (review)', () => {
	const outcome = (result: 'complete' | 'aborted') => ({
		exitCode: 0,
		result,
		message: null,
		failedStep: null,
		hint: [],
	});
	const summary = (route: RunEnding['route'], result: 'complete' | 'aborted', keptLive = false) =>
		doneSummary({
			kind: 'run',
			outcome: outcome(result),
			mode: result === 'aborted' ? 'abort' : 'fresh',
			rootVerified: false,
			shownOnce: [],
			ending: { route, instance: INSTANCE, keptLive },
		});

	test('production: the instance unit is already running — never the single-instance unit hint', () => {
		const text = summary('production', 'complete');
		expect(text).toContain(`dedalo-ts@${INSTANCE} is running under systemd`);
		expect(text).not.toContain('systemctl enable --now dedalo-ts');
	});

	test('docker and trial: the stack is up; the engine-only run keeps its supervisor sentence', () => {
		for (const route of ['docker', 'trial'] as const) {
			expect(summary(route, 'complete')).toContain('The stack is up under Docker');
			expect(summary(route, 'complete')).not.toContain('systemctl enable --now dedalo-ts');
			// The compose command the operator copies carries the stack's THREE files
			// (without them compose resolves its built-in defaults, not this install's).
			const stack = stackFileOf({ route } as InstallAnswers);
			expect(summary(route, 'complete')).toContain(
				`docker compose -f ${stack} -f compose.override.yaml --env-file .dedalo.env ps`,
			);
		}
		// The developer route: its own launchers, never the manual host's unit as the path.
		expect(summary('engine', 'complete')).toContain('bun run start:supervised');
		expect(summary('engine', 'complete')).toContain('docs/install/dev_quickstart.md');
		expect(summary('engine', 'complete')).not.toContain('systemctl enable --now dedalo-ts');
	});

	test('a host abort says what it removed (the database too, as confirmed) — or that the live instance was kept', () => {
		expect(summary('production', 'aborted')).toContain('its database and role');
		expect(summary('production', 'aborted')).not.toContain('the database itself is kept');
		expect(summary('docker', 'aborted')).toContain('volumes this install created are removed');
		expect(summary('production', 'aborted', true)).toContain(
			'the instance itself (its user, database and code) is kept',
		);
	});
});
