/**
 * tool_image_rotation server module — rotate + crop non-original image tiers
 * (the original is never mutated). Level>=2 on the record.
 */

import { DedaloError, ok } from '../../../src/core/errors/index.ts';
import { resolveMediaToolContext } from '../../../src/core/media/tool_support.ts';
import { reconcileStoredFilesInfo } from '../../../src/core/media/tools/files_info_persist.ts';
import {
	applyRotationCore,
	type RotationTargetEntry,
} from '../../../src/core/media/tools/rotation.ts';
import { getFilesInfoCore } from '../../../src/core/media/tools/versions.ts';
import {
	type ToolActionContext,
	type ToolResponse,
	type ToolServerModule,
	toolRequestId,
} from '../../../src/core/tools/module.ts';

async function applyRotation(ctx: ToolActionContext): Promise<ToolResponse> {
	const { spec, identity, pathOpts, items } = await resolveMediaToolContext(ctx.options);
	if (spec.model !== 'component_image') {
		throw new DedaloError('tool.unsupported_target', {
			publicMessage: 'Rotation is image-only',
			coordinates: { model: spec.model },
		});
	}
	// The tiers to touch come from the stored files_info (all non-original).
	const filesInfo = (items[0]?.files_info as RotationTargetEntry[] | undefined) ?? [];
	const entries = filesInfo.length > 0 ? filesInfo : getFilesInfoCore(spec, identity, pathOpts);
	const result = await applyRotationCore(
		spec,
		identity,
		pathOpts,
		entries as RotationTargetEntry[],
		{
			degrees: Number(ctx.options.rotation_degrees ?? 0),
			mode: ctx.options.rotation_mode === 'default' ? 'default' : 'expanded',
			// THE CLIENT'S 'Transparent' CHECKBOX IS WHAT DECIDES (2026-08-07).
			// It has always been sent (`alpha`) and was READ NOWHERE — the same
			// config-read-never-honoured shape this whole change exists to end, one
			// layer up. The colour picker ALWAYS sends a value (it defaults to
			// white), so taking it unconditionally made rotation.ts's per-file rule
			// (D10) dead code from the only tool that reaches it.
			//
			//  - ticked  → `undefined`, i.e. PER FILE: an alpha-capable file keeps
			//    transparent corners, and a jpg is still composited onto white —
			//    never a transparent jpg, which is the nondeterministic-background
			//    trap backgroundForTarget documents;
			//  - unticked → the picker's colour for every file: the operator chose a
			//    solid fill and can see it in the preview.
			background:
				ctx.options.alpha === true
					? undefined
					: typeof ctx.options.background_color === 'string'
						? ctx.options.background_color
						: undefined,
			cropArea:
				(ctx.options.crop_area as { x: number; y: number; width: number; height: number }) ?? null,
		},
	);
	const freshFilesInfo = getFilesInfoCore(spec, identity, pathOpts);
	// Refresh the stored files_info cache (rotation changes tier dimensions).
	await reconcileStoredFilesInfo({
		sectionTipo: identity.sectionTipo,
		sectionId: identity.sectionId,
		componentTipo: identity.componentTipo,
		lang: identity.lang,
		freshFilesInfo,
	});
	// Per-file failures do NOT fail the request (the tiers that DID rotate are
	// written): they are payload, reported beside what landed.
	return ok(
		{
			rotated: result.rotated,
			cropped: result.cropped,
			files_info: freshFilesInfo,
			errors: result.errors,
		},
		{ requestId: toolRequestId(ctx) },
	);
}

export const tool: ToolServerModule = {
	name: 'tool_image_rotation',
	apiActions: {
		apply_rotation: { permission: 'record_tipo', minLevel: 2, handler: applyRotation },
	},
};
