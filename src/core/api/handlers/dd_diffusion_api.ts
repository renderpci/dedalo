/**
 * dd_diffusion_api handlers (WS-C S2-25 extraction — bodies moved VERBATIM
 * from api/dispatch.ts; dispatch keeps registry assembly + gates + envelope).
 *
 * Diffusion rebuild control plane (engineering/DIFFUSION_SPEC.md §4.2): the copied
 * tool_diffusion client reaches these via its main-API fallback. Wire shapes
 * pinned in test/parity/fixtures/diffusion/pinned.ts.
 *
 * BOUNDARY: this file is the sanctioned core→diffusion dynamic-import SEAM
 * (diffusion_boundaries.test.ts DIFFUSION_IMPORT_SEAMS) — the handlers lazily
 * `await import(...)` the diffusion ACTION facade for registration. The one
 * grandfathered non-facade import (plan/compile.ts validateElementPlan) is
 * ledgered in boundary_seam_tripwire.test.ts and clears when it is re-exported
 * through diffusion/api/actions.ts.
 */

import { type ActionHandler, requirePrincipal } from '../handler_context.ts';

/** dd_diffusion_api action handlers, keyed by action (registered in dispatch.ts). */
export const diffusionApiActions: Record<string, ActionHandler> = {
	diffuse: async (rqo, context) => {
		const principal = requirePrincipal(context);
		const { diffuseAction } = await import('../../../diffusion/api/actions.ts');
		return diffuseAction(rqo, principal);
	},
	get_process_status: async (rqo, context) => {
		const principal = requirePrincipal(context);
		const { getProcessStatusAction } = await import('../../../diffusion/api/actions.ts');
		return getProcessStatusAction(rqo, principal);
	},
	list_processes: async (rqo, context) => {
		const principal = requirePrincipal(context);
		const { listProcessesAction } = await import('../../../diffusion/api/actions.ts');
		return listProcessesAction(rqo, principal);
	},
	cancel_process: async (rqo, context) => {
		const principal = requirePrincipal(context);
		const { cancelProcessAction } = await import('../../../diffusion/api/actions.ts');
		return cancelProcessAction(rqo, principal);
	},
	get_diffusion_info: async (rqo, context) => {
		const principal = requirePrincipal(context);
		const { getDiffusionInfoAction } = await import('../../../diffusion/api/actions.ts');
		return getDiffusionInfoAction(rqo, principal);
	},
	get_engine_advisory: async (rqo, context) => {
		const principal = requirePrincipal(context);
		const { getEngineAdvisoryAction } = await import('../../../diffusion/api/actions.ts');
		return getEngineAdvisoryAction(rqo, principal);
	},
	retry_pending_deletions: async (rqo, context) => {
		// Admin-only (DIFF-02): re-drives the GLOBAL dd1758 pending-unpublish queue
		// — background load a non-admin must not be able to trigger. Its siblings
		// validate / rebuild_media_index are admin-gated the same way.
		const principal = requirePrincipal(context);
		if (!principal.isGlobalAdmin) {
			return {
				status: 200,
				body: {
					result: false,
					msg: 'Error. Insufficient permissions to retry pending deletions.',
					errors: ['insufficient permissions'],
				},
			};
		}
		const { retryPendingDeletionsAction } = await import('../../../diffusion/api/actions.ts');
		return retryPendingDeletionsAction(rqo, principal);
	},
	validate: async (rqo, context) => {
		// Admin-only plan validation (PHP dd_diffusion_api::validate): compiles
		// the element and reports errors/warnings — the loud pre-run gate.
		const principal = requirePrincipal(context);
		if (!principal.isGlobalAdmin) {
			return {
				status: 200,
				body: {
					result: false,
					msg: 'Error. Insufficient permissions to validate.',
					errors: ['insufficient permissions'],
				},
			};
		}
		const options = (rqo.options ?? {}) as { diffusion_element_tipo?: unknown };
		const elementTipo =
			typeof options.diffusion_element_tipo === 'string' ? options.diffusion_element_tipo : null;
		if (elementTipo === null) {
			return {
				status: 200,
				body: {
					result: false,
					msg: 'Error. Missing diffusion_element_tipo.',
					errors: ['invalid_request'],
				},
			};
		}
		const { validateElementPlan } = await import('../../../diffusion/plan/compile.ts');
		const validation = await validateElementPlan(elementTipo);
		return { status: 200, body: validation as unknown as Record<string, unknown> };
	},
	rebuild_media_index: async (rqo, context) => {
		// Full media-marker resync (PHP dd_diffusion_api::rebuild_media_index):
		// every sql/socrata publication target of the diffusion map is sent to
		// the Bun engine, which regenerates the .publication/pub store.
		// Cross-section operation — global admins only (PHP message parity).
		const principal = requirePrincipal(context);
		if (!principal.isGlobalAdmin) {
			return {
				status: 200,
				body: {
					result: false,
					msg: 'Error. Insufficient permissions to rebuild the media index.',
					errors: ['insufficient permissions'],
				},
			};
		}
		const { rebuildMediaIndex } = await import('../../diffusion_bridge/diffusion_delete.ts');
		const body = await rebuildMediaIndex();
		return { status: 200, body: body as unknown as Record<string, unknown> };
	},
};
