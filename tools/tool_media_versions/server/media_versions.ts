/**
 * tool_media_versions handlers — thin wrappers over the media versions core.
 * Each resolves the media context from the request options, runs the operation,
 * and returns the response shape the copied PHP client expects.
 *
 * Response contract (the client reads these verbatim — it is byte-identical to
 * PHP's tool_media_versions.js):
 *  - get_files_info: `result` IS the files_info array (client does
 *    `Array.isArray(response.result) ? response.result : []`). NOT a boolean.
 *  - every other action: `result` is a boolean success flag (the render layer
 *    checks `result===true` / `response.result===true`).
 * files_info is always re-scanned live after a mutation (PHP parity) and the
 * stored cache is written back so a subsequent read is immediately consistent.
 */

import type { FileInfoEntry, ScanContext } from '../../../src/core/media/files_info.ts';
import { type MediaIdentity, buildMediaIdentifier } from '../../../src/core/media/path.ts';
import {
	type MediaToolContext,
	resolveMediaToolContext,
} from '../../../src/core/media/tool_support.ts';
import { persistScannedFilesInfo } from '../../../src/core/media/tools/files_info_persist.ts';
import {
	buildVersionCore,
	conformHeadersCore,
	deleteQualityCore,
	deleteVersionCore,
	getFilesInfoCore,
	rotateVersionCore,
} from '../../../src/core/media/tools/versions.ts';
import type { ToolActionContext, ToolResponse } from '../../../src/core/tools/module.ts';

function fail(message: string): ToolResponse {
	return { result: false, msg: message, errors: [message] };
}

/**
 * Build the files_info ScanContext from the stored media item for the operated
 * lang (external_source + the original/modified normalized-name twins). Without
 * it, external media never resolves and the raw-original twin is missing — PHP
 * always feeds these from the component's data[0].
 */
function scanContext(mediaContext: MediaToolContext): ScanContext {
	const { items, identity } = mediaContext;
	const item = items.find((entry) => (entry.lang ?? null) === identity.lang) ?? items[0] ?? {};
	return {
		externalSource: (item.external_source as string | null | undefined) ?? null,
		originalNormalizedName: (item.original_normalized_name as string | null | undefined) ?? null,
		modifiedNormalizedName: (item.modified_normalized_name as string | null | undefined) ?? null,
	};
}

/** Refresh the stored files_info cache after a synchronous mutating op (R1 tail). */
async function writeBack(
	mediaContext: MediaToolContext,
	freshFilesInfo: FileInfoEntry[],
): Promise<void> {
	const { identity, items } = mediaContext;
	await persistScannedFilesInfo({
		sectionTipo: identity.sectionTipo,
		sectionId: identity.sectionId,
		componentTipo: identity.componentTipo,
		lang: identity.lang,
		items: items as { lang?: string | null; files_info?: unknown }[],
		freshFilesInfo,
	});
}

/**
 * get_files_info: re-scan and return the current files_info AS `result` (the
 * client contract — result must be the array, not a boolean).
 */
export async function getFilesInfo(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const mediaContext = await resolveMediaToolContext(ctx.options);
		const { spec, identity, pathOpts } = mediaContext;
		const filesInfo = getFilesInfoCore(spec, identity, pathOpts, scanContext(mediaContext));
		return { result: filesInfo, msg: 'ok', errors: [], files_info: filesInfo };
	} catch (error) {
		return fail((error as Error).message);
	}
}

/**
 * Append a media activity row — 'DELETE FILE' (dd42 code 12) or 'NEW VERSION'
 * (code 16). PHP logs these from the component classes (component_av :1071 /
 * :1223, component_image :1436, component_media_common :1404 / :3069); the TS
 * equivalent of that seam is the tool action, which is where the identity and
 * the client host both exist.
 *
 * `id` is the media identifier (the file's base name) — the v7 analogue of
 * PHP's $this->get_id() for a media component. `parent` is the section_id,
 * matching PHP's key name.
 */
async function logMediaActivity(
	ctx: ToolActionContext,
	what: 'DELETE FILE' | 'NEW VERSION',
	identity: MediaIdentity,
	payload: Record<string, unknown>,
): Promise<void> {
	const { logActivity, hostFromClientIp } = await import(
		'../../../src/core/api/handlers/activity_log.ts'
	);
	await logActivity({
		what,
		tipo: identity.componentTipo,
		userId: ctx.userId,
		host: hostFromClientIp(ctx.clientIp),
		data: {
			...payload,
			tipo: identity.componentTipo,
			parent: String(identity.sectionId),
			id: buildMediaIdentifier(identity),
		},
	});
}

/** build_version: build one quality derivative (av async → job id). */
export async function buildVersion(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const mediaContext = await resolveMediaToolContext(ctx.options);
		const { spec, identity, pathOpts } = mediaContext;
		const quality = String(ctx.options.quality ?? spec.defaultQuality);
		const built = await buildVersionCore(spec, identity, pathOpts, quality);
		const freshFilesInfo = getFilesInfoCore(spec, identity, pathOpts, scanContext(mediaContext));
		// Persist only for synchronous builds; av transcodes finish in a background
		// job and refresh files_info when the next read/save re-scans.
		if (built.jobId === null) await writeBack(mediaContext, freshFilesInfo);
		await logMediaActivity(ctx, 'NEW VERSION', identity, {
			msg: `Built version. Generated ${spec.model} file`,
			quality,
			source_quality: String(ctx.options.source_quality ?? spec.defaultQuality),
			target_quality: quality,
		});
		return {
			result: true,
			msg: 'ok',
			errors: [],
			built: built.built,
			job_id: built.jobId,
			files_info: freshFilesInfo,
		};
	} catch (error) {
		return fail((error as Error).message);
	}
}

/**
 * sync_files: reconcile the stored files_info against the filesystem (PHP
 * regenerate_component) — re-scan and persist the fresh index, returning a
 * boolean `result` (the render layer checks `response.result===true`).
 */
export async function syncFiles(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const mediaContext = await resolveMediaToolContext(ctx.options);
		const { spec, identity, pathOpts } = mediaContext;
		const freshFilesInfo = getFilesInfoCore(spec, identity, pathOpts, scanContext(mediaContext));
		await writeBack(mediaContext, freshFilesInfo);
		return { result: true, msg: 'Success. Request done', errors: [], files_info: freshFilesInfo };
	} catch (error) {
		return fail((error as Error).message);
	}
}

/** delete_quality: soft-delete EVERY extension of one quality tier. */
export async function deleteQuality(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const mediaContext = await resolveMediaToolContext(ctx.options);
		const { spec, identity, pathOpts } = mediaContext;
		const quality = String(ctx.options.quality ?? '');
		if (quality === '') return fail('delete_quality: missing quality');
		const moved = deleteQualityCore(spec, identity, pathOpts, quality, scanContext(mediaContext));
		const freshFilesInfo = getFilesInfoCore(spec, identity, pathOpts, scanContext(mediaContext));
		await writeBack(mediaContext, freshFilesInfo);
		await logMediaActivity(ctx, 'DELETE FILE', identity, {
			msg: 'Deleted media file (file is renamed and moved to delete folder)',
			quality,
		});
		return {
			result: true,
			msg: `File deleted successfully. ${quality}`,
			errors: [],
			moved,
			files_info: freshFilesInfo,
		};
	} catch (error) {
		return fail((error as Error).message);
	}
}

/** delete_version: soft-delete one quality×extension file (thumb passes its extension). */
export async function deleteVersion(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const mediaContext = await resolveMediaToolContext(ctx.options);
		const { spec, identity, pathOpts } = mediaContext;
		const quality = String(ctx.options.quality ?? '');
		if (quality === '') return fail('delete_version: missing quality');
		const extension = String(ctx.options.extension ?? spec.defaultExtension);
		const moved = deleteVersionCore(spec, identity, pathOpts, quality, extension);
		const freshFilesInfo = getFilesInfoCore(spec, identity, pathOpts, scanContext(mediaContext));
		await writeBack(mediaContext, freshFilesInfo);
		await logMediaActivity(ctx, 'DELETE FILE', identity, {
			msg: 'Deleted media file (file is renamed and moved to delete folder)',
			quality,
			extension,
		});
		return {
			result: true,
			msg: 'OK file delete successfully',
			errors: [],
			moved,
			files_info: freshFilesInfo,
		};
	} catch (error) {
		return fail((error as Error).message);
	}
}

/** conform_headers: remux an av container's headers (component_av only). */
export async function conformHeaders(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const mediaContext = await resolveMediaToolContext(ctx.options);
		const { spec, identity, pathOpts } = mediaContext;
		const quality = String(ctx.options.quality ?? '');
		if (quality === '') return fail('conform_headers: missing quality');
		const extension = typeof ctx.options.extension === 'string' ? ctx.options.extension : null;
		await conformHeadersCore(spec, identity, pathOpts, quality, extension);
		const freshFilesInfo = getFilesInfoCore(spec, identity, pathOpts, scanContext(mediaContext));
		await writeBack(mediaContext, freshFilesInfo);
		// PHP logs a remux as NEW VERSION too (component_av :1291) — the container
		// really is rewritten, so the audit trail treats it as a new file version.
		await logMediaActivity(ctx, 'NEW VERSION', identity, {
			msg: 'conform_header av file',
			quality,
		});
		return {
			result: true,
			msg: 'Rebuilding av file headers',
			errors: [],
			files_info: freshFilesInfo,
		};
	} catch (error) {
		return fail((error as Error).message);
	}
}

/** rotate: rotate one quality tier in place (component_image only). */
export async function rotate(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const mediaContext = await resolveMediaToolContext(ctx.options);
		const { spec, identity, pathOpts } = mediaContext;
		const quality = String(ctx.options.quality ?? '');
		if (quality === '') return fail('rotate: missing quality');
		if (ctx.options.degrees === undefined || ctx.options.degrees === null) {
			return fail('rotate: missing degrees');
		}
		const degrees = Number(ctx.options.degrees);
		if (Number.isNaN(degrees)) return fail('rotate: invalid degrees');
		const outcome = await rotateVersionCore(
			spec,
			identity,
			pathOpts,
			quality,
			degrees,
			scanContext(mediaContext),
		);
		const freshFilesInfo = getFilesInfoCore(spec, identity, pathOpts, scanContext(mediaContext));
		await writeBack(mediaContext, freshFilesInfo);
		return {
			result: outcome.result,
			msg: outcome.result ? 'Success. Request done.' : 'Error on rotate file.',
			errors: outcome.errors,
			files_info: freshFilesInfo,
		};
	} catch (error) {
		return fail((error as Error).message);
	}
}
