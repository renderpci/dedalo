/**
 * Shared media-action helpers for the dd_component_av_api / dd_component_3d_api
 * handler classes (WS-C S2-25 extraction — moved VERBATIM from api/dispatch.ts).
 */

import type { Rqo } from '../../concepts/rqo.ts';
import { DedaloError } from '../../errors/dedalo_error.ts';
import type { MediaContext } from '../../media/tools/posterframe.ts';
import { authorizeRecordAccess, type RecordGrant } from '../../security/write_door.ts';
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
 * Resolve the language-neutral media context for a component API action and
 * AUTHORIZE it through the write door (closure Step 3, SEC-2-media;
 * WC-2026-09-30-media-pair-scope). Posterframes / media files are
 * DEDALO_DATA_NOLAN — lang:null, matching the identifier the section read
 * serves. Returns the context AND the grant it was built from, or THROWS the
 * registered refusal (ERRORS_SPEC §4 — a helper may exist only if it throws).
 *
 * ORDER, and why:
 *   1. coordinates — a positive integer id, BEFORE authentication (credless,
 *      DB-less; `request.invalid_source`);
 *   2. the write door — the section floor (= minLevel, so no door is weaker
 *      than the section-only gate it replaces), the (section, COMPONENT) pair
 *      (dd128-aware on a write, the read door's law on a read) and the RECORD
 *      SCOPE. The frozen PHP asked only the section; a profile explicitly
 *      denied the AV component cut fragments and deleted posterframes through
 *      the section grant, and any record id was reachable out of scope;
 *   3. the model — AFTER the pair and the scope, so an unauthorized caller
 *      cannot use `request.invalid_model` to probe the ontology.
 *
 * The identity is built from the GRANT, never re-read from the rqo.
 */
export async function resolveMediaActionContext(
	rqo: Rqo,
	context: ApiRequestContext,
	minLevel: 1 | 2,
	expectedModel: 'component_av' | 'component_3d',
	door: string = `media:${expectedModel}`,
): Promise<{ ctx: MediaContext; grant: RecordGrant }> {
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
	const grant = await authorizeRecordAccess(
		principal,
		{ section_tipo: sectionTipo, component_tipo: tipo, section_id: sectionId },
		{ mode: minLevel === 1 ? 'read' : 'write', level: minLevel, sectionFloor: minLevel, door },
	);

	const { mediaTypeOf } = await import('../../concepts/media.ts');
	const { getModelByTipo } = await import('../../ontology/resolver.ts');
	const model = await getModelByTipo(grant.componentTipo);
	if (model !== expectedModel) {
		throw new DedaloError('request.invalid_model', {
			message: `media action: component ${grant.componentTipo} is not ${expectedModel}`,
			coordinates: { tipo: grant.componentTipo, model: model ?? 'null', expected: expectedModel },
		});
	}
	const spec = mediaTypeOf(expectedModel);
	if (spec === null) avActionFail(`${expectedModel} media spec unavailable`);

	const { resolveMediaPathOptions } = await import('../../media/ontology_path.ts');
	const identity = {
		componentTipo: grant.componentTipo,
		sectionTipo: grant.sectionTipo,
		sectionId: grant.sectionId,
		lang: null,
	};
	const pathOpts = await resolveMediaPathOptions(grant.componentTipo, grant.sectionTipo);
	return { ctx: { spec, identity, pathOpts }, grant };
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
