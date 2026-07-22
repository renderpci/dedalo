/**
 * API dispatch — RQO → handler, behind the §7.1 allowlists and the auth/CSRF
 * gates (spec §7.1-7.3).
 *
 * Design (stronger than the PHP reflection fallback): handlers are EXPLICITLY
 * registered in the ACTION_REGISTRY map — there is no dynamic method lookup,
 * so an unregistered (api class, action) pair simply does not exist. The
 * registry is the single source of truth for what the API can do.
 *
 * Gate order per request (mirrors PHP dd_manager::manage_request):
 *   1. api class + action must be registered (allowlist);
 *   2. auth: session required unless the action is in NO_LOGIN_ACTIONS;
 *   3. CSRF: required for authenticated non-exempt actions (constant-time);
 *   4. handler runs with an explicit RequestContext (no globals).
 *
 * WS-C S2-25: this file is REGISTRY ASSEMBLY + GATES + ENVELOPE only. The
 * per-class handler bodies live in api/handlers/<class>.ts (statically
 * imported below); the read sub-action routing lives in the section facade
 * (src/core/section/read_facade.ts).
 */

import { ragApiActions } from '../../ai/rag/api.ts';
import { config } from '../../config/config.ts';
import { readEnv } from '../../config/env.ts';
import type { Rqo } from '../concepts/rqo.ts';
import {
	ERROR_REPORT_ACTION_KEYS,
	receiverEnabled,
	reporterIpAllowed,
} from '../error_report/gate.ts';
import { INSTALL_ACTION_KEYS, installIpAllowed, isSealed } from '../install/gate.ts';
import { resolvePrincipal } from '../security/permissions.ts';
import { verifyCsrf } from '../security/session_store.ts';
import { logApiAccess } from './access_log.ts';
import type { ActionHandler, ApiRequestContext } from './handler_context.ts';
import { areaMaintenanceApiActions } from './handlers/dd_area_maintenance_api.ts';
import { component3dApiActions } from './handlers/dd_component_3d_api.ts';
import { componentAvApiActions } from './handlers/dd_component_av_api.ts';
import { componentInfoApiActions } from './handlers/dd_component_info.ts';
import { componentPortalApiActions } from './handlers/dd_component_portal_api.ts';
import { coreApiActions } from './handlers/dd_core_api.ts';
import { diffusionApiActions } from './handlers/dd_diffusion_api.ts';
import { errorReportApiActions } from './handlers/dd_error_report_api.ts';
import { mcpApiActions } from './handlers/dd_mcp_api.ts';
import { toolsApiActions } from './handlers/dd_tools_api.ts';
import { tsApiActions } from './handlers/dd_ts_api.ts';
import { utilsApiActions } from './handlers/dd_utils_api.ts';
import { isModulePoisonError, markProcessPoisoned } from './process_health.ts';
import { type ApiResult, denied } from './response.ts';

export type { ApiRequestContext } from './handler_context.ts';
export type { ApiResult } from './response.ts';

/**
 * Actions callable without a session (PHP dd_manager no-login list, trimmed to
 * implemented). Keyed on the `${dd_api}:${action}` PAIR (L8) — a future handler
 * with a colliding action name in another class must NOT inherit the exemption.
 */
export const NO_LOGIN_ACTIONS: ReadonlySet<string> = new Set([
	'dd_utils_api:login',
	'dd_core_api:get_environment',
	'dd_core_api:start',
	'dd_utils_api:get_login_context',
	// Forgot-password recovery (PHP dd_manager pre-auth whitelist): the user is
	// locked out by definition. Anti-enumeration/throttling live in
	// security/password_reset.ts.
	'dd_utils_api:request_password_reset',
	'dd_utils_api:confirm_password_reset',
	// Machine-to-machine intake from remote installations' servers (WC-017);
	// Gate 1c (flag + IP) runs first, the handler owns throttle/token/schema.
	'dd_error_report_api:receive_report',
	// Ontology-master surface (UPDATE_PROCESS Phase 2, PHP parity): remote
	// installations probe reachability + fetch the update manifest without a
	// session. Both handlers fail closed unless IS_AN_ONTOLOGY_SERVER is set;
	// the manifest additionally requires a configured access code.
	'dd_utils_api:get_server_ready_status',
	'dd_utils_api:get_ontology_update_info',
	// Code-master surface (UPDATE_PROCESS Phase 4, PHP parity): the release
	// manifest, fail-closed on IS_A_CODE_SERVER + a configured CODE_SERVERS code.
	'dd_utils_api:get_code_update_info',
]);

/**
 * Actions exempt from CSRF (PHP CSRF_EXEMPT_ACTIONS, trimmed to implemented).
 * `start` is exempt (the very first call has no token yet). PHP does NOT
 * exempt read/count — the client echoes the token on every call; we match that
 * (spec §3: never weaker than PHP). Keyed on the `${dd_api}:${action}` pair (L8).
 */
export const CSRF_EXEMPT_ACTIONS: ReadonlySet<string> = new Set([
	'dd_utils_api:login',
	'dd_core_api:get_environment',
	'dd_core_api:start',
	'dd_utils_api:get_login_context',
	// Forgot-password recovery (PHP CSRF_EXEMPT_ACTIONS parity): pre-auth by
	// design — the login page holds no token; there is no session authority for
	// a cross-site request to ride.
	'dd_utils_api:request_password_reset',
	'dd_utils_api:confirm_password_reset',
	// PHP CSRF_EXEMPT_ACTIONS: the service worker fires it from its own
	// context, outside the page that holds the token. Read-only; still
	// AUTHENTICATED (deliberately NOT in NO_LOGIN_ACTIONS, matching PHP).
	'dd_utils_api:get_dedalo_files',
	// Error-report intake (WC-017): anonymous machine-to-machine POST — there
	// is no session authority for a cross-site request to ride (the login
	// posture); exempting also covers an authenticated master admin posting.
	'dd_error_report_api:receive_report',
	// Ontology + code master surfaces: anonymous machine-to-machine POSTs
	// (same no-session-authority posture as receive_report).
	'dd_utils_api:get_server_ready_status',
	'dd_utils_api:get_ontology_update_info',
	'dd_utils_api:get_code_update_info',
]);

/**
 * The explicit action registry: dd_api → action → handler. Each class's
 * handlers are defined in api/handlers/<class>.ts and assembled here — the
 * registry stays the single allowlist source of truth (WS-C S2-25).
 *
 * dd_rag_api — greenfield RAG retrieval (spec §8; src/ai/rag). Results are
 * ACL-gated inside the handlers (schema ACL + per-record projects filter — the
 * DoD chokepoint); the class+action allowlist is this registry block itself.
 */
const ACTION_REGISTRY: Record<string, Record<string, ActionHandler>> = {
	dd_core_api: coreApiActions,
	dd_tools_api: toolsApiActions,
	dd_area_maintenance_api: areaMaintenanceApiActions,
	dd_diffusion_api: diffusionApiActions,
	dd_component_portal_api: componentPortalApiActions,
	dd_component_av_api: componentAvApiActions,
	dd_component_info: componentInfoApiActions,
	dd_component_3d_api: component3dApiActions,
	dd_ts_api: tsApiActions,
	dd_utils_api: utilsApiActions,
	dd_rag_api: ragApiActions,
	// Error-report intake (WC-017, TS-only): ONE pre-auth action, reachable
	// only where DEDALO_ERROR_REPORT_RECEIVER is on (Gate 1c below).
	dd_error_report_api: errorReportApiActions,
	// The in-process MCP/agent bridge for tool_assistant (fail-closed: every
	// action refuses unless DEDALO_AGENT_HTTP_ENABLED=true — see the handler).
	dd_mcp_api: mcpApiActions,
};

/**
 * Dispatch one RQO through all gates, then emit the structured access-log
 * line/counters for EVERY outcome — including gate denials (audit S2-37).
 * The wrapper owns only timing + logging; all gates live in executeRqo.
 */
export async function dispatchRqo(rqo: Rqo, context: ApiRequestContext): Promise<ApiResult> {
	const startedAt = context.startedAt ?? performance.now();
	const result = await executeRqo(rqo, context);
	logApiAccess({
		requestId: context.requestId,
		userId: context.session?.userId ?? null,
		apiClass: String(rqo.dd_api ?? 'dd_core_api'),
		action: typeof rqo.action === 'string' ? rqo.action : String(rqo.action ?? ''),
		status: result.status,
		ms: performance.now() - startedAt,
		detail: summarizeRqo(rqo),
	});
	return result;
}

/**
 * Compact request-shape summary for the slow-request warn line (cheap field
 * reads, never a full stringify). Without this, a "took 24s" line is
 * undiagnosable after the fact — the 2026-07-20 relation-list hunt burned an
 * hour reconstructing what one log line should have said.
 */
function summarizeRqo(rqo: Rqo): string {
	try {
		const source = (rqo.source ?? {}) as Record<string, unknown>;
		const sqo = (rqo.sqo ?? {}) as Record<string, unknown>;
		const sections = Array.isArray(sqo.section_tipo)
			? (sqo.section_tipo as unknown[])
					.map((s) => (typeof s === 'string' ? s : ((s as { tipo?: string })?.tipo ?? '?')))
					.slice(0, 6)
					.join(',')
			: '';
		const parts = [
			`src=${String(source.model ?? '')}:${String(source.tipo ?? '')}`,
			source.action ? `srcAction=${String(source.action)}` : '',
			source.mode ? `mode=${String(source.mode)}` : '',
			source.section_id !== undefined && source.section_id !== null
				? `id=${String(source.section_id)}`
				: '',
			sections !== '' ? `sqo=[${sections}]` : '',
			sqo.limit !== undefined ? `limit=${String(sqo.limit)}` : '',
			// offset matters for deep-page diagnosis: a big-log list slow ONLY at a
			// far offset is the late-lookup/flip regime (WC-046), not a shape bug.
			sqo.offset !== undefined && sqo.offset !== null && Number(sqo.offset) > 0
				? `offset=${String(sqo.offset)}`
				: '',
			sqo.filter !== undefined && sqo.filter !== null ? 'filter=yes' : '',
			Array.isArray(sqo.filter_by_locators) ? `locators=${sqo.filter_by_locators.length}` : '',
		];
		return parts.filter((part) => part !== '').join(' ');
	} catch {
		return '';
	}
}

/** The gate chain + handler execution (see dispatchRqo). */
async function executeRqo(rqo: Rqo, context: ApiRequestContext): Promise<ApiResult> {
	const apiClass = rqo.dd_api ?? 'dd_core_api';
	const action = rqo.action;

	// Gate 1 — allowlist: the pair must be explicitly registered.
	const handler = ACTION_REGISTRY[apiClass]?.[action];
	if (typeof action !== 'string' || handler === undefined) {
		return denied(400, 'Undefined or unauthorized method (action)');
	}

	const actionKey = `${apiClass}:${action}`;

	// Gate 1b — install window (DEC-19). The install surface is pre-auth by
	// design (a fresh instance has no session), but ONLY while unsealed and ONLY
	// from an allowed address. Once sealed the surface is GONE (404), so a
	// configured server exposes no residual pre-auth install actions.
	const isInstallSurface = INSTALL_ACTION_KEYS.has(actionKey);
	if (isInstallSurface) {
		if (isSealed()) return denied(404, 'Not found');
		if (!installIpAllowed(context.clientIp)) {
			return denied(403, 'Install not permitted from this address');
		}
	}

	// Gate 1c — error-report intake window (WC-017). Disabled ⇒ answer the
	// EXACT Gate-1 unregistered-action shape, so a probe cannot learn the
	// endpoint exists on this host; the optional IP allowlist mirrors the
	// install gate. Throttle/token/schema live in the handler.
	if (ERROR_REPORT_ACTION_KEYS.has(actionKey)) {
		if (!receiverEnabled()) {
			return denied(400, 'Undefined or unauthorized method (action)');
		}
		if (!reporterIpAllowed(context.clientIp)) {
			return denied(403, 'Error report not permitted from this address');
		}
	}

	// Gate 2 — authentication. The exemption is keyed on the (class, action) pair.
	// The install surface is additionally pre-auth WHILE UNSEALED (checked above);
	// individual record-writing install steps re-check the session in the handler.
	const noLogin = NO_LOGIN_ACTIONS.has(actionKey) || (isInstallSurface && !isSealed());
	if (context.session === null && !noLogin) {
		return denied(401, 'Authentication required');
	}

	// Gate 3 — CSRF for authenticated, non-exempt actions. The rejection is the
	// exact shape the client's transparent retry keys on (SEC-008,
	// data_manager): errors MUST include 'csrf_failed' and the body MUST carry
	// the session's current token so the single retry can succeed — without
	// the fresh token the client would loop on the stale one.
	if (context.session !== null && !CSRF_EXEMPT_ACTIONS.has(actionKey)) {
		if (!verifyCsrf(context.session, context.csrfCandidate)) {
			return {
				status: 403,
				body: {
					result: false,
					msg: 'Error. Invalid or missing CSRF token',
					errors: ['csrf_failed'],
					action,
					csrf_token: context.session.csrfToken,
				},
			};
		}
	}

	// Resolve the authorization identity ONCE per request, now that the auth gate
	// has passed, and seed it on the context. Previously ~27 handlers each
	// re-resolved it from the DB via a dead `context.principal ?? …` fast-path;
	// they now read the seeded value through requirePrincipal(context).
	if (context.session !== null) {
		context.principal = await resolvePrincipal(context.session.userId);
	}

	// Open the request-scoped IDENTITY and LANGUAGE contexts (spec §4,
	// request-isolation invariant). Both are seeded from the session and read by
	// every resolver the handler reaches, so a long-lived process never bleeds one
	// caller's identity or language into another's request:
	//  - the identity scope (core/security/request_context.ts) carries the seeded
	//    principal + session as a BACKSTOP for leaf/future code with no parameter
	//    to reach for (the dominant path still threads `principal` explicitly);
	//  - the language scope (core/resolve/request_lang.ts) carries the effective
	//    interface/data languages (PHP per-request DEDALO_*_LANG constants), so a
	//    user's menu choice takes effect on the next request without threading a
	//    lang parameter through every call. Both fall back to install defaults
	//    when the session carries no override.
	const { runWithRequestContext } = await import('../security/request_context.ts');
	const { runWithRequestLangs } = await import('../resolve/request_lang.ts');
	let result: ApiResult;
	try {
		result = await runWithRequestContext(
			{
				principal: context.principal,
				session: context.session,
				requestId: context.requestId,
				clientIp: context.clientIp,
			},
			() =>
				runWithRequestLangs(
					{
						applicationLang: context.session?.applicationLang ?? config.menu.applicationLang,
						dataLang: context.session?.dataLang ?? config.menu.dataLang,
					},
					() => handler(rqo, context),
				),
		);
	} catch (error) {
		// Final fallback (PHP json/index.php Throwable catch, :364): an unexpected
		// handler exception must degrade to the client envelope — HTTP 200 +
		// result:false — NOT a raw 500 error page. The vanilla client only reads
		// api_response.result to decide failure; a 500 HTML body leaves data_manager
		// unable to parse the response (it stalls/times out) instead of failing fast
		// like PHP. Log the full detail server-side; return the PHP-shaped msg.
		const message = error instanceof Error ? error.message : String(error);
		console.error(
			`Dedalo API EXCEPTION (${apiClass}::${action}) [req ${context.requestId}]: ${message}`,
			error instanceof Error ? error.stack : '',
		);
		// A TDZ-shaped ReferenceError means a module evaluation failed and Bun has
		// cached the failure — this process will serve the identical error forever
		// (first-load race class, 2026-07-07). Flip the poison latch so /health
		// goes 503 and the watchdog recycles the process instead of it serving
		// degraded for its whole lifetime.
		if (isModulePoisonError(error)) {
			markProcessPoisoned(`TDZ ReferenceError in ${apiClass}::${action}: ${message}`);
		}
		// The raw exception text can carry SQL fragments, filesystem paths, and
		// internal identifiers — it MUST stay server-side (logged above, keyed by
		// request_id). The client gets a generic message + the correlation id; the
		// exception is echoed on the wire ONLY when DEDALO_DEBUG_API_ERRORS=true (dev).
		const exposeExceptionDetail = readEnv('DEDALO_DEBUG_API_ERRORS') === 'true';
		result = {
			status: 200,
			body: {
				result: false,
				msg: 'Throwable Exception when calling Dédalo API',
				errors: ['An unexpected error occurred'],
				request_id: context.requestId,
				...(exposeExceptionDetail ? { debug: { exception: message } } : {}),
			},
		};
	}
	// PHP appends the csrf token to every response for client transparency.
	if (context.session !== null) {
		result.body.csrf_token = context.session.csrfToken;
	}
	return result;
}
