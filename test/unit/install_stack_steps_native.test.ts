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

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { hostFs } from '../../src/core/install/host/fs.ts';
import type { RecordedResponse } from '../../src/core/install/host/runner.ts';
import { imageVersionOf, officialRepositories } from '../../src/core/install/host/stack/layout.ts';
import { STACK_HOST_STEPS } from '../../src/core/install/host/stack/table.ts';
import { buildInstallPlan, type StackHostStepId } from '../../src/core/install/install_plan.ts';
import { buildPlanFile } from '../../src/core/install/run_files_core.ts';
import { loadImageRegistries } from '../../src/core/update/image_registries.ts';
import {
	COSIGN,
	composePrefix,
	DOCKER,
	IMAGE_DIGEST,
	laterRequest,
	loggedCommands,
	loggedRequests,
	REPO_ROOT,
	ROOT_PASSWORD,
	runHost,
	SCRATCH_DIR,
	type ScratchHost,
	SECRETS,
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
	options: { docker?: boolean; cosign?: boolean; responses?: readonly RecordedResponse[] } = {},
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
	`^${DOCKER} (pull|build|run --rm -p|volume rm|compose .* (up|down|run --rm -T dedalo bun run scripts/install.ts --request-stdin|exec -T dedalo (mkdir|tee|rm)))`,
);

/** Every file under `dir`, as text. */
function allFiles(dir: string): { path: string; text: string }[] {
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => {
			const path = join(entry.parentPath, entry.name);
			return { path, text: readFileSync(path, 'utf8') };
		});
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
				`${composePrefix(raw.route as 'docker' | 'trial')} run --rm -T dedalo bun run scripts/install.ts --request-stdin --execute --events-jsonl`,
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
			name: "an image version that is not the installer's",
			raw: { ...TRIAL, image_version: '6.9.0' },
			options: {},
			sentence: "image version 6.9.0 is not this installer's",
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
	for (const refusal of refusals) {
		test(`refused at the System check: ${refusal.name}`, async () => {
			const host = machine(refusal.raw, refusal.options);
			const { outcome } = await runHost(host, fresh(refusal.raw).request);
			expect(outcome.failedStep).toBe('stack_preflight');
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

// ── (f) abort ────────────────────────────────────────────────────────────────

describe('abort removes only what this install created (f)', () => {
	test('a failed engine: no volume removed without --confirm-database; with it, only the created ones', async () => {
		const compose = composePrefix('trial');
		const host = machine(TRIAL, {
			responses: [
				{
					match: `${compose} run --rm -T dedalo bun run scripts/install.ts --request-stdin`,
					exit: 9,
				},
				{
					match: `${compose} run --rm -T --no-deps dedalo bun run scripts/install.ts --status --json`,
					after: `${compose} run --rm -T dedalo bun run scripts/install.ts --request-stdin`,
					until: `${compose} run --rm -T dedalo bun run scripts/install.ts --abort`,
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
				line.includes('install.ts --abort --confirm-database dedalo --request-stdin'),
			).length,
		).toBe(1);
		expect(removed[0]).toContain('dedalo_pgdata');
		expect(removed[0]).not.toContain('dedalo_unrelated');
		const fs = hostFs(host.root);
		expect(fs.exists(join(REPO_ROOT, '.dedalo.env'))).toBe(false);
		expect(fs.exists(join(REPO_ROOT, 'compose.override.yaml'))).toBe(false);
	});
});
