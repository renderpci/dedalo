/**
 * STATUS
 * Bun engine health and per-node diffusion readiness checks.
 *
 * Two responsibilities:
 *   1. check_bun_health()       – overall engine stability (server, php_api, generic sql)
 *   2. enrich_diffusion_info_with_readiness() – injects connection_status into each
 *      section_diffusion_node based on its diffusion_element type (sql, rdf, xml, …)
 */

import mysql from 'mysql2/promise';



const DEDALO_API_URL  = process.env.DEDALO_API_URL  || 'http://localhost:8080/dedalo/core/api/v1/json/';
const HEALTH_TIMEOUT_MS = 10_000; // 10 s for health checks



// =====================================================
// SHARED TYPES
// =====================================================

export interface status_check {
	result: boolean;
	msg:    string;
}

export interface bun_health {
	result:  boolean;
	msg:     string;
	checks:  {
		server:  status_check;
		php_api: status_check;
		sql:     status_check;
	};
}

export interface node_readiness {
	result:  boolean;
	msg:     string;
	checks:  Record<string, status_check>;
}



// =====================================================
// INTERNAL CHECKS
// =====================================================

/**
 * CHECK_PHP_SESSION
 * Verifies PHP API is reachable and the forwarded session cookie is accepted.
 * Any valid HTTP 2xx response (even result:false) is considered success.
 */
async function check_php_session(cookie_header?: string): Promise<status_check> {

	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (cookie_header) {
		headers['Cookie'] = cookie_header;
	}

	try {
		const controller = new AbortController();
		const timeout_id = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

		const response = await fetch(DEDALO_API_URL, {
			method:  'POST',
			headers,
			body:    JSON.stringify({
				dd_api:  'dd_diffusion_api',
				action:  'get_diffusion_info',
				source:  { action: 'get_diffusion_status' },
				options: { section_tipo: '__health_check__' },
			}),
			signal:  controller.signal,
		});

		clearTimeout(timeout_id);

		if (!response.ok) {
			return { result: false, msg: `PHP API returned HTTP ${response.status}` };
		}

		await response.json(); // consume body; valid JSON = session + PHP up
		return { result: true, msg: 'PHP API reachable' };

	} catch (error: unknown) {
		const err_msg = error instanceof Error ? error.message : String(error);
		return { result: false, msg: `PHP API unreachable: ${err_msg}` };
	}
}



/**
 * CHECK_SQL_CONNECTION
 * Tries to open one connection to the given MariaDB/MySQL database.
 * Uses a fresh one-shot pool so it does not pollute the main pool cache.
 */
async function check_sql_connection(database_name?: string): Promise<status_check> {

	if (!database_name) {
		return { result: false, msg: 'No database_name provided for SQL check' };
	}

	let pool: mysql.Pool | null = null;
	let connection: mysql.PoolConnection | null = null;

	try {
		pool = mysql.createPool({
			socketPath:        process.env.DB_SOCKET   || '/tmp/mysql.sock',
			user:              process.env.DB_USER     || 'root',
			password:          process.env.DB_PASSWORD || '',
			database:          database_name,
			connectionLimit:   1,
			connectTimeout:    5_000,
		});

		connection = await pool.getConnection();
		return { result: true, msg: `Database "${database_name}" is ready` };

	} catch (error: unknown) {
		const err_msg = error instanceof Error ? error.message : String(error);
		return { result: false, msg: `Cannot connect to "${database_name}": ${err_msg}` };

	} finally {
		connection?.release();
		if (pool) {
			try { await pool.end(); } catch { /* ignore */ }
		}
	}
}



// =====================================================
// ENGINE HEALTH
// =====================================================

/**
 * CHECK_BUN_HEALTH
 * Returns overall Bun engine status (running, configured, PHP bridge, generic SQL).
 * sql check uses DB_DEFAULT_DATABASE env var; absence means SQL skipped.
 */
export async function check_bun_health(cookie_header?: string): Promise<bun_health> {

	const server_check: status_check = { result: true, msg: 'Bun server is running' };

	const default_db = process.env.DB_DEFAULT_DATABASE;
	const [php_check, sql_check] = await Promise.all([
		check_php_session(cookie_header),
		default_db
			? check_sql_connection(default_db)
			: Promise.resolve<status_check>({ result: true, msg: 'No default database configured (skipped)' }),
	]);

	const overall_result = server_check.result && php_check.result;

	return {
		result: overall_result,
		msg:    overall_result ? 'Bun engine is ready' : 'Bun engine has issues',
		checks: {
			server:  server_check,
			php_api: php_check,
			sql:     sql_check,
		},
	};
}



// =====================================================
// PER-NODE READINESS
// =====================================================

/**
 * CHECK_DIFFUSION_ELEMENT_READINESS
 * Checks readiness for one diffusion_element based on its type.
 *   sql / socrata  → PHP session + target SQL database
 *   rdf / xml      → PHP session only (no SQL write needed)
 *   others         → unchecked, marked ready with a note
 */
async function check_diffusion_element_readiness(
	element_tipo:   string,
	type:           string,
	database_name:  string | null,
	cookie_header?: string
): Promise<node_readiness> {

	const checks: Record<string, status_check> = {};
	let result = true;
	const msgs: string[] = [];

	switch (type) {

		case 'sql':
		case 'socrata': {
			const [php, sql] = await Promise.all([
				check_php_session(cookie_header),
				check_sql_connection(database_name ?? undefined),
			]);
			checks.php_api = php;
			checks.sql     = sql;
			if (!php.result) { result = false; msgs.push(php.msg); }
			if (!sql.result) { result = false; msgs.push(sql.msg); }
			break;
		}

		case 'rdf':
		case 'xml': {
			const php = await check_php_session(cookie_header);
			checks.php_api = php;
			if (!php.result) { result = false; msgs.push(php.msg); }
			break;
		}

		default:
			checks.unknown = {
				result: true,
				msg:    `No readiness check defined for type "${type}"`,
			};
			break;
	}

	return {
		result,
		msg:    result ? 'Ready' : msgs.join('; '),
		checks,
	};
}



/**
 * ENRICH_DIFFUSION_INFO_WITH_READINESS
 * Post-processes PHP get_diffusion_info result:
 *   - Iterates section_diffusion_nodes
 *   - For each node, finds its diffusion_element parent (type + database_name)
 *   - Injects connection_status onto the node
 *
 * Checks are deduplicated by element_tipo so shared parents are only checked once.
 *
 * @param php_result    - The `result` object from the PHP get_diffusion_info response
 * @param cookie_header - Forwarded browser Cookie for PHP session validation
 * @returns Mutated php_result with connection_status injected into each node
 */
export async function enrich_diffusion_info_with_readiness(
	php_result:      any,
	cookie_header?:  string
): Promise<any> {

	const section_diffusion_nodes: any[] = php_result?.section_diffusion_nodes;

	if (!Array.isArray(section_diffusion_nodes) || section_diffusion_nodes.length === 0) {
		return php_result;
	}

	// Deduplicate by element_tipo to avoid redundant SQL/PHP pings
	const readiness_cache = new Map<string, node_readiness>();

	async function get_readiness(
		element_tipo:  string,
		type:          string,
		database_name: string | null
	): Promise<node_readiness> {
		if (readiness_cache.has(element_tipo)) {
			return readiness_cache.get(element_tipo)!;
		}
		const readiness = await check_diffusion_element_readiness(
			element_tipo,
			type,
			database_name,
			cookie_header
		);
		readiness_cache.set(element_tipo, readiness);
		return readiness;
	}

	await Promise.all(section_diffusion_nodes.map(async (node: any) => {

		const parents: any[] = node.parents ?? [];
		const diffusion_element_parent = parents.find((p: any) => p.model === 'diffusion_element');

		if (!diffusion_element_parent) {
			return;
		}

		const element_tipo  = diffusion_element_parent.tipo as string;
		const type          = (diffusion_element_parent.type as string) ?? 'unknown';
		const database_parent = parents.find((p: any) => p.model === 'database');
		const database_name   = (database_parent?.label as string) ?? null;

		const readiness = await get_readiness(element_tipo, type, database_name);

		node.connection_status = {
			result: readiness.result,
			msg:    readiness.msg,
			checks: readiness.checks,
		};
	}));

	return php_result;
}
