/**
 * dd_ts_api handlers (WS-C S2-25 extraction — bodies moved VERBATIM from
 * api/dispatch.ts; dispatch keeps registry assembly + gates + envelope).
 *
 * Thesaurus/ontology tree read+write (PHP dd_ts_api). Thin wrappers: resolve
 * the principal, forward the RQO to ts_api (which owns permission gating and
 * the VERBATIM envelopes/msgs). Writes are state-changing → CSRF is enforced
 * by the dispatch gate. HTTP is always 200; failures ride as result:false.
 */

import { type ActionHandler, requirePrincipal } from '../handler_context.ts';

/** dd_ts_api action handlers, keyed by action (registered in dispatch.ts). */
export const tsApiActions: Record<string, ActionHandler> = {
	get_node_data: async (rqo, context) => {
		const principal = requirePrincipal(context);
		const { getNodeData } = await import('../../ts_object/ts_api.ts');
		const body = await getNodeData(rqo, principal);
		return { status: 200, body: body as unknown as Record<string, unknown> };
	},
	get_children_data: async (rqo, context) => {
		const principal = requirePrincipal(context);
		const { getChildrenData } = await import('../../ts_object/ts_api.ts');
		const body = await getChildrenData(rqo, principal);
		return { status: 200, body: body as unknown as Record<string, unknown> };
	},
	add_child: async (rqo, context) => {
		const principal = requirePrincipal(context);
		const { addChild } = await import('../../ts_object/ts_api.ts');
		const body = await addChild(rqo, principal);
		return { status: 200, body: body as unknown as Record<string, unknown> };
	},
	update_parent_data: async (rqo, context) => {
		const principal = requirePrincipal(context);
		const { updateParentData } = await import('../../ts_object/ts_api.ts');
		const body = await updateParentData(rqo, principal);
		return { status: 200, body: body as unknown as Record<string, unknown> };
	},
	save_order: async (rqo, context) => {
		const principal = requirePrincipal(context);
		const { saveOrder } = await import('../../ts_object/ts_api.ts');
		const body = await saveOrder(rqo, principal);
		return { status: 200, body: body as unknown as Record<string, unknown> };
	},
};
