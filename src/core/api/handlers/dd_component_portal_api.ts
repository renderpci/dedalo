/**
 * dd_component_portal_api handlers (WS-C S2-25 extraction — bodies moved
 * VERBATIM from api/dispatch.ts; dispatch keeps registry assembly + gates +
 * envelope).
 */

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
			section_id?: string | number;
		};
		const options = (rqo.options ?? {}) as {
			locator?: Record<string, unknown>;
			ar_properties?: string[];
		};
		const body = await deletePortalLocator(principal, source, options);
		return { status: 200, body: body as unknown as Record<string, unknown> };
	},
};
