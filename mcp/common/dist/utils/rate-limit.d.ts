export interface RateLimitConfig {
    capacity: number;
    refillRateMs: number;
}
export declare class TokenBucketRateLimiter {
    private readonly store;
    private readonly capacity;
    private readonly refillRateMs;
    constructor(config: RateLimitConfig);
    private getBucket;
    private refill;
    consume(key: string, tokens?: number): {
        allowed: boolean;
        remaining: number;
        retryAfterMs: number;
    };
    reset(key: string): void;
}
//# sourceMappingURL=rate-limit.d.ts.map