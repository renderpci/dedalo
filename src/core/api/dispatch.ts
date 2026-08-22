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
 *
 * ENVELOPE v2 (engineering/ERRORS_SPEC.md §4 — the converter chokepoint):
 * every gate REFUSES BY THROWING a DedaloError; a handler succeeds by
 * returning `ok(data, …)` and fails by throwing. The ONE catch below turns
 * any throw into `{status, body}` via toErrorEnvelope (registry status,
 * ok:false ⇒ non-2xx, Retry-After threaded on the ApiResult) and reports it
 * through logError. A handler body that is NOT an envelope (no `ok` key —
 * the PHP `{result,msg,errors}` fossil) is a BUG, refused loudly as
 * `internal.unexpected` naming the action (the P1-era legacy_body_adapter
 * that used to translate it is DELETED; error_taxonomy_tripwire guards).
 */

import { ragApiActions } from '../../ai/rag/api.ts';
import { config } from '../../config/config.ts';
import type { Rqo } from '../concepts/rqo.ts';
import {
	ERROR_REPORT_ACTION_KEYS,
	receiverEnabled,
	reporterIpAllowed,
} from '../error_report/gate.ts';
import { toErrorEnvelope } from '../errors/convert.ts';
import { DedaloError } from '../errors/dedalo_error.ts';
import { logError } from '../errors/log.ts';
import { INSTALL_ACTION_KEYS, installIpAllowed, installSurfaceReachable } from '../install/gate.ts';
import { resolvePrincipal, SUPERUSER_ID } from '../security/permissions.ts';
import { verifyCsrf } from '../security/session_store.ts';
import { logApiAccess } from './access_log.ts';
import type { ActionHandler, ApiRequestContext } from './handler_context.ts';
import { areaMaintenanceApiActions } from './handlers/dd_area_maintenance_api.ts';
import { component3dApiActions } from './handlers/dd_component_3d_api.ts';
import { componentAvApiActions } from './handlers/dd_component_av_api.ts';
import { componentInfoApiActions } from './handlers/dd_component_info.ts';
import { componentPortalApiActions } from './handlers/dd_component_portal_api.ts';
import { componentTextAreaApiActions } from './handlers/dd_component_text_area_api.ts';
import { coreApiActions } from './handlers/dd_core_api.ts';
import { diffusionApiActions } from './handlers/dd_diffusion_api.ts';
import { errorReportApiActions } from './handlers/dd_error_report_api.ts';
import { externalApiActions } from './handlers/dd_external_api.ts';
import { identifyApiActions } from './handlers/dd_identify_api.ts';
import { mcpApiActions } from './handlers/dd_mcp_api.ts';
import { toolsApiActions } from './handlers/dd_tools_api.ts';
import { tsApiActions } from './handlers/dd_ts_api.ts';
import { utilsApiActions } from './handlers/dd_utils_api.ts';
import type { ApiResult } from './response.ts';

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
	// The LOGIN PANEL's language selector posts change_lang before any session
	// exists. Pre-auth by necessity: without it the choice could not be stored at
	// all and the form snapped back to the install default on every reload. The
	// handler persists to the session row when there is one, and to the anonymous
	// language cookie when there is not; the value is allowlist-validated either way.
	'dd_utils_api:change_lang',
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
	// Transcription tags (WC-077): get_tags_info (read the resolved tag payload)
	// + delete_tag (remove one tag's marks from every lang of the text).
	dd_component_text_area_api: componentTextAreaApiActions,
	dd_component_av_api: componentAvApiActions,
	dd_component_info: componentInfoApiActions,
	dd_component_3d_api: component3dApiActions,
	dd_ts_api: tsApiActions,
	dd_utils_api: utilsApiActions,
	dd_rag_api: ragApiActions,
	// Object identification (src/core/identify): find the records that share a
	// seed's identifying features. Authenticated + CSRF-gated like every other
	// class here; the RESULTS are ACL-gated inside the engine (the principal runs
	// through both the pool query and the per-candidate record read).
	dd_identify_api: identifyApiActions,
	// External record services (src/external): search a third-party catalogue
	// THROUGH the engine, so the request goes through the one outbound door and
	// all of its controls. Deliberately absent from NO_LOGIN_ACTIONS and from
	// CSRF_EXEMPT_ACTIONS: the action makes the SERVER open an outbound socket on
	// the caller's behalf, so an anonymous visitor must never be able to drive it.
	dd_external_api: externalApiActions,
	// Error-report intake (WC-017, TS-only): ONE pre-auth action, reachable
	// only where DEDALO_ERROR_REPORT_RECEIVER is on (Gate 1c below).
	dd_error_report_api: errorReportApiActions,
	// The in-process MCP/agent bridge for tool_assistant (fail-closed: every
	// action refuses unless DEDALO_AGENT_HTTP_ENABLED=true — see the handler).
	dd_mcp_api: mcpApiActions,
};

/**
 * TEST SEAM (error_taxonomy_tripwire's runtime leg): every registered
 * (class, action) pair, so the gate can force a throw through each and prove
 * the wire is converter-made — the registry itself stays private.
 */
export function listRegisteredActions(): readonly { apiClass: string; action: string }[] {
	return Object.entries(ACTION_REGISTRY).flatMap(([apiClass, table]) =>
		Object.keys(table).map((action) => ({ apiClass, action })),
	);
}

/** TEST SEAM (same gate): the live handler table of a class, to swap a probe handler in and out. */
export function actionTableFor(apiClass: string): Record<string, ActionHandler> | undefined {
	return classTableFor(apiClass);
}

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
		...errorIdentity(result.body),
	});
	return result;
}

/** `{error_code, error_category}` of an ok:false envelope for the access log; nothing on success. */
function errorIdentity(body: ApiResult['body']): { error_code?: string; error_category?: string } {
	if (body.ok !== false) return {};
	const error = body.error as { code: string; category: string };
	return { error_code: error.code, error_category: error.category };
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

/**
 * The gate chain + handler execution (see dispatchRqo) — and THE CATCH: the
 * one place a throw becomes a wire body. Every refusal below is a throw of a
 * registered code; the catch converts (registry status), logs, and threads
 * Retry-After. `csrf_token` is appended to every response for client
 * transparency (PHP parity), success or failure.
 */
async function executeRqo(rqo: Rqo, context: ApiRequestContext): Promise<ApiResult> {
	const apiClass = String(rqo.dd_api ?? 'dd_core_api');
	const action = String(rqo.action ?? '');
	let result: ApiResult;
	try {
		result = await runGatesAndHandler(rqo, context);
	} catch (error) {
		result = failureResult(error, context, `${apiClass}::${action}`);
	}
	if (context.session !== null) {
		result.body.csrf_token = context.session.csrfToken;
	}
	return result;
}

/**
 * The converter door for the API surface. Poison-latch classification (a
 * TDZ ReferenceError anywhere in the cause chain flips /health to 503 so the
 * watchdog recycles the process) lives INSIDE toDedaloError, not here. The
 * raw exception text never reaches the wire (SQL fragments, paths): the
 * envelope carries the registry message + request_id; the exception is
 * echoed ONLY under DEDALO_DEBUG_API_ERRORS=true (convert.ts debug block).
 */
function failureResult(error: unknown, context: ApiRequestContext, subsystem: string): ApiResult {
	const converted = toErrorEnvelope(error, { requestId: context.requestId });
	logError(converted.error, { subsystem, requestId: context.requestId });
	return converted.retryAfterMs === undefined
		? { status: converted.status, body: converted.body }
		: { status: converted.status, body: converted.body, retryAfterMs: converted.retryAfterMs };
}

/**
 * Gate 1 — allowlist: the (class, action) pair must be EXPLICITLY registered.
 * Resolve with Object.hasOwn, NOT a bare index. `ACTION_REGISTRY[apiClass]?.[action]`
 * over plain object literals returns inherited Object.prototype builtins —
 * `constructor` (the Object function), `toString`/`valueOf`/`hasOwnProperty` —
 * instead of undefined, so a crafted `action:'constructor'` slipped past a
 * `=== undefined` check and violated the "an unregistered pair does not exist"
 * invariant (API-01). hasOwn on both keys + a typeof-function guard makes any
 * inherited key resolve to no handler ⇒ the documented `request.unknown_action`.
 */
function resolveHandler(apiClass: unknown, action: unknown): ActionHandler {
	const classTable = classTableFor(apiClass);
	const handler =
		classTable !== undefined && typeof action === 'string' && Object.hasOwn(classTable, action)
			? classTable[action]
			: undefined;
	if (typeof handler !== 'function') throw unknownAction(action);
	return handler;
}

function classTableFor(apiClass: unknown): Record<string, ActionHandler> | undefined {
	return typeof apiClass === 'string' && Object.hasOwn(ACTION_REGISTRY, apiClass)
		? ACTION_REGISTRY[apiClass]
		: undefined;
}

/**
 * The Gate-1 refusal — ALSO what a disabled Gate-1c surface answers, so the
 * two bodies are byte-identical (minus request_id) and a probe cannot learn
 * the endpoint exists on this host.
 */
function unknownAction(action: unknown): DedaloError {
	return new DedaloError('request.unknown_action', {
		details: { action: typeof action === 'string' ? action : String(action) },
	});
}

/**
 * Gates 1b + 1c — the pre-auth surfaces.
 *
 * 1b — install window (DEC-19, hardened by OPS-01 2026-07-28). The install
 * surface is pre-auth by design (a fresh instance has no session), but ONLY
 * on a genuinely fresh / mid-wizard box (installSurfaceReachable:
 * INSTALL_MODE || installInProgress, never once sealed) and ONLY from an
 * allowed address. A CONFIGURED or PHP-migrated instance is NOT reachable —
 * keying on the bare seal check alone exposed the unauthenticated installer on
 * every coexistence deploy (no install_status ⇒ not "sealed"). Not-reachable
 * answers `install.not_reachable` (404, GONE), the same shape a sealed
 * instance gives.
 *
 * 1c — error-report intake window (WC-017). Disabled ⇒ the EXACT Gate-1
 * unregistered-action refusal (unknownAction), so a probe cannot learn the
 * endpoint exists on this host; the optional IP allowlist mirrors the
 * install gate. Throttle/token/schema live in the handler.
 */
function runPreAuthGates(actionKey: string, action: unknown, clientIp: string): void {
	if (INSTALL_ACTION_KEYS.has(actionKey)) runInstallGate(clientIp);
	if (ERROR_REPORT_ACTION_KEYS.has(actionKey)) runErrorReportGate(action, clientIp);
}

function runInstallGate(clientIp: string): void {
	if (!installSurfaceReachable()) throw new DedaloError('install.not_reachable');
	if (!installIpAllowed(clientIp)) throw new DedaloError('install.ip_denied');
}

function runErrorReportGate(action: unknown, clientIp: string): void {
	if (!receiverEnabled()) throw unknownAction(action);
	if (!reporterIpAllowed(clientIp)) {
		throw new DedaloError('perm.denied', {
			publicMessage: 'Error report not permitted from this address',
		});
	}
}

/**
 * Gates 2 + 2b + 3 — authentication, maintenance, CSRF.
 *
 * 2 — the exemption is keyed on the (class, action) pair. The install surface
 * is additionally pre-auth WHILE UNSEALED (runPreAuthGates); individual
 * record-writing install steps re-check the session in the handler. WC-051:
 * `auth.not_logged` is the code the client's re-login recovery dispatches on
 * — this is the path an EXPIRED session takes, so it is the one that must
 * reach render_relogin() rather than dying as a thrown fetch error.
 *
 * 2b — maintenance mode (AUTH-05). PHP verify_login() re-checks maintenance
 * on EVERY request and demotes any non-root session to unauthenticated while
 * the flag is set. The login gate (auth.ts login()) blocks only NEW logins, so
 * a session minted BEFORE maintenance was enabled stayed free to keep writing
 * into the matrix tables during a data-version migration under maintenance —
 * the exact corruption window this closes. Re-checked per request; refuses
 * every non-superuser session with `auth.maintenance` (401 — the
 * unauthenticated status, so the client's relogin policy keys on BOTH codes)
 * so only root — who enables and lifts maintenance — traverses.
 * `session.userId` is the user's section_id (-1 === SUPERUSER_ID for root),
 * the same identity the login gate keys on; getServerState() reads
 * ts_state.json uncached, so the flag is live the instant root sets it.
 *
 * 3 — CSRF for authenticated, non-exempt actions. `auth.csrf_failed` (403) is
 * the code the client's transparent single retry keys on (SEC-008,
 * data_manager); the envelope MUST carry the session's current token
 * (`csrf_token`, appended by executeRqo to every response) so that retry can
 * succeed — without the fresh token the client would loop on the stale one.
 * `action` rides as an extension key for the same reason it always did.
 */
async function runAuthGates(
	actionKey: string,
	action: unknown,
	context: ApiRequestContext,
): Promise<void> {
	if (context.session === null) {
		if (!isNoLoginAction(actionKey)) throw new DedaloError('auth.not_logged');
		return;
	}
	await refuseUnderMaintenance(context.session.userId);
	if (!CSRF_EXEMPT_ACTIONS.has(actionKey) && !verifyCsrf(context.session, context.csrfCandidate)) {
		throw new DedaloError('auth.csrf_failed', { extend: { action } });
	}
}

/** Gate 2's exemption: the pair is in NO_LOGIN_ACTIONS, or it is the install surface while unsealed. */
function isNoLoginAction(actionKey: string): boolean {
	return (
		NO_LOGIN_ACTIONS.has(actionKey) ||
		(INSTALL_ACTION_KEYS.has(actionKey) && installSurfaceReachable())
	);
}

/** Gate 2b (see runAuthGates): every non-superuser session is refused while maintenance is on. */
async function refuseUnderMaintenance(userId: number): Promise<void> {
	if (userId === SUPERUSER_ID) return;
	const { getServerState } = await import('../resolve/server_state.ts');
	if (getServerState().maintenance_mode === true) throw new DedaloError('auth.maintenance');
}

/** Gates 1 → 3, then the handler inside the request-scoped identity + language contexts. */
async function runGatesAndHandler(rqo: Rqo, context: ApiRequestContext): Promise<ApiResult> {
	const apiClass = rqo.dd_api ?? 'dd_core_api';
	const action = rqo.action;
	const handler = resolveHandler(apiClass, action);
	const actionKey = `${apiClass}:${action}`;
	runPreAuthGates(actionKey, action, context.clientIp);
	await runAuthGates(actionKey, action, context);

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
	const { allowlistedPreauthLang, runWithRequestLangs } = await import(
		'../resolve/request_lang.ts'
	);
	const result = await runWithRequestContext(
		{
			principal: context.principal,
			session: context.session,
			requestId: context.requestId,
			clientIp: context.clientIp,
		},
		() =>
			runWithRequestLangs(
				{
					// Session first, then the ANONYMOUS pre-auth language cookie (login
					// panel), then the install default. allowlistedPreauthLang is the ONE
					// door the cookie enters by (core/resolve/request_lang.ts).
					applicationLang:
						context.session?.applicationLang ??
						allowlistedPreauthLang(context.preauthLang) ??
						config.menu.applicationLang,
					dataLang: context.session?.dataLang ?? config.menu.dataLang,
				},
				() => handler(rqo, context),
			),
	);
	assertEnvelopeBody(result, String(apiClass), String(action));
	return result;
}

/**
 * The one-producer law (ERRORS_SPEC §4): a handler returns `ok(...)` or
 * throws. A body without `ok` (a streamed result carries no serialized body
 * and is exempt) is a handler BUG — refused as `internal.unexpected` through
 * the executeRqo catch, coordinates naming the action, so it can never reach
 * the wire half-shaped and silently "work".
 */
function assertEnvelopeBody(result: ApiResult, apiClass: string, action: string): void {
	if (result.stream !== undefined) return;
	const body: unknown = result.body;
	if (typeof body === 'object' && body !== null && Object.hasOwn(body, 'ok')) return;
	throw new DedaloError('internal.unexpected', {
		message: `handler ${apiClass}::${action} returned a non-envelope body (no \`ok\` key)`,
		coordinates: { api_class: apiClass, action },
	});
}
