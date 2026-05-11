import type { Rqo, DedaloResponse } from '../types/index.js';
export interface WorkClientConfig {
    baseUrl: string;
    username?: string;
    password?: string;
    autoLogin?: boolean;
}
export declare class WorkClient {
    private readonly baseUrl;
    private readonly username;
    private readonly password;
    private readonly autoLogin;
    private cookie;
    private csrfToken;
    private loggedIn;
    constructor(config: WorkClientConfig);
    private fetchJson;
    bootstrapCsrf(): Promise<void>;
    login(username?: string, password?: string): Promise<void>;
    call(rqo: Rqo): Promise<DedaloResponse>;
    getCookie(): string;
    getCsrfToken(): string;
    isLoggedIn(): boolean;
}
//# sourceMappingURL=work-client.d.ts.map