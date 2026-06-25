import { ANONYMOUS_SESSION, type SessionSnapshot } from '@dedalo/runtime';
import type { SessionStore } from './session_store.ts';

/**
 * Resolve the per-request session snapshot from a session id (typically read from
 * the session cookie). Mirrors login::is_logged semantics: a missing/expired/
 * unknown session resolves to the anonymous session (isLogged=false), never an
 * error — handlers gate on `session.isLogged`.
 */
export async function resolveSession(
  store: SessionStore,
  sessionId: string | null | undefined,
): Promise<SessionSnapshot> {
  if (!sessionId) return ANONYMOUS_SESSION;
  const snapshot = await store.get(sessionId);
  return snapshot ?? ANONYMOUS_SESSION;
}

/** True only for a fully-authenticated snapshot (PHP is_logged === 1). */
export function isLogged(session: SessionSnapshot): boolean {
  return session.isLogged === true;
}
