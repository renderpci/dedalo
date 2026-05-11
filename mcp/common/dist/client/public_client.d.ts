import type { PublicationOptions, DedaloResponse } from '../types/index.js';
/**
    * PUBLIC_CLIENT_CONFIG
    * Constructor options for `PublicClient`.
    *
    * @property baseUrl      Root Dédalo URL.  Trailing slash is normalised;
    *                        the client appends `/publication/server_api/v1/json/`.
    * @property code         Shared publication secret (`API_WEB_USER_CODE`).
    * @property defaultLang  Fallback language code (default `lg-eng`).
    * @property defaultDbName Optional database name injected when the caller
    *                         does not supply `options.db_name`.
    */
export interface PublicClientConfig {
    baseUrl: string;
    code: string;
    defaultLang?: string;
    defaultDbName?: string;
}
/**
    * CLASS PUBLIC_CLIENT
    * Stateless HTTP client for the Dédalo Publication API.
    *
    * What: wraps every call into a `{ code, lang, options }` JSON body,
    * POSTs it to `/publication/server_api/v1/json/`, and validates the
    * response.  Unlike `WorkClient`, there is no session state — each
    * request is self-contained, making this safe for public / parallel use.
    *
    * Why: the Publication API is explicitly read-only and designed for
    * external websites.  A stateless client matches that design and avoids
    * session-management complexity entirely.
    *
    * How: `call()` merges caller-supplied `PublicationOptions` with defaults
    * (`lang`, `db_name`), sends the JSON body, checks `result === false`,
    * and redacts the response before returning.
    *
    * Example:
    * ```ts
    * const client = new PublicClient({
    *   baseUrl: 'https://dedalo.example.com',
    *   code: process.env.DEDALO_PUBLIC_API_CODE!,
    *   defaultLang: 'lg-spa',
    * });
    * const rows = await client.call({ dedalo_get: 'records', table: 'interview', limit: 10 });
    * ```
    */
export declare class PublicClient {
    private readonly baseUrl;
    private readonly code;
    private readonly defaultLang;
    private readonly defaultDbName;
    constructor(config: PublicClientConfig);
    /**
     * CALL
     * Execute a publication query and return the redacted JSON response.
     *
     * @param options  `PublicationOptions` merged with `defaultLang` / `defaultDbName`.
     * @return         Parsed, redacted Dédalo response object.
     * @throws DedaloError  On `result === false` or network failure.
     */
    call(options: PublicationOptions): Promise<DedaloResponse>;
}
//# sourceMappingURL=public_client.d.ts.map