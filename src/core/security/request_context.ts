/**
 * Request-scoped identity — the authenticated principal, session and request
 * metadata for the current request (PHP kept the "current user"/permissions in
 * per-request statics/globals; those must NOT be module-level values here).
 *
 * WHY THIS EXISTS (spec §4, request-isolation invariant): Bun is a long-lived
 * process, so "the current user" can never live at module scope — that would
 * bleed one caller's identity into every concurrent request. Instead the
 * identity lives in an AsyncLocalStorage scope opened ONCE per RQO at the
 * dispatch chokepoint (dispatchRqo), right beside the request-language scope,
 * seeded from the request's session. The principal is resolved a single time
 * there and reused, rather than re-resolved lazily in every handler.
 *
 * This mirrors the AsyncLocalStorage pattern already used for the effective
 * languages (core/resolve/request_lang.ts) and the transaction handle
 * (core/db/postgres.ts) — the boring, consistent choice (§2b).
 *
 * USAGE. The dominant pattern stays EXPLICIT: `principal` is threaded as a
 * parameter into resolvers (readSection(rqo, principal), getPermissions(...)),
 * which is testable and clear. This scope is the single seed-source and a
 * BACKSTOP for leaf/future code that has no parameter to reach for — NOT a
 * mandate to remove parameter threading. Outside any scope (unit tests calling
 * resolvers directly, background jobs) the accessors return undefined, exactly
 * as the language accessors fall back to defaults.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { FrontierRefusal } from './frontier_scope.ts';
import type { Principal } from './permissions.ts';
import type { Session } from './session_store.ts';

/** The identity + request metadata every request resolves against. */
export interface RequestContext {
	/** Resolved authorization identity (undefined for unauthenticated requests). */
	readonly principal?: Principal;
	/** The request's session row (null when the request carries no session). */
	readonly session: Session | null;
	/** Unique id for this request (logging/correlation). */
	readonly requestId: string;
	/** Best-effort client IP (throttle/audit; never an authorization input). */
	readonly clientIp: string;
	/**
	 * ACL narrowings this request suffered at a section frontier — appended by
	 * security/frontier_scope.ts noteFrontierRefusal, read by the envelope
	 * layer so a narrowed `ok:true` answer carries its `notices[]` entry.
	 *
	 * MUTABLE ON PURPOSE, and the ONE mutable field here. The refusal happens
	 * deep in the assembler / the export walk, far below any layer that could
	 * pass it upward as a return value; the scope object is created once per
	 * request by dispatchRqo, so appending to it is request-scoped BY
	 * CONSTRUCTION — no module state, no cross-request bleed, nothing to clear.
	 * Absent until the first refusal: a request that narrowed nothing carries
	 * no array at all.
	 */
	frontierRefusals?: FrontierRefusal[];
}

const requestContextStore = new AsyncLocalStorage<RequestContext>();

/** Run `fn` with the given request context in scope for its whole async tree. */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
	return requestContextStore.run(context, fn);
}

/** The current request context, or undefined outside any request scope. */
export function currentRequestContext(): RequestContext | undefined {
	return requestContextStore.getStore();
}

/**
 * The resolved principal for the current request, or undefined when
 * unauthenticated or called outside a request scope. A BACKSTOP: prefer the
 * explicitly-threaded `principal` parameter where one is available.
 */
export function currentPrincipal(): Principal | undefined {
	return requestContextStore.getStore()?.principal;
}

/**
 * The current request's correlation id — the envelope's `request_id`. Empty
 * outside any request scope (a direct resolver call in a unit test), exactly
 * like the language accessors falling back to their defaults. Read by leaf
 * modules that build an `ok(...)` envelope but are called without the API
 * context (section/read_facade.ts, area/read.ts, section/record/temporal.ts).
 */
export function currentRequestId(): string {
	return requestContextStore.getStore()?.requestId ?? '';
}

/** The current request's session, or undefined outside any request scope. */
export function currentSession(): Session | null | undefined {
	return requestContextStore.getStore()?.session;
}
