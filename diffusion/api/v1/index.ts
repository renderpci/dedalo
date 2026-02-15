/**
 * DIFFUSION ENGINE API
 * Bun-based middleware that bridges client RQO requests
 * to the PHP diffusion_api and writes parsed data to MariaDB.
 *
 * Architecture:
 *   Client → Bun (unix socket via Apache ProxyPass)
 *     → PHP diffusion_api (agnostic data + parser config)
 *     → Bun parses data (parser_text, parser_date, pattern_replacer)
 *     → MariaDB (INSERT/UPDATE)
 *     → Client response
 */

import { call_dd_diffusion_api }      from './lib/php_client';
import { process_response }           from './lib/diffusion_processor';
import { insert_table_data }          from './lib/db';
import { close_all_pools }            from './lib/db';
import { extract_cookie_header }      from './lib/session';
import type { rqo, engine_response }  from './lib/types';



const SOCKET_PATH = process.env.SOCKET_PATH || '/tmp/diffusion.sock';



// =====================================================
// ROUTE HANDLERS
// =====================================================

/**
 * HANDLE_DIFFUSE
 * Main diffusion endpoint.
 * Receives client RQO → calls PHP API → parses → inserts into MariaDB.
 */
async function handle_diffuse(request_rqo: rqo, cookie_header: string | null): Promise<engine_response> {

	// 1. Call PHP diffusion_api
	const php_response = await call_dd_diffusion_api(request_rqo, cookie_header ?? undefined);
console.error('php_response------------------->>', php_response)
	if (!php_response.result) {
		return {
			result: false,
			msg:    `PHP API error: ${php_response.msg}`,
			errors: php_response.errors,
		};
	}

	// 2. Process the response: apply parsers, transform to SQL-ready data
	const tables = process_response(php_response);

	if (tables.length === 0) {
		return {
			result: true,
			msg:    'No data to process (empty datum)',
			tables: [],
		};
	}

	// 3. Insert into MariaDB (parallel per table)
	const table_results: { table_name: string; records_affected: number }[] = [];
	const errors: string[] = [];

	const insert_promises = tables.map(async (table) => {
		try {
			const affected = await insert_table_data(table);
			return { table_name: table.table_name, records_affected: affected, error: null };
		} catch (error: unknown) {
			const err_msg = error instanceof Error ? error.message : String(error);
			console.error(`[diffuse] Error inserting into "${table.table_name}":`, error);
			return { table_name: table.table_name, records_affected: 0, error: err_msg };
		}
	});

	const results = await Promise.all(insert_promises);

	for (const result of results) {
		table_results.push({
			table_name:       result.table_name,
			records_affected: result.records_affected,
		});
		if (result.error) {
			errors.push(`Table "${result.table_name}": ${result.error}`);
		}
	}

	return {
		result: errors.length === 0,
		msg:    errors.length === 0
			? `OK. Processed ${table_results.length} table(s)`
			: `Partial success. ${errors.length} error(s)`,
		tables: table_results,
		errors: errors.length > 0 ? errors : undefined,
	};
}



/**
 * HANDLE_VALIDATE
 * Pass-through validation to PHP API.
 */
async function handle_validate(request_rqo: rqo, cookie_header: string | null): Promise<object> {

	const php_response = await call_dd_diffusion_api(
		{ ...request_rqo, action: 'validate' },
		cookie_header ?? undefined
	);

	return php_response;
}



/**
 * HANDLE_GET_ONTOLOGY_MAP
 * Pass-through to PHP API.
 */
async function handle_get_ontology_map(request_rqo: rqo, cookie_header: string | null): Promise<object> {

	const php_response = await call_dd_diffusion_api(
		{ ...request_rqo, action: 'get_ontology_map' },
		cookie_header ?? undefined
	);

	return php_response;
}



// =====================================================
// SERVER
// =====================================================

const server = Bun.serve({
	unix: SOCKET_PATH,

	async fetch(request: Request): Promise<Response> {

		const url    = new URL(request.url);
		const method = request.method;

		// Health check
		if (method === 'GET' && url.pathname === '/api/v1/health') {
			return Response.json({
				result: true,
				msg:    'diffusion is running',
				time:   new Date().toISOString(),
			});
		}

		// All API routes require POST
		if (method !== 'POST') {
			return Response.json(
				{ result: false, msg: 'Method not allowed' },
				{ status: 405 }
			);
		}

		// Parse request body
		let body: rqo;
		try {
			body = await request.json() as rqo;
		} catch {
			return Response.json(
				{ result: false, msg: 'Invalid JSON body' },
				{ status: 400 }
			);
		}

		// Extract Cookie header for passthrough to PHP API
		const cookie_header = extract_cookie_header(request);

		// Route by action
		const action = body.action;

		try {
			switch (action) {
				case 'diffuse': {
					const result = await handle_diffuse(body, cookie_header);
					return Response.json(result);
				}
				case 'validate': {
					const result = await handle_validate(body, cookie_header);
					return Response.json(result);
				}
				case 'get_ontology_map': {
					const result = await handle_get_ontology_map(body, cookie_header);
					return Response.json(result);
				}
				default:
					return Response.json(
						{ result: false, msg: `Unknown action: ${action}` },
						{ status: 400 }
					);
			}
		} catch (error: unknown) {
			const err_msg = error instanceof Error ? error.message : String(error);
			console.error(`[server] Unhandled error in action "${action}":`, error);
			return Response.json(
				{ result: false, msg: `Internal error: ${err_msg}` },
				{ status: 500 }
			);
		}
	},
});

console.log(`[diffusion] Listening on unix socket: ${SOCKET_PATH}`);



// =====================================================
// GRACEFUL SHUTDOWN
// =====================================================

async function shutdown(): Promise<void> {
	console.log('[diffusion] Shutting down...');
	server.stop();
	await close_all_pools();
	// Remove the socket file
	try {
		const fs = await import('fs');
		fs.unlinkSync(SOCKET_PATH);
	} catch { /* ignore */ }
	process.exit(0);
}

process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);
