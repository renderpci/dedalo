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
 * Response envelope is the PHP one: HTTP 200 + {result, msg, errors}, with
 * `result:false` for a refusal. That falsiness is LOAD-BEARING for delete_tag:
 * the client only removes the editor's own tag markup when `result!==false`
 * (component_text_area.js:1372), so "nothing matched" must stay falsy — as in
 * PHP, where $response->result = ($n_deleted > 0).
 */

import { coerceSectionId } from '../../concepts/section_id.ts';
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
			return {
				status: 200,
				body: {
					result: false,
					msg: [` Bad request: ${error instanceof Error ? error.message : String(error)}`],
					errors: ['bad_source'],
				},
			};
		}
		if (tipo === '' || sectionTipo === '' || sectionId === undefined) {
			return {
				status: 200,
				body: {
					result: false,
					msg: [
						' Bad request: source.tipo, source.section_tipo and source.section_id are mandatory',
					],
					errors: ['bad_source'],
				},
			};
		}

		// PHP took `options.ar_type` verbatim; a non-array is a client bug, and
		// defaulting it would serve a payload nobody asked for.
		const requestedTypes = Array.isArray(options.ar_type)
			? options.ar_type.filter((type): type is string => typeof type === 'string')
			: [];
		if (requestedTypes.length === 0) {
			return {
				status: 200,
				body: {
					result: false,
					msg: [' Bad request: options.ar_type must be a non-empty array of tag types'],
					errors: ['bad_options'],
				},
			};
		}

		// AUTHZ-01 (TS-stronger than PHP, spec §3 permits stronger): this feed
		// resolves the CONTENT of a record and of every record its tags point at.
		// Gate the host record like every other door reading by (tipo, id).
		const { principalCanAccessRecord } = await import('../../security/record_scope.ts');
		if (!(await principalCanAccessRecord(sectionTipo, sectionId, principal))) {
			return {
				status: 200,
				body: { result: false, msg: [' Forbidden record'], errors: ['forbidden'] },
			};
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

		// Never silently narrow: an unresolvable type is named in the response.
		const msg: string[] =
			unknown_types.length > 0
				? [` Unsupported tag type(s) ignored: ${unknown_types.join(', ')}`]
				: [];

		return { status: 200, body: { result: tags_info, msg, errors: [] } };
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
			return refuse(
				' Bad request: source.tipo, source.section_tipo and a positive source.section_id are mandatory',
			);
		}
		if (tagId === '') {
			return refuse(' Bad request: options.tag_id is mandatory');
		}

		// Only the paired mark families are deletable by id (WC-077). An
		// unsupported type is NAMED, never treated as a no-op success.
		const { ID_TARGETED_MARK_TYPES } = await import('../../resolve/tr_marks.ts');
		if (!(ID_TARGETED_MARK_TYPES as readonly string[]).includes(tagType)) {
			return refuse(
				` Tag type '${tagType}' is not deletable by id (supported: ${ID_TARGETED_MARK_TYPES.join(', ')})`,
			);
		}

		// SEC — the canonical write gate (same as dd_core_api save): level >= 2 on
		// the (section, component) pair, then the per-record projects scope for
		// non-admins. A level-2 user must not rewrite a record they cannot see.
		const { getPermissions } = await import('../../security/permissions.ts');
		if ((await getPermissions(principal, sectionTipo, tipo)) < 2) {
			return refuse(" You don't have enough permissions to edit this component", 'forbidden');
		}
		if (!principal.isGlobalAdmin) {
			const { isRecordInScope } = await import('../../security/record_scope.ts');
			if (!(await isRecordInScope(sectionTipo, sectionId, principal))) {
				return refuse(' Record is out of the user scope', 'forbidden');
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
			// not a server fault.
			return refuse(` ${(error as Error).message}`, 'bad_options');
		}

		// PHP message bytes (class.dd_component_text_area_api.php:71-74).
		const model = (await getModelByTipo(tipo)) ?? '';
		const total = outcome.langsChanged.length;
		const msg: string[] = [
			total > 0
				? `Deleted tag: ${tagId} (${tagType}) in ${total} langs: ${outcome.langsChanged.join(', ')} (${model} - ${tipo})`
				: `No tags are deleted in ${model} tipo: '${tipo}' tag_id: '${tagId}' type: '${tagType}'`,
		];
		const errors: string[] = [];
		if (outcome.error !== undefined) {
			// A partial write is reported, never swallowed: the langs already
			// cleaned are named above, and re-issuing the request is safe.
			msg.push(outcome.error);
			errors.push(outcome.error);
		}

		return {
			status: 200,
			body: {
				// PHP: result = ($n_deleted > 0). The client's editor-tag removal
				// depends on this exact falsiness (see the module doc).
				result: outcome.removedCount > 0 && outcome.error === undefined,
				msg,
				errors,
				langs_changed: outcome.langsChanged,
				removed_count: outcome.removedCount,
			},
		};
	},
};

/** PHP refusal envelope: HTTP 200 + result:false + the message. */
function refuse(message: string, errorCode = 'bad_source') {
	return {
		status: 200 as const,
		body: { result: false, msg: [message], errors: [errorCode] },
	};
}
