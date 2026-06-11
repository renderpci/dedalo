/**
 * INTEGRATION TEST HELPER
 * Auto-managed MariaDB test database for the diffusion engine
 * integration suite.
 *
 * - Probes the MariaDB server once (top-level await): when unreachable the
 *   suites self-skip via `describe.skipIf(!db_available)` so `bun test`
 *   stays green on machines without MariaDB.
 * - create_test_db()/drop_test_db() manage a dedicated database
 *   (web_test_diffusion) so tests NEVER touch real diffusion targets.
 * - Credentials come from the standard env (lib/db_config.ts); `bun test`
 *   sets NODE_ENV=test and auto-loads `.env.test` for overrides
 *   (see .env.test.example).
 */

import mysql from 'mysql2/promise';
import { get_db_config } from '../../lib/db_config';

export const TEST_DB = 'web_test_diffusion';

/**
 * PROBE
 * 2s connection attempt against the configured MariaDB AND a capability
 * check: the configured user must be able to create the dedicated test
 * database. Returns 'ok' | 'unreachable' | 'no_privilege'.
 */
async function probe(): Promise<'ok' | 'unreachable' | 'no_privilege'> {
	let conn: mysql.Connection | null = null;
	try {
		conn = await mysql.createConnection({
			...get_db_config(),
			connectTimeout: 2_000,
		});
		await conn.ping();
	} catch {
		if (conn) await conn.end().catch(() => {});
		return 'unreachable';
	}

	try {
		await conn.query(`CREATE DATABASE IF NOT EXISTS \`${TEST_DB}\` CHARACTER SET utf8mb4`);
		return 'ok';
	} catch {
		return 'no_privilege';
	} finally {
		await conn.end().catch(() => {});
	}
}

const probe_result = await probe();
export const db_available: boolean = probe_result === 'ok';

if (probe_result === 'unreachable') {
	console.warn('[integration] MariaDB unreachable with current env — integration suites SKIPPED');
} else if (probe_result === 'no_privilege') {
	console.warn(
		`[integration] MariaDB user cannot create '${TEST_DB}' — integration suites SKIPPED.\n` +
		`[integration] Grant it with: GRANT ALL PRIVILEGES ON \`${TEST_DB}\`.* TO '<user>'@'localhost';`
	);
}

/**
 * ADMIN_QUERY
 * One-shot query without database selection (CREATE/DROP DATABASE, etc.)
 */
export async function admin_query(sql: string): Promise<void> {
	const conn = await mysql.createConnection({ ...get_db_config(), connectTimeout: 5_000 });
	try {
		await conn.query(sql);
	} finally {
		await conn.end().catch(() => {});
	}
}

export async function create_test_db(): Promise<void> {
	await admin_query(`CREATE DATABASE IF NOT EXISTS \`${TEST_DB}\` CHARACTER SET utf8mb4`);
}

export async function drop_test_db(): Promise<void> {
	await admin_query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
}

/**
 * QUERY_TEST_DB
 * Runs a query against the test database and returns rows.
 */
export async function query_test_db(sql: string, params: unknown[] = []): Promise<any[]> {
	const conn = await mysql.createConnection({
		...get_db_config(TEST_DB),
		connectTimeout: 5_000,
	});
	try {
		const [rows] = await conn.execute(sql, params);
		return rows as any[];
	} finally {
		await conn.end().catch(() => {});
	}
}
