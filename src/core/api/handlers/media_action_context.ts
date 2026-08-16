/**
 * Shared media-action helpers for the dd_component_av_api / dd_component_3d_api
 * handler classes (WS-C S2-25 extraction — moved VERBATIM from api/dispatch.ts).
 */

import type { Rqo } from '../../concepts/rqo.ts';
import { DedaloError } from '../../errors/dedalo_error.ts';
import type { MediaContext } from '../../media/tools/posterframe.ts';
import { getPermissions } from '../../security/permissions.ts';
import { type ApiRequestContext, requirePrincipal } from '../handler_context.ts';

/**
 * The media-action refusal — a THROW, never a body (ERRORS_SPEC §4: only the
 * converter writes a failure body), typed `never` so a call site cannot forget
 * to relay it. `media.action_failed` is the operation-failed code; the engine
 * reason rides `cause`/the log line, never the wire (a filesystem or ffmpeg
 * message can carry paths).
 */
export function avActionFail(reason: string, cause?: unknown): never {
	throw new DedaloError('media.action_failed', {
		message: `media action failed: ${reason}`,
		cause,
	});
}

/**
 * Resolve the language-neutral media context for a component API action and assert
 * the caller's section permission (PHP assert_section_permission). Posterframes /
 * media files are DEDALO_DATA_NOLAN — lang:null, matching the identifier the
 * section read serves. `expectedModel` gates the component model (component_av
 * vs component_3d). Returns the context, or THROWS the registered refusal
 * (ERRORS_SPEC §4 — a helper may exist only if it throws).
 */
export async function resolveMediaActionContext(
	rqo: Rqo,
	context: ApiRequestContext,
	minLevel: number,
	expectedModel: 'component_av' | 'component_3d',
): Promise<{ ctx: MediaContext }> {
	const source = (rqo.source ?? {}) as {
		tipo?: string;
		section_tipo?: string;
		section_id?: unknown;
	};
	const tipo = String(source.tipo ?? '');
	const sectionTipo = String(source.section_tipo ?? '');
	const sectionId = Number(source.section_id);
	if (tipo === '' || sectionTipo === '' || !Number.isInteger(sectionId) || sectionId <= 0) {
		throw new DedaloError('request.invalid_source', {
			message:
				'media action: source.tipo, source.section_tipo and a positive source.section_id are required',
		});
	}

	const principal = requirePrincipal(context);
	const level = await getPermissions(principal, sectionTipo, sectionTipo);
	if (level < minLevel) {
		throw new DedaloError('perm.denied', {
			coordinates: { section_tipo: sectionTipo, tipo, required: minLevel },
		});
	}

	const { mediaTypeOf } = await import('../../concepts/media.ts');
	const { getModelByTipo } = await import('../../ontology/resolver.ts');
	const model = await getModelByTipo(tipo);
	if (model !== expectedModel) {
		throw new DedaloError('request.invalid_model', {
			message: `media action: component ${tipo} is not ${expectedModel}`,
			coordinates: { tipo, model: model ?? 'null', expected: expectedModel },
		});
	}
	const spec = mediaTypeOf(expectedModel);
	if (spec === null) avActionFail(`${expectedModel} media spec unavailable`);

	const { resolveMediaPathOptions } = await import('../../media/ontology_path.ts');
	const identity = { componentTipo: tipo, sectionTipo, sectionId, lang: null };
	const pathOpts = await resolveMediaPathOptions(tipo, sectionTipo);
	return { ctx: { spec, identity, pathOpts } };
}

/**
 * Write the record's files_info back after a posterframe action changed what is
 * on disk — the persistence half these handlers owe the filesystem cores.
 *
 * The posterframe cores are filesystem-only BY DESIGN (so they can be gated
 * against a scratch tree with real binaries), which means nobody was persisting
 * the thumb they build. On av that stayed invisible: `component_emit` re-scans av
 * on every read. On 3d it was not — a posterframe captured in the browser wrote a
 * thumb the stored index never learned about, so the record's list view kept
 * showing the placeholder until some unrelated action re-scanned it.
 *
 * `reconcileStoredFilesInfo` NEVER mints: a component with no stored item is left
 * alone (that is the passive-scan rule — only the operator's explicit sync_files
 * may create one). Failures are logged, never thrown: the file operation already
 * happened, and the panel's own re-scan will show the truth.
 */
export async function persistMediaFilesInfo(ctx: MediaContext): Promise<void> {
	try {
		const { scanFilesInfo } = await import('../../media/files_info.ts');
		const { reconcileStoredFilesInfo } = await import('../../media/tools/files_info_persist.ts');
		const { identity, spec, pathOpts } = ctx;
		await reconcileStoredFilesInfo({
			sectionTipo: identity.sectionTipo,
			sectionId: identity.sectionId,
			componentTipo: identity.componentTipo,
			lang: identity.lang,
			freshFilesInfo: scanFilesInfo(spec, identity, pathOpts),
		});
	} catch (error) {
		const { buildMediaIdentifier } = await import('../../media/path.ts');
		console.warn(
			`[media] files_info NOT persisted for ${buildMediaIdentifier(ctx.identity)}: ${(error as Error).message}`,
		);
	}
}
