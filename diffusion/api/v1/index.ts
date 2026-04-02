/**
 * DIFFUSION ENGINE API
 * Bun-based middleware that bridges client RQO requests
 * to the PHP diffusion_api and writes parsed data to MariaDB.
 *
 * Architecture:
 *   Client → Bun (unix socket via Apache ProxyPass)
 *     → PHP diffusion_api (agnostic data + parser config)
 *     → Bun parses data (parser_text, parser_date, parser_helper)
 *     → MariaDB (INSERT/UPDATE)
 *     → Client response (NDJSON stream with per-record progress)
 */

import { call_dd_diffusion_api }      from './lib/php_client';
import { check_bun_health, enrich_diffusion_info_with_readiness } from './lib/status';
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
	subscribe_to_process,
	unsubscribe_from_process,
	get_all_processes,
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
	let payload = `data:\n${json}`;

	// Fix Apache reverse-proxy buffering dropping early short chunks
	// by filling out the payload with harmless JSON trailing spaces 
	// up to the common 16384 HTTP/1.1 flush boundary (Nginx/Apache).
	if (payload.length < 16384) {
		payload += ' '.repeat(16384 - payload.length);
	}

	payload += '\n\n';
	return encoder.encode(payload);
}



// =====================================================
// ROUTE HANDLERS
// =====================================================

/**
 * RUN_BACKGROUND_DIFFUSION
 * Executes the diffusion process independently of the client connection.
 * Updates progress_store which the client can poll.
 * 
 * Main diffusion endpoint — returns a streaming response.
 * Receives client RQO → splits into chunks → calls PHP API per chunk
 * → parses → inserts into MariaDB → streams per-record progress.
 *
 * When options.total is provided and exceeds chunk_size, the SQO is
 * paginated with limit/offset so PHP can release memory between batches.
 */
async function run_background_diffusion(
	process_id: string,
	request_rqo: rqo,
	cookie_header: string | null,
	start_time: number,
	estimated_total: number
): Promise<void> {

	try {
		// 1. DETERMINE CHUNKING STRATEGY
		// To process massive diffusions safely without hitting PHP memory limits,
		// we paginated the query (SQO) with limit/offset batches.
		const DEFAULT_CHUNK_SIZE = 100;
		const options     = request_rqo.options ?? {};
		const total       = (options as any).total       ?? 0;
		const chunk_size  = (options as any).chunk_size   ?? DEFAULT_CHUNK_SIZE;
		const use_chunks  = total > 0 && total > chunk_size;
		const chunk_count = use_chunks ? Math.ceil(total / chunk_size) : 1;

		const table_results_map = new Map<string, number>();
		const errors: string[] = [];
		let global_counter = 0;

		// 2. MAIN CHUNK LOOP
		for (let chunk_idx = 0; chunk_idx < chunk_count; chunk_idx++) {
			const chunk_offset = chunk_idx * chunk_size;

			// Inject limit/offset pagination into the SQO criteria
			const chunk_rqo: rqo = use_chunks
				? {
					...request_rqo,
					sqo: {
						...(request_rqo.sqo ?? {}),
						limit:  chunk_size,
						offset: chunk_offset,
					},
				}
				: request_rqo;

			update_progress(process_id, {
				counter: global_counter,
				msg:     use_chunks
					? `Fetching chunk ${chunk_idx + 1} of ${chunk_count} from PHP...`
					: 'Fetching data from PHP...',
				total_ms: Date.now() - start_time,
			});

			// 3. CALL PHP API (BRIDGING BACKEND)
			// Forwards the paginated request to PHP. PHP builds the runtime ontology
			// objects, resolves components, and returns agnostic, unparsed record trees.
			const php_response = await call_dd_diffusion_api(chunk_rqo, cookie_header ?? undefined);

			if (!php_response.result) {
				const err_msg = `PHP API error (chunk ${chunk_idx + 1}): ${php_response.msg}`;
				errors.push(err_msg);
				console.error(`[diffuse] ${err_msg}`);

				update_progress(process_id, {
					counter: global_counter,
					msg:     err_msg,
					error:   err_msg,
					total_ms: Date.now() - start_time,
				});
				
				// Keep going to the next chunk; don't let one bad batch crash a large process
				continue;
			}

			// 4. PROCESS/PARSE RESPONSE
			// Apply client-side and structural parsers (date converters, array unfolds,
			// token replacement) to turn the agnostic tree into structured lists
			// ready for target DB insertion.
			const tables = process_response(php_response);

			if (tables.length === 0) continue;

			// Track actual main records resolved for correct visual progress percentage
			const main_chunk_count = (php_response.datum && php_response.datum.length > 0)
				? php_response.datum[0].data.length
				: 0;
			
			global_counter += main_chunk_count;

			if (global_counter > estimated_total) {
				update_progress(process_id, {
					counter: global_counter,
					msg:     'Processing records',
				});
			}

			// 5. TARGET DATABASE INSERTION
			for (const table of tables) {
				const record_start = Date.now();

				try {
					// Insert/Update target Mariadb table
					const affected = await insert_table_data(table);
					
					const prev = table_results_map.get(table.table_name) ?? 0;
					table_results_map.set(table.table_name, prev + affected);

					const elapsed     = Date.now() - start_time;
					const record_time = Date.now() - record_start;

					// Fire instant notification callbacks via progress_store push update
					update_progress(process_id, {
						counter:       global_counter,
						msg:           'Processing records',
						section_label: table.table_name,
						time_ms:       record_time,
						total_ms:      elapsed,
					});

				} catch (error: unknown) {
					// Safeguard: Wrap single inserted tables in full try-catch wrapper.
					// If a row or index fails to map into target table, log it and
					// continue next iteration. Keeps full diffusion fully fault-tolerant.
					const err_msg = error instanceof Error ? error.message : String(error);
					console.error(`[diffuse] Error inserting into "${table.table_name}":`, error);

					errors.push(`Table "${table.table_name}": ${err_msg}`);

					const prev = table_results_map.get(table.table_name) ?? 0;
					table_results_map.set(table.table_name, prev); 

					update_progress(process_id, {
						counter: global_counter,
						msg:     'Processing records',
						error:   `Table "${table.table_name}": ${err_msg}`,
					});
				}
			}
		} 

		// Gather summaries
		const table_results = Array.from(table_results_map.entries()).map(
			([table_name, records_affected]) => ({ table_name, records_affected })
		);

		const final_result: engine_response = {
			result: errors.length === 0,
			msg:    errors.length === 0
				? `OK. Processed ${table_results.length} table(s), ${global_counter} record(s)` +
				  (use_chunks ? ` in ${chunk_count} chunk(s)` : '')
				: `Partial success. ${errors.length} error(s)`,
			tables: table_results,
			errors: errors.length > 0 ? errors : undefined,
		};

		// Marks state.is_running to false, enabling the polling streams to auto-close
		finish_process(process_id, final_result);

	} catch (error: unknown) {
		const err_msg = error instanceof Error ? error.message : String(error);
		console.error('[diffuse_stream] Unhandled error:', error);

		const error_result: engine_response = {
			result: false,
			msg:    `Internal error: ${err_msg}`,
			errors: [err_msg],
		};

		finish_process(process_id, error_result);
	}
}



/**
 * HANDLE_DIFFUSE_STREAM
 * Main diffusion endpoint — returns a streaming response.
 * Starts background processing and streams polled progress in real-time.
 */
function handle_diffuse_stream(request_rqo: rqo, cookie_header: string | null): Response {

	const start_time = Date.now();
	const options     = request_rqo.options ?? {};
	const total       = (options as any).total       ?? 0;
	const estimated_total = total > 0 ? total : 0;
	
	const process_id = options.process_id || crypto.randomUUID();
	create_process(estimated_total, process_id);

	// 1. Kick off the background process independently
	run_background_diffusion(process_id, request_rqo, cookie_header, start_time, estimated_total)
		.catch(console.error);

	// 2. Stream progress updates back to the client via push-notify
	const stream = new ReadableStream({
		start(controller) {

			// Heartbeat to prevent ERR_INCOMPLETE_CHUNKED_ENCODING timeouts in proxies
			const heartbeat = setInterval(() => {
				const current_state = get_progress(process_id);
				if (current_state) {
					try { controller.enqueue(encode_sse_chunk(current_state)); } catch { /* ignore */ }
				}
			}, 2000); // 2s ping (reduced from 5s/15s to beat 10s default idleTimeout and keep proxies warm)

			const on_update = (snapshot: progress_data) => {
				try {
					controller.enqueue(encode_sse_chunk(snapshot));
				} catch { 
					/* stream closed by client */ 
					clearInterval(heartbeat);
					unsubscribe_from_process(process_id, on_update);
					return;
				}

				if (!snapshot.is_running) {
					clearInterval(heartbeat);
					unsubscribe_from_process(process_id, on_update);
					try { controller.close(); } catch { /* already closed */ }
				}
			};

			subscribe_to_process(process_id, on_update);

			// Send initial state immediately
			const initial = get_progress(process_id);
			if (initial) controller.enqueue(encode_sse_chunk(initial));
		},
		cancel() {
			// In case the stream is cancelled natively by the client
			unsubscribe_from_process(process_id, () => {}); // Fallback: won't remove specific cb easily this way but covered above
		}
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

			// Heartbeat to prevent proxy disconnects
			const heartbeat = setInterval(() => {
				try { controller.enqueue(encoder.encode(':\n')); } catch { /* ignore */ }
			}, 15000);

			const poll = () => {

				const snapshot = get_progress(process_id);

				if (!snapshot) {
					// Process not found
					const not_found: progress_data = {
						process_id,
						is_running: false,
						started_at: Date.now(),
						data:       { msg: 'Process not found', counter: 0, total: 0 },
						total_time: '0 sec',
						errors:     ['Process not found or already completed'],
					};
					clearInterval(heartbeat);
					controller.enqueue(encode_sse_chunk(not_found));
					controller.close();
					return;
				}

				// Send current state
				controller.enqueue(encode_sse_chunk(snapshot));

				if (!snapshot.is_running) {
					clearInterval(heartbeat);
					controller.close();
					return;
				}

				// Schedule next poll
				setTimeout(poll, update_rate);
			};

			// Start polling
			poll();
		},
		cancel() {
			// cleanup if client aborts early
		}
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
 * HANDLE_GET_DIFFUSION_INFO
 * Fetches diffusion info from PHP and injects per-node readiness status.
 * Bun analyzes each diffusion_element type from the PHP result and adds
 * connection_status to every section_diffusion_node before returning.
 */
async function handle_get_diffusion_info(request_rqo: rqo, cookie_header: string | null): Promise<object> {

	const php_response = await call_dd_diffusion_api(
		{ ...request_rqo, action: 'get_diffusion_info' },
		cookie_header ?? undefined
	);

	if (!php_response.result || typeof php_response.result !== 'object') {
		return php_response;
	}

	// Enrich each section_diffusion_node with Bun-side readiness checks
	php_response.result = await enrich_diffusion_info_with_readiness(
		php_response.result,
		cookie_header ?? undefined
	);

	return php_response;
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
	unix:        SOCKET_PATH,
	idleTimeout: 120, // 2 minutes (matches PHP_CLIENT timeout)
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
					const diffusion_type = (body.options as any)?.type ?? 'sql';

					switch (diffusion_type) {
						case 'rdf':
						case 'xml': {
							// Synchronous file generation — call PHP synchronously then emit a
							// terminal SSE event so the client's read_stream / render_process_report
							// can receive last_update_record_response and diffusion_data correctly.
							const start_ms   = Date.now();
							const php_result = await call_dd_diffusion_api(body, cookie_header ?? undefined);

							// Extract file URLs from datum entries (each entry may have a file_url)
							const diffusion_data: { file_url: string }[] = [];
							for (const datum_group of (php_result as any).datum ?? []) {
								const diffusion_tipo = datum_group.diffusion_tipo;
								for (const record of datum_group.data ?? []) {
									for (const entry of (record.entries?.[diffusion_tipo] ?? [])) {
										if (entry.file_url) {
											diffusion_data.push({ file_url: entry.file_url });
										}
									}
								}
							}

							// Synthetic last_update_record_response that mirrors what
							// diffusion_rdf::update_record() returns per-record for SQL flows.
							const last_update_record_response = {
								result:         (php_result as any).result ?? false,
								msg:            [(php_result as any).msg ?? ''],
								errors:         (php_result as any).errors ?? [],
								class:          diffusion_type === 'rdf' ? 'diffusion_rdf' : 'diffusion_xml',
								diffusion_data,
							};

							const terminal_event: progress_data = {
								process_id: (body.options as any)?.process_id ?? crypto.randomUUID(),
								is_running: false,
								started_at: start_ms,
								total_time: `${Date.now() - start_ms} ms`,
								errors:     (php_result as any).errors ?? [],
								data: {
									msg:                        (php_result as any).msg ?? 'Done',
									counter:                    1,
									total:                      1,
									last_update_record_response,
									diffusion_data,
								} as any,
							};

							// Build SSE string directly (avoid Uint8Array BodyInit mismatch)
							const json = JSON.stringify(terminal_event);
							let sse_payload = `data:\n${json}`;
							if (sse_payload.length < 16384) {
								sse_payload += ' '.repeat(16384 - sse_payload.length);
							}
							sse_payload += '\n\n';

							return new Response(sse_payload, {
								headers: {
									'Content-Type':  'text/event-stream',
									'Cache-Control': 'no-cache',
								},
							});
						}

						case 'socrata': {
							// TODO: Implement Socrata-specific handling
							// For now, fall through to streaming SQL behavior
							console.warn(`[diffuse] Socrata type not yet fully implemented, using streaming fallback`);
							return handle_diffuse_stream(body, cookie_header);
						}

						case 'sql':
						default: {
							// Streaming SSE for progress tracking with database insertion
							return handle_diffuse_stream(body, cookie_header);
						}
					}
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
				case 'list_processes': {
					const logs = get_all_processes();
					return Response.json({ result: true, processes: logs });
				}
				case 'get_diffusion_status': {
					const health = await check_bun_health(cookie_header ?? undefined);
					return Response.json({ result: health.result, msg: health.msg, data: health });
				}
				case 'get_diffusion_info': {
					const result = await handle_get_diffusion_info(body, cookie_header);
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
} as any);

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
