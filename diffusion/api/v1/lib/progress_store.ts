/**
 * PROGRESS_STORE
 * In-memory store for tracking active diffusion processes.
 * Used by handle_diffuse_stream (writes) and handle_get_process_status (reads).
 *
 * Entries auto-purge after MAX_AGE_MS (24 hours) to prevent memory leaks
 * from abandoned processes.
 */

import type { progress_data, engine_response } from './types';



// =====================================================
// STORE
// =====================================================

const store = new Map<string, progress_data>();

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours



/**
 * CREATE_PROCESS
 * Creates a new progress entry.
 * @param total - Total number of records to process
 * @returns process_id (UUID)
 */
export function create_process(total: number): string {

	const process_id = crypto.randomUUID();

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
 * DELETE_PROCESS
 * Removes a process entry from the store.
 * Called after the polling SSE stream finishes.
 * @param process_id - The process ID
 */
export function delete_process(process_id: string): void {
	store.delete(process_id);
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
