/**
 * dd_ts_api handlers (WS-C S2-25 extraction — bodies moved VERBATIM from
 * api/dispatch.ts; dispatch keeps registry assembly + gates + envelope).
 *
 * Thesaurus/ontology tree read+write (PHP dd_ts_api). Thin wrappers: resolve
 * the principal, forward the RQO to ts_api (which owns permission gating and
 * the refusals), and turn its `TsApiOutcome` into envelope v2 — this is the
 * ONE site that builds the tree API's body. Writes are state-changing → CSRF
 * is enforced by the dispatch gate. A refusal THROWS out of ts_api and rides
 * the dispatch catch, so it carries the registry status and its error code
 * (the PHP "always 200, failures ride as result:false" parity is repealed).
 */

import { ok } from '../../errors/index.ts';
import type { TsApiOutcome } from '../../ts_object/ts_api.ts';
import { type ActionHandler, requirePrincipal } from '../handler_context.ts';
import type { ApiResult } from '../response.ts';

/**
 * One tree outcome → the envelope. Non-fatal findings ride as the top-level
 * `errors` extension key, which is where the tree client reads them; an empty
 * set emits nothing (an `errors: []` on a success meant nothing in PHP either).
 */
function tsApiResult(outcome: TsApiOutcome, requestId: string): ApiResult {
	const warnings = outcome.warnings ?? [];
	return {
		status: 200,
		body: ok(outcome.data, {
			requestId,
			...(warnings.length === 0 ? {} : { extend: { errors: warnings } }),
		}),
	};
}

/** dd_ts_api action handlers, keyed by action (registered in dispatch.ts). */
export const tsApiActions: Record<string, ActionHandler> = {
	get_node_data: async (rqo, context) => {
		const principal = requirePrincipal(context);
		const { getNodeData } = await import('../../ts_object/ts_api.ts');
		return tsApiResult(await getNodeData(rqo, principal), context.requestId);
	},
	get_children_data: async (rqo, context) => {
		const principal = requirePrincipal(context);
		const { getChildrenData } = await import('../../ts_object/ts_api.ts');
		return tsApiResult(await getChildrenData(rqo, principal), context.requestId);
	},
	add_child: async (rqo, context) => {
		const principal = requirePrincipal(context);
		const { addChild } = await import('../../ts_object/ts_api.ts');
		return tsApiResult(await addChild(rqo, principal), context.requestId);
	},
	update_parent_data: async (rqo, context) => {
		const principal = requirePrincipal(context);
		const { updateParentData } = await import('../../ts_object/ts_api.ts');
		return tsApiResult(await updateParentData(rqo, principal), context.requestId);
	},
	save_order: async (rqo, context) => {
		const principal = requirePrincipal(context);
		const { saveOrder } = await import('../../ts_object/ts_api.ts');
		return tsApiResult(await saveOrder(rqo, principal), context.requestId);
	},
};
