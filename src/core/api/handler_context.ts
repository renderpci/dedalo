/**
 * Shared per-request handler context + registry types (WS-C S2-25 extraction).
 *
 * Home of the pieces every api/handlers/<class>.ts module needs WITHOUT
 * importing dispatch.ts (which statically imports the handler modules —
 * importing it back would create a runtime cycle):
 *  - ApiRequestContext — created by the HTTP layer, threaded explicitly;
 *  - ActionHandler — the registry entry signature;
 *  - requirePrincipal — the seeded-identity accessor handlers read instead of
 *    re-resolving the principal from the DB.
 *
 * dispatch.ts re-exports ApiRequestContext so existing importers keep working.
 */

import type { Rqo } from '../concepts/rqo.ts';
import type { Principal } from '../security/permissions.ts';
import type { Session } from '../security/session_store.ts';
import type { ApiResult } from './response.ts';

/** Per-request state — created by the HTTP layer, threaded explicitly. */
export interface ApiRequestContext {
	requestId: string;
	clientIp: string;
	session: Session | null;
	/**
	 * The RAW session cookie value (not the hash). Needed by actions that must
	 * mutate THIS session row — e.g. change_lang persisting the language choice.
	 * Null when the request carries no session cookie.
	 */
	sessionToken?: string | null;
	/** Raw CSRF token from header/body, if any. */
	csrfCandidate: string | null;
	/** Raw X-Dedalo-Report-Token header (error-report intake spam filter,
	 * WC-017) — checked constant-time by dd_error_report_api only. */
	reportTokenCandidate?: string | null;
	/** Declared request body size (Content-Length header, bytes) if present —
	 * a cheap pre-clamp fast-reject for the pre-auth intake (WC-017). */
	bodyByteLength?: number;
	/** Transport-layer receipt time (performance.now()), for the access log (S2-37). */
	startedAt?: number;
	/** Resolved authorization identity — seeded ONCE per request by dispatchRqo
	 * (after the auth gate) and read by handlers via requirePrincipal(). */
	principal?: Principal;
}

export type ActionHandler = (rqo: Rqo, context: ApiRequestContext) => Promise<ApiResult>;

/**
 * The seeded authorization identity for the current request. dispatchRqo
 * resolves the principal exactly once (after the auth gate passes) and stores it
 * on the context; every authenticated handler reads it here instead of
 * re-resolving it from the DB. Throws if called without a seeded principal — a
 * programming error, since these paths run only behind the auth gate.
 */
export function requirePrincipal(context: ApiRequestContext): Principal {
	if (context.principal === undefined) {
		throw new Error(
			'requirePrincipal: no authenticated principal on request context (unauthenticated action?)',
		);
	}
	return context.principal;
}
