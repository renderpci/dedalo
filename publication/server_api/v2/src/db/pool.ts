import mysql from 'mysql2/promise';
import { config, dbNameSet } from '../config';
import { NotFoundError } from '../errors';

// One pool per configured database: mysql2 binds `database` at connection
// time and schema queries rely on DATABASE(). Worst-case open connections
// are DB_NAMES.length × DB_POOL_MAX.
const pools = new Map<string, mysql.Pool>();

export function assertKnownDb(db: string): string {
  if (!dbNameSet.has(db)) {
    throw new NotFoundError(`Unknown database: ${db}`);
  }
  return db;
}

export function getPool(db: string): mysql.Pool {
  assertKnownDb(db);

  let pool = pools.get(db);
  if (!pool) {
    pool = mysql.createPool({
      host: config.DB_HOST,
      port: config.DB_PORT,
      user: config.DB_USER,
      password: config.DB_PASSWORD,
      database: db,
      waitForConnections: true,
      connectionLimit: config.DB_POOL_MAX,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      charset: 'utf8mb4',
      timezone: '+00:00',
    });
    pools.set(db, pool);
  }
  return pool;
}

export async function dbExecute<T extends mysql.RowDataPacket[]>(
  db: string,
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const pool = getPool(db);
  const [rows] = await pool.query<T>({ sql, timeout: config.DB_QUERY_TIMEOUT }, params);
  return rows;
}

export async function closePools(): Promise<void> {
  const open = [...pools.values()];
  pools.clear();
  await Promise.all(open.map(pool => pool.end()));
}
