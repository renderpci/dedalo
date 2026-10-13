/**
 * THE IMAGE'S IDENTITY, CHECKED (terminal installer phase 4, 2026-10-12) — the
 * TypeScript twin of deploy/dedalo-image-lib.sh's dedalo_repo_digest /
 * dedalo_cosign_verify / dedalo_verify_release, over the same docker and
 * cosign commands:
 *
 *  - THE SIGNATURE (official repositories): `cosign verify` of
 *    <repository>@<the digest the PULLED image carries for that repository>,
 *    against the signing identity of engineering/image_registries.json (the
 *    bundled list — never a value from the environment);
 *  - THE VERSION: the signed image's `org.opencontainers.image.version` label
 *    must equal the tag it was pulled as — a signature alone proves only that
 *    SOME official run built the bytes, and a registry whose tag pointers
 *    someone else controls could name an older signed release `:<newer>`;
 *  - THE PIN (critique A16): the verified digest is recorded, and before the
 *    engine runs in the image and before the stack starts, the local tag must
 *    STILL resolve to it (a re-pull between verify and run is refused).
 *
 * All read-only; the commands depend on what the pull brought (the digest),
 * so they are the step's CHECKS, run after its listed commands.
 */

import { loadImageRegistries, normalizeRepository } from '../../../update/image_registries.ts';
import { ABORT_AND_START_AGAIN } from '../../step_loop.ts';
import type { ExecCommand, HostCtx, HostPlanCtx } from '../contract.ts';
import { probeText } from '../production/common.ts';
import { hostRefuse } from '../refuse.ts';
import type { StackImage } from '../state_types.ts';
import { execute, stackCreated } from './common.ts';
import { dockerProbe, stackExec } from './compose.ts';
import { stackFactsOf } from './facts.ts';
import {
	imageRefOf,
	imageRepositoryOf,
	imageVerifyOf,
	imageVersionOf,
	VERSION_LABEL,
} from './layout.ts';

/** The image is present locally under its tag. */
export function imagePresentProbe(ctx: HostPlanCtx): ExecCommand {
	return dockerProbe(
		ctx,
		['image', 'inspect', '--format', '{{.Id}}', imageRefOf(ctx.answers)],
		'the image is present',
	);
}

/** The version label of the local image. */
export function versionLabelProbe(ctx: HostPlanCtx): ExecCommand {
	return dockerProbe(
		ctx,
		[
			'image',
			'inspect',
			'--format',
			`{{index .Config.Labels "${VERSION_LABEL}"}}`,
			imageRefOf(ctx.answers),
		],
		'the image declares its version',
	);
}

/** The registry digests the local image is known by. */
export function repoDigestsProbe(ctx: HostPlanCtx): ExecCommand {
	return dockerProbe(
		ctx,
		[
			'image',
			'inspect',
			'--format',
			'{{range .RepoDigests}}{{println .}}{{end}}',
			imageRefOf(ctx.answers),
		],
		'the registry digest of the pulled image',
	);
}

/** `cosign verify` of repository@digest against the official signing identity. */
export function cosignCommand(ctx: HostPlanCtx, digest: string): ExecCommand {
	const { signing } = loadImageRegistries();
	return stackExec(
		ctx,
		[
			stackFactsOf(ctx).cosign ?? '/usr/local/bin/cosign',
			'verify',
			'--certificate-identity-regexp',
			signing.identity_regexp,
			'--certificate-oidc-issuer',
			signing.issuer,
			`${imageRepositoryOf(ctx.answers)}@${digest}`,
		],
		"verify Dédalo's signature on the pulled digest",
		{ mutates: false, timeoutMs: 300_000 },
	);
}

/** The digests (sha256:…) the local image carries for ITS repository. */
export async function localDigests(ctx: HostCtx): Promise<string[]> {
	const wanted = normalizeRepository(imageRepositoryOf(ctx.answers));
	return (await probeText(ctx, repoDigestsProbe(ctx)))
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => normalizeRepository(line.slice(0, line.lastIndexOf('@'))) === wanted)
		.map((line) => line.slice(line.lastIndexOf('@') + 1))
		.filter((digest) => /^sha256:[0-9a-f]{64}$/.test(digest));
}

/** The version label must equal the tag (an official image: required; a custom one: when it has one). */
async function checkVersionLabel(ctx: HostCtx, official: boolean): Promise<void> {
	const declared = (await probeText(ctx, versionLabelProbe(ctx))).trim();
	const version = imageVersionOf(ctx.answers);
	if (declared === version || (!official && declared === '')) return;
	hostRefuse(
		'install.step_failed',
		`${imageRefOf(ctx.answers)} declares version '${declared || 'none'}', not ${version} — the tag does not name the image it should (refused)`,
	);
}

/** The signature over the ONE digest the pulled image carries; answers that digest. */
async function checkSignature(ctx: HostCtx): Promise<string> {
	const digests = await localDigests(ctx);
	const digest = digests[0];
	if (digest === undefined || digests.length !== 1) {
		hostRefuse(
			'install.step_failed',
			`${imageRefOf(ctx.answers)} carries ${digests.length} registry digests for its repository — exactly one is required to verify it`,
		);
	}
	await execute(ctx, cosignCommand(ctx, digest as string), (result) =>
		hostRefuse(
			'install.step_failed',
			`${imageRepositoryOf(ctx.answers)}@${digest} does NOT carry Dédalo's signature (cosign exit ${result.exitCode}) — refused`,
		),
	);
	return digest as string;
}

/** Verify the pulled (or built) image; answers the record stack_image keeps. */
export async function verifyImage(ctx: HostCtx): Promise<StackImage> {
	const verify = imageVerifyOf(ctx.answers);
	if (ctx.answers.image_source !== 'build') await checkVersionLabel(ctx, verify === 'cosign');
	const digest = verify === 'cosign' ? await checkSignature(ctx) : null;
	return {
		repository: imageRepositoryOf(ctx.answers),
		version: imageVersionOf(ctx.answers),
		digest,
		verify,
	};
}

/** Does the local tag still resolve to the verified digest (or need none)? */
export async function pinHolds(ctx: HostCtx): Promise<boolean> {
	const image = stackCreated(ctx).image;
	if (image === null) return false;
	if (image.digest === null) return true;
	return (await localDigests(ctx)).includes(image.digest);
}

/** Refuse when the local tag no longer resolves to the verified digest (critique A16). */
export async function assertPinnedImage(ctx: HostCtx): Promise<void> {
	if (await pinHolds(ctx)) return;
	hostRefuse(
		'install.state_conflict',
		`${imageRefOf(ctx.answers)} no longer resolves to the image this install verified — it was re-pulled or removed: pull the verified digest (${stackCreated(ctx).image?.digest ?? 'see the install record'}) back, then --resume; ${ABORT_AND_START_AGAIN}`,
	);
}
