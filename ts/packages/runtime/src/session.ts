/**
 * Authenticated session snapshot.
 *
 * Mirrors the meaningful fields of PHP's `$_SESSION['dedalo']['auth']` (see
 * core/login/class.login.php ~1300) and `config.dedalo_application_lang`. This is
 * a *snapshot* resolved once per request from the session store (@dedalo/auth)
 * and attached to the RequestContext — handlers read it, they never reach into a
 * global session. The store, not this object, is the source of truth.
 */
export interface SessionSnapshot {
  /** True only when the session is fully authenticated (PHP is_logged === 1). */
  readonly isLogged: boolean;
  readonly userId: number | null;
  readonly username: string | null;
  readonly fullUsername: string | null;
  readonly isGlobalAdmin: boolean;
  readonly isDeveloper: boolean;
  /** e.g. 'saml', 'standard'. */
  readonly loginType: string | null;
  /** Per-session CSRF token (echoed on every response, verified per request). */
  readonly csrfToken: string | null;
  /** Application UI language, e.g. 'lg-eng'. */
  readonly applicationLang: string | null;
}

/** The session used before/without authentication. */
export const ANONYMOUS_SESSION: SessionSnapshot = {
  isLogged: false,
  userId: null,
  username: null,
  fullUsername: null,
  isGlobalAdmin: false,
  isDeveloper: false,
  loginType: null,
  csrfToken: null,
  applicationLang: null,
};
