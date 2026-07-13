import { config } from '../config';
import { RateLimitError } from '../errors';
import { clientIp } from './client-ip';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, TokenBucket>();
const REFILL_INTERVAL = 60000;
const MAX_TOKENS = config.RATE_LIMIT_RPM;

function refillBucket(bucket: TokenBucket): void {
  const now = Date.now();
  const elapsed = now - bucket.lastRefill;

  if (elapsed >= REFILL_INTERVAL) {
    const refills = Math.floor(elapsed / REFILL_INTERVAL);
    bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + refills * MAX_TOKENS);
    bucket.lastRefill = now;
  }
}

function bucketFor(ip: string): TokenBucket {
  let bucket = buckets.get(ip);

  if (!bucket) {
    bucket = { tokens: MAX_TOKENS, lastRefill: Date.now() };
    buckets.set(ip, bucket);
  }

  refillBucket(bucket);
  return bucket;
}

/** Spend one token for this request, or reject it. */
export function checkRateLimit(req: Request): void {
  const bucket = bucketFor(clientIp(req));

  if (bucket.tokens <= 0) {
    throw new RateLimitError('Rate limit exceeded. Try again later.');
  }

  bucket.tokens--;
}

/**
 * Spend `count` EXTRA tokens for work this request fans out into.
 *
 * A batch is one HTTP request that runs up to MAX_BATCH_QUERIES queries, so
 * charging it a single token let a client multiply their effective query budget
 * by 20 simply by wrapping the same reads in /batch. The sub-queries are charged
 * here, together, before any of them run: the batch either affords its whole fan-out
 * or is rejected as a unit (partially-charged work would be the worst of both).
 */
export function chargeRateLimit(req: Request, count: number): void {
  if (count <= 0) return;

  const bucket = bucketFor(clientIp(req));

  if (bucket.tokens < count) {
    throw new RateLimitError(
      `Rate limit exceeded: this batch needs ${count} more request(s) than your remaining quota. Try again later or send fewer queries.`,
    );
  }

  bucket.tokens -= count;
}

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function cleanupStaleBuckets(): void {
  const now = Date.now();
  for (const [ip, bucket] of buckets.entries()) {
    if (now - bucket.lastRefill > REFILL_INTERVAL * 10) {
      buckets.delete(ip);
    }
  }
}

export function startRateLimitCleanup(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(cleanupStaleBuckets, 60000);
  cleanupInterval.unref?.();
}

export function stopRateLimitCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
