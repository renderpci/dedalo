/*global SHOW_DEVELOPER */
/*eslint no-undef: "error"*/

// data_manager is an ES module export, not a page global.
import {data_manager} from './data_manager.js'
// dd_console is an import as well — see job_tray.js.
import {dd_console} from './utils/index.js'

/**
* JOB_FOLLOW
* Follow ONE background job to its end, over the push wire.
*
* WHY THIS EXISTS. Every surface that showed a long job used to hand-roll its own
* setTimeout poll loop against get_job_status — tool_media_versions had one with
* a one-hour cap, and each new surface would have grown another. Polling is also
* the wrong instrument here: the job runs IN THE SERVER PROCESS, so a consumer
* can be woken by the state change itself (dd_utils_api::get_job_events pushes a
* frame on every transition and ENDS on the terminal one, whose `data` carries
* the job's return value).
*
* WHAT IT DELIBERATELY DOES NOT DO: unify the two job systems' wires. A media job
* streams JobStatusFrame here; a diffusion/publication job has its own SSE, pinned
* byte-for-byte against the old engine. The activity row names which stream it
* belongs to, and this module serves the media one only.
*
* The reader registers itself in page_globals.stream_readers (inside
* data_manager.read_stream), so navigating away aborts it — a followed job never
* outlives the page that was watching it.
*/

/**
* FOLLOW_JOB
* Subscribe to a media job's frames until it ends.
*
* @param {string} job_id
* @param {Object} handlers
* @param {Function} [handlers.on_frame] - called with each frame
*   {job_id, is_running, data, errors, total_time}
* @param {Function} [handlers.on_done] - called ONCE with the terminal frame, or
*   with null when the stream ended without one (a server that went away
*   mid-job). A caller must treat null as "not running any more", never as
*   "still working" — that conflation is what made a dead transcode blink
*   'Processing' until the operator reloaded.
* @returns {Function} cancel — stops following (does NOT stop the job itself;
*   use stop_process for that).
*/
export const follow_job = function(job_id, handlers) {

	const on_frame	= (handlers && handlers.on_frame) || function(){}
	const on_done	= (handlers && handlers.on_done) || function(){}

	let cancelled	= false
	let last_frame	= null
	let finished	= false

	// finish: exactly once, whatever path got us here (terminal frame, stream
	// close, or an error). A double call would re-render a cell twice and, worse,
	// could put a build button back while the job is still running.
	const finish = function(frame) {
		if (finished || cancelled) {
			return
		}
		finished = true
		on_done(frame || null)
	}

	data_manager.request_stream({
		body : {
			dd_api	: 'dd_utils_api',
			action	: 'get_job_events',
			options	: {
				job_id : job_id
			}
		}
	})
	.then(function(stream){

		if (!stream || cancelled) {
			// No stream at all is not "still working": say so, so the caller can
			// fall back to checking the disk and then give a readable reason.
			finish(null)
			return
		}

		data_manager.read_stream(
			stream,
			function(sse_response){
				if (cancelled) {
					return
				}
				if (SHOW_DEVELOPER===true) {
					dd_console('-> follow_job frame:', 'DEBUG', sse_response)
				}
				last_frame = sse_response
				on_frame(sse_response)
				// The server ends the stream on this frame; finishing here (rather
				// than only in on_done) means the caller reacts to the TERMINAL
				// frame, which is the one carrying the job's return value.
				if (sse_response && sse_response.is_running===false) {
					finish(sse_response)
				}
			},
			function(){
				// Stream closed. If a terminal frame already arrived this is a no-op;
				// otherwise the job's fate is unknown and the caller is told so.
				finish(last_frame && last_frame.is_running===false ? last_frame : null)
			}
		)
	})
	.catch(function(error){
		console.error(`follow_job failed for ${job_id}:`, error)
		finish(null)
	})

	return function cancel() {
		cancelled = true
	}
}//end follow_job



/**
* FORMAT_ELAPSED
* Human elapsed time from a wall-clock start, for a progress readout.
* Wall-clock (not the job's monotonic marks) is what survives a page reload —
* the whole reason JobRecord carries startedAtWall.
*
* @param {number|null} started_at - ms since epoch
* @returns {string} '' when unknown, else '4m 12s' / '45s'
*/
export const format_elapsed = function(started_at) {

	if (!started_at) {
		return ''
	}
	const seconds = Math.max(0, Math.round((Date.now() - started_at) / 1000))
	if (seconds < 60) {
		return `${seconds}s`
	}
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) {
		return `${minutes}m ${seconds % 60}s`
	}
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}//end format_elapsed
