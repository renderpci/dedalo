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

import type { Principal } from '../security/permissions.ts';

/**
 * The response envelope every tool action returns. It REPLACES the API envelope
 * wholesale (PHP: the tool's return value is the response body), so a tool owns
 * its own `result`/`msg`/`errors` and any extra fields (e.g. streaming bodies).
 */
export interface ToolResponse {
	result: unknown;
	msg: string;
	errors?: string[];
	[key: string]: unknown;
}

/**
 * The per-request context handed to a tool action handler. `options` are the
 * (already type-checked as an object) method arguments from the RQO; `principal`
 * and `userId` identify the authenticated caller; `background` is true when the
 * action is running under the background executor (PHP process_runner path).
 */
export interface ToolActionContext {
	principal: Principal;
	userId: number;
	options: Record<string, unknown>;
	background: boolean;
}

/**
 * One entry in a tool's apiActions map (PHP tool_security map form). `permission`
 * selects the declarative gate the framework runs BEFORE the handler:
 *  - 'section'    → read/write level `minLevel` on options.section_tipo;
 *  - 'tipo'       → level `minLevel` on options.section_tipo + options.tipo;
 *  - 'record'     → section level + the record (numeric options.section_id) must
 *                   be inside the caller's project scope;
 *  - 'developer'  → caller must be a developer (no section target asserted);
 *  - null         → listed but ungated here (the handler gates imperatively).
 */
export interface ToolActionSpec {
	permission: 'section' | 'tipo' | 'record' | 'developer' | null;
	/** dd774 level required on the target (1=read, 2=write, 3=admin). Default 2. */
	minLevel?: number;
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
