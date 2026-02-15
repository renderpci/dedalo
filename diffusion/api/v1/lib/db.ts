/**
 * DB
 * MariaDB connection pool and query execution.
 * Uses mysql2 with connection pooling for efficient database access.
 */

import mysql from 'mysql2/promise';
import type { processed_table } from './types';
import { generate_batch_upsert, generate_create_table, generate_add_column_sql, generate_delete } from './sql_generator';



// Module-level pool cache per database name
const pool_cache = new Map<string, mysql.Pool>();



/**
 * GET_POOL
 * Returns a connection pool for the given database name.
 * Creates and caches the pool on first call.
 *
 * @param database_name - Target database name
 * @returns mysql2 connection pool
 */
export function get_pool(database_name: string): mysql.Pool {

	if (pool_cache.has(database_name)) {
		return pool_cache.get(database_name)!;
	}

	const pool = mysql.createPool({
		host:              process.env.DB_HOST     || 'localhost',
		port:              parseInt(process.env.DB_PORT || '3306', 10),
		user:              process.env.DB_USER     || 'root',
		password:          process.env.DB_PASSWORD || '',
		database:          database_name,
		waitForConnections: true,
		connectionLimit:    10,
		charset:           'utf8mb4',
	});

	pool_cache.set(database_name, pool);

	return pool;
}



/**
 * EXECUTE_QUERY
 * Executes a parameterized SQL query on the given database.
 *
 * @param database_name - Target database
 * @param sql           - SQL string with ? placeholders
 * @param params        - Parameter values
 * @returns Query result
 */
export async function execute_query(
	database_name: string,
	sql:           string,
	params:        (string | number | null)[] = []
): Promise<any> {

	const pool = get_pool(database_name);
	const [result] = await pool.execute(sql, params);
	return result;
}



/**
 * ENSURE_COLUMNS
 * Queries the existing columns of a table and adds any missing ones
 * using ALTER TABLE ADD COLUMN.
 *
 * @param connection    - Active MySQL connection
 * @param database_name - Database name
 * @param table_name    - Table name
 * @param table         - Processed table (to extract required columns)
 */
async function ensure_columns(
	connection:    mysql.PoolConnection,
	database_name: string,
	table_name:    string,
	table:         processed_table
): Promise<void> {

	// Get existing columns from INFORMATION_SCHEMA
	const [rows] = await connection.execute(
		`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
		[database_name, table_name]
	) as any;

	const existing_columns = new Set<string>(
		(rows as any[]).map((r: any) => r.COLUMN_NAME)
	);

	// Collect all required column names from the processed records
	const required_columns = new Set<string>();
	for (const record of table.records) {
		for (const col_name of Object.keys(record.columns)) {
			required_columns.add(col_name);
		}
	}

	// Find missing columns
	const missing: string[] = [];
	for (const col of required_columns) {
		if (!existing_columns.has(col)) {
			missing.push(col);
		}
	}

	// Add missing columns
	if (missing.length > 0) {
		const alter_statements = generate_add_column_sql(table, missing);
		for (const sql of alter_statements) {
			await connection.execute(sql);
		}
		console.log(`[db] Added ${missing.length} column(s) to "${table_name}": ${missing.join(', ')}`);
	}
}



/**
 * INSERT_TABLE_DATA
 * Inserts (upserts) records and executes deletions for a processed_table.
 * Uses a transaction for atomicity.
 * - Upserts: Creates table/cols if needed, then INSERT ... ON DUPLICATE KEY UPDATE
 * - Deletions: DELETE FROM table WHERE section_id IN (...)
 *
 * @param table - Processed table with database_name, table_name, records, and deletions
 * @returns Number of affected rows (inserted/updated + deleted)
 */
export async function insert_table_data(table: processed_table): Promise<number> {

	const has_records   = table.records.length > 0;
	const has_deletions = table.deletions && table.deletions.length > 0;

	if (!has_records && !has_deletions) return 0;

	const pool       = get_pool(table.database_name);
	const connection = await pool.getConnection();

	let affected_rows = 0;

	try {
		await connection.beginTransaction();

		// 1. Process Records (Upsert)
		if (has_records) {
			// Ensure table exists
			const create_sql = generate_create_table(table);
			await connection.execute(create_sql);

			// Ensure all required columns exist
			await ensure_columns(connection, table.database_name, table.table_name, table);

			// Insert/update all records
			const statements = generate_batch_upsert(table);
			for (const stmt of statements) {
				const [result] = await connection.execute(stmt.sql, stmt.params) as any;
				affected_rows += result.affectedRows ?? 0;
			}
		}

		// 2. Process Deletions
		if (has_deletions) {
			const del_stmt = generate_delete(table.table_name, table.deletions);
			try {
				const [result] = await connection.execute(del_stmt.sql, del_stmt.params) as any;
				affected_rows += result.affectedRows ?? 0;
			} catch (err: any) {
				// Ignore "Table doesn't exist" error (code 1146) — if table is missing, nothing to delete
				if (err.errno !== 1146) {
					throw err;
				}
			}
		}

		await connection.commit();

	} catch (error) {
		await connection.rollback();
		throw error;
	} finally {
		connection.release();
	}

	return affected_rows;
}




/**
 * CLOSE_ALL_POOLS
 * Closes all cached connection pools. Call on server shutdown.
 */
export async function close_all_pools(): Promise<void> {
	for (const [name, pool] of pool_cache) {
		await pool.end();
		pool_cache.delete(name);
	}
}
