/**
 * DB_ADMIN
 * MariaDB administrative operations executed by the Bun engine on behalf
 * of PHP (server-to-server). MariaDB management is a Bun responsibility:
 * PHP never connects to MariaDB directly — it asks this API to check
 * database existence, run backups, etc.
 */

import mysql from 'mysql2/promise';
import { statSync, mkdirSync } from 'fs';
import path from 'path';



export interface check_database_response {
	result:  boolean;
	msg:     string;
	exists:  boolean;
}

export interface backup_database_response {
	result:      boolean;
	msg:         string;
	target_file: string | null;
	file_exists: boolean;
	file_size:   number;
}



/**
 * CHECK_DATABASE_EXISTS
 * Verifies the MariaDB server is reachable and whether the given database
 * exists. Connects without selecting a database so a missing database is
 * distinguishable from a server-down condition.
 *
 * @param database_name - Database name to check
 * @returns check_database_response (result=false only on server/connection errors)
 */
export async function check_database_exists(database_name: unknown): Promise<check_database_response> {

	if (typeof database_name !== 'string' || database_name.length === 0) {
		return { result: false, msg: 'Missing or invalid database_name', exists: false };
	}

	let pool: mysql.Pool | null = null;

	try {
		// one-shot pool, no database selected (mirrors status.ts check style)
		pool = mysql.createPool({
			socketPath:      process.env.DB_SOCKET   || '/tmp/mysql.sock',
			user:            process.env.DB_USER     || 'root',
			password:        process.env.DB_PASSWORD || '',
			connectionLimit: 1,
			connectTimeout:  5_000,
		});

		const [rows] = await pool.execute(
			'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
			[database_name]
		) as any;

		const exists = Array.isArray(rows) && rows.length > 0;

		return {
			result: true,
			msg:    exists ? `Database '${database_name}' exists` : `Database '${database_name}' not found`,
			exists,
		};

	} catch (error: unknown) {
		const err_msg = error instanceof Error ? error.message : String(error);
		return { result: false, msg: `MariaDB unreachable: ${err_msg}`, exists: false };

	} finally {
		if (pool) await pool.end().catch(() => {});
	}
}



/**
 * VALIDATE_BACKUP_REQUEST
 * Validates a backup_database request. Returns an error message or null.
 * Exported for unit testing.
 */
export function validate_backup_request(database_name: unknown, target_file: unknown): string | null {

	if (typeof database_name !== 'string' || !/^[A-Za-z0-9_-]+$/.test(database_name)) {
		return 'Missing or invalid database_name';
	}
	if (typeof target_file !== 'string' || target_file.length === 0) {
		return 'Missing target_file';
	}
	if (!path.isAbsolute(target_file)) {
		return 'target_file must be an absolute path';
	}
	if (target_file.includes('..')) {
		return 'target_file must not contain ".."';
	}
	if (!target_file.endsWith('.sql')) {
		return 'target_file must end with .sql';
	}

	return null;
}



/**
 * BACKUP_DATABASE
 * Dumps the given database to target_file using mysqldump.
 * The password is passed via the MYSQL_PWD env var (not argv) so it never
 * appears in the process list.
 *
 * @param database_name - Database to dump
 * @param target_file   - Absolute .sql path computed by the caller (PHP)
 * @returns backup_database_response
 */
export async function backup_database(database_name: string, target_file: string): Promise<backup_database_response> {

	const validation_error = validate_backup_request(database_name, target_file);
	if (validation_error) {
		return { result: false, msg: validation_error, target_file: null, file_exists: false, file_size: 0 };
	}

	try {
		// ensure target directory exists
		mkdirSync(path.dirname(target_file), { recursive: true, mode: 0o750 });

		const bin = process.env.MYSQLDUMP_BIN || 'mysqldump';
		const args = [
			`--user=${process.env.DB_USER || 'root'}`,
			`--socket=${process.env.DB_SOCKET || '/tmp/mysql.sock'}`,
			`--result-file=${target_file}`,
			database_name,
		];

		const proc = Bun.spawn([bin, ...args], {
			env:    { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD || '' },
			stdout: 'ignore',
			stderr: 'pipe',
		});

		const exit_code = await proc.exited;
		const stderr    = await new Response(proc.stderr).text();

		if (exit_code !== 0) {
			console.error(`[backup_database] mysqldump failed (exit ${exit_code}): ${stderr}`);
			return {
				result:      false,
				msg:         `mysqldump failed (exit ${exit_code}): ${stderr.slice(0, 512)}`,
				target_file,
				file_exists: false,
				file_size:   0,
			};
		}

		let file_size = 0;
		let file_exists = false;
		try {
			const stats = statSync(target_file);
			file_exists = true;
			file_size   = stats.size;
		} catch { /* file missing */ }

		return {
			result:      file_exists,
			msg:         file_exists
				? `Backup done: ${database_name}`
				: `mysqldump finished but target file is missing: ${target_file}`,
			target_file,
			file_exists,
			file_size,
		};

	} catch (error: unknown) {
		const err_msg = error instanceof Error ? error.message : String(error);
		console.error(`[backup_database] Error:`, error);
		return { result: false, msg: `Backup error: ${err_msg}`, target_file, file_exists: false, file_size: 0 };
	}
}
