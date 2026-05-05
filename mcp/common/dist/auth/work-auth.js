export function isSessionAuth(config) {
    return config !== null && config.type === 'session';
}
export function isTokenAuth(config) {
    return config !== null && config.type === 'token';
}
//# sourceMappingURL=work-auth.js.map