/**
    * VALIDATE_PUBLIC_AUTH_CONFIG
    * Sanity-check the publication API code before bootstrapping the client.
    *
    * What: enforces a minimum length of 16 characters.  This catches
    * accidental empty strings or short placeholder values early, before
    * any network traffic is attempted.
    *
    * Why: the publication API returns a generic "Error. Empty user code"
    * message.  Validating client-side gives the MCP operator a clear,
    * immediate error at startup rather than a cryptic HTTP 200 with
    * a JSON error body on the first tool call.
    *
    * @param config  The publication auth config to validate.
    * @throws Error  If `code` is missing or shorter than 16 chars.
    *
    * Example:
    * ```ts
    * validatePublicAuthConfig({ code: 'short' });
    * // → throws: 'PublicAuthConfig: code must be at least 16 characters'
    * ```
    */
export function validatePublicAuthConfig(config) {
    if (!config.code || config.code.length < 16) {
        throw new Error('PublicAuthConfig: code must be at least 16 characters');
    }
}
//# sourceMappingURL=public_auth.js.map