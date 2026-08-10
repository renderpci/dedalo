/**
 * dd_component_portal_api handlers (WS-C S2-25 extraction — bodies moved
 * VERBATIM from api/dispatch.ts; dispatch keeps registry assembly + gates +
 * envelope).
 */

import { coerceSectionId } from '../../concepts/section_id.ts';
import { type ActionHandler, requirePrincipal } from '../handler_context.ts';

/** dd_component_portal_api action handlers (registered in dispatch.ts). */
export const componentPortalApiActions: Record<string, ActionHandler> = {
	delete_locator: async (rqo, context) => {
		// Bulk locator removal by property match (PHP
		// dd_component_portal_api::delete_locator — the client's
		// delete-by-tag/type flow). Write permission enforced.
		const principal = requirePrincipal(context);
		const { deletePortalLocator } = await import('../../relations/save.ts');
		const source = (rqo.source ?? {}) as {
			tipo?: string;
			section_tipo?: string;
			/** Raw wire value — unknown until the door classifies it below. */
			section_id?: unknown;
		};
		const options = (rqo.options ?? {}) as {
			locator?: Record<string, unknown>;
			ar_properties?: string[];
		};
		// The HOST of the portal is always a matrix record: coerce at the door
		// (counted, deprecable RQO-body string form) instead of letting the
		// legacy string ride into the engine's Number() casts
		// (WC-2026-08-10-section-id-int-canonical). Without a counted door here
		// the contraction release has no evidence this door stopped receiving
		// strings. Absent stays absent — deletePortalLocator answers the
		// required-fields envelope for it (client contract, HTTP 200).
		let sectionId: number | undefined;
		if (source.section_id !== undefined && source.section_id !== null) {
			try {
				sectionId = coerceSectionId(
					source.section_id,
					'rqo.dd_component_portal_api.delete_locator.section_id',
				);
			} catch (error) {
				return {
					status: 400,
					body: {
						result: false,
						msg: `delete_locator: ${error instanceof Error ? error.message : String(error)}`,
						errors: ['invalid section_id'],
					},
				};
			}
		}
		const body = await deletePortalLocator(
			principal,
			{ ...source, section_id: sectionId },
			options,
		);
		return { status: 200, body: body as unknown as Record<string, unknown> };
	},
};
