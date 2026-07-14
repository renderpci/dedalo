/**
 * MariaDB access for the Publication API.
 *
 * Driver: Bun-native `Bun.sql` with the 'mariadb' adapter — no third-party
 * client. This is the same driver the Dédalo engine uses for its diffusion
 * targets (src/diffusion/targets/mariadb/db.ts), verified against MariaDB 12:
 * unix-socket auth, utf8mb4, `?` placeholders via `.unsafe(sql, params)`,
 * INFORMATION_SCHEMA reads, FULLTEXT `MATCH … AGAINST`, and MySQLError with a
 * distinct `.errno`.
 *
 * The Publication API is deliberately ISOLATED: it never imports engine code
 * (it may run on a different host entirely, against a published database it
 * only ever reads). The engine module above is the PATTERN, not a dependency.
 *
 * Transport precedence: explicit DB_SOCKET > TCP DB_HOST:DB_PORT.
 */

import { SQL } from 'bun';
import { config, dbNameSet } from '../config';
import { NotFoundError } from '../errors';
import type { DbRow } from './types';

/**
 * One pool per configured database: a MariaDB session binds `database` at
 * connect time and the schema queries rely on DATABASE(). Worst-case open
 * connections are DB_NAMES.length × DB_POOL_MAX. Pools hold no request
 * identity — they are process state, cached for the life of the process.
 */
const pools = new Map<string, SQL>();

export function assertKnownDb(db: string): string {
  if (!dbNameSet.has(db)) {
    throw new NotFoundError(`Unknown database: ${db}`);
  }
  return db;
}

/** Connection options for one target database, resolved from config. */
function buildOptions(db: string): ConstructorParameters<typeof SQL>[0] {
  const common = {
    adapter: 'mariadb' as const,
    username: config.DB_USER,
    password: config.DB_PASSWORD,
    // ALWAYS an explicit database — a database-less MariaDB session misbehaves
    // under this adapter, and every query here is database-scoped anyway.
    database: db,
    max: config.DB_POOL_MAX,
  };
  return config.DB_SOCKET
    ? { ...common, path: config.DB_SOCKET }
    : { ...common, hostname: config.DB_HOST, port: config.DB_PORT };
}

export function getPool(db: string): SQL {
  assertKnownDb(db);

  let pool = pools.get(db);
  if (!pool) {
    pool = new SQL(buildOptions(db));
    pools.set(db, pool);
  }
  return pool;
}

/**
 * DATE/DATETIME columns come back as JS Date objects. The API's contract is
 * JSON, where a Date would serialize to an ISO-8601 UTC string anyway — do it
 * here, once, so every consumer (services, fragments, the MCP tools) sees the
 * same string shape rather than a Date in some paths and a string in others.
 * Everything else (numbers, strings, null, JSON TEXT) passes through untouched;
 * JSON-in-TEXT parsing is a separate, explicit step (utils/parse-json).
 */
export function normalizeValues(rows: DbRow[]): DbRow[] {
  for (const row of rows) {
    for (const key in row) {
      const value = row[key];
      if (value instanceof Date) {
        row[key] = value.toISOString();
      }
    }
  }
  return rows;
}

export async function dbExecute<T extends DbRow[] = DbRow[]>(
  db: string,
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const pool = getPool(db);
  const rows = (await pool.unsafe(sql, params)) as DbRow[];
  return normalizeValues(rows) as T;
}

export async function closePools(): Promise<void> {
  const open = [...pools.values()];
  pools.clear();
  await Promise.all(open.map(pool => pool.close().catch(() => {})));
}
