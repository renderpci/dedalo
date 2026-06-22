import type { ReservedSql, Row } from 'postgres';

/**
 * A per-request database session bound to ONE reserved pooled connection.
 *
 * PHP's DBi kept a single static connection per process and tracked nested
 * transactions with a `$tx_depth` counter + `dd_tx_{n}` SAVEPOINTs (depth 0 =
 * real BEGIN/COMMIT; depth ≥ 1 = SAVEPOINT so inner blocks roll back
 * independently). The faithful TS equivalent is one reserved connection per
 * request with a per-SESSION (instance, not static) depth counter — so SAVEPOINT
 * nesting is isolated per request and never interleaves across concurrent
 * requests. Acquire via Db.reserve(); always release() in a finally.
 */
export class DbSession {
  private depth = 0;
  private ownsBegin = false;
  private released = false;

  constructor(private readonly conn: ReservedSql) {}

  /** Run a parameterized query, returning all rows. JSONB columns come back as JS objects. */
  async query<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
    this.assertOpen();
    const rows = await this.conn.unsafe<T[]>(text, params as never[]);
    return rows as unknown as T[];
  }

  /** Run a query expected to return at most one row. */
  async queryOne<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(text, params);
    return rows.length > 0 ? (rows[0] as T) : null;
  }

  /** Current nesting depth (0 = no open transaction). Test/diagnostic aid. */
  transactionDepth(): number {
    return this.depth;
  }

  /**
   * Open a transaction or nested savepoint. Depth 0 → real BEGIN; depth ≥ 1 →
   * SAVEPOINT dd_tx_{depth+1}. Mirrors DBi::begin_transaction.
   */
  async begin(): Promise<void> {
    this.assertOpen();
    if (this.depth === 0) {
      await this.conn.unsafe('BEGIN');
      this.ownsBegin = true;
    } else {
      await this.conn.unsafe(`SAVEPOINT ${this.savepointName(this.depth + 1)}`);
    }
    this.depth++;
  }

  /**
   * Commit the innermost transaction/savepoint. Depth 1 + ownsBegin → COMMIT;
   * otherwise RELEASE SAVEPOINT dd_tx_{depth}. Mirrors DBi::commit_transaction.
   */
  async commit(): Promise<void> {
    this.assertOpen();
    if (this.depth < 1) throw new Error('commit() called with no open transaction');
    if (this.depth === 1 && this.ownsBegin) {
      await this.conn.unsafe('COMMIT');
      this.ownsBegin = false;
    } else {
      await this.conn.unsafe(`RELEASE SAVEPOINT ${this.savepointName(this.depth)}`);
    }
    this.depth--;
  }

  /**
   * Roll back the innermost transaction/savepoint. Depth 1 + ownsBegin → ROLLBACK;
   * otherwise ROLLBACK TO SAVEPOINT dd_tx_{depth} then RELEASE it. Mirrors
   * DBi::rollback_transaction.
   */
  async rollback(): Promise<void> {
    this.assertOpen();
    if (this.depth < 1) throw new Error('rollback() called with no open transaction');
    if (this.depth === 1 && this.ownsBegin) {
      await this.conn.unsafe('ROLLBACK');
      this.ownsBegin = false;
    } else {
      const sp = this.savepointName(this.depth);
      await this.conn.unsafe(`ROLLBACK TO SAVEPOINT ${sp}`);
      await this.conn.unsafe(`RELEASE SAVEPOINT ${sp}`);
    }
    this.depth--;
  }

  /**
   * Run `fn` inside a transaction/savepoint: begin, then commit on success or
   * rollback on throw (re-raising the error). Nests correctly when called within
   * an outer transaction() — the inner block becomes a savepoint.
   */
  async transaction<T>(fn: (session: DbSession) => Promise<T>): Promise<T> {
    await this.begin();
    try {
      const result = await fn(this);
      await this.commit();
      return result;
    } catch (err) {
      await this.rollback();
      throw err;
    }
  }

  /** Return the connection to the pool. Idempotent. */
  release(): void {
    if (this.released) return;
    this.released = true;
    this.conn.release();
  }

  private savepointName(depth: number): string {
    // Internal, fixed pattern — never user input. Matches DBi's dd_tx_{n}.
    return `dd_tx_${depth}`;
  }

  private assertOpen(): void {
    if (this.released) throw new Error('DbSession used after release()');
  }
}
