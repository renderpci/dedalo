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
import {
	avActionFail,
	persistMediaFilesInfo,
	resolveMediaActionContext,
} from './media_action_context.ts';

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
			: (await deletePosterframe(resolved.ctx)).ok;

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

/**
 * dd_component_av_api::download_fragment — cut the clip an AV index entry points
 * at and answer its URL (PHP :98).
 *
 * PERMISSION: section READ, level 1, exactly as PHP asserts. It writes a file, so
 * the instinct is to demand level 2 — but the file is a DERIVATIVE of bytes the
 * caller may already stream in the player, in a folder that holds nothing else,
 * and the button lives on every index row a reader can open. Raising the bar here
 * would silently remove the capability from the consultation users it exists for,
 * which is the "over-strict whitelist is itself a narrowing" failure. It stays a
 * read gate, and CSRF still applies (the dispatch gate covers every action).
 *
 * The client waits up to an hour for this (component_av.js sets `timeout:
 * 3600*1000`, `retries: 1`) because a long clip really can take that long. The
 * handler therefore does not impose a budget of its own: the producer's
 * INACTIVITY cap is what distinguishes slow from wedged.
 *
 * Failures ride as HTTP 200 + `result:false` + a message, which is the shape the
 * client alerts with (`api_response.msg`).
 */
async function downloadFragmentAction(rqo: Rqo, context: ApiRequestContext): Promise<ApiResult> {
	const resolved = await resolveMediaActionContext(rqo, context, 1, 'component_av');
	if ('error' in resolved) return resolved.error;

	const source = (rqo.source ?? {}) as { tag_id?: unknown };
	const options = (rqo.options ?? {}) as {
		quality?: unknown;
		tc_in_secs?: unknown;
		tc_out_secs?: unknown;
		watermark?: unknown;
	};
	const { spec, identity, pathOpts } = resolved.ctx;
	const quality =
		typeof options.quality === 'string' && options.quality !== ''
			? options.quality
			: spec.defaultQuality;

	const { buildAvFragment } = await import('../../media/tools/fragment.ts');
	try {
		const fragment = await buildAvFragment({
			spec,
			identity,
			pathOpts,
			quality,
			tagId: String(source.tag_id ?? ''),
			tcInSeconds: Number(options.tc_in_secs ?? 0),
			tcOutSeconds: Number(options.tc_out_secs ?? 0),
			watermark: options.watermark === true || options.watermark === 'true',
		});
		return {
			status: 200,
			body: { result: fragment.url, msg: 'OK. Request done successfully', errors: [] },
		};
	} catch (error) {
		// PHP's wording, plus the REASON (WC-2026-08-09-av-fragment-failure-reason).
		// PHP answered a fixed "Error on create the fragment file <name>", which told
		// whoever clicked nothing at all — and the client renders this in a blocking
		// alert(), so it is the only diagnosis anyone gets. Every message thrown by
		// the core names exactly what was refused.
		return avActionFail(`on create the fragment file: ${(error as Error).message}`);
	}
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
	// The two "Download fragment" buttons on every AV index row (read, level 1).
	download_fragment: async (rqo, context) => {
		return downloadFragmentAction(rqo, context);
	},
};
