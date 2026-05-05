import type { Rqo, DedaloResponse } from '../types/index.js';
import type { WorkAuthConfig } from '../auth/work_auth.js';
/**
    * WORK_CLIENT_CONFIG
    * Constructor options for `WorkClient`.
    *
    * @property baseUrl   Root Dédalo URL (e.g. `https://dedalo.example.com`).
    *                     Trailing slash is normalised; the client appends
    *                     `/core/api/v1/json/`.
    * @property auth      Session authentication (username + password). The
    *                     logged user's Dédalo profile determines authorisation.
    *                     `null` means "use env vars at index.ts level".
    * @property autoLogin If `true` (default), `call()` will silently re-login
    *                     whenever the server returns `not_logged`.
    */
export interface WorkClientConfig {
    baseUrl: string;
    auth?: WorkAuthConfig;
    autoLogin?: boolean;
}
/**
    * CLASS WORK_CLIENT
    * HTTP client for the Dédalo Work API (`/core/api/v1/json/`).
    *
    * What: manages authentication (session or token), CSRF-token rotation, and
    * transparent re-login so that MCP tool handlers can treat API calls as
    * stateless while the client handles all session machinery.
    *
    * Why: Dédalo's API is fundamentally session-oriented.  Every request
    * needs a valid `Set-Cookie` and an `X-Dedalo-Csrf-Token` header.
    * Replicating that in every MCP tool would be error-prone; centralising
    * it here keeps the tool layer clean.
    *
    * How:
    * 1. `bootstrapCsrf()` fetches the environment and stores the initial
    *    `csrf_token` (no auth required for this action).
    * 2. `login()` posts credentials to `dd_utils_api::login`; on success
    *    the PHP session cookie is stored from `Set-Cookie`.
    * 3. `call()` injects both cookie and CSRF token into every outgoing
    *    request, and auto-retries once on `not_logged` when `autoLogin`
    *    is enabled.
     *
     * Security notes:
     * - Cookies and CSRF tokens are kept in-memory only (no disk).
     * - All traffic MUST go over HTTPS in production.
     * - Responses are redacted (`redactResponse()`) before being returned.
     */
export declare class WorkClient {
    private readonly baseUrl;
    private readonly auth;
    private readonly autoLogin;
    private cookie;
    private csrfToken;
    private loggedIn;
    constructor(config: WorkClientConfig);
    /**
     * FETCH_JSON
     * Internal HTTP POST helper.  Handles headers, cookie rotation, and
     * CSRF-token extraction from the response body. Injects `Cookie` and
     * `X-Dedalo-Csrf-Token` headers when available.
     */
    private fetchJson;
    /**
     * BOOTSTRAP_CSRF
     * Fetch the initial CSRF token from `dd_core_api::get_environment`.
     *
     * Why: every mutating request (including `login`) must carry a valid
     * CSRF token.  `get_environment` is whitelisted in `dd_manager` as
     * CSRF-exempt, so we can obtain the token before authenticating.
     */
    bootstrapCsrf(): Promise<void>;
    /**
     * LOGIN
     * Authenticate against `dd_utils_api::login` using stored or supplied
     * credentials, and persist the session cookie.
     *
     * @param username  Optional override of the constructor-supplied user.
     * @param password  Optional override of the constructor-supplied password.
     * @throws DedaloError  If the server rejects the credentials.
     */
    login(username?: string, password?: string): Promise<void>;
    /**
     * CALL
     * Send an RQO to the Dédalo work API, handling transparent re-login
     * and response redaction.
     *
     * @param rqo  Validated Request Query Object matching Dédalo's RQO schema.
     * @return     Redacted API response.
     * @throws DedaloError  On persistent failure or unrecoverable error.
     */
    call(rqo: Rqo): Promise<DedaloResponse>;
    /** Expose the current PHP session cookie (for external transport reuse). */
    getCookie(): string;
    /** Expose the current CSRF token (for debugging / test assertions). */
    getCsrfToken(): string;
    /** Whether `login()` has succeeded at least once in this client lifetime. */
    isLoggedIn(): boolean;
}
//# sourceMappingURL=work_client.d.ts.map