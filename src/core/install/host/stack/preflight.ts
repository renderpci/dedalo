/**
 * stack_preflight — THE SYSTEM CHECK OF A DOCKER / TRIAL RUN (terminal
 * installer phase 4, 2026-10-12). Measures the operator's machine
 * (stack/facts.ts) and REFUSES, before anything is pulled or written,
 * everything the later steps would trip on:
 *
 *  - no Docker, a daemon this operator cannot reach, no Compose v2 — TOLD how
 *    to fix, never fixed (owner question Q5: the installer does not install
 *    Docker or change group membership);
 *  - under 8 GiB free under Docker's root (measured on a clean Ubuntu 26.04:
 *    the engine image ~2.5 GB, postgres ~0.7 GB, a local build parks ~3 GB of
 *    cache; below it the seed restore dies with "No space left on device") —
 *    a root that cannot be measured (a VM, a remote daemon) skips the check;
 *  - an instance already here (the `dedalo_private` volume: the seed restore
 *    needs an empty database, so a second install is never a repair), or the
 *    stack files of an earlier install (.dedalo.env, compose.override.yaml);
 *  - an image version other than this installer's (Q7), an "official" image
 *    from a repository the official list does not name, an official image
 *    without cosign to verify it (critique A16 — use a local build instead, or
 *    install cosign);
 *  - the institution's certificate files (address, expiry, key).
 *
 * Then FREEZES the facts and the digest of every stack step's commands in the
 * state file, as host_preflight does: what the rest of the run, and any
 * resume, executes. It creates nothing (no undo); done once, a resume skips it.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { HostCtx, HostPlanCtx, HostRunResult, HostStepDefinition } from '../contract.ts';
import { pendingFacts } from '../facts.ts';
import { ran } from '../production/common.ts';
import { hostRefuse } from '../refuse.ts';
import { checkCertificateFiles } from '../tls_files.ts';
import { inCheckout } from './common.ts';
import { gatherStackFacts, type StackFacts } from './facts.ts';
import {
	acceptedImageVersions,
	ENV_FILE,
	imageRepositoryOf,
	imageVerifyOf,
	imageVersionOf,
	isOfficialRepository,
	OVERRIDE_FILE,
	PRIVATE_VOLUME,
	stackFileOf,
} from './layout.ts';

/** The disk floor (see the header). */
export const STACK_MIN_FREE_GIB = 8;

/** The operator as a sentence names them. */
function who(facts: StackFacts): string {
	return facts.user === '' ? 'this user' : facts.user;
}

/** `[sentence]` when `bad`, else none. */
function when(bad: boolean, sentence: string): string[] {
	return bad ? [sentence] : [];
}

/** Docker itself: present, reachable, Compose v2. */
function dockerProblems(facts: StackFacts): string[] {
	if (facts.docker === null) {
		return [
			'Docker is not installed — install Docker Engine and its Compose plugin (https://docs.docker.com/engine/install/), then run this again; the installer never installs it',
		];
	}
	const major = Number((facts.composeVersion ?? '0').split('.')[0]);
	return [
		...when(
			!facts.daemon,
			`the Docker daemon does not answer ${who(facts)} — start it (sudo systemctl enable --now docker) or join the docker group (sudo usermod -aG docker ${who(facts)}, then log in again); DOCKER_HOST is not passed through: use a docker context`,
		),
		...when(
			!(major >= 2),
			'Docker Compose v2 or newer is required (the `docker compose` plugin, not the old docker-compose)',
		),
	];
}

/**
 * Is the operator's identity known — `id -un` and `id -u` answered? Through
 * `id`, never /etc/passwd: macOS keeps its accounts in Directory Services and
 * an LDAP/SSSD account is not in /etc/passwd either, and both are operators
 * the route supports. The files the install writes need no lookup by name for
 * them (host/fs.ts ownerIds: an unprivileged process writing as ITSELF).
 */
function knownOperator(facts: StackFacts): boolean {
	return facts.user !== '' && facts.uid >= 0;
}

/** Disk and the operator's identity. */
function machineProblems(facts: StackFacts): string[] {
	const free = facts.freeGib ?? STACK_MIN_FREE_GIB;
	return [
		...when(
			free < STACK_MIN_FREE_GIB,
			`only ${free} GiB free under ${facts.dockerRoot} — the install needs about ${STACK_MIN_FREE_GIB} GiB (docker system prune -af, or move Docker's root to a bigger disk)`,
		),
		...when(
			!knownOperator(facts),
			'the operator cannot be identified (`id -un` / `id -u` answered nothing) — run the install as a user with a login on this machine',
		),
	];
}

/** An instance, or an earlier install's stack files, already here. */
function instanceProblems(ctx: HostCtx, facts: StackFacts): string[] {
	const stack = stackFileOf(ctx.answers);
	return [
		...(existsSync(join(ctx.source, stack))
			? []
			: [`${stack} is not in ${ctx.source} — run the installer from a Dédalo checkout`]),
		...(facts.volumes.includes(PRIVATE_VOLUME)
			? [
					`this machine already has a Dédalo instance (volume ${PRIVATE_VOLUME}) — the seed restore needs an empty database: keep that instance, or destroy it first (docker compose -f ${stack} --env-file ${ENV_FILE} down -v)`,
				]
			: []),
		...[ENV_FILE, OVERRIDE_FILE]
			.filter((name) => ctx.fs.exists(inCheckout(ctx, name)))
			.map(
				(name) =>
					`${inCheckout(ctx, name)} is from an earlier install — remove it (or keep that instance) and run this again`,
			),
	];
}

/** The image: this installer's version, an official repository that is one, cosign to verify it. */
function imageProblems(ctx: HostPlanCtx, facts: StackFacts): string[] {
	const { answers } = ctx;
	const version = imageVersionOf(answers);
	const repository = imageRepositoryOf(answers);
	return [
		...(acceptedImageVersions().includes(version)
			? []
			: [
					`image version ${version} is not this installer's (${acceptedImageVersions().join(' or ')}) — the engine steps run inside the image with this installer's request format; use the matching release of the installer`,
				]),
		...(answers.image_source === 'official' && !isOfficialRepository(repository)
			? [
					`${repository} is not an official Dédalo registry — use --image-source custom for a registry of your own`,
				]
			: []),
		...(imageVerifyOf(answers) === 'cosign' && facts.cosign === null
			? [
					`cosign is not installed, so the signature of ${repository} cannot be verified — install cosign (https://docs.sigstore.dev/cosign/system_config/installation/) or build the image here (--image-source build)`,
				]
			: []),
	];
}

/** The institution's own certificate, checked before it is copied. */
function tlsVerdict(ctx: HostCtx): { problems: string[]; warnings: string[] } {
	const { answers } = ctx;
	if (answers.route !== 'docker' || answers.tls_mode !== 'files') {
		return { problems: [], warnings: [] };
	}
	const verdict = checkCertificateFiles(
		ctx.fs.readText(answers.tls_cert_path),
		ctx.fs.readText(answers.tls_key_path),
		answers.server_name,
		ctx.now(),
	);
	return {
		problems: verdict.problems.map((problem) => `${answers.tls_cert_path}: ${problem}`),
		warnings: verdict.warnings,
	};
}

/** Refuse with every problem, joined (the operator fixes them all in one pass). */
function refuseAll(problems: readonly string[]): void {
	if (problems.length > 0) hostRefuse('install.state_conflict', problems.join('; '));
}

/** The facts a plan context carries once they are frozen. */
function withFacts(ctx: HostCtx, facts: StackFacts): HostPlanCtx {
	return { ...ctx, facts: { ...pendingFacts(), stack: facts } };
}

/** The preflight's own run: measure, refuse, freeze. */
async function runStackPreflight(
	ctx: HostCtx,
	digest: (ctx: HostPlanCtx) => Record<string, string>,
): Promise<HostRunResult> {
	const facts = await gatherStackFacts(ctx.runner, ctx.fs);
	refuseAll(dockerProblems(facts));
	const planCtx = withFacts(ctx, facts);
	const tls = tlsVerdict(ctx);
	refuseAll([
		...machineProblems(facts),
		...instanceProblems(ctx, facts),
		...imageProblems(planCtx, facts),
		...tls.problems,
	]);
	ctx.state.preflight.host = { facts: planCtx.facts, commands_digest: digest(planCtx) };
	return ran(
		`Docker Compose ${facts.composeVersion}, ${facts.freeGib === null ? 'disk not measurable' : `${facts.freeGib} GiB free`}, as ${facts.user}`,
		{ warnings: tls.warnings },
	);
}

/**
 * The step. `digest` is the stack table's: every stack step's command list
 * for the frozen facts (passed in, so this module does not import the table).
 */
export function stackPreflightStep(
	digest: (ctx: HostPlanCtx) => Record<string, string>,
): HostStepDefinition {
	return {
		id: 'stack_preflight',
		privilege: 'operator',
		kind: 'probe',
		needs: [],
		label: () => 'system check: Docker, Compose v2, disk, no instance yet, the image source',
		commands: () => [],
		run: (ctx) => runStackPreflight(ctx, digest),
	};
}
