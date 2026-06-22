import postgres, { type Sql } from 'postgres';
import type { DbConnectionConfig } from './config.ts';
import { DbSession } from './session.ts';

/**
 * The process-global Postgres connection pool. ONE Db per server process; it
 * hands out a reserved-connection-bound DbSession per request (Db.reserve()).
 * The pool is shared and safe; individual connections are checked out per
 * request so transaction state never interleaves (see DbSession).
 */
export class Db {
  private constructor(private readonly sql: Sql) {}

  static create(cfg: DbConnectionConfig): Db {
    // postgres.js connects via Unix socket when `host` is a directory path
    // (e.g. '/tmp' → '/tmp/.s.PGSQL.<port>'), otherwise over TCP. JSONB columns
    // are returned as parsed JS objects by default, matching the PHP matrix model.
    const sql = postgres({
      host: cfg.host,
      port: cfg.port,
      database: cfg.database,
      username: cfg.user,
      password: cfg.password,
      max: cfg.max ?? 10,
      idle_timeout: cfg.idleTimeout ?? 30,
      connect_timeout: cfg.connectTimeout ?? 10,
      prepare: true,
    });
    return new Db(sql);
  }

  /** For tests: wrap an already-constructed postgres.js instance. */
  static fromSql(sql: Sql): Db {
    return new Db(sql);
  }

  /**
   * Reserve a connection for the lifetime of a request and wrap it in a
   * DbSession. The caller MUST release() it (in a finally) when the request ends.
   */
  async reserve(): Promise<DbSession> {
    const reserved = await this.sql.reserve();
    return new DbSession(reserved);
  }

  /** Run a single self-contained query off the pool (no request reservation). */
  async query<T = unknown>(text: string, params: unknown[] = []): Promise<T[]> {
    return (await this.sql.unsafe<T[]>(text, params as never[])) as unknown as T[];
  }

  /** Liveness check. */
  async ping(): Promise<boolean> {
    const rows = await this.sql.unsafe<Array<{ ok: number }>>('select 1 as ok');
    return rows[0]?.ok === 1;
  }

  /** Close the pool. Call on server shutdown. */
  async end(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}
