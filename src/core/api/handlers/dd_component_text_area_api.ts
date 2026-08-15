/**
 * dd_component_text_area_api handlers (PHP
 * core/api/v1/common/class.dd_component_text_area_api.php).
 *
 * Both PHP actions are ported (WC-077):
 *  - `get_tags_info` — READ: resolve a transcription's marks into the records
 *    they point at (tool_tr_print's feed);
 *  - `delete_tag` — WRITE: remove one tag's marks from EVERY language of the
 *    text (tool_indexation's step 1; its step 2, the portal locator, is
 *    dd_component_portal_api::delete_locator, which PHP deliberately moved out
 *    of this action and the client calls right after).
 *
 * ENVELOPE v2 (engineering/ERRORS_SPEC.md): a refusal is a THROWN registry code
 * (the dispatch catch converts it); a success is `ok(data)`. delete_tag's data
 * is still the BOOLEAN PHP computed ($n_deleted > 0) — that falsiness is
 * LOAD-BEARING: the client only removes the editor's own tag markup when the
 * answer is not false (component_text_area.js:1372), so "nothing matched" must
 * stay a falsy SUCCESS, never an error.
 */

import { coerceSectionId } from '../../concepts/section_id.ts';
import { ok } from '../../errors/convert.ts';
import { DedaloError } from '../../errors/dedalo_error.ts';
import { specOf } from '../../errors/registry.ts';
import type { ApiNotice } from '../../errors/schema.ts';
import type { ActionHandler } from '../handler_context.ts';
import { requirePrincipal } from '../handler_context.ts';

/** dd_component_text_area_api action handlers (registered in dispatch.ts). */
export const componentTextAreaApiActions: Record<string, ActionHandler> = {
	get_tags_info: async (rqo, context) => {
		const principal = requirePrincipal(context);
		const source = (rqo.source ?? {}) as {
			tipo?: unknown;
			section_tipo?: unknown;
			section_id?: unknown;
			lang?: unknown;
		};
		const options = (rqo.options ?? {}) as { ar_type?: unknown };
		const tipo = String(source.tipo ?? '');
		const sectionTipo = String(source.section_tipo ?? '');
		// The host of a transcription is always a matrix record: coerce at the
		// door (counted, deprecable RQO-body string form) so nothing downstream
		// carries a string leg (WC-2026-08-10-section-id-int-canonical). A
		// non-address is REFUSED BY NAME — never folded into "mandatory field
		// missing", which would hide a client sending the wrong kind of id.
		let sectionId: number | undefined;
		try {
			sectionId =
				source.section_id === undefined || source.section_id === null
					? undefined
					: coerceSectionId(
							source.section_id,
							'rqo.dd_component_text_area_api.get_tags_info.section_id',
						);
		} catch (error) {
			// The coercer's own message names the offending value — LOG-ONLY.
			throw new DedaloError('request.invalid_source', {
				cause: error,
				coordinates: {
					section_id: JSON.stringify(source.section_id ?? null),
					section_tipo: sectionTipo,
				},
			});
		}
		if (tipo === '' || sectionTipo === '' || sectionId === undefined) {
			throw new DedaloError('request.invalid_source', {
				message:
					'get_tags_info: source.tipo, source.section_tipo and source.section_id are mandatory',
			});
		}

		// PHP took `options.ar_type` verbatim; a non-array is a client bug, and
		// defaulting it would serve a payload nobody asked for.
		const requestedTypes = Array.isArray(options.ar_type)
			? options.ar_type.filter((type): type is string => typeof type === 'string')
			: [];
		if (requestedTypes.length === 0) {
			throw new DedaloError('request.invalid_options', {
				publicMessage: 'options.ar_type must be a non-empty array of tag types',
			});
		}

		// AUTHZ-01 (TS-stronger than PHP, spec §3 permits stronger): this feed
		// resolves the CONTENT of a record and of every record its tags point at.
		// Gate the host record like every other door reading by (tipo, id).
		const { principalCanAccessRecord } = await import('../../security/record_scope.ts');
		if (!(await principalCanAccessRecord(sectionTipo, sectionId, principal))) {
			throw new DedaloError('perm.denied', {
				coordinates: { section_tipo: sectionTipo, section_id: sectionId, tipo },
			});
		}

		// The request's data lang when the client names one (the text_area is
		// per-lang: its notes and text belong to the lang being transcribed).
		const { currentDataLang } = await import('../../resolve/request_lang.ts');
		const lang =
			typeof source.lang === 'string' && source.lang !== '' ? source.lang : currentDataLang();

		const { buildTagsInfo } = await import('../../components/component_text_area/tags_info.ts');
		const { tags_info, unknown_types } = await buildTagsInfo(
			requestedTypes,
			{ tipo, section_tipo: sectionTipo, section_id: sectionId },
			lang,
		);

		// Never silently narrow: an unresolvable type is NAMED — as an owned
		// top-level key now that the prose channel is gone (the answer itself is
		// valid, so this is not an error and not a coded notice either: the types
		// are caller-supplied strings, not a closed vocabulary).
		return {
			status: 200,
			body: ok(tags_info, {
				requestId: context.requestId,
				extend: { unknown_types },
			}),
		};
	},

	delete_tag: async (rqo, context) => {
		const principal = requirePrincipal(context);
		const source = (rqo.source ?? {}) as {
			tipo?: unknown;
			section_tipo?: unknown;
			section_id?: unknown;
		};
		const options = (rqo.options ?? {}) as { tag_id?: unknown; type?: unknown };
		const tipo = String(source.tipo ?? '');
		const sectionTipo = String(source.section_tipo ?? '');
		const sectionId = Number(source.section_id);
		const tagId = String(options.tag_id ?? '');
		const tagType = String(options.type ?? '');
		if (tipo === '' || sectionTipo === '' || !Number.isInteger(sectionId) || sectionId <= 0) {
			throw new DedaloError('request.invalid_source', {
				message:
					'delete_tag: source.tipo, source.section_tipo and a positive source.section_id are mandatory',
			});
		}
		if (tagId === '') {
			throw new DedaloError('request.invalid_options', {
				publicMessage: 'options.tag_id is mandatory',
			});
		}

		// Only the paired mark families are deletable by id (WC-077). An
		// unsupported type is NAMED, never treated as a no-op success.
		const { ID_TARGETED_MARK_TYPES } = await import('../../resolve/tr_marks.ts');
		if (!(ID_TARGETED_MARK_TYPES as readonly string[]).includes(tagType)) {
			throw new DedaloError('request.invalid_options', {
				// Public: the sentence states the CLOSED supported set, never the
				// rejected value (which is caller data).
				publicMessage: `options.type must be one of ${ID_TARGETED_MARK_TYPES.join(', ')}`,
				message: `delete_tag: tag type '${tagType}' is not deletable by id`,
			});
		}

		// SEC — the canonical write gate (same as dd_core_api save): level >= 2 on
		// the (section, component) pair, then the per-record projects scope for
		// non-admins. A level-2 user must not rewrite a record they cannot see.
		const { getPermissions } = await import('../../security/permissions.ts');
		if ((await getPermissions(principal, sectionTipo, tipo)) < 2) {
			throw new DedaloError('perm.denied', {
				coordinates: { section_tipo: sectionTipo, tipo, required: 2 },
			});
		}
		if (!principal.isGlobalAdmin) {
			const { isRecordInScope } = await import('../../security/record_scope.ts');
			if (!(await isRecordInScope(sectionTipo, sectionId, principal))) {
				throw new DedaloError('perm.out_of_scope', {
					coordinates: { section_tipo: sectionTipo, section_id: sectionId },
				});
			}
		}

		const { deleteTagFromAllLangs } = await import(
			'../../components/component_text_area/tag_delete.ts'
		);
		const { getModelByTipo } = await import('../../ontology/resolver.ts');
		let outcome: Awaited<ReturnType<typeof deleteTagFromAllLangs>>;
		try {
			outcome = await deleteTagFromAllLangs({
				componentTipo: tipo,
				sectionTipo,
				sectionId,
				tagId,
				tagType: tagType as 'index' | 'reference',
				userId: principal.userId,
			});
		} catch (error) {
			// markPatternById throws on a malformed tag_id — a rejected request,
			// not a server fault. Its message names the offending id: LOG-ONLY.
			throw new DedaloError('request.invalid_options', {
				cause: error,
				publicMessage: 'options.tag_id is malformed',
				coordinates: { tipo, section_tipo: sectionTipo, section_id: sectionId },
			});
		}

		// PHP message bytes (class.dd_component_text_area_api.php:71-74) — now the
		// LOG line: the wire carries the boolean + the two owned counters.
		const model = (await getModelByTipo(tipo)) ?? '';
		const total = outcome.langsChanged.length;
		console.info(
			total > 0
				? `[delete_tag] deleted tag: ${tagId} (${tagType}) in ${total} langs: ${outcome.langsChanged.join(', ')} (${model} - ${tipo})`
				: `[delete_tag] no tags are deleted in ${model} tipo: '${tipo}' tag_id: '${tagId}' type: '${tagType}'`,
		);
		return {
			status: 200,
			// PHP: result = ($n_deleted > 0). The client's editor-tag removal depends
			// on this exact falsiness (see the module doc) — it reads the compat
			// mirror today and `data` after the client half lands.
			body: ok(outcome.removedCount > 0 && outcome.error === undefined, {
				requestId: context.requestId,
				notices: partialWriteNotices(outcome.error),
				extend: {
					langs_changed: outcome.langsChanged,
					removed_count: outcome.removedCount,
				},
			}),
		};
	},
};

/**
 * A PARTIAL write is reported, never swallowed: the langs already cleaned ride
 * in `langs_changed`, the failure as a coded NOTICE — the answer is a FALSY
 * SUCCESS, not a failed request (re-issuing it is safe), so it cannot be a
 * throw. The engine's own message is the log line, never a wire field.
 */
function partialWriteNotices(error: string | undefined): ApiNotice[] | undefined {
	if (error === undefined) return undefined;
	console.error(`[delete_tag] partial write: ${error}`);
	const spec = specOf('record.save_failed');
	return [{ code: 'record.save_failed', label_key: spec.label_key, retryable: spec.retryable }];
}
