/**
 * PROGRESS_STORE
 * In-memory store for tracking active diffusion processes.
 * Used by run_background_diffusion (writes) and handle_diffuse_stream (reads).
 *
 * Supports a push-notify pattern: callers can subscribe to a process and
 * receive immediate callbacks on every state change, avoiding polling lag.
 * Entries auto-purge after MAX_AGE_MS (24 hours) to prevent memory leaks.
 */

import type { progress_data, engine_response } from './types';



// =====================================================
// STORE
// =====================================================

const store = new Map<string, progress_data>();

// Listeners for push-notify: process_id → Set of callbacks
const listeners = new Map<string, Set<(snapshot: progress_data) => void>>();

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours



/**
 * CREATE_PROCESS
 * Creates a new progress entry.
 * @param total - Total number of records to process
 * @returns process_id (UUID)
 */
export function create_process(total: number, process_id: string): string {

	const entry: progress_data = {
		process_id,
		is_running:  true,
		started_at:  Date.now(),
		data: {
			msg:     'Starting diffusion...',
			counter: 0,
			total,
		},
		total_time: '0 sec',
		errors:     [],
	};

	store.set(process_id, entry);

	return process_id;
}



/**
 * UPDATE_PROGRESS
 * Updates the progress of an active process.
 * @param process_id - The process ID
 * @param update     - Partial update to apply
 */
export function update_progress(
	process_id: string,
	update: {
		counter:        number;
		msg?:           string;
		section_label?: string;
		section_id?:    string | number;
		time_ms?:       number;
		total_ms?:      number;
		error?:         string;
	}
): void {

	const entry = store.get(process_id);
	if (!entry) return;

	entry.data.counter = update.counter;

	if (update.msg) {
		entry.data.msg = update.msg;
	}
	if (update.section_label !== undefined) {
		entry.data.section_label = update.section_label;
	}
	if (update.section_id !== undefined || update.time_ms !== undefined) {
		entry.data.current = {
			section_id: update.section_id,
			time:       update.time_ms,
		};
	}
	if (update.total_ms !== undefined) {
		entry.data.total_ms = update.total_ms;
	}
	if (update.error) {
		entry.errors.push(update.error);
	}

	// Update elapsed time
	entry.total_time = format_elapsed(Date.now() - entry.started_at);

	notify_listeners(process_id, entry);
}



/**
 * FINISH_PROCESS
 * Marks a process as complete with the final result.
 * @param process_id - The process ID
 * @param result     - Final engine_response
 */
export function finish_process(process_id: string, result: engine_response): void {

	const entry = store.get(process_id);
	if (!entry) return;

	entry.is_running = false;
	entry.result     = result;
	entry.total_time = format_elapsed(Date.now() - entry.started_at);
	entry.data.msg   = result.msg;

	// Propagate RDF/XML file data into data so client reads it from last_sse_response.data
	if (result.diffusion_data) {
		entry.data.diffusion_data = result.diffusion_data;

		const diffusion_class = (result as any).diffusion_class ?? 'diffusion_rdf';
		entry.data.last_update_record_response = {
			result:         result.result,
			msg:            [result.msg],
			errors:         result.errors ?? [],
			class:          diffusion_class,
			diffusion_data: result.diffusion_data,
		};
	}

	if (result.consolidated_files) {
		entry.data.consolidated_files = result.consolidated_files;
	}

	notify_listeners(process_id, entry);
}



/**
 * GET_PROGRESS
 * Returns a snapshot of the current progress for polling.
 * @param process_id - The process ID
 * @returns progress_data snapshot or null if not found
 */
export function get_progress(process_id: string): progress_data | null {

	const entry = store.get(process_id);
	if (!entry) return null;

	return { ...entry, data: { ...entry.data } };
}



/**
 * GET_ALL_PROCESSES
 * Returns all currently tracked processes in the store.
 * Useful for building active process lists.
 */
export function get_all_processes(): progress_data[] {
	return Array.from(store.values()).map(entry => ({ ...entry, data: { ...entry.data } }));
}



/**
 * DELETE_PROCESS
 * Removes a process entry and all its listeners from the store.
 * @param process_id - The process ID
 */
export function delete_process(process_id: string): void {
	store.delete(process_id);
	listeners.delete(process_id);
}



/**
 * SUBSCRIBE_TO_PROCESS
 * Register a callback fired immediately on every state change.
 * The callback receives a shallow snapshot of progress_data.
 * @param process_id - The process ID to subscribe to
 * @param cb         - Callback invoked on every update
 */
export function subscribe_to_process(
	process_id: string,
	cb: (snapshot: progress_data) => void
): void {
	if (!listeners.has(process_id)) {
		listeners.set(process_id, new Set());
	}
	listeners.get(process_id)!.add(cb);
}



/**
 * UNSUBSCRIBE_FROM_PROCESS
 * Remove a previously registered callback.
 * @param process_id - The process ID
 * @param cb         - The callback to remove
 */
export function unsubscribe_from_process(
	process_id: string,
	cb: (snapshot: progress_data) => void
): void {
	listeners.get(process_id)?.delete(cb);
}



/**
 * NOTIFY_LISTENERS
 * Fire all callbacks registered for process_id.
 */
function notify_listeners(process_id: string, entry: progress_data): void {
	const cbs = listeners.get(process_id);
	if (!cbs || cbs.size === 0) return;
	const snapshot: progress_data = { ...entry, data: { ...entry.data } };
	for (const cb of cbs) cb(snapshot);
}



/**
 * FORMAT_ELAPSED
 * Formats milliseconds into a human-readable elapsed time string.
 * @param ms - Elapsed milliseconds
 * @returns Formatted string (e.g. "3.2 sec", "2 min 15 sec", "1 h 5 min")
 */
function format_elapsed(ms: number): string {

	if (ms < 1000) {
		return `${ms} ms`;
	}

	const sec = Math.floor(ms / 1000);
	if (sec < 60) {
		return `${sec} sec`;
	}

	const min = Math.floor(sec / 60);
	const rem_sec = sec % 60;
	if (min < 60) {
		return rem_sec > 0 ? `${min} min ${rem_sec} sec` : `${min} min`;
	}

	const hours = Math.floor(min / 60);
	const rem_min = min % 60;
	return rem_min > 0 ? `${hours} h ${rem_min} min` : `${hours} h`;
}



// =====================================================
// AUTO-CLEANUP
// =====================================================

/**
 * Purge entries older than MAX_AGE_MS.
 * Runs every hour.
 */
function purge_old_entries(): void {

	const now = Date.now();

	for (const [id, entry] of store) {
		if (now - entry.started_at > MAX_AGE_MS) {
			store.delete(id);
			console.log(`[progress_store] Purged stale process: ${id}`);
		}
	}
}

setInterval(purge_old_entries, 60 * 60 * 1000); // every hour
