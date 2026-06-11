/**
 * DB_CONFIG
 * Single source of MariaDB connection defaults for the diffusion engine.
 * Every module that opens a connection/pool (db.ts, db_admin.ts, status.ts)
 * must build its config from here so env defaults live in one place.
 */

export interface db_connection_config {
	socketPath: string;
	user:       string;
	password:   string;
	database?:  string;
}

/**
 * GET_DB_CONFIG
 * Returns the base MariaDB connection config from env vars with the
 * engine defaults, optionally scoped to a database.
 *
 * @param database - Optional database name to select
 * @returns Connection config consumable by mysql2 createPool/createConnection
 */
export function get_db_config(database?: string): db_connection_config {
	return {
		socketPath: process.env.DB_SOCKET   || '/tmp/mysql.sock',
		user:       process.env.DB_USER     || 'root',
		password:   process.env.DB_PASSWORD || '',
		...(database ? { database } : {}),
	};
}
