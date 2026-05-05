/**
	* WORK_AUTH_SESSION
	* Credentials for Dédalo session-based authentication.
	*
	* What: Dédalo's work API requires a PHP session + CSRF token.
	* This shape tells `WorkClient` to perform a `login` action against
	* `dd_utils_api`, store the returned `Set-Cookie`, and rotate the
	* CSRF token on every subsequent request.
	*
	* Why: authorisation is enforced by Dédalo via the logged user's
	* profile (`security::is_global_admin()`, `common::get_permissions()`),
	* so the MCP server must authenticate as a real Dédalo user. Token
	* auth is not supported because it cannot resolve to a user/profile.
	*
	* @property username    Dédalo user name (must exist in the ontology).
	* @property password    Plain-text password (sent over HTTPS only).
	* @property autoLogin   If `true` (default), `WorkClient.call()` will
	*                       silently re-login when `not_logged` is received.
	*/
export interface WorkAuthSession {
	type: 'session';
	username: string;
	password: string;
	autoLogin?: boolean;
}

/**
	* WORK_AUTH_CONFIG
	* The only supported authentication mode for the work API.
	* `null` means "not yet configured".
	*/
export type WorkAuthConfig = WorkAuthSession | null;

/**
	* IS_SESSION_AUTH
	* Type guard narrowing `WorkAuthConfig` to `WorkAuthSession`.
	*
	* Example:
	* ```ts
	* if (isSessionAuth(cfg)) {
	*   await client.login(cfg.username, cfg.password);
	* }
	* ```
	*/
export function isSessionAuth(config: WorkAuthConfig): config is WorkAuthSession {
	return config !== null && config.type === 'session';
}
