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
import { avActionFail, resolveMediaActionContext } from './media_action_context.ts';

/**
 * dd_component_3d_api::move_file_to_dir — bind a staged upload to a 3D record (the
 * client-rendered posterframe snapshot). Section WRITE (PHP level 2). The staged
 * file's source is rebuilt server-side from the upload allowlist; failures ride as
 * HTTP 200 + result:false.
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
	const result = await moveUploadedToMediaDir({
		ctx: resolved.ctx,
		userId: (context.session as Session).userId,
		keyDir,
		tmpName,
		fileName,
		targetDir,
	});
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

	const { deletePosterframe } = await import('../../media/tools/posterframe.ts');
	const result = deletePosterframe(resolved.ctx);

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
