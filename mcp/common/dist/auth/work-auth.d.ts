export interface WorkAuthSession {
    type: 'session';
    username: string;
    password: string;
    autoLogin?: boolean;
}
export interface WorkAuthToken {
    type: 'token';
    token: string;
}
export type WorkAuthConfig = WorkAuthSession | WorkAuthToken | null;
export declare function isSessionAuth(config: WorkAuthConfig): config is WorkAuthSession;
export declare function isTokenAuth(config: WorkAuthConfig): config is WorkAuthToken;
//# sourceMappingURL=work-auth.d.ts.map