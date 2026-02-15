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
 *     → Client response (NDJSON stream with per-record progress)
 */

import { call_dd_diffusion_api }      from './lib/php_client';
import { process_response }           from './lib/diffusion_processor';
import { insert_table_data }          from './lib/db';
import { close_all_pools }            from './lib/db';
import { extract_cookie_header }      from './lib/session';
import {
	create_process,
	update_progress,
	finish_process,
	get_progress,
	delete_process,
}                                     from './lib/progress_store';
import type {
	rqo,
	engine_response,
	progress_data,
}                                     from './lib/types';



const SOCKET_PATH = process.env.SOCKET_PATH || '/tmp/diffusion.sock';

// Text encoder for SSE chunks
const encoder = new TextEncoder();



// =====================================================
// SSE HELPERS
// =====================================================

/**
 * ENCODE_SSE_CHUNK
 * Formats a progress_data object into the SSE wire format
 * used by the PHP version: "data:\n{json}\n\n"
 * This format is parsed by data_manager.read_stream on the client.
 */
function encode_sse_chunk(data: progress_data): Uint8Array {
	const json = JSON.stringify(data);
	return encoder.encode(`data:\n${json}\n\n`);
}



// =====================================================
// ROUTE HANDLERS
// =====================================================

/**
 * HANDLE_DIFFUSE_STREAM
 * Main diffusion endpoint — returns a streaming response.
 * Receives client RQO → calls PHP API → parses → inserts into MariaDB
 * → streams per-record progress to the client.
 */
function handle_diffuse_stream(request_rqo: rqo, cookie_header: string | null): Response {

	const stream = new ReadableStream({
		async start(controller) {

			const start_time = Date.now();
			let process_id = '';

			try {
				// 1. Call PHP diffusion_api
				const php_response = await call_dd_diffusion_api(request_rqo, cookie_header ?? undefined);

				if (!php_response.result) {
					// Send error as a single chunk and close
					const error_result: engine_response = {
						result: false,
						msg:    `PHP API error: ${php_response.msg}`,
						errors: php_response.errors,
					};
					const error_progress: progress_data = {
						process_id: '',
						is_running: false,
						started_at: start_time,
						data:       { msg: error_result.msg, counter: 0, total: 0 },
						total_time: '0 sec',
						errors:     php_response.errors ?? [],
						result:     error_result,
					};
					controller.enqueue(encode_sse_chunk(error_progress));
					controller.close();
					return;
				}

				// 2. Process the response: apply parsers, transform to SQL-ready data
				const tables = process_response(php_response);

				if (tables.length === 0) {
					const empty_result: engine_response = {
						result: true,
						msg:    'No data to process (empty datum)',
						tables: [],
					};
					const empty_progress: progress_data = {
						process_id: '',
						is_running: false,
						started_at: start_time,
						data:       { msg: empty_result.msg, counter: 0, total: 0 },
						total_time: '0 sec',
						errors:     [],
						result:     empty_result,
					};
					controller.enqueue(encode_sse_chunk(empty_progress));
					controller.close();
					return;
				}

				// 3. Count total records and create progress entry
				const total_records = tables.reduce((sum, t) => sum + t.records.length, 0);
				process_id = create_process(total_records);

				// Send initial chunk with process_id
				const initial = get_progress(process_id);
				if (initial) {
					controller.enqueue(encode_sse_chunk(initial));
				}

				// 4. Insert into MariaDB with per-table progress
				const table_results: { table_name: string; records_affected: number }[] = [];
				const errors: string[] = [];
				let global_counter = 0;

				for (const table of tables) {

					const record_start = Date.now();

					try {
						const affected = await insert_table_data(table);
						global_counter += table.records.length;

						table_results.push({
							table_name:       table.table_name,
							records_affected: affected,
						});

						// Update progress store and stream
						const elapsed = Date.now() - start_time;
						const record_time = Date.now() - record_start;

						update_progress(process_id, {
							counter:       global_counter,
							msg:           'Processing records',
							section_label: table.table_name,
							time_ms:       record_time,
							total_ms:      elapsed,
						});

						const snapshot = get_progress(process_id);
						if (snapshot) {
							controller.enqueue(encode_sse_chunk(snapshot));
						}

					} catch (error: unknown) {
						const err_msg = error instanceof Error ? error.message : String(error);
						console.error(`[diffuse] Error inserting into "${table.table_name}":`, error);

						global_counter += table.records.length;
						errors.push(`Table "${table.table_name}": ${err_msg}`);

						table_results.push({
							table_name:       table.table_name,
							records_affected: 0,
						});

						update_progress(process_id, {
							counter: global_counter,
							msg:     'Processing records',
							error:   `Table "${table.table_name}": ${err_msg}`,
						});

						const snapshot = get_progress(process_id);
						if (snapshot) {
							controller.enqueue(encode_sse_chunk(snapshot));
						}
					}
				}

				// 5. Final result
				const final_result: engine_response = {
					result: errors.length === 0,
					msg:    errors.length === 0
						? `OK. Processed ${table_results.length} table(s)`
						: `Partial success. ${errors.length} error(s)`,
					tables: table_results,
					errors: errors.length > 0 ? errors : undefined,
				};

				finish_process(process_id, final_result);

				const final_snapshot = get_progress(process_id);
				if (final_snapshot) {
					controller.enqueue(encode_sse_chunk(final_snapshot));
				}

			} catch (error: unknown) {
				// Unhandled error — send as final chunk
				const err_msg = error instanceof Error ? error.message : String(error);
				console.error('[diffuse_stream] Unhandled error:', error);

				const error_result: engine_response = {
					result: false,
					msg:    `Internal error: ${err_msg}`,
					errors: [err_msg],
				};

				if (process_id) {
					finish_process(process_id, error_result);
					const snapshot = get_progress(process_id);
					if (snapshot) {
						controller.enqueue(encode_sse_chunk(snapshot));
					}
				} else {
					const error_progress: progress_data = {
						process_id: '',
						is_running: false,
						started_at: start_time,
						data:       { msg: error_result.msg, counter: 0, total: 0 },
						total_time: '0 sec',
						errors:     [err_msg],
						result:     error_result,
					};
					controller.enqueue(encode_sse_chunk(error_progress));
				}
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type':           'text/event-stream',
			'Cache-Control':          'no-cache, must-revalidate',
			'Connection':             'keep-alive',
			'X-Accel-Buffering':      'no',
			'Access-Control-Allow-Origin': '*',
		},
	});
}



/**
 * HANDLE_GET_PROCESS_STATUS
 * Polling SSE endpoint for reconnection.
 * Reads progress from the store at update_rate interval
 * and streams it to the client until the process is done.
 */
function handle_get_process_status(body: { process_id?: string; update_rate?: number }): Response {

	const process_id = body.process_id;
	const update_rate = body.update_rate ?? 1000;

	if (!process_id) {
		const error_data: progress_data = {
			process_id: '',
			is_running: false,
			started_at: Date.now(),
			data:       { msg: 'Error: process_id is required', counter: 0, total: 0 },
			total_time: '0 sec',
			errors:     ['process_id is required'],
		};
		const json = JSON.stringify(error_data);
		return new Response(`data:\n${json}\n\n`, {
			headers: { 'Content-Type': 'text/event-stream' },
		});
	}

	const stream = new ReadableStream({
		start(controller) {

			const poll = () => {

				const snapshot = get_progress(process_id);

				if (!snapshot) {
					// Process not found (already purged or never existed)
					const not_found: progress_data = {
						process_id,
						is_running: false,
						started_at: Date.now(),
						data:       { msg: 'Process not found', counter: 0, total: 0 },
						total_time: '0 sec',
						errors:     ['Process not found or already completed'],
					};
					controller.enqueue(encode_sse_chunk(not_found));
					controller.close();
					return;
				}

				// Send current state
				controller.enqueue(encode_sse_chunk(snapshot));

				if (!snapshot.is_running) {
					// Done — cleanup and close
					delete_process(process_id);
					controller.close();
					return;
				}

				// Schedule next poll
				setTimeout(poll, update_rate);
			};

			// Start polling
			poll();
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type':           'text/event-stream',
			'Cache-Control':          'no-cache, must-revalidate',
			'Connection':             'keep-alive',
			'X-Accel-Buffering':      'no',
			'Access-Control-Allow-Origin': '*',
		},
	});
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
					return handle_diffuse_stream(body, cookie_header);
				}
				case 'get_process_status': {
					return handle_get_process_status(body as any);
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
