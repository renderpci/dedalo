/**
 * Connection probes (PHP installer test_db_connection / test_diffusion_connection).
 * Both take POSTED credentials and answer the client contract `{result, msg,
 * ...}`. The Postgres probe additionally distinguishes "DB missing" from
 * "auth/host wrong" by falling back to the `postgres` maintenance DB, so the
 * wizard can tell the operator whether to create the database.
 */

import type { DbConnDescriptor } from './pg_exec.ts';
import { psqlSelect1 } from './pg_exec.ts';

/** Coerce the posted db_* options into a connection descriptor. */
function pgConnFromOptions(o: Record<string, unknown>): DbConnDescriptor {
	return {
		database: String(o.db_database ?? ''),
		host: String(o.db_hostname ?? 'localhost'),
		port: String(o.db_port ?? '5432'),
		user: String(o.db_username ?? ''),
		password: String(o.db_password ?? ''),
		socket: o.db_socket ? String(o.db_socket) : undefined,
	};
}

export interface DbProbeResult {
	result: boolean;
	can_connect: boolean;
	db_exists: boolean;
	can_create: boolean;
	msg: string;
}

/** Probe the posted Postgres connection (target DB, then `postgres` fallback). */
export async function testDbConnection(o: Record<string, unknown>): Promise<DbProbeResult> {
	const conn = pgConnFromOptions(o);
	if (conn.database === '' || conn.user === '') {
		return {
			result: false,
			can_connect: false,
			db_exists: false,
			can_create: false,
			msg: 'Database name and user are required',
		};
	}

	// 1) Try the target database directly.
	const target = await psqlSelect1(conn);
	if (target.exitCode === 0) {
		return {
			result: true,
			can_connect: true,
			db_exists: true,
			can_create: false,
			msg: `Connected to '${conn.database}' — OK`,
		};
	}

	// 2) Distinguish "DB missing" from "auth/host wrong" via the maintenance DB.
	const maintenance = await psqlSelect1(conn, 'postgres');
	if (maintenance.exitCode === 0) {
		return {
			result: false,
			can_connect: true,
			db_exists: false,
			can_create: true,
			msg: `Server reachable but database '${conn.database}' does not exist — create it (empty) and retry`,
		};
	}

	return {
		result: false,
		can_connect: false,
		db_exists: false,
		can_create: false,
		msg: `Cannot connect: ${target.stderr || maintenance.stderr || 'unknown error'}`,
	};
}

export interface DiffusionProbeResult {
	result: boolean;
	msg: string;
}

/** Probe the posted MariaDB diffusion connection (one-shot, then closed). */
export async function testDiffusionConnection(
	o: Record<string, unknown>,
): Promise<DiffusionProbeResult> {
	// Reach MariaDB ONLY through the diffusion facade (boundary_seam rule).
	const { probeDiffusionConnection } = await import('../../diffusion/api/info.ts');
	return probeDiffusionConnection({
		host: String(o.mysql_hostname ?? 'localhost'),
		port: Number(o.mysql_port ?? 3306) || 3306,
		socket: o.mysql_socket ? String(o.mysql_socket) : undefined,
		database: String(o.mysql_database ?? ''),
		username: String(o.mysql_username ?? ''),
		password: String(o.mysql_password ?? ''),
	});
}
