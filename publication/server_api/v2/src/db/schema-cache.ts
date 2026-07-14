/**
 * A minimal process-local TTL cache — one Map, expiry checked lazily on read.
 *
 * It caches SCHEMA, never record data: the table/column listings in
 * services/schema.service.ts and the `dd_relations` map read out of
 * `publication_schema` in services/resolve.service.ts, all at a 30-second TTL.
 *
 * Why that is safe. A published database is a PRODUCT of the Dédalo diffusion
 * process, not a live store — its schema changes only when Dédalo republishes,
 * and this API never writes. So schema is effectively static between
 * publications, and the only cost of the TTL is up to 30 s of staleness in the
 * window right after a republication; in steady state the cached answer is the
 * exact answer. Cache the same way for record data and you would be serving
 * stale rows for no comparable win.
 *
 * The generic is the whole design: the cache stores whatever the caller puts in
 * it and never inspects it, so there is one implementation instead of three.
 *
 * This is process state shared by every concurrent request — safe here only
 * because nothing it holds is request-specific (keys are `db` or `db:table`,
 * values are schema). Do not put anything principal- or language-scoped in it.
 *
 * There is no eviction timer and no size cap, deliberately: the key space is
 * bounded by DB_NAMES × published tables, which is small and fixed, so a Map
 * that only grows to that bound needs neither.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class TTLCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private ttlMs: number;

  constructor(ttlSeconds: number) {
    this.ttlMs = ttlSeconds * 1000;
  }

  /**
   * Expiry is lazy: an entry is only checked (and dropped) when someone asks for
   * it, so a key that is never read again simply sits there rather than costing
   * a timer. An expired entry is indistinguishable from a miss to the caller.
   */
  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.data;
  }

  // The TTL runs from the WRITE, not from first use: an entry is never renewed
  // by being read, so a hot key still re-reads the schema every 30 s.
  set(key: string, data: T): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /** With no key, drops everything — the escape hatch for "the DB just changed under us". */
  invalidate(key?: string): void {
    if (key) {
      this.store.delete(key);
    } else {
      this.store.clear();
    }
  }

  // Counts entries including any that have expired but not yet been read out.
  get size(): number {
    return this.store.size;
  }
}
