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

import {
	type FileInfoEntry,
	type ScanContext,
	scanContextFromItem,
} from '../../../src/core/media/files_info.ts';
import { buildMediaIdentifier, type MediaIdentity } from '../../../src/core/media/path.ts';
import {
	type MediaToolContext,
	resolveMediaToolContext,
} from '../../../src/core/media/tool_support.ts';
import {
	assertRecordPresent,
	type FilesInfoReconcileResult,
	reconcileStoredFilesInfo,
	repairStoredFilesInfo,
} from '../../../src/core/media/tools/files_info_persist.ts';
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
	const item = items.find((entry) => (entry.lang ?? null) === identity.lang) ?? items[0];
	return scanContextFromItem(item);
}

/**
 * Refresh the stored files_info cache after a synchronous mutating op (R1 tail).
 * reconcileStoredFilesInfo NEVER mints: a mutation of files the component does
 * not claim must not create a stored value — only the operator's explicit
 * sync_files repair may (see syncFiles).
 *
 * A vanished record throws (assertRecordPresent) rather than passing silently:
 * every media action wraps its body in the try/catch that turns that into the
 * tool's `fail(...)` response, so the operator learns the record is gone
 * instead of being told an op landed on nothing.
 */
async function writeBack(
	mediaContext: MediaToolContext,
	freshFilesInfo: FileInfoEntry[],
): Promise<FilesInfoReconcileResult> {
	const { identity } = mediaContext;
	return assertRecordPresent(
		await reconcileStoredFilesInfo({
			sectionTipo: identity.sectionTipo,
			sectionId: identity.sectionId,
			componentTipo: identity.componentTipo,
			lang: identity.lang,
			freshFilesInfo,
		}),
		identity,
	);
}

/**
 * get_files_info: re-scan and return the current files_info AS `result` (the
 * client contract — result must be the array, not a boolean).
 *
 * `files_info_db` rides along: what the RECORD stores right now, for the same
 * lang, read in the same breath as the disk scan. The panel compares the two to
 * decide whether to raise "files info data is unsync", and it used to take the
 * DB side from the component's CACHED data — a snapshot from when the tool was
 * opened, which no refresh re-reads. So every delete/build raised a false alarm
 * that a page reload made disappear: the two sides of one comparison came from
 * two different moments. This costs nothing — resolveMediaToolContext already
 * loaded the stored items.
 */
export async function getFilesInfo(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const mediaContext = await resolveMediaToolContext(ctx.options);
		const { spec, identity, pathOpts, items } = mediaContext;
		const filesInfo = getFilesInfoCore(spec, identity, pathOpts, scanContext(mediaContext));
		const item = items.find((entry) => (entry.lang ?? null) === identity.lang) ?? items[0];
		const stored = (item as { files_info?: unknown } | undefined)?.files_info;
		return {
			result: filesInfo,
			msg: 'ok',
			errors: [],
			files_info: filesInfo,
			// [] is the honest answer when the component stores nothing: the panel
			// SHOULD warn then, and Regenerate is the documented repair.
			files_info_db: Array.isArray(stored) ? stored : [],
		};
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
		const extension = typeof ctx.options.extension === 'string' ? ctx.options.extension : null;
		const built = await buildVersionCore(spec, identity, pathOpts, quality, extension);
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

		// repairStoredFilesInfo: this is the ONE path that may MINT a stored item —
		// a separately-named entry point, not a flag, so no other caller can reach
		// the mint by flipping a boolean. PHP
		// parity, not a new policy. update_component_data_files_info (:3748) minted
		// `{files_info}` from scratch on every save whenever the component's data
		// was empty and the scan found files, with no original_* keys because it
		// knew nothing about provenance. That is exactly the state a persist-less
		// ingest leaves behind: the files sit in image/original + image/1.5MB +
		// image/thumb while the matrix `media` key is NULL, so the widget reports
		// `files_info_db: []` against N disk entries and the record renders
		// nothing. Every OTHER caller uses reconcileStoredFilesInfo, which never
		// mints — a passive scan must not resurrect media someone removed.
		//
		// The emptiness test lives INSIDE the reconcile, under the row lock: a
		// decision taken from the request's snapshot could mint a second item over
		// an upload that committed while the disk scan ran.
		// S2-02 fail-loud: assertRecordPresent throws when the record is gone
		// (deleted mid-flight, or a section with no matrix table) — answering
		// "Success" there tells the operator a repair landed that never did. That
		// state is 'missing', NOT 'noop': a guard on the affected count alone could
		// never see it, because "nothing needed doing" also writes no row.
		const outcome = assertRecordPresent(
			await repairStoredFilesInfo({
				sectionTipo: identity.sectionTipo,
				sectionId: identity.sectionId,
				componentTipo: identity.componentTipo,
				lang: identity.lang,
				freshFilesInfo,
			}),
			identity,
		);
		if (outcome.action === 'created') {
			return {
				result: true,
				msg: `Success. Recorded ${freshFilesInfo.length} file(s) the component had no stored value for.`,
				errors: [],
				files_info: freshFilesInfo,
			};
		}
		// 'refreshed' / 'noop': the record exists and now matches the disk.
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
