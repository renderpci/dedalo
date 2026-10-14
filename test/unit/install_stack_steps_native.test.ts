/**
 * THE DOCKER AND TRIAL HOST STEPS, RUN END TO END ON A SCRATCH MACHINE
 * (terminal installer phase 4, 2026-10-12; src/core/install/host/stack/ — the
 * stack table over the SAME executor and step loop as production).
 *
 * The executor runs every stack step — preflight, image, certificate, files,
 * database, the delegated engine, up, health — with a RECORDING RUNNER (no
 * docker, no cosign, no curl is executed: test/helpers/install_host_scratch.ts
 * answers them) and a scratch filesystem root (the checkout's files land under
 * it). Nothing touches this machine's Docker.
 *
 * WHAT IS MEASURED (outcomes):
 *  (a) trial (official image) and docker (Let's Encrypt) complete; a second run
 *      changes nothing; every docker command that CHANGES something is one the
 *      Review listed.
 *  (b) THE STACK FILES: .dedalo.env 0600, the operator's, holding a GENERATED
 *      32-character database password that appears NOWHERE else (no argv, no
 *      state or plan file, no other file, no transcript line); the override
 *      written; the full stack's generated site written (docker only).
 *  (c) THE DELEGATE (F5, critique B10): the engine child is `compose run --rm
 *      -T` with its request on STDIN — never `-e NAME=value` (shown by `docker
 *      inspect`), never a bind mount of an answers file; the root password and
 *      the generated database password reach it only there; the one-time salt
 *      goes to the one-time display, never the transcript.
 *  (d) THE IMAGE: an official image is cosign-verified over its ONE digest with
 *      the bundled identity; a re-pointed tag (label ≠ tag) is refused at
 *      stack_image; an image version that is not the installer's, an official
 *      image without cosign, a machine without Docker (TOLD, never installed)
 *      and an existing instance are refused at the System check, before
 *      anything changes.
 *  (e) TRIAL: no certificate step; Done says the stack has NO media protection;
 *      no media-gate probe runs.
 *  (f) ABORT after a failed engine: refused without --confirm-database (no
 *      volume removed); with it, only the volumes and files THIS install
 *      created go — the unrelated `dedalo_unrelated` volume never.
 *
 * DB-FREE, network-free (the hermetic tier runs it).
 */

import { afterAll, describe, expect, spyOn, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { HostCtx, HostStepDefinition } from '../../src/core/install/host/contract.ts';
import { hostFs } from '../../src/core/install/host/fs.ts';
import { hostPlanRefusals } from '../../src/core/install/host/host_executor.ts';
import {
	REVIEW_TODO_STEP,
	reviewHostCommands,
	reviewPreflightRefusals,
} from '../../src/core/install/host/review.ts';
import {
	type CommandRunner,
	type RecordedResponse,
	recordingRunner,
	scratchRunner,
} from '../../src/core/install/host/runner.ts';
import { stackImages } from '../../src/core/install/host/stack/database.ts';
import { stackSaltCommand } from '../../src/core/install/host/stack/engine_delegate.ts';
import { curlReason } from '../../src/core/install/host/stack/health.ts';
import { IMAGE_BUILDER, imageCommands } from '../../src/core/install/host/stack/image.ts';
import {
	BUILD_DURATION,
	imageRefOf,
	imageVersionOf,
	officialRepositories,
} from '../../src/core/install/host/stack/layout.ts';
import { STACK_HOST_STEPS } from '../../src/core/install/host/stack/table.ts';
import { containerEverStarted } from '../../src/core/install/host/stack/up.ts';
import { emptyHostCreated } from '../../src/core/install/host/state_types.ts';
import { buildInstallPlan, type StackHostStepId } from '../../src/core/install/install_plan.ts';
import { MEDIA_DIR_MODE } from '../../src/core/install/media_tree.ts';
import {
	buildPlanFile,
	type InstallState,
	readStateFile,
} from '../../src/core/install/run_files_core.ts';
import { DONE_TEXT, NOTICE_TEXT } from '../../src/core/install/screen_text.ts';
import { loadImageRegistries } from '../../src/core/update/image_registries.ts';
import {
	COSIGN,
	composePrefix,
	DOCKER,
	type HostFiles,
	IMAGE_DIGEST,
	laterRequest,
	loggedCommands,
	loggedRequests,
	mintCertificate,
	REPO_ROOT,
	ROOT_PASSWORD,
	runHost,
	SCRATCH_DIR,
	type ScratchHost,
	SECRETS,
	scratchFilePaths,
	stackHostFiles,
	stackPlanCtx,
	stackResponses,
} from '../helpers/install_host_scratch.ts';

const scratchBase = mkdtempSync(join(tmpdir(), 'dedalo_install_stack_steps_'));
afterAll(() => rmSync(scratchBase, { recursive: true, force: true }));

const FIRST = officialRepositories()[0] as string;
const TRIAL = { route: 'trial', entity: 'trial_museum' };
const DOCKER_LE = {
	route: 'docker',
	entity: 'museo',
	server_name: 'dedalo.example.org',
	letsencrypt_email: 'ops@example.org',
};

/** Write `files` under `base`. */
function plant(base: string, files: ReadonlyMap<string, string>): void {
	for (const [path, content] of files) {
		const real = join(base, path);
		mkdirSync(dirname(real), { recursive: true });
		writeFileSync(real, content);
	}
}

let counter = 0;

/** A planted operator machine (the checkout is this repository, mapped under the scratch root). */
function machine(
	raw: Record<string, unknown>,
	options: {
		docker?: boolean;
		cosign?: boolean;
		ss?: boolean;
		responses?: readonly RecordedResponse[];
	} = {},
): ScratchHost {
	counter += 1;
	const root = join(scratchBase, `m${counter}`);
	plant(root, stackHostFiles(options));
	mkdirSync(join(root, SCRATCH_DIR), { recursive: true });
	const route = raw.route as 'docker' | 'trial';
	const version = imageVersionOf(stackPlanCtx(raw).answers);
	writeFileSync(
		join(root, SCRATCH_DIR, 'responses.json'),
		JSON.stringify([...(options.responses ?? []), ...stackResponses(route, version, FIRST)]),
	);
	return { root, source: REPO_ROOT };
}

/** The fresh request of a stack plan (the root password; the database password is generated). */
function fresh(raw: Record<string, unknown>) {
	const plan = buildInstallPlan(raw, { rootPassword: ROOT_PASSWORD, requireRootPassword: true });
	expect(plan.errors).toEqual([]);
	return {
		plan,
		request: {
			mode: 'fresh' as const,
			execute: true,
			planFile: buildPlanFile(plan, SECRETS),
			secrets: { ...SECRETS },
		},
	};
}

/** A docker command that CHANGES something (pull, build, run, up, down, volume rm, exec writes). */
const MUTATING = new RegExp(
	`^(/bin/bash \\S+/deploy/dedalo-image-build\\.sh |${DOCKER} (pull|build|run --rm -p|volume rm|compose .* (up|down|run --rm --name dedalo-install-engine -T dedalo bun run scripts/install.ts --request-stdin|exec -T dedalo (mkdir|tee|rm))))`,
);

/** Every file under `dir`, as text. */
function allFiles(dir: string): { path: string; text: string }[] {
	return scratchFilePaths(dir).map((path) => ({ path, text: readFileSync(path, 'utf8') }));
}

/** The Review's exec lines of a plan (every stack step's commands). */
function reviewLines(raw: Record<string, unknown>): Set<string> {
	const ctx = stackPlanCtx(raw);
	return new Set(
		(ctx.plan.steps as StackHostStepId[]).flatMap((step) =>
			STACK_HOST_STEPS[step]
				.commands(ctx)
				.flatMap((command) => (command.kind === 'exec' ? [command.argv.join(' ')] : [])),
		),
	);
}

// ── (a)–(c), (e) the routes run ──────────────────────────────────────────────

// The scratch-host listing the leak checks below read: a fresh trial run leaves a
// populated host (the planted machine, the written stack files, the run record) —
// an empty listing would make every "no file holds the secret" check vacuous.
test('the scratch listing the leak checks read is populated after a run', async () => {
	const host = machine(TRIAL);
	const { request } = fresh(TRIAL);
	expect((await runHost(host, request)).outcome.result).toBe('complete');
	const listed = scratchFilePaths(host.root);
	expect(listed.length).toBeGreaterThan(6);
});

describe('trial and docker run end to end (a, b, c, e)', () => {
	for (const raw of [TRIAL, DOCKER_LE]) {
		test(`${raw.route}: complete, idempotent, the Review's commands, the files, the delegate, no leak`, async () => {
			const host = machine(raw);
			const { plan, request } = fresh(raw);
			const first = await runHost(host, request);
			expect(first.outcome.message).toBeNull();
			expect(first.outcome.result).toBe('complete');
			const log = loggedCommands(host.root);
			// (a) every change is on the Review.
			const review = reviewLines(raw);
			expect(log.filter((line) => MUTATING.test(line) && !review.has(line))).toEqual([]);
			expect(log.filter((line) => MUTATING.test(line)).length).toBeGreaterThanOrEqual(5);
			// (b) the files.
			const fs = hostFs(host.root, join(host.root, SCRATCH_DIR, 'owners.json'));
			const envPath = join(REPO_ROOT, '.dedalo.env');
			const env = fs.readText(envPath) ?? '';
			const password = /^POSTGRES_PASSWORD=([A-Za-z0-9]{32})$/m.exec(env)?.[1] ?? '';
			expect(password).toHaveLength(32);
			expect(fs.stat(envPath)?.mode).toBe(0o600);
			expect(fs.stat(envPath)?.owner).toBe('operator');
			expect(fs.exists(join(REPO_ROOT, 'compose.override.yaml'))).toBe(true);
			expect(fs.exists(join(REPO_ROOT, 'deploy/nginx.docker.generated.conf'))).toBe(
				raw.route === 'docker',
			);
			const holders = allFiles(host.root)
				.filter((file) => file.text.includes(password))
				.map((file) => file.path.slice(host.root.length));
			expect(holders).toEqual([envPath]);
			const leaks = [
				...log.filter((line) => line.includes(password) || line.includes(ROOT_PASSWORD)),
				...first.transcript.lines.filter(
					(line) => line.includes(password) || line.includes(ROOT_PASSWORD),
				),
				...allFiles(host.root)
					.filter((file) => file.text.includes(ROOT_PASSWORD))
					.map((file) => file.path),
			];
			expect(leaks).toEqual([]);
			// (c) the delegate.
			const child = loggedRequests(host.root).find((entry) =>
				entry.argv.includes('--request-stdin'),
			);
			const argv = child?.argv ?? [];
			expect(argv.join(' ')).toStartWith(
				`${composePrefix(raw.route as 'docker' | 'trial')} run --rm --name dedalo-install-engine -T dedalo bun run scripts/install.ts --request-stdin --execute --events-jsonl`,
			);
			expect(
				argv.filter(
					(word) => word === '-e' || word === '--env' || word === '-v' || word === '--volume',
				),
			).toEqual([]);
			expect(child?.stdin).toBe(true);
			expect(first.transcript.shown.join('\n')).toContain('scratch-stack-salt');
			expect(first.transcript.lines.join('\n')).not.toContain('scratch-stack-salt');
			// (e) trial: no certificate step, no media gate probe, the label on Done.
			if (raw.route === 'trial') {
				expect(plan.steps).not.toContain('stack_tls');
				expect(log.filter((line) => line.includes(' exec -T dedalo tee '))).toEqual([]);
				expect(first.outcome.told.join('\n')).toContain(
					'THE TRIAL STACK HAS NO MEDIA ACCESS CONTROL',
				);
				// C3-48: the browser opens THIS machine's address, never only localhost.
				expect(first.outcome.told.join('\n')).toContain(
					"open http://<this machine's address>/dedalo/ in a browser",
				);
			} else {
				expect(plan.steps).toContain('stack_tls');
				expect(log.filter((line) => line.includes(' exec -T dedalo tee ')).length).toBe(1);
			}
			// (a) idempotent.
			const second = await runHost(host, laterRequest('resume', plan));
			expect(second.outcome.result).toBe('already_complete');
			expect(
				loggedCommands(host.root)
					.slice(log.length)
					.filter((line) => MUTATING.test(line)),
			).toEqual([]);
		});
	}
});

// ── (d) the image and the System check ───────────────────────────────────────

describe('the image is verified; the System check refuses before anything changes (d)', () => {
	test('an official image: cosign over its ONE digest, with the bundled identity', async () => {
		const host = machine(TRIAL);
		expect((await runHost(host, fresh(TRIAL).request)).outcome.result).toBe('complete');
		const { signing } = loadImageRegistries();
		expect(loggedCommands(host.root).filter((line) => line.startsWith(COSIGN))).toEqual([
			`${COSIGN} verify --certificate-identity-regexp ${signing.identity_regexp} --certificate-oidc-issuer ${signing.issuer} ${FIRST}@${IMAGE_DIGEST}`,
		]);
	});

	test('a re-pointed tag (the label is another version): refused at stack_image', async () => {
		const host = machine(TRIAL, {
			responses: [
				{ match: `${DOCKER} image inspect --format {{index .Config.Labels`, stdout: '6.9.0\n' },
			],
		});
		const { outcome } = await runHost(host, fresh(TRIAL).request);
		expect(outcome.failedStep).toBe('stack_image');
		expect(outcome.message).toContain("declares version '6.9.0'");
		expect(loggedCommands(host.root).filter((line) => line.includes('--request-stdin'))).toEqual(
			[],
		);
	});

	const refusals: {
		name: string;
		raw: Record<string, unknown>;
		options: Parameters<typeof machine>[1];
		sentence: string;
	}[] = [
		{
			name: 'no Docker (told, never installed)',
			raw: TRIAL,
			options: { docker: false },
			sentence: 'Docker is not installed',
		},
		{
			name: 'an official image without cosign',
			raw: TRIAL,
			options: { cosign: false },
			sentence: 'cosign is not installed',
		},
		{
			name: 'an operator `id` cannot name',
			raw: TRIAL,
			options: { responses: [{ match: '/usr/bin/id -un', stdout: '' }] },
			sentence: 'the operator cannot be identified',
		},
		{
			// Campaign 3c D2: found at stack_up, after the image was built.
			name: 'a published port another program already listens on',
			raw: TRIAL,
			options: {
				ss: true,
				responses: [
					{
						match: '/usr/bin/ss -ltnpH',
						stdout: 'LISTEN 0 5 0.0.0.0:80 0.0.0.0:* users:(("python3",pid=9,fd=3))\n',
					},
				],
			},
			sentence: 'port 80 is already in use by python3',
		},
		{
			name: 'an instance already on this machine (its private volume)',
			raw: TRIAL,
			options: {
				responses: [{ match: `${DOCKER} volume ls --format`, stdout: 'dedalo_private\n' }],
			},
			sentence: 'this machine already has a Dédalo instance (volume dedalo_private)',
		},
	];
	test("an image version that is not the installer's is refused by the plan itself — the Image field, before any run (campaign 3c D2)", () => {
		const plan = buildInstallPlan(
			{ ...TRIAL, image_version: '6.9.0' },
			{ rootPassword: ROOT_PASSWORD, requireRootPassword: true },
		);
		expect(plan.errors.join('\n')).toContain("image version 6.9.0 is not this installer's");
	});

	for (const refusal of refusals) {
		test(`refused at the System check: ${refusal.name}`, async () => {
			const host = machine(refusal.raw, refusal.options);
			const { outcome } = await runHost(host, fresh(refusal.raw).request);
			expect(outcome.result).toBe('refused'); // C3-23: refused before any record
			expect(outcome.failedStep).toBeNull();
			expect(outcome.hint).toEqual([]);
			expect(outcome.message).toContain(refusal.sentence);
			expect(loggedCommands(host.root).filter((line) => MUTATING.test(line))).toEqual([]);
			expect(
				loggedCommands(host.root).filter((line) =>
					/get\.docker\.com|apt-get install|dnf install/.test(line),
				),
			).toEqual([]);
		});
	}
});

describe('the Review asks the run’s own preflight before `yes` — the CLI’s hook (campaign 3c D2 wiring)', () => {
	/** review.ts reviewPreflightRefusals — what scripts/install.ts hands the session as preflightRefusals. */
	async function reviewRefusals(host: ScratchHost, plan: ReturnType<typeof fresh>['plan']) {
		const marker = join(host.root, SCRATCH_DIR);
		return reviewPreflightRefusals(plan, {
			runner: scratchRunner(marker),
			fs: hostFs(host.root, join(marker, 'owners.json')),
			source: host.source,
			skipPrivilegeCheck: true,
			sleep: async () => {},
		});
	}
	const HELD_80 = {
		ss: true,
		responses: [
			{
				match: '/usr/bin/ss -ltnpH',
				stdout: 'LISTEN 0 5 0.0.0.0:80 0.0.0.0:* users:(("python3",pid=9,fd=3))\n',
			},
		],
	};

	test('a held port is an error of the plan the Review holds; a free one and a plan with no host step are not', async () => {
		const held = machine(TRIAL, HELD_80);
		expect((await reviewRefusals(held, fresh(TRIAL).plan)).join('\n')).toContain(
			'port 80 is already in use by python3',
		);
		expect(loggedCommands(held.root).filter((line) => MUTATING.test(line))).toEqual([]);
		// CONTROL: nothing held — nothing refused.
		expect(await reviewRefusals(machine(TRIAL, { ss: true }), fresh(TRIAL).plan)).toEqual([]);
		// The delegated engine child runs no host step here: never asked.
		const child = machine(TRIAL, HELD_80);
		const childPlan = buildInstallPlan({ ...TRIAL, engine_only: true });
		expect(await reviewRefusals(child, childPlan)).toEqual([]);
		expect(loggedCommands(child.root)).toEqual([]);
	});
});

// An operator absent from /etc/passwd is the NORMAL case on macOS (Directory
// Services) and for an LDAP/SSSD account: the identity comes from `id`, so the
// route the docs promise on a Mac is not refused by a file it never needed.
test('an operator not listed in /etc/passwd (macOS, LDAP): the install completes', async () => {
	const host = machine(TRIAL);
	writeFileSync(join(host.root, 'etc/passwd'), 'root:x:0:0:root:/root:/bin/sh\n');
	const { outcome } = await runHost(host, fresh(TRIAL).request);
	expect(outcome.message).toBeNull();
	expect(outcome.result).toBe('complete');
});

// ── (f) abort ────────────────────────────────────────────────────────────────

describe('abort removes only what this install created (f)', () => {
	test('a failed engine: no volume removed without --confirm-database; with it, only the created ones', async () => {
		const compose = composePrefix('trial');
		const host = machine(TRIAL, {
			responses: [
				{
					match: `${compose} run --rm --name dedalo-install-engine -T dedalo bun run scripts/install.ts --request-stdin`,
					exit: 9,
				},
				{
					match: `${compose} run --rm -T --no-deps dedalo bun run scripts/install.ts --status --json`,
					after: `${compose} run --rm --name dedalo-install-engine -T dedalo bun run scripts/install.ts --request-stdin`,
					until: `${compose} run --rm --name dedalo-install-engine -T dedalo bun run scripts/install.ts --abort`,
					stdout:
						'{"exists":true,"outcome":"in_progress","failed_step":"install_db_from_default_file"}\n',
				},
			],
		});
		const { plan, request } = fresh(TRIAL);
		const failed = await runHost(host, request);
		expect(failed.outcome.failedStep).toBe('stack_engine');
		const beforeRefusal = loggedCommands(host.root).length;
		const refused = await runHost(host, laterRequest('abort', plan));
		expect(refused.outcome.result).not.toBe('aborted');
		expect(refused.outcome.message).toContain('--confirm-database dedalo');
		expect(
			loggedCommands(host.root).filter((line) => line.startsWith(`${DOCKER} volume rm`)),
		).toEqual([]);
		// Checked BEFORE anything is undone: no engine --abort inside the container (it would
		// reset the database on the operator's behalf), the stack not taken down.
		expect(
			loggedCommands(host.root)
				.slice(beforeRefusal)
				.filter((line) => / --abort| down /.test(line)),
		).toEqual([]);
		const aborted = await runHost(host, laterRequest('abort', plan, 'dedalo'));
		expect(aborted.outcome.message).toBeNull();
		expect(aborted.outcome.result).toBe('aborted');
		const removed = loggedCommands(host.root).filter((line) =>
			line.startsWith(`${DOCKER} volume rm`),
		);
		expect(removed.length).toBe(1);
		// The child's own gate got the OPERATOR's confirmation (never the plan's name on their behalf).
		expect(
			loggedCommands(host.root).filter((line) =>
				line.includes(
					'install.ts --abort --confirm-database dedalo --request-stdin --events-jsonl',
				),
			).length,
		).toBe(1);
		expect(removed[0]).toContain('dedalo_pgdata');
		expect(removed[0]).not.toContain('dedalo_unrelated');
		// The images stay, and the abort says which (C3-52).
		const said = aborted.transcript.lines.join('\n');
		for (const image of ['postgres:18', 'nginx:alpine', 'docker image rm'])
			expect(said).toContain(image);
		const fs = hostFs(host.root);
		expect(fs.exists(join(REPO_ROOT, '.dedalo.env'))).toBe(false);
		expect(fs.exists(join(REPO_ROOT, 'compose.override.yaml'))).toBe(false);
	});
});

// ── (g) campaign 3: what the stack steps must not hide ───────────────────────

/** The state file of the scratch host's run (null once an abort removed it). */
function stateOf(host: ScratchHost): InstallState | null {
	return readStateFile(join(host.root, REPO_ROOT, '.dedalo-install'));
}

describe('stack_up proves nginx stayed up (C3-8)', () => {
	test('a restarting nginx fails stack_up with its [emerg] line, and stack_up is not recorded done', async () => {
		const compose = composePrefix('docker');
		const emerg =
			'nginx: [emerg] open() "/etc/nginx/dedalo/docker/media_protection.conf" failed (2: No such file or directory)';
		const host = machine(DOCKER_LE, {
			responses: [
				{
					match: `${DOCKER} inspect --format {{.State.Status}} {{.RestartCount}}`,
					stdout: 'restarting 4\n',
				},
				{ match: `${compose} exec -T nginx nginx -t`, exit: 1, stderr: emerg },
				{
					match: `${compose} logs --no-color --tail 5 nginx`,
					stdout: `nginx-1  | 2026/10/13 [notice] 1#1: using the "epoll" event method\nnginx-1  | ${emerg}\nnginx-1  | done\n`,
				},
			],
		});
		const { outcome } = await runHost(host, fresh(DOCKER_LE).request);
		expect(outcome.failedStep).toBe('stack_up');
		expect(outcome.message).toContain('nginx did not stay up (restarting 4)');
		expect(outcome.message).toContain(emerg);
		expect(stateOf(host)?.steps.stack_up?.status).toBe('failed');
		expect(stateOf(host)?.steps.stack_health?.status).toBe('pending');
	});

	test('positive control: a running nginx whose config passes completes the install', async () => {
		const host = machine(DOCKER_LE);
		const { outcome } = await runHost(host, fresh(DOCKER_LE).request);
		expect(outcome.result).toBe('complete');
		const log = loggedCommands(host.root);
		expect(log.filter((line) => line.endsWith(' exec -T nginx nginx -t')).length).toBeGreaterThan(
			0,
		);
	});
});

describe('an abort of a live stack keeps PostgreSQL up; --resume puts the rest back (C3-10)', () => {
	test('abort undoes stack_up with `rm --stop --force` of its own services, never `down`; resume completes', async () => {
		const compose = composePrefix('trial');
		const host = machine(TRIAL, {
			// The effect of a `down`: PostgreSQL no longer answers (a resume's verify sees it).
			responses: [
				{ match: `${compose} exec -T postgres pg_isready`, after: `${compose} down`, exit: 1 },
			],
		});
		const { plan, request } = fresh(TRIAL);
		expect((await runHost(host, request)).outcome.result).toBe('complete');
		const before = loggedCommands(host.root).length;
		const aborted = await runHost(host, laterRequest('abort', plan));
		expect(aborted.outcome.message).toBeNull();
		const undone = loggedCommands(host.root).slice(before);
		expect(undone).toContain(`${compose} rm --stop --force dedalo nginx backup`);
		expect(undone.filter((line) => line.startsWith(`${compose} down`)).length).toBe(0);
		expect(stateOf(host)?.steps.stack_database?.status).toBe('done');
		const resumed = await runHost(host, laterRequest('resume', plan));
		expect(resumed.outcome.message).toBeNull();
		expect(resumed.outcome.result).toBe('complete');
	});

	test("the Let's Encrypt stack also removes its certbot; the database undo names the images it keeps (C3-52)", async () => {
		const compose = composePrefix('docker');
		const host = machine(DOCKER_LE);
		const { plan, request } = fresh(DOCKER_LE);
		expect((await runHost(host, request)).outcome.result).toBe('complete');
		const aborted = await runHost(host, laterRequest('abort', plan));
		expect(loggedCommands(host.root)).toContain(
			`${compose} rm --stop --force dedalo nginx backup certbot`,
		);
		const ctx = stackPlanCtx(DOCKER_LE);
		expect(stackImages(ctx)).toContain('certbot/certbot');
		// Every image was pulled on this machine: the served abort names them all (but postgres's rm).
		const kept = aborted.transcript.lines.join('\n');
		for (const image of [
			'postgres:18',
			'nginx:alpine',
			'certbot/certbot',
			imageRefOf(ctx.answers),
		]) {
			expect(kept).toContain(image);
		}
	});
});

/**
 * SERVED IS MEASURED on the stack route too (campaign 3c D1): stack_up's intent once
 * recorded `served` BEFORE the engine started, so a run that died before the dedalo
 * container ever ran was kept by --abort as a live instance. The start fails here the
 * same way: issued, never taken — or "failed" with the container started after all.
 */
describe('stack served = the engine container ever started or the engine answered, never "the start was issued" (campaign 3c D1)', () => {
	const compose = composePrefix('trial');
	const startFails = (started: boolean): RecordedResponse[] => [
		{ match: `${compose} up -d dedalo`, exit: 1, stderr: 'context canceled' },
		// the engine never answered (the scratch default answers 200 once `up -d dedalo` was logged)
		{ match: `${compose} exec -T dedalo curl`, exit: 7, stdout: '000' },
		...(started
			? [
					{ match: `${compose} ps --all --quiet dedalo`, stdout: 'scratch-dedalo-id\n' },
					{
						match: `${DOCKER} inspect --format {{.State.StartedAt}} scratch-dedalo-id`,
						stdout: '2026-10-14T09:12:31.48Z\n',
					},
				]
			: []),
	];

	test('the start issued, the engine container never ran: the hint offers the full undo, and --abort removes the instance whole (database included)', async () => {
		const host = machine(TRIAL, { responses: startFails(false) });
		const { plan, request } = fresh(TRIAL);
		const failed = await runHost(host, request);
		expect(failed.outcome.failedStep).toBe('stack_up');
		expect(failed.outcome.hint.join('\n')).toContain('--abort --confirm-database dedalo');
		expect(failed.outcome.hint.join('\n')).not.toContain('has served');
		const aborted = await runHost(host, laterRequest('abort', plan, 'dedalo'));
		expect(aborted.outcome.message).toBeNull();
		expect(aborted.outcome.keptLive).toBe(false);
		expect(aborted.outcome.undone).toContain('stack_engine');
		expect(aborted.outcome.undone).toContain('stack_database');
		expect(aborted.transcript.lines.join('\n')).not.toContain('has served');
		expect(
			loggedCommands(host.root).filter((line) => line.startsWith(`${DOCKER} volume rm`)),
		).toEqual([expect.stringContaining('dedalo_pgdata')]);
		expect(stateOf(host)).toBeNull();
	});

	test('CONTROL — `up -d dedalo` "failed" but the container started: served, measured; the abort keeps the instance', async () => {
		const host = machine(TRIAL, { responses: startFails(true) });
		const { plan, request } = fresh(TRIAL);
		const failed = await runHost(host, request);
		expect(failed.outcome.failedStep).toBe('stack_up');
		expect(failed.outcome.hint.join('\n')).toContain(
			'the instance has served: its containers, volumes (the database) and files are kept',
		);
		const aborted = await runHost(host, laterRequest('abort', plan));
		expect(aborted.outcome.message).toBeNull();
		expect(aborted.outcome.keptLive).toBe(true);
		expect(aborted.outcome.undone).toEqual(['stack_up']);
		expect(
			loggedCommands(host.root).filter((line) => line.startsWith(`${DOCKER} volume rm`)),
		).toEqual([]);
		// Measured once, recorded: the record says served from now on.
		expect(stateOf(host)?.created.host?.served).toBe(true);
	});

	test("State.StartedAt: Docker's zero time = never started, a time = started, unreadable = unknown (kept as served)", () => {
		expect(containerEverStarted('0001-01-01T00:00:00Z\n')).toBe(false);
		expect(containerEverStarted('2026-10-14T09:12:31.48Z\n')).toBe(true);
		expect(containerEverStarted('')).toBeNull();
	});
});

/**
 * CAMPAIGN 3e (2026-10-14 VM re-test). E4: an UNSERVED abort (stopped before the
 * engine's container was ever created) said it "stopped and removed dedalo,
 * nginx, backup" — none existed — and named nginx:alpine, never pulled, in its
 * `docker image rm` (which then failed). The undo names what it MEASURED.
 * E3: once the engine steps generated the salt, the ✖ block names its read
 * command (a Ctrl-C leaves the full screen, where the salt was shown) — never
 * the value; and the command works with the stack down (`run --rm --no-deps`).
 */
describe('campaign 3e: an abort names only what exists; a failure block names the salt read command', () => {
	const compose = composePrefix('trial');
	/** `up -d dedalo` killed before it created anything; nginx:alpine never pulled. */
	const neverCreated: RecordedResponse[] = [
		{ match: `${compose} up -d dedalo`, exit: 1, stderr: 'context canceled' },
		{ match: `${compose} exec -T dedalo curl`, exit: 7, stdout: '000' },
		{ match: `${compose} ps --all --services`, stdout: 'postgres\n' },
		{ match: `${DOCKER} image inspect --format {{.Id}} nginx:alpine`, exit: 1 },
	];

	test('E4 unserved: no container named that never existed, no image named that is not here', async () => {
		const host = machine(TRIAL, { responses: neverCreated });
		const { plan, request } = fresh(TRIAL);
		expect((await runHost(host, request)).outcome.failedStep).toBe('stack_up');
		const aborted = await runHost(host, laterRequest('abort', plan, 'dedalo'));
		expect(aborted.outcome.message).toBeNull();
		const said = aborted.transcript.lines.join('\n');
		expect(said).toContain('no container of dedalo, nginx, backup was ever created');
		expect(said).not.toContain('stopped and removed');
		expect(timesLogged(host, `${compose} rm --stop --force`)).toBe(0);
		const rm = said.split('\n').find((line) => line.includes('docker image rm')) ?? '';
		expect(rm).toContain('postgres:18');
		expect(rm).not.toContain('nginx:alpine');
	});

	test('E4 CONTROL: a completed (served) stack aborts naming the containers and images that are there', async () => {
		const host = machine(TRIAL);
		const { plan, request } = fresh(TRIAL);
		expect((await runHost(host, request)).outcome.result).toBe('complete');
		const said = (await runHost(host, laterRequest('abort', plan))).transcript.lines.join('\n');
		expect(said).toContain('stopped and removed dedalo, nginx, backup');
		expect(said).toContain('docker image rm');
		expect(said).toContain('nginx:alpine');
	});

	test('E3: past the engine steps the ✖ hint names the salt read command (never the value); before them it does not', async () => {
		const host = machine(TRIAL, { responses: neverCreated });
		const { request } = fresh(TRIAL);
		const failed = await runHost(host, request);
		expect(failed.outcome.failedStep).toBe('stack_up');
		const hint = failed.outcome.hint.join('\n');
		const command = stackSaltCommand(stackPlanCtx(TRIAL));
		expect(command).toContain('run --rm --no-deps dedalo grep');
		expect(hint).toContain(`read it with: ${command}`);
		expect(hint).not.toContain('scratch-stack-salt');
		// CONTROL: a failure before the engine steps ran says nothing of a salt.
		const early = machine(TRIAL, {
			responses: [{ match: `${compose} up -d postgres`, exit: 1, stderr: 'no space' }],
		});
		const before = await runHost(early, fresh(TRIAL).request);
		expect(before.outcome.failedStep).toBe('stack_database');
		expect(before.outcome.hint.join('\n')).not.toContain('DEDALO_SALT_STRING');
	});
});

/** Prepend responses to a scratch machine's table (first match wins): the world changed since. */
function prependResponses(host: ScratchHost, extra: readonly RecordedResponse[]): void {
	const path = join(host.root, SCRATCH_DIR, 'responses.json');
	const current = JSON.parse(readFileSync(path, 'utf8')) as RecordedResponse[];
	writeFileSync(path, JSON.stringify([...extra, ...current]));
}

/** How many times a logged command started with `prefix`. */
function timesLogged(host: ScratchHost, prefix: string): number {
	return loggedCommands(host.root).filter((line) => line.startsWith(prefix)).length;
}

describe('a resume RE-RUNS a restartable step whose outcome is gone (C3-8/C3-10)', () => {
	test('the whole stack stopped after it completed (a reboot, `compose stop`): --resume starts PostgreSQL and the stack again — never "changed outside the installer"', async () => {
		const compose = composePrefix('trial');
		const host = machine(TRIAL);
		const { plan, request } = fresh(TRIAL);
		expect((await runHost(host, request)).outcome.result).toBe('complete');
		const pg = `${compose} exec -T postgres pg_isready`;
		const running = `${compose} ps --services --status running`;
		const [pgSeen, runningSeen] = [timesLogged(host, pg), timesLogged(host, running)];
		const upsBefore = timesLogged(host, `${compose} up -d`);
		// Stopped: the NEXT probe of each finds nothing running; once started again, everything is.
		prependResponses(host, [
			{ match: pg, afterCount: pgSeen + 1 },
			{ match: pg, afterCount: pgSeen, exit: 1 },
			{ match: running, afterCount: runningSeen + 1, stdout: 'postgres\ndedalo\nnginx\n' },
			{ match: running, afterCount: runningSeen, stdout: '' },
		]);
		const resumed = await runHost(host, laterRequest('resume', plan));
		expect(resumed.outcome.message).toBeNull();
		expect(resumed.outcome.result).toBe('complete');
		// It STARTED them again: `up -d postgres` (stack_database) and the stack (stack_up).
		expect(timesLogged(host, `${compose} up -d`) - upsBefore).toBeGreaterThanOrEqual(3);
		const said = resumed.transcript.lines.join('\n');
		expect(said).toContain('PostgreSQL does not accept connections — started again');
		expect(said).not.toContain('changed it outside the installer');
	});

	test('a step that is NOT restartable stays drift — refused with the data consequence of --abort spelled out', async () => {
		const host = machine(TRIAL);
		const { plan, request } = fresh(TRIAL);
		expect((await runHost(host, request)).outcome.result).toBe('complete');
		// The env file the install wrote, gone (removed by hand).
		rmSync(join(host.root, REPO_ROOT, '.dedalo.env'), { force: true });
		const resumed = await runHost(host, laterRequest('resume', plan));
		expect(resumed.outcome.result).toBe('failed');
		expect(resumed.outcome.message).toContain('recorded done but its outcome is missing');
		expect(resumed.outcome.message).toContain('put that back, then --resume');
		// Never "start again" without what --abort does to the data (C3-8/C3-10).
		expect(resumed.outcome.message).toContain('DELETES the database this install created');
		expect(resumed.outcome.message).toContain(
			'an instance that has already served keeps its database',
		);
	});

	test('a live trial aborted twice: the second abort undoes nothing and says the instance is kept and how it is removed by hand', async () => {
		const host = machine(TRIAL);
		const { plan, request } = fresh(TRIAL);
		expect((await runHost(host, request)).outcome.result).toBe('complete');
		const first = await runHost(host, laterRequest('abort', plan));
		expect(first.outcome.keptLive).toBe(true);
		expect(first.outcome.undone).toEqual(['stack_up']);
		const second = await runHost(host, laterRequest('abort', plan));
		expect(second.outcome.result).toBe('aborted');
		expect(second.outcome.keptLive).toBe(true);
		expect(second.outcome.undone).toEqual([]);
		// The trial's words, never the production account's (C3-52).
		const warned = second.transcript.lines.join('\n');
		expect(warned).toContain('its containers, volumes (the database) and files are kept');
		expect(warned).not.toContain('its user, database and code');
		// And the record still resumes to complete.
		expect((await runHost(host, laterRequest('resume', plan))).outcome.result).toBe('complete');
	});
});

describe('nginx publishes its ports, or stack_up fails; a resume recreates it (campaign 3b N2)', () => {
	test('nginx Up with NO published port (a container whose start failed, reused): stack_up fails naming the ports, never "the stack is up"', async () => {
		const host = machine(DOCKER_LE, {
			responses: [{ match: `${DOCKER} port scratch-nginx-id`, stdout: '' }],
		});
		const { outcome } = await runHost(host, fresh(DOCKER_LE).request);
		expect(outcome.failedStep).toBe('stack_up');
		expect(outcome.message).toContain('nginx is running but publishes no port for 443/tcp, 80/tcp');
		expect(stateOf(host)?.steps.stack_up?.status).toBe('failed');
	});

	test('a resume after stack_up failed to bind a port removes the never-started nginx BEFORE `up -d` creates it again', async () => {
		const compose = composePrefix('docker');
		const up = `${compose} up -d`;
		const host = machine(DOCKER_LE, {
			responses: [
				// `up -d postgres`, `up -d dedalo`, then the whole stack: the third fails, later ones pass.
				{ match: up, afterCount: 3 },
				{
					match: up,
					afterCount: 2,
					exit: 1,
					stderr:
						'Error response from daemon: failed to bind host port 0.0.0.0:443/tcp: address already in use',
				},
				// Docker's behaviour: the container whose start failed is "Up" with NO port bound
				// (the resume's verify sees that); the recreated one binds them.
				{
					match: `${DOCKER} port scratch-nginx-id`,
					afterCount: 1,
					stdout: '443/tcp -> 0.0.0.0:443\n80/tcp -> 0.0.0.0:80\n',
				},
				{ match: `${DOCKER} port scratch-nginx-id`, stdout: '' },
			],
		});
		const { plan, request } = fresh(DOCKER_LE);
		const first = await runHost(host, request);
		expect(first.outcome.failedStep).toBe('stack_up');
		const before = loggedCommands(host.root).length;
		const resumed = await runHost(host, laterRequest('resume', plan));
		expect(resumed.outcome.message).toBeNull();
		expect(resumed.outcome.result).toBe('complete');
		const ran = loggedCommands(host.root).slice(before);
		// Not adopted as landed (its verify saw no port): run again, nginx removed, then created.
		expect(resumed.transcript.lines.join('\n')).not.toContain(
			'verified (completed in an earlier run)',
		);
		const removed = ran.indexOf(`${compose} rm --stop --force nginx`);
		expect(removed).toBeGreaterThanOrEqual(0);
		expect(removed).toBeLessThan(ran.indexOf(up));
	});
});

describe('a resume VERIFIES stack_health; a re-started stack is never reported complete unprobed (campaign 3b N6)', () => {
	const compose = composePrefix('trial');
	const publicProbe =
		'/usr/bin/curl -sS -o /dev/null -w %{http_code} --max-time 20 http://127.0.0.1/health';

	test('abort a live trial, resume with the published address dead: the resume FAILS at stack_health, saying why', async () => {
		const host = machine(TRIAL);
		const { plan, request } = fresh(TRIAL);
		expect((await runHost(host, request)).outcome.result).toBe('complete');
		await runHost(host, laterRequest('abort', plan));
		expect(stateOf(host)?.steps.stack_health?.status).toBe('done');
		prependResponses(host, [
			{
				match: publicProbe,
				stdout: '000',
				exit: 7,
				stderr: 'curl: (7) Failed to connect to 127.0.0.1 port 80',
			},
		]);
		const resumed = await runHost(host, laterRequest('resume', plan));
		expect(resumed.outcome.result).toBe('failed');
		expect(resumed.outcome.failedStep).toBe('stack_health');
		expect(resumed.outcome.message).toContain('nothing answers on that port');
	});

	test('positive control: the same resume with the stack answering completes, and stack_health was PROBED (never only "skipped")', async () => {
		const host = machine(TRIAL);
		const { plan, request } = fresh(TRIAL);
		expect((await runHost(host, request)).outcome.result).toBe('complete');
		await runHost(host, laterRequest('abort', plan));
		const probes = timesLogged(host, publicProbe);
		const resumed = await runHost(host, laterRequest('resume', plan));
		expect(resumed.outcome.result).toBe('complete');
		expect(timesLogged(host, publicProbe)).toBeGreaterThan(probes);
		expect(timesLogged(host, `${compose} up -d`)).toBeGreaterThan(0);
	});

	test('docker: after a served abort the resume runs the SAME probes as a fresh install — the media gate included, never only /health (campaign 3c D24)', async () => {
		const host = machine(DOCKER_LE);
		const { plan, request } = fresh(DOCKER_LE);
		expect((await runHost(host, request)).outcome.result).toBe('complete');
		const gate = (line: string) => line.includes('dd_install_probe_dd0_0.jpg');
		const freshGate = loggedCommands(host.root).filter(gate).length;
		expect(freshGate).toBeGreaterThanOrEqual(3); // write, anonymous probe, remove
		await runHost(host, laterRequest('abort', plan));
		const before = loggedCommands(host.root).length;
		const resumed = await runHost(host, laterRequest('resume', plan));
		expect(resumed.outcome.result).toBe('complete');
		const again = loggedCommands(host.root).slice(before).filter(gate);
		expect(again.length).toBe(freshGate);
		expect(resumed.transcript.lines.join('\n')).toContain(
			'a step before it ran again in this run — checked again',
		);
		// CONTROL: a resume of the complete install re-did nothing — read-only, no probe file.
		const quiet = loggedCommands(host.root).length;
		const idle = await runHost(host, laterRequest('resume', plan));
		expect(idle.outcome.result).toBe('already_complete');
		expect(loggedCommands(host.root).slice(quiet).filter(gate)).toEqual([]);
	});
});

describe('stack_health says why a probe failed (C3-13)', () => {
	test('curl exit 60 through nginx: the sentence names the untrusted chain and how to trust it', async () => {
		const host = machine(DOCKER_LE, {
			responses: [
				{
					match:
						'/usr/bin/curl -sS -o /dev/null -w %{http_code} --max-time 20 --resolve dedalo.example.org:443:127.0.0.1 https://dedalo.example.org/health',
					stdout: '000',
					exit: 60,
					stderr:
						'curl: (60) SSL certificate problem: self-signed certificate in certificate chain',
				},
			],
		});
		const { outcome } = await runHost(host, fresh(DOCKER_LE).request);
		expect(outcome.failedStep).toBe('stack_health');
		expect(outcome.message).toContain(
			'expected 200, got 000 — the certificate chain is not trusted by this host',
		);
		expect(outcome.message).toContain('update-ca-certificates');
		expect(outcome.message).toContain('self-signed certificate in certificate chain');
	});

	test('curlReason: a known exit in words, an unknown one by number, success says nothing', () => {
		const run = (exitCode: number, stderr = '') => ({
			exitCode,
			stderr,
			stdout: '',
			timedOut: false,
		});
		expect(curlReason(run(7))).toContain('nothing answers on that port');
		expect(curlReason(run(99, 'curl: (99) odd'))).toBe('exit 99 (curl: (99) odd)');
		expect(curlReason(run(0))).toBe('');
	});
});

describe("the institution's certificate: this machine must trust its chain (C3-13)", () => {
	const NAME = 'dedalo.example.org';
	const files = (cert: string, key: string, bundle: string | null): HostFiles => {
		const planted: HostFiles = new Map([
			['/etc/ssl/museo/fullchain.pem', cert],
			['/etc/ssl/museo/privkey.pem', key],
		]);
		if (bundle !== null) planted.set('/etc/ssl/certs/ca-certificates.crt', bundle);
		return planted;
	};
	const FILES = {
		route: 'docker',
		entity: 'museo',
		server_name: NAME,
		tls_mode: 'files',
		tls_cert_path: '/etc/ssl/museo/fullchain.pem',
		tls_key_path: '/etc/ssl/museo/privkey.pem',
	};
	const { cert, key } = mintCertificate(NAME);
	const other = mintCertificate('unrelated.example.org').cert;

	test('a self-signed chain this machine does not trust: refused at the System check, naming its issuer', async () => {
		const host = machine(FILES);
		plant(host.root, files(cert, key, other));
		const { outcome } = await runHost(host, fresh(FILES).request);
		expect(outcome.result).toBe('refused'); // C3-23: refused before any record
		expect(outcome.failedStep).toBeNull();
		expect(outcome.hint).toEqual([]);
		expect(outcome.message).toContain(
			`its chain ends at CN=${NAME}, which this machine does not trust`,
		);
		expect(outcome.message).toContain('update-ca-trust');
		expect(loggedCommands(host.root).filter((line) => MUTATING.test(line)).length).toBe(0);
	});

	/** The Review of a stack plan, measured through the scratch seam (as the run would). */
	async function reviewOf(host: ScratchHost, raw: Record<string, unknown>) {
		const previous = process.env.DEDALO_INSTALL_HOST_ROOT;
		process.env.DEDALO_INSTALL_HOST_ROOT = host.root;
		try {
			return await reviewHostCommands(fresh(raw).plan);
		} finally {
			if (previous === undefined) delete process.env.DEDALO_INSTALL_HOST_ROOT;
			else process.env.DEDALO_INSTALL_HOST_ROOT = previous;
		}
	}

	test('the Review lists an untrusted chain under TO DO, BEFORE `yes` — never first at stack_preflight after every answer (campaign 3b N8)', async () => {
		const host = machine(FILES);
		plant(host.root, files(cert, key, other));
		const blocks = await reviewOf(host, FILES);
		const todo = blocks.find((block) => block.step === REVIEW_TODO_STEP);
		expect(todo?.commands.join('\n')).toContain(
			`its chain ends at CN=${NAME}, which this machine does not trust`,
		);
		// positive control: once trusted, nothing to do
		plant(host.root, files(cert, key, `${other}${cert}`));
		const trusted = await reviewOf(host, FILES);
		expect(
			(trusted.find((block) => block.step === REVIEW_TODO_STEP)?.commands ?? []).filter((line) =>
				line.includes('does not trust'),
			),
		).toEqual([]);
	});

	/** hostPlanRefusals — what scripts/install.ts preflightRefusals asks before the Review offers install. */
	async function refusalsOf(host: ScratchHost) {
		const marker = join(host.root, SCRATCH_DIR);
		return hostPlanRefusals(fresh(FILES).request.planFile, {
			runner: scratchRunner(marker),
			fs: hostFs(host.root, join(marker, 'owners.json')),
			source: host.source,
			skipPrivilegeCheck: true,
			sleep: async () => {},
		});
	}

	test('an untrusted chain is an ERROR before `yes` — the Review does not offer install, nothing is lost after it (campaign 3c D2)', async () => {
		const host = machine(FILES);
		plant(host.root, files(cert, key, other));
		const refused = await refusalsOf(host);
		expect(refused.errors.join('\n')).toContain(
			`its chain ends at CN=${NAME}, which this machine does not trust`,
		);
		expect(loggedCommands(host.root).filter((line) => MUTATING.test(line))).toEqual([]);
		// CONTROL: trusted — nothing refused.
		plant(host.root, files(cert, key, `${other}${cert}`));
		expect((await refusalsOf(host)).errors).toEqual([]);
	});

	test('positive control: the same chain once the machine trusts it passes the System check', async () => {
		const host = machine(FILES);
		plant(host.root, files(cert, key, `${other}${cert}`));
		const { outcome } = await runHost(host, fresh(FILES).request);
		expect(outcome.failedStep).not.toBe('stack_preflight');
		expect(stateOf(host)?.steps.stack_preflight?.status).toBe('done');
	});
});

/** The shared builder's argv over this checkout (stack_image of a git checkout — campaign 3b N1). */
function builderArgv(ref: string): string {
	return `/bin/bash ${join(REPO_ROOT, IMAGE_BUILDER)} ${REPO_ROOT} ${ref} ${DOCKER}`;
}

test('a local build shows its steps as they run, before it ends (C3-27)', async () => {
	const BUILD = { ...TRIAL, image_source: 'build' };
	const host = machine(BUILD, {
		responses: [
			{
				match: builderArgv(imageRefOf(stackPlanCtx(BUILD).answers)),
				stderr: [
					'#1 [internal] load build definition from Dockerfile',
					'#5 [2/9] RUN apt-get update && apt-get install -y ffmpeg imagemagick',
					'#5 12.31 Get:1 http://deb.debian.org/debian trixie InRelease',
					'#9 [6/9] RUN bun install --frozen-lockfile',
				].join('\n'),
			},
		],
	});
	const { outcome, transcript } = await runHost(host, fresh(BUILD).request);
	expect(outcome.result).toBe('complete');
	const lines = transcript.lines;
	const step = lines.findIndex((line) => line.includes('#5 [2/9] RUN apt-get update'));
	const done = lines.findIndex((line) => line.includes('— built here from '));
	expect(step).toBeGreaterThanOrEqual(0);
	expect(done).toBeGreaterThan(step);
	expect(lines.some((line) => line.includes('#9 [6/9] RUN bun install'))).toBe(true);
	// The package manager's own chatter is condensed away.
	expect(lines.some((line) => line.includes('Get:1 http://deb.debian.org'))).toBe(false);
	const buildRequest = loggedRequests(host.root).find(
		(entry) => entry.argv.includes('--tag') || entry.argv[1]?.endsWith(IMAGE_BUILDER),
	);
	expect(buildRequest?.env.BUILDKIT_PROGRESS).toBe('plain');
});

describe('an install-time build of a checkout goes through the shared clean-snapshot builder (campaign 3b N1, C3-46)', () => {
	const BUILD = { ...TRIAL, image_source: 'build' };
	const DOCKER_BUILD = { ...DOCKER_LE, image_source: 'build' };
	for (const raw of [BUILD, DOCKER_BUILD]) {
		test(`${raw.route}: the RUN (its facts frozen by the System check) executes deploy/dedalo-image-build.sh over the checkout, never \`docker build\` of the working tree; the Review shows that command`, async () => {
			const host = machine(raw);
			const { outcome } = await runHost(host, fresh(raw).request);
			expect(outcome.message).toBeNull();
			expect(outcome.result).toBe('complete');
			const ref = imageRefOf(stackPlanCtx(raw).answers);
			const log = loggedCommands(host.root);
			expect(log.filter((line) => line === builderArgv(ref))).toHaveLength(1);
			expect(log.filter((line) => line.startsWith(`${DOCKER} build`))).toEqual([]);
			// The frozen facts say so: a resume runs the same builder.
			expect(stateOf(host)?.preflight.host?.facts.sourceIsGit).toBe(true);
			// The Review the operator saw lists exactly that command.
			expect(reviewLines(raw).has(builderArgv(ref))).toBe(true);
		});
	}

	test("the builder stamps the image with its OWN OCI labels (the tag, the commit), never the base image's", () => {
		const lib = join(REPO_ROOT, 'deploy', 'dedalo-image-lib.sh');
		const run = spawnSync(
			'bash',
			[
				'-c',
				`. "${lib}" && dedalo_image_labels "$1" "$2"`,
				'labels',
				REPO_ROOT,
				'localhost/dedalo:7.0.0',
			],
			{ encoding: 'utf8' },
		);
		expect(run.status, run.stderr).toBe(0);
		const head = spawnSync('git', ['-C', REPO_ROOT, 'rev-parse', 'HEAD'], {
			encoding: 'utf8',
		}).stdout.trim();
		const labels = run.stdout.trim().split('\n');
		expect(labels).toContain('org.opencontainers.image.version=7.0.0');
		expect(labels).toContain(`org.opencontainers.image.revision=${head}`);
		// Dédalo's own description, never blank (campaign 3c D6: source/url/description/licenses
		// were written as "" — a blank label hides the base image's, and says nothing).
		const value = (key: string) =>
			labels.find((label) => label.startsWith(`org.opencontainers.image.${key}=`))?.split('=')[1];
		for (const key of ['title', 'source', 'url', 'description', 'licenses', 'created']) {
			expect(value(key) ?? '', key).not.toBe('');
		}
		const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
			license: string;
		};
		expect(value('licenses')).toBe(pkg.license);
		expect(value('source')).toMatch(/^https:\/\//);
		// a tag-less reference declares no version (never a registry port)
		const bare = spawnSync(
			'bash',
			[
				'-c',
				`. "${lib}" && dedalo_image_labels "$1" "$2"`,
				'labels',
				REPO_ROOT,
				'localhost:5000/dedalo',
			],
			{ encoding: 'utf8' },
		);
		expect(bare.stdout.split('\n')).toContain('org.opencontainers.image.version=');
	});
});

describe('the image makes the media root at the tree mode (C3-19: every install and boot warned mode_differs)', () => {
	/** The Dockerfile's base image (its first FROM, digest included). */
	const dockerfile = readFileSync(join(REPO_ROOT, 'Dockerfile'), 'utf8');
	const base = (dockerfile.match(/^FROM (\S+)/m)?.[1] ?? '').split('@')[0] as string;

	/** The RUN instruction that creates /srv/dedalo/media, continuation lines joined — exactly the build's. */
	function mediaRootRun(): string {
		const runs = dockerfile
			.replace(/\\\n/g, ' ')
			.split('\n')
			.filter((line) => line.startsWith('RUN ') && line.includes('/srv/dedalo/media'));
		expect(runs.length).toBe(1);
		return (runs[0] as string).slice(4);
	}

	const dockerReady = (): boolean =>
		spawnSync('docker', ['image', 'inspect', base], { timeout: 20_000 }).status === 0;

	test.skipIf(!dockerReady())(
		`the Dockerfile's own RUN, in its base image (${base}), leaves /srv/dedalo/media at MEDIA_DIR_MODE (skipped without Docker or the image)`,
		() => {
			const run = spawnSync(
				'docker',
				[
					'run',
					'--rm',
					'--user',
					'root',
					'--entrypoint',
					'sh',
					base,
					'-c',
					`${mediaRootRun()} && stat -c %a /srv/dedalo/media`,
				],
				{ timeout: 120_000, encoding: 'utf8' },
			);
			expect(run.status, run.stderr).toBe(0);
			expect(run.stdout.trim().split('\n').at(-1)).toBe(MEDIA_DIR_MODE.toString(8));
		},
		150_000,
	);
});

describe('the engine child’s container never outlives the run, and never races a resume (C3-29)', () => {
	test('an interrupted stack_engine removes the named engine container', async () => {
		const runner = recordingRunner({ responses: () => [] });
		const ctx = {
			...stackPlanCtx(TRIAL),
			runner,
			secrets: {},
			created: emptyHostCreated(),
		} as unknown as HostCtx;
		await (
			STACK_HOST_STEPS.stack_engine.onInterrupt as NonNullable<HostStepDefinition['onInterrupt']>
		)(ctx);
		expect(runner.log.map((entry) => entry.argv.join(' '))).toEqual([
			`${DOCKER} rm -f dedalo-install-engine`,
		]);
	});

	test('a resume while the engine container of an earlier run still runs: refused, no second child started', async () => {
		const compose = composePrefix('trial');
		const run = `${compose} run --rm --name dedalo-install-engine -T dedalo bun run scripts/install.ts --request-stdin`;
		const host = machine(TRIAL, {
			responses: [
				{ match: run, exit: 137 },
				// The orphaned child is still working: its record says in progress.
				{
					match: `${compose} run --rm -T --no-deps dedalo bun run scripts/install.ts --status --json`,
					stdout: '{"exists":true,"outcome":"in_progress","failed_step":null}\n',
				},
				{
					match: `${DOCKER} ps -q --filter name=^/?dedalo-install-engine$`,
					after: run,
					stdout: 'f00dcafe\n',
				},
			],
		});
		const { plan, request } = fresh(TRIAL);
		expect((await runHost(host, request)).outcome.failedStep).toBe('stack_engine');
		const children = timesLogged(host, run);
		const resumed = await runHost(host, laterRequest('resume', plan));
		expect(resumed.outcome.result).toBe('failed');
		expect(resumed.outcome.message).toContain(
			'the engine steps of an earlier run are still running (container dedalo-install-engine',
		);
		expect(timesLogged(host, run)).toBe(children);
	});
});

describe('a served abort says how the stack is removed, per route, and names the images it keeps (campaign 3b N16, N32, C3-52)', () => {
	for (const raw of [TRIAL, DOCKER_LE]) {
		test(`${raw.route}: the stack_up undo names the route's removal section and the kept images; never an undo that cannot come`, async () => {
			const host = machine(raw);
			const { plan, request } = fresh(raw);
			expect((await runHost(host, request)).outcome.result).toBe('complete');
			const aborted = await runHost(host, laterRequest('abort', plan));
			expect(aborted.outcome.keptLive).toBe(true);
			const said = aborted.transcript.lines.join('\n');
			const doc =
				raw.route === 'docker'
					? 'docs/install/docker.md#removing-the-stack'
					: 'docs/install/quickstart.md#removing-the-trial';
			expect(said).toContain(doc);
			expect(said).toContain(`docker image rm ${imageRefOf(stackPlanCtx(raw).answers)}`);
			// campaign 3c D8: PostgreSQL keeps running on its image — the command never names it.
			const rm = said.match(/docker image rm [^;\n]*/g) ?? [];
			expect(rm.length).toBeGreaterThan(0);
			for (const command of rm) expect(command).not.toContain('postgres:18');
			expect(said).toContain('postgres:18 runs the kept database');
			expect(said).not.toContain("the database step's undo");
			// the closing sentence points to the same section
			expect(
				DONE_TEXT.abortedFor({
					route: raw.route,
					instance: 'x',
					keptLive: true,
					undone: ['stack_up'],
				}),
			).toContain(doc);
		});
	}

	test('the sections those sentences name exist, and say how to reclaim the images and caches (N31)', () => {
		const docker = readFileSync(join(REPO_ROOT, 'docs/install/docker.md'), 'utf8');
		const trial = readFileSync(join(REPO_ROOT, 'docs/install/quickstart.md'), 'utf8');
		const section = (text: string, heading: string) => {
			const start = text.indexOf(`\n## ${heading}\n`);
			expect(start, heading).toBeGreaterThan(0);
			const next = text.indexOf('\n## ', start + 4);
			return text.slice(start, next === -1 ? undefined : next);
		};
		for (const removal of [
			section(docker, 'Removing the stack'),
			section(trial, 'Removing the trial'),
		]) {
			expect(removal).toContain('down -v');
			expect(removal).toContain('docker image rm');
			expect(removal).toContain('docker builder prune');
			expect(removal).toContain('~/.cache/dedalo-install');
			// campaign 3c D7: the bootstrap's `bun install` left 408 MB in the checkout.
			expect(removal).toContain('rm -rf node_modules');
		}
	});

	test('each page quotes the command the closing To-do prints to read the salt back (campaign 3c D3)', () => {
		for (const [raw, page] of [
			[DOCKER_LE, 'docs/install/docker.md'],
			[TRIAL, 'docs/install/quickstart.md'],
		] as const) {
			const text = readFileSync(join(REPO_ROOT, page), 'utf8');
			expect(text, page).toContain(stackSaltCommand(stackPlanCtx(raw)));
			expect(text, page).toContain('a later `--resume` does not show it again');
		}
	});

	test('installer_reference: --image-version is asked for a local build too (campaign 3c D2, its row :145)', () => {
		const text = readFileSync(join(REPO_ROOT, 'docs/install/installer_reference.md'), 'utf8');
		const row = text.split('\n').find((line) => line.startsWith('| `--image-version`'));
		expect(row ?? '').toContain('with `build` the tag the local build gets');
		expect(row ?? '').toContain('refused where it is typed');
	});
});

test('ONE build-duration estimate: the screen, the Review and the docs say BUILD_DURATION (campaign 3b N11)', () => {
	const ctx = stackPlanCtx({ ...TRIAL, image_source: 'build' });
	const [build] = imageCommands(ctx);
	expect(build?.label).toContain(BUILD_DURATION);
	for (const doc of [
		'docs/install/quickstart.md',
		'docs/install/docker.md',
		'docs/install/installer_reference.md',
	]) {
		const text = readFileSync(join(REPO_ROOT, doc), 'utf8');
		expect(text, doc).toContain(BUILD_DURATION);
		expect(text, doc).not.toMatch(/15 or more on 2 CPUs|10 to 20 minutes/);
	}
});

test('the stack routes never claim the firewall is checked; the docs document the Image version field (campaign 3b N38, N14)', () => {
	expect(NOTICE_TEXT.stackCommands).toContain('The firewall is neither changed nor checked');
	expect(NOTICE_TEXT.stackCommands).not.toMatch(/firewall[^.]*only checked/);
	for (const doc of ['docs/install/quickstart.md', 'docs/install/docker.md']) {
		const text = readFileSync(join(REPO_ROOT, doc), 'utf8');
		expect(text, doc).toContain('**Image version** is the image tag');
		expect(text, doc).not.toContain("Its version is always the installer's own");
	}
});

describe('a Ctrl-C that kills the engine child is ONE interruption; an abort run is closed (campaign 3b N12, N30)', () => {
	test('the child exits 130 of the same SIGINT: one "interrupted" block, exit 130, the run recorded interrupted', async () => {
		const compose = composePrefix('trial');
		const child = `${compose} run --rm --name dedalo-install-engine -T dedalo bun run scripts/install.ts --request-stdin`;
		const host = machine(TRIAL, { responses: [{ match: child, exit: 130 }] });
		// Ctrl-C reaches the process group: the child dies (130) AND the installer gets SIGINT.
		const wrapRunner = (inner: CommandRunner): CommandRunner => ({
			run: async (request) => {
				const result = await inner.run(request);
				if (request.argv.join(' ').startsWith(child)) process.emit('SIGINT');
				return result;
			},
		});
		class Exited extends Error {}
		const exits: number[] = [];
		const exit = spyOn(process, 'exit').mockImplementation(((code?: number) => {
			exits.push(code ?? 0);
			throw new Exited(`exit ${code}`);
		}) as never);
		const transcript = { lines: [] as string[], told: [] as string[], shown: [] as string[] };
		let settled: unknown = null;
		try {
			settled = await runHost(host, fresh(TRIAL).request, { wrapRunner, transcript });
		} catch (error) {
			settled = error;
		} finally {
			exit.mockRestore();
		}
		expect(settled).toBeInstanceOf(Exited);
		expect(exits).toEqual([130]);
		const said = transcript.lines.join('\n');
		expect(said.match(/install interrupted \(SIGINT\) at step \[stack_engine\]/g)?.length).toBe(1);
		expect(said).not.toContain('install failed');
		expect(stateOf(host)?.runs.at(-1)?.result).toBe('interrupted');
	});

	test('a live abort ends its run record: result aborted, finished_at set', async () => {
		const host = machine(TRIAL);
		const { plan, request } = fresh(TRIAL);
		expect((await runHost(host, request)).outcome.result).toBe('complete');
		const aborted = await runHost(host, laterRequest('abort', plan));
		expect(aborted.outcome.keptLive).toBe(true);
		const last = stateOf(host)?.runs.at(-1);
		expect(last?.mode).toBe('abort');
		expect(last?.result).toBe('aborted');
		expect(last?.finished_at).not.toBeNull();
	});
});
