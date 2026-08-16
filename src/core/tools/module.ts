/**
 * The ToolServerModule plugin contract — what a tool package's server/index.ts
 * exports so the loader can register it and the dispatcher can call its actions.
 *
 * This is the TS re-expression of the PHP tool class shape: `const API_ACTIONS`
 * (the remote surface + declarative permission gates), `const BACKGROUND_RUNNABLE`
 * (the second allowlist for async execution), and the framework hooks
 * `is_available()` / `on_register()` / `on_remove()`.
 *
 * DESIGN CHOICE (vs the PHP reflect-a-method model): there is NO reflection. A
 * tool method exists on the API only if it is a property of `apiActions`; the
 * handler is a typed function, so PHP's "method is public + static" and
 * "signature is (object $options)" gates are structural here, not runtime
 * checks. A tool is discovered by a deterministic, allowlisted directory scan
 * (see loader.ts) — never by request-supplied names.
 */

import type { ApiEnvelope } from '../errors/schema.ts';
import type { Principal } from '../security/permissions.ts';
import { currentRequestContext } from '../security/request_context.ts';

/**
 * The response every tool action returns. It REPLACES the API envelope
 * wholesale (PHP: the tool's return value is the response body) — so it IS the
 * API envelope v2 (engineering/ERRORS_SPEC.md §3): `ok(data, {requestId,
 * extend?})` on success, with a tool's extra fields (streaming bodies, `pid`,
 * `job_id`, …) as extension keys; a failure is a THROWN DedaloError, never a
 * body (a non-envelope body is refused by the dispatcher as a bug).
 */
export type ToolResponse = ApiEnvelope;

/**
 * The per-request context handed to a tool action handler. `options` are the
 * (already type-checked as an object) method arguments from the RQO; `principal`
 * and `userId` identify the authenticated caller; `background` is true when the
 * action is running under the background executor (PHP process_runner path).
 *
 * `publishProgress` is the live-progress wire (PHP print_cli($process_info) →
 * the process file the client's SSE reader polls). It is present ONLY under the
 * background executor — a foreground call has no job record to publish into — so
 * a handler must treat it as optional. The payload becomes the job frame's
 * `data`, which is what render_common's status machinery renders on every tick.
 */
export interface ToolActionContext {
	principal: Principal;
	userId: number;
	options: Record<string, unknown>;
	background: boolean;
	publishProgress?: (data: object) => void;
	/**
	 * Cooperative-cancellation signal, present ONLY under the background executor
	 * (the job manager's per-job AbortController; dd_utils_api::stop_process
	 * aborts it). A long-running handler checks `signal?.aborted` at its loop
	 * boundaries and returns a partial summary — the executor never kills work
	 * mid-write.
	 */
	signal?: AbortSignal;
	/**
	 * The proxy-validated client address, for tool actions that append an
	 * activity row (dd544 IP). Optional: a handler that logs nothing ignores it,
	 * and the background executor carries the value captured at SUBMIT time —
	 * the job outlives the request, so there is no live socket to ask.
	 */
	clientIp?: string;
	/**
	 * The request id the tool's envelope carries (`ok(data, {requestId})`).
	 * OPTIONAL because a background job outlives the request that started it —
	 * read it through `toolRequestId(context)`, never directly, so a handler
	 * running under the executor degrades to '' instead of crashing.
	 */
	requestId?: string;
}

/**
 * The request id for a tool handler's envelope: the explicitly threaded one,
 * else the request-scoped identity context (foreground calls run inside
 * dispatchRqo's `runWithRequestContext`), else '' (background executor — the
 * job has no live request).
 */
export function toolRequestId(context: ToolActionContext): string {
	return context.requestId ?? currentRequestContext()?.requestId ?? '';
}

/**
 * One entry in a tool's apiActions map (PHP tool_security map form). `permission`
 * selects the declarative gate the framework runs BEFORE the handler:
 *  - 'section'      → read/write level `minLevel` on options.section_tipo;
 *  - 'section_list' → the same level on EVERY target `sectionTipos` pulls out of
 *                     the options (a batch action whose targets ride inside the
 *                     payload — PHP's per-file assert_section_permission loop);
 *  - 'tipo'         → level `minLevel` on options.section_tipo + options.tipo;
 *  - 'record'       → section level + the record (numeric options.section_id) must
 *                     be inside the caller's project scope;
 *  - 'record_tipo'  → BOTH: level `minLevel` on the (section_tipo, component tipo)
 *                     PAIR *and* the record scope. This is the gate for an action
 *                     targeting a COMPONENT OF A RECORD (the whole media family).
 *                     'tipo' and 'record' each express only one half, and picking
 *                     either silently drops the other — which is how a user denied
 *                     level 2 on one media component could still delete its files;
 *  - 'developer'    → caller must be a developer (no section target asserted);
 *  - null           → listed but ungated here (the handler gates imperatively).
 *
 * Choosing between them: does the action name a component AND a record id? Then
 * it is 'record_tipo'. PHP asserted both at every such door
 * (assert_tipo_permission + assert_record_in_user_scope).
 */
export interface ToolActionSpec {
	permission: 'section' | 'section_list' | 'tipo' | 'record' | 'record_tipo' | 'developer' | null;
	/** dd774 level required on the target (1=read, 2=write, 3=admin). Default 2. */
	minLevel?: number;
	/**
	 * REQUIRED for 'section_list': extract the batch's section targets from the
	 * request options. Every returned value is gated at `minLevel`; an empty list
	 * or any invalid entry is a denial (fail-closed). It lives on the spec — not
	 * inside the handler — so the gate still runs BEFORE the background fork,
	 * where a denial is still observable to the caller.
	 */
	sectionTipos?: (options: Record<string, unknown>) => unknown[];
	handler: (context: ToolActionContext) => Promise<ToolResponse>;
}

/** The caller context passed to a tool's is_available() hook (PHP get_tools context). */
export interface ToolAvailabilityContext {
	/** The calling element's model (e.g. 'section', 'component_relation_children'). */
	callerModel: string;
	tipo: string;
	sectionTipo: string;
	isComponent: boolean;
	mode: string;
}

/** The object a tool package's server/index.ts must export as `tool`. */
export interface ToolServerModule {
	/** MUST equal the package directory name and match ^tool_[a-z0-9_]+$. */
	name: string;
	/** The remote action surface. Lifecycle hooks below must NEVER appear here. */
	apiActions: Record<string, ToolActionSpec>;
	/**
	 * The subset of action names allowed to run in the background (PHP
	 * BACKGROUND_RUNNABLE). An action not listed here is refused a background
	 * fork even if the client requests one; absent means no background actions.
	 */
	backgroundRunnable?: readonly string[];
	/**
	 * Availability hook (PHP is_available) — decides whether the tool shows in a
	 * given element's toolbar. MUST be fast and side-effect-free (the result is
	 * cached per user/tipo/section_tipo). Framework-called only.
	 */
	isAvailable?: (context: ToolAvailabilityContext) => boolean | Promise<boolean>;
	/** Registration hook (PHP on_register) — framework-called, failures logged not fatal. */
	onRegister?: () => Promise<void>;
	/** Removal hook (PHP on_remove) — framework-called, failures logged not fatal. */
	onRemove?: () => Promise<void>;
}

/** The reserved lifecycle keys that must never appear inside apiActions. */
export const LIFECYCLE_KEYS: readonly string[] = ['isAvailable', 'onRegister', 'onRemove'];
