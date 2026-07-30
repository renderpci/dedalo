/**
 * dd_component_text_area_api handlers (PHP
 * core/api/v1/common/class.dd_component_text_area_api.php).
 *
 * PHP exposed TWO actions on this class; only `get_tags_info` is ported
 * (WC-067). `delete_tag` — the tool_indexation "delete this index tag in every
 * lang" write — is NOT implemented and is therefore NOT registered: an
 * unregistered pair is the documented 400 (API-01), which is the loud failure
 * the house rule asks for, not a silent no-op that would report success while
 * leaving the tag in the text.
 *
 * Response envelope is the PHP one: HTTP 200 + {result, msg, errors}, with
 * `result:false` for a refusal.
 */

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
		const sectionId = source.section_id;
		if (tipo === '' || sectionTipo === '' || sectionId === undefined || sectionId === null) {
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
		if (!(await principalCanAccessRecord(sectionTipo, Number(sectionId), principal))) {
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
			{ tipo, section_tipo: sectionTipo, section_id: sectionId as number | string },
			lang,
		);

		// Never silently narrow: an unresolvable type is named in the response.
		const msg: string[] =
			unknown_types.length > 0
				? [` Unsupported tag type(s) ignored: ${unknown_types.join(', ')}`]
				: [];

		return { status: 200, body: { result: tags_info, msg, errors: [] } };
	},
};
