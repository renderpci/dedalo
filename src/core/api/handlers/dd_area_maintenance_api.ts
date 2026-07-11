/**
 * dd_area_maintenance_api handlers (WS-C S2-25 extraction — bodies moved
 * VERBATIM from api/dispatch.ts; dispatch keeps registry assembly + gates +
 * envelope).
 *
 * NOTE: the widget dispatcher itself (widget_request.ts) is user WIP and still
 * lives in core/resolve/ — the S2-23 per-widget split is deferred
 * (rewrite/LEDGER.md); these thin wrappers are its only dispatch-side callers.
 */

import { type ActionHandler, requirePrincipal } from '../handler_context.ts';

/** dd_area_maintenance_api action handlers (registered in dispatch.ts). */
export const areaMaintenanceApiActions: Record<string, ActionHandler> = {
	widget_request: async (rqo, context) => {
		// Maintenance-widget execution (PHP dd_area_maintenance_api) — all
		// gates + the explicit widget registry live in widget_request.ts.
		const principal = requirePrincipal(context);
		const { dispatchWidgetRequest } = await import('../../area_maintenance/widgets/registry.ts');
		const body = await dispatchWidgetRequest(
			principal,
			(rqo.source ?? {}) as { model?: unknown; action?: unknown },
			rqo.options,
		);
		return { status: 200, body: body as unknown as Record<string, unknown> };
	},
	get_widget_value: async (rqo, context) => {
		// Panel value load (PHP get_widget_value: ALWAYS the widget's static
		// get_value) — explicit GET_VALUE registry in widget_request.ts.
		const principal = requirePrincipal(context);
		const { dispatchGetWidgetValue } = await import('../../area_maintenance/widgets/registry.ts');
		const body = await dispatchGetWidgetValue(principal, (rqo.source ?? {}) as { model?: unknown });
		return { status: 200, body: body as unknown as Record<string, unknown> };
	},
	lock_components_actions: async (rqo, context) => {
		// lock_components widget area-level action (PHP dd_area_maintenance_api::
		// lock_components_actions). Admin-gated inside the dispatcher. fn_action ∈
		// {get_active_users, force_unlock_all_components}.
		const principal = requirePrincipal(context);
		const { dispatchLockComponentsActions } = await import(
			'../../area_maintenance/widgets/registry.ts'
		);
		const body = await dispatchLockComponentsActions(
			principal,
			(rqo.options ?? {}) as Record<string, unknown>,
		);
		return { status: 200, body: body as unknown as Record<string, unknown> };
	},
};
