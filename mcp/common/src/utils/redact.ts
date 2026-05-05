/**
	* SENSITIVE_KEYS
	* Set of JSON property names whose values must be scrubbed before
	* returning data to an MCP client or logging it.
	*
	* Why: the Dédalo PHP API embeds session artefacts (`csrf_token`,
	* `dedalo_last_error`, `debug`) and auth material (`cookie`) in every
	* response.  Leaking these to an LLM or over the wire violates the
	* principle of least privilege and can aid session hijacking.
	*
	* How: `redactValue()` walks every object recursively; any key that
	* matches this set (case-insensitive) is replaced with `'[REDACTED]'`.
	*
	* The set also covers generic auth tokens so future unknown keys are
	* caught via substring matching (`includes('password')`, etc.).
	*/
const SENSITIVE_KEYS = new Set([
	'csrf_token',
	'cookie',
	'cookies',
	'dedalo_last_error',
	'debug',
	'request_config',
	'session_id',
	'user_id',
	'auth_token',
	'password',
	'secret',
	'api_key',
	'private_key',
	'access_token',
	'refresh_token',
]);

/**
	* IS_SENSITIVE_KEY
	* Heuristic test for whether a property name should be redacted.
	*
	* Matches exact entries in `SENSITIVE_KEYS` (case-insensitive) plus
	* any key containing the substrings `'password'` or `'secret'`.
	*
	* @param key  Property name from a parsed JSON object.
	* @return     `true` if the value must be replaced.
	*/
function isSensitiveKey(key: string): boolean {
	const lower = key.toLowerCase();
	return SENSITIVE_KEYS.has(lower) || lower.includes('password') || lower.includes('secret');
}

/**
	* REDACT_VALUE
	* Recursively replace sensitive values in an arbitrary JSON tree.
	*
	* What: walks scalars, arrays, and objects depth-first.  Objects
	* whose keys match `isSensitiveKey()` have their values replaced with
	* `'[REDACTED]'` regardless of type.  Everything else is returned
	* untouched.
	*
	* Why: Dédalo responses are deeply nested (context → data → components).
	* A shallow redaction would miss `csrf_token` nested inside a
	* component's `request_config`.  This recursive walk guarantees
	* complete coverage without prior knowledge of the schema.
	*
	* How: purely structural — no schema needed.  Primitives pass through;
	* arrays are mapped; objects are iterated and rebuilt.
	*
	* @param value  Any JSON-compatible value.
	* @return       The same shape with sensitive leaves redacted.
	*
	* Example:
	* ```ts
	* redactValue({ user: 'admin', csrf_token: 'abc123', debug: { sql: 'SELECT...' } });
	* // → { user: 'admin', csrf_token: '[REDACTED]', debug: '[REDACTED]' }
	* ```
	*/
export function redactValue(value: unknown): unknown {
	if (value === null || value === undefined) {
	  return value;
	}
	if (typeof value === 'string') {
	  return value;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
	  return value;
	}
	if (Array.isArray(value)) {
	  return value.map(redactValue);
	}
	if (typeof value === 'object') {
	  const result: Record<string, unknown> = {};
	  for (const [k, v] of Object.entries(value)) {
	    if (isSensitiveKey(k)) {
	      result[k] = '[REDACTED]';
	    } else {
	      result[k] = redactValue(v);
	    }
	  }
	  return result;
	}
	return value;
}

/**
	* REDACT_RESPONSE
	* Convenience wrapper around `redactValue()` typed for Dédalo API
	* response objects.
	*
	* Identical behaviour to `redactValue()` but preserves the outer
	* `Record<string, unknown>` shape so callers do not need to cast.
	*
	* @param response  Parsed JSON body from a Dédalo API call.
	* @return          Same object with sensitive fields scrubbed.
	*/
export function redactResponse<T extends Record<string, unknown>>(response: T): T {
	return redactValue(response) as T;
}
