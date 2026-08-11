/**
 * dd_component_3d_api handlers (WS-C S2-25 extraction — bodies moved VERBATIM
 * from api/dispatch.ts; dispatch keeps registry assembly + gates + envelope).
 *
 * 3D posterframe (PHP dd_component_3d_api). The tool's "Create posterframe"
 * for a 3D component uploads a client-rendered canvas snapshot to the staging
 * tree, then calls move_file_to_dir(target_dir:'posterframe') to bind it;
 * delete_posterframe removes it. Both are section WRITE → CSRF-gated.
 */

import type { Rqo } from '../../concepts/rqo.ts';
import type { Session } from '../../security/session_store.ts';
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
 * dd_component_3d_api::move_file_to_dir — bind a staged upload to a 3D record (the
 * client-rendered posterframe snapshot). Section WRITE (PHP level 2). The staged
 * file's source is rebuilt server-side from the upload allowlist; failures ride as
 * HTTP 200 + result:false.
 */
/*
 * COVERAGE-EXEMPT (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): this action requires the ffmpeg /
 * ImageMagick BINARIES and MUTATES THE REAL MEDIA TREE — no scratch surface
 * contains a media file the rest of the suite also reads. The gateable content
 * is the pure argv builders (gated in test/unit/tier1_media_argv_native.test.ts),
 * which is where a shell-injection or wrong-flag regression actually hides.
 */
async function threeDMoveFileAction(rqo: Rqo, context: ApiRequestContext): Promise<ApiResult> {
	const resolved = await resolveMediaActionContext(rqo, context, 2, 'component_3d');
	if ('error' in resolved) return resolved.error;

	const options = (rqo.options ?? {}) as {
		target_dir?: unknown;
		file_data?: { name?: unknown; key_dir?: unknown; tmp_name?: unknown };
	};
	const fileData = options.file_data ?? {};
	const targetDir = String(options.target_dir ?? '');
	const fileName = String(fileData.name ?? '');
	const keyDir = String(fileData.key_dir ?? '');
	const tmpName = String(fileData.tmp_name ?? '');
	if (targetDir === '' || fileName === '' || keyDir === '' || tmpName === '') {
		return avActionFail('target_dir and file_data.{name,key_dir,tmp_name} are required');
	}

	const { moveUploadedToMediaDir } = await import('../../media/tools/posterframe.ts');
	const result: boolean = await moveUploadedToMediaDir({
		ctx: resolved.ctx,
		userId: (context.session as Session).userId,
		keyDir,
		tmpName,
		fileName,
		targetDir,
	});
	// The bind wrote the posterframe AND rebuilt the thumb from it; persist the
	// index so LIST MODE sees the thumb. 3d serves the stored files_info verbatim
	// (only av re-scans per read), so without this the freshly captured picture
	// existed on disk and nowhere else — measured: the panel showed it, every list
	// kept the placeholder.
	if (result === true) {
		await persistMediaFilesInfo(resolved.ctx);
	}

	return {
		status: 200,
		body: {
			result,
			msg: result ? 'OK. Request done successfully' : 'Error. Staged upload not found',
			errors: result ? [] : ['rename failed'],
		},
	};
}

/** dd_component_3d_api::delete_posterframe — unlink the 3D posterframe (WRITE, level 2). */
async function threeDDeletePosterframeAction(
	rqo: Rqo,
	context: ApiRequestContext,
): Promise<ApiResult> {
	const resolved = await resolveMediaActionContext(rqo, context, 2, 'component_3d');
	if ('error' in resolved) return resolved.error;

	// Deleting the posterframe RETIRES THE THUMB WITH IT — the thumb is a picture of
	// the posterframe, and nothing here can re-render a mesh, so the record goes
	// back to its placeholder rather than serving a still of a file that is gone.
	const { deletePosterframe } = await import('../../media/tools/posterframe.ts');
	const outcome = await deletePosterframe(resolved.ctx);
	const result = outcome.result;
	// Persist: 3d is NOT re-scanned per read (unlike av), so without this the stored
	// index keeps claiming a thumb that has just left the tier.
	if (result === true) {
		await persistMediaFilesInfo(resolved.ctx);
	}

	// Activity audit (PHP logger 'DELETE FILE' code 12, component_3d :665 —
	// byte-identical payload to the av twin). Only on a real deletion.
	if (result === true) {
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

/** dd_component_3d_api action handlers, keyed by action (registered in dispatch.ts). */
export const component3dApiActions: Record<string, ActionHandler> = {
	move_file_to_dir: async (rqo, context) => {
		return threeDMoveFileAction(rqo, context);
	},
	delete_posterframe: async (rqo, context) => {
		return threeDDeletePosterframeAction(rqo, context);
	},
};
