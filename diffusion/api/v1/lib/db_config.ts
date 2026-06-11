/**
 * DB_CONFIG
 * Single source of MariaDB connection defaults for the diffusion engine.
 * Every module that opens a connection/pool (db.ts, db_admin.ts, status.ts)
 * must build its config from here so env defaults live in one place.
 */

export interface db_connection_config {
	socketPath?: string;
	host?:       string;
	port?:       number;
	user:        string;
	password:    string;
	database?:   string;
}

/**
 * GET_DB_CONFIG
 * Returns the base MariaDB connection config from env vars with the
 * engine defaults, optionally scoped to a database.
 *
 * Transport precedence:
 *  1. DB_SOCKET set        → unix socket (production default on the host)
 *  2. DB_FORCE_TCP=1       → TCP via DB_HOST/DB_PORT (CI service containers,
 *                            remote MariaDB)
 *  3. otherwise            → unix socket /tmp/mysql.sock
 *
 * @param database - Optional database name to select
 * @returns Connection config consumable by mysql2 createPool/createConnection
 */
export function get_db_config(database?: string): db_connection_config {

	const base = {
		user:     process.env.DB_USER     || 'root',
		password: process.env.DB_PASSWORD || '',
		...(database ? { database } : {}),
	};

	if (!process.env.DB_SOCKET && process.env.DB_FORCE_TCP === '1') {
		return {
			...base,
			host: process.env.DB_HOST || '127.0.0.1',
			port: parseInt(process.env.DB_PORT || '3306', 10),
		};
	}

	return {
		...base,
		socketPath: process.env.DB_SOCKET || '/tmp/mysql.sock',
	};
}
