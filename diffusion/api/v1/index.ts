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

import { call_dd_diffusion_api, check_auth } from './lib/php_client';
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
import { merge_rdf_parts, create_zip } from './lib/rdf_file_utils';
import { writeFileSync }              from 'fs';
import path                           from 'path';
import type {
	rqo,
	engine_response,
	progress_data,
}                                     from './lib/types';



const SOCKET_PATH      = process.env.SOCKET_PATH       || '/tmp/diffusion.sock';

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
 * RUN_BACKGROUND_RDF_DIFFUSION
 * Executes RDF/XML file diffusion in the background, independently of the
 * client connection, mirroring run_background_diffusion for SQL.
 *
 * Per-chunk behaviour:
 *   1. Inject limit/offset into SQO (Bun controls pagination, same as SQL).
 *   2. Call PHP — PHP runs search + diffuse_rdf, saves per-record .rdf files.
 *   3. Extract raw XML parts and individual file URLs from the PHP response.
 *   4. Push progress update to the store (counter, timing, errors).
 *
 * Post-processing (after all chunks):
 *   5. Merge all raw XML parts → single consolidated .rdf file.
 *   6. ZIP all individual .rdf files + merged file → single .zip.
 *   7. Write both to DEDALO_MEDIA_PATH (served by Apache like any media file).
 *   8. Call finish_process() with URLs so the final SSE carries download links.
 */
async function run_background_rdf_diffusion(
	process_id:     string,
	request_rqo:    rqo,
	cookie_header:  string | null,
	start_time:     number,
	estimated_total: number,
	diffusion_type: 'rdf' | 'xml'
): Promise<void> {

	try {
		// 1. CHUNKING STRATEGY (identical to SQL path)
		const DEFAULT_CHUNK_SIZE = 100;
		const options    = request_rqo.options ?? {};
		const total      = (options as any).total      ?? 0;
		const chunk_size = (options as any).chunk_size ?? DEFAULT_CHUNK_SIZE;
		const use_chunks = total > 0 && total > chunk_size;
		const chunk_count = use_chunks ? Math.ceil(total / chunk_size) : 1;

		const errors:        string[] = [];
		const raw_xml_parts: string[] = [];
		const all_file_urls: string[] = [];
		const all_file_entries: { file_url: string }[] = [];
		let   global_counter = 0;

		// Media paths are read from PHP diffuse_rdf response (set from first chunk)
		let DEDALO_MEDIA_PATH = '../../../../media/';
		let DEDALO_MEDIA_URL  = '/dedalo/media/';
		let sub_path          = '';

		// 2. MAIN CHUNK LOOP
		for (let chunk_idx = 0; chunk_idx < chunk_count; chunk_idx++) {
			const chunk_offset = chunk_idx * chunk_size;

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
					? `Processing chunk ${chunk_idx + 1} of ${chunk_count}...`
					: 'Generating RDF files...',
				total_ms: Date.now() - start_time,
			});

			// 3. CALL PHP
			const php_response = await call_dd_diffusion_api(chunk_rqo, cookie_header ?? undefined);

			if (!php_response.result) {
				const err_msg = `PHP API error (chunk ${chunk_idx + 1}): ${php_response.msg}`;
				errors.push(err_msg);
				console.error(`[rdf_diffuse] ${err_msg}`);
				update_progress(process_id, {
					counter:  global_counter,
					msg:      err_msg,
					error:    err_msg,
					total_ms: Date.now() - start_time,
				});
				continue;
			}

			// Extract media paths from PHP response (first chunk sets the paths)
			if (chunk_idx === 0) {
				const resp = php_response as any;
				if (resp.DEDALO_MEDIA_PATH) {
					DEDALO_MEDIA_PATH = resp.DEDALO_MEDIA_PATH;
					console.log(`[rdf_diffuse] Using DEDALO_MEDIA_PATH from PHP: ${DEDALO_MEDIA_PATH}`);
				}
				if (resp.DEDALO_MEDIA_URL) {
					DEDALO_MEDIA_URL = resp.DEDALO_MEDIA_URL;
					console.log(`[rdf_diffuse] Using DEDALO_MEDIA_URL from PHP: ${DEDALO_MEDIA_URL}`);
				}
				if (resp.sub_path) {
					sub_path = resp.sub_path;
					console.log(`[rdf_diffuse] Using sub_path from PHP: ${sub_path}`);
				}
			}

			// 4. EXTRACT per-record file URLs and raw XML from PHP datum
			const chunk_start = Date.now();
			const datum_groups = (php_response as any).datum ?? [];

			for (const datum_group of datum_groups) {
				const diffusion_tipo = datum_group.diffusion_tipo;
				const records        = datum_group.data ?? [];

				for (const record of records) {
					const entries = record.entries?.[diffusion_tipo] ?? [];
					for (const entry of entries) {
						if (entry.file_url) {
							all_file_entries.push({ file_url: entry.file_url });
							// Derive filesystem path from URL
							const media_url_with_subpath = DEDALO_MEDIA_URL + sub_path;
							const rel  = entry.file_url.startsWith(media_url_with_subpath)
								? entry.file_url.slice(media_url_with_subpath.length)
								: path.basename(entry.file_url);
							all_file_urls.push(path.join(DEDALO_MEDIA_PATH + sub_path, rel));
						}
						if (entry.value && typeof entry.value === 'string') {
							raw_xml_parts.push(entry.value);
						}
					}
					global_counter++;
				}
			}

			update_progress(process_id, {
				counter:  global_counter,
				msg:      'Generating RDF files',
				time_ms:  Date.now() - chunk_start,
				total_ms: Date.now() - start_time,
			});
		}

		// 5. POST-PROCESSING: merge + zip
		update_progress(process_id, {
			counter:  global_counter,
			msg:      'Building consolidated file and archive...',
			total_ms: Date.now() - start_time,
		});

		const date_tag    = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
		const type_label  = diffusion_type === 'xml' ? 'xml' : 'rdf';
		const merged_name = `diffusion_${type_label}_merged_${date_tag}.rdf`;
		const zip_name    = `diffusion_${type_label}_${date_tag}.zip`;
		const merged_path = path.join(DEDALO_MEDIA_PATH + sub_path, merged_name);
		const zip_path    = path.join(DEDALO_MEDIA_PATH + sub_path, zip_name);
		const merged_url  = DEDALO_MEDIA_URL + sub_path + merged_name;
		const zip_url     = DEDALO_MEDIA_URL + sub_path + zip_name;

		let consolidated_files: { merged_url: string; zip_url: string } | undefined;

		try {
			// Merge all raw XML parts into one RDF document
			const merged_content = merge_rdf_parts(raw_xml_parts);
			if (merged_content) {
				writeFileSync(merged_path, merged_content, 'utf8');
				// Include the merged file itself in the zip
				const zip_sources = [...all_file_urls, merged_path];
				await create_zip(zip_sources, zip_path);
				consolidated_files = { merged_url, zip_url };
			}
		} catch (file_err) {
			const err_msg = file_err instanceof Error ? file_err.message : String(file_err);
			console.error('[rdf_diffuse] Post-processing error:', file_err);
			errors.push(`Post-processing: ${err_msg}`);
		}

		// 6. FINISH
		const diffusion_class = diffusion_type === 'xml' ? 'diffusion_xml' : 'diffusion_rdf';
		const final_result: engine_response = Object.assign(
			{
				result:         errors.length === 0,
				msg:            errors.length === 0
					? `OK. RDF diffusion done. ${global_counter} record(s) processed`
						+ (use_chunks ? ` in ${chunk_count} chunk(s)` : '')
					: `Partial success. ${errors.length} error(s)`,
				errors:         errors.length > 0 ? errors : undefined,
				diffusion_data: all_file_entries,
			},
			consolidated_files ? { consolidated_files } : {},
			{ diffusion_class }
		);

		finish_process(process_id, final_result);

	} catch (error: unknown) {
		const err_msg = error instanceof Error ? error.message : String(error);
		console.error('[rdf_diffuse] Unhandled error:', error);
		finish_process(process_id, {
			result: false,
			msg:    `Internal error: ${err_msg}`,
			errors: [err_msg],
		});
	}
}



/**
 * HANDLE_DIFFUSE_RDF_STREAM
 * SSE streaming entry point for RDF/XML diffusion.
 * Mirrors handle_diffuse_stream for the SQL path.
 */
function handle_diffuse_rdf_stream(
	request_rqo:    rqo,
	cookie_header:  string | null,
	diffusion_type: 'rdf' | 'xml'
): Response {

	const start_time      = Date.now();
	const options         = request_rqo.options ?? {};
	const total           = (options as any).total ?? 0;
	const estimated_total = total > 0 ? total : 0;
	const process_id      = (options as any).process_id || crypto.randomUUID();

	create_process(estimated_total, process_id);

	run_background_rdf_diffusion(
		process_id, request_rqo, cookie_header, start_time, estimated_total, diffusion_type
	).catch(console.error);

	const stream = new ReadableStream({
		start(controller) {

			const heartbeat = setInterval(() => {
				const current_state = get_progress(process_id);
				if (current_state) {
					try { controller.enqueue(encode_sse_chunk(current_state)); } catch { /* ignore */ }
				}
			}, 2000);

			const on_update = (snapshot: progress_data) => {
				try {
					controller.enqueue(encode_sse_chunk(snapshot));
				} catch {
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

			const initial = get_progress(process_id);
			if (initial) controller.enqueue(encode_sse_chunk(initial));
		},
		cancel() {
			unsubscribe_from_process(process_id, () => {});
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
							// Background SSE — same pattern as SQL diffusion.
							// run_background_rdf_diffusion paginates PHP calls, streams
							// per-chunk progress, then merges all files and creates a ZIP.
							return handle_diffuse_rdf_stream(
								body,
								cookie_header,
								diffusion_type as 'rdf' | 'xml'
							);
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
					const is_auth = await check_auth(cookie_header);
					if (!is_auth) {
						return Response.json(
							{ result: false, msg: 'Authentication required', errors: ['not_logged'] },
							{ status: 401 }
						);
					}
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
					const is_auth_list = await check_auth(cookie_header);
					if (!is_auth_list) {
						return Response.json(
							{ result: false, msg: 'Authentication required', errors: ['not_logged'] },
							{ status: 401 }
						);
					}
					const logs = get_all_processes();
					return Response.json({ result: true, processes: logs });
				}
				case 'get_diffusion_status': {
					const is_auth_status = await check_auth(cookie_header);
					if (!is_auth_status) {
						return Response.json(
							{ result: false, msg: 'Authentication required', errors: ['not_logged'] },
							{ status: 401 }
						);
					}
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
