/**
 * THE GLOBAL-ADMIN SESSION GATE for routes that live OUTSIDE the RQO dispatcher.
 *
 * Two raw HTTP routes are admin-only and never pass `dispatchRqo`: the hierarchy dump
 * download (`server.ts` serveHierarchyExportFile) and `/api/v1/counters`
 * (`api/counters.ts`). Until 2026-09-03 both read `session.isGlobalAdmin` — the flag
 * STAMPED ON THE SESSION ROW AT LOGIN — so a demoted administrator kept both surfaces
 * for the rest of the session's life (SEC-14). The revocation seam ends the session on
 * a dd244 write it SEES (revocation.ts), but that is a belt, not the authority: a write
 * the seam never saw (a suppressed scope, another process, a failed best-effort
 * revocation) left the login-time snapshot deciding for the whole TTL.
 *
 * This module is the ONE place a non-dispatch route asks "is the caller, RIGHT NOW, a
 * global admin". It answers the way the dispatcher does for every API action
 * (`dispatch.ts` seeds `context.principal = await resolvePrincipal(session.userId)`
 * per request): the session row proves WHO is calling, the Principal — resolved from
 * the dd128 record on every request, through the cache the dd128 write reaction
 * drops — proves WHAT they are. `Session.isGlobalAdmin` is not an authorization input
 * anywhere any more (session_store.ts docblock).
 *
 * Gate: test/unit/account_revocation_native.test.ts ("the principal, not the
 * snapshot, decides" legs — a dd244 flip applied with the seam suppressed, so the
 * session SURVIVES, closes / opens both routes on the very next request).
 */

import { resolvePrincipal } from './permissions.ts';
import { getSession, SESSION_COOKIE, type Session } from './session_store.ts';

/**
 * One named cookie's value out of a raw Cookie header, or undefined.
 *
 * Exact-name match on the split pairs — a `startsWith(name)` scan over the whole
 * header would also match any cookie whose name merely BEGINS with this one.
 */
function readCookie(cookieHeader: string, name: string): string | undefined {
	return cookieHeader
		.split(';')
		.map((pair) => pair.trim())
		.find((pair) => pair.startsWith(`${name}=`))
		?.slice(name.length + 1);
}

/**
 * The live session behind this request's cookie header, IF its account is a global
 * admin as of THIS request; null otherwise (no cookie, no live session, or not an
 * admin any more). Callers answer 404 on null — never 403 — so an outsider cannot
 * confirm the surface exists.
 *
 * The Principal is resolved per call on purpose: it is the cached, invalidated-on-write
 * read of the dd128 record, and the ONLY value here that a demotion can reach without
 * ending the session.
 */
export async function globalAdminSessionFromCookie(
	cookieHeader: string | null,
): Promise<Session | null> {
	const token = readCookie(cookieHeader ?? '', SESSION_COOKIE);
	if (token === undefined) return null;
	const session = getSession(token);
	if (session === null) return null;
	const principal = await resolvePrincipal(session.userId);
	return principal.isGlobalAdmin ? session : null;
}
