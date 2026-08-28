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
 * marker it freed.
 *
 * SINCE 2026-08-28 THE ORDER LIVES ONE LEVEL DOWN. `session_store.ts` unlinks a
 * session's marker BEFORE it deletes the row, on every path, so no caller can produce
 * the fail-OPEN state (row gone, marker alive, nothing left to name the credential).
 * The functions here are the NAMED doors — logout, "log out everywhere", the sweep —
 * plus the orphan reconcile, which only a caller holding the real session store may run.
 *
 * The POLICY that decides when an account's access ends lives in `revocation.ts`, not
 * here: this module is the mechanism (session ↔ marker), that one is the authorization
 * event. `revocation.ts` imports THIS file; never the other way round.
 *
 * Gates: test/unit/media_session_revocation_native.test.ts (the marker projection),
 * test/unit/account_revocation_native.test.ts (the transitions × survivals matrix, the
 * lane and the order).
 */

import { config } from '../../config/config.ts';
import { reconcileAuthMarkers } from '../media/protection.ts';
import { mediaRootIsMarked } from '../media/test_media_root.ts';
import {
	destroySession,
	destroyUserSessionsDetail,
	LIVE_SESSION_DB_PATH,
	listActiveMediaKeys,
	pruneExpiredSessionsDetail,
	SESSION_DB_PATH,
} from './session_store.ts';

/**
 * End ONE session and revoke its media credential (logout, or an expired token).
 *
 * The unlink is the store's, not this function's: `destroySession` drops the marker
 * before it deletes the row. This door exists for the NAME — a reader looking for "how
 * does a logout end the media credential" finds it here.
 */
export function endSession(rawToken: string): void {
	destroySession(rawToken);
}

/**
 * End every session of a user — optionally keeping one — and revoke each one's media
 * credential. This is what makes a password reset a real recovery: the account's tokens
 * AND the media cookies minted from them stop working at the same instant.
 *
 * Returns the number of sessions removed, matching `destroyUserSessions`.
 */
export function endUserSessions(userId: number, keepRawToken?: string): number {
	return destroyUserSessionsDetail(userId, keepRawToken).removed;
}

/**
 * The same eviction addressed by TOKEN HASH instead of raw token — what the revocation
 * seam has in reach.
 *
 * A `Session` carries `tokenHash`, never the raw cookie value (that never leaves the
 * HTTP layer, by design), and the seam runs post-commit deep under a save where the raw
 * token does not exist. The self-password-change rule ("the acting session survives,
 * every other session of that account dies") is unimplementable without this second
 * address.
 */
export function endUserSessionsDetail(userId: number, keepTokenHash?: string): number {
	return destroyUserSessionsDetail(userId, undefined, keepTokenHash).removed;
}

/**
 * Prune expired sessions and reconcile the whole marker directory against what is still
 * live. THE ORPHAN COLLECTOR.
 *
 * `reconcileAuthMarkers` unlinks every marker that is not a live session's key, so this
 * is also what collects THE BACKLOG: markers orphaned before the fail-closed order
 * landed, by every session the old delete-then-unlink paths expired. An installation
 * running today has some — one per session that expired since the per-session credential
 * shipped (2026-08-24) — and nothing automatic collected them, because this function had
 * exactly one caller, the `runtime_info` maintenance widget, i.e. a human clicking a
 * button. The first scheduled sweep after an upgrade clears the whole backlog in one
 * pass; there is no migration to run.
 *
 * This is the right place for the reconcile: a marker can outlive its row only when the
 * process died between the unlink and the delete, and a prune is the one moment a caller
 * is definitionally holding a session store. WHICH store is the question, and it is no
 * longer answered by trusting the caller — `reconcileIsSafeHere` below decides, because
 * the update's smoke boot starts the candidate tree with an empty throwaway store and
 * the inherited production MEDIA_PATH.
 *
 * Returns the number of sessions pruned, matching `pruneExpiredSessions`.
 */
export function sweepExpiredSessions(): number {
	const { pruned } = pruneExpiredSessionsDetail();
	if (reconcileIsSafeHere()) reconcileAuthMarkers(listActiveMediaKeys());
	return pruned;
}

/**
 * MAY THIS PROCESS RECONCILE? The invariant, where no caller can forget it.
 *
 * The reconcile unlinks every marker no live session claims, so it is only meaningful
 * when THE SESSION STORE AND THE MEDIA ROOT BELONG TO THE SAME INSTALLATION. Exactly two
 * configurations satisfy that:
 *
 *  - the store is the LIVE one (`../private/dedalo_ts_sessions.sqlite`) — a serving
 *    process, real store, real media;
 *  - the store is a DEDALO_SESSION_DB_PATH override AND the media root carries the
 *    `.dedalo_test_media` marker — `bun test`, scratch store, scratch tree.
 *
 * The third combination is the dangerous one and it is a REAL configuration, not a
 * hypothetical: the update's smoke boot starts the candidate tree with an empty
 * throwaway store and the INHERITED production MEDIA_PATH. Reconciling there unlinks
 * every live editor's marker on the tree it was only supposed to check.
 *
 * This used to be `if (!installMode && !smokeBoot)` at the ONE call site in server.ts —
 * a caller's promise, which is the shape of guard that survives until the second caller.
 * There are already two (the sweeper and the media_control widget), and the invariant is
 * about the process's configuration, not about who is asking.
 *
 * It DEGRADES rather than throwing: the prune still runs (it only ever touches the store
 * this process holds), and the operator is told once why the marker half was skipped. A
 * smoke boot whose only fault is inheriting MEDIA_PATH must not fail the update.
 */
let announcedUnsafeReconcile = false;
function reconcileIsSafeHere(): boolean {
	const storeIsLive = SESSION_DB_PATH === LIVE_SESSION_DB_PATH;
	if (storeIsLive) return true;
	const root = config.media.rootPath ?? '';
	if (root !== '' && mediaRootIsMarked(root)) return true;
	if (!announcedUnsafeReconcile) {
		announcedUnsafeReconcile = true;
		console.warn(
			`[session] marker reconcile SKIPPED: this process holds a throwaway session store ('${SESSION_DB_PATH}') but an unmarked media root ('${root}') — reconciling would unlink the markers of sessions that live in another store. Expired sessions were still pruned.`,
		);
	}
	return false;
}

/**
 * How often the serving process sweeps. Hourly: the sessions it collects are already
 * REFUSED by `getSession` (both clocks are enforced on read), so the sweep is hygiene,
 * not enforcement — its job is to stop an orphan marker from outliving its session by
 * more than an hour, and to keep the sessions table from growing without bound. A
 * constant rather than a config key: `../private/.env` is append-only and a knob nobody
 * would ever turn is a knob that rots.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * The FIRST sweep is delayed rather than immediate. A reconcile against an empty session
 * store unlinks every marker on the tree, which is exactly what a smoke boot would do;
 * the caller already refuses to start this in a smoke boot, and the delay is the second
 * belt — it also keeps a burst of filesystem work off the boot path.
 */
const FIRST_SWEEP_DELAY_MS = 5 * 60 * 1000;

let sweepTimer: ReturnType<typeof setInterval> | null = null;

/**
 * START THE AUTOMATIC COLLECTOR (SEC-09, reviewer must-fix 4).
 *
 * Before this, an expired session's marker was collected only when the dead token was
 * REPLAYED (getSession's expiry branches) or when an administrator opened the
 * maintenance widget. A session nobody touches again — the ordinary shape of a closed
 * laptop, and the exact shape of a STOLEN token whose thief stops using it — kept its
 * marker forever, and forever means the cookie kept reading the whole digitised archive.
 *
 * Idempotent: a second call is a no-op, so a re-entered boot cannot stack timers. The
 * timer is `unref`'d so it never holds the process open against a SIGTERM drain.
 *
 * MUST NOT be called from a smoke boot or an install-mode process — see
 * `sweepExpiredSessions` for why a reconcile there would unlink every live editor's
 * marker on the production tree. The caller (`src/server.ts`) makes that decision.
 */
export function startExpiredSessionSweeper(): void {
	if (sweepTimer !== null) return;
	const sweep = (): void => {
		try {
			const pruned = sweepExpiredSessions();
			if (pruned > 0) {
				console.log(
					`[session] periodic sweep: ${String(pruned)} expired session(s) ended and their media markers revoked.`,
				);
			}
		} catch (error) {
			// Never fatal: a failed sweep leaves the previous state, and getSession
			// still refuses every session this would have collected.
			console.error('[session] periodic expired-session sweep failed:', error);
		}
	};
	sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
	sweepTimer.unref?.();
	const first = setTimeout(sweep, FIRST_SWEEP_DELAY_MS);
	first.unref?.();
}

/** Stop the sweeper (tests, and a graceful shutdown that wants a quiet event loop). */
export function stopExpiredSessionSweeper(): void {
	if (sweepTimer === null) return;
	clearInterval(sweepTimer);
	sweepTimer = null;
}
