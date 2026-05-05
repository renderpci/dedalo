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
export function isSessionAuth(config) {
    return config !== null && config.type === 'session';
}
/**
    * IS_TOKEN_AUTH
    * Type guard narrowing `WorkAuthConfig` to `WorkAuthToken`.
    */
export function isTokenAuth(config) {
    return config !== null && config.type === 'token';
}
//# sourceMappingURL=work_auth.js.map