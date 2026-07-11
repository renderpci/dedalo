/**
 * Shared media-action helpers for the dd_component_av_api / dd_component_3d_api
 * handler classes (WS-C S2-25 extraction — moved VERBATIM from api/dispatch.ts).
 */

import type { Rqo } from '../../concepts/rqo.ts';
import type { MediaContext } from '../../media/tools/posterframe.ts';
import { getPermissions } from '../../security/permissions.ts';
import { type ApiRequestContext, requirePrincipal } from '../handler_context.ts';
import type { ApiResult } from '../response.ts';

export const avActionFail = (msg: string): ApiResult => ({
	status: 200,
	body: { result: false, msg: `Error. ${msg}`, errors: [msg] },
});

/**
 * Resolve the language-neutral media context for a component API action and assert
 * the caller's section permission (PHP assert_section_permission). Posterframes /
 * media files are DEDALO_DATA_NOLAN — lang:null, matching the identifier the
 * section read serves. `expectedModel` gates the component model (component_av vs
 * component_3d). Returns either the context or an error ApiResult to relay.
 */
export async function resolveMediaActionContext(
	rqo: Rqo,
	context: ApiRequestContext,
	minLevel: number,
	expectedModel: 'component_av' | 'component_3d',
): Promise<{ ctx: MediaContext } | { error: ApiResult }> {
	const source = (rqo.source ?? {}) as {
		tipo?: string;
		section_tipo?: string;
		section_id?: unknown;
	};
	const tipo = String(source.tipo ?? '');
	const sectionTipo = String(source.section_tipo ?? '');
	const sectionId = Number(source.section_id);
	if (tipo === '' || sectionTipo === '' || !Number.isInteger(sectionId) || sectionId <= 0) {
		return { error: avActionFail('tipo, section_tipo and a positive section_id are required') };
	}

	const principal = requirePrincipal(context);
	const level = await getPermissions(principal, sectionTipo, sectionTipo);
	if (level < minLevel) {
		return {
			error: avActionFail(
				minLevel >= 2 ? 'insufficient permissions (write required)' : 'insufficient permissions',
			),
		};
	}

	const { mediaTypeOf } = await import('../../concepts/media.ts');
	const { getModelByTipo } = await import('../../ontology/resolver.ts');
	const model = await getModelByTipo(tipo);
	if (model !== expectedModel) return { error: avActionFail(`component is not ${expectedModel}`) };
	const spec = mediaTypeOf(expectedModel);
	if (spec === null) return { error: avActionFail(`${expectedModel} media spec unavailable`) };

	const { resolveMediaPathOptions } = await import('../../media/ontology_path.ts');
	const identity = { componentTipo: tipo, sectionTipo, sectionId, lang: null };
	const pathOpts = await resolveMediaPathOptions(tipo, sectionTipo);
	return { ctx: { spec, identity, pathOpts } };
}
