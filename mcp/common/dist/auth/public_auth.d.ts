/**
    * PUBLIC_AUTH_CONFIG
    * Credentials for the Publication API.
    *
    * What: Dédalo's publication endpoints (`/publication/server_api/v1/json/`)
    * validate a shared secret called `API_WEB_USER_CODE` via `hash_equals()`
    * on the server.  This config shape holds that secret.
    *
    * Why: the publication API is read-only by design; a single shared code
    * is sufficient for public-data consumers (websites, headless CMS, MCP).
    *
    * @property code  Shared secret (must match `API_WEB_USER_CODE` on the
    *                  Dédalo server).  Minimum length enforced by
    *                  `validatePublicAuthConfig()`.
    */
export interface PublicAuthConfig {
    code: string;
}
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
export declare function validatePublicAuthConfig(config: PublicAuthConfig): void;
//# sourceMappingURL=public_auth.d.ts.map