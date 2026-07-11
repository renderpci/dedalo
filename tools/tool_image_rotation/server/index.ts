/**
 * tool_image_rotation server module — rotate + crop non-original image tiers
 * (the original is never mutated). Level>=2 on the record.
 */

import { resolveMediaToolContext } from '../../../src/core/media/tool_support.ts';
import { persistScannedFilesInfo } from '../../../src/core/media/tools/files_info_persist.ts';
import {
	type RotationTargetEntry,
	applyRotationCore,
} from '../../../src/core/media/tools/rotation.ts';
import { getFilesInfoCore } from '../../../src/core/media/tools/versions.ts';
import type {
	ToolActionContext,
	ToolResponse,
	ToolServerModule,
} from '../../../src/core/tools/module.ts';

async function applyRotation(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const { spec, identity, pathOpts, items } = await resolveMediaToolContext(ctx.options);
		if (spec.model !== 'component_image') {
			return { result: false, msg: 'rotation is image-only', errors: ['not an image'] };
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
				background:
					typeof ctx.options.background_color === 'string'
						? ctx.options.background_color
						: '#ffffff',
				cropArea:
					(ctx.options.crop_area as { x: number; y: number; width: number; height: number }) ??
					null,
			},
		);
		const freshFilesInfo = getFilesInfoCore(spec, identity, pathOpts);
		// Refresh the stored files_info cache (rotation changes tier dimensions).
		await persistScannedFilesInfo({
			sectionTipo: identity.sectionTipo,
			sectionId: identity.sectionId,
			componentTipo: identity.componentTipo,
			lang: identity.lang,
			items: items as { lang?: string | null; files_info?: unknown }[],
			freshFilesInfo,
		});
		return {
			result: result.errors.length === 0,
			msg: result.errors.length === 0 ? 'ok' : 'completed with errors',
			errors: result.errors,
			rotated: result.rotated,
			cropped: result.cropped,
			files_info: freshFilesInfo,
		};
	} catch (error) {
		return { result: false, msg: (error as Error).message, errors: [(error as Error).message] };
	}
}

export const tool: ToolServerModule = {
	name: 'tool_image_rotation',
	apiActions: {
		apply_rotation: { permission: 'record', minLevel: 2, handler: applyRotation },
	},
};
