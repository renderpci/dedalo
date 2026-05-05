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
export declare function redactValue(value: unknown): unknown;
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
export declare function redactResponse<T extends Record<string, unknown>>(response: T): T;
//# sourceMappingURL=redact.d.ts.map