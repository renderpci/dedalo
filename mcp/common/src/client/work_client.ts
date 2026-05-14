import type { Rqo, DedaloResponse } from '../types/index.js';
import { mapDedaloError, DedaloError } from '../utils/errors.js';
import { redactResponse } from '../utils/redact.js';
import type { WorkAuthConfig, WorkAuthSession } from '../auth/work_auth.js';

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
export class WorkClient {
	private readonly baseUrl: string;
	private readonly auth: WorkAuthConfig;
	private readonly autoLogin: boolean;

	private cookie = '';
	private csrfToken = '';
	private loggedIn = false;

	constructor(config: WorkClientConfig) {
	  this.baseUrl = config.baseUrl.replace(/\/$/, '') + '/core/api/v1/json/';
	  this.auth = config.auth ?? null;
	  this.autoLogin = config.autoLogin ?? false;
	}

	/**
	 * FETCH_JSON
	 * Internal HTTP POST helper.  Handles headers, cookie rotation, and
	 * CSRF-token extraction from the response body. Injects `Cookie` and
	 * `X-Dedalo-Csrf-Token` headers when available.
	 */
	private async fetchJson(body: Record<string, unknown>): Promise<Record<string, unknown>> {
	  const headers: Record<string, string> = {
	    'Content-Type': 'application/json',
	  };

	  if (this.cookie) {
	    headers['Cookie'] = this.cookie;
	  }
	  if (this.csrfToken) {
	    headers['X-Dedalo-Csrf-Token'] = this.csrfToken;
	  }

	  let res: Response;
	  try {
	    res = await fetch(this.baseUrl, {
	      method: 'POST',
	      headers,
	      body: JSON.stringify(body),
	    });
	  } catch (err) {
	    const message = err instanceof Error ? err.message : String(err);
	    throw new DedaloError(
	      `Network error calling Dédalo API: ${message}`,
	      'network_error',
	      [],
	      { originalError: message }
	    );
	  }

	  const setCookie = res.headers.get('set-cookie');
	  if (setCookie) {
	    this.cookie = setCookie.split(';')[0];
	  }

	  const json = (await res.json()) as Record<string, unknown>;

	  if (typeof json.csrf_token === 'string') {
	    this.csrfToken = json.csrf_token;
	  }

	  return json;
	}

	/**
	 * BOOTSTRAP_CSRF
	 * Fetch the initial CSRF token from `dd_core_api::get_environment`.
	 *
	 * Why: every mutating request (including `login`) must carry a valid
	 * CSRF token.  `get_environment` is whitelisted in `dd_manager` as
	 * CSRF-exempt, so we can obtain the token before authenticating.
	 */
	async bootstrapCsrf(): Promise<void> {
	  const res = await this.fetchJson({ action: 'get_environment', dd_api: 'dd_core_api' });
	  if (typeof res.csrf_token === 'string') {
	    this.csrfToken = res.csrf_token;
	  }
	}

	/**
	 * LOGIN
	 * Authenticate against `dd_utils_api::login` using stored or supplied
	 * credentials, and persist the session cookie.
	 *
	 * @param username  Optional override of the constructor-supplied user.
	 * @param password  Optional override of the constructor-supplied password.
	 * @throws DedaloError  If the server rejects the credentials.
	 */
	async login(username?: string, password?: string): Promise<void> {
	  const sessionAuth: WorkAuthSession | null = this.auth;
	  const u = username ?? sessionAuth?.username;
	  const p = password ?? sessionAuth?.password;
	  if (!u || !p) {
	    throw new DedaloError('WorkClient: username and password required for login', 'not_logged');
	  }

	  await this.bootstrapCsrf();

	  const res = await this.fetchJson({
	    action: 'login',
	    dd_api: 'dd_utils_api',
	    options: { username: u, auth: p },
	  });

	  if (res.result !== true) {
	    throw mapDedaloError(res);
	  }

	  this.loggedIn = true;
	}

	/**
	 * CALL
	 * Send an RQO to the Dédalo work API, handling transparent re-login
	 * and response redaction.
	 *
	 * @param rqo  Validated Request Query Object matching Dédalo's RQO schema.
	 * @return     Redacted API response.
	 * @throws DedaloError  On persistent failure or unrecoverable error.
	 */
	async call(rqo: Rqo): Promise<DedaloResponse> {
	  if (this.auth !== null && !this.loggedIn && this.autoLogin) {
	    await this.login();
	  }

	  const body: Record<string, unknown> = { ...rqo };
	  if (this.csrfToken && !body.csrf_token) {
	    body.csrf_token = this.csrfToken;
	  }

	  let json = await this.fetchJson(body);

	  if (json.result === false) {
	    const errors = Array.isArray(json.errors) ? json.errors.map(String) : [];

	    if (this.auth !== null && errors.includes('not_logged') && this.autoLogin) {
	      await this.login();
	      body.csrf_token = this.csrfToken;
	      json = await this.fetchJson(body);
	    }

	    if (json.result === false) {
	      throw mapDedaloError(json);
	    }
	  }

	  return redactResponse(json as Record<string, unknown>) as DedaloResponse;
	}

	/** Expose the current PHP session cookie (for external transport reuse). */
	getCookie(): string {
	  return this.cookie;
	}

	/** Expose the current CSRF token (for debugging / test assertions). */
	getCsrfToken(): string {
	  return this.csrfToken;
	}

	/** Whether `login()` has succeeded at least once in this client lifetime. */
	isLoggedIn(): boolean {
	  return this.loggedIn;
	}
}