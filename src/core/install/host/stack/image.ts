/**
 * stack_image — THE IMAGE THE STACK RUNS (terminal installer phase 4,
 * 2026-10-12), from where the answers say:
 *
 *  - official / custom: `docker pull <repository>:<version>`; then the CHECKS
 *    (image_verify.ts) — the version label, and for an official repository
 *    the cosign signature of the pulled digest, which is RECORDED: before the
 *    engine runs in it and before the stack starts, the tag must still
 *    resolve to that digest (critique A16);
 *  - build: `docker build -t localhost/dedalo:<version> <checkout>` — the
 *    image deploy/compose.build.yml would build (context `.`, the Dockerfile,
 *    the deny-all build context of deploy/build_context.ts), built BEFORE
 *    .dedalo.env exists (compose cannot interpolate the stack without it).
 *
 * Nothing is undone on --abort: an image is a cache, not an install (told).
 */

import type { HostCommand, HostCtx, HostPlanCtx, HostStepDefinition } from '../contract.ts';
import { executeCommands } from '../execute.ts';
import { probeOk, ran, verdictOf } from '../production/common.ts';
import { stackCreated } from './common.ts';
import { dockerCommand } from './compose.ts';
import { imagePresentProbe, pinHolds, verifyImage } from './image_verify.ts';
import { imageModeOf, imageRefOf, LOCAL_REPOSITORY } from './layout.ts';

/** The image's commands (pull, or build here). */
export function imageCommands(ctx: HostPlanCtx): HostCommand[] {
	const ref = imageRefOf(ctx.answers);
	if (imageModeOf(ctx.answers) === 'build') {
		return [
			dockerCommand(
				ctx,
				['build', '--tag', ref, ctx.source],
				`build ${ref} here from this checkout (slow: the first build downloads the media toolchain)`,
				{ timeoutMs: 3 * 3600 * 1000 },
			),
		];
	}
	return [
		dockerCommand(
			ctx,
			['pull', ref],
			`pull ${ref}, then check its version label${ctx.answers.image_source === 'official' ? " and Dédalo's signature on its digest (cosign)" : ''}`,
			{ timeoutMs: 3600 * 1000 },
		),
	];
}

async function runImage(ctx: HostCtx) {
	await executeCommands(imageCommands(ctx), ctx);
	const image = await verifyImage(ctx);
	stackCreated(ctx).image = image;
	const how =
		image.verify === 'cosign'
			? `signature verified: ${image.repository}@${image.digest}`
			: image.repository === LOCAL_REPOSITORY
				? 'built here from this checkout'
				: 'a registry of your own: there is no Dédalo signature to check — trusted as pulled';
	return ran(`${imageRefOf(ctx.answers)} — ${how}`);
}

export const stack_image: HostStepDefinition = {
	id: 'stack_image',
	privilege: 'operator',
	kind: 'action',
	needs: [],
	label: (plan) =>
		`the image (${String(plan.answers.image_source)}${plan.answers.image_version === '' ? '' : ` ${String(plan.answers.image_version)}`})`,
	commands: imageCommands,
	verify: async (ctx) =>
		verdictOf(
			[
				[await probeOk(ctx, imagePresentProbe(ctx)), `${imageRefOf(ctx.answers)} is not present`],
				[await pinHolds(ctx), `${imageRefOf(ctx.answers)} is not the image this install verified`],
			],
			`${imageRefOf(ctx.answers)} present and verified`,
		),
	run: runImage,
	undo: async (ctx) =>
		`the image ${imageRefOf(ctx.answers)} is kept (remove it with: docker image rm ${imageRefOf(ctx.answers)})`,
};
