/**
 * SESSION ↔ MEDIA CREDENTIAL — the one door that ends a session.
 *
 * A logged-in user reads media through the web server, not through this process: their
 * browser carries the `dedalo_media_auth` cookie, and Apache/nginx authorizes rule A by
 * stat()ing a zero-byte marker named by the cookie's value
 * (`<media>/.publication/auth/{value}`). Two facts follow, and this module exists
 * because they used to contradict each other:
 *
 *  - the marker IS the credential. While it exists, the cookie works — no session, no
 *    principal and no password check is consulted, because no application process is in
 *    the media-serving path (that is what keeps 32 GB files on sendfile and Range).
 *  - so revoking media access means UNLINKING THAT MARKER, and nothing else can.
 *
 * Until 2026-08-24 the value was one per INSTALL per DAY: every logged-in editor held
 * the identical cookie. Unlinking it on one user's logout would have locked out all of
 * them, so logout deliberately cleared only the browser cookie and the marker stayed —
 * meaning a stolen cookie survived logout AND a password reset for up to ~48 hours
 * (today's and yesterday's markers are both valid), completely outside the session
 * store's reach. The reset flow, whose entire purpose is to cut off whoever holds a
 * stolen token, could not cut off that one.
 *
 * Now the value is per SESSION and lives on the session row, so the marker set is a
 * PROJECTION of the sessions table — and every way a session ends has to unlink the
 * marker it freed. That is the whole content of this module: `session_store` deletes
 * rows and reports the keys it freed; `protection` lays and drops markers; NOTHING
 * should call the first without the second, so callers inside `src/` come here instead.
 *
 * Gate: test/unit/media_session_revocation_native.test.ts.
 */

import { dropAuthMarker, reconcileAuthMarkers } from '../media/protection.ts';
import {
	destroySession,
	destroyUserSessionsDetail,
	listActiveMediaKeys,
	pruneExpiredSessionsDetail,
} from './session_store.ts';

/** End ONE session and revoke its media credential (logout, or an expired token). */
export function endSession(rawToken: string): void {
	const mediaKey = destroySession(rawToken);
	if (mediaKey !== null) dropAuthMarker(mediaKey);
}

/**
 * End every session of a user — optionally keeping one — and revoke each one's media
 * credential. This is what makes a password reset a real recovery: the account's tokens
 * AND the media cookies minted from them stop working at the same instant.
 *
 * Returns the number of sessions removed, matching `destroyUserSessions`.
 */
export function endUserSessions(userId: number, keepRawToken?: string): number {
	const { removed, mediaKeys } = destroyUserSessionsDetail(userId, keepRawToken);
	for (const key of mediaKeys) dropAuthMarker(key);
	return removed;
}

/**
 * Prune expired sessions and revoke their media credentials, then reconcile the whole
 * marker directory against what is still live.
 *
 * The reconcile is the ORPHAN sweep, and this is the right place for it: a marker can
 * outlive its row only when the process died between the DELETE and the unlink, and a
 * prune is the one moment where the caller is definitionally holding the real session
 * store. It is deliberately NOT done at boot — the update's smoke boot starts the
 * candidate tree with an empty throwaway session store and the inherited MEDIA_PATH, so
 * a boot reconcile would unlink every live editor's marker on the production tree.
 *
 * Returns the number of sessions pruned, matching `pruneExpiredSessions`.
 */
export function sweepExpiredSessions(): number {
	const { pruned, mediaKeys } = pruneExpiredSessionsDetail();
	for (const key of mediaKeys) dropAuthMarker(key);
	reconcileAuthMarkers(listActiveMediaKeys());
	return pruned;
}
