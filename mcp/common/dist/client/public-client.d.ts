import type { PublicationOptions, DedaloResponse } from '../types/index.js';
export interface PublicClientConfig {
    baseUrl: string;
    code: string;
    defaultLang?: string;
    defaultDbName?: string;
}
export declare class PublicClient {
    private readonly baseUrl;
    private readonly code;
    private readonly defaultLang;
    private readonly defaultDbName;
    constructor(config: PublicClientConfig);
    call(options: PublicationOptions): Promise<DedaloResponse>;
}
//# sourceMappingURL=public-client.d.ts.map