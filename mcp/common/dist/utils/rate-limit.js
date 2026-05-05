export class TokenBucketRateLimiter {
    store = new Map();
    capacity;
    refillRateMs;
    constructor(config) {
        this.capacity = config.capacity;
        this.refillRateMs = config.refillRateMs;
    }
    getBucket(key) {
        let bucket = this.store.get(key);
        if (!bucket) {
            bucket = { tokens: this.capacity, lastRefill: Date.now() };
            this.store.set(key, bucket);
        }
        return bucket;
    }
    refill(bucket) {
        const now = Date.now();
        const elapsed = now - bucket.lastRefill;
        const tokensToAdd = (elapsed / this.refillRateMs) * this.capacity;
        if (tokensToAdd >= 1) {
            bucket.tokens = Math.min(this.capacity, bucket.tokens + Math.floor(tokensToAdd));
            bucket.lastRefill = now;
        }
    }
    consume(key, tokens = 1) {
        const bucket = this.getBucket(key);
        this.refill(bucket);
        if (bucket.tokens >= tokens) {
            bucket.tokens -= tokens;
            return { allowed: true, remaining: bucket.tokens, retryAfterMs: 0 };
        }
        const deficit = tokens - bucket.tokens;
        const retryAfterMs = Math.ceil((deficit / this.capacity) * this.refillRateMs);
        return { allowed: false, remaining: 0, retryAfterMs };
    }
    reset(key) {
        this.store.delete(key);
    }
}
//# sourceMappingURL=rate-limit.js.map