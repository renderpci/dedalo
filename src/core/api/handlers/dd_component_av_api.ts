/**
 * dd_component_av_api handlers (WS-C S2-25 extraction — bodies moved VERBATIM
 * from api/dispatch.ts; dispatch keeps registry assembly + gates + envelope).
 *
 * Posterframe create/delete for an AV component (PHP dd_component_av_api).
 * This is the primary tool_posterframe path: its "Create posterframe" /
 * "Delete posterframe" buttons call these through component_av, NOT through
 * dd_tools_api (only create_identifying_image goes through the tool module).
 * Both require section WRITE (PHP assert_section_permission level 2); writes
 * so CSRF is enforced by the dispatch gate. HTTP stays 200; failures ride as
 * result:false, matching the client contract (api_response.result).
 */

import type { Rqo } from '../../concepts/rqo.ts';
import {
	type ActionHandler,
	type ApiRequestContext,
	requirePrincipal,
} from '../handler_context.ts';
import type { ApiResult } from '../response.ts';
import { persistMediaFilesInfo, resolveMediaActionContext } from './media_action_context.ts';

/**
 * dd_component_av_api::create_posterframe / delete_posterframe. Both need section
 * WRITE (PHP level 2). Failures ride as HTTP 200 + result:false (the client reads
 * api_response.result).
 */
/*
 * COVERAGE-EXEMPT (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): this action requires the ffmpeg /
 * ImageMagick BINARIES and MUTATES THE REAL MEDIA TREE — no scratch surface
 * contains a media file the rest of the suite also reads. The gateable content
 * is the pure argv builders (gated in test/unit/tier1_media_argv_native.test.ts),
 * which is where a shell-injection or wrong-flag regression actually hides.
 */
async function posterframeAction(
	rqo: Rqo,
	context: ApiRequestContext,
	op: 'create' | 'delete',
): Promise<ApiResult> {
	const resolved = await resolveMediaActionContext(rqo, context, 2, 'component_av');
	if ('error' in resolved) return resolved.error;

	const options = (rqo.options ?? {}) as { current_time?: unknown };
	const { createAvPosterframe, deletePosterframe } = await import(
		'../../media/tools/posterframe.ts'
	);
	// A posterframe write or delete is ALWAYS a thumb change too — the thumb is a
	// picture of the posterframe (THUMB_SOURCE_BY_MODEL) — and both cores keep the
	// two in step. What the CORE cannot do is persist: it is filesystem-only by
	// design, so the stored files_info is written back here (see below).
	const result =
		op === 'create'
			? await createAvPosterframe(resolved.ctx, String(options.current_time ?? '0'))
			: (await deletePosterframe(resolved.ctx)).result;

	// PERSIST what just changed on disk. Without this the record's stored index
	// still claims the old thumb state, and every reader that trusts the cache —
	// list mode's projection, the export path — serves it. av is re-scanned per
	// read (component_emit.ts) so this was invisible on av alone; the same handler
	// shape on 3d was NOT, which is how a freshly captured 3d thumb stayed
	// invisible in lists.
	if (result === true) {
		await persistMediaFilesInfo(resolved.ctx);
	}

	// Activity audit (PHP logger 'DELETE FILE' code 12). Logged HERE rather than
	// in deletePosterframe, which is synchronous and whose MediaContext carries
	// no actor — this handler has both the principal and the client host.
	// Only on a real deletion: deletePosterframe returns false when there was no
	// file, and an audit row for a no-op would be a lie.
	if (op === 'delete' && result === true) {
		const { logActivity, hostFromClientIp } = await import('./activity_log.ts');
		const { buildMediaIdentifier } = await import('../../media/path.ts');
		const { identity } = resolved.ctx;
		await logActivity({
			what: 'DELETE FILE',
			tipo: identity.componentTipo,
			userId: requirePrincipal(context).userId,
			host: hostFromClientIp(context.clientIp),
			data: {
				msg: 'Deleted media file (file is renamed and moved to delete folder)',
				tipo: identity.componentTipo,
				parent: String(identity.sectionId),
				id: buildMediaIdentifier(identity),
				quality: 'posterframe',
			},
		});
	}

	return { status: 200, body: { result, msg: 'OK. Request done', errors: [] } };
}

/**
 * dd_component_av_api::get_media_streams — ffprobe the AV file at a quality (PHP
 * asserts section READ, level 1). Result is the {streams:[...]} object (or null
 * when no file exists at that quality); the client reads api_response.result.streams.
 */
async function mediaStreamsAction(rqo: Rqo, context: ApiRequestContext): Promise<ApiResult> {
	const resolved = await resolveMediaActionContext(rqo, context, 1, 'component_av');
	if ('error' in resolved) return resolved.error;

	const options = (rqo.options ?? {}) as { quality?: unknown };
	const quality = typeof options.quality === 'string' ? options.quality : null;
	const { getAvMediaStreams } = await import('../../media/tools/posterframe.ts');
	const streams = await getAvMediaStreams(resolved.ctx, quality);

	return { status: 200, body: { result: streams, msg: ['OK. Request done'], errors: [] } };
}

/** dd_component_av_api action handlers, keyed by action (registered in dispatch.ts). */
export const componentAvApiActions: Record<string, ActionHandler> = {
	create_posterframe: async (rqo, context) => {
		return posterframeAction(rqo, context, 'create');
	},
	delete_posterframe: async (rqo, context) => {
		return posterframeAction(rqo, context, 'delete');
	},
	// ffprobe stream metadata for the player (read, level 1). The AV player edit
	// view calls this on EVERY render — the tool's edit view can't open without it.
	get_media_streams: async (rqo, context) => {
		return mediaStreamsAction(rqo, context);
	},
};
