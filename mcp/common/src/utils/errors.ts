/**
	* DEDALO_ERROR_CODE
	* Canonical error strings returned by the Dédalo PHP API in the `errors` array.
	*
	* Why: the PHP side communicates failure categories through string codes
	* (e.g. `["permissions_denied"]`).  This union type makes the mapping
	* exhaustive and type-safe so `mapDedaloError()` can branch on every
	* known case.
	*
	* How: compare against `raw.errors` after a failed API call.  Unknown
	* or missing codes fall back to `'unknown'`.
	*
	* Example:
	* ```ts
	* const code: DedaloErrorCode = 'not_logged'; // TS validates this
	* ```
	*/
export type DedaloErrorCode =
	| 'permissions_denied'
	| 'csrf_failed'
	| 'not_logged'
	| 'invalid_api_class'
	| 'invalid_action'
	| 'invalid_request'
	| 'login_failed'
	| 'maintenance_mode'
	| 'update_lock'
	| 'db_connection_failed'
	| 'network_error'
	| 'unknown';

/**
	* CLASS DEDALO_ERROR
	* Typed exception that carries both a human-readable message and the
	* machine-readable error code(s) returned by Dédalo.
	*
	* Why: MCP tool handlers must surface *actionable* errors to the AI agent.
	* Throwing a generic `Error('Request failed')` loses the context needed
	* for auto-re-login (not_logged), CSRF rotation (csrf_failed), or
	* permission escalation (permissions_denied).
	*
	* How: every failed API response is funnelled through `mapDedaloError()`
	* which constructs this class.  Callers can inspect `err.code` to decide
	* recovery strategy without parsing strings.
	*
	* @property {DedaloErrorCode} code      Highest-priority error class.
	* @property {string[]} dedaloErrors     Full `raw.errors` array verbatim.
	* @property {Record<string, unknown>} rawResponse  Complete JSON body for debugging.
	*
	* Example:
	* ```ts
	* try {
	*   await client.call(rqo);
	* } catch (e) {
	*   if (e instanceof DedaloError && e.code === 'not_logged') {
	*     await client.login();           // auto-recovery
	*   }
	* }
	* ```
	*/
export class DedaloError extends Error {
	public readonly code: DedaloErrorCode;
	public readonly dedaloErrors: string[];
	public readonly rawResponse: Record<string, unknown>;

	constructor(
	  message: string,
	  code: DedaloErrorCode,
	  dedaloErrors: string[] = [],
	  rawResponse: Record<string, unknown> = {}
	) {
	  super(message);
	  this.name = 'DedaloError';
	  this.code = code;
	  this.dedaloErrors = dedaloErrors;
	  this.rawResponse = rawResponse;
	}
}

/**
	* MAP_DEDALO_ERROR
	* Convert a raw Dédalo JSON error response into a strongly-typed
	* `DedaloError` exception.
	*
	* What: inspects the `errors` array from the PHP response, picks the
	* first recognised `DedaloErrorCode`, and packages everything into an
	* exception with the original message and full payload attached.
	*
	* Why: Dédalo returns `result: false` plus an `errors` array of strings.
	* This function is the single choke-point that turns those opaque
	* strings into actionable exceptions used by both MCP servers.
	*
	* How: iterates over a fixed priority list (permissions → csrf → auth
	* → …).  The first match wins so that `'not_logged'` never masks
	* `'permissions_denied'`.  Falls back to `'unknown'` for unlisted codes.
	*
	* @param raw  The parsed JSON body from a failed Dédalo API call.
	* @return     A `DedaloError` with `.code` ready for branching.
	*
	* Example:
	* ```ts
	* const raw = { result: false, msg: 'Session expired', errors: ['not_logged'] };
	* throw mapDedaloError(raw);
	* // → DedaloError: Session expired [not_logged] { code: 'not_logged' }
	* ```
	*/
export function mapDedaloError(raw: Record<string, unknown>): DedaloError {
	const errors: string[] = Array.isArray(raw.errors) ? raw.errors.map(String) : [];
	const msg = typeof raw.msg === 'string' ? raw.msg : 'Dédalo request failed';

	let code: DedaloErrorCode = 'unknown';

	// Priority-ordered check: most severe / most specific first.
	if (errors.includes('permissions_denied')) {
	  code = 'permissions_denied';
	} else if (errors.includes('csrf_failed')) {
	  code = 'csrf_failed';
	} else if (errors.includes('not_logged')) {
	  code = 'not_logged';
	} else if (errors.includes('invalid_api_class')) {
	  code = 'invalid_api_class';
	} else if (errors.includes('invalid_action')) {
	  code = 'invalid_action';
	} else if (errors.includes('login_failed')) {
	  code = 'login_failed';
	} else if (errors.includes('maintenance_mode')) {
	  code = 'maintenance_mode';
	} else if (errors.includes('update_lock')) {
	  code = 'update_lock';
	} else if (errors.includes('db_connection_failed')) {
	  code = 'db_connection_failed';
	}

	return new DedaloError(
	  `${msg} [${errors.join(',')}]`,
	  code,
	  errors,
	  raw
	);
}
