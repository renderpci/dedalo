/**
 * PHP session bridge for the migration period.
 *
 * A natively-served authenticated action must know whether the browser's session
 * is logged in and what the session's CSRF token is — but the session lives in
 * PHP, and the TS core cannot validate a PHP session independently. So during
 * migration the TS core delegates the auth truth to PHP: it forwards the browser
 * Cookie to PHP's `get_environment` (CSRF-exempt, no-login) and reads back
 * `page_globals.is_logged` plus the session's `csrf_token`. PHP stays the single
 * source of session truth; the TS core serves the data natively.
 *
 * This adds one lightweight round-trip per natively-served authenticated request.
 * It disappears once login/session ownership itself moves to the TS core.
 */

export interface BridgedSession {
  isLogged: boolean;
  /** The session's current CSRF token (stable per session), or '' if none. */
  csrfToken: string;
  /**
   * The logged user's id (PHP logged_user_id()): the user record's section_id, or
   * -1 for the global-admin/root sentinel. Stamped into the modified_by_user (dd197)
   * relation locator's section_id on save. null when not logged.
   */
  userId: number | null;
  /** True when the session is a global-admin / root (write permission everywhere). */
  isGlobalAdmin: boolean;
}

export async function bridgeSession(
  phpApiUrl: string,
  cookie: string | null | undefined,
  timeoutMs = 5_000,
): Promise<BridgedSession> {
  const closed: BridgedSession = {
    isLogged: false,
    csrfToken: '',
    userId: null,
    isGlobalAdmin: false,
  };
  if (!cookie) return closed;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(phpApiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ dd_api: 'dd_core_api', action: 'get_environment' }),
      signal: controller.signal,
    });
    if (!res.ok) return closed;
    const body = (await res.json()) as {
      result?: {
        page_globals?: {
          is_logged?: unknown;
          user_id?: unknown;
          is_global_admin?: unknown;
          is_root?: unknown;
        };
      };
      csrf_token?: unknown;
    };
    const pg = body.result?.page_globals;
    if (pg?.is_logged !== true) return closed;
    const rawUserId = pg.user_id;
    const userId =
      typeof rawUserId === 'number'
        ? rawUserId
        : typeof rawUserId === 'string' && rawUserId !== ''
          ? Number.parseInt(rawUserId, 10)
          : null;
    return {
      isLogged: true,
      csrfToken: typeof body.csrf_token === 'string' ? body.csrf_token : '',
      userId: userId !== null && Number.isInteger(userId) ? userId : null,
      isGlobalAdmin: pg.is_global_admin === true || pg.is_root === true,
    };
  } catch {
    return closed; // fail closed
  } finally {
    clearTimeout(timeout);
  }
}
