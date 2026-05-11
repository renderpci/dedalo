export function validatePublicAuthConfig(config) {
    if (!config.code || config.code.length < 16) {
        throw new Error('PublicAuthConfig: code must be at least 16 characters');
    }
}
//# sourceMappingURL=public-auth.js.map