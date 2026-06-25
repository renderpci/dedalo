/**
 * PostgreSQL connection configuration for the Dédalo core matrix database.
 *
 * Mirrors PHP's DEDALO_*_CONN env (see core/db/class.DBi.php / private/.env):
 * a Unix-socket host (e.g. '/tmp') OR a TCP host, a port, database, user,
 * password. This layer is Postgres-ONLY — it is never shared with the diffusion
 * engine's MariaDB connection (the "Bun-owns-MariaDB" boundary stays separate).
 */
export interface DbConnectionConfig {
  /** Unix socket directory (starts with '/') or TCP host. Maps DEDALO_HOSTNAME_CONN. */
  host: string;
  /** TCP port (also used to locate the socket file .s.PGSQL.<port>). */
  port: number;
  database: string;
  user: string;
  password: string;
  /** Max pooled connections. */
  max?: number;
  /** Idle connection timeout (seconds) before the pool closes it. */
  idleTimeout?: number;
  /** Statement/query timeout (seconds); 0 disables. */
  connectTimeout?: number;
}

/** True when the host is a Unix-socket directory rather than a TCP host. */
export function isSocketHost(host: string): boolean {
  return host.startsWith('/');
}

/**
 * Build a DbConnectionConfig from a flat env map (the DEDALO_*_CONN keys), so the
 * db layer can be driven directly from the same env PHP reads, without taking a
 * hard dependency on @dedalo/config. Throws if a required key is missing.
 */
export function connectionConfigFromEnv(
  env: Record<string, string | undefined>,
): DbConnectionConfig {
  const req = (k: string): string => {
    const v = env[k];
    if (v === undefined || v === '') throw new Error(`Missing required DB env var: ${k}`);
    return v;
  };
  const portRaw = req('DEDALO_DB_PORT_CONN');
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isInteger(port)) throw new Error(`Invalid DEDALO_DB_PORT_CONN: ${portRaw}`);
  return {
    host: req('DEDALO_HOSTNAME_CONN'),
    port,
    database: req('DEDALO_DATABASE_CONN'),
    user: req('DEDALO_USERNAME_CONN'),
    password: req('DEDALO_PASSWORD_CONN'),
  };
}
