/**
 * Maintenance-widget SHARED CONTRACT (S2-23 split): the types every
 * `widgets/<widget_id>.ts` module implements and the helpers more than one
 * widget needs. The per-widget modules export ONE `WidgetModule`; registry.ts
 * assembles them (catalog order, API_ACTIONS, GET_VALUE) — the tools/loader.ts
 * pattern. Adding a widget = adding ONE file + ONE registry import line.
 */

import { DedaloError } from '../../errors/dedalo_error.ts';
import { type ApiEnvelope, ENVELOPE_RESERVED_KEYS } from '../../errors/schema.ts';
import type { Principal } from '../../security/permissions.ts';

/**
 * What a widget method ANSWERS WITH — its payload, not a wire body
 * (engineering/ERRORS_SPEC.md §4: only the converter builds an envelope). The
 * ONE wrapping site is api/handlers/dd_area_maintenance_api.ts, which turns
 * this into `ok(data, {requestId, extend})`; a widget FAILS by throwing a
 * DedaloError, which the dispatch catch converts.
 */
export interface WidgetResponse {
	/** The widget payload — becomes the envelope `data`. */
	data: unknown;
	/** Operator sentence the maintenance panel prints at top level (`msg`); omit for a plain OK. */
	msg?: string;
	/** Non-fatal per-item findings the panel lists at top level (`errors`); omit when empty. */
	errors?: string[];
	/** Other top-level keys this widget owns and the client reads by name (e.g. `root_info`). */
	extend?: Record<string, unknown>;
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
 * maintenance dashboard but must not run on a coexisting TS server. It THROWS
 * `maintenance.widget_unavailable` (503) whose public sentence names the reason
 * and points the admin at the right place.
 */
export function engineDenied(what: string, reason: string): WidgetHandler {
	const handler: WidgetHandler = async () => {
		throw new DedaloError('maintenance.widget_unavailable', {
			publicMessage: `Error. '${what}' is not runnable on this engine: ${reason}. Run it from the PHP maintenance dashboard.`,
			coordinates: { widget_action: what },
		});
	};
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

/**
 * The widget REFUSAL (caller/config fault: a missing or bad option, a target
 * that cannot be acted on, nothing selected). `maintenance.action_refused` is
 * 400 and PUBLIC, so the operator sentence reaches the admin who typed it.
 */
export function refuseAction(
	publicMessage: string,
	coordinates?: Record<string, string | number>,
): never {
	throw new DedaloError('maintenance.action_refused', {
		publicMessage,
		...(coordinates === undefined ? {} : { coordinates }),
	});
}

/**
 * The widget FAILURE (it ran and could not finish). `maintenance.action_failed`
 * is 500 and PUBLIC: the sentence is authored here, never a raw
 * `error.message` — the original travels as `cause` (logs / debug block only).
 */
export function failAction(
	publicMessage: string,
	fields: { cause?: unknown; coordinates?: Record<string, string | number> } = {},
): never {
	throw new DedaloError('maintenance.action_failed', {
		publicMessage,
		...(fields.cause === undefined ? {} : { cause: fields.cause }),
		...(fields.coordinates === undefined ? {} : { coordinates: fields.coordinates }),
	});
}

/**
 * A subsystem OUTCOME (`{ok, msg, errors}` — the ontology / install / db-assets
 * modules' internal shape) → the widget payload. A failed outcome THROWS, with
 * its own findings folded into the public sentence: this is an admin-only
 * surface and the findings ARE the answer the operator came for.
 *
 * The shape is checked at runtime (never silently narrowed): a caller handing
 * over something else fails loudly rather than serving `data: undefined`.
 */
export interface SubsystemOutcome {
	ok: boolean;
	msg?: string;
	/** Per-item findings; `unknown[]` because the db-asset writers collect raw values. */
	errors?: unknown[];
}

/** The outcome's findings as wire strings (absent/!array ⇒ none). */
function outcomeErrors(outcome: SubsystemOutcome): string[] {
	return (Array.isArray(outcome.errors) ? outcome.errors : []).map(String);
}

/** The outcome's own sentence, or undefined when it carries none. */
function outcomeMsg(outcome: SubsystemOutcome): string | undefined {
	return typeof outcome.msg === 'string' ? outcome.msg : undefined;
}

/** Loud shape check — a caller handing over a non-outcome must never serve `data: undefined`. */
function assertOutcome(outcome: SubsystemOutcome): void {
	if (typeof outcome.ok !== 'boolean') {
		throw new DedaloError('internal.unexpected', {
			message: `widget outcome carries no boolean 'ok': ${JSON.stringify(outcome)}`,
		});
	}
}

/**
 * The refusal a FAILED outcome throws: its own sentence, with its findings
 * folded in — on an admin-only surface the findings ARE the answer.
 */
function refuseOutcome(
	sentence: string | undefined,
	msg: string | undefined,
	errors: string[],
): never {
	const text = sentence ?? msg ?? 'Error. Request failed';
	failAction(errors.length === 0 ? text : `${text} (${errors.join('; ')})`);
}

export function fromOutcome(
	outcome: SubsystemOutcome,
	options: { failed?: string; extend?: Record<string, unknown> } = {},
): WidgetResponse {
	assertOutcome(outcome);
	const errors = outcomeErrors(outcome);
	const msg = outcomeMsg(outcome);
	if (!outcome.ok) refuseOutcome(options.failed, msg, errors);
	return {
		data: true,
		...(msg === undefined ? {} : { msg }),
		...(errors.length === 0 ? {} : { errors }),
		...(options.extend === undefined ? {} : { extend: options.extend }),
	};
}

/**
 * A subsystem that already answers an OK ENVELOPE (core/update/code_update.ts,
 * code_build.ts — they refuse by throwing and build `ok(data, {extend})`
 * themselves) → the widget payload, so the ONE wrapping site re-wraps it once
 * instead of nesting an envelope inside `data`. `msg` / `errors` are lifted
 * back to their widget fields; every other non-reserved key is the subsystem's
 * own extension key and rides in `extend`.
 */
export function fromEnvelope(envelope: ApiEnvelope): WidgetResponse {
	if (envelope.ok !== true) {
		// Those subsystems refuse by THROWING; an err envelope handed over here is
		// a contract slip — re-raise it typed rather than serve it as `data`.
		throw new DedaloError(envelope.error.code, { message: envelope.error.message });
	}
	const { data, msg, errors } = envelope;
	return {
		data,
		...(typeof msg === 'string' ? { msg } : {}),
		...(Array.isArray(errors) && errors.length > 0 ? { errors: errors.map(String) } : {}),
		...envelopeExtension(envelope),
	};
}

/**
 * The envelope's non-reserved keys as the widget `extend` (absent when there
 * are none). `msg` / `errors` are extension keys the caller has ALREADY lifted
 * to their widget fields, so they are skipped here rather than doubled.
 */
function envelopeExtension(envelope: ApiEnvelope): Pick<WidgetResponse, 'extend'> {
	const reserved = new Set([...ENVELOPE_RESERVED_KEYS, 'msg', 'errors']);
	const extend: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(envelope)) {
		if (!reserved.has(key)) extend[key] = value;
	}
	return Object.keys(extend).length === 0 ? {} : { extend };
}

// (callDiffusionEngine — the old-engine unix-socket RPC with the
// X-Diffusion-Internal-Token header — was deleted at the 2026-07-11 cutover:
// the native media-index/delete seams in core/diffusion_bridge are the only
// transport. DIFFUSION_PLAN P5 step 3; rewrite/CUTOVER_RUNBOOK.md §5.)
