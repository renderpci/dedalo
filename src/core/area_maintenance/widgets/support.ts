/**
 * Maintenance-widget SHARED CONTRACT (S2-23 split): the types every
 * `widgets/<widget_id>.ts` module implements and the helpers more than one
 * widget needs. The per-widget modules export ONE `WidgetModule`; registry.ts
 * assembles them (catalog order, API_ACTIONS, GET_VALUE) — the tools/loader.ts
 * pattern. Adding a widget = adding ONE file + ONE registry import line.
 */

import type { Principal } from '../../security/permissions.ts';

/** The PHP response envelope every widget method returns. */
export interface WidgetResponse {
	result: unknown;
	msg: string;
	errors: string[];
}

export type WidgetHandler = (
	options: Record<string, unknown>,
	principal: Principal,
) => Promise<WidgetResponse>;

/** How one widget resolves its label (mirrors the PHP per-widget expressions). */
export type LabelRule =
	| { kind: 'label'; key: string; fallback?: string }
	| { kind: 'label_mark_fallback'; key: string; literal: string }
	| { kind: 'label_concat'; keys: [string, string] }
	| { kind: 'literal'; text: string };

/** One catalog entry (PHP get_ar_widgets block). */
export interface WidgetSpec {
	id: string;
	category: string;
	class?: string;
	background?: boolean;
	label: LabelRule;
}

/**
 * One maintenance widget module — what a `widgets/<widget_id>.ts` file exports.
 * `apiActions` is the widget's explicit method registry (the TS API_ACTIONS
 * equivalent — a method exists ONLY if listed); `getValue` answers the
 * get_widget_value panel load; `eagerValue` computes the catalog's inline
 * `value` (PHP computes several inside get_ar_widgets; fail-soft, never throw).
 *
 * OWNERSHIP CLASSIFICATION (UPDATE_PROCESS Phase 0): every apiActions entry is
 * classified — wrap it with `gated()`/`gatedStub()` (consults the standalone-
 * ownership gate) or `engineDenied()` (closed-by-design), or add a named
 * ENGINE_NATIVE exemption with a reason in update_ownership_tripwire.test.ts.
 * The tripwire fails any unclassified action.
 */
export interface WidgetModule {
	spec: WidgetSpec;
	apiActions?: Record<string, WidgetHandler>;
	getValue?: WidgetHandler;
	eagerValue?: () => Promise<Record<string, unknown> | null>;
}

/**
 * The ownership-classification marker carried on widget handlers (a function
 * property, so update_ownership_tripwire can enumerate the LIVE registry —
 * no grep fragility, no module-level registry state).
 */
export const OWNERSHIP_MARK: unique symbol = Symbol('dedalo.widget_ownership');

export interface OwnershipMark {
	kind: 'gated' | 'denied';
	/** '<widget_id>.<action>' — the tripwire asserts it matches the registry key. */
	what: string;
	/** gated only: the coexisting-mode handler (byte-frozen responses). */
	whenClosed?: WidgetHandler;
	/** gated only: true while the open branch IS the closed branch (port pending). */
	openIsStub?: boolean;
}

/** Read a handler's ownership classification (undefined = unclassified). */
export function ownershipMark(handler: WidgetHandler): OwnershipMark | undefined {
	return (handler as WidgetHandler & { [OWNERSHIP_MARK]?: OwnershipMark })[OWNERSHIP_MARK];
}

/**
 * An EXPLICIT closed-by-design refusal: the method exists on the PHP
 * maintenance dashboard but must not run on a coexisting TS server. The
 * envelope names the reason and points the admin at the right place.
 */
export function engineDenied(what: string, reason: string): WidgetHandler {
	const handler: WidgetHandler = async () => ({
		result: false,
		msg: `Error. '${what}' is not runnable on this engine: ${reason}. Run it from the PHP maintenance dashboard.`,
		errors: [`engine_denied: ${what}`],
	});
	return Object.assign(handler, {
		[OWNERSHIP_MARK]: { kind: 'denied', what } satisfies OwnershipMark,
	});
}

/**
 * An ownership-GATED execute: `whenClosed` answers while the engine does not
 * own the install (responses byte-frozen BY CONSTRUCTION: the same closure
 * runs, nothing is reconstructed), `whenOpen` once core/update/ownership.ts
 * says the TS engine owns it. Since the 2026-07-11 cutover the gate is
 * collapsed to `true` (single writer), so `whenOpen` always runs at runtime —
 * the combinator and its classification marks stay: they are what
 * update_ownership_tripwire enumerates, and the chokepoint a future
 * ownership condition would re-enter through.
 */
export function gated(
	what: string,
	whenClosed: WidgetHandler,
	whenOpen: WidgetHandler,
): WidgetHandler {
	const handler: WidgetHandler = async (options, principal) => {
		const { engineOwnsInstall } = await import('../../update/ownership.ts');
		return engineOwnsInstall() ? whenOpen(options, principal) : whenClosed(options, principal);
	};
	return Object.assign(handler, {
		[OWNERSHIP_MARK]: {
			kind: 'gated',
			what,
			whenClosed,
			openIsStub: whenOpen === whenClosed,
		} satisfies OwnershipMark,
	});
}

/**
 * A gated execute whose open branch is NOT PORTED YET (UPDATE_PROCESS phases
 * 2-5): both branches are the SAME engineDenied closure, so byte-drift is
 * impossible in either gate state, and the owning phase later swaps in a real
 * `whenOpen` with a one-argument change (`openIsStub` flags the pending port).
 */
export function gatedStub(what: string, reason: string): WidgetHandler {
	const denied = engineDenied(what, reason);
	return gated(what, denied, denied);
}

/** The dispatch-gate failure envelope. */
export function failed(msg: string, errors: string[]): WidgetResponse {
	return { result: false, msg: `Error. Request failed. ${msg}`, errors };
}

// (callDiffusionEngine — the old-engine unix-socket RPC with the
// X-Diffusion-Internal-Token header — was deleted at the 2026-07-11 cutover:
// the native media-index/delete seams in core/diffusion_bridge are the only
// transport. DIFFUSION_PLAN P5 step 3; rewrite/CUTOVER_RUNBOOK.md §5.)
