/**
    * RATE_LIMIT_CONFIG
    * Parameters for a token-bucket rate limiter.
    *
    * @property capacity      Maximum tokens a single client can hold.
    * @property refillRateMs  Time (ms) required for the bucket to refill
    *                         from empty to full.
    */
export interface RateLimitConfig {
    capacity: number;
    refillRateMs: number;
}
/**
    * CLASS TOKEN_BUCKET_RATE_LIMITER
    * In-memory token-bucket rate limiter keyed by an arbitrary client
    * identity string (e.g. IP, session ID, or MCP request id).
    *
    * What: each identity gets its own `Bucket`.  `consume()` deducts
    * tokens; when the bucket hits zero the request is rejected with a
    * `retryAfterMs` hint computed from the deficit and refill rate.
    *
    * Why: MCP servers may be exposed to public networks.  A simple
    * token-bucket prevents any single client from overwhelming the
    * underlying Dédalo PHP workers while still allowing short bursts.
    *
    * How: lazy creation — no entry until first request.  Refill uses
    * wall-clock arithmetic so the map does not need a background timer.
    *
    * Example:
    * ```ts
    * const limiter = new TokenBucketRateLimiter({ capacity: 60, refillRateMs: 60_000 });
    * const r1 = limiter.consume('client-42');   // { allowed: true, remaining: 59 }
    * const r2 = limiter.consume('client-42', 59); // drains bucket
    * const r3 = limiter.consume('client-42');     // { allowed: false, retryAfterMs: 1000 }
    * ```
    */
export declare class TokenBucketRateLimiter {
    private readonly store;
    private readonly capacity;
    private readonly refillRateMs;
    constructor(config: RateLimitConfig);
    /**
     * GET_BUCKET
     * Lazy-initialise a `Bucket` for the given client key.
     */
    private getBucket;
    /**
     * REFILL
     * Add tokens to a bucket based on elapsed real time since the last
     * refill.  The calculation is linear: `tokens += (elapsed / rate) * capacity`.
     */
    private refill;
    /**
     * CONSUME
     * Attempt to deduct `tokens` from the bucket belonging to `key`.
     *
     * @param key     Client identity.
     * @param tokens  Number of tokens to deduct (default 1).
     * @return        Object with:
     *                - `allowed`      — whether the request may proceed.
     *                - `remaining`    — tokens left after success (0 on denial).
     *                - `retryAfterMs` — estimated wait time if denied.
     */
    consume(key: string, tokens?: number): {
        allowed: boolean;
        remaining: number;
        retryAfterMs: number;
    };
    /**
     * RESET
     * Remove a client's bucket, freeing memory and resetting their limit.
     * Useful after a successful re-login or admin override.
     */
    reset(key: string): void;
}
//# sourceMappingURL=rate_limit.d.ts.map