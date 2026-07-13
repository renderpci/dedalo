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

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.data;
  }

  set(key: string, data: T): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  invalidate(key?: string): void {
    if (key) {
      this.store.delete(key);
    } else {
      this.store.clear();
    }
  }

  get size(): number {
    return this.store.size;
  }
}
