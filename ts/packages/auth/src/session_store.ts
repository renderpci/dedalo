import type { SessionSnapshot } from '@dedalo/runtime';

/**
 * Session persistence. PHP used file-backed PHP sessions ($_SESSION['dedalo']);
 * a persistent, possibly multi-instance Bun server needs an external store so
 * sessions survive restarts and are shared across workers. The store is an
 * interface so dev/tests use an in-memory impl and production uses Redis.
 *
 * The stored payload is the SessionSnapshot (see @dedalo/runtime) — the resolved
 * auth state + CSRF token. Handlers read a snapshot attached to RequestContext;
 * they never touch the store directly mid-request.
 */
export interface SessionStore {
  get(sessionId: string): Promise<SessionSnapshot | null>;
  set(sessionId: string, data: SessionSnapshot, ttlSeconds: number): Promise<void>;
  destroy(sessionId: string): Promise<void>;
  /** Extend the TTL without rewriting the payload (sliding expiration). */
  touch(sessionId: string, ttlSeconds: number): Promise<void>;
}

/** In-memory store for tests/dev. NOT for production (per-process, lost on restart). */
export class InMemorySessionStore implements SessionStore {
  private readonly map = new Map<string, { data: SessionSnapshot; expiresAt: number }>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async get(sessionId: string): Promise<SessionSnapshot | null> {
    const entry = this.map.get(sessionId);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.map.delete(sessionId);
      return null;
    }
    return entry.data;
  }

  async set(sessionId: string, data: SessionSnapshot, ttlSeconds: number): Promise<void> {
    this.map.set(sessionId, { data, expiresAt: this.now() + ttlSeconds * 1000 });
  }

  async destroy(sessionId: string): Promise<void> {
    this.map.delete(sessionId);
  }

  async touch(sessionId: string, ttlSeconds: number): Promise<void> {
    const entry = this.map.get(sessionId);
    if (entry) entry.expiresAt = this.now() + ttlSeconds * 1000;
  }
}

/** Minimal Redis surface this store needs — satisfied by Bun's RedisClient. */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
}

/** Redis-backed session store for production. Keys are namespaced and JSON-encoded. */
export class RedisSessionStore implements SessionStore {
  constructor(
    private readonly redis: RedisLike,
    private readonly prefix = 'dedalo:sess:',
  ) {}

  private key(sessionId: string): string {
    return this.prefix + sessionId;
  }

  async get(sessionId: string): Promise<SessionSnapshot | null> {
    const raw = await this.redis.get(this.key(sessionId));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as SessionSnapshot;
    } catch {
      return null; // corrupt entry → treat as no session (fail closed)
    }
  }

  async set(sessionId: string, data: SessionSnapshot, ttlSeconds: number): Promise<void> {
    const key = this.key(sessionId);
    await this.redis.set(key, JSON.stringify(data));
    await this.redis.expire(key, ttlSeconds);
  }

  async destroy(sessionId: string): Promise<void> {
    await this.redis.del(this.key(sessionId));
  }

  async touch(sessionId: string, ttlSeconds: number): Promise<void> {
    await this.redis.expire(this.key(sessionId), ttlSeconds);
  }
}
